import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const compiled = await build({stdin: {contents: 'export * from "./client/src/preset-direction-cycle.ts"; export { GALLERY_PRESETS } from "./client/src/preset-gallery.ts"; export { libraryUsesDirection, libraryTextSweeps } from "../../packages/contracts/src/index.ts";', resolveDir: fileURLToPath(new URL('..', import.meta.url))}, bundle: true, format: 'esm', platform: 'node', write: false});
const {cardDirections, cycleDirection, directionBadge, GALLERY_PRESETS, libraryUsesDirection, libraryTextSweeps} = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
const directional = GALLERY_PRESETS.map(p => p.motion).filter(p => p && libraryUsesDirection(p));

test('every directional recipe offers its own start first and at least one side', () => {
  assert.ok(directional.length > 100, `${directional.length} directional recipes`);
  for (const p of directional) {
    const list = cardDirections(p);
    assert.equal(list[0], 'preset', p.id);
    assert.ok(list.length >= 2, `${p.id} has a side to switch to`);
  }
});

test('Alt+Up/Down walks the variants in a ring, both ways', () => {
  for (const p of directional) {
    const list = cardDirections(p);
    let forward = 'preset';
    for (let i = 0; i < list.length; i++) forward = cycleDirection(p, forward, 1);
    assert.equal(forward, 'preset', `${p.id}: a full turn comes back`);
    assert.equal(cycleDirection(p, 'preset', -1), list[list.length - 1], `${p.id}: backward wraps to the last side`);
  }
});

test('a sweep only offers the sides it supports', () => {
  const swept = directional.find(p => libraryTextSweeps(p).length > 0);
  assert.ok(swept, 'a text sweep exists');
  assert.deepEqual(cardDirections(swept).slice(1), ['bottom', 'left', 'right', 'top'].filter(side => libraryTextSweeps(swept).includes(side)));
});

test('a diagonal chosen in Edit restarts the ring from the original', () => {
  const p = directional.find(item => cardDirections(item).length === 5);
  assert.equal(cycleDirection(p, 'top-left', 1), 'bottom');
});

test('the badge points the way the motion travels and stays off for the original', () => {
  assert.equal(directionBadge('preset'), null);
  assert.equal(directionBadge(undefined), null);
  assert.equal(directionBadge('bottom'), '↑');
  assert.equal(directionBadge('left'), '→');
  assert.equal(directionBadge('right'), '←');
  assert.equal(directionBadge('top'), '↓');
});
