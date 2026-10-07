import { afterEach } from 'node:test';
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

import {
  COMPONENT_STATES,
  createActionButton,
  registerMotiButton
} from "../dist/index.js";
import { createFakeDocument } from "./fake-dom.mjs";
import { mountActionButton } from "../dist/elements/action-button-view.js";

function customDocument() {
  const doc = createFakeDocument(), create = doc.createElement, constructors = new Map();
  class FakeHTMLElement {
    constructor() {
      const descriptors = Object.getOwnPropertyDescriptors(create("moti-button"));
      // Do not assign through the custom element's reactive accessors.
      for (const name of ["disabled", "click", "focus"]) delete descriptors[name];
      Object.defineProperties(this, descriptors);
      const set = this.setAttribute, remove = this.removeAttribute;
      this.setAttribute = (name, value) => {
        const previous = this.getAttribute(name);
        set.call(this, name, String(value));
        if (this.constructor.observedAttributes?.includes(name) && previous !== String(value)) {
          this.attributeChangedCallback(name, previous ?? null, String(value));
        }
      };
      this.removeAttribute = name => {
        const previous = this.getAttribute(name);
        remove.call(this, name);
        if (this.constructor.observedAttributes?.includes(name) && previous !== undefined) {
          this.attributeChangedCallback(name, previous, null);
        }
      };
    }
    hasAttribute(name) { return this.getAttribute(name) !== undefined; }
  }
  doc.defaultView = {
    HTMLElement: FakeHTMLElement,
    Event: class FakeEvent {},
    customElements: { get: name => constructors.get(name), define: (name, type) => constructors.set(name, type) }
  };
  doc.createElement = tag => constructors.has(tag) ? new (constructors.get(tag))() : create(tag);
  return doc;
}

function findById(root, id) {
  if (root.id === id) return root;
  for (const child of root.children) {
    const match = findById(child, id);
    if (match) return match;
  }
  return undefined;
}

function snapshot(control) {
  return {
    state: control.element.getAttribute("data-state"),
    explanation: control.element.getAttribute("data-disabled-explanation"),
    text: control.element.allText,
    title: control.button.title,
    disabled: control.button.getAttribute("aria-disabled"),
    busy: control.button.getAttribute("aria-busy"),
    descriptions: control.button.getAttribute("aria-describedby")
  };
}

