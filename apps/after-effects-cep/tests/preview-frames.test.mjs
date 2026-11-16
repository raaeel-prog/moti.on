import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { createCepDocument } from './cep-dom.mjs';

const built=await build({stdin:{contents:'export { createFrameCache, bakeKey } from "./client/src/preview-frames.ts"; export { createPreviewWall, frameAt, previewSpec } from "./client/src/preview-wall.ts";',resolveDir:fileURLToPath(new URL('..',import.meta.url))},bundle:true,platform:'node',format:'esm',write:false});
const {createFrameCache,bakeKey,createPreviewWall,frameAt,previewSpec}=await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);

const spec=(src,fps=2,width=2,height=2)=>({src,fps,width,height});

/** A decoder that loads and seeks asynchronously; `broken` sources fail to load. */
function environment({duration=1,broken=[]}={}){
  const decoders=[],closed=[];
  class Video{
    constructor(){this.listeners={};this.currentTime=0;this.duration=NaN;this._src='';decoders.push(this);}
    addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);}
    removeEventListener(type,fn){this.listeners[type]=(this.listeners[type]??[]).filter(f=>f!==fn);}
    emit(type){for(const fn of [...(this.listeners[type]??[])])fn();}
    set src(value){this._src=value;setTimeout(()=>{if(broken.includes(value)){this.error={message:'unsupported codec'};this.emit('error');}else{this.duration=duration;this.emit('loadeddata');}},0);}
    get src(){return this._src;}
    set currentTime(value){this._time=value;if(this._src)setTimeout(()=>this.emit('seeked'),0);}
    get currentTime(){return this._time;}
    removeAttribute(){this._src='';}
    load(){this.unloaded=true;}
  }
  const env={
    createVideo:()=>new Video(),
    capture:async(video,width,height)=>({at:video.currentTime,width,height,close(){closed.push(this);}}),
    setTimeout:(fn,ms)=>setTimeout(fn,ms),clearTimeout:h=>clearTimeout(h)
  };
  return {env,decoders,closed};
}

test('a clip is baked at its own frame rate, every frame centre, at the size it is shown, then the decoder is freed',async()=>{
  const e=environment({duration:1});const cache=createFrameCache(e.env);
  const clip=await cache.get(spec('a.mp4',4,32,18));await clip.done;
  assert.equal(clip.complete,true);
  assert.deepEqual(clip.frames.map(f=>f.at),[.125,.375,.625,.875]);
  assert.deepEqual([clip.frames[0].width,clip.frames[0].height],[32,18]);
  assert.equal(clip.frameMs,250);assert.equal(clip.durationMs,1000);assert.equal(clip.bytes,4*32*18*4);assert.equal(clip.key,bakeKey(spec('a.mp4',4,32,18)));
  assert.equal(e.decoders.length,1);assert.equal(e.decoders[0].src,'');assert.ok(e.decoders[0].unloaded,'the hidden decoder is released');
  assert.equal(cache.peek(spec('a.mp4',4,32,18)),clip);assert.equal(await cache.get(spec('a.mp4',4,32,18)),clip,'a baked clip is never decoded again');
  assert.equal(cache.peek(spec('a.mp4',30,32,18)),undefined,'another rate or size is a different bake');
  const smooth=await cache.get(spec('a.mp4',30,32,18));await smooth.done;assert.equal(smooth.frames.length,30,'a 30 fps clip keeps all thirty frames of each second');
});

test('concurrent requests share one bake and the latest request is decoded first',async()=>{
  const e=environment();const cache=createFrameCache(e.env,{decoders:1});const order=[];
  const a=cache.get(spec('a.mp4')),b=cache.get(spec('b.mp4')),c=cache.get(spec('c.mp4')),again=cache.get(spec('b.mp4'));
  for(const [name,p] of [['a',a],['b',b],['c',c]])p.then(()=>order.push(name));
  assert.equal(again,b);await Promise.all([a,b,c]);
  assert.deepEqual(order,['a','b','c'],'the first starts at once; b, asked again, jumps ahead of c');
});

test('while held (scrolling) no bake starts, and releasing the hold resumes them',async()=>{
  const e=environment();const cache=createFrameCache(e.env);cache.hold(true);
  const a=cache.get(spec('a.mp4'));await new Promise(done=>setTimeout(done,20));
  assert.equal(e.decoders.length,0,'nothing decodes during the scroll');
  cache.hold(false);const clip=await a;await clip.done;assert.equal(clip.frames.length,2);
});

