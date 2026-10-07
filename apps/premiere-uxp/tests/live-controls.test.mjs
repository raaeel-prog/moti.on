import test from "node:test";
import assert from "node:assert/strict";

import {
  PREMIERE_CONTROLS_UNSUPPORTED_MESSAGE,
  createPremiereLiveControls
} from "../dist/host/src/live-controls.js";

const time = Object.freeze({ seconds: 3, ticks: "762144000000" });

function text(ptBR, enUS) {
  return { "pt-BR": ptBR, "en-US": enUS };
}

function binding(paramId, control, order, extra = {}) {
  return {
    paramId,
    control,
    order,
    target: "layer",
    label: text(extra.ptBR ?? paramId, extra.enUS ?? paramId),
    help: text(`Ajuda ${paramId}`, `Help ${paramId}`),
    ...extra
  };
}

const bindings = [
  binding("strength", "slider", 0, { ptBR: "Intensidade", enUS: "Strength" }),
  binding("tint", "color", 1, { ptBR: "Cor", enUS: "Color" }),
  binding("origin", "point", 2, { ptBR: "Origem", enUS: "Origin" }),
  binding("enabled", "checkbox", 3, { ptBR: "Ativo", enUS: "Enabled" }),
  binding("mode", "dropdown", 4, {
    ptBR: "Modo",
    enUS: "Mode",
    options: [
      { value: 1, label: text("Suave", "Soft") },
      { value: 2, label: text("Forte", "Strong") }
    ]
  })
];

const manifest = {
  schemaVersion: 1,
  templateId: "chms.test-card",
  templateVersion: "1.0.0",
  component: {
    matchName: "CHMS.MOGRT.TestCard",
    indexHint: 1
  },
  controls: [
    {
      paramId: "strength",
      order: 0,
      label: text("Intensidade", "Strength"),
      slots: [
        { paramIndex: 0, role: "value", displayName: text("Intensidade", "Strength") }
      ]
    },
    {
      paramId: "tint",
      order: 1,
      label: text("Cor", "Color"),
      slots: [{ paramIndex: 1, role: "value", displayName: text("Cor", "Color") }]
    },
    {
      paramId: "origin",
      order: 2,
      label: text("Origem", "Origin"),
      slots: [
        { paramIndex: 2, role: "x", displayName: text("Origem X", "Origin X") },
        { paramIndex: 3, role: "y", displayName: text("Origem Y", "Origin Y") }
      ]
    },
    {
      paramId: "enabled",
      order: 3,
      label: text("Ativo", "Enabled"),
      slots: [{ paramIndex: 4, role: "value", displayName: text("Ativo", "Enabled") }]
    },
    {
      paramId: "mode",
      order: 4,
      label: text("Modo", "Mode"),
      slots: [{ paramIndex: 5, role: "value", displayName: text("Modo", "Mode") }]
    }
  ]
};

function makeParam(displayName, initialValue, calls, options = {}) {
  let current = initialValue;
  const param = {
    displayName,
    async getValueAtTime(receivedTime) {
      calls.push(`read:${displayName}`);
      assert.equal(receivedTime, time, "getValueAtTime sempre recebe tempo explícito");
      if (options.failRead?.()) throw new Error("read failed");
      return current;
    },
    isTimeVarying() {
      calls.push(`time-varying:${displayName}`);
      return options.timeVarying === true;
    },
    createKeyframe(value) {
      assert.equal(options.transactionState?.(), true, "keyframe precisa nascer dentro da transação");
      calls.push(`keyframe:${displayName}`);
      if (options.failCreate) throw new Error("keyframe incompatible");
      return { value: { value }, position: null };
    },
    createSetValueAction(keyframe, safeForPlayback) {
      assert.equal(options.transactionState?.(), true, "Action precisa nascer dentro da transação");
      assert.equal(safeForPlayback, true);
      calls.push(`set-action:${displayName}`);
      return {
        apply() {
          current = options.clamp ? Math.min(60, keyframe.value.value) : keyframe.value.value;
        }
      };
    },
    createAddKeyframeAction(keyframe) {
      assert.equal(options.transactionState?.(), true, "Action precisa nascer dentro da transação");
      calls.push(`key-action:${displayName}`);
      return {
        apply() {
          current = keyframe.value.value;
        },
        keyframe
      };
    },
    value() {
      return current;
    },
    externalEdit(value) {
      current = value;
    }
  };
  return param;
}

