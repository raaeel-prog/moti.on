import test from "node:test";
import assert from "node:assert/strict";

import { createI18n } from "../../../packages/ui-core/dist/index.js";
import { createPanelLifecycle } from "../dist/client/src/lifecycle.js";
import {
  PREMIERE_MESSAGE_KEYS,
  createPremiereMessages,
  localizeCommandFailure
} from "../dist/client/src/messages.js";
import {
  exportDiagnosticsBundle,
  readUxpHostEnvironment
} from "../dist/client/src/uxp-runtime.js";

function fakeUxp(fileResult) {
  const calls = [];
  return {
    calls,
    module: {
      host: { version: "26.3.1", uiLocale: "pt_BR" },
      storage: {
        localFileSystem: {
          async getFileForSaving(name, options) {
            calls.push({ name, options });
            return fileResult;
          }
        }
      }
    }
  };
}

test("le versao, locale e picker do ambiente UXP", () => {
  const { module } = fakeUxp(null);
  assert.deepEqual(readUxpHostEnvironment(module), {
    hostVersion: "26.3.1",
    uiLocale: "pt_BR",
    canWriteFiles: true
  });
});

test("ambiente sem fatos nao inventa versao nem locale", () => {
  assert.deepEqual(readUxpHostEnvironment({}), {
    hostVersion: "unknown",
    uiLocale: undefined,
    canWriteFiles: false
  });
});

test("getter UXP que lanca resulta em fatos desconhecidos", () => {
  const module = {};
  Object.defineProperty(module, "host", { get: () => { throw new Error("host"); } });
  Object.defineProperty(module, "storage", { get: () => { throw new Error("storage"); } });

  assert.deepEqual(readUxpHostEnvironment(module), {
    hostVersion: "unknown",
    uiLocale: undefined,
    canWriteFiles: "unknown"
  });
});

test("exporta bundle no arquivo escolhido sem expor caminho", async () => {
  const writes = [];
  const file = {
    async write(contents) {
      writes.push(contents);
    }
  };
  const { module, calls } = fakeUxp(file);
  const bundle = { schemaVersion: 1, entries: [] };

  const result = await exportDiagnosticsBundle(module, bundle);

  assert.deepEqual(result, { status: "saved" });
  assert.deepEqual(calls, [
    { name: "moti-on-diagnostics.json", options: { types: ["json"] } }
  ]);
  assert.deepEqual(JSON.parse(writes[0]), bundle);
});

test("cancelamento do picker nao grava e nao vira falha", async () => {
  const { module } = fakeUxp(null);
  assert.deepEqual(await exportDiagnosticsBundle(module, {}), { status: "cancelled" });
});

test("bundles top-level sem representacao JSON falham antes de abrir o picker", async () => {
  for (const bundle of [undefined, () => undefined]) {
    const { module, calls } = fakeUxp(null);
    assert.deepEqual(await exportDiagnosticsBundle(module, bundle), {
      status: "failed",
      reason: "serialization-failed"
    });
    assert.deepEqual(calls, []);
  }
});

test("exportacao distingue picker ausente, picker com erro e write com erro", async () => {
  assert.deepEqual(await exportDiagnosticsBundle({}, {}), {
    status: "unsupported",
    reason: "picker-unavailable"
  });

  const pickerFailure = {
    storage: {
      localFileSystem: {
        async getFileForSaving() {
          throw new Error("path privado que nao pode vazar");
        }
      }
    }
  };
  assert.deepEqual(await exportDiagnosticsBundle(pickerFailure, {}), {
    status: "failed",
    reason: "picker-failed"
  });

  const writeFailure = fakeUxp({
    async write() {
      throw new Error("path privado que nao pode vazar");
    }
  });
  assert.deepEqual(await exportDiagnosticsBundle(writeFailure.module, {}), {
    status: "failed",
    reason: "write-failed"
  });
});

test("lifecycle monta uma vez, atualiza em cada show e limpa uma vez", () => {
  const calls = [];
  const lifecycle = createPanelLifecycle((rootNode) => {
    calls.push(`create:${rootNode}`);
    return {
      show: () => calls.push("show"),
      dispose: () => calls.push("dispose")
    };
  });

  lifecycle.create("root-a");
  lifecycle.create("root-b");
  lifecycle.show("root-c");
  lifecycle.show("root-d");
  lifecycle.destroy();
  lifecycle.destroy();

  assert.deepEqual(calls, ["create:root-a", "show", "show", "dispose"]);
  assert.equal(lifecycle.isMounted(), false);
});

test("lifecycle pode montar novamente depois de destroy", () => {
  let creates = 0;
  const lifecycle = createPanelLifecycle(() => {
    creates += 1;
    return { show() {}, dispose() {} };
  });

  lifecycle.show();
  lifecycle.destroy();
  lifecycle.show();
  assert.equal(creates, 2);
});

test("catalogos Premiere mantem paridade e textos pt-BR acentuados", () => {
  const pt = createPremiereMessages("pt-BR");
  const en = createPremiereMessages("en-US");

  for (const key of PREMIERE_MESSAGE_KEYS) {
    assert.ok(pt.t(key).length > 0, `pt-BR sem ${key}`);
    assert.ok(en.t(key).length > 0, `en-US sem ${key}`);
  }

  assert.match(pt.t("message.exportSaved"), /Diagnóstico/);
  assert.equal(en.t("value.noProject"), "No project open");
  assert.equal(
    en.t("selfTest.detail.transactionNotChecked"),
    "Not checked: open a project to probe the transaction API."
  );
});

test("erro assincrono permanece na view de origem e e localizado em en-US", () => {
  const i18n = createI18n({ locale: "en-US" });
  const messages = createPremiereMessages(i18n.locale());
  const localized = localizeCommandFailure(
    "context",
    {
      code: "HOST_OPERATION_FAILED",
      message: "O host falhou em português",
      recoverable: true,
      action: "error.action.checkUndoHistory"
    },
    i18n,
    messages
  );

  assert.equal(localized.viewId, "context");
  assert.match(localized.message, /Premiere Pro could not complete the operation/);
  assert.doesNotMatch(localized.message, /português/);
  assert.match(localized.recovery, /Undo history/);
});
