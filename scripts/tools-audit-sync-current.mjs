/** Bring only explicitly preserved concurrent files into the audit checkout. */
import {readFile,writeFile,readdir,mkdir} from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),folder=path.join(root,'artifacts/tools-audit/integration');
const entries=(await readdir(folder)).sort().reverse();let receipt;
for(const name of entries){const candidate=JSON.parse(await readFile(path.join(folder,name,'receipt.json'),'utf8'));if(candidate.applied&&path.resolve(candidate.source)===root){receipt=candidate;break;}}
if(!receipt)throw Error('No applied audit integration receipt.');
const sha=data=>createHash('sha256').update(data).digest('hex'),stamp=new Date().toISOString().replaceAll(/[:.]/g,'-'),out=path.join(root,'artifacts/tools-audit/sync',stamp),files=[];
for(const row of receipt.preservedConcurrent??[]){
 const local=path.resolve(root,row.file),main=path.resolve(receipt.target,row.file);if(!local.startsWith(root+path.sep)||!main.startsWith(path.resolve(receipt.target)+path.sep))throw Error('Invalid sync path.');
 const own=await readFile(local),current=await readFile(main);if(sha(own)!==row.after||sha(current)!==row.current)throw Error('Concurrent sync edit: '+row.file);
 if(process.argv.includes('--apply')){await mkdir(path.dirname(path.join(out,'backup',row.file)),{recursive:true});await writeFile(path.join(out,'backup',row.file),own);await writeFile(local,current);}
 files.push({file:row.file,before:sha(own),after:sha(current)});
}
if(process.argv.includes('--apply')){await mkdir(out,{recursive:true});await writeFile(path.join(out,'receipt.json'),JSON.stringify({at:new Date().toISOString(),source:receipt.target,target:root,files},null,2));}
console.log(JSON.stringify({status:process.argv.includes('--apply')?'PASS':'READY',files:files.map(row=>row.file)}));
