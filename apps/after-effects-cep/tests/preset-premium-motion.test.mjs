import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { loadHostModules } from './host-harness.mjs';

const compiled = await build({
  stdin: { contents: 'export * from "./motion-library.ts"; export * from "./motion-library-math.ts";', resolveDir: fileURLToPath(new URL('../../../packages/contracts/src', import.meta.url)) },
  bundle: true, format: 'esm', platform: 'node', write: false
});
const contracts = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
const premium = contracts.MOTION_LIBRARY_PRESETS.filter(p => p.collection === 'premium' && !p.cameraSpec);
const TAG = '[Moti.on.library.v1]';
const errors = Object.fromEntries(['INVALID_PRESET', 'NO_ACTIVE_COMP', 'NO_SELECTION', 'INVALID_SELECTION_TYPE', 'CAPABILITY_UNAVAILABLE', 'EXPRESSION_CONFLICT', 'ROLLBACK_FAILED'].map(key => [key, key]));
const hostSource = await readFile(new URL('../host/src/commands/preset-library.jsx', import.meta.url), 'utf8');
const nativeEffectParameters = {
  'ADBE Slider Control': [1],
  'ADBE Gaussian Blur 2': [1, 3],
  'ADBE Turbulent Displace': [2, 3, 6],
  'Mettle SkyBox Chromatic Aberrat': [4, 6, 10, 11],
  'ADBE Tint': [1, 2, 3],
  'CHMS Motion Core': [1, 2, 3, 4, 5],
  'ADBE Brightness & Contrast 2': [2],
  'ADBE HUE SATURATION': [5],
  'ADBE Wave Warp': [2, 3],
  'ADBE Drop Shadow': [1, 2, 3, 4, 5],
  'ADBE Venetian Blinds': [1, 2, 3],
  'CC Composite': [3]
};

