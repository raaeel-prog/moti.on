import test from 'node:test';
import assert from 'node:assert/strict';
import {loadHostModules} from './host-harness.mjs';

const ERROR=Object.fromEntries(['INVALID_PRESET','NO_ACTIVE_COMP','NO_SELECTION','INVALID_SELECTION_TYPE','CAPABILITY_UNAVAILABLE','EXPRESSION_CONFLICT','KEYFRAME_CONFLICT','ROLLBACK_FAILED'].map(value=>[value,value]));
const defaults={operation:'shift',phase:'in',frames:3,order:'forward'};

async function fixture({fps=30,count=3}={}){
  let mutations=0;
  class MarkerValue {
    constructor(comment,params={}){Object.assign(this,{comment,params:{...params},duration:.1,label:7,chapter:'Chapter',url:'https://example.test/cue',frameTarget:'_blank',eventCuePoint:true,cuePointName:'Cue',protectedRegion:false});}
    getParameters(){return {...this.params};}
  }
  function clone(value){return Object.assign(new MarkerValue(value.comment),structuredClone(value));}
  class Markers {
    constructor(){this.keys=[];this.selected=false;}
    get numKeys(){return this.keys.length;}
    keyTime(index){return this.keys[index-1].time;}
    keyValue(index){return clone(this.keys[index-1].value);}
    keySelected(index){return this.keys[index-1].selected===true;}
    setSelectedAtKey(index,selected){this.keys[index-1].selected=selected;if(selected)this.selected=true;mutations++;}
    setValueAtTime(time,value){const prior=this.keys.findIndex(k=>Math.abs(k.time-time)<=1e-6);if(prior>=0)this.keys.splice(prior,1);this.keys.push({time,value:clone(value),selected:false});this.keys.sort((a,b)=>a.time-b.time);mutations++;}
    removeKey(index){this.keys.splice(index-1,1);mutations++;}
  }
  class Layer {
    constructor(index){
      Object.assign(this,{index,id:index,selected:true,locked:false,name:`Artwork ${index}`,startTime:0,inPoint:0,outPoint:10,comment:'Keep my comment',sourceText:'Editable words',keys:[{time:.4,value:[10,20]},{time:6,value:[90,80]}],expression:'// owned managed motion',expressionEnabled:true});
      this.meta={instance:`100-${index}`,markerVersion:1,markerDurationFrames:24,options:{phase:'both'},effects:[{name:`Moti.on ${index} · Duration`}]};
      this.control={value:24,numKeys:0,expression:''};
      this.effect={name:this.meta.effects[0].name,property:()=>this.control};
      this.effects={numProperties:1,property:()=>this.effect};
      this.markers=new Markers();this.markers.setValueAtTime(1+index/10,new MarkerValue(`In ${index}`,{'Moti.on.instance':this.meta.instance,'Moti.on.phase':'in',editor:'keep'}));this.markers.setValueAtTime(8+index/10,new MarkerValue(`Out ${index}`,{'Moti.on.instance':this.meta.instance,'Moti.on.phase':'out',editor:'also keep'}));
    }
    property(name){return name==='ADBE Marker'?this.markers:name==='ADBE Effect Parade'?this.effects:null;}
  }
  class CompItem {
    constructor(){Object.assign(this,{time:2,frameDuration:1/fps,layers:[]});}
    get selectedLayers(){return this.layers.filter(layer=>layer.selected).reverse();}
  }
  const comp=new CompItem();for(let i=1;i<=count;i++)comp.layers.push(new Layer(i));
  const app={project:{activeItem:comp}},library={metadata:layer=>layer.meta,verifyOwnership:layer=>layer.ownershipError??null};
  const scope=await loadHostModules(['src/registry.jsx','src/commands/preset-timing.jsx'],{app,CompItem,MotionContracts:{ERROR},MotionPresetLibrary:library});
  scope.MotionPresetLibrary=library;
  const handler=scope.MotionRegistry.get('ae.presets.timing');
  const args=overrides=>({...defaults,...overrides});
  const run=overrides=>{const input=args(overrides),error=handler.preflight(input);assert.equal(error,null,error?.message);return handler.run(input);};
  const read=(layer,phase)=>{const key=layer.markers.keys.find(k=>k.value.params['Moti.on.instance']===layer.meta?.instance&&k.value.params['Moti.on.phase']===phase);return key?{time:key.time,value:clone(key.value)}:null;};
  const move=(layer,phase,time)=>{const cue=read(layer,phase),index=layer.markers.keys.findIndex(k=>k.time===cue.time)+1;layer.markers.removeKey(index);layer.markers.setValueAtTime(time,cue.value);};
  const snapshot=()=>structuredClone(comp.layers.map(layer=>({markers:layer.markers.keys,markerPropertySelected:layer.markers.selected,meta:layer.meta,keys:layer.keys,expression:layer.expression,expressionEnabled:layer.expressionEnabled,sourceText:layer.sourceText,comment:layer.comment,startTime:layer.startTime,inPoint:layer.inPoint,outPoint:layer.outPoint,selected:layer.selected,control:layer.control})));
  mutations=0;
  return {app,comp,library,handler,args,run,read,move,snapshot,MarkerValue,Layer,get mutations(){return mutations;}};
}
function close(actual,expected){assert.ok(Math.abs(actual-expected)<1e-7,`${actual} != ${expected}`);}

