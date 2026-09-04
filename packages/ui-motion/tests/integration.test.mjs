import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ROOT = new URL("../../../", import.meta.url);

async function source(relativePath) {
  return readFile(new URL(relativePath, ROOT), "utf8");
}

test("os dois painéis inicializam, exibem e descartam a preferência compartilhada", async () => {
  const [ae, premiere] = await Promise.all([
    source("apps/after-effects-cep/client/src/main.ts"),
    source("apps/premiere-uxp/client/src/main.ts")
  ]);

  for (const [host, contents] of [["AE", ae], ["Premiere", premiere]]) {
    assert.match(contents, /createBrowserReducedMotionController/, `${host} não inicializa preferência`);
    assert.match(contents, /id:\s*["']settings["']/, `${host} não expõe a view Settings`);
    assert.match(contents, /function renderSettings\(/, `${host} não separa Settings de Sistema`);
    assert.match(contents, /settings\.reduceMotion\.label/, `${host} não exibe o toggle`);
    assert.match(contents, /id:\s*["']settings-reduce-motion["']/, `${host} não usa id estável`);
    assert.match(contents, /motionPreference\.dispose\(\)/, `${host} não remove listener`);
  }
});

test("a folha de movimento entra no único CSS distribuído aos dois hosts", async () => {
  const build = await source("scripts/build.mjs");
  assert.match(build, /ui-motion/);
  assert.match(build, /motion\.css/);
  assert.match(build, /writeFile\([^)]*theme/s);
});

test("os dois catálogos de idioma possuem os rótulos do toggle", async () => {
  const locales = await source("packages/ui-core/src/locales.ts");
  for (const key of [
    "nav.settings",
    "view.settings.title",
    "settings.interface.title",
    "settings.reduceMotion.label",
    "settings.reduceMotion.description"
  ]) {
    assert.equal(
      [...locales.matchAll(new RegExp(`^[ \\t]*["']${key.replaceAll(".", "\\.")}["']\\s*:`, "gm"))].length,
      2,
      `${key} precisa existir em pt-BR e en-US`
    );
  }
});
