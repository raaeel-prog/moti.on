// QA request transport only. Native keystrokes remain in the Computer Use runtime.
import {readFile,writeFile} from 'node:fs/promises';import {setTimeout} from 'node:timers/promises';
const root=new URL('../artifacts/tools-audit/',import.meta.url);
async function readJson(path){
 for(let attempt=0;attempt<20;attempt++){
  try{return JSON.parse(await readFile(path,'utf8'));}
  catch(error){if(!(error instanceof SyntaxError) || attempt===19)throw error;await setTimeout(25);}
 }
}
export async function nativePhase(tool,phase,observe){
 const status=await readJson(new URL('runner-status.json',root));if(status.status==='RUNNING')throw Error('Native fixture is busy.');
 const nonce=`ui-${tool}-${phase}-${Date.now()}`;await writeFile(new URL('undo-request.json',root),JSON.stringify({tool,phase,observe}));await writeFile(new URL('runner-request.json',root),JSON.stringify({nonce,operation:'all'}));
 for(let attempt=0;attempt<300;attempt++){await setTimeout(100);const state=await readJson(new URL('runner-status.json',root));if(state.nonce===nonce && ['COMPLETED','FAIL'].includes(state.status)){if(state.status==='FAIL')throw Error(JSON.stringify(state));return readJson(new URL(`undo-native/${tool}-result.json`,root));}}
 throw Error(`Native phase timed out: ${tool}/${phase}`);
}
