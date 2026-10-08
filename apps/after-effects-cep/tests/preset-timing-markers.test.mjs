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
const TAG = '[Moti.on.library.v1]';
const errors = Object.fromEntries(['INVALID_PRESET', 'NO_ACTIVE_COMP', 'NO_SELECTION', 'INVALID_SELECTION_TYPE', 'CAPABILITY_UNAVAILABLE', 'EXPRESSION_CONFLICT', 'ROLLBACK_FAILED'].map(key => [key, key]));
const hostSource = await readFile(new URL('../host/src/commands/preset-library.jsx', import.meta.url), 'utf8');

async function fixture({ fps = 30, height = 1080, text = false } = {}) {
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
  const handler = id => scope.MotionRegistry.get(`ae.presets.${id}`);
  const args = (id, overrides = {}) => ({presetId: id, ...contracts.MOTION_LIBRARY_DEFAULTS, ...contracts.MOTION_LIBRARY_PRESETS.find(p => p.id === id)?.defaults, ...overrides});
  const run = (id, input = {}, locale = 'pt-BR') => { const error = handler(id).preflight(input); assert.equal(error, null, error?.message); return handler(id).run(input, {locale}); };
  const meta = () => JSON.parse(decodeURIComponent(layer.comment.split(TAG)[1]));
  return {comp, layer, Layer, MarkerValue, run, handler, args, meta, get mutations() { return mutations; }};
}

function roles(f, layer=f.layer) {
  return layer.markers.keys.map(({time,value})=>({time,role:value.params['Moti.on.phase'],comment:value.comment}));
}
function move(f, role, time) {
  const p=f.layer.markers,index=p.keys.findIndex(k=>k.value.params['Moti.on.phase']===role)+1;
  const value=p.keyValue(index);p.removeKey(index);p.setValueAtTime(time,value);
}
function position(f,time) { return [...f.layer.transform.property('ADBE Position').valueAtTime(time)]; }
const id='premium-arc-arrival';

test('In, Out and Both create only owned timing cues and preserve user marker data',async()=>{
  for(const phase of ['in','out','both']){
    const f=await fixture();const cue=new f.MarkerValue('Client cue');cue.duration=.2;cue.setParameters({review:'keep'});f.layer.markers.setValueAtTime(2,cue);
    f.run('apply',f.args(id,{phase,durationFrames:24}));
    assert.deepEqual(roles(f).filter(v=>v.role).map(v=>v.role),phase==='both'?['in','out']:[phase]);
    assert.equal(f.meta().markerVersion,1);
    for(const item of f.layer.markers.keys.filter(k=>k.value.params['Moti.on.phase']))assert.equal(item.value.params['Moti.on.instance'],f.meta().instance);
    const state=f.run('inspect').data;f.run('adjust',{target:state.target,presetId:id,options:{...state.options,intensity:70}});
    assert.equal(f.layer.markers.numKeys,phase==='both'?3:2);
    f.run('remove');assert.equal(f.layer.markers.numKeys,1);assert.deepEqual(f.layer.markers.keyValue(1),cue);assert.equal(f.layer.comment,'Keep this comment');
  }
});

test('moving In and Out cues independently changes expressions and persists on reapply',async()=>{
  const f=await fixture();const args=f.args(id,{phase:'both',durationFrames:24});f.run('apply',args);
  const original=position(f,.4);move(f,'in',1.6);move(f,'out',3.6);assert.notDeepEqual(position(f,.4),original);
  assert.deepEqual(position(f,2),[300,200]);assert.deepEqual(position(f,3.5),[300,200]);assert.notDeepEqual(position(f,3.8),[300,200]);
  f.run('apply',{...args,intensity:70});assert.deepEqual(roles(f).map(r=>r.time),[1.6,3.6]);
  const m=f.meta(),duration=f.layer.effects.property(m.effects[0].name).property(1);
  const before=position(f,.5);duration.setValue(48);assert.notDeepEqual(position(f,.5),before);
  const state=f.run('inspect').data;f.run('adjust',{target:state.target,presetId:id,options:{...state.options,durationFrames:30}});
  assert.deepEqual(roles(f).map(r=>r.time),[1,3]);assert.equal(f.meta().markerDurationFrames,30);
});

