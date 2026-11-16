import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {createCepDocument} from './cep-dom.mjs';
import {createI18n} from '../../../packages/ui-core/dist/i18n.js';
const built=await build({entryPoints:[fileURLToPath(new URL('../client/src/particles-editor.ts',import.meta.url))],bundle:true,platform:'node',format:'esm',write:false});
const ui=await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);
function fixture(t,mode='classic'){
 const doc=createCepDocument(),changes=[],frames=new Map();let id=0;
 doc.defaultView={requestAnimationFrame:fn=>{frames.set(++id,fn);return id;},cancelAnimationFrame:id=>frames.delete(id),matchMedia:()=>({matches:false})};
 const editor=ui.createParticlesEditor(doc,{i18n:createI18n({locale:'pt-BR'}),initial:{mode},onChange:settings=>changes.push(settings)});
 t.after(()=>editor.dispose());const field=id=>editor.element.getElementsByTagName('input').find(input=>input.id===id);
 return {doc,editor,changes,frames,field,mode:()=>editor.element.getElementsByTagName('select').find(select=>select.id==='particles-mode')};
}
test('particle editor opens without mutating and each new mode has an original ready recipe',t=>{
 const f=fixture(t);assert.equal(f.changes.length,0);assert.equal(f.editor.getArgs().birthRate,2);assert.equal(f.mode().getElementsByTagName('option').length,7);
 f.mode().value='bokeh';f.mode().emit('change');assert.equal(f.changes.length,1);assert.equal(f.editor.getArgs().mode,'bokeh');assert.equal(f.editor.getArgs().size,.6);
 const copy=f.editor.getArgs();copy.color[0]=0;assert.notEqual(f.editor.getArgs().color[0],0);
});
test('field reveals all per-stream parameters and numeric commit preserves the remaining streams',t=>{
 const f=fixture(t,'field3d');assert.ok(f.field('particles-stream-3-movement'));const before=f.editor.getArgs();
 f.field('particles-stream-2-size').value='1.8';f.field('particles-stream-2-size').emit('change');
 assert.equal(f.editor.getArgs().streams[2].size,1.8);assert.deepEqual(f.editor.getArgs().streams[1],before.streams[1]);assert.equal(f.changes.length,1);
 f.editor.setArgs({mode:'field3d',opacity:NaN});assert.equal(f.editor.getArgs().opacity,before.opacity);
});
test('preview is deterministic, bounded and reacts to size, motion and per-stream color',t=>{
 const f=fixture(t,'field3d'),args=f.editor.getArgs();const a=ui.sampleParticlePreview(args,2);assert.deepEqual(a,ui.sampleParticlePreview(args,2));assert.ok(a.length<=72);
 args.size*=2;args.streams[0].color=[1,0,0];const b=ui.sampleParticlePreview(args,3);assert.ok(b[0].radius>a[0].radius);assert.equal(b[0].color,'#ff0000');assert.notEqual(b[0].x,a[0].x);
 assert.equal(ui.sampleParticlePreview({...args,birthRate:0},2).length,0);
  assert.notDeepEqual(ui.sampleParticlePreview({...args,seed:42},2),ui.sampleParticlePreview(args,2),'seed must change the visible distribution');
  assert.equal(ui.sampleParticlePreview({...args,streams:args.streams.map(s=>({...s,amount:0}))},2).length,0,'zero streams must have no preview particles');
});

test('styled removal is an explicit draft operation and classic mode stays compatible',t=>{
 const f=fixture(t,'field3d'),operation=f.editor.element.getElementsByTagName('select').find(n=>n.id==='particles-action');
 assert.ok(operation);operation.value='remove';operation.emit('change');assert.equal(f.editor.getArgs().action,'remove');
 f.mode().value='classic';f.mode().emit('change');assert.equal(f.editor.getArgs().action,undefined);
 assert.ok(!f.editor.element.getElementsByTagName('select').find(n=>n.id==='particles-action'));
});
test('preview loops only on explicit Play and cancels when hidden, reduced or disposed',t=>{
 const f=fixture(t,'snow');assert.equal(f.frames.size,0);const button=f.editor.element.getElementsByTagName('button').find(button=>button.getAttribute('aria-pressed')!==null);button.emit('click');assert.equal(f.frames.size,1);
 f.doc.hidden=true;f.doc.emit('visibilitychange');assert.equal(f.frames.size,0);f.doc.hidden=false;f.doc.emit('visibilitychange');assert.equal(f.frames.size,1);
 f.doc.documentElement.setAttribute('data-reduced-motion','true');f.doc.emit('visibilitychange');assert.equal(f.frames.size,0);f.editor.dispose();assert.equal(f.frames.size,0);
});

 test('direction shortcuts and numeric controls affect the same draft and preserve legacy motion until enabled',t=>{
 const f=fixture(t,'rising');assert.equal(f.editor.getArgs().direction,0);assert.ok(f.field('particles-direction'));assert.ok(f.field('particles-spread'));
 const right=f.editor.element.getElementsByTagName('button').find(b=>b.getAttribute('data-direction')==='90');assert.ok(right);right.emit('click');assert.equal(f.editor.getArgs().direction,90);
 f.field('particles-direction').value='225';f.field('particles-direction').emit('change');assert.equal(f.editor.getArgs().direction,225);
 const legacy=fixture(t,'snow');assert.equal(legacy.editor.getArgs().direction,undefined);
 });
 test('directional preview follows cardinal vectors and freezes at zero speed',t=>{
 const f=fixture(t,'rising'),a=f.editor.getArgs();a.spread=0;
 const delta=(b,a)=>((b-a+.5)%1+1)%1-.5;
 for(const [direction,xSign,ySign] of [[0,0,-1],[90,1,0],[180,0,1],[270,-1,0],[45,1,-1]]){
 const s={...a,direction},p=ui.sampleParticlePreview(s,0)[0],q=ui.sampleParticlePreview(s,.1)[0];const dx=delta(q.x,p.x),dy=delta(q.y,p.y);
 if(xSign===0)assert.ok(Math.abs(dx)<1e-9);else assert.equal(Math.sign(dx),xSign);
 if(ySign===0)assert.ok(Math.abs(dy)<1e-9);else assert.equal(Math.sign(dy),ySign);
 }
 assert.deepEqual(ui.sampleParticlePreview({...a,velocity:0},0),ui.sampleParticlePreview({...a,velocity:0},5));
 });
