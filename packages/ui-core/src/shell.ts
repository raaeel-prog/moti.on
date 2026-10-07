/**
 * Shell do painel — CHMS-008.
 *
 * DOM direto, sem framework. Não é austeridade: o painel precisa rodar no
 * Chromium embutido do CEP 12 **e** no runtime do UXP, que não é um navegador. O
 * subconjunto usado aqui — `createElement`, `appendChild`, `textContent`,
 * `setAttribute`, `addEventListener` — é o que os dois garantem.
 *
 * Nada de `innerHTML`: o UXP não o implementa por completo, e usá-lo colocaria
 * uma via de injeção de markup onde hoje não existe nenhuma.
 *
 * A largura vem por JavaScript, não por `@media`. Media query mede a viewport; o
 * que importa num painel acoplado é a largura do painel.
 */
import { closeOpenDropdown, mountDropdownView, validateDropdownOptions, type SelectFieldOptions } from "./elements/dropdown-view.js";
import { registerMotiDropdown } from "./elements/moti-dropdown.js";
export type { SelectFieldOptions, SelectFieldOption } from "./elements/dropdown-view.js";
import { attachScrubbableNumber } from "./scrubbable-number.js";
import { createI18n, type I18n } from "./i18n.js";
import type { MessageKey } from "./locales.js";
import { createIcon } from "./icons.js";
export { createIcon } from "./icons.js";

/**
 * Fronteiras das quatro faixas de acoplamento do Addendum A, que supersede o
 * §22.3 do MASTER: Compact 280–339, Default 340–479, Comfort 480–719, Wide 720+.
 * 280 px é a largura mínima suportada.
 *
 * O código tinha três faixas com todas as fronteiras erradas (compact até 359,
 * "standard" até 559, wide a partir de 560) e sem a faixa Comfort. Na prática
 * isso significava que um painel em 340 px era tratado como compacto — barra
 * inferior, rótulos de 50 %, botões de largura inteira — quando o Addendum já
 * pede o rail lateral ali; e que a partir de 560 px ele entrava em Wide, que o
 * Addendum reserva para 720 px.
 */
export const COMPACT_MAX = 339;
export const DEFAULT_MAX = 479;
export const COMFORT_MAX = 719;

let shellSequence = 0;

function fieldEnglish(doc: Document): boolean {
  return (doc.documentElement?.lang ?? "").toLowerCase().startsWith("en");
}

function fieldHidden(node: HTMLElement, hidden: boolean): void {
  node.hidden = hidden;
  node.setAttribute("data-hidden", String(hidden));
}


export type WidthClass = "compact" | "default" | "comfort" | "wide";
export type StatusState = "ok" | "error" | "busy";


export function resolveWidthClass(width: number | undefined): WidthClass {
  if (!width || width <= COMPACT_MAX) {
    return "compact";
  }
  if (width <= DEFAULT_MAX) return "default";
  if (width <= COMFORT_MAX) return "comfort";
  return "wide";
}

export function createElement(
  doc: Document,
  tag: string,
  className?: string,
  text?: string
): HTMLElement {
  const node = doc.createElement(tag);
  if (className) {
    node.className = className;
  }
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}

export function clearNode(node: Node): void {
  while (node.firstChild) {
    node.removeChild(node.firstChild);
  }
}


export type RowTone = "ok" | "off" | "unknown";

/**
 * Linha rótulo/valor.
 *
 * O valor completo vai para o `title` porque a coluna trunca com reticências em
 * painel estreito, e um caminho truncado sem forma de ler o resto é informação
 * perdida.
 */
export function propertyRow(
  doc: Document,
  label: string,
  value: string,
  tone?: RowTone
): HTMLElement {
  const row = createElement(doc, "div", tone ? `ch-row ch-row--${tone}` : "ch-row");
  row.appendChild(createElement(doc, "div", "ch-row__label", label));

  const valueNode = createElement(doc, "div", "ch-row__value", value);
  valueNode.setAttribute("title", value);
  row.appendChild(valueNode);

  return row;
}

export function sectionTitle(doc: Document, text: string): HTMLElement {
  return createElement(doc, "div", "ch-section-title", text);
}

/**
 * Linha auxiliar discreta, para contagem e resumo abaixo de uma lista.
 *
 * Não é `notice`: aviso é uma caixa com peso visual, e "mais 12 camadas" não é
 * um aviso — é rodapé. Usar `notice` para isso encheria a view de caixas e
 * gastaria a atenção que os avisos de verdade precisam ter.
 */
export function hint(doc: Document, text: string): HTMLElement {
  return createElement(doc, "div", "ch-hint", text);
}

export interface ToolTileOptions {
  /** Precisa bater com uma chave de `ICON_PATHS` para o ladrilho ter marcador. */
  id: string;
  label: string;
  description?: string;
  /**
   * Quando presente, o ladrilho fica desabilitado e o motivo vira o tooltip.
   *
   * O motivo, e nao um booleano: um ladrilho apagado sem explicacao faz o
   * usuario procurar o que ele proprio fez de errado. A frase diz o que
   * falta — uma composicao, uma propriedade selecionada.
   */
  disabledReason?: string;
  /**
   * Complemento do tooltip, ja traduzido — tipicamente o aviso de que Alt+clique
   * abre os ajustes.
   *
   * Campo separado, e nao um texto colado na `description`, porque a descricao
   * tambem alimenta a busca do navegador de ferramentas: concatenar faria toda
   * ferramenta com preset casar com "alt" e "ajustes".
   */
  hint?: string;
  /**
   * `alt` distingue as duas intencoes sobre o mesmo ladrilho: clique aplica o
   * preset direto, Alt+clique abre a tela para ajustar antes.
   */
  onSelect(intent: { alt: boolean }): void;
}

/**
 * Ladrilho de ferramenta.
 *
 * A §22 pede grade de ícones **sem inspector** até uma ferramenta ser
 * escolhida: uma aba por ferramenta não escala, e com sete abas o painel já
 * gastava a navegação inteira em coisas que o usuário não está usando agora.
 *
 * O rótulo textual é obrigatório e não some em nenhuma largura. Ícone sozinho
 * exigiria que a pessoa decorasse a iconografia para achar a ferramenta.
 */