test("a entrada publica importa em Node sem registrar elementos nem exigir globais DOM", () => {
  const entry = new URL("../dist/index.js", import.meta.url).href;
  const result = spawnSync(process.execPath, [
    "--input-type=module",
    "--eval",
    `
      import assert from "node:assert/strict";
      for (const name of ["HTMLElement", "customElements", "document", "window"]) {
        delete globalThis[name];
      }
      const api = await import(process.argv[1]);
      assert.equal(typeof api.createActionButton, "function");
      assert.equal(typeof api.registerMotiButton, "function");
      for (const name of ["HTMLElement", "customElements", "document", "window"]) {
        assert.equal(globalThis[name], undefined);
      }
    `,
    entry
  ], { encoding: "utf8" });

  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("registro sem capacidade e repetivel e conserva o fallback DOM do host", () => {
  for (const defaultView of [undefined, null, {}]) {
    const doc = createFakeDocument();
    if (defaultView !== undefined) doc.defaultView = defaultView;

    assert.equal(registerMotiButton(doc), undefined);
    assert.equal(registerMotiButton(doc), undefined);

    const control = createActionButton(doc, {
      id: "fallback-apply",
      label: "Aplicar",
      onPress() {}
    });

    assert.equal(control.element.tagName, "span");
    assert.equal(control.element.className, "ch-action");
    assert.equal(control.element.id, "fallback-apply-component");
    assert.equal(control.element.ownerDocument, doc);
    assert.equal(control.button.parentNode, control.element);
    assert.equal(control.button.ownerDocument, doc);
    assert.equal(control.button.tagName, "button");
    assert.equal(control.button.id, "fallback-apply");
    assert.equal(control.button.allText, "Aplicar");
    assert.equal(control.button.getAttribute("type"), "button");
    assert.equal(typeof control.setState, "function");
    assert.equal(typeof control.setDisabled, "function");
  }
});

test("o wrapper conserva as variantes publicas inclusive quiet", () => {
  const doc = createFakeDocument();
  for (const variant of ["default", "primary", "danger", "quiet"]) {
    const control = createActionButton(doc, { label: "Aplicar", variant, onPress() {} });
    assert.equal(control.button.className, `ch-action-button ch-action-button--${variant}`);
  }
});

test("aliases de variantes preservam os quatro tratamentos visuais existentes", () => {
  const doc = createFakeDocument();
  for (const [variant, canonical] of [["secondary", "default"], ["tertiary", "quiet"], ["ghost", "quiet"], ["destructive", "danger"]]) {
    const control = createActionButton(doc, { label: "Aplicar", variant, onPress() {} });
    assert.equal(control.button.className, `ch-action-button ch-action-button--${canonical}`);
  }
});

test("compacto conserva nome acessivel completo com SVG ou fallback textual", () => {
  for (const supportsNamespaces of [true, false]) {
    const doc = createFakeDocument({ supportsNamespaces });
    const control = createActionButton(doc, { label: "Copiar keyframes", icon: "copyKeys", compact: true, onPress() {} });
    const [icon, label] = control.button.children;
    assert.equal(control.button.getAttribute("aria-label"), "Copiar keyframes");
    assert.equal(control.button.title, "Copiar keyframes");
    assert.equal(control.element.getAttribute("data-compact"), "true");
    assert.equal(control.button.getAttribute("data-compact"), "true");
    assert.equal(icon.className, "ch-action-button__icon");
    assert.equal(icon.getAttribute("aria-hidden"), "true");
    assert.equal(icon.getAttribute("data-hidden"), "false");
    assert.equal(icon.children[0].tagName, supportsNamespaces ? "svg" : "span");
    assert.equal(label.textContent, "Copiar keyframes");
    assert.equal(label.getAttribute("data-hidden"), "true");
  }
});

test("view mantem controles, icone e SVG do consumidor ao alterar rotulo, estado e modo", () => {
  const doc = createFakeDocument(), root = doc.createElement("span");
  const view = mountActionButton(doc, root, "stable", { label: "Aplicar", icon: "ease", compact: true, onPress() {} });
  const originalButton = view.button, [icon, label] = originalButton.children, originalIcon = icon.children[0];
  const custom = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
  originalButton.appendChild(custom);
  view.setLabel("Aplicar curva");
  view.setTitle("Aplicar curva selecionada");
  view.setState("success", "Curva aplicada");
  view.setIcon("ease");
  view.setCompact(false);
  assert.equal(view.button, originalButton);
  assert.equal(view.button.children[0], icon);
  assert.equal(view.button.children[1], label);
  assert.equal(icon.children[0], originalIcon);
  assert.equal(custom.parentNode, originalButton);
  assert.equal(label.textContent, "Aplicar curva");
  assert.equal(label.getAttribute("data-hidden"), "false");
  assert.equal(view.button.getAttribute("aria-label"), "Aplicar curva");
  view.setIcon("copyKeys");
  assert.equal(icon.children.length, 1);
  assert.notEqual(icon.children[0], originalIcon);
  view.setIcon(undefined);
  assert.equal(icon.children.length, 0);
  assert.equal(icon.getAttribute("data-hidden"), "true");
  assert.equal(custom.parentNode, originalButton);
});

test("atributos e propriedades do Web Component atualizam apresentacao sem substituir filhos", () => {
  const doc = customDocument();
  const control = createActionButton(doc, { label: "Aplicar", icon: "ease", compact: true, onPress() {} });
  const component = control.element, native = control.button, [icon, label] = native.children, initialIcon = icon.children[0];
  assert.equal(component.tagName, "moti-button");
  assert.equal(component.icon, "ease");
  assert.equal(component.compact, true);
  component.label = "Aplicar curva";
  component.variant = "secondary";
  component.compact = false;
  assert.equal(component.button, native);
  assert.equal(icon.children[0], initialIcon);
  assert.equal(label.textContent, "Aplicar curva");
  assert.equal(label.getAttribute("data-hidden"), "false");
  assert.equal(native.getAttribute("aria-label"), "Aplicar curva");
  assert.equal(native.className, "ch-action-button ch-action-button--default");
  component.setAttribute("icon", "copyKeys");
  assert.notEqual(icon.children[0], initialIcon);
  component.removeAttribute("icon");
  assert.equal(component.icon, undefined);
  assert.equal(icon.children.length, 0);
  component.setAttribute("compact", "");
  assert.equal(label.getAttribute("data-hidden"), "true");
  component.icon = "ease";
  const recoveredIcon = icon.children[0];
  component.setAttribute("icon", " ");
  assert.equal(component.getAttribute("data-invalid"), "true");
  assert.equal(icon.children[0], recoveredIcon);
  component.icon = "copyKeys";
  assert.equal(component.getAttribute("data-invalid"), undefined);
  assert.equal(native.getAttribute("aria-invalid"), undefined);
});

test("validacao de icone e modo compacto ocorre antes de registrar ou montar", () => {
  const doc = createFakeDocument();
  let created = 0;
  const create = doc.createElement;
  doc.createElement = tag => { created++; return create(tag); };
  for (const options of [{ icon: " " }, { icon: 2 }, { compact: "false" }]) {
    assert.throws(() => createActionButton(doc, { label: "Aplicar", onPress() {}, ...options }));
  }
  assert.equal(created, 0);
});

test("acoes desconectadas e native disabled bloqueiam callbacks sem quebrar pre-montagem", () => {
  for (const doc of [createFakeDocument(), customDocument()]) {
    let presses = 0;
    const control = createActionButton(doc, { label: "Aplicar", compact: true, onPress() { presses++; } });
    const root = control.element, native = control.button;
    root.isConnected = false;
    control.setState("loading", "Preparando");
    control.setState("default");
    assert.equal(control.button, native, "controle disponivel antes da montagem");
    native.click(); native.keydown("Enter");
    assert.equal(presses, 0);
    root.isConnected = true;
    root.connectedCallback?.();
    native.click();
    native.disabled = true;
    native.click(); native.keydown(" ");
    assert.equal(presses, 1);
    native.disabled = false;
    root.isConnected = false;
    root.disconnectedCallback?.();
    native.click(); native.keydown("Enter");
    assert.equal(presses, 1);
    root.isConnected = true;
    root.connectedCallback?.();
    native.click();
    assert.equal(presses, 2, "reconexao reativa somente um callback");
  }
});

for (const state of COMPONENT_STATES) {
  test(`o wrapper preserva estado ${state}, sua explicacao e disponibilidade`, () => {
    const doc = createFakeDocument();
    let presses = 0;
    const stateLabel = state === "default" ? undefined : `Resultado ${state}`;
    const control = createActionButton(doc, {
      id: `action-${state}`,
      label: "Aplicar",
      state,
      stateLabel,
      onPress() { presses += 1; }
    });
    const status = findById(control.element, `action-${state}-state`);
    const blocked = state === "loading" || state === "unsupported";

    assert.equal(control.element.getAttribute("data-state"), state);
    assert.equal(control.button.getAttribute("aria-disabled"), blocked ? "true" : undefined);
    assert.equal(control.button.getAttribute("aria-busy"), state === "loading" ? "true" : undefined);
    assert.equal(status.getAttribute("role"), "status");
    assert.equal(status.getAttribute("aria-live"), "polite");
    assert.equal(status.getAttribute("data-hidden"), state === "default" ? "true" : "false");
    assert.equal(control.button.title, stateLabel ?? "Aplicar");
    assert.equal(
      control.button.getAttribute("aria-describedby"),
      state === "default" ? undefined : `action-${state}-state`
    );
    if (stateLabel) assert.ok(status.allText.includes(stateLabel));

    control.button.click();
    control.button.keydown("Enter");
    control.button.keydown(" ");
    assert.equal(presses, blocked ? 0 : 3);
  });
}

test("remover disabled durante loading ou unsupported nao libera a acao", () => {
  const doc = createFakeDocument();
  let presses = 0;
  const control = createActionButton(doc, {
    id: "state-gate",
    label: "Aplicar",
    onPress() { presses += 1; }
  });

  for (const state of ["loading", "unsupported"]) {
    control.setState(state, `Motivo ${state}`);
    control.setDisabled(true, "Selecione uma camada.");
    control.setDisabled(false);

    assert.equal(control.button.getAttribute("aria-disabled"), "true");
    assert.equal(control.button.getAttribute("aria-describedby"), "state-gate-state");
    assert.equal(findById(control.element, "state-gate-disabled-reason").getAttribute("data-hidden"), "true");
    assert.equal(control.button.title, `Motivo ${state}`);
    assert.equal(control.button.click().defaultPrevented, true);
    control.button.keydown("Enter");
    assert.equal(presses, 0);
  }

  control.setState("success", "Aplicado com sucesso.");
  assert.equal(control.button.getAttribute("aria-disabled"), undefined);
  assert.equal(control.button.getAttribute("aria-busy"), undefined);
  control.button.click();
  assert.equal(presses, 1, "confirmacao de sucesso permite repetir a acao");
});

test("explicacoes, IDs e title acompanham estado e indisponibilidade sem perder o titulo original", () => {
  const doc = createFakeDocument();
  const control = createActionButton(doc, {
    id: "apply-described",
    label: "Aplicar",
    title: "Aplicar o preset atual",
    state: "warning",
    stateLabel: "O preset sera adaptado.",
    disabled: true,
    disabledReason: "Selecione uma camada.",
    onPress() {}
  });
  const reason = findById(control.element, "apply-described-disabled-reason");

  assert.equal(control.button.title, "Selecione uma camada.");
  assert.equal(control.button.getAttribute("aria-describedby"), "apply-described-state apply-described-disabled-reason");
  assert.equal(reason.textContent, "Selecione uma camada.");
  assert.equal(reason.getAttribute("aria-hidden"), "false");
  assert.equal(reason.getAttribute("data-hidden"), "false");
  assert.equal(control.button.disabled, false, "botao indisponivel continua acessivel pelo foco");
  control.button.emit("focus");
  assert.equal(control.element.getAttribute("data-disabled-explanation"), "open");

  control.setDisabled(true, "Abra uma composicao.");
  assert.equal(reason.textContent, "Abra uma composicao.");
  assert.equal(control.button.title, "Abra uma composicao.");
  control.setDisabled(false);
  assert.equal(control.element.getAttribute("data-disabled-explanation"), "closed");
  assert.equal(reason.getAttribute("aria-hidden"), "true");
  assert.equal(reason.getAttribute("data-hidden"), "true");
  assert.equal(control.button.getAttribute("aria-describedby"), "apply-described-state");
  assert.equal(control.button.title, "Aplicar o preset atual");

  control.setState("default");
  assert.equal(control.button.getAttribute("aria-describedby"), undefined);
  assert.equal(control.button.title, "Aplicar o preset atual");
});

test("botoes sem id explicito mantem descricoes independentes", () => {
  const doc = createFakeDocument();
  const controls = Array.from({ length: 2 }, () => createActionButton(doc, {
    label: "Aplicar",
    state: "error",
    stateLabel: "Tente novamente.",
    disabled: true,
    disabledReason: "Selecione uma camada.",
    onPress() {}
  }));

  assert.notEqual(controls[0].button.id, controls[1].button.id);
  assert.notEqual(controls[0].element.id, controls[1].element.id);
  for (const control of controls) {
    const descriptions = control.button.getAttribute("aria-describedby").split(" ");
    assert.equal(descriptions.length, 2);
    for (const id of descriptions) assert.ok(findById(control.element, id));
  }
});

test("setState e setDisabled invalidos rejeitam antes de alterar o estado anterior", () => {
  const doc = createFakeDocument();
  let presses = 0;
  const control = createActionButton(doc, {
    label: "Aplicar",
    state: "success",
    stateLabel: "Pronto para aplicar novamente.",
    onPress() { presses += 1; }
  });
  const enabled = snapshot(control);

  for (const state of COMPONENT_STATES.filter((value) => value !== "default")) {
    assert.throws(() => control.setState(state), /stateLabel/);
    assert.deepEqual(snapshot(control), enabled);
    assert.throws(() => control.setState(state, "  "), /stateLabel/);
    assert.deepEqual(snapshot(control), enabled);
  }
  assert.throws(() => control.setState("unknown", "Estado invalido."));
  assert.deepEqual(snapshot(control), enabled);
  assert.throws(() => control.setDisabled(true), /disabledReason/);
  assert.deepEqual(snapshot(control), enabled);
  control.button.click();
  assert.equal(presses, 1);

  control.setDisabled(true, "Selecione uma camada.");
  const disabled = snapshot(control);
  assert.throws(() => control.setDisabled(true, " "), /disabledReason/);
  assert.deepEqual(snapshot(control), disabled);
  assert.throws(() => control.setState("loading"), /stateLabel/);
  assert.deepEqual(snapshot(control), disabled);
  control.button.click();
  assert.equal(presses, 1);
});

afterEach(() => {
  for (const name of ["HTMLElement", "customElements", "document", "window"]) delete globalThis[name];
});
