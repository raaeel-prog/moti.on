import { attachScrubbableNumber, button, createElement, selectField } from "@motion/ui-core";
import type { PresetTimingArgs } from "@motion/contracts";

export interface PresetTimingDraft {
  open: boolean;
  operation: PresetTimingArgs["operation"];
  phase: PresetTimingArgs["phase"];
  order: PresetTimingArgs["order"];
  frames: string;
  seed: string;
  message: string;
}
export function defaultPresetTimingDraft(): PresetTimingDraft {
  return { open: false, operation: "align", phase: "in", order: "forward", frames: "2", seed: "17", message: "" };
}
let sequence = 0;
/** A collapsed utility shared by single-layer Edit and multiple-layer selection. */
export function createPresetTimingControls(doc: Document, options: {
  locale: string;
  draft: PresetTimingDraft;
  busy: boolean;
  context?: () => { hasComp: boolean; selectionCount: number };
  blockedReason: () => string;
  onApply(args: PresetTimingArgs): void;
}): { element: HTMLElement; updateContext(): void; dispose():void } {
  const pt = options.locale === "pt-BR", draft = options.draft, id = `preset-timing-${++sequence}`;
  const element = doc.createElement("details"); element.className = "ch-preset-timing"; element.open = draft.open;
  element.appendChild(createElement(doc, "summary", "", pt ? "Organizar entrada e saída" : "Arrange entrances and exits"));
  element.addEventListener("toggle", () => { draft.open = element.open; });
  const body = createElement(doc, "div", "ch-preset-timing-body"); element.appendChild(body);
  function choice<K extends "operation" | "phase" | "order">(key: K, label: string, values: [PresetTimingDraft[K], string][]): HTMLElement {
    const field = selectField(doc, { id: `${id}-${key}`, label, value: draft[key], disabled: options.busy,
      options: values.map(([value, text]) => ({ value, label: text })), onChange: value => { draft[key] = value as PresetTimingDraft[K]; draft.message = ""; update(); } });
    field.getElementsByTagName("select")[0]?.setAttribute("aria-label", label); body.appendChild(field); return field;
  }
  choice("phase", pt ? "Marcador" : "Marker", [["in", pt ? "Fim da entrada" : "Entrance end"], ["out", pt ? "Início da saída" : "Exit start"]]);
  choice("operation", pt ? "Operação" : "Operation", [["align", pt ? "Alinhar ao cursor" : "Align to playhead"], ["stagger", pt ? "Escalonar a partir do cursor" : "Stagger from playhead"], ["shift", pt ? "Deslocar marcadores" : "Shift markers"], ["duration", pt ? "Definir duração da fase" : "Set phase duration"]]);
  const amount = createElement(doc, "label", "ch-preset-timing-amount"), amountLabel = createElement(doc, "span", ""); amount.appendChild(amountLabel);
  const input = doc.createElement("input"); input.type = "number"; input.min = "-600"; input.max = "600"; input.step = "1"; input.value = draft.frames; input.disabled = options.busy; amount.appendChild(input); body.appendChild(amount);
  input.addEventListener("input", () => { draft.frames = input.value; draft.message = ""; update(); });
  const order = choice("order", pt ? "Ordem das camadas" : "Layer order", [["forward", pt ? "De cima para baixo" : "Top to bottom"], ["reverse", pt ? "De baixo para cima" : "Bottom to top"], ["random", pt ? "Aleatória" : "Random"]]);
  const seedRow=createElement(doc,"label","ch-preset-timing-amount");seedRow.appendChild(createElement(doc,"span","",pt?"Variação":"Variation"));
  const seed=doc.createElement("input");seed.type="number";seed.min="0";seed.max="9999";seed.step="1";seed.value=draft.seed;seed.disabled=options.busy;seed.setAttribute("aria-label",pt?"Variação da ordem":"Order variation");seedRow.appendChild(seed);body.appendChild(seedRow);
  seed.addEventListener("input",()=>{draft.seed=seed.value;draft.message="";update();});
  const hint = createElement(doc, "p", "ch-preset-hint"); body.appendChild(hint);
  const status = createElement(doc, "p", "ch-preset-hint"); status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite"); body.appendChild(status);
  function reason(): string {
    if (options.busy) return pt ? "Aguarde a operação atual." : "Wait for the current operation.";
    const blocked = options.blockedReason(); if (blocked) return blocked;
    const context = options.context?.();
    if (context && !context.hasComp) return pt ? "Abra uma composição." : "Open a composition.";
    if (context && (context.selectionCount < 1 || context.selectionCount > 50)) return pt ? "Selecione de 1 a 50 camadas com marcadores Moti.on." : "Select 1 to 50 layers with Moti.on markers.";
    if(draft.operation==="stagger"&&draft.order==="random"&&(!draft.seed.trim()||!Number.isInteger(Number(draft.seed))||Number(draft.seed)<0||Number(draft.seed)>9999))return pt?"Use uma variação inteira entre 0 e 9999.":"Enter a whole variation from 0 to 9999.";
    const value = Number(draft.frames);
    if(draft.operation==="duration"&&value<1)return pt?"Use uma duração de 1 a 600 frames.":"Enter a duration from 1 to 600 frames.";
    if (draft.operation !== "align" && (!draft.frames.trim() || !Number.isInteger(value) || Math.abs(value) > 600)) return pt ? "Use um número inteiro entre -600 e 600 frames." : "Enter a whole number between -600 and 600 frames.";
    return "";
  }
  const apply = button(doc, { label: "", disabled: options.busy, onClick: () => {
    if (reason()) return;
    options.onApply({ operation: draft.operation, phase: draft.phase, frames: draft.operation === "align" ? 0 : Number(draft.frames), order: draft.order, ...(draft.order === "random" ? { seed: Number(draft.seed) } : {}) });
  } }); body.appendChild(apply);
  function update(): void {
    seedRow.hidden=draft.operation!=="stagger"||draft.order!=="random";
    seed.setAttribute("aria-invalid",String(!draft.seed.trim()||!Number.isInteger(Number(draft.seed))||Number(draft.seed)<0||Number(draft.seed)>9999));
    amount.hidden = draft.operation === "align"; order.hidden = draft.operation !== "stagger";
    input.min=draft.operation==="duration"?"1":"-600";
    const label = draft.operation === "duration" ? (pt ? "Duração da fase · frames" : "Phase duration · frames") : draft.operation === "stagger" ? (pt ? "Intervalo · frames" : "Step · frames") : (pt ? "Deslocamento · frames" : "Offset · frames");
    amountLabel.textContent = label; input.setAttribute("aria-label", label);
    hint.textContent = draft.operation==="duration"?(pt?"Define a duração da entrada ou da saída de cada camada. A outra fase e os limites da camada são preservados.":"Sets the entrance or exit duration of each layer. The other phase and layer boundaries are preserved."):pt ? "Move apenas os marcadores Moti.on. Os limites das camadas e os outros keyframes ficam no lugar. Valores negativos antecipam o marcador." : "Moves only Moti.on markers. Layer boundaries and other keyframes stay in place. Negative values move markers earlier.";
    const blocked = reason(); apply.disabled = Boolean(blocked); apply.setAttribute("aria-disabled", String(apply.disabled)); apply.title = blocked;
    apply.textContent = draft.operation === "duration" ? (pt ? "Definir duração da fase" : "Set phase duration") : draft.operation === "align" ? (pt ? "Alinhar marcadores" : "Align markers") : draft.operation === "stagger" ? (pt ? "Escalonar marcadores" : "Stagger markers") : (pt ? "Deslocar marcadores" : "Shift markers");
    status.textContent = blocked || draft.message; status.hidden = !status.textContent;
    input.setAttribute("aria-invalid", String(draft.operation !== "align" && (!draft.frames.trim() || !Number.isInteger(Number(draft.frames)) || Math.abs(Number(draft.frames)) > 600 || (draft.operation==="duration"&&Number(draft.frames)<1))));
  }
  const helpText=pt?"Arraste para ajustar · Shift: precisão · Alt: rápido · Clique para digitar":"Drag to adjust · Shift: fine · Alt: fast · Click to type";
  const cleanups=[attachScrubbableNumber(input,{helpText}),attachScrubbableNumber(seed,{helpText})];
  update(); return { element, updateContext: update, dispose(){for(const cleanup of cleanups)cleanup();} };
}
