import test from "node:test";
import assert from "node:assert/strict";

import { createFakePremiere } from "../../../packages/test-fixtures/src/fake-premierepro.mjs";
import { createPremiereAdapter } from "../dist/host/src/adapter.js";
import { contextRead, selfTest } from "../dist/host/src/commands.js";
import { withTransaction } from "../dist/host/src/transaction.js";

function makeAdapter(fakeOptions = {}) {
  const premiere = createFakePremiere(fakeOptions);
  const warnings = [];
  const adapter = createPremiereAdapter({
    premiere,
    logger: { warn: (message, details) => warnings.push({ message, details }) },
    now: () => 1_700_000_000_000
  });

  adapter.register("pr.context.read", contextRead);
  adapter.register("pr.diagnostics.selfTest", selfTest);

  return { adapter, premiere, warnings };
}

function requestFor(command, overrides = {}) {
  return {
    protocolVersion: 1,
    requestId: "req-1",
    command,
    args: {},
    context: { host: "premiere-pro", hostVersion: "25.6.0", locale: "pt-BR" },
    ...overrides
  };
}

test("pr.context.read devolve projeto, sequencia e contagem de trilhas", async () => {
  const { adapter } = makeAdapter();
  const response = await adapter.dispatch(requestFor("pr.context.read"));

  assert.equal(response.ok, true);
  assert.equal(response.protocolVersion, 1);
  assert.equal(response.requestId, "req-1");
  assert.equal(response.data.hasProject, true);
  assert.equal(response.data.projectName, "MeuProjeto.prproj");
  assert.equal(response.data.sequenceName, "Sequência 01");
  assert.equal(response.data.sequenceCount, 3);
  assert.equal(response.data.videoTrackCount, 4);
  assert.equal(response.data.audioTrackCount, 2);
});

test("sem projeto aberto, pr.context.read responde ok com hasProject false", async () => {
  // Ausência de projeto não é erro para uma leitura de contexto: é o contexto.
  // Devolver falha aqui obrigaria o painel a tratar um estado normal como
  // excepcional.
  const { adapter } = makeAdapter({ hasProject: false });
  const response = await adapter.dispatch(requestFor("pr.context.read"));

  assert.equal(response.ok, true);
  assert.equal(response.data.hasProject, false);
  assert.equal(response.data.projectName, null);
});

test("sem sequencia ativa, as contagens vem nulas em vez de zero", async () => {
  // Zero trilhas e "não há sequência" são coisas diferentes, e a interface
  // precisa poder distingui-las.
  const { adapter } = makeAdapter({ hasActiveSequence: false });
  const response = await adapter.dispatch(requestFor("pr.context.read"));

  assert.equal(response.ok, true);
  assert.equal(response.data.sequenceName, null);
  assert.equal(response.data.videoTrackCount, null);
  assert.equal(response.data.audioTrackCount, null);
});

test("o autoteste detecta a ausencia da API de transacao por simbolo", async () => {
  // Sondagem por símbolo, não por versão: a §9 proíbe depender apenas de
  // comparar hostVersion.
  const { adapter } = makeAdapter({ omitTransactionApi: true });
  const response = await adapter.dispatch(requestFor("pr.diagnostics.selfTest"));

  assert.equal(response.ok, true);

  const transactionCheck = response.data.checks.find((c) => c.name === "project.transactionApi");
  assert.equal(transactionCheck.ok, false);
  assert.match(transactionCheck.detail, /25\.6/);

  assert.ok(
    response.warnings.some((w) => w.code === "SELF_TEST_CHECK_FAILED"),
    "Uma verificação reprovada precisa aparecer como aviso."
  );
});

test("o autoteste passa quando a API de transacao esta presente", async () => {
  const { adapter } = makeAdapter();
  const response = await adapter.dispatch(requestFor("pr.diagnostics.selfTest"));

  assert.equal(response.ok, true);
  assert.equal(response.data.passed, response.data.total);
  assert.deepEqual(response.warnings, []);
});

test("versao de protocolo diferente e recusada sem tocar no projeto", async () => {
  const { adapter, premiere } = makeAdapter();
  const response = await adapter.dispatch(requestFor("pr.context.read", { protocolVersion: 2 }));

  assert.equal(response.ok, false);
  assert.equal(response.error.code, "INTERNAL_ERROR");
  assert.equal(response.error.details.received, 2);
  assert.deepEqual(premiere.calls, [], "Nada pode ser lido do projeto com protocolo incompatível.");
});

test("comando de outro host e recusado", async () => {
  // ae.context.read existe no catálogo, mas não neste host. Aceitá-lo produziria
  // um erro confuso lá na frente em vez de uma recusa clara aqui.
  const { adapter } = makeAdapter();
  const response = await adapter.dispatch(requestFor("ae.context.read"));

  assert.equal(response.ok, false);
  assert.equal(response.error.code, "INTERNAL_ERROR");
  assert.match(response.error.message, /desconhecido neste host/);
});

