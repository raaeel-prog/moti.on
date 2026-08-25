/** Falhas fechadas e acionáveis do formato de metadata gerenciada. */
export const RIG_METADATA_ERROR_CODES = [
  "INVALID_JSON_VALUE",
  "INVALID_UTF8",
  "INVALID_BASE64URL",
  "NON_CANONICAL_JSON",
  "LEGACY_FORMAT_UNSUPPORTED",
  "UNKNOWN_FORMAT_VERSION",
  "DUPLICATE_BLOCK",
  "ORPHAN_DELIMITER",
  "BLOCK_ALREADY_EXISTS",
  "BLOCK_NOT_FOUND",
  "MALFORMED_BLOCK",
  "INTEGRITY_MISMATCH",
  "UNKNOWN_SCHEMA_VERSION",
  "INVALID_METADATA",
  "RIG_ID_MISMATCH",
  "INVALID_SIZE_LIMIT",
  "COMMENT_CAPACITY_EXCEEDED",
  "SIDECAR_PAYLOAD_REQUIRED",
  "MIGRATION_NOT_AVAILABLE",
  "AMBIGUOUS_MIGRATION",
  "MIGRATION_FAILED"
] as const;

export type RigMetadataErrorCode = (typeof RIG_METADATA_ERROR_CODES)[number];

export class RigMetadataError extends Error {
  readonly code: RigMetadataErrorCode;
  readonly details: Readonly<Record<string, unknown>> | undefined;

  constructor(
    code: RigMetadataErrorCode,
    message: string,
    details?: Readonly<Record<string, unknown>>
  ) {
    super(message);
    this.name = "RigMetadataError";
    this.code = code;
    this.details = details;
  }
}

export function fail(
  code: RigMetadataErrorCode,
  message: string,
  details?: Readonly<Record<string, unknown>>
): never {
  throw new RigMetadataError(code, message, details);
}
