import {createToolNumberFields} from "./tool-number-fields.js";
/**
 * Ferramenta Elementos: escolher um elemento, ajustar textos, cores, tempo e
 * som, e inserir na composicao ativa (`ae.elements.insert`). Uma tarefa por
 * vez: a grade escolhe, o inspetor ajusta, Inserir confirma.
 */
import {
  ELEMENT_KINDS, ELEMENT_LIMITS, ELEMENT_SOUNDS, MOTION_ELEMENTS, findSound, elementColorRoles, elementInsertError, elementTextRoles, resolveElementArgs,
  type CommandResponse, type ElementColorRole, type ElementInsertArgs, type ElementKind, type ElementRgb, type ElementSoundChoice,
  type ElementTextRole, type MotionElement
} from "@motion/contracts";
import { colorField, createActionButton, createElement, selectField, textField, type ActionButtonController, type I18n } from "@motion/ui-core";
import { elementRestTime, paintElementPreview, type ElementPreviewOptions } from "./elements-preview.js";
import { attachReflowGlide, browserMotionEnv } from "./motion/index.js";

type Key = Parameters<I18n["t"]>[0];
type Category = "all" | ElementKind;
const CATEGORIES: readonly Category[] = ["all", ...ELEMENT_KINDS];

export interface ElementsEditorOptions {
  i18n: I18n;
  /** Fixa o tipo (pasta da galeria de Presets): sem os filtros proprios. */
  category?: ElementKind | undefined;
  /** Busca da galeria: filtra por nome e descricao. */
  query?: string | undefined;
  context(): { isComposition: boolean };
  execute(args: ElementInsertArgs): Promise<CommandResponse>;
  error(response: CommandResponse): string;
  busy?(value: boolean): void;
  /** Toca o WAV gerado do som, quando o painel consegue (CEP). */
  play?(sound: string): void;
  /** Agenda a previa animada; sem isto o inspetor mostra o quadro de repouso. */
  frame?(callback: (now: number) => void): number;
  cancelFrame?(handle: number): void;
}
export interface ElementsEditor { element: HTMLElement; actions: HTMLElement; refresh(): void; dispose(): void }

interface Draft {
  elementId: string;
  durationFrames: number;
  animationFrames: number;
  size: number;
  sound: ElementSoundChoice;
  colors: Partial<Record<ElementColorRole, ElementRgb>>;
  texts: Partial<Record<ElementTextRole, string>>;
}

export function elementColorHex(color: readonly number[]): string {
  return `#${color.map(v => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, "0")).join("")}`;
}
export function elementHexColor(hex: string): ElementRgb | null {
  const match = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  return match ? [parseInt(match[1]!, 16) / 255, parseInt(match[2]!, 16) / 255, parseInt(match[3]!, 16) / 255] : null;
}
/** Somente o que difere do padrao do elemento vai ao host. */
export function elementDraftArgs(draft: Draft, element: MotionElement): ElementInsertArgs {
  return {
    elementId: element.id,
    ...(draft.durationFrames !== element.defaults.durationFrames ? { durationFrames: draft.durationFrames } : {}),
    ...(draft.animationFrames !== element.defaults.animationFrames ? { animationFrames: draft.animationFrames } : {}),
    ...(draft.size !== 100 ? { size: draft.size } : {}),
    ...(draft.sound !== "preset" ? { sound: draft.sound } : {}),
    ...(Object.keys(draft.colors).length ? { colors: { ...draft.colors } } : {}),
    ...(Object.keys(draft.texts).length ? { texts: { ...draft.texts } } : {})
  };
}

/** Remove os filhos de verdade: `textContent = ""` nao basta em todo DOM do painel. */
function clear(node: Element): void { while (node.firstChild) node.removeChild(node.firstChild); }

