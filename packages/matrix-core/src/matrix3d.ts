import { fail } from "./errors.js";
import { invertSquare } from "./inversion.js";
import { DEFAULT_SINGULAR_EPSILON } from "./numeric.js";
import type { Mat4, RotationOrder3D, Vec3 } from "./types.js";
import {
  copyMat4,
  copyVec3,
  mat4FromResults,
  requireAffineMat4,
  requireFinite,
  vec3FromResults
} from "./validation.js";

const IDENTITY: Mat4 = Object.freeze([
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1
]);

const ROTATION_ORDERS: ReadonlySet<string> = new Set([
  "XYZ", "XZY", "YXZ", "YZX", "ZXY", "ZYX"
]);

export function vec3(x: number, y: number, z: number): Vec3 {
  return copyVec3([x, y, z]);
}

export function mat4(values: readonly number[]): Mat4 {
  return copyMat4(values);
}

export function identityMat4(): Mat4 {
  return IDENTITY;
}

export function translationMat4(translation: Vec3): Mat4 {
  const [x, y, z] = copyVec3(translation, "translation");
  return Object.freeze([
    1, 0, 0, x,
    0, 1, 0, y,
    0, 0, 1, z,
    0, 0, 0, 1
  ]);
}

export function scaleMat4(scale: Vec3): Mat4 {
  const [x, y, z] = copyVec3(scale, "scale");
  return Object.freeze([
    x, 0, 0, 0,
    0, y, 0, 0,
    0, 0, z, 0,
    0, 0, 0, 1
  ]);
}

export function rotationXMat4(rotationRadians: number): Mat4 {
  const angle = requireFinite(rotationRadians, "rotationRadians");
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return mat4FromResults([
    1, 0, 0, 0,
    0, cosine, -sine, 0,
    0, sine, cosine, 0,
    0, 0, 0, 1
  ], "rotationXMat4");
}

export function rotationYMat4(rotationRadians: number): Mat4 {
  const angle = requireFinite(rotationRadians, "rotationRadians");
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return mat4FromResults([
    cosine, 0, sine, 0,
    0, 1, 0, 0,
    -sine, 0, cosine, 0,
    0, 0, 0, 1
  ], "rotationYMat4");
}

export function rotationZMat4(rotationRadians: number): Mat4 {
  const angle = requireFinite(rotationRadians, "rotationRadians");
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return mat4FromResults([
    cosine, -sine, 0, 0,
    sine, cosine, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1
  ], "rotationZMat4");
}

export function multiplyMat4(left: Mat4, right: Mat4): Mat4 {
  const a = copyMat4(left, "left");
  const b = copyMat4(right, "right");
  const output = new Array<number>(16).fill(0);
  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      let sum = 0;
      for (let index = 0; index < 4; index += 1) {
        sum += a[row * 4 + index]! * b[index * 4 + column]!;
      }
      output[row * 4 + column] = sum;
    }
  }
  return mat4FromResults(output, "multiplyMat4");
}

/**
 * Aplica as matrices na ordem do array. Para [A, B, C], o resultado e C*B*A.
 */
export function composeMat4InApplicationOrder(matrices: readonly Mat4[]): Mat4 {
  if (!Array.isArray(matrices)) return copyMat4(matrices, "matrices");
  let composed = identityMat4();
  for (let index = 0; index < matrices.length; index += 1) {
    composed = multiplyMat4(copyMat4(matrices[index], `matrices[${index}]`), composed);
  }
  return composed;
}

export function requireRotationOrder(value: unknown): RotationOrder3D {
  if (typeof value !== "string" || !ROTATION_ORDERS.has(value)) {
    fail("INVALID_ROTATION_ORDER", "rotationOrder precisa ser uma das seis permutacoes XYZ.");
  }
  return value as RotationOrder3D;
}

export function composeRotationMat4(rotationRadians: Vec3, order: RotationOrder3D): Mat4 {
  const rotation = copyVec3(rotationRadians, "rotationRadians");
  const normalizedOrder = requireRotationOrder(order);
  const axes: Readonly<Record<"X" | "Y" | "Z", Mat4>> = {
    X: rotationXMat4(rotation[0]),
    Y: rotationYMat4(rotation[1]),
    Z: rotationZMat4(rotation[2])
  };
  const matrices: Mat4[] = [];
  for (const axis of normalizedOrder) matrices.push(axes[axis as "X" | "Y" | "Z"]);
  return composeMat4InApplicationOrder(matrices);
}

export function invertMat4(
  matrix: Mat4,
  singularEpsilon: number = DEFAULT_SINGULAR_EPSILON
): Mat4 {
  const source = copyMat4(matrix);
  return mat4FromResults(invertSquare(source, 4, singularEpsilon), "invertMat4");
}

export function transformPoint3D(matrix: Mat4, point: Vec3): Vec3 {
  const m = requireAffineMat4(matrix, "matrix");
  const p = copyVec3(point, "point");
  return vec3FromResults([
    m[0] * p[0] + m[1] * p[1] + m[2] * p[2] + m[3],
    m[4] * p[0] + m[5] * p[1] + m[6] * p[2] + m[7],
    m[8] * p[0] + m[9] * p[1] + m[10] * p[2] + m[11]
  ], "transformPoint3D");
}

export function transformVector3D(matrix: Mat4, vector: Vec3): Vec3 {
  const m = requireAffineMat4(matrix, "matrix");
  const v = copyVec3(vector, "vector");
  return vec3FromResults([
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[4] * v[0] + m[5] * v[1] + m[6] * v[2],
    m[8] * v[0] + m[9] * v[1] + m[10] * v[2]
  ], "transformVector3D");
}
