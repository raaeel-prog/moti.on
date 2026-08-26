import test from "node:test";
import assert from "node:assert/strict";

import {
  KEYFRAME_CORE_ERROR_CODES,
  KeyframeCoreError,
  captureKeyframeSnapshot,
  compareKeyframeSnapshots,
  createRestorePlan,
  createTimebase,
  deserializeKeyframeSnapshot,
  framesToSeconds,
  keyframeSnapshotsEqual,
  secondsToFrames,
  serializeKeyframeSnapshot,
  serializeRestorePlan,
  snapSecondsToFrame,
  validateKeyframeSnapshot
} from "../dist/index.js";

function expectCode(code, callback) {
  assert.throws(callback, (error) => {
    assert.ok(error instanceof KeyframeCoreError);
    assert.equal(error.code, code);
    return true;
  });
}

function scalarKey(timeSeconds, value, overrides = {}) {
  return {
    timeSeconds,
    value,
    interpolation: { in: "bezier", out: "bezier" },
    temporalEase: {
      in: [{ speed: 10, influence: 33.333 }],
      out: [{ speed: 20, influence: 66.667 }]
    },
    temporalContinuous: true,
    temporalAutoBezier: false,
    spatial: null,
    roving: false,
    selected: true,
    ...overrides
  };
}

function spatialKey(timeSeconds, value, overrides = {}) {
  return {
    timeSeconds,
    value,
    interpolation: { in: "bezier", out: "bezier" },
    temporalEase: {
      in: [{ speed: 48.125, influence: 33.333 }],
      out: [{ speed: 96.25, influence: 66.667 }]
    },
    temporalContinuous: true,
    temporalAutoBezier: false,
    spatial: {
      inTangent: [-10.25, -20.5, 0],
      outTangent: [12.75, 25.5, 0],
      continuous: true,
      autoBezier: false
    },
    roving: false,
    selected: true,
    ...overrides
  };
}

function scalarSnapshot() {
  return captureKeyframeSnapshot(
    { valueDimensions: 1, temporalEaseDimensions: 1, spatial: false },
    [
      scalarKey(10.25, 5, { label: 3 }),
      scalarKey(10.75, 25, {
        interpolation: { in: "linear", out: "hold" },
        temporalContinuous: false,
        selected: false
      })
    ]
  );
}

