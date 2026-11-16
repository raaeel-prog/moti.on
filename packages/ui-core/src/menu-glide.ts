/**
 * One highlight that slides between the options of a menu (selection-glide) instead of each
 * row lighting up on its own. It follows the pointer and the keyboard focus, and springs back
 * to the selected option when the pointer leaves. Shared by every dropdown of the panel.
 */
export interface MenuGlide {
  /** Moves the highlight to `node`; `animate: false` places it without travelling. */
  to(node: HTMLElement | null | undefined, animate?: boolean): void;
  /** Returns the highlight to the selected (or focused) option. */
  rest(animate?: boolean): void;
  /** For menus that redraw their rows: puts the highlight back in the menu and returns it to the selection. */
  refresh(animate?: boolean): void;
  dispose(): void;
}

const SELECTED = ["aria-selected", "aria-checked", "data-selected"];

function owner(items: readonly HTMLElement[], target: EventTarget | null): HTMLElement | null {
  let current = target as Node | null;
  while (current) {
    const hit = items.find(item => item === current);
    if (hit) return hit;
    current = current.parentNode;
  }
  return null;
}

export function attachMenuGlide(menu: HTMLElement, items: () => readonly HTMLElement[]): MenuGlide {
  const doc = menu.ownerDocument;
  // Minimal host DOMs (UXP fallbacks, test doubles) keep the plain per-row states.
  if (typeof menu.insertBefore !== "function" || typeof doc?.createElement !== "function" || typeof menu.addEventListener !== "function") {
    const none = (): void => undefined;
    return { to: none, rest: none, refresh: none, dispose: none };
  }
  const glide = doc.createElement("span");
  glide.className = "ch-menu-glide";
  glide.setAttribute("aria-hidden", "true");
  glide.setAttribute("data-motion", "selection-glide");
  menu.insertBefore(glide, menu.firstChild);

  function to(node: HTMLElement | null | undefined, animate = true): void {
    if (!node || !items().includes(node) || typeof node.offsetTop !== "number") return;
    glide.setAttribute("data-ready", String(animate));
    glide.style.height = `${node.offsetHeight}px`;
    glide.style.transform = `translateY(${node.offsetTop}px)`;
    menu.setAttribute("data-glide", "true");
  }
  function rest(animate = true): void {
    const list = items();
    const target = list.find(item => SELECTED.some(name => item.getAttribute(name) === "true"))
      ?? list.find(item => item === doc.activeElement);
    if (target) to(target, animate); else menu.removeAttribute("data-glide");
  }
  function refresh(animate = true): void {
    if (glide.parentNode !== menu) {
      menu.insertBefore(glide, menu.firstChild);
      // The old transform is applied before the new one, so the move is a transition.
      void glide.offsetWidth;
    }
    rest(animate);
  }
  const hover = (event: Event): void => to(owner(items(), event.target));
  const leave = (): void => rest();
  menu.addEventListener("mouseover", hover);
  menu.addEventListener("focusin", hover);
  menu.addEventListener("mouseleave", leave);
  return {
    to, rest, refresh,
    dispose() {
      menu.removeEventListener("mouseover", hover);
      menu.removeEventListener("focusin", hover);
      menu.removeEventListener("mouseleave", leave);
      glide.parentNode?.removeChild(glide);
      menu.removeAttribute("data-glide");
    }
  };
}
