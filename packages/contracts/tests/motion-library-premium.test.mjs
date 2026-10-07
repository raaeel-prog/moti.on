import test from 'node:test';
import assert from 'node:assert/strict';
import { MOTION_LIBRARY_PREMIUM_PRESETS as presets } from '../dist/motion-library-premium.js';
import { MOTION_LIBRARY_DEFAULTS, isMotionLibraryOptions } from '../dist/motion-library.js';
import { libraryChoreography, libraryEase } from '../dist/motion-library-math.js';

test('authored collection provides distinct 2D, perspective and text choreography', () => {
  assert.equal(presets.length, 41);
  for (const [category, count] of [['motion-2d',6],['motion-3d',6],['text-characters',12],['text-words',10],['text-lines',7]]) {
    assert.equal(presets.filter(p => p.category === category).length, count, category);
  }
  const paths = new Set(presets.map(p => p.choreography.path));
  assert.equal(paths.size, 5);
  for (const p of presets) {
    assert.ok(isMotionLibraryOptions({...MOTION_LIBRARY_DEFAULTS, ...p.defaults}), p.id);
    assert.equal(p.referenceIndex, null);
    assert.equal(p.collection, 'premium');
    assert.equal(p.fade, true);
    assert.ok(p.id.startsWith('premium-'));
    const c = p.choreography;
    assert.deepEqual(libraryChoreography(1, 0, ...p.position, c.path, c.distribution || 'uniform', 0, 17, c.turns || 1, 'preset'), [0,0,0,0,0,0], `${p.id} must reach original pose exactly`);
  }
});

test('motion silhouettes differ over time, not only in localized names', () => {
  const signatures = presets.filter(p => p.category.startsWith('motion-')).map(p => {
    const c = p.choreography;
    return [0.12,0.38,0.66].map(t => {
      const w = 1 - libraryEase(t, p.easing, (p.defaults.elasticity || 0));
      const v = libraryChoreography(t, w, ...p.position, c.path, c.distribution || 'uniform', 0, 17, c.turns || 1, 'preset');
      return [...v.slice(0,3), ...p.rotation.map(x => x*v[3]), p.scale[0]*v[4], p.scale[1]*v[5]].map(x => Math.round(x*100));
    });
  });
  assert.equal(new Set(signatures.map(s => JSON.stringify(s))).size, signatures.length);
});

test('order and seed are bounded, optional, serializable controls', () => {
  for (const order of ['preset','forward','reverse','center-out','edges-in','random']) {
    assert.ok(isMotionLibraryOptions({...MOTION_LIBRARY_DEFAULTS, order, seed: 9999}));
  }
  for (const seed of [-1,10000,1.5,NaN,Infinity,'17',null,undefined]) {
    assert.equal(isMotionLibraryOptions({...MOTION_LIBRARY_DEFAULTS, seed}), false);
  }
  assert.equal(isMotionLibraryOptions({...MOTION_LIBRARY_DEFAULTS, order:'shuffle'}), false);
  const descriptor = {...MOTION_LIBRARY_DEFAULTS};
  Object.defineProperty(descriptor, 'seed', {get() {throw new Error('accessor must not execute');}});
  assert.equal(isMotionLibraryOptions(descriptor), false);
  const typewriter = presets.find(p => p.text.reveal === 'typewriter');
  assert.ok(typewriter);
  assert.deepEqual(typewriter.position, [0,0,0]);
});
