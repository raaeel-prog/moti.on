/**
 * Ponte de Live Controls do Premiere Pro (CHMS-UX-007).
 *
 * O UXP não oferece Expression Controls equivalentes aos do After Effects. Este
 * módulo só usa parâmetros que já existem em um MOGRT/efeito aplicado. Como
 * `ComponentParam` não expõe `paramId`, um manifesto versionado da suíte mapeia
 * a identidade lógica para matchName, ordem, índice e rótulo. O runtime valida
 * todo esse mapa antes de associar ou alterar qualquer valor.
 *
 * A inserção do MOGRT continua no CHMS-045: `SequenceEditor` documenta inserção
 * direta, mas não uma Action componível com as demais alterações do comando.
 */
import type { LiveControlBinding, QuickLocalizedText } from "@motion/contracts";

import type {
  PremiereAction,
  PremiereColor,
  PremiereComponentParam,
  PremiereComponentValue,
  PremiereModule,
  PremiereProject,
  PremiereSequence,
  PremiereTickTime,
  PremiereTrackItemSelection,
  PremiereVideoClipTrackItem
} from "./premiere-api.js";

export const PREMIERE_CONTROLS_UNSUPPORTED_MESSAGE = Object.freeze({
  "pt-BR": "Neste host os parâmetros ficam no Essential Graphics do item aplicado.",
  "en-US": "In this host, parameters remain in Essential Graphics for the applied item."
});

export type PremiereLiveControlSlotRole = "value" | "x" | "y";

export interface PremiereLiveControlSlotManifest {
  readonly paramIndex: number;
  readonly role: PremiereLiveControlSlotRole;
  readonly displayName: QuickLocalizedText;
}

export interface PremiereLiveControlManifestEntry {
  readonly paramId: string;
  readonly order: number;
  readonly label: QuickLocalizedText;
  readonly slots: readonly PremiereLiveControlSlotManifest[];
}

export interface PremiereLiveControlManifest {
  readonly schemaVersion: 1;
  readonly templateId: string;
  readonly templateVersion: string;
  readonly component: {
    readonly matchName: string;
    /** Dica de desempenho; nunca substitui a conferência por matchName. */
    readonly indexHint?: number;
  };
  readonly controls: readonly PremiereLiveControlManifestEntry[];
}

export type PremiereLiveControlValue = number | boolean | readonly number[];

export interface PremiereLiveControlSnapshot {
  readonly paramId: string;
  readonly order: number;
  readonly label: string;
  readonly value: PremiereLiveControlValue;
  readonly animated: boolean;
}

export type PremiereLiveControlsUnsupportedReason =
  | "project-missing"
  | "track-item-missing"
  | "manifest-missing"
  | "component-chain-unavailable"
  | "component-not-found"
  | "component-ambiguous"
  | "parameter-missing"
  | "parameter-label-mismatch"
  | "parameter-read-api-unavailable"
  | "parameter-write-api-unavailable"
  | "parameter-value-incompatible"
  | "color-factory-unavailable"
  | "transaction-api-unavailable"
  | "animated-parameter"
  | "target-changed"
  | "selection-api-unavailable"
  | "host-query-failed";

export interface PremiereLiveControlsUnsupported {
  readonly supported: false;
  readonly code: "CONTROLS_HOST_UNSUPPORTED";
  readonly message: string;
  readonly action: Readonly<{ id: "reveal-item"; enabled: boolean }>;
  readonly details: Readonly<{
    reason: PremiereLiveControlsUnsupportedReason;
    templateId?: string;
    paramId?: string;
    paramIndex?: number;
    componentIndex?: number;
  }>;
}

export interface PremiereLiveControlsInspection {
  readonly supported: true;
  readonly templateId: string;
  readonly templateVersion: string;
  readonly componentIndex: number;
  readonly controls: readonly Pick<PremiereLiveControlSnapshot, "paramId" | "order" | "label">[];
}