test('clips past the budget are dropped least-recently-used first, never a retained one',async()=>{
  const e=environment();const one=2*10*10*4;const cache=createFrameCache(e.env,{budgetBytes:2*one});
  const whole=async s=>{const clip=await cache.get(s);await clip.done;return clip;};
  const a=await whole(spec('a.mp4',2,10,10));await whole(spec('b.mp4',2,10,10));cache.retain(a.key);cache.peek(spec('b.mp4',2,10,10));
  await whole(spec('c.mp4',2,10,10));
  assert.ok(cache.peek(spec('a.mp4',2,10,10)),'the clip on screen stays');assert.equal(cache.peek(spec('b.mp4',2,10,10)),undefined);assert.ok(cache.peek(spec('c.mp4',2,10,10)));
  assert.equal(e.closed.length,2,'evicted frames are closed');assert.equal(cache.residentBytes(),2*one,'two clips of two frames remain');
  cache.release(a.key);await whole(spec('d.mp4',2,10,10));assert.equal(cache.peek(spec('a.mp4',2,10,10)),undefined,'released, it can go');
});

test('a source that cannot be decoded rejects, frees its decoder and lets the next bake run',async()=>{
  const e=environment({broken:['bad.mp4']});const cache=createFrameCache(e.env);
  await assert.rejects(cache.get(spec('bad.mp4')),/unsupported codec/);
  assert.ok(e.decoders[0].unloaded);assert.equal(cache.peek(spec('bad.mp4')),undefined);
  const ok=await cache.get(spec('ok.mp4'));await ok.done;assert.equal(ok.frames.length,2);
});

test('disposing closes every resident frame and rejects waiting bakes',async()=>{
  const e=environment();const cache=createFrameCache(e.env);
  await (await cache.get(spec('a.mp4'))).done;const waiting=cache.get(spec('b.mp4'));const queued=cache.get(spec('c.mp4'));cache.dispose();
  await Promise.all([assert.rejects(queued,/disposed/),assert.rejects(waiting,/disposed/)]);
  assert.equal(cache.residentBytes(),0);assert.ok(e.closed.length>=2);
});

test('frameAt loops and previewSpec decodes at the shown size within 160–320 px',()=>{
  const clip={frames:[0,1,2,3],frameMs:100,durationMs:400};
  assert.deepEqual([0,99,100,399,400,-1].map(t=>frameAt(clip,t)),[0,0,1,3,0,3]);
  const host=w=>({clientWidth:w});
  assert.deepEqual(previewSpec(host(150),'a.mp4',30),{src:'a.mp4',fps:30,width:160,height:90});
  assert.deepEqual(previewSpec(host(200),'a.mp4',30),{src:'a.mp4',fps:30,width:208,height:117});
  assert.deepEqual(previewSpec(host(900),'a.mp4',15).width,320);
  assert.deepEqual(previewSpec(host(0),'a.mp4',15).width,320,'an unmeasured host gets the full size');
});

/** A wall whose clock, frames and bakes advance only when the test says so. */
function wallSetup(){
  const doc=createCepDocument();let time=0;const callbacks=new Map();let next=1;const drawn=[];const bakes=new Map();const ready=new Map();const retained=new Map();
  const clipOf=(src,count=4)=>({key:src,src,complete:true,done:Promise.resolve(),frames:Array.from({length:count},(_,i)=>`${src}#${i}`),width:2,height:2,frameMs:100,durationMs:count*100,bytes:count});
  const frames={get({src}){if(ready.has(src))return Promise.resolve(ready.get(src));let settle;const p=new Promise((res,rej)=>{settle={res,rej};});bakes.set(src,settle);return p;},
    peek:({src})=>ready.get(src),retain(k){retained.set(k,(retained.get(k)??0)+1);},release(k){retained.set(k,(retained.get(k)??0)-1);},hold(){},residentBytes:()=>0,dispose(){}};
  const env={frames,now:()=>time,requestFrame(fn){const id=next++;callbacks.set(id,fn);return id;},cancelFrame(id){callbacks.delete(id);},draw(canvas,frame){drawn.push(frame);}};
  const wall=createPreviewWall(doc,'ch-preset-player',env);
  return {wall,drawn,host:()=>doc.createElement('button'),retained,ready:(src,clip)=>ready.set(src,clip),
    async finish(src,count){const clip=clipOf(src,count);ready.set(src,clip);bakes.get(src)?.res(clip);await Promise.resolve();await Promise.resolve();},
    advance(ms){time+=ms;const due=[...callbacks.values()];callbacks.clear();due.forEach(fn=>fn());},get pending(){return callbacks.size;}};
}
const at=(src)=>({src,fps:10,width:2,height:2});

