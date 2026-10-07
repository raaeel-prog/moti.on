import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { createCepDocument } from './cep-dom.mjs';
import { createFakeWindow } from '../../../packages/ui-core/tests/fake-dom.mjs';

const built=await build({stdin:{contents:'export { createPresetGallery } from "./client/src/preset-gallery.ts"; export { focusedPoll } from "./client/src/focused-poll.ts";',resolveDir:fileURLToPath(new URL('..',import.meta.url))},bundle:true,platform:'node',format:'esm',write:false});
const {createPresetGallery,focusedPoll}=await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);

function fixture(t,{autoplay=true,focused=true,intersection=true,scroll=0,navigation,revealId,recent=[],onApply,personal}={}){
  const names=['window','requestAnimationFrame','cancelAnimationFrame','IntersectionObserver','setInterval','clearInterval'];
  const saved=Object.fromEntries(names.map(n=>[n,globalThis[n]]));
  const frames=new Map(),timers=new Map(),observers=[];let sequence=0;
  globalThis.window=createFakeWindow();
  globalThis.window.setTimeout=setTimeout;
  globalThis.requestAnimationFrame=fn=>{frames.set(++sequence,fn);return sequence;};
  globalThis.cancelAnimationFrame=id=>frames.delete(id);
  globalThis.setInterval=fn=>{timers.set(++sequence,fn);return sequence;};
  globalThis.clearInterval=id=>timers.delete(id);
  globalThis.IntersectionObserver=intersection?class {
    constructor(callback){this.callback=callback;this.nodes=[];observers.push(this);}
    observe(node){this.nodes.push(node);}
    disconnect(){this.nodes=[];}
  }:undefined;
  const doc=createCepDocument();doc.hasFocus=()=>focused;
  const prefs={favorites:[],recent:[...recent],folderColors:{},collapsedFolders:[],presetAutoplay:autoplay,presetSize:200};
  navigation??={query:'',category:'all',scope:'all',scroll};
  const galleries=[];
  function mount(nextRevealId){
    const gallery=createPresetGallery(doc,{locale:'pt-BR',busy:false,navigation,revealId:nextRevealId,personal,preferences:{snapshot:()=>prefs,setPresetAutoplay:value=>{prefs.presetAutoplay=value;}},apply(preset){onApply?.(preset,prefs);},edit(){}});
    doc.documentElement.appendChild(gallery.element);galleries.push(gallery);
    return {gallery,grid:gallery.element.querySelectorAll('.ch-preset-grid')[0]};
  }
  const {gallery,grid}=mount(revealId);
  const views=gallery.element.querySelectorAll('.ch-preset-preview'),svgs=views.map(n=>n.children[0]);
  const io=observers[0],win=globalThis.window;
  t.after(()=>{for(const gallery of galleries)gallery.dispose();for(const n of names)if(saved[n]===undefined)delete globalThis[n];else globalThis[n]=saved[n];});
  return {doc,win,gallery,grid,frames,timers,views,svgs,io,prefs,navigation,mount,
    focus(value){focused=value;win.emit(value?'focus':'blur');},
    visible(indices,on=true){io.callback(indices.map(i=>({target:views[i],isIntersecting:on})));},
    tick(time){const callbacks=[...frames.values()];frames.clear();callbacks.forEach(fn=>fn(time));},
    snapshots(){return svgs.map(s=>s.firstChild);}};
}

