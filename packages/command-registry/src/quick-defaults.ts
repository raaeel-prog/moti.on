import type { HostId, QuickContext, QuickSelectionKind } from "@motion/contracts";

const CONTEXT_KEYS = new Set([
  "host",
  "hostVersion",
  "fps",
  "compWidth",
  "compHeight",
  "compDurationSeconds",
  "currentTimeSeconds",
  "workAreaStart",
  "workAreaDuration",
  "selectionCount",
  "selectionKinds",
  "selectionHasKeyframes",
  "selectionHasExpressions",
  "selectionIs3D",
  "averageLayerDurationSeconds",
  "existingRigIdsInSelection",
  "lastUsedPresetId"
]);

const OPTION_KEYS = new Set([
  "factoryPresetId",
  "availablePresetIds",
  "globalLastUsedPresetId",
  "preferredDurationSeconds",
  "preferredStaggerFrames"
]);

const SELECTION_KINDS = new Set<QuickSelectionKind>([
  "text",
  "shape",
  "av",
  "camera",
  "light",
  "null",
  "adjustment",
  "solid",
  "precomp"
]);

const HOSTS = new Set<HostId>(["after-effects", "premiere-pro"]);
const EPSILON = 1e-9;

export type QuickFrameRounding = "floor" | "nearest" | "ceil";
export type QuickAnimationMode = "modify-keyframes" | "create-expression";
export type QuickAxis = "x" | "y" | "z";
export type QuickPropertyTarget =
  | "source-text"
  | "scale"
  | "path"
  | "trim"
  | "position"
  | "opacity";
export type QuickRigIntent =
  | { readonly mode: "create" }
  | { readonly mode: "adjust"; readonly targetRigId: string }
  | { readonly mode: "ambiguous"; readonly rigIds: readonly string[] };

export interface QuickDefaultOptions {
  readonly factoryPresetId: string;
  /** Catálogo visível no tile. O fallback nunca escolhe um id fora desta lista. */
  readonly availablePresetIds: readonly string[];
  readonly globalLastUsedPresetId?: string;
  /** Default normativo: 1 segundo. */
  readonly preferredDurationSeconds?: number;
  /** Default normativo de Delay: 2 frames por item. */
  readonly preferredStaggerFrames?: number;
}

export interface QuickTimingDefaults {
  readonly startTimeSeconds: number;
  readonly durationSeconds: number;
  readonly durationFrames: number;
}

export interface QuickDerivedDefaults {
  readonly fps: number;
  readonly resolutionScale: number;
  readonly timing: QuickTimingDefaults;
  readonly staggerFrames: number;
  readonly propertyTargets: readonly QuickPropertyTarget[];
  readonly animationMode: QuickAnimationMode;
  readonly axes: readonly QuickAxis[];
  readonly rigIntent: QuickRigIntent;
  readonly presetId: string;
}

interface NormalizedQuickDefaultOptions {
  readonly factoryPresetId: string;
  readonly availablePresetIds: readonly string[];
  readonly globalLastUsedPresetId?: string;
  readonly preferredDurationSeconds: number;
  readonly preferredStaggerFrames: number;
}

function fail(path: string, message: string): never {
  throw new TypeError(`Quick defaults inválido em ${path}: ${message}`);
}

function contextFail(path: string, message: string): never {
  throw new TypeError(`QuickContext inválido em ${path}: ${message}`);
}

/**
 * Obtém somente propriedades de dados. Accessors são rejeitados antes de ler o
 * valor para que um contexto vindo do host não execute código durante o gate.
 */
