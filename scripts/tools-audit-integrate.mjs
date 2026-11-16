/** Selective integration against the exact preserved dirty checkout. No resets or tree overlays. */
import {readFile,writeFile,readdir,mkdir,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {integrationDecision} from './tools-audit-integration-policy.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const base=JSON.parse(await readFile(path.join(root,'artifacts/tools-audit/baseline.json'),'utf8'));
if(path.resolve(root)===path.resolve(base.source))throw Error('Integration must run from the preserved audit workspace, not its target.');
const hash=b=>createHash('sha256').update(b).digest('hex');
async function read(file){try{return await readFile(file);}catch(e){if(e.code==='ENOENT')return null;throw e;}}
const baseline=new Map(base.files.map(file=>[file.path.replaceAll('\\','/'),file]));
const accepted=new Map(),latestIntegrated=new Map();
const snapshotRaw=await read(path.join(root,'artifacts/tools-audit/current-source-snapshot.json'));
const imported=new Map((snapshotRaw?JSON.parse(snapshotRaw).files:[]).map(row=>[row.file,row.sha256]));
try{for(const entry of (await readdir(path.join(root,'artifacts/tools-audit/integration'),{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){if(!entry.isDirectory())continue;const receipt=JSON.parse(await readFile(path.join(root,'artifacts/tools-audit/integration',entry.name,'receipt.json'),'utf8'));if(!receipt.applied || path.resolve(receipt.target)!==path.resolve(base.source))continue;for(const change of receipt.changes){if(!accepted.has(change.file))accepted.set(change.file,new Set());accepted.get(change.file).add(change.after);latestIntegrated.set(change.file,change.after);}}}catch(e){if(e.code!=='ENOENT')throw e;}
const files=execFileSync('git',['ls-files','-c','-o','--exclude-standard','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean);
const changes=[],conflicts=[],preservedConcurrent=[];
for(const file of new Set(files)){
 const data=await read(path.join(root,file));if(!data)continue;
 const sha=hash(data),before=baseline.get(file),old=before?.exists?before.sha256:null;
 if(sha===old)continue;
 const target=path.resolve(base.source,file);if(!target.startsWith(path.resolve(base.source)+path.sep))throw Error('Invalid integration path.');
 const current=await read(target),actual=current?hash(current):null;
 const change={file,before:old,current:actual,after:sha,bytes:data.length};
 const decision=integrationDecision({source:sha,target:actual,baseline:old,integrated:latestIntegrated.get(file),imported:imported.get(file),accepted:[...(accepted.get(file)??[])]});
 if(decision==='preserve-concurrent')preservedConcurrent.push(change);else if(decision==='conflict')conflicts.push(change);else changes.push(change);
}
const stamp=new Date().toISOString().replaceAll(/[:.]/g,'-'),folder=path.join(root,'artifacts/tools-audit/integration',stamp);
await mkdir(folder,{recursive:true});const receipt={source:root,target:base.source,baselineHead:base.head,changes,conflicts,preservedConcurrent,applied:false};
await writeFile(path.join(folder,'receipt.json'),JSON.stringify(receipt,null,2));
if(conflicts.length){console.log(JSON.stringify({status:'CONFLICT',receipt:folder,files:conflicts.map(c=>c.file)}));process.exitCode=1;}
else if(process.argv.includes('--apply')){
 for(const change of changes){
  const target=path.join(base.source,change.file),data=await read(target),sha=data?hash(data):null;
  if(sha!==change.current)throw Error('Concurrent edit detected: '+change.file);
  if(sha===change.after)continue;
  if(data){const backup=path.join(folder,'backup',change.file);await mkdir(path.dirname(backup),{recursive:true});await writeFile(backup,data);}
  await mkdir(path.dirname(target),{recursive:true});await copyFile(path.join(root,change.file),target);
  if(hash(await readFile(target))!==change.after)throw Error('Integration hash failed: '+change.file);
 }
 receipt.applied=true;await writeFile(path.join(folder,'receipt.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify({status:'PASS',files:changes.length,preservedConcurrent:preservedConcurrent.map(c=>c.file),receipt:folder}));
}else console.log(JSON.stringify({status:'READY',files:changes.length,receipt:folder}));
