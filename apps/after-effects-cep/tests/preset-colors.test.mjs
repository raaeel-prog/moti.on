import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './preset-phases-harness.mjs';

function shape(f){
  const contents=new f.Group('ADBE Root Vectors Group',f.layer),fill=new f.Group('ADBE Vector Graphic - Fill',contents,{'ADBE Vector Fill Color':[.2,.4,.6,.7]});
  contents.children.push(fill);const original=f.layer.property.bind(f.layer);f.layer.property=key=>key==='ADBE Root Vectors Group'?contents:original(key);
  return fill.property('ADBE Vector Fill Color');
}
function text(f,{mixed=false,animated=false}={}){
  const doc={text:'Hello\rWorld',font:'UserFont',fontSize:42,fillColor:[.1,.2,.3],strokeColor:[.5,.6,.7]};
  doc.characterRange=()=>({applyFill:true,applyStroke:false,get fillColor(){return mixed?undefined:doc.fillColor;},set fillColor(color){doc.fillColor=color;}});
  const source=new f.Property('ADBE Text Document',doc,f.layer.text);if(animated)source.keys=[{time:0,value:doc}];f.layer.text.children.push(source);return source;
}
test('static shape colors inspect without mutation and changing RGB preserves alpha and recipes',async()=>{
  const f=await fixture(),color=shape(f);f.run('phase-apply',f.args('premium-arc-arrival',{phase:'both'}));
  const before=f.mutations,state=f.run('inspect').data,phases=JSON.stringify(state.phases),comment=f.layer.comment;
  assert.equal(f.mutations,before);assert.equal(state.colors[0].hex,'#336699');assert.deepEqual(state.selection,[{id:f.layer.id,name:f.layer.name}]);
  f.run('color-adjust',{target:state.colorTarget,key:state.colors[0].key,hex:'#FF0000'});
  assert.deepEqual(color.value,[1,0,0,.7]);assert.equal(f.layer.comment,comment);assert.equal(JSON.stringify(f.run('inspect').data.phases),phases);
});
test('animated colors and expressions remain visible but cannot be flattened',async()=>{
  for(const kind of ['keys','expression','locked']){
    const f=await fixture(),color=shape(f);if(kind==='keys')color.keys=[{time:0,value:color.value}];if(kind==='expression')color.expression='value';if(kind==='locked')f.layer.locked=true;
    const state=f.run('inspect').data,before=f.mutations;assert.equal(state.colors[0].available,false);
    assert.ok(f.handler('color-adjust').preflight({target:state.colorTarget,key:state.colors[0].key,hex:'#FF0000'}));assert.equal(f.mutations,before);
  }
});
test('stale color values, selection and arbitrary property keys are rejected before writing',async()=>{
  const f=await fixture(),color=shape(f),state=f.run('inspect').data;
  color.setValue([.3,.4,.5,1]);let before=f.mutations;
  assert.ok(f.handler('color-adjust').preflight({target:state.colorTarget,key:state.colors[0].key,hex:'#FFFFFF'}));assert.equal(f.mutations,before);
  const fresh=f.run('inspect').data;assert.ok(f.handler('color-adjust').preflight({target:fresh.colorTarget,key:'ADBE Transform Group',hex:'#FFFFFF'}));
  f.layer.selected=false;assert.ok(f.handler('color-adjust').preflight({target:fresh.colorTarget,key:fresh.colors[0].key,hex:'#FFFFFF'}));assert.equal(f.mutations,before);
});
test('text color changes preserve source, font and size; mixed color styles remain unavailable',async()=>{
  const f=await fixture({text:true}),source=text(f),state=f.run('inspect').data;assert.equal(state.colors.length,1);
  f.run('color-adjust',{target:state.colorTarget,key:'text.fill',hex:'#ABCDEF'});
  assert.deepEqual(source.value.fillColor,[171/255,205/255,239/255]);assert.equal(source.value.font,'UserFont');assert.equal(source.value.fontSize,42);assert.equal(source.value.text,'Hello\rWorld');
  const mixed=await fixture({text:true});text(mixed,{mixed:true});assert.equal(mixed.run('inspect').data.colors[0].available,false);
  const animated=await fixture({text:true});text(animated,{animated:true});assert.equal(animated.run('inspect').data.colors[0].available,false);
});
test('failed color write restores the original static color',async()=>{
  const f=await fixture(),color=shape(f),state=f.run('inspect').data,initial=[...color.value],set=color.setValue.bind(color);let first=true;
  color.setValue=value=>{set(value);if(first){first=false;throw Error('simulated host write failure');}};
  assert.throws(()=>f.run('color-adjust',{target:state.colorTarget,key:state.colors[0].key,hex:'#000000'}),/simulated/);assert.deepEqual(color.value,initial);
});

