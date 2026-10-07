import test from 'node:test';
import assert from 'node:assert/strict';
import {loadHostModules} from './host-harness.mjs';
import {FakeCompItem,FakeProperty,FakeKeyframeEase,PropertyType,PropertyValueType,makeKey} from './keyframe-fakes.mjs';

const times=p=>p.keys.map(k=>Number(k.time.toFixed(6)));
function prop(name,ts){return new FakeProperty(name,ts.map((t,i)=>makeKey(t,i*20,30+i,60+i)));}
function clearSiblingSelectionOnRecreation(properties) {
 for (const property of properties) {
  property.selected=true;
  Object.defineProperty(property,'selectedKeys',{get(){return this.keys.flatMap((key,index)=>key.selected?[index+1]:[]);}});
  const write=property.setValueAtTime.bind(property);
  property.setValueAtTime=(time,value)=>{
   // AE may clear selection on siblings while another property's keys are recreated.
   for (const sibling of properties) {
    sibling.selected=false;
    for (const key of sibling.keys) key.selected=false;
   }
   write(time,value);
  };
 }
}
async function setup(properties){
 const comp=new FakeCompItem(properties),undo=[];
 const scope=await loadHostModules(['generated/motion-contracts.jsx','generated/motion-descriptors.jsx','src/json.jsx','src/undo.jsx','src/registry.jsx','src/keyframe-operations.jsx','src/commands/keys-clone.jsx','src/commands/keys-reverse.jsx','src/commands/keys-send-to-edge.jsx','src/dispatch.jsx'],{
 app:{project:{activeItem:comp},beginUndoGroup:label=>undo.push(label),endUndoGroup:()=>undo.push('end')},CompItem:FakeCompItem,PropertyType,PropertyValueType,KeyframeEase:FakeKeyframeEase,KeyframeInterpolationType:{LINEAR:1,BEZIER:2,HOLD:3}});
 return {comp,undo,scope,run:(command,args={})=>JSON.parse(scope.MotionAE.dispatch(JSON.stringify({protocolVersion:1,requestId:'qa',command,args,context:{host:'after-effects',hostVersion:'26.5',locale:'pt-BR'},options:{}})))};
}

