import test from "node:test";
import assert from "node:assert/strict";
import { loadHostModules } from "./host-harness.mjs";

const path = "/local/Grão e textura.png";
const blendModes = { NORMAL: 1, OVERLAY: 2, MULTIPLY: 3, SCREEN: 4, ADD: 5, SOFT_LIGHT: 6 };

async function fixture(config = {}) {
  const calls = [];
  const files = new Map([[path, { exists: true, length: 512, supported: true, width: 100, height: 100, pixelAspect: 1, isStill: true, hasVideo: true, duration: 0, ...config.file }]]);
  class FakeFile {
    constructor(value) { this.fsName = value; this.name = value.split("/").at(-1); }
    get exists() { return files.get(this.fsName)?.exists === true; }
    get length() { return files.get(this.fsName)?.length ?? 0; }
    static openDialog() {
      calls.push(["picker"]);
      return config.cancel ? null : new FakeFile(path);
    }
  }
  class FakeImportOptions {
    constructor(file) { this.file = file; }
    canImportAs(kind) {
      calls.push(["canImportAs", kind]);
      if (config.probeError) throw new Error("probe failed");
      assert.equal(kind, "FOOTAGE");
      return files.get(this.file.fsName)?.supported === true;
    }
  }
  class Property {
    constructor(value) { this.value = value; this.selected = false; }
    setValue(value) { this.value = value; }
  }
  class Layer {
    constructor(source, duration) {
      this.source = source;
      this.duration = duration;
      this.selected = false;
      this.name = "User layer";
      this.effects = ["Do not touch"];
      this.transform = {
        "ADBE Opacity": new Property(100),
        "ADBE Position": new Property([0, 0]),
        "ADBE Scale": new Property([100, 100])
      };
    }
    property(name) {
      assert.equal(name, "ADBE Transform Group");
      return { property: (id) => this.transform[id] };
    }
    moveToBeginning() { comp.all.splice(comp.all.indexOf(this), 1); comp.all.unshift(this); }
    remove() {
      if (config.removeLayerError) throw new Error("cannot remove layer");
      comp.all.splice(comp.all.indexOf(this), 1);
    }
  }
  class FakeFootageItem {
    constructor(file) {
      this.file = file;
      const data = files.get(file.fsName);
      Object.assign(this, data);
      this.mainSource = { isStill: data.isStill };
      this.selected = false;
    }
    get usedIn() { return comp.all.some((layer) => layer.source === this) ? [comp] : []; }
    remove() {
      if (config.removeFootageError) throw new Error("cannot remove imported footage");
      project.items.splice(project.items.indexOf(this), 1);
    }
  }
  class FakeCompItem {
    constructor() {
      this.width = 1920;
      this.height = 1080;
      this.pixelAspect = 1;
      this.duration = 5;
      this.time = 1.25;
      this.selected = false;
      this.all = [];
      this.layers = {
        add: (source, duration) => {
          calls.push(["addLayer"]);
          if (config.addError) throw new Error("cannot add layer");
          for (const layer of this.all) layer.selected = false;
          for (const prop of this.selectedProperties) prop.selected = false;
          const layer = new Layer(source, duration);
          this.all.unshift(layer);
          layer.selected = true;
          if (config.propertyError) layer.transform["ADBE Opacity"].setValue = () => { throw new Error("cannot write property"); };
          return layer;
        },
        addSolid: () => { throw new Error("Texture must never create a placeholder solid"); }
      };
      this.selectedProperties = [];
    }
    get numLayers() { return this.all.length; }
    get selectedLayers() { return this.all.filter((layer) => layer.selected); }
    layer(index) { return this.all[index - 1]; }
  }
  const comp = new FakeCompItem();
  const original = new Layer(null, 5);
  original.selected = true;
  original.transform["ADBE Opacity"].selected = true;
  comp.all.push(original);
  comp.selectedProperties = [original.transform["ADBE Opacity"]];
  const project = {
    activeItem: comp,
    items: [comp],
    get numItems() { return this.items.length; },
    get selection() { return this.items.filter((item) => item.selected); },
    item(index) { return this.items[index - 1]; },
    importFile(options) {
      calls.push(["importFile"]);
      assert.equal(options.importAs, "FOOTAGE");
      assert.equal(options.sequence, false);
      if (config.importError) throw new Error("cannot import");
      for (const item of this.items) item.selected = false;
      const item = new FakeFootageItem(options.file);
      this.items.push(item);
      item.selected = true;
      return item;
    }
  };
  comp.selected = true;
  if (config.reuse) {
    const item = new FakeFootageItem(new FakeFile(path));
    project.items.push(item);
  }
  const app = {
    project,
    beginUndoGroup: (name) => calls.push(["begin", name]),
    endUndoGroup: () => calls.push(["end"])
  };
  const scope = await loadHostModules([
    "generated/motion-contracts.jsx", "generated/motion-descriptors.jsx", "src/json.jsx",
    "src/undo.jsx", "src/registry.jsx", "src/commands/texture.jsx", "src/dispatch.jsx"
  ], { app, CompItem: FakeCompItem, FootageItem: FakeFootageItem, File: FakeFile, ImportOptions: FakeImportOptions, BlendingMode: config.blends ?? blendModes });
  scope.ImportAsType = { FOOTAGE: "FOOTAGE" };
  const send = (args = {}) => JSON.parse(scope.MotionAE.dispatch(JSON.stringify({ protocolVersion: 1, requestId: "texture-test", command: "ae.asset.texture", args, context: { host: "after-effects", hostVersion: "26.5", locale: "pt-BR" }, options: {} })));
  return { app, comp, original, project, scope, calls, files, send };
}

