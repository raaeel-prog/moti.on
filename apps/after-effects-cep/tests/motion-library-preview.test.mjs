import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { createFakeDocument } from '../../../packages/ui-core/tests/fake-dom.mjs';

const compiled = await build({stdin:{contents:'export * from "./client/src/motion-library-preview.ts"; export { GALLERY_PRESETS, defaultLibraryOptions } from "./client/src/preset-gallery.ts";',resolveDir:fileURLToPath(new URL('..',import.meta.url))},bundle:true,format:'esm',platform:'node',write:false});
const {librarySample,libraryPreviewPlayback,libraryPreviewEnd,cameraTransitionSample,cameraPreviewPlayback,nativeLibraryPreviewSample,nativeCameraPreviewSample,impactCameraPreviewSample,libraryProjectPoint,paintLibraryPreview,GALLERY_PRESETS,defaultLibraryOptions}=await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);

test('camera overlay previews start neutral, peak at CUT, and settle without fading the scene',()=>{
  for(const {motion:p} of GALLERY_PRESETS.filter(p=>p.category==='camera-transitions')){
    const o=defaultLibraryOptions(p),duration=o.durationFrames/30;
    for(const t of [0,duration]){
      const sample=cameraTransitionSample(p,o,t);
      assert.equal(sample.weight,0,p.id);assert.equal(sample.opacity,1);assert.equal(sample.sx,1);assert.equal(Math.abs(sample.rz),0);
    }
    assert.equal(cameraTransitionSample(p,o,duration/2).weight,1,p.id);
    assert.equal(cameraPreviewPlayback(o,0).time,0);
    assert.equal(cameraPreviewPlayback(o,.2).time,0);
    const half=.35+Math.max(1.4,Math.min(3,duration))/2;
    assert.ok(Math.abs(cameraPreviewPlayback(o,half).time-duration/2)<1e-9);
    assert.equal(cameraPreviewPlayback(o,half).opacity,1);
    const zero=cameraTransitionSample(p,{...o,intensity:0},duration/2);
    assert.equal(zero.sx,1);assert.equal(Math.abs(zero.rz),0);
  }
});

test('every transition previews a transparent start, readable rest and transparent exit',()=>{
  const transitions=GALLERY_PRESETS.filter(p=>p.motion?.mode==='transition'&&!p.motion.effect.startsWith('camera-'));
  assert.equal(transitions.length,149);
  for(const {motion:p} of transitions){
    const o={...defaultLibraryOptions(p),phase:'both'},end=libraryPreviewEnd(o);
    for(let index=0;index<7;index++){
      assert.equal(librarySample(p,o,0,index,7).opacity,0,`${p.id} start`);
      assert.equal(librarySample(p,o,end/2,index,7).opacity,1,`${p.id} rest`);
      assert.equal(librarySample(p,o,end,index,7).opacity,0,`${p.id} exit`);
    }
  }
});

test('preview clock includes the first frame and a readable motion interval',()=>{
  const p=GALLERY_PRESETS.find(p=>p.motion?.id==='arc-arrival').motion;
  for(const durationFrames of [1,24,48,600]){
    const o={...defaultLibraryOptions(p),durationFrames,phase:'in'};
    assert.equal(libraryPreviewPlayback(p,o,0).time,0);
    assert.equal(libraryPreviewPlayback(p,o,.2).time,0);
    const middle=libraryPreviewPlayback(p,o,.9);
    assert.ok(middle.time>0&&middle.time<durationFrames/30);
    const shown=Math.max(1.4,Math.min(3,durationFrames/30));
    assert.equal(librarySample(p,o,libraryPreviewPlayback(p,o,.22+shown+.4).time).opacity,1);
    assert.ok(libraryPreviewPlayback(p,o,.22+shown+.8+.22).opacity<1e-9);
  }
});

test('chosen directions keep the same origin in the preview as the native recipe',()=>{
  const p=GALLERY_PRESETS.find(p=>p.motion?.id==='arc-arrival').motion;
  for(const [direction,axis,sign] of [['left','x',-1],['right','x',1],['top','y',-1],['bottom','y',1]]){
    const o={...defaultLibraryOptions(p),direction,phase:'in'};
    assert.ok(librarySample(p,o,.15)[axis]*sign>0,direction);
  }
});

