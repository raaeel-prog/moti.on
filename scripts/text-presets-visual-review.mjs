/** Local review media only. Competitor references never enter shipped assets. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),evidence=path.join(root,'artifacts','text-presets'),assets=path.join(root,'apps/after-effects-cep/assets/text-previews');
const ffmpeg=process.env.MOTION_FFMPEG||'C:/Users/raaee/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg.Shared_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-8.1.2-full_build-shared/bin/ffmpeg.exe';
async function run(binary,args){const child=spawn(binary,args,{windowsHide:true,stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});if(code!==0)throw Error(output.slice(-3000));}
async function grid(inputs,labels,columns,destination){
  const filters=inputs.map((_,i)=>`[${i}:v]fps=24,scale=480:270,pad=480:298:0:28:color=0x121212,drawtext=fontfile='C\\:/Windows/Fonts/arial.ttf':text='${labels[i]}':fontcolor=white:fontsize=16:x=12:y=6[v${i}]`);
  filters.push(inputs.map((_,i)=>`[v${i}]`).join('')+`xstack=inputs=${inputs.length}:layout=`+inputs.map((_,i)=>`${(i%columns)*480}_${Math.floor(i/columns)*298}`).join('|')+'[grid]');
  await run(ffmpeg,['-hide_banner','-loglevel','error','-y',...inputs.flatMap(file=>['-i',file]),'-filter_complex',filters.join(';'),'-map','[grid]','-t','4','-an','-c:v','libx264','-preset','fast','-crf','20','-pix_fmt','yuv420p',destination]);
  await run(ffmpeg,['-hide_banner','-loglevel','error','-y','-ss','0.55','-i',destination,'-frames:v','1','-q:v','3',destination.replace('.mp4','.jpg')]);
}
await mkdir(evidence,{recursive:true});
const representative=['characters-fade-cascade','characters-position-rise','characters-rotate-swing','characters-scale-bloom','words-tracking-spread','words-mask-rise-window','characters-typewriter-precise','characters-decode-resolve','lines-combination-lift-turn','characters-rotate-yaw-3d','characters-loop-drift','words-loop-wave'];
await grid(representative.map(id=>path.join(assets,`text-v3-${id}.mp4`)),representative,4,path.join(evidence,'original-families-review.mp4'));
if(process.argv.includes('--badfx')){
  const study=JSON.parse(await readFile(path.join(evidence,'badfx-host-study.json'),'utf8'));
  if(study.status!=='PASS'||study.entries.length!==48||study.entries.some(entry=>!entry.controls))throw Error('Detailed native study must PASS before comparisons');
  const aerender=path.join(process.env.MOTION_AE_DIRECTORY||'C:/Program Files/Adobe/Adobe After Effects 2026/Support Files','aerender.exe');
  await run(aerender,['-project',path.join(evidence,'badfx-comparisons.aep'),'-v','ERRORS_AND_PROGRESS']);
  const variants={Fade:['cascade','focus','center','spark'],Position:['rise','drop','slide','ricochet'],Rotate:['lean','turn','swing','scatter'],Scale:['bloom','near','width','height']};
  for(const [family,ids] of Object.entries(variants)){
    const native=ids.map((_,i)=>path.join(evidence,'badfx-raw',`Letters ${family} 0${i+1}.avi`)),own=ids.map(id=>path.join(assets,`text-v3-characters-${family.toLowerCase()}-${id}.mp4`));
    await grid([...native,...own],[...ids.map((_,i)=>`BadFX ${family} 0${i+1}`),...ids.map(id=>`Moti.on ${id}`)],4,path.join(evidence,`compare-${family.toLowerCase()}.mp4`));
  }
  await writeFile(path.join(evidence,'visual-comparison.json'),JSON.stringify({status:'RENDERED_FOR_REVIEW',scope:'Four core families; same original text, font, framing, 480x270, 24fps and 4 seconds; native defaults versus own recipe defaults. Family comparison, not identical timing or mathematical equivalence.',families:Object.keys(variants),nativeHost:study.hostVersion,thirdPartyAssetsShipped:false},null,2));
}
console.log('Original family review generated'+(process.argv.includes('--badfx')?' with four local BadFX comparisons':''));
