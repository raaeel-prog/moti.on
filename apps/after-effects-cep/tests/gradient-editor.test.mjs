import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { createCepDocument } from './cep-dom.mjs';
import { createI18n } from '../../../packages/ui-core/dist/i18n.js';
import { cloneGradientSettings, GRADIENT_PRESETS } from '../../../packages/contracts/dist/index.js';
const built = await build({ entryPoints: [fileURLToPath(new URL('../client/src/gradient-editor.ts', import.meta.url))], bundle: true, platform: 'node', format: 'esm', write: false });
const ui = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);
const response = data => ({ protocolVersion:1, requestId:'gradient-test', ok:true, data, warnings:[], error:null });
const data = (applied = 0, override = {}) => ({ settings:applied ? cloneGradientSettings() : null, selectionToken:'comp1/layer1/time0', selectionCount:1, appliedCount:applied,
  instances:Array.from({length:applied},(_,i)=>({layerId:i+1,layerName:`Layer ${i+1}`,effectIndex:1,settings:cloneGradientSettings(),lockedKeys:[]})), mixedKeys:[], lockedKeys:[], capabilities:{nativeAvailable:true}, ...override });
const tick = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
function fixture(t, initial = data(), locale='pt-BR', overrides={}) {
  const doc=createCepDocument(),calls=[],busy=[],storageData=new Map();
  let current=initial, context={isComposition:true,signature:'context1'};
  const storage={getItem:key=>storageData.get(key)??null,setItem:(key,value)=>storageData.set(key,value)};
  const editor=ui.createGradientEditor(doc,{i18n:createI18n({locale}),storage,context:()=>context,
    read:async()=>response(current),execute:async args=>{calls.push(args); if(args.action==='update') {current={...current, settings:args.settings,instances:current.instances.map(i=>({...i,settings:args.settings}))};} return response({});},
    error:r=>r.error?.message??'error',busy:v=>busy.push(v),back(){},...overrides});
  t.after(()=>editor.dispose());
  const input=id=>editor.element.getElementsByTagName('input').find(v=>v.id===id);
  const button=id=>[...editor.element.getElementsByTagName('button'),...editor.actions.getElementsByTagName('button')].find(v=>v.id===id);
  const select=id=>editor.element.getElementsByTagName('select').find(v=>v.id===id);
  const change=(id,value)=>{const el=input(id);el.value=String(value);el.emit('input');el.emit('change');};
  return {doc,editor,calls,busy,storage,storageData,input,button,select,change,setData:v=>{current=v;},setContext:v=>{context=v;}};
}
test('fixed slots reverse positions without changing native slot color identity',()=>{
 const before=cloneGradientSettings(),after=ui.reversedGradient(before);
 assert.equal(after.stops.length,8); after.stops.forEach((stop,i)=>{assert.deepEqual(stop.color,before.stops[i].color);assert.equal(stop.position,stop.enabled?1-before.stops[i].position:before.stops[i].position);});
 ui.reversedGradient(after).stops.forEach((stop,i)=>assert.ok(Math.abs(stop.position-before.stops[i].position)<1e-12));
});
test('draft validates enabled count and protected controls; rejects stale async reads',()=>{
 const s=ui.createGradientDraft(),r=data(1,{lockedKeys:['angle','stops.0.color']});
 assert.equal(ui.hydrateGradientDraft(s,r,0),true);assert.equal(ui.commitGradientValue(s,'angle',10),false);
 assert.equal(ui.commitGradientValue(s,'stops.0.color',[1,0,0]),false);
 assert.equal(ui.commitGradientValue(s,'stops.0.enabled',false),true);assert.equal(ui.commitGradientValue(s,'stops.1.enabled',false),true);
 assert.equal(ui.commitGradientValue(s,'stops.2.enabled',false),false);assert.equal(ui.commitGradientValue(s,'glow',Number.NaN),false);
 assert.equal(ui.hydrateGradientDraft(s,data(1),0),false);assert.equal(s.settings.stops[0].enabled,false);
 assert.deepEqual([...s.dirty],['stops.0.enabled','stops.1.enabled']);
});
test('read guard rejects malformed host payloads before draft hydration',()=>{
 assert.equal(ui.isGradientReadData(data(1)),true);
 for(const d of [null,{},data(2),data(1,{lockedKeys:['untrusted']}),data(1,{settings:{schemaVersion:2}}),data(1,{instances:[]}),data(1,{capabilities:{nativeAvailable:'yes'}})]) assert.equal(ui.isGradientReadData(d),false);
});
test('eight authored presets, a custom default and five disclosure sections render in both locales', async t=>{
 for(const locale of ['pt-BR','en-US']) {
  const f=fixture(t,data(),locale);await f.editor.refresh();
  const sections=f.editor.element.getElementsByTagName('details').filter(v=>v.id.startsWith('gradient-section-'));
  assert.equal(sections.length,5);assert.equal(sections[0].open,true);assert.ok(sections.slice(1).every(v=>!v.open));
  const options=f.select('gradient-preset').getElementsByTagName('option');
  assert.deepEqual(options.filter(option=>option.value!=='custom').map(option=>option.value),GRADIENT_PRESETS.map(recipe=>recipe.id));
  assert.equal(options.filter(option=>option.value==='custom').length,1);
  assert.equal(f.select('gradient-preset').value,'custom');
  assert.equal(f.editor.element.getElementsByTagName('input').filter(v=>v.type==='checkbox').length,8);
  assert.equal(f.calls.length,0);
 }
});
test('native missing, no composition, no selection and empty removals have visible action gates',async t=>{
 const f=fixture(t,data(0,{capabilities:{nativeAvailable:false}}));await f.editor.refresh();
 assert.equal(f.button('gradient-apply').getAttribute('aria-disabled'),'true');assert.match(f.editor.element.allText,/módulo nativo/);
 f.setData(data(0,{selectionCount:0}));await f.editor.refresh();
 assert.equal(f.button('gradient-apply').getAttribute('aria-disabled'),'true');assert.notEqual(f.button('gradient-background').getAttribute('aria-disabled'),'true');
 f.button('gradient-background').click();await tick();assert.equal(f.calls[0].action,'create-background');assert.equal(f.calls[0].selectionToken,undefined);
 f.setContext({isComposition:false,signature:'none'});await f.editor.refresh();assert.match(f.editor.element.allText,/Abra uma composição/);
});
test('typing and dragging preview locally; one host update is emitted only on commit',async t=>{
 const f=fixture(t,data(1));await f.editor.refresh();
 const angle=f.input('gradient-angle');angle.value='45';angle.emit('input');assert.equal(f.calls.length,0);angle.emit('change');await tick();
 assert.equal(f.calls.length,1);assert.deepEqual(f.calls[0].changedKeys,['angle']);assert.equal(f.calls[0].settings.angle,45);
 const marker=f.editor.element.getElementsByTagName('button').find(v=>v.dataset.slot==='0');
 marker.emit('pointerdown',{pointerId:4,button:0});marker.emit('pointermove',{pointerId:4,clientX:90});assert.equal(f.calls.length,1);
 marker.emit('pointerup',{pointerId:4});await tick();assert.equal(f.calls.length,2);assert.deepEqual(f.calls[1].changedKeys,['stops.0.position']);assert.equal(f.calls[1].settings.stops[0].position,.5);
});
test('stop keyboard controls honor fine/coarse modifiers and cancelled gestures do not mutate',async t=>{
 const f=fixture(t,data());await f.editor.refresh();const marker=f.editor.element.getElementsByTagName('button').find(v=>v.dataset.slot==='0');
 marker.keydown('ArrowRight',{shiftKey:true});assert.equal(f.input('gradient-stop-0-position').value,'10');
 marker.keydown('ArrowRight',{altKey:true});assert.equal(f.input('gradient-stop-0-position').value,'10.1');
 marker.emit('pointerdown',{pointerId:2,button:0});marker.emit('pointermove',{pointerId:2,clientX:150});marker.emit('pointercancel',{pointerId:2});
 assert.equal(f.input('gradient-stop-0-position').value,'10.1');assert.equal(f.calls.length,0);
});
test('mixed selection updates only edited keys; floating HDR colors are preserved unchanged',async t=>{
 const settings=cloneGradientSettings();settings.stops[0].color=[2.5,-.1,.005];
 const f=fixture(t,data(1,{settings,mixedKeys:['angle','stops.0.color'],lockedKeys:['depth']}));await f.editor.refresh();
 assert.equal(f.input('gradient-depth').disabled,true);f.change('gradient-glow',55);await tick();
 assert.equal(f.calls.length,1);assert.deepEqual(f.calls[0].changedKeys,['glow']);assert.deepEqual(f.calls[0].settings.stops[0].color,[2.5,-.1,.005]);
});
test('invalid numeric input survives reads, blocks apply and never sends a host command',async t=>{
 const f=fixture(t,data());await f.editor.refresh();f.change('gradient-duration','abc');
 assert.equal(f.input('gradient-duration').getAttribute('aria-invalid'),'true');await f.editor.refresh();
 assert.equal(f.input('gradient-duration').value,'abc');f.button('gradient-apply').click();await tick();assert.equal(f.calls.length,0);
 f.change('gradient-duration','3,5');assert.equal(f.input('gradient-duration').getAttribute('aria-invalid'),'false');
 f.button('gradient-apply').click();await tick();assert.equal(f.calls.length,1);assert.equal(f.calls[0].settings.duration,3.5);
});
test('editing protects current text and a changed selection cannot receive a stale mutation',async t=>{
 const f=fixture(t,data(1));await f.editor.refresh();const input=f.input('gradient-angle');input.focus();input.value='12,';input.emit('input');
 const external=cloneGradientSettings();external.angle=95;f.setData(data(1,{settings:external}));await f.editor.refresh();assert.equal(input.value,'12,');
 f.setContext({isComposition:true,signature:'context2'});input.value='30';input.emit('change');await tick();assert.equal(f.calls.length,0);
 f.doc.activeElement=null;await f.editor.refresh();assert.equal(f.input('gradient-angle').value,'95');
});
test('overlapping reads are ignored after a user edits or the editor is disposed',async t=>{
 let resolve;const f=fixture(t,data(), 'en-US',{read:()=>new Promise(r=>{resolve=r;})});
 const pending=f.editor.refresh();f.change('gradient-angle',40);const settings=cloneGradientSettings();settings.angle=5;resolve(response(data(1,{settings})));await pending;
 assert.equal(f.input('gradient-angle').value,'40');
 const pending2=f.editor.refresh();f.editor.dispose();resolve(response(data(1)));await pending2;assert.equal(f.calls.length,0);
});
test('personal presets validate storage and report unavailable writes; saved recipes survive reopening',async t=>{
 const f=fixture(t,data());await f.editor.refresh();f.change('gradient-angle',123);
 const name=f.input('gradient-preset-name');name.value='My palette';name.emit('input');f.button('gradient-save-preset').click();
 const stored=ui.readGradientLibrary(f.storage);assert.equal(stored.length,1);assert.equal(stored[0].name,'My palette');assert.equal(stored[0].settings.angle,123);
 assert.equal(ui.writeGradientLibrary(undefined,stored),false);
 assert.deepEqual(ui.readGradientLibrary({getItem:()=>'{broken'}),[]);
 assert.deepEqual(ui.readGradientLibrary({getItem:()=>JSON.stringify([{id:'custom-1',name:'bad',settings:{}}])}),[]);
 assert.equal(GRADIENT_PRESETS.length,8);
});
test('remove targets the captured selection and unrelated action cannot duplicate a running mutation',async t=>{
 let finish;const f=fixture(t,data(1),'pt-BR',{execute:args=>{f.calls.push(args);return new Promise(r=>{finish=r;});}});await f.editor.refresh();
 f.button('gradient-remove').click();f.button('gradient-background').click();assert.equal(f.calls.length,1);assert.deepEqual(f.calls[0],{action:'remove',selectionToken:'comp1/layer1/time0'});
 finish(response({}));await tick();assert.deepEqual(f.busy,[true,false]);
});

