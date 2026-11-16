/** Reversible local CEP candidate install. Account/license files and native binaries are excluded. */
import {readFile,writeFile,readdir,mkdir,lstat,copyFile,unlink} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=path.join(root,'dist/after-effects-cep'),target=path.join(process.env.APPDATA,'Adobe/CEP/extensions/com.motion.plugin.ae');
const hash=b=>createHash('sha256').update(b).digest('hex');
async function read(file){try{return await readFile(file);}catch(e){if(e.code==='ENOENT')return null;throw e;}}
function destination(file){if(!/^(assets|client|CSXS|host|styles)\//.test(file) || file.split('/').includes('..'))throw Error('Invalid install path.');const resolved=path.resolve(target,file);if(!resolved.startsWith(path.resolve(target)+path.sep))throw Error('Escaping install path.');return resolved;}
async function checkParents(file){let dir=path.dirname(file);while(dir.startsWith(target)){try{if((await lstat(dir)).isSymbolicLink())throw Error('Refusing redirected install directory: '+dir);}catch(e){if(e.code!=='ENOENT')throw e;}dir=path.dirname(dir);}}
async function list(dir,prefix=''){const result=[];for(const entry of await readdir(dir,{withFileTypes:true})){const relative=prefix+entry.name;if(entry.isSymbolicLink())throw Error('Install payload contains symlink.');if(entry.isDirectory())result.push(...await list(path.join(dir,entry.name),relative+'/'));else result.push(relative);}return result;}
const rollbackIndex=process.argv.indexOf('--rollback');
if(rollbackIndex>=0){
 const receiptPath=path.resolve(process.argv[rollbackIndex+1]),receipt=JSON.parse(await readFile(receiptPath,'utf8'));
 if(path.resolve(receipt.target)!==path.resolve(target) || !receipt.applied)throw Error('Invalid install receipt.');
 for(const file of receipt.files){const dest=destination(file.path);await checkParents(dest);const data=await read(dest);if((data?hash(data):null)!==file.after)throw Error('Concurrent installed edit: '+file.path);}
 for(const file of receipt.files){const dest=destination(file.path);if(file.before===null)await unlink(dest);else{const backup=path.join(path.dirname(receiptPath),'backup',file.path),data=await readFile(backup);if(hash(data)!==file.before)throw Error('Backup hash mismatch.');await writeFile(dest,data);}}
 for(const file of receipt.files){const data=await read(destination(file.path));if((data?hash(data):null)!==file.before)throw Error('Rollback validation failed.');}
 receipt.rollback={status:'PASS',at:new Date().toISOString()};await writeFile(receiptPath,JSON.stringify(receipt,null,2));console.log(JSON.stringify({status:'PASS',operation:'rollback',files:receipt.files.length,receipt:receiptPath}));
}else{
 const files=[];for(const file of await list(source)){if(!/^(assets|client|CSXS|host|styles)\//.test(file))continue;const dest=destination(file);await checkParents(dest);const data=await readFile(path.join(source,file)),old=await read(dest),after=hash(data),before=old?hash(old):null;if(after!==before)files.push({path:file,before,after,bytes:data.length});}
 const stamp=new Date().toISOString().replaceAll(/[:.]/g,'-'),folder=path.join(root,'artifacts/tools-audit/install',stamp);await mkdir(folder,{recursive:true});
 const receipt={source,target,created:new Date().toISOString(),files,exclusions:['account/**','native Adobe binaries','preferences and existing files absent from payload'],applied:false};
 const receiptPath=path.join(folder,'receipt.json');await writeFile(receiptPath,JSON.stringify(receipt,null,2));
 if(process.argv.includes('--apply')){
  for(const file of files){const dest=destination(file.path),current=await read(dest);if((current?hash(current):null)!==file.before)throw Error('Concurrent installation edit.');if(current){const backup=path.join(folder,'backup',file.path);await mkdir(path.dirname(backup),{recursive:true});await writeFile(backup,current);}await mkdir(path.dirname(dest),{recursive:true});await copyFile(path.join(source,file.path),dest);if(hash(await readFile(dest))!==file.after)throw Error('Installed hash mismatch: '+file.path);}
  receipt.applied=true;await writeFile(receiptPath,JSON.stringify(receipt,null,2));
 }
 console.log(JSON.stringify({status:receipt.applied?'PASS':'READY',files:files.length,receipt:receiptPath,installedHostSha256:hash(await readFile(path.join(source,'host/index.jsx')))}));
}
