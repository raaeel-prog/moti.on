import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

import { createSliderField, registerMotiSlider } from "../dist/index.js";
import { mountSliderView, validateSliderOptions } from "../dist/elements/slider-view.js";
import { createFakeDocument } from "./fake-dom.mjs";

function options(overrides = {}) {
  return {
    id: "amplitude", label: "Amplitude", numberLabel: "Amplitude numerica",
    description: "Faixa recomendada", value: 2, defaultValue: 1,
    min: 0, max: 10, step: 0.5, unit: "px",
    onInput() {}, onCommit() {}, ...overrides
  };
}

function fakeCustomElements(doc, { collision = false, rejects = false } = {}) {
  const create = doc.createElement;
  const constructors = new Map();
  let definitions = 0;
  if (collision) constructors.set("moti-slider", class ForeignSlider {});

  class FakeHTMLElement {
    constructor() {
      // The real HTMLElement constructor does not assign properties through
      // custom-element accessors before the element has initialized itself.
      const node = create("moti-slider");
      for (const [key, value] of Object.entries(node)) {
        if (!["value", "disabled", "min", "max", "step"].includes(key)) this[key] = value;
      }
      const set = this.setAttribute;
      const remove = this.removeAttribute;
      this.setAttribute = (name, value) => {
        const old = this.getAttribute(name);
        set.call(this, name, String(value));
        if (this.constructor.observedAttributes?.includes(name) && old !== String(value)) {
          this.attributeChangedCallback(name, old ?? null, String(value));
        }
      };
      this.removeAttribute = (name) => {
        const old = this.getAttribute(name);
        remove.call(this, name);
        if (this.constructor.observedAttributes?.includes(name) && old !== undefined) {
          this.attributeChangedCallback(name, old, null);
        }
      };
    }
    hasAttribute(name) { return this.getAttribute(name) !== undefined; }
  }
  doc.defaultView = {
    HTMLElement: FakeHTMLElement,
    Event: class FakeEvent {},
    customElements: {
      get: (name) => constructors.get(name),
      define(name, constructor) {
        definitions += 1;
        if (rejects) throw new Error("Registry unavailable");
        constructors.set(name, constructor);
      }
    }
  };
  doc.createElement = (tag) => tag === "moti-slider" && constructors.has(tag)
    ? new (constructors.get(tag))()
    : create(tag);
  return { constructors, get definitions() { return definitions; } };
}

