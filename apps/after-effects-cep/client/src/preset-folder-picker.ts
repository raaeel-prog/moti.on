/**
 * Presets in narrow docks: the folder tree folds into one picker above the cards.
 *
 * Beside the cards, below 360 px the tree cut its names ("Entrada…", "Luz e m…") and
 * left one thin card column. There the picker names the current folder and opens the
 * same tree — same rows, collapsed folders and labels — as a sheet over the cards, and
 * the cards take the full width. From 360 px the tree is the resizable sidebar again.
 * The gallery's `data-folder-picker` attribute switches the layout (ae-workstation.css).
 */
import { uiIcon } from "./ui-icons.js";

/** Narrowest panel that keeps the folder tree beside the cards. */
export const FOLDER_PICKER_BREAKPOINT = 360;
/** Space between the picker and its sheet, and between the sheet and the footer. */
const SHEET_GAP = 2;
/** When there's no room for three rows below the picker, use the whole gallery body. */
const ANCHORED_MIN_HEIGHT = 80;

export function folderPickerActive(panelWidth: number): boolean {
  return panelWidth > 0 && panelWidth < FOLDER_PICKER_BREAKPOINT;
}

/** The picker shows the folder and its parent; the parent gives way first when space runs out. */
export function folderPickerLabel(path: readonly string[]): { parent: string; name: string; full: string } {
  return { parent: path.length > 1 ? path[path.length - 2]! : "", name: path[path.length - 1] ?? "", full: path.join(" › ") };
}

export interface FolderPicker {
  /** True below the breakpoint: the tree waits behind the picker. */
  active(): boolean;
  isOpen(): boolean;
  /** Re-reads the panel width; true when the layout switched. */
  update(): boolean;
  /** Opens or closes the sheet. From 360 px the tree simply stays shown. */
  setOpen(open: boolean): void;
  setPath(path: readonly string[]): void;
}