function spatialSnapshot() {
  return captureKeyframeSnapshot(
    { valueDimensions: 3, temporalEaseDimensions: 1, spatial: true },
    [
      spatialKey(2.5, [10, 20, 30], { label: 4 }),
      spatialKey(3.25, [40, 50, 60], {
        spatial: {
          inTangent: [-5, -4, -3],
          outTangent: [5, 4, 3],
          continuous: false,
          autoBezier: true
        },
        temporalAutoBezier: true,
        selected: false
      })
    ]
  );
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

test("o catalogo de erros e fechado, unico e inclui os gates criticos", () => {
  assert.equal(new Set(KEYFRAME_CORE_ERROR_CODES).size, KEYFRAME_CORE_ERROR_CODES.length);
  for (const code of [
    "NON_FINITE_NUMBER",
    "KEYFRAME_ORDER_INVALID",
    "DUPLICATE_KEYFRAME_TIME",
    "KEYFRAME_CONFLICT",
    "NON_CANONICAL_SERIALIZATION",
    "INVALID_TIMEBASE",
    "INVALID_DROP_FRAME"
  ]) {
    assert.ok(KEYFRAME_CORE_ERROR_CODES.includes(code), code);
  }
  assert.ok(Object.isFrozen(KEYFRAME_CORE_ERROR_CODES));
});

test("captura escalar calcula timing relativo e preserva todos os campos", () => {
  const snapshot = scalarSnapshot();

  assert.equal(snapshot.format, "motion-keyframes");
  assert.equal(snapshot.schemaVersion, 1);
  assert.deepEqual(snapshot.property, {
    valueDimensions: 1,
    temporalEaseDimensions: 1,
    spatial: false
  });
  assert.equal(snapshot.sourceStartSeconds, 10.25);
  assert.deepEqual(
    snapshot.keyframes.map((keyframe) => keyframe.relativeTimeSeconds),
    [0, 0.5]
  );
  assert.equal(snapshot.keyframes[0].label, 3);
  assert.equal(snapshot.keyframes[1].interpolation.out, "hold");
  assert.equal(snapshot.keyframes[1].selected, false);
});

test("captura clona profundamente, congela o resultado e nao toma ownership da entrada", () => {
  const value = [10, 20, 30];
  const tangent = [12.75, 25.5, 0];
  const keyframe = spatialKey(1, value, {
    spatial: {
      inTangent: [-10.25, -20.5, 0],
      outTangent: tangent,
      continuous: true,
      autoBezier: false
    }
  });
  const snapshot = captureKeyframeSnapshot(
    { valueDimensions: 3, temporalEaseDimensions: 1, spatial: true },
    [keyframe]
  );

  value[0] = 999;
  tangent[0] = 999;
  keyframe.temporalEase.in[0].speed = 999;

  assert.deepEqual(snapshot.keyframes[0].value, [10, 20, 30]);
  assert.deepEqual(snapshot.keyframes[0].spatial.outTangent, [12.75, 25.5, 0]);
  assert.equal(snapshot.keyframes[0].temporalEase.in[0].speed, 48.125);
  assert.ok(Object.isFrozen(snapshot));
  assert.ok(Object.isFrozen(snapshot.keyframes));
  assert.ok(Object.isFrozen(snapshot.keyframes[0].value));
  assert.ok(Object.isFrozen(snapshot.keyframes[0].temporalEase.in[0]));
  assert.ok(Object.isFrozen(snapshot.keyframes[0].spatial.outTangent));
  assert.equal(Object.isFrozen(keyframe), false);
  assert.throws(() => {
    snapshot.keyframes[0].selected = false;
  }, TypeError);
});

test("round-trip canonico preserva vetor, ease espacial unitario, tangentes, flags e label", () => {
  const source = spatialSnapshot();
  const serialized = serializeKeyframeSnapshot(source);
  const restored = deserializeKeyframeSnapshot(serialized);

  assert.deepEqual(restored, source);
  assert.equal(serializeKeyframeSnapshot(restored), serialized);
  assert.equal(restored.property.valueDimensions, 3);
  assert.equal(restored.property.temporalEaseDimensions, 1);
  assert.equal(restored.keyframes[0].temporalEase.in.length, 1);
  assert.deepEqual(restored.keyframes[0].spatial.inTangent, [-10.25, -20.5, 0]);
  assert.equal(restored.keyframes[1].spatial.autoBezier, true);
  assert.equal(restored.keyframes[1].temporalAutoBezier, true);
  assert.equal(restored.keyframes[0].label, 4);
});

test("label opcional continua ausente depois do round-trip", () => {
  const source = captureKeyframeSnapshot(
    { valueDimensions: 1, temporalEaseDimensions: 1, spatial: false },
    [scalarKey(0, 10)]
  );
  const restored = deserializeKeyframeSnapshot(serializeKeyframeSnapshot(source));

  assert.equal("label" in source.keyframes[0], false);
  assert.equal("label" in restored.keyframes[0], false);
});

test("serializacao e deterministica e ordena chaves independentemente da ordem de entrada", () => {
  const source = clone(spatialSnapshot());
  const reordered = {
    keyframes: source.keyframes,
    sourceStartSeconds: source.sourceStartSeconds,
    property: {
      spatial: source.property.spatial,
      temporalEaseDimensions: source.property.temporalEaseDimensions,
      valueDimensions: source.property.valueDimensions
    },
    schemaVersion: source.schemaVersion,
    format: source.format
  };

  assert.equal(
    serializeKeyframeSnapshot(validateKeyframeSnapshot(reordered)),
    serializeKeyframeSnapshot(spatialSnapshot())
  );
});

test("desserializacao recusa JSON nao canonico, chave duplicada e versao futura", () => {
  const serialized = serializeKeyframeSnapshot(scalarSnapshot());
  expectCode("NON_CANONICAL_SERIALIZATION", () =>
    deserializeKeyframeSnapshot(` ${serialized}`)
  );
  expectCode("NON_CANONICAL_SERIALIZATION", () =>
    deserializeKeyframeSnapshot(serialized.replace("{", '{"format":"motion-keyframes",'))
  );

  const future = clone(scalarSnapshot());
  future.schemaVersion = 2;
  expectCode("UNSUPPORTED_SCHEMA_VERSION", () => validateKeyframeSnapshot(future));
});

test("shape desconhecido, accessors e prototype customizado falham fechados", () => {
  const extra = clone(scalarSnapshot());
  extra.future = true;
  expectCode("INVALID_SNAPSHOT", () => validateKeyframeSnapshot(extra));

  const accessor = clone(scalarSnapshot());
  Object.defineProperty(accessor.keyframes[0], "selected", {
    enumerable: true,
    get() {
      throw new Error("nao deve executar");
    }
  });
  expectCode("INVALID_SNAPSHOT", () => validateKeyframeSnapshot(accessor));

  const inherited = Object.assign(Object.create({ future: true }), clone(scalarSnapshot()));
  expectCode("INVALID_SNAPSHOT", () => validateKeyframeSnapshot(inherited));
});

test("dimensionalidade de value, ease e tangent precisa concordar com o descriptor", () => {
  expectCode("INVALID_DIMENSIONALITY", () =>
    captureKeyframeSnapshot(
      { valueDimensions: 3, temporalEaseDimensions: 1, spatial: true },
      [spatialKey(0, [1, 2])]
    )
  );

  expectCode("INVALID_TEMPORAL_EASE", () =>
    captureKeyframeSnapshot(
      { valueDimensions: 2, temporalEaseDimensions: 2, spatial: false },
      [scalarKey(0, [1, 2])]
    )
  );

  expectCode("INVALID_SPATIAL_DATA", () =>
    captureKeyframeSnapshot(
      { valueDimensions: 3, temporalEaseDimensions: 1, spatial: true },
      [spatialKey(0, [1, 2, 3], {
        spatial: {
          inTangent: [0, 0],
          outTangent: [1, 1, 1],
          continuous: false,
          autoBezier: false
        }
      })]
    )
  );
});

test("descriptor recusa dimensoes impossiveis e spatial escalar", () => {
  for (const descriptor of [
    { valueDimensions: 0, temporalEaseDimensions: 1, spatial: false },
    { valueDimensions: 5, temporalEaseDimensions: 1, spatial: false },
    { valueDimensions: 2, temporalEaseDimensions: 3, spatial: false },
    { valueDimensions: 1, temporalEaseDimensions: 1, spatial: true },
    { valueDimensions: 4, temporalEaseDimensions: 1, spatial: true }
  ]) {
    expectCode("INVALID_DIMENSIONALITY", () =>
      captureKeyframeSnapshot(descriptor, [scalarKey(0, 1)])
    );
  }
});

test("spatial ausente ou presente no tipo errado e roving invalido sao conflitos", () => {
  expectCode("KEYFRAME_CONFLICT", () =>
    captureKeyframeSnapshot(
      { valueDimensions: 2, temporalEaseDimensions: 1, spatial: true },
      [scalarKey(0, [1, 2])]
    )
  );
  expectCode("KEYFRAME_CONFLICT", () =>
    captureKeyframeSnapshot(
      { valueDimensions: 2, temporalEaseDimensions: 2, spatial: false },
      [spatialKey(0, [1, 2], {
        spatial: {
          inTangent: [0, 0],
          outTangent: [1, 1],
          continuous: false,
          autoBezier: false
        }
      })]
    )
  );
  expectCode("KEYFRAME_CONFLICT", () =>
    captureKeyframeSnapshot(
      { valueDimensions: 1, temporalEaseDimensions: 1, spatial: false },
      [scalarKey(0, 1, { roving: true })]
    )
  );
});

test("somente key espacial intermediaria pode ser roving", () => {
  const keys = [
    spatialKey(0, [0, 0]),
    spatialKey(1, [10, 10], {
      spatial: {
        inTangent: [-1, -1],
        outTangent: [1, 1],
        continuous: true,
        autoBezier: false
      },
      roving: true
    }),
    spatialKey(2, [20, 20])
  ];
  for (const key of [keys[0], keys[2]]) {
    key.spatial = {
      inTangent: [-1, -1],
      outTangent: [1, 1],
      continuous: true,
      autoBezier: false
    };
  }

  const snapshot = captureKeyframeSnapshot(
    { valueDimensions: 2, temporalEaseDimensions: 1, spatial: true },
    keys
  );
  assert.equal(snapshot.keyframes[1].roving, true);

  keys[0].roving = true;
  expectCode("KEYFRAME_CONFLICT", () =>
    captureKeyframeSnapshot(
      { valueDimensions: 2, temporalEaseDimensions: 1, spatial: true },
      keys
    )
  );
});

test("autoBezier temporal com HOLD e label fora do intervalo falham por conflito", () => {
  expectCode("KEYFRAME_CONFLICT", () =>
    captureKeyframeSnapshot(
      { valueDimensions: 1, temporalEaseDimensions: 1, spatial: false },
      [scalarKey(0, 1, {
        interpolation: { in: "bezier", out: "hold" },
        temporalAutoBezier: true
      })]
    )
  );
  for (const label of [-1, 17, 1.5]) {
    expectCode("KEYFRAME_CONFLICT", () =>
      captureKeyframeSnapshot(
        { valueDimensions: 1, temporalEaseDimensions: 1, spatial: false },
        [scalarKey(0, 1, { label })]
      )
    );
  }
});

test("interpolation e influence invalidos sao recusados", () => {
  expectCode("INVALID_INTERPOLATION", () =>
    captureKeyframeSnapshot(
      { valueDimensions: 1, temporalEaseDimensions: 1, spatial: false },
      [scalarKey(0, 1, { interpolation: { in: "magica", out: "linear" } })]
    )
  );
  for (const influence of [0.099, 100.001]) {
    expectCode("INVALID_TEMPORAL_EASE", () =>
      captureKeyframeSnapshot(
        { valueDimensions: 1, temporalEaseDimensions: 1, spatial: false },
        [scalarKey(0, 1, {
          temporalEase: {
            in: [{ speed: 1, influence }],
            out: [{ speed: 1, influence: 50 }]
          }
        })]
      )
    );
  }
});

test("NaN e infinitos falham em todo campo numerico relevante", () => {
  const invalidKeys = [
    scalarKey(Number.NaN, 1),
    scalarKey(0, Number.POSITIVE_INFINITY),
    scalarKey(0, 1, {
      temporalEase: {
        in: [{ speed: Number.NaN, influence: 50 }],
        out: [{ speed: 1, influence: 50 }]
      }
    })
  ];

  for (const keyframe of invalidKeys) {
    expectCode("NON_FINITE_NUMBER", () =>
      captureKeyframeSnapshot(
        { valueDimensions: 1, temporalEaseDimensions: 1, spatial: false },
        [keyframe]
      )
    );
  }

  expectCode("NON_FINITE_NUMBER", () =>
    captureKeyframeSnapshot(
      { valueDimensions: 2, temporalEaseDimensions: 1, spatial: true },
      [spatialKey(0, [1, 2], {
        spatial: {
          inTangent: [Number.NEGATIVE_INFINITY, 0],
          outTangent: [0, 0],
          continuous: false,
          autoBezier: false
        }
      })]
    )
  );
});

test("lista vazia, ordem decrescente e timestamps duplicados falham fechados", () => {
  const property = { valueDimensions: 1, temporalEaseDimensions: 1, spatial: false };
  expectCode("INVALID_SNAPSHOT", () => captureKeyframeSnapshot(property, []));
  expectCode("KEYFRAME_ORDER_INVALID", () =>
    captureKeyframeSnapshot(property, [scalarKey(2, 2), scalarKey(1, 1)])
  );
  expectCode("DUPLICATE_KEYFRAME_TIME", () =>
    captureKeyframeSnapshot(property, [scalarKey(1, 1), scalarKey(1, 2)])
  );
  expectCode("DUPLICATE_KEYFRAME_TIME", () =>
    captureKeyframeSnapshot(
      property,
      [scalarKey(1, 1), scalarKey(1 + 5e-10, 2)],
      { timeToleranceSeconds: 1e-9 }
    )
  );
});

test("timing relativo inconsistente e tolerancia invalida falham", () => {
  const inconsistent = clone(scalarSnapshot());
  inconsistent.keyframes[1].relativeTimeSeconds += 0.25;
  expectCode("KEYFRAME_CONFLICT", () => validateKeyframeSnapshot(inconsistent));

  for (const timeToleranceSeconds of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
    expectCode("INVALID_TOLERANCE", () =>
      captureKeyframeSnapshot(
        { valueDimensions: 1, temporalEaseDimensions: 1, spatial: false },
        [scalarKey(0, 1)],
        { timeToleranceSeconds }
      )
    );
  }
});

test("comparacao aceita deltas dentro de tolerancias independentes", () => {
  const expected = spatialSnapshot();
  const actual = clone(expected);
  actual.sourceStartSeconds += 5e-7;
  actual.keyframes[0].timeSeconds += 5e-7;
  actual.keyframes[0].value[1] += 5e-5;
  actual.keyframes[0].temporalEase.in[0].speed += 5e-4;
  actual.keyframes[0].temporalEase.in[0].influence += 5e-4;
  actual.keyframes[0].spatial.outTangent[0] += 5e-5;

  const tolerance = {
    timeSeconds: 1e-6,
    value: 1e-4,
    easeSpeed: 1e-3,
    easeInfluence: 1e-3,
    spatialTangent: 1e-4
  };
  const comparison = compareKeyframeSnapshots(expected, actual, tolerance);

  assert.equal(comparison.equal, true);
  assert.deepEqual(comparison.differences, []);
  assert.equal(keyframeSnapshotsEqual(expected, actual, tolerance), true);
  assert.ok(Object.isFrozen(comparison));
  assert.ok(Object.isFrozen(comparison.differences));
});

test("comparacao relata caminhos deterministically e flags sempre sao exatas", () => {
  const expected = spatialSnapshot();
  const actual = clone(expected);
  actual.keyframes[0].value[0] += 0.1;
  actual.keyframes[0].selected = false;
  actual.keyframes[1].spatial.continuous = true;

  const comparison = compareKeyframeSnapshots(expected, actual, {
    value: 0.001,
    timeSeconds: 1,
    easeSpeed: 1,
    easeInfluence: 1,
    spatialTangent: 1
  });

  assert.equal(comparison.equal, false);
  assert.deepEqual(
    comparison.differences.map((difference) => difference.path),
    [
      "keyframes[0].value[0]",
      "keyframes[0].selected",
      "keyframes[1].spatial.continuous"
    ]
  );
  assert.equal(keyframeSnapshotsEqual(expected, actual, { value: 0.001 }), false);
});

test("comparacao recusa tolerancia negativa, NaN, infinita ou campo extra", () => {
  for (const tolerance of [
    { value: -1 },
    { easeSpeed: Number.NaN },
    { timeSeconds: Number.POSITIVE_INFINITY },
    { future: 1 }
  ]) {
    expectCode("INVALID_TOLERANCE", () =>
      compareKeyframeSnapshots(scalarSnapshot(), scalarSnapshot(), tolerance)
    );
  }
});

test("timebases usam as razoes NTSC reais e 30 exato", () => {
  const cases = [
    ["23.976", 24_000, 1_001, 24_000],
    ["29.97", 30_000, 1_001, 30_000],
    ["30", 30, 1, 30_030],
    ["59.94", 60_000, 1_001, 60_000]
  ];

  for (const [rate, numerator, denominator, frames] of cases) {
    const timebase = createTimebase(rate);
    assert.equal(timebase.numerator, numerator, rate);
    assert.equal(timebase.denominator, denominator, rate);
    assert.equal(secondsToFrames(1_001, timebase), frames, rate);
    assert.equal(framesToSeconds(frames, timebase), 1_001, rate);
    assert.ok(Object.isFrozen(timebase));
  }
});

test("drop-frame altera numeracao de timecode, nao duracao ou frame rate", () => {
  for (const rate of ["29.97", "59.94"]) {
    const ndf = createTimebase(rate);
    const df = createTimebase(rate, { dropFrame: true });
    assert.equal(df.dropFrame, true);
    assert.equal(secondsToFrames(60, df), secondsToFrames(60, ndf));
    assert.equal(framesToSeconds(10_000, df), framesToSeconds(10_000, ndf));
  }

  for (const rate of ["23.976", "30"]) {
    expectCode("INVALID_DROP_FRAME", () => createTimebase(rate, { dropFrame: true }));
  }
});

test("timebase, segundos e frames invalidos falham fechados", () => {
  for (const rate of ["24", "29.970", 29.97, null]) {
    expectCode("INVALID_TIMEBASE", () => createTimebase(rate));
  }
  const timebase = createTimebase("30");
  for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    expectCode("NON_FINITE_NUMBER", () => secondsToFrames(value, timebase));
    expectCode("NON_FINITE_NUMBER", () => framesToSeconds(value, timebase));
  }
  expectCode("INVALID_TIMEBASE", () => secondsToFrames(1, { ...timebase, numerator: 29.97 }));
});

