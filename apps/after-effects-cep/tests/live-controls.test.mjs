import test from "node:test";
import assert from "node:assert/strict";

import { loadHostModules } from "./host-harness.mjs";

const MATCH = {
  slider: "ADBE Slider Control",
  angle: "ADBE Angle Control",
  color: "ADBE Color Control",
  checkbox: "ADBE Checkbox Control",
  point: "ADBE Point Control",
  dropdown: "ADBE Dropdown Control"
};

const clone = (value) => (Array.isArray(value) ? [...value] : value);

class FakeProperty {
  constructor(state, version = state.handleVersion) {
    this.state = state;
    this.version = version;
    this.matchName = state.matchName;
    this.name = state.matchName;
    this.canSetExpression = true;
  }

  assertFresh() {
    if (this.version !== this.state.handleVersion) throw new Error("stale property handle");
  }

  get value() {
    this.assertFresh();
    return clone(this.state.value);
  }

  get numKeys() {
    this.assertFresh();
    return this.state.keys.length;
  }

  setValue(value) {
    this.assertFresh();
    if (this.state.failSet) throw new Error("setValue failed");
    this.state.value = clone(value);
    this.state.setCalls.push(clone(value));
  }

  removeKey(index) {
    this.assertFresh();
    this.state.removeKeyCalls.push(index);
    this.state.keys.splice(index - 1, 1);
  }

  setPropertyParameters(items) {
    this.assertFresh();
    if (!this.state.dropdownCapable) throw new Error("dropdown unavailable");
    if (this.state.failDropdownParameters) throw new Error("setPropertyParameters failed");
    this.state.items = [...items];
    this.state.handleVersion += 1;
    return new FakeProperty(this.state);
  }

  get isDropdownEffect() {
    this.assertFresh();
    return this.state.dropdownCapable;
  }
}

class FakeEffect {
  constructor(parade, state, generation = parade.generation) {
    this.parade = parade;
    this.state = state;
    this.generation = generation;
  }

  assertFresh() {
    if (this.generation !== this.parade.generation) throw new Error("stale effect handle");
  }

  get matchName() {
    this.assertFresh();
    return this.state.matchName;
  }

  get name() {
    this.assertFresh();
    return this.state.name;
  }

  set name(value) {
    this.assertFresh();
    this.state.name = value;
  }

  get propertyIndex() {
    this.assertFresh();
    return this.parade.states.indexOf(this.state) + 1;
  }

  property(key) {
    this.assertFresh();
    this.state.propertyLookups.push(key);
    return key === 1 ? new FakeProperty(this.state.property) : null;
  }

  remove() {
    this.assertFresh();
    if (this.state.failRemove) throw new Error("remove failed");
    const index = this.parade.states.indexOf(this.state);
    if (index >= 0) this.parade.states.splice(index, 1);
    this.parade.generation += 1;
  }
}

class FakeParade {
  constructor(options = {}) {
    this.states = [];
    this.generation = 0;
    this.unavailable = new Set(options.unavailable ?? []);
    this.dropdownCapable = options.dropdownCapable ?? true;
    this.failSetFor = new Set(options.failSetFor ?? []);
    this.failRemoveFor = new Set(options.failRemoveFor ?? []);
    this.failDropdownParameters = options.failDropdownParameters ?? false;
  }

  get numProperties() {
    return this.states.length;
  }

  property(key) {
    const state =
      typeof key === "number"
        ? (this.states[key - 1] ?? null)
        : (this.states.find((candidate) => candidate.matchName === key) ?? null);
    return state ? new FakeEffect(this, state) : null;
  }

  canAddProperty(matchName) {
    return !this.unavailable.has(matchName);
  }

  addProperty(matchName) {
    if (!this.canAddProperty(matchName)) throw new Error(`cannot add ${matchName}`);
    const propertyState = {
      matchName: `${matchName}-0001`,
      value: 0,
      keys: [],
      setCalls: [],
      removeKeyCalls: [],
      handleVersion: 0,
      dropdownCapable: matchName === MATCH.dropdown && this.dropdownCapable,
      failDropdownParameters: this.failDropdownParameters,
      failSet: this.failSetFor.has(matchName),
      items: []
    };
    const state = {
      matchName,
      name: matchName,
      property: propertyState,
      propertyLookups: [],
      failRemove: this.failRemoveFor.has(matchName)
    };
    this.states.push(state);
    this.generation += 1;
    return new FakeEffect(this, state);
  }

