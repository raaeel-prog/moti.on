import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './preset-phases-harness.mjs';

// Reveals drive a native transition effect with the eased weight; looks blend a
// native stack in through Effect Opacity. Both apply through the panel's paths.
const catalog = (await fixture()).scope.MotionLibraryCatalog;
const reveals = catalog.filter(p => p.collection === 'reveal'), looks = catalog.filter(p => p.collection === 'looks');
const owned = (f, matchName) => f.layer.effects.children.filter(e => e.matchName === matchName && e.name.startsWith('Moti.on '));
const opacity = e => e.property('ADBE Effect Built In Params').property('ADBE Effect Mask Opacity');
const COMPLETION = {'reveal-linear': ['ADBE Linear Wipe', 100], 'reveal-radial': ['ADBE Radial Wipe', 100], 'reveal-blinds': ['ADBE Venetian Blinds', 100],
  'reveal-blocks': ['ADBE Block Dissolve', 100], 'reveal-grid': ['CC Grid Wipe', 100], 'reveal-sweep': ['CS LineSweep', 100]};

test('every reveal covers the layer at both edges and uncovers it at rest', async () => {
  assert.equal(reveals.length, 6);
  for (const p of reveals) {
    const f = await fixture(); f.run('phase-apply', f.args(p.id, {phase: 'both'}));
    const [matchName, full] = COMPLETION[p.effect], effects = owned(f, matchName);
    assert.equal(effects.length, 2, `${p.id}: one effect per phase`);
    const completion = time => effects.reduce((max, e) => Math.max(max, e.property(`${matchName}-0001`).valueAtTime(time)), 0);
    assert.equal(completion(0), full, `${p.id} start`); assert.equal(completion(4), full, `${p.id} end`);
    assert.equal(completion(2), 0, `${p.id} rest`);
    const mid = completion(.4); assert.ok(mid > 0 && mid < full, `${p.id} in between: ${mid}`);
    assert.equal(f.layer.transform.property('ADBE Opacity').expression, '', `${p.id} never fades`);
  }
});

test('directional reveals uncover from the chosen side', async () => {
  const angle = async (id, direction) => { const f = await fixture(); f.run('phase-apply', f.args(id, {phase: 'in', direction}));
    const e = owned(f, id === 'reveal-curtain' ? 'ADBE Linear Wipe' : id === 'reveal-blinds' ? 'ADBE Venetian Blinds' : 'CS LineSweep')[0];
    return e.property(`${e.matchName}-0002`).value; };
  for (const id of ['reveal-curtain', 'reveal-blinds', 'reveal-sweep']) {
    const values = await Promise.all(['left', 'right', 'top', 'bottom'].map(direction => angle(id, direction)));
    assert.equal(new Set(values).size, 4, `${id}: four distinct sides`);
    assert.equal(await angle(id, 'preset'), values[0], `${id}: Original uncovers from the left`);
  }
});

test('every look builds its native stack and Intensity blends it in', async () => {
  assert.equal(looks.length, 8);
  for (const p of looks) {
    const f = await fixture(); f.run('apply', f.args(p.id, {intensity: 50}));
    const expected = f.scope.MotionLibraryCore.libraryRequiredEffects(p).filter(name => name !== 'ADBE Slider Control' && name !== 'ADBE Point Control');
    const stack = f.layer.effects.children.filter(e => e.matchName !== 'ADBE Slider Control').map(e => e.matchName);
    assert.deepEqual(stack, expected, p.id);
    for (const e of f.layer.effects.children.filter(e => e.matchName !== 'ADBE Slider Control' && e.matchName !== 'ADBE Posterize Time')) assert.equal(opacity(e).valueAtTime(1), 50, `${p.id} ${e.matchName}`);
    f.layer.effects.children.find(e => e.name.endsWith('· Intensidade (%)')).property(1).value = 100;
    for (const e of f.layer.effects.children.filter(e => e.matchName !== 'ADBE Slider Control' && e.matchName !== 'ADBE Posterize Time')) assert.equal(opacity(e).valueAtTime(1), 100, `${p.id} ${e.matchName} live`);
    assert.equal(f.layer.transform.property('ADBE Position').expression, '', `${p.id} never moves`);
  }
});

test('grain renders as final output and animated looks move with time', async () => {
  const film = await fixture(); film.run('apply', film.args('look-film'));
  assert.equal(owned(film, 'VISINF Grain Implant')[0].property('VISINF Grain Implant-0021').value, 3, 'no preview box');
  const flicker = owned(film, 'ADBE Exposure2')[0].property('ADBE Exposure2-0003');
  assert.notEqual(flicker.valueAtTime(.1), flicker.valueAtTime(.2));
  const frames = await fixture(); frames.run('apply', frames.args('look-frames'));
  const boil = owned(frames, 'ADBE Turbulent Displace')[0].property('ADBE Turbulent Displace-0006');
  assert.equal(boil.valueAtTime(.01), boil.valueAtTime(.12), 'held for an eighth of a second');
  assert.notEqual(boil.valueAtTime(.12), boil.valueAtTime(.13));
  const rate = owned(frames, 'ADBE Posterize Time')[0].property('ADBE Posterize Time-0001');
  assert.ok(Math.abs(rate.valueAtTime(1) - 8) < 1e-9);
});

test('a look stacked with an entrance fades in and out of its window', async () => {
  const f = await fixture();
  f.run('phase-apply', f.args('momentum-push', {phase: 'in', durationFrames: 20}));
  f.run('apply', f.args('look-sepia'));
  const state = f.run('inspect').data;
  assert.deepEqual(state.phases.map(p => p.phase), ['in', 'effect']);
  const toner = opacity(owned(f, 'CC Toner')[0]);
  assert.equal(toner.valueAtTime(0), 0); assert.equal(toner.valueAtTime(2), 100); assert.ok(toner.valueAtTime(.05) > 0 && toner.valueAtTime(.05) < 100);
  f.run('phase-action', {target: state.target, phase: 'effect', action: 'remove'});
  assert.equal(owned(f, 'CC Toner').length, 0);
});

test('removing a look or a reveal leaves the layer as it was', async () => {
  for (const id of ['look-vhs', 'reveal-clock']) {
    const f = await fixture(), p = catalog.find(item => item.id === id);
    f.run(p.mode === 'transition' ? 'phase-apply' : 'apply', f.args(id, {phase: 'in'}));
    if (p.mode === 'transition') { const state = f.run('inspect').data; f.run('phase-action', {target: state.target, phase: 'in', action: 'remove'}); }
    else f.run('remove', {});
    assert.equal(f.layer.effects.numProperties, 0, id); assert.equal(f.layer.comment, 'Keep this comment', id);
  }
});

test('the host stack table equals the requirements the gallery shows', async () => {
  const f = await fixture();
  for (const p of [...reveals, ...looks]) {
    const base = f.scope.MotionLibraryCore.libraryRequiredEffects({effect: 'none'});
    assert.deepEqual(f.scope.MotionLookEffects.required(p), f.scope.MotionLibraryCore.libraryRequiredEffects(p).slice(base.length), p.id);
  }
});
