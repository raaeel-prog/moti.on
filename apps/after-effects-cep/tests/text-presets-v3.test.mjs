import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './preset-phases-harness.mjs';

// Text collection recipes on the phases v3 rig: per-character 3D and the pivot
// grouping are layer switches the rig sets while a slot needs them and restores after.
const entrance = 'text-v3-characters-position-rise', exit = 'text-v3-characters-rotate-pitch-3d', effect = 'text-v3-characters-loop-drift';
const inspect = f => f.run('inspect').data;
const root = f => f.scope.MotionPresetPhases.metadata(f.layer);
const animators = f => f.layer.text.property('ADBE Text Animators');
const grouping = f => f.layer.text.property('ADBE Text More Options').property('ADBE Text Anchor Point Option');
const matchNames = f => animators(f).children.flatMap(a => a.property('ADBE Text Animator Properties').children.map(p => p.matchName));

test('entrance, 3D exit and a text loop stack in one v3 rig and clean up completely', async () => {
  const f = await fixture({text: true}), source = f.layer.sourceText;
  f.run('phase-apply', f.args(entrance, {phase: 'in'}));
  f.run('phase-apply', f.args(exit, {phase: 'out'}));
  f.run('apply', f.args(effect));
  let state = inspect(f);
  assert.equal(state.state, 'ready', state.message);
  assert.deepEqual(state.phases.map(p => p.phase), ['in', 'out', 'effect']);
  assert.equal(root(f).version, 3);
  assert.equal(f.layer.threeDPerChar, true, 'the 3D exit turns per-character 3D on');
  assert.equal(grouping(f).value, 1, 'characters pivot on characters');
  const effectPhase = state.phases.find(p => p.phase === 'effect');
  f.run('phase-adjust', {target: state.target, phase: 'effect', presetId: effect, options: {...effectPhase.options, speed: 75}});
  state = inspect(f);
  assert.equal(state.phases.find(p => p.phase === 'effect').options.speed, 75);
  f.run('phase-action', {target: state.target, phase: 'out', action: 'remove'});
  assert.equal(f.layer.threeDPerChar, false, 'without a 3D slot the original mode comes back');
  for (const phase of ['in', 'effect']) { f.run('phase-action', {target: inspect(f).target, phase, action: 'remove'}); }
  assert.equal(f.layer.comment, 'Keep this comment');
  assert.equal(f.layer.effects.numProperties, 0);
  assert.equal(animators(f).numProperties, 0);
  assert.equal(f.layer.threeDLayer, false);
  assert.equal(f.layer.sourceText, source);
});

test('3D text builds real X/Y turns, depth and a held per-unit pivot', async () => {
  const f = await fixture({text: true});
  f.run('phase-apply', f.args(exit, {phase: 'in'}));
  const names = matchNames(f);
  for (const name of ['ADBE Text Rotation X', 'ADBE Text Rotation', 'ADBE Text Position 3D']) assert.ok(names.includes(name), name);
  // The pivot is held by a separate position, never by an animated Anchor Point that drifts.
  assert.ok(!names.includes('ADBE Text Anchor Point 3D'));
  assert.ok(animators(f).children.some(a => a.name.endsWith(' · Centro')), 'a hold animator keeps the hinge in place');
  const yaw = await fixture({text: true});
  yaw.run('phase-apply', yaw.args('text-v3-words-rotate-yaw-3d', {phase: 'in'}));
  assert.ok(matchNames(yaw).includes('ADBE Text Rotation Y'));
  assert.equal(grouping(yaw).value, 2, 'words pivot on words');
});

test('a single text loop owns grouping and 3D mode and returns them on removal', async () => {
  const f = await fixture({text: true});
  grouping(f).setValue(4);
  f.run('apply', f.args('text-v3-characters-loop-depth-wave-3d'));
  assert.ok(f.layer.comment.includes('[Moti.on.library.v1]'), 'without phases the loop stays a single preset');
  assert.equal(f.layer.threeDPerChar, true);
  assert.equal(grouping(f).value, 1);
  f.run('remove', {});
  assert.equal(f.layer.threeDPerChar, false);
  assert.equal(grouping(f).value, 4);
  assert.equal(f.layer.comment, 'Keep this comment');
});

