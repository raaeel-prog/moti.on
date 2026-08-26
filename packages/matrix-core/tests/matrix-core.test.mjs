import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  DEFAULT_SINGULAR_EPSILON,
  DEFAULT_TOLERANCE,
  MATRIX_CONVENTION,
  MATRIX_ERROR_CODES,
  MatrixCoreError,
  approximatelyEqual,
  composeMat3InApplicationOrder,
  composeMat4InApplicationOrder,
  composeRotationMat4,
  composeTransform2D,
  composeTransform3D,
  compensateAnchor2D,
  compensateAnchor3D,
  identityMat3,
  identityMat4,
  invertMat3,
  invertMat4,
  mat3,
  mat3ApproximatelyEqual,
  mat4,
  mat4ApproximatelyEqual,
  multiplyMat3,
  multiplyMat4,
  rotationMat3,
  rotationXMat4,
  rotationYMat4,
  rotationZMat4,
  scaleMat3,
  scaleMat4,
  transformPoint2D,
  transformPoint3D,
  transformVector2D,
  transformVector3D,
  translationMat3,
  translationMat4,
  vec2,
  vec2ApproximatelyEqual,
  vec3,
  vec3ApproximatelyEqual,
  worldMatrix2D,
  worldMatrix3D
} from "../dist/index.js";

const fixture2D = JSON.parse(
  await readFile(new URL("./fixtures/parented-2d.json", import.meta.url), "utf8")
);
const golden2D = JSON.parse(
  await readFile(new URL("./goldens/parented-2d.json", import.meta.url), "utf8")
);
const fixture3D = JSON.parse(
  await readFile(new URL("./fixtures/parented-3d.json", import.meta.url), "utf8")
);
const golden3D = JSON.parse(
  await readFile(new URL("./goldens/parented-3d.json", import.meta.url), "utf8")
);

const GOLDEN_TOLERANCE = Object.freeze({ absolute: 1e-11, relative: 1e-11 });

function radians(degrees) {
  return degrees * Math.PI / 180;
}

function transform2D(source) {
  return {
    position: source.position,
    anchor: source.anchor,
    scale: source.scale,
    rotationRadians: radians(source.rotationDegrees)
  };
}

function transform3D(source) {
  return {
    position: source.position,
    anchor: source.anchor,
    scale: source.scale,
    rotationRadians: source.rotationDegrees.map(radians),
    rotationOrder: source.rotationOrder
  };
}

function expectCode(code, callback) {
  assert.throws(callback, (error) => {
    assert.ok(error instanceof MatrixCoreError);
    assert.equal(error.code, code);
    return true;
  });
}

test("a convencao publica elimina ambiguidade de storage, vetores, multiplicacao e parents", () => {
  assert.deepEqual(MATRIX_CONVENTION, {
    storage: "row-major",
    vectors: "column",
    multiplication: "left-times-right; right operand is applied first",
    composition: "arguments are applied first-to-last",
    parentChain: "root-to-immediate-parent",
    angles: "radians",
    scale: "unitless-factor",
    transform2D: "T(position) * R(rotation) * S(scale) * T(-anchor)",
    transform3D: "T(position) * R(application-order) * S(scale) * T(-anchor)"
  });
  assert.ok(Object.isFrozen(MATRIX_CONVENTION));
  assert.ok(Object.isFrozen(DEFAULT_TOLERANCE));
  assert.equal(DEFAULT_SINGULAR_EPSILON, 1e-12);
  assert.ok(Object.isFrozen(MATRIX_ERROR_CODES));
});

test("construtores clonam, congelam e preservam a representacao row-major", () => {
  const source = [1, 2, 3, 4, 5, 6, 0, 0, 1];
  const matrix = mat3(source);
  const vector = vec3(7, 8, 9);

  source[0] = 99;
  assert.deepEqual(matrix, [1, 2, 3, 4, 5, 6, 0, 0, 1]);
  assert.deepEqual(vector, [7, 8, 9]);
  assert.ok(Object.isFrozen(matrix));
  assert.ok(Object.isFrozen(vector));
});