async function fixture({ fps = 30, height = 1080, text = false } = {}) {
  let nextId = 1, mutations = 0;
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
    canAddProperty(name) { return Object.hasOwn(nativeEffectParameters, name); }
    addProperty(name) {
      let p;
      if (this.matchName === 'ADBE Text Animator Properties') p = new Property(name, 0, this);
      else if (name === 'ADBE Text Animator') {
        p = new Group(name, this);
        p.children = ['ADBE Text Animator Properties', 'ADBE Text Selectors'].map(n => new Group(n, p));
      } else if (name === 'ADBE Text Expressible Selector') {
        p = new Group(name, this, {'ADBE Text Range Type2': 1, 'ADBE Text Expressible Amount': [100, 100, 100]});
      } else if (Object.hasOwn(nativeEffectParameters, name)) {
        const parameters = Object.fromEntries(nativeEffectParameters[name].map(index => [`${name}-${String(index).padStart(4, '0')}`, 0]));
        p = new Group(name, this, parameters);
        if (name === 'ADBE HUE SATURATION') p.children.push(new Group('ADBE Effect Built In Params', p, {'ADBE Effect Mask Opacity': 0}));
      }
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
      this.transform = new Group('ADBE Transform Group', this, {'ADBE Anchor Point': [50,50,0], 'ADBE Position': [300,200,0], 'ADBE Scale': [100,100,100], 'ADBE Rotate X': 0, 'ADBE Rotate Y': 0, 'ADBE Rotate Z': 0, 'ADBE Opacity': 100});
      if (isText) { this.sourceText = 'Editable words\rSecond line'; this.text = new Group('ADBE Text Properties', this); this.text.children.push(new Group('ADBE Text Animators', this.text)); }
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
  const args = (id, overrides = {}) => ({presetId: id, ...contracts.MOTION_LIBRARY_DEFAULTS, ...contracts.MOTION_LIBRARY_PRESETS.find(p => p.id === id)?.defaults, ...overrides});
  const run = (id, input = {}, locale = 'pt-BR') => { const error = handler(id).preflight(input); assert.equal(error, null, error?.message); return handler(id).run(input, {locale}); };
  const meta = () => JSON.parse(decodeURIComponent(layer.comment.split(TAG)[1]));
  return {comp, layer, Layer, run, handler, args, meta, get mutations() { return mutations; }};
}

function selector(f, role) {
  const a=f.layer.text.property('ADBE Text Animators').children.find(a=>a.name.endsWith(` · ${role}`));
  return a?.property('ADBE Text Selectors').property('Moti.on Timing').property('ADBE Text Expressible Amount');
}
function allExpressions(layer) {
  const result=[];
  function visit(group) { for(const p of group.children??[]) { if(p.expression)result.push(p);if(p.children)visit(p); } }
  visit(layer.effects);visit(layer.transform);if(layer.text)visit(layer.text);return result;
}
function close(actual,expected,label='sample') {
  const a=Array.isArray(actual)?actual:[actual],b=Array.isArray(expected)?expected:[expected];
  assert.equal(a.length,b.length,label);a.forEach((n,i)=>assert.ok(Math.abs(n-b[i])<1e-7,`${label}: ${n} != ${b[i]}`));
}

test('all premium recipes create evaluable expressions with finite endpoints and preserve source text',async()=>{
  assert.equal(premium.length,41);
  for(const p of premium){
    const f=await fixture({text:p.category.startsWith('text-')});const args=f.args(p.id,{phase:'both'});
    f.run('apply',args);const expressions=allExpressions(f.layer);assert.ok(expressions.length,p.id);
    for(const property of expressions)for(const time of [0,.1,.3,2,3.7,4])for(const unit of [0,1,6]){
      const sample=property.valueAtTime(time,false,unit,7);
      assert.ok((Array.isArray(sample)?sample:[sample]).every(Number.isFinite),`${p.id}/${property.matchName}/${time}`);
    }
    if(f.layer.text){
      assert.equal(f.layer.sourceText,'Editable words\rSecond line');
      assert.equal(f.layer.transform.property('ADBE Position').expression,'','text motion belongs to source animators');
      close(selector(f,'Movimento').valueAtTime(2),[0,0,0]);
    }else{
      const actual=f.layer.transform.property('ADBE Position').valueAtTime(2);
      close(actual,p.category==='motion-3d'?[300,200,0]:[300,200],p.id);
    }
    const count=f.layer.effects.numProperties,animators=f.layer.text?.property('ADBE Text Animators').numProperties;
    f.run('apply',args,'en-US');assert.equal(f.layer.effects.numProperties,count);
    if(f.layer.text)assert.equal(f.layer.text.property('ADBE Text Animators').numProperties,animators);
    f.run('remove');assert.equal(f.layer.effects.numProperties,0);assert.equal(f.layer.comment,'Keep this comment');
    assert.ok(f.layer.transform.children.every(p=>!p.expression));
    if(f.layer.text)assert.equal(f.layer.text.property('ADBE Text Animators').numProperties,0);
  }
});

test('host text vector selectors evaluate the same authored choreography as shared samples',async()=>{
  for(const id of ['premium-glyph-constellation','premium-glyph-stomp','premium-word-crossing','premium-line-swing']){
    const p=premium.find(p=>p.id===id),f=await fixture({text:true,height:2160});
    const args=f.args(id,{direction:'top',order:'reverse',seed:29});f.run('apply',args);
    for(const time of [.1,.4,.7])for(const rawIndex of [0,1,6]){
      const idx=contracts.librarySequence(rawIndex,7,'reverse');
      const u=contracts.libraryStudioTiming(time,0,4,args.durationFrames/30,args.phase,idx,7,args.staggerFrames/30,args.overlap);
      const w=2-contracts.libraryEase(u[0],p.easing,args.elasticity)-contracts.libraryEase(u[1],p.easing,args.elasticity);
      const expected=contracts.libraryChoreography(Math.max(0,Math.min(1,...u)),w,...p.position,p.choreography.path,p.choreography.distribution??'uniform',rawIndex,args.seed,p.choreography.turns??1,args.direction);
      close(selector(f,'Movimento').valueAtTime(time,false,rawIndex,7),expected.slice(0,3).map(n=>n*100/1080),id);
      if(selector(f,'Escala'))close(selector(f,'Escala').valueAtTime(time,false,rawIndex,7),[expected[4]*100,expected[5]*100,w*100]);
      if(selector(f,'Rotação'))close(selector(f,'Rotação').valueAtTime(time,false,rawIndex,7),expected[3]*100);
    }
  }
});

test('typewriter reveals discrete character states sequentially while leaving source editable',async()=>{
  const f=await fixture({text:true});f.run('apply',f.args('premium-typewriter'));
  const opacity=selector(f,'Opacidade'),states=[];
  for(let step=0;step<=100;step++){
    const row=Array.from({length:7},(_,unit)=>opacity.valueAtTime(step/100,false,unit,7));
    assert.ok(row.every(v=>v===0||v===100));states.push(row);
  }
  assert.ok(states.some(row=>row.includes(0)&&row.includes(100)),'characters reveal at distinct times');
  assert.ok(states[20].includes(0), 'first letter appears early instead of holding a blank title');
  assert.ok(states[80].includes(100), 'typing continues through the duration');
  assert.equal(f.layer.sourceText,'Editable words\rSecond line');
});

test('premium controls persist, validate, adjust and preserve user keyframes and unrelated effects',async()=>{
  const f=await fixture({text:true});const user=f.layer.effects.addProperty('ADBE Slider Control');user.name='My control';user.property(1).setValue(91);
  const layerPosition=f.layer.transform.property('ADBE Position');layerPosition.setValuesAtTimes([0,2],[[300,200],[500,200]]);
  f.run('apply',f.args('premium-glyph-constellation',{seed:27,order:'reverse'}));
  const state=f.run('inspect').data;assert.equal(state.options.seed,27);assert.equal(state.options.order,'reverse');
  const before=selector(f,'Movimento').valueAtTime(.1);
  f.run('adjust',{target:state.target,presetId:state.presetId,options:{...state.options,seed:28,order:'random'}});
  assert.notDeepEqual(selector(f,'Movimento').valueAtTime(.1),before);
  const after=f.run('inspect').data;assert.equal(after.options.seed,28);assert.equal(after.options.order,'random');
  const mutations=f.mutations;
  for(const invalid of [{seed:-1},{seed:10000},{seed:.5},{seed:NaN},{order:'host-code'}])assert.equal(f.handler('apply').preflight(f.args('premium-glyph-constellation',invalid)).code,'INVALID_PRESET');
  assert.equal(f.mutations,mutations);f.run('remove');assert.equal(layerPosition.numKeys,2);assert.equal(f.layer.effects.property(1),user);assert.equal(user.property(1).value,91);
});

test('legacy instances are read without migration and change expressions only after explicit Adjust',async()=>{
  const f=await fixture();f.run('apply',f.args('arc-arrival'));
  const metadata=f.meta();delete metadata.expressionVersion;
  f.layer.comment='Keep this comment\n'+TAG+encodeURIComponent(JSON.stringify(metadata));
  const position=f.layer.transform.property('ADBE Position'),source=position.expression;
  f.run('inspect');assert.equal(position.expression,source);assert.equal(f.meta().expressionVersion,undefined);
  const mutations=f.mutations;assert.equal(f.handler('apply').preflight(f.args('arc-arrival')).code,'EXPRESSION_CONFLICT');assert.equal(f.mutations,mutations);assert.equal(position.expression,source);
  const state=f.run('inspect').data;
  f.run('adjust',{target:state.target,presetId:state.presetId,options:{...state.options,direction:'left'}});
  assert.equal(f.meta().expressionVersion,2);assert.notEqual(position.expression,source);
  position.expression='value+[3,4]';const before=f.mutations;assert.equal(f.handler('remove').preflight({}).code,'EXPRESSION_CONFLICT');assert.equal(f.mutations,before);
});

