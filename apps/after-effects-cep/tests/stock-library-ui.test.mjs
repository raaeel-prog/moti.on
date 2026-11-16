import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { createCepDocument } from "./cep-dom.mjs";
import { createI18n } from "../../../packages/ui-core/dist/i18n.js";
import { stockImportError } from "../../../packages/contracts/dist/index.js";
import { StockError } from "../../../packages/asset-sdk/dist/index.js";

const built = await build({ entryPoints: [fileURLToPath(new URL("../client/src/stock-library.ts", import.meta.url))], bundle: true, platform: "node", format: "esm", write: false });
const ui = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString("base64")}`);
const ok = { protocolVersion: 1, requestId: "stock", ok: true, data: {}, warnings: [], error: null };

const item = (n, over = {}) => ({ id: `pexels:${n}`, provider: "pexels", providerAssetId: String(n), type: "video", title: `Ondas ${n}`, thumbnailUrl: `https://images.pexels.com/${n}.jpg`,
  previewUrl: `https://videos.pexels.com/${n}.mp4`, previewMimeType: "video/mp4", durationMs: 12000, author: { name: "Ana", url: "https://www.pexels.com/@ana" },
  sourceUrl: "https://www.pexels.com/video/1/", license: { code: "pexels", label: "Licença Pexels", url: "https://www.pexels.com/license/", commercialUse: true, attributionRequired: false },
  attributionText: "Vídeo de Ana no Pexels", ...over });

function fixture(t, { comp = true, providers = [{ id: "pexels", name: "Pexels", types: ["video", "image"] }], failSearch = null, query = "", searchGate, ticketGate } = {}) {
  const doc = createCepDocument(), calls = { search: [], download: [], execute: [], opened: [] };
  const client = {
    async providers() { return providers; },
    async search(q) {
      calls.search.push(q);
      await searchGate?.(q.query);
      if (failSearch) throw new StockError(failSearch);
      const offset = q.page === 2 ? 2 : 0;
      return { provider: q.provider, type: q.type, items: [item(1 + offset), item(2 + offset)], page: q.page ?? 1, nextPage: (q.page ?? 1) < 2 ? 2 : null, total: 4 };
    },
    async prepareDownload(i) {
      await ticketGate;
      return { item: item(i.providerAssetId), rendition: { url: "https://videos.pexels.com/hd.mp4", mimeType: "video/mp4", extension: "mp4", maxBytes: 1000 } };
    }
  };
  const library = ui.createStockLibrary(doc, { i18n: createI18n({ locale: "pt-BR" }), type: "video", query, context: () => ({ isComposition: comp }), client: async () => client,
    download: (ticket, progress) => { calls.download.push(ticket); progress(0.5); return { promise: Promise.resolve({ reused: false }), cancel() {} }; },
    execute: async args => { calls.execute.push(args); return ok; }, error: () => "erro", openUrl: url => calls.opened.push(url), copy: () => true });
  t.after(() => library.dispose());
  const all = tag => [...library.element.getElementsByTagName(tag), ...library.actions.getElementsByTagName(tag)];
  const byId = (tag, id) => all(tag).find(node => node.id === id);
  const tiles = () => all("button").filter(b => b.dataset?.stock);
  const status = () => all("p").find(p => p.className === "ch-stock-result-message" && !p.hidden)?.textContent ||
    all("p").find(p => p.className === "ch-stock-status").textContent;
  return { library, calls, byId, tiles, status };
}
// Results stay in a module-level memory between views, so each test uses its own query.
const tick = () => new Promise(resolve => setImmediate(resolve));

test("searches the chosen provider and imports the server ticket with its credit", async t => {
  const f = fixture(t, { query: "ocean" });
  await tick();
  assert.deepEqual(f.calls.search, [{ provider: "pexels", type: "video", query: "ocean", page: 1 }], "gallery search seeds the first query");
  assert.equal(f.tiles().length, 2);
  const importButton = f.byId("button", "stock-import");
  assert.equal(importButton.getAttribute("aria-disabled"), "true", "nothing chosen");
  f.tiles()[0].click();
  assert.notEqual(importButton.getAttribute("aria-disabled"), "true");
  importButton.click(); await tick();
  assert.equal(f.calls.download.length, 1);
  assert.deepEqual(f.calls.execute, [{ provider: "pexels", assetId: "1", extension: "mp4", title: "Ondas 1", credit: "Vídeo de Ana no Pexels" }]);
  assert.equal(stockImportError(f.calls.execute[0]), null, "panel arguments pass the host contract");
  assert.match(f.status(), /Importado: Ondas 1/);
});

