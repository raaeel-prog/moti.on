/**
 * Tile strips.
 *
 * `createFittedStrip` (quick dock, 2026-11-20): whole columns only, measured with a
 * ResizeObserver; the rest goes behind a "+N" tile. Never scrolls sideways.
 *
 * `createQuickStrip` (ease editor key actions): two rows that scroll sideways.
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

/**
 * Whole columns that fit in `width`: `max(2, floor((width + gap) / (tile + gap)))`.
 * The quick dock never scrolls sideways; what does not fit goes behind a "+N" tile.
 */
export function fitColumns(width: number, tile: number, gap = 4): number {
  if (!(width > 0) || !(tile > 0)) return 2;
  return Math.max(2, Math.floor((width + gap) / (tile + gap)));
}

/** Tile edge for the dock (dir. A): always 28 px loose icons (ae-quick-actions.css). */
export function fitTileSize(_panelWidth: number): number {
  return 28;
}

export interface FittedStrip {
  /** Wrapper measured by the ResizeObserver; holds the grid. */
  readonly element: HTMLElement;
  /** Re-measures on the next frame; `onColumns` runs only when the count or tile size changed. */
  refresh(): void;
  dispose(): void;
}

/**
 * A strip that shows only whole columns: it measures its own width (ResizeObserver,
 * window resize as a fallback) and reports the column count to `onColumns`. No
 * scrolling, fades or page buttons.
 */
export function createFittedStrip(doc: Document, env: MotionEnv, grid: HTMLElement, onColumns: (columns: number, tile: number) => void): FittedStrip {
  const element = doc.createElement("div");
  element.className = "ch-quick-strip";
  grid.parentNode?.removeChild(grid);
  element.appendChild(grid);
  const win = doc.defaultView as (Window & { ResizeObserver?: typeof ResizeObserver }) | null;
  let frame: number | null = null;
  let last = "";
  function measure(): void {
    const width = element.clientWidth || element.getBoundingClientRect?.().width || 0;
    // The CSS owns the tile size (media query on the viewport); the JS mirror is the fallback.
    const css = Number.parseFloat(win?.getComputedStyle?.(grid).getPropertyValue("--qa-tile") ?? "");
    const tile = css > 0 ? css : fitTileSize(win?.innerWidth || doc.documentElement?.clientWidth || 0);
    // Unmeasured (hidden dock, test DOM): keep the last layout instead of collapsing to two columns.
    if (!width && last) return;
    const columns = width ? fitColumns(width, tile) : Number.POSITIVE_INFINITY;
    const key = `${columns}|${tile}`;
    if (key === last) return;
    last = key;
    onColumns(columns, tile);
  }
  function schedule(): void {
    if (frame !== null) return;
    frame = env.frame(() => { frame = null; measure(); });
    if (frame === null) measure();
  }
  const Observer = win?.ResizeObserver;
  const observer = Observer ? new Observer(schedule) : null;
  observer?.observe(element);
  const onResize = (): void => schedule();
  win?.addEventListener?.("resize", onResize);
  return {
    element,
    refresh: schedule,
    dispose() {
      if (frame !== null) env.cancelFrame(frame);
      frame = null;
      observer?.disconnect();
      win?.removeEventListener?.("resize", onResize);
    }
  };
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
