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
      return current;
    },
    isTimeVarying() {
      calls.push(`time-varying:${displayName}`);
      return options.timeVarying === true;
    },
    createKeyframe(value) {
      assert.equal(options.transactionState?.(), true, "keyframe precisa nascer dentro da transação");
      calls.push(`keyframe:${displayName}`);
      return { value: { value }, position: null };
    },
    createSetValueAction(keyframe, safeForPlayback) {
      assert.equal(options.transactionState?.(), true, "Action precisa nascer dentro da transação");
      assert.equal(safeForPlayback, true);
      calls.push(`set-action:${displayName}`);
      return {
        apply() {
          current = keyframe.value.value;
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
    makeParam("Strength", 25, calls, { transactionState }),
    makeParam("Color", { red: 0.1, green: 0.2, blue: 0.3, alpha: 1 }, calls, {
      transactionState
    }),
    makeParam("Origin X", 10, calls, { transactionState, timeVarying: true }),
    makeParam("Origin Y", 20, calls, { transactionState }),
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
          actions.push(action);
          return options.addActionSucceeds !== false;
        },
        get empty() {
          return actions.length === 0;
        }
      };
      try {
        callback(compound);
        if (options.transactionSucceeds !== false) {
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
    Color(red, green, blue, alpha) {
      return { red, green, blue, alpha };
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
    motionComponent,
    trackItem,
    project,
    premiere,
    sequence,
    selections,
    controls: createPremiereLiveControls(premiere, project)
  };
}

function target(fixture, overrides = {}) {
  return {
    trackItem: fixture.trackItem,
    bindings,
    manifest,
    locale: "en-US",
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

  const xActionIndex = fixture.calls.indexOf("key-action:Origin X");
  assert.ok(xActionIndex >= 0, "parâmetro temporal usa ação de keyframe");
  assert.equal(fixture.params[2].value(), 30);
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
