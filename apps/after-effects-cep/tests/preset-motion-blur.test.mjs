import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './preset-phases-harness.mjs';

const inspect = f => f.run('inspect').data;
const addLayer = f => { const layer = new f.Layer(false); layer.containingComp = f.comp; layer.selected = false; f.comp.layers.push(layer); return layer; };

test('applying with motion blur turns on the layer and composition switches and Remove turns off only those', async () => {
  const f = await fixture();
  f.run('apply', f.args('momentum-spin-loop', {motionBlur: true}));
  assert.equal(f.layer.motionBlur, true); assert.equal(f.comp.motionBlur, true);
  assert.equal(inspect(f).options.motionBlur, true);
  f.run('remove', {});
  assert.equal(f.layer.motionBlur, false); assert.equal(f.comp.motionBlur, false);
  assert.equal(f.layer.comment, 'Keep this comment');
});

test('switches the user turned on stay on after Remove', async () => {
  const f = await fixture(); f.layer.motionBlur = true; f.comp.motionBlur = true;
  f.run('apply', f.args('momentum-spin-loop', {motionBlur: true}));
  f.run('remove', {});
  assert.equal(f.layer.motionBlur, true); assert.equal(f.comp.motionBlur, true);
});

test('the composition switch stays on while another layer uses motion blur', async () => {
  const f = await fixture(), other = addLayer(f);
  f.run('apply', f.args('momentum-spin-loop', {motionBlur: true}));
  other.motionBlur = true;
  f.run('remove', {});
  assert.equal(f.layer.motionBlur, false); assert.equal(f.comp.motionBlur, true);
});

test('adjusting motion blur off releases the switches and leaving it out never touches them', async () => {
  const f = await fixture();
  f.run('apply', f.args('momentum-spin-loop', {motionBlur: true}));
  const state = inspect(f);
  f.run('adjust', {target: state.target, presetId: state.presetId, options: {...state.options, motionBlur: false}});
  assert.equal(f.layer.motionBlur, false); assert.equal(f.comp.motionBlur, false);
  const g = await fixture(); g.run('apply', g.args('momentum-spin-loop'));
  assert.equal(g.layer.motionBlur, false); assert.equal(g.comp.motionBlur, false);
});

test('phases keep motion blur on while any slot asks for it', async () => {
  const f = await fixture();
  f.run('phase-apply', f.args('momentum-push', {phase: 'in', durationFrames: 20, motionBlur: true}));
  f.run('phase-apply', f.args('momentum-push-spin', {phase: 'out', durationFrames: 20, motionBlur: false}));
  assert.equal(f.layer.motionBlur, true); assert.equal(f.comp.motionBlur, true);
  f.run('apply', f.args('momentum-spin-loop', {motionBlur: true}));
  let state = inspect(f);
  f.run('phase-action', {target: state.target, phase: 'in', action: 'remove'});
  assert.equal(f.layer.motionBlur, true, 'the effect still asks for it');
  state = inspect(f);
  f.run('phase-action', {target: state.target, phase: 'effect', action: 'remove'});
  assert.equal(f.layer.motionBlur, false); assert.equal(f.comp.motionBlur, false);
  state = inspect(f);
  f.run('phase-action', {target: state.target, phase: 'out', action: 'remove'});
  assert.equal(f.layer.comment, 'Keep this comment');
});

test('a failure on a later layer restores the switches the earlier layer turned on', async () => {
  const f = await fixture(), second = addLayer(f);
  second.selected = true;
  const add = second.effects.addProperty.bind(second.effects);
  second.effects.addProperty = () => { throw new Error('forced failure'); };
  assert.throws(() => f.run('phase-apply', f.args('momentum-push', {phase: 'in', durationFrames: 20, motionBlur: true})), /forced failure/);
  second.effects.addProperty = add;
  assert.equal(f.layer.motionBlur, false); assert.equal(f.comp.motionBlur, false);
  assert.equal(f.layer.comment, 'Keep this comment');
});

test('motion blur must be a boolean', async () => {
  const f = await fixture();
  assert.equal(f.handler('apply').preflight(f.args('momentum-spin-loop', {motionBlur: 'yes'})).code, 'INVALID_PRESET');
  assert.equal(f.handler('phase-apply').preflight(f.args('momentum-push', {phase: 'in', motionBlur: 1})).code, 'INVALID_PRESET');
});
