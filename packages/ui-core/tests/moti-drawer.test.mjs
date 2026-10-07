import test from "node:test";
import assert from "node:assert/strict";

import { createDrawer } from "../dist/components.js";
import { mountDrawerView, validateDrawerOptions } from "../dist/elements/drawer-view.js";
import { registerMotiDrawer } from "../dist/elements/moti-drawer.js";
import { createFakeDocument } from "./fake-dom.mjs";

function createScheduler() {
  const pending = new Map();
  let next = 1;
  return {
    api: {
      setTimeout(callback) { const id = next++; pending.set(id, callback); return id; },
      clearTimeout(id) { pending.delete(id); }
    },
    get size() { return pending.size; },
    runAll() { for (const callback of [...pending.values()]) callback(); pending.clear(); }
  };
}

function createNativeDocument() {
  const doc = createFakeDocument();
  const createElement = doc.createElement.bind(doc);
  const definitions = new Map();
  class HTMLElement {
    constructor() {
      const node = createElement("moti-drawer");
      Object.setPrototypeOf(node, new.target.prototype);
      node.connected = false;
      Object.defineProperty(node, "isConnected", { get() { return this.connected; } });
      const originalAppend = node.appendChild;
      node.appendChild = function (child) {
        if (child.parentNode) child.parentNode.removeChild(child);
        return originalAppend.call(this, child);
      };
      const originalSet = node.setAttribute;
      node.setAttribute = function (name, value) {
        const oldValue = this.getAttribute(name);
        originalSet.call(this, name, value);
        if (this.constructor.observedAttributes?.includes(name) && oldValue !== value) {
          this.attributeChangedCallback(name, oldValue, value);
        }
      };
      const originalRemove = node.removeAttribute;
      node.removeAttribute = function (name) {
        const oldValue = this.getAttribute(name);
        originalRemove.call(this, name);
        if (this.constructor.observedAttributes?.includes(name) && oldValue !== undefined) {
          this.attributeChangedCallback(name, oldValue, null);
        }
      };
      return node;
    }
    get firstElementChild() { return this.children[0] ?? null; }
  }
  doc.defaultView = {
    HTMLElement,
    customElements: {
      define(name, constructor) { definitions.set(name, constructor); },
      get(name) { return definitions.get(name); }
    }
  };
  doc.createElement = (tag) => {
    const Constructor = definitions.get(tag);
    return Constructor ? new Constructor() : createElement(tag);
  };
  return doc;
}

function connected(element) {
  element.connected = true;
  element.connectedCallback();
}

function disconnected(element) {
  element.connected = false;
  element.disconnectedCallback();
}

test("gaveta aplica a classe visual e rejeita opções inválidas antes de mutar o DOM", () => {
  const doc = createFakeDocument();
  const root = doc.createElement("div");
  root.className = "custom";
  const content = doc.createElement("div");
  const invalid = { id: "drawer", label: "Inspector", content, overlay: true, state: "loading" };
  assert.throws(() => validateDrawerOptions(invalid), /stateLabel/);
  assert.throws(() => mountDrawerView(doc, root, invalid), /stateLabel/);
  assert.equal(root.className, "custom");
  assert.equal(root.children.length, 0);
  assert.equal(content.parentNode, null);

  const drawer = mountDrawerView(doc, root, { id: "drawer", label: "Inspector", content, overlay: true });
  assert.equal(drawer.element.className, "custom ch-drawer");
  assert.equal(drawer.backdrop.className, "ch-drawer-backdrop");
  assert.equal(drawer.element.getAttribute("aria-modal"), "true");
});

test("foco ignora controles ocultos, open repetido preserva origem e Escape fechado não intercepta", () => {
  const doc = createFakeDocument();
  const firstOrigin = doc.createElement("button");
  const secondOrigin = doc.createElement("button");
  const content = doc.createElement("div");
  const hidden = doc.createElement("button");
  hidden.hidden = true;
  const tabbable = doc.createElement("span");
  tabbable.setAttribute("tabindex", "0");
  const last = doc.createElement("input");
  content.appendChild(hidden);
  content.appendChild(tabbable);
  content.appendChild(last);
  const drawer = createDrawer(doc, { id: "focus", label: "Inspector", content, overlay: true });

  firstOrigin.focus();
  drawer.open(firstOrigin);
  assert.equal(doc.activeElement, tabbable);
  drawer.open(secondOrigin);
  last.focus();
  drawer.element.keydown("Tab");
  assert.equal(doc.activeElement, tabbable);
  drawer.close();
  assert.equal(doc.activeElement, firstOrigin);
  assert.equal(drawer.element.keydown("Escape").defaultPrevented, false);
});

