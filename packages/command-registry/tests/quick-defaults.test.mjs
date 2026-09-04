import test from "node:test";
import assert from "node:assert/strict";

import {
  deriveQuickDefaults,
  quickSecondsToFrames,
  resolveQuickPresetId,
  scaleQuickPixelsFrom1080
} from "../dist/index.js";

const FPS_FIXTURES = [24, 25, 29.97, 60];
const RESOLUTION_FIXTURES = [
  { width: 1080, height: 1920, scale: 1 },
  { width: 1920, height: 1080, scale: 1 },
  { width: 3840, height: 2160, scale: 2 }
];

function context(overrides = {}) {
  return {
    host: "after-effects",
    hostVersion: "26.3",
    fps: 25,
    compWidth: 1920,
    compHeight: 1080,
    compDurationSeconds: 12,
    currentTimeSeconds: 2,
    workAreaStart: 0,
    workAreaDuration: 12,
    selectionCount: 3,
    selectionKinds: ["av"],
    selectionHasKeyframes: false,
    selectionHasExpressions: false,
    selectionIs3D: false,
    averageLayerDurationSeconds: 5,
    existingRigIdsInSelection: [],
    lastUsedPresetId: "preset.project",
    ...overrides
  };
}

function options(overrides = {}) {
  return {
    factoryPresetId: "preset.factory",
    availablePresetIds: ["preset.factory", "preset.global", "preset.project"],
    globalLastUsedPresetId: "preset.global",
    ...overrides
  };
}

