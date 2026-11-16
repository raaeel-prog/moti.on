/**
 * Pasta Sons da galeria: ouvir e inserir os sons sintetizados pelo Moti.on
 * (`ae.sound.insert`). Uma tarefa por vez: a lista escolhe, a barra de acoes
 * insere. Clicar num som ja o toca; um segundo clique desmarca.
 */
import {
  MOTION_SOUNDS, SOUND_FAMILIES, SOUND_FAMILY_NAMES, SOUND_LIMITS, soundInsertError,
  type CommandResponse, type MotionSound, type SoundFamily, type SoundInsertArgs
} from "@motion/contracts";
import { createActionButton, createElement, type ActionButtonController, type I18n } from "@motion/ui-core";

export interface SoundLibraryOptions {
  i18n: I18n;
  /** Fixa a familia (subpasta da galeria); sem ela, todas aparecem agrupadas. */
  family?: SoundFamily | undefined;
  query?: string | undefined;
  context(): { isComposition: boolean };
  execute(args: SoundInsertArgs): Promise<CommandResponse>;
  error(response: CommandResponse): string;
  busy?(value: boolean): void;
  play?(sound: string): void;
}
export interface SoundLibrary { element: HTMLElement; actions: HTMLElement; refresh(): void; dispose(): void }

interface Draft { soundId: string; reverse: boolean; gainDb: number }

/** Somente o que difere do padrao vai ao host. */
export function soundDraftArgs(draft: Draft): SoundInsertArgs {
  return { soundId: draft.soundId, ...(draft.reverse ? { reverse: true } : {}), ...(draft.gainDb !== 0 ? { gainDb: draft.gainDb } : {}) };
}

export function visibleSounds(locale: "pt-BR" | "en-US", family?: SoundFamily, query = ""): readonly MotionSound[] {
  const q = query.trim().toLowerCase();
  return (MOTION_SOUNDS as readonly MotionSound[]).filter(sound => (!family || sound.family === family)
    && (!q || `${sound.name[locale]} ${SOUND_FAMILY_NAMES[sound.family][locale]}`.toLowerCase().includes(q)));
}

function clear(node: Element): void { while (node.firstChild) node.removeChild(node.firstChild); }

