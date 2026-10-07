import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import {
  MOTION_LIBRARY_DEFAULTS,
  MOTION_LIBRARY_PRESETS,
  isMotionLibraryOptions
} from "../dist/motion-library.js";
import { MOTION_LIBRARY_STUDIO_PRESETS } from "../dist/motion-library-studio.js";

const studio = MOTION_LIBRARY_STUDIO_PRESETS;

test("Studio appends an original, complete 32-preset collection", () => {
  assert.equal(studio.length, 32);
  assert.deepEqual(MOTION_LIBRARY_PRESETS.slice(61, 93), studio);
  assert.deepEqual(
    Object.fromEntries(["text-characters", "text-words", "text-lines", "text-effects", "motion-2d", "motion-3d"].map(
      (category) => [category, studio.filter((preset) => preset.category === category).length]
    )),
    { "text-characters": 8, "text-words": 6, "text-lines": 6, "text-effects": 4, "motion-2d": 6, "motion-3d": 2 }
  );
  for (const preset of studio) {
    assert.match(preset.id, /^studio-[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.equal(preset.referenceIndex, null);
    assert.equal(preset.collection, "studio");
    assert.equal(preset.text.decode, false);
    assert.equal(preset.text.random, false, "new recipes use the explicit order field");
    assert.equal(preset.text.mask, false, "no clipping dependency in this collection");
    assert.equal(preset.pivot, "anchor");
    assert.ok(["silk", "glide", "spring"].includes(preset.easing));
    assert.ok(["none", "blur"].includes(preset.effect));
    assert.ok(["forward", "reverse", "center-out", "edges-in", "random"].includes(preset.text.order));
    assert.ok(Number.isFinite(preset.text.blur) && preset.text.blur >= 0 && preset.text.blur <= 20);
  }
});

test("Studio controls are paced and validate through the command contract", () => {
  for (const preset of studio) {
    const defaults = preset.defaults;
    assert.deepEqual(Object.keys(defaults).sort(), [
      "durationFrames", "elasticity", "intensity", "overlap", "speed", "staggerFrames"
    ]);
    assert.ok(isMotionLibraryOptions({ ...MOTION_LIBRARY_DEFAULTS, ...defaults }), preset.id);
    assert.ok(defaults.durationFrames >= 32 && defaults.durationFrames <= 48);
    assert.equal(defaults.intensity, 100);
    assert.ok(defaults.overlap >= 0 && defaults.overlap <= 100);
    if (preset.easing === "spring") {
      assert.ok(defaults.elasticity >= 0 && defaults.elasticity <= 100);
    }
    if (preset.mode === "continuous") {
      assert.ok(defaults.speed >= 50 && defaults.speed <= 70);
      assert.equal(preset.fade, false, "running text must stay readable");
      assert.equal(preset.waveform, "cosine", "continuous recipes use smooth motion");
      assert.ok(preset.position.every((number) => Math.abs(number) <= 400));
      assert.ok(preset.rotation.every((number) => Math.abs(number) <= 400));
      assert.ok(preset.scale.every((number) => Math.abs(number) <= 400.2));
    } else {
      assert.equal(preset.mode, "transition");
      assert.equal(preset.fade, true);
      assert.equal(defaults.speed, 100);
      assert.ok(preset.position.every((number) => Math.abs(number) <= 3000));
      assert.ok(preset.rotation.every((number) => Math.abs(number) <= 4004));
      assert.ok(preset.scale.every((number) => number >= -200 && number <= 200));
    }
  }
});

test("Studio recipes differ in behavior, beyond their name or direction", () => {
  const signatures = studio.map((preset) => JSON.stringify({
    mode: preset.mode,
    easing: preset.easing,
    positionMagnitude: Math.hypot(...preset.position),
    rotationMagnitude: Math.hypot(...preset.rotation),
    scale: preset.scale,
    fade: preset.fade,
    waveform: preset.waveform,
    effect: preset.effect,
    effectAmount: preset.effectAmount,
    text: preset.text
  }));
  assert.equal(new Set(signatures).size, studio.length);
  const orders = new Set(studio.filter((preset) => preset.category.startsWith("text-")).map((preset) => preset.text.order));
  assert.deepEqual([...orders].sort(), ["center-out", "edges-in", "forward", "random", "reverse"]);
});

test("Studio numeric options are independently optional, finite and bounded", () => {
  assert.ok(isMotionLibraryOptions(MOTION_LIBRARY_DEFAULTS));
  for (const [key, valid, invalid] of [
    ["elasticity", [0, 24.5, 100], [-0.1, 100.1]],
    ["overlap", [0, 65.5, 100], [-0.1, 100.1]],
    ["speed", [25, 55.5, 200], [24.9, 200.1]]
  ]) {
    for (const number of valid) {
      assert.ok(isMotionLibraryOptions({ ...MOTION_LIBRARY_DEFAULTS, [key]: number }), `${key}=${number}`);
    }
    for (const number of [...invalid, NaN, Infinity, -Infinity, "50", null, undefined, false]) {
      assert.equal(isMotionLibraryOptions({ ...MOTION_LIBRARY_DEFAULTS, [key]: number }), false, `${key}=${number}`);
    }
    const getter = { ...MOTION_LIBRARY_DEFAULTS };
    Object.defineProperty(getter, key, { get() { throw new Error("must not evaluate input accessors"); } });
    assert.equal(isMotionLibraryOptions(getter), false);
    const inherited = Object.assign(Object.create({ [key]: 50 }), MOTION_LIBRARY_DEFAULTS);
    assert.equal(isMotionLibraryOptions(inherited), false);
  }
  assert.ok(isMotionLibraryOptions({ ...MOTION_LIBRARY_DEFAULTS, elasticity: 24, overlap: 65, speed: 55 }));
  const missingRequired = { ...MOTION_LIBRARY_DEFAULTS, elasticity: 24 };
  delete missingRequired.phase;
  assert.equal(isMotionLibraryOptions(missingRequired), false, "an optional field cannot replace a required one");
});

// Retain the original digest and normalize only the 15 approved false-to-true fade
// corrections. Every other legacy field, including non-transition fades, stays protected.
test("the 56 established recipes preserve all data except the explicit entrance fade correction", () => {
  const correctedIds = new Set([
    "arc-arrival", "spring-arc", "rise-and-unfold", "elastic-flourish",
    "spring-rise", "elastic-pop", "bounce-pop", "depth-turn",
    "reverse-depth-turn", "spring-depth-swing", "elastic-pivot", "bounce-flip",
    "front-fold", "word-curtain", "line-resolve"
  ]);
  const established = MOTION_LIBRARY_PRESETS.slice(0, 56);
  assert.equal(established.filter((preset) => correctedIds.has(preset.id)).length, correctedIds.size);
  const originalRecipes = established.map((preset) => {
    if (!correctedIds.has(preset.id)) return preset;
    assert.equal(preset.mode, "transition", preset.id);
    assert.equal(preset.fade, true, `${preset.id}: approved entrance fade correction`);
    return { ...preset, fade: false };
  });
  const digest = createHash("sha256").update(JSON.stringify(originalRecipes)).digest("hex");
  assert.equal(digest, "f74196cc66cf7fcf273c6f6aa101bc8ae7549cda9b572e4cbb1120eb37818936");
});
