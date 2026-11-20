import { createElement, createIcon } from "@motion/ui-core";
import { uiIcon } from "./ui-icons.js";

/**
 * Botão Editar ao lado da busca de Ferramentas (plano 2026-11-19).
 *
 * Aparece quando a seleção atual recebeu um efeito pelo clique rápido. Com um
 * efeito, leva direto à página dele; com mais de um, abre um menu curto para
 * escolher. Sem efeito na seleção, fica escondido — não vira linha de status.
 */
export interface ToolEditButtonOptions {
  locale: string;
  nameOf(toolId: string): string;
  onEdit(toolId: string): void;
}
export interface ToolEditButton {
  readonly element: HTMLElement;
  /** `tools`: newest first. */
  update(tools: readonly string[], busy: boolean): void;
  dispose(): void;
}

export function createToolEditButton(doc: Document, options: ToolEditButtonOptions): ToolEditButton {
  const pt = options.locale === "pt-BR";
  const element = createElement(doc, "div", "ch-tool-edit");
  element.hidden = true;
  const trigger = createElement(doc, "button", "ch-button ch-tool-edit__button") as HTMLButtonElement;
  trigger.type = "button";
  trigger.id = "library-edit-applied";
  const icon = uiIcon(doc, "edit", 13);
  const label = createElement(doc, "span", "ch-tool-edit__label");
  if (icon) trigger.appendChild(icon);
  trigger.appendChild(label);
  element.appendChild(trigger);
  const menu = createElement(doc, "div", "ch-tool-edit__menu");
  menu.id = "library-edit-menu";
  menu.setAttribute("role", "menu");
  menu.hidden = true;
  element.appendChild(menu);
  let tools: readonly string[] = [];
  let shownKey = "";

  const closeMenu = (focusTrigger: boolean): void => {
    if (menu.hidden) return;
    menu.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    if (focusTrigger) trigger.focus();
  };
  const openMenu = (): void => {
    menu.textContent = "";
    menu.appendChild(createElement(doc, "div", "ch-tool-edit__menu-title", pt ? "Efeitos na seleção" : "Effects on the selection"));
    for (const id of tools) {
      const item = createElement(doc, "button", "ch-tool-edit__item") as HTMLButtonElement;
      item.type = "button";
      item.id = `library-edit-${id}`;
      item.setAttribute("role", "menuitem");
      const glyph = createIcon(doc, id);
      glyph.setAttribute("aria-hidden", "true");
      item.appendChild(glyph);
      item.appendChild(createElement(doc, "span", "", options.nameOf(id)));
      item.addEventListener("click", () => { closeMenu(false); options.onEdit(id); });
      menu.appendChild(item);
    }
    menu.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    (menu.querySelector("button") as HTMLButtonElement | null)?.focus();
  };
  trigger.addEventListener("click", () => {
    if (tools.length === 1 && tools[0]) { options.onEdit(tools[0]); return; }
    if (menu.hidden) openMenu(); else closeMenu(true);
  });
  menu.addEventListener("keydown", event => {
    const key = (event as KeyboardEvent).key;
    if (key === "Escape") { event.preventDefault(); event.stopPropagation?.(); closeMenu(true); return; }
    if (key !== "ArrowDown" && key !== "ArrowUp") return;
    event.preventDefault();
    const items = Array.from(menu.querySelectorAll("button")) as HTMLButtonElement[];
    const index = items.indexOf(doc.activeElement as HTMLButtonElement);
    const next = items[(index + (key === "ArrowDown" ? 1 : items.length - 1)) % items.length];
    next?.focus();
  });
  const outside = (event: Event): void => {
    let node = event.target as Node | null;
    while (node) { if (node === element) return; node = node.parentNode; }
    closeMenu(false);
  };
  doc.addEventListener("pointerdown", outside, true);

  return {
    element,
    update(next, busy) {
      tools = next;
      trigger.disabled = busy;
      const key = next.join("|");
      if (!next.length) { element.hidden = true; closeMenu(false); shownKey = ""; return; }
      const single = next.length === 1 && next[0] ? options.nameOf(next[0]) : null;
      label.textContent = single ?? (pt ? `${next.length} efeitos` : `${next.length} effects`);
      trigger.title = single ? (pt ? `Editar ${single} na seleção` : `Edit ${single} on the selection`) : (pt ? "Escolher o efeito para editar" : "Choose the effect to edit");
      trigger.setAttribute("aria-label", trigger.title);
      if (single) { trigger.removeAttribute("aria-haspopup"); trigger.removeAttribute("aria-expanded"); }
      else { trigger.setAttribute("aria-haspopup", "menu"); trigger.setAttribute("aria-controls", menu.id); trigger.setAttribute("aria-expanded", String(!menu.hidden)); }
      // A new effect makes the button arrive with a short pop; a refresh of the same list stays still.
      if (key !== shownKey) { element.removeAttribute("data-pop"); void element.offsetWidth; element.setAttribute("data-pop", "true"); }
      shownKey = key;
      element.hidden = false;
      if (!menu.hidden && !single) openMenu();
    },
    dispose() { doc.removeEventListener("pointerdown", outside, true); }
  };
}
