import { attachLicensedAccount } from "./licensed-account-fixture.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { createCepDocument } from './cep-dom.mjs';
import { PULSE_PRESETS, pulsePresetArgs, validateCommandRequest } from '../../../packages/contracts/dist/index.js';
async function moduleAt(file) {
  const built = await build({ entryPoints: [fileURLToPath(new URL(file, import.meta.url))], bundle: true, platform: 'node', format: 'esm', write: false });
  return import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);
}
const pulse = await moduleAt('../client/src/vertical-pulse.ts');
const { createI18n } = await moduleAt('../../../packages/ui-core/src/i18n.ts');
const empty = () => ({ rigVersion: 0, renderer: null, preset: null, controls: null, stale: false, baked: false, lockedControls: [], glyphCount: 0, vertexCount: 0 });
const selected = overrides => ({ rigVersion: 4, renderer: 'morph', preset: 'impact', controls: pulsePresetArgs('impact', 30), stale: false, baked: false, lockedControls: [], glyphCount: 8, vertexCount: 256, ...overrides });
const request = args => ({ protocolVersion: 1, requestId: 'pulse-test', command: 'ae.text.vertical-pulse', args, context: { host: 'after-effects', hostVersion: '26.5' } });
function clear(fps = 30) { pulse.hydrateVerticalPulse(empty(), fps); pulse.resetVerticalPulse(fps); }
function fixture(t, locale = 'pt-BR', fps = 30) {
  const doc = createCepDocument(); globalThis.document = doc; t.after(() => { delete globalThis.document; });
  const i18n = createI18n({ locale }); let rerenders = 0;
  const render = (busy = false) => { const content = doc.createElement('section'), actions = doc.createElement('footer');
    pulse.renderVerticalPulse({ content, actions, shell: { rerender() { rerenders += 1; } } }, i18n, busy, fps); return content; };
  const input = (content, key) => content.getElementsByTagName('input').find(node => node.id === `verticalPulse-${key}`);
  const select = (content, key) => content.getElementsByTagName('select').find(node => node.id === `verticalPulse-${key}`);
  const choose = (content, key, value) => { const control = select(content, key); control.value = value; control.emit('change'); };
  return { doc, i18n, render, input, select, choose, rerenders: () => rerenders };
}

test('Pulse defaults use the shared Impact recipe at the actual fps and preserve legacy payload compatibility', () => {
  for (const fps of [24, 25, 29.97, 30, 60, null]) {
    clear(fps); assert.deepEqual(pulse.verticalPulseArgs(fps), pulsePresetArgs('impact', fps));
    assert.equal(pulse.validVerticalPulse(fps), true); assert.equal(validateCommandRequest(request(pulse.verticalPulseArgs(fps))).valid, true);
  }
  clear(); const { renderer, preset, fluidity, animationMode, waveSpread, ...legacy } = pulse.verticalPulseArgs(30);
  assert.equal(renderer, 'morph'); assert.equal(preset, 'impact'); assert.equal(fluidity, 45); assert.equal(animationMode, 'center-out'); assert.equal(waveSpread, 45);
  assert.equal(validateCommandRequest(request(legacy)).valid, true);
  for (const action of ['update', 'bake', 'remove']) assert.equal(validateCommandRequest(request({ action })).valid, true);
});

test('All five recipes are selectable in both locales and custom edits remain visible across rerenders', t => {
  const f = fixture(t); clear();
  for (const [locale, labels] of [['pt-BR', ['Impacto', 'Elétrico', 'Plasma', 'Líquido', 'Ruptura']], ['en-US', ['Impact', 'Electric', 'Plasma', 'Liquid', 'Rupture']]]) {
    f.i18n.setLocale(locale); let content = f.render();
    assert.deepEqual(f.select(content, 'preset').getElementsByTagName('option').map(node => node.textContent), labels);
    for (const preset of Object.keys(PULSE_PRESETS)) {
      f.choose(content, 'preset', preset); assert.deepEqual(pulse.verticalPulseArgs(30), pulsePresetArgs(preset, 30)); content = f.render();
    }
    f.input(content, 'peakScalePercent').value = '401.5'; f.input(content, 'peakScalePercent').emit('change'); content = f.render();
    assert.equal(f.select(content, 'preset').value, 'custom'); assert.equal(pulse.verticalPulseArgs(30).preset, 'rupture');
    assert.equal(f.input(content, 'peakScalePercent').value, '401.5');
    f.choose(content, 'preset', 'impact');
  }
});

