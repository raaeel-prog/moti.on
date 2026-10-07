import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { setImmediate } from "node:timers/promises";
import { createFakeWindow } from "../../../packages/ui-core/tests/fake-dom.mjs";

import { createCepDocument } from "./cep-dom.mjs";
import { WORD_REVEAL_DEFAULTS, PROXIMITY_MORPH_DEFAULTS, PROXIMITY_MORPH_PRESETS } from "../../../packages/contracts/dist/index.js";

const bundle = readFileSync(new URL("../../../dist/after-effects-cep/client/main.js", import.meta.url), "utf8");

async function mountPanel(commandData, { holdWrites = false, holdCommands = [] } = {}) {
  const document = createCepDocument();
  const mount = document.createElement("div");
  document.querySelector = () => null;
  document.getElementById = (id) => id === "root" ? mount : null;
  const window = createFakeWindow();
  const requests = [];
  const pendingWrites = [];
  const context = {
    hostVersion: "26.3.0", projectName: null, projectPath: null,
    activeItemName: "Fixture", isComposition: true, compWidth: 1920,
    compHeight: 1080, compDuration: 5, compFrameRate: 30, currentTime: 0,
    workAreaStart: 0, workAreaDuration: 5, selectionLayerCount: 1,
    selectionPropertyCount: 1, selectionExpressibleCount: 1,
    selectionSelectedKeyCount: 2, selectionHasKeyframes: true,
    selectionHasExpressions: false, selectionIs3D: false,
    averageLayerDurationSeconds: 5, selectionTruncated: false
  };
  class CSInterface {
    getHostEnvironment() { return { appVersion: "26.3.0", appUILocale: "en_US" }; }
    getSystemPath() { return "/fixture"; }
    evalScript(script, callback) {
      if (!script.startsWith("MotionAE.dispatch(")) { callback("function"); return; }
      let command = "";
      const response = runInNewContext(script, { MotionAE: { dispatch(serialized) {
        const request = JSON.parse(serialized);
        requests.push(request);
        command = request.command;
        return JSON.stringify({ protocolVersion: 1, requestId: request.requestId,
          ok: true, data: request.command === "ae.context.read" ? context :
            commandData?.(request) ?? (request.command === "ae.text.word-reveal.read"
              ? { rigVersion: 0, renderer: null, controls: null, wordCount: 0, baked: false } : request.command === "ae.text.variable-morph.read"
                ? morphSnapshot(null, { rigVersion: 0, renderer: null, glyphCount: 0 }) : { appliedCount: 1, unchangedCount: 0 }),
          warnings: [], error: null });
      } } });
      if (holdCommands.includes(command) || holdWrites && command !== "ae.context.read" && command !== "ae.presets.inspect" && command !== "ae.text.word-reveal.read" && command !== "ae.text.variable-morph.read") pendingWrites.push(() => callback(response));
      else callback(response);
    }
  }
  runInNewContext(bundle, { document, window, CSInterface,
    SystemPath: { EXTENSION: "extension" },
    requestAnimationFrame: () => 1, cancelAnimationFrame() {}, performance: { now: () => 0 },
    setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {} });
  await setImmediate();
  return { mount, requests, document, context, pendingWrites,
    completeNextWrite: () => pendingWrites.shift()?.(),
    buttons: () => mount.getElementsByTagName("button"),
    nav: (label) => mount.getElementsByRole("tab").find((node) => node.allText === label) };
}

test("AE bundle: icon-only tools, fixed anchor and no diagnostic actions on Home", async () => {
  const f = await mountPanel();
  assert.ok(f.mount.getElementsByTagName("input").some(node => node.type === "search"));
  const tiles = f.buttons().filter(node => node.id.startsWith("library-tool-"));
  assert.equal(tiles.length, 47);
  assert.ok(tiles.every(node => node.allText === "" && node.getAttribute("aria-label")));
  assert.equal(f.mount.getElementsByRole("radio").length, 9);
  assert.doesNotMatch(f.mount.allText, /Export diagnostics|Apply$/);
});

test("AE bundle: vertical text pulse appears in the Effects tool category", async () => {
  const f = await mountPanel();
  const byId = id => f.buttons().find(node => node.id === id);
  byId("library-category-select").click();
  byId("library-category-effects").click();
  await setImmediate();
  assert.ok(byId("library-tool-verticalPulse"));
  assert.ok(byId("library-tool-gradient"));
  assert.ok(!byId("library-tool-wordReveal"));
});

test("AE bundle: one click executes Quick once; options open the editor without execution", async () => {
  const f = await mountPanel();
  const byId = id => f.buttons().find(node => node.id === id);
  const wiggle = byId("library-tool-wiggle");
  wiggle.click(); wiggle.click();
  await setImmediate();
  const writes = f.requests.filter(r => r.command === "ae.expression.wiggle");
  assert.equal(writes.length, 1);
  assert.equal(writes[0].options.mode, "quick"); assert.equal(writes[0].options.emitLiveControls, true);
  assert.equal(writes[0].args.amplitude, 20);
  assert.ok(byId("library-tool-wiggle"), "Quick stays on the grid");
  byId("library-options-wiggle").click();
  byId("library-edit-wiggle").click();
  await setImmediate();
  assert.equal(f.requests.filter(r => r.command === "ae.expression.wiggle").length, 1);
  assert.ok(f.mount.getElementsByTagName("input").some(n => n.id === "wiggle-frequency"));
});

