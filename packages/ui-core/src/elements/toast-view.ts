import {
  applyState, createStateBinding, element, requireText, setHidden, validateState,
  type ComponentState, type ComponentStateOptions
} from "../component-dom.js";
import type { FeedbackTone, ToastAction } from "../components.js";

export interface ToastPresentation extends ComponentStateOptions {
  message: string;
  detail?: string;
  tone?: FeedbackTone;
  assertive?: boolean;
  dismissLabel: string;
}

export interface ToastViewOptions extends ToastPresentation {
  id: string;
  actions?: readonly ToastAction[];
  canInteract(): boolean;
  onAction(index: number): void;
  onDismiss(): void;
}

export interface ToastView {
  readonly element: HTMLElement;
  readonly actions: readonly HTMLButtonElement[];
  readonly dismissButton: HTMLButtonElement;
  readonly state: ComponentState;
  update(presentation: ToastPresentation): void;
  updateLabels(dismissLabel: string, stateLabel?: string): void;
  setValid(valid: boolean): void;
}

export function toastTone(options: ToastPresentation): FeedbackTone {
  return options.tone ?? (options.state === "error" ? "destructive" :
    options.state === "warning" ? "warning" : options.state === "success" ? "success" : "info");
}

export function validateToastPresentation(options: ToastPresentation): void {
  requireText(options.message, "message");
  requireText(options.dismissLabel, "dismissLabel");
  validateState(options.state ?? "default", options.stateLabel);
  if (options.assertive && options.state !== "error") throw new Error("assertive is reserved for error toasts.");
  if (!["default", "destructive", "warning", "success", "info"].includes(toastTone(options))) {
    throw new Error("Invalid toast tone.");
  }
}

export function validateToastViewOptions(options: ToastViewOptions): void {
  validateToastPresentation(options);
  requireText(options.id, "id");
  for (const action of options.actions ?? []) {
    requireText(action.label, "action.label");
    if (typeof action.onPress !== "function") throw new Error("action.onPress must be a function.");
  }
}

/** Pure Light DOM presentation. The region alone owns visibility, timers and focus recovery. */
export function mountToastView(doc: Document, root: HTMLElement, options: ToastViewOptions): ToastView {
  validateToastViewOptions(options);
  root.id = options.id;
  root.setAttribute("data-motion", "toast-enter toast-exit");
  root.setAttribute("aria-atomic", "true");
  const icon = element(doc, "span", "ch-toast__icon");
  icon.setAttribute("aria-hidden", "true");
  root.appendChild(icon);
  const content = element(doc, "div", "ch-toast__content");
  const message = element(doc, "div", "ch-toast__message");
  content.appendChild(message);
  const detail = element(doc, "div", "ch-toast__detail");
  content.appendChild(detail);
  root.appendChild(content);
  const binding = createStateBinding(doc, root, options.id, options, false);
  binding.node.className = "ch-component-state ch-toast__state";
  const row = element(doc, "div", "ch-toast__actions");
  const actions = (options.actions ?? []).map(action => {
    const button = element(doc, "button", "ch-toast__action", action.label);
    button.setAttribute("type", "button");
    button.setAttribute("data-motion", "tile-hover tile-press");
    row.appendChild(button);
    return button;
  });
  if (actions.length) content.appendChild(row);
  const dismissButton = element(doc, "button", "ch-toast__dismiss", "×");
  dismissButton.setAttribute("type", "button");
  dismissButton.setAttribute("data-motion", "tile-hover tile-press");
  root.appendChild(dismissButton);
  let valid = true;
  let rendered: ToastPresentation | undefined;

  function update(next: ToastPresentation): void {
    validateToastPresentation(next);
    const tone = toastTone(next);
    if (!rendered || toastTone(rendered) !== tone) {
      root.className = `ch-toast ch-toast--${tone}`;
      icon.textContent = tone === "success" ? "✓" : tone === "warning" ? "!" : tone === "destructive" ? "×" : "i";
    }
    if (!rendered || rendered.message !== next.message) message.textContent = next.message;
    if (!rendered || rendered.detail !== next.detail) {
      detail.textContent = next.detail ?? "";
      setHidden(detail, next.detail === undefined);
    }
    if (!rendered || rendered.assertive !== next.assertive) {
      root.setAttribute("role", next.assertive ? "alert" : "status");
      root.setAttribute("aria-live", next.assertive ? "assertive" : "polite");
    }
    if (binding.state !== (next.state ?? "default") || binding.label !== next.stateLabel) {
      applyState(root, binding, next.state ?? "default", next.stateLabel);
    }
    if (!rendered || rendered.dismissLabel !== next.dismissLabel) {
      dismissButton.setAttribute("aria-label", next.dismissLabel);
      dismissButton.title = next.dismissLabel;
    }
    rendered = { ...next };
  }
  actions.forEach((button, index) => button.addEventListener("click", () => {
    if (valid && options.canInteract()) options.onAction(index);
  }));
  const dismiss = (): void => { if (valid && options.canInteract()) options.onDismiss(); };
  dismissButton.addEventListener("click", dismiss);
  root.addEventListener("keydown", event => {
    if ((event as KeyboardEvent).key !== "Escape") return;
    event.preventDefault();
    dismiss();
  });
  update(options);
  return {
    element: root, actions, dismissButton,
    get state() { return binding.state; },
    update,
    updateLabels(dismissLabel, stateLabel) {
      const next = { ...rendered!, dismissLabel };
      if (stateLabel !== undefined) next.stateLabel = stateLabel;
      update(next);
    },
    setValid(nextValid) {
      valid = nextValid;
      for (const button of [...actions, dismissButton]) {
        if (valid) button.removeAttribute("aria-disabled");
        else button.setAttribute("aria-disabled", "true");
      }
    }
  };
}