export function createElementsEditor(doc: Document, options: ElementsEditorOptions): ElementsEditor {
  const numbers=createToolNumberFields(),numberField=numbers.field;
  const { i18n } = options, locale = i18n.locale() === "en-US" ? "en-US" : "pt-BR";
  const element = createElement(doc, "div", "ch-elements"), actions = createElement(doc, "div", "ch-panel-action-bar ch-elements-actions");
  const status = createElement(doc, "div", "ch-elements-status");
  status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite");
  const chips = createElement(doc, "div", "ch-elements-categories"); chips.setAttribute("role", "radiogroup"); chips.setAttribute("aria-label", i18n.t("elements.gallery"));
  const grid = createElement(doc, "div", "ch-elements-grid"); grid.setAttribute("role", "listbox"); grid.setAttribute("aria-label", i18n.t("elements.gallery"));
  const inspector = createElement(doc, "div", "ch-elements-inspector");
  // Mesmo deslizar dos presets quando o painel ou o divisor mudam a largura.
  const stopGridGlide = attachReflowGlide(browserMotionEnv(doc.defaultView, doc.documentElement), grid, { nodes: () => Array.from(grid.children) as HTMLElement[] });
  element.appendChild(chips); element.appendChild(grid); element.appendChild(inspector); element.appendChild(status);
  let category: Category = options.category ?? "all", running = false, alive = true, message = "";
  const query = (options.query ?? "").trim().toLowerCase();
  const visibleElements = (): MotionElement[] => MOTION_ELEMENTS.filter(item => (category === "all" || item.kind === category)
    && (!query || `${item.name[locale]} ${item.description[locale]}`.toLowerCase().includes(query)));
  // Nothing is chosen until a card is clicked; a second click clears it again.
  let draft: Draft | null = null;
  const invalid = new Set<string>();
  /** Card players: the hovered card and the selected one move inside their own thumbnail. */
  const players = new Map<string, { svg: SVGSVGElement; handle: number | null; hovered: boolean }>();

  function fresh(target: MotionElement): Draft {
    return { elementId: target.id, durationFrames: target.defaults.durationFrames, animationFrames: target.defaults.animationFrames, size: 100, sound: "preset", colors: {}, texts: {} };
  }
  const current = (): MotionElement | undefined => draft ? MOTION_ELEMENTS.find(item => item.id === draft!.elementId) : undefined;
  const previewOptions = (target: MotionElement): ElementPreviewOptions => {
    const own = draft?.elementId === target.id ? draft : null;
    const resolved = resolveElementArgs(own ? elementDraftArgs(own, target) : { elementId: target.id }, locale);
    return { durationFrames: resolved.durationFrames, animationFrames: resolved.animationFrames, colors: resolved.colors, texts: resolved.texts, size: 100, locale };
  };
  const reason = (): string | null => {
    if (running) return i18n.t("elements.working");
    const target = current();
    if (!draft || !target) return i18n.t("elements.choose");
    if (!options.context().isComposition) return i18n.t("elements.noComp");
    if (invalid.size || elementInsertError(elementDraftArgs(draft, target))) return i18n.t("elements.invalid");
    return null;
  };
  const insert: ActionButtonController = createActionButton(doc, { id: "elements-insert", label: i18n.t("elements.insert"), variant: "primary", onPress: () => { void run(); } });
  actions.appendChild(insert.element);

  function updateChrome(): void {
    const blocking = reason();
    insert.setDisabled(Boolean(blocking), blocking ?? undefined);
    status.textContent = message;
  }
  async function run(): Promise<void> {
    const target = current();
    if (reason() || !alive || !draft || !target) return;
    const args = elementDraftArgs(draft, target);
    running = true; message = ""; options.busy?.(true); updateChrome();
    try {
      const response = await options.execute(args);
      if (!alive) return;
      message = response.ok ? i18n.t("elements.inserted", { name: target.name[locale] }) : options.error(response);
    } finally {
      running = false; options.busy?.(false);
      if (alive) updateChrome();
    }
  }

  function still(target: MotionElement, svg: SVGSVGElement): void {
    const preview = previewOptions(target);
    paintElementPreview(svg, target, preview, elementRestTime(target, preview.durationFrames));
  }
  function stop(id: string): void {
    const player = players.get(id), target = MOTION_ELEMENTS.find(item => item.id === id);
    if (!player || !target) return;
    if (player.handle !== null) options.cancelFrame?.(player.handle);
    player.handle = null; still(target, player.svg);
  }
  function play(id: string): void {
    const player = players.get(id), target = MOTION_ELEMENTS.find(item => item.id === id);
    if (!player || !target || !options.frame || player.handle !== null) return;
    let started: number | null = null;
    const step = (now: number): void => {
      if (!alive || player.handle === null) return;
      started ??= now;
      // One pass of the element, then half a second of rest before looping.
      const preview = previewOptions(target), seconds = preview.durationFrames / 30, t = ((now - started) / 1000) % (seconds + .5);
      paintElementPreview(player.svg, target, preview, Math.min(t, seconds));
      player.handle = options.frame!(step);
    };
    player.handle = options.frame(step);
  }
  function settle(id: string): void { if (players.get(id)?.hovered || draft?.elementId === id) play(id); else stop(id); }

  function renderChips(): void {
    clear(chips);
    for (const id of CATEGORIES) {
      const chip = createElement(doc, "button", "ch-elements-chip", i18n.t(`elements.category.${id}` as Key)) as HTMLButtonElement;
      chip.type = "button"; chip.id = `elements-category-${id}`; chip.setAttribute("role", "radio"); chip.setAttribute("aria-checked", String(category === id));
      chip.addEventListener("click", () => { category = id; renderChips(); renderGrid(); });
      chips.appendChild(chip);
    }
  }
  function choose(target: MotionElement): void {
    if (running) return;
    const previous = draft?.elementId;
    draft = previous === target.id ? null : fresh(target);
    invalid.clear(); message = "";
    for (const card of Array.from(grid.getElementsByTagName("button"))) if (card.id.startsWith("element-")) card.setAttribute("aria-selected", String(card.id === `element-${draft?.elementId}`));
    if (previous) settle(previous);
    if (draft) settle(draft.elementId);
    renderInspector(); updateChrome();
  }
  function renderGrid(): void {
    for (const id of players.keys()) stop(id);
    players.clear(); clear(grid);
    for (const target of visibleElements()) {
      const card = createElement(doc, "button", "ch-elements-card") as HTMLButtonElement;
      card.type = "button"; card.id = `element-${target.id}`; card.setAttribute("role", "option");
      card.setAttribute("aria-selected", String(target.id === draft?.elementId)); card.title = target.description[locale];
      const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg") as SVGSVGElement;
      svg.setAttribute("class", "ch-elements-thumb"); svg.setAttribute("aria-hidden", "true");
      players.set(target.id, { svg, handle: null, hovered: false });
      still(target, svg);
      card.appendChild(svg); card.appendChild(createElement(doc, "span", "ch-elements-card__name", target.name[locale]));
      card.addEventListener("click", () => choose(target));
      const hover = (on: boolean) => (): void => { const player = players.get(target.id); if (!player) return; player.hovered = on; settle(target.id); };
      card.addEventListener("mouseenter", hover(true)); card.addEventListener("focus", hover(true));
      card.addEventListener("mouseleave", hover(false)); card.addEventListener("blur", hover(false));
      grid.appendChild(card);
    }
    if (draft) settle(draft.elementId);
  }

  function renderInspector(): void {
    numbers.dispose();
    clear(inspector);
    const target = current();
    inspector.hidden = !target;
    if (!target || !draft) return;
    const own = draft, textRoles = elementTextRoles(target), colorRoles = elementColorRoles(target), resolved = resolveElementArgs({ elementId: target.id }, locale);
    // Changes restart the selected card so the new look plays from the start.
    const refreshPreview = (): void => { stop(target.id); settle(target.id); updateChrome(); };
    for (const role of textRoles) inspector.appendChild(textField(doc, {
      id: `elements-text-${role}`, label: i18n.t(`elements.text.${role}` as Key), maxLength: ELEMENT_LIMITS.textLength,
      value: own.texts[role] ?? resolved.texts[role] ?? "", disabled: running,
      onCommit: value => { own.texts = { ...own.texts, [role]: value }; refreshPreview(); }
    }));
    for (const role of colorRoles) inspector.appendChild(colorField(doc, {
      id: `elements-color-${role}`, label: i18n.t(`elements.color.${role}` as Key), value: elementColorHex(own.colors[role] ?? resolved.colors[role]),
      onCommit: value => { const color = elementHexColor(value); if (!color) return; own.colors = { ...own.colors, [role]: color }; refreshPreview(); }
    }));
    const frames = (id: "duration" | "animation", value: number, range: readonly [number, number], set: (v: number) => void): HTMLElement => numberField(doc, {
      id: `elements-${id}`, label: i18n.t(`elements.${id}` as Key), value, min: range[0], max: range[1], step: 1, unit: i18n.t("elements.frames"),
      onCommit: next => {
        if (!Number.isInteger(next) || next < range[0] || next > range[1]) { invalid.add(id); updateChrome(); return; }
        invalid.delete(id); set(next); refreshPreview();
      }
    });
    inspector.appendChild(frames("duration", own.durationFrames, ELEMENT_LIMITS.durationFrames, v => { own.durationFrames = v; }));
    if (target.timing === "in-out") inspector.appendChild(frames("animation", own.animationFrames, ELEMENT_LIMITS.animationFrames, v => { own.animationFrames = v; }));
    inspector.appendChild(numberField(doc, {
      id: "elements-size", label: i18n.t("elements.size"), value: own.size, min: ELEMENT_LIMITS.size[0], max: ELEMENT_LIMITS.size[1], step: 1, unit: "%",
      onCommit: next => { if (!(next >= ELEMENT_LIMITS.size[0] && next <= ELEMENT_LIMITS.size[1])) { invalid.add("size"); updateChrome(); return; } invalid.delete("size"); own.size = next; updateChrome(); }
    }));
    const soundLabel = (id: string): string => findSound(id)?.name[locale] ?? i18n.t(`elements.sound.${id}` as Key);
    const soundRow = createElement(doc, "div", "ch-elements-sound");
    soundRow.appendChild(selectField(doc, {
      id: "elements-sound", label: i18n.t("elements.sound"), value: own.sound,
      options: [
        { value: "preset", label: i18n.t("elements.sound.preset", { sound: soundLabel(target.sound) }) },
        { value: "none", label: soundLabel("none") },
        ...ELEMENT_SOUNDS.map(id => ({ value: id, label: soundLabel(id) }))
      ],
      onChange: value => { own.sound = value as ElementSoundChoice; updateChrome(); }
    }));
    if (options.play) {
      const listen = createActionButton(doc, { id: "elements-listen", label: i18n.t("elements.listen"), variant: "tertiary", onPress: () => {
        const id = own.sound === "preset" ? target.sound : own.sound;
        if (id !== "none") options.play?.(id);
      } });
      soundRow.appendChild(listen.element);
    }
    inspector.appendChild(soundRow);
  }

  if (options.category) chips.hidden = true; else renderChips();
  renderGrid(); renderInspector(); updateChrome();
  return {
    element, actions,
    refresh: () => { if (alive && !running) updateChrome(); },
    dispose: () => { numbers.dispose(); stopGridGlide(); alive = false; for (const player of players.values()) { if (player.handle !== null) options.cancelFrame?.(player.handle); player.handle = null; } }
  };
}
