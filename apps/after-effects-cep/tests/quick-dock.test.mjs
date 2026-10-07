import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { createFakeDocument, createFakeWindow } from '../../../packages/ui-core/tests/fake-dom.mjs';
const built = await build({entryPoints:[fileURLToPath(new URL('../client/src/quick-dock.ts',import.meta.url))],bundle:true,platform:'node',format:'esm',write:false});
const {createQuickDock}=await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);
function fixture(t,pinned=false) {
  t.mock.timers.enable({apis:['setTimeout']});
  const doc=createFakeDocument();
  doc.defaultView=createFakeWindow();
  const create=doc.createElement;
  doc.createElement=tag=>{const node=create(tag);node.style={};node.offsetHeight=0;node.scrollHeight=0;node.getBoundingClientRect=()=>({height:parseFloat(node.style.height)||0});return node;};
  const content=doc.createElement('div');content.offsetHeight=120;content.scrollHeight=120;
  const action=doc.createElement('button');action.id='anchor-first';content.appendChild(action);
  const skipped=doc.createElement('button');skipped.setAttribute('tabindex','-1');content.appendChild(skipped);
  const pins=[];const heights=[];
  const dock=createQuickDock(doc,{content,locale:'pt-BR',pinned,onPinChange:value=>pins.push(value),onHeightChange:height=>heights.push(height)});
  function find(id,node=dock.element){if(node.id===id)return node;for(const child of node.children){const result=find(id,child);if(result)return result;}}
  const toggle=find('quick-dock-toggle');const pin=find('quick-dock-pin');const body=content.parentNode;
  const context=(overrides={})=>({hasComp:true,selectionCount:0,contextKey:'comp:empty',busy:false,...overrides});
  const isOpen=()=>dock.element.getAttribute('data-open')==='true';
  t.after(()=>dock.dispose());
  return {doc,dock,content,action,skipped,toggle,pin,body,pins,heights,context,isOpen};
}
test('automatic dock follows selection and closed controls leave the tab order',t=>{
  const {dock,context,body,action,skipped,isOpen}=fixture(t);
  assert.equal(body.hidden,true);assert.equal(action.getAttribute('tabindex'),'-1');
  dock.update(context({selectionCount:2,contextKey:'comp:a,b'}));
  assert.equal(isOpen(),true);assert.equal(body.style.height,'120px');assert.equal(body.hidden,false);
  assert.equal(action.getAttribute('tabindex'),undefined);assert.equal(skipped.getAttribute('tabindex'),'-1');
  dock.update(context());
  assert.equal(isOpen(),false);assert.equal(body.style.height,'0px');assert.equal(body.getAttribute('aria-hidden'),'true');
  assert.equal(action.getAttribute('tabindex'),'-1');
  t.mock.timers.tick(280);assert.equal(body.hidden,true);
});
test('manual opening remains through polling but resets for a real context change',t=>{
  const {dock,context,toggle,isOpen}=fixture(t);
  dock.update(context());toggle.click();assert.equal(isOpen(),true);
  dock.update(context());assert.equal(isOpen(),true);
  dock.update(context({contextKey:'other-comp:empty'}));assert.equal(isOpen(),false);
});
test('manual collapse with a selection persists until the selected targets change',t=>{
  const {dock,context,toggle,isOpen}=fixture(t);
  dock.update(context({selectionCount:1,contextKey:'comp:a'}));toggle.click();assert.equal(isOpen(),false);
  dock.update(context({selectionCount:1,contextKey:'comp:a'}));assert.equal(isOpen(),false);
  dock.update(context({selectionCount:1,contextKey:'comp:b'}));assert.equal(isOpen(),true);
});
test('pinning persists through the owner callback and overrides empty context',t=>{
  const {dock,context,pin,pins,isOpen}=fixture(t);
  pin.click();assert.deepEqual(pins,[true]);assert.equal(pin.getAttribute('aria-pressed'),'true');
  dock.update(context({hasComp:false,contextKey:'none'}));assert.equal(isOpen(),true);
  pin.click();assert.deepEqual(pins,[true,false]);assert.equal(isOpen(),false);
});
test('busy operation, pointer and keyboard focus delay automatic collapse',t=>{
  const {doc,dock,context,body,action,isOpen}=fixture(t);
  dock.update(context({selectionCount:1,contextKey:'comp:a'}));
  dock.update(context({busy:true}));assert.equal(isOpen(),true);
  body.emit('mouseenter');dock.update(context());assert.equal(isOpen(),true);
  action.focus();body.emit('mouseleave');assert.equal(isOpen(),true);
  doc.activeElement=null;body.emit('focusout');t.mock.timers.tick(0);assert.equal(isOpen(),false);
});
test('opening anchor focuses the existing control and permits actions without selection',t=>{
  const {doc,dock,context,action,isOpen}=fixture(t);
  dock.update(context());dock.expandAndFocus();
  assert.equal(isOpen(),true);assert.equal(doc.activeElement,action);
});
test('reversing a closing transition cancels its delayed hidden state',t=>{
  const {dock,context,body,isOpen}=fixture(t);
  dock.update(context({selectionCount:1,contextKey:'comp:a'}));
  dock.update(context());t.mock.timers.tick(140);
  dock.update(context({selectionCount:1,contextKey:'comp:b'}));t.mock.timers.tick(300);
  assert.equal(isOpen(),true);assert.equal(body.hidden,false);assert.equal(body.style.height,'120px');
});
test('resizing recomputes the existing content height and disposal releases listeners',t=>{
  const {doc,dock,context,content,body}=fixture(t);
  dock.update(context({selectionCount:1,contextKey:'comp:a'}));content.scrollHeight=148;
  doc.defaultView.emit('resize');assert.equal(body.style.height,'148px');
  dock.dispose();assert.equal(doc.defaultView.listenerCount('resize'),0);
});
test('an initially pinned dock remains open before and after first host snapshot',t=>{
  const {dock,context,isOpen}=fixture(t,true);
  assert.equal(isOpen(),true);dock.update(context());assert.equal(isOpen(),true);
});

