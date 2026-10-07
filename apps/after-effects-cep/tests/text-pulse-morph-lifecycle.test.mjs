import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PULSE_PRESETS, pulsePresetArgs } from '../../../packages/contracts/dist/text-effects.js';
import { loadHostModules } from './host-harness.mjs';

const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const errors = Object.fromEntries(['INVALID_PRESET','NO_ACTIVE_COMP','INVALID_SELECTION_TYPE','NO_SELECTION','CAPABILITY_UNAVAILABLE','EXPRESSION_CONFLICT','KEYFRAME_CONFLICT','ROLLBACK_FAILED','TRACK_CONFLICT','HOST_OPERATION_FAILED'].map(key => [key,key]));

async function fixture() {
  let nextId = 1;
  const faults = {};
  class Property {
    constructor(parent,name,value) { Object.assign(this,{parent,name,matchName:name,_value:clone(value),expression:'',expressionEnabled:false,canSetExpression:true,expressionError:'',keys:[]}); }
    get owner(){let p=this.parent;while(p&&!p.groups)p=p.parent;return p;}
    get propertyIndex(){return this.parent.items.indexOf(this)+1;}
    get numKeys(){return this.keys.length;}
    get value(){return this.linkedLayer?this.linkedLayer.index:clone(this._value);}
    setValue(value){if(faults.write===this){delete faults.write;throw Error('injected control write');}if(this.parent.matchName==='ADBE Layer Control')this.linkedLayer=this.owner.comp.layer(value);this._value=clone(value);}
    valueAtTime(_time,preExpression=false){if(!preExpression&&this.matchName==='ADBE Vector Shape'&&this.expression.includes('k<16'))return {vertices:Array.from({length:16},()=>[0,0]),inTangents:Array.from({length:16},()=>[0,0]),outTangents:Array.from({length:16},()=>[0,0]),closed:false};return this.value;}
    setValueAtTime(time,value){if(faults.keysWrite===this){delete faults.keysWrite;throw Error('injected keyframe write');}this.keys.push({time,value:clone(value)});}
    setValuesAtTimes(times,values){for(let i=0;i<times.length;i++)this.setValueAtTime(times[i],values[i]);}
    keyTime(i){return this.keys[i-1].time;}
    keyValue(i){return clone(this.keys[i-1].value);}
    keyInInterpolationType(){return 'LINEAR';}
    keyOutInterpolationType(){return 'LINEAR';}
    setInterpolationTypeAtKey(){}
    keyInTemporalEase(){return [];}
    keyOutTemporalEase(){return [];}
    keyTemporalContinuous(){return false;}
    keyTemporalAutoBezier(){return false;}
    setTemporalEaseAtKey(){}
    setTemporalContinuousAtKey(){}
    setTemporalAutoBezierAtKey(){}
    removeKey(i){this.keys.splice(i-1,1);}
  }
  class Group {
    constructor(parent,name){Object.assign(this,{parent,name,matchName:name,items:[]});}
    get numProperties(){return this.items.length;}
    get propertyIndex(){return this.parent.items.indexOf(this)+1;}
    property(key){return typeof key==='number'?this.items[key-1]:this.items.find(p=>p.name===key||p.matchName===key);}
    prop(name,value){const p=new Property(this,name,value);this.items.push(p);return p;}
    group(name){const p=new Group(this,name);this.items.push(p);return p;}
    canAddProperty(){return true;}
    addProperty(name){const g=this.group(name);
      if(['ADBE Slider Control','ADBE Color Control','ADBE Layer Control'].includes(name))g.prop(name+'-0001',name==='ADBE Color Control'?[1,1,1,1]:0);
      if(name==='ADBE Vector Group'){g.group('ADBE Vectors Group');const t=g.group('ADBE Vector Transform Group');for(const [key,value]of Object.entries({'ADBE Vector Anchor':[0,0],'ADBE Vector Position':[0,0],'ADBE Vector Scale':[100,100],'ADBE Vector Rotation':0,'ADBE Vector Skew':0,'ADBE Vector Group Opacity':100}))t.prop(key,value);}
      if(name==='ADBE Vector Shape - Group')g.prop('ADBE Vector Shape',{vertices:[[0,0],[1,1]],inTangents:[[0,0],[0,0]],outTangents:[[0,0],[0,0]],closed:true});
      if(name==='ADBE Vector Filter - Merge')g.prop('ADBE Vector Merge Type',1);
      if(name==='ADBE Vector Graphic - Fill')for(const[key,value]of Object.entries({'ADBE Vector Fill Color':[1,1,1],'ADBE Vector Fill Opacity':100,'ADBE Vector Fill Rule':1}))g.prop(key,value);
      if(name==='ADBE Vector Graphic - Stroke')for(const[key,value]of Object.entries({'ADBE Vector Stroke Color':[1,1,1],'ADBE Vector Stroke Opacity':100,'ADBE Vector Stroke Width':1}))g.prop(key,value);
      if(name==='ADBE Ramp')for(const[key,value]of Object.entries({'ADBE Ramp-0001':[0,0],'ADBE Ramp-0002':[0,0,0,1],'ADBE Ramp-0003':[0,100],'ADBE Ramp-0004':[1,1,1,1],'ADBE Ramp-0005':1,'ADBE Ramp-0006':0,'ADBE Ramp-0007':0}))g.prop(key,value);
      if(name==='ADBE Glo2')for(const[key,value]of Object.entries({'ADBE Glo2-0002':60,'ADBE Glo2-0003':10,'ADBE Glo2-0004':1,'ADBE Glo2-0007':1}))g.prop(key,value);
      return g;
    }
    remove(){this.parent.items.splice(this.parent.items.indexOf(this),1);}
  }
  class Layer {
    constructor(comp,kind){Object.assign(this,{comp,containingComp:comp,id:nextId++,name:'Text',comment:'User note',enabled:true,selected:false,locked:false,parent:null,inPoint:0,outPoint:4,threeDLayer:false,motionBlur:false,blendingMode:1,groups:[]});
      const fx=new Group(this,'ADBE Effect Parade'),tr=new Group(this,'ADBE Transform Group'),mask=new Group(this,'ADBE Mask Parade');this.groups.push(fx,tr,mask);
      for(const[key,value]of Object.entries({'ADBE Anchor Point':[0,0],'ADBE Position':[20,40],'ADBE Scale':[100,100],'ADBE Rotate Z':0,'ADBE Opacity':100}))tr.prop(key,value);
      if(kind==='shape')this.groups.push(new Group(this,'ADBE Root Vectors Group'));
      if(kind==='text'){const t=new Group(this,'ADBE Text Properties');const d={text:'A',font:'Fixture',fontSize:100,tracking:0,justification:1,leading:120,autoLeading:false,horizontalScale:100,verticalScale:100,baselineShift:0,fauxBold:false,fauxItalic:false,allCaps:false,smallCaps:false,applyFill:true,fillColor:[1,1,1],applyStroke:false,boxText:false,baselineLocs:[0,0,60,0]};d.characterRange=()=>({...d});const p=t.prop('ADBE Text Document',d);p._value=d;p.valueAtTime=()=>d;Object.defineProperty(p,'value',{get:()=>d});t.group('ADBE Text Animators');this.groups.push(t);}
    }
    get index(){if(this.deleted)throw Error('deleted native layer');return this.comp.items.indexOf(this)+1;}
    get numProperties(){return this.groups.length;}
    property(key){return typeof key==='number'?this.groups[key-1]:this.groups.find(g=>g.matchName===key);}
    moveBefore(other){this.comp.items.splice(this.comp.items.indexOf(this),1);this.comp.items.splice(this.comp.items.indexOf(other),0,this);}
    duplicate(){const l=new Layer(this.comp,'null');l.isBackup=true;for(const key of ['name','comment','enabled','parent','inPoint','outPoint','motionBlur','blendingMode','pulseRole'])l[key]=this[key];const copy=(p,parent)=>{if(p instanceof Group){const g=new Group(parent,p.matchName);g.name=p.name;g.items=p.items.map(child=>copy(child,g));return g;}const q=new Property(parent,p.matchName,p._value);q.name=p.name;q.expression=p.expression;q.expressionEnabled=p.expressionEnabled;q.keys=clone(p.keys);q.linkedLayer=p.linkedLayer;return q;};l.groups=this.groups.map(g=>copy(g,l));this.comp.items.splice(this.index-1,0,l);return l;}
    remove(){if(this.isBackup&&faults.cleanupAfter!==undefined){if(faults.cleanupAfter--===0){delete faults.cleanupAfter;throw Error('injected backup cleanup');}}if(faults.remove===this){delete faults.remove;throw Error('injected layer removal');}const index=this.comp.items.indexOf(this);if(index<0)throw Error('deleted native layer');this.comp.items.splice(index,1);this.deleted=true;}
  }
  class CompItem {
    constructor(){Object.assign(this,{items:[],time:.25,frameDuration:1/30,workAreaStart:0,workAreaDuration:1});this.layers={addNull:()=>this.add('null'),addShape:()=>this.add('shape')};}
    add(kind){const l=new Layer(this,kind);this.items.unshift(l);return l;}
    get numLayers(){return this.items.length;}
    get selectedLayers(){return this.items.filter(l=>l.selected);}
    layer(i){return this.items[i-1];}
  }
  class Shape{}
  const comp=new CompItem(),source=comp.add('text');source.selected=true;
  const scope=await loadHostModules(['src/registry.jsx','src/morph-geometry.jsx'],{MotionJson:JSON});
  scope.MotionRegistry.register('ae.text.vertical-pulse',{preflight:()=>null,run:()=>null});
  const contour={vertices:[[0,-40],[50,-40],[50,40],[0,40]],inTangents:[[0,0],[0,0],[0,0],[0,0]],outTangents:[[0,0],[0,0],[0,0],[0,0]],closed:true};
  const fixtureGlyph={textIndex:1,sourceIndex:0,character:'A',center:[25,0],bounds:{left:0,top:-40,width:50,height:80},contours:[contour]};
  const hostGlobals={...scope,CompItem,Shape,KeyframeInterpolationType:{LINEAR:'LINEAR'},app:{project:{activeItem:comp,numItems:0}},MotionJson:JSON,MotionContracts:{ERROR:errors,PULSE_PRESETS},MotionVerticalPulseLegacy:{readMeta:()=>null},MotionTextGlyphOutlines:{extract:()=>({glyphs:[fixtureGlyph],vertexCount:4}),bounds:()=>fixtureGlyph.bounds}};
  const moduleSource=await readFile(new URL('../host/src/commands/text-pulse-morph.jsx',import.meta.url),'utf8');
  const factory=new Function('$',...Object.keys(hostGlobals),moduleSource);factory({global:hostGlobals},...Object.values(hostGlobals));
  const host=hostGlobals.MotionPulseMorph,handler=scope.MotionRegistry.get('ae.text.vertical-pulse'),reader=scope.MotionRegistry.get('ae.text.vertical-pulse.read');
  const run=args=>{assert.equal(handler.preflight(args),null);return handler.run(args);};
  const m=()=>host.meta(source),controller=()=>comp.items.find(l=>l.id===m().controllerId),member=role=>comp.items.find(l=>host.meta(l)?.role===role),control=key=>controller().property('ADBE Effect Parade').property(host.controlName(key)).property(1);
  return {comp,source,faults,host,handler,reader,run,meta:m,controller,member,control,doc:()=>source.property('ADBE Text Properties').property('ADBE Text Document').value};
}

