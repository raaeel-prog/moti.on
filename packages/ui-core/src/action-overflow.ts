import { element } from "./component-dom.js";
import { createIcon } from "./icons.js";
import { attachMenuGlide } from "./menu-glide.js";

/**
 * Keeps a footer action bar on one row.
 *
 * The primary action never moves. Secondary actions stay inline while they fit
 * and the ones that do not move, from the end, into a "More actions" menu. In a
 * 280 px panel this turns a stack of three or four full-width buttons into one
 * row, leaving the height to the controls.
 *
 * Measurement needs a laid-out runtime; without it (UXP fallbacks, test
 * doubles) every action stays inline and the bar keeps its wrapping layout.
 */
export interface ActionOverflowOptions {
  /** Accessible name and tooltip of the overflow button. */
  label: string;
}

export interface ActionOverflow {
  readonly button: HTMLButtonElement;
  refresh(): void;
  dispose(): void;
}

const openMenus = new WeakMap<Document, () => void>();

export function closeOpenActionMenu(doc: Document): void { openMenus.get(doc)?.(); }

function labelOf(action: HTMLElement): string {
  const label = action.getElementsByClassName?.("ch-action-button__label")[0];
  return (label?.textContent ?? action.textContent ?? "").trim();
}

function buttonOf(action: HTMLElement): HTMLButtonElement | null {
  return (action.getElementsByTagName?.("button")[0] as HTMLButtonElement | undefined) ?? null;
}