test('The compact editor shows four main controls, with direction and material settings in a persistent disclosure', t => {
  const f = fixture(t); clear(); let content = f.render();
  const advanced = content.getElementsByTagName('details')[0]; assert.equal(advanced.id, 'verticalPulse-advanced');
  assert.equal(advanced.open, false);
  assert.ok(content.children.some(node => node.getElementsByTagName('input').some(input => input.id === 'verticalPulse-durationFrames')));
  for (const key of ['waveSpread', 'fluidity', 'glow', 'seed']) assert.ok(f.input(advanced, key), key);
  for (const key of ['durationFrames', 'peakScalePercent', 'distortion', 'accentColor']) assert.equal(Boolean(f.input(advanced, key)), false, key);
  advanced.open = true; advanced.emit('toggle');
  for (const mode of ['uniform', 'center-out', 'left-to-right', 'right-to-left']) {
    f.choose(content, 'animationMode', mode); assert.equal(pulse.verticalPulseArgs(30).animationMode, mode); content = f.render();
    assert.equal(content.getElementsByTagName('details')[0].open, true);
  }
  f.choose(content, 'animationMode', 'outside-in'); assert.equal(pulse.verticalPulseArgs(30).animationMode, 'right-to-left');
});

test('Invalid numeric text survives mode changes and busy rerenders and never reaches the command', t => {
  const f = fixture(t); clear(); let content = f.render(); const before = pulse.verticalPulseArgs(30);
  const field = f.input(content, 'peakScalePercent'); field.value = '451'; field.emit('input'); field.emit('change');
  assert.equal(field.getAttribute('aria-invalid'), 'true'); assert.equal(pulse.validVerticalPulse(30), false);
  f.choose(content, 'animationMode', 'uniform'); content = f.render(true);
  assert.equal(f.input(content, 'peakScalePercent').value, '451'); assert.equal(f.input(content, 'peakScalePercent').getAttribute('aria-invalid'), 'true');
  assert.equal(pulse.verticalPulseArgs(30).peakScalePercent, before.peakScalePercent);
  assert.ok(content.getElementsByTagName('input').every(node => node.disabled)); assert.ok(content.getElementsByTagName('select').every(node => node.disabled));
  content = f.render(); const corrected = f.input(content, 'peakScalePercent'); corrected.value = '400,5'; corrected.emit('input'); corrected.emit('change');
  assert.equal(pulse.verticalPulseArgs(30).peakScalePercent, 400.5); assert.equal(pulse.validVerticalPulse(30), true);
  const duration = f.input(f.render(), 'durationFrames'); duration.value = '12.5'; duration.emit('input'); assert.equal(pulse.validVerticalPulse(30), false);
});

test('Read responses validate the renderer/version pairing, arrays, lifecycle state and full morph contract', () => {
  assert.equal(pulse.isVerticalPulseReadData(empty()), true); assert.equal(pulse.isVerticalPulseReadData(selected()), true);
  const legacyControls = { action: 'apply', renderer: 'legacy', durationFrames: 74, peakScalePercent: 360, distortion: 80, glow: 80, seed: 1, accentColor: [1,.68,.08], animationMode: 'center-out', waveSpread: 55 };
  for (const rigVersion of [1,2,3]) assert.equal(pulse.isVerticalPulseReadData(selected({ rigVersion, renderer: 'legacy', preset: null, controls: legacyControls, vertexCount: 0 })), true);
  for (const invalid of [null, {}, selected({ rigVersion: 5 }), selected({ renderer: 'legacy' }), selected({ preset: 'unknown' }), selected({ glyphCount: -1 }), selected({ vertexCount: 1.5 }), selected({ lockedControls: [8] }), selected({ controls: { ...pulsePresetArgs('impact', 30), fluidity: undefined } }), { ...empty(), baked: true }])
    assert.equal(pulse.isVerticalPulseReadData(invalid), false);
});

