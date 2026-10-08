import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

async function load(file) {
  const built = await build({ entryPoints: [fileURLToPath(new URL(`../client/src/${file}`, import.meta.url))], bundle: true, platform: "node", format: "esm", write: false });
  return import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString("base64")}`);
}
const { createEaseController } = await load("ease-controller.ts");
const { createEaseSync, createEaseApplyLock, readSharedDraft, writeSharedDraft, EASE_DRAFT_KEY } = await load("ease-sync.ts");
const { visiblePoll } = await load("visible-poll.ts");
const { createEaseAutoOpen } = await load("ease-auto-open.ts");
const { DEFAULT_EASE, cloneEaseDraft, easeCommandArgs } = await load("ease-args.ts");

const ok = data => ({ protocolVersion: 1, requestId: "r", ok: true, data, warnings: [], error: null });
const fail = code => ({ protocolVersion: 1, requestId: "r", ok: false, data: null, warnings: [], error: { code, message: code, recoverable: true, action: "x" } });
const session = sig => ({ signature: sig, segments: [{ propertyId: "1:a", layerIndex: 1, t0: 0, t1: 1, generated: [{ time: 0.5, value: 50 }] }] });
const memoryStorage = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), removeItem: k => m.delete(k) }; };
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function harness(overrides = {}) {
  const calls = [], outcomes = [];
  let signature = "A", busy = false, pending = null;
  const draft = { ...cloneEaseDraft(DEFAULT_EASE), live: true };
  const controller = createEaseController({
    origin: "panel",
    execute: args => { calls.push(args); return pending ? pending(args) : Promise.resolve(ok({ appliedCount: 2, session: session(signature) })); },
    draft: () => draft, selectionSignature: () => signature, disabledReason: () => null,
    busy: () => busy, setBusy: value => { busy = value; }, report: outcome => outcomes.push(outcome), liveDelayMs: 10, ...overrides
  });
  return { controller, calls, outcomes, draft, setSignature: s => { signature = s; }, setPending: fn => { pending = fn; }, isBusy: () => busy };
}

test("apply sends expectedSelection and stores the session; the next apply sends it back", async () => {
  const h = harness();
  const first = await h.controller.apply();
  assert.equal(first.kind, "applied"); assert.equal(h.calls[0].expectedSelection, "A"); assert.equal(h.calls[0].session, undefined);
  await h.controller.apply();
  assert.equal(h.calls[1].session.signature, "A"); assert.equal(h.calls[1].session.segments[0].generated[0].value, 50);
});

test("live is debounced to one call and a selection change before it fires discards it", async () => {
  const h = harness();
  h.controller.scheduleLive(); h.controller.scheduleLive(); h.controller.scheduleLive();
  await wait(30);
  assert.equal(h.calls.length, 1);
  h.controller.scheduleLive(); h.setSignature("B"); await wait(30);
  assert.equal(h.calls.length, 1, "no call for a selection that moved on");
  assert.equal(h.outcomes.at(-1).kind, "discarded");
});

test("a late response for a changed selection is discarded and never becomes the session", async () => {
  const h = harness();
  let release; h.setPending(() => new Promise(resolve => { release = resolve; }));
  const result = h.controller.apply();
  await tick(); h.setSignature("B"); h.controller.onSelectionSignature("B");
  release(ok({ appliedCount: 2, session: session("A") }));
  assert.equal((await result).kind, "discarded"); assert.equal(h.controller.session(), null);
});

test("STALE_SELECTION clears the session; KEYFRAME_CONFLICT is reported as conflict; busy queues a live apply", async () => {
  const h = harness();
  await h.controller.apply(); assert.ok(h.controller.session());
  h.setPending(() => Promise.resolve(fail("STALE_SELECTION")));
  assert.equal((await h.controller.apply()).kind, "stale"); assert.equal(h.controller.session(), null);
  h.setPending(() => Promise.resolve(fail("KEYFRAME_CONFLICT")));
  assert.equal((await h.controller.apply()).kind, "conflict");
  h.setPending(null);
  let release; h.setPending(() => new Promise(resolve => { release = resolve; }));
  const inFlight = h.controller.apply(); await tick();
  assert.equal((await h.controller.apply({ quiet: true })).kind, "discarded");
  release(ok({ appliedCount: 1 })); await inFlight; await wait(30);
  assert.equal(h.calls.length, 5, "the queued live apply ran after the first finished");
});

test("the lock refuses a second writer and expires on its own", () => {
  const storage = memoryStorage();
  const lock = createEaseApplyLock(storage, 100);
  assert.equal(lock.acquire("panel", 1000), true);
  assert.equal(lock.acquire("quick", 1050), false);
  assert.equal(lock.acquire("quick", 1200), true, "expired lease");
  lock.release("panel"); assert.equal(lock.acquire("panel", 1201), false, "quick still holds it");
  lock.release("quick"); assert.equal(lock.acquire("panel", 1202), true);
});

test("sync publishes a revision with the payload and the other surface adopts it, ignoring its own events", () => {
  const storage = memoryStorage();
  const listeners = new Map();
  const events = id => ({ extensionId: () => id, dispatch: (type, data) => (listeners.get(type) ?? []).forEach(fn => fn({ type, data, extensionId: id })),
    listen: (type, fn) => { listeners.set(type, [...(listeners.get(type) ?? []), fn]); return () => {}; }, requestOpenExtension: () => true, closeExtension() {}, setWindowTitle() {}, available: () => true });
  const received = [];
  const panel = createEaseSync({ storage, events: events("panel.ext"), origin: "panel", onRemoteChange: s => received.push(["panel", s.revision]) });
  const quick = createEaseSync({ storage, events: events("quick.ext"), origin: "quick", onRemoteChange: s => received.push(["quick", s.revision]) });
  const draft = { ...cloneEaseDraft(DEFAULT_EASE), x1: 0.5 };
  const written = panel.publish(draft, session("A"));
  assert.equal(written.revision, 1);
  assert.deepEqual(received, [["quick", 1]]);
  assert.equal(readSharedDraft(storage).draft.x1, 0.5); assert.equal(readSharedDraft(storage).session.signature, "A");
  quick.publish({ ...draft, x1: 0.6 }, null);
  assert.deepEqual(received, [["quick", 1], ["panel", 2]]);
  assert.equal(quick.revision(), 2);
  storage.setItem(EASE_DRAFT_KEY, "{broken");
  assert.equal(readSharedDraft(storage), null);
  assert.ok(writeSharedDraft(storage, { origin: "panel", draft, session: null }, 5).revision >= 6);
});

test("visiblePoll reads while visible without focus, one read at a time, and stops when hidden", async () => {
  const listeners = {};
  const doc = { hidden: false, defaultView: null, addEventListener: (t, fn) => { listeners[t] = fn; }, removeEventListener() {} };
  let reads = 0, release;
  const poll = visiblePoll(doc, () => { reads += 1; return new Promise(resolve => { release = resolve; }); }, 5, () => true);
  await wait(30);
  assert.equal(reads, 1, "serialized: the pending read blocks new ticks");
  release(); await wait(20);
  assert.ok(reads >= 2);
  doc.hidden = true; listeners.visibilitychange(); const before = reads; release?.(); await wait(25);
  assert.equal(reads, before, "no reads while hidden");
  poll.dispose();
});

test("auto-open opens only for a new selection with keys, and never again after the window was closed on it", async () => {
  const closedListeners = [];
  const events = { extensionId: () => "p", dispatch() {}, listen: (type, fn) => { closedListeners.push(fn); return () => {}; }, requestOpenExtension: () => true, closeExtension() {}, setWindowTitle() {}, available: () => true };
  const doc = { hidden: false, defaultView: null, addEventListener() {}, removeEventListener() {} };
  let context = { selectionSignature: "S1", selectionSelectedKeyCount: 2, isComposition: true };
  const opened = [];
  const watcher = createEaseAutoOpen({ doc, events, intervalMs: 5, enabled: () => true, isBusy: () => false, read: async () => context, open: () => opened.push(context.selectionSignature) });
  await wait(20); assert.deepEqual(opened, ["S1"]);
  await wait(20); assert.deepEqual(opened, ["S1"], "same selection is not reopened");
  context = { selectionSignature: "S1", selectionSelectedKeyCount: 0, isComposition: true }; await wait(15);
  context = { selectionSignature: "S2", selectionSelectedKeyCount: 1, isComposition: true }; await wait(20);
  assert.deepEqual(opened, ["S1", "S2"]);
  closedListeners.forEach(fn => fn({ type: "closed", data: "S3", extensionId: "q" }));
  context = { selectionSignature: "S3", selectionSelectedKeyCount: 1, isComposition: true }; await wait(20);
  assert.deepEqual(opened, ["S1", "S2"], "closed by the user for S3: stays closed");
  watcher.dispose();
});

test("easeCommandArgs forwards expectedSelection and a valid session only", () => {
  const args = easeCommandArgs(cloneEaseDraft(DEFAULT_EASE), { expectedSelection: "A", session: session("A") });
  assert.equal(args.expectedSelection, "A"); assert.equal(args.session.segments.length, 1);
  assert.equal(easeCommandArgs(cloneEaseDraft(DEFAULT_EASE), { session: { signature: 1 } }).session, undefined);
  assert.equal(easeCommandArgs(cloneEaseDraft(DEFAULT_EASE), { expectedSelection: null }).expectedSelection, undefined);
});