test('every attached card animates at once from one animation-frame loop',async()=>{
  const s=wallSetup(),a=s.host(),b=s.host(),c=s.host();
  s.wall.attach(a,at('a.mp4'));s.wall.attach(b,at('b.mp4'));s.wall.attach(c,at('c.mp4'));
  assert.equal([a,b,c].filter(h=>h.children[0]?.tagName.toLowerCase()==='canvas').length,3,'each card has its own surface');
  await s.finish('a.mp4');await s.finish('b.mp4');
  assert.equal(s.pending,1,'one loop for the whole wall');
  s.advance(100);
  assert.deepEqual(s.drawn,['a.mp4#0','b.mp4#0','a.mp4#1','b.mp4#1'],'both cards advance in the same frame');
  assert.equal(c.children[0].getAttribute('data-shown'),'false','a card still decoding keeps its still');
  await s.finish('c.mp4');s.advance(100);assert.deepEqual(s.drawn.slice(-3),['a.mp4#2','b.mp4#2','c.mp4#1']);
});

test('pause freezes every card, resume continues each from its own frame, detach frees only that card',async()=>{
  const s=wallSetup(),a=s.host(),b=s.host();s.wall.attach(a,at('a.mp4'));s.wall.attach(b,at('b.mp4'));await s.finish('a.mp4');await s.finish('b.mp4');
  s.advance(150);s.wall.pause();assert.equal(s.pending,0,'a paused wall schedules nothing');
  const before=s.drawn.length;s.advance(1000);assert.equal(s.drawn.length,before);
  s.wall.resume();s.advance(0);s.advance(60);assert.deepEqual(s.drawn.slice(-2),['a.mp4#2','b.mp4#2'],'the clock resumes where it paused');
  s.wall.detach(a);assert.equal(a.children.length,0);assert.equal(s.retained.get('a.mp4'),0);assert.equal(s.retained.get('b.mp4'),1);
  s.wall.dispose();assert.equal(s.pending,0);assert.equal(b.children.length,0);
});

test('a clip streams: the card gets it at the first frame while the rest keeps decoding',async()=>{
  const e=environment({duration:1});const cache=createFrameCache(e.env);
  const clip=await cache.get(spec('a.mp4',10,2,2));
  assert.equal(clip.complete,false,'handed over before the last frame');
  assert.ok(clip.frames.length>=1&&clip.frames.length<10);assert.equal(clip.durationMs,1000,'the whole length is known at once');
  assert.equal(cache.peek(spec('a.mp4',10,2,2)),clip,'another card gets the same frames at once');
  await clip.done;assert.equal(clip.frames.length,10);assert.equal(clip.complete,true);
});

test('several decoders run side by side, so the cards of a screen start together',async()=>{
  const e=environment();const cache=createFrameCache(e.env,{decoders:3});
  const all=['a','b','c','d'].map(n=>cache.get(spec(n+'.mp4')));
  await new Promise(done=>setTimeout(done,0));
  assert.equal(e.decoders.length,3,'three decode at once; the fourth waits for a free decoder');
  await Promise.all(all);assert.equal(e.decoders.length,4);
});

test('a clip just decoded is never dropped before a card shows it, even past the budget',async()=>{
  const e=environment();const cache=createFrameCache(e.env,{budgetBytes:1});
  const clips=await Promise.all(['a','b','c'].map(n=>cache.get(spec(n+'.mp4'))));
  for(const clip of clips)cache.retain(clip.key);
  await Promise.all(clips.map(clip=>clip.done));
  assert.ok(clips.every(clip=>cache.peek(spec(clip.src))===clip),'every clip on screen stays');
  assert.equal(e.closed.length,0,'no frame of a clip on screen is closed');
});