function unchanged(f) {
  assert.deepEqual(f.comp.all, [f.original]);
  assert.deepEqual(f.original.effects, ["Do not touch"]);
  assert.deepEqual(f.comp.selectedLayers, [f.original]);
  assert.equal(f.original.transform["ADBE Opacity"].selected, true);
  assert.equal(f.comp.time, 1.25);
  assert.deepEqual(f.project.selection, [f.comp]);
}

test("Texture selects local media before Undo, imports footage and adds real cover overlay", async () => {
  const f = await fixture();
  const response = f.send({ opacity: 42, blendMode: "softlight" });
  assert.equal(response.ok, true);
  assert.equal(response.data.imported, true);
  assert.equal(response.data.reusedFootage, false);
  assert.equal(response.data.fitMode, "cover");
  assert.deepEqual(f.calls.map((call) => call[0]), ["picker", "canImportAs", "begin", "importFile", "addLayer", "end"]);
  assert.equal(f.project.numItems, 2);
  const layer = f.comp.layer(1);
  assert.equal(layer.source, f.project.item(2));
  assert.equal(layer.startTime, 0);
  assert.equal(layer.inPoint, 0);
  assert.equal(layer.outPoint, 5);
  assert.equal(layer.audioEnabled, false);
  assert.equal(layer.blendingMode, blendModes.SOFT_LIGHT);
  assert.equal(layer.transform["ADBE Opacity"].value, 42);
  assert.deepEqual(layer.transform["ADBE Position"].value, [960, 540]);
  assert.deepEqual(layer.transform["ADBE Scale"].value, [1920, 1920]);
  assert.deepEqual(f.original.effects, ["Do not touch"]);
  assert.deepEqual(f.comp.selectedLayers, [f.original]);
  assert.equal(f.original.transform["ADBE Opacity"].selected, true);
  assert.equal(f.comp.time, 1.25);
  assert.deepEqual(f.project.selection, [f.comp]);
});

test("Texture cancellation has no mutation, import or Undo", async () => {
  const f = await fixture({ cancel: true });
  const response = f.send();
  assert.equal(response.ok, false);
  assert.equal(response.error.code, "USER_CANCELLED");
  assert.deepEqual(f.calls, [["picker"]]);
  unchanged(f);
});

test("Texture explicit local path bypasses picker and reuses existing footage", async () => {
  const f = await fixture({ reuse: true });
  const existing = f.project.item(2);
  const response = f.send({ assetIdOrPath: path, blendMode: "multiply", fitMode: "contain" });
  assert.equal(response.ok, true);
  assert.equal(response.data.reusedFootage, true);
  assert.equal(response.data.imported, false);
  assert.equal(f.project.numItems, 2);
  assert.equal(f.comp.layer(1).source, existing);
  assert.deepEqual(f.comp.layer(1).transform["ADBE Scale"].value, [1080, 1080]);
  assert.equal(f.comp.layer(1).blendingMode, blendModes.MULTIPLY);
  assert.equal(f.calls.some((call) => call[0] === "picker" || call[0] === "importFile"), false);
  assert.equal(f.send({ assetIdOrPath: path }).ok, true);
  assert.equal(f.project.numItems, 2, "reapplication must not duplicate footage");
});

test("Texture fit respects non-square pixels and native scale; video duration is bounded and audio disabled", async () => {
  const f = await fixture({ file: { width: 1920, height: 1080, pixelAspect: 0.5, isStill: false, duration: 2 } });
  f.comp.pixelAspect = 2;
  assert.equal(f.send({ fitMode: "cover" }).ok, true);
  assert.deepEqual(f.comp.layer(1).transform["ADBE Scale"].value, [400, 400]);
  assert.equal(f.comp.layer(1).outPoint, 2);
  assert.equal(f.comp.layer(1).audioEnabled, false);
  assert.equal(f.send({ fitMode: "native" }).ok, true);
  assert.deepEqual(f.comp.layer(1).transform["ADBE Scale"].value, [100, 100]);
});

