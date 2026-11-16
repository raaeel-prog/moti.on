import test from "node:test";
import assert from "node:assert/strict";

import { stockImportError, stockFileName, STOCK_LIBRARY_DIR } from "../../../packages/contracts/dist/index.js";
import { loadHostModules } from "./host-harness.mjs";

// `ae.stock.import`: the file the panel downloaded under Folder.userData becomes a
// layer at the current time; the footage is imported once per project.

const USER_DATA = "C:/Users/u/AppData/Roaming";

async function fixture({ files = { "pexels/42.mp4": "video", "unsplash/abc.jpg": "still", "freesound/7.mp3": "audio" } } = {}) {
  let nextId = 1, imports = 0;
  const list = [];
  class Item {
    constructor(name) { Object.assign(this, { id: nextId++, name, comment: "", parentFolder: project.rootFolder }); list.push(this); }
    remove() { list.splice(list.indexOf(this), 1); }
    get usedIn() { return list.filter(item => item instanceof CompItem && item.layersList.some(layer => layer.source === this)); }
  }
  class FolderItem extends Item { get numItems() { return list.filter(item => item.parentFolder === this).length; } }
  class FootageItem extends Item {
    constructor(file) {
      super(file.name);
      const kind = files[file.fsName.slice(`${USER_DATA}/${STOCK_LIBRARY_DIR}/`.length)];
      Object.assign(this, { file, footageMissing: false, hasAudio: kind === "audio" || kind === "video", hasVideo: kind !== "audio", duration: 4, mainSource: { isStill: kind === "still" } });
    }
  }
  class Layer {
    constructor(comp, source, duration) { Object.assign(this, { comp, source, duration, name: source.name, comment: "", startTime: 0, selected: false }); }
    get index() { return this.comp.layersList.indexOf(this) + 1; }
    remove() { this.comp.layersList.splice(this.comp.layersList.indexOf(this), 1); }
  }
  class CompItem extends Item {
    constructor() {
      super("Main"); this.layersList = []; this.time = 2; this.duration = 10;
      this.layers = { add: (source, duration) => { const layer = new Layer(this, source, duration); this.layersList.unshift(layer); return layer; } };
    }
    get numLayers() { return this.layersList.length; }
    layer(i) { return this.layersList[i - 1]; }
    get selectedLayers() { return this.layersList.filter(layer => layer.selected); }
  }
  class File {
    constructor(fsName) { this.fsName = fsName; this.name = fsName.split("/").pop(); }
    get exists() { return Object.hasOwn(files, this.fsName.slice(`${USER_DATA}/${STOCK_LIBRARY_DIR}/`.length)); }
    get length() { return this.exists ? 1024 : 0; }
  }
  class ImportOptions { constructor(file) { this.file = file; } canImportAs() { return true; } }
  const project = { rootFolder: null, activeItem: null, get numItems() { return list.length; }, item: i => list[i - 1],
    items: { addFolder: name => new FolderItem(name) }, importFile: options => { imports++; return new FootageItem(options.file); } };
  project.rootFolder = { name: "Root" };
  const comp = new CompItem();
  project.activeItem = comp;
  const scope = await loadHostModules(["generated/motion-contracts.jsx", "src/json.jsx", "src/registry.jsx", "src/commands/stock-import.jsx"],
    { app: { project }, CompItem, FolderItem, FootageItem, ImportOptions, File, Folder: { userData: { fsName: USER_DATA } } });
  scope.ImportAsType = { FOOTAGE: 1 };
  const command = scope.MotionRegistry.get("ae.stock.import");
  const run = (args, locale = "pt-BR") => {
    const error = command.preflight(args, { locale });
    if (error) throw Object.assign(new Error(error.message), { failure: error });
    return command.run(args, { locale });
  };
  return { command, run, comp, project, list, get imports() { return imports; } };
}

const VIDEO = { provider: "pexels", assetId: "42", extension: "mp4", title: "Ondas", credit: "Vídeo de Ana no Pexels" };

test("imports into the provider folder, credits the footage and places a layer at the current time", async () => {
  const f = await fixture();
  const first = f.run(VIDEO);
  assert.equal(first.data.imported, true);
  const layer = f.comp.layer(first.data.layerIndex);
  assert.equal(layer.startTime, 2);
  assert.equal(layer.name, "Ondas");
  assert.ok(layer.selected);
  assert.ok(layer.comment.startsWith("[MOTION_STOCK_V1]"));
  assert.equal(layer.source.comment, "Vídeo de Ana no Pexels");
  assert.equal(layer.source.parentFolder.name, "Pexels");
  assert.equal(layer.source.parentFolder.parentFolder.name, "Moti.on Banco de mídia");
  const second = f.run(VIDEO);
  assert.equal(second.data.imported, false, "footage reused");
  assert.equal(f.imports, 1);
});

test("stills fill the rest of the composition; audio needs an audio track", async () => {
  const f = await fixture();
  const still = f.run({ provider: "unsplash", assetId: "abc", extension: "jpg", title: "Céu", credit: "Foto de Lia no Unsplash" });
  assert.equal(f.comp.layer(still.data.layerIndex).duration, 8);
  assert.equal(f.run({ provider: "freesound", assetId: "7", extension: "mp3", title: "Whoosh", credit: "" }).data.kind, "audio");
});

test("host preflight and the contract refuse the same arguments", async () => {
  const f = await fixture();
  const cases = [{}, { ...VIDEO, provider: "giphy" }, { ...VIDEO, assetId: "../../x" }, { ...VIDEO, extension: "exe" },
    { ...VIDEO, title: " " }, { ...VIDEO, title: "a\nb" }, { ...VIDEO, credit: "x".repeat(401) }, { ...VIDEO, path: "C:/x.mp4" }];
  for (const args of cases) {
    assert.notEqual(stockImportError(args), null, JSON.stringify(args));
    assert.ok(f.command.preflight(args, { locale: "pt-BR" }), JSON.stringify(args));
  }
  assert.equal(stockImportError(VIDEO), null);
  assert.equal(stockFileName("pexels", "42", "mp4"), "pexels/42.mp4");
  assert.equal(f.command.preflight({ ...VIDEO, assetId: "99" }, {}).code, "CAPABILITY_UNAVAILABLE", "not downloaded");
  f.project.activeItem = null;
  assert.equal(f.command.preflight(VIDEO, {}).code, "NO_ACTIVE_COMP");
});

test("run without a matching preflight is refused", async () => {
  const f = await fixture();
  assert.throws(() => f.command.run(VIDEO, {}), /preflight/);
});
