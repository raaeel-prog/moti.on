/** Native render proof without mouse, keyboard, window activation or third-party preset assets. */
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import sharp from 'sharp';
const root=path.resolve('.'),base=path.join(root,'artifacts/particles-rising-20261031');
const runId=new Date().toISOString().replaceAll(/[:.]/g,'-'),output=path.join(base,'render-'+runId);await mkdir(output,{recursive:true});
const installed=path.join(process.env.APPDATA,'Adobe/CEP/extensions/com.motion.plugin.ae/host/index.jsx');
const hash=data=>createHash('sha256').update(data).digest('hex');
const hostSha256=hash(await readFile(installed));
const normalize=file=>file.replaceAll('\\','/');
await writeFile(path.join(base,'render-request.json'),JSON.stringify({runId,output:normalize(output)}));
const bootstrap=path.join(output,'prepare.jsx');
await writeFile(bootstrap,`(function(){try{$.evalFile(new File(${JSON.stringify(normalize(path.join(root,'scripts/verify-particles-precomp-native.jsx')))}));}catch(e){var f=new File(${JSON.stringify(normalize(path.join(output,'bootstrap-error.txt')))});f.open("w");f.write(String(e)+";line="+e.line);f.close();}}());`);
const aeDir='C:/Program Files/Adobe/Adobe After Effects 2026/Support Files';
const launch=spawn(path.join(aeDir,'AfterFX.exe'),['-r',bootstrap],{windowsHide:true,stdio:'ignore'});launch.on('error',error=>{throw error;});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function json(file){try{return JSON.parse(await readFile(file,'utf8'));}catch(error){if(error.code==='ENOENT'||error instanceof SyntaxError)return null;throw error;}}
let preparation=null;
for(let i=0;i<180;i++){preparation=await json(path.join(output,'preparation.json'));if(preparation?.completed||preparation?.status==='BLOCKED')break;const error=await readFile(path.join(output,'bootstrap-error.txt'),'utf8').catch(()=>null);if(error)throw Error(error);await delay(500);}
assert.equal(preparation?.runId,runId,'Native fixture did not answer this run');assert.equal(preparation.status,'PREPARED',JSON.stringify(preparation));assert.equal(preparation.remainingItems,0,'Fixture cleanup did not restore the empty project');assert.equal(hash(await readFile(installed)),hostSha256,'Installed host changed during fixture preparation');
await writeFile(path.join(output,'source.json'),JSON.stringify({hostSha256,hostPath:installed,fixtureSha256:hash(await readFile(preparation.fixture)),mouseOrKeyboardUsed:false},null,2));
console.log(JSON.stringify({stage:'PREPARED',jobs:preparation.jobs.length,output}));
const child=spawn(path.join(aeDir,'aerender.exe'),['-project',preparation.fixture,'-v','ERRORS_AND_PROGRESS','-log',path.join(output,'aerender.log')],{windowsHide:true,stdio:['ignore','pipe','pipe']});
let stdio='';child.stdout.on('data',b=>{stdio+=b;});child.stderr.on('data',b=>{stdio+=b;});
const exit=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});await writeFile(path.join(output,'aerender-stdout.log'),stdio);assert.equal(exit,0,'aerender failed: '+stdio);
// AE can flush its render log and final image after the CLI launcher exits.
let ready=false;
for(let i=0;i<120;i++){const sizes=await Promise.all(preparation.jobs.map(job=>stat(job.file).then(s=>s.size).catch(()=>0)));if(sizes.every(size=>size>64)){ready=true;break;}await delay(500);}
assert.ok(ready,'Not every queued frame was produced');
const results=[],images=new Map();
for(const job of preparation.jobs){const bytes=await readFile(job.file),metadata=await sharp(bytes).metadata();assert.equal(metadata.width,job.width);assert.equal(metadata.height,job.height);assert.equal(metadata.hasAlpha,true,'Alpha channel missing');const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});let weight=0,xSum=0,ySum=0,visible=0;const quadrants=[0,0,0,0];
 for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){const alpha=data[(y*info.width+x)*info.channels+info.channels-1];weight+=alpha;xSum+=alpha*x;ySum+=alpha*y;if(alpha>0){visible++;quadrants[(y>=info.height/2?2:0)+(x>=info.width/2?1:0)]++;}}
 assert.ok(visible>20,job.label+' rendered no visible particles');const measured={label:job.label,sha256:hash(bytes),visiblePixels:visible,centroid:[xSum/weight,ySum/weight],quadrants};results.push(measured);images.set(job.label,{data,info,measured});
}
const checks=[...preparation.tests];
for(const angle of [0,90,180,270,45]){const a=images.get(`direction-${angle}-a`).measured.centroid,b=images.get(`direction-${angle}-b`).measured.centroid,[dx,dy]=b.map((n,i)=>n-a[i]);
 if(angle===45){assert.ok(dx>2&&dy< -2&&Math.abs(dx/dy)>.6&&Math.abs(dx/dy)<1.6,'Diagonal direction mismatch');}
 else{const principal=angle%180===0?dy:dx,other=angle%180===0?dx:dy;assert.equal(Math.sign(principal),angle===0||angle===270?-1:1,`Wrong direction ${angle}`);assert.ok(Math.abs(principal)>2&&Math.abs(other)<Math.abs(principal)*.35,`Direction ${angle} is not predominant`);}
 checks.push({name:`native precomp direction ${angle}`,status:'PASS',deltaPixels:[dx,dy]});
}
for(const frame of ['a','b']){assert.deepEqual(images.get('direction-0-'+frame).data,images.get('inline-'+frame).data,'Precompose changed the rendered pixels');checks.push({name:`precomp/inline pixel equality ${frame}`,status:'PASS'});}
const stillA=images.get('still-a').measured.centroid,stillB=images.get('still-b').measured.centroid;assert.ok(Math.hypot(stillB[0]-stillA[0],stillB[1]-stillA[1])<.75,'Zero velocity drifted');checks.push({name:'zero velocity',status:'PASS'});
for(const name of ['landscape','portrait']){assert.ok(images.get(name).measured.quadrants.every(n=>n>100),name+' did not distribute particles across the frame');checks.push({name:`default distribution ${name}`,status:'PASS'});const job=preparation.jobs.find(job=>job.label===name);await sharp(job.file).png().toFile(path.join(output,name+'.png'));}
await sharp(preparation.jobs.find(job=>job.label==='direction-0-a').file).png().toFile(path.join(output,'up-a.png'));
await sharp(preparation.jobs.find(job=>job.label==='direction-0-b').file).png().toFile(path.join(output,'up-b.png'));
const report={status:'PASS',host:preparation.host,hostSha256,fixture:preparation.fixture,mouseOrKeyboardUsed:false,frames:results,checks,limits:['UI Undo/Redo and panel mouse/keyboard interaction not exercised.'],output};
await writeFile(path.join(output,'result.json'),JSON.stringify(report,null,2));await writeFile(path.join(base,'render-validation.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:'PASS',frames:results.length,checks:checks.length,output}));
