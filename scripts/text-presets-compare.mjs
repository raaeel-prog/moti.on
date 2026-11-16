/* global window -- evaluated inside the browser page. */
/** Compares the card's drawn text preview with the After Effects reference
 * render, frame by frame, so a card shows the preset it applies.
 * Run after `text-presets-render.mjs --render`:
 *   node scripts/text-presets-compare.mjs [--only=id,id] [--report=path] [<playwright/index.mjs>]
 * Score: share of text pixels that the other image also covers within 2 px
 * (1 = identical silhouettes). Browser and ffmpeg only; never opens Adobe. */
import { build } from "esbuild";
import { readFile, writeFile, access } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidence = path.join(root, "artifacts", "text-presets");
const ffmpeg = process.env.MOTION_FFMPEG || "C:\\Users\\raaee\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg.Shared_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.1.2-full_build-shared\\bin\\ffmpeg.exe";
const runtime = process.argv.slice(2).find(value => value.endsWith(".mjs")) ?? "C:/Users/raaee/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";
const onlyArg = process.argv.find(value => value.startsWith("--only=")), only = onlyArg ? new Set(onlyArg.slice(7).split(",")) : null;
const reportArg = process.argv.find(value => value.startsWith("--report="));
const dumpArg = process.argv.find(value => value.startsWith("--dump=")), dump = dumpArg ? dumpArg.slice(7) : "";
const W = 480, H = 270, FPS = 30, FRAMES = [2, 5, 8, 11, 15, 20, 25, 32, 40, 50];
const exists = async file => { try { await access(file); return true; } catch { return false; } };

const job = JSON.parse(await readFile(path.join(evidence, "render-job.json"), "utf8"));
const background = Math.round(job.fixture.background[0] * 255), threshold = background + 45;
const entries = [];
for (const entry of job.entries) if ((!only || only.has(entry.id)) && await exists(entry.avi)) entries.push(entry);

const bundle = await build({ stdin: { resolveDir: root, contents: `
import { paintLibraryPreview } from "./apps/after-effects-cep/client/src/motion-library-preview.ts";
window.paintGray = async (preset, options, time) => {
  const ns = "http://www.w3.org/2000/svg", svg = document.createElementNS(ns, "svg");
  svg.setAttribute("xmlns", ns); svg.setAttribute("viewBox", "0 0 320 180"); svg.setAttribute("width", "${W}"); svg.setAttribute("height", "${H}");
  svg.setAttribute("color", "#f2f2f5"); svg.setAttribute("style", "color:#f2f2f5;background:#212121");
  paintLibraryPreview(svg, preset, options, time);
  const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" }), url = URL.createObjectURL(blob), image = new Image();
  await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = url; });
  const canvas = document.createElement("canvas"); canvas.width = ${W}; canvas.height = ${H};
  const context = canvas.getContext("2d"); context.fillStyle = "#212121"; context.fillRect(0, 0, ${W}, ${H}); context.drawImage(image, 0, 0); URL.revokeObjectURL(url);
  const rgba = context.getImageData(0, 0, ${W}, ${H}).data, gray = new Uint8Array(${W * H});
  for (let i = 0; i < gray.length; i++) gray[i] = Math.round(rgba[i * 4] * .299 + rgba[i * 4 + 1] * .587 + rgba[i * 4 + 2] * .114);
  return gray;
};
/** Every requested instant in one call, as base64: a JSON number array per frame was the bottleneck. */
window.paintFrames = async (preset, options, times) => {
  let binary = "";
  for (const time of times) { const gray = await window.paintGray(preset, options, time); for (let i = 0; i < gray.length; i += 8192) binary += String.fromCharCode.apply(null, gray.subarray(i, i + 8192)); }
  return btoa(binary);
};` }, bundle: true, platform: "browser", format: "iife", write: false });

const { chromium } = await import(pathToFileURL(runtime).href);
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setContent("<!doctype html><html><body></body></html>");
await page.addScriptTag({ content: bundle.outputFiles[0].text });

/** Text pixels of a frame as a 0/1 mask, plus a 2 px dilation of it. */
function masks(gray) {
  const mask = new Uint8Array(W * H), wide = new Uint8Array(W * H);
  for (let i = 0; i < mask.length; i++) mask[i] = gray[i] > threshold ? 1 : 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (mask[y * W + x])
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const yy = y + dy, xx = x + dx; if (yy >= 0 && yy < H && xx >= 0 && xx < W) wide[yy * W + xx] = 1; }
  let count = 0; for (const v of mask) count += v;
  return { mask, wide, count };
}
function score(a, b) {
  if (!a.count && !b.count) return 1;
  if (!a.count || !b.count) return 0;
  let hitA = 0, hitB = 0;
  for (let i = 0; i < a.mask.length; i++) { if (a.mask[i] && b.wide[i]) hitA++; if (b.mask[i] && a.wide[i]) hitB++; }
  return (hitA + hitB) / (a.count + b.count);
}

const results = [];
for (const entry of entries) {
  const raw = spawnSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-i", entry.avi, "-frames:v", String(Math.max(...FRAMES) + 1), "-f", "rawvideo", "-pix_fmt", "gray", "-"], { maxBuffer: 64 << 20 });
  if (raw.status !== 0) { results.push({ id: entry.id, error: String(raw.stderr) }); continue; }
  const frames = [], strip = [];
  const painted = Buffer.from(await page.evaluate(([preset, options, times]) => window.paintFrames(preset, options, times), [entry.recipe, entry.options, FRAMES.map(frame => frame / FPS)]), "base64");
  for (const [k, frame] of FRAMES.entries()) {
    const aeGray = raw.stdout.subarray(frame * W * H, (frame + 1) * W * H), ae = masks(aeGray);
    const drawnGray = painted.subarray(k * W * H, (k + 1) * W * H), drawn = masks(drawnGray);
    if (dump) strip.push([aeGray, drawnGray]);
    frames.push({ time: Number((frame / FPS).toFixed(3)), score: Number(score(ae, drawn).toFixed(3)), ink: ae.count ? Number((drawn.count / ae.count).toFixed(2)) : null });
  }
  const mean = frames.reduce((sum, f) => sum + f.score, 0) / frames.length, worst = frames.reduce((low, f) => f.score < low.score ? f : low);
  results.push({ id: entry.id, mean: Number(mean.toFixed(3)), worst, frames });
  if (dump) {
    // One row per instant: After Effects on the left, the drawn card on the right.
    const sheet = Buffer.alloc(W * 2 * H * strip.length);
    strip.forEach(([a, b], row) => { for (let y = 0; y < H; y++) { sheet.set(a.subarray(y * W, y * W + W), (row * H + y) * W * 2); sheet.set(b.subarray(y * W, y * W + W), (row * H + y) * W * 2 + W); } });
    spawnSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "gray", "-s", `${W * 2}x${H * strip.length}`, "-i", "-", "-vf", "scale=iw/2:ih/2", path.join(dump, `${entry.id}.png`)], { input: sheet });
  }
  console.log(`${mean.toFixed(3)} worst ${worst.score.toFixed(3)}@${worst.time}s ink ${worst.ink} ${entry.id}`);
}
await browser.close();
const summary = { count: results.length, mean: Number((results.reduce((s, r) => s + (r.mean ?? 0), 0) / Math.max(1, results.length)).toFixed(3)), results };
await writeFile(reportArg ? reportArg.slice(9) : path.join(evidence, "compare-report.json"), `${JSON.stringify(summary, null, 2)}\n`);
console.log(`MEAN ${summary.mean} over ${summary.count} presets`);
