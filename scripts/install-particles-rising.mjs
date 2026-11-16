/** Installs only this feature's three bundles, preserving credentials/native binaries. */
import {readFile,writeFile,mkdir,lstat} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const root=path.resolve('.'),source=path.join(root,'dist/after-effects-cep'),target=path.join(process.env.APPDATA,'Adobe/CEP/extensions/com.motion.plugin.ae');
const out=path.join(root,'artifacts/particles-rising-20261031/install',new Date().toISOString().replaceAll(/[:.]/g,'-')),files=['client/main.js','host/index.jsx','styles/theme.css'];
const hash=data=>createHash('sha256').update(data).digest('hex');
async function parents(file){let dir=path.dirname(file);while(dir.startsWith(target)){if((await lstat(dir)).isSymbolicLink())throw Error('Redirected installation directory');dir=path.dirname(dir);}}
await mkdir(out,{recursive:true});const receiptPath=path.join(out,'receipt.json');
let prior=null;try{prior=JSON.parse(await readFile(receiptPath,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
if(prior?.applied)throw Error('Installation already applied; preserve its rollback receipt.');
const rows=[];for(const file of files){const dest=path.join(target,file);await parents(dest);const before=await readFile(dest),after=await readFile(path.join(source,file));const backup=path.join(out,'backup',file);await mkdir(path.dirname(backup),{recursive:true});await writeFile(backup,before);rows.push({path:file,before:hash(before),after:hash(after),bytes:after.length});}
const receipt={target,source,files:rows,applied:false};await writeFile(receiptPath,JSON.stringify(receipt,null,2));
// Validate every target before writing the first one.
for(const row of rows)if(hash(await readFile(path.join(target,row.path)))!==row.before)throw Error('Installed file changed concurrently');
const applied=[];
try{for(const row of rows){const dest=path.join(target,row.path);await writeFile(dest,await readFile(path.join(source,row.path)));applied.push(row);if(hash(await readFile(dest))!==row.after)throw Error('Installed hash mismatch');}receipt.applied=true;receipt.status='PASS';}
catch(error){for(const row of applied.reverse()){const dest=path.join(target,row.path);if(hash(await readFile(dest))!==row.after)throw Error('Concurrent edit prevents safe rollback',{cause:error});await writeFile(dest,await readFile(path.join(out,'backup',row.path)));}throw error;}
finally{await writeFile(receiptPath,JSON.stringify(receipt,null,2));}
console.log(JSON.stringify({status:receipt.status,files:rows.length,receipt:receiptPath}));
