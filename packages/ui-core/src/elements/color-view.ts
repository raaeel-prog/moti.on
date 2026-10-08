import { element as createElement } from "../component-dom.js";
import { clampHsv, hexToHsv, hsvToHex, type Hsv } from "../color-math.js";
import { createI18n } from "../i18n.js";
import { closeOpenDropdown } from "./dropdown-view.js";

/**
 * In-panel color picker.
 *
 * The native `<input type=color>` opens a Chromium popup sized against the CEP
 * panel; in a short panel (280×280 is the AE minimum) it does not fit and never
 * opens. This surface lives inside the panel, measures the space it actually has
 * and degrades from an anchored popover to a compact sheet instead of refusing.
 *
 * Value contract: the picker previews locally while open and commits once when
 * it closes (Enter, close button, outside click or a host picker result).
 * Escape restores the value from before opening. One commit per session keeps a
 * host mutation to a single Undo step.
 */

export interface ColorPickerConfig {
  /** Recently committed colors, most recent first. */
  recent?: { list(): readonly string[]; record(hex: string): void };
  /** Optional host dialog (e.g. ExtendScript `$.colorPicker`). Resolves `null` on cancel. */
  native?: { label?: string; pick(current: string): Promise<string | null> };
}

export interface ColorPickerOptions {
  id: string;
  label: string;
  /** `#rrggbb`. */
  value: string;
  description?: string;
  disabled?: boolean;
  disabledReason?: string;
  onCommit(value: string): void;
}

export interface ColorPicker {
  readonly trigger: HTMLButtonElement;
  readonly isOpen: boolean;
  value(): string;
  update(value: string): void;
  setDisabled(disabled: boolean, reason?: string): void;
  open(): void;
  /** `deferCommit` runs `onCommit` in a microtask (used while the shell rerenders). */
  close(commit?: boolean, deferCommit?: boolean): void;
}

export interface ColorSurfaceLayout {
  mode: "popover" | "sheet";
  side: "above" | "below" | "inset";
  left: number;
  top: number;
  width: number;
  maxHeight: number;
  areaHeight: number;
}

export interface AnchorRect { left: number; top: number; bottom: number; width: number; }

const MARGIN = 8;
const GAP = 4;
const POPOVER_WIDTH = 240;
const SHEET_MAX_WIDTH = 360;
const AREA_MAX = 140;
const AREA_MIN_POPOVER = 96;
const AREA_MIN_SHEET = 56;
/** Vertical chrome around the S/V area, mirrored by `.ch-color-surface` in components.css. */
const CHROME_BASE = 118;
const CHROME_RECENT = 28;
const CHROME_NATIVE = 36;

const configs = new WeakMap<Document, ColorPickerConfig>();
const openPickers = new WeakMap<Document, (commit: boolean) => void>();

/** Panel-wide services for every picker in this document (recent colors, host dialog). */
export function configureColorPickers(doc: Document, config: ColorPickerConfig): void {
  configs.set(doc, { ...config });
}

/** Closes the open picker; with `commit`, its choice is confirmed after the current task. */
export function closeOpenColorPicker(doc: Document, commit = false): void { openPickers.get(doc)?.(commit); }

/** Same probe as the dropdown: UXP has custom elements but no reliable overlays. */
export function supportsColorOverlay(doc: Document): boolean {
  try {
    const probe = doc.createElement("div") as HTMLElement & { animate?: unknown };
    return typeof probe.animate === "function" && typeof probe.getBoundingClientRect === "function"
      && typeof doc.addEventListener === "function" && Boolean(doc.body);
  } catch { return false; }
}

export function colorSurfaceChrome(options: { recent: boolean; native: boolean }): number {
  return CHROME_BASE + (options.recent ? CHROME_RECENT : 0) + (options.native ? CHROME_NATIVE : 0);
}

/**
 * Pure placement. Prefers an anchored popover below the trigger, then above;
 * otherwise a sheet inset by 8 px. The sheet never refuses to open: its area
 * shrinks to a floor and the surface scrolls if the panel is even smaller.
 */
