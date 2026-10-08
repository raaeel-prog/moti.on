/**
 * Flow-style curve editor: header menu, direction dots, keyboard handles,
 * view toggle, points, fields, reset, setModel and dispose — all on the fake
 * DOM, so nothing here depends on layout or pointer geometry.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { createFakeDocument } from "./fake-dom.mjs";
import {
  CURVE_PAD, CURVE_PLOT, createCurveEditor, curveToPlot, plotToCurve, speedPathD, valuePathD
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

function mount(overrides = {}, docOptions = {}) {
  const doc = createFakeDocument(docOptions);
  const inputs = [];
  const commits = [];
  const editor = createCurveEditor(doc, {
    model: model(overrides), labels,
    onInput: m => inputs.push(m),
    onCommit: (m, reason) => commits.push({ model: m, reason })
  });
  const root = editor.element;
  const byRole = role => root.getElementsByRole(role);
  const overlay = root.getElementsByTagName("button").find(b => (b.className || "").includes("ch-curve__overlay"));
  const mainPath = root.getElementsByTagName("path").find(p => p.getAttribute("class").startsWith("ch-curve__value") && !p.getAttribute("class").includes("faint"));
  return { doc, editor, root, inputs, commits, byRole, overlay, mainPath };
}

test("header exposes a listbox with four options and the mode button is wired to it", () => {
  const { root, byRole } = mount();
  const button = root.getElementsByTagName("button")[0];
  assert.equal(button.getAttribute("aria-haspopup"), "listbox");
  assert.equal(button.getAttribute("aria-expanded"), "false");
  const [listbox] = byRole("listbox");
  assert.ok(listbox, "listbox missing");
  assert.equal(listbox.hidden, true);
  const options = byRole("option");
  assert.deepEqual(options.map(o => o.getAttribute("data-mode")), ["bezier", "back", "elastic", "bounce"]);
  assert.deepEqual(options.map(o => o.getAttribute("aria-selected")), ["true", "false", "false", "false"]);
  assert.equal(options[2].allText, "Elastic");
  assert.equal(byRole("radiogroup")[0].hidden, true, "direction dots hidden in bezier mode");
});

test("selecting a mode via keyboard commits 'mode' and reveals the direction radiogroup", () => {
  const { doc, root, byRole, commits } = mount();
  const button = root.getElementsByTagName("button")[0];
  button.click();
  const [listbox] = byRole("listbox");
  assert.equal(listbox.hidden, false);
  assert.equal(button.getAttribute("aria-expanded"), "true");
  const options = byRole("option");
  assert.equal(doc.activeElement, options[0]);
  options[0].keydown("ArrowDown");
  options[1].keydown("ArrowDown");
  assert.equal(doc.activeElement, options[2]);
  options[2].keydown("Enter");
  assert.equal(listbox.hidden, true);
  assert.equal(commits.at(-1).reason, "mode");
  assert.equal(commits.at(-1).model.mode, "elastic");
  assert.equal(root.getAttribute("data-mode"), "elastic");
  const [group] = byRole("radiogroup");
  assert.equal(group.hidden, false);
  const radios = byRole("radio");
  assert.equal(radios.length, 3);
  assert.deepEqual(radios.map(r => r.getAttribute("aria-checked")), ["false", "false", "true"]);
  assert.equal(radios[1].title, "In Out");
});

test("direction radio commits 'direction' by click and by arrow key", () => {
  const { byRole, commits } = mount({ mode: "bounce" });
  const radios = byRole("radio");
  radios[0].click();
  assert.equal(commits.at(-1).reason, "direction");
  assert.equal(commits.at(-1).model.direction, "in");
  radios[0].keydown("ArrowRight");
  assert.equal(commits.at(-1).model.direction, "inOut");
  assert.equal(radios[1].getAttribute("aria-checked"), "true");
});

test("end handles are sliders; ArrowRight commits 'keyboard' with x1 + 0.01", () => {
  const { byRole, commits, inputs } = mount();
  const sliders = byRole("slider");
  assert.equal(sliders[0].getAttribute("aria-label"), labels.outHandle);
  assert.equal(sliders[0].getAttribute("tabindex"), "0");
  assert.equal(sliders[0].getAttribute("aria-valuetext"), "0.25, 0.1");
  const event = sliders[0].keydown("ArrowRight");
  assert.equal(event.defaultPrevented, true);
  assert.equal(commits.at(-1).reason, "keyboard");
  assert.equal(commits.at(-1).model.curve.x1, 0.26);
  assert.equal(inputs.length, 0, "keyboard steps do not fire onInput");
  sliders[1].keydown("ArrowUp", { shiftKey: true });
  assert.equal(commits.at(-1).model.curve.y2, 1.1);
});

test("overlay toggles the view only in bezier mode without points", () => {
  const { overlay, commits, root } = mount();
  assert.equal(overlay.title, labels.speedView);
  assert.equal(overlay.getAttribute("aria-pressed"), "false");
  overlay.click();
  assert.equal(commits.at(-1).reason, "view");
  assert.equal(commits.at(-1).model.view, "speed");
  assert.equal(overlay.getAttribute("aria-pressed"), "true");
  assert.equal(root.getAttribute("data-view"), "speed");
  const peak = root.getElementsByTagName("text")[0];
  assert.equal(peak.getAttribute("aria-label"), labels.peak);
  assert.match(peak.textContent, /^×\d+\.\d$/);

  const withPoints = mount({ points: [{ x: 0.5, y: 0.5, inX: 0.4, inY: 0.4, outX: 0.6, outY: 0.6 }] });
  assert.equal(withPoints.overlay.title, labels.reset);
  withPoints.overlay.click();
  assert.equal(withPoints.commits.at(-1).reason, "reset");
  assert.equal(withPoints.commits.at(-1).model.points.length, 0);

  const back = mount({ mode: "back" });
  assert.equal(back.overlay.title, labels.reset);
});

test("speed markers step the influence: ArrowDown = more, ArrowUp = less", () => {
  const { byRole, commits } = mount({ view: "speed" });
  const markers = byRole("slider").filter(s => s.getAttribute("class") === "ch-curve__marker");
  assert.equal(markers.length, 2);
  markers[0].keydown("ArrowDown");
  assert.equal(commits.at(-1).reason, "keyboard");
  assert.equal(commits.at(-1).model.curve.x1, 0.26, "ArrowDown raises x1 (more out influence)");
  markers[0].keydown("ArrowUp");
  assert.equal(commits.at(-1).model.curve.x1, 0.25, "ArrowUp lowers x1");
  markers[1].keydown("ArrowDown");
  assert.equal(commits.at(-1).model.curve.x2, 0.24, "ArrowDown lowers x2 (more in influence: 1 - x2 up)");
  markers[1].keydown("ArrowUp", { shiftKey: true });
  assert.equal(commits.at(-1).model.curve.x2, 0.34, "Shift steps by 0.1");
});

test("plain click on the hit path adds a point and Delete on it removes the point", () => {
  const { byRole, commits, editor, root, doc } = mount();
  // Fake DOM has no geometry; the editor falls back to getBoundingClientRect.
  const svg = root.getElementsByTagName("svg").find(n => n.getAttribute("class") === "ch-curve__svg");
  svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 368, height: 368 });
  const hit = root.getElementsByTagName("path").find(p => p.getAttribute("class") === "ch-curve__hit");
  assert.ok(hit, "hit path missing");
  const at = { clientX: CURVE_PAD + CURVE_PLOT * 0.5, clientY: CURVE_PAD + CURVE_PLOT * 0.5, button: 0, pointerId: 1, isPrimary: true };
  hit.emit("pointerdown", at);
  assert.equal(commits.length, 0, "nothing committed while the press is armed");
  hit.emit("pointerup", at);
  assert.equal(commits.at(-1).reason, "point");
  assert.equal(commits.at(-1).model.points.length, 1);
  assert.equal(commits.at(-1).model.points[0].x, 0.5);
  const knot = byRole("slider").find(s => s.getAttribute("aria-label") === labels.point);
  assert.ok(knot, "point knot missing");
  assert.equal(knot.getAttribute("data-active"), "true");
  assert.equal(doc.activeElement, knot);
  assert.equal(byRole("slider").filter(s => [labels.pointIn, labels.pointOut].includes(s.getAttribute("aria-label"))).length, 2);
  assert.equal(editor.getModel().points.length, 1);
  knot.keydown("Delete");
  assert.equal(commits.at(-1).reason, "point");
  assert.equal(commits.at(-1).model.points.length, 0);
  assert.equal(editor.getModel().points.length, 0);
});

test("elastic field change commits 'field' with the new amp", () => {
  const { root, commits } = mount({ mode: "elastic", direction: "out" });
  const inputs = root.getElementsByTagName("input");
  assert.equal(inputs.length, 4);
  assert.deepEqual(inputs.map(i => i.getAttribute("aria-label")), ["amp", "freq", "decay", "start"]);
  inputs[0].value = "2";
  inputs[0].emit("change");
  assert.equal(commits.at(-1).reason, "field");
  assert.equal(commits.at(-1).model.elastic.out.amp, 2);
});

test("inOut elastic shows two labelled groups and the in-half handles", () => {
  const { root, byRole } = mount({ mode: "bounce", direction: "inOut" });
  const groups = byRole("group").filter(g => (g.className || "").includes("ch-curve__params"));
  assert.deepEqual(groups.map(g => g.getAttribute("aria-label")), [labels.inHalf, labels.outHalf]);
  assert.equal(root.getElementsByTagName("input").length, 8);
  const visibleSliders = byRole("slider").filter(s => s.getAttribute("display") !== "none");
  assert.equal(visibleSliders.length, 2, "only the in-half handles are visible");
  assert.equal(visibleSliders[0].getAttribute("aria-valuetext"), "0.42, 0");
  assert.ok(root.getElementsByTagName("linearGradient").length === 1);
});

test("reset restores the mode defaults with reason 'reset'", () => {
  const { overlay, commits, root } = mount({ mode: "back", back: { overshoot: 0.2 } });
  overlay.click();
  assert.equal(commits.at(-1).reason, "reset");
  assert.equal(commits.at(-1).model.back.overshoot, 0.56);
  assert.equal(root.getElementsByTagName("input")[0].value, "0.56");

  const elastic = mount({ mode: "elastic", elastic: { in: { ...ELASTIC, amp: 3 }, out: { ...ELASTIC }, inCurve: { x1: 0, y1: 0, x2: 1, y2: 1 }, outCurve: null } });
  elastic.overlay.click();
  assert.deepEqual(elastic.commits.at(-1).model.elastic, { in: ELASTIC, out: ELASTIC, inCurve: null, outCurve: null });
});

test("setModel redraws everything without callbacks and getModel returns copies", () => {
  const { editor, commits, inputs, root, byRole } = mount();
  const next = model({ mode: "elastic", direction: "inOut", curve: { x1: 0.9, y1: 0.5, x2: 0.1, y2: 0.5 } });
  editor.setModel(next);
  assert.equal(commits.length, 0);
  assert.equal(inputs.length, 0);
  assert.equal(root.getAttribute("data-mode"), "elastic");
  assert.equal(byRole("radio")[1].getAttribute("aria-checked"), "true");
  const copy = editor.getModel();
  assert.deepEqual(copy, next);
  assert.notEqual(copy, next);
  copy.curve.x1 = 0;
  assert.equal(editor.getModel().curve.x1, 0.9);
  next.elastic.in.amp = 9;
  assert.equal(editor.getModel().elastic.in.amp, 1, "editor must not keep the caller's object");
});

test("dispose removes every document listener the editor registered", () => {
  const doc = createFakeDocument();
  let added = 0, removed = 0;
  doc.addEventListener = () => { added += 1; };
  doc.removeEventListener = () => { removed += 1; };
  const editor = createCurveEditor(doc, { model: model(), labels, onInput: () => {}, onCommit: () => {} });
  assert.equal(added, 0, "nothing on the document while idle");
  editor.element.getElementsByTagName("button")[0].click(); // opens the menu: outside-click listeners
  assert.ok(added > 0);
  editor.dispose();
  assert.equal(removed, added);
});

test("runtime without createElementNS still exposes mode, direction and fields", () => {
  const { root, byRole } = mount({ mode: "elastic" }, { supportsNamespaces: false });
  assert.equal(root.getElementsByTagName("svg").length, 0);
  assert.equal(byRole("option").length, 4);
  assert.equal(root.getElementsByTagName("input").length, 4);
});

test("pure helpers: value path starts at the (0,0) plot point; linear speed is flat at 1", () => {
  const range = { low: 0, high: 1 };
  const origin = curveToPlot(0, 0, range);
  assert.deepEqual(origin, { x: CURVE_PAD, y: CURVE_PAD + CURVE_PLOT });
  assert.ok(valuePathD(model(), range).startsWith(`M ${origin.x},${origin.y} C`));
  assert.ok(valuePathD(model({ mode: "elastic" }), range).startsWith(`M ${origin.x},${origin.y} L`));
  const back = plotToCurve(origin.x, origin.y, range);
  assert.deepEqual(back, { x: 0, y: 0 });
  const speedRange = { low: 0, high: 2 };
  const d = speedPathD({ x1: 0, y1: 0, x2: 1, y2: 1 }, speedRange);
  // keyframe-core reports 0 at the exact endpoints (dx = dy = 0); every interior sample is 1.
  const ys = new Set(d.split(" ").filter(t => t.includes(",")).slice(1, -1).map(t => t.split(",")[1]));
  assert.equal(ys.size, 1);
  assert.equal([...ys][0], String(curveToPlot(0, 1, speedRange).y));
});
