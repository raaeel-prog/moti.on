import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { loadHostModules } from './host-harness.mjs';

const compiled = await build({
  stdin: { contents: 'export * from "./motion-library.ts"; export * from "./motion-library-math.ts"; export * from "./motion-library-requirements.ts";', resolveDir: fileURLToPath(new URL('../../../packages/contracts/src', import.meta.url)) },
  bundle: true, format: 'esm', platform: 'node', write: false
});
const contracts = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
const signature = contracts.MOTION_LIBRARY_PRESETS.filter(p => p.collection === 'signature');
const errors = Object.fromEntries(['INVALID_PRESET', 'NO_ACTIVE_COMP', 'NO_SELECTION', 'INVALID_SELECTION_TYPE', 'CAPABILITY_UNAVAILABLE', 'EXPRESSION_CONFLICT', 'ROLLBACK_FAILED', 'KEYFRAME_CONFLICT'].map(key => [key, key]));
const read = name => readFile(new URL(`../host/src/${name}`, import.meta.url), 'utf8');
const sources = [await read('signature-effects.jsx'), await read('commands/preset-library.jsx'), await read('commands/preset-phases.jsx')];
/** Parameter match names read from AE 26.5x89; see docs/research/after-effects-signature-text-effects.md. */
const parameters = {
  'ADBE Slider Control': [1],
  'ADBE Turbulent Displace': [2, 3, 5, 6],
  'CC Burn Film': [1, 2, 3],
  'ADBE Glo2': [2, 3, 4, 7, 12, 13, 14],
  'CC Light Sweep': [1, 2, 3, 4, 5, 6, 7, 8, 9],
  'CC Light Rays': [1, 2, 3, 8],
  'ADBE Motion Blur': [1, 2],
  'ADBE Gaussian Blur 2': [1, 3],
  'ADBE Simple Choker': [1, 2],
  'CC Scatterize': [1, 2, 3, 4],
  'ADBE Exposure2': [3],
  'Mettle SkyBox Chromatic Aberrat': [4, 6, 10, 11]
};
/** Effect values that must be neutral once the text settles. */
const neutral = {
  'ADBE Turbulent Displace-0002': 0, 'CC Burn Film-0001': 0, 'ADBE Glo2-0004': 0, 'CC Light Sweep-0005': 0, 'CC Light Sweep-0006': 0,
  'CC Light Rays-0001': 0, 'ADBE Motion Blur-0002': 0, 'ADBE Gaussian Blur 2-0001': 0, 'ADBE Simple Choker-0002': 0,
  'CC Scatterize-0001': 0, 'CC Scatterize-0002': 0, 'CC Scatterize-0003': 0, 'ADBE Exposure2-0003': 0,
  'Mettle SkyBox Chromatic Aberrat-0004': 0, 'Mettle SkyBox Chromatic Aberrat-0006': 0, 'ADBE Effect Mask Opacity': 0
};

