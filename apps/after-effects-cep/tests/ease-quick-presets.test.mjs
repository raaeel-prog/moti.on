import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { createCepDocument } from "./cep-dom.mjs";
import { createI18n } from "../../../packages/ui-core/dist/i18n.js";
const built = await build({ entryPoints: [fileURLToPath(new URL("../client/src/ease-editor.ts", import.meta.url))], bundle: true, platform: "node", format: "esm", write: false });
const { createEaseEditor, DEFAULT_EASE } = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString("base64")}`);
const clone = draft => JSON.parse(JSON.stringify(draft));

function mount(options = {}) {
  const doc = createCepDocument();
  const create = doc.createElement;
  doc.createElement = tag => { const node = create(tag); node.setCustomValidity = () => {}; node.querySelector = s => node.querySelectorAll(s)[0] ?? null; return node; };
  const commits = [], cancels = [];
  const editor = createEaseEditor(doc, { i18n: createI18n({ locale: "pt-BR" }), draft: clone(DEFAULT_EASE), busy: false, compact: true,
    onChange() {}, onCommit: d => commits.push(d), onApply() {}, onLiveToggle() {}, onCancel: () => cancels.push(1), ...options });
  return { doc, editor, commits, cancels, buttons: () => editor.element.getElementsByTagName("button") };
}

test("compact mode: chips choose a bezier preset in one commit and setDraft adopts a remote draft silently", () => {
  const f = mount();
  const chip = f.buttons().find(node => node.className.split(" ").includes("ch-ease-chip") && node.allText === "Linear");
  chip.click();
  assert.equal(f.commits.length, 1); assert.deepEqual([f.commits[0].x1, f.commits[0].y1, f.commits[0].x2, f.commits[0].y2], [0, 0, 1, 1]);
  assert.equal(chip.getAttribute("aria-pressed"), "true");
  f.editor.setDraft({ ...clone(DEFAULT_EASE), mode: "elastic", live: true });
  assert.equal(f.commits.length, 1, "setDraft never commits");
  assert.equal(f.editor.element.getAttribute("data-ease-mode"), "elastic");
  const live = f.buttons().find(node => node.className.split(" ").includes("ch-ease-live"));
  assert.equal(live.getAttribute("aria-pressed"), "true");
  assert.equal(f.editor.element.querySelectorAll(".ch-ease-library").length, 0);
  f.editor.dispose();
});
