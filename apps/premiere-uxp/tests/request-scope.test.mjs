import test from "node:test";
import assert from "node:assert/strict";

async function createScope() {
  const { createPanelRequestScope } = await import("../dist/client/src/request-scope.js");
  return createPanelRequestScope();
}

test("begin aceita somente uma requisicao corrente por vez", async () => {
  const scope = await createScope();
  const ticket = scope.begin();

  assert.notEqual(ticket, null);
  assert.equal(scope.isCurrent(ticket), true);
  assert.equal(scope.begin(), null);
  assert.equal(scope.begin(), null);
  assert.equal(scope.isCurrent(ticket), true);
});

test("finish libera somente o ticket corrente e nao libera outra requisicao", async () => {
  const scope = await createScope();
  const first = scope.begin();

  assert.equal(scope.finish(first), true);
  assert.equal(scope.isCurrent(first), false);
  assert.equal(scope.finish(first), false);

  const second = scope.begin();
  assert.notEqual(second, null);
  assert.notEqual(second, first);
  assert.equal(scope.finish(first), false);
  assert.equal(scope.isCurrent(second), true);
  assert.equal(scope.begin(), null);
  assert.equal(scope.finish(second), true);
});

test("invalidate permite novo begin sem deixar finish antigo liberar o novo ticket", async () => {
  const scope = await createScope();
  const oldTicket = scope.begin();

  scope.invalidate();
  assert.equal(scope.isCurrent(oldTicket), false);
  const newTicket = scope.begin();

  assert.notEqual(newTicket, null);
  assert.notEqual(newTicket, oldTicket);
  assert.equal(scope.finish(oldTicket), false);
  assert.equal(scope.isCurrent(newTicket), true);
  assert.equal(scope.begin(), null);
  assert.equal(scope.finish(newTicket), true);
});

test("invalidate e idempotente e tickets antigos nunca voltam a ser correntes", async () => {
  const scope = await createScope();
  const oldTickets = [];

  scope.invalidate();
  scope.invalidate();
  for (let cycle = 0; cycle < 3; cycle += 1) {
    const ticket = scope.begin();
    assert.notEqual(ticket, null);
    oldTickets.push(ticket);
    scope.invalidate();
    scope.invalidate();
  }

  const current = scope.begin();
  for (const oldTicket of oldTickets) {
    assert.equal(scope.isCurrent(oldTicket), false);
    assert.equal(scope.finish(oldTicket), false);
  }
  assert.equal(scope.isCurrent(current), true);
});

test("dispose invalida ticket pendente e nao permite reativacao por invalidate ou finish", async () => {
  const scope = await createScope();
  const ticket = scope.begin();

  scope.dispose();
  assert.equal(scope.isCurrent(ticket), false);
  assert.equal(scope.finish(ticket), false);
  assert.equal(scope.begin(), null);

  scope.dispose();
  scope.invalidate();
  scope.dispose();
  assert.equal(scope.finish(ticket), false);
  assert.equal(scope.begin(), null);
});

test("dispose sem requisicao tambem e permanente e idempotente", async () => {
  const scope = await createScope();

  scope.dispose();
  scope.dispose();
  scope.invalidate();

  assert.equal(scope.begin(), null);
  assert.equal(scope.isCurrent(null), false);
  assert.equal(scope.finish(null), false);
});

test("instancias simultaneas nao aceitam nem finalizam tickets uma da outra", async () => {
  const firstScope = await createScope();
  const secondScope = await createScope();
  const first = firstScope.begin();
  const second = secondScope.begin();

  assert.notEqual(first, second);
  assert.equal(firstScope.isCurrent(second), false);
  assert.equal(secondScope.isCurrent(first), false);
  assert.equal(firstScope.finish(second), false);
  assert.equal(secondScope.finish(first), false);
  assert.equal(firstScope.isCurrent(first), true);
  assert.equal(secondScope.isCurrent(second), true);

  firstScope.invalidate();
  firstScope.dispose();
  assert.equal(secondScope.isCurrent(second), true);
  assert.equal(secondScope.finish(second), true);
});

test("remount cria escopo independente sem colisao com ticket do painel destruido", async () => {
  const destroyedScope = await createScope();
  const destroyedTicket = destroyedScope.begin();
  destroyedScope.dispose();

  const remountedScope = await createScope();
  const remountedTicket = remountedScope.begin();

  assert.notEqual(remountedTicket, destroyedTicket);
  assert.equal(remountedScope.isCurrent(destroyedTicket), false);
  assert.equal(remountedScope.finish(destroyedTicket), false);
  assert.equal(destroyedScope.isCurrent(remountedTicket), false);
  assert.equal(destroyedScope.finish(remountedTicket), false);
  assert.equal(destroyedScope.begin(), null);
  assert.equal(remountedScope.isCurrent(remountedTicket), true);
});

test("valores que nao sao tickets nao sao correntes nem liberam requisicoes", async () => {
  const scope = await createScope();
  const invalidTickets = [null, undefined, {}, 0, "ticket", Symbol("ticket")];

  for (const invalidTicket of invalidTickets) {
    assert.equal(scope.isCurrent(invalidTicket), false);
    assert.equal(scope.finish(invalidTicket), false);
  }

  const current = scope.begin();
  for (const invalidTicket of invalidTickets) {
    assert.equal(scope.isCurrent(invalidTicket), false);
    assert.equal(scope.finish(invalidTicket), false);
  }
  assert.equal(scope.isCurrent(current), true);
});

test("resposta invalidada conclui sua promise sem publicar nem liberar a nova requisicao", async () => {
  const scope = await createScope();
  const oldTicket = scope.begin();
  let resolveHost;
  let hostCompleted = false;
  const published = [];
  const hostPromise = new Promise((resolve) => { resolveHost = resolve; });
  const oldRequest = (async () => {
    try {
      const result = await hostPromise;
      hostCompleted = true;
      if (scope.isCurrent(oldTicket)) published.push(result);
    } finally {
      scope.finish(oldTicket);
    }
  })();

  scope.invalidate();
  const newTicket = scope.begin();
  resolveHost("old response");
  await oldRequest;

  assert.equal(hostCompleted, true);
  assert.deepEqual(published, []);
  assert.equal(scope.isCurrent(newTicket), true);
  assert.equal(scope.begin(), null);
});

test("falha pendente depois de dispose nao reativa o escopo no finally", async () => {
  const scope = await createScope();
  const ticket = scope.begin();
  let rejectHost;
  const hostPromise = new Promise((_resolve, reject) => { rejectHost = reject; });
  let publishedError = false;
  const request = (async () => {
    try {
      await hostPromise;
    } catch {
      publishedError = scope.isCurrent(ticket);
    } finally {
      scope.finish(ticket);
    }
  })();

  scope.dispose();
  rejectHost(new Error("host operation failed"));
  await request;

  assert.equal(publishedError, false);
  assert.equal(scope.begin(), null);
  scope.invalidate();
  assert.equal(scope.begin(), null);
});