async function fixture({ fps = 30, height = 1080, missing = '' } = {}) {
  let nextId = 1, mutations = 0;
  class MarkerValue {
    constructor(comment) { this.comment = comment; this.params = {}; this.duration = 0; }
    getParameters() { return {...this.params}; }
    setParameters(params) { this.params = {...params}; }
  }
  const clone = value => Object.assign(new MarkerValue(value.comment), structuredClone(value));
  class Markers {
    constructor(parentProperty) { Object.assign(this, {name: 'ADBE Marker', matchName: 'ADBE Marker', parentProperty, keys: []}); }
    get numKeys() { return this.keys.length; }
    keyValue(index) { return clone(this.keys[index - 1].value); }
    keyTime(index) { return this.keys[index - 1].time; }
    setValueAtTime(time, value) { const prior = this.keys.findIndex(k => Math.abs(k.time - time) < 1e-6); if (prior >= 0) this.keys.splice(prior, 1); this.keys.push({time, value: clone(value)}); this.keys.sort((a, b) => a.time - b.time); mutations++; }
    removeKey(index) { this.keys.splice(index - 1, 1); mutations++; }
    expressionAPI() { return {numKeys: this.numKeys, key: index => ({time: this.keyTime(index), parameters: this.keyValue(index).getParameters()})}; }
  }
  class Property {
    constructor(name, value, parentProperty) { Object.assign(this, {name, matchName: name, value, parentProperty, canSetExpression: true, expression: '', expressionEnabled: false, expressionError: '', keys: []}); }
    get numKeys() { return this.keys.length; }
    setValue(value) { assert.equal(this.numKeys, 0, 'do not flatten keys'); this.value = value; mutations++; }
    valueAtTime(time, preExpression = false, unitIndex = 0, unitCount = 7) {
      if (!this.expression || !this.expressionEnabled || preExpression) return this.value;
      let layer = this.parentProperty;
      while (layer.parentProperty) layer = layer.parentProperty;
      return vm.runInNewContext(this.expression, {
        time, inPoint: layer.inPoint, outPoint: layer.outPoint, value: this.value, thisComp: comp,
        thisLayer: {marker: layer.markers.expressionAPI(), sourceRectAtTime: () => layer.sourceRectAtTime()},
        textIndex: unitIndex + 1, textTotal: unitCount, transform: {scale: [100, 100, 100]},
        effect: name => index => layer.effects.property(name).property(index).value
      });
    }
    setValuesAtTimes(times, values) { this.keys = times.map((time, i) => ({time, value: values[i]})); mutations++; }
    setInterpolationTypeAtKey() {}
    removeKey(index) { this.keys.splice(index - 1, 1); }
  }
  class Group {
    constructor(name, parentProperty, values = {}) {
      Object.assign(this, {name, matchName: name, parentProperty, children: []});
      for (const [key, value] of Object.entries(values)) this.children.push(new Property(key, value, this));
    }
    get numProperties() { return this.children.length; }
    property(key) { return typeof key === 'number' ? this.children[key - 1] : this.children.find(p => p.name === key || p.matchName === key); }
    canAddProperty(name) { return Object.hasOwn(parameters, name); }
    addProperty(name) {
      let p;
      if (this.matchName === 'ADBE Text Animator Properties') p = new Property(name, 0, this);
      else if (name === 'ADBE Text Animator') { p = new Group(name, this); p.children = ['ADBE Text Animator Properties', 'ADBE Text Selectors'].map(n => new Group(n, p)); }
      else if (name === 'ADBE Text Expressible Selector') p = new Group(name, this, {'ADBE Text Range Type2': 1, 'ADBE Text Expressible Amount': [100, 100, 100]});
      else if (Object.hasOwn(parameters, name)) {
        const values = Object.fromEntries(parameters[name].map(index => `${name}-${String(index).padStart(4, '0')}`).filter(mn => mn !== missing).map(mn => [mn, 0]));
        p = new Group(name, this, values);
        p.children.push(new Group('ADBE Effect Built In Params', p, {'ADBE Effect Mask Opacity': 100}));
      } else throw new Error(`Unexpected mock property ${name}`);
      p.remove = () => { this.children.splice(this.children.indexOf(p), 1); mutations++; };
      this.children.push(p); mutations++;
      return p;
    }
  }
  class Layer {
    constructor() {
      Object.assign(this, {id: nextId++, name: 'Title', comment: 'Keep this comment', inPoint: 0, outPoint: 4, hasVideo: true, nullLayer: false, threeDLayer: false, locked: false, selected: true});
      this.markers = new Markers(this);
      this.effects = new Group('ADBE Effect Parade', this);
      this.transform = new Group('ADBE Transform Group', this, {'ADBE Anchor Point': [0, 0, 0], 'ADBE Position': [960, 540, 0], 'ADBE Scale': [100, 100, 100], 'ADBE Rotate Z': 0, 'ADBE Opacity': 100});
      this.sourceText = 'Editable title\rSecond line';
      this.text = new Group('ADBE Text Properties', this); this.text.children.push(new Group('ADBE Text Animators', this.text));
      this.masks = new Group('ADBE Mask Parade', this);
      this.masks.addProperty = () => { const m = new Group('ADBE Mask Atom', this.masks, {'ADBE Mask Shape': null}); m.remove = () => { this.masks.children.splice(this.masks.children.indexOf(m), 1); }; this.masks.children.push(m); return m; };
    }
    get numProperties() { return 5; }
    property(name) { const all = [this.effects, this.transform, this.markers, this.text, this.masks]; return typeof name === 'number' ? all[name - 1] : all.find(p => p?.matchName === name); }
    sourceRectAtTime() { return {left: -300, top: -60, width: 600, height: 120}; }
  }
  class CompItem {
    constructor() { Object.assign(this, {id: 100, height, time: .2, frameDuration: 1 / fps, frameRate: fps, layers: []}); }
    get selectedLayers() { return this.layers.filter(l => l.selected); }
  }
  class Shape {}
  const comp = new CompItem(), layer = new Layer(); comp.layers.push(layer); layer.containingComp = comp;
  const scope = await loadHostModules(['src/json.jsx', 'src/registry.jsx']);
  scope.MotionLibraryCore = contracts; scope.MotionLibraryCatalog = contracts.MOTION_LIBRARY_PRESETS;
  const globals = {app: {project: {activeItem: comp}}, MarkerValue, CompItem, Shape, CameraLayer: class {}, LightLayer: class {}, KeyframeInterpolationType: {LINEAR: 1}, MotionContracts: {ERROR: errors}, ...scope};
  for (const source of sources) new Function('$', ...Object.keys(globals), source)({global: scope}, ...Object.values(globals));
  const handler = id => scope.MotionRegistry.get(`ae.presets.${id}`);
  const args = (id, overrides = {}) => ({presetId: id, ...contracts.MOTION_LIBRARY_DEFAULTS, ...contracts.MOTION_LIBRARY_PRESETS.find(p => p.id === id)?.defaults, ...overrides});
  const run = (id, input = {}, locale = 'pt-BR') => { const error = handler(id).preflight(input); assert.equal(error, null, error?.message); return handler(id).run(input, {locale}); };
  /** Gallery path: transitions use independent phases, loops the direct apply. */
  const applyPreset = (id, overrides = {}, locale = 'pt-BR') => run(contracts.MOTION_LIBRARY_PRESETS.find(p => p.id === id).mode === 'transition' ? 'phase-apply' : 'apply', args(id, overrides), locale);
  return {comp, layer, run, handler, args, applyPreset, get mutations() { return mutations; }};
}

