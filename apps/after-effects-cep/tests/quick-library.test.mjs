import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { createFakeDocument } from '../../../packages/ui-core/tests/fake-dom.mjs';

const built = await build({entryPoints: [fileURLToPath(new URL('../client/src/quick-library.ts', import.meta.url))], bundle: true, platform: 'node', format: 'esm', write: false});
const { createQuickLibrary } = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);

function fixture(t, width = 360, overrides = {}) {
  t.mock.timers.enable({apis: ['setTimeout']});
  const doc = createFakeDocument({clientWidth: width});
  const {documentView, ...libraryOverrides} = overrides;
  if (documentView) doc.defaultView = documentView;
  const create = doc.createElement;
  doc.createElement = tag => {
    const node = create(tag);
    node.style = {};
    node.classList = {add: name => { node.className += ` ${name}`; }};
    node.offsetWidth = 100;
    node.offsetHeight = 24;
    node.getBoundingClientRect = () => ({left: 120, top: 200, width, height: 600});
    return node;
  };
  const navigation = {category: 'all', scope: 'all', query: '', scroll: 0};
  const library = createQuickLibrary(doc, {
    items: ['clean', 'wiggle'].map(id => ({id, name: id, description: 'Description', aliases: '', category: 'all', interaction: 'configure', reason: null, edit() {}, run() {}})),
    categories: [], navigation,
    preferences: {snapshot: () => ({favorites: [], recent: []})}, locale: 'pt-BR',
    anchor: doc.createElement('section'), onNavigate() {}, ...libraryOverrides
  });
  t.after(() => library.dispose());
  function find(id, node = library.element) {
    if (node.id === id) return node;
    for (const child of node.children) { const result = find(id, child); if (result) return result; }
  }
  const tool = find('library-tool-clean');
  if (tool) tool.getBoundingClientRect = () => ({left: 160, top: 350, right: 204, bottom: 394, width: 44, height: 44});
  return {doc, navigation: overrides.navigation ?? navigation, library, tool, tooltip: find('library-tooltip'), find};
}

test('restores scroll synchronously when the document has no animation frame API', t => {
  const navigation = {category: 'all', scope: 'all', query: '', scroll: 92};
  const {library} = fixture(t, 360, {navigation});
  const grid = library.element.getElementsByTagName('div').find(node => node.className === 'ch-tool-grid');
  assert.equal(grid.scrollTop, 92);
  assert.equal(navigation.scroll, 92);
});

test('restores scroll after two frames and cancels stale restoration on scroll or disposal', t => {
  const frames = new Map();
  let nextFrame = 0;
  const view = {
    addEventListener() {}, removeEventListener() {},
    requestAnimationFrame(callback) { const id = ++nextFrame; frames.set(id, callback); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },
    flush() { const pending = [...frames.values()]; frames.clear(); for (const callback of pending) callback(0); }
  };
  const navigation = {category: 'all', scope: 'all', query: '', scroll: 92};
  const {library} = fixture(t, 360, {navigation, documentView: view});
  const grid = library.element.getElementsByTagName('div').find(node => node.className === 'ch-tool-grid');
  assert.equal(grid.scrollTop, undefined);
  view.flush();
  assert.equal(grid.scrollTop, undefined);
  view.flush();
  assert.equal(grid.scrollTop, 92);

  navigation.scroll = 75;
  library.update([]);
  grid.scrollTop = 18;
  grid.emit('scroll');
  view.flush(); view.flush();
  assert.equal(grid.scrollTop, 18);
  assert.equal(navigation.scroll, 18);

  navigation.scroll = 51;
  library.update([]);
  library.dispose();
  view.flush(); view.flush();
  assert.equal(grid.scrollTop, 18);
  assert.equal(navigation.scroll, 51);
});

test('hover shows a legible name outside its icon tile', t => {
  const {tool, tooltip} = fixture(t);
  tool.emit('mouseenter');
  t.mock.timers.tick(250);
  assert.equal(tooltip.style.left, '132px');
  assert.equal(tooltip.style.top, '320px');
  assert.equal(tooltip.style.width, '');
  assert.equal(tooltip.style.height, '');
  assert.equal(tooltip.style.transformOrigin, '50px bottom');
  // Nome e, abaixo, o que a ferramenta faz e o que o clique faz.
  assert.equal(tooltip.children.length, 2);
  assert.equal(tooltip.children[0].allText, 'clean');
  assert.equal(tooltip.children[1].allText, 'Description · Abrir ajustes');
  assert.equal(tooltip.hidden, false);
  assert.equal(tool.getAttribute('aria-describedby'), tooltip.id);
});

