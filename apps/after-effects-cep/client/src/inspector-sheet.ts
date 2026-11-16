import { aeMotionMs, type MotionEnv } from "./motion/index.js";

/**
 * Sliding inspector (motion upgrade F4). Below 720 px the tool adjustments slide in from
 * the right over the library, which stays on screen under a scrim; it behaves as a modal
 * there (focus kept inside, Esc / scrim / close button dismiss it). From 720 px it is the
 * 300 px column it always was. Closing plays the exit first and then navigates, so the
 * library underneath never flickers. Layout lives in ae-workstation.css, motion in ae-motion.css.
 */
/** 719.98, not 719: at 125–150 % scaling the width can fall between 719 and 720 CSS px. */
export const NARROW_QUERY = "(max-width: 719.98px)";

const FOCUSABLE = "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex=\"-1\"])";

export interface InspectorSheet {
  /** Plays the exit, then runs `after` (navigation). Runs `after` at once without frames or with reduced motion. */
  close(after: () => void): void;
  dispose(): void;
}

interface MediaWindow {
  matchMedia?(query: string): { matches: boolean; addListener?(listener: () => void): void; removeListener?(listener: () => void): void };
  requestAnimationFrame?: unknown;
}

/** Tab and Shift+Tab wrap inside `container`; returns the node to focus, or null to let the key through. */
export function wrapFocus(focusables: readonly HTMLElement[], active: Element | null, backwards: boolean): HTMLElement | null {
  if (!focusables.length) return null;
  const first = focusables[0]!, last = focusables[focusables.length - 1]!;
  const index = active ? focusables.indexOf(active as HTMLElement) : -1;
  if (index < 0) return backwards ? last : first;
  if (backwards && index === 0) return last;
  if (!backwards && index === focusables.length - 1) return first;
  return null;
}

export function attachInspectorSheet(doc: Document, env: MotionEnv, parts: {
  workspace: HTMLElement; library: HTMLElement; inspector: HTMLElement;
  /** Another tool replaces the open one: the content crossfades instead of sliding in again. */
  swap: boolean;
  onDismiss(): void;
}): InspectorSheet {
  const { workspace, library, inspector } = parts;
  const win = doc.defaultView as (Window & MediaWindow) | null;
  const scrim = doc.createElement("div");
  scrim.className = "ch-context-scrim";
  scrim.setAttribute("aria-hidden", "true");
  scrim.setAttribute("data-motion", "sheet-scrim");
  scrim.setAttribute("data-open", "false");
  workspace.insertBefore?.(scrim, inspector);
  inspector.setAttribute("data-motion", "sheet-enter sheet-exit");
  // A click on dead space inside the sheet focuses the sheet, so Esc and Tab keep working.
  inspector.setAttribute("tabindex", "-1");
  inspector.setAttribute("data-open", "true");
  if (parts.swap) inspector.setAttribute("data-swap", "true");

  const query = (() => { try { return win?.matchMedia?.(NARROW_QUERY) ?? null; } catch { return null; } })();
  const narrow = (): boolean => Boolean(query?.matches);
  const syncModal = (): void => {
    if (narrow()) {
      inspector.setAttribute("role", "dialog"); inspector.setAttribute("aria-modal", "true"); library.setAttribute("aria-hidden", "true");
    } else {
      inspector.removeAttribute("role"); inspector.removeAttribute("aria-modal"); library.removeAttribute("aria-hidden");
    }
  };
  syncModal();
  query?.addListener?.(syncModal);

  let frame: number | null = env.frame(() => { frame = null; scrim.setAttribute("data-open", "true"); });
  if (frame === null) scrim.setAttribute("data-open", "true");

  const onScrim = (): void => parts.onDismiss();
  const onKeydown = (event: Event): void => {
    const key = event as KeyboardEvent;
    if (key.key !== "Tab" || !narrow()) return;
    const focusables = (Array.from(inspector.querySelectorAll?.(FOCUSABLE) ?? []) as HTMLElement[]).filter(node => node.offsetParent !== null);
    const next = wrapFocus(focusables, doc.activeElement, key.shiftKey);
    if (next) { key.preventDefault(); next.focus(); }
  };
  // Focus that lands in the hidden library while the sheet is modal (Shift+Tab from the body,
  // a re-rendered control) goes back to the sheet.
  const onFocusin = (event: Event): void => {
    const target = event.target as Node | null;
    if (closing || !narrow() || !target || inspector.contains(target) || !library.contains(target)) return;
    inspector.focus();
  };
  scrim.addEventListener("click", onScrim);
  inspector.addEventListener("keydown", onKeydown);
  doc.addEventListener?.("focusin", onFocusin);

  let closing = false;
  let exitTimer: ReturnType<MotionEnv["timeout"]> | null = null;
  const dispose = (): void => {
    if (frame !== null) env.cancelFrame(frame);
    if (exitTimer !== null) env.clearTimeout(exitTimer);
    query?.removeListener?.(syncModal);
    scrim.removeEventListener?.("click", onScrim);
    inspector.removeEventListener?.("keydown", onKeydown);
    doc.removeEventListener?.("focusin", onFocusin);
  };
  return {
    close(after) {
      if (closing) return;
      closing = true;
      if (env.reduced() || typeof win?.requestAnimationFrame !== "function") { after(); return; }
      // Only the exit rules may match now (the enter and swap rules are more specific).
      inspector.setAttribute("data-open", "false");
      inspector.removeAttribute("data-swap");
      inspector.setAttribute("data-closing", "true");
      scrim.setAttribute("data-open", "false");
      exitTimer = env.timeout(() => { exitTimer = null; after(); }, aeMotionMs("sheet-exit"));
    },
    dispose
  };
}