function makeComponent(matchName, params, displayName = "Test Card") {
  return {
    getParamCount() {
      return params.length;
    },
    getParam(index) {
      return params[index];
    },
    async getMatchName() {
      return matchName;
    },
    async getDisplayName() {
      return displayName;
    }
  };
}

function makeFixture(options = {}) {
  const calls = [];
  const undoLabels = [];
  let insideLockedAccess = false;
  let insideTransaction = false;
  const transactionState = () => insideLockedAccess && insideTransaction;

  const params = [
    makeParam("Strength", 25, calls, { transactionState, clamp: options.clamp,
      failRead: () => options.failPostRead && undoLabels.length > 0 }),
    makeParam("Color", { red: 0.1, green: 0.2, blue: 0.3, alpha: 1 }, calls, {
      transactionState
    }),
    makeParam("Origin X", 10, calls, { transactionState, timeVarying: options.animated === true }),
    makeParam("Origin Y", 20, calls, { transactionState, failCreate: options.failCreate }),
    makeParam(options.wrongLabel ?? "Enabled", true, calls, { transactionState }),
    makeParam("Mode", 2, calls, { transactionState })
  ];
  const targetComponent = makeComponent("CHMS.MOGRT.TestCard", params);
  const motionComponent = makeComponent("AE.ADBE Motion", []);
  const components = options.components ?? [motionComponent, targetComponent];

  const chain = {
    getComponentCount() {
      calls.push("component-count");
      return components.length;
    },
    getComponentAtIndex(index) {
      calls.push(`component:${index}`);
      return components[index];
    }
  };
  const trackItem = {
    async getComponentChain() {
      calls.push("component-chain");
      return chain;
    }
  };

  const project = {
    lockedAccess(callback) {
      calls.push("locked:enter");
      insideLockedAccess = true;
      try {
        callback();
      } finally {
        insideLockedAccess = false;
        calls.push("locked:exit");
      }
    },
    executeTransaction(callback, undoLabel) {
      assert.equal(insideLockedAccess, true, "executeTransaction precisa estar sob lockedAccess");
      calls.push("transaction:enter");
      undoLabels.push(undoLabel);
      insideTransaction = true;
      const actions = [];
      const compound = {
        addAction(action) {
          calls.push("add-action");
          if (options.addActionSucceeds === false) return false;
          actions.push(action);
          return true;
        },
        get empty() {
          return actions.length === 0;
        }
      };
      try {
        callback(compound);
        if (options.transactionSucceeds !== false && !options.ignoreActions) {
          for (const action of actions) action.apply();
        }
      } finally {
        insideTransaction = false;
        calls.push("transaction:exit");
      }
      return options.transactionSucceeds !== false;
    }
  };

  const selections = [];
  const premiere = {
    Color: class Color {
      constructor(red, green, blue, alpha) {
        Object.assign(this, { red, green, blue, alpha });
      }
    },
    TrackItemSelection: options.omitSelectionFactory
      ? undefined
      : {
          createEmptySelection(callback) {
            const items = [];
            const selection = {
              addItem(item) {
                items.push(item);
                return true;
              },
              async getTrackItems() {
                return [...items];
              }
            };
            selections.push(selection);
            callback(selection);
            return true;
          }
        }
  };

  const sequence = {
    setSelection(selection) {
      calls.push("set-selection");
      this.selection = selection;
      return true;
    }
  };

  return {
    calls,
    undoLabels,
    params,
    targetComponent,
    components,
    motionComponent,
    trackItem,
    project,
    premiere,
    sequence,
    selections,
    controls: createPremiereLiveControls(premiere, project)
  };
}

// Snapshot inicial obtido pelo reader real do módulo, não hash duplicado no teste.
// Cada teste usa uma fixture nova; edições externas precisam de override explícito.
const baselineFixture = makeFixture();
const baselineRead = await baselineFixture.controls.read({
  trackItem: baselineFixture.trackItem, sequence: baselineFixture.sequence,
  bindings, manifest, locale: "en-US", time
});

