import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { createManualEnv } from './motion-env.mjs';

const built = await build({ entryPoints: [fileURLToPath(new URL('../client/src/chip-glide.ts', import.meta.url))], bundle: true, platform: 'node', format: 'esm', write: false });
const glide = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);

function chip(left, active) {
  const attributes = { class: 'ch-chip', 'data-active': String(active) };
  return { offsetLeft: left, offsetTop: 0, offsetWidth: 60, offsetHeight: 28, classList: { contains: name => name === 'ch-chip' }, getAttribute: name => attributes[name] ?? null, setAttribute(name, value) { attributes[name] = String(value); } };
}
function group(className, activeIndex) {
  const attributes = { class: `ch-chip-group ${className}` };
  const chips = [chip(0, activeIndex === 0), chip(64, activeIndex === 1), chip(128, activeIndex === 2)];
  const node = {
    children: [...chips], attributes,
    ownerDocument: { createElement: () => { const own = {}; return { style: {}, classList: { contains: name => (own.class ?? '').includes(name) }, set className(value) { own.class = value; }, getAttribute: name => own[name] ?? null, setAttribute(name, value) { own[name] = String(value); } }; } },
    getAttribute: name => attributes[name] ?? null, setAttribute(name, value) { attributes[name] = String(value); },
    querySelector: () => chips[activeIndex] ?? null,
    get firstChild() { return node.children[0]; },
    insertBefore(child) { node.children.unshift(child); }
  };
  return node;
}
const root = groups => ({ querySelectorAll: () => groups });

test('the ring key follows the most specific class, so redraws find their old place', () => {
  assert.equal(glide.glideKey({ getAttribute: () => 'ch-chip-group ch-camera-modes', id: '' }), 'ch-camera-modes');
  assert.equal(glide.placeSignature({ left: 1, top: 2, width: 3, height: 4 }), '1,2,3,4');
});

test('a redrawn group starts its ring at the old chip and travels to the new one on the next frame', () => {
  glide.resetChipGlides();
  const clock = createManualEnv();
  glide.glideChipGroups(root([group('ch-camera-modes', 0)]), clock.env);
  const redrawn = group('ch-camera-modes', 2);
  glide.glideChipGroups(root([redrawn]), clock.env);
  const ring = redrawn.children[0];
  assert.equal(ring.style.transform, 'translate(0px, 0px)', 'starts where the previous ring was');
  assert.equal(ring.getAttribute('data-ready'), 'false');
  clock.advance(20);
  assert.equal(ring.style.transform, 'translate(128px, 0px)');
  assert.equal(ring.getAttribute('data-ready'), 'true');
  glide.glideChipGroups(root([redrawn]), clock.env);
  assert.equal(ring.getAttribute('data-ready'), 'true', 'a second pass on the same chip never restarts the slide');
});

test('with reduced motion the ring is simply on the active chip', () => {
  glide.resetChipGlides();
  const clock = createManualEnv({ reduced: true });
  glide.glideChipGroups(root([group('ch-parallax-segments', 0)]), clock.env);
  const next = group('ch-parallax-segments', 1);
  glide.glideChipGroups(root([next]), clock.env);
  assert.equal(next.children[0].style.transform, 'translate(64px, 0px)');
  assert.equal(clock.pendingFrames, 0);
});
