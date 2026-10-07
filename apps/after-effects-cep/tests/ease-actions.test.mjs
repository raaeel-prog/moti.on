import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {createCepDocument} from './cep-dom.mjs';
import {createI18n} from '../../../packages/ui-core/dist/i18n.js';
import {createFakeWindow} from '../../../packages/ui-core/tests/fake-dom.mjs';

const built = await build({entryPoints: [fileURLToPath(new URL('../client/src/ease-actions.ts', import.meta.url))], bundle: true, platform: 'node', format: 'esm', write: false});
const {createEaseActions, EASE_ACTIONS} = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);

function fixture(locale = 'pt-BR', disabledReason = null) {
  const doc = createCepDocument(), calls = [];
  doc.defaultView = createFakeWindow();
  const i18n = createI18n({locale});
  const toolbar = createEaseActions(doc, {i18n, disabledReason, onAction: action => calls.push(action)});
  const controls = toolbar.element.getElementsByTagName('button');
  const tooltip = toolbar.element.getElementsByRole('tooltip')[0];
  tooltip.offsetWidth = 240; tooltip.offsetHeight = 80;
  return {toolbar, controls, calls, i18n, doc, tooltip};
}

test('copy and reverse actions dispatch one precise command each', () => {
  const f = fixture();
  for (const control of f.controls) control.click();
  assert.deepEqual(f.calls.map(({id, command, args}) => ({id, command, args})), [
    {id: 'clone', command: 'ae.keys.clone', args: {mode: 'repeat', destination: 'cti'}},
    {id: 'reverse', command: 'ae.keys.reverse', args: {}},
    {id: 'reverse-values', command: 'ae.keys.reverse-values', args: {}},
    {id: 'duplicate-reverse', command: 'ae.keys.clone', args: {mode: 'mirror', destination: 'after-gap'}},
    {id: 'duplicate-reverse-start', command: 'ae.keys.clone', args: {mode: 'mirror', destination: 'layer-start'}},
    {id: 'duplicate-reverse-end', command: 'ae.keys.clone', args: {mode: 'mirror', destination: 'layer-end'}},
  ]);
  assert.equal(f.toolbar.element.children[0].getElementsByTagName('button').length, 6);
  assert.equal(f.controls.length, 6);
});

test('selection and busy updates block stale activations without replacing controls', () => {
  const f = fixture('pt-BR', 'Selecione keyframes.');
  const first = f.controls[0];
  first.click();
  assert.equal(f.calls.length, 0);
  assert.equal(first.disabled, false, 'unavailable controls remain focusable so their reason can be read');
  assert.equal(first.getAttribute('aria-disabled'), 'true');
  assert.match(f.tooltip.allText, /Selecione keyframes/);
  f.toolbar.update(null);
  assert.equal(f.toolbar.element.getElementsByTagName('button')[0], first);
  assert.equal(first.getAttribute('aria-disabled'), 'false');
  first.click();
  assert.equal(f.calls.length, 1);
  f.toolbar.update('Atualizando keyframes…');
  first.disabled = false;
  first.click();
  assert.equal(f.calls.length, 1, 'the current state also guards a queued or synthetic activation');
  assert.equal(f.toolbar.element.getElementsByTagName('p').find(node => node.className.includes('ch-ease-actions__status')).textContent, 'Atualizando keyframes…');
  f.toolbar.update(null);
  assert.equal(f.toolbar.element.getElementsByTagName('p').find(node => node.className.includes('ch-ease-actions__status')).hidden, true);
});