test('full catalogue allocates artwork only for visible cards and animates one at 15 fps',t=>{
  const f=fixture(t);assert.equal(f.views.length,214);assert.ok(f.svgs.every(s=>s.children.length===0));
  f.visible([0,1,2,3,4,5]);assert.equal(f.svgs.filter(s=>s.children.length).length,6);assert.equal(f.frames.size,1);
  let before=f.snapshots();f.tick(1000);
  assert.equal(f.snapshots().filter((n,i)=>n!==before[i]).length,1);
  before=f.snapshots();f.tick(1030);assert.deepEqual(f.snapshots(),before);
  f.tick(1068);assert.equal(f.snapshots().filter((n,i)=>n!==before[i]).length,1);
});
test('native focus loss immediately cancels animation, including an already dequeued callback',t=>{
  const f=fixture(t);f.visible([0,1]);const late=[...f.frames.values()][0];
  f.focus(false);assert.equal(f.frames.size,0);const before=f.snapshots();late(1000);assert.deepEqual(f.snapshots(),before);assert.equal(f.frames.size,0);
  f.focus(true);assert.equal(f.frames.size,0,'returning to Adobe outside the panel stays idle');
  f.gallery.element.emit('mouseenter');assert.equal(f.frames.size,1);
  f.gallery.element.emit('mouseleave');assert.equal(f.frames.size,0);
});
test('hidden panels remain idle and offscreen previews release their SVG/filter trees',t=>{
  const f=fixture(t);f.visible([0,1]);f.views[1].emit('mouseenter');
  f.visible([0,1],false);assert.equal(f.frames.size,0);assert.ok(f.svgs.every(s=>s.children.length===0));
  f.doc.hidden=true;f.doc.emit('visibilitychange');f.visible([2]);assert.equal(f.frames.size,0);
  f.doc.hidden=false;f.gallery.element.emit('mouseenter');assert.equal(f.frames.size,1);
});
test('Autoplay off remains idle until explicit hover and never animates a hidden selected card',t=>{
  const f=fixture(t,{autoplay:false});f.visible([0,1]);assert.equal(f.frames.size,0);
  f.views[1].emit('mouseenter');assert.equal(f.frames.size,1);
  f.views[1].emit('mouseleave');assert.equal(f.frames.size,0);
  f.views[0].click();f.visible([0],false);assert.equal(f.frames.size,0);
});
test('reduced motion, disposal and late observer deliveries cannot restart rendering',t=>{
  const f=fixture(t);f.doc.documentElement.setAttribute('data-reduced-motion','true');f.visible([0,1]);assert.equal(f.frames.size,0);
  f.gallery.dispose();assert.ok(f.svgs.every(s=>s.children.length===0));
  assert.equal(f.win.listenerCount('focus'),0);assert.equal(f.win.listenerCount('blur'),0);assert.equal(f.win.listenerCount('resize'),0);
  f.visible([0,1]);assert.ok(f.svgs.every(s=>s.children.length===0));assert.equal(f.frames.size,0);
});
test('nonzero scroll restoration waits for layout and then settles without preview work',t=>{
  const f=fixture(t,{scroll:120});assert.equal(f.grid.scrollTop,0);assert.equal(f.frames.size,1);
  f.grid.emit('scroll');assert.equal(f.navigation.scroll,120,'a pre-layout reset cannot replace the saved offset');
  f.tick(0);assert.equal(f.grid.scrollTop,0);assert.equal(f.frames.size,1);
  f.tick(16);assert.equal(f.grid.scrollTop,120);assert.equal(f.frames.size,0);
});

test('a quick second remount preserves pending position and cannot be overwritten by old restoration callbacks',t=>{
  const f=fixture(t,{scroll:620});
  const oldFirst=[...f.frames.values()][0];
  f.tick(0);
  const oldSecond=[...f.frames.values()][0];
  f.gallery.dispose();
  assert.equal(f.navigation.scroll,620);
  const next=f.mount();
  next.grid.emit('scroll');assert.equal(f.navigation.scroll,620);
  oldFirst(0);oldSecond(16);f.grid.scrollTop=0;f.grid.emit('scroll');f.gallery.dispose();
  assert.equal(f.frames.size,1);assert.equal(f.navigation.scroll,620);
  f.tick(32);f.tick(48);
  assert.equal(next.grid.scrollTop,620);assert.equal(f.navigation.scroll,620);assert.equal(f.frames.size,0);
});

test('a real user offset before restoration takes precedence over the stored destination',t=>{
  const f=fixture(t,{scroll:120});
  f.grid.scrollTop=260;f.grid.emit('scroll');
  f.tick(0);f.tick(16);
  assert.equal(f.grid.scrollTop,260);assert.equal(f.navigation.scroll,260);
  f.grid.scrollTop=0;f.grid.emit('scroll');
  assert.equal(f.navigation.scroll,0,'normal scrolling back to the top still updates navigation after restoration');
});

test('personal library remounts restore their saved position through the same layout lifecycle',t=>{
  const navigation={query:'',category:'personal',scope:'all',scroll:320};
  const f=fixture(t,{navigation});
  f.grid.emit('scroll');assert.equal(navigation.scroll,320);
  f.tick(0);f.tick(16);
  assert.equal(f.grid.scrollTop,320);assert.equal(navigation.scroll,320);
});

