import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {createCepDocument} from './cep-dom.mjs';
import {createI18n} from '../../../packages/ui-core/dist/i18n.js';
const built=await build({entryPoints:[fileURLToPath(new URL('../client/src/ease-editor.ts',import.meta.url))],bundle:true,platform:'node',format:'esm',write:false});
const {createEaseEditor}=await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);
function fixture(t) {
  const doc=createCepDocument(),changes=[];
  const create=doc.createElement;
  doc.createElement=tag=>{
    const node=create(tag);
    node.setCustomValidity=message=>{node.validationMessage=message;};
    node.querySelector=selector=>node.querySelectorAll(selector)[0]??null;
    return node;
  };
  const editor=createEaseEditor(doc,{i18n:createI18n({locale:'pt-BR'}),draft:{mode:'bezier',direction:'out',view:'value',x1:.25,y1:0,x2:.75,y2:1,points:[],back:{overshoot:.56},elastic:{in:{amp:1,freq:3.3,decay:6.9,start:0},out:{amp:1,freq:3.3,decay:6.9,start:0},inCurve:null,outCurve:null},bounce:{in:{amp:.5,freq:3,decay:1.2,start:0},out:{amp:.5,freq:3,decay:1.2,start:0},inCurve:null,outCurve:null},applyIn:true,applyOut:true,live:false},busy:false,onChange:value=>changes.push(value),onCommit(){},onApply(){},onLiveToggle(){}});
  t.after(()=>editor.dispose());
  const input=key=>editor.element.getElementsByTagName('input').find(node=>node.getAttribute('aria-label')===key.toUpperCase());
  const error=key=>input(key).parentElement.querySelector('.ch-field__error');
  return {doc,editor,input,error,changes};
}
test('committing another coordinate preserves an invalid draft and its correction message',t=>{
  const f=fixture(t),x=f.input('x1'),y=f.input('y1');
  x.value='abc'; x.emit('change');
  assert.equal(x.getAttribute('aria-invalid'),'true');
  const message=f.error('x1').textContent;
  y.value='0,35';y.emit('change');
  assert.equal(x.value,'abc');
  assert.equal(x.getAttribute('aria-invalid'),'true');
  assert.equal(f.error('x1').hidden,false);
  assert.equal(f.error('x1').textContent,message);
  assert.equal(f.changes.at(-1).x1,.25,'invalid draft never enters the curve');
  assert.equal(f.changes.at(-1).y1,.35);
  x.value='0,5'; x.emit('change');
  assert.equal(x.value,'0.5'); assert.equal(x.getAttribute('aria-invalid'),undefined);
  assert.equal(f.error('x1').hidden,true); assert.equal(f.changes.at(-1).x1,.5);
});
test('an unfinished sibling draft survives commit while choosing a preset intentionally replaces all values',t=>{
  const f=fixture(t),x=f.input('x2'),y=f.input('y2');
  x.value='0,';x.emit('input');
  y.value='1.2';y.emit('change');
  assert.equal(x.value,'0,');
  const preset=f.editor.element.getElementsByTagName('button').find(node=>node.className.split(' ').includes('ch-ease-preset'));
  preset.click();
  assert.notEqual(x.value,'0,');
  assert.equal(x.getAttribute('aria-invalid'),undefined);
});
test('compact coordinates remain precisely editable with keyboard and decimal comma',t=>{
 const f=fixture(t),x=f.input('x1');
 x.value='0,25';x.emit('keydown',{key:'ArrowUp',altKey:true,preventDefault(){}});
 assert.equal(f.changes.at(-1).x1,.251);
 x.emit('keydown',{key:'ArrowDown',shiftKey:true,preventDefault(){}});
 assert.equal(f.changes.at(-1).x1,.151);
 x.value='abc';x.emit('change');x.emit('keydown',{key:'Escape'});
 assert.equal(x.value,'0.151');assert.equal(x.getAttribute('aria-invalid'),undefined);
});
test('save and search fields open on demand without changing the selected curve',t=>{
 const f=fixture(t),buttons=f.editor.element.getElementsByTagName('button');
 const saveRow=f.editor.element.querySelectorAll('.ch-ease-save')[0];
 const search=f.editor.element.querySelectorAll('.ch-ease-library-toolbar')[0];
 assert.equal(saveRow.hidden,true);assert.equal(search.hidden,true);
 buttons.find(b=>b.textContent==='Salvar curva').click();assert.equal(saveRow.hidden,false);
 buttons.find(b=>b.textContent==='Buscar').click();assert.equal(search.hidden,false);
 assert.equal(search.getElementsByTagName('input')[0].hidden,false);
 assert.equal(f.changes.length,0);
});

