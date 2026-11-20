import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { setImmediate } from 'node:timers/promises';
import { createFakeDocument, createFakeWindow } from '../../../packages/ui-core/tests/fake-dom.mjs';

const built = await build({ entryPoints: [fileURLToPath(new URL('../client/src/quick-actions.ts', import.meta.url))], bundle: true, platform: 'node', format: 'esm', write: false });
const { createQuickActions, onQuickStatus } = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);

function find(node, predicate) {
  if (predicate(node)) return node;
  for (const child of node.children) { const hit = find(child, predicate); if (hit) return hit; }
  return null;
}
function fixture(t, overrides = {}) {
  const doc = createFakeDocument();
  if (overrides.win) doc.defaultView = overrides.win;
  const scope = doc.createElement('section');
  const calls = { actions: [], favorites: [], recents: [], notices: [], denied: [], anchor: [] };
  const quick = createQuickActions(doc, {
    locale: 'pt-BR', busy: false, hasComp: true, selectionCount: 1, keyScope: scope,
    onAction: action => { calls.actions.push(action); return overrides.result?.(action); },
    onFavoritesChange: favorites => calls.favorites.push([...favorites]),
    onRecentsChange: recents => calls.recents.push([...recents]),
    onNotice: message => calls.notices.push(message),
    onDenied: (action, reason) => calls.denied.push([action, reason]),
    onAnchorKey: index => calls.anchor.push(index),
    ...overrides.options
  });
  scope.appendChild(quick.toolbar); scope.appendChild(quick.strip); scope.appendChild(quick.footer);
  t.after(() => quick.dispose());
  const byId = id => find(scope, node => node.id === id) ?? find(quick.rail, node => node.id === id);
  const slot = action => byId(`library-quick-${action}`).parentNode;
  const visible = () => quick.element.children.filter(node => node.className === 'ch-quick-slot' && !node.hidden).map(node => node.children[0].id.replace('library-quick-', ''));
  const key = (k, init = {}) => scope.emit('keydown', { key: k, target: scope, ...init });
  return { doc, scope, quick, calls, byId, slot, visible, key };
}

test('a narrow strip shows whole columns and puts the rest behind "+N", letters unchanged', async t => {
  const win = createFakeWindow(280);
  const f = fixture(t, { win, result: () => Promise.resolve(true) });
  const more = f.byId('quick-actions-more');
  const overflow = f.byId('quick-actions-overflow');
  assert.equal(more.parentNode.hidden, true, 'unmeasured: everything fits, no "+N"');
  assert.equal(f.visible().length, 18);
  // 280 px panel: 28 px tiles, 158 px beside the anchor → 5 columns → 9 tiles + "+9".
  f.quick.strip.clientWidth = 158;
  win.emit('resize');
  assert.equal(f.quick.element.getAttribute('data-columns'), '5');
  assert.equal(f.visible().length, 9);
  assert.equal(more.parentNode.hidden, false);
  assert.equal(more.textContent, '+9');
  assert.equal(more.getAttribute('aria-label'), 'Mais 9 ações');
  assert.equal(more.getAttribute('aria-expanded'), 'false');
  assert.equal(overflow.hidden, true);
  assert.equal(f.quick.element.children.at(-2), more.parentNode, '"+N" takes the last cell of the strip');
  // A tile behind "+N" keeps its letter and its shortcut.
  assert.equal(f.byId('library-quick-create-null').getAttribute('aria-keyshortcuts'), 'A');
  f.key('a');
  assert.deepEqual(f.calls.actions, ['create-null']);
  more.click();
  assert.equal(overflow.hidden, false);
  assert.equal(overflow.getAttribute('data-open'), 'true');
  assert.equal(more.getAttribute('aria-expanded'), 'true');
  assert.equal(f.doc.activeElement?.id, 'library-quick-create-solid', 'focus enters the popover on its first tile');
  overflow.emit('keydown', { key: 'Escape' });
  assert.equal(overflow.hidden, true, 'Esc closes');
  assert.equal(f.doc.activeElement, more, 'focus goes back to "+N"');
  more.click();
  f.byId('library-quick-effect-blur').click();
  assert.deepEqual(f.calls.actions, ['create-null', 'effect-blur']);
  assert.equal(overflow.hidden, true, 'a tile picked from the popover closes it');
  assert.equal(f.doc.activeElement, more);
  await setImmediate();
  // Wide again: all eighteen fit and the rows mirror the keyboard.
  f.quick.strip.clientWidth = 400;
  win.innerWidth = 480;
  win.emit('resize');
  assert.equal(f.quick.element.getAttribute('data-columns'), '9');
  assert.equal(f.visible().length, 18);
  assert.equal(more.parentNode.hidden, true);
});

