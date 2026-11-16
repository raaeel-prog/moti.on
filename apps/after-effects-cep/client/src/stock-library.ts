/**
 * Pasta "Banco de mídia" da galeria (`ae.stock.import`, MASTER_BUILD_SPEC §18.9).
 * Uma tarefa por vez: escolher o banco, buscar, escolher um item e importar.
 * Um banco por grade (os resultados nunca se misturam) e o crédito fica sempre
 * à vista no inspetor. As chaves dos bancos estão só no servidor (motion-assets).
 */
import { STOCK_PROVIDER_NAMES, type CommandResponse, type StockImportArgs, type StockProviderId } from "@motion/contracts";
import { stockErrorMessage, StockError, type StockClient, type StockDownloadTicket, type StockItem, type StockMediaType, type StockPage, type StockProviderInfo } from "@motion/asset-sdk";
import { createActionButton, createElement, createIcon, type I18n } from "@motion/ui-core";

export interface StockDownloadJob { promise: Promise<{ reused: boolean }>; cancel(): void }
export interface StockLibraryOptions {
  i18n: I18n;
  type: StockMediaType;
  query?: string | undefined;
  client(): Promise<StockClient>;
  download(ticket: StockDownloadTicket, onProgress: (fraction: number | null) => void): StockDownloadJob;
  execute(args: StockImportArgs): Promise<CommandResponse>;
  error(response: CommandResponse): string;
  context(): { isComposition: boolean };
  busy?(value: boolean): void;
  openAccount?(): void;
  openUrl?(url: string): void;
  copy?(text: string): boolean;
}
export interface StockLibrary { element: HTMLElement; actions: HTMLElement; refresh(): void; dispose(): void }

/** Busca e resultados sobrevivem ao redesenho da galeria (que recria a tela). */
interface Memory { provider: Partial<Record<StockMediaType, StockProviderId>>; query: Partial<Record<StockMediaType, string>>; pages: Map<string, StockPage[]> }
const memory: Memory = { provider: {}, query: {}, pages: new Map() };
const MAX_MEMORY_PAGES = 30, TYPE_DELAY_MS = 350;
/** Empty-state suggestions: the label is shown, the query is what the providers search best (English). */
export const STOCK_SUGGESTIONS: Readonly<Record<StockMediaType, readonly (readonly [string, string, string])[]>> = {
  video: [["Natureza", "Nature", "nature"], ["Cidade", "City", "city"], ["Oceano", "Ocean", "ocean"], ["Pessoas", "People", "people"], ["Tecnologia", "Technology", "technology"],
    ["Abstrato", "Abstract", "abstract"], ["Fumaça", "Smoke", "smoke"], ["Fogo", "Fire", "fire"], ["Céu", "Sky", "sky"], ["Escritório", "Office", "office"], ["Esportes", "Sports", "sports"], ["Comida", "Food", "food"]],
  image: [["Fundo", "Background", "background"], ["Textura", "Texture", "texture"], ["Montanha", "Mountain", "mountain"], ["Retrato", "Portrait", "portrait"], ["Arquitetura", "Architecture", "architecture"],
    ["Flores", "Flowers", "flowers"], ["Neon", "Neon", "neon"], ["Minimalista", "Minimal", "minimal"], ["Espaço", "Space", "space"], ["Papel", "Paper", "paper"], ["Céu", "Sky", "sky"], ["Negócios", "Business", "business"]],
  audio: [["Whoosh", "Whoosh", "whoosh"], ["Impacto", "Impact", "impact"], ["Clique", "Click", "click"], ["Explosão", "Explosion", "explosion"], ["Notificação", "Notification", "notification"],
    ["Passos", "Footsteps", "footsteps"], ["Chuva", "Rain", "rain"], ["Aplausos", "Applause", "applause"], ["Risada", "Laughter", "laughter"], ["Glitch", "Glitch", "glitch"], ["Transição", "Transition", "transition"], ["Pop", "Pop", "pop"]]
};

