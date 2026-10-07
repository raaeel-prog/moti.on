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
