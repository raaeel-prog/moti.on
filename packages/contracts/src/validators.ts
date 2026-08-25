/**
 * Validadores profundos dos contratos que atravessam painel e host.
 *
 * O código que avalia JSON Schema é gerado no build pelo modo standalone do
 * Ajv. O runtime recebe apenas funções JavaScript comuns: nenhum schema é
 * compilado no painel e não há `eval`/`new Function`, mantendo a CSP fechada.
 */
import type { HostCapabilities } from "./capabilities.js";
import {
  validateCommandRequestV1,
  validateCommandResponseV1,
  validateHostCapabilitiesV1,
  validateRigMetadataV1
} from "./generated/schema-validators.js";
import type { CommandRequest, CommandResponse } from "./protocol.js";
import type { RigMetadata } from "./rig-metadata.js";

export const CONTRACT_SCHEMA_VERSION = 1 as const;

export interface ContractValidationIssue {
  /** JSON Pointer para o valor recusado; `""` representa a raiz. */
  readonly path: string;
  /** Keyword JSON Schema estável (`required`, `type`, `additionalProperties`...). */
  readonly code: string;
  /** Descrição diagnóstica sem copiar o valor recusado. */
  readonly message: string;
}

export type ContractValidationResult<T> =
  | { readonly valid: true; readonly value: T; readonly issues: readonly [] }
  | { readonly valid: false; readonly issues: readonly ContractValidationIssue[] };

interface StandaloneError {
  readonly instancePath?: string;
  readonly keyword?: string;
  readonly message?: string;
  readonly params?: Readonly<Record<string, unknown>>;
}

interface StandaloneValidator {
  (value: unknown): boolean;
  readonly errors?: readonly StandaloneError[] | null;
}

function pointerToken(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

function issuePath(error: StandaloneError): string {
  const base = error.instancePath ?? "";
  const missing = error.keyword === "required" ? error.params?.["missingProperty"] : undefined;
  const extra =
    error.keyword === "additionalProperties" ? error.params?.["additionalProperty"] : undefined;
  const property = typeof missing === "string" ? missing : typeof extra === "string" ? extra : null;
  return property === null ? base : `${base}/${pointerToken(property)}`;
}

function schemaIssues(validator: StandaloneValidator): readonly ContractValidationIssue[] {
  const errors = validator.errors ?? [];
  return Object.freeze(
    errors.map((error) =>
      Object.freeze({
        path: issuePath(error),
        code: error.keyword ?? "schema",
        message: error.message ?? "valor não atende ao contrato"
      })
    )
  );
}

type JsonSnapshot =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly issue: ContractValidationIssue };