test('shift moves only requested cues with frame-accurate offsets at 24, 29.97 and 60 fps',async()=>{
  for(const fps of [24,29.97,60])for(const phase of ['in','out'])for(const frames of [-3,3]){
    const f=await fixture({fps}),before=f.snapshot(),time=f.comp.time;
    f.run({phase,frames});
    f.comp.layers.forEach((layer,i)=>{
      close(f.read(layer,phase).time,before[i].markers.find(k=>k.value.params['Moti.on.phase']===phase).time+frames/fps);
      assert.deepEqual(structuredClone(f.read(layer,phase).value),before[i].markers.find(k=>k.value.params['Moti.on.phase']===phase).value);
      const unchanged=f.snapshot()[i];delete unchanged.markers;const expected={...before[i]};delete expected.markers;assert.deepEqual(unchanged,expected);
      assert.equal(f.read(layer,phase==='in'?'out':'in').time,before[i].markers.find(k=>k.value.params['Moti.on.phase']!==phase).time);
    });
    assert.equal(f.comp.time,time);
  }
});

test('align uses the playhead exactly while stagger uses stable timeline order and explicit frames',async()=>{
  for(const order of ['forward','reverse'])for(const phase of ['in','out']){
    const f=await fixture();f.comp.time=phase==='in'?2:7;
    f.run({operation:'align',phase,frames:137,order});for(const layer of f.comp.layers)assert.equal(f.read(layer,phase).time,f.comp.time);
    f.run({operation:'stagger',phase,frames:3,order});f.comp.layers.forEach((layer,i)=>close(f.read(layer,phase).time,f.comp.time+(order==='reverse'?2-i:i)*.1));
  }
  const f=await fixture();f.run({operation:'stagger',frames:-3});f.comp.layers.forEach((layer,i)=>close(f.read(layer,'in').time,2-i*.1));
});

test('no-op shift and repeated alignment perform no marker writes',async()=>{
  const f=await fixture();const zero=f.run({frames:0});assert.equal(zero.changed,false);assert.equal(zero.data.appliedCount,0);assert.equal(f.mutations,0);
  f.run({operation:'align'});const mutations=f.mutations,before=f.snapshot();const again=f.run({operation:'align'});assert.equal(again.changed,false);assert.equal(f.mutations,mutations);assert.deepEqual(f.snapshot(),before);
});

test('unknown, missing and malformed fields reject before touching Adobe state',async()=>{
  const f=await fixture();f.app.project=null;
  const invalid=[null,[],{},f.args({operation:'eval'}),f.args({phase:'both'}),f.args({frames:601}),f.args({frames:-601}),f.args({frames:1.5}),f.args({frames:NaN}),f.args({frames:'3'}),f.args({order:'invalid'}),f.args({path:'/tmp/evil.jsx'}),{operation:'align',phase:'in',frames:0}];
  for(const input of invalid)assert.equal(f.handler.preflight(input).code,'INVALID_PRESET');
  assert.equal(f.mutations,0);
});

