import { button, createElement } from "@motion/ui-core";
import { MOTION_CATALOG } from "@motion/ui-motion";
import { createQuickActionIcon, quickActionFamily } from "./quick-action-icons.js";
import {
  QUICK_COPY, QUICK_TABS, anchorIndexForKey, stripColumns, tileIndexForLetter, tileLetter, withFavorite, withRecent,
  type QuickTab
} from "./quick-actions-keys.js";
import { browserMotionEnv } from "./motion/env.js";
import { createQuickStrip } from "./quick-strip.js";
import { uiIcon } from "./ui-icons.js";

/**
 * Action IDs, abbreviations and names retained from the user's FX Studio Quick Tools.
 * The order groups the categories — Camada (transforms the selection) · Criar (new
 * layers and PNG) · Efeitos — in the two-row strip beside the anchor.
 */
export const QUICK_ACTIONS = [
  ["precompose", "PRE", "Pré-compor seleção", "Precompose selection"],
  ["center", "CTR", "Centralizar na composição", "Center in composition"],
  ["fit", "FIT", "Ajustar à composição", "Fit to composition"],
  ["freeze", "FRZ", "Congelar frame", "Freeze frame"],
  ["mirror", "MIR", "Espelhar horizontalmente", "Mirror horizontally"],
  ["dash-stroke", "DSH", "Contorno tracejado", "Dashed stroke"],
  ["create-adjustment", "ADJ", "Criar camada de ajuste", "Create adjustment layer"],
  ["create-solid", "SOL", "Criar sólido", "Create solid"],
  ["create-shape", "SHA", "Criar forma retangular", "Create rectangle shape"],
  ["create-null", "NUL", "Criar objeto nulo", "Create null object"],
  ["create-camera", "CAM", "Criar câmera", "Create camera"],
  ["save-frame", "PNG", "Salvar frame em PNG", "Save frame as PNG"],
  ["effect-hue", "HUE", "Matiz e saturação", "Hue and saturation"],
  ["effect-fill", "FILL", "Preenchimento", "Fill"],
  ["effect-tint", "TINT", "Tonalidade", "Tint"],
  ["effect-blur", "BLUR", "Desfoque", "Blur"],
  ["effect-lumetri", "LUM", "Lumetri Color", "Lumetri Color"],
  ["effect-curves", "CURV", "Curvas", "Curves"]
] as const;
/** Actions reached from the command palette only: the keyboard grid keeps its
 * two rows of nine. Brought from Brazu (Cut In Keyframes, Pin to Null). */
export const QUICK_EXTRA_ACTIONS = [
  ["trim-to-keys", "TRM", "Aparar aos keyframes selecionados", "Trim to selected keyframes"],
  ["pin-to-null", "PIN", "Pinos do Puppet em nulls", "Puppet pins to nulls"]
] as const;
/** Every quick action, grid first: names, palette entries and validation. */
export const QUICK_ALL_ACTIONS = [...QUICK_ACTIONS, ...QUICK_EXTRA_ACTIONS] as const;
export type QuickAction = typeof QUICK_ALL_ACTIONS[number][0];

/** Default favorites: the three primary shortcuts, until the user pins others. */
export const QUICK_RAIL_ACTIONS: readonly QuickAction[] = ["precompose", "center", "save-frame"];
/** The collapsed header holds at most this many favorites. */
const RAIL_MAX = 4;
const RECENT_MAX = 4;

export function quickActionName(action: QuickAction, locale: string): string {
  const item = QUICK_ALL_ACTIONS.find(item => item[0] === action)!;
  return item[locale === "pt-BR" ? 2 : 3];
}
/** Why a shortcut cannot run now, or null. Shared with the command palette. */
export function quickActionReason(action: QuickAction, context: { busy: boolean; hasComp: boolean; selectionCount: number }, locale: string): string | null {
  const pt = locale === "pt-BR";
  const needsSelection = !action.startsWith("create-") && action !== "save-frame";
  return context.busy ? (pt ? "Aguarde a ação atual." : "Wait for the current action.")
    : !context.hasComp ? (pt ? "Abra uma composição." : "Open a composition.")
      : needsSelection && !context.selectionCount ? (pt ? "Selecione uma camada." : "Select a layer.") : null;
}
export function isQuickAction(value: unknown): value is QuickAction {
  return QUICK_ALL_ACTIONS.some(item => item[0] === value);
}
const abbreviationOf = (action: QuickAction): string => QUICK_ALL_ACTIONS.find(item => item[0] === action)![1];

