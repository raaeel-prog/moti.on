import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

import { createPopover } from "../dist/components.js";
import { registerMotiPopover } from "../dist/elements/moti-popover.js";
import { mountPopoverView, validatePopoverOptions } from "../dist/elements/popover-view.js";
import { createFakeDocument } from "./fake-dom.mjs";

function scheduler() {
  const callbacks = new Map();
  let next = 1;
  return {
    api: {
      setTimeout(callback) { const handle = next++; callbacks.set(handle, callback); return handle; },
      clearTimeout(handle) { callbacks.delete(handle); }
    },
    get size() { return callbacks.size; },
    run() {
      for (const callback of callbacks.values()) callback();
      callbacks.clear();
    }
  };
}

function options(doc, extra = {}) {
  return { id: "preview", label: "Prévia", content: doc.createElement("div"), ...extra };
}

function nativeRealm(doc, collision = false) {
  const create = doc.createElement.bind(doc);
  const definitions = new Map();
  class Element {
    constructor() {
      Object.assign(this, create("div"));
      this.tagName = "moti-popover";
      this.isConnected = false;
      const set = this.setAttribute;
      const remove = this.removeAttribute;
      this.setAttribute = (name, value) => {
        const old = this.getAttribute(name);
        set.call(this, name, String(value));
        if (this.constructor.observedAttributes?.includes(name)) this.attributeChangedCallback(name, old, String(value));
      };
      this.removeAttribute = (name) => {
        const old = this.getAttribute(name);
        remove.call(this, name);
        if (this.constructor.observedAttributes?.includes(name) && old !== undefined) {
          this.attributeChangedCallback(name, old, null);
        }
      };
    }
    get firstElementChild() { return this.children[0] ?? null; }
    hasAttribute(name) { return this.getAttribute(name) !== undefined; }
  }
  if (collision) definitions.set("moti-popover", class Foreign {});
  doc.defaultView = {
    HTMLElement: Element,
    customElements: {
      get(name) { return definitions.get(name); },
      define(name, type) { definitions.set(name, type); }
    }
  };
  doc.createElement = (tag) => {
    const type = definitions.get(tag);
    return type && tag === "moti-popover" ? new type() : create(tag);
  };
  return { definitions };
}