  seed(matchName, name, value = 0) {
    this.addProperty(matchName);
    const state = this.states[this.states.length - 1];
    state.name = name;
    state.property.value = clone(value);
    return state;
  }

  move(fromIndex, toIndex) {
    const [state] = this.states.splice(fromIndex - 1, 1);
    this.states.splice(toIndex - 1, 0, state);
    this.generation += 1;
  }
}

class FakeLayer {
  constructor(options = {}) {
    this.effects = new FakeParade(options);
  }

  property(matchName) {
    return matchName === "ADBE Effect Parade" ? this.effects : null;
  }
}

class FakeExpressionProperty {
  constructor(expression = "old expression", fail = false) {
    this.canSetExpression = true;
    this.expression = expression;
    this.fail = fail;
  }

  setExpression(value) {
    if (this.fail) {
      this.fail = false;
      throw new Error("expression write failed");
    }
    this.expression = value;
  }
}

async function fixture(layerOptions = {}) {
  const scope = await loadHostModules(
    ["src/effect-operations.jsx", "src/live-controls.jsx"],
    { Property: FakeProperty }
  );
  return { scope, layer: new FakeLayer(layerOptions) };
}

function binding(paramId, control, order, extra = {}) {
  return {
    paramId,
    label: { "pt-BR": extra.label ?? paramId, "en-US": extra.englishLabel ?? paramId },
    control,
    target: extra.target ?? "layer",
    order,
    help: { "pt-BR": "Ajuda", "en-US": "Help" },
    ...(extra.unit ? { unit: extra.unit } : {}),
    ...(extra.min !== undefined ? { min: extra.min } : {}),
    ...(extra.max !== undefined ? { max: extra.max } : {}),
    ...(extra.options ? { options: extra.options } : {})
  };
}

function config(bindings, values, extra = {}) {
  return {
    rigId: extra.rigId ?? "7f3a9c00-0000-0000-0000-000000000000",
    tool: extra.tool ?? "Wiggle",
    locale: extra.locale ?? "pt-BR",
    targetKind: extra.targetKind ?? "layer",
    bindings,
    values
  };
}

test("writer cria os seis controles na ordem declarada e acessa somente a propriedade (1)", async () => {
  const { scope, layer } = await fixture();
  const bindings = [
    binding("cor", "color", 3, { label: "Cor" }),
    binding("amplitude", "slider", 1, { label: "Amplitude", unit: "px", min: 0, max: 500 }),
    binding("angulo", "angle", 2, { label: "Ângulo", unit: "°" }),
    binding("ativo", "checkbox", 4, { label: "Ativo" }),
    binding("ponto", "point", 5, { label: "Centro", unit: "px" }),
    binding("modo", "dropdown", 6, {
      label: "Modo",
      options: [
        { value: 10, label: { "pt-BR": "Ciclo", "en-US": "Cycle" } },
        { value: 20, label: { "pt-BR": "Pingue-pongue", "en-US": "Ping-pong" } }
      ]
    })
  ];

  const result = scope.MotionLiveControls.create(
    layer,
    config(bindings, {
      amplitude: 120,
      angulo: 370,
      cor: [0.1, 0.2, 0.3, 1],
      ativo: true,
      ponto: [960, 540],
      modo: 20
    })
  );

  assert.deepEqual(
    layer.effects.states.map((effect) => effect.matchName),
    [MATCH.slider, MATCH.angle, MATCH.color, MATCH.checkbox, MATCH.point, MATCH.dropdown]
  );
  assert.deepEqual(layer.effects.states.map((effect) => effect.propertyLookups), [[1], [1], [1], [1], [1], [1]]);
  assert.equal(layer.effects.states[0].name, "CHMS · Wiggle · Amplitude (px)");
  assert.deepEqual(layer.effects.states[5].property.items, ["Ciclo", "Pingue-pongue"]);
  assert.equal(layer.effects.states[5].property.value, 2, "dropdown grava o índice do item no host");
  assert.deepEqual(result.records.map((record) => record.paramId), bindings.toSorted((a, b) => a.order - b.order).map((item) => item.paramId));
  assert.equal(result.records[5].lastAppliedValue, 20, "metadata guarda o valor lógico do preset");
  assert.deepEqual(result.warnings, []);
});

