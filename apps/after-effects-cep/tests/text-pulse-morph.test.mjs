import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { PULSE_PRESETS, pulsePresetArgs } from "../../../packages/contracts/dist/index.js";

const moduleSource = await readFile(new URL("../host/src/commands/text-pulse-morph.jsx", import.meta.url), "utf8");
const registrySource = await readFile(new URL("../host/src/registry.jsx", import.meta.url), "utf8");
const ERROR = Object.fromEntries(["INVALID_PRESET", "NO_ACTIVE_COMP", "NO_SELECTION", "INVALID_SELECTION_TYPE", "TRACK_CONFLICT", "KEYFRAME_CONFLICT", "HOST_OPERATION_FAILED", "CAPABILITY_UNAVAILABLE", "ROLLBACK_FAILED"].map(x => [x, x]));
class CompItem {
  constructor(source) { this.selectedLayers = [source]; this.time = 0; this.frameDuration = 1 / 30; this.layers = { addNull() {}, addShape() {} }; this.numLayers = 1; this.source = source; }
  layer() { return this.source; }
}
function fixture() {
  const doc = { text: "B8OQ ação i.j", font: "ArialMT", fontSize: 90, applyFill: true, applyStroke: false, fillColor: [1, 1, 1], boxText: false, baselineLocs: [0, 0, 300, 0] };
  for (const key of ["tracking", "horizontalScale", "verticalScale", "baselineShift", "fauxBold", "fauxItalic"]) doc[key] = 0;
  doc.characterRange = () => doc;
  const prop = { value: doc, numKeys: 0, expression: "" };
  const empty = { numProperties: 0, canAddProperty: () => true };
  const source = { id: 1, comment: "User note", enabled: true, locked: false, inPoint: 0, outPoint: 24, parent: null, property: name => name === "ADBE Text Properties" ? { property: n => n === "ADBE Text Document" ? prop : empty } : empty };
  const comp = new CompItem(source);
  const scope = { MotionContracts: { ERROR, PULSE_PRESETS }, MotionJson: JSON, MotionVerticalPulseLegacy: { readMeta: () => null }, MotionTextGlyphOutlines: {}, MotionMorphGeometry: {}, app: { project: { activeItem: comp } }, CompItem, isFinite };
  scope.$ = { global: scope }; vm.createContext(scope); vm.runInContext(registrySource, scope); scope.MotionRegistry.register("ae.text.vertical-pulse", { preflight: () => null, run: () => ({}) }); vm.runInContext(moduleSource, scope);
  return { scope, source, comp, doc, prop, host: scope.MotionPulseMorph };
}
function rgbToHsl([r, g, b, a]) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min, l = (max + min) / 2;
  if (!d) return [0, 0, l, a];
  const h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, d / (1 - Math.abs(2 * l - 1)), l, a];
}
function hslToRgb([h, s, l, a]) {
  const chroma = (1 - Math.abs(2 * l - 1)) * s, x = chroma * (1 - Math.abs((h * 6) % 2 - 1)), m = l - chroma / 2;
  const rgb = h < 1 / 6 ? [chroma, x, 0] : h < 2 / 6 ? [x, chroma, 0] : h < 3 / 6 ? [0, chroma, x] : h < 4 / 6 ? [0, x, chroma] : h < 5 / 6 ? [x, 0, chroma] : [chroma, 0, x];
  return [...rgb.map(v => v + m), a];
}
const controlNames = { durationFrames: "Cycle (frames)", peakScalePercent: "Vertical scale (%)", distortion: "Tears (%)", glow: "Glow (%)", seed: "Variation", accentColor: "Glow color", animationMode: "Direction", waveSpread: "Wave spread (%)", fluidity: "Fluidity (%)" };
function evaluate(f, preset, fraction, suffix, ref, overrides = {}) {
  const args = { ...pulsePresetArgs(preset, 30), ...overrides };
  const values = Object.fromEntries(Object.entries(controlNames).map(([k, label]) => [`Moti.on Pulse · ${label}`, k === "animationMode" ? ["uniform", "center-out", "left-to-right", "right-to-left"].indexOf(args[k]) + 1 : args[k]]));
  values["Moti.on Pulse · Preset"] = Object.keys(PULSE_PRESETS).indexOf(preset) + 1;
  const controller = { effect: name => () => values[name] };
  const context = { rgbToHsl, hslToRgb, effect: () => () => controller, thisComp: { frameDuration: 1 / 30 }, time: fraction * args.durationFrames / 30, thisLayer: { content: () => ({ content: () => ({ content: () => ({ path: ref }) }) }) }, createPath: (vertices, inTangents, outTangents, closed) => ({ vertices, inTangents, outTangents, closed }) };
  return vm.runInNewContext(suffix, context);
}
const glyph = { textIndex: 1, center: [25, 0], bounds: { height: 100 } };
const reference = { points: () => [[0, -50], [50, -50], [50, 50], [0, 50]], inTangents: () => [[0, 0], [0, 0], [0, 0], [0, 0]], outTangents: () => [[0, 0], [0, 0], [0, 0], [0, 0]] };

