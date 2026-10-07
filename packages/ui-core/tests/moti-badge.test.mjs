import { afterEach } from 'node:test';
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

import { createBadge } from "../dist/components.js";
import { registerMotiBadge } from "../dist/elements/moti-badge.js";
import { mountBadgeView, validateBadgeOptions } from "../dist/elements/badge-view.js";
import { createFakeDocument } from "./fake-dom.mjs";

function registryDocument({ collision = false, rejects = false } = {}) {
  const doc = createFakeDocument();
  const entries = new Map();
  let definitions = 0;
  if (collision) entries.set("moti-badge", class ForeignBadge {});
  doc.defaultView = {
    HTMLElement: class Element {},
    customElements: {
      get(name) { return entries.get(name); },
      define(name, constructor) {
        definitions++;
        if (rejects) throw new Error("Unsupported definition");
        entries.set(name, constructor);
      }
    }
  };
  return { doc, entries, get definitions() { return definitions; } };
}

test("badge modules import without DOM globals or eager registration", () => {
  const result = spawnSync(process.execPath, ["--input-type=module", "--eval", `
    import assert from "node:assert/strict";
    for (const name of ["HTMLElement", "customElements", "document", "window"]) delete globalThis[name];
    const api = await import(process.argv[1]);
    assert.equal(typeof api.registerMotiBadge, "function");
    for (const name of ["HTMLElement", "customElements", "document", "window"]) assert.equal(globalThis[name], undefined);
  `, new URL("../dist/elements/moti-badge.js", import.meta.url).href], { encoding: "utf8" });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("badge registration is realm-local and repeatable without requiring an Event constructor", () => {
  const first = registryDocument(), second = registryDocument();
  const firstType = registerMotiBadge(first.doc), secondType = registerMotiBadge(second.doc);
  assert.equal(typeof firstType, "function");
  assert.notEqual(firstType, secondType);
  assert.equal(registerMotiBadge(first.doc), firstType);
  assert.equal(first.definitions, 1);
  assert.equal(second.definitions, 1);
  assert.equal(first.entries.get("moti-badge"), firstType);
});

test("missing, foreign, rejected and non-constructing registries keep a usable span badge", () => {
  for (const doc of [createFakeDocument(), registryDocument({ collision: true }).doc,
    registryDocument({ rejects: true }).doc, registryDocument().doc]) {
    const badge = createBadge(doc, { label: "Ajustável", showIcon: false });
    assert.equal(badge.element.tagName, "span");
    assert.equal(badge.element.children.length, 1);
    assert.equal(badge.element.children[0].className, "ch-badge__label");
    badge.setLabel("Editable");
    badge.setTone("success");
    assert.match(badge.element.className, /ch-badge--success/);
    assert.equal(badge.element.children[0].textContent, "Editable");
  }
});

test("badge options validate before touching a supplied root", () => {
  for (const options of [
    { label: "" }, { label: "   " }, { label: "Ready", tone: "other" },
    { label: "Ready", showIcon: "false" }
  ]) {
    const doc = createFakeDocument(), root = doc.createElement("span");
    root.className = "placement";
    const retained = doc.createElement("span");
    root.appendChild(retained);
    assert.throws(() => validateBadgeOptions(options));
    assert.throws(() => mountBadgeView(doc, root, options));
    assert.equal(root.className, "placement");
    assert.deepEqual(root.children, [retained]);
  }
});

test("badge updates preserve the label, icon, external placement classes and static semantics", () => {
  const doc = createFakeDocument(), root = doc.createElement("span");
  root.className = "placement";
  const badge = mountBadgeView(doc, root, { label: "Ready", tone: "success" });
  const [icon, label] = root.children;
  assert.equal(icon.textContent, "✓");
  assert.equal(icon.getAttribute("aria-hidden"), "true");
  assert.equal(root.getAttribute("role"), undefined);
  assert.equal(root.getAttribute("aria-live"), undefined);
  badge.setLabel("Attention");
  badge.setTone("warning");
  assert.equal(root.children[0], icon);
  assert.equal(root.children[1], label);
  assert.equal(icon.textContent, "!");
  assert.equal(label.textContent, "Attention");
  assert.match(root.className, /\bplacement\b/);
  assert.match(root.className, /ch-badge--warning/);
  assert.doesNotMatch(root.className, /ch-badge--success/);
  assert.throws(() => badge.setLabel(" "), /label/);
  assert.throws(() => badge.setTone("other"), /tone/);
  assert.equal(label.textContent, "Attention");
  assert.equal(icon.textContent, "!");
});

test("showIcon toggles retain the same nodes and never duplicate a static indicator", () => {
  const doc = createFakeDocument(), root = doc.createElement("span");
  const badge = mountBadgeView(doc, root, { label: "Editable" });
  const [icon, label] = root.children;
  for (let index = 0; index < 3; index++) {
    badge.update({ label: "Editable", showIcon: false });
    assert.deepEqual(root.children, [label]);
    badge.update({ label: "Editable", showIcon: true });
    assert.deepEqual(root.children, [icon, label]);
  }
  assert.throws(() => badge.update({ label: "Invalid", showIcon: "false" }), /showIcon/);
  assert.equal(label.textContent, "Editable");
  assert.deepEqual(root.children, [icon, label]);
});

afterEach(() => {
  for (const name of ["HTMLElement", "customElements", "document", "window"]) delete globalThis[name];
});
