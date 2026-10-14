/** Reproducible coverage matrix from original recipes and observation evidence. */
import {readFile,writeFile} from 'node:fs/promises';
import {build} from 'esbuild';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),evidence=path.join(root,'artifacts/text-presets');
const json=async name=>JSON.parse(await readFile(path.join(evidence,name),'utf8'));
const compilation=await build({entryPoints:[path.join(root,'packages/contracts/src/motion-library.ts')],bundle:true,write:false,format:'esm',platform:'node'});
const {MOTION_LIBRARY_PRESETS}=await import(`data:text/javascript;base64,${Buffer.from(compilation.outputFiles[0].text).toString('base64')}`);
const recipes=MOTION_LIBRARY_PRESETS.filter(p=>p.collection==='text');
const native=await json('badfx-host-study.json'),composer=await json('composer-host-study.json'),fixture=await json('fixture-report.json'),render=await json('render-summary.json'),lifecycle=await json('ae-lifecycle.json'),undo=await json('ae-undo-verify.json');
if(native.status!=='PASS'||native.entries.length!==48||fixture.status!=='PASS'||render.status!=='PASS'||lifecycle.status!=='PASS'||undo.status!=='PASS')throw Error('Required native evidence incomplete');
const installArg=process.argv.find(arg=>arg.startsWith('--installation='));
const installation=installArg?JSON.parse(await readFile(installArg.slice(15),'utf8')):null;
if(installation&&installation.status!=='PASS')throw Error('Installation evidence did not PASS');
const composerCatalogArg=process.argv.find(arg=>arg.startsWith('--composer-catalog='));
const composerCatalog=composerCatalogArg?JSON.parse(await readFile(composerCatalogArg.slice(19),'utf8')):null;
if(composerCatalog&&(!Array.isArray(composerCatalog.areas)||composerCatalog.uniqueItemIds!==composerCatalog.itemLeaves||!composerCatalog.treeSha256))throw Error('Installed Composer catalog evidence incomplete');
const composerNativeArg=process.argv.find(arg=>arg.startsWith('--composer-native='));
const composerNative=composerNativeArg?JSON.parse(await readFile(composerNativeArg.slice(18),'utf8')):null;
if(composerNative&&(composerNative.status!=='PASS'||composerNative.coveredFamilies!==composerNative.installedFamilyCount||!composerNative.sourceEditable))throw Error('Installed Composer family applications incomplete');
const verificationArg=process.argv.find(arg=>arg.startsWith('--verification='));
const verification=verificationArg?JSON.parse(await readFile(verificationArg.slice(15),'utf8')):null;
if(verification&&(verification.status!=='PASS'||verification.ownRecipes!==recipes.length||!verification.renderProjectionEquivalent))throw Error('Final text verification incomplete');
function flatten(rows){return rows.flatMap(row=>row.children?flatten(row.children):[row]);}
const badfx=native.entries.map(entry=>({name:entry.name,sha256:entry.ffxSha256,status:entry.status,editableText:entry.editableText,threeDLayer:entry.threeDLayer,threeDPerChar:entry.threeDPerChar,grouping:flatten(entry.more).find(p=>p.matchName==='ADBE Text Anchor Point Option')?.value,selectors:flatten(entry.animators).filter(p=>/Range Type2|Range Shape|Levels.*Ease|Percent Offset|Randomize Order/.test(p.matchName)).map(p=>({property:p.matchName,value:p.value,expressionFeatures:p.expression})),animatedControls:flatten(entry.controls||[]).filter(p=>p.keys?.length).map(p=>({name:p.name,property:p.matchName,keys:p.keys})),controls:flatten(entry.controls||[]).filter(p=>!p.path.includes('Built In Params')&&p.value!==undefined).map(p=>({name:p.name,property:p.matchName,value:p.value}))}));
const matrix={schemaVersion:1,observedHost:native.hostVersion,scope:'Original family coverage; not a claim of mathematical equivalence to commercial recipes.',referenceEvidence:{badfx:{version:'1.0.4',count:48,status:native.status,entries:badfx},composer:{version:'4.2.6',visibleItems:['Ease Fade Separately 3','Ease Fade Together 3','Ease Position & Rotate & Scale Y 1','Ease Position & Rotate & Scale Randomly 2'],visibleItemsScope:'Text Presets root selection observed in installed UI; not a recursive package inventory.',observedPreset:composer.name,markers:composer.markers,controls:flatten(composer.controls).filter(p=>!p.path.includes('Built In Params')).map(p=>({name:p.name,property:p.matchName,value:p.value})),nativeFormulaIdentification:'UNRESOLVED',publicCatalog:'https://misterhorse.com/products/text-presets/42',publicCatalogVerified:'2026-10-13',publicCatalogCounts:{characters:626,words:392,lines:253,effects:143,total:1414},opaqueProduct3300Mapping:'UNRESOLVED'}},validation:{realApplications:fixture.entries.filter(e=>e.status==='PASS').length,renderedVariants:render.count,lifecycleCases:lifecycle.cases.length,uiUndo:undo.status,lifecycleHostSha256:lifecycle.hostSha256,liveControlRenders:(lifecycle.liveControls||[]).map(c=>({curve:c.curve,key:c.key,status:c.status,changedPixels:c.changedPixels,beforePixelSha256:c.beforePixelSha256,afterPixelSha256:c.afterPixelSha256})),installation:installation?{status:installation.status,sourceCommit:installation.sourceCommit,files:installation.fileCount,panel:installation.panelVerification,report:installArg.slice(15)}:'NOT RUN'},recipes:recipes.map(p=>({id:p.id,name:p.name,unit:p.text.unit,dimension:p.text.dimension||'2d',family:p.textFamily,variant:p.textVariant.id,mode:p.mode,properties:{position:p.position,rotation:p.rotation,scale:p.scale,fade:p.fade,text:p.text,easing:p.easing,effect:p.effect,waveform:p.waveform},defaults:p.defaults,referenceCoverage:['fade','position','rotate','scale'].includes(p.textFamily)?'BadFX core family observed in host':'Composer public family; original native AE implementation',nativeApplication:fixture.entries.find(e=>e.id===p.id)?.status||'NOT RUN',video:`../../apps/after-effects-cep/assets/text-previews/${p.id}.mp4`,poster:`../../apps/after-effects-cep/assets/text-previews/${p.id}.jpg`}))};
if(composerCatalog){
  matrix.referenceEvidence.composer.installedCatalog=composerCatalog;
  matrix.referenceEvidence.composer.visibleItemsScope='Historical first UI observation; recursive installed inventory recorded separately in installedCatalog.';
  matrix.referenceEvidence.composer.opaqueProduct3300Mapping='Text leaves explicitly identify productId 3300; other containers remain unclassified.';
}
if(composerNative){
  matrix.referenceEvidence.composer.installedFamilyApplications={status:composerNative.status,hostVersion:composerNative.hostVersion,cases:composerNative.cases,representatives:composerNative.uniqueRepresentatives,coveredFamilies:composerNative.coveredFamilies,installedFamilyCount:composerNative.installedFamilyCount,families:composerNative.families,sourceEditable:composerNative.sourceEditable,limits:composerNative.limits,report:composerNativeArg.slice(18)};
}
for(const item of matrix.validation.liveControlRenders){item.expectedIdentical=lifecycle.liveControls.find(c=>c.curve===item.curve)?.expectedIdentical===true;}
if(verification){matrix.validation.finalVerification={report:verificationArg.slice(15),status:verification.status,hostSha256:verification.hostSha256,renderedHostSha256:verification.renderedHostSha256,renderProjectionSha256:verification.renderProjectionSha256,renderProjectionEquivalent:true,projectionScope:verification.projectionScope,uiCases:verification.uiCases,composerComparisonVideos:verification.comparisonVideos,legacyRollback:verification.legacyRollback};}
await writeFile(path.join(root,'docs/implementation/text-presets-v3-coverage.json'),JSON.stringify(matrix,null,2)+'\n');
console.log(`Coverage matrix: ${recipes.length} original recipes, ${badfx.length} observed references, Undo ${undo.status}`);