// --- args builder, live flag and mode switching --------------------------------
const argsBuilt=await build({entryPoints:[fileURLToPath(new URL('../client/src/ease-args.ts',import.meta.url))],bundle:true,platform:'node',format:'esm',write:false});
const {DEFAULT_EASE,easeCommandArgs,easeNeedsPair,cloneEaseDraft}=await import(`data:text/javascript;base64,${Buffer.from(argsBuilt.outputFiles[0].text).toString('base64')}`);
const libraryBuilt=await build({entryPoints:[fileURLToPath(new URL('../client/src/ease-library.ts',import.meta.url))],bundle:true,platform:'node',format:'esm',write:false});
const {readEaseLive,writeEaseLive,EASE_LIVE_KEY}=await import(`data:text/javascript;base64,${Buffer.from(libraryBuilt.outputFiles[0].text).toString('base64')}`);

test('easeCommandArgs emits only the keys the host allows, per mode',()=>{
  const base=cloneEaseDraft(DEFAULT_EASE);
  assert.deepEqual(Object.keys(easeCommandArgs(base)).sort(),['applyIn','applyOut','x1','x2','y1','y2']);
  const points={...cloneEaseDraft(DEFAULT_EASE),points:[{x:.5,y:.8,inX:.4,inY:.7,outX:.6,outY:.9}]};
  const pointArgs=easeCommandArgs(points);
  assert.deepEqual(Object.keys(pointArgs).sort(),['applyIn','applyOut','points','x1','x2','y1','y2']);
  assert.equal(pointArgs.points.length,1);assert.equal(pointArgs.points[0].y,.8);
  const back={...cloneEaseDraft(DEFAULT_EASE),mode:'back',direction:'out'};
  assert.deepEqual(easeCommandArgs(back),{x1:.34,y1:1.56,x2:.64,y2:1,applyIn:true,applyOut:true});
  const elastic={...cloneEaseDraft(DEFAULT_EASE),mode:'elastic',direction:'inOut'};
  elastic.elastic.inCurve={x1:.5,y1:-.3,x2:.5,y2:1};
  const bake=easeCommandArgs(elastic);
  assert.deepEqual(Object.keys(bake).sort(),['applyIn','applyOut','bake','x1','x2','y1','y2']);
  assert.deepEqual(Object.keys(bake.bake).sort(),['direction','in','inCurve','mode','out']);
  assert.equal(bake.bake.mode,'elastic');assert.equal(bake.bake.in.freq,3.3);
  const bounceOut={...cloneEaseDraft(DEFAULT_EASE),mode:'bounce',direction:'out'};
  assert.equal(easeCommandArgs(bounceOut).bake.inCurve,undefined,'halves travel only in InOut');
  assert.equal(easeNeedsPair(base),false);assert.equal(easeNeedsPair(points),true);assert.equal(easeNeedsPair(elastic),true);
});

test('cloneEaseDraft never shares nested objects with the defaults',()=>{
  const a=cloneEaseDraft(DEFAULT_EASE);a.elastic.in.amp=3;a.points.push({x:.5,y:.5,inX:.4,inY:.5,outX:.6,outY:.5});
  assert.equal(DEFAULT_EASE.elastic.in.amp,1);assert.equal(DEFAULT_EASE.points.length,0);
});

test('live flag round-trips through protected storage and defaults to off',()=>{
  const data=new Map();const storage={getItem:k=>data.has(k)?data.get(k):null,setItem:(k,v)=>data.set(k,v)};
  assert.equal(readEaseLive(storage),false);assert.equal(readEaseLive(undefined),false);
  assert.equal(writeEaseLive(storage,true),true);assert.equal(readEaseLive(storage),true);assert.equal(data.get(EASE_LIVE_KEY),'1');
  writeEaseLive(storage,false);assert.equal(readEaseLive(storage),false);
});

test('choosing a preset leaves any other mode, clears the points and commits once',t=>{
  const doc=createCepDocument(),commits=[];
  const create=doc.createElement;
  doc.createElement=tag=>{const node=create(tag);node.setCustomValidity=m=>{node.validationMessage=m;};node.querySelector=s=>node.querySelectorAll(s)[0]??null;return node;};
  const draft={...cloneEaseDraft(DEFAULT_EASE),mode:'elastic',points:[{x:.5,y:.5,inX:.4,inY:.5,outX:.6,outY:.5}]};
  const editor=createEaseEditor(doc,{i18n:createI18n({locale:'pt-BR'}),draft,busy:false,onChange(){},onCommit:d=>commits.push(d),onApply(){},onLiveToggle(){}});
  t.after(()=>editor.dispose());
  assert.equal(editor.element.getAttribute('data-ease-mode'),'elastic');
  const preset=editor.element.getElementsByTagName('button').find(node=>node.className.split(' ').includes('ch-ease-preset'));
  preset.click();
  assert.equal(commits.length,1);assert.equal(commits[0].mode,'bezier');assert.deepEqual(commits[0].points,[]);
  assert.equal(editor.element.getAttribute('data-ease-mode'),'bezier');
  const live=editor.element.getElementsByTagName('button').find(node=>node.className.split(' ').includes('ch-ease-live'));
  assert.equal(live.getAttribute('aria-pressed'),'false');
});
