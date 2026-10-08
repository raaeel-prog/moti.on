import { protectedWrite, parsesAs } from "./storage-safety.js";
/** Gradient editor. Commands and host context are injected by the CEP composition root. */
import {
  GRADIENT_PARAMETER_KEYS, GRADIENT_PRESETS, GRADIENT_SCALARS, cloneGradientSettings, isGradientSettings,
  type GradientArgs, type GradientReadData, type GradientSettingsV1, type GradientScalarKey, type CommandResponse
} from "@motion/contracts";
import {
  checkboxField, colorField, createActionButton, createElement, hint, numberField, selectField, textField,
  type ActionButtonController, type I18n
} from "@motion/ui-core";

type Key = Parameters<I18n["t"]>[0];
type StorageAccess = Pick<Storage, "getItem" | "setItem">;
export interface PersonalGradient { id: string; name: string; settings: GradientSettingsV1 }
export const GRADIENT_STORAGE_KEY = "motion.gradient.library.v1";
const validPersonalGradient = (p: PersonalGradient): boolean => Boolean(p) && typeof p.id === "string" && p.id.startsWith("custom-")
  && typeof p.name === "string" && p.name.trim().length > 0 && p.name.length <= 80 && isGradientSettings(p.settings);
export function readGradientLibrary(storage?: StorageAccess): PersonalGradient[] {
  try {
    const raw: unknown = JSON.parse(storage?.getItem(GRADIENT_STORAGE_KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter(validPersonalGradient)
      .slice(0, 200).map((p: PersonalGradient) => ({ ...p, settings: cloneGradientSettings(p.settings) })) : [];
  } catch { return []; }
}
/** Grava preservando o anterior (storage-safety.ts): um registro que a leitura
 * não aproveitou por inteiro fica guardado antes de ser substituído. */
export function writeGradientLibrary(storage: StorageAccess | undefined, presets: PersonalGradient[]): boolean {
  return protectedWrite(storage, GRADIENT_STORAGE_KEY, JSON.stringify(presets),
    raw => parsesAs(raw, value => Array.isArray(value) && value.length <= 200 && value.every(item => validPersonalGradient(item as PersonalGradient))));
}
export function gradientValue(settings: GradientSettingsV1, key: string): unknown {
  const match = /^stops\.(\d)\.(enabled|color|position)$/.exec(key);
  return match ? settings.stops[Number(match[1])]![match[2] as "enabled" | "color" | "position"] : settings[key as GradientScalarKey];
}
function setValue(settings: GradientSettingsV1, key: string, value: unknown): void {
  const match = /^stops\.(\d)\.(enabled|color|position)$/.exec(key);
  if (match) Object.assign(settings.stops[Number(match[1])]!, { [match[2]!]: Array.isArray(value) ? [...value] : value });
  else Object.assign(settings, { [key]: value });
}
export function isGradientReadData(value: unknown): value is GradientReadData {
  if (!value || typeof value !== "object") return false;
  const data = value as GradientReadData;
  const keys = (v: unknown): v is string[] => Array.isArray(v) && v.every(k => typeof k === "string" && GRADIENT_PARAMETER_KEYS.includes(k));
  return (data.settings === null || isGradientSettings(data.settings)) && typeof data.selectionToken === "string"
    && Number.isInteger(data.selectionCount) && data.selectionCount >= 0 && Number.isInteger(data.appliedCount)
    && data.appliedCount >= 0 && data.appliedCount <= data.selectionCount
    && typeof data.capabilities?.nativeAvailable === "boolean" && keys(data.mixedKeys) && keys(data.lockedKeys)
    && Array.isArray(data.instances) && data.instances.length === data.appliedCount && data.instances.every(instance =>
      Number.isInteger(instance.layerId) && typeof instance.layerName === "string" && Number.isInteger(instance.effectIndex)
      && instance.effectIndex > 0 && isGradientSettings(instance.settings) && keys(instance.lockedKeys));
}
/** Slots are never reordered: native keyframes stay attached to their original color. */
export function reversedGradient(settings: GradientSettingsV1): GradientSettingsV1 {
  const next = cloneGradientSettings(settings);
  for (const stop of next.stops) if (stop.enabled) stop.position = 1 - stop.position;
  return next;
}
export interface GradientDraftState {
  settings: GradientSettingsV1; read: GradientReadData | null; dirty: Set<string>; revision: number;
}
export function createGradientDraft(): GradientDraftState { return { settings: cloneGradientSettings(), read: null, dirty: new Set(), revision: 0 }; }
export function commitGradientValue(state: GradientDraftState, key: string, value: unknown): boolean {
  if (!GRADIENT_PARAMETER_KEYS.includes(key) || state.read?.lockedKeys.includes(key)) return false;
  const next = cloneGradientSettings(state.settings); setValue(next, key, value);
  if (!isGradientSettings(next) || JSON.stringify(gradientValue(next, key)) === JSON.stringify(gradientValue(state.settings, key))) return false;
  state.settings = next; state.dirty.add(key); state.revision++; return true;
}
export function hydrateGradientDraft(state: GradientDraftState, data: GradientReadData, revision: number, preserveDirty = true): boolean {
  if (state.revision !== revision || !isGradientReadData(data)) return false;
  const previous = state.read;
  state.read = { ...data, settings: data.settings ? cloneGradientSettings(data.settings) : null,
    instances: data.instances.map(v => ({ ...v, settings: cloneGradientSettings(v.settings), lockedKeys: [...v.lockedKeys] })),
    mixedKeys: [...data.mixedKeys], lockedKeys: [...data.lockedKeys], capabilities: { ...data.capabilities } };
  if (data.settings) {
    const settings = cloneGradientSettings(data.settings);
    if (preserveDirty) for (const key of state.dirty) if (!data.lockedKeys.includes(key)) setValue(settings, key, gradientValue(state.settings, key));
    state.settings = settings;
  } else if (previous?.appliedCount && !preserveDirty) state.settings = cloneGradientSettings();
  if (!preserveDirty) state.dirty.clear();
  for (const key of data.lockedKeys) state.dirty.delete(key);
  return true;
}

export interface GradientEditorOptions {
  i18n: I18n;
  storage?: StorageAccess;
  context(): { isComposition: boolean; signature: string };
  read(): Promise<CommandResponse<GradientReadData>>;
  execute(args: GradientArgs): Promise<CommandResponse>;
  error(response: CommandResponse): string;
  busy?(value: boolean): void;
}
export interface GradientEditor {
  element: HTMLElement; actions: HTMLElement;
  refresh(): Promise<void>; dispose(): void;
}
const PERCENT_KEYS = new Set(["centerX", "centerY", "scale", "aspect", "offset", "depth", "bulge", "turbulence", "glow", "glowThreshold", "highlightProtection", "diffusion", "focusX", "focusY", "focusRadius", "focusSoftness", "grain"]);
const SECTIONS: Array<{ id: string; keys: GradientScalarKey[] }> = [
  { id: "form", keys: ["mode", "centerX", "centerY", "scale", "aspect", "angle", "cycles", "offset"] },
  { id: "relief", keys: ["depth", "depthRadius", "bulge", "turbulence", "turbulenceScale", "seed"] },
  { id: "light", keys: ["glow", "glowRadius", "glowThreshold", "highlightProtection", "diffusion", "diffusionRadius", "focusX", "focusY", "focusRadius", "focusSoftness", "grain", "colorProcessing"] },
  { id: "animation", keys: ["animation", "duration", "phase"] }
];
export function gradientColorHex(color: readonly number[]): string {
  return `#${color.map(v => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, "0")).join("")}`;
}
export function createGradientEditor(doc: Document, options: GradientEditorOptions): GradientEditor {
  const { i18n } = options, state = createGradientDraft();
  const element = createElement(doc, "div", "ch-gradient-editor"), actions = createElement(doc, "div", "ch-panel-action-bar ch-gradient-actions");
  const status = createElement(doc, "div", "ch-gradient-status"); status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite");
  element.appendChild(hint(doc, i18n.t("gradient.help"))); element.appendChild(status);
  const fields = createElement(doc, "div", "ch-gradient-fields"); element.appendChild(fields);
  const disclosures = new Set(["colors"]), controls: ActionButtonController[] = [];
  let alive = true, reading = false, running = false, readSequence = 0, readContext = "", readFailed = false;
  let message = "", selectedSlot = 0, gesture = false, personal = readGradientLibrary(options.storage), presetName = "";
  let fieldBindings: Array<{ key: string; root: HTMLElement; inputs: (HTMLInputElement | HTMLSelectElement)[] }> = [];
  let invalidKeys = new Set<string>();
  const inputDrafts = new Set<string>();
  let markers: HTMLButtonElement[] = [], bar: HTMLElement;
  const locked = (key: string): boolean => Boolean(state.read?.lockedKeys.includes(key));
  const allApplied = (): boolean => Boolean(state.read && state.read.selectionCount > 0 && state.read.appliedCount === state.read.selectionCount);
  const invalid = (): boolean => invalidKeys.size > 0;
  const editing = (): boolean => gesture || inputDrafts.size > 0 || fieldBindings.some(binding =>
    binding.inputs.some(input => input.hasAttribute?.("data-scrub-pressed"))
    || Array.from(binding.root.getElementsByTagName("button")).some(button => button.getAttribute("data-dragging") === "true"));
  const reason = (action: "apply" | "create-background" | "remove" = "apply"): string | null => {
    if (running) return i18n.t("gradient.working");
    if (!options.context().isComposition) return i18n.t("gradient.noComp");
    if (readFailed) return i18n.t("gradient.readFailed");
    if (!state.read) return i18n.t("gradient.reading");
    if (!state.read.capabilities.nativeAvailable) return i18n.t("gradient.unavailable");
    if (action !== "create-background" && readContext !== options.context().signature) return i18n.t("gradient.selectionChanged");
    if (action !== "create-background" && state.read.selectionCount === 0) return i18n.t("gradient.noSelection");
    if (action === "remove" && state.read.appliedCount === 0) return i18n.t("gradient.nothingToRemove");
    if (action !== "remove" && invalid()) return i18n.t("gradient.invalid");
    if (action === "apply" && allApplied() && state.dirty.size === 0) return i18n.t("gradient.upToDate");
    if (action === "apply" && !allApplied() && state.read.lockedKeys.length > 0) return i18n.t("gradient.partialLocked");
    return null;
  };
  function statusText(): string {
    if (readFailed && message) return message;
    const blocking = reason("create-background");
    if (blocking) return blocking;
    if (message) return message;
    if (state.read?.lockedKeys.length) return i18n.t("gradient.lockedHelp");
    if (state.read?.mixedKeys.length) return i18n.t("gradient.mixedHelp");
    if (state.read && state.read.appliedCount > 0 && !allApplied()) return i18n.t("gradient.partial");
    return state.read?.appliedCount ? i18n.t("gradient.live") : i18n.t("gradient.ready");
  }
  function updateChrome(): void {
    status.textContent = statusText();
    const applyReason = reason(), backgroundReason = reason("create-background"), removeReason = reason("remove");
    const applyLabel = i18n.t(allApplied() ? "gradient.update" : "gradient.apply");
    const labelNode = Array.from(apply.button.getElementsByTagName("span")).find(node => node.className === "ch-action-button__label");
    if (labelNode) labelNode.textContent = applyLabel;
    apply.button.setAttribute("aria-label", applyLabel);
    apply.setDisabled(Boolean(applyReason), applyReason ?? undefined);
    background.setDisabled(Boolean(backgroundReason), backgroundReason ?? undefined);
    remove.setDisabled(Boolean(removeReason), removeReason ?? undefined);
    for (const binding of fieldBindings) {
      const disabled = running || locked(binding.key);
      for (const button of Array.from(binding.root.getElementsByTagName("button"))) button.disabled = disabled;
      for (const input of binding.inputs) {
        input.disabled = disabled;
        input.setAttribute("aria-disabled", String(disabled));
      }
    }
    for (const control of controls) control.setDisabled(running, running ? i18n.t("gradient.working") : undefined);
    for (const marker of markers) marker.disabled = running || locked(`stops.${marker.dataset["slot"]}.position`);
  }
  function bind(key: string, root: HTMLElement): HTMLElement {
    const inputs = [...Array.from(root.getElementsByTagName("input")), ...Array.from(root.getElementsByTagName("select"))];
    fieldBindings.push({ key, root, inputs });
    root.setAttribute("data-gradient-key", key);
    if (state.read?.mixedKeys.includes(key)) { root.setAttribute("data-mixed", "true"); root.title = i18n.t("gradient.mixedField"); }
    for (const target of [...inputs, ...Array.from(root.getElementsByTagName("button"))]) {
      for (const event of ["pointerup", "pointercancel", "lostpointercapture"]) target.addEventListener(event, () => {
        if (inputs.every(input => input.getAttribute("aria-invalid") !== "true")) inputDrafts.delete(key);
      });
    }
    const stopKey = /^stops\.(\d)\.(enabled|color|position)$/.exec(key);
    for (const input of inputs) {
      if (stopKey) input.setAttribute("aria-label", i18n.t(stopKey[2] === "enabled" ? "gradient.stopEnabled" : stopKey[2] === "position" ? "gradient.stopPositionLabel" : "gradient.stop", { number: Number(stopKey[1]) + 1 }));
      input.addEventListener("input", () => { state.revision++; inputDrafts.add(key); if (input.getAttribute("aria-invalid") === "true") invalidKeys.add(key); else invalidKeys.delete(key); updateChrome(); });
      input.addEventListener("keydown", event => { if ((event as KeyboardEvent).key === "Escape") { invalidKeys.delete(key); inputDrafts.delete(key); updateChrome(); } });
      input.addEventListener("blur", () => { if (input.getAttribute("aria-invalid") !== "true") inputDrafts.delete(key); });
    }
    return root;
  }
  function fieldOptions(key: string): { disabled: boolean; disabledReason?: string; description?: string } {
    return { disabled: running || locked(key), ...(locked(key) ? { disabledReason: i18n.t("gradient.lockedHelp"), description: i18n.t("gradient.lockedField") } : {}) };
  }
  function commit(key: string, value: unknown): void {
    if (running || !alive) return;
    invalidKeys.delete(key); inputDrafts.delete(key);
    if (!commitGradientValue(state, key, value)) { syncPalette(); updateChrome(); return; }
    message = ""; syncPalette(); updateChrome();
    if (allApplied()) void mutate("update");
  }
  function addSection(id: string): HTMLElement {
    const details = createElement(doc, "details", "ch-tool-disclosure ch-gradient-section") as HTMLDetailsElement;
    details.id = `gradient-section-${id}`; details.open = disclosures.has(id);
    details.appendChild(createElement(doc, "summary", "", i18n.t(`gradient.section.${id}` as Key)));
    details.addEventListener("toggle", () => { if (details.open) disclosures.add(id); else disclosures.delete(id); });
    fields.appendChild(details); return details;
  }
  function replaceDraft(next: GradientSettingsV1): void {
    const candidate = cloneGradientSettings(next);
    for (const key of state.read?.lockedKeys ?? []) setValue(candidate, key, gradientValue(state.settings, key));
    if (!isGradientSettings(candidate)) { message = i18n.t("gradient.invalid"); updateChrome(); return; }
    for (const key of GRADIENT_PARAMETER_KEYS) if (JSON.stringify(gradientValue(candidate, key)) !== JSON.stringify(gradientValue(state.settings, key))) state.dirty.add(key);
    state.settings = candidate; state.revision++;
    invalidKeys.clear(); inputDrafts.clear(); message = ""; renderFields(); updateChrome();
    if (allApplied() && state.dirty.size) void mutate("update");
  }
  function localButton(target: HTMLElement, id: string, key: Key, onPress: () => void): ActionButtonController {
    const button = createActionButton(doc, { id, label: i18n.t(key), variant: "tertiary", onPress: () => { if (!running && alive) onPress(); } });
    controls.push(button); target.appendChild(button.element); return button;
  }
  function syncPalette(): void {
    if (!bar) return;
    const stops = state.settings.stops.map((stop, index) => ({ stop, index })).filter(v => v.stop.enabled).sort((a, b) => a.stop.position - b.stop.position);
    bar.style.background = `linear-gradient(90deg, ${stops.map(({ stop }) => `${gradientColorHex(stop.color)} ${stop.position * 100}%`).join(", ")})`;
    for (const marker of markers) {
      const slot = Number(marker.dataset["slot"]), stop = state.settings.stops[slot]!;
      marker.hidden = !stop.enabled; marker.style.left = `${stop.position * 100}%`;
      marker.style.setProperty("--gradient-stop-color", gradientColorHex(stop.color));
      marker.setAttribute("aria-valuenow", String(Math.round(stop.position * 1000) / 10));
      marker.setAttribute("aria-valuetext", i18n.t("gradient.stopPosition", { number: slot + 1, position: i18n.formatNumber(stop.position * 100, 1) }));
      marker.setAttribute("data-selected", String(slot === selectedSlot));
    }
    for (const binding of fieldBindings) {
      const match = /^stops\.(\d)\.position$/.exec(binding.key);
      if (match && !binding.inputs.includes(doc.activeElement as HTMLInputElement)) binding.inputs[0]!.value = String(Math.round(state.settings.stops[Number(match[1])]!.position * 1000) / 10);
      if (/\.enabled$/.test(binding.key)) (binding.inputs[0] as HTMLInputElement).checked = Boolean(gradientValue(state.settings, binding.key));
    }
  }
  function renderPalette(colors: HTMLElement): void {
    bar = createElement(doc, "div", "ch-gradient-bar"); bar.setAttribute("aria-label", i18n.t("gradient.palette"));
    const palette = createElement(doc, "div", "ch-gradient-palette"); palette.appendChild(bar); colors.appendChild(palette); markers = [];
    state.settings.stops.forEach((stop, slot) => {
      const key = `stops.${slot}.position`, marker = createElement(doc, "button", "ch-gradient-marker", String(slot + 1)) as HTMLButtonElement;
      marker.type = "button"; marker.dataset["slot"] = String(slot); marker.setAttribute("role", "slider");
      marker.setAttribute("aria-label", i18n.t("gradient.stop", { number: slot + 1 }));
      marker.setAttribute("aria-valuemin", "0"); marker.setAttribute("aria-valuemax", "100"); marker.title = i18n.t("gradient.stopKeyboard");
      let pointer: number | null = null, before = stop.position;
      marker.addEventListener("pointerdown", event => {
        const e = event as PointerEvent; if (running || locked(key) || e.button !== 0) return;
        e.preventDefault(); selectedSlot = slot; marker.focus(); pointer = e.pointerId; before = state.settings.stops[slot]!.position; gesture = true;
        state.revision++; marker.setPointerCapture?.(pointer); syncPalette();
      });
      marker.addEventListener("pointermove", event => {
        const e = event as PointerEvent; if (pointer !== e.pointerId || !gesture) return;
        const bounds = bar.getBoundingClientRect(); if (bounds.width <= 0) return;
        state.settings.stops[slot]!.position = Math.max(0, Math.min(1, (e.clientX - bounds.left) / bounds.width)); syncPalette();
      });
      const finish = (event: Event, cancel: boolean): void => {
        const e = event as PointerEvent; if (pointer !== e.pointerId) return;
        const value = state.settings.stops[slot]!.position; state.settings.stops[slot]!.position = before;
        pointer = null; gesture = false;
        if (cancel) syncPalette(); else commit(key, value);
      };
      marker.addEventListener("pointerup", e => finish(e, false)); marker.addEventListener("pointercancel", e => finish(e, true));
      marker.addEventListener("lostpointercapture", e => { if (pointer !== null) finish(e, true); });
      marker.addEventListener("keydown", event => {
        const e = event as KeyboardEvent; if (running || locked(key)) return;
        const step = e.shiftKey ? .1 : e.altKey ? .001 : .01, current = state.settings.stops[slot]!.position;
        const value = e.key === "Home" ? 0 : e.key === "End" ? 1 : ["ArrowRight", "ArrowUp"].includes(e.key) ? current + step : ["ArrowLeft", "ArrowDown"].includes(e.key) ? current - step : null;
        if (value === null) return; e.preventDefault(); selectedSlot = slot; commit(key, Math.max(0, Math.min(1, Number(value.toFixed(4)))));
      });
      markers.push(marker); palette.appendChild(marker);
    });
    colors.appendChild(hint(doc, i18n.t("gradient.paletteHelp")));
    state.settings.stops.forEach((stop, slot) => {
      const row = createElement(doc, "div", "ch-gradient-stop"), prefix = `stops.${slot}`;
      row.appendChild(bind(`${prefix}.enabled`, checkboxField(doc, { id: `gradient-stop-${slot}-enabled`, label: String(slot + 1), checked: stop.enabled,
        ...fieldOptions(`${prefix}.enabled`), onChange: value => commit(`${prefix}.enabled`, value) })));
      row.appendChild(bind(`${prefix}.color`, colorField(doc, { id: `gradient-stop-${slot}-color`, label: i18n.t("gradient.color"), value: gradientColorHex(stop.color),
        ...fieldOptions(`${prefix}.color`), onCommit: value => commit(`${prefix}.color`, [1, 3, 5].map(index => parseInt(value.slice(index, index + 2), 16) / 255)) })));
      row.appendChild(bind(`${prefix}.position`, numberField(doc, { id: `gradient-stop-${slot}-position`, label: i18n.t("gradient.position"), value: Number((stop.position * 100).toFixed(1)), min: 0, max: 100, step: .1, unit: "%",
        ...fieldOptions(`${prefix}.position`), onInput: () => { state.revision++; inputDrafts.add(`${prefix}.position`); }, onCommit: value => commit(`${prefix}.position`, value / 100) })));
      colors.appendChild(row);
    });
    const toolbar = createElement(doc, "div", "ch-gradient-toolbar"); colors.appendChild(toolbar);
    localButton(toolbar, "gradient-reverse", "gradient.reverse", () => replaceDraft(reversedGradient(state.settings)));
    localButton(toolbar, "gradient-reset", "action.reset", () => replaceDraft(cloneGradientSettings()));
    syncPalette();
  }
  function renderFields(): void {
    const active = doc.activeElement as HTMLInputElement | null;
    const activeId = active?.id;
    const selectionStart = active?.selectionStart, selectionEnd = active?.selectionEnd;
    controls.splice(0);
    while (fields.firstChild) fields.removeChild(fields.firstChild);
    fieldBindings = [];
    const colors = addSection("colors");
    const recipes = [...GRADIENT_PRESETS.map(recipe => ({ value: recipe.id, label: i18n.t(`gradient.preset.${recipe.id}`), settings: recipe.settings })),
      ...personal.map(recipe => ({ value: recipe.id, label: recipe.name, settings: recipe.settings }))];
    const matching = recipes.find(recipe => JSON.stringify(recipe.settings) === JSON.stringify(state.settings));
    const preset = selectField(doc, { id: "gradient-preset", label: i18n.t("gradient.preset"), value: matching?.value ?? "custom",
      options: [...(!matching ? [{ value: "custom", label: i18n.t("gradient.custom") }] : []), ...recipes.map(({ value, label }) => ({ value, label }))],
      disabled: running, onChange: value => { const found = recipes.find(recipe => recipe.value === value); if (found && !running) replaceDraft(cloneGradientSettings(found.settings)); } });
    colors.appendChild(bind("preset", preset)); renderPalette(colors);
    const save = createElement(doc, "details", "ch-tool-disclosure ch-gradient-save"); save.appendChild(createElement(doc, "summary", "", i18n.t("gradient.save")));
    const name = textField(doc, { id: "gradient-preset-name", label: i18n.t("gradient.presetName"), value: presetName, maxLength: 80, onCommit: value => { presetName = value.trim(); } });
    name.getElementsByTagName("input")[0]!.addEventListener("input", event => { presetName = (event.target as HTMLInputElement).value.trim(); });
    save.appendChild(bind("presetName", name)); colors.appendChild(save);
    localButton(save, "gradient-save-preset", "gradient.save", () => {
      if (!presetName || invalid()) { message = i18n.t("gradient.nameRequired"); updateChrome(); return; }
      const item = { id: `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, name: presetName.slice(0, 80), settings: cloneGradientSettings(state.settings) };
      const next = [...personal, item].slice(-200);
      if (writeGradientLibrary(options.storage, next)) { personal = next; message = i18n.t("gradient.saved"); renderFields(); }
      else message = i18n.t("gradient.storageFailed");
      updateChrome();
    });
    for (const section of SECTIONS) {
      const target = addSection(section.id);
      for (const key of section.keys) {
        const spec = GRADIENT_SCALARS.find(item => item.key === key)!;
        const label = i18n.t(`gradient.${key}` as Key);
        if (spec.kind === "enum") target.appendChild(bind(key, selectField(doc, { id: `gradient-${key}`, label, value: String(state.settings[key]),
          options: spec.options!.map(value => ({ value, label: i18n.t(`gradient.option.${value}` as Key) })), ...fieldOptions(key), onChange: value => commit(key, value) })));
        else {
          const multiplier = PERCENT_KEYS.has(key) ? 100 : 1;
          const unit = multiplier === 100 ? "%" : /Radius$/.test(key) || key === "turbulenceScale" ? "px" : key === "angle" || key === "phase" ? "°" : key === "duration" ? "s" : "";
          target.appendChild(bind(key, numberField(doc, { id: `gradient-${key}`, label, value: Number((Number(state.settings[key]) * multiplier).toFixed(3)),
            min: spec.min! * multiplier, max: spec.max! * multiplier, step: spec.kind === "integer" ? 1 : .01, unit, ...fieldOptions(key),
            onInput: () => { state.revision++; inputDrafts.add(key); }, onCommit: value => commit(key, value / multiplier) })));
        }
      }
      if (section.id === "light") target.appendChild(hint(doc, i18n.t("gradient.linearHelp")));
    }
    if (activeId) {
      const next = fieldBindings.flatMap(binding => binding.inputs).find(input => input.id === activeId);
      if (next && !next.disabled) {
        next.focus();
        if (typeof selectionStart === "number" && typeof selectionEnd === "number" && next.tagName.toLowerCase() === "input") {
          try { (next as HTMLInputElement).setSelectionRange?.(selectionStart, selectionEnd); } catch { /* Native color inputs do not expose text selection. */ }
        }
      }
    }
  }
  async function refresh(force = false): Promise<void> {
    if (!alive || reading || running || !force && (editing() || invalid())) return;
    const context = options.context();
    if (!context.isComposition) { state.read = null; updateChrome(); return; }
    reading = true; const ticket = ++readSequence, revision = state.revision;
    try {
      const response = await options.read();
      if (!alive || running || ticket !== readSequence || options.context().signature !== context.signature || state.revision !== revision || !force && editing()) return;
      if (!response.ok || !isGradientReadData(response.data)) { readFailed = true; message = response.ok ? i18n.t("gradient.readFailed") : options.error(response); updateChrome(); return; }
      const targetChanged = readContext !== "" && readContext !== context.signature;
      const previous = JSON.stringify([state.read?.lockedKeys, state.read?.mixedKeys]), priorSettings = JSON.stringify(state.settings);
      if (hydrateGradientDraft(state, response.data, revision, !targetChanged)) {
        readContext = context.signature; readFailed = false;
        if (targetChanged) { invalidKeys = new Set(); inputDrafts.clear(); message = ""; }
        if (previous !== JSON.stringify([state.read?.lockedKeys, state.read?.mixedKeys]) || priorSettings !== JSON.stringify(state.settings)) renderFields();
        updateChrome();
      }
    } catch { if (alive && ticket === readSequence) { readFailed = true; message = i18n.t("gradient.readFailed"); updateChrome(); } }
    finally { reading = false; }
  }
  async function mutate(action: "apply" | "update" | "create-background" | "remove"): Promise<void> {
    if (!alive || reason(action === "update" ? "apply" : action)) { updateChrome(); return; }
    const keys = [...state.dirty], revision = state.revision, settings = cloneGradientSettings(state.settings);
    const selectionToken = state.read!.selectionToken;
    const args: GradientArgs = action === "remove" ? { action, selectionToken } : action === "update" ? { action, settings, changedKeys: keys, selectionToken }
      : action === "create-background" ? { action, settings } : { action, settings, selectionToken };
    running = true; readSequence++; options.busy?.(true); updateChrome();
    let success = false;
    try {
      const response = await options.execute(args);
      if (!alive) return;
      success = response.ok;
      if (response.ok) {
        if (state.revision === revision) state.dirty.clear();
        message = i18n.t(action === "remove" ? "gradient.removed" : action === "create-background" ? "gradient.backgroundCreated" : "gradient.applied");
      } else message = options.error(response);
    } catch { if (alive) message = i18n.t("gradient.operationFailed"); }
    finally {
      running = false; options.busy?.(false);
      if (alive) {
        updateChrome();
        if (success) await refresh(true);
      }
    }
  }
  const actionButton = (id: string, label: Key, variant: "primary" | "tertiary" | "destructive", onPress: () => void): ActionButtonController => {
    const control = createActionButton(doc, { id, label: i18n.t(label), variant, onPress }); actions.appendChild(control.element); return control;
  };
  const background = actionButton("gradient-background", "gradient.createBackground", "tertiary", () => { void mutate("create-background"); });
  const remove = actionButton("gradient-remove", "gradient.remove", "destructive", () => { void mutate("remove"); });
  const apply = actionButton("gradient-apply", "gradient.apply", "primary", () => { void mutate(allApplied() ? "update" : "apply"); });
  apply.element.classList.add("ch-panel-action-bar__primary");
  const retry = createActionButton(doc, { id: "gradient-refresh", label: i18n.t("gradient.refresh"), variant: "tertiary", onPress: () => { void refresh(true); } });
  element.appendChild(retry.element);
  renderFields(); updateChrome();
  return { element, actions, refresh: () => refresh(), dispose() {
    alive = false; readSequence++; for (const control of [...controls, apply, background, remove, retry]) control.setDisabled(true, i18n.t("gradient.reading"));
  } };
}
