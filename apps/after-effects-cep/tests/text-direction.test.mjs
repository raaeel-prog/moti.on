import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { createFakeDocument } from '../../../packages/ui-core/tests/fake-dom.mjs';

// Every text motion that offers a direction must look different from each side,
// in the card preview and in the host, which share libraryTextOrient.
const compiled = await build({stdin: {contents: 'export * from "./client/src/motion-library-preview.ts"; export { GALLERY_PRESETS, defaultLibraryOptions } from "./client/src/preset-gallery.ts"; export { libraryUsesDirection, libraryTextOrient, libraryTextBase, libraryTextOrder, libraryTextSweeps, libraryDirectionAllowed } from "../../packages/contracts/src/index.ts";', resolveDir: fileURLToPath(new URL('..', import.meta.url))}, bundle: true, format: 'esm', platform: 'node', write: false});
const {paintLibraryPreview, libraryPreviewPlayback, GALLERY_PRESETS, defaultLibraryOptions, libraryUsesDirection, libraryTextOrient, libraryTextBase, libraryTextOrder, libraryTextSweeps, libraryDirectionAllowed, librarySample} = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
const SIDES = ['bottom', 'left', 'right', 'top'];
const text = GALLERY_PRESETS.map(p => p.motion).filter(p => p?.category.startsWith('text-'));

/** Where a card paints each unit over the entrance, in card pixels: the corners
 * of its glyph box through its matrix, plus its opacity, blur and letter spacing. */
function frames(p, direction) {
  const doc = createFakeDocument(), out = [], options = {...defaultLibraryOptions(p), phase: 'in', direction};
  const numbers = value => String(value).match(/-?\d+(\.\d+)?(e-?\d+)?/g)?.map(Number) ?? [];
  for (let k = 1; k <= 12; k++) {
    const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    paintLibraryPreview(svg, p, options, libraryPreviewPlayback(p, options, .22 + k / 12 * 1.4).time);
    const walk = node => {
      for (const [name, value] of Object.entries(node.attributes ?? {})) {
        if (name === 'transform' && String(value).startsWith('matrix(')) {
          const [a, b, c, d, e, f] = numbers(value);
          for (const [x, y] of [[-15, -25], [15, -25], [-15, 0], [15, 0]]) out.push(a * x + c * y + e, b * x + d * y + f);
        } else if (['opacity', 'stdDeviation', 'x'].includes(name)) out.push(...numbers(value).map(v => name === 'opacity' ? v * 100 : v));
      }
      for (const child of node.childNodes ?? node.children ?? []) walk(child);
    };
    walk(svg);
  }
  return out;
}
const apart = (a, b) => a.length !== b.length || a.some((v, i) => Math.abs(v - b[i]) > .5);

test('every side of a directional text motion is a different motion in the card', () => {
  const directional = text.filter(p => p.mode === 'transition' && libraryTextBase(p) !== '');
  assert.ok(directional.length > 150, `${directional.length} text transitions take a direction`);
  const same = [];
  for (const p of directional) {
    const seen = SIDES.map(side => frames(p, side));
    for (let i = 0; i < SIDES.length; i++) for (let j = i + 1; j < SIDES.length; j++) if (!apart(seen[i], seen[j])) same.push(`${p.id}: ${SIDES[i]} = ${SIDES[j]}`);
  }
  assert.deepEqual(same, []);
});

test('the authored side is one of the four and "Original" plays it', () => {
  for (const p of text.filter(p => p.mode === 'transition' && libraryTextBase(p) !== '')) {
    const base = libraryTextBase(p);
    assert.ok(SIDES.includes(base), `${p.id} arrives from ${base}`);
    assert.equal(libraryTextOrient(p, base), p, `${p.id}: its own side changes nothing`);
    assert.equal(libraryTextOrient(p, 'preset'), p);
  }
});

