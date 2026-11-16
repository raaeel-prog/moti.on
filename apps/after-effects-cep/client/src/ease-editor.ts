import { button, createCurveEditor, createElement, searchField, type CurveEditorModel, type I18n } from "@motion/ui-core";
import { EASE_PRESETS, readEaseLibrary, writeEaseLibrary, validCurve, type EaseCurve } from "./ease-library.js";
import { DEFAULT_EASE, cloneEaseDraft, easeEffectiveCurve, type EaseDraft } from "./ease-args.js";
import { setUiIcon, uiIcon } from "./ui-icons.js";
import { openContextMenu } from "./context-menu.js";
import { swapText } from "./motion/swap.js";
import { browserMotionEnv } from "./motion/env.js";
import { createQuickStrip } from "./quick-strip.js";
import { createToolNumberFields } from "./tool-number-fields.js";

export interface EaseEditorOptions {
  i18n: I18n;
  draft: EaseDraft;
  busy: boolean;
  /** True on macOS: the add-point hint shows ⌘ instead of Ctrl. */
  platformMeta?: boolean;
  /** Called on every change, including mid-drag. Never applies to the host. */
  onChange(draft: EaseDraft): void;
  /** Called when a change is complete (release, field commit, mode switch…). Live apply hangs here. */
  onCommit(draft: EaseDraft): void;
  /** Explicit apply request (double-click on a preset). */
  onApply(): void;
  onLiveToggle(live: boolean): void;
  /** A gesture was cancelled (Escape / pointer cancel): the draft already reverted via onChange. */
  onCancel?(): void;
  /** The saved curves or favourites changed (the Timeline quick bar shows the favourites). */
  onLibraryChange?(): void;
  /** Composition frame rate for the frame ruler under the graph (defaults to 30). */
  fps?: number;
  /**
   * Floating-window layout: no library shelf, no numeric row; a row of quick
   * preset chips instead. The curve, mode, direction, view and live toggle stay.
   */
  compact?: boolean;
}

type CurveFilter = "all" | "fav" | "in" | "out" | "io";
export interface EaseEditorHandle { element: HTMLElement; setDraft(draft: EaseDraft): void; dispose(): void }

/** Presets offered as chips in the compact layout, by `EASE_PRESETS` id. */
const QUICK_PRESETS: { id: string; labelKey: "ease.preset.in" | "ease.preset.out" | "ease.preset.inOut" | "ease.preset.linear" | "ease.preset.ease" }[] = [
  { id: "ease", labelKey: "ease.preset.ease" }, { id: "cubic-in", labelKey: "ease.preset.in" },
  { id: "cubic-out", labelKey: "ease.preset.out" }, { id: "cubic-in-out", labelKey: "ease.preset.inOut" }, { id: "linear", labelKey: "ease.preset.linear" }
];

function modelOf(draft: EaseDraft): CurveEditorModel {
  return {
    mode: draft.mode, direction: draft.direction, view: draft.view,
    curve: { x1: draft.x1, y1: draft.y1, x2: draft.x2, y2: draft.y2 },
    points: draft.points.map(p => ({ ...p })),
    back: { ...draft.back },
    elastic: { in: { ...draft.elastic.in }, out: { ...draft.elastic.out }, inCurve: draft.elastic.inCurve ? { ...draft.elastic.inCurve } : null, outCurve: draft.elastic.outCurve ? { ...draft.elastic.outCurve } : null },
    bounce: { in: { ...draft.bounce.in }, out: { ...draft.bounce.out }, inCurve: draft.bounce.inCurve ? { ...draft.bounce.inCurve } : null, outCurve: draft.bounce.outCurve ? { ...draft.bounce.outCurve } : null }
  };
}

function mergeModel(draft: EaseDraft, model: CurveEditorModel): EaseDraft {
  return {
    ...cloneEaseDraft(draft),
    mode: model.mode, direction: model.direction, view: model.view,
    x1: model.curve.x1, y1: model.curve.y1, x2: model.curve.x2, y2: model.curve.y2,
    points: model.points.map(p => ({ ...p })),
    back: { ...model.back },
    elastic: { in: { ...model.elastic.in }, out: { ...model.elastic.out }, inCurve: model.elastic.inCurve ? { ...model.elastic.inCurve } : null, outCurve: model.elastic.outCurve ? { ...model.elastic.outCurve } : null },
    bounce: { in: { ...model.bounce.in }, out: { ...model.bounce.out }, inCurve: model.bounce.inCurve ? { ...model.bounce.inCurve } : null, outCurve: model.bounce.outCurve ? { ...model.bounce.outCurve } : null }
  };
}

const sameCurve = (a: EaseCurve, b: EaseCurve): boolean => a.x1 === b.x1 && a.y1 === b.y1 && a.x2 === b.x2 && a.y2 === b.y2;