test('V4 creation, repeated apply, read and complete removal retain original source',async()=>{
  const f=await fixture(),a=pulsePresetArgs('impact',30),doc=f.doc();f.run(a);assert.equal(f.comp.numLayers,4);const ids=f.comp.items.map(l=>l.id);assert.equal(f.reader.run({}).data.rigVersion,4);assert.equal(f.run(a).changed,false);assert.deepEqual(f.comp.items.map(l=>l.id),ids);assert.equal(f.doc(),doc);f.run({action:'remove'});assert.deepEqual(f.comp.items,[f.source]);assert.equal(f.source.enabled,true);assert.equal(f.source.comment,'User note');
});

test('Apply preserves previous controls when a later native setValue fails',async()=>{
  const f=await fixture();f.run(pulsePresetArgs('impact',30));const old=f.reader.run({}).data.controls;f.faults.write=f.control('peakScalePercent');const next={...old,durationFrames:60,peakScalePercent:420};assert.throws(()=>f.run(next),/injected control write/);assert.deepEqual(f.reader.run({}).data.controls,old);
});

test('adding sparks then failing metadata commit rolls back without deleted references',async()=>{
  const f=await fixture();f.run(pulsePresetArgs('impact',30));const old=f.source.comment;let first=true;Object.defineProperty(f.source,'comment',{get:()=>old,set:()=>{if(first){first=false;throw Error('injected metadata commit');}}});assert.throws(()=>f.run(pulsePresetArgs('electric',30)),error=>error.message==='injected metadata commit');assert.equal(f.comp.numLayers,4);assert.equal(f.reader.run({}).data.preset,'impact');
});

