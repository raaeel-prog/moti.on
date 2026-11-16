import { setUiIcon, type UiIconName } from "./ui-icons.js";

/**
 * Right-click menu for the AE panel. Same surface as the folder "…" popover (radius 5,
 * 0 10px 30px shadow + 1px inner rim, 20 px rows padded 21 px — Composer browser.css),
 * opened at the pointer and kept inside the panel. One menu at a time; ↑↓/Home/End move,
 * Enter/Space run, Esc/Tab/click outside/scroll/resize close and focus goes back.
 */
export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: UiIconName;
  shortcut?: string;
  /** Why the action is unavailable: shown as a tooltip, the row stays focusable. */
  disabledReason?: string;
  checked?: boolean;
  /** A folder label color id (red, yellow…) drawn as a 10 px dot before the text. */
  swatch?: string;
  run(): void;
}
export type ContextMenuEntry = ContextMenuItem | { separator: true } | { section: string };

export interface ContextMenuOptions {
  x: number;
  y: number;
  label: string;
  entries: readonly ContextMenuEntry[];
  /** Visible area in viewport coordinates for an anchored, scrollable menu. */
  verticalBounds?: { top: number; bottom: number };
  /** Focus returns here on close (defaults to the focused element at open time). */
  returnFocus?: HTMLElement | null;
  onClose?(): void;
}

export interface ContextMenuHandle {
  readonly element: HTMLElement;
  close(restoreFocus?: boolean): void;
}

const EDGE = 4;
let current: ContextMenuHandle | null = null;

function isItem(entry: ContextMenuEntry): entry is ContextMenuItem {
  return (entry as ContextMenuItem).run !== undefined;
}

/** Keeps the menu inside the viewport: flips left/up when it would overflow. */
export function placeMenu(x: number, y: number, width: number, height: number, viewW: number, viewH: number): { left: number; top: number } {
  const left = x + width + EDGE > viewW ? Math.max(EDGE, x - width) : x;
  const top = y + height + EDGE > viewH ? Math.max(EDGE, y - height) : y;
  return { left: Math.min(left, Math.max(EDGE, viewW - width - EDGE)), top: Math.min(top, Math.max(EDGE, viewH - height - EDGE)) };
}

export function closeContextMenu(): void { current?.close(false); }

