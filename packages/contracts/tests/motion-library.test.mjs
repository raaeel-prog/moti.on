import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import {
  MOTION_LIBRARY_DEFAULTS,
  MOTION_LIBRARY_PRESETS,
  isMotionLibraryOptions
} from "../dist/motion-library.js";

const reviewedPresets = MOTION_LIBRARY_PRESETS.filter((preset) => preset.referenceIndex !== null);

test("every entrance transition declares a fade from zero opacity", () => {
  const transitions = MOTION_LIBRARY_PRESETS.filter((preset) => preset.mode === "transition" && !preset.effect.startsWith("camera-") && preset.collection !== "premium");
  assert.equal(transitions.length, 86);
  for (const preset of transitions) {
    assert.equal(preset.fade, true, `${preset.id}: entrance must start invisible`);
  }
});

test("entrance fade correction preserves every continuous and static recipe", () => {
  const nonTransitions = MOTION_LIBRARY_PRESETS.filter((preset) => preset.mode !== "transition" && preset.collection !== "gemini" && preset.collection !== "native" && preset.collection !== "premium");
  assert.equal(nonTransitions.length, 29);
  const digest = createHash("sha256").update(JSON.stringify(nonTransitions)).digest("hex");
  assert.equal(digest, "f13a7ba199e261272ef9e6021fba59579047092f01a62548c50141cd80d430de");
});

test("motion library covers every reviewed reference exactly once", async () => {
  const reference = JSON.parse(await readFile(new URL(
    "../../../docs/implementation/2026-09-14-animation-composer/catalogo-referencia.json",
    import.meta.url
  ), "utf8"));
  assert.equal(reviewedPresets.length, reference.count);
  assert.equal(MOTION_LIBRARY_PRESETS.length, 197);
  assert.equal(reference.count, 56);
  assert.deepEqual(
    reviewedPresets.map((preset) => preset.referenceIndex).sort((a, b) => a - b),
    reference.items.map((_, index) => index)
  );
  assert.equal(new Set(MOTION_LIBRARY_PRESETS.map((preset) => preset.id)).size, 197);
  for (const locale of ["pt-BR", "en-US"]) {
    const names = MOTION_LIBRARY_PRESETS.map((preset) => preset.name[locale]);
    assert.equal(new Set(names).size, 197, `duplicate localized names: ${locale}`);
    for (const name of names) {
      assert.ok(name.trim().length > 0);
      assert.ok(!reference.items.some((item) => item.referenceLabel === name));
    }
  }
});

test("library preserves motion and text grouping from the review", () => {
  const expected = [
    ["motion-2d", 9], ["motion-3d", 7], ["motion-effects", 20],
    ["text-characters", 5], ["text-words", 7], ["text-lines", 3], ["text-effects", 5]
  ];
  assert.deepEqual(
    reviewedPresets.map((preset) => preset.category),
    expected.flatMap(([category, count]) => Array(count).fill(category))
  );
  for (const preset of MOTION_LIBRARY_PRESETS) {
    assert.match(preset.id, /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/);
    for (const vector of [preset.position, preset.rotation, preset.scale]) {
      assert.equal(vector.length, 3);
      assert.ok(vector.every(Number.isFinite), `${preset.id}: non-finite transform`);
    }
    if (preset.category === "motion-3d") {
      assert.ok(preset.rotation[0] || preset.rotation[1] || preset.position[2]);
    }
    if (preset.mode === "transition") {
      assert.ok(preset.scale.every((value) => value >= -200), `${preset.id}: inverted start scale`);
    }
    if (preset.effect === "none") assert.equal(preset.effectAmount, 0);
    assert.ok(Number.isFinite(preset.effectAmount) && preset.effectAmount >= 0);
    assert.ok(Number.isFinite(preset.effectAngle));
    if (preset.mode === "continuous") assert.notEqual(preset.waveform, "none");
    if (!preset.category.startsWith("text-")) {
      assert.equal(preset.text.unit, "all");
      assert.equal(preset.text.decode, false);
    }
  }
  const signatures = MOTION_LIBRARY_PRESETS.map(({ id: _id, name: _name, referenceIndex: _referenceIndex, ...recipe }) => JSON.stringify(recipe));
  assert.equal(new Set(signatures).size, 197, "an original variant has the same recipe as another preset");
});

test("options accept defaults and every supported enum", () => {
  assert.deepEqual(MOTION_LIBRARY_DEFAULTS, {
    phase: "in", direction: "preset", durationFrames: 24,
    intensity: 100, staggerFrames: 2, unit: "preset"
  });
  assert.ok(isMotionLibraryOptions(MOTION_LIBRARY_DEFAULTS));
  for (const phase of ["in", "out", "both"]) {
    for (const direction of ["preset", "bottom", "left", "right", "top"]) {
      for (const unit of ["preset", "characters", "words", "lines", "all"]) {
        assert.ok(isMotionLibraryOptions({ ...MOTION_LIBRARY_DEFAULTS, phase, direction, unit }));
      }
    }
  }
  assert.ok(isMotionLibraryOptions(Object.assign(Object.create(null), MOTION_LIBRARY_DEFAULTS)));
});

test("options enforce finite numeric limits without coercion", () => {
  for (const [key, valid, invalid] of [
    ["durationFrames", [1, 600], [0, -1, 601, 1.5]],
    ["intensity", [0, 0.5, 300], [-0.1, 300.1]],
    ["staggerFrames", [0, 60], [-1, 61, 0.5]]
  ]) {
    for (const value of valid) {
      assert.ok(isMotionLibraryOptions({ ...MOTION_LIBRARY_DEFAULTS, [key]: value }), `${key}=${value}`);
    }
    for (const value of [...invalid, NaN, Infinity, -Infinity, "24", null, undefined, true]) {
      assert.equal(isMotionLibraryOptions({ ...MOTION_LIBRARY_DEFAULTS, [key]: value }), false, `${key}=${value}`);
    }
  }
});

test("options reject unknown, missing, inherited and accessor keys", () => {
  for (const value of [null, undefined, [], "", 0, true, new Date(), {}, { ...MOTION_LIBRARY_DEFAULTS, extra: 1 }]) {
    assert.equal(isMotionLibraryOptions(value), false);
  }
  for (const key of Object.keys(MOTION_LIBRARY_DEFAULTS)) {
    const missing = { ...MOTION_LIBRARY_DEFAULTS };
    delete missing[key];
    assert.equal(isMotionLibraryOptions(missing), false, `missing ${key}`);
    assert.equal(isMotionLibraryOptions({ ...MOTION_LIBRARY_DEFAULTS, [key]: "unknown" }), false);
  }
  assert.equal(isMotionLibraryOptions(Object.create(MOTION_LIBRARY_DEFAULTS)), false);
  assert.equal(isMotionLibraryOptions({ ...MOTION_LIBRARY_DEFAULTS, [Symbol("extra")]: 1 }), false);
  const hiddenKey = { ...MOTION_LIBRARY_DEFAULTS };
  Object.defineProperty(hiddenKey, "extra", { value: 1 });
  assert.equal(isMotionLibraryOptions(hiddenKey), false);
  const getter = { ...MOTION_LIBRARY_DEFAULTS };
  Object.defineProperty(getter, "phase", { get() { throw new Error("must not read accessors"); } });
  assert.equal(isMotionLibraryOptions(getter), false);
});