function dataRecord(
  value: unknown,
  path: string,
  onFailure: (path: string, message: string) => never
): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return onFailure(path, "esperado objeto simples");
  }

  let prototype: object | null;
  let descriptors: PropertyDescriptorMap;
  try {
    prototype = Object.getPrototypeOf(value) as object | null;
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    return onFailure(path, "objeto hostil não pôde ser inspecionado");
  }
  if (prototype !== Object.prototype && prototype !== null) {
    return onFailure(path, "protótipo customizado não é permitido");
  }
  if (Object.getOwnPropertySymbols(descriptors).length > 0) {
    return onFailure(path, "propriedades Symbol não são permitidas");
  }

  const snapshot: Record<string, unknown> = {};
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (descriptor.get !== undefined || descriptor.set !== undefined) {
      return onFailure(`${path}.${key}`, "accessor não é permitido");
    }
    snapshot[key] = descriptor.value;
  }
  return snapshot;
}

function dataArray(
  value: unknown,
  path: string,
  onFailure: (path: string, message: string) => never
): readonly unknown[] {
  if (!Array.isArray(value)) return onFailure(path, "esperado array");

  let descriptors: Record<string, PropertyDescriptor>;
  try {
    descriptors = Object.getOwnPropertyDescriptors(value) as Record<string, PropertyDescriptor>;
  } catch {
    return onFailure(path, "array hostil não pôde ser inspecionado");
  }
  if (Object.getOwnPropertySymbols(descriptors).length > 0) {
    return onFailure(path, "propriedades Symbol não são permitidas");
  }

  const lengthDescriptor = descriptors["length"];
  if (
    !lengthDescriptor ||
    lengthDescriptor.get !== undefined ||
    lengthDescriptor.set !== undefined ||
    !Number.isSafeInteger(lengthDescriptor.value) ||
    lengthDescriptor.value < 0
  ) {
    return onFailure(`${path}.length`, "comprimento de array inválido");
  }
  const length = lengthDescriptor.value as number;
  const snapshot: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor) return onFailure(`${path}.${index}`, "array esparso não é permitido");
    if (descriptor.get !== undefined || descriptor.set !== undefined) {
      return onFailure(`${path}.${index}`, "accessor não é permitido");
    }
    snapshot.push(descriptor.value);
  }
  for (const key of Object.keys(descriptors)) {
    if (key === "length" || /^(0|[1-9][0-9]*)$/.test(key)) continue;
    return onFailure(`${path}.${key}`, "propriedade extra não é permitida em array");
  }
  return snapshot;
}

function exactKeys(
  value: Readonly<Record<string, unknown>>,
  allowed: ReadonlySet<string>,
  path: string,
  onFailure: (path: string, message: string) => never
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) onFailure(`${path}.${key}`, "campo desconhecido");
  }
}

function nonEmptyString(
  value: unknown,
  path: string,
  onFailure: (path: string, message: string) => never
): string {
  if (typeof value !== "string" || value.trim() === "") {
    return onFailure(path, "esperada string não vazia");
  }
  return value;
}

function finiteNumber(
  value: unknown,
  path: string,
  onFailure: (path: string, message: string) => never
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return onFailure(path, "esperado número finito");
  }
  return value;
}

function booleanValue(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") return contextFail(path, "esperado booleano");
  return value;
}

