import { button, createElement, createIcon, clearNode, createEmptyState, createI18n, type PanelPreferences } from "@motion/ui-core";
import { MOTION_CATALOG } from "@motion/ui-motion";
import { browserMotionEnv, playStagger, smoothScrollTo } from "./motion/index.js";
import { uiIcon } from "./ui-icons.js";

const TOOLTIP_EXIT_MS = MOTION_CATALOG.find(motion => motion.id === "tooltip-enter")!.durationMs[0]!;
const SURFACE_MS = MOTION_CATALOG.find(motion => motion.id === "surface-morph")!.durationMs[0]!;
const RIPPLE_MS = MOTION_CATALOG.find(motion => motion.id === "tile-ripple")!.durationMs[0]!;
/** Matches --delay-spinner / --delay-applied: fast commands never flash a spinner. */
const SPINNER_DELAY_MS = 150;
const APPLIED_MS = 700;
/** Only the first rows cascade; the rest arrive with the last step (A6.5: nothing animates off-screen). */
const CASCADE_MAX = 12;
const SVG_NS = "http://www.w3.org/2000/svg";

export type TileFeedback = "loading" | "success" | "idle";

export interface LibraryItem {
  id: string;
  name: string;
  description: string;
  aliases: string;
  category: string;
  interaction: "quick" | "configure" | "direct-control";
  reason: string | null;
  run(): void;
  edit(): void;
}
export interface LibraryState {
  category: string;
  scope: "all" | "favorites" | "recent";
  query: string;
  scroll: number;
}
export const LIBRARY_COPY = {
  "pt-BR": { allTools: "Todas as ferramentas", categories: "Categoria", more: "Mais categorias", all: "Todas", favorites: "Favoritos", favoritesOnly: "Só favoritas", recent: "Recentes", search: "Buscar ferramenta", apply: "Aplicar", edit: "Ajustes…", altClick: "Alt+clique", favorite: "Favoritar", unfavorite: "Remover dos favoritos", empty: "Nenhuma ferramenta encontrada.", quick: "Clique para aplicar", configure: "Abrir ajustes", anchor: "Escolha na grade de âncora", options: "Opções de", adjustOf: "Ajustes de", help: "Clique abre os ajustes · Botão direito: mais opções", details: "Detalhes", settings: "Ajustes…", keyClick: "Clique", keyClickQuick: "Aplica com os ajustes atuais", keyClickConfigure: "Abre os ajustes e a prévia", keyAdjust: "Alt+clique", keyAdjustText: "Abre os ajustes", keyContext: "Botão direito", keyContextText: "Favoritar e mais opções", collapse: "Recolher", expand: "Expandir", groupHint: "Alt+clique: todas as categorias" },
  "en-US": { allTools: "All tools", categories: "Category", more: "More categories", all: "All", favorites: "Favorites", favoritesOnly: "Favorites only", recent: "Recent", search: "Search tools", apply: "Apply", edit: "Settings…", altClick: "Alt+click", favorite: "Favorite", unfavorite: "Remove from favorites", empty: "No tools found.", quick: "Click to apply", configure: "Open settings", anchor: "Choose on the anchor grid", options: "Options for", adjustOf: "Settings for", help: "Click opens the settings · Right click: more options", details: "Details", settings: "Settings…", keyClick: "Click", keyClickQuick: "Applies with the current settings", keyClickConfigure: "Opens the settings and preview", keyAdjust: "Alt+click", keyAdjustText: "Opens the settings", keyContext: "Right click", keyContextText: "Favorite and more options", collapse: "Collapse", expand: "Expand", groupHint: "Alt+click: every category" }
};
export function normalizeSearch(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}
function contains(parent: HTMLElement, node: EventTarget | null): boolean {
  let current = node as Node | null;
  while (current) { if (current === parent) return true; current = current.parentNode; }
  return false;
}