test('a card stays on its still until its whole clip is decoded, then plays its first cycle from frame 0',async()=>{
  const s=wallSetup(),a=s.host();
  let more;const frames=['p#0'];const clip={key:'p',src:'p.mp4',frames,width:2,height:2,frameMs:100,durationMs:400,bytes:1,complete:false,done:new Promise(r=>{more=r;})};
  s.ready('p.mp4',clip);s.wall.attach(a,at('p.mp4'));
  s.advance(350);assert.deepEqual(s.drawn,[],'half a clip is never played: it would starve while the rest decodes');
  assert.equal(a.children[0].getAttribute('data-shown'),'false','the still stays');
  assert.equal(s.retained.get('p'),1,'the clip is held while it waits, so it cannot be evicted');
  frames.push('p#1','p#2','p#3');clip.complete=true;more();await Promise.resolve();await Promise.resolve();
  s.advance(0);s.advance(100);s.advance(100);assert.deepEqual(s.drawn,['p#0','p#1','p#2'],'complete: it plays from the first frame, nothing skipped');
  s.wall.detach(a);assert.equal(s.retained.get('p'),0);
});

test('a card waiting on its clip that leaves releases the clip and never starts',async()=>{
  const s=wallSetup(),a=s.host();
  let more;const clip={key:'q',src:'q.mp4',frames:['q#0'],width:2,height:2,frameMs:100,durationMs:400,bytes:1,complete:false,done:new Promise(r=>{more=r;})};
  s.ready('q.mp4',clip);s.wall.attach(a,at('q.mp4'));s.wall.detach(a);
  assert.equal(s.retained.get('q'),0);clip.complete=true;more();await Promise.resolve();s.advance(100);assert.deepEqual(s.drawn,[]);
});

test('a card in view is decoded before any clip decoded ahead of the scroll',async()=>{
  const e=environment();const opened=[];
  e.env.open=async s=>{opened.push(s.src);return streamOf(2);};
  const cache=createFrameCache(e.env,{streams:1,staggerMs:0});
  const busy=cache.get(spec('busy.mp4'));
  const ahead=['a1','a2'].map(n=>cache.get(spec(n+'.mp4'),'ahead'));const now=cache.get(spec('seen.mp4'));
  await Promise.all([busy,now,...ahead].map(p=>p.then(c=>c.done)));
  assert.deepEqual(opened,['busy.mp4','seen.mp4','a2.mp4','a1.mp4'],'the card in view jumps the queue of warm-ups');
  const e2=environment();const order=[];e2.env.open=async s=>{order.push(s.src);return streamOf(2);};
  const c2=createFrameCache(e2.env,{streams:1,staggerMs:0});const first=c2.get(spec('x.mp4'));
  c2.get(spec('w.mp4'),'ahead');c2.get(spec('v.mp4'));c2.get(spec('w.mp4'));
  await first;await new Promise(r=>setTimeout(r,20));
  assert.deepEqual(order.slice(0,3),['x.mp4','w.mp4','v.mp4'],'a warm-up the card now shows is promoted to the front');
});

/** A stream like the worker's: `count` frames handed out on demand. */
function streamOf(count,frameMs=100){let i=0;return {count,frameMs,next:async()=>i<count?{at:i++,close(){}}:null,cancel(){}};}

test('with off-thread decoding every card streams from a worker, started a few ms apart, no <video> involved',async()=>{
  const e=environment();const opened=[];const times=[];
  e.env.open=async s=>{opened.push(s.src);times.push(Date.now());return streamOf(3);};
  const cache=createFrameCache(e.env,{staggerMs:15});
  const clips=await Promise.all(['a','b','c','d'].map(n=>cache.get(spec(n+'.mp4'))));
  await Promise.all(clips.map(clip=>clip.done));
  assert.equal(opened.length,4,'all four cards start without waiting for a free <video> decoder');
  assert.equal(e.decoders.length,0,'the hidden <video> decoder is not used');
  assert.ok(times[3]-times[0]>=40,'starts are spread out instead of opening every decoder in one frame');
  assert.ok(clips.every(clip=>clip.frames.length===3&&clip.frameMs===100));
});

test('if the worker refuses a clip, it and every later clip fall back to the <video> decoder',async()=>{
  const e=environment();let calls=0;e.env.open=async()=>{calls++;throw new Error('codec unsupported');};
  const cache=createFrameCache(e.env,{staggerMs:0});
  const first=await cache.get(spec('a.mp4'));await first.done;assert.equal(first.frames.length,2);
  const second=await cache.get(spec('b.mp4'));await second.done;
  assert.equal(calls,1,'one refusal is enough to stop asking the worker');assert.equal(e.decoders.length,2);
});