test("snap para frame oferece nearest, floor e ceil sem perder subframes por padrao", () => {
  const timebase = createTimebase("29.97");
  const seconds = framesToSeconds(10.49, timebase);

  assert.equal(secondsToFrames(seconds, timebase), 10.49);
  assert.equal(secondsToFrames(snapSecondsToFrame(seconds, timebase, "nearest"), timebase), 10);
  assert.equal(secondsToFrames(snapSecondsToFrame(seconds, timebase, "floor"), timebase), 10);
  assert.equal(secondsToFrames(snapSecondsToFrame(seconds, timebase, "ceil"), timebase), 11);
  expectCode("INVALID_ROUNDING_MODE", () =>
    snapSecondsToFrame(seconds, timebase, "bankers")
  );
});

test("restore absoluto cria todas as keys antes de restaurar metadata em ordem canonica", () => {
  const plan = createRestorePlan(spatialSnapshot());

  assert.equal(plan.format, "motion-keyframe-restore-plan");
  assert.deepEqual(plan.timing, {
    mode: "absolute",
    sourceStartSeconds: 2.5,
    targetStartSeconds: 2.5
  });
  assert.deepEqual(
    plan.steps.map((step) => step.phase),
    [
      "create",
      "create",
      "temporal",
      "temporal",
      "spatial",
      "spatial",
      "roving",
      "roving",
      "label",
      "selection",
      "selection"
    ]
  );
  assert.deepEqual(
    plan.steps.filter((step) => step.phase === "create").map((step) => step.timeSeconds),
    [2.5, 3.25]
  );
  assert.deepEqual(plan.steps[0].value, [10, 20, 30]);
  assert.ok(Object.isFrozen(plan));
  assert.ok(Object.isFrozen(plan.steps));
  assert.ok(Object.isFrozen(plan.steps[0].value));
});