test("AE bundle: search preserves focus and query across a Quick render", async () => {
  const f = await mountPanel(); const search = f.mount.getElementsByTagName("input").find(n => n.type === "search");
  search.focus(); search.value = "wig"; search.emit("input");
  assert.equal(f.document.activeElement, search);
  assert.ok(f.buttons().filter(n => n.id.startsWith("library-tool-")).length < 47);
  assert.ok(!f.buttons().some(n => n.id === "library-tool-anchor"));
  f.buttons().find(n => n.id === "library-tool-wiggle").click(); await setImmediate();
  assert.equal(f.mount.getElementsByTagName("input").find(n => n.type === "search").value, "wig");
});

test("AE bundle: video text effects apply directly from the quick grid", async () => {
  for (const [tool, command] of [["wordReveal", "ae.text.word-reveal"], ["variableMorph", "ae.text.variable-morph"], ["styleSwap", "ae.text.style-swap"]]) {
    const f = await mountPanel();
    if (tool === "styleSwap") f.context.selectionLayerCount = 2;
    const button = f.buttons().find(node => node.id === `library-tool-${tool}`);
    assert.ok(button, tool); button.click(); button.click(); await setImmediate();
    const writes = f.requests.filter(request => request.command === command);
    assert.equal(writes.length, 1, "double click cannot create two rigs");
    assert.equal(writes[0].args.action, "apply");
    assert.equal(writes[0].options.mode, "quick");
    assert.equal(writes[0].options.emitLiveControls, true);
    assert.equal(writes[0].options.preserveSelection, tool === "wordReveal");
    assert.ok(f.buttons().find(node => node.id === `library-tool-${tool}`), "quick stays on the grid");
    if (tool === "wordReveal") {
      assert.equal(writes[0].args.renderer, "morph");
      assert.equal(writes[0].args.durationFrames, 36);
      assert.equal(writes[0].args.direction, "bottom");
    }
    if (tool === "variableMorph") {
      assert.equal(writes[0].args.renderer, "auto"); assert.equal(writes[0].args.preset, "soft-weight");
      assert.equal(writes[0].args.weight, 35); assert.equal(writes[0].args.smoothness, 75);
    }
  }
});

function wordSnapshot(controls = { ...WORD_REVEAL_DEFAULTS }, overrides = {}) {
  return { rigVersion: 2, renderer: "morph", controls, wordCount: 3, baked: false, ...overrides };
}
async function openWordEditor(f) {
  f.buttons().find(n => n.id === "library-options-wordReveal").click();
  f.buttons().find(n => n.id === "library-edit-wordReveal").click();
  await setImmediate();
}
function wordField(f, id, tag = "input") { return f.mount.getElementsByTagName(tag).find(n => n.id === `wordReveal-${id}`); }

test("AE bundle: Word morph Quick rereads native controls instead of resetting them", async () => {
  const controls = { ...WORD_REVEAL_DEFAULTS, durationFrames: 67, staggerFrames: 8, direction: "right", smoothness: 94, automatic: false, progress: 48 };
  const f = await mountPanel(request => request.command === "ae.text.word-reveal.read" ? wordSnapshot(controls) : null);
  f.buttons().find(n => n.id === "library-tool-wordReveal").click();
  await setImmediate();
  const write = f.requests.find(r => r.command === "ae.text.word-reveal");
  assert.equal(write.args.durationFrames, 67); assert.equal(write.args.direction, "right");
  assert.equal(write.args.smoothness, 94); assert.equal(write.args.automatic, false); assert.equal(write.args.progress, 48);
  assert.equal(f.requests.filter(r => r.command === "ae.text.word-reveal.read").length, 2);
});

test("AE bundle: Word morph editor hydrates selection and keeps details behind a disclosure", async () => {
  const controls = { ...WORD_REVEAL_DEFAULTS, durationFrames: 43, direction: "left", smoothness: 86.25 };
  const f = await mountPanel(request => request.command === "ae.text.word-reveal.read" ? wordSnapshot(controls) : null);
  await openWordEditor(f);
  assert.equal(wordField(f, "durationFrames").value, "43");
  assert.equal(wordField(f, "smoothness").value, "86.25");
  assert.notEqual(wordField(f, "smoothness").getAttribute("aria-invalid"), "true");
  assert.equal(wordField(f, "direction", "select").value, "left");
  const details = f.mount.getElementsByTagName("details").find(n => n.id === "wordReveal-advanced");
  assert.equal(details.open, false);
  assert.ok(details.getElementsByTagName("input").some(n => n.id === "wordReveal-formationPercent"));
  assert.ok(!details.getElementsByTagName("input").some(n => n.id === "wordReveal-durationFrames"));
  assert.equal(f.requests.filter(r => r.command === "ae.text.word-reveal").length, 0, "opening only reads");
  const automatic = wordField(f, "automatic"); automatic.checked = false; automatic.emit("change");
  assert.ok(wordField(f, "progress"));
  const sourceColor = wordField(f, "useSourceColor"); sourceColor.checked = false; sourceColor.emit("change");
  assert.ok(wordField(f, "textColor"));
  f.buttons().find(n => n.id === "tool-wordReveal-apply").click(); await setImmediate();
  const write = f.requests.find(r => r.command === "ae.text.word-reveal");
  assert.equal(write.args.automatic, false); assert.equal(write.args.useSourceColor, false);
});

