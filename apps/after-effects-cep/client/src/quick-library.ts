import { button, createElement, createIcon, clearNode, createEmptyState, createI18n, type PanelPreferences } from "@motion/ui-core";
import { MOTION_CATALOG } from "@motion/ui-motion";

const TOOLTIP_EXIT_MS = MOTION_CATALOG.find(motion => motion.id === "tooltip-enter")!.durationMs[0]!;
const SURFACE_MS = MOTION_CATALOG.find(motion => motion.id === "surface-morph")!.durationMs[0]!;

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
  "pt-BR": { search: "Buscar ferramenta", searchShort: "Buscar", clear: "Limpar busca", filters: "Filtros da busca", collection: "Coleção", library: "Biblioteca", categories: "Categorias", more: "Mais categorias", all: "Todas", favorites: "Favoritos", recent: "Recentes", edit: "Configurar", favorite: "Favoritar", unfavorite: "Remover favorito", empty: "Nenhuma ferramenta encontrada.", quick: "Clique para aplicar", configure: "Abrir ajustes", anchor: "Escolha na grade de âncora", options: "Opções de", help: "Clique aplica · Opções para ajustar" },
  "en-US": { search: "Find a tool", searchShort: "Search", clear: "Clear search", filters: "Search filters", collection: "Collection", library: "Library", categories: "Categories", more: "More categories", all: "All", favorites: "Favorites", recent: "Recent", edit: "Configure", favorite: "Favorite", unfavorite: "Remove favorite", empty: "No tools found.", quick: "Click to apply", configure: "Open settings", anchor: "Choose on the anchor grid", options: "Options for", help: "Click to apply · Options to adjust" }
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
  onNavigate(): void;
}): { element: HTMLElement; update(items: LibraryItem[]): void; dispose(): void } {
  const i18n = createI18n({ locale: options.locale });
  const copy = LIBRARY_COPY[i18n.locale() === "pt-BR" ? "pt-BR" : "en-US"];
  const nav = options.navigation;
  let items = options.items;
  const itemMap = new Map(items.map(item => [item.id, item]));
  const element = createElement(doc, "div", "ch-quick-library ch-library-refined");
  const toolbar = createElement(doc, "div", "ch-quick-toolbar");
  const toolbarInner = createElement(doc, "div", "ch-library-toolbar-inner");
  toolbar.appendChild(toolbarInner);
  element.appendChild(toolbar);
  const searchField = createElement(doc, "div", "ch-library-search");
  searchField.setAttribute("data-motion", "field-expand");
  const searchTrigger = button(doc, { label: "", onClick: () => setSearchOpen(true, true) });
  searchTrigger.id = "library-search-open";
  searchTrigger.className = "ch-button ch-library-search-trigger";
  searchTrigger.appendChild(createIcon(doc, "search"));
  searchTrigger.appendChild(createElement(doc, "span", "", copy.searchShort));
  searchTrigger.setAttribute("aria-controls", "library-search");
  searchField.appendChild(searchTrigger);
  const searchEditor = createElement(doc, "div", "ch-library-search-editor");
  searchEditor.appendChild(createIcon(doc, "search"));
  const search = doc.createElement("input");
  search.type = "search";
  search.id = "library-search";
  search.placeholder = copy.search;
  search.setAttribute("aria-label", copy.search);
  search.value = nav.query;
  searchEditor.appendChild(search);
  const clearSearch = button(doc, { label: "×", onClick: () => {
    search.value = ""; nav.query = ""; nav.scroll = 0; options.onNavigate(); draw(); search.focus();
  } });
  clearSearch.className = "ch-button ch-library-icon";
  clearSearch.id = "library-search-clear";
  clearSearch.setAttribute("aria-label", copy.clear);
  searchEditor.appendChild(clearSearch);
  searchField.appendChild(searchEditor);
  toolbarInner.appendChild(searchField);
  const filters = createElement(doc, "div", "ch-library-filters");
  toolbarInner.appendChild(filters);
  const collectionLabel = createElement(doc, "span", "");
  const categoryLabel = createElement(doc, "span", "");
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
  const scopes = dropdown("library-collection", collectionLabel, "tools", () => showFilters(scopes, "collection"));
  filters.appendChild(scopes);
  const categories = dropdown("library-category-select", categoryLabel, null, () => showFilters(categories, "category"));
  filters.appendChild(categories);
  const filterTrigger = dropdown("library-search-filters", createElement(doc, "span", ""), "settings", () => showFilters(filterTrigger, "all"));
  filterTrigger.className = "ch-button ch-library-icon ch-library-filter-trigger";
  filterTrigger.setAttribute("aria-label", copy.filters);
  toolbarInner.appendChild(filterTrigger);
  const heading = createElement(doc, "div", "ch-quick-heading");
  const headingLabel = createElement(doc, "span", "");
  const countLabel = createElement(doc, "span", "ch-library-count");
  countLabel.setAttribute("role", "status");
  countLabel.setAttribute("aria-atomic", "true");
  heading.appendChild(headingLabel); heading.appendChild(countLabel);
  element.appendChild(heading);
  const grid = createElement(doc, "div", "ch-tool-grid");
  grid.setAttribute("aria-label", copy.all);
  element.appendChild(grid);
  element.appendChild(options.anchor);
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
  let blurTimer: ReturnType<typeof setTimeout> | undefined;
  let alive = true;
  let tooltipOwner: HTMLElement | null = null;
  let tooltipShowsReason = false;
  let menuOwner: HTMLElement | null = null;
  let menuButtons: HTMLButtonElement[] = [];
  let menuOpen = false;
  let menuGridScroll = 0;
  let searchOpen = false;
  let scrollFrame: number | undefined;
  let scrollVersion = 0;
  const tiles = new Map<string, { tile: HTMLElement; node: HTMLButtonElement; more: HTMLButtonElement }>();
  let visibleIds: string[] = [];
  let renderedEmptyKey = "";

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
    const library = element.getBoundingClientRect();
    node.style.width = ""; node.style.height = "";
    const fixed = node === tooltip;
    const originLeft = fixed ? 0 : library.left;
    const originTop = fixed ? 0 : library.top;
    const width = fixed ? doc.documentElement.clientWidth : library.width;
    const height = fixed ? doc.documentElement.clientHeight : library.height;
    const desiredLeft = rect.left - originLeft + (fixed ? (rect.width - node.offsetWidth) / 2 : 0);
    const left = Math.max(6, Math.min(desiredLeft, width - node.offsetWidth - 6));
    const below = rect.bottom - originTop + 6;
    const placeBelow = below + node.offsetHeight <= height - 6;
    const top = Math.max(6, placeBelow ? below : rect.top - originTop - node.offsetHeight - 6);
    node.style.left = `${left}px`; node.style.top = `${top}px`;
    node.style.transformOrigin = `${Math.max(0, Math.min(node.offsetWidth, rect.left + rect.width / 2 - originLeft - left))}px ${placeBelow ? "top" : "bottom"}`;
  }
  function tooltipContent(name: string, reason: string | null): void {
    clearNode(tooltip);
    tooltip.appendChild(createElement(doc, "strong", "", name));
    if (reason) tooltip.appendChild(createElement(doc, "span", "", reason));
  }
  function identify(node: HTMLElement, name: () => string, reason: () => string | null = () => null): void {
    node.setAttribute("aria-label", name());
    const show = (includeReason = false) => {
      hideTooltip();
      timer = setTimeout(() => {
        if (!alive || menuOpen || !contains(element, node)) return;
        const unavailable = includeReason ? reason() : null;
        tooltipContent(name(), unavailable);
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
  function presentMenu(owner: HTMLElement): void {
    menu.hidden = false; position(menu, owner); void menu.offsetWidth;
    menu.setAttribute("data-open", "true");
    (menuButtons.find(node => node.getAttribute("aria-checked") === "true") ?? menuButtons[0])?.focus();
  }
  function menuOption(id: string, label: string, selected: boolean | null, onClick: () => void): void {
    const node = button(doc, { label, onClick });
    node.id = id; node.setAttribute("role", selected === null ? "menuitem" : "menuitemradio");
    if (selected !== null) node.setAttribute("aria-checked", String(selected));
    menuButtons.push(node); menu.appendChild(node);
  }
  function showFilters(owner: HTMLElement, section: "all" | "collection" | "category"): void {
    if (!openMenu(owner)) return;
    menu.setAttribute("aria-label", section === "collection" ? copy.collection : section === "category" ? copy.categories : copy.filters);
    if (section !== "category") {
      menu.appendChild(createElement(doc, "span", "ch-library-menu-label", copy.collection));
      for (const scope of ["all", "favorites", "recent"] as const) menuOption(`library-scope-${scope}`, scope === "all" ? copy.library : copy[scope], nav.scope === scope, () => {
        nav.scope = scope; nav.scroll = 0; closeMenu(true); options.onNavigate(); draw();
      });
    }
    if (section !== "collection") {
      menu.appendChild(createElement(doc, "span", "ch-library-menu-label", copy.categories));
      for (const category of [{ id: "all", name: copy.all }, ...options.categories]) menuOption(`library-category-${category.id}`, category.name, nav.category === category.id, () => {
        nav.category = category.id; nav.scroll = 0; closeMenu(true); options.onNavigate(); draw();
      });
    }
    presentMenu(owner);
  }
  function showOptions(id: string, owner: HTMLElement): void {
    const item = itemMap.get(id);
    if (!item || !openMenu(owner)) return;
    menu.setAttribute("aria-label", `${copy.options} ${item.name}`);
    menu.appendChild(createElement(doc, "strong", "ch-library-menu-label", item.name));
    menuOption(`library-edit-${id}`, copy.edit, null, () => { closeMenu(true); itemMap.get(id)?.edit(); });
    menuOption(`library-favorite-${id}`, options.preferences.snapshot().favorites.includes(id) ? copy.unfavorite : copy.favorite, null, () => {
      options.preferences.toggleFavorite(id); closeMenu(true); draw();
    });
    presentMenu(owner);
  }
  function setSearchOpen(open: boolean, focus = false): void {
    // An active query owns the expanded state; Escape never discards it.
    searchOpen = open || Boolean(search.value);
    toolbarInner.setAttribute("data-expanded", String(searchOpen));
    searchTrigger.setAttribute("aria-expanded", String(searchOpen));
    searchTrigger.hidden = searchOpen; searchEditor.hidden = !searchOpen;
    filters.hidden = searchOpen; filterTrigger.hidden = !searchOpen;
    if (focus) search.focus();
  }
  function createTile(id: string): { tile: HTMLElement; node: HTMLButtonElement; more: HTMLButtonElement } {
    const tile = createElement(doc, "div", "ch-tool-tile");
    const node = button(doc, { label: "", onClick: () => {
      hideTooltip(); closeMenu(false, true);
      const item = itemMap.get(id);
      if (!item || item.reason) return;
      if (item.interaction === "configure") item.edit(); else item.run();
    } });
    node.id = `library-tool-${id}`; node.setAttribute("data-motion", "tile-hover tile-press");
    node.appendChild(createIcon(doc, id));
    identify(node, () => itemMap.get(id)?.name ?? "", () => itemMap.get(id)?.reason ?? null);
    tile.appendChild(node);
    const more = button(doc, { label: "", onClick: () => showOptions(id, more) });
    more.id = `library-options-${id}`; more.className += " ch-quick-options";
    more.setAttribute("aria-haspopup", "menu"); more.setAttribute("aria-controls", menu.id); more.setAttribute("aria-expanded", "false");
    more.appendChild(createIcon(doc, "more"));
    identify(more, () => `${copy.options} ${itemMap.get(id)?.name ?? ""}`);
    node.addEventListener("contextmenu", event => { event.preventDefault(); showOptions(id, more); });
    node.addEventListener("keydown", event => { if ((event as KeyboardEvent).key === "ArrowRight") { event.preventDefault(); more.focus(); } });
    tile.appendChild(more);
    return { tile, node, more };
  }
  function draw(): void {
    const prefs = options.preferences.snapshot();
    collectionLabel.textContent = nav.scope === "all" ? copy.library : copy[nav.scope];
    categoryLabel.textContent = options.categories.find(category => category.id === nav.category)?.name ?? copy.all;
    scopes.setAttribute("aria-label", `${copy.collection}: ${collectionLabel.textContent}`);
    categories.setAttribute("aria-label", `${copy.categories}: ${categoryLabel.textContent}`);
    const candidates = nav.scope === "recent" ? prefs.recent.map(id => itemMap.get(id)).filter((item): item is LibraryItem => Boolean(item))
      : items.filter(item => nav.scope !== "favorites" || prefs.favorites.includes(item.id));
    const query = normalizeSearch(nav.query);
    const visible = candidates.filter(item => (nav.category === "all" || nav.category === item.category) &&
      normalizeSearch(`${item.name} ${item.description} ${item.aliases} ${options.categories.find(c => c.id === item.category)?.name ?? ""}`).includes(query));
    headingLabel.textContent = nav.category === "all" ? (options.locale === "pt-BR" ? "Todas as ferramentas" : "All tools") : categoryLabel.textContent;
    countLabel.textContent = String(visible.length);
    countLabel.setAttribute("aria-label", i18n.t("library.count", { count: visible.length }));
    const emptyKey = query || nav.category !== "all" ? "library.empty.search"
      : nav.scope === "favorites" ? "library.empty.favorites" : nav.scope === "recent" ? "library.empty.recent" : "library.empty.search";
    const nextIds = visible.map(item => item.id);
    const changed = nextIds.length !== visibleIds.length || nextIds.some((id, index) => id !== visibleIds[index]);
    if (changed || !grid.firstChild || !visible.length && emptyKey !== renderedEmptyKey) {
      hideTooltip();
      const focused = contains(grid, doc.activeElement) ? doc.activeElement as HTMLElement : null;
      clearNode(grid);
      for (const item of visible) {
        if (!tiles.has(item.id)) tiles.set(item.id, createTile(item.id));
        grid.appendChild(tiles.get(item.id)!.tile);
      }
      if (!visible.length) grid.appendChild(createEmptyState(doc, {
        icon: "search", title: i18n.t("library.empty.title"), description: i18n.t(emptyKey),
        action: { label: i18n.t("library.showAll"), onClick: () => {
          nav.query = ""; nav.category = "all"; nav.scope = "all"; nav.scroll = 0; search.value = "";
          options.onNavigate(); draw(); setSearchOpen(true, true);
        } }
      }));
      if (focused) {
        if (contains(grid, focused)) focused.focus();
        else if (searchOpen) search.focus();
        else scopes.focus();
      }
      visibleIds = nextIds;
      renderedEmptyKey = visible.length ? "" : emptyKey;
      if (menuOpen && menuOwner && !contains(element, menuOwner)) closeMenu(false, true);
    }
    for (const item of visible) {
      const tile = tiles.get(item.id)!;
      tile.node.setAttribute("data-interaction", item.interaction);
      tile.node.setAttribute("aria-disabled", String(Boolean(item.reason)));
      tile.node.setAttribute("aria-label", item.name);
      tile.more.setAttribute("aria-label", `${copy.options} ${item.name}`);
      if (item.reason) tile.node.setAttribute("aria-description", item.reason); else tile.node.removeAttribute("aria-description");
      if (tooltipOwner === tile.node && !tooltip.hidden) {
        const reason = tooltipShowsReason ? item.reason : null;
        tooltipContent(item.name, reason);
        position(tooltip, tile.node);
      }
    }
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
  menu.addEventListener("keydown", event => {
    const key = (event as KeyboardEvent).key;
    const index = menuButtons.indexOf(doc.activeElement as HTMLButtonElement);
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(key)) {
      event.preventDefault();
      const next = key === "Home" ? 0 : key === "End" ? menuButtons.length - 1 : (index + (key === "ArrowDown" ? 1 : -1) + menuButtons.length) % menuButtons.length;
      menuButtons[next]?.focus();
    } else if (key.length === 1 && !/\s/.test(key)) {
      const ordered = [...menuButtons.slice(index + 1), ...menuButtons.slice(0, index + 1)];
      ordered.find(node => normalizeSearch(node.textContent ?? "").startsWith(normalizeSearch(key)))?.focus();
    }
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
    else if (searchOpen && !search.value) { setSearchOpen(false); searchTrigger.focus(); }
  });
  const dismissOutside = (event: Event) => {
    if (menuOpen && !contains(menu, event.target) && !contains(menuOwner!, event.target)) closeMenu(false);
  };
  doc.addEventListener?.("mousedown", dismissOutside);
  const dismissOnFocus = (event: Event) => {
    if (menuOpen && !contains(menu, event.target) && !contains(menuOwner!, event.target)) closeMenu(false);
  };
  doc.addEventListener?.("focusin", dismissOnFocus);
  searchField.addEventListener("focusout", () => {
    clearTimeout(blurTimer);
    blurTimer = setTimeout(() => { if (alive && !contains(searchField, doc.activeElement) && !menuOpen) setSearchOpen(false); }, 0);
  });
  search.addEventListener("input", () => { nav.query = search.value; nav.scroll = 0; options.onNavigate(); draw(); });
  const resize = () => { hideTooltip(); if (menuOpen && menuOwner) position(menu, menuOwner); };
  doc.defaultView?.addEventListener("resize", resize);
  setSearchOpen(Boolean(nav.query)); draw();
  return {
    element,
    update(nextItems) {
      if (!alive) return;
      items = nextItems; itemMap.clear();
      for (const item of items) itemMap.set(item.id, item);
      draw();
    },
    dispose() {
      alive = false; ++scrollVersion;
      if (scrollFrame !== undefined) doc.defaultView?.cancelAnimationFrame?.(scrollFrame);
      scrollFrame = undefined;
      hideTooltip(); closeMenu(false, true); clearTimeout(blurTimer);
      doc.removeEventListener?.("mousedown", dismissOutside); doc.removeEventListener?.("focusin", dismissOnFocus);
      doc.defaultView?.removeEventListener("resize", resize);
    }
  };
}
