import type { MotionEnv } from "./motion/env.js";

/**
 * Shell motion for the AE panel (motion upgrade F1). shell.ts is shared with Premiere,
 * so everything here only decorates the DOM the shell already renders: the direction a
 * view enters from, the spring on the nav pill, the 1–5 shortcuts and the toast stack.
 */

/** Left-to-right order of the views; the tool editor opens from home, so it sits next to it. */
const VIEW_ORDER: Readonly<Record<string, number>> = Object.freeze({
  home: 0, tools: 0.5, ease: 1, parallax: 2, presets: 3, settings: 4, context: 5, system: 5, diagnostics: 5
});

export type ViewDirection = "forward" | "back" | "none";

/** A view to the right of the previous one enters from the right, and vice versa. */
export function viewDirection(from: string | null, to: string): ViewDirection {
  const start = from === null ? undefined : VIEW_ORDER[from];
  const end = VIEW_ORDER[to];
  if (start === undefined || end === undefined || start === end) return "none";
  return end > start ? "forward" : "back";
}

/**
 * Top-row digits open the primary views; the numeric keypad never does. Inside the Quick
 * dock every digit belongs to the anchor grid (it handles the key first and prevents it).
 */
export const NAV_SHORTCUTS: readonly { code: string; key: string; view: string }[] = Object.freeze([
  { code: "Digit1", key: "1", view: "home" },
  { code: "Digit2", key: "2", view: "ease" },
  { code: "Digit3", key: "3", view: "parallax" },
  { code: "Digit4", key: "4", view: "presets" },
  { code: "Digit5", key: "5", view: "settings" }
]);

/** Roles that own the digit keys themselves (typing, stepping a value, picking from a list). */
const KEY_OWNER_ROLES = new Set(["textbox", "searchbox", "combobox", "slider", "spinbutton", "listbox", "option", "menu", "menuitem", "menuitemradio", "menuitemcheckbox"]);

export function isKeyOwner(target: EventTarget | null): boolean {
  const node = target as HTMLElement | null;
  if (!node || typeof node.getAttribute !== "function") return false;
  const tag = String(node.tagName ?? "").toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (node.isContentEditable || node.getAttribute("contenteditable") === "true") return true;
  return KEY_OWNER_ROLES.has(node.getAttribute("role") ?? "");
}

export interface ShortcutEvent {
  code?: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  repeat?: boolean;
  defaultPrevented?: boolean;
  target?: EventTarget | null;
}

