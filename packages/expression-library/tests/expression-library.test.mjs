import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  CONFLICT_MODES,
  EXPRESSION_TEMPLATE_REGISTRY_V1,
  ExpressionLibraryError,
  canonicalExpressionNumber,
  escapeExpressionNumber,
  escapeExpressionString,
  getExpressionTemplate,
  identifyManagedExpression,
  isManagedExpression,
  listExpressionTemplates,
  parseManagedExpression,
  planExpressionAdjust,
  planExpressionApply,
  planExpressionRestore,
  renderExpression
} from "../dist/index.js";

const snapshots = JSON.parse(
  readFileSync(new URL("./__snapshots__/expressions.v1.snap.json", import.meta.url), "utf8")
);

function loopout(overrides = {}) {
  return {
    id: "ae.expression.loopout",
    tokens: {
      type: "cycle",
      numKeyframes: 0,
      duration: 0,
      useDuration: false,
      ...overrides
    }
  };
}

function smooth(overrides = {}) {
  return {
    id: "ae.expression.smooth",
    tokens: {
      widthSeconds: 0.2,
      samples: 5,
      referenceTime: "current",
      ...overrides
    }
  };
}

function property(expression = "", expressionEnabled = false) {
  return { expression, expressionEnabled };
}

function expectCode(code, callback) {
  assert.throws(callback, (error) => {
    assert.ok(error instanceof ExpressionLibraryError);
    assert.equal(error.code, code);
    return true;
  });
}

test("registry v1 is closed, versioned, ordered, and deeply immutable", () => {
  assert.equal(EXPRESSION_TEMPLATE_REGISTRY_V1.schemaVersion, 1);
  assert.deepEqual(
    EXPRESSION_TEMPLATE_REGISTRY_V1.templates.map(({ id, version }) => [id, version]),
    // Lista fixada: um template novo no registry e uma decisao revisada, nao um
    // efeito colateral de alguem editar o array de cima.
    [
      ["ae.expression.loopout", 1],
      ["ae.expression.smooth", 1],
      ["ae.expression.wiggle", 1],
      ["ae.expression.flicker", 1],
      ["ae.textbox.size", 1],
      ["ae.textbox.position", 1]
    ]
  );
  assert.deepEqual(CONFLICT_MODES, ["skip", "replace-with-backup"]);
  assert.ok(Object.isFrozen(EXPRESSION_TEMPLATE_REGISTRY_V1));
  assert.ok(Object.isFrozen(EXPRESSION_TEMPLATE_REGISTRY_V1.templates));
  assert.ok(Object.isFrozen(EXPRESSION_TEMPLATE_REGISTRY_V1.templates[0]));
  assert.equal(listExpressionTemplates(), EXPRESSION_TEMPLATE_REGISTRY_V1.templates);
  assert.equal(getExpressionTemplate("ae.expression.smooth").id, "ae.expression.smooth");
  expectCode("UNKNOWN_TEMPLATE_ID", () => getExpressionTemplate("ae.expression.smooth\nalert(1)"));
});

test("loopout and smooth render byte-for-byte reviewed v1 snapshots", () => {
  const actual = {
    "loopout-cycle-keyframes": renderExpression(loopout({ numKeyframes: 3 })).source,
    "loopout-offset-duration": renderExpression(loopout({
      type: "offset",
      duration: 1.25,
      useDuration: true
    })).source,
    "loopout-continue": renderExpression(loopout({
      type: "continue",
      numKeyframes: 99,
      duration: 10,
      useDuration: true
    })).source,
    "smooth-current-time": renderExpression(smooth()).source,
    "smooth-fixed-time": renderExpression(smooth({
      widthSeconds: 0.125,
      samples: 7,
      referenceTime: 1.5
    })).source
  };

  assert.deepEqual(actual, snapshots);
});