export function attachActionOverflow(doc: Document, bar: HTMLElement, options: ActionOverflowOptions): ActionOverflow {
  const more = element(doc, "button", "ch-action-more") as HTMLButtonElement;
  more.type = "button";
  more.setAttribute("aria-label", options.label);
  more.setAttribute("aria-haspopup", "menu");
  more.setAttribute("aria-expanded", "false");
  more.title = options.label;
  more.setAttribute("data-motion", "button-press");
  more.appendChild(createIcon(doc, "more"));
  more.hidden = true;
  more.setAttribute("data-hidden", "true");
  bar.appendChild(more);
  bar.setAttribute("data-overflow-managed", "true");

  const browser = doc.defaultView as (Window & typeof globalThis) | null;
  let menu: HTMLElement | null = null;
  let disposed = false;
  let frame: number | undefined;

  const actions = (): HTMLElement[] => Array.from(bar.children as HTMLCollectionOf<HTMLElement>)
    .filter(node => node !== more && (node.className ?? "").split(/\s+/).includes("ch-action"));
  const isPrimary = (node: HTMLElement): boolean => (node.className ?? "").split(/\s+/).includes("ch-panel-action-bar__primary");
  const overflowed = (): HTMLElement[] => actions().filter(node => node.getAttribute("data-overflow") === "true");

  function setOverflow(node: HTMLElement, value: boolean): void {
    if (value) node.setAttribute("data-overflow", "true");
    else node.removeAttribute("data-overflow");
  }
  function setMoreVisible(visible: boolean): void {
    more.hidden = !visible;
    more.setAttribute("data-hidden", String(!visible));
  }
  const overflowing = (): boolean => bar.scrollWidth > bar.clientWidth + 1;

  function fit(): void {
    if (disposed) return;
    // Nothing to measure: keep every action inline.
    if (!(bar.clientWidth > 0) || typeof bar.scrollWidth !== "number") {
      for (const node of actions()) setOverflow(node, false);
      setMoreVisible(false);
      bar.removeAttribute("data-overflowing");
      return;
    }
    const focus = doc.activeElement;
    const opened = Boolean(menu);
    const before = overflowed();
    const focusedAction = focus ? actions().find(node => buttonOf(node) === focus) : undefined;
    for (const node of actions()) setOverflow(node, false);
    setMoreVisible(false);
    if (overflowing()) {
      setMoreVisible(true);
      const secondary = actions().filter(node => !node.hidden && !isPrimary(node));
      for (let index = secondary.length - 1; index >= 0 && overflowing(); index -= 1) setOverflow(secondary[index]!, true);
    }
    const next = overflowed();
    if (next.length) bar.setAttribute("data-overflowing", "true");
    else { bar.removeAttribute("data-overflowing"); setMoreVisible(false); }
    if (opened && (next.length !== before.length || next.some((node, index) => node !== before[index]))) {
      closeMenu(Boolean(next.length));
      if (!next.length && before[0]) buttonOf(before[0])?.focus();
    } else if (menu) positionMenu(menu, next.length);
    else if (focusedAction && next.includes(focusedAction)) more.focus();
    else if (focus === more) {
      if (next.length) more.focus();
      else if (before[0]) buttonOf(before[0])?.focus();
    }
  }
  function schedule(): void {
    if (disposed) return;
    if (typeof browser?.requestAnimationFrame !== "function") { fit(); return; }
    if (frame !== undefined) browser.cancelAnimationFrame?.(frame);
    frame = browser.requestAnimationFrame(() => { frame = undefined; fit(); });
  }

  function closeMenu(restore = false): void {
    if (!menu) return;
    menu.parentNode?.removeChild(menu);
    menu = null;
    more.setAttribute("aria-expanded", "false");
    doc.removeEventListener("mousedown", outside, true);
    if (openMenus.get(doc) === closeMenu) openMenus.delete(doc);
    if (restore) more.focus();
  }
  function outside(event: Event): void {
    const target = event.target as Node;
    if (menu?.contains(target) || more.contains(target)) return;
    closeMenu();
  }
  function positionMenu(popup: HTMLElement, count: number): void {
    const rect = more.getBoundingClientRect();
    const width = Math.min(220, Math.max(0, doc.documentElement.clientWidth - 16));
    const height = browser?.innerHeight ?? 640;
    const availableAbove = rect.top - 12, availableBelow = height - rect.bottom - 12;
    const above = availableAbove >= Math.min(160, count * 32 + 8) || availableAbove >= availableBelow;
    popup.style.width = `${width}px`;
    popup.style.left = `${Math.max(8, Math.min(rect.left + rect.width - width, doc.documentElement.clientWidth - width - 8))}px`;
    popup.style.top = above ? "" : `${rect.bottom + 4}px`;
    popup.style.bottom = above ? `${height - rect.top + 4}px` : "";
    popup.style.maxHeight = `${Math.max(0, above ? availableAbove : availableBelow)}px`;
    popup.setAttribute("data-side", above ? "above" : "below");
  }
  function openMenu(): void {
    const hiddenActions = overflowed();
    if (menu || disposed || !hiddenActions.length) return;
    openMenus.get(doc)?.();
    menu = element(doc, "div", "ch-action-menu");
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", options.label);
    menu.setAttribute("data-motion", "surface-morph");
    menu.setAttribute("data-open", "false");
    const items: HTMLButtonElement[] = [];
    for (const action of hiddenActions) {
      const original = buttonOf(action);
      if (!original) continue;
      const item = element(doc, "button", "ch-action-menu__item", labelOf(action)) as HTMLButtonElement;
      item.type = "button";
      item.setAttribute("role", "menuitem");
      const unavailable = original.disabled || original.getAttribute("aria-disabled") === "true";
      if (unavailable) { item.setAttribute("aria-disabled", "true"); item.title = original.title; }
      if ((original.className ?? "").includes("ch-action-button--destructive")) item.setAttribute("data-tone", "destructive");
      item.addEventListener("click", () => {
        if (item.getAttribute("aria-disabled") === "true") return;
        closeMenu(true);
        original.click();
      });
      item.addEventListener("keydown", event => {
        const key = (event as KeyboardEvent).key, position = items.indexOf(item);
        if (key === "Escape") { event.preventDefault(); event.stopPropagation?.(); closeMenu(true); }
        else if (key === "ArrowDown" || key === "ArrowUp") {
          event.preventDefault();
          items[(position + (key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
        } else if (key === "Tab") closeMenu(true);
      });
      items.push(item);
      menu.appendChild(item);
    }
    doc.body.appendChild(menu);
    if (typeof menu.insertBefore === "function") attachMenuGlide(menu, () => items);
    positionMenu(menu, items.length);
    more.setAttribute("aria-expanded", "true");
    menu.getBoundingClientRect();
    menu.setAttribute("data-open", "true");
    openMenus.set(doc, closeMenu);
    doc.addEventListener("mousedown", outside, true);
    items[0]?.focus();
  }

  more.addEventListener("click", () => { if (menu) closeMenu(true); else openMenu(); });
  more.addEventListener("keydown", event => {
    if ((event as KeyboardEvent).key === "ArrowUp" || (event as KeyboardEvent).key === "ArrowDown") { event.preventDefault(); openMenu(); }
  });

  const Observer = (browser as unknown as { ResizeObserver?: typeof ResizeObserver } | null)?.ResizeObserver;
  const resize = Observer ? new Observer(() => schedule()) : undefined;
  resize?.observe(bar);
  const onWindowResize = (): void => schedule();
  browser?.addEventListener?.("resize", onWindowResize);
  schedule();

  return {
    button: more,
    refresh: schedule,
    dispose() {
      disposed = true;
      closeMenu();
      resize?.disconnect();
      browser?.removeEventListener?.("resize", onWindowResize);
      if (frame !== undefined) browser?.cancelAnimationFrame?.(frame);
    }
  };
}
