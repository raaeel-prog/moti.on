import test from 'node:test';
import strictAssert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { createCepDocument, domSafeAssert } from './cep-dom.mjs';
const assert = domSafeAssert(strictAssert);
import { createFakeWindow } from '../../../packages/ui-core/tests/fake-dom.mjs';

const built=await build({entryPoints:[fileURLToPath(new URL('../client/src/preset-gallery.ts',import.meta.url))],bundle:true,platform:'node',format:'esm',write:false});
const {createPresetGallery,GALLERY_PRESETS,galleryCategoryMatches}=await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);

function fixture(t, { category = 'all', scope = 'all', query = '', locale = 'pt-BR', context = {hasComp:true, selectionCount:2, selectedKeys:4}, busy = false, personal, personalAction, onApply, pick = true, elements, width = 360, observer, layout, scroll = 0, revealId } = {}) {
  const saved={window:globalThis.window,requestAnimationFrame:globalThis.requestAnimationFrame,cancelAnimationFrame:globalThis.cancelAnimationFrame,IntersectionObserver:globalThis.IntersectionObserver,ResizeObserver:globalThis.ResizeObserver};
  globalThis.window=createFakeWindow(width);globalThis.window.setTimeout=setTimeout;
  globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=()=>{};
  globalThis.IntersectionObserver=observer??class {observe(){} unobserve(){} disconnect(){}};
  const doc=createCepDocument(),applied=[];
  const scheduled = new Map();
  const resizeDeliveries = new Map();
  let nextFrame = 1;
  const flushFrame = () => {
    const callbacks = [...scheduled.values()];
    scheduled.clear();
    for (const callback of callbacks) callback(performance.now());
  };
  const rowHeight = 110, gap = 8, padding = 2;
  const viewport = () => layout.height ?? 240;
  const columns = () => layout.columns ?? 2;
  if (layout) {
    globalThis.requestAnimationFrame = callback => { const id = nextFrame++; scheduled.set(id, callback); return id; };
    globalThis.cancelAnimationFrame = id => scheduled.delete(id);
    globalThis.window.getComputedStyle = () => ({
      gridTemplateColumns: Array(columns()).fill('150px').join(' '), gap: `${gap}px`, rowGap: `${gap}px`,
      paddingTop: `${padding}px`, paddingBottom: `${padding}px`,
    });
    globalThis.ResizeObserver = class {
      constructor(callback) { this.callback = callback; }
      observe(target) { resizeDeliveries.set(target, this.callback); }
      disconnect() {
        for (const [target, callback] of resizeDeliveries) if (callback === this.callback) resizeDeliveries.delete(target);
      }
    };
    doc.defaultView = globalThis.window;
  }
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
    if (layout && tag === 'div') {
      const isGrid = () => node.classList.contains('ch-preset-grid');
      Object.defineProperties(node, {
        clientHeight: { get: () => isGrid() ? viewport() : node.classList.contains('ch-preset-stage') ? viewport() + 44 : 0 },
        clientWidth: { get: () => isGrid() ? columns() * (150 + gap) - gap : 0 },
        scrollHeight: { get: () => {
          if (!isGrid()) return 0;
          const virtualRows = /^repeat\(\s*(\d+)/.exec(node.style['grid-template-rows'] ?? '');
          const rows = virtualRows ? Number(virtualRows[1]) : Math.ceil(node.querySelectorAll('.ch-preset-card').length / columns());
          return Math.max(viewport(), rows * (rowHeight + gap) - gap + 2 * padding);
        }},
      });
      const bounds = node.getBoundingClientRect;
      node.getBoundingClientRect = () => isGrid()
        ? {left:10, right:10 + node.clientWidth, top:10, bottom:10 + viewport(), width:node.clientWidth, height:viewport()}
        : bounds();
    }
    if (layout && tag === 'article') {
      node.getBoundingClientRect = () => {
        const grid = node.parentNode;
        const itemIndex = grid?.querySelectorAll('.ch-preset-card').indexOf(node) ?? 0;
        const row = Number(node.style['grid-row-start'] ?? Math.floor(itemIndex / columns()) + 1);
        const column = itemIndex % columns() + 1;
        const top = 10 + padding + (row - 1) * (rowHeight + gap) - (grid?.scrollTop ?? 0);
        const left = 10 + (column - 1) * (150 + gap);
        return {left, right:left + 150, top, bottom:top + rowHeight, width:150, height:rowHeight};
      };
      node.scrollIntoView = () => {
        const grid = node.parentNode;
        const card = node.getBoundingClientRect(), frame = grid.getBoundingClientRect();
        const delta = card.top < frame.top ? card.top - frame.top : Math.max(0, card.bottom - frame.bottom);
        grid.scrollTop = Math.max(0, Math.min(grid.scrollHeight - grid.clientHeight, grid.scrollTop + delta));
      };
    }
    return node;
  };
  doc.getElementById=id=>{
    const walk=node=>{if(node.id===id)return node;for(const child of node.children){const match=walk(child);if(match)return match;}return null;};
    return walk(doc.documentElement);
  };
  const navigation={query,category,scope,scroll};
  const preferences={favorites:[],recent:[],folderColors:{},collapsedFolders:[],presetAutoplay:false,presetSize:200};
  const gallery=createPresetGallery(doc,{locale,navigation,busy,context:()=>context,openApplied(){},personal,personalAction,revealId,...(elements?{elements}:{}),
    preferences:{snapshot:()=>preferences,toggleFolder(id){preferences.collapsedFolders=preferences.collapsedFolders.includes(id)?preferences.collapsedFolders.filter(item=>item!==id):[...preferences.collapsedFolders,id];},toggleFavorite(id){preferences.favorites=preferences.favorites.includes(id)?preferences.favorites.filter(item=>item!==id):[...preferences.favorites,id];},
      setFolderColor(id,color){const next={...preferences.folderColors};if(color)next[id]=color;else delete next[id];preferences.folderColors=next;},clearFolderColors(){preferences.folderColors={};},setPresetSize(value){preferences.presetSize=value;preferences.sizeWrites=(preferences.sizeWrites??0)+1;}},
    apply(preset,settings,mode){applied.push({preset,settings,mode});return onApply?.(preset,navigation);},edit(){}});
  doc.documentElement.appendChild(gallery.element);
  if (layout) { flushFrame(); flushFrame(); flushFrame(); }
  // Details appear only after a choice; most tests start from the user picking the first card.
  if(pick){gallery.element.getElementsByTagName('button').find(node=>node.className.includes('ch-preset-apply'))?.click();doc.documentElement.setAttribute('data-reduced-motion','true');doc.emit('keydown',{key:'Escape'});doc.documentElement.removeAttribute('data-reduced-motion');}
  t.after(()=>{gallery.dispose();Object.assign(globalThis,saved);});
  return {doc,navigation,gallery,applied,context,preferences,flushFrame,resizeGrid() {
    const target = gallery.element.querySelector('.ch-preset-grid');
    resizeDeliveries.get(target)?.([{target}]);
  }};
}

