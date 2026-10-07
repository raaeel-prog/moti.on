import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { loadHostModules } from './host-harness.mjs';

const compiled = await build({
  entryPoints: [fileURLToPath(new URL('../../../packages/contracts/src/motion-library-camera.ts', import.meta.url))],
  bundle: true, format: 'esm', platform: 'node', write: false
});
const { MOTION_LIBRARY_CAMERA_PRESETS: catalog } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
const mathBuild = await build({
  entryPoints: [fileURLToPath(new URL('../../../packages/contracts/src/motion-library-math.ts', import.meta.url))],
  bundle: true, format: 'esm', platform: 'node', write: false
});
const { cameraImpactSample } = await import(`data:text/javascript;base64,${Buffer.from(mathBuild.outputFiles[0].text).toString('base64')}`);
const errorCodes = Object.fromEntries(['INVALID_PRESET', 'NO_ACTIVE_COMP', 'INVALID_SELECTION_TYPE', 'CAPABILITY_UNAVAILABLE', 'EXPRESSION_CONFLICT', 'ROLLBACK_FAILED'].map(key => [key, key]));
const defaults = { presetId: 'camera-zoom-soft', durationFrames: 24, intensity: 100 };
const effectProperties = {
  'Moti.on Native Transition': { 'Moti.on Native Transition-2001': 0, 'Moti.on Native Transition-2002': 1, 'Moti.on Native Transition-2003': 0, 'Moti.on Native Transition-2004': 0, 'Moti.on Native Transition-2005': 24 },
  "ADBE Camera Lens Blur": { "ADBE Camera Lens Blur-0001": 5, "ADBE Camera Lens Blur-0021": 1 },
  "ADBE Exposure2": { "ADBE Exposure2-0003": 0 },
  'ADBE Slider Control': { 'ADBE Slider Control-0001': 0 },
  'ADBE Geometry2': { 'ADBE Geometry2-0001': [320,180], 'ADBE Geometry2-0002': [320,180], 'ADBE Geometry2-0011': 1, 'ADBE Geometry2-0003': 100, 'ADBE Geometry2-0004': 100, 'ADBE Geometry2-0007': 0, 'ADBE Geometry2-0009': 1, 'ADBE Geometry2-0010': 0 },
  'ADBE Wave Warp': { 'ADBE Wave Warp-0001': 1, 'ADBE Wave Warp-0002': 10, 'ADBE Wave Warp-0003': 40, 'ADBE Wave Warp-0004': 90, 'ADBE Wave Warp-0005': 1, 'ADBE Wave Warp-0006': 1, 'ADBE Wave Warp-0007': 0, 'ADBE Wave Warp-0008': 1 },
  'ADBE Glo2': { 'ADBE Glo2-0002': 153, 'ADBE Glo2-0003': 10, 'ADBE Glo2-0004': 1 },
  'ADBE Gaussian Blur 2': { 'ADBE Gaussian Blur 2-0001': 0, 'ADBE Gaussian Blur 2-0003': 0 },
  'ADBE Tint': { 'ADBE Tint-0001': [0,0,0,1], 'ADBE Tint-0002': [1,1,1,1], 'ADBE Tint-0003': 100 },
  'ADBE Turbulent Displace': { 'ADBE Turbulent Displace-0002': 50, 'ADBE Turbulent Displace-0003': 100, 'ADBE Turbulent Displace-0006': 0 }
};

