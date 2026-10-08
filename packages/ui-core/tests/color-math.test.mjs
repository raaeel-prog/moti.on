import test from "node:test";
import assert from "node:assert/strict";

import { clampHsv, hexToHsv, hexToRgb, hsvToHex, rgbToHex } from "../dist/color-math.js";

test("hex ↔ HSV round-trips every channel extreme and mid value exactly", () => {
  for (const hex of ["#000000", "#ffffff", "#ff0000", "#00ff00", "#0000ff", "#e85d4a", "#1a1a1a", "#336699", "#7f7f7f", "#ffd27f"]) {
    assert.equal(hsvToHex(hexToHsv(hex)), hex, hex);
  }
});

test("hex parsing accepts an optional # and any case, and rejects everything else", () => {
  assert.deepEqual(hexToRgb("E85D4A"), { r: 232, g: 93, b: 74 });
  assert.deepEqual(hexToRgb(" #e85d4a "), { r: 232, g: 93, b: 74 });
  for (const value of ["", "#fff", "#gggggg", "#1234567", null, 42]) assert.equal(hexToRgb(value), null, String(value));
  assert.equal(hexToHsv("nope"), null);
});

test("HSV keeps hue for pure colors and zero saturation for grays", () => {
  assert.deepEqual(hexToHsv("#ff0000"), { h: 0, s: 1, v: 1 });
  assert.equal(Math.round(hexToHsv("#00ff00").h), 120);
  assert.equal(Math.round(hexToHsv("#0000ff").h), 240);
  const gray = hexToHsv("#808080");
  assert.equal(gray.s, 0);
  assert.equal(gray.h, 0);
});

test("out-of-range input is clamped instead of producing an invalid color", () => {
  assert.deepEqual(clampHsv({ h: -20, s: 2, v: -1 }), { h: 0, s: 1, v: 0 });
  assert.deepEqual(clampHsv({ h: Number.NaN, s: Number.NaN, v: 0.5 }), { h: 0, s: 0, v: 0.5 });
  assert.equal(hsvToHex({ h: 720, s: 1, v: 1 }), "#ff0000");
  assert.equal(rgbToHex({ r: 300, g: -4, b: 127.6 }), "#ff0080");
});