test('clone preserves offsets across properties, including a single selected key',async()=>{
 const a=prop('Position',[1,3]),b=prop('Opacity',[2]),f=await setup([a,b]);
 assert.equal(f.run('ae.keys.clone',{mode:'repeat'}).ok,true);
 assert.deepEqual(times(a),[1,3,3.04,5.04]);assert.deepEqual(times(b),[2,4.04]);assert.equal(f.undo.length,2);
});
test('reversed duplicate ends at comp boundary in one Undo without moving original keys',async()=>{
 const a=prop('Scale',[1,3]),b=prop('Opacity',[2]),f=await setup([a,b]);
 assert.equal(f.run('ae.keys.clone',{mode:'mirror',destination:'comp-end'}).ok,true);
 assert.deepEqual(times(a),[1,3,8,10]);assert.deepEqual(times(b),[2,9]);assert.deepEqual(a.keys.map(k=>k.value),[0,20,20,0]);assert.equal(f.undo.length,2);
});
test('mirror joins at the turning point without a duplicated pause',async()=>{
 const a=prop('Scale',[1,2,3]),f=await setup([a]);
 assert.equal(f.run('ae.keys.clone',{mode:'mirror'}).ok,true);
 assert.deepEqual(times(a),[1,2,3,4,5]);assert.deepEqual(a.keys.map(k=>k.value),[0,20,40,20,0]);
});
test('toolbar duplicate copies both keys at the playhead and a second copy follows a moved playhead',async()=>{
 const a=prop('Opacity',[1,3]),f=await setup([a]); f.comp.time=5;
 assert.equal(f.run('ae.keys.clone',{mode:'repeat',destination:'cti'}).ok,true);
 assert.deepEqual(times(a),[1,3,5,7]); assert.deepEqual(a.keys.map(k=>k.selected),[false,false,true,true]);
 f.comp.time=8;
 assert.equal(f.run('ae.keys.clone',{mode:'repeat',destination:'cti'}).ok,true);
 assert.deepEqual(times(a),[1,3,5,7,8,10]);
 assert.deepEqual(a.keys.map(k=>k.value),[0,20,0,20,0,20]); assert.equal(f.comp.time,8);
});
test('toolbar duplicate and reverse creates both copies without modifying original ease',async()=>{
 const a=prop('Opacity',[1,3]),f=await setup([a]); const before=structuredClone(a.keys);
 assert.equal(f.run('ae.keys.clone',{mode:'mirror',destination:'after-gap'}).ok,true);
 assert.deepEqual(times(a),[1,3,3.04,5.04]); assert.deepEqual(a.keys.map(k=>k.value),[0,20,20,0]);
 assert.deepEqual(JSON.parse(JSON.stringify(a.keys.slice(0,2))),before.map(k=>({...k,selected:false})));
 assert.deepEqual(a.keys.map(k=>k.selected),[false,false,true,true]);
});
test('copy to an occupied playhead reports the real collision and preserves the entire selection',async()=>{
 const a=prop('Opacity',[1,3]),f=await setup([a]);f.comp.time=1;const before=JSON.stringify(a.keys);
 const result=f.run('ae.keys.clone',{mode:'repeat',destination:'cti'});
 assert.equal(result.error.code,'KEYFRAME_CONFLICT');assert.equal(result.error.details.destination,'cti');
 assert.equal(result.error.details.conflictWith,'source'); assert.equal(JSON.stringify(a.keys),before); assert.deepEqual(f.undo,[]);
});
test('moving selected keys across an unselected key does not invent a collision',async()=>{
 const a=prop('Opacity',[2,3,5]),f=await setup([a]);a.selectedKeys=[1,2];
 const untouched=structuredClone(a.keys[2]);untouched.selected=false;
 assert.equal(f.run('ae.keys.send-to-edge',{edge:'end',reference:'comp'}).ok,true);
 assert.deepEqual(times(a),[5,9,10]);assert.deepEqual(JSON.parse(JSON.stringify(a.keys[0])),untouched);
 assert.deepEqual(a.keys.map(k=>k.selected),[false,true,true]);
});
test('collision on a later property rejects all writes before Undo',async()=>{
 const a=prop('Scale',[1,2]),b=prop('Opacity',[1,2,5]),f=await setup([a,b]);b.selectedKeys=[1,2];f.comp.time=4;
 const before=JSON.stringify([a.keys,b.keys]);const r=f.run('ae.keys.clone',{mode:'repeat',destination:'cti'});
 assert.equal(r.error.code,'KEYFRAME_CONFLICT');assert.equal(JSON.stringify([a.keys,b.keys]),before);assert.deepEqual(f.undo,[]);
});
test('reverse preserves common range and allows non-colliding unselected keys',async()=>{
 const a=prop('Scale',[0,1,2,4]),b=prop('Opacity',[1,3]),f=await setup([a,b]);a.selectedKeys=[1,2,4];
 assert.equal(f.run('ae.keys.reverse').ok,true);assert.deepEqual(times(a),[0,2,3,4]);assert.deepEqual(times(b),[1,3]);
});
test('reverse collision is typed and leaves the entire selection intact',async()=>{
 const a=prop('Scale',[0,1,3,4]),f=await setup([a]);a.selectedKeys=[1,2,4];
 const before=JSON.stringify(a.keys);assert.equal(f.run('ae.keys.reverse').error.code,'KEYFRAME_CONFLICT');assert.equal(JSON.stringify(a.keys),before);assert.equal(f.undo.length,0);
});
test('reverse negates scalar temporal derivatives while preserving influence',async()=>{
 const a=prop('Opacity',[0,2]);a.keys[0].outEase=[new FakeKeyframeEase(12,40)];a.keys[1].inEase=[new FakeKeyframeEase(18,50)];const f=await setup([a]);
 assert.equal(f.run('ae.keys.reverse').ok,true);assert.equal(a.keys[0].outEase[0].speed,-18);assert.equal(a.keys[1].inEase[0].speed,-12);assert.equal(a.keys[0].outEase[0].influence,50);
});
test('spatial reverse swaps geometric offsets without negation or negative speed',async()=>{
 const a=prop('Position',[0,2]);a.propertyValueType=PropertyValueType.TwoD_SPATIAL;
 for(const k of a.keys){k.value=[k.value,0];k.spatial={inTangent:[-20,30],outTangent:[40,-10],continuous:false,autoBezier:false};k.outEase=[new FakeKeyframeEase(25,40)];}
 a.keyInSpatialTangent=i=>a.key(i).spatial.inTangent;a.keyOutSpatialTangent=i=>a.key(i).spatial.outTangent;
 a.keySpatialContinuous=i=>a.key(i).spatial.continuous;a.keySpatialAutoBezier=i=>a.key(i).spatial.autoBezier;
 a.setSpatialTangentsAtKey=(i,inTangent,outTangent)=>{a.key(i).spatial={inTangent,outTangent};};
 a.setSpatialContinuousAtKey=(i,v)=>{a.key(i).spatial.continuous=v;};a.setSpatialAutoBezierAtKey=(i,v)=>{a.key(i).spatial.autoBezier=v;};
 const f=await setup([a]);assert.equal(f.run('ae.keys.reverse').ok,true);
 assert.deepEqual(Array.from(a.keys[0].spatial.inTangent),[40,-10]);assert.deepEqual(Array.from(a.keys[0].spatial.outTangent),[-20,30]);assert.equal(a.keys[0].inEase[0].speed,25);
});
test('failure while writing second property restores values, labels, selection and expressions',async()=>{
 const a=prop('Scale',[1,2]),b=prop('Opacity',[1,2]),f=await setup([a,b]);a.keys[0].label=7;a.expression='value*2';a.expressionEnabled=true;
 const before=JSON.stringify([a.keys,b.keys]);b.falhaEm=1;
 assert.equal(f.run('ae.keys.clone',{mode:'mirror',destination:'comp-end'}).error.code,'HOST_OPERATION_FAILED');assert.equal(JSON.stringify([a.keys,b.keys]),before);assert.equal(a.expression,'value*2');assert.equal(a.expressionEnabled,true);
});
test('multi-property clone selects every mirrored copy after sibling recreation clears selection', async () => {
 const a=prop('Rotation',[5,7]), b=prop('Opacity',[6]), properties=[a,b];
 const layer={inPoint:1,outPoint:10,locked:false};
 for (const property of properties) property.parentProperty=layer;
 clearSiblingSelectionOnRecreation(properties);
 const f=await setup(properties); f.comp.time=4.5;
 assert.equal(f.run('ae.keys.clone',{mode:'mirror',destination:'layer-start'}).ok,true);
 assert.deepEqual(times(a),[1,3,5,7]); assert.deepEqual(times(b),[2,6]);
 assert.deepEqual(a.selectedKeys,[1,2]); assert.deepEqual(b.selectedKeys,[1]);
 assert.deepEqual(properties.map(property=>property.selected),[true,true]);
 assert.equal(f.comp.time,4.5); assert.equal(f.undo.length,2);
});
test('rollback restores sibling selection including a property not yet written', async () => {
 const a=prop('Rotation',[4,5,7]), b=prop('Opacity',[6]), c=prop('Scale',[6]), properties=[a,b,c];
 const layer={inPoint:1,outPoint:10,locked:false};
 for (const property of properties) property.parentProperty=layer;
 a.keys[0].selected=false; a.keys[1].label=5;
 a.expression='value*2'; a.expressionEnabled=true;
 clearSiblingSelectionOnRecreation(properties);
 const f=await setup(properties), before=JSON.stringify(properties.map(property=>property.keys));
 f.comp.time=3.25; b.falhaEm=1;
 assert.equal(f.run('ae.keys.clone',{mode:'mirror',destination:'layer-start'}).error.code,'HOST_OPERATION_FAILED');
 assert.equal(JSON.stringify(properties.map(property=>property.keys)),before);
 assert.deepEqual(properties.map(property=>property.selected),[true,true,true]);
 assert.deepEqual(properties.map(property=>property.selectedKeys),[[2,3],[1],[1]]);
 assert.equal(a.expression,'value*2'); assert.equal(a.expressionEnabled,true);
 assert.equal(f.comp.time,3.25); assert.equal(f.undo.length,2);
});
for(const [edge,expectedA,expectedB] of [['start',[0,2],[1,3]],['end',[7,9],[8,10]]])test('send to '+edge+' preserves inter-property offsets',async()=>{
 const a=prop('Scale',[1,3]),b=prop('Opacity',[2,4]),f=await setup([a,b]);
 assert.equal(f.run('ae.keys.send-to-edge',{edge,reference:'comp'}).ok,true);assert.deepEqual(times(a),expectedA);assert.deepEqual(times(b),expectedB);
});
test('clone validates mode, destination, empty selection and locked owner',async()=>{
 const a=prop('Opacity',[1,2]),f=await setup([a]);
 for(const args of [{mode:'typo'},{destination:'typo'},{foo:2}])assert.equal(f.run('ae.keys.clone',args).error.code,'INVALID_PRESET');
 a.parentProperty={inPoint:0,outPoint:10,locked:true};assert.equal(f.run('ae.keys.clone',{}).error.code,'INVALID_SELECTION_TYPE');
 a.parentProperty=null;a.selectedKeys=[];assert.equal(f.run('ae.keys.clone',{}).error.code,'NO_SELECTION');assert.equal(f.undo.length,0);
});

