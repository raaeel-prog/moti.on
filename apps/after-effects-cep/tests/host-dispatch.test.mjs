import test from "node:test";
import assert from "node:assert/strict";

import { loadHostModules } from "./host-harness.mjs";

/**
 * Testes do dispatcher.
 *
 * O que esta coberto aqui e a ORDEM das etapas, que e a parte que protege o
 * projeto do usuario: validar antes de abrir o grupo de Undo, recusar operacao
 * destrutiva sem consentimento, e nunca responder ok: true quando nada mudou.
 *
 * O que NAO esta coberto, e nao pode estar: se `beginUndoGroup` realmente agrupa
 * dentro do After Effects. Isso e IMPLEMENTED_NOT_HOST_VERIFIED e esta em
 * docs/HOST_LIMITATIONS.md. Aqui se prova que a chamada acontece, uma vez, na
 * ordem certa, e que o par abre/fecha nunca desbalanceia.
 */

const HOST_MODULES = [
  "generated/motion-contracts.jsx",
  "generated/motion-descriptors.jsx",
  "src/json.jsx",
  "src/undo.jsx",
  "src/registry.jsx",
  "src/dispatch.jsx"
];

/**
 * Monta um After Effects falso com espioes nas chamadas que importam.
 */
function createFakeAe() {
  const calls = [];

  class FakeCompItem {
    constructor() {
      this.name = "Comp Falsa";
      this.width = 1920;
      this.height = 1080;
      this.duration = 5;
      this.frameRate = 30;
    }
  }

  const app = {
    version: "25.0x123",
    project: {
      file: { name: "Projeto.aep", fsName: "C:/x/Projeto.aep" },
      activeItem: null,
      items: {}
    },
    beginUndoGroup(label) {
      calls.push({ type: "beginUndoGroup", label });
    },
    endUndoGroup() {
      calls.push({ type: "endUndoGroup" });
    }
  };

  return { app, CompItem: FakeCompItem, calls };
}

async function loadDispatcher(register) {
  const fake = createFakeAe();
  const scope = await loadHostModules(HOST_MODULES, {
    app: fake.app,
    CompItem: fake.CompItem
  });

  if (register) register(scope);

  return { scope, ...fake };
}

function requestFor(command, overrides = {}) {
  return JSON.stringify({
    protocolVersion: 1,
    requestId: "req-1",
    command,
    args: {},
    context: { host: "after-effects", hostVersion: "25.0" },
    ...overrides
  });
}

test("preflight que falha nunca abre grupo de Undo", async () => {
  // A garantia central do desenho. Se a validacao acontecesse depois do
  // beginUndoGroup, um comando recusado ainda deixaria uma entrada vazia no
  // historico de Undo do usuario — e um comando que falhasse no meio deixaria o
  // projeto alterado pela metade.
  const { scope, calls } = await loadDispatcher((s) => {
    s.MotionRegistry.register("ae.demo.createComposition", {
      preflight: () => ({
        code: "NO_ACTIVE_PROJECT",
        message: "sem projeto",
        recoverable: true,
        details: null
      }),
      run: () => {
        throw new Error("run não deveria ter sido chamado");
      }
    });
  });

  const response = JSON.parse(scope.MotionAE.dispatch(requestFor("ae.demo.createComposition")));

  assert.equal(response.ok, false);
  assert.equal(response.error.code, "NO_ACTIVE_PROJECT");
  assert.deepEqual(calls, [], "Nenhuma chamada de Undo pode acontecer quando o preflight recusa.");
});

test("beginUndoGroup e endUndoGroup acontecem uma vez cada, mesmo quando run lanca", async () => {
  // Sem o finally, uma excecao deixaria o grupo de Undo ABERTO. As proximas
  // acoes do usuario, feitas a mao e sem relacao com o plugin, entrariam nesse
  // grupo, e o historico dele ficaria corrompido ate reiniciar o aplicativo.
  const { scope, calls } = await loadDispatcher((s) => {
    s.MotionRegistry.register("ae.demo.createComposition", {
      preflight: () => null,
      run: () => {
        throw new Error("falha simulada dentro do host");
      }
    });
  });

  const response = JSON.parse(scope.MotionAE.dispatch(requestFor("ae.demo.createComposition")));

  assert.equal(response.ok, false);
  assert.equal(response.error.code, "HOST_OPERATION_FAILED");
  assert.match(response.error.message, /falha simulada/);

  assert.equal(calls.filter((c) => c.type === "beginUndoGroup").length, 1);
  assert.equal(calls.filter((c) => c.type === "endUndoGroup").length, 1);
  assert.equal(calls[0].type, "beginUndoGroup");
  assert.equal(calls[calls.length - 1].type, "endUndoGroup");
});

