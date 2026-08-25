import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";

import * as contracts from "../../../packages/contracts/dist/index.js";
import * as commandRegistry from "../../../packages/command-registry/dist/index.js";

const { MAX_INLINE_CHARS, decodeFromHost } = contracts;

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const adapterEntry = path.resolve(testDirectory, "../client/src/host-adapter.ts");

const adapterSource = fs.readFileSync(adapterEntry, "utf8");
const compiledAdapter = ts.transpileModule(adapterSource, {
  fileName: adapterEntry,
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
    esModuleInterop: true
  },
  reportDiagnostics: true
});

assert.deepEqual(
  compiledAdapter.diagnostics ?? [],
  [],
  "O teste precisa conseguir transpilar o adapter real."
);

const adapterModule = { exports: {} };
const loadDependency = (specifier) => {
  if (specifier === "@motion/contracts") return contracts;
  if (specifier === "@motion/command-registry") return commandRegistry;
  throw new Error(`Dependência inesperada no adapter: ${specifier}`);
};

const executeAdapterModule = new Function(
  "require",
  "module",
  "exports",
  compiledAdapter.outputText
);
executeAdapterModule(loadDependency, adapterModule, adapterModule.exports);

const { createAeHostAdapter } = adapterModule.exports;

const CEP_EVAL_FAILURE = "EvalScript error.";
const DISPATCH_PREFIX = 'MotionAE.dispatch("';

function requestFromDispatch(script) {
  assert.ok(script.startsWith(DISPATCH_PREFIX), `Chamada inesperada: ${script.slice(0, 80)}`);
  assert.ok(script.endsWith('")'));

  const encoded = script.slice(DISPATCH_PREFIX.length, -2);
  return JSON.parse(decodeFromHost(encoded));
}

function successFor(request, data = {}) {
  return JSON.stringify({
    protocolVersion: 1,
    requestId: request.requestId,
    ok: true,
    data,
    warnings: [],
    error: null,
    timing: { startedAt: "2026-08-25T12:00:00.000Z", durationMs: 1 }
  });
}

function readyValueFor(script) {
  return script.includes(".dispatch") ? "function" : "object";
}

function installFakeCep(respond) {
  const previousCsInterface = globalThis.CSInterface;
  const previousSystemPath = globalThis.SystemPath;
  const scripts = [];

  class FakeCsInterface {
    evalScript(script, callback) {
      scripts.push(script);
      respond(script, callback, scripts);
    }

    getHostEnvironment() {
      return { appVersion: "26.3", appUILocale: "pt-BR" };
    }

    getSystemPath(pathType) {
      assert.equal(pathType, "extension");
      return "C:/Users/test/AppData/Roaming/Adobe/CEP/extensions/com.motion.plugin";
    }
  }

  globalThis.CSInterface = FakeCsInterface;
  globalThis.SystemPath = { EXTENSION: "extension" };

  return {
    scripts,
    restore() {
      if (previousCsInterface === undefined) delete globalThis.CSInterface;
      else globalThis.CSInterface = previousCsInterface;

      if (previousSystemPath === undefined) delete globalThis.SystemPath;
      else globalThis.SystemPath = previousSystemPath;
    }
  };
}

function createLogger() {
  const warnings = [];
  return {
    warnings,
    logger: {
      warn(message, details) {
        warnings.push({ message, details });
      }
    }
  };
}

test("cada adapter avalia o host atual antes do primeiro comando mesmo com dispatcher persistente", async () => {
  const fake = installFakeCep((script, callback) => {
    if (script.startsWith(DISPATCH_PREFIX)) {
      callback(successFor(requestFromDispatch(script), { source: "host" }));
      return;
    }

    callback("function");
  });

  try {
    const { logger } = createLogger();
    const firstAdapter = createAeHostAdapter(logger);
    assert.ok(firstAdapter);

    const firstResponse = await firstAdapter.client.execute("ae.context.read");
    assert.equal(firstResponse.ok, true);

    // O global do primeiro adapter continua disponível, mas não prova que o
    // arquivo instalado ainda é o mesmo. A nova instância precisa avaliá-lo.
    const secondAdapter = createAeHostAdapter(logger);
    assert.ok(secondAdapter);

    const secondResponse = await secondAdapter.client.execute("ae.context.read");

    assert.equal(secondResponse.ok, true);
    assert.ok(fake.scripts[0].includes("$.evalFile"));
    assert.equal(fake.scripts.filter((script) => script.includes("$.evalFile")).length, 2);
    assert.equal(fake.scripts.filter((script) => script.startsWith(DISPATCH_PREFIX)).length, 2);
  } finally {
    fake.restore();
  }
});

