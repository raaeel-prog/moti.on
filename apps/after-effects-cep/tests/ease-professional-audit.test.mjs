import test from 'node:test';
import assert from 'node:assert/strict';
import { FakeProperty, FakeLayer, FakeCompItem, PropertyValueType, KeyframeInterpolationType, makeApp, dispatchWith } from './ease-fakes.mjs';

const curve={x1:.5,y1:.5,x2:.5,y2:1,applyIn:true,applyOut:true};
const points=[{x:.5,y:.5,inX:.4,inY:.4,outX:.6,outY:.6}];
const bake={mode:'elastic',direction:'out',in:{amp:1,freq:3.3,decay:6.9,start:0},out:{amp:1,freq:3.3,decay:6.9,start:0}};
function scene(properties){const comp=new FakeCompItem(properties),app=makeApp(comp);return {comp,app,run:args=>dispatchWith({comp,app},args)};}
function spatial(){const p=new FakeProperty({name:'Position',valueType:PropertyValueType.TwoD_SPATIAL,eases:1,keys:[[0,[0,0]],[2,[100,0]]]});p.keys[0].spatialOut=[0,100];p.keys[1].spatialIn=[0,100];p.keys.forEach(k=>{k.spatialIn=k.spatialIn.slice(0,2);k.spatialOut=k.spatialOut.slice(0,2);k.spatialAuto=false;});return p;}

test('native color has one ease in 0..255 units, including changes outside red',async()=>{
 for(const [a,b,speed] of [[[.2,.1,.3,1],[.2,.9,.3,1],102],[[.1,.1,.3,1],[.7,.9,.3,1],127.5]]){
  const p=new FakeProperty({name:'Color',valueType:PropertyValueType.COLOR,eases:1,keys:[[0,a],[2,b]]});
  assert.equal((await scene([p]).run(curve)).ok,true);assert.ok(Math.abs(p.keys[0].outEase[0].speed-speed)<.00001);assert.equal(p.numKeys,2);
 }
});