test("reabrir durante onClose não devolve o foco à origem antiga", () => {
  const doc = createFakeDocument();
  const scheduler = createScheduler();
  const origin = doc.createElement("button");
  const newOrigin = doc.createElement("button");
  const content = doc.createElement("div");
  const inside = doc.createElement("button");
  content.appendChild(inside);
  let drawer;
  drawer = createDrawer(doc, {
    id: "reentrant", label: "Inspector", content, overlay: true,
    scheduler: scheduler.api,
    onClose() { drawer.open(newOrigin); }
  });

  origin.focus();
  drawer.open(origin);
  drawer.close("programmatic");
  assert.equal(drawer.isOpen, true);
  assert.equal(doc.activeElement, inside);
  assert.equal(scheduler.size, 0);
  drawer.finishClose();
  assert.equal(drawer.element.hidden, false);
});

test("registro usa o realm do documento, conserva fallback em colisão e não cria backdrop indefinido", () => {
  const first = createNativeDocument();
  const second = createNativeDocument();
  const FirstConstructor = registerMotiDrawer(first);
  const SecondConstructor = registerMotiDrawer(second);
  assert.equal(registerMotiDrawer(first), FirstConstructor);
  assert.notEqual(FirstConstructor, SecondConstructor);

  const bare = new FirstConstructor();
  assert.throws(() => bare.backdrop, /configured/);
  assert.equal(bare.isOpen, false);
  assert.equal(bare.children.length, 0, "o construtor não altera a árvore DOM");

  const collision = createNativeDocument();
  collision.defaultView.customElements.define("moti-drawer", class ForeignDrawer {});
  assert.equal(registerMotiDrawer(collision), undefined);
  const fallback = createDrawer(collision, {
    id: "collision", label: "Inspector", content: collision.createElement("div"), overlay: false
  });
  assert.equal(fallback.element.tagName, "div");
  assert.equal(fallback.element.className, "ch-drawer");
});

test("elemento nativo fecha timer e backdrop na desconexão, reabre quando reconectado", () => {
  const doc = createNativeDocument();
  const scheduler = createScheduler();
  const origin = doc.createElement("button");
  const drawer = createDrawer(doc, {
    id: "native", label: "Inspector", content: doc.createElement("div"), overlay: true,
    scheduler: scheduler.api
  });
  assert.equal(drawer.element.tagName, "moti-drawer");
  assert.equal(drawer.element.className, "ch-drawer");
  connected(drawer.element);

  origin.focus();
  drawer.open(origin);
  drawer.close();
  assert.equal(scheduler.size, 1);
  disconnected(drawer.element);
  assert.equal(scheduler.size, 0);
  assert.equal(drawer.element.hidden, true);
  assert.equal(drawer.backdrop.hidden, true);
  drawer.open(origin);
  assert.equal(drawer.isOpen, false, "referência destacada não reabre backdrop órfão");
  connected(drawer.element);
  drawer.open(origin);
  assert.equal(drawer.isOpen, true);
  disconnected(drawer.element);
  assert.equal(drawer.isOpen, false);
  assert.equal(drawer.backdrop.getAttribute("data-open"), "false");
  assert.equal(doc.activeElement, origin);
});

test("atributos inválidos fecham a gaveta e recuperação conserva o conteúdo", () => {
  const doc = createNativeDocument();
  const origin = doc.createElement("button");
  const content = doc.createElement("div");
  const inside = doc.createElement("button");
  content.appendChild(inside);
  const drawer = createDrawer(doc, { id: "attributes", label: "Inspector", content, overlay: true });
  connected(drawer.element);
  origin.focus();
  drawer.open(origin);

  drawer.element.setAttribute("state", "loading");
  assert.equal(drawer.isOpen, false);
  assert.equal(drawer.element.hidden, true);
  assert.equal(drawer.element.getAttribute("data-invalid"), "true");
  drawer.open(origin);
  assert.equal(drawer.isOpen, false);

  drawer.element.setAttribute("state-label", "Carregando");
  assert.equal(drawer.element.getAttribute("data-invalid"), undefined);
  drawer.open(origin);
  assert.equal(drawer.isOpen, true);
  assert.equal(content.parentNode, drawer.element);

  drawer.element.overlay = false;
  assert.equal(drawer.backdrop.hidden, true);
  assert.equal(drawer.element.getAttribute("aria-modal"), "false");
  drawer.backdrop.click();
  assert.equal(drawer.isOpen, true);
  drawer.element.overlay = true;
  assert.equal(drawer.backdrop.hidden, false);
  assert.throws(() => drawer.setState("unsupported"), /stateLabel/);
  assert.equal(drawer.element.getAttribute("state"), "loading");
});

test("marcação declarativa exige nome acessível e aceita estado completo", () => {
  const doc = createNativeDocument();
  const Constructor = registerMotiDrawer(doc);
  const root = new Constructor();
  const content = doc.createElement("div");
  root.appendChild(content);
  connected(root);
  assert.equal(root.getAttribute("data-invalid"), "true");
  assert.equal(root.hidden, true);
  root.setAttribute("state", "success");
  root.setAttribute("state-label", "Pronto");
  root.setAttribute("aria-label", "Inspector");
  assert.equal(root.getAttribute("data-invalid"), undefined);
  assert.equal(root.getAttribute("data-state"), "success");
  assert.equal(root.getAttribute("role"), "dialog");
  root.open();
  assert.equal(root.isOpen, true);
  assert.equal(content.parentNode, root);
});
