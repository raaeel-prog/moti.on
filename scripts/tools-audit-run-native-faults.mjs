/** Sequential allowlisted AE requests; no GUI automation, no arbitrary code in requests. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';import path from 'node:path';import {createHash} from 'node:crypto';import {setTimeout} from 'node:timers/promises';
const root=path.resolve('artifacts/tools-audit'),input=JSON.parse(await readFile('scripts/verify-all-tools-audit-fixtures.json','utf8')),instrumentation=JSON.parse(await readFile(path.join(root,'faults-native/instrumentation.json'),'utf8'));
const sha=data=>createHash('sha256').update(data).digest('hex');
async function json(file){for(let n=0;n<20;n++)try{return JSON.parse(await readFile(file,'utf8'));}catch(error){if(error.code==='ENOENT')return null;if(!(error instanceof SyntaxError)||n===19)throw error;await setTimeout(25);}}
const out=path.join(root,'faults-instrumented-native');await mkdir(out,{recursive:true});
async function phase(tool,phase,failAt){
 if(sha(await readFile(instrumentation.originalPath))!==instrumentation.originalSha256)throw Error('Installed host changed during native validation.');
 const output=path.join(out,tool+'-'+phase+'.json'),cached=await json(output);
 if(cached?.status==='PASS'&&cached.completed&&cached.source?.originalSha256===instrumentation.originalSha256)return cached;
 const current=await json(path.join(root,'runner-status.json'));if(current?.status==='RUNNING')throw Error('AE fixture is busy.');
 const requestId='bulk-'+tool+'-'+phase+'-'+Date.now();
 await writeFile(path.join(root,'faults-request.json'),JSON.stringify({mode:'instrumented',tool,phase,failAt,requestId}));await writeFile(path.join(root,'runner-request.json'),JSON.stringify({nonce:requestId,operation:'faults'}));
 for(let n=0;n<1800;n++){await setTimeout(100);const state=await json(path.join(root,'runner-status.json'));if(state?.nonce!==requestId)continue;if(state.status==='FAIL')throw Error(JSON.stringify(state));if(state.status==='COMPLETED'){const result=await json(output);if(result?.requestId!==requestId)throw Error('Stale native receipt: '+tool);if(result.cleanupError||result.remainingProjectItems!==0)throw Error('Native cleanup incomplete: '+tool);return result;}}
 throw Error('Native request timeout: '+requestId);
}
const selected=process.argv.slice(2),tools=[...input.tools.filter(tool=>tool.mutates).map(tool=>tool.id),...input.quickActions.filter(tool=>tool.id!=='save-frame').map(tool=>'quick.'+tool.id)].filter(id=>!selected.length||selected.includes(id));
const report={started:new Date().toISOString(),sourceSha256:instrumentation.originalSha256,status:'RUNNING',completed:false,tools:[]};
for(const tool of tools){
 await writeFile(path.join(out,'progress.json'),JSON.stringify({...report,current:tool},null,2));
 const probe=await phase(tool,'probe');let fault=null;
 if(probe.status==='PASS'&&probe.nativeCalls>0)fault=await phase(tool,'fault',probe.nativeCalls<2?1:Math.max(2,Math.floor(probe.nativeCalls/2)));
 const row={tool,probe:probe.status,mutationCalls:probe.nativeCalls??null,fault:fault?.status??'NOT RUN',partialMutation:fault?.injection?.partialMutation??null,differences:fault?.comparison?.differences??null,error:probe.tests?.find(test=>test.status==='FAIL')?.error??fault?.tests?.find(test=>test.status==='FAIL')?.error??null};report.tools.push(row);console.log(JSON.stringify(row));
}
report.completed=true;report.status=report.tools.every(tool=>tool.probe==='PASS'&&tool.fault==='PASS')?'PASS':'FAIL';report.finished=new Date().toISOString();await writeFile(path.join(out,'summary.json'),JSON.stringify(report,null,2));await writeFile(path.join(out,'progress.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,tools:report.tools.length,pass:report.tools.filter(tool=>tool.fault==='PASS').length}));