function target(fixture, overrides = {}) {
  return {
    trackItem: fixture.trackItem,
    sequence: fixture.sequence,
    bindings,
    manifest,
    locale: "en-US",
    expectedFingerprint: baselineRead.fingerprint,
    ...overrides
  };
}

test("sem manifesto não inventa paramId nem cria controles só no painel", async () => {
  const fixture = makeFixture();
  const result = await fixture.controls.inspect(target(fixture, { manifest: null }));

  assert.equal(result.supported, false);
  assert.equal(result.code, "CONTROLS_HOST_UNSUPPORTED");
  assert.equal(result.message, PREMIERE_CONTROLS_UNSUPPORTED_MESSAGE["en-US"]);
  assert.equal(result.details.reason, "manifest-missing");
  assert.deepEqual(result.action, { id: "reveal-item", enabled: true });
  assert.deepEqual(fixture.calls, [], "fallback é decidido antes de consultar o host");
});

test("mensagem pt-BR do fallback é exatamente a exigida pelo Addendum A2.8", async () => {
  const fixture = makeFixture();
  const result = await fixture.controls.inspect(
    target(fixture, { manifest: null, locale: "pt-BR" })
  );

  assert.equal(
    result.message,
    "Neste host os parâmetros ficam no Essential Graphics do item aplicado."
  );
});

test("manifesto divergente falha como preset inválido antes de tocar no projeto", async () => {
  const fixture = makeFixture();
  const invalidManifest = structuredClone(manifest);
  invalidManifest.controls[0].paramId = "other-id";

  await assert.rejects(
    fixture.controls.inspect(target(fixture, { manifest: invalidManifest })),
    (error) => error.code === "INVALID_PRESET" && /paramId/.test(error.message)
  );
  assert.deepEqual(fixture.calls, []);
});

test("reader resolve componente por matchName após reorder e devolve vetor lógico", async () => {
  const base = makeFixture();
  const fixture = makeFixture({
    components: [base.motionComponent, makeComponent("AE.ADBE Opacity", []), base.targetComponent]
  });
  const result = await fixture.controls.read(target(fixture, { time }));

  assert.equal(result.supported, true);
  assert.equal(result.componentIndex, 2, "indexHint é só dica; matchName sobrevive a reorder");
  assert.deepEqual(
    result.controls.map(({ paramId, order, value }) => ({ paramId, order, value })),
    [
      { paramId: "strength", order: 0, value: 25 },
      { paramId: "tint", order: 1, value: [0.1, 0.2, 0.3, 1] },
      { paramId: "origin", order: 2, value: [10, 20] },
      { paramId: "enabled", order: 3, value: true },
      { paramId: "mode", order: 4, value: 2 }
    ]
  );
  assert.match(result.fingerprint, /^prlc1:[0-9a-f]{8}$/);
});

test("rótulo exposto divergente vira fallback honesto, não associação por chute", async () => {
  const fixture = makeFixture({ wrongLabel: "Different control" });
  const result = await fixture.controls.read(target(fixture, { time }));

  assert.equal(result.supported, false);
  assert.equal(result.code, "CONTROLS_HOST_UNSUPPORTED");
  assert.equal(result.details.reason, "parameter-label-mismatch");
  assert.equal(fixture.calls.some((call) => call.startsWith("read:")), false);
});

test("writer atualiza somente valores pedidos em uma única transação e um único Undo", async () => {
  const fixture = makeFixture();
  const before = await fixture.controls.read(target(fixture, { time }));
  const result = await fixture.controls.update(
    target(fixture, {
      time,
      undoLabel: "Ajustar Test Card",
      values: {
        strength: 50,
        tint: [0.8, 0.7, 0.6, 1],
        origin: [30, 40],
        enabled: false
      }
    })
  );

  assert.equal(result.supported, true);
  assert.equal(result.changed, true);
  assert.deepEqual(fixture.undoLabels, ["Ajustar Test Card"]);
  assert.equal(fixture.calls.filter((call) => call === "transaction:enter").length, 1);
  assert.equal(fixture.calls.filter((call) => call === "add-action").length, 5);
  assert.notEqual(result.fingerprint, before.fingerprint);
  assert.deepEqual(
    result.controls.map(({ value }) => value),
    [50, [0.8, 0.7, 0.6, 1], [30, 40], false, 2]
  );
  assert.equal(fixture.params[2].value(), 30);
  assert.equal(fixture.params[3].value(), 40);

  assert.equal(fixture.calls.includes("key-action:Origin X"), false);
  assert.deepEqual(result.adjustedParamIds, []);
});

