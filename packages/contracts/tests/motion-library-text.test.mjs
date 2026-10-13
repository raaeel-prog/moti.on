import test from 'node:test';
import assert from 'node:assert/strict';
import {MOTION_LIBRARY_PRESETS,MOTION_LIBRARY_DEFAULTS,isMotionLibraryOptions} from '../dist/motion-library.js';
import {motionLibraryRequirements} from '../dist/motion-library-requirements.js';

const text=MOTION_LIBRARY_PRESETS.filter(p=>p.collection==='text');
test('original text collection covers 108 stable variants, three segmentation units and ten useful families',()=>{
  assert.equal(text.length,108);assert.equal(new Set(text.map(p=>p.id)).size,108);
  assert.equal(text.filter(p=>p.mode==='transition').length,96);assert.equal(text.filter(p=>p.mode==='continuous').length,12);
  assert.deepEqual([...new Set(text.map(p=>p.textFamily))].sort(),['combination','decode','fade','loop','mask','position','rotate','scale','tracking','typewriter']);
  for(const unit of ['characters','words','lines']){
    const transitions=text.filter(p=>p.text.unit===unit&&p.mode==='transition');assert.equal(transitions.length,32);
    for(const family of ['fade','position','rotate','scale'])assert.equal(transitions.filter(p=>p.textFamily===family&&p.text.dimension==='2d').length,4,`${unit} ${family}`);
  }
  for(const p of text){assert.match(p.id,/^text-v3-(characters|words|lines)-/);assert.ok(p.textVariant.id);assert.ok(isMotionLibraryOptions({...MOTION_LIBRARY_DEFAULTS,...p.defaults}));assert.equal(p.referenceIndex,null);}
});
test('true 3D text declares native 3D capability and actual depth or X/Y rotation',()=>{
  const presets=text.filter(p=>p.text.dimension==='3d');assert.equal(presets.length,20);
  for(const p of presets){assert.equal(motionLibraryRequirements(p).threeD,true,p.id);assert.ok(p.position[2]||p.rotation[0]||p.rotation[1],p.id);}
});
