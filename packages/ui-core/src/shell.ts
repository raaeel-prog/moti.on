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
  system: "M9 2.5l6 3.5v5l-6 3.5-6-3.5v-5zM6.5 8v2M11.5 8v2",
  diagnostics: "M3.5 4.5h11M3.5 9h11M3.5 13.5h7"
};

/** Marcadores distintos para runtimes que nao implementam SVG inline. */
const ICON_FALLBACKS: Record<string, string> = {
  context: "C",
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
