import assert from 'node:assert/strict';
import sharp from 'sharp';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root='artifacts/particles-rising-20261031',rows=[];
for(const angle of [0,90,180,270]){
 const points=[],hashes=[];
 for(const frame of ['a','b']){
  const file=await readFile(`${root}/direction-${angle}-${frame}.png`);hashes.push(createHash('sha256').update(file).digest('hex'));
  const {data,info}=await sharp(file).ensureAlpha().raw().toBuffer({resolveWithObject:true});let weight=0,xSum=0,ySum=0;
  for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){const alpha=data[(y*info.width+x)*4+3];weight+=alpha;xSum+=alpha*x;ySum+=alpha*y;}
  assert.ok(weight>0,'Native calibration contains no visible particles');points.push([xSum/weight,ySum/weight]);
 }
 const [dx,dy]=points[1].map((value,i)=>value-points[0][i]);
 const principal=angle%180===0?dy:dx,other=angle%180===0?dx:dy;
 assert.equal(Math.sign(principal),angle===0||angle===270?-1:1,`Native direction ${angle} points the wrong way`);
 assert.ok(Math.abs(principal)>5&&Math.abs(principal)>Math.abs(other)*1.2,`Native direction ${angle} is not predominant`);
 rows.push({angle,deltaPixels:[dx,dy],frameHashes:hashes,status:'PASS'});
}
await writeFile(`${root}/direction-calibration.json`,JSON.stringify({status:'PASS',method:'Alpha-weighted centroid displacement between native renders at 1s and 1.2s; emission stops at 0.1s.',rows},null,2));console.log(JSON.stringify({status:'PASS',directions:rows.length}));
