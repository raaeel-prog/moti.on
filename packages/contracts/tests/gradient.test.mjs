import test from "node:test";
import assert from "node:assert/strict";
import { GRADIENT_DEFAULTS, GRADIENT_NATIVE, GRADIENT_SCALARS, GRADIENT_PARAMETER_KEYS, GRADIENT_PRESETS, cloneGradientSettings, gradientPresetSettings, validateGradientSettings, validateCommandRequest } from "../dist/index.js";
const request = (args, command = "ae.effect.gradient") => ({ protocolVersion: 1, requestId: "gradient-test", command, args, context: { host: "after-effects", hostVersion: "26.5" } });
test("Gradient ABI has stable scalar indexes and eight fixed stop slots", () => {
  assert.deepEqual(GRADIENT_SCALARS.map(({ index }) => index), Array.from({ length: 29 }, (_, i) => i + 1));
  assert.equal(GRADIENT_NATIVE.stopStartIndex, 30); assert.equal(GRADIENT_NATIVE.schemaIndex, 54);
  assert.equal(GRADIENT_PARAMETER_KEYS.length, 53); assert.equal(new Set(GRADIENT_PARAMETER_KEYS).size, 53);
  assert.equal(GRADIENT_DEFAULTS.stops.length, 8); assert.equal(GRADIENT_DEFAULTS.stops.filter((s) => s.enabled).length, 4);
});
test("Eight original recipes validate and clone without modifying source presets", () => {
  assert.equal(GRADIENT_PRESETS.length, 8);
  for (const preset of GRADIENT_PRESETS) {
    assert.equal(validateGradientSettings(preset.settings).valid, true);
    assert.equal(validateCommandRequest(request({ action: "apply", settings: preset.settings })).valid, true);
    const clone = gradientPresetSettings(preset.id); clone.stops[0].color[0] = 4;
    assert.notEqual(preset.settings.stops[0].color[0], 4);
  }
});
test("Optical Aurora is explicit while defaults and automatic animation remain opt-in", () => {
  const defaults = cloneGradientSettings(), aurora = gradientPresetSettings("aurora");
  assert.equal(defaults.diffusion, 0); assert.equal(defaults.grain, 0);
  assert.equal(defaults.animation, "static"); assert.equal(defaults.duration, 4);
  assert.ok(aurora.diffusion > 0); assert.ok(aurora.diffusionRadius > defaults.diffusionRadius);
  assert.deepEqual(aurora.stops, defaults.stops);
  for (const recipe of GRADIENT_PRESETS) assert.equal(recipe.settings.animation, "static");
  aurora.diffusion = 0;
  assert.ok(gradientPresetSettings("aurora").diffusion > 0);
  assert.equal(cloneGradientSettings().diffusion, 0);
});
test("Gradient boundary rejects unknown schema, non-finite channels and unstable stop slots", () => {
  const mutations = [s => { s.schemaVersion = 2; }, s => { s.stops.pop(); }, s => { s.stops.forEach(p => { p.enabled = false; }); }, s => { s.stops[0].color[0] = Infinity; }, s => { s.stops[0].color[0] = 65; }, s => { s.seed = 1.5; }, s => { s.unknown = 1; }, s => { s.focusSoftness = 0; }];
  for (const mutate of mutations) { const s = cloneGradientSettings(); mutate(s); assert.equal(validateGradientSettings(s).valid, false); assert.equal(validateCommandRequest(request({ action: "apply", settings: s })).valid, false); }
  const hdr = cloneGradientSettings(); hdr.stops[0].color = [-1, 4, 64]; assert.equal(validateGradientSettings(hdr).valid, true);
});
test("Updates require granular, unique changed keys; reads accept no mutating payload", () => {
  const settings = cloneGradientSettings();
  for (const changedKeys of [[], ["stops"], ["stops.8.color"], ["angle", "angle"]]) assert.equal(validateCommandRequest(request({action: "update", settings, changedKeys})).valid, false);
  assert.equal(validateCommandRequest(request({action: "update", settings, changedKeys: ["angle", "stops.0.color"]})).valid, true);
  assert.equal(validateCommandRequest(request({action: "remove", settings})).valid, false);
  assert.equal(validateCommandRequest(request({}, "ae.effect.gradient.read")).valid, true);
  assert.equal(validateCommandRequest(request({action: "apply"}, "ae.effect.gradient.read")).valid, false);
});