function fixture({ duration = 8, fps = 30, time = 4, selection = true } = {}) {
  let nextId = 1;
  const items = [];
  class Property {
    constructor(name, value) { this.name = name; this.matchName = name; this.value = value; this.numKeys = 0; this.canSetExpression = true; this.expression = ''; this.expressionEnabled = false; this.expressionError = ''; this.keys = []; }
    setValue(value) { assert.equal(this.numKeys, 0, 'animated control must never be flattened'); this.value = value; }
    valueAtTime() { return this.value; }
    setValuesAtTimes(times, values) { this.keys = times.map((time, i) => ({ time, value: values[i] })); this.numKeys = times.length; }
    setInterpolationTypeAtKey() {}
    removeKey(index) { this.keys.splice(index - 1, 1); this.numKeys = this.keys.length; }
  }
  class Group {
    constructor(name, properties = {}) { this.name = name; this.matchName = name; this.children = Object.entries(properties).map(([name, value]) => new Property(name, value)); }
    get numProperties() { return this.children.length; }
    property(key) { return typeof key === 'number' ? this.children[key - 1] : this.children.find(p => p.name === key || p.matchName === key); }
    addProperty(name) { const effect = new Group(name, effectProperties[name]); effect.remove = () => this.children.splice(this.children.indexOf(effect), 1); this.children.push(effect); return effect; }
    canAddProperty(name) { return Boolean(effectProperties[name]); }
  }
  class Markers {
    constructor() { this.keys = []; }
    get numKeys() { return this.keys.length; }
    setValueAtTime(time, value) { this.keys = this.keys.filter(k => Math.abs(k.time - time) > 1e-8); this.keys.push({ time, value }); this.keys.sort((a,b) => a.time - b.time); }
    keyValue(index) { return this.keys[index - 1].value; }
    keyTime(index) { return this.keys[index - 1].time; }
    removeKey(index) { this.keys.splice(index - 1, 1); }
  }
  class Layer {
    constructor(comp, source) { this.id = nextId++; this.containingComp = comp; this.source = source; this.name = 'User layer'; this.comment = ''; this.inPoint = 0; this.outPoint = comp.duration; this._startTime = 0; this.selected = false; this.locked = false; this.threeDLayer = false; this.adjustmentLayer = false; this.collapseTransformation = false; this.timeRemapEnabled = false; this.hasVideo = true; this.nullLayer = false; this.effects = new Group('ADBE Effect Parade'); this.markers = new Markers(); }
    property(name) { if(name === 'ADBE Effect Parade') return this.effects; if(name === 'ADBE Marker') return this.markers; throw new Error(`Unexpected mock lookup ${name}`); }
    get startTime() { return this._startTime; }
    set startTime(value) { const delta = value - this._startTime; this.markers.keys.forEach(k => k.time += delta); this.inPoint += delta; this.outPoint += delta; this._startTime = value; }
    moveToBeginning() { const list = this.containingComp.layerList; list.splice(list.indexOf(this), 1); list.unshift(this); }
    remove() { const list = this.containingComp.layerList; list.splice(list.indexOf(this), 1); }
  }
  class Item {
    constructor() { this.id = nextId++; this.comment = ''; items.push(this); }
    get usedIn() { return items.filter(item => item instanceof CompItem && item.layerList.some(layer => layer.source === this)); }
    remove() { items.splice(items.indexOf(this), 1); }
  }
  class CompItem extends Item {
    constructor(name, width, height, aspect, duration, fps) { super(); Object.assign(this, { name, width, height, pixelAspect: aspect, duration, frameRate: fps, frameDuration: 1 / fps, time: 0, layerList: [] }); this.layers = {
      add: source => { const layer = new Layer(this, source); this.layerList.unshift(layer); return layer; },
      addSolid: () => { const source = new Item(); const layer = new Layer(this, source); this.layerList.unshift(layer); return layer; }
    }; }
    get numLayers() { return this.layerList.length; }
    get selectedLayers() { return this.layerList.filter(layer => layer.selected); }
    layer(index) { return this.layerList[index - 1]; }
  }
  const comp = new CompItem('User composition', 640, 360, 1, duration, fps);
  comp.time = time;
  const footage = new Item();
  const original = comp.layers.add(footage);
  original.comment = 'Important user comment'; original.selected = selection;
  const app = { effects: Object.keys(effectProperties).map(matchName => ({ matchName })), project: { activeItem: comp, items: { addComp: (...args) => new CompItem(...args) } } };
  return { app, comp, original, items, CompItem, MarkerValue: function(comment) { this.comment = comment; this.duration = 0; }, KeyframeInterpolationType: { LINEAR: 1 }, CameraLayer: class {}, LightLayer: class {} };
}