test("AE bundle: legacy reveal is upgraded only by the explicit operation", async () => {
  const legacy = { action: "apply", durationFrames: 24, staggerFrames: 5, paddingX: 0, paddingY: 15, roundness: 0,
    revealPoint: 50, boxGap: 3, fillColor: [1,.12,.08] };
  const f = await mountPanel(request => request.command === "ae.text.word-reveal.read" ? wordSnapshot(legacy, { rigVersion: 1, renderer: "legacy" }) : null);
  await openWordEditor(f);
  assert.match(f.mount.allText, /earlier reveal|revelação anterior/);
  assert.equal(wordField(f, "direction", "select"), undefined);
  const operation = wordField(f, "action", "select"); operation.value = "update"; operation.emit("change");
  assert.ok(wordField(f, "direction", "select"));
  assert.match(f.buttons().find(n => n.id === "tool-wordReveal-apply").allText, /Upgrade to morph|Atualizar para morph/);
  f.buttons().find(n => n.id === "tool-wordReveal-apply").click(); await setImmediate();
  const write = f.requests.find(r => r.command === "ae.text.word-reveal");
  assert.equal(write.args.action, "update"); assert.equal(write.args.renderer, "morph");
  assert.equal(write.args.durationFrames, 24, "preserve legacy timing on upgrade");
});

test("AE bundle: Word morph exposes Bake and makes a baked rig require Update", async () => {
  let baked = false;
  const f = await mountPanel(request => {
    if (request.command === "ae.text.word-reveal.read") return wordSnapshot({ ...WORD_REVEAL_DEFAULTS }, { baked });
    if (request.command === "ae.text.word-reveal" && request.args.action === "bake") baked = true;
    return null;
  });
  await openWordEditor(f);
  const operation = wordField(f, "action", "select"); operation.value = "bake"; operation.emit("change");
  assert.match(f.buttons().find(n => n.id === "tool-wordReveal-apply").allText, /keyframes/);
  assert.equal(wordField(f, "durationFrames"), undefined);
  f.buttons().find(n => n.id === "tool-wordReveal-apply").click(); await setImmediate();
  assert.equal(f.requests.find(r => r.command === "ae.text.word-reveal").args.action, "bake");
  assert.equal(baked, true); assert.equal(f.requests.filter(r => r.command === "ae.text.word-reveal.read").length, 2);
  assert.equal(f.buttons().find(n => n.id === "tool-wordReveal-apply").getAttribute("aria-disabled"), "true");
  assert.match(f.mount.allText, /uses keyframes|está em keyframes/);
  const update = wordField(f, "action", "select"); update.value = "update"; update.emit("change");
  assert.notEqual(f.buttons().find(n => n.id === "tool-wordReveal-apply").getAttribute("aria-disabled"), "true");
});

test("AE bundle: malformed Word morph snapshot prevents a Quick mutation", async () => {
  const f = await mountPanel(request => request.command === "ae.text.word-reveal.read" ? { rigVersion: 2, controls: {} } : null);
  f.buttons().find(n => n.id === "library-tool-wordReveal").click(); await setImmediate();
  assert.equal(f.requests.filter(r => r.command === "ae.text.word-reveal").length, 0);
  assert.match(f.mount.allText, /Could not read|Não foi possível ler/);
});

function morphSnapshot(controls = { ...PROXIMITY_MORPH_DEFAULTS, renderer: "outline" }, overrides = {}) {
  return { rigVersion: 2, renderer: "outline", controls, glyphCount: 8, baked: false, stale: false,
    capabilities: { weight: true, contrast: false, italic: false, variable: false, outline: true }, lockedControls: [], ...overrides };
}
async function openMorphEditor(f) {
  f.buttons().find(n => n.id === "library-options-variableMorph").click();
  f.buttons().find(n => n.id === "library-edit-variableMorph").click();
  await setImmediate();
}
function morphField(f, id, tag = "input") { return f.mount.getElementsByTagName(tag).find(n => n.id === `variableMorph-${id}`); }

test("AE bundle: Proximity Quick reads and preserves existing project controls and selection", async () => {
  const controls = { ...PROXIMITY_MORPH_DEFAULTS, renderer: "outline", radius: 517.25, weight: -42, scaleX: 133, skew: 9, lift: -18 };
  const f = await mountPanel(request => request.command === "ae.text.variable-morph.read" ? morphSnapshot(controls, { lockedControls: ["weight"] }) : null);
  f.buttons().find(n => n.id === "library-tool-variableMorph").click(); await setImmediate();
  const write = f.requests.find(r => r.command === "ae.text.variable-morph");
  assert.equal(write.args.radius, 517.25); assert.equal(write.args.weight, -42); assert.equal(write.args.scaleX, 133);
  assert.equal(write.args.skew, 9); assert.equal(write.args.lift, -18); assert.equal(write.options.preserveSelection, true);
  assert.equal(f.requests.filter(r => r.command === "ae.text.variable-morph.read").length, 2);
});

