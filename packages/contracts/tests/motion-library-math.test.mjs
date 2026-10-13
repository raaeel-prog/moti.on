import test from 'node:test';
import assert from 'node:assert/strict';
import { libraryEase, libraryTiming, libraryOrder, libraryDirection, libraryWave, libraryStudioTiming, librarySequence } from '../dist/motion-library-math.js';
test('both phases preserve overshoot instead of clipping it at the resting value',()=>{
 const [a,b]=libraryTiming(.5,0,4,.8,'both',0,1,0);
 assert.ok(2-libraryEase(a,'overshoot')-libraryEase(b,'overshoot')<0);
 assert.equal(libraryEase(0,'overshoot'),0);assert.equal(libraryEase(1,'overshoot'),1);
});
test('short layer and stagger fit within each transition half',()=>{
 for(const fps of [24,29.97,60])for(const count of [1,7,100]){
  for(let i=0;i<count;i++){
   const [a,b]=libraryTiming(.1,0,.2,24/fps,'both',i,count,2/fps);
   assert.ok(a>=1-1e-8);assert.ok(b>=1-1e-8);
  }
 }
});
test('random order is a deterministic permutation even for multiples of seven',()=>{
 for(let count=1;count<=100;count++){
  const slots=Array.from({length:count},(_,i)=>libraryOrder(i,count));
  assert.deepEqual([...slots].sort((a,b)=>a-b),Array.from({length:count},(_,i)=>i));
 }
});
test('direction rotates vectors and waves remain finite and bounded',()=>{
 for(const [dir,target] of [['left',[-100,0]],['right',[100,0]],['top',[0,-100]],['bottom',[0,100]]]){
  const actual=libraryDirection(0,100,dir);actual.forEach((v,i)=>assert.ok(Math.abs(v-target[i])<1e-8));
 }
 for(const wave of ['wiggle','cosine','abs-cosine','orbit'])for(let i=0;i<100;i++)assert.ok(Math.abs(libraryWave(i/30,1,wave,17))<=1);
});

test('Studio easing starts and settles with zero velocity, including maximum elasticity',()=>{
 const h=1e-5;
 for(const kind of ['silk','glide','spring'])for(const elasticity of [0,30,100]){
  assert.equal(libraryEase(0,kind,elasticity),0);assert.equal(libraryEase(1,kind,elasticity),1);
  assert.ok(Math.abs(libraryEase(h,kind,elasticity)/h)<.01,`${kind} starts abruptly`);
  assert.ok(Math.abs((1-libraryEase(1-h,kind,elasticity))/h)<.01,`${kind} ends abruptly`);
  const samples=Array.from({length:1001},(_,i)=>libraryEase(i/1000,kind,elasticity));
  assert.ok(samples.every(v=>Number.isFinite(v)&&v>=0&&v<1.3));
  if(kind!=='spring'||elasticity===0)assert.ok(samples.every((v,i)=>i===0||v>=samples[i-1]-1e-10));
 }
 const peak=e=>Math.max(...Array.from({length:1001},(_,i)=>libraryEase(i/1000,'spring',e)));
 assert.equal(peak(0),1);assert.ok(peak(100)>peak(30));assert.ok(peak(30)<1.03);
});

test('Studio overlap keeps long text relaxed without spilling beyond the layer',()=>{
 for(const fps of [24,29.97,60])for(const count of [1,2,7,100,1000])for(const overlap of [0,65,100]){
  const duration=40/fps,move=libraryStudioTiming(.01,0,4,duration,'in',0,count,3/fps,overlap)[0];
  assert.ok(.01/move>=duration*.55-1e-8);
  for(const idx of [0,count-1]){
   const [a,b]=libraryStudioTiming(2,0,4,duration,'both',idx,count,3/fps,overlap);assert.ok(a>=1&&b>=1);
  }
 }
 const late=overlap=>libraryStudioTiming(.5,0,4,1.2,'in',6,7,.1,overlap)[0];
 assert.ok(late(100)>late(0));
});
test('Studio sequence starts at the intended edge or symmetric pair',()=>{
 assert.deepEqual(Array.from({length:5},(_,i)=>librarySequence(i,5,'reverse')),[4,3,2,1,0]);
 assert.deepEqual(Array.from({length:5},(_,i)=>librarySequence(i,5,'center-out')),[4,2,0,2,4]);
 assert.deepEqual(Array.from({length:4},(_,i)=>librarySequence(i,4,'center-out')),[3,0,0,3]);
 assert.deepEqual(Array.from({length:5},(_,i)=>librarySequence(i,5,'edges-in')),[0,2,4,2,0]);
});

