/**
 * The quick dock's tile strip: two rows that scroll sideways beside the anchor.
 *
 * No scrollbar. The mouse wheel scrolls it (a wheel notch moves it smoothly), a page
 * button appears on the side that has more tiles, and that side fades out instead of
 * ending in a hard cut. At an end, the wheel goes back to scrolling the panel.
 * Keyboard focus that lands under a fade glides the tile clear of it.
 */
import { aeMotionCurve } from "./motion/catalog.js";
import type { MotionEnv } from "./motion/env.js";
import { scrollDuration } from "./motion/scroll.js";
import { tween, type TweenHandle } from "./motion/tween.js";
import { uiIcon } from "./ui-icons.js";

export interface QuickStripLabels { previous: string; next: string }
export interface QuickStrip {
  /** Wrapper holding the scroller and the two page buttons. */
  readonly element: HTMLElement;
  /** Re-reads the overflow (after a filter change or a resize). */
  refresh(): void;
  dispose(): void;
}

/** Width of the edge fade (ae-quick-actions.css `--qa-fade`); a focused tile is kept clear of it. */
export const STRIP_FADE_PX = 24;
/** One tile column: 44 px tile + 4 px gap (ae-quick-actions.css). */
export const STRIP_COLUMN_PX = 48;
/** Pixels per wheel line when the wheel reports lines instead of pixels. */
const LINE_PX = 16;

export function stripOverflow(scrollLeft: number, clientWidth: number, scrollWidth: number): { start: boolean; end: boolean } {
  return { start: scrollLeft > 1, end: scrollLeft + clientWidth < scrollWidth - 1 };
}

/** How far a page button moves: the visible width minus one column, so one column stays as context. */
export function stripPage(clientWidth: number): number {
  return Math.max(STRIP_COLUMN_PX, clientWidth - STRIP_COLUMN_PX);
}

export function createQuickStrip(doc: Document, env: MotionEnv, scroller: HTMLElement, labels: QuickStripLabels): QuickStrip {
  const element = doc.createElement("div");
  element.className = "ch-quick-strip";
  element.setAttribute("data-overflow-start", "false");
  element.setAttribute("data-overflow-end", "false");
  scroller.parentNode?.removeChild(scroller);
  element.appendChild(scroller);
  // Mouse affordances only: Tab already walks the tiles and focus scrolls them into view.
  const pager = (side: "start" | "end"): HTMLButtonElement => {
    const node = doc.createElement("button");
    node.type = "button";
    node.className = "ch-quick-strip__page";
    node.setAttribute("data-side", side);
    node.setAttribute("tabindex", "-1");
    node.setAttribute("aria-hidden", "true");
    node.title = side === "start" ? labels.previous : labels.next;
    const icon = uiIcon(doc, side === "start" ? "chevron-left" : "chevron-right", 14);
    if (icon) node.appendChild(icon); else node.textContent = side === "start" ? "‹" : "›";
    node.addEventListener("click", () => glideBy(side === "start" ? -stripPage(scroller.clientWidth) : stripPage(scroller.clientWidth)));
    element.appendChild(node);
    return node;
  };
  pager("start"); pager("end");

  let target: number | null = null;
  let active: TweenHandle | null = null;
  let frame: number | null = null;
  const disposers: Array<() => void> = [];
  const listen = (node: EventTarget | null | undefined, type: string, handler: (event: Event) => void, options?: AddEventListenerOptions): void => {
    if (!node?.addEventListener) return;
    node.addEventListener(type, handler, options);
    disposers.push(() => node.removeEventListener?.(type, handler, options));
  };
  const maxScroll = (): number => Math.max(0, (scroller.scrollWidth || 0) - (scroller.clientWidth || 0));

  function refresh(): void {
    const { start, end } = stripOverflow(scroller.scrollLeft || 0, scroller.clientWidth || 0, scroller.scrollWidth || 0);
    element.setAttribute("data-overflow-start", String(start));
    element.setAttribute("data-overflow-end", String(end));
  }
  function schedule(): void {
    if (frame !== null) return;
    frame = env.frame(() => { frame = null; refresh(); });
    if (frame === null) refresh();
  }
  function stop(): void { active?.cancel(); active = null; target = null; }
  function glideTo(to: number): void {
    const next = Math.max(0, Math.min(maxScroll(), Math.round(to)));
    const from = scroller.scrollLeft || 0;
    active?.cancel();
    target = next;
    active = tween(env, {
      from, to: next, durationMs: scrollDuration(next - from), curve: aeMotionCurve("smooth-scroll"),
      onUpdate: value => { scroller.scrollLeft = value; refresh(); },
      onDone: () => { active = null; target = null; refresh(); }
    });
  }
  function glideBy(delta: number): void { glideTo((target ?? scroller.scrollLeft ?? 0) + delta); }

  listen(scroller, "scroll", schedule, { passive: true });
  // A vertical wheel scrolls the strip sideways; trackpads that already scroll sideways keep their native feel.
  listen(scroller, "wheel", event => {
    const wheel = event as WheelEvent;
    if (wheel.ctrlKey || maxScroll() <= 0 || Math.abs(wheel.deltaX) >= Math.abs(wheel.deltaY)) return;
    const scale = wheel.deltaMode === 1 ? LINE_PX : wheel.deltaMode === 2 ? scroller.clientWidth || 1 : 1;
    const from = target ?? scroller.scrollLeft ?? 0;
    const to = Math.max(0, Math.min(maxScroll(), from + wheel.deltaY * scale));
    // At an end the panel scrolls as usual.
    if (Math.abs(to - from) < 0.5) return;
    wheel.preventDefault();
    glideTo(to);
  }, { passive: false });
  listen(scroller, "pointerdown", stop);
  // A tile focused from the keyboard never stays half hidden under a fade.
  listen(scroller, "focusin", event => {
    const tile = event.target as HTMLElement | null;
    if (!tile?.getBoundingClientRect || !scroller.getBoundingClientRect) return;
    const item = tile.getBoundingClientRect(), box = scroller.getBoundingClientRect();
    const left = item.left - box.left, right = box.right - item.right;
    if (left < STRIP_FADE_PX) glideTo((scroller.scrollLeft || 0) + left - STRIP_FADE_PX);
    else if (right < STRIP_FADE_PX) glideTo((scroller.scrollLeft || 0) - right + STRIP_FADE_PX);
  });
  const win = doc.defaultView as (Window & { ResizeObserver?: typeof ResizeObserver }) | null;
  const Observer = win?.ResizeObserver;
  const observer = Observer ? new Observer(schedule) : null;
  observer?.observe(scroller);
  listen(win, "resize", schedule);
  refresh();

  return {
    element,
    refresh: schedule,
    dispose() {
      stop();
      if (frame !== null) env.cancelFrame(frame);
      observer?.disconnect();
      for (const release of disposers) release();
    }
  };
}
