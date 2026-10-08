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
const native = contracts.MOTION_LIBRARY_PRESETS.filter(p => p.collection === 'native');
const CORE = 'CHMS Motion Core';
const TAG = '[Moti.on.library.v1]';
const errors = Object.fromEntries(['INVALID_PRESET', 'NO_ACTIVE_COMP', 'NO_SELECTION', 'INVALID_SELECTION_TYPE', 'CAPABILITY_UNAVAILABLE', 'EXPRESSION_CONFLICT', 'ROLLBACK_FAILED'].map(key => [key, key]));
const hostSource = await readFile(new URL('../host/src/commands/preset-library.jsx', import.meta.url), 'utf8');

async function fixture({ installed = true, parameterCount = 5, fps = 30, height = 1080, text = false } = {}) {
  let nextId = 1, mutations = 0;
  class Property {
    constructor(name, value, parentProperty) { Object.assign(this, {name, matchName: name, value, parentProperty, canSetExpression: true, expression: '', expressionEnabled: false, expressionError: '', keys: []}); }
    get numKeys() { return this.keys.length; }
    setValue(value) { assert.equal(this.numKeys, 0, 'do not flatten keys'); this.value = value; mutations++; }
    valueAtTime(time, preExpression = false) {
      if (!this.expression || !this.expressionEnabled || preExpression) return this.value;
      let layer = this.parentProperty;
      while (layer.parentProperty) layer = layer.parentProperty;
      return vm.runInNewContext(this.expression, {
        time, inPoint: layer.inPoint, outPoint: layer.outPoint, value: this.value, thisComp: comp,
        textIndex: 1, textTotal: 7,
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
    canAddProperty(name) { return name === 'ADBE Slider Control' || name === CORE && installed; }
    addProperty(name) {
      let p;
      if (this.matchName === 'ADBE Text Animator Properties') p = new Property(name, 0, this);
      else if (name === 'ADBE Text Animator') {
        p = new Group(name, this);
        p.children = ['ADBE Text Animator Properties', 'ADBE Text Selectors'].map(n => new Group(n, p));
      } else if (name === 'ADBE Text Expressible Selector') {
        p = new Group(name, this, {'ADBE Text Range Type2': 1, 'ADBE Text Expressible Amount': [100, 100, 100]});
      } else if (name === CORE) {
        p = new Group(name, this, Object.fromEntries(Array.from({length: parameterCount}, (_, i) => [`${CORE}-000${i + 1}`, 0])));
      } else if (name === 'ADBE Slider Control') p = new Group(name, this, {'ADBE Slider Control-0001': 0});
      else throw new Error(`Unexpected mock property ${name}`);
      p.remove = () => { this.children.splice(this.children.indexOf(p), 1); mutations++; };
      this.children.push(p); mutations++;
      return p;
    }
  }
  class Layer {
    constructor(isText) {
      Object.assign(this, {id: nextId++, name: 'User artwork', comment: 'Keep this comment', inPoint: 0, outPoint: 4, hasVideo: true, nullLayer: false, threeDLayer: false, locked: false, selected: true});
      this.effects = new Group('ADBE Effect Parade', this);
      this.transform = new Group('ADBE Transform Group', this, {'ADBE Position': [300, 200], 'ADBE Scale': [100, 100], 'ADBE Rotate Z': 0, 'ADBE Opacity': 100});
      if (isText) { this.text = new Group('ADBE Text Properties', this); this.text.children.push(new Group('ADBE Text Animators', this.text)); }
    }
    get numProperties() { return this.text ? 3 : 2; }
    property(name) { const all = [this.effects, this.transform, this.text]; return typeof name === 'number' ? all[name - 1] : all.find(p => p?.matchName === name); }
    sourceRectAtTime() { return {left: 0, top: 0, width: 100, height: 100}; }
  }
  class CompItem {
    constructor() { Object.assign(this, {id: 100, height, time: .2, frameDuration: 1 / fps, layers: []}); }
    get selectedLayers() { return this.layers.filter(l => l.selected); }
  }
  const comp = new CompItem(), layer = new Layer(text); comp.layers.push(layer);
  const scope = await loadHostModules(['src/json.jsx', 'src/registry.jsx']);
  scope.MotionLibraryCore = contracts; scope.MotionLibraryCatalog = contracts.MOTION_LIBRARY_PRESETS;
  const globals = {
    app: {project: {activeItem: comp}}, CompItem, CameraLayer: class {}, LightLayer: class {}, KeyframeInterpolationType: {LINEAR: 1},
    MotionContracts: {ERROR: errors}, ...scope
  };
  new Function('$', ...Object.keys(globals), hostSource)({global: scope}, ...Object.values(globals));
  const handler = id => scope.MotionRegistry.get(`ae.presets.${id}`);
  const args = (id, overrides = {}) => ({presetId: id, ...contracts.MOTION_LIBRARY_DEFAULTS, ...native.find(p => p.id === id)?.defaults, ...overrides});
  const run = (id, input = {}, locale = 'pt-BR') => { const error = handler(id).preflight(input); assert.equal(error, null, error?.message); return handler(id).run(input, {locale}); };
  const engine = () => layer.effects.children.find(e => e.matchName === CORE);
  const meta = () => JSON.parse(decodeURIComponent(layer.comment.split(TAG)[1]));
  return {comp, layer, Layer, run, handler, args, engine, meta, get mutations() { return mutations; }};
}

test('native presets preflight the complete selection and reject missing core without mutation', async () => {
  for (const p of native) {
    const f = await fixture({installed: false, text: p.category.startsWith('text-')});
    const result = f.handler('apply').preflight(f.args(p.id));
    assert.equal(result.code, 'CAPABILITY_UNAVAILABLE'); assert.match(result.message, /CHMS Motion Core/);
    assert.equal(f.mutations, 0); assert.equal(f.layer.comment, 'Keep this comment');
  }
  const f = await fixture();
  const other = new f.Layer(false); other.effects.canAddProperty = () => false; f.comp.layers.push(other);
  assert.equal(f.handler('apply').preflight(f.args('native-rgb')).code, 'CAPABILITY_UNAVAILABLE');
  assert.equal(f.mutations, 0);
  other.effects.canAddProperty = () => { throw new Error('host rejected probe'); };
  assert.equal(f.handler('apply').preflight(f.args('native-rgb')).code, 'CAPABILITY_UNAVAILABLE');
  assert.equal(f.mutations, 0);
});

test('new native instance with missing parameter rolls back effects, expressions and comments', async () => {
  for (const p of native) {
    const f = await fixture({parameterCount: 4, text: p.category.startsWith('text-')});
    assert.equal(f.handler('apply').preflight(f.args(p.id)), null);
    assert.throws(() => f.handler('apply').run(f.args(p.id), {locale: 'pt-BR'}), e => e.motionCode === 'CAPABILITY_UNAVAILABLE');
    assert.equal(f.layer.effects.numProperties, 0, p.id);
    assert.equal(f.layer.comment, 'Keep this comment');
    assert.ok(f.layer.transform.children.every(p => !p.expression && !p.expressionEnabled));
    if (f.layer.text) assert.equal(f.layer.text.property('ADBE Text Animators').numProperties, 0);
  }
});

test('core parameter mapping is scaled, deterministic and bounded in each recipe', async () => {
  for (const height of [540, 1080, 2160]) for (const p of native) {
    const f = await fixture({height, text: p.category.startsWith('text-')});
    f.run('apply', f.args(p.id)); const e = f.engine();
    assert.ok(e); assert.equal(e.property(2).value, p.effectAmount * height / 1080);
    assert.equal(e.property(3).value, p.effect === 'native-glitch' ? 12 : 0);
    assert.equal(e.property(4).value, p.effect === 'native-glitch' ? 64 * height / 1080 : 0);
    assert.equal(e.property(5).value, 17);
    assert.deepEqual(f.meta().nativeEngine, {matchName: CORE, contractVersion: 1});
    assert.ok(!f.layer.effects.children.some(e => e.matchName === 'Mettle SkyBox Chromatic Aberrat'));
  }
});

test('native intensity expressions evaluate zero, In, Out, rest, short layers and saturated amplitude', async () => {
  for (const fps of [24, 29.97, 60]) for (const p of native) {
    const f = await fixture({fps, text: p.category.startsWith('text-')});
    for (const phase of ['in', 'out', 'both']) {
      f.run('apply', f.args(p.id, {phase})); const intensity = f.engine().property(1);
      assert.equal(intensity.valueAtTime(0), p.mode === 'static' || phase !== 'out' ? 100 : 0, `${p.id}/${phase} start`);
      assert.equal(intensity.valueAtTime(4), p.mode === 'static' || phase !== 'in' ? 100 : 0, `${p.id}/${phase} exit`);
      assert.equal(intensity.valueAtTime(2), p.mode === 'static' ? 100 : 0, `${p.id}/${phase} rest`);
      for (const amp of [0, 50, 300]) {
        f.run('apply', f.args(p.id, {phase, intensity: amp}));
        for (const time of [0, .2, .5, 2, 3.7, 4]) {
          const value = f.engine().property(1).valueAtTime(time);
          assert.ok(value >= 0 && value <= 100, `${p.id}: ${value}`);
          if (amp === 0) assert.equal(value, 0);
        }
      }
    }
    f.layer.outPoint = 2 / fps;
    f.run('apply', f.args(p.id, {phase: 'both', durationFrames: 600}));
    assert.ok(Number.isFinite(f.engine().property(1).valueAtTime(1 / fps)));
  }
});

test('native lifecycle reuses owned effects across locale, adjusts, preserves animation and removes only owned artifacts', async () => {
  for (const p of native) {
    const f = await fixture({text: p.category.startsWith('text-')});
    const userEffect = f.layer.effects.addProperty('ADBE Slider Control'); userEffect.name = 'My unrelated effect'; userEffect.property(1).setValue(19);
    f.run('apply', f.args(p.id)); const e = f.engine(), count = f.layer.effects.numProperties;
    f.run('apply', f.args(p.id), 'en-US');
    assert.equal(f.layer.effects.numProperties, count); assert.equal(f.engine(), e);
    const state = f.run('inspect').data;
    f.run('adjust', {target: state.target, presetId: p.id, options: {...state.options, intensity: 35}});
    assert.equal(f.run('inspect').data.options.intensity, 35);
    e.property(2).setValuesAtTimes([0, 1], [8, 16]); e.property(3).expression = '7'; e.property(3).expressionEnabled = true;
    f.run('apply', f.args(p.id));
    assert.equal(e.property(2).numKeys, 2); assert.equal(e.property(3).expression, '7');
    f.run('remove');
    assert.equal(f.layer.effects.numProperties, 1); assert.equal(f.layer.effects.property(1), userEffect);
    assert.equal(userEffect.property(1).value, 19); assert.equal(f.layer.comment, 'Keep this comment');
    assert.ok(f.layer.transform.children.every(p => !p.expression));
  }
});

test('owned core incompatibility and edited expression reject reapply before mutation', async () => {
  const f = await fixture(); f.run('apply', f.args('native-rgb'));
  f.engine().children.pop(); const before = f.mutations;
  assert.equal(f.handler('apply').preflight(f.args('native-rgb')).code, 'CAPABILITY_UNAVAILABLE');
  assert.equal(f.mutations, before);
  f.engine().property(1).expression = '75';
  assert.equal(f.handler('remove').preflight({}).code, 'EXPRESSION_CONFLICT');
  assert.equal(f.mutations, before);
});

test('motion bake records evaluated native intensity; text bake remains explicitly unavailable', async () => {
  for (const p of native) {
    const f = await fixture({text: p.category.startsWith('text-')}); f.run('apply', f.args(p.id, {phase: 'both'}));
    const e = f.engine();
    if (p.category.startsWith('text-')) {
      const before = f.mutations; assert.equal(f.handler('bake').preflight({}).code, 'CAPABILITY_UNAVAILABLE'); assert.equal(f.mutations, before);
    } else {
      const intensity = e.property(1), before = [0, 1, 2, 3, 4].map(t => intensity.valueAtTime(t));
      f.run('bake'); assert.equal(intensity.expression, ''); assert.equal(intensity.numKeys, 121);
      assert.deepEqual([0, 30, 60, 90, 120].map(i => intensity.keys[i].value), before);
      assert.equal(f.layer.comment, 'Keep this comment');
    }
  }
});

test('legacy RGB keeps its original Mettle capability and never silently changes renderer', async () => {
  const f = await fixture();
  const error = f.handler('apply').preflight(f.args('channel-offset'));
  assert.equal(error.code, 'CAPABILITY_UNAVAILABLE'); assert.match(error.message, /Mettle SkyBox/);
  assert.equal(f.mutations, 0);
});

test('color presets preserve unrelated transform expressions, separated Position and later user 3D', async () => {
  const f = await fixture();
  const position=f.layer.transform.property('ADBE Position'),opacity=f.layer.transform.property('ADBE Opacity');
  position.dimensionsSeparated=true;position.expression='value+[10,0]';position.expressionEnabled=true;
  opacity.expression='value*.75';opacity.expressionEnabled=true;
  f.run('apply',f.args('native-rgb'));
  f.layer.threeDLayer=true;
  f.run('remove');
  assert.equal(f.layer.threeDLayer,true);
  assert.equal(position.expression,'value+[10,0]');assert.equal(opacity.expression,'value*.75');
});

test('text presets do not unnecessarily reject separated layer Position', async () => {
  const f=await fixture({text:true});f.layer.transform.property('ADBE Position').dimensionsSeparated=true;
  f.run('apply',f.args('native-text-chromatic'));f.run('remove');
});

test('motion still rejects expression conflicts on the properties it animates', async () => {
  const f=await fixture();const position=f.layer.transform.property('ADBE Position');
  position.expression='value+[10,0]';
  assert.equal(f.handler('apply').preflight(f.args('arc-arrival')).code,'EXPRESSION_CONFLICT');
  position.expression='';position.dimensionsSeparated=true;
  assert.equal(f.handler('apply').preflight(f.args('arc-arrival')).code,'INVALID_SELECTION_TYPE');
});

test('bake failure restores pre-expression base values and expression state', async () => {
  const f=await fixture();f.run('apply',f.args('arc-arrival'));
  const p=f.layer.transform.property('ADBE Position'),base=[...p.value],expression=p.expression;
  p.setValuesAtTimes=function(times,values){this.keys=times.map((time,i)=>({time,value:values[i]}));this.value=values[0];};
  p.removeKey=function(index){const [key]=this.keys.splice(index-1,1);if(!this.keys.length)this.value=key.value;};
  const later=f.layer.transform.property('ADBE Opacity');
  later.setValuesAtTimes=()=>{throw new Error('injected bake failure');};
  assert.throws(()=>f.run('bake'),/injected bake failure/);
  assert.equal(p.numKeys,0);assert.equal(p.expression,expression);assert.equal(p.expressionEnabled,true);
  assert.deepEqual(p.value,base);
});

test('failed reapply snapshots underlying static value instead of expression-evaluated display value',async()=>{
  const f=await fixture();f.run('apply',f.args('arc-arrival'));
  const position=f.layer.transform.property('ADBE Position');let base=[300,200];
  Object.defineProperty(position,'value',{get:()=>[450,900],set:value=>{base=value;}});
  position.valueAtTime=(time,pre)=>pre?base:[450,900];
  const other=new f.Layer(false);other.sourceRectAtTime=()=>{throw new Error('injected source failure');};f.comp.layers.push(other);
  assert.throws(()=>f.run('apply',f.args('arc-arrival')),/injected source failure/);
  assert.deepEqual(base,[300,200]);assert.equal(position.expressionEnabled,true);
  assert.equal(other.effects.numProperties,0);
});

