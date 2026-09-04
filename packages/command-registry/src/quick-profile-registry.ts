import type {
  HostId,
  LiveControlBinding,
  LiveControlKind,
  LiveControlOption,
  LiveControlTarget,
  LiveControlUnit,
  QuickLocalizedText,
  QuickProfile
} from "@motion/contracts";

import { COMMAND_DESCRIPTORS, type CommandDescriptor } from "./descriptors.js";

const CONTROL_KINDS = new Set<LiveControlKind>([
  "slider",
  "angle",
  "color",
  "checkbox",
  "point",
  "dropdown"
]);
const CONTROL_TARGETS = new Set<LiveControlTarget>([
  "layer",
  "controller",
  "comp-controller"
]);
const CONTROL_UNITS = new Set<LiveControlUnit>([
  "px",
  "%",
  "°",
  "fps",
  "frames",
  "s",
  "x",
  "none"
]);

function fail(path: string, message: string): never {
  throw new TypeError(`QuickProfile inválido em ${path}: ${message}`);
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return fail(path, "esperado objeto");
  }
  const prototype = Object.getPrototypeOf(value) as object | null;
  if (prototype !== Object.prototype && prototype !== null) {
    return fail(path, "esperado objeto simples");
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>, path: string): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail(`${path}.${key}`, "campo desconhecido");
  }
}

function nonEmptyString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    return fail(path, "esperada string não vazia");
  }
  return value;
}

function finiteNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fail(path, "esperado número finito");
  }
  return value;
}

function quickText(value: unknown, path: string): QuickLocalizedText {
  const source = record(value, path);
  exactKeys(source, new Set(["pt-BR", "en-US"]), path);
  return Object.freeze({
    "pt-BR": nonEmptyString(source["pt-BR"], `${path}.pt-BR`),
    "en-US": nonEmptyString(source["en-US"], `${path}.en-US`)
  });
}

function localizedText(value: unknown, path: string): Record<string, string> {
  const source = record(value, path);
  if (Object.keys(source).length === 0) fail(path, "esperado ao menos um locale");
  const copy: Record<string, string> = {};
  for (const [locale, label] of Object.entries(source)) {
    nonEmptyString(locale, `${path}.locale`);
    copy[locale] = nonEmptyString(label, `${path}.${locale}`);
  }
  return Object.freeze(copy);
}

function optionalNumber(
  source: Record<string, unknown>,
  key: string,
  path: string
): number | undefined {
  return source[key] === undefined ? undefined : finiteNumber(source[key], `${path}.${key}`);
}

function cloneOptions(value: unknown, path: string): LiveControlOption[] {
  if (!Array.isArray(value) || value.length === 0) {
    return fail(path, "esperado array não vazio");
  }
  const seenValues = new Set<number>();
  const options = value.map((candidate, index) => {
    const optionPath = `${path}.${index}`;
    const source = record(candidate, optionPath);
    exactKeys(source, new Set(["value", "label"]), optionPath);
    const optionValue = finiteNumber(source["value"], `${optionPath}.value`);
    if (seenValues.has(optionValue)) fail(`${optionPath}.value`, "valor duplicado");
    seenValues.add(optionValue);
    return Object.freeze({
      value: optionValue,
      label: localizedText(source["label"], `${optionPath}.label`)
    });
  });
  return Object.freeze(options) as unknown as LiveControlOption[];
}