for (const width of [280, 360, 480, 720]) {
  test(`external name remains within the viewport at ${width}px`, t => {
    const {tool, tooltip} = fixture(t, width);
    tool.getBoundingClientRect = () => ({left: 120 + width - 54, top: 740, right: 120 + width - 10, bottom: 784, width: 44, height: 44});
    tool.emit('focus');
    t.mock.timers.tick(250);
    assert.ok(Number.parseFloat(tooltip.style.left) >= 6);
    assert.ok(Number.parseFloat(tooltip.style.left) + tooltip.offsetWidth <= width - 6);
    assert.equal(tooltip.style.top, '710px');
    assert.equal(tooltip.style.width, '');
    assert.equal(tooltip.style.height, '');
    assert.ok(tooltip.style.transformOrigin.endsWith('bottom'));
  });
}

test('mouseleave allows the exit transition, then hides and clears accessibility ownership', t => {
  const {tool, tooltip} = fixture(t);
  tool.emit('mouseenter'); t.mock.timers.tick(250);
  tool.emit('mouseleave');
  assert.equal(tooltip.hidden, false);
  assert.equal(tooltip.getAttribute('data-open'), undefined);
  assert.equal(tooltip.getAttribute('aria-hidden'), 'true');
  assert.equal(tool.getAttribute('aria-describedby'), undefined);
  t.mock.timers.tick(240);
  assert.equal(tooltip.hidden, true);
});

test('rapid movement cancels stale tooltip timers; disposal cannot reopen a hint', t => {
  const {tool, tooltip, library, find} = fixture(t);
  tool.emit('mouseenter'); t.mock.timers.tick(250);
  tool.emit('mouseleave'); t.mock.timers.tick(50);
  const next = find('library-tool-wiggle');
  next.emit('mouseenter'); t.mock.timers.tick(250);
  assert.equal(tooltip.children[0].textContent, 'wiggle');
  assert.equal(tooltip.hidden, false);
  next.emit('mouseleave'); next.emit('mouseenter');
  library.dispose(); t.mock.timers.tick(1000);
  assert.equal(tooltip.hidden, true);
});

test('click dismisses immediately so the hint never covers the resulting action', t => {
  const {tool, tooltip} = fixture(t);
  tool.emit('focus'); t.mock.timers.tick(250);
  tool.click();
  assert.equal(tooltip.hidden, true);
});

test('collection and category selectors filter the same tiles without replacing focused controls', t => {
  const doc=createFakeDocument();
  const create=doc.createElement;
  doc.createElement=tag=>{const node=create(tag);node.style={};node.classList={add(){}};return node;};
  const navigation={category:'all',scope:'all',query:'',scroll:0};
  const library=createQuickLibrary(doc,{
    items:[{id:'wiggle',name:'Wiggle',description:'Movimento',aliases:'tremer',category:'animation',interaction:'quick',reason:null,run(){},edit(){}},
      {id:'clean',name:'Limpar',description:'Organizar projeto',aliases:'clean',category:'project',interaction:'configure',reason:null,run(){},edit(){}}],
    categories:[{id:'animation',name:'Expressões',icon:'wiggle'},{id:'project',name:'Projeto',icon:'context'}],
    navigation,preferences:{snapshot:()=>({favorites:['wiggle'],recent:['clean','wiggle']})},locale:'pt-BR',anchor:doc.createElement('div'),onNavigate(){}
  });
  t.after(()=>library.dispose());
  const find=id=>library.element.getElementsByTagName('button').find(n=>n.id===id);
  const collection=find('library-collection');
  const category=find('library-category-select');
  const ids=()=>library.element.getElementsByTagName('button').filter(n=>n.id.startsWith('library-tool-')).map(n=>n.id);
  collection.focus();collection.click();find('library-scope-favorites').click();
  assert.deepEqual(ids(),['library-tool-wiggle']);
  assert.equal(doc.activeElement,collection);
  collection.click();find('library-scope-recent').click();
  assert.deepEqual(ids(),['library-tool-clean','library-tool-wiggle']);
  category.click();find('library-category-project').click();
  assert.deepEqual(ids(),['library-tool-clean']);
  assert.equal(navigation.category,'project');
  const search=library.element.getElementsByTagName('input')[0];
  search.value='não existe';search.emit('input');
  assert.deepEqual(ids(),[]);
});


