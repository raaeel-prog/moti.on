import { afterEach } from 'node:test';
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

import { createAlert, registerMotiAlert } from "../dist/index.js";
import { mountAlertView, validateAlertOptions } from "../dist/elements/alert-view.js";
import { createFakeDocument } from "./fake-dom.mjs";

function clock() {
  let time = 0, nextId = 0;
  const timers = new Map();
  const delays = [];
  return {
    api: {
      setTimeout(callback, delay) {
        const id = ++nextId;
        timers.set(id, { callback, due: time + delay });
        delays.push(delay);
        return id;
      },
      clearTimeout(id) { timers.delete(id); }
    },
    delays,
    get size() { return timers.size; },
    tick(duration) {
      time += duration;
      for (const [id, timer] of [...timers]) {
        if (timer.due <= time && timers.delete(id)) timer.callback();
      }
    }
  };
}

function registryDocument({ collision = false, rejects = false } = {}) {
  const doc = createFakeDocument(), entries = new Map();
  let definitions = 0;
  if (collision) entries.set("moti-alert", class ForeignAlert {});
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

function buttons(root) { return root.getElementsByTagName("button"); }
function byClass(root, className) {
  for (const child of root.children) {
    if (child.className === className) return child;
    const nested = byClass(child, className);
    if (nested) return nested;
  }
  return undefined;
}
function snapshot(root) {
  return {
    className: root.className, text: root.textContent, hidden: root.hidden,
    attributes: { ...root.attributes }, children: root.children.map(snapshot)
  };
}

test("alert public entry imports without DOM globals or eager registration", () => {
  const result = spawnSync(process.execPath, ["--input-type=module", "--eval", `
    import assert from "node:assert/strict";
    for (const name of ["HTMLElement", "customElements", "document", "window"]) delete globalThis[name];
    const api = await import(process.argv[1]);
    assert.equal(typeof api.registerMotiAlert, "function");
    assert.equal(typeof api.createAlert, "function");
    for (const name of ["HTMLElement", "customElements", "document", "window"]) assert.equal(globalThis[name], undefined);
  `, new URL("../dist/index.js", import.meta.url).href], { encoding: "utf8" });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("alert registry is lazy, idempotent, realm-local and does not require Event", () => {
  const first = registryDocument(), second = registryDocument();
  assert.equal(first.definitions, 0);
  const firstType = registerMotiAlert(first.doc), secondType = registerMotiAlert(second.doc);
  assert.equal(typeof firstType, "function");
  assert.notEqual(firstType, secondType);
  assert.equal(registerMotiAlert(first.doc), firstType);
  assert.equal(first.definitions, 1);
  assert.equal(second.definitions, 1);
  assert.equal(first.entries.get("moti-alert"), firstType);
});

test("missing, foreign, rejected and partial registries retain the functional div fallback", () => {
  for (const doc of [createFakeDocument(), registryDocument({ collision: true }).doc,
    registryDocument({ rejects: true }).doc, registryDocument().doc]) {
    let presses = 0;
    const alert = createAlert(doc, {
      id: "notice", title: "Selection changed", tone: "warning",
      actions: [{ label: "Reload", dismissOnPress: false, onPress() { presses++; } }]
    });
    assert.equal(alert.element.tagName, "div");
    assert.equal(alert.element.id, "notice");
    assert.equal(alert.element.getAttribute("aria-labelledby"), "notice-title");
    assert.equal(alert.element.getAttribute("role"), "status");
    buttons(alert.element)[0].click();
    assert.equal(presses, 1);
    alert.dispose();
  }
});

test("alert validation rejects invalid contracts before mutating a supplied root", () => {
  const invalid = [
    { title: "" }, { title: "Ready", id: " " }, { title: "Ready", tone: "error" },
    { title: "Ready", description: 4 }, { title: "Ready", icon: {} },
    { title: "Ready", assertive: "false" }, { title: "Ready", onDismiss() {} },
    { title: "Ready", dismissLabel: "Close", onDismiss: "callback" },
    { title: "Ready", actions: {} },
    { title: "Ready", actions: [{ label: "", onPress() {} }] },
    { title: "Ready", actions: [{ label: "Reload", onPress: false }] },
    { title: "Ready", actions: [{ label: "Reload", onPress() {}, dismissOnPress: "false" }] },
    { title: "Ready", scheduler: { setTimeout() {} } }
  ];
  for (const options of invalid) {
    const doc = createFakeDocument(), root = doc.createElement("div");
    root.id = "retained";
    root.className = "placement";
    root.appendChild(doc.createElement("span"));
    const before = snapshot(root);
    assert.throws(() => validateAlertOptions(options));
    assert.throws(() => mountAlertView(doc, root, options));
    assert.deepEqual(snapshot(root), before);
    assert.equal(root.id, "retained");
  }
});

test("controller setters validate atomically while updates preserve hidden state and native button ownership", () => {
  const doc = createFakeDocument();
  let presses = 0;
  const alert = createAlert(doc, {
    title: "Selection changed", description: "Draft kept", tone: "warning",
    actions: [{ label: "Reload", dismissOnPress: false, onPress() { presses++; } }]
  });
  const root = alert.element, action = buttons(root)[0];
  const title = byClass(root, "ch-alert__title"), description = byClass(root, "ch-alert__description");
  root.className += " placement";
  root.hidden = true;
  action.disabled = true;
  alert.setTitle("A seleção mudou");
  alert.setDescription("");
  alert.setTone("info");
  assert.equal(root.hidden, true);
  assert.equal(buttons(root)[0], action);
  assert.equal(action.disabled, true);
  assert.equal(byClass(root, "ch-alert__title"), title);
  assert.equal(byClass(root, "ch-alert__description"), description);
  assert.equal(description.getAttribute("data-hidden"), "true");
  assert.match(root.className, /\bplacement\b/);
  const valid = snapshot(root);
  assert.throws(() => alert.setTitle(" "), /title/);
  assert.throws(() => alert.setDescription(42), /description/);
  assert.throws(() => alert.setTone("invalid"), /tone/);
  assert.deepEqual(snapshot(root), valid);
  action.click();
  root.hidden = false;
  action.click();
  assert.equal(presses, 0);
  action.disabled = false;
  action.click();
  assert.equal(presses, 1);
});

test("assertive alerts preserve their existing semantics independently of tone", () => {
  const doc = createFakeDocument();
  const alert = createAlert(doc, { title: "Check selection", tone: "warning", assertive: true });
  assert.equal(alert.element.getAttribute("role"), "alert");
  assert.equal(alert.element.getAttribute("aria-live"), "assertive");
  assert.equal(alert.element.getAttribute("aria-atomic"), "true");
  alert.setTone("info");
  assert.equal(alert.element.getAttribute("role"), "alert");
});

test("alert actions are cloned so external option mutations cannot inject callbacks or dismissal", () => {
  const doc = createFakeDocument(), timer = clock();
  let original = 0, injected = 0;
  const action = { label: "Reload", dismissOnPress: false, onPress() { original++; } };
  const actions = [action];
  const alert = createAlert(doc, { title: "Selection changed", actions, scheduler: timer.api });
  action.onPress = () => { injected++; };
  action.dismissOnPress = true;
  action.label = "Injected";
  actions.push({ label: "Extra", onPress() { injected++; } });
  const control = buttons(alert.element)[0];
  control.click();
  control.click();
  assert.equal(original, 2);
  assert.equal(injected, 0);
  assert.equal(control.textContent, "Reload");
  assert.equal(buttons(alert.element).length, 1);
  assert.equal(timer.size, 0);
});

test("dismiss uses one 140ms timer, restores focus and never repeats a callback or action", () => {
  const doc = createFakeDocument(), timer = clock(), parent = doc.createElement("section");
  const origin = doc.createElement("button");
  parent.appendChild(origin);
  origin.focus();
  let dismissed = 0, presses = 0;
  const alert = createAlert(doc, {
    title: "Selection changed", dismissLabel: "Close", scheduler: timer.api,
    onDismiss() { dismissed++; }, actions: [{ label: "Reload", onPress() { presses++; } }]
  });
  parent.appendChild(alert.element);
  const [action, close] = buttons(alert.element);
  action.focus();
  action.click();
  action.click();
  close.click();
  alert.dismiss();
  assert.equal(presses, 1);
  assert.equal(doc.activeElement, origin);
  assert.deepEqual(timer.delays, [140]);
  assert.equal(timer.size, 1);
  assert.equal(alert.element.getAttribute("data-closing"), "true");
  assert.equal(action.getAttribute("tabindex"), "-1");
  assert.equal(close.getAttribute("aria-disabled"), "true");
  timer.tick(139);
  assert.equal(dismissed, 0);
  timer.tick(1);
  assert.equal(dismissed, 1);
  assert.equal(alert.element.hidden, true);
  assert.equal(timer.size, 0);
  alert.setTitle("A changed title cannot reopen it");
  alert.dismiss();
  timer.tick(1000);
  assert.equal(alert.element.hidden, true);
  assert.equal(dismissed, 1);
});

test("dispose cancels a pending close without invoking onDismiss and leaves stale controls inert", () => {
  const doc = createFakeDocument(), timer = clock(), parent = doc.createElement("section");
  let dismissed = 0, presses = 0;
  const alert = createAlert(doc, {
    title: "Notice", dismissLabel: "Close", scheduler: timer.api,
    onDismiss() { dismissed++; }, actions: [{ label: "Apply", onPress() { presses++; } }]
  });
  parent.appendChild(alert.element);
  const stale = buttons(alert.element)[0];
  alert.dismiss();
  alert.dispose();
  alert.dispose();
  alert.dismiss();
  stale.click();
  timer.tick(1000);
  assert.equal(alert.element.parentNode, null);
  assert.equal(timer.size, 0);
  assert.equal(dismissed, 0);
  assert.equal(presses, 0);
});

test("actions may synchronously dismiss or dispose their own alert without scheduling another close", () => {
  for (const operation of ["dismiss", "dispose"]) {
    const doc = createFakeDocument(), timer = clock();
    let dismissed = 0, presses = 0;
    const alert = createAlert(doc, {
      title: "Notice", dismissLabel: "Close", scheduler: timer.api,
      onDismiss() { dismissed++; },
      actions: [{ label: "Apply", onPress() { presses++; alert[operation](); } }]
    });
    const stale = buttons(alert.element)[0];
    stale.click();
    stale.click();
    assert.equal(presses, 1);
    assert.deepEqual(timer.delays, operation === "dismiss" ? [140] : []);
    timer.tick(140);
    assert.equal(dismissed, operation === "dismiss" ? 1 : 0);
    assert.equal(timer.size, 0);
  }
});

test("stale controls on a disconnected root cannot call actions or start dismissal", () => {
  const doc = createFakeDocument(), timer = clock();
  let presses = 0, dismissed = 0;
  const alert = createAlert(doc, {
    title: "Notice", dismissLabel: "Close", scheduler: timer.api,
    onDismiss() { dismissed++; }, actions: [{ label: "Apply", onPress() { presses++; } }]
  });
  alert.element.isConnected = false;
  for (const control of buttons(alert.element)) control.click();
  timer.tick(1000);
  assert.equal(presses, 0);
  assert.equal(dismissed, 0);
  assert.equal(timer.size, 0);
});

test("a removed fallback suppresses the pending onDismiss even without a lifecycle callback", () => {
  const doc = createFakeDocument(), timer = clock(), parent = doc.createElement("section");
  let dismissed = 0;
  const alert = createAlert(doc, {
    title: "Notice", dismissLabel: "Close", scheduler: timer.api, onDismiss() { dismissed++; }
  });
  parent.appendChild(alert.element);
  alert.element.isConnected = true;
  alert.dismiss();
  parent.removeChild(alert.element);
  alert.element.isConnected = false;
  timer.tick(140);
  assert.equal(dismissed, 0);
  assert.equal(timer.size, 0);
});

test("view disconnect cancels closing timers while active reconnection keeps the same controls", () => {
  const doc = createFakeDocument(), timer = clock(), root = doc.createElement("div");
  let pressed = 0, dismissed = 0;
  const view = mountAlertView(doc, root, {
    title: "Notice", dismissLabel: "Close", scheduler: timer.api, onDismiss() { dismissed++; },
    actions: [{ label: "Reload", dismissOnPress: false, onPress() { pressed++; } }]
  });
  const action = buttons(root)[0];
  root.isConnected = true;
  root.isConnected = false;
  view.disconnect();
  assert.equal(root.hidden, false);
  assert.equal(root.getAttribute("data-open"), "true");
  action.click();
  assert.equal(pressed, 0);
  root.isConnected = true;
  action.click();
  assert.equal(pressed, 1);
  assert.equal(buttons(root)[0], action);
  view.dismiss();
  root.isConnected = false;
  view.disconnect();
  assert.equal(timer.size, 0);
  assert.equal(root.hidden, true);
  root.isConnected = true;
  view.setTitle("Still closed");
  action.click();
  timer.tick(1000);
  assert.equal(pressed, 1);
  assert.equal(dismissed, 0);
  assert.equal(root.hidden, true);
  view.dispose();
});

test("an invalid alert presentation blocks its actions and recovery preserves external disabled state", () => {
  const doc = createFakeDocument(), root = doc.createElement("div");
  let presses = 0;
  const view = mountAlertView(doc, root, {
    title: "Notice", actions: [{ label: "Reload", dismissOnPress: false, onPress() { presses++; } }]
  });
  const action = buttons(root)[0];
  view.setValid(false);
  action.click();
  assert.equal(presses, 0);
  assert.equal(action.getAttribute("aria-disabled"), "true");
  action.disabled = true;
  view.setValid(true);
  assert.equal(action.disabled, true);
  action.click();
  assert.equal(presses, 0);
  action.disabled = false;
  action.click();
  assert.equal(presses, 1);
});

afterEach(() => {
  for (const name of ["HTMLElement", "customElements", "document", "window"]) delete globalThis[name];
});