export function toolTile(doc: Document, options: ToolTileOptions): HTMLButtonElement {
  const tile = createElement(doc, "button", "ch-tool") as HTMLButtonElement;
  tile.setAttribute("type", "button");
  tile.setAttribute("data-motion", "tile-hover tile-press");
  // O motivo de indisponibilidade substitui tudo: quando o ladrilho nao pode ser
  // clicado, a dica de Alt+clique so competiria com a frase que diz o que falta.
  const descricao = options.description ?? options.label;
  tile.title =
    options.disabledReason ?? (options.hint ? `${descricao} — ${options.hint}` : descricao);
  if (options.disabledReason) {
    tile.disabled = true;
    tile.setAttribute("aria-disabled", "true");
  }

  const glyph = createElement(doc, "span", "ch-tool__icon");
  glyph.appendChild(createIcon(doc, options.id));
  tile.appendChild(glyph);
  tile.appendChild(createElement(doc, "span", "ch-tool__label", options.label));

  tile.addEventListener("click", (event) => {
    const mouse = event as MouseEvent | undefined;
    options.onSelect({ alt: mouse?.altKey === true });
  });
  return tile;
}

/** Ladrilhos visíveis da grade, na ordem de leitura. */
function tileVisiveis(grid: HTMLElement): HTMLElement[] {
  const encontrados: HTMLElement[] = [];
  for (const celula of Array.from(grid.children) as HTMLElement[]) {
    // O filtro esconde a celula, nao o ladrilho: pular aqui e o que mantem a
    // ancora do roving e as setas restritas ao que o usuario esta vendo.
    if (celula.hidden) continue;
    const tile = celula.children[0] as HTMLElement | undefined;
    if (tile) encontrados.push(tile);
  }
  return encontrados;
}

/**
 * Recoloca a âncora do roving no primeiro ladrilho visível.
 *
 * Precisa ser chamado de novo sempre que a visibilidade dos ladrilhos mudar.
 * Sem isso, um filtro que esconda o ladrilho que carrega `tabindex="0"` deixa a
 * grade inteira fora da ordem de Tab: os visíveis todos com `-1`, e o único
 * alcançável escondido.
 */
export function syncToolGridRoving(grid: HTMLElement): void {
  const visiveis = tileVisiveis(grid);
  for (const [indice, tile] of visiveis.entries()) {
    tile.setAttribute("tabindex", indice === 0 ? "0" : "-1");
  }
}

/**
 * Grade de ferramentas. O número de colunas é decidido pelo CSS, por largura.
 *
 * ## Teclado
 *
 * A grade é **uma** parada de Tab, e não uma por ladrilho: com 49 ferramentas,
 * chegar ao que vem depois dela custaria 49 tabuladas. Dentro dela, ←/→ andam
 * na ordem de leitura e Home/End vão às pontas, sempre pulando o que o filtro
 * escondeu.
 *
 * **↑/↓ não são tratados de propósito.** Isto é `role=list` num flex-wrap: o
 * número de colunas é decidido pelo refluxo do CSS e o DOM não o conhece.
 * Tratar ↑/↓ exigiria chutar a largura da linha, e um chute errado move o foco
 * para um ladrilho que não é o de cima — pior que não mover. O grid de verdade,
 * com contagem de colunas declarada e `role=grid`, é o `createQuickGrid` de
 * `components.ts`.
 */
export function toolGrid(doc: Document, tiles: readonly HTMLElement[]): HTMLElement {
  const grid = createElement(doc, "div", "ch-tool-grid");
  grid.setAttribute("role", "list");

  for (const tile of tiles) {
    const item = createElement(doc, "div", "ch-tool-grid__item");
    item.setAttribute("role", "listitem");
    item.appendChild(tile);
    grid.appendChild(item);

    tile.addEventListener("keydown", (event) => {
      const key = (event as KeyboardEvent).key;
      const visiveis = tileVisiveis(grid);
      const atual = visiveis.indexOf(tile);
      if (atual < 0 || visiveis.length === 0) return;

      let destino: number;
      if (key === "ArrowRight") destino = Math.min(atual + 1, visiveis.length - 1);
      else if (key === "ArrowLeft") destino = Math.max(atual - 1, 0);
      else if (key === "Home") destino = 0;
      else if (key === "End") destino = visiveis.length - 1;
      else return;

      event.preventDefault();
      const alvo = visiveis[destino];
      if (!alvo) return;
      // A âncora acompanha o foco: sair da grade e voltar por Tab devolve o
      // usuário ao ladrilho onde ele estava, e não ao primeiro.
      for (const outro of visiveis) {
        outro.setAttribute("tabindex", outro === alvo ? "0" : "-1");
      }
      alvo.focus();
    });
  }

  syncToolGridRoving(grid);
  return grid;
}

interface FieldBaseOptions {
  id: string;
  label: string;
  description?: string;
  disabled?: boolean;
  disabledReason?: string;
}

export interface NumberFieldOptions extends FieldBaseOptions {
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onInput?(value: number): void;
  onCommit(value: number): void;
}

export interface CheckboxFieldOptions extends FieldBaseOptions {
  checked: boolean;
  onChange(checked: boolean): void;
}

function fieldRoot(doc: Document, options: FieldBaseOptions): {
  root: HTMLElement;
  control: HTMLElement;
} {
  const root = createElement(doc, "div", "ch-field");
  const label = createElement(doc, "label", "ch-field__label", options.label) as HTMLLabelElement;
  label.htmlFor = options.id;
  root.appendChild(label);

  const control = createElement(doc, "div", "ch-field__control");
  root.appendChild(control);

  if (options.description) {
    const description = createElement(doc, "div", "ch-field__description", options.description);
    description.setAttribute("id", `${options.id}-description`);
    root.appendChild(description);
  }

  return { root, control };
}

function applyFieldState(
  node: HTMLInputElement | HTMLSelectElement,
  options: FieldBaseOptions
): void {
  node.id = options.id;
  if (options.description) {
    node.setAttribute("aria-describedby", `${options.id}-description`);
  }
  if (options.disabled) {
    node.disabled = true;
    node.setAttribute("aria-disabled", "true");
    node.title = options.disabledReason ?? options.description ?? options.label;
  }
}

/** Compatible factory; native select and overlay gates remain independent. */
export function selectField(doc: Document, options: SelectFieldOptions): HTMLElement {
  validateDropdownOptions(options);
  const Constructor = registerMotiDropdown(doc);
  if (Constructor) {
    let candidate: HTMLElement | undefined;
    try { candidate = doc.createElement("moti-dropdown"); } catch { /* Partial registry: use DOM fallback. */ }
    if (candidate instanceof Constructor) {
      candidate.configure(options);
      return candidate;
    }
  }
  const root = createElement(doc, "div");
  mountDropdownView(root, options);
  return root;
}

