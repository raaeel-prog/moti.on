import { fail, type KeyframeCoreErrorCode } from "./errors.js";

export const DEFAULT_TIME_TOLERANCE_SECONDS = 1e-9;

type PlainRecord = Record<string, unknown>;

export function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;

  Object.freeze(value);
  for (const key of Object.keys(value)) {
    deepFreeze((value as Record<string, unknown>)[key]);
  }
  return value;
}

export function readPlainRecord(
  value: unknown,
  path: string,
  code: KeyframeCoreErrorCode = "INVALID_SNAPSHOT"
): PlainRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(code, `${path} must be a plain object.`, { path });
  }

  try {
    if (Object.getPrototypeOf(value) !== Object.prototype) {
      fail(code, `${path} must have the standard object prototype.`, { path });
    }
    if (Object.getOwnPropertySymbols(value).length !== 0) {
      fail(code, `${path} cannot contain symbol keys.`, { path });
    }

    const descriptors = Object.getOwnPropertyDescriptors(value);
    const result: PlainRecord = {};
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (!("value" in descriptor) || descriptor.get !== undefined || descriptor.set !== undefined) {
        fail(code, `${path}.${key} cannot be an accessor.`, { path: `${path}.${key}` });
      }
      if (!descriptor.enumerable) {
        fail(code, `${path}.${key} must be enumerable.`, { path: `${path}.${key}` });
      }
      result[key] = descriptor.value;
    }
    return result;
  } catch (error) {
    if (error instanceof Error && error.name === "KeyframeCoreError") throw error;
    fail(code, `${path} could not be inspected safely.`, { path });
  }
}

export function readPlainArray(
  value: unknown,
  path: string,
  code: KeyframeCoreErrorCode = "INVALID_SNAPSHOT"
): readonly unknown[] {
  if (!Array.isArray(value)) fail(code, `${path} must be an array.`, { path });

  try {
    if (Object.getPrototypeOf(value) !== Array.prototype) {
      fail(code, `${path} must have the standard array prototype.`, { path });
    }
    if (Object.getOwnPropertySymbols(value).length !== 0) {
      fail(code, `${path} cannot contain symbol keys.`, { path });
    }

    const names = Object.getOwnPropertyNames(value);
    if (names.length !== value.length + 1 || !names.includes("length")) {
      fail(code, `${path} cannot be sparse or contain custom fields.`, { path });
    }

    const copy: unknown[] = [];
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (
        descriptor === undefined ||
        !("value" in descriptor) ||
        descriptor.get !== undefined ||
        descriptor.set !== undefined ||
        !descriptor.enumerable
      ) {
        fail(code, `${path}[${index}] must be a regular array item.`, {
          path: `${path}[${index}]`
        });
      }
      copy.push(descriptor.value);
    }
    return copy;
  } catch (error) {
    if (error instanceof Error && error.name === "KeyframeCoreError") throw error;
    fail(code, `${path} could not be inspected safely.`, { path });
  }
}

export function assertExactKeys(
  record: PlainRecord,
  required: readonly string[],
  optional: readonly string[],
  path: string,
  code: KeyframeCoreErrorCode = "INVALID_SNAPSHOT"
): void {
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      fail(code, `${path} contains an unsupported field.`, { path: `${path}.${key}` });
    }
  }
  for (const key of required) {
    if (!Object.hasOwn(record, key)) {
      fail(code, `${path} is missing a required field.`, { path: `${path}.${key}` });
    }
  }
}

export function readFiniteNumber(value: unknown, path: string): number {
  if (typeof value !== "number") {
    fail("INVALID_SNAPSHOT", `${path} must be a number.`, { path });
  }
  if (!Number.isFinite(value)) {
    fail("NON_FINITE_NUMBER", `${path} must be finite.`, { path });
  }
  return Object.is(value, -0) ? 0 : value;
}

export function readBoolean(
  value: unknown,
  path: string,
  code: KeyframeCoreErrorCode = "INVALID_SNAPSHOT"
): boolean {
  if (typeof value !== "boolean") fail(code, `${path} must be a boolean.`, { path });
  return value;
}

export function readNonNegativeTolerance(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    fail("INVALID_TOLERANCE", `${path} must be a finite non-negative number.`, { path });
  }
  return Object.is(value, -0) ? 0 : value;
}

export function assertStrictlyOrderedTimes(
  times: readonly number[],
  tolerance: number,
  path: string
): void {
  for (let index = 1; index < times.length; index += 1) {
    const previous = times[index - 1];
    const current = times[index];
    if (previous === undefined || current === undefined) continue;
    const delta = current - previous;
    if (Math.abs(delta) <= tolerance) {
      fail("DUPLICATE_KEYFRAME_TIME", `${path} contains duplicate keyframe times.`, {
        path: `${path}[${index}]`,
        previousIndex: index - 1
      });
    }
    if (delta < 0) {
      fail("KEYFRAME_ORDER_INVALID", `${path} must be strictly ascending.`, {
        path: `${path}[${index}]`,
        previousIndex: index - 1
      });
    }
  }
}

export function canonicalStringify(value: unknown): string {
  const active = new Set<object>();

  function encode(current: unknown, path: string): string {
    if (current === null) return "null";
    if (typeof current === "string" || typeof current === "boolean") {
      return JSON.stringify(current);
    }
    if (typeof current === "number") {
      if (!Number.isFinite(current)) {
        fail("NON_FINITE_NUMBER", `${path} must be finite.`, { path });
      }
      return JSON.stringify(Object.is(current, -0) ? 0 : current);
    }
    if (typeof current !== "object") {
      fail("INVALID_SERIALIZATION", `${path} is not JSON representable.`, { path });
    }
    if (active.has(current)) {
      fail("INVALID_SERIALIZATION", `${path} contains a cycle.`, { path });
    }

    active.add(current);
    try {
      if (Array.isArray(current)) {
        const values = readPlainArray(current, path, "INVALID_SERIALIZATION");
        return `[${values.map((item, index) => encode(item, `${path}[${index}]`)).join(",")}]`;
      }

      const record = readPlainRecord(current, path, "INVALID_SERIALIZATION");
      const pairs = Object.keys(record)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${encode(record[key], `${path}.${key}`)}`);
      return `{${pairs.join(",")}}`;
    } finally {
      active.delete(current);
    }
  }

  return encode(value, "$input");
}