export function resolveColorSurfaceLayout(anchor: AnchorRect, viewport: { width: number; height: number }, chrome: number): ColorSurfaceLayout {
  const vw = Math.max(0, viewport.width), vh = Math.max(0, viewport.height);
  const below = vh - anchor.bottom - GAP - MARGIN;
  const above = anchor.top - GAP - MARGIN;
  const need = chrome + AREA_MIN_POPOVER;
  if (vw >= POPOVER_WIDTH + 2 * MARGIN && Math.max(below, above) >= need) {
    const side = below >= need ? "below" : "above";
    const areaHeight = Math.min(AREA_MAX, (side === "below" ? below : above) - chrome);
    const height = chrome + areaHeight;
    const left = Math.min(Math.max(MARGIN, anchor.left + anchor.width - POPOVER_WIDTH), vw - POPOVER_WIDTH - MARGIN);
    const top = side === "below" ? anchor.bottom + GAP : anchor.top - GAP - height;
    return { mode: "popover", side, left, top, width: POPOVER_WIDTH, maxHeight: height, areaHeight };
  }
  const width = Math.max(0, Math.min(SHEET_MAX_WIDTH, vw - 2 * MARGIN));
  const maxHeight = Math.max(0, vh - 2 * MARGIN);
  const areaHeight = Math.max(AREA_MIN_SHEET, Math.min(AREA_MAX, maxHeight - chrome));
  return { mode: "sheet", side: "inset", left: Math.max(MARGIN, (vw - width) / 2), top: MARGIN, width, maxHeight, areaHeight };
}

function canonical(value: string): string | null {
  const match = /^#?([0-9a-fA-F]{6})$/.exec(typeof value === "string" ? value.trim() : "");
  return match?.[1] ? `#${match[1].toLowerCase()}` : null;
}

function transitionMs(doc: Document, node: HTMLElement): number {
  const view = doc.defaultView;
  if (typeof view?.getComputedStyle !== "function") return 0;
  const style = view.getComputedStyle(node);
  return Math.max(0, ...String(style.transitionDuration ?? "0s").split(",").map(value => {
    const time = parseFloat(value);
    return Number.isFinite(time) ? time * (value.trim().endsWith("ms") ? 1 : 1000) : 0;
  }));
}