test("valor idêntico não abre transação nem cria entrada de Undo", async () => {
  const fixture = makeFixture();
  const result = await fixture.controls.update(
    target(fixture, {
      time,
      undoLabel: "Ajustar Test Card",
      values: { strength: 25, enabled: true }
    })
  );

  assert.equal(result.supported, true);
  assert.equal(result.changed, false);
  assert.deepEqual(fixture.undoLabels, []);
  assert.equal(fixture.calls.includes("locked:enter"), false);
});

test("valores inválidos falham antes de resolver ComponentParam ou abrir transação", async () => {
  const fixture = makeFixture();
  await assert.rejects(
    fixture.controls.update(
      target(fixture, {
        time,
        undoLabel: "Ajustar Test Card",
        values: { tint: [2, 0, 0, 1] }
      })
    ),
    (error) => error.code === "INVALID_PRESET" && /tint/.test(error.message)
  );

  assert.deepEqual(fixture.calls, []);
});

test("transação recusada nunca é reportada como alteração aplicada", async () => {
  const fixture = makeFixture({ transactionSucceeds: false });
  await assert.rejects(
    fixture.controls.update(
      target(fixture, {
        time,
        undoLabel: "Ajustar Test Card",
        values: { strength: 75 }
      })
    ),
    (error) => error.code === "HOST_OPERATION_FAILED" && /transação/.test(error.message)
  );
  assert.equal(fixture.params[0].value(), 25);
});

test("revelar usa TrackItemSelection e seleciona o item aplicado", async () => {
  const fixture = makeFixture();
  const result = await fixture.controls.reveal({
    sequence: fixture.sequence,
    trackItem: fixture.trackItem,
    locale: "pt-BR"
  });

  assert.deepEqual(result, { revealed: true });
  assert.deepEqual(await fixture.sequence.selection.getTrackItems(), [fixture.trackItem]);
  assert.deepEqual(fixture.calls, ["set-selection"]);
});

test("revelar indisponível preserva o mesmo fallback e desabilita a ação", async () => {
  const fixture = makeFixture({ omitSelectionFactory: true });
  const result = await fixture.controls.reveal({
    sequence: fixture.sequence,
    trackItem: fixture.trackItem,
    locale: "en-US"
  });

  assert.equal(result.supported, false);
  assert.equal(result.code, "CONTROLS_HOST_UNSUPPORTED");
  assert.equal(result.details.reason, "selection-api-unavailable");
  assert.deepEqual(result.action, { id: "reveal-item", enabled: false });
});

function updateInput(fixture, values, extra = {}) {
  return target(fixture, { time, undoLabel: "Ajustar Test Card", values, ...extra });
}

test("matchName duplicado recusa associação mesmo com indexHint coincidente", async () => {
  const fixture = makeFixture();
  fixture.components.push(makeComponent("CHMS.MOGRT.TestCard", fixture.params));
  const result = await fixture.controls.update(updateInput(fixture, { strength: 80 }));
  assert.equal(result.supported, false);
  assert.equal(result.details.reason, "component-ambiguous");
  assert.deepEqual(fixture.undoLabels, []);
});

test("parâmetro animado continua legível e sua escrita preserva todos os valores", async () => {
  const fixture = makeFixture({ animated: true });
  const read = await fixture.controls.read(target(fixture, { time }));
  assert.equal(read.supported, true);
  assert.deepEqual(read.controls[2].value, [10, 20]);
  const result = await fixture.controls.update(updateInput(fixture, { strength: 90, origin: [40, 50] }, {
    expectedFingerprint: read.fingerprint
  }));
  assert.equal(result.supported, false);
  assert.equal(result.details.reason, "animated-parameter");
  assert.equal(fixture.params[0].value(), 25);
  assert.equal(fixture.params[2].value(), 10);
  assert.deepEqual(fixture.undoLabels, []);
});

