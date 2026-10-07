import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const built = await build({
  entryPoints: [fileURLToPath(new URL("../client/src/orbit-presets.ts", import.meta.url))],
  bundle: true, platform: "node", format: "esm", write: false
});
const { ORBIT_PRESETS, DEFAULT_ORBIT, deriveOrbitPreset, selectOrbitPreset } = await import(
  `data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString("base64")}`
);

const base = {
  host: "after-effects", hostVersion: "26.3", fps: 30,
  compWidth: 1920, compHeight: 1080, compDurationSeconds: 10,
  currentTimeSeconds: 0, workAreaStart: 0, workAreaDuration: 10,
  selectionCount: 5, selectionKinds: ["shape"], selectionHasKeyframes: false,
  selectionHasExpressions: false, selectionIs3D: false,
  averageLayerDurationSeconds: 10, existingRigIdsInSelection: []
};

test("quick orbit defaults show sprites and leave member spacing to the host", () => {
  assert.equal(deriveOrbitPreset(base).preset, "frontal");
  assert.equal(deriveOrbitPreset(base).faceTarget, false);
  for (const selectionCount of [1, 2, 5, 12, 100]) {
    const args = deriveOrbitPreset({ ...base, selectionCount });
    assert.equal(args.phase, 0, "shared phase must not double the host's member spacing");
    assert.equal(args.speed, 60);
    assert.equal(args.bake, false);
    assert.equal(args.targetMode, "newController");
    assert.equal(args.applyPreset, undefined, "a repeat must preserve the host's edited preset");
  }
});

for (const fps of [24, 25, 29.97, 60]) {
  for (const [compWidth, compHeight, radius] of [[1080, 1920, 270], [1920, 1080, 270], [3840, 2160, 540]]) {
    test(`every preset derives visible defaults at ${compWidth}×${compHeight}, ${fps}fps`, () => {
      for (const preset of ORBIT_PRESETS) {
        const args = deriveOrbitPreset({ ...base, compWidth, compHeight, fps }, preset);
        assert.equal(args.preset, preset);
        assert.equal(args.radius, radius);
        assert.equal(args.inclination, 0);
        assert.equal(args.azimuth, 0);
        assert.equal(args.bank, 0);
        assert.equal(args.spread, 100);
      }
    });
  }
}

test("small or missing composition sizes yield a positive finite radius", () => {
  assert.equal(deriveOrbitPreset({ ...base, compWidth: 1, compHeight: 1 }).radius, 1);
  assert.equal(deriveOrbitPreset({ ...base, compWidth: NaN, compHeight: 0 }).radius, 270);
  assert.equal(deriveOrbitPreset({ ...base, compWidth: 0, compHeight: Infinity }).radius, 270);
});

test("choosing a preset resets pose while preserving the drafted size and speed", () => {
  const draft = { ...DEFAULT_ORBIT, radius: 650, speed: -90, inclination: 12, azimuth: 40,
    bank: 25, phase: 75, spread: 35, faceTarget: true, bake: true, targetMode: "reuseController" };
  const before = structuredClone(draft);
  for (const preset of ORBIT_PRESETS) {
    const args = selectOrbitPreset(draft, preset);
    assert.deepEqual(args, { ...DEFAULT_ORBIT, radius: 650, speed: -90, preset });
  }
  assert.deepEqual(draft, before);
  assert.equal(Object.isFrozen(DEFAULT_ORBIT), true);
});
