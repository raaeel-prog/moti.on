import { button, createActionButton, clearNode, createElement, type I18n, type MessageKey } from "@motion/ui-core";

export interface EaseAction {
  id: "clone" | "reverse" | "reverse-values" | "duplicate-reverse" | "duplicate-reverse-start" | "duplicate-reverse-end" | "align-first" | "align-last" | "copy-ease" | "paste-ease" | "paste-value";
  command: "ae.keys.clone" | "ae.keys.reverse" | "ae.keys.reverse-values" | "ae.keys.send-to-edge" | "ae.keys.ease-copy" | "ae.keys.ease-paste";
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
  { id: "duplicate-reverse-end", command: "ae.keys.clone", args: { mode: "mirror", destination: "layer-end" }, labelKey: "ease.actions.duplicateReverseEnd", hintKey: "ease.actions.duplicateReverseEndHint" },
  // Copy / Paste Easing / Paste Value (Animation Composer): the ease travels as a
  // multiple of each segment's average speed, so the curve keeps its shape.
  { id: "copy-ease", command: "ae.keys.ease-copy", args: {}, labelKey: "ease.actions.copyEase", hintKey: "ease.actions.copyEaseHint" },
  { id: "paste-ease", command: "ae.keys.ease-paste", args: { target: "ease" }, labelKey: "ease.actions.pasteEase", hintKey: "ease.actions.pasteEaseHint" },
  { id: "paste-value", command: "ae.keys.ease-paste", args: { target: "value" }, labelKey: "ease.actions.pasteValue", hintKey: "ease.actions.pasteValueHint" },
  // Align First/Last (Animation Composer): the selected group keeps its spacing.
  { id: "align-first", command: "ae.keys.send-to-edge", args: { edge: "start", reference: "playhead" }, labelKey: "ease.actions.alignFirst", hintKey: "ease.actions.alignFirstHint" },
  { id: "align-last", command: "ae.keys.send-to-edge", args: { edge: "end", reference: "playhead" }, labelKey: "ease.actions.alignLast", hintKey: "ease.actions.alignLastHint" }
];

/**
 * Three families, one toolbar (compact review 2026-10-24): Duplicar · Inverter · Espelhar.
 * Each button carries a pictogram that acts out its operation when hovered or focused —
 * the result keyframes travel from where they come from (ae-motion.css `ch-ae-op-*`).
 */
type ActionGroup = "duplicate" | "reverse" | "mirror" | "transfer" | "align";
/** Families on the second row: the first keeps its six buttons at 280 px. */
const SECOND_ROW: ReadonlySet<ActionGroup> = new Set<ActionGroup>(["transfer", "align"]);
const ACTION_GROUP: Readonly<Record<EaseAction["id"], ActionGroup>> = {
  clone: "duplicate", reverse: "reverse", "reverse-values": "reverse",
  "duplicate-reverse": "mirror", "duplicate-reverse-start": "mirror", "duplicate-reverse-end": "mirror",
  "align-first": "align", "align-last": "align",
  "copy-ease": "transfer", "paste-ease": "transfer", "paste-value": "transfer"
};
/**
 * Each family is captioned with its verb and each button names what it acts on or where the
 * result lands, so the row reads as "Inverter · Tempo", "Cópia invertida · No fim" (layout
 * review 2026-10-31: six bare pictograms were hard to tell apart). The tooltip keeps the full name.
 */
const GROUP_CAPTION: Readonly<Record<ActionGroup, readonly [pt: string, en: string]>> = {
  duplicate: ["Duplicar", "Duplicate"], reverse: ["Inverter", "Reverse"], mirror: ["Cópia invertida", "Reversed copy"],
  transfer: ["Copiar e colar", "Copy and paste"],
  align: ["Alinhar ao cursor", "Align to playhead"]
};
const SHORT_LABEL: Readonly<Record<EaseAction["id"], readonly [pt: string, en: string]>> = {
  clone: ["No cursor", "At playhead"], reverse: ["Tempo", "Time"], "reverse-values": ["Valores", "Values"],
  "duplicate-reverse": ["Depois", "After"], "duplicate-reverse-start": ["No início", "At start"], "duplicate-reverse-end": ["No fim", "At end"],
  "align-first": ["Início", "First"], "align-last": ["Fim", "Last"],
  "copy-ease": ["Copiar", "Copy"], "paste-ease": ["Ease", "Ease"], "paste-value": ["Valor", "Value"]
};

const SVG_NS = "http://www.w3.org/2000/svg";
/** A keyframe diamond centred on (x, y). */
const diamond = (x: number, y: number, r = 2.8): string => `M${x} ${y - r}L${x + r} ${y}L${x} ${y + r}L${x - r} ${y}Z`;
/** Playhead: the time indicator's line with its head on top. */
const playhead = (x: number): string => `M${x} 4.5V15M${x - 2} 1h4v2l-2 2-2-2z`;
/** Clipboard: where a copied ease or value comes from. */
const CLIPBOARD = "M2 3.5h7.5v10.5H2zM4.25 2h3v3h-3z";

