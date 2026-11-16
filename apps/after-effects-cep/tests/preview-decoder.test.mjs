/** The MP4 demuxer that runs inside the preview decode worker, checked against
 * real rendered previews of the project and against what ffprobe reports. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const built=await build({stdin:{contents:'export { demuxMp4 } from "./client/src/preview-decoder.ts";',resolveDir:fileURLToPath(new URL('..',import.meta.url))},bundle:true,platform:'node',format:'esm',write:false});
const {demuxMp4}=await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);
const asset=async name=>{const data=await readFile(new URL(`../assets/text-previews/${name}`,import.meta.url));return data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength);};

test('a 30 fps card preview: H.264 track, every sample located inside the file, keyframe first',async()=>{
  const buffer=await asset('epic-title-float.mp4'),track=demuxMp4(buffer);
  assert.match(track.codec,/^avc1\.[0-9a-f]{6}$/);
  assert.deepEqual([track.width,track.height],[320,180],'shipped at the largest size a card draws');
  assert.equal(track.samples.length,120,'4 s at 30 fps');
  assert.equal(track.samples[0].key,true);
  const seconds=(track.samples.at(-1).time+track.samples.at(-1).duration)/track.timescale;assert.ok(Math.abs(seconds-4)<0.01);
  for(const s of track.samples)assert.ok(s.offset>0&&s.size>0&&s.offset+s.size<=buffer.byteLength);
  assert.equal(track.description[0],1,'avcC configurationVersion');
});

test('a 30 fps direction tile and a broken file',async()=>{
  const tile=demuxMp4(await asset('bouncy-letters--left.mp4'));
  assert.equal(tile.samples.length,90,'3 s at 30 fps');
  assert.throws(()=>demuxMp4(new ArrayBuffer(16)),/mp4: no moov/);
});
