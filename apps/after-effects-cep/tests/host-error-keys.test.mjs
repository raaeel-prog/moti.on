import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

import { loadHostModules } from "./host-harness.mjs";

/**
 * Falhas com motivo legível (host/src/errors.jsx + host/src/preflight.jsx).
 *
 * O dispatcher continua sem copiar texto de exceção para a resposta. O que
 * atravessa é uma chave de uma lista fechada, que o painel traduz. Estes testes
 * cobram as três pontas: a lista do host existe nos dois idiomas, o dispatcher
 * repassa só a chave, e o painel a prefere ao texto genérico.
 */

const errorsSource = await readFile(new URL("../host/src/errors.jsx", import.meta.url), "utf8");
const localesSource = await readFile(
  new URL("../../../packages/ui-core/src/locales.ts", import.meta.url),
  "utf8"
);

function hostKeys() {
  const block = errorsSource.slice(errorsSource.indexOf("var KEYS = {"), errorsSource.indexOf("};", errorsSource.indexOf("var KEYS = {")));
  return [...block.matchAll(/"(hostError\.[A-Za-z]+)"/g)].map((m) => m[1]);
}

test("toda chave do host existe em pt-BR e en-US", () => {
  const keys = hostKeys();
  assert.ok(keys.length >= 10, "a lista de chaves do host não foi encontrada");
  for (const key of keys) {
    const occurrences = localesSource.split(`"${key}":`).length - 1;
    assert.equal(occurrences, 2, `${key} precisa existir uma vez em cada catálogo`);
  }
});

test("chaves usadas pelos comandos pertencem à lista fechada", async () => {
  const keys = new Set(hostKeys());
  const files = [
    "dispatch.jsx", "preflight.jsx", "keyframe-operations.jsx",
    "commands/clean.jsx", "commands/comp-fast-edit.jsx"
  ];
  for (const file of files) {
    const source = await readFile(new URL(`../host/src/${file}`, import.meta.url), "utf8");
    for (const [, key] of source.matchAll(/"(hostError\.[A-Za-z]+)"/g)) {
      assert.ok(keys.has(key), `${file} usa ${key}, fora da lista de errors.jsx`);
    }
  }
});

const HOST_MODULES = [
  "generated/motion-contracts.jsx",
  "generated/motion-descriptors.jsx",
  "src/json.jsx",
  "src/undo.jsx",
  "src/registry.jsx",
  "src/dispatch.jsx"
];

async function dispatcherWith(run) {
  class FakeCompItem {}
  const app = {
    project: { activeItem: null, items: {} },
    beginUndoGroup() {},
    endUndoGroup() {}
  };
  const scope = await loadHostModules(HOST_MODULES, { app, CompItem: FakeCompItem });
  scope.MotionRegistry.register("ae.demo.createComposition", { preflight: () => null, run: () => run(scope) });
  const request = JSON.stringify({
    protocolVersion: 1,
    requestId: "req-1",
    command: "ae.demo.createComposition",
    args: {},
    context: { host: "after-effects", hostVersion: "26.5" }
  });
  return JSON.parse(scope.MotionAE.dispatch(request));
}

test("exceção marcada leva só a chave; o texto da exceção não atravessa", async () => {
  const response = await dispatcherWith((scope) => {
    throw scope.MotionErrors.error("hostError.removedPartially", "/Users/x/projeto.aep falhou", { count: 3, path: "/Users/x" });
  });
  assert.equal(response.ok, false);
  assert.equal(response.error.code, "HOST_OPERATION_FAILED");
  assert.equal(response.error.message, "HOST_OPERATION_FAILED");
  assert.equal(response.error.details.messageKey, "hostError.removedPartially");
  assert.deepEqual(response.error.details.messageParams, { count: 3 });
  assert.doesNotMatch(JSON.stringify(response), /Users/);
});

test("chave fora da lista é descartada e o código continua normalizado", async () => {
  const response = await dispatcherWith(() => {
    const error = new Error("x");
    error.motionUserKey = "hostError.inventada";
    error.motionCode = "INVALID_PRESET";
    throw error;
  });
  assert.equal(response.error.code, "HOST_OPERATION_FAILED");
  assert.equal(response.error.details.messageKey, undefined);
});

test("ROLLBACK_FAILED sem chave recebe a frase de restauração incompleta", async () => {
  const response = await dispatcherWith(() => {
    const error = new Error("x");
    error.motionCode = "ROLLBACK_FAILED";
    throw error;
  });
  assert.equal(response.error.code, "ROLLBACK_FAILED");
  assert.equal(response.error.details.messageKey, "hostError.rollbackIncomplete");
});

test("exceção comum continua genérica", async () => {
  const response = await dispatcherWith(() => {
    throw new Error("qualquer coisa");
  });
  assert.equal(response.error.code, "HOST_OPERATION_FAILED");
  assert.equal(response.error.details.messageKey, undefined);
});

test("sem composição ativa, o requisito leva a chave de abrir composição", async () => {
  class FakeCompItem {}
  const app = { project: { activeItem: null, items: {} }, beginUndoGroup() {}, endUndoGroup() {} };
  const scope = await loadHostModules(HOST_MODULES, { app, CompItem: FakeCompItem });
  const descriptorWithComp = Object.keys(scope.MotionDescriptors).find((id) => {
    const descriptor = scope.MotionDescriptors[id];
    return descriptor && Array.isArray(descriptor.requirements) && descriptor.requirements.includes("hasActiveComp");
  });
  assert.ok(descriptorWithComp);
  scope.MotionRegistry.register(descriptorWithComp, { preflight: () => null, run: () => ({ changed: true, warnings: [], data: {} }) });
  const response = JSON.parse(scope.MotionAE.dispatch(JSON.stringify({
    protocolVersion: 1, requestId: "r", command: descriptorWithComp, args: {},
    context: { host: "after-effects", hostVersion: "26.5" }, options: { allowDestructive: true }
  })));
  assert.equal(response.error.code, "NO_ACTIVE_COMP");
  assert.equal(response.error.details.messageKey, "hostError.openComposition");
});