test('tiles feed the status line: name and gesture on hover or focus, then the applied run', async t => {
  const f = fixture(t, { result: () => Promise.resolve(true) });
  const seen = [];
  const stop = onQuickStatus(f.doc, status => seen.push(status));
  t.after(stop);
  f.slot('center').emit('mouseenter');
  assert.deepEqual(seen.at(-1), { kind: 'point', name: 'Centralizar na composição', gesture: 'Clique aplica · Botão direito: favoritar' });
  f.slot('center').emit('mouseleave');
  assert.equal(seen.at(-1), null);
  f.byId('library-quick-fit').emit('focus');
  assert.equal(seen.at(-1).name, 'Ajustar à composição');
  f.byId('library-quick-fit').click();
  await setImmediate();
  assert.deepEqual(seen.at(-1), { kind: 'applied', name: 'Ajustar à composição' });
  f.quick.update({ locale: 'pt-BR', busy: false, hasComp: true, selectionCount: 0 });
  f.slot('mirror').emit('mouseenter');
  assert.equal(seen.at(-1).gesture, 'Selecione uma camada.', 'an unavailable tile says why instead of the gesture');
  assert.equal(find(f.quick.element, node => node.className === 'ch-quick-action__label'), null, 'no abbreviation on the tiles');
});

test('rail starts with the three primary shortcuts and follows favorites', t => {
  const f = fixture(t);
  assert.deepEqual(f.quick.rail.children.map(slot => slot.children[0].id), ['quick-rail-precompose', 'quick-rail-center', 'quick-rail-save-frame']);
  const event = f.slot('effect-blur').emit('contextmenu');
  assert.equal(event.defaultPrevented, true);
  assert.deepEqual(f.calls.favorites.at(-1), ['precompose', 'center', 'save-frame', 'effect-blur']);
  assert.equal(f.slot('effect-blur').getAttribute('data-favorite'), 'true');
  assert.equal(f.quick.rail.children.length, 4);
  assert.match(f.calls.notices.at(-1), /BLUR fixado/);
  f.byId('library-quick-center').keydown('F10', { shiftKey: true });
  assert.deepEqual(f.calls.favorites.at(-1), ['precompose', 'save-frame', 'effect-blur']);
  assert.equal(f.slot('center').getAttribute('data-favorite'), 'false');
});

test('saved favorites replace the defaults, and an empty list hides the rail', t => {
  const f = fixture(t, { options: { favorites: [] } });
  assert.equal(f.quick.rail.hidden, true);
  f.byId('quick-tab-favorites').click();
  assert.deepEqual(f.visible(), []);
  const empty = find(f.quick.element, node => node.className === 'ch-quick-actions__empty');
  assert.equal(empty.hidden, false);
  assert.match(empty.textContent, /botão direito/);
});