test("load more appends the next page; credits open in the browser", async t => {
  const f = fixture(t, { query: "forest" });
  await tick();
  const first = f.tiles()[0];
  first.click();
  f.byId("button", "stock-more").click(); await tick();
  assert.equal(f.calls.search[1].page, 2);
  assert.equal(f.tiles().length, 4);
  assert.ok(f.tiles()[0] === first && first.getAttribute("aria-selected") === "true", "pagination preserves the selected DOM node");
  f.byId("button", "stock-show-details").click();
  assert.equal(f.byId("button", "stock-show-details").getAttribute("aria-expanded"), "true");
  f.byId("button", "stock-copy-credit").click();
  assert.equal(f.status(), "Crédito copiado.");
});

test("ignores stale search results and repeated imports while the ticket is pending", async t => {
  let resolveSearch, resolveTicket;
  const pendingSearch = new Promise(resolve => { resolveSearch = resolve; });
  const ticketGate = new Promise(resolve => { resolveTicket = resolve; });
  const f = fixture(t, { query: "old query", searchGate: query => query === "old query" ? pendingSearch : undefined, ticketGate });
  await tick();
  const input = f.byId("input", "stock-query");
  input.value = "new query"; input.emit("input"); input.emit("keydown", { key: "Enter" }); await tick();
  assert.equal(f.calls.search.at(-1).query, "new query");
  const selected = f.tiles()[0]; selected.click();
  resolveSearch(); await tick();
  assert.ok(f.tiles()[0] === selected && selected.getAttribute("aria-selected") === "true");
  const importButton = f.byId("button", "stock-import");
  importButton.click(); importButton.click(); selected.emit("dblclick");
  assert.equal(importButton.getAttribute("aria-disabled"), "true");
  resolveTicket(); await tick();
  assert.equal(f.calls.download.length, 1);
  assert.equal(f.calls.execute.length, 1);
});

test("import waits for a composition, and errors are explained in plain language", async t => {
  const f = fixture(t, { comp: false, query: "desert" });
  await tick();
  f.tiles()[0].click();
  assert.equal(f.byId("button", "stock-import").getAttribute("aria-disabled"), "true");
  const denied = fixture(t, { failSearch: "LICENSE_REQUIRED", query: "rain" });
  await tick();
  assert.match(denied.status(), /contas aprovadas/);
  const off = fixture(t, { providers: [] });
  await tick();
  assert.match(off.status(), /Nenhum banco de mídia está ligado/);
});

test("import arguments come from the ticket and are clipped to the contract", () => {
  const args = ui.stockImportArgs({ item: item(9, { title: "  ", attributionText: "x".repeat(500) }), rendition: { extension: "mp4" } });
  assert.equal(args.title, "Pexels 9");
  assert.equal(args.credit.length, 400);
  assert.equal(ui.formatDuration(125000), "2:05");
});

test("empty search shows suggestions; a suggestion or typing runs the search", async t => {
  const f = fixture(t);
  await tick();
  // The view remembers the last search between tabs; clearing the field brings the suggestions back.
  const input = f.byId("input", "stock-query");
  input.value = ""; input.emit("input");
  const empty = f.library.element.getElementsByTagName("div").find(node => node.className === "ch-stock-empty");
  assert.equal(empty.hidden, false, "suggestions shown with an empty search");
  assert.equal(f.tiles().length, 0);
  const chips = f.library.element.getElementsByTagName("button").filter(b => b.className === "ch-stock-suggestion");
  assert.equal(chips.length, ui.STOCK_SUGGESTIONS.video.length);
  assert.equal(chips[0].textContent, "Natureza");
  chips[0].click(); await tick();
  assert.deepEqual(f.calls.search.at(-1), { provider: "pexels", type: "video", query: "nature", page: 1 }, "label in Portuguese, query in English");
  assert.equal(empty.hidden, true);
  input.value = "waves"; input.emit("input");
  await new Promise(resolve => setTimeout(resolve, 500)); await tick();
  assert.equal(f.calls.search.at(-1).query, "waves", "typing searches after a short pause");
});
