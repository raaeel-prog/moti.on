import test from "node:test";
import assert from "node:assert/strict";

import {
  PRESET_SCHEMA_VERSION,
  downgradePresetV2ToV1,
  migratePresetV1ToV2,
  validateCommandRequest,
  validatePresetDefinition,
  validatePresetDefinitionV1,
  validateRemotePresetDefinition
} from "../dist/index.js";

const binding = {
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
  help: {
    "pt-BR": "Controla a distância do movimento.",
    "en-US": "Controls the movement distance."
  }
};

function presetV1(overrides = {}) {
  return {
    schemaVersion: 1,
    id: "factory.ae.wiggle.soft",
    version: "1.0.0",
    displayName: { "pt-BR": "Suave", "en-US": "Soft" },
    category: "animation",
    hosts: ["after-effects"],
    minHostVersion: { "after-effects": "24.0" },
    requirements: ["hasProject", "hasActiveComp"],
    controls: [{ id: "amplitude", kind: "number", default: 24 }],
    operationPlan: {
      version: 1,
      operations: [{ operation: "apply-template", templateId: "ae.wiggle" }]
    },
    preview: {
      thumbnail: "previews/wiggle-soft.png",
      video: "previews/wiggle-soft.mp4"
    },
    checksum: "legacy-checksum",
    signature: "legacy-signature",
    ...overrides
  };
}

function quickPreset() {
  return {
    isDefault: true,
    liveControls: [binding],
    budgetMs: 400,
    oneLine: {
      "pt-BR": "Adicione movimento orgânico.",
      "en-US": "Add organic movement."
    },
    needs: {
      "pt-BR": "Selecione ao menos uma layer.",
      "en-US": "Select at least one layer."
    },
    creates: {
      "pt-BR": "Cria um controle na layer.",
      "en-US": "Creates one control on the layer."
    }
  };
}

function migrationOptions(overrides = {}) {
  return {
    preview: {
      fixtureId: "fixture.ae.text-card",
      renderedAt: "2026-09-03T12:00:00.000Z",
      checksum: "preview-checksum"
    },
    quick: quickPreset(),
    checksum: "v2-checksum",
    signature: "v2-signature",
    ...overrides
  };
}

function presetV2(overrides = {}) {
  return {
    schemaVersion: 2,
    id: "factory.ae.wiggle.soft",
    version: "2.0.0",
    displayName: { "pt-BR": "Suave", "en-US": "Soft" },
    category: "animation",
    hosts: ["after-effects"],
    minHostVersion: { "after-effects": "24.0" },
    requirements: ["hasProject", "hasActiveComp"],
    controls: [{ id: "amplitude", kind: "number", default: 24 }],
    operationPlan: {
      version: 1,
      operations: [{ operation: "apply-template", templateId: "ae.wiggle" }]
    },
    quick: quickPreset(),
    preview: {
      poster: "previews/wiggle-soft.png",
      loop: "previews/wiggle-soft.mp4",
      fixtureId: "fixture.ae.text-card",
      renderedAt: "2026-09-03T12:00:00.000Z",
      checksum: "preview-checksum"
    },
    checksum: "v2-checksum",
    signature: "v2-signature",
    ...overrides
  };
}

test("PresetDefinition v1 e v2 validam em schemas distintos e devolvem snapshots imutáveis", () => {
  assert.equal(PRESET_SCHEMA_VERSION, 2);

  const legacy = presetV1();
  const legacyResult = validatePresetDefinitionV1(legacy);
  assert.equal(legacyResult.valid, true);
  assert.notStrictEqual(legacyResult.value, legacy);
  assert.ok(Object.isFrozen(legacyResult.value));
  assert.ok(Object.isFrozen(legacyResult.value.operationPlan.operations));

  const current = presetV2();
  const currentResult = validatePresetDefinition(current);
  assert.equal(currentResult.valid, true);
  assert.notStrictEqual(currentResult.value, current);
  assert.ok(Object.isFrozen(currentResult.value.preview));
  assert.ok(Object.isFrozen(currentResult.value.quick.liveControls));
});