test("comandos concorrentes compartilham um único bootstrap e preservam a fila", async () => {
  let finishBootstrap;
  const fake = installFakeCep((script, callback) => {
    if (script.includes("$.evalFile")) {
      assert.equal(finishBootstrap, undefined, "não pode iniciar um segundo bootstrap concorrente");
      finishBootstrap = callback;
      return;
    }

    callback(successFor(requestFromDispatch(script), { command: requestFromDispatch(script).command }));
  });

  try {
    const { logger } = createLogger();
    const adapter = createAeHostAdapter(logger);
    assert.ok(adapter);

    const first = adapter.client.execute("ae.context.read");
    const second = adapter.client.execute("ae.diagnostics.echo", { payload: "fila" });

    assert.equal(fake.scripts.length, 1, "os dois pedidos devem aguardar o mesmo $.evalFile");
    assert.ok(fake.scripts[0].includes("$.evalFile"));

    finishBootstrap("function");
    const [firstResponse, secondResponse] = await Promise.all([first, second]);

    assert.equal(firstResponse.ok, true);
    assert.equal(secondResponse.ok, true);
    assert.equal(fake.scripts.filter((script) => script.includes("$.evalFile")).length, 1);
    assert.deepEqual(
      fake.scripts.filter((script) => script.startsWith(DISPATCH_PREFIX)).map((script) => requestFromDispatch(script).command),
      ["ae.context.read", "ae.diagnostics.echo"]
    );
  } finally {
    fake.restore();
  }
});

test("pedido concorrente entra na fila do reload quando o engine é perdido", async () => {
  let bootstrapCount = 0;
  let dispatchCount = 0;
  let finishReload;
  const fake = installFakeCep((script, callback) => {
    if (script.includes("$.evalFile")) {
      bootstrapCount += 1;
      if (bootstrapCount === 1) callback("function");
      else finishReload = callback;
      return;
    }

    dispatchCount += 1;
    if (dispatchCount === 1) callback(CEP_EVAL_FAILURE);
    else callback(successFor(requestFromDispatch(script), { recovered: true }));
  });

  try {
    const { logger } = createLogger();
    const adapter = createAeHostAdapter(logger);
    assert.ok(adapter);

    const interrupted = adapter.client.execute("ae.context.read");
    const queued = adapter.client.execute("ae.diagnostics.echo", { payload: "depois" });

    assert.equal(bootstrapCount, 2, "deve existir um bootstrap inicial e um único reload");
    assert.equal(dispatchCount, 1, "o segundo pedido aguarda o reload em andamento");

    finishReload("function");
    const [interruptedResponse, queuedResponse] = await Promise.all([interrupted, queued]);

    assert.equal(interruptedResponse.ok, true);
    assert.equal(queuedResponse.ok, true);
    assert.equal(bootstrapCount, 2);
    assert.equal(dispatchCount, 3, "somente a leitura interrompida é repetida");
  } finally {
    fake.restore();
  }
});

test("falha CEP de comando mutante recarrega o engine sem reenviar a mutação", async () => {
  let dispatchCount = 0;
  const fake = installFakeCep((script, callback) => {
    if (script.startsWith(DISPATCH_PREFIX)) {
      dispatchCount += 1;
      if (dispatchCount === 1) callback(CEP_EVAL_FAILURE);
      else callback(successFor(requestFromDispatch(script), { replayed: true }));
      return;
    }

    callback(readyValueFor(script));
  });

  try {
    const { logger } = createLogger();
    const adapter = createAeHostAdapter(logger);
    assert.ok(adapter);

    const response = await adapter.client.execute("ae.demo.createComposition");

    assert.equal(response.ok, false);
    assert.equal(response.error?.code, "HOST_OPERATION_FAILED");
    assert.equal(response.error?.action, "error.action.checkUndoHistory");
    assert.equal(response.error?.details?.reason, "CEP_EVAL_FAILURE");
    assert.equal(response.error?.details?.mayHaveMutated, true);
    assert.equal(response.error?.details?.hostReloaded, true);
    assert.equal(dispatchCount, 1, "um resultado ambíguo nunca autoriza replay de mutação");
    assert.equal(
      fake.scripts.filter((script) => script.includes("$.evalFile")).length,
      2,
      "um bootstrap inicial e um reload após a perda do engine"
    );

    const nextResponse = await adapter.client.execute("ae.context.read");
    assert.equal(nextResponse.ok, true, "o reload deixa o adapter pronto para o próximo comando");
    assert.equal(dispatchCount, 2);
    assert.equal(fake.scripts.filter((script) => script.includes("$.evalFile")).length, 2);
  } finally {
    fake.restore();
  }
});

test("falha do reload não apaga a ambiguidade de uma mutação já enviada", async () => {
  let bootstrapCount = 0;
  let dispatchCount = 0;
  const fake = installFakeCep((script, callback) => {
    if (script.includes("$.evalFile")) {
      bootstrapCount += 1;
      callback(bootstrapCount === 1 ? "function" : "bootstrap-failed");
      return;
    }

    dispatchCount += 1;
    callback(CEP_EVAL_FAILURE);
  });

  try {
    const { logger } = createLogger();
    const adapter = createAeHostAdapter(logger);
    assert.ok(adapter);

    const response = await adapter.client.execute("ae.demo.createComposition");

    assert.equal(response.ok, false);
    assert.equal(response.error?.code, "HOST_OPERATION_FAILED");
    assert.equal(response.error?.action, "error.action.checkUndoHistory");
    assert.equal(response.error?.details?.mayHaveMutated, true);
    assert.equal(response.error?.details?.hostReloaded, false);
    assert.equal(response.error?.details?.bootstrapResult, "BOOTSTRAP_FAILED");
    assert.equal(dispatchCount, 1, "falhar ao recarregar nunca autoriza repetir a mutação");
  } finally {
    fake.restore();
  }
});

