import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const CSS_URL = new URL("../src/motion.css", import.meta.url);
const TOKENS_URL = new URL("../../ui-tokens/src/tokens.css", import.meta.url);

const IDS = [
  "tile-hover", "tile-press", "tile-advanced", "tooltip-enter", "preview-enter",
  "preview-exit", "drawer-enter", "drawer-exit", "drawer-dimmer", "drawer-stagger",
  "tab-indicator", "view-enter", "toast-enter", "toast-exit", "confirmation-check",
  "tile-ripple", "live-control-pulse", "slider-knob", "slider-track", "asset-skeleton",
  "progress-bar", "preset-chip", "command-palette", "context-alert", "empty-state"
];

test("a folha de movimento expõe um seletor para cada item do catálogo", async () => {
  const css = await readFile(CSS_URL, "utf8");
  for (const id of IDS) {
    assert.match(css, new RegExp(`\\[data-motion~=["']${id}["']\\]`), `CSS sem ${id}`);
  }
});

test("CSS não usa transition all, duração literal nem propriedade de layout animada", async () => {
  const css = await readFile(CSS_URL, "utf8");
  assert.doesNotMatch(css, /transition\s*:\s*all\b/i);

  for (const match of css.matchAll(/(?:animation|transition(?:-duration)?)\s*:\s*([^;]+);/gi)) {
    assert.doesNotMatch(match[1], /\b\d+(?:\.\d+)?m?s\b/, `duração literal em: ${match[0]}`);
  }

  for (const match of css.matchAll(/@keyframes\s+[^{]+\{([\s\S]*?)\n\}/g)) {
    assert.doesNotMatch(
      match[1],
      /(?:^|[;{]\s*)(?:width|height|top|right|bottom|left|margin|padding)\s*:/im,
      `keyframes disparam layout: ${match[0]}`
    );
  }
});

test("durações especiais e tempos de intenção vivem na folha de tokens", async () => {
  const [css, tokens] = await Promise.all([readFile(CSS_URL, "utf8"), readFile(TOKENS_URL, "utf8")]);
  const required = [
    "dur-press", "dur-popover-out", "dur-drawer-out", "dur-ripple", "dur-live-pulse",
    "dur-live-reduced", "dur-skeleton", "dur-progress-reduced", "ease-step-end", "delay-none",
    "delay-tooltip", "delay-preview", "delay-spinner", "delay-applied"
  ];
  for (const token of required) {
    assert.match(tokens, new RegExp(`--${token}\\s*:`), `token --${token} ausente`);
  }
  assert.match(css, /var\(--dur-press\)/);
  assert.match(css, /var\(--dur-live-pulse\)/);
});

test("movimento reduzido cobre sistema e toggle interno sem remover feedback essencial", async () => {
  const css = await readFile(CSS_URL, "utf8");
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(css, /\[data-reduced-motion=["']true["']\]/);

  const internalStart = css.indexOf("/* Toggle interno:");
  const systemStart = css.indexOf("@media (prefers-reduced-motion: reduce)");
  assert.ok(internalStart >= 0 && systemStart > internalStart);
  const internalRules = css.slice(internalStart, systemStart);
  const systemRules = css.slice(systemStart);

  for (const id of IDS) {
    const selector = new RegExp(`data-motion~=["']${id}["']`);
    assert.match(internalRules, selector, `toggle interno sem fallback explícito para ${id}`);
    assert.match(systemRules, selector, `preferência do SO sem fallback explícito para ${id}`);
  }

  assert.match(css, /data-motion~=["']tile-press["'][^}]*var\(--dur-press\)/s);
  assert.match(css, /data-motion~=["']progress-bar["'][^}]*var\(--dur-progress-reduced\)/s);
  assert.match(css, /data-motion~=["']tile-ripple["'][^}]*display:\s*none/s);
  assert.match(css, /data-motion~=["']drawer-enter["'][^}]*motion-reduced-opacity-in[^}]*var\(--dur-popover-out\)/s);
  assert.match(css, /data-motion~=["']confirmation-check["'][^}]*animation:\s*none[^}]*stroke-dashoffset:\s*0/s);
  assert.match(css, /data-motion~=["']live-control-pulse["'][^}]*motion-live-pulse-reduced[^}]*var\(--dur-live-reduced\)/s);
  assert.match(css, /data-motion~=["']asset-skeleton["'][^}]*motion-skeleton-reduced[^}]*var\(--dur-skeleton\)/s);
});

test("will-change só existe durante uma interação explicitamente ativa", async () => {
  const css = await readFile(CSS_URL, "utf8");
  assert.match(css, /\[data-motion-active=["']true["']\][^{]*\{[^}]*will-change:\s*transform,\s*opacity/s);
  const withoutActiveRule = css.replace(/[^{}]*\[data-motion-active=["']true["']\][^{]*\{[^}]*\}/g, "");
  assert.doesNotMatch(withoutActiveRule, /will-change\s*:/);
});