test("nome colidente recebe rigId curto e a referência de expressão é escapada e clampada", async () => {
  const { scope, layer } = await fixture();
  layer.effects.seed(MATCH.slider, 'CHMS · Wi"ggle\\ · Amplitude (px)', 1);
  const controls = config(
    [binding("amplitude", "slider", 1, { label: 'Amplitude', unit: "px", min: 0, max: 500 })],
    { amplitude: 30 },
    { tool: 'Wi"ggle\\' }
  );

  const result = scope.MotionLiveControls.create(layer, controls);
  const record = result.records[0];

  assert.equal(record.name, 'CHMS · Wi"ggle\\ · Amplitude (px) #7f3a');
  assert.equal(
    scope.MotionLiveControls.expressionReference(record),
    'Math.max(0, Math.min(500, effect("CHMS · Wi\\"ggle\\\\ · Amplitude (px) #7f3a")(1)))'
  );
});

test("dropdown indisponível cai para slider inteiro e documenta as opções no nome", async () => {
  const { scope, layer } = await fixture({ dropdownCapable: false });
  const result = scope.MotionLiveControls.create(
    layer,
    config(
      [
        binding("modo", "dropdown", 1, {
          label: "Modo",
          options: [
            { value: 1, label: { "pt-BR": "Ciclo", "en-US": "Cycle" } },
            { value: 2, label: { "pt-BR": "Pingpong", "en-US": "Ping-pong" } }
          ]
        })
      ],
      { modo: 2 }
    )
  );

  assert.equal(layer.effects.states.length, 1, "o dropdown de capability incompleta foi removido");
  assert.equal(layer.effects.states[0].matchName, MATCH.slider);
  assert.equal(layer.effects.states[0].name, "CHMS · Wiggle · Modo (1 Ciclo · 2 Pingpong)");
  assert.equal(result.records[0].actualControl, "slider");
  assert.equal(result.records[0].fallback, "dropdown-as-slider");
  assert.equal(result.warnings[0].code, "DROPDOWN_FALLBACK");
});

test("reader resolve por nome após reordenação e atualiza somente o índice da metadata", async () => {
  const { scope, layer } = await fixture();
  const created = scope.MotionLiveControls.create(
    layer,
    config(
      [binding("a", "slider", 1), binding("b", "angle", 2)],
      { a: 10, b: 20 }
    )
  );
  layer.effects.move(1, 2);

  const read = scope.MotionLiveControls.read(layer, created.records);

  assert.deepEqual(read.values, { a: 10, b: 20 });
  assert.deepEqual(read.records.map((record) => record.index), [2, 1]);
  assert.deepEqual(read.entries.map((entry) => entry.resolution), ["name", "name"]);
  assert.equal(read.warnings.length, 0);
  assert.match(read.fingerprint, /^lc1:/);
});

test("rename usa fallback índice+matchName e relink grava o novo nome sem renomear o efeito", async () => {
  const { scope, layer } = await fixture();
  const created = scope.MotionLiveControls.create(
    layer,
    config([binding("a", "slider", 1)], { a: 10 })
  );
  layer.effects.states[0].name = "Meu controle";

  const read = scope.MotionLiveControls.read(layer, created.records);
  assert.equal(read.values.a, 10);
  assert.equal(read.entries[0].resolution, "index");
  assert.equal(read.entries[0].requiresRelink, true);
  assert.equal(read.records[0].name, created.records[0].name, "leitura não aceita rename silenciosamente");

  const expression = new FakeExpressionProperty();
  const relinked = scope.MotionLiveControls.relink(
    layer,
    created.records[0],
    1,
    [expression],
    (record) => scope.MotionLiveControls.expressionReference(record)
  );

  assert.equal(relinked.record.name, "Meu controle");
  assert.equal(layer.effects.states[0].name, "Meu controle");
  assert.equal(expression.expression, 'effect("Meu controle")(1)');
});

