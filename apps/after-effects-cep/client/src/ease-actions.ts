import { createActionButton, clearNode, createElement, type I18n, type MessageKey } from "@motion/ui-core";

export interface EaseAction {
  id: "clone" | "reverse" | "reverse-values" | "duplicate-reverse" | "duplicate-reverse-start" | "duplicate-reverse-end";
  command: "ae.keys.clone" | "ae.keys.reverse" | "ae.keys.reverse-values";
  args: Readonly<Record<string, string>>;
  labelKey: MessageKey;
  hintKey: MessageKey;
}

/** Each button is one command, so copying to an edge remains one Undo step. */
export const EASE_ACTIONS: readonly EaseAction[] = [
  { id: "clone", command: "ae.keys.clone", args: { mode: "repeat", destination: "cti" }, labelKey: "ease.actions.clone", hintKey: "ease.actions.cloneHint" },
  { id: "reverse", command: "ae.keys.reverse", args: {}, labelKey: "ease.actions.reverse", hintKey: "ease.actions.reverseHint" },
  { id: "reverse-values", command: "ae.keys.reverse-values", args: {}, labelKey: "ease.actions.reverseValues", hintKey: "ease.actions.reverseValuesHint" },
  { id: "duplicate-reverse", command: "ae.keys.clone", args: { mode: "mirror", destination: "after-gap" }, labelKey: "ease.actions.duplicateReverse", hintKey: "ease.actions.duplicateReverseHint" },
  { id: "duplicate-reverse-start", command: "ae.keys.clone", args: { mode: "mirror", destination: "layer-start" }, labelKey: "ease.actions.duplicateReverseStart", hintKey: "ease.actions.duplicateReverseStartHint" },
  { id: "duplicate-reverse-end", command: "ae.keys.clone", args: { mode: "mirror", destination: "layer-end" }, labelKey: "ease.actions.duplicateReverseEnd", hintKey: "ease.actions.duplicateReverseEndHint" }
];

/** Original keyframe diagrams; outline = source, solid = result. */
function actionIcon(doc: Document, action: EaseAction): SVGSVGElement {
  const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 76 28");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  const path = (d: string, className: string): void => {
    const node = doc.createElementNS("http://www.w3.org/2000/svg", "path");
    node.setAttribute("d", d); node.setAttribute("class", className); svg.appendChild(node);
  };
  const key = (x: number, eased: boolean, result: boolean): void => {
    path(eased ? `M${x - 4} 9H${x + 4}L${x + 2} 14L${x + 4} 19H${x - 4}L${x - 2} 14Z` : `M${x} 9L${x + 5} 14L${x} 19L${x - 5} 14Z`,
      result ? "ch-ease-action__result" : "ch-ease-action__source");
  };
  const start = action.id.endsWith("start"), end = action.id.endsWith("end");
  if (action.id === "reverse" || action.id === "reverse-values") {
    key(18, false, false); key(32, true, false); key(48, true, true); key(62, false, true);
    path(action.id === "reverse" ? "M19 24H61M19 24L23 21M61 24L57 21" : "M18 3H32M18 3L21 1M32 3L29 1M48 25H62M48 25L51 27M62 25L59 27", "ch-ease-action__direction");
  } else {
    const source = start ? [48, 62] : [14, 28];
    const result = start ? [14, 28] : [48, 62];
    key(source[0]!, false, false); key(source[1]!, true, false);
    key(result[0]!, action.id !== "clone", true); key(result[1]!, action.id === "clone", true);
    if (start || end) path(start ? "M5 6V22H34" : "M71 6V22H42", "ch-ease-action__boundary");
    else path("M35 14H41M38 11L41 14L38 17", "ch-ease-action__direction");
  }
  return svg;
}

