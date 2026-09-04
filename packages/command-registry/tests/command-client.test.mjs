import test from "node:test";
import assert from "node:assert/strict";

import {
  COMMAND_DESCRIPTORS,
  createCommandClient,
  getDescriptor,
  resolveUndoLabel
} from "../dist/index.js";

/**
 * O cliente e o lado do painel da ponte. Os tres comportamentos testados aqui
 * sao os que separam "funciona no caminho feliz" de "nao mente para o usuario
 * quando algo da errado".
 */

function createHarness() {
  const sent = [];
  const warnings = [];
  /** Temporizadores controlados a mao: o teste nao espera 15 segundos de verdade. */
  const timers = new Map();
  let nextTimerId = 1;
  let currentTime = 1_700_000_000_000;

  let respond = null;

  const client = createCommandClient({
    transport: {
      send(serialized, onResult) {
        sent.push(JSON.parse(serialized));
        respond = onResult;
      }
    },
    context: () => ({ host: "after-effects", hostVersion: "25.0", locale: "pt-BR" }),
    logger: { warn: (message, details) => warnings.push({ message, details }) },
    now: () => currentTime,
    setTimeoutFn: (handler, ms) => {
      const id = nextTimerId;
      nextTimerId += 1;
      timers.set(id, { handler, ms });
      return id;
    },
    clearTimeoutFn: (id) => timers.delete(id)
  });

  return {
    client,
    sent,
    warnings,
    timers,
    /** Dispara o temporizador pendente, como se o tempo tivesse estourado. */
    fireTimeout(elapsedMs = 0) {
      currentTime += elapsedMs;
      const [id, entry] = [...timers.entries()][0];
      timers.delete(id);
      entry.handler();
    },
    reply(payload) {
      respond(typeof payload === "string" ? payload : JSON.stringify(payload));
    },
    lastRequest: () => sent[sent.length - 1]
  };
}

function successFor(requestId, data = {}) {
  return {
    protocolVersion: 1,
    requestId,
    ok: true,
    data,
    warnings: [],
    error: null,
    timing: { startedAt: "2026-08-24T15:00:00.000Z", durationMs: 4 }
  };
}

test("o pedido enviado carrega protocolVersion, requestId, comando e contexto", async () => {
  const h = createHarness();
  const promise = h.client.execute("ae.context.read");

  const request = h.lastRequest();
  assert.equal(request.protocolVersion, 1);
  assert.equal(request.command, "ae.context.read");
  assert.equal(typeof request.requestId, "string");
  assert.ok(request.requestId.length > 0);
  assert.equal(request.context.host, "after-effects");
  assert.equal(request.context.locale, "pt-BR");

  h.reply(successFor(request.requestId, { hostVersion: "25.0" }));
  const response = await promise;
  assert.equal(response.ok, true);
  assert.equal(response.data.hostVersion, "25.0");
});

test("o cliente materializa defaults Quick e preserva opções Advanced explícitas", async () => {
  const quick = createHarness();
  const quickPromise = quick.client.execute("ae.context.read");
  const quickRequest = quick.lastRequest();

  assert.deepEqual(quickRequest.options, { mode: "quick", emitLiveControls: true });
  quick.reply(successFor(quickRequest.requestId));
  await quickPromise;

  const advanced = createHarness();
  const advancedPromise = advanced.client.execute("ae.context.read", {}, {
    mode: "advanced",
    targetRigId: "rig-1"
  });
  const advancedRequest = advanced.lastRequest();

  assert.deepEqual(advancedRequest.options, { mode: "advanced", targetRigId: "rig-1" });
  advanced.reply(successFor(advancedRequest.requestId));
  await advancedPromise;
});

test("resposta com requestId desconhecido e descartada, nao entregue", async () => {
  // Acontece de verdade: um evalScript que estourou o timeout ainda chama o
  // callback depois. Entregar essa resposta ao pedido atual mostraria ao usuario
  // o resultado da operacao errada.
  const h = createHarness();
  const promise = h.client.execute("ae.context.read");
  const request = h.lastRequest();

  h.reply(successFor("id-de-outra-operacao", { lixo: true }));

  assert.equal(h.client.pendingCount(), 1, "O pedido real não pode ter sido resolvido.");
  assert.ok(
    h.warnings.some((w) => /requestId desconhecido/.test(w.message)),
    "O descarte precisa ser registrado, e não acontecer em silêncio."
  );

  h.reply(successFor(request.requestId));
  const response = await promise;
  assert.equal(response.ok, true);
});

