import {
  WORD_REVEAL_DEFAULTS, PROXIMITY_MORPH_DEFAULTS, PROXIMITY_MORPH_PRESETS, STYLE_SWAP_DEFAULTS,
  validateCommandRequest, type TextEffectKind, type TextEffectAction,
  type WordRevealArgs, type WordRevealAction, type WordRevealReadData, type StyleSwapArgs,
  type VariableMorphArgs, type VariableMorphAction, type VariableMorphReadData, type ProximityMorphPreset
} from "@motion/contracts";
import { checkboxField, colorField, createElement, numberField, selectField, notice, type RenderRegions, type I18n } from "@motion/ui-core";

type Key = Parameters<I18n["t"]>[0];
const drafts = {
  wordReveal: wordRevealDefaults(),
  variableMorph: { ...PROXIMITY_MORPH_DEFAULTS },
  styleSwap: { ...STYLE_SWAP_DEFAULTS }
};
let wordRevealRead: WordRevealReadData | null = null;
let wordRevealReadFailed = false;
let wordRevealAdvancedOpen = false;
let variableMorphRead: VariableMorphReadData | null = null;
let variableMorphReadFailed = false;
let variableMorphAdvancedOpen = false;
function wordRevealDefaults(): Required<WordRevealArgs> {
  return { ...WORD_REVEAL_DEFAULTS, fillColor: [...WORD_REVEAL_DEFAULTS.fillColor], textColor: [...WORD_REVEAL_DEFAULTS.textColor] };
}
export function resetTextEffect(kind: TextEffectKind): void {
  if (kind === "wordReveal") drafts.wordReveal = { ...wordRevealDefaults(), renderer: wordRevealRead?.renderer ?? "morph" };
  if (kind === "variableMorph") drafts.variableMorph = { ...PROXIMITY_MORPH_DEFAULTS, renderer: variableMorphRead?.renderer ?? "auto" };
  if (kind === "styleSwap") drafts.styleSwap = { ...STYLE_SWAP_DEFAULTS };
}
export function textEffectArgs(kind: TextEffectKind): Record<string, unknown> {
  if (kind === "wordReveal") return { ...drafts.wordReveal, fillColor: [...drafts.wordReveal.fillColor], textColor: [...drafts.wordReveal.textColor] };
  if (kind === "variableMorph") return variableMorphCompatibleArgs(drafts.variableMorph, variableMorphRead?.rigVersion ?? 0);
  return { ...drafts[kind] };
}
/** Older rigs retain their original engine until an explicit Update. */
export function variableMorphCompatibleArgs(args: VariableMorphArgs, rigVersion: number): Record<string, unknown> {
  return rigVersion === 1 && (args.action === "apply" || args.action === "remove")
    ? { action: args.action, radius: args.radius, strength: args.strength, weight: args.weight, contrast: args.contrast, italic: args.italic }
    : { ...args };
}
export function isWordRevealReadData(value: unknown): value is WordRevealReadData {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<WordRevealReadData>;
  if (!Number.isInteger(record.rigVersion) || (record.rigVersion ?? -1) < 0 || !Number.isInteger(record.wordCount)
    || (record.wordCount ?? -1) < 0 || typeof record.baked !== "boolean") return false;
  if (record.rigVersion === 0) return record.renderer === null && record.controls === null && record.wordCount === 0 && !record.baked;
  if (record.rigVersion !== 1 && record.rigVersion !== 2 || record.renderer !== (record.rigVersion === 1 ? "legacy" : "morph") || !record.controls) return false;
  return validateCommandRequest({ protocolVersion: 1, requestId: "word-reveal-read", command: "ae.text.word-reveal",
    args: record.controls, context: { host: "after-effects", hostVersion: "unknown" } }).valid;
}
/** Read the existing values without replacing a new-text draft. */
export function hydrateWordReveal(data: WordRevealReadData): void {
  wordRevealRead = data;
  wordRevealReadFailed = false;
  if (!data.controls || !data.renderer) { drafts.wordReveal.renderer = "morph"; return; }
  drafts.wordReveal = { ...wordRevealDefaults(), ...data.controls, action: "apply", renderer: data.renderer,
    fillColor: [...data.controls.fillColor], textColor: [...(data.controls.textColor ?? WORD_REVEAL_DEFAULTS.textColor)] };
}
export function markWordRevealReadFailed(): void { wordRevealReadFailed = true; }
export function wordRevealActionLabel(i18n: I18n): string {
  const action = drafts.wordReveal.action;
  return i18n.t(action === "update" ? wordRevealRead?.rigVersion === 1 ? "wordReveal.upgrade" : "wordReveal.update"
    : action === "bake" ? "wordReveal.bake" : action === "remove" ? "textEffects.remove" : "action.apply");
}
export function wordRevealDisabledReason(i18n: I18n, editor = false): string | null {
  if (editor && wordRevealReadFailed) return i18n.t("wordReveal.readInvalid");
  return wordRevealRead?.baked && drafts.wordReveal.action === "apply" ? i18n.t("wordReveal.bakedHelp") : null;
}
export function isVariableMorphReadData(value: unknown): value is VariableMorphReadData {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<VariableMorphReadData>;
  if (![0, 1, 2].includes(data.rigVersion ?? -1) || !Number.isInteger(data.glyphCount) || (data.glyphCount ?? -1) < 0
    || typeof data.baked !== "boolean" || typeof data.stale !== "boolean" || !data.capabilities
    || !["weight", "contrast", "italic", "variable", "outline"].every(key => typeof data.capabilities?.[key as keyof VariableMorphReadData["capabilities"]] === "boolean")
    || data.lockedControls !== undefined && (!Array.isArray(data.lockedControls) || !data.lockedControls.every(key => typeof key === "string"))) return false;
  if (data.rigVersion === 0) return data.renderer === null && data.controls === null && data.glyphCount === 0 && !data.baked && !data.stale;
  if (data.renderer !== "outline" && data.renderer !== "variable" || data.rigVersion === 1 && data.renderer !== "variable" || !data.controls) return false;
  return validateCommandRequest({ protocolVersion: 1, requestId: "variable-morph-read", command: "ae.text.variable-morph",
    args: data.controls, context: { host: "after-effects", hostVersion: "unknown" } }).valid;
}
export function hydrateVariableMorph(data: VariableMorphReadData, newRadius = PROXIMITY_MORPH_DEFAULTS.radius): void {
  const previousRig = variableMorphRead?.rigVersion ?? 0;
  variableMorphRead = data; variableMorphReadFailed = false;
  if (!data.controls || !data.renderer) {
    if (previousRig) drafts.variableMorph = { ...PROXIMITY_MORPH_DEFAULTS, radius: newRadius };
    else if (drafts.variableMorph.radius === PROXIMITY_MORPH_DEFAULTS.radius) drafts.variableMorph.radius = newRadius;
    return;
  }
  drafts.variableMorph = { ...PROXIMITY_MORPH_DEFAULTS, ...data.controls, renderer: data.renderer, action: "apply" };
}
export function markVariableMorphReadFailed(): void { variableMorphReadFailed = true; }
export function variableMorphActionLabel(i18n: I18n): string {
  const action = drafts.variableMorph.action;
  return i18n.t(action === "update" ? variableMorphRead?.rigVersion === 1 ? "proximityMorph.upgrade" : "proximityMorph.update"
    : action === "bake" ? "proximityMorph.bake" : action === "sweep" ? "proximityMorph.sweep" : action === "remove" ? "textEffects.remove" : "action.apply");
}
export function variableMorphDisabledReason(i18n: I18n, editor = false): string | null {
  if (!editor) return null;
  if (variableMorphReadFailed) return i18n.t("proximityMorph.readInvalid");
  const d = drafts.variableMorph;
  if (variableMorphRead?.baked && (d.action === "apply" || d.action === "sweep")) return i18n.t("proximityMorph.bakedHelp");
  if (variableMorphRead?.stale && (d.action === "apply" || d.action === "bake" || d.action === "sweep")) return i18n.t("proximityMorph.staleHelp");
  if (d.action === "apply" && variableMorphRead?.rigVersion && d.renderer !== "auto" && d.renderer !== variableMorphRead.renderer)
    return i18n.t("proximityMorph.modeChangeHelp");
  if (d.action === "apply" && variableMorphRead?.controls && variableMorphRead.lockedControls?.some(key =>
    key in d && d[key as keyof VariableMorphArgs] !== variableMorphRead?.controls?.[key as keyof VariableMorphArgs])) return i18n.t("proximityMorph.lockedHelp");
  return null;
}
export function validTextEffect(kind: TextEffectKind, command: string): boolean {
  return validateCommandRequest({ protocolVersion: 1, requestId: "text-effect-validation", command,
    args: textEffectArgs(kind), context: { host: "after-effects", hostVersion: "unknown" } }).valid;
}

