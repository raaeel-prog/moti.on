/**
 * After Effects simulado para `ae.elements.insert`.
 *
 * Modela o que o comando toca: itens do projeto (pastas, comps, footage,
 * solidos), camadas de texto, shape, nula e AV, os grupos de shape com os
 * match names medidos no AE 26.5 (`scripts/probe-elements-capabilities.jsx`) e
 * as Propriedades essenciais. Expressoes sao avaliadas de verdade num contexto
 * `vm` com `thisComp`, `time`, `value` e `sourceRectAtTime`.
 */
import vm from "node:vm";
import { loadHostModules } from "./host-harness.mjs";

export const EXTENSION_ROOT = "C:/ext";
const SOUND_ROOT = `${EXTENSION_ROOT}/assets/sounds/`;
const ParagraphJustification = { LEFT_JUSTIFY: 7413, CENTER_JUSTIFY: 7415 };
const ImportAsType = { FOOTAGE: 1 };

/** Propriedades de cada operador de shape, com os valores padrao do AE. */
const OPERATORS = {
  "ADBE Vector Shape - Ellipse": { "ADBE Vector Ellipse Size": [100, 100], "ADBE Vector Ellipse Position": [0, 0] },
  "ADBE Vector Shape - Rect": { "ADBE Vector Rect Size": [100, 100], "ADBE Vector Rect Position": [0, 0], "ADBE Vector Rect Roundness": 0 },
  "ADBE Vector Shape - Star": { "ADBE Vector Star Type": 1, "ADBE Vector Star Points": 5, "ADBE Vector Star Outer Radius": 100, "ADBE Vector Star Inner Radius": 50 },
  "ADBE Vector Shape - Group": { "ADBE Vector Shape": null },
  "ADBE Vector Filter - Trim": { "ADBE Vector Trim Start": 0, "ADBE Vector Trim End": 100, "ADBE Vector Trim Offset": 0, "ADBE Vector Trim Type": 1 },
  "ADBE Vector Graphic - Stroke": { "ADBE Vector Stroke Color": [1, 1, 1, 1], "ADBE Vector Stroke Width": 2, "ADBE Vector Stroke Line Cap": 1, "ADBE Vector Stroke Line Join": 1 },
  "ADBE Vector Graphic - Fill": { "ADBE Vector Fill Color": [1, 0, 0, 1] },
  "ADBE Vector Filter - Repeater": { "ADBE Vector Repeater Copies": 3, "ADBE Vector Repeater Offset": 0 }
};
const EFFECTS = { "ADBE Fill": { "ADBE Fill-0002": [1, 0, 0, 1], "ADBE Fill-0005": 1 }, "ADBE Color Control": { "ADBE Color Control-0001": [1, 0, 0, 1] }, "ADBE Slider Control": { "ADBE Slider Control-0001": 0 } };

class TextDocument {
  constructor(text = "") { Object.assign(this, { text, font: "SlowlyMove", fontSize: 36, applyFill: true, fillColor: [0, 0, 0], applyStroke: false, justification: ParagraphJustification.LEFT_JUSTIFY, tracking: 0 }); }
}
class Shape { constructor() { this.vertices = []; this.closed = true; } }
const copy = value => value instanceof TextDocument ? Object.assign(new TextDocument(), value)
  : value instanceof Shape ? Object.assign(new Shape(), { vertices: value.vertices.map(v => [...v]), closed: value.closed })
  : Array.isArray(value) ? [...value] : value;
const plain = value => Array.isArray(value) ? Array.from(value, plain) : value;