test('native preview offsets match the bounded whole-layer envelope for zero, entrance, rest and exit',()=>{
  const native=GALLERY_PRESETS.filter(p=>p.motion?.collection==='native');
  assert.equal(native.length,4);
  for(const {motion:p} of native){
    const options=defaultLibraryOptions(p);
    for(const phase of ['in','out','both']){
      const o={...options,phase},end=libraryPreviewEnd(o),maximum=p.effectAmount/6;
      for(const time of [0,.15,end/2,end-.15,end]){
        const zero=nativeLibraryPreviewSample(p,{...o,intensity:0},time);
        assert.deepEqual(zero,{rgb:0,displacement:0},`${p.id}: zero`);
        const sample=nativeLibraryPreviewSample(p,o,time);
        assert.ok(sample.rgb>=0&&sample.rgb<=maximum,`${p.id}: bounded`);
        const stronger=nativeLibraryPreviewSample(p,{...o,intensity:300},time);
        assert.ok(stronger.rgb<=maximum&&stronger.rgb>=sample.rgb,`${p.id}: saturated`);
      }
      assert.equal(nativeLibraryPreviewSample(p,o,0).rgb,p.mode==='static'||phase!=='out'?maximum:0);
      assert.equal(nativeLibraryPreviewSample(p,o,end).rgb,p.mode==='static'||phase!=='in'?maximum:0);
      assert.equal(nativeLibraryPreviewSample(p,o,end/2).rgb,p.mode==='static'?maximum:0);
      assert.equal(nativeLibraryPreviewSample(p,o,phase==='out'?end:0).displacement,p.effect==='native-glitch'?64/6:0);
    }
  }
});

test('premium trajectories differ in travel, twist, squash and depth without a direction override',()=>{
  const presets=GALLERY_PRESETS.filter(p=>p.motion?.collection==='premium'&&!p.motion.cameraSpec);
  const signatures=presets.map(({motion:p})=>{
    const o=defaultLibraryOptions(p);
    return [.12,.32,.56,.8].map(t=>librarySample(p,o,o.durationFrames/30*t,2,7)).map(s=>[s.x,s.y,s.z,s.rx,s.ry,s.rz,s.sx,s.sy,s.opacity].map(n=>n.toFixed(5)).join(',')).join('|');
  });
  assert.equal(new Set(signatures).size,41);
  const p=presets.find(p=>p.motion.id==='premium-arc-arrival').motion,o=defaultLibraryOptions(p);
  const a=librarySample(p,o,.25),b=librarySample(p,o,.6);
  assert.ok(Math.abs(a.x*b.y-a.y*b.x)>1,'arc curves rather than just rising');
});
test('text sequence overrides and deterministic seeds change the intended units',()=>{
  const p=GALLERY_PRESETS.find(p=>p.motion?.id==='premium-glyph-constellation').motion,o=defaultLibraryOptions(p);
  const sample=seed=>Array.from({length:7},(_,i)=>librarySample(p,{...o,seed},.4,i,7));
  assert.deepEqual(sample(27),sample(27));assert.notDeepEqual(sample(27),sample(81));
  const forward=librarySample(p,{...o,order:'forward'},.3,0,7),reverse=librarySample(p,{...o,order:'reverse'},.3,0,7);
  assert.notEqual(forward.opacity,reverse.opacity);
});
test('typewriter reveals units in binary steps rather than fading an entire line',()=>{
  const p=GALLERY_PRESETS.find(p=>p.motion?.id==='premium-typewriter').motion,o=defaultLibraryOptions(p),samples=[];
  for(let t=0;t<=1;t+=.025){const units=Array.from({length:7},(_,i)=>librarySample(p,o,t,i,7).opacity);assert.ok(units.every(n=>n===0||n===1));samples.push(units);}
  assert.ok(samples.some(units=>units.includes(0)&&units.includes(1)));
});
test('3D fixture projects both rotation axes and depth instead of flattening to a vertical slide',()=>{
  const neutral={x:0,y:0,z:0,rx:0,ry:0,rz:0,sx:1,sy:1,opacity:1,weight:0};
  assert.deepEqual(libraryProjectPoint(neutral,36,22),[36,22]);
  assert.ok(libraryProjectPoint({...neutral,z:260},36,22)[0]<36);
  assert.notDeepEqual(libraryProjectPoint({...neutral,ry:65},36,22),libraryProjectPoint({...neutral,ry:65},-36,22).map((n,i)=>i===0?-n:n));
});
test('text preview respects whole-text grouping, masking and native illustrative render paths',()=>{
  const doc=createFakeDocument(),p=GALLERY_PRESETS.find(p=>p.motion?.id==='premium-glyph-ribbon').motion;
  const svg=doc.createElementNS('http://www.w3.org/2000/svg','svg');
  paintLibraryPreview(svg,{...p,text:{...p.text,mask:true}},{...defaultLibraryOptions(p),unit:'all'},.2);
  assert.equal(svg.getElementsByTagName('text').length,1);
  assert.equal(svg.getElementsByTagName('clipPath').length,1);
  for(const {motion:camera} of GALLERY_PRESETS.filter(p=>p.motion?.cameraSpec?.native)){
    const scene=doc.createElementNS('http://www.w3.org/2000/svg','svg');
    paintLibraryPreview(scene,camera,defaultLibraryOptions(camera),camera.defaults.durationFrames/60,true);
    assert.ok(scene.getElementsByTagName('feGaussianBlur').length);
    if(camera.cameraSpec.native.style===6)assert.ok(scene.getElementsByTagName('feBlend').length);
  }
});
test('six optical camera previews use distinct signed movement and bounded CUT envelopes',()=>{
  const presets=GALLERY_PRESETS.filter(p=>p.motion?.cameraSpec?.native);assert.equal(presets.length,6);
  const signatures=[];
  for(const {motion:p}of presets){
    const o=defaultLibraryOptions(p),d=o.durationFrames/30;
    for(const time of [0,d])assert.equal(nativeCameraPreviewSample(p,o,time).amount,0);
    assert.equal(nativeCameraPreviewSample(p,o,d/2).amount,1);
    assert.equal(nativeCameraPreviewSample(p,{...o,intensity:0},d/2).amount,0);
    const before=nativeCameraPreviewSample(p,o,d*.4),after=nativeCameraPreviewSample(p,o,d*.6);
    assert.ok(before.flow<0&&after.flow>0);
    signatures.push(JSON.stringify([before,after]));
  }
  assert.equal(new Set(signatures).size,6);
});


