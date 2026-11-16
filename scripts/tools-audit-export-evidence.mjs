/** Guarded evidence refresh; never modifies product files or unrelated target artifacts. */
import {readFile,writeFile,readdir,mkdir,lstat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const workspace=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=path.join(workspace,'artifacts/tools-audit');
const baseline=JSON.parse(await readFile(path.join(source,'baseline.json'),'utf8'));
const target=path.join(baseline.source,'artifacts/tools-audit');
if(path.resolve(source)===path.resolve(target))throw Error('Evidence source equals target.');
const hash=data=>createHash('sha256').update(data).digest('hex');
async function read(file){try{return await readFile(file);}catch(error){if(error.code==='ENOENT')return null;throw error;}}
const previousRaw=await read(path.join(target,'evidence-receipt.json'));
const previous=new Map((previousRaw?JSON.parse(previousRaw).files:[]).map(row=>[row.file,row.sha256]));
const folders=new Set(['catalog-native','context-native','controls-native','faults-native','faults-instrumented-native','ease-native','geometry-native','gradient-native','neon-native','parallax-native','particles-native','particles-polish-native','undo-native','browser','test-logs','install']);
async function list(dir,prefix=''){
 const result=[];
 for(const entry of await readdir(dir,{withFileTypes:true})){
  const relative=prefix+entry.name;
  if(entry.isSymbolicLink())throw Error('Symlink in evidence: '+relative);
  if(entry.isDirectory()){
   if(prefix || folders.has(entry.name) || /^fault-instrumented-/.test(entry.name))result.push(...await list(path.join(dir,entry.name),relative+'/'));
  }else if(relative!=='evidence-receipt.json' && (prefix || /\.(json|log|png|wav)$/.test(relative)))result.push(relative);
 }
 return result;
}
const files=[],writes=[],conflicts=[];
for(const file of await list(source)){
 const dest=path.resolve(target,file);
 if(!dest.startsWith(path.resolve(target)+path.sep))throw Error('Invalid evidence path.');
 let parent=path.dirname(dest);
 while(parent.startsWith(path.resolve(target))){try{if((await lstat(parent)).isSymbolicLink())throw Error('Redirected evidence path.');}catch(error){if(error.code!=='ENOENT')throw error;}parent=path.dirname(parent);}
 const data=await readFile(path.join(source,file)),sha256=hash(data),old=await read(dest),before=old?hash(old):null;
 files.push({file,sha256,bytes:data.length});
 if(before===sha256)continue;
 if(before!==null && before!==previous.get(file)){conflicts.push(file);continue;}
 writes.push({file,before,data});
}
if(conflicts.length)throw Error('Concurrent evidence edits: '+conflicts.join(', '));
if(process.argv.includes('--apply')){
 for(const row of writes){const dest=path.join(target,row.file),current=await read(dest);if((current?hash(current):null)!==row.before)throw Error('Evidence changed during export: '+row.file);await mkdir(path.dirname(dest),{recursive:true});await writeFile(dest,row.data);if(hash(await readFile(dest))!==files.find(file=>file.file===row.file).sha256)throw Error('Evidence copy mismatch.');}
 await writeFile(path.join(target,'evidence-receipt.json'),JSON.stringify({source,target,at:new Date().toISOString(),files},null,2));
}
console.log(JSON.stringify({status:process.argv.includes('--apply')?'PASS':'READY',files:files.length,updated:writes.length,target}));
