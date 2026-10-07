import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { setImmediate } from "node:timers/promises";
import { createFakeWindow } from "../../../packages/ui-core/tests/fake-dom.mjs";
import { createCepDocument } from "./cep-dom.mjs";

const bundle = readFileSync(new URL("../../../dist/after-effects-cep/client/main.js", import.meta.url), "utf8");

async function mountSupportPanel() {
  const document = createCepDocument();
  document.body = document.createElement("body");
  const create = document.createElement;
  document.createElement = tag => { const node = create(tag); node.select = () => {}; return node; };
  const mount = document.createElement("div");
  document.getElementById = id => id === "root" ? mount : null;
  const window = createFakeWindow(360);
  const requests = [], pending = [], copies = [];
  document.execCommand = command => { assert.equal(command, "copy"); copies.push(document.body.firstChild.value); return true; };
  const context = {
    hostVersion: "26.3.0", projectName: null, projectPath: null,
    activeItemName: "Fixture", isComposition: true, compWidth: 1920,
    compHeight: 1080, compDuration: 5, compFrameRate: 30, currentTime: 0,
    workAreaStart: 0, workAreaDuration: 5, selectionLayerCount: 1,
    selectionPropertyCount: 1, selectionExpressibleCount: 1,
    selectionSelectedKeyCount: 2, selectionHasKeyframes: true,
    selectionHasExpressions: false, selectionIs3D: false,
    averageLayerDurationSeconds: 5, selectionTruncated: false
  };
  class CSInterface {
    getHostEnvironment() { return { appVersion: "26.3.0", appUILocale: "en_US" }; }
    getSystemPath() { return "/fixture"; }
    evalScript(script, callback) {
      if (!script.startsWith("MotionAE.dispatch(")) { callback("function"); return; }
      let request;
      runInNewContext(script, { MotionAE: { dispatch(serialized) { request = JSON.parse(serialized); } } });
      requests.push(request);
      const data = request.command === "ae.context.read" ? context :
        request.command === "ae.diagnostics.echo" ? request.args : {
          host: "after-effects", hostVersion: "26.3.0", hasProject: true, hasActiveComp: true,
          canWriteFiles: true, canAccessNetwork: true, canUseNativeAddon: false,
          canReachCompanion: false, canInsertMogrt: false, canReadTranscript: false,
          canImportTranscript: false, canQueryTranscriptLanguages: false, canReadCaptionTracks: false,
          expressionEngine: "javascript"
        };
      const finish = (failure = false) => callback(JSON.stringify({ protocolVersion: 1,
        requestId: request.requestId, ok: !failure, data: failure ? null : data,
        warnings: [], error: failure ? { code: "HOST_OPERATION_FAILED", message: "private/path", recoverable: true, action: "error.action.exportLogBundle" } : null }));
      if (request.command === "ae.context.read") finish(); else pending.push(finish);
    }
  }
  runInNewContext(bundle, { document, window, CSInterface, SystemPath: { EXTENSION: "extension" },
    requestAnimationFrame: () => 1, cancelAnimationFrame() {}, performance: { now: () => 0 },
    setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {} });
  await setImmediate();
  return { mount, window, requests, copies,
    go(label) { let tab = mount.getElementsByTagName("button").find(node => node.getAttribute("aria-label") === label);
      if (!tab && ["System", "Logs", "Diagnostics", "Context"].includes(label)) {
        mount.getElementsByTagName("button").find(node => node.getAttribute("data-view") === "settings").click();
        const route = {System:"system", Logs:"diagnostics", Diagnostics:"diagnostics", Context:"context"}[label];
        tab = mount.getElementsByTagName("button").find(node => node.id === `settings-help-${route}`);
      } assert.ok(tab, label); tab.click(); },
    action(id) { return mount.getElementsByTagName("button").find(node => node.id === id); },
    finish: failure => pending.shift()?.(failure)
  };
}

for (const [id, command] of [["system-check", "ae.capability.probe"], ["system-bridge", "ae.diagnostics.echo"]]) {
  test(`AE migrated system: ${id} dispatches once, blocks siblings and recovers`, async () => {
    const f = await mountSupportPanel(); f.go("System");
    const old = f.action(id); assert.ok(old);
    assert.ok(old.parentNode.className.includes("ch-action"));
    old.click(); old.click(); old.keydown("Enter");
    assert.equal(f.requests.filter(r => r.command === command).length, 1);
    for (const id of ["system-check", "system-bridge"]) {
      const current = f.action(id);
      assert.equal(current.getAttribute("aria-disabled"), "true");
      current.click(); current.keydown(" ");
    }
    assert.equal(f.requests.filter(r => r.command !== "ae.context.read").length, 1);
    f.finish(); await setImmediate();
    assert.equal(f.action(id).getAttribute("aria-disabled"), undefined);
    old.click(); assert.equal(f.requests.filter(r => r.command === command).length, 1);
    f.action(id).keydown("Enter");
    assert.equal(f.requests.filter(r => r.command === command).length, 2);
    f.finish(true); await setImmediate();
    assert.equal(f.action(id).getAttribute("aria-disabled"), undefined);
    assert.doesNotMatch(f.mount.allText, /private\/path/);
  });
}

test("AE migrated diagnostics preserves clipboard export, clear and debug; old renders are inert", async () => {
  const f = await mountSupportPanel(); f.go("Diagnostics");
  f.action("diagnostics-export").keydown("Enter");
  assert.equal(f.copies.length, 1);
  const exported = JSON.parse(f.copies[0]); assert.ok(Array.isArray(exported.entries));
  const oldDebug = f.action("diagnostics-debug"); oldDebug.click();
  assert.equal(f.action("diagnostics-debug").allText, "Disable debug mode");
  oldDebug.click(); assert.equal(f.action("diagnostics-debug").allText, "Disable debug mode");
  f.action("diagnostics-clear").click();
  assert.match(f.mount.allText, /No entries in this session/);
  const oldExport = f.action("diagnostics-export"); f.go("System");
  oldExport.click(); assert.equal(f.copies.length, 1);
  const system = f.action("system-check"); f.window.emit("unload");
  system.click(); assert.equal(f.requests.filter(r => r.command === "ae.capability.probe").length, 0);
});

