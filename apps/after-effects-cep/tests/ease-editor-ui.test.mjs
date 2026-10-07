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
  const editor=createEaseEditor(doc,{i18n:createI18n({locale:'pt-BR'}),curve:{x1:.25,y1:0,x2:.75,y2:1},busy:false,onChange:value=>changes.push(value),onApply(){}});
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
