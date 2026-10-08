import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
const built=await build({entryPoints:[fileURLToPath(new URL('../client/src/preset-gallery.ts',import.meta.url))],bundle:true,platform:'node',format:'esm',write:false});
const {GALLERY_PRESETS,curveProgress,cameraPoint,presetArgs,defaultLibraryOptions,galleryCategoryMatches,gallerySequenceControls,signatureDurationRange}=await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);

test('curated and legacy presets retain unique identities and real application handlers',()=>{
  assert.equal(GALLERY_PRESETS.length,232);assert.equal(new Set(GALLERY_PRESETS.map(p=>p.id )).size,232);
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
test('curve recipes are absent from the gallery; the shared curve evaluator remains correct',()=>{
  assert.equal(GALLERY_PRESETS.filter(p=>p.category==='ease').length,0);
  const curve={x1:.333,y1:0,x2:.667,y2:1};
  assert.ok(Math.abs(curveProgress(curve,0))<1e-8);assert.ok(Math.abs(curveProgress(curve,1)-1)<1e-8);
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
test('signature collection follows premium, filters by family and stays out of classics',()=>{
  const signature=GALLERY_PRESETS.filter(p=>p.motion?.collection==='signature');
  assert.equal(signature.length,24);
  assert.deepEqual(GALLERY_PRESETS.slice(57,81),signature,'signature is the block right after premium');
  assert.equal(GALLERY_PRESETS.filter(p=>galleryCategoryMatches('signature',p)).length,24);
  for(const family of ['essentials','cinema','light-matter','variation'])assert.equal(GALLERY_PRESETS.filter(p=>galleryCategoryMatches(`signature-${family}`,p)).length,6,family);
  assert.ok(!signature.some(p=>galleryCategoryMatches('classics',p)||galleryCategoryMatches('premium',p)));
  for(const p of signature){assert.ok(galleryCategoryMatches('text',p),p.id);assert.match(p.tags,new RegExp(`signature ${p.motion.family} ${p.motion.tempo.character}`));}
});
test('signature timing keeps its 30 fps feel at the composition rate and inside its tempo window',()=>{
  const burn=GALLERY_PRESETS.find(p=>p.motion?.id==='signature-film-burn').motion;
  assert.equal(defaultLibraryOptions(burn).durationFrames,48);
  assert.equal(defaultLibraryOptions(burn,60).durationFrames,96);
  assert.equal(defaultLibraryOptions(burn,60).staggerFrames,4);
  assert.equal(defaultLibraryOptions(burn,24).durationFrames,38);
  assert.equal(defaultLibraryOptions(burn,23.976).durationFrames,38);
  assert.deepEqual(signatureDurationRange(burn,30),[32,90]);
  assert.deepEqual(signatureDurationRange(burn,60),[64,180]);
  const legacy=GALLERY_PRESETS.find(p=>p.motion?.id==='arc-arrival').motion;
  assert.equal(defaultLibraryOptions(legacy,60).durationFrames,defaultLibraryOptions(legacy).durationFrames,'other collections keep composition frames');
  assert.deepEqual(signatureDurationRange(legacy,60),[1,600]);
  const halo=GALLERY_PRESETS.find(p=>p.motion?.id==='signature-halo-breath').motion;
  assert.deepEqual(signatureDurationRange(halo,60),[1,600],'loops are paced by Speed instead');
  const decode=GALLERY_PRESETS.find(p=>p.motion?.id==='signature-decode-resolve').motion;
  assert.equal(gallerySequenceControls(decode,defaultLibraryOptions(decode)).seed,true,'glyph variation is seeded');
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

