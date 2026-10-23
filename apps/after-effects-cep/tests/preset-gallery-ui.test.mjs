import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { createCepDocument } from './cep-dom.mjs';
import { createFakeWindow } from '../../../packages/ui-core/tests/fake-dom.mjs';

const built=await build({entryPoints:[fileURLToPath(new URL('../client/src/preset-gallery.ts',import.meta.url))],bundle:true,platform:'node',format:'esm',write:false});
const {createPresetGallery,GALLERY_PRESETS}=await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);

function fixture(t, { category = 'all', scope = 'all', query = '', locale = 'pt-BR', context = {hasComp:true, selectionCount:2, selectedKeys:4}, busy = false, personal, personalAction, onApply, pick = true, elements } = {}) {
  const saved={window:globalThis.window,requestAnimationFrame:globalThis.requestAnimationFrame,cancelAnimationFrame:globalThis.cancelAnimationFrame,IntersectionObserver:globalThis.IntersectionObserver};
  globalThis.window=createFakeWindow();globalThis.window.setTimeout=setTimeout;
  globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=()=>{};
  globalThis.IntersectionObserver=class {observe(){} disconnect(){}};
  const doc=createCepDocument(),applied=[];
  const events=new Map();
  doc.addEventListener=(type,handler)=>events.set(type,[...(events.get(type)??[]),handler]);
  doc.removeEventListener=(type,handler)=>events.set(type,(events.get(type)??[]).filter(item=>item!==handler));
  doc.emit=(type,init={})=>{
    const event={type,target:doc,defaultPrevented:false,preventDefault(){this.defaultPrevented=true;},...init};
    for(const handler of events.get(type)??[])handler(event);
    return event;
  };
  // The CEP fixture already supports class selectors in querySelectorAll.
  // Match the browser's single-element query as well for context labels/inspector.
  const create=doc.createElement.bind(doc);
  doc.createElement=tag=>{
    const node=create(tag);
    const queryAll=node.querySelectorAll;
    node.querySelectorAll=selector=>[...new Set(selector.split(',').flatMap(part=>part.trim()==='[data-focus-key]'
      ? ['button','input','select'].flatMap(tag=>node.getElementsByTagName(tag)).filter(child=>child.dataset.focusKey)
      : queryAll(part.trim())))];
    node.querySelector=selector=>node.querySelectorAll(selector)[0]??null;
    node.getBoundingClientRect=()=>({left:10,right:170,top:10,bottom:54,width:160,height:44});
    node.contains=target=>{for(let current=target;current;current=current.parentNode)if(current===node)return true;return false;};
    return node;
  };
  doc.getElementById=id=>{
    const walk=node=>{if(node.id===id)return node;for(const child of node.children){const match=walk(child);if(match)return match;}return null;};
    return walk(doc.documentElement);
  };
  const navigation={query,category,scope,scroll:0};
  const preferences={favorites:[],recent:[],folderColors:{},collapsedFolders:[],presetAutoplay:false,presetSize:200};
  const gallery=createPresetGallery(doc,{locale,navigation,busy,context:()=>context,openApplied(){},personal,personalAction,...(elements?{elements}:{}),
    preferences:{snapshot:()=>preferences,toggleFolder(id){preferences.collapsedFolders=preferences.collapsedFolders.includes(id)?preferences.collapsedFolders.filter(item=>item!==id):[...preferences.collapsedFolders,id];},toggleFavorite(id){preferences.favorites=preferences.favorites.includes(id)?preferences.favorites.filter(item=>item!==id):[...preferences.favorites,id];}},
    apply(preset,settings,mode){applied.push({preset,settings,mode});return onApply?.(preset,navigation);},edit(){}});
  doc.documentElement.appendChild(gallery.element);
  // Details appear only after a choice; most tests start from the user picking the first card.
  if(pick)gallery.element.getElementsByTagName('button').find(node=>node.className.includes('ch-preset-apply'))?.click();
  t.after(()=>{gallery.dispose();Object.assign(globalThis,saved);});
  return {doc,navigation,gallery,applied,context,preferences};
}

test('gallery search starts compact and retains query/focus without rebuilding its control',t=>{
  const f=fixture(t),root=f.gallery.element;
  const control=root.getElementsByTagName('div').find(n=>n.className.includes('ch-preset-search'));
  const trigger=control.getElementsByTagName('button')[0],input=control.getElementsByTagName('input')[0];
  assert.equal(control.getAttribute('data-expanded'),'false');
  trigger.click();assert.equal(control.getAttribute('data-expanded'),'true');assert.equal(f.doc.activeElement,input);
  input.value='arco';input.emit('input');assert.equal(f.navigation.query,'arco');
  input.emit('blur');assert.equal(control.getAttribute('data-expanded'),'true');
  input.keydown('Escape');assert.equal(input.value,'arco');assert.equal(f.navigation.query,'arco');
  input.value='';input.emit('input');input.emit('blur');assert.equal(control.getAttribute('data-expanded'),'false');
});

test('application captures the actual grid position before the next scroll event and selects its target',t=>{
  const observed=[];
  const {gallery,navigation}=fixture(t,{onApply(preset,nav){observed.push({id:preset.id,selectedId:nav.selectedId,scroll:nav.scroll});}});
  const grid=gallery.element.querySelector('.ch-preset-grid');
  const cards=gallery.element.querySelectorAll('.ch-preset-card');
  const target=cards[23];
  grid.scrollTop=684;
  target.querySelector('.ch-preset-preview').click();
  gallery.element.getElementsByTagName('button').find(node=>node.dataset.phase==='in').click();
  assert.deepEqual(observed,[{id:target.id,selectedId:target.id,scroll:684}]);
  assert.equal(navigation.scroll,684);
  assert.equal(target.getAttribute('data-selected'),'true');
  assert.equal(target.querySelector('.ch-preset-preview').getAttribute('aria-pressed'),'true');
});