test('a single loop migrates into the rig keeping the layer switches it needs', async () => {
  const f = await fixture({text: true});
  grouping(f).setValue(3);
  f.run('apply', f.args('text-v3-words-loop-turn-wave-3d'));
  f.run('phase-apply', f.args('text-v3-words-position-rise', {phase: 'in'}));
  const state = inspect(f);
  assert.deepEqual(state.phases.map(p => p.phase), ['in', 'effect']);
  assert.equal(f.layer.threeDPerChar, true);
  assert.equal(grouping(f).value, 2);
  for (const phase of ['in', 'effect']) f.run('phase-action', {target: inspect(f).target, phase, action: 'remove'});
  assert.equal(grouping(f).value, 3, 'the grouping found before the first preset comes back');
  assert.equal(f.layer.threeDPerChar, false);
});

test('unsupported 3D and conflicting pivot groupings fail before any mutation', async () => {
  const unsupported = await fixture({text: true});
  Object.defineProperty(unsupported.layer, 'threeDPerChar', {get: () => undefined, set() {}});
  let before = unsupported.mutations;
  assert.ok(unsupported.handler('phase-apply').preflight(unsupported.args(exit, {phase: 'in'})));
  assert.ok(unsupported.handler('apply').preflight(unsupported.args('text-v3-characters-loop-depth-wave-3d')));
  assert.equal(unsupported.mutations, before);

  const mixed = await fixture({text: true});
  mixed.run('phase-apply', mixed.args('text-v3-words-rotate-pitch-3d', {phase: 'in'}));
  before = mixed.mutations;
  const error = mixed.handler('phase-apply').preflight(mixed.args(exit, {phase: 'out'}));
  assert.match(error.message, /agrupamentos de pivô/);
  assert.equal(mixed.mutations, before);
});

test('a user animator keeps the grouping and 3D mode it was built with', async () => {
  const f = await fixture({text: true});
  animators(f).addProperty('ADBE Text Animator').name = 'Meu animador';
  const before = f.mutations;
  assert.match(f.handler('phase-apply').preflight(f.args(exit, {phase: 'in'})).message, /animador do usuário/);
  assert.match(f.handler('apply').preflight(f.args('text-v3-characters-loop-depth-wave-3d')).message, /animador do usuário/);
  assert.equal(f.mutations, before);
});

test('a failed application restores every component and the text switches', async () => {
  const f = await fixture({text: true});
  f.run('phase-apply', f.args(entrance, {phase: 'both'}));
  const before = inspect(f), markers = JSON.stringify(f.layer.markers.keys), add = f.Group.prototype.addProperty;
  let armed = true;
  f.Group.prototype.addProperty = function (name) { if (armed && name === 'ADBE Text Rotation X') { armed = false; throw new Error('Injected animator failure'); } return add.call(this, name); };
  assert.throws(() => f.run('phase-apply', f.args(exit, {phase: 'out'})), /Injected animator failure/);
  f.Group.prototype.addProperty = add;
  assert.deepEqual(inspect(f), before);
  // The rebuilt rig may spell default options explicitly; what it renders is compared above.
  assert.ok(f.layer.comment.startsWith('Keep this comment\n[Moti.on.library.v3]'));
  assert.equal(JSON.stringify(f.layer.markers.keys), markers);
  assert.equal(f.layer.threeDPerChar, false);
  assert.equal(grouping(f).value, 1);
});