export function openContextMenu(doc: Document, options: ContextMenuOptions): ContextMenuHandle {
  current?.close(false);
  const view = doc.defaultView;
  const back = options.returnFocus ?? (doc.activeElement as HTMLElement | null);
  const menu = doc.createElement("div");
  menu.className = "ch-context-menu";
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", options.label);
  menu.setAttribute("data-motion", "menu-pop");
  const bounds = options.verticalBounds;
  if (bounds) menu.dataset.bounded = "true";
  const rows: HTMLButtonElement[] = [];
  for (const entry of options.entries) {
    if ("separator" in entry) { const line = doc.createElement("div"); line.className = "ch-context-menu__separator"; line.setAttribute("role", "separator"); menu.appendChild(line); continue; }
    if ("section" in entry) { const head = doc.createElement("div"); head.className = "ch-context-menu__section"; head.textContent = entry.section; menu.appendChild(head); continue; }
    if (!isItem(entry)) continue;
    const row = doc.createElement("button");
    row.type = "button";
    row.className = "ch-context-menu__item";
    row.setAttribute("role", entry.checked === undefined ? "menuitem" : "menuitemcheckbox");
    if (entry.checked !== undefined) row.setAttribute("aria-checked", String(entry.checked));
    row.tabIndex = -1;
    row.dataset.id = entry.id;
    const icon = doc.createElement("span");
    icon.className = "ch-context-menu__icon";
    if (entry.checked) setUiIcon(icon, "check", "✓");
    else if (entry.icon) setUiIcon(icon, entry.icon);
    row.appendChild(icon);
    if (entry.swatch) { const dot = doc.createElement("span"); dot.className = "ch-context-menu__swatch"; dot.dataset.color = entry.swatch; row.appendChild(dot); }
    const text = doc.createElement("span");
    text.className = "ch-context-menu__text";
    text.textContent = entry.label;
    row.appendChild(text);
    if (entry.shortcut) { const kbd = doc.createElement("kbd"); kbd.className = "ch-context-menu__kbd"; kbd.textContent = entry.shortcut; row.appendChild(kbd); }
    if (entry.disabledReason) { row.setAttribute("aria-disabled", "true"); row.title = entry.disabledReason; }
    row.addEventListener("click", () => { if (entry.disabledReason || closed) return; handle.close(Boolean(bounds)); entry.run(); });
    row.addEventListener("mousemove", () => { if (doc.activeElement !== row) row.focus({ preventScroll: true }); });
    rows.push(row);
    menu.appendChild(row);
  }
  doc.body.appendChild(menu);
  const viewW = view?.innerWidth ?? 1024;
  const ceiling = bounds ? Math.max(0, bounds.top - EDGE) : 0;
  const floor = Math.min(view?.innerHeight ?? 768, bounds?.bottom ?? Infinity);
  const viewH = floor - ceiling;
  if (bounds) menu.style.maxHeight = `${Math.max(0, viewH - 2 * EDGE)}px`;
  const rect = menu.getBoundingClientRect?.();
  // Offset dimensions ignore the entry scale animation.
  const spot = placeMenu(options.x, options.y - ceiling, menu.offsetWidth || rect?.width || 200, menu.offsetHeight || rect?.height || rows.length * 22 + 12, viewW, viewH);
  const top = spot.top + ceiling;
  menu.style.left = `${spot.left}px`;
  menu.style.top = `${top}px`;
  // The menu grows from the corner nearest the pointer.
  menu.style.transformOrigin = `${spot.left < options.x ? "right" : "left"} ${top < options.y ? "bottom" : "top"}`;

  let closed = false;
  const move = (step: number | "first" | "last"): void => {
    if (!rows.length) return;
    const index = rows.indexOf(doc.activeElement as HTMLButtonElement);
    const next = step === "first" ? 0 : step === "last" ? rows.length - 1 : (index + step + rows.length) % rows.length;
    const row = rows[next];
    row?.focus({ preventScroll: true });
    if (bounds) row?.scrollIntoView?.({ block: "nearest" });
  };
  const onKey = (event: KeyboardEvent): void => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); move(event.key === "ArrowDown" ? 1 : -1); }
    else if (event.key === "Home" || event.key === "End") { event.preventDefault(); move(event.key === "Home" ? "first" : "last"); }
    else if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); handle.close(true); }
    else if (event.key === "Tab") { event.preventDefault(); handle.close(true); }
  };
  const outside = (event: Event): void => {
    const target = event.target as Node;
    if (!menu.contains(target) && !(bounds && back?.contains(target))) handle.close(false);
  };
  const dismiss = (): void => handle.close(false);
  const onResize = (): void => handle.close(Boolean(bounds));
  const onScroll = (event: Event): void => { if (!menu.contains(event.target as Node)) handle.close(false); };
  menu.addEventListener("keydown", onKey as EventListener);
  menu.addEventListener("contextmenu", event => event.preventDefault());
  doc.addEventListener("mousedown", outside, true);
  doc.addEventListener("scroll", onScroll, true);
  view?.addEventListener("resize", onResize);
  view?.addEventListener("blur", dismiss);

  const handle: ContextMenuHandle = {
    element: menu,
    close(restoreFocus = true) {
      if (closed) return;
      closed = true;
      if (current === handle) current = null;
      doc.removeEventListener("mousedown", outside, true);
      doc.removeEventListener("scroll", onScroll, true);
      view?.removeEventListener("resize", onResize);
      view?.removeEventListener("blur", dismiss);
      menu.parentNode?.removeChild(menu);
      if (restoreFocus && back?.isConnected) back.focus({ preventScroll: true });
      options.onClose?.();
    }
  };
  current = handle;
  (rows.find(row => row.getAttribute("aria-disabled") !== "true") ?? rows[0])?.focus({ preventScroll: true });
  return handle;
}