test('disposal saves scrolling without an event and ignores subsequent stale events or repeated disposal',t=>{
  const {gallery,navigation}=fixture(t);
  const grid=gallery.element.querySelector('.ch-preset-grid');
  grid.scrollTop=912;
  gallery.dispose();
  assert.equal(navigation.scroll,912);
  navigation.scroll=744;
  grid.scrollTop=0;grid.emit('scroll');gallery.dispose();
  assert.equal(navigation.scroll,744,'an old view cannot erase a newer navigation position');
});

test('the shell detaching the gallery before disposal cannot erase its captured preset position',t=>{
  const {gallery,navigation}=fixture(t);
  const grid=gallery.element.querySelector('.ch-preset-grid');
  grid.scrollTop=912;grid.emit('scroll');
  Object.defineProperty(grid,'isConnected',{value:false});
  grid.scrollTop=0;gallery.dispose();
  assert.equal(navigation.scroll,912);
});

test('opening applied presets captures the live offset before the shell detaches the browser',t=>{
  const {gallery,navigation}=fixture(t);
  const grid=gallery.element.querySelector('.ch-preset-grid');
  grid.scrollTop=712;
  gallery.element.getElementsByTagName('button').find(node=>node.getAttribute('aria-label')==='Editar preset aplicado').click();
  assert.equal(navigation.scroll,712);
});

test('the default gallery exposes all collections with its filters in a closed anchored menu',t=>{
  const {gallery,navigation}=fixture(t),root=gallery.element;
  assert.equal(navigation.category,'all');
  const cards=root.getElementsByTagName('article');
  assert.ok(cards.length>30,'all collections include more than the former premium-only default');
  assert.ok(!cards.some(card=>card.id.startsWith('builtin.ease.')));
  assert.ok(cards.some(card=>card.id==='builtin.camera.pushIn'));
  const menu=root.getElementsByTagName('div').find(node=>node.className==='ch-preset-filter-menu');
  const categories=root.getElementsByTagName('nav').find(node=>node.className==='ch-preset-categories');
  const trigger=root.getElementsByTagName('button').find(node=>node.className.includes('ch-preset-filter-trigger'));
  assert.equal(categories.parentNode,menu);
  assert.equal(menu.hidden,true);assert.equal(trigger.getAttribute('aria-expanded'),'false');
  assert.match(trigger.allText,/Todos os presets/);
  const edit=root.getElementsByTagName('button').find(node=>node.getAttribute('aria-label')==='Editar preset aplicado');
  const autoplay=root.getElementsByTagName('button').find(node=>node.getAttribute('aria-label')==='Autoplay');
  const size=root.getElementsByTagName('input').find(node=>node.getAttribute('aria-label')==='Tamanho das miniaturas');
  assert.equal(edit.parentNode,trigger.parentNode);assert.equal(autoplay.parentNode,trigger.parentNode);
  assert.equal(menu.contains(edit),false);assert.equal(menu.contains(autoplay),false);assert.equal(menu.contains(size),false);
  const scroll=root.getElementsByTagName('div').find(node=>node.className==='ch-preset-scroll');
  assert.equal(scroll.contains(trigger),false);assert.equal(scroll.contains(size),false);
  trigger.click();assert.equal(menu.hidden,false);assert.equal(trigger.getAttribute('aria-expanded'),'true');
});

test('thumbnail size shares the catalog toolbar and the category menu sizes itself',t=>{
  const {gallery}=fixture(t),root=gallery.element;
  const toolbar=root.getElementsByTagName('div').find(node=>node.className.includes('ch-preset-toolbar-approved'));
  const size=root.getElementsByTagName('input').find(node=>node.getAttribute('aria-label')==='Tamanho das miniaturas');
  assert.ok(toolbar.contains(size),'the thumbnail control no longer owns a row of its own');
  const categories=root.getElementsByTagName('nav').find(node=>node.className==='ch-preset-categories');
  assert.equal(categories.style.width,undefined,'no inherited sidebar width narrows the menu');
  assert.equal(root.getElementsByTagName('div').some(node=>node.className==='ch-preset-divider'),false);
});

test('category menu supports arrow, Home/End and fold keys',t=>{
  const {gallery,doc,preferences}=fixture(t),root=gallery.element;
  const menu=root.getElementsByTagName('div').find(node=>node.className==='ch-preset-filter-menu');
  const trigger=root.getElementsByTagName('button').find(node=>node.className.includes('ch-preset-filter-trigger'));
  trigger.click();
  const key=name=>menu.emit('keydown',{key:name,target:doc.activeElement});
  assert.equal(doc.activeElement.dataset.category,'signature');
  key('ArrowDown');assert.equal(doc.activeElement.dataset.category,'signature-essentials');
  key('ArrowLeft');assert.equal(doc.activeElement.dataset.category,'signature','Left on a child returns to its group');
  key('ArrowLeft');assert.deepEqual(preferences.collapsedFolders,['signature']);
  key('ArrowRight');assert.deepEqual(preferences.collapsedFolders,[]);
  key('End');assert.equal(doc.activeElement.dataset.category,'personal','a disabled Add folder is skipped');
  key('Home');assert.equal(doc.activeElement.dataset.category,'signature');
  key('ArrowUp');assert.equal(doc.activeElement.dataset.category,'personal','arrows wrap around');
});

