import test from "node:test";
import assert from "node:assert/strict";
import { WORD_REVEAL_DEFAULTS, VARIABLE_MORPH_DEFAULTS, PROXIMITY_MORPH_DEFAULTS, PROXIMITY_MORPH_PRESETS, STYLE_SWAP_DEFAULTS, validateCommandRequest } from "../dist/index.js";
const cases = [
  ["ae.text.word-reveal", WORD_REVEAL_DEFAULTS],
  ["ae.text.variable-morph", VARIABLE_MORPH_DEFAULTS],
  ["ae.text.style-swap", STYLE_SWAP_DEFAULTS]
];
function accepts(command, args) {
  return validateCommandRequest({ protocolVersion: 1, requestId: "text-rig-test", command, args,
    context: { host: "after-effects", hostVersion: "26.5" } }).valid;
}
test("text rig contracts accept default apply/adjust and removal payloads", () => {
  for (const [cmd, args] of cases) for (const action of ["apply", "remove"])
    assert.equal(accepts(cmd, { ...args, action }), true, cmd);
});
test("text rigs reject missing controls, unbounded values and untrusted extra input", () => {
  const optionalWordControls = new Set(["renderer", "direction", "smoothness", "formationPercent", "holdPercent", "travelPercent", "order", "automatic", "progress", "useSourceColor", "textColor"]);
  for (const [cmd, args] of cases) {
    for (const key of Object.keys(args)) {
      const missing = { ...args }; delete missing[key];
      assert.equal(accepts(cmd, missing), cmd === "ae.text.word-reveal" && optionalWordControls.has(key), `${cmd}: missing ${key}`);
      if (typeof args[key] === "number") for (const value of [NaN, Infinity, cmd === "ae.text.variable-morph" && key === "weight" ? -101 : -1, 10001, "20"])
        assert.equal(accepts(cmd, { ...args, [key]: value }), false, `${cmd}: ${key} ${value}`);
    }
    for (const key of ["script", "path", "expression", "targetLayerIndex"])
      assert.equal(accepts(cmd, { ...args, [key]: "untrusted" }), false, `${cmd}: ${key}`);
    assert.equal(accepts(cmd, { ...args, action: "delete" }), false);
  }
});
test("word morph extends the legacy payload while style swap keeps its own actions", () => {
  const legacy = { action: "apply", durationFrames: 24, staggerFrames: 5, paddingX: 0, paddingY: 15,
    roundness: 0, revealPoint: 50, boxGap: 3, fillColor: [1, .12, .08] };
  assert.equal(accepts("ae.text.word-reveal", legacy), true);
  for (const renderer of ["legacy", "morph"]) for (const action of ["apply", "update", "bake", "remove"])
    assert.equal(accepts("ae.text.word-reveal", { ...WORD_REVEAL_DEFAULTS, renderer, action }), true);
  for (const cmd of ["ae.text.style-swap"]) for (const action of ["update", "bake"])
    assert.equal(accepts(cmd, { ...cases.find(([command]) => command === cmd)[1], action }), false);
  assert.equal(WORD_REVEAL_DEFAULTS.renderer, "morph");
  assert.equal(WORD_REVEAL_DEFAULTS.direction, "bottom");
  assert.equal(WORD_REVEAL_DEFAULTS.durationFrames, 36);
});
test("word morph enums, phase limits, progress and colors are strict", () => {
  const cmd = "ae.text.word-reveal";
  for (const direction of ["bottom", "top", "left", "right"])
    assert.equal(accepts(cmd, { ...WORD_REVEAL_DEFAULTS, direction }), true);
  for (const order of ["normal", "reverse"])
    assert.equal(accepts(cmd, { ...WORD_REVEAL_DEFAULTS, order }), true);
  for (const invalid of [{renderer:"fake"}, {direction:"up"}, {order:"random"}, {automatic:1}, {useSourceColor:"yes"},
    {smoothness:101}, {formationPercent:61}, {holdPercent:31}, {travelPercent:101}, {progress:101}, {textColor:[1,1]}, {textColor:[1,1,2]}])
    assert.equal(accepts(cmd, { ...WORD_REVEAL_DEFAULTS, ...invalid }), false, JSON.stringify(invalid));
  assert.equal(accepts(cmd, { ...WORD_REVEAL_DEFAULTS, formationPercent:60, holdPercent:30 }), true);
  assert.equal(accepts("ae.text.word-reveal.read", {}), true);
  assert.equal(accepts("ae.text.word-reveal.read", { action:"apply" }), false);
});
test("word reveal protects color dimensions and frame accuracy", () => {
  for (const color of [[], [1, 0], [1, 0, 0, 1], [1.1, 0, 0], [1, -0.1, 0], "red"])
    assert.equal(accepts(cases[0][0], { ...WORD_REVEAL_DEFAULTS, fillColor: color }), false);
  for (const field of ["durationFrames", "staggerFrames"])
    assert.equal(accepts(cases[0][0], { ...WORD_REVEAL_DEFAULTS, [field]: 5.5 }), false);
});
test("proximity axes permit fractional influence but bounded radius", () => {
  assert.equal(accepts(cases[1][0], { ...VARIABLE_MORPH_DEFAULTS, weight: 35.5, italic: 25.25 }), true);
  assert.equal(accepts(cases[1][0], { ...VARIABLE_MORPH_DEFAULTS, radius: 0 }), false);
  assert.equal(accepts(cases[1][0], { ...VARIABLE_MORPH_DEFAULTS, strength: 101 }), false);
});
test("proximity v2 adds two engines and all lifecycle operations without changing legacy defaults", () => {
  assert.deepEqual(VARIABLE_MORPH_DEFAULTS, { action: "apply", radius: 250, strength: 100, weight: 100, contrast: 0, italic: 0 });
  assert.equal(PROXIMITY_MORPH_DEFAULTS.renderer, "auto");
  assert.equal(PROXIMITY_MORPH_DEFAULTS.weight, 35);
  assert.equal(PROXIMITY_MORPH_DEFAULTS.smoothness, 75);
  for (const renderer of ["auto", "outline", "variable"]) for (const action of ["apply", "update", "bake", "remove", "sweep"])
    assert.equal(accepts("ae.text.variable-morph", { ...PROXIMITY_MORPH_DEFAULTS, renderer, action }), true);
  for (const key of ["renderer", "preset", "smoothness", "scaleX", "scaleY", "skew", "lift", "sweepFrames", "sweepDirection"]) {
    const args = { ...PROXIMITY_MORPH_DEFAULTS }; delete args[key];
    assert.equal(accepts("ae.text.variable-morph", args), true, `optional ${key}`);
  }
  assert.equal(accepts("ae.text.variable-morph.read", {}), true);
  assert.equal(accepts("ae.text.variable-morph.read", { action: "apply" }), false);
});
test("proximity presets produce bounded neutral controls and preserve signed thinning", () => {
  assert.equal(Object.keys(PROXIMITY_MORPH_PRESETS).length, 8);
  for (const [preset, controls] of Object.entries(PROXIMITY_MORPH_PRESETS))
    assert.equal(accepts("ae.text.variable-morph", { ...PROXIMITY_MORPH_DEFAULTS, ...controls, preset }), true, preset);
  assert.equal(PROXIMITY_MORPH_PRESETS.thin.weight, -35);
  assert.equal(PROXIMITY_MORPH_PRESETS.wave.lift, -15);
  assert.equal(PROXIMITY_MORPH_PRESETS.slant.italic, 0, "geometric slant is independent of font axes");
  for (const invalid of [{ renderer: "fake" }, { preset: "bold-font" }, { weight: -100.1 }, { smoothness: -1 }, { smoothness: 101 },
    { scaleX: 24 }, { scaleY: 301 }, { skew: 61 }, { lift: -201 }, { sweepFrames: 0 }, { sweepFrames: 3601 }, { sweepFrames: 12.5 },
    { sweepDirection: "diagonal" }])
    assert.equal(accepts("ae.text.variable-morph", { ...PROXIMITY_MORPH_DEFAULTS, ...invalid }), false, JSON.stringify(invalid));
  for (const sweepDirection of ["left-to-right", "right-to-left", "top-to-bottom", "bottom-to-top"])
    assert.equal(accepts("ae.text.variable-morph", { ...PROXIMITY_MORPH_DEFAULTS, sweepDirection }), true);
});
test("style swap only accepts the implemented sequencing units", () => {
  for (const unit of ["characters", "words"])
    assert.equal(accepts(cases[2][0], { ...STYLE_SWAP_DEFAULTS, unit }), true);
  for (const unit of ["lines", "all", "characters;eval(x)"])
    assert.equal(accepts(cases[2][0], { ...STYLE_SWAP_DEFAULTS, unit }), false);
});