test("AE bundle: Proximity editor hydrates common fonts and puts individual controls in Advanced", async () => {
  const f = await mountPanel(request => request.command === "ae.text.variable-morph.read"
    ? morphSnapshot({ ...PROXIMITY_MORPH_DEFAULTS, renderer: "outline", radius: 418.5, smoothness: 82, scaleX: 109 }) : null);
  await openMorphEditor(f);
  assert.equal(morphField(f, "radius").value, "418.5"); assert.equal(morphField(f, "smoothness").value, "82");
  assert.equal(morphField(f, "contrast"), undefined); assert.equal(morphField(f, "italic"), undefined);
  const advanced = f.mount.getElementsByTagName("details").find(n => n.id === "variableMorph-advanced");
  assert.equal(advanced.open, false); assert.ok(advanced.getElementsByTagName("input").some(n => n.id === "variableMorph-skew"));
  assert.ok(!advanced.getElementsByTagName("input").some(n => n.id === "variableMorph-radius"));
  assert.equal(morphField(f, "preset", "select").value, "custom");
  assert.equal(f.requests.filter(r => r.command === "ae.text.variable-morph").length, 0);
});

test("AE bundle: proximity shortens native float display while preserving exact controls until edited", async () => {
  const controls = { ...PROXIMITY_MORPH_DEFAULTS, renderer: "outline", radius: 166.66667175293, strength: 86.6666641235, weight: 35.123456789 };
  const f = await mountPanel(request => request.command === "ae.text.variable-morph.read" ? morphSnapshot(controls, { lockedControls: ["weight"] }) : null);
  await openMorphEditor(f);
  assert.equal(morphField(f, "radius").value, "166.67"); assert.equal(morphField(f, "strength").value, "86.67");
  assert.equal(morphField(f, "weight").value, "35.12"); assert.equal(morphField(f, "weight").disabled, true);
  morphField(f, "radius").emit("change");
  f.buttons().find(n => n.id === "tool-variableMorph-apply").click(); await setImmediate();
  const first = f.requests.find(r => r.command === "ae.text.variable-morph");
  assert.equal(first.args.radius, controls.radius); assert.equal(first.args.strength, controls.strength); assert.equal(first.args.weight, controls.weight);
  const radius = morphField(f, "radius"); radius.value = "170.25"; radius.emit("change");
  f.buttons().find(n => n.id === "tool-variableMorph-apply").click(); await setImmediate();
  const edited = f.requests.filter(r => r.command === "ae.text.variable-morph").at(-1);
  assert.equal(edited.args.radius, 170.25); assert.equal(edited.args.strength, controls.strength); assert.equal(edited.args.weight, controls.weight);
});

test("AE bundle: all proximity presets reset geometry and unsupported axes to neutral values", async () => {
  for (const [preset, expected] of Object.entries(PROXIMITY_MORPH_PRESETS)) {
    const f = await mountPanel(request => request.command === "ae.text.variable-morph.read" ? morphSnapshot() : null);
    await openMorphEditor(f);
    const field = morphField(f, "preset", "select"); field.value = preset; field.emit("change");
    f.buttons().find(n => n.id === "tool-variableMorph-apply").click(); await setImmediate();
    const write = f.requests.find(r => r.command === "ae.text.variable-morph");
    for (const [key, value] of Object.entries(expected)) assert.equal(write.args[key], value, `${preset}: ${key}`);
    assert.equal(write.args.preset, preset); assert.equal(write.options.preserveSelection, true);
  }
});

test("AE bundle: proximity exposes font axes only when the selected variable font supports them", async () => {
  const f = await mountPanel(request => request.command === "ae.text.variable-morph.read"
    ? morphSnapshot({ ...PROXIMITY_MORPH_DEFAULTS, renderer: "variable" }, { renderer: "variable",
      capabilities: { variable: true, outline: true, weight: true, contrast: true, italic: false } }) : null);
  await openMorphEditor(f);
  assert.ok(morphField(f, "contrast")); assert.equal(morphField(f, "italic"), undefined);
  assert.match(f.mount.allText, /variable font axes/);
});

test("AE bundle: animated proximity values and preset selector cannot overwrite project animation", async () => {
  const controls = { ...PROXIMITY_MORPH_DEFAULTS, renderer: "outline", weight: -24.5 };
  const f = await mountPanel(request => request.command === "ae.text.variable-morph.read" ? morphSnapshot(controls, { lockedControls: ["weight"] }) : null);
  await openMorphEditor(f);
  assert.equal(morphField(f, "weight").disabled, true); assert.equal(morphField(f, "preset", "select").disabled, true);
  const strength = morphField(f, "strength"); strength.value = "75.5"; strength.emit("change");
  f.buttons().find(n => n.id === "tool-variableMorph-apply").click(); await setImmediate();
  const write = f.requests.find(r => r.command === "ae.text.variable-morph");
  assert.equal(write.args.weight, -24.5); assert.equal(write.args.strength, 75.5);
});

test("AE bundle: proximity sweep exposes duration and direction only for its operation", async () => {
  const f = await mountPanel(request => request.command === "ae.text.variable-morph.read" ? morphSnapshot() : null);
  await openMorphEditor(f);
  assert.equal(morphField(f, "sweepFrames"), undefined);
  const operation = morphField(f, "action", "select"); operation.value = "sweep"; operation.emit("change");
  assert.equal(morphField(f, "sweepFrames").value, "48");
  const direction = morphField(f, "sweepDirection", "select"); direction.value = "bottom-to-top"; direction.emit("change");
  f.buttons().find(n => n.id === "tool-variableMorph-apply").click(); await setImmediate();
  const write = f.requests.find(r => r.command === "ae.text.variable-morph");
  assert.equal(write.args.action, "sweep"); assert.equal(write.args.sweepFrames, 48); assert.equal(write.args.sweepDirection, "bottom-to-top");
  assert.equal(write.options.preserveSelection, true);
});

