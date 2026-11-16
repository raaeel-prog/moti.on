import type { MotionEnv, TimeoutHandle } from "./motion/env.js";

/**
 * Rich tooltip (motion upgrade F2): one per document for every control that carries a
 * `title` or `data-tip`. CEP does not show native titles reliably, so the title is
 * borrowed while the pointer is over the control (the native one never appears) and
 * given back on leave. The tip shows the name, an optional detail line, the keyboard
 * shortcut (`aria-keyshortcuts`) and, when disabled, why (`data-disabled-reason`).
 * The Quick library and the ease actions keep their own tooltips: they carry no title.
 */

/** Mirrors --delay-tip / --delay-tip-warm / --tip-warm-window in ui-tokens/after-effects.css. */
export const TIP_DELAY_MS = 450;
export const TIP_WARM_MS = 60;
export const TIP_WARM_WINDOW_MS = 600;
/** Mirrors --dur-2, the tooltip-enter fade. */
const TIP_EXIT_MS = 200;
const OWNER_CHECK_MS = 300;
const EDGE = 8;
const GAP = 6;

export interface TipContent { name: string; detail: string; shortcut: string; reason: string }

/** "Ctrl+K", "⌘K" on macOS; aria-keyshortcuts uses "Control+K". */
export function formatShortcut(value: string, mac = false): string {
  const first = value.trim().split(/\s+/)[0] ?? "";
  if (!first) return "";
  const parts = first.split("+").map(part => part === "Control" ? (mac ? "⌃" : "Ctrl") : part === "Meta" ? (mac ? "⌘" : "Win") : part === "Alt" ? (mac ? "⌥" : "Alt") : part === "Shift" ? (mac ? "⇧" : "Shift") : part.length === 1 ? part.toUpperCase() : part);
  return mac ? parts.join("") : parts.join("+");
}

interface TipSource { getAttribute(name: string): string | null; disabled?: boolean }

/** Reads the tip of a control. `title` text "Name · more · more" becomes name + detail. */
export function tipContent(node: TipSource, borrowedTitle: string | null = null, mac = false): TipContent | null {
  const explicit = node.getAttribute("data-tip");
  const title = borrowedTitle ?? node.getAttribute("title");
  let name = explicit ?? "";
  let detail = node.getAttribute("data-tip-detail") ?? "";
  if (!explicit && title) {
    const [head, ...rest] = title.split(" · ");
    name = head ?? "";
    if (!detail) detail = rest.join(" · ");
  }
  const disabled = node.disabled === true || node.getAttribute("aria-disabled") === "true" || node.getAttribute("data-disabled") === "true";
  const reason = disabled ? node.getAttribute("data-disabled-reason") ?? "" : "";
  if (!name.trim() && !reason) return null;
  return { name: name.trim(), detail: detail.trim(), shortcut: formatShortcut(node.getAttribute("aria-keyshortcuts") ?? "", mac), reason };
}

/** A tip that only repeats a label the user can already read in full adds nothing. */
export function tipAddsInformation(content: TipContent, visibleText: string, truncated: boolean): boolean {
  return Boolean(content.detail || content.reason || content.shortcut || truncated || content.name !== visibleText.replace(/\s+/g, " ").trim());
}

/** Adds or removes one id in an aria-describedby list without touching the others. */
export function describedBy(current: string | null, id: string, add: boolean): string {
  const ids = (current ?? "").split(/\s+/).filter(token => token && token !== id);
  return (add ? [...ids, id] : ids).join(" ");
}

function setDescribedBy(node: HTMLElement, id: string, add: boolean): void {
  const next = describedBy(node.getAttribute("aria-describedby"), id, add);
  if (next) node.setAttribute("aria-describedby", next); else node.removeAttribute("aria-describedby");
}

export function tipDelay(now: number, lastHiddenAt: number): number {
  return now - lastHiddenAt <= TIP_WARM_WINDOW_MS ? TIP_WARM_MS : TIP_DELAY_MS;
}

interface Box { left: number; top: number; width: number; height: number }

