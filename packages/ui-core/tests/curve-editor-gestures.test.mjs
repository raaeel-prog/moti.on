/**
 * Gesture engine of the curve editor on the fake DOM: click vs drag threshold,
 * insertion on the hit path, speed-view drags, Shift fine motion, the mouse
 * fallback, cancel/commit paths and the frozen range. Client coordinates equal
 * viewBox units because the SVG box is stubbed to 368 x 368 at (0, 0).
 */
import test from "node:test";
import assert from "node:assert/strict";

import { createFakeDocument, createFakeWindow } from "./fake-dom.mjs";
import {
  CURVE_PAD, CURVE_PLOT, DRAG_THRESHOLD_PX, FINE_DRAG_FACTOR, createCurveEditor
} from "../dist/index.js";

const labels = {
  graph: "Easing graph", modeMenu: "Mode",
  modes: { bezier: "Bezier", back: "Back", elastic: "Elastic", bounce: "Bounce" },
  directions: { in: "In", out: "Out", inOut: "In Out" }, directionGroup: "Direction",
  speedView: "Speed graph", valueView: "Value graph", reset: "Reset", addPointHint: "Click the curve to add a point",
  outHandle: "Out handle", inHandle: "In handle", point: "Point", pointIn: "Point in handle", pointOut: "Point out handle",
  speedLeft: "Out influence", speedRight: "In influence", peak: "Peak speed",
  amp: "amp", freq: "freq", decay: "decay", start: "start", overshoot: "overshoot", inHalf: "In half", outHalf: "Out half"
};
const ELASTIC = { amp: 1, freq: 3.3, decay: 6.9, start: 0 };
const BOUNCE = { amp: 0.5, freq: 3, decay: 1.2, start: 0 };
const POINT = { x: 0.5, y: 0.5, inX: 0.4, inY: 0.4, outX: 0.6, outY: 0.6 };

function model(overrides = {}) {
  return {
    mode: "bezier", direction: "out", view: "value",
    curve: { x1: 0.25, y1: 0.1, x2: 0.25, y2: 1 }, points: [],
    back: { overshoot: 0.56 },
    elastic: { in: { ...ELASTIC }, out: { ...ELASTIC }, inCurve: null, outCurve: null },
    bounce: { in: { ...BOUNCE }, out: { ...BOUNCE }, inCurve: null, outCurve: null },
    ...overrides
  };
}

/** Document with a listener map (so the editor can register Escape/mouse fallbacks) and a window. */
function mountGestures(overrides = {}) {
  const doc = createFakeDocument();
  const docListeners = new Map();
  doc.addEventListener = (type, handler) => { docListeners.set(type, [...(docListeners.get(type) ?? []), handler]); };
  doc.removeEventListener = (type, handler) => {
    const list = (docListeners.get(type) ?? []).filter(h => h !== handler);
    if (list.length) docListeners.set(type, list); else docListeners.delete(type);
  };
  doc.emit = (type, init = {}) => {
    const event = { target: null, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...init };
    (docListeners.get(type) ?? []).slice().forEach(h => h(event));
    return event;
  };
  doc.listenerCount = type => (docListeners.get(type) ?? []).length;
  doc.defaultView = createFakeWindow();
  const inputs = [], commits = [];
  let cancels = 0;
  const editor = createCurveEditor(doc, {
    model: model(overrides), labels,
    onInput: m => inputs.push(m),
    onCommit: (m, reason) => commits.push({ model: m, reason }),
    onCancel: () => { cancels += 1; }
  });
  const root = editor.element;
  const svg = root.getElementsByTagName("svg").find(n => n.getAttribute("class") === "ch-curve__svg");
  svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 368, height: 368 });
  const byRole = role => root.getElementsByRole(role);
  const hit = () => root.getElementsByTagName("path").find(p => p.getAttribute("class") === "ch-curve__hit");
  const knots = () => byRole("slider").filter(s => s.getAttribute("aria-label") === labels.point);
  const handles = label => byRole("slider").filter(s => s.getAttribute("aria-label") === label);
  const markers = () => byRole("slider").filter(s => s.getAttribute("class") === "ch-curve__marker");
  return { doc, win: doc.defaultView, editor, root, inputs, commits, cancels: () => cancels, byRole, hit, knots, handles, markers };
}