export interface PremiereLiveControlsReadResult extends PremiereLiveControlsInspection {
  readonly controls: readonly PremiereLiveControlSnapshot[];
  readonly fingerprint: string;
}

export interface PremiereLiveControlsUpdateResult extends PremiereLiveControlsReadResult {
  readonly changed: boolean;
  readonly transaction: Readonly<{ executed: true; actionCount: number }> | null;
  /** Valores limitados/quantizados pelo host, que o Inspector deve sinalizar. */
  readonly adjustedParamIds: readonly string[];
}

export interface PremiereLiveControlsTarget {
  readonly trackItem: PremiereVideoClipTrackItem | null;
  /** Necessária para habilitar a ação de selecionar o item no fallback. */
  readonly sequence?: PremiereSequence | null;
  readonly bindings: readonly LiveControlBinding[];
  readonly manifest: PremiereLiveControlManifest | null;
  readonly locale: string;
}

export interface PremiereLiveControlsReadInput extends PremiereLiveControlsTarget {
  readonly time: PremiereTickTime;
}

export interface PremiereLiveControlsUpdateInput extends PremiereLiveControlsReadInput {
  readonly values: Readonly<Record<string, unknown>>;
  readonly undoLabel: string;
  /** Snapshot lido ao abrir Adjust; divergência externa exige uma nova leitura. */
  readonly expectedFingerprint: string;
}

export interface PremiereLiveControlsRevealInput {
  readonly sequence: PremiereSequence | null;
  readonly trackItem: PremiereVideoClipTrackItem | null;
  readonly locale: string;
}

export type PremiereLiveControlsRevealResult =
  | Readonly<{ revealed: true }>
  | PremiereLiveControlsUnsupported;

export class PremiereLiveControlsError extends Error {
  readonly code: "INVALID_PRESET" | "HOST_OPERATION_FAILED";
  readonly details: unknown;

  constructor(
    code: PremiereLiveControlsError["code"],
    message: string,
    details: unknown = null
  ) {
    super(message);
    this.name = "PremiereLiveControlsError";
    this.code = code;
    this.details = details;
  }
}

interface PreparedControl {
  readonly binding: LiveControlBinding;
  readonly manifest: PremiereLiveControlManifestEntry;
}

interface PreparedTarget {
  readonly manifest: PremiereLiveControlManifest;
  readonly controls: readonly PreparedControl[];
}

interface ResolvedControl extends PreparedControl {
  readonly params: readonly PremiereComponentParam[];
}

interface ResolvedTarget {
  readonly componentIndex: number;
  readonly controls: readonly ResolvedControl[];
}

const CONTROL_KINDS = new Set([
  "slider",
  "angle",
  "color",
  "checkbox",
  "point",
  "dropdown"
]);

// Pedidos simultâneos do mesmo projeto não podem comparar o mesmo snapshot e
// ambos sobrescrever o resultado; filas liberam também quando a operação falha.
const updatesByProject = new WeakMap<PremiereProject, Promise<void>>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function invalid(path: string, message: string): never {
  throw new PremiereLiveControlsError(
    "INVALID_PRESET",
    `Live Controls Premiere inválido em ${path}: ${message}`,
    { path }
  );
}

function validateLocalizedText(value: unknown, path: string): QuickLocalizedText {
  if (!isRecord(value)) invalid(path, "esperado objeto localizado");
  if (!nonEmptyString(value["pt-BR"]) || !nonEmptyString(value["en-US"])) {
    invalid(path, "pt-BR e en-US são obrigatórios");
  }
  return value as QuickLocalizedText;
}

function localized(value: QuickLocalizedText, locale: string): string {
  return locale === "pt-BR" || locale.toLowerCase().startsWith("pt-")
    ? value["pt-BR"]
    : value["en-US"];
}

function labelsInclude(value: QuickLocalizedText, actual: string): boolean {
  return value["pt-BR"] === actual || value["en-US"] === actual;
}