export interface QuickActionsContext {
  locale: string;
  busy: boolean;
  hasComp: boolean;
  selectionCount: number;
}
export interface QuickActionsOptions extends QuickActionsContext {
  /** Mounted behind the sliding inspector or coming back from it: the tiles are already there. */
  quietEntry?: boolean;
  /** Resolve `false` when the host refused or failed; any other result is a confirmed apply. */
  onAction(action: QuickAction): void | Promise<boolean | void>;
  /** A click on an unavailable shortcut explains itself instead of doing nothing. */
  onDenied?(action: QuickAction, reason: string): void;
  /** The anchor grid shown beside the actions, framed with guides and a spring puck. */
  anchor?: HTMLElement;
  /** Pinned actions (right-click / Shift+F10). Defaults to QUICK_RAIL_ACTIONS. */
  favorites?: readonly QuickAction[];
  onFavoritesChange?(favorites: readonly QuickAction[]): void;
  /** Most recent confirmed actions, newest first. */
  recents?: readonly QuickAction[];
  onRecentsChange?(recents: readonly QuickAction[]): void;
  /** Short confirmation for local changes (favorites); host results report themselves. */
  onNotice?(message: string): void;
  /** Numeric keypad 1–9 → anchor cell 0–8, only while focus is inside `keyScope`. */
  onAnchorKey?(index: number): void;
  /** Where the keyboard shortcuts listen; the controller never listens on the document. */
  keyScope?: HTMLElement;
}
export interface QuickActionsController {
  /** The two-row action grid (the scroller inside `strip`). */
  readonly element: HTMLElement;
  /** The grid with its edge fades and page buttons: mount this one. */
  readonly strip: HTMLElement;
  /** Favorite shortcuts for the collapsed dock header. */
  readonly rail: HTMLElement;
  /** Category filter shown above the grid. */
  readonly toolbar: HTMLElement;
  /** Recent actions strip and the shortcut-hint toggle, shown below the grid. */
  readonly footer: HTMLElement;
  /** The anchor grid framed with guides, a spring puck and the position name (only with `anchor`). */
  readonly anchorPanel: HTMLElement | null;
  /** Refresh availability without replacing focused buttons or their event handlers. */
  update(context: QuickActionsContext): void;
  dispose(): void;
}

type Feedback = "loading" | "success" | "idle";
type EntryKind = "tile" | "rail" | "recent";
interface FeedbackParts { spinner: Element; check: Element; dot: HTMLElement | null }
interface Entry {
  action: QuickAction;
  kind: EntryKind;
  slot: HTMLElement;
  control: HTMLButtonElement;
  key?: HTMLElement;
  parts?: FeedbackParts | null;
  timer?: ReturnType<typeof setTimeout> | undefined;
}

const SVG_NS = "http://www.w3.org/2000/svg";
const motionMs = (id: string): number => MOTION_CATALOG.find(motion => motion.id === id)!.durationMs[0]!;
/** The quick tiles stretch the catalog ripple to the prototype's 600 ms (ae-quick-actions.css). */
const RIPPLE_MS = Math.max(motionMs("tile-ripple"), 600);
/** Same gesture length as the icon motion: the refusal reads as one short shake. */
const DENIED_MS = motionMs("icon-gesture");
/** Matches --delay-spinner / --delay-applied: fast commands never flash a spinner. */
const SPINNER_DELAY_MS = 150;
const APPLIED_MS = 700;
/** Prototype tile entry: 420 ms each, 22 ms apart (ae-quick-actions.css `ch-quick-tile-in`). */
const ENTRY_MS = 420;
const ENTRY_STEP_MS = 22;
/** Anchor cell centers inside the framed pad: 15 / 45 / 75 px (see ae-quick-actions.css). */
const ANCHOR_FIRST = 15;
const ANCHOR_STEP = 30;
const ID_PREFIX: Readonly<Record<EntryKind, string>> = { tile: "library-quick-", rail: "quick-rail-", recent: "quick-recent-" };

