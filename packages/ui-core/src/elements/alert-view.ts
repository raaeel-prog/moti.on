import { element, requireText, resolveId, setHidden } from "../component-dom.js";
import type { AlertController, AlertOptions, ComponentScheduler, FeedbackTone } from "../components.js";

export interface AlertPresentation {
  title: string;
  description?: string;
  tone?: FeedbackTone;
  icon?: string;
  dismissLabel?: string;
  assertive?: boolean;
}

export interface AlertView extends AlertController {
  update(presentation: AlertPresentation): void;
  setValid(valid: boolean): void;
  disconnect(): void;
}

export function validateAlertPresentation(options: AlertPresentation, dismissible = false): void {
  requireText(options.title, "title");
  if (!["default", "destructive", "warning", "success", "info"].includes(options.tone ?? "default")) throw new Error("Invalid alert tone.");
  for (const key of ["description", "icon", "dismissLabel"] as const) {
    if (options[key] !== undefined && typeof options[key] !== "string") throw new Error(`${key} must be a string.`);
  }
  if (dismissible) requireText(options.dismissLabel, "dismissLabel");
  if (options.assertive !== undefined && typeof options.assertive !== "boolean") throw new Error("assertive must be boolean.");
}

export function validateAlertOptions(options: AlertOptions): void {
  validateAlertPresentation(options, options.onDismiss !== undefined);
  if (options.id !== undefined) requireText(options.id, "id");
  if (options.onDismiss !== undefined && typeof options.onDismiss !== "function") throw new Error("onDismiss must be a function.");
  if (options.actions !== undefined && !Array.isArray(options.actions)) throw new Error("actions must be an array.");
  for (const action of options.actions ?? []) {
    requireText(action.label, "action.label");
    if (typeof action.onPress !== "function") throw new Error("action.onPress must be a function.");
    if (action.dismissOnPress !== undefined && typeof action.dismissOnPress !== "boolean") throw new Error("dismissOnPress must be boolean.");
  }
  if (options.scheduler !== undefined && (typeof options.scheduler.setTimeout !== "function" || typeof options.scheduler.clearTimeout !== "function")) {
    throw new Error("scheduler must provide setTimeout and clearTimeout.");
  }
}

const DEFAULT_SCHEDULER: ComponentScheduler = {
  setTimeout: (callback, delay) => globalThis.setTimeout(callback, delay),
  clearTimeout: handle => globalThis.clearTimeout(handle as number)
};