function validateBindings(bindings: readonly LiveControlBinding[]): void {
  if (!Array.isArray(bindings) || bindings.length === 0) {
    invalid("bindings", "esperado ao menos um LiveControlBinding");
  }

  const ids = new Set<string>();
  const orders = new Set<number>();
  let previousOrder = -1;
  bindings.forEach((candidate: LiveControlBinding, index: number) => {
    const binding: LiveControlBinding = candidate;
    const path = `bindings.${index}`;
    if (!isRecord(binding as unknown)) invalid(path, "esperado objeto");
    if (
      !nonEmptyString(binding.paramId) ||
      !/^[A-Za-z0-9._-]+$/.test(binding.paramId) ||
      ["__proto__", "prototype", "constructor"].includes(binding.paramId)
    ) {
      invalid(`${path}.paramId`, "identificador inválido");
    }
    if (ids.has(binding.paramId)) invalid(`${path}.paramId`, "identificador duplicado");
    if (!Number.isSafeInteger(binding.order) || binding.order < 0) {
      invalid(`${path}.order`, "esperado inteiro não negativo");
    }
    if (orders.has(binding.order) || binding.order <= previousOrder) {
      invalid(`${path}.order`, "ordem precisa ser única e crescente");
    }
    if (!CONTROL_KINDS.has(binding.control)) invalid(`${path}.control`, "tipo desconhecido");
    validateLocalizedText(binding.label, `${path}.label`);
    if (
      binding.control === "dropdown" &&
      (!Array.isArray(binding.options) || binding.options.length === 0)
    ) {
      invalid(`${path}.options`, "dropdown exige opções");
    }
    ids.add(binding.paramId);
    orders.add(binding.order);
    previousOrder = binding.order;
  });
}

/** Copia somente dados JSON próprios; accessors nunca são executados no gate. */
function copyData(value: unknown, path: string, depth = 0): unknown {
  if (depth > 12) invalid(path, "estrutura profunda demais");
  if (value === null || ["string", "boolean", "undefined"].includes(typeof value)) return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) invalid(path, "número precisa ser finito");
    return value;
  }
  if (typeof value !== "object") invalid(path, "esperados dados simples");
  const array = Array.isArray(value);
  const prototype: unknown = Object.getPrototypeOf(value);
  if (!array && prototype !== Object.prototype && prototype !== null) {
    invalid(path, "protótipo customizado");
  }
  if (Object.getOwnPropertySymbols(value).length) invalid(path, "Symbol não permitido");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const result: Record<string, unknown> = {};
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (array && key === "length") continue;
    if (!Object.hasOwn(descriptor, "value")) invalid(`${path}.${key}`, "accessor não permitido");
    if (["__proto__", "prototype", "constructor"].includes(key)) invalid(path, "chave inválida");
    result[key] = copyData(descriptor.value, `${path}.${key}`, depth + 1);
  }
  if (!array) return result;
  if (value.length > 256 || Object.keys(result).length !== value.length) {
    invalid(path, "array inválido ou excede 256 itens");
  }
  return Array.from({ length: value.length }, (_, index) => {
    if (!Object.hasOwn(result, String(index))) invalid(path, "array esparso");
    return result[String(index)];
  });
}