test('marker drag invalidates stale editor targets and rename retains cue ownership',async()=>{
  const f=await fixture();f.run('apply',f.args(id,{phase:'both',durationFrames:24}));const state=f.run('inspect').data;
  move(f,'in',1.2);assert.equal(f.handler('adjust').preflight({target:state.target,presetId:id,options:state.options}).code,'INVALID_PRESET');
  let value=f.layer.markers.keyValue(1);value.comment='My intro';value.duration=.1;value.setParameters({...value.getParameters(),review:'ok'});f.layer.markers.setValueAtTime(1.2,value);
  f.run('apply',f.args(id,{phase:'both',durationFrames:24}));
  assert.equal(f.layer.markers.keyValue(1).comment,'My intro');assert.equal(f.layer.markers.keyValue(1).getParameters().review,'ok');
  assert.deepEqual(position(f,2),[300,200]);
});

test('occupied cue times and duplicates reject the entire selection before mutation',async()=>{
  const f=await fixture();const other=new f.Layer(false);f.comp.layers.push(other);other.markers.setValueAtTime(.8,new f.MarkerValue('User marker'));
  const before=f.mutations;assert.equal(f.handler('apply').preflight(f.args(id,{durationFrames:24})).code,'INVALID_PRESET');assert.equal(f.mutations,before);assert.equal(f.layer.effects.numProperties,0);
  other.selected=false;f.run('apply',f.args(id,{phase:'both',durationFrames:24}));const owned=f.layer.markers.keyValue(1);f.layer.markers.setValueAtTime(1.3,owned);
  const duplicateBefore=f.mutations;assert.equal(f.handler('apply').preflight(f.args(id,{phase:'both',durationFrames:24})).code,'INVALID_PRESET');assert.equal(f.mutations,duplicateBefore);
});

test('short layers merge coincident In/Out into one cue and clamp crossed/outside cues',async()=>{
  for(const fps of [24,29.97,60]){
    const f=await fixture({fps});f.layer.inPoint=1;f.layer.outPoint=1+2/fps;
    f.run('apply',f.args(id,{phase:'both',durationFrames:600}));assert.equal(f.layer.markers.numKeys,1);assert.equal(roles(f)[0].role,'both');
    for(const t of [1,1+1/fps,1+2/fps])assert.ok(position(f,t).every(Number.isFinite));
    f.run('remove');assert.equal(f.layer.markers.numKeys,0);
  }
  const f=await fixture();f.run('apply',f.args(id,{phase:'both',durationFrames:24}));
  for(const [a,b]of [[3,1],[-2,7],[0,4]]){move(f,'in',a);move(f,'out',b);for(const t of [0,.5,2,3.5,4])assert.ok(position(f,t).every(Number.isFinite));}
});

test('deleted cue falls back to Duration and reapply recreates it without touching other markers',async()=>{
  const f=await fixture();const args=f.args(id,{phase:'both',durationFrames:24});f.run('apply',args);const before=position(f,.2);
  f.layer.markers.removeKey(1);assert.deepEqual(position(f,.2),before);f.run('apply',args);assert.deepEqual(roles(f).map(r=>r.role),['in','out']);
});

test('failed multi-layer apply restores moved cues, values, expressions and comments',async()=>{
  const f=await fixture();const args=f.args(id,{phase:'both',durationFrames:24});f.run('apply',args);move(f,'in',1.5);
  const before=structuredClone(f.layer.markers.keys),comment=f.layer.comment,sample=position(f,.3);
  const other=new f.Layer(false);other.sourceRectAtTime=()=>{throw new Error('injected source failure');};f.comp.layers.push(other);
  assert.throws(()=>f.run('apply',{...args,durationFrames:40}),/injected source failure/);
  assert.deepEqual(structuredClone(f.layer.markers.keys),before);assert.equal(f.layer.comment,comment);assert.deepEqual(position(f,.3),sample);assert.equal(other.markers.numKeys,0);
});

