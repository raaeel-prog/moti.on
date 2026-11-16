/**
 * Aba Ferramentas (revisão de ícones 2026-11-16): a seta ao lado do nome da categoria recolhe e
 * expande o grupo, e a estrela do ladrilho marca o favorito ficando preenchida (aria-pressed).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { createFakeDocument } from '../../../packages/ui-core/tests/fake-dom.mjs';
import { createPanelPreferences } from '../../../packages/ui-core/dist/panel-preferences.js';
import { DUOTONE_DRAWINGS, NAV_DRAWINGS, duotoneStaticPath } from '../../../packages/ui-core/dist/icon-drawings.js';

const built = await build({entryPoints: [fileURLToPath(new URL('../client/src/quick-library.ts', import.meta.url))], bundle: true, platform: 'node', format: 'esm', write: false});
const { createQuickLibrary } = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);

const ITEMS = [
  {id: 'wiggle', name: 'Wiggle', description: 'Oscila', aliases: '', category: 'animation', interaction: 'quick', reason: null, run() {}, edit() {}},
  {id: 'beat', name: 'Beat', description: 'Batida', aliases: 'som', category: 'animation', interaction: 'configure', reason: null, run() {}, edit() {}},
  {id: 'clean', name: 'Limpar', description: 'Organizar', aliases: '', category: 'project', interaction: 'configure', reason: null, run() {}, edit() {}}
];
const CATEGORIES = [{id: 'animation', name: 'Expressões', icon: 'wiggle'}, {id: 'project', name: 'Projeto', icon: 'context'}];

function fixture(t, preferences) {
  const doc = createFakeDocument();
  const create = doc.createElement;
  doc.createElement = tag => { const node = create(tag); node.style = {setProperty() {}}; node.classList = {add(name) { node.className += ` ${name}`; }}; return node; };
  const navigation = {category: 'all', scope: 'all', query: '', scroll: 0};
  const library = createQuickLibrary(doc, {items: ITEMS, categories: CATEGORIES, navigation, preferences, locale: 'pt-BR', anchor: doc.createElement('div'), onNavigate() {}});
  t.after(() => library.dispose());
  const buttons = () => library.element.getElementsByTagName('button');
  const byId = id => buttons().find(node => node.id === id);
  const tools = () => buttons().filter(node => node.id.startsWith('library-tool-')).map(node => node.id.slice('library-tool-'.length));
  return {doc, library, navigation, buttons, byId, tools};
}

function memoryPreferences(initial = {}) {
  let favorites = initial.favorites ?? [];
  let collapsed = initial.collapsedToolGroups ?? [];
  const saved = [];
  return {
    saved,
    snapshot: () => ({favorites: [...favorites], recent: [], collapsedToolGroups: [...collapsed]}),
    toggleFavorite(id) { favorites = favorites.includes(id) ? favorites.filter(item => item !== id) : [...favorites, id]; },
    setCollapsedToolGroups(value) { collapsed = [...value]; saved.push([...value]); }
  };
}

test('the arrow beside a category name collapses that group and expands it again, keeping focus on the arrow', t => {
  const preferences = memoryPreferences();
  const {byId, tools, doc} = fixture(t, preferences);
  const toggle = byId('library-group-animation');
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
  assert.equal(toggle.getAttribute('aria-label'), 'Recolher Expressões');
  assert.equal(toggle.parentNode.getAttribute('data-collapsed'), 'false');
  assert.deepEqual(tools(), ['wiggle', 'beat', 'clean']);

  toggle.focus(); toggle.click();
  assert.deepEqual(tools(), ['clean'], 'only the collapsed group leaves the grid');
  assert.equal(byId('library-group-animation'), toggle, 'the title is reused, not rebuilt');
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  assert.equal(toggle.getAttribute('aria-label'), 'Expandir Expressões');
  assert.equal(toggle.parentNode.getAttribute('data-collapsed'), 'true');
  assert.equal(doc.activeElement, toggle);
  assert.deepEqual(preferences.saved.at(-1), ['animation'], 'the choice is saved');
  const count = toggle.getElementsByTagName('span').find(node => node.className === 'ch-tool-group-count');
  assert.equal(count.textContent, '2', 'a collapsed group still says how many tools it holds');

  toggle.click();
  assert.deepEqual(tools(), ['wiggle', 'beat', 'clean']);
  assert.equal(byId('library-tool-beat').parentNode.getAttribute('data-reveal'), 'true', 'the reopened tiles enter animated');
  assert.equal(byId('library-tool-clean').parentNode.getAttribute('data-reveal'), undefined, 'the other groups stay still');
  assert.deepEqual(preferences.saved.at(-1), []);
});

test('saved collapsed groups open collapsed; search and category filters still reach their tools', t => {
  const {byId, tools, library, navigation} = fixture(t, memoryPreferences({collapsedToolGroups: ['animation']}));
  assert.deepEqual(tools(), ['clean']);
  assert.equal(byId('library-group-animation').getAttribute('aria-expanded'), 'false');
  const input = library.element.getElementsByTagName('input')[0];
  input.value = 'som'; input.emit('input');
  assert.deepEqual(tools(), ['beat'], 'a search looks inside collapsed groups');
  input.value = ''; input.emit('input');
  assert.deepEqual(tools(), ['clean']);
  byId('library-category-select').click(); byId('library-category-animation').click();
  assert.equal(navigation.category, 'animation');
  assert.deepEqual(tools(), ['wiggle', 'beat'], 'choosing the category shows it whole');
});

test('arrow keys twirl one group; Alt+click twirls every category at once', t => {
  const preferences = memoryPreferences();
  const {byId, tools} = fixture(t, preferences);
  const toggle = byId('library-group-project');
  toggle.keydown('ArrowLeft');
  assert.deepEqual(tools(), ['wiggle', 'beat']);
  toggle.keydown('ArrowLeft');
  assert.equal(preferences.saved.length, 1, 'already collapsed: nothing to save');
  toggle.keydown('ArrowRight');
  assert.deepEqual(tools(), ['wiggle', 'beat', 'clean']);
  toggle.emit('click', {altKey: true});
  assert.deepEqual(tools(), []);
  assert.deepEqual([...preferences.saved.at(-1)].sort(), ['animation', 'project']);
  assert.ok(byId('library-group-animation') && byId('library-group-project'), 'every title stays to reopen its group');
  toggle.emit('click', {altKey: true});
  assert.deepEqual(tools(), ['wiggle', 'beat', 'clean']);
});

test('the tile star marks the favorite as pressed (filled) and plays its pop only when pinning', t => {
  const preferences = memoryPreferences({favorites: ['wiggle']});
  const {byId, library} = fixture(t, preferences);
  const star = byId('library-star-beat');
  assert.equal(star.getAttribute('aria-pressed'), 'false');
  assert.equal(star.getAttribute('aria-label'), 'Favoritar: Beat');
  assert.equal(byId('library-star-wiggle').getAttribute('aria-pressed'), 'true', 'saved favorites start filled');
  assert.equal(star.tabIndex, -1, 'the star adds no tab stop; the keyboard keeps the context menu');
  assert.equal(byId('library-tool-beat').parentNode.children[0], byId('library-tool-beat'), 'the tool button stays first in its tile');

  star.click();
  assert.deepEqual(preferences.snapshot().favorites, ['wiggle', 'beat']);
  assert.equal(star.getAttribute('aria-pressed'), 'true');
  assert.equal(star.getAttribute('aria-label'), 'Remover dos favoritos: Beat');
  assert.equal(star.getAttribute('data-pop'), 'true');
  assert.equal(byId('library-tool-beat').parentNode.getAttribute('data-favorite'), 'true');

  star.click();
  assert.deepEqual(preferences.snapshot().favorites, ['wiggle']);
  assert.equal(star.getAttribute('aria-pressed'), 'false');
  assert.equal(star.getAttribute('data-pop'), undefined, 'removing a favorite does not celebrate');

  byId('library-favorites-only').click();
  assert.equal(byId('library-favorites-only').getAttribute('aria-pressed'), 'true');
  byId('library-star-wiggle').click();
  assert.match(library.element.allText, /Use Favoritar/, 'unpinning the last favorite leaves the explained empty state');
});

test('collapsed tool groups persist with the other preferences and reject invalid ids', () => {
  const store = new Map();
  const storage = {getItem: key => store.get(key) ?? null, setItem: (key, value) => { store.set(key, value); }};
  const root = createFakeDocument().createElement("div");
  const first = createPanelPreferences(root, storage);
  assert.deepEqual(first.snapshot().collapsedToolGroups, []);
  first.setCollapsedToolGroups(['effects', 'bad id!', 'effects', 'project']);
  assert.deepEqual(first.snapshot().collapsedToolGroups, ['effects', 'project']);
  const second = createPanelPreferences(root, storage);
  assert.deepEqual(second.snapshot().collapsedToolGroups, ['effects', 'project'], 'a new panel session reads them back');
  second.setCollapsedToolGroups([]);
  assert.deepEqual(createPanelPreferences(root, storage).snapshot().collapsedToolGroups, []);
});

test('tab drawings are distinct from each other and from every tool drawing', () => {
  const seen = new Map();
  for (const [id, drawing] of [...Object.entries(NAV_DRAWINGS), ...Object.entries(DUOTONE_DRAWINGS)]) {
    const path = duotoneStaticPath(drawing);
    assert.equal(seen.has(path), false, `${id} repeats ${seen.get(path)}`);
    seen.set(path, id);
    assert.ok(drawing.accent, `${id} has a part that gestures`);
  }
  for (const id of ['tools', 'presets', 'videoCamera', 'stock']) assert.ok(NAV_DRAWINGS[id], `tab ${id}`);
});