/** Invalid text is a visible draft; only validated commits reach consumers. */
export function numberField(doc: Document, options: NumberFieldOptions): HTMLElement {
  const field = fieldRoot(doc, options);
  field.root.className += " ch-field--number";
  const input = createElement(doc, "input", "ch-number") as HTMLInputElement;
  // type=number erases unfinished decimal drafts in Chromium before validation.
  input.type = "text";
  input.setAttribute("inputmode", options.step < 1 ? "decimal" : "numeric");
  input.setAttribute("role", "spinbutton");
  input.setAttribute("aria-valuemin", String(options.min));
  input.setAttribute("aria-valuemax", String(options.max));
  input.value = String(options.value);
  input.min = String(options.min);
  input.max = String(options.max);
  input.step = String(options.step);
  applyFieldState(input, options);
  input.setAttribute("data-focus-key", options.id);
  const error = createElement(doc, "div", "ch-field__error");
  error.id = `${options.id}-error`;
  error.setAttribute("role", "alert");
  fieldHidden(error, true);
  field.root.appendChild(error);
  const english = fieldEnglish(doc);
  const rangeMessage = createI18n({ locale: doc.documentElement?.lang || "pt-BR" }).t(
    options.step >= 1 ? "field.integerRange" : "field.numberRange", { min: options.min, max: options.max }
  );
  let committed = options.value;
  const read = (): number | undefined => {
    const text = input.value.trim().replace(",", ".");
    const value = Number(text);
    return text !== "" && Number.isFinite(value) && value >= options.min && value <= options.max
      && (options.step < 1 || Number.isInteger(value)) ? value : undefined;
  };
  function validate(): number | undefined {
    const value = read();
    const invalid = value === undefined;
    input.setAttribute("aria-invalid", String(invalid));
    input.setAttribute("aria-describedby", [options.description ? `${options.id}-description` : "", invalid ? error.id : ""].filter(Boolean).join(" "));
    field.root.setAttribute("data-invalid", String(invalid));
    error.textContent = invalid ? rangeMessage : "";
    fieldHidden(error, !invalid);
    if (value !== undefined) input.setAttribute("aria-valuenow", String(value));
    return value;
  }
  function commit(): void {
    if (options.disabled) return;
    const value = validate();
    if (value === undefined || value === committed) return;
    committed = value;
    options.onCommit(value);
  }
  function preview(value: number): void {
    const precision = Math.min(10, Math.max(0, (String(options.step).split(".")[1]?.length ?? 0) + 1));
    const next = Math.max(options.min, Math.min(options.max, options.step >= 1 ? Math.round(value) : Number(value.toFixed(precision))));
    input.value = String(next);
    validate();
    options.onInput?.(next);
  }
  const stepValue = (event: KeyboardEvent | PointerEvent): number => options.step * (event.shiftKey ? 10 : event.altKey && options.step < 1 ? 0.1 : 1);
  function keyAdjust(event: KeyboardEvent): void {
    if (options.disabled) return;
    if (event.key === "Enter") { event.preventDefault(); commit(); return; }
    if (event.key === "Escape") { input.value = String(committed); validate(); return; }
    if (!["ArrowUp", "ArrowRight", "ArrowDown", "ArrowLeft"].includes(event.key)) return;
    // Text caret remains native in the editable field; the handle owns ←/→.
    if (event.currentTarget === input && (event.key === "ArrowLeft" || event.key === "ArrowRight")) return;
    event.preventDefault();
    const sign = event.key === "ArrowUp" || event.key === "ArrowRight" ? 1 : -1;
    preview((read() ?? committed) + sign * stepValue(event));
    commit();
  }
  input.addEventListener("input", () => { const value = validate(); if (value !== undefined && !options.disabled) options.onInput?.(value); });
  input.addEventListener("change", commit);
  // CEP supports native event dispatch; UXP keeps its established control path
  // until the runtime exposes the same capability.
  if(typeof doc.createEvent==="function"&&typeof input.dispatchEvent==="function"&&input.ownerDocument){
    attachScrubbableNumber(input,{helpText:english?"Drag the number · Shift: fine · Alt/Option: fast · Click to type":"Arraste o número · Shift: precisão · Alt/Option: rápido · Clique para digitar"});
  }else input.addEventListener("keydown", event => keyAdjust(event as KeyboardEvent));
  const handle = createElement(doc, "button", "ch-number-scrub", "↔") as HTMLButtonElement;
  handle.type = "button";
  handle.disabled = options.disabled === true;
  handle.setAttribute("data-focus-key", `${options.id}-scrub`);
  handle.setAttribute("aria-label", english ? `Adjust ${options.label}` : `Ajustar ${options.label}`);
  handle.title = english ? "Drag to adjust · Shift: 10× · Option/Alt: fine" : "Arraste para ajustar · Shift: 10× · Option/Alt: precisão";
  handle.setAttribute("data-motion", "button-press");
  handle.addEventListener("keydown", event => keyAdjust(event as KeyboardEvent));
  let drag: { x: number; value: number; pointer: number; draft: string } | null = null;
  handle.addEventListener("pointerdown", event => {
    const pointer = event as PointerEvent;
    if (options.disabled || pointer.button !== 0 || typeof handle.setPointerCapture !== "function") return;
    event.preventDefault();
    handle.focus();
    drag = { x: pointer.clientX, value: read() ?? committed, pointer: pointer.pointerId, draft: input.value };
    handle.setPointerCapture(pointer.pointerId);
    handle.setAttribute("data-dragging", "true");
  });
  handle.addEventListener("pointermove", event => {
    const pointer = event as PointerEvent;
    if (drag && pointer.pointerId === drag.pointer) preview(drag.value + (pointer.clientX - drag.x) / 4 * stepValue(pointer));
  });
  const finish = (cancel: boolean): void => {
    if (!drag) return;
    const previous = drag;
    drag = null;
    handle.setAttribute("data-dragging", "false");
    if (typeof handle.hasPointerCapture === "function" && handle.hasPointerCapture(previous.pointer)) handle.releasePointerCapture(previous.pointer);
    if (cancel) { input.value = previous.draft; validate(); options.onInput?.(read() ?? committed); }
    else commit();
  };
  handle.addEventListener("pointerup", () => finish(false));
  handle.addEventListener("pointercancel", () => finish(true));
  handle.addEventListener("lostpointercapture", () => finish(true));
  field.control.appendChild(handle);
  field.control.appendChild(input);
  if (options.unit) field.control.appendChild(createElement(doc, "span", "ch-field__unit", options.unit));
  validate();
  return field.root;
}

