import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

async function load(file) {
  const built = await build({ entryPoints: [fileURLToPath(new URL(`../client/src/${file}`, import.meta.url))], bundle: true, platform: "node", format: "esm", write: false });
  return import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString("base64")}`);
}
const { createQuickBar } = await load("quick-bar.ts");

const TOKEN = "16780E7C-F9EF-4142-B49F-4ADACC00649A";
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const ITEMS = [{ id: "ease", label: "Ease", curve: { x1: 0.25, y1: 0.1, x2: 0.25, y2: 1 } }];
const LABELS = { editor: "Editor completo", close: "Fechar", title: "Suavização rápida" };

/** In-memory stand-in for ~/Library/Caches/Moti.on/QuickBar and the native side. */
function nativeFolder({ capabilities = ["quick-bar"], event = null } = {}) {
  const files = new Map([["handshake.json", JSON.stringify({ version: 1, token: TOKEN, capabilities, hostProof: true })]]);
  if (event) files.set("event.json", JSON.stringify(event));
  const requests = [];
  let sequence = Date.now();
  return {
    requests,
    files: { read: name => files.get(name), write: text => requests.push(JSON.parse(text)) },
    click(kind, signature, id) { files.set("event.json", JSON.stringify({ version: 1, sequence: ++sequence, kind, signature, id })); }
  };
}

function mount(native, overrides = {}) {
  let context = { selectionSignature: "S1", selectionSelectedKeyCount: 2, isComposition: true };
  const picks = [], editors = [];
  const doc = { hidden: false, defaultView: null, addEventListener() {}, removeEventListener() {} };
  const bar = createQuickBar({
    doc, files: native.files, intervalMs: 5, eventIntervalMs: 5,
    read: async () => context, isBusy: () => false, enabled: () => true,
    items: () => ITEMS, labels: () => LABELS,
    onPick: (id, signature) => picks.push({ id, signature }), onEditor: () => editors.push(true), ...overrides
  });
  return { bar, picks, editors, set: next => { context = { ...context, ...next }; } };
}
const ops = native => native.requests.map(r => r.operation);

test("a new keyframe selection shows the bar once, with token, items and labels", async () => {
  const native = nativeFolder();
  const { bar } = mount(native);
  await wait(30);
  assert.deepEqual(ops(native), ["show"], "same selection is not shown twice");
  const [show] = native.requests;
  assert.equal(show.token, TOKEN); assert.equal(show.version, 1); assert.equal(show.signature, "S1");
  assert.deepEqual(show.items, ITEMS); assert.deepEqual(show.labels, LABELS);
  assert.ok(Number.isSafeInteger(show.sequence));
  bar.dispose();
});

test("clearing the selection hides it; a new selection shows it again", async () => {
  const native = nativeFolder();
  const { bar, set } = mount(native);
  await wait(20);
  set({ selectionSelectedKeyCount: 0 }); await wait(20);
  set({ selectionSignature: "S2", selectionSelectedKeyCount: 1 }); await wait(20);
  assert.deepEqual(ops(native), ["show", "hide", "show"]);
  assert.equal(native.requests[2].signature, "S2");
  bar.dispose();
});

test("a pick is forwarded with its selection; the bar stays up for the next comparison", async () => {
  const native = nativeFolder();
  const { bar, picks } = mount(native);
  await wait(20);
  native.click("pick", "S1", "ease"); await wait(20);
  assert.deepEqual(picks, [{ id: "ease", signature: "S1" }]);
  native.click("pick", "OTHER", "ease"); await wait(20);
  assert.equal(picks.length, 1, "a click for another selection is ignored");
  assert.deepEqual(ops(native), ["show"]);
  bar.dispose();
});

test("dismissed for a selection: not shown again until the selection is cleared", async () => {
  const native = nativeFolder();
  const { bar, set } = mount(native);
  await wait(20);
  native.click("dismiss", "S1"); await wait(30);
  assert.deepEqual(ops(native), ["show"], "Esc / click outside keeps it closed on S1");
  set({ selectionSelectedKeyCount: 0 }); await wait(20);
  set({ selectionSelectedKeyCount: 2 }); await wait(20);
  assert.deepEqual(ops(native), ["show", "show"], "re-selecting after clearing brings it back");
  bar.dispose();
});

test("'Editor completo' opens the editor and closes the bar for that selection", async () => {
  const native = nativeFolder();
  const { bar, editors } = mount(native);
  await wait(20);
  native.click("editor", "S1"); await wait(20);
  assert.equal(editors.length, 1);
  assert.deepEqual(ops(native), ["show"]);
  bar.dispose();
});

test("an event left from before the panel started is never replayed", async () => {
  const native = nativeFolder({ event: { version: 1, sequence: Date.now() + 1e6, kind: "pick", signature: "S1", id: "ease" } });
  const { bar, picks } = mount(native);
  await wait(30);
  assert.equal(picks.length, 0);
  bar.dispose();
});

test("without the native bar (no handshake capability) nothing is written and it reports unavailable", async () => {
  const native = nativeFolder({ capabilities: ["phase-number"] });
  const { bar } = mount(native);
  await wait(20);
  assert.equal(bar.available(), false);
  assert.equal(native.requests.length, 0);
  bar.dispose();
});

test("turned off in Settings: hides an open bar and shows nothing new", async () => {
  const native = nativeFolder();
  let enabled = true;
  const { bar } = mount(native, { enabled: () => enabled });
  await wait(20);
  enabled = false; await wait(20);
  assert.deepEqual(ops(native), ["show", "hide"]);
  bar.dispose();
});

test("dispose hides the bar", async () => {
  const native = nativeFolder();
  const { bar } = mount(native);
  await wait(20);
  bar.dispose();
  assert.deepEqual(ops(native), ["show", "hide"]);
});
