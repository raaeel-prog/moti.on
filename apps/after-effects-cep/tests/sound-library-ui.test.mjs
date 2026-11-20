import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { createCepDocument } from "./cep-dom.mjs";
import { createI18n } from "../../../packages/ui-core/dist/i18n.js";
import { MOTION_SOUNDS, soundInsertError } from "../../../packages/contracts/dist/index.js";

const built = await build({ entryPoints: [fileURLToPath(new URL("../client/src/sound-library.ts", import.meta.url))], bundle: true, platform: "node", format: "esm", write: false });
const ui = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString("base64")}`);
const ok = { protocolVersion: 1, requestId: "sounds", ok: true, data: {}, warnings: [], error: null };

function fixture(t, { locale = "pt-BR", comp = true, family, query, response = ok } = {}) {
  const doc = createCepDocument(), calls = [], played = [];
  const library = ui.createSoundLibrary(doc, { i18n: createI18n({ locale }), family, query, context: () => ({ isComposition: comp }),
    execute: async args => { calls.push(args); return response; }, error: r => r.error?.message ?? "erro", play: id => played.push(id) });
  t.after(() => library.dispose());
  const all = tag => [...library.element.getElementsByTagName(tag), ...library.actions.getElementsByTagName(tag)];
  const byId = (tag, id) => all(tag).find(node => node.id === id);
  const rows = () => all("button").filter(b => b.id.startsWith("sound-"));
  return { library, calls, played, all, byId, rows, insert: () => byId("button", "sounds-insert") };
}
const tick = async () => { for (let i = 0; i < 4; i++) await Promise.resolve(); };

test("lists every sound, grouped by family, and filters by family and search", t => {
  assert.equal(fixture(t).rows().length, MOTION_SOUNDS.length);
  assert.deepEqual(fixture(t, { family: "boom" }).rows().map(r => r.id), MOTION_SOUNDS.filter(s => s.family === "boom").map(s => `sound-${s.id}`));
  assert.deepEqual(fixture(t, { query: "vidro" }).rows().map(r => r.id), ["sound-chime", "sound-glass-clink"]);
  assert.equal(fixture(t, { query: "zzz" }).rows().length, 0);
});

test("choosing a sound plays it, and insert sends only the changed settings", async t => {
  const f = fixture(t);
  assert.equal(f.insert().getAttribute("aria-disabled"), "true", "nothing chosen");
  f.byId("button", "sound-whoosh").click();
  assert.deepEqual(f.played, ["whoosh"]);
  assert.notEqual(f.insert().getAttribute("aria-disabled"), "true");
  f.insert().click(); await tick();
  assert.deepEqual(f.calls, [{ soundId: "whoosh" }]);
  const reverse = f.byId("input", "sounds-reverse");
  reverse.checked = true; reverse.emit("change");
  f.insert().click(); await tick();
  assert.deepEqual(f.calls[1], { soundId: "whoosh", reverse: true });
  for (const args of f.calls) assert.equal(soundInsertError(args), null);
});

test("insert is blocked without a composition, and a second click clears the choice", t => {
  const f = fixture(t, { comp: false });
  f.byId("button", "sound-beep").click();
  assert.equal(f.insert().getAttribute("aria-disabled"), "true");
  f.byId("button", "sound-beep").click();
  assert.equal(f.byId("button", "sound-beep").getAttribute("aria-selected"), "false");
});

test("English sessions read English names", t => {
  const f = fixture(t, { locale: "en-US", family: "boom" });
  assert.ok(f.all("span").some(s => s.textContent === "Trailer boom"));
});

// Barra de áudio (2026-11-18).
const peaksBuilt = await build({ entryPoints: [fileURLToPath(new URL("../client/src/sound-waveform.ts", import.meta.url))], bundle: true, platform: "node", format: "esm", write: false });
const wave = await import(`data:text/javascript;base64,${Buffer.from(peaksBuilt.outputFiles[0].text).toString("base64")}`);
const { renderSoundPeaksModule } = await import("../../../scripts/generate-sound-peaks.mjs");
const { readFile } = await import("node:fs/promises");

test("the committed waveform peaks match the synthesized sounds", async () => {
  const committed = await readFile(new URL("../client/src/generated/sound-peaks.ts", import.meta.url), "utf8");
  assert.equal(committed.replace(/\r\n/g, "\n"), renderSoundPeaksModule(), "run node scripts/generate-sound-peaks.mjs");
  for (const sound of MOTION_SOUNDS) {
    const data = wave.soundPeaksFor(sound.id);
    assert.ok(data && data.durationMs > 0 && data.peaks.length === 48, sound.id);
    assert.ok(data.peaks.every(p => p >= 0 && p <= 100) && Math.max(...data.peaks) > 50, `${sound.id} has a visible shape`);
  }
});

test("every sound row shows its waveform and duration", t => {
  const f = fixture(t, { family: "swoosh" });
  const row = f.byId("button", "sound-whoosh");
  const bars = row.getElementsByTagName("span").filter(s => s.className === "ch-wave__bar");
  assert.equal(bars.length, 48);
  assert.ok(row.getElementsByTagName("span").some(s => s.textContent === "0,62 s"));
  assert.equal(wave.formatSoundDuration(620, false), "0.62 s");
});

test("the inspector bar follows playback, seeks on keys and stops on a second listen", t => {
  const doc = createCepDocument(), audio = { currentTime: 0, duration: .62, paused: false, ended: false, pause() { this.paused = true; }, play() { this.paused = false; } };
  const frames = [];
  doc.defaultView = { requestAnimationFrame: fn => { frames.push(fn); return frames.length; } };
  const library = ui.createSoundLibrary(doc, { i18n: createI18n({ locale: "pt-BR" }), family: "swoosh", context: () => ({ isComposition: true }),
    execute: async () => ok, error: () => "erro", play: () => audio });
  t.after(() => library.dispose());
  library.element.getElementsByTagName("button").find(b => b.id === "sound-whoosh").click();
  const big = library.element.getElementsByTagName("span").find(s => s.className.includes("ch-wave--inspector"));
  assert.equal(big.getAttribute("role"), "slider");
  audio.currentTime = .31; frames.shift()();
  assert.equal(big.dataset.playing, "true");
  assert.equal(big.getAttribute("aria-valuenow"), "50");
  assert.equal(big.getElementsByTagName("span").filter(s => s.dataset.played === "true").length, 24, "half of the bars are played");
  big.emit("keydown", { key: "End", preventDefault() {} });
  assert.equal(audio.currentTime, .62);
  const listen = library.element.getElementsByTagName("button").find(b => b.id === "sounds-listen" || b.closest?.("#sounds-listen"));
  (listen ?? library.element.getElementsByTagName("button").find(b => b.textContent === "Ouvir")).click();
  assert.equal(audio.paused, true, "a second listen stops the sound");
  assert.equal(big.dataset.playing, "false");
});

test("the cursor keeps going while the file is still loading (duration not known yet)", t => {
  const doc = createCepDocument(), audio = { currentTime: 0, duration: NaN, paused: false, ended: false, pause() { this.paused = true; }, play() { this.paused = false; } };
  const frames = [];
  doc.defaultView = { requestAnimationFrame: fn => { frames.push(fn); return frames.length; } };
  const library = ui.createSoundLibrary(doc, { i18n: createI18n({ locale: "pt-BR" }), family: "swoosh", context: () => ({ isComposition: true }),
    execute: async () => ok, error: () => "erro", play: () => audio });
  t.after(() => library.dispose());
  library.element.getElementsByTagName("button").find(b => b.id === "sound-whoosh").click();
  const big = library.element.getElementsByTagName("span").find(s => s.className.includes("ch-wave--inspector"));
  frames.shift()();
  assert.equal(big.dataset.playing, "true", "loading is not stopped");
  assert.equal(frames.length, 1, "the loop keeps running");
  audio.currentTime = .31; frames.shift()();
  assert.equal(big.getAttribute("aria-valuenow"), "50", "the build-time duration stands in");
  audio.ended = true; frames.shift()();
  assert.equal(big.dataset.playing, "false"); assert.equal(frames.length, 0, "the loop ends with the sound");
});
