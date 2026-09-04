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
  "padding"
]);

test("o catálogo A6.2 declara exatamente os 25 movimentos na ordem normativa", () => {
  assert.equal(MOTION_CATALOG.length, 25);
  assert.deepEqual(MOTION_CATALOG.map((entry) => entry.id), EXPECTED_IDS);
  assert.deepEqual(MOTION_CATALOG.map((entry) => entry.number), Array.from({ length: 25 }, (_, index) => index + 1));
});

test("nenhum movimento do catálogo dispara layout e toda duração/easing vem de token", () => {
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

test("transições respeitam 420 ms e durações maiores são apenas feedback/progresso", () => {
  for (const entry of MOTION_CATALOG) {
    for (const duration of entry.durationMs) {
      assert.ok(Number.isFinite(duration) && duration >= 0, `${entry.id} tem duração inválida`);
      if (entry.kind === "transition") {
        assert.ok(duration <= 420, `${entry.id} excede o teto de transição`);
      }
      if (duration > 420) {
        assert.ok(
          entry.kind === "feedback" || entry.kind === "progress",
          `${entry.id} excede 420 ms sem ser feedback/progresso`
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
