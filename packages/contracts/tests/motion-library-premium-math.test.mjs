import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const built = await build({entryPoints:[fileURLToPath(new URL('../src/motion-library-math.ts',import.meta.url))],bundle:true,format:'esm',platform:'node',write:false});
const {libraryChoreography: pose, libraryOrder, libraryDirection, libraryEase} = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);
const paths = ['linear','arc','spiral','rebound','swing'];

test('premium paths are finite, deterministic, and settle exactly for every distribution',()=>{
  for(const path of paths)for(const distribution of ['uniform','alternate','scatter'])for(const seed of [0,17,9999])for(const index of [0,1,29]){
    for(let i=0;i<=100;i++){
      const args=[i/100,1-libraryEase(i/100,'spring',58),180,-90,320,path,distribution,index,seed,.85,'preset'];
      const sample=pose(...args);assert.ok(sample.every(Number.isFinite));assert.deepEqual(pose(...args),sample);
    }
    assert.deepEqual(pose(1,0,180,-90,320,path,distribution,index,seed,.85,'preset'),[0,0,0,0,0,0]);
  }
  const signatures=paths.map(path=>[.2,.4,.6,.8].map(t=>pose(t,1-libraryEase(t,'silk'),180,-90,320,path,'uniform',0,17,.85,'preset').map(n=>n.toFixed(5)).join(',')).join('|'));
  assert.equal(new Set(signatures).size,paths.length,'a changed label must represent a changed trajectory');
});

test('authored direction, curved rotation and raw-unit distribution have independent semantics',()=>{
  assert.deepEqual(libraryDirection(-55,45,'preset'),[-55,45]);
  const args=[.35,.65,100,0,0,'arc','uniform',0,17,1];
  const right=pose(...args,'right'),down=pose(...args,'bottom');
  assert.ok(Math.abs(down[0]+right[1])<1e-9);assert.ok(Math.abs(down[1]-right[0])<1e-9);
  const even=pose(0,1,100,30,0,'linear','alternate',0,17,1),odd=pose(0,1,100,30,0,'linear','alternate',1,17,1);
  assert.equal(even[0],-odd[0]);assert.equal(even[1],-odd[1]);assert.equal(even[3],-odd[3]);
  assert.notDeepEqual(pose(.3,.7,100,30,0,'arc','scatter',0,17,1),pose(.3,.7,100,30,0,'arc','scatter',0,18,1));
  const rebound=pose(.4,.6,100,0,0,'rebound','uniform',0,17,1);
  assert.notEqual(rebound[4],rebound[5],'squash and stretch use separate scale channels');
});

test('seeded order remains a permutation and omitted seed preserves legacy sequence',()=>{
  for(let count=1;count<=80;count++)for(const seed of [0,17,9999]){
    const slots=Array.from({length:count},(_,i)=>libraryOrder(i,count,seed));
    assert.deepEqual([...slots].sort((a,b)=>a-b),Array.from({length:count},(_,i)=>i));
    assert.deepEqual(Array.from({length:count},(_,i)=>libraryOrder(i,count)),Array.from({length:count},(_,i)=>libraryOrder(i,count,3)));
  }
});
