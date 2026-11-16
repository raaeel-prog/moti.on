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
