import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { fixture } from './preset-phases-harness.mjs';

// Parity: a layer preset's gallery preview must move exactly as the panel's own
// apply path (phase-apply for transitions, apply for loops) moves the layer in AE.
const load = async entry => { const out = await build({ entryPoints: [fileURLToPath(new URL(entry, import.meta.url))], bundle: true, format: 'esm', platform: 'node', write: false });
  return import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString('base64')}`); };
const preview = await load('../client/src/motion-library-preview.ts');
const contracts = await load('../../../packages/contracts/src/index.ts');
const layerPresets = contracts.MOTION_LIBRARY_PRESETS.filter(p => !p.category.startsWith('text-') && !p.cameraSpec && !p.id.startsWith('camera-'));
const effectParameters = {'ADBE Slider Control': [1], 'ADBE Gaussian Blur 2': [1, 3], 'ADBE Turbulent Displace': [2, 3, 6], 'Mettle SkyBox Chromatic Aberrat': [4, 6, 10, 11], 'ADBE Tint': [1, 2, 3],
  'CHMS Motion Core': [1, 2, 3, 4, 5], 'ADBE Brightness & Contrast 2': [2], 'ADBE HUE SATURATION': [5], 'ADBE Wave Warp': [2, 3], 'ADBE Drop Shadow': [1, 2, 3, 4, 5], 'ADBE Venetian Blinds': [1, 2, 3], 'CC Composite': [3]};

async function hostFor(p, args, text = false) {
  const f = await fixture({text});
  const {Group} = f, add = Group.prototype.addProperty;
  // Signature looks only add effects; motion is what this suite compares.
  f.scope.MotionSignatureEffects ??= {apply() {}};
  // Any installed effect is accepted: effect pixels are illustrative, motion is compared.
  Group.prototype.canAddProperty = () => true;
  Group.prototype.addProperty = function (name) {
    if (!Object.hasOwn(effectParameters, name) || name === 'ADBE Slider Control' || name === 'ADBE Gaussian Blur 2') return add.call(this, name);
    const g = new Group(name, this, Object.fromEntries(effectParameters[name].map(i => [`${name}-${String(i).padStart(4, '0')}`, 0])));
    if (name === 'ADBE HUE SATURATION') g.children.push(new Group('ADBE Effect Built In Params', g, {'ADBE Effect Mask Opacity': 0}));
    g.remove = () => this.children.splice(this.children.indexOf(g), 1); this.children.push(g); return g;
  };
  if (text) {
    // Masked reveals add a window mask; motion does not depend on its shape.
    globalThis.Shape ??= class {};
    const masks = new Group('ADBE Mask Parade', f.layer), property = f.layer.property.bind(f.layer);
    masks.addProperty = function () { const m = new Group('ADBE Mask Atom', this, {'ADBE Mask Shape': null}); m.remove = () => this.children.splice(this.children.indexOf(m), 1); this.children.push(m); return m; };
    f.layer.property = name => name === 'ADBE Mask Parade' ? masks : property(name);
  }
  f.layer.outPoint = preview.libraryPreviewEnd(args);
  f.run(p.mode === 'transition' ? 'phase-apply' : 'apply', args);
  return f;
}
function hostSample(f, time) {
  const t = f.layer.transform, read = name => t.property(name).valueAtTime(time), base = name => t.property(name).value;
  const pos = read('ADBE Position'), pos0 = base('ADBE Position'), scale = read('ADBE Scale');
  return {x: pos[0] - pos0[0], y: pos[1] - pos0[1], z: (pos[2] ?? 0) - (pos0[2] ?? 0), sx: scale[0] / 100, sy: scale[1] / 100,
    rx: read('ADBE Rotate X'), ry: read('ADBE Rotate Y'), rz: read('ADBE Rotate Z'), opacity: read('ADBE Opacity') / 100};
}
export async function parity(p, phase) {
  const f0 = await fixture(), args = f0.args(p.id, p.mode === 'transition' ? {phase} : {});
  const f = await hostFor(p, args), three = f.layer.threeDLayer, edge = p.pivot === 'edge', found = [];
  let moved = 0;
  for (let frame = 0; frame <= Math.ceil(f.layer.outPoint * 30); frame++) {
    const time = frame / 30, host = hostSample(f, time), s = preview.librarySample(p, args, time);
    const pairs = [['sx', host.sx, s.sx], ['sy', host.sy, s.sy], ['rz', host.rz, s.rz], ['opacity', host.opacity, s.opacity]];
    if (!edge) pairs.push(['x', host.x, s.x * 6], ['y', host.y, s.y * 6]);
    if (three) { pairs.push(['rx', host.rx, s.rx], ['ry', host.ry, s.ry]); if (!edge) pairs.push(['z', host.z, s.z * 6]); }
    if (pairs.some(([, a]) => Math.abs(a - (a === host.sx || a === host.sy || a === host.opacity ? 1 : 0)) > 1e-3)) moved++;
    const bad = pairs.find(([, a, b]) => !(Math.abs(a - b) < 1e-4));
    if (bad) found.push(`${p.id} ${phase} t=${time.toFixed(3)} ${bad[0]}: AE ${bad[1].toFixed(4)} / prévia ${bad[2].toFixed(4)}`);
  }
  return {found, moved};
}

for (const phase of ['in', 'out', 'both']) test(`layer previews move like the layer in After Effects (${phase})`, async () => {
  assert.ok(layerPresets.length > 20);
  const all = [];
  for (const p of layerPresets) {
    if (p.mode !== 'transition' && phase !== 'in') continue;
    const {found, moved} = await parity(p, phase);
    const transforms = p.position.some(Boolean) || p.rotation.some(Boolean) || p.scale.some(Boolean) || p.fade;
    if (transforms) assert.ok(moved > 0, `${p.id} must actually move in AE`);
    if (found.length) all.push(`${found.length} frames · ${found[0]}`);
  }
  assert.deepEqual(all, []);
});

// Text recipes: each unit's selector, as AE evaluates it, against the preview's
// sample for the same unit (characters 7, words and lines 2 in the fixture text).
const textPresets = contracts.MOTION_LIBRARY_PRESETS.filter(p => p.category.startsWith('text-'));
async function textParity(p, phase) {
  const args = (await fixture()).args(p.id, p.mode === 'transition' ? {phase} : {}), f = await hostFor(p, args, true);
  const animators = f.layer.text.property('ADBE Text Animators').children;
  const selector = role => animators.filter(a => a.name.endsWith(` · ${role}`)).map(a => a.property('ADBE Text Selectors').property('Moti.on Timing').property('ADBE Text Expressible Amount'));
  const unit = args.unit === 'preset' ? p.text.unit : args.unit, count = unit === 'characters' ? 7 : unit === 'all' ? 1 : 2;
  const xy = contracts.libraryDirection(p.position[0], p.position[1], args.direction), found = [];
  const move = selector('Movimento'), scale = selector('Escala'), rotation = selector('Rotação'), opacity = selector('Opacidade');
  // "Both" stacks an entrance and an exit animator per role: their amounts add,
  // and stacked opacity animators multiply.
  const total = (list, time, i) => list.reduce((acc, sel) => { const v = sel.valueAtTime(time, false, i, count), a = Array.isArray(v) ? v : [v, v, v]; return acc.map((n, k) => n + a[k]); }, [0, 0, 0]);
  for (let frame = 0; frame <= Math.ceil(f.layer.outPoint * 30); frame += 2) for (let i = 0; i < count; i++) {
    const time = frame / 30, s = preview.librarySample(p, args, time, i, count), pairs = [];
    if (move.length && p.choreography) {
      const m = total(move, time, i);
      pairs.push(['x', m[0] * 10.8, s.x * 6], ['y', m[1] * 10.8, s.y * 6]);
      if (scale.length) pairs.push(['sx', 1 + p.scale[0] / 100 * total(scale, time, i)[0] / 100, s.sx]);
      if (rotation.length) pairs.push(['rz', p.rotation[2] * total(rotation, time, i)[0] / 100, s.rz]);
    } else if (move.length) {
      const m = total(move, time, i);
      if (xy[0]) pairs.push(['x', xy[0] * m[0] / 100, s.x * 6]);
      if (xy[1]) pairs.push(['y', xy[1] * m[1] / 100, s.y * 6]);
      if (p.scale[0]) pairs.push(['sx', 1 + p.scale[0] / 100 * m[0] / 100, s.sx]);
      if (p.rotation[2]) pairs.push(['rz', p.rotation[2] * m[0] / 100, s.rz]);
    }
    if (opacity.length) pairs.push(['opacity', opacity.reduce((acc, sel) => { const o = sel.valueAtTime(time, false, i, count); return acc * (1 - (Array.isArray(o) ? o[0] : o) / 100); }, 1), s.opacity]);
    const bad = pairs.find(([, a, b]) => !(Math.abs(a - b) < 1e-4));
    if (bad) found.push(`${p.id} ${phase} unidade ${i} t=${time.toFixed(3)} ${bad[0]}: AE ${bad[1].toFixed(4)} / prévia ${bad[2].toFixed(4)}`);
  }
  return found;
}
for (const phase of ['in', 'out', 'both']) test(`text previews move each unit like After Effects (${phase})`, async () => {
  assert.ok(textPresets.length > 20);
  const all = [];
  for (const p of textPresets) {
    if (p.mode !== 'transition' && phase !== 'in') continue;
    const found = await textParity(p, phase);
    if (found.length) all.push(`${found.length} · ${found[0]}`);
  }
  assert.deepEqual(all, []);
});