/** Import arguments are derived from the server ticket, never from the grid item. */
export function stockImportArgs(ticket: StockDownloadTicket): StockImportArgs {
  const title = ticket.item.title.trim() || `${STOCK_PROVIDER_NAMES[ticket.item.provider]} ${ticket.item.providerAssetId}`;
  return { provider: ticket.item.provider, assetId: ticket.item.providerAssetId, extension: ticket.rendition.extension, title: title.slice(0, 120), credit: ticket.item.attributionText.slice(0, 400) };
}
export function formatDuration(ms: number | undefined): string {
  if (!ms) return "";
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
function clear(node: Element): void { while (node.firstChild) node.removeChild(node.firstChild); }
function codeOf(error: unknown): string { return error instanceof StockError ? error.code : error instanceof Error && /^[A-Z_]{3,40}$/.test(error.message) ? error.message : "NETWORK_UNAVAILABLE"; }

export function createStockLibrary(doc: Document, options: StockLibraryOptions): StockLibrary {
  const pt = options.i18n.locale() !== "en-US", type = options.type;
  const element = createElement(doc, "div", "ch-stock"), actions = createElement(doc, "div", "ch-panel-action-bar ch-stock-actions");
  const body = createElement(doc, "div", "ch-stock-body-content");
  const results = createElement(doc, "div", "ch-stock-results");
  // One row, as in the approved reference: "Pexels ⌄ │ ⌕ Buscar". Typing searches; Enter searches at once.
  const toolbar = createElement(doc, "div", "ch-stock-toolbar");
  const providerSelect = doc.createElement("select"); providerSelect.className = "ch-stock-provider"; providerSelect.id = "stock-provider"; providerSelect.setAttribute("aria-label", pt ? "Banco" : "Provider");
  const searchBox = createElement(doc, "label", "ch-stock-search");
  const search = doc.createElement("input"); search.type = "search"; search.id = "stock-query"; search.className = "ch-stock-query"; search.maxLength = 100;
  search.placeholder = pt ? "Buscar" : "Search";
  search.setAttribute("aria-label", type === "audio" ? (pt ? "Buscar efeitos sonoros" : "Search sound effects") : type === "video" ? (pt ? "Buscar vídeos" : "Search videos") : (pt ? "Buscar imagens" : "Search images"));
  search.value = (options.query?.trim() || memory.query[type] || "").slice(0, 100);
  searchBox.appendChild(createIcon(doc, "search")); searchBox.appendChild(search);
  toolbar.appendChild(providerSelect); toolbar.appendChild(searchBox);
  const suggest = createElement(doc, "div", "ch-stock-empty");
  suggest.appendChild(createElement(doc, "p", "ch-stock-empty__hint", pt ? "Busque digitando ou escolhendo uma sugestão" : "Search by typing or choosing a suggestion"));
  const chips = createElement(doc, "div", "ch-stock-suggestions"); suggest.appendChild(chips);
  for (const [labelPt, labelEn, query] of STOCK_SUGGESTIONS[type]) {
    const chip = createElement(doc, "button", "ch-stock-suggestion", pt ? labelPt : labelEn) as HTMLButtonElement; chip.type = "button"; chip.dataset["query"] = query;
    chip.addEventListener("click", () => { search.value = query; search.focus(); void runSearch(true); });
    chips.appendChild(chip);
  }
  const grid = createElement(doc, "div", type === "audio" ? "ch-stock-list" : "ch-stock-grid"); grid.setAttribute("role", "listbox"); grid.setAttribute("aria-label", pt ? "Resultados" : "Results");
  const more = createActionButton(doc, { id: "stock-more", label: pt ? "Carregar mais" : "Load more", variant: "tertiary", onPress: () => { void runSearch(false); } });
  const inspector = createElement(doc, "section", "ch-stock-inspector"); inspector.id = "stock-details"; inspector.setAttribute("aria-label", pt ? "Mídia selecionada" : "Selected media");
  const detailContent = createElement(doc, "div", "ch-stock-inspector__content");
  const back = createActionButton(doc, { id: "stock-back", label: pt ? "Voltar aos resultados" : "Back to results", variant: "tertiary", onPress: () => showDetails(false, true) });
  inspector.appendChild(back.element); inspector.appendChild(detailContent);
  const status = createElement(doc, "p", "ch-stock-status"); status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite");
  const resultMessage = createElement(doc, "p", "ch-stock-result-message");
  resultMessage.setAttribute("role", "status");
  const account = options.openAccount ? createActionButton(doc, {
    id: "stock-sign-in", label: pt ? "Abrir conta" : "Open account", variant: "secondary", onPress: options.openAccount
  }) : null;
  element.appendChild(toolbar); element.appendChild(body);
  body.appendChild(results); body.appendChild(inspector);
  results.appendChild(resultMessage); results.appendChild(suggest); results.appendChild(grid); results.appendChild(more.element);
  if (account) results.appendChild(account.element);
  const details = createActionButton(doc, { id: "stock-show-details", label: pt ? "Detalhes" : "Details", variant: "tertiary", onPress: () => showDetails(!detailsOpen, true) });
  details.button.setAttribute("aria-controls", inspector.id);
  const importButton = createActionButton(doc, { id: "stock-import", label: pt ? "Importar" : "Import", variant: "primary", onPress: () => { void runImport(); } });
  importButton.element.classList.add("ch-panel-action-bar__primary");
  const cancelButton = createActionButton(doc, { id: "stock-cancel", label: pt ? "Cancelar" : "Cancel", variant: "tertiary", onPress: () => job?.cancel() });
  actions.appendChild(status); actions.appendChild(details.element); actions.appendChild(cancelButton.element); actions.appendChild(importButton.element);

  let alive = true, providers: StockProviderInfo[] = [], pages: StockPage[] = [], selected: StockItem | null = null, searching = false, job: StockDownloadJob | null = null;
  let importing = false, detailsOpen = false, signInRequired = false, activeSearchKey = "";
  let message = "", sequence = 0, preview: HTMLMediaElement | null = null, typingTimer: ReturnType<typeof setTimeout> | undefined;
  const key = (): string => JSON.stringify([providerSelect.value, type, search.value.trim().toLowerCase()]);

  function blocking(): string | null {
    if (importing) return pt ? "Importação em andamento." : "Import in progress.";
    if (!selected) return pt ? "Escolha uma mídia." : "Choose a media item.";
    if (!options.context().isComposition) return pt ? "Abra uma composição." : "Open a composition.";
    return null;
  }
  function updateChrome(): void {
    const reason = blocking();
    toolbar.hidden = !providers.length;
    suggest.hidden = !providers.length || Boolean(search.value.trim()) || pages.length > 0 || searching;
    if (account) account.element.hidden = !signInRequired;
    search.disabled = providerSelect.disabled = importing;
    importButton.setDisabled(Boolean(reason), reason ?? undefined);
    details.element.hidden = !selected || Boolean(job);
    cancelButton.element.hidden = !job;
    more.element.hidden = !pages.length || pages[pages.length - 1]!.nextPage === null;
    const wait = importing ? reason : searching ? (pt ? "Buscando…" : "Searching…") : null;
    more.setDisabled(Boolean(wait), wait ?? undefined);
    const inResults = !importing && !selected && !grid.children.length;
    const feedback = inResults ? "" : message || reason || selected?.title || "";
    if (status.textContent !== feedback) status.textContent = feedback;
    status.title = feedback;
    if (resultMessage.textContent !== (inResults ? message : "")) resultMessage.textContent = inResults ? message : "";
    resultMessage.hidden = !resultMessage.textContent;
  }
  function stopPreview(): void { if (preview) { try { preview.pause(); preview.removeAttribute("src"); preview.load(); } catch { /* Detached. */ } preview = null; } }
  function showDetails(open: boolean, focus = false): void {
    detailsOpen = open && Boolean(selected);
    results.hidden = detailsOpen;
    inspector.hidden = !detailsOpen;
    details.button.setAttribute("aria-expanded", String(detailsOpen));
    if (detailsOpen) {
      inspector.scrollTop = 0;
      if (focus) back.button.focus();
    } else {
      preview?.pause?.();
      if (focus) details.button.focus();
    }
  }
  inspector.addEventListener("keydown", event => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); showDetails(false, true); }
  });
  function link(label: string, url: string | undefined): HTMLElement {
    if (!url || !options.openUrl) return createElement(doc, "span", "", label);
    const anchor = createElement(doc, "button", "ch-stock-link", label) as HTMLButtonElement; anchor.type = "button"; anchor.title = url;
    anchor.addEventListener("click", () => options.openUrl?.(url));
    return anchor;
  }
  function renderInspector(): void {
    stopPreview(); clear(detailContent); showDetails(false);
    if (!selected) return;
    const item = selected;
    detailContent.appendChild(createElement(doc, "div", "ch-stock-inspector__title", item.title));
    if (item.type === "image") {
      const image = doc.createElement("img"); image.className = "ch-stock-preview"; image.alt = ""; image.loading = "lazy"; image.referrerPolicy = "no-referrer"; image.src = item.previewUrl;
      detailContent.appendChild(image);
    } else {
      const media = doc.createElement(item.type === "video" ? "video" : "audio"); media.className = "ch-stock-preview"; media.controls = true; media.preload = "none";
      if (item.type === "video") { media.setAttribute("playsinline", ""); (media as HTMLVideoElement).poster = item.thumbnailUrl; }
      media.src = item.previewUrl; preview = media; detailContent.appendChild(media);
    }
    const credit = createElement(doc, "div", "ch-stock-credit");
    credit.appendChild(link(item.author.name, item.author.url)); credit.appendChild(createElement(doc, "span", "", " · "));
    credit.appendChild(link(STOCK_PROVIDER_NAMES[item.provider], item.sourceUrl));
    detailContent.appendChild(credit);
    const terms = createElement(doc, "div", "ch-stock-license");
    terms.appendChild(link(item.license.label, item.license.url));
    terms.appendChild(createElement(doc, "span", "ch-stock-license__note", item.license.attributionRequired ? (pt ? " · crédito obrigatório" : " · credit required") : (pt ? " · crédito opcional" : " · credit optional")));
    detailContent.appendChild(terms);
    if (options.copy) {
      const copy = createActionButton(doc, { id: "stock-copy-credit", label: pt ? "Copiar crédito" : "Copy credit", variant: "tertiary",
        onPress: () => { message = options.copy?.(item.attributionText) ? (pt ? "Crédito copiado." : "Credit copied.") : item.attributionText; updateChrome(); } });
      detailContent.appendChild(copy.element);
    }
  }
  function choose(item: StockItem): void {
    if (!alive || importing) return;
    selected = selected?.id === item.id ? null : item; message = "";
    for (const node of Array.from(grid.children) as HTMLElement[]) node.setAttribute("aria-selected", String(node.dataset["stock"] === selected?.id));
    renderInspector(); updateChrome();
  }
  function tile(item: StockItem): HTMLElement {
    const node = createElement(doc, "button", type === "audio" ? "ch-stock-row" : "ch-stock-tile") as HTMLButtonElement;
    node.type = "button"; node.dataset["stock"] = item.id; node.setAttribute("role", "option"); node.setAttribute("aria-selected", String(selected?.id === item.id)); node.title = item.title;
    const image = doc.createElement("img"); image.className = "ch-stock-thumb"; image.alt = ""; image.loading = "lazy"; image.decoding = "async"; image.referrerPolicy = "no-referrer"; image.src = item.thumbnailUrl;
    node.appendChild(image);
    if (type === "audio") node.appendChild(createElement(doc, "span", "ch-stock-row__name", item.title));
    const duration = formatDuration(item.durationMs);
    if (duration) node.appendChild(createElement(doc, "span", "ch-stock-duration", duration));
    node.setAttribute("aria-label", duration ? `${item.title}, ${duration}` : item.title);
    node.addEventListener("click", () => choose(item));
    node.addEventListener("dblclick", () => { if (selected?.id !== item.id) choose(item); void runImport(); });
    return node;
  }
  function appendResults(items: readonly StockItem[]): void {
    const seen = new Set(Array.from(grid.children, node => (node as HTMLElement).dataset["stock"]));
    for (const item of items) {
      if (seen.has(item.id)) continue;
      grid.appendChild(tile(item)); seen.add(item.id);
    }
  }
  function resetResults(): void {
    sequence++; searching = false; pages = []; selected = null; message = "";
    signInRequired = false;
    renderInspector(); clear(grid); results.scrollTop = 0; updateChrome();
  }

  async function runSearch(fresh: boolean): Promise<void> {
    const query = search.value.trim();
    const provider = providerSelect.value as StockProviderId, cacheKey = key();
    const page = fresh ? 1 : pages[pages.length - 1]?.nextPage;
    if (!alive || importing || !query || !provider || !page || (searching && (!fresh || activeSearchKey === cacheKey))) return;
    clearTimeout(typingTimer);
    memory.query[type] = query; memory.provider[type] = provider;
    if (fresh) {
      resetResults();
      const remembered = memory.pages.get(cacheKey);
      if (remembered) {
        pages = [...remembered]; appendResults(pages.flatMap(result => result.items));
        if (!grid.children.length) message = pt ? "Nenhum resultado. Tente outra busca." : "No results. Try another search.";
        updateChrome(); return;
      }
    }
    const current = ++sequence;
    activeSearchKey = cacheKey;
    searching = true; message = pt ? "Buscando…" : "Searching…"; updateChrome();
    try {
      const client = await options.client();
      if (!alive || current !== sequence) return;
      const result = await client.search({ provider, type, query, page });
      if (!alive || current !== sequence) return;
      pages = [...pages, result]; appendResults(result.items);
      message = grid.children.length ? "" : (pt ? "Nenhum resultado. Tente outra busca." : "No results. Try another search.");
      if (memory.pages.size >= MAX_MEMORY_PAGES) memory.pages.delete(memory.pages.keys().next().value as string);
      memory.pages.set(cacheKey, pages);
    } catch (error) {
      if (alive && current === sequence) {
        const code = codeOf(error);
        signInRequired = code === "SIGN_IN_REQUIRED" || code === "SESSION_EXPIRED";
        message = stockErrorMessage(code, pt);
      }
    } finally { if (alive && current === sequence) { searching = false; updateChrome(); } }
  }

  async function runImport(): Promise<void> {
    if (!alive || blocking() || !selected) return;
    const item = selected;
    importing = true;
    options.busy?.(true); message = pt ? "Preparando o download…" : "Preparing download…"; updateChrome();
    try {
      const ticket = await (await options.client()).prepareDownload(item);
      if (!alive) return;
      job = options.download(ticket, fraction => {
        if (!alive) return;
        message = fraction === null ? (pt ? "Baixando…" : "Downloading…") : `${pt ? "Baixando" : "Downloading"} ${Math.round(fraction * 100)}%`;
        updateChrome();
      });
      updateChrome();
      await job.promise;
      job = null; if (!alive) return;
      message = pt ? "Importando no After Effects…" : "Importing into After Effects…"; updateChrome();
      const response = await options.execute(stockImportArgs(ticket));
      if (!alive) return;
      message = response.ok ? (pt ? `Importado: ${ticket.item.title}. ${ticket.item.license.attributionRequired ? "Lembre de creditar: " + ticket.item.attributionText : ""}` : `Imported: ${ticket.item.title}.`).trim()
        : `${options.error(response)} ${pt ? "O arquivo baixado continua na pasta do Banco de mídia." : "The downloaded file stays in the stock library folder."}`;
    } catch (error) {
      if (alive) {
        const code = codeOf(error);
        signInRequired = code === "SIGN_IN_REQUIRED" || code === "SESSION_EXPIRED";
        message = stockErrorMessage(code, pt);
      }
    }
    finally { job = null; importing = false; options.busy?.(false); if (alive) updateChrome(); }
  }

  async function loadProviders(): Promise<void> {
    message = pt ? "Conectando ao Banco de mídia…" : "Connecting to the stock library…"; updateChrome();
    try {
      providers = (await (await options.client()).providers()).filter(p => p.types.includes(type));
      if (!alive) return;
      clear(providerSelect);
      for (const p of providers) { const option = doc.createElement("option"); option.value = p.id; option.textContent = p.name; providerSelect.appendChild(option); }
      const remembered = memory.provider[type];
      if (providers.length) providerSelect.value = remembered && providers.some(p => p.id === remembered) ? remembered : providers[0]!.id;
      message = providers.length ? "" : (pt ? "Nenhum banco de mídia está ligado para este tipo. O administrador ativa os bancos no servidor." : "No provider is enabled for this media type.");
      if (providers.length && search.value.trim()) { await runSearch(true); return; }
    } catch (error) {
      if (alive) {
        const code = codeOf(error);
        signInRequired = code === "SIGN_IN_REQUIRED" || code === "SESSION_EXPIRED";
        message = stockErrorMessage(code, pt);
      }
    }
    if (alive) updateChrome();
  }

  search.addEventListener("keydown", event => { if (event.key === "Enter") { event.preventDefault(); void runSearch(true); } });
  search.addEventListener("input", () => {
    clearTimeout(typingTimer);
    memory.query[type] = search.value.trim();
    resetResults();
    if (memory.query[type]) typingTimer = setTimeout(() => { void runSearch(true); }, TYPE_DELAY_MS);
  });
  providerSelect.addEventListener("change", () => {
    memory.provider[type] = providerSelect.value as StockProviderId;
    void runSearch(true);
  });
  renderInspector(); updateChrome(); void loadProviders();
  // A running download is not cancelled on dispose: the gallery may redraw mid-import, and the
  // verified file stays in the library for the next attempt. Only the explicit Cancel aborts it.
  return { element, actions, refresh: () => { if (alive) updateChrome(); }, dispose: () => { alive = false; sequence++; clearTimeout(typingTimer); stopPreview(); } };
}
