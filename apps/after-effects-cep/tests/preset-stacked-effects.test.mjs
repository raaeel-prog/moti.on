import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './preset-phases-harness.mjs';

const RAMP_FRAMES = 6;
const rotation = f => f.layer.transform.property('ADBE Rotate Z');
const effectCue = f => f.layer.markers.keys.find(k => k.value.params['Moti.on.phase'] === 'effect');
const inspect = f => f.run('inspect').data;
const phase = (state, name) => state.phases.find(p => p.phase === name);
/** Steady spin of 90°/s at 100% intensity, timed by the effect window. */
const spinAt = (f, t, start, end) => 90 * f.scope.MotionLibraryCore.libraryEffectWindow(t, start, end, RAMP_FRAMES * f.comp.frameDuration)[1];
const times = Array.from({length: 41}, (_, i) => i / 10);

test('a continuous effect stacks with an entrance and an exit and adds its own contribution', async () => {
  const exitOnly = await fixture();
  exitOnly.run('phase-apply', exitOnly.args('momentum-push-spin', {phase: 'out', durationFrames: 20}));
  const exitRotation = times.map(t => rotation(exitOnly).valueAtTime(t));

  const f = await fixture();
  f.run('phase-apply', f.args('momentum-push', {phase: 'in', durationFrames: 20}));
  f.run('phase-apply', f.args('momentum-push-spin', {phase: 'out', durationFrames: 20}));
  f.run('apply', f.args('momentum-spin-loop'));
  assert.ok(!f.layer.comment.includes('[Moti.on.library.v1]'), 'the effect joins the phases instead of a second preset');
  const state = inspect(f);
  assert.equal(state.state, 'ready', state.message);
  assert.deepEqual(state.phases.map(p => p.phase), ['in', 'out', 'effect']);
  const effect = phase(state, 'effect');
  assert.equal(effect.presetId, 'momentum-spin-loop');
  assert.equal(effect.markerTime, 0); assert.equal(effect.markerDuration, 4);
  const cue = effectCue(f);
  assert.equal(cue.value.comment, 'Moti.on Efeito'); assert.equal(cue.value.duration, 4);
  for (const [i, t] of times.entries()) assert.ok(Math.abs(rotation(f).valueAtTime(t) - exitRotation[i] - spinAt(f, t, 0, 4)) < 1e-6, `rotation at ${t}`);
  assert.equal(rotation(f).valueAtTime(0), exitRotation[0], 'the spin starts from rest: no pop');
  assert.ok(rotation(f).expression.startsWith('// Moti.on phases v3:'));
});

test('the effect cue retimes the loop live and adjustments keep a hand-placed window', async () => {
  const f = await fixture();
  f.run('phase-apply', f.args('momentum-push', {phase: 'in', durationFrames: 20}));
  f.run('apply', f.args('momentum-spin-loop'));
  const cue = effectCue(f); cue.time = 1; cue.value.duration = 2;
  assert.equal(rotation(f).valueAtTime(.9), 0, 'nothing before the window');
  assert.ok(Math.abs(rotation(f).valueAtTime(2) - spinAt(f, 2, 1, 3)) < 1e-6);
  assert.ok(Math.abs(rotation(f).valueAtTime(3.5) - spinAt(f, 3, 1, 3)) < 1e-6, 'the angle holds after the window');
  let state = inspect(f), effect = phase(state, 'effect');
  assert.equal(effect.markerTime, 1); assert.equal(effect.markerDuration, 2);
  f.run('phase-adjust', {target: state.target, phase: 'effect', presetId: effect.presetId, options: {...effect.options, intensity: 50}});
  state = inspect(f); effect = phase(state, 'effect');
  assert.equal(effect.options.intensity, 50); assert.equal(effect.markerTime, 1); assert.equal(effect.markerDuration, 2);
  f.run('phase-timing', {target: state.target, phase: 'effect', frames: 6});
  state = inspect(f); effect = phase(state, 'effect');
  assert.ok(Math.abs(effect.markerTime - 1.2) < 1e-9); assert.equal(effect.markerDuration, 2);
  const before = f.mutations;
  assert.equal(f.handler('phase-timing').preflight({target: state.target, phase: 'effect', frames: 60}).code, 'INVALID_PRESET', 'the window must stay inside the layer');
  assert.equal(f.mutations, before);
});

