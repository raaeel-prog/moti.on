import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const bundled=await build({entryPoints:['apps/after-effects-cep/client/src/native-gesture.ts'],bundle:true,write:false,format:'esm',platform:'node'});
const {createNativeGestures,cepGestureFiles}=await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function fixture(delay=0){
  let reply,opened=false,value=100;const writes=[],states=[];
  const files={read(name){return name==='handshake.json'?JSON.stringify({version:1,token:'12345678-1234-1234-1234-123456789abc',hostProof:true,capabilities:['phase-number']}):reply;},write(raw){const d=JSON.parse(raw);writes.push(d);setTimeout(()=>{
    if(d.operation==='begin')opened=true;
    if(d.operation==='update'||d.operation==='commit')value=d.value;
    if(d.operation==='cancel')value=100;
    if(d.operation==='cancel'||d.operation==='commit')opened=false;
    reply=JSON.stringify({version:1,sequence:d.sequence,session:d.session,gesture:d.gesture,error:0,open:opened,canceled:d.operation==='cancel',value});
  },delay);}};
  const client=createNativeGestures(files,(...state)=>states.push(state));
  const target={compId:1,layerId:2,instance:'123-2-1',fingerprint:'test'};
  const phase={phase:'in',instance:'123-2-1-1',controls:[{key:'intensity',name:'Moti.on 123-2-1-1 · Intensidade (%)'}]};
  return {client,target,phase,writes,states,get value(){return value;}};
}
test('latest-only numeric gestures cap updates at ten per second and flush the exact release value',async()=>{
  const f=fixture(45);f.client.start(f.target,f.phase,'intensity',100);
  for(let i=0;i<20;i++){f.client.update(110+i);await wait(10);}
  await f.client.finish(false,147.3);
  assert.equal(f.writes[0].operation,'begin');assert.equal(f.writes.at(-1).operation,'commit');assert.equal(f.value,147.3);
  assert.ok(f.writes.filter(d=>d.operation==='update').length<=2);assert.deepEqual(f.states,[[true],[false]]);
  assert.ok(f.writes.every((d,i)=>i===0||d.sequence>f.writes[i-1].sequence));
});
test('cancel before begin acknowledgement restores the initial value without a late commit',async()=>{
  const f=fixture(70);f.client.start(f.target,f.phase,'intensity',100);f.client.update(55);await f.client.finish(true,55);
  assert.deepEqual(f.writes.map(d=>d.operation),['begin','cancel']);assert.equal(f.value,100);assert.deepEqual(f.states,[[true],[false]]);
});
test('unproven or missing native capability does not offer a draft-only drag fallback',()=>{
  const states=[];const client=createNativeGestures({read(){return JSON.stringify({version:1,token:'12345678-1234-1234-1234-123456789abc',hostProof:false,capabilities:['phase-number']});},write(){throw Error('must not send');}},state=>states.push(state));
  assert.equal(client.available(),false);assert.deepEqual(states,[]);client.dispose();
});
test('CEP gesture files resolve the installed extension when USER_DATA points outside the home folder',()=>{
  const originalCS=globalThis.CSInterface,originalPaths=globalThis.SystemPath;
  globalThis.SystemPath={EXTENSION:'extension',USER_DATA:'userData'};
  globalThis.CSInterface=class {getSystemPath(kind){return kind==='extension'?'/Users/rael/Library/Application Support/Adobe/CEP/extensions/com.motion.plugin.ae':'/Library/Application Support';}};
  const paths=[];
  try{
    const files=cepGestureFiles({cep:{fs:{readFile(path){paths.push(path);return {err:0,data:'ok'};},writeFile(path){paths.push(path);return {err:0};},rename(a,b){paths.push(a,b);return {err:0};},deleteFile(){return {err:0};}}}});
    assert.equal(files.read('handshake.json'),'ok');files.write('{}');
    assert.deepEqual(paths,[
      '/Users/rael/Library/Caches/Moti.on/Gestures/handshake.json',
      '/Users/rael/Library/Caches/Moti.on/Gestures/request.tmp',
      '/Users/rael/Library/Caches/Moti.on/Gestures/request.tmp',
      '/Users/rael/Library/Caches/Moti.on/Gestures/request.json'
    ]);
  }finally{globalThis.CSInterface=originalCS;globalThis.SystemPath=originalPaths;}
});
test('CEP gesture files replace an already-published request before the next drag',()=>{
  const originalCS=globalThis.CSInterface,originalPaths=globalThis.SystemPath;
  globalThis.SystemPath={EXTENSION:'extension',USER_DATA:'userData'};
  globalThis.CSInterface=class {getSystemPath(kind){return kind==='extension'?'/Users/rael/Library/Application Support/Adobe/CEP/extensions/com.motion.plugin.ae':'/Library/Application Support';}};
  const root='/Users/rael/Library/Caches/Moti.on/Gestures';
  const filesOnDisk=new Map([[`${root}/request.json`,'old']]);
  const seen=[];
  try{
    const files=cepGestureFiles({cep:{fs:{
      readFile(path){return filesOnDisk.has(path)?{err:0,data:filesOnDisk.get(path)}:{err:3,data:''};},
      writeFile(path,data){filesOnDisk.set(path,data);return {err:0};},
      rename(from,to){if(filesOnDisk.has(to))return {err:10};const data=filesOnDisk.get(from);if(data===undefined)return {err:3};filesOnDisk.delete(from);filesOnDisk.set(to,data);seen.push(data);return {err:0};},
      deleteFile(path){if(!filesOnDisk.has(path))return {err:3};filesOnDisk.delete(path);return {err:0};}
    }}});
    files.write('first');files.write('second');
    assert.deepEqual(seen,['first','second']);
    assert.equal(filesOnDisk.get(`${root}/request.json`),'second');
    assert.equal(filesOnDisk.has(`${root}/request.tmp`),false);
  }finally{globalThis.CSInterface=originalCS;globalThis.SystemPath=originalPaths;}
});

