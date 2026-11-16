import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const built=await build({entryPoints:[fileURLToPath(new URL('../client/src/motion/reflow.ts',import.meta.url))],bundle:true,platform:'node',format:'esm',write:false});
const {attachReflowGlide}=await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);

function setup({reduced=false}={}){
  let observerCallback=null,disconnected=false;
  class FakeObserver{constructor(cb){observerCallback=cb;} observe(){} disconnect(){disconnected=true;}}
  const view={ResizeObserver:FakeObserver};
  const box=()=>({top:0,left:0,right:500,bottom:500,width:500,height:500});
  const node=(x,y)=>{const n={offsetLeft:x,offsetTop:y,animations:[],getBoundingClientRect:()=>({top:n.offsetTop,left:n.offsetLeft,right:n.offsetLeft+100,bottom:n.offsetTop+100}),animate(frames,opts){const a={frames,opts,cancelled:false,cancel(){a.cancelled=true;}};n.animations.push(a);return a;}};return n;};
  const nodes=[node(0,0),node(110,0),node(220,0)];
  const container={ownerDocument:{defaultView:view},getBoundingClientRect:box};
  const env={reduced:()=>reduced,now:()=>0,frame:()=>null,cancelFrame(){},timeout:setTimeout,clearTimeout};
  const stop=attachReflowGlide(env,container,{nodes:()=>nodes,threshold:16});
  const resize=()=>observerCallback([]);
  resize(); // the observer's first call only measures
  return {nodes,resize,stop,isDisconnected:()=>disconnected};
}

test('a card that jumps to another row glides from its old place',()=>{
  const {nodes,resize}=setup();
  nodes[2].offsetLeft=0;nodes[2].offsetTop=110; // wraps to the next row
  resize();
  assert.equal(nodes[2].animations.length,1);
  assert.equal(nodes[2].animations[0].frames[0].transform,'translate(220px, -110px)');
  assert.equal(nodes[0].animations.length,0,'cards that stay put do not animate');
});

test('small continuous shifts while dragging do not animate; a new jump cancels the running glide',()=>{
  const {nodes,resize}=setup();
  nodes[1].offsetLeft=118;resize();
  assert.equal(nodes[1].animations.length,0,'an 8 px shift follows the width without animating');
  nodes[1].offsetLeft=0;nodes[1].offsetTop=110;resize();
  nodes[1].offsetLeft=220;nodes[1].offsetTop=0;resize();
  assert.equal(nodes[1].animations.length,2);assert.equal(nodes[1].animations[0].cancelled,true);
});

test('reduced motion only measures, and stopping disconnects the observer',()=>{
  const {nodes,resize,stop,isDisconnected}=setup({reduced:true});
  nodes[2].offsetLeft=0;nodes[2].offsetTop=110;resize();
  assert.equal(nodes[2].animations.length,0);
  stop();assert.equal(isDisconnected(),true);
});

test('without ResizeObserver the glide is a no-op',()=>{
  const stop=attachReflowGlide({reduced:()=>false},{ownerDocument:{defaultView:{}}},{nodes:()=>[]});
  assert.equal(typeof stop,'function');stop();
});
