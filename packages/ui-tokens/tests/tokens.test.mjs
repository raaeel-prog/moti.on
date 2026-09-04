import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

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

test("ui-tokens declara os temas escuro e claro do Addendum A", async () => {
  const css = await readFile(TOKENS_URL, "utf8");
  const dark = declarations(selectorBlock(css, ":root"));
  const light = declarations(selectorBlock(css, '[data-theme="light"]'));

  for (const token of REQUIRED_CANONICAL_TOKENS) {
    assert.ok(dark.has(token), `tema escuro sem --${token}`);
  }
  for (const token of ["bg-0", "bg-1", "bg-2", "bg-3", "bg-4", "txt-1", "txt-2", "txt-3", "accent", "ok", "warn", "danger", "info"]) {
    assert.ok(light.has(token), `tema claro sem --${token}`);
  }

  assert.equal(dark.get("accent"), "#7c8cff");
  assert.equal(light.get("accent"), "#4a57d8");
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
    assert.equal(hostDark.get(token), value, `drift no token escuro --${token}`);
    assert.equal(sharedDark.get(token), value, `drift no token compartilhado --${token}`);
  }
  for (const [token, value] of tokenLight) {
    assert.equal(hostLight.get(token), value, `drift no token claro --${token}`);
    assert.equal(sharedLight.get(token), value, `drift no token claro compartilhado --${token}`);
  }

  assert.equal(hostDark.get("ch-surface-canvas"), "#1d1d1d", "a base Adobe do projeto precisa permanecer #1D1D1D");
});

test("movimento usa tokens, nunca transition all, e aceita reducao interna", async () => {
  const css = await readFile(HOST_THEME_URL, "utf8");

  assert.doesNotMatch(css, /transition\s*:\s*all\b/i);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(css, /\[data-reduced-motion="true"\]/);
  assert.match(css, /--ch-motion-fast:\s*var\(--dur-1\)/);
});

test("o espelho JSON identifica a fonte canonica e conserva as cores dos dois temas", async () => {
  const registry = JSON.parse(await readFile(SHARED_TOKENS_JSON_URL, "utf8"));

  assert.equal(registry.meta.schemaVersion, 2);
  assert.equal(registry.meta.canonicalSource, "packages/ui-tokens/src/tokens.css");
  assert.equal(registry.meta.hostBase, "#1D1D1D");
  assert.equal(registry.themes.dark.accent.$value, "#7C8CFF");
  assert.equal(registry.themes.dark.textTertiary.$value, "#8E97A0");
  assert.equal(registry.themes.light.accent.$value, "#4A57D8");
  assert.equal(registry.themes.light.textTertiary.$value, "#626A72");
});