function snapshotQuickContext(value: unknown): Readonly<QuickContext> {
  const source = dataRecord(value, "QuickContext", contextFail);
  exactKeys(source, CONTEXT_KEYS, "QuickContext", contextFail);

  const host = source["host"];
  if (typeof host !== "string" || !HOSTS.has(host as HostId)) {
    contextFail("host", "host desconhecido");
  }
  const hostVersion = nonEmptyString(source["hostVersion"], "hostVersion", contextFail);

  const fps = finiteNumber(source["fps"], "fps", contextFail);
  if (fps <= 0) contextFail("fps", "precisa ser maior que zero");
  const compWidth = finiteNumber(source["compWidth"], "compWidth", contextFail);
  const compHeight = finiteNumber(source["compHeight"], "compHeight", contextFail);
  if (compWidth <= 0) contextFail("compWidth", "precisa ser maior que zero");
  if (compHeight <= 0) contextFail("compHeight", "precisa ser maior que zero");

  const compDurationSeconds = finiteNumber(
    source["compDurationSeconds"],
    "compDurationSeconds",
    contextFail
  );
  if (compDurationSeconds <= 0) {
    contextFail("compDurationSeconds", "precisa ser maior que zero");
  }
  const rawCurrentTime = finiteNumber(
    source["currentTimeSeconds"],
    "currentTimeSeconds",
    contextFail
  );
  if (rawCurrentTime < -EPSILON || rawCurrentTime > compDurationSeconds + EPSILON) {
    contextFail("currentTimeSeconds", "precisa estar dentro da composição");
  }
  const currentTimeSeconds = Math.min(compDurationSeconds, Math.max(0, rawCurrentTime));

  const workAreaStart = finiteNumber(source["workAreaStart"], "workAreaStart", contextFail);
  const workAreaDuration = finiteNumber(
    source["workAreaDuration"],
    "workAreaDuration",
    contextFail
  );
  if (workAreaStart < 0 || workAreaDuration < 0) {
    contextFail("workArea", "início e duração não podem ser negativos");
  }
  if (workAreaStart + workAreaDuration > compDurationSeconds + EPSILON) {
    contextFail("workArea", "não pode ultrapassar a composição");
  }

  const selectionCount = finiteNumber(source["selectionCount"], "selectionCount", contextFail);
  if (!Number.isInteger(selectionCount) || selectionCount < 0) {
    contextFail("selectionCount", "esperado inteiro maior ou igual a zero");
  }

  const rawKinds = dataArray(source["selectionKinds"], "selectionKinds", contextFail);
  const selectionKinds = rawKinds.map((kind, index) => {
    if (typeof kind !== "string" || !SELECTION_KINDS.has(kind as QuickSelectionKind)) {
      return contextFail(`selectionKinds.${index}`, "tipo de seleção desconhecido");
    }
    return kind as QuickSelectionKind;
  });

  const averageLayerDurationSeconds = finiteNumber(
    source["averageLayerDurationSeconds"],
    "averageLayerDurationSeconds",
    contextFail
  );
  if (averageLayerDurationSeconds < 0) {
    contextFail("averageLayerDurationSeconds", "não pode ser negativo");
  }

  const rawRigIds = dataArray(
    source["existingRigIdsInSelection"],
    "existingRigIdsInSelection",
    contextFail
  );
  const existingRigIdsInSelection = rawRigIds.map((rigId, index) =>
    nonEmptyString(rigId, `existingRigIdsInSelection.${index}`, contextFail)
  );

  const lastUsedPresetId =
    source["lastUsedPresetId"] === undefined
      ? undefined
      : nonEmptyString(source["lastUsedPresetId"], "lastUsedPresetId", contextFail);

  return Object.freeze({
    host: host as HostId,
    hostVersion,
    fps,
    compWidth,
    compHeight,
    compDurationSeconds,
    currentTimeSeconds,
    workAreaStart,
    workAreaDuration,
    selectionCount,
    selectionKinds: Object.freeze(selectionKinds) as QuickSelectionKind[],
    selectionHasKeyframes: booleanValue(
      source["selectionHasKeyframes"],
      "selectionHasKeyframes"
    ),
    selectionHasExpressions: booleanValue(
      source["selectionHasExpressions"],
      "selectionHasExpressions"
    ),
    selectionIs3D: booleanValue(source["selectionIs3D"], "selectionIs3D"),
    averageLayerDurationSeconds,
    existingRigIdsInSelection: Object.freeze(existingRigIdsInSelection) as string[],
    ...(lastUsedPresetId !== undefined ? { lastUsedPresetId } : {})
  });
}