export async function elementsFixture({ width = 1920, height = 1080, fps = 30, essential = true, missingSounds = [], exposeFails = false, fonts = null } = {}) {
  let nextId = 1, imports = 0;
  const list = [];
  class Item {
    constructor(name, register = true) { Object.assign(this, { id: nextId++, name, comment: "", parentFolder: project.rootFolder }); if (register) list.push(this); }
    remove() { const at = list.indexOf(this); if (at < 0) throw new Error("item already removed"); list.splice(at, 1); }
    get usedIn() { return list.filter(item => item instanceof CompItem && item.layersList.some(layer => layer.source === this)); }
  }
  class FolderItem extends Item { get numItems() { return list.filter(item => item.parentFolder === this).length; } }
  class FootageItem extends Item {
    constructor(file) { super(file.name); Object.assign(this, { file, hasAudio: true, hasVideo: false, footageMissing: false, duration: .5 }); }
  }
  class SolidItem extends Item {}

  class Property {
    constructor(matchName, value, layer) { Object.assign(this, { matchName, name: matchName, layer, canSetExpression: true, expressionEnabled: false, writes: 0 }); this.raw = value; this.code = ""; }
    get value() { return copy(this.raw); }
    setValue(value) { this.raw = copy(value); this.writes++; }
    get expression() { return this.code; }
    set expression(code) { this.code = code; this.expressionEnabled = code.length > 0; }
    canAddToMotionGraphicsTemplate() { return true; }
    addToMotionGraphicsTemplateAs(comp, name) {
      if (exposeFails) return false;
      comp.controllers.push({ name, property: this }); return true;
    }
    valueAtTime(time) {
      if (!this.code) return this.value;
      const layer = this.layer, comp = layer.comp;
      const handle = target => ({
        sourceRectAtTime: t => target.sourceRectAtTime(t),
        effect: name => index => {
          const effect = target.property("ADBE Effect Parade").children.find(e => e.name === name);
          if (!effect) throw new Error(`Efeito ausente: ${name}`);
          return effect.children[index - 1].valueAtTime(time);
        }
      });
      const thisComp = { duration: comp.duration, frameDuration: 1 / comp.frameRate, layer: name => {
        const target = comp.layersList.find(l => l.name === name);
        if (!target) throw new Error(`Camada ausente: ${name}`);
        return handle(target);
      } };
      return plain(vm.runInNewContext(this.code, { time, value: this.value, thisComp, sourceRectAtTime: t => layer.sourceRectAtTime(t) }));
    }
  }
  class Group {
    constructor(matchName, layer, values = {}) {
      Object.assign(this, { matchName, name: matchName, layer, children: [] });
      for (const [key, value] of Object.entries(values)) this.children.push(new Property(key, value, layer));
    }
    get numProperties() { return this.children.length; }
    property(key) { return typeof key === "number" ? this.children[key - 1] ?? null : this.children.find(c => c.matchName === key || c.name === key) ?? null; }
    addProperty(matchName) {
      let child;
      if (this.matchName === "ADBE Root Vectors Group" || this.matchName === "ADBE Vectors Group") {
        if (matchName === "ADBE Vector Group") {
          child = new Group(matchName, this.layer);
          child.children.push(new Group("ADBE Vectors Group", this.layer), new Group("ADBE Vector Transform Group", this.layer));
        } else if (OPERATORS[matchName]) {
          child = new Group(matchName, this.layer, OPERATORS[matchName]);
          if (matchName === "ADBE Vector Filter - Repeater") child.children.push(new Group("ADBE Vector Repeater Transform", this.layer, { "ADBE Vector Repeater Position": [100, 0], "ADBE Vector Repeater Rotation": 0 }));
        }
      } else if (this.matchName === "ADBE Effect Parade" && EFFECTS[matchName]) child = new Group(matchName, this.layer, EFFECTS[matchName]);
      if (!child) throw new Error(`addProperty inesperado: ${matchName} em ${this.matchName}`);
      child.remove = () => this.children.splice(this.children.indexOf(child), 1);
      this.children.push(child);
      return child;
    }
  }
  class Layer {
    constructor(comp, kind, source = null, text = "") {
      Object.assign(this, { comp, kind, source, name: source?.name ?? kind, comment: "", selected: false, startTime: 0, guideLayer: false, collapseTransformation: false });
      this.groups = [
        new Group("ADBE Transform Group", this, { "ADBE Anchor Point": [0, 0], "ADBE Position": [comp.width / 2, comp.height / 2], "ADBE Scale": [100, 100], "ADBE Rotate Z": 0, "ADBE Opacity": 100 }),
        new Group("ADBE Effect Parade", this)
      ];
      if (kind === "text") this.groups.push(new Group("ADBE Text Properties", this, { "ADBE Text Document": new TextDocument(text) }));
      if (kind === "shape") this.groups.push(new Group("ADBE Root Vectors Group", this));
      if (source?.hasAudio) this.groups.push(new Group("ADBE Audio Group", this, { "ADBE Audio Levels": [0, 0] }));
    }
    get index() { return this.comp.layersList.indexOf(this) + 1; }
    get containingComp() { return this.comp; }
    get hasAudio() { return Boolean(this.source?.hasAudio); }
    property(key) { return this.groups.find(g => g.matchName === key) ?? null; }
    remove() { this.comp.layersList.splice(this.comp.layersList.indexOf(this), 1); }
    moveToEnd() { this.remove(); this.comp.layersList.push(this); }
    /** Caixa aproximada do texto: largura por caractere, topo acima da linha de base. */
    sourceRectAtTime() {
      if (this.kind !== "text") return { left: 0, top: 0, width: 0, height: 0 };
      const doc = this.property("ADBE Text Properties").property("ADBE Text Document").value;
      const lines = String(doc.text).split("\r"), width = Math.max(...lines.map(l => l.length)) * doc.fontSize * .55, height = lines.length * doc.fontSize * 1.2 - doc.fontSize * .4;
      return { left: doc.justification === ParagraphJustification.CENTER_JUSTIFY ? -width / 2 : 0, top: -doc.fontSize * .8, width, height };
    }
  }
  class CompItem extends Item {
    constructor(name, w, h, pixelAspect, duration, frameRate, register = true) {
      super(name, register);
      Object.assign(this, { width: w, height: h, pixelAspect, duration, frameRate, time: 0, layersList: [], controllers: [], motionGraphicsTemplateName: "" });
      if (essential) Object.defineProperty(this, "motionGraphicsTemplateControllerCount", { get: () => this.controllers.length });
      const comp = this;
      this.layers = {
        addText: text => comp.insert(new Layer(comp, "text", null, text)),
        addShape: () => comp.insert(new Layer(comp, "shape")),
        addNull: () => { const solid = new SolidItem("Null"); solid.parentFolder = project.rootFolder; return comp.insert(new Layer(comp, "null", solid)); },
        add: item => comp.insert(new Layer(comp, "av", item))
      };
    }
    get frameDuration() { return 1 / this.frameRate; }
    insert(layer) { this.layersList.unshift(layer); return layer; }
    get numLayers() { return this.layersList.length; }
    layer(key) { return typeof key === "number" ? this.layersList[key - 1] : this.layersList.find(l => l.name === key) ?? null; }
    get selectedLayers() { return this.layersList.filter(l => l.selected); }
    getMotionGraphicsTemplateControllerName(index) { return this.controllers[index - 1].name; }
    remove() { super.remove(); }
  }
  class File {
    constructor(path) { this.fsName = String(path).replace(/\\/g, "/"); this.name = this.fsName.split("/").pop(); }
    get parent() { return new File(this.fsName.split("/").slice(0, -1).join("/")); }
    get exists() { return this.fsName.startsWith(SOUND_ROOT) && !missingSounds.includes(this.name.replace(/\.wav$/, "")); }
  }
  class ImportOptions {
    constructor(file) { this.file = file; }
    canImportAs(type) { return type === ImportAsType.FOOTAGE; }
  }

  const project = {
    rootFolder: null, activeItem: null,
    get numItems() { return list.length; },
    item: index => list[index - 1],
    items: {
      addComp: (name, w, h, pa, duration, frameRate) => new CompItem(name, w, h, pa, duration, frameRate),
      addFolder: name => new FolderItem(name)
    },
    importFile: options => { imports++; return new FootageItem(options.file); }
  };
  project.rootFolder = new FolderItem("Root", false);
  const comp = new CompItem("Main", width, height, 1, 10, fps);
  comp.time = 2;
  const user = comp.insert(new Layer(comp, "solid", new SolidItem("User artwork")));
  user.selected = true;
  project.activeItem = comp;

  const app = { project, ...(fonts ? { fonts: { getFontsByPostScriptName: name => fonts.includes(name) ? [{ postScriptName: name }] : [] } } : {}) };
  const scope = await loadHostModules(
    ["generated/motion-contracts.jsx", "src/json.jsx", "generated/motion-library.jsx", "src/registry.jsx", "src/commands/elements-insert.jsx", "src/commands/sound-insert.jsx"],
    { app, CompItem, FolderItem, FootageItem, ImportOptions, ParagraphJustification, Shape, File },
    { fileName: `${EXTENSION_ROOT}/host/index.jsx` }
  );
  scope.ImportAsType = ImportAsType;
  const command = scope.MotionRegistry.get("ae.elements.insert");
  const insert = (args, locale = "pt-BR") => {
    const error = command.preflight(args, { locale });
    if (error) throw Object.assign(new Error(error.message), { failure: error });
    return command.run(args, { locale });
  };
  const soundCommand = scope.MotionRegistry.get("ae.sound.insert");
  const sound = (args, locale = "pt-BR") => {
    const error = soundCommand.preflight(args, { locale });
    if (error) throw Object.assign(new Error(error.message), { failure: error });
    return soundCommand.run(args, { locale });
  };
  return { scope, app, project, comp, user, list, command, insert, soundCommand, sound, ParagraphJustification, Layer, get imports() { return imports; } };
}

/** Uma camada aparece quando tem opacidade, escala e (se houver Trim Paths) traco. */
export function layerVisible(layer, time) {
  const transform = layer.property("ADBE Transform Group");
  if (transform.property("ADBE Opacity").valueAtTime(time) < .5) return false;
  const scale = transform.property("ADBE Scale").valueAtTime(time);
  if (Math.abs(scale[0]) < .5 || Math.abs(scale[1]) < .5) return false;
  const root = layer.property("ADBE Root Vectors Group");
  const trim = root?.property(1)?.property("ADBE Vectors Group").property("ADBE Vector Filter - Trim");
  if (trim && trim.property("ADBE Vector Trim End").valueAtTime(time) - trim.property("ADBE Vector Trim Start").valueAtTime(time) < .5) return false;
  return true;
}
