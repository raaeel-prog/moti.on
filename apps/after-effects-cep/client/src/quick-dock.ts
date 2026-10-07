import { button, createElement } from "@motion/ui-core";
import { MOTION_CATALOG } from "@motion/ui-motion";

export interface QuickDockContext {
  hasComp: boolean;
  selectionCount: number;
  /** Stable composition/selection identity, independent of polling timestamps. */
  contextKey: string;
  busy: boolean;
}
export interface QuickDockOptions {
  content: HTMLElement;
  locale: string;
  pinned: boolean;
  onPinChange(pinned: boolean): void;
  onHeightChange?(height: number): void;
}
export interface QuickDockController {
  element: HTMLElement;
  update(context: QuickDockContext): void;
  expandAndFocus(): void;
  dispose(): void;
}
const COPY = {
  "pt-BR": { title: "Ações rápidas", noComp: "Sem composição", empty: "Sem seleção", selected: (n: number) => `${n} ${n === 1 ? "camada" : "camadas"}`, pin: "Fixar ações rápidas abertas", unpin: "Desafixar ações rápidas", pinned: "Fixada", automatic: "Automático", manual: "Manual" },
  "en-US": { title: "Quick actions", noComp: "No composition", empty: "No selection", selected: (n: number) => `${n} ${n === 1 ? "layer" : "layers"}`, pin: "Keep quick actions open", unpin: "Unpin quick actions", pinned: "Pinned", automatic: "Automatic", manual: "Manual" }
};
const DOCK_MS = MOTION_CATALOG.find(motion => motion.id === "dock-expand")!.durationMs[0]!;
let sequence = 0;
function contains(parent: HTMLElement, node: EventTarget | null): boolean {
  let current = node as Node | null;
  while (current) { if (current === parent) return true; current = current.parentNode; }
  return false;
}