test('absent comp, selection, host support, excessive selection, locked and unmanaged layers fail before mutation',async()=>{
  for(const [change,code] of [
    [f=>{f.app.project=null;},'NO_ACTIVE_COMP'],[f=>{f.comp.layers.forEach(l=>l.selected=false);},'NO_SELECTION'],
    [f=>{f.library.verifyOwnership=undefined;},'CAPABILITY_UNAVAILABLE'],[f=>{f.comp.layers[1].locked=true;},'INVALID_SELECTION_TYPE'],
    [f=>{f.comp.layers[1].meta=null;},'INVALID_SELECTION_TYPE'],[f=>{f.library.metadata=()=>{throw new Error('bad metadata');};},'INVALID_PRESET'],
    [f=>{f.comp.layers[1].ownershipError={code:'EXPRESSION_CONFLICT',message:'User expression',recoverable:true};},'EXPRESSION_CONFLICT'],
    [f=>{f.comp.frameDuration=NaN;},'CAPABILITY_UNAVAILABLE'],[f=>{f.comp.layers[1].markers.setValueAtTime=undefined;},'CAPABILITY_UNAVAILABLE']
  ]){const f=await fixture();change(f);const before=f.mutations;assert.equal(f.handler.preflight(f.args()).code,code);assert.equal(f.mutations,before);}
  const f=await fixture({count:51});assert.equal(f.handler.preflight(f.args()).code,'INVALID_SELECTION_TYPE');assert.equal(f.mutations,0);
});

test('changed or animated Duration is rejected without flattening controls',async()=>{
  for(const change of [l=>{l.control.value=48;},l=>{l.control.numKeys=2;},l=>{l.control.expression='time*10';},l=>{l.effect.name='renamed';}]){
    const f=await fixture();change(f.comp.layers[1]);const before=f.snapshot();assert.equal(f.handler.preflight(f.args()).code,'INVALID_SELECTION_TYPE');assert.equal(f.mutations,0);assert.deepEqual(f.snapshot(),before);
  }
});

test('missing, merged and duplicated owned cues reject the complete selection',async()=>{
  for(const [change,code]of [
    [l=>{l.markers.keys=l.markers.keys.filter(k=>k.value.params['Moti.on.phase']!=='in');},'INVALID_SELECTION_TYPE'],
    [l=>{l.markers.keys=l.markers.keys.filter(k=>k.value.params['Moti.on.phase']!=='out');},'INVALID_SELECTION_TYPE'],
    [l=>{l.markers.keys[0].value.params['Moti.on.phase']='both';},'INVALID_SELECTION_TYPE'],
    [l=>{const key=l.markers.keys[0];l.markers.setValueAtTime(2,key.value);},'INVALID_PRESET'],
    [l=>{l.meta.markerVersion=undefined;},'INVALID_SELECTION_TYPE']
  ]){const f=await fixture();change(f.comp.layers[1]);const before=f.mutations,snapshot=f.snapshot();assert.equal(f.handler.preflight(f.args()).code,code);assert.equal(f.mutations,before);assert.deepEqual(f.snapshot(),snapshot);}
});

test('occupied times, zero-length phase, layer bounds and phase overlap reject before any layer moves',async()=>{
  for(const [change,input]of [
    [f=>{f.comp.layers[1].markers.setValueAtTime(2,new f.MarkerValue('User cue'));},{operation:'align'}],
    [f=>{f.comp.time=0;},{operation:'align'}],
    [f=>{f.comp.time=10;},{operation:'align',phase:'out'}],
    [f=>{f.comp.time=-1;},{operation:'align'}],
    [f=>{f.comp.time=11;},{operation:'align',phase:'out'}],
    [f=>{f.comp.time=9;},{operation:'align'}],
    [f=>{f.comp.time=.8;},{operation:'align',phase:'out'}],
    [f=>{f.comp.time=8.2;},{operation:'align'}]
  ]){const f=await fixture();change(f);const before=f.snapshot(),mutations=f.mutations;assert.equal(f.handler.preflight(f.args(input)).code,'KEYFRAME_CONFLICT');assert.equal(f.mutations,mutations);assert.deepEqual(f.snapshot(),before);}
});