test('a selected preset persists when closing settings or pressing Escape',t=>{
  const {gallery,navigation,doc}=fixture(t,{pick:false}),root=gallery.element;
  const editor=root.getElementsByTagName('section').find(node=>node.className==='ch-preset-editor');
  const bar=root.getElementsByTagName('div').find(node=>node.className==='ch-preset-applybar');
  assert.equal(navigation.selectedId,undefined);assert.equal(editor.hidden,true);assert.equal(bar.hidden,true);
  const title=root.getElementsByTagName('button').find(node=>node.className.includes('ch-preset-apply'));
  title.click();const selected=navigation.selectedId;
  assert.equal(editor.hidden,true,'the empty inspector has no visible container');assert.equal(bar.hidden,false);
  assert.equal(root.getElementsByTagName('button').some(node=>node.getAttribute('aria-label')==='Fechar ajustes do preset'),false);
  title.focus();doc.emit('keydown',{key:'Escape'});
  assert.equal(navigation.selectedId,selected);assert.equal(editor.hidden,true);assert.equal(bar.hidden,false);
  assert.equal(doc.activeElement,title);
});

test('the empty inspector stays hidden while phase actions keep their draft during context refresh',t=>{
  const {gallery,context,navigation,doc}=fixture(t),root=gallery.element;
  const editor=root.getElementsByTagName('section').find(node=>node.className==='ch-preset-editor');
  const inspector=root.getElementsByTagName('section').find(node=>node.className==='ch-preset-inspector');
  const out=root.getElementsByTagName('button').find(node=>node.dataset.phase==='out');
  const apply=root.getElementsByTagName('button').find(node=>node.dataset.phase==='in');
  assert.equal(editor.hidden,true);assert.equal(editor.parentNode.className,'ch-preset-stage');
  assert.ok(navigation.selectedId);assert.ok(out);assert.equal(apply.allText,'Entrada');
  out.click();out.focus();
  context.selectionCount=0;gallery.updateContext();
  assert.equal(root.getElementsByTagName('section').find(node=>node.className==='ch-preset-inspector'),inspector);
  assert.equal(root.getElementsByTagName('button').find(node=>node.dataset.phase==='out'),out);assert.equal(doc.activeElement,out);
  assert.equal(apply.disabled,true);assert.equal(apply.title,'Nenhuma camada selecionada','the reason rides on the button');
  context.selectionCount=3;gallery.updateContext();
  assert.equal(apply.disabled,false);assert.equal(apply.title,'Entrada');
  assert.equal(navigation.drafts[navigation.selectedId].phase,'out');
});

test('a missing composition or selection blocks both Apply and preview double-click',t=>{
  const {gallery,context,applied}=fixture(t,{context:{hasComp:false,selectionCount:0,selectedKeys:0}}),root=gallery.element;
  const apply=root.getElementsByTagName('button').find(node=>node.dataset.phase==='in');
  const preview=root.getElementsByTagName('button').find(node=>node.className==='ch-preset-preview');
  assert.equal(apply.disabled,true);assert.match(apply.title,/Abra uma composição/);
  apply.click();preview.emit('dblclick');assert.equal(applied.length,0);
  context.hasComp=true;gallery.updateContext();assert.equal(apply.disabled,true);
  apply.click();preview.emit('dblclick');assert.equal(applied.length,0);
  context.selectionCount=1;gallery.updateContext();assert.equal(apply.disabled,false);
  apply.click();assert.equal(applied.length,1);assert.equal(applied[0].preset.id,'builtin.motion.premium-arc-arrival');
});

test('legacy Curves navigation migrates to all presets without a dead selected item',t=>{
  const {gallery,navigation}=fixture(t,{category:'ease',pick:false});
  assert.equal(navigation.category,'all');
  assert.ok(!gallery.element.getElementsByTagName('article').some(card=>card.id.startsWith('builtin.ease.')));
});

test('filter menu transfers focus on opening and reverses an unfinished closing animation',async t=>{
  const {gallery,doc}=fixture(t),root=gallery.element;
  const menu=root.getElementsByTagName('div').find(node=>node.className==='ch-preset-filter-menu');
  const trigger=root.getElementsByTagName('button').find(node=>node.className.includes('ch-preset-filter-trigger'));
  trigger.focus();trigger.click();
  assert.equal(menu.hidden,false);assert.equal(trigger.getAttribute('aria-expanded'),'true');
  assert.equal(doc.activeElement,menu.getElementsByTagName('button').find(node=>node.className==='ch-folder-select'),'keyboard navigation enters the menu that precedes its trigger in the DOM');
  trigger.click();assert.equal(menu.getAttribute('data-open'),'false');assert.equal(menu.hidden,false,'exit animation is still running');
  trigger.click();assert.equal(trigger.getAttribute('aria-expanded'),'true');assert.equal(menu.getAttribute('data-open'),'true');
  await new Promise(resolve=>setTimeout(resolve,240));
  assert.equal(menu.hidden,false,'the cancelled exit timer must not hide the reopened menu');
  assert.equal(menu.getAttribute('aria-hidden'),'false');
  trigger.click();await new Promise(resolve=>setTimeout(resolve,240));
  assert.equal(menu.hidden,true);assert.equal(trigger.getAttribute('aria-expanded'),'false');
});

