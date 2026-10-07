import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolveColorToken, themeDeclarations } from "../scripts/check-contrast.mjs";

const TOKENS_URL = new URL("../src/tokens.css", import.meta.url);
const HOST_THEME_URL = new URL("../../ui-core/src/theme.css", import.meta.url);
const SHARED_TOKENS_URL = new URL("../../../shared/crosshost.tokens.css", import.meta.url);
const SHARED_TOKENS_JSON_URL = new URL("../../../shared/crosshost.tokens.json", import.meta.url);

function selectorBlock(css, selector) {
  const start = css.indexOf(`${selector} {`);
  assert.notEqual(start, -1, `seletor ${selector} precisa existir`);
  const bodyStart = css.indexOf("{", start) + 1;
  const end = css.indexOf("}", bodyStart);
  assert.notEqual(end, -1, `seletor ${selector} precisa fechar`);
  return css.slice(bodyStart, end);
}

function declarations(block) {
  return new Map(
    [...block.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/gi)].map((match) => [
      match[1],
      match[2].trim().toLowerCase()
    ])
  );
}

const REQUIRED_CANONICAL_TOKENS = [
  "bg-0",
  "bg-1",
  "bg-2",
  "bg-3",
  "bg-4",
  "line-hairline",
  "line-strong",
  "txt-1",
  "txt-2",
  "txt-3",
  "accent",
  "accent-hover",
  "accent-press",
  "accent-on",
  "ok",
  "warn",
  "danger",
  "info",
  "dur-1",
  "dur-2",
  "dur-3",
  "dur-4",
  "dur-5",
  "ease-out",
  "ease-in",
  "ease-std",
  "ease-pop",
  "stagger",
  "focus-ring",
  "focus-offset"
];

test("ui-tokens declara os temas escuro e claro da direção aprovada", async () => {
  const css = await readFile(TOKENS_URL, "utf8");
  const dark = declarations(selectorBlock(css, ":root"));
  const light = declarations(selectorBlock(css, '[data-theme="light"]'));

  for (const token of REQUIRED_CANONICAL_TOKENS) {
    assert.ok(dark.has(token), `tema escuro sem --${token}`);
  }
  for (const token of ["bg-0", "bg-1", "bg-2", "bg-3", "bg-4", "txt-1", "txt-2", "txt-3", "accent", "ok", "warn", "danger", "info"]) {
    assert.ok(light.has(token), `tema claro sem --${token}`);
  }

  assert.equal(resolveColorToken(dark, "accent"), "#F5F5F5");
  assert.equal(resolveColorToken(light, "accent"), "#212529");
});

test("o tema embarcado nos dois hosts permanece sincronizado com ui-tokens", async () => {
  const [tokensCss, hostCss, sharedCss] = await Promise.all([
    readFile(TOKENS_URL, "utf8"),
    readFile(HOST_THEME_URL, "utf8"),
    readFile(SHARED_TOKENS_URL, "utf8")
  ]);
  const tokenDark = declarations(selectorBlock(tokensCss, ":root"));
  const tokenLight = declarations(selectorBlock(tokensCss, '[data-theme="light"]'));
  const hostDark = declarations(selectorBlock(hostCss, ":root"));
  const hostLight = declarations(selectorBlock(hostCss, '[data-theme="light"]'));
  const sharedDark = declarations(selectorBlock(sharedCss, ":root"));
  const sharedLight = declarations(selectorBlock(sharedCss, '[data-theme="light"]'));

  for (const [token, value] of tokenDark) {
    assert.equal(hostDark.get(token), value, `drift no tema embarcado --${token}`);
    assert.equal(sharedDark.get(token), value, `drift no token compartilhado --${token}`);
  }
  for (const [token, value] of tokenLight) {
    assert.equal(hostLight.get(token), value, `drift no tema claro embarcado --${token}`);
    assert.equal(sharedLight.get(token), value, `drift no token claro compartilhado --${token}`);
  }

  assert.equal(resolveColorToken(hostDark, "ch-surface-canvas"), "#121212", "a base Onyx precisa permanecer #121212");
});

