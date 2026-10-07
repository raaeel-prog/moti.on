import { element as createElement, requireText, setHidden } from "../component-dom.js";

export interface SelectFieldOption { value: string; label: string; }

export interface DropdownPresentation {
  label: string;
  value: string;
  description?: string;
  disabled?: boolean;
  disabledReason?: string;
}

export interface SelectFieldOptions extends DropdownPresentation {
  id: string;
  options: readonly SelectFieldOption[];
  onChange(value: string): void;
}

export interface DropdownView {
  readonly element: HTMLElement;
  readonly select: HTMLSelectElement;
  readonly trigger: HTMLButtonElement | undefined;
  update(presentation: DropdownPresentation): void;
  setValid(valid: boolean): void;
  close(): void;
}

const openFieldMenus = new WeakMap<Document, () => void>();

/** Shared by the shell, native elements and the DOM fallback. */
export function closeOpenDropdown(doc: Document): void { openFieldMenus.get(doc)?.(); }

function validatePresentation(options: DropdownPresentation): void {
  requireText(options.label, "label");
  if (typeof options.value !== "string") throw new Error("value must be a string.");
  if (options.disabled !== undefined && typeof options.disabled !== "boolean") throw new Error("disabled must be boolean.");
  for (const key of ["description", "disabledReason"] as const) {
    if (options[key] !== undefined && typeof options[key] !== "string") throw new Error(`${key} must be a string.`);
  }
}

export function validateDropdownOptions(options: SelectFieldOptions): void {
  requireText(options.id, "id");
  validatePresentation(options);
  if (!Array.isArray(options.options)) throw new Error("options must be an array.");
  for (const item of options.options) {
    if (!item || typeof item.value !== "string") throw new Error("Each option needs a string value.");
    requireText(item.label, "option.label");
  }
  if (typeof options.onChange !== "function") throw new Error("onChange must be a function.");
}

