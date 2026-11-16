/**
 * Curve editor precision (compact review 2026-10-24): magnet to the 0/1 lines, Ctrl grid,
 * Alt + arrow fine step, and nothing drawn over the plot (toggle in the header, help for
 * screen readers).
 */
import test from "node:test";
import assert from "node:assert/strict";

import { createFakeDocument } from "./fake-dom.mjs";
import { SNAP_GRID, createCurveEditor, snapCurvePoint } from "../dist/curve-editor.js";

const labels = {
  graph: "Easing graph", modeMenu: "Mode",
  modes: { bezier: "Bezier", back: "Back", elastic: "Elastic", bounce: "Bounce" },
  directions: { in: "In", out: "Out", inOut: "In Out" }, directionGroup: "Direction",
  speedView: "Speed graph", valueView: "Value graph", reset: "Reset", addPointHint: "Click the curve to add a point",
  outHandle: "Out handle", inHandle: "In handle", point: "Point", pointIn: "Point in handle", pointOut: "Point out handle",
  speedLeft: "Out influence", speedRight: "In influence", peak: "Peak speed",
  amp: "amp", freq: "freq", decay: "decay", start: "start", overshoot: "overshoot", inHalf: "In half", outHalf: "Out half"
};
const PARAMS = { amp: 1, freq: 3, decay: 6, start: 0 };
const model = () => ({
  mode: "bezier", direction: "out", view: "value", curve: { x1: 0.25, y1: 0.1, x2: 0.25, y2: 1 }, points: [], back: { overshoot: 0.56 },
  elastic: { in: { ...PARAMS }, out: { ...PARAMS }, inCurve: null, outCurve: null },
  bounce: { in: { ...PARAMS }, out: { ...PARAMS }, inCurve: null, outCurve: null }
});
const find = (node, predicate) => {
  if (predicate(node)) return node;
  for (const child of node.children ?? []) { const hit = find(child, predicate); if (hit) return hit; }
  return null;
};

test("the magnet holds a dot on the 0 and 1 lines only within its tolerance", () => {
  const tolerance = { x: 0.02, y: 0.03 };
  assert.deepEqual(snapCurvePoint(0.4, 0.98, tolerance, false), { x: 0.4, y: 1 });
  assert.deepEqual(snapCurvePoint(0.01, -0.02, tolerance, false), { x: 0, y: 0 });
  assert.deepEqual(snapCurvePoint(0.4, 0.95, tolerance, false), { x: 0.4, y: 0.95 }, "outside the tolerance the value is untouched");
  assert.deepEqual(snapCurvePoint(0.4, 1.2, tolerance, false), { x: 0.4, y: 1.2 }, "overshoot stays free");
});

test("Ctrl rounds a dot to the grid without float noise", () => {
  assert.equal(SNAP_GRID, 0.05);
  assert.deepEqual(snapCurvePoint(0.162, 0.874, { x: 0, y: 0 }, true), { x: 0.15, y: 0.85 });
  assert.deepEqual(snapCurvePoint(0.33, 1.13, { x: 0, y: 0 }, true), { x: 0.35, y: 1.15 });
});

test("Alt + arrow moves a handle by 0.001, plain arrows by 0.01 and Shift by 0.1", () => {
  const doc = createFakeDocument();
  const commits = [];
  const editor = createCurveEditor(doc, { model: model(), labels, onInput: () => {}, onCommit: m => commits.push(m) });
  const handle = editor.element.getElementsByRole("slider").find(node => node.getAttribute("aria-label") === "Out handle");
  handle.keydown("ArrowRight", { altKey: true });
  assert.equal(commits.at(-1).curve.x1, 0.251);
  handle.keydown("ArrowRight");
  assert.equal(commits.at(-1).curve.x1, 0.261);
  handle.keydown("ArrowUp", { shiftKey: true });
  assert.equal(commits.at(-1).curve.y1, 0.2);
  editor.dispose();
});

test("the view toggle sits in the header and the gesture help is not printed over the plot", () => {
  const doc = createFakeDocument();
  const editor = createCurveEditor(doc, { model: model(), labels, onInput: () => {}, onCommit: () => {} });
  const header = find(editor.element, node => node.className === "ch-curve__header");
  const plot = find(editor.element, node => node.className === "ch-curve__plot");
  assert.ok(find(header, node => String(node.className).includes("ch-curve__overlay")), "toggle in the header");
  assert.equal(find(plot, node => String(node.className).includes("ch-curve__overlay")), null, "nothing over the (1, 1) corner");
  const hint = find(editor.element, node => String(node.className).includes("ch-curve__hint"));
  assert.match(hint.className, /ch-visually-hidden/);
  const svg = find(plot, node => String(node.getAttribute?.("class")).includes("ch-curve__svg"));
  assert.equal(svg.getAttribute("aria-describedby"), hint.id);
  editor.dispose();
});
