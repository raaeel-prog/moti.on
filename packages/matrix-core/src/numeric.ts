import { fail } from "./errors.js";
import type { Mat3, Mat4, NumericTolerance, Vec2, Vec3 } from "./types.js";
import { copyMat3, copyMat4, copyVec2, copyVec3, isRecord, requireFinite } from "./validation.js";

export const DEFAULT_TOLERANCE: Readonly<NumericTolerance> = Object.freeze({
  absolute: 1e-9,
  relative: 1e-9
});

export const DEFAULT_SINGULAR_EPSILON = 1e-12;

export function normalizeTolerance(value: unknown = DEFAULT_TOLERANCE): Readonly<NumericTolerance> {
  if (!isRecord(value)) {
    fail("INVALID_TOLERANCE", "Tolerance precisa declarar absolute e relative.");
  }
  const absolute = value.absolute;
  const relative = value.relative;
  if (typeof absolute !== "number" || !Number.isFinite(absolute) || absolute < 0
    || typeof relative !== "number" || !Number.isFinite(relative) || relative < 0) {
    fail("INVALID_TOLERANCE", "Tolerance aceita somente limites finitos e nao negativos.");
  }
  return Object.freeze({ absolute, relative });
}

export function approximatelyEqual(
  left: number,
  right: number,
  tolerance: NumericTolerance = DEFAULT_TOLERANCE
): boolean {
  const a = requireFinite(left, "left");
  const b = requireFinite(right, "right");
  const normalized = normalizeTolerance(tolerance);
  return approximatelyEqualUnchecked(a, b, normalized);
}

export function approximatelyEqualUnchecked(
  left: number,
  right: number,
  tolerance: Readonly<NumericTolerance>
): boolean {
  const difference = Math.abs(left - right);
  const scale = Math.max(Math.abs(left), Math.abs(right));
  return difference <= tolerance.absolute + tolerance.relative * scale;
}

function arrayApproximatelyEqual(
  left: readonly number[],
  right: readonly number[],
  tolerance: Readonly<NumericTolerance>
): boolean {
  for (let index = 0; index < left.length; index += 1) {
    if (!approximatelyEqualUnchecked(left[index]!, right[index]!, tolerance)) return false;
  }
  return true;
}

export function vec2ApproximatelyEqual(
  left: Vec2,
  right: Vec2,
  tolerance: NumericTolerance = DEFAULT_TOLERANCE
): boolean {
  return arrayApproximatelyEqual(
    copyVec2(left, "left"),
    copyVec2(right, "right"),
    normalizeTolerance(tolerance)
  );
}

export function vec3ApproximatelyEqual(
  left: Vec3,
  right: Vec3,
  tolerance: NumericTolerance = DEFAULT_TOLERANCE
): boolean {
  return arrayApproximatelyEqual(
    copyVec3(left, "left"),
    copyVec3(right, "right"),
    normalizeTolerance(tolerance)
  );
}

export function mat3ApproximatelyEqual(
  left: Mat3,
  right: Mat3,
  tolerance: NumericTolerance = DEFAULT_TOLERANCE
): boolean {
  return arrayApproximatelyEqual(
    copyMat3(left, "left"),
    copyMat3(right, "right"),
    normalizeTolerance(tolerance)
  );
}

export function mat4ApproximatelyEqual(
  left: Mat4,
  right: Mat4,
  tolerance: NumericTolerance = DEFAULT_TOLERANCE
): boolean {
  return arrayApproximatelyEqual(
    copyMat4(left, "left"),
    copyMat4(right, "right"),
    normalizeTolerance(tolerance)
  );
}