export function createSoundLibrary(doc: Document, options: SoundLibraryOptions): SoundLibrary {
  const { i18n } = options, locale = i18n.locale() === "en-US" ? "en-US" : "pt-BR", pt = locale === "pt-BR";
  const element = createElement(doc, "div", "ch-sounds"), actions = createElement(doc, "div", "ch-panel-action-bar ch-sounds-actions");
  const list = createElement(doc, "div", "ch-sounds-list"); list.setAttribute("role", "listbox"); list.setAttribute("aria-label", pt ? "Sons" : "Sounds");
  const inspector = createElement(doc, "div", "ch-sounds-inspector");
  const status = createElement(doc, "div", "ch-sounds-status"); status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite");
  element.appendChild(list); element.appendChild(inspector); element.appendChild(status);
  let draft: Draft | null = null, running = false, alive = true, message = "";

  const reason = (): string | null => {
    if (running) return pt ? "Inserindo…" : "Inserting…";
    if (!draft) return pt ? "Escolha um som." : "Choose a sound.";
    if (!options.context().isComposition) return pt ? "Abra uma composição." : "Open a composition.";
    if (soundInsertError(soundDraftArgs(draft))) return pt ? "Revise os ajustes do som." : "Check the sound settings.";
    return null;
  };
  const insert: ActionButtonController = createActionButton(doc, { id: "sounds-insert", label: pt ? "Inserir som" : "Insert sound", variant: "primary", onPress: () => { void run(); } });
  actions.appendChild(insert.element);

  function updateChrome(): void {
    const blocking = reason();
    insert.setDisabled(Boolean(blocking), blocking ?? undefined);
    status.textContent = message;
  }
  async function run(): Promise<void> {
    if (reason() || !draft) return;
    const sound = MOTION_SOUNDS.find(item => item.id === draft!.soundId);
    running = true; message = ""; options.busy?.(true); updateChrome();
    try {
      const response = await options.execute(soundDraftArgs(draft));
      if (!alive) return;
      message = response.ok ? (pt ? `Som inserido: ${sound?.name[locale] ?? ""}` : `Sound inserted: ${sound?.name[locale] ?? ""}`) : options.error(response);
    } finally {
      running = false; options.busy?.(false);
      if (alive) updateChrome();
    }
  }

  function choose(sound: MotionSound): void {
    if (running) return;
    draft = draft?.soundId === sound.id ? null : { soundId: sound.id, reverse: false, gainDb: 0 };
    if (draft) options.play?.(sound.id);
    message = "";
    for (const row of Array.from(list.getElementsByTagName("button"))) row.setAttribute("aria-selected", String(row.dataset["sound"] === draft?.soundId));
    renderInspector(); updateChrome();
  }
  function row(sound: MotionSound): HTMLElement {
    const button = createElement(doc, "button", "ch-sounds-row") as HTMLButtonElement;
    button.type = "button"; button.id = `sound-${sound.id}`; button.dataset["sound"] = sound.id;
    button.setAttribute("role", "option"); button.setAttribute("aria-selected", String(draft?.soundId === sound.id));
    button.appendChild(createElement(doc, "span", "ch-sounds-row__name", sound.name[locale]));
    button.appendChild(createElement(doc, "span", "ch-sounds-row__family", SOUND_FAMILY_NAMES[sound.family][locale]));
    button.addEventListener("click", () => choose(sound));
    return button;
  }
  function renderList(): void {
    clear(list);
    const sounds = visibleSounds(locale, options.family, options.query);
    if (!sounds.length) { list.appendChild(createElement(doc, "p", "ch-sounds-empty", pt ? "Nenhum som encontrado." : "No sounds found.")); return; }
    for (const family of SOUND_FAMILIES) {
      const members = sounds.filter(sound => sound.family === family);
      if (!members.length) continue;
      if (!options.family) list.appendChild(createElement(doc, "div", "ch-sounds-group", SOUND_FAMILY_NAMES[family][locale]));
      for (const sound of members) list.appendChild(row(sound));
    }
  }
  function renderInspector(): void {
    clear(inspector);
    inspector.hidden = !draft;
    if (!draft) return;
    const own = draft;
    const listen = createActionButton(doc, { id: "sounds-listen", label: pt ? "Ouvir" : "Listen", variant: "tertiary", onPress: () => options.play?.(own.soundId) });
    if (options.play) inspector.appendChild(listen.element);
    const reverse = createElement(doc, "label", "ch-sounds-option");
    const box = doc.createElement("input"); box.type = "checkbox"; box.id = "sounds-reverse"; box.checked = own.reverse;
    box.addEventListener("change", () => { own.reverse = box.checked; updateChrome(); });
    reverse.appendChild(box); reverse.appendChild(createElement(doc, "span", "ch-sounds-option__label", pt ? "Tocar ao contrário" : "Play reversed"));
    inspector.appendChild(reverse);
    const gain = createElement(doc, "label", "ch-sounds-option");
    const range = doc.createElement("input"); range.type = "range"; range.id = "sounds-gain";
    range.min = String(SOUND_LIMITS.gainDb[0]); range.max = String(SOUND_LIMITS.gainDb[1]); range.step = "1"; range.value = String(own.gainDb);
    const value = createElement(doc, "span", "ch-sounds-gain", `${own.gainDb} dB`);
    range.addEventListener("input", () => { own.gainDb = Number(range.value); value.textContent = `${own.gainDb} dB`; updateChrome(); });
    gain.appendChild(createElement(doc, "span", "ch-sounds-option__label", "Volume")); gain.appendChild(range); gain.appendChild(value);
    inspector.appendChild(gain);
  }

  renderList(); renderInspector(); updateChrome();
  return { element, actions, refresh: () => { if (alive && !running) updateChrome(); }, dispose: () => { alive = false; } };
}