test("MotionPreflight recusa camada bloqueada com um código e uma chave", async () => {
  const scope = await loadHostModules(["generated/motion-contracts.jsx"]);
  const free = { locked: false };
  const locked = { locked: true };
  assert.equal(scope.MotionPreflight.unlockedLayers([free, free]), null);
  const failure = scope.MotionPreflight.unlockedLayers([free, locked]);
  assert.equal(failure.code, "INVALID_SELECTION_TYPE");
  assert.equal(failure.details.messageKey, "hostError.layerLocked");
  assert.equal(failure.details.selectionIndex, 1);

  const property = { propertyDepth: 2, propertyGroup: (depth) => (depth === 2 ? locked : null) };
  const owner = scope.MotionPreflight.unlockedPropertyOwners([property]);
  assert.equal(owner.details.messageKey, "hostError.propertyLayerLocked");
  // Double sem a API de grupo não bloqueia: a checagem nunca inventa um dono.
  assert.equal(scope.MotionPreflight.unlockedPropertyOwners([{}]), null);
});

test("MotionPreflight.effectAvailable sonda sem alterar e nomeia o efeito", async () => {
  const scope = await loadHostModules(["generated/motion-contracts.jsx"]);
  const layer = (available) => ({ property: () => ({ canAddProperty: () => available }) });
  assert.equal(scope.MotionPreflight.effectAvailable(layer(true), "CC Light Sweep", "CC Light Sweep"), null);
  const failure = scope.MotionPreflight.effectAvailable(layer(false), "CC Light Sweep", "CC Light Sweep");
  assert.equal(failure.code, "CAPABILITY_UNAVAILABLE");
  assert.deepEqual(failure.details.messageParams, { effect: "CC Light Sweep" });
});

test("comandos que editam camadas existentes passam pela checagem comum de bloqueio", async () => {
  // Os comandos abaixo não tinham checagem própria de camada bloqueada. Um novo
  // comando que edite camadas existentes deve entrar aqui ou ter sua própria
  // checagem justificada.
  const commands = [
    "animate-inertial", "animate-jump", "keys-cut", "keys-delay", "keys-reverse-values",
    "layer-parent", "rig-effector", "shape-break", "shape-trim-path", "comp-fast-edit"
  ];
  for (const name of commands) {
    const source = await readFile(new URL(`../host/src/commands/${name}.jsx`, import.meta.url), "utf8");
    assert.match(source, /MotionPreflight\.unlocked(Layers|PropertyOwners)\(/, `${name} sem checagem de camada bloqueada`);
  }
});

async function clientModule(file) {
  const bundled = await build({
    entryPoints: [fileURLToPath(new URL(file, import.meta.url))],
    bundle: true, platform: "node", format: "esm", write: false
  });
  return import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`);
}

const feedback = await clientModule("../client/src/host-feedback.ts");
const i18nStub = (language, catalog = {}) => ({
  locale: () => language,
  has: (key) => Object.prototype.hasOwnProperty.call(catalog, key),
  t: (key, params = {}) => (catalog[key] ?? key).replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? `{${name}}`))
});

test("painel: chave do host vence o mapa e o genérico, com parâmetros", () => {
  const i18n = i18nStub("en-US", { "hostError.removedPartially": "Stopped after {count}." });
  const message = feedback.hostFailureMessage(
    { code: "HOST_OPERATION_FAILED", message: "HOST_OPERATION_FAILED", recoverable: true, details: { messageKey: "hostError.removedPartially", messageParams: { count: 2 } } },
    i18n
  );
  assert.equal(message, "Stopped after 2.");
});

test("painel: frase de preflight em português aparece em pt-BR, nunca em en-US", () => {
  const error = { code: "INVALID_SELECTION_TYPE", message: "A selecao contem camada que nao e de forma.", recoverable: true, details: null };
  assert.equal(feedback.hostFailureMessage(error, i18nStub("pt-BR")), "A selecao contem camada que nao e de forma.");
  assert.equal(feedback.hostFailureMessage(error, i18nStub("en-US")), "status.notCompleted");
});

test("painel: código cru, caminho e resto de exceção nunca viram texto", () => {
  for (const message of ["HOST_OPERATION_FAILED", "/Users/a/b.aep sumiu", "Error: undefined is not an object", "C:\\x\\y falhou"]) {
    assert.equal(
      feedback.hostFailureMessage({ code: "HOST_OPERATION_FAILED", message, recoverable: true, details: null }, i18nStub("pt-BR")),
      "status.notCompleted",
      message
    );
  }
});

test("painel: avisos passam pelo mesmo filtro e não repetem", () => {
  const i18n = i18nStub("pt-BR", { "hostError.noChange": "Nada mudou." });
  const text = feedback.hostWarningMessage([
    { code: "W", message: "x", details: { messageKey: "hostError.noChange" } },
    { code: "W", message: "Controles animados preservados.", details: null },
    { code: "W", message: "Controles animados preservados.", details: null },
    { code: "W", message: "/tmp/segredo", details: null }
  ], i18n);
  assert.equal(text, "Nada mudou. Controles animados preservados.");
  assert.equal(feedback.hostWarningMessage([{ code: "W", message: "Texto em português.", details: null }], i18nStub("en-US")), "");
});
