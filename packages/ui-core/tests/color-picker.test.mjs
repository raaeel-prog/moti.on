import test from "node:test";
import assert from "node:assert/strict";

import {
  closeOpenColorPicker, colorSurfaceChrome, configureColorPickers, createColorPicker, resolveColorSurfaceLayout, supportsColorOverlay
} from "../dist/elements/color-view.js";
import { colorField } from "../dist/shell.js";
import { createFakeDocument } from "./fake-dom.mjs";

/** Overlay-capable double: layout boxes are fixed per class name. */
function overlayDocument({ width = 360, height = 720, trigger = { left: 260, top: 100, bottom: 128, width: 88, height: 28 } } = {}) {
  const doc = createFakeDocument({ clientWidth: width });
  const create = doc.createElement;
  doc.createElement = (tag) => {
    const node = create(tag);
    node.style = { setProperty(name, value) { this[name] = value; } };
    node.animate = () => {};
    node.getBoundingClientRect = () => {
      if (node.className === "ch-color-trigger") return trigger;
      if (node.className === "ch-color-area") return { left: 10, top: 40, width: 200, height: 100, bottom: 140 };
      if (node.className === "ch-color-hue") return { left: 17, top: 150, width: 186, height: 14, bottom: 164 };
      return { left: 0, top: 0, bottom: 0, width: 0, height: 0 };
    };
    node.contains = (target) => node === target || node.children.some((child) => child.contains(target));
    return node;
  };
  doc.body = doc.createElement("body");
  doc.documentElement.lang = "pt-BR";
  doc.addEventListener = () => {};
  doc.removeEventListener = () => {};
  doc.defaultView = {
    innerHeight: height,
    getComputedStyle: () => ({ transitionDuration: "0s" }),
    addEventListener() {}, removeEventListener() {}
  };
  const find = (className) => {
    const walk = (node) => {
      if ((node.className ?? "").split(/\s+/).includes(className)) return node;
      for (const child of node.children) { const found = walk(child); if (found) return found; }
      return null;
    };
    return walk(doc.body);
  };
  return { doc, find };
}

function picker(doc, overrides = {}) {
  const commits = [];
  const control = createColorPicker(doc, { id: "neon-core", label: "Cor do núcleo", value: "#ff0000", onCommit: (value) => commits.push(value), ...overrides });
  return { control, commits };
}

test("layout: the 280×280 minimum panel gets a sheet that fits without refusing to open", () => {
  const chrome = colorSurfaceChrome({ recent: true, native: true });
  const layout = resolveColorSurfaceLayout({ left: 200, top: 90, bottom: 118, width: 60 }, { width: 280, height: 280 }, chrome);
  assert.equal(layout.mode, "sheet");
  assert.equal(layout.side, "inset");
  assert.equal(layout.left, 8);
  assert.equal(layout.top, 8);
  assert.equal(layout.width, 264);
  assert.equal(layout.maxHeight, 264);
  assert.ok(layout.areaHeight >= 56 && chrome + layout.areaHeight <= layout.maxHeight, JSON.stringify(layout));
});

test("layout: a roomy panel anchors a popover below the trigger, or above it near the bottom", () => {
  const chrome = colorSurfaceChrome({ recent: false, native: true });
  const below = resolveColorSurfaceLayout({ left: 260, top: 100, bottom: 128, width: 88 }, { width: 360, height: 720 }, chrome);
  assert.equal(below.mode, "popover");
  assert.equal(below.side, "below");
  assert.equal(below.top, 132);
  assert.equal(below.left + below.width, 348, "right edge follows the trigger");
  assert.equal(below.areaHeight, 140);
  const above = resolveColorSurfaceLayout({ left: 260, top: 640, bottom: 668, width: 88 }, { width: 360, height: 720 }, chrome);
  assert.equal(above.side, "above");
  assert.ok(above.top >= 8 && above.top + above.maxHeight <= 636, JSON.stringify(above));
});

test("layout: a wide but short panel centers a capped sheet; tiny panels keep the area floor", () => {
  const wide = resolveColorSurfaceLayout({ left: 600, top: 120, bottom: 148, width: 88 }, { width: 720, height: 280 }, colorSurfaceChrome({ recent: true, native: true }));
  assert.equal(wide.mode, "sheet");
  assert.equal(wide.width, 360);
  assert.equal(wide.left, 180);
  const tiny = resolveColorSurfaceLayout({ left: 0, top: 0, bottom: 20, width: 20 }, { width: 200, height: 150 }, 182);
  assert.equal(tiny.mode, "sheet");
  assert.equal(tiny.areaHeight, 56, "the surface scrolls instead of collapsing the area");
});

