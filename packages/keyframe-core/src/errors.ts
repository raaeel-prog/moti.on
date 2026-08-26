export const KEYFRAME_CORE_ERROR_CODES = Object.freeze([
  "NON_FINITE_NUMBER",
  "INVALID_SNAPSHOT",
  "UNSUPPORTED_SCHEMA_VERSION",
  "INVALID_DIMENSIONALITY",
  "INVALID_INTERPOLATION",
  "INVALID_TEMPORAL_EASE",
  "INVALID_SPATIAL_DATA",
  "KEYFRAME_ORDER_INVALID",
  "DUPLICATE_KEYFRAME_TIME",
  "KEYFRAME_CONFLICT",
  "INVALID_SERIALIZATION",
  "NON_CANONICAL_SERIALIZATION",
  "SERIALIZATION_TOO_LARGE",
  "INVALID_TOLERANCE",
  "INVALID_TIMEBASE",
  "INVALID_DROP_FRAME",
  "INVALID_ROUNDING_MODE",
  "INVALID_RESTORE_OPTIONS"
] as const);

export type KeyframeCoreErrorCode = (typeof KEYFRAME_CORE_ERROR_CODES)[number];

export class KeyframeCoreError extends Error {
  readonly code: KeyframeCoreErrorCode;
  readonly details: Readonly<Record<string, unknown>> | undefined;

  constructor(
    code: KeyframeCoreErrorCode,
    message: string,
    details?: Readonly<Record<string, unknown>>
  ) {
    super(message);
    this.name = "KeyframeCoreError";
    this.code = code;
    this.details = details === undefined ? undefined : Object.freeze({ ...details });
  }
}

export function fail(
  code: KeyframeCoreErrorCode,
  message: string,
  details?: Readonly<Record<string, unknown>>
): never {
  throw new KeyframeCoreError(code, message, details);
}