test('spatial Bezier speed uses curved path length and preserves original spatial metadata',async()=>{
 const p=spatial(),before=JSON.stringify(p.keys.map(k=>[k.spatialIn,k.spatialOut,k.spatialAuto,k.roving]));
 const r=await scene([p]).run(curve);assert.equal(r.ok,true);
 assert.ok(Math.abs(p.keys[0].outEase[0].speed-100)<.001,`arch length is 200, not chord 100: ${p.keys[0].outEase[0].speed}`);
 assert.equal(JSON.stringify(p.keys.map(k=>[k.spatialIn,k.spatialOut,k.spatialAuto,k.roving])),before);
 assert.equal(p.numKeys,2);
});
test('Hold is preserved until explicit convertHold choice',async()=>{
 const p=new FakeProperty({keys:[[0,0],[2,100]]});p.keys[0].outInterpolation=KeyframeInterpolationType.HOLD;
 const c=scene([p]);assert.equal((await c.run(curve)).ok,true);assert.equal(p.keys[0].outInterpolation,KeyframeInterpolationType.HOLD);
 assert.equal((await c.run({...curve,convertHold:true})).ok,true);assert.equal(p.keys[0].outInterpolation,KeyframeInterpolationType.BEZIER);
});
test('edited generated interpolation is protected even when time/value are unchanged',async()=>{
 const p=new FakeProperty({keys:[[0,0],[2,100]]}),c=scene([p]);const first=await c.run({...curve,points});assert.equal(first.ok,true);
 p.keys[1].outEase[0].influence=91;const before=JSON.stringify(p.keys),undos=c.app.undoGroups;
 const r=await c.run({...curve,points,session:first.data.session});assert.equal(r.error?.code,'KEYFRAME_CONFLICT');assert.equal(JSON.stringify(p.keys),before);assert.equal(c.app.undoGroups,undos);
});
test('moving a generated key by a subframe is an edit, not ownership by nearby frame',async()=>{
 const p=new FakeProperty({keys:[[0,0],[2,100]]}),c=scene([p]);const first=await c.run({...curve,points});p.keys[1].time+=.005;
 const before=JSON.stringify(p.keys),r=await c.run({...curve,points,session:first.data.session});assert.equal(r.error?.code,'KEYFRAME_CONFLICT');assert.equal(JSON.stringify(p.keys),before);
});
test('legacy generated session lacking metadata proof refuses unsafe overwrite',async()=>{
 const p=new FakeProperty({keys:[[0,0],[2,100]]}),c=scene([p]);const first=await c.run({...curve,points});first.data.session.segments[0].generated.forEach(g=>delete g.fingerprint);
 const before=JSON.stringify(p.keys),r=await c.run({...curve,points,session:first.data.session});assert.equal(r.error?.code,'KEYFRAME_CONFLICT');assert.equal(JSON.stringify(p.keys),before);
});
test('spatial points preserve a curved trajectory and restoring plain recovers source tangents',async()=>{
 const p=spatial(),c=scene([p]),before=p.keys.map(k=>[k.spatialIn,k.spatialOut,k.spatialAuto]);
 const r=await c.run({...curve,points});assert.equal(r.ok,true,JSON.stringify(r.error));assert.deepEqual(p.keys[1].value,[50,75]);
 assert.ok(Math.abs(p.keys[0].spatialOut[1]-50)<.001);assert.ok(Math.abs(p.keys[2].spatialIn[1]-50)<.001);
 const again=await c.run({...curve,points,session:r.data.session});assert.equal(again.ok,true,JSON.stringify(again.error));assert.deepEqual(p.keys[1].value,[50,75]);
 const plain=await c.run({...curve,session:again.data.session});assert.equal(plain.ok,true,JSON.stringify(plain.error));assert.equal(p.numKeys,2);assert.deepEqual(p.keys.map(k=>[k.spatialIn,k.spatialOut,k.spatialAuto]),before);
});
test('spatial bake samples the path rather than flattening it to a chord',async()=>{
 const p=spatial(),r=await scene([p]).run({...curve,bake});assert.equal(r.ok,true,JSON.stringify(r.error));assert.ok(p.keys.some(k=>k.value[1]>60),'the arch must remain visible');assert.deepEqual(p.keys[0].value,[0,0]);assert.deepEqual(p.keys.at(-1).value,[100,0]);
});
test('generated modes refuse Hold segments and roving boundaries before mutation by default',async()=>{
 for(const mode of [{points},{bake}]) for(const kind of ['hold','roving']) {
  const p=kind==='roving'?new FakeProperty({name:'Position',valueType:PropertyValueType.TwoD_SPATIAL,eases:1,keys:[[-1,[0,0]],[0,[20,0]],[2,[100,0]]],selected:[2,3]}):new FakeProperty({keys:[[0,0],[2,100]]});
  if(kind==='hold')p.keys[0].outInterpolation=KeyframeInterpolationType.HOLD;else p.keys[1].roving=true;
  const c=scene([p]),before=JSON.stringify(p.keys),r=await c.run({...curve,...mode});assert.equal(r.ok,false,kind);assert.equal(JSON.stringify(p.keys),before);assert.equal(c.app.undoGroups,0);
 }
});
test('all property snapshots precede mutation and rollback restores sibling selection last',async()=>{
 const layer=new FakeLayer(),a=new FakeProperty({keys:[[0,0],[2,100]],layer}),b=new FakeProperty({keys:[[0,0],[2,100]],layer,propertyIndex:2});
 const props=[a,b];for(const p of props){const write=p.setValueAtTime.bind(p);p.setValueAtTime=(...args)=>{for(const sibling of props)if(sibling!==p)sibling.selectedKeys=[];write(...args);};}
 b.falhaEm=1;const c=scene(props),before=JSON.stringify(props.map(p=>p.keys));const r=await c.run({...curve,points});assert.equal(r.ok,false);assert.equal(JSON.stringify(props.map(p=>p.keys)),before);assert.deepEqual(props.map(p=>p.selectedKeys),[[1,2],[1,2]]);
});

