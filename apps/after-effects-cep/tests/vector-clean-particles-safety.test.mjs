import test from "node:test";
import assert from "node:assert/strict";
import { loadHostModules } from "./host-harness.mjs";

async function command(file, id, globals) {
  const scope = await loadHostModules([
    "generated/motion-contracts.jsx", "src/json.jsx", "src/registry.jsx", `src/commands/${file}.jsx`
  ], globals);
  return scope.MotionRegistry.get(id);
}

function vectorFixture(kind, config = {}) {
  const calls = [];
  class CompItem {
    constructor() { this.layers = []; this.time = 1.25; this.selectedProperties = [{ selected: true }]; }
    get numLayers() { return this.layers.length; }
    layer(index) { return this.layers[index - 1]; }
    get selectedLayers() { return this.layers.filter(layer => layer.selected); }
  }
  class AVLayer {
    constructor(source) { this.source = source; this.selected = true; this.enabled = true; this.locked = false; this.matchName = "ADBE AV Layer"; }
    remove() { comp.layers.splice(comp.layers.indexOf(this), 1); }
  }
  class TextLayer extends AVLayer {}
  class FootageItem { constructor() { this.file = { name: "logo.ai" }; } }
  const comp = new CompItem();
  const source = kind === "text" ? new TextLayer() : new AVLayer(new FootageItem());
  comp.layers.push(source);
  const app = {
    project: { activeItem: comp },
    findMenuCommandId(name) { calls.push(["find", name]); return config.menuName ? (name === config.menuName ? 101 : 0) : config.commandId ?? 101; },
    executeCommand(id) {
      calls.push(["execute", id]);
      if (config.noShape) return;
      const created = new AVLayer(null);
      created.matchName = config.wrongShape ? "ADBE AV Layer" : "ADBE Vector Layer";
      created.selected = true;
      comp.layers.unshift(created);
      source.enabled = false;
      source.selected = false;
      comp.time = 3;
      if (config.throwAfterCreate) throw new Error("host failed after mutation");
    }
  };
  return { app, comp, source, calls, classes: { CompItem, AVLayer, TextLayer, FootageItem } };
}

for (const [kind, file, id] of [
  ["text", "text-to-vector", "ae.vector.text-to-vector"],
  ["ai", "ai-to-vector", "ae.vector.ai-to-vector"]
]) {
  test(`${kind} vector resolves the actual Portuguese After Effects menu label`, async () => {
    const f = vectorFixture(kind, { menuName: kind === "text" ? "Criar formas a partir do texto" : "Criar formas a partir da camada de vetor" });
    const cmd = await command(file, id, { app: f.app, ...f.classes });
    assert.equal(cmd.preflight({ keepOriginal: true }), null);
    assert.equal(cmd.run({ keepOriginal: true }).data.convertedCount, 1);
  });

  test(`${kind} vector refuses missing menu command before mutation`, async () => {
    const f = vectorFixture(kind, { commandId: 0 });
    const cmd = await command(file, id, { app: f.app, ...f.classes });
    assert.equal(cmd.preflight({ keepOriginal: false }).code, "CAPABILITY_UNAVAILABLE");
    assert.equal(f.calls.some(c => c[0] === "execute"), false);
    assert.deepEqual(f.comp.layers, [f.source]);
  });

  test(`${kind} vector verifies created shape and restores selection/time`, async () => {
    const f = vectorFixture(kind);
    const cmd = await command(file, id, { app: f.app, ...f.classes });
    assert.equal(cmd.preflight({ keepOriginal: false }), null);
    const result = cmd.run({ keepOriginal: false });
    assert.equal(result.changed, true);
    assert.equal(result.data.convertedCount, 1);
    assert.equal(f.comp.layers[0].matchName, "ADBE Vector Layer");
    assert.equal(f.source.enabled, false);
    assert.deepEqual(f.comp.selectedLayers, [f.source]);
    assert.equal(f.comp.time, 1.25);
    assert.equal(f.comp.selectedProperties[0].selected, true);
  });

  test(`${kind} vector rolls back a failed menu conversion`, async () => {
    const f = vectorFixture(kind, { throwAfterCreate: true });
    const cmd = await command(file, id, { app: f.app, ...f.classes });
    assert.equal(cmd.preflight({ keepOriginal: true }), null);
    assert.throws(() => cmd.run({ keepOriginal: true }), /falhou/);
    assert.deepEqual(f.comp.layers, [f.source]);
    assert.equal(f.source.enabled, true);
    assert.deepEqual(f.comp.selectedLayers, [f.source]);
    assert.equal(f.comp.time, 1.25);
  });
}

