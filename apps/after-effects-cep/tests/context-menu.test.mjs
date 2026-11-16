import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

async function load(entry) {
  const built = await build({ entryPoints: [fileURLToPath(new URL(entry, import.meta.url))], bundle: true, platform: 'node', format: 'esm', write: false });
  return import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);
}
const { placeMenu, openContextMenu, closeContextMenu } = await load('../client/src/context-menu.ts');

// DOM mínimo: só o que context-menu.ts usa (árvore, atributos, eventos, foco).
function fakeDocument() {
  const listeners = new Map();
  const on = (store, type, fn) => { if (!store.has(type)) store.set(type, new Set()); store.get(type).add(fn); };
  const off = (store, type, fn) => store.get(type)?.delete(fn);
  const doc = {
    activeElement: null,
    defaultView: { innerWidth: 800, innerHeight: 600, addEventListener() {}, removeEventListener() {} },
    addEventListener: (type, fn) => on(listeners, type, fn),
    removeEventListener: (type, fn) => off(listeners, type, fn),
    emit(type, event) { for (const fn of [...(listeners.get(type) ?? [])]) fn(event); },
    createElement(tag) {
      const own = new Map();
      const node = {
        tagName: tag.toUpperCase(), children: [], parentNode: null, attributes: {}, dataset: {}, style: {},
        className: '', textContent: '', title: '', type: '', tabIndex: 0, innerHTML: '',
        get isConnected() { let at = node; while (at.parentNode) at = at.parentNode; return at === doc.body; },
        setAttribute(name, value) { node.attributes[name] = String(value); },
        getAttribute(name) { return name in node.attributes ? node.attributes[name] : null; },
        removeAttribute(name) { delete node.attributes[name]; },
        appendChild(child) { child.parentNode = node; node.children.push(child); return child; },
        removeChild(child) { node.children = node.children.filter(c => c !== child); child.parentNode = null; },
        replaceChildren(...kids) { node.children = []; kids.forEach(k => node.appendChild(k)); },
        contains(other) { for (let at = other; at; at = at.parentNode) if (at === node) return true; return false; },
        addEventListener: (type, fn) => on(own, type, fn),
        removeEventListener: (type, fn) => off(own, type, fn),
        emit(type, event = {}) { const e = { preventDefault() {}, stopPropagation() {}, target: node, ...event }; for (const fn of [...(own.get(type) ?? [])]) fn(e); },
        click() { node.emit('click'); },
        focus() { doc.activeElement = node; },
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 180, height: 120 })
      };
      return node;
    }
  };
  doc.body = doc.createElement('body');
  return doc;
}
const rowsOf = menu => menu.children.filter(c => c.className === 'ch-context-menu__item');

test('placeMenu keeps the pointer corner when it fits and flips at the viewport edges', () => {
  assert.deepEqual(placeMenu(10, 10, 180, 120, 800, 600), { left: 10, top: 10 });
  assert.deepEqual(placeMenu(700, 550, 180, 120, 800, 600), { left: 520, top: 430 }, 'opens left and up near the bottom-right corner');
  assert.deepEqual(placeMenu(50, 50, 900, 700, 800, 600), { left: 4, top: 4 }, 'a menu larger than the panel stays at the inner edge');
});

test('builds items, sections and separators and focuses the first enabled item', t => {
  const doc = fakeDocument();
  t.after(closeContextMenu);
  const handle = openContextMenu(doc, { x: 20, y: 30, label: 'Ações', entries: [
    { section: 'Pasta' },
    { id: 'rename', label: 'Renomear', disabledReason: 'Pasta do sistema', run() {} },
    { separator: true },
    { id: 'red', label: 'Vermelho', swatch: 'red', checked: true, run() {} }
  ] });
  const menu = handle.element;
  assert.equal(menu.parentNode, doc.body);
  assert.equal(menu.getAttribute('role'), 'menu');
  assert.deepEqual(menu.children.map(c => c.className), ['ch-context-menu__section', 'ch-context-menu__item', 'ch-context-menu__separator', 'ch-context-menu__item']);
  const [rename, red] = rowsOf(menu);
  assert.equal(rename.getAttribute('aria-disabled'), 'true');
  assert.equal(red.getAttribute('role'), 'menuitemcheckbox');
  assert.equal(red.getAttribute('aria-checked'), 'true');
  assert.equal(doc.activeElement, red, 'a disabled first item is skipped by the initial focus');
  assert.deepEqual([menu.style.left, menu.style.top], ['20px', '30px']);
});

test('a disabled item never runs; an enabled one runs once and closes the menu', t => {
  const doc = fakeDocument();
  t.after(closeContextMenu);
  const calls = [];
  let closed = 0;
  const handle = openContextMenu(doc, { x: 0, y: 0, label: 'Card', onClose: () => closed++, entries: [
    { id: 'off', label: 'Off', disabledReason: 'Indisponível', run: () => calls.push('off') },
    { id: 'on', label: 'On', run: () => calls.push('on') }
  ] });
  const [off, on] = rowsOf(handle.element);
  off.click();
  assert.deepEqual(calls, []);
  assert.equal(handle.element.parentNode, doc.body);
  on.click();
  on.click();
  assert.deepEqual(calls, ['on']);
  assert.equal(handle.element.parentNode, null);
  assert.equal(closed, 1);
});

test('arrows wrap, Home/End jump and Escape closes returning focus to the origin', t => {
  const doc = fakeDocument();
  t.after(closeContextMenu);
  const origin = doc.body.appendChild(doc.createElement('button'));
  const handle = openContextMenu(doc, { x: 0, y: 0, label: 'Menu', returnFocus: origin, entries: ['a', 'b', 'c'].map(id => ({ id, label: id, run() {} })) });
  const [a, b, c] = rowsOf(handle.element);
  const key = name => handle.element.emit('keydown', { key: name });
  assert.equal(doc.activeElement, a);
  key('ArrowUp'); assert.equal(doc.activeElement, c);
  key('ArrowDown'); assert.equal(doc.activeElement, a);
  key('ArrowDown'); assert.equal(doc.activeElement, b);
  key('End'); assert.equal(doc.activeElement, c);
  key('Home'); assert.equal(doc.activeElement, a);
  key('Escape');
  assert.equal(handle.element.parentNode, null);
  assert.equal(doc.activeElement, origin);
});

test('only one menu is open at a time and an outside press closes it', t => {
  const doc = fakeDocument();
  t.after(closeContextMenu);
  const entries = [{ id: 'x', label: 'x', run() {} }];
  const first = openContextMenu(doc, { x: 0, y: 0, label: 'A', entries });
  const second = openContextMenu(doc, { x: 0, y: 0, label: 'B', entries });
  assert.equal(first.element.parentNode, null);
  assert.equal(second.element.parentNode, doc.body);
  doc.emit('mousedown', { target: rowsOf(second.element)[0] });
  assert.equal(second.element.parentNode, doc.body, 'a press inside keeps it open');
  doc.emit('mousedown', { target: doc.body });
  assert.equal(second.element.parentNode, null);
});
