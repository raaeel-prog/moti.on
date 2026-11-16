import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

// Catalog quality rules from the 2026-10-14 audit of the layer motion presets,
// measured with the same preview that the gallery draws.
const load = async entry => { const out = await build({ entryPoints: [fileURLToPath(new URL(entry, import.meta.url))], bundle: true, format: 'esm', platform: 'node', write: false });
  return import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString('base64')}`); };
const preview = await load('../client/src/motion-library-preview.ts');
const contracts = await load('../../../packages/contracts/src/index.ts');
const layerTransitions = contracts.MOTION_LIBRARY_PRESETS.filter(p => p.mode === 'transition' && !p.category.startsWith('text-') && !p.cameraSpec && !p.id.startsWith('camera-'));
const entrance = p => ({ ...contracts.MOTION_LIBRARY_DEFAULTS, ...p.defaults, phase: 'in' });

/** Peak speed per frame at 30 fps: pixels at 1080 (X, Y and Z) and degrees. */
function peaks(p) {
  const options = entrance(p); let travel = 0, turn = 0, previous;
  for (let frame = 0; frame <= options.durationFrames + 2; frame++) {
    const s = preview.librarySample(p, options, frame / 30);
    if (previous) {
      travel = Math.max(travel, Math.hypot((s.x - previous.x) * 6, (s.y - previous.y) * 6, (s.z - previous.z) * 6));
      turn = Math.max(turn, Math.abs(s.rx - previous.rx), Math.abs(s.ry - previous.ry), Math.abs(s.rz - previous.rz));
    }
    previous = s;
  }
  return { travel, turn };
}

test('fast transitions apply with motion blur on, and only those', () => {
  const fast = layerTransitions.filter(p => { const { travel, turn } = peaks(p); return travel > 40 || turn > 8; }).map(p => p.id);
  assert.deepEqual([...contracts.MOTION_BLUR_BY_DEFAULT].sort(), [...fast].sort());
  for (const p of contracts.MOTION_LIBRARY_PRESETS) assert.equal(p.defaults?.motionBlur === true, contracts.MOTION_BLUR_BY_DEFAULT.has(p.id), p.id);
  assert.ok(contracts.isMotionLibraryOptions(entrance(contracts.MOTION_LIBRARY_PRESETS.find(p => p.id === 'momentum-push'))));
});

test('no two layer transitions with the same effect move alike', () => {
  const signature = p => {
    const options = { ...entrance(p), durationFrames: 24 }, values = [];
    for (let frame = 0; frame <= 24; frame++) {
      const s = preview.librarySample(p, options, frame / 30);
      values.push(s.x / 30, s.y / 30, s.z / 30, s.rx / 90, s.ry / 90, s.rz / 90, s.sx - 1, s.sy - 1, s.opacity - 1);
    }
    return values;
  };
  const signatures = layerTransitions.map(signature), close = [];
  for (let i = 0; i < layerTransitions.length; i++) for (let j = i + 1; j < layerTransitions.length; j++) {
    if (layerTransitions[i].effect !== layerTransitions[j].effect) continue;
    const distance = Math.sqrt(signatures[i].reduce((sum, value, k) => sum + (value - signatures[j][k]) ** 2, 0) / signatures[i].length);
    if (distance < .04) close.push(`${layerTransitions[i].id} ~ ${layerTransitions[j].id} (${distance.toFixed(3)})`);
  }
  assert.deepEqual(close, []);
});

test('former fixed bounces keep their feel as a Hop settle with live controls', () => {
  for (const id of ['bounce-pop', 'bounce-flip', 'glitch-slide', 'aggressive-orbit']) {
    const p = contracts.MOTION_LIBRARY_PRESETS.find(item => item.id === id);
    assert.equal(p.easing, 'settle-hop', id);
    const { settleAmount, settleCount, settleDamping } = p.defaults;
    let error = 0;
    for (let i = 0; i <= 400; i++) { const t = i / 400; error += (contracts.libraryEase(t, 'bounce') - contracts.libraryEase(t, 'settle-hop', 0, settleAmount, settleCount, settleDamping)) ** 2; }
    assert.ok(Math.sqrt(error / 401) < .05, `${id} drifts from its former bounce`);
  }
  assert.ok(!layerTransitions.some(p => p.easing === 'bounce'), 'the fixed bounce stays available as a curve choice only');
});

test('the cinematic pan glides sideways with a long tail', () => {
  const pan = contracts.MOTION_LIBRARY_PRESETS.find(p => p.id === 'cinematic-pan');
  assert.ok(Math.abs(pan.position[0]) > 0 && pan.position[1] === 0, 'horizontal');
  assert.equal(pan.easing, 'drift'); assert.ok(pan.defaults.durationFrames >= 36);
});