test("Clean previews external footage but only removes explicitly selected managed items", async () => {
  class FootageItem {
    constructor(id, name, managed) { this.id = id; this.name = name; this.comment = managed ? '[MOTION_META_V1]{"schemaVersion":1,"rigId":"asset-1","rigType":"ae.asset.texture"}[/MOTION_META_V1]' : ""; this.usedIn = []; }
    remove() { project.items.splice(project.items.indexOf(this), 1); }
  }
  const external = new FootageItem(1, "Family footage.mov", false);
  const managed = new FootageItem(2, "Generated.png", true);
  const project = { items: [external, managed], get numItems() { return this.items.length; }, item(i) { return this.items[i - 1]; } };
  const cmd = await command("clean", "ae.project.clean", { app: { project }, FootageItem });
  assert.equal(cmd.preflight({ removeConfirmed: false }), null);
  const scan = cmd.run({ removeConfirmed: false });
  assert.equal(scan.changed, false);
  assert.equal(scan.data.unusedCount, 2);
  assert.equal(scan.data.removableCount, 1);
  assert.deepEqual(scan.data.findings.map(f => f.origin), ["external", "managed"]);
  assert.equal(cmd.preflight({ removeConfirmed: true, selectedItemIds: [1], scanToken: scan.data.scanToken }).code, "INVALID_SELECTION_TYPE");
  assert.equal(cmd.preflight({ removeConfirmed: true, selectedItemIds: [2], scanToken: scan.data.scanToken }), null);
  const removed = cmd.run({ removeConfirmed: true, selectedItemIds: [2], scanToken: scan.data.scanToken });
  assert.deepEqual(removed.data.removedItemIds, [2]);
  assert.deepEqual(project.items, [external]);
});

test("Clean refuses deletion without preview or when a finding became used", async () => {
  class FootageItem {
    constructor() { this.id = 8; this.name = "Managed"; this.comment = '[MOTION_META_V1]{"schemaVersion":1,"rigId":"asset-8","rigType":"ae.asset.texture"}[/MOTION_META_V1]'; this.usedIn = []; }
    remove() { throw new Error("must not delete"); }
  }
  const item = new FootageItem();
  const project = { numItems: 1, item() { return item; } };
  const cmd = await command("clean", "ae.project.clean", { app: { project }, FootageItem });
  assert.equal(cmd.preflight({ removeConfirmed: true, selectedItemIds: [8], scanToken: "fake" }).code, "INVALID_PRESET");
  assert.equal(cmd.preflight({ removeConfirmed: false }), null);
  const scan = cmd.run({ removeConfirmed: false });
  item.usedIn = [{}];
  assert.equal(cmd.preflight({ removeConfirmed: true, selectedItemIds: [8], scanToken: scan.data.scanToken }).code, "INVALID_SELECTION_TYPE");
});

test("Particles rejects missing bundled effect before any solid/effect mutation", async () => {
  let mutations = 0;
  class CompItem {
    constructor() { this.selectedLayers = []; this.layers = { addSolid() { mutations++; } }; }
  }
  class AVLayer {}
  const comp = new CompItem();
  const cmd = await command("particles", "ae.effect.particles", { app: { project: { activeItem: comp } }, CompItem, AVLayer });
  assert.equal(cmd.preflight({ birthRate: 2, longevity: 1, velocity: 1 }).code, "CAPABILITY_UNAVAILABLE");
  assert.equal(cmd.preflight({ birthRate: -1 }).code, "INVALID_PRESET");
  assert.equal(mutations, 0);
});

