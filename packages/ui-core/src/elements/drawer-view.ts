import type { ComponentScheduler } from "../components.js";
import type { ComponentStateOptions, StatefulController } from "../component-dom.js";

import { resolveId, element, setHidden, removeAttribute, requireText, createStateBinding, applyState, validateState } from "../component-dom.js";
import { type OverlayCloseReason } from "./popover-view.js";

export interface DrawerOptions extends ComponentStateOptions {
  id: string;
  label: string;
  content: HTMLElement;
  overlay: boolean;
  initialFocus?: HTMLElement;
  onClose?(reason: OverlayCloseReason): void;
  scheduler?: ComponentScheduler;
}

export interface DrawerController extends StatefulController {
  readonly element: HTMLElement;
  readonly backdrop: HTMLElement;
  readonly isOpen: boolean;
  open(origin?: HTMLElement): void;
  close(reason?: OverlayCloseReason): void;
  finishClose(): void;
}

/** Lifecycle operations used by the element without changing the factory contract. */
export interface DrawerView extends DrawerController {
  disconnect(): void;
  setOverlay(overlay: boolean): void;
}

const DEFAULT_SCHEDULER: ComponentScheduler = {
  setTimeout: (callback: () => void, delay?: number) => globalThis.setTimeout(callback, delay),
  clearTimeout: (handle: unknown) => globalThis.clearTimeout(handle as number)
};

const FOCUSABLE_TAGS = new Set(["button", "input", "select", "textarea", "a"]);

function isWithin(parent: HTMLElement, child: HTMLElement | null): boolean {
  for (let node: Node | null = child; node; node = node.parentNode) {
    if (node === parent) return true;
  }
  return false;
}

/** Validate the complete configuration before moving content or changing the root. */
export function validateDrawerOptions(options: DrawerOptions): void {
  if (!options || typeof options !== "object") throw new Error("Drawer options are required.");
  if (options.id !== undefined) requireText(options.id, "id");
  requireText(options.label, "label");
  if (!options.content || typeof options.content.appendChild !== "function") {
    throw new Error("content must be an HTML element.");
  }
  if (typeof options.overlay !== "boolean") throw new Error("overlay must be boolean.");
  if (options.initialFocus !== undefined &&
      (typeof options.initialFocus.focus !== "function" || !isWithin(options.content, options.initialFocus))) {
    throw new Error("initialFocus must belong to content.");
  }
  if (options.onClose !== undefined && typeof options.onClose !== "function") {
    throw new Error("onClose must be a function.");
  }
  if (options.scheduler !== undefined &&
      (typeof options.scheduler.setTimeout !== "function" || typeof options.scheduler.clearTimeout !== "function")) {
    throw new Error("scheduler must provide setTimeout and clearTimeout.");
  }
  validateState(options.state ?? "default", options.stateLabel);
}

function asFocusable(value: Element | null): HTMLElement | null {
  if (!value) return null;
  const candidate = value as HTMLElement & { focus?: unknown };
  return typeof candidate.focus === "function" ? candidate : null;
}

function canRestoreFocus(target: HTMLElement | null): target is HTMLElement {
  return target !== null && (!("isConnected" in target) || target.isConnected === true);
}

function focusableDescendants(root: HTMLElement): HTMLElement[] {
  const found: HTMLElement[] = [];

  function visit(parent: HTMLElement): void {
    for (let index = 0; index < parent.children.length; index += 1) {
      const child = parent.children[index];
      if (child === undefined) continue;
      const candidate = child as HTMLElement & { disabled?: boolean; type?: string };
      const tag = candidate.tagName.toLowerCase();
      if (candidate.hidden || candidate.getAttribute("data-hidden") === "true" ||
          candidate.getAttribute("aria-hidden") === "true") continue;
      const tabIndex = candidate.getAttribute("tabindex");
      const explicitTabIndex = tabIndex == null ? null : Number(tabIndex);
      if (
        ((FOCUSABLE_TAGS.has(tag) && (tag !== "a" || candidate.getAttribute("href") != null)) ||
          (explicitTabIndex !== null && explicitTabIndex >= 0))
        && candidate.disabled !== true
        && (explicitTabIndex === null || explicitTabIndex >= 0)
        && !(tag === "input" && (candidate.getAttribute("type") === "hidden" || candidate.type === "hidden"))
      ) {
        found.push(candidate);
      }
      visit(candidate);
    }
  }

  visit(root);
  return found;
}

