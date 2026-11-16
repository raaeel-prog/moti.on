import {readFile,writeFile,unlink} from 'node:fs/promises';
import {setTimeout} from 'node:timers/promises';
const [tool,phase,observe]=process.argv.slice(2);
const catalog=JSON.parse(await readFile('scripts/verify-all-tools-audit-fixtures.json','utf8'));
const toolIds=[...catalog.tools.map(t=>t.id),...catalog.quickActions.map(t=>'quick.'+t.id)];
if(!toolIds.includes(tool) || !['prepare','apply','capture','inspect','persist','cleanup','release'].includes(phase))throw Error('Unknown Undo fixture request.');
const root='artifacts/tools-audit/',status=JSON.parse(await readFile(root+'runner-status.json','utf8'));
if(status.status==='RUNNING')throw Error('A native fixture is still running.');
if(phase==='release'){await unlink(root+'undo-request.json');console.log('Undo request released.');}
else{await writeFile(root+'undo-request.json',JSON.stringify({tool,phase,observe}));const nonce=`undo-${tool}-${phase}-${Date.now()}`;await writeFile(root+'runner-request.json',JSON.stringify({nonce,operation:'all'}));let completed=false;for(let attempt=0;attempt<200;attempt++){await setTimeout(150);const current=JSON.parse(await readFile(root+'runner-status.json','utf8'));if(current.nonce===nonce && ['COMPLETED','FAIL'].includes(current.status)){if(current.status==='FAIL')throw Error(JSON.stringify(current));console.log(nonce+' COMPLETED');completed=true;break;}}if(!completed)throw Error('Native Undo phase timed out: '+nonce);}
