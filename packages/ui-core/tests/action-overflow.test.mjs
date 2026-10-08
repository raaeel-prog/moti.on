import test from "node:test";
import assert from "node:assert/strict";

import { attachActionOverflow } from "../dist/action-overflow.js";
import { createActionButton } from "../dist/components.js";
import { createFakeDocument } from "./fake-dom.mjs";

/** Measurable bar: each visible inline action costs a fixed width. */
function measuredBar(doc, width) {
  const bar = doc.createElement("div");
  bar.className = "ch-panel-action-bar";
  Object.defineProperty(bar, "clientWidth", { get: () => width });
  Object.defineProperty(bar, "scrollWidth", {
    get: () => bar.children.filter(node => node.getAttribute("data-overflow") !== "true" && node.hidden !== true)
      .reduce((sum, node) => sum + (node.className === "ch-action-more" ? 28 : 90) + 8, -8)
  });
  return bar;
}

function overlayFake(doc) {
  const create = doc.createElement;
  doc.createElement = (tag) => {
    const node = create(tag);
    node.style = {};
    node.getBoundingClientRect = () => ({ left: 200, top: 680, bottom: 708, width: 28 });
    node.contains = (target) => node === target || node.children.some(child => child.contains(target));
    node.getElementsByClassName = (name) => node.getElementsByTagName("span").filter(span => span.className === name);
    return node;
  };
  doc.body = doc.createElement("body");
  doc.addEventListener = () => {}; doc.removeEventListener = () => {};
  doc.defaultView = { innerHeight: 720, addEventListener() {}, removeEventListener() {} };
  return doc;
}

function fill(doc, bar, pressed) {
  const add = (id, label, variant) => {
    const control = createActionButton(doc, { id, label, variant, onPress: () => pressed.push(id) });
    if (variant === "primary") control.element.className += " ch-panel-action-bar__primary";
    bar.appendChild(control.element);
    return control;
  };
  return {
    apply: add("apply", "Aplicar", "primary"),
    read: add("read", "Ler controles da seleção"),
    reset: add("reset", "Redefinir", "tertiary")
  };
}

test("without layout measurement every action stays inline and the bar keeps wrapping", () => {
  const doc = createFakeDocument();
  const bar = doc.createElement("div");
  const pressed = [];
  fill(doc, bar, pressed);
  const overflow = attachActionOverflow(doc, bar, { label: "Mais ações" });
  assert.equal(overflow.button.hidden, true);
  assert.equal(bar.children.filter(node => node.getAttribute("data-overflow") === "true").length, 0);
  assert.equal(bar.getAttribute("data-overflow-managed"), "true");
});

test("wide bars show every action; narrow bars move secondary actions from the end into the menu", () => {
  const doc = createFakeDocument();
  const pressed = [];
  const wide = measuredBar(doc, 400);
  fill(doc, wide, pressed);
  attachActionOverflow(doc, wide, { label: "Mais ações" });
  assert.equal(wide.children.filter(node => node.getAttribute("data-overflow") === "true").length, 0);

  const narrow = measuredBar(doc, 230);
  const controls = fill(doc, narrow, pressed);
  const overflow = attachActionOverflow(doc, narrow, { label: "Mais ações" });
  assert.equal(controls.apply.element.getAttribute("data-overflow"), undefined, "primary never moves");
  assert.equal(controls.reset.element.getAttribute("data-overflow"), "true");
  assert.equal(controls.read.element.getAttribute("data-overflow"), undefined);
  assert.equal(overflow.button.hidden, false);
  assert.equal(overflow.button.getAttribute("aria-label"), "Mais ações");
  assert.equal(narrow.getAttribute("data-overflowing"), "true");
});

test("menu items run the original action, mirror disabled reasons and restore focus", () => {
  const doc = overlayFake(createFakeDocument());
  const pressed = [];
  const bar = measuredBar(doc, 140);
  const controls = fill(doc, bar, pressed);
  controls.read.setDisabled(true, "Selecione uma camada de texto");
  const overflow = attachActionOverflow(doc, bar, { label: "Mais ações" });
  assert.equal(controls.read.element.getAttribute("data-overflow"), "true");
  assert.equal(controls.reset.element.getAttribute("data-overflow"), "true");
  overflow.button.click();
  const menu = doc.body.children.find(node => node.className === "ch-action-menu");
  assert.ok(menu);
  assert.equal(menu.getAttribute("role"), "menu");
  assert.equal(overflow.button.getAttribute("aria-expanded"), "true");
  const [read, reset] = menu.children;
  assert.equal(read.textContent, "Ler controles da seleção");
  assert.equal(read.getAttribute("aria-disabled"), "true");
  read.click();
  assert.deepEqual(pressed, [], "disabled action does not run");
  reset.click();
  assert.deepEqual(pressed, ["reset"]);
  assert.equal(doc.body.children.includes(menu), false, "menu closed");
  assert.equal(doc.activeElement, overflow.button);
  overflow.button.click();
  const again = doc.body.children.find(node => node.className === "ch-action-menu");
  again.children[1].keydown("Escape");
  assert.equal(doc.body.children.includes(again), false);
  overflow.dispose();
});