/**
 * 24 × 16 pictograms on the pixel grid (revisão 2026-11-16: os losangos de 2 px não se liam).
 * Um vocabulário só: contorno = keyframes de origem, sólido = resultado, linha com cabeça = cursor de
 * tempo, colchete = borda da camada. Tempo é o eixo horizontal, valor o vertical.
 * `--op-x/--op-y` is where the result starts its move.
 */
function actionIcon(doc: Document, action: EaseAction): SVGSVGElement {
  const svg = doc.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 16");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("class", "ch-ease-action__icon");
  const path = (parent: Element, d: string, className: string): void => {
    const node = doc.createElementNS(SVG_NS, "path");
    node.setAttribute("d", d); node.setAttribute("class", className); parent.appendChild(node);
  };
  const result = (dx: number, dy: number): Element => {
    const group = doc.createElementNS(SVG_NS, "g");
    group.setAttribute("class", "ch-ease-action__moving");
    // Pelo CSSOM: a CSP do painel (style-src 'self') descarta o atributo style, e o resultado ficava sem ponto de partida.
    const style = (group as unknown as { style?: { setProperty?(name: string, value: string): void } }).style;
    style?.setProperty?.("--op-x", `${dx}px`);
    style?.setProperty?.("--op-y", `${dy}px`);
    group.setAttribute("data-from", `${dx},${dy}`);
    svg.appendChild(group);
    return group;
  };
  // A small and a large keyframe show the order, so a reversed copy reads as reversed.
  const pair = (a: number, b: number, smallFirst: boolean, y = 9): string => smallFirst ? diamond(a, y, 1.9) + diamond(b, y, 2.9) : diamond(a, y, 2.9) + diamond(b, y, 1.9);
  switch (action.id) {
    case "clone": {
      path(svg, diamond(4.5, 9, 3), "ch-ease-action__source");
      path(svg, playhead(12), "ch-ease-action__guide ch-ease-action__guide--head");
      path(result(-13, 0), diamond(18.5, 9, 3), "ch-ease-action__result");
      break;
    }
    case "reverse": {
      // Seta dupla horizontal: os keyframes trocam de lugar no tempo.
      path(svg, "M7 3.5h10M9.5 1L7 3.5 9.5 6M14.5 1L17 3.5 14.5 6", "ch-ease-action__guide");
      path(svg, diamond(6, 11.5), "ch-ease-action__source");
      path(result(-12, 0), diamond(18, 11.5), "ch-ease-action__result");
      break;
    }
    case "reverse-values": {
      // Seta dupla vertical: os keyframes ficam onde estão e trocam de valor.
      path(svg, "M6.5 2v12M4 4.5L6.5 2 9 4.5M4 11.5L6.5 14 9 11.5", "ch-ease-action__guide");
      path(svg, diamond(16, 4.4, 2.7), "ch-ease-action__source");
      path(result(0, -7.2), diamond(16, 11.6, 2.7), "ch-ease-action__result");
      break;
    }
    case "duplicate-reverse": {
      // Quatro losangos em 24 px: um pouco menores que nos outros botões, para o par não encostar.
      path(svg, diamond(2.7, 9, 1.7) + diamond(8, 9, 2.7), "ch-ease-action__source");
      path(svg, "M12 1.5V15", "ch-ease-action__guide ch-ease-action__guide--dashed");
      path(result(-8, 0), diamond(16, 9, 2.7) + diamond(21.3, 9, 1.7), "ch-ease-action__result");
      break;
    }
    case "copy-ease": {
      path(svg, "M1.5 13C6.5 13 4.5 3 9.5 3", "ch-ease-action__source");
      path(svg, "M15.5 5V2.5h7V10h-2.5", "ch-ease-action__guide");
      path(result(-5, 0), "M12.5 5.5h7.5V13h-7.5z", "ch-ease-action__result");
      break;
    }
    case "paste-ease": {
      path(svg, CLIPBOARD, "ch-ease-action__source");
      path(result(-9, 0), "M12.5 13C18.5 13 16 3 22 3", "ch-ease-action__result ch-ease-action__result--line");
      break;
    }
    case "paste-value": {
      path(svg, CLIPBOARD, "ch-ease-action__source");
      path(result(-9, 0), diamond(17.5, 8.75, 3.4), "ch-ease-action__result");
      break;
    }
    case "align-first": {
      path(svg, playhead(6), "ch-ease-action__guide ch-ease-action__guide--head");
      path(svg, "M22.5 10h-5M19.5 7.5L17 10l2.5 2.5", "ch-ease-action__guide");
      path(result(7, 0), diamond(6, 10, 2.9) + diamond(12.5, 10, 1.9), "ch-ease-action__result");
      break;
    }
    case "align-last": {
      path(svg, playhead(18), "ch-ease-action__guide ch-ease-action__guide--head");
      path(svg, "M1.5 10h5M4.5 7.5L7 10l-2.5 2.5", "ch-ease-action__guide");
      path(result(-7, 0), diamond(11.5, 10, 1.9) + diamond(18, 10, 2.9), "ch-ease-action__result");
      break;
    }
    case "duplicate-reverse-start": {
      // Colchete = início da camada; a cópia invertida encosta nele.
      path(svg, "M4 2H1.5v12H4", "ch-ease-action__guide");
      path(svg, diamond(20.5, 8, 2.2), "ch-ease-action__source");
      path(result(9, 0), pair(8, 13.5, false, 8), "ch-ease-action__result");
      break;
    }
    default: {
      path(svg, "M20 2h2.5v12H20", "ch-ease-action__guide");
      path(svg, diamond(3.5, 8, 2.2), "ch-ease-action__source");
      path(result(-9, 0), pair(10.5, 16, true, 8), "ch-ease-action__result");
    }
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
  const english = options.i18n.locale().startsWith("en");
  const primary = createElement(doc, "div", "ch-ease-actions__primary");
  const secondary = createElement(doc, "div", "ch-ease-actions__primary ch-ease-actions__extra");
  const rows = createElement(doc, "div", "ch-ease-actions__rows");
  rows.id = "ease-keyframe-actions";
  rows.appendChild(primary);
  rows.appendChild(secondary);
  let expanded = false;
  const toggle = button(doc, { label: t("ease.actions.title"), onClick: () => setExpanded(!expanded) });
  toggle.id = "ease-keyframe-actions-toggle";
  toggle.classList.add("ch-ease-actions__toggle");
  toggle.setAttribute("aria-controls", rows.id);
  function setExpanded(value: boolean): void {
    expanded = value;
    toggle.setAttribute("aria-expanded", String(value));
    element.setAttribute("data-expanded", String(value));
    if (!value) hideTooltip();
  }
  // Read aloud, not printed: the reason already shows on the dimmed buttons and below, by Apply.
  const status = createElement(doc, "p", "ch-hint ch-ease-actions__status ch-visually-hidden");
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
  const groups = new Map<string, HTMLElement>();
  function groupRow(name: ActionGroup): HTMLElement {
    const existing = groups.get(name);
    if (existing) return existing;
    const group = createElement(doc, "div", "ch-ease-actions__group");
    group.setAttribute("data-group", name);
    group.setAttribute("role", "group");
    const caption = GROUP_CAPTION[name][english ? 1 : 0];
    group.setAttribute("aria-label", caption);
    group.appendChild(createElement(doc, "span", "ch-ease-actions__caption", caption));
    const row = createElement(doc, "div", "ch-ease-actions__buttons");
    group.appendChild(row);
    (SECOND_ROW.has(name) ? secondary : primary).appendChild(group);
    groups.set(name, row);
    return row;
  }
  for (const action of EASE_ACTIONS) {
    const actionButton = createActionButton(doc, { id: `ease-action-${action.id}`, label: t(action.labelKey), compact: true, onPress: () => {
      if (!alive) return;
      if (currentDisabledReason !== null) { showTooltip(action, control, true); return; }
      hideTooltip();
      options.onAction(action);
    } });
    const control = actionButton.button;
    actionButton.element.classList.add("ch-ease-action-control");
    actionButton.element.setAttribute("data-group", ACTION_GROUP[action.id]);
    control.classList.add("ch-ease-action");
    control.setAttribute("data-ease-action", action.id);
    control.setAttribute("aria-label", t(action.labelKey));
    control.appendChild(actionIcon(doc, action));
    control.appendChild(createElement(doc, "span", "ch-ease-action__label", SHORT_LABEL[action.id][english ? 1 : 0]));
    // The pictogram plays its operation once per hover or keyboard focus (CSS restarts it).
    const play = (): void => { control.setAttribute("data-play", "false"); void control.getBoundingClientRect?.(); control.setAttribute("data-play", "true"); };
    control.addEventListener("mouseenter", play);
    control.addEventListener("focus", play);
    control.addEventListener("mouseenter", () => showTooltip(action, control));
    control.addEventListener("focus", () => showTooltip(action, control, true));
    control.addEventListener("mouseleave", hideTooltip);
    control.addEventListener("blur", hideTooltip);
    groupRow(ACTION_GROUP[action.id]).appendChild(actionButton.element);
    controls.push({ action, control });
  }
  element.appendChild(toggle); element.appendChild(rows); element.appendChild(status); element.appendChild(tooltip);
  element.addEventListener("keydown", event => {
    if ((event as KeyboardEvent).key !== "Escape") return;
    hideTooltip();
    if (expanded && toggle.getClientRects?.().length) {
      setExpanded(false);
      toggle.focus();
      event.stopPropagation();
    }
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
  setExpanded(false);
  update(options.disabledReason);
  return { element, update, dispose() {
    alive = false;
    hideTooltip();
    doc.removeEventListener("scroll", hideTooltip, true);
    doc.defaultView?.removeEventListener("resize", hideTooltip);
  } };
}