test("comando que nao muta nao abre grupo de Undo", async () => {
  // Abrir um grupo para uma leitura poluiria o historico com entradas que nao
  // desfazem nada.
  const { scope, calls } = await loadDispatcher((s) => {
    s.MotionRegistry.register("ae.context.read", {
      preflight: () => null,
      run: () => ({ changed: false, warnings: [], data: { x: 1 } })
    });
  });

  const response = JSON.parse(scope.MotionAE.dispatch(requestFor("ae.context.read")));

  assert.equal(response.ok, true);
  assert.deepEqual(calls, []);
});

test("comando que muta e reporta changed: false responde ok: false", async () => {
  // A secao 8 do master spec: "nunca retorna ok: true quando nenhuma alteracao
  // esperada ocorreu". A regra e imposta pelo dispatcher, e nao confiada a cada
  // comando — um comando que ache que fez algo nao consegue afirmar sucesso.
  const { scope } = await loadDispatcher((s) => {
    s.MotionRegistry.register("ae.demo.createComposition", {
      preflight: () => null,
      run: () => ({ changed: false, warnings: [], data: { compositionName: "mentira" } })
    });
  });

  const response = JSON.parse(scope.MotionAE.dispatch(requestFor("ae.demo.createComposition")));

  assert.equal(response.ok, false);
  assert.equal(response.error.code, "HOST_OPERATION_FAILED");
  assert.equal(response.data, null);
  assert.ok(
    response.warnings.some((w) => w.code === "NO_CHANGE_APPLIED"),
    "A resposta precisa dizer o que se esperava que tivesse acontecido."
  );
});

test("comando que muta e aplica a alteracao responde ok: true", async () => {
  const { scope, calls } = await loadDispatcher((s) => {
    s.MotionRegistry.register("ae.demo.createComposition", {
      preflight: () => null,
      run: () => ({ changed: true, warnings: [], data: { compositionName: "Moti.on Demo" } })
    });
  });

  const response = JSON.parse(scope.MotionAE.dispatch(requestFor("ae.demo.createComposition")));

  assert.equal(response.ok, true);
  assert.equal(response.data.compositionName, "Moti.on Demo");
  assert.equal(response.error, null);
  assert.equal(calls.filter((c) => c.type === "beginUndoGroup").length, 1);
});

test("comando desconhecido responde INTERNAL_ERROR com o id em details", async () => {
  const { scope } = await loadDispatcher();
  const response = JSON.parse(scope.MotionAE.dispatch(requestFor("ae.nao.existe")));

  assert.equal(response.ok, false);
  assert.equal(response.error.code, "INTERNAL_ERROR");
  assert.equal(response.error.details.command, "ae.nao.existe");
});

test("descriptor sem implementacao e reportado como defeito de build", async () => {
  // Nao registra nenhum handler: o descriptor existe, a implementacao nao.
  // Precisa aparecer como erro, e nao virar um botao que nao faz nada.
  const { scope } = await loadDispatcher();
  const response = JSON.parse(scope.MotionAE.dispatch(requestFor("ae.context.read")));

  assert.equal(response.ok, false);
  assert.equal(response.error.code, "INTERNAL_ERROR");
  assert.match(response.error.message, /não implementado/);
});

test("versao de protocolo diferente e recusada sem invocar o handler", async () => {
  // Recusa, nunca adivinhacao. Ver docs/adr/0002.
  let invoked = false;
  const { scope, calls } = await loadDispatcher((s) => {
    s.MotionRegistry.register("ae.context.read", {
      preflight: () => null,
      run: () => {
        invoked = true;
        return { changed: false, warnings: [], data: {} };
      }
    });
  });

  const response = JSON.parse(
    scope.MotionAE.dispatch(requestFor("ae.context.read", { protocolVersion: 2 }))
  );

  assert.equal(response.ok, false);
  assert.equal(response.error.code, "INTERNAL_ERROR");
  assert.equal(response.error.details.expected, 1);
  assert.equal(response.error.details.received, 2);
  assert.equal(invoked, false, "O handler não pode ser invocado com protocolo incompatível.");
  assert.deepEqual(calls, []);
});