test('Remove rollback reconnects electric sparks to the recovered matter',async()=>{
  const f=await fixture();f.run(pulsePresetArgs('electric',30));f.faults.remove=f.controller();assert.throws(()=>f.run({action:'remove'}),/injected layer removal/);assert.equal(f.comp.numLayers,5);assert.equal(f.reader.run({}).data.rigVersion,4);const link=f.member('sparks').property('ADBE Effect Parade').property('Moti.on Pulse · Matter').property(1);assert.equal(link.linkedLayer,f.member('matter'));
});

test('Update keeps controller identity, time, animated controls and original document',async()=>{
  const f=await fixture();f.run(pulsePresetArgs('plasma',30));const controller=f.controller(),start=controller.inPoint;f.control('glow').setValueAtTime(.25,20);f.control('glow').setValueAtTime(1,80);const keys=clone(f.control('glow').keys);f.doc().fontSize=120;assert.equal(f.reader.run({}).data.stale,true);f.run({action:'update',renderer:'morph'});assert.equal(f.controller(),controller);assert.equal(controller.inPoint,start);assert.deepEqual(f.control('glow').keys,keys);assert.equal(f.reader.run({}).data.stale,false);assert.equal(f.comp.time,.25);
});


test('Bake budget counts the sixteen evaluated vertices in every spark path',async()=>{
  const f=await fixture();f.run(pulsePresetArgs('electric',30));const plan=f.host.prepare({action:'bake'});assert.equal(plan.error,undefined);const budget=f.host.budget(plan);assert.equal(budget.vertexSamples,budget.count*(4+4*16));
});

