import { aeMotionMs, scrollIntoViewSmooth, type MotionEnv, type TweenHandle } from "./motion/index.js";
import { groupEntries, withRecent, type PaletteEntry, type PaletteKind, type PaletteOperation, type PalettePhase, type PaletteResult, type PaletteTarget } from "./command-palette-model.js";
import { createPresetPhaseActions } from "./preset-gallery.js";

/**
 * Command palette (motion upgrade F5): Ctrl/Cmd+K or the search button in the nav.
 * A modal dialog with a combobox and a grouped listbox. ↑↓ move, Enter runs, Shift+Enter
 * opens the adjustments, Esc closes and gives focus back. Results never cascade while
 * typing; one highlight slides between them. Commands run through the panel's own paths.
 * With no query, the list prioritizes available suggestions and recent commands.
 */
const COPY = {
  "pt-BR": {
    label: "Paleta de comandos", placeholder: "Buscar preset, efeito ou ferramenta…", results: "Resultados", empty: "Nada encontrado para",
    recent: "Recentes", hints: "↑↓ navegar · Enter executar · Shift+Enter ajustes · Esc fechar",
    suggest: "Para a seleção", back: "Voltar à busca", reading: "Conferindo a seleção…", applying: "Aplicando…",
    changed: "A seleção mudou. Confira o destino e escolha a fase novamente.", failure: "Não foi possível concluir a ação.",
    kinds: { preset: "Presets", effect: "Efeitos", tool: "Ferramentas", quick: "Ações rápidas", view: "Telas", setting: "Ajustes" } as Record<PaletteKind, string>
  },
  "en-US": {
    label: "Command palette", placeholder: "Find a preset, effect or tool…", results: "Results", empty: "Nothing found for",
    recent: "Recent", hints: "↑↓ move · Enter run · Shift+Enter adjust · Esc close",
    suggest: "For the selection", back: "Back to search", reading: "Checking the selection…", applying: "Applying…",
    changed: "The selection changed. Check the target and choose a phase again.", failure: "Could not complete the action.",
    kinds: { preset: "Presets", effect: "Effects", tool: "Tools", quick: "Quick actions", view: "Views", setting: "Settings" } as Record<PaletteKind, string>
  }
};

const RECENT_KEY = "motion.palette.recent.v1";

export interface CommandPalette {
  readonly element: HTMLElement;
  open(): void;
  close(restoreFocus?: boolean): void;
  toggle(): void;
  isOpen(): boolean;
  refresh(): void;
  dispose(): void;
}