async function load(options) {
  const f = fixture(options);
  const scope = await loadHostModules(['src/json.jsx', 'src/registry.jsx', 'generated/motion-library.jsx', 'src/commands/preset-camera-transition.jsx', 'src/commands/preset-library.jsx'], {
    ...f, MotionContracts: { ERROR: errorCodes }, MotionLibraryCore: {}, MotionLibraryCatalog: catalog
  });
  const camera = scope.MotionCameraTransition;
  function run(id, args = {}) { const handler = scope.MotionRegistry.get(id); const error = handler.preflight(args); assert.equal(error, null, error?.message); return handler.run(args, { locale: 'pt-BR' }); }
  function select(layer) { f.comp.layerList.forEach(l => l.selected = l === layer); }
  return { ...f, ...scope, camera, run, select };
}

test('camera timing preserves the exact CUT and a frame-based duration across rates, edges and short comps', async () => {
  const { camera } = await load();
  for(const fps of [24,25,29.97,30,50,60]) for(const frameCount of [2,3,20,24,600]) for(const compFrames of [2,11,240]) for(const center of [0, .0001, 2.143, compFrames/fps]) {
    const t = camera.timing(center, frameCount, 1/fps, compFrames/fps);
    assert.ok(t.start >= -1e-9 && t.end <= compFrames/fps + 1e-9);
    assert.ok(t.cut >= t.start - 1e-9 && t.cut <= t.end + 1e-9);
    assert.equal(t.cut,Math.max(0,Math.min(compFrames/fps,center)));
    assert.equal(t.frames, Math.min(frameCount, compFrames));
    assert.ok(Math.abs(t.end - t.start - t.frames/fps) < 1e-9);
  }
});

test('envelope is neutral at both boundaries, smooth, and reaches its peak at the movable CUT marker', async () => {
  const { camera } = await load();
  const meta = { instance: '123-45', controls: { durationFrames: 'duration', intensity: 'intensity' } };
  const source = `${camera.envelope(meta)}; w*amp`;
  const sample = (time, cut = 2.4, duration = 24, intensity = 100) => vm.runInNewContext(source, {
    time, inPoint: 2, outPoint: 2.8, thisComp: { frameDuration: 1/30 }, marker: { key: () => ({ time: cut }) },
    effect: name => () => name === 'duration' ? duration : intensity
  });
  for(const cut of [2.15,2.4,2.65]) {
    assert.equal(sample(2,cut), 0); assert.equal(sample(2.8,cut), 0); assert.equal(sample(cut,cut), 1);
    let previous = 0;
    for(let i=0;i<=100;i++) { const value=sample(2+(cut-2)*i/100,cut); assert.ok(value>=previous-1e-10); previous=value; }
    assert.ok(sample(2.00001,cut) < 1e-10);
    assert.ok(Math.abs(sample(cut-.00001,cut)-1)<1e-10);
  }
  assert.equal(sample(2.4,2.4,24,0),0);
  assert.equal(sample(2.4,2.4,24,300),3);
  assert.ok(sample(2.15,2.15)>sample(2.15,2.4));
});

test('invalid arguments and unavailable native effects fail before creating project items', async () => {
  const f=await load(); const before=f.items.length;
  for(const args of [ {...defaults,phase:'both'}, {...defaults,presetId:'arc-arrival'}, {...defaults,durationFrames:1}, {...defaults,durationFrames:601}, {...defaults,durationFrames:2.5}, {...defaults,durationFrames:Infinity}, {...defaults,intensity:-1}, {...defaults,intensity:301}, {...defaults,intensity:NaN} ]) assert.equal(f.camera.preflight(args).code,'INVALID_PRESET');
  f.app.effects=f.app.effects.filter(e=>e.matchName!=='ADBE Geometry2');
  assert.equal(f.camera.preflight(defaults).code,'CAPABILITY_UNAVAILABLE');
  assert.equal(f.items.length,before);
  f.app.project.activeItem=null;
  assert.equal(f.camera.preflight(defaults).code,'NO_ACTIVE_COMP');
});