function assertClose(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${message}: ${actual} !== ${expected}`);
}

test("deriveQuickDefaults é puro e cobre as fixtures normativas de fps e resolução", () => {
  for (const fps of FPS_FIXTURES) {
    for (const resolution of RESOLUTION_FIXTURES) {
      const input = context({
        fps,
        compWidth: resolution.width,
        compHeight: resolution.height
      });
      const config = options();
      const inputBefore = structuredClone(input);
      const configBefore = structuredClone(config);

      const first = deriveQuickDefaults(input, config);
      const second = deriveQuickDefaults(input, config);

      assert.deepEqual(first, second, `${fps} fps em ${resolution.width}x${resolution.height}`);
      assert.deepEqual(input, inputBefore, "o contexto de origem não pode ser mutado");
      assert.deepEqual(config, configBefore, "as opções de origem não podem ser mutadas");
      assert.equal(first.fps, fps);
      assert.equal(first.resolutionScale, resolution.scale);
      assert.equal(first.timing.startTimeSeconds, 2);
      assert.equal(first.timing.durationSeconds, 1);
      assert.equal(first.timing.durationFrames, Math.round(fps));
      assert.equal(first.presetId, "preset.project");
      assert.ok(Object.isFrozen(first));
      assert.ok(Object.isFrozen(first.timing));
      assert.ok(Object.isFrozen(first.axes));
      assert.ok(Object.isFrozen(first.propertyTargets));
    }
  }
});

test("tempo em segundos vira frames no fps real com arredondamento explícito", () => {
  const expectedHalfSecond = new Map([
    [24, 12],
    [25, 13],
    [29.97, 15],
    [60, 30]
  ]);

  for (const [fps, expected] of expectedHalfSecond) {
    assert.equal(quickSecondsToFrames(0.5, fps), expected);
  }
  assert.equal(quickSecondsToFrames(0.5, 25, "floor"), 12);
  assert.equal(quickSecondsToFrames(0.5, 25, "ceil"), 13);
  assert.throws(() => quickSecondsToFrames(-0.1, 25), /seconds/i);
  assert.throws(() => quickSecondsToFrames(1, 0), /fps/i);
  assert.throws(() => quickSecondsToFrames(1, 25, "truncate"), /rounding/i);
});

test("pixels escalam pelo menor lado com base 1080 sem depender da orientação", () => {
  for (const fixture of RESOLUTION_FIXTURES) {
    assert.equal(
      scaleQuickPixelsFrom1080(12, context({
        compWidth: fixture.width,
        compHeight: fixture.height
      })),
      12 * fixture.scale
    );
  }
  assert.equal(scaleQuickPixelsFrom1080(-8, context()), -8);
  assert.throws(() => scaleQuickPixelsFrom1080(Number.NaN, context()), /basePixels/i);
});

test("janela começa no CTI e nunca atravessa o fim da comp ou da seleção", () => {
  const compBoundary = deriveQuickDefaults(
    context({
      compDurationSeconds: 10,
      currentTimeSeconds: 9.6,
      workAreaDuration: 10
    }),
    options()
  );
  assertClose(compBoundary.timing.durationSeconds, 0.4, "limite da composição");
  assert.equal(compBoundary.timing.durationFrames, 10);

  const layerBoundary = deriveQuickDefaults(
    context({ averageLayerDurationSeconds: 0.25 }),
    options()
  );
  assert.equal(layerBoundary.timing.durationSeconds, 0.25);
  assert.equal(layerBoundary.timing.durationFrames, 6);

  const noSelection = deriveQuickDefaults(
    context({
      selectionCount: 0,
      selectionKinds: [],
      averageLayerDurationSeconds: 0
    }),
    options({ preferredDurationSeconds: 0.5 })
  );
  assert.equal(noSelection.timing.durationSeconds, 0.5);

  const atEnd = deriveQuickDefaults(
    context({ currentTimeSeconds: 12 }),
    options()
  );
  assert.equal(atEnd.timing.durationSeconds, 0);
  assert.equal(atEnd.timing.durationFrames, 0);
});

test("stagger diminui com seleções grandes e o span sempre cabe na janela", () => {
  const cases = [
    { count: 2, expected: 2 },
    { count: 15, expected: 1 },
    { count: 30, expected: 0 }
  ];

  for (const fixture of cases) {
    const derived = deriveQuickDefaults(
      context({ selectionCount: fixture.count }),
      options({ preferredStaggerFrames: 2 })
    );
    assert.equal(derived.staggerFrames, fixture.expected);
    assert.ok(
      derived.staggerFrames * Math.max(0, fixture.count - 1) <= derived.timing.durationFrames
    );
  }
});

test("tipo de seleção, presença de keys e 3D derivam alvos, estratégia e eixos", () => {
  const derived = deriveQuickDefaults(
    context({
      selectionKinds: ["text", "shape", "av", "text", "camera"],
      selectionHasKeyframes: true,
      selectionIs3D: true
    }),
    options()
  );

  assert.deepEqual(derived.propertyTargets, [
    "source-text",
    "scale",
    "path",
    "trim",
    "position",
    "opacity"
  ]);
  assert.equal(derived.animationMode, "modify-keyframes");
  assert.deepEqual(derived.axes, ["x", "y", "z"]);

  const unsupported = deriveQuickDefaults(
    context({ selectionKinds: ["camera"], selectionIs3D: false }),
    options()
  );
  assert.deepEqual(unsupported.propertyTargets, []);
  assert.equal(unsupported.animationMode, "create-expression");
  assert.deepEqual(unsupported.axes, ["x", "y"]);
});

test("preset segue projeto, usuário global e fábrica sem escolher id indisponível", () => {
  assert.equal(resolveQuickPresetId(context(), options()), "preset.project");
  assert.equal(
    resolveQuickPresetId(context({ lastUsedPresetId: "preset.removed" }), options()),
    "preset.global"
  );
  assert.equal(
    resolveQuickPresetId(
      context({ lastUsedPresetId: "preset.removed" }),
      options({ globalLastUsedPresetId: "preset.also-removed" })
    ),
    "preset.factory"
  );
  assert.throws(
    () => resolveQuickPresetId(context(), options({ availablePresetIds: ["preset.project"] })),
    /factoryPresetId/i
  );
});

test("rig existente deriva Create ou Adjust sem escolher alvo ambíguo", () => {
  assert.deepEqual(deriveQuickDefaults(context(), options()).rigIntent, { mode: "create" });

  const adjust = deriveQuickDefaults(
    context({ existingRigIdsInSelection: ["rig.motion.1", "rig.motion.1"] }),
    options()
  );
  assert.deepEqual(adjust.rigIntent, {
    mode: "adjust",
    targetRigId: "rig.motion.1"
  });

  const ambiguous = deriveQuickDefaults(
    context({ existingRigIdsInSelection: ["rig.motion.1", "rig.motion.2"] }),
    options()
  );
  assert.deepEqual(ambiguous.rigIntent, {
    mode: "ambiguous",
    rigIds: ["rig.motion.1", "rig.motion.2"]
  });
  assert.ok(Object.isFrozen(ambiguous.rigIntent));
  assert.ok(Object.isFrozen(ambiguous.rigIntent.rigIds));
});

test("contextos e opções inválidos falham fechados antes da derivação", () => {
  const invalidContexts = [
    context({ fps: 0 }),
    context({ compWidth: Number.NaN }),
    context({ compHeight: 0 }),
    context({ currentTimeSeconds: 13 }),
    context({ workAreaStart: 11, workAreaDuration: 2 }),
    context({ selectionCount: 1.5 }),
    context({ selectionKinds: ["footage"] }),
    context({ existingRigIdsInSelection: [""] }),
    context({ lastUsedPresetId: "   " })
  ];

  for (const invalid of invalidContexts) {
    assert.throws(() => deriveQuickDefaults(invalid, options()), /QuickContext inválido/);
  }

  assert.throws(
    () => deriveQuickDefaults(context(), options({ preferredDurationSeconds: 0 })),
    /preferredDurationSeconds/
  );
  assert.throws(
    () => deriveQuickDefaults(context(), options({ preferredStaggerFrames: 1.5 })),
    /preferredStaggerFrames/
  );
  assert.throws(
    () => deriveQuickDefaults(context(), options({ availablePresetIds: ["preset.factory", "preset.factory"] })),
    /availablePresetIds/
  );
});

test("accessor hostil é recusado sem executar getter", () => {
  let getterCalls = 0;
  const hostile = context();
  Object.defineProperty(hostile, "fps", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return 25;
    }
  });

  assert.throws(() => deriveQuickDefaults(hostile, options()), /accessor/i);
  assert.equal(getterCalls, 0);
});

test("snapshot reflexivo enumera as chaves do Proxy uma única vez", () => {
  let ownKeysCalls = 0;
  const proxiedContext = new Proxy(context(), {
    ownKeys(target) {
      ownKeysCalls += 1;
      if (ownKeysCalls > 1) throw new Error("ownKeys não pode ser repetido");
      return Reflect.ownKeys(target);
    }
  });

  assert.equal(deriveQuickDefaults(proxiedContext, options()).fps, 25);
  assert.equal(ownKeysCalls, 1);
});

test("arrays são inspecionados por descriptors sem executar traps ou aceitar shape ambíguo", () => {
  let lengthReads = 0;
  const proxiedKinds = new Proxy(["av"], {
    get(target, property, receiver) {
      if (property === "length") lengthReads += 1;
      return Reflect.get(target, property, receiver);
    }
  });
  assert.equal(
    deriveQuickDefaults(context({ selectionKinds: proxiedKinds }), options()).presetId,
    "preset.project"
  );
  assert.equal(lengthReads, 0, "o gate não deve ler length pelo Proxy");

  const sparseKinds = [];
  sparseKinds.length = 1;
  assert.throws(
    () => deriveQuickDefaults(context({ selectionKinds: sparseKinds }), options()),
    /esparso/i
  );

  let indexGetterCalls = 0;
  const accessorKinds = [];
  Object.defineProperty(accessorKinds, "0", {
    enumerable: true,
    get() {
      indexGetterCalls += 1;
      return "av";
    }
  });
  accessorKinds.length = 1;
  assert.throws(
    () => deriveQuickDefaults(context({ selectionKinds: accessorKinds }), options()),
    /accessor/i
  );
  assert.equal(indexGetterCalls, 0);

  const decoratedKinds = ["av"];
  decoratedKinds.source = "host";
  assert.throws(
    () => deriveQuickDefaults(context({ selectionKinds: decoratedKinds }), options()),
    /propriedade extra/i
  );
});

test("objetos não simples, Symbols e campos extras falham fechados", () => {
  const inherited = Object.assign(Object.create({ unsafe: true }), context());
  assert.throws(() => deriveQuickDefaults(inherited, options()), /protótipo customizado/i);

  const symbolContext = context();
  symbolContext[Symbol("hidden")] = true;
  assert.throws(() => deriveQuickDefaults(symbolContext, options()), /Symbol/i);

  assert.throws(
    () => deriveQuickDefaults(context({ unexpected: true }), options()),
    /campo desconhecido/i
  );
  assert.throws(
    () => deriveQuickDefaults(context(), options({ availablePresetIds: "preset.factory" })),
    /esperado array/i
  );
});
