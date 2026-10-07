import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { COMMAND_DESCRIPTORS, resolveUndoLabel } from "../dist/index.js";
import { renderModule } from "../scripts/gen-extendscript.mjs";

const descriptor = (id) => COMMAND_DESCRIPTORS.find((entry) => entry.id === id);

test("inspection and personal catalog remain usable without an active composition and do not open Undo", () => {
  for (const id of ["ae.presets.inspect", "ae.presets.personal"]) {
    const command = descriptor(id);
    assert.ok(command, id);
    assert.deepEqual(command.hosts, ["after-effects"]);
    assert.deepEqual(command.requirements, []);
    assert.equal(command.mutates, false);
    assert.equal(command.undoLabelKey, "undo.none");
    assert.equal(command.destructive, false);
    assert.equal(command.supportsDryRun, false);
  }
});

test("adjust requires a composition and library import requires a project, each with its own Undo boundary", () => {
  for (const [id, requirements, noop, label] of [
    ["ae.presets.timing", ["hasProject", "hasActiveComp", "expressionEngine"], true, "Moti.on: organizar marcadores de animação"],
    ["ae.presets.adjust", ["hasProject", "hasActiveComp", "expressionEngine"], true, "Moti.on: ajustar preset"],
    ["ae.presets.personal-apply", ["hasProject"], false, "Moti.on: aplicar preset da biblioteca"]
  ]) {
    const command = descriptor(id);
    assert.ok(command, id);
    assert.deepEqual(command.hosts, ["after-effects"]);
    assert.deepEqual(command.requirements, requirements);
    assert.equal(command.mutates, true);
    assert.equal(command.allowsNoopSuccess, noop);
    assert.equal(command.destructive, false);
    assert.equal(command.supportsDryRun, false);
    assert.equal(resolveUndoLabel(command.undoLabelKey, "pt-BR"), label);
    assert.match(resolveUndoLabel(command.undoLabelKey, "en-US"), /^Moti.on: /);
  }
});

test("the generated ExtendScript descriptor table preserves workspace gating and Undo metadata", async () => {
  const scope = {};
  scope.$ = { global: scope };
  vm.runInNewContext(await renderModule(), scope);
  for (const id of ["ae.presets.inspect", "ae.presets.adjust", "ae.presets.timing", "ae.presets.personal", "ae.presets.personal-apply"]) {
    const source = descriptor(id);
    const generated = scope.MotionDescriptors[id];
    assert.ok(generated, id);
    assert.deepEqual(Array.from(generated.requirements), source.requirements);
    assert.equal(generated.mutates, source.mutates);
    assert.equal(generated.allowsNoopSuccess, source.allowsNoopSuccess);
    assert.equal(generated.undoLabels["pt-BR"], resolveUndoLabel(source.undoLabelKey, "pt-BR"));
  }
});