test("Color nativa é convertida 0..1 e o reader retorna somente dados JSON", async () => {
  const fixture = makeFixture();
  const result = await fixture.controls.update(updateInput(fixture, { tint: [0, 0.5, 1, 0.4] }));
  assert.equal(result.supported, true);
  assert.ok(fixture.params[1].value() instanceof fixture.premiere.Color);
  assert.deepEqual(result.controls[1].value, [0, 0.5, 1, 0.4]);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
});

test("resultado usa o valor limitado pelo host e informa a divergência solicitada", async () => {
  const fixture = makeFixture({ clamp: true });
  const result = await fixture.controls.update(updateInput(fixture, { strength: 100 }));
  assert.equal(result.controls[0].value, 60);
  assert.deepEqual(result.adjustedParamIds, ["strength"]);
  const read = await fixture.controls.read(target(fixture, { time }));
  assert.equal(read.fingerprint, result.fingerprint);
});

test("transação aceita sem efeito real não produz sucesso fictício", async () => {
  const fixture = makeFixture({ ignoreActions: true });
  await assert.rejects(fixture.controls.update(updateInput(fixture, { strength: 70 })),
    (error) => error.code === "HOST_OPERATION_FAILED" && error.details.phase === "post-write" &&
      error.details.transactionExecuted === true);
});

test("falha de leitura após commit preserva evidência de mutação e recuperação por Undo", async () => {
  const fixture = makeFixture({ failPostRead: true });
  await assert.rejects(fixture.controls.update(updateInput(fixture, { strength: 70 })),
    (error) => error.details.phase === "post-write" && error.details.transactionExecuted === true &&
      error.details.recovery === "check-undo-history");
  assert.equal(fixture.params[0].value(), 70);
});

test("falha ao construir uma Action não acumula nem aplica as anteriores", async () => {
  const fixture = makeFixture({ failCreate: true });
  await assert.rejects(fixture.controls.update(updateInput(fixture, { strength: 70, origin: [40, 50] })),
    (error) => error.code === "HOST_OPERATION_FAILED");
  assert.equal(fixture.calls.includes("add-action"), false);
  assert.equal(fixture.params[0].value(), 25);
});

test("addAction recusada aborta a transação e não aplica os valores", async () => {
  const fixture = makeFixture({ addActionSucceeds: false });
  await assert.rejects(fixture.controls.update(updateInput(fixture, { strength: 70 })),
    (error) => error.code === "HOST_OPERATION_FAILED");
  assert.equal(fixture.params[0].value(), 25);
});

test("mudança externa do fingerprint impede sobrescrita silenciosa", async () => {
  const fixture = makeFixture();
  const read = await fixture.controls.read(target(fixture, { time }));
  fixture.params[0].externalEdit(39);
  await assert.rejects(fixture.controls.update(updateInput(fixture, { strength: 70 }, {
    expectedFingerprint: read.fingerprint
  })), (error) => error.details.reason === "fingerprint-conflict" && error.details.mutationAttempted === false);
  assert.equal(fixture.params[0].value(), 39);
  assert.deepEqual(fixture.undoLabels, []);
});

test("dois pedidos concorrentes com mesmo fingerprint não sobrescrevem um ao outro", async () => {
  const fixture = makeFixture();
  const read = await fixture.controls.read(target(fixture, { time }));
  const otherService = createPremiereLiveControls(fixture.premiere, fixture.project);
  const result = await Promise.allSettled([
    fixture.controls.update(updateInput(fixture, { strength: 40 }, { expectedFingerprint: read.fingerprint })),
    otherService.update(updateInput(fixture, { strength: 80 }, { expectedFingerprint: read.fingerprint }))
  ]);
  assert.equal(result[0].status, "fulfilled");
  assert.equal(result[1].status, "rejected");
  assert.equal(fixture.params[0].value(), 40);
  assert.equal(fixture.undoLabels.length, 1);
});