test("preset v2 falha fechado sem preview, com campo extra ou valor não-JSON", () => {
  const { preview: _preview, ...withoutPreview } = presetV2();
  const missing = validatePresetDefinition(withoutPreview);
  assert.equal(missing.valid, false);
  assert.ok(missing.issues.some((issue) => issue.path === "/preview"));

  const extra = validatePresetDefinition({ ...presetV2(), executable: true });
  assert.equal(extra.valid, false);
  assert.ok(extra.issues.some((issue) => issue.path === "/executable"));

  const withFunction = validatePresetDefinition({
    ...presetV2(),
    operationPlan: { run: () => "não pode atravessar" }
  });
  assert.equal(withFunction.valid, false);
  assert.ok(withFunction.issues.some((issue) => issue.code === "jsonType"));
});

test("invariantes semânticas recusam ids/ordens duplicados e faixas invertidas", () => {
  const duplicateParam = validatePresetDefinition({
    ...presetV2(),
    quick: {
      ...quickPreset(),
      liveControls: [binding, { ...binding, order: 1 }]
    }
  });
  assert.equal(duplicateParam.valid, false);
  assert.ok(duplicateParam.issues.some((issue) => issue.path === "/quick/liveControls/1/paramId"));

  const duplicateOrder = validatePresetDefinition({
    ...presetV2(),
    quick: {
      ...quickPreset(),
      liveControls: [binding, { ...binding, paramId: "frequency" }]
    }
  });
  assert.equal(duplicateOrder.valid, false);
  assert.ok(duplicateOrder.issues.some((issue) => issue.path === "/quick/liveControls/1/order"));

  const inverted = validatePresetDefinition({
    ...presetV2(),
    quick: {
      ...quickPreset(),
      liveControls: [{ ...binding, min: 10, max: 2 }]
    }
  });
  assert.equal(inverted.valid, false);
  assert.ok(inverted.issues.some((issue) => issue.path === "/quick/liveControls/0/max"));

  const { softMin: _softMin, ...withoutSoftMin } = binding;
  const softMaxBelowHardMin = validatePresetDefinition({
    ...presetV2(),
    quick: {
      ...quickPreset(),
      liveControls: [{ ...withoutSoftMin, min: 10, softMax: 5 }]
    }
  });
  assert.equal(softMaxBelowHardMin.valid, false);
  assert.ok(
    softMaxBelowHardMin.issues.some(
      (issue) => issue.path === "/quick/liveControls/0/softMax"
    )
  );

  const { softMax: _softMax, ...withoutSoftMax } = binding;
  const softMinAboveHardMax = validatePresetDefinition({
    ...presetV2(),
    quick: {
      ...quickPreset(),
      liveControls: [{ ...withoutSoftMax, max: 500, softMin: 600 }]
    }
  });
  assert.equal(softMinAboveHardMax.valid, false);
  assert.ok(
    softMinAboveHardMax.issues.some(
      (issue) => issue.path === "/quick/liveControls/0/softMin"
    )
  );
});

test("migração v1→v2 preserva conteúdo, converte preview e invalida assinatura antiga", () => {
  const legacy = presetV1();
  const before = structuredClone(legacy);
  const migrated = migratePresetV1ToV2(legacy, migrationOptions());

  assert.equal(migrated.valid, true, JSON.stringify(migrated.issues));
  assert.deepEqual(legacy, before, "migrar não pode alterar o objeto de origem");
  assert.equal(migrated.value.schemaVersion, 2);
  assert.equal(migrated.value.preview.poster, legacy.preview.thumbnail);
  assert.equal(migrated.value.preview.loop, legacy.preview.video);
  assert.equal(migrated.value.preview.fixtureId, "fixture.ae.text-card");
  assert.equal(migrated.value.checksum, "v2-checksum");
  assert.equal(migrated.value.signature, "v2-signature");
  assert.notEqual(migrated.value.signature, legacy.signature);

  const { signature: _signature, ...unsignedOptions } = migrationOptions();
  const unsignedMigration = migratePresetV1ToV2(legacy, unsignedOptions);
  assert.equal(unsignedMigration.valid, true);
  assert.equal("signature" in unsignedMigration.value, false);
});