test('successful generated apply restores multi-property selection after sibling recreation',async()=>{
 const layer=new FakeLayer(),a=new FakeProperty({keys:[[0,0],[2,100]],layer}),b=new FakeProperty({keys:[[0,20],[2,80]],layer,propertyIndex:2});
 const props=[a,b];for(const p of props){const write=p.setValueAtTime.bind(p);p.setValueAtTime=(...args)=>{for(const sibling of props)if(sibling!==p)sibling.selectedKeys=[];write(...args);};}
 const c=scene(props);c.comp.time=1.2345;const r=await c.run({...curve,points});assert.equal(r.ok,true,JSON.stringify(r.error));assert.deepEqual(props.map(p=>p.selectedKeys),[[1,3],[1,3]]);assert.equal(c.comp.time,1.2345);assert.equal(c.app.undoGroups,1);
});
test('one-side application preserves the other ease, geometry, times, labels and expression',async()=>{
 const p=spatial();p.keys.splice(1,0,{...structuredClone(p.keys[0]),time:1,value:[30,60],inEase:[{speed:12,influence:37}],outEase:[{speed:25,influence:42}],roving:true,label:7});p.selectedKeys=[2];p.expression='value + [10,20]';p.expressionEnabled=true;
 const before=structuredClone(p.keys),r=await scene([p]).run({...curve,applyIn:false});assert.equal(r.ok,true,JSON.stringify(r.error));
 assert.deepEqual(p.keys[1].inEase.map(e=>[e.speed,e.influence]),before[1].inEase.map(e=>[e.speed,e.influence]));assert.equal(p.keys[1].inInterpolation,before[1].inInterpolation);
 assert.deepEqual(p.keys.map(k=>[k.time,k.value,k.spatialIn,k.spatialOut,k.roving,k.label,k.selected]),before.map(k=>[k.time,k.value,k.spatialIn,k.spatialOut,k.roving,k.label,k.selected]));
 assert.equal(p.expression,'value + [10,20]');assert.equal(p.expressionEnabled,true);assert.equal(p.numKeys,3);
});
test('spatial source edit and generated label edit protect ownership before Undo',async()=>{
 for(const edit of [p=>{p.keys[0].spatialOut[0]+=2;},p=>{p.keys[1].label=9;}]){
  const p=spatial(),c=scene([p]),first=await c.run({...curve,points});edit(p);const before=JSON.stringify(p.keys),undos=c.app.undoGroups;
  const r=await c.run({...curve,points,session:first.data.session});assert.equal(r.error?.code,'KEYFRAME_CONFLICT');assert.equal(JSON.stringify(p.keys),before);assert.equal(c.app.undoGroups,undos);
 }
});
test('adjacent curved segments keep their source geometry through points, bake and plain',async()=>{
 const p=spatial();p.keys.push({...structuredClone(p.keys[1]),time:4,value:[200,0],spatialIn:[0,-100]});p.keys[1].spatialOut=[0,-100];p.selectedKeys=[1,2,3];
 const original=p.keys.map(k=>[k.value,k.spatialIn,k.spatialOut,k.spatialAuto]),c=scene([p]);let r=await c.run({...curve,points});assert.equal(r.ok,true,JSON.stringify(r.error));
 r=await c.run({...curve,bake,session:r.data.session});assert.equal(r.ok,true,JSON.stringify(r.error));
 r=await c.run({...curve,session:r.data.session});assert.equal(r.ok,true,JSON.stringify(r.error));assert.deepEqual(p.keys.map(k=>[k.value,k.spatialIn,k.spatialOut,k.spatialAuto]),original);
});

test('malformed generated ownership outside its segment is rejected without mutation',async()=>{
 const p=new FakeProperty({keys:[[0,0],[2,100],[4,200]],selected:[1,2]}),c=scene([p]);const r=await c.run({...curve,points});
 const session=structuredClone(r.data.session);session.segments[0].generated[0].time=4;const before=JSON.stringify(p.keys),undos=c.app.undoGroups;
 const invalid=await c.run({...curve,points,session});assert.equal(invalid.error?.code,'INVALID_PRESET');assert.equal(JSON.stringify(p.keys),before);assert.equal(c.app.undoGroups,undos);
});
