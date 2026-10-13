import {readdir,readFile,writeFile,mkdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {groupConditionalBranches,toAsciiExtendScript} from './build-extendscript.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),output=path.join(root,'artifacts','text-presets');
const templates=process.env.MOTION_BADFX_TEMPLATES||'C:/Users/raaee/AppData/Roaming/BadEdits/Packs/Essential Presets AE/Presets/templates';
const names=(await readdir(templates)).filter(name=>/^(Letters|Words|Lines) (Fade|Position|Rotate|Scale) 0[1-4]\.ffx$/.test(name)).sort();
if(names.length!==48)throw Error(`Expected the installed 48 text FFX, found ${names.length}`);
const comparisons=process.argv.includes('--comparisons');
const entries=[];for(const name of names){const file=path.join(templates,name);entries.push({name,path:file.replaceAll('\\','/'),sha256:createHash('sha256').update(await readFile(file)).digest('hex'),...(comparisons&&name.startsWith('Letters ')?{avi:path.join(output,'badfx-raw',name.replace('.ffx','.avi')).replaceAll('\\','/')}:{} )});}
await mkdir(output,{recursive:true});
const job={runId:randomUUID(),host:path.join(root,'dist/after-effects-cep/host/index.jsx').replaceAll('\\','/'),report:path.join(output,'badfx-host-study.json').replaceAll('\\','/'),entries};
if(comparisons){await mkdir(path.join(output,'badfx-raw'),{recursive:true});job.aep=path.join(output,'badfx-comparisons.aep').replaceAll('\\','/');}
const source=`(function(){var job=${JSON.stringify(job)};\n${await readFile(new URL('./text-presets-badfx-study.jsx',import.meta.url),'utf8')}\n}());`;
const script=path.join(output,'badfx-study-job.jsx');await writeFile(script,toAsciiExtendScript(groupConditionalBranches(source),'badfx-study-job.jsx'));
const executable=path.join(process.env.MOTION_AE_DIRECTORY||'C:/Program Files/Adobe/Adobe After Effects 2026/Support Files','AfterFX.com');
const child=spawn(executable,['-m','-r',script],{windowsHide:true,stdio:'ignore'});
console.log(`Isolated BadFX study PID ${child.pid}, 48 disposable text layers`);
const timer=setTimeout(()=>child.kill(),900000);
const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});clearTimeout(timer);
if(code!==0)throw Error(`Study process exited ${code}`);
const report=JSON.parse(await readFile(job.report,'utf8'));
if(report.runId!==job.runId||report.status!=='PASS'||report.entries.length!==48)throw Error(`Host study ${report.status}: ${report.error?.message||'coverage mismatch'}`);
console.log(`PASS ${report.entries.length} installed FFX observed in AE ${report.hostVersion}; formulas excluded`);