import { libraryOffscreenDistance } from '../dist/motion-library-math.js';
const grid=(kind,a,n,d,exit)=>Array.from({length:2001},(_,i)=>libraryEase(i/2000,kind,0,a,n,d,exit));
test('Momentum settles land exactly on rest for every control value, without reversing the arrival',()=>{
 for(const kind of ['settle-wave','settle-hop'])for(const a of [0,35,100])for(const n of [.5,2.5,8])for(const d of [0,55,100]){
  const label=`${kind} ${a}/${n}/${d}`,samples=grid(kind,a,n,d);
  assert.equal(libraryEase(0,kind,0,a,n,d),0,label);assert.equal(libraryEase(1,kind,0,a,n,d),1,label);
  assert.ok(samples.every(Number.isFinite),label);
  assert.ok(Math.abs(samples[1999]-1)<.02,`${label} lands smoothly`);
  // The approach (first 30% for the ricochet, 34% for hops) only moves forward.
  const arrive=Math.floor((kind==='settle-wave'?.3:.34)*2000);
  for(let i=1;i<arrive;i++)assert.ok(samples[i]>=samples[i-1]-1e-9,`${label} reverses at ${i}`);
  assert.ok(samples.every(v=>v>=-1e-9&&v<=1.61),`${label} bounded`);
 }
});
test('Ricochet overshoots and decays; hops fall back short of rest and lose height each time',()=>{
 const wave=grid('settle-wave',35,2.5,55),peaks=[];
 for(let i=1;i<wave.length-1;i++)if(wave[i]>1&&wave[i]>=wave[i-1]&&wave[i]>wave[i+1])peaks.push(wave[i]-1);
 assert.ok(peaks.length>=2,'ricochet oscillates past rest');
 for(let i=1;i<peaks.length;i++)assert.ok(peaks[i]<peaks[i-1],'ricochet decays');
 assert.ok(Math.max(...grid('settle-wave',80,2.5,55))>Math.max(...grid('settle-wave',20,2.5,55)),'amount grows the overshoot');
 const hop=grid('settle-hop',40,3,60),dips=[];
 for(let i=1;i<hop.length-1;i++)if(hop[i]<1&&hop[i]<=hop[i-1]&&hop[i]<hop[i+1]&&i>680)dips.push(1-hop[i]);
 assert.equal(dips.length,3,'three hops');
 for(let i=1;i<dips.length;i++)assert.ok(dips[i]<dips[i-1],'each hop is lower');
 assert.ok(hop.every(v=>v<=1+1e-9),'hops never pass through rest');
 assert.equal(Math.max(...grid('settle-hop',0,3,60).slice(700)),1,'zero height rests after arrival');
});
test('settle exits read backwards as a single anticipation that grows with the amount',()=>{
 for(const kind of ['settle-wave','settle-hop']){
  const small=grid(kind,10,2.5,55,1),large=grid(kind,90,2.5,55,1);
  assert.equal(small[0],0);assert.equal(small[2000],1);
  assert.ok(Math.max(...large)>Math.max(...small)&&Math.max(...small)>1,kind);
  let turns=0;for(let i=2;i<large.length;i++)if((large[i]-large[i-1])*(large[i-1]-large[i-2])<0)turns++;
  assert.equal(turns,1,`${kind} exit pulls back once`);
 }
 assert.equal(libraryEase(.4,'velvet',0,35,2.5,55,1),libraryEase(.4,'velvet'),'other curves ignore the settle arguments');
});
test('steady spin reads as seconds and blink is a seeded square wave',()=>{
 for(const t of [0,.5,3.25])assert.equal(libraryWave(t,0,'spin',17),t);
 const blink=Array.from({length:600},(_,i)=>libraryWave(i/120,0,'blink',17));
 assert.ok(blink.every(v=>v===0||v===1));
 const hidden=blink.filter(Boolean).length/blink.length;assert.ok(hidden>.45&&hidden<.55,'half of the time hidden');
 assert.deepEqual(blink,Array.from({length:600},(_,i)=>libraryWave(i/120,0,'blink',17)),'deterministic');
 assert.notDeepEqual(blink,Array.from({length:600},(_,i)=>libraryWave(i/120,0,'blink',40)),'the seed shifts the phase');
});
test('out-of-frame distance clears the frame along the direction, by the shorter axis, plus margin',()=>{
 const box=[250,150,350,250],frame=[1920,1080];
 assert.equal(libraryOffscreenDistance(300,200,...box,0,0,1,...frame,10),1080-150+10,'down');
 assert.equal(libraryOffscreenDistance(300,200,...box,0,-1,0,...frame,10),350+10,'left');
 assert.equal(libraryOffscreenDistance(300,200,...box,0,1,0,...frame,0),1920-250,'right');
 assert.equal(libraryOffscreenDistance(300,200,...box,0,0,-1,...frame,0),250,'up');
 const s=Math.SQRT1_2;assert.ok(Math.abs(libraryOffscreenDistance(300,200,...box,0,-s,-s,...frame,0)-250/s)<1e-9,'diagonal leaves by the nearer edge');
 const radius=Math.hypot(50,50)*3;
 assert.ok(Math.abs(libraryOffscreenDistance(300,200,...box,3,0,1,...frame,0)-(1080-(200-radius)))<1e-9,'inflated circle for spin or growth');
 assert.equal(libraryOffscreenDistance(300,200,2000,150,2100,250,0,1,0,...frame,5),5,'already outside needs only the margin');
 assert.equal(libraryOffscreenDistance(300,200,...box,0,0,0,...frame,5),0,'no direction, no travel');
});
