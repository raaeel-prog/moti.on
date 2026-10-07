import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './preset-phases-harness.mjs';

test('entrance and exit use different recipes, independent controls, and restore only their own contributions',async()=>{
  const f=await fixture();
  f.run('phase-apply',f.args('premium-arc-arrival',{phase:'in',durationFrames:20}));
  f.run('phase-apply',f.args('premium-spiral-unfold',{phase:'out',durationFrames:30}));
  const read=()=>f.run('inspect').data;
  let state=read();assert.equal(state.state,'ready');assert.equal(state.phases.length,2);
  assert.equal(state.phases[0].presetId,'premium-arc-arrival');assert.equal(state.phases[1].presetId,'premium-spiral-unfold');
  const exit=JSON.stringify(state.phases[1]);
  f.run('phase-adjust',{target:state.target,phase:'in',presetId:state.phases[0].presetId,options:{...state.phases[0].options,intensity:40}});
  state=read();assert.equal(state.phases[0].options.intensity,40);assert.equal(JSON.stringify(state.phases[1]),exit);
  f.run('phase-action',{target:state.target,phase:'in',action:'remove'});
  state=read();assert.equal(state.phases.length,1);assert.equal(state.phases[0].phase,'out');assert.equal(JSON.stringify(state.phases[0]),exit);
  f.run('phase-action',{target:state.target,phase:'out',action:'remove'});
  assert.equal(f.layer.comment,'Keep this comment');assert.equal(f.layer.effects.numProperties,0);assert.equal(f.layer.markers.numKeys,0);
});

test('shared transformations evaluate additive position and multiplicative opacity without contaminating phases',async()=>{
  const f=await fixture();
  const recipe='premium-arc-arrival';f.run('phase-apply',f.args(recipe,{phase:'both',durationFrames:20}));
  const opacity=f.layer.transform.property('ADBE Opacity');
  assert.equal(opacity.valueAtTime(2),100);assert.equal(opacity.valueAtTime(0),0);assert.equal(opacity.valueAtTime(4),0);
  const original=f.layer.transform.property('ADBE Position').value;
  assert.deepEqual(Array.from(f.layer.transform.property('ADBE Position').valueAtTime(2)),original.slice(0,2));
  assert.ok(opacity.expression.startsWith('// Moti.on phases v2:'));
});

test('timing shifts owned cues in integer frames, retains payload, boundaries and rejects stale identity',async()=>{
  const f=await fixture({fps:30000/1001});f.run('phase-apply',f.args('premium-arc-arrival',{phase:'both',durationFrames:20}));
  const first=f.run('inspect').data,oldIn=first.phases[0].markerTime;
  f.run('phase-timing',{target:first.target,phase:'in',frames:3});const next=f.run('inspect').data;
  assert.ok(Math.abs(next.phases[0].markerTime-oldIn-3*f.comp.frameDuration)<1e-9);assert.equal(next.phases[1].markerTime,first.phases[1].markerTime);
  assert.equal(f.layer.inPoint,0);assert.equal(f.layer.outPoint,4);
  const before=f.mutations;assert.equal(f.handler('phase-timing').preflight({target:first.target,phase:'in',frames:1}).code,'INVALID_PRESET');assert.equal(f.mutations,before);
});

test('legacy Both remains untouched on inspect, migrates explicitly, retains its appearance and cues',async()=>{
  const f=await fixture();f.run('apply',f.args('premium-arc-arrival',{phase:'both',durationFrames:20}));
  const before=f.layer.comment,opacity=f.layer.transform.property('ADBE Opacity'),samples=[0,.2,1,2,3.8,4].map(t=>opacity.valueAtTime(t));
  const state=f.run('inspect').data;assert.equal(f.layer.comment,before);assert.equal(state.phases,undefined);
  f.run('phase-timing',{target:state.target,phase:'in',frames:0});
  assert.equal(f.run('inspect').data.phases.length,2);for(const [i,t]of [0,.2,1,2,3.8,4].entries())assert.ok(Math.abs(opacity.valueAtTime(t)-samples[i])<1e-8);
  assert.equal(f.layer.markers.numKeys,2);
});