test("AE bundle: stale or baked proximity requires Update and explicit mode switch uses Update", async () => {
  for (const state of [{ stale: true }, { baked: true }]) {
    const f = await mountPanel(request => request.command === "ae.text.variable-morph.read" ? morphSnapshot(undefined, state) : null);
    await openMorphEditor(f);
    assert.equal(f.buttons().find(n => n.id === "tool-variableMorph-apply").getAttribute("aria-disabled"), "true");
    const operation = morphField(f, "action", "select"); operation.value = "update"; operation.emit("change");
    assert.notEqual(f.buttons().find(n => n.id === "tool-variableMorph-apply").getAttribute("aria-disabled"), "true");
    const mode = morphField(f, "renderer", "select"); mode.value = "variable"; mode.emit("change");
    f.buttons().find(n => n.id === "tool-variableMorph-apply").click(); await setImmediate();
    const write = f.requests.find(r => r.command === "ae.text.variable-morph");
    assert.equal(write.args.action, "update"); assert.equal(write.args.renderer, "variable"); assert.equal(write.options.preserveSelection, true);
  }
});

test("AE bundle: malformed proximity capabilities prevent mutation", async () => {
  const f = await mountPanel(request => request.command === "ae.text.variable-morph.read" ? morphSnapshot(undefined, { capabilities: {} }) : null);
  f.buttons().find(n => n.id === "library-tool-variableMorph").click(); await setImmediate();
  assert.equal(f.requests.filter(r => r.command === "ae.text.variable-morph").length, 0);
  assert.match(f.mount.allText, /could not be read/);
});

test("AE bundle: legacy proximity keeps its controls until an explicit upgrade", async () => {
  const legacy = { action: "apply", radius: 320, strength: 86, weight: 60, contrast: 0, italic: 0 };
  const f = await mountPanel(request => request.command === "ae.text.variable-morph.read"
    ? morphSnapshot(legacy, { rigVersion: 1, renderer: "variable", capabilities: { weight: true, contrast: false, italic: false, variable: true, outline: true } }) : null);
  await openMorphEditor(f);
  assert.match(f.mount.allText, /Earlier morph detected/); assert.equal(morphField(f, "weight").value, "60");
  assert.equal(morphField(f, "scaleX"), undefined); assert.equal(morphField(f, "preset", "select").disabled, true);
  const operation = morphField(f, "action", "select"); operation.value = "update"; operation.emit("change");
  assert.ok(morphField(f, "scaleX")); assert.equal(morphField(f, "weight").disabled, true, "Update preserves current project controls");
  const mode = morphField(f, "renderer", "select"); mode.value = "outline"; mode.emit("change");
  f.buttons().find(n => n.id === "tool-variableMorph-apply").click(); await setImmediate();
  const write = f.requests.find(r => r.command === "ae.text.variable-morph");
  assert.equal(write.args.action, "update"); assert.equal(write.args.renderer, "outline"); assert.equal(write.args.weight, 60);
});
test("AE bundle: legacy proximity Quick and Remove use the unchanged six-control payload", async () => {
  const legacy = { action: "apply", radius: 320, strength: 86, weight: 60, contrast: 0, italic: 0 };
  const provide = request => request.command === "ae.text.variable-morph.read"
    ? morphSnapshot({ ...PROXIMITY_MORPH_DEFAULTS, ...legacy, renderer: "variable" }, { rigVersion: 1, renderer: "variable" }) : null;
  const quick = await mountPanel(provide);
  quick.buttons().find(n => n.id === "library-tool-variableMorph").click(); await setImmediate();
  assert.deepEqual(quick.requests.find(r => r.command === "ae.text.variable-morph").args, legacy);
  const f = await mountPanel(provide); await openMorphEditor(f);
  const operation = morphField(f, "action", "select"); operation.value = "remove"; operation.emit("change");
  f.buttons().find(n => n.id === "tool-variableMorph-apply").click(); await setImmediate();
  assert.deepEqual(f.requests.find(r => r.command === "ae.text.variable-morph").args, { ...legacy, action: "remove" });
});

test("AE bundle: a delayed proximity read cannot change the state after leaving the editor", async () => {
  const f = await mountPanel(request => request.command === "ae.text.variable-morph.read" ? { rigVersion: 2, controls: {} } : null,
    { holdCommands: ["ae.text.variable-morph.read"] });
  await openMorphEditor(f);
  assert.equal(f.pendingWrites.length, 1);
  f.nav("Presets").click(); await setImmediate();
  f.completeNextWrite(); await setImmediate();
  assert.equal(f.nav("Presets").getAttribute("aria-selected"), "true");
  assert.doesNotMatch(f.mount.allText, /could not be read|Não foi possível ler/);
  assert.equal(f.requests.filter(r => r.command === "ae.text.variable-morph").length, 0);
});

test("AE bundle: anchor cell executes directly and retains grid", async () => {
  const f = await mountPanel(); f.mount.getElementsByRole("radio")[0].click(); await setImmediate();
  const writes = f.requests.filter(r => r.command === "ae.anchor.align");
  assert.equal(writes.length, 1); assert.equal(writes[0].args.gridPoint, "topLeft");
  assert.equal(writes[0].args.preserveVisualPosition, true);
  assert.equal(f.mount.getElementsByRole("radio").length, 9);
});