function readRecent(win: Window | null): string[] {
  try {
    const value = JSON.parse(win?.localStorage?.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  } catch { return []; }
}
function writeRecent(win: Window | null, recent: readonly string[]): void {
  try { win?.localStorage?.setItem(RECENT_KEY, JSON.stringify(recent)); } catch { /* Recents are a convenience. */ }
}

/** Ctrl+K on Windows, Cmd+K on macOS (both accepted everywhere). */
export function isPaletteKey(event: { key?: string; code?: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean; shiftKey?: boolean }): boolean {
  return Boolean((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && (event.code === "KeyK" || event.key?.toLowerCase() === "k"));
}

export function createCommandPalette(doc: Document, env: MotionEnv, options: {
  root: HTMLElement; locale(): string; entries(): PaletteEntry[]; readContext?(): Promise<void>;
}): CommandPalette {
  let copy = COPY[options.locale() === "pt-BR" ? "pt-BR" : "en-US"];
  const win = doc.defaultView;
  const scrim = doc.createElement("div");
  scrim.className = "ch-palette-scrim";
  scrim.setAttribute("data-motion", "sheet-scrim");
  scrim.setAttribute("data-open", "false");
  scrim.hidden = true;
  const dialog = doc.createElement("div");
  dialog.className = "ch-palette";
  dialog.id = "command-palette";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-label", copy.label);
  dialog.setAttribute("data-motion", "command-palette");
  dialog.setAttribute("tabindex", "-1");
  dialog.hidden = true;
  const field = doc.createElement("div");
  field.className = "ch-palette__field";
  const input = doc.createElement("input");
  input.className = "ch-palette__input";
  input.id = "command-palette-input";
  input.type = "text";
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-expanded", "true");
  input.setAttribute("aria-controls", "command-palette-list");
  input.setAttribute("aria-label", copy.label);
  input.setAttribute("autocomplete", "off");
  input.setAttribute("spellcheck", "false");
  input.placeholder = copy.placeholder;
  field.appendChild(input);
  const list = doc.createElement("div");
  list.className = "ch-palette__list";
  list.id = "command-palette-list";
  list.setAttribute("role", "listbox");
  list.setAttribute("aria-label", copy.results);
  list.setAttribute("data-wheel-owner", "true");
  const glide = doc.createElement("span");
  glide.className = "ch-palette__glide";
  glide.setAttribute("aria-hidden", "true");
  glide.setAttribute("data-motion", "selection-glide");
  const status = doc.createElement("p");
  status.className = "ch-palette__status";
  status.setAttribute("aria-live", "polite");
  const hints = doc.createElement("p");
  hints.className = "ch-palette__hints";
  hints.textContent = copy.hints;
  const phaseView = doc.createElement("section");
  phaseView.className = "ch-palette__phase";
  phaseView.hidden = true;
  const phaseBack = doc.createElement("button");
  phaseBack.type = "button";
  phaseBack.className = "ch-button ch-palette__back";
  const phaseTitle = doc.createElement("h2");
  phaseTitle.id = "command-palette-preset-title";
  const phaseTarget = doc.createElement("p");
  phaseTarget.className = "ch-palette__target";
  phaseTarget.setAttribute("aria-live", "polite");
  phaseView.setAttribute("aria-labelledby", phaseTitle.id);
  phaseView.appendChild(phaseBack); phaseView.appendChild(phaseTitle); phaseView.appendChild(phaseTarget);
  dialog.appendChild(field); dialog.appendChild(list); dialog.appendChild(phaseView); dialog.appendChild(status); dialog.appendChild(hints);
  options.root.appendChild(scrim);
  options.root.appendChild(dialog);

  let open = false;
  let entries: PaletteEntry[] = [];
  let shown: PaletteEntry[] = [];
  let options_: HTMLElement[] = [];
  let active = -1;
  let recent = readRecent(win);
  let returnFocus: HTMLElement | null = null;
  let hideTimer: ReturnType<MotionEnv["timeout"]> | null = null;
  let scrolling: TweenHandle | null = null;
  let pending = false;
  let phaseEntry: PaletteEntry | undefined;
  let target: PaletteTarget | undefined;
  let phaseActions: ReturnType<typeof createPresetPhaseActions> | undefined;
  const stopScrolling = (): void => { scrolling?.cancel(); scrolling = null; };

  function moveGlide(node: HTMLElement | undefined, animate: boolean): void {
    if (!node) { glide.setAttribute("data-visible", "false"); return; }
    glide.setAttribute("data-ready", String(animate));
    glide.setAttribute("data-visible", "true");
    glide.style.height = `${node.offsetHeight}px`;
    glide.style.transform = `translateY(${node.offsetTop}px)`;
  }
  function setActive(index: number, how: "keyboard" | "pointer" | "render"): void {
    if (!options_.length) { active = -1; input.removeAttribute("aria-activedescendant"); moveGlide(undefined, false); return; }
    active = (index + options_.length) % options_.length;
    options_.forEach((node, position) => node.setAttribute("aria-selected", String(position === active)));
    const node = options_[active]!;
    input.setAttribute("aria-activedescendant", node.id);
    moveGlide(node, how !== "render");
    if (how === "keyboard") { stopScrolling(); scrolling = scrollIntoViewSmooth(env, node, list, 4); }
  }
  function option(entry: PaletteEntry, index: number): HTMLElement {
    const node = doc.createElement("div");
    node.className = "ch-palette__option";
    node.id = `command-palette-option-${index}`;
    node.setAttribute("role", "option");
    node.setAttribute("aria-selected", "false");
    node.setAttribute("data-kind", entry.kind);
    if (entry.reason && entry.operation?.type !== "phase") node.setAttribute("aria-disabled", "true");
    const text = doc.createElement("span");
    text.className = "ch-palette__text";
    const title = doc.createElement("span");
    title.className = "ch-palette__title";
    title.textContent = entry.title;
    text.appendChild(title);
    const detail = entry.reason ?? [entry.detail, entry.hint].filter(Boolean).join(" · ");
    if (detail) {
      const line = doc.createElement("span");
      line.className = entry.reason ? "ch-palette__reason" : "ch-palette__detail";
      line.textContent = detail;
      text.appendChild(line);
    }
    node.appendChild(text);
    if (entry.shortcut) {
      const kbd = doc.createElement("kbd");
      kbd.className = "ch-rich-tooltip__kbd";
      kbd.textContent = entry.shortcut;
      node.appendChild(kbd);
    }
    node.addEventListener("mousemove", () => { if (active !== index) setActive(index, "pointer"); });
    node.addEventListener("click", () => { void run(index, false); });
    return node;
  }
  /** A labelled group of options (listbox → group → option). */
  function group(text: string, index: number): HTMLElement {
    const node = doc.createElement("div");
    node.setAttribute("role", "group");
    const label = doc.createElement("div");
    label.className = "ch-palette__group";
    label.id = `command-palette-group-${index}`;
    label.textContent = text;
    node.setAttribute("aria-labelledby", label.id);
    node.appendChild(label);
    return node;
  }
  function render(restoreId?: string): void {
    const query = input.value;
    const { recent: recents, groups } = groupEntries(query, entries, recent);
    stopScrolling();
    list.textContent = "";
    list.appendChild(glide);
    shown = []; options_ = [];
    let groupIndex = 0;
    const add = (label: string, items: readonly PaletteEntry[]): void => {
      if (!items.length) return;
      const box = group(label, groupIndex++);
      for (const entry of items) {
        const node = option(entry, shown.length);
        shown.push(entry); options_.push(node); box.appendChild(node);
      }
      list.appendChild(box);
    };
    if (query.trim()) {
      for (const group of groups) add(copy.kinds[group.kind], group.entries);
    } else {
      const suggested = entries.filter(entry => entry.suggested && !entry.reason).slice(0, 4);
      add(copy.suggest, suggested);
      add(copy.recent, recents.filter(entry => !suggested.includes(entry)));
      const views = groups.find(group => group.kind === "view")?.entries ?? [];
      add(copy.kinds.view, views.filter(entry => !recents.includes(entry) && !suggested.includes(entry)).slice(0, 5));
    }
    status.textContent = query.trim() && !shown.length ? `${copy.empty} “${query.trim()}”` : "";
    input.setAttribute("aria-expanded", String(shown.length > 0));
    list.scrollTop = 0;
    const restored = shown.findIndex(entry => entry.id === restoreId);
    setActive(Math.max(0, restored), restored > 0 ? "keyboard" : "render");
  }
  function finish(entry: PaletteEntry, follow?: () => void): void {
    recent = withRecent(recent, entry.id);
    writeRecent(win, recent);
    const back = returnFocus;
    close(false);
    follow?.();
    const focused = doc.activeElement;
    if (!focused || focused === doc.body || dialog.contains(focused)) {
      if (back?.isConnected) back.focus();
      else doc.querySelector<HTMLElement>(".ch-nav__item.is-active")?.focus();
    }
  }
  function setPending(value: boolean): void {
    pending = value;
    dialog.setAttribute("aria-busy", String(value));
    input.readOnly = value;
    phaseBack.disabled = value;
    const reason = value ? copy.reading : target?.reason ?? (!target ? copy.failure : undefined);
    for (const control of phaseActions?.controls.values() ?? []) control.setDisabled(Boolean(reason), reason);
  }
  function updateTarget(next: PaletteTarget): void {
    target = next;
    phaseTarget.textContent = next.label;
  }
  function backToSearch(): void {
    if (pending) return;
    const previousId = phaseEntry?.id;
    phaseEntry = undefined;
    target = undefined;
    phaseActions?.element.remove();
    phaseActions = undefined;
    phaseView.hidden = true;
    field.hidden = list.hidden = hints.hidden = false;
    entries = options.entries();
    render(previousId);
    input.focus();
  }
  async function openPhases(entry: PaletteEntry, operation: Extract<PaletteOperation, { type: "phase" }>): Promise<void> {
    phaseEntry = entry;
    phaseBack.textContent = copy.back;
    phaseTitle.textContent = entry.title;
    phaseTarget.textContent = copy.reading;
    phaseActions = createPresetPhaseActions(doc, { locale: options.locale(), onApply: phase => { void confirmPhase(operation, phase); } });
    phaseView.appendChild(phaseActions.element);
    phaseView.hidden = false;
    phaseBack.focus();
    field.hidden = list.hidden = hints.hidden = true;
    status.textContent = "";
    setPending(true);
    try {
      const next = await operation.readTarget();
      if (open) { updateTarget(next); status.textContent = next.reason ?? ""; }
    } catch {
      if (open) { phaseTarget.textContent = ""; status.textContent = copy.failure; }
    } finally {
      setPending(false);
      if (open) phaseBack.focus();
    }
  }
  async function confirmPhase(operation: Extract<PaletteOperation, { type: "phase" }>, phase: PalettePhase): Promise<void> {
    if (pending || !phaseEntry || !target) return;
    const entry = phaseEntry, previous = target;
    setPending(true);
    status.textContent = copy.reading;
    try {
      const next = await operation.readTarget();
      if (!open) return;
      updateTarget(next);
      if (next.reason || next.key !== previous.key) {
        status.textContent = next.reason || copy.changed;
        return;
      }
      status.textContent = copy.applying;
      phaseActions?.controls.get(phase)?.setState("loading", copy.applying);
      const result = await operation.execute(phase);
      if (open) completeOperation(entry, result);
    } catch {
      if (open) status.textContent = copy.failure;
    } finally {
      phaseActions?.controls.get(phase)?.setState("default");
      setPending(false);
      if (open && !phaseView.contains(doc.activeElement)) phaseBack.focus();
    }
  }
  function completeOperation(entry: PaletteEntry, result: PaletteResult): void {
    if (result.ok) finish(entry);
    else status.textContent = result.message || copy.failure;
  }
  async function run(index: number, adjust: boolean): Promise<void> {
    if (pending) return;
    const entry = shown[index];
    if (!entry) return;
    if (adjust && entry.adjust) { finish(entry, entry.adjust); return; }
    const operation = entry.operation;
    if (operation?.type === "phase") { await openPhases(entry, operation); return; }
    if (operation?.type === "apply") {
      setPending(true);
      status.textContent = copy.applying;
      try {
        const result = await operation.execute();
        if (open) completeOperation(entry, result);
      } catch {
        if (open) status.textContent = copy.failure;
      } finally { setPending(false); }
      return;
    }
    if (entry.reason) { status.textContent = entry.reason; setActive(index, "pointer"); return; }
    finish(entry, entry.run);
  }
  function onKeydown(event: Event): void {
    const key = event as KeyboardEvent;
    if (key.key === "Escape") { key.preventDefault(); key.stopPropagation?.(); if (!pending) { if (phaseEntry) backToSearch(); else close(true); } return; }
    if (pending || key.key === "Enter" && key.repeat) { key.preventDefault(); return; }
    if (phaseEntry) {
      if (key.key !== "Tab") return;
      const buttons = Array.from(phaseView.querySelectorAll<HTMLButtonElement>("button:not(:disabled):not([aria-disabled='true'])"));
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (key.shiftKey && doc.activeElement === first) { key.preventDefault(); last?.focus(); }
      else if (!key.shiftKey && doc.activeElement === last) { key.preventDefault(); first?.focus(); }
      return;
    }
    if (key.key === "ArrowDown" || key.key === "ArrowUp") { key.preventDefault(); setActive(active + (key.key === "ArrowDown" ? 1 : -1), "keyboard"); }
    else if (key.key === "PageDown" || key.key === "PageUp") { key.preventDefault(); setActive(Math.max(0, Math.min(options_.length - 1, active + (key.key === "PageDown" ? 6 : -6))), "keyboard"); }
    else if (key.key === "Enter") { key.preventDefault(); void run(active, key.shiftKey); }
    else if (key.key === "Tab") key.preventDefault();
  }
  function close(restoreFocus = true): void {
    if (!open) return;
    open = false;
    dialog.setAttribute("data-closing", "true");
    dialog.removeAttribute("data-open");
    scrim.setAttribute("data-open", "false");
    const finish = (): void => { hideTimer = null; if (open) return; dialog.hidden = true; scrim.hidden = true; dialog.removeAttribute("data-closing"); };
    if (env.reduced()) finish(); else hideTimer = env.timeout(finish, aeMotionMs("sheet-exit"));
    if (restoreFocus && returnFocus?.isConnected) returnFocus.focus();
    returnFocus = null;
  }

  input.addEventListener("input", () => render());
  input.addEventListener("keydown", onKeydown);
  phaseBack.addEventListener("click", backToSearch);
  scrim.addEventListener("click", () => { if (!pending) close(true); });
  // Clicks on headings, hints or options never take the focus away from the field.
  dialog.addEventListener("mousedown", event => { if (!phaseEntry && event.target !== input) event.preventDefault(); });
  dialog.addEventListener("focusout", event => {
    const next = (event as FocusEvent).relatedTarget as Node | null;
    if (open && !pending && next && !dialog.contains(next)) (phaseEntry ? phaseBack : input).focus();
  });
  dialog.addEventListener("keydown", event => {
    if (phaseEntry && event.repeat && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);
  dialog.addEventListener("keydown", event => { if (event.target !== input) onKeydown(event); });

  const api: CommandPalette = {
    element: dialog,
    open() {
      if (open || pending) return;
      if (hideTimer !== null) { env.clearTimeout(hideTimer); hideTimer = null; }
      open = true;
      const focused = doc.activeElement as HTMLElement | null;
      returnFocus = focused && focused !== doc.body ? focused : null;
      entries = options.entries();
      recent = readRecent(win);
      // The language can change in Settings while the panel stays open.
      copy = COPY[options.locale() === "pt-BR" ? "pt-BR" : "en-US"];
      dialog.setAttribute("aria-label", copy.label); input.setAttribute("aria-label", copy.label);
      input.placeholder = copy.placeholder; list.setAttribute("aria-label", copy.results); hints.textContent = copy.hints;
      input.value = "";
      phaseEntry = undefined; target = undefined; phaseActions?.element.remove(); phaseActions = undefined;
      phaseView.hidden = true; field.hidden = list.hidden = hints.hidden = false;
      scrim.hidden = false; dialog.hidden = false;
      dialog.removeAttribute("data-closing");
      render();
      dialog.setAttribute("data-open", "true");
      const frame = env.frame(() => scrim.setAttribute("data-open", "true"));
      if (frame === null) scrim.setAttribute("data-open", "true");
      input.focus();
      void options.readContext?.().then(() => api.refresh(), () => undefined);
    },
    close,
    toggle() { if (pending) return; if (open) close(true); else api.open(); },
    isOpen: () => open,
    refresh() {
      if (!open || pending) return;
      const operation = phaseEntry?.operation;
      if (operation?.type === "phase") {
        const next = operation.currentTarget();
        if (target?.key !== next.key || target.reason !== next.reason) {
          updateTarget(next);
          status.textContent = next.reason || copy.changed;
          setPending(false);
        }
        return;
      }
      entries = options.entries();
      render(shown[active]?.id);
    },
    dispose() {
      open = false;
      if (hideTimer !== null) env.clearTimeout(hideTimer);
      stopScrolling();
      scrim.parentNode?.removeChild(scrim);
      dialog.parentNode?.removeChild(dialog);
    }
  };
  return api;
}