test("pedido ilegivel responde erro tipado em vez de estourar", async () => {
  const { scope } = await loadDispatcher();

  for (const malformed of ["", "não é json", '{"protocolVersion":', "null"]) {
    const response = JSON.parse(scope.MotionAE.dispatch(malformed));
    assert.equal(response.ok, false, `"${malformed}" não produziu resposta de erro.`);
    assert.equal(response.error.code, "INTERNAL_ERROR");
  }
});

test("requestId e protocolVersion sao ecoados em sucesso e em falha", async () => {
  // Sem o eco, o cliente nao consegue correlacionar a resposta com o pedido, e
  // uma resposta atrasada resolveria a promessa errada.
  const { scope } = await loadDispatcher((s) => {
    s.MotionRegistry.register("ae.context.read", {
      preflight: () => null,
      run: () => ({ changed: false, warnings: [], data: {} })
    });
  });

  const success = JSON.parse(
    scope.MotionAE.dispatch(requestFor("ae.context.read", { requestId: "abc-123" }))
  );
  assert.equal(success.requestId, "abc-123");
  assert.equal(success.protocolVersion, 1);

  const failure = JSON.parse(
    scope.MotionAE.dispatch(requestFor("ae.nao.existe", { requestId: "def-456" }))
  );
  assert.equal(failure.requestId, "def-456");
  assert.equal(failure.protocolVersion, 1);
});

test("toda resposta traz timing e warnings, mesmo vazios", async () => {
  // warnings sempre presente significa que quem consome nunca precisa checar
  // por undefined antes de iterar.
  const { scope } = await loadDispatcher();
  const response = JSON.parse(scope.MotionAE.dispatch(requestFor("ae.nao.existe")));

  assert.ok(Array.isArray(response.warnings));
  assert.equal(typeof response.timing.startedAt, "string");
  assert.match(response.timing.startedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  assert.equal(typeof response.timing.durationMs, "number");
});

test("o registro recusa id duplicado", async () => {
  // Dois arquivos disputando o mesmo id: o ultimo venceria em silencio, e o
  // comando acionado nao seria o que o desenvolvedor pensa.
  const { scope } = await loadDispatcher();

  scope.MotionRegistry.register("ae.context.read", {
    preflight: () => null,
    run: () => ({ changed: false, warnings: [], data: {} })
  });

  assert.throws(
    () =>
      scope.MotionRegistry.register("ae.context.read", {
        preflight: () => null,
        run: () => ({ changed: false, warnings: [], data: {} })
      }),
    /já registrado/
  );
});

test("o registro recusa comando sem preflight", async () => {
  // "Nao valida nada" precisa ser decisao escrita — `preflight: () => null` — e
  // nao esquecimento.
  const { scope } = await loadDispatcher();

  assert.throws(
    () => scope.MotionRegistry.register("ae.qualquer", { run: () => ({}) }),
    /precisa de uma função preflight/
  );
});

test("o rotulo de Undo sai no idioma do contexto", async () => {
  const { scope, calls } = await loadDispatcher((s) => {
    s.MotionRegistry.register("ae.demo.createComposition", {
      preflight: () => null,
      run: () => ({ changed: true, warnings: [], data: {} })
    });
  });

  scope.MotionAE.dispatch(
    requestFor("ae.demo.createComposition", {
      context: { host: "after-effects", hostVersion: "25.0", locale: "pt-BR" }
    })
  );

  const begin = calls.find((c) => c.type === "beginUndoGroup");
  assert.equal(begin.label, "Moti.on: criar composição de teste");
});

test("locale desconhecido cai no idioma padrao em vez de mostrar a chave", async () => {
  // Mostrar "undo.ae.demo.createComposition" no menu Edit > Undo do After
  // Effects seria pior do que mostrar o texto em ingles.
  const { scope, calls } = await loadDispatcher((s) => {
    s.MotionRegistry.register("ae.demo.createComposition", {
      preflight: () => null,
      run: () => ({ changed: true, warnings: [], data: {} })
    });
  });

  scope.MotionAE.dispatch(
    requestFor("ae.demo.createComposition", {
      context: { host: "after-effects", hostVersion: "25.0", locale: "de-DE" }
    })
  );

  const begin = calls.find((c) => c.type === "beginUndoGroup");
  assert.equal(begin.label, "Moti.on: create test composition");
  assert.ok(!begin.label.includes("undo."), "A chave i18n não pode vazar para o menu do host.");
});
