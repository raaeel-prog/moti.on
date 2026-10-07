import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { setImmediate } from "node:timers/promises";

import { createFakeDocument, createFakeWindow } from "../../../packages/ui-core/tests/fake-dom.mjs";

const source = readFileSync(new URL("../../../dist/premiere-uxp/main.js", import.meta.url), "utf8");

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function project(name) {
  return { name, path: "", async getActiveSequence() { return null; }, async getSequences() { return []; } };
}

function mountPanel() {
  const document = createFakeDocument();
  document.documentElement = document.createElement("html");
  document.documentElement.clientWidth = 360;
  const mount = document.createElement("div");
  document.getElementById = (id) => id === "root" ? mount : null;
  const window = createFakeWindow();
  const pending = [];
  const pickers = [];
  let config;
  const uxp = {
    host: { version: "26.3.0", uiLocale: "en-US" },
    storage: { localFileSystem: {
      getFileForSaving() {
        const call = deferred();
        pickers.push(call);
        return call.promise;
      }
    } },
    entrypoints: { setup(value) { config = value; } }
  };
  runInNewContext(source, {
    document, window, setTimeout, clearTimeout,
    require(id) {
      if (id === "uxp") return uxp;
      if (id === "premierepro") return { Project: {
        getActiveProject() {
          const call = deferred();
          pending.push(call);
          return call.promise;
        }
      } };
      throw new Error(`Unexpected module ${id}`);
    }
  });
  return { panel: config.panels.mainPanel, mount, pending, pickers,
    current: () => mount.children[0],
    goTo: (index) => mount.children[0].children[1].children[index].click(),
    action: (label) => mount.children[0].getElementsByTagName("button").find((node) => node.allText === label),
    renderContext() {
      const nav = mount.children[0].children[1];
      nav.children[1].click();
      nav.children[0].click();
    },
    refresh: () => mount.children[0].children[4].children[0] };
}

test("bundle: resposta após destroy não repopula estado nem libera busy da nova montagem", async () => {
  const f = mountPanel();
  f.panel.show();
  f.panel.destroy();
  f.panel.show();
  assert.equal(f.pending.length, 2);
  f.pending[0].resolve(project("Old project"));
  await setImmediate();
  f.renderContext();
  assert.doesNotMatch(f.current().allText, /Old project/);
  assert.equal(f.refresh().disabled, true, "a nova leitura ainda está pendente");
  f.pending[1].resolve(project("Current project"));
  await setImmediate();
  assert.match(f.current().allText, /Current project/);
  assert.equal(f.refresh().disabled, false);
  f.panel.destroy();
});

test("bundle: show revalida mesmo durante leitura e descarta conclusão fora de ordem", async () => {
  const f = mountPanel();
  f.panel.show();
  f.panel.show();
  assert.equal(f.pending.length, 2, "show não pode conservar uma leitura de contexto anterior");
  f.pending[1].resolve(project("Latest project"));
  await setImmediate();
  f.pending[0].resolve(project("Stale project"));
  await setImmediate();
  f.renderContext();
  assert.match(f.current().allText, /Latest project/);
  assert.doesNotMatch(f.current().allText, /Stale project/);
  f.panel.destroy();
});

test("bundle: eventos repetidos do mesmo botão iniciam uma única operação", async () => {
  const f = mountPanel();
  f.panel.show();
  f.pending[0].resolve(project("Ready"));
  await setImmediate();
  const button = f.refresh();
  button.click();
  button.click();
  assert.equal(f.pending.length, 2, "um segundo evento pendente não inicia outro dispatch");
  f.pending[1].resolve(project("Updated"));
  await setImmediate();
  assert.match(f.current().allText, /Updated/);
  f.panel.destroy();
});

test("bundle: erro da leitura ativa libera a próxima tentativa e não vaza detalhe privado", async () => {
  const f = mountPanel();
  f.panel.show();
  f.pending[0].reject(new Error("private-project-path"));
  await setImmediate();
  assert.equal(f.refresh().disabled, false);
  assert.doesNotMatch(f.current().allText, /private-project-path/);
  f.refresh().click();
  f.pending[1].resolve(project("Recovered"));
  await setImmediate();
  assert.match(f.current().allText, /Recovered/);
  f.panel.destroy();
});