test("AE bundle: all 18 FX Studio shortcuts replace the anchor copy and dispatch once", async () => {
  const actions = ['precompose', 'center', 'save-frame', 'freeze', 'fit', 'dash-stroke',
    'create-adjustment', 'mirror', 'create-solid', 'create-shape', 'create-null', 'create-camera',
    'effect-hue', 'effect-fill', 'effect-tint', 'effect-blur', 'effect-lumetri', 'effect-curves'];
  for (const action of actions) {
    const f = await mountPanel();
    const shortcuts = f.buttons().filter(node => node.id.startsWith('library-quick-'));
    assert.equal(shortcuts.length, 18);
    assert.equal(f.mount.getElementsByRole('radio').length, 9);
    assert.doesNotMatch(f.mount.allText, /Click a point to apply|Anchor options/);
    const target = shortcuts.find(node => node.id === `library-quick-${action}`);
    assert.ok(target.title && target.getAttribute('aria-label'));
    target.click(); target.click(); await setImmediate();
    const writes = f.requests.filter(request => request.command.startsWith('ae.quick-tools.'));
    assert.equal(writes.length, 1, action);
    assert.equal(writes[0].args.action, action);
    assert.equal(writes[0].command, action === 'save-frame' ? 'ae.quick-tools.save-frame' : 'ae.quick-tools.apply');
    assert.equal(f.mount.getElementsByRole('radio').length, 9);
  }
});

test("AE bundle: gallery preview does not call host; named action applies the real preset", async () => {
  const f = await mountPanel(); f.nav("Presets").click(); await setImmediate();
  const cards = f.mount.getElementsByTagName("article");
  assert.ok(cards.length > 30, "the default gallery includes every collection");
  assert.ok(cards.some(card => card.id === "builtin.ease.balanced"));
  assert.ok(cards.some(card => card.id === "builtin.camera.pushIn"));
  const before = f.requests.length;
  const preview = f.buttons().find(n => n.className === "ch-preset-preview");
  assert.ok(preview); preview.click(); assert.equal(f.requests.length, before);
  f.buttons().find(n => n.allText === "Apply preset").click(); await setImmediate();
  const writes = f.requests.filter(r => r.command === "ae.presets.phase-apply");
  assert.equal(writes.length, 1); assert.equal(writes[0].args.presetId, "premium-arc-arrival");
  assert.equal(writes[0].args.phase, "in");
});

test("AE bundle: Parallax Quick sends normalized defaults once without opening another layout", async () => {
  const f = await mountPanel();
  const tile = f.buttons().find(n => n.id === "library-tool-parallax");
  tile.click(); tile.click(); await setImmediate();
  const writes = f.requests.filter(r => r.command === "ae.animate.parallax.quick");
  assert.equal(writes.length, 1);
  assert.equal(writes[0].args.depthStep, 0);
  assert.equal(writes[0].args.preserveFraming, true);
  assert.equal(writes[0].options.mode, "quick");
  assert.ok(f.buttons().some(n => n.id === "library-tool-parallax"));
});


test("AE bundle: one Parallax entry retains advanced operations through its settings", async () => {
  const f = await mountPanel();
  assert.ok(f.buttons().some(n => n.id === "library-tool-parallax"));
  assert.ok(!f.buttons().some(n => n.id === "library-tool-parallaxFull"));
  f.buttons().find(n => n.id === "library-options-parallax").click();
  f.buttons().find(n => n.id === "library-edit-parallax").click();
  await setImmediate();
  assert.ok(f.mount.getElementsByTagName("select").some(n => n.id === "parallaxFull-operation"));
});

test("AE bundle: Parallax Adjust requests the mutating advanced path", async () => {
  const f = await mountPanel();
  f.buttons().find(n => n.id === "library-options-parallax").click();
  f.buttons().find(n => n.id === "library-edit-parallax").click();
  const operation = f.mount.getElementsByTagName("select").find(n => n.id === "parallaxFull-operation");
  operation.value = "adjust";
  operation.emit("change");
  f.buttons().find(n => n.allText === "Apply").click();
  await setImmediate();
  const writes = f.requests.filter(r => r.command === "ae.parallax.adjust");
  assert.equal(writes.length, 1);
  assert.equal(writes[0].options.mode, "advanced");
});

test("AE bundle: Clean scans first and removes only explicitly selected managed items", async () => {
  const f = await mountPanel(request => request.command === "ae.project.clean"
    ? request.args.removeConfirmed
      ? { removedCount: 1, removedItemIds: [42] }
      : { scanned: true, unusedCount: 2, removableCount: 1, scanToken: "scan-1", findings: [
        { id: 42, name: "Suite Texture", origin: "managed", risk: "low" },
        { id: 43, name: "User Footage", origin: "external", risk: "high" }
      ] }
    : null);
  f.buttons().find(n => n.id === "library-options-clean").click();
  f.buttons().find(n => n.id === "library-edit-clean").click();
  f.buttons().find(n => n.allText === "Preview items").click();
  await setImmediate();
  const calls = () => f.requests.filter(r => r.command === "ae.project.clean");
  assert.equal(calls().length, 1);
  assert.deepEqual(calls()[0].args, { removeConfirmed: false });
  assert.notEqual(calls()[0].options.allowDestructive, true);
  assert.match(f.mount.allText, /User Footage/);
  assert.equal(f.mount.getElementsByTagName("input").some(n => n.id === "clean-item-43"), false);
  const removable = f.mount.getElementsByTagName("input").find(n => n.id === "clean-item-42");
  assert.ok(removable);
  removable.checked = true;
  removable.emit("change");
  f.buttons().find(n => n.allText === "Remove selected").click();
  await setImmediate();
  assert.equal(calls().length, 2);
  assert.deepEqual(calls()[1].args, { removeConfirmed: true, selectedItemIds: [42], scanToken: "scan-1" });
  assert.equal(calls()[1].options.allowDestructive, true);
});

