import test from "node:test";
import assert from "node:assert/strict";

import { createLogger } from "../dist/logger.js";

function relogioFixo(inicio) {
  let agora = inicio;
  return {
    now: () => agora,
    avancar: (ms) => {
      agora += ms;
    }
  };
}

/** Resposta no formato do contrato v1, para exercitar recordResponse. */
function resposta(overrides = {}) {
  return {
    protocolVersion: 1,
    requestId: "req-1",
    ok: true,
    data: null,
    warnings: [],
    error: null,
    timing: { startedAt: "2026-08-25T01:00:00.000Z", durationMs: 12 },
    ...overrides
  };
}

test("a entrada tem exatamente os campos exigidos pela §26", () => {
  // Arrange
  const relogio = relogioFixo(Date.UTC(2026, 7, 24, 12, 0, 0));
  const logger = createLogger({
    host: "after-effects",
    hostVersion: "26.3",
    clock: relogio.now,
    idFactory: () => "id-fixo"
  });

  // Act
  const entry = logger.info("ae.context.read", { command: "ae.context.read", durationMs: 42 });

  // Assert
  assert.deepEqual(Object.keys(entry).sort(), [
    "command", "durationMs", "errorCode", "host", "hostVersion",
    "level", "message", "requestId", "result", "timestamp"
  ]);
  assert.equal(entry.timestamp, "2026-08-24T12:00:00.000Z");
  assert.equal(entry.requestId, "id-fixo");
  assert.equal(entry.host, "after-effects");
  assert.equal(entry.durationMs, 42);
  assert.equal(entry.result, "success");
});

test("redige na escrita, e nao na exportacao", () => {
  // Se o valor cru fosse guardado e limpo so ao exportar, ele existiria em
  // memoria a sessao inteira e apareceria em qualquer dump.
  const logger = createLogger({ host: "after-effects" });

  logger.error("falha ao salvar em C:\\Users\\rael\\projeto.aep", {
    errorCode: "AE_UNKNOWN",
    data: { projectName: "Campanha" }
  });

  const armazenada = logger.entries()[0];

  assert.ok(!armazenada.message.includes("rael"));
  assert.equal(armazenada.data.projectName, "«redigido» (8 caracteres)");
  assert.equal(armazenada.result, "failure");
});

test("recordResponse aproveita o requestId e o tempo que o contrato ja traz", () => {
  // Arrange: a correlacao e do CommandClient. Duplicar isso no logger criaria
  // dois ids para o mesmo comando.
  const logger = createLogger({ host: "after-effects" });

  // Act
  const entry = logger.recordResponse("ae.context.read", resposta({ requestId: "req-abc" }));

  // Assert
  assert.equal(entry.requestId, "req-abc");
  assert.equal(entry.durationMs, 12);
  assert.equal(entry.command, "ae.context.read");
  assert.equal(entry.level, "info");
  assert.equal(entry.result, "success");
});

test("resposta com erro guarda so metadata segura, nunca a mensagem arbitraria do host", () => {
  const logger = createLogger({ host: "after-effects" });

  const entry = logger.recordResponse(
    "ae.demo.createComposition",
    resposta({
      ok: false,
      error: {
        code: "AE_UNKNOWN",
        message: "Layer Campanha Cliente Ultra Secreta esta bloqueada",
        recoverable: true
      }
    })
  );

  assert.equal(entry.level, "error");
  assert.equal(entry.result, "failure");
  assert.equal(entry.errorCode, "AE_UNKNOWN");
  assert.equal(entry.message, "ae.demo.createComposition");
  assert.ok(!JSON.stringify(logger.exportBundle()).includes("Campanha Cliente"));
});

