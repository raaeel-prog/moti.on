import { fail } from "./errors.js";
import type { Mat3, Mat4, Vec2, Vec3 } from "./types.js";

const AFFINE_EPSILON = 1e-12;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function requireFinite(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail("NON_FINITE_INPUT", `${label} precisa ser um numero finito.`, { field: label });
  }
  return value;
}

export function requireFiniteResult(value: number, operation: string): number {
  if (!Number.isFinite(value)) {
    fail("NON_FINITE_RESULT", `${operation} produziu um resultado nao finito.`, { operation });
  }
  return value;
}

function requireArrayLength(value: unknown, length: number, label: string): readonly unknown[] {
  if (!Array.isArray(value) || value.length !== length) {
    fail("INVALID_DIMENSION", `${label} precisa conter exatamente ${length} componentes.`, {
      field: label,
      expected: length,
      received: Array.isArray(value) ? value.length : null
    });
  }
  return value;
}

export function copyVec2(value: unknown, label = "vec2"): Vec2 {
  const source = requireArrayLength(value, 2, label);
  return Object.freeze([
    requireFinite(source[0], `${label}[0]`),
    requireFinite(source[1], `${label}[1]`)
  ]);
}

export function copyVec3(value: unknown, label = "vec3"): Vec3 {
  const source = requireArrayLength(value, 3, label);
  return Object.freeze([
    requireFinite(source[0], `${label}[0]`),
    requireFinite(source[1], `${label}[1]`),
    requireFinite(source[2], `${label}[2]`)
  ]);
}

export function copyMat3(value: unknown, label = "mat3"): Mat3 {
  const source = requireArrayLength(value, 9, label);
  return Object.freeze([
    requireFinite(source[0], `${label}[0]`),
    requireFinite(source[1], `${label}[1]`),
    requireFinite(source[2], `${label}[2]`),
    requireFinite(source[3], `${label}[3]`),
    requireFinite(source[4], `${label}[4]`),
    requireFinite(source[5], `${label}[5]`),
    requireFinite(source[6], `${label}[6]`),
    requireFinite(source[7], `${label}[7]`),
    requireFinite(source[8], `${label}[8]`)
  ]);
}

export function copyMat4(value: unknown, label = "mat4"): Mat4 {
  const source = requireArrayLength(value, 16, label);
  return Object.freeze([
    requireFinite(source[0], `${label}[0]`),
    requireFinite(source[1], `${label}[1]`),
    requireFinite(source[2], `${label}[2]`),
    requireFinite(source[3], `${label}[3]`),
    requireFinite(source[4], `${label}[4]`),
    requireFinite(source[5], `${label}[5]`),
    requireFinite(source[6], `${label}[6]`),
    requireFinite(source[7], `${label}[7]`),
    requireFinite(source[8], `${label}[8]`),
    requireFinite(source[9], `${label}[9]`),
    requireFinite(source[10], `${label}[10]`),
    requireFinite(source[11], `${label}[11]`),
    requireFinite(source[12], `${label}[12]`),
    requireFinite(source[13], `${label}[13]`),
    requireFinite(source[14], `${label}[14]`),
    requireFinite(source[15], `${label}[15]`)
  ]);
}

export function mat3FromResults(values: readonly number[], operation: string): Mat3 {
  if (values.length !== 9) {
    fail("INVARIANT_VIOLATION", "Resultado Mat3 interno possui dimensao invalida.", { operation });
  }
  for (const value of values) requireFiniteResult(value, operation);
  return copyMat3(values, `${operation}.result`);
}

export function mat4FromResults(values: readonly number[], operation: string): Mat4 {
  if (values.length !== 16) {
    fail("INVARIANT_VIOLATION", "Resultado Mat4 interno possui dimensao invalida.", { operation });
  }
  for (const value of values) requireFiniteResult(value, operation);
  return copyMat4(values, `${operation}.result`);
}

export function vec2FromResults(values: readonly number[], operation: string): Vec2 {
  if (values.length !== 2) {
    fail("INVARIANT_VIOLATION", "Resultado Vec2 interno possui dimensao invalida.", { operation });
  }
  for (const value of values) requireFiniteResult(value, operation);
  return copyVec2(values, `${operation}.result`);
}

export function vec3FromResults(values: readonly number[], operation: string): Vec3 {
  if (values.length !== 3) {
    fail("INVARIANT_VIOLATION", "Resultado Vec3 interno possui dimensao invalida.", { operation });
  }
  for (const value of values) requireFiniteResult(value, operation);
  return copyVec3(values, `${operation}.result`);
}

function approximately(value: number, expected: number): boolean {
  return Math.abs(value - expected) <= AFFINE_EPSILON;
}

export function requireAffineMat3(value: unknown, label = "mat3"): Mat3 {
  const matrix = copyMat3(value, label);
  if (!approximately(matrix[6], 0) || !approximately(matrix[7], 0)
    || !approximately(matrix[8], 1)) {
    fail("NON_AFFINE_MATRIX", `${label} nao representa um transform afim 2D.`, { field: label });
  }
  return matrix;
}

export function requireAffineMat4(value: unknown, label = "mat4"): Mat4 {
  const matrix = copyMat4(value, label);
  if (!approximately(matrix[12], 0) || !approximately(matrix[13], 0)
    || !approximately(matrix[14], 0) || !approximately(matrix[15], 1)) {
    fail("NON_AFFINE_MATRIX", `${label} nao representa um transform afim 3D.`, { field: label });
  }
  return matrix;
}