test("render canonicalizes inactive loopout controls instead of changing semantics", () => {
  const duration = renderExpression(loopout({
    type: "pingpong",
    numKeyframes: 999,
    duration: -0,
    useDuration: true
  }));
  assert.deepEqual(duration.tokens, {
    type: "pingpong",
    numKeyframes: 0,
    duration: 0,
    useDuration: true
  });

  const continued = renderExpression(loopout({
    type: "continue",
    numKeyframes: 999,
    duration: 42,
    useDuration: true
  }));
  assert.deepEqual(continued.tokens, {
    type: "continue",
    numKeyframes: 0,
    duration: 0,
    useDuration: false
  });
  assert.ok(Object.isFrozen(continued));
  assert.ok(Object.isFrozen(continued.tokens));
});

test("numbers use locale-independent shortest canonical spelling", () => {
  assert.equal(canonicalExpressionNumber(-0), "0");
  assert.equal(canonicalExpressionNumber(0.000001), "0.000001");
  assert.equal(canonicalExpressionNumber(1e-7), "1e-7");
  assert.equal(canonicalExpressionNumber(1e21), "1e+21");
  assert.equal(canonicalExpressionNumber(1.25), "1.25");

  for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    expectCode("NON_FINITE_NUMBER", () => canonicalExpressionNumber(value));
  }
  assert.equal(escapeExpressionNumber(1.25), "1.25");
});

test("string escaping returns one ASCII literal for quotes, slashes, controls and Unicode", () => {
  const escaped = escapeExpressionString('camada "A"\\\n\t日本語\u2028\ud800');
  assert.equal(
    escaped,
    '"camada \\"A\\"\\\\\\n\\t\\u65e5\\u672c\\u8a9e\\u2028\\ud800"'
  );
  assert.match(escaped, /^[\x20-\x7e]+$/);
  assert.throws(() => escapeExpressionString("x".repeat(65_536)), ExpressionLibraryError);
});

test("numeric token validation rejects negative, fractional, unsafe, and unbounded work", () => {
  for (const numKeyframes of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, Number.NaN]) {
    expectCode("INVALID_TOKEN_VALUE", () => renderExpression(loopout({ numKeyframes })));
  }
  for (const duration of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
    expectCode("INVALID_TOKEN_VALUE", () => renderExpression(loopout({ duration, useDuration: true })));
  }
  for (const widthSeconds of [0, -1, 3600.000001, Number.NaN, Number.POSITIVE_INFINITY]) {
    expectCode("INVALID_TOKEN_VALUE", () => renderExpression(smooth({ widthSeconds })));
  }
  for (const samples of [0, 1.5, 102, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
    expectCode("INVALID_TOKEN_VALUE", () => renderExpression(smooth({ samples })));
  }
  for (const referenceTime of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
    expectCode("INVALID_TOKEN_VALUE", () => renderExpression(smooth({ referenceTime })));
  }
});

test("all strings are allowlisted and no free source or extra field crosses the renderer", () => {
  const attacks = [
    "cycle\"); $.evalFile('/tmp/pwn');//",
    "continue\nvalue",
    "ping-pong",
    "offset\\u2028alert(1)"
  ];
  for (const type of attacks) {
    expectCode("INVALID_TOKEN_VALUE", () => renderExpression(loopout({ type })));
  }
  for (const referenceTime of ["time", "current); alert(1)//", "thisComp.duration", "\u2028"] ) {
    expectCode("INVALID_TOKEN_VALUE", () => renderExpression(smooth({ referenceTime })));
  }
  expectCode("INVALID_RENDER_REQUEST", () => renderExpression({
    ...loopout(),
    source: "alert(1)"
  }));
  expectCode("INVALID_TOKEN_SHAPE", () => renderExpression({
    id: "ae.expression.loopout",
    tokens: { ...loopout().tokens, source: "alert(1)" }
  }));
  expectCode("UNKNOWN_TEMPLATE_ID", () => renderExpression({
    id: "ae.expression.loopout | injected",
    tokens: loopout().tokens
  }));
});