/** Client coordinates of curve point (x, y) in the unit range. */
function client(x, y) { return { clientX: CURVE_PAD + x * CURVE_PLOT, clientY: CURVE_PAD + (1 - y) * CURVE_PLOT }; }
function press(node, at, extra = {}) { return node.emit("pointerdown", { ...at, button: 0, pointerId: 1, isPrimary: true, ...extra }); }
function move(node, at, extra = {}) { return node.emit("pointermove", { ...at, pointerId: 1, ...extra }); }
function release(node, at, extra = {}) { return node.emit("pointerup", { ...at, pointerId: 1, ...extra }); }

test("click on the hit path (< 3 px) inserts a point with one 'point' commit, active and focused", () => {
  const { hit, knots, commits, inputs, doc } = mountGestures();
  const at = client(0.5, 0.5);
  press(hit(), at);
  move(hit(), { clientX: at.clientX + 1, clientY: at.clientY + 1 });
  assert.equal(inputs.length, 0, "below the threshold nothing moves");
  release(hit(), at);
  assert.equal(commits.length, 1);
  assert.equal(commits[0].reason, "point");
  assert.equal(commits[0].model.points.length, 1);
  assert.equal(commits[0].model.points[0].x, 0.5);
  assert.equal(knots().length, 1);
  assert.equal(knots()[0].getAttribute("data-active"), "true");
  assert.equal(doc.activeElement, knots()[0]);
  assert.equal(DRAG_THRESHOLD_PX, 3);
});

test("press + drag >= 3 px on the hit path inserts and moves the knot in one gesture", () => {
  const { hit, commits, inputs, root, editor } = mountGestures();
  const at = client(0.5, 0.5);
  press(hit(), at);
  move(hit(), { clientX: at.clientX + 32, clientY: at.clientY });
  assert.equal(root.getAttribute("data-dragging"), "true");
  assert.equal(inputs.length, 1);
  assert.equal(inputs[0].points.length, 1);
  assert.equal(inputs[0].points[0].x, 0.6);
  move(hit(), { clientX: at.clientX + 64, clientY: at.clientY });
  assert.equal(inputs.length, 2);
  assert.equal(inputs[1].points[0].x, 0.7);
  assert.equal(commits.length, 0);
  release(hit(), { clientX: at.clientX + 64, clientY: at.clientY });
  assert.equal(commits.length, 1);
  assert.equal(commits[0].reason, "gesture");
  assert.equal(commits[0].model.points[0].x, 0.7);
  assert.equal(root.getAttribute("data-dragging"), undefined);
  assert.equal(editor.getModel().points.length, 1);
});

test("refused insertion (gap too small, or 16 points) starts no gesture and commits nothing", () => {
  const near = mountGestures({ points: [{ ...POINT }] });
  press(near.hit(), client(0.505, 0.5));
  move(near.hit(), client(0.6, 0.5));
  release(near.hit(), client(0.6, 0.5));
  assert.equal(near.commits.length, 0);
  assert.equal(near.inputs.length, 0);
  assert.equal(near.editor.getModel().points.length, 1);

  const points = Array.from({ length: 16 }, (_, i) => {
    const x = (i + 1) / 17;
    return { x, y: x, inX: x - 0.01, inY: x - 0.01, outX: x + 0.01, outY: x + 0.01 };
  });
  const full = mountGestures({ points });
  press(full.hit(), client(0.5 / 17 + 0.5, 0.5));
  move(full.hit(), client(0.9, 0.5));
  release(full.hit(), client(0.9, 0.5));
  assert.equal(full.commits.length, 0);
  assert.equal(full.inputs.length, 0);
  assert.equal(full.editor.getModel().points.length, 16);
});