test("falha CEP de comando read-only permite exatamente um retry após bootstrap", async () => {
  let dispatchCount = 0;
  const fake = installFakeCep((script, callback) => {
    if (script.startsWith(DISPATCH_PREFIX)) {
      dispatchCount += 1;
      if (dispatchCount === 1) callback(CEP_EVAL_FAILURE);
      else callback(successFor(requestFromDispatch(script), { retried: true }));
      return;
    }

    callback(readyValueFor(script));
  });

  try {
    const { logger } = createLogger();
    const adapter = createAeHostAdapter(logger);
    assert.ok(adapter);

    const response = await adapter.client.execute("ae.context.read");

    assert.equal(response.ok, true);
    assert.deepEqual(response.data, { retried: true });
    assert.equal(dispatchCount, 2);
    assert.equal(fake.scripts.filter((script) => script.includes("$.evalFile")).length, 2);
  } finally {
    fake.restore();
  }
});

test("segunda falha CEP de read-only encerra tipada sem sugerir Undo", async () => {
  let dispatchCount = 0;
  const fake = installFakeCep((script, callback) => {
    if (script.startsWith(DISPATCH_PREFIX)) {
      dispatchCount += 1;
      callback(CEP_EVAL_FAILURE);
      return;
    }

    callback(readyValueFor(script));
  });

  try {
    const { logger } = createLogger();
    const adapter = createAeHostAdapter(logger);
    assert.ok(adapter);

    const response = await adapter.client.execute("ae.context.read");

    assert.equal(response.ok, false);
    assert.equal(response.error?.code, "INTERNAL_ERROR");
    assert.equal(response.error?.action, "error.action.exportLogBundle");
    assert.equal(response.error?.details?.reason, "CEP_EVAL_FAILURE");
    assert.equal(response.error?.details?.mayHaveMutated, false);
    assert.equal(response.error?.details?.retryAttempted, true);
    assert.equal(dispatchCount, 2);
    assert.equal(fake.scripts.filter((script) => script.includes("$.evalFile")).length, 2);
  } finally {
    fake.restore();
  }
});

test("request acima do limite falha tipado sem chamar evalScript", async () => {
  const fake = installFakeCep((script, callback) => {
    if (script.startsWith(DISPATCH_PREFIX)) {
      callback(successFor(requestFromDispatch(script), { shouldNotRun: true }));
      return;
    }
    callback(readyValueFor(script));
  });

  try {
    const { logger } = createLogger();
    const adapter = createAeHostAdapter(logger);
    assert.ok(adapter);

    const response = await adapter.client.execute("ae.diagnostics.echo", {
      payload: "x".repeat(MAX_INLINE_CHARS + 1)
    });

    assert.equal(response.ok, false);
    assert.equal(response.error?.code, "INTERNAL_ERROR");
    assert.equal(response.error?.action, "error.action.exportLogBundle");
    assert.equal(response.error?.details?.reason, "INLINE_PAYLOAD_TOO_LARGE");
    assert.equal(response.error?.details?.maxInlineChars, MAX_INLINE_CHARS);
    assert.equal(fake.scripts.length, 0, "payload já recusado não deve iniciar bootstrap nem despacho");
  } finally {
    fake.restore();
  }
});

test("bootstrap que não instala dispatcher devolve falha tipada sem esperar timeout", async () => {
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  const fakeTimers = new Map();
  let nextTimer = 1;

  globalThis.setTimeout = (handler, milliseconds) => {
    const id = nextTimer;
    nextTimer += 1;
    fakeTimers.set(id, { handler, milliseconds });
    return id;
  };
  globalThis.clearTimeout = (id) => {
    fakeTimers.delete(id);
  };

  const fake = installFakeCep((script, callback) => {
    if (script.includes("$.evalFile")) callback("bootstrap-failed");
    else callback("undefined");
  });

  try {
    const { logger } = createLogger();
    const adapter = createAeHostAdapter(logger);
    assert.ok(adapter);

    const promise = adapter.client.execute("ae.context.read");
    let response;
    void promise.then((value) => {
      response = value;
    });
    await Promise.resolve();

    assert.ok(response, "a falha de bootstrap deve resolver o pedido imediatamente");
    assert.equal(response.ok, false);
    assert.equal(response.error?.code, "INTERNAL_ERROR");
    assert.equal(response.error?.action, "error.action.exportLogBundle");
    assert.equal(response.error?.details?.reason, "HOST_BOOTSTRAP_FAILED");
    assert.equal(adapter.client.pendingCount(), 0);
    assert.equal(fakeTimers.size, 0, "a resposta tipada precisa cancelar o timeout do CommandClient");
  } finally {
    fake.restore();
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }
});
