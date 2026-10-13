import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { fixture } from './preset-phases-harness.mjs';

// Momentum (Impulso): settles tuned live, travel measured out of the frame and
// turns around a distant transition center, applied through the panel's paths.
const compiled = await build({ stdin: { contents: 'export * from "./motion-library.ts";', resolveDir: fileURLToPath(new URL('../../../packages/contracts/src', import.meta.url)) }, bundle: true, format: 'esm', platform: 'node', write: false });
const { MOTION_LIBRARY_PRESETS, MOTION_SETTLE_DEFAULTS } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
const momentum = MOTION_LIBRARY_PRESETS.filter(p => p.collection === 'momentum');
const transitions = momentum.filter(p => p.mode === 'transition');
const control = (f, label) => f.layer.effects.children.find(e => e.name.endsWith(` · ${label}`))?.property(1);
const at = (f, name, time) => f.layer.transform.property(name).valueAtTime(time);
const close = (a, b, tolerance = 1e-6) => assert.ok(Math.abs(a - b) <= tolerance, `${a} ≠ ${b}`);
const MARGIN = Math.max(8, .02 * 1920);

/** The fixture layer is a 100x100 source with Anchor Point (50, 50) in a 1920x1080 composition. */
function compCorners(f, time) {
  const p = at(f, 'ADBE Position', time), s = at(f, 'ADBE Scale', time), r = at(f, 'ADBE Rotate Z', time) * Math.PI / 180;
  return [[0, 0], [100, 0], [0, 100], [100, 100]].map(([x, y]) => {
    const a = (x - 50) * s[0] / 100, b = (y - 50) * s[1] / 100;
    return [p[0] + a * Math.cos(r) - b * Math.sin(r), p[1] + a * Math.sin(r) + b * Math.cos(r)];
  });
}
function hidden(f, time) {
  if (at(f, 'ADBE Opacity', time) < 1e-6) return true;
  const s = at(f, 'ADBE Scale', time);
  if (Math.abs(s[0]) < 1e-6 || Math.abs(s[1]) < 1e-6) return true;
  const c = compCorners(f, time);
  return c.every(p => p[0] < 0) || c.every(p => p[0] > 1920) || c.every(p => p[1] < 0) || c.every(p => p[1] > 1080);
}
async function applied(id, overrides = {}, setup = () => {}) {
  const f = await fixture(); setup(f);
  const p = momentum.find(p => p.id === id);
  f.run(p.mode === 'transition' ? 'phase-apply' : 'apply', f.args(id, overrides));
  return f;
}

test('every Momentum transition applies in, out and both: finite, hidden at the edges and neutral at rest', async () => {
  assert.equal(transitions.length, 14);
  for (const p of transitions) for (const phase of ['in', 'out', 'both']) {
    const f = await applied(p.id, { phase }), label = `${p.id} ${phase}`;
    for (let frame = 0; frame <= 120; frame++) for (const name of ['ADBE Position', 'ADBE Scale', 'ADBE Rotate Z', 'ADBE Opacity']) {
      const value = at(f, name, frame / 30);
      assert.ok([].concat(value).every(Number.isFinite), `${label} ${name} @${frame}`);
    }
    assert.deepEqual(Array.from(at(f, 'ADBE Position', 2)).slice(0, 2), [300, 200], `${label} rest position`);
    assert.deepEqual(Array.from(at(f, 'ADBE Scale', 2)).slice(0, 2), [100, 100], `${label} rest scale`);
    close(at(f, 'ADBE Rotate Z', 2), 0); assert.equal(at(f, 'ADBE Opacity', 2), 100, label);
    if (phase !== 'out') assert.ok(hidden(f, 0), `${label} starts hidden`);
    if (phase !== 'in') assert.ok(hidden(f, 4), `${label} ends hidden`);
    if (p.category === 'motion-3d') assert.equal(f.layer.threeDLayer, true, label);
  }
});