test("knot click selects; drag moves point and handles together; Delete removes only the focused knot", () => {
  const second = { x: 0.8, y: 0.8, inX: 0.75, inY: 0.75, outX: 0.85, outY: 0.85 };
  const { knots, commits, editor, root } = mountGestures({ points: [{ ...POINT }, second] });
  const [a, b] = knots();
  press(a, client(0.5, 0.5));
  release(a, client(0.5, 0.5));
  assert.equal(a.getAttribute("data-active"), "true");
  assert.equal(b.getAttribute("data-active"), undefined);
  assert.equal(root.getAttribute("data-active-point"), "0");
  assert.equal(commits.length, 0, "selecting commits nothing");

  press(a, client(0.5, 0.5));
  move(a, client(0.55, 0.6));
  release(a, client(0.55, 0.6));
  assert.equal(commits.at(-1).reason, "gesture");
  const p = commits.at(-1).model.points[0];
  assert.deepEqual(p, { x: 0.55, y: 0.6, inX: 0.45, inY: 0.5, outX: 0.65, outY: 0.7 });

  b.keydown("Delete");
  assert.equal(commits.at(-1).reason, "point");
  assert.equal(editor.getModel().points.length, 1);
  assert.equal(editor.getModel().points[0].x, 0.55);
  knots()[0].keydown("Backspace");
  assert.equal(editor.getModel().points.length, 0);
});

test("handles edit tangents mirrored; Alt breaks the mirror", () => {
  const { handles, commits } = mountGestures({ points: [{ ...POINT }] });
  const [handleOut] = handles(labels.pointOut);
  press(handleOut, client(0.6, 0.6));
  move(handleOut, client(0.7, 0.5));
  release(handleOut, client(0.7, 0.5));
  let p = commits.at(-1).model.points[0];
  assert.equal(p.outX, 0.7); assert.equal(p.outY, 0.5);
  assert.equal(p.inX, 0.3); assert.equal(p.inY, 0.5, "in handle mirrored");

  const [handleIn] = handles(labels.pointIn);
  press(handleIn, client(0.3, 0.5));
  move(handleIn, client(0.4, 0.3), { altKey: true });
  release(handleIn, client(0.4, 0.3), { altKey: true });
  p = commits.at(-1).model.points[0];
  assert.equal(p.inX, 0.4); assert.equal(p.inY, 0.3);
  assert.equal(p.outX, 0.7); assert.equal(p.outY, 0.5, "Alt keeps the other handle");
});

test("speed view: drag down on the hit path = more influence, up = less; edges touch one side", () => {
  const centre = mountGestures({ view: "speed" });
  const start = { clientX: CURVE_PAD + CURVE_PLOT * 0.5, clientY: CURVE_PAD + CURVE_PLOT * 0.5 };
  press(centre.hit(), start);
  move(centre.hit(), { clientX: start.clientX, clientY: start.clientY + 32 });
  // Centre weights are 0.5 each side: 32 px = 0.1 normalized → ±0.05 on both.
  assert.equal(centre.inputs.at(-1).curve.x1, 0.3, "down moves x1 up");
  assert.equal(centre.inputs.at(-1).curve.x2, 0.2, "down moves 1 - x2 up");
  move(centre.hit(), { clientX: start.clientX, clientY: start.clientY - 32 });
  assert.equal(centre.inputs.at(-1).curve.x1, 0.2, "computed from the gesture-start curve, not accumulated per move");
  assert.equal(centre.inputs.at(-1).curve.x2, 0.3);
  release(centre.hit(), { clientX: start.clientX, clientY: start.clientY - 32 });
  assert.equal(centre.commits.at(-1).reason, "gesture");
  assert.deepEqual(centre.commits.at(-1).model.curve, { x1: 0.2, y1: 0.1, x2: 0.3, y2: 1 });

  const left = mountGestures({ view: "speed" });
  const lx = { clientX: CURVE_PAD + CURVE_PLOT * 0.1, clientY: 200 };
  press(left.hit(), lx);
  move(left.hit(), { clientX: lx.clientX, clientY: lx.clientY + 32 });
  assert.equal(left.inputs.at(-1).curve.x1, 0.35);
  assert.equal(left.inputs.at(-1).curve.x2, 0.25, "x≈0.1 touches only x1");

  const right = mountGestures({ view: "speed" });
  const rx = { clientX: CURVE_PAD + CURVE_PLOT * 0.9, clientY: 200 };
  press(right.hit(), rx);
  move(right.hit(), { clientX: rx.clientX, clientY: rx.clientY + 32 });
  assert.equal(right.inputs.at(-1).curve.x1, 0.25, "x≈0.9 touches only x2");
  assert.equal(right.inputs.at(-1).curve.x2, 0.15);
});

