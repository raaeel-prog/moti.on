import { PULSE_PRESETS, pulsePresetArgs, validateCommandRequest,
  type PulseAnimationMode, type PulseArgs, type PulsePreset, type PulseReadData } from "@motion/contracts";
import { colorField, createElement, notice, numberField, selectField, type I18n, type RenderRegions } from "@motion/ui-core";

type PulseAction = PulseArgs["action"];
type Key = Parameters<I18n["t"]>[0];
const ANIMATION_MODES = ["uniform", "center-out", "left-to-right", "right-to-left"] as const;
const PRESETS = Object.keys(PULSE_PRESETS) as PulsePreset[];
const NUMERIC_KEYS = ["durationFrames", "peakScalePercent", "waveSpread", "distortion", "fluidity", "glow", "seed"] as const;
type NumericKey = (typeof NUMERIC_KEYS)[number];
export type { PulseAnimationMode };
export interface VerticalPulseDraft {
  action: PulseAction; renderer: "legacy" | "morph"; preset: PulsePreset;
  durationFrames: number; peakScalePercent: number; animationMode: PulseAnimationMode;
  waveSpread: number; distortion: number; fluidity: number; glow: number; seed: number;
  accentColor: [number, number, number];
}
let draft: VerticalPulseDraft | null = null;
let read: PulseReadData | null = null;
let readFailed = false;
let advancedOpen = false;
let revision = 0;
const rawNumbers = new Map<NumericKey, string>();
function defaultDraft(frameRate: number | null): VerticalPulseDraft { return pulsePresetArgs("impact", frameRate); }
function currentDraft(frameRate: number | null): VerticalPulseDraft { return draft ?? (draft = defaultDraft(frameRate)); }
export function verticalPulseRevision(): number { return revision; }