test('returning to the same visible preset keeps the exact position even when its card is outside the viewport',t=>{
  const id='builtin.motion.premium-arc-arrival';
  const navigation={query:'arco',category:'motion',scope:'all',scroll:620,selectedId:id};
  const f=fixture(t,{navigation,revealId:id});
  const card=f.gallery.element.querySelectorAll('.ch-preset-card').find(node=>node.id===id);
  card.getBoundingClientRect=()=>({top:-300,bottom:-100,height:200});
  f.tick(0);f.tick(16);
  assert.equal(f.grid.scrollTop,620);assert.equal(navigation.scroll,620);
  assert.equal(navigation.query,'arco');assert.equal(navigation.category,'motion');assert.equal(navigation.scope,'all');
});

test('applying from Recent keeps its displayed order and offset on return, then refreshes when the filter is reentered',t=>{
  const recent=['builtin.motion.premium-arc-arrival','builtin.ease.balanced','builtin.camera.pushIn'];
  const navigation={query:'',category:'all',scope:'recent',scroll:0};
  const f=fixture(t,{navigation,recent,onApply(preset,prefs){prefs.recent=[preset.id,...prefs.recent.filter(id=>id!==preset.id)];}});
  const cards=gallery=>gallery.element.querySelectorAll('.ch-preset-card');
  const target=cards(f.gallery)[2];
  f.grid.scrollTop=520;target.querySelectorAll('.ch-preset-preview')[0].emit('dblclick');
  assert.equal(navigation.selectedId,recent[2]);assert.equal(navigation.scroll,520);
  assert.deepEqual(f.prefs.recent,[recent[2],recent[0],recent[1]],'persistent usage records the newly applied preset first');
  assert.deepEqual(navigation.recentOrder,recent,'navigation owns a separate snapshot of the displayed order');
  f.gallery.dispose();
  const next=f.mount(recent[2]);
  assert.deepEqual(cards(next.gallery).map(card=>card.id),recent);
  next.grid.emit('scroll');f.tick(0);f.tick(16);
  assert.equal(next.grid.scrollTop,520);assert.equal(navigation.scroll,520);
  assert.equal(cards(next.gallery)[2].getAttribute('data-selected'),'true');
  const filter=next.gallery.element.getElementsByTagName('button').find(node=>node.dataset.scope==='recent');
  filter.click();assert.equal(navigation.scope,'all');assert.equal(navigation.recentOrder,undefined);
  filter.click();assert.equal(navigation.scope,'recent');
  assert.deepEqual(cards(next.gallery).map(card=>card.id),f.prefs.recent,'explicitly entering Recent shows its current recency order');
  assert.deepEqual(navigation.recentOrder,f.prefs.recent);
});

test('a different hidden return target clears only blocking filters and becomes visible after layout',t=>{
  const id='builtin.motion.premium-arc-arrival';
  const navigation={query:'does-not-exist',category:'ease',scope:'favorites',scroll:120,selectedId:'builtin.ease.balanced'};
  const f=fixture(t,{navigation,revealId:id});
  const card=f.gallery.element.querySelectorAll('.ch-preset-card').find(node=>node.id===id);
  assert.ok(card);assert.equal(card.getAttribute('data-selected'),'true');
  f.grid.getBoundingClientRect=()=>({top:100,bottom:500,height:400});
  card.getBoundingClientRect=()=>({top:600,bottom:800,height:200});
  f.tick(0);f.tick(16);
  assert.equal(navigation.selectedId,id);assert.equal(navigation.category,'all');assert.equal(navigation.query,'');assert.equal(navigation.scope,'all');
  assert.equal(f.grid.scrollTop,420);assert.equal(navigation.scroll,420);
});

test('revealing a different preset retains filters that already include it and does not move a visible card',t=>{
  const id='builtin.motion.premium-arc-arrival';
  const navigation={query:'arco',category:'motion',scope:'all',scroll:120,selectedId:'builtin.ease.balanced'};
  const f=fixture(t,{navigation,revealId:id});
  const card=f.gallery.element.querySelectorAll('.ch-preset-card').find(node=>node.id===id);
  f.grid.getBoundingClientRect=()=>({top:100,bottom:500,height:400});
  card.getBoundingClientRect=()=>({top:150,bottom:350,height:200});
  f.tick(0);f.tick(16);
  assert.equal(navigation.query,'arco');assert.equal(navigation.category,'motion');assert.equal(navigation.scroll,120);
});