test("round-trip v1→v2→v1 restaura exatamente o preset legado e seus bytes lógicos", () => {
  const legacy = presetV1();
  const migrated = migratePresetV1ToV2(legacy, migrationOptions());
  assert.equal(migrated.valid, true);

  const downgraded = downgradePresetV2ToV1(migrated.value, {
    checksum: legacy.checksum,
    signature: legacy.signature,
    includePreview: true
  });
  assert.equal(downgraded.valid, true, JSON.stringify(downgraded.issues));
  assert.deepEqual(downgraded.value, legacy);
});

test("migração nunca fabrica poster ou loop quando o v1 e o contexto não os fornecem", () => {
  const { preview: _preview, ...withoutPreview } = presetV1();
  const migrated = migratePresetV1ToV2(withoutPreview, migrationOptions());

  assert.equal(migrated.valid, false);
  assert.ok(migrated.issues.some((issue) => issue.path === "/preview/poster"));
  assert.ok(migrated.issues.some((issue) => issue.path === "/preview/loop"));
});

test("migração recusa reutilizar checksum ou assinatura da representação v1", () => {
  const legacy = presetV1();
  const sameChecksum = migratePresetV1ToV2(
    legacy,
    migrationOptions({ checksum: legacy.checksum })
  );
  assert.equal(sameChecksum.valid, false);
  assert.ok(sameChecksum.issues.some((issue) => issue.path === "/checksum"));

  const sameSignature = migratePresetV1ToV2(
    legacy,
    migrationOptions({ signature: legacy.signature })
  );
  assert.equal(sameSignature.valid, false);
  assert.ok(sameSignature.issues.some((issue) => issue.path === "/signature"));
});

test("preset remoto exige assinatura nova e recusa campos executáveis no operationPlan", () => {
  const { signature: _signature, ...unsigned } = presetV2();
  const missingSignature = validateRemotePresetDefinition(unsigned, () => true);
  assert.equal(missingSignature.valid, false);
  assert.ok(missingSignature.issues.some((issue) => issue.path === "/signature"));

  const executable = validateRemotePresetDefinition(
    {
      ...presetV2(),
      operationPlan: { script: "app.project.close()" }
    },
    () => true
  );
  assert.equal(executable.valid, false);
  assert.ok(executable.issues.some((issue) => issue.code === "executableField"));

  assert.equal(validateRemotePresetDefinition(presetV2()).valid, false);
  assert.equal(validateRemotePresetDefinition(presetV2(), () => false).valid, false);
  assert.equal(validateRemotePresetDefinition(presetV2(), () => true).valid, true);
});

test("CommandRequest aceita as opções Quick e recusa tipos ou modos inventados", () => {
  const base = {
    protocolVersion: 1,
    requestId: "req-quick",
    command: "ae.context.read",
    args: {},
    context: { host: "after-effects", hostVersion: "26.3" }
  };

  assert.equal(
    validateCommandRequest({
      ...base,
      options: {
        mode: "quick",
        emitLiveControls: true,
        targetRigId: "rig-existing-1",
        preserveSelection: true
      }
    }).valid,
    true
  );
  assert.equal(validateCommandRequest({ ...base, options: { mode: "instant" } }).valid, false);
  assert.equal(validateCommandRequest({ ...base, options: { emitLiveControls: "yes" } }).valid, false);
  assert.equal(validateCommandRequest({ ...base, options: { targetRigId: "" } }).valid, false);
  assert.equal(validateCommandRequest({ ...base, options: { targetRigId: "   " } }).valid, false);
});
