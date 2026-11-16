import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

async function load(entry) {
  const built = await build({ entryPoints: [fileURLToPath(new URL(entry, import.meta.url))], bundle: true, platform: 'node', format: 'esm', write: false });
  return import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);
}
const model = await load('../client/src/command-palette-model.ts');
const palette = await load('../client/src/command-palette.ts');

const entry = (id, kind, title, extra = {}) => ({ id, kind, title, run() {}, ...extra });
const ENTRIES = [
  entry('view.parallax', 'view', 'Parallax', { keywords: 'parallax camera' }),
  entry('tool.wiggle', 'tool', 'Wiggle', { keywords: 'tremer oscilacao shake' }),
  entry('tool.wordReveal', 'tool', 'Revelar palavras', { keywords: 'word box reveal' }),
  entry('quick.center', 'quick', 'Centralizar na composição', { keywords: 'CTR center' }),
  entry('quick.precompose', 'quick', 'Pré-compor seleção', { keywords: 'PRE precompose', reason: 'Selecione uma camada.' }),
  entry('setting.settings-reduce-motion', 'setting', 'Reduzir movimento')
];
const titles = ranked => ranked.map(item => item.entry.title);

test('a title that starts with the query outranks a word start, a substring and keywords', () => {
  const list = [entry('a', 'tool', 'Camada de ajuste'), entry('b', 'tool', 'Criar camada'), entry('c', 'tool', 'Descamar'), entry('d', 'tool', 'Outro', { keywords: 'camada' })];
  assert.deepEqual(titles(model.rankEntries('cam', list)), ['Camada de ajuste', 'Criar camada', 'Descamar', 'Outro']);
});

test('accents and case never matter; every word has to match', () => {
  assert.equal(titles(model.rankEntries('PRE COMPOR', ENTRIES))[0], 'Pré-compor seleção');
  assert.equal(titles(model.rankEntries('centralizar composicao', ENTRIES))[0], 'Centralizar na composição');
  assert.deepEqual(model.rankEntries('wiggle camada', ENTRIES), []);
});

test('abbreviations, aliases and letters in order find the command', () => {
  assert.equal(titles(model.rankEntries('ctr', ENTRIES))[0], 'Centralizar na composição');
  assert.equal(titles(model.rankEntries('shake', ENTRIES))[0], 'Wiggle');
  assert.equal(titles(model.rankEntries('wgl', ENTRIES))[0], 'Wiggle', 'subsequence');
});

test('recent commands rise; unavailable ones stay listed but lower', () => {
  const list = [entry('a', 'tool', 'Revelar texto'), entry('b', 'tool', 'Revelar palavras')];
  assert.deepEqual(titles(model.rankEntries('revelar', list)), ['Revelar palavras', 'Revelar texto'], 'alphabetical on a tie');
  assert.deepEqual(titles(model.rankEntries('revelar', list, ['a'])), ['Revelar texto', 'Revelar palavras']);
  const reasons = [entry('x', 'quick', 'Pré-compor', { reason: 'Selecione uma camada.' }), entry('y', 'quick', 'Pré-visualizar')];
  assert.deepEqual(titles(model.rankEntries('pre', reasons)), ['Pré-visualizar', 'Pré-compor']);
});

test('on a tie the view comes before the tool of the same name', () => {
  const list = [entry('tool.parallax', 'tool', 'Parallax'), entry('view.parallax', 'view', 'Parallax')];
  assert.deepEqual(model.rankEntries('parallax', list).map(item => item.entry.id), ['view.parallax', 'tool.parallax']);
});

test('an exact effect name outranks a recent preset with the same title prefix', () => {
  const list = [entry('preset.blur-reveal', 'preset', 'Desfoque e revelação'), entry('quick.effect-blur', 'effect', 'Desfoque')];
  assert.equal(model.rankEntries('desfoque', list, ['preset.blur-reveal'])[0].entry.id, 'quick.effect-blur');
});

test('empty query: recents first, then every kind in a stable order', () => {
  const { recent, groups } = model.groupEntries('', ENTRIES, ['tool.wiggle', 'missing']);
  assert.deepEqual(recent.map(item => item.id), ['tool.wiggle']);
  assert.deepEqual(groups.map(group => group.kind), ['view', 'tool', 'quick', 'setting']);
});

test('with a query, the group of the best match comes first', () => {
  const { groups } = model.groupEntries('reduzir', ENTRIES);
  assert.equal(groups[0].kind, 'setting');
  assert.deepEqual(model.groupEntries('zzz', ENTRIES).groups, []);
});

test('usage hints are shown but never searched', () => {
  const list = [entry('tool.wiggle', 'tool', 'Wiggle', { detail: 'Animação por expressão', hint: 'Enter aplica · Shift+Enter ajusta' })];
  assert.deepEqual(model.rankEntries('ajusta', list), []);
  assert.equal(model.rankEntries('expressao', list).length, 1, 'the category still matches');
});

test('recents keep five, newest first, without duplicates', () => {
  let recent = [];
  for (const id of ['a', 'b', 'c', 'a', 'd', 'e', 'f']) recent = model.withRecent(recent, id);
  assert.deepEqual(recent, ['f', 'e', 'd', 'a', 'c']);
});

test('Ctrl+K and Cmd+K open the palette; Alt or Shift do not', () => {
  assert.equal(palette.isPaletteKey({ key: 'k', code: 'KeyK', ctrlKey: true }), true);
  assert.equal(palette.isPaletteKey({ key: 'k', code: 'KeyK', metaKey: true }), true);
  assert.equal(palette.isPaletteKey({ key: 'л', code: 'KeyK', ctrlKey: true }), true, 'layout-independent');
  assert.equal(palette.isPaletteKey({ key: 'K', code: 'KeyK', ctrlKey: true, shiftKey: true }), false);
  assert.equal(palette.isPaletteKey({ key: 'k', code: 'KeyK', ctrlKey: true, altKey: true }), false);
  assert.equal(palette.isPaletteKey({ key: 'k', code: 'KeyK' }), false);
});
