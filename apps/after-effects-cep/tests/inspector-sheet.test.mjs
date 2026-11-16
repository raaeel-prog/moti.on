import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { createManualEnv, motionNode } from './motion-env.mjs';

const built = await build({ entryPoints: [fileURLToPath(new URL('../client/src/inspector-sheet.ts', import.meta.url))], bundle: true, platform: 'node', format: 'esm', write: false });
const sheet = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);

test('Tab wraps inside the sheet and lets focus move freely in the middle', () => {
  const [a, b, c] = ['a', 'b', 'c'];
  assert.equal(sheet.wrapFocus([a, b, c], c, false), a, 'Tab on the last goes to the first');
  assert.equal(sheet.wrapFocus([a, b, c], a, true), c, 'Shift+Tab on the first goes to the last');
  assert.equal(sheet.wrapFocus([a, b, c], b, false), null);
  assert.equal(sheet.wrapFocus([a, b, c], 'outside', false), a, 'focus outside comes back in');
  assert.equal(sheet.wrapFocus([], a, false), null);
});

test('the narrow query leaves no gap between the sheet and the 720 px column', () => {
  assert.equal(sheet.NARROW_QUERY, '(max-width: 719.98px)');
});

function parts({ narrow = true, frames = true } = {}) {
  const listeners = {};
  const doc = {
    activeElement: null,
    createElement: tag => motionNode(tag),
    addEventListener(type, handler) { listeners[type] = handler; },
    removeEventListener(type) { delete listeners[type]; },
    defaultView: {
      matchMedia: () => ({ matches: narrow, addListener() {}, removeListener() {} }),
      ...(frames ? { requestAnimationFrame() {} } : {})
    },
    listeners
  };
  const workspace = { ...motionNode('div'), insertBefore(node) { this.children.unshift(node); node.parentNode = this; } };
  const library = { ...motionNode('div'), contains: node => node === 'library-tile' };
  const inspector = { ...motionNode('aside'), focused: 0, focus() { this.focused += 1; }, contains: node => node === 'inside', querySelectorAll: () => [] };
  return { doc, workspace, library, inspector };
}

test('below 720 px the sheet is a modal dialog over a hidden library, with a scrim that closes it', () => {
  const clock = createManualEnv();
  const { doc, workspace, library, inspector } = parts();
  let dismissed = 0;
  const handle = sheet.attachInspectorSheet(doc, clock.env, { workspace, library, inspector, swap: false, onDismiss: () => { dismissed += 1; } });
  assert.deepEqual([inspector.getAttribute('role'), inspector.getAttribute('aria-modal'), library.getAttribute('aria-hidden')], ['dialog', 'true', 'true']);
  assert.equal(inspector.getAttribute('tabindex'), '-1', 'a click on dead space keeps the keys working');
  const scrim = workspace.children[0];
  assert.equal(scrim.getAttribute('data-open'), 'false');
  clock.advance(20);
  assert.equal(scrim.getAttribute('data-open'), 'true', 'the scrim fades in on the next frame');
  scrim.dispatch('click');
  assert.equal(dismissed, 1);
  doc.listeners.focusin({ target: 'library-tile' });
  assert.equal(inspector.focused, 1, 'focus that slips into the hidden library comes back');
  doc.listeners.focusin({ target: 'inside' });
  assert.equal(inspector.focused, 1);
  handle.dispose();
  assert.equal(doc.listeners.focusin, undefined);
});

test('closing plays the exit only (enter and swap rules released) and then navigates once', () => {
  const clock = createManualEnv();
  const { doc, workspace, library, inspector } = parts();
  const handle = sheet.attachInspectorSheet(doc, clock.env, { workspace, library, inspector, swap: true, onDismiss() {} });
  assert.equal(inspector.getAttribute('data-swap'), 'true');
  let navigated = 0;
  handle.close(() => { navigated += 1; });
  handle.close(() => { navigated += 1; });
  assert.deepEqual([inspector.getAttribute('data-open'), inspector.getAttribute('data-swap'), inspector.getAttribute('data-closing')], ['false', null, 'true']);
  assert.equal(navigated, 0, 'the view stays until the exit has played');
  clock.advance(240);
  assert.equal(navigated, 1, 'a second close is ignored');
});

test('disposing while closing (another navigation won) never runs the stale navigation', () => {
  const clock = createManualEnv();
  const { doc, workspace, library, inspector } = parts();
  const handle = sheet.attachInspectorSheet(doc, clock.env, { workspace, library, inspector, swap: false, onDismiss() {} });
  let navigated = 0;
  handle.close(() => { navigated += 1; });
  handle.dispose();
  clock.advance(400);
  assert.equal(navigated, 0);
});

test('without frames or with reduced motion the sheet closes at once; wide panels are not modal', () => {
  for (const options of [{ frames: false }, { reduced: true }]) {
    const clock = createManualEnv({ reduced: options.reduced === true });
    const { doc, workspace, library, inspector } = parts({ frames: options.frames !== false });
    const handle = sheet.attachInspectorSheet(doc, clock.env, { workspace, library, inspector, swap: false, onDismiss() {} });
    let navigated = 0;
    handle.close(() => { navigated += 1; });
    assert.equal(navigated, 1, JSON.stringify(options));
  }
  const wide = parts({ narrow: false });
  sheet.attachInspectorSheet(wide.doc, createManualEnv().env, { ...wide, swap: false, onDismiss() {} });
  assert.equal(wide.inspector.getAttribute('role'), null);
  assert.equal(wide.library.getAttribute('aria-hidden'), null);
  wide.doc.listeners.focusin({ target: 'library-tile' });
  assert.equal(wide.inspector.focused, 0, 'the 300 px column never pulls focus');
});
