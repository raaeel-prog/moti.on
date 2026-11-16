import test from 'node:test';
import assert from 'node:assert/strict';
import {MOTION_LIBRARY_PRESETS,MOTION_LIBRARY_DEFAULTS,isMotionLibraryOptions} from '../dist/motion-library.js';
import {motionLibraryRequirements} from '../dist/motion-library-requirements.js';
import {libraryWave} from '../dist/motion-library-math.js';

const text=MOTION_LIBRARY_PRESETS.filter(p=>p.collection==='text'),offered=text.filter(p=>!p.retired);
test('original text collection offers 196 stable variants, three segmentation units and ten useful families',()=>{
  assert.equal(text.length,208);assert.equal(new Set(text.map(p=>p.id)).size,208);assert.equal(offered.length,196);
  assert.equal(offered.filter(p=>p.mode==='transition').length,175);assert.equal(offered.filter(p=>p.mode==='continuous').length,21);
  assert.deepEqual([...new Set(text.map(p=>p.textFamily))].sort(),['combination','decode','fade','loop','mask','position','rotate','scale','tracking','typewriter']);
  const transitions=unit=>offered.filter(p=>p.text.unit===unit&&p.mode==='transition');
  assert.deepEqual(['characters','words','lines','all'].map(unit=>transitions(unit).length),[62,61,51,1]);
  for(const unit of ['characters','words','lines'])
    for(const family of ['fade','position','rotate','scale','tracking','mask','typewriter','decode','combination'])assert.ok(transitions(unit).some(p=>p.textFamily===family),`${unit} ${family}`);
  for(const p of text){assert.match(p.id,/^text-v3-(characters|words|lines)-/);assert.ok(p.textVariant.id);assert.ok(isMotionLibraryOptions({...MOTION_LIBRARY_DEFAULTS,...p.defaults}));assert.equal(p.referenceIndex,null);}
});
test('true 3D text declares native 3D capability and actual depth or X/Y rotation',()=>{
  const presets=text.filter(p=>p.text.dimension==='3d');assert.equal(presets.length,29);
  for(const p of presets){assert.equal(motionLibraryRequirements(p).threeD,true,p.id);assert.ok(p.position[2]||p.rotation[0]||p.rotation[1],p.id);}
});
test('the measured behaviours from the study each have an own recipe',()=>{
  const ids=new Set(text.map(p=>p.id));
  for(const id of ['text-v3-characters-rotate-arc','text-v3-words-rotate-arc-top','text-v3-characters-scale-sprout','text-v3-words-scale-grow-top',
    'text-v3-lines-tracking-converge','text-v3-characters-rotate-flip-3d','text-v3-lines-rotate-flip-x-3d','text-v3-words-combination-spark-scale',
    'text-v3-characters-tracking-rebound','text-v3-lines-decode-scan','text-v3-lines-position-single-block','text-v3-characters-loop-stepped-jitter',
    'text-v3-characters-loop-scatter-pulse'])assert.ok(ids.has(id),id);
  const block=text.find(p=>p.id==='text-v3-lines-position-single-block');
  assert.equal(block.text.unit,'all');assert.equal(block.category,'text-lines');
});
test('stepped jitter holds each value for an eighth of a second and burst rests between scatters',()=>{
  for(let step=0;step<16;step++){const t=step/8;assert.equal(libraryWave(t+.01,2,'stepped',17),libraryWave(t+.12,2,'stepped',17),`held at ${t}`);}
  assert.notEqual(libraryWave(.01,2,'stepped',17),libraryWave(.13,2,'stepped',17));
  for(const axis of [0,3,6]){
    assert.ok(Math.abs(libraryWave(0,axis,'burst',31))<1e-6,'assembled at the start');
    assert.ok(Math.abs(libraryWave(.999999,axis,'burst',31)-libraryWave(1,axis,'burst',31))<1e-6,'no seam at the wrap');
  }
  assert.notEqual(libraryWave(.5,0,'burst',31),libraryWave(.5,3,'burst',31),'units scatter in different directions');
});
test('title arrivals: an impact slam, a zipper, a slanted window and a colour sweep, in every unit they read in',()=>{
  const ids=new Set(text.map(p=>p.id));
  for(const unit of ['characters','words','lines'])for(const id of ['impact','slant-window'])assert.ok(ids.has(`text-v3-${unit}-${id==='impact'?'scale':'mask'}-${id}`),`${unit} ${id}`);
  for(const unit of ['characters','words']){assert.ok(ids.has(`text-v3-${unit}-position-zipper`));assert.ok(ids.has(`text-v3-${unit}-combination-color-rise`));}
  assert.ok(ids.has('text-v3-characters-rotate-flap-3d'),'the split-flap now turns letters too');
  const zipper=text.find(p=>p.id==='text-v3-characters-position-zipper');assert.equal(zipper.choreography.distribution,'alternate');
});
test('distances are drawn for the unit sample: windows hide a whole line, origins are em offsets from the visual centre',()=>{
  const reference={characters:256,words:168,lines:216,all:256};
  for(const p of text.filter(p=>p.text.mask)){const travel=Math.hypot(p.position[0],p.position[1])/reference[p.text.unit];assert.ok(travel>=1.05&&travel<=1.15,`${p.id} ${travel}`);}
  for(const p of text.filter(p=>p.text.origin)){assert.equal(p.text.origin.length,3);assert.ok(p.text.origin.every(v=>Math.abs(v)<=3),p.id);}
  assert.ok(text.every(p=>!('pivot' in p.text)),'the drifting animator anchor is gone');
  assert.equal(text.find(p=>p.id==='text-v3-lines-position-single-block').travel,'offscreen','the single block crosses the frame in frame pixels');
});
test('duplicates are retired, not deleted: layers that use them keep working, and each has an offered replacement',()=>{
  const retired=text.filter(p=>p.retired).map(p=>p.id).sort();
  assert.deepEqual(retired,['text-v3-characters-rotate-arc-top','text-v3-characters-scale-grow-base-spring','text-v3-characters-scale-grow-top','text-v3-characters-scale-stretch',
    'text-v3-characters-tracking-converge-spring','text-v3-lines-decode-scan-reverse','text-v3-lines-tracking-converge-spring','text-v3-words-rotate-arc-top',
    'text-v3-words-scale-grow-base-spring','text-v3-words-scale-grow-top','text-v3-words-scale-stretch','text-v3-words-tracking-converge-spring']);
  const ids=new Set(offered.map(p=>p.id));
  // What replaces each: the same motion from a side or with a Character, and a new motion beside it.
  for(const unit of ['characters','words'])for(const id of [`rotate-arc`,`scale-grow-base`,`scale-height`,`tracking-converge`,`rotate-somersault`,`scale-squash-landing`,`scale-baseline-fan`,`scale-rubber-slide`,`tracking-magnetic`])assert.ok(ids.has(`text-v3-${unit}-${id}`),`${unit} ${id}`);
  for(const id of ['decode-scan','decode-closing-code','tracking-magnetic','tracking-converge'])assert.ok(ids.has(`text-v3-lines-${id}`),id);
});
