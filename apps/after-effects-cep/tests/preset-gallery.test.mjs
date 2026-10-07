import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
const built=await build({entryPoints:[fileURLToPath(new URL('../client/src/preset-gallery.ts',import.meta.url))],bundle:true,platform:'node',format:'esm',write:false});
const {GALLERY_PRESETS,curveProgress,cameraPoint,presetArgs,defaultLibraryOptions,galleryCategoryMatches,gallerySequenceControls}=await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);

test('curated and legacy presets retain unique identities and real application handlers',()=>{
  assert.equal(GALLERY_PRESETS.length,214);assert.equal(new Set(GALLERY_PRESETS.map(p=>p.id )).size,214);
  for(const p of GALLERY_PRESETS){
    assert.ok(p.version&&p.displayName['pt-BR']&&p.displayName['en-US']&&p.preview.fixtureId);
    assert.equal(p.operationPlan.command,p.handler);
    assert.ok(['ae.keys.ease.apply','ae.camera.transition','ae.presets.apply','ae.presets.phase-apply','ae.presets.camera-transition'].includes(p.handler));
    assert.ok(p.requirements.length&&p.reapplyPolicy);
  }
});
test('camera transitions default to a precomp without requiring a selected layer',()=>{
  const presets=GALLERY_PRESETS.filter(p=>p.category==='camera-transitions');
  assert.equal(presets.length,35);
  for(const p of presets){
    assert.equal(p.handler,'ae.presets.camera-transition');
    assert.equal(p.applyMode,'precomp');
    assert.deepEqual(p.requirements,['active-composition']);
    assert.deepEqual(Object.keys(p.params).sort(),['durationFrames','intensity','presetId']);
  }
});
test('impact & shake filter lists exactly the ten precomp-only impact transitions',()=>{
  const impact=GALLERY_PRESETS.filter(p=>galleryCategoryMatches('camera-impact',p));
  assert.equal(impact.length,10);
  for(const p of impact){
    assert.equal(p.category,'camera-transitions');assert.equal(p.applyMode,'precomp');assert.equal(p.motion.collection,'premium');
    assert.ok(galleryCategoryMatches('camera-transitions',p)&&galleryCategoryMatches('premium-camera',p));
    assert.ok(/shake/.test(p.tags));
  }
  assert.ok(!GALLERY_PRESETS.some(p=>!p.motion?.cameraSpec?.impact&&galleryCategoryMatches('camera-impact',p)));
});
test('prévia das curvas respeita extremos e diferencia as seis velocidades',()=>{
  const presets=GALLERY_PRESETS.filter(p=>p.category==='ease');
  for(const p of presets){assert.ok(Math.abs(curveProgress(p.curve,0))<1e-8);assert.ok(Math.abs(curveProgress(p.curve,1)-1)<1e-8);}
  assert.equal(new Set(presets.map(p=>[.2,.5,.8].map(t=>curveProgress(p.curve,t).toFixed(5)).join(','))).size,6);
});
test('prévia de câmera separa deslocamento, giro, zoom e profundidade',()=>{
  const point=[200,100,0];const center=cameraPoint('truckRight',0,point);
  assert.ok(cameraPoint('truckRight',1,point)[0]<center[0]);
  assert.ok(cameraPoint('truckLeft',1,point)[0]>center[0]);
  assert.ok(cameraPoint('craneUp',1,point)[1]>center[1]);
  const signatures=GALLERY_PRESETS.filter(p=>p.category==='camera').map(p=>[point,[500,200,-400]].map(v=>cameraPoint(p.params.preset,1,v).map(n=>n.toFixed(4)).join(',')).join('|'));
  assert.equal(new Set(signatures).size,11);
});
test('aplicação usa um segundo no fps atual; dimensões e fps não são alterados',()=>{
  for(const p of GALLERY_PRESETS){
    const args=presetArgs(p,{fps:24,compWidth:3840});
    assert.ok(!('width' in args)&&!('height' in args)&&!('frameRate' in args));
    if(p.category==='camera'){assert.equal(args.durationFrames,24);assert.equal(args.amount,/^(pan|tilt)/.test(p.params.preset)?15:800);}
  }
});

test('premium selection comes first while legacy collection IDs remain reachable',()=>{
  const premium=GALLERY_PRESETS.filter(p=>p.motion?.collection==='premium');
  assert.equal(premium.length,57);
  assert.deepEqual(GALLERY_PRESETS.slice(0,57),premium);
  assert.equal(GALLERY_PRESETS.filter(p=>galleryCategoryMatches('premium-motion',p)).length,12);
  assert.equal(GALLERY_PRESETS.filter(p=>galleryCategoryMatches('premium-text',p)).length,29);
  assert.equal(GALLERY_PRESETS.filter(p=>galleryCategoryMatches('premium-camera',p)).length,16);
  assert.ok(GALLERY_PRESETS.some(p=>galleryCategoryMatches('studio',p)));
  assert.ok(GALLERY_PRESETS.some(p=>galleryCategoryMatches('gemini',p)));
  assert.equal(GALLERY_PRESETS.filter(p=>galleryCategoryMatches('classics',p)).length,140);
  assert.ok(GALLERY_PRESETS.some(p=>p.id==='builtin.motion.arc-arrival'));
});
test('default options preserve original direction and authored hinge choices',()=>{
  for(const {motion:p} of GALLERY_PRESETS.filter(p=>p.motion))assert.equal(defaultLibraryOptions(p).direction,p.defaults?.direction??'preset',p.id);
  const arc=GALLERY_PRESETS.find(p=>p.motion?.id==='premium-arc-arrival').motion;
  assert.equal(defaultLibraryOptions(arc).direction,'preset');
});
test('order and variation controls follow text grouping and actual randomness',()=>{
  const find=id=>GALLERY_PRESETS.find(p=>p.motion?.id===id).motion;
  const p=find('premium-glyph-constellation'),o=defaultLibraryOptions(p);
  assert.deepEqual(gallerySequenceControls(p,o),{order:true,seed:true});
  assert.deepEqual(gallerySequenceControls(find('premium-arc-arrival'),o),{order:false,seed:false});
  const text=find('premium-glyph-ribbon'),settings=defaultLibraryOptions(text);
  assert.deepEqual(gallerySequenceControls(text,settings),{order:true,seed:false});
  assert.deepEqual(gallerySequenceControls(text,{...settings,order:'random'}),{order:true,seed:true});
  assert.deepEqual(gallerySequenceControls(text,{...settings,order:'random',unit:'all'}),{order:false,seed:false});
});

