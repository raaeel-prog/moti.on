import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

/**
 * Memória de navegação e proteção do que estava salvo
 * (packages/ui-core/src/panel-preferences.ts).
 */
const result = await build({
  entryPoints: [fileURLToPath(new URL("../src/panel-preferences.ts", import.meta.url))],
  bundle: true, platform: "node", format: "esm", write: false
});
const { createPanelPreferences, PREFERENCES_BACKUP_KEY } = await import(
  `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`
);
const KEY = "motion.panel.preferences.v1";
const root = { setAttribute() {} };

function memoryStorage(initial = {}) {
  const data = { ...initial };
  const writes = [];
  return {
    data, writes,
    getItem: (key) => (Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null),
    setItem: (key, value) => { writes.push(key); data[key] = value; }
  };
}

test("aba, galeria e rascunhos sobrevivem a reabrir o painel", () => {
  const storage = memoryStorage();
  const first = createPanelPreferences(root, storage);
  first.setLastView("presets");
  first.setGallery({ category: "text-words", scope: "favorites", query: "neon", presetId: "builtin.motion.mist-reveal" });
  first.setDrafts({ "builtin.motion.mist-reveal": { phase: "out", durationFrames: 24, intensity: 120 } });

  const reopened = createPanelPreferences(root, storage).snapshot();
  assert.equal(reopened.lastView, "presets");
  assert.deepEqual(reopened.gallery, { category: "text-words", scope: "favorites", query: "neon", presetId: "builtin.motion.mist-reveal" });
  assert.deepEqual(reopened.drafts["builtin.motion.mist-reveal"], { phase: "out", durationFrames: 24, intensity: 120 });
  assert.equal(JSON.parse(storage.data[KEY]).version, 1, "versão mantida: builds anteriores continuam lendo");
});

test("aba sem ferramenta aberta e valores estranhos não voltam", () => {
  const storage = memoryStorage({ [KEY]: JSON.stringify({
    version: 1, lastView: "tools",
    gallery: { category: "../x", scope: "everything", query: "a\u0000b", presetId: "<script>" },
    drafts: { "builtin.motion.x": { phase: "in", nested: { a: 1 }, "bad key": 1 }, "<bad>": { phase: "in" } }
  }) });
  const saved = createPanelPreferences(root, storage).snapshot();
  assert.equal(saved.lastView, "");
  assert.deepEqual(saved.gallery, { category: "all", scope: "all", query: "", presetId: "" });
  assert.deepEqual(saved.drafts, { "builtin.motion.x": { phase: "in" } });
});

test("render repetido na mesma aba não grava de novo", () => {
  const storage = memoryStorage();
  const prefs = createPanelPreferences(root, storage);
  prefs.setLastView("ease");
  prefs.setLastView("ease");
  prefs.setGallery({ query: "" });
  assert.equal(storage.writes.filter((key) => key === KEY).length, 1);
});

test("dado ilegível é copiado antes da primeira gravação", () => {
  const corrupt = "{\"version\":1,\"favorites\":[\"wiggle\"";
  const storage = memoryStorage({ [KEY]: corrupt });
  const prefs = createPanelPreferences(root, storage);
  assert.equal(prefs.snapshot().recovered, true);
  assert.equal(storage.data[PREFERENCES_BACKUP_KEY], corrupt);
  prefs.setTheme("light");
  assert.equal(storage.data[PREFERENCES_BACKUP_KEY], corrupt, "a cópia nunca é sobrescrita pela gravação normal");
  assert.equal(JSON.parse(storage.data[KEY]).theme, "light");
});

test("versão desconhecida também é preservada", () => {
  const future = JSON.stringify({ version: 2, favorites: ["x"] });
  const storage = memoryStorage({ [KEY]: future });
  createPanelPreferences(root, storage).toggleFavorite("wiggle");
  assert.equal(storage.data[PREFERENCES_BACKUP_KEY], future);
});

test("sem onde guardar a cópia, o painel não sobrescreve o original", () => {
  const corrupt = "not json";
  const data = { [KEY]: corrupt };
  const storage = {
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => { if (key !== KEY) throw new Error("quota"); data[key] = value; }
  };
  const prefs = createPanelPreferences(root, storage);
  prefs.setTheme("light");
  assert.equal(data[KEY], corrupt);
  assert.equal(prefs.snapshot().persistent, false);
});

test("rascunhos cedem primeiro quando o registro passaria de 32 KB", () => {
  const storage = memoryStorage();
  const prefs = createPanelPreferences(root, storage);
  const drafts = {};
  for (let i = 0; i < 24; i += 1) {
    const draft = {};
    for (let k = 0; k < 40; k += 1) draft[`field${String.fromCharCode(97 + (k % 26))}${"x".repeat(k % 5)}`] = "y".repeat(40);
    drafts[`builtin.motion.p${i}`] = draft;
  }
  prefs.setDrafts(drafts);
  prefs.toggleFavorite("wiggle");
  const saved = JSON.parse(storage.data[KEY]);
  assert.ok(storage.data[KEY].length <= 32_768);
  assert.deepEqual(saved.favorites, ["wiggle"]);
});
