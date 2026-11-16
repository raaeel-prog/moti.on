import test from 'node:test';
import assert from 'node:assert/strict';
import { MOTION_LIBRARY_PRESETS, MOTION_LIBRARY_DEFAULTS, MOTION_SETTLE_DEFAULTS, isMotionLibraryOptions } from '../dist/motion-library.js';
import { MOTION_LIBRARY_MOMENTUM_PRESETS } from '../dist/motion-library-momentum.js';
import { libraryRequiredEffects, motionLibraryRequirements } from '../dist/motion-library-requirements.js';

const momentum = MOTION_LIBRARY_MOMENTUM_PRESETS;

test('Momentum appends twenty original recipes after every earlier collection except text', () => {
  assert.equal(momentum.length, 20);
  assert.deepEqual(MOTION_LIBRARY_PRESETS.filter(p => p.collection !== 'text').slice(-20).map(p => p.id), momentum.map(p => p.id));
  assert.deepEqual(MOTION_LIBRARY_PRESETS.filter(p => p.collection === 'momentum').map(p => p.id), momentum.map(p => p.id));
  const count = category => momentum.filter(p => p.category === category).length;
  assert.deepEqual([count('motion-2d'), count('motion-3d'), count('motion-effects')], [11, 5, 4]);
  for (const p of momentum) {
    assert.match(p.id, /^momentum-[a-z]+(?:-[a-z]+)*$/);
    assert.equal(p.referenceIndex, null);
    assert.equal(p.effect, 'none');
    assert.ok(isMotionLibraryOptions({ ...MOTION_LIBRARY_DEFAULTS, ...p.defaults }), p.id);
  }
});

test('recipes without a fade start hidden by geometry: out of frame or flat on an axis', () => {
  for (const p of momentum.filter(p => p.mode === 'transition' && !p.fade)) {
    const flat = p.scale.slice(0, 2).some(value => value === -100);
    assert.ok(p.travel === 'offscreen' || flat, `${p.id} must leave the frame or start at zero scale`);
  }
});

test('out-of-frame travel declares a screen direction and stays in the composition plane', () => {
  const travel = momentum.filter(p => p.travel === 'offscreen');
  assert.equal(travel.length, 4);
  for (const p of travel) {
    assert.ok(Math.hypot(p.position[0], p.position[1]) > 0, p.id);
    assert.equal(p.position[2], 0, p.id);
    assert.equal(p.category, 'motion-2d', p.id);
  }
});

test('transition centers turn around a distant point with a live Point Control', () => {
  const pivots = momentum.filter(p => p.pivot === 'offset');
  assert.deepEqual(pivots.map(p => p.id), ['momentum-pendulum', 'momentum-deep-pendulum', 'momentum-pendulum-loop']);
  for (const p of pivots) {
    assert.ok(p.rotation[2] && Array.isArray(p.pivotOffset) && Math.hypot(...p.pivotOffset) >= 2, p.id);
    assert.ok(libraryRequiredEffects(p).includes('ADBE Point Control'), p.id);
    assert.ok(motionLibraryRequirements(p).effects.includes('ADBE Point Control'));
  }
  for (const p of MOTION_LIBRARY_PRESETS.filter(p => p.pivot !== 'offset')) assert.ok(!libraryRequiredEffects(p).includes('ADBE Point Control'), p.id);
});

test('settle recipes ship tuned controls and continuous effects pace by speed', () => {
  for (const p of momentum.filter(p => p.easing === 'settle-wave' || p.easing === 'settle-hop')) {
    for (const key of Object.keys(MOTION_SETTLE_DEFAULTS[p.easing])) assert.equal(typeof p.defaults[key], 'number', `${p.id} ${key}`);
  }
  const loops = momentum.filter(p => p.mode === 'continuous');
  assert.deepEqual(loops.map(p => p.waveform), ['cosine', 'heartbeat', 'spin', 'spin', 'blink']);
  for (const p of loops) assert.ok(p.defaults.speed >= 25 && p.defaults.speed <= 200, p.id);
});

test('settle defaults agree between the shared curve and the panel', async () => {
  const { libraryEase } = await import('../dist/motion-library-math.js');
  for (const kind of ['settle-wave', 'settle-hop']) {
    const d = MOTION_SETTLE_DEFAULTS[kind];
    for (let i = 0; i <= 200; i++) {
      const t = i / 200;
      assert.equal(libraryEase(t, kind, 0), libraryEase(t, kind, 0, d.settleAmount, d.settleCount, d.settleDamping), `${kind} @${t}`);
    }
  }
});