function snapshotOptions(value: unknown): NormalizedQuickDefaultOptions {
  const source = dataRecord(value, "options", fail);
  exactKeys(source, OPTION_KEYS, "options", fail);

  const factoryPresetId = nonEmptyString(
    source["factoryPresetId"],
    "factoryPresetId",
    fail
  );
  const rawIds = dataArray(source["availablePresetIds"], "availablePresetIds", fail);
  if (rawIds.length === 0) fail("availablePresetIds", "esperado ao menos um preset");

  const seen = new Set<string>();
  const availablePresetIds = rawIds.map((value, index) => {
    const id = nonEmptyString(value, `availablePresetIds.${index}`, fail);
    if (seen.has(id)) fail(`availablePresetIds.${index}`, "id duplicado");
    seen.add(id);
    return id;
  });
  if (!seen.has(factoryPresetId)) {
    fail("factoryPresetId", "preset de fábrica não está disponível no catálogo");
  }

  const globalLastUsedPresetId =
    source["globalLastUsedPresetId"] === undefined
      ? undefined
      : nonEmptyString(source["globalLastUsedPresetId"], "globalLastUsedPresetId", fail);
  const preferredDurationSeconds =
    source["preferredDurationSeconds"] === undefined
      ? 1
      : finiteNumber(source["preferredDurationSeconds"], "preferredDurationSeconds", fail);
  if (preferredDurationSeconds <= 0) {
    fail("preferredDurationSeconds", "precisa ser maior que zero");
  }

  const preferredStaggerFrames =
    source["preferredStaggerFrames"] === undefined
      ? 2
      : finiteNumber(source["preferredStaggerFrames"], "preferredStaggerFrames", fail);
  if (!Number.isInteger(preferredStaggerFrames) || preferredStaggerFrames < 0) {
    fail("preferredStaggerFrames", "esperado inteiro maior ou igual a zero");
  }

  return Object.freeze({
    factoryPresetId,
    availablePresetIds: Object.freeze(availablePresetIds),
    ...(globalLastUsedPresetId !== undefined ? { globalLastUsedPresetId } : {}),
    preferredDurationSeconds,
    preferredStaggerFrames
  });
}

function roundFrames(value: number, rounding: QuickFrameRounding): number {
  if (rounding === "floor") return Math.floor(value);
  if (rounding === "ceil") return Math.ceil(value);
  return Math.round(value);
}

/** Converte tempo em frames sem assumir 24 ou 30 fps. */
export function quickSecondsToFrames(
  seconds: number,
  fps: number,
  rounding: QuickFrameRounding = "nearest"
): number {
  const safeSeconds = finiteNumber(seconds, "seconds", fail);
  const safeFps = finiteNumber(fps, "fps", fail);
  if (safeSeconds < 0) fail("seconds", "não pode ser negativo");
  if (safeFps <= 0) fail("fps", "precisa ser maior que zero");
  if (rounding !== "floor" && rounding !== "nearest" && rounding !== "ceil") {
    fail("rounding", "modo desconhecido");
  }

  const rawFrames = safeSeconds * safeFps;
  if (!Number.isFinite(rawFrames)) fail("frames", "conversão excedeu o limite numérico");
  const frames = roundFrames(rawFrames, rounding);
  if (!Number.isSafeInteger(frames)) fail("frames", "resultado não é um inteiro seguro");
  return frames === 0 ? 0 : frames;
}

/** Escala linear normativa baseada no menor lado de uma composição 1080. */
export function scaleQuickPixelsFrom1080(basePixels: number, context: QuickContext): number {
  const safeBase = finiteNumber(basePixels, "basePixels", fail);
  const safeContext = snapshotQuickContext(context);
  const scaled = safeBase * (Math.min(safeContext.compWidth, safeContext.compHeight) / 1080);
  if (!Number.isFinite(scaled)) fail("basePixels", "escala excedeu o limite numérico");
  return scaled === 0 ? 0 : scaled;
}

function choosePresetId(
  context: Readonly<QuickContext>,
  options: NormalizedQuickDefaultOptions
): string {
  const available = new Set(options.availablePresetIds);
  if (context.lastUsedPresetId && available.has(context.lastUsedPresetId)) {
    return context.lastUsedPresetId;
  }
  if (
    options.globalLastUsedPresetId !== undefined &&
    available.has(options.globalLastUsedPresetId)
  ) {
    return options.globalLastUsedPresetId;
  }
  return options.factoryPresetId;
}

