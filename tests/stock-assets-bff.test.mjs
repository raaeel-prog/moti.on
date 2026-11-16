// motion-assets BFF: provider normalization, compliance filters and the request gate.
// Imports the Edge Function sources directly (Node strips the TypeScript types).
import test from "node:test";
import assert from "node:assert/strict";

import { STOCK_PROVIDERS, mediaUrl } from "../services/supabase/functions/_shared/stock-providers.ts";
import { createAssetsHandler, enabledProviders, searchRequest } from "../services/supabase/functions/motion-assets/handler.ts";

const REQ = { type: "video", query: "ocean", page: 1, perPage: 24 };

test("Pexels video search normalizes to HD MP4, credits the author and keeps the key in a header", () => {
  const call = STOCK_PROVIDERS.pexels.searchCall(REQ, "pexels-secret");
  assert.match(call.url, /^https:\/\/api\.pexels\.com\/videos\/search\?query=ocean&page=1&per_page=24$/);
  assert.equal(call.headers.Authorization, "pexels-secret");
  const page = STOCK_PROVIDERS.pexels.parseSearch({ total_results: 100, next_page: "x", videos: [{
    id: 42, width: 3840, height: 2160, duration: 12, url: "https://www.pexels.com/video/42/", image: "https://images.pexels.com/videos/42/p.jpg",
    user: { name: "Ana", url: "https://www.pexels.com/@ana" },
    video_files: [
      { link: "https://videos.pexels.com/video-files/42/uhd.mp4", file_type: "video/mp4", width: 3840, height: 2160 },
      { link: "https://videos.pexels.com/video-files/42/hd.mp4", file_type: "video/mp4", width: 1920, height: 1080 },
      { link: "https://videos.pexels.com/video-files/42/sd.mp4", file_type: "video/mp4", width: 640, height: 360 },
      { link: "https://evil.example/x.mp4", file_type: "video/mp4", width: 1920, height: 1080 }
    ] }, { id: "bad id!" }] }, REQ);
  assert.equal(page.items.length, 1, "malformed entries are dropped");
  const [item] = page.items;
  assert.equal(item.id, "pexels:42");
  assert.equal(item.previewUrl, "https://videos.pexels.com/video-files/42/sd.mp4");
  assert.equal(item.width, 1920);
  assert.equal(item.durationMs, 12000);
  assert.equal(item.license.commercialUse, true);
  assert.match(item.sourceUrl, /utm_source=moti_on/);
  assert.equal(page.nextPage, 2);
  const detail = STOCK_PROVIDERS.pexels.parseDetail({ id: 42, image: "https://images.pexels.com/p.jpg", video_files: [{ link: "https://videos.pexels.com/video-files/42/hd.mp4", file_type: "video/mp4", width: 1920, height: 1080 }] }, "video");
  assert.deepEqual(detail.rendition, { url: "https://videos.pexels.com/video-files/42/hd.mp4", mimeType: "video/mp4", extension: "mp4", maxBytes: 700 * 1024 * 1024 });
});

test("Pixabay: key goes in the query, orientation maps, square is ignored, per_page respects the minimum", () => {
  const call = STOCK_PROVIDERS.pixabay.searchCall({ type: "image", query: "céu azul", page: 2, perPage: 2, orientation: "portrait" }, "pixa-key");
  assert.match(call.url, /^https:\/\/pixabay\.com\/api\/\?key=pixa-key&q=c%C3%A9u%20azul&page=2&per_page=3&safesearch=true&image_type=photo&orientation=vertical$/);
  assert.doesNotMatch(STOCK_PROVIDERS.pixabay.searchCall({ type: "image", query: "x", page: 1, perPage: 24, orientation: "square" }, "k").url, /orientation/);
  const page = STOCK_PROVIDERS.pixabay.parseSearch({ totalHits: 30, hits: [{ id: 7, tags: "sky, blue", user: "joao", user_id: 9, pageURL: "https://pixabay.com/photos/7/",
    webformatURL: "https://cdn.pixabay.com/w.jpg", largeImageURL: "https://cdn.pixabay.com/l.png", imageWidth: 4000, imageHeight: 3000 }] }, { type: "image", query: "x", page: 1, perPage: 24 });
  assert.equal(page.items[0].title, "Sky, blue");
  assert.equal(page.items[0].author.url, "https://pixabay.com/users/joao-9/?utm_source=moti_on&utm_medium=referral");
  assert.equal(page.nextPage, 2);
  assert.equal(STOCK_PROVIDERS.pixabay.parseDetail({ hits: [{ id: 7, webformatURL: "https://cdn.pixabay.com/w.jpg", largeImageURL: "https://cdn.pixabay.com/l.png" }] }, "image").rendition.extension, "png");
});

