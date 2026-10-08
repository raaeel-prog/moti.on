import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_BOUNCE, DEFAULT_ELASTIC, backCurve, bezierSpeedAt, bezierValueAt, bounceOut, constrainCurveEnds, constrainCurvePoint,
  easingValue, elasticOut, insertCurvePoint, multiPointValueAt, normalizeCurveSegments, peakSpeed, sampleBezierSpeed,
  sortedPointsValid, speedDragToCurve, fitRange
} from "../dist/index.js";

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);
const EASE = { x1: 0.25, y1: 0.1, x2: 0.25, y2: 1 };
const LINEAR = { x1: 0, y1: 0, x2: 1, y2: 1 };
const params = { in: DEFAULT_ELASTIC, out: DEFAULT_ELASTIC };

test("bezier value and speed: linear is identity with speed 1, vertical handle stays finite", () => {
  near(bezierValueAt(LINEAR, 0.3), 0.3);
  near(bezierSpeedAt(LINEAR, 0.7), 1);
  assert.equal(peakSpeed(LINEAR), 1);
  assert.ok(peakSpeed({ x1: 0.65, y1: 0, x2: 0.35, y2: 1 }) > 1.5);
  assert.ok(Number.isFinite(peakSpeed({ x1: 0, y1: 1, x2: 1, y2: 0 })));
  const samples = sampleBezierSpeed(EASE, 33);
  assert.equal(samples.length, 33); assert.equal(samples[0].x, 0); assert.equal(samples.at(-1).x, 1);
});

test("speed drag: centre raises both influences, edge changes one side, down reverses", () => {
  const start = { x1: 0.25, y1: 0, x2: 0.75, y2: 1 };
  const centre = speedDragToCurve(start, 0.5, 0.2);
  assert.deepEqual(centre, { x1: 0.35, y1: 0, x2: 0.65, y2: 1 });
  assert.ok(peakSpeed(centre) > peakSpeed(start));
  assert.deepEqual(speedDragToCurve(start, 0.1, 0.2), { x1: 0.45, y1: 0, x2: 0.75, y2: 1 });
  assert.deepEqual(speedDragToCurve(start, 0.9, 0.2), { x1: 0.25, y1: 0, x2: 0.55, y2: 1 });
  assert.deepEqual(speedDragToCurve(start, 0.5, -0.5), { x1: 0, y1: 0, x2: 1, y2: 1 });
});

test("normalizeCurveSegments: one mid point gives hand-computed locals; a flat segment maps to 0/1", () => {
  const point = { x: 0.5, y: 0.8, inX: 0.4, inY: 0.7, outX: 0.6, outY: 0.9 };
  const { knots, segments } = normalizeCurveSegments({ x1: 0.1, y1: 0.2, x2: 0.9, y2: 1 }, [point]);
  assert.equal(knots.length, 3); assert.equal(segments.length, 2);
  near(segments[0].x1, 0.2); near(segments[0].y1, 0.25); near(segments[0].x2, 0.8); near(segments[0].y2, 0.875);
  near(segments[1].x1, 0.2); near(segments[1].y1, 0.5); near(segments[1].x2, 0.8); near(segments[1].y2, 1);
  const flat = normalizeCurveSegments(EASE, [{ x: 0.5, y: 0, inX: 0.4, inY: 0, outX: 0.6, outY: 0 }]).segments[0];
  assert.equal(flat.y1, 0); assert.equal(flat.y2, 1);
  near(multiPointValueAt(EASE, [point], 0.5), 0.8);
  near(multiPointValueAt(EASE, [point], 1), 1);
  near(multiPointValueAt(EASE, [], 0.5), bezierValueAt(EASE, 0.5));
});