test("AE bundle: Look At exposes six axes and sends the edited orientation offset", async () => {
  const f = await mountPanel();
  f.buttons().find(n => n.id === "library-options-lookAt").click();
  f.buttons().find(n => n.id === "library-edit-lookAt").click();
  const find = id => f.mount.getElementsByTagName("input").find(n => n.id === id);
  // const target = find("lookAt-targetLayerName");
  // target.value = "Target";
  // target.emit("change");
  const axis = f.mount.getElementsByTagName("select").find(n => n.id === "lookAt-forwardAxis");
  assert.deepEqual(axis.getElementsByTagName("option").map(n => n.value),
    ["+z", "-z", "+x", "-x", "+y", "-y"]);
  axis.value = "+y";
  axis.emit("change");
  const offsetX = find("lookAt-offset-x");
  offsetX.value = "45";
  offsetX.emit("change");
  f.buttons().find(n => n.allText === "Apply").click();
  await setImmediate();
  const writes = f.requests.filter(r => r.command === "ae.3d.look-at");
  assert.equal(writes.length, 1);
  assert.equal(writes[0].args.forwardAxis, "+y");
  assert.deepEqual(writes[0].args.offsetOrientation, [45, 0, 0]);
});


test("AE bundle: Quick keeps search, tile, dock and shortcuts mounted during execution", async () => {
  const f = await mountPanel(undefined, { holdWrites: true });
  const byId = id => f.buttons().find(node => node.id === id);
  byId("library-search-open").click();
  const search = f.mount.getElementsByTagName("input").find(node => node.id === "library-search");
  search.value = "wig"; search.emit("input"); search.focus();
  const tile = byId("library-tool-wiggle");
  const toggle = byId("quick-dock-toggle");
  const solid = byId("library-quick-create-solid");
  const anchor = f.mount.getElementsByRole("radio")[0];
  const dock = f.mount.getElementsByTagName("section").find(node => node.className === "ch-quick-dock");
  tile.click();
  assert.equal(byId("library-tool-wiggle"), tile);
  assert.equal(byId("quick-dock-toggle"), toggle);
  assert.equal(byId("library-quick-create-solid"), solid);
  assert.equal(f.mount.getElementsByRole("radio")[0], anchor);
  assert.equal(f.mount.getElementsByTagName("section").find(node => node.className === "ch-quick-dock"), dock);
  assert.equal(f.document.activeElement, search);
  assert.equal(tile.getAttribute("aria-disabled"), "true");
  assert.equal(solid.disabled, true);
  assert.equal(anchor.disabled, true);
  tile.click(); solid.click();
  await setImmediate();
  assert.equal(f.pendingWrites.length, 1);
  assert.equal(f.requests.filter(request => request.command === "ae.expression.wiggle").length, 1);
  assert.equal(f.requests.some(request => request.command.startsWith("ae.quick-tools.")), false);
  f.completeNextWrite(); await setImmediate();
  assert.equal(byId("library-tool-wiggle"), tile);
  assert.equal(byId("quick-dock-toggle"), toggle);
  assert.equal(byId("library-quick-create-solid"), solid);
  assert.equal(f.mount.getElementsByTagName("input").find(node => node.id === "library-search"), search);
  assert.equal(search.value, "wig");
  assert.equal(f.document.activeElement, search);
  assert.equal(solid.disabled, false);
  assert.equal(anchor.disabled, false);
  assert.equal(tile.getAttribute("aria-disabled"), "false");
});

test("AE bundle: current context updates existing quick actions after a command without stale closures", async () => {
  const f = await mountPanel(undefined, { holdWrites: true });
  const byId = id => f.buttons().find(node => node.id === id);
  const center = byId("library-quick-center");
  const solid = byId("library-quick-create-solid");
  const anchor = f.mount.getElementsByRole("radio")[0];
  const toggle = byId("quick-dock-toggle");
  const search = f.mount.getElementsByTagName("input").find(node => node.id === "library-search");
  center.click(); center.click(); await setImmediate();
  assert.equal(center.disabled, true); assert.equal(solid.disabled, true);
  assert.equal(f.requests.filter(request => request.command === "ae.quick-tools.apply").length, 1);
  f.context.selectionLayerCount = 0;
  f.context.selectionSignature = "comp:empty";
  f.context.selectionPropertyCount = 0;
  f.context.selectionExpressibleCount = 0;
  f.context.selectionSelectedKeyCount = 0;
  f.completeNextWrite(); await setImmediate();
  assert.equal(byId("library-quick-center"), center);
  assert.equal(byId("library-quick-create-solid"), solid);
  assert.equal(byId("quick-dock-toggle"), toggle);
  assert.equal(f.mount.getElementsByTagName("input").find(node => node.id === "library-search"), search);
  assert.equal(center.disabled, true); assert.match(center.title, /Select a layer/);
  assert.equal(anchor.disabled, true);
  assert.equal(solid.disabled, false);
  assert.equal(toggle.getAttribute("aria-expanded"), "false");
  center.click(); await setImmediate();
  assert.equal(f.requests.filter(request => request.command === "ae.quick-tools.apply").length, 1);
  toggle.click(); solid.click(); solid.click(); await setImmediate();
  const writes = f.requests.filter(request => request.command === "ae.quick-tools.apply");
  assert.equal(writes.length, 2); assert.equal(writes[1].args.action, "create-solid");
  f.completeNextWrite(); await setImmediate();
  assert.equal(byId("library-quick-create-solid"), solid);
  assert.equal(solid.disabled, false);
});



