import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const load = async entry => {
  const built = await build({ entryPoints: [fileURLToPath(new URL(entry, import.meta.url))], bundle: true, platform: 'node', format: 'esm', write: false });
  return import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);
};
const { AE_MOTION_CATALOG, AE_EASINGS } = await load('../client/src/motion/catalog.ts');
const { MOTION_CATALOG } = await load('../../../packages/ui-motion/src/index.ts');
const aeTokens = await readFile(new URL('../../../packages/ui-tokens/src/after-effects.css', import.meta.url), 'utf8');
const sharedTokens = await readFile(new URL('../../../packages/ui-tokens/src/tokens.css', import.meta.url), 'utf8');
const motionCss = await readFile(new URL('../../../packages/ui-core/src/ae-motion.css', import.meta.url), 'utf8');

function tokenValue(name) {
  const pattern = new RegExp(`${name.replace(/[-]/g, '\\-')}\\s*:\\s*([^;]+);`);
  return (aeTokens.match(pattern) ?? sharedTokens.match(pattern))?.[1]?.trim() ?? null;
}

test('AE catalog continues the shared numbering without touching it', () => {
  assert.equal(MOTION_CATALOG.length, 35, 'the shared catalog stays as Premiere ships it');
  AE_MOTION_CATALOG.forEach((motion, index) => assert.equal(motion.number, MOTION_CATALOG.length + 1 + index, motion.id));
  const shared = new Set(MOTION_CATALOG.map(motion => motion.id));
  const ids = AE_MOTION_CATALOG.map(motion => motion.id);
  assert.equal(new Set(ids).size, ids.length, 'unique ids');
  for (const id of ids) assert.ok(!shared.has(id), `${id} collides with the shared catalog`);
  for (const motion of AE_MOTION_CATALOG) assert.ok(Object.isFrozen(motion) && Object.isFrozen(motion.durationMs), `${motion.id} is frozen`);
});

test('kinds keep their duration budgets and curves', () => {
  for (const motion of AE_MOTION_CATALOG) {
    const longest = Math.max(...motion.durationMs);
    if (motion.kind === 'transition') assert.ok(longest <= 360, `${motion.id}: transitions stay within 360 ms`);
    if (motion.kind === 'spatial') {
      assert.ok(longest <= 480, `${motion.id}: spatial motion stays within 480 ms`);
      assert.ok(['--ease-spring', '--ease-glide', '--ease-sheet'].includes(motion.easingToken), `${motion.id}: spatial motion uses spring, glide or sheet`);
      assert.ok(['instant', 'opacity-only'].includes(motion.reducedMotion), `${motion.id}: spatial motion collapses when reduced`);
    }
    if (longest > 480) assert.ok(['feedback', 'progress'].includes(motion.kind), `${motion.id}: only feedback or progress run longer`);
    if (motion.properties.includes('height')) assert.equal(motion.id, 'height-glide', 'height animates only in the explicit glide');
  }
});

test('durations and curves equal the token literals', () => {
  for (const motion of AE_MOTION_CATALOG) {
    motion.durationTokens.forEach((token, index) => {
      assert.equal(tokenValue(token), `${motion.durationMs[index]}ms`, `${motion.id}: ${token}`);
    });
    if (motion.easingToken) {
      const tuple = AE_EASINGS[motion.easingToken];
      assert.ok(tuple, `${motion.id}: ${motion.easingToken} has JS control points`);
      const css = tokenValue(motion.easingToken).match(/cubic-bezier\(([^)]+)\)/)[1].split(',').map(Number);
      assert.deepEqual(css, [...tuple], `${motion.easingToken}: CSS and JS curves match`);
    }
    if (motion.delayToken) assert.match(tokenValue(motion.delayToken) ?? '', /^\d+ms$/, `${motion.id}: ${motion.delayToken}`);
  }
});

test('every AE motion id has its rule in ae-motion.css', () => {
  for (const motion of AE_MOTION_CATALOG) assert.ok(motionCss.includes(`[data-motion~="${motion.id}"]`), motion.id);
});