test('modified member source identity is an ownership conflict before Remove',async()=>{
  const f=await fixture();f.run(pulsePresetArgs('impact',30));const member=f.member('core'),metadata=f.host.meta(member);metadata.sourceId+=100;member.comment='[Moti.on.pulse.v4]'+encodeURIComponent(JSON.stringify(metadata));assert.equal(f.handler.preflight({action:'remove'}).code,'TRACK_CONFLICT');assert.equal(f.comp.numLayers,4);
});

test('modified electric material link is rejected before deletion',async()=>{
  const f=await fixture();f.run(pulsePresetArgs('electric',30));f.member('sparks').property('ADBE Effect Parade').property('Moti.on Pulse · Matter').property(1).setValue(f.source.index);assert.equal(f.handler.preflight({action:'remove'}).code,'TRACK_CONFLICT');assert.equal(f.comp.numLayers,5);
});


test('irreversible final backup cleanup failure is reported as rollback failure',async()=>{
  const f=await fixture();f.run(pulsePresetArgs('impact',30));f.faults.cleanupAfter=1;assert.throws(()=>f.run({action:'remove'}),error=>error.motionCode==='ROLLBACK_FAILED');
});

test('Update staging commit failure preserves controller, original members and source state',async()=>{
  const f=await fixture();f.run(pulsePresetArgs('electric',30));const controller=f.controller(),start=controller.inPoint,comment=f.source.comment,ids=f.comp.items.map(l=>l.id);f.control('glow').setValueAtTime(.25,20);f.control('glow').setValueAtTime(1,80);const keys=clone(f.control('glow').keys);f.doc().fontSize=120;let current=comment,first=true;Object.defineProperty(f.source,'comment',{get:()=>current,set:value=>{if(first){first=false;throw Error('injected update metadata commit');}current=value;}});assert.throws(()=>f.run({action:'update',renderer:'morph'}),/injected update metadata commit/);assert.equal(f.controller(),controller);assert.equal(controller.inPoint,start);assert.equal(f.source.comment,comment);assert.deepEqual(f.comp.items.map(l=>l.id),ids);assert.deepEqual(f.control('glow').keys,keys);assert.equal(f.reader.run({}).data.stale,true);assert.equal(f.source.enabled,false);assert.equal(f.comp.time,.25);
});