/** The view a key opens, or null when the key belongs to someone else. */
export function shortcutView(event: ShortcutEvent): string | null {
  if (event.defaultPrevented || event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return null;
  if (isKeyOwner(event.target ?? null)) return null;
  return NAV_SHORTCUTS.find(entry => entry.code === event.code)?.view ?? null;
}

const noop = (): void => {};
/** Quiet time after the last resize before the nav pill springs again. */
const RESIZE_SETTLE_MS = 150;

/**
 * Digits 1–5 switch views from anywhere in the panel. Handlers that own a digit (the
 * anchor grid, fields, lists) run first and call preventDefault; open dialogs win too.
 */
export function attachNavShortcuts(doc: Document, options: { navigate(view: string): void; blocked?(): boolean }): () => void {
  for (const { key, view } of NAV_SHORTCUTS) {
    doc.querySelector?.(`.ch-nav__item[data-view="${view}"]`)?.setAttribute("aria-keyshortcuts", key);
  }
  const onKeydown = (event: Event): void => {
    const view = shortcutView(event as KeyboardEvent);
    if (!view || options.blocked?.() || doc.querySelector?.('[aria-modal="true"]:not([hidden])')) return;
    event.preventDefault();
    const focused = doc.activeElement;
    const hadFocus = Boolean(focused && focused !== doc.body);
    options.navigate(view);
    // The old view took the focused control with it: hand focus to the tab that opened.
    if (hadFocus && (!doc.activeElement || doc.activeElement === doc.body)) {
      doc.querySelector<HTMLElement>(`.ch-nav__item[data-view="${view}"]`)?.focus();
    }
  };
  doc.addEventListener?.("keydown", onKeydown);
  return () => doc.removeEventListener?.("keydown", onKeydown);
}

function addMotion(node: Element, id: string): void {
  const ids = (node.getAttribute("data-motion") ?? "").split(/\s+/).filter(Boolean);
  if (!ids.includes(id)) node.setAttribute("data-motion", [...ids, id].join(" "));
}

/**
 * The nav pill travels with the spring of the Quick actions tabs. Its first placement
 * must not fly in from the corner, so transitions start two frames after mount.
 */
export function attachNavIndicator(shell: Element, env: MotionEnv): () => void {
  const indicator = shell.querySelector?.(".ch-nav__indicator");
  if (!indicator) return noop;
  addMotion(indicator, "selection-glide");
  let handle: number | null = null;
  const ready = (): void => { handle = null; indicator.setAttribute("data-ready", "true"); };
  handle = env.frame(() => { handle = env.frame(ready); if (handle === null) ready(); });
  if (handle === null) ready();
  // Dragging the panel edge moves the tabs every frame: the pill follows them without a spring.
  const win = shell.ownerDocument?.defaultView ?? null;
  let settle: ReturnType<MotionEnv["timeout"]> | null = null;
  const onResize = (): void => {
    indicator.setAttribute("data-ready", "false");
    if (settle !== null) env.clearTimeout(settle);
    settle = env.timeout(() => { settle = null; indicator.setAttribute("data-ready", "true"); }, RESIZE_SETTLE_MS);
  };
  win?.addEventListener?.("resize", onResize);
  return () => {
    if (handle !== null) env.cancelFrame(handle);
    if (settle !== null) env.clearTimeout(settle);
    win?.removeEventListener?.("resize", onResize);
  };
}

/**
 * The toast stack slides instead of jumping: when a toast arrives or leaves, the others
 * start at their old place and the `stack-shift` transition carries them. Positions are
 * measured from the region's bottom edge, which stays put while the stack grows.
 */
export function attachToastMotion(region: HTMLElement, env: MotionEnv): () => void {
  const Observer = (region.ownerDocument?.defaultView as (Window & typeof globalThis) | null)?.MutationObserver;
  if (typeof Observer !== "function") return noop;
  const places = new Map<HTMLElement, number>();
  const toasts = (): HTMLElement[] => Array.from(region.children).filter(node =>
    node.classList?.contains("ch-toast") && node.getAttribute("data-closing") !== "true") as HTMLElement[];
  const placeOf = (toast: HTMLElement): number => toast.offsetTop - region.offsetHeight;
  const record = (): void => { places.clear(); for (const toast of toasts()) places.set(toast, placeOf(toast)); };
  const shift = (): void => {
    const moved: HTMLElement[] = [];
    for (const toast of toasts()) {
      addMotion(toast, "stack-shift");
      const before = places.get(toast);
      if (before === undefined || env.reduced()) continue;
      const offset = before - placeOf(toast);
      if (!offset) continue;
      toast.style.setProperty("transition", "none");
      toast.style.setProperty("transform", `translateY(${Math.round(offset)}px)`);
      moved.push(toast);
    }
    if (moved.length) {
      void moved[0]!.offsetWidth;
      for (const toast of moved) { toast.style.removeProperty("transition"); toast.style.removeProperty("transform"); }
    }
    record();
  };
  const observer = new Observer(shift);
  observer.observe(region, { childList: true });
  record();
  return () => observer.disconnect();
}

/** Distance between the toasts and the panel bottom when nothing is docked there. */
export const FEEDBACK_BASE_LIFT = 38;

/**
 * Single owner of the toast lift (the Quick dock, the preset footer and tool action bars
 * used to write it separately). The AE stylesheet turns it into a translate that glides.
 */
export function setFeedbackLift(root: HTMLElement, px: number = FEEDBACK_BASE_LIFT): void {
  root.style.setProperty("--ch-feedback-bottom", `${Math.round(Math.max(FEEDBACK_BASE_LIFT, px))}px`);
}