export function renderTextEffect(kind: TextEffectKind, regions: RenderRegions, i18n: I18n, busy: boolean): void {
  if (kind === "wordReveal") { renderWordReveal(regions, i18n, busy); return; }
  if (kind === "variableMorph") { renderVariableMorph(regions, i18n, busy); return; }
  const { content, shell } = regions;
  const draft = drafts[kind];
  const instructions: Record<TextEffectKind, Key> = {
    wordReveal: "textEffects.wordReveal.help", variableMorph: "textEffects.variableMorph.help", styleSwap: "textEffects.styleSwap.help"
  };
  content.appendChild(notice(document, i18n.t(instructions[kind])));
  content.appendChild(selectField(document, {
    id: `${kind}-action`, label: i18n.t("textEffects.action"), value: draft.action,
    options: [{ value: "apply", label: i18n.t("textEffects.apply") }, { value: "remove", label: i18n.t("textEffects.remove") }],
    disabled: busy,
    onChange: (value) => { draft.action = value as TextEffectAction; shell.rerender(); }
  }));
  if (draft.action === "remove") {
    content.appendChild(notice(document, i18n.t("textEffects.remove.help")));
    return;
  }
  function numeric<T extends object>(target: T, key: keyof T, label: Key, min: number, max: number, unit: string): void {
    content.appendChild(numberField(document, {
      id: `${kind}-${String(key)}`, label: i18n.t(label), value: target[key] as number,
      min, max, step: 1, unit, disabled: busy,
      onCommit: (value) => { target[key] = value as T[keyof T]; shell.rerender(); }
    }));
  }
  const timing = drafts.styleSwap;
  numeric(timing, "durationFrames", "textEffects.duration", 1, 300, i18n.t("ease.frames"));
  numeric(timing, "staggerFrames", "textEffects.stagger", 0, 60, i18n.t("ease.frames"));
  content.appendChild(selectField(document, {
      id: "styleSwap-unit", label: i18n.t("textEffects.unit"), value: drafts.styleSwap.unit,
      options: [{ value: "characters", label: i18n.t("textEffects.characters") }, { value: "words", label: i18n.t("textEffects.words") }],
      disabled: busy,
      onChange: (value) => { drafts.styleSwap.unit = value as StyleSwapArgs["unit"]; shell.rerender(); }
  }));
}

