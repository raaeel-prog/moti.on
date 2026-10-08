import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { setImmediate } from "node:timers/promises";
import { createFakeWindow } from "../../../packages/ui-core/tests/fake-dom.mjs";
import { createCepDocument } from "./cep-dom.mjs";

// The floating window bundle, as shipped: this is what the Modeless extension loads.
const bundle = readFileSync(new URL("../../../dist/after-effects-cep/client/quick-ease.js", import.meta.url), "utf8");

function mountQuick({ selectedKeys = 2, withHost = true } = {}) {
  const document = createCepDocument();
  const mount = document.createElement("div");
  document.getElementById = id => (id === "root" ? mount : null);
  document.querySelector = () => null;
  document.readyState = "complete";
  const window = createFakeWindow();
  const requests = [], dispatched = [];
  let title = "";
  const context = { host: "After Effects", hostVersion: "26.3.0", isComposition: true, selectionSelectedKeyCount: selectedKeys, selectionSignature: "comp1|L1|P1:1.2", selectionPropertyCount: 1, selectionLayerCount: 1 };
  class CSInterface {
    getHostEnvironment() { return { appVersion: "26.3.0", appUILocale: "pt_BR" }; }
    getSystemPath() { return "/fixture"; }
    getExtensionID() { return "com.motion.plugin.ae.quick-ease"; }
    setWindowTitle(value) { title = value; }
    addEventListener() {}
    removeEventListener() {}
    dispatchEvent(event) { dispatched.push(event); }
    requestOpenExtension(id) { dispatched.push({ type: "open", data: id }); }
    evalScript(script, callback) {
      if (!script.startsWith("MotionAE.dispatch(")) { callback("function"); return; }
      const response = runInNewContext(script, { MotionAE: { dispatch(serialized) {
        const request = JSON.parse(serialized); requests.push(request);
        return JSON.stringify({ protocolVersion: 1, requestId: request.requestId, ok: true,
          data: request.command === "ae.context.read" ? context : { appliedCount: 2, skippedCount: 0, removedCount: 0, session: { signature: context.selectionSignature, segments: [] } },
          warnings: [], error: null });
      } } });
      callback(response);
    }
  }
  class CSEvent { constructor(type, scope, appId, extensionId) { this.type = type; this.scope = scope; this.appId = appId; this.extensionId = extensionId; this.data = ""; } }
  const storage = new Map();
  window.localStorage = { getItem: k => (storage.has(k) ? storage.get(k) : null), setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) };
  window.CSInterface = CSInterface; window.CSEvent = CSEvent;
  const globals = { document, window, CSInterface: withHost ? CSInterface : undefined, CSEvent, SystemPath: { EXTENSION: "extension" },
    requestAnimationFrame: () => 1, cancelAnimationFrame() {}, performance: { now: () => 0 },
    setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {}, navigator: { platform: "Win32" } };
  if (!withHost) delete window.CSInterface;
  runInNewContext(bundle, globals);
  return { mount, requests, dispatched, title: () => title, buttons: () => mount.getElementsByTagName("button"), context,
    status: () => mount.getElementsByTagName("p").find(node => node.getAttribute("role") === "status") };
}

test("the floating window mounts the compact editor, titles itself and reads the selection", async () => {
  const f = mountQuick();
  await setImmediate();
  assert.equal(f.title(), "Suavização rápida");
  assert.ok(f.mount.querySelectorAll(".ch-curve").length, "curve editor present");
  assert.equal(f.mount.querySelectorAll(".ch-ease-library").length, 0, "no library shelf in compact mode");
  const chips = f.buttons().filter(node => node.className.split(" ").includes("ch-ease-chip"));
  assert.deepEqual(chips.map(node => node.allText), ["Ease", "In", "Out", "InOut", "Linear"]);
  assert.ok(f.requests.some(request => request.command === "ae.context.read"));
  assert.match(f.status().textContent, /2 keyframe/);
});

test("Apply writes once through ae.keys.ease.apply with the captured selection", async () => {
  const f = mountQuick();
  await setImmediate();
  f.buttons().find(node => node.id === "quick-ease-apply").click();
  await setImmediate(); await setImmediate();
  const applies = f.requests.filter(request => request.command === "ae.keys.ease.apply");
  assert.equal(applies.length, 1);
  assert.equal(applies[0].args.expectedSelection, "comp1|L1|P1:1.2");
  assert.equal(applies[0].args.session, undefined);
});

test("without a keyframe selection the window shows guidance and disables Apply", async () => {
  const f = mountQuick({ selectedKeys: 0 });
  await setImmediate();
  assert.match(f.status().textContent, /Selecione keyframes/);
  const apply = f.buttons().find(node => node.id === "quick-ease-apply");
  assert.ok(apply.disabled || apply.getAttribute("aria-disabled") === "true");
});

test("Editor completo opens the main panel and asks it to navigate to the ease view", async () => {
  const f = mountQuick();
  await setImmediate();
  f.buttons().find(node => node.id === "quick-ease-full").click();
  assert.ok(f.dispatched.some(event => event.type === "open" && event.data === "com.motion.plugin.ae.panel"));
  assert.ok(f.dispatched.some(event => event.type === "com.motion.plugin.ease.navigate"));
});

test("outside the host the window says so instead of rendering a dead editor", () => {
  const f = mountQuick({ withHost: false });
  assert.match(f.status().textContent, /After Effects/);
  assert.equal(f.mount.querySelectorAll(".ch-curve").length, 0);
});
