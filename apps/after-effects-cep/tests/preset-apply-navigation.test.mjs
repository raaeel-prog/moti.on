import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setImmediate } from 'node:timers/promises';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { build, transform } from 'esbuild';
import { createCepDocument } from './cep-dom.mjs';
import { createFakeWindow } from '../../../packages/ui-core/tests/fake-dom.mjs';

// Execute the production handler without booting main.ts's Adobe panel shell.
// Extracting its declaration with the parser keeps assertions behavioral rather
// than checking for particular source strings or duplicating the handler.
const main = await readFile(new URL('../client/src/main.ts', import.meta.url), 'utf8');
const source = ts.createSourceFile('main.ts', main, ts.ScriptTarget.Latest, true);
const declaration = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'applyLibraryCommand');
assert.ok(declaration, 'production preset handler exists');
const handler = (await transform(declaration.getText(source), { loader: 'ts' })).code;
const built = await build({ entryPoints: [fileURLToPath(new URL('../client/src/preset-workspace.ts', import.meta.url))], bundle: true, platform: 'node', format: 'esm', write: false });
const { createPresetWorkspace } = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);

function fixture(t, { response = { ok: true, warnings: [], data: { appliedCount: 1 } }, reject = false, navigation: initialNavigation, mount = false, hold = false } = {}) {
  const previous = { window: globalThis.window, requestAnimationFrame: globalThis.requestAnimationFrame, cancelAnimationFrame: globalThis.cancelAnimationFrame };
  const frames = new Map(); let frameId = 0;
  globalThis.window = createFakeWindow();
  globalThis.requestAnimationFrame = callback => { const id = ++frameId; frames.set(id, callback); return id; };
  globalThis.cancelAnimationFrame = id => frames.delete(id);
  const doc = createCepDocument(), calls = [], statuses = [], renders = [], shellBusy = [], refreshes = [];
  let release;
  const navigation = { view: 'browse', category: 'studio', query: 'silk', scope: 'all', scroll: 28, ...initialNavigation };
  const preferences = { snapshot: () => ({ favorites: [], recent: [], folderColors: {}, collapsedFolders: [], presetAutoplay: false, presetSize: 200 }), recordUse() {} };
  const state = { busy: false, lastError: null };
  const hostState = { state: 'ready', message: '', layerName: 'Applied title', presetId: 'studio-letter-silk-rise', target: { compId: 1, layerId: 2, instance: 'new-instance', fingerprint: 'applied-values' }, options: { phase: 'out', direction: 'bottom', durationFrames: 57, intensity: 165, staggerFrames: 2, unit: 'words', elasticity: 35, overlap: 70, speed: 100 } };
  const client = { async execute(command, args, options) {
    calls.push({ command, args, options });
    if (command === 'ae.presets.inspect') return { ok: true, data: structuredClone(hostState) };
    if (hold) await new Promise(resolve=>{release=resolve;});
    if (reject) throw Error('transport failed');
    return response;
  } };
  const shell = { activeView:()=> 'presets', setBusy(value){shellBusy.push(value);}, setStatus(message, tone) { statuses.push({ message, tone }); } };
  const i18n = { locale: () => 'pt-BR', t: key => key };
  const logger = { recordResponse() {} };
  let workspace;
  const scope = { state, presetNavigation: navigation, panelPreferences: preferences, globalFeedback: undefined,
    refreshPresetContext(){refreshes.push('context');workspace?.updateContext();},selectionCoordinator:{refresh(){refreshes.push('selection');}},
    setBusy(_shell, busy) {
      state.busy = busy; workspace?.dispose(); renders.push({ busy, view: navigation.view });
      workspace = createPresetWorkspace(doc, { locale: 'pt-BR', busy, navigation, preferences, cache: { personal: { roots: [], folders: [], items: [] } }, context: () => ({ hasComp: true, selectionCount: 1, selectedKeys: 0 }), execute: client.execute,
        apply(preset,settings){return scope.applyLibraryCommand('phase-apply',{presetId:preset.motion.id,...settings},preset.id,shell,i18n,logger,client);}, edit() {} });
      doc.documentElement.appendChild(workspace.element);
    }
  };
  runInNewContext(handler, scope);
  if (mount) scope.setBusy(shell, false);
  t.after(() => { workspace?.dispose(); Object.assign(globalThis, previous); });
  return { calls, statuses, renders, shellBusy, refreshes, navigation, hostState, state, release:()=>release?.(), workspace: () => workspace,
    frame() { const pending = [...frames.values()]; frames.clear(); for (const callback of pending) callback(0); },
    run: (action = 'apply') => scope.applyLibraryCommand(action, { presetId: 'studio-letter-silk-rise' }, action === 'remove' || action === 'bake' ? '' : 'builtin.motion.studio-letter-silk-rise', shell, i18n, logger, client) };
}