test('all camera recipes create one short overlay above footage without moving user layers or selection', async () => {
  for(const preset of catalog) {
    const f=await load();
    const result=f.run('ae.presets.camera-transition',{...defaults,presetId:preset.id});
    const layer=f.comp.layer(1);
    assert.equal(result.data.created,true); assert.equal(result.data.appliedCount,1);
    assert.equal(layer.adjustmentLayer,true); assert.equal(layer.collapseTransformation,false);
    assert.equal(layer.source.numLayers,1); assert.equal(layer.source.layer(1).source===f.original.source,false);
    assert.equal(layer.property('ADBE Marker').keyValue(1).comment,'CUT');
    assert.ok(Math.abs(layer.property('ADBE Marker').keyTime(1)-4)<1e-8);
    assert.ok(Math.abs(layer.source.duration-.8)<1e-8);
    assert.equal(f.original.containingComp,f.comp); assert.equal(f.original.comment,'Important user comment');
    assert.equal(f.original.selected,true); assert.equal(layer.selected,false); assert.equal(f.comp.time,4);
    assert.equal(result.data.layerId,layer.id); assert.equal(result.data.precompId,layer.source.id);
  }
});

test('native camera transitions require the engine and never fall back to another appearance', async()=>{
  const f=await load();const before=f.items.length,args={...defaults,presetId:'camera-native-whip'};
  f.app.effects=f.app.effects.filter(e=>e.matchName!=='Moti.on Native Transition');
  assert.equal(f.camera.preflight(args).code,'CAPABILITY_UNAVAILABLE');assert.equal(f.items.length,before);
  // Existing Adobe recipes remain usable without the optional native engine.
  assert.equal(f.camera.preflight(defaults),null);
});

test('native recipes configure their ABI and unique bounded envelopes around CUT', async()=>{
  const samples=[];
  for(const p of catalog.filter(p=>p.cameraSpec?.native)) {
    const f=await load(),args={...defaults,presetId:p.id};f.run('ae.presets.camera-transition',args);
    const l=f.comp.layer(1),meta=f.camera.metadata(l),engine=l.effects.children.find(e=>e.matchName==='Moti.on Native Transition');
    assert.deepEqual(l.effects.children.map(e=>e.matchName),['ADBE Slider Control','ADBE Slider Control','Moti.on Native Transition']);
    assert.equal(engine.property(2).value,p.cameraSpec.native.style);assert.equal(engine.property(3).value,p.cameraSpec.native.angle);assert.equal(engine.property(5).value, [1,5].includes(p.cameraSpec.native.style)?64:p.cameraSpec.native.style===6?16:24);
    assert.equal(meta.nativeEngineVersion,1);assert.equal(meta.expressions.length,2);
    const evalAt=(index,time,intensity=100)=>vm.runInNewContext(engine.property(index).expression,{
      time,inPoint:l.inPoint,outPoint:l.outPoint,thisComp:{frameDuration:1/30},marker:{key:()=>({time:4})},
      effect:name=>()=>name===meta.controls.durationFrames?24:intensity
    });
    for(const intensity of [0,30,100,300]) {
      assert.equal(evalAt(1,l.inPoint,intensity),0);assert.equal(evalAt(1,l.outPoint,intensity),0);
      assert.equal(evalAt(1,4,intensity),Math.min(100,intensity));
      for(let i=0;i<=24;i++){const v=evalAt(1,l.inPoint+i/30,intensity);assert.ok(v>=0&&v<=100);}
    }
    assert.equal(evalAt(4,4),0);assert.equal(evalAt(4,3.8),-1);assert.equal(evalAt(4,4.2),1);
    assert.ok(Math.abs(evalAt(4,4-.001)+evalAt(4,4+.001))<1e-10);
    samples.push(evalAt(1,3.8));
    const repeat=f.run('ae.presets.camera-transition',{...args,intensity:40});assert.equal(repeat.data.created,false);
    f.select(l);assert.equal(f.camera.inspect(l).options.intensity,40);
  }
  assert.equal(new Set(samples.map(v=>v.toFixed(5))).size,6,'curves do not collapse to one repeated camera motion');
});