/** CEP-only presentation. Commands remain callbacks owned by the composition root. */
export function createQuickLibrary(doc: Document, options: {
  items: LibraryItem[];
  categories: { id: string; name: string; icon: string }[];
  navigation: LibraryState;
  preferences: PanelPreferences;
  locale: string;
  anchor: HTMLElement;
  /** Mounted behind the sliding inspector or coming back from it: no entry cascade. */
  quietEntry?: boolean;
  onNavigate(): void;
}): { element: HTMLElement; update(items: LibraryItem[]): void; setFeedback(id: string, state: TileFeedback): void; dispose(): void } {
  const i18n = createI18n({ locale: options.locale });
  const copy = LIBRARY_COPY[i18n.locale() === "pt-BR" ? "pt-BR" : "en-US"];
  const nav = options.navigation;
  // Design system 2026-11: a coleção "Recentes" saiu da barra (sobrou a estrela de favoritas).
  // Um escopo antigo não pode virar filtro invisível sem controle para desfazê-lo.
  if (nav.scope === "recent") { nav.scope = "all"; nav.scroll = 0; options.onNavigate(); }
  let items = options.items;
  const itemMap = new Map(items.map(item => [item.id, item]));
  const element = createElement(doc, "div", "ch-quick-library ch-library-refined");
  const toolbar = createElement(doc, "div", "ch-quick-toolbar");
  const toolbarInner = createElement(doc, "div", "ch-library-toolbar-inner");
  toolbar.appendChild(toolbarInner);
  element.appendChild(toolbar);
  // Barra do design system: busca local, seletor de categoria e estrela de "só favoritas".
  // A busca do topo (Ctrl/Cmd+K) continua procurando em tudo; esta filtra só a grade.
  const search = createElement(doc, "label", "ch-library-search");
  search.appendChild(createIcon(doc, "search"));
  const searchInput = createElement(doc, "input", "ch-library-search__input") as HTMLInputElement;
  searchInput.id = "library-search";
  searchInput.type = "text";
  searchInput.value = nav.query;
  searchInput.setAttribute("placeholder", copy.search);
  searchInput.setAttribute("aria-label", copy.search);
  searchInput.setAttribute("spellcheck", "false");
  searchInput.setAttribute("autocomplete", "off");
  search.appendChild(searchInput);
  toolbarInner.appendChild(search);
  searchInput.addEventListener("input", () => {
    if (nav.query === searchInput.value) return;
    nav.query = searchInput.value; nav.scroll = 0; options.onNavigate(); draw();
  });
  searchInput.addEventListener("keydown", event => {
    const key = (event as KeyboardEvent).key;
    if (key === "Escape" && searchInput.value) { event.preventDefault(); event.stopPropagation?.(); searchInput.value = ""; nav.query = ""; options.onNavigate(); draw(); }
  });
  const filters = createElement(doc, "div", "ch-library-filters");
  toolbarInner.appendChild(filters);
  const categoryLabel = createElement(doc, "span", "ch-library-category-label");
  function dropdown(id: string, label: HTMLElement, icon: string | null, onClick: () => void): HTMLButtonElement {
    const node = button(doc, { label: "", onClick });
    node.className = "ch-button ch-library-select";
    node.id = id;
    if (icon) node.appendChild(createIcon(doc, icon));
    node.appendChild(label);
    const chevron = createElement(doc, "span", "ch-library-chevron");
    chevron.setAttribute("aria-hidden", "true");
    node.appendChild(chevron);
    node.setAttribute("aria-haspopup", "menu");
    node.setAttribute("aria-controls", "library-menu");
    node.setAttribute("aria-expanded", "false");
    node.addEventListener("keydown", event => {
      const key = (event as KeyboardEvent).key;
      if ((key === "ArrowDown" || key === "ArrowUp") && node.getAttribute("aria-expanded") !== "true") {
        event.preventDefault(); onClick();
      }
    });
    return node;
  }
  const categories = dropdown("library-category-select", categoryLabel, null, () => showFilters(categories));
  filters.appendChild(categories);
  const favoritesOnly = button(doc, { label: "", onClick: () => {
    nav.scope = nav.scope === "favorites" ? "all" : "favorites"; nav.scroll = 0;
    closeMenu(false, true); options.onNavigate(); draw();
  } });
  favoritesOnly.id = "library-favorites-only";
  favoritesOnly.className += " ch-library-star";
  favoritesOnly.setAttribute("aria-label", copy.favoritesOnly);
  favoritesOnly.title = copy.favoritesOnly;
  favoritesOnly.appendChild(createIcon(doc, "favorite"));
  filters.appendChild(favoritesOnly);
  // The visible title is the category menu; the heading stays for screen readers (count status).
  const heading = createElement(doc, "div", "ch-quick-heading ch-visually-hidden");
  const headingLabel = createElement(doc, "span", "");
  const countLabel = createElement(doc, "span", "ch-library-count");
  countLabel.setAttribute("role", "status");
  countLabel.setAttribute("aria-atomic", "true");
  heading.appendChild(headingLabel); heading.appendChild(countLabel);
  element.appendChild(heading);
  const grid = createElement(doc, "div", "ch-tool-grid");
  grid.setAttribute("aria-label", copy.allTools);
  grid.setAttribute("data-motion", "grid-stagger list-stagger");
  const motionEnv = browserMotionEnv(doc.defaultView, doc.documentElement);
  element.appendChild(grid);
  // Linha de estado (design system 2026-11): nome e descrição da ferramenta sob o cursor, sem esperar a dica.
  // Em repouso fica vazia de propósito: status permanente de seleção foi recusado como poluição.
  const status = createElement(doc, "div", "ch-tool-status");
  status.setAttribute("aria-hidden", "true");
  element.appendChild(status);
  showStatus(null);
  element.appendChild(options.anchor);
  // Coluna Detalhes: só aparece no layout amplo (CSS), no lugar do espaço vazio ao lado da grade.
  const details = createElement(doc, "aside", "ch-tool-details");
  details.setAttribute("aria-label", copy.details);
  element.appendChild(details);
  let detailId: string | null = null;
  let detailKey = "";
  function showStatus(id: string | null): void {
    clearNode(status);
    const item = id ? itemMap.get(id) : undefined;
    status.setAttribute("data-idle", String(!item));
    if (!item) { status.appendChild(createElement(doc, "span", "", copy.help)); return; }
    // Losango azul do estudo: marca a linha como "isto é o que está sob o cursor".
    if (typeof doc.createElementNS === "function") {
      const mark = doc.createElementNS(SVG_NS, "svg");
      mark.setAttribute("class", "ch-tool-status__mark"); mark.setAttribute("viewBox", "0 0 16 16"); mark.setAttribute("aria-hidden", "true");
      const shape = doc.createElementNS(SVG_NS, "path"); shape.setAttribute("d", "M8 2.5 13.5 8 8 13.5 2.5 8z"); shape.setAttribute("fill", "currentColor");
      mark.appendChild(shape); status.appendChild(mark);
    }
    status.appendChild(createElement(doc, "strong", "", item.name));
    status.appendChild(createElement(doc, "span", "", ` · ${item.reason ?? item.description}`));
  }
  function drawDetails(): void {
    const item = (detailId ? itemMap.get(detailId) : undefined) ?? items[0];
    if (!item) { clearNode(details); detailKey = ""; return; }
    const favorite = options.preferences.snapshot().favorites.includes(item.id);
    const key = [item.id, item.name, item.description, item.reason ?? "", item.interaction, favorite].join("|");
    if (key === detailKey) return;
    detailKey = key;
    clearNode(details);
    const heading = createElement(doc, "div", "ch-tool-details__heading");
    heading.appendChild(createElement(doc, "strong", "", copy.details));
    const body = createElement(doc, "div", "ch-tool-details__body");
    const identity = createElement(doc, "div", "ch-tool-details__identity");
    const glyph = createElement(doc, "span", "ch-tool-details__glyph");
    const icon = createIcon(doc, item.id);
    const family = icon.getAttribute("data-icon-family");
    if (family) glyph.setAttribute("data-icon-family", family);
    glyph.appendChild(icon);
    const names = createElement(doc, "div", "ch-tool-details__names");
    names.appendChild(createElement(doc, "strong", "", item.name));
    const category = options.categories.find(entry => entry.id === item.category)?.name;
    if (category) names.appendChild(createElement(doc, "span", "ch-tool-details__tag", category));
    identity.appendChild(glyph); identity.appendChild(names);
    body.appendChild(identity);
    body.appendChild(createElement(doc, "p", "ch-tool-details__text", item.description));
    if (item.reason) body.appendChild(createElement(doc, "p", "ch-tool-details__reason", item.reason));
    const keys = createElement(doc, "dl", "ch-tool-details__keys");
    const rows: [string, string][] = item.interaction === "configure"
      ? [[copy.keyClick, copy.keyClickConfigure], [copy.keyContext, copy.keyContextText]]
      : [[copy.keyClick, copy.keyClickQuick], [copy.keyAdjust, copy.keyAdjustText], [copy.keyContext, copy.keyContextText]];
    for (const [term, text] of rows) { keys.appendChild(createElement(doc, "dt", "", term)); keys.appendChild(createElement(doc, "dd", "", text)); }
    body.appendChild(keys);
    const footer = createElement(doc, "div", "ch-tool-details__actions");
    const fav = button(doc, { label: favorite ? copy.unfavorite : copy.favorite, variant: "tertiary", onClick: () => { options.preferences.toggleFavorite(item.id); draw(); } });
    fav.id = "library-details-favorite";
    const open = button(doc, { label: copy.settings, onClick: () => { hideTooltip(); closeMenu(false, true); itemMap.get(item.id)?.edit(); } });
    open.id = "library-details-settings";
    footer.appendChild(fav); footer.appendChild(open);
    details.appendChild(heading); details.appendChild(body); details.appendChild(footer);
  }
  function pointAt(id: string | null): void {
    showStatus(id);
    if (id && id !== detailId) { detailId = id; drawDetails(); }
  }
  const tooltip = createElement(doc, "div", "ch-quick-tooltip ch-library-tooltip");
  tooltip.id = "library-tooltip";
  tooltip.setAttribute("role", "tooltip");
  tooltip.hidden = true;
  tooltip.setAttribute("data-motion", "tooltip-enter");
  element.appendChild(tooltip);
  const menu = createElement(doc, "div", "ch-quick-menu ch-library-menu");
  menu.id = "library-menu";
  menu.setAttribute("role", "menu");
  menu.setAttribute("data-motion", "surface-morph");
  menu.hidden = true;
  element.appendChild(menu);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let exitTimer: ReturnType<typeof setTimeout> | undefined;
  let menuTimer: ReturnType<typeof setTimeout> | undefined;
  let alive = true;
  let tooltipOwner: HTMLElement | null = null;
  let tooltipShowsReason = false;
  let menuOwner: HTMLElement | null = null;
  let menuButtons: HTMLButtonElement[] = [];
  let menuOpen = false;
  let menuGridScroll = 0;
  let scrollFrame: number | undefined;
  let scrollVersion = 0;
  const tiles = new Map<string, { tile: HTMLElement; node: HTMLButtonElement; more: HTMLButtonElement; star: HTMLButtonElement }>();
  // Categorias recolhidas pela seta do título. Só valem na grade agrupada: busca e filtro mostram tudo.
  const collapsedGroups = new Set<string>(options.preferences.snapshot().collapsedToolGroups ?? []);
  const groupTitles = new Map<string, { title: HTMLElement; toggle: HTMLButtonElement; name: HTMLElement; count: HTMLElement }>();
  /** Categorias que acabaram de abrir: só os ladrilhos delas entram animados, a grade não recomeça a cascata. */
  let revealGroups: Set<string> | null = null;
  let poppedStar = "";
  let visibleIds: string[] = [];
  let renderedEmptyKey = "";
  let stopCascade: (() => void) | null = null;
  let quietEntry = options.quietEntry === true;
  /** Menu highlight that slides between options (selection-glide), instead of each row lighting up. */
  const menuGlide = createElement(doc, "span", "ch-library-menu__glide");
  menuGlide.setAttribute("aria-hidden", "true");
  menuGlide.setAttribute("data-motion", "selection-glide");
  let drawnQuery: string | null = null;
  const feedback = new Map<string, { spinner: Element; check: Element; dot: HTMLElement; timer?: ReturnType<typeof setTimeout> }>();

  function hideTooltip(animate = false): void {
    clearTimeout(timer); clearTimeout(exitTimer);
    tooltip.removeAttribute("data-open");
    tooltip.setAttribute("aria-hidden", "true");
    tooltipOwner?.removeAttribute("aria-describedby");
    tooltipOwner = null;
    tooltipShowsReason = false;
    if (animate && !tooltip.hidden) exitTimer = setTimeout(() => { tooltip.hidden = true; }, TOOLTIP_EXIT_MS);
    else tooltip.hidden = true;
  }
  function position(node: HTMLElement, owner: HTMLElement): void {
    if (typeof owner.getBoundingClientRect !== "function") return;
    const rect = owner.getBoundingClientRect();
    node.style.width = ""; node.style.height = "";
    const fixed = node === tooltip;
    const bounds = fixed ? {
      left: 0, top: 0, width: doc.documentElement.clientWidth,
      height: doc.documentElement.clientHeight
    } : element.getBoundingClientRect?.();
    if (!bounds) return;
    const { left: originLeft, top: originTop, width } = bounds;
    const height = fixed ? bounds.height : menuBottom(bounds.top, bounds.height);
    const desiredLeft = rect.left - originLeft + (fixed ? (rect.width - node.offsetWidth) / 2 : 0);
    const left = Math.max(6, Math.min(desiredLeft, width - node.offsetWidth - 6));
    const below = rect.bottom - originTop + 6;
    const placeBelow = below + node.offsetHeight <= height - 6;
    const top = Math.max(6, Math.min(placeBelow ? below : rect.top - originTop - node.offsetHeight - 6, height - node.offsetHeight - 6));
    node.style.left = `${left}px`; node.style.top = `${top}px`;
    node.style.transformOrigin = `${Math.max(0, Math.min(node.offsetWidth, rect.left + rect.width / 2 - originLeft - left))}px ${placeBelow ? "top" : "bottom"}`;
  }
  function tooltipContent(name: string, reason: string | null, family: string | null = null, detail: string | null = null): void {
    clearNode(tooltip);
    const title = createElement(doc, "strong", "", name);
    // A dot in the family color ties the name to the icon's palette.
    if (family) {
      const dot = createElement(doc, "i", "ch-library-tooltip__family");
      dot.setAttribute("aria-hidden", "true");
      dot.setAttribute("data-icon-family", family);
      title.insertBefore?.(dot, title.firstChild);
    }
    tooltip.appendChild(title);
    // O que a ferramenta faz e o que o clique faz. Sem isso o ícone sozinho
    // obrigava a abrir a ferramenta para descobrir.
    if (detail && !reason) tooltip.appendChild(createElement(doc, "span", "ch-library-tooltip__detail", detail));
    if (reason) tooltip.appendChild(createElement(doc, "span", "", reason));
  }
  function identify(node: HTMLElement, name: () => string, reason: () => string | null = () => null, detail: () => string | null = () => null): void {
    node.setAttribute("aria-label", name());
    const show = (includeReason = false) => {
      hideTooltip();
      timer = setTimeout(() => {
        if (!alive || menuOpen || !contains(element, node)) return;
        // A linha de estado já mostra nome e descrição do ladrilho; a dica só cobriria os vizinhos.
        if (node.parentElement?.className === "ch-tool-tile" && node.parentElement.firstChild === node && status.offsetHeight > 0) return;
        const unavailable = includeReason ? reason() : null;
        tooltipContent(name(), unavailable, node.getAttribute("data-icon-family"), detail());
        tooltip.hidden = false; tooltip.removeAttribute("aria-hidden");
        tooltipOwner = node; tooltipShowsReason = includeReason;
        node.setAttribute("aria-describedby", tooltip.id);
        position(tooltip, node);
        void tooltip.offsetWidth; tooltip.setAttribute("data-open", "true");
      }, 250);
    };
    node.addEventListener("mouseenter", () => show(true)); node.addEventListener("focus", () => show(true));
    node.addEventListener("mouseleave", () => hideTooltip(true)); node.addEventListener("blur", () => hideTooltip(true));
    node.addEventListener("click", () => { if (reason()) show(true); else hideTooltip(); });
  }
  function closeMenu(restoreFocus = false, immediately = false): void {
    const owner = menuOwner;
    clearTimeout(menuTimer);
    menuOpen = false; menuOwner = null;
    owner?.setAttribute("aria-expanded", "false");
    menu.removeAttribute("data-open"); menu.setAttribute("aria-hidden", "true");
    for (const node of menuButtons) node.tabIndex = -1;
    if (immediately) menu.hidden = true;
    else menuTimer = setTimeout(() => { menu.hidden = true; }, SURFACE_MS);
    if (restoreFocus) owner?.focus();
  }
  function openMenu(owner: HTMLElement): boolean {
    if (menuOpen && menuOwner === owner) { closeMenu(true); return false; }
    closeMenu(false, true); hideTooltip(); clearTimeout(menuTimer); clearNode(menu);
    menuButtons = []; menuOwner = owner; menuOpen = true;
    menuGridScroll = grid.scrollTop;
    owner.setAttribute("aria-expanded", "true");
    menu.removeAttribute("aria-hidden");
    return true;
  }
  function glideTo(node: HTMLElement | null, animate = true): void {
    if (!node || !menuButtons.includes(node as HTMLButtonElement)) return;
    menuGlide.setAttribute("data-ready", String(animate));
    menuGlide.style.height = `${node.offsetHeight}px`;
    menuGlide.style.transform = `translateY(${node.offsetTop}px)`;
    menu.setAttribute("data-glide", "true");
  }
  function menuBottom(top: number, height: number): number {
    const viewport = doc.defaultView?.innerHeight;
    const dockTop = options.anchor.getBoundingClientRect?.().top;
    return Math.min(height, viewport ? viewport - top : height, dockTop !== undefined && dockTop > top ? dockTop - top : height);
  }
  function capMenu(): void {
    const library = element.getBoundingClientRect?.();
    if (library) menu.style.maxHeight = `${Math.max(0, menuBottom(library.top, library.height) - 12)}px`;
  }
  function focusMenuOption(node: HTMLButtonElement | undefined): void {
    if (!node) return;
    node.focus({ preventScroll: true });
    if (node.offsetTop < menu.scrollTop) menu.scrollTop = node.offsetTop;
    else if (node.offsetTop + node.offsetHeight > menu.scrollTop + menu.clientHeight) {
      menu.scrollTop = node.offsetTop + node.offsetHeight - menu.clientHeight;
    }
  }
  /** Menu de contexto do estudo: abre no ponteiro e vira para dentro do painel quando faltaria espaço. */
  function positionAt(node: HTMLElement, x: number, y: number): void {
    if (typeof element.getBoundingClientRect !== "function") return;
    const library = element.getBoundingClientRect();
    const width = node.offsetWidth, height = node.offsetHeight;
    const bottom = menuBottom(library.top, library.height);
    let left = x - library.left, top = y - library.top;
    const flipX = left + width > library.width - 6, flipY = top + height > bottom - 6;
    if (flipX) left = left - width;
    if (flipY) top = top - height;
    left = Math.max(6, Math.min(left, library.width - width - 6));
    top = Math.max(6, Math.min(top, bottom - height - 6));
    node.style.left = `${left}px`; node.style.top = `${top}px`;
    node.style.transformOrigin = `${flipX ? "right" : "left"} ${flipY ? "bottom" : "top"}`;
  }
  function presentMenu(owner: HTMLElement, at?: { x: number; y: number }): void {
    menu.insertBefore?.(menuGlide, menu.firstChild);
    menu.hidden = false;
    capMenu();
    if (at) positionAt(menu, at.x, at.y); else position(menu, owner);
    void menu.offsetWidth;
    menu.setAttribute("data-open", "true");
    const start = menuButtons.find(node => node.getAttribute("aria-checked") === "true") ?? menuButtons.find(node => node.getAttribute("aria-disabled") !== "true") ?? menuButtons[0];
    focusMenuOption(start);
    glideTo(start ?? null, false);
  }
  /** Linha de menu: coluna de ícone (✓ ou ícone), rótulo e atalho à direita, como no estudo. */
  function menuOption(id: string, label: string, selected: boolean | null, onClick: () => void, extra: { icon?: "star"; shortcut?: string; disabledReason?: string | null } = {}): void {
    const node = button(doc, { label: "", onClick: () => { if (!extra.disabledReason) onClick(); } });
    node.id = id; node.setAttribute("role", selected === null ? "menuitem" : "menuitemradio");
    if (selected !== null) node.setAttribute("aria-checked", String(selected));
    const mark = createElement(doc, "span", "ch-library-menu__mark");
    mark.setAttribute("aria-hidden", "true");
    const glyph = selected ? uiIcon(doc, "check", 14) : extra.icon ? uiIcon(doc, extra.icon, 14) : null;
    if (glyph) mark.appendChild(glyph);
    node.appendChild(mark);
    node.appendChild(createElement(doc, "span", "ch-library-menu__text", label));
    if (extra.shortcut) node.appendChild(createElement(doc, "kbd", "ch-library-menu__kbd", extra.shortcut));
    if (extra.disabledReason) { node.setAttribute("aria-disabled", "true"); node.title = extra.disabledReason; }
    menuButtons.push(node); menu.appendChild(node);
  }
  function menuSeparator(): void {
    const line = createElement(doc, "div", "ch-library-menu__separator");
    line.setAttribute("role", "separator");
    menu.appendChild(line);
  }
  function showFilters(owner: HTMLElement): void {
    if (!openMenu(owner)) return;
    menu.setAttribute("aria-label", copy.categories);
    const all = { id: "all", name: copy.allTools };
    menuOption(`library-category-${all.id}`, all.name, nav.category === all.id, () => {
      nav.category = all.id; nav.scroll = 0; closeMenu(true); options.onNavigate(); draw();
    });
    if (options.categories.length) menuSeparator();
    for (const category of options.categories) menuOption(`library-category-${category.id}`, category.name, nav.category === category.id, () => {
      nav.category = category.id; nav.scroll = 0; closeMenu(true); options.onNavigate(); draw();
    });
    presentMenu(owner);
  }
  /** Aplicar · Ajustes… (Alt+clique) · Favoritar, aberto no ponteiro (botão direito) ou sob o controle (teclado). */
  function showOptions(id: string, owner: HTMLElement, at?: { x: number; y: number }): void {
    const item = itemMap.get(id);
    // Outro botão direito no mesmo ladrilho reabre no novo ponto em vez de fechar.
    if (at && menuOpen) closeMenu(false, true);
    if (!item || !openMenu(owner)) return;
    menu.setAttribute("aria-label", `${copy.options} ${item.name}`);
    // Ferramenta que só muda o AE no Aplicar dos ajustes: o clique já abre os ajustes, então não há "Aplicar" duplicado.
    const configure = item.interaction === "configure";
    if (!configure) menuOption(`library-run-${id}`, copy.apply, null, () => {
      closeMenu(true); const current = itemMap.get(id);
      if (!current || current.reason) return;
      current.run();
    }, { disabledReason: item.reason });
    menuOption(`library-edit-${id}`, copy.edit, null, () => { closeMenu(true); itemMap.get(id)?.edit(); }, { shortcut: configure ? copy.keyClick : copy.altClick });
    menuSeparator();
    menuOption(`library-favorite-${id}`, options.preferences.snapshot().favorites.includes(id) ? copy.unfavorite : copy.favorite, null, () => {
      options.preferences.toggleFavorite(id); closeMenu(true); draw();
    }, { icon: "star" });
    presentMenu(owner, at);
  }
  function setGroupCollapsed(ids: readonly string[], collapsed: boolean): void {
    const changed = ids.filter(id => collapsedGroups.has(id) !== collapsed);
    if (!changed.length) return;
    for (const id of changed) { if (collapsed) collapsedGroups.add(id); else collapsedGroups.delete(id); }
    options.preferences.setCollapsedToolGroups?.([...collapsedGroups]);
    revealGroups = collapsed ? new Set() : new Set(changed);
    hideTooltip(); closeMenu(false, true);
    draw();
    revealGroups = null;
  }
  /** Título de categoria: a seta ao lado do nome recolhe e expande os ladrilhos daquele grupo. */
  function groupTitle(categoryId: string): { title: HTMLElement; toggle: HTMLButtonElement; name: HTMLElement; count: HTMLElement } {
    const existing = groupTitles.get(categoryId);
    if (existing) return existing;
    const title = createElement(doc, "h3", "ch-tool-group-title");
    const toggle = createElement(doc, "button", "ch-tool-group-toggle") as HTMLButtonElement;
    toggle.id = `library-group-${categoryId}`;
    toggle.setAttribute("type", "button");
    const chevron = uiIcon(doc, "chevron-down", 12) ?? createElement(doc, "span", "", "▾");
    chevron.setAttribute("class", `${chevron.getAttribute("class") ?? ""} ch-tool-group-chevron`.trim());
    chevron.setAttribute("aria-hidden", "true");
    const name = createElement(doc, "span", "ch-tool-group-name");
    const count = createElement(doc, "span", "ch-tool-group-count");
    count.setAttribute("aria-hidden", "true");
    toggle.appendChild(chevron); toggle.appendChild(name); toggle.appendChild(count);
    // Alt+clique age em todas as categorias, como o twirl do After Effects.
    toggle.addEventListener("click", event => {
      const collapse = !collapsedGroups.has(categoryId);
      setGroupCollapsed((event as MouseEvent).altKey ? options.categories.map(category => category.id) : [categoryId], collapse);
    });
    toggle.addEventListener("keydown", event => {
      const key = (event as KeyboardEvent).key;
      if (key === "ArrowLeft" && !collapsedGroups.has(categoryId)) { event.preventDefault(); setGroupCollapsed([categoryId], true); }
      else if (key === "ArrowRight" && collapsedGroups.has(categoryId)) { event.preventDefault(); setGroupCollapsed([categoryId], false); }
    });
    title.appendChild(toggle);
    const parts = { title, toggle, name, count };
    groupTitles.set(categoryId, parts);
    return parts;
  }
  function createTile(id: string): { tile: HTMLElement; node: HTMLButtonElement; more: HTMLButtonElement; star: HTMLButtonElement } {
    const tile = createElement(doc, "div", "ch-tool-tile");
    // Alt+clique abre os ajustes (estudo): o clique em si não traz o evento, então o mousedown anota a tecla.
    let altClick = false;
    const node = button(doc, { label: "", onClick: () => {
      hideTooltip(); closeMenu(false, true);
      const item = itemMap.get(id);
      const alt = altClick; altClick = false;
      if (!item) return;
      if (alt) { item.edit(); return; }
      if (item.reason) return;
      if (item.interaction === "configure") item.edit(); else item.run();
    } });
    node.addEventListener("mousedown", event => { altClick = Boolean((event as MouseEvent).altKey); });
    // Teclado não herda um Alt+mousedown que não virou clique.
    node.addEventListener("keydown", () => { altClick = false; });
    node.id = `library-tool-${id}`; node.setAttribute("data-motion", "tile-hover tile-press");
    const icon = createIcon(doc, id);
    node.appendChild(icon);
    node.appendChild(createElement(doc, "span", "ch-tool-name", itemMap.get(id)?.name ?? id));
    // The tile carries its family so ripple and feedback share the icon color.
    const family = icon.getAttribute("data-icon-family");
    if (family) node.setAttribute("data-icon-family", family);
    node.addEventListener("pointerdown", event => ripple(node, event as PointerEvent));
    identify(node, () => itemMap.get(id)?.name ?? "", () => itemMap.get(id)?.reason ?? null, () => {
      const item = itemMap.get(id);
      if (!item) return null;
      const action = item.interaction === "configure" ? copy.configure : item.interaction === "quick" ? copy.quick : null;
      return [item.description, action].filter(Boolean).join(" · ") || null;
    });
    tile.appendChild(node);
    tile.addEventListener("mouseenter", () => pointAt(id)); tile.addEventListener("mouseleave", () => pointAt(null));
    node.addEventListener("focus", () => pointAt(id)); node.addEventListener("blur", () => pointAt(null));
    const adjust = button(doc, { label: "", onClick: () => {
      hideTooltip(); closeMenu(false, true); itemMap.get(id)?.edit();
    } });
    // O "⋯" no canto do ladrilho (estudo): aparece no hover e abre os ajustes, igual ao Alt+clique.
    adjust.id = `library-adjust-${id}`; adjust.className += " ch-tool-adjust";
    adjust.appendChild(createIcon(doc, "more"));
    identify(adjust, () => `${copy.adjustOf} ${itemMap.get(id)?.name ?? ""}`);
    tile.appendChild(adjust);
    const more = button(doc, { label: "", onClick: () => showOptions(id, more) });
    more.id = `library-options-${id}`; more.className += " ch-quick-options";
    more.setAttribute("aria-haspopup", "menu"); more.setAttribute("aria-controls", menu.id); more.setAttribute("aria-expanded", "false");
    more.appendChild(createIcon(doc, "more"));
    identify(more, () => `${copy.options} ${itemMap.get(id)?.name ?? ""}`);
    // Botão direito abre o menu no próprio ponteiro, em cima da ferramenta (antes ia para o canto do painel).
    const openAtPointer = (event: Event): void => {
      event.preventDefault(); event.stopPropagation?.();
      const pointer = event as MouseEvent;
      const at = Number.isFinite(pointer.clientX) && Number.isFinite(pointer.clientY) ? { x: pointer.clientX, y: pointer.clientY } : undefined;
      showOptions(id, node, at);
    };
    node.addEventListener("contextmenu", openAtPointer);
    adjust.addEventListener("contextmenu", openAtPointer);
    node.addEventListener("keydown", event => { const key=event as KeyboardEvent; if ((key.shiftKey&&key.key==="F10")||key.key==="ContextMenu") { event.preventDefault(); showOptions(id,node); } else if(key.key==="ArrowRight") { event.preventDefault(); adjust.focus(); } });
    adjust.addEventListener("keydown",event=>{const key=event as KeyboardEvent;if((key.shiftKey&&key.key==="F10")||key.key==="ContextMenu"){event.preventDefault();showOptions(id,adjust);}});
    more.tabIndex=-1;
    tile.appendChild(more);
    // Estrela no canto superior esquerdo: contorno ao passar o mouse, preenchida enquanto a ferramenta é favorita.
    const star = button(doc, { label: "", onClick: () => {
      hideTooltip(); closeMenu(false, true);
      const pinned = !options.preferences.snapshot().favorites.includes(id);
      options.preferences.toggleFavorite(id);
      poppedStar = pinned ? id : "";
      draw();
      poppedStar = "";
    } });
    star.id = `library-star-${id}`; star.className += " ch-tool-star";
    star.tabIndex = -1;
    const starIcon = uiIcon(doc, "star", 12);
    if (starIcon) star.appendChild(starIcon); else star.textContent = "★";
    identify(star, () => `${options.preferences.snapshot().favorites.includes(id) ? copy.unfavorite : copy.favorite}: ${itemMap.get(id)?.name ?? ""}`);
    star.addEventListener("contextmenu", openAtPointer);
    tile.appendChild(star);
    return { tile, node, more, star };
  }
  function ripple(node: HTMLButtonElement, event: PointerEvent): void {
    if (node.disabled || node.getAttribute("aria-disabled") === "true" || (event.button !== undefined && event.button !== 0)) return;
    if (typeof node.getBoundingClientRect !== "function") return;
    const rect = node.getBoundingClientRect();
    const wave = createElement(doc, "span", "ch-tile-ripple");
    wave.setAttribute("aria-hidden", "true");
    wave.setAttribute("data-motion", "tile-ripple");
    const size = Math.ceil(Math.max(rect.width, rect.height) * 2);
    wave.style.setProperty?.("--ripple-x", `${Math.round(event.clientX - rect.left)}px`);
    wave.style.setProperty?.("--ripple-y", `${Math.round(event.clientY - rect.top)}px`);
    wave.style.setProperty?.("--ripple-size", `${size}px`);
    node.appendChild(wave);
    wave.getBoundingClientRect();
    wave.setAttribute("data-active", "true");
    setTimeout(() => wave.parentNode?.removeChild(wave), RIPPLE_MS + 40);
  }
  /** Group titles and tiles rise on the AE spring, in reading order (list-stagger). */
  function cascade(list: HTMLElement[]): void {
    stopCascade?.();
    stopCascade = playStagger(motionEnv, grid, list, { cap: CASCADE_MAX });
  }
  function feedbackParts(id: string): { spinner: Element; check: Element; dot: HTMLElement; timer?: ReturnType<typeof setTimeout> } | null {
    const existing = feedback.get(id);
    if (existing) return existing;
    const tile = tiles.get(id);
    if (!tile || typeof doc.createElementNS !== "function") return null;
    const layer = createElement(doc, "span", "ch-tile-feedback");
    layer.setAttribute("aria-hidden", "true");
    const spinner = doc.createElementNS(SVG_NS, "svg");
    spinner.setAttribute("class", "ch-tile-spinner"); spinner.setAttribute("viewBox", "0 0 24 24");
    spinner.setAttribute("data-motion", "progress-spinner");
    const ring = doc.createElementNS(SVG_NS, "circle");
    ring.setAttribute("cx", "12"); ring.setAttribute("cy", "12"); ring.setAttribute("r", "9");
    spinner.appendChild(ring);
    const check = doc.createElementNS(SVG_NS, "svg");
    check.setAttribute("class", "ch-tile-check"); check.setAttribute("viewBox", "0 0 24 24");
    const mark = doc.createElementNS(SVG_NS, "path");
    mark.setAttribute("d", "M6 12.5l4 4 8-9");
    mark.setAttribute("data-motion", "confirmation-check");
    mark.setAttribute("style", "--motion-check-length:20");
    check.appendChild(mark);
    layer.appendChild(spinner); layer.appendChild(check);
    const dot = createElement(doc, "span", "ch-tile-applied");
    dot.setAttribute("aria-hidden", "true");
    dot.setAttribute("data-motion", "applied-dot");
    tile.node.appendChild(layer); tile.node.appendChild(dot);
    const parts = { spinner, check: mark, dot };
    feedback.set(id, parts);
    return parts;
  }
  /** A6.4: spinner only when slow, a drawn ✓ on success, then the applied dot stays. */
  function setFeedback(id: string, next: TileFeedback): void {
    if (!alive) return;
    const node = tiles.get(id)?.node;
    const parts = feedbackParts(id);
    if (!node || !parts) return;
    clearTimeout(parts.timer);
    parts.spinner.setAttribute("data-active", "false");
    parts.check.setAttribute("data-active", "false");
    if (next === "loading") {
      node.setAttribute("data-feedback", "loading");
      node.setAttribute("aria-busy", "true");
      parts.timer = setTimeout(() => { if (alive) parts.spinner.setAttribute("data-active", "true"); }, SPINNER_DELAY_MS);
      return;
    }
    node.removeAttribute("aria-busy");
    if (next === "idle") { node.setAttribute("data-feedback", "idle"); return; }
    node.setAttribute("data-feedback", "success");
    (parts.check as unknown as HTMLElement).getBoundingClientRect?.();
    parts.check.setAttribute("data-active", "true");
    parts.dot.setAttribute("data-active", "true");
    parts.timer = setTimeout(() => {
      if (!alive) return;
      node.setAttribute("data-feedback", "idle");
      parts.check.setAttribute("data-active", "false");
    }, APPLIED_MS);
  }
  function draw(): void {
    const prefs = options.preferences.snapshot();
    const categoryName = options.categories.find(category => category.id === nav.category)?.name;
    categoryLabel.textContent = categoryName ?? copy.all;
    categories.setAttribute("aria-label", `${copy.categories}: ${categoryName ?? copy.allTools}`);
    categories.title = categories.getAttribute("aria-label") ?? copy.categories;
    favoritesOnly.setAttribute("aria-pressed", String(nav.scope === "favorites"));
    if (searchInput.value !== nav.query) searchInput.value = nav.query;
    const candidates = nav.scope === "recent" ? prefs.recent.map(id => itemMap.get(id)).filter((item): item is LibraryItem => Boolean(item))
      : items.filter(item => nav.scope !== "favorites" || prefs.favorites.includes(item.id));
    const query = normalizeSearch(nav.query);
    let visible = candidates.filter(item => (nav.category === "all" || nav.category === item.category) &&
      normalizeSearch(`${item.name} ${item.description} ${item.aliases} ${options.categories.find(c => c.id === item.category)?.name ?? ""}`).includes(query));
    headingLabel.textContent = categoryName ?? copy.allTools;
    countLabel.textContent = String(visible.length);
    countLabel.setAttribute("aria-label", i18n.t("library.count", { count: visible.length }));
    const emptyKey = query || nav.category !== "all" ? "library.empty.search"
      : nav.scope === "favorites" ? "library.empty.favorites" : nav.scope === "recent" ? "library.empty.recent" : "library.empty.search";
    const grouped = nav.category === "all" && nav.scope !== "recent" && !query;
    if (grouped) visible = [...visible].sort((a,b) => options.categories.findIndex(c => c.id === a.category) - options.categories.findIndex(c => c.id === b.category));
    // Ladrilhos de uma categoria recolhida saem da grade; o título fica, com a seta e a contagem.
    const shown = grouped ? visible.filter(item => !collapsedGroups.has(item.category)) : visible;
    const nextIds = [...shown.map(item => item.id), ...(grouped ? [...new Set(visible.map(item => item.category))].filter(id => collapsedGroups.has(id)).map(id => `#${id}`) : [])];
    const changed = nextIds.length !== visibleIds.length || nextIds.some((id, index) => id !== visibleIds[index]);
    if (changed || !grid.firstChild || !visible.length && emptyKey !== renderedEmptyKey) {
      hideTooltip();
      const focused = contains(grid, doc.activeElement) ? doc.activeElement as HTMLElement : null;
      clearNode(grid);
      let previousCategory = "";
      let revealIndex = 0;
      for (const item of visible) {
        const collapsed = grouped && collapsedGroups.has(item.category);
        if (grouped && previousCategory !== item.category) {
          const group = groupTitle(item.category);
          const groupName = options.categories.find(c => c.id === item.category)?.name ?? item.category;
          group.name.textContent = groupName;
          group.count.textContent = String(visible.filter(entry => entry.category === item.category).length);
          group.title.setAttribute("data-collapsed", String(collapsed));
          group.toggle.setAttribute("aria-expanded", String(!collapsed));
          group.toggle.setAttribute("aria-label", `${collapsed ? copy.expand : copy.collapse} ${groupName}`);
          group.toggle.title = `${collapsed ? copy.expand : copy.collapse} · ${copy.groupHint}`;
          grid.appendChild(group.title);
          previousCategory = item.category;
          revealIndex = 0;
        }
        if (collapsed) continue;
        if (!tiles.has(item.id)) tiles.set(item.id, createTile(item.id));
        const tile = tiles.get(item.id)!.tile;
        if (revealGroups?.has(item.category)) {
          tile.setAttribute("data-reveal", "true");
          tile.style.setProperty?.("--reveal-index", String(Math.min(revealIndex++, CASCADE_MAX)));
        } else tile.removeAttribute("data-reveal");
        grid.appendChild(tile);
      }
      // Entering the view or switching filters cascades; narrowing a search or twirling a category does not.
      if (quietEntry) quietEntry = false;
      else if (revealGroups) stopCascade?.();
      else if (drawnQuery === null || drawnQuery === nav.query) cascade(Array.from(grid.children) as HTMLElement[]);
      drawnQuery = nav.query;
      if (!visible.length) grid.appendChild(createEmptyState(doc, {
        icon: "search", title: i18n.t("library.empty.title"), description: i18n.t(emptyKey),
        action: { label: i18n.t("library.showAll"), onClick: () => {
          nav.query = ""; nav.category = "all"; nav.scope = "all"; nav.scroll = 0;
          options.onNavigate(); draw(); categories.focus();
        } }
      }));
      if (focused) {
        if (contains(grid, focused)) focused.focus();
        else categories.focus();
      }
      visibleIds = nextIds;
      renderedEmptyKey = visible.length ? "" : emptyKey;
      if (menuOpen && menuOwner && !contains(element, menuOwner)) closeMenu(false, true);
    }
    for (const item of shown) {
      const tile = tiles.get(item.id)!;
      const favorite = prefs.favorites.includes(item.id);
      tile.star.setAttribute("aria-pressed", String(favorite));
      tile.star.setAttribute("aria-label", `${favorite ? copy.unfavorite : copy.favorite}: ${item.name}`);
      if (poppedStar === item.id) tile.star.setAttribute("data-pop", "true"); else tile.star.removeAttribute("data-pop");
      tile.node.setAttribute("data-interaction", item.interaction);
      tile.node.setAttribute("aria-disabled", String(Boolean(item.reason)));
      tile.node.setAttribute("aria-label", item.name);
      const name = Array.from(tile.node.getElementsByTagName("span")).find(node => node.className === "ch-tool-name");
      if (name) name.textContent = item.name;
      tile.more.setAttribute("aria-label", `${copy.options} ${item.name}`);
      tile.tile.setAttribute("data-favorite", String(favorite));
      if (item.reason) tile.node.setAttribute("aria-description", item.reason); else tile.node.removeAttribute("aria-description");
      if (tooltipOwner === tile.node && !tooltip.hidden) {
        const reason = tooltipShowsReason ? item.reason : null;
        tooltipContent(item.name, reason, tile.node.getAttribute("data-icon-family"));
        position(tooltip, tile.node);
      }
    }
    if (detailId && !itemMap.has(detailId)) detailId = null;
    drawDetails();
    const targetScroll = nav.scroll;
    const version = ++scrollVersion;
    const view = doc.defaultView;
    if (scrollFrame !== undefined) view?.cancelAnimationFrame?.(scrollFrame);
    if (view?.requestAnimationFrame) {
      scrollFrame = view.requestAnimationFrame(() => {
        if (!alive || version !== scrollVersion) return;
        scrollFrame = view.requestAnimationFrame(() => {
          if (!alive || version !== scrollVersion) return;
          scrollFrame = undefined;
          grid.scrollTop = targetScroll;
          nav.scroll = targetScroll;
        });
      });
    } else {
      scrollFrame = undefined;
      grid.scrollTop = targetScroll;
      nav.scroll = targetScroll;
    }
  }
  menu.addEventListener("mouseover", event => glideTo((event.target as Element | null)?.closest?.(".ch-button") as HTMLElement | null));
  menu.addEventListener("focusin", event => glideTo(event.target as HTMLElement));
  menu.addEventListener("mouseleave", () => glideTo(doc.activeElement as HTMLElement | null));
  menu.addEventListener("keydown", event => {
    const key = (event as KeyboardEvent).key;
    const index = menuButtons.indexOf(doc.activeElement as HTMLButtonElement);
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(key)) {
      event.preventDefault();
      const next = key === "Home" ? 0 : key === "End" ? menuButtons.length - 1 : (index + (key === "ArrowDown" ? 1 : -1) + menuButtons.length) % menuButtons.length;
      focusMenuOption(menuButtons[next]);
    } else if (key.length === 1 && !/\s/.test(key)) {
      const ordered = [...menuButtons.slice(index + 1), ...menuButtons.slice(0, index + 1)];
      focusMenuOption(ordered.find(node => normalizeSearch(node.textContent ?? "").startsWith(normalizeSearch(key))));
    }
  });
  // Tab/arrow focus moves into view smoothly: the browser's instant jump happens between the
  // key and focusin, so it is undone and replayed as a glide before the frame is painted.
  let keyScrollFrom: number | null = null;
  element.addEventListener("keydown", event => {
    keyScrollFrom = ["Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End"].includes((event as KeyboardEvent).key) ? grid.scrollTop : null;
    // Only the focus change of this very key counts; a later click must not rewind the grid.
    if (keyScrollFrom !== null) setTimeout(() => { keyScrollFrom = null; }, 0);
  }, true);
  grid.addEventListener("focusin", () => {
    const from = keyScrollFrom;
    keyScrollFrom = null;
    if (from === null || grid.scrollTop === from || motionEnv.reduced()) return;
    const to = grid.scrollTop;
    grid.scrollTop = from;
    smoothScrollTo(motionEnv, grid, to);
  });
  // Brilho que segue o cursor no ladrilho: só publica a posição; o CSS decide se mostra.
  grid.addEventListener("pointermove", event => {
    let target = event.target as HTMLElement | null;
    while (target && target !== grid && target.parentElement?.className !== "ch-tool-tile") target = target.parentElement;
    if (!target || target === grid || typeof target.getBoundingClientRect !== "function") return;
    const box = target.getBoundingClientRect(), pointer = event as PointerEvent;
    target.style.setProperty("--mx", `${pointer.clientX - box.left}px`); target.style.setProperty("--my", `${pointer.clientY - box.top}px`);
  });
  grid.addEventListener("scroll", () => {
    ++scrollVersion;
    if (scrollFrame !== undefined) doc.defaultView?.cancelAnimationFrame?.(scrollFrame);
    scrollFrame = undefined;
    nav.scroll = grid.scrollTop;
    hideTooltip();
    // A click may scroll its target before opening this menu; that scroll event
    // arrives afterward. Dismiss only when the grid moves after the menu opened.
    if (!menuOpen || grid.scrollTop !== menuGridScroll) closeMenu(false, true);
  });
  element.addEventListener("keydown", event => {
    if ((event as KeyboardEvent).key !== "Escape") return;
    hideTooltip();
    if (menuOpen) { event.preventDefault(); event.stopPropagation?.(); closeMenu(true); }
  });
  const dismissOutside = (event: Event) => {
    if (menuOpen && !contains(menu, event.target) && !contains(menuOwner!, event.target)) closeMenu(false);
  };
  doc.addEventListener?.("mousedown", dismissOutside);
  const dismissOnFocus = (event: Event) => {
    if (menuOpen && !contains(menu, event.target) && !contains(menuOwner!, event.target)) closeMenu(false);
  };
  doc.addEventListener?.("focusin", dismissOnFocus);
  const resize = () => {
    hideTooltip();
    if (menuOpen && menuOwner) { capMenu(); position(menu, menuOwner); }
  };
  doc.defaultView?.addEventListener("resize", resize);
  draw();
  return {
    element,
    update(nextItems) {
      if (!alive) return;
      items = nextItems; itemMap.clear();
      for (const item of items) itemMap.set(item.id, item);
      draw();
    },
    setFeedback,
    dispose() {
      alive = false; ++scrollVersion;
      stopCascade?.();
      for (const parts of feedback.values()) clearTimeout(parts.timer);
      if (scrollFrame !== undefined) doc.defaultView?.cancelAnimationFrame?.(scrollFrame);
      scrollFrame = undefined;
      hideTooltip(); closeMenu(false, true);
      doc.removeEventListener?.("mousedown", dismissOutside); doc.removeEventListener?.("focusin", dismissOnFocus);
      doc.defaultView?.removeEventListener("resize", resize);
    }
  };
}