function prepareTarget(input: PremiereLiveControlsTarget): PreparedTarget {
  const bindings = copyData(input.bindings, "bindings") as LiveControlBinding[];
  const manifest = copyData(input.manifest, "manifest") as PremiereLiveControlManifest;
  validateBindings(bindings);
  if (!isRecord(manifest as unknown)) invalid("manifest", "esperado objeto");
  if (manifest.schemaVersion !== 1) invalid("manifest.schemaVersion", "versão não suportada");
  if (!nonEmptyString(manifest.templateId) || !nonEmptyString(manifest.templateVersion)) {
    invalid("manifest", "templateId e templateVersion obrigatórios");
  }
  if (!isRecord(manifest.component) || !nonEmptyString(manifest.component.matchName)) {
    invalid("manifest.component", "matchName obrigatório");
  }
  const hint = manifest.component.indexHint;
  if (hint !== undefined && (!Number.isSafeInteger(hint) || hint < 0)) {
    invalid("manifest.component.indexHint", "esperado inteiro não negativo");
  }
  if (!Array.isArray(manifest.controls) || manifest.controls.length !== bindings.length) {
    invalid("manifest.controls", "quantidade diverge do binding");
  }
  let lastIndex = -1;
  const controls = bindings.map((binding, index) => {
    const entry: PremiereLiveControlManifestEntry = manifest.controls[index]!;
    const path = `manifest.controls.${index}`;
    if (!isRecord(entry as unknown)) invalid(path, "esperado objeto");
    if (entry.paramId !== binding.paramId) invalid(`${path}.paramId`, "diverge do binding");
    if (entry.order !== binding.order) invalid(`${path}.order`, "diverge do binding");
    const label = validateLocalizedText(entry.label, `${path}.label`);
    if (label["pt-BR"] !== binding.label["pt-BR"] || label["en-US"] !== binding.label["en-US"]) {
      invalid(`${path}.label`, "diverge do binding");
    }
    const roles = binding.control === "point" ? ["x", "y"] : ["value"];
    if (!Array.isArray(entry.slots) || entry.slots.length !== roles.length) {
      invalid(`${path}.slots`, `esperado ${roles.join("+")}`);
    }
    entry.slots.forEach((slot: PremiereLiveControlSlotManifest, slotIndex: number) => {
      if (!isRecord(slot as unknown)) invalid(`${path}.slots`, "esperado objeto");
      if (!Number.isSafeInteger(slot.paramIndex) || slot.paramIndex <= lastIndex) {
        invalid(`${path}.slots.${slotIndex}`, "índices precisam ser únicos e crescentes");
      }
      if (slot.role !== roles[slotIndex]) invalid(`${path}.slots.${slotIndex}.role`, "papel inválido");
      validateLocalizedText(slot.displayName, `${path}.slots.${slotIndex}.displayName`);
      // Um controle simples deve apresentar no host o próprio rótulo do binding.
      if (slot.role === "value" && (slot.displayName["pt-BR"] !== label["pt-BR"] ||
          slot.displayName["en-US"] !== label["en-US"])) invalid(path, "rótulo físico divergente");
      lastIndex = slot.paramIndex;
    });
    if (binding.control === "dropdown") {
      const values = binding.options!.map((option, optionIndex) => {
        const optionPath = `bindings.${index}.options.${optionIndex}`;
        if (!isRecord(option as unknown)) invalid(optionPath, "esperado objeto");
        validateLocalizedText(option.label, `${optionPath}.label`);
        return option.value;
      });
      if (!values.every(finiteNumber) || new Set(values).size !== values.length) {
        invalid(`bindings.${index}.options`, "valores precisam ser finitos e únicos");
      }
    }
    return { binding, manifest: entry };
  });
  return { manifest, controls };
}

function normalizeValue(binding: LiveControlBinding, value: unknown): PremiereLiveControlValue {
  const path = `values.${binding.paramId}`;
  if (binding.control === "color" || binding.control === "point") {
    const count = binding.control === "color" ? 4 : 2;
    if (!Array.isArray(value) || value.length !== count || !value.every(finiteNumber)) {
      invalid(path, `esperado vetor de ${count} números finitos`);
    }
    if (binding.control === "color" && !value.every((v: number) => v >= 0 && v <= 1)) {
      invalid(path, "cor precisa estar entre 0 e 1");
    }
    return Object.freeze([...value] as number[]);
  }
  if (binding.control === "checkbox") {
    if (value === true || value === 1) return true;
    if (value === false || value === 0) return false;
    invalid(path, "checkbox aceita boolean, 0 ou 1");
  }
  if (!finiteNumber(value)) invalid(path, "esperado número finito");
  if (binding.control === "dropdown" && !binding.options?.some((o) => o.value === value)) {
    invalid(path, "valor ausente no dropdown");
  }
  return value;
}