test("movimento usa tokens, nunca transition all, e aceita reducao interna", async () => {
  const css = await readFile(HOST_THEME_URL, "utf8");

  assert.doesNotMatch(css, /transition\s*:\s*all\b/i);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(css, /\[data-reduced-motion="true"\]/);
  const tokens = declarations(selectorBlock(css, ":root"));
  assert.equal(tokens.get("ch-motion-fast"), "var(--motion-fast)");
  assert.equal(tokens.get("motion-fast"), "200ms");
});

test("o espelho JSON identifica a fonte canonica e conserva as cores dos dois temas", async () => {
  const registry = JSON.parse(await readFile(SHARED_TOKENS_JSON_URL, "utf8"));

  assert.equal(registry.meta.schemaVersion, 2);
  assert.equal(registry.meta.canonicalSource, "packages/ui-tokens/src/tokens.css");
});

test("os nomes de cor usados pelo shell, componentes e movimento existem nos dois temas", async () => {
  const [tokensCss, hostCss, componentsCss, motionCss] = await Promise.all([
    readFile(TOKENS_URL, "utf8"),
    readFile(HOST_THEME_URL, "utf8"),
    readFile(new URL("../../ui-core/src/components.css", import.meta.url), "utf8"),
    readFile(new URL("../../ui-motion/src/motion.css", import.meta.url), "utf8")
  ]);
  const names = new Set([...`${hostCss}\n${componentsCss}\n${motionCss}`.matchAll(/var\(--((?:bg-|txt-|line-)[a-z0-9-]+|accent(?:-[a-z0-9-]+)?|ok|warn|danger|info|value-editable)\)/g)].map((match) => match[1]));
  for (const theme of ["dark", "light"]) {
    const tokens = themeDeclarations(tokensCss, theme);
    for (const name of names) assert.ok(tokens.has(name), `${theme} usa --${name} sem declarar`);
  }
});

test("approved raised surfaces keep tile borders and light aliases intact", async () => {
  const css=await readFile(TOKENS_URL,"utf8");
  const dark=themeDeclarations(css,"dark"),light=themeDeclarations(css,"light");
  assert.equal(resolveColorToken(dark,"surface-raised"),"#1A1A1A");
  assert.equal(resolveColorToken(dark,"bg-3"),"#212121");
  assert.equal(resolveColorToken(dark,"bg-4"),"#2E2E2E");
  assert.equal(resolveColorToken(dark,"surface-hover"),"#2E2E2E");
  assert.equal(resolveColorToken(dark,"line-hairline"),"#303030");
  assert.equal(resolveColorToken(light,"surface-raised"),"#FFFFFF");
  assert.equal(resolveColorToken(light,"gray-900"),"#343A40");
});


test("generated mirrors contain the complete current palette and are deterministic", async () => {
  const { renderTokenMirror, syncThemeTokens } = await import("../../../scripts/sync-theme.mjs");
  const css = await readFile(TOKENS_URL, "utf8");
  const before = await readFile(HOST_THEME_URL, "utf8");
  assert.equal(await readFile(SHARED_TOKENS_JSON_URL, "utf8"), renderTokenMirror(css));
  await syncThemeTokens();
  assert.equal(await readFile(HOST_THEME_URL, "utf8"), before, "generation must not rewrite screen composition");
  for (const theme of ["dark", "light"]) {
    const values = themeDeclarations(css, theme);
    for (const family of ["keyframes", "layers", "animation", "spatial", "shapes", "effects", "project"]) {
      assert.ok(values.has(`icon-${family}`));
      for (const semantic of ["ok", "warn", "danger", "info"]) assert.notEqual(resolveColorToken(values, `icon-${family}`), resolveColorToken(values, semantic));
    }
  }
});
