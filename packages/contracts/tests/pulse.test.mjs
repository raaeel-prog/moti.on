import test from "node:test";
import assert from "node:assert/strict";
import { PULSE_PRESETS, pulsePresetArgs, validateCommandRequest } from "../dist/index.js";
import { COMMAND_DESCRIPTORS, resolveUndoLabel } from "../../command-registry/dist/index.js";

function accepts(args, command = "ae.text.vertical-pulse") {
  return validateCommandRequest({ protocolVersion: 1, requestId: "pulse-v4-test", command, args,
    context: { host: "after-effects", hostVersion: "26.5" } }).valid;
}

test("Pulse recipes produce complete morph payloads at the composition frame rate", () => {
  const expected = { impact: [1.8, 360], electric: [1.5, 340], plasma: [2.2, 380], liquid: [2.6, 320], rupture: [1.7, 420] };
  assert.deepEqual(Object.keys(PULSE_PRESETS), Object.keys(expected));
  for (const [preset, [seconds, peak]] of Object.entries(expected)) {
    assert.equal(PULSE_PRESETS[preset].durationSeconds, seconds);
    for (const fps of [23.976, 24, 25, 29.97, 30, 60]) {
      const args = pulsePresetArgs(preset, fps);
      assert.equal(accepts(args), true, `${preset} at ${fps}`);
      assert.equal(args.durationFrames, Math.round(seconds * fps));
      assert.equal(args.peakScalePercent, peak);
      assert.equal(args.renderer, "morph");
      assert.equal(args.preset, preset);
    }
  }
});

test("Pulse conversion defaults to 30 fps, clamps frame limits and returns isolated color arrays", () => {
  for (const fps of [null, NaN, Infinity, -1, 0])
    assert.equal(pulsePresetArgs("impact", fps).durationFrames, 54);
  assert.equal(pulsePresetArgs("impact", 1).durationFrames, 12);
  assert.equal(pulsePresetArgs("liquid", 1000).durationFrames, 240);
  const original = [...PULSE_PRESETS.impact.controls.accentColor];
  const args = pulsePresetArgs("impact", 30);
  args.accentColor[0] = 0;
  assert.deepEqual(PULSE_PRESETS.impact.controls.accentColor, original);
  assert.deepEqual(pulsePresetArgs("impact", 30).accentColor, original);
});

test("Pulse timing leaves room for all propagation and local contour delay before the loop resets", () => {
  for (const [preset, recipe] of Object.entries(PULSE_PRESETS)) {
    const t = recipe.timing;
    assert.ok(t.attackStart > 0 && t.attackStart < t.attackEnd, preset);
    assert.ok(t.attackEnd < t.holdEnd && t.holdEnd < t.releaseEnd, preset);
    assert.ok(t.releaseEnd <= t.reboundEnd && t.reboundEnd <= .70, preset);
    assert.ok(recipe.matterDelay >= 0 && recipe.matterDelay <= .10, preset);
    assert.ok(t.reboundEnd + .18 + recipe.matterDelay < 1, preset);
    assert.ok(recipe.matterStretch >= 1 && recipe.matterStretch <= 1.25, preset);
    assert.ok(t.reboundDepth >= 0 && t.reboundDepth <= .06, preset);
    assert.ok(Number.isInteger(recipe.sparks) && recipe.sparks >= 0 && recipe.sparks <= 4, preset);
    if (t.reboundDepth > 0) assert.ok(t.reboundEnd > t.releaseEnd, preset);
  }
  assert.notDeepEqual(PULSE_PRESETS.electric.timing, PULSE_PRESETS.liquid.timing);
  assert.equal(PULSE_PRESETS.electric.sparks, 4);
  assert.equal(PULSE_PRESETS.liquid.sparks, 0);
});

test("Pulse preserves original payloads and keeps lifecycle commands deliberately thin", () => {
  const legacy = { action: "apply", durationFrames: 74, peakScalePercent: 360, distortion: 80,
    glow: 80, seed: 1, accentColor: [1, .68, .08] };
  assert.equal(accepts(legacy), true);
  assert.equal(accepts({ ...legacy, renderer: "legacy" }), true);
  assert.equal(accepts({ ...legacy, animationMode: "center-out", waveSpread: 55 }), true);
  for (const action of ["update", "bake", "remove"]) {
    assert.equal(accepts({ action }), true, action);
    for (const renderer of ["legacy", "morph"])
      assert.equal(accepts({ action, renderer }), true, `${action}/${renderer}`);
    assert.equal(accepts({ action, glow: 75 }), false, `${action} must preserve existing controls`);
    assert.equal(accepts({ ...pulsePresetArgs("impact", 30), action }), false, `${action} rejects replacement values`);
  }
});

test("Pulse rejects incomplete morph recipes, invalid values and executable payload additions", () => {
  const args = pulsePresetArgs("impact", 30);
  for (const key of ["action", "durationFrames", "peakScalePercent", "distortion", "glow", "seed", "accentColor",
    "preset", "fluidity", "animationMode", "waveSpread"]) {
    const missing = { ...args }; delete missing[key];
    assert.equal(accepts(missing), false, `missing ${key}`);
  }
  for (const invalid of [{ renderer: "auto" }, { preset: "neon" }, { action: "delete" }, { fluidity: 101 }, { fluidity: -1 },
    { fluidity: NaN }, { durationFrames: 11 }, { durationFrames: 241 }, { durationFrames: 54.5 }, { peakScalePercent: 119 },
    { peakScalePercent: 451 }, { distortion: Infinity }, { glow: "80" }, { seed: .5 }, { seed: 1000001 },
    { accentColor: [1, 1] }, { accentColor: [1, 1, 1, 1] }, { accentColor: [1, -1, 1] }, { animationMode: "random" },
    { waveSpread: 101 }, { expression: "eval(x)" }, { script: "mutate()" }])
    assert.equal(accepts({ ...args, ...invalid }), false, JSON.stringify(invalid));
});

test("Pulse read accepts no payload and never opens an Undo group", () => {
  assert.equal(accepts({}, "ae.text.vertical-pulse.read"), true);
  assert.equal(accepts({ action: "apply" }, "ae.text.vertical-pulse.read"), false);
  const descriptor = COMMAND_DESCRIPTORS.find(item => item.id === "ae.text.vertical-pulse.read");
  assert.equal(descriptor.mutates, false);
  assert.equal(descriptor.undoLabelKey, "undo.none");
  assert.equal(descriptor.supportsDryRun, false);
  assert.equal(resolveUndoLabel("undo.ae.text.vertical-pulse", "pt-BR"), "Moti.on: Pulso");
  assert.equal(resolveUndoLabel("undo.ae.text.vertical-pulse", "en-US"), "Moti.on: Pulse");
});
