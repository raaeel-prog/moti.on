import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { createFakeDocument } from '../../../packages/ui-core/tests/fake-dom.mjs';

async function load(entry) {
  const built = await build({ entryPoints: [fileURLToPath(new URL(entry, import.meta.url))], bundle: true, platform: 'node', format: 'esm', write: false });
  return import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);
}
const tips = await load('../client/src/rich-tooltip.ts');
const icons = await load('../client/src/ui-icons.ts');
const source = attributes => ({ getAttribute: name => attributes[name] ?? null, disabled: attributes.disabled === true });

test('tip timings mirror the AE tokens', async () => {
  const tokens = await readFile(new URL('../../../packages/ui-tokens/src/after-effects.css', import.meta.url), 'utf8');
  assert.match(tokens, new RegExp(`--delay-tip:\\s*${tips.TIP_DELAY_MS}ms`));
  assert.match(tokens, new RegExp(`--delay-tip-warm:\\s*${tips.TIP_WARM_MS}ms`));
  assert.match(tokens, new RegExp(`--tip-warm-window:\\s*${tips.TIP_WARM_WINDOW_MS}ms`));
  assert.equal(tips.tipDelay(1000, -Infinity), 450, 'cold tips wait');
  assert.equal(tips.tipDelay(1000, 700), 60, 'moving to the next control right away is warm');
  assert.equal(tips.tipDelay(2000, 700), 450, 'warmth fades');
});

test('a title "Name · more" becomes a name and a detail line; data-tip wins', () => {
  assert.deepEqual(tips.tipContent(source({ title: 'Arraste para ajustar · Shift: 10× · Ctrl/Alt: precisão' })), { name: 'Arraste para ajustar', detail: 'Shift: 10× · Ctrl/Alt: precisão', shortcut: '', reason: '' });
  assert.deepEqual(tips.tipContent(source({ title: 'old', 'data-tip': 'Parallax', 'aria-keyshortcuts': '3' })), { name: 'Parallax', detail: '', shortcut: '3', reason: '' });
  assert.equal(tips.tipContent(source({ title: 'Escondido' }), 'Emprestado').name, 'Emprestado', 'a borrowed title is still read');
  assert.equal(tips.tipContent(source({})), null);
});

test('disabled controls say why; enabled ones never show a stale reason', () => {
  const reason = 'Selecione uma camada';
  assert.equal(tips.tipContent(source({ 'data-tip': 'Âncora', 'aria-disabled': 'true', 'data-disabled-reason': reason })).reason, reason);
  assert.equal(tips.tipContent(source({ 'data-tip': 'Âncora', 'data-disabled': 'true', 'data-disabled-reason': reason })).reason, reason);
  assert.equal(tips.tipContent(source({ 'data-tip': 'Âncora', 'data-disabled-reason': reason })).reason, '');
});

test('a tip that repeats a fully visible label stays quiet', () => {
  const plain = { name: 'Camadas', detail: '', shortcut: '', reason: '' };
  assert.equal(tips.tipAddsInformation(plain, ' Camadas ', false), false);
  assert.equal(tips.tipAddsInformation(plain, 'Camadas', true), true, 'a truncated label is worth a tip');
  assert.equal(tips.tipAddsInformation({ ...plain, shortcut: '3' }, 'Camadas', false), true);
  assert.equal(tips.tipAddsInformation(plain, '', false), true, 'icon-only controls always get their name');
});

test('the tip adds itself to aria-describedby and leaves the field description and error alone', () => {
  assert.equal(tips.describedBy('field-desc field-error', 'rich-tooltip', true), 'field-desc field-error rich-tooltip');
  assert.equal(tips.describedBy('field-desc field-error rich-tooltip', 'rich-tooltip', false), 'field-desc field-error');
  assert.equal(tips.describedBy(null, 'rich-tooltip', true), 'rich-tooltip');
  assert.equal(tips.describedBy('rich-tooltip', 'rich-tooltip', false), '');
  assert.equal(tips.describedBy('a rich-tooltip', 'rich-tooltip', true), 'a rich-tooltip', 'never twice');
});

test('shortcuts read as the platform writes them', () => {
  assert.equal(tips.formatShortcut('Control+K'), 'Ctrl+K');
  assert.equal(tips.formatShortcut('Control+K', true), '⌃K');
  assert.equal(tips.formatShortcut('Meta+k Control+k', true), '⌘K');
  assert.equal(tips.formatShortcut('q'), 'Q');
  assert.equal(tips.formatShortcut(''), '');
});

test('tips sit under the control and flip above or slide in at the panel edges', () => {
  const viewport = { width: 280, height: 400 };
  const tip = { width: 120, height: 40 };
  const centred = tips.placeTip({ left: 100, top: 50, width: 28, height: 28 }, tip, viewport);
  assert.deepEqual(centred, { left: 54, top: 84, side: 'below', origin: '60px top' });
  const bottom = tips.placeTip({ left: 100, top: 360, width: 28, height: 28 }, tip, viewport);
  assert.equal(bottom.side, 'above');
  assert.equal(bottom.top, 314);
  const right = tips.placeTip({ left: 260, top: 50, width: 16, height: 16 }, tip, viewport);
  assert.equal(right.left, 152, 'never past the right edge (8 px)');
  assert.equal(right.origin, '116px top', 'grows from the control, not from the middle');
  const left = tips.placeTip({ left: 0, top: 50, width: 16, height: 16 }, tip, viewport);
  assert.equal(left.left, 8);
});

test('interface icons share one 16 px grid and a 1.33 px non-scaling stroke', () => {
  const doc = createFakeDocument();
  for (const name of ['chevron-down', 'chevron-right', 'check', 'star', 'close', 'pin', 'info', 'alert']) {
    const svg = icons.uiIcon(doc, name);
    assert.equal(svg.getAttribute('viewBox'), '0 0 16 16', name);
    assert.equal(svg.getAttribute('aria-hidden'), 'true');
    const stroked = svg.children.filter(path => path.getAttribute('stroke') === 'currentColor');
    assert.ok(stroked.length > 0, `${name} is an outline icon`);
    for (const path of stroked) {
      assert.equal(path.getAttribute('stroke-width'), '1.33');
      assert.equal(path.getAttribute('vector-effect'), 'non-scaling-stroke');
    }
  }
  assert.equal(icons.uiIcon(doc, 'star-filled').children[0].getAttribute('fill'), 'currentColor');
  assert.equal(icons.uiIcon(createFakeDocument({ supportsNamespaces: false }), 'star'), null);
});

test('setUiIcon swaps the glyph for the icon and keeps the glyph without SVG', () => {
  const doc = createFakeDocument();
  const control = doc.createElement('button');
  control.textContent = '☆';
  icons.setUiIcon(control, 'star', '☆');
  assert.equal(control.getAttribute('data-icon'), 'star');
  assert.equal(control.children.length, 1);
  const plain = createFakeDocument({ supportsNamespaces: false }).createElement('button');
  icons.setUiIcon(plain, 'close', '×');
  assert.equal(plain.textContent, '×');
});
