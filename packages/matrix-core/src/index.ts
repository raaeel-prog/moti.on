/**
 * CHMS-010: nucleo matematico puro para transforms 2D/3D.
 *
 * Nao conhece CEP, ExtendScript, UXP ou objetos Adobe. Adapters convertem os
 * valores do host para este contrato antes de qualquer mutacao.
 */

export const MATRIX_CONVENTION = Object.freeze({
  storage: "row-major",
  vectors: "column",
  multiplication: "left-times-right; right operand is applied first",
  composition: "arguments are applied first-to-last",
  parentChain: "root-to-immediate-parent",
  angles: "radians",
  scale: "unitless-factor",
  transform2D: "T(position) * R(rotation) * S(scale) * T(-anchor)",
  transform3D: "T(position) * R(application-order) * S(scale) * T(-anchor)"
} as const);

export {
  MATRIX_ERROR_CODES,
  MatrixCoreError,
  type MatrixErrorCode
} from "./errors.js";

export {
  DEFAULT_SINGULAR_EPSILON,
  DEFAULT_TOLERANCE,
  approximatelyEqual,
  mat3ApproximatelyEqual,
  mat4ApproximatelyEqual,
  vec2ApproximatelyEqual,
  vec3ApproximatelyEqual
} from "./numeric.js";

export {
  composeMat3InApplicationOrder,
  identityMat3,
  invertMat3,
  mat3,
  multiplyMat3,
  rotationMat3,
  scaleMat3,
  transformPoint2D,
  transformVector2D,
  translationMat3,
  vec2
} from "./matrix2d.js";

export {
  composeMat4InApplicationOrder,
  composeRotationMat4,
  identityMat4,
  invertMat4,
  mat4,
  multiplyMat4,
  rotationXMat4,
  rotationYMat4,
  rotationZMat4,
  scaleMat4,
  transformPoint3D,
  transformVector3D,
  translationMat4,
  vec3
} from "./matrix3d.js";

export {
  composeTransform2D,
  composeTransform3D,
  worldMatrix2D,
  worldMatrix3D
} from "./transforms.js";

export { compensateAnchor2D, compensateAnchor3D } from "./anchor.js";

export type {
  AnchorCompensation2D,
  AnchorCompensation3D,
  AnchorCompensationOptions2D,
  AnchorCompensationOptions3D,
  Mat3,
  Mat4,
  NumericTolerance,
  RotationOrder3D,
  Transform2D,
  Transform3D,
  Vec2,
  Vec3
} from "./types.js";