test("restore relativo desloca o grupo e preserva intervalos e relative timing", () => {
  const plan = createRestorePlan(scalarSnapshot(), {
    timing: { mode: "relative", targetStartSeconds: 100.125 }
  });
  const createSteps = plan.steps.filter((step) => step.phase === "create");

  assert.deepEqual(plan.timing, {
    mode: "relative",
    sourceStartSeconds: 10.25,
    targetStartSeconds: 100.125
  });
  assert.deepEqual(createSteps.map((step) => step.timeSeconds), [100.125, 100.625]);
  assert.deepEqual(createSteps.map((step) => step.relativeTimeSeconds), [0, 0.5]);
});

test("restore recusa colisao com key existente antes de emitir plano parcial", () => {
  expectCode("KEYFRAME_CONFLICT", () =>
    createRestorePlan(scalarSnapshot(), {
      timing: { mode: "relative", targetStartSeconds: 20 },
      occupiedTimesSeconds: [19, 20.5, 30]
    })
  );
  expectCode("KEYFRAME_CONFLICT", () =>
    createRestorePlan(scalarSnapshot(), {
      timing: { mode: "relative", targetStartSeconds: 20 },
      occupiedTimesSeconds: [20 + 5e-10],
      timeToleranceSeconds: 1e-9
    })
  );
});