test("payload de resposta do host nao entra nem em modo debug", () => {
  // Redaction por nome de campo nunca consegue reconhecer todo formato futuro.
  // A fronteira segura e registrar somente metadata do envelope.
  const logger = createLogger({ host: "after-effects" });
  const comDados = resposta({ data: { arbitraryName: "Cliente Confidencial", compWidth: 1920 } });

  const semDebug = logger.recordResponse("ae.context.read", comDados);
  logger.enableDebugMode();
  const comDebug = logger.recordResponse("ae.context.read", comDados);

  assert.equal(semDebug.data, undefined);
  assert.equal(comDebug.data, undefined);
  assert.ok(!JSON.stringify(logger.exportBundle()).includes("Cliente Confidencial"));
});

test("warn satisfaz o contrato do CommandClientLogger e redige os detalhes", () => {
  // O cliente de comandos chama warn(message, details) para resposta descartada
  // e timeout; details pode conter trecho cru da resposta do host.
  const logger = createLogger({ host: "after-effects" });

  logger.warn("Resposta descartada: requestId desconhecido.", {
    raw: "erro em C:\\Users\\rael\\projeto.aep"
  });

  const entry = logger.entries()[0];

  assert.equal(entry.level, "warn");
  assert.ok(!entry.data.raw.includes("rael"));
});

test("rotaciona por contagem descartando as entradas mais antigas", () => {
  const logger = createLogger({ host: "after-effects", maxEntries: 3 });

  for (let i = 0; i < 5; i += 1) {
    logger.info(`comando.${i}`, { command: `comando.${i}` });
  }

  const entries = logger.entries();

  assert.equal(entries.length, 3);
  assert.equal(entries[0].command, "comando.2");
  assert.equal(logger.size().dropped, 2);
});

test("rotaciona por bytes, porque contagem sozinha nao protege memoria", () => {
  // Uma unica entrada com payload grande pesa mais que centenas de linhas curtas.
  const logger = createLogger({ host: "after-effects", maxEntries: 1000, maxBytes: 400 });

  for (let i = 0; i < 20; i += 1) {
    logger.info(`comando.${i}`, { command: `comando.${i}` });
  }

  assert.ok(logger.size().bytes <= 400, `bytes retidos: ${logger.size().bytes}`);
  assert.ok(logger.size().dropped > 0);
});

test("uma unica entrada enorme e truncada para respeitar maxBytes", () => {
  const logger = createLogger({
    host: "after-effects",
    maxBytes: 400,
    clock: () => Date.UTC(2026, 7, 24, 12, 0, 0),
    idFactory: () => "id-fixo"
  });
  const conteudoPrivado = "Cliente Ultra Secreto ".repeat(1000);

  const entry = logger.info(conteudoPrivado, {
    command: "ae.context.read",
    data: { details: conteudoPrivado }
  });

  assert.ok(entry);
  assert.match(entry.message, /entrada truncada/);
  assert.equal(entry.data, undefined);
  assert.ok(logger.size().bytes <= 400, `bytes retidos: ${logger.size().bytes}`);
  assert.equal(logger.size().entries, 1);
  assert.ok(!JSON.stringify(logger.exportBundle()).includes("Cliente Ultra Secreto"));
});

test("entrada e descartada quando nem a metadata minima cabe no limite", () => {
  const logger = createLogger({ host: "after-effects", maxBytes: 1 });

  const entry = logger.info("conteudo que nao cabe");

  assert.equal(entry, null);
  assert.deepEqual(logger.size(), { entries: 0, bytes: 0, dropped: 1 });
});

test("limites invalidos falham cedo em vez de desativar a rotacao", () => {
  const invalidos = [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1];

  for (const valor of invalidos) {
    assert.throws(() => createLogger({ maxEntries: valor }), RangeError);
    assert.throws(() => createLogger({ maxBytes: valor }), RangeError);
  }
});

test("size mede bytes UTF-8 reais, inclusive acentos e pares substitutos", () => {
  const logger = createLogger({
    host: "after-effects",
    clock: () => Date.UTC(2026, 7, 24, 12, 0, 0),
    idFactory: () => "id-fixo"
  });

  const entry = logger.info("ação 🎬", { command: "ae.context.read" });
  const json = JSON.stringify(entry);

  assert.equal(logger.size().bytes, Buffer.byteLength(json, "utf8"));
  assert.ok(logger.size().bytes > json.length);
});