test("fields fall back to the native control without overlays (UXP, minimal DOMs)", () => {
  const doc = createFakeDocument();
  assert.equal(supportsColorOverlay(doc), false);
  const field = colorField(doc, { id: "accent", label: "Cor", value: "#abcdef", onCommit() {} });
  assert.equal(field.getElementsByTagName("input").length, 1);
  assert.equal(field.getElementsByTagName("button").length, 0);
});

test("colorField uses the in-panel picker when overlays exist; label points at the trigger", () => {
  const { doc } = overlayDocument();
  assert.equal(supportsColorOverlay(doc), true);
  const field = colorField(doc, { id: "accent", label: "Cor", value: "#ABCDEF", description: "Usada no brilho", onCommit() {} });
  const trigger = field.getElementsByTagName("button")[0];
  assert.match(field.className, /ch-field--color/);
  assert.equal(trigger.id, "accent");
  assert.equal(field.getElementsByTagName("label")[0].htmlFor, "accent");
  assert.equal(trigger.getAttribute("data-value"), "#abcdef");
  assert.equal(trigger.getAttribute("aria-describedby"), "accent-description");
  assert.equal(trigger.getAttribute("aria-haspopup"), "dialog");
  assert.equal(field.getElementsByTagName("input").length, 0);
});

test("keyboard edits preview locally; Enter commits once and returns focus to the trigger", () => {
  const { doc, find } = overlayDocument();
  const recorded = [];
  configureColorPickers(doc, { recent: { list: () => [], record: (hex) => recorded.push(hex) } });
  const { control, commits } = picker(doc);
  control.trigger.click();
  const surface = find("ch-color-surface"), area = find("ch-color-area");
  assert.ok(surface);
  assert.equal(surface.getAttribute("role"), "dialog");
  assert.equal(surface.getAttribute("data-open"), "true");
  assert.equal(surface.getAttribute("data-layout"), "popover");
  assert.equal(control.trigger.getAttribute("aria-expanded"), "true");
  assert.equal(doc.activeElement, area);
  area.keydown("ArrowDown", { shiftKey: true });
  area.keydown("ArrowLeft");
  assert.equal(commits.length, 0, "no commit while editing");
  assert.equal(control.trigger.getAttribute("data-value"), "#ff0000");
  assert.notEqual(find("ch-color-hex-input").value, "#FF0000");
  surface.keydown("Enter", { target: area });
  assert.equal(commits.length, 1);
  assert.equal(commits[0], control.value());
  assert.equal(control.trigger.getAttribute("data-value"), commits[0]);
  assert.deepEqual(recorded, commits);
  assert.equal(find("ch-color-surface"), null, "surface removed");
  assert.equal(control.trigger.getAttribute("aria-expanded"), "false");
  assert.equal(doc.activeElement, control.trigger);
});

test("Escape discards the session; closing without changes never commits", () => {
  const { doc, find } = overlayDocument();
  const { control, commits } = picker(doc);
  control.trigger.click();
  find("ch-color-hue").keydown("ArrowRight", { shiftKey: true });
  find("ch-color-surface").keydown("Escape");
  assert.deepEqual(commits, []);
  assert.equal(control.trigger.getAttribute("data-value"), "#ff0000");
  assert.equal(find("ch-color-trigger__hex")?.textContent ?? control.trigger.children[1].textContent, "#FF0000");
  control.trigger.click();
  find("ch-color-close").click();
  assert.deepEqual(commits, [], "unchanged color is not a commit");
});

test("pointer drag on the area maps position to saturation/brightness; backdrop click commits", () => {
  const { doc, find } = overlayDocument();
  const { control, commits } = picker(doc);
  control.trigger.click();
  const area = find("ch-color-area");
  area.emit("pointerdown", { button: 0, pointerId: 1, clientX: 10 + 200, clientY: 40 });
  area.emit("pointermove", { pointerId: 1, clientX: 10 + 100, clientY: 40 + 50 });
  area.emit("pointerup", { pointerId: 1 });
  assert.equal(find("ch-color-hex-input").value, "#804040", "hue 0, s=.5, v=.5");
  assert.equal(commits.length, 0);
  find("ch-color-backdrop").emit("mousedown");
  assert.deepEqual(commits, ["#804040"]);
});

test("invalid hex stays visible for correction and does not close the picker", () => {
  const { doc, find } = overlayDocument();
  const { control, commits } = picker(doc);
  control.trigger.click();
  const input = find("ch-color-hex-input");
  input.value = "#12"; input.emit("input");
  assert.equal(input.getAttribute("aria-invalid"), "true");
  input.keydown("Enter");
  assert.ok(find("ch-color-surface"), "still open");
  input.value = "336699"; input.emit("input");
  assert.equal(input.getAttribute("aria-invalid"), "false");
  input.keydown("Enter");
  assert.deepEqual(commits, ["#336699"]);
});

