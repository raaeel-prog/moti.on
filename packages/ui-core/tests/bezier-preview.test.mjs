import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {createFakeDocument} from './fake-dom.mjs';
const result=await build({entryPoints:[fileURLToPath(new URL('../src/bezier.ts',import.meta.url))],bundle:true,platform:'node',format:'esm',write:false});
const {bezierEditor}=await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);

function fixture(t,{preview=true,raf=true}={}) {
  t.mock.timers.enable({apis:['setTimeout']});
  const doc=createFakeDocument();doc.documentElement=doc.createElement('html');
  const frames=new Map();let sequence=0;let systemReduced=false;
  doc.defaultView={matchMedia:()=>({matches:systemReduced}),cancelAnimationFrame:id=>frames.delete(id)};
  if(raf)doc.defaultView.requestAnimationFrame=callback=>{const id=++sequence;frames.set(id,callback);return id;};
  let play,cancel,dispose,setCurve;const changed=[];const progress=[];
  const node=bezierEditor(doc,{x1:.25,y1:.1,x2:.25,y2:1,label:'Curva',outHandleLabel:'Saída',inHandleLabel:'Entrada',
    ...(preview?{preview:{progress:time=>{progress.push(time);return time;},label:'Demonstração',durationMs:400}}:{}),
    onChange:(...values)=>changed.push(values),onPreviewReady:(start,stop)=>{play=start;cancel=stop;},onDisposeReady:cleanup=>{dispose=cleanup;},onReady:update=>{setCurve=update;}});
  const svg=node.getElementsByTagName('svg')[0];svg.getBoundingClientRect=()=>({left:0,top:0,width:328,height:192});
  const handles=node.getElementsByTagName('circle').filter(n=>n.getAttribute('role')==='slider');
  const dot=node.getElementsByTagName('circle').find(n=>n.getAttribute('class')==='ch-bezier__preview-dot');
  function frame(now){const pending=[...frames.values()];frames.clear();for(const callback of pending)callback(now);}
  t.after(()=>dispose());
  return {doc,node,svg,handles,dot,play,cancel,dispose,setCurve,changed,progress,frames,frame,setSystemReduced:value=>{systemReduced=value;}};
}
test('optional preview preserves the two accessible draggable curve handles',t=>{
  const {node,handles,dot}=fixture(t);
  assert.equal(handles.length,2);assert.equal(node.getElementsByTagName('circle').length,3);
  assert.equal(dot.getAttribute('aria-hidden'),'true');
  assert.deepEqual(handles.map(handle=>handle.getAttribute('tabindex')),['0','0']);
});
test('the editor without a preview still has exactly two handles and no playback',t=>{
  const {node,play,frames}=fixture(t,{preview:false});play();
  assert.equal(node.getElementsByTagName('circle').length,2);assert.equal(frames.size,0);
});
test('playback advances locally and finishes without sending curve changes',t=>{
  const {node,play,frame,frames,dot,changed}=fixture(t);
  play();assert.equal(node.getAttribute('data-preview'),'playing');assert.equal(dot.getAttribute('cx'),'24');
  frame(100);frame(300);assert.equal(dot.getAttribute('cx'),'164');
  frame(500);assert.equal(dot.getAttribute('cx'),'304');assert.equal(frames.size,0);
  t.mock.timers.tick(140);assert.equal(node.getAttribute('data-preview'),undefined);assert.deepEqual(changed,[]);
});
test('an explicit cancel and a new pointer gesture cancel pending playback',t=>{
  const {node,play,cancel,frames,handles,setCurve}=fixture(t);
  play();cancel();assert.equal(frames.size,0);assert.equal(node.getAttribute('data-preview'),undefined);
  setCurve(.2,.2,.8,.9);t.mock.timers.tick(200);
  handles[0].emit('pointerdown',{button:0,pointerId:4});
  t.mock.timers.tick(500);assert.equal(frames.size,0);assert.equal(node.getAttribute('data-dragging'),'true');
  handles[0].emit('pointerup',{button:0,pointerId:4});
  t.mock.timers.tick(349);assert.equal(frames.size,0);
  t.mock.timers.tick(1);assert.equal(frames.size,1);
});
test('a new keyboard adjustment interrupts playback and coalesces a new demonstration',t=>{
  const {node,play,frames,handles,changed}=fixture(t);
  play();handles[0].keydown('ArrowRight');
  assert.equal(node.getAttribute('data-preview'),undefined);assert.equal(frames.size,0);assert.equal(changed.length,1);
  t.mock.timers.tick(200);handles[0].keydown('ArrowRight');t.mock.timers.tick(349);assert.equal(frames.size,0);
  t.mock.timers.tick(1);assert.equal(frames.size,1);
});
test('internal and system reduced motion independently suppress playback but preserve editing',t=>{
  const {doc,node,play,frames,handles,changed,setSystemReduced}=fixture(t);
  doc.documentElement.setAttribute('data-reduced-motion','true');play();handles[0].keydown('ArrowUp');
  t.mock.timers.tick(500);assert.equal(frames.size,0);assert.equal(changed.length,1);
  doc.documentElement.setAttribute('data-reduced-motion','false');setSystemReduced(true);play();assert.equal(frames.size,0);
  setSystemReduced(false);play();assert.equal(node.getAttribute('data-preview'),'playing');
});
test('playback stops when the panel becomes hidden or reduced motion changes',t=>{
  const {doc,node,play,frame,frames,setSystemReduced}=fixture(t);
  play();doc.hidden=true;frame(0);assert.equal(frames.size,0);assert.equal(node.getAttribute('data-preview'),undefined);
  doc.hidden=false;play();setSystemReduced(true);frame(0);assert.equal(frames.size,0);assert.equal(node.getAttribute('data-preview'),undefined);
});
test('disposing cancels scheduled and active frames and cannot restart the preview',t=>{
  const {node,play,dispose,setCurve,frames}=fixture(t);
  play();assert.equal(frames.size,1);dispose();assert.equal(frames.size,0);assert.equal(node.getAttribute('data-preview'),undefined);
  setCurve(.2,.2,.8,.8);play();t.mock.timers.tick(500);assert.equal(frames.size,0);
});
test('a runtime without animation frames retains editing with no preview exception',t=>{
  const {play,handles,changed,frames}=fixture(t,{raf:false});play();handles[1].keydown('ArrowLeft');
  t.mock.timers.tick(500);assert.equal(changed.length,1);assert.equal(frames.size,0);
});

afterEach(() => {
  for (const name of ["HTMLElement", "customElements", "document", "window"]) delete globalThis[name];
});