test('adjustments preserve hand-positioned cues and resetting one phase leaves the other recipe untouched',async()=>{
  const f=await fixture();f.run('phase-apply',f.args('premium-arc-arrival',{phase:'both',durationFrames:20}));
  let state=f.run('inspect').data;f.run('phase-timing',{target:state.target,phase:'in',frames:5});state=f.run('inspect').data;
  const cue=state.phases[0].markerTime,exit=JSON.stringify(state.phases[1]);
  // Object key order is irrelevant to the opaque target identity.
  const target={fingerprint:state.target.fingerprint,instance:state.target.instance,layerId:state.target.layerId,compId:state.target.compId};
  f.run('phase-adjust',{target,phase:'in',presetId:state.phases[0].presetId,options:{...state.phases[0].options,intensity:75}});
  state=f.run('inspect').data;assert.equal(state.phases[0].markerTime,cue);assert.equal(JSON.stringify(state.phases[1]),exit);
  f.run('phase-action',{target:state.target,phase:'in',action:'reset'});state=f.run('inspect').data;
  assert.equal(state.phases[0].options.intensity,100);assert.equal(JSON.stringify(state.phases[1]),exit);
});

test('splitting a coincident legacy cue preserves payload in both independent markers',async()=>{
  const f=await fixture();f.run('apply',f.args('premium-arc-arrival',{phase:'both',durationFrames:60}));assert.equal(f.layer.markers.numKeys,1);
  const marker=f.layer.markers.keyValue(1);Object.assign(marker,{comment:'User cue',chapter:'Chapter',url:'https://example.test',frameTarget:'frame',duration:.1,cuePointName:'custom',eventCuePoint:true,label:4,protectedRegion:true});
  marker.setParameters({...marker.getParameters(),custom:'preserve'});f.layer.markers.setValueAtTime(2,marker);
  const state=f.run('inspect').data;f.run('phase-timing',{target:state.target,phase:'in',frames:-1});assert.equal(f.layer.markers.numKeys,2);
  for(let i=1;i<=2;i++){const cue=f.layer.markers.keyValue(i);assert.equal(cue.getParameters().custom,'preserve');assert.equal(cue.comment,'User cue');assert.equal(cue.duration,.1);assert.equal(cue.label,4);assert.equal(cue.protectedRegion,true);assert.equal(cue.getParameters()['Moti.on.phase'],i===1?'in':'out');}
});

test('tampered phase paths and control identities fail before touching user content',async()=>{
  for(const tamper of [root=>root.slots.in.meta.effects[0].name='User slider',root=>root.shared[0].path=['ADBE Transform Group','ADBE Anchor Point'],root=>root.slots.in.meta.instance+='-999']){
    const f=await fixture();f.run('phase-apply',f.args('premium-arc-arrival',{phase:'in'}));const state=f.run('inspect').data,tag='[Moti.on.library.v2]',root=f.scope.MotionPresetPhases.metadata(f.layer);
    tamper(root);f.layer.comment='Keep this comment\n'+tag+encodeURIComponent(JSON.stringify(root));const before=f.mutations;
    assert.equal(f.run('inspect').data.state,'conflict');assert.ok(f.handler('phase-action').preflight({target:state.target,phase:'in',action:'remove'}));assert.equal(f.mutations,before);
  }
});

test('a multiple-phase selection reports the single-layer editor limit explicitly',async()=>{
  const f=await fixture(),second=new f.Layer(false);second.containingComp=f.comp;f.comp.layers.push(second);f.run('phase-apply',f.args('premium-arc-arrival',{phase:'both'}));
  const state=f.run('inspect').data;assert.equal(state.state,'multiple');assert.match(state.message,/uma camada/);assert.equal(state.selection.length,2);assert.equal(state.target,undefined);
});

