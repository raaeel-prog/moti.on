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
const effectParameters = {'ADBE Slider Control': [1], 'ADBE Gaussian Blur 2': [1, 3], 'ADBE Turbulent Displace': [1, 2, 3, 5, 6], 'Mettle SkyBox Chromatic Aberrat': [4, 6, 10, 11], 'ADBE Tint': [1, 2, 3],
  'CHMS Motion Core': [1, 2, 3, 4, 5], 'ADBE Brightness & Contrast 2': [2], 'ADBE HUE SATURATION': [5], 'ADBE Wave Warp': [2, 3], 'ADBE Drop Shadow': [1, 2, 3, 4, 5], 'ADBE Venetian Blinds': [1, 2, 3, 4], 'CC Composite': [3]};

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
    // Every native effect carries Effect Opacity, which looks drive with Intensity.
    g.children.push(new Group('ADBE Effect Built In Params', g, {'ADBE Effect Mask Opacity': 100}));
    g.remove = () => this.children.splice(this.children.indexOf(g), 1); this.children.push(g); return g;
  };
  if (text) {
    // Masked reveals add a window mask; motion does not depend on its shape.
    globalThis.Shape ??= class {};
    const masks = new Group('ADBE Mask Parade', f.layer), property = f.layer.property.bind(f.layer);
    masks.addProperty = function () { const m = new Group('ADBE Mask Atom', this, {'ADBE Mask Shape': null}); m.remove = () => this.children.splice(this.children.indexOf(m), 1); this.children.push(m); return m; };
    f.layer.property = name => name === 'ADBE Mask Parade' ? masks : property(name);
    // The units the suite samples: 7 characters, 2 words, 2 lines. The host reads
    // the text as applied, so the sample must be that text.
    f.layer.sourceText = 'Edit' + String.fromCharCode(13) + 'mOn';
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
export async function parity(p, phase, extra = {}) {
  const f0 = await fixture(), args = f0.args(p.id, p.mode === 'transition' ? {phase, ...extra} : {});
  // Pivoted recipes compensate Position around a point; preset-momentum checks that point.
  const f = await hostFor(p, args), three = f.layer.threeDLayer, edge = p.pivot === 'edge' || p.pivot === 'offset', found = [];
  // Out-of-frame travel is measured: AE measures the composition, the card its own frame.
  const measured = p.travel === 'offscreen' ? f.layer.effects.children.find(e => e.name.endsWith('· Distância (px)')).property(1).value : 0;
  const travel = measured ? measured / preview.libraryPreviewTravel(p, args) : 1;
  let moved = 0;
  for (let frame = 0; frame <= Math.ceil(f.layer.outPoint * 30); frame++) {
    const time = frame / 30, host = hostSample(f, time), s = preview.librarySample(p, args, time);
    const pairs = [['sx', host.sx, s.sx], ['sy', host.sy, s.sy], ['rz', host.rz, s.rz], ['opacity', host.opacity, s.opacity]];
    if (!edge) pairs.push(['x', host.x, s.x * 6 * travel], ['y', host.y, s.y * 6 * travel]);
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

test('classic easing families move the preview and the layer identically', async () => {
  const kinds = contracts.MOTION_PENNER_FAMILIES.flatMap(family => contracts.MOTION_PENNER_SHAPES.map(shape => `${family}-${shape}`));
  assert.equal(kinds.length, 18);
  // One recipe that scales, turns and fades, and one that leaves the frame.
  const recipes = [layerPresets.find(p => p.mode === 'transition' && p.fade && p.scale[0] && p.rotation[2] && p.pivot === 'anchor' && !p.choreography), layerPresets.find(p => p.id === 'momentum-push')];
  const all = [];
  for (const p of recipes) for (const easing of kinds) for (const phase of ['in', 'out', 'both']) {
    const {found, moved} = await parity(p, phase, {easing});
    assert.ok(moved > 0, `${p.id} ${easing} must move`);
    if (found.length) all.push(`${easing} · ${found[0]}`);
  }
  assert.deepEqual(all, []);
});

// Text recipes: each unit's selector, as AE evaluates it, against the preview's
// sample for the same unit (characters 7, words and lines 2 in the fixture text).
const textPresets = contracts.MOTION_LIBRARY_PRESETS.filter(p => p.category.startsWith('text-'));
// Movement selectors return a quarter of the weight: their values are four times the recipe (TEXT_RANGE).
const RANGE = 4;
async function textParity(p, phase, extra = {}) {
  const args = (await fixture()).args(p.id, p.mode === 'transition' ? {phase, ...extra} : {}), f = await hostFor(p, args, true);
  const animators = f.layer.text.property('ADBE Text Animators').children;
  const selector = role => animators.filter(a => a.name.endsWith(` · ${role}`)).map(a => a.property('ADBE Text Selectors').property('Moti.on Timing').property('ADBE Text Expressible Amount'));
  const unit = args.unit === 'preset' ? p.text.unit : args.unit, count = unit === 'characters' ? 7 : unit === 'all' ? 1 : 2;
  const xy = contracts.libraryDirection(p.position[0], p.position[1], args.direction), found = [];
  const em = p.travel === 'offscreen' ? 1 : 100 / contracts.libraryTextReference(p.text.unit);
  // Turns and scale as seen from the chosen side, shared by host and preview.
  const o = contracts.libraryTextOrient(p, args.direction);
  const move = selector('Movimento'), scale = selector('Escala'), rotation = selector('Rotação'), opacity = selector('Opacidade');
  // "Both" stacks an entrance and an exit animator per role: their amounts add,
  // and stacked opacity animators multiply.
  const total = (list, time, i) => list.reduce((acc, sel) => { const v = sel.valueAtTime(time, false, i, count), a = Array.isArray(v) ? v : [v, v, v]; return acc.map((n, k) => n + a[k]); }, [0, 0, 0]);
  for (let frame = 0; frame <= Math.ceil(f.layer.outPoint * 30); frame += 2) for (let i = 0; i < count; i++) {
    const time = frame / 30, s = preview.librarySample(p, args, time, i, count, unit === 'characters' ? contracts.libraryTextLocate(String(f.layer.sourceText), i, 'characters').slice(2) : undefined), pairs = [];
    if (move.length && p.choreography) {
      const m = total(move, time, i);
      // The 20000 px vector carries pose x em (font size 100 here); back to recipe pixels.
      pairs.push(['x', m[0] * 200 / em, s.x * 6], ['y', m[1] * 200 / em, s.y * 6]);
      if (scale.length) pairs.push(['sx', 1 + o.scale[0] / 100 * total(scale, time, i)[0] * RANGE / 100, s.sx]);
      if (rotation.length) pairs.push(['rz', o.rotation[2] * total(rotation, time, i)[0] * RANGE / 100, s.rz]);
    } else if (move.length) {
      const m = total(move, time, i).map(v => v * RANGE);
      if (xy[0]) pairs.push(['x', xy[0] * m[0] / 100, s.x * 6]);
      if (xy[1]) pairs.push(['y', xy[1] * m[1] / 100, s.y * 6]);
      if (o.scale[0]) pairs.push(['sx', 1 + o.scale[0] / 100 * m[0] / 100, s.sx]);
      if (o.rotation[2]) pairs.push(['rz', o.rotation[2] * m[0] / 100, s.rz]);
    }
    if (opacity.length) pairs.push(['opacity', opacity.reduce((acc, sel) => { const o = sel.valueAtTime(time, false, i, count); return acc * (1 - (Array.isArray(o) ? o[0] : o) / 100); }, 1), s.opacity]);
    const bad = pairs.find(([, a, b]) => !(Math.abs(a - b) < 1e-4));
    if (bad) found.push(`${p.id} ${phase} ${JSON.stringify(extra)} unidade ${i} t=${time.toFixed(3)} ${bad[0]}: AE ${bad[1].toFixed(4)} / prévia ${bad[2].toFixed(4)}`);
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

// GAP-11: diagonals rotate the travel toward a corner, on layers and on text units.
const diagonals = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
test('diagonal directions move the preview and the layer identically', async () => {
  const recipes = layerPresets.filter(p => p.mode === 'transition' && contracts.libraryUsesDiagonals(p));
  assert.ok(recipes.length > 10);
  const all = [];
  for (const p of recipes) for (const direction of diagonals) {
    const {found, moved} = await parity(p, 'both', {direction});
    assert.ok(moved > 0, `${p.id} ${direction} must move`);
    if (found.length) all.push(`${direction} · ${found[0]}`);
  }
  assert.deepEqual(all, []);
});
test('diagonal directions move each text unit like After Effects', async () => {
  const recipes = textPresets.filter(p => p.mode === 'transition' && contracts.libraryUsesDiagonals(p));
  assert.ok(recipes.length > 10);
  const all = [];
  // Two opposite corners cover both signs of each axis; the layer test runs all four.
  for (const p of recipes) for (const direction of ['top-left', 'bottom-right']) { const found = await textParity(p, 'in', {direction}); if (found.length) all.push(`${found.length} · ${found[0]}`); }
  assert.deepEqual(all, []);
});

// GAP-10: "repeat" exits in the entrance order; "mirror" (the default) stays bit-identical.
const staggered = textPresets.filter(p => p.mode === 'transition' && p.text.unit !== 'all');
for (const phase of ['out', 'both']) test(`exit order "repeat" moves each text unit like After Effects (${phase})`, async () => {
  assert.ok(staggered.length > 20);
  const all = [];
  for (const p of staggered) { const found = await textParity(p, phase, {exitOrder: 'repeat'}); if (found.length) all.push(`${found.length} · ${found[0]}`); }
  assert.deepEqual(all, []);
});
test('exit order: mirror leaves last-in first, repeat leaves first-in first', async () => {
  const p = staggered.find(r => r.text.unit === 'characters' && (r.text.order ?? 'forward') === 'forward' && !r.text.random);
  const args = {...(await fixture()).args(p.id, {phase: 'both'}), staggerFrames: 4}, end = preview.libraryPreviewEnd(args), count = 7;
  // Exit progress of the first and the last unit halfway through the exit.
  const exit = (options, i) => preview.librarySample(p, options, end - options.durationFrames / 60, i, count).progress;
  assert.deepEqual(preview.librarySample(p, {...args, exitOrder: 'mirror'}, 1, 3, count), preview.librarySample(p, args, 1, 3, count));
  assert.ok(exit(args, 0) > exit(args, count - 1), 'mirror: the last unit to enter leaves first');
  const repeat = {...args, exitOrder: 'repeat'};
  assert.ok(exit(repeat, 0) < exit(repeat, count - 1), 'repeat: the first unit to enter leaves first');
});
