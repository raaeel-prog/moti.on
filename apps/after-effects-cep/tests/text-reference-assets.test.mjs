import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
const built=await build({stdin:{contents:'export * from "./client/src/text-reference-assets.ts";export {MOTION_LIBRARY_PRESETS,MOTION_LIBRARY_DEFAULTS} from "@motion/contracts";',resolveDir:fileURLToPath(new URL('..',import.meta.url))},bundle:true,platform:'node',format:'esm',write:false});
const api=await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`),preset=api.MOTION_LIBRARY_PRESETS.find(p=>p.id==='text-v3-characters-position-rise');
const settings={...api.MOTION_LIBRARY_DEFAULTS,...preset.defaults};
const asset={video:'original.mp4',poster:'original.jpg',hash:'a'.repeat(64),durationSeconds:4,text:'Original',options:settings};
const manifest=value=>({schemaVersion:1,presets:{[preset.id]:value}});
test('reference manifest rejects remote media, traversal, malformed hashes and invalid recipe options',()=>{
  assert.deepEqual(api.textReferenceAsset(manifest(asset),preset.id),asset);
  for(const invalid of [{video:'https://example.test/video.mp4'},{video:'../private.mp4'},{poster:'data:image/png,x'},{hash:'fake'},{durationSeconds:Infinity},{text:'x'.repeat(181)},{options:{...settings,speed:999}}])assert.equal(api.textReferenceAsset(manifest({...asset,...invalid}),preset.id),undefined);
});