export function createEaseActions(doc: Document, options: {
  i18n: I18n;
  disabledReason: string | null;
  onAction(action: EaseAction): void;
}): { element: HTMLElement; update(disabledReason: string | null): void; dispose(): void } {
  const t = options.i18n.t;
  let currentDisabledReason = options.disabledReason;
  let alive = true;
  let hoverTimer: ReturnType<typeof setTimeout> | undefined;
  let tooltipOwner: { action: EaseAction; control: HTMLButtonElement } | null = null;
  const element = createElement(doc, "section", "ch-ease-actions");
  element.setAttribute("aria-label", t("ease.actions.title"));
  const primary = createElement(doc, "div", "ch-ease-actions__primary");
  const status = createElement(doc, "p", "ch-hint ch-ease-actions__status");
  status.setAttribute("role", "status");
  // CEP does not reliably display the browser's native title tooltip.
  const tooltip = createElement(doc, "div", "ch-quick-tooltip ch-ease-action-tooltip");
  tooltip.id = "ease-action-tooltip";
  tooltip.setAttribute("role", "tooltip");
  tooltip.setAttribute("data-motion", "tooltip-enter");
  tooltip.hidden = true;

  function hideTooltip(): void {
    clearTimeout(hoverTimer);
    tooltipOwner?.control.removeAttribute("aria-describedby");
    tooltipOwner = null;
    tooltip.hidden = true;
    tooltip.removeAttribute("data-open");
    tooltip.setAttribute("aria-hidden", "true");
  }
  function refreshTooltip(): void {
    if (!tooltipOwner) return;
    const { action, control } = tooltipOwner;
    clearNode(tooltip);
    tooltip.appendChild(createElement(doc, "strong", "", t(action.labelKey)));
    tooltip.appendChild(createElement(doc, "span", "", t(action.hintKey)));
    if (currentDisabledReason) tooltip.appendChild(createElement(doc, "span", "", currentDisabledReason));
    tooltip.hidden = false;
    tooltip.removeAttribute("aria-hidden");
    control.setAttribute("aria-describedby", tooltip.id);
    const rect = control.getBoundingClientRect();
    const viewportWidth = doc.documentElement.clientWidth;
    const viewportHeight = doc.documentElement.clientHeight;
    const left = Math.max(8, Math.min(rect.left + (rect.width - tooltip.offsetWidth) / 2, viewportWidth - tooltip.offsetWidth - 8));
    const below = rect.bottom + 6;
    const top = below + tooltip.offsetHeight <= viewportHeight - 8 ? below : Math.max(8, rect.top - tooltip.offsetHeight - 6);
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
    tooltip.style.transformOrigin = `${Math.max(0, rect.left + rect.width / 2 - left)}px ${top >= rect.bottom ? "top" : "bottom"}`;
    void tooltip.offsetWidth;
    tooltip.setAttribute("data-open", "true");
  }
  function showTooltip(action: EaseAction, control: HTMLButtonElement, immediate = false): void {
    hideTooltip();
    const show = (): void => {
      if (!alive) return;
      tooltipOwner = { action, control };
      refreshTooltip();
    };
    if (immediate) show();
    else hoverTimer = setTimeout(show, 180);
  }
  const controls: { action: EaseAction; control: HTMLButtonElement }[] = [];
  for (const action of EASE_ACTIONS) {
    const actionButton = createActionButton(doc, { id: `ease-action-${action.id}`, label: t(action.labelKey), compact: true, onPress: () => {
      if (!alive) return;
      if (currentDisabledReason !== null) { showTooltip(action, control, true); return; }
      hideTooltip();
      options.onAction(action);
    } });
    const control = actionButton.button;
    actionButton.element.classList.add("ch-ease-action-control");
    control.classList.add("ch-ease-action");
    control.setAttribute("data-ease-action", action.id);
    control.setAttribute("aria-label", t(action.labelKey));
    control.appendChild(actionIcon(doc, action));
    control.addEventListener("mouseenter", () => showTooltip(action, control));
    control.addEventListener("focus", () => showTooltip(action, control, true));
    control.addEventListener("mouseleave", hideTooltip);
    control.addEventListener("blur", hideTooltip);
    primary.appendChild(actionButton.element);
    controls.push({ action, control });
  }
  element.appendChild(primary); element.appendChild(status); element.appendChild(tooltip);
  element.addEventListener("keydown", event => {
    if ((event as KeyboardEvent).key === "Escape") hideTooltip();
  });
  doc.addEventListener("scroll", hideTooltip, true);
  doc.defaultView?.addEventListener("resize", hideTooltip);
  function update(disabledReason: string | null): void {
    if (!alive) return;
    currentDisabledReason = disabledReason;
    for (const { action, control } of controls) {
      // Keep unavailable actions focusable so their names and reasons remain discoverable.
      control.setAttribute("aria-disabled", String(disabledReason !== null));
      control.setAttribute("aria-label", t(action.labelKey));
      control.removeAttribute("title");
    }
    status.textContent = disabledReason ?? "";
    status.hidden = disabledReason === null;
    refreshTooltip();
  }
  update(options.disabledReason);
  return { element, update, dispose() {
    alive = false;
    hideTooltip();
    doc.removeEventListener("scroll", hideTooltip, true);
    doc.defaultView?.removeEventListener("resize", hideTooltip);
  } };
}