test("reader informa CONTROLS_MISSING sem inventar outro efeito", async () => {
  const { scope, layer } = await fixture();
  const created = scope.MotionLiveControls.create(
    layer,
    config([binding("a", "slider", 1)], { a: 10 })
  );
  layer.effects.states.length = 0;
  layer.effects.generation += 1;

  const read = scope.MotionLiveControls.read(layer, created.records);

  assert.deepEqual(read.values, {});
  assert.equal(read.entries[0].resolution, "missing");
  assert.equal(read.warnings[0].code, "CONTROLS_MISSING");
  assert.equal(read.warnings[0].action, "relink");
});

test("updater preserva override manual, recria só o faltante e pode sobrescrever com consentimento", async () => {
  const { scope, layer } = await fixture();
  const bindings = [binding("a", "slider", 1), binding("b", "checkbox", 2)];
  const created = scope.MotionLiveControls.create(layer, config(bindings, { a: 10, b: false }));
  layer.effects.states[0].property.value = 33;
  layer.effects.states.splice(1, 1);
  layer.effects.generation += 1;

  const preserved = scope.MotionLiveControls.update(
    layer,
    config(bindings, { a: 40, b: true }),
    created.records
  );

  assert.equal(layer.effects.states[0].property.value, 33);
  assert.equal(layer.effects.states[1].property.value, 1);
  assert.deepEqual(preserved.userOverrides, { a: 33 });
  assert.equal(preserved.warnings.some((warning) => warning.code === "CONTROLS_MISSING"), true);
  assert.equal(preserved.records[0].lastAppliedValue, 10);
  assert.equal(preserved.records[1].lastAppliedValue, true);

  const overwritten = scope.MotionLiveControls.update(
    layer,
    config(bindings, { a: 40, b: true }),
    preserved.records,
    { overwriteUserOverrides: true }
  );
  assert.equal(layer.effects.states[0].property.value, 40);
  assert.deepEqual(overwritten.userOverrides, {});
});

test("updater nunca remove keyframes e reporta o controle animado como override", async () => {
  const { scope, layer } = await fixture();
  const controls = config([binding("a", "slider", 1)], { a: 10 });
  const created = scope.MotionLiveControls.create(layer, controls);
  const property = layer.effects.states[0].property;
  property.value = 25;
  property.keys = [{ time: 0, value: 10 }, { time: 1, value: 25 }];

  const updated = scope.MotionLiveControls.update(
    layer,
    config(controls.bindings, { a: 99 }),
    created.records,
    { overwriteUserOverrides: true }
  );

  assert.equal(property.value, 25);
  assert.equal(property.keys.length, 2);
  assert.deepEqual(property.removeKeyCalls, []);
  assert.equal(updated.warnings[0].code, "CONTROLS_KEYFRAMED");
  assert.equal(updated.userOverrides.a, 25);
});

test("updater restaura valores sobreviventes quando uma escrita posterior falha", async () => {
  const { scope, layer } = await fixture();
  const bindings = [binding("a", "slider", 1), binding("b", "angle", 2)];
  const created = scope.MotionLiveControls.create(layer, config(bindings, { a: 10, b: 20 }));
  layer.effects.states[1].property.failSet = true;

  assert.throws(
    () => scope.MotionLiveControls.update(layer, config(bindings, { a: 30, b: 40 }), created.records),
    /setValue failed/
  );
  assert.equal(layer.effects.states[0].property.value, 10);
  assert.equal(layer.effects.states[1].property.value, 20);
});

test("updater mantém metadata e efeito órfãos disponíveis para Religar ou Limpar", async () => {
  const { scope, layer } = await fixture();
  const originalBindings = [binding("a", "slider", 1), binding("legado", "angle", 2)];
  const created = scope.MotionLiveControls.create(
    layer,
    config(originalBindings, { a: 10, legado: 20 })
  );

  const updated = scope.MotionLiveControls.update(
    layer,
    config([binding("a", "slider", 1)], { a: 15 }),
    created.records
  );

  assert.equal(layer.effects.states.length, 2, "órfão nunca é apagado automaticamente");
  assert.equal(updated.records.length, 2, "metadata órfã continua persistível");
  assert.equal(updated.orphanedRecords[0].paramId, "legado");
  assert.equal(updated.warnings.some((warning) => warning.code === "CONTROLS_ORPHANED"), true);
});