test('reversed duplicate starts at composition zero and preserves offsets and source metadata', async () => {
 const a=prop('Scale',[5,7]), b=prop('Opacity',[6]), f=await setup([a,b]);
 a.keys[0].label=5; a.keys[0].inInterpolation=1; a.keys[0].outEase=[new FakeKeyframeEase(12,48)];
 const source=JSON.parse(JSON.stringify(a.keys));
 assert.equal(f.run('ae.keys.clone',{mode:'mirror',destination:'comp-start'}).ok,true);
 assert.deepEqual(times(a),[0,2,5,7]); assert.deepEqual(times(b),[1,6]);
 assert.deepEqual(a.keys.map(k=>k.value),[20,0,0,20]);
 assert.equal(a.keys[1].label,5); assert.equal(a.keys[1].inEase[0].speed,-12);
 assert.deepEqual(JSON.parse(JSON.stringify(a.keys.slice(2))),source.map(k=>({...k,selected:false})));
 assert.deepEqual(a.keys.map(k=>k.selected),[true,true,false,false]);
 assert.equal(f.comp.time,0); assert.equal(f.undo.length,2);
});

for (const [destination,expectedA,expectedB] of [
 ['layer-start',[1,3,5,7],[2,6]],
 ['layer-end',[5,7,8,10],[6,9]]
]) test(`${destination} mirrors a shared range across properties of the same layer`, async () => {
 const layer={inPoint:1,outPoint:10,locked:false};
 const a=prop('Scale',[5,7]), b=prop('Opacity',[6]);
 a.parentProperty=layer; b.parentProperty=layer;
 const f=await setup([a,b]); f.comp.time=4.5;
 assert.equal(f.run('ae.keys.clone',{mode:'mirror',destination}).ok,true);
 assert.deepEqual(times(a),expectedA); assert.deepEqual(times(b),expectedB);
 assert.equal(f.comp.time,4.5); assert.equal(f.undo.length,2);
});