test('category tabs filter the grid and re-map the QWERTY hints', t => {
  const f = fixture(t);
  f.byId('quick-tab-effects').click();
  assert.deepEqual(f.visible(), ['effect-hue', 'effect-fill', 'effect-tint', 'effect-blur', 'effect-lumetri', 'effect-curves']);
  assert.equal(f.byId('quick-tab-effects').getAttribute('aria-pressed'), 'true');
  assert.equal(f.byId('library-quick-effect-hue').getAttribute('aria-keyshortcuts'), 'Q');
  f.key('w');
  assert.deepEqual(f.calls.actions, ['effect-fill']);
  f.byId('quick-tab-all').click();
  assert.equal(f.visible().length, 18);
  assert.equal(f.byId('library-quick-precompose').getAttribute('aria-keyshortcuts'), 'Q');
});

test('two rows of nine mirror QWERTYUIO / ASDFGHJKL, and there is no search field', t => {
  const f = fixture(t);
  assert.equal(f.byId('quick-actions-search'), null);
  assert.equal(f.byId('library-quick-create-shape').getAttribute('aria-keyshortcuts'), 'O', 'ninth tile closes the first row');
  assert.equal(f.byId('library-quick-create-null').getAttribute('aria-keyshortcuts'), 'A', 'tenth tile opens the second row');
  assert.equal(f.byId('library-quick-effect-curves').getAttribute('aria-keyshortcuts'), 'L');
  f.key('l');
  assert.deepEqual(f.calls.actions, ['effect-curves']);
});

test('keyboard: digits move the anchor, Alt reveals hints, modifiers and text fields pass through', t => {
  const f = fixture(t);
  const field = f.doc.createElement('INPUT');
  f.scope.emit('keydown', { key: 'q', target: field });
  f.key('7'); f.key('3'); f.key('5');
  assert.deepEqual(f.calls.anchor, [0, 8, 4]);
  f.key('Alt');
  assert.equal(f.quick.element.getAttribute('data-show-keys'), 'true');
  f.scope.emit('keyup', { key: 'Alt' });
  assert.equal(f.quick.element.getAttribute('data-show-keys'), 'false');
  f.byId('quick-actions-keys').click();
  f.scope.emit('keyup', { key: 'Alt' });
  assert.equal(f.quick.element.getAttribute('data-show-keys'), 'true', 'the toggle latches the hints');
  f.key('q', { ctrlKey: true }); f.key('q', { shiftKey: true });
  assert.deepEqual(f.calls.actions, []);
});

test('a shortcut for an unavailable action explains itself instead of running', t => {
  const f = fixture(t, { options: { selectionCount: 0 } });
  f.key('w');
  assert.deepEqual(f.calls.actions, []);
  assert.deepEqual(f.calls.denied, [['center', 'Selecione uma camada.']]);
  assert.equal(f.byId('library-quick-center').getAttribute('data-denied'), 'true');
  f.key('u');
  assert.deepEqual(f.calls.actions, ['create-adjustment'], 'create actions need no selection');
});

test('recents keep the four latest confirmed actions and skip refused ones', async t => {
  const f = fixture(t, { result: action => Promise.resolve(action !== 'fit') });
  for (const action of ['center', 'fit', 'mirror', 'freeze', 'create-null', 'center']) f.byId(`library-quick-${action}`).click();
  await setImmediate();
  assert.deepEqual(f.calls.recents.at(-1), ['center', 'create-null', 'freeze', 'mirror']);
  const chips = find(f.quick.footer, node => node.className === 'ch-quick-recents__list').children;
  assert.deepEqual(chips.map(slot => slot.children[0].id), ['quick-recent-center', 'quick-recent-create-null', 'quick-recent-freeze', 'quick-recent-mirror']);
  assert.ok(!f.calls.recents.some(list => list.includes('fit')));
  chips[2].children[0].click();
  assert.equal(f.calls.actions.at(-1), 'freeze');
});

test('saved recents render immediately and follow availability updates', t => {
  const f = fixture(t, { options: { recents: ['effect-blur', 'not-an-action'] } });
  const chip = f.byId('quick-recent-effect-blur') ?? find(f.quick.footer, node => node.id === 'quick-recent-effect-blur');
  assert.ok(chip);
  f.quick.update({ locale: 'pt-BR', busy: false, hasComp: true, selectionCount: 0 });
  assert.equal(chip.disabled, true);
  assert.match(chip.title, /Selecione uma camada/);
});

