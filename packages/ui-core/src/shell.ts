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
import type { I18n } from "./i18n.js";
import type { MessageKey } from "./locales.js";

/** Fronteiras da §22.3. 280 é a largura mínima de acoplamento suportada. */
export const COMPACT_MAX = 359;
export const STANDARD_MAX = 559;

const SVG_NS = "http://www.w3.org/2000/svg";
let shellSequence = 0;

export type WidthClass = "compact" | "standard" | "wide";
export type StatusState = "ok" | "error" | "busy";

const ICON_PATHS: Record<string, string> = {
  context: "M3 4h12v3H3zM3 9h5v6H3zM10 9h5v6h-5z",
  tools: "M3 3.5h4.5V8H3zM10.5 3.5H15V8h-4.5zM3 10h4.5v4.5H3zM10.5 10H15v4.5h-4.5z",
  loopOut: "M5 5h7.5l-2-2M13 13H5.5l2 2M14 5a5 5 0 0 1 0 8M4 13a5 5 0 0 1 0-8",
  smooth: "M2.5 12.5c3.5 0 4-7 6.5-7s3 7 6.5 7",
  wiggle: "M2 9l2.5-4.5L7 13.5l2.5-9L12 13.5l2-4.5h2",
  flicker: "M9 2l-3.5 7h3L7 16l5-7.5H9L11 2z",
  textBox: "M2.5 5.5h13v7h-13zM5.5 8h5M5.5 10h3",
  parent: "M7 2.5h4v3H7zM9 5.5v2.5M4 8h10M4 8v2.5M14 8v2.5M2.5 10.5h3v3h-3zM12.5 10.5h3v3h-3z",
  createNull: "M5.5 5.5h7v7h-7zM9 2.5v3M9 12.5v3M2.5 9h3M12.5 9h3",
  flip: "M9 2.5v13M3 5.5h3.5v7H3zM15 5.5h-3.5v7H15z",
  rename: "M3 5.5h7M3 9h9M3 12.5h5M12 3.5l2.5 2.5-5 5-2.5.5.5-2.5z",
  reverseOrder: "M3.5 4.5h11M3.5 9h11M3.5 13.5h11M12 2.5l2 2-2 2M6 15.5l-2-2 2-2",
  cutKeys: "M9 2.5v13M5 6l-2.5 3 2.5 3M13 6l2.5 3-2.5 3",
  delay: "M2.5 5h4M2.5 9h7M2.5 13h10M13 3.5l2.5 2.5-2.5 2.5",
  anchor: "M9 3.5v11M3.5 9h11M9 6.5a2.5 2.5 0 1 1 0 5a2.5 2.5 0 1 1 0-5z",
  system: "M9 2.5l6 3.5v5l-6 3.5-6-3.5v-5zM6.5 8v2M11.5 8v2",
  diagnostics: "M3.5 4.5h11M3.5 9h11M3.5 13.5h7"
};

/** Marcadores distintos para runtimes que nao implementam SVG inline. */
const ICON_FALLBACKS: Record<string, string> = {
  context: "C",
  tools: "T",
  loopOut: "L",
  smooth: "~",
  wiggle: "W",
  flicker: "F",
  textBox: "[]",
  parent: "Y",
  createNull: "+",
  flip: "><",
  rename: "Aa",
  reverseOrder: "⇅",
  cutKeys: "✂",
  delay: "≫",
  anchor: "⊕",
  system: "S",
  diagnostics: "!"
};

