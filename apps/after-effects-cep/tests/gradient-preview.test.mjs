import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {cloneGradientSettings, createGradientSettings} from '../../../packages/contracts/dist/index.js';
import {createCepDocument} from './cep-dom.mjs';
const built = await build({entryPoints:[fileURLToPath(new URL('../client/src/gradient-preview.ts',import.meta.url))],bundle:true,platform:'node',format:'esm',write:false});
const preview = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);
const render=(settings,options={})=>preview.renderGradientPreview(settings,{width:32,height:18,layerWidth:1920,layerHeight:1080,...options});
const difference=(a,b)=>Math.max(...a.map((v,i)=>Math.abs(v-b[i])));

test('complete preview frames match the separately compiled native CPU kernel with alpha, HDR, all modes and appearance passes',async()=>{
 const fixture=JSON.parse(await readFile(new URL('./fixtures/gradient-preview-native.json',import.meta.url),'utf8'));
 for(const [path,hash] of Object.entries(fixture.nativeSourceHashes))
   assert.equal(createHash('sha256').update(await readFile(new URL('../../../'+path,import.meta.url))).digest('hex'),hash,'regenerate native oracle after reviewing changed native math');
 for(const {id,settings,frame,pixels} of fixture.cases) {
   const actual=render(settings,{...frame,alpha:Float32Array.from(frame.alpha)});
   assert.equal(actual.length,pixels.length);assert.ok(difference(actual,pixels)<.00005,`${id}: maximum difference ${difference(actual,pixels)}`);
 }
});

test('preview follows the native mirrored smooth palette and keeps the eight slot identities',()=>{
 const s=cloneGradientSettings();Object.assign(s,{depth:0,bulge:0,turbulence:0,glow:0,diffusion:0,grain:0});
 s.stops.forEach(stop=>{stop.enabled=false;});s.stops[7]={enabled:true,color:[1,.5,.25],position:1};s.stops[0]={enabled:true,color:[0,0,0],position:0};
 const before=JSON.stringify(s),result=render(s,{width:4,height:4,layerWidth:4,layerHeight:4});
 const amount=.125*.125*(3-2*.125);assert.ok(Math.abs(result[0]-amount)<1e-6);
 assert.equal(result[3],1);assert.equal(JSON.stringify(s),before);
});
test('all appearance passes affect the rendered pixels and animation closes exactly',()=>{
 const s=createGradientSettings(),base=render(s,{timeSeconds:0});
 for(const changes of [{glow:0},{diffusion:0},{turbulence:0},{angle:68},{grain:.5},{mode:'radial'},{mode:'angular'},{colorProcessing:'srgb-linear'}])
   assert.ok(difference(base,render({...s,...changes}))>1e-5,JSON.stringify(changes));
 assert.ok(difference(base,render(s,{timeSeconds:3}))>.05);
 assert.ok(difference(base,render(s,{timeSeconds:6}))<1e-6);
 assert.ok(difference(base,render(s,{timeSeconds:-6}))<1e-6);
});
test('transparent inputs preserve alpha without glow and depth reads the source silhouette',()=>{
 const s=cloneGradientSettings();Object.assign(s,{glow:0,diffusion:0,grain:0,depthRadius:5});
 const alpha=Float32Array.from({length:32*18},(_,i)=>i%32>8&&i%32<24?1:0);
 const result=render(s,{alpha,layerWidth:32,layerHeight:18});
 for(let i=0;i<alpha.length;i++)assert.equal(result[i*4+3],alpha[i]);
 assert.ok(difference(result,render({...s,depth:0},{alpha,layerWidth:32,layerHeight:18}))>.01);
 assert.throws(()=>render(s,{width:0}),/geometry/i);
 assert.throws(()=>render(s,{alpha:new Float32Array(1)}),/alpha/i);
});
function fixture() {
 const doc=createCepDocument(),pending=new Map(),painted=[];let id=0,observer,mediaCallback,mutationCallback,disconnected=0;
 const media={matches:false,addEventListener(type,fn){mediaCallback=fn;},removeEventListener(){mediaCallback=undefined;}};
 doc.defaultView={requestAnimationFrame(fn){pending.set(++id,fn);return id;},cancelAnimationFrame(key){pending.delete(key);},matchMedia(){return media;},
   IntersectionObserver:class {constructor(fn){observer=fn;}observe(){}disconnect(){disconnected++;}},
   MutationObserver:class {constructor(fn){mutationCallback=fn;}observe(){}disconnect(){disconnected++;}}};
 const canvas=doc.createElement('canvas');canvas.width=32;canvas.height=18;canvas.getContext=()=>({createImageData(w,h){return{data:new Uint8ClampedArray(w*h*4)};},putImageData(image){painted.push(image);}});
 canvas.isConnected=true;
 const driver=preview.createGradientPreview(canvas,createGradientSettings());
 const frame=(time)=>{const callbacks=[...pending.values()];pending.clear();callbacks.forEach(fn=>fn(time));};
 return{doc,driver,pending,painted,frame,media,visible:value=>observer([{isIntersecting:value}]),reduce(value){doc.documentElement.setAttribute('data-reduced-motion',String(value));mutationCallback();},system(value){media.matches=value;mediaCallback();},disconnects:()=>disconnected};
}
test('preview driver pauses hidden/offscreen/reduced, resumes, coalesces updates and disposes every observer',()=>{
 const f=fixture();f.frame(0);assert.equal(f.painted.length,1);assert.equal(f.pending.size,1);
 f.frame(10);assert.equal(f.painted.length,1);f.frame(80);assert.equal(f.painted.length,2);
 f.doc.hidden=true;f.doc.emit('visibilitychange');assert.equal(f.pending.size,0);
 f.doc.hidden=false;f.doc.emit('visibilitychange');assert.equal(f.pending.size,1);
 f.visible(false);assert.equal(f.pending.size,0);f.visible(true);assert.equal(f.pending.size,1);
 f.reduce(true);assert.equal(f.pending.size,0);const still=f.painted.length;
 f.driver.update({...createGradientSettings(),angle:50});assert.equal(f.painted.length,still+1);assert.equal(f.pending.size,0);
 f.reduce(false);assert.equal(f.pending.size,1);f.system(true);assert.equal(f.pending.size,0);
 f.system(false);f.driver.update({...createGradientSettings(),angle:10});f.driver.update({...createGradientSettings(),angle:20});assert.equal(f.pending.size,1);
 f.driver.dispose();assert.equal(f.pending.size,0);assert.equal(f.disconnects(),2);
 const count=f.painted.length;f.doc.emit('visibilitychange');f.driver.update(createGradientSettings());f.frame(200);assert.equal(f.painted.length,count);
});
