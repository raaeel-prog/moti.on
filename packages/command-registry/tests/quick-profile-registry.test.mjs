import test from "node:test";
import assert from "node:assert/strict";

import {
  createQuickProfileRegistry,
  defineQuickProfile,
  getQuickProfile,
  quickProfilesForHost,
  validateLiveControlParity
} from "../dist/index.js";

function profile(overrides = {}) {
  return {
    factoryPresetId: "factory.ae.wiggle.soft",
    derive: (context) => ({ amplitude: Math.min(context.compWidth, context.compHeight) / 45 }),
    liveControls: [
      {
        paramId: "amplitude",
        label: { "pt-BR": "Amplitude", "en-US": "Amplitude" },
        control: "slider",
        target: "layer",
        order: 0,
        unit: "px",
        min: 0,
        max: 500,
        softMin: 0,
        softMax: 120,
        step: 1,
        help: { "pt-BR": "Distância.", "en-US": "Distance." }
      },
      {
        paramId: "frequency",
        label: { "pt-BR": "Frequência", "en-US": "Frequency" },
        control: "slider",
        target: "layer",
        order: 1,
        unit: "x",
        min: 0,
        max: 20,
        step: 0.1,
        help: { "pt-BR": "Velocidade.", "en-US": "Speed." }
      }
    ],
    previewAssetId: "preview.ae.wiggle.soft",
    oneLine: {
      "pt-BR": "Adicione movimento orgânico.",
      "en-US": "Add organic movement."
    },
    needs: {
      "pt-BR": "Selecione uma layer.",
      "en-US": "Select one layer."
    },
    budgetMs: 400,
    ...overrides
  };
}

function descriptor(overrides = {}) {
  return {
    id: "ae.animate.wiggle",
    hosts: ["after-effects"],
    requirements: ["hasProject", "hasActiveComp"],
    destructive: false,
    mutates: true,
    allowsNoopSuccess: false,
    supportsDryRun: false,
    supportsCancel: false,
    undoLabelKey: "undo.ae.animate.wiggle",
    timeoutMs: 15_000,
    quickProfile: profile(),
    ...overrides
  };
}

test("defineQuickProfile valida e congela o contrato inteiro sem executar derive", () => {
  let calls = 0;
  const defined = defineQuickProfile(
    profile({
      derive: () => {
        calls += 1;
        return {};
      }
    })
  );

  assert.equal(calls, 0);
  assert.ok(Object.isFrozen(defined));
  assert.ok(Object.isFrozen(defined.liveControls));
  assert.ok(Object.isFrozen(defined.liveControls[0].label));
  assert.equal(defined.factoryPresetId, "factory.ae.wiggle.soft");
});

test("registry indexa QuickProfile por comando/host e preserva ordem do catálogo", () => {
  const premiereDescriptor = descriptor({
    id: "pr.animate.wiggle",
    hosts: ["premiere-pro"],
    quickProfile: profile({ factoryPresetId: "factory.pr.wiggle.soft" })
  });
  const registry = createQuickProfileRegistry([descriptor(), premiereDescriptor]);

  assert.equal(registry.get("ae.animate.wiggle").factoryPresetId, "factory.ae.wiggle.soft");
  assert.equal(registry.has("missing"), false);
  assert.deepEqual(
    registry.forHost("after-effects").map(({ commandId }) => commandId),
    ["ae.animate.wiggle"]
  );
  assert.deepEqual(
    registry.entries().map(({ commandId }) => commandId),
    ["ae.animate.wiggle", "pr.animate.wiggle"]
  );
});

test("registry global expõe ausência de perfis sem inventar fallback", () => {
  assert.equal(getQuickProfile("ae.animate.wiggle"), undefined);
  assert.deepEqual(quickProfilesForHost("after-effects"), []);
});

test("registry recusa Quick destrutivo, ids duplicados e perfis estruturalmente inválidos", () => {
  assert.throws(
    () => createQuickProfileRegistry([descriptor({ destructive: true })]),
    /destrutivo/i
  );
  assert.throws(
    () => createQuickProfileRegistry([descriptor(), descriptor()]),
    /duplicado/i
  );
  assert.throws(() => defineQuickProfile(profile({ budgetMs: 0 })), /budgetMs/);
  assert.throws(
    () => defineQuickProfile(profile({ oneLine: { "pt-BR": "Só português" } })),
    /oneLine\.en-US/
  );

  const { softMin: _softMin, ...withoutSoftMin } = profile().liveControls[0];
  assert.throws(
    () =>
      defineQuickProfile(
        profile({ liveControls: [{ ...withoutSoftMin, min: 10, softMax: 5 }] })
      ),
    /softMax/
  );

  const { softMax: _softMax, ...withoutSoftMax } = profile().liveControls[0];
  assert.throws(
    () =>
      defineQuickProfile(
        profile({ liveControls: [{ ...withoutSoftMax, max: 500, softMin: 600 }] })
      ),
    /softMin/
  );
});

test("paridade de Live Controls exige paramId e order exatamente na mesma sequência", () => {
  const expected = defineQuickProfile(profile()).liveControls;
  const exact = validateLiveControlParity(expected, [
    { paramId: "amplitude", order: 0 },
    { paramId: "frequency", order: 1 }
  ]);
  assert.deepEqual(exact, { valid: true, issues: [] });

  const swapped = validateLiveControlParity(expected, [
    { paramId: "frequency", order: 1 },
    { paramId: "amplitude", order: 0 }
  ]);
  assert.equal(swapped.valid, false);
  assert.ok(swapped.issues.some((issue) => issue.path === "/0/paramId"));

  const wrongOrder = validateLiveControlParity(expected, [
    { paramId: "amplitude", order: 9 },
    { paramId: "frequency", order: 1 }
  ]);
  assert.equal(wrongOrder.valid, false);
  assert.ok(wrongOrder.issues.some((issue) => issue.path === "/0/order"));

  const missing = validateLiveControlParity(expected, [{ paramId: "amplitude", order: 0 }]);
  assert.equal(missing.valid, false);
  assert.ok(missing.issues.some((issue) => issue.code === "length"));
});
