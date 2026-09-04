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
  validatePresetDefinitionV1 as validatePresetDefinitionV1Schema,
  validatePresetDefinitionV2 as validatePresetDefinitionV2Schema,
  validateRigMetadataV1
} from "./generated/schema-validators.js";
import type {
  PresetDefinition,
  PresetDefinitionV1,
  PresetJsonValue,
  PresetSignatureVerifier,
  PresetV1DowngradeOptions,
  PresetV2MigrationOptions
} from "./presets.js";
import type { CommandRequest, CommandResponse } from "./protocol.js";
import type { LiveControlBinding } from "./quick-profile.js";
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

function invalidResult<T>(
  issues: readonly ContractValidationIssue[]
): ContractValidationResult<T> {
  return {
    valid: false,
    issues: Object.freeze(
      issues.map((issue) =>
        Object.freeze({ path: issue.path, code: issue.code, message: issue.message })
      )
    )
  };
}

function customIssue(path: string, code: string, message: string): ContractValidationIssue {
  return { path, code, message };
}

function liveControlIssues(
  bindings: readonly LiveControlBinding[],
  basePath: string
): readonly ContractValidationIssue[] {
  const issues: ContractValidationIssue[] = [];
  const paramIds = new Set<string>();
  const orders = new Set<number>();
  let previousOrder: number | undefined;

  for (let index = 0; index < bindings.length; index += 1) {
    const binding = bindings[index]!;
    const path = `${basePath}/${index}`;

    if (paramIds.has(binding.paramId)) {
      issues.push(
        customIssue(
          `${path}/paramId`,
          "uniqueParamId",
          "paramId de Live Control precisa ser único"
        )
      );
    }
    paramIds.add(binding.paramId);

    if (orders.has(binding.order)) {
      issues.push(
        customIssue(`${path}/order`, "uniqueOrder", "order de Live Control precisa ser único")
      );
    }
    orders.add(binding.order);

    if (previousOrder !== undefined && binding.order <= previousOrder) {
      issues.push(
        customIssue(
          `${path}/order`,
          "orderSequence",
          "Live Controls precisam estar na ordem visual declarada"
        )
      );
    }
    previousOrder = binding.order;

    if (binding.min !== undefined && binding.max !== undefined && binding.min > binding.max) {
      issues.push(
        customIssue(`${path}/max`, "range", "max precisa ser maior ou igual a min")
      );
    }
    if (
      binding.softMin !== undefined &&
      binding.softMax !== undefined &&
      binding.softMin > binding.softMax
    ) {
      issues.push(
        customIssue(`${path}/softMax`, "range", "softMax precisa ser maior ou igual a softMin")
      );
    }
    if (
      binding.min !== undefined &&
      binding.softMin !== undefined &&
      binding.softMin < binding.min
    ) {
      issues.push(
        customIssue(`${path}/softMin`, "range", "softMin não pode ficar abaixo de min")
      );
    }
    if (
      binding.max !== undefined &&
      binding.softMin !== undefined &&
      binding.softMin > binding.max
    ) {
      issues.push(
        customIssue(`${path}/softMin`, "range", "softMin não pode ultrapassar max")
      );
    }
    if (
      binding.min !== undefined &&
      binding.softMax !== undefined &&
      binding.softMax < binding.min
    ) {
      issues.push(
        customIssue(`${path}/softMax`, "range", "softMax não pode ficar abaixo de min")
      );
    }
    if (
      binding.max !== undefined &&
      binding.softMax !== undefined &&
      binding.softMax > binding.max
    ) {
      issues.push(
        customIssue(`${path}/softMax`, "range", "softMax não pode ultrapassar max")
      );
    }

    if (binding.options) {
      const values = new Set<number>();
      for (let optionIndex = 0; optionIndex < binding.options.length; optionIndex += 1) {
        const option = binding.options[optionIndex]!;
        if (values.has(option.value)) {
          issues.push(
            customIssue(
              `${path}/options/${optionIndex}/value`,
              "uniqueValue",
              "valor de opção precisa ser único"
            )
          );
        }
        values.add(option.value);
      }
    }
  }

  return issues;
}

export function validatePresetDefinitionV1(
  value: unknown
): ContractValidationResult<PresetDefinitionV1> {
  return validateWith(validatePresetDefinitionV1Schema as StandaloneValidator, value);
}

export function isPresetDefinitionV1(value: unknown): value is PresetDefinitionV1 {
  return validatePresetDefinitionV1(value).valid;
}

export function validatePresetDefinition(
  value: unknown
): ContractValidationResult<PresetDefinition> {
  const result = validateWith<PresetDefinition>(
    validatePresetDefinitionV2Schema as StandaloneValidator,
    value
  );
  if (!result.valid) return result;

  const semanticIssues = result.value.quick
    ? liveControlIssues(result.value.quick.liveControls, "/quick/liveControls")
    : [];
  return semanticIssues.length > 0 ? invalidResult(semanticIssues) : result;
}

export function isPresetDefinition(value: unknown): value is PresetDefinition {
  return validatePresetDefinition(value).valid;
}