test('switching to personal presets clears the previous inspector and preserves its draft for return',t=>{
  const {gallery,navigation}=fixture(t),root=gallery.element;
  const editor=root.getElementsByTagName('section').find(node=>node.className==='ch-preset-editor');
  const inspector=root.getElementsByTagName('section').find(node=>node.className==='ch-preset-inspector');
  const selected=navigation.selectedId;
  const left=()=>root.getElementsByTagName('button').find(node=>node.dataset.direction==='left');
  left().click();
  const chooseCategory=id=>root.getElementsByTagName('button').find(node=>node.dataset.category===id).click();
  chooseCategory('personal');
  assert.equal(editor.hidden,true);assert.equal(inspector.getElementsByTagName('input').length,0);
  assert.equal(inspector.getElementsByTagName('div').some(node=>node.className==='ch-preset-approved-heading'),false);
  assert.equal(navigation.selectedId,selected);assert.equal(navigation.drafts[selected].direction,'left');
  chooseCategory('all');
  assert.equal(editor.hidden,true,'returning keeps the empty inspector hidden');assert.equal(navigation.selectedId,selected);
  const title=()=>root.getElementsByTagName('button').find(node=>node.dataset.focusKey===`title.${selected}`);
  title().click();
  assert.equal(editor.hidden,true,'a second click clears the choice and folds the box');assert.equal(navigation.selectedId,'');
  title().click();
  assert.equal(editor.hidden,true);assert.equal(navigation.selectedId,selected);assert.equal(root.getElementsByTagName('div').find(node=>node.className==='ch-preset-applybar').hidden,false);
  assert.equal(left().getAttribute('aria-pressed'),'true','the draft survives deselection');
});

test('settings SVG sits beside each name and opens directions without applying',t=>{
  const {gallery,applied,navigation}=fixture(t),root=gallery.element;
  const card=root.getElementsByTagName('article').find(node=>node.id==='builtin.motion.premium-arc-arrival');
  const title=card.getElementsByTagName('button').find(node=>node.dataset.focusKey===`title.${card.id}`);
  const trigger=card.getElementsByTagName('button').find(node=>node.dataset.focusKey===`adjust.${card.id}`);
  const panel=root.getElementsByTagName('section').find(node=>node.className==='ch-preset-settings-panel');
  assert.equal(trigger.parentNode,title.parentNode);
  assert.equal(trigger.getElementsByTagName('svg').length,1);
  assert.equal(trigger.getAttribute('aria-haspopup'),'dialog');
  assert.equal(trigger.getAttribute('aria-controls'),panel.id);
  assert.equal(panel.hidden,true);
  trigger.click();
  assert.equal(panel.hidden,false);assert.equal(trigger.getAttribute('aria-expanded'),'true');
  assert.equal(navigation.selectedId,card.id);assert.equal(applied.length,0);
  const direction=panel.getElementsByTagName('button').find(node=>node.dataset.direction==='left');
  assert.ok(direction);direction.click();
  assert.equal(navigation.drafts[card.id].direction,'left');assert.equal(applied.length,0);
  trigger.click();trigger.click();
  assert.equal(panel.getElementsByTagName('button').find(node=>node.dataset.direction==='left').getAttribute('aria-pressed'),'true');
  assert.equal(navigation.drafts[card.id].direction,'left');
});

test('settings Escape restores its origin and a quick reversal cannot be hidden by a stale timer',async t=>{
  const {gallery,doc}=fixture(t),root=gallery.element;
  const trigger=root.getElementsByTagName('button').find(node=>node.dataset.focusKey==='adjust.builtin.motion.premium-arc-arrival');
  const panel=root.getElementsByTagName('section').find(node=>node.className==='ch-preset-settings-panel');
  trigger.click();
  assert.ok(panel.contains(doc.activeElement),'focus enters the settings content');
  const event=doc.emit('keydown',{key:'Escape'});
  assert.equal(event.defaultPrevented,true);assert.equal(doc.activeElement,trigger);
  assert.equal(trigger.getAttribute('aria-expanded'),'false');assert.equal(panel.getAttribute('data-open'),'false');
  assert.ok(panel.querySelectorAll('button,input,select,summary').every(node=>node.getAttribute('tabindex')==='-1'));
  trigger.click();await new Promise(resolve=>setTimeout(resolve,240));
  assert.equal(panel.hidden,false);assert.equal(panel.getAttribute('data-open'),'true');
  assert.equal(panel.getAttribute('aria-hidden'),'false');
  assert.ok(panel.querySelectorAll('button,input,select,summary').some(node=>node.getAttribute('tabindex')!=='-1'));
  assert.notEqual(panel.getElementsByTagName('button').find(node=>node.getAttribute('aria-label')==='Fechar ajustes').getAttribute('tabindex'),'-1','persistent close control returns to the keyboard order after redraw');
  doc.emit('keydown',{key:'Escape'});await new Promise(resolve=>setTimeout(resolve,240));
  assert.equal(panel.hidden,true);assert.equal(doc.activeElement,trigger);
});

test('settings grow from the card at its exact width without moving the gallery',t=>{
  const {gallery}=fixture(t),root=gallery.element;
  const card=root.getElementsByTagName('article').find(node=>node.id==='builtin.motion.premium-arc-arrival');
  const trigger=card.getElementsByTagName('button').find(node=>node.dataset.focusKey===`adjust.${card.id}`);
  const panel=root.getElementsByTagName('section').find(node=>node.className==='ch-preset-settings-panel');
  card.getBoundingClientRect=()=>({left:40,right:200,top:100,bottom:220,width:160,height:120});
  trigger.click();
  assert.equal(panel.style.width,'160px');
  assert.equal(panel.style.left,'40px');
  assert.equal(panel.style.top,'220px');
  assert.equal(card.getAttribute('data-attached'),'below');
  assert.equal(panel.getAttribute('data-attached'),'below');
});