export function mountDrawerView(doc: Document, root: HTMLElement, options: DrawerOptions): DrawerView {
  validateDrawerOptions(options);
  if (options.content === root) throw new Error("content cannot be the drawer root.");
  const id = resolveId(options.id, "drawer");
  if (!root.className.split(/\s+/).includes("ch-drawer")) {
    root.className = `${root.className} ch-drawer`.trim();
  }
  root.id = id;
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", options.overlay ? "true" : "false");
  root.setAttribute("aria-label", requireText(options.label, "label"));
  root.setAttribute("aria-hidden", "true");
  root.setAttribute("data-open", "false");
  root.setAttribute("data-overlay", options.overlay ? "true" : "false");
  root.setAttribute("data-motion", "drawer-enter drawer-exit drawer-stagger");
  root.setAttribute("tabindex", "-1");
  setHidden(root, true);
  root.appendChild(options.content);
  const state = createStateBinding(doc, root, id, options);
  const scheduler = options.scheduler ?? DEFAULT_SCHEDULER;

  const backdrop = element(doc, "div", "ch-drawer-backdrop");
  backdrop.setAttribute("aria-hidden", "true");
  backdrop.setAttribute("data-open", "false");
  backdrop.setAttribute("data-motion", "drawer-dimmer");
  setHidden(backdrop, true);

  let opened = false;
  let overlay = options.overlay;
  let returnFocus: HTMLElement | null = null;
  let closeTimer: unknown;

  function cancelCloseTimer(): void {
    if (closeTimer === undefined) return;
    scheduler.clearTimeout(closeTimer);
    closeTimer = undefined;
  }

  function finishClose(): void {
    if (opened) return;
    cancelCloseTimer();
    setHidden(root, true);
    setHidden(backdrop, true);
    removeAttribute(root, "data-closing");
  }

  function disconnect(): void {
    cancelCloseTimer();
    opened = false;
    const target = returnFocus;
    returnFocus = null;
    root.setAttribute("data-open", "false");
    root.setAttribute("aria-hidden", "true");
    removeAttribute(root, "data-closing");
    backdrop.setAttribute("data-open", "false");
    setHidden(root, true);
    setHidden(backdrop, true);
    if (canRestoreFocus(target)) target.focus();
  }

  function setOverlay(nextOverlay: boolean): void {
    if (typeof nextOverlay !== "boolean") throw new Error("overlay must be boolean.");
    overlay = nextOverlay;
    root.setAttribute("aria-modal", overlay ? "true" : "false");
    root.setAttribute("data-overlay", overlay ? "true" : "false");
    backdrop.setAttribute("data-open", opened && overlay ? "true" : "false");
    setHidden(backdrop, !(opened && overlay));
  }

  function close(reason: OverlayCloseReason = "programmatic"): void {
    if (!opened) return;
    opened = false;
    const target = returnFocus;
    returnFocus = null;
    root.setAttribute("data-open", "false");
    root.setAttribute("data-closing", "true");
    root.setAttribute("aria-hidden", "true");
    backdrop.setAttribute("data-open", "false");
    closeTimer = scheduler.setTimeout(finishClose, 220);
    try {
      options.onClose?.(reason);
    } finally {
      // A consumer may reopen synchronously from onClose. Do not steal its focus.
      if (!opened && canRestoreFocus(target)) target.focus();
    }
  }

  root.addEventListener("keydown", (event) => {
    const keyboardEvent = event as KeyboardEvent;
    if (!opened) return;
    if (keyboardEvent.key === "Escape") {
      event.preventDefault();
      close("escape");
      return;
    }
    if (keyboardEvent.key !== "Tab" || !overlay) return;
    const focusables = focusableDescendants(root);
    if (focusables.length === 0) {
      event.preventDefault();
      root.focus();
      return;
    }
    const activeIndex = focusables.indexOf(asFocusable(doc.activeElement) ?? root);
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (keyboardEvent.shiftKey && (activeIndex <= 0 || doc.activeElement === root)) {
      event.preventDefault();
      last?.focus();
    } else if (!keyboardEvent.shiftKey && (activeIndex < 0 || activeIndex === focusables.length - 1)) {
      event.preventDefault();
      first?.focus();
    }
  });
  root.addEventListener("animationend", (event) => {
    if (event.target === root) finishClose();
  });
  backdrop.addEventListener("click", () => {
    if (overlay) close("backdrop");
  });

  return {
    element: root,
    backdrop,
    get isOpen() {
      return opened;
    },
    open(origin) {
      if (opened) return;
      cancelCloseTimer();
      const candidate = asFocusable(origin ?? doc.activeElement);
      returnFocus = candidate && !isWithin(root, candidate) ? candidate : null;
      opened = true;
      setHidden(root, false);
      root.setAttribute("aria-hidden", "false");
      root.setAttribute("data-open", "true");
      removeAttribute(root, "data-closing");
      if (overlay) {
        setHidden(backdrop, false);
        backdrop.setAttribute("data-open", "true");
      }
      const initial = options.initialFocus && isWithin(root, options.initialFocus) &&
        !options.initialFocus.hidden && options.initialFocus.getAttribute("data-hidden") !== "true"
        ? options.initialFocus : focusableDescendants(root)[0] ?? root;
      initial.focus();
      if (!isWithin(root, asFocusable(doc.activeElement))) root.focus();
    },
    close,
    finishClose,
    disconnect,
    setOverlay,
    setState(nextState, stateLabel) {
      applyState(root, state, nextState, stateLabel);
    }
  };
}