export function createFolderPicker(doc: Document, options: {
  locale: string;
  gallery: HTMLElement;
  trigger: HTMLButtonElement;
  /** The folder tree: the sidebar from 360 px, the sheet below. */
  menu: HTMLElement;
  footerTop(): number;
  /** The current folder's row, focused when the sheet opens. */
  current(): HTMLElement | null;
  onClose(): void;
}): FolderPicker {
  const { gallery, trigger, menu } = options, pt = options.locale === "pt-BR";
  const part = (className: string, text = ""): HTMLElement => {
    const node = doc.createElement("span"); node.className = className; node.textContent = text; return node;
  };
  const icon = part("ch-folder-icon"), parent = part("ch-preset-folder-picker__parent"), separator = part("ch-preset-folder-picker__separator", "›");
  const name = part("ch-preset-folder-picker__name"), chevron = part("ch-preset-folder-picker__chevron");
  icon.setAttribute("aria-hidden", "true"); separator.setAttribute("aria-hidden", "true");
  const glyph = uiIcon(doc, "chevron-down", 12);
  if (glyph) chevron.appendChild(glyph); else chevron.textContent = "▾";
  trigger.textContent = "";
  for (const node of [icon, parent, separator, name, chevron]) trigger.appendChild(node);
  trigger.classList.add("ch-preset-folder-picker");
  trigger.setAttribute("aria-expanded", "false");
  const back = doc.createElement("button");
  back.type = "button";
  back.className = "ch-button ch-preset-folder-back";
  back.textContent = pt ? "Voltar aos presets" : "Back to presets";
  back.hidden = true;
  back.addEventListener("click", () => { setOpen(false); trigger.focus({ preventScroll: true }); });
  menu.appendChild(back);
  let active = false, open = false;
  gallery.setAttribute("data-folder-picker", "false");
  const panelWidth = (): number => (doc.defaultView ?? window).innerWidth || 0;

  function place(): void {
    const host = gallery.getBoundingClientRect(), anchor = trigger.getBoundingClientRect();
    const bottom = Math.floor(options.footerTop() - host.top - SHEET_GAP);
    const anchoredTop = Math.ceil(anchor.bottom - host.top + SHEET_GAP);
    const expanded = bottom - anchoredTop < ANCHORED_MIN_HEIGHT;
    const top = expanded ? SHEET_GAP : anchoredTop;
    if (!expanded && doc.activeElement === back) trigger.focus({ preventScroll: true });
    back.hidden = !expanded;
    menu.style.setProperty("top", `${top}px`);
    menu.style.setProperty("max-height", `${Math.max(0, bottom - top)}px`);
    const focused = doc.activeElement as HTMLElement | null;
    if (focused && focused !== back && menu.contains(focused)) reveal(focused);
  }
  /** Keep the current folder visible within the sheet, below the sticky back button. */
  function reveal(row: HTMLElement): void {
    const item = row.getBoundingClientRect(), sheet = menu.getBoundingClientRect();
    const top = back.hidden ? sheet.top : back.getBoundingClientRect().bottom;
    if (item.top < top) menu.scrollTop += item.top - top;
    else if (item.bottom > sheet.bottom) menu.scrollTop += item.bottom - sheet.bottom;
  }
  function setOpen(next: boolean): void {
    const wasOpen = open;
    open = active && next;
    trigger.setAttribute("aria-expanded", String(open));
    if (active && !open) {
      menu.hidden = true; menu.setAttribute("data-open", "false"); menu.setAttribute("aria-hidden", "true");
      back.hidden = true;
      if (wasOpen) options.onClose();
      return;
    }
    menu.hidden = false; menu.setAttribute("aria-hidden", "false");
    if (!active) {
      back.hidden = true;
      menu.style.removeProperty("top"); menu.style.removeProperty("max-height"); menu.setAttribute("data-open", "true");
      if (wasOpen) options.onClose();
      return;
    }
    place();
    if (wasOpen) return;
    // Measured closed first, so the sheet unfolds from the picker (surface-morph).
    menu.setAttribute("data-open", "false"); void menu.offsetWidth; menu.setAttribute("data-open", "true");
    const row = options.current();
    if (row) { row.focus({ preventScroll: true }); reveal(row); }
    else if (!back.hidden) back.focus({ preventScroll: true });
  }
  function update(): boolean {
    const next = folderPickerActive(panelWidth());
    if (next === active) { if (open) place(); return false; }
    const focus = doc.activeElement as HTMLElement | null, inMenu = Boolean(focus && menu.contains(focus)), onTrigger = focus === trigger;
    active = next; gallery.setAttribute("data-folder-picker", String(active));
    setOpen(false);
    // Focus never stays on a control the new layout hides.
    if (active && inMenu) trigger.focus();
    else if (!active && onTrigger) options.current()?.focus();
    return true;
  }
  // Tab or a click moving focus away from the sheet and its picker closes it; a redraw
  // inside it (folding a folder) briefly leaves focus nowhere and must not.
  const leave = (event: FocusEvent): void => {
    const next = event.relatedTarget as Node | null;
    if (open && next && !menu.contains(next) && next !== trigger) setOpen(false);
  };
  menu.addEventListener("focusout", leave as EventListener);
  menu.addEventListener("focusin", event => {
    const target = event.target as HTMLElement;
    if (open && target !== back && target.classList.contains("ch-folder-select")) reveal(target);
  });
  trigger.addEventListener("focusout", leave as EventListener);
  return {
    active: () => active,
    isOpen: () => open,
    update,
    setOpen,
    setPath(path) {
      const label = folderPickerLabel(path);
      parent.textContent = label.parent; parent.hidden = !label.parent; separator.hidden = !label.parent;
      name.textContent = label.name; trigger.title = label.full;
      trigger.setAttribute("aria-label", `${pt ? "Pasta" : "Folder"}: ${label.full}`);
    }
  };
}
