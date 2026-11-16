import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const built=await build({entryPoints:['apps/after-effects-cep/client/src/particle-edit-session.ts'],bundle:true,format:'esm',platform:'node',write:false});
const {ParticleEditSession}=await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);
import {cloneParticleArgs} from '../../../packages/contracts/dist/index.js';
test('host refresh merges untouched controls while preserving drafts for each rig',()=>{
 const session=new ParticleEditSession(),base=cloneParticleArgs('rising');session.hydrate({rigId:'a',compId:1,settings:base});session.edit({...base,direction:90});
 const next=session.hydrate({rigId:'a',compId:1,settings:{...base,opacity:42}});assert.equal(next.direction,90);assert.equal(next.opacity,42);assert.deepEqual(session.args().changedFields,['direction']);
 session.hydrate({rigId:'b',compId:1,settings:base});session.edit({...base,direction:270});assert.equal(session.hydrate({rigId:'a',compId:1,settings:base}).direction,90);assert.equal(session.args().targetRigId,'a');
 session.hydrate({rigId:null,compId:1,settings:null});assert.equal(session.args().targetRigId,undefined);
});
test('mode changes are full recipes while no-op edits generate an empty patch',()=>{
 const session=new ParticleEditSession(),base=cloneParticleArgs('snow');session.hydrate({rigId:'a',compId:1,settings:base});assert.deepEqual(session.args().changedFields,[]);
 session.edit(cloneParticleArgs('rising'));session.hydrate({rigId:'a',compId:1,settings:base});assert.equal(session.settings.mode,'rising');assert.ok(session.args().changedFields.includes('mode'));
});
