import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

async function load(file) {
  const built = await build({ entryPoints: [fileURLToPath(new URL(`../client/src/${file}`, import.meta.url))], bundle: true, platform: 'node', format: 'esm', write: false });
  return import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);
}
const oneClick = await load('tool-one-click.ts');

test('tools that need a choice open their page; the rest apply or run on one click', () => {
  // Arrange / Act / Assert
  assert.equal(oneClick.toolClickMode('wiggle'), 'apply');
  assert.equal(oneClick.toolClickMode('flicker'), 'apply');
  assert.equal(oneClick.toolClickMode('reverseOrder'), 'run');
  for (const id of ['gradient', 'rename', 'parent', 'shapeLibrary', 'cameraTransition', 'styleSwap', 'lookAt', 'particles', 'texture', 'clean', 'parallax']) {
    assert.equal(oneClick.toolClickMode(id), 'open', id);
  }
});

test('the Edit button remembers effects per selection, newest first, without duplicates', () => {
  const applied = oneClick.createAppliedTools();
  applied.record('comp|A', 'wiggle');
  applied.record('comp|A', 'flicker');
  applied.record('comp|A', 'wiggle');
  applied.record('comp|B', 'smooth');
  assert.deepEqual(applied.list('comp|A'), ['wiggle', 'flicker']);
  assert.deepEqual(applied.list('comp|B'), ['smooth']);
  applied.forget('comp|A', 'wiggle');
  assert.deepEqual(applied.list('comp|A'), ['flicker']);
  applied.forget('comp|B', 'smooth');
  assert.deepEqual(applied.list('comp|B'), []);
  applied.record('', 'wiggle');
  assert.deepEqual(applied.list(''), [], 'no selection, nothing to remember');
});

test('presets: Float is the default draft and drift stays within the amplitude', async () => {
  const presets = await load('tool-presets.ts');
  const float = presets.WIGGLE_PRESETS[0];
  assert.equal(float.id, 'float');
  assert.equal(presets.matchWigglePreset({ frequency: 0.35, amplitude: 28, octaves: 2, amplitudeMultiplier: 0.5, rotation: 0.6 }, 2)?.id, 'float', '4K doubles the pixels');
  assert.equal(presets.matchWigglePreset({ frequency: 2, amplitude: 20, octaves: 1, amplitudeMultiplier: 0.5 }, 1), null);
  assert.equal(presets.matchFlickerPreset({ rate: 9, minFactor: 0.55, maxFactor: 1 })?.id, 'failing');
  let peak = 0, diagonal = 0;
  for (let t = 0; t < 30; t += 0.05) {
    const { x, y } = presets.driftOffset(t, float);
    peak = Math.max(peak, Math.hypot(x, y));
    if (Math.abs(x) > 3 && Math.abs(y) > 3) diagonal += 1;
  }
  assert.ok(peak <= float.amplitude * 1.6, `peak ${peak}`);
  assert.ok(diagonal > 50, 'the path visits the diagonals, not only one axis at a time');
});

test('host: Wiggle v3 (Float) renders an expression that runs and keeps rotation axes apart', () => {
  const source = readFileSync(new URL('../host/src/quick-effects.jsx', import.meta.url), 'utf8')
    .replace('global.MotionQuickEffects = { prepare: prepare,', 'global.MotionQuickEffects = { render: render, prepare: prepare,');
  const scope = { $: { global: {} }, MotionJson: JSON, PropertyValueType: { COLOR: 6 }, MotionLiveControls: { expressionReference: r => `ctl(${JSON.stringify(r.paramId)})` } };
  runInNewContext(source, scope);
  const effects = scope.$.global.MotionQuickEffects;
  const records = ['frequency', 'amplitude', 'seed', 'intensity', 'enabled', 'octaves', 'amplitudeMultiplier', 'axes'].map((paramId, i) => ({ paramId, name: 'Moti.on · Wiggle', matchName: 'Pseudo/X', propertyIndex: i + 1 }));
  const controls = { frequency: 0.35, amplitude: 14, seed: 0, intensity: 100, enabled: 1, octaves: 2, amplitudeMultiplier: 0.5, axes: 7 };
  const noise = ([x, s]) => Math.sin(x * 1.7 + s) * Math.cos(x * 0.6 - s * 0.3);
  const ease = (t, a, b, v1, v2) => v1 + (v2 - v1) * Math.max(0, Math.min(1, (t - a) / (b - a)));
  const run = (meta, value, time) => {
    const body = effects.render(meta).split('\n').slice(1).join('\n').replace(/result;$/, 'return result;');
    return new Function('value', 'time', 'inPoint', 'noise', 'ease', 'ctl', body)(value, time, 0, noise, ease, p => controls[p]);
  };
  const rotX = { version: 3, kind: 'wiggle', records, axis: 10 };
  const rotZ = { version: 3, kind: 'wiggle', records };
  assert.equal(run(rotZ, 0, 0), 0, 'starts still: soft entry from the layer in point');
  const position = run({ version: 3, kind: 'wiggle', records }, [960, 540], 5);
  assert.ok(position.every(Number.isFinite));
  assert.notEqual(run(rotX, 0, 5), run(rotZ, 0, 5), 'X and Z rotation sway differently');
  assert.ok(effects.metadata(effects.render(rotX), 'wiggle'), 'the managed expression is recognized again');
});
