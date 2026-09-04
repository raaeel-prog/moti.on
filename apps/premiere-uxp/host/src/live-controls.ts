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
  CompoundAction,
  PremiereColor,
  PremiereComponent,
  PremiereComponentParam,
  PremiereComponentValue,
  PremiereModule,
  PremiereProject,
  PremiereSequence,
  PremiereTickTime,
  PremiereTrackItemSelection,
  PremiereVideoClipTrackItem
} from "./premiere-api.js";
import { withTransaction } from "./transaction.js";

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
  readonly controls: readonly Omit<PremiereLiveControlSnapshot, "value">[];
}

export interface PremiereLiveControlsReadResult extends PremiereLiveControlsInspection {
  readonly controls: readonly PremiereLiveControlSnapshot[];
  readonly fingerprint: string;
}

export interface PremiereLiveControlsUpdateResult extends PremiereLiveControlsReadResult {
  readonly changed: boolean;
  readonly transaction: Readonly<{ executed: true; actionCount: number }> | null;
}

export interface PremiereLiveControlsTarget {
  readonly trackItem: PremiereVideoClipTrackItem | null;
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
    code: "INVALID_PRESET" | "HOST_OPERATION_FAILED",
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
  bindings.forEach((binding, index) => {
    const path = `bindings.${index}`;
    if (!isRecord(binding)) invalid(path, "esperado objeto");
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