test('impact recipes build their effect stack and every expression equals the shared cameraImpactSample', async()=>{
  const impact=catalog.filter(p=>p.cameraSpec?.impact);
  assert.equal(impact.length,10);
  const seeds=new Set();
  for(const p of impact){
    const f=await load(),s=p.cameraSpec.impact;f.run('ae.presets.camera-transition',{...defaults,presetId:p.id});
    const l=f.comp.layer(1),meta=f.camera.metadata(l),fx=l.effects.children;
    const stack=[...(s.wave?['ADBE Wave Warp']:[]),...(p.effectAmount?['ADBE Gaussian Blur 2']:[]),'ADBE Geometry2',...(p.cameraSpec.exposure?['ADBE Exposure2']:[]),...(s.glow?['ADBE Glo2']:[])];
    assert.deepEqual(fx.filter(e=>e.matchName!=='ADBE Slider Control').map(e=>e.matchName),stack,p.id);
    const keys=['durationFrames','intensity','travel','angle','roll','frequency','damping','texture','seed','punch','zoom','shutter',...(p.effectAmount?['blur']:[]),...(p.cameraSpec.exposure?['exposure']:[]),...(s.glow?['glow']:[]),...(s.wave?['wave']:[])];
    assert.deepEqual(Object.keys(meta.controls),keys,p.id);
    assert.equal(meta.impactEngineVersion,1);
    const control=key=>fx.find(e=>e.name===meta.controls[key]).property(1).value,k=360/1080;
    assert.ok(Math.abs(control('travel')-s.travel*k)<1e-9&&control('angle')===s.angle&&control('roll')===s.roll&&control('texture')===s.texture&&control('shutter')===s.shutter);
    if(s.wave)assert.ok(Math.abs(control('wave')-s.wave*k)<1e-9);
    if(p.effectAmount)assert.ok(Math.abs(control('blur')-p.effectAmount*k)<1e-9);
    seeds.add(control('seed'));
    if(s.wave)assert.equal(fx.find(e=>e.matchName==='ADBE Wave Warp').property('ADBE Wave Warp-0006').value,2,'wave pins all edges');
    if(p.effectAmount)assert.equal(fx.find(e=>e.matchName==='ADBE Gaussian Blur 2').property('ADBE Gaussian Blur 2-0003').value,1);
    const geometry=fx.find(e=>e.matchName==='ADBE Geometry2');
    assert.equal(geometry.property('ADBE Geometry2-0009').value,0,'own shutter: works with comp motion blur off');
    assert.equal(geometry.property('ADBE Geometry2-0011').value,1);
    const values=Object.fromEntries(Object.entries(meta.controls).map(([key,name])=>[name,control(key)]));
    const evalAt=(record,time)=>{const prop=fx.find(e=>e.name===record.effect).property(record.property);return vm.runInNewContext(prop.expression,{
      time,inPoint:l.inPoint,outPoint:l.outPoint,value:prop.value,thisComp:{frameDuration:1/30,width:640,height:360},marker:{key:()=>({time:4})},effect:name=>()=>values[name]});};
    const expected=(record,time)=>{
      const fd=1/30,span=24*fd/2,age=time-4,u=Math.abs(age)<fd*.00001?1:Math.max(0,Math.min(1,time<4?(time-3.6)/.4:(4.4-time)/.4)),w=u*u*u*(u*(u*6-15)+10);
      const r=cameraImpactSample(age,w,span,fd,1,control('seed'),640,360,{hit:s.hit,attack:s.attack,angle:s.angle,travel:control('travel'),roll:s.roll,frequency:s.frequency,damping:s.damping,texture:s.texture,punch:s.punch,zoom:s.zoom,
        blur:p.effectAmount?control('blur'):0,exposure:p.cameraSpec.exposure??0,glow:s.glow,wave:s.wave?control('wave'):0});
      return {'ADBE Geometry2-0002':[320+r[0],180+r[1]],'ADBE Geometry2-0003':r[3],'ADBE Geometry2-0007':r[2],'ADBE Geometry2-0010':s.shutter*Math.min(1,w*20),
        'ADBE Gaussian Blur 2-0001':Math.max(0,r[4]),'ADBE Exposure2-0003':r[5],'ADBE Glo2-0004':Math.max(0,r[6]),
        'ADBE Wave Warp-0002':r[7],'ADBE Wave Warp-0004':s.angle+90,'ADBE Wave Warp-0007':r[8]}[record.property];
    };
    assert.equal(meta.expressions.length,4+(p.effectAmount?1:0)+(p.cameraSpec.exposure?1:0)+(s.glow?1:0)+(s.wave?3:0),p.id);
    for(const record of meta.expressions)for(let i=0;i<=24;i++){
      const time=3.6+i/30,actual=[evalAt(record,time)].flat(),want=[expected(record,time)].flat();
      want.forEach((v,j)=>assert.ok(Math.abs(actual[j]-v)<1e-9,`${p.id} ${record.property} @${time}: ${actual[j]} vs ${v}`));
    }
    // Both window edges render the untouched frame.
    for(const time of [l.inPoint,l.outPoint]){
      const record=property=>meta.expressions.find(r=>r.property===property);
      assert.deepEqual([...evalAt(record('ADBE Geometry2-0002'),time)].map(v=>Math.round(v*1e9)/1e9),[320,180]);
      assert.ok(Math.abs(evalAt(record('ADBE Geometry2-0003'),time)-100)<1e-9);
      assert.ok(Math.abs(evalAt(record('ADBE Geometry2-0010'),time))<1e-9,'no motion blur on the untouched edge frames');
    }
    // Panel adjustment, inspection and bake stay generic.
    const repeat=f.run('ae.presets.camera-transition',{...defaults,presetId:p.id,intensity:55});assert.equal(repeat.data.created,false);
    f.select(l);assert.equal(f.camera.inspect(l).state,'ready');assert.equal(f.camera.inspect(l).options.intensity,55);
  }
  assert.equal(seeds.size,1,'fresh fixtures share layer ids; variation follows the instance layer');
});