/** Stable Light DOM shared by Custom Elements and runtimes without a registry. */
export function mountDropdownView(root: HTMLElement, initial: SelectFieldOptions): DropdownView {
  validateDropdownOptions(initial);
  const doc = root.ownerDocument;
  let options = { ...initial, options: initial.options.map(item => ({ ...item })) };
  let valid = true;
  // Real detached controls must never confirm a stale host action. Minimal host
  // DOMs without isConnected keep the existing native-select behavior.
  const canInteract = (): boolean => valid && !options.disabled && root.isConnected !== false;
  root.className = "ch-field ch-field--select";
  const label = createElement(doc, "label", "ch-field__label", options.label);
  label.htmlFor = options.id;
  root.appendChild(label);
  const control = createElement(doc, "div", "ch-field__control");
  root.appendChild(control);
  let description: HTMLElement | undefined;
  const select = createElement(doc, "select", "ch-select");
  select.id = options.id;
  for (const item of options.options) {
    const option = createElement(doc, "option", undefined, item.label);
    option.value = item.value;
    option.selected = item.value === options.value;
    select.appendChild(option);
  }
  control.appendChild(select);
  let closeMenu = (): void => undefined;
  // Custom Elements support does not imply browser overlay support (UXP).
  const supportsOverlay = typeof select.animate === "function" && typeof select.getBoundingClientRect === "function"
    && typeof doc.addEventListener === "function" && Boolean(doc.body);
  const trigger = supportsOverlay ? createElement(doc, "button", "ch-select-trigger") : undefined;
  const current = trigger ? createElement(doc, "span", "ch-select-trigger__value") : undefined;
  const sync = (): void => {
    label.textContent = options.label;
    if (options.description && !description) {
      description = createElement(doc, "div", "ch-field__description");
      description.id = `${options.id}-description`;
      root.appendChild(description);
    }
    if (description) {
      description.textContent = options.description ?? "";
      setHidden(description, !options.description);
    }
    for (const target of [select, trigger]) {
      if (!target) continue;
      target.disabled = !valid || options.disabled === true;
      target.setAttribute("aria-disabled", String(target.disabled));
      target.title = options.disabledReason ?? options.description ?? options.label;
      if (options.description) target.setAttribute("aria-describedby", `${options.id}-description`);
      else target.removeAttribute("aria-describedby");
    }
    if (current && trigger) {
      current.textContent = options.options.find(item => item.value === select.value)?.label ?? select.value;
      trigger.setAttribute("aria-label", `${options.label}: ${current.textContent}`);
    }
  };
  const notifyChange = (value: string): void => {
    options = { ...options, value };
    sync();
    options.onChange(value);
  };
  select.value = options.value;
  select.addEventListener("change", () => {
    if (!canInteract() || !options.options.some(item => item.value === select.value)) return;
    closeMenu();
    notifyChange(select.value);
  });
  const view: DropdownView = {
    element: root, select,
    get trigger() { return trigger; },
    update(presentation) {
      validatePresentation(presentation);
      closeMenu();
      options = { id: options.id, options: options.options, onChange: options.onChange, ...presentation };
      select.value = options.value;
      sync();
    },
    setValid(next) { valid = next; if (!valid) closeMenu(); sync(); },
    close() { closeMenu(); }
  };
  sync();
  if (!trigger || !current) return view;
  setHidden(select, true);
  select.setAttribute("tabindex", "-1");
  const overlayTrigger = trigger;
  trigger.type = "button";
  trigger.id = options.id + "-trigger";
  trigger.setAttribute("data-focus-key", options.id);
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");
  trigger.setAttribute("aria-controls", options.id + "-menu");
  trigger.setAttribute("data-motion", "button-press");
  label.htmlFor = trigger.id;
  trigger.appendChild(current);
  trigger.appendChild(createElement(doc, "span", "ch-select-trigger__chevron", "⌄"));
  control.appendChild(trigger);
  sync();
  let menu: HTMLElement | null = null;
  let choices: HTMLButtonElement[] = [];
  let index = 0;
  let isOpen = false;
  let exitTimer: ReturnType<typeof setTimeout> | undefined;
  let observer: MutationObserver | undefined;
  const removeMenu = (): void => {
    if (exitTimer !== undefined) clearTimeout(exitTimer);
    exitTimer = undefined;
    menu?.parentNode?.removeChild(menu);
    menu = null;
    choices = [];
    if (openFieldMenus.get(doc) === dispose) openFieldMenus.delete(doc);
  };
  const detachListeners = (): void => {
    doc.removeEventListener("mousedown", outside);
    doc.removeEventListener("scroll", scrollClose, true);
    doc.defaultView?.removeEventListener?.("resize", resizeClose);
    observer?.disconnect();
    observer = undefined;
  };
  const dispose = (): void => {
    isOpen = false;
    overlayTrigger.setAttribute("aria-expanded", "false");
    detachListeners();
    removeMenu();
  };
  function close(restore = false): void {
    if (!menu || !isOpen) return;
    isOpen = false;
    menu.setAttribute("data-open", "false");
    menu.setAttribute("aria-hidden", "true");
    menu.style.pointerEvents = "none";
    choices.forEach(choice => choice.setAttribute("tabindex", "-1"));
    overlayTrigger.setAttribute("aria-expanded", "false");
    detachListeners();
    let duration = 0;
    // Read the shared motion definition; reduced-motion resolves to none/0ms.
    if (typeof doc.defaultView?.getComputedStyle === "function") {
      const style = doc.defaultView.getComputedStyle(menu);
      duration = Math.max(0, ...style.transitionDuration.split(",").map(value => {
        const time = parseFloat(value);
        return Number.isFinite(time) ? time * (value.trim().endsWith("ms") ? 1 : 1000) : 0;
      }));
    }
    if (duration > 0) exitTimer = setTimeout(removeMenu, duration);
    else removeMenu();
    if (restore) overlayTrigger.focus();
  }
  const scrollClose = (event?: Event): void => { if (!event || !menu?.contains(event.target as Node)) close(); };
  // A resize targets Window, which cannot be passed to Node.contains().
  const resizeClose = (): void => close();
  const outside = (event: Event): void => {
    const target = event.target as Node;
    if (!menu?.contains(target) && !overlayTrigger.contains(target)) close();
  };
  function move(next: number): void {
    index = Math.max(0, Math.min(choices.length - 1, next));
    choices.forEach((choice, position) => choice.setAttribute("tabindex", position === index ? "0" : "-1"));
    choices[index]?.focus();
  }
  function open(): void {
    if (!canInteract() || isOpen) return;
    const previous = openFieldMenus.get(doc);
    if (previous && previous !== dispose) previous();
    if (exitTimer !== undefined) clearTimeout(exitTimer);
    exitTimer = undefined;
    isOpen = true;
    const reused = menu !== null;
    menu ??= createElement(doc, "div", "ch-select-menu");
    menu.id = options.id + "-menu";
    menu.setAttribute("role", "listbox");
    menu.setAttribute("aria-label", options.label);
    menu.setAttribute("data-motion", "surface-morph");
    menu.setAttribute("data-open", "false");
    menu.setAttribute("aria-hidden", "false");
    menu.style.pointerEvents = "";
    if (!reused) choices = options.options.map((item, position) => {
      const choice = createElement(doc, "button", "ch-select-menu__option", item.label) as HTMLButtonElement;
      choice.type = "button";
      choice.setAttribute("role", "option");
      choice.setAttribute("aria-selected", String(item.value === select.value));
      choice.addEventListener("click", () => {
        if (!isOpen || !canInteract() || !choices.includes(choice)) return;
        select.value = item.value;
        overlayTrigger.setAttribute("aria-label", `${options.label}: ${item.label}`);
        close(true);
        notifyChange(item.value);
      });
      choice.addEventListener("keydown", event => {
        if (!isOpen || !canInteract() || !choices.includes(choice)) return;
        const key = (event as KeyboardEvent).key;
        if (key === "Escape") { event.preventDefault(); close(true); }
        else if (key === "ArrowDown" || key === "ArrowUp" || key === "Home" || key === "End") {
          event.preventDefault();
          move(key === "Home" ? 0 : key === "End" ? choices.length - 1 : position + (key === "ArrowDown" ? 1 : -1));
        } else if (key === "Tab") close(true);
      });
      menu?.appendChild(choice);
      return choice;
    });
    choices.forEach((choice, position) => choice.setAttribute("aria-selected", String(options.options[position]?.value === select.value)));
    if (!reused) doc.body.appendChild(menu);
    const rect = overlayTrigger.getBoundingClientRect();
    const width = Math.min(Math.max(rect.width, 160), Math.max(0, doc.documentElement.clientWidth - 16));
    menu.style.width = `${width}px`;
    menu.style.left = `${Math.max(8, Math.min(rect.left, doc.documentElement.clientWidth - width - 8))}px`;
    const availableBelow = (doc.defaultView?.innerHeight ?? 720) - rect.bottom - 8;
    const availableAbove = rect.top - 8;
    const above = availableBelow < 160 && availableAbove > availableBelow;
    menu.style.maxHeight = `${Math.max(28, Math.min(260, above ? availableAbove : availableBelow))}px`;
    menu.style.top = "";
    menu.style.bottom = "";
    if (above) menu.style.bottom = `${(doc.defaultView?.innerHeight ?? 720) - rect.top + 4}px`;
    else menu.style.top = `${rect.bottom + 4}px`;
    menu.setAttribute("data-side", above ? "above" : "below");
    overlayTrigger.setAttribute("aria-expanded", "true");
    // Flush the closed surface once so the first opening can transition.
    menu.getBoundingClientRect();
    menu.setAttribute("data-open", "true");
    openFieldMenus.set(doc, dispose);
    const browser = doc.defaultView as (Window & typeof globalThis) | null;
    if (typeof browser?.MutationObserver === "function") {
      observer = new browser.MutationObserver(() => {
        if (!doc.documentElement.contains(overlayTrigger)) dispose();
      });
      observer.observe(doc.body, { childList: true, subtree: true });
    }
    doc.addEventListener("mousedown", outside);
    doc.addEventListener("scroll", scrollClose, true);
    doc.defaultView?.addEventListener?.("resize", resizeClose);
    move(Math.max(0, options.options.findIndex(item => item.value === select.value)));
  }
  overlayTrigger.addEventListener("click", () => isOpen ? close(true) : open());
  overlayTrigger.addEventListener("keydown", event => {
    if (["ArrowDown", "ArrowUp"].includes((event as KeyboardEvent).key)) { event.preventDefault(); open(); }
  });
  closeMenu = dispose;
  return view;
}