function expressions(layer) {
  const result = [];
  const visit = group => { for (const p of group.children ?? []) { if (p.expression) result.push(p); if (p.children) visit(p); } };
  for (const group of [layer.effects, layer.transform, layer.text, layer.masks]) visit(group);
  return result;
}
function animators(f) { return f.layer.text.property('ADBE Text Animators').children; }
function selector(f, role) {
  return animators(f).find(a => a.name.endsWith(` · ${role}`))?.property('ADBE Text Selectors').property('Moti.on Timing').property('ADBE Text Expressible Amount');
}
function effects(f, matchName) { return f.layer.effects.children.filter(e => e.matchName === matchName); }
const flat = value => Array.isArray(value) ? value : [value];

test('signature catalog: 24 stable recipes in four families of six with authored tempo', () => {
  assert.equal(signature.length, 24);
  for (const family of ['essentials', 'cinema', 'light-matter', 'variation']) assert.equal(signature.filter(p => p.family === family).length, 6, family);
  assert.equal(new Set(signature.map(p => p.id)).size, 24);
  assert.equal(new Set(signature.map(p => p.name['pt-BR'])).size, 24);
  assert.equal(new Set(signature.map(p => p.name['en-US'])).size, 24);
  for (const p of signature) {
    assert.match(p.id, /^signature-[a-z-]+$/);
    assert.ok(p.category.startsWith('text-'), p.id);
    assert.ok(contracts.isMotionLibraryOptions({...contracts.MOTION_LIBRARY_DEFAULTS, ...p.defaults}), p.id);
    assert.ok(p.tempo.minFrames <= p.defaults.durationFrames && p.defaults.durationFrames <= p.tempo.maxFrames, `${p.id} default inside its tempo window`);
    assert.equal(p.tempo.character === 'loop', p.mode === 'continuous', p.id);
    if (p.mode === 'transition') assert.equal(p.fade, true, `${p.id} starts invisible`);
    if (p.tempo.character === 'kinetic') assert.ok(p.tempo.maxFrames <= 60, `${p.id} kinetic window stays narrow`);
  }
  assert.ok(signature.filter(p => p.tempo.character === 'kinetic').length >= 6);
  assert.ok(signature.filter(p => p.tempo.character === 'cinematic').length >= 12);
});