test('settings hover opens without stealing focus and crossing to its menu keeps it open',async t=>{
  const {gallery,doc,applied}=fixture(t),root=gallery.element;
  const trigger=root.getElementsByTagName('button').find(node=>node.dataset.focusKey==='adjust.builtin.motion.premium-arc-arrival');
  const panel=root.getElementsByTagName('section').find(node=>node.className==='ch-preset-settings-panel');
  const originalFocus=doc.activeElement;
  trigger.emit('mouseenter');await new Promise(resolve=>setTimeout(resolve,160));
  assert.equal(panel.getAttribute('data-open'),'true');
  assert.equal(doc.activeElement,originalFocus);
  trigger.emit('mouseleave');panel.emit('mouseenter');
  await new Promise(resolve=>setTimeout(resolve,220));
  assert.equal(panel.getAttribute('data-open'),'true');assert.equal(applied.length,0);
  panel.emit('mouseleave');await new Promise(resolve=>setTimeout(resolve,220));
  assert.equal(panel.getAttribute('data-open'),'false');
});

test('compact direction list exposes all previews on demand and preserves its choice',t=>{
  const {gallery,navigation,applied}=fixture(t),root=gallery.element;
  root.getElementsByTagName('button').find(node=>node.dataset.focusKey==='adjust.builtin.motion.premium-arc-arrival').click();
  const panel=root.getElementsByTagName('section').find(node=>node.className==='ch-preset-settings-panel');
  const directions=panel.getElementsByTagName('div').find(node=>node.className==='ch-preset-directions');
  const all=panel.getElementsByTagName('button').find(node=>node.className.includes('ch-preset-directions-toggle'));
  assert.ok(all);assert.equal(directions.getAttribute('data-view'),'list');
  const left=panel.getElementsByTagName('button').find(node=>node.dataset.direction==='left');
  left.emit('mouseenter');assert.notEqual(navigation.drafts[navigation.selectedId].direction,'left','hover previews without committing');
  left.click();all.click();
  assert.equal(directions.getAttribute('data-view'),'previews');assert.equal(all.getAttribute('aria-expanded'),'true');
  assert.equal(navigation.drafts[navigation.selectedId].direction,'left');assert.equal(applied.length,0);
});

test('Apply bar is outside the scrolling gallery and stays blocked while busy',t=>{
  const {gallery,applied}=fixture(t,{busy:true}),root=gallery.element;
  const scroll=root.getElementsByTagName('div').find(node=>node.className==='ch-preset-scroll');
  const bar=root.getElementsByTagName('div').find(node=>node.className==='ch-preset-applybar');
  assert.ok(scroll);assert.equal(bar.parentNode,scroll.parentNode);assert.equal(bar.parentNode,root);
  assert.equal(scroll.contains(bar),false);
  const apply=bar.getElementsByTagName('button').find(node=>node.dataset.phase==='in');
  assert.equal(apply.disabled,true);apply.click();assert.equal(applied.length,0);
});

test('phase buttons apply directly; arrows only move focus and Edit selectors remain independent',t=>{
  const {gallery,applied,navigation,doc}=fixture(t),root=gallery.element;
  const group=()=>root.getElementsByRole('group').find(node=>node.getAttribute('aria-label')==='Aplicar animação');
  assert.ok(group());assert.equal(applied.length,0,'selecting the card never applies');
  assert.equal(root.getElementsByTagName('button').some(node=>node.className.includes('ch-preset-primary-apply')),false);
  const both=group().getElementsByTagName('button')[2];both.click();
  assert.equal(applied.length,1);assert.equal(applied[0].settings.phase,'both');
  assert.equal(navigation.drafts[navigation.selectedId].phase,'both');
  root.getElementsByTagName('button').find(node=>node.dataset.focusKey===`adjust.${navigation.selectedId}`).click();
  group().getElementsByTagName('button')[2].keydown('ArrowLeft');
  assert.equal(navigation.drafts[navigation.selectedId].phase,'both');assert.equal(applied.length,1);
  assert.equal(doc.activeElement,group().getElementsByTagName('button')[1]);
  group().getElementsByTagName('button')[1].keydown('Enter');
  assert.equal(applied[1].settings.phase,'out');
  group().getElementsByTagName('button')[0].keydown(' ');
  assert.equal(applied[2].settings.phase,'in');
});

test('transition double-click never applies and pending phases share one real operation lock',async t=>{
  let resolve;
  const {gallery,applied}=fixture(t,{onApply:()=>new Promise(done=>{resolve=done;})}),root=gallery.element;
  const phase=value=>root.getElementsByTagName('button').find(node=>node.dataset.phase===value);
  root.querySelector('.ch-preset-preview').emit('dblclick');assert.equal(applied.length,0);
  phase('both').click();phase('in').click();phase('both').keydown('Enter');
  assert.equal(applied.length,1);assert.equal(phase('both').getAttribute('aria-busy'),'true');
  resolve({ok:false,message:'Host refused the target'});await Promise.resolve();
  assert.equal(phase('both').parentNode.getAttribute('data-state'),'error');
  assert.equal(phase('both').disabled,false);assert.equal(phase('in').disabled,false);
  phase('out').click();assert.equal(applied.length,2);
  resolve({ok:true,message:'Applied in one Undo'});await Promise.resolve();
  assert.equal(phase('out').parentNode.getAttribute('data-state'),'success');
  assert.equal(phase('both').parentNode.getAttribute('data-state'),'default');
});