test("descriptor sem implementacao e reportado como defeito de build", async () => {
  const premiere = createFakePremiere();
  const adapter = createPremiereAdapter({ premiere, logger: { warn: () => {} } });
  // Não registra nada.
  const response = await adapter.dispatch(requestFor("pr.context.read"));

  assert.equal(response.ok, false);
  assert.match(response.error.message, /não implementado/);
});

test("o registro recusa id duplicado", () => {
  const { adapter } = makeAdapter();
  assert.throws(() => adapter.register("pr.context.read", contextRead), /já registrado/);
});

test("excecao dentro do handler vira erro tipado, nao vaza", async () => {
  const premiere = createFakePremiere();
  const warnings = [];
  const adapter = createPremiereAdapter({
    premiere,
    logger: { warn: (m, d) => warnings.push({ m, d }) }
  });

  adapter.register("pr.context.read", {
    async preflight() {
      return null;
    },
    async run() {
      throw new Error("falha simulada no host");
    }
  });

  const response = await adapter.dispatch(requestFor("pr.context.read"));

  assert.equal(response.ok, false);
  assert.equal(response.error.code, "HOST_OPERATION_FAILED");
  assert.match(response.error.message, /falha simulada/);
  assert.equal(warnings.length, 1);
});

test("todo erro traz recoverable e chave de acao corretiva", async () => {
  // A §8 exige ação corretiva em todo erro. Sem ela o usuário fica sabendo que
  // falhou e não o que fazer.
  const { adapter } = makeAdapter();
  const response = await adapter.dispatch(requestFor("pr.nao.existe"));

  assert.equal(typeof response.error.recoverable, "boolean");
  assert.match(response.error.action, /^error\.action\./);
});

// ---------------------------------------------------------------------------
// Fronteira de transação
// ---------------------------------------------------------------------------

test("withTransaction abre a trava ANTES da transacao, e a transacao acontece dentro", () => {
  // A garantia central. Um teste que só contasse chamadas passaria com as duas
  // invertidas, e invertidas não há trava nenhuma protegendo a escrita.
  const premiere = createFakePremiere();

  withTransaction(premiere.project, "Rótulo de teste", (compound) => {
    compound.addAction({});
  });

  assert.deepEqual(premiere.calls, [
    "lockedAccess:enter",
    "executeTransaction:enter",
    "addAction",
    "executeTransaction:exit",
    "lockedAccess:exit"
  ]);
});

test("withTransaction repassa o rotulo de Undo", () => {
  const premiere = createFakePremiere();
  withTransaction(premiere.project, "Moti.on: rótulo em português", (compound) => {
    compound.addAction({});
  });

  assert.deepEqual(premiere.undoLabels, ["Moti.on: rótulo em português"]);
});

test("withTransaction reporta transacao vazia", () => {
  // `compound.empty` é o sinal do próprio host de que nada foi acumulado — mais
  // forte do que a palavra do comando, que é tudo o que existe no After Effects.
  const premiere = createFakePremiere();
  const outcome = withTransaction(premiere.project, "Rótulo", () => {
    // Não acumula nada.
  });

  assert.equal(outcome.empty, true);
  assert.equal(outcome.executed, true);
});

test("withTransaction reporta transacao nao executada", () => {
  const premiere = createFakePremiere({ transactionSucceeds: false });
  const outcome = withTransaction(premiere.project, "Rótulo", (compound) => {
    compound.addAction({});
  });

  assert.equal(outcome.executed, false);
  assert.equal(outcome.empty, false);
});

test("withTransaction nao retem referencia de Action nem de CompoundAction", () => {
  // A §10 exige isso, e a Adobe tem regra de lint própria para o mesmo. Um
  // CompoundAction que sobrevive à trava não tem validade garantida.
  const premiere = createFakePremiere();
  let captured = null;

  const outcome = withTransaction(premiere.project, "Rótulo", (compound) => {
    captured = compound;
    compound.addAction({});
  });

  assert.deepEqual(Object.keys(outcome).sort(), ["empty", "executed"]);
  for (const value of Object.values(outcome)) {
    assert.notEqual(value, captured, "O resultado não pode devolver o CompoundAction.");
    assert.equal(typeof value, "boolean");
  }
});

test("a trava fecha mesmo quando o build lanca", () => {
  // Sem o finally no duplo — e sem o comportamento equivalente no host real — a
  // trava ficaria presa e o projeto do usuário travaria junto.
  const premiere = createFakePremiere();

  assert.throws(() => {
    withTransaction(premiere.project, "Rótulo", () => {
      throw new Error("falha ao montar as ações");
    });
  }, /falha ao montar/);

  assert.equal(premiere.calls[premiere.calls.length - 1], "lockedAccess:exit");
});