test('impact recipes require only the effects they use and fail before creating items', async()=>{
  for(const [missing,presetId] of [['ADBE Wave Warp','camera-impact-shockwave'],['ADBE Glo2','camera-impact-flash'],['ADBE Exposure2','camera-impact-double'],['ADBE Gaussian Blur 2','camera-impact-zoom-through']]){
    const f=await load(),before=f.items.length;f.app.effects=f.app.effects.filter(e=>e.matchName!==missing);
    const error=f.camera.preflight({...defaults,presetId});
    assert.equal(error.code,'CAPABILITY_UNAVAILABLE');assert.match(error.message,new RegExp(missing));assert.equal(f.items.length,before);
    assert.equal(f.camera.preflight({...defaults,presetId:'camera-impact-punch'}),null,`${missing} is not needed by the plain punch`);
  }
});

test('native ABI mismatch rolls back creation and refuses modification of existing instances',async()=>{
  const f=await load(),args={...defaults,presetId:'camera-native-prism'},before=f.items.length;
  const schema=effectProperties['Moti.on Native Transition'],saved=schema['Moti.on Native Transition-2005'];
  delete schema['Moti.on Native Transition-2005'];
  try{assert.throws(()=>f.camera.apply(args,{locale:'en-US'}),e=>e.motionCode==='CAPABILITY_UNAVAILABLE');assert.equal(f.items.length,before);assert.equal(f.comp.numLayers,1);}
  finally{schema['Moti.on Native Transition-2005']=saved;}
  f.run('ae.presets.camera-transition',args);const l=f.comp.layer(1);f.select(l);
  const engine=l.effects.children.find(e=>e.matchName==='Moti.on Native Transition');engine.children.pop();
  assert.equal(f.camera.preflight(args).code,'CAPABILITY_UNAVAILABLE');
});

test('Apply works without selection and repeats reuse the same overlay at the same CUT', async () => {
  const f=await load({selection:false});
  const first=f.run('ae.presets.camera-transition',defaults); const itemCount=f.items.length;
  const second=f.run('ae.presets.camera-transition',{...defaults,intensity:65});
  assert.equal(second.data.created,false); assert.equal(second.data.layerId,first.data.layerId);
  assert.equal(f.comp.numLayers,2); assert.equal(f.items.length,itemCount); assert.equal(f.comp.selectedLayers.length,0);
  f.comp.time=5;
  const third=f.run('ae.presets.camera-transition',defaults);
  assert.equal(third.data.created,true); assert.notEqual(third.data.layerId,first.data.layerId);
});

