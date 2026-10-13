import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './preset-phases-harness.mjs';

const entrance='text-v3-characters-position-rise',exit='text-v3-characters-rotate-pitch-3d',effect='text-v3-characters-loop-drift';
const inspection=f=>f.run('inspect').data;
const root=f=>f.scope.MotionPresetPhases.metadata(f.layer);
const animators=f=>f.layer.text.property('ADBE Text Animators');

test('v3 keeps IN, OUT and a marker-free continuous effect independent through adjust, reset and removal',async()=>{
  const f=await fixture({text:true}),source=f.layer.sourceText;
  f.run('apply',f.args(entrance,{phase:'in'}));
  f.run('phase-apply',f.args(exit,{phase:'out'}));
  const before=inspection(f),cues=JSON.stringify(f.layer.markers.keys);
  f.run('apply',f.args(effect));let state=inspection(f);
  assert.equal(root(f).version,3);assert.equal(state.phases.length,2);
  assert.deepEqual(state.phases,before.phases);assert.equal(JSON.stringify(f.layer.markers.keys),cues);
  assert.equal(root(f).textEffect.meta.markerVersion,undefined);assert.equal(state.textEffect.presetId,effect);
  assert.equal(f.layer.threeDPerChar,true);
  f.run('text-effect-adjust',{target:state.target,presetId:effect,options:{...state.textEffect.options,speed:75,intensity:45}});
  state=inspection(f);assert.equal(state.textEffect.options.speed,75);assert.deepEqual(state.phases,before.phases);
  f.run('text-effect-action',{target:state.target,action:'reset'});state=inspection(f);
  assert.equal(state.textEffect.options.intensity,100);assert.equal(state.textEffect.options.speed,f.args(effect).speed);
  const effectSnapshot=JSON.stringify(state.textEffect);
  f.run('phase-action',{target:state.target,phase:'in',action:'remove'});state=inspection(f);
  assert.equal(JSON.stringify(state.textEffect),effectSnapshot);assert.equal(state.phases.length,1);
  f.run('phase-action',{target:state.target,phase:'out',action:'remove'});state=inspection(f);
  assert.equal(state.phases.length,0);assert.equal(f.layer.markers.numKeys,0);assert.equal(state.state,'ready');
  f.run('text-effect-action',{target:state.target,action:'remove'});
  assert.equal(f.layer.comment,'Keep this comment');assert.equal(f.layer.effects.numProperties,0);assert.equal(animators(f).numProperties,0);
  assert.equal(f.layer.threeDPerChar,false);assert.equal(f.layer.threeDLayer,false);assert.equal(f.layer.sourceText,source);
});

test('repeated applications do not accumulate controls, selectors or markers',async()=>{
  const f=await fixture({text:true});f.run('apply',f.args(exit,{phase:'both'}));f.run('apply',f.args(effect));
  const counts=()=>[f.layer.effects.numProperties,animators(f).numProperties,f.layer.markers.numKeys];
  const expected=counts(),identities=inspection(f).phases.map(p=>p.instance);
  for(let i=0;i<3;i++){f.run('apply',f.args(exit,{phase:'both'}));f.run('apply',f.args(effect));assert.deepEqual(counts(),expected);}
  assert.deepEqual(inspection(f).phases.map(p=>p.instance),identities);
});

test('text selectors read live numeric Property controls for spring and settle curves',async()=>{
  for(const [easing,key,first,last] of [['spring','elasticity',0,100],['settle-wave','settleAmount',0,80]]){
    const f=await fixture({text:true});
    f.run('phase-apply',f.args(entrance,{phase:'in',easing,[key]:first}));
    const selector=animators(f).children[0].property('ADBE Text Selectors').property('Moti.on Timing').property('ADBE Text Expressible Amount');
    const control=f.layer.effects.property(root(f).slots.in.meta.controls[key]).property(1);
    const sample=time=>{const value=selector.valueAtTime(time,false,0,7);return Array.isArray(value)?value[0]:value;};
    const times=[.2,.4,.6,.7,.8,.9],before=times.map(sample);
    control.setValue(last);
    const after=times.map(sample);
    assert.ok(after.some((value,index)=>Math.abs(value-before[index])>.01),`${easing} must change the evaluated selector when its live slider changes`);
  }
});