test('ricochet and hop controls are live sliders and an exit anticipates before leaving', async () => {
  const f = await applied('momentum-push', { phase: 'in' });
  assert.deepEqual([control(f, 'Ricochete (%)').value, control(f, 'Oscilações').value, control(f, 'Amortecimento (%)').value], [30, 2, 55]);
  const before = at(f, 'ADBE Position', .5)[1];
  control(f, 'Ricochete (%)').value = 90;
  assert.notEqual(at(f, 'ADBE Position', .5)[1], before, 'the slider changes the settle without reapplying');
  const exit = await applied('momentum-push', { phase: 'out' });
  // Push leaves downward: the anticipation first pulls the layer up.
  const early = Array.from({ length: 10 }, (_, i) => at(exit, 'ADBE Position', 3 + i / 30)[1]);
  assert.ok(Math.min(...early) < 200 - 1, 'exit pulls back first');
  const hop = await applied('momentum-push-grow', { phase: 'in' });
  assert.deepEqual([control(hop, 'Ricochete (%)').value, control(hop, 'Oscilações').value, control(hop, 'Amortecimento (%)').value], [36, 3, 62]);
  const switched = await applied('momentum-zoom-through', { phase: 'in', easing: 'settle-hop' });
  // The host's own fallbacks match the shared defaults the panel shows.
  assert.deepEqual([control(switched, 'Ricochete (%)').value, control(switched, 'Oscilações').value, control(switched, 'Amortecimento (%)').value], Object.values(MOTION_SETTLE_DEFAULTS['settle-hop']), 'any recipe can switch to a settle');
  const wave = await applied('momentum-zoom-through', { phase: 'in', easing: 'settle-wave' });
  assert.deepEqual([control(wave, 'Ricochete (%)').value, control(wave, 'Oscilações').value, control(wave, 'Amortecimento (%)').value], Object.values(MOTION_SETTLE_DEFAULTS['settle-wave']));
});

test('out-of-frame travel is measured in the composition and ignores Intensity', async () => {
  let f = await applied('momentum-push', { phase: 'in' });
  close(control(f, 'Distância (px)').value, 1080 - 150 + MARGIN, 1e-2);
  close(at(f, 'ADBE Position', 0)[1], 200 + control(f, 'Distância (px)').value, 1e-6);
  f = await applied('momentum-push', { phase: 'in', direction: 'left' });
  close(control(f, 'Distância (px)').value, 350 + MARGIN, 1e-2);
  f = await applied('momentum-push', { phase: 'in', intensity: 40 });
  assert.ok(hidden(f, 0), 'a lower intensity still starts out of frame');
  f = await applied('momentum-push-spin', { phase: 'in' });
  close(control(f, 'Distância (px)').value, 300 + Math.hypot(50, 50) + MARGIN, 1e-2);
  f = await applied('momentum-push-shrink', { phase: 'in' });
  close(control(f, 'Distância (px)').value, 200 + 3 * Math.hypot(50, 50) + MARGIN, 1e-2);
});

test('travel follows rotated and scaled 2D parents and keeps an edited distance until the direction changes', async () => {
  const f = await applied('momentum-push', { phase: 'in' }, f => {
    const parent = new f.Layer(false), t = parent.transform;
    t.property('ADBE Anchor Point').value = [0, 0, 0]; t.property('ADBE Position').value = [960, 540, 0];
    t.property('ADBE Scale').value = [200, 200, 100]; t.property('ADBE Rotate Z').value = 90; f.layer.parent = parent;
  });
  // Parent maps (x, y) to (960 - 2y, 540 + 2x): the start offset must move straight down on screen.
  const rest = at(f, 'ADBE Position', 2), start = at(f, 'ADBE Position', 0), d = [start[0] - rest[0], start[1] - rest[1]];
  const screen = [-2 * d[1], 2 * d[0]], travel = control(f, 'Distância (px)').value;
  close(screen[0], 0, 1e-6); close(screen[1], travel, 1e-6);
  const corners = [[0, 0], [100, 100]].map(([x, y]) => [300 + x - 50, 200 + y - 50]).map(([x, y]) => [960 - 2 * y, 540 + 2 * x]);
  close(travel, 1080 - Math.min(...corners.map(c => c[1])) + MARGIN, 1e-2);

  const g = await applied('momentum-push', { phase: 'in' }), edited = control(g, 'Distância (px)');
  edited.value = 2000;
  g.run('phase-apply', g.args('momentum-push', { phase: 'in', durationFrames: 40 }));
  assert.equal(control(g, 'Distância (px)').value, 2000, 'an edited distance survives a rebuild');
  g.run('phase-apply', g.args('momentum-push', { phase: 'in', direction: 'left' }));
  close(control(g, 'Distância (px)').value, 350 + MARGIN, 1e-2);
});