test("slider module imports without eager browser globals", () => {
  const result = spawnSync(process.execPath, ["--input-type=module", "--eval", `
    import assert from "node:assert/strict";
    for (const name of ["HTMLElement", "customElements", "window", "document"]) delete globalThis[name];
    const api = await import(process.argv[1]);
    assert.equal(typeof api.registerMotiSlider, "function");
    assert.equal(typeof api.createSliderField, "function");
    for (const name of ["HTMLElement", "customElements", "window", "document"]) assert.equal(globalThis[name], undefined);
  `, new URL("../dist/index.js", import.meta.url).href], { encoding: "utf8" });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("slider validates all options before mutating a supplied root", () => {
  const invalid = [
    { label: " " }, { numberLabel: "" }, { min: NaN }, { max: Infinity },
    { max: 0 }, { step: 0 }, { defaultValue: 11 }, { value: -1 },
    { onInput: null }, { onCommit: null }, { state: "loading" },
    { disabled: true }, { formatValue: "not a function" }
  ];
  for (const extra of invalid) {
    const doc = createFakeDocument();
    const root = doc.createElement("div");
    root.className = "existing";
    root.appendChild(doc.createElement("span"));
    assert.throws(() => validateSliderOptions(options(extra)));
    assert.throws(() => mountSliderView(doc, root, options(extra)));
    assert.equal(root.className, "existing");
    assert.equal(root.children.length, 1);
    assert.deepEqual(root.attributes, {});
  }
});

test("slider updates range, unit, description and state as one validated change", () => {
  const doc = createFakeDocument();
  const view = mountSliderView(doc, doc.createElement("div"), options());
  const before = {
    value: view.value,
    max: view.range.max,
    step: view.range.step,
    text: view.range.getAttribute("aria-valuetext"),
    label: view.label.textContent
  };
  for (const invalid of [
    { min: 10, max: 5 }, { step: 0 }, { value: 11 },
    { defaultValue: 11 }, { label: " " },
    { state: "loading", stateLabel: undefined },
    { disabled: true, disabledReason: undefined },
    { formatValue: () => null }
  ]) {
    assert.throws(() => view.update(invalid));
    assert.deepEqual({
      value: view.value, max: view.range.max, step: view.range.step,
      text: view.range.getAttribute("aria-valuetext"), label: view.label.textContent
    }, before);
  }

  view.update({ max: 20, value: 12.7, defaultValue: 3, step: 0.25,
    label: "Intensidade", numberLabel: "Valor numerico", unit: "degrees",
    description: "Nova faixa", state: "warning", stateLabel: "Verifique o resultado" });
  assert.equal(view.value, 12.75);
  assert.equal(view.range.max, "20");
  assert.equal(view.range.step, "0.25");
  assert.equal(view.range.getAttribute("aria-valuetext"), "12.75 degrees");
  assert.equal(view.label.textContent, "Intensidade");
  assert.match(view.range.getAttribute("aria-describedby"), /amplitude-description amplitude-state/);

  view.update({ description: undefined, unit: undefined, state: "default", stateLabel: undefined });
  assert.equal(view.range.getAttribute("aria-valuetext"), "12.75");
  assert.equal(view.range.getAttribute("aria-describedby"), undefined);
  assert.equal(view.element.getElementsByTagName("span").find(node => node.id === "amplitude-description").getAttribute("data-hidden"), "true");
});

test("preview and commit remain distinct and invalid numeric drafts never commit", () => {
  const doc = createFakeDocument();
  const previews = [], commits = [];
  const view = mountSliderView(doc, doc.createElement("div"), options({
    formatValue: value => `${value} pixels`,
    onInput: value => previews.push(value),
    onCommit: value => commits.push(value)
  }));
  view.range.value = "3.5";
  view.range.emit("input");
  assert.deepEqual(previews, [3.5]);
  assert.deepEqual(commits, []);
  assert.equal(view.range.getAttribute("aria-valuetext"), "3.5 pixels");
  view.range.emit("change");
  assert.deepEqual(commits, [3.5]);

  view.numberInput.value = "invalid";
  view.numberInput.emit("input");
  view.numberInput.emit("change");
  assert.equal(view.numberInput.getAttribute("aria-invalid"), "true");
  assert.deepEqual(commits, [3.5]);
  view.numberInput.keydown("Escape");
  assert.equal(view.numberInput.value, "3.5");
  view.numberInput.value = "4.5";
  view.numberInput.emit("input");
  assert.deepEqual(previews, [3.5, 4.5]);
  view.numberInput.keydown("Enter");
  assert.deepEqual(commits, [3.5, 4.5]);
});

test("invalid or detached views reject retained synthetic callbacks until reactivated", () => {
  const previews = [], commits = [];
  const doc = createFakeDocument();
  const view = mountSliderView(doc, doc.createElement("div"), options({
    onInput: value => previews.push(value), onCommit: value => commits.push(value)
  }));
  view.setValid(false);
  view.range.value = "8";
  view.range.emit("input");
  view.range.emit("change");
  view.numberInput.value = "8";
  view.numberInput.emit("input");
  view.numberInput.emit("change");
  view.label.emit("dblclick");
  assert.deepEqual(previews, []);
  assert.deepEqual(commits, []);
  assert.equal(view.value, 2);
  assert.equal(view.range.getAttribute("aria-invalid"), "true");
  view.setValid(true);
  view.range.value = "3";
  view.range.emit("change");
  assert.deepEqual(commits, [3]);
});

test("registration is lazy and scoped to each realm; unsupported registries use the DOM fallback", () => {
  for (const realm of [undefined, null, {}, { customElements: {} }]) {
    const doc = createFakeDocument();
    doc.defaultView = realm;
    assert.equal(registerMotiSlider(doc), undefined);
    const field = createSliderField(doc, options());
    assert.equal(field.element.tagName, "div");
  }
  const a = createFakeDocument(), b = createFakeDocument();
  const aRegistry = fakeCustomElements(a), bRegistry = fakeCustomElements(b);
  const first = registerMotiSlider(a), second = registerMotiSlider(b);
  assert.equal(registerMotiSlider(a), first);
  assert.notEqual(first, second);
  assert.equal(aRegistry.definitions, 1);
  assert.equal(bRegistry.definitions, 1);

  for (const registryOptions of [{ collision: true }, { rejects: true }]) {
    const doc = createFakeDocument();
    fakeCustomElements(doc, registryOptions);
    assert.equal(registerMotiSlider(doc), undefined);
    assert.equal(createSliderField(doc, options()).element.tagName, "div");
  }
});

test("custom slider reflects snapped values, preserves formatting and recovers from malformed attributes", () => {
  const doc = createFakeDocument();
  fakeCustomElements(doc);
  const previews = [], commits = [];
  const controller = createSliderField(doc, options({
    value: 2.2,
    formatValue: value => `${value} pixels`,
    onInput: value => previews.push(value),
    onCommit: value => commits.push(value)
  }));
  const root = controller.element;
  assert.equal(root.tagName, "moti-slider");
  assert.equal(controller.value, 2);
  assert.equal(root.value, 2);
  assert.equal(controller.range.getAttribute("aria-valuetext"), "2 pixels");

  controller.numberInput.value = "4.5";
  controller.numberInput.emit("input");
  assert.deepEqual(previews, [4.5]);
  assert.equal(controller.numberInput.value, "4.5", "preview keeps the numeric draft");
  controller.numberInput.emit("change");
  assert.deepEqual(commits, [4.5]);
  assert.equal(root.value, 4.5);

  root.setAttribute("max", "invalid");
  assert.equal(root.getAttribute("data-invalid"), "true");
  assert.equal(controller.range.getAttribute("aria-disabled"), "true");
  controller.range.value = "8";
  controller.range.emit("input");
  assert.deepEqual(previews, [4.5]);
  assert.equal(controller.value, 4.5);
  root.setAttribute("max", "10");
  assert.equal(root.getAttribute("data-invalid"), undefined);
  controller.setValue(5.2);
  assert.equal(controller.value, 5);
  assert.equal(root.value, 5);
});

test("custom slider rejects retained events after detach and permits them after reconnect", () => {
  const doc = createFakeDocument();
  fakeCustomElements(doc);
  const commits = [];
  const controller = createSliderField(doc, options({ onCommit: value => commits.push(value) }));
  controller.element.connectedCallback();
  controller.element.disconnectedCallback();
  controller.range.value = "7";
  controller.range.emit("change");
  controller.element.setAttribute("label", "Novo rótulo");
  controller.range.value = "8";
  controller.range.emit("change");
  assert.deepEqual(commits, []);
  assert.equal(controller.value, 2);
  controller.element.connectedCallback();
  controller.range.value = "3";
  controller.range.emit("change");
  assert.deepEqual(commits, [3]);
});

test("invalid factory options fail before custom registration or mount", () => {
  const doc = createFakeDocument();
  const registry = fakeCustomElements(doc);
  assert.throws(() => createSliderField(doc, options({ step: -1 })), /greater than zero/);
  assert.equal(registry.definitions, 0);
});