test("speed markers drag like the path and step with ArrowDown (more) / ArrowUp (less)", () => {
  const { markers, inputs, commits } = mountGestures({ view: "speed" });
  const [left, right] = markers();
  const at = { clientX: Number(left.getAttribute("cx")), clientY: Number(left.getAttribute("cy")) };
  press(left, at);
  move(left, { clientX: at.clientX, clientY: at.clientY + 64 });
  assert.equal(inputs.at(-1).curve.x1, 0.45);
  assert.equal(inputs.at(-1).curve.x2, 0.25, "left marker sits at x1 = 0.25: only x1 changes");
  release(left, { clientX: at.clientX, clientY: at.clientY + 64 });
  assert.equal(commits.at(-1).model.curve.x1, 0.45);

  right.keydown("ArrowDown");
  assert.equal(commits.at(-1).model.curve.x2, 0.24);
  right.keydown("ArrowUp");
  assert.equal(commits.at(-1).model.curve.x2, 0.25);
  left.keydown("ArrowUp");
  assert.equal(commits.at(-1).model.curve.x1, 0.44);
});

test("Shift scales the integrated delta by 0.2 with no jump when pressed or released", () => {
  const { knots, inputs } = mountGestures({ points: [{ ...POINT }] });
  const knot = knots()[0];
  const at = client(0.5, 0.5);
  press(knot, at);
  move(knot, { clientX: at.clientX + 32, clientY: at.clientY });
  assert.equal(inputs.at(-1).points[0].x, 0.6);
  // 160 px more with Shift: 160 * 0.2 = 32 px of virtual travel.
  move(knot, { clientX: at.clientX + 192, clientY: at.clientY }, { shiftKey: true });
  assert.equal(inputs.at(-1).points[0].x, 0.7);
  assert.equal(FINE_DRAG_FACTOR, 0.2);
  // Releasing Shift without moving changes nothing; the next coarse step continues from the virtual position.
  move(knot, { clientX: at.clientX + 192, clientY: at.clientY });
  assert.equal(inputs.at(-1).points[0].x, 0.7, "no jump on Shift release");
  move(knot, { clientX: at.clientX + 224, clientY: at.clientY });
  assert.equal(inputs.at(-1).points[0].x, 0.8);
});

test("mousedown after a pointerdown on the same node is ignored", () => {
  const { knots, inputs, commits, doc } = mountGestures({ points: [{ ...POINT }] });
  const knot = knots()[0];
  const at = client(0.5, 0.5);
  press(knot, at);
  release(knot, at);
  knot.emit("mousedown", { ...at, button: 0 });
  assert.equal(doc.listenerCount("mousemove"), 0, "no mouse fallback after Pointer Events were seen");
  doc.emit("mousemove", { clientX: at.clientX + 64, clientY: at.clientY });
  doc.emit("mouseup", {});
  assert.equal(inputs.length, 0);
  assert.equal(commits.length, 0);
});

