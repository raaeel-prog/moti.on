import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { curveToTemporalEase, applyCurveToDimensions } from "../dist/index.js";

describe("curveToTemporalEase", () => {
  it("calculates correct out/in speeds and influences for linear curve", () => {
    // Linear curve (0,0) to (1,1)
    const curve = { x1: 0, y1: 0, x2: 1, y2: 1 };
    const { outPoint, inPoint } = curveToTemporalEase(curve, 1, 100);

    assert.deepStrictEqual(outPoint, { speed: 0, influence: 0.1 });
    assert.deepStrictEqual(inPoint, { speed: 0, influence: 0.1 });
  });

  it("calculates influence accurately (clamped between 0.1 and 100)", () => {
    const curve = { x1: 0.5, y1: 0.5, x2: 0.5, y2: 0.5 };
    const { outPoint, inPoint } = curveToTemporalEase(curve, 1, 100);
    
    assert.strictEqual(outPoint.influence, 50);
    assert.strictEqual(inPoint.influence, 50);

    const overCurve = { x1: 1.5, y1: 0.5, x2: -0.5, y2: 0.5 };
    const { outPoint: out2, inPoint: in2 } = curveToTemporalEase(overCurve, 1, 100);
    
    assert.strictEqual(out2.influence, 100);
    assert.strictEqual(in2.influence, 100);
  });

  it("calculates speed based on duration and value difference", () => {
    const curve = { x1: 0.5, y1: 1, x2: 0.5, y2: 0 };
    // slope out = 1 / 0.5 = 2
    // slope in = (1 - 0) / (1 - 0.5) = 1 / 0.5 = 2
    // dv = 100, dt = 2 -> unitSpeed = 50
    // speed = 2 * 50 = 100
    const { outPoint, inPoint } = curveToTemporalEase(curve, 2, 100);
    
    assert.strictEqual(outPoint.speed, 100);
    assert.strictEqual(inPoint.speed, 100);
  });

  it("returns zero speed when valueDifference is 0", () => {
    const curve = { x1: 0.5, y1: 1, x2: 0.5, y2: 0 };
    const { outPoint, inPoint } = curveToTemporalEase(curve, 2, 0);
    
    assert.strictEqual(outPoint.speed, 0);
    assert.strictEqual(inPoint.speed, 0);
    assert.strictEqual(outPoint.influence, 50);
    assert.strictEqual(inPoint.influence, 50);
  });

  it("throws if duration is <= 0", () => {
    const curve = { x1: 0.5, y1: 1, x2: 0.5, y2: 0 };
    assert.throws(() => {
      curveToTemporalEase(curve, 0, 100);
    });
    assert.throws(() => {
      curveToTemporalEase(curve, -1, 100);
    });
  });
});

describe("applyCurveToDimensions", () => {
  it("applies the curve to an array of differences", () => {
    const curve = { x1: 0.5, y1: 1, x2: 0.5, y2: 0 };
    const { outEase, inEase } = applyCurveToDimensions(curve, 2, [100, -50, 0]);

    assert.strictEqual(outEase.length, 3);
    assert.strictEqual(inEase.length, 3);

    // dimension 0
    assert.strictEqual(outEase[0].speed, 100);
    // dimension 1 (unitSpeed = -25, outSpeed = 2 * -25 = -50)
    assert.strictEqual(outEase[1].speed, -50);
    // dimension 2
    assert.strictEqual(outEase[2].speed, 0);
  });
});
