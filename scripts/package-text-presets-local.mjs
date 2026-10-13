/** Unsigned local AE candidate from an immutable, clean source commit. */
import {execFileSync} from 'node:child_process';
import {readFile,writeFile,readdir,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
if(git('status','--porcelain'))throw Error('Commit all candidate source and generated assets before packaging.');
const commit=git('rev-parse','HEAD'),version=JSON.parse(await readFile(path.join(root,'package.json'),'utf8')).version;
execFileSync(process.env.ComSpec||'cmd.exe',['/d','/c','npm.cmd run build'],{cwd:root,stdio:'inherit'});
execFileSync(process.execPath,['scripts/validate.mjs'],{cwd:root,stdio:'inherit'});
execFileSync(process.execPath,['--test','tests/build-output.test.mjs'],{cwd:root,stdio:'inherit'});
if(git('status','--porcelain'))throw Error('Build changed tracked source; review and commit the generated result first.');
const extension=path.join(root,'dist/after-effects-cep'),output=path.join(root,'artifacts/text-presets/delivery');await mkdir(output,{recursive:true});
const inventory=[];
async function visit(directory){for(const entry of await readdir(directory,{withFileTypes:true})){const file=path.join(directory,entry.name);if(entry.isDirectory())await visit(file);else if(entry.isFile()){const relative=path.relative(extension,file).replaceAll('\\','/');if(/(^|\/)(\.debug|developer-unlock|config\.json|node_modules|tests|src)(\/|$)|\.(map|ts|aep|avi|log)$|text-qa/.test(relative))throw Error(`Development/private file in candidate: ${relative}`);const bytes=await readFile(file);inventory.push({path:relative,size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}}}
await visit(extension);
const notices=['LICENSE','THIRD_PARTY_NOTICES.md'];for(const name of notices){const bytes=await readFile(path.join(root,name));inventory.push({path:name,size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}
inventory.sort((a,b)=>a.path.localeCompare(b.path));
const manifest=JSON.parse(await readFile(path.join(extension,'assets/text-previews/manifest.json'),'utf8'));
if(Object.keys(manifest.presets).length!==108)throw Error('Missing original text reference coverage');
const filename=`Moti.on-${version}-text-v3-local-${commit.slice(0,8)}.zip`,archive=path.join(output,filename);
execFileSync('tar.exe',['-a','-c','-f',archive,'-C',extension,'.','-C',root,...notices],{cwd:root,stdio:'inherit'});
const contents=execFileSync('tar.exe',['-t','-f',archive],{encoding:'utf8'}).split(/\r?\n/).filter(name=>name&&!name.endsWith('/')).map(name=>name.replace(/^\.\//,'')).sort();
if(JSON.stringify(contents)!==JSON.stringify(inventory.map(entry=>entry.path).sort()))throw Error('Archive inventory differs from the verified extension');
const receipt={kind:'unsigned-local-development-candidate',productVersion:version,sourceCommit:commit,createdAt:new Date().toISOString(),timestampPolicy:'Build and archive timestamps are recorded; source, file hashes and archive hash are authoritative.',target:{os:'Windows',architecture:'x64',observedHost:'After Effects 2026 26.5x89'},package:filename,sha256:createHash('sha256').update(await readFile(archive)).digest('hex'),fileCount:inventory.length,originalTextRecipes:108,signature:'NOT RUN',installation:'NOT RUN',installedPanelVerification:'NOT RUN',releaseDecision:'HOLD',files:inventory};
await writeFile(path.join(output,'candidate-receipt.json'),JSON.stringify(receipt,null,2)+'\n');
const sbom={bomFormat:'CycloneDX',specVersion:'1.6',version:1,metadata:{timestamp:receipt.createdAt,component:{type:'application',name:'Moti.on After Effects local text candidate',version}},components:inventory.map(entry=>({type:'file',name:entry.path,hashes:[{alg:'SHA-256',content:entry.sha256}]}))};
await writeFile(path.join(output,'sbom.cdx.json'),JSON.stringify(sbom,null,2)+'\n');
await writeFile(path.join(output,'SHA256SUMS.txt'),`${receipt.sha256}  ${filename}\n`);
console.log(JSON.stringify({package:archive,sourceCommit:commit,sha256:receipt.sha256,files:inventory.length,releaseDecision:'HOLD'},null,2));
