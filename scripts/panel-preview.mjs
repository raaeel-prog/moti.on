/**
 * Browser-only preview of the AE panel. Serves dist/ plus two virtual files that never touch dist/
 * (tests/build-output.test.mjs pins its file list): preview.html, the panel's index.html with a fixture
 * script, and preview-fixture.js, a fake CSInterface that answers context reads with an open composition.
 * Screenshots taken here are layout evidence only, never host proof.
 *
 *   node scripts/panel-preview.mjs [port]   → http://127.0.0.1:4174/after-effects-cep/client/preview.html (?comp=0: no comp)
 * scripts/panel-layout-audit.mjs imports startPreviewServer().
 */
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve("dist");
const CLIENT = "/after-effects-cep/client/";
const TYPES = { ".css": "text/css", ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".mp4": "video/mp4" };

async function fixtureScript() {
  const { attachLicensedAccount } = await import("../apps/after-effects-cep/tests/licensed-account-fixture.mjs");
  return `(function () {
var storage = new Map();
Object.defineProperty(window, "localStorage", { configurable: true, value: {
  getItem: function (k) { return storage.has(k) ? storage.get(k) : null; },
  setItem: function (k, v) { storage.set(k, String(v)); },
  removeItem: function (k) { storage.delete(k); }
} });
var noComp = /[?&]comp=0/.test(location.search);
var context = { hostVersion: "26.5", projectName: "Preview", projectPath: null, activeItemName: noComp ? null : "Preview comp",
  isComposition: !noComp, compWidth: 1920, compHeight: 1080, compDuration: 10, compFrameRate: 30, currentTime: 0, workAreaStart: 0,
  workAreaDuration: 10, selectionLayerCount: 1, selectionTextLayerCount: 0, selectionPropertyCount: 1, selectionExpressibleCount: 1,
  selectionSelectedKeyCount: 2, selectionHasKeyframes: true, selectionHasExpressions: false, selectionIs3D: false,
  averageLayerDurationSeconds: 10, selectionTruncated: false, selectionSignature: "preview" };
function answer(command) {
  if (command === "ae.context.read") return context;
  // A page script may set window.__motionInspect to preview the Edit tab with an applied preset.
  if (command === "ae.presets.inspect") return window.__motionInspect || { state: "unmanaged", message: "", phases: [] };
  if (command === "ae.presets.personal-list") return { roots: [], folders: [], items: [] };
  return { appliedCount: 1, unchangedCount: 0 };
}
function CSInterface() {}
CSInterface.prototype.getHostEnvironment = function () { return { appVersion: "26.5", appUILocale: "pt_BR" }; };
CSInterface.prototype.getSystemPath = function () { return "/preview"; };
CSInterface.prototype.addEventListener = function () {};
CSInterface.prototype.removeEventListener = function () {};
CSInterface.prototype.dispatchEvent = function () {};
CSInterface.prototype.evalScript = function (script, callback) {
  if (!callback) return;
  if (script.indexOf("MotionAE.dispatch(") !== 0) { callback("function"); return; }
  var request = JSON.parse(JSON.parse(script.slice("MotionAE.dispatch(".length, -1)));
  setTimeout(function () {
    callback(JSON.stringify({ protocolVersion: 1, requestId: request.requestId, ok: true, data: answer(request.command), warnings: [], error: null }));
  }, 0);
};
(${attachLicensedAccount.toString().replace("window.localStorage = { getItem: () => null, setItem() {} };", "")})(window, CSInterface);
})();
`;
}

async function previewPage() {
  const index = await readFile(path.join(root, CLIENT, "index.html"), "utf8");
  const html = index.replace('<script src="lib/CSInterface.js"></script>', '<script src="lib/CSInterface.js"></script>\n  <script src="preview-fixture.js"></script>');
  if (html === index) throw new Error("index.html changed shape; the preview fixture could not be injected.");
  return html;
}

/** Starts the preview server; resolves to { url, close() }. Port 0 picks a free one. */
export async function startPreviewServer(port = 0) {
  const virtual = { [`${CLIENT}preview.html`]: ["text/html", await previewPage()], [`${CLIENT}preview-fixture.js`]: ["text/javascript", await fixtureScript()] };
  const server = createServer(async (request, response) => {
    const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://x").pathname);
    const entry = virtual[pathname];
    if (entry) { response.writeHead(200, { "Content-Type": entry[0], "Cache-Control": "no-store" }).end(entry[1]); return; }
    const file = path.resolve(root, "." + pathname);
    if (path.relative(root, file).startsWith("..")) { response.writeHead(400).end(); return; }
    try {
      if (!(await stat(file)).isFile()) throw new Error("not a file");
      response.writeHead(200, { "Content-Type": TYPES[path.extname(file)] ?? "application/octet-stream", "Cache-Control": "no-store" });
      createReadStream(file).pipe(response);
    } catch { response.writeHead(404).end(); }
  });
  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
  return { url: `http://127.0.0.1:${server.address().port}${CLIENT}preview.html`, close: () => server.close() };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { url } = await startPreviewServer(Number(process.argv[2] ?? 4174));
  console.log(`Preview: ${url} (?comp=0 for no composition). Ctrl+C to stop.`);
}