function cloneBinding(value: unknown, index: number): LiveControlBinding {
  const path = `liveControls.${index}`;
  const source = record(value, path);
  exactKeys(
    source,
    new Set([
      "paramId",
      "label",
      "control",
      "target",
      "order",
      "unit",
      "min",
      "max",
      "softMin",
      "softMax",
      "step",
      "options",
      "help"
    ]),
    path
  );

  const control = source["control"];
  if (typeof control !== "string" || !CONTROL_KINDS.has(control as LiveControlKind)) {
    return fail(`${path}.control`, "tipo de controle desconhecido");
  }
  const target = source["target"];
  if (typeof target !== "string" || !CONTROL_TARGETS.has(target as LiveControlTarget)) {
    return fail(`${path}.target`, "alvo de controle desconhecido");
  }
  const order = finiteNumber(source["order"], `${path}.order`);
  if (!Number.isInteger(order) || order < 0) fail(`${path}.order`, "esperado inteiro >= 0");

  const unit = source["unit"];
  if (unit !== undefined && (typeof unit !== "string" || !CONTROL_UNITS.has(unit as LiveControlUnit))) {
    return fail(`${path}.unit`, "unidade desconhecida");
  }

  const min = optionalNumber(source, "min", path);
  const max = optionalNumber(source, "max", path);
  const softMin = optionalNumber(source, "softMin", path);
  const softMax = optionalNumber(source, "softMax", path);
  const step = optionalNumber(source, "step", path);
  if (step !== undefined && step <= 0) fail(`${path}.step`, "esperado número > 0");
  if (min !== undefined && max !== undefined && min > max) fail(`${path}.max`, "menor que min");
  if (softMin !== undefined && softMax !== undefined && softMin > softMax) {
    fail(`${path}.softMax`, "menor que softMin");
  }
  if (min !== undefined && softMin !== undefined && softMin < min) {
    fail(`${path}.softMin`, "menor que min");
  }
  if (max !== undefined && softMin !== undefined && softMin > max) {
    fail(`${path}.softMin`, "maior que max");
  }
  if (min !== undefined && softMax !== undefined && softMax < min) {
    fail(`${path}.softMax`, "menor que min");
  }
  if (max !== undefined && softMax !== undefined && softMax > max) {
    fail(`${path}.softMax`, "maior que max");
  }

  const options =
    source["options"] === undefined
      ? undefined
      : cloneOptions(source["options"], `${path}.options`);
  if (control === "dropdown" && options === undefined) {
    fail(`${path}.options`, "dropdown exige opções");
  }

  return Object.freeze({
    paramId: nonEmptyString(source["paramId"], `${path}.paramId`),
    label: quickText(source["label"], `${path}.label`),
    control: control as LiveControlKind,
    target: target as LiveControlTarget,
    order,
    ...(unit !== undefined ? { unit: unit as LiveControlUnit } : {}),
    ...(min !== undefined ? { min } : {}),
    ...(max !== undefined ? { max } : {}),
    ...(softMin !== undefined ? { softMin } : {}),
    ...(softMax !== undefined ? { softMax } : {}),
    ...(step !== undefined ? { step } : {}),
    ...(options !== undefined ? { options } : {}),
    help: quickText(source["help"], `${path}.help`)
  });
}

/** Valida uma definição de código e devolve uma cópia imutável. `derive` não é executado. */
export function defineQuickProfile<
  TArgs extends Record<string, unknown> = Record<string, unknown>
>(value: QuickProfile<TArgs>): Readonly<QuickProfile<TArgs>> {
  const source = record(value, "QuickProfile");
  exactKeys(
    source,
    new Set([
      "factoryPresetId",
      "derive",
      "liveControls",
      "previewAssetId",
      "oneLine",
      "needs",
      "budgetMs"
    ]),
    "QuickProfile"
  );

  const derive = source["derive"];
  if (derive !== undefined && typeof derive !== "function") {
    fail("derive", "esperada função pura");
  }
  if (!Array.isArray(source["liveControls"])) {
    fail("liveControls", "esperado array");
  }

  const bindings = source["liveControls"].map(cloneBinding);
  const paramIds = new Set<string>();
  const orders = new Set<number>();
  let previousOrder: number | undefined;
  for (let index = 0; index < bindings.length; index += 1) {
    const binding = bindings[index]!;
    if (paramIds.has(binding.paramId)) fail(`liveControls.${index}.paramId`, "id duplicado");
    if (orders.has(binding.order)) fail(`liveControls.${index}.order`, "ordem duplicada");
    if (previousOrder !== undefined && binding.order <= previousOrder) {
      fail(`liveControls.${index}.order`, "fora da sequência visual");
    }
    paramIds.add(binding.paramId);
    orders.add(binding.order);
    previousOrder = binding.order;
  }

  const budgetMs = finiteNumber(source["budgetMs"], "budgetMs");
  if (budgetMs <= 0) fail("budgetMs", "esperado número > 0");

  return Object.freeze({
    factoryPresetId: nonEmptyString(source["factoryPresetId"], "factoryPresetId"),
    ...(derive !== undefined
      ? { derive: derive as (context: Parameters<NonNullable<QuickProfile<TArgs>["derive"]>>[0]) => Partial<TArgs> }
      : {}),
    liveControls: Object.freeze(bindings) as unknown as LiveControlBinding[],
    previewAssetId: nonEmptyString(source["previewAssetId"], "previewAssetId"),
    oneLine: quickText(source["oneLine"], "oneLine"),
    needs: quickText(source["needs"], "needs"),
    budgetMs
  });
}

