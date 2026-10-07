import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createIcon, ICON_CATALOG } from "../dist/icons.js";
import { createFakeDocument } from "./fake-dom.mjs";

test("every registered tool has a distinct static drawing and its actual category color", async () => {
  const main = await readFile(new URL("../../../apps/after-effects-cep/client/src/main.ts", import.meta.url), "utf8");
  const categories = main.slice(main.indexOf("const TOOL_CATEGORY:"), main.indexOf("const CATEGORY_NAME_KEY:"));
  const tools = [...categories.matchAll(/\s+(\w+): "(\w+)"/g)];
  assert.ok(tools.length >= 50, "complete tool category map");
  const drawings = new Set();
  for (const [, id, family] of tools) {
    const icon = ICON_CATALOG[id];
    assert.ok(icon, id);
    assert.equal(icon.family, family, id);
    assert.ok(icon.fallback && icon.fallback !== "?", id);
    assert.equal(drawings.has(icon.staticPath), false, `${id} repeats another tool`);
    drawings.add(icon.staticPath);
  }
});

test("segmented icons remain decorative and provide a stable static image", () => {
  const doc = createFakeDocument();
  for (const [id, definition] of Object.entries(ICON_CATALOG)) {
    const svg = createIcon(doc, id);
    assert.equal(svg.tagName, "svg");
    assert.equal(svg.getAttribute("viewBox"), "0 0 24 24");
    assert.equal(svg.getAttribute("aria-hidden"), "true");
    assert.equal(svg.getAttribute("focusable"), "false");
    assert.equal(svg.getAttribute("data-icon-family"), definition.family);
    assert.equal(svg.getAttribute("data-motion"), "icon-gesture");
    const geometry = svg.children[0];
    assert.equal(geometry.getAttribute("stroke"), "currentColor");
    assert.equal(geometry.children.map(group => group.children[0].getAttribute("d")).join("").replace(/\s+/g, ""),
      definition.staticPath.replace(/\s+/g, ""));
    assert.ok(geometry.children.some(group => group.getAttribute("class") === "ch-icon__detail"));
  }
});

test("missing or partially implemented SVG keeps the icon-only navigation identifiable", () => {
  for (const failure of ["missing", "throws"]) {
    const doc = createFakeDocument();
    doc.createElementNS = failure === "missing" ? undefined : () => { throw new Error("Unsupported SVG"); };
    const icons = ["home", "settings", "presets", "ease"].map(id => createIcon(doc, id));
    assert.equal(new Set(icons.map(icon => icon.textContent)).size, 4);
    for (const icon of icons) assert.equal(icon.getAttribute("aria-hidden"), "true");
    assert.equal(createIcon(doc, "unknown").textContent, "?");
  }
});