export function resolveWidthClass(width: number | undefined): WidthClass {
  if (!width || width <= COMPACT_MAX) {
    return "compact";
  }
  return width <= STANDARD_MAX ? "standard" : "wide";
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

/**
 * Ícone da navegação.
 *
 * SVG inline quando o runtime suporta, glifo textual quando não. O UXP não
 * garante `createElementNS`, e uma navegação sem marcador visual em modo
 * compacto — onde o rótulo está oculto — deixaria três botões idênticos.
 */
function createIcon(doc: Document, name: string): Element {
  const path = ICON_PATHS[name];

  const fallback = (): HTMLElement => {
    const glyph = createElement(doc, "span", "ch-nav__glyph", ICON_FALLBACKS[name] ?? "?");
    glyph.setAttribute("aria-hidden", "true");
    return glyph;
  };

  if (!path || typeof doc.createElementNS !== "function") {
    return fallback();
  }

  try {
    const svg = doc.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 18 18");
    svg.setAttribute("width", "16");
    svg.setAttribute("height", "16");
    // O ícone é decorativo: o nome acessível do botão vem do rótulo e do title.
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");

    const shape = doc.createElementNS(SVG_NS, "path");
    shape.setAttribute("d", path);
    shape.setAttribute("fill", "none");
    shape.setAttribute("stroke", "currentColor");
    shape.setAttribute("stroke-width", "1.4");
    shape.setAttribute("stroke-linejoin", "round");
    shape.setAttribute("stroke-linecap", "round");

    svg.appendChild(shape);
    return svg;
  } catch {
    return fallback();
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
  onSelect(): void;
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
  tile.title = options.description ?? options.label;

  const glyph = createElement(doc, "span", "ch-tool__icon");
  glyph.appendChild(createIcon(doc, options.id));
  tile.appendChild(glyph);
  tile.appendChild(createElement(doc, "span", "ch-tool__label", options.label));

  tile.addEventListener("click", options.onSelect);
  return tile;
}

/** Grade de ferramentas. O número de colunas é decidido pelo CSS, por largura. */
export function toolGrid(doc: Document, tiles: readonly HTMLElement[]): HTMLElement {
  const grid = createElement(doc, "div", "ch-tool-grid");
  grid.setAttribute("role", "list");

  for (const tile of tiles) {
    const item = createElement(doc, "div", "ch-tool-grid__item");
    item.setAttribute("role", "listitem");
    item.appendChild(tile);
    grid.appendChild(item);
  }

  return grid;
}

interface FieldBaseOptions {
  id: string;
  label: string;
  description?: string;
  disabled?: boolean;
  disabledReason?: string;
}

export interface SelectFieldOption {
  value: string;
  label: string;
}

export interface SelectFieldOptions extends FieldBaseOptions {
  value: string;
  options: readonly SelectFieldOption[];
  onChange(value: string): void;
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

/** Campo select nativo, mantido pequeno para funcionar igualmente em CEP e UXP. */
export function selectField(doc: Document, options: SelectFieldOptions): HTMLElement {
  const field = fieldRoot(doc, options);
  const select = createElement(doc, "select", "ch-select") as HTMLSelectElement;
  applyFieldState(select, options);

  for (const item of options.options) {
    const option = createElement(doc, "option", undefined, item.label) as HTMLOptionElement;
    option.value = item.value;
    option.selected = item.value === options.value;
    select.appendChild(option);
  }

  select.value = options.value;
  select.addEventListener("change", () => options.onChange(select.value));
  field.control.appendChild(select);
  return field.root;
}

/** Campo numérico preciso; `input` atualiza o draft e `change` confirma o valor. */
export function numberField(doc: Document, options: NumberFieldOptions): HTMLElement {
  const field = fieldRoot(doc, options);
  const input = createElement(doc, "input", "ch-number") as HTMLInputElement;
  input.type = "number";
  input.value = String(options.value);
  input.min = String(options.min);
  input.max = String(options.max);
  input.step = String(options.step);
  applyFieldState(input, options);

  const read = (): number => Number(input.value);
  if (options.onInput) {
    input.addEventListener("input", () => options.onInput?.(read()));
  }
  input.addEventListener("change", () => options.onCommit(read()));

  field.control.appendChild(input);
  if (options.unit) {
    field.control.appendChild(createElement(doc, "span", "ch-field__unit", options.unit));
  }
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
export function anchorGrid(doc: Document, options: AnchorGridOptions): HTMLElement {
  const grade = createElement(doc, "div", "ch-anchor-grid");
  grade.setAttribute("role", "radiogroup");

  for (const item of options.labels) {
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
    celula.title = item.label;
    if (options.disabled) {
      celula.disabled = true;
      celula.setAttribute("aria-disabled", "true");
    }
    celula.appendChild(createElement(doc, "span", "ch-anchor-grid__dot"));
    celula.addEventListener("click", () => options.onSelect(item.value));
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
  input.addEventListener("change", () => {
    const normalized = normalizeHexColor(input.value);
    if (normalized === null) {
      input.value = options.value;
      return;
    }
    input.value = normalized;
    options.onCommit(normalized);
  });

  field.control.appendChild(input);
  return field.root;
}

export function checkboxField(doc: Document, options: CheckboxFieldOptions): HTMLElement {
  const field = fieldRoot(doc, options);
  const input = createElement(doc, "input", "ch-checkbox") as HTMLInputElement;
  input.type = "checkbox";
  input.checked = options.checked;
  applyFieldState(input, options);
  input.addEventListener("change", () => options.onChange(input.checked));
  field.control.appendChild(input);
  return field.root;
}

interface ButtonBaseOptions {
  label: string;
  variant?: "primary";
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
  node.title = options.disabled
    ? options.disabledReason ?? options.title ?? options.label
    : options.title ?? options.label;

  if (options.disabled) {
    node.disabled = true;
    node.setAttribute("aria-disabled", "true");
  }
  if (options.onClick) {
    node.addEventListener("click", options.onClick);
  }

  return node;
}

export type NoticeTone = "error" | "warning";

export function notice(doc: Document, message: string, tone?: NoticeTone): HTMLElement {
  const node = createElement(doc, "div", tone ? `ch-notice ch-notice--${tone}` : "ch-notice", message);
  // Erro interrompe o leitor de tela; aviso e informação esperam a pausa.
  node.setAttribute("role", tone === "error" ? "alert" : "status");
  return node;
}

export function logLine(doc: Document, text: string, level?: "warn" | "error"): HTMLElement {
  return createElement(doc, "div", level ? `ch-log ch-log--${level}` : "ch-log", text);
}

export interface ShellView {
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

  const shellNode = createElement(doc, "div", "ch-shell");

  const header = createElement(doc, "header", "ch-header");
  header.appendChild(createElement(doc, "div", "ch-header__title", i18n.t("app.title")));
  header.appendChild(createElement(doc, "div", "ch-header__subtitle", i18n.t(options.subtitleKey)));
  shellNode.appendChild(header);

  const nav = createElement(doc, "nav", "ch-nav");
  nav.setAttribute("role", "tablist");
  shellNode.appendChild(nav);

  const viewTitle = createElement(doc, "div", "ch-view-title", "");
  shellNode.appendChild(viewTitle);

  const content = createElement(doc, "div", "ch-content");
  content.setAttribute("id", panelId);
  content.setAttribute("role", "tabpanel");
  shellNode.appendChild(content);

  const actions = createElement(doc, "div", "ch-actions");
  shellNode.appendChild(actions);

  const status = createElement(doc, "div", "ch-status");
  status.setAttribute("aria-live", "polite");
  const statusDot = createElement(doc, "span", "ch-status__dot");
  const statusText = createElement(doc, "span", "ch-status__text", i18n.t("status.initializing"));
  status.appendChild(statusDot);
  status.appendChild(statusText);
  status.setAttribute("title", i18n.t("status.initializing"));
  shellNode.appendChild(status);
  shellNode.setAttribute("aria-busy", "true");

  function applyActiveState(): void {
    for (const [id, node] of buttons) {
      const isActive = id === activeId;
      node.className = isActive ? "ch-nav__item is-active" : "ch-nav__item";
      node.setAttribute("aria-selected", isActive ? "true" : "false");
      node.setAttribute("tabindex", isActive ? "0" : "-1");
    }
  }

  function currentView(): ShellView | undefined {
    return views.find((view) => view.id === activeId);
  }

  function render(): void {
    const view = currentView();
    if (!view) {
      return;
    }

    viewTitle.textContent = i18n.t(view.titleKey);
    const activeTab = buttons.get(view.id);
    if (activeTab) {
      content.setAttribute("aria-labelledby", activeTab.getAttribute("id") ?? "");
    }
    clearNode(content);
    clearNode(actions);
    options.onRender(view.id, { content, actions, shell });
  }

  function navigate(viewId: string): void {
    if (!viewId || viewId === activeId || !buttons.has(viewId)) {
      return;
    }
    activeId = viewId;
    applyActiveState();
    render();
  }

  function setWidth(width: number): WidthClass {
    const next = resolveWidthClass(width);
    if (next === widthClass) {
      return next;
    }

    widthClass = next;
    shellNode.className = `ch-shell ch-shell--${next}`;
    shellNode.setAttribute("data-width-class", next);
    return next;
  }

  for (const [index, view] of views.entries()) {
    const label = i18n.t(view.labelKey);
    const item = createElement(doc, "button", "ch-nav__item");
    const tabId = `${instanceId}-tab-${index}`;

    item.setAttribute("type", "button");
    item.setAttribute("role", "tab");
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
      const currentIndex = views.findIndex((candidate) => candidate.id === view.id);
      let nextIndex: number;

      if (key === "ArrowRight") {
        nextIndex = (currentIndex + 1) % views.length;
      } else if (key === "ArrowLeft") {
        nextIndex = (currentIndex - 1 + views.length) % views.length;
      } else if (key === "Home") {
        nextIndex = 0;
      } else if (key === "End") {
        nextIndex = views.length - 1;
      } else {
        return;
      }

      event.preventDefault();
      const nextView = views[nextIndex];
      if (!nextView) {
        return;
      }
      navigate(nextView.id);
      buttons.get(nextView.id)?.focus();
    });

    buttons.set(view.id, item);
    nav.appendChild(item);
  }

  const shell: Shell = {
    element: () => shellNode,
    contentElement: () => content,
    actionsElement: () => actions,
    activeView: () => activeId,
    navigate,
    rerender: render,
    setWidth,
    widthClass: () => (widthClass === "" ? resolveWidthClass(undefined) : widthClass),

    setViewTitle(text) {
      viewTitle.textContent = text;
    },

    setStatus(message, state) {
      statusDot.className = state ? `ch-status__dot is-${state}` : "ch-status__dot";
      statusText.textContent = message;
      status.setAttribute("title", message);
      shellNode.setAttribute("aria-busy", state === "busy" ? "true" : "false");
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