for (const action of ['apply', 'camera-transition']) test(`${action} opens Edit only after confirmed application and freshly loads host parameters`, async t => {
  const f = fixture(t); const pending = f.run(action);
  assert.deepEqual(f.renders, [{ busy: true, view: 'browse' }], 'pending application keeps Browse');
  await pending; await setImmediate();
  assert.deepEqual(f.renders.at(-1), { busy: false, view: 'edit' });
  assert.equal(f.calls.filter(call => call.command === 'ae.presets.inspect').length, 1);
  const workspace = f.workspace();
  const intensity = workspace.element.getElementsByTagName('input').find(node => node.getAttribute('role') === 'spinbutton' && node.getAttribute('aria-label') === 'Intensidade · %');
  assert.equal(intensity.value, '165', 'Edit uses the host result, not the gallery defaults');
  assert.match(workspace.element.allText, /Applied title/);
  const back=workspace.element.getElementsByTagName('button').find(node=>node.allText==='Navegar');
  const adjust=workspace.element.getElementsByTagName('button').find(node=>node.allText==='Editar');
  assert.equal(back.hidden,false);assert.equal(adjust.hidden,false);assert.equal(adjust.getAttribute("aria-selected"),"true");
  assert.equal(workspace.element.getAttribute('data-workspace-view'),'edit');
  assert.equal(f.navigation.query, 'silk'); assert.equal(f.navigation.scroll, 28, 'browser position remains available when returning');
});

for (const [label, configuration] of [
  ['host rejection', { response: { ok: false, warnings: [], error: { message: 'Layer locked' } } }],
  ['transport failure', { reject: true }],
  ['zero applied layers', { response: { ok: true, warnings: [], data: { appliedCount: 0 } } }]
]) test(`${label} keeps Browse and does not inspect an unapplied preset`, async t => {
  const f = fixture(t, configuration); await f.run(); await setImmediate();
  assert.equal(f.navigation.view, 'browse'); assert.equal(f.calls.some(call => call.command === 'ae.presets.inspect'), false);
  assert.deepEqual(f.renders.at(-1), { busy: false, view: 'browse' });
});

for (const action of ['remove', 'bake']) test(`${action} does not open Edit as if a preset had been applied`, async t => {
  const f = fixture(t); await f.run(action); await setImmediate(); assert.equal(f.navigation.view, 'browse');
});

test('Apply then Remove restores the selected card and actual scroll through rapid workspace remounts', async t => {
  const selectedId = 'builtin.motion.studio-letter-silk-rise';
  const f = fixture(t, { mount: true, navigation: { category: 'all', query: '', selectedId, scroll: 0 } });
  const grid = () => f.workspace().element.querySelectorAll('.ch-preset-grid')[0];
  grid().scrollTop = 684; // Apply can happen before the queued native scroll event.
  await f.run('apply'); await setImmediate();
  assert.equal(f.navigation.view, 'edit');
  assert.equal(f.navigation.selectedId, selectedId);
  assert.equal(f.navigation.scroll, 684);
  await f.run('remove');
  assert.equal(f.navigation.view, 'browse');
  f.frame(); f.frame();
  assert.equal(grid().scrollTop, 684, 'new DOM returns to the saved viewport');
  assert.equal(f.navigation.scroll, 684);
  assert.equal(grid().getElementsByTagName('article').find(card => card.getAttribute('data-selected') === 'true').id, selectedId);
  assert.equal(f.navigation.category, 'all'); assert.equal(f.navigation.query, '');
});

