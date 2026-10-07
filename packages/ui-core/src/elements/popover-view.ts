import type { ComponentScheduler } from "../components.js";
import type { ComponentStateOptions, StatefulController } from "../component-dom.js";

import { setHidden, removeAttribute, requireText, createStateBinding, applyState, validateState } from "../component-dom.js";

export type OverlayCloseReason = "escape" | "backdrop" | "programmatic";

export interface PopoverOptions extends ComponentStateOptions {
  id: string;
  label: string;
  content: HTMLElement;
  initialFocus?: HTMLElement;
  onClose?(reason: OverlayCloseReason): void;
  scheduler?: ComponentScheduler;
}

export interface PopoverController extends StatefulController {
  readonly element: HTMLElement;
  readonly isOpen: boolean;
  open(origin?: HTMLElement): void;
  close(reason?: OverlayCloseReason): void;
  finishClose(): void;
  /** Cancel pending work and close silently when the element leaves the panel. */
  disconnect(): void;
}

const DEFAULT_SCHEDULER: ComponentScheduler = {
  setTimeout: (callback: () => void, delay?: number) => globalThis.setTimeout(callback, delay),
  clearTimeout: (handle: unknown) => globalThis.clearTimeout(handle as number)
};

function asFocusable(value: Element | null): HTMLElement | null {
  if (!value) return null;
  const candidate = value as HTMLElement & { focus?: unknown };
  return typeof candidate.focus === "function" ? candidate : null;
}

function isElement(value: unknown): value is HTMLElement {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as HTMLElement;
  return typeof candidate.tagName === "string"
    && typeof candidate.focus === "function"
    && typeof candidate.appendChild === "function"
    && candidate.ownerDocument !== undefined;
}

function contains(parent: HTMLElement, child: HTMLElement): boolean {
  let current: Node | null = child;
  while (current) {
    if (current === parent) return true;
    current = current.parentNode;
  }
  return false;
}

export function validatePopoverOptions(options: PopoverOptions): void {
  if (typeof options !== "object" || options === null) throw new Error("popover options are required.");
  requireText(options.id, "id");
  requireText(options.label, "label");
  if (!isElement(options.content)) throw new Error("content must be an HTML element.");
  if (options.initialFocus !== undefined &&
      (!isElement(options.initialFocus) || !contains(options.content, options.initialFocus))) {
    throw new Error("initialFocus must be inside content.");
  }
  validateState(options.state ?? "default", options.stateLabel);
  if (options.onClose !== undefined && typeof options.onClose !== "function") {
    throw new Error("onClose must be a function.");
  }
  if (options.scheduler !== undefined &&
      (typeof options.scheduler.setTimeout !== "function" || typeof options.scheduler.clearTimeout !== "function")) {
    throw new Error("scheduler must implement setTimeout and clearTimeout.");
  }
}

function restoreFocus(target: HTMLElement | null): void {
  if (target && target.isConnected !== false) target.focus();
}

export function mountPopoverView(doc: Document, root: HTMLElement, options: PopoverOptions): PopoverController {
  validatePopoverOptions(options);
  if (root.ownerDocument !== doc || options.content.ownerDocument !== doc || root === options.content) {
    throw new Error("popover root and content must belong to the same document.");
  }
  const id = options.id;
  if (!root.className.split(/\s+/).includes("ch-popover")) {
    root.className = `${root.className} ch-popover`.trim();
  }
  root.id = id;
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "false");
  root.setAttribute("aria-label", requireText(options.label, "label"));
  root.setAttribute("tabindex", "-1");
  root.setAttribute("aria-hidden", "true");
  root.setAttribute("data-open", "false");
  root.setAttribute("data-motion", "preview-enter preview-exit");
  setHidden(root, true);
  root.appendChild(options.content);
  const state = createStateBinding(doc, root, id, options);
  const scheduler = options.scheduler ?? DEFAULT_SCHEDULER;
  let opened = false;
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
    removeAttribute(root, "data-closing");
  }

  function disconnect(): void {
    const target = returnFocus;
    const wasOpen = opened;
    opened = false;
    returnFocus = null;
    cancelCloseTimer();
    root.setAttribute("data-open", "false");
    root.setAttribute("aria-hidden", "true");
    removeAttribute(root, "data-closing");
    setHidden(root, true);
    if (wasOpen) restoreFocus(target);
  }

  function close(reason: OverlayCloseReason = "programmatic"): void {
    if (reason !== "escape" && reason !== "backdrop" && reason !== "programmatic") {
      throw new Error("Invalid popover close reason.");
    }
    if (!opened) return;
    opened = false;
    root.setAttribute("data-open", "false");
    root.setAttribute("data-closing", "true");
    root.setAttribute("aria-hidden", "true");
    const target = returnFocus;
    returnFocus = null;
    closeTimer = scheduler.setTimeout(finishClose, 160);
    try { options.onClose?.(reason); }
    finally { restoreFocus(target); }
  }

  root.addEventListener("keydown", (event) => {
    if (!opened || (event as KeyboardEvent).key !== "Escape") return;
    event.preventDefault();
    close("escape");
  });
  root.addEventListener("animationend", (event) => {
    if (event.target === root) finishClose();
  });

  return {
    element: root,
    get isOpen() {
      return opened;
    },
    open(origin) {
      if (opened) return;
      cancelCloseTimer();
      returnFocus = origin ?? asFocusable(doc.activeElement);
      opened = true;
      setHidden(root, false);
      removeAttribute(root, "data-closing");
      root.setAttribute("aria-hidden", "false");
      root.setAttribute("data-open", "true");
      const initial = options.initialFocus;
      (initial && contains(root, initial) ? initial : root).focus();
    },
    close,
    finishClose,
    disconnect,
    setState(nextState, stateLabel) {
      applyState(root, state, nextState, stateLabel);
    }
  };
}