test('continuous decode follows the live Speed and Variation, and zero intensity rests', async () => {
  const f = await fixture({text: true});
  f.run('apply', f.args('text-v3-characters-loop-decode', {speed: 100, seed: 17}));
  const meta = f.scope.MotionPresetLibrary.metadata(f.layer);
  const glyph = animators(f).children.find(a => a.property('ADBE Text Animator Properties').property('ADBE Text Character Offset'));
  const selector = glyph.property('ADBE Text Selectors').property('Moti.on Timing').property('ADBE Text Expressible Amount');
  const sample = time => selector.valueAtTime(time, false, 2, 7)[0];
  const times = [.17, .31, .57, .83, 1.11], baseline = times.map(sample), half = times.map(t => sample(t / 2));
  f.layer.effects.property(meta.controls.speed).property(1).setValue(50);
  assert.deepEqual(times.map(sample), half, 'half speed uses half the elapsed decode time');
  f.layer.effects.property(meta.controls.speed).property(1).setValue(100);
  f.layer.effects.property(meta.controls.seed).property(1).setValue(81);
  assert.notDeepEqual(times.map(sample), baseline, 'Variation changes the glyph sequence');
  f.layer.effects.property(meta.effects[1].name).property(1).setValue(0);
  assert.ok(times.map(sample).every(v => v === 0));
});

test('every core function the host libraries call is bundled into the generated core', async () => {
  const {readFile} = await import('node:fs/promises');
  const generated = await readFile(new URL('../host/generated/motion-library.jsx', import.meta.url), 'utf8');
  const core = generated.slice(generated.indexOf('global.MotionLibraryCore'), generated.indexOf('global.MotionElements'));
  for (const file of ['preset-library.jsx', 'preset-phases.jsx']) {
    const source = await readFile(new URL(`../host/src/commands/${file}`, import.meta.url), 'utf8');
    for (const [, name] of source.matchAll(/core\.(library\w+|camera\w+)/g)) assert.ok(core.includes(`${name}: ${name}`) && generated.includes(`function ${name}(`), `${file} calls core.${name}`);
  }
});

test('legacy text recipes that move in depth or turn on X/Y get per-character 3D', async () => {
  const f = await fixture({text: true});
  f.run('phase-apply', f.args('premium-word-unfold', {phase: 'in'}));
  assert.equal(f.layer.threeDPerChar, true);
  assert.ok(matchNames(f).includes('ADBE Text Rotation X'), 'the unfold turns on X instead of only fading');
  const flat = await fixture({text: true});
  flat.run('phase-apply', flat.args('word-rise', {phase: 'in'}));
  assert.equal(flat.layer.threeDPerChar, false, 'flat recipes keep the layer 2D');
});

test('older word recipes turn whole words, yield to a required grouping and respect user animators', async () => {
  const legacy = 'studio-word-weightless-settle';
  const alone = await fixture({text: true});
  alone.run('phase-apply', alone.args(legacy, {phase: 'in'}));
  assert.equal(grouping(alone).value, 2, 'scale and turn around each word, as the card shows');
  alone.run('phase-action', {target: inspect(alone).target, phase: 'in', action: 'remove'});
  assert.equal(grouping(alone).value, 1);

  const mixed = await fixture({text: true});
  mixed.run('phase-apply', mixed.args(legacy, {phase: 'in'}));
  assert.equal(mixed.handler('phase-apply').preflight(mixed.args(exit, {phase: 'out'})), null, 'a soft request never blocks');
  mixed.run('phase-apply', mixed.args(exit, {phase: 'out'}));
  assert.equal(grouping(mixed).value, 1, 'the required character grouping wins');

  const user = await fixture({text: true});
  animators(user).addProperty('ADBE Text Animator').name = 'Meu animador';
  assert.equal(user.handler('phase-apply').preflight(user.args(legacy, {phase: 'in'})), null);
  user.run('phase-apply', user.args(legacy, {phase: 'in'}));
  assert.equal(grouping(user).value, 1, 'the user animator keeps its grouping');
});