function renderVariableMorph(regions: RenderRegions, i18n: I18n, busy: boolean): void {
  const { content, shell } = regions, d = drafts.variableMorph;
  const legacy = variableMorphRead?.rigVersion === 1 && d.action !== "update";
  content.appendChild(notice(document, i18n.t("textEffects.variableMorph.help")));
  const resolved = d.renderer === "auto" ? variableMorphRead?.capabilities.variable && variableMorphRead.capabilities.weight ? "variable" : "outline" : d.renderer;
  if (variableMorphRead) content.appendChild(notice(document, i18n.t(resolved === "variable" ? "proximityMorph.resolvedVariable" : "proximityMorph.resolvedOutline")));
  if (variableMorphRead?.rigVersion === 1) content.appendChild(notice(document, i18n.t("proximityMorph.legacyHelp")));
  if (variableMorphRead?.stale) content.appendChild(notice(document, i18n.t("proximityMorph.staleHelp")));
  if (variableMorphRead?.baked) content.appendChild(notice(document, i18n.t("proximityMorph.bakedHelp")));
  const numeric = (target: HTMLElement, key: keyof Required<VariableMorphArgs>, label: Key, min: number, max: number, unit: string): void => {
    const locked = Boolean(variableMorphRead?.lockedControls?.includes(key));
    // Native slider floats stay exact in the draft; only the field display is shortened.
    const displayValue = Number((d[key] as number).toFixed(2));
    target.appendChild(numberField(document, { id: `variableMorph-${key}`, label: i18n.t(label), value: displayValue,
      min, max, step: key === "sweepFrames" ? 1 : .1, unit, disabled: busy || locked || (d.action !== "apply" && key !== "sweepFrames"),
      ...(locked ? { description: i18n.t("proximityMorph.lockedHelp") } : {}),
      onCommit: value => { (d[key] as number) = value; shell.rerender(); } }));
  };
  const presetIds = Object.keys(PROXIMITY_MORPH_PRESETS) as ProximityMorphPreset[];
  const matchesPreset = Object.entries(PROXIMITY_MORPH_PRESETS[d.preset]).every(([key, value]) => d[key as keyof VariableMorphArgs] === value);
  const presetLocked = variableMorphRead?.lockedControls?.some(key => ["weight", "contrast", "italic", "scaleX", "scaleY", "skew", "lift"].includes(key));
  content.appendChild(selectField(document, { id: "variableMorph-preset", label: i18n.t("proximityMorph.preset"), value: matchesPreset ? d.preset : "custom",
    options: [...(!matchesPreset ? [{ value: "custom", label: i18n.t("proximityMorph.custom") }] : []),
      ...presetIds.map(value => ({ value, label: i18n.t(`proximityMorph.preset.${value}`) }))],
    disabled: busy || legacy || d.action !== "apply" || Boolean(presetLocked), onChange: value => {
      if (value in PROXIMITY_MORPH_PRESETS) Object.assign(d, PROXIMITY_MORPH_PRESETS[value as ProximityMorphPreset], { preset: value });
      shell.rerender();
    } }));
  numeric(content, "radius", "textEffects.radius", 1, 5000, "px");
  numeric(content, "strength", "textEffects.strength", 0, 100, "%");
  const advanced = createElement(document, "details", "ch-tool-disclosure") as HTMLDetailsElement;
  advanced.id = "variableMorph-advanced"; advanced.open = variableMorphAdvancedOpen;
  advanced.appendChild(createElement(document, "summary", "", i18n.t("proximityMorph.advanced")));
  advanced.addEventListener("toggle", () => { variableMorphAdvancedOpen = advanced.open; });
  content.appendChild(advanced);
  const operations: Array<{ value: VariableMorphAction; label: string }> = [{ value: "apply", label: i18n.t("textEffects.apply") }];
  if (variableMorphRead?.rigVersion) {
    operations.push({ value: "update", label: i18n.t(variableMorphRead.rigVersion === 1 ? "proximityMorph.upgrade" : "proximityMorph.update") });
    if (!variableMorphRead.baked && variableMorphRead.rigVersion === 2) {
      operations.push({ value: "sweep", label: i18n.t("proximityMorph.sweep") });
      operations.push({ value: "bake", label: i18n.t("proximityMorph.bake") });
    }
    operations.push({ value: "remove", label: i18n.t("textEffects.remove") });
  }
  advanced.appendChild(selectField(document, { id: "variableMorph-action", label: i18n.t("textEffects.action"), value: d.action,
    options: operations, disabled: busy, onChange: value => { d.action = value as VariableMorphAction; shell.rerender(); } }));
  if (d.action === "remove" || d.action === "bake") {
    advanced.appendChild(notice(document, i18n.t(d.action === "remove" ? "textEffects.remove.help" : "proximityMorph.bakeHelp")));
    return;
  }
  if (d.action === "sweep") {
    advanced.appendChild(notice(document, i18n.t("proximityMorph.sweepHelp")));
    numeric(advanced, "sweepFrames", "proximityMorph.sweepFrames", 1, 3600, i18n.t("ease.frames"));
    advanced.appendChild(selectField(document, { id: "variableMorph-sweepDirection", label: i18n.t("proximityMorph.sweepDirection"), value: d.sweepDirection,
      options: (["left-to-right", "right-to-left", "top-to-bottom", "bottom-to-top"] as const).map(value => ({ value, label: i18n.t(`proximityMorph.sweepDirection.${value}`) })),
      disabled: busy, onChange: value => { d.sweepDirection = value as Required<VariableMorphArgs>["sweepDirection"]; shell.rerender(); } }));
    return;
  }
  if (d.action === "update") advanced.appendChild(notice(document, i18n.t("proximityMorph.updateHelp")));
  advanced.appendChild(selectField(document, { id: "variableMorph-renderer", label: i18n.t("proximityMorph.mode"), value: d.renderer,
    options: (["auto", "outline", "variable"] as const).map(value => ({ value, label: i18n.t(`proximityMorph.mode.${value}`) })),
    disabled: busy || legacy, onChange: value => { d.renderer = value as Required<VariableMorphArgs>["renderer"]; shell.rerender(); } }));
  if (!legacy) numeric(advanced, "smoothness", "proximityMorph.smoothness", 0, 100, "%");
  numeric(advanced, "weight", "textEffects.weight", -100, 100, "%");
  if (resolved === "variable" && variableMorphRead?.capabilities.contrast) numeric(advanced, "contrast", "textEffects.contrast", 0, 100, "%");
  if (resolved === "variable" && variableMorphRead?.capabilities.italic) numeric(advanced, "italic", "proximityMorph.italic", 0, 100, "%");
  if (!legacy) {
    numeric(advanced, "scaleX", "proximityMorph.scaleX", 25, 300, "%");
    numeric(advanced, "scaleY", "proximityMorph.scaleY", 25, 300, "%");
    numeric(advanced, "skew", "proximityMorph.skew", -60, 60, "°");
    numeric(advanced, "lift", "proximityMorph.lift", -200, 200, "%");
  }
  if (variableMorphRead?.lockedControls?.length) advanced.appendChild(notice(document, i18n.t("proximityMorph.lockedHelp")));
}