test('an unfinished reveal survives rapid remounts after its filters and selection have already been repaired',async t=>{
  for(const firstFrame of [false,true])await t.test(firstFrame?'between layout frames':'before layout frames',t=>{
    const id='builtin.motion.studio-letter-silk-rise';
    const navigation={query:'does-not-exist',category:'ease',scope:'favorites',scroll:120,selectedId:'builtin.ease.balanced'};
    const f=fixture(t,{navigation,revealId:id});
    const oldFirst=[...f.frames.values()][0];
    if(firstFrame)f.tick(0);
    const oldPending=[...f.frames.values()][0];
    assert.equal(navigation.pendingRevealId,id);
    f.gallery.dispose();
    // Repeating the same target must retain the pending request even though the
    // previous mount already made the selected card pass all gallery filters.
    const intermediate=f.mount(id);
    intermediate.gallery.dispose();
    const next=f.mount();
    const card=next.gallery.element.querySelectorAll('.ch-preset-card').find(node=>node.id===id);
    next.grid.getBoundingClientRect=()=>({top:100,bottom:500,height:400});
    card.getBoundingClientRect=()=>({top:600,bottom:800,height:200});
    oldFirst(0);oldPending(16);
    assert.equal(navigation.pendingRevealId,id,'discarded galleries cannot consume the shared request');
    f.tick(32);f.tick(48);
    assert.equal(card.getAttribute('data-selected'),'true');
    assert.equal(next.grid.scrollTop,420);assert.equal(navigation.scroll,420);
    assert.equal(navigation.pendingRevealId,undefined,'the live gallery consumes the request after revealing the card');
  });
});

test('a late callback cannot consume a newer reveal target',t=>{
  const firstId='builtin.motion.premium-arc-arrival',nextId='builtin.camera.pushIn';
  const navigation={query:'',category:'all',scope:'all',scroll:120,selectedId:'builtin.ease.balanced'};
  const f=fixture(t,{navigation,revealId:firstId});f.tick(0);
  const late=[...f.frames.values()][0];f.gallery.dispose();
  const next=f.mount(nextId);
  const card=next.gallery.element.querySelectorAll('.ch-preset-card').find(node=>node.id===nextId);
  next.grid.getBoundingClientRect=()=>({top:100,bottom:500,height:400});
  card.getBoundingClientRect=()=>({top:600,bottom:800,height:200});
  late(16);assert.equal(navigation.pendingRevealId,nextId);
  f.tick(32);f.tick(48);
  assert.equal(navigation.selectedId,nextId);assert.equal(next.grid.scrollTop,420);
  assert.equal(navigation.pendingRevealId,undefined);
});

test('a reveal without visible layout remains pending for the next mounted gallery',t=>{
  const id='builtin.motion.premium-arc-arrival';
  const navigation={query:'',category:'all',scope:'all',scroll:120,selectedId:'builtin.ease.balanced'};
  const f=fixture(t,{navigation,revealId:id});
  f.grid.getBoundingClientRect=()=>({top:0,bottom:0,height:0});
  f.tick(0);f.tick(16);assert.equal(navigation.pendingRevealId,id);
  f.gallery.dispose();const next=f.mount();
  const card=next.gallery.element.querySelectorAll('.ch-preset-card').find(node=>node.id===id);
  next.grid.getBoundingClientRect=()=>({top:100,bottom:500,height:400});
  card.getBoundingClientRect=()=>({top:600,bottom:800,height:200});
  f.tick(32);f.tick(48);
  assert.equal(next.grid.scrollTop,420);assert.equal(navigation.pendingRevealId,undefined);
});

test('explicit selection and filter changes cancel an unfinished reveal',async t=>{
  const cases=[
    ['selection',f=>f.gallery.element.querySelectorAll('.ch-preset-preview')[0].click()],
    ['scope',f=>f.gallery.element.getElementsByTagName('button').find(node=>node.dataset.scope==='favorites').click()],
    ['category',f=>f.gallery.element.getElementsByTagName('button').find(node=>node.dataset.category==='ease').click()],
    ['query',f=>{const input=f.gallery.element.getElementsByTagName('input').find(node=>node.getAttribute('aria-label')==='Buscar preset');input.value='different';input.emit('input');}],
  ];
  for(const [name,act] of cases)await t.test(name,t=>{
    const id='builtin.motion.premium-arc-arrival';
    const navigation={query:'',category:'all',scope:'all',scroll:120,selectedId:'builtin.ease.balanced'};
    const f=fixture(t,{navigation,revealId:id});
    const card=f.gallery.element.querySelectorAll('.ch-preset-card').find(node=>node.id===id);
    f.grid.getBoundingClientRect=()=>({top:100,bottom:500,height:400});
    card.getBoundingClientRect=()=>({top:600,bottom:800,height:200});
    act(f);assert.equal(navigation.pendingRevealId,undefined);
    f.tick(0);f.tick(16);
    assert.notEqual(f.grid.scrollTop,420,'a cancelled reveal cannot pull the list toward its old target');
    if(name==='query')assert.equal(navigation.scroll,0,'search keeps its new top-of-list destination');
  });
});