function contains(parent: Node, node: EventTarget | null): boolean {
  let current = node as Node | null;
  while (current) { if (current === parent) return true; current = current.parentNode; }
  return false;
}
function isTextField(target: EventTarget | null): boolean {
  const tag = String((target as HTMLElement | null)?.tagName ?? "").toUpperCase();
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}
function strokeIcon(doc: Document, path: string): Element | null {
  if (typeof doc.createElementNS !== "function") return null;
  const svg = doc.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24"); svg.setAttribute("width", "14"); svg.setAttribute("height", "14");
  svg.setAttribute("aria-hidden", "true"); svg.setAttribute("focusable", "false");
  const shape = doc.createElementNS(SVG_NS, "path");
  shape.setAttribute("d", path); shape.setAttribute("fill", "none"); shape.setAttribute("stroke", "currentColor");
  shape.setAttribute("stroke-width", "2"); shape.setAttribute("stroke-linejoin", "round"); shape.setAttribute("stroke-linecap", "round");
  svg.appendChild(shape);
  return svg;
}

export function createQuickActions(doc: Document, options: QuickActionsOptions): QuickActionsController {
  const pt = options.locale === "pt-BR";
  const copy = QUICK_COPY[pt ? "pt-BR" : "en-US"];
  let context: QuickActionsContext = { locale: options.locale, busy: options.busy, hasComp: options.hasComp, selectionCount: options.selectionCount };
  let favorites: QuickAction[] = (options.favorites ?? QUICK_RAIL_ACTIONS).filter(isQuickAction);
  let recents: QuickAction[] = (options.recents ?? []).filter(isQuickAction).slice(0, RECENT_MAX);
  let tab: QuickTab = "all";
  let keysLatched = false;
  let alive = true;
  let lastApplied: Entry | null = null;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const entries: Entry[] = [];
  const disposers: Array<() => void> = [];

  function later(callback: () => void, ms: number): ReturnType<typeof setTimeout> {
    const timer = setTimeout(() => { timers.delete(timer); if (alive) callback(); }, ms);
    timers.add(timer);
    return timer;
  }
  function cancel(timer: ReturnType<typeof setTimeout> | undefined): void {
    if (timer === undefined) return;
    clearTimeout(timer); timers.delete(timer);
  }
  function listen(node: EventTarget | null | undefined, type: string, handler: (event: Event) => void): void {
    if (!node) return;
    node.addEventListener(type, handler);
    disposers.push(() => node.removeEventListener?.(type, handler));
  }
  function reasonFor(action: QuickAction): string | null {
    return quickActionReason(action, context, context.locale);
  }

  const pad = createElement(doc, "div", "ch-quick-actions");
  pad.setAttribute("role", "group");
  pad.setAttribute("aria-label", pt ? "Ações rápidas" : "Quick actions");
  pad.setAttribute("data-motion", "grid-stagger");
  pad.setAttribute("data-stagger", "false");
  pad.setAttribute("data-show-keys", "false");
  const empty = createElement(doc, "p", "ch-quick-actions__empty");
  empty.setAttribute("role", "status");
  empty.hidden = true;
  const rail = createElement(doc, "div", "ch-quick-rail");
  rail.setAttribute("role", "group");
  rail.setAttribute("aria-label", pt ? "Favoritos" : "Favorites");
  const toolbar = createElement(doc, "div", "ch-quick-actions-toolbar");
  const footer = createElement(doc, "div", "ch-quick-recents");
  footer.setAttribute("role", "group");
  footer.setAttribute("aria-label", copy.recents);
  const recentList = createElement(doc, "div", "ch-quick-recents__list");

  function ripple(node: HTMLElement, event: PointerEvent): void {
    if ((node as HTMLButtonElement).disabled || (event.button !== undefined && event.button !== 0)) return;
    if (typeof node.getBoundingClientRect !== "function") return;
    const rect = node.getBoundingClientRect();
    const wave = createElement(doc, "span", "ch-tile-ripple");
    wave.setAttribute("aria-hidden", "true");
    wave.setAttribute("data-motion", "tile-ripple");
    const size = Math.ceil(Math.max(rect.width, rect.height) * 2);
    // Keyboard activation has no pointer: the wave starts from the center.
    const x = typeof event.clientX === "number" ? event.clientX - rect.left : rect.width / 2;
    const y = typeof event.clientY === "number" ? event.clientY - rect.top : rect.height / 2;
    wave.style?.setProperty?.("--ripple-x", `${Math.round(x)}px`);
    wave.style?.setProperty?.("--ripple-y", `${Math.round(y)}px`);
    wave.style?.setProperty?.("--ripple-size", `${size}px`);
    node.appendChild(wave);
    wave.getBoundingClientRect?.();
    wave.setAttribute("data-active", "true");
    later(() => wave.parentNode?.removeChild(wave), RIPPLE_MS + 40);
  }

  function feedbackParts(entry: Entry): FeedbackParts | null {
    if (entry.parts !== undefined) return entry.parts;
    if (typeof doc.createElementNS !== "function") { entry.parts = null; return null; }
    const layer = createElement(doc, "span", "ch-tile-feedback");
    layer.setAttribute("aria-hidden", "true");
    const spinner = doc.createElementNS(SVG_NS, "svg");
    spinner.setAttribute("class", "ch-tile-spinner"); spinner.setAttribute("viewBox", "0 0 24 24");
    spinner.setAttribute("data-motion", "progress-spinner");
    const ring = doc.createElementNS(SVG_NS, "circle");
    ring.setAttribute("cx", "12"); ring.setAttribute("cy", "12"); ring.setAttribute("r", "9");
    spinner.appendChild(ring);
    const check = doc.createElementNS(SVG_NS, "svg");
    check.setAttribute("class", "ch-tile-check"); check.setAttribute("viewBox", "0 0 24 24");
    const mark = doc.createElementNS(SVG_NS, "path");
    mark.setAttribute("d", "M6 12.5l4 4 8-9");
    mark.setAttribute("data-motion", "confirmation-check");
    mark.setAttribute("style", "--motion-check-length:20");
    check.appendChild(mark);
    layer.appendChild(spinner); layer.appendChild(check);
    if (entry.kind === "tile") {
      // Running ring: a conic sweep behind a cover traces the tile border while the host works.
      for (const part of ["ring", "cover"]) {
        const node = createElement(doc, "span", `ch-quick-action__${part}`);
        node.setAttribute("aria-hidden", "true");
        entry.control.appendChild(node);
      }
    }
    entry.control.appendChild(layer);
    let dot: HTMLElement | null = null;
    if (entry.kind === "tile") {
      dot = createElement(doc, "span", "ch-quick-action__applied");
      dot.setAttribute("aria-hidden", "true");
      dot.setAttribute("data-motion", "applied-dot");
      entry.control.appendChild(dot);
    }
    entry.parts = { spinner, check: mark, dot };
    return entry.parts;
  }

  /** The most recent successful shortcut keeps a small dot, like the library tiles. */
  function markApplied(action: QuickAction): void {
    const tile = entries.find(entry => entry.kind === "tile" && entry.action === action);
    if (!tile) return;
    const parts = feedbackParts(tile);
    if (!parts?.dot) return;
    if (lastApplied && lastApplied !== tile) lastApplied.parts?.dot?.setAttribute("data-active", "false");
    parts.dot.setAttribute("data-active", "true");
    lastApplied = tile;
  }

  /** A6.4: ripple → spinner only when slow → drawn ✓ → applied dot. */
  function setFeedback(entry: Entry, next: Feedback): void {
    if (!alive) return;
    const parts = feedbackParts(entry);
    cancel(entry.timer); entry.timer = undefined;
    parts?.spinner.setAttribute("data-active", "false");
    parts?.check.setAttribute("data-active", "false");
    entry.control.setAttribute("data-running", "false");
    if (next === "loading") {
      entry.control.setAttribute("data-feedback", "loading");
      entry.control.setAttribute("aria-busy", "true");
      syncBusy();
      entry.timer = later(() => {
        parts?.spinner.setAttribute("data-active", "true");
        entry.control.setAttribute("data-running", "true");
      }, SPINNER_DELAY_MS);
      return;
    }
    entry.control.removeAttribute("aria-busy");
    if (next === "idle") { entry.control.setAttribute("data-feedback", "idle"); return; }
    entry.control.setAttribute("data-feedback", "success");
    (parts?.check as unknown as HTMLElement | undefined)?.getBoundingClientRect?.();
    parts?.check.setAttribute("data-active", "true");
    markApplied(entry.action);
    entry.timer = later(() => {
      entry.control.setAttribute("data-feedback", "idle");
      parts?.check.setAttribute("data-active", "false");
    }, APPLIED_MS);
  }

  function deny(entry: Entry): void {
    const reason = reasonFor(entry.action);
    if (!reason) return;
    entry.control.setAttribute("data-denied", "false");
    entry.control.getBoundingClientRect?.();
    entry.control.setAttribute("data-denied", "true");
    later(() => entry.control.setAttribute("data-denied", "false"), DENIED_MS + 40);
    options.onDenied?.(entry.action, reason);
  }

  function remember(action: QuickAction): void {
    const next = withRecent(recents, action, RECENT_MAX);
    if (next.join() === recents.join()) return;
    recents = next;
    options.onRecentsChange?.(recents);
    renderRecents();
  }

  function trigger(entry: Entry): void {
    if (entry.control.disabled || reasonFor(entry.action)) return;
    const result = options.onAction(entry.action);
    if (!result || typeof (result as Promise<boolean | void>).then !== "function") { remember(entry.action); return; }
    setFeedback(entry, "loading");
    (result as Promise<boolean | void>).then(
      ok => { setFeedback(entry, ok === false ? "idle" : "success"); if (ok !== false && alive) remember(entry.action); },
      () => setFeedback(entry, "idle")
    );
  }

  /** Eight sparks fly out of the star when an action is pinned (prototype burst). */
  function burst(entry: Entry): void {
    for (let index = 0; index < 8; index++) {
      const spark = createElement(doc, "span", "ch-quick-action__spark");
      spark.setAttribute("aria-hidden", "true");
      const angle = (index / 8) * Math.PI * 2;
      spark.style?.setProperty?.("--spark-x", `${Math.round(Math.cos(angle) * 16)}px`);
      spark.style?.setProperty?.("--spark-y", `${Math.round(Math.sin(angle) * 16)}px`);
      entry.control.appendChild(spark);
      later(() => spark.parentNode?.removeChild(spark), 600);
    }
  }

  function toggleFavorite(action: QuickAction): void {
    const pinned = !favorites.includes(action);
    const tile = entries.find(entry => entry.kind === "tile" && entry.action === action);
    if (pinned && tile) burst(tile);
    favorites = withFavorite(favorites, action);
    options.onFavoritesChange?.(favorites);
    options.onNotice?.(pinned ? copy.pinned(abbreviationOf(action)) : copy.unpinned(abbreviationOf(action)));
    renderRail();
    applyView();
  }

  function makeEntry(action: QuickAction, kind: EntryKind): Entry {
    const name = quickActionName(action, options.locale);
    const abbreviation = abbreviationOf(action);
    const tile = kind === "tile";
    // Disabled buttons ignore the pointer, so a click on an unavailable shortcut
    // lands on its slot, which explains the reason instead of staying silent.
    const slot = createElement(doc, "span", tile ? "ch-quick-slot" : `ch-quick-slot ch-quick-slot--${kind}`);
    const entry = { action, kind, slot } as Entry;
    const control = button(doc, { label: "", onClick: () => trigger(entry) });
    entry.control = control;
    control.id = `${ID_PREFIX[kind]}${action}`;
    control.className += tile ? " ch-quick-action" : kind === "rail" ? " ch-quick-rail__action" : " ch-quick-recents__action";
    if (tile && QUICK_RAIL_ACTIONS.includes(action)) control.className += " ch-quick-action--main";
    control.setAttribute("aria-label", name);
    control.setAttribute("data-motion", "tile-hover tile-press");
    control.setAttribute("data-focus-key", control.id);
    control.setAttribute("data-icon-family", quickActionFamily(action));
    control.setAttribute("data-feedback", "idle");
    control.appendChild(createQuickActionIcon(doc, action));
    if (kind !== "rail") control.appendChild(createElement(doc, "span", "ch-quick-action__label", abbreviation));
    control.addEventListener("pointerdown", event => ripple(control, event as PointerEvent));
    slot.addEventListener("click", event => { if ((event as Event).target === slot) deny(entry); });
    if (tile) {
      const star = createElement(doc, "span", "ch-quick-action__star");
      const starIcon = uiIcon(doc, "star-filled", 8);
      if (starIcon) star.appendChild(starIcon); else star.textContent = "★";
      star.setAttribute("aria-hidden", "true");
      control.appendChild(star);
      entry.key = createElement(doc, "kbd", "ch-quick-action__key");
      entry.key.setAttribute("aria-hidden", "true");
      control.appendChild(entry.key);
      // Right-click or Shift+F10 pins; the native menu has nothing useful here.
      const pin = (event: Event): void => { event.preventDefault?.(); toggleFavorite(action); };
      slot.addEventListener("contextmenu", pin);
      control.addEventListener("keydown", event => {
        const key = event as KeyboardEvent;
        if ((key.shiftKey && key.key === "F10") || key.key === "ContextMenu") pin(event);
      });
      slot.setAttribute("data-row", quickActionFamily(action));
      slot.setAttribute("data-cascade", "true");
    }
    slot.appendChild(control);
    entries.push(entry);
    return entry;
  }

  function dropEntries(kind: EntryKind): void {
    for (let index = entries.length - 1; index >= 0; index--) {
      const entry = entries[index]!;
      if (entry.kind !== kind) continue;
      cancel(entry.timer);
      entries.splice(index, 1);
    }
  }
  function renderRail(): void {
    dropEntries("rail");
    while (rail.firstChild) rail.removeChild(rail.firstChild);
    favorites.slice(0, RAIL_MAX).forEach((action, index) => {
      const entry = makeEntry(action, "rail");
      // Staggered pop-in beside the title when the dock collapses (45 ms apart).
      entry.control.style?.setProperty?.("--rail-index", String(index));
      rail.appendChild(entry.slot);
    });
    rail.hidden = favorites.length === 0;
    applyAvailability();
  }
  function renderRecents(): void {
    dropEntries("recent");
    while (recentList.firstChild) recentList.removeChild(recentList.firstChild);
    if (!recents.length) recentList.appendChild(createElement(doc, "span", "ch-quick-recents__empty", copy.noRecents));
    recents.forEach((action, index) => {
      const entry = makeEntry(action, "recent");
      if (index === 0) entry.slot.setAttribute("data-new", "true");
      recentList.appendChild(entry.slot);
    });
    applyAvailability();
  }

  function visibleTiles(): Entry[] {
    return entries.filter(entry => entry.kind === "tile" && !entry.slot.hidden);
  }
  function inTab(action: QuickAction): boolean {
    return tab === "all" || (tab === "favorites" ? favorites.includes(action) : quickActionFamily(action) === tab);
  }
  /** Two-row strip columns for the visible tiles; each row mirrors its keyboard row. */
  let columns = stripColumns(QUICK_ACTIONS.length);
  /** Category filter and keyboard hints. */
  function applyView(): void {
    for (const entry of entries) {
      if (entry.kind !== "tile") continue;
      entry.slot.hidden = !inTab(entry.action);
      entry.slot.setAttribute("data-favorite", String(favorites.includes(entry.action)));
    }
    const tiles = visibleTiles();
    columns = stripColumns(tiles.length);
    pad.style?.setProperty?.("--qa-columns", String(columns));
    tiles.forEach((entry, index) => {
      const letter = tileLetter(index, columns);
      if (entry.key) entry.key.textContent = letter;
      if (letter) entry.control.setAttribute("aria-keyshortcuts", letter); else entry.control.removeAttribute("aria-keyshortcuts");
    });
    const none = tiles.length === 0;
    empty.hidden = !none;
    empty.textContent = none ? copy.noFavorites : "";
    pad.setAttribute("data-empty", String(none));
    strip?.refresh();
  }

  /** Prototype "tileIn": visible tiles rise in one after another on mount and on every filter change. */
  let entryTimer: ReturnType<typeof setTimeout> | undefined;
  function playEntry(): void {
    cancel(entryTimer);
    pad.setAttribute("data-stagger", "false");
    pad.getBoundingClientRect?.();
    const tiles = visibleTiles();
    tiles.forEach((entry, index) => entry.slot.style?.setProperty?.("--stagger-index", String(index)));
    pad.setAttribute("data-stagger", "true");
    // Removed afterwards so showing the dock again does not replay the cascade.
    entryTimer = later(() => pad.setAttribute("data-stagger", "false"), ENTRY_MS + tiles.length * ENTRY_STEP_MS + 40);
  }

  /**
   * "local" while one of these shortcuts runs (the others dim, as in the prototype);
   * "external" when another command keeps the panel busy (the grid keeps its look).
   */
  function syncBusy(): void {
    const local = entries.some(entry => entry.control.getAttribute("data-feedback") === "loading");
    pad.setAttribute("data-busy", !context.busy ? "false" : local ? "local" : "external");
  }

  function applyAvailability(): void {
    for (const entry of entries) {
      const name = quickActionName(entry.action, context.locale);
      const reason = reasonFor(entry.action);
      entry.control.disabled = Boolean(reason);
      entry.control.setAttribute("aria-disabled", String(Boolean(reason)));
      const hint = entry.kind === "tile" ? ` · ${copy.favoriteHint}` : "";
      const title = reason ? `${name} · ${reason}` : `${name}${hint}`;
      entry.control.title = title;
      entry.slot.title = title;
      entry.slot.setAttribute("data-disabled", String(Boolean(reason)));
      // The rich tooltip (rich-tooltip.ts) reads these: name, the letter, the hint or why not.
      for (const node of [entry.control, entry.slot]) {
        node.setAttribute("data-tip", name);
        node.setAttribute("data-tip-detail", reason ? "" : hint.replace(/^ · /, ""));
        if (reason) node.setAttribute("data-disabled-reason", reason); else node.removeAttribute("data-disabled-reason");
      }
    }
  }

  // Toolbar: category filter (the search was removed at the user's request, 2026-10-23).

  const tabs = createElement(doc, "div", "ch-quick-tabs");
  tabs.setAttribute("role", "group");
  tabs.setAttribute("aria-label", copy.filters);
  const tabButtons: Array<[QuickTab, HTMLButtonElement]> = [];
  const indicator = createElement(doc, "span", "ch-quick-tabs__indicator");
  indicator.setAttribute("aria-hidden", "true");
  tabs.appendChild(indicator);
  const moveIndicator = (): void => {
    const index = QUICK_TABS.findIndex(definition => definition.id === tab);
    tabs.setAttribute("data-tab-index", String(index));
    tabs.style?.setProperty?.("--tab-index", String(index));
  };
  for (const definition of QUICK_TABS) {
    const label = pt ? definition.pt : definition.en;
    const node = button(doc, { label: "", title: label, onClick: () => {
      tab = definition.id;
      for (const [id, other] of tabButtons) other.setAttribute("aria-pressed", String(id === tab));
      tabs.setAttribute("data-tab", tab);
      moveIndicator();
      applyView();
      playEntry();
    } });
    node.id = `quick-tab-${definition.id}`;
    node.className += " ch-quick-tabs__tab";
    node.setAttribute("aria-label", label);
    node.setAttribute("aria-pressed", String(definition.id === tab));
    if (definition.id !== "all") node.setAttribute("data-icon-family", definition.id === "favorites" ? "favorites" : definition.id);
    const icon = strokeIcon(doc, definition.path);
    if (icon) node.appendChild(icon); else node.textContent = label.slice(0, 1);
    tabButtons.push([definition.id, node]);
    tabs.appendChild(node);
  }
  tabs.setAttribute("data-tab", tab);
  moveIndicator();
  toolbar.appendChild(tabs);

  const keysToggle = button(doc, { label: "", title: copy.keys, onClick: () => {
    keysLatched = !keysLatched;
    keysToggle.setAttribute("aria-pressed", String(keysLatched));
    showKeys(keysLatched);
  } });
  keysToggle.id = "quick-actions-keys";
  keysToggle.className += " ch-quick-keys-toggle";
  keysToggle.setAttribute("aria-label", copy.keys);
  keysToggle.setAttribute("aria-pressed", "false");
  const keysIcon = strokeIcon(doc, "M3.5 6.5h17v11h-17zM7 10.5h.01M10.5 10.5h.01M14 10.5h.01M17.5 10.5h.01M8 14h8");
  if (keysIcon) keysToggle.appendChild(keysIcon);
  keysToggle.appendChild(createElement(doc, "span", "ch-quick-keys-toggle__label", copy.shortcuts));

  function showKeys(on: boolean): void {
    pad.setAttribute("data-show-keys", String(on || keysLatched));
  }

  footer.appendChild(createElement(doc, "span", "ch-quick-recents__label", copy.recents));
  footer.appendChild(recentList);
  footer.appendChild(keysToggle);
  let anchorFrame: HTMLElement | null = null;
  const anchorPanel = options.anchor ? createAnchorPanel(options.anchor) : null;

  QUICK_ACTIONS.forEach(([action]) => pad.appendChild(makeEntry(action, "tile").slot));
  pad.appendChild(empty);
  renderRail();
  renderRecents();

  // Beside the anchor the strip scrolls sideways: wheel, page buttons and edge fades, no scrollbar.
  const win = doc.defaultView;
  const strip = createQuickStrip(doc, browserMotionEnv(win, doc.documentElement), pad, { previous: copy.previous, next: copy.next });
  disposers.push(() => strip.dispose());

  /**
   * Onyx Vivo anchor: the 3×3 radios sit in a framed box with crosshair guides and a
   * spring puck on the last point applied (centre until then), named underneath.
   * The puck is presentation only; the radios keep their own semantics.
   */
  function createAnchorPanel(grid: HTMLElement): HTMLElement {
    const panel = createElement(doc, "div", "ch-quick-anchorpad");
    const frame = createElement(doc, "div", "ch-quick-anchorpad__frame");
    anchorFrame = frame;
    for (const part of ["box", "hline", "vline", "puck"]) {
      const node = createElement(doc, "span", `ch-quick-anchorpad__${part}`);
      node.setAttribute("aria-hidden", "true");
      frame.appendChild(node);
    }
    grid.parentNode?.removeChild(grid);
    frame.appendChild(grid);
    const label = createElement(doc, "span", "ch-quick-anchorpad__label");
    label.setAttribute("aria-hidden", "true");
    panel.appendChild(frame); panel.appendChild(label);
    const cells = Array.from(grid.getElementsByTagName("button")) as HTMLButtonElement[];
    const place = (index: number, ping: boolean): void => {
      const cell = cells[index];
      if (!cell) return;
      const column = index % 3, row = Math.floor(index / 3);
      frame.setAttribute("data-point", String(index));
      frame.style?.setProperty?.("--anchor-col", String(column));
      frame.style?.setProperty?.("--anchor-row", String(row));
      // A fresh node so the position name slides up into place.
      while (label.firstChild) label.removeChild(label.firstChild);
      label.appendChild(createElement(doc, "span", "ch-quick-anchorpad__name", cell.getAttribute("aria-label") ?? cell.title));
      if (!ping) return;
      // The ring stays where it was fired even if the puck moves on.
      const wave = createElement(doc, "span", "ch-quick-anchorpad__ping");
      wave.setAttribute("aria-hidden", "true");
      wave.style?.setProperty?.("left", `${ANCHOR_FIRST + column * ANCHOR_STEP - 8}px`);
      wave.style?.setProperty?.("top", `${ANCHOR_FIRST + row * ANCHOR_STEP - 8}px`);
      frame.appendChild(wave);
      later(() => wave.parentNode?.removeChild(wave), RIPPLE_MS + 120);
    };
    cells.forEach((cell, index) => {
      // A click only reaches an enabled cell, but the owner disables the cells while it
      // applies the point (synchronously, before this listener), so the state is not re-read.
      listen(cell, "click", () => place(index, true));
    });
    // Arrow keys select through the radiogroup, which focuses the new cell first.
    listen(grid, "keydown", event => {
      if (!/^(Arrow|Home$|End$)/.test((event as KeyboardEvent).key)) return;
      later(() => {
        const index = cells.indexOf(doc.activeElement as HTMLButtonElement);
        if (index >= 0) place(index, true);
      }, 0);
    });
    place(Math.floor(cells.length / 2), false);
    return panel;
  }

  function pressTile(entry: Entry): void {
    if (entry.control.disabled) { deny(entry); return; }
    entry.control.setAttribute("data-pressed", "true");
    later(() => entry.control.setAttribute("data-pressed", "false"), 120);
    ripple(entry.control, {} as PointerEvent);
    trigger(entry);
  }

  /** Grid ↔ keyboard: letters run the visible tiles, 1–9 move the anchor, Alt reveals. */
  function onKeydown(event: Event): void {
    const key = event as KeyboardEvent;
    if (key.key === "Alt") { showKeys(true); return; }
    if (isTextField(key.target)) return;
    if (key.ctrlKey || key.metaKey || key.altKey || key.defaultPrevented) return;
    // Shift+F10 belongs to the favorite gesture, Shift+letter to nobody.
    if (key.shiftKey) return;
    const tileIndex = tileIndexForLetter(key.key, columns, visibleTiles().length);
    if (tileIndex >= 0) {
      const entry = visibleTiles()[tileIndex];
      if (entry) { key.preventDefault?.(); pressTile(entry); }
      return;
    }
    const anchorIndex = anchorIndexForKey(key.key);
    if (anchorIndex !== null && options.onAnchorKey) { key.preventDefault?.(); options.onAnchorKey(anchorIndex); }
  }
  const scope = options.keyScope;
  if (scope) {
    listen(scope, "keydown", onKeydown);
    listen(scope, "keyup", event => { if ((event as KeyboardEvent).key === "Alt") showKeys(false); });
    listen(scope, "focusout", event => { if (!contains(scope, (event as FocusEvent).relatedTarget)) showKeys(false); });
  }
  listen(win, "blur", () => showKeys(false));

  function update(next: QuickActionsContext): void {
    context = next;
    // While one action runs the others only dim; unavailable ones also lose their color.
    syncBusy();
    // The anchor needs a composition and a selection; a running command does not grey it out.
    anchorFrame?.setAttribute("data-disabled", String(!context.hasComp || !context.selectionCount));
    applyAvailability();
  }
  update(context);
  applyView();
  if (!options.quietEntry) playEntry();

  return {
    element: pad,
    strip: strip.element,
    rail,
    toolbar,
    footer,
    anchorPanel,
    update,
    dispose() {
      alive = false;
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      for (const release of disposers) release();
    }
  };
}
