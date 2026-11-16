import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const built=await build({entryPoints:[fileURLToPath(new URL('../client/src/motion/index.ts',import.meta.url))],bundle:true,platform:'node',format:'esm',write:false});
const {rangeProgress,attachReflowGlideTree}=await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);

test('slider progress maps the value into 0–100 % and survives bad ranges',()=>{
  assert.equal(rangeProgress({min:'140',max:'320',value:'200'}).toFixed(2),'33.33');
  assert.equal(rangeProgress({min:'0',max:'10',value:'15'}),100);
  assert.equal(rangeProgress({min:'0',max:'10',value:'-3'}),0);
  assert.equal(rangeProgress({min:'5',max:'5',value:'5'}),0,'empty range does not divide by zero');
  assert.equal(rangeProgress({min:'',max:'',value:'50'}),50,'defaults to 0–100 like the browser');
});

test('the tree glide attaches containers as views render and releases the ones removed',()=>{
  let mutate=null;const observed=[];const disconnected=[];
  class RO{constructor(){this.id=observed.length;} observe(t){observed.push(t);} disconnect(){disconnected.push(this.id);}}
  class MO{constructor(cb){mutate=cb;} observe(){} disconnect(){}}
  const view={ResizeObserver:RO,MutationObserver:MO};
  const make=()=>({ownerDocument:{defaultView:view},isConnected:true,children:[],offsetLeft:0,offsetTop:0,getBoundingClientRect:()=>({top:0,left:0,right:10,bottom:10})});
  const a=make(),b=make();let present=[a];
  const root={ownerDocument:{defaultView:view},querySelectorAll:()=>present};
  const env={reduced:()=>false,frame:()=>null,cancelFrame(){}};
  const stop=attachReflowGlideTree(env,root,['.ch-tool-grid']);
  assert.deepEqual(observed,[a]);
  present=[a,b];mutate();assert.deepEqual(observed,[a,b],'a new view container is picked up');
  a.isConnected=false;present=[b];mutate();assert.deepEqual(disconnected,[0],'a removed container stops observing');
  stop();assert.deepEqual(disconnected.sort(),[0,1]);
});