// Centred spacing, held pivots and sides, as the host's selectors evaluate them on
// the fixture text "Editable words\rSecond line" at a 100 px font.
const SOURCE = 'Editable words\rSecond line', LINES = SOURCE.split('\r'), CHARS = LINES.join('').length;
const amount = (f, role) => animators(f).children.find(a => a.name.endsWith(` · ${role}`))?.property('ADBE Text Selectors').property('Moti.on Timing').property('ADBE Text Expressible Amount');
// A space belongs to the word before it, as libraryTextLocate counts.
const wordOf = i => { const flat = LINES.join(''); let words = 0, inWord = false; for (let k = 0; k <= i; k++) { if (k === LINES[0].length || flat[k] === ' ') inWord = false; if (flat[k] !== ' ' && !inWord) { inWord = true; words++; } } return Math.max(0, words - 1); };
const columnOf = i => { let line = 0, column = i; while (column >= LINES[line].length) { column -= LINES[line].length; line++; } return {line, column, length: LINES[line].length}; };

test('tracking widens each line around its own centre for any alignment and rests exactly in place', async () => {
  for (const [id, unitOf, units] of [['text-v3-characters-tracking-spread', i => i, CHARS], ['text-v3-words-tracking-spread', wordOf, 4]]) {
    const f = await fixture({text: true});
    f.run('phase-apply', f.args(id, {phase: 'in'}));
    const spacing = amount(f, 'Espaçamento'), move = amount(f, 'Movimento'), tracking = 95, em = 100 / (id.includes('words') ? 168 : 256);
    for (const time of [0, .25, .5, .9, 2]) {
      const sums = [0, 0];
      for (let i = 0; i < CHARS; i++) {
        const {line, column, length} = columnOf(i), px = spacing.valueAtTime(time, false, i, CHARS)[0] * 200;
        const weight = move.valueAtTime(time, false, unitOf(i), units)[0] * 4 / 100;
        assert.ok(Math.abs(px - (column - (length - 1) / 2) * tracking * em * weight) < 1e-6, `${id} t=${time} char ${i}: ${px}`);
        sums[line] += px;
        if (time === 2) assert.ok(Math.abs(px) < 1e-12, 'at rest every character is where it was');
      }
      // Equal weights spread a line symmetrically: its centre does not move.
      if (time === 0) for (const sum of sums) assert.ok(Math.abs(sum) < 1e-6, `${id} line centre ${sum}`);
    }
  }
});

test('units scale and turn around their visual centre or origin, and the hold vanishes at rest', async () => {
  const hold = async (id, options = {}) => { const f = await fixture({text: true}); f.run('phase-apply', f.args(id, {phase: 'in', ...options})); return {f, centre: amount(f, 'Centro'), move: amount(f, 'Movimento')}; };
  // Bloom shrinks letters to their visual centre, 0.36 em above the baseline anchor.
  const bloom = await hold('text-v3-characters-scale-bloom');
  for (const time of [0, .2, .4, .8, 3]) for (const i of [0, 6, 13]) {
    const w = bloom.move.valueAtTime(time, false, i, CHARS)[0] * 4 / 100, h = bloom.centre.valueAtTime(time, false, i, CHARS).map(v => v * 200);
    assert.ok(Math.abs(h[1] - (-36) * w) < 1e-6 && Math.abs(h[0]) < 1e-9, `bloom t=${time}: ${h}`);
  }
  assert.ok(bloom.centre.valueAtTime(3, false, 0, CHARS).every(v => Math.abs(v) < 1e-12), 'no hold at rest');
  // Growing from the baseline is the anchor itself: nothing to hold.
  const base = await hold('text-v3-characters-scale-grow-base');
  for (const time of [0, .3]) assert.ok(base.centre.valueAtTime(time, false, 3, CHARS).every(v => Math.abs(v) < 1e-9));
  // A turn around the cap line: c − R·c, with R the phase's own angle for that unit.
  const lean = await hold('text-v3-characters-rotate-lean');
  for (const time of [0, .2, .5]) {
    const w = lean.move.valueAtTime(time, false, 2, CHARS)[0] * 4 / 100, a = -35 * w * Math.PI / 180, c = [0, -72];
    const expected = [c[0] - (c[0] * Math.cos(a) - c[1] * Math.sin(a)), c[1] - (c[0] * Math.sin(a) + c[1] * Math.cos(a))];
    const h = lean.centre.valueAtTime(time, false, 2, CHARS).map(v => v * 200);
    assert.ok(Math.abs(h[0] - expected[0]) < 1e-6 && Math.abs(h[1] - expected[1]) < 1e-6, `lean t=${time}: ${h} vs ${expected}`);
  }
});

