import test from "node:test";
import assert from "node:assert/strict";
import { duplicateGroups, motionFingerprint } from "../scripts/preset-uniqueness-audit.mjs";
import { MOTION_LIBRARY_PRESETS, MOTION_LIBRARY_DUPLICATES_RETIRED } from "../packages/contracts/dist/index.js";

test("no two live presets in a folder repeat the same motion", () => {
  const groups = duplicateGroups();
  assert.deepEqual(groups.map(g => g.map(p => p.id)), [], "node scripts/preset-uniqueness-audit.mjs lists them");
});

test("retired duplicates stay in the catalog so applied layers keep working", () => {
  for (const id of MOTION_LIBRARY_DUPLICATES_RETIRED) {
    const preset = MOTION_LIBRARY_PRESETS.find(p => p.id === id);
    assert.ok(preset, id);
    assert.equal(preset.retired, true, id);
  }
});

test("the fingerprint tells apart direction, color and choreography", () => {
  const base = MOTION_LIBRARY_PRESETS.find(p => p.position[1] !== 0 && !p.retired);
  assert.notEqual(motionFingerprint(base), motionFingerprint({ ...base, position: [base.position[0], -base.position[1], base.position[2]] }));
  assert.notEqual(motionFingerprint(base), motionFingerprint({ ...base, text: { ...base.text, fill: [1, 0, 0] } }));
  assert.notEqual(motionFingerprint(base), motionFingerprint({ ...base, choreography: { path: "linear", distribution: "alternate" } }));
});