test("relink restaura todas as expressões se uma escrita posterior falha", async () => {
  const { scope, layer } = await fixture();
  const created = scope.MotionLiveControls.create(
    layer,
    config([binding("a", "slider", 1)], { a: 10 })
  );
  layer.effects.states[0].name = "Novo nome";
  const first = new FakeExpressionProperty("primeira");
  const second = new FakeExpressionProperty("segunda", true);

  assert.throws(
    () =>
      scope.MotionLiveControls.relink(
        layer,
        created.records[0],
        1,
        [first, second],
        (record) => scope.MotionLiveControls.expressionReference(record)
      ),
    /expression write failed/
  );
  assert.equal(first.expression, "primeira");
  assert.equal(second.expression, "segunda");
});

test("falha no writer remove apenas os controles criados e sinaliza rollback impossível", async () => {
  const { scope, layer } = await fixture({ failSetFor: [MATCH.angle] });
  const userEffect = layer.effects.seed("ADBE Gaussian Blur 2", "Desfoque do usuário", 15);
  const controls = config(
    [binding("a", "slider", 1), binding("b", "angle", 2)],
    { a: 10, b: 20 }
  );

  assert.throws(() => scope.MotionLiveControls.create(layer, controls), /setValue failed/);
  assert.deepEqual(layer.effects.states, [userEffect]);

  const broken = await fixture({ failSetFor: [MATCH.angle], failRemoveFor: [MATCH.slider] });
  assert.throws(
    () => scope.MotionLiveControls.create(broken.layer, controls),
    (error) => error.motionCode === "ROLLBACK_FAILED"
  );
});

test("validação e capacidade falham antes de qualquer mutação", async () => {
  const { scope, layer } = await fixture();
  const invalid = config(
    [
      binding("modo", "dropdown", 1, {
        options: [
          { value: 1, label: { "pt-BR": "A|B", "en-US": "A|B" } },
          { value: 2, label: { "pt-BR": "OK", "en-US": "OK" } }
        ]
      })
    ],
    { modo: 1 }
  );
  assert.throws(() => scope.MotionLiveControls.create(layer, invalid), /opção/i);
  assert.equal(layer.effects.states.length, 0);

  assert.throws(
    () =>
      scope.MotionLiveControls.create(
        layer,
        config([binding("__proto__", "slider", 1)], Object.fromEntries([["__proto__", 1]]))
      ),
    /paramId inválido/i
  );
  assert.equal(layer.effects.states.length, 0);

  const tooMany = Array.from({ length: 13 }, (_, index) => binding(`p${index}`, "slider", index));
  assert.throws(
    () => scope.MotionLiveControls.create(layer, config(tooMany, Object.fromEntries(tooMany.map((b) => [b.paramId, 1])))),
    (error) => error.code === "CONTROLS_OVERFLOW" && error.suggestedTarget === "controller"
  );
  assert.equal(layer.effects.states.length, 0);
});

test("planejador escolhe layer, controller, control room e controller de câmera", async () => {
  const { scope } = await fixture();
  assert.equal(scope.MotionLiveControls.planPlacement({ selectionCount: 1 }).targetKind, "layer");
  assert.equal(scope.MotionLiveControls.planPlacement({ selectionCount: 8 }).targetKind, "controller");
  assert.equal(scope.MotionLiveControls.planPlacement({ selectionCount: 9 }).targetKind, "comp-controller");
  assert.equal(
    scope.MotionLiveControls.planPlacement({ selectionCount: 2, cameraRig: true }).targetKind,
    "camera-controller"
  );
  assert.equal(
    scope.MotionLiveControls.planPlacement({ selectionCount: 1, existingControlCount: 11, requestedControlCount: 2 }).targetKind,
    "controller"
  );
});