test('every signature recipe evaluates finite expressions, starts invisible and settles on the untouched source', async () => {
  for (const p of signature) {
    const f = await fixture();
    f.applyPreset(p.id, {phase: p.mode === 'transition' ? 'both' : 'in'});
    const all = expressions(f.layer);
    assert.ok(all.length, p.id);
    for (const property of all) for (const time of [0, .05, .3, .9, 2, 3.4, 4]) for (const unit of [0, 3, 6]) {
      assert.ok(flat(property.valueAtTime(time, false, unit, 7)).every(Number.isFinite), `${p.id}/${property.matchName}/${time}/${unit}`);
    }
    assert.equal(f.layer.sourceText, 'Editable title\rSecond line');
    if (p.mode !== 'transition') continue;
    // Rest between the entrance and the exit: every per-unit selector is zero
    // and every layer effect reports its neutral value.
    for (const a of animators(f)) {
      const amount = a.property('ADBE Text Selectors').property('Moti.on Timing').property('ADBE Text Expressible Amount');
      for (const unit of [0, 3, 6]) assert.ok(flat(amount.valueAtTime(2, false, unit, 7)).every(v => Math.abs(v) < 1e-9), `${p.id}/${a.name} at rest`);
    }
    for (const property of all) if (Object.hasOwn(neutral, property.matchName)) {
      assert.ok(flat(property.valueAtTime(2)).every(v => Math.abs(v - neutral[property.matchName]) < 1e-9), `${p.id}/${property.parentProperty.name}/${property.matchName} neutral at rest`);
    }
    const opacity = animators(f).find(a => a.name.endsWith(' · Opacidade'));
    assert.ok(opacity, `${p.id} fades`);
    assert.equal(flat(opacity.property('ADBE Text Selectors').property('Moti.on Timing').property('ADBE Text Expressible Amount').valueAtTime(0, false, 0, 7))[0], 100, `${p.id} first frame is transparent`);
  }
});

test('cinematic looks are duration invariant: the same progress gives the same burn at any speed', async () => {
  const sample = async durationFrames => {
    const f = await fixture(); f.applyPreset('signature-film-burn', {phase: 'in', durationFrames});
    const burn = effects(f, 'CC Burn Film')[0].property('CC Burn Film-0001'), glow = effects(f, 'ADBE Glo2')[0].property('ADBE Glo2-0004');
    return [.1, .25, .5, .75].map(fraction => [burn.valueAtTime(fraction * durationFrames / 30), glow.valueAtTime(fraction * durationFrames / 30)]);
  };
  const short = await sample(36), long = await sample(72);
  short.forEach((pair, i) => pair.forEach((v, j) => assert.ok(Math.abs(v - long[i][j]) < 1e-9, `fraction ${i}: ${v} vs ${long[i][j]}`)));
  assert.ok(short[0][0] > short[3][0], 'the burn recedes as the title forms');
  assert.ok(short.some(([, glow]) => glow > .5), 'embers glow while letters form');
});

test('kinetic streaks follow real speed: faster durations streak longer, rest is sharp', async () => {
  const peak = async durationFrames => {
    const f = await fixture(); f.applyPreset('signature-anamorphic', {phase: 'in', durationFrames});
    const length = effects(f, 'ADBE Motion Blur')[0].property('ADBE Motion Blur-0002');
    const values = Array.from({length: 40}, (_, i) => length.valueAtTime(i / 40 * durationFrames / 30));
    assert.equal(length.valueAtTime(3), 0, 'sharp at rest');
    return Math.max(...values);
  };
  const fast = await peak(20), authored = await peak(30), slow = await peak(40);
  assert.ok(fast > authored && authored > slow, `${fast} > ${authored} > ${slow}`);
  assert.ok(fast <= 2 * authored + 1e-9, 'bounded at twice the authored streak');
});

