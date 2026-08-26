import type { Mat3, Vec2 } from "./types.js";
import { invertSquare } from "./inversion.js";
import { DEFAULT_SINGULAR_EPSILON } from "./numeric.js";
import {
  copyMat3,
  copyVec2,
  mat3FromResults,
  requireAffineMat3,
  requireFinite,
  vec2FromResults
} from "./validation.js";

const IDENTITY: Mat3 = Object.freeze([
  1, 0, 0,
  0, 1, 0,
  0, 0, 1
]);

export function vec2(x: number, y: number): Vec2 {
  return copyVec2([x, y]);
}

export function mat3(values: readonly number[]): Mat3 {
  return copyMat3(values);
}

export function identityMat3(): Mat3 {
  return IDENTITY;
}

export function translationMat3(translation: Vec2): Mat3 {
  const [x, y] = copyVec2(translation, "translation");
  return Object.freeze([
    1, 0, x,
    0, 1, y,
    0, 0, 1
  ]);
}

export function scaleMat3(scale: Vec2): Mat3 {
  const [x, y] = copyVec2(scale, "scale");
  return Object.freeze([
    x, 0, 0,
    0, y, 0,
    0, 0, 1
  ]);
}

export function rotationMat3(rotationRadians: number): Mat3 {
  const angle = requireFinite(rotationRadians, "rotationRadians");
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return mat3FromResults([
    cosine, -sine, 0,
    sine, cosine, 0,
    0, 0, 1
  ], "rotationMat3");
}

export function multiplyMat3(left: Mat3, right: Mat3): Mat3 {
  const a = copyMat3(left, "left");
  const b = copyMat3(right, "right");
  const output = new Array<number>(9).fill(0);
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      let sum = 0;
      for (let index = 0; index < 3; index += 1) {
        sum += a[row * 3 + index]! * b[index * 3 + column]!;
      }
      output[row * 3 + column] = sum;
    }
  }
  return mat3FromResults(output, "multiplyMat3");
}

/**
 * Aplica as matrices na ordem do array. Para [A, B, C], o resultado e C*B*A.
 */
export function composeMat3InApplicationOrder(matrices: readonly Mat3[]): Mat3 {
  if (!Array.isArray(matrices)) {
    // O shape invalido e reportado como dimensao, igual aos demais arrays matematicos.
    return copyMat3(matrices, "matrices");
  }
  let composed = identityMat3();
  for (let index = 0; index < matrices.length; index += 1) {
    composed = multiplyMat3(copyMat3(matrices[index], `matrices[${index}]`), composed);
  }
  return composed;
}

export function invertMat3(
  matrix: Mat3,
  singularEpsilon: number = DEFAULT_SINGULAR_EPSILON
): Mat3 {
  const source = copyMat3(matrix);
  return mat3FromResults(invertSquare(source, 3, singularEpsilon), "invertMat3");
}

export function transformPoint2D(matrix: Mat3, point: Vec2): Vec2 {
  const m = requireAffineMat3(matrix, "matrix");
  const p = copyVec2(point, "point");
  return vec2FromResults([
    m[0] * p[0] + m[1] * p[1] + m[2],
    m[3] * p[0] + m[4] * p[1] + m[5]
  ], "transformPoint2D");
}

export function transformVector2D(matrix: Mat3, vector: Vec2): Vec2 {
  const m = requireAffineMat3(matrix, "matrix");
  const v = copyVec2(vector, "vector");
  return vec2FromResults([
    m[0] * v[0] + m[1] * v[1],
    m[3] * v[0] + m[4] * v[1]
  ], "transformVector2D");
}
