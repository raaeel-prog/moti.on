import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

/**
 * Bibliotecas pessoais (gradientes e curvas) não perdem o que já existia
 * quando a leitura não aproveita o registro inteiro.
 */
async function clientModule(file) {
  const bundled = await build({
    entryPoints: [fileURLToPath(new URL(file, import.meta.url))],
    bundle: true, platform: "node", format: "esm", write: false, loader: { ".css": "empty" }
  });
  return import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`);
}

const ease = await clientModule("../client/src/ease-library.ts");

function memory(initial = {}) {
  const data = { ...initial };
  return { data, getItem: (key) => (key in data ? data[key] : null), setItem: (key, value) => { data[key] = value; } };
}

test("gravação normal guarda a versão anterior em .bak", () => {
  const storage = memory();
  assert.equal(ease.writeEaseLibrary(storage, { custom: [], favorites: ["a"] }), true);
  assert.equal(ease.writeEaseLibrary(storage, { custom: [], favorites: ["b"] }), true);
  assert.deepEqual(JSON.parse(storage.data["motion.ease.library.v1.bak"]).favorites, ["a"]);
  assert.equal(storage.data["motion.ease.library.v1.unreadable"], undefined);
});

test("registro corrompido é preservado antes de ser substituído", () => {
  const corrupt = "{\"custom\":[{\"id\":\"custom-1\"";
  const storage = memory({ "motion.ease.library.v1": corrupt });
  assert.deepEqual(ease.readEaseLibrary(storage).custom, []);
  assert.equal(ease.writeEaseLibrary(storage, { custom: [], favorites: [] }), true);
  assert.equal(storage.data["motion.ease.library.v1.unreadable"], corrupt);
  ease.writeEaseLibrary(storage, { custom: [], favorites: ["x"] });
  assert.equal(storage.data["motion.ease.library.v1.unreadable"], corrupt, "a cópia do ilegível não é sobrescrita");
});

test("item que a leitura descartaria também conta como ilegível", () => {
  const partial = JSON.stringify({ custom: [{ id: "custom-a", name: "A", curve: { x1: 9, y1: 0, x2: 1, y2: 1 } }], favorites: [] });
  const storage = memory({ "motion.ease.library.v1": partial });
  ease.writeEaseLibrary(storage, { custom: [], favorites: [] });
  assert.equal(storage.data["motion.ease.library.v1.unreadable"], partial);
});

test("sem espaço para a cópia, o original fica intacto e a gravação falha", () => {
  const corrupt = "nope";
  const data = { "motion.ease.library.v1": corrupt };
  const storage = {
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => { if (key.endsWith(".unreadable")) throw new Error("quota"); data[key] = value; }
  };
  assert.equal(ease.writeEaseLibrary(storage, { custom: [], favorites: [] }), false);
  assert.equal(data["motion.ease.library.v1"], corrupt);
});