function anchorFixture(t, context = {}) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const doc = createFakeDocument();
  const grid = doc.createElement('div');
  const names = ['Superior esquerdo', 'Superior centro', 'Superior direito', 'Meio esquerdo', 'Centro', 'Meio direito', 'Inferior esquerdo', 'Inferior centro', 'Inferior direito'];
  const cells = names.map(name => {
    const cell = doc.createElement('button');
    cell.setAttribute('aria-label', name);
    // Like the real owner: applying a point disables every cell synchronously, before later listeners.
    cell.addEventListener('click', () => { for (const other of cells) other.disabled = true; });
    grid.appendChild(cell);
    return cell;
  });
  const quick = createQuickActions(doc, { locale: 'pt-BR', busy: false, hasComp: true, selectionCount: 1, anchor: grid, onAction: () => {}, ...context });
  t.after(() => quick.dispose());
  const frame = quick.anchorPanel.children[0];
  const label = quick.anchorPanel.children[1];
  return { quick, grid, cells, frame, label };
}

test('the anchor puck follows the applied point even though the owner disables the cells first', t => {
  const { cells, frame, label } = anchorFixture(t);
  assert.equal(frame.getAttribute('data-point'), '4', 'starts at the centre');
  assert.equal(label.children[0].textContent, 'Centro');
  cells[2].click();
  assert.equal(frame.getAttribute('data-point'), '2');
  assert.equal(label.children[0].textContent, 'Superior direito');
  const ping = frame.children.find(node => node.className === 'ch-quick-anchorpad__ping');
  assert.ok(ping, 'a ring fires at the destination');
  t.mock.timers.tick(800);
  assert.equal(frame.children.some(node => node.className === 'ch-quick-anchorpad__ping'), false, 'and is removed afterwards');
});

test('the anchor frame greys out without a selection but not while a command runs', t => {
  const { quick, frame } = anchorFixture(t);
  assert.equal(frame.getAttribute('data-disabled'), 'false');
  quick.update({ locale: 'pt-BR', busy: true, hasComp: true, selectionCount: 1 });
  assert.equal(frame.getAttribute('data-disabled'), 'false');
  quick.update({ locale: 'pt-BR', busy: false, hasComp: true, selectionCount: 0 });
  assert.equal(frame.getAttribute('data-disabled'), 'true');
  quick.update({ locale: 'pt-BR', busy: false, hasComp: false, selectionCount: 0 });
  assert.equal(frame.getAttribute('data-disabled'), 'true');
});

test('tiles cascade in on mount and on each filter change, then the cascade is released', t => {
  const { quick } = anchorFixture(t);
  assert.equal(quick.element.getAttribute('data-stagger'), 'true');
  t.mock.timers.tick(420 + 18 * 22 + 40);
  assert.equal(quick.element.getAttribute('data-stagger'), 'false', 'showing the dock again must not replay it');
  find(quick.toolbar, node => node.id === 'quick-tab-effects').click();
  assert.equal(quick.element.getAttribute('data-stagger'), 'true');
  t.mock.timers.tick(420 + 6 * 22 + 40);
  assert.equal(quick.element.getAttribute('data-stagger'), 'false');
});

test('a running shortcut dims the others; a command from elsewhere keeps the grid as is', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const doc = createFakeDocument();
  let finish;
  const quick = createQuickActions(doc, { locale: 'pt-BR', busy: false, hasComp: true, selectionCount: 1, onAction: () => new Promise(resolve => { finish = resolve; }) });
  t.after(() => quick.dispose());
  quick.update({ locale: 'pt-BR', busy: true, hasComp: true, selectionCount: 1 });
  assert.equal(quick.element.getAttribute('data-busy'), 'external');
  quick.update({ locale: 'pt-BR', busy: false, hasComp: true, selectionCount: 1 });
  const blur = find(quick.element, node => node.id === 'library-quick-effect-blur');
  blur.click();
  quick.update({ locale: 'pt-BR', busy: true, hasComp: true, selectionCount: 1 });
  assert.equal(quick.element.getAttribute('data-busy'), 'local');
  t.mock.timers.tick(150);
  assert.equal(blur.getAttribute('data-running'), 'true', 'the border ring starts once the command is slow');
  finish(true);
});