test('search expands in place and Escape preserves a typed query', t => {
  const {library,find}=fixture(t);
  const trigger=find('library-search-open');
  const search=find('library-search');
  trigger.click();
  assert.equal(trigger.hidden,true);
  assert.equal(search.parentNode.hidden,false);
  search.value='clean';search.emit('input');
  library.element.keydown('Escape');
  assert.equal(search.value,'clean');
  assert.equal(trigger.hidden,true);
  find('library-search-clear').click();
  library.element.keydown('Escape');
  assert.equal(trigger.hidden,false);
  assert.equal(search.parentNode.hidden,true);
});

test('host context updates preserve tool identity, focus, query and current callbacks', t => {
  const {library,tool,find}=fixture(t);
  let applied=0;
  find('library-search-open').click();
  const search=find('library-search');search.value='clean';search.emit('input');
  tool.focus();
  const replacement={id:'clean',name:'Clean updated',description:'Description',aliases:'',category:'all',interaction:'quick',reason:'Select a layer',run(){applied++;},edit(){throw new Error('old route');}};
  library.update([replacement]);
  assert.equal(find('library-tool-clean'),tool);
  assert.equal(tool.ownerDocument.activeElement,tool);
  assert.equal(search.value,'clean');
  assert.equal(tool.getAttribute('aria-description'),'Select a layer');
  assert.equal(tool.getAttribute('aria-disabled'),'true');
  library.update([{...replacement,reason:null}]);
  assert.equal(tool.getAttribute('aria-description'),undefined);
  tool.click();assert.equal(applied,1);
});

test('filter menus support arrow keys, End, Home and Escape focus restoration', t => {
  const {library,find}=fixture(t);
  const collection=find('library-collection');
  collection.click();
  const menu=find('library-menu');
  assert.equal(collection.getAttribute('aria-expanded'),'true');
  assert.equal(menu.getAttribute('data-open'),'true');
  menu.keydown('End');assert.equal(collection.ownerDocument.activeElement.id,'library-scope-recent');
  menu.keydown('ArrowDown');assert.equal(collection.ownerDocument.activeElement.id,'library-scope-all');
  menu.keydown('Home');assert.equal(collection.ownerDocument.activeElement.id,'library-scope-all');
  library.element.keydown('Escape');
  assert.equal(collection.ownerDocument.activeElement,collection);
  assert.equal(collection.getAttribute('aria-expanded'),'false');
  assert.equal(menu.getAttribute('aria-hidden'),'true');
  t.mock.timers.tick(240);assert.equal(menu.hidden,true);
});

test('an interrupted menu exit cannot hide a newly opened filter', t => {
  const {library,find}=fixture(t);
  find('library-collection').click();library.element.keydown('Escape');
  t.mock.timers.tick(100);
  find('library-category-select').click();t.mock.timers.tick(200);
  assert.equal(find('library-menu').hidden,false);
  assert.equal(find('library-menu').getAttribute('data-open'),'true');
});

test('unavailable tools explain their reason on focus and never execute either route', t => {
  let applied = 0, edited = 0;
  const item = {id:'clean',name:'Limpar',description:'',aliases:'',category:'all',interaction:'quick',reason:'Selecione uma camada para continuar.',run(){applied++;},edit(){edited++;}};
  const {library,tool,tooltip}=fixture(t,360,{items:[item]});
  tool.emit('mouseenter'); t.mock.timers.tick(250);
  assert.match(tooltip.allText,/Limpar.*Selecione uma camada/);
  assert.equal(tooltip.children.length,2);
  assert.equal(tooltip.getAttribute('data-tool-name'),undefined);
  tool.focus(); tool.emit('focus'); t.mock.timers.tick(250);
  assert.match(tooltip.allText,/Limpar.*Selecione uma camada/);
  assert.equal(tooltip.getAttribute('data-tool-name'),undefined);
  assert.equal(tool.getAttribute('aria-describedby'),tooltip.id);
  tool.click(); t.mock.timers.tick(250); assert.equal(applied,0);
  assert.equal(tooltip.hidden,false,'touch/click can inspect the unavailable reason without running the tool');
  library.update([{...item,interaction:'configure'}]);
  tool.click(); assert.equal(edited,0);
  tool.emit('focus'); t.mock.timers.tick(250);
  library.update([{...item,reason:null}]);
  assert.equal(tooltip.allText,'Limpar');
  assert.equal(tooltip.getAttribute('data-tool-name'),undefined);
  assert.equal(tool.getAttribute('aria-description'),undefined);
  tool.click(); assert.equal(applied,1);
});