test("token records must contain own data properties and never execute getters", () => {
  const inherited = Object.create({ type: "cycle" });
  Object.assign(inherited, { numKeyframes: 0, duration: 0, useDuration: false });
  expectCode("INVALID_TOKEN_SHAPE", () => renderExpression({
    id: "ae.expression.loopout",
    tokens: inherited
  }));

  let getterCalled = false;
  const withGetter = loopout().tokens;
  Object.defineProperty(withGetter, "type", {
    enumerable: true,
    get() {
      getterCalled = true;
      return "cycle";
    }
  });
  expectCode("INVALID_TOKEN_SHAPE", () => renderExpression({
    id: "ae.expression.loopout",
    tokens: withGetter
  }));
  assert.equal(getterCalled, false);
});

test("parse round-trips every snapshot into typed canonical tokens", () => {
  for (const source of Object.values(snapshots)) {
    const parsed = parseManagedExpression(source);
    assert.ok(parsed);
    assert.equal(parsed.source, source);
    assert.deepEqual(renderExpression({ id: parsed.id, tokens: parsed.tokens }), parsed);
    assert.equal(isManagedExpression(source), true);
    assert.equal(identifyManagedExpression(source).kind, "managed");
  }
  assert.equal(parseManagedExpression("value"), null);
  assert.equal(isManagedExpression("value"), false);
  assert.deepEqual(identifyManagedExpression("value"), { kind: "unmanaged" });
});

test("reserved headers fail closed on future versions, unknown ids, and edited bodies", () => {
  const future = "// MOTION_EXPRESSION v2 | ae.expression.loopout\nloopOut(\"cycle\", 0);";
  assert.equal(identifyManagedExpression(future).kind, "unsupported-version");
  expectCode("UNSUPPORTED_EXPRESSION_VERSION", () => parseManagedExpression(future));

  const unknown = "// MOTION_EXPRESSION v1 | ae.expression.loopout.evil\nvalue;";
  assert.deepEqual(identifyManagedExpression(unknown), {
    kind: "invalid-managed",
    reason: "unknown-template"
  });
  expectCode("MALFORMED_MANAGED_EXPRESSION", () => parseManagedExpression(unknown));

  for (const body of [
    "loopOut(\"cycle\", 01);",
    "loopOut(\"cycle\", 1.0);",
    "loopOut(\"cycle\", -0);",
    "loopOut(\"cycle\", 0);\nalert(1);",
    "smooth(0.20, 5, time);",
    "smooth(0.2, 5, time);\u2028alert(1);"
  ]) {
    const id = body.startsWith("smooth") ? "ae.expression.smooth" : "ae.expression.loopout";
    const source = `// MOTION_EXPRESSION v1 | ${id}\n${body}`;
    assert.equal(identifyManagedExpression(source).kind, "invalid-managed");
    expectCode("MALFORMED_MANAGED_EXPRESSION", () => parseManagedExpression(source));
  }
});

test("CRLF from a host is parsed but normalized back to one canonical source", () => {
  const crlf = snapshots["smooth-current-time"].replace("\n", "\r\n");
  const parsed = parseManagedExpression(crlf);
  assert.equal(parsed.source, snapshots["smooth-current-time"]);
  assert.equal(identifyManagedExpression(crlf).kind, "managed");
});

test("Apply on an empty property returns a complete immutable backup and mutation plan", () => {
  const current = property("", false);
  const plan = planExpressionApply({
    request: loopout({ numKeyframes: 3 }),
    current,
    conflictMode: "skip"
  });

  assert.equal(plan.operation, "apply");
  assert.equal(plan.action, "apply");
  assert.equal(plan.changed, true);
  assert.deepEqual(plan.before, current);
  assert.deepEqual(plan.backup, current);
  assert.deepEqual(plan.after, property(snapshots["loopout-cycle-keyframes"], true));
  assert.equal(plan.managed.templateId, "ae.expression.loopout");
  assert.equal(plan.managed.source, plan.after.expression);
  assert.deepEqual(plan.managed.backup, current);
  assert.notEqual(plan.backup, current);
  assert.ok(Object.isFrozen(plan));
  assert.ok(Object.isFrozen(plan.managed));
  assert.ok(Object.isFrozen(plan.managed.backup));
  assert.equal(Object.isFrozen(current), false);
});