test('void callbacks never report success and failed promises recover',async t=>{
  const {gallery}=fixture(t,{onApply:()=>Promise.reject(new Error('offline'))}),root=gallery.element;
  const phase=root.getElementsByTagName('button').find(node=>node.dataset.phase==='in');
  phase.click();await Promise.resolve();
  assert.equal(phase.parentNode.getAttribute('data-state'),'error');assert.equal(phase.disabled,false);
});

for (const locale of ['pt-BR','en-US']) {
  for (const scope of ['favorites','recent']) {
    test(`${locale} empty ${scope} provides a localized recovery action`,t=>{
      const {gallery,navigation,doc}=fixture(t,{locale,scope}),root=gallery.element;
      const expected=locale==='pt-BR' ? scope==='favorites'?'Favorite um preset':'Os presets que você aplicar' : scope==='favorites'?'Favorite a preset':'Presets you apply';
      assert.ok(root.allText.includes(expected));
      const action=root.getElementsByTagName('button').find(node=>node.textContent===(locale==='pt-BR'?'Ver todos os presets':'Show all presets'));
      assert.ok(action);action.focus();action.click();
      assert.equal(navigation.scope,'all');assert.equal(navigation.category,'all');assert.equal(navigation.query,'');
      assert.ok(root.getElementsByTagName('article').length>0);
      const search=root.getElementsByTagName('input').find(node=>node.type==='search');
      assert.equal(doc.activeElement,search);assert.equal(search.hidden,false);
    });
  }
}

test('empty search retains selection, draft, search identity and focus until explicit reset',t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const {gallery,navigation,doc}=fixture(t),root=gallery.element;
  const second=root.getElementsByTagName('button').filter(node=>node.dataset.focusKey?.startsWith('title.'))[1];
  second.click();
  const selected=navigation.selectedId;
  root.getElementsByTagName('button').find(node=>node.dataset.direction==='left').click();
  const search=root.getElementsByTagName('input').find(node=>node.type==='search');
  const searchControl=root.getElementsByTagName('div').find(node=>node.className.includes('ch-preset-search'));
  searchControl.getElementsByTagName('button')[0].click();
  search.value='does-not-exist';search.emit('input');t.mock.timers.tick(250);
  assert.equal(navigation.selectedId,selected);assert.equal(navigation.drafts[selected].direction,'left');
  assert.equal(doc.activeElement,search);assert.equal(navigation.query,'does-not-exist');
  assert.match(root.allText,/Tente outro nome ou limpe os filtros/);
  root.getElementsByTagName('button').find(node=>node.textContent==='Ver todos os presets').click();
  assert.equal(root.getElementsByTagName('input').find(node=>node.type==='search'),search);
  assert.equal(doc.activeElement,search);assert.equal(search.value,'');
  assert.equal(navigation.selectedId,selected);assert.equal(navigation.drafts[selected].direction,'left');
  assert.equal(root.getElementsByTagName('button').find(node=>node.dataset.direction==='left').getAttribute('aria-pressed'),'true');
  t.mock.timers.tick(300);
  assert.ok(root.getElementsByTagName('article').length>0,'a superseded search cannot replace the restored library');
});

for (const locale of ['pt-BR','en-US']) {
  test(`${locale} favorite toggle describes the current action and retains focus after redraw`,t=>{
    const {gallery,doc,navigation}=fixture(t,{locale}),root=gallery.element;
    const id=navigation.selectedId;
    const favorite=()=>root.getElementsByTagName('button').find(node=>node.dataset.focusKey===`favorite.${id}`);
    favorite().focus();favorite().click();
    assert.equal(favorite().getAttribute('aria-pressed'),'true');
    assert.ok(favorite().getAttribute('aria-label').startsWith(locale==='pt-BR'?'Remover favorito:':'Remove favorite:'));
    assert.equal(favorite().title,favorite().getAttribute('aria-label'));assert.equal(doc.activeElement,favorite());
    favorite().click();
    assert.equal(favorite().getAttribute('aria-pressed'),'false');
    assert.ok(favorite().getAttribute('aria-label').startsWith(locale==='pt-BR'?'Favoritar:':'Favorite:'));
  });
}

test('removing the last favorite returns focus to a visible search and preserves selected draft',t=>{
  const {gallery,doc,navigation}=fixture(t),root=gallery.element;
  const selected=navigation.selectedId;
  const favorite=()=>root.getElementsByTagName('button').find(node=>node.dataset.focusKey===`favorite.${selected}`);
  favorite().click();root.getElementsByTagName('button').find(node=>node.dataset.scope==='favorites').click();
  favorite().focus();favorite().click();
  const search=root.getElementsByTagName('input').find(node=>node.type==='search');
  assert.equal(doc.activeElement,search);assert.equal(search.hidden,false);
  assert.equal(navigation.selectedId,selected);assert.match(root.allText,/Favorite um preset/);
});

test('empty personal library explains local storage and adds a folder through its existing callback',t=>{
  const calls=[];
  const {gallery}=fixture(t,{category:'personal',personalAction(action){calls.push(action);}}),root=gallery.element;
  assert.match(root.allText,/Os arquivos permanecem no local original/);
  root.getElementsByTagName('button').find(node=>node.textContent==='Adicionar pasta').click();
  assert.deepEqual(calls,['add']);
});

