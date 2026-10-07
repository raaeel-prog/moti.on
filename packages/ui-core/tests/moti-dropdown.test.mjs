import { afterEach } from 'node:test';
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

import { registerMotiDropdown, selectField } from "../dist/index.js";
import {
  closeOpenDropdown, mountDropdownView, validateDropdownOptions
} from "../dist/elements/dropdown-view.js";
import { createFakeDocument } from "./fake-dom.mjs";

function options(overrides = {}) {
  return {
    id: "mode", label: "Modo", value: "one",
    options: [{ value: "one", label: "Um" }, { value: "two", label: "Dois" }],
    onChange() {}, ...overrides
  };
}

function fakeRegistry(doc, { collision = false, rejects = false } = {}) {
  const constructors = new Map();
  let definitions = 0;
  class Element {}
  if (collision) constructors.set("moti-dropdown", class ForeignElement {});
  doc.defaultView = {
    HTMLElement: Element,
    customElements: {
      get: (name) => constructors.get(name),
      define(name, constructor) {
        definitions += 1;
        if (rejects) throw new Error("Registry does not support this element");
        constructors.set(name, constructor);
      }
    }
  };
  return { constructors, get definitions() { return definitions; } };
}

/** Overlay capabilities are opt-in; the shared host fake stays minimal. */
function overlayDocument() {
  const doc = createFakeDocument();
  const create = doc.createElement;
  const listeners = new Map();
  const windowListeners = new Map();
  doc.createElement = (tag) => {
    const node = create(tag);
    node.style = {};
    node.animate = () => {};
    node.getBoundingClientRect = () => ({ left: 20, top: 80, bottom: 108, width: 110 });
    node.contains = (target) => node === target || node.children.some((child) => child.contains(target));
    return node;
  };
  doc.body = doc.createElement("body");
  doc.documentElement.contains = (target) => doc.body.contains(target);
  doc.addEventListener = (name, handler) => {
    const handlers = listeners.get(name) ?? new Set();
    handlers.add(handler);
    listeners.set(name, handlers);
  };
  doc.removeEventListener = (name, handler) => listeners.get(name)?.delete(handler);
  doc.defaultView = {
    innerHeight: 600,
    getComputedStyle: () => ({ transitionDuration: "0s" }),
    addEventListener(name, handler) { windowListeners.set(name, handler); },
    removeEventListener(name) { windowListeners.delete(name); }
  };
  return {
    doc,
    listenerCount: () => [...listeners.values()].reduce((sum, handlers) => sum + handlers.size, 0) + windowListeners.size,
    menu: () => doc.body.children.find((node) => node.className === "ch-select-menu")
  };
}