test("Unsplash requires attribution and a download tracking call on the API host only", () => {
  const photo = { id: "Dwu85P9SOIk", width: 10, height: 10, urls: { small: "https://images.unsplash.com/s", regular: "https://images.unsplash.com/r", full: "https://images.unsplash.com/f" },
    user: { name: "Lia", links: { html: "https://unsplash.com/@lia" } }, links: { html: "https://unsplash.com/photos/Dwu85P9SOIk", download_location: "https://api.unsplash.com/photos/Dwu85P9SOIk/download?ixid=1" } };
  const detail = STOCK_PROVIDERS.unsplash.parseDetail(photo, "image");
  assert.equal(detail.item.license.attributionRequired, true);
  assert.equal(detail.item.attributionText, "Foto de Lia no Unsplash");
  assert.equal(STOCK_PROVIDERS.unsplash.trackCall(photo, "k").headers.Authorization, "Client-ID k");
  assert.equal(STOCK_PROVIDERS.unsplash.trackCall({ links: { download_location: "https://evil.example/x" } }, "k"), null);
});

test("Freesound keeps only CC0 and CC BY sounds and imports the HQ preview", () => {
  const sound = (id, license) => ({ id, name: "Whoosh 1", username: "zé", license, duration: 1.5, url: `https://freesound.org/people/x/sounds/${id}/`,
    previews: { "preview-hq-mp3": `https://cdn.freesound.org/previews/${id}.mp3` }, images: { waveform_m: `https://cdn.freesound.org/displays/${id}.png` } });
  const page = STOCK_PROVIDERS.freesound.parseSearch({ count: 3, results: [
    sound(1, "http://creativecommons.org/publicdomain/zero/1.0/"), sound(2, "https://creativecommons.org/licenses/by/4.0/"),
    sound(3, "http://creativecommons.org/licenses/by-nc/3.0/"), sound(4, "http://creativecommons.org/licenses/sampling+/1.0/")] }, { type: "audio", query: "x", page: 1, perPage: 24 });
  assert.deepEqual(page.items.map(i => i.license.code), ["cc0", "cc-by"]);
  assert.match(page.items[1].attributionText, /CC BY 4\.0/);
  assert.equal(STOCK_PROVIDERS.freesound.parseDetail(sound(1, "http://creativecommons.org/publicdomain/zero/1.0/")).rendition.extension, "mp3");
});

test("media URLs must be HTTPS on an allowlisted CDN without credentials or ports", () => {
  assert.ok(mediaUrl("https://images.pexels.com/a.jpg"));
  for (const bad of ["http://images.pexels.com/a.jpg", "https://images.pexels.com:8443/a.jpg", "https://u:p@images.pexels.com/a.jpg", "https://images.pexels.com.evil.io/a.jpg", "file:///etc/passwd", 42]) assert.equal(mediaUrl(bad), null, String(bad));
});

test("search requests are validated, never coerced", () => {
  assert.deepEqual(searchRequest({ provider: "pexels", type: "image", query: "  a\u0000b  ", orientation: "square" }).request, { type: "image", query: "a b", page: 1, perPage: 24, orientation: "square" });
  for (const bad of [{ provider: "x", type: "image", query: "a" }, { provider: "pexels", type: "gif", query: "a" }, { provider: "pexels", type: "image", query: "" },
    { provider: "pexels", type: "image", query: "a".repeat(101) }, { provider: "pexels", type: "image", query: "a", page: 0 }, { provider: "pexels", type: "image", query: "a", orientation: "wide" }])
    assert.throws(() => searchRequest(bad), /REQUEST_INVALID/, JSON.stringify(bad));
  assert.deepEqual(enabledProviders({ PEXELS_API_KEY: "12345678", PIXABAY_API_KEY: " " }), ["pexels"]);
});