function snapshotJson(value: unknown): JsonSnapshot {
  const active = new WeakSet<object>();
  let visitedNodes = 0;

  function failure(path: string, code: string, message: string): JsonSnapshot {
    return { ok: false, issue: { path, code, message } };
  }

  function hasSerializationHook(current: object): boolean {
    let cursor: object | null = current;
    while (cursor !== null) {
      if (Object.getOwnPropertyDescriptor(cursor, "toJSON")) return true;
      cursor = Object.getPrototypeOf(cursor) as object | null;
    }
    return false;
  }

  function visit(current: unknown, path: string, depth: number): JsonSnapshot {
    visitedNodes += 1;
    if (visitedNodes > 50_000) {
      return failure(path, "maxNodes", "estrutura JSON excede 50.000 valores");
    }
    if (current === null || typeof current === "string" || typeof current === "boolean") {
      return { ok: true, value: current };
    }
    if (typeof current === "number") {
      return Number.isFinite(current)
        ? { ok: true, value: current }
        : failure(path, "finite", "número precisa ser finito");
    }
    if (typeof current !== "object") {
      return failure(path, "jsonType", "valor não é serializável como JSON");
    }
    if (depth > 100) {
      return failure(path, "maxDepth", "estrutura JSON excede 100 níveis");
    }
    if (active.has(current)) {
      return failure(path, "cycle", "estrutura JSON contém ciclo");
    }

    try {
      const isArray = Array.isArray(current);
      const prototype = Object.getPrototypeOf(current) as object | null;
      if (
        (isArray && prototype !== Array.prototype) ||
        (!isArray && prototype !== Object.prototype && prototype !== null)
      ) {
        return failure(path, "plainObject", "objeto JSON precisa ser simples");
      }
      if (hasSerializationHook(current)) {
        return failure(path, "toJSON", "objeto JSON não pode definir hook toJSON");
      }

      // Esta é a única leitura das propriedades do objeto de entrada. A partir
      // daqui validamos e serializamos o snapshot, nunca o objeto vivo; assim um
      // Proxy não consegue trocar valores entre o gate e JSON.stringify.
      const descriptors = Object.getOwnPropertyDescriptors(current);
      active.add(current);

      for (const [key, descriptor] of Object.entries(descriptors)) {
        if (descriptor.enumerable && ("get" in descriptor || "set" in descriptor)) {
          return failure(
            `${path}/${pointerToken(key)}`,
            "accessor",
            "propriedade JSON não pode usar getter ou setter"
          );
        }
      }

      if (isArray) {
        const length = descriptors["length"]?.value;
        if (!Number.isSafeInteger(length) || length < 0) {
          return failure(path, "arrayLength", "array possui tamanho inválido");
        }
        const copy: unknown[] = new Array(length);
        for (let index = 0; index < length; index += 1) {
          const descriptor = descriptors[String(index)];
          if (!descriptor || !("value" in descriptor)) {
            return failure(`${path}/${index}`, "sparseArray", "array JSON não pode ter lacunas");
          }
          const child = visit(descriptor.value, `${path}/${index}`, depth + 1);
          if (!child.ok) return child;
          copy[index] = child.value;
        }
        return { ok: true, value: Object.freeze(copy) };
      }

      const copy: Record<string, unknown> = {};
      for (const [key, descriptor] of Object.entries(descriptors)) {
        if (!descriptor.enumerable) continue;
        if (!("value" in descriptor)) {
          return failure(
            `${path}/${pointerToken(key)}`,
            "accessor",
            "propriedade JSON não pode usar getter ou setter"
          );
        }
        const child = visit(descriptor.value, `${path}/${pointerToken(key)}`, depth + 1);
        if (!child.ok) return child;
        Object.defineProperty(copy, key, {
          value: child.value,
          enumerable: true,
          configurable: false,
          writable: false
        });
      }
      return { ok: true, value: Object.freeze(copy) };
    } catch {
      return failure(path, "objectAccess", "objeto não pôde ser inspecionado");
    } finally {
      active.delete(current);
    }
  }

  return visit(value, "", 0);
}

function validateWith<T>(
  validator: StandaloneValidator,
  value: unknown
): ContractValidationResult<T> {
  const snapshot = snapshotJson(value);
  if (!snapshot.ok) {
    return { valid: false, issues: Object.freeze([Object.freeze(snapshot.issue)]) };
  }

  try {
    if (validator(snapshot.value)) {
      return { valid: true, value: snapshot.value as T, issues: [] };
    }
    return { valid: false, issues: schemaIssues(validator) };
  } catch {
    return {
      valid: false,
      issues: Object.freeze([
        Object.freeze({
          path: "",
          code: "validationFailure",
          message: "valor não pôde ser validado com segurança"
        })
      ])
    };
  }
}

export function validateCommandRequest(value: unknown): ContractValidationResult<CommandRequest> {
  return validateWith(validateCommandRequestV1 as StandaloneValidator, value);
}

export function isCommandRequest(value: unknown): value is CommandRequest {
  return validateCommandRequest(value).valid;
}

export function validateCommandResponse(value: unknown): ContractValidationResult<CommandResponse> {
  return validateWith(validateCommandResponseV1 as StandaloneValidator, value);
}

export function isCommandResponseValue(value: unknown): value is CommandResponse {
  return validateCommandResponse(value).valid;
}

export function validateHostCapabilities(
  value: unknown
): ContractValidationResult<HostCapabilities> {
  return validateWith(validateHostCapabilitiesV1 as StandaloneValidator, value);
}

export function isHostCapabilities(value: unknown): value is HostCapabilities {
  return validateHostCapabilities(value).valid;
}

export function validateRigMetadata(value: unknown): ContractValidationResult<RigMetadata> {
  return validateWith(validateRigMetadataV1 as StandaloneValidator, value);
}

export function isRigMetadata(value: unknown): value is RigMetadata {
  return validateRigMetadata(value).valid;
}