test('removing or resetting one slot leaves the others untouched', async () => {
  const f = await fixture();
  f.run('phase-apply', f.args('momentum-push', {phase: 'in', durationFrames: 20}));
  f.run('phase-apply', f.args('momentum-push-spin', {phase: 'out', durationFrames: 20}));
  f.run('apply', f.args('momentum-spin-loop', {intensity: 150}));
  let state = inspect(f);
  const entrance = JSON.stringify(phase(state, 'in')), exit = JSON.stringify(phase(state, 'out'));
  effectCue(f).time = .5; effectCue(f).value.duration = 1;
  state = inspect(f);
  f.run('phase-action', {target: state.target, phase: 'effect', action: 'reset'});
  state = inspect(f);
  assert.equal(phase(state, 'effect').options.intensity, 100);
  assert.equal(phase(state, 'effect').markerTime, 0, 'reset restores the window over the layer');
  assert.equal(JSON.stringify(phase(state, 'in')), entrance); assert.equal(JSON.stringify(phase(state, 'out')), exit);
  f.run('phase-action', {target: state.target, phase: 'in', action: 'reset'});
  state = inspect(f);
  assert.equal(phase(state, 'effect').presetId, 'momentum-spin-loop');
  const controls = f.layer.effects.numProperties;
  f.run('phase-action', {target: state.target, phase: 'effect', action: 'remove'});
  state = inspect(f);
  assert.deepEqual(state.phases.map(p => p.phase), ['in', 'out']);
  assert.equal(effectCue(f), undefined); assert.ok(f.layer.effects.numProperties < controls);
  assert.equal(JSON.stringify(phase(state, 'out')), exit);
  for (const p of ['in', 'out']) f.run('phase-action', {target: inspect(f).target, phase: p, action: 'remove'});
  assert.equal(f.layer.comment, 'Keep this comment'); assert.equal(f.layer.effects.numProperties, 0); assert.equal(f.layer.markers.numKeys, 0);
});

test('a legacy continuous preset migrates into the effect slot when an entrance is added', async () => {
  const f = await fixture();
  f.run('apply', f.args('momentum-spin-loop', {intensity: 120}));
  assert.ok(f.layer.comment.includes('[Moti.on.library.v1]'));
  f.run('phase-apply', f.args('momentum-push', {phase: 'in', durationFrames: 20}));
  assert.ok(!f.layer.comment.includes('[Moti.on.library.v1]'));
  const state = inspect(f);
  assert.deepEqual(state.phases.map(p => p.phase), ['in', 'effect']);
  assert.equal(phase(state, 'effect').options.intensity, 120);
  assert.equal(phase(state, 'effect').markerDuration, 4);
  assert.ok(Math.abs(rotation(f).valueAtTime(2) - 1.2 * spinAt(f, 2, 0, 4)) < 1e-6);
});

test('a version 2 phase root stays readable and upgrades when an effect joins it', async () => {
  const f = await fixture();
  f.run('phase-apply', f.args('momentum-push', {phase: 'in', durationFrames: 20}));
  const root = f.scope.MotionPresetPhases.metadata(f.layer);
  root.version = 2;
  for (const shared of root.shared) {
    shared.managed = shared.managed.replace('// Moti.on phases v3:', '// Moti.on phases v2:');
    f.scope.MotionPresetLibrary.locate(f.layer, shared.path).expression = shared.managed;
  }
  f.layer.comment = 'Keep this comment\n[Moti.on.library.v2]' + encodeURIComponent(JSON.stringify(root));
  const position = f.layer.transform.property('ADBE Position'), before = times.map(t => position.valueAtTime(t));
  assert.equal(inspect(f).state, 'ready');
  f.run('apply', f.args('momentum-spin-loop'));
  assert.ok(f.layer.comment.includes('[Moti.on.library.v3]')); assert.ok(!f.layer.comment.includes('[Moti.on.library.v2]'));
  assert.ok(position.expression.startsWith('// Moti.on phases v3:'));
  for (const [i, t] of times.entries()) assert.deepEqual(Array.from(position.valueAtTime(t)), Array.from(before[i]), `entrance unchanged at ${t}`);
  assert.deepEqual(inspect(f).phases.map(p => p.phase), ['in', 'effect']);
});