for (const locale of ['pt-BR', 'en-US']) {
  test(`${locale} actions expose stable identities and translated accessible names`, () => {
    const f = fixture(locale);
    f.controls.forEach((control, index) => {
      const action = EASE_ACTIONS[index];
      assert.equal(control.id, `ease-action-${action.id}`);
      assert.equal(control.getAttribute('aria-label'), f.i18n.t(action.labelKey));
      assert.notEqual(f.i18n.t(action.labelKey), action.labelKey);
      assert.notEqual(f.i18n.t(action.hintKey), action.hintKey);
      control.emit('focus');
      assert.equal(f.tooltip.hidden, false);
      assert.equal(f.tooltip.children[0].textContent, f.i18n.t(action.labelKey));
      assert.equal(f.tooltip.children[1].textContent, f.i18n.t(action.hintKey));
      assert.equal(control.getAttribute('aria-describedby'), f.tooltip.id);
      assert.equal(control.getAttribute('title'), undefined, 'a single explicit tooltip replaces unreliable native CEP titles');
      assert.equal(control.getElementsByTagName('svg')[0].getAttribute('aria-hidden'), 'true');
    });
  });
}

test('hover intent identifies every action and tracks changing selection requirements', t => {
  t.mock.timers.enable({apis: ['setTimeout']});
  const f = fixture();
  t.after(() => f.toolbar.dispose());
  for (let index = 0; index < f.controls.length; index++) {
    const control = f.controls[index], action = EASE_ACTIONS[index];
    control.emit('mouseenter');
    t.mock.timers.tick(179);
    assert.equal(f.tooltip.hidden, true);
    t.mock.timers.tick(1);
    assert.equal(f.tooltip.hidden, false);
    assert.equal(f.tooltip.getAttribute('data-open'), 'true');
    assert.equal(f.tooltip.children[0].textContent, f.i18n.t(action.labelKey));
    assert.equal(f.tooltip.children[1].textContent, f.i18n.t(action.hintKey));
    f.toolbar.update('Selecione keyframes.');
    assert.equal(f.tooltip.children[2].textContent, 'Selecione keyframes.');
    assert.equal(control.getAttribute('aria-describedby'), f.tooltip.id);
    f.toolbar.update(null);
    assert.equal(f.tooltip.children.length, 2, 'the visible tooltip drops obsolete reasons');
    control.emit('mouseleave');
    assert.equal(f.tooltip.hidden, true);
    assert.equal(control.getAttribute('aria-describedby'), undefined);
  }
});

test('tooltips dismiss on Escape, blur, scrolling, resize and an enabled activation', () => {
  const f = fixture();
  for (const dismiss of [
    () => f.toolbar.element.keydown('Escape'),
    () => f.controls[0].emit('blur'),
    () => f.doc.emit('scroll'),
    () => f.doc.defaultView.emit('resize'),
    () => f.controls[0].click()
  ]) {
    f.controls[0].emit('focus');
    assert.equal(f.tooltip.hidden, false);
    dismiss();
    assert.equal(f.tooltip.hidden, true);
    assert.equal(f.controls[0].getAttribute('aria-describedby'), undefined);
  }
  f.toolbar.dispose();
});

test('tooltip placement stays inside narrow panels and flips above the bottom edge', () => {
  const f = fixture();
  f.doc.documentElement.clientWidth = 280;
  f.controls[0].getBoundingClientRect = () => ({left: 228, top: 460, bottom: 496, width: 44, height: 36});
  f.controls[0].emit('focus');
  assert.equal(f.tooltip.style.left, '32px');
  assert.equal(f.tooltip.style.top, '374px');
  f.toolbar.dispose();
});

test('disposing cancels pending tooltips, removes window listeners and blocks stale buttons', t => {
  t.mock.timers.enable({apis: ['setTimeout']});
  const f = fixture();
  f.controls[0].emit('mouseenter');
  assert.equal(f.doc.defaultView.listenerCount('resize'), 1);
  f.toolbar.dispose();
  t.mock.timers.tick(1000);
  assert.equal(f.tooltip.hidden, true);
  assert.equal(f.doc.defaultView.listenerCount('resize'), 0);
  f.controls[0].click();
  f.controls[0].emit('focus');
  f.toolbar.update(null);
  assert.equal(f.tooltip.hidden, true);
  assert.equal(f.calls.length, 0);
});