test('Hydration copies source values and rejects old async reads after later draft input', t => {
  const f = fixture(t); clear(); const data = selected(); pulse.hydrateVerticalPulse(data, 30);
  const emitted = pulse.verticalPulseArgs(30); emitted.accentColor[0] = .1; data.controls.accentColor[0] = .2;
  assert.equal(pulse.verticalPulseArgs(30).accentColor[0], 1);
  const revision = pulse.verticalPulseRevision(), content = f.render(), field = f.input(content, 'distortion');
  field.value = '88'; field.emit('input'); field.emit('change');
  assert.equal(pulse.hydrateVerticalPulse(selected({ controls: { ...pulsePresetArgs('impact', 30), distortion: 12 } }), 30, revision), false);
  assert.equal(pulse.verticalPulseArgs(30).distortion, 88);
  pulse.hydrateVerticalPulse(empty(), 30); assert.deepEqual(pulse.verticalPulseArgs(30), pulsePresetArgs('impact', 30));
  const newContent = f.render(); f.input(newContent, 'glow').value = '51'; f.input(newContent, 'glow').emit('change');
  pulse.hydrateVerticalPulse(empty(), 30); assert.equal(pulse.verticalPulseArgs(30).glow, 51, 'new-text drafts remain intact across reads');
});

test('Legacy rigs display Current and retain their eight controls until explicit migration', t => {
  const f = fixture(t); clear();
  const controls = { action: 'apply', renderer: 'legacy', durationFrames: 74, peakScalePercent: 240, distortion: 21, glow: 55, seed: 7, accentColor: [.2,.3,.4], animationMode: 'uniform', waveSpread: 0 };
  pulse.hydrateVerticalPulse(selected({ rigVersion: 3, renderer: 'legacy', preset: null, controls, vertexCount: 0 }), 30);
  let content = f.render(); assert.equal(f.select(content, 'preset').value, 'legacy'); assert.equal(f.select(content, 'preset').disabled, true);
  assert.deepEqual(pulse.verticalPulseArgs(30), controls); assert.equal(f.input(content, 'fluidity'), undefined);
  assert.equal(pulse.verticalPulseActionLabel(f.i18n, 30), 'Ajustar');
  assert.equal(f.select(content, 'action').getElementsByTagName('option').some(node => node.value === 'bake'), false, 'legacy must migrate before Bake');
  f.choose(content, 'action', 'update'); assert.deepEqual(pulse.verticalPulseArgs(30), { action: 'update', renderer: 'morph' });
  assert.equal(pulse.verticalPulseActionLabel(f.i18n, 30), 'Atualizar para morph');
  content = f.render(); assert.equal(f.input(content, 'durationFrames'), undefined);
  f.choose(content, 'action', 'remove'); assert.deepEqual(pulse.verticalPulseArgs(30), { action: 'remove' });
  f.choose(f.render(), 'action', 'apply'); assert.deepEqual(pulse.verticalPulseArgs(30), controls);
});

test('Stale and baked rigs offer Update and Remove while animated controls cannot be overwritten by a preset or Reset', t => {
  const f = fixture(t); clear();
  pulse.hydrateVerticalPulse(selected({ stale: true }), 30); assert.equal(pulse.verticalPulseReadDisabledReason(f.i18n, 30), f.i18n.t('verticalPulse.staleHelp'));
  let content = f.render(); f.choose(content, 'action', 'update'); assert.equal(pulse.verticalPulseReadDisabledReason(f.i18n, 30), null);
  pulse.hydrateVerticalPulse(selected({ baked: true }), 30); content = f.render();
  assert.equal(pulse.verticalPulseReadDisabledReason(f.i18n, 30), f.i18n.t('verticalPulse.bakedHelp'));
  assert.equal(f.select(content, 'action').getElementsByTagName('option').some(node => node.value === 'bake'), false);
  const exact = 73.375; pulse.hydrateVerticalPulse(selected({ lockedControls: ['distortion'], controls: { ...pulsePresetArgs('impact', 30), distortion: exact } }), 30);
  content = f.render(); assert.equal(f.input(content, 'distortion').disabled, true); assert.equal(f.select(content, 'preset').disabled, false);
  f.choose(content, 'preset', 'plasma'); assert.equal(pulse.verticalPulseArgs(30).distortion, exact);
  assert.equal(f.select(f.render(), 'preset').value, 'custom'); assert.equal(pulse.verticalPulseArgs(30).preset, 'plasma');
  pulse.resetVerticalPulse(30); assert.equal(pulse.verticalPulseArgs(30).distortion, exact);
  assert.equal(pulse.verticalPulseReadDisabledReason(f.i18n, 30), null);
  pulse.markVerticalPulseReadFailed(); assert.equal(pulse.verticalPulseReadDisabledReason(f.i18n, 30, true), f.i18n.t('verticalPulse.readInvalid'));
  assert.equal(pulse.verticalPulseReadDisabledReason(f.i18n, 30, false), null);
  pulse.hydrateVerticalPulse(selected(), 30); content = f.render(); f.choose(content, 'action', 'bake'); assert.deepEqual(pulse.verticalPulseArgs(30), { action: 'bake' });
});