function openSettings(root,id){
  const trigger=root.getElementsByTagName('button').find(node=>node.dataset.focusKey===`adjust.builtin.motion.${id}`);trigger.click();
  return root.getElementsByTagName('section').find(node=>node.className==='ch-preset-settings-panel');
}

test('every direction is a painted preview tile, and before applying only direction and character are offered',t=>{
  const {gallery,navigation,applied}=fixture(t),panel=openSettings(gallery.element,'momentum-push');
  const tiles=panel.getElementsByTagName('button').filter(node=>node.className==='ch-preset-direction-tile');
  // Even a recipe that can travel diagonally offers four sides here, 2×2 under Original; diagonals stay in Edit.
  const grid=panel.getElementsByTagName('div').find(node=>node.className==='ch-preset-direction-grid');
  assert.equal(grid.dataset.layout,undefined,'no 3×3 compass and no center dot');
  assert.deepEqual(grid.children.map(node=>node.dataset.direction),['top','bottom','left','right']);
  assert.deepEqual(tiles.map(node=>node.dataset.direction),['top','bottom','left','right']);
  for(const tile of tiles){assert.ok(tile.getElementsByTagName('svg')[0].children.length>0,`${tile.dataset.direction} is painted`);assert.ok(tile.getAttribute('aria-label'));}
  tiles.find(node=>node.dataset.direction==='top').click();
  assert.equal(navigation.drafts['builtin.motion.momentum-push'].direction,'top');assert.equal(applied.length,0);
  assert.equal(tiles.find(node=>node.dataset.direction==='top').getAttribute('aria-pressed'),'true');
  assert.equal(panel.getElementsByTagName('button').find(node=>node.dataset.direction==='preset').getAttribute('aria-pressed'),'false');
  assert.equal(panel.getElementsByTagName('input').length+panel.getElementsByTagName('select').length,0,'duration, intensity, curve and motion blur live in Edit');
  assert.doesNotMatch(panel.allText,/Restaurar padrão|Salvar como variação|Refinar movimento/);
});
test('a reveal keeps the four sides of its wipe, in the 2×2 grid under Original',t=>{
  const {gallery,navigation}=fixture(t),panel=openSettings(gallery.element,'reveal-curtain');
  const grid=panel.getElementsByTagName('div').find(node=>node.className==='ch-preset-direction-grid');
  assert.equal(grid.dataset.layout,undefined);
  assert.deepEqual(grid.children.map(node=>node.dataset.direction),['top','bottom','left','right']);
  panel.getElementsByTagName('button').find(node=>node.dataset.direction==='left').click();
  assert.equal(navigation.drafts['builtin.motion.reveal-curtain'].direction,'left');
});
test('the box under the gallery is lean: only In, Out and Both; a second click folds it',t=>{
  const {gallery,navigation}=fixture(t),root=gallery.element;
  const inspector=root.getElementsByTagName('section').find(node=>node.className==='ch-preset-inspector');
  const editor=root.getElementsByTagName('section').find(node=>node.className==='ch-preset-editor');
  assert.doesNotMatch(inspector.allText,/Ajustável|Camada visual|cena de exemplo|Duração/);
  assert.match(root.querySelector('.ch-preset-applybar').allText,/Entrada.*Saída.*Ambos/);
  assert.doesNotMatch(root.querySelector('.ch-preset-applybar').allText,/Aplicar preset/);
  const bar=root.getElementsByTagName('div').find(n=>n.className==='ch-preset-applybar');
  assert.doesNotMatch(bar.allText,/composição|camada/i);
  const selected=navigation.selectedId,card=root.getElementsByTagName('article').find(node=>node.id===selected);
  assert.equal(card.getAttribute('data-selected'),'true');
  card.getElementsByTagName('button').find(node=>node.className==='ch-preset-preview').click();
  assert.equal(card.getAttribute('data-selected'),'false');assert.equal(navigation.selectedId,'');assert.equal(editor.hidden,true);
});

test('character chips pick the curve and reveal its own controls',t=>{
  const {gallery,navigation}=fixture(t),id='builtin.motion.premium-arc-arrival';let panel=openSettings(gallery.element,'premium-arc-arrival');
  const chip=label=>panel.getElementsByTagName('button').find(node=>node.dataset.easing&&node.allText===label);
  assert.deepEqual(panel.getElementsByTagName('button').filter(node=>node.dataset.easing).map(node=>node.allText),['Suave','Recuo','Ricochete','Quique']);
  chip('Quique').click();
  assert.equal(navigation.drafts[id].easing,'settle-hop');
  assert.equal(chip('Quique').getAttribute('aria-pressed'),'true');
  assert.equal(panel.getElementsByTagName('input').length+panel.getElementsByTagName('select').length,0,'fine controls live in Edit after applying');
});

