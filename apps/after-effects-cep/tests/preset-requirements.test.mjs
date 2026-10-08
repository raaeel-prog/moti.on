import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

import * as contracts from "../../../packages/contracts/dist/index.js";
import { loadHostModules } from "./host-harness.mjs";

/**
 * Requisitos dos presets (packages/contracts/src/motion-library-requirements.ts).
 *
 * A mesma função decide o que o host sonda antes de aplicar e o que a galeria
 * mostra antes do clique. Estes testes cobram que ela é a do host montado, que
 * a tabela Signature não divergiu de signature-effects.jsx, e que a galeria
 * desativa Aplicar pelos motivos certos.
 */

const { MOTION_LIBRARY_PRESETS, libraryRequiredEffects, motionLibraryRequirements } = contracts;

test("o host montado usa a mesma função de efeitos exigidos", async () => {
  const generated = await readFile(new URL("../host/generated/motion-library.jsx", import.meta.url), "utf8");
  assert.match(generated, /libraryRequiredEffects: function libraryRequiredEffects\(/);
  const library = await readFile(new URL("../host/src/commands/preset-library.jsx", import.meta.url), "utf8");
  assert.match(library, /MotionLibraryCore\.libraryRequiredEffects\(p\)/);
  assert.doesNotMatch(library, /function requiredEffects\(p\) \{\s*var r =/, "a tabela antiga do host deve ter saído");
});

test("a função serializada roda isolada, como no ExtendScript", async () => {
  const generated = await readFile(new URL("../host/generated/motion-library.jsx", import.meta.url), "utf8");
  const scope = {};
  new Function("$", generated)({ global: scope });
  for (const preset of MOTION_LIBRARY_PRESETS) {
    assert.deepEqual(scope.MotionLibraryCore.libraryRequiredEffects(preset), libraryRequiredEffects(preset), preset.id);
  }
});

test("a tabela Signature é a mesma de signature-effects.jsx", async () => {
  const scope = await loadHostModules(["generated/motion-contracts.jsx", "src/signature-effects.jsx"]);
  const signature = MOTION_LIBRARY_PRESETS.filter((preset) => preset.collection === "signature");
  assert.ok(signature.length >= 20);
  for (const preset of signature) {
    const fromHost = scope.MotionSignatureEffects.required(preset);
    const base = libraryRequiredEffects({ effect: preset.effect });
    const lookOnly = libraryRequiredEffects(preset).slice(base.length);
    assert.deepEqual(lookOnly, fromHost, preset.id);
  }
});

test("presets que dependem do plugin nativo ou de Cycore declaram isso", () => {
  for (const preset of MOTION_LIBRARY_PRESETS) {
    const needs = motionLibraryRequirements(preset);
    const effects = preset.cameraSpec ? needs.effects : libraryRequiredEffects(preset);
    assert.equal(needs.motionCore, effects.includes("CHMS Motion Core") || effects.includes("Moti.on Native Transition"), preset.id);
    assert.equal(needs.cycore, effects.some((name) => name.startsWith("CC ")), preset.id);
    assert.equal(needs.layer, preset.cameraSpec ? "composition" : preset.category.startsWith("text-") ? "text" : "visual", preset.id);
  }
  assert.ok(MOTION_LIBRARY_PRESETS.some((preset) => motionLibraryRequirements(preset).motionCore));
  assert.ok(MOTION_LIBRARY_PRESETS.some((preset) => motionLibraryRequirements(preset).cycore));
});

async function clientModule(file) {
  const bundled = await build({
    entryPoints: [fileURLToPath(new URL(file, import.meta.url))],
    bundle: true, platform: "node", format: "esm", write: false,
    loader: { ".css": "empty" }
  });
  return import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`);
}

test("galeria: motivo de bloqueio vem da seleção lida, e campo ausente não bloqueia", async () => {
  const gallery = await clientModule("../client/src/preset-gallery.ts");
  const text = { layer: "text", motionCore: false, cycore: false, threeD: false, effects: [] };
  const visual = { ...text, layer: "visual" };
  const precomp = { ...text, layer: "composition" };
  assert.equal(gallery.requirementReason(text, { selectionCount: 2, textLayers: 1, lockedLayers: 0 }, true), "Selecione apenas camadas de texto");
  assert.equal(gallery.requirementReason(text, { selectionCount: 2, textLayers: 2, lockedLayers: 0 }, true), null);
  assert.equal(gallery.requirementReason(visual, { selectionCount: 1, textLayers: 0, lockedLayers: 1 }, false), "Unlock the selected layers");
  assert.equal(gallery.requirementReason(precomp, { selectionCount: 1, lockedLayers: 3 }, true), null);
  assert.equal(gallery.requirementReason(text, { selectionCount: 2 }, true), null, "host antigo sem os campos");
  const labels = gallery.requirementLabels({ layer: "text", motionCore: true, cycore: true, threeD: false, effects: [] }, true).map((item) => item.id);
  assert.deepEqual(labels, ["text", "core", "cycore"]);
});