test('each layer uses its own start and selection range', async () => {
 const a=prop('Scale',[6,8]), b=prop('Opacity',[7]), c=prop('Rotation',[7,8]);
 const first={inPoint:1,outPoint:10,locked:false}, second={inPoint:3,outPoint:10,locked:false};
 a.parentProperty=first; b.parentProperty=first; c.parentProperty=second;
 const f=await setup([a,b,c]);
 assert.equal(f.run('ae.keys.clone',{mode:'mirror',destination:'layer-start'}).ok,true);
 assert.deepEqual(times(a),[1,3,6,8]); assert.deepEqual(times(b),[2,7]); assert.deepEqual(times(c),[3,4,7,8]);
 assert.equal(f.undo.length,2);
});

for (const [destination,expected] of [['layer-start',[0,2,4,6]],['layer-end',[4,6,8,10]]]) {
 test(`${destination} clips a layer extending outside the composition to visible boundaries`, async () => {
  const a=prop('Scale',[4,6]); a.parentProperty={inPoint:-5,outPoint:20,locked:false};
  const f=await setup([a]);
  assert.equal(f.run('ae.keys.clone',{mode:'mirror',destination}).ok,true);
  assert.deepEqual(times(a),expected);
 });
}

test('repeat can also target layer start without reversing values', async () => {
 const a=prop('Scale',[4,6]); a.parentProperty={inPoint:1,outPoint:10,locked:false};
 const f=await setup([a]);
 assert.equal(f.run('ae.keys.clone',{mode:'repeat',destination:'layer-start'}).ok,true);
 assert.deepEqual(times(a),[1,3,4,6]); assert.deepEqual(a.keys.map(k=>k.value),[0,20,0,20]);
});

