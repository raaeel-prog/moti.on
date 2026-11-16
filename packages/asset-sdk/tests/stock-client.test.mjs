import test from "node:test";
import assert from "node:assert/strict";

import { createStockClient, parseStockItem, parseStockPage, parseStockTicket, STOCK_MEDIA_HOSTS, stockErrorMessage } from "../dist/index.js";
import { STOCK_PROVIDERS, MEDIA_HOSTS } from "../../../services/supabase/functions/_shared/stock-providers.ts";

const photo = { id: 5, width: 100, height: 50, url: "https://www.pexels.com/photo/5/", photographer: "Ana", photographer_url: "https://www.pexels.com/@ana",
  src: { medium: "https://images.pexels.com/m.jpg", large: "https://images.pexels.com/l.jpg", original: "https://images.pexels.com/o.jpg" } };

test("whatever the BFF normalizes passes the panel validator unchanged", () => {
  assert.deepEqual([...STOCK_MEDIA_HOSTS].sort(), [...MEDIA_HOSTS].sort());
  const request = { type: "image", query: "x", page: 1, perPage: 24 };
  const page = { provider: "pexels", type: "image", ...STOCK_PROVIDERS.pexels.parseSearch({ total_results: 1, photos: [photo] }, request) };
  assert.deepEqual(parseStockPage(JSON.parse(JSON.stringify(page))), page);
  const detail = STOCK_PROVIDERS.pexels.parseDetail(photo, "image");
  assert.deepEqual(parseStockTicket(JSON.parse(JSON.stringify(detail))), detail);
});

test("an item outside the contract is dropped, a broken page is rejected", () => {
  const item = STOCK_PROVIDERS.pexels.parseDetail(photo, "image").item;
  assert.equal(parseStockItem({ ...item, thumbnailUrl: "https://evil.example/x.jpg" }), null);
  assert.equal(parseStockItem({ ...item, previewUrl: "javascript:alert(1)" }), null);
  assert.equal(parseStockItem({ ...item, id: "unsplash:5" }), null);
  assert.equal(parseStockPage({ provider: "pexels", type: "image", items: [item, { ...item, title: "x\u0000" }], page: 1, nextPage: null, total: 2 }).items.length, 1);
  assert.throws(() => parseStockPage({ items: [] }), /RESPONSE_INVALID/);
  assert.throws(() => parseStockTicket({ item, rendition: { url: "https://images.pexels.com/o.jpg", mimeType: "image/jpeg", extension: "exe", maxBytes: 1 } }), /RESPONSE_INVALID/);
});

test("client sends only the documented fields and maps failures to stable codes", async () => {
  const sent = [];
  const client = createStockClient(async body => { sent.push(body); if (body.action === "assets.download") throw new Error("PROVIDER_DISABLED"); return { providers: [{ id: "pexels", name: "Pexels", types: ["video", "image"] }, { id: "giphy", name: "x", types: [] }] }; });
  assert.deepEqual((await client.providers()).map(p => p.id), ["pexels"]);
  await assert.rejects(client.prepareDownload({ provider: "pexels", type: "image", providerAssetId: "5" }), /PROVIDER_DISABLED/);
  assert.deepEqual(sent[1], { action: "assets.download", provider: "pexels", type: "image", assetId: "5" });
  await assert.rejects(createStockClient(async () => { throw new Error("socket hang up"); }).providers(), /NETWORK_UNAVAILABLE/);
  assert.match(stockErrorMessage("LICENSE_REQUIRED", true), /contas aprovadas/);
});
