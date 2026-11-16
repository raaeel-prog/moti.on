import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { createManualEnv, motionNode } from './motion-env.mjs';

const built = await build({ entryPoints: [fileURLToPath(new URL('../client/src/shell-motion.ts', import.meta.url))], bundle: true, platform: 'node', format: 'esm', write: false });
const shell = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);

const key = (code, extra = {}) => ({ code, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, repeat: false, defaultPrevented: false, target: null, ...extra });
const element = (tag, attributes = {}) => ({ tagName: tag, getAttribute: name => attributes[name] ?? null, isContentEditable: false });

test('views enter from the side of their tab; the tool editor opens forward from home', () => {
  assert.equal(shell.viewDirection('home', 'ease'), 'forward');
  assert.equal(shell.viewDirection('presets', 'parallax'), 'back');
  assert.equal(shell.viewDirection('home', 'tools'), 'forward');
  assert.equal(shell.viewDirection('tools', 'home'), 'back');
  assert.equal(shell.viewDirection('settings', 'system'), 'forward');
  assert.equal(shell.viewDirection(null, 'home'), 'none', 'the first view only rises');
  assert.equal(shell.viewDirection('system', 'diagnostics'), 'none');
});

test('top-row digits 1–5 open the primary views in tab order', () => {
  assert.deepEqual(['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'].map(code => shell.shortcutView(key(code))), ['home', 'ease', 'parallax', 'presets', 'settings']);
  assert.equal(shell.shortcutView(key('Digit6')), null);
  assert.equal(shell.shortcutView(key('Numpad1')), null, 'the keypad stays with the anchor grid');
});

test('a digit that belongs to someone else never switches views', () => {
  for (const extra of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }, { shiftKey: true }, { repeat: true }, { defaultPrevented: true }]) {
    assert.equal(shell.shortcutView(key('Digit2', extra)), null, JSON.stringify(extra));
  }
  for (const target of [element('INPUT'), element('textarea'), element('SELECT'), element('DIV', { role: 'slider' }), element('DIV', { role: 'spinbutton' }), element('LI', { role: 'option' }), element('DIV', { contenteditable: 'true' })]) {
    assert.equal(shell.shortcutView(key('Digit2', { target })), null, `${target.tagName} ${target.getAttribute('role')}`);
  }
  assert.equal(shell.shortcutView(key('Digit2', { target: element('BUTTON') })), 'ease', 'a focused button does not own digits');
});

function shortcutDocument({ modal = false } = {}) {
  const listeners = {};
  const items = Object.fromEntries(['home', 'ease', 'parallax', 'presets', 'settings'].map(view => [view, { ...motionNode('button'), focused: 0, focus() { this.focused += 1; doc.activeElement = this; } }]));
  const doc = {
    body: { tagName: 'BODY' },
    activeElement: null,
    querySelector(selector) {
      if (selector.startsWith('[aria-modal')) return modal ? {} : null;
      const view = selector.match(/data-view="(\w+)"/)?.[1];
      return view ? items[view] ?? null : null;
    },
    addEventListener(type, handler) { listeners[type] = handler; },
    removeEventListener(type) { delete listeners[type]; },
    press(code, extra = {}) {
      const event = { ...key(code, extra), prevented: false, preventDefault() { this.prevented = true; } };
      listeners.keydown?.(event);
      return event;
    },
    listeners
  };
  doc.activeElement = doc.body;
  return { doc, items };
}

test('attachNavShortcuts labels the tabs, navigates, and steps aside for dialogs and blockers', () => {
  const { doc, items } = shortcutDocument();
  const visited = [];
  let blocked = false;
  const stop = shell.attachNavShortcuts(doc, { navigate: view => visited.push(view), blocked: () => blocked });
  assert.equal(items.parallax.getAttribute('aria-keyshortcuts'), '3');
  assert.equal(doc.press('Digit3').prevented, true);
  assert.deepEqual(visited, ['parallax']);
  assert.equal(items.parallax.focused, 0, 'focus stays put when nothing was focused');
  blocked = true;
  assert.equal(doc.press('Digit2').prevented, false);
  blocked = false;
  doc.activeElement = { tagName: 'BUTTON' };
  doc.press('Digit4');
  assert.equal(items.presets.focused, 0, 'a focused control that survived keeps the focus');
  stop();
  assert.equal(doc.listeners.keydown, undefined);

  const dialog = shortcutDocument({ modal: true });
  const none = [];
  shell.attachNavShortcuts(dialog.doc, { navigate: view => none.push(view) });
  assert.equal(dialog.doc.press('Digit1').prevented, false);
  assert.deepEqual(none, [], 'an open dialog keeps its keys');
});

test('attachNavShortcuts hands focus to the new tab when the old view took the focused control', () => {
  const { doc, items } = shortcutDocument();
  doc.activeElement = { tagName: 'BUTTON' };
  shell.attachNavShortcuts(doc, { navigate: () => { doc.activeElement = doc.body; } });
  doc.press('Digit2');
  assert.equal(items.ease.focused, 1);
});

test('the nav pill joins selection-glide and only starts to travel two frames after mount', () => {
  const clock = createManualEnv();
  const indicator = motionNode('span');
  indicator.setAttribute('data-motion', 'tab-indicator');
  const root = { querySelector: selector => selector === '.ch-nav__indicator' ? indicator : null };
  shell.attachNavIndicator(root, clock.env);
  assert.equal(indicator.getAttribute('data-motion'), 'tab-indicator selection-glide');
  assert.equal(indicator.getAttribute('data-ready'), null);
  clock.advance(40);
  assert.equal(indicator.getAttribute('data-ready'), 'true');

  const still = motionNode('span');
  shell.attachNavIndicator({ querySelector: () => still }, createManualEnv({ frames: false }).env);
  assert.equal(still.getAttribute('data-ready'), 'true', 'without frames the pill is ready at once');
  assert.doesNotThrow(() => shell.attachNavIndicator({ querySelector: () => null }, clock.env)());
});

test('setFeedbackLift is the one writer of the toast lift and never drops below the base', () => {
  const root = motionNode('html');
  shell.setFeedbackLift(root, 120.4);
  assert.equal(root.style.values['--ch-feedback-bottom'], '120px');
  shell.setFeedbackLift(root, 10);
  assert.equal(root.style.values['--ch-feedback-bottom'], `${shell.FEEDBACK_BASE_LIFT}px`);
  shell.setFeedbackLift(root);
  assert.equal(root.style.values['--ch-feedback-bottom'], '38px');
});

test('toast motion is a no-op without MutationObserver (fake DOM, UXP-like hosts)', () => {
  const region = { ...motionNode('section'), ownerDocument: { defaultView: {} }, children: [] };
  assert.doesNotThrow(() => shell.attachToastMotion(region, createManualEnv().env)());
});
