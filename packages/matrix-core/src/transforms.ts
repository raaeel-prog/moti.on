import { fail } from "./errors.js";
import {
  composeMat3InApplicationOrder,
  identityMat3,
  multiplyMat3,
  rotationMat3,
  scaleMat3,
  translationMat3
} from "./matrix2d.js";
import {
  composeMat4InApplicationOrder,
  composeRotationMat4,
  identityMat4,
  multiplyMat4,
  requireRotationOrder,
  scaleMat4,
  translationMat4
} from "./matrix3d.js";
import type { Mat3, Mat4, Transform2D, Transform3D } from "./types.js";
import {
  copyVec2,
  copyVec3,
  isRecord,
  requireAffineMat3,
  requireAffineMat4,
  requireFinite
} from "./validation.js";

const TRANSFORM_2D_KEYS = new Set(["position", "anchor", "scale", "rotationRadians"]);
const TRANSFORM_3D_KEYS = new Set([
  "position", "anchor", "scale", "rotationRadians", "rotationOrder"
]);

function requireExactKeys(
  value: Record<string, unknown>,
  expected: ReadonlySet<string>,
  label: string
): void {
  const keys = Object.keys(value);
  if (keys.length !== expected.size || keys.some((key) => !expected.has(key))) {
    fail("INVALID_TRANSFORM", `${label} nao possui o shape exato esperado.`);
  }
}

export function normalizeTransform2D(value: unknown): Readonly<Transform2D> {
  if (!isRecord(value)) fail("INVALID_TRANSFORM", "Transform2D precisa ser um objeto.");
  requireExactKeys(value, TRANSFORM_2D_KEYS, "Transform2D");
  return Object.freeze({
    position: copyVec2(value.position, "position"),
    anchor: copyVec2(value.anchor, "anchor"),
    scale: copyVec2(value.scale, "scale"),
    rotationRadians: requireFinite(value.rotationRadians, "rotationRadians")
  });
}

export function normalizeTransform3D(value: unknown): Readonly<Transform3D> {
  if (!isRecord(value)) fail("INVALID_TRANSFORM", "Transform3D precisa ser um objeto.");
  requireExactKeys(value, TRANSFORM_3D_KEYS, "Transform3D");
  return Object.freeze({
    position: copyVec3(value.position, "position"),
    anchor: copyVec3(value.anchor, "anchor"),
    scale: copyVec3(value.scale, "scale"),
    rotationRadians: copyVec3(value.rotationRadians, "rotationRadians"),
    rotationOrder: requireRotationOrder(value.rotationOrder)
  });
}

export function composeTransform2D(transform: Transform2D): Mat3 {
  const normalized = normalizeTransform2D(transform);
  return composeMat3InApplicationOrder([
    translationMat3([-normalized.anchor[0], -normalized.anchor[1]]),
    scaleMat3(normalized.scale),
    rotationMat3(normalized.rotationRadians),
    translationMat3(normalized.position)
  ]);
}

export function composeTransform3D(transform: Transform3D): Mat4 {
  const normalized = normalizeTransform3D(transform);
  return composeMat4InApplicationOrder([
    translationMat4([
      -normalized.anchor[0],
      -normalized.anchor[1],
      -normalized.anchor[2]
    ]),
    scaleMat4(normalized.scale),
    composeRotationMat4(normalized.rotationRadians, normalized.rotationOrder),
    translationMat4(normalized.position)
  ]);
}

function requireParentChain(value: unknown): readonly unknown[] {
  if (!Array.isArray(value)) {
    fail("INVALID_OPTIONS", "parentsRootToImmediate precisa ser um array de matrices.");
  }
  return value;
}

export function worldMatrix2D(
  localMatrix: Mat3,
  parentsRootToImmediate: readonly Mat3[] = []
): Mat3 {
  const local = requireAffineMat3(localMatrix, "localMatrix");
  const parents = requireParentChain(parentsRootToImmediate);
  let parentWorld = identityMat3();
  for (let index = 0; index < parents.length; index += 1) {
    const parent = requireAffineMat3(parents[index], `parentsRootToImmediate[${index}]`);
    parentWorld = multiplyMat3(parentWorld, parent);
  }
  return multiplyMat3(parentWorld, local);
}

export function worldMatrix3D(
  localMatrix: Mat4,
  parentsRootToImmediate: readonly Mat4[] = []
): Mat4 {
  const local = requireAffineMat4(localMatrix, "localMatrix");
  const parents = requireParentChain(parentsRootToImmediate);
  let parentWorld = identityMat4();
  for (let index = 0; index < parents.length; index += 1) {
    const parent = requireAffineMat4(parents[index], `parentsRootToImmediate[${index}]`);
    parentWorld = multiplyMat4(parentWorld, parent);
  }
  return multiplyMat4(parentWorld, local);
}