for (const action of ["Run check", "Run self-test"]) {
  test(`bundle: ${action} obsoleto não repopula resultados após show`, async () => {
    const f = mountPanel();
    f.panel.show();
    f.pending[0].resolve(project("Ready"));
    await setImmediate();
    f.goTo(2);
    f.action(action).click();
    f.panel.show();
    assert.equal(f.pending.length, 3);
    const before = f.current().allText;
    f.pending[1].resolve(project("Stale"));
    await setImmediate();
    assert.equal(f.current().allText, before, "conclusão antiga não muda resultado/status");
    assert.equal(f.action(action).getAttribute("aria-disabled"), "true", "a leitura do show continua dona do busy");
    f.pending[2].resolve(project("Current"));
    await setImmediate();
    assert.equal(f.action(action).getAttribute("aria-disabled"), undefined);
    f.panel.destroy();
  });
}

test("bundle: exportação pendente não sobrescreve status de nova leitura nem a cancela", async () => {
  const f = mountPanel();
  f.panel.show();
  f.pending[0].resolve(project("Ready"));
  await setImmediate();
  f.goTo(3);
  f.action("Export diagnostics").click();
  assert.equal(f.pickers.length, 1);
  f.panel.show();
  const isBusy = f.current().getAttribute("aria-busy");
  let writes = 0;
  f.pickers[0].resolve({ async write() { writes += 1; } });
  await setImmediate();
  assert.equal(writes, 1, "invalidação da UI não finge cancelar arquivo autorizado pelo picker");
  assert.equal(f.current().getAttribute("aria-busy"), isBusy);
  assert.equal(f.action("Export diagnostics").getAttribute("aria-disabled"), "true");
  f.pending[1].resolve(project("Current"));
  await setImmediate();
  assert.equal(f.action("Export diagnostics").getAttribute("aria-disabled"), undefined);
  f.panel.destroy();
});

test("bundle: falha obsoleta após sucesso atual não reaparece ao navegar", async () => {
  const f = mountPanel();
  f.panel.show();
  f.panel.show();
  f.pending[1].resolve(project("Current"));
  await setImmediate();
  const before = f.current().allText;
  f.pending[0].reject(new Error("private-stale-failure"));
  await setImmediate();
  f.renderContext();
  assert.equal(f.current().allText, before);
  f.panel.destroy();
});

for (const [page, label] of [[2, "Run check"], [3, "Export diagnostics"]]) {
  test(`bundle: ${label} de uma view descartada não executa após navegação ou destroy`, async () => {
    const f = mountPanel();
    f.panel.show(); f.pending[0].resolve(project("Ready")); await setImmediate();
    f.goTo(page);
    const old = f.action(label);
    f.goTo(0); old.click(); old.keydown("Enter");
    assert.equal(f.pending.length, 1);
    assert.equal(f.pickers.length, 0);
    f.goTo(page);
    const current = f.action(label);
    f.panel.destroy(); current.click(); current.keydown(" ");
    assert.equal(f.pending.length, 1);
    assert.equal(f.pickers.length, 0);
  });
}

test("bundle: ações de diagnóstico bloqueadas durante exportação e recuperadas após cancelamento", async () => {
  const f = mountPanel();
  f.panel.show(); f.pending[0].resolve(project("Ready")); await setImmediate();
  f.goTo(3);
  const old = f.action("Export diagnostics"); old.click(); old.click();
  assert.equal(f.pickers.length, 1);
  for (const label of ["Export diagnostics", "Clear logs", "Enable debug mode"]) {
    const action = f.action(label); assert.ok(action, label);
    assert.equal(action.getAttribute("aria-disabled"), "true");
    action.click(); action.keydown("Enter");
  }
  assert.equal(f.pickers.length, 1);
  f.pickers[0].resolve(null); await setImmediate();
  assert.equal(f.action("Export diagnostics").getAttribute("aria-disabled"), undefined);
  f.action("Enable debug mode").click();
  assert.ok(f.action("Disable debug mode"));
  f.panel.destroy();
});