test('returning to a focused but committed field reads external Effect Controls changes',async t=>{
 const f=fixture(t,data(1));await f.editor.refresh();const input=f.input('gradient-angle');input.focus();
 const external=cloneGradientSettings();external.angle=72;f.setData(data(1,{settings:external}));await f.editor.refresh();
 assert.equal(f.input('gradient-angle').value,'72');assert.equal(f.doc.activeElement.id,'gradient-angle');
});
test('a preset preserves locked expression fields while applying all editable differences in one update',async t=>{
 const f=fixture(t,data(1,{lockedKeys:['angle','stops.0.color']}));await f.editor.refresh();
 const preset=f.select('gradient-preset');preset.value='ember';preset.emit('change');await tick();
 assert.equal(f.calls.length,1);assert.equal(f.calls[0].action,'update');assert.ok(!f.calls[0].changedKeys.includes('angle'));
 assert.ok(!f.calls[0].changedKeys.includes('stops.0.color'));assert.equal(f.calls[0].settings.angle,0);
 assert.deepEqual(f.calls[0].settings.stops[0].color,cloneGradientSettings().stops[0].color);
});
test('personal preset storage failures are visible and never report success',async t=>{
 const f=fixture(t,data(),'pt-BR',{storage:{getItem:()=>null,setItem:()=>{throw new Error('quota');}}});await f.editor.refresh();
 const initialOptions=f.select('gradient-preset').getElementsByTagName('option').map(option=>option.value);
 const name=f.input('gradient-preset-name');name.value='Test';name.emit('input');f.button('gradient-save-preset').click();
 assert.match(f.editor.element.allText,/Não foi possível salvar/);
 assert.deepEqual(f.select('gradient-preset').getElementsByTagName('option').map(option=>option.value),initialOptions);
 assert.deepEqual(ui.readGradientLibrary(f.storage),[]);
});