test("a shell rerender closes the picker and confirms the choice after the current task", async () => {
  const { doc, find } = overlayDocument();
  const { control, commits } = picker(doc);
  control.trigger.click();
  find("ch-color-hex-input").value = "#00ff00"; find("ch-color-hex-input").emit("input");
  closeOpenColorPicker(doc, true);
  assert.equal(find("ch-color-surface"), null);
  assert.deepEqual(commits, [], "deferred, never inside the rerender");
  await Promise.resolve();
  assert.deepEqual(commits, ["#00ff00"]);
});

test("only one picker is open per document, and disabled triggers never open", () => {
  const { doc, find } = overlayDocument();
  const first = picker(doc), second = picker(doc, { id: "neon-glow", value: "#0000ff" });
  first.control.trigger.click();
  second.control.trigger.click();
  assert.equal(first.control.isOpen, false);
  assert.equal(second.control.isOpen, true);
  second.control.close(false);
  const disabled = picker(doc, { id: "locked", disabled: true, disabledReason: "Selecione uma camada de texto" });
  assert.equal(disabled.control.trigger.disabled, true);
  assert.equal(disabled.control.trigger.title, "Selecione uma camada de texto");
  disabled.control.trigger.click();
  assert.equal(disabled.control.isOpen, false);
  assert.equal(find("ch-color-surface"), null);
});

test("the host dialog result is committed; a cancelled dialog keeps the picker open", async () => {
  const { doc, find } = overlayDocument();
  const answers = [null, "#123abc"];
  configureColorPickers(doc, { native: { label: "Seletor do After Effects", pick: async () => answers.shift() } });
  const { control, commits } = picker(doc);
  control.trigger.click();
  const native = find("ch-color-native");
  assert.equal(native.textContent, "Seletor do After Effects");
  native.click();
  assert.equal(native.disabled, true, "busy while the modal dialog is open");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(control.isOpen, true);
  assert.equal(native.disabled, false);
  native.click();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(commits, ["#123abc"]);
  assert.equal(control.isOpen, false);
});

test("recent colors render as chips that preview without committing", () => {
  const { doc, find } = overlayDocument();
  configureColorPickers(doc, { recent: { list: () => ["#112233", "not-a-color", "#445566"], record() {} } });
  const { control, commits } = picker(doc);
  control.trigger.click();
  const recent = find("ch-color-recent");
  assert.equal(recent.getAttribute("role"), "group");
  assert.equal(recent.children.length, 2, "invalid entries are ignored");
  recent.children[1].click();
  assert.equal(find("ch-color-hex-input").value, "#445566");
  assert.deepEqual(commits, []);
  control.update("#abcdef");
  control.close(true);
  assert.deepEqual(commits, ["#445566"]);
});

test('native failures preserve the draft and surface an actionable error', async () => {
  const { doc, find } = overlayDocument();
  configureColorPickers(doc, { native: { pick() { throw new Error('Native dialog failed'); } } });
  const { control, commits } = picker(doc);
  control.open();
  find('ch-color-hex-input').value = '#336699'; find('ch-color-hex-input').emit('input');
  find('ch-color-native').click();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(control.isOpen, true);
  assert.equal(find('ch-color-native-error').textContent, 'Native dialog failed');
  assert.equal(find('ch-color-native-error').hidden, false);
  assert.equal(find('ch-color-hex-input').value, '#336699');
  assert.deepEqual(commits, []);
  control.close(true); assert.deepEqual(commits, ['#336699']);
});

test('a native answer belongs to its original session, never a reopened picker', async () => {
  const { doc, find } = overlayDocument();
  let resolve;
  configureColorPickers(doc, { native: { pick: () => new Promise(done => { resolve = done; }) } });
  const { control, commits } = picker(doc);
  control.open(); find('ch-color-native').click(); await Promise.resolve();
  control.close(false); control.open(); resolve('#123abc');
  await new Promise(done => setImmediate(done));
  assert.equal(control.isOpen, true); assert.equal(find('ch-color-hex-input').value, '#FF0000');
  assert.deepEqual(commits, []); control.dispose(); assert.equal(control.isOpen, false);
});

test('disposed and detached controls cannot reopen or commit a retained callback', async () => {
  const { doc, find } = overlayDocument(), transitions = [];
  const { control, commits } = picker(doc, { onOpenChange: open => transitions.push(open) });
  control.open(); find('ch-color-hex-input').value = '#123abc'; find('ch-color-hex-input').emit('input');
  control.close(true, true); control.dispose(); await Promise.resolve();
  control.open(); assert.equal(control.isOpen, false); assert.deepEqual(commits, []);
  assert.deepEqual(transitions, [true, false]);
  const other = picker(doc); other.control.trigger.isConnected = false;
  other.control.open(); assert.equal(other.control.isOpen, false);
});