for (const [label, configuration] of [
  ['host rejection', { response: { ok: false, warnings: [], error: { message: 'Layer locked' } } }],
  ['transport failure', { reject: true }],
  ['no managed preset removed', { response: { ok: true, warnings: [], data: { appliedCount: 0 } } }]
]) test(`${label} keeps Edit and the saved browser location`, async t => {
  const selectedId = 'builtin.motion.studio-letter-silk-rise';
  const f = fixture(t, { ...configuration, navigation: { view: 'edit', selectedId, scroll: 684 } });
  await f.run('remove'); await setImmediate();
  assert.equal(f.navigation.view, 'edit');
  assert.equal(f.navigation.selectedId, selectedId);
  assert.equal(f.navigation.scroll, 684);
});

test('direct phase command keeps Browse mounted, blocks duplicates and returns confirmed result', async t=>{
  const selectedId='builtin.motion.studio-letter-silk-rise';
  const f=fixture(t,{mount:true,hold:true,navigation:{category:'all',query:'',selectedId,scroll:0}});
  const workspace=f.workspace(),grid=workspace.element.querySelectorAll('.ch-preset-grid')[0];
  grid.scrollTop=684;
  const phase=workspace.element.getElementsByTagName('button').find(node=>node.dataset.phase==='both');
  phase.click();phase.click();await setImmediate();
  assert.equal(f.calls.filter(call=>call.command==='ae.presets.phase-apply').length,1);
  assert.equal(f.calls[0].args.phase,'both');assert.equal(f.calls[0].options.preserveSelection,true);
  const rejected=await f.run('phase-apply');assert.equal(rejected.ok,false);
  assert.equal(f.state.busy,true);assert.equal(f.workspace(),workspace);
  assert.deepEqual(f.shellBusy,[true]);assert.equal(f.renders.length,1,'only initial mounting occurred');
  f.release();await setImmediate();
  assert.equal(f.navigation.view,'edit');assert.notEqual(f.workspace(),workspace);
  assert.equal(f.navigation.scroll,684);assert.equal(f.navigation.selectedId,selectedId);
  assert.equal(f.state.busy,false);
  assert.deepEqual(f.shellBusy,[true]);assert.deepEqual(f.refreshes,[]);
  assert.equal(f.calls.some(call=>call.command==='ae.presets.inspect'),true);
});

for(const [label,configuration,expected] of [
  ['confirmed count',{response:{ok:true,warnings:[],data:{appliedCount:2}}},true],
  ['host rejection',{response:{ok:false,warnings:[],error:{message:'Layer locked'}}},false],
  ['transport rejection',{reject:true},false],
  ['zero count',{response:{ok:true,warnings:[],data:{appliedCount:0}}},false],
  ['missing count',{response:{ok:true,warnings:[],data:{}}},false]
])test(`direct phase ${label} returns its actual outcome without remount or inspection`,async t=>{
  const f=fixture(t,configuration),result=await f.run('phase-apply');
  assert.equal(result.ok,expected);assert.ok(result.message);
  assert.equal(f.navigation.view,expected?'edit':'browse');assert.equal(f.navigation.scroll,28);
  assert.equal(f.renders.length,expected?1:0);assert.deepEqual(f.shellBusy,expected?[true]:[true,false]);
  assert.equal(f.calls.filter(c=>c.command!=='ae.presets.inspect').length,1);assert.equal(f.state.busy,false);
});