/** Fake Supabase + provider network. */
function harness({ license = "active", quota = true, providerStatus = 200, cache = new Map() } = {}) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const respond = (status, body) => new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
    if (url.endsWith("/auth/v1/user")) return init.headers.Authorization === `Bearer ${"t".repeat(30)}` ? respond(200, { id: "user-1" }) : respond(401, {});
    if (url.includes("/rpc/motion_license")) return respond(200, { state: license });
    if (url.includes("/rpc/motion_asset_quota")) return respond(200, quota);
    if (url.includes("/motion_asset_cache")) {
      if (init.method === "POST") { const row = JSON.parse(init.body); cache.set(row.key, row.value); return respond(201, ""); }
      const key = /key=eq\.([0-9a-f]+)/.exec(url)[1]; return respond(200, cache.has(key) ? [{ value: cache.get(key) }] : []);
    }
    if (url.startsWith("https://api.pexels.com/v1/search")) return respond(providerStatus, { total_results: 1, photos: [{ id: 5, src: { medium: "https://images.pexels.com/m.jpg", original: "https://images.pexels.com/o.jpg" } }] });
    if (url.startsWith("https://api.unsplash.com/photos/abc/download")) return respond(200, { url: "x" });
    if (url.startsWith("https://api.unsplash.com/photos/abc")) return respond(200, { id: "abc", urls: { small: "https://images.unsplash.com/s", full: "https://images.unsplash.com/f" }, user: { name: "L" }, links: { download_location: "https://api.unsplash.com/photos/abc/download" } });
    return respond(500, {});
  };
  const handler = createAssetsHandler({ env: { SUPABASE_URL: "https://p.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "service", PEXELS_API_KEY: "pexels-key-123", UNSPLASH_ACCESS_KEY: "unsplash-key-123" }, fetch });
  const call = async (body, token = "t".repeat(30)) => {
    const response = await handler(new Request("https://p.supabase.co/functions/v1/motion-assets", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body) }));
    return { status: response.status, body: await response.json() };
  };
  return { call, calls, cache };
}

test("only signed-in, licensed accounts within quota reach a provider", async () => {
  assert.equal((await harness().call({ action: "assets.providers" }, "bad")).status, 401);
  assert.deepEqual(await harness({ license: "missing" }).call({ action: "assets.providers" }), { status: 403, body: { error: "LICENSE_REQUIRED" } });
  assert.deepEqual(await harness({ quota: false }).call({ action: "assets.providers" }), { status: 429, body: { error: "RATE_LIMITED" } });
  const providers = await harness({ license: "device_limit" }).call({ action: "assets.providers" });
  assert.deepEqual(providers.body.providers.map(p => p.id), ["pexels", "unsplash"], "only configured providers are offered");
  assert.equal((await harness().call({ action: "assets.search", provider: "pixabay", type: "image", query: "x" })).body.error, "PROVIDER_DISABLED");
});

test("search results are cached for 24 h and provider failures surface as stable codes", async () => {
  const h = harness();
  const first = await h.call({ action: "assets.search", provider: "pexels", type: "image", query: "sea" });
  assert.equal(first.status, 200);
  assert.equal(first.body.items[0].id, "pexels:5");
  await h.call({ action: "assets.search", provider: "pexels", type: "image", query: "sea" });
  assert.equal(h.calls.filter(c => c.url.startsWith("https://api.pexels.com")).length, 1, "second search served from cache");
  assert.ok(!JSON.stringify(first.body).includes("pexels-key-123"), "key never leaves the server");
  assert.deepEqual(await harness({ providerStatus: 429 }).call({ action: "assets.search", provider: "pexels", type: "image", query: "sea" }), { status: 429, body: { error: "PROVIDER_RATE_LIMITED" } });
  assert.deepEqual(await harness({ providerStatus: 500 }).call({ action: "assets.search", provider: "pexels", type: "image", query: "sea" }), { status: 502, body: { error: "PROVIDER_UNAVAILABLE" } });
});

test("download re-reads the provider and fires Unsplash tracking", async () => {
  const h = harness();
  const result = await h.call({ action: "assets.download", provider: "unsplash", type: "image", assetId: "abc" });
  assert.equal(result.status, 200);
  assert.equal(result.body.rendition.url, "https://images.unsplash.com/f");
  assert.ok(h.calls.some(c => c.url.startsWith("https://api.unsplash.com/photos/abc/download")));
  assert.equal((await h.call({ action: "assets.download", provider: "unsplash", type: "image", assetId: "../x" })).status, 400);
});
