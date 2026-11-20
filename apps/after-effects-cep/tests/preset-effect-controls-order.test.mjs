import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './preset-phases-harness.mjs';

const names=f=>Array.from({length:f.layer.effects.numProperties},(_,i)=>f.layer.effects.property(i+1).name);

test('Effect Controls reads by phase and group instead of the internal instance id',async()=>{
  const f=await fixture();
  f.run('phase-apply',f.args('premium-arc-arrival',{phase:'in',durationFrames:20,easing:'spring'}));
  f.run('phase-apply',f.args('premium-spiral-unfold',{phase:'out',durationFrames:30}));
  const list=names(f);
  assert.ok(list.length>0);
  for(const name of list){
    assert.match(name,/^Moti\.on (In|Out) · (Tempo|Movimento|Visual) · /,name);
    assert.doesNotMatch(name,/\d{6,}/,'no timestamp in the visible name');
  }
  // Inside each phase, timing controls come before motion controls.
  for(const phase of ['In','Out']){
    const mine=list.filter(n=>n.startsWith(`Moti.on ${phase} · `)&&!n.includes(' · Visual · '));
    const firstMotion=mine.findIndex(n=>n.includes(' · Movimento · ')),lastTiming=mine.map(n=>n.includes(' · Tempo · ')).lastIndexOf(true);
    assert.ok(firstMotion<0||lastTiming<firstMotion,`${phase}: ${mine.join(' | ')}`);
  }
  assert.ok(list.some(n=>n==='Moti.on In · Tempo · Duração (frames)'));
  assert.ok(list.some(n=>n==='Moti.on In · Movimento · Intensidade (%)'));
  // The layer still inspects, adjusts and removes cleanly.
  let state=f.run('inspect').data;assert.equal(state.state,'ready');
  f.run('phase-adjust',{target:state.target,phase:'in',presetId:state.phases[0].presetId,options:{...state.phases[0].options,intensity:40}});
  state=f.run('inspect').data;assert.equal(state.phases[0].options.intensity,40);
  assert.deepEqual(names(f),list,'adjusting keeps names and order');
  f.run('phase-action',{target:state.target,phase:'in',action:'remove'});
  state=f.run('inspect').data;f.run('phase-action',{target:state.target,phase:'out',action:'remove'});
  assert.equal(f.layer.effects.numProperties,0);
});

test('a render effect keeps its place among the user effects',async()=>{
  const f=await fixture();
  f.run('phase-apply',f.args('premium-arc-arrival',{phase:'in',durationFrames:20}));
  const visual=names(f).filter(n=>n.includes(' · Visual · '));
  const before=names(f).filter(n=>visual.includes(n));
  f.run('phase-apply',f.args('premium-spiral-unfold',{phase:'out',durationFrames:30}));
  assert.deepEqual(names(f).filter(n=>before.includes(n)),before,'render order unchanged');
});

test('a layer animated by the previous version (instance names, no label) still reads, adjusts (taking the readable names) and removes',async()=>{
  const f=await fixture();
  f.run('phase-apply',f.args('premium-arc-arrival',{phase:'in',durationFrames:20}));
  // Rewrite what the new version created into what the previous one wrote: no label, instance-named parts.
  const tag='[Moti.on.library.v3]',[head,tail]=f.layer.comment.split(tag),line=tail.split('\n')[0],root=JSON.parse(decodeURIComponent(line));
  const slot=root.slots.in.meta,from='Moti.on In · ',to=`Moti.on ${slot.instance} · `;
  const rename=name=>name.startsWith(from)?to+name.slice(from.length).replace(/^(Tempo|Movimento|Visual) · /,''):name;
  for(const group of [f.layer.effects,f.layer.text?.property('ADBE Text Animators')].filter(Boolean))for(const p of group.children)p.name=rename(p.name);
  for(const list of [slot.effects,slot.animators,slot.masks])for(const r of list)r.name=rename(r.name);
  for(const key of Object.keys(slot.controls??{}))slot.controls[key]=rename(slot.controls[key]);
  for(const e of slot.expressions)e.path=e.path.map(rename);
  delete slot.label;
  for(const g of [f.layer.effects])for(const p of g.children)for(const q of p.children??[])if(q.expression)q.expression=q.expression.split(from).join(to).replace(/(Moti\.on [0-9-]+ · )(Tempo|Movimento) · /g,'$1');
  f.layer.comment=head+tag+encodeURIComponent(JSON.stringify(root))+tail.slice(line.length);
  let state=f.run('inspect');assert.equal(state.data?.state,'ready',JSON.stringify(state).slice(0,400));
  f.run('phase-adjust',{target:state.data.target,phase:'in',presetId:state.data.phases[0].presetId,options:{...state.data.phases[0].options,intensity:40}});
  state=f.run('inspect');assert.equal(state.data.phases[0].options.intensity,40);
  assert.ok(names(f).every(n=>n.startsWith('Moti.on In · ')),'an adjusted legacy phase is rebuilt with readable names: '+names(f).join(' | '));
  f.run('phase-action',{target:state.data.target,phase:'in',action:'remove'});
  assert.equal(f.layer.effects.numProperties,0);
});
