import test from "node:test";
import assert from "node:assert/strict";

import { MOTION_CATALOG } from "../dist/index.js";

const EXPECTED_IDS = [
  "tile-hover",
  "tile-press",
  "tile-advanced",
  "tooltip-enter",
  "preview-enter",
  "preview-exit",
  "drawer-enter",
  "drawer-exit",
  "drawer-dimmer",
  "drawer-stagger",
  "tab-indicator",
  "view-enter",
  "toast-enter",
  "toast-exit",
  "confirmation-check",
  "tile-ripple",
  "live-control-pulse",
  "slider-knob",
  "slider-track",
  "asset-skeleton",
  "progress-bar",
  "preset-chip",
  "command-palette",
  "context-alert",
  "empty-state"
];

const LAYOUT_PROPERTIES = new Set([
  "width",
  "height",
  "top",
  "right",
  "bottom",
  "left",
  "margin",
  "padding", "flex-basis"
]);

test("o catálogo preserva os 25 IDs originais e acrescenta controles aprovados", () => {
  assert.equal(MOTION_CATALOG.length, 32);
  assert.deepEqual(MOTION_CATALOG.slice(0, 25).map((entry) => entry.id), EXPECTED_IDS);
  assert.deepEqual(MOTION_CATALOG.map((entry) => entry.number), Array.from({ length: 32 }, (_, index) => index + 1));
});

test("layout animado fica restrito a expansões explícitas e durações usam tokens", () => {
  for (const entry of MOTION_CATALOG) {
    assert.ok(entry.properties.length > 0, `${entry.id} precisa declarar propriedades`);
    assert.equal(
      entry.properties.some((property) => LAYOUT_PROPERTIES.has(property)),
      false,
      `${entry.id} anima uma propriedade de layout`
    );
    assert.ok(entry.durationTokens.length > 0, `${entry.id} precisa declarar duração`);
    assert.ok(
      entry.durationTokens.every((token) => /^--dur-[a-z0-9-]+$/.test(token)),
      `${entry.id} usa duração fora dos tokens`
    );
    assert.ok(
      entry.easingToken === null || /^--ease-[a-z0-9-]+$/.test(entry.easingToken),
      `${entry.id} usa easing fora dos tokens`
    );
  }
});

test("transições respeitam 360 ms e durações maiores são apenas feedback/progresso", () => {
  for (const entry of MOTION_CATALOG) {
    for (const duration of entry.durationMs) {
      assert.ok(Number.isFinite(duration) && duration >= 0, `${entry.id} tem duração inválida`);
      if (entry.kind === "transition") {
        assert.ok(duration <= 360, `${entry.id} excede o teto de transição`);
      }
      if (duration > 360) {
        assert.ok(
          entry.kind === "feedback" || entry.kind === "progress",
          `${entry.id} excede 360 ms sem ser feedback/progresso`
        );
      }
    }
  }
});

test("o catálogo e suas listas públicas são imutáveis", () => {
  assert.equal(Object.isFrozen(MOTION_CATALOG), true);
  for (const entry of MOTION_CATALOG) {
    assert.equal(Object.isFrozen(entry), true);
    assert.equal(Object.isFrozen(entry.properties), true);
    assert.equal(Object.isFrozen(entry.durationTokens), true);
    assert.equal(Object.isFrozen(entry.durationMs), true);
  }
});


test("catalog durations equal canonical CSS tokens", async () => {
  const { readFile } = await import("node:fs/promises");
  const css = await readFile(new URL("../../ui-tokens/src/tokens.css", import.meta.url), "utf8");
  const tokens = new Map([...css.matchAll(/--([a-z0-9-]+):\s*(\d+)ms;/g)].map(match => [`--${match[1]}`, Number(match[2])]));
  for (const entry of MOTION_CATALOG) assert.deepEqual(entry.durationMs, entry.durationTokens.map(token => tokens.get(token)), entry.id);
});