function renderWordReveal(regions: RenderRegions, i18n: I18n, busy: boolean): void {
  const { content, shell } = regions, d = drafts.wordReveal;
  const legacy = wordRevealRead?.rigVersion === 1 && d.action !== "update";
  content.appendChild(notice(document, i18n.t(legacy ? "wordReveal.legacyHelp" : "textEffects.wordReveal.help")));
  if (wordRevealRead?.baked) content.appendChild(notice(document, i18n.t("wordReveal.bakedHelp")));
  const operations: Array<{ value: WordRevealAction; label: string }> = [{ value: "apply", label: i18n.t("textEffects.apply") }];
  if (wordRevealRead?.rigVersion) {
    operations.push({ value: "update", label: i18n.t(wordRevealRead.rigVersion === 1 ? "wordReveal.upgrade" : "wordReveal.update") });
    if (wordRevealRead.renderer === "morph" && !wordRevealRead.baked) operations.push({ value: "bake", label: i18n.t("wordReveal.bake") });
  }
  operations.push({ value: "remove", label: i18n.t("textEffects.remove") });
  content.appendChild(selectField(document, { id: "wordReveal-action", label: i18n.t("textEffects.action"), value: d.action,
    options: operations, disabled: busy, onChange: value => {
      d.action = value as WordRevealAction;
      d.renderer = d.action === "update" ? "morph" : wordRevealRead?.renderer ?? "morph";
      shell.rerender();
    } }));
  if (d.action === "remove" || d.action === "bake") {
    content.appendChild(notice(document, i18n.t(d.action === "remove" ? "textEffects.remove.help" : "wordReveal.bakeHelp")));
    return;
  }
  if (d.action === "update") content.appendChild(notice(document, i18n.t("wordReveal.updateHelp")));
  const numeric = (target: HTMLElement, key: keyof Required<WordRevealArgs>, label: Key, min: number, max: number, unit: string): void => {
    target.appendChild(numberField(document, { id: `wordReveal-${key}`, label: i18n.t(label), value: d[key] as number,
      min, max, step: key === "durationFrames" || key === "staggerFrames" ? 1 : .1, unit, disabled: busy,
      onCommit: value => { (d[key] as number) = value; shell.rerender(); } }));
  };
  if (!legacy) content.appendChild(selectField(document, { id: "wordReveal-direction", label: i18n.t("wordReveal.direction"), value: d.direction,
    options: (["bottom", "top", "left", "right"] as const).map(value => ({ value, label: i18n.t(`wordReveal.direction.${value}`) })),
    disabled: busy, onChange: value => { d.direction = value as WordRevealArgs["direction"] & string; shell.rerender(); } }));
  numeric(content, "durationFrames", "wordReveal.duration", 4, 180, i18n.t("ease.frames"));
  numeric(content, "staggerFrames", "wordReveal.stagger", 0, 60, i18n.t("ease.frames"));
  if (!legacy) numeric(content, "smoothness", "wordReveal.smoothness", 0, 100, "%");
  const advanced = createElement(document, "details", "ch-tool-disclosure") as HTMLDetailsElement;
  advanced.id = "wordReveal-advanced"; advanced.open = wordRevealAdvancedOpen;
  advanced.appendChild(createElement(document, "summary", "", i18n.t("wordReveal.advanced")));
  advanced.addEventListener("toggle", () => { wordRevealAdvancedOpen = advanced.open; });
  content.appendChild(advanced);
  if (!legacy) {
    numeric(advanced, "formationPercent", "wordReveal.formation", 0, 60, "%");
    numeric(advanced, "holdPercent", "wordReveal.hold", 0, 30, "%");
    numeric(advanced, "travelPercent", "wordReveal.travel", 0, 100, "%");
    advanced.appendChild(selectField(document, { id: "wordReveal-order", label: i18n.t("wordReveal.order"), value: d.order,
      options: (["normal", "reverse"] as const).map(value => ({ value, label: i18n.t(`wordReveal.order.${value}`) })), disabled: busy,
      onChange: value => { d.order = value as "normal" | "reverse"; shell.rerender(); } }));
    advanced.appendChild(checkboxField(document, { id: "wordReveal-automatic", label: i18n.t("wordReveal.automatic"), checked: d.automatic,
      disabled: busy, onChange: value => { d.automatic = value; shell.rerender(); } }));
    if (!d.automatic) numeric(advanced, "progress", "wordReveal.progress", 0, 100, "%");
  }
  numeric(advanced, "paddingX", "textBox.paddingX", 0, 500, "px");
  numeric(advanced, "paddingY", "textBox.paddingY", 0, 500, "px");
  numeric(advanced, "boxGap", "textEffects.boxGap", 0, 100, "px");
  numeric(advanced, "roundness", "textBox.roundness", 0, 500, "px");
  if (legacy) numeric(advanced, "revealPoint", "textEffects.revealPoint", 10, 90, "%");
  const color = (key: "fillColor" | "textColor", label: Key): void => {
    advanced.appendChild(colorField(document, { id: `wordReveal-${key}`, label: i18n.t(label),
      value: "#" + d[key].map(v => Math.round(v * 255).toString(16).padStart(2, "0")).join(""), disabled: busy,
      onCommit: hex => { d[key] = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255) as [number, number, number]; shell.rerender(); } }));
  };
  color("fillColor", "wordReveal.boxColor");
  if (!legacy) {
    advanced.appendChild(checkboxField(document, { id: "wordReveal-useSourceColor", label: i18n.t("wordReveal.useSourceColor"), checked: d.useSourceColor,
      disabled: busy, onChange: value => { d.useSourceColor = value; shell.rerender(); } }));
    if (!d.useSourceColor) color("textColor", "wordReveal.textColor");
  }
}