test('gallery search is always visible and retains its query without recreating the control',t=>{
 const f=fixture(t),control=f.gallery.element.querySelector('.ch-preset-search'),input=control.getElementsByTagName('input')[0];
 const buttons=control.getElementsByTagName('button'),clear=buttons.find(node=>node.classList.contains('ch-preset-search-clear'));
 assert.equal(buttons.length,2,'only clear and the label filter live inside the field');
 assert.equal(clear.hidden,true);
 input.focus();input.value='arco';input.emit('input');input.emit('blur');
 assert.equal(f.navigation.query,'arco');assert.equal(control.getElementsByTagName('input')[0]===input,true);
 assert.equal(clear.hidden,false);clear.click();
 assert.equal(f.navigation.query,'');assert.equal(input.value,'');assert.equal(clear.hidden,true);assert.equal(f.doc.activeElement,input);
});

test('collection path and count follow folders; clearing filters preserves the folder',t=>{
 const f=fixture(t,{category:'text-characters',query:'zzzzmissing',pick:false}),root=f.gallery.element;
 const path=()=>root.querySelector('.ch-preset-breadcrumb');
 assert.match(path().allText,/Tipografia/);assert.match(path().allText,/Caracteres/);
 assert.equal(root.querySelector('.ch-preset-result-count').textContent,'0 itens');
 root.getElementsByTagName('button').find(node=>node.className.includes('ch-preset-clear-filters')).click();
 assert.equal(f.navigation.category,'text-characters');assert.equal(f.navigation.query,'');
 assert.equal(root.querySelector('.ch-preset-result-count').textContent,`${root.querySelectorAll('.ch-preset-card').length} itens`);
 path().getElementsByTagName('button')[0].click();assert.equal(f.navigation.category,'text');
 assert.equal(f.doc.activeElement.dataset.focusKey,'path.text');assert.equal(f.applied.length,0);
});

test('selection summary identifies an applied candidate even when filters hide its card',async t=>{
 const f=fixture(t),root=f.gallery.element,name=root.querySelector('.ch-preset-selected-name').textContent;
 assert.notEqual(name,'Selecione um preset');assert.equal(root.querySelector('.ch-preset-selection-status').textContent,'2 camadas selecionadas');
 const search=root.getElementsByTagName('input').find(node=>node.type==='search');search.value='zzzzmissing';search.emit('input');
 await new Promise(resolve=>setTimeout(resolve,280));
 assert.equal(root.querySelectorAll('.ch-preset-card').length,0);assert.equal(root.querySelector('.ch-preset-selected-name').textContent,name);
 assert.equal(root.querySelector('.ch-preset-selection-status').textContent,'Seleção fora do filtro');assert.equal(f.applied.length,0);
});