export interface AnchorGridOptions {
  /** Um dos nove valores; o botão correspondente fica marcado. */
  value: string;
  labels: ReadonlyArray<{ value: string; label: string }>;
  disabled?: boolean;
  onSelect(value: string): void;
}

/**
 * Grade 3×3 de seleção, pedida pela §14.2 do spec.
 *
 * Um select de nove itens diria a mesma coisa e ocuparia menos espaço, mas
 * esconderia a geometria: aqui a posição do botão **é** a informação, e ler
 * "superior esquerdo" numa lista custa mais que ver o canto.
 *
 * `radiogroup` em vez de nove botões soltos: o leitor de tela anuncia o
 * conjunto e a posição dentro dele, e as setas navegam a grade.
 */
/**
 * A §14.2 fixa a grade em três colunas, e é isso que dá sentido às setas
 * verticais: elas andam de linha, não de item.
 */
const ANCHOR_GRID_COLUMNS = 3;

export function anchorGrid(doc: Document, options: AnchorGridOptions): HTMLElement {
  const grade = createElement(doc, "div", "ch-anchor-grid");
  grade.setAttribute("role", "radiogroup");

  const celulas: HTMLButtonElement[] = [];
  const total = options.labels.length;
  // Sem correspondência a primeira célula é a tabulável: um radiogroup em que
  // nenhum item aceita foco é um controle que o teclado não alcança.
  const marcadoEm = options.labels.findIndex((item) => item.value === options.value);
  const tabulavelEm = marcadoEm === -1 ? 0 : marcadoEm;

  /**
   * Move foco e seleção juntos, que é o contrato do `radiogroup`: dentro de um
   * grupo de rádio a seta escolhe, não apenas passeia.
   *
   * O foco vai antes do `onSelect` de propósito. O callback costuma redesenhar
   * a view e descartar estas células; ao focar antes, o shell encontra a chave
   * de foco já na célula de destino e a restaura no nó reconstruído.
   */
  function move(destino: number): void {
    const item = options.labels[destino];
    const celula = celulas[destino];
    if (!item || !celula) {
      return;
    }
    for (const [indice, candidata] of celulas.entries()) {
      candidata.setAttribute("tabindex", indice === destino ? "0" : "-1");
    }
    celula.focus();
    options.onSelect(item.value);
  }

  for (const [indice, item] of options.labels.entries()) {
    const marcado = item.value === options.value;
    const celula = createElement(
      doc,
      "button",
      marcado ? "ch-anchor-grid__cell is-active" : "ch-anchor-grid__cell"
    ) as HTMLButtonElement;
    celula.setAttribute("type", "button");
    celula.setAttribute("role", "radio");
    celula.setAttribute("aria-checked", marcado ? "true" : "false");
    // O rótulo textual não cabe numa célula de grade, então vive no nome
    // acessível: sem ele o leitor de tela anunciaria nove botões idênticos.
    celula.setAttribute("aria-label", item.label);
    // Roving tabindex: o grupo inteiro é uma parada de Tab, e as setas andam
    // dentro dele. Nove paradas atravessariam o painel a golpe de Tab.
    celula.setAttribute("tabindex", indice === tabulavelEm ? "0" : "-1");
    celula.setAttribute("data-focus-key", `anchor-cell-${item.value}`);
    celula.title = item.label;
    if (options.disabled) {
      celula.disabled = true;
      celula.setAttribute("aria-disabled", "true");
    }
    celula.appendChild(createElement(doc, "span", "ch-anchor-grid__dot"));
    celula.addEventListener("click", () => options.onSelect(item.value));
    celula.addEventListener("keydown", (event) => {
      if (options.disabled || total === 0) {
        return;
      }
      const key = (event as KeyboardEvent).key;
      let destino: number;

      if (key === "ArrowRight") {
        destino = (indice + 1) % total;
      } else if (key === "ArrowLeft") {
        destino = (indice - 1 + total) % total;
      } else if (key === "ArrowDown") {
        destino = (indice + ANCHOR_GRID_COLUMNS) % total;
      } else if (key === "ArrowUp") {
        destino = (indice - ANCHOR_GRID_COLUMNS + total * ANCHOR_GRID_COLUMNS) % total;
      } else if (key === "Home") {
        destino = 0;
      } else if (key === "End") {
        destino = total - 1;
      } else {
        // Tab e tudo o mais pertencem ao painel, não ao grupo.
        return;
      }

      event.preventDefault();
      move(destino);
    });
    celulas.push(celula);
    grade.appendChild(celula);
  }

  return grade;
}

export interface TextFieldOptions extends FieldBaseOptions {
  value: string;
  /** Teto de caracteres. O host valida de novo; isto só evita digitação inútil. */
  maxLength: number;
  placeholder?: string;
  onCommit(value: string): void;
}

/**
 * Campo de texto livre.
 *
 * Confirma em `change`, e não em `input`: os consumidores disparam trabalho a
 * cada confirmação — uma prévia que fala com o host, por exemplo — e reagir a
 * cada tecla faria uma ida ao host por caractere digitado.
 */
export function textField(doc: Document, options: TextFieldOptions): HTMLElement {
  const field = fieldRoot(doc, options);
  const input = createElement(doc, "input", "ch-text") as HTMLInputElement;
  input.type = "text";
  input.value = options.value;
  input.maxLength = options.maxLength;
  input.setAttribute("spellcheck", "false");
  if (options.placeholder) {
    input.setAttribute("placeholder", options.placeholder);
  }
  applyFieldState(input, options);

  input.addEventListener("change", () => options.onCommit(input.value));
  field.control.appendChild(input);
  return field.root;
}

export interface SearchFieldOptions extends FieldBaseOptions {
  value: string;
  placeholder?: string;
  /** Defaults to a compact trigger; false preserves an always-visible field. */
  expandable?: boolean;
  /** Chamado a cada tecla. Só para filtro local — nunca para falar com o host. */
  onInput(value: string): void;
}