test("mouse-only editor attaches document mousemove only during a gesture and removes it on mouseup", () => {
  const { knots, inputs, commits, doc } = mountGestures({ points: [{ ...POINT }] });
  const knot = knots()[0];
  const at = client(0.5, 0.5);
  assert.equal(doc.listenerCount("mousemove"), 0);
  knot.emit("mousedown", { ...at, button: 0 });
  assert.equal(doc.listenerCount("mousemove"), 1);
  assert.equal(doc.listenerCount("mouseup"), 1);
  assert.equal(doc.listenerCount("keydown"), 1);
  doc.emit("mousemove", { clientX: at.clientX + 32, clientY: at.clientY });
  assert.equal(inputs.at(-1).points[0].x, 0.6);
  doc.emit("mouseup", {});
  assert.equal(commits.at(-1).reason, "gesture");
  assert.equal(commits.at(-1).model.points[0].x, 0.6);
  assert.equal(doc.listenerCount("mousemove"), 0);
  assert.equal(doc.listenerCount("mouseup"), 0);
  assert.equal(doc.listenerCount("keydown"), 0);
});

test("Escape mid-gesture restores the snapshot, emits onInput with it, calls onCancel, no commit", () => {
  const { hit, inputs, commits, cancels, editor, knots, doc } = mountGestures();
  const at = client(0.5, 0.5);
  press(hit(), at);
  move(hit(), { clientX: at.clientX + 32, clientY: at.clientY });
  assert.equal(editor.getModel().points.length, 1);
  const esc = doc.emit("keydown", { key: "Escape" });
  assert.equal(esc.defaultPrevented, true);
  assert.equal(inputs.at(-1).points.length, 0, "onInput carries the pre-gesture snapshot");
  assert.deepEqual(inputs.at(-1).curve, { x1: 0.25, y1: 0.1, x2: 0.25, y2: 1 });
  assert.equal(editor.getModel().points.length, 0);
  assert.equal(knots().length, 0);
  assert.equal(cancels(), 1);
  assert.equal(commits.length, 0);
  assert.equal(doc.listenerCount("keydown"), 0);
  // A later release is inert.
  release(hit(), at);
  assert.equal(commits.length, 0);
});

test("pointercancel mid-gesture cancels like Escape", () => {
  const { knots, inputs, commits, cancels, editor } = mountGestures({ points: [{ ...POINT }] });
  const knot = knots()[0];
  press(knot, client(0.5, 0.5));
  move(knot, client(0.6, 0.6));
  assert.equal(editor.getModel().points[0].x, 0.6);
  knot.emit("pointercancel", { pointerId: 1 });
  assert.equal(inputs.at(-1).points[0].x, 0.5);
  assert.equal(editor.getModel().points[0].x, 0.5);
  assert.equal(cancels(), 1);
  assert.equal(commits.length, 0);
});

test("window blur mid-drag commits 'gesture' with the last valid state", () => {
  const { knots, commits, cancels, win, root } = mountGestures({ points: [{ ...POINT }] });
  const knot = knots()[0];
  press(knot, client(0.5, 0.5));
  assert.equal(win.listenerCount("blur"), 1);
  move(knot, client(0.6, 0.6));
  win.emit("blur");
  assert.equal(commits.length, 1);
  assert.equal(commits[0].reason, "gesture");
  assert.equal(commits[0].model.points[0].x, 0.6);
  assert.equal(cancels(), 0);
  assert.equal(win.listenerCount("blur"), 0);
  assert.equal(root.getAttribute("data-dragging"), undefined);
});

test("window blur on an armed hit-path press undoes the insertion without a commit", () => {
  const { hit, commits, editor, knots, win, cancels } = mountGestures();
  press(hit(), client(0.5, 0.5));
  assert.equal(editor.getModel().points.length, 1);
  win.emit("blur");
  assert.equal(editor.getModel().points.length, 0);
  assert.equal(knots().length, 0);
  assert.equal(commits.length, 0);
  assert.equal(cancels(), 1);
});