test("insert splits the segment without changing the curve; constrain keeps order, limits and mirrored tangents", () => {
  const inserted = insertCurvePoint(EASE, [], 0.5);
  const points = inserted.points;
  assert.equal(points.length, 1);
  assert.ok(sortedPointsValid(points));
  near(points[0].y, bezierValueAt(EASE, 0.5), 2e-3);
  for (const x of [0.1, 0.3, 0.5, 0.7, 0.9]) near(multiPointValueAt(inserted.curve, points, x), bezierValueAt(EASE, x), 5e-3);
  const again = insertCurvePoint(inserted.curve, points, 0.25);
  assert.equal(again.points.length, 2);
  for (const x of [0.1, 0.3, 0.5, 0.7, 0.9]) near(multiPointValueAt(again.curve, again.points, x), bezierValueAt(EASE, x), 8e-3);
  const twice = insertCurvePoint(inserted.curve, points, 0.505);
  assert.equal(twice.points.length, 1, "too close to an existing point is ignored");
  const ends = constrainCurveEnds({ x1: 0.9, y1: 0, x2: 0.1, y2: 1 }, points);
  assert.equal(ends.x1, 0.5); assert.equal(ends.x2, 0.5);
  const moved = constrainCurvePoint(points, 0, { x: 2, y: 5 }, true);
  assert.equal(moved.x, 0.99); assert.equal(moved.y, 2);
  const inMoved = constrainCurvePoint(points, 0, { inX: 0.3, inY: 0.5 }, true);
  near(inMoved.outX, inMoved.x + (inMoved.x - inMoved.inX)); near(inMoved.outY, inMoved.y + (inMoved.y - inMoved.inY));
  const broken = constrainCurvePoint(points, 0, { outX: 0.7, outY: 1.5 }, false);
  assert.equal(broken.inX, points[0].inX);
  assert.equal(constrainCurvePoint(points, 0, { inX: 0.9 }, false).inX, points[0].x, "in handle never passes the knot");
  assert.equal(sortedPointsValid([{ x: 0.6, y: 0, inX: 0.5, inY: 0, outX: 0.7, outY: 0 }, { x: 0.4, y: 0, inX: 0.3, inY: 0, outX: 0.5, outY: 0 }]), false);
});

test("back curves reproduce the existing presets", () => {
  assert.deepEqual(backCurve(0.56, "out"), { x1: 0.34, y1: 1.56, x2: 0.64, y2: 1 });
  assert.deepEqual(backCurve(0.56, "in"), { x1: 0.36, y1: 0, x2: 0.66, y2: -0.56 });
  assert.deepEqual(backCurve(2, "inOut"), { x1: 0.68, y1: -1, x2: 0.32, y2: 2 });
});

test("elastic and bounce hit their endpoints exactly and behave as described", () => {
  near(elasticOut(0, DEFAULT_ELASTIC), 0); near(elasticOut(1, DEFAULT_ELASTIC), 1);
  near(elasticOut(0, { ...DEFAULT_ELASTIC, start: 0.3 }), 0.3);
  const values = Array.from({ length: 101 }, (_, i) => elasticOut(i / 100, DEFAULT_ELASTIC));
  assert.ok(Math.max(...values) > 1.1, "overshoots");
  assert.ok(values.slice(90).every(v => Math.abs(v - 1) < 0.05), "settles");
  near(bounceOut(0, DEFAULT_BOUNCE), 0); near(bounceOut(1, DEFAULT_BOUNCE), 1);
  const bounce = Array.from({ length: 201 }, (_, i) => bounceOut(i / 200, DEFAULT_BOUNCE));
  assert.ok(bounce.every(v => v <= 1 + 1e-9 && v >= 0), "never above 1");
  assert.ok(bounce.some((v, i) => i > 60 && v < 0.9), "comes back down after the first hit");
});

test("direction composition: in mirrors out, inOut is continuous and honours the bezier halves", () => {
  for (const mode of ["elastic", "bounce"]) {
    const p = mode === "bounce" ? { in: DEFAULT_BOUNCE, out: DEFAULT_BOUNCE } : params;
    near(easingValue(mode, p, "in", 0.3), 1 - easingValue(mode, p, "out", 0.7));
    near(easingValue(mode, p, "in", 0), 0); near(easingValue(mode, p, "in", 1), 1);
    near(easingValue(mode, p, "inOut", 0), 0); near(easingValue(mode, p, "inOut", 1), 1);
    near(easingValue(mode, p, "inOut", 0.5), 0.5, 1e-6);
    near(easingValue(mode, p, "inOut", 0.4999), 0.5, 2e-3);
  }
  const custom = { ...params, inCurve: { x1: 0.5, y1: -0.5, x2: 0.5, y2: 1 } };
  near(easingValue("elastic", custom, "inOut", 0.25), 0.5 * bezierValueAt(custom.inCurve, 0.5));
  assert.ok(easingValue("elastic", custom, "inOut", 0.1) < 0, "handle under the baseline gives an anticipation dip");
});

test("fitRange always contains 0..1", () => {
  assert.deepEqual(fitRange([0.2, 0.5]), { low: 0, high: 1 });
  assert.deepEqual(fitRange([-0.5, 1.5], 0.1), { low: -0.6, high: 1.6 });
});