for (const locale of ['pt-BR','en-US']) {
  for (const scope of ['favorites','recent']) {
    test(`${locale} empty ${scope} explains next step and resets filters through one action`, t => {
      const navigation={category:'all',scope,query:'',scroll:15};
      let navigations=0;
      const {library,find,doc}=fixture(t,360,{locale,navigation,onNavigate(){navigations++;}});
      const expected=locale==='pt-BR' ? scope==='favorites'?'Use Favoritar':'aparecerão aqui' : scope==='favorites'?'Choose Favorite':'will appear here';
      assert.ok(library.element.allText.includes(expected));
      const action=library.element.getElementsByTagName('button').find(node=>node.textContent===(locale==='pt-BR'?'Ver todas as ferramentas':'Show all tools'));
      assert.ok(action); action.focus(); action.click();
      assert.deepEqual(navigation,{category:'all',scope:'all',query:'',scroll:0});
      assert.equal(navigations,1);
      assert.ok(find('library-tool-clean'));
      assert.equal(doc.activeElement,find('library-search'));
      assert.equal(find('library-search').parentNode.hidden,false);
    });
  }
}

test('empty search keeps its query and focus until the user chooses to reset', t => {
  const {library,find,doc,navigation}=fixture(t);
  find('library-search-open').click();
  const search=find('library-search'); search.value='inexistente'; search.emit('input');
  assert.equal(doc.activeElement,search);
  assert.equal(navigation.query,'inexistente');
  assert.match(library.element.allText,/Tente outro nome ou remova os filtros/);
  const count=library.element.getElementsByTagName('span').find(node=>node.className==='ch-library-count');
  assert.equal(count.getAttribute('role'),'status');
  assert.equal(count.getAttribute('aria-label'),'0 ferramentas encontradas');
  const action=library.element.getElementsByTagName('button').find(node=>node.textContent==='Ver todas as ferramentas');
  action.click();
  assert.equal(find('library-search'),search);
  assert.equal(search.value,''); assert.equal(doc.activeElement,search);
});

test('changing between empty collections refreshes the guidance', t => {
  const {library,find}=fixture(t,360,{navigation:{category:'all',scope:'favorites',query:'',scroll:0}});
  assert.match(library.element.allText,/Use Favoritar/);
  find('library-collection').click();find('library-scope-recent').click();
  assert.match(library.element.allText,/As ferramentas que você usar aparecerão aqui/);
  assert.doesNotMatch(library.element.allText,/Use Favoritar/);
});

test('tool options describe favorite removal after toggling and keep focus on the originating control',t=>{
  let favorites=[];
  const {find,doc}=fixture(t,360,{preferences:{snapshot:()=>({favorites,recent:[]}),toggleFavorite(id){favorites=favorites.includes(id)?favorites.filter(item=>item!==id):[...favorites,id];}}});
  const options=find('library-options-clean');options.focus();options.click();
  assert.equal(find('library-favorite-clean').textContent,'Favoritar');
  find('library-favorite-clean').click();assert.equal(doc.activeElement,options);
  options.click();assert.equal(find('library-favorite-clean').textContent,'Remover favorito');
});

test('a delayed scroll event from opening tool options keeps the menu available', t => {
  const {library, find} = fixture(t);
  const grid = library.element.getElementsByTagName('div').find(node => node.className === 'ch-tool-grid');
  // The browser scrolls a clicked target into view synchronously, but delivers
  // its scroll event after the click has already opened the options menu.
  grid.scrollTop = 156;
  find('library-options-clean').click();
  grid.emit('scroll');
  assert.equal(find('library-menu').hidden, false);
  assert.equal(find('library-menu').getAttribute('data-open'), 'true');
  grid.scrollTop = 170;
  grid.emit('scroll');
  assert.equal(find('library-menu').hidden, true, 'new user scrolling dismisses the positioned menu');
});