test('selected overlays adjust at their CUT without following the playhead and preserve keyed controls', async () => {
  const f=await load();f.run('ae.presets.camera-transition',defaults);const layer=f.comp.layer(1);f.select(layer);f.comp.time=6;
  f.run('ae.presets.camera-transition',{...defaults,durationFrames:30,intensity:75});
  assert.equal(f.comp.numLayers,2);assert.ok(Math.abs(layer.property('ADBE Marker').keyTime(1)-4)<1e-8);assert.equal(f.comp.time,6);
  const meta=f.camera.metadata(layer),control=layer.effects.property(meta.controls.intensity).property(1);
  control.setValuesAtTimes([3.5,4.5],[40,90]);
  const before=JSON.stringify(control.keys);
  assert.equal(f.camera.preflight(defaults).code,'EXPRESSION_CONFLICT');
  assert.equal(JSON.stringify(control.keys),before);
});

test('locked managed overlays, different presets and mixed removal selections reject without mutation', async () => {
  const f=await load();f.run('ae.presets.camera-transition',defaults);const layer=f.comp.layer(1);f.select(layer);
  layer.locked=true;assert.equal(f.camera.preflight(defaults).code,'INVALID_SELECTION_TYPE');layer.locked=false;
  assert.equal(f.camera.preflight({...defaults,presetId:'camera-spin-left'}).code,'EXPRESSION_CONFLICT');
  f.original.selected=true;
  assert.equal(f.MotionRegistry.get('ae.presets.remove').preflight({}).code,'INVALID_SELECTION_TYPE');
  assert.equal(f.comp.numLayers,2);
});

test('existing inspector and adjust commands use camera controls and reject stale marker fingerprints', async () => {
  const f=await load();f.run('ae.presets.camera-transition',defaults);const layer=f.comp.layer(1);f.select(layer);
  const state=f.run('ae.presets.inspect').data;assert.equal(state.cameraTransition,true);assert.equal(state.state,'ready');assert.equal(state.options.durationFrames,24);
  const args={target:state.target,presetId:state.presetId,options:{...state.options,intensity:65}};
  f.run('ae.presets.adjust',args);assert.equal(f.run('ae.presets.inspect').data.options.intensity,65);
  assert.equal(f.MotionRegistry.get('ae.presets.adjust').preflight(args).code,'INVALID_PRESET');
  const current=f.run('ae.presets.inspect').data;
  const markers=layer.property('ADBE Marker');const marker=markers.keyValue(1);markers.removeKey(1);markers.setValueAtTime(4.1,marker);
  assert.equal(f.MotionRegistry.get('ae.presets.adjust').preflight({target:current.target,presetId:current.presetId,options:current.options}).code,'INVALID_PRESET');
});

test('existing remove command deletes only the owned timeline overlay while retaining project sources', async () => {
  const f=await load();const before=f.items.length;f.run('ae.presets.camera-transition',defaults);f.select(f.comp.layer(1));
  const result=f.run('ae.presets.remove');assert.equal(result.data.appliedCount,1);assert.equal(f.comp.numLayers,1);assert.equal(f.comp.layer(1),f.original);assert.equal(f.items.length,before+2);
});

test('source-sharing in the same comp blocks duration edits and preserves the other instance', async () => {
  const f=await load();f.run('ae.presets.camera-transition',defaults);const layer=f.comp.layer(1);
  const duplicate=f.comp.layers.add(layer.source);f.select(layer);
  assert.equal(layer.source.usedIn.length,1,'one using composition contains two source instances');
  const duration=layer.source.duration;
  assert.equal(f.camera.preflight({...defaults,durationFrames:40}).code,'INVALID_SELECTION_TYPE');
  assert.equal(duplicate.source.duration,duration);
  assert.equal(f.camera.preflight({...defaults,intensity:60}),null);
  duplicate.remove();
  layer.source.layers.add(f.original.source);
  assert.equal(f.camera.preflight(defaults).code,'INVALID_SELECTION_TYPE','custom precomp contents cannot be resized');
});