test('Cycore looks fade their Effect Opacity with the transition so rest is exactly the source', async () => {
  for (const id of ['signature-film-burn', 'signature-light-sweep', 'signature-light-rays', 'signature-ink-bleed', 'signature-dust-assemble']) {
    const f = await fixture(); f.applyPreset(id, {phase: 'in'});
    const guarded = expressions(f.layer).filter(p => p.matchName === 'ADBE Effect Mask Opacity');
    assert.ok(guarded.length >= 1, id);
    for (const p of guarded) { assert.equal(p.valueAtTime(.2), 100, `${id} active while forming`); assert.equal(p.valueAtTime(3), 0, `${id} blended out at rest`); }
  }
});

test('decode resolves deterministic glyphs that lock per unit; roll counts down to the source glyph', async () => {
  const f = await fixture(); f.applyPreset('signature-decode-resolve', {phase: 'in', seed: 41});
  const glyphs = selector(f, 'Glifos');
  const seen = new Set();
  for (let step = 0; step <= 40; step++) for (const unit of [0, 3, 6]) {
    const value = flat(glyphs.valueAtTime(step / 40 * 34 / 30, false, unit, 7))[0];
    assert.ok(Number.isInteger(Math.round(value * 30 / 100 * 1e6) / 1e6), 'whole glyph steps');
    seen.add(Math.round(value * 30 / 100));
  }
  assert.ok(seen.size > 5, 'cycles through several glyphs');
  assert.equal(flat(glyphs.valueAtTime(3, false, 6, 7))[0], 0, 'locked at rest');
  const again = await fixture(); again.applyPreset('signature-decode-resolve', {phase: 'in', seed: 41});
  assert.equal(JSON.stringify(selector(again, 'Glifos').valueAtTime(.3, false, 2, 7)), JSON.stringify(glyphs.valueAtTime(.3, false, 2, 7)), 'deterministic for a seed');

  const r = await fixture(); r.applyPreset('signature-slot-roll', {phase: 'in'});
  const roll = selector(r, 'Glifos');
  let previous = Infinity;
  for (let step = 0; step <= 30; step++) { const v = flat(roll.valueAtTime(step / 30 * 24 / 30, false, 2, 7))[0]; assert.ok(v <= previous + 1e-9, 'roll never counts back up'); previous = v; }
  assert.equal(previous, 0);
});

test('fill tint returns to the editable source fill, and per-axis blur stays directional', async () => {
  const f = await fixture(); f.applyPreset('signature-film-burn', {phase: 'in'});
  const fill = selector(f, 'Cor');
  assert.ok(flat(fill.valueAtTime(.3, false, 3, 7))[0] > 0);
  assert.equal(flat(fill.valueAtTime(3, false, 3, 7))[0], 0);
  const g = await fixture(); g.applyPreset('signature-anamorphic', {phase: 'in'});
  const focus = animators(g).find(a => a.name.endsWith(' · Foco')).property('ADBE Text Animator Properties').property('ADBE Text Blur');
  assert.equal(JSON.stringify(focus.value), '[18,0]');
});

test('a missing native parameter refuses with CAPABILITY_UNAVAILABLE and rolls back every change', async () => {
  const f = await fixture({missing: 'CC Burn Film-0002'});
  assert.throws(() => f.applyPreset('signature-film-burn', {phase: 'in'}), error => /CC Burn Film-0002/.test(error.message) && error.motionCode === 'CAPABILITY_UNAVAILABLE');
  assert.equal(f.layer.effects.numProperties, 0);
  assert.equal(animators(f).length, 0);
  assert.equal(f.layer.comment, 'Keep this comment');
  assert.equal(f.layer.markers.numKeys, 0);
});