test("multiply usa left*right; compose aplica os argumentos na ordem declarada", () => {
  const scale = scaleMat3(vec2(2, 3));
  const translate = translationMat3(vec2(5, -2));

  const writtenOrder = multiplyMat3(translate, scale);
  const applicationOrder = composeMat3InApplicationOrder([scale, translate]);

  assert.deepEqual(transformPoint2D(writtenOrder, vec2(1, 2)), [7, 4]);
  assert.deepEqual(applicationOrder, writtenOrder);
  assert.deepEqual(transformPoint2D(multiplyMat3(scale, translate), vec2(1, 2)), [12, 0]);
});

test("ponto recebe translacao e vetor nao; rotacao 2D usa radianos", () => {
  const matrix = composeMat3InApplicationOrder([
    rotationMat3(Math.PI / 2),
    translationMat3(vec2(10, 20))
  ]);

  assert.ok(vec2ApproximatelyEqual(transformPoint2D(matrix, vec2(2, 0)), vec2(10, 22)));
  assert.ok(vec2ApproximatelyEqual(transformVector2D(matrix, vec2(2, 0)), vec2(0, 2)));
});

test("primitivas 3D distinguem pontos/vetores e compose mantem ordem de aplicacao", () => {
  const matrix = composeMat4InApplicationOrder([
    scaleMat4(vec3(2, 3, 4)),
    rotationZMat4(Math.PI / 2),
    translationMat4(vec3(10, -5, 7))
  ]);

  assert.ok(vec3ApproximatelyEqual(transformPoint3D(matrix, vec3(1, 2, 3)), vec3(4, -3, 19)));
  assert.ok(vec3ApproximatelyEqual(transformVector3D(matrix, vec3(1, 2, 3)), vec3(-6, 2, 12)));
});

test("as seis ordens Euler significam eixos aplicados da esquerda para a direita", () => {
  const rotation = vec3(0.31, -0.47, 0.83);
  const point = vec3(2, -3, 5);
  const orders = ["XYZ", "XZY", "YXZ", "YZX", "ZXY", "ZYX"];
  const results = new Set();

  for (const order of orders) {
    const axes = { X: rotationXMat4(rotation[0]), Y: rotationYMat4(rotation[1]), Z: rotationZMat4(rotation[2]) };
    const explicit = composeMat4InApplicationOrder([...order].map((axis) => axes[axis]));
    const composed = composeRotationMat4(rotation, order);
    assert.ok(mat4ApproximatelyEqual(composed, explicit));
    results.add(transformPoint3D(composed, point).map((value) => value.toFixed(9)).join(","));
  }

  assert.equal(results.size, 6, "uma ordem Euler nao pode ser ignorada silenciosamente");
});

test("fixture/golden 2D parentada cobre matrix, ponto, vetor e scale negativo", () => {
  const root = composeTransform2D(transform2D(fixture2D.root));
  const parent = composeTransform2D(transform2D(fixture2D.parent));
  const local = composeTransform2D(transform2D(fixture2D.local));
  const world = worldMatrix2D(local, [root, parent]);

  assert.ok(mat3ApproximatelyEqual(root, golden2D.rootMatrix, GOLDEN_TOLERANCE));
  assert.ok(mat3ApproximatelyEqual(parent, golden2D.parentMatrix, GOLDEN_TOLERANCE));
  assert.ok(mat3ApproximatelyEqual(local, golden2D.localMatrix, GOLDEN_TOLERANCE));
  assert.ok(mat3ApproximatelyEqual(world, golden2D.worldMatrix, GOLDEN_TOLERANCE));
  assert.ok(vec2ApproximatelyEqual(transformPoint2D(world, fixture2D.point), golden2D.worldPoint, GOLDEN_TOLERANCE));
  assert.ok(vec2ApproximatelyEqual(transformVector2D(world, fixture2D.vector), golden2D.worldVector, GOLDEN_TOLERANCE));

  const wrongOrder = worldMatrix2D(local, [parent, root]);
  assert.equal(mat3ApproximatelyEqual(wrongOrder, world, GOLDEN_TOLERANCE), false);
});

