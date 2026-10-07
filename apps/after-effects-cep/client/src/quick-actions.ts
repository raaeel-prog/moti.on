import { button, createElement } from "@motion/ui-core";

/** Order and abbreviations retained from the user's FX Studio Quick Tools. */
export const QUICK_ACTIONS = [
  ["precompose", "PRE", "Pré-compor seleção", "Precompose selection"],
  ["center", "CTR", "Centralizar na composição", "Center in composition"],
  ["save-frame", "PNG", "Salvar frame em PNG", "Save frame as PNG"],
  ["freeze", "FRZ", "Congelar frame", "Freeze frame"],
  ["fit", "FIT", "Ajustar à composição", "Fit to composition"],
  ["dash-stroke", "DSH", "Contorno tracejado", "Dashed stroke"],
  ["create-adjustment", "ADJ", "Criar camada de ajuste", "Create adjustment layer"],
  ["mirror", "MIR", "Espelhar horizontalmente", "Mirror horizontally"],
  ["create-solid", "SOL", "Criar sólido", "Create solid"],
  ["create-shape", "SHA", "Criar forma retangular", "Create rectangle shape"],
  ["create-null", "NUL", "Criar objeto nulo", "Create null object"],
  ["create-camera", "CAM", "Criar câmera", "Create camera"],
  ["effect-hue", "HUE", "Matiz e saturação", "Hue and saturation"],
  ["effect-fill", "FILL", "Preenchimento", "Fill"],
  ["effect-tint", "TINT", "Tonalidade", "Tint"],
  ["effect-blur", "BLUR", "Desfoque", "Blur"],
  ["effect-lumetri", "LUM", "Lumetri Color", "Lumetri Color"],
  ["effect-curves", "CURV", "Curvas", "Curves"]
] as const;
export type QuickAction = typeof QUICK_ACTIONS[number][0];

export function quickActionName(action: QuickAction, locale: string): string {
  const item = QUICK_ACTIONS.find(item => item[0] === action)!;
  return item[locale === "pt-BR" ? 2 : 3];
}

export function createQuickActions(doc: Document, options: {
  locale: string;
  busy: boolean;
  hasComp: boolean;
  selectionCount: number;
  onAction(action: QuickAction): void;
}): HTMLElement {
  const pt = options.locale === "pt-BR";
  const pad = createElement(doc, "div", "ch-quick-actions");
  pad.setAttribute("role", "group");
  pad.setAttribute("aria-label", pt ? "Ações rápidas" : "Quick actions");
  for (const [action, abbreviation] of QUICK_ACTIONS) {
    const name = quickActionName(action, options.locale);
    const needsSelection = !action.startsWith("create-") && action !== "save-frame";
    const reason = options.busy ? (pt ? "Aguarde a ação atual." : "Wait for the current action.")
      : !options.hasComp ? (pt ? "Abra uma composição." : "Open a composition.")
        : needsSelection && !options.selectionCount ? (pt ? "Selecione uma camada." : "Select a layer.") : null;
    const control = button(doc, {
      label: abbreviation, disabled: Boolean(reason),
      onClick: () => { if (!control.disabled) options.onAction(action); }
    });
    control.id = `library-quick-${action}`;
    control.className += " ch-quick-action";
    if (["precompose", "center", "save-frame"].includes(action)) control.className += " ch-quick-action--main";
    control.title = reason ? `${name} · ${reason}` : name;
    control.setAttribute("aria-label", name);
    control.setAttribute("data-motion", "button-press");
    control.setAttribute("data-focus-key", control.id);
    pad.appendChild(control);
  }
  return pad;
}

/** Refresh availability without replacing focused buttons or their event handlers. */
export function updateQuickActions(pad: HTMLElement, options: { locale: string; busy: boolean; hasComp: boolean; selectionCount: number }): void {
  const pt = options.locale === "pt-BR";
  for (const [action] of QUICK_ACTIONS) {
    const control = Array.from(pad.getElementsByTagName("button")).find(node => node.id === `library-quick-${action}`);
    if (!control) continue;
    const name = quickActionName(action, options.locale);
    const needsSelection = !action.startsWith("create-") && action !== "save-frame";
    const reason = options.busy ? (pt ? "Aguarde a ação atual." : "Wait for the current action.")
      : !options.hasComp ? (pt ? "Abra uma composição." : "Open a composition.")
      : needsSelection && !options.selectionCount ? (pt ? "Selecione uma camada." : "Select a layer.") : null;
    control.disabled = Boolean(reason);
    control.setAttribute("aria-disabled", String(Boolean(reason)));
    control.title = reason ? `${name} · ${reason}` : name;
  }
}