test("payload mutado enquanto aguarda execução não altera o pedido capturado", async () => {
  const fixture = makeFixture();
  const input = updateInput(fixture, { strength: 40 });
  const pending = fixture.controls.update(input);
  input.values.strength = 80;
  const result = await pending;
  assert.equal(result.controls[0].value, 40);
});

test("fila continua atendendo após um pedido inválido ou um conflito", async () => {
  const fixture = makeFixture();
  await assert.rejects(fixture.controls.update(updateInput(fixture, { other: 80 })));
  const result = await fixture.controls.update(updateInput(fixture, { strength: 45 }));
  assert.equal(result.controls[0].value, 45);
});

test("accessor em payload é rejeitado sem executar código ou consultar host", async () => {
  const fixture = makeFixture();
  let executed = false;
  const values = Object.defineProperty({}, "strength", { enumerable: true, get() { executed = true; return 75; } });
  await assert.rejects(fixture.controls.update(updateInput(fixture, values)),
    (error) => error.code === "INVALID_PRESET");
  assert.equal(executed, false);
  assert.deepEqual(fixture.calls, []);
});

test("paridade valida rótulo físico, ordem e índices antes de consultar o host", async () => {
  for (const mutate of [
    (m) => { m.controls[0].slots[0].displayName["en-US"] = "Wrong"; },
    (m) => { m.controls[0].order = 4; },
    (m) => { m.controls[1].slots[0].paramIndex = 0; },
    (m) => { m.controls[2].slots[0].role = "y"; },
    (m) => { m.schemaVersion = 2; }
  ]) {
    const fixture = makeFixture();
    const invalid = structuredClone(manifest);
    mutate(invalid);
    await assert.rejects(fixture.controls.inspect(target(fixture, { manifest: invalid })),
      (error) => error.code === "INVALID_PRESET");
    assert.deepEqual(fixture.calls, []);
  }
});

test("ausência de capabilities retorna fallback antes de qualquer mutação", async () => {
  for (const [mutate, reason] of [
    [(f) => { delete f.project.lockedAccess; }, "transaction-api-unavailable"],
    [(f) => { delete f.trackItem.getComponentChain; }, "component-chain-unavailable"],
    [(f) => { delete f.params[0].getValueAtTime; }, "parameter-read-api-unavailable"],
    [(f) => { delete f.params[0].createSetValueAction; }, "parameter-write-api-unavailable"],
    [(f) => { delete f.premiere.Color; }, "color-factory-unavailable"],
    [(f) => { f.components.length = 1; }, "component-not-found"],
    [(f) => { f.params.length = 1; }, "parameter-missing"]
  ]) {
    const fixture = makeFixture();
    mutate(fixture);
    const result = await fixture.controls.update(updateInput(fixture, { strength: 70, tint: [1, 1, 1, 1] }));
    assert.equal(result.supported, false, reason);
    assert.equal(result.details.reason, reason);
    assert.deepEqual(fixture.undoLabels, []);
  }
});

test("getValueAtTime nunca é chamado sem um TickTime válido", async () => {
  const fixture = makeFixture();
  for (const invalidTime of [null, undefined, {}, { seconds: NaN, ticks: "0" }]) {
    await assert.rejects(fixture.controls.read(target(fixture, { time: invalidTime })),
      (error) => error.code === "INVALID_PRESET");
  }
  assert.deepEqual(fixture.calls, []);
});

test("trocar idioma da UI não altera fingerprint dos mesmos valores no host", async () => {
  const fixture = makeFixture();
  const first = await fixture.controls.read(target(fixture, { time }));
  const translated = await fixture.controls.read(target(fixture, { time, locale: "pt-BR" }));
  assert.equal(first.fingerprint, translated.fingerprint);
  assert.equal(translated.controls[0].label, "Intensidade");
});

test("ativar animação no host muda o fingerprint mesmo conservando o valor amostrado", async () => {
  const fixture = makeFixture();
  const first = await fixture.controls.read(target(fixture, { time }));
  fixture.params[0].isTimeVarying = () => true;
  const animated = await fixture.controls.read(target(fixture, { time }));
  assert.notEqual(first.fingerprint, animated.fingerprint);
  assert.equal(animated.controls[0].animated, true);
});