test("fixture/golden 3D parentada cobre matrix, ponto, vetor, Euler e scale negativo", () => {
  const root = composeTransform3D(transform3D(fixture3D.root));
  const parent = composeTransform3D(transform3D(fixture3D.parent));
  const local = composeTransform3D(transform3D(fixture3D.local));
  const world = worldMatrix3D(local, [root, parent]);

  assert.ok(mat4ApproximatelyEqual(root, golden3D.rootMatrix, GOLDEN_TOLERANCE));
  assert.ok(mat4ApproximatelyEqual(parent, golden3D.parentMatrix, GOLDEN_TOLERANCE));
  assert.ok(mat4ApproximatelyEqual(local, golden3D.localMatrix, GOLDEN_TOLERANCE));
  assert.ok(mat4ApproximatelyEqual(world, golden3D.worldMatrix, GOLDEN_TOLERANCE));
  assert.ok(vec3ApproximatelyEqual(transformPoint3D(world, fixture3D.point), golden3D.worldPoint, GOLDEN_TOLERANCE));
  assert.ok(vec3ApproximatelyEqual(transformVector3D(world, fixture3D.vector), golden3D.worldVector, GOLDEN_TOLERANCE));
});

test("inversao Mat3 faz round-trip de matrix e ponto com scale negativo", () => {
  const matrix = composeTransform2D(transform2D(fixture2D.local));
  const inverse = invertMat3(matrix);
  const identity = multiplyMat3(matrix, inverse);
  const point = vec2(-17.25, 8.5);

  assert.ok(mat3ApproximatelyEqual(identity, identityMat3()));
  assert.ok(vec2ApproximatelyEqual(transformPoint2D(inverse, transformPoint2D(matrix, point)), point));
});

test("inversao Mat4 faz round-trip de matrix, ponto e vetor com scale negativo", () => {
  const matrix = composeTransform3D(transform3D(fixture3D.local));
  const inverse = invertMat4(matrix);
  const point = vec3(-3.5, 11.25, 7);
  const vector = vec3(4, -2, 9);

  assert.ok(mat4ApproximatelyEqual(multiplyMat4(inverse, matrix), identityMat4()));
  assert.ok(vec3ApproximatelyEqual(transformPoint3D(inverse, transformPoint3D(matrix, point)), point));
  assert.ok(vec3ApproximatelyEqual(transformVector3D(inverse, transformVector3D(matrix, vector)), vector));
});

test("inversao falha fechada para matrizes singulares e quase singulares", () => {
  expectCode("SINGULAR_MATRIX", () => invertMat3(mat3([1, 2, 3, 2, 4, 6, 0, 0, 1])));
  expectCode("SINGULAR_MATRIX", () => invertMat4(mat4([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 1
  ])));

  const nearSingular = scaleMat3(vec2(1e-14, 1));
  expectCode("SINGULAR_MATRIX", () => invertMat3(nearSingular));
  assert.ok(mat3ApproximatelyEqual(
    multiplyMat3(nearSingular, invertMat3(nearSingular, 1e-16)),
    identityMat3()
  ));
});

test("compensacao de anchor 2D preserva a matrix world parentada", () => {
  const root = composeTransform2D(transform2D(fixture2D.root));
  const parent = composeTransform2D(transform2D(fixture2D.parent));
  const result = compensateAnchor2D(
    transform2D(fixture2D.local),
    fixture2D.nextAnchor,
    { parentsRootToImmediate: [root, parent], tolerance: GOLDEN_TOLERANCE }
  );

  assert.ok(vec2ApproximatelyEqual(result.transform.position, golden2D.compensatedPosition, GOLDEN_TOLERANCE));
  assert.deepEqual(result.transform.anchor, fixture2D.nextAnchor);
  assert.ok(mat3ApproximatelyEqual(result.beforeWorldMatrix, result.afterWorldMatrix, GOLDEN_TOLERANCE));
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.transform));
});

test("compensacao de anchor 3D preserva a matrix world parentada", () => {
  const root = composeTransform3D(transform3D(fixture3D.root));
  const parent = composeTransform3D(transform3D(fixture3D.parent));
  const result = compensateAnchor3D(
    transform3D(fixture3D.local),
    fixture3D.nextAnchor,
    { parentsRootToImmediate: [root, parent], tolerance: GOLDEN_TOLERANCE }
  );

  assert.ok(vec3ApproximatelyEqual(result.transform.position, golden3D.compensatedPosition, GOLDEN_TOLERANCE));
  assert.deepEqual(result.transform.anchor, fixture3D.nextAnchor);
  assert.ok(mat4ApproximatelyEqual(result.beforeWorldMatrix, result.afterWorldMatrix, GOLDEN_TOLERANCE));
});

