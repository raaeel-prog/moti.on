import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { createFakeDocument } from '../../../packages/ui-core/tests/fake-dom.mjs';
import { createManualEnv } from './motion-env.mjs';

const load = async file => {
  const built = await build({ entryPoints: [fileURLToPath(new URL(file, import.meta.url))], bundle: true, platform: 'node', format: 'esm', write: false });
  return import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);
};
const strip = await load('../client/src/quick-strip.ts');
const keys = await load('../client/src/quick-actions-keys.ts');

/** A scroller 205 px wide over 9 columns of 44 + 4 px (428 px). */
function fixture(t, { reduced = false } = {}) {
  const doc = createFakeDocument();
  const clock = createManualEnv({ reduced });
  const scroller = doc.createElement('div');
  Object.assign(scroller, { scrollLeft: 0, clientWidth: 205, scrollWidth: 428 });
  const quick = strip.createQuickStrip(doc, clock.env, scroller, { previous: 'Anteriores', next: 'Mais' });
  t.after(() => quick.dispose());
  const pages = quick.element.children.filter(node => node.className === 'ch-quick-strip__page');
  const wheel = (deltaY, init = {}) => scroller.emit('wheel', { deltaY, deltaX: 0, deltaMode: 0, ctrlKey: false, ...init });
  return { doc, clock, scroller, quick, pages, wheel };
}

test('overflow reads each side and a page keeps one column as context', () => {
  assert.deepEqual(strip.stripOverflow(0, 205, 428), { start: false, end: true });
  assert.deepEqual(strip.stripOverflow(100, 205, 428), { start: true, end: true });
  assert.deepEqual(strip.stripOverflow(223, 205, 428), { start: true, end: false });
  assert.deepEqual(strip.stripOverflow(0, 428, 428), { start: false, end: false }, 'a strip that fits has no fade');
  assert.equal(strip.stripPage(205), 205 - strip.STRIP_COLUMN_PX);
  assert.equal(strip.stripPage(30), strip.STRIP_COLUMN_PX, 'never less than one column');
});

test('the strip wraps the scroller with two mouse-only page buttons and marks the overflowing side', t => {
  const { quick, scroller, pages } = fixture(t);
  assert.equal(scroller.parentNode, quick.element);
  assert.deepEqual(pages.map(node => node.getAttribute('data-side')), ['start', 'end']);
  for (const node of pages) {
    assert.equal(node.getAttribute('tabindex'), '-1', 'Tab walks the tiles, not the pagers');
    assert.equal(node.getAttribute('aria-hidden'), 'true');
  }
  assert.equal(quick.element.getAttribute('data-overflow-start'), 'false');
  assert.equal(quick.element.getAttribute('data-overflow-end'), 'true');
});

test('a vertical wheel glides the strip sideways and stops at the end, where the panel scrolls again', t => {
  const { quick, scroller, clock, wheel } = fixture(t);
  const first = wheel(100);
  assert.equal(first.defaultPrevented, true, 'the strip owns the wheel while it can move');
  clock.advance(500);
  assert.equal(scroller.scrollLeft, 100);
  assert.equal(quick.element.getAttribute('data-overflow-start'), 'true');
  // Notches during a glide add up from its target, not from the current frame.
  wheel(100); wheel(100);
  clock.advance(600);
  assert.equal(scroller.scrollLeft, 223, 'clamped at the end');
  assert.equal(quick.element.getAttribute('data-overflow-end'), 'false');
  const atEnd = wheel(100);
  assert.equal(atEnd.defaultPrevented, false, 'at the end the wheel goes back to the panel');
  assert.equal(wheel(80, { deltaX: 120 }).defaultPrevented, false, 'a sideways trackpad keeps its native scroll');
  assert.equal(wheel(-100, { ctrlKey: true }).defaultPrevented, false, 'Ctrl+wheel is the host zoom');
});

test('page buttons move by the visible width minus one column; reduced motion jumps', t => {
  const { scroller, pages, clock } = fixture(t, { reduced: true });
  pages[1].click();
  assert.equal(scroller.scrollLeft, 205 - strip.STRIP_COLUMN_PX, 'no frames needed with reduced motion');
  pages[0].click();
  assert.equal(scroller.scrollLeft, 0);
  clock.advance(16);
});

test('the quick dock shows whole columns only: max(2, floor((width + 4) / (tile + 4)))', () => {
  assert.equal(strip.fitColumns(158, 32), 4, '280 px panel: 158 px beside the anchor');
  assert.equal(strip.fitColumns(236, 36), 6);
  assert.equal(strip.fitColumns(355, 36), 8, '355 + 4 = 359 < 360: the ninth column does not fit');
  assert.equal(strip.fitColumns(356, 36), 9);
  assert.equal(strip.fitColumns(40, 36), 2, 'never fewer than two columns');
  assert.equal(strip.fitColumns(0, 36), 2);
  assert.equal(strip.fitTileSize(280), 32);
  assert.equal(strip.fitTileSize(339), 32);
  assert.equal(strip.fitTileSize(340), 36);
  assert.equal(strip.fitTileSize(720), 36);
});

test('the fitted strip wraps the grid without page buttons and reports columns once per change', t => {
  const doc = createFakeDocument();
  const clock = createManualEnv({ reduced: true });
  const grid = doc.createElement('div');
  const seen = [];
  const fitted = strip.createFittedStrip(doc, clock.env, grid, (columns, tile) => seen.push([columns, tile]));
  t.after(() => fitted.dispose());
  assert.equal(grid.parentNode, fitted.element);
  assert.equal(fitted.element.children.length, 1, 'no pagers, no fades');
  fitted.element.clientWidth = 196;
  fitted.refresh(); clock.advance(16);
  assert.deepEqual(seen.at(-1), [5, 36]);
  fitted.refresh(); clock.advance(16);
  fitted.element.clientWidth = 0;
  fitted.refresh(); clock.advance(16);
  assert.deepEqual(seen.at(-1), [5, 36], 'an unmeasured strip keeps its last layout');
});

test('each tile row mirrors its keyboard row at any strip width', () => {
  assert.equal(keys.stripColumns(18), 9);
  assert.equal(keys.stripColumns(6), 3);
  assert.equal(keys.stripColumns(3), 2);
  assert.equal(keys.stripColumns(0), 1);
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(index => keys.tileLetter(index, 3)).join(''), 'QWEASD');
  assert.deepEqual([0, 8, 9, 17].map(index => keys.tileLetter(index, 9)).join(''), 'QOAL');
  assert.equal(keys.tileIndexForLetter('a', 3, 6), 3, 'A opens the second row of a three-wide strip');
  assert.equal(keys.tileIndexForLetter('r', 3, 6), -1, 'R is past the third column');
  assert.equal(keys.tileIndexForLetter('s', 2, 3), -1, 'no tile under S when the second row holds one');
  assert.equal(keys.tileIndexForLetter('l', 9, 18), 17);
  assert.equal(keys.tileIndexForLetter('Enter', 9, 18), -1);
});