test("skip preserves an existing expression and enabled state without inventing a backup", () => {
  const current = property("wiggle(2, 30);\r\n// user bytes \ud800", false);
  const plan = planExpressionApply({
    request: smooth(),
    current,
    conflictMode: "skip"
  });

  assert.equal(plan.action, "skip");
  assert.equal(plan.changed, false);
  assert.equal(plan.reason, "expression-conflict");
  assert.deepEqual(plan.before, current);
  assert.deepEqual(plan.after, current);
  assert.equal(plan.backup, null);
  assert.equal(plan.managed, null);
});

test("replace-with-backup preserves every byte and the prior enabled flag", () => {
  const current = property("value + thisComp.layer(\"\ud83c\udfac\\\\\").index;\r\n", false);
  const plan = planExpressionApply({
    request: smooth({ widthSeconds: 0.125, samples: 7, referenceTime: 1.5 }),
    current,
    conflictMode: "replace-with-backup"
  });

  assert.equal(plan.action, "apply");
  assert.deepEqual(plan.backup, current);
  assert.deepEqual(plan.managed.backup, current);
  assert.deepEqual(plan.after, property(snapshots["smooth-fixed-time"], true));
  assert.equal(plan.backup.expression, current.expression);
  assert.equal(plan.backup.expressionEnabled, false);
});

test("Apply is idempotent and behaves as Adjust for an existing trusted record", () => {
  const first = planExpressionApply({
    request: loopout({ numKeyframes: 3 }),
    current: property("", false),
    conflictMode: "skip"
  });
  const repeated = planExpressionApply({
    request: loopout({ numKeyframes: 3 }),
    current: first.after,
    conflictMode: "skip",
    managed: first.managed
  });
  assert.equal(repeated.action, "none");
  assert.equal(repeated.changed, false);
  assert.equal(repeated.reason, "already-current");
  assert.deepEqual(repeated.after, first.after);
  assert.deepEqual(repeated.managed.backup, property("", false));

  const changed = planExpressionApply({
    request: loopout({ type: "pingpong", numKeyframes: 2 }),
    current: repeated.after,
    conflictMode: "skip",
    managed: repeated.managed
  });
  assert.equal(changed.action, "adjust");
  assert.deepEqual(changed.managed.backup, property("", false));
  assert.match(changed.after.expression, /loopOut\("pingpong", 2\);$/);
});

test("Adjust preserves the original backup and is idempotent after the first change", () => {
  const applied = planExpressionApply({
    request: smooth(),
    current: property("valueAtTime(time - 1);", false),
    conflictMode: "replace-with-backup"
  });
  const adjusted = planExpressionAdjust({
    request: smooth({ widthSeconds: 0.5, samples: 9, referenceTime: 2 }),
    current: applied.after,
    managed: applied.managed
  });
  assert.equal(adjusted.operation, "adjust");
  assert.equal(adjusted.action, "adjust");
  assert.deepEqual(adjusted.backup, applied.backup);
  assert.deepEqual(adjusted.managed.backup, applied.backup);

  const repeated = planExpressionAdjust({
    request: smooth({ widthSeconds: 0.5, samples: 9, referenceTime: 2 }),
    current: adjusted.after,
    managed: adjusted.managed
  });
  assert.equal(repeated.action, "none");
  assert.equal(repeated.reason, "already-current");
  assert.deepEqual(repeated.managed.backup, applied.backup);
});