/** Owns the same lifetime for both the custom element and its native DIV fallback. */
export function mountAlertView(doc: Document, root: HTMLElement, options: AlertOptions): AlertView {
  validateAlertOptions(options);
  const id = resolveId(options.id, "alert");
  const scheduler = options.scheduler ?? DEFAULT_SCHEDULER;
  const onDismiss = options.onDismiss;
  const actionOptions = (options.actions ?? []).map(action => ({ ...action }));
  const origin = doc.activeElement as HTMLElement | null;
  let closing = false, disposed = false, valid = true;
  let closeTimer: unknown;
  let closedFromConnected = false;
  let rendered: AlertPresentation | undefined;
  root.id = id;
  root.setAttribute("aria-atomic", "true");
  root.setAttribute("data-motion", "toast-enter toast-exit");
  root.setAttribute("data-open", "true");
  const icon = element(doc, "span", "ch-alert__icon");
  icon.setAttribute("aria-hidden", "true");
  root.appendChild(icon);
  const content = element(doc, "div", "ch-alert__content");
  const title = element(doc, "div", "ch-alert__title");
  title.id = `${id}-title`;
  root.setAttribute("aria-labelledby", title.id);
  content.appendChild(title);
  const description = element(doc, "div", "ch-alert__description");
  content.appendChild(description);
  root.appendChild(content);
  const buttons: HTMLButtonElement[] = [];
  const canInteract = (): boolean => valid && !closing && !disposed && !root.hidden &&
    root.getAttribute("data-hidden") !== "true" && root.isConnected !== false;
  function cancelTimer(): void {
    if (closeTimer !== undefined) scheduler.clearTimeout(closeTimer);
    closeTimer = undefined;
  }
  function finishClose(): void {
    cancelTimer();
    setHidden(root, true);
    if (!disposed && (!closedFromConnected || root.isConnected !== false)) onDismiss?.();
  }
  function dismiss(): void {
    if (closing || disposed) return;
    closing = true;
    closedFromConnected = root.isConnected === true;
    for (let current = doc.activeElement as Node | null; current; current = current.parentNode) {
      if (current === root) {
        if (origin?.parentNode && origin.isConnected !== false && typeof origin.focus === "function") origin.focus();
        break;
      }
    }
    root.setAttribute("data-open", "false");
    root.setAttribute("data-closing", "true");
    root.setAttribute("aria-hidden", "true");
    for (const button of buttons) {
      button.setAttribute("tabindex", "-1");
      button.setAttribute("aria-disabled", "true");
    }
    closeTimer = scheduler.setTimeout(finishClose, 140);
  }
  if (actionOptions.length) {
    const actions = element(doc, "div", "ch-alert__actions");
    for (const action of actionOptions) {
      const button = element(doc, "button", "ch-toast__action", action.label);
      button.setAttribute("type", "button");
      button.setAttribute("data-motion", "tile-hover tile-press");
      button.addEventListener("click", () => {
        if (!canInteract() || button.disabled) return;
        action.onPress();
        // A consumer may synchronously replace the view while handling its action.
        if (action.dismissOnPress !== false && canInteract()) dismiss();
      });
      buttons.push(button);
      actions.appendChild(button);
    }
    content.appendChild(actions);
  }
  const close = onDismiss ? element(doc, "button", "ch-toast__dismiss", "×") : undefined;
  if (close) {
    close.setAttribute("type", "button");
    close.addEventListener("click", () => { if (canInteract() && !close.disabled) dismiss(); });
    buttons.push(close);
    root.appendChild(close);
  }
  function update(next: AlertPresentation): void {
    validateAlertPresentation(next, onDismiss !== undefined);
    const tone = next.tone ?? "default";
    if (!rendered || (rendered.tone ?? "default") !== tone) {
      const extra = root.className.split(/\s+/).filter(name => name && name !== "ch-alert" && !name.startsWith("ch-alert--"));
      root.className = ["ch-alert", `ch-alert--${tone}`, ...extra].join(" ");
    }
    if (!rendered || rendered.icon !== next.icon || rendered.tone !== next.tone) {
      icon.textContent = next.icon ?? (tone === "success" ? "✓" : tone === "warning" ? "!" : tone === "destructive" ? "×" : "i");
    }
    if (!rendered || rendered.title !== next.title) title.textContent = next.title;
    if (!rendered || rendered.description !== next.description) {
      description.textContent = next.description ?? "";
      setHidden(description, !next.description);
    }
    if (!rendered || rendered.assertive !== next.assertive) {
      root.setAttribute("role", next.assertive ? "alert" : "status");
      root.setAttribute("aria-live", next.assertive ? "assertive" : "polite");
    }
    if (close && (!rendered || rendered.dismissLabel !== next.dismissLabel)) {
      close.setAttribute("aria-label", next.dismissLabel!);
      close.title = next.dismissLabel!;
    }
    // Presentation updates never reopen a dismissed/externally hidden alert,
    // recreate its actions or overwrite button.disabled managed by consumers.
    rendered = { ...next };
  }
  update(options);
  return {
    element: root, update, dismiss,
    setTitle: title => update({ ...rendered!, title }),
    setDescription: description => update({ ...rendered!, description }),
    setTone: tone => update({ ...rendered!, tone }),
    setValid(next) {
      valid = next;
      for (const button of buttons) {
        if (!valid || closing || disposed) button.setAttribute("aria-disabled", "true");
        else button.removeAttribute("aria-disabled");
      }
    },
    disconnect() {
      if (!closing) return;
      cancelTimer();
      setHidden(root, true);
    },
    dispose() {
      disposed = true;
      cancelTimer();
      for (const button of buttons) button.setAttribute("aria-disabled", "true");
      if (root.parentNode) root.parentNode.removeChild(root);
    }
  };
}
