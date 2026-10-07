import { afterEach } from 'node:test';
import test from "node:test";
import assert from "node:assert/strict";

import { createDiagnosticsView } from "../dist/diagnostics-view.js";
import { createI18n } from "../dist/i18n.js";
import { createFakeDocument } from "./fake-dom.mjs";

function render(overrides = {}) {
  const calls = [];
  const options = {
    i18n: createI18n({ locale: "pt-BR" }),
    entries: [],
    droppedEntries: 0,
    debugMode: false,
    onExport: () => calls.push("export"),
    onClear: () => calls.push("clear"),
    onToggleDebug: () => calls.push("debug"),
    ...overrides
  };
  const view = createDiagnosticsView(createFakeDocument(), options);
  const buttons = view.actions.getElementsByTagName("button");
  return { ...view, buttons, calls, i18n: options.i18n };
}

function entry(overrides = {}) {
  return Object.freeze({
    timestamp: "2026-09-29T10:20:30.000Z",
    level: "info",
    command: null,
    durationMs: null,
    errorCode: null,
    ...overrides
  });
}

for (const locale of ["pt-BR", "en-US"]) {
  test(`diagnostics: empty session and action labels use ${locale}`, () => {
    const view = render({ i18n: createI18n({ locale }), droppedEntries: 7 });
    assert.equal(view.content.children[0].textContent, view.i18n.t("logs.redactionNotice"));
    assert.equal(view.content.children[1].textContent, view.i18n.t("logs.summary", { count: 0, dropped: 7 }));
    assert.equal(view.content.children[2].textContent, view.i18n.t("logs.empty"));
    assert.deepEqual(view.buttons.map((button) => button.allText), [
      view.i18n.t("action.exportBundle"),
      view.i18n.t("action.clearLogs"),
      view.i18n.t("action.enableDebug")
    ]);
    assert.equal(render({ i18n: view.i18n, debugMode: true }).buttons[2].allText,
      view.i18n.t("action.disableDebug"));
    assert.deepEqual(view.calls, []);
  });
}

test("diagnostics: newest first, severity and duration retain the existing log format", () => {
  const entries = Object.freeze([
    entry({ timestamp: "2026-09-29T09:10:11.000Z", level: "debug" }),
    entry({ timestamp: "2026-09-29T09:10:12.000Z", command: "ae.context.read", durationMs: 0 }),
    entry({ timestamp: "2026-09-29T09:10:13.000Z", level: "warn", message: "Warning", command: "hidden.command", durationMs: 12 }),
    entry({ timestamp: "2026-09-29T09:10:14.000Z", level: "error", message: "Failure", errorCode: "HOST_OPERATION_FAILED" })
  ]);
  const view = render({ entries, droppedEntries: 2 });
  const logs = view.content.children.filter((node) => node.className.startsWith("ch-log"));
  assert.deepEqual(logs.map((node) => node.textContent), [
    "09:10:14  ERROR  Failure  HOST_OPERATION_FAILED",
    "09:10:13  WARN  Warning  12 ms",
    "09:10:12  INFO  ae.context.read  0 ms",
    "09:10:11  DEBUG  -"
  ]);
  assert.deepEqual(logs.map((node) => node.className), [
    "ch-log ch-log--error", "ch-log ch-log--warn", "ch-log", "ch-log"
  ]);
  assert.equal(view.content.children[1].textContent, view.i18n.t("logs.summary", { count: 4, dropped: 2 }));
  assert.equal(entries[0].level, "debug");
  assert.equal(view.content.allText.includes(view.i18n.t("logs.empty")), false);
});

test("diagnostics: actions have stable identities, one primary action and working callbacks", () => {
  const view = render();
  assert.deepEqual(view.buttons.map((button) => button.id), [
    "diagnostics-export", "diagnostics-clear", "diagnostics-debug"
  ]);
  assert.match(view.buttons[0].className, /ch-action-button--primary/);
  assert.match(view.buttons[1].className, /ch-action-button--default/);
  assert.match(view.buttons[2].className, /ch-action-button--default/);
  view.buttons[0].click();
  view.buttons[1].keydown("Enter");
  view.buttons[2].keydown(" ");
  assert.deepEqual(view.calls, ["export", "clear", "debug"]);
});

test("diagnostics: unavailable export explains its disabled state and leaves local actions usable", () => {
  const view = render({
    exportUnavailableReason: "File writing is unavailable.",
    exportUnavailableNotice: "Diagnostics cannot be exported from this host."
  });
  assert.equal(view.content.children[1].className, "ch-notice ch-notice--warning");
  assert.equal(view.content.children[1].getAttribute("role"), "status");
  assert.equal(view.content.children[1].textContent, "Diagnostics cannot be exported from this host.");
  assert.equal(view.buttons[0].getAttribute("aria-disabled"), "true");
  assert.equal(view.buttons[0].title, "File writing is unavailable.");
  assert.match(view.buttons[0].getAttribute("aria-describedby"), /diagnostics-export-disabled-reason/);
  view.buttons[0].click();
  view.buttons[0].keydown("Enter");
  view.buttons[1].click();
  view.buttons[2].click();
  assert.deepEqual(view.calls, ["clear", "debug"]);
});

test("diagnostics: busy reason blocks every action and takes precedence for export", () => {
  const view = render({
    busyReason: "A command is running.",
    exportUnavailableReason: "File writing is unavailable."
  });
  for (const button of view.buttons) {
    assert.equal(button.getAttribute("aria-disabled"), "true");
    assert.equal(button.title, "A command is running.");
    button.click();
    button.keydown("Enter");
    button.keydown(" ");
  }
  assert.deepEqual(view.calls, []);
});

test("diagnostics: current app state is checked again at press time", () => {
  let canPress = true;
  const view = render({ canPress: () => canPress });
  view.buttons[0].click();
  canPress = false;
  for (const button of view.buttons) {
    button.click();
    button.keydown("Enter");
  }
  assert.deepEqual(view.calls, ["export"]);
  canPress = true;
  view.buttons[2].click();
  assert.deepEqual(view.calls, ["export", "debug"]);
});

test("diagnostics: disposed views leave old button references inert", () => {
  const view = render();
  view.buttons[1].click();
  view.dispose();
  view.dispose();
  for (const button of view.buttons) {
    button.click();
    button.keydown("Enter");
    button.keydown(" ");
  }
  assert.deepEqual(view.calls, ["clear"]);
});

afterEach(() => {
  for (const name of ["HTMLElement", "customElements", "document", "window"]) delete globalThis[name];
});