test("timeout avisa que a operacao pode ter sido aplicada", async () => {
  // O evalScript nao tem cancelamento. Quando o tempo estoura, o host pode estar
  // no meio da operacao ou ja te-la concluido. Dizer "falhou" seria mentira.
  const h = createHarness();
  const promise = h.client.execute("ae.demo.createComposition");

  h.fireTimeout(30_000);
  const response = await promise;

  assert.equal(response.ok, false);
  assert.equal(response.error.code, "HOST_OPERATION_FAILED");
  assert.equal(response.error.recoverable, true);
  assert.match(
    response.error.message,
    /pode ter sido aplicada/,
    "A mensagem de timeout não pode afirmar que nada aconteceu."
  );
  assert.match(response.error.message, /Desfazer/);
  assert.equal(response.error.details.timeoutMs, 30_000);
});

test("callback atrasado depois do timeout nao resolve de novo nem estoura", async () => {
  const h = createHarness();
  const promise = h.client.execute("ae.context.read");
  const request = h.lastRequest();

  h.fireTimeout(15_000);
  const timedOut = await promise;
  assert.equal(timedOut.ok, false);

  // O host responde tarde. Nao pode lancar, e nao pode mudar o resultado ja
  // entregue.
  assert.doesNotThrow(() => h.reply(successFor(request.requestId)));
  assert.equal(h.client.pendingCount(), 0);
});

test("o temporizador e cancelado quando a resposta chega a tempo", async () => {
  // Sem o clearTimeout, cada comando deixaria um temporizador vivo ate estourar.
  const h = createHarness();
  const promise = h.client.execute("ae.context.read");
  h.reply(successFor(h.lastRequest().requestId));
  await promise;

  assert.equal(h.timers.size, 0, "Temporizador vazado após resposta no prazo.");
  assert.equal(h.client.pendingCount(), 0);
});

test("comando desconhecido falha localmente, sem ida ao host", async () => {
  const h = createHarness();
  const response = await h.client.execute("ae.nao.existe");

  assert.equal(response.ok, false);
  assert.equal(response.error.code, "INTERNAL_ERROR");
  assert.equal(h.sent.length, 0, "Pedir um comando inexistente não pode chegar ao host.");
});

test("pedido malformado ou com toJSON falha localmente antes do transporte", async () => {
  const primitiveHarness = createHarness();
  const primitive = await primitiveHarness.client.execute("ae.context.read", null);
  assert.equal(primitive.ok, false);
  assert.equal(primitive.error.code, "INTERNAL_ERROR");
  assert.equal(primitiveHarness.sent.length, 0);

  const hookedArgs = { safe: true };
  Object.defineProperty(hookedArgs, "toJSON", {
    value: () => ({ injected: "não pode atravessar" }),
    enumerable: false
  });
  const hookedHarness = createHarness();
  const hooked = await hookedHarness.client.execute("ae.context.read", hookedArgs);
  assert.equal(hooked.ok, false);
  assert.equal(hooked.error.code, "INTERNAL_ERROR");
  assert.ok(hooked.error.details.issues.some(({ code }) => code === "toJSON"));
  assert.equal(hookedHarness.sent.length, 0);
});

test("CommandClient serializa o snapshot validado, não um Proxy vivo", async () => {
  let descriptorReads = 0;
  const proxyArgs = new Proxy(
    { value: "safe" },
    {
      getOwnPropertyDescriptor(target, property) {
        const descriptor = Reflect.getOwnPropertyDescriptor(target, property);
        if (property !== "value" || !descriptor) return descriptor;
        descriptorReads += 1;
        return { ...descriptor, value: descriptorReads === 1 ? "safe" : "evil" };
      }
    }
  );

  const h = createHarness();
  const promise = h.client.execute("ae.context.read", proxyArgs);
  const request = h.lastRequest();
  assert.equal(request.args.value, "safe");
  assert.equal(Object.getOwnPropertyDescriptor(proxyArgs, "value").value, "evil");

  h.reply(successFor(request.requestId));
  assert.equal((await promise).ok, true);
});