test("restore recusa occupied times fora de ordem, duplicados ou nao finitos", () => {
  expectCode("KEYFRAME_ORDER_INVALID", () =>
    createRestorePlan(scalarSnapshot(), { occupiedTimesSeconds: [2, 1] })
  );
  expectCode("DUPLICATE_KEYFRAME_TIME", () =>
    createRestorePlan(scalarSnapshot(), { occupiedTimesSeconds: [1, 1] })
  );
  expectCode("NON_FINITE_NUMBER", () =>
    createRestorePlan(scalarSnapshot(), { occupiedTimesSeconds: [Number.NaN] })
  );
});

test("restore canonico e deterministico preserva label opcional e flags exatas", () => {
  const snapshot = scalarSnapshot();
  const first = createRestorePlan(snapshot, {
    timing: { mode: "relative", targetStartSeconds: 0 }
  });
  const second = createRestorePlan(clone(snapshot), {
    timing: { mode: "relative", targetStartSeconds: 0 }
  });

  assert.equal(serializeRestorePlan(first), serializeRestorePlan(second));
  assert.deepEqual(
    first.steps.filter((step) => step.phase === "label"),
    [{ phase: "label", keyOrdinal: 0, label: 3 }]
  );
  assert.equal(
    first.steps.find((step) => step.phase === "selection" && step.keyOrdinal === 1).selected,
    false
  );
});

test("restore options invalidas e target NaN falham fechados", () => {
  expectCode("INVALID_RESTORE_OPTIONS", () =>
    createRestorePlan(scalarSnapshot(), { timing: { mode: "future" } })
  );
  expectCode("NON_FINITE_NUMBER", () =>
    createRestorePlan(scalarSnapshot(), {
      timing: { mode: "relative", targetStartSeconds: Number.NaN }
    })
  );
  expectCode("INVALID_RESTORE_OPTIONS", () =>
    createRestorePlan(scalarSnapshot(), { future: true })
  );
});