const EXECUTABLE_FIELD_NAMES = new Set([
  "code",
  "eval",
  "expression",
  "expressionbody",
  "expressionsource",
  "function",
  "javascript",
  "script",
  "scriptsource",
  "sourcecode"
]);

function executableFieldIssues(
  value: PresetJsonValue,
  path: string,
  issues: ContractValidationIssue[]
): void {
  if (typeof value === "string") {
    if (/^\s*javascript\s*:/i.test(value) || /<\s*script\b/i.test(value)) {
      issues.push(
        customIssue(path, "executableValue", "preset remoto não pode conter código executável")
      );
    }
    return;
  }
  if (value === null || typeof value !== "object") return;

  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      executableFieldIssues(value[index]!, `${path}/${index}`, issues);
    }
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}/${pointerToken(key)}`;
    const normalizedKey = key.toLowerCase().replace(/[^a-z]/g, "");
    if (EXECUTABLE_FIELD_NAMES.has(normalizedKey)) {
      issues.push(
        customIssue(
          childPath,
          "executableField",
          "preset remoto não pode declarar campo de código executável"
        )
      );
      continue;
    }
    executableFieldIssues(child, childPath, issues);
  }
}

/**
 * Gate estrutural e criptográfico de presets remotos.
 *
 * A assinatura não é aceita por mera presença: o loader precisa injetar o
 * verificador correspondente à chave confiável do canal atual.
 */
export function validateRemotePresetDefinition(
  value: unknown,
  verifySignature?: PresetSignatureVerifier
): ContractValidationResult<PresetDefinition> {
  const result = validatePresetDefinition(value);
  if (!result.valid) return result;

  const issues: ContractValidationIssue[] = [];
  if (!result.value.signature) {
    issues.push(
      customIssue("/signature", "required", "preset remoto precisa conter assinatura")
    );
  }

  executableFieldIssues(result.value.operationPlan, "/operationPlan", issues);
  for (let index = 0; index < result.value.controls.length; index += 1) {
    executableFieldIssues(result.value.controls[index]!, `/controls/${index}`, issues);
  }

  if (issues.length > 0) return invalidResult(issues);
  if (!verifySignature) {
    return invalidResult([
      customIssue(
        "/signature",
        "signatureVerifierRequired",
        "preset remoto exige verificador de assinatura confiável"
      )
    ]);
  }

  try {
    if (!verifySignature(result.value)) {
      return invalidResult([
        customIssue("/signature", "signatureInvalid", "assinatura do preset remoto é inválida")
      ]);
    }
  } catch {
    return invalidResult([
      customIssue(
        "/signature",
        "signatureVerificationFailed",
        "assinatura do preset remoto não pôde ser verificada"
      )
    ]);
  }

  return result;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function validateMigrationOptions(
  value: unknown
): ContractValidationResult<PresetV2MigrationOptions> {
  const snapshot = snapshotJson(value);
  if (!snapshot.ok) return invalidResult([snapshot.issue]);
  if (!isRecord(snapshot.value)) {
    return invalidResult([
      customIssue("", "type", "opções de migração precisam ser um objeto")
    ]);
  }

  const options = snapshot.value;
  const issues: ContractValidationIssue[] = [];
  const allowed = new Set(["preview", "quick", "checksum", "signature"]);
  for (const key of Object.keys(options)) {
    if (!allowed.has(key)) {
      issues.push(
        customIssue(`/${pointerToken(key)}`, "additionalProperties", "opção de migração desconhecida")
      );
    }
  }

  if (!isNonEmptyString(options["checksum"])) {
    issues.push(customIssue("/checksum", "type", "checksum v2 precisa ser uma string não vazia"));
  }
  if (options["signature"] !== undefined && !isNonEmptyString(options["signature"])) {
    issues.push(customIssue("/signature", "type", "signature precisa ser uma string não vazia"));
  }
  if (options["quick"] !== undefined && !isRecord(options["quick"])) {
    issues.push(customIssue("/quick", "type", "quick precisa ser um objeto"));
  }

  const preview = options["preview"];
  if (!isRecord(preview)) {
    issues.push(customIssue("/preview", "type", "preview de migração precisa ser um objeto"));
  } else {
    const previewAllowed = new Set(["poster", "loop", "fixtureId", "renderedAt", "checksum"]);
    for (const key of Object.keys(preview)) {
      if (!previewAllowed.has(key)) {
        issues.push(
          customIssue(
            `/preview/${pointerToken(key)}`,
            "additionalProperties",
            "campo de preview de migração desconhecido"
          )
        );
      }
    }
    for (const key of ["fixtureId", "renderedAt", "checksum"] as const) {
      if (!isNonEmptyString(preview[key])) {
        issues.push(
          customIssue(`/preview/${key}`, "type", `${key} precisa ser uma string não vazia`)
        );
      }
    }
    for (const key of ["poster", "loop"] as const) {
      if (preview[key] !== undefined && !isNonEmptyString(preview[key])) {
        issues.push(
          customIssue(`/preview/${key}`, "type", `${key} precisa ser uma string não vazia`)
        );
      }
    }
  }

  return issues.length > 0
    ? invalidResult(issues)
    : { valid: true, value: snapshot.value as unknown as PresetV2MigrationOptions, issues: [] };
}

/** Migra sem mutar o v1 e sem reutilizar checksum ou assinatura da versão anterior. */
export function migratePresetV1ToV2(
  value: unknown,
  migrationOptions: PresetV2MigrationOptions
): ContractValidationResult<PresetDefinition> {
  const legacyResult = validatePresetDefinitionV1(value);
  if (!legacyResult.valid) return legacyResult;

  const optionsResult = validateMigrationOptions(migrationOptions);
  if (!optionsResult.valid) return optionsResult;

  const legacy = legacyResult.value;
  const options = optionsResult.value;
  const staleIssues: ContractValidationIssue[] = [];
  if (options.checksum === legacy.checksum) {
    staleIssues.push(
      customIssue(
        "/checksum",
        "staleChecksum",
        "a representação v2 precisa de checksum recalculado"
      )
    );
  }
  if (
    options.signature !== undefined &&
    legacy.signature !== undefined &&
    options.signature === legacy.signature
  ) {
    staleIssues.push(
      customIssue(
        "/signature",
        "staleSignature",
        "a representação v2 não pode reutilizar a assinatura v1"
      )
    );
  }
  if (staleIssues.length > 0) return invalidResult(staleIssues);

  const poster = legacy.preview?.thumbnail ?? options.preview.poster;
  const loop = legacy.preview?.video ?? options.preview.loop;
  const candidate = {
    schemaVersion: 2,
    id: legacy.id,
    version: legacy.version,
    displayName: legacy.displayName,
    category: legacy.category,
    hosts: legacy.hosts,
    ...(legacy.minHostVersion !== undefined
      ? { minHostVersion: legacy.minHostVersion }
      : {}),
    requirements: legacy.requirements,
    controls: legacy.controls,
    operationPlan: legacy.operationPlan,
    ...(options.quick !== undefined ? { quick: options.quick } : {}),
    preview: {
      ...(poster !== undefined ? { poster } : {}),
      ...(loop !== undefined ? { loop } : {}),
      fixtureId: options.preview.fixtureId,
      renderedAt: options.preview.renderedAt,
      checksum: options.preview.checksum
    },
    checksum: options.checksum,
    ...(options.signature !== undefined ? { signature: options.signature } : {})
  };

  return validatePresetDefinition(candidate);
}

function validateDowngradeOptions(
  value: unknown
): ContractValidationResult<PresetV1DowngradeOptions> {
  const snapshot = snapshotJson(value);
  if (!snapshot.ok) return invalidResult([snapshot.issue]);
  if (!isRecord(snapshot.value)) {
    return invalidResult([
      customIssue("", "type", "opções de downgrade precisam ser um objeto")
    ]);
  }

  const options = snapshot.value;
  const issues: ContractValidationIssue[] = [];
  const allowed = new Set(["checksum", "signature", "includePreview"]);
  for (const key of Object.keys(options)) {
    if (!allowed.has(key)) {
      issues.push(
        customIssue(`/${pointerToken(key)}`, "additionalProperties", "opção de downgrade desconhecida")
      );
    }
  }
  if (!isNonEmptyString(options["checksum"])) {
    issues.push(customIssue("/checksum", "type", "checksum v1 precisa ser uma string não vazia"));
  }
  if (options["signature"] !== undefined && !isNonEmptyString(options["signature"])) {
    issues.push(customIssue("/signature", "type", "signature precisa ser uma string não vazia"));
  }
  if (options["includePreview"] !== undefined && typeof options["includePreview"] !== "boolean") {
    issues.push(customIssue("/includePreview", "type", "includePreview precisa ser booleano"));
  }

  return issues.length > 0
    ? invalidResult(issues)
    : { valid: true, value: snapshot.value as unknown as PresetV1DowngradeOptions, issues: [] };
}

/** Projeção de compatibilidade usada pelo teste de round-trip e por ferramentas de migração. */
export function downgradePresetV2ToV1(
  value: unknown,
  downgradeOptions: PresetV1DowngradeOptions
): ContractValidationResult<PresetDefinitionV1> {
  const currentResult = validatePresetDefinition(value);
  if (!currentResult.valid) return currentResult;

  const optionsResult = validateDowngradeOptions(downgradeOptions);
  if (!optionsResult.valid) return optionsResult;

  const current = currentResult.value;
  const options = optionsResult.value;
  const candidate = {
    schemaVersion: 1,
    id: current.id,
    version: current.version,
    displayName: current.displayName,
    category: current.category,
    hosts: current.hosts,
    ...(current.minHostVersion !== undefined
      ? { minHostVersion: current.minHostVersion }
      : {}),
    requirements: current.requirements,
    controls: current.controls,
    operationPlan: current.operationPlan,
    ...(options.includePreview !== false
      ? { preview: { thumbnail: current.preview.poster, video: current.preview.loop } }
      : {}),
    checksum: options.checksum,
    ...(options.signature !== undefined ? { signature: options.signature } : {})
  };

  return validatePresetDefinitionV1(candidate);
}