// Exercise the actual main.ts transport and action binding, with no dist mutation.
const { runInNewContext } = await import('node:vm');
const { setImmediate: tick } = await import('node:timers/promises');
const { createFakeWindow } = await import('../../../packages/ui-core/tests/fake-dom.mjs');
const mainBuilt = await build({ entryPoints: [fileURLToPath(new URL('../client/src/main.ts', import.meta.url))],
  bundle: true, platform: 'browser', format: 'iife', target: 'chrome88', write: false });
const mainBundle = mainBuilt.outputFiles[0].text;
async function mountPulsePanel(data = empty(), { holdRead = false } = {}) {
  const document = createCepDocument(), mount = document.createElement('div'), window = createFakeWindow();
  document.querySelector = () => null; document.getElementById = id => id === 'root' ? mount : null;
  const qa = { data, holdRead, pending: [], requests: [], failRead: false, throwRead: false, failAfterWrite: false,
    context: { hostVersion: '26.5', projectName: null, projectPath: null, activeItemName: 'Fixture', isComposition: true,
      compWidth: 1920, compHeight: 1080, compDuration: 5, compFrameRate: 30, currentTime: 0, workAreaStart: 0, workAreaDuration: 5,
      selectionLayerCount: 1, selectionPropertyCount: 0, selectionExpressibleCount: 0, selectionSelectedKeyCount: 0, selectionHasKeyframes: false,
      selectionHasExpressions: false, selectionIs3D: false, averageLayerDurationSeconds: 5, selectionTruncated: false, selectionSignature: 'pulse:1' } };
  class CSInterface {
    getHostEnvironment() { return { appVersion: '26.5', appUILocale: 'en_US' }; }
    getSystemPath() { return '/pulse-test'; }
    evalScript(script, callback) {
      if (!script.startsWith('MotionAE.dispatch(')) { callback('function'); return; }
      let command;
      const response = runInNewContext(script, { MotionAE: { dispatch(serialized) {
        const request = JSON.parse(serialized); qa.requests.push(request); command = request.command;
        if (command === 'ae.text.vertical-pulse.read' && qa.throwRead) throw Error('Pulse read transport rejected');
        const failed = command === 'ae.text.vertical-pulse.read' && qa.failRead;
        const value = command === 'ae.context.read' ? qa.context : command === 'ae.text.vertical-pulse.read' ? qa.data : { appliedCount: 1 };
        if (command === 'ae.text.vertical-pulse' && qa.failAfterWrite) qa.throwRead = true;
        return JSON.stringify({ protocolVersion: 1, requestId: request.requestId, ok: !failed, data: failed ? null : value,
          warnings: [], error: failed ? { code: 'INVALID_SELECTION_TYPE', message: 'Select a text layer.', recoverable: true, action: null } : null });
      } } });
      if (command === 'ae.text.vertical-pulse.read' && qa.holdRead) qa.pending.push(() => callback(response)); else callback(response);
    }
  }
  attachLicensedAccount(window, CSInterface);
  runInNewContext(mainBundle, { document, window, CSInterface, SystemPath: { EXTENSION: 'extension' },
    requestAnimationFrame: () => 1, cancelAnimationFrame() {}, performance: { now: () => 0 },
    setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {} });
  await tick();
  const byId = id => mount.getElementsByTagName('button').find(node => node.id === id);
  const back = () => mount.getElementsByTagName('button').find(node => node.className === 'ch-context-back');
  const edit = async () => { byId('library-options-verticalPulse').click(); byId('library-edit-verticalPulse').click(); await tick(); };
  const input = key => mount.getElementsByTagName('input').find(node => node.id === `verticalPulse-${key}`);
  const writes = () => qa.requests.filter(request => request.command === 'ae.text.vertical-pulse');
  return { qa, mount, document, byId, back, edit, input, writes };
}