test("Adjust fails closed without a matching valid managed record", () => {
  const rendered = renderExpression(smooth());
  expectCode("ADJUST_REQUIRES_MANAGED_STATE", () => planExpressionAdjust({
    request: smooth(),
    current: property(rendered.source, true),
    managed: null
  }));

  const applied = planExpressionApply({
    request: loopout(),
    current: property("", false),
    conflictMode: "skip"
  });
  expectCode("MANAGED_TEMPLATE_MISMATCH", () => planExpressionAdjust({
    request: smooth(),
    current: applied.after,
    managed: applied.managed
  }));

  expectCode("INVALID_MANAGED_STATE", () => planExpressionAdjust({
    request: loopout(),
    current: property(`${applied.after.expression}\nalert(1);`, true),
    managed: applied.managed
  }));
});

test("Restore returns the full original state and repeated Restore is a no-op", () => {
  const original = property("// user's expression\r\nvalue;\u0000", false);
  const applied = planExpressionApply({
    request: loopout({ type: "offset", numKeyframes: 2 }),
    current: original,
    conflictMode: "replace-with-backup"
  });
  const restored = planExpressionRestore({ current: applied.after, managed: applied.managed });
  assert.equal(restored.operation, "restore");
  assert.equal(restored.action, "restore");
  assert.deepEqual(restored.after, original);
  assert.equal(restored.managed, null);

  const repeated = planExpressionRestore({ current: restored.after, managed: applied.managed });
  assert.equal(repeated.action, "none");
  assert.equal(repeated.reason, "already-restored");
  assert.deepEqual(repeated.after, original);
});

test("Restore refuses to overwrite a managed expression that drifted", () => {
  const applied = planExpressionApply({
    request: loopout(),
    current: property("value;", true),
    conflictMode: "replace-with-backup"
  });
  const drifted = property(`${applied.after.expression}\n// hand edited`, true);
  const plan = planExpressionRestore({ current: drifted, managed: applied.managed });
  assert.equal(plan.action, "skip");
  assert.equal(plan.reason, "managed-source-mismatch");
  assert.deepEqual(plan.after, drifted);
});

test("property snapshots and managed records reject extra fields and accessors", () => {
  expectCode("INVALID_PROPERTY_STATE", () => planExpressionApply({
    request: loopout(),
    current: { expression: "", expressionEnabled: false, source: "alert(1)" },
    conflictMode: "skip"
  }));
  expectCode("INVALID_CONFLICT_MODE", () => planExpressionApply({
    request: loopout(),
    current: property("value;", true),
    conflictMode: "wrap-when-safe"
  }));

  const applied = planExpressionApply({
    request: loopout(),
    current: property("", false),
    conflictMode: "skip"
  });
  const forged = { ...applied.managed, source: "value;" };
  expectCode("INVALID_MANAGED_STATE", () => planExpressionAdjust({
    request: loopout(),
    current: applied.after,
    managed: forged
  }));
});

function wiggle(overrides = {}) {
  return {
    id: "ae.expression.wiggle",
    tokens: {
      frequency: 2,
      amplitude: 30,
      octaves: 1,
      amplitudeMultiplier: 0.5,
      seed: 0,
      ...overrides
    }
  };
}

test("wiggle emite seedRandom antes do wiggle, e nunca o argumento timeless", () => {
  // O offset do seedRandom e o que controla o valor inicial do wiggle; o
  // argumento `timeless` nao governa o wiggle, entao emiti-lo sugeriria um
  // controle inexistente. Registro em docs/research/after-effects-wiggle-and-seed.md.
  const rendered = renderExpression(wiggle());

  assert.equal(
    rendered.source,
    "// MOTION_EXPRESSION v1 | ae.expression.wiggle\nseedRandom(0);\nwiggle(2, 30, 1, 0.5);"
  );
  assert.ok(!rendered.source.includes("timeless"));
  assert.ok(!rendered.source.includes("true"));
});

