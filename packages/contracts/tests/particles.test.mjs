import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
const built=await build({entryPoints:[fileURLToPath(new URL('../src/particles.ts',import.meta.url))],bundle:true,format:'esm',platform:'node',write:false});
const {cloneParticleArgs,isParticleArgs,PARTICLE_MODES,PARTICLE_PRESETS}=await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);
test('particle presets cover the retained renderer and five independently editable modes',()=>{
 assert.equal(PARTICLE_MODES.length,7);for(const mode of PARTICLE_MODES){const args=cloneParticleArgs(mode);assert.equal(isParticleArgs(args),true);assert.equal(args.mode,mode);assert.equal(args.streams.length,4);}
 assert.deepEqual(cloneParticleArgs().birthRate,3);const a=cloneParticleArgs('field3d');a.streams[0].color[0]=.123;assert.notEqual(PARTICLE_PRESETS[5].streams[0].color[0],.123);
});
test('old numeric args remain valid and boundary rejects malformed styles',()=>{
 assert.equal(isParticleArgs({birthRate:2,longevity:1,velocity:1}),true);
 for(const args of [{mode:'unknown'},{size:0},{opacity:101},{movement:NaN},{color:[1,0]},{color:[2,0,0]},{streams:[]},{unsupported:1},{action:'delete'}])assert.equal(isParticleArgs(args),false,JSON.stringify(args));
 const args=cloneParticleArgs('field3d');args.streams[0].unexpected=true;assert.equal(isParticleArgs(args),false);
});

 test('rising is the opening recipe and direction validates independently of legacy args',()=>{
 const a=cloneParticleArgs();assert.equal(a.mode,'rising');assert.equal(a.direction,0);assert.equal(a.spread,10);
 for(const direction of [0,45,90,180,270,360])assert.equal(isParticleArgs({mode:'rising',direction,spread:100}),true);
 for(const args of [{direction:-1},{direction:361},{direction:NaN},{spread:-1},{spread:101},{changedFields:['invalid']},{changedFields:['streams.4.size']}])assert.equal(isParticleArgs(args),false);
 assert.equal(cloneParticleArgs('snow').direction,undefined);
 assert.equal(isParticleArgs({mode:'rising',direction:90,changedFields:['direction'],targetRigId:'rig-1',targetCompId:12}),true);
 });