test("Pulse V4 rejects unsupported origins before extracting or adding layers", () => {
  for (const alter of [f => { f.source.locked = true; }, f => { f.doc.boxText = true; }, f => { f.doc.applyStroke = true; }, f => { f.prop.numKeys = 1; }, f => { f.doc.text = "a".repeat(129); }, f => { f.source.threeDLayer = true; }, f => { f.source.enabled = false; }]) {
    const f = fixture(); alter(f);
    assert.equal(f.host.prepare(pulsePresetArgs("impact", 30)).error.code, "INVALID_SELECTION_TYPE");
    assert.equal(f.comp.numLayers, 1); assert.equal(f.source.comment, "User note");
  }
  const f = fixture(); f.comp.selectedLayers = [];
  assert.equal(f.host.prepare(pulsePresetArgs("impact", 30)).error.code, "NO_SELECTION");
});

test("Pulse V4 source fingerprint does not read inactive fill/stroke getters", () => {
  const f = fixture(); Object.defineProperty(f.doc, "strokeColor", { get() { throw Error("undefined native stroke"); } });
  Object.defineProperty(f.doc, "strokeWidth", { get() { throw Error("undefined native stroke"); } });
  const before = f.host.fingerprint(f.source); f.doc.text += "!";
  assert.notEqual(f.host.fingerprint(f.source), before);
});

test("Pulse morph returns exact contour vertices and tangents at every loop boundary", () => {
  const f = fixture(), expression = f.host.pathExpression({ start: 0, characterCount: 1 }, glyph, 0);
  for (const preset of Object.keys(PULSE_PRESETS)) for (const fraction of [0, 1, 2]) {
    const result = evaluate(f, preset, fraction, expression, reference);
    assert.deepEqual(JSON.parse(JSON.stringify(result.vertices)), reference.points(), preset);
    assert.deepEqual(JSON.parse(JSON.stringify(result.inTangents)), reference.inTangents(), preset);
    assert.deepEqual(JSON.parse(JSON.stringify(result.outTangents)), reference.outTangents(), preset);
    assert.equal(result.closed, true);
  }
});

test("Pulse five profiles remain distinct without color and preserve vertical contour orientation", () => {
  const f = fixture(), expression = f.host.pathExpression({ start: 0, characterCount: 1 }, glyph, 0), signatures = [];
  for (const preset of Object.keys(PULSE_PRESETS)) {
    const signature = [];
    for (const fraction of [.07, .16, .3, .43, .56, .66, .82]) {
      const result = evaluate(f, preset, fraction, expression, reference);
      assert.ok(result.vertices.every(v => v.every(Number.isFinite)));
      assert.ok(result.vertices[0][1] < result.vertices[3][1], `${preset}/${fraction}`);
      signature.push(...result.vertices.flat().map(v => Number(v.toFixed(3))));
    }
    signatures.push(JSON.stringify(signature));
  }
  assert.equal(new Set(signatures).size, 5);
});

test("Pulse seeded material is deterministic and varies continuously within phases", () => {
  const f = fixture(), expression = f.host.pathExpression({ start: 0, characterCount: 1 }, glyph, 0);
  const a = evaluate(f, "liquid", .12, expression, reference, { seed: 42 });
  const same = evaluate(f, "liquid", .12, expression, reference, { seed: 42 });
  const other = evaluate(f, "liquid", .12, expression, reference, { seed: 43 });
  assert.equal(JSON.stringify(a), JSON.stringify(same)); assert.notDeepEqual(a.vertices, other.vertices);
  const next = evaluate(f, "liquid", .120001, expression, reference, { seed: 42 });
  assert.ok(a.vertices.every((v, i) => v.every((n, ax) => Math.abs(n - next.vertices[i][ax]) < .01)));
});

test("Pulse budget accounts for quarter frames and actual contour vertices before mutation", () => {
  const f = fixture(); f.comp.workAreaStart = 0; f.comp.workAreaDuration = 2;
  const path = { numProperties: 0, canSetExpression: true, expression: "// Moti.on pulse morph v4\ncreatePath()", matchName: "ADBE Vector Shape", valueAtTime: () => ({ vertices: Array.from({ length: 100 }, () => [0, 0]) }) };
  const member = { numProperties: 1, property: () => path };
  const budget = f.host.budget({ comp: f.comp, source: f.source, members: [member] });
  assert.equal(budget.count, 241); assert.equal(budget.propertySamples, 241); assert.equal(budget.vertexSamples, 24100);
  f.comp.workAreaDuration = 24;
  assert.ok(f.host.budget({ comp: f.comp, source: f.source, members: [member] }).frames > 600);
});