/** Fallback A1.4: projeto → usuário global → preset de fábrica. */
export function resolveQuickPresetId(
  context: QuickContext,
  options: QuickDefaultOptions
): string {
  return choosePresetId(snapshotQuickContext(context), snapshotOptions(options));
}

function derivePropertyTargets(
  selectionKinds: readonly QuickSelectionKind[]
): readonly QuickPropertyTarget[] {
  const targets: QuickPropertyTarget[] = [];
  const seen = new Set<QuickPropertyTarget>();
  const append = (...candidates: readonly QuickPropertyTarget[]): void => {
    for (const candidate of candidates) {
      if (seen.has(candidate)) continue;
      seen.add(candidate);
      targets.push(candidate);
    }
  };

  for (const kind of selectionKinds) {
    if (kind === "text") append("source-text", "scale");
    if (kind === "shape") append("path", "trim");
    if (kind === "av") append("position", "opacity");
  }
  return Object.freeze(targets);
}

function deriveRigIntent(rigIds: readonly string[]): QuickRigIntent {
  const uniqueRigIds: string[] = [];
  const seen = new Set<string>();
  for (const rigId of rigIds) {
    if (seen.has(rigId)) continue;
    seen.add(rigId);
    uniqueRigIds.push(rigId);
  }

  if (uniqueRigIds.length === 0) return Object.freeze({ mode: "create" });
  if (uniqueRigIds.length === 1) {
    return Object.freeze({ mode: "adjust", targetRigId: uniqueRigIds[0]! });
  }
  return Object.freeze({
    mode: "ambiguous",
    rigIds: Object.freeze(uniqueRigIds)
  });
}

/**
 * Materializa somente sinais puros de contexto. A função não lê storage, host,
 * relógio ou globals; perfis concretos transformam este resultado em `TArgs`.
 */
export function deriveQuickDefaults(
  context: QuickContext,
  options: QuickDefaultOptions
): Readonly<QuickDerivedDefaults> {
  const safeContext = snapshotQuickContext(context);
  const safeOptions = snapshotOptions(options);

  const compositionRemaining = Math.max(
    0,
    safeContext.compDurationSeconds - safeContext.currentTimeSeconds
  );
  const selectionRemaining =
    safeContext.selectionCount > 0
      ? safeContext.averageLayerDurationSeconds
      : compositionRemaining;
  const availableSeconds = Math.max(
    0,
    Math.min(compositionRemaining, selectionRemaining)
  );
  const durationSeconds = Math.min(safeOptions.preferredDurationSeconds, availableSeconds);
  const desiredFrames = quickSecondsToFrames(durationSeconds, safeContext.fps);
  const availableFrames = quickSecondsToFrames(availableSeconds, safeContext.fps, "floor");
  const durationFrames = Math.min(desiredFrames, availableFrames);

  const staggerFrames =
    safeContext.selectionCount <= 1
      ? 0
      : Math.min(
          safeOptions.preferredStaggerFrames,
          Math.floor(durationFrames / (safeContext.selectionCount - 1))
        );

  const timing = Object.freeze({
    startTimeSeconds: safeContext.currentTimeSeconds,
    durationSeconds,
    durationFrames
  });
  const axes = Object.freeze(
    safeContext.selectionIs3D ? (["x", "y", "z"] as const) : (["x", "y"] as const)
  );

  return Object.freeze({
    fps: safeContext.fps,
    resolutionScale: Math.min(safeContext.compWidth, safeContext.compHeight) / 1080,
    timing,
    staggerFrames,
    propertyTargets: derivePropertyTargets(safeContext.selectionKinds),
    animationMode: safeContext.selectionHasKeyframes
      ? "modify-keyframes"
      : "create-expression",
    axes,
    rigIntent: deriveRigIntent(safeContext.existingRigIdsInSelection),
    presetId: choosePresetId(safeContext, safeOptions)
  });
}