test('the Elements folder lives in Presets and inserts through the gallery action bar',async t=>{
  const inserted=[];
  const f=fixture(t,{pick:false,elements:{execute:async args=>{inserted.push(args);return {protocolVersion:1,requestId:'e',ok:true,data:{},warnings:[],error:null};},error:()=> 'erro'}});
  const folder=f.gallery.element.getElementsByTagName('button').find(node=>node.dataset?.category==='elements-lower-third');
  assert.ok(folder,'Elementos › Tarjas is a gallery folder');
  folder.click();
  assert.equal(f.navigation.category,'elements-lower-third');
  const cards=f.gallery.element.getElementsByTagName('button').filter(node=>node.id.startsWith('element-'));
  assert.deepEqual(cards.map(c=>c.id),['element-lt-bar','element-lt-line','element-lt-tag']);
  assert.equal(f.gallery.element.getElementsByTagName('button').filter(node=>node.className?.includes?.('ch-preset-apply')).length,0,'no motion presets mixed in');
  cards[0].click();
  f.gallery.element.getElementsByTagName('button').find(node=>node.id==='elements-insert').click();
  for(let i=0;i<4;i++)await Promise.resolve();
  assert.deepEqual(inserted,[{elementId:'lt-bar'}]);
  const all=f.gallery.element.getElementsByTagName('button').find(node=>node.dataset?.category==='elements');
  all.click();
  assert.equal(f.gallery.element.getElementsByTagName('button').filter(node=>node.id.startsWith('element-')).length,13);
});


test('text family filters combine with favorites and preserve draft animation units',t=>{
  const f=fixture(t,{category:'text-characters',pick:false}),root=f.gallery.element;
  const filters=root.getElementsByTagName('button').filter(node=>node.dataset.category?.startsWith('text-characters/'));
  assert.ok(filters.length>3);
  for(const filter of filters)assert.ok(GALLERY_PRESETS.some(preset=>preset.navigation?.filter===filter.dataset.category),'no empty family');
  const family=filters.find(node=>node.dataset.category==='text-characters/position');
  family.click();
  const cards=root.getElementsByTagName('article');assert.ok(cards.length);
  for(const card of cards)assert.equal(GALLERY_PRESETS.find(p=>p.id===card.id).navigation.filter,'text-characters/position');
  const card=cards[0];card.querySelector('.ch-preset-preview').click();
  const draft=f.navigation.drafts[card.id];draft.unit='lines';
  root.getElementsByTagName('button').find(node=>node.dataset.focusKey===`favorite.${card.id}`)?.click();
  f.preferences.favorites=[card.id];
  root.getElementsByTagName('button').find(node=>node.dataset.scope==='favorites').click();
  assert.equal(root.getElementsByTagName('article').length,1);
  assert.equal(f.navigation.drafts[card.id],draft);assert.equal(draft.unit,'lines');
});

test('phase activation revalidates current context before dispatch and never changes draft on rejection',t=>{
  const f=fixture(t),root=f.gallery.element;
  const phase=root.getElementsByTagName('button').find(node=>node.dataset.phase==='out');
  const draft=f.navigation.drafts[f.navigation.selectedId],before=draft.phase;
  f.context.hasComp=false;phase.click();
  assert.equal(f.applied.length,0);assert.equal(draft.phase,before);assert.equal(phase.disabled,true);
});

test('camera overlays and continuous effects retain their dedicated primary action',async t=>{
  for(const [category,query,label] of [['camera-transitions','','Criar transição'],['motion-effects','','Aplicar preset']]){
    await t.test(category,child=>{
    const f=fixture(child,{category,query}),root=f.gallery.element;
    assert.equal(root.getElementsByTagName('button').filter(node=>node.dataset.phase).length,0);
    const action=root.getElementsByTagName('button').find(node=>node.className.includes('ch-preset-primary-apply'));
    assert.equal(action.allText,label);action.click();assert.equal(f.applied.length,1);
    assert.equal(action.parentNode.getAttribute('data-state'),'default','void callback cannot confirm success');
    });
  }
});

test('pending result stays associated with its recipe after selecting another card',async t=>{
  let resolve;
  const f=fixture(t,{onApply:()=>new Promise(done=>{resolve=done;})}),root=f.gallery.element;
  root.getElementsByTagName('button').find(node=>node.dataset.phase==='in').click();
  const next=root.getElementsByTagName('article')[1];next.querySelector('.ch-preset-preview').click();
  const nextAction=root.getElementsByTagName('button').find(node=>node.dataset.phase==='in');
  assert.equal(nextAction.disabled,true);nextAction.click();assert.equal(f.applied.length,1);
  resolve({ok:true,message:'Applied'});await Promise.resolve();
  assert.equal(nextAction.disabled,false);assert.equal(nextAction.parentNode.getAttribute('data-state'),'default');
});

test('all three phase actions share text and locked-layer requirements',t=>{
  const f=fixture(t,{category:'text-characters',context:{hasComp:true,selectionCount:2,selectedKeys:0,textLayers:1,lockedLayers:0}});
  const phases=f.gallery.element.getElementsByTagName('button').filter(node=>node.dataset.phase);
  assert.equal(phases.length,3);
  for(const phase of phases){assert.equal(phase.disabled,true);assert.match(phase.title,/apenas camadas de texto/);phase.click();}
  assert.equal(f.applied.length,0);
  f.context.textLayers=2;f.context.lockedLayers=1;f.gallery.updateContext();
  for(const phase of phases){assert.equal(phase.disabled,true);assert.match(phase.title,/Desbloqueie/);}
  f.context.lockedLayers=0;f.gallery.updateContext();
  assert.ok(phases.every(phase=>!phase.disabled));
});
test('direction tiles repaint while hovered, so their drawing never takes the click (CEF drops a click whose target was removed)',async()=>{
  const {readFile}=await import('node:fs/promises');
  const css=await readFile(new URL('../../../packages/ui-core/src/preset-approved.css',import.meta.url),'utf8');
  assert.match(css,/\.ch-preset-direction-tile>svg,\.ch-preset-direction-tile>span \{ pointer-events:none; \}/);
  assert.doesNotMatch(css,/data-layout="compass"/);
});