/**
 * Campo de busca que reage a cada tecla.
 *
 * É o oposto deliberado de `textField`, que confirma em `change` justamente
 * porque seus consumidores disparam trabalho a cada confirmação. Filtrar uma
 * lista já carregada não custa nada, e esperar o `change` faria o usuário
 * digitar às cegas até sair do campo.
 *
 * Quem consome isto **não pode** redesenhar a tela dentro de `onInput`: o
 * redesenho recria o input e o foco morre no meio da digitação. O filtro
 * mexe na visibilidade dos itens já montados.
 */
export function searchField(doc: Document, options: SearchFieldOptions): HTMLElement {
  const field = fieldRoot(doc, options);
  const input = createElement(doc, "input", "ch-search") as HTMLInputElement;

  // `type=search` some com o botão de limpar em runtime que não o suporta; o
  // fallback para `text` mantém o campo digitável em vez de virar um input
  // inerte de tipo desconhecido.
  input.type = "search";
  if (input.type !== "search") input.type = "text";

  input.value = options.value;
  input.setAttribute("spellcheck", "false");
  input.setAttribute("autocomplete", "off");
  if (options.placeholder) input.setAttribute("placeholder", options.placeholder);
  applyFieldState(input, options);

  field.control.appendChild(input);
  if (options.expandable === false) {
    input.addEventListener("input", () => options.onInput(input.value));
    return field.root;
  }
  field.root.className += " ch-field--search";
  field.control.setAttribute("data-motion", "field-expand");
  const trigger = createElement(doc, "button", "ch-search-trigger") as HTMLButtonElement;
  trigger.type = "button";
  trigger.setAttribute("aria-label", options.label);
  trigger.setAttribute("aria-controls", options.id);
  trigger.title = options.disabledReason ?? options.label;
  trigger.disabled = options.disabled === true;
  trigger.appendChild(createIcon(doc, "search"));
  trigger.appendChild(createElement(doc, "span", "ch-search-trigger__label", fieldEnglish(doc) ? "Search" : "Buscar"));
  field.control.removeChild(input);
  field.control.appendChild(trigger);
  field.control.appendChild(input);
  function expand(open: boolean, focus = false): void {
    field.root.setAttribute("data-expanded", String(open));
    trigger.setAttribute("aria-expanded", String(open));
    fieldHidden(input, !open);
    if (focus && open) input.focus();
  }
  trigger.addEventListener("click", () => { if (!options.disabled) expand(true, true); });
  const label = field.root.getElementsByTagName("label")[0];
  label?.addEventListener("click", () => { if (!options.disabled) expand(true, true); });
  input.addEventListener("input", () => { expand(true); options.onInput(input.value); });
  input.addEventListener("keydown", event => {
    if ((event as KeyboardEvent).key !== "Escape") return;
    event.preventDefault();
    if (input.value === "") expand(false);
    trigger.focus();
  });
  input.addEventListener("blur", () => { if (input.value === "") expand(false); });
  expand(options.value !== "");
  return field.root;
}

export interface ColorFieldOptions extends FieldBaseOptions {
  /** Sempre `#rrggbb` minusculo — a forma canonica aceita por `input[type=color]`. */
  value: string;
  onCommit(value: string): void;
}

const HEX_COLOR = /^#([0-9a-fA-F]{6})$/;

/**
 * Aceita `#rrggbb` com ou sem `#`, em qualquer caixa, e devolve a forma
 * canonica. Devolve `null` para qualquer outra coisa: o campo de texto de
 * fallback e digitavel, e digitacao livre nao pode virar cor silenciosamente.
 */
export function normalizeHexColor(value: string): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  const match = HEX_COLOR.exec(trimmed.charAt(0) === "#" ? trimmed : `#${trimmed}`);
  return match?.[1] ? `#${match[1].toLowerCase()}` : null;
}

/**
 * `input[type=color]` e a unica primitiva do shell que NAO esta na intersecao
 * verificada de CEP e UXP: no Chromium do CEP ela abre o seletor nativo, e no
 * UXP nao ha confirmacao de suporte. Por isso o tipo e sondado apos atribuido —
 * um `type` que nao gruda denuncia o host — e o campo cai para texto hex, que
 * continua editavel, em vez de virar um controle mudo.
 */
export function colorField(doc: Document, options: ColorFieldOptions): HTMLElement {
  const field = fieldRoot(doc, options);
  const input = createElement(doc, "input", "ch-color") as HTMLInputElement;
  input.type = "color";

  if (input.type !== "color") {
    input.type = "text";
    input.className = "ch-color ch-color--text";
    input.setAttribute("placeholder", "#rrggbb");
    input.setAttribute("spellcheck", "false");
  }

  input.value = options.value;
  applyFieldState(input, options);
  let committed = options.value;
  const error = createElement(doc, "div", "ch-field__error");
  error.id = `${options.id}-error`;
  error.setAttribute("role", "alert");
  fieldHidden(error, true);
  function validate(): string | null {
    const normalized = normalizeHexColor(input.value);
    const invalid = normalized === null;
    input.setAttribute("aria-invalid", String(invalid));
    input.setAttribute("aria-describedby", [options.description ? `${options.id}-description` : "", invalid ? error.id : ""].filter(Boolean).join(" "));
    error.textContent = invalid ? createI18n({ locale: doc.documentElement?.lang || "pt-BR" }).t("field.hexColor") : "";
    fieldHidden(error, !invalid);
    return normalized;
  }
  input.addEventListener("input", () => { if (!options.disabled) validate(); });
  input.addEventListener("change", () => {
    if (options.disabled) return;
    const normalized = validate();
    if (normalized === null) return;
    input.value = normalized;
    if (normalized === committed) return;
    committed = normalized;
    options.onCommit(normalized);
  });
  input.addEventListener("keydown", event => {
    if ((event as KeyboardEvent).key !== "Escape" || options.disabled) return;
    event.preventDefault();
    input.value = committed;
    validate();
  });

  field.control.appendChild(input);
  field.root.appendChild(error);
  return field.root;
}

export function checkboxField(doc: Document, options: CheckboxFieldOptions): HTMLElement {
  const field = fieldRoot(doc, options);
  field.root.className += " ch-field--checkbox";
  const input = createElement(doc, "input", "ch-checkbox") as HTMLInputElement;
  input.type = "checkbox";
  input.checked = options.checked;
  applyFieldState(input, options);
  input.addEventListener("change", () => { if (!options.disabled) options.onChange(input.checked); });
  field.control.appendChild(input);
  return field.root;
}