test('impact previews draw the host sample at 1:6, strike on CUT and paint finite light, wave and shutter filters',()=>{
  const presets=GALLERY_PRESETS.filter(p=>p.motion?.cameraSpec?.impact);assert.equal(presets.length,10);
  const doc=createFakeDocument();
  for(const {motion:p} of presets){
    const o=defaultLibraryOptions(p),duration=o.durationFrames/30,cut=cameraTransitionSample(p,o,duration/2),raw=impactCameraPreviewSample(p,o,duration/2);
    assert.ok(Math.abs(cut.x-raw[0]/6)<1e-12&&Math.abs(cut.y-raw[1]/6)<1e-12&&Math.abs(cut.rz-raw[2])<1e-12&&Math.abs(cut.sx-raw[3]/100)<1e-12,p.id);
    for(let i=0;i<=48;i++)assert.ok(cameraTransitionSample(p,o,duration*i/48).sx<=cut.sx+1e-12,`${p.id}: overscan and punch peak on CUT`);
    for(const t of [duration*.3,duration/2,duration*.7]){
      const scene=doc.createElementNS('http://www.w3.org/2000/svg','svg');
      paintLibraryPreview(scene,p,o,t,true);
      assert.ok(scene.getElementsByTagName('feGaussianBlur').length&&scene.getElementsByTagName('feColorMatrix').length,p.id);
      if(p.cameraSpec.impact.wave&&t===duration/2)assert.ok(scene.getElementsByTagName('feDisplacementMap').length,p.id);
      if(p.cameraSpec.impact.glow&&t===duration/2)assert.ok(scene.getElementsByTagName('feBlend').length,p.id);
      assert.ok(!/NaN|Infinity/.test(scene.outerHTML??JSON.stringify([...scene.getElementsByTagName('g')].map(g=>g.getAttribute('transform')))),p.id);
    }
  }
});