test("wiggle canonicaliza numeros na forma mais curta e independente de locale", () => {
  const rendered = renderExpression(
    wiggle({ frequency: 0.25, amplitude: 1000, octaves: 3, amplitudeMultiplier: 0, seed: 42 })
  );

  assert.equal(
    rendered.source,
    "// MOTION_EXPRESSION v1 | ae.expression.wiggle\nseedRandom(42);\nwiggle(0.25, 1000, 3, 0);"
  );
});

test("wiggle recusa token fora das faixas de produto declaradas", () => {
  const forbidden = [
    ["frequency", 0],
    ["frequency", -1],
    ["frequency", 101],
    ["frequency", Number.NaN],
    ["amplitude", -1],
    ["amplitude", 100_001],
    ["octaves", 0],
    ["octaves", 11],
    ["octaves", 1.5],
    ["amplitudeMultiplier", -1],
    ["amplitudeMultiplier", 10.5],
    ["seed", -1],
    ["seed", 1.5],
    ["seed", 100_001]
  ];

  for (const [field, value] of forbidden) {
    assert.throws(
      () => renderExpression(wiggle({ [field]: value })),
      (error) => error instanceof ExpressionLibraryError && error.code === "INVALID_TOKEN_VALUE",
      `${field}=${value} deveria ser recusado`
    );
  }
});

test("wiggle recusa campo extra e token nao numerico em vez de ignorar", () => {
  assert.throws(
    () => renderExpression({ id: "ae.expression.wiggle", tokens: { ...wiggle().tokens, extra: 1 } }),
    (error) => error.code === "INVALID_TOKEN_SHAPE"
  );
  assert.throws(
    () => renderExpression(wiggle({ frequency: "2); alert(1);//" })),
    (error) => error.code === "INVALID_TOKEN_VALUE"
  );
});

test("wiggle faz round-trip pelo parser e volta aos mesmos tokens", () => {
  const rendered = renderExpression(
    wiggle({ frequency: 3.5, amplitude: 12, octaves: 2, amplitudeMultiplier: 0.75, seed: 7 })
  );

  const parsed = parseManagedExpression(rendered.source);

  assert.equal(parsed.id, "ae.expression.wiggle");
  assert.equal(parsed.source, rendered.source);
  assert.deepEqual(parsed.tokens, {
    frequency: 3.5,
    amplitude: 12,
    octaves: 2,
    amplitudeMultiplier: 0.75,
    seed: 7
  });
});

test("corpo de wiggle editado a mao nao passa por gerenciado", () => {
  const header = "// MOTION_EXPRESSION v1 | ae.expression.wiggle\n";

  // Codigo emendado depois da chamada.
  assert.equal(isManagedExpression(header + "seedRandom(0);\nwiggle(2, 30, 1, 0.5); alert(1);"), false);
  // seedRandom removido: o determinismo iria embora sem o usuario perceber.
  assert.equal(isManagedExpression(header + "wiggle(2, 30, 1, 0.5);"), false);
  // Numero fora da forma canonica.
  assert.equal(isManagedExpression(header + "seedRandom(0);\nwiggle(2.0, 30, 1, 0.5);"), false);
  // Token fora de faixa, ainda que canonico na forma.
  assert.equal(isManagedExpression(header + "seedRandom(0);\nwiggle(200, 30, 1, 0.5);"), false);
  // Corpo de outro template sob o cabecalho do wiggle.
  assert.equal(isManagedExpression(header + 'loopOut("cycle", 0);'), false);
  // Cabecalho de outro template com corpo de wiggle.
  assert.equal(
    isManagedExpression("// MOTION_EXPRESSION v1 | ae.expression.smooth\nseedRandom(0);\nwiggle(2, 30, 1, 0.5);"),
    false
  );
});

function flicker(overrides = {}) {
  return {
    id: "ae.expression.flicker",
    tokens: { rate: 12, minFactor: 0, maxFactor: 1, seed: 0, ...overrides }
  };
}