test('a side mirrors turns, origin, scaled axis, blur axis and order, never the text style', () => {
  const arc = text.find(p => p.id === 'text-v3-characters-rotate-arc'), right = libraryTextOrient(arc, 'right'), left = libraryTextOrient(arc, 'left');
  assert.equal(right.rotation[2], -left.rotation[2], 'mirror images turn the other way');
  assert.equal(right.text.origin[0], -left.text.origin[0]);
  const height = text.find(p => p.id === 'text-v3-characters-scale-height'), side = libraryTextOrient(height, 'right');
  assert.deepEqual(side.scale.slice(0, 2), [height.scale[1], height.scale[0]], 'a vertical unfold seen from the side unfolds horizontally');
  const rise = text.find(p => p.id === 'text-v3-characters-position-rise');
  assert.equal(libraryTextOrient(rise, 'left').text.blurAxis, 'x', 'the motion streak follows the travel');
  assert.equal(libraryTextOrient(rise, 'right').text.order, 'reverse', 'units arriving from the right run right to left');
  assert.equal(libraryTextOrient(rise, 'left').text.order ?? 'forward', 'forward');
  const italic = text.find(p => p.text.skew && libraryTextBase(p) !== '');
  for (const s of SIDES) assert.equal(libraryTextOrient(italic, s).text.skew, italic.text.skew, 'italic slant is typography, not direction');
});

test('a motion in place picks the side its sweep starts from', () => {
  for (const id of ['text-v3-characters-fade-cascade', 'text-v3-characters-rotate-turn', 'text-v3-characters-scale-bloom', 'text-v3-words-tracking-spread']) {
    const p = text.find(item => item.id === id);
    assert.equal(libraryUsesDirection(p), true, id);
    assert.deepEqual(libraryTextSweeps(p), ['left', 'right'], id);
    assert.equal(libraryTextOrder(p, 'left', p.text.unit), 'forward', id);
    assert.equal(libraryTextOrder(p, 'right', p.text.unit), 'reverse', id);
    assert.equal(libraryDirectionAllowed(p, 'top'), false, id);
    assert.ok(apart(frames(p, 'left'), frames(p, 'right')), `${id}: left and right sweeps differ in the card`);
  }
  const lines = text.find(p => p.text.unit === 'lines' && p.mode === 'transition' && libraryTextBase(p) === '');
  assert.deepEqual(libraryTextSweeps(lines), ['top', 'bottom']);
  for (const p of text.filter(p => p.text.unit === 'all' || p.mode !== 'transition')) assert.deepEqual(libraryTextSweeps(p), [], p.id);
});

test('scales and spacings in place open from the middle of each line', () => {
  const inPlace = text.filter(p => libraryTextSweeps(p).length && (p.scale[0] || p.scale[1] || p.text.tracking) && !p.text.reveal && !p.text.mask && !p.text.decode);
  assert.ok(inPlace.length > 40, `${inPlace.length} scales and spacings in place`);
  const lopsided = [];
  for (const p of inPlace) {
    const order = libraryTextOrder(p, 'preset', p.text.unit);
    if (order !== 'center-out' && order !== 'edges-in' && order !== 'random') lopsided.push(`${p.id}: ${order}`);
  }
  assert.deepEqual(lopsided, []);
  // Mirror columns of a line weigh the same at every instant.
  const p = text.find(item => item.id === 'text-v3-characters-scale-bloom'), options = {...defaultLibraryOptions(p), phase: 'in', staggerFrames: 3};
  for (const time of [.1, .25, .4]) for (let c = 0; c < 5; c++) {
    const a = librarySample(p, options, time, c, 11, [c, 11]), b = librarySample(p, options, time, 10 - c, 11, [10 - c, 11]);
    assert.ok(Math.abs(a.sx - b.sx) < 1e-9 && Math.abs(a.opacity - b.opacity) < 1e-9, `column ${c} mirrors column ${10 - c} at ${time}s`);
  }
});
