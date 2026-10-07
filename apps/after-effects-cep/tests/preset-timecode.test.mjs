import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const result=await build({entryPoints:['apps/after-effects-cep/client/src/preset-timecode.ts'],bundle:true,write:false,format:'esm',platform:'node'});
const {formatPresetOffset,parsePresetOffset}=await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
test('relative timecode uses signed integer frames at nominal fractional rates',()=>{
  assert.equal(formatPresetOffset(0,24000/1001),'00:00:00:00');assert.equal(formatPresetOffset(25,24000/1001),'+00:00:01:01');assert.equal(formatPresetOffset(-25,24000/1001),'-00:00:01:01');
  assert.equal(parsePresetOffset('-00:00:01:01',24000/1001),-25);assert.equal(parsePresetOffset('+12',24),12);
});
test('drop-frame timecode skips the correct labels and retains tenth-minute labels',()=>{
  assert.equal(formatPresetOffset(1800,30000/1001,true),'+00:01:00;02');assert.equal(formatPresetOffset(17982,30000/1001,true),'+00:10:00;00');
  assert.equal(formatPresetOffset(3600,60000/1001,true),'+00:01:00;04');assert.equal(parsePresetOffset('00:01:00;00',30000/1001,true),undefined);
  for(const fps of [24,25,24000/1001,30000/1001,60000/1001])for(const frame of [-17982,-600,-1,0,1,600,1800,17982])assert.equal(parsePresetOffset(formatPresetOffset(frame,fps,true),fps,true),frame);
});
test('invalid timecode and fractional frame input cannot mutate timing',()=>{
  for(const value of ['1.5','00:60:00:00','00:00:60:00','00:00:00:24','abc',''])assert.equal(parsePresetOffset(value,24),undefined);
});

