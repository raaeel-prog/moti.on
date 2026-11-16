/** Synchronize the principal's complete dependency set, preserving unintegrated audit edits. */
import {readFile,writeFile,readdir,mkdir} from 'node:fs/promises';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),base=JSON.parse(await readFile(path.join(root,'artifacts/tools-audit/baseline.json'),'utf8')),source=path.resolve(base.source);
if(root===source)throw Error('Refusing sync into the principal.');
const hash=data=>createHash('sha256').update(data).digest('hex'),known=new Map();
function accept(file,sha){if(!known.has(file))known.set(file,new Set());known.get(file).add(sha);}
for(const row of base.files)accept(row.path.replaceAll('\\','/'),row.sha256);
async function read(file){try{return await readFile(file);}catch(error){if(error.code==='ENOENT')return null;throw error;}}
const snapshotRaw=await read(path.join(root,'artifacts/tools-audit/current-source-snapshot.json'));if(snapshotRaw)for(const row of JSON.parse(snapshotRaw).files)accept(row.file,row.sha256);
for(const name of ['integration','sync','source-sync']){
 const dir=path.join(root,'artifacts/tools-audit',name);let entries;try{entries=await readdir(dir);}catch(error){if(error.code==='ENOENT')continue;throw error;}
 for(const entry of entries){const raw=await read(path.join(dir,entry,'receipt.json'));if(!raw)continue;const receipt=JSON.parse(raw);if(name==='integration'&&receipt.applied&&path.resolve(receipt.source)===root)for(const row of receipt.changes)accept(row.file,row.after);if(name!=='integration')for(const row of receipt.files??[])accept(row.file,row.after);}
}
const names=execFileSync('git',['ls-files','-c','-o','--exclude-standard','-z'],{cwd:source,encoding:'utf8'}).split('\0').filter(Boolean),changes=[],files=[],conflicts=[];
for(const file of new Set(names)){
 if(/^(artifacts|graphify-out|docs)\//.test(file))continue;
 const from=path.resolve(source,file),to=path.resolve(root,file);if(!from.startsWith(source+path.sep)||!to.startsWith(root+path.sep))throw Error('Invalid source path.');
 const data=await read(from);if(!data)continue;const current=await read(to),before=current?hash(current):null,after=hash(data);files.push({file,sha256:after});if(before===after)continue;
 if(before!==null&&!known.get(file)?.has(before)){conflicts.push(file);continue;}changes.push({file,before,after,data});
}
if(conflicts.length)throw Error('Unintegrated audit changes: '+conflicts.join(', '));
const stamp=new Date().toISOString().replaceAll(/[:.]/g,'-'),out=path.join(root,'artifacts/tools-audit/source-sync',stamp);
if(process.argv.includes('--apply')){
 for(const row of changes){const from=path.join(source,row.file),to=path.join(root,row.file),current=await read(to);if((current?hash(current):null)!==row.before||hash(await readFile(from))!==row.after)throw Error('Source changed during sync: '+row.file);if(current){const backup=path.join(out,'backup',row.file);await mkdir(path.dirname(backup),{recursive:true});await writeFile(backup,current);}await mkdir(path.dirname(to),{recursive:true});await writeFile(to,row.data);}
 await mkdir(out,{recursive:true});await writeFile(path.join(out,'receipt.json'),JSON.stringify({at:new Date().toISOString(),source,target:root,files:changes.map(({file,before,after})=>({file,before,after}))},null,2));await writeFile(path.join(root,'artifacts/tools-audit/current-source-snapshot.json'),JSON.stringify({source,execution:root,at:new Date().toISOString(),files},null,2));
}
console.log(JSON.stringify({status:process.argv.includes('--apply')?'PASS':'READY',files:files.length,changed:changes.map(row=>row.file)}));
