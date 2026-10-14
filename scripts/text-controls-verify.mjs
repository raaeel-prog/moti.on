/** Compare actual rendered pixels, excluding PNG metadata and timestamps. */
import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const ffmpeg=process.env.MOTION_FFMPEG||'C:/Users/raaee/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg.Shared_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-8.1.2-full_build-shared/bin/ffmpeg.exe';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function verifyTextControlImages(report){
  const controls=report.liveControls;
  if(report.status!=='PASS'||!Array.isArray(controls)||new Set(controls.map(c=>c.curve)).size!==controls.length||!['spring','settle-wave','settle-hop'].every(name=>controls.some(c=>c.curve===name)))throw Error('Incomplete live text control fixture');
  for(const fixture of report.liveControls){
    const pixels=file=>execFileSync(ffmpeg,['-v','error','-i',file,'-frames:v','1','-f','rawvideo','-pix_fmt','rgba','-'],{windowsHide:true,maxBuffer:4*1024*1024});
    const before=pixels(fixture.before),after=pixels(fixture.after);if(before.length!==after.length||before.length!==640*360*4)throw Error('Unexpected rendered fixture dimensions');
    let changedPixels=0,maxChannelDifference=0;
    for(let i=0;i<before.length;i+=4){let changed=false;for(let channel=0;channel<4;channel++){const delta=Math.abs(before[i+channel]-after[i+channel]);changed ||= delta>0;maxChannelDifference=Math.max(maxChannelDifference,delta);}if(changed)changedPixels++;}
    fixture.beforeSha256=hash(await readFile(fixture.before));fixture.afterSha256=hash(await readFile(fixture.after));fixture.beforePixelSha256=hash(before);fixture.afterPixelSha256=hash(after);fixture.changedPixels=changedPixels;fixture.maxChannelDifference=maxChannelDifference;fixture.status=(fixture.expectedIdentical?changedPixels===0:changedPixels>0)?'PASS':'FAIL';
  }
  if(report.liveControls.some(fixture=>fixture.status!=='PASS'))report.status='FAIL';return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const file=process.argv[2]||fileURLToPath(new URL('../artifacts/text-presets/ae-lifecycle.json',import.meta.url));const report=await verifyTextControlImages(JSON.parse(await readFile(file,'utf8')));await writeFile(file,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,controls:report.liveControls.map(({curve,status,changedPixels,maxChannelDifference})=>({curve,status,changedPixels,maxChannelDifference}))}));if(report.status!=='PASS')throw Error('A live text slider did not change the rendered pixels');
}