test('marker limit is bounded and user markers with matching comments are preserved',async()=>{
  const f=await fixture();const l=f.comp.layers[0];
  for(let i=0;i<248;i++)l.markers.setValueAtTime(.001+i*.001,new f.MarkerValue(i?'User cue':'Moti.on In'));
  const before=l.markers.keys.filter(k=>!k.value.params['Moti.on.phase']).map(k=>structuredClone(k));f.run({operation:'align'});assert.equal(l.markers.numKeys,250);
  assert.deepEqual(l.markers.keys.filter(k=>!k.value.params['Moti.on.phase']).map(k=>structuredClone(k)),before);
  l.markers.setValueAtTime(.4,new f.MarkerValue('Over limit'));const mutations=f.mutations;assert.equal(f.handler.preflight(f.args()).code,'INVALID_SELECTION_TYPE');assert.equal(f.mutations,mutations);
});

test('partial native write failure restores all moved cues including every MarkerValue field',async()=>{
  for(const afterWrite of [false,true]){
    const f=await fixture(),before=f.snapshot(),prop=f.comp.layers[1].markers,write=prop.setValueAtTime.bind(prop);let once=true;
    prop.setValueAtTime=(time,value)=>{if(once){once=false;if(afterWrite)write(time,value);throw new Error('injected native write failure');}write(time,value);};
    assert.throws(()=>f.run({operation:'align'}),/injected native write failure/);assert.deepEqual(f.snapshot(),before);
  }
});

test('native removal and marker-selection failures restore every target before surfacing the error',async()=>{
  for(const method of ['removeKey','setSelectedAtKey'])for(const afterMutation of [false,true]){
    const f=await fixture(),prop=f.comp.layers[1].markers;
    prop.setSelectedAtKey(1,true);
    const before=f.snapshot(),original=prop[method].bind(prop);let once=true;
    prop[method]=(...args)=>{if(once){once=false;if(afterMutation)original(...args);throw new Error(`injected ${method} failure`);}return original(...args);};
    assert.throws(()=>f.run({operation:'align'}),new RegExp(`injected ${method} failure`));
    assert.deepEqual(f.snapshot(),before);
  }
});

test('single-phase presets move the existing phase and reject the absent phase without mutation',async()=>{
  for(const phase of ['in','out']){
    const f=await fixture();
    for(const layer of f.comp.layers){layer.meta.options.phase=phase;layer.markers.keys=layer.markers.keys.filter(key=>key.value.params['Moti.on.phase']===phase);}
    f.comp.time=phase==='in'?2:7;
    f.run({operation:'align',phase});
    for(const layer of f.comp.layers){assert.equal(layer.markers.numKeys,1);assert.equal(f.read(layer,phase).time,f.comp.time);}
    const before=f.snapshot(),mutations=f.mutations;
    assert.equal(f.handler.preflight(f.args({phase:phase==='in'?'out':'in'})).code,'INVALID_SELECTION_TYPE');
    assert.deepEqual(f.snapshot(),before);assert.equal(f.mutations,mutations);
  }
});

test('failed rollback reports ROLLBACK_FAILED and successful earlier targets still restore',async()=>{
  const f=await fixture(),before=f.snapshot(),prop=f.comp.layers[1].markers;
  prop.setValueAtTime=()=>{throw new Error('persistent native failure');};
  assert.throws(()=>f.run({operation:'align'}),error=>error.motionCode==='ROLLBACK_FAILED');
  assert.deepEqual(f.snapshot()[0],before[0]);assert.deepEqual(f.snapshot()[2],before[2]);
});


test('marker key selections follow the moved cue and keep user marker selections on success and rollback',async()=>{
  for(const fail of [false,true]){
    const f=await fixture(),first=f.comp.layers[0],second=f.comp.layers[1];
    first.markers.setValueAtTime(1.5,new f.MarkerValue('Selected user cue'));
    first.markers.setSelectedAtKey(1,true);first.markers.setSelectedAtKey(2,true);
    second.markers.setSelectedAtKey(2,true);
    const before=f.snapshot();
    if(fail){const write=second.markers.setValueAtTime.bind(second.markers);let once=true;second.markers.setValueAtTime=(time,value)=>{if(once){once=false;throw new Error('selection rollback');}write(time,value);};assert.throws(()=>f.run({operation:'align'}),/selection rollback/);assert.deepEqual(f.snapshot(),before);}
    else {f.run({operation:'align'});assert.deepEqual(first.markers.keys.filter(k=>k.selected).map(k=>k.time),[1.5,2]);assert.equal(first.markers.selected,true);assert.deepEqual(second.markers.keys.filter(k=>k.selected).map(k=>k.time),[8.2]);assert.equal(f.comp.layers[2].markers.selected,false);}
  }
});