/** Below the control, centred; above when it would not fit; never past the panel edge. */
export function placeTip(anchor: Box, tip: { width: number; height: number }, viewport: { width: number; height: number }): { left: number; top: number; side: "below" | "above"; origin: string } {
  const below = anchor.top + anchor.height + GAP;
  const above = anchor.top - GAP - tip.height;
  const side = below + tip.height <= viewport.height - EDGE || above < EDGE ? "below" : "above";
  const top = side === "below" ? Math.min(below, viewport.height - EDGE - tip.height) : above;
  const left = Math.max(EDGE, Math.min(anchor.left + (anchor.width - tip.width) / 2, viewport.width - EDGE - tip.width));
  const originX = Math.max(0, Math.min(tip.width, anchor.left + anchor.width / 2 - left));
  return { left: Math.round(left), top: Math.round(Math.max(EDGE, top)), side, origin: `${Math.round(originX)}px ${side === "below" ? "top" : "bottom"}` };
}

export interface RichTooltip { readonly element: HTMLElement; hide(): void; dispose(): void }

export function createRichTooltip(doc: Document, env: MotionEnv, options: { root: HTMLElement; mac?: boolean }): RichTooltip {
  const { root } = options;
  const win = doc.defaultView;
  const tip = doc.createElement("div");
  tip.className = "ch-quick-tooltip ch-rich-tooltip";
  tip.id = "rich-tooltip";
  tip.setAttribute("role", "tooltip");
  tip.setAttribute("data-motion", "tooltip-enter");
  tip.setAttribute("aria-hidden", "true");
  tip.hidden = true;
  // Inside the panel root (position: fixed keeps it on screen); the body stays the host's.
  root.appendChild(tip);

  let owner: HTMLElement | null = null;
  let pending: HTMLElement | null = null;
  let borrowed: { node: HTMLElement; title: string } | null = null;
  let suppressed: HTMLElement | null = null;
  let showTimer: TimeoutHandle | null = null;
  let exitTimer: TimeoutHandle | null = null;
  let checkTimer: TimeoutHandle | null = null;
  let lastHiddenAt = -Infinity;
  const listeners: Array<() => void> = [];
  const listen = (target: EventTarget | null | undefined, type: string, handler: EventListener, capture = false): void => {
    if (!target || typeof target.addEventListener !== "function") return;
    target.addEventListener(type, handler, capture);
    listeners.push(() => target.removeEventListener?.(type, handler, capture));
  };
  const clear = (handle: TimeoutHandle | null): null => { if (handle !== null) env.clearTimeout(handle); return null; };

  function candidate(target: EventTarget | null): HTMLElement | null {
    const node = (target as Element | null)?.closest?.("[title], [data-tip]") as HTMLElement | null | undefined;
    if (!node || !root.contains(node) || node.getAttribute("data-tip") === "off") return null;
    return node;
  }
  /** The native title would pop up over ours: hold it while the pointer is on the control. */
  function borrow(node: HTMLElement): void {
    if (borrowed?.node === node) return;
    giveBack();
    const title = node.getAttribute("title");
    if (!title) return;
    borrowed = { node, title };
    node.removeAttribute("title");
  }
  function giveBack(): void {
    if (!borrowed) return;
    // A title written meanwhile (state change) is newer than the one we hold.
    if (!borrowed.node.hasAttribute("title")) borrowed.node.setAttribute("title", borrowed.title);
    borrowed = null;
  }
  function render(content: TipContent): void {
    tip.textContent = "";
    const name = doc.createElement("strong");
    name.textContent = content.name;
    if (content.shortcut) {
      const kbd = doc.createElement("kbd");
      kbd.className = "ch-rich-tooltip__kbd";
      kbd.textContent = content.shortcut;
      name.appendChild(kbd);
    }
    if (content.name || content.shortcut) tip.appendChild(name);
    if (content.detail) { const line = doc.createElement("span"); line.textContent = content.detail; tip.appendChild(line); }
    if (content.reason) { const line = doc.createElement("span"); line.className = "ch-rich-tooltip__reason"; line.textContent = content.reason; tip.appendChild(line); }
  }
  function show(node: HTMLElement): void {
    pending = null;
    const content = tipContent(node, borrowed?.node === node ? borrowed.title : null, options.mac);
    if (!content || !node.isConnected) return;
    if (!tipAddsInformation(content, node.textContent ?? "", node.scrollWidth > node.clientWidth + 1)) return;
    exitTimer = clear(exitTimer);
    render(content);
    tip.hidden = false;
    tip.removeAttribute("aria-hidden");
    owner = node;
    // Announce only what the accessible name does not already say.
    if (content.detail || content.reason || content.shortcut) setDescribedBy(node, tip.id, true);
    const rect = node.getBoundingClientRect();
    const place = placeTip(rect, { width: tip.offsetWidth, height: tip.offsetHeight }, { width: doc.documentElement.clientWidth || win?.innerWidth || 0, height: doc.documentElement.clientHeight || win?.innerHeight || 0 });
    tip.style.left = `${place.left}px`;
    tip.style.top = `${place.top}px`;
    tip.style.transformOrigin = place.origin;
    tip.setAttribute("data-side", place.side);
    void tip.offsetWidth;
    tip.setAttribute("data-open", "true");
    watchOwner();
  }
  function watchOwner(): void {
    checkTimer = clear(checkTimer);
    checkTimer = env.timeout(() => { if (owner && !owner.isConnected) hide(); else if (owner) watchOwner(); }, OWNER_CHECK_MS);
  }
  function schedule(node: HTMLElement): void {
    if (node === owner || node === pending || node === suppressed) return;
    showTimer = clear(showTimer);
    if (owner) hide(false);
    pending = node;
    showTimer = env.timeout(() => { showTimer = null; if (pending === node) show(node); }, tipDelay(env.now(), lastHiddenAt));
  }
  function hide(animate = true): void {
    showTimer = clear(showTimer);
    checkTimer = clear(checkTimer);
    pending = null;
    if (!owner) return;
    setDescribedBy(owner, tip.id, false);
    owner = null;
    lastHiddenAt = env.now();
    tip.removeAttribute("data-open");
    tip.setAttribute("aria-hidden", "true");
    exitTimer = clear(exitTimer);
    if (animate && !env.reduced()) exitTimer = env.timeout(() => { exitTimer = null; if (!owner) tip.hidden = true; }, TIP_EXIT_MS);
    else tip.hidden = true;
  }
  function focusVisible(node: HTMLElement): boolean {
    try { return node.matches(":focus-visible"); } catch { return true; }
  }

  listen(root, "mouseover", event => {
    const node = candidate(event.target);
    if (!node) return;
    borrow(node);
    schedule(node);
  });
  listen(root, "mouseout", event => {
    const next = (event as MouseEvent).relatedTarget as Node | null;
    const current = borrowed?.node ?? pending ?? owner;
    if (!current || (next && current.contains(next))) return;
    giveBack();
    if (suppressed === current) suppressed = null;
    hide();
  });
  listen(root, "focusin", event => {
    const node = candidate(event.target);
    if (!node || !focusVisible(node)) return;
    const tag = node.tagName.toUpperCase();
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    schedule(node);
  });
  listen(root, "focusout", () => { if (!borrowed) hide(); });
  // Pressing a control is answering it: no tip until the pointer leaves it.
  listen(root, "pointerdown", event => { suppressed = candidate(event.target); hide(false); }, true);
  listen(doc, "keydown", event => {
    if ((event as KeyboardEvent).key !== "Escape" || !owner) return;
    event.preventDefault();
    hide();
  }, true);
  listen(doc, "scroll", () => hide(false), true);
  listen(root, "wheel", () => hide(false), true);
  listen(win, "blur", () => { giveBack(); hide(false); });

  return {
    element: tip,
    hide: () => hide(false),
    dispose() {
      hide(false);
      giveBack();
      exitTimer = clear(exitTimer);
      listeners.splice(0).forEach(remove => remove());
      tip.parentNode?.removeChild(tip);
    }
  };
}