test("resposta que nao segue o contrato v1 e descartada", async () => {
  const h = createHarness();
  const promise = h.client.execute("ae.context.read");
  const request = h.lastRequest();

  // Envelope legado, sem protocolVersion.
  h.reply({ ok: true, data: {}, error: null });
  assert.equal(h.client.pendingCount(), 1);

  // Texto que nem e JSON.
  h.reply("EvalScript error.");
  assert.equal(h.client.pendingCount(), 1);

  assert.ok(h.warnings.length >= 2);

  h.reply(successFor(request.requestId));
  assert.equal((await promise).ok, true);
});

test("falha ao enviar vira erro tipado em vez de excecao vazando", async () => {
  const client = createCommandClient({
    transport: {
      send() {
        throw new Error("CSInterface indisponível");
      }
    },
    context: () => ({ host: "after-effects", hostVersion: "25.0" }),
    logger: { warn: () => {} }
  });

  const response = await client.execute("ae.context.read");
  assert.equal(response.ok, false);
  assert.equal(response.error.code, "INTERNAL_ERROR");
  assert.match(response.error.details.reason, /CSInterface indisponível/);
  assert.equal(client.pendingCount(), 0, "Um envio que falhou não pode deixar pedido pendurado.");
});

test("o gerador de requestId de fallback nao repete em 10.000 chamadas", () => {
  // O CEP 12 usa um Chromium embutido antigo e o UXP tem runtime proprio;
  // assumir crypto.randomUUID produziria falha dentro do host, que e o lugar
  // mais caro de descobrir qualquer coisa.
  let counter = 0;
  const fallback = () => {
    counter += 1;
    return `${Date.now().toString(36)}-${counter}-${Math.random().toString(36).slice(2, 10)}`;
  };

  const seen = new Set();
  for (let i = 0; i < 10_000; i += 1) seen.add(fallback());
  assert.equal(seen.size, 10_000);
});

test("todo descriptor tem timeout positivo e rotulo de Undo declarado", () => {
  for (const descriptor of COMMAND_DESCRIPTORS) {
    assert.ok(descriptor.timeoutMs > 0, `${descriptor.id}: timeoutMs inválido.`);
    assert.ok(descriptor.undoLabelKey.length > 0, `${descriptor.id}: undoLabelKey vazio.`);
    assert.ok(descriptor.hosts.length > 0, `${descriptor.id}: não declara host.`);
  }
});

test("comando destrutivo tambem muta", () => {
  // Um comando que apaga dado sem declarar que muta escaparia da regra do `ok` e
  // do grupo de Undo.
  for (const descriptor of COMMAND_DESCRIPTORS) {
    if (descriptor.destructive) {
      assert.ok(descriptor.mutates, `${descriptor.id} é destrutivo mas não declara mutates.`);
    }
  }
});

test("comando que muta nao promete execucao sem mutacao", () => {
  // O dispatcher recusa `dryRun` sempre que o descriptor declara `mutates`:
  // servir uma prévia exigiria um handler separado, e falhar fechado evita uma
  // prévia falsa. Declarar `supportsDryRun` num comando que muta é, então, uma
  // promessa que o dispatcher nunca cumpre — o painel oferece a opção e recebe
  // CAPABILITY_UNAVAILABLE.
  //
  // `ae.project.clean` declarava as duas coisas. A prévia dele existe, mas por
  // outro caminho: `removeConfirmed: false` devolve a contagem sem remover.
  for (const descriptor of COMMAND_DESCRIPTORS) {
    if (descriptor.mutates) {
      assert.equal(
        descriptor.supportsDryRun,
        false,
        `${descriptor.id} muta e mesmo assim declara supportsDryRun.`
      );
    }
  }
});

test("comando que nao muta usa o rotulo de Undo vazio", () => {
  for (const descriptor of COMMAND_DESCRIPTORS) {
    if (!descriptor.mutates) {
      assert.equal(
        descriptor.undoLabelKey,
        "undo.none",
        `${descriptor.id} não muta mas declara um rótulo de Undo real.`
      );
    }
  }
});

test("rótulo de Undo normaliza os formatos de locale devolvidos pelos hosts", () => {
  const key = "undo.ae.demo.createComposition";

  for (const locale of ["pt-BR", "pt_BR", "pt-br", "pt"]) {
    assert.equal(resolveUndoLabel(key, locale), "Moti.on: criar composição de teste");
  }
  assert.equal(resolveUndoLabel(key, "de-DE"), "Moti.on: create test composition");
});

