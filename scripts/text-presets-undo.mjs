import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {groupConditionalBranches,toAsciiExtendScript} from './build-extendscript.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),evidence=path.join(root,'artifacts','text-presets');
const mode=process.argv[2];if(!['setup','apply','verify','cleanup'].includes(mode))throw Error('Expected setup, apply, verify or cleanup; perform one real UI Undo between apply and verify.');
await mkdir(evidence,{recursive:true});
const jobFile=path.join(evidence,'undo-job.json');
const job=mode==='setup'?{runId:randomUUID(),project:path.join(evidence,'text-undo.aep'),host:path.join(root,'dist/after-effects-cep/host/index.jsx')}:JSON.parse(await readFile(jobFile,'utf8'));
job.mode=mode;job.report=path.join(evidence,`ae-undo-${mode}.json`);await writeFile(jobFile,JSON.stringify(job,null,2));
const source=`(function(){var job=${JSON.stringify(job)};\n${await readFile(new URL('./text-presets-undo.jsx',import.meta.url),'utf8')}\n}());`;
const script=path.join(evidence,`undo-${mode}.jsx`);await writeFile(script,toAsciiExtendScript(groupConditionalBranches(source),'undo.jsx'));
// setup owns a new instance. Later operations require the guarded project and
// must only be dispatched when this is the sole running After Effects instance.
const executable=path.join(process.env.MOTION_AE_DIRECTORY||'C:/Program Files/Adobe/Adobe After Effects 2026/Support Files','AfterFX.com');
if(!process.argv.includes('--generate-only')){
  const child=spawn(executable,[...(mode==='setup'&&!process.argv.includes('--reuse-owned')?['-m']:[]),'-r',script],{windowsHide:true,stdio:'ignore'});console.log(`Dispatched ${mode}; PID ${child.pid}; report ${job.report}`);
  await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});
}