test("fallback não habilita revelar sem a sequência ou a API de seleção", async () => {
  const fixture = makeFixture();
  const result = await fixture.controls.inspect(target(fixture, { manifest: null, sequence: null }));
  assert.equal(result.action.enabled, false);
});

test("seleção aguarda Promise nos hosts anteriores a 26.3 e trata rejeição", async () => {
  const fixture = makeFixture();
  fixture.sequence.setSelection = async (selection) => {
    fixture.sequence.selection = selection;
    return true;
  };
  assert.deepEqual(await fixture.controls.reveal({ sequence: fixture.sequence, trackItem: fixture.trackItem, locale: "en-US" }),
    { revealed: true });
  fixture.sequence.setSelection = async () => { throw new Error("host rejected"); };
  await assert.rejects(fixture.controls.reveal({ sequence: fixture.sequence, trackItem: fixture.trackItem, locale: "en-US" }),
    (error) => error.code === "HOST_OPERATION_FAILED");
});

test("opções de dropdown malformadas falham com código estável antes do host", async () => {
  for (const option of [null, 1, {}, { value: 1 }, { value: 1, label: text("", "Soft") }]) {
    const fixture = makeFixture();
    const invalidBindings = structuredClone(bindings);
    invalidBindings[4].options = [option];
    await assert.rejects(fixture.controls.inspect(target(fixture, { bindings: invalidBindings })),
      (error) => error.code === "INVALID_PRESET");
    assert.deepEqual(fixture.calls, []);
  }
});

test("falha do host no gate de animação retorna fallback sem transação", async () => {
  const fixture = makeFixture();
  let reads = 0;
  fixture.params[0].isTimeVarying = () => {
    if (++reads > 1) throw new Error("stale parameter");
    return false;
  };
  const result = await fixture.controls.update(updateInput(fixture, { strength: 40 }));
  assert.equal(result.supported, false);
  assert.equal(result.details.reason, "host-query-failed");
  assert.deepEqual(fixture.undoLabels, []);
});

test("angle mantém a representação numérica do parâmetro real", async () => {
  const fixture = makeFixture();
  const angleBindings = structuredClone(bindings);
  angleBindings[0].control = "angle";
  const result = await fixture.controls.update(updateInput(fixture, { strength: -270 }, { bindings: angleBindings }));
  assert.equal(result.controls[0].value, -270);
  assert.equal(result.transaction.actionCount, 1);
});

test("update exige fingerprint explícito antes de consultar ou alterar o host", async () => {
  for (const expectedFingerprint of [undefined, null, "", 1]) {
    const fixture = makeFixture();
    await assert.rejects(fixture.controls.update(updateInput(fixture, { strength: 40 }, { expectedFingerprint })),
      (error) => error.code === "INVALID_PRESET");
    assert.deepEqual(fixture.calls, []);
  }
});

test("troca ou reorder de componente durante leitura aborta sem escrever no alvo antigo ou novo", async () => {
  for (const swap of [
    (f) => f.components.reverse(),
    (f) => { f.components[1] = makeComponent("CHMS.MOGRT.TestCard", f.params); }
  ]) {
    const fixture = makeFixture();
    const getValue = fixture.params[0].getValueAtTime;
    fixture.params[0].getValueAtTime = async (at) => {
      const value = await getValue(at);
      swap(fixture);
      return value;
    };
    const result = await fixture.controls.update(updateInput(fixture, { strength: 40 }));
    assert.equal(result.supported, false);
    assert.equal(result.details.reason, "target-changed");
    assert.equal(fixture.params[0].value(), 25);
    assert.deepEqual(fixture.undoLabels, []);
    assert.equal(fixture.calls.includes("transaction:enter"), false);
  }
});

test("PointF nativo não é interpretado como o layout X/Y de dois escalares", async () => {
  const fixture = makeFixture();
  fixture.params[2].externalEdit({ x: 10, y: 20 });
  const result = await fixture.controls.read(target(fixture, { time }));
  assert.equal(result.supported, false);
  assert.equal(result.details.reason, "parameter-value-incompatible");
  assert.deepEqual(fixture.undoLabels, []);
});