test('out-of-frame recipes refuse 3D layers and 3D parents before any change', async () => {
  for (const setup of [f => { f.layer.threeDLayer = true; }, f => { const parent = new f.Layer(false); parent.threeDLayer = true; f.layer.parent = parent; }]) {
    const f = await fixture(); setup(f);
    const before = f.mutations, error = f.handler('phase-apply').preflight(f.args('momentum-push', { phase: 'in' }));
    assert.equal(error.code, 'CAPABILITY_UNAVAILABLE'); assert.match(error.message, /sai do quadro em 2D/);
    assert.equal(f.mutations, before);
  }
});

/** World position of a layer-space point at time t (no parent). */
function world(f, point, time) {
  const p = at(f, 'ADBE Position', time), r = at(f, 'ADBE Rotate Z', time) * Math.PI / 180, a = f.layer.transform.property('ADBE Anchor Point').value;
  const x = point[0] - a[0], y = point[1] - a[1];
  return [p[0] + x * Math.cos(r) - y * Math.sin(r), p[1] + x * Math.sin(r) + y * Math.cos(r)];
}
test('the transition center stays fixed while the layer turns, follows live edits and survives a rebuild', async () => {
  for (const base of [0, 30]) {
    const f = await applied('momentum-pendulum', { phase: 'both' }, f => { f.layer.transform.property('ADBE Rotate Z').value = base; });
    const center = control(f, 'Centro da transição');
    assert.deepEqual(Array.from(center.value), [50, 50 - 2.4 * 100]);
    const rest = world(f, center.value, 2);
    let turned = 0;
    for (let frame = 0; frame <= 120; frame++) {
      const time = frame / 30, now = world(f, center.value, time);
      close(now[0], rest[0]); close(now[1], rest[1]);
      if (Math.abs(at(f, 'ADBE Rotate Z', time) - base) > 1) turned++;
    }
    assert.ok(turned > 10, 'the layer actually swings');
    // Entrance and exit keep independent controls, like their durations.
    const centers = f.layer.effects.children.filter(e => e.name.endsWith(' · Centro da transição')).map(e => e.property(1));
    assert.equal(centers.length, 2);
    for (const c of centers) c.value = [120, -60];
    const moved = world(f, [120, -60], 2);
    for (const time of [.1, .4, 3.7]) { const now = world(f, [120, -60], time); close(now[0], moved[0]); close(now[1], moved[1]); }
    f.run('phase-apply', f.args('momentum-pendulum', { phase: 'both', durationFrames: 50 }));
    for (const e of f.layer.effects.children.filter(e => e.name.endsWith(' · Centro da transição'))) assert.deepEqual(Array.from(e.property(1).value), [120, -60]);
  }
});

test('the deep pendulum turns around its center in the layer plane and refuses tilted 3D layers', async () => {
  const f = await applied('momentum-deep-pendulum', { phase: 'in' });
  assert.equal(f.layer.threeDLayer, true);
  const center = control(f, 'Centro da transição').value, rest = world(f, center, 2);
  for (const time of [0, .3, .8, 1.2]) { const now = world(f, center, time); close(now[0], rest[0]); close(now[1], rest[1]); }
  assert.ok(at(f, 'ADBE Position', 0)[2] > 100, 'it also travels in depth');
  const tilted = await fixture();
  tilted.layer.threeDLayer = true; tilted.layer.transform.property('ADBE Rotate X').value = 12;
  const error = tilted.handler('phase-apply').preflight(tilted.args('momentum-deep-pendulum', { phase: 'in' }));
  assert.match(error.message, /Orientation/);
});