test('reapply and locale changes reuse owned effects; remove restores the layer', async () => {
  const f = await fixture();
  f.applyPreset('signature-anamorphic', {phase: 'in'});
  const count = f.layer.effects.numProperties, animatorCount = animators(f).length;
  f.applyPreset('signature-anamorphic', {phase: 'in', durationFrames: 24}, 'en-US');
  assert.equal(f.layer.effects.numProperties, count);
  assert.equal(animators(f).length, animatorCount);
  const state = f.run('inspect').data;
  f.run('phase-action', {target: state.target, phase: 'in', action: 'remove'});
  assert.equal(f.layer.effects.numProperties, 0);
  assert.equal(animators(f).length, 0);
  assert.equal(f.layer.comment, 'Keep this comment');
});

test('loops are paced by Speed and keep their glow alive', async () => {
  const f = await fixture(); f.applyPreset('signature-halo-breath');
  const radius = effects(f, 'ADBE Glo2')[0].property('ADBE Glo2-0003');
  const values = Array.from({length: 24}, (_, i) => radius.valueAtTime(i / 6));
  assert.ok(Math.max(...values) - Math.min(...values) > 5, 'the halo breathes');
  assert.ok(values.every(v => v > 0));
});

test('masked recipes apply through independent phases with the text bounds (word-curtain regression)', async () => {
  for (const id of ['word-curtain', 'smooth-word-slide', 'signature-veil-rise']) {
    const f = await fixture(); f.applyPreset(id, {phase: 'both'});
    assert.equal(f.layer.masks.numProperties, 2, `${id}: each phase owns its window mask`);
    assert.ok(f.layer.masks.children.every(m => m.name.startsWith('Moti.on ')), id);
    const state = f.run('inspect').data;
    f.run('phase-action', {target: state.target, phase: 'out', action: 'remove'});
    assert.equal(f.layer.masks.numProperties, 1, `${id}: removing the exit keeps the entrance window`);
  }
});

test('direct apply ignores the dispatcher request options (continuous presets regression)', async () => {
  for (const id of ['signature-halo-breath', 'signature-tracking-drift', 'studio-text-satin-breath']) {
    const f = await fixture(), input = f.args(id);
    assert.equal(f.handler('apply').preflight(input), null);
    // MotionAE.dispatch calls run(args, context, request.options).
    const result = f.handler('apply').run(input, {locale: 'pt-BR'}, {allowDestructive: true});
    assert.equal(result.changed, true, id);
    assert.ok(f.layer.effects.numProperties >= 3, id);
  }
});

test('glow looks fade their Effect Opacity continuously with the light: no pop when the title settles', async () => {
  for (const id of ['signature-film-burn', 'signature-bloom-ignite', 'signature-anamorphic']) {
    const f = await fixture(); f.applyPreset(id, {phase: 'in'});
    const glow = effects(f, 'ADBE Glo2')[0], opacity = glow.property('ADBE Effect Built In Params').property('ADBE Effect Mask Opacity');
    const duration = f.args(id).durationFrames / 30, samples = Array.from({length: 121}, (_, i) => opacity.valueAtTime(i / 120 * duration));
    assert.ok(Math.max(...samples) > 50, `${id} glows while forming`);
    // The settle (second half, where the title is readable) eases to zero with no step.
    for (let i = 61; i < samples.length; i++) assert.ok(Math.abs(samples[i] - samples[i - 1]) < 5, `${id} step ${i}: ${samples[i - 1]} -> ${samples[i]}`);
    assert.ok(samples[120] < 1, `${id} reaches zero by the end of the transition`);
    assert.equal(opacity.valueAtTime(3), 0, `${id} glow blended out at rest`);
  }
});

test('light sweep dims the title while the beam crosses and restores its exact exposure at rest', async () => {
  const f = await fixture(); f.applyPreset('signature-light-sweep', {phase: 'in'});
  const exposure = effects(f, 'ADBE Exposure2')[0].property('ADBE Exposure2-0003');
  const duration = f.args('signature-light-sweep').durationFrames / 30;
  assert.ok(exposure.valueAtTime(duration / 2) < -1, 'darkest while the beam is mid-title');
  assert.equal(exposure.valueAtTime(3), 0);
  const center = effects(f, 'CC Light Sweep')[0].property('CC Light Sweep-0001');
  assert.ok(center.valueAtTime(duration * .2)[0] < center.valueAtTime(duration * .8)[0], 'the beam travels with the forward reveal');
});
