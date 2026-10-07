import test from 'node:test';
import assert from 'node:assert/strict';
import { MOTION_LIBRARY_PRESETS, MOTION_LIBRARY_DEFAULTS, isMotionLibraryOptions } from '../dist/motion-library.js';
import { MOTION_LIBRARY_NATIVE_PRESETS } from '../dist/motion-library-native.js';

test('native collection appends four original recipes without changing the 136 previous recipes', () => {
  const old = MOTION_LIBRARY_PRESETS.filter(p => p.collection !== 'native' && p.collection !== 'premium');
  assert.equal(old.length, 136);
  assert.deepEqual(MOTION_LIBRARY_PRESETS.filter(p => p.collection === 'native'), MOTION_LIBRARY_NATIVE_PRESETS);
  assert.deepEqual(MOTION_LIBRARY_NATIVE_PRESETS.map(p => [p.id, p.category, p.mode, p.effect, p.effectAmount]), [
    ['native-rgb', 'motion-effects', 'static', 'native-rgb', 12],
    ['native-rgb-reveal', 'motion-effects', 'transition', 'native-rgb', 36],
    ['native-text-chromatic', 'text-characters', 'transition', 'native-rgb', 20],
    ['native-glitch-title', 'text-effects', 'transition', 'native-glitch', 32]
  ]);
  for (const p of MOTION_LIBRARY_NATIVE_PRESETS) {
    assert.equal(p.referenceIndex, null);
    assert.equal(p.collection, 'native');
    assert.ok(isMotionLibraryOptions({...MOTION_LIBRARY_DEFAULTS, ...p.defaults}), p.id);
  }
  assert.equal(MOTION_LIBRARY_PRESETS.find(p => p.id === 'channel-offset').effect, 'rgb');
  assert.equal(MOTION_LIBRARY_PRESETS.find(p => p.id === 'two-tone-offset').effect, 'chroma2');
});
