export const MATRIX_ERROR_CODES = Object.freeze([
  "INVALID_DIMENSION",
  "NON_FINITE_INPUT",
  "NON_FINITE_RESULT",
  "SINGULAR_MATRIX",
  "INVALID_SINGULAR_EPSILON",
  "INVALID_TOLERANCE",
  "NON_AFFINE_MATRIX",
  "INVALID_TRANSFORM",
  "INVALID_ROTATION_ORDER",
  "INVALID_OPTIONS",
  "INVARIANT_VIOLATION"
] as const);

export type MatrixErrorCode = (typeof MATRIX_ERROR_CODES)[number];

/** Erro publico tipado. Nenhuma operacao retorna resultado matematico incerto. */
export class MatrixCoreError extends Error {
  readonly code: MatrixErrorCode;
  readonly details: Readonly<Record<string, unknown>> | undefined;

  constructor(
    code: MatrixErrorCode,
    message: string,
    details?: Readonly<Record<string, unknown>>
  ) {
    super(message);
    this.name = "MatrixCoreError";
    this.code = code;
    this.details = details;
  }
}

export function fail(
  code: MatrixErrorCode,
  message: string,
  details?: Readonly<Record<string, unknown>>
): never {
  throw new MatrixCoreError(code, message, details);
}
