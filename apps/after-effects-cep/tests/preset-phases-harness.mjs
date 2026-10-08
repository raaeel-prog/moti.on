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
const TAG = '[Moti.on.library.v1]';
const errors = Object.fromEntries(['INVALID_PRESET', 'NO_ACTIVE_COMP', 'NO_SELECTION', 'INVALID_SELECTION_TYPE', 'CAPABILITY_UNAVAILABLE', 'EXPRESSION_CONFLICT', 'ROLLBACK_FAILED'].map(key => [key, key]));
const hostSource = await readFile(new URL('../host/src/commands/preset-library.jsx', import.meta.url), 'utf8');

export async function fixture({ fps = 30, height = 1080, text = false } = {}) {
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
    setValueAtTime(time, value) {
      const prior = this.keys.findIndex(k => Math.abs(k.time-time)<1e-6);
      if(prior>=0)this.keys.splice(prior,1);
      this.keys.push({time,value:clone(value)});this.keys.sort((a,b)=>a.time-b.time);mutations++;
    }
    removeKey(index) { this.keys.splice(index-1,1);mutations++; }
    expressionAPI() { return {numKeys:this.numKeys,key:index=>({time:this.keyTime(index),parameters:this.keyValue(index).getParameters()})}; }
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
        thisLayer: {marker: layer.markers.expressionAPI()},
        textIndex: unitIndex + 1, textTotal: unitCount, transform: {scale: layer.transform.property('ADBE Scale').valueAtTime(time, true)},
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
    canAddProperty(name) { return name === 'ADBE Slider Control' || name === 'ADBE Gaussian Blur 2'; }
    addProperty(name) {
      let p;
      if (this.matchName === 'ADBE Text Animator Properties') p = new Property(name, 0, this);
      else if (name === 'ADBE Text Animator') {
        p = new Group(name, this);
        p.children = ['ADBE Text Animator Properties', 'ADBE Text Selectors'].map(n => new Group(n, p));
      } else if (name === 'ADBE Text Expressible Selector') {
        p = new Group(name, this, {'ADBE Text Range Type2': 1, 'ADBE Text Expressible Amount': [100, 100, 100]});
      } else if (name === 'ADBE Gaussian Blur 2') {
        p = new Group(name, this, {'ADBE Gaussian Blur 2-0001': 0, 'ADBE Gaussian Blur 2-0003': 0});
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
      this.markers = new Markers(this);
      this.effects = new Group('ADBE Effect Parade', this);
      this.transform = new Group('ADBE Transform Group', this, {'ADBE Anchor Point': [50,50,0], 'ADBE Position': [300,200,0], 'ADBE Scale': [100,100,100], 'ADBE Rotate X': 0, 'ADBE Rotate Y': 0, 'ADBE Rotate Z': 0, 'ADBE Opacity': 100});
      if (isText) { this.sourceText = 'Editable words\rSecond line'; this.text = new Group('ADBE Text Properties', this); this.text.children.push(new Group('ADBE Text Animators', this.text)); }
    }
    get numProperties() { return this.text ? 4 : 3; }
    property(name) { const all = [this.effects, this.transform, this.markers, this.text]; return typeof name === 'number' ? all[name - 1] : all.find(p => p?.matchName === name); }
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
    app: {project: {activeItem: comp}}, MarkerValue, CompItem, CameraLayer: class {}, LightLayer: class {}, KeyframeInterpolationType: {LINEAR: 1},
    MotionContracts: {ERROR: errors}, ...scope
  };
  new Function('$', ...Object.keys(globals), hostSource)({global: scope}, ...Object.values(globals));
  layer.containingComp=comp;comp.frameRate=fps;
  const phaseSource=await readFile(new URL('../host/src/commands/preset-phases.jsx',import.meta.url),'utf8');
  new Function('$', ...Object.keys(globals),phaseSource)({global:scope},...Object.values(globals));
  const colorsSource=await readFile(new URL('../host/src/commands/preset-colors.jsx',import.meta.url),'utf8');
  new Function('$', ...Object.keys(globals),colorsSource)({global:scope},...Object.values(globals));
  const handler = id => scope.MotionRegistry.get(`ae.presets.${id}`);
  const args = (id, overrides = {}) => ({presetId: id, ...contracts.MOTION_LIBRARY_DEFAULTS, ...contracts.MOTION_LIBRARY_PRESETS.find(p => p.id === id)?.defaults, ...overrides});
  const run = (id, input = {}, locale = 'pt-BR') => { const error = handler(id).preflight(input); assert.equal(error, null, error?.message); return handler(id).run(input, {locale}); };
  const meta = () => JSON.parse(decodeURIComponent(layer.comment.split(TAG)[1]));
  return {scope,comp, layer, Layer, Group, Property, MarkerValue, run, handler, args, meta, get mutations() { return mutations; }};
}