interface ButtonBaseOptions {
  label: string;
  variant?: "primary" | "secondary" | "tertiary" | "ghost" | "destructive";
  title?: string;
  onClick?: () => void;
}

/**
 * `disabledReason` e obrigatorio para `disabled: true` literal. Quando o estado
 * vem de um booleano dinamico, o runtime ainda garante um tooltip seguro.
 */
export type ButtonOptions<Disabled extends boolean = boolean> = ButtonBaseOptions & {
  disabled?: Disabled;
} & (Disabled extends true ? { disabledReason: string } : { disabledReason?: string });

export function button<Disabled extends boolean = false>(
  doc: Document,
  options: ButtonOptions<Disabled>
): HTMLButtonElement {
  const className = options.variant ? `ch-button ch-button--${options.variant}` : "ch-button";
  const node = createElement(doc, "button", className, options.label) as HTMLButtonElement;

  node.setAttribute("type", "button");
  node.setAttribute("data-motion", "button-press");
  node.title = options.disabled
    ? options.disabledReason ?? options.title ?? options.label
    : options.title ?? options.label;

  if (options.disabled) {
    node.disabled = true;
  }
  if (options.onClick) {
    node.addEventListener("click", () => {
      // Native disabled is authoritative, including consumers that enable the
      // button after inspection. Redundant ARIA would retain an obsolete state.
      if (!node.disabled) options.onClick?.();
    });
  }

  return node;
}

export type NoticeTone = "error" | "warning";

export function notice(doc: Document, message: string, tone?: NoticeTone): HTMLElement {
  const node = createElement(doc, "div", tone ? `ch-notice ch-notice--${tone}` : "ch-notice", message);
  // Erro interrompe o leitor de tela; aviso e informação esperam a pausa.
  node.setAttribute("role", tone === "error" ? "alert" : "status");
  node.setAttribute("data-motion", "context-alert");
  return node;
}

export function logLine(doc: Document, text: string, level?: "warn" | "error"): HTMLElement {
  return createElement(doc, "div", level ? `ch-log ch-log--${level}` : "ch-log", text);
}

export interface ShellView {
  /** Additional primary workspace in the library shell. */
  primary?: boolean;
  /** Routable from a settings/help action, excluded from the workspace navigation. */
  utilityOnly?: boolean;
  id: string;
  labelKey: MessageKey;
  titleKey: MessageKey;
}

export interface RenderRegions {
  content: HTMLElement;
  actions: HTMLElement;
  /**
   * O próprio shell.
   *
   * Vai junto porque o **primeiro** render acontece dentro de `createShell`,
   * antes de quem chamou ter a referência de retorno. Sem isso, um callback que
   * mexesse no shell durante o primeiro render leria `null` — e a exceção
   * derrubaria a inicialização inteira do painel, com o shell já montado na
   * tela: o painel parece pronto e nenhum botão responde.
   */
  shell: Shell;
}

export interface Shell {
  element(): HTMLElement;
  contentElement(): HTMLElement;
  actionsElement(): HTMLElement;
  activeView(): string;
  navigate(viewId: string): void;
  rerender(): void;
  /** Update labels/context without rebuilding fields or discarding their drafts. */
  refreshChrome(): void;
  /** Visual operation state; the caller still owns command concurrency. */
  setBusy(busy: boolean): void;
  setWidth(width: number): WidthClass;
  widthClass(): WidthClass;
  setStatus(message: string, state?: StatusState): void;
  /**
   * Substitui o título da view atual.
   *
   * Existe para o navegador de ferramentas: quando uma ferramenta está aberta, o
   * título precisa ser o nome dela, e não "Ferramentas". A §22 coloca o título
   * da ferramenta ativa como primeiro item da hierarquia — deixá-lo genérico
   * obrigaria o usuário a olhar a grade para lembrar onde está.
   *
   * O próximo `rerender` devolve o título declarado pela view.
   */
  setViewTitle(text: string): void;
  /** Observa a largura do painel. Devolve o cancelador para o ciclo de vida. */
  observeWidth(target: Window): () => void;
}

export interface ShellOptions {
  mount: HTMLElement;
  document: Document;
  i18n: I18n;
  subtitleKey: MessageKey;
  views: ShellView[];
  initialWidth?: number;
  layout?: "library";
  toolContext?(): string | null;
  onStatus?(message: string, state?: StatusState): void;
  onRender(viewId: string, regions: RenderRegions): void;
}

