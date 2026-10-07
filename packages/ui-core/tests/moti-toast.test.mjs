import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createToastRegion, registerMotiToast } from '../dist/index.js';
import { createFakeDocument } from './fake-dom.mjs';

function clock() {
  let time=0, id=0;
  const timers=new Map();
  return { api:{now:()=>time,setTimeout(fn,delay){const key=++id;timers.set(key,{fn,at:time+delay});return key;},clearTimeout(key){timers.delete(key);}},
    get size(){return timers.size;},
    tick(amount){const end=time+amount;for(;;){const first=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];if(!first||first[1].at>end)break;time=first[1].at;timers.delete(first[0]);first[1].fn();}time=end;}};
}
const options={id:'notifications',label:'Notificações',dismissLabel:'Fechar'};
const dismiss = handle => handle.element.getElementsByTagName('button').find(n=>n.className==='ch-toast__dismiss');

test('toast package imports with no browser globals or eager registration',()=>{
  const result=spawnSync(process.execPath,['--input-type=module','--eval',`
    import assert from 'node:assert/strict';
    for(const name of ['window','document','HTMLElement','customElements'])delete globalThis[name];
    const api=await import(process.argv[1]);
    assert.equal(typeof api.registerMotiToast,'function');
    assert.equal(typeof api.createToastRegion,'function');
    assert.equal(globalThis.HTMLElement,undefined);
  `,new URL('../dist/index.js',import.meta.url).href],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
});

for(const realm of [undefined,null,{}, {customElements:{}}]) {
  test(`missing capabilities preserve the article fallback (${JSON.stringify(realm)})`,()=>{
    const doc=createFakeDocument();doc.defaultView=realm;
    assert.equal(registerMotiToast(doc),undefined);
    assert.equal(registerMotiToast(doc),undefined);
    const timer=clock(), region=createToastRegion(doc,{...options,scheduler:timer.api});
    const toast=region.push({message:'Salvo',state:'success',stateLabel:'Concluído'});
    assert.equal(toast.element.tagName,'article');
    assert.equal(toast.element.getAttribute('role'),'status');
    assert.equal(toast.element.getAttribute('aria-live'),'polite');
    assert.equal(toast.element.getAttribute('data-state'),'success');
    assert.equal(dismiss(toast).getAttribute('aria-label'),'Fechar');
    region.dispose();assert.equal(timer.size,0);
  });
}

test('invalid presentation is rejected before changing the queue or scheduling a timer',()=>{
  const doc=createFakeDocument(),timer=clock();
  const region=createToastRegion(doc,{...options,scheduler:timer.api});
  const existing=region.push({message:'Existente'});
  for(const bad of [
    {message:''},{message:'X',tone:'rainbow'},
    {message:'X',state:'success'},
    {message:'X',assertive:true},
    {message:'X',actions:[{label:' ',onPress(){}}]},
    {message:'X',actions:[{label:'Ação',onPress:null}]}
  ]) {
    assert.throws(()=>region.push(bad));
    assert.deepEqual(region.items,[existing]);assert.equal(timer.size,1);
  }
  region.dispose();
});

test('queued, closing, cleared and disposed actions cannot execute through saved references',()=>{
  const doc=createFakeDocument(),timer=clock();let calls=0;
  const region=createToastRegion(doc,{...options,maxVisible:1,scheduler:timer.api});
  const push=message=>region.push({message,actions:[{label:'Ajustar',onPress(){calls++;}}]});
  const first=push('A'),queued=push('B');
  queued.actions[0].click();assert.equal(calls,0);
  first.actions[0].click();first.actions[0].click();assert.equal(calls,1);
  timer.tick(140);assert.equal(region.items[0],queued);
  region.clear();queued.actions[0].click();assert.equal(calls,1);
  const last=push('C');region.dispose();last.actions[0].click();
  assert.equal(calls,1);assert.equal(timer.size,0);
});

test('labels change in visible and queued items without replacing actions, details or focus',()=>{
  const doc=createFakeDocument(),timer=clock();
  const region=createToastRegion(doc,{...options,maxVisible:1,scheduler:timer.api});
  const first=region.push({message:'Falha real',detail:'Tente novamente',state:'error',stateLabel:'Erro',recoverable:true,actions:[{label:'Repetir',onPress(){}}]});
  const second=region.push({message:'Outro erro',state:'error',stateLabel:'Erro',recoverable:true});
  const action=first.actions[0],close=dismiss(first);action.focus();
  const text=first.element.getElementsByTagName('div').find(n=>n.className==='ch-toast__message');
  region.updateLabels({label:'Notifications',dismissLabel:'Dismiss',stateLabels:{error:'Error'},queuedLabel:n=>`${n} queued`});
  assert.equal(doc.activeElement,action);assert.equal(first.actions[0],action);assert.equal(dismiss(first),close);
  assert.equal(text.textContent,'Falha real');assert.match(first.element.allText,/Tente novamente/);
  assert.equal(dismiss(second).getAttribute('aria-label'),'Dismiss');
  assert.match(first.element.allText,/Error/);assert.equal(timer.size,0);
  region.dispose();
});

test('invalid translated labels do not partially change existing notifications',()=>{
  const doc=createFakeDocument(),timer=clock();
  const region=createToastRegion(doc,{...options,scheduler:timer.api});
  const toast=region.push({message:'Falha',state:'error',stateLabel:'Erro',recoverable:true});
  for(const next of [{label:'Changed',dismissLabel:''},{label:'Changed',dismissLabel:'Dismiss',stateLabels:{error:''}}]) {
    assert.throws(()=>region.updateLabels(next));
    assert.equal(region.element.getAttribute('aria-label'),'Notificações');
    assert.equal(dismiss(toast).getAttribute('aria-label'),'Fechar');
    assert.match(toast.element.allText,/Erro/);
  }
  region.dispose();
});

afterEach(() => {
  for (const name of ["HTMLElement", "customElements", "document", "window"]) delete globalThis[name];
});
