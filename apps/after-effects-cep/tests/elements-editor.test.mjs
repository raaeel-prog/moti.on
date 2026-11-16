import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { createCepDocument } from "./cep-dom.mjs";
import { createI18n } from "../../../packages/ui-core/dist/i18n.js";
import { MOTION_ELEMENTS, elementInsertError } from "../../../packages/contracts/dist/index.js";

const built = await build({ entryPoints: [fileURLToPath(new URL("../client/src/elements-editor.ts", import.meta.url))], bundle: true, platform: "node", format: "esm", write: false });
const ui = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString("base64")}`);
const ok = { protocolVersion: 1, requestId: "elements", ok: true, data: {}, warnings: [], error: null };

function fixture(t, { locale = "pt-BR", comp = true, response = ok } = {}) {
  const doc = createCepDocument(), calls = [], played = [], busy = [];
  let context = { isComposition: comp };
  const editor = ui.createElementsEditor(doc, { i18n: createI18n({ locale }), context: () => context,
    execute: async args => { calls.push(args); return response; }, error: r => r.error?.message ?? "erro", busy: v => busy.push(v), play: id => played.push(id) });
  t.after(() => editor.dispose());
  const all = tag => [...editor.element.getElementsByTagName(tag), ...editor.actions.getElementsByTagName(tag)];
  const byId = (tag, id) => all(tag).find(node => node.id === id);
  const insert = () => byId("button", "elements-insert");
  return { doc, editor, calls, played, busy, all, byId, insert, setContext: value => { context = value; } };
}
const tick = async () => { for (let i = 0; i < 4; i++) await Promise.resolve(); };

test("the gallery lists every element with a painted preview and filters by kind", t => {
  const f = fixture(t);
  const cards = () => f.all("button").filter(b => b.id.startsWith("element-"));
  assert.equal(cards().length, MOTION_ELEMENTS.length);
  for (const card of cards()) assert.ok(card.getElementsByTagName("svg")[0].children.length > 0, `${card.id} has artwork`);
  f.byId("button", "elements-category-lower-third").click();
  assert.deepEqual(cards().map(c => c.id), MOTION_ELEMENTS.filter(e => e.kind === "lower-third").map(e => `element-${e.id}`));
  assert.equal(f.byId("button", "elements-category-lower-third").getAttribute("aria-checked"), "true");
  for (const kind of ["shape", "drawn", "text-box", "title", "social", "transition", "background"]) {
    f.byId("button", `elements-category-${kind}`).click();
    assert.equal(cards().length, MOTION_ELEMENTS.filter(e => e.kind === kind).length, kind);
    assert.ok(cards().length > 0, kind);
  }
});

test("the inspector shows only the texts and colors the element uses", t => {
  const f = fixture(t);
  const inspector = f.editor.element.getElementsByTagName("div").find(d => d.className === "ch-elements-inspector");
  assert.equal(inspector.hidden, true, "nothing chosen yet: no settings");
  f.byId("button", "element-burst").click();
  assert.equal(inspector.hidden, false);
  assert.equal(f.byId("input", "elements-text-title"), undefined);
  assert.equal(f.byId("input", "elements-animation"), undefined, "a one-shot has no separate in/out");
  f.byId("button", "element-lt-bar").click();
  assert.ok(f.byId("input", "elements-text-title")); assert.ok(f.byId("input", "elements-text-subtitle"));
  assert.equal(f.byId("input", "elements-text-title").value, "Nome Sobrenome");
  assert.ok(f.byId("input", "elements-animation"));
  assert.equal(f.editor.element.getElementsByTagName("svg").filter(s => s.getAttribute("role") === "img").length, 0, "the card itself is the preview");
  f.byId("button", "element-lt-bar").click();
  assert.equal(inspector.hidden, true, "a second click clears the choice");
  assert.equal(f.byId("button", "element-lt-bar").getAttribute("aria-selected"), "false");
});

test("insert sends only what differs from the element defaults", async t => {
  const f = fixture(t);
  f.byId("button", "element-lt-tag").click();
  const title = f.byId("input", "elements-text-title");
  title.value = "Ana Souza"; title.emit("change");
  const duration = f.byId("input", "elements-duration");
  duration.value = "150"; duration.emit("input"); duration.emit("change");
  f.insert().click(); await tick();
  assert.equal(f.calls.length, 1);
  assert.deepEqual(f.calls[0], { elementId: "lt-tag", durationFrames: 150, texts: { title: "Ana Souza" } });
  assert.equal(elementInsertError(f.calls[0]), null);
  assert.deepEqual(f.busy, [true, false]);
  assert.match(f.editor.element.getElementsByTagName("div").find(d => d.className === "ch-elements-status").textContent, /Etiqueta/);
});

test("insert is blocked without a composition and explains why", async t => {
  const f = fixture(t, { comp: false });
  f.byId("button", "element-ring").click();
  assert.equal(f.insert().getAttribute("aria-disabled"), "true");
  f.setContext({ isComposition: true }); f.editor.refresh();
  assert.notEqual(f.insert().getAttribute("aria-disabled"), "true");
});

test("host failures are shown and the preview sound plays the chosen sound", async t => {
  const f = fixture(t, { response: { ...ok, ok: false, error: { code: "CAPABILITY_UNAVAILABLE", message: "Sem som instalado" } } });
  f.byId("button", "element-ring").click();
  f.byId("button", "elements-listen").click();
  assert.deepEqual(f.played, ["impact"]);
  f.insert().click(); await tick();
  assert.match(f.editor.element.getElementsByTagName("div").find(d => d.className === "ch-elements-status").textContent, /Sem som instalado/);
});

test("both languages label the tool", t => {
  const f = fixture(t, { locale: "en-US" });
  assert.equal(f.byId("button", "elements-category-lower-third").textContent, "Lower thirds");
  assert.equal(f.byId("button", "element-title-rise").getElementsByTagName("span")[0].textContent, "Rising title");
});

test("a fixed kind from the Presets folder hides the editor's own filters and follows the search", t => {
  const doc = createCepDocument();
  const editor = ui.createElementsEditor(doc, { i18n: createI18n({ locale: "pt-BR" }), category: "title", query: "moldura",
    context: () => ({ isComposition: true }), execute: async () => ok, error: () => "erro" });
  t.after(() => editor.dispose());
  const cards = editor.element.getElementsByTagName("button").filter(b => b.id.startsWith("element-"));
  assert.deepEqual(cards.map(c => c.id), ["element-title-frame", "element-title-glow-frame"]);
  assert.equal(editor.element.getElementsByTagName("div").find(d => d.className === "ch-elements-categories").hidden, true);
  assert.equal(editor.element.getElementsByTagName("h3").length, 0, "no title block: the card names it");
});

test("hovering a card plays it in its own thumbnail and leaving settles it", t => {
  const doc = createCepDocument(), frames = [];
  const editor = ui.createElementsEditor(doc, { i18n: createI18n({ locale: "pt-BR" }), context: () => ({ isComposition: true }),
    execute: async () => ok, error: () => "erro", frame: cb => { frames.push(cb); return frames.length; }, cancelFrame: () => {} });
  t.after(() => editor.dispose());
  const card = editor.element.getElementsByTagName("button").find(b => b.id === "element-ring"), svg = card.getElementsByTagName("svg")[0];
  card.emit("mouseenter");
  assert.equal(frames.length, 1, "playback scheduled");
  frames[0](0); frames[1](300);
  const ring = svg.children.find(g => g.getAttribute("data-layer") === "ring");
  assert.ok(ring, "the card repaints its own artwork");
  card.emit("mouseleave");
  const scheduled = frames.length; frames[frames.length - 1](600);
  assert.equal(frames.length, scheduled, "stopped after leaving");
});