test("popover imports without browser globals or eager registration", () => {
  const entry = new URL("../dist/elements/moti-popover.js", import.meta.url).href;
  const result = spawnSync(process.execPath, ["--input-type=module", "--eval", `
    import assert from "node:assert/strict";
    for (const name of ["HTMLElement", "customElements", "document", "window"]) delete globalThis[name];
    const module = await import(process.argv[1]);
    assert.equal(typeof module.registerMotiPopover, "function");
    for (const name of ["HTMLElement", "customElements", "document", "window"]) assert.equal(globalThis[name], undefined);
  `, entry], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("popover validates the full contract before changing its root", () => {
  const doc = createFakeDocument();
  const root = doc.createElement("div");
  root.className = "existing";
  const retained = doc.createElement("span");
  root.appendChild(retained);
  const foreign = createFakeDocument().createElement("div");
  const cases = [
    { id: "" }, { label: " " }, { content: null },
    { initialFocus: doc.createElement("button") },
    { state: "loading" }, { state: "wrong" },
    { onClose: true }, { scheduler: { setTimeout() {} } },
    { content: foreign }
  ];
  for (const invalid of cases) {
    const input = options(doc, invalid);
    if (invalid.content !== foreign) assert.throws(() => validatePopoverOptions(input));
    assert.throws(() => mountPopoverView(doc, root, input));
    assert.equal(root.className, "existing");
    assert.equal(root.id, "");
    assert.deepEqual(root.children, [retained]);
    assert.deepEqual(root.attributes, {});
  }
});

test("popover preserves focus, ignores Escape while closed and cancels obsolete timers", () => {
  const doc = createFakeDocument();
  const clock = scheduler();
  const first = doc.createElement("button");
  const second = doc.createElement("button");
  const content = doc.createElement("div");
  const initial = doc.createElement("button");
  content.appendChild(initial);
  const reasons = [];
  const view = mountPopoverView(doc, doc.createElement("div"), options(doc, {
    content, initialFocus: initial, scheduler: clock.api, onClose: reason => reasons.push(reason)
  }));
  assert.match(view.element.className, /ch-popover/);
  assert.equal(view.element.keydown("Escape").defaultPrevented, false);
  first.focus();
  view.open(first);
  assert.equal(doc.activeElement, initial);
  view.open(second);
  view.close();
  assert.equal(doc.activeElement, first, "repeated open keeps the original focus target");
  assert.deepEqual(reasons, ["programmatic"]);
  assert.equal(clock.size, 1);
  view.open(second);
  assert.equal(clock.size, 0);
  clock.run();
  assert.equal(view.element.hidden, false);
  view.element.keydown("Escape");
  assert.equal(doc.activeElement, second);
  assert.deepEqual(reasons, ["programmatic", "escape"]);
  view.disconnect();
  assert.equal(clock.size, 0);
  assert.equal(view.element.hidden, true);
  assert.equal(view.element.getAttribute("data-open"), "false");
  view.open(first);
  assert.equal(view.isOpen, true);
});

test("closing restores focus even if the consumer callback throws", () => {
  const doc = createFakeDocument();
  const origin = doc.createElement("button");
  const clock = scheduler();
  const view = createPopover(doc, options(doc, {
    scheduler: clock.api,
    onClose() { throw new Error("consumer failed"); }
  }));
  origin.focus();
  view.open(origin);
  assert.throws(() => view.close(), /consumer failed/);
  assert.equal(view.isOpen, false);
  assert.equal(doc.activeElement, origin);
  assert.equal(clock.size, 1);
  view.disconnect();
  assert.equal(clock.size, 0);
});

test("registration belongs to each realm and collisions keep a plain DOM fallback", () => {
  const first = createFakeDocument();
  const second = createFakeDocument();
  nativeRealm(first);
  nativeRealm(second);
  const firstType = registerMotiPopover(first);
  const secondType = registerMotiPopover(second);
  assert.equal(registerMotiPopover(first), firstType);
  assert.notEqual(firstType, secondType);
  const element = createPopover(first, options(first));
  assert.ok(element.element instanceof firstType);
  const colliding = createFakeDocument();
  nativeRealm(colliding, true);
  assert.equal(registerMotiPopover(colliding), undefined);
  assert.equal(createPopover(colliding, options(colliding)).element.tagName, "div");
});

test("native element closes on disconnect and declarative invalid state recovers", () => {
  const doc = createFakeDocument();
  nativeRealm(doc);
  const Type = registerMotiPopover(doc);
  const clock = scheduler();
  const origin = doc.createElement("button");
  const custom = doc.createElement("moti-popover");
  assert.ok(custom instanceof Type);
  assert.deepEqual(custom.children, [], "constructor remains empty");
  custom.configure(options(doc, { scheduler: clock.api }));
  origin.focus();
  custom.open(origin);
  custom.disconnectedCallback();
  assert.equal(custom.isOpen, false);
  assert.equal(custom.hidden, true);
  assert.equal(doc.activeElement, origin);
  assert.equal(clock.size, 0);
  custom.connectedCallback();
  custom.open(origin);
  custom.close();
  assert.equal(clock.size, 1);
  custom.disconnectedCallback();
  assert.equal(clock.size, 0);

  const declared = doc.createElement("moti-popover");
  declared.id = "declared";
  declared.setAttribute("aria-label", "Prévia declarativa");
  declared.setAttribute("state", "loading");
  declared.appendChild(doc.createElement("div"));
  declared.isConnected = true;
  declared.connectedCallback();
  assert.equal(declared.getAttribute("data-invalid"), "true");
  assert.equal(declared.hidden, true);
  declared.setAttribute("state-label", "Carregando");
  assert.equal(declared.getAttribute("data-invalid"), undefined);
  declared.open(origin);
  assert.equal(declared.isOpen, true);
  declared.setAttribute("state", "invalid");
  assert.equal(declared.isOpen, false);
  assert.equal(declared.hidden, true);
  declared.setState("default");
  declared.open(origin);
  assert.equal(declared.isOpen, true);
});
