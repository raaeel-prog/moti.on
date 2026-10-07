import {
  applyState, bindDisabledExplanation, createDisabledBinding, createStateBinding,
  element, isActivationKey, removeAttribute, requireText, stateBlocksInteraction,
  setHidden, updateDisabledReason, updateInteractiveDescriptions, validateDisabled, validateState,
  type ComponentStateOptions, type DisableableOptions, type StatefulController, type DisableableController
} from "../component-dom.js";
import { createIcon } from "../icons.js";

type InteractiveOptions = ComponentStateOptions & DisableableOptions;

export interface ActionButtonOptions extends InteractiveOptions {
  id?: string;
  label: string;
  /** Stable catalog name. The icon is decorative; label remains the accessible name. */
  icon?: string;
  /** Hides the visible label; also supports consumer-provided SVG content. */
  compact?: boolean;
  variant?: "default" | "primary" | "danger" | "quiet" | "secondary" | "tertiary" | "ghost" | "destructive";
  title?: string;
  onPress(): void;
}

export interface ActionButtonController extends StatefulController, DisableableController {
  readonly element: HTMLElement;
  readonly button: HTMLButtonElement;
}

/** Montagem comum: um unico comportamento para Light DOM e fallback UXP. */
export function mountActionButton(
  doc: Document,
  root: HTMLElement,
  id: string,
  options: ActionButtonOptions
): ActionButtonView {
  let label = options.label;
  let title = options.title;
  let currentIcon: string | undefined;
  let connected = true;
  root.className = `${root.className} ch-action`.trim();

  const button = element(
    doc,
    "button",
    `ch-action-button ch-action-button--${canonicalVariant(options.variant ?? "default")}`
  );
  button.id = id;
  button.setAttribute("type", "button");
  const icon = element(doc, "span", "ch-action-button__icon");
  icon.setAttribute("aria-hidden", "true");
  const labelNode = element(doc, "span", "ch-action-button__label", label);
  button.appendChild(icon);
  button.appendChild(labelNode);
  root.appendChild(button);

  const state = createStateBinding(doc, root, id, options);
  const disabled = createDisabledBinding(doc, root, id, options);
  bindDisabledExplanation(disabled, [button]);

  function blocked(): boolean {
    return disabled.disabled || stateBlocksInteraction(state.state);
  }

  function refresh(): void {
    const unavailable = blocked();
    if (unavailable) button.setAttribute("aria-disabled", "true");
    else removeAttribute(button, "aria-disabled");

    if (state.state === "loading") button.setAttribute("aria-busy", "true");
    else removeAttribute(button, "aria-busy");

    button.title = disabled.disabled
      ? requireText(disabled.reason, "disabledReason")
      : title ?? state.label ?? label;
    button.setAttribute("aria-label", label);
    updateInteractiveDescriptions(button, state, disabled);
  }

  function press(event?: Event): void {
    if (blocked() || !connected || root.isConnected === false || button.disabled) {
      event?.preventDefault();
      return;
    }
    options.onPress();
  }

  button.addEventListener("click", (event) => press(event));
  button.addEventListener("keydown", (event) => {
    const keyboardEvent = event as KeyboardEvent;
    if (!isActivationKey(keyboardEvent.key)) return;
    event.preventDefault();
    press(event);
  });
  function setIcon(value: string | undefined): void {
    if (value !== undefined) requireText(value, "icon");
    if (value !== currentIcon) {
      while (icon.firstChild) icon.removeChild(icon.firstChild);
      if (value !== undefined) icon.appendChild(createIcon(doc, value));
      currentIcon = value;
    }
    setHidden(icon, value === undefined);
    root.setAttribute("data-has-icon", String(value !== undefined));
    button.setAttribute("data-has-icon", String(value !== undefined));
  }
  function setCompact(value: boolean): void {
    if (typeof value !== "boolean") throw new Error("compact must be boolean.");
    root.setAttribute("data-compact", String(value));
    button.setAttribute("data-compact", String(value));
    setHidden(labelNode, value);
  }
  setIcon(options.icon);
  setCompact(options.compact ?? false);
  refresh();

  return {
    element: root,
    button,
    setLabel(value) {
      label = requireText(value, "label");
      labelNode.textContent = value;
      refresh();
    },
    setIcon,
    setCompact,
    setConnected(value) { connected = value; },
    setVariant(value) {
      button.className = `ch-action-button ch-action-button--${canonicalVariant(value)}`;
    },
    setTitle(value) {
      title = value;
      refresh();
    },
    setState(nextState, stateLabel) {
      applyState(root, state, nextState, stateLabel);
      refresh();
    },
    setDisabled(nextDisabled, disabledReason) {
      updateDisabledReason(disabled, nextDisabled, disabledReason);
      refresh();
    }
  };
}

export type ActionButtonVariant = NonNullable<ActionButtonOptions["variant"]>;

/** Legacy names resolve to the same four visual/semantic variants. */
function canonicalVariant(value: ActionButtonVariant): "default" | "primary" | "danger" | "quiet" {
  if (value === "secondary") return "default";
  if (value === "tertiary" || value === "ghost") return "quiet";
  if (value === "destructive") return "danger";
  return value;
}

export interface ActionButtonView extends ActionButtonController {
  setLabel(value: string): void;
  setIcon(value: string | undefined): void;
  setCompact(value: boolean): void;
  setConnected(value: boolean): void;
  setVariant(value: ActionButtonVariant): void;
  setTitle(value: string | undefined): void;
}

export function validateActionButtonOptions(options: ActionButtonOptions): void {
  requireText(options.label, "label");
  if (options.icon !== undefined) requireText(options.icon, "icon");
  if (options.compact !== undefined && typeof options.compact !== "boolean") throw new Error("compact must be boolean.");
  if (options.id !== undefined) requireText(options.id, "id");
  if (options.variant !== undefined && !["default", "primary", "danger", "quiet", "secondary", "tertiary", "ghost", "destructive"].includes(options.variant)) {
    throw new Error("variant must be default, primary, danger, quiet, secondary, tertiary, ghost or destructive.");
  }
  validateState(options.state ?? "default", options.stateLabel);
  validateDisabled(options.disabled ?? false, options.disabledReason);
}