test('a blink effect fades in and out of its window instead of popping', async () => {
  const f = await fixture();
  f.run('phase-apply', f.args('momentum-push', {phase: 'in', durationFrames: 20}));
  f.run('apply', f.args('momentum-blink'));
  const cue = effectCue(f); cue.time = 1; cue.value.duration = 2;
  const opacity = f.layer.transform.property('ADBE Opacity');
  for (const t of [.95, 1, 3, 3.5]) assert.equal(opacity.valueAtTime(t), 100, `visible outside the window at ${t}`);
  const inside = Array.from({length: 40}, (_, i) => opacity.valueAtTime(1.3 + i * .035));
  assert.ok(inside.some(v => v < 1) && inside.some(v => v > 99), 'it blinks on the plateau');
});

test('the default window avoids an occupied first frame and stacking never overwrites user markers', async () => {
  const f = await fixture();
  const user = new f.MarkerValue('User cue'); f.layer.markers.setValueAtTime(0, user);
  f.run('phase-apply', f.args('momentum-push', {phase: 'in', durationFrames: 20}));
  f.run('apply', f.args('momentum-spin-loop'));
  const effect = phase(inspect(f), 'effect');
  assert.ok(Math.abs(effect.markerTime - f.comp.frameDuration) < 1e-9, 'moved one frame later');
  assert.ok(Math.abs(effect.markerTime + effect.markerDuration - 4) < 1e-9, 'still ends with the layer');
  assert.equal(f.layer.markers.keys.filter(k => k.value.comment === 'User cue').length, 1);
});

test('a failure while stacking an effect restores the previous phases exactly', async () => {
  const f = await fixture();
  f.run('phase-apply', f.args('momentum-push', {phase: 'in', durationFrames: 20}));
  const phases = JSON.stringify(inspect(f).phases), effects = f.layer.effects.children.map(e => e.name), markers = JSON.stringify(f.layer.markers.keys);
  const position = f.layer.transform.property('ADBE Position'), path = times.map(t => Array.from(position.valueAtTime(t)));
  const add = f.layer.effects.addProperty.bind(f.layer.effects);let calls = 0;
  f.layer.effects.addProperty = name => { if (++calls === 4) throw new Error('forced failure'); return add(name); };
  assert.throws(() => f.run('apply', f.args('momentum-spin-loop')), /forced failure/);
  f.layer.effects.addProperty = add;
  assert.equal(JSON.stringify(inspect(f).phases), phases); assert.ok(!f.layer.comment.includes('momentum-spin-loop'));
  assert.deepEqual(times.map(t => Array.from(position.valueAtTime(t))), path);
  assert.deepEqual(f.layer.effects.children.map(e => e.name), effects);
  assert.equal(JSON.stringify(f.layer.markers.keys), markers);
  assert.equal(rotation(f).expression, '');
});

test('phase commands accept the effect slot only for continuous recipes', async () => {
  const f = await fixture();
  f.run('phase-apply', f.args('momentum-push', {phase: 'in', durationFrames: 20}));
  const state = inspect(f), before = f.mutations;
  assert.equal(f.handler('phase-action').preflight({target: state.target, phase: 'effect', action: 'remove'}).code, 'INVALID_PRESET', 'no effect to remove yet');
  assert.equal(f.handler('phase-adjust').preflight({target: state.target, phase: 'effect', presetId: 'momentum-push', options: phase(state, 'in').options}).code, 'INVALID_PRESET');
  assert.equal(f.mutations, before);
});
