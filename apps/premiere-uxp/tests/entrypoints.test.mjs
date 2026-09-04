import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

import { createPanelLifecycle, buildEntrypointConfig } from "../dist/client/src/lifecycle.js";

const premiereBundle = new URL("../../../dist/premiere-uxp/main.js", import.meta.url);

/**
 * Regressão do contrato de `entrypoints.setup` usado pelo painel Premiere.
 *
 * A parte oficial do contrato fica em
 * `docs/research/premiere-uxp-entrypoints-lifecycle.md`. Este double também
 * recusa o que o Premiere Pro 26.3.2 recusou de verdade. Medido em 2026-08-30
 * no log do host, com o painel em branco e sem nenhuma pista na interface:
 *
 *   Uncaught JS Exception:
 *   Error: create method is not defined for plugin.
 *       at Object._parsePluginData (uxp://uxp-internal/pluginmanager_scripts.js)
 *       at Object.setup (uxp://uxp-internal/pluginmanager_scripts.js)
 *
 * Um double que aceitasse `plugin` sem `create` aprovaria exatamente o bug que
 * deixou o painel do Premiere vazio desde o inicio do projeto.
 */
function setupComoOUxp(config) {
  if (!config || typeof config !== "object") {
    throw new Error("setup requires a configuration object.");
  }
  if (config.plugin !== undefined) {
    if (typeof config.plugin.create !== "function") {
      throw new Error("create method is not defined for plugin.");
    }
  }
  for (const [id, painel] of Object.entries(config.panels ?? {})) {
    if (typeof painel.create !== "function" && typeof painel.show !== "function") {
      throw new Error(`panel ${id} needs create or show.`);
    }
  }
  return config;
}

function lifecycleFalso() {
  const chamadas = [];
  const runtime = {
    show: () => chamadas.push("runtime.show"),
    dispose: () => chamadas.push("runtime.dispose")
  };
  const lifecycle = createPanelLifecycle(() => {
    chamadas.push("fabrica");
    return runtime;
  });
  return { lifecycle, chamadas };
}

test("o setup declara plugin.create, exigido pelo Premiere medido quando plugin existe", () => {
  const { lifecycle } = lifecycleFalso();

  const config = buildEntrypointConfig(lifecycle);

  assert.doesNotThrow(() => setupComoOUxp(config), "sem plugin.create o host medido recusa o setup inteiro");
  assert.equal(typeof config.plugin.create, "function");
  assert.equal(typeof config.plugin.destroy, "function");
});

test("o bundle final registra a configuracao valida, nao apenas o helper isolado", () => {
  let configRegistrada = null;
  const source = readFileSync(premiereBundle, "utf8");

  runInNewContext(source, {
    require(moduleId) {
      if (moduleId !== "uxp") {
        throw new Error(`modulo inesperado durante o bootstrap: ${moduleId}`);
      }

      return {
        entrypoints: {
          setup(config) {
            configRegistrada = setupComoOUxp(config);
          }
        }
      };
    }
  });

  assert.ok(configRegistrada, "o bundle precisa chamar entrypoints.setup");
  assert.equal(typeof configRegistrada.plugin.create, "function");
  assert.deepEqual(Object.keys(configRegistrada.panels), ["mainPanel"]);
});

test("o painel mainPanel declara os callbacks que o manifesto promete", () => {
  const { lifecycle } = lifecycleFalso();

  const config = buildEntrypointConfig(lifecycle);

  // O id vem do manifesto: trocar um sem o outro deixa o painel orfao.
  assert.deepEqual(Object.keys(config.panels), ["mainPanel"]);
  const painel = config.panels.mainPanel;
  assert.equal(typeof painel.create, "function");
  assert.equal(typeof painel.show, "function");
  assert.equal(typeof painel.destroy, "function");
});

test("os callbacks do painel montam e desmontam pelo lifecycle, sem duplicar", () => {
  const { lifecycle, chamadas } = lifecycleFalso();
  const config = buildEntrypointConfig(lifecycle);

  config.panels.mainPanel.create({});
  config.panels.mainPanel.show({});

  assert.deepEqual(chamadas, ["fabrica", "runtime.show"], "create ja monta; show nao remonta");
  assert.equal(lifecycle.isMounted(), true);

  config.panels.mainPanel.destroy();
  assert.deepEqual(chamadas, ["fabrica", "runtime.show", "runtime.dispose"]);
  assert.equal(lifecycle.isMounted(), false);
});

test("plugin.destroy desmonta o painel, e plugin.create nao monta nada sozinho", () => {
  const { lifecycle, chamadas } = lifecycleFalso();
  const config = buildEntrypointConfig(lifecycle);

  // `plugin.create` existe porque o UXP o exige, nao porque tenha trabalho: e
  // o painel que monta, e antes dele nao ha DOM onde montar.
  config.plugin.create();
  assert.deepEqual(chamadas, [], "montar aqui seria montar sem no de raiz");
  assert.equal(lifecycle.isMounted(), false);

  config.panels.mainPanel.show({});
  config.plugin.destroy();
  assert.equal(lifecycle.isMounted(), false);
  assert.deepEqual(chamadas, ["fabrica", "runtime.show", "runtime.dispose"]);
});
