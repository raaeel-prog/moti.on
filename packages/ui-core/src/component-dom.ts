/** Primitivas DOM internas compartilhadas pelo kit e pelos Custom Elements. */

export const COMPONENT_STATES = Object.freeze([
  "default",
  "loading",
  "empty",
  "success",
  "warning",
  "error",
  "unsupported"
] as const);

export type ComponentState = (typeof COMPONENT_STATES)[number];

export interface ComponentStateOptions {
  state?: ComponentState;
  /** Obrigatorio em runtime quando `state` nao e `default`. */
  stateLabel?: string;
}

export interface DisableableOptions {
  disabled?: boolean;
  /** Obrigatorio em runtime quando `disabled` e verdadeiro. */
  disabledReason?: string;
}

export interface StatefulController {
  setState(state: ComponentState, stateLabel?: string): void;
}

export interface DisableableController {
  setDisabled(disabled: boolean, disabledReason?: string): void;
}

export type InteractiveOptions = ComponentStateOptions & DisableableOptions;

export type StateMarkers = Readonly<Record<Exclude<ComponentState, "default">, string>>;

export const STATE_MARKERS: StateMarkers = Object.freeze({
  loading: "…",
  empty: "—",
  success: "✓",
  warning: "▲",
  error: "!",
  unsupported: "—"
});

let generatedId = 0;

export function nextId(prefix: string): string {
  generatedId += 1;
  return `${prefix}-${generatedId}`;
}

export function requireText(value: string | undefined, name: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${name} must be a non-empty string.`);
  }
  return value;
}

export function resolveId(value: string | undefined, prefix: string): string {
  if (value === undefined) return nextId(prefix);
  return requireText(value, "id");
}

export function element<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = doc.createElement(tag);
  if (className !== undefined) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function removeAttribute(node: Element, name: string): void {
  node.removeAttribute(name);
}

/**
 * O atributo HTML `hidden` nao e consistente entre CEP e Premiere UXP. Manter
 * um estado de dados em paralelo oferece um fallback CSS explicito sem remover
 * o comportamento nativo dos runtimes que o implementam.
 */
export function setHidden(node: HTMLElement, hidden: boolean): void {
  node.hidden = hidden;
  node.setAttribute("data-hidden", hidden ? "true" : "false");
}

export function setDescriptionIds(node: Element, ids: readonly string[]): void {
  const value = ids.filter((id) => id.length > 0).join(" ");
  if (value.length > 0) node.setAttribute("aria-describedby", value);
  else removeAttribute(node, "aria-describedby");
}

export interface StateBinding {
  readonly node: HTMLElement;
  readonly markers: StateMarkers;
  state: ComponentState;
  label?: string;
}

export function validateState(state: ComponentState, stateLabel?: string): void {
  if (!COMPONENT_STATES.includes(state)) throw new Error("Invalid component state.");
  if (state !== "default") requireText(stateLabel, "stateLabel");
}

export function createStateBinding(
  doc: Document,
  owner: HTMLElement,
  ownerId: string,
  options: ComponentStateOptions,
  announce = true,
  markers: StateMarkers = STATE_MARKERS
): StateBinding {
  const state = options.state ?? "default";
  validateState(state, options.stateLabel);

  const node = element(doc, "span", "ch-component-state");
  node.id = `${ownerId}-state`;
  if (announce) {
    node.setAttribute("role", "status");
    node.setAttribute("aria-live", "polite");
  }
  owner.appendChild(node);

  const binding: StateBinding = { node, markers, state };
  if (options.stateLabel !== undefined) binding.label = options.stateLabel;
  applyState(owner, binding, state, options.stateLabel);
  return binding;
}

export function applyState(
  owner: HTMLElement,
  binding: StateBinding,
  state: ComponentState,
  stateLabel?: string
): void {
  validateState(state, stateLabel);
  binding.state = state;
  if (stateLabel === undefined) delete binding.label;
  else binding.label = stateLabel;
  owner.setAttribute("data-state", state);

  if (state === "default") {
    binding.node.textContent = "";
    setHidden(binding.node, true);
    binding.node.setAttribute("aria-hidden", "true");
    return;
  }

  setHidden(binding.node, false);
  removeAttribute(binding.node, "aria-hidden");
  binding.node.textContent = "";
  if (state === "loading") {
    binding.node.appendChild(createSpinner(owner.ownerDocument));
    binding.node.appendChild(element(owner.ownerDocument, "span", "ch-component-state__label", `${binding.markers[state]} ${requireText(stateLabel, "stateLabel")}`));
  } else {
    binding.node.textContent = `${binding.markers[state]} ${requireText(stateLabel, "stateLabel")}`;
  }
}

export interface DisabledBinding {
  readonly owner: HTMLElement;
  readonly node: HTMLElement;
  disabled: boolean;
  reason?: string;
}

export function validateDisabled(disabled: boolean, disabledReason?: string): void {
  if (disabled) requireText(disabledReason, "disabledReason");
}

export function createDisabledBinding(
  doc: Document,
  owner: HTMLElement,
  ownerId: string,
  options: DisableableOptions
): DisabledBinding {
  const disabled = options.disabled ?? false;
  validateDisabled(disabled, options.disabledReason);
  const node = element(doc, "span", "ch-disabled-reason");
  node.id = `${ownerId}-disabled-reason`;
  owner.appendChild(node);
  const binding: DisabledBinding = { owner, node, disabled };
  if (options.disabledReason !== undefined) binding.reason = options.disabledReason;
  updateDisabledReason(binding, disabled, options.disabledReason);
  return binding;
}

export function updateDisabledReason(
  binding: DisabledBinding,
  disabled: boolean,
  disabledReason?: string
): void {
  validateDisabled(disabled, disabledReason);
  binding.disabled = disabled;
  if (disabledReason === undefined) delete binding.reason;
  else binding.reason = disabledReason;
  binding.node.textContent = disabled ? requireText(disabledReason, "disabledReason") : "";
  setHidden(binding.node, !disabled);
  binding.node.setAttribute("aria-hidden", disabled ? "false" : "true");
  binding.owner.setAttribute("data-disabled-explanation", "closed");
}

export function bindDisabledExplanation(
  binding: DisabledBinding,
  targets: readonly HTMLElement[]
): void {
  for (const target of targets) {
    target.addEventListener("focus", () => {
      binding.owner.setAttribute(
        "data-disabled-explanation",
        binding.disabled ? "open" : "closed"
      );
    });
    target.addEventListener("blur", () => {
      binding.owner.setAttribute("data-disabled-explanation", "closed");
    });
  }
}

export function updateInteractiveDescriptions(
  target: HTMLElement,
  state: StateBinding,
  disabled: DisabledBinding,
  baseIds: readonly string[] = []
): void {
  const ids = [...baseIds];
  if (state.state !== "default") ids.push(state.node.id);
  if (disabled.disabled) ids.push(disabled.node.id);
  setDescriptionIds(target, ids);
}

export function isActivationKey(key: string): boolean {
  return key === "Enter" || key === " " || key === "Spacebar";
}

export function stateBlocksInteraction(state: ComponentState): boolean {
  return state === "loading" || state === "unsupported";
}


export function createSpinner(doc: Document): HTMLElement {
  return element(doc, "div", "ch-spinner");
}