test("Texture invalid arguments and unsupported features are rejected before picker/Undo", async () => {
  for (const args of [
    { opacity: -1 }, { opacity: 101 }, { opacity: "50" }, { blendMode: "__proto__" }, { blendMode: "custom" },
    { fitMode: "stretch" }, { tint: [1, 0, 0] }, { loop: true }, { tile: true }, { applyAs: "matte" },
    { assetIdOrPath: "" }, { assetIdOrPath: "asset-123" }, { assetIdOrPath: "https://example.com/a.png" },
    { assetIdOrPath: "../a.png" }, { assetIdOrPath: "/a.png\nsecret" }, { assetIdOrPath: 7 }
  ]) {
    const f = await fixture();
    assert.equal(f.send(args).error.code, "INVALID_PRESET", JSON.stringify(args));
    assert.deepEqual(f.calls, []);
    unchanged(f);
  }
});

test("Texture missing, empty and rejected media never create placeholder or Undo", async () => {
  for (const config of [{ file: { exists: false } }, { file: { length: 0 } }, { file: { supported: false } }, { probeError: true }]) {
    const f = await fixture(config);
    const response = f.send();
    assert.equal(response.ok, false);
    assert.equal(f.calls.some((call) => call[0] === "begin" || call[0] === "importFile"), false);
    unchanged(f);
  }
  const f = await fixture();
  f.files.set("/local/script.jsx", { exists: true, length: 1000, supported: true });
  assert.equal(f.send({ assetIdOrPath: "/local/script.jsx" }).error.code, "INVALID_SELECTION_TYPE");
  assert.deepEqual(f.calls, []);
});

test("Texture unavailable blend or import enum fails capability before selecting file", async () => {
  const f = await fixture({ blends: { NORMAL: 1 } });
  assert.equal(f.send().error.code, "CAPABILITY_UNAVAILABLE");
  assert.deepEqual(f.calls, []);
  const g = await fixture();
  delete g.scope.ImportAsType;
  assert.equal(g.send().error.code, "CAPABILITY_UNAVAILABLE");
  assert.deepEqual(g.calls, []);
});

test("Texture rejects no project/comp before picker", async () => {
  const f = await fixture();
  f.project.activeItem = null;
  assert.equal(f.send().error.code, "NO_ACTIVE_COMP");
  f.app.project = null;
  assert.equal(f.send().error.code, "NO_ACTIVE_PROJECT");
  assert.deepEqual(f.calls, []);
});

test("Texture partial failure removes only newly imported footage/layer and restores selection", async () => {
  for (const config of [{ importError: true }, { addError: true }, { propertyError: true }, { file: { hasVideo: false } }, { file: { width: 0 } }, { file: { isStill: false, duration: 0 } }]) {
    const f = await fixture(config);
    const response = f.send();
    assert.equal(response.ok, false, JSON.stringify(config));
    assert.equal(response.error.code, "HOST_OPERATION_FAILED");
    assert.equal(f.project.numItems, 1);
    assert.deepEqual(f.calls.filter((call) => call[0] === "begin" || call[0] === "end").map((call) => call[0]), ["begin", "end"]);
    unchanged(f);
  }
});

test("Texture failure never removes reused footage", async () => {
  const f = await fixture({ reuse: true, propertyError: true });
  const existing = f.project.item(2);
  assert.equal(f.send().error.code, "HOST_OPERATION_FAILED");
  assert.equal(f.project.item(2), existing);
  assert.equal(f.project.numItems, 2);
  unchanged(f);
});

test("Texture rollback failure is explicit and still closes Undo", async () => {
  const f = await fixture({ propertyError: true, removeFootageError: true });
  assert.equal(f.send().error.code, "ROLLBACK_FAILED");
  assert.equal(f.calls.at(-1)[0], "end");
  assert.deepEqual(f.comp.all, [f.original]);
});

test("Texture staged plan cannot be used without preflight, twice, or with different args/file", async () => {
  const f = await fixture();
  const handler = f.scope.MotionRegistry.get("ae.asset.texture");
  assert.throws(() => handler.run({}), /preflight/);
  assert.equal(handler.preflight({ assetIdOrPath: path }), null);
  assert.throws(() => handler.run({ assetIdOrPath: path, opacity: 5 }), /preflight/);
  assert.throws(() => handler.run({ assetIdOrPath: path }), /preflight/);
  assert.equal(handler.preflight({ assetIdOrPath: path }), null);
  f.files.get(path).exists = false;
  assert.throws(() => handler.run({ assetIdOrPath: path }), /preflight/);
  unchanged(f);
});

