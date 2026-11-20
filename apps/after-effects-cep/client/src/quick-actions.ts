import { button, createElement, createI18n } from "@motion/ui-core";
import { MOTION_CATALOG } from "@motion/ui-motion";
import { createQuickActionIcon, quickActionFamily } from "./quick-action-icons.js";
import {
  QUICK_COPY, QUICK_TABS, anchorIndexForKey, stripColumns, stripLayout, tileIndexForLetter, tileLetter, withFavorite, withRecent,
  type QuickTab
} from "./quick-actions-keys.js";
import { browserMotionEnv } from "./motion/env.js";
import { createFittedStrip } from "./quick-strip.js";
import { uiIcon } from "./ui-icons.js";

/**
 * What the status line under the tool grid shows for the quick dock (quick-library.ts
 * subscribes). "point": a tile under the pointer or focus. "applied": a confirmed run.
 * `null`: the pointer or focus left the tiles.
 */
export type QuickStatus =
  | { kind: "point"; name: string; gesture: string }
  | { kind: "applied"; name: string }
  | null;
type QuickStatusListener = (status: QuickStatus) => void;
const statusListeners = new WeakMap<object, Set<QuickStatusListener>>();
/** One channel per document: the dock and the status line are built apart (main.ts). */
export function onQuickStatus(doc: Document, listener: QuickStatusListener): () => void {
  let set = statusListeners.get(doc);
  if (!set) { set = new Set(); statusListeners.set(doc, set); }
  set.add(listener);
  return () => { set!.delete(listener); };
}
function publishStatus(doc: Document, status: QuickStatus): void {
  for (const listener of Array.from(statusListeners.get(doc) ?? [])) listener(status);
}

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
  const i18n = createI18n({ locale: options.locale });
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

  function applied(action: QuickAction): void {
    if (!alive) return;
    remember(action);
    publishStatus(doc, { kind: "applied", name: quickActionName(action, context.locale) });
  }

  function trigger(entry: Entry): void {
    if (entry.control.disabled || reasonFor(entry.action)) return;
    // A tile picked from the "+N" popover closes it; focus goes back to "+N".
    if (entry.kind === "tile" && overflowOpen && entry.slot.parentNode === overflowGrid) closeOverflow(true);
    const result = options.onAction(entry.action);
    if (!result || typeof (result as Promise<boolean | void>).then !== "function") { applied(entry.action); return; }
    setFeedback(entry, "loading");
    (result as Promise<boolean | void>).then(
      ok => { setFeedback(entry, ok === false ? "idle" : "success"); if (ok !== false) applied(entry.action); },
      () => setFeedback(entry, "idle")
    );
  }

  /** The status line names the tile under the pointer or focus, with its gesture (or why not). */
  function pointStatus(entry: Entry): void {
    publishStatus(doc, { kind: "point", name: quickActionName(entry.action, context.locale), gesture: reasonFor(entry.action) ?? i18n.t("quick.status.gesture") });
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
    // Tiles carry no abbreviation (2026-11-20): the name is in the rich tip and the status line.
    if (kind === "recent") control.appendChild(createElement(doc, "span", "ch-quick-action__label", abbreviation));
    control.addEventListener("pointerdown", event => ripple(control, event as PointerEvent));
    slot.addEventListener("click", event => { if ((event as Event).target === slot) deny(entry); });
    if (tile) {
      // The slot also catches the pointer over a disabled tile (its button gets no mouse events).
      slot.addEventListener("mouseenter", () => pointStatus(entry));
      slot.addEventListener("mouseleave", () => publishStatus(doc, null));
      control.addEventListener("focus", () => pointStatus(entry));
      control.addEventListener("blur", () => publishStatus(doc, null));
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
  /** Columns of the keyboard map for the visible tiles; each row mirrors its keyboard row. */
  let columns = stripColumns(QUICK_ACTIONS.length);
  /** Whole columns that fit beside the anchor (quick-strip.ts); unmeasured = everything fits. */
  let fit = Number.POSITIVE_INFINITY;
  let layoutKey = "";
  /** Category filter, keyboard hints and the whole-column layout with its "+N" tile. */
  function applyView(): void {
    for (const entry of entries) {
      if (entry.kind !== "tile") continue;
      entry.slot.hidden = !inTab(entry.action);
      entry.slot.setAttribute("data-favorite", String(favorites.includes(entry.action)));
    }
    const tiles = visibleTiles();
    const layout = stripLayout(tiles.length, fit);
    columns = layout.keyColumns;
    pad.style?.setProperty?.("--qa-columns", String(layout.columns));
    pad.setAttribute("data-columns", String(layout.columns));
    tiles.forEach((entry, index) => {
      const letter = tileLetter(index, columns);
      if (entry.key) entry.key.textContent = letter;
      if (letter) entry.control.setAttribute("aria-keyshortcuts", letter); else entry.control.removeAttribute("aria-keyshortcuts");
    });
    placeTiles(tiles, layout.shown, layout.hidden);
    const none = tiles.length === 0;
    empty.hidden = !none;
    empty.textContent = none ? copy.noFavorites : "";
    pad.setAttribute("data-empty", String(none));
  }

  /**
   * The first `shown` visible tiles stay in the strip, the rest move into the "+N" popover
   * (the same nodes: handlers, feedback and letters go with them). Nothing moves unless the
   * split changed, so a focused tile keeps its focus.
   */
  function placeTiles(tiles: Entry[], shown: number, hidden: number): void {
    const key = `${tiles.map(entry => entry.action).join()}|${shown}`;
    if (key === layoutKey) return;
    layoutKey = key;
    if (overflowOpen) closeOverflow(false);
    const focused = doc.activeElement as HTMLElement | null;
    const inStrip = new Set(tiles.slice(0, shown));
    const move = (node: HTMLElement, home: HTMLElement): void => { node.parentNode?.removeChild(node); home.appendChild(node); };
    for (const entry of entries) {
      if (entry.kind !== "tile") continue;
      move(entry.slot, entry.slot.hidden || inStrip.has(entry) ? pad : overflowGrid);
    }
    move(moreSlot, pad);
    move(empty, pad);
    moreSlot.hidden = hidden === 0;
    overflowGrid.style?.setProperty?.("--qa-columns", String(Math.min(6, Math.max(1, hidden))));
    more.textContent = `+${hidden}`;
    const label = i18n.t("quick.overflow.more", { count: hidden });
    more.setAttribute("aria-label", label);
    more.setAttribute("data-tip", label);
    more.title = label;
    if (focused && focused !== doc.activeElement && contains(pad, focused)) focused.focus?.();
  }

  // ── "+N": the tiles that do not fit, in a popover of six columns ──────────────
  const moreSlot = createElement(doc, "span", "ch-quick-slot ch-quick-slot--more");
  moreSlot.hidden = true;
  const more = button(doc, { label: "+0", onClick: () => { if (overflowOpen) closeOverflow(true); else openOverflow(); } });
  more.id = "quick-actions-more";
  more.className += " ch-quick-action ch-quick-more";
  more.setAttribute("aria-expanded", "false");
  more.setAttribute("aria-controls", "quick-actions-overflow");
  moreSlot.appendChild(more);
  const overflow = createElement(doc, "div", "ch-quick-overflow");
  overflow.id = "quick-actions-overflow";
  overflow.setAttribute("role", "group");
  overflow.setAttribute("aria-label", i18n.t("quick.overflow.title"));
  overflow.setAttribute("data-open", "false");
  overflow.setAttribute("tabindex", "-1");
  overflow.hidden = true;
  const overflowGrid = createElement(doc, "div", "ch-quick-overflow__grid ch-quick-actions");
  overflow.appendChild(overflowGrid);
  let overflowOpen = false;
  const overflowRelease: Array<() => void> = [];
  const onOutside = (event: Event): void => {
    const target = event.target as Node | null;
    if (!contains(overflow, target) && !contains(moreSlot, target)) closeOverflow(false);
  };
  const onViewportChange = (): void => closeOverflow(false);
  const watch = (node: EventTarget | null | undefined, type: string, handler: (event: Event) => void, capture: boolean): void => {
    if (!node?.addEventListener) return;
    node.addEventListener(type, handler, capture);
    overflowRelease.push(() => node.removeEventListener?.(type, handler, capture));
  };

  /** Below "+N", right-aligned with it; above when it would not fit; never past the panel edge. */
  function placeOverflow(): void {
    const view = doc.defaultView;
    const style = overflow.style;
    if (!view || !style || typeof more.getBoundingClientRect !== "function" || typeof overflow.getBoundingClientRect !== "function") return;
    style.left = "0px"; style.top = "0px";
    // A transformed ancestor would move the fixed box: measure where (0, 0) actually lands.
    const zero = overflow.getBoundingClientRect();
    const anchor = more.getBoundingClientRect();
    const edge = 8, gap = 4;
    const width = zero.width, height = zero.height;
    const left = Math.max(edge, Math.min(anchor.right - width, view.innerWidth - edge - width));
    const below = anchor.bottom + gap, above = anchor.top - gap - height;
    const side = below + height <= view.innerHeight - edge || above < edge ? "below" : "above";
    const top = side === "below" ? below : above;
    style.left = `${Math.round(left - zero.left)}px`;
    style.top = `${Math.round(top - zero.top)}px`;
    overflow.setAttribute("data-side", side);
    // The entry grows out of "+N".
    style.setProperty?.("transform-origin", `${Math.round(anchor.left + anchor.width / 2 - left)}px ${side === "below" ? 0 : Math.round(height)}px`);
  }

  function openOverflow(): void {
    if (overflowOpen || moreSlot.hidden) return;
    overflowOpen = true;
    overflow.hidden = false;
    placeOverflow();
    overflow.setAttribute("data-open", "true");
    more.setAttribute("aria-expanded", "true");
    watch(doc, "pointerdown", onOutside, true);
    watch(doc, "scroll", onViewportChange, true);
    watch(doc.defaultView, "resize", onViewportChange, false);
    const first = entries.find(entry => entry.kind === "tile" && entry.slot.parentNode === overflowGrid && !entry.control.disabled);
    (first?.control ?? overflow).focus?.();
  }

  function closeOverflow(returnFocus: boolean): void {
    if (!overflowOpen) return;
    overflowOpen = false;
    while (overflowRelease.length) overflowRelease.pop()!();
    overflow.setAttribute("data-open", "false");
    overflow.hidden = true;
    more.setAttribute("aria-expanded", "false");
    publishStatus(doc, null);
    if (returnFocus) more.focus?.();
  }

  overflow.addEventListener("keydown", event => {
    const key = event as KeyboardEvent;
    if (key.key !== "Escape") return;
    key.preventDefault?.(); key.stopPropagation?.();
    closeOverflow(true);
  });
  more.addEventListener("keydown", event => {
    const key = event as KeyboardEvent;
    if (key.key === "Escape" && overflowOpen) { key.preventDefault?.(); key.stopPropagation?.(); closeOverflow(true); }
    if (key.key === "ArrowDown" && !overflowOpen) { key.preventDefault?.(); openOverflow(); }
  });
  // Tabbing out of the popover closes it (focus already went elsewhere).
  overflow.addEventListener("focusout", event => {
    const next = (event as FocusEvent).relatedTarget;
    if (next && !contains(overflow, next) && !contains(moreSlot, next)) closeOverflow(false);
  });
  more.addEventListener("mouseenter", () => publishStatus(doc, { kind: "point", name: more.getAttribute("aria-label") ?? "", gesture: "" }));
  more.addEventListener("mouseleave", () => publishStatus(doc, null));

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
    const busy = !context.busy ? "false" : local ? "local" : "external";
    pad.setAttribute("data-busy", busy);
    overflowGrid.setAttribute("data-busy", busy);
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
    overflowGrid.setAttribute("data-show-keys", String(on || keysLatched));
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

  // Beside the anchor the strip shows whole columns only; what does not fit is behind "+N".
  const win = doc.defaultView;
  const strip = createFittedStrip(doc, browserMotionEnv(win, doc.documentElement), pad, next => {
    if (next === fit) return;
    fit = next;
    applyView();
  });
  strip.element.appendChild(overflow);
  strip.refresh();
  disposers.push(() => { closeOverflow(false); strip.dispose(); });

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