test('baking delegates through the preset lifecycle and protects baked animation from adjustment', async () => {
  const f=await load();f.run('ae.presets.camera-transition',defaults);const layer=f.comp.layer(1);f.select(layer);
  const meta=f.camera.metadata(layer);const records=meta.expressions.map(r=>layer.effects.property(r.effect).property(r.property));
  const baked=f.run('ae.presets.bake');assert.equal(baked.data.appliedCount,1);
  for(const property of records) { assert.equal(property.expression,'');assert.ok(property.numKeys>=25); }
  assert.equal(f.camera.preflight(defaults).code,'EXPRESSION_CONFLICT');
  assert.equal(f.run('ae.presets.inspect').data.state,'conflict');
  f.run('ae.presets.remove');assert.equal(f.comp.numLayers,1);assert.equal(f.comp.layer(1),f.original);
});

test('an unavailable native parameter rolls creation back and restores original selection/time', async () => {
  const f=await load();const count=f.items.length;const saved=effectProperties['ADBE Geometry2']['ADBE Geometry2-0007'];
  delete effectProperties['ADBE Geometry2']['ADBE Geometry2-0007'];
  try {
    assert.equal(f.camera.preflight(defaults),null,'effect is present but its required parameter is missing');
    assert.throws(()=>f.camera.apply(defaults,{locale:'pt-BR'}),/Parâmetro nativo indisponível/);
    assert.equal(f.items.length,count);assert.equal(f.comp.numLayers,1);assert.equal(f.comp.layer(1),f.original);assert.equal(f.original.selected,true);assert.equal(f.comp.time,4);
  } finally { effectProperties['ADBE Geometry2']['ADBE Geometry2-0007']=saved; }
});

test('Lens Blur fallback is explicit, localized, and still requires Gaussian availability', async () => {
  const f=await load();
  const args={...defaults,presetId:'camera-spec-blur-lens'};
  f.app.effects=f.app.effects.filter(effect=>effect.matchName!=='ADBE Camera Lens Blur');
  const result=f.run('ae.presets.camera-transition',args);
  assert.equal(result.warnings[0].code,'LENS_BLUR_FALLBACK');
  assert.match(result.warnings[0].message,/gaussiano/);
  assert.ok(f.comp.layer(1).effects.children.some(effect=>effect.matchName==='ADBE Gaussian Blur 2'));
  const english=f.camera.apply(args,{locale:'en-US'});
  assert.match(english.warnings[0].message,/Gaussian/);
  f.app.effects=f.app.effects.filter(effect=>effect.matchName!=='ADBE Gaussian Blur 2');
  assert.equal(f.camera.preflight(args).code,'CAPABILITY_UNAVAILABLE');
});

test('camera adjustment rejects multiple or mixed selected overlays before mutation', async()=>{
  const f=await load();f.run('ae.presets.camera-transition',defaults);const l=f.comp.layer(1);f.select(l);f.original.selected=true;
  const before=JSON.stringify(f.camera.metadata(l));
  assert.equal(f.camera.preflight({...defaults,intensity:50}).code,'INVALID_SELECTION_TYPE');
  assert.equal(JSON.stringify(f.camera.metadata(l)),before);
});

test('camera bake rollback restores underlying values after partial key creation',async()=>{
  const f=await load();f.run('ae.presets.camera-transition',defaults);const l=f.comp.layer(1);f.select(l);
  const m=f.camera.metadata(l),props=m.expressions.map(r=>l.effects.property(r.effect).property(r.property));
  const p=props[0],original=p.value,expression=p.expression;
  p.valueAtTime=(time,pre)=>pre?original:123;
  p.setValuesAtTimes=function(times,values){this.keys=times.map((time,i)=>({time,value:values[i]}));this.numKeys=this.keys.length;this.value=values[0];};
  props[1].setValuesAtTimes=()=>{throw new Error('injected camera bake failure');};
  assert.throws(()=>f.run('ae.presets.bake'),/injected camera bake failure/);
  assert.equal(p.value,original);assert.equal(p.expression,expression);assert.equal(p.expressionEnabled,true);assert.equal(p.numKeys,0);
});

