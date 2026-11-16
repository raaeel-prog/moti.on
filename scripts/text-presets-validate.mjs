/** Validates the text library in After Effects on real text layers. Opens its own
 * isolated AE instance on an empty project (never the user's), applies presets
 * through the panel's commands and checks, from the layer's real bounds:
 *  - all:       every text preset applies with no expression error, rests exactly
 *               where the text was, keeps the layer's Anchor Point and Position
 *               and removes completely (left-aligned, two lines);
 *  - align:     a preset moves the text the same way relative to its own box
 *               whether the paragraph is left, centre or right aligned;
 *  - size:      distances follow the font size (em), so a big title and a caption
 *               keep the same proportions as the card;
 *  - direction: every side of a directional preset is a different motion.
 * Usage: node scripts/text-presets-validate.mjs [--only=all,align,size,direction] [--limit=N]
 * Evidence: artifacts/text-presets/validation-report.json and validation-summary.json. */
import { build } from "esbuild";
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { groupConditionalBranches, toAsciiExtendScript } from "./build-extendscript.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidence = path.join(root, "artifacts", "text-presets");
const aeDirectory = process.env.MOTION_AE_DIRECTORY || "C:\\Program Files\\Adobe\\Adobe After Effects 2026\\Support Files";
const afterEffects = path.join(aeDirectory, "AfterFX.exe");
const only = new Set((process.argv.find(arg => arg.startsWith("--only="))?.slice(7) ?? "all,align,size,direction").split(","));
const limit = Number(process.argv.find(arg => arg.startsWith("--limit="))?.slice(8) ?? Infinity);
const normalized = value => value.replaceAll("\\", "/");
const SECONDS = 4, REST = 2;