function sameValue(a: PremiereLiveControlValue, b: PremiereLiveControlValue): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function fingerprint(prepared: PreparedTarget, controls: readonly PremiereLiveControlSnapshot[]): string {
  const source = JSON.stringify([prepared.manifest, controls.map(({ paramId, order, value, animated }) => ({ paramId, order, value, animated }))]);
  let hash = 2166136261;
  for (let i = 0; i < source.length; i += 1) hash = Math.imul(hash ^ source.charCodeAt(i), 16777619);
  return `prlc1:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function validateTime(time: PremiereTickTime): void {
  if (!time || !finiteNumber(time.seconds) || !/^-?\d+$/.test(time.ticks)) {
    invalid("time", "TickTime explícito obrigatório, no domínio temporal do parâmetro");
  }
}

/** Serviço por operação/projeto: o consumidor resolve o item novamente a cada pedido. */
export function createPremiereLiveControls(premiere: PremiereModule, project: PremiereProject | null) {
  function unsupported(
    input: Pick<PremiereLiveControlsTarget, "locale" | "trackItem" | "sequence">,
    reason: PremiereLiveControlsUnsupportedReason,
    details: Omit<PremiereLiveControlsUnsupported["details"], "reason"> = {},
    revealEnabled = Boolean(input.trackItem && typeof input.sequence?.setSelection === "function" &&
      typeof premiere.TrackItemSelection?.createEmptySelection === "function")
  ): PremiereLiveControlsUnsupported {
    return {
      supported: false, code: "CONTROLS_HOST_UNSUPPORTED",
      message: localized(PREMIERE_CONTROLS_UNSUPPORTED_MESSAGE, input.locale),
      action: { id: "reveal-item", enabled: revealEnabled }, details: { reason, ...details }
    };
  }

  async function resolve(input: PremiereLiveControlsTarget, prepared: PreparedTarget) {
    const templateId = prepared.manifest.templateId;
    if (!project) return unsupported(input, "project-missing", { templateId }, false);
    if (!input.trackItem) return unsupported(input, "track-item-missing", { templateId }, false);
    if (typeof input.trackItem.getComponentChain !== "function") {
      return unsupported(input, "component-chain-unavailable", { templateId });
    }
    try {
      const chain = await input.trackItem.getComponentChain();
      if (!chain || typeof chain.getComponentCount !== "function" ||
          typeof chain.getComponentAtIndex !== "function") {
        return unsupported(input, "component-chain-unavailable", { templateId });
      }
      const count = chain.getComponentCount();
      if (!Number.isSafeInteger(count) || count < 0 || count > 256) {
        return unsupported(input, "component-chain-unavailable", { templateId });
      }
      // Mesmo quando indexHint coincide, procurar duplicatas: matchName identifica
      // o tipo de componente, não uma instância particular na pilha de efeitos.
      const indices: number[] = [];
      for (let index = 0; index < count; index += 1) {
        const component = chain.getComponentAtIndex(index);
        if (typeof component?.getMatchName !== "function") {
          return unsupported(input, "component-chain-unavailable", { templateId });
        }
        if (await component.getMatchName() === prepared.manifest.component.matchName) indices.push(index);
      }
      if (indices.length !== 1) {
        return unsupported(input, indices.length ? "component-ambiguous" : "component-not-found", { templateId });
      }
      const componentIndex = indices[0]!;
      const component = chain.getComponentAtIndex(componentIndex);
      if (typeof component?.getParamCount !== "function" || typeof component.getParam !== "function") {
        return unsupported(input, "parameter-missing", { templateId, componentIndex });
      }
      const paramCount = component.getParamCount();
      const controls: ResolvedControl[] = [];
      for (const control of prepared.controls) {
        const params: PremiereComponentParam[] = [];
        for (const slot of control.manifest.slots) {
          const details = { templateId, componentIndex, paramId: control.binding.paramId, paramIndex: slot.paramIndex };
          if (!Number.isSafeInteger(paramCount) || slot.paramIndex >= paramCount) {
            return unsupported(input, "parameter-missing", details);
          }
          const param = component.getParam(slot.paramIndex);
          if (!param) return unsupported(input, "parameter-missing", details);
          if (!labelsInclude(slot.displayName, param.displayName)) {
            return unsupported(input, "parameter-label-mismatch", details);
          }
          if (typeof param.getValueAtTime !== "function" || typeof param.isTimeVarying !== "function") {
            return unsupported(input, "parameter-read-api-unavailable", details);
          }
          params.push(param);
        }
        controls.push({ ...control, params });
      }
      return { componentIndex, controls, chain, component, count, paramCount };
    } catch {
      return unsupported(input, "host-query-failed", { templateId });
    }
  }

  async function readResolved(input: PremiereLiveControlsReadInput, prepared: PreparedTarget, resolved: ResolvedTarget) {
    try {
      const controls: PremiereLiveControlSnapshot[] = [];
      for (const control of resolved.controls) {
        const raw = await Promise.all(control.params.map((param) => param.getValueAtTime(input.time)));
        let value: unknown = raw[0];
        if (control.binding.control === "point") value = raw;
        if (control.binding.control === "color") {
          const color = value as PremiereColor | undefined;
          value = color && [color.red, color.green, color.blue, color.alpha];
        }
        try {
          controls.push({ paramId: control.binding.paramId, order: control.binding.order,
            label: localized(control.binding.label, input.locale), value: normalizeValue(control.binding, value),
            animated: control.params.some((param) => param.isTimeVarying()) });
        } catch {
          return unsupported(input, "parameter-value-incompatible", { templateId: prepared.manifest.templateId,
            paramId: control.binding.paramId });
        }
      }
      return { supported: true as const, templateId: prepared.manifest.templateId,
        templateVersion: prepared.manifest.templateVersion, componentIndex: resolved.componentIndex,
        controls, fingerprint: fingerprint(prepared, controls) };
    } catch {
      throw new PremiereLiveControlsError("HOST_OPERATION_FAILED", "Falha ao ler parâmetros no Premiere.",
        { phase: "read", mutationAttempted: false });
    }
  }

  async function inspect(input: PremiereLiveControlsTarget): Promise<PremiereLiveControlsInspection | PremiereLiveControlsUnsupported> {
    if (!input.manifest) return unsupported(input, "manifest-missing");
    const prepared = prepareTarget(input);
    const resolved = await resolve(input, prepared);
    if ("supported" in resolved) return resolved;
    return { supported: true, templateId: prepared.manifest.templateId,
      templateVersion: prepared.manifest.templateVersion, componentIndex: resolved.componentIndex,
      controls: prepared.controls.map(({ binding }) => ({ paramId: binding.paramId,
        order: binding.order, label: localized(binding.label, input.locale) })) };
  }

  async function read(input: PremiereLiveControlsReadInput): Promise<PremiereLiveControlsReadResult | PremiereLiveControlsUnsupported> {
    if (!input.manifest) return unsupported(input, "manifest-missing");
    validateTime(input.time);
    const prepared = prepareTarget(input);
    const resolved = await resolve(input, prepared);
    if ("supported" in resolved) return resolved;
    return readResolved(input, prepared, resolved);
  }

  async function update(input: PremiereLiveControlsUpdateInput): Promise<PremiereLiveControlsUpdateResult | PremiereLiveControlsUnsupported> {
    if (!input.manifest) return unsupported(input, "manifest-missing");
    validateTime(input.time);
    const prepared = prepareTarget(input);
    const values = copyData(input.values, "values");
    if (!isRecord(values) || !Object.keys(values).length) invalid("values", "esperado objeto não vazio");
    if (!nonEmptyString(input.undoLabel) || input.undoLabel.length > 160) invalid("undoLabel", "rótulo obrigatório");
    const requested = new Map<string, PremiereLiveControlValue>();
    for (const [paramId, value] of Object.entries(values)) {
      const control = prepared.controls.find((entry) => entry.binding.paramId === paramId);
      if (!control) invalid(`values.${paramId}`, "paramId não declarado");
      requested.set(paramId, normalizeValue(control.binding, value));
    }
    if (typeof input.expectedFingerprint !== "string" || !/^prlc1:[0-9a-f]{8}$/.test(input.expectedFingerprint)) {
      invalid("expectedFingerprint", "fingerprint inválido");
    }
    if (!project || typeof project.lockedAccess !== "function" || typeof project.executeTransaction !== "function") {
      return unsupported(input, project ? "transaction-api-unavailable" : "project-missing");
    }
    const resolved = await resolve(input, prepared);
    if ("supported" in resolved) return resolved;
    const current = await readResolved(input, prepared, resolved);
    if (!current.supported) return current;
    if (input.expectedFingerprint !== current.fingerprint) {
      throw new PremiereLiveControlsError("HOST_OPERATION_FAILED", "Os controles foram editados no projeto. Leia novamente antes de ajustar.",
        { phase: "preflight", reason: "fingerprint-conflict", mutationAttempted: false });
    }
    const changed = resolved.controls.filter(({ binding }) => {
      const next = requested.get(binding.paramId);
      return next !== undefined && !sameValue(next, current.controls.find((c) => c.paramId === binding.paramId)!.value);
    });
    if (!changed.length) return { ...current, changed: false, transaction: null, adjustedParamIds: [] };
    // Fazemos o gate de todos os parâmetros antes de abrir qualquer transação.
    for (const control of changed) {
      if (control.binding.control === "color" && typeof premiere.Color !== "function") {
        return unsupported(input, "color-factory-unavailable");
      }
      for (const param of control.params) {
        try {
          if (param.isTimeVarying()) {
            // A API de setValue só aceita streams estáticos. Alterar keys existentes
            // precisa de política explícita de tempo/interpolação do renderer.
            return unsupported(input, "animated-parameter", { paramId: control.binding.paramId });
          }
          if (typeof param.createKeyframe !== "function" || typeof param.createSetValueAction !== "function") {
            return unsupported(input, "parameter-write-api-unavailable", { paramId: control.binding.paramId });
          }
        } catch {
          return unsupported(input, "host-query-failed", { paramId: control.binding.paramId });
        }
      }
    }
    let actionCount = 0;
    let executed = false;
    let targetChanged = false;
    try {
      project.lockedAccess(() => {
        // A parte síncrona é relida sob lock: não reutilizar ComponentParam que
        // atravessou o await de getValueAtTime. Mudança estrutural aborta o commit.
        const component = resolved.chain.getComponentAtIndex(resolved.componentIndex);
        // Identidade referencial é somente um gate conservador desta operação,
        // não metadata persistente. Wrappers diferentes exigem nova resolução;
        // nunca aceitar outro componente só por ter a mesma contagem/rótulos.
        if (resolved.chain.getComponentCount() !== resolved.count || component !== resolved.component ||
            component.getParamCount() !== resolved.paramCount) {
          targetChanged = true;
          return;
        }
        const writes = changed.flatMap((control) => {
          const value = requested.get(control.binding.paramId)!;
          return control.manifest.slots.map((slot, index) => {
            const param = component.getParam(slot.paramIndex);
            if (!labelsInclude(slot.displayName, param.displayName) || param.isTimeVarying()) {
              throw new Error("parameter-changed");
            }
            let hostValue: PremiereComponentValue;
            if (control.binding.control === "point") hostValue = (value as readonly number[])[index]!;
            else if (control.binding.control === "color") {
              const channels = value as readonly number[];
              hostValue = new premiere.Color!(channels[0], channels[1], channels[2], channels[3]);
            } else hostValue = value as number | boolean;
            return { param, hostValue };
          });
        });
        executed = project.executeTransaction((compound) => {
          // Criar todas antes de acumular; nenhuma Action sai do callback.
          const actions: PremiereAction[] = writes.map(({ param, hostValue }) => {
            const keyframe = param.createKeyframe(hostValue);
            return param.createSetValueAction(keyframe, true);
          });
          for (const action of actions) {
            if (!compound.addAction(action)) throw new Error("addAction-rejected");
            actionCount += 1;
          }
          if (compound.empty) throw new Error("empty-transaction");
        }, input.undoLabel);
      });
      if (targetChanged) return unsupported(input, "target-changed");
      if (!executed) throw new Error("transaction-rejected");
    } catch {
      throw new PremiereLiveControlsError("HOST_OPERATION_FAILED", "O Premiere recusou a transação de Live Controls.",
        { phase: "transaction", mutationAttempted: true, actionCount, recovery: "check-undo-history" });
    }
    // Retorna o que o host realmente reteve (incluindo clamp/quantização).
    // Falha aqui pode ocorrer DEPOIS do commit e não deve incentivar retry cego.
    try {
      const fresh = await resolve(input, prepared);
      if ("supported" in fresh) throw new Error("post-write-unavailable");
      const observed = await readResolved(input, prepared, fresh);
      if (!observed.supported) throw new Error("post-write-incompatible");
      const changedInHost = observed.controls.some((c, i) => requested.has(c.paramId) && !sameValue(c.value, current.controls[i]!.value));
      if (!changedInHost) throw new Error("host-did-not-apply");
      return { ...observed, changed: true, transaction: { executed: true, actionCount },
        adjustedParamIds: observed.controls.filter((c) => requested.has(c.paramId) &&
          !sameValue(c.value, requested.get(c.paramId)!)).map((c) => c.paramId) };
    } catch {
      throw new PremiereLiveControlsError("HOST_OPERATION_FAILED", "A transação executou, mas o resultado não pôde ser confirmado no host.",
        { phase: "post-write", mutationAttempted: true, transactionExecuted: true, recovery: "check-undo-history" });
    }
  }

  async function reveal(input: PremiereLiveControlsRevealInput): Promise<PremiereLiveControlsRevealResult> {
    const { sequence, trackItem } = input;
    const factory = premiere.TrackItemSelection;
    if (!sequence || !trackItem || typeof sequence.setSelection !== "function" ||
        typeof factory?.createEmptySelection !== "function") {
      return unsupported(input, "selection-api-unavailable", {}, false);
    }
    try {
      let selection: PremiereTrackItemSelection | null = null;
      const created = factory.createEmptySelection((candidate) => {
        if (candidate.addItem(trackItem) === true) selection = candidate;
      });
      if (!created || !selection || await sequence.setSelection(selection) !== true) throw new Error("selection-rejected");
      // Seleciona o item na sequência. Nenhuma API promete abrir/focar Essential Graphics.
      return { revealed: true };
    } catch {
      throw new PremiereLiveControlsError("HOST_OPERATION_FAILED", "O Premiere não conseguiu selecionar o item aplicado.");
    }
  }

  function enqueueUpdate(input: PremiereLiveControlsUpdateInput) {
    // O chamador pode reutilizar/mudar o payload enquanto aguardamos a fila.
    let snapshot: PremiereLiveControlsUpdateInput;
    try {
      snapshot = { ...input, bindings: copyData(input.bindings, "bindings") as LiveControlBinding[],
        manifest: copyData(input.manifest, "manifest") as PremiereLiveControlManifest | null,
        values: copyData(input.values, "values") as Record<string, unknown> };
    } catch (error) { return Promise.reject(error); }
    if (!project) return update(snapshot);
    const result = (updatesByProject.get(project) ?? Promise.resolve()).then(() => update(snapshot));
    updatesByProject.set(project, result.then(() => undefined, () => undefined));
    return result;
  }

  return Object.freeze({ inspect, read, update: enqueueUpdate, reveal });
}