test("comparacao combina tolerancia absoluta e relativa sem aceitar NaN", () => {
  assert.ok(approximatelyEqual(1e-13, 0, { absolute: 1e-12, relative: 0 }));
  assert.ok(approximatelyEqual(1_000_000_000, 1_000_000_001, { absolute: 0, relative: 1e-9 }));
  assert.equal(approximatelyEqual(10, 10.01, { absolute: 1e-3, relative: 0 }), false);
  expectCode("NON_FINITE_INPUT", () => approximatelyEqual(Number.NaN, 0));
  expectCode("INVALID_TOLERANCE", () => approximatelyEqual(0, 0, { absolute: -1, relative: 0 }));
  expectCode("INVALID_TOLERANCE", () => approximatelyEqual(0, 0, { absolute: 0, relative: Number.POSITIVE_INFINITY }));
});

test("todo input numerico nao finito ou dimensionalmente invalido falha fechado", () => {
  const cases = [
    ["NON_FINITE_INPUT", () => vec2(Number.NaN, 0)],
    ["NON_FINITE_INPUT", () => vec3(0, Number.POSITIVE_INFINITY, 0)],
    ["NON_FINITE_INPUT", () => mat3([1, 0, 0, 0, 1, 0, 0, 0, Number.NEGATIVE_INFINITY])],
    ["NON_FINITE_INPUT", () => rotationMat3(Number.NaN)],
    ["INVALID_DIMENSION", () => mat3([1, 2, 3])],
    ["INVALID_DIMENSION", () => transformPoint2D(identityMat3(), [1])],
    ["INVALID_DIMENSION", () => transformVector3D(identityMat4(), [1, 2])],
    ["INVALID_ROTATION_ORDER", () => composeRotationMat4(vec3(0, 0, 0), "XXY")],
    ["INVALID_SINGULAR_EPSILON", () => invertMat3(identityMat3(), 0)],
    ["INVALID_SINGULAR_EPSILON", () => invertMat4(identityMat4(), Number.NaN)]
  ];

  for (const [code, callback] of cases) expectCode(code, callback);
});

test("overflow aritmetico e matrix nao afim nao atravessam como resultado valido", () => {
  expectCode("NON_FINITE_RESULT", () => multiplyMat3(
    scaleMat3(vec2(Number.MAX_VALUE, Number.MAX_VALUE)),
    scaleMat3(vec2(2, 2))
  ));
  expectCode("NON_AFFINE_MATRIX", () => transformPoint2D(mat3([
    1, 0, 0,
    0, 1, 0,
    0.1, 0, 1
  ]), vec2(1, 2)));
  expectCode("NON_AFFINE_MATRIX", () => worldMatrix3D(identityMat4(), [mat4([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0.2, 0, 1
  ])]));
});

test("transforms malformados e options de anchor invalidos sao recusados antes do calculo", () => {
  expectCode("INVALID_TRANSFORM", () => composeTransform2D({
    position: [0, 0],
    anchor: [0, 0],
    scale: [1, 1]
  }));
  expectCode("NON_FINITE_INPUT", () => compensateAnchor3D(
    transform3D(fixture3D.local),
    [0, 0, Number.NaN]
  ));
  expectCode("INVALID_OPTIONS", () => compensateAnchor2D(
    transform2D(fixture2D.local),
    fixture2D.nextAnchor,
    { parentsRootToImmediate: "nao-e-array" }
  ));
});

test("round-trip deterministico cobre varias escalas, rotacoes e translacoes", () => {
  const transforms = [
    { position: [0, 0], anchor: [0, 0], scale: [1, 1], rotationRadians: 0 },
    { position: [1e4, -1e4], anchor: [-2, 7], scale: [-2, 0.25], rotationRadians: -2.1 },
    { position: [-0.5, 0.75], anchor: [20, -30], scale: [1e-4, -1e3], rotationRadians: 0.73 }
  ];
  const points = [[0, 0], [1, -2], [100.5, -70.25]];

  for (const transform of transforms) {
    const matrix = composeTransform2D(transform);
    const inverse = invertMat3(matrix, 1e-18);
    for (const point of points) {
      assert.ok(vec2ApproximatelyEqual(
        transformPoint2D(inverse, transformPoint2D(matrix, point)),
        point,
        { absolute: 1e-7, relative: 1e-9 }
      ));
    }
  }
});