test("flicker multiplica o valor da propriedade em vez de substitui-lo", () => {
  // random(min, max) com dois numeros devolve um ESCALAR. Emiti-lo cru quebraria
  // qualquer propriedade nao 1D dentro do After Effects. Multiplicar `value`
  // carrega a dimensionalidade da propriedade e preserva a animacao existente.
  const rendered = renderExpression(flicker());

  assert.equal(
    rendered.source,
    "// MOTION_EXPRESSION v1 | ae.expression.flicker\nseedRandom(0);\nposterizeTime(12);\nvalue * random(0, 1);"
  );
  assert.ok(rendered.source.includes("value *"), "sem `value *` a expressao perde a dimensionalidade");
});

test("flicker recusa faixa invertida antes de virar fonte", () => {
  // random(1, 0) nao e erro no After Effects, mas inverte a intencao declarada
  // na interface: seria uma expressao que "funciona" fazendo o contrario.
  assert.throws(
    () => renderExpression(flicker({ minFactor: 1, maxFactor: 0 })),
    (error) => error instanceof ExpressionLibraryError && error.code === "INVALID_TOKEN_VALUE"
  );

  // Faixa degenerada (min === max) e legitima: trava o fator.
  assert.ok(renderExpression(flicker({ minFactor: 0.5, maxFactor: 0.5 })).source.includes("random(0.5, 0.5)"));
});

test("flicker recusa token fora das faixas de produto", () => {
  for (const [field, value] of [
    ["rate", 0], ["rate", -1], ["rate", 121], ["rate", Number.NaN],
    ["minFactor", -1], ["maxFactor", 11],
    ["seed", -1], ["seed", 1.5], ["seed", 100_001]
  ]) {
    assert.throws(
      () => renderExpression(flicker({ [field]: value })),
      (error) => error.code === "INVALID_TOKEN_VALUE",
      `${field}=${value} deveria ser recusado`
    );
  }
});

test("flicker faz round-trip pelo parser", () => {
  const rendered = renderExpression(flicker({ rate: 24, minFactor: 0.25, maxFactor: 0.75, seed: 9 }));
  const parsed = parseManagedExpression(rendered.source);

  assert.equal(parsed.id, "ae.expression.flicker");
  assert.equal(parsed.source, rendered.source);
  assert.deepEqual(parsed.tokens, { rate: 24, minFactor: 0.25, maxFactor: 0.75, seed: 9 });
});

test("corpo de flicker editado a mao nao passa por gerenciado", () => {
  const header = "// MOTION_EXPRESSION v1 | ae.expression.flicker\n";

  assert.equal(isManagedExpression(header + "seedRandom(0);\nposterizeTime(12);\nvalue * random(0, 1); alert(1);"), false);
  // posterizeTime removido: a taxa deixaria de existir sem o usuario perceber.
  assert.equal(isManagedExpression(header + "seedRandom(0);\nvalue * random(0, 1);"), false);
  // `value *` removido: quebraria propriedade multidimensional.
  assert.equal(isManagedExpression(header + "seedRandom(0);\nposterizeTime(12);\nrandom(0, 1);"), false);
  assert.equal(isManagedExpression(header + "seedRandom(0);\nposterizeTime(12);\nvalue * random(0, 1.0);"), false);
  assert.equal(isManagedExpression(header + "seedRandom(0);\nposterizeTime(200);\nvalue * random(0, 1);"), false);
});

function textBox(id, overrides = {}) {
  return { id, tokens: { paddingX: 24, paddingY: 16, ...overrides } };
}

test("a caixa aponta para o texto por thisLayer.parent, nunca por nome", async () => {
  // `thisComp.layer("nome")` quebra em silencio quando o usuario renomeia a
  // camada, e pega a errada quando existem duas com o mesmo nome. O vinculo de
  // parentesco ja e criado pelo proprio rig e sobrevive a rename e reordenacao.
  for (const id of ["ae.textbox.size", "ae.textbox.position"]) {
    const { source } = renderExpression(textBox(id));

    assert.ok(source.includes("thisLayer.parent"), id);
    assert.ok(!source.includes("thisComp.layer("), id + " nao pode depender de nome");
  }
});