test('Read after a CTI change does not inspect evaluated member expression values',async()=>{
  const f=await fixture();f.run(pulsePresetArgs('plasma',30));const contour=f.member('matter').property('ADBE Root Vectors Group').property('Glyph 1').property('ADBE Vectors Group').property('Render').property('ADBE Vectors Group').property('Contour 1').property('ADBE Vector Shape');Object.defineProperty(contour,'value',{get:()=>{throw Error('evaluated animated path read');}});f.comp.time=1.5;assert.equal(f.reader.run({}).data.rigVersion,4);assert.equal(f.reader.run({}).data.stale,false);
});

test('Bake partial keyframe failure restores expressions and removes written keys',async()=>{
  const f=await fixture();f.run(pulsePresetArgs('electric',30));const members=f.meta().members.map(({id})=>f.comp.items.find(l=>l.id===id)),before=members.map(l=>({shape:f.host.signature(l.property('ADBE Root Vectors Group')),transform:f.host.signature(l.property('ADBE Transform Group')),effects:f.host.signature(l.property('ADBE Effect Parade'))})),comment=f.source.comment;f.faults.keysWrite=f.member('matter').property('ADBE Effect Parade').property('ADBE Glo2').property('ADBE Glo2-0004');assert.throws(()=>f.run({action:'bake'}),/injected keyframe write/);assert.equal(f.source.comment,comment);assert.equal(f.reader.run({}).data.baked,false);assert.deepEqual(members.map(l=>({shape:f.host.signature(l.property('ADBE Root Vectors Group')),transform:f.host.signature(l.property('ADBE Transform Group')),effects:f.host.signature(l.property('ADBE Effect Parade'))})),before);
});

test('duplicated owned member is rejected before Remove can leave an orphan',async()=>{
  const f=await fixture();f.run(pulsePresetArgs('impact',30));const duplicate=f.member('core').duplicate();duplicate.isBackup=false;assert.equal(f.handler.preflight({action:'remove'})?.code,'TRACK_CONFLICT');assert.equal(f.comp.numLayers,5);
});