test('showing all presets and selecting a personal file cancel inherited reveal requests',async t=>{
  await t.test('show all',t=>{
    const navigation={query:'not-a-preset',category:'ease',scope:'all',scroll:120,pendingRevealId:'builtin.motion.premium-arc-arrival'};
    const f=fixture(t,{navigation});
    f.gallery.element.getElementsByTagName('button').find(node=>node.textContent==='Ver todos os presets').click();
    assert.equal(navigation.pendingRevealId,undefined);assert.equal(navigation.scroll,0);
  });
  await t.test('personal selection',t=>{
    const navigation={query:'',category:'personal',scope:'all',scroll:120,pendingRevealId:'builtin.motion.premium-arc-arrival'};
    const personal={folders:[],roots:[],items:[{id:'personal-file',folderId:'folder',name:'Meu preset',relativePath:'meu.ffx',kind:'preset'}]};
    const f=fixture(t,{navigation,personal});
    f.gallery.element.getElementsByTagName('button').find(node=>node.dataset.focusKey==='personal.personal-file').click();
    assert.equal(navigation.pendingRevealId,undefined);assert.equal(navigation.selectedId,'personal-file');
  });
});

test('discarded selection and filter handlers cannot cancel the live gallery reveal',t=>{
  const firstId='builtin.motion.premium-arc-arrival',nextId='builtin.camera.pushIn';
  const navigation={query:'',category:'all',scope:'all',scroll:120,selectedId:'builtin.ease.balanced'};
  const f=fixture(t,{navigation,revealId:firstId});
  const oldSelect=f.gallery.element.querySelectorAll('.ch-preset-preview')[0];
  const oldScope=f.gallery.element.getElementsByTagName('button').find(node=>node.dataset.scope==='favorites');
  f.gallery.dispose();f.mount(nextId);oldSelect.click();oldScope.click();
  assert.equal(navigation.pendingRevealId,nextId);assert.equal(navigation.selectedId,nextId);assert.equal(navigation.scope,'all');
});

test('disposal cancels a pending scroll restoration, including a dequeued callback',t=>{
  const f=fixture(t,{scroll:120});const late=[...f.frames.values()][0];
  f.gallery.dispose();assert.equal(f.frames.size,0);
  late(0);assert.equal(f.frames.size,0);assert.equal(f.grid.scrollTop,0);
});
test('older CEP without IntersectionObserver keeps a bounded fallback and can preview later cards',t=>{
  const f=fixture(t,{intersection:false});assert.equal(f.svgs.filter(s=>s.children.length).length,2);
  f.views[100].emit('mouseenter');f.tick(1000);assert.ok(f.svgs[100].children.length);assert.equal(f.svgs.filter(s=>s.children.length).length,1);
});
test('host polling owns no timer while unfocused, hidden, inactive or disposed',t=>{
  const f=fixture(t);let reads=0,enabled=true;
  const polling=focusedPoll(f.doc,()=>reads++,700,()=>enabled);t.after(()=>polling.dispose());
  assert.equal(f.timers.size,1);[...f.timers.values()][0]();assert.equal(reads,1);
  const late=[...f.timers.values()][0];f.focus(false);assert.equal(f.timers.size,0);late();assert.equal(reads,1);
  f.focus(true);assert.equal(reads,2);assert.equal(f.timers.size,1);
  f.doc.hidden=true;f.doc.emit('visibilitychange');assert.equal(f.timers.size,0);
  f.doc.hidden=false;f.doc.emit('visibilitychange');assert.equal(f.timers.size,1);
  enabled=false;polling.refresh();assert.equal(f.timers.size,0);f.win.emit('focus');assert.equal(f.timers.size,0);
  enabled=true;polling.refresh();assert.equal(f.timers.size,1);polling.dispose();assert.equal(f.timers.size,0);
});
