import test from "node:test";
import assert from "node:assert/strict";
import { GRADIENT_DEFAULTS, GRADIENT_NATIVE, GRADIENT_SCALARS, GRADIENT_PARAMETER_KEYS, GRADIENT_PRESETS, cloneGradientSettings, gradientPresetSettings, isGradientSettings, validateGradientSettings, validateCommandRequest } from "../dist/index.js";
const request = (args, command = "ae.effect.gradient") => ({ protocolVersion: 1, requestId: "gradient-test", command, args, context: { host: "after-effects", hostVersion: "26.5" } });
test("Gradient ABI has stable scalar indexes and eight fixed stop slots", () => {
  assert.deepEqual(GRADIENT_SCALARS.map(({ index }) => index), Array.from({ length: 29 }, (_, i) => i + 1));
  assert.equal(GRADIENT_NATIVE.stopStartIndex, 30); assert.equal(GRADIENT_NATIVE.schemaIndex, 54);
  assert.equal(GRADIENT_PARAMETER_KEYS.length, 53); assert.equal(new Set(GRADIENT_PARAMETER_KEYS).size, 53);
  assert.equal(GRADIENT_DEFAULTS.stops.length, 8); assert.equal(GRADIENT_DEFAULTS.stops.filter((s) => s.enabled).length, 4);
});
test("Fourteen original recipes validate and clone without modifying source presets", () => {
  assert.equal(GRADIENT_PRESETS.length, 14);
  assert.deepEqual(GRADIENT_PRESETS.slice(8).map(p => p.id), ['silk','halo','satin','duotone','mist','prism']);
  for (const preset of GRADIENT_PRESETS) {
    assert.equal(validateGradientSettings(preset.settings).valid, true);
    assert.equal(validateCommandRequest(request({ action: "apply", settings: preset.settings })).valid, true);
    const clone = gradientPresetSettings(preset.id); clone.stops[0].color[0] = 4;
    assert.notEqual(preset.settings.stops[0].color[0], 4);
  }
});

test('new application factory starts Aurora in a six-second loop without changing the native defaults or saved recipes', async () => {
  const { createGradientSettings } = await import('../dist/gradient.js');
  const fresh = createGradientSettings();
  assert.equal(fresh.animation, 'loop'); assert.equal(fresh.duration, 6);
  assert.deepEqual({...fresh, animation:'static', duration:4}, gradientPresetSettings('aurora'));
  fresh.stops[0].color[0] = 10;
  assert.equal(createGradientSettings().stops[0].color[0], GRADIENT_DEFAULTS.stops[0].color[0]);
  for (const preset of GRADIENT_PRESETS) {
    assert.equal(createGradientSettings(preset.id).animation, 'loop');
    assert.equal(isGradientSettings(createGradientSettings(preset.id)), true);
  }
  assert.equal(cloneGradientSettings().animation, 'static'); assert.equal(cloneGradientSettings().duration, 4);
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

test('ninety-six original palettes cover twelve families in eight harmonies, inside sRGB', async () => {
  const { GRADIENT_PALETTES, GRADIENT_PALETTE_FAMILIES, GRADIENT_PALETTE_STYLES } = await import('../dist/gradient-palettes.js');
  assert.equal(GRADIENT_PALETTES.length, 96);
  assert.equal(new Set(GRADIENT_PALETTES.map(p => p.id)).size, 96);
  assert.equal(GRADIENT_PALETTE_FAMILIES.length * GRADIENT_PALETTE_STYLES.length, 96);
  const luminance = ([r, g, b]) => .2126 * r + .7152 * g + .0722 * b;
  for (const p of GRADIENT_PALETTES) {
    assert.ok(p.colors.length >= 2 && p.colors.length <= 8, p.id);
    for (const color of p.colors) assert.ok(color.length === 3 && color.every(c => Number.isFinite(c) && c >= 0 && c <= 1), p.id);
    const light = p.colors.map(luminance);
    if (p.style === 'deep' || p.style === 'mist' || p.style === 'dusk') for (let i = 1; i < light.length; i++) assert.ok(light[i] > light[i - 1], `${p.id} brightens`);
    if (p.style === 'pastel') assert.ok(Math.min(...light) > .55, `${p.id} stays light`);
    if (p.style === 'neon') assert.ok(light[0] < .08 && Math.max(...light) > .3, `${p.id} glows from the dark`);
  }
});

test('a palette replaces only the stops and keeps the gradient shape, light and texture', async () => {
  const { GRADIENT_PALETTES, gradientWithPalette } = await import('../dist/gradient-palettes.js');
  const shaped = { ...cloneGradientSettings(), mode: 'radial', angle: 33, glow: 1.2, turbulence: .4, grain: .3 };
  for (const palette of [GRADIENT_PALETTES[0], GRADIENT_PALETTES.find(p => p.style === 'duotone')]) {
    const next = gradientWithPalette(shaped, palette);
    assert.ok(isGradientSettings(next), palette.id);
    for (const key of Object.keys(shaped)) if (key !== 'stops') assert.deepEqual(next[key], shaped[key], key);
    const enabled = next.stops.filter(stop => stop.enabled);
    assert.equal(enabled.length, palette.colors.length);
    assert.deepEqual(enabled.map(stop => stop.color), palette.colors.map(color => [...color]));
    assert.deepEqual(enabled.map(stop => stop.position), palette.colors.map((_, i) => i / (palette.colors.length - 1)));
    assert.equal(next.stops.length, 8);
  }
  assert.deepEqual(shaped.stops, cloneGradientSettings().stops, 'the source settings are not mutated');
});