export function createEaseEditor(doc: Document, options: EaseEditorOptions): EaseEditorHandle {
  const t = options.i18n.t;
  let draft = cloneEaseDraft(options.draft);
  let storage: Storage | undefined;
  try { storage = doc.defaultView?.localStorage; } catch { /* storage is optional */ }
  let library = readEaseLibrary(storage);
  /** Filtro da biblioteca (estudo): todas, favoritas ou pela família de entrada/saída. */
  let filter = "all" as CurveFilter;
  let query = "";
  let alive = true;
  let raf = 0;
  const win = doc.defaultView;
  const root = createElement(doc, "div", "ch-ease-editor");
  root.setAttribute("data-ease-mode", draft.mode);
  if (options.compact) root.setAttribute("data-compact", "true");
  const columns = createElement(doc, "div", "ch-ease-columns"); root.appendChild(columns);
  const editor = createElement(doc, "div", "ch-ease-main"); columns.appendChild(editor);
  // The curve's name opens the curve editor's own header row (one row instead of two).
  const curveName = createElement(doc, "span", "ch-ease-curve-name");
  /** Preset whose star was just turned on: its new star pops once after the redraw. */
  let poppedStar: string | null = null;
  const numeric: HTMLInputElement[] = [];
  const selectedButtons: { element: HTMLButtonElement; curve: EaseCurve }[] = [];

  const presetCurve = (): EaseCurve | null => draft.mode === "bezier" && draft.points.length === 0 ? { x1: draft.x1, y1: draft.y1, x2: draft.x2, y2: draft.y2 } : null;
  function updateCurveName(): void {
    const current = presetCurve();
    const selected = current ? [...EASE_PRESETS, ...library.custom].find(p => sameCurve(p.curve, current)) : undefined;
    // The name slides in when it changes (text-swap); the same name keeps its node.
    swapText(doc, curveName, selected?.name ?? (draft.mode === "bezier" ? t("ease.customCurve") : t(`ease.mode.${draft.mode}`)));
  }

  // Live toggle lives in the curve editor header, at the far right: a broadcast icon, not a "((•))" glyph.
  const live = button(doc, { label: "", title: draft.live ? t("ease.liveOn") : t("ease.liveOff"), onClick: () => {
    draft.live = !draft.live;
    live.setAttribute("aria-pressed", String(draft.live));
    live.title = draft.live ? t("ease.liveOn") : t("ease.liveOff");
    options.onLiveToggle(draft.live);
  } });
  live.classList.add("ch-ease-live");
  live.setAttribute("aria-label", t("ease.live"));
  live.setAttribute("aria-pressed", String(draft.live));
  setUiIcon(live, "live", "((•))");
  // v6: a velocidade aparece como área atrás da curva; este botão a esconde ou mostra.
  const en = options.i18n.locale().startsWith("en");
  let speedArea = true;
  const speedToggle = button(doc, { label: "", onClick: () => {
    speedArea = !speedArea;
    speedToggle.setAttribute("aria-pressed", String(speedArea));
    curve.setSpeedArea(speedArea);
  } });
  speedToggle.classList.add("ch-ease-speed-toggle");
  speedToggle.setAttribute("aria-pressed", "true");
  speedToggle.setAttribute("aria-label", en ? "Show speed" : "Mostrar velocidade");
  speedToggle.title = en ? "Speed behind the value curve" : "Velocidade atrás da curva de valor";
  setUiIcon(speedToggle, "speed", "Λ");
  const headerEnd = createElement(doc, "span", "ch-ease-header-tools");
  headerEnd.appendChild(speedToggle); headerEnd.appendChild(live);

  const curve = createCurveEditor(doc, {
    model: modelOf(draft),
    resetCurve: easeEffectiveCurve(DEFAULT_EASE),
    headerStart: curveName,
    headerEnd,
    motionCues: true,
    cueFrames: 24,
    cueFps: options.fps && options.fps > 0 ? options.fps : 30,
    labels: {
      graph: t("tool.ease.name"), modeMenu: t("ease.mode"),
      modes: { bezier: t("ease.mode.bezier"), back: t("ease.mode.back"), elastic: t("ease.mode.elastic"), bounce: t("ease.mode.bounce") },
      directions: { in: t("ease.direction.in"), out: t("ease.direction.out"), inOut: t("ease.direction.inOut") },
      directionGroup: t("ease.direction"), speedView: t("ease.view.speed"), valueView: t("ease.view.value"), reset: t("ease.reset"),
      addPointHint: options.platformMeta === false ? t("ease.addPointHintCtrl") : t("ease.addPointHint"),
      outHandle: t("ease.curve.outHandle"), inHandle: t("ease.curve.inHandle"),
      point: t("ease.point"), pointIn: t("ease.pointIn"), pointOut: t("ease.pointOut"),
      speedLeft: t("ease.speedLeft"), speedRight: t("ease.speedRight"), peak: t("ease.peak"),
      smoothing: t("ease.smoothing"), speedHint: t("ease.speedHint"),
      pointAdded: t("ease.pointAdded"), pointRemoved: t("ease.pointRemoved"), pointRefused: t("ease.pointRefused"),
      amp: t("ease.amp"), freq: t("ease.freq"), decay: t("ease.decay"), start: t("ease.param.start"), overshoot: t("ease.overshoot"),
      inHalf: t("ease.inHalf"), outHalf: t("ease.outHalf"),
      cueTime: en ? "time" : "tempo", cueValue: en ? "value" : "valor", cueSpeed: en ? "speed" : "velocidade", cuePeak: en ? "peak" : "pico",
      cueReplay: en ? "Replay the preview" : "Repetir a prévia", cueFrames: en ? "f" : "q",
      influenceOut: en ? "Out" : "Saída", influenceIn: en ? "In" : "Entrada", cueOvershoot: en ? "overshoot" : "excesso", cueDecimal: en ? "." : ","
    },
    onInput: model => { draft = mergeModel(draft, model); options.onChange(draft); refreshSidebar(false); },
    onCommit: model => { draft = mergeModel(draft, model); options.onChange(draft); refreshSidebar(true); options.onCommit(draft); },
    onCancel: () => { refreshSidebar(true); options.onCancel?.(); }
  });
  editor.appendChild(curve.element);
  const compactHint = createElement(doc, "p", "ch-ease-compact-hint",
    en ? "For precise adjustments, use the fields below." : "Para ajustes precisos, use os campos abaixo.");
  if (!options.compact) editor.appendChild(compactHint);
  const chips = createElement(doc, "div", "ch-ease-quick-presets");
  chips.setAttribute("role", "group"); chips.setAttribute("aria-label", t("ease.presets"));
  chips.hidden = !options.compact;
  editor.appendChild(chips);

  // v6: abaixo do gráfico, a influência em % (Saída e Entrada) com o controle deslizante sempre à vista,
  // Easy Ease em um clique e o cubic-bezier para copiar. As quatro coordenadas seguem em "Avançado".
  const influenceNumbers = createToolNumberFields();
  const influence = createElement(doc, "div", "ch-ease-influence");
  influence.setAttribute("role", "group"); influence.setAttribute("aria-label", en ? "Influence" : "Influência");
  influence.appendChild(createElement(doc, "h3", "ch-ease-influence__title", en ? "Influence" : "Influência"));
  const easy = createElement(doc, "div", "ch-ease-easy");
  easy.appendChild(createElement(doc, "span", "ch-ease-easy__label", "Easy Ease"));
  const easySegment = createElement(doc, "div", "ch-ease-easy__segment");
  easySegment.setAttribute("role", "group"); easySegment.setAttribute("aria-label", en ? "Easy Ease by influence" : "Easy Ease por influência");
  const easyButtons: { element: HTMLButtonElement; percent: number }[] = [];
  for (const amount of [33, 50, 66, 75, 100]) {
    const option = button(doc, { label: String(amount), onClick: () => update({ mode: "bezier", points: [], x1: amount / 100, y1: 0, x2: 1 - amount / 100, y2: 1 }, undefined, true) });
    option.id = `ease-easy-${amount}`;
    option.classList.add("ch-ease-easy__option");
    option.title = `Easy Ease ${amount}%`;
    option.setAttribute("aria-pressed", "false");
    easyButtons.push({ element: option, percent: amount });
    easySegment.appendChild(option);
  }
  easy.appendChild(easySegment);
  influence.appendChild(easy);
  let syncingInfluence = false;
  /** Arrasto ou digitação em andamento: só redesenha; o commit vem no fim (soltar, Enter, sair do campo). */
  function previewInfluence(next: Partial<EaseDraft>): void {
    draft = { ...cloneEaseDraft(draft), ...next };
    curve.setModel(modelOf(draft), { silent: true });
    options.onChange(draft);
    refreshSidebar(false);
  }
  const influenceField = (id: string, label: string, value: number, defaultValue: number, toDraft: (percent: number) => Partial<EaseDraft>): HTMLInputElement | undefined => {
    const field = influenceNumbers.field(doc, { id, label, value, defaultValue, min: 0, max: 100, step: 1, unit: "%", expanded: true,
      onInput: percent => { if (!syncingInfluence) previewInfluence(toDraft(percent)); },
      onCommit: percent => { if (!syncingInfluence) update(toDraft(percent)); } });
    field.classList.add("ch-ease-influence__row");
    influence.appendChild(field);
    return field.getElementsByTagName("input")[0];
  };
  const percent = (value: number): number => Math.max(0, Math.min(100, Math.round(value * 100)));
  const outInput = influenceField("ease-influence-out", en ? "Out" : "Saída", percent(draft.x1), percent(DEFAULT_EASE.x1), value => ({ x1: value / 100 }));
  const inInput = influenceField("ease-influence-in", en ? "In" : "Entrada", percent(1 - draft.x2), percent(1 - DEFAULT_EASE.x2), value => ({ x2: 1 - value / 100 }));
  const bezierRow = createElement(doc, "div", "ch-ease-bezier");
  bezierRow.appendChild(createElement(doc, "span", "ch-ease-bezier__label", "cubic-bezier"));
  const bezierValue = createElement(doc, "code", "ch-ease-bezier__value");
  bezierRow.appendChild(bezierValue);
  const bezierText = (): string => `cubic-bezier(${[draft.x1, draft.y1, draft.x2, draft.y2].map(v => String(Math.round(v * 100) / 100)).join(", ")})`;
  const copyBezier = button(doc, { label: "", onClick: () => {
    const text = bezierText();
    const fallback = (): void => {
      const area = doc.createElement("textarea"); area.value = text; doc.body.appendChild(area); area.select();
      try { doc.execCommand("copy"); } catch { /* the text stays selected for a manual copy */ }
      doc.body.removeChild(area);
    };
    const clip = doc.defaultView?.navigator?.clipboard;
    if (clip?.writeText) clip.writeText(text).catch(fallback); else fallback();
    copyBezier.setAttribute("data-copied", "true");
    setTimeout(() => copyBezier.removeAttribute("data-copied"), 1200);
  } });
  copyBezier.id = "ease-copy-bezier";
  copyBezier.classList.add("ch-ease-bezier__copy");
  copyBezier.setAttribute("aria-label", en ? "Copy cubic-bezier" : "Copiar cubic-bezier"); copyBezier.title = copyBezier.getAttribute("aria-label")!;
  setUiIcon(copyBezier, "copy", "⧉");
  bezierRow.appendChild(copyBezier);
  influence.appendChild(bezierRow);
  editor.appendChild(influence);
  function syncExtras(): void {
    bezierValue.textContent = [draft.x1, draft.y1, draft.x2, draft.y2].map(v => String(Math.round(v * 100) / 100).replace(".", en ? "." : ",")).join(en ? ", " : "; ");
    const flat = draft.mode === "bezier" && !draft.points.length && draft.y1 === 0 && draft.y2 === 1 && Math.abs(draft.x1 + draft.x2 - 1) < 0.006;
    for (const { element, percent: amount } of easyButtons) element.setAttribute("aria-pressed", String(flat && Math.abs(draft.x1 * 100 - amount) < 0.6));
  }
  /** Leva o rascunho para os campos sem disparar commit (o campo também precisa saber o novo valor). */
  function syncInfluence(): void {
    syncingInfluence = true;
    for (const [input, value] of [[outInput, percent(draft.x1)], [inInput, percent(1 - draft.x2)]] as const) {
      if (!input || doc.activeElement === input || input.value === String(value)) continue;
      input.value = String(value);
      if (typeof doc.createEvent === "function" && typeof input.dispatchEvent === "function") {
        for (const type of ["input", "change"]) { const event = doc.createEvent("Event"); event.initEvent(type, true, false); input.dispatchEvent(event); }
      }
    }
    syncingInfluence = false;
  }

  // "Avançado" recolhido: coordenadas exatas e as opções raras (Converter Hold entra aqui pelo main.ts).
  const advanced = createElement(doc, "div", "ch-ease-advanced");
  const advancedBody = createElement(doc, "div", "ch-ease-advanced__body");
  advancedBody.id = "ease-advanced"; advancedBody.hidden = true;
  const advancedToggle = button(doc, { label: en ? "Advanced" : "Avançado", onClick: () => {
    advancedBody.hidden = !advancedBody.hidden;
    advancedToggle.setAttribute("aria-expanded", String(!advancedBody.hidden));
  } });
  advancedToggle.classList.add("ch-ease-advanced__toggle");
  advancedToggle.setAttribute("aria-expanded", "false"); advancedToggle.setAttribute("aria-controls", advancedBody.id);
  advanced.appendChild(advancedToggle); advanced.appendChild(advancedBody);
  editor.appendChild(advanced);
  const values = createElement(doc, "div", "ch-ease-values"); advancedBody.appendChild(values);
  values.setAttribute("role", "group"); values.setAttribute("aria-label", t("ease.coordinates"));
  // Quadros do trecho que a régua desenha (só a prévia: não muda os keyframes).
  advancedBody.appendChild(influenceNumbers.field(doc, { id: "ease-preview-frames", label: en ? "Preview stretch" : "Trecho da prévia", value: 24, defaultValue: 24, min: 4, max: 120, step: 1, unit: en ? "f" : "q",
    onCommit: frames => curve.setCueTiming(frames, options.fps && options.fps > 0 ? options.fps : 30) }));
  const chipButtons: { element: HTMLButtonElement; curve: EaseCurve }[] = [];
  const bakeHint = createElement(doc, "p", "ch-hint", t("ease.bakeHint")); bakeHint.classList.add("ch-ease-bake-hint"); editor.appendChild(bakeHint);

  /** Numeric row and name follow the draft; `committedInput` keeps other drafts untouched. */
  function refreshSidebar(syncInputs: boolean, committedInput?: HTMLInputElement): void {
    root.setAttribute("data-ease-mode", draft.mode);
    values.hidden = draft.mode !== "bezier" || Boolean(options.compact);
    // Influência só descreve a curva simples de dois pontos; os outros modos têm controles próprios no gráfico.
    influence.hidden = draft.mode !== "bezier" || draft.points.length > 0 || Boolean(options.compact);
    advanced.hidden = Boolean(options.compact);
    // Saída e Entrada acompanham o arrasto das alças (o campo em edição fica como está).
    syncInfluence();
    syncExtras();
    bakeHint.hidden = !(draft.mode === "elastic" || draft.mode === "bounce") || Boolean(options.compact);
    if (syncInputs) {
      numeric.forEach((input, i) => {
        if (committedInput && input !== committedInput) return;
        input.value = String([draft.x1, draft.y1, draft.x2, draft.y2][i]);
        if (typeof input.setCustomValidity === "function") input.setCustomValidity("");
        input.removeAttribute("aria-invalid");
        const error = input.parentElement?.querySelector<HTMLElement>(".ch-field__error");
        if (error) { error.textContent = ""; error.hidden = true; }
      });
    }
    const current = presetCurve();
    selectedButtons.forEach(b => b.element.setAttribute("aria-pressed", String(Boolean(current && sameCurve(b.curve, current)))));
    chipButtons.forEach(b => b.element.setAttribute("aria-pressed", String(Boolean(current && sameCurve(b.curve, current)))));
    updateCurveName();
  }

  /** A change coming from the panel (inputs, presets): redraw the graph and commit. */
  function update(next: Partial<EaseDraft>, committedInput?: HTMLInputElement, animate = false): void {
    draft = { ...cloneEaseDraft(draft), ...next };
    curve.setModel(modelOf(draft), { silent: true, animate });
    options.onChange(draft);
    refreshSidebar(true, committedInput);
    options.onCommit(draft);
  }

  for (const key of ["x1", "y1", "x2", "y2"] as const) {
    const label = doc.createElement("label");
    label.appendChild(createElement(doc, "span", "ch-ease-coordinate-label", key.toUpperCase()));
    const input = doc.createElement("input"); input.type = "text"; input.inputMode = "decimal";
    input.min = key.startsWith("x") ? "0" : "-1"; input.max = key.startsWith("x") ? "1" : "2";
    input.value = String(draft[key]); input.setAttribute("aria-label", key.toUpperCase());
    input.title = `${key.toUpperCase()} · ${t(key.endsWith("1") ? "ease.curve.outHandle" : "ease.curve.inHandle")}`;
    const error = createElement(doc, "span", "ch-field__error");
    error.id = `ease-${key}-error`; error.hidden = true; error.setAttribute("aria-live", "polite");
    input.setAttribute("aria-describedby", error.id);
    input.addEventListener("change", () => {
      const next = { x1: draft.x1, y1: draft.y1, x2: draft.x2, y2: draft.y2, [key]: Number(input.value.replace(",", ".")) };
      if (input.value.trim() && validCurve(next)) { input.setCustomValidity(""); update(next, input); }
      else { input.setCustomValidity(t("ease.invalid")); input.setAttribute("aria-invalid", "true"); error.textContent = t("ease.invalid"); error.hidden = false; }
    });
    input.addEventListener("keydown", e => {
      if (e.key === "Escape") { input.value = String(draft[key]); input.setCustomValidity(""); input.removeAttribute("aria-invalid"); error.hidden = true; }
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        const parsed = Number(input.value.replace(",", "."));
        const step = e.altKey ? 0.001 : e.shiftKey ? 0.1 : 0.01;
        const current = input.value.trim() && Number.isFinite(parsed) ? parsed : draft[key];
        const value = Math.round(Math.max(Number(input.min), Math.min(Number(input.max), current + (e.key === "ArrowUp" ? step : -step))) * 1000) / 1000;
        update({ [key]: value }, input);
      }
      if (e.key === "Enter") input.blur();
    });
    numeric.push(input); label.appendChild(input); label.appendChild(error); values.appendChild(label);
  }

  function stop(): void { if (raf) win?.cancelAnimationFrame(raf); raf = 0; }
  function reduced(): boolean { return doc.documentElement.getAttribute("data-reduced-motion") === "true" || Boolean(win?.matchMedia?.("(prefers-reduced-motion: reduce)").matches); }
  function play(paint: (time: number) => void): void {
    stop();
    if (reduced() || !win?.requestAnimationFrame) { paint(0.5); return; }
    let start: number | undefined;
    const tick = (now: number): void => {
      if (!alive || doc.hidden) { stop(); return; }
      if (reduced()) { paint(0.5); stop(); return; }
      start ??= now;
      const time = Math.min(1, (now - start) / 1300); paint(time);
      if (time < 1) raf = win.requestAnimationFrame(tick); else raf = 0;
    };
    raf = win.requestAnimationFrame(tick);
  }
  const saveRow = createElement(doc, "form", "ch-ease-save"); saveRow.hidden = true;
  saveRow.id = "ease-save-curve";
  const name = doc.createElement("input"); name.placeholder = t("ease.curveName"); name.maxLength = 80; name.setAttribute("aria-label", name.placeholder);
  saveRow.appendChild(name);
  const feedback = createElement(doc, "p", "ch-hint"); feedback.setAttribute("role", "status");
  feedback.classList.add("ch-ease-feedback");
  function persist(next: typeof library): boolean {
    if (!writeEaseLibrary(storage, next)) { feedback.textContent = t("ease.storageError"); return false; }
    library = next; options.onLibraryChange?.(); return true;
  }
  function save(): void {
    if (!name.value.trim() || library.custom.length >= 200) { name.focus(); return; }
    const saved = easeEffectiveCurve(draft);
    const preset = { id: `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, name: name.value.trim(), curve: { ...saved }, custom: true };
    if (persist({ ...library, custom: [...library.custom, preset] })) { name.value = ""; feedback.textContent = t("ease.saved"); saveRow.hidden = true; saveToggle.setAttribute("aria-expanded", "false"); saveToggle.focus(); updateCurveName(); drawLibrary(); }
  }
  saveRow.appendChild(button(doc, { label: t("ease.save"), onClick: save }));
  saveRow.addEventListener("submit", e => { e.preventDefault(); save(); });
  const shelf = createElement(doc, "section", "ch-ease-library"); shelf.setAttribute("aria-label", t("ease.library"));
  if (!options.compact) columns.appendChild(shelf);
  const shelfHeader = createElement(doc, "div", "ch-ease-library-header"); shelf.appendChild(shelfHeader);
  shelfHeader.appendChild(createElement(doc, "h3", "ch-ease-section-title", t("ease.presets")));
  const libraryCount = createElement(doc, "span", "ch-ease-library-count"); libraryCount.setAttribute("aria-hidden", "true");
  shelfHeader.appendChild(libraryCount);
  /** The library tools are icons with names in their tooltips (compact review 2026-10-24). */
  const iconTool = (control: HTMLButtonElement, icon: "plus" | "search", label: string): void => {
    setUiIcon(control, icon, label);
    control.classList.add("ch-ease-library-tool");
    control.setAttribute("aria-label", label); control.title = label;
  };
  const saveToggle = button(doc, { label: t("ease.saveCurve"), disabled: options.busy, onClick: () => {
    saveRow.hidden = !saveRow.hidden; saveToggle.setAttribute("aria-expanded", String(!saveRow.hidden));
    if (!saveRow.hidden) name.focus();
  } });
  iconTool(saveToggle, "plus", t("ease.saveCurve"));
  saveToggle.setAttribute("aria-expanded", "false"); saveToggle.setAttribute("aria-controls", saveRow.id);
  shelf.appendChild(saveRow); shelf.appendChild(feedback);
  const toolbar = createElement(doc, "div", "ch-ease-library-toolbar"); shelf.appendChild(toolbar);
  toolbar.hidden = true; toolbar.id = "ease-search-curves";
  const searchToggle = button(doc, { label: t("ease.searchShort"), onClick: () => {
    toolbar.hidden = !toolbar.hidden; searchToggle.setAttribute("aria-expanded", String(!toolbar.hidden));
    if (!toolbar.hidden) toolbar.querySelector<HTMLInputElement>("input")?.focus();
  } });
  iconTool(searchToggle, "search", t("ease.search"));
  searchToggle.setAttribute("aria-expanded", "false"); searchToggle.setAttribute("aria-controls", toolbar.id); shelfHeader.appendChild(searchToggle);
  toolbar.appendChild(searchField(doc, { id: "ease-library-search", label: t("ease.search"), value: query, expandable: false,
    onInput: value => { query = value.toLowerCase().trim(); drawLibrary(); } }));
  const FILTERS: [CurveFilter, string][] = [["all", en ? "All" : "Todas"], ["fav", en ? "Favorites" : "Favoritas"], ["in", "In"], ["out", "Out"], ["io", "In-Out"]];
  const filterLabel = createElement(doc, "span", "", FILTERS[0]![1]);
  const favoriteFilter = button(doc, { label: "", onClick: () => {
    const rect = favoriteFilter.getBoundingClientRect?.();
    openContextMenu(doc, { x: rect ? rect.left : 0, y: rect ? rect.bottom + 2 : 0, label: en ? "Filter curves" : "Filtrar curvas", returnFocus: favoriteFilter,
      entries: FILTERS.map(([id, name]) => ({ id: `ease-filter-${id}`, label: name, checked: filter === id, run: () => { filter = id; filterLabel.textContent = name; favoriteFilter.setAttribute("aria-pressed", String(id === "fav")); drawLibrary(); } })) });
  } });
  favoriteFilter.classList.add("ch-ease-library-filter");
  favoriteFilter.appendChild(filterLabel);
  const filterChevron = uiIcon(doc, "chevron-down", 12); if (filterChevron) favoriteFilter.appendChild(filterChevron);
  favoriteFilter.setAttribute("aria-haspopup", "menu");
  favoriteFilter.setAttribute("aria-label", en ? "Filter curves" : "Filtrar curvas"); favoriteFilter.title = t("ease.favorites"); favoriteFilter.setAttribute("aria-pressed", "false"); shelfHeader.appendChild(favoriteFilter);
  shelfHeader.appendChild(saveToggle);
  // The quick-bar note lives in the star filter's tip; screen readers still get it in place.
  const quickBarNote = t("ease.quickBar.hint").replace(/^★\s*/, "");
  favoriteFilter.setAttribute("data-tip", t("ease.favorites"));
  favoriteFilter.setAttribute("data-tip-detail", quickBarNote);
  shelf.appendChild(createElement(doc, "p", "ch-hint ch-ease-quickbar-hint ch-visually-hidden", t("ease.quickBar.hint")));
  // One row of curves that the wheel and the edge buttons slide, like the quick dock strip.
  const grid = createElement(doc, "div", "ch-ease-grid");
  grid.setAttribute("data-wheel-owner", "");
  const strip = createQuickStrip(doc, browserMotionEnv(win, doc.documentElement), grid, {
    previous: options.i18n.locale().startsWith("en") ? "Previous curves" : "Curvas anteriores",
    next: options.i18n.locale().startsWith("en") ? "More curves" : "Mais curvas"
  });
  strip.element.classList.add("ch-ease-strip");
  shelf.appendChild(strip.element);
  const progress = (c: EaseCurve, time: number): number => {
    const cubic = (u: number, a: number, b: number): number => 3 * (1 - u) ** 2 * u * a + 3 * (1 - u) * u * u * b + u ** 3;
    let lo = 0, hi = 1;
    for (let i = 0; i < 30; i++) { const mid = (lo + hi) / 2; if (cubic(mid, c.x1, c.x2) < time) lo = mid; else hi = mid; }
    return cubic((lo + hi) / 2, c.y1, c.y2);
  };
  /** A preset is always a plain bezier: choosing one leaves any other mode and clears the points. */
  // A preset glides the handles to their new place instead of jumping (F6).
  const choose = (preset: EaseCurve): void => update({ mode: "bezier", points: [], view: draft.view, ...preset }, undefined, true);
  for (const quick of QUICK_PRESETS) {
    const preset = EASE_PRESETS.find(p => p.id === quick.id);
    if (!preset) continue;
    const chip = button(doc, { label: t(quick.labelKey), onClick: () => choose(preset.curve) });
    chip.classList.add("ch-ease-chip"); chip.title = preset.name;
    chip.addEventListener("dblclick", () => { choose(preset.curve); options.onApply(); });
    chipButtons.push({ element: chip, curve: preset.curve }); chips.appendChild(chip);
  }
  function drawLibrary(): void {
    stop(); updateCurveName(); grid.textContent = ""; selectedButtons.length = 0;
    const current = presetCurve();
    const family = (id: string): "in" | "out" | "io" => id.endsWith("-in-out") ? "io" : id.endsWith("-in") ? "in" : id.endsWith("-out") || id === "snappy" || id === "soft-land" ? "out" : "io";
    const presets = [...EASE_PRESETS, ...library.custom].filter(p => (filter === "all" || (filter === "fav" ? library.favorites.includes(p.id) : family(p.id) === filter)) && p.name.toLowerCase().includes(query))
      .sort((a, b) => Number(library.favorites.includes(b.id)) - Number(library.favorites.includes(a.id)));
    for (const preset of presets) {
      const tile = createElement(doc, "div", "ch-ease-tile"); grid.appendChild(tile);
      const select = button(doc, { label: "", onClick: () => choose(preset.curve) });
      select.classList.add("ch-ease-preset"); select.title = preset.name; select.setAttribute("aria-label", preset.name);
      select.setAttribute("aria-pressed", String(Boolean(current && sameCurve(current, preset.curve))));
      select.addEventListener("dblclick", () => { choose(preset.curve); options.onApply(); });
      selectedButtons.push({ element: select, curve: preset.curve });
      const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg"); svg.setAttribute("viewBox", "0 0 80 54"); svg.setAttribute("aria-hidden", "true");
      const path = doc.createElementNS(svg.namespaceURI!, "path");
      const c = preset.curve;
      const low = Math.min(0, c.y1, c.y2), high = Math.max(1, c.y1, c.y2);
      const y = (value: number): number => 43 - (value - low) / (high - low) * 32;
      path.setAttribute("d", `M10 ${y(0)} C${10 + c.x1 * 60} ${y(c.y1)} ${10 + c.x2 * 60} ${y(c.y2)} 70 ${y(1)}`); svg.appendChild(path);
      const marker = doc.createElementNS(svg.namespaceURI!, "circle"); marker.setAttribute("r", "2"); marker.setAttribute("cx", "10"); marker.setAttribute("cy", String(y(0))); svg.appendChild(marker);
      const paint = (time: number): void => { marker.setAttribute("cx", String(10 + time * 60)); marker.setAttribute("cy", String(y(progress(c, time)))); };
      select.addEventListener("mouseenter", () => { play(paint); curve.setPreview(preset.curve); }); select.addEventListener("focus", () => play(paint));
      select.addEventListener("mouseleave", () => { stop(); curve.setPreview(null); }); select.addEventListener("blur", stop);
      select.appendChild(svg); select.appendChild(createElement(doc, "span", "", preset.name)); tile.appendChild(select);
      const favorite = button(doc, { label: library.favorites.includes(preset.id) ? "★" : "☆", onClick: () => {
        const favorites = library.favorites.includes(preset.id) ? library.favorites.filter(id => id !== preset.id) : [...library.favorites, preset.id];
        // Only the star that was just turned on pops after the redraw.
        poppedStar = favorites.includes(preset.id) ? preset.id : null;
        if (persist({ ...library, favorites })) drawLibrary();
        poppedStar = null;
      } });
      // A star also puts the preset in the timeline quick bar (quick-bar.ts → quickBarPresets): say so.
      setUiIcon(favorite, library.favorites.includes(preset.id) ? "star-filled" : "star", favorite.textContent ?? "");
      favorite.classList.add("ch-ease-star");
      if (poppedStar === preset.id) favorite.setAttribute("data-pop", "true"); favorite.title = t(library.favorites.includes(preset.id) ? "ease.quickBar.remove" : "ease.quickBar.add", { name: preset.name }); favorite.setAttribute("aria-label", favorite.title); favorite.setAttribute("aria-pressed", String(library.favorites.includes(preset.id))); tile.appendChild(favorite);
      if (preset.custom) {
        const remove = button(doc, { label: "×", onClick: () => {
          if (persist({ custom: library.custom.filter(p => p.id !== preset.id), favorites: library.favorites.filter(id => id !== preset.id) })) drawLibrary();
        } });
        setUiIcon(remove, "close", "×");
        remove.classList.add("ch-ease-delete"); remove.setAttribute("aria-label", `${t("ease.delete")}: ${preset.name}`); tile.appendChild(remove);
      }
    }
    libraryCount.textContent = String(presets.length);
    if (!presets.length) grid.appendChild(createElement(doc, "p", "ch-hint", t("ease.empty")));
    strip.refresh();
  }
  refreshSidebar(true);
  if (!options.compact) drawLibrary();
  return {
    element: root,
    /** The other surface edited the draft: adopt it without emitting a commit. */
    setDraft(next) {
      draft = cloneEaseDraft(next);
      curve.setModel(modelOf(draft));
      live.setAttribute("aria-pressed", String(draft.live)); live.title = draft.live ? t("ease.liveOn") : t("ease.liveOff");
      refreshSidebar(true);
    },
    dispose() { alive = false; stop(); strip.dispose(); curve.dispose(); influenceNumbers.dispose(); }
  };
}

export { DEFAULT_EASE };