test('context refresh never enables phase actions before a preset is selected',t=>{
 const f=fixture(t,{pick:false});f.gallery.updateContext();
 const phases=f.gallery.element.getElementsByTagName('button').filter(node=>node.dataset.phase);
 assert.equal(phases.length,3);assert.ok(phases.every(node=>node.disabled));assert.equal(f.applied.length,0);
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

test('the default gallery exposes every collection in its persistent sidebar',t=>{
 const {gallery,navigation}=fixture(t),root=gallery.element,sidebar=root.querySelector('.ch-preset-sidebar');
 assert.equal(navigation.category,'all');const cards=root.getElementsByTagName('article');assert.ok(cards.length>30);assert.ok(!cards.some(card=>card.id.startsWith('builtin.ease.')));assert.ok(cards.some(card=>card.id==='builtin.camera.pushIn'));
 const menu=root.querySelector('.ch-preset-filter-menu'),categories=root.querySelector('.ch-preset-categories');assert.equal(menu.hidden,false);assert.equal(sidebar.contains(categories),true);assert.equal(menu.getAttribute('data-open'),'true');
 assert.equal(sidebar.contains(root.querySelector('.ch-preset-search')),true);assert.equal(root.querySelector('.ch-preset-scroll').contains(sidebar),false);
});

test('thumbnail size lives in the fixed footer and the tree exposes a splitter',t=>{
 const {gallery}=fixture(t),root=gallery.element;const size=root.getElementsByTagName('input').find(node=>node.getAttribute('aria-label')==='Tamanho das miniaturas');
 assert.equal(root.querySelector('.ch-preset-reference-footer').contains(size),true);assert.equal(root.querySelector('.ch-preset-toolbar-approved').contains(size),false);
 assert.equal(root.getElementsByRole('separator').length,1);
});

test('category menu supports arrow, Home/End and fold keys',t=>{
  const {gallery,doc,preferences}=fixture(t),root=gallery.element;
  const menu=root.getElementsByTagName('div').find(node=>node.className==='ch-preset-filter-menu');
  menu.getElementsByTagName('button').find(node=>node.dataset.category==='elements').focus();
  const key=name=>menu.emit('keydown',{key:name,target:doc.activeElement});
  assert.equal(doc.activeElement.dataset.category,'elements');
  key('ArrowDown');assert.equal(doc.activeElement.dataset.category,'elements-shape');
  key('ArrowLeft');assert.equal(doc.activeElement.dataset.category,'elements','Left on a child returns to its group');
  key('ArrowLeft');assert.deepEqual(preferences.collapsedFolders,['elements']);
  key('ArrowRight');assert.deepEqual(preferences.collapsedFolders,[]);
  key('End');assert.equal(doc.activeElement.dataset.category,'personal','a disabled Add folder is skipped');
  key('Home');assert.equal(doc.activeElement.dataset.category,'all','Todos os presets opens the tree (design system 2026-11)');
  key('ArrowUp');assert.equal(doc.activeElement.dataset.category,'personal','arrows wrap around');
});

test('a selected preset persists when closing settings or pressing Escape',t=>{
  const {gallery,navigation,doc}=fixture(t,{pick:false}),root=gallery.element;
  const editor=root.getElementsByTagName('section').find(node=>node.className==='ch-preset-editor');
  const bar=root.getElementsByTagName('div').find(node=>node.className==='ch-preset-applybar');
  assert.equal(navigation.selectedId,undefined);assert.equal(editor.hidden,true);assert.equal(bar.hidden,false);
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

test('the persistent tree remains visible after Escape and pointer movement',async t=>{
 const {gallery,doc}=fixture(t),root=gallery.element,tree=root.querySelector('.ch-preset-filter-menu');
 const first=tree.getElementsByTagName('button').find(node=>node.className==='ch-folder-select');first.focus();doc.emit('keydown',{key:'Escape'});tree.emit('mouseleave');await new Promise(resolve=>setTimeout(resolve,240));
 assert.equal(tree.hidden,false);assert.equal(tree.getAttribute('data-open'),'true');assert.equal(doc.activeElement===first,true);
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
  assert.equal(editor.hidden,true,'a second click clears the choice and folds the box');assert.ok(navigation.selectedId);
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

test('variations open as a compact popover hanging under the card, as wide as it, without moving any card',t=>{
  const {gallery}=fixture(t),root=gallery.element;
  const grid=root.querySelector('.ch-preset-grid');
  const cards=grid.children.filter(node=>node.tagName==='article');
  const card=cards.find(node=>node.id==='builtin.motion.premium-arc-arrival');
  const order=cards.map(node=>node.id);
  card.getBoundingClientRect=()=>({left:40,right:200,top:100,bottom:220,width:160,height:120});
  grid.getBoundingClientRect=()=>({left:20,top:80,right:520,bottom:600,width:500,height:520});
  grid.scrollTop=30;
  const panel=root.getElementsByTagName('section').find(node=>node.className==='ch-preset-settings-panel');
  const trigger=card.getElementsByTagName('button').find(node=>node.dataset.focusKey===`adjust.${card.id}`);
  assert.equal(trigger.getAttribute('aria-label'),'Variações: '+trigger.getAttribute('aria-label').slice('Variações: '.length));
  assert.equal(trigger.getElementsByTagName('svg')[0]?.getAttribute('data-icon'),'variants','three plain lines, like a variant list');
  trigger.click();
  assert.equal(panel.parentNode,grid,'it lives in the grid and scrolls with it');
  assert.equal(panel.getAttribute('data-layout'),'popover');assert.equal(panel.getAttribute('data-side'),'below');
  assert.equal(panel.style.top,'170px','right under the card (220 - 80 + 30 scrolled)');
  assert.equal(panel.style.left,'20px');assert.equal(panel.style.width,'160px','as wide as the card');
  assert.deepEqual(grid.children.filter(node=>node.tagName==='article').map(node=>node.id),order,'no card moves');
  assert.equal(card.getAttribute('data-attached'),'below');
});

test('hover never opens or transfers a preset menu, and leaving keeps the clicked menu open',async t=>{
  const {gallery,doc,applied}=fixture(t),root=gallery.element;
  const trigger=root.getElementsByTagName('button').find(node=>node.dataset.focusKey==='adjust.builtin.motion.premium-arc-arrival');
  const panel=root.getElementsByTagName('section').find(node=>node.className==='ch-preset-settings-panel');
  const originalFocus=doc.activeElement;
  trigger.emit('mouseenter');await new Promise(resolve=>setTimeout(resolve,160));
  assert.equal(panel.getAttribute('data-open'),'false');
  assert.equal(doc.activeElement,originalFocus);
  trigger.click();const selected=root.getElementsByTagName('article').find(node=>node.getAttribute('data-selected')==='true').id;
  trigger.emit('mouseleave');panel.emit('mouseleave');
  const other=root.getElementsByTagName('button').find(node=>node.dataset.focusKey?.startsWith('adjust.')&&node!==trigger&&!node.hidden);
  other.emit('mouseenter');
  await new Promise(resolve=>setTimeout(resolve,220));
  assert.equal(panel.getAttribute('data-open'),'true');assert.equal(applied.length,0);
  assert.equal(root.getElementsByTagName('article').find(node=>node.getAttribute('data-selected')==='true').id,selected);
  assert.equal(other.getAttribute('aria-expanded'),'false');
});

test('clicking a card only selects it; direction choices open from its settings button',t=>{
  const {gallery,navigation,applied}=fixture(t,{pick:false}),root=gallery.element;
  const card=root.getElementsByTagName('article').find(node=>node.id==='builtin.motion.premium-arc-arrival');
  const button=cls=>card.getElementsByTagName('button').find(node=>node.className.includes(cls));
  const panel=root.getElementsByTagName('section').find(node=>node.className==='ch-preset-settings-panel');
  button('ch-preset-preview').click();assert.notEqual(panel.getAttribute('data-open'),'true');assert.equal(navigation.selectedId,card.id);
  button('ch-preset-apply').click();assert.notEqual(panel.getAttribute('data-open'),'true','the name selects too, without a popover');
  button('ch-preset-settings-trigger').click();assert.equal(panel.getAttribute('data-open'),'true');
  panel.getElementsByTagName('button').find(node=>node.dataset.direction==='right').click();
  button('ch-preset-preview').click();assert.equal(panel.getAttribute('data-open'),'false');assert.equal(navigation.selectedId,card.id);
  button('ch-preset-settings-trigger').click();assert.equal(panel.getElementsByTagName('button').find(node=>node.dataset.direction==='right').getAttribute('aria-pressed'),'true');
  assert.equal(applied.length,0);
});

test('library keeps search and folders beside the cards and exposes a keyboard splitter',t=>{
  const {gallery}=fixture(t,{pick:false}),root=gallery.element;
  const sidebar=root.querySelector('.ch-preset-sidebar');assert.ok(sidebar);
  assert.ok(sidebar.querySelector('input'));assert.ok(sidebar.querySelector('.ch-preset-categories'));
  const splitter=root.getElementsByRole('separator')[0];assert.ok(splitter);assert.equal(splitter.getAttribute('aria-orientation'),'vertical');
  const before=Number(splitter.getAttribute('aria-valuenow'));splitter.emit('keydown',{key:'ArrowLeft'});
  assert.equal(Number(splitter.getAttribute('aria-valuenow')),Math.max(120,before-8));
  const footer=root.querySelector('.ch-preset-reference-footer');assert.ok(footer);
  assert.ok(footer.querySelector('input'));assert.ok(footer.getElementsByTagName('button').find(node=>node.allText==='Ações de presets'));
  assert.equal(root.getAttribute('data-folder-picker'),'false','from 360 px the tree stays beside the cards');
});

test('with no preset chosen the footer asks once, and its status adds only a missing composition',t=>{
  const {gallery,context}=fixture(t,{pick:false}),root=gallery.element;
  const name=()=>root.querySelector('.ch-preset-selected-name').textContent,status=()=>root.querySelector('.ch-preset-selection-status').textContent;
  gallery.updateContext();
  assert.equal(name(),'Selecione um preset');assert.equal(status(),'','the status never repeats the name');
  const apply=root.querySelector('.ch-preset-reference-footer').getElementsByTagName('button').find(node=>node.dataset.phase==='in');
  assert.equal(apply.disabled,true);
  context.hasComp=false;gallery.updateContext();assert.equal(status(),'Abra uma composição');
  context.hasComp=true;root.getElementsByTagName('button').find(node=>node.className.includes('ch-preset-apply')).click();gallery.updateContext();
  assert.notEqual(name(),'Selecione um preset');assert.equal(status(),'2 camadas selecionadas','a chosen preset still reports the selection');
});

/** Narrow docks: the picker above the cards and the tree sheet it opens. */
function narrow(t, options = {}) {
  const f=fixture(t,{width:280,pick:false,...options}),root=f.gallery.element;
  return {...f,root,picker:root.querySelector('.ch-preset-folder-picker'),menu:root.querySelector('.ch-preset-filter-menu'),folder:id=>root.querySelector('.ch-preset-filter-menu').getElementsByTagName('button').find(node=>node.dataset.category===id)};
}

test('below 360 px the folder tree folds into a picker above the cards',t=>{
  const {root,picker,menu,navigation}=narrow(t,{category:'text-words'});
  assert.equal(root.getAttribute('data-folder-picker'),'true');
  assert.equal(root.querySelector('.ch-preset-browser-heading').contains(picker),true,'the picker takes the breadcrumb row above the grid');
  assert.equal(menu.hidden,true);assert.equal(menu.getAttribute('aria-hidden'),'true');
  assert.equal(picker.getAttribute('aria-expanded'),'false');assert.equal(picker.getAttribute('aria-controls'),menu.id);
  assert.equal(picker.getAttribute('aria-label'),'Pasta: Tipografia › Palavras');assert.equal(picker.title,'Tipografia › Palavras');
  assert.match(picker.allText,/Tipografia.*›.*Palavras/);
  assert.equal(navigation.sidebarWidth,undefined,'a narrow dock leaves the saved tree width alone');
});

test('the picker opens the same tree on the current folder and closes on a choice',t=>{
  const {doc,picker,menu,navigation,folder}=narrow(t);
  picker.click();
  assert.equal(picker.getAttribute('aria-expanded'),'true');assert.equal(menu.hidden,false);assert.equal(menu.getAttribute('data-open'),'true');
  assert.equal(doc.activeElement,folder('all'),'the current folder takes focus');
  menu.emit('keydown',{key:'ArrowDown',target:doc.activeElement});assert.equal(doc.activeElement,folder('motion'),'arrow keys walk the same tree');
  folder('text-words').click();
  assert.equal(navigation.category,'text-words');assert.equal(menu.hidden,true);assert.equal(picker.getAttribute('aria-expanded'),'false');
  assert.equal(doc.activeElement,picker,'focus returns to the picker');
  assert.equal(picker.getAttribute('aria-label'),'Pasta: Tipografia › Palavras');
  picker.click();assert.equal(doc.activeElement,folder('text-words'));
});

test('the tree sheet keeps folding and labels; Escape and focus leaving close it',t=>{
  const {doc,root,picker,menu,preferences}=narrow(t);
  picker.click();
  menu.getElementsByTagName('button').find(node=>node.className==='ch-folder-toggle'&&node.getAttribute('aria-expanded')==='true').click();
  assert.deepEqual(preferences.collapsedFolders,['motion'],'folding is the same preference as the sidebar');
  menu.emit('focusout',{relatedTarget:null});assert.equal(menu.hidden,false,'a redraw inside the sheet does not close it');
  menu.getElementsByTagName('button').find(node=>node.getAttribute('aria-label')==='Etiqueta e opções: Animações').click();
  doc.emit('keydown',{key:'Escape'});
  assert.equal(menu.getElementsByTagName('div').some(node=>node.className==='ch-folder-palette'),false,'Escape closes the label palette first');
  assert.equal(menu.hidden,false);
  doc.emit('keydown',{key:'Escape'});assert.equal(menu.hidden,true);assert.equal(doc.activeElement,picker);
  picker.click();menu.emit('focusout',{relatedTarget:root.querySelector('.ch-preset-search')});
  assert.equal(menu.hidden,true,'Tab out of the sheet closes it');assert.equal(picker.getAttribute('aria-expanded'),'false');
  picker.click();picker.emit('focusout',{relatedTarget:menu.getElementsByTagName('button')[0]});assert.equal(menu.hidden,false,'moving from the picker into the sheet keeps it');
  picker.emit('focusout',{relatedTarget:root.querySelector('.ch-preset-grid')});assert.equal(menu.hidden,true,'Tab from the picker into the cards closes it');
});

test('widening the panel brings the sidebar back at its saved width; narrowing folds it again',t=>{
  const {doc,root,picker,menu,navigation,preferences,folder}=narrow(t);
  preferences.gallery={category:'all',scope:'all',query:'',presetId:'',sidebarWidth:260};
  root.getBoundingClientRect=()=>({left:0,top:0,right:480,bottom:640,width:480,height:640});
  picker.click();picker.focus();
  globalThis.window.innerWidth=480;globalThis.window.emit('resize');
  assert.equal(root.getAttribute('data-folder-picker'),'false');assert.equal(menu.hidden,false);assert.equal(menu.getAttribute('data-open'),'true');
  assert.equal(picker.getAttribute('aria-expanded'),'false');
  assert.equal(root.getElementsByRole('separator')[0].getAttribute('aria-valuenow'),'260','the splitter returns at the saved width');
  assert.equal(doc.activeElement,folder('all'),'focus moves off the hidden picker to the same folder');
  globalThis.window.innerWidth=300;globalThis.window.emit('resize');
  assert.equal(root.getAttribute('data-folder-picker'),'true');assert.equal(menu.hidden,true);assert.equal(doc.activeElement,picker);
  assert.equal(navigation.sidebarWidth,260,'folding again keeps that width');
});

test('the variations popover is only the list of directions; a click keeps the choice without applying',t=>{
  const {gallery,navigation,applied}=fixture(t),root=gallery.element;
  root.getElementsByTagName('button').find(node=>node.dataset.focusKey==='adjust.builtin.motion.premium-arc-arrival').click();
  const panel=root.getElementsByTagName('section').find(node=>node.className==='ch-preset-settings-panel');
  const rows=panel.getElementsByTagName('button').filter(node=>node.className==='ch-preset-direction-option');
  assert.ok(rows.length>=2,'one row per direction');
  const left=rows.find(node=>node.dataset.direction==='left');
  left.emit('mouseenter');assert.notEqual(navigation.drafts[navigation.selectedId].direction,'left','hover does not commit');
  left.click();
  assert.equal(navigation.drafts[navigation.selectedId].direction,'left');assert.equal(left.getAttribute('aria-pressed'),'true');assert.equal(applied.length,0);
  assert.equal(panel.getElementsByTagName('button').some(node=>node.className==='ch-preset-directions-toggle'),false,'no "view all" link');
  assert.equal(panel.getElementsByTagName('button').some(node=>node.dataset.easing),false,'no character chips: only directions');
});

test('Escape and disposal cancel an unopened hover menu',async t=>{
  const {gallery,doc}=fixture(t),root=gallery.element;
  const trigger=root.getElementsByTagName('button').find(node=>node.dataset.focusKey==='adjust.builtin.motion.premium-arc-arrival');
  const panel=root.getElementsByTagName('section').find(node=>node.className==='ch-preset-settings-panel');
  trigger.emit('mouseenter');doc.emit('keydown',{key:'Escape'});
  await new Promise(resolve=>setTimeout(resolve,160));assert.equal(panel.hidden,true);
  trigger.emit('mouseenter');gallery.dispose();
  await new Promise(resolve=>setTimeout(resolve,160));assert.equal(panel.hidden,true);
});

test('a short viewport still opens the drawer below its row, and scrolling the grid never closes it',t=>{
  const {gallery}=fixture(t),root=gallery.element;
  globalThis.window.innerHeight=280;
  const card=root.getElementsByTagName('article').find(node=>node.id==='builtin.motion.premium-arc-arrival');
  card.getBoundingClientRect=()=>({left:40,right:200,top:180,bottom:220,width:160,height:40});
  const panel=root.getElementsByTagName('section').find(node=>node.className==='ch-preset-settings-panel');
  card.getElementsByTagName('button').find(node=>node.dataset.focusKey===`adjust.${card.id}`).click();
  assert.equal(panel.getAttribute('data-side'),'below','no flipping above: the drawer is part of the grid');
  const grid=root.querySelector('.ch-preset-grid');grid.emit('scroll');
  grid.scrollTop=100;grid.emit('scroll');assert.equal(panel.getAttribute('data-open'),'true','it scrolls with the cards');
});

test('Apply bar is outside the scrolling gallery and stays blocked while busy',t=>{
  const {gallery,applied}=fixture(t,{busy:true}),root=gallery.element;
  const scroll=root.getElementsByTagName('div').find(node=>node.className==='ch-preset-scroll');
  const bar=root.getElementsByTagName('div').find(node=>node.className==='ch-preset-applybar');
  assert.ok(scroll);assert.equal(bar.parentNode===root.querySelector('.ch-preset-reference-footer'),true);
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

test('transition double-click applies once and shares one real operation lock with the phase buttons',async t=>{
  let resolve;
  const {gallery,applied}=fixture(t,{onApply:()=>new Promise(done=>{resolve=done;})}),root=gallery.element;
  const phase=value=>root.getElementsByTagName('button').find(node=>node.dataset.phase===value);
  root.querySelector('.ch-preset-preview').emit('dblclick');assert.equal(applied.length,1);
  assert.equal(phase(applied[0].settings.phase).getAttribute('aria-busy'),'true');
  assert.equal(phase('both').getAttribute('data-button-size'),'24');
  root.querySelector('.ch-preset-preview').emit('dblclick');phase('both').click();phase('in').keydown('Enter');
  assert.equal(applied.length,1,'nothing else starts while the double-click apply runs');
  resolve({ok:false,message:'Host refused the target'});await Promise.resolve();
  phase('both').click();phase('in').click();phase('both').keydown('Enter');
  assert.equal(applied.length,2);assert.equal(phase('both').getAttribute('aria-busy'),'true');
  resolve({ok:false,message:'Host refused the target'});await Promise.resolve();
  assert.equal(phase('both').parentNode.getAttribute('data-state'),'error');
  assert.equal(phase('both').disabled,false);assert.equal(phase('in').disabled,false);
  phase('out').click();assert.equal(applied.length,3);
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
  search.focus();
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

test('even a diagonal recipe lists four sides under Original, and nothing else is offered before applying',t=>{
  const {gallery,navigation,applied}=fixture(t),panel=openSettings(gallery.element,'momentum-push');
  const list=panel.getElementsByTagName('div').find(node=>node.className==='ch-preset-direction-list');
  assert.deepEqual(list.children.map(node=>node.dataset.direction),['preset','bottom','left','right','top']);
  list.children.find(node=>node.dataset.direction==='top').click();
  assert.equal(navigation.drafts['builtin.motion.momentum-push'].direction,'top');assert.equal(applied.length,0);
  assert.equal(list.children.find(node=>node.dataset.direction==='preset').getAttribute('aria-pressed'),'false');
  assert.equal(panel.getElementsByTagName('input').length+panel.getElementsByTagName('select').length,0,'duration, intensity, curve and motion blur live in Edit');
  assert.doesNotMatch(panel.allText,/Restaurar padrão|Salvar como variação|Refinar movimento|Ver todas/);
});
test('a reveal keeps the four sides of its wipe, listed under Original',t=>{
  const {gallery,navigation}=fixture(t),panel=openSettings(gallery.element,'reveal-curtain');
  const grid=panel.getElementsByTagName('div').find(node=>node.className==='ch-preset-direction-list');
  assert.deepEqual(grid.children.map(node=>node.dataset.direction),['preset','bottom','left','right','top']);
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
  assert.equal(card.getAttribute('data-selected'),'true');assert.equal(navigation.selectedId,selected);assert.equal(editor.hidden,true);
});

test('a preset with no direction to choose has no variations button',t=>{
  const {gallery}=fixture(t),root=gallery.element;
  for(const card of root.getElementsByTagName('article')){
    const trigger=card.getElementsByTagName('button').find(node=>node.dataset.focusKey===`adjust.${card.id}`);
    if(!trigger||trigger.hidden)continue;
    trigger.click();
    const panel=root.getElementsByTagName('section').find(node=>node.className==='ch-preset-settings-panel');
    const hasList=panel.getElementsByTagName('div').some(node=>node.className==='ch-preset-direction-list');
    const hint=panel.getElementsByTagName('button').some(node=>/Editar/.test(node.allText??''));
    assert.ok(hasList||hint,`${card.id} opens an empty popover`);
    trigger.click();
  }
});

test('the Elements folder lives in Presets and inserts through the gallery action bar',async t=>{
  const inserted=[];
  const f=fixture(t,{pick:false,elements:{execute:async args=>{inserted.push(args);return {protocolVersion:1,requestId:'e',ok:true,data:{},warnings:[],error:null};},error:()=> 'erro'}});
  const folder=f.gallery.element.getElementsByTagName('button').find(node=>node.dataset?.category==='elements-lower-third');
  assert.ok(folder,'Elementos › Tarjas is a gallery folder');
  folder.click();
  assert.equal(f.navigation.category,'elements-lower-third');
  const cards=f.gallery.element.getElementsByTagName('button').filter(node=>node.id.startsWith('element-'));
  assert.deepEqual(cards.slice(0,3).map(c=>c.id),['element-lt-bar','element-lt-line','element-lt-tag'],'the three originals lead the folder');
  assert.ok(cards.length>3&&cards.every(c=>c.id.startsWith('element-lt-')),'only lower thirds, families included');
  assert.equal(f.gallery.element.getElementsByTagName('button').filter(node=>node.className?.includes?.('ch-preset-apply')).length,0,'no motion presets mixed in');
  cards[0].click();
  f.gallery.element.getElementsByTagName('button').find(node=>node.id==='elements-insert').click();
  for(let i=0;i<4;i++)await Promise.resolve();
  assert.deepEqual(inserted,[{elementId:'lt-bar'}]);
  const all=f.gallery.element.getElementsByTagName('button').find(node=>node.dataset?.category==='elements');
  all.click();
  assert.ok(f.gallery.element.getElementsByTagName('button').filter(node=>node.id.startsWith('element-')).length>cards.length,'Elements shows every kind, not only lower thirds');
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

test('clicking the selected card again clears the selection, while a double-click applies and keeps it',async t=>{
  const {gallery,navigation,applied}=fixture(t,{pick:false}),root=gallery.element;
  const card=root.getElementsByTagName('article').find(node=>node.id==='builtin.motion.premium-arc-arrival');
  const view=card.getElementsByTagName('button').find(node=>node.className.includes('ch-preset-preview'));
  const wait=ms=>new Promise(done=>setTimeout(done,ms));
  view.click();assert.equal(navigation.selectedId,card.id);
  view.click();assert.equal(navigation.selectedId,card.id,'the selection waits for a possible second click');
  await wait(350);assert.ok(!navigation.selectedId,'a lone second click deselects');assert.equal(card.getAttribute('data-selected'),'false');
  view.click();view.click();view.emit('dblclick');
  await wait(350);assert.equal(navigation.selectedId,card.id,'a double-click on a new card selects and applies');assert.equal(applied.length,1);
  view.click();view.click();view.emit('dblclick');
  await wait(350);assert.equal(navigation.selectedId,card.id,'a double-click on the selected card keeps it selected');
});

test('folder "…" menu follows the Composer: Focus Folder, eight labels with No label first, Clear all labels',t=>{
  const f=fixture(t,{pick:false,width:720}),root=f.gallery.element;
  const buttons=()=>root.getElementsByTagName('button');
  const more=label=>buttons().find(node=>node.getAttribute('aria-label')===`Etiqueta e opções: ${label}`);
  const row=id=>buttons().find(node=>node.className==='ch-folder-select'&&node.dataset.category===id)?.parentNode;
  more('Animações').click();
  const menu=root.getElementsByTagName('div').find(node=>node.className==='ch-folder-palette');
  assert.ok(menu,'the menu opens under the folder');
  const swatches=menu.getElementsByTagName('button').filter(node=>node.className==='ch-folder-swatch');
  assert.deepEqual(swatches.map(node=>node.getAttribute('aria-label')),['Sem etiqueta','Vermelho','Amarelo','Verde','Verde-água','Azul','Roxo','Magenta']);
  assert.equal(swatches[0].getAttribute('aria-checked'),'true','folders ship without a label');
  swatches[1].click();
  assert.deepEqual(f.preferences.folderColors,{motion:'red'});
  assert.equal(row('motion').dataset.color,'red');assert.equal(row('motion-2d').dataset.color,'red','children inherit the label');
  assert.equal(root.getElementsByTagName('div').some(node=>node.className==='ch-folder-palette'),false,'choosing a label closes the menu');
  more('Tipografia').click();
  root.getElementsByTagName('button').find(node=>node.className==='ch-folder-menu-item'&&node.textContent==='Limpar todas as etiquetas').click();
  assert.deepEqual(f.preferences.folderColors,{});assert.equal(row('motion').dataset.color,undefined);
  more('Animações').click();
  root.getElementsByTagName('button').find(node=>node.className==='ch-folder-menu-item'&&node.textContent==='Focar pasta').click();
  assert.equal(f.navigation.focusFolder,'motion');assert.equal(f.navigation.category,'motion');
  assert.equal(root.querySelector('.ch-folder-focus-path').textContent,'Animações');
  assert.ok(row('motion-3d'),'the focused folder lists its children');assert.equal(row('text'),undefined,'other roots are hidden');
  buttons().find(node=>node.getAttribute('aria-label')==='Mostrar todos os itens').click();
  assert.equal(f.navigation.focusFolder,undefined);assert.ok(row('text'),'Show all items restores the tree');
});

test('autoplay starts a rendered preview only once its card is in view, always from the first frame of its cycle',async t=>{
 const observers=[];
 class Recorder{constructor(callback,options){this.callback=callback;this.options=options;this.targets=[];observers.push(this);}observe(node){this.targets.push(node);}disconnect(){}}
 const f=fixture(t,{category:'text',pick:false,observer:Recorder});f.preferences.presetAutoplay=true;
 const view_=observers.find(o=>!o.options.rootMargin),ahead=observers.find(o=>o.options.rootMargin);
 assert.deepEqual(view_.options.threshold,[0,0.5],'a card shows its still at once and plays once half of it shows');
 const card=view_.targets.find(node=>node.dataset.previewId&&!node.dataset.previewId.includes('--'));assert.ok(card,'a text card with a render');
 const still=()=>card.getElementsByTagName('img').find(node=>node.className==='ch-preset-media');
 const player=()=>card.getElementsByTagName('canvas').find(node=>node.className==='ch-preset-player');
 const fire=(observer,ratio)=>observer.callback([{target:card,isIntersecting:ratio>0,intersectionRatio:ratio}]);
 assert.ok(still(),'the still is on the card from the start, so scrolling never meets an empty card');
 assert.equal(still().loading,'lazy');assert.equal(card.dataset.loading,'true','a skeleton shows until the still has loaded');
 still().emit('load');assert.equal(card.dataset.loading,undefined);
 fire(ahead,1);assert.equal(player(),undefined,'near the view it waits on its still');
 fire(view_,.3);assert.equal(player(),undefined,'peeking in at the edge it still waits');
 fire(view_,1);const first=player();assert.ok(first,'in view it plays');assert.equal(card.dataset.media,'true');
 fire(view_,0);fire(view_,1);assert.equal(player(),first,'grazing the edge keeps its cycle');
 fire(view_,0);await new Promise(done=>setTimeout(done,1000));
 assert.equal(player(),undefined,'once it has really left it is rewound to its still');
 fire(view_,1);const again=player();assert.ok(again,'back in view it plays again');assert.notEqual(again,first,'from a fresh start, not where it stopped');
});

test('thumbnail size slider resizes the grid while dragging and saves the preference only on release',t=>{
  const f=fixture(t),root=f.gallery.element;
  const size=root.getElementsByTagName('input').find(node=>node.type==='range');
  const grid=root.querySelector('.ch-preset-grid');
  const frames=[];globalThis.requestAnimationFrame=callback=>{frames.push(callback);return frames.length;};
  for(const value of ['220','260','300']){size.value=value;size.emit('input');}
  assert.equal(frames.length,1,'three drag steps in one frame schedule a single grid update');
  assert.equal(Number(size.style['--ch-slider-fraction']), (300-140)/(320-140));
  assert.equal(f.preferences.sizeWrites??0,0,'dragging never writes the preference');
  frames.shift()();
  assert.equal(grid.style['--preview-size'],'300px');
  assert.equal(root.style['--preview-size'],undefined,'the size lives on the grid only, so the gallery subtree is not restyled');
  size.emit('change');
  assert.equal(f.preferences.sizeWrites,1);assert.equal(f.preferences.presetSize,300);
  size.emit('change');
  assert.equal(f.preferences.sizeWrites,1,'a release without a new drag does not write again');
});

test('favorite toggle outside the favorites filter updates the star in place without rebuilding cards',t=>{
  const {gallery,navigation}=fixture(t),root=gallery.element;
  const id=navigation.selectedId;
  const card=()=>root.getElementsByTagName('article').find(node=>node.id===id);
  const before=card(),star=before.getElementsByTagName('button').find(node=>node.dataset.focusKey==='favorite.'+id);
  star.click();
  assert.equal(card()===before,true,'the card node survives the toggle');
  assert.equal(star.getAttribute('aria-pressed'),'true');assert.equal(star.dataset.pop,'true');
  star.click();
  assert.equal(card()===before,true);assert.equal(star.getAttribute('aria-pressed'),'false');assert.equal(star.dataset.pop,undefined);
});

const browsablePresets = GALLERY_PRESETS.filter(preset => !preset.motion?.retired);

test('only nearby rows mount across large scrolls, while Home and End reach the logical catalog bounds', t => {
  const observers = [];
  class Observer {
    constructor() { this.targets = new Set(); observers.push(this); }
    observe(target) { this.targets.add(target); }
    unobserve(target) { this.targets.delete(target); }
    disconnect() { this.targets.clear(); }
  }
  const {gallery, doc, navigation, flushFrame} = fixture(t, {layout: {}, pick: false, observer: Observer});
  const root = gallery.element, grid = root.querySelector('.ch-preset-grid');
  const cards = () => grid.querySelectorAll('.ch-preset-card');
  const visibleAt = top => cards().find(card => card.id === browsablePresets[Math.floor(top / 118) * 2].id);
  assert.equal(root.querySelector('.ch-preset-result-count').textContent, `${browsablePresets.length} itens`);
  assert.ok(cards().length >= 4 && cards().length <= 18, 'DOM follows the viewport, not the catalog');
  const first = cards()[0];
  const firstPreview = first.querySelector('.ch-preset-preview');
  assert.equal(first.id, browsablePresets[0].id);
  assert.ok(grid.scrollHeight > 20000, 'distant unmounted rows still contribute to the scroll extent');
  assert.ok(observers.every(observer => observer.targets.has(firstPreview)));

  grid.scrollTop = 4000;
  grid.emit('scroll');
  grid.scrollTop = 9000;
  grid.emit('scroll');
  flushFrame();
  assert.equal(navigation.scroll, 9000);
  assert.ok(visibleAt(9000), 'the frame mounts the last requested position');
  assert.ok(!visibleAt(4000) && !cards().includes(first));
  assert.ok(cards().length <= 18);
  assert.ok(observers.every(observer => !observer.targets.has(firstPreview)), 'detached views leave both preview observers');

  const middle = visibleAt(9000).querySelector('.ch-preset-preview');
  middle.focus();
  middle.keydown('End');
  flushFrame();
  const last = browsablePresets.at(-1);
  assert.equal(navigation.selectedId, last.id);
  assert.equal(doc.activeElement.closest('.ch-preset-card').id, last.id);
  assert.ok(cards().length <= 18);
  assert.ok(grid.scrollTop > 20000);

  doc.activeElement.keydown('Home');
  flushFrame();
  assert.equal(navigation.selectedId, first.id);
  assert.equal(doc.activeElement.closest('.ch-preset-card').id, first.id);
  assert.ok(grid.scrollTop <= 2);
});

test('changing the number of columns updates vertical keyboard navigation', t => {
  const layout = {columns: 2};
  const {gallery, doc, navigation, flushFrame, resizeGrid} = fixture(t, {layout, pick: false});
  const grid = gallery.element.querySelector('.ch-preset-grid');
  const first = grid.querySelector('.ch-preset-preview');
  const oldExtent = grid.scrollHeight;
  first.focus();
  first.keydown('ArrowDown');
  assert.equal(navigation.selectedId, browsablePresets[2].id);

  layout.columns = 1;
  resizeGrid();
  flushFrame();
  assert.ok(grid.scrollHeight > oldExtent, 'each card now takes its own row');
  doc.activeElement.keydown('ArrowDown');
  assert.equal(navigation.selectedId, browsablePresets[3].id);
});

test('Tab and Shift+Tab follow the catalog when the neighboring card is unmounted', t => {
  const {gallery, doc, navigation, flushFrame} = fixture(t, {layout: {}, pick: false});
  const grid = gallery.element.querySelector('.ch-preset-grid');
  const cards = () => grid.querySelectorAll('.ch-preset-card');
  grid.scrollTop = 9000;
  grid.emit('scroll');
  flushFrame();

  const first = cards()[0], last = cards().at(-1);
  const indexOf = card => browsablePresets.findIndex(preset => preset.id === card.id);
  for (const [card, shiftKey, current, next, direction] of [
    [last, false, '.ch-preset-favorite', '.ch-preset-preview', 1],
    [first, true, '.ch-preset-preview', '.ch-preset-favorite', -1],
  ]) {
    const expected = browsablePresets[indexOf(card) + direction].id;
    const control = card.querySelector(current);
    control.focus();
    assert.ok(!cards().some(item => item.id === expected));
    assert.equal(control.keydown('Tab', {shiftKey}).defaultPrevented, true);
    assert.equal(doc.activeElement.closest('.ch-preset-card').id, expected);
    assert.equal(doc.activeElement.classList.contains(next.slice(1)), true);
    assert.equal(navigation.selectedId, undefined, 'Tab moves focus without selecting');
  }
});

test('the virtual search retains its input and shows the full filtered count after the debounce', async t => {
  const {gallery, doc, navigation, flushFrame} = fixture(t, {layout: {}, pick: false});
  const root = gallery.element, grid = root.querySelector('.ch-preset-grid');
  const count = () => root.querySelector('.ch-preset-result-count').textContent;
  const cards = () => grid.querySelectorAll('.ch-preset-card');
  const search = root.querySelector('.ch-preset-search').getElementsByTagName('input')[0];
  const text = preset => `${preset.displayName['pt-BR'] ?? preset.id} ${preset.tags}`;
  const matching = browsablePresets.filter(preset => text(preset).normalize('NFD').toLowerCase().includes('a'));
  search.focus();
  search.value = 'A';
  search.emit('input');
  assert.equal(navigation.query, 'A');
  assert.equal(count(), `${browsablePresets.length} itens`, 'the old results stay mounted during the debounce');
  await new Promise(resolve => setTimeout(resolve, 275));
  flushFrame();
  assert.equal(count(), `${matching.length} itens`);
  assert.ok(cards().length < matching.length);
  assert.deepEqual(cards().map(card => card.id), matching.slice(0, cards().length).map(preset => preset.id));
  assert.equal(doc.activeElement, search);

  root.querySelector('.ch-preset-clear-filters').click();
  flushFrame();
  assert.equal(count(), `${browsablePresets.length} itens`);
  assert.ok(cards().length <= 18);
  assert.equal(doc.activeElement, search);
});

test('changing to a folder reuses overlapping preset cards and preserves their state', t => {
  const {gallery, navigation, flushFrame} = fixture(t, {layout: {}, pick: false});
  const root = gallery.element, grid = root.querySelector('.ch-preset-grid');
  const first = grid.querySelector('.ch-preset-card');
  const firstPreset = browsablePresets[0];
  const category = ['text', 'motion', 'transitions'].find(id => galleryCategoryMatches(id, firstPreset));
  assert.ok(category, 'the leading preset belongs to a folder in the tree');
  const folder = id => root.querySelectorAll('.ch-folder-select').find(item => item.dataset.category === id);
  const star = first.querySelector('.ch-preset-favorite');
  star.click();
  folder(category).click();
  flushFrame();
  const results = browsablePresets.filter(preset => galleryCategoryMatches(category, preset));
  assert.equal(navigation.category, category);
  assert.equal(root.querySelector('.ch-preset-result-count').textContent, `${results.length} itens`);
  assert.equal(grid.querySelector('.ch-preset-card'), first);
  assert.equal(star.getAttribute('aria-pressed'), 'true');

  folder(category === 'text' ? 'motion' : 'text').click();
  flushFrame();
  assert.ok(!grid.contains(first), 'a disjoint folder detaches the card');
  folder('all').click();
  flushFrame();
  assert.equal(grid.querySelector('.ch-preset-card'), first, 'returning remounts its cached node');
  assert.equal(star.getAttribute('aria-pressed'), 'true');
});

test('the delegated card menu toggles a favorite in place and returns focus to its star', t => {
  const {gallery, doc, preferences} = fixture(t, {layout: {}, pick: false});
  const grid = gallery.element.querySelector('.ch-preset-grid');
  const card = grid.querySelector('.ch-preset-card');
  const star = card.querySelector('.ch-preset-favorite');
  const event = card.querySelector('.ch-preset-preview').emit('contextmenu', {clientX: 60, clientY: 40});
  assert.equal(event.defaultPrevented, true);
  const menu = doc.body.querySelectorAll('.ch-context-menu')[0];
  assert.ok(menu, 'right-click reaches the grid and opens the preset actions');
  menu.getElementsByTagName('button').find(node => node.dataset.id === 'favorite').click();
  assert.deepEqual(preferences.favorites, [card.id]);
  assert.equal(grid.querySelector('.ch-preset-card'), card);
  assert.equal(star.getAttribute('aria-pressed'), 'true');
  assert.equal(doc.activeElement, star);
});

test('a virtual scroll keeps the open variations drawer attached and returns focus on Escape', t => {
  const {gallery, doc, navigation, flushFrame} = fixture(t, {layout: {}, pick: false});
  const root = gallery.element, grid = root.querySelector('.ch-preset-grid');
  const cards = () => grid.querySelectorAll('.ch-preset-card');
  const anchor = cards().find(card => !card.querySelector('.ch-preset-settings-trigger').hidden);
  assert.ok(anchor, 'at least one visible preset has variations');
  const trigger = anchor.querySelector('.ch-preset-settings-trigger');
  trigger.click();
  const drawer = root.querySelector('.ch-preset-settings-panel');
  assert.equal(drawer.hidden, false);
  assert.equal(drawer.parentNode, grid);
  assert.equal(trigger.getAttribute('aria-expanded'), 'true');
  assert.ok(drawer.contains(doc.activeElement));
  const selected = doc.activeElement;

  grid.scrollTop = 9000;
  grid.emit('scroll');
  flushFrame();
  assert.equal(navigation.scroll, 9000);
  assert.ok(cards().includes(anchor) && cards().length <= 18);
  assert.equal(root.querySelector('.ch-preset-settings-panel'), drawer);
  assert.equal(doc.activeElement, selected);
  assert.equal(trigger.getAttribute('aria-expanded'), 'true');

  doc.emit('keydown', {key: 'Escape'});
  assert.equal(doc.activeElement, trigger);
  assert.equal(trigger.getAttribute('aria-expanded'), 'false');
});

test('a virtual remount restores its saved offset and can reveal a preset outside that window', async t => {
  await t.test('restores the saved offset', child => {
    const {gallery, navigation} = fixture(child, {layout: {}, pick: false, scroll: 9000});
    const grid = gallery.element.querySelector('.ch-preset-grid');
    assert.equal(navigation.scroll, 9000);
    assert.equal(grid.scrollTop, 9000);
    assert.ok(grid.querySelectorAll('.ch-preset-card').some(card => card.id === browsablePresets[Math.floor(9000 / 118) * 2].id));
    assert.ok(grid.querySelectorAll('.ch-preset-card').length <= 18);
  });
  await t.test('reveal reaches the last preset', child => {
    const revealId = browsablePresets.at(-1).id;
    const {gallery, navigation} = fixture(child, {layout: {}, pick: false, scroll: 9000, revealId});
    const grid = gallery.element.querySelector('.ch-preset-grid');
    assert.equal(navigation.selectedId, revealId);
    assert.equal(navigation.pendingRevealId, undefined);
    assert.ok(grid.scrollTop > 20000);
    assert.ok(grid.querySelectorAll('.ch-preset-card').some(card => card.id === revealId));
    assert.ok(grid.querySelectorAll('.ch-preset-card').length <= 18);
  });
});
