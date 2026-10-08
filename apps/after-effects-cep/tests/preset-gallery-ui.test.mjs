import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { createCepDocument } from './cep-dom.mjs';
import { createFakeWindow } from '../../../packages/ui-core/tests/fake-dom.mjs';

const built=await build({entryPoints:[fileURLToPath(new URL('../client/src/preset-gallery.ts',import.meta.url))],bundle:true,platform:'node',format:'esm',write:false});
const {createPresetGallery}=await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);

function fixture(t, { category = 'all', scope = 'all', query = '', locale = 'pt-BR', context = {hasComp:true, selectionCount:2, selectedKeys:4}, busy = false, personal, personalAction, onApply, pick = true } = {}) {
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
  const gallery=createPresetGallery(doc,{locale,navigation,busy,context:()=>context,openApplied(){},personal,personalAction,
    preferences:{snapshot:()=>preferences,toggleFolder(id){preferences.collapsedFolders=preferences.collapsedFolders.includes(id)?preferences.collapsedFolders.filter(item=>item!==id):[...preferences.collapsedFolders,id];},toggleFavorite(id){preferences.favorites=preferences.favorites.includes(id)?preferences.favorites.filter(item=>item!==id):[...preferences.favorites,id];}},
    apply(preset,settings,mode){applied.push({preset,settings,mode});onApply?.(preset,navigation);},edit(){}});
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

test('gallery invalid draft blocks button and double-click application until correction',t=>{
  const f=fixture(t),root=f.gallery.element;
  const preset=root.getElementsByTagName('button').find(n=>n.className.includes('ch-preset-apply'));
  preset.click();
  const intensity=root.getElementsByTagName('input').find(n=>n.getAttribute('aria-label')==='Intensidade · %');
  assert.ok(intensity);intensity.value='301';intensity.emit('input');
  assert.equal(intensity.value,'301');assert.equal(intensity.getAttribute('aria-invalid'),'true');
  assert.match(root.allText,/Use um número entre 0 e 300/);
  const bar=root.getElementsByTagName('div').find(n=>n.className==='ch-preset-applybar');
  assert.ok(bar.getElementsByTagName('button').every(n=>n.disabled));
  const preview=root.getElementsByTagName('button').find(n=>n.className==='ch-preset-preview');
  preview.emit('dblclick');assert.equal(f.applied.length,0);
  intensity.value='75';intensity.emit('input');assert.equal(intensity.getAttribute('aria-invalid'),'false');
  assert.ok(bar.getElementsByTagName('button').every(n=>!n.disabled));
  preview.emit('dblclick');assert.equal(f.applied.length,1);assert.equal(f.applied[0].settings.intensity,75);
});

test('application captures the actual grid position before the next scroll event and selects its target',t=>{
  const observed=[];
  const {gallery,navigation}=fixture(t,{onApply(preset,nav){observed.push({id:preset.id,selectedId:nav.selectedId,scroll:nav.scroll});}});
  const grid=gallery.element.querySelector('.ch-preset-grid');
  const cards=gallery.element.querySelectorAll('.ch-preset-card');
  const target=cards[23];
  grid.scrollTop=684;
  target.querySelector('.ch-preset-preview').emit('dblclick');
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

test('gallery keeps nondecimal drafts visible and never sends them to the host',t=>{
  const f=fixture(t),root=f.gallery.element;
  const intensity=root.getElementsByTagName('input').find(node=>node.getAttribute('aria-label')==='Intensidade · %');
  const apply=root.getElementsByTagName('button').find(node=>node.className.includes('ch-preset-primary-apply'));
  const preview=root.getElementsByTagName('button').find(node=>node.className==='ch-preset-preview');
  const original=f.navigation.drafts[f.navigation.selectedId].intensity;
  for(const value of ['0x20','0b10']){
    intensity.value=value;intensity.emit('input');
    assert.equal(intensity.value,value);
    assert.equal(intensity.getAttribute('aria-invalid'),'true');
    assert.equal(f.navigation.drafts[f.navigation.selectedId].intensity,original);
    assert.equal(apply.disabled,true);
    preview.emit('dblclick');apply.click();assert.equal(f.applied.length,0);
  }
  intensity.value='32';intensity.emit('input');apply.click();
  assert.equal(f.applied.length,1);assert.equal(f.applied[0].settings.intensity,32);
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
  assert.equal(doc.activeElement.dataset.scope,'favorites');
  key('ArrowDown');assert.equal(doc.activeElement.dataset.scope,'recent');
  key('ArrowDown');assert.equal(doc.activeElement.dataset.category,'signature');
  key('ArrowDown');assert.equal(doc.activeElement.dataset.category,'signature-essentials');
  key('ArrowLeft');assert.equal(doc.activeElement.dataset.category,'signature','Left on a child returns to its group');
  key('ArrowLeft');assert.deepEqual(preferences.collapsedFolders,['signature']);
  key('ArrowRight');assert.deepEqual(preferences.collapsedFolders,[]);
  key('End');assert.equal(doc.activeElement.dataset.category,'personal','a disabled Add folder is skipped');
  key('Home');assert.equal(doc.activeElement.dataset.scope,'favorites');
  key('ArrowUp');assert.equal(doc.activeElement.dataset.category,'personal','arrows wrap around');
});

test('a selected preset persists when closing settings or pressing Escape',t=>{
  const {gallery,navigation,doc}=fixture(t,{pick:false}),root=gallery.element;
  const editor=root.getElementsByTagName('section').find(node=>node.className==='ch-preset-editor');
  const bar=root.getElementsByTagName('div').find(node=>node.className==='ch-preset-applybar');
  assert.equal(navigation.selectedId,undefined);assert.equal(editor.hidden,true);assert.equal(bar.hidden,true);
  const title=root.getElementsByTagName('button').find(node=>node.className.includes('ch-preset-apply'));
  title.click();const selected=navigation.selectedId;
  assert.equal(editor.hidden,false);assert.equal(bar.hidden,false);
  assert.equal(root.getElementsByTagName('button').some(node=>node.getAttribute('aria-label')==='Fechar ajustes do preset'),false);
  title.focus();doc.emit('keydown',{key:'Escape'});
  assert.equal(navigation.selectedId,selected);assert.equal(editor.hidden,false);assert.equal(bar.hidden,false);
  assert.equal(doc.activeElement,title);
});

test('the selected preset inspector stays inline and keeps the exact draft during context refresh',t=>{
  const {gallery,context,navigation,doc}=fixture(t),root=gallery.element;
  const editor=root.getElementsByTagName('section').find(node=>node.className==='ch-preset-editor');
  const inspector=root.getElementsByTagName('section').find(node=>node.className==='ch-preset-inspector');
  const input=root.getElementsByTagName('input').find(node=>node.getAttribute('aria-label')==='Duração · frames');
  const apply=root.getElementsByTagName('button').find(node=>node.className.includes('ch-preset-primary-apply'));
  assert.equal(editor.hidden,false);assert.equal(editor.parentNode.className,'ch-preset-stage');
  assert.ok(navigation.selectedId);assert.ok(input);assert.equal(apply.allText,'Aplicar preset');
  input.value='42';input.emit('input');input.focus();
  context.selectionCount=0;gallery.updateContext();
  assert.equal(root.getElementsByTagName('section').find(node=>node.className==='ch-preset-inspector'),inspector);
  assert.equal(root.getElementsByTagName('input').find(node=>node.getAttribute('aria-label')==='Duração · frames'),input);
  assert.equal(input.value,'42');assert.equal(doc.activeElement,input);
  assert.equal(apply.disabled,true);assert.match(root.allText,/Nenhuma camada selecionada/);
  context.selectionCount=3;gallery.updateContext();
  assert.equal(apply.disabled,false);assert.match(root.allText,/3 camadas selecionadas/);
  assert.equal(input.value,'42');assert.equal(navigation.drafts[navigation.selectedId].durationFrames,42);
});

test('a missing composition or selection blocks both Apply and preview double-click',t=>{
  const {gallery,context,applied}=fixture(t,{context:{hasComp:false,selectionCount:0,selectedKeys:0}}),root=gallery.element;
  const apply=root.getElementsByTagName('button').find(node=>node.className.includes('ch-preset-primary-apply'));
  const preview=root.getElementsByTagName('button').find(node=>node.className==='ch-preset-preview');
  assert.equal(apply.disabled,true);assert.match(root.allText,/Abra uma composição/);
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

test('invalid draft remains visible and cannot be bypassed by losing and restoring selection',t=>{
  const {gallery,context,applied}=fixture(t),root=gallery.element;
  const intensity=root.getElementsByTagName('input').find(node=>node.getAttribute('aria-label')==='Intensidade · %');
  const apply=root.getElementsByTagName('button').find(node=>node.className.includes('ch-preset-primary-apply'));
  intensity.value='301';intensity.emit('input');
  context.selectionCount=0;gallery.updateContext();context.selectionCount=1;gallery.updateContext();
  assert.equal(intensity.value,'301');assert.equal(intensity.getAttribute('aria-invalid'),'true');assert.equal(apply.disabled,true);
  apply.click();assert.equal(applied.length,0);
  intensity.value='60';intensity.emit('input');apply.click();
  assert.equal(applied.length,1);assert.equal(applied[0].settings.intensity,60);
});


test('filter menu transfers focus on opening and reverses an unfinished closing animation',async t=>{
  const {gallery,doc}=fixture(t),root=gallery.element;
  const menu=root.getElementsByTagName('div').find(node=>node.className==='ch-preset-filter-menu');
  const trigger=root.getElementsByTagName('button').find(node=>node.className.includes('ch-preset-filter-trigger'));
  trigger.focus();trigger.click();
  assert.equal(menu.hidden,false);assert.equal(trigger.getAttribute('aria-expanded'),'true');
  assert.equal(doc.activeElement,menu.getElementsByTagName('button')[0],'keyboard navigation enters the menu that precedes its trigger in the DOM');
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
  const duration=inspector.getElementsByTagName('input').find(node=>node.getAttribute('aria-label')==='Duração · frames');
  duration.value='53';duration.emit('input');
  const chooseCategory=id=>root.getElementsByTagName('button').find(node=>node.dataset.category===id).click();
  chooseCategory('personal');
  assert.equal(editor.hidden,true);assert.equal(inspector.getElementsByTagName('input').length,0);
  assert.equal(inspector.getElementsByTagName('div').some(node=>node.className==='ch-preset-approved-heading'),false);
  assert.equal(navigation.selectedId,selected);assert.equal(navigation.drafts[selected].durationFrames,53);
  chooseCategory('all');
  assert.equal(editor.hidden,false,'returning restores the explicit selection');assert.equal(navigation.selectedId,selected);
  root.getElementsByTagName('button').find(node=>node.dataset.focusKey===`title.${selected}`).click();
  assert.equal(editor.hidden,false);assert.equal(navigation.selectedId,selected);
  assert.equal(inspector.getElementsByTagName('input').find(node=>node.getAttribute('aria-label')==='Duração · frames').value,'53');
});

test('unit and order updates preserve the open settings panel, focus and invalid draft',t=>{
  const {gallery,doc,navigation}=fixture(t,{category:'premium-text'}),root=gallery.element;
  root.getElementsByTagName('button').find(node=>node.dataset.focusKey==='title.builtin.motion.premium-glyph-ribbon').click();
  const panel=root.getElementsByTagName('section').find(node=>node.className==='ch-preset-settings-panel');
  const trigger=root.getElementsByTagName('button').find(node=>node.dataset.focusKey==='adjust.builtin.motion.premium-glyph-ribbon');
  const field=label=>root.getElementsByTagName('select').find(node=>node.getAttribute('aria-label')===label);
  const number=label=>root.getElementsByTagName('input').find(node=>node.getAttribute('aria-label')===label);
  trigger.click(); assert.equal(panel.hidden,false); assert.equal(panel.getAttribute('data-open'),'true');
  number('Intensidade · %').value='301';number('Intensidade · %').emit('input');
  const oldUnit=field('Dividir texto');oldUnit.focus();oldUnit.value='characters';oldUnit.emit('change');
  assert.notEqual(field('Dividir texto'),oldUnit,'dependent controls were rebuilt');
  assert.equal(panel.hidden,false); assert.equal(panel.getAttribute('data-open'),'true');assert.equal(doc.activeElement,field('Dividir texto'));
  assert.equal(number('Intensidade · %').value,'301');assert.equal(number('Intensidade · %').getAttribute('aria-invalid'),'true');
  const oldOrder=field('Ordem');oldOrder.focus();oldOrder.value='random';oldOrder.emit('change');
  assert.equal(panel.hidden,false); assert.equal(panel.getAttribute('data-open'),'true');assert.equal(doc.activeElement,field('Ordem'));
  assert.ok(number('Variação'),'random ordering exposes its editable seed');
  assert.equal(navigation.drafts[navigation.selectedId].unit,'characters');
  assert.equal(navigation.drafts[navigation.selectedId].order,'random');
  assert.equal(number('Intensidade · %').value,'301');
  assert.equal(root.getElementsByTagName('button').find(node=>node.className.includes('ch-preset-primary-apply')).disabled,true);
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

test('settings context updates preserve popup, focused invalid draft and disable the fixed action',t=>{
  const {gallery,context,navigation,doc}=fixture(t),root=gallery.element;
  root.getElementsByTagName('button').find(node=>node.dataset.focusKey==='adjust.builtin.motion.premium-arc-arrival').click();
  const panel=root.getElementsByTagName('section').find(node=>node.className==='ch-preset-settings-panel');
  const input=panel.getElementsByTagName('input').find(node=>node.getAttribute('aria-label')==='Intensidade · %');
  const apply=root.getElementsByTagName('button').find(node=>node.className.includes('ch-preset-primary-apply'));
  input.value='301';input.emit('input');input.focus();
  context.selectionCount=0;gallery.updateContext();context.selectionCount=5;gallery.updateContext();
  assert.equal(panel.getAttribute('data-open'),'true');assert.equal(panel.hidden,false);
  assert.equal(panel.getElementsByTagName('input').find(node=>node.getAttribute('aria-label')==='Intensidade · %'),input);
  assert.equal(doc.activeElement,input);assert.equal(input.value,'301');assert.equal(apply.disabled,true);
  input.value='80';input.emit('input');assert.equal(navigation.drafts[navigation.selectedId].intensity,80);assert.equal(apply.disabled,false);
});

test('Apply bar is outside the scrolling gallery and stays blocked while busy',t=>{
  const {gallery,applied}=fixture(t,{busy:true}),root=gallery.element;
  const scroll=root.getElementsByTagName('div').find(node=>node.className==='ch-preset-scroll');
  const bar=root.getElementsByTagName('div').find(node=>node.className==='ch-preset-applybar');
  assert.ok(scroll);assert.equal(bar.parentNode,scroll.parentNode);assert.equal(bar.parentNode,root);
  assert.equal(scroll.contains(bar),false);
  const apply=bar.getElementsByTagName('button').find(node=>node.className.includes('ch-preset-primary-apply'));
  assert.equal(apply.disabled,true);apply.click();assert.equal(applied.length,0);
});

test('primary phase keeps Both explicit across settings redraws and application',t=>{
  const {gallery,applied,navigation,doc}=fixture(t),root=gallery.element;
  const group=()=>root.getElementsByRole('radiogroup').find(node=>node.getAttribute('aria-label')==='Animação');
  assert.ok(group());assert.equal(root.getElementsByTagName('input').some(node=>node.type==='checkbox'),false);
  const both=group().getElementsByTagName('button')[2];both.click();
  assert.equal(navigation.drafts[navigation.selectedId].phase,'both');assert.equal(both.getAttribute('aria-checked'),'true');
  root.getElementsByTagName('button').find(node=>node.dataset.focusKey===`adjust.${navigation.selectedId}`).click();
  assert.equal(group().getElementsByTagName('button')[2].getAttribute('aria-checked'),'true');
  assert.equal(group().closest('.ch-preset-settings-panel'),null,'phase is always visible in the primary inspector');
  group().getElementsByTagName('button')[2].keydown('ArrowLeft');
  assert.equal(navigation.drafts[navigation.selectedId].phase,'out');assert.equal(doc.activeElement,group().getElementsByTagName('button')[1]);
  group().getElementsByTagName('button')[1].keydown('End');
  root.getElementsByTagName('button').find(node=>node.className.includes('ch-preset-primary-apply')).click();
  assert.equal(applied[0].settings.phase,'both');
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
  const duration=root.getElementsByTagName('input').find(node=>node.getAttribute('aria-label')==='Duração · frames');
  duration.value='53';duration.emit('input');
  const search=root.getElementsByTagName('input').find(node=>node.type==='search');
  const searchControl=root.getElementsByTagName('div').find(node=>node.className.includes('ch-preset-search'));
  searchControl.getElementsByTagName('button')[0].click();
  search.value='does-not-exist';search.emit('input');t.mock.timers.tick(250);
  assert.equal(navigation.selectedId,selected);assert.equal(navigation.drafts[selected].durationFrames,53);
  assert.equal(doc.activeElement,search);assert.equal(navigation.query,'does-not-exist');
  assert.match(root.allText,/Tente outro nome ou limpe os filtros/);
  root.getElementsByTagName('button').find(node=>node.textContent==='Ver todos os presets').click();
  assert.equal(root.getElementsByTagName('input').find(node=>node.type==='search'),search);
  assert.equal(doc.activeElement,search);assert.equal(search.value,'');
  assert.equal(navigation.selectedId,selected);assert.equal(navigation.drafts[selected].durationFrames,53);
  assert.equal(root.getElementsByTagName('input').find(node=>node.getAttribute('aria-label')==='Duração · frames').value,'53');
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