test("entrada de debug e descartada fora da janela, que expira sozinha", () => {
  // Arrange
  const relogio = relogioFixo(0);
  const logger = createLogger({ host: "after-effects", clock: relogio.now });

  // Act
  const antes = logger.debug("bootstrap", {});
  logger.enableDebugMode(1000);
  const durante = logger.debug("bootstrap", {});
  relogio.avancar(1001);
  const depois = logger.debug("bootstrap", {});

  // Assert
  assert.equal(antes, null, "ligado por padrao, debug expulsaria os erros na rotacao");
  assert.ok(durante);
  assert.equal(depois, null, "a janela precisa fechar sozinha");
  assert.equal(logger.isDebugMode(), false);
});

test("janela de debug exige duracao positiva e finita", () => {
  const logger = createLogger({ host: "after-effects" });

  for (const valor of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => logger.enableDebugMode(valor), RangeError);
  }

  assert.equal(logger.isDebugMode(), false);
});

test("clear informa quantas entradas saiu e zera a contabilidade", () => {
  const logger = createLogger({ host: "after-effects" });
  logger.info("a", {});
  logger.info("b", {});

  assert.equal(logger.clear(), 2);
  assert.deepEqual(logger.size(), { entries: 0, bytes: 0, dropped: 0 });
});

test("setHost preenche o host das entradas seguintes", () => {
  // O painel loga a inicializacao antes de saber a versao do host.
  const logger = createLogger({});

  const antes = logger.info("panel.started", {});
  logger.setHost("after-effects", "26.3x87");
  const depois = logger.info("ae.context.read", {});

  assert.equal(antes.host, "unknown");
  assert.equal(antes.hostVersion, null);
  assert.equal(depois.host, "after-effects");
  assert.equal(depois.hostVersion, "26.3x87");
});

test("bundle traz contagem, descartes e nenhum dado sensivel", () => {
  // Arrange
  const logger = createLogger({
    host: "after-effects",
    hostVersion: "26.3x87",
    pluginVersion: "0.1.0",
    maxEntries: 2
  });

  // Act
  logger.info("a", {});
  logger.warn("b");
  logger.error("erro em /Users/rael/take.mov", { errorCode: "AE_UNKNOWN" });
  const bundle = logger.exportBundle();

  // Assert
  assert.equal(bundle.schemaVersion, 1);
  assert.equal(bundle.pluginVersion, "0.1.0");
  assert.equal(bundle.hostVersion, "26.3x87");
  assert.equal(bundle.droppedEntries, 1);
  assert.equal(bundle.counts.error, 1);
  assert.ok(!JSON.stringify(bundle).includes("rael"));
});

test("entradas, snapshots e bundles sao profundamente imutaveis", () => {
  const logger = createLogger({ host: "after-effects" });
  const entry = logger.info("a", {
    data: { metadata: { flags: ["seguro"] } }
  });
  const snapshot = logger.entries();
  const bundle = logger.exportBundle();

  assert.ok(Object.isFrozen(entry));
  assert.ok(Object.isFrozen(entry.data));
  assert.ok(Object.isFrozen(entry.data.metadata));
  assert.ok(Object.isFrozen(entry.data.metadata.flags));
  assert.ok(Object.isFrozen(snapshot));
  assert.ok(Object.isFrozen(bundle));
  assert.ok(Object.isFrozen(bundle.counts));
  assert.ok(Object.isFrozen(bundle.entries));

  assert.throws(() => snapshot.push({ level: "error" }), TypeError);
  assert.throws(() => entry.data.metadata.flags.push("segredo"), TypeError);
  assert.throws(() => { bundle.counts.error = 99; }, TypeError);
  assert.equal(logger.entries().length, 1);
  assert.deepEqual(logger.entries()[0].data.metadata.flags, ["seguro"]);
});
