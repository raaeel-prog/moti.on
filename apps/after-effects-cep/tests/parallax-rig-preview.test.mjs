import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';import {fileURLToPath} from 'node:url';
const built=await build({entryPoints:[fileURLToPath(new URL('../client/src/parallax-rig-preview.ts',import.meta.url))],bundle:true,platform:'node',format:'esm',write:false});
const {sampleParallaxRigPreview:sample}=await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);
const settings={operation:'create',depthStep:0,strength:1,reverseOrder:false,orderMode:'timeline',width:1920,height:1080};
test('Parallax preview preserves the same apparent sample framing at every valid depth and reversal',()=>{
 const before=sample({...settings,strength:0},0).sort((a,b)=>a.id-b.id);
 for(const reverseOrder of [false,true])for(const strength of [.2,.5,1]){const after=sample({...settings,reverseOrder,strength},0).sort((a,b)=>a.id-b.id);for(let i=0;i<4;i++)for(const key of ['x','y','width','height'])assert.ok(Math.abs(before[i][key]-after[i][key])<1e-9);}
 assert.deepEqual(sample({...settings,strength:10},0),[]);
});
test('Parallax movement previews use the native linear controller translation and perspective',()=>{
 const start=sample(settings,0),truck=sample({...settings,operation:'truck'},3),vertical=sample({...settings,operation:'vertical'},3),dolly=sample({...settings,operation:'dolly'},3);
 for(const p of start){const tx=truck.find(a=>a.id===p.id),vy=vertical.find(a=>a.id===p.id),dz=dolly.find(a=>a.id===p.id);assert.ok(Math.abs(tx.x-p.x+1920*.02*3000/(3000+p.z))<1e-9);assert.equal(tx.y,p.y);assert.ok(Math.abs(vy.y-p.y+1080*.02*3000/(3000+p.z))<1e-9);assert.ok(dz.width>p.width);}
 assert.deepEqual(sample(settings,0).map(p=>p.id),[3,2,1,0]);assert.deepEqual(sample({...settings,reverseOrder:true},0).map(p=>p.id),[0,1,2,3]);
});