test("AE bundle: Easing has its own workspace and keyframe actions leave the Quick grid", async () => {
  const f = await mountPanel();
  for (const id of ['ease','cloneKeys','reverseKeys','reverseValues','sendToEdge']) {
    assert.ok(!f.buttons().some(node => node.id === `library-tool-${id}`),id);
  }
  const nav=f.nav('Easing'); assert.ok(nav); nav.click(); await setImmediate();
  assert.equal(nav.getAttribute('aria-selected'),'true');
  assert.ok(f.mount.querySelectorAll('.ch-ease-editor').length);
  assert.equal(f.mount.querySelectorAll('.ch-ease-modes').length,0);
  assert.equal(f.mount.querySelectorAll('.ch-ease-actions__secondary').length,0);
  assert.equal(f.buttons().filter(node=>node.id.startsWith('ease-action-')).length,6);
  assert.equal(f.requests.filter(r=>r.command.startsWith('ae.keys.')).length,0,'opening does not mutate');
});

test("AE bundle: Easing toolbar dispatches each operation once and keeps the editable curve", async () => {
  const cases=[
    ['clone','ae.keys.clone',{mode:'repeat',destination:'cti'}],
    ['reverse','ae.keys.reverse',{}],
    ['reverse-values','ae.keys.reverse-values',{}],
    ['duplicate-reverse','ae.keys.clone',{mode:'mirror',destination:'after-gap'}],
    ['duplicate-reverse-start','ae.keys.clone',{mode:'mirror',destination:'layer-start'}],
    ['duplicate-reverse-end','ae.keys.clone',{mode:'mirror',destination:'layer-end'}],
  ];
  for(const [id,command,args] of cases){
    const f=await mountPanel(undefined,{holdWrites:true}); f.nav('Easing').click(); await setImmediate();
    const target=f.buttons().find(n=>n.id===`ease-action-${id}`); assert.ok(target,id);
    target.click(); target.click(); await setImmediate();
    const writes=f.requests.filter(r=>r.command===command);
    assert.equal(writes.length,1,id); assert.deepEqual(JSON.parse(JSON.stringify(writes[0].args)),args);
    assert.equal(writes[0].options.preserveSelection,true);
    assert.ok(f.buttons().filter(n=>n.id.startsWith('ease-action-')).every(n=>n.getAttribute('aria-disabled')==='true'));
    f.completeNextWrite(); await setImmediate();
    assert.equal(f.nav('Easing').getAttribute('aria-selected'),'true');
    assert.ok(f.mount.querySelectorAll('.ch-ease-editor').length);
    assert.ok(f.buttons().filter(n=>n.id.startsWith('ease-action-')).every(n=>n.getAttribute('aria-disabled')==='false'));
  }
});

test("AE bundle: applying a curve retains the Easing workspace and draft", async () => {
  const f=await mountPanel(); f.nav('Easing').click(); await setImmediate();
  f.buttons().find(n=>n.allText==='Apply').click(); await setImmediate();
  assert.equal(f.requests.filter(r=>r.command==='ae.keys.ease.apply').length,1);
  assert.equal(f.nav('Easing').getAttribute('aria-selected'),'true');
  assert.ok(f.mount.querySelectorAll('.ch-ease-editor').length);
});

test("AE bundle: Gradients opens a focused editor and reads without mutating the project", async () => {
  const f = await mountPanel(request => request.command === "ae.effect.gradient.read" ? {
    settings: null, selectionToken: "fixture-1", selectionCount: 1, appliedCount: 0, instances: [], mixedKeys: [], lockedKeys: [], capabilities: { nativeAvailable: true }
  } : undefined);
  f.buttons().find(node => node.id === "library-tool-gradient").click();
  await setImmediate();
  assert.equal(f.requests.filter(r => r.command === "ae.effect.gradient").length, 0);
  assert.equal(f.requests.filter(r => r.command === "ae.effect.gradient.read").length, 1);
  assert.ok(f.mount.getElementsByTagName("input").some(node => node.id === "gradient-stop-0-color"));
  assert.ok(f.buttons().some(node => node.id === "gradient-background"));
  f.buttons().find(node => node.id === "gradient-apply").click();
  await setImmediate();
  const writes = f.requests.filter(r => r.command === "ae.effect.gradient");
  assert.equal(writes.length, 1); assert.equal(writes[0].args.action, "apply");
  assert.equal(writes[0].args.selectionToken, "fixture-1");
  assert.equal(writes[0].args.settings.stops.length, 8);
});