const compiled = await build({ entryPoints: [path.join(root, "packages", "contracts", "src", "index.ts")], bundle: true, format: "esm", platform: "node", write: false });
const contracts = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString("base64")}`);
const text = contracts.MOTION_LIBRARY_PRESETS.filter(p => p.category.startsWith("text-")).slice(0, limit);
const optionsFor = (p, extra = {}) => ({ ...contracts.MOTION_LIBRARY_DEFAULTS, ...p.defaults, phase: p.mode === "transition" ? "both" : "in", direction: "preset", unit: "preset", ...extra });
const sampleTimes = (p, o) => { const d = o.durationFrames / 30; return p.mode === "transition" ? [0, d * .15, d * .3, d * .5] : [.2, .7, 1.3]; };
const cases = [];
const add = (set, p, textValue, fontSize, justification, extra = {}) => { const options = optionsFor(p, extra); cases.push({ key: `${set}:${p.id}:${justification}:${fontSize}:${options.direction}`, set, id: p.id, mode: p.mode, text: textValue, fontSize, justification, options, sampleTimes: sampleTimes(p, options) }); };
// Spacing, scale and turns are the parts that depend on a reference point.
const pivoting = p => p.mode === "transition" && (p.text.tracking || p.scale.some(Boolean) || p.rotation.some(Boolean));
if (only.has("all")) for (const p of text) add("all", p, "MOTION PRESETS\rTexto animado", 90, "left");
if (only.has("align")) for (const p of text.filter(pivoting)) for (const side of ["left", "center", "right"]) add("align", p, "MOTION PRESETS", 100, side);
const sized = ["text-v3-characters-tracking-converge", "text-v3-words-tracking-spread", "text-v3-characters-position-rise", "text-v3-characters-scale-bloom", "text-v3-characters-rotate-lean", "text-v3-words-mask-rise-window", "studio-letter-air-spacing", "premium-glyph-stomp"];
if (only.has("size")) for (const id of sized) for (const size of [40, 100, 220]) { const p = text.find(item => item.id === id); if (p) add("size", p, "MOTION PRESETS", size, "left"); }
const sided = ["text-v3-characters-position-rise", "text-v3-characters-rotate-arc", "text-v3-characters-scale-grow-base", "text-v3-words-rotate-yaw-3d", "text-v3-lines-rotate-flap-3d", "text-v3-characters-mask-slant-window", "text-v3-words-position-zipper", "text-v3-characters-rotate-swing", "studio-word-focus-slide", "premium-glyph-constellation"];
if (only.has("direction")) for (const id of sided) for (const direction of ["bottom", "left", "right", "top"]) { const p = text.find(item => item.id === id); if (p) add("direction", p, "MOTION PRESETS", 100, "left", { direction }); }

async function run() {
  const host = path.join(root, "dist", "after-effects-cep", "host", "index.jsx");
  const executionHost = normalized(path.join(evidence, "validate-host.jsx"));
  await mkdir(evidence, { recursive: true });
  await writeFile(executionHost, (await readFile(host, "utf8")).replace(/^#target aftereffects\r?\n/, ""));
  const job = { host: executionHost, report: normalized(path.join(evidence, "validation-report.json")), seconds: SECONDS, restTime: REST, scanTimes: [0, .1, .3, .6, REST, SECONDS - .5], cases };
  await rm(job.report, { force: true });
  const source = `/* Generated by scripts/text-presets-validate.mjs; guarded isolated project only. */\n(function(){\nvar job=${JSON.stringify(job)};\n${await readFile(new URL("./text-presets-validate.jsx", import.meta.url), "utf8")}\n}());\n`;
  const script = path.join(evidence, "validate-text.jsx");
  await writeFile(script, toAsciiExtendScript(groupConditionalBranches(source), "validate-text.jsx"), "utf8");
  console.log(`START isolated After Effects: ${cases.length} cases`);
  const child = spawn(afterEffects, ["-m", "-r", script], { cwd: root, windowsHide: true, stdio: "ignore" });
  console.log(`PID ${child.pid}`);
  // The isolated instance sometimes stays open after app.quit(): once the report is
  // final, give it a minute, then close that instance (only the one started here).
  let doneSince = 0;
  await new Promise(resolve => {
    const timer = setInterval(async () => {
      let status;
      try { status = JSON.parse(await readFile(job.report, "utf8")).status; } catch { status = ""; }
      if (child.exitCode !== null) { clearInterval(timer); resolve(); return; }
      if (status !== "DONE" && status !== "FAIL" && status !== "ABORTED_USER_PROJECT_GUARD") { doneSince = 0; return; }
      doneSince ||= Date.now();
      if (Date.now() - doneSince > 60000) { child.kill(); clearInterval(timer); resolve(); }
    }, 5000);
  });
  return JSON.parse(await readFile(job.report, "utf8"));
}

function delta(sample, rest) { return sample.map((v, i) => v - rest[i]); }
function summarize(report) {
  const out = { status: report.status, hostVersion: report.hostVersion, counts: {}, failures: [], alignment: [], size: [], direction: [] };
  for (const c of report.cases) out.counts[c.set] = (out.counts[c.set] ?? 0) + 1;
  out.failures = report.cases.filter(c => c.status !== "PASS").map(c => ({ key: c.key, status: c.status, error: c.error, errors: c.errors, restShift: c.restShift }));
  // Alignment: the motion relative to the text's own box is the same for every alignment.
  const byId = new Map();
  for (const c of report.cases.filter(item => item.set === "align" && item.samples)) byId.set(c.id, { ...(byId.get(c.id) ?? {}), [c.justification]: c });
  for (const [id, sides] of byId) {
    if (!sides.left || !sides.center || !sides.right) continue;
    let worst = 0;
    sides.center.samples.forEach((sample, k) => {
      // With every glyph at zero scale the layer's box collapses to a point that
      // says nothing about the motion: those instants are not compared.
      if ([sides.left.samples[k], sample, sides.right.samples[k]].some(b => b[2] - b[0] < 2 || b[3] - b[1] < 2)) return;
      const centre = delta(sample, sides.center.rest);
      for (const side of [sides.left, sides.right]) worst = Math.max(worst, ...delta(side.samples[k], side.rest).map((v, i) => Math.abs(v - centre[i])));
    });
    out.alignment.push({ id, worstPx: Math.round(worst * 100) / 100 });
  }
  out.alignment.sort((a, b) => b.worstPx - a.worstPx);
  // Size: distances scale with the font size.
  const sizes = new Map();
  for (const c of report.cases.filter(item => item.set === "size" && item.samples)) sizes.set(c.id, { ...(sizes.get(c.id) ?? {}), [c.fontSize]: c });
  for (const [id, bySize] of sizes) {
    if (!bySize[40] || !bySize[100] || !bySize[220]) continue;
    const motion = c => Math.max(...c.samples.map(s => Math.max(...delta(s, c.rest).map(Math.abs))));
    out.size.push({ id, px40: motion(bySize[40]), px100: motion(bySize[100]), px220: motion(bySize[220]), ratio220to100: Math.round(motion(bySize[220]) / motion(bySize[100]) * 100) / 100, ratio40to100: Math.round(motion(bySize[40]) / motion(bySize[100]) * 100) / 100 });
  }
  // Direction: each side differs from the others.
  const sides = new Map();
  for (const c of report.cases.filter(item => item.set === "direction" && item.samples)) sides.set(c.id, { ...(sides.get(c.id) ?? {}), [c.direction]: c });
  for (const [id, bySide] of sides) {
    const names = Object.keys(bySide), pairs = [];
    for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
      const a = bySide[names[i]], b = bySide[names[j]];
      pairs.push({ pair: `${names[i]}/${names[j]}`, px: Math.max(...a.samples.map((s, k) => Math.max(...s.map((v, n) => Math.abs(v - b.samples[k][n]))))) });
    }
    out.direction.push({ id, closestPair: pairs.sort((x, y) => x.px - y.px)[0] });
  }
  return out;
}

const report = await run();
const summary = summarize(report);
await writeFile(path.join(evidence, "validation-summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
console.log(`AE ${summary.hostVersion} · ${report.status} · cases ${JSON.stringify(summary.counts)} · failures ${summary.failures.length}`);
for (const failure of summary.failures.slice(0, 30)) console.log("FAIL", failure.key, failure.status, JSON.stringify(failure.error ?? failure.errors ?? failure.restShift ?? "").slice(0, 300));
console.log("Alignment (worst px difference between left/centre/right):", summary.alignment.slice(0, 12).map(a => `${a.id} ${a.worstPx}`).join(" | "));
for (const s of summary.size) console.log("SIZE", s.id, s.px40, s.px100, s.px220, "x", s.ratio40to100, s.ratio220to100);
for (const d of summary.direction) console.log("SIDES", d.id, d.closestPair.pair, d.closestPair.px);
