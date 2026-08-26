import { fail } from "./errors.js";
import {
  composeMat3InApplicationOrder,
  rotationMat3,
  scaleMat3,
  transformVector2D
} from "./matrix2d.js";
import {
  composeRotationMat4,
  composeMat4InApplicationOrder,
  scaleMat4,
  transformVector3D
} from "./matrix3d.js";
import {
  DEFAULT_TOLERANCE,
  mat3ApproximatelyEqual,
  mat4ApproximatelyEqual,
  normalizeTolerance
} from "./numeric.js";
import {
  composeTransform2D,
  composeTransform3D,
  normalizeTransform2D,
  normalizeTransform3D,
  worldMatrix2D,
  worldMatrix3D
} from "./transforms.js";
import type {
  AnchorCompensation2D,
  AnchorCompensation3D,
  AnchorCompensationOptions2D,
  AnchorCompensationOptions3D,
  Mat3,
  Mat4,
  NumericTolerance,
  Transform2D,
  Transform3D
} from "./types.js";
import { copyVec2, copyVec3, isRecord, vec2FromResults, vec3FromResults } from "./validation.js";

interface NormalizedOptions2D {
  readonly parentsRootToImmediate: readonly Mat3[];
  readonly tolerance: Readonly<NumericTolerance>;
}

interface NormalizedOptions3D {
  readonly parentsRootToImmediate: readonly Mat4[];
  readonly tolerance: Readonly<NumericTolerance>;
}

function optionKeysAreValid(options: Record<string, unknown>): boolean {
  return Object.keys(options).every(
    (key) => key === "parentsRootToImmediate" || key === "tolerance"
  );
}

function normalizeOptions2D(value: unknown): NormalizedOptions2D {
  if (value === undefined) {
    return { parentsRootToImmediate: Object.freeze([]), tolerance: DEFAULT_TOLERANCE };
  }
  if (!isRecord(value) || !optionKeysAreValid(value)) {
    fail("INVALID_OPTIONS", "Options de compensacao 2D possuem shape invalido.");
  }
  const parents = value.parentsRootToImmediate === undefined
    ? Object.freeze([]) as readonly Mat3[]
    : value.parentsRootToImmediate;
  if (!Array.isArray(parents)) {
    fail("INVALID_OPTIONS", "parentsRootToImmediate precisa ser um array de Mat3.");
  }
  return {
    parentsRootToImmediate: parents as readonly Mat3[],
    tolerance: normalizeTolerance(value.tolerance ?? DEFAULT_TOLERANCE)
  };
}

function normalizeOptions3D(value: unknown): NormalizedOptions3D {
  if (value === undefined) {
    return { parentsRootToImmediate: Object.freeze([]), tolerance: DEFAULT_TOLERANCE };
  }
  if (!isRecord(value) || !optionKeysAreValid(value)) {
    fail("INVALID_OPTIONS", "Options de compensacao 3D possuem shape invalido.");
  }
  const parents = value.parentsRootToImmediate === undefined
    ? Object.freeze([]) as readonly Mat4[]
    : value.parentsRootToImmediate;
  if (!Array.isArray(parents)) {
    fail("INVALID_OPTIONS", "parentsRootToImmediate precisa ser um array de Mat4.");
  }
  return {
    parentsRootToImmediate: parents as readonly Mat4[],
    tolerance: normalizeTolerance(value.tolerance ?? DEFAULT_TOLERANCE)
  };
}

export function compensateAnchor2D(
  transform: Transform2D,
  nextAnchor: Transform2D["anchor"],
  options?: AnchorCompensationOptions2D
): AnchorCompensation2D {
  const before = normalizeTransform2D(transform);
  const anchor = copyVec2(nextAnchor, "nextAnchor");
  const normalizedOptions = normalizeOptions2D(options);
  const delta = vec2FromResults([
    anchor[0] - before.anchor[0],
    anchor[1] - before.anchor[1]
  ], "compensateAnchor2D.delta");
  const linear = composeMat3InApplicationOrder([
    scaleMat3(before.scale),
    rotationMat3(before.rotationRadians)
  ]);
  const offset = transformVector2D(linear, delta);
  const after: Readonly<Transform2D> = Object.freeze({
    position: vec2FromResults([
      before.position[0] + offset[0],
      before.position[1] + offset[1]
    ], "compensateAnchor2D.position"),
    anchor,
    scale: before.scale,
    rotationRadians: before.rotationRadians
  });
  const beforeWorldMatrix = worldMatrix2D(
    composeTransform2D(before),
    normalizedOptions.parentsRootToImmediate
  );
  const afterWorldMatrix = worldMatrix2D(
    composeTransform2D(after),
    normalizedOptions.parentsRootToImmediate
  );
  if (!mat3ApproximatelyEqual(
    beforeWorldMatrix,
    afterWorldMatrix,
    normalizedOptions.tolerance
  )) {
    fail("INVARIANT_VIOLATION", "A compensacao 2D nao preservou o transform world na tolerancia.");
  }
  return Object.freeze({ transform: after, beforeWorldMatrix, afterWorldMatrix });
}

export function compensateAnchor3D(
  transform: Transform3D,
  nextAnchor: Transform3D["anchor"],
  options?: AnchorCompensationOptions3D
): AnchorCompensation3D {
  const before = normalizeTransform3D(transform);
  const anchor = copyVec3(nextAnchor, "nextAnchor");
  const normalizedOptions = normalizeOptions3D(options);
  const delta = vec3FromResults([
    anchor[0] - before.anchor[0],
    anchor[1] - before.anchor[1],
    anchor[2] - before.anchor[2]
  ], "compensateAnchor3D.delta");
  const linear = composeMat4InApplicationOrder([
    scaleMat4(before.scale),
    composeRotationMat4(before.rotationRadians, before.rotationOrder)
  ]);
  const offset = transformVector3D(linear, delta);
  const after: Readonly<Transform3D> = Object.freeze({
    position: vec3FromResults([
      before.position[0] + offset[0],
      before.position[1] + offset[1],
      before.position[2] + offset[2]
    ], "compensateAnchor3D.position"),
    anchor,
    scale: before.scale,
    rotationRadians: before.rotationRadians,
    rotationOrder: before.rotationOrder
  });
  const beforeWorldMatrix = worldMatrix3D(
    composeTransform3D(before),
    normalizedOptions.parentsRootToImmediate
  );
  const afterWorldMatrix = worldMatrix3D(
    composeTransform3D(after),
    normalizedOptions.parentsRootToImmediate
  );
  if (!mat4ApproximatelyEqual(
    beforeWorldMatrix,
    afterWorldMatrix,
    normalizedOptions.tolerance
  )) {
    fail("INVARIANT_VIOLATION", "A compensacao 3D nao preservou o transform world na tolerancia.");
  }
  return Object.freeze({ transform: after, beforeWorldMatrix, afterWorldMatrix });
}
