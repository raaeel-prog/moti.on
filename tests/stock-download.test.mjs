// CEP downloader for the stock library: allowlist, redirects, size, signature, checksum, reuse.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { EventEmitter } from "node:events";

import { MEDIA_HOSTS as BFF_HOSTS } from "../services/supabase/functions/_shared/stock-providers.ts";

const require = createRequire(import.meta.url);
const { createStockDownloader, MEDIA_HOSTS, signatureMatches } = require("../apps/after-effects-cep/account/stock-download.cjs");

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(60, 7)]);
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypisom"), Buffer.alloc(60, 1)]);

/** Fake `https` serving a route table: { url: { status, body, headers } }. */
function fakeHttps(routes) {
  const requested = [];
  return { requested, get(url, _options, callback) {
    requested.push(String(url));
    const call = new EventEmitter();
    call.setTimeout = () => call; call.destroy = error => { if (error) call.emit("error", error); };
    queueMicrotask(() => {
      const route = routes[String(url)] ?? { status: 404, body: Buffer.alloc(0) };
      const response = new EventEmitter();
      Object.assign(response, { statusCode: route.status, headers: route.headers ?? { "content-length": String(route.body?.length ?? 0) }, resume() {}, destroy() {} });
      callback(response);
      if (route.body) { response.emit("data", route.body); response.emit("end"); }
    });
    return call;
  } };
}
const request = (over = {}) => ({ provider: "pexels", assetId: "42", extension: "jpg", url: "https://images.pexels.com/42.jpg", maxBytes: 1024, item: { attributionText: "Foto de Ana no Pexels" }, ...over });
const root = () => mkdtempSync(path.join(tmpdir(), "motion-stock-"));

test("panel and BFF allow exactly the same media hosts", () => {
  assert.deepEqual([...MEDIA_HOSTS].sort(), [...BFF_HOSTS].sort());
});

test("downloads into the library, writes the provenance sidecar and reuses a verified copy", async () => {
  const dir = root(), https = fakeHttps({ "https://images.pexels.com/42.jpg": { status: 200, body: JPEG } });
  const downloader = createStockDownloader({ root: dir, https });
  const first = await downloader.download(request()).promise;
  assert.equal(first.reused, false);
  const file = path.join(dir, "Moti.on", "Banco de midia", "pexels", "42.jpg");
  assert.deepEqual(readFileSync(file), JPEG);
  const sidecar = JSON.parse(readFileSync(`${file}.chms-asset.json`, "utf8"));
  assert.equal(sidecar.sha256, first.sha256);
  assert.equal(sidecar.item.attributionText, "Foto de Ana no Pexels");
  assert.equal((await downloader.download(request()).promise).reused, true);
  assert.equal(https.requested.length, 1);
  rmSync(dir, { recursive: true, force: true });
});

test("follows redirects only to allowlisted hosts", async () => {
  const dir = root();
  const ok = fakeHttps({ "https://images.pexels.com/42.jpg": { status: 302, headers: { location: "https://images.pexels.com/real.jpg" } }, "https://images.pexels.com/real.jpg": { status: 200, body: JPEG } });
  assert.equal((await createStockDownloader({ root: dir, https: ok }).download(request()).promise).reused, false);
  const evil = fakeHttps({ "https://images.pexels.com/42.jpg": { status: 302, headers: { location: "http://169.254.169.254/latest" } } });
  await assert.rejects(createStockDownloader({ root: root(), https: evil }).download(request()).promise, /DOWNLOAD_REDIRECT_BLOCKED/);
});

test("rejects foreign hosts, oversize payloads, spoofed types and bad ids without leaving files", async () => {
  const dir = root();
  const https = fakeHttps({ "https://images.pexels.com/42.jpg": { status: 200, body: Buffer.from("<html><script>alert(1)</script>" + " ".repeat(40)) },
    "https://videos.pexels.com/big.mp4": { status: 200, body: Buffer.alloc(2048), headers: {} } });
  const downloader = createStockDownloader({ root: dir, https });
  await assert.rejects(downloader.download(request({ url: "https://evil.example/42.jpg" })).promise, /DOWNLOAD_REQUEST_INVALID/);
  await assert.rejects(downloader.download(request({ assetId: "../../x" })).promise, /DOWNLOAD_REQUEST_INVALID/);
  await assert.rejects(downloader.download(request()).promise, /DOWNLOAD_TYPE_MISMATCH/);
  await assert.rejects(downloader.download(request({ extension: "mp4", url: "https://videos.pexels.com/big.mp4" })).promise, /DOWNLOAD_TOO_LARGE/);
  assert.deepEqual(readdirSync(path.join(dir, "Moti.on", "Banco de midia", "pexels")), [], "no partial or spoofed file is kept");
  assert.equal(existsSync(path.join(dir, "Moti.on", "Banco de midia", "pexels", "42.jpg")), false);
});

test("content signatures decide the media type", () => {
  assert.ok(signatureMatches("jpg", JPEG));
  assert.ok(signatureMatches("mp4", MP4));
  assert.ok(signatureMatches("mp3", Buffer.from("ID3\u0004\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000")));
  assert.ok(signatureMatches("wav", Buffer.from("RIFF\u0000\u0000\u0000\u0000WAVEfmt ")));
  assert.equal(signatureMatches("png", JPEG), false);
  assert.equal(signatureMatches("exe", Buffer.from("MZ")), false);
});