test('steady spin turns in degrees per second paced by Speed, and blink only shows or hides', async () => {
  const f = await applied('momentum-spin-loop');
  close(at(f, 'ADBE Rotate Z', 1), 90); close(at(f, 'ADBE Rotate Z', 2), 180);
  control(f, 'Velocidade (%)').value = 50;
  close(at(f, 'ADBE Rotate Z', 2), 90);
  const g = await applied('momentum-blink'), values = new Set();
  for (let frame = 0; frame <= 120; frame++) values.add(at(g, 'ADBE Opacity', frame / 30));
  assert.deepEqual([...values].sort((a, b) => a - b), [0, 100]);
});

test('removing both phases restores the layer exactly', async () => {
  const f = await applied('momentum-pendulum', { phase: 'both' });
  let state = f.run('inspect').data;
  assert.equal(state.state, 'ready');
  assert.ok(state.phases.every(phase => !('center' in phase.options) && !('travel' in phase.options)), 'geometry stays out of panel options');
  assert.ok(state.phases[0].controls.some(c => c.key === 'settleAmount'));
  f.run('phase-action', { target: state.target, phase: 'in', action: 'remove' });
  state = f.run('inspect').data;
  f.run('phase-action', { target: state.target, phase: 'out', action: 'remove' });
  assert.equal(f.layer.comment, 'Keep this comment'); assert.equal(f.layer.effects.numProperties, 0); assert.equal(f.layer.markers.numKeys, 0);
  for (const name of ['ADBE Position', 'ADBE Rotate Z', 'ADBE Opacity']) assert.equal(f.layer.transform.property(name).expression, '', name);
});

test('recipes hidden at zero scale stay flat, never mirrored, above 100% Intensity', async () => {
  for (const id of ['momentum-twist', 'momentum-stretch-x', 'momentum-push-grow']) for (const intensity of [150, 300]) {
    const f = await applied(id, { phase: 'in', intensity }), s = at(f, 'ADBE Scale', 0);
    assert.ok(s[0] >= 0 && s[1] >= 0, `${id} @${intensity}: ${s}`);
    assert.ok(hidden(f, 0), `${id} @${intensity} starts hidden`);
    assert.deepEqual(Array.from(at(f, 'ADBE Scale', 2)).slice(0, 2), [100, 100]);
  }
});

test('animated distance or center blocks editing instead of being flattened by a rebuild', async () => {
  for (const label of ['Distância (px)', 'Centro da transição']) {
    const f = await applied(label === 'Distância (px)' ? 'momentum-push' : 'momentum-pendulum', { phase: 'in' });
    control(f, label).expression = 'value'; control(f, label).expressionEnabled = true;
    const state = f.run('inspect').data;
    assert.equal(state.state, 'conflict', label); assert.match(state.message, /keyframes ou expressão/);
  }
});

test('a parent at zero scale is refused before any change', async () => {
  const f = await fixture(), parent = new f.Layer(false);
  parent.transform.property('ADBE Scale').value = [0, 0, 100]; f.layer.parent = parent;
  const before = f.mutations, error = f.handler('phase-apply').preflight(f.args('momentum-push', { phase: 'both' }));
  assert.match(error.message, /escala do parent é zero/); assert.equal(f.mutations, before);
});

test('Reset returns to the measured geometry while a failed rebuild keeps the tuned one', async () => {
  const f = await applied('momentum-pendulum', { phase: 'in' });
  control(f, 'Centro da transição').value = [500, -300];
  let state = f.run('inspect').data;
  f.run('phase-action', { target: state.target, phase: 'in', action: 'reset' });
  assert.deepEqual(Array.from(control(f, 'Centro da transição').value), [50, 50 - 2.4 * 100], 'Reset restores the authored center');

  const g = await applied('momentum-push', { phase: 'in' });
  control(g, 'Distância (px)').value = 2000;
  // The next Position expression is refused once: the rebuild fails and rolls back.
  const position = g.layer.transform.property('ADBE Position');
  let refusals = 1;
  Object.defineProperty(position, 'expressionError', { configurable: true, get: () => refusals-- > 0 ? 'refused' : '', set() {} });
  assert.throws(() => g.run('phase-apply', g.args('momentum-push', { phase: 'in', durationFrames: 44 })), /recusou a expressão/);
  assert.equal(control(g, 'Distância (px)').value, 2000, 'rollback keeps the tuned distance');
  assert.equal(g.run('inspect').data.state, 'ready');
});