test('a chosen side reaches After Effects: mirrored turns, origin and order', async () => {
  const side = async direction => { const f = await fixture({text: true}); f.run('phase-apply', f.args('text-v3-characters-rotate-lean', {phase: 'in', direction})); return f; };
  const rotation = f => animators(f).children.find(a => a.name.endsWith(' · Movimento')).property('ADBE Text Animator Properties').property('ADBE Text Rotation').value;
  const [left, right, top] = [await side('left'), await side('right'), await side('top')];
  assert.equal(rotation(left), -rotation(right), 'left and right are mirror images');
  assert.notEqual(amount(left, 'Centro').expression, amount(right, 'Centro').expression, 'the origin moves to the other side');
  const travel = f => animators(f).children.find(a => a.name.endsWith(' · Movimento')).property('ADBE Text Animator Properties').property('ADBE Text Position 3D').expression;
  assert.match(travel(top), /\[0\*em,-100\*em,0\*em\]/, 'from the top the unit falls in, in em of the font, carried at four times');
  // Units arriving from the right run right to left: the last character moves first.
  const first = f => amount(f, 'Movimento').valueAtTime(.05, false, 0, CHARS)[0], last = f => amount(f, 'Movimento').valueAtTime(.05, false, CHARS - 1, CHARS)[0];
  assert.ok(last(right) < first(right) && last(left) > first(left));
});

test('re-applying over a layer built by the earlier engine settles its stale tracking, anchor and animators', async () => {
  const f = await fixture({text: true}), lib = f.scope.MotionPresetLibrary, args = f.args('text-v3-characters-scale-bloom', {phase: 'in'});
  f.run('apply', args);
  // What the earlier engine left: Tracking Amount and an animated anchor in Movimento, and a Tipografia animator.
  const meta = lib.metadata(f.layer), move = animators(f).children.find(a => a.name.endsWith(' · Movimento')), properties = move.property('ADBE Text Animator Properties');
  properties.addProperty('ADBE Text Tracking Amount').setValue(50); properties.addProperty('ADBE Text Anchor Point 3D').setValue([0, -30, 0]);
  meta.animators.find(record => record.name === move.name).properties.push('ADBE Text Tracking Amount', 'ADBE Text Anchor Point 3D');
  const old = animators(f).addProperty('ADBE Text Animator'); old.name = `Moti.on ${meta.instance} · Tipografia`;
  const oldSelector = old.property('ADBE Text Selectors').addProperty('ADBE Text Expressible Selector'); oldSelector.name = 'Moti.on Timing';
  oldSelector.property('ADBE Text Expressible Amount').expression = `// Moti.on preset v1:${meta.instance}\n100;`;
  meta.animators.push({name: old.name, matchName: 'ADBE Text Animator', properties: []});
  lib.saveMetadata(f.layer, meta);
  f.run('apply', args);
  assert.equal(properties.property('ADBE Text Tracking Amount').value, 0, 'the edge-anchored tracking rests');
  assert.deepEqual([...properties.property('ADBE Text Anchor Point 3D').value], [0, 0, 0], 'the weighted anchor rests');
  assert.match(oldSelector.property('ADBE Text Expressible Amount').expression, /\n0;$/, 'an animator this build does not use is silenced');
  f.run('remove', {});
  assert.equal(animators(f).numProperties, 0);
});

test('above 100% Intensity the selectors keep their range and the pivot stays held', async () => {
  const f = await fixture({text: true});
  f.run('phase-apply', f.args('text-v3-characters-scale-bloom', {phase: 'in', intensity: 200}));
  const move = amount(f, 'Movimento'), centre = amount(f, 'Centro');
  for (const time of [0, .2, .4]) {
    const raw = move.valueAtTime(time, false, 4, CHARS)[0], w = raw * 4 / 100 / 2, h = centre.valueAtTime(time, false, 4, CHARS).map(v => v * 200);
    assert.ok(Math.abs(raw) <= 100, `selector within AE's range: ${raw}`);
    // Bloom scales by 1 − 2w around the centre 36 px above the anchor: hold = c − (1 − 2w)c.
    assert.ok(Math.abs(h[1] - (-36) * 2 * w) < 1e-6, `t=${time}: ${h[1]} vs ${-72 * w}`);
  }
});