/** Reset keeps the selected engine and preserves native controls with animation. */
export function resetVerticalPulse(frameRate: number | null): void {
  const defaults = read?.renderer === "legacy" && read.controls
    ? { ...defaultDraft(frameRate), ...read.controls, action: "apply" as const, renderer: "legacy" as const } : defaultDraft(frameRate);
  for (const key of read?.lockedControls ?? []) if (read?.controls && key in read.controls)
    Object.assign(defaults, { [key]: read.controls[key as keyof typeof read.controls] });
  draft = { ...defaults, accentColor: [...defaults.accentColor] };
  rawNumbers.clear(); revision += 1;
}
export function verticalPulseAction(frameRate: number | null): PulseAction { return currentDraft(frameRate).action; }
export function verticalPulseArgs(frameRate: number | null): Record<string, unknown> {
  const v = currentDraft(frameRate);
  if (v.action === "update") return { action: "update", renderer: "morph" };
  if (v.action === "remove" || v.action === "bake") return { action: v.action };
  const args = { action: "apply", durationFrames: v.durationFrames, peakScalePercent: v.peakScalePercent,
    animationMode: v.animationMode, waveSpread: v.waveSpread, distortion: v.distortion,
    glow: v.glow, seed: v.seed, accentColor: [...v.accentColor], renderer: v.renderer };
  return v.renderer === "legacy" ? args : { ...args, preset: v.preset, fluidity: v.fluidity };
}
function parsedNumber(raw: string, key: NumericKey): number | undefined {
  const v = Number(raw.trim().replace(",", "."));
  const [min, max] = key === "durationFrames" ? [12, 240] : key === "peakScalePercent" ? [120, 450] : key === "seed" ? [0, 1000000] : [0, 100];
  return raw.trim() && Number.isFinite(v) && v >= min && v <= max
    && (key !== "durationFrames" && key !== "seed" || Number.isInteger(v)) ? v : undefined;
}
export function validVerticalPulse(frameRate: number | null): boolean {
  if (currentDraft(frameRate).action === "apply" && [...rawNumbers].some(([key, raw]) => parsedNumber(raw, key) === undefined)) return false;
  return validateCommandRequest({ protocolVersion: 1, requestId: "pulse-validation", command: "ae.text.vertical-pulse",
    args: verticalPulseArgs(frameRate), context: { host: "after-effects", hostVersion: "unknown" } }).valid;
}
/** Read responses are validated before they can replace a user's draft. */
export function isVerticalPulseReadData(value: unknown): value is PulseReadData {
  if (!value || typeof value !== "object") return false;
  const d = value as Partial<PulseReadData>;
  if (![0, 1, 2, 3, 4].includes(d.rigVersion ?? -1) || typeof d.stale !== "boolean" || typeof d.baked !== "boolean"
    || !Number.isInteger(d.glyphCount) || (d.glyphCount ?? -1) < 0 || !Number.isInteger(d.vertexCount) || (d.vertexCount ?? -1) < 0
    || !Array.isArray(d.lockedControls) || !d.lockedControls.every(key => typeof key === "string")) return false;
  if (d.rigVersion === 0) return d.renderer === null && d.preset === null && d.controls === null && !d.stale && !d.baked
    && d.glyphCount === 0 && d.vertexCount === 0 && d.lockedControls.length === 0;
  if (d.renderer !== (d.rigVersion === 4 ? "morph" : "legacy") || !d.controls || d.controls.action !== "apply") return false;
  if (d.renderer === "legacy" && d.preset !== null || d.renderer === "morph" && !PRESETS.includes(d.preset as PulsePreset)) return false;
  if (d.controls.renderer !== undefined && d.controls.renderer !== d.renderer
    || d.renderer === "morph" && (d.controls.preset !== d.preset || d.controls.fluidity === undefined)) return false;
  return validateCommandRequest({ protocolVersion: 1, requestId: "pulse-read", command: "ae.text.vertical-pulse",
    args: d.controls, context: { host: "after-effects", hostVersion: "unknown" } }).valid;
}
/** A revision captured before async reading prevents later edits from being erased. */
export function hydrateVerticalPulse(data: PulseReadData, frameRate: number | null, expectedRevision?: number): boolean {
  if (expectedRevision !== undefined && expectedRevision !== revision) return false;
  const previousRig = read?.rigVersion ?? 0;
  read = { ...data, lockedControls: [...data.lockedControls], controls: data.controls ? { ...data.controls, accentColor: [...data.controls.accentColor] } : null };
  readFailed = false;
  if (data.controls && data.renderer) {
    draft = { ...defaultDraft(frameRate), ...data.controls, action: "apply", renderer: data.renderer,
      preset: data.preset ?? "impact", accentColor: [...data.controls.accentColor] }; rawNumbers.clear();
  } else if (previousRig) { draft = defaultDraft(frameRate); rawNumbers.clear(); }
  else currentDraft(frameRate).renderer = "morph";
  revision += 1; return true;
}
export function markVerticalPulseReadFailed(): void { readFailed = true; }
export function verticalPulseActionLabel(i18n: I18n, frameRate: number | null): string {
  const action = currentDraft(frameRate).action;
  return i18n.t(action === "remove" ? "textEffects.remove" : action === "bake" ? "verticalPulse.bake"
    : action === "update" ? read?.renderer === "legacy" ? "verticalPulse.upgrade" : "verticalPulse.update"
    : read?.rigVersion ? "verticalPulse.adjust" : "action.apply");
}
export function verticalPulseReadDisabledReason(i18n: I18n, frameRate: number | null, editor = false): string | null {
  if (editor && readFailed) return i18n.t("verticalPulse.readInvalid");
  const v = currentDraft(frameRate);
  if (v.action === "apply" && read?.baked) return i18n.t("verticalPulse.bakedHelp");
  if ((v.action === "apply" || v.action === "bake") && read?.stale) return i18n.t("verticalPulse.staleHelp");
  if (v.action === "apply" && read?.controls && read.lockedControls.some(key => {
    const next = v[key as keyof VerticalPulseDraft], previous = read?.controls?.[key as keyof typeof read.controls];
    return Array.isArray(next) && Array.isArray(previous) ? next.some((channel, i) => Math.abs(channel - previous[i]!) > 0.000001) : next !== previous;
  })) return i18n.t("verticalPulse.lockedHelp");
  return null;
}
function matchingPreset(v: VerticalPulseDraft, frameRate: number | null): boolean {
  const expected = pulsePresetArgs(v.preset, frameRate);
  return [...NUMERIC_KEYS, "animationMode", "accentColor"].every(key => {
    const actual = v[key as keyof VerticalPulseDraft], target = expected[key as keyof typeof expected];
    return Array.isArray(actual) && Array.isArray(target) ? actual.every((channel, i) => Math.abs(channel - target[i]!) < 0.000001)
      : typeof actual === "number" && typeof target === "number" ? Math.abs(actual - target) < 0.000001 : actual === target;
  });
}
export function renderVerticalPulse(regions: RenderRegions, i18n: I18n, busy: boolean, frameRate: number | null): void {
  const v = currentDraft(frameRate), { content, shell } = regions, legacy = v.renderer === "legacy";
  const locked = (key: string): boolean => Boolean(read?.lockedControls.includes(key));
  content.appendChild(notice(document, i18n.t("verticalPulse.help")));
  if (legacy) content.appendChild(notice(document, i18n.t("verticalPulse.legacyHelp")));
  if (read?.stale) content.appendChild(notice(document, i18n.t("verticalPulse.staleHelp")));
  if (read?.baked) content.appendChild(notice(document, i18n.t("verticalPulse.bakedHelp")));
  const matches = !legacy && matchingPreset(v, frameRate);
  content.appendChild(selectField(document, { id: "verticalPulse-preset", label: i18n.t("verticalPulse.preset"),
    value: legacy ? "legacy" : matches ? v.preset : "custom",
    options: legacy ? [{ value: "legacy", label: i18n.t("verticalPulse.current") }] : [
      ...(!matches ? [{ value: "custom", label: i18n.t("verticalPulse.custom") }] : []),
      ...PRESETS.map(value => ({ value, label: i18n.t(`verticalPulse.preset.${value}`) }))],
    disabled: busy || legacy || v.action !== "apply",
    onChange: value => {
      if (PRESETS.includes(value as PulsePreset)) {
        const next = pulsePresetArgs(value as PulsePreset, frameRate);
        for (const key of read?.lockedControls ?? []) if (read?.controls && key in read.controls)
          Object.assign(next, { [key]: read.controls[key as keyof typeof read.controls] });
        draft = { ...next, accentColor: [...next.accentColor] }; rawNumbers.clear(); revision += 1;
      }
      shell.rerender();
    }
  }));
  const numeric = (target: HTMLElement, key: NumericKey, label: Key, min: number, max: number, unit: string): void => {
    const field = numberField(document, { id: `verticalPulse-${key}`, label: i18n.t(label), value: Number(v[key].toFixed(3)), min, max,
      step: key === "durationFrames" || key === "seed" ? 1 : .1, unit, disabled: busy || locked(key) || v.action !== "apply",
      ...(locked(key) ? { description: i18n.t("verticalPulse.lockedHelp") } : {}),
      onInput: value => { rawNumbers.set(key, String(value)); revision += 1; },
      onCommit: value => { v[key] = value; rawNumbers.delete(key); revision += 1; shell.rerender(); } });
    const input = field.getElementsByTagName("input")[0]!;
    const raw = rawNumbers.get(key);
    if (raw !== undefined) {
      input.value = raw; const invalid = parsedNumber(raw, key) === undefined;
      input.setAttribute("aria-invalid", String(invalid)); field.setAttribute("data-invalid", String(invalid));
      const error = Array.from(field.getElementsByTagName("div")).find(node => node.id === `verticalPulse-${key}-error`);
      if (error) { error.hidden = !invalid; error.setAttribute("data-hidden", String(!invalid)); error.textContent = invalid
        ? i18n.t(key === "durationFrames" || key === "seed" ? "field.integerRange" : "field.numberRange", { min, max }) : "";
        if (invalid) input.setAttribute("aria-describedby", error.id); }
    }
    input.addEventListener("input", () => { if (!busy && !locked(key)) { rawNumbers.set(key, input.value); revision += 1; } });
    input.addEventListener("keydown", event => { if ((event as KeyboardEvent).key === "Escape") rawNumbers.delete(key); });
    target.appendChild(field);
  };
  if (v.action === "apply") {
    numeric(content, "durationFrames", "verticalPulse.duration", 12, 240, i18n.t("ease.frames"));
    numeric(content, "peakScalePercent", "verticalPulse.peak", 120, 450, "%");
    numeric(content, "distortion", "verticalPulse.strength", 0, 100, "%");
    content.appendChild(colorField(document, { id: "verticalPulse-accentColor", label: i18n.t("verticalPulse.color"),
      value: `#${v.accentColor.map(channel => Math.round(channel * 255).toString(16).padStart(2, "0")).join("")}`,
      disabled: busy || locked("accentColor"), ...(locked("accentColor") ? { description: i18n.t("verticalPulse.lockedHelp") } : {}),
      onCommit: hex => { v.accentColor = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number]; revision += 1; shell.rerender(); } }));
  }
  const advanced = createElement(document, "details", "ch-tool-disclosure") as HTMLDetailsElement;
  advanced.id = "verticalPulse-advanced"; advanced.open = advancedOpen;
  advanced.appendChild(createElement(document, "summary", "", i18n.t("verticalPulse.advanced")));
  advanced.addEventListener("toggle", () => { advancedOpen = advanced.open; }); content.appendChild(advanced);
  const operations: Array<{ value: PulseAction; label: string }> = [{ value: "apply", label: i18n.t(read?.rigVersion ? "verticalPulse.adjust" : "textEffects.apply") }];
  if (read?.rigVersion) {
    operations.push({ value: "update", label: i18n.t(legacy ? "verticalPulse.upgrade" : "verticalPulse.update") });
    if (!legacy && !read.baked) operations.push({ value: "bake", label: i18n.t("verticalPulse.bake") });
    operations.push({ value: "remove", label: i18n.t("textEffects.remove") });
  }
  advanced.appendChild(selectField(document, { id: "verticalPulse-action", label: i18n.t("textEffects.action"), value: v.action, options: operations, disabled: busy,
    onChange: value => { v.action = value as PulseAction; revision += 1; shell.rerender(); } }));
  if (v.action !== "apply") {
    advanced.open = true; advancedOpen = true;
    advanced.appendChild(notice(document, i18n.t(v.action === "remove" ? "verticalPulse.removeHelp" : v.action === "bake" ? "verticalPulse.bakeHelp" : "verticalPulse.updateHelp"))); return;
  }
  advanced.appendChild(selectField(document, { id: "verticalPulse-animationMode", label: i18n.t("verticalPulse.animationMode"), value: v.animationMode,
    options: ANIMATION_MODES.map(value => ({ value, label: i18n.t(`verticalPulse.animationMode.${value}`) })), disabled: busy || locked("animationMode"),
    onChange: value => { v.animationMode = value as PulseAnimationMode; revision += 1; shell.rerender(); } }));
  numeric(advanced, "waveSpread", "verticalPulse.waveSpread", 0, 100, "%");
  if (!legacy) numeric(advanced, "fluidity", "verticalPulse.fluidity", 0, 100, "%");
  numeric(advanced, "glow", "verticalPulse.glow", 0, 100, "%");
  numeric(advanced, "seed", "verticalPulse.seed", 0, 1000000, "");
}
