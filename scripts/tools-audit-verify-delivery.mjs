/** Compare the tested source and installed CEP payload without reading account state. */
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const base=JSON.parse(await readFile(path.join(root,'artifacts/tools-audit/baseline.json'),'utf8'));
const installed=path.join(process.env.APPDATA,'Adobe/CEP/extensions/com.motion.plugin.ae');
const hash=data=>createHash('sha256').update(data).digest('hex');
async function sha(file){try{return hash(await readFile(file));}catch(error){if(error.code==='ENOENT')return null;throw error;}}
const all=execFileSync('git',['ls-files','-c','-o','--exclude-standard','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean);
const sources=[],drift=[];
for(const file of new Set(all)){
 if(!/^(apps\/[^/]+\/(client|host|src|styles|assets|CSXS|manifest)|packages\/[^/]+\/(src|schemas)|native\/|scripts\/build|package(?:-lock)?\.json$|tsconfig)/.test(file))continue;
 const tested=await sha(path.join(root,file)),principal=await sha(path.join(base.source,file));
 if(tested!==principal)drift.push(file);
 sources.push({file,sha256:tested,principalSha256:principal});
}
async function list(dir,prefix=''){const files=[];for(const entry of await readdir(dir,{withFileTypes:true})){const file=prefix+entry.name;if(entry.isSymbolicLink())throw Error('Payload symlink.');if(entry.isDirectory())files.push(...await list(path.join(dir,entry.name),file+'/'));else files.push(file);}return files;}
const payload=[],mismatch=[];
for(const file of await list(path.join(root,'dist/after-effects-cep'))){
 if(!/^(assets|client|CSXS|host|styles)\//.test(file))continue;
 const tested=await sha(path.join(root,'dist/after-effects-cep',file)),actual=await sha(path.join(installed,file));
 payload.push({file,sha256:tested,installedSha256:actual});if(tested!==actual)mismatch.push(file);
}
const receipt={at:new Date().toISOString(),status:drift.length||mismatch.length?'FAIL':'PASS',execution:root,principal:base.source,installed,sourceDrift:drift,installedMismatch:mismatch,sources,payload,limits:['Hashes establish source/payload identity, not runtime behavior or complete professional readiness.']};
await writeFile(path.join(root,'artifacts/tools-audit/delivery-integrity.json'),JSON.stringify(receipt,null,2));
console.log(JSON.stringify({status:receipt.status,sources:sources.length,payload:payload.length,sourceDrift:drift,installedMismatch:mismatch}));if(receipt.status!=='PASS')process.exitCode=1;
