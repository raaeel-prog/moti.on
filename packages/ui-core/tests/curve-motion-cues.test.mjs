/**
 * Motion cues of the easing graph (design v6, opt-in): speed area with its peak, bands outside 0–100 %,
 * keyframe squares, dashed preview curve and the frame ruler. The fake DOM cannot measure SVG paths, so the
 * value path gets a straight-line measurement from (0, 0) to (1, 1) in plot units.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { createFakeDocument } from "./fake-dom.mjs";
import { CURVE_PAD, CURVE_PLOT, createCurveEditor } from "../dist/index.js";

const labels = {
  graph: "Gráfico", modeMenu: "Tipo",
  modes: { bezier: "Bézier", back: "Back", elastic: "Elástico", bounce: "Quique" },
  directions: { in: "Entrada", out: "Saída", inOut: "Ambos" }, directionGroup: "Direção",
  speedView: "Velocidade", valueView: "Valor", reset: "Redefinir", addPointHint: "Clique na curva",
  outHandle: "Alça de saída", inHandle: "Alça de entrada", point: "Ponto", pointIn: "Entrada do ponto", pointOut: "Saída do ponto",
  speedLeft: "Influência de saída", speedRight: "Influência de entrada", peak: "Pico",
  amp: "amp", freq: "freq", decay: "decay", start: "início", overshoot: "excesso", inHalf: "Metade de entrada", outHalf: "Metade de saída",
  cueTime: "tempo", cueValue: "valor", cueSpeed: "velocidade", cuePeak: "pico", cueReplay: "Repetir a prévia", cueFrames: "q",
  influenceOut: "Saída", influenceIn: "Entrada", cueOvershoot: "excesso", cueDecimal: ","
};
const PARAMS = { amp: 1, freq: 3, decay: 6, start: 0 };
const model = () => ({
  mode: "bezier", direction: "out", view: "value", curve: { x1: 0.25, y1: 0, x2: 0.75, y2: 1 }, points: [],
  back: { overshoot: 0.56 }, elastic: { in: { ...PARAMS }, out: { ...PARAMS }, inCurve: null, outCurve: null },
  bounce: { in: { ...PARAMS }, out: { ...PARAMS }, inCurve: null, outCurve: null }
});

function mount(options = {}) {
  const doc = createFakeDocument();
  const create = doc.createElement, createNS = doc.createElementNS;
  doc.createElement = tag => { const node = create(tag); node.style = { setProperty() {} }; return node; };
  doc.createElementNS = (ns, tag) => {
    const node = createNS(ns, tag);
    node.style = { setProperty() {} };
    if (tag === "path") {
      // Straight value line from (0, 0) to (1, 1) of the plot, in viewBox units.
      node.getTotalLength = () => 100;
      node.getPointAtLength = length => ({ x: CURVE_PAD + length / 100 * CURVE_PLOT, y: CURVE_PAD + CURVE_PLOT - length / 100 * CURVE_PLOT });
    }
    return node;
  };
  const editor = createCurveEditor(doc, { model: model(), labels, motionCues: true, cueFrames: 24, cueFps: 30, onInput() {}, onCommit() {}, ...options });
  const all = [];
  (function walk(node) { all.push(node); for (const child of node.children ?? []) walk(child); })(editor.element);
  const byClass = name => all.filter(node => String(node.getAttribute?.("class") ?? node.className ?? "").split(/\s+/).includes(name));
  const shown = node => node.getAttribute("display") !== "none";
  return { editor, byClass, shown };
}

test("speed area, peak, bands and keyframe squares draw once the value curve can be measured", () => {
  const { editor, byClass, shown } = mount();
  assert.equal(editor.element.getAttribute("data-cues"), "true");
  const [area] = byClass("ch-curve__speed-area"), [label] = byClass("ch-curve__speed-label");
  assert.ok(shown(area), "speed area visible in the value view");
  assert.match(area.getAttribute("d"), /^M /);
  assert.match(label.textContent, /^pico \d+,\d×$/, "peak label uses the pt-BR decimal comma");
  assert.equal(byClass("ch-curve__key").filter(shown).length, 2, "two keyframe squares, at 0 % and 100 %");
  assert.deepEqual(byClass("ch-curve__axis-label").map(node => node.textContent), ["100", "0"]);
  editor.setSpeedArea(false);
  assert.equal(shown(byClass("ch-curve__speed-area")[0]), false, "the header toggle hides the speed area");
  editor.setSpeedArea(true);
  assert.ok(shown(byClass("ch-curve__speed-area")[0]));
});

test("the frame ruler draws one tick per frame and follows the stretch timing", () => {
  const { editor, byClass } = mount();
  const [ticks] = byClass("ch-curve__ruler-ticks"), [label] = byClass("ch-curve__ruler-label");
  assert.equal(ticks.children.length, 25, "24 frames → 25 ticks, both ends marked as keys");
  assert.equal(ticks.children.filter(tick => tick.className === "is-key").length, 2);
  assert.equal(label.textContent, "24 q · 0,80 s");
  editor.setCueTiming(12, 24);
  assert.equal(byClass("ch-curve__ruler-ticks")[0].children.length, 13);
  assert.equal(byClass("ch-curve__ruler-label")[0].textContent, "12 q · 0,50 s");
  assert.equal(byClass("ch-curve__ruler-play")[0].getAttribute("aria-label"), "Repetir a prévia");
});

test("a preview curve is drawn dashed over the plot and leaves with null", () => {
  const { editor, byClass, shown } = mount();
  const preview = () => byClass("ch-curve__preview")[0];
  assert.equal(shown(preview()), false);
  editor.setPreview({ x1: 0.4, y1: 0, x2: 0.2, y2: 1 });
  assert.ok(shown(preview()));
  assert.match(preview().getAttribute("d"), /^M/);
  editor.setPreview(null);
  assert.equal(shown(preview()), false);
});

test("without motion cues nothing extra is drawn and the cue methods are inert", () => {
  const { editor, byClass } = mount({ motionCues: false });
  assert.equal(byClass("ch-curve__ruler").length, 0);
  assert.equal(byClass("ch-curve__speed-area").length, 0);
  editor.setPreview({ x1: 0.4, y1: 0, x2: 0.2, y2: 1 }); editor.setCueTiming(10, 25); editor.setSpeedArea(false);
});
