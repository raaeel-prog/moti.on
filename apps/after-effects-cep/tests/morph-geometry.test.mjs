import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../host/src/morph-geometry.jsx", import.meta.url), "utf8");
const context = {$: {global: {}}, MotionJson: {stringify: JSON.stringify}};
vm.runInNewContext(source, context, {timeout: 1000});
const geometry = context.$.global.MotionMorphGeometry;
const copy = value => JSON.parse(JSON.stringify(value));

function path(vertices, inTangents, outTangents) {
  return {
    vertices: copy(vertices),
    inTangents: inTangents ? copy(inTangents) : vertices.map(() => [0, 0]),
    outTangents: outTangents ? copy(outTangents) : vertices.map(() => [0, 0]),
    closed: true
  };
}
function rectangle(left = 0, top = 0, width = 100, height = 100) {
  return path([[left, top], [left + width, top], [left + width, top + height], [left, top + height]]);
}
function close(actual, expected, tolerance = 1e-8, label = "value") {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} != ${expected}`);
}
function pointClose(actual, expected, tolerance = 1e-8) {
  close(actual[0], expected[0], tolerance, "x");
  close(actual[1], expected[1], tolerance, "y");
}
function cubic(curve, t) {
  const u = 1 - t;
  return [0, 1].map(axis => u ** 3 * curve[0][axis] + 3 * u ** 2 * t * curve[1][axis] + 3 * u * t ** 2 * curve[2][axis] + t ** 3 * curve[3][axis]);
}
function reversed(shape) {
  return path([...shape.vertices].reverse(), [...shape.outTangents].reverse(), [...shape.inTangents].reverse());
}
function finiteShape(shape) {
  assert.equal(shape.closed, true);
  assert.ok(shape.vertices.length >= 2);
  for (const key of ["vertices", "inTangents", "outTangents"]) {
    assert.equal(shape[key].length, shape.vertices.length, `${key} count`);
    for (const point of shape[key]) assert.ok(point.length === 2 && point.every(Number.isFinite), `${key} must be finite`);
  }
}
function circle(cx, cy, radius) {
  const handle = radius * .5522847498307936;
  return path(
    [[cx, cy - radius], [cx + radius, cy], [cx, cy + radius], [cx - radius, cy]],
    [[-handle, 0], [0, -handle], [handle, 0], [0, handle]],
    [[handle, 0], [0, handle], [-handle, 0], [0, -handle]]
  );
}
function curves(shape) {
  return shape.vertices.map((vertex, index) => {
    const next = (index + 1) % shape.vertices.length, endpoint = shape.vertices[next];
    return [vertex, vertex.map((v, axis) => v + shape.outTangents[index][axis]), endpoint.map((v, axis) => v + shape.inTangents[next][axis]), endpoint];
  });
}
function findParameter(curve, point) {
  const distance = t => cubic(curve, t).reduce((sum, value, axis) => sum + (value - point[axis]) ** 2, 0);
  let best = 0, score = Infinity;
  for (let i = 0; i <= 32; i += 1) {
    const d = distance(i / 32);
    if (d < score) {score = d; best = i;}
  }
  let lo = Math.max(0, (best - 1) / 32), hi = Math.min(1, (best + 1) / 32);
  for (let i = 0; i < 80; i += 1) {
    const a = lo + (hi - lo) / 3, b = hi - (hi - lo) / 3;
    if (distance(a) < distance(b)) hi = b; else lo = a;
  }
  const candidate = (lo + hi) / 2;
  return distance(candidate) < distance(best / 32) ? candidate : best / 32;
}
function sameCurves(actualShape, originalShape) {
  const originals = [...curves(originalShape), ...curves(reversed(originalShape))];
  for (const segment of curves(actualShape)) {
    let error = Infinity;
    for (const original of originals) {
      const lo = findParameter(original, segment[0]), hi = findParameter(original, segment[3]);
      if (lo > hi + 1e-10) continue;
      let candidateError = 0;
      for (let i = 0; i <= 8; i += 1) {
        const a = cubic(segment, i / 8), b = cubic(original, lo + (hi - lo) * i / 8);
        candidateError = Math.max(candidateError, Math.hypot(a[0] - b[0], a[1] - b[1]));
      }
      error = Math.min(error, candidateError);
    }
    assert.ok(error < 1e-6, `prepared curve changed the native outline by ${error}`);
  }
}
function properCrossings(shape) {
  const points = curves(shape).flatMap(curve => Array.from({length: 12}, (_, i) => cubic(curve, i / 12)));
  const orientation = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  let crossings = 0;
  for (let i = 0; i < points.length; i += 1) for (let j = i + 2; j < points.length; j += 1) {
    if (i === 0 && j === points.length - 1) continue;
    const a = points[i], b = points[(i + 1) % points.length], c = points[j], d = points[(j + 1) % points.length];
    if (orientation(a, b, c) * orientation(a, b, d) < -1e-9 && orientation(c, d, a) * orientation(c, d, b) < -1e-9) crossings += 1;
  }
  return crossings;
}

test("morph geometry loads as an isolated host global", () => {
  assert.ok(geometry);
  for (const name of ["normalize", "bounds", "area", "transform", "splitCubic", "prepareGlyph", "source", "sourceExpression"]) assert.equal(typeof geometry[name], "function", name);
});

test("normalization preserves valid geometry without mutating native arrays", () => {
  const original = rectangle(-13, 7, 31, 19), snapshot = copy(original);
  const normalized = geometry.normalize(original);
  assert.deepEqual(copy(normalized), snapshot);
  normalized.vertices[0][0] += 100;
  normalized.inTangents[1][0] += 100;
  normalized.outTangents[2][0] += 100;
  assert.deepEqual(original, snapshot);
});

test("normalization rejects open and nonfinite paths before preparation", () => {
  const open = {...rectangle(), closed: false};
  const badVertex = rectangle(); badVertex.vertices[0][0] = NaN;
  const badHandle = rectangle(); badHandle.outTangents[1][1] = Infinity;
  assert.throws(() => geometry.normalize(open));
  assert.throws(() => geometry.normalize(badVertex));
  assert.throws(() => geometry.normalize(badHandle));
  assert.throws(() => geometry.normalize(path([[1, 2]])));
});

test("bounds finds cubic extrema between vertices", () => {
  const hump = path([[0, 0], [100, 0]], [[0, 0], [0, 100]], [[0, 100], [0, 0]]);
  const bounds = geometry.bounds(hump);
  for (const [key, expected] of Object.entries({left: 0, top: 0, right: 100, bottom: 75, width: 100, height: 75})) close(bounds[key], expected, 1e-8, key);
});

test("area integrates curved edges and follows contour winding", () => {
  const square = rectangle(), hump = path([[0, 0], [100, 0]], [[0, 0], [0, 100]], [[0, 100], [0, 0]]);
  close(geometry.area(square), 10000);
  close(geometry.area(reversed(square)), -10000);
  close(geometry.area(hump), -6000);
  close(geometry.area(reversed(hump)), 6000);
  close(geometry.area(geometry.transform(hump, [1, 0, 0, 1, 723, -311])), -6000, 1e-6);
});

test("affine transform translates vertices but applies only its linear part to handles", () => {
  const original = path([[2, 3], [7, 11]], [[1, 2], [-3, 4]], [[5, -6], [7, 8]]), snapshot = copy(original);
  const transformed = geometry.transform(original, [2, 3, -4, 5, 101, -47]);
  assert.deepEqual(copy(transformed.vertices), [[93, -26], [71, 29]]);
  assert.deepEqual(copy(transformed.inTangents), [[-6, 13], [-22, 11]]);
  assert.deepEqual(copy(transformed.outTangents), [[34, -15], [-18, 61]]);
  assert.deepEqual(original, snapshot);
  finiteShape(transformed);
});

test("affine transform scales exact curved area by its determinant", () => {
  const shape = path([[0, 0], [100, 0]], [[0, 0], [0, 100]], [[0, 100], [0, 0]]);
  const matrix = [2, 3, -4, 5, 101, -47];
  close(geometry.area(geometry.transform(shape, matrix)), geometry.area(shape) * (matrix[0] * matrix[3] - matrix[1] * matrix[2]), 1e-6);
});

test("exact subdivision reconstructs the entire cubic at asymmetric split points", () => {
  const curves = [
    [[0, 0], [17, -83], [92, 131], [100, 4]],
    [[-14, 9], [-14, 9], [203, -61], [203, -61]],
    [[5, 7], [5, 7], [5, 7], [5, 7]]
  ];
  for (const curve of curves) for (const splitAt of [.1, .37, .8]) {
    const snapshot = copy(curve), result = geometry.splitCubic(curve, splitAt);
    assert.deepEqual(curve, snapshot);
    pointClose(result.left[0], curve[0]); pointClose(result.right[3], curve[3]);
    pointClose(result.left[3], result.right[0]);
    for (let sample = 0; sample <= 30; sample += 1) {
      const t = sample / 30;
      const subdivided = t <= splitAt ? cubic(result.left, t / splitAt) : cubic(result.right, (t - splitAt) / (1 - splitAt));
      pointClose(subdivided, cubic(curve, t), 1e-7);
    }
  }
});

test("glyph preparation preserves exact curved outlines while matching source topology", () => {
  const contours = [reversed(circle(50, 40, 36)), circle(50, 40, 12), circle(50, -12, 5)];
  const snapshot = copy(contours), cell = {x: -14, y: -10, width: 128, height: 120, first: true, last: true};
  const prepared = geometry.prepareGlyph(contours, cell, {roundness: 18});
  assert.equal(prepared.length, 3);
  assert.deepEqual(contours, snapshot);
  for (let i = 0; i < prepared.length; i += 1) {
    const data = prepared[i], initial = geometry.source(data, cell, 18);
    finiteShape(data.target); finiteShape(initial);
    assert.equal(initial.vertices.length, data.target.vertices.length);
    close(Math.abs(geometry.area(data.target)), Math.abs(geometry.area(contours[i])), 1e-6);
    sameCurves(data.target, contours[i]);
    for (const key of ["left", "top", "right", "bottom"]) close(geometry.bounds(data.target)[key], geometry.bounds(contours[i])[key], 1e-6, key);
    assert.equal(data.extra, i !== 0);
    if (data.extra) close(geometry.area(initial), 0);
  }
  assert.deepEqual(Array.from(prepared, data => data.depth), [0, 1, 0]);
  assert.ok(geometry.area(prepared[0].target) > 0);
  assert.ok(geometry.area(prepared[1].target) < 0);
  assert.ok(geometry.area(prepared[2].target) > 0);
});

test("nested islands keep alternating winding and disconnected accents stay exterior", () => {
  const contours = [rectangle(0, 0, 100, 100), rectangle(20, 20, 60, 60), reversed(rectangle(40, 40, 20, 20)), reversed(rectangle(112, 30, 8, 12))];
  const prepared = geometry.prepareGlyph(contours, {x: 0, y: 0, width: 140, height: 100, first: true, last: true});
  assert.deepEqual(Array.from(prepared, data => data.depth), [0, 1, 2, 0]);
  assert.deepEqual(Array.from(prepared, data => Math.sign(geometry.area(data.target))), [1, -1, 1, 1]);
  for (const data of prepared.slice(1)) close(geometry.area(geometry.source(data, {x: 0, y: 0, width: 140, height: 100, first: true, last: true}, 14)), 0);
});

test("adjacent source cells reconstruct the rounded word box without interior rounding", () => {
  const glyph = rectangle(10, 10, 16, 60);
  const cells = [
    {x: -25, y: -15, width: 35, height: 100, first: true, last: false},
    {x: 10, y: -15, width: 80, height: 100, first: false, last: false},
    {x: 90, y: -15, width: 55, height: 100, first: false, last: true}
  ];
  const radius = 18;
  const shapes = cells.map(cell => geometry.source(geometry.prepareGlyph([glyph], cell)[0], cell, radius));
  const wholeCell = {x: -25, y: -15, width: 170, height: 100, first: true, last: true};
  const whole = geometry.source(geometry.prepareGlyph([glyph], wholeCell)[0], wholeCell, radius);
  close(shapes.reduce((sum, shape) => sum + geometry.area(shape), 0), geometry.area(whole), 1e-6);
  for (let i = 0; i < shapes.length; i += 1) {
    finiteShape(shapes[i]);
    const b = geometry.bounds(shapes[i]);
    close(b.left, cells[i].x); close(b.right, cells[i].x + cells[i].width);
    close(b.top, -15); close(b.bottom, 85);
  }
  for (let i = 0; i < shapes.length - 1; i += 1) {
    const join = cells[i].x + cells[i].width;
    const leftEdge = curves(shapes[i]).filter(curve => curve.every(point => Math.abs(point[0] - join) < 1e-8));
    const rightEdge = curves(shapes[i + 1]).filter(curve => curve.every(point => Math.abs(point[0] - join) < 1e-8));
    assert.ok(leftEdge.length && rightEdge.length);
    const extent = edges => [Math.min(...edges.flat(1).map(point => point[1])), Math.max(...edges.flat(1).map(point => point[1]))];
    assert.deepEqual(extent(leftEdge), extent(rightEdge));
    assert.deepEqual(extent(leftEdge), [-15, 85]);
  }
});

test("live source expressions retain the prepared topology as roundness changes", () => {
  const cell = {x: -11, y: 6, width: 123, height: 81, first: true, last: true};
  const prepared = geometry.prepareGlyph([circle(50, 40, 30), circle(50, 40, 10)], cell);
  for (const radius of [0, 7, 40, 400]) for (const data of prepared) {
    const generated = geometry.sourceExpression(data, JSON.stringify(cell), String(radius));
    const evaluated = vm.runInNewContext(`${generated}\nS;`, {}, {timeout: 1000});
    assert.deepEqual(copy(evaluated), copy(geometry.source(data, cell, radius)));
    assert.equal(evaluated.vertices.length, data.target.vertices.length);
    finiteShape(evaluated);
  }
});

test("large live roundness cannot invert a narrow first or last glyph cell", () => {
  for (const cell of [
    {x: 0, y: 0, width: 10, height: 100, first: true, last: false, maxRadius: 50},
    {x: 0, y: 0, width: 10, height: 100, first: false, last: true, maxRadius: 50},
    {x: 0, y: 0, width: 10, height: 100, first: true, last: true, maxRadius: 50}
  ]) {
    const data = geometry.prepareGlyph([rectangle(0, 0, 10, 100)], cell)[0];
    const initial = geometry.source(data, cell, 500), bounds = geometry.bounds(initial);
    close(bounds.left, 0); close(bounds.right, 10);
    close(bounds.top, 0); close(bounds.bottom, 100);
    assert.ok(geometry.area(initial) > 0, "rounded cell must retain its exterior winding");
  }
});

test("cyclic correspondence prevents the U outline from folding over itself", () => {
  const u = path([[0, 0], [25, 0], [25, 75], [75, 75], [75, 0], [100, 0], [100, 100], [0, 100]]);
  const cell = {x: 0, y: 0, width: 100, height: 100, first: true, last: true};
  const prepared = geometry.prepareGlyph([u], cell, {roundness: 20})[0], initial = geometry.source(prepared, cell, 20);
  assert.equal(properCrossings(prepared.target), 0);
  for (let sample = 0; sample <= 20; sample += 1) {
    const q = sample / 20, mixed = {closed: true};
    for (const key of ["vertices", "inTangents", "outTangents"]) mixed[key] = initial[key].map((point, index) => point.map((coordinate, axis) => coordinate + (prepared.target[key][index][axis] - coordinate) * q));
    assert.equal(properCrossings(mixed), 0, `U outline crosses itself at ${q}`);
  }
});

test("smoothness remains monotone with exact endpoints and a symmetric time curve", () => {
  for (const smoothness of [0, 10, 50, 85, 100]) {
    assert.equal(geometry.ease(-1, smoothness), 0); assert.equal(geometry.ease(0, smoothness), 0);
    assert.equal(geometry.ease(1, smoothness), 1); assert.equal(geometry.ease(2, smoothness), 1);
    let previous = 0;
    for (let sample = 1; sample <= 100; sample += 1) {
      const t = sample / 100, value = geometry.ease(t, smoothness);
      assert.ok(Number.isFinite(value) && value >= previous && value <= 1);
      close(value + geometry.ease(1 - t, smoothness), 1);
      if (smoothness === 0) close(value, t);
      previous = value;
    }
  }
});