export function createColorPicker(doc: Document, options: ColorPickerOptions): ColorPicker {
  const i18n = createI18n({ locale: doc.documentElement?.lang || "pt-BR" });
  let committed = canonical(options.value) ?? "#000000";
  let disabled = options.disabled === true;
  let disabledReason = options.disabledReason;
  let hsv: Hsv = hexToHsv(committed) ?? { h: 0, s: 0, v: 0 };
  let initial = committed;
  let isOpen = false;

  const trigger = createElement(doc, "button", "ch-color-trigger") as HTMLButtonElement;
  trigger.type = "button";
  trigger.id = options.id;
  trigger.setAttribute("data-focus-key", options.id);
  trigger.setAttribute("aria-haspopup", "dialog");
  trigger.setAttribute("aria-expanded", "false");
  trigger.setAttribute("aria-controls", `${options.id}-picker`);
  trigger.setAttribute("data-motion", "button-press");
  if (options.description) trigger.setAttribute("aria-describedby", `${options.id}-description`);
  const triggerSwatch = createElement(doc, "span", "ch-color-trigger__swatch");
  triggerSwatch.setAttribute("aria-hidden", "true");
  const triggerHex = createElement(doc, "span", "ch-color-trigger__hex");
  triggerHex.setAttribute("aria-hidden", "true");
  trigger.appendChild(triggerSwatch);
  trigger.appendChild(triggerHex);

  function paintTrigger(preview: string): void {
    if (triggerSwatch.style) triggerSwatch.style.backgroundColor = preview;
    triggerHex.textContent = preview.toUpperCase();
    trigger.setAttribute("data-value", committed);
    trigger.setAttribute("aria-label", i18n.t("color.picker.open", { label: options.label, hex: committed.toUpperCase() }));
  }
  function syncDisabled(): void {
    trigger.disabled = disabled;
    trigger.setAttribute("aria-disabled", String(disabled));
    trigger.title = disabled ? disabledReason ?? options.label : options.label;
  }
  paintTrigger(committed);
  syncDisabled();

  // Surface parts exist only while open.
  let surface: HTMLElement | null = null;
  // Outside clicks land on this layer: the first click only confirms and
  // closes, so a rerender can never swallow a click meant for another control.
  let backdrop: HTMLElement | null = null;
  let area: HTMLElement | null = null, areaThumb: HTMLElement | null = null;
  let hue: HTMLElement | null = null, hueThumb: HTMLElement | null = null;
  let hexInput: HTMLInputElement | null = null;
  let before: HTMLButtonElement | null = null, after: HTMLElement | null = null;
  let nativeButton: HTMLButtonElement | null = null;
  let observer: MutationObserver | undefined;
  let exitTimer: ReturnType<typeof setTimeout> | undefined;
  let dragging: "area" | "hue" | null = null;

  const current = (): string => hsvToHex(hsv);

  function render(skipHex = false): void {
    const hex = current();
    paintTrigger(hex);
    if (!surface) return;
    area!.style.backgroundColor = hsvToHex({ h: hsv.h, s: 1, v: 1 });
    areaThumb!.style.left = `${(hsv.s * 100).toFixed(2)}%`;
    areaThumb!.style.top = `${((1 - hsv.v) * 100).toFixed(2)}%`;
    areaThumb!.style.backgroundColor = hex;
    area!.setAttribute("aria-valuetext", i18n.t("color.picker.areaValue", { s: Math.round(hsv.s * 100), v: Math.round(hsv.v * 100) }));
    hueThumb!.style.left = `${(hsv.h / 360 * 100).toFixed(2)}%`;
    hueThumb!.style.backgroundColor = hsvToHex({ h: hsv.h, s: 1, v: 1 });
    hue!.setAttribute("aria-valuenow", String(Math.round(hsv.h)));
    after!.style.backgroundColor = hex;
    if (!skipHex && hexInput) { hexInput.value = hex.toUpperCase(); hexInput.setAttribute("aria-invalid", "false"); }
  }

  function set(next: Hsv, skipHex = false): void { hsv = clampHsv(next); render(skipHex); }

  function fromPointer(event: PointerEvent | MouseEvent): void {
    const target = dragging === "hue" ? hue : area;
    if (!target) return;
    const rect = target.getBoundingClientRect();
    const x = rect.width > 0 ? Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)) : 0;
    if (dragging === "hue") set({ ...hsv, h: x * 359.999 });
    else {
      const y = rect.height > 0 ? Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)) : 0;
      set({ ...hsv, s: x, v: 1 - y });
    }
  }

  const config = (): ColorPickerConfig => configs.get(doc) ?? {};
  const browser = doc.defaultView as (Window & typeof globalThis) | null;
  const viewport = (): { width: number; height: number } => ({
    width: doc.documentElement?.clientWidth || browser?.innerWidth || 360,
    height: browser?.innerHeight || doc.documentElement?.clientHeight || 640
  });

  function layout(): void {
    if (!surface) return;
    const rect = trigger.getBoundingClientRect();
    const recent = (config().recent?.list() ?? []).length > 0;
    const placed = resolveColorSurfaceLayout(rect, viewport(), colorSurfaceChrome({ recent, native: Boolean(config().native) }));
    surface.setAttribute("data-layout", placed.mode);
    backdrop?.setAttribute("data-layout", placed.mode);
    surface.setAttribute("data-side", placed.side);
    surface.style.left = `${Math.round(placed.left)}px`;
    surface.style.top = `${Math.round(placed.top)}px`;
    surface.style.width = `${Math.round(placed.width)}px`;
    surface.style.maxHeight = `${Math.round(placed.maxHeight)}px`;
    surface.style.setProperty?.("--ch-color-area-height", `${Math.round(placed.areaHeight)}px`);
    // Grow from the trigger: origin sits on the edge nearest the anchor.
    const originX = Math.max(0, Math.min(placed.width, rect.left + rect.width / 2 - placed.left));
    surface.style.transformOrigin = placed.side === "inset" ? "50% 30%" : `${Math.round(originX)}px ${placed.side === "below" ? "0" : "100%"}`;
  }

  function resized(): void { layout(); }

  function detach(): void {
    browser?.removeEventListener?.("resize", resized);
    observer?.disconnect();
    observer = undefined;
  }
  function removeSurface(): void {
    if (exitTimer !== undefined) clearTimeout(exitTimer);
    exitTimer = undefined;
    surface?.parentNode?.removeChild(surface);
    backdrop?.parentNode?.removeChild(backdrop);
    backdrop = null;
    surface = area = areaThumb = hue = hueThumb = after = null;
    hexInput = null; before = null; nativeButton = null;
  }
  /** Silent teardown when the trigger leaves the document. */
  function dispose(): void {
    if (!isOpen) return;
    isOpen = false; dragging = null;
    trigger.setAttribute("aria-expanded", "false");
    detach(); removeSurface();
    if (openPickers.get(doc) === external) openPickers.delete(doc);
  }
  const external = (commit: boolean): void => { if (commit) close(true, true); else dispose(); };

  function focusables(): HTMLElement[] {
    if (!surface || typeof surface.querySelectorAll !== "function") return [];
    return [area, hue, before, hexInput, ...Array.from(surface.querySelectorAll<HTMLElement>(".ch-color-recent button")), nativeButton,
      surface.querySelector<HTMLElement>(".ch-color-close")].filter((node): node is HTMLElement => Boolean(node) && !(node as HTMLButtonElement).disabled);
  }

  function slider(className: string, label: string): { root: HTMLElement; thumb: HTMLElement } {
    const root = createElement(doc, "div", className);
    root.setAttribute("tabindex", "0");
    root.setAttribute("role", "slider");
    root.setAttribute("aria-label", label);
    const thumb = createElement(doc, "span", `${className}__thumb`);
    thumb.setAttribute("aria-hidden", "true");
    // Grows while grabbed through the shared catalog (A6.2 #18).
    thumb.setAttribute("data-motion", "slider-knob");
    root.appendChild(thumb);
    return { root, thumb };
  }

  function build(): HTMLElement {
    const root = createElement(doc, "div", "ch-color-surface");
    root.id = `${options.id}-picker`;
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-label", options.label);
    root.setAttribute("data-motion", "surface-morph");
    root.setAttribute("data-open", "false");

    const head = createElement(doc, "div", "ch-color-surface__head");
    head.appendChild(createElement(doc, "strong", "ch-color-surface__title", options.label));
    // Closing confirms the color, so the button says so instead of a bare ×.
    const closeButton = createElement(doc, "button", "ch-color-close", i18n.t("color.picker.close")) as HTMLButtonElement;
    closeButton.type = "button";
    closeButton.addEventListener("click", () => close(true));
    head.appendChild(closeButton);
    root.appendChild(head);

    const sv = slider("ch-color-area", i18n.t("color.picker.area"));
    area = sv.root; areaThumb = sv.thumb;
    const hueSlider = slider("ch-color-hue", i18n.t("color.picker.hue"));
    hue = hueSlider.root; hueThumb = hueSlider.thumb;
    hue.setAttribute("aria-valuemin", "0");
    hue.setAttribute("aria-valuemax", "360");
    root.appendChild(area);
    root.appendChild(hue);

    for (const [node, kind] of [[area, "area"], [hue, "hue"]] as const) {
      node.addEventListener("pointerdown", event => {
        const pointer = event as PointerEvent;
        if (pointer.button !== undefined && pointer.button !== 0) return;
        event.preventDefault();
        dragging = kind;
        node.focus();
        try { node.setPointerCapture?.(pointer.pointerId); } catch { /* capture is a nicety */ }
        node.setAttribute("data-dragging", "true");
        (kind === "hue" ? hueThumb : areaThumb)?.setAttribute("data-dragging", "true");
        fromPointer(pointer);
      });
      node.addEventListener("pointermove", event => { if (dragging === kind) fromPointer(event as PointerEvent); });
      const end = (): void => {
        if (dragging !== kind) return;
        dragging = null;
        node.removeAttribute("data-dragging");
        (kind === "hue" ? hueThumb : areaThumb)?.removeAttribute("data-dragging");
      };
      node.addEventListener("pointerup", end);
      node.addEventListener("pointercancel", end);
      node.addEventListener("lostpointercapture", end);
    }
    area.addEventListener("keydown", event => {
      const key = (event as KeyboardEvent).key, step = (event as KeyboardEvent).shiftKey ? 0.1 : 0.01;
      const moves: Record<string, Partial<Hsv>> = {
        ArrowLeft: { s: hsv.s - step }, ArrowRight: { s: hsv.s + step },
        ArrowUp: { v: hsv.v + step }, ArrowDown: { v: hsv.v - step }
      };
      if (!moves[key]) return;
      event.preventDefault();
      set({ ...hsv, ...moves[key] });
    });
    hue.addEventListener("keydown", event => {
      const key = (event as KeyboardEvent).key, step = (event as KeyboardEvent).shiftKey ? 10 : 1;
      const next = key === "ArrowLeft" || key === "ArrowDown" ? hsv.h - step : key === "ArrowRight" || key === "ArrowUp" ? hsv.h + step
        : key === "Home" ? 0 : key === "End" ? 359.999 : null;
      if (next === null) return;
      event.preventDefault();
      set({ ...hsv, h: Math.min(359.999, Math.max(0, next)) });
    });

    const row = createElement(doc, "div", "ch-color-row");
    const preview = createElement(doc, "span", "ch-color-preview");
    before = createElement(doc, "button", "ch-color-preview__before") as HTMLButtonElement;
    before.type = "button";
    before.style.backgroundColor = initial;
    before.title = i18n.t("color.picker.previous");
    before.setAttribute("aria-label", `${i18n.t("color.picker.previous")} ${initial.toUpperCase()}`);
    before.addEventListener("click", () => { const back = hexToHsv(initial); if (back) set(back); });
    after = createElement(doc, "span", "ch-color-preview__after");
    after.setAttribute("aria-hidden", "true");
    preview.appendChild(before);
    preview.appendChild(after);
    row.appendChild(preview);
    hexInput = createElement(doc, "input", "ch-color-hex-input") as HTMLInputElement;
    hexInput.type = "text";
    hexInput.maxLength = 7;
    hexInput.setAttribute("spellcheck", "false");
    hexInput.setAttribute("autocomplete", "off");
    hexInput.setAttribute("aria-label", i18n.t("color.picker.hex"));
    hexInput.addEventListener("input", () => {
      const parsed = hexToHsv(hexInput!.value);
      hexInput!.setAttribute("aria-invalid", String(!parsed));
      if (parsed) set(parsed, true);
    });
    hexInput.addEventListener("keydown", event => {
      if ((event as KeyboardEvent).key !== "Enter") return;
      event.preventDefault();
      if (hexToHsv(hexInput!.value)) close(true);
      else hexInput!.setAttribute("aria-invalid", "true");
    });
    hexInput.addEventListener("blur", () => { if (hexInput) { hexInput.value = current().toUpperCase(); hexInput.setAttribute("aria-invalid", "false"); } });
    row.appendChild(hexInput);
    root.appendChild(row);

    const recentColors = (config().recent?.list() ?? []).filter(value => hexToHsv(value)).slice(0, 8);
    if (recentColors.length) {
      const recent = createElement(doc, "div", "ch-color-recent");
      recent.setAttribute("role", "group");
      recent.setAttribute("aria-label", i18n.t("color.picker.recent"));
      for (const value of recentColors) {
        const chip = createElement(doc, "button", "ch-color-recent__chip") as HTMLButtonElement;
        chip.type = "button";
        chip.style.backgroundColor = value;
        chip.title = value.toUpperCase();
        chip.setAttribute("aria-label", value.toUpperCase());
        chip.addEventListener("click", () => { const next = hexToHsv(value); if (next) set(next); });
        recent.appendChild(chip);
      }
      root.appendChild(recent);
    }

    const host = config().native;
    if (host) {
      nativeButton = createElement(doc, "button", "ch-color-native", host.label ?? i18n.t("color.picker.native")) as HTMLButtonElement;
      nativeButton.type = "button";
      nativeButton.addEventListener("click", () => {
        if (!nativeButton || nativeButton.disabled) return;
        const button = nativeButton;
        button.disabled = true;
        button.setAttribute("aria-busy", "true");
        host.pick(current()).then(result => {
          const next = result ? hexToHsv(result) : null;
          if (!isOpen) return;
          if (next) { set(next); close(true); return; }
          button.disabled = false; button.removeAttribute("aria-busy");
        }, () => { if (isOpen) { button.disabled = false; button.removeAttribute("aria-busy"); } });
      });
      root.appendChild(nativeButton);
    }

    root.addEventListener("keydown", event => {
      const keyboard = event as KeyboardEvent;
      if (keyboard.key === "Escape") { event.preventDefault(); event.stopPropagation?.(); close(false); return; }
      if (keyboard.key === "Enter" && keyboard.target !== hexInput && (keyboard.target === area || keyboard.target === hue)) {
        event.preventDefault(); close(true); return;
      }
      if (keyboard.key !== "Tab") return;
      const order = focusables();
      if (!order.length) return;
      const index = order.indexOf(doc.activeElement as HTMLElement);
      if (keyboard.shiftKey && index <= 0) { event.preventDefault(); order[order.length - 1]!.focus(); }
      else if (!keyboard.shiftKey && index === order.length - 1) { event.preventDefault(); order[0]!.focus(); }
    });
    return root;
  }

  function open(): void {
    if (disabled || isOpen) return;
    closeOpenDropdown(doc);
    const previous = openPickers.get(doc);
    if (previous) previous(true);
    if (exitTimer !== undefined) { clearTimeout(exitTimer); exitTimer = undefined; removeSurface(); }
    isOpen = true;
    initial = committed;
    hsv = hexToHsv(committed) ?? hsv;
    surface = build();
    backdrop = createElement(doc, "div", "ch-color-backdrop");
    backdrop.setAttribute("aria-hidden", "true");
    backdrop.setAttribute("data-motion", "drawer-dimmer");
    backdrop.addEventListener("mousedown", event => { event.preventDefault(); close(true); });
    doc.body.appendChild(backdrop);
    doc.body.appendChild(surface);
    layout();
    render();
    trigger.setAttribute("aria-expanded", "true");
    surface.getBoundingClientRect();
    surface.setAttribute("data-open", "true");
    backdrop.setAttribute("data-open", "true");
    openPickers.set(doc, external);
    browser?.addEventListener?.("resize", resized);
    if (typeof browser?.MutationObserver === "function") {
      observer = new browser.MutationObserver(() => { if (!doc.documentElement.contains(trigger)) dispose(); });
      observer.observe(doc.body, { childList: true, subtree: true });
    }
    area?.focus();
  }

  function close(commit = true, deferCommit = false): void {
    if (!isOpen || !surface) return;
    isOpen = false; dragging = null;
    const next = current();
    detach();
    if (openPickers.get(doc) === external) openPickers.delete(doc);
    trigger.setAttribute("aria-expanded", "false");
    const closing = surface;
    if (backdrop) { backdrop.style.pointerEvents = "none"; backdrop.setAttribute("data-open", "false"); }
    closing.setAttribute("data-open", "false");
    closing.setAttribute("aria-hidden", "true");
    closing.style.pointerEvents = "none";
    const duration = transitionMs(doc, closing);
    if (duration > 0) exitTimer = setTimeout(removeSurface, duration);
    else removeSurface();
    const changed = commit && next !== committed;
    if (changed) committed = next;
    else hsv = hexToHsv(committed) ?? hsv;
    paintTrigger(committed);
    // Focus first: a consumer that rerenders restores focus by data-focus-key.
    if (trigger.isConnected !== false) trigger.focus();
    if (changed) {
      const value = committed;
      config().recent?.record(value);
      if (deferCommit) queueMicrotask(() => options.onCommit(value));
      else options.onCommit(value);
    }
  }

  trigger.addEventListener("click", () => { if (isOpen) close(true); else open(); });
  trigger.addEventListener("keydown", event => {
    const key = (event as KeyboardEvent).key;
    if (key === "ArrowDown" || key === "ArrowUp") { event.preventDefault(); open(); }
  });

  return {
    trigger,
    get isOpen() { return isOpen; },
    value: () => committed,
    update(value) {
      const next = canonical(value);
      if (!next) return;
      committed = next;
      if (!isOpen) { hsv = hexToHsv(next) ?? hsv; paintTrigger(committed); }
    },
    setDisabled(next, reason) {
      disabled = next; disabledReason = reason;
      if (disabled) close(false);
      syncDisabled();
    },
    open,
    close
  };
}