test("sucesso sem mudanca e opt-in e somente para comando mutante idempotente", () => {
  for (const descriptor of COMMAND_DESCRIPTORS) {
    assert.equal(typeof descriptor.allowsNoopSuccess, "boolean", `${descriptor.id}: flag ausente.`);
    if (descriptor.allowsNoopSuccess) {
      assert.equal(descriptor.mutates, true, `${descriptor.id}: no-op permitido em comando read-only.`);
    }
  }

  assert.deepEqual(
    COMMAND_DESCRIPTORS.filter((descriptor) => descriptor.allowsNoopSuccess).map((descriptor) => descriptor.id),
    // Lista fixada de proposito: permitir "sucesso sem mudanca" e uma decisao por
    // comando, e nao um padrao herdado sem revisao. Os quatro primeiros aplicam
    // um template gerenciado idempotente — reaplicar o mesmo estado nao e falha.
    // `ae.text.box` entra pelo mesmo motivo, do lado da criacao: um texto que ja
    // tem caixa gerenciada nao ganha uma segunda. `ae.layer.parent` idem: uma
    // camada ja parenteada ao alvo pedido nao e reescrita, porque reescrever
    // faria o After Effects recalcular o transform e acumular arredondamento.
    [
      "ae.expression.loopout",
      "ae.expression.smooth",
      "ae.expression.wiggle",
      "ae.expression.flicker",
      "ae.text.box",
      "ae.layer.parent",
      // Pedir o ponto onde a ancora ja esta e um pedido satisfeito de antemao.
      "ae.anchor.align",
      // Renomear para o nome que a camada já tem é o mesmo pedido do usuário
      // satisfeito de antemão.
      "ae.layer.rename",
      // Cortar keys num intervalo que não tem nenhuma: o estado pedido — sem
      // keys ali — já vale.
      "ae.keys.cut",
      // Offsets todos zero, que é o caso de uma única camada selecionada com
      // atraso por índice. Reportar falha aí puniria um pedido bem formado.
      "ae.keys.delay",
      "ae.keys.ease.apply",
      // Se o grupo selecionado ja encosta na borda pedida, o estado solicitado
      // ja foi alcancado e o host pode responder sucesso sem reescrever keys.
      "ae.keys.send-to-edge",
      // Reaplicar a mesma inercia numa propriedade que ja a tem: o usuario
      // ajusta amplitude, volta ao valor anterior e reaplica.
      "ae.animate.inertial",
      // Reaplicar o mesmo corte num grupo que ja o tem e o modo Adjust do
      // criterio de aceite: o pedido do usuario ja vale.
      "ae.shape.trim-path",
      // Reaplicar o mesmo effector nas mesmas camadas e pedido ja satisfeito.
      "ae.rig.effector",
      // Reajustar o raio ou a aresta do rig existente e o Adjust da secao.
      "ae.3d.cylinder",
      "ae.3d.cube",
      "ae.effect.wave",
      // O modo grade reaplicado com os mesmos numeros e o Adjust da secao.
      "ae.effect.tile",
      // Reapontar para o mesmo alvo com os mesmos eixos, e reajustar o mesmo
      // preset de eco: os dois sao pedidos ja satisfeitos.
      // Reajustar o rig com os mesmos numeros e o modo Adjust da secao, e nao
      // uma falha: o estado pedido ja vale.
      "ae.animate.parallax.quick",
      "ae.3d.look-at",
      "ae.effect.echo",
      "ae.project.clean"
    ]
  );
});

test("ids de comando sao ASCII e nao repetem", () => {
  const ids = COMMAND_DESCRIPTORS.map((d) => d.id);
  assert.equal(new Set(ids).size, ids.length, "Há id de comando duplicado.");

  for (const id of ids) {
    // Id de comando e identificador de protocolo, nao texto de interface: tem de
    // permanecer estavel e neutro de idioma.
    // O hífen é a convenção do spec para segmentos de várias palavras:
    // `ae.layer.create-null`, `ae.shape.trim-path`, `ae.layer.reverse-order`.
    // O guarda existe para manter o id ASCII e estável, não para proibir hífen.
    // O catalogo do master spec traz `ae.3d.orbit` e `ae.3d.look-at`: o segmento
    // do meio pode comecar por digito. O padrao anterior recusava um id que o
    // proprio spec define.
    assert.match(id, /^[a-z]{2}\.[a-zA-Z0-9.-]+$/, `Id fora do padrão: ${id}`);
    assert.equal(getDescriptor(id).id, id);
  }
});