export function createShell(options: ShellOptions): Shell {
  const doc = options.document;
  const { i18n, views } = options;
  const instanceId = `ch-shell-${++shellSequence}`;
  const panelId = `${instanceId}-panel`;

  const buttons = new Map<string, HTMLElement>();
  let activeId = views[0]?.id ?? "";
  let widthClass: WidthClass | "" = "";
  let renderedView = "";

  const shellNode = createElement(doc, "div", "ch-shell");
  if (options.layout) shellNode.setAttribute("data-layout", options.layout);

  const header = createElement(doc, "header", "ch-header");
  header.appendChild(createElement(doc, "div", "ch-header__title", i18n.t("app.title")));
  const subtitle = createElement(doc, "div", "ch-header__subtitle", i18n.t(options.subtitleKey));
  header.appendChild(subtitle);
  shellNode.appendChild(header);

  const nav = createElement(doc, "nav", "ch-nav");
  nav.setAttribute("role", options.layout === "library" ? "navigation" : "tablist");
  shellNode.appendChild(nav);
  const libraryLayout = options.layout === "library";
  const primaryNav = libraryLayout ? createElement(doc, "div", "ch-nav__primary") : nav;
  const utilities = createElement(doc, "div", "ch-nav__utilities");
  const overflow = createElement(doc, "div", "ch-nav__overflow");
  overflow.id = `${instanceId}-utilities`;
  fieldHidden(overflow, true);
  overflow.setAttribute("data-motion", "surface-morph");
  overflow.setAttribute("data-open", "false");
  const more = createElement(doc, "button", "ch-nav__more");
  more.setAttribute("type", "button");
  more.setAttribute("aria-controls", overflow.id);
  more.setAttribute("aria-expanded", "false");
  more.appendChild(createIcon(doc, "more"));
  if (libraryLayout) {
    primaryNav.setAttribute("role", "tablist");
    nav.appendChild(primaryNav);
    nav.appendChild(utilities);
    utilities.appendChild(more);
    utilities.appendChild(overflow);
  }
  function closeOverflow(restoreFocus = false): void {
    fieldHidden(overflow, true);
    overflow.setAttribute("data-open", "false");
    more.setAttribute("aria-expanded", "false");
    if (restoreFocus) more.focus();
  }
  more.addEventListener("click", () => {
    fieldHidden(overflow, !overflow.hidden);
    overflow.setAttribute("data-open", String(!overflow.hidden));
    more.setAttribute("aria-expanded", String(!overflow.hidden));
    if (!overflow.hidden) (overflow.children[0] as HTMLElement | undefined)?.focus();
  });
  shellNode.addEventListener("keydown", event => {
    if (libraryLayout && (event as KeyboardEvent).key === "Escape" && !overflow.hidden) {
      event.preventDefault();
      closeOverflow(true);
    }
  });
  shellNode.addEventListener("click", event => {
    if (!overflow.hidden && event.target !== more && !contem(more, event.target as Element) && !contem(overflow, event.target as Element)) closeOverflow();
  });
  utilities.addEventListener("focusout", event => {
    const next = (event as FocusEvent).relatedTarget as Element | null;
    if (!next || !contem(utilities, next)) closeOverflow();
  });

  const toolContextRow = createElement(doc, "div", "ch-tool-context");
  const backToLibrary = button(doc, { label: "", onClick: () => { navigate("home"); buttons.get("home")?.focus(); } });
  backToLibrary.className = "ch-context-back";
  backToLibrary.appendChild(createIcon(doc, "back"));
  const backLabel = createElement(doc, "span", "", ""); backToLibrary.appendChild(backLabel);
  toolContextRow.appendChild(backToLibrary);
  fieldHidden(toolContextRow, true);
  if (libraryLayout) shellNode.appendChild(toolContextRow);
  const viewTitle = createElement(doc, "div", "ch-view-title", "");
  viewTitle.id = `${instanceId}-view-title`;
  shellNode.appendChild(viewTitle);

  const content = createElement(doc, "div", "ch-content");
  content.setAttribute("id", panelId);
  content.setAttribute("role", "tabpanel");
  shellNode.appendChild(content);

  const actions = createElement(doc, "div", "ch-actions");
  shellNode.appendChild(actions);

  // Status and verification info removed for premium layout.
  shellNode.setAttribute("aria-busy", "true");

  const indicator = libraryLayout ? createElement(doc, "span", "ch-nav__indicator") : null;
  if (indicator) {
    indicator.setAttribute("aria-hidden", "true");
    indicator.setAttribute("data-motion", "tab-indicator");
    primaryNav.appendChild(indicator);
  }
  function updateIndicator(): void {
    if (!indicator) return;
    const active = buttons.get(libraryLayout && activeId === "tools" ? "home" : activeId);
    if (!active || active.hidden || active.parentNode !== primaryNav || !active.offsetWidth || !indicator.style
        || ![active.offsetHeight, active.offsetLeft, active.offsetTop].every(Number.isFinite)) {
      fieldHidden(indicator, true);
      primaryNav.setAttribute("data-indicator", "false");
      return;
    }
    fieldHidden(indicator, false);
    primaryNav.setAttribute("data-indicator", "true");
    indicator.style.width = `${active.offsetWidth}px`;
    indicator.style.height = `${active.offsetHeight}px`;
    indicator.style.transform = `translate(${active.offsetLeft}px, ${active.offsetTop}px)`;
  }

  function applyActiveState(): void {
    for (const [id, node] of buttons) {
      const isActive = id === activeId || libraryLayout && id === "home" && activeId === "tools";
      node.className = isActive ? "ch-nav__item is-active" : "ch-nav__item";
      if (node.getAttribute("role") === "tab") {
        node.setAttribute("aria-selected", isActive ? "true" : "false");
        const fallback = libraryLayout && id === "home" && activeId !== "tools" && !views.some(view => view.id === activeId && (view.primary || ["home", "presets"].includes(view.id)));
        node.setAttribute("tabindex", isActive || fallback ? "0" : "-1");
      } else node.setAttribute("aria-pressed", String(isActive));
    }
    updateIndicator();
  }

  function currentView(): ShellView | undefined {
    return views.find((view) => view.id === activeId);
  }

  /**
   * O elemento focado está dentro da subárvore que o `render` vai descartar?
   *
   * Varredura manual em vez de `Node.contains`: este shell também roda no UXP,
   * que implementa um pedaço do DOM, e o DOM falso dos testes existe justamente
   * para travar esse subconjunto.
   */
  function contem(raiz: Element, alvo: Element): boolean {
    for (let i = 0; i < raiz.children.length; i += 1) {
      const filho = raiz.children[i];
      if (!filho) {
        continue;
      }
      if (filho === alvo || contem(filho, alvo)) {
        return true;
      }
    }
    return false;
  }

  function buscaPorChave(raiz: Element, chave: string, atributo = "data-focus-key"): HTMLElement | null {
    for (let i = 0; i < raiz.children.length; i += 1) {
      const filho = raiz.children[i] as HTMLElement | undefined;
      if (!filho) {
        continue;
      }
      if (filho.getAttribute(atributo) === chave) {
        return filho;
      }
      const achado = buscaPorChave(filho, chave, atributo);
      if (achado) {
        return achado;
      }
    }
    return null;
  }

  function refreshChrome(): void {
    shellNode.setAttribute("data-view", activeId);
    const view = currentView();
    if (!view) {
      return;
    }

    subtitle.textContent = i18n.t(options.subtitleKey);
    for (const entry of views) {
      const node = buttons.get(entry.id);
      if (!node) continue;
      const toolName = libraryLayout && entry.id === "tools" ? options.toolContext?.() : null;
      if (libraryLayout && entry.id === "tools") fieldHidden(node, !toolName);
      const label = toolName ? i18n.t("library.adjustTool", { tool: toolName }) : i18n.t(entry.labelKey);
      const text = node.getElementsByTagName("span")[0];
      if (text) text.textContent = label;
      node.setAttribute("title", label);
      node.setAttribute("aria-label", label);
    }
    if (libraryLayout) {
      more.setAttribute("aria-label", i18n.t("library.more"));
      more.setAttribute("title", i18n.t("library.more"));
      primaryNav.setAttribute("aria-label", i18n.t("library.navigation"));
      backLabel.textContent = i18n.t(views.find(entry => entry.id === "home")!.labelKey);
      fieldHidden(toolContextRow, activeId !== "tools" || !options.toolContext?.());
    }
    viewTitle.textContent = i18n.t(view.titleKey);
    const activeTab = buttons.get(view.id);
    if (activeTab) {
      content.setAttribute("aria-labelledby", view.utilityOnly ? viewTitle.id : activeTab.getAttribute("id") ?? "");
    }

    applyActiveState();
    updateIndicator();
  }

  function render(): void {
    closeOpenDropdown(doc);
    refreshChrome();
    const view = currentView();
    if (!view) return;
    // Campos e ações são recriados no redesenho. Preserve o controle equivalente
    // na mesma região e view, sem transferir foco para outra tela na navegação.
    const ativo = doc.activeElement;
    const regiaoFoco = ativo && renderedView === view.id
      ? contem(content, ativo) ? content : contem(actions, ativo) ? actions : null
      : null;
    const chaveFoco =
      ativo && regiaoFoco
        ? (ativo.getAttribute("data-focus-key") ?? ativo.getAttribute("id"))
        : null;

    clearNode(content);
    content.removeAttribute("data-browser");
    clearNode(actions);
    let viewContent = content;
    if (options.layout === "library") {
      viewContent = createElement(doc, "div", "ch-view-body");
      viewContent.setAttribute("data-motion", "view-enter");
      viewContent.setAttribute("data-active", String(renderedView !== view.id));
      content.appendChild(viewContent);
    }
    renderedView = view.id;
    options.onRender(view.id, { content: viewContent, actions, shell });

    if (chaveFoco && regiaoFoco && activeId === view.id) {
      // A select's hidden native control may share its ID with the visible
      // trigger's focus key. Prefer explicit keys across the whole subtree.
      (buscaPorChave(regiaoFoco, chaveFoco) ?? buscaPorChave(regiaoFoco, chaveFoco, "id"))?.focus();
    }
  }

  function navigate(viewId: string): void {
    if (!overflow.hidden) closeOverflow(true);
    if (!viewId || viewId === activeId || !buttons.has(viewId)) {
      return;
    }
    closeOverflow();
    activeId = viewId;
    applyActiveState();
    render();
  }

  function setWidth(width: number): WidthClass {
    const next = resolveWidthClass(width);
    if (next === widthClass) {
      updateIndicator();
      return next;
    }

    widthClass = next;
    shellNode.className = `ch-shell ch-shell--${next}`;
    shellNode.setAttribute("data-width-class", next);
    updateIndicator();
    return next;
  }

  for (const [index, view] of views.entries()) {
    const label = i18n.t(view.labelKey);
    const item = createElement(doc, "button", "ch-nav__item");
    const tabId = `${instanceId}-tab-${index}`;

    item.setAttribute("type", "button");
    const isPrimary = !view.utilityOnly && (!libraryLayout || view.primary || ["home", "presets"].includes(view.id));
    if (isPrimary) item.setAttribute("role", "tab");
    item.setAttribute("data-view", view.id);
    item.setAttribute("id", tabId);
    item.setAttribute("aria-controls", panelId);
    item.appendChild(createIcon(doc, view.id));
    item.appendChild(createElement(doc, "span", "ch-nav__label", label));
    // O rótulo some no modo compacto; o nome acessível não pode sumir junto.
    item.setAttribute("title", label);
    item.setAttribute("aria-label", label);
    item.addEventListener("click", () => navigate(view.id));
    item.addEventListener("keydown", (event) => {
      const key = (event as KeyboardEvent).key;
      if (!isPrimary) return;
      const keyboardViews = libraryLayout ? views.filter(candidate => (candidate.primary || ["home", "presets"].includes(candidate.id)) && !buttons.get(candidate.id)?.hidden) : views;
      const currentIndex = keyboardViews.findIndex((candidate) => candidate.id === view.id);
      let nextIndex: number;

      if (key === "ArrowRight") {
        nextIndex = (currentIndex + 1) % keyboardViews.length;
      } else if (key === "ArrowLeft") {
        nextIndex = (currentIndex - 1 + keyboardViews.length) % keyboardViews.length;
      } else if (key === "Home") {
        nextIndex = 0;
      } else if (key === "End") {
        nextIndex = keyboardViews.length - 1;
      } else {
        return;
      }

      event.preventDefault();
      const nextView = keyboardViews[nextIndex];
      if (!nextView) {
        return;
      }
      navigate(nextView.id);
      buttons.get(nextView.id)?.focus();
    });

    buttons.set(view.id, item);
    if (view.utilityOnly) {
      fieldHidden(item, true);
      continue;
    }
    if (!libraryLayout) nav.appendChild(item);
    else if (isPrimary) primaryNav.appendChild(item);
    else if (view.id === "tools") toolContextRow.appendChild(item);
    else if (view.id === "settings") {
      // Append before the overflow trigger without requiring insertBefore in UXP.
      utilities.removeChild(more);
      utilities.removeChild(overflow);
      utilities.appendChild(item);
      utilities.appendChild(more);
      utilities.appendChild(overflow);
    } else overflow.appendChild(item);
  }

  if (libraryLayout) fieldHidden(more, !views.some(view => !view.utilityOnly && !view.primary && !["home", "presets", "tools", "settings"].includes(view.id)));

  const shell: Shell = {
    element: () => shellNode,
    contentElement: () => content,
    actionsElement: () => actions,
    activeView: () => activeId,
    navigate,
    rerender: render,
    refreshChrome,
    setBusy(busy) {
      shellNode.setAttribute("aria-busy", String(busy));
      shellNode.setAttribute("data-busy", String(busy));
      actions.setAttribute("aria-busy", String(busy));
    },
    setWidth,
    widthClass: () => (widthClass === "" ? resolveWidthClass(undefined) : widthClass),

    setViewTitle(text) {
      viewTitle.textContent = text;
    },

    setStatus(message, state) {
      // The footer DOM has been removed to maintain a clean layout,
      // but we still trigger busy states and callbacks for functional correctness.
      shell.setBusy(state === "busy");
      options.onStatus?.(message, state);
    },

    observeWidth(target) {
      const apply = (): void => {
        setWidth(doc.documentElement?.clientWidth || target.innerWidth);
      };

      target.addEventListener("resize", apply);
      apply();

      return () => target.removeEventListener("resize", apply);
    }
  };

  clearNode(options.mount);
  options.mount.appendChild(shellNode);

  applyActiveState();
  setWidth(options.initialWidth ?? options.mount.offsetWidth ?? 360);
  render();

  return shell;
}
