import test from "node:test";
import assert from "node:assert/strict";
import { CURVE_MORPH_MS, morphCurve } from "../dist/curve-editor.js";

const from = { x1: 0, y1: 0, x2: 1, y2: 1 };
const to = { x1: 0.5, y1: -0.2, x2: 0.3, y2: 1.4 };

test("the preset morph starts on the drawn curve and lands exactly on the preset", () => {
  assert.deepEqual(morphCurve(from, to, 0), from);
  assert.deepEqual(morphCurve(from, to, 1), to);
  assert.deepEqual(morphCurve(from, to, 2), to, "time past the end stays on the preset");
});

test("the morph eases out without overshoot and stays inside the motion budget", () => {
  let previous = 0;
  for (let step = 1; step <= 20; step++) {
    const x1 = morphCurve(from, to, step / 20).x1;
    assert.ok(x1 >= previous && x1 <= to.x1 + 1e-12, `monotonic, no overshoot at ${step}`);
    previous = x1;
  }
  assert.ok(morphCurve(from, to, 0.5).x1 > 0.25 * 1.5, "most of the way is covered early (ease-out)");
  assert.ok(CURVE_MORPH_MS <= 360, "transitions stay within 360 ms");
});