export interface LiveControlIdentity {
  readonly paramId: string;
  readonly order: number;
}

export interface QuickProfileContractIssue {
  readonly path: string;
  readonly code: string;
  readonly message: string;
}

export type LiveControlParityResult =
  | { readonly valid: true; readonly issues: readonly [] }
  | { readonly valid: false; readonly issues: readonly QuickProfileContractIssue[] };

/** Contrato A9: adapter e preset precisam materializar exatamente a mesma sequência. */
export function validateLiveControlParity(
  expected: readonly LiveControlIdentity[],
  actual: readonly LiveControlIdentity[]
): LiveControlParityResult {
  const issues: QuickProfileContractIssue[] = [];
  if (expected.length !== actual.length) {
    issues.push({
      path: "",
      code: "length",
      message: "quantidade de Live Controls diverge do QuickProfile"
    });
  }

  const length = Math.min(expected.length, actual.length);
  for (let index = 0; index < length; index += 1) {
    const expectedBinding = expected[index]!;
    const actualBinding = actual[index]!;
    if (actualBinding.paramId !== expectedBinding.paramId) {
      issues.push({
        path: `/${index}/paramId`,
        code: "const",
        message: "paramId diverge do QuickProfile"
      });
    }
    if (actualBinding.order !== expectedBinding.order) {
      issues.push({
        path: `/${index}/order`,
        code: "const",
        message: "order diverge do QuickProfile"
      });
    }
  }

  return issues.length === 0
    ? { valid: true, issues: [] }
    : { valid: false, issues: Object.freeze(issues.map((issue) => Object.freeze(issue))) };
}

export interface QuickProfileRegistration {
  readonly commandId: string;
  readonly hosts: readonly HostId[];
  readonly profile: Readonly<QuickProfile>;
}

export interface QuickProfileRegistry {
  get(commandId: string): Readonly<QuickProfile> | undefined;
  has(commandId: string): boolean;
  entries(): readonly QuickProfileRegistration[];
  forHost(host: HostId): readonly QuickProfileRegistration[];
}

type RegistryDescriptor = Pick<
  CommandDescriptor,
  "id" | "hosts" | "destructive" | "quickProfile"
>;

export function createQuickProfileRegistry(
  descriptors: readonly RegistryDescriptor[]
): QuickProfileRegistry {
  const byCommand = new Map<string, QuickProfileRegistration>();
  const registrations: QuickProfileRegistration[] = [];

  for (const descriptor of descriptors) {
    if (!descriptor.quickProfile) continue;
    if (byCommand.has(descriptor.id)) {
      throw new TypeError(`QuickProfile duplicado para o comando ${descriptor.id}.`);
    }
    if (descriptor.destructive) {
      throw new TypeError(`Comando destrutivo ${descriptor.id} não pode registrar QuickProfile.`);
    }

    const registration = Object.freeze({
      commandId: descriptor.id,
      hosts: Object.freeze([...descriptor.hosts]),
      profile: defineQuickProfile(descriptor.quickProfile)
    });
    byCommand.set(descriptor.id, registration);
    registrations.push(registration);
  }

  const entries = Object.freeze(registrations);
  return Object.freeze({
    get: (commandId: string) => byCommand.get(commandId)?.profile,
    has: (commandId: string) => byCommand.has(commandId),
    entries: () => entries,
    forHost: (host: HostId) =>
      Object.freeze(entries.filter((registration) => registration.hosts.includes(host)))
  });
}

export const QUICK_PROFILE_REGISTRY = createQuickProfileRegistry(COMMAND_DESCRIPTORS);

export function getQuickProfile(commandId: string): Readonly<QuickProfile> | undefined {
  return QUICK_PROFILE_REGISTRY.get(commandId);
}

export function quickProfilesForHost(host: HostId): readonly QuickProfileRegistration[] {
  return QUICK_PROFILE_REGISTRY.forHost(host);
}