test('a single selected key duplicates at a subframe layer start', async () => {
 const a=prop('Opacity',[4]); a.parentProperty={inPoint:1.2345,outPoint:10,locked:false};
 const f=await setup([a]); f.comp.frameDuration=1001/30000;
 assert.equal(f.run('ae.keys.clone',{mode:'mirror',destination:'layer-start'}).ok,true);
 assert.deepEqual(times(a),[1.2345,4]); assert.equal(f.undo.length,2);
});

test('collision at layer start rejects every property before Undo', async () => {
 const layer={inPoint:1,outPoint:10,locked:false};
 const a=prop('Scale',[5,7]), b=prop('Opacity',[1,5,7]);
 a.parentProperty=layer; b.parentProperty=layer; b.selectedKeys=[2,3];
 const f=await setup([a,b]), before=JSON.stringify([a.keys,b.keys]);
 const response=f.run('ae.keys.clone',{mode:'mirror',destination:'layer-start'});
 assert.equal(response.error.code,'KEYFRAME_CONFLICT'); assert.equal(JSON.stringify([a.keys,b.keys]),before); assert.deepEqual(f.undo,[]);
});

for (const destination of ['layer-start','layer-end']) {
 test(`${destination} rejects an invisible or too short later layer before writing earlier properties`, async () => {
  for (const bounds of [{inPoint:11,outPoint:15},{inPoint:1,outPoint:2},{inPoint:NaN,outPoint:10}]) {
   const a=prop('Scale',[5,7]), b=prop('Opacity',[5,7]);
   a.parentProperty={inPoint:1,outPoint:10,locked:false}; b.parentProperty={...bounds,locked:false};
   const f=await setup([a,b]), before=JSON.stringify([a.keys,b.keys]);
   assert.equal(f.run('ae.keys.clone',{mode:'mirror',destination}).error.code,'INVALID_SELECTION_TYPE');
   assert.equal(JSON.stringify([a.keys,b.keys]),before); assert.deepEqual(f.undo,[]);
  }
 });
}

test('a reversed duplicate that cannot fit in the composition is rejected before Undo', async () => {
 const a=prop('Scale',[-2,9]), f=await setup([a]), before=JSON.stringify(a.keys);
 for (const destination of ['comp-start','comp-end']) {
  assert.equal(f.run('ae.keys.clone',{mode:'mirror',destination}).error.code,'INVALID_SELECTION_TYPE');
  assert.equal(JSON.stringify(a.keys),before); assert.deepEqual(f.undo,[]);
 }
});