test("Pulse material extends outside the crisp core at every preset peak, including zero fluidity", () => {
  const f = fixture(), expression = f.host.pathExpression({ start: 0, characterCount: 1 }, glyph, 0);
  for (const preset of Object.keys(PULSE_PRESETS)) for (const fluidity of [0, PULSE_PRESETS[preset].controls.fluidity, 100]) {
    const t = PULSE_PRESETS[preset].timing, fraction = (t.attackEnd + t.holdEnd) / 2;
    const output = evaluate(f, preset, fraction, expression, reference, { fluidity });
    const ys = output.vertices.map(v => v[1]), xs = output.vertices.map(v => v[0]);
    assert.ok(Math.max(...ys) - Math.min(...ys) > PULSE_PRESETS[preset].controls.peakScalePercent * 1.05, `${preset}: material must be visibly taller`);
    assert.ok(Math.max(...xs) - Math.min(...xs) > 50 * 1.05, `${preset}: material must be visibly wider`);
  }
});

test("Pulse material continues modulating while the core holds its stretched silhouette", () => {
  const f = fixture(), m = { start: 0, characterCount: 1 }, expression = f.host.pathExpression(m, glyph, 0);
  for (const preset of Object.keys(PULSE_PRESETS)) {
    const t = PULSE_PRESETS[preset].timing, a = t.attackEnd + (t.holdEnd - t.attackEnd) * .6, b = t.attackEnd + (t.holdEnd - t.attackEnd) * .8;
    assert.equal(evaluate(f, preset, a, f.host.kernel(m, 0) + 'p;', reference), 1);
    assert.equal(evaluate(f, preset, b, f.host.kernel(m, 0) + 'p;', reference), 1);
    const first = evaluate(f, preset, a, expression, reference), next = evaluate(f, preset, b, expression, reference);
    assert.ok(first.vertices.some((v, i) => Math.abs(v[0] - next.vertices[i][0]) > .05), preset);
  }
});

test("Pulse Bezier tangents follow the material field derivative and preserve orientation", () => {
  const f = fixture(), expression = f.host.pathExpression({ start: 0, characterCount: 1 }, glyph, 0), point = [40, 20], direction = [12, 8], epsilon = 1e-5;
  const ref = vertex => ({ points: () => [vertex], inTangents: () => [direction], outTangents: () => [direction] });
  for (const preset of Object.keys(PULSE_PRESETS)) for (const fraction of [.12, .3, .55, .7]) {
    const base = evaluate(f, preset, fraction, expression, ref(point), { fluidity: 100, distortion: 100 });
    const offset = evaluate(f, preset, fraction, expression, ref(point.map((v, ax) => v + direction[ax] * epsilon)), { fluidity: 100, distortion: 100 });
    for (let ax = 0; ax < 2; ax++) assert.ok(Math.abs((offset.vertices[0][ax] - base.vertices[0][ax]) / epsilon - base.outTangents[0][ax]) < .001, `${preset}/${fraction}/${ax}`);
    assert.ok(base.outTangents[0][1] > 0, 'vertical derivative stays positive');
  }
});

test("Pulse gradient positions and colors move continuously and close every cycle", () => {
  const f = fixture(), m = { start: 0, characterCount: 8, bounds: { left: -130, top: -45, width: 500, height: 100 } };
  const expressions = [-1, 1].map(end => f.host.gradientPointExpression(m, end)).concat([false, true].map(end => f.host.gradientColorExpression(m, end)));
  for (const preset of Object.keys(PULSE_PRESETS)) for (const expression of expressions) {
    const start = evaluate(f, preset, 0, expression, reference), end = evaluate(f, preset, 1, expression, reference), middle = evaluate(f, preset, .25, expression, reference);
    assert.deepEqual(start, end);assert.ok(start.some((value, i) => Math.abs(value - middle[i]) > .001));
    for (const fraction of [.13, .32, .58, .999999]) {
      const a = evaluate(f, preset, fraction, expression, reference), b = evaluate(f, preset, fraction + .000001, expression, reference);
      assert.ok(a.every(Number.isFinite));assert.ok(a.every((value, i) => Math.abs(value - b[i]) < .02));
    }
  }
});

test("Pulse late wave glyph remains visible for its entire delayed material tail", () => {
  const f = fixture(), m = { start: 0, characterCount: 9 };
  for (const animationMode of ['left-to-right', 'right-to-left', 'center-out']) {
    const index = animationMode === 'right-to-left' ? 0 : 8, expression = f.host.materialKernel(m, index) + '100*clamp(1.2*activity+.35*burst,0,1);';
    const late = evaluate(f, 'liquid', .84, expression, reference, { animationMode, waveSpread: 100, fluidity: 100 });
    assert.ok(late > 10, animationMode);
    assert.equal(evaluate(f, 'liquid', 1, expression, reference, { animationMode, waveSpread: 100, fluidity: 100 }), 0);
  }
});