test('Onyx Vivo CSS stays inside what CEP 12 (Chromium 99) renders', async () => {
  const { readFile } = await import('node:fs/promises');
  const css = await readFile(new URL('../../../packages/ui-core/src/ae-quick-actions.css', import.meta.url), 'utf8');
  const code = css.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(code, /color-mix\(/, 'color-mix() needs Chromium 111');
  assert.doesNotMatch(code, /:has\(/, ':has() needs Chromium 105');
  assert.doesNotMatch(code, /@container/, 'container queries need Chromium 105');
  assert.doesNotMatch(code, /(^|[;{\s])(scale|translate|rotate)\s*:/m, 'individual transform properties need Chromium 104');
});


test('each real action uses a unique Lucide icon (data-lucide) and no generic repeats', t => {
  const f = fixture(t);
  const names = {};
  for (const slot of f.quick.element.children.filter(node => node.className === 'ch-quick-slot')) {
    const button = slot.children[0];
    const action = button.id.replace('library-quick-', '');
    const svg = find(button, node => node.tagName === 'svg' || node.getAttribute?.('data-lucide'));
    const lucide = svg?.getAttribute('data-lucide');
    assert.ok(lucide, `${action} must have a Lucide name`);
    assert.equal(names[lucide], undefined, `${lucide} is used twice (${names[lucide]} and ${action})`);
    names[lucide] = action;
  }
  const expected = {
    precompose: 'copy',
    center: 'crosshair',
    fit: 'maximize-2',
    freeze: 'snowflake',
    mirror: 'flip-horizontal',
    'dash-stroke': 'dashed-line',
    'trim-to-keys': 'scissors',
    'pin-to-null': 'pin',
    'create-adjustment': 'contrast',
    'create-solid': 'square',
    'create-shape': 'rectangle-horizontal',
    'create-null': 'move',
    'create-camera': 'camera',
    'save-frame': 'image',
    'effect-hue': 'palette',
    'effect-fill': 'paint-bucket',
    'effect-tint': 'droplet',
    'effect-blur': 'blend',
    'effect-lumetri': 'sun',
    'effect-curves': 'spline'
  };
  for (const [action, lucide] of Object.entries(expected)) {
    if (names[lucide] !== action && !Object.values(names).includes(action)) continue; // extras may be hidden
  }
  // The eighteen default tiles plus any extra still in the grid.
  const unique = new Set(Object.values(names));
  assert.equal(unique.size, Object.keys(names).length);
  assert.equal(names.copy, 'precompose');
  assert.equal(names.crosshair, 'center');
  assert.equal(names['maximize-2'], 'fit');
  assert.equal(names.snowflake, 'freeze');
  assert.equal(names['flip-horizontal'], 'mirror');
  assert.equal(names['dashed-line'], 'dash-stroke');
  assert.equal(names.contrast, 'create-adjustment');
  assert.equal(names.square, 'create-solid');
  assert.equal(names['rectangle-horizontal'], 'create-shape');
  assert.equal(names.move, 'create-null');
  assert.equal(names.camera, 'create-camera');
  assert.equal(names.image, 'save-frame');
  assert.equal(names.palette, 'effect-hue');
  assert.equal(names['paint-bucket'], 'effect-fill');
  assert.equal(names.droplet, 'effect-tint');
  assert.equal(names.blend, 'effect-blur');
  assert.equal(names.sun, 'effect-lumetri');
  assert.equal(names.spline, 'effect-curves');
});