test("o tamanho colapsa a caixa quando o texto esta vazio", () => {
  // Medido no host: texto vazio E texto so com espaco devolvem o retangulo
  // zerado. Sem o colapso, apagar o texto deixaria um bloco de cor orfao do
  // tamanho do padding pousado na origem da camada.
  const { source } = renderExpression(textBox("ae.textbox.size"));

  assert.equal(
    source,
    "// MOTION_EXPRESSION v1 | ae.textbox.size\n" +
      "var alvo = thisLayer.parent;\n" +
      "var r = alvo.sourceRectAtTime(time, false);\n" +
      "r.width === 0 && r.height === 0 ? [0, 0] : [r.width + 24 * 2, r.height + 16 * 2];"
  );
});

test("a posicao centraliza no bounding box do texto, nao na origem da camada", () => {
  // E isso que faz a caixa acompanhar alinhamento a esquerda, ao centro e a
  // direita sem nenhum input adicional.
  const { source } = renderExpression(textBox("ae.textbox.position"));

  assert.equal(
    source,
    "// MOTION_EXPRESSION v1 | ae.textbox.position\n" +
      "var alvo = thisLayer.parent;\n" +
      "var r = alvo.sourceRectAtTime(time, false);\n" +
      "[r.left + r.width / 2, r.top + r.height / 2];"
  );
});

test("padding negativo e recusado em vez de cortar o texto", () => {
  // Encolher a caixa para dentro do texto pode vir a ser um recurso, mas
  // precisaria de nome proprio e de tela — nao de um numero negativo passando
  // despercebido.
  for (const field of ["paddingX", "paddingY"]) {
    expectCode("INVALID_TOKEN_VALUE", () =>
      renderExpression(textBox("ae.textbox.size", { [field]: -1 }))
    );
  }
  expectCode("INVALID_TOKEN_VALUE", () =>
    renderExpression(textBox("ae.textbox.size", { paddingX: Number.NaN }))
  );
  expectCode("INVALID_TOKEN_VALUE", () =>
    renderExpression(textBox("ae.textbox.size", { paddingY: 10_001 }))
  );
});

test("o tamanho da caixa faz round-trip pelo parser", () => {
  const rendered = renderExpression(textBox("ae.textbox.size", { paddingX: 8, paddingY: 4 }));
  const parsed = parseManagedExpression(rendered.source);

  assert.equal(parsed.id, "ae.textbox.size");
  assert.deepEqual(parsed.tokens, { paddingX: 8, paddingY: 4 });
  assert.equal(parsed.source, rendered.source);
});

test("caixa editada a mao nao passa por gerenciada", () => {
  const header = "// MOTION_EXPRESSION v1 | ae.textbox.size\n";

  // Colapso de texto vazio removido: a caixa voltaria a aparecer orfa.
  assert.equal(
    isManagedExpression(
      header + "var alvo = thisLayer.parent;\nvar r = alvo.sourceRectAtTime(time, false);\n[r.width + 24 * 2, r.height + 16 * 2];"
    ),
    false
  );
  // Alvo trocado para referencia por nome.
  assert.equal(
    isManagedExpression(
      header + "var alvo = thisComp.layer(\"Texto\");\nvar r = alvo.sourceRectAtTime(time, false);\nr.width === 0 && r.height === 0 ? [0, 0] : [r.width + 24 * 2, r.height + 16 * 2];"
    ),
    false
  );
  // Codigo emendado depois da expressao.
  assert.equal(
    isManagedExpression(
      header + "var alvo = thisLayer.parent;\nvar r = alvo.sourceRectAtTime(time, false);\nr.width === 0 && r.height === 0 ? [0, 0] : [r.width + 24 * 2, r.height + 16 * 2]; alert(1);"
    ),
    false
  );
});