test('every slanted text transition keeps Skew inside the ±70° AE accepts and slants by exactly its recipe', async () => {
  // Signature looks also add native effects this harness does not model; their skew takes the same path.
  const slanted = (await fixture({text: true})).scope.MotionLibraryCatalog.filter(p => p.category.startsWith('text-') && p.text.skew && p.mode === 'transition' && p.collection !== 'signature');
  assert.ok(slanted.length >= 7);
  for (const p of slanted) {
    const f = await fixture({text: true});
    // Slanted windows add a mask; its shape does not matter here.
    globalThis.Shape ??= class {};
    const masks = new f.Group('ADBE Mask Parade', f.layer), property = f.layer.property.bind(f.layer);
    masks.addProperty = function () { const m = new f.Group('ADBE Mask Atom', this, {'ADBE Mask Shape': null}); m.remove = () => this.children.splice(this.children.indexOf(m), 1); this.children.push(m); return m; };
    f.layer.property = name => name === 'ADBE Mask Parade' ? masks : property(name);
    f.run('phase-apply', f.args(p.id, {phase: 'in'}));
    const a = animators(f).children.find(item => item.name.endsWith(' · Tipografia')), skew = a.property('ADBE Text Animator Properties').property('ADBE Text Skew').value;
    const range = Number(a.property('ADBE Text Selectors').property('Moti.on Timing').property('ADBE Text Expressible Amount').expression.match(/w\*amp\*100\/(\d+);$/)[1]);
    assert.ok(Math.abs(skew) <= 70 && range >= 1, `${p.id} ${skew}`);
    assert.equal(skew / range, p.text.skew, `${p.id}: value and selector together give the recipe's slant`);
  }
});

test('no text preset expression reads the layer own Source Text, so the text stays editable', async () => {
  // AE re-evaluates such an expression on every keystroke and its text tool then
  // stops deleting and types ahead of the cursor: the font size and the layout
  // are read when the preset is applied instead.
  const {build} = await import('esbuild');
  const out = await build({entryPoints: [new URL('../../../packages/contracts/src/motion-library.ts', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')], bundle: true, format: 'esm', platform: 'node', write: false});
  const {MOTION_LIBRARY_PRESETS} = await import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString('base64')}`);
  const presets = MOTION_LIBRARY_PRESETS.filter(p => p.category.startsWith('text-') && !p.retired);
  assert.ok(presets.length > 250, `${presets.length} text presets`);
  const reading = [];
  let applied = 0;
  const walk = (node, id) => { for (const child of node.children ?? []) { if (/sourceText/.test(child.expression ?? '')) reading.push(`${id}: ${child.matchName}`); walk(child, id); } };
  for (const p of presets) {
    const f = await fixture({text: true}), property = f.layer.property.bind(f.layer), {Group} = f;
    // Masked reveals add a window mask; only the expressions matter here.
    globalThis.Shape ??= class {};
    const masks = new Group('ADBE Mask Parade', f.layer);
    masks.addProperty = function () { const m = new Group('ADBE Mask Atom', this, {'ADBE Mask Shape': null}); this.children.push(m); return m; };
    f.layer.property = name => name === 'ADBE Mask Parade' ? masks : property(name);
    Group.prototype.canAddProperty = () => true;
    // Looks that need native effects the mock lacks are skipped; their text part is shared.
    try { f.run(p.mode === 'transition' ? 'phase-apply' : 'apply', f.args(p.id, p.mode === 'transition' ? {phase: 'both'} : {})); applied++; } catch { continue; }
    walk(f.layer.text, p.id);
  }
  assert.ok(applied > 220, `${applied} text presets applied`);
  assert.deepEqual(reading, []);
});