test("dropdown package imports without browser globals or eager registration", () => {
  const result = spawnSync(process.execPath, ["--input-type=module", "--eval", `
    import assert from "node:assert/strict";
    for (const name of ["HTMLElement", "customElements", "document", "window"]) delete globalThis[name];
    const api = await import(process.argv[1]);
    assert.equal(typeof api.registerMotiDropdown, "function");
    assert.equal(typeof api.selectField, "function");
    for (const name of ["HTMLElement", "customElements", "document", "window"]) assert.equal(globalThis[name], undefined);
  `, new URL("../dist/index.js", import.meta.url).href], { encoding: "utf8" });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

for (const realm of [undefined, null, {}, { customElements: {} }]) {
  test(`dropdown preserves the native field without registration capabilities: ${JSON.stringify(realm)}`, () => {
    const doc = createFakeDocument();
    doc.defaultView = realm;
    assert.equal(registerMotiDropdown(doc), undefined);
    assert.equal(registerMotiDropdown(doc), undefined);
    const field = selectField(doc, options({ description: "Escolha o modo" }));
    const select = field.getElementsByTagName("select")[0];
    assert.equal(field.tagName, "div");
    assert.match(field.className, /ch-field--select/);
    assert.equal(field.getElementsByTagName("label")[0].htmlFor, "mode");
    assert.equal(select.id, "mode");
    assert.equal(select.value, "one");
    assert.equal(select.hidden, false);
    assert.equal(select.getAttribute("aria-describedby"), "mode-description");
    assert.equal(field.getElementsByTagName("button").length, 0);
  });
}

test("dropdown registration is lazy, idempotent and scoped to each document realm", () => {
  const first = createFakeDocument(), second = createFakeDocument();
  const firstRegistry = fakeRegistry(first), secondRegistry = fakeRegistry(second);
  assert.equal(firstRegistry.definitions, 0);
  assert.equal(secondRegistry.definitions, 0);
  const firstType = registerMotiDropdown(first);
  assert.equal(typeof firstType, "function");
  assert.equal(registerMotiDropdown(first), firstType);
  assert.equal(firstRegistry.definitions, 1);
  const secondType = registerMotiDropdown(second);
  assert.equal(typeof secondType, "function");
  assert.notEqual(secondType, firstType);
  assert.equal(secondRegistry.definitions, 1);
  assert.equal(firstRegistry.constructors.get("moti-dropdown"), firstType);
});

test("foreign registrations and rejected definitions keep a usable native select", () => {
  for (const registryOptions of [{ collision: true }, { rejects: true }]) {
    const doc = createFakeDocument();
    const registry = fakeRegistry(doc, registryOptions);
    assert.equal(registerMotiDropdown(doc), undefined);
    const values = [];
    const field = selectField(doc, options({ onChange: (value) => values.push(value) }));
    assert.equal(field.tagName, "div");
    const select = field.getElementsByTagName("select")[0];
    select.value = "two";
    select.emit("change");
    assert.deepEqual(values, ["two"]);
    if (registryOptions.collision) assert.equal(registry.definitions, 0);
  }
});

test("a partial registry that cannot construct its element falls back without losing callbacks", () => {
  const doc = createFakeDocument(), values = [];
  fakeRegistry(doc);
  assert.equal(typeof registerMotiDropdown(doc), "function");
  const field = selectField(doc, options({ onChange: (value) => values.push(value) }));
  assert.equal(field.tagName, "div");
  const select = field.getElementsByTagName("select")[0];
  select.value = "two";
  select.emit("change");
  assert.deepEqual(values, ["two"]);
});

test("invalid dropdown options fail before mutating the supplied root", () => {
  const invalid = [
    { id: "" }, { label: " " }, { value: null }, { options: null },
    { options: [{ value: 1, label: "Um" }] },
    { options: [{ value: "one", label: " " }] },
    { options: [{ value: "one", label: null }] }, { onChange: null }
  ];
  for (const extra of invalid) {
    const doc = createFakeDocument();
    const root = doc.createElement("div");
    root.className = "existing";
    const retained = doc.createElement("span");
    root.appendChild(retained);
    assert.throws(() => validateDropdownOptions(options(extra)));
    assert.throws(() => mountDropdownView(root, options(extra)));
    assert.equal(root.className, "existing");
    assert.deepEqual(root.children, [retained]);
    assert.deepEqual(root.attributes, {});
  }
});

test("empty options, missing current values and placeholder values remain compatible", () => {
  for (const extra of [
    { value: "missing", options: [] },
    { value: "missing" },
    { value: "", options: [{ value: "", label: "Escolha" }] },
    { options: [{ value: "one", label: "Um" }, { value: "one", label: "Outro um" }] }
  ]) {
    assert.doesNotThrow(() => validateDropdownOptions(options(extra)));
    assert.doesNotThrow(() => selectField(createFakeDocument(), options(extra)));
  }
});

test("declared options may be frozen and later caller mutations cannot authorize new values", () => {
  const values = [];
  const frozen = Object.freeze([Object.freeze({ value: "one", label: "Um" })]);
  const frozenField = selectField(createFakeDocument(), Object.freeze(options({ options: frozen })));
  assert.equal(frozenField.getElementsByTagName("select")[0].value, "one");

  const declared = [{ value: "one", label: "Um" }, { value: "two", label: "Dois" }];
  const field = selectField(createFakeDocument(), options({ options: declared, onChange: (value) => values.push(value) }));
  const select = field.getElementsByTagName("select")[0];
  declared[1].value = "changed";
  declared.push({ value: "injected", label: "Injectado" });
  for (const value of ["changed", "injected", "not-declared"]) {
    select.value = value;
    select.emit("change");
  }
  assert.deepEqual(values, []);
  select.value = "two";
  select.emit("change");
  assert.deepEqual(values, ["two"]);
});

test("disabled native fields retain explanatory fallbacks and ignore synthetic changes", () => {
  for (const extra of [
    {}, { description: "Escolha o modo" },
    { description: "Escolha o modo", disabledReason: "Aguarde a operação" }
  ]) {
    const values = [];
    const field = selectField(createFakeDocument(), options({ ...extra, disabled: true, onChange: (value) => values.push(value) }));
    const select = field.getElementsByTagName("select")[0];
    assert.equal(select.disabled, true);
    assert.equal(select.title, extra.disabledReason ?? extra.description ?? "Modo");
    select.value = "two";
    select.emit("change");
    assert.deepEqual(values, []);
  }
});

test("closing a dropdown releases portal listeners and leaves its configuration reusable", () => {
  const fixture = overlayDocument(), values = [];
  const root = fixture.doc.createElement("div");
  const view = mountDropdownView(root, options({ onChange: (value) => values.push(value) }));
  fixture.doc.body.appendChild(root);
  const trigger = root.getElementsByTagName("button")[0];
  trigger.click();
  const previous = fixture.menu().children[1];
  assert.ok(fixture.listenerCount() > 0);
  view.close();
  assert.equal(fixture.menu(), undefined);
  assert.equal(fixture.listenerCount(), 0);
  previous.click();
  assert.deepEqual(values, []);
  trigger.click();
  fixture.menu().children[1].click();
  assert.deepEqual(values, ["two"]);
  assert.equal(fixture.doc.activeElement, trigger);
  previous.click();
  assert.deepEqual(values, ["two"]);
  view.close();
});

test("one menu per document closes stale choices without affecting another document", () => {
  const first = overlayDocument(), other = overlayDocument(), values = [];
  const a = selectField(first.doc, options({ id: "a", onChange: (value) => values.push(value) }));
  const b = selectField(first.doc, options({ id: "b" }));
  const c = selectField(other.doc, options({ id: "c" }));
  first.doc.body.appendChild(a);
  first.doc.body.appendChild(b);
  other.doc.body.appendChild(c);
  a.getElementsByTagName("button")[0].click();
  const stale = first.menu().children[1];
  c.getElementsByTagName("button")[0].click();
  b.getElementsByTagName("button")[0].click();
  assert.equal(first.menu().id, "b-menu");
  assert.equal(other.menu().id, "c-menu");
  stale.click();
  assert.deepEqual(values, []);
  closeOpenDropdown(first.doc);
  assert.equal(first.menu(), undefined);
  assert.equal(first.listenerCount(), 0);
  assert.equal(other.menu().id, "c-menu");
  closeOpenDropdown(other.doc);
  assert.equal(other.listenerCount(), 0);
});

test("overlay keyboard preserves focus identity, selection and escape cleanup", () => {
  const fixture = overlayDocument(), values = [];
  const field = selectField(fixture.doc, options({ onChange: (value) => values.push(value) }));
  fixture.doc.body.appendChild(field);
  const trigger = field.getElementsByTagName("button")[0];
  assert.equal(trigger.id, "mode-trigger");
  assert.equal(trigger.getAttribute("data-focus-key"), "mode");
  assert.equal(field.getElementsByTagName("label")[0].htmlFor, trigger.id);
  trigger.keydown("ArrowDown");
  const choices = fixture.menu().children;
  assert.equal(fixture.doc.activeElement, choices[0]);
  choices[0].keydown("End");
  assert.equal(fixture.doc.activeElement, choices[1]);
  choices[1].keydown("Home");
  assert.equal(fixture.doc.activeElement, choices[0]);
  choices[0].keydown("ArrowDown");
  choices[1].click();
  assert.equal(trigger.getAttribute("aria-label"), "Modo: Dois");
  assert.deepEqual(values, ["two"]);
  assert.equal(fixture.doc.activeElement, trigger);
  trigger.keydown("ArrowUp");
  fixture.menu().children[1].keydown("Escape");
  assert.equal(fixture.menu(), undefined);
  assert.equal(fixture.listenerCount(), 0);
  assert.equal(fixture.doc.activeElement, trigger);
});

afterEach(() => {
  for (const name of ["HTMLElement", "customElements", "document", "window"]) delete globalThis[name];
});