test('Pulse main Quick reads the legacy rig and preserves all controls without migrating or duplicating the click', async () => {
  const controls = { action: 'apply', renderer: 'legacy', durationFrames: 74, peakScalePercent: 235, distortion: 21, glow: 60, seed: 7,
    accentColor: [.2,.3,.4], animationMode: 'uniform', waveSpread: 0 };
  const f = await mountPulsePanel(selected({ rigVersion: 3, renderer: 'legacy', preset: null, controls, vertexCount: 0 }));
  f.byId('library-tool-verticalPulse').click(); f.byId('library-tool-verticalPulse').click(); await tick();
  assert.equal(f.writes().length, 1); assert.deepEqual(f.writes()[0].args, controls);
  assert.equal(f.writes()[0].options.mode, 'quick'); assert.equal(f.writes()[0].options.preserveSelection, true);
  assert.ok(f.byId('library-tool-verticalPulse'), 'Quick keeps the library open');
});

test('Pulse main rejects malformed snapshots and stale or baked Quick states before mutation', async () => {
  for (const snapshot of [{}, selected({ renderer: 'legacy' }), selected({ stale: true }), selected({ baked: true })]) {
    const f = await mountPulsePanel(snapshot); f.byId('library-tool-verticalPulse').click(); await tick(); assert.equal(f.writes().length, 0);
  }
  const f = await mountPulsePanel({}); await f.edit(); assert.equal(f.byId('tool-verticalPulse-apply').getAttribute('aria-disabled'), 'true');
  f.byId('tool-verticalPulse-apply').click(); await tick(); assert.equal(f.writes().length, 0);
  f.qa.data = empty(); f.byId('tool-verticalPulse-refresh').click(); await tick();
  assert.notEqual(f.byId('tool-verticalPulse-apply').getAttribute('aria-disabled'), 'true');
});

test('Pulse main preserves a later focused draft when a delayed selection read completes', async () => {
  const f = await mountPulsePanel(selected(), { holdRead: true }); await f.edit();
  const field = f.input('peakScalePercent'); field.focus(); field.value = '449'; field.emit('input'); field.emit('change');
  f.qa.holdRead = false; f.qa.pending.shift()(); await tick();
  assert.equal(f.input('peakScalePercent').value, '449'); assert.equal(f.document.activeElement, f.input('peakScalePercent'));
  assert.equal(f.byId('tool-verticalPulse-apply').getAttribute('aria-disabled'), 'true'); assert.equal(f.writes().length, 0);
  f.byId('tool-verticalPulse-refresh').click(); await tick(); assert.equal(f.input('peakScalePercent').value, '360');
  assert.notEqual(f.byId('tool-verticalPulse-apply').getAttribute('aria-disabled'), 'true');
});

test('Pulse main ignores a delayed snapshot after leaving its editor', async () => {
  const f = await mountPulsePanel(selected({ preset: 'plasma', controls: pulsePresetArgs('plasma', 30) }), { holdRead: true }); await f.edit();
  // The editor is left through the header's "← Ferramentas"; the footer no longer repeats it.
  f.back().click(); f.qa.holdRead = false; f.qa.pending.shift()(); await tick();
  assert.ok(f.byId('library-tool-verticalPulse')); assert.equal(f.input('durationFrames'), undefined);
  f.qa.data = empty(); await f.edit(); assert.equal(f.input('durationFrames').value, '54');
});

test('Pulse main blocks stale editor controls when a post-mutation read throws and recovers on a valid read', async () => {
  const f = await mountPulsePanel(selected()); await f.edit(); f.qa.failAfterWrite = true;
  f.byId('tool-verticalPulse-apply').click(); await tick(); assert.equal(f.writes().length, 1);
  assert.equal(f.byId('tool-verticalPulse-apply').getAttribute('aria-disabled'), 'true');
  f.qa.throwRead = false; f.qa.failAfterWrite = false; f.byId('tool-verticalPulse-refresh').click(); await tick();
  assert.notEqual(f.byId('tool-verticalPulse-apply').getAttribute('aria-disabled'), 'true');
});