test("setModel and dispose during a drag cancel it without a commit", () => {
  const first = mountGestures({ points: [{ ...POINT }] });
  press(first.knots()[0], client(0.5, 0.5));
  move(first.knots()[0], client(0.6, 0.6));
  first.editor.setModel(model({ curve: { x1: 0.9, y1: 0.5, x2: 0.1, y2: 0.5 } }));
  assert.equal(first.cancels(), 1);
  assert.equal(first.commits.length, 0);
  assert.equal(first.doc.listenerCount("keydown"), 0);
  assert.equal(first.win.listenerCount("blur"), 0);
  assert.deepEqual(first.editor.getModel().curve, { x1: 0.9, y1: 0.5, x2: 0.1, y2: 0.5 });
  assert.equal(first.root.getAttribute("data-dragging"), undefined);

  const second = mountGestures({ points: [{ ...POINT }] });
  press(second.knots()[0], client(0.5, 0.5));
  move(second.knots()[0], client(0.6, 0.6));
  second.editor.dispose();
  assert.equal(second.cancels(), 1);
  assert.equal(second.commits.length, 0);
  assert.equal(second.inputs.at(-1).points[0].x, 0.5);
  assert.equal(second.doc.listenerCount("keydown"), 0);
  assert.equal(second.win.listenerCount("blur"), 0);
});

test("range is frozen during a gesture and refit on release", () => {
  const { byRole, root, inputs, commits } = mountGestures();
  const [outHandle] = byRole("slider");
  const axis = root.getElementsByTagName("path").find(p => p.getAttribute("class") === "ch-curve__axis");
  const before = axis.getAttribute("d");
  assert.equal(outHandle.getAttribute("cy"), String(CURVE_PAD + (1 - 0.1) * CURVE_PLOT));
  press(outHandle, client(0.25, 0.1));
  move(outHandle, client(0.25, 1.8));
  assert.equal(inputs.at(-1).curve.y1, 1.8);
  assert.equal(axis.getAttribute("d"), before, "axes do not move mid-drag");
  assert.equal(outHandle.getAttribute("cy"), String(CURVE_PAD + (1 - 1.8) * CURVE_PLOT), "handle leaves the box on the frozen range");
  release(outHandle, client(0.25, 1.8));
  assert.equal(commits.at(-1).reason, "gesture");
  assert.notEqual(axis.getAttribute("d"), before, "range refit on release");
  const cy = Number(outHandle.getAttribute("cy"));
  assert.ok(cy >= CURVE_PAD && cy <= CURVE_PAD + CURVE_PLOT, `handle back inside the plot after refit (cy=${cy})`);
});

test("elastic and bounce inOut: editing the out group leaves 'in' unchanged", () => {
  for (const mode of ["elastic", "bounce"]) {
    const { root, commits, editor } = mountGestures({ mode, direction: "inOut" });
    const inputs = root.getElementsByTagName("input");
    assert.equal(inputs.length, 8);
    inputs[4].value = "2.5";
    inputs[4].emit("change");
    assert.equal(commits.at(-1).reason, "field");
    const params = editor.getModel()[mode];
    assert.equal(params.out.amp, 2.5);
    assert.deepEqual(params.in, mode === "elastic" ? ELASTIC : BOUNCE);
    inputs[0].value = "0.7";
    inputs[0].emit("change");
    assert.equal(editor.getModel()[mode].in.amp, 0.7);
    assert.equal(editor.getModel()[mode].out.amp, 2.5);
  }
});

test("hit path is inert outside bezier mode", () => {
  const { hit, commits, inputs } = mountGestures({ mode: "back" });
  press(hit(), client(0.5, 0.5));
  move(hit(), client(0.6, 0.6));
  release(hit(), client(0.6, 0.6));
  assert.equal(commits.length, 0);
  assert.equal(inputs.length, 0);
});