test('bake samples moved cues, releases only owned markers, and rolls back marker removal failure',async()=>{
  const f=await fixture();f.layer.markers.setValueAtTime(2,new f.MarkerValue('User cue'));f.run('apply',f.args(id,{phase:'both',durationFrames:24}));move(f,'in',1.5);
  const before=[0,.5,1,2,3.5,4].map(t=>position(f,t));f.run('bake');
  const p=f.layer.transform.property('ADBE Position');assert.equal(p.expression,'');assert.equal(f.layer.markers.numKeys,1);assert.equal(f.layer.markers.keyValue(1).comment,'User cue');
  assert.deepEqual([0,15,30,60,105,120].map(i=>[...p.keys[i].value]),before);
  const g=await fixture();g.run('apply',g.args(id,{phase:'both',durationFrames:24}));const original=g.layer.markers.removeKey.bind(g.layer.markers),state=structuredClone(g.layer.markers.keys),comment=g.layer.comment;
  let once=true;g.layer.markers.removeKey=index=>{if(once){once=false;throw new Error('injected marker failure');}original(index);};
  assert.throws(()=>g.run('bake'),/injected marker failure/);assert.equal(g.layer.comment,comment);assert.deepEqual(structuredClone(g.layer.markers.keys),state);assert.equal(g.layer.transform.property('ADBE Position').numKeys,0);assert.ok(g.layer.transform.property('ADBE Position').expressionEnabled);
});

test('text selectors follow owned cues while source text and unrelated transforms remain editable',async()=>{
  const f=await fixture({text:true});f.run('apply',f.args('premium-glyph-ribbon',{phase:'both',durationFrames:24}));
  const animator=f.layer.text.property('ADBE Text Animators').children[0],selector=animator.property('ADBE Text Selectors').property('Moti.on Timing').property('ADBE Text Expressible Amount');
  const before=[...selector.valueAtTime(.3,false,2,7)];move(f,'in',1.5);assert.notDeepEqual([...selector.valueAtTime(.3,false,2,7)],before);
  assert.equal(f.layer.sourceText,'Editable words\rSecond line');assert.equal(f.layer.transform.property('ADBE Position').expression,'');
  f.run('remove');assert.equal(f.layer.markers.numKeys,0);
});

test('continuous presets allocate no timing markers and capability fallback is explicit',async()=>{
  const f=await fixture({text:true});f.run('apply',f.args('studio-text-air-rhythm'));assert.equal(f.layer.markers.numKeys,0);
  f.run('remove');f.layer.markers.setValueAtTime=undefined;
  const result=f.run('apply',f.args(id));assert.equal(result.warnings[0].code,'CAPABILITY_UNAVAILABLE');assert.equal(f.meta().markerVersion,undefined);
});


test('marker budget includes all new owned cues and reuses budget when reapplying',async()=>{
  const f=await fixture();
  for(let i=0;i<248;i++)f.layer.markers.setValueAtTime(i/10000,new f.MarkerValue(`User cue ${i}`));
  const args=f.args(id,{phase:'both',durationFrames:24});
  f.run('apply',args);assert.equal(f.layer.markers.numKeys,250);assert.equal(roles(f).at(-1).role,'out');
  f.run('apply',args);assert.equal(f.layer.markers.numKeys,250,'owned cues are replaced within the same budget');
  f.run('remove');assert.equal(f.layer.markers.numKeys,248);
  f.layer.markers.setValueAtTime(.1,new f.MarkerValue('One more user cue'));
  const before=f.mutations;
  assert.equal(f.handler('apply').preflight(args).code,'INVALID_SELECTION_TYPE');
  assert.equal(f.mutations,before);assert.equal(f.layer.effects.numProperties,0);assert.equal(f.layer.markers.numKeys,249);
  f.run('apply',{...args,phase:'in'});assert.equal(f.layer.markers.numKeys,250);
  const beforeExpansion=f.mutations;
  assert.equal(f.handler('apply').preflight(args).code,'INVALID_SELECTION_TYPE');assert.equal(f.mutations,beforeExpansion);
  assert.deepEqual(roles(f).filter(r=>r.role).map(r=>r.role),['in']);
});

