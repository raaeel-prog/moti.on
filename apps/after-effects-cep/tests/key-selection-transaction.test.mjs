import test from 'node:test';
import assert from 'node:assert/strict';
import {loadHostModules} from './host-harness.mjs';
import {FakeCompItem,FakeProperty,FakeKeyframeEase,PropertyType,PropertyValueType,makeKey} from './keyframe-fakes.mjs';

const cases=[
 ['reverse values','ae.keys.reverse-values','keys-reverse-values.jsx',{}],
 ['paste','ae.keys.paste','keys-copy.jsx',{pasteTime:'cti',mappingMode:'matchName',relativeTiming:true,includeExpressions:false,includeTangents:true}],
 ['paste expressions','ae.keys.paste','keys-copy.jsx',{pasteTime:'cti',mappingMode:'matchName',relativeTiming:true,includeExpressions:true,includeTangents:true}],
 ['delay','ae.keys.delay','keys-delay.jsx',{delayFrames:2,order:'timeline',reverse:false,randomSeed:0,shiftMode:'keyframes',spatialOrigin:[0,0]}]
];
for(const [label,command,file,args] of cases)for(const fail of [false,true])test(`${label}: native sibling-selection invalidation is repaired after ${fail?'partial failure':'success'}`,async()=>{
 const props=['Opacity','Rotation'].map(name=>new FakeProperty(name,[makeKey(.2,20,20,30),makeKey(.9,90,30,40),makeKey(1.8,50,40,50)]));
 const layer={index:1,name:'Layer',parentProperty:null,startTime:0,inPoint:0,outPoint:8,locked:false};
 for(const p of props){p.parentProperty=layer;p.selected=true;const remove=p.removeKey.bind(p);p.removeKey=i=>{for(const sibling of props)if(sibling!==p)for(const key of sibling.keys)key.selected=false;remove(i);};}
 const comp=new FakeCompItem(props);comp.numLayers=1;comp.layer=()=>layer;comp.selectedLayers=[layer];comp.width=640;comp.height=360;comp.time=3;
 const scope=await loadHostModules(['generated/motion-contracts.jsx','generated/motion-descriptors.jsx','src/json.jsx','src/undo.jsx','src/registry.jsx','src/keyframe-operations.jsx',`src/commands/${file}`,'src/dispatch.jsx'],{app:{project:{activeItem:comp,expressionEngine:'javascript-1.0'},beginUndoGroup(){},endUndoGroup(){}},CompItem:FakeCompItem,Property:FakeProperty,PropertyType,PropertyValueType,KeyframeEase:FakeKeyframeEase,KeyframeInterpolationType:{LINEAR:1,BEZIER:2,HOLD:3}});
 const send=(id,input)=>JSON.parse(scope.MotionAE.dispatch(JSON.stringify({protocolVersion:1,requestId:id,command:id,args:input,context:{host:'after-effects',hostVersion:'26.5',locale:'pt-BR'},options:{}})));
 if(command==='ae.keys.paste'){
  for(const p of props){p.expression='value + 20';p.expressionEnabled=true;}
  assert.equal(send('ae.keys.copy',{}).ok,true);
  for(const p of props){p.expression='value + 1';p.expressionEnabled=false;}
 }
 const before=props.map(p=>p.keys.map(k=>({time:k.time,value:k.value,selected:k.selected})));
 if(fail)props[1].falhaEm=2;
 const response=send(command,args);assert.equal(response.ok,!fail,JSON.stringify(response));
 for(const p of props)assert.ok(p.keys.every(k=>k.selected),`${p.name}: key selection lost`);
 if(fail)assert.deepEqual(props.map(p=>p.keys.map(k=>({time:k.time,value:k.value,selected:k.selected}))),before);
 if(command==='ae.keys.paste')for(const p of props){assert.equal(p.expression,args.includeExpressions&&!fail?'value + 20':'value + 1');assert.equal(p.expressionEnabled,args.includeExpressions&&!fail);}
});