test('3D text creates X/Y/Z and depth animators, preserves grouping, and restores it only on final removal',async()=>{
  const f=await fixture({text:true}),group=f.layer.text.property('ADBE Text More Options').property('ADBE Text Anchor Point Option');
  group.setValue(4);f.run('apply',f.args(exit,{phase:'in'}));
  assert.equal(group.value,1);assert.equal(f.layer.threeDPerChar,true);
  const names=animators(f).children.flatMap(a=>a.property('ADBE Text Animator Properties').children.map(p=>p.matchName));
  assert.ok(names.includes('ADBE Text Rotation X'));assert.ok(names.includes('ADBE Text Rotation'));assert.ok(names.includes('ADBE Text Position 3D'));
  const yaw=await fixture({text:true});yaw.run('apply',yaw.args('text-v3-characters-rotate-yaw-3d'));
  assert.ok(animators(yaw).children.some(a=>a.property('ADBE Text Animator Properties').property('ADBE Text Rotation Y')));
  f.run('apply',f.args(effect));f.run('phase-action',{target:inspection(f).target,phase:'in',action:'remove'});
  assert.equal(group.value,1);assert.equal(f.layer.threeDPerChar,true);
  f.run('remove',{target:inspection(f).target});assert.equal(group.value,4);assert.equal(f.layer.threeDPerChar,false);
});

test('unsupported 3D, locked layers, conflicting grouping and altered expressions fail before mutation',async()=>{
  for(const setup of [f=>{delete f.layer._threeDPerChar;},f=>{f.layer.locked=true;},f=>{
    f.run('phase-apply',f.args('text-v3-words-rotate-pitch-3d',{phase:'in'}));
  }]){
    const f=await fixture({text:true});setup(f);const before=f.mutations;
    assert.ok(f.handler('phase-apply').preflight(f.args(exit,{phase:'out'})));assert.equal(f.mutations,before);
  }
  const f=await fixture({text:true});f.run('apply',f.args(effect));const state=inspection(f);
  const selector=animators(f).children[0].property('ADBE Text Selectors').property('Moti.on Timing').property('ADBE Text Expressible Amount');
  selector.expression+='\n// user edit';const before=f.mutations;
  assert.ok(f.handler('text-effect-action').preflight({target:state.target,action:'remove'}));assert.equal(f.mutations,before);
});

test('v2 metadata migrates only during editing and retains instances and marker payload',async()=>{
  const f=await fixture({text:true});f.run('phase-apply',f.args(entrance,{phase:'both'}));
  const legacy=root(f);legacy.version=2;delete legacy.textEffect;
  f.layer.comment='Keep this comment\n[Moti.on.library.v2]'+encodeURIComponent(JSON.stringify(legacy));
  const comment=f.layer.comment,state=inspection(f),markers=JSON.stringify(f.layer.markers.keys);
  assert.equal(f.layer.comment,comment);f.run('apply',f.args(effect));
  assert.equal(root(f).version,3);assert.deepEqual(inspection(f).phases,state.phases);assert.equal(JSON.stringify(f.layer.markers.keys),markers);
});

test('a partial application failure restores all components and text state',async()=>{
  const f=await fixture({text:true});f.run('phase-apply',f.args(entrance,{phase:'both'}));f.run('apply',f.args(effect));
  const before=inspection(f),comment=f.layer.comment,markers=JSON.stringify(f.layer.markers.keys),oldAdd=f.Group.prototype.addProperty;
  let armed=true;f.Group.prototype.addProperty=function(name){if(armed&&name==='ADBE Text Rotation X'){armed=false;throw new Error('Injected animator failure');}return oldAdd.call(this,name);};
  assert.throws(()=>f.run('phase-apply',f.args(exit,{phase:'out'})),/Injected animator failure/);
  assert.deepEqual(inspection(f),before);assert.equal(f.layer.comment,comment);assert.equal(JSON.stringify(f.layer.markers.keys),markers);assert.equal(f.layer.threeDPerChar,false);
});