/** Preserves the existing anchor/action content and never performs host work. */
export function createQuickDock(doc: Document, options: QuickDockOptions): QuickDockController {
  const copy = COPY[options.locale === "pt-BR" ? "pt-BR" : "en-US"];
  const element = createElement(doc, "section", "ch-quick-dock");
  const header = createElement(doc, "div", "ch-quick-dock-header");
  const toggle = button(doc, { label: "", onClick: () => {
    if (pinned) { pinned = false; options.onPinChange(false); }
    manual = !open; reconcile();
  } });
  toggle.className = "ch-button ch-quick-dock-toggle";
  toggle.id = "quick-dock-toggle";
  const chevron = createElement(doc, "span", "ch-library-chevron");
  chevron.setAttribute("aria-hidden", "true"); toggle.appendChild(chevron);
  toggle.appendChild(createElement(doc, "span", "", copy.title));
  const contextLabel = createElement(doc, "small", "ch-quick-dock-context");
  toggle.appendChild(contextLabel); header.appendChild(toggle);
  const pin = button(doc, { label: "", onClick: () => {
    pinned = !pinned; manual = null; options.onPinChange(pinned); reconcile();
  } });
  pin.id = "quick-dock-pin";
  pin.className = "ch-button ch-quick-dock-pin";
  // Compact pin silhouette made from CSS, consistent with the existing chevrons.
  const pinGlyph = createElement(doc, "span", "ch-quick-dock-pin-glyph");
  pinGlyph.setAttribute("aria-hidden", "true"); pin.appendChild(pinGlyph);
  header.appendChild(pin); element.appendChild(header);
  const body = createElement(doc, "div", "ch-quick-dock-body");
  body.id = `quick-dock-body-${++sequence}`;
  body.setAttribute("data-motion", "dock-expand");
  body.hidden = true;
  body.style.height = "0px";
  body.appendChild(options.content); element.appendChild(body);
  toggle.setAttribute("aria-controls", body.id);
  const tabStops = new Map<HTMLElement, string | null>();
  let pinned = options.pinned;
  let manual: boolean | null = null;
  let open = false;
  let pointerInside = false;
  let alive = true;
  let context: QuickDockContext = { hasComp: false, selectionCount: 0, contextKey: "", busy: false };
  let hasContext = false;
  let transitionTimer: ReturnType<typeof setTimeout> | undefined;
  let blurTimer: ReturnType<typeof setTimeout> | undefined;

  function stopTabbing(): void {
    for (const tag of ["button", "input", "select", "textarea", "a"]) {
      for (const node of Array.from(body.getElementsByTagName(tag)) as HTMLElement[]) {
        if (!tabStops.has(node)) tabStops.set(node, node.getAttribute("tabindex") ?? null);
        node.setAttribute("tabindex", "-1");
      }
    }
  }
  function restoreTabbing(): void {
    for (const [node, previous] of tabStops) {
      if (previous === null) node.removeAttribute("tabindex"); else node.setAttribute("tabindex", previous);
    }
    tabStops.clear();
  }
  function notifyHeight(): void {
    const height = element.getBoundingClientRect?.().height ?? element.offsetHeight ?? 28;
    options.onHeightChange?.(height);
  }
  function contentHeight(): number {
    return Math.max(options.content.scrollHeight || 0, options.content.offsetHeight || 0);
  }
  function resize(): void {
    if (!alive || !open) return;
    body.style.height = `${contentHeight()}px`; notifyHeight();
  }
  function setOpen(next: boolean): void {
    if (next === open) { if (open) resize(); else stopTabbing(); return; }
    clearTimeout(transitionTimer);
    // Capture the current rendered height to reverse an in-flight transition.
    const current = body.hidden ? 0 : body.getBoundingClientRect?.().height ?? body.offsetHeight ?? 0;
    body.hidden = false;
    body.style.height = `${current}px`;
    void body.offsetHeight;
    open = next;
    body.setAttribute("aria-hidden", String(!open));
    if (open) restoreTabbing(); else stopTabbing();
    element.setAttribute("data-open", String(open));
    body.setAttribute("data-open", String(open));
    toggle.setAttribute("aria-expanded", String(open));
    body.style.height = `${open ? contentHeight() : 0}px`;
    notifyHeight();
    transitionTimer = setTimeout(() => {
      if (!alive) return;
      if (!open) body.hidden = true; else resize();
      notifyHeight();
    }, DOCK_MS);
  }
  function reconcile(): void {
    if (!alive) return;
    const interacting = pointerInside || contains(body, doc.activeElement) || context.busy;
    const requested = pinned || (manual ?? (context.hasComp && context.selectionCount > 0));
    setOpen(requested || (open && interacting));
    const label = pinned ? copy.unpin : copy.pin;
    pin.setAttribute("aria-label", label); pin.title = label;
    pin.setAttribute("aria-pressed", String(pinned));
    element.setAttribute("data-mode", pinned ? "pinned" : manual === null ? "automatic" : "manual");
    contextLabel.textContent = context.hasComp ? context.selectionCount ? copy.selected(context.selectionCount) : copy.empty : copy.noComp;
    contextLabel.title = pinned ? copy.pinned : manual === null ? copy.automatic : copy.manual;
  }
  body.addEventListener("mouseenter", () => { pointerInside = true; });
  body.addEventListener("mouseleave", () => { pointerInside = false; reconcile(); });
  body.addEventListener("focusin", () => { clearTimeout(blurTimer); });
  body.addEventListener("focusout", () => {
    clearTimeout(blurTimer);
    blurTimer = setTimeout(() => { reconcile(); }, 0);
  });
  const win = doc.defaultView;
  const Observer = (win as (Window & { ResizeObserver?: typeof ResizeObserver }) | null)?.ResizeObserver;
  const observer = Observer ? new Observer(resize) : null;
  observer?.observe(options.content);
  win?.addEventListener("resize", resize);
  element.setAttribute("data-open", "false"); body.setAttribute("data-open", "false");
  body.setAttribute("aria-hidden", "true"); toggle.setAttribute("aria-expanded", "false");
  stopTabbing(); reconcile();
  return {
    element,
    update(next) {
      if (hasContext && next.contextKey !== context.contextKey) manual = null;
      hasContext = true; context = next; reconcile();
    },
    expandAndFocus() {
      if (!alive) return;
      manual = true; reconcile();
      const first = Array.from(options.content.getElementsByTagName("button")).find(node => !node.disabled);
      (first ?? toggle).focus();
    },
    dispose() {
      alive = false; clearTimeout(transitionTimer); clearTimeout(blurTimer);
      observer?.disconnect(); win?.removeEventListener("resize", resize); restoreTabbing();
    }
  };
}
