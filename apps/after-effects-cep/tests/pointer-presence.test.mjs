import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

// On Windows each evalScript makes After Effects reset the cursor. Periodic
// host reads must therefore stop while the pointer is over the panel, or the
// cursor flickers over draggable numbers, sliders and popover items.

const built = await build({
  stdin: {
    contents: [
      'export { trackPointerPresence } from "./client/src/pointer-presence.ts";',
      'export { createSelectionCoordinator } from "./client/src/selection-coordinator.ts";',
      'export { focusedPoll } from "./client/src/focused-poll.ts";',
      'export { createQuickBar } from "./client/src/quick-bar.ts";'
    ].join("\n"),
    resolveDir: fileURLToPath(new URL("..", import.meta.url))
  },
  bundle: true, platform: "node", format: "esm", write: false
});
const { trackPointerPresence, createSelectionCoordinator, focusedPoll, createQuickBar } =
  await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString("base64")}`);

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

class FakeDocument extends EventTarget {
  hidden = false;
  focused = true;
  defaultView = new EventTarget();
  hasFocus() { return this.focused; }
}
const pointer = (doc, type, relatedTarget = doc) => doc.dispatchEvent(Object.assign(new Event(type), { relatedTarget }));

function clock(start = 1000) {
  let now = start;
  return { now: () => now, advance: ms => { now += ms; } };
}

test("the pointer is inside after moving over the panel and outside after leaving the window", () => {
  const doc = new FakeDocument();
  const presence = trackPointerPresence(doc);
  assert.equal(presence.inside(), false);
  pointer(doc, "pointermove");
  assert.equal(presence.inside(), true);
  pointer(doc, "pointerout", {});
  assert.equal(presence.inside(), true, "moving between elements of the panel is not leaving");
  pointer(doc, "pointerout", null);
  assert.equal(presence.inside(), false);
  presence.dispose();
});

test("losing focus or hiding the panel counts as leaving", () => {
  const doc = new FakeDocument();
  const presence = trackPointerPresence(doc);
  pointer(doc, "pointerover");
  doc.defaultView.dispatchEvent(new Event("blur"));
  assert.equal(presence.inside(), false);
  pointer(doc, "wheel");
  doc.hidden = true; doc.dispatchEvent(new Event("visibilitychange"));
  assert.equal(presence.inside(), false);
  presence.dispose();
});

test("a missed leave cannot pause the polls for long, but a held button keeps the pause", () => {
  const doc = new FakeDocument();
  const time = clock();
  const presence = trackPointerPresence(doc, { idleMs: 100, now: time.now });
  pointer(doc, "pointermove");
  time.advance(99);
  assert.equal(presence.inside(), true);
  time.advance(1);
  assert.equal(presence.inside(), false);
  pointer(doc, "pointerdown");
  time.advance(5000);
  assert.equal(presence.inside(), true, "a slider held still is still being dragged");
  pointer(doc, "pointerup");
  assert.equal(presence.inside(), true);
  time.advance(100);
  assert.equal(presence.inside(), false);
  presence.dispose();
});

test("entering notifies once per entry and dispose detaches everything", () => {
  const doc = new FakeDocument();
  const time = clock();
  const presence = trackPointerPresence(doc, { idleMs: 100, now: time.now });
  let entries = 0;
  presence.onEnter(() => { entries += 1; });
  pointer(doc, "pointerover"); pointer(doc, "pointermove"); pointer(doc, "pointermove");
  assert.equal(entries, 1);
  pointer(doc, "pointerout", null); pointer(doc, "pointermove");
  assert.equal(entries, 2);
  time.advance(100); pointer(doc, "pointermove");
  assert.equal(entries, 3, "moving after the idle limit is a fresh entry, worth one read");
  presence.dispose();
  pointer(doc, "pointermove");
  assert.equal(presence.inside(), false);
  assert.equal(entries, 3);
});

function manualSchedule() {
  const queue = [];
  return {
    schedule: (fn, delay) => { const handle = { fn, delay }; queue.push(handle); return handle; },
    cancel: handle => { const at = queue.indexOf(handle); if (at >= 0) queue.splice(at, 1); },
    async run() { const handle = queue.shift(); assert.ok(handle, "a tick is scheduled"); handle.fn(); await wait(0); return handle.delay; },
    get size() { return queue.length; }
  };
}

test("the selection coordinator skips periodic reads while paused but honours a refresh", async () => {
  const doc = new FakeDocument();
  const timers = manualSchedule();
  let paused = true, reads = 0;
  const coordinator = createSelectionCoordinator({
    document: doc, window: doc.defaultView, blocked: () => false, paused: () => paused,
    read: async () => { reads += 1; }, schedule: timers.schedule, cancel: timers.cancel
  });
  await timers.run(); await timers.run();
  assert.equal(reads, 0, "no periodic read with the pointer in the panel");
  coordinator.refresh();
  assert.equal(await timers.run(), 0);
  assert.equal(reads, 1, "focus, the pointer entering or an operation still read");
  await timers.run();
  assert.equal(reads, 1);
  paused = false;
  await timers.run();
  assert.equal(reads, 2, "periodic reads resume once the pointer leaves");
  coordinator.dispose();
  assert.equal(timers.size, 0);
});

test("an open editor re-reads the layer only when the selection changed or on a refresh", async () => {
  // The editor's read touches the text document; polling it while text was
  // typed in the viewer broke AE's text editing.
  const doc = new FakeDocument();
  doc.focused = false;
  const timers = manualSchedule();
  let changed = false, contextReads = 0, editorReads = 0;
  const coordinator = createSelectionCoordinator({
    document: doc, window: doc.defaultView, blocked: () => false,
    read: async () => { contextReads += 1; return changed; }, schedule: timers.schedule, cancel: timers.cancel
  });
  coordinator.subscribe({ read: async () => { editorReads += 1; }, enabled: () => true });
  await timers.run();
  assert.equal(editorReads, 1, "subscribing reads once");
  await timers.run(); await timers.run();
  assert.equal(editorReads, 1, "an unchanged selection does not touch the layer");
  assert.equal(contextReads, 2);
  changed = true;
  await timers.run();
  assert.equal(editorReads, 2, "a new selection reaches the editor");
  changed = false;
  coordinator.refresh();
  await timers.run();
  assert.equal(editorReads, 3, "focus, the pointer entering or an operation still read the editor");
  coordinator.dispose();
});

test("focusedPoll skips its interval reads while paused; focus still reads", async t => {
  const doc = new FakeDocument();
  const previous = globalThis.window;
  globalThis.window = doc.defaultView;
  t.after(() => { globalThis.window = previous; });
  let paused = true, reads = 0;
  const polling = focusedPoll(doc, () => { reads += 1; }, 5, () => true, () => paused);
  await wait(30);
  assert.equal(reads, 0);
  doc.defaultView.dispatchEvent(new Event("focus"));
  assert.equal(reads, 1);
  paused = false;
  await wait(30);
  assert.ok(reads > 1, `interval reads resume (${reads})`);
  polling.dispose();
});

test("the quick bar does not read the host while paused and redraws favourites without a read", async () => {
  const token = "16780E7C-F9EF-4142-B49F-4ADACC00649A";
  const files = new Map([["handshake.json", JSON.stringify({ version: 1, token, capabilities: ["quick-bar"], hostProof: true })]]);
  const requests = [];
  const doc = new FakeDocument();
  let paused = true, reads = 0;
  let items = [{ id: "ease", label: "Ease", curve: { x1: 0.25, y1: 0.1, x2: 0.25, y2: 1 } }];
  const bar = createQuickBar({
    doc, files: { read: name => files.get(name), write: text => requests.push(JSON.parse(text)) }, intervalMs: 5, eventIntervalMs: 5,
    read: async () => { reads += 1; return { selectionSignature: "S1", selectionSelectedKeyCount: 2, isComposition: true }; },
    isBusy: () => false, enabled: () => true, paused: () => paused,
    items: () => items, labels: () => ({ editor: "Editor", close: "Fechar", title: "Rápida" }),
    onPick: () => {}, onEditor: () => {}
  });
  await wait(30);
  assert.equal(reads, 0);
  paused = false;
  await wait(30);
  assert.ok(reads > 0);
  assert.deepEqual(requests.map(r => r.operation), ["show"]);
  paused = true;
  const before = reads;
  await wait(15);
  items = [...items, { id: "linear", label: "Linear", curve: { x1: 0, y1: 0, x2: 1, y2: 1 } }];
  bar.refreshItems();
  assert.deepEqual(requests.map(r => r.operation), ["show", "show"]);
  assert.equal(requests[1].items.length, 2);
  await wait(15);
  assert.ok(reads <= before + 1, "at most the read already in flight finishes");
  bar.dispose();
});
