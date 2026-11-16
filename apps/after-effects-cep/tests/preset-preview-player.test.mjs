import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { createCepDocument } from './cep-dom.mjs';

const built=await build({stdin:{contents:'export { createPreviewPlayer } from "./client/src/preset-preview-player.ts";',resolveDir:fileURLToPath(new URL('..',import.meta.url))},bundle:true,platform:'node',format:'esm',write:false});
const {createPreviewPlayer}=await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);

/** A clip of `count` frames at 100 ms each; frame i is the number i. */
const clipOf=(src,count=4)=>({key:src,src,complete:true,done:Promise.resolve(),frames:Array.from({length:count},(_,i)=>i),width:320,height:180,frameMs:100,durationMs:count*100,bytes:count});

/** A player whose clock, animation frames and bakes advance only when the test says so. */
function setup(){
  const doc=createCepDocument();let time=0;const callbacks=new Map();let next=1;const drawn=[];const bakes=new Map();const ready=new Map();const retained=new Map();
  const frames={
    get({src}){if(ready.has(src))return Promise.resolve(ready.get(src));let settle;const promise=new Promise((resolve,reject)=>{settle={resolve,reject};});bakes.set(src,settle);return promise;},
    peek:({src})=>ready.get(src),retain(key){retained.set(key,(retained.get(key)??0)+1);},release(key){retained.set(key,(retained.get(key)??0)-1);},hold(){},residentBytes:()=>0,dispose(){}
  };
  const pinnedNow=()=>[...retained].filter(([,n])=>n>0).map(([k])=>k);
  const env={frames,now:()=>time,requestFrame(fn){const id=next++;callbacks.set(id,fn);return id;},cancelFrame(id){callbacks.delete(id);},draw(canvas,frame){drawn.push(frame);}};
  const player=createPreviewPlayer(doc,'ch-preset-player',30,env);
  const host=()=>doc.createElement('button');
  return {player,host,drawn,get pinned(){return pinnedNow()[0]??null;},
    async finish(src,count){const clip=clipOf(src,count);ready.set(src,clip);bakes.get(src)?.resolve(clip);await Promise.resolve();await Promise.resolve();return clip;},
    async fail(src){bakes.get(src)?.reject(new Error('bad codec'));await Promise.resolve();await Promise.resolve();},
    advance(ms){time+=ms;const due=[...callbacks.values()];callbacks.clear();due.forEach(fn=>fn());},
    get pending(){return callbacks.size;}};
}
const surface=card=>card.children[0];

test('the canvas stays invisible over the still until the baked clip draws its first frame',async()=>{
  const s=setup(),card=s.host();
  s.player.show(card,'a.mp4');
  assert.equal(surface(card).tagName.toLowerCase(),'canvas','no <video> is placed on the card');
  assert.equal(surface(card).getAttribute('data-shown'),'false','loading never shows an empty box');
  assert.equal(surface(card).getAttribute('data-state'),'loading');
  await s.finish('a.mp4');
  assert.deepEqual(s.drawn,[0]);assert.equal(surface(card).getAttribute('data-shown'),'true');assert.equal(s.pinned,'a.mp4');
});

test('frames follow the clock and loop without any seek or buffering',async()=>{
  const s=setup(),card=s.host();s.player.show(card,'a.mp4');await s.finish('a.mp4',4);
  s.advance(50);s.advance(60);s.advance(100);s.advance(100);s.advance(100);
  assert.deepEqual(s.drawn,[0,1,2,3,0],'each frame is drawn once, then it wraps to the start');
});

test('a clip already baked plays at once on another card, and a stale bake is ignored',async()=>{
  const s=setup(),a=s.host(),b=s.host(),c=s.host();
  s.player.show(a,'a.mp4');s.player.show(b,'b.mp4');
  assert.equal(a.children.length,0,'the previous card keeps only its still');
  await s.finish('a.mp4');assert.equal(surface(b).getAttribute('data-shown'),'false','a late frame of another card is never shown');
  s.player.show(c,'a.mp4');assert.equal(surface(c).getAttribute('data-shown'),'true','cached frames need no wait');
  assert.equal(s.player.owner(),c);
});

test('showing the same card again keeps playing; a paused preview continues from its frame',async()=>{
  const s=setup(),a=s.host();s.player.show(a,'a.mp4');await s.finish('a.mp4',4);
  s.advance(150);s.player.show(a,'a.mp4');assert.deepEqual(s.drawn,[0,1]);
  s.player.pause(s.host());assert.ok(s.pending>0,'another card cannot pause it');
  s.player.pause(a);assert.equal(s.pending,0);assert.equal(surface(a).getAttribute('data-shown'),'true','pause keeps the frame on screen');
  s.advance(1000);s.player.show(a,'a.mp4');s.advance(60);assert.deepEqual(s.drawn,[0,1,2],'the clock resumes where it paused');
});

test('stop hides at once, unpins the clip and only answers to the card playing',async()=>{
  const s=setup(),a=s.host(),b=s.host();s.player.show(a,'a.mp4');await s.finish('a.mp4');
  s.player.stop(b);assert.equal(s.player.owner(),a,'another card cannot stop it');
  const canvas=surface(a);s.player.stop(a);
  assert.equal(canvas.getAttribute('data-shown'),'false');assert.equal(canvas.parentNode,null);assert.equal(s.player.owner(),null);assert.equal(s.pinned,null);assert.equal(s.pending,0);
});

test('a clip that cannot be decoded leaves the still and reports the failure on the surface',async()=>{
  const s=setup(),a=s.host();s.player.show(a,'broken.mp4');await s.fail('broken.mp4');
  assert.equal(surface(a).getAttribute('data-shown'),'false');assert.equal(surface(a).getAttribute('data-state'),'failed');assert.deepEqual(s.drawn,[]);
});