test('legacy control restoration creates every key before metadata and restores interpolation after ease',async()=>{
  const moduleSource=await readFile(new URL('../host/src/commands/text-pulse-morph.jsx',import.meta.url),'utf8'),body=moduleSource.match(/function restoreControl\(p, state\) \{([\s\S]*?)\n {2}\}/)?.[1];assert.ok(body,'restoreControl implementation is available');const restoreControl=new Function('p','state',body);
  const state={value:30,expression:'',enabled:false,keys:[{time:.5,value:30,inType:'BEZIER',outType:'BEZIER',inEase:[[0,55]],outEase:[[0,55]],continuous:false,auto:false},{time:2,value:90,inType:'LINEAR',outType:'LINEAR',inEase:[[40,16.666666667]],outEase:[[0,16.666666667]],continuous:false,auto:false}]};
  const property={expression:'',expressionEnabled:false,keys:[],get numKeys(){return this.keys.length;},removeKey(index){this.keys.splice(index-1,1);},setValue(){assert.fail('animated control must create keyframes');},setValueAtTime(time,value){this.keys.push({time,value});},key(index){assert.equal(this.numKeys,state.keys.length,'all keyframes must exist before interpolation/ease metadata');return this.keys[index-1];},setInterpolationTypeAtKey(index,inType,outType){Object.assign(this.key(index),{inType,outType});},setTemporalEaseAtKey(index,inEase,outEase){Object.assign(this.key(index),{inEase:clone(inEase),outEase:clone(outEase),inType:'BEZIER',outType:'BEZIER'});},setTemporalContinuousAtKey(index,continuous){this.key(index).continuous=continuous;},setTemporalAutoBezierAtKey(index,auto){this.key(index).auto=auto;}};
  restoreControl(property,state);assert.deepEqual(property.keys,state.keys);
});


test('prior V4 material upgrades on Apply without replacing the controller or animated controls',async()=>{
  const f=await fixture(),args=pulsePresetArgs('impact',30);f.run(args);
  const controller=f.controller(),start=controller.inPoint,oldMembers=f.meta().members.map(x=>x.id),old=f.meta();delete old.renderRevision;
  f.source.comment='User note\n[Moti.on.pulse.v4]'+encodeURIComponent(JSON.stringify(old));
  f.control('glow').setValueAtTime(.25,20);f.control('glow').setValueAtTime(1,80);const keys=clone(f.control('glow').keys);
  assert.equal(f.run(args).changed,true);assert.equal(f.meta().renderRevision,2);assert.equal(f.controller(),controller);assert.equal(controller.inPoint,start);assert.deepEqual(f.control('glow').keys,keys);assert.equal(f.comp.numLayers,4);
  assert.ok(f.meta().members.every(x=>!oldMembers.includes(x.id)));assert.equal(f.run(args).changed,false);
  const effects=f.member('matter').property('ADBE Effect Parade');assert.equal(effects.property(2).matchName,'ADBE Ramp');assert.equal(effects.property(3).matchName,'ADBE Glo2');
});

test('prior V4 upgrade rolls back controls and members when gradient creation fails',async()=>{
  const f=await fixture();f.run(pulsePresetArgs('impact',30));const old=f.meta();delete old.renderRevision;f.source.comment='User note\n[Moti.on.pulse.v4]'+encodeURIComponent(JSON.stringify(old));
  const ids=f.comp.items.map(l=>l.id),comment=f.source.comment,controls=f.reader.run({}).data.controls,addShape=f.comp.layers.addShape;
  f.comp.layers.addShape=()=>{const l=addShape(),fx=l.property('ADBE Effect Parade'),add=fx.addProperty;fx.addProperty=function(name){if(name==='ADBE Ramp')throw Error('injected gradient creation');return add.call(this,name);};return l;};
  assert.throws(()=>f.run(pulsePresetArgs('plasma',30)),/injected gradient creation/);assert.equal(f.source.comment,comment);assert.deepEqual(f.comp.items.map(l=>l.id),ids);assert.deepEqual(f.reader.run({}).data.controls,controls);
});
