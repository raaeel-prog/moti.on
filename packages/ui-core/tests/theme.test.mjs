import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const css = await readFile(new URL("../src/theme.css", import.meta.url), "utf8");

function hexToRgb(hex) {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function luminance(hex) {
  const channels = hexToRgb(hex).map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(foreground, background) {
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

function colorToken(name) {
  const match = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
  assert.ok(match, `token --${name} precisa existir`);
  return match[1];
}

test("root e shell permitem que somente o conteudo role em painel baixo", () => {
  assert.match(css, /html,\s*body,\s*#root\s*\{[^}]*height:\s*100%;[^}]*min-height:\s*0;/s);
  assert.match(css, /\.ch-shell\s*\{[^}]*height:\s*100%;[^}]*min-height:\s*0;/s);
  assert.match(css, /\.ch-content\s*\{[^}]*flex:\s*1 1 auto;[^}]*min-height:\s*0;[^}]*overflow-y:\s*auto;/s);
  assert.match(css, /\.ch-header,[^}]*\.ch-status\s*\{[^}]*flex:\s*0 0 auto;/s);
});

test("foco tem fallback seguro e respeita focus-visible", () => {
  assert.match(css, /\.ch-nav__item:focus\s*\{/);
  assert.match(css, /\.ch-nav__item:focus-visible\s*\{/);
  assert.match(css, /\.ch-nav__item:focus:not\(:focus-visible\)\s*\{/);
  assert.match(css, /\.ch-button:focus\s*\{/);
  assert.match(css, /\.ch-button:focus-visible\s*\{/);
});

test("preferencia por movimento reduzido remove transicoes decorativas", () => {
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[^}]*\.ch-nav__item,[^}]*\.ch-button\s*\{[^}]*transition:\s*none;/s);
});

test("texto muted mantem contraste AA nas duas superficies base", () => {
  const muted = colorToken("ch-text-muted");
  const canvas = colorToken("ch-surface-canvas");
  const panel = colorToken("ch-surface-panel");

  assert.ok(contrast(muted, canvas) >= 4.5, "muted precisa atingir 4.5:1 no canvas");
  assert.ok(contrast(muted, panel) >= 4.5, "muted precisa atingir 4.5:1 no painel");
});
