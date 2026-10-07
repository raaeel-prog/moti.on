import test from "node:test";
import assert from "node:assert/strict";
import {loadHostModules} from "./host-harness.mjs";

const CHILDREN = {
  "ADBE Transform Group": ["ADBE Anchor Point", "ADBE Position", "ADBE Scale", "ADBE Rotate Z", "ADBE Opacity"],
  "ADBE Text Properties": ["ADBE Text Document", "ADBE Text Animators"],
  "ADBE Text Animator": ["ADBE Text Selectors", "ADBE Text Animator Properties"],
  "ADBE Vector Group": ["ADBE Vectors Group"],
  "ADBE Vector Shape - Rect": ["ADBE Vector Rect Size", "ADBE Vector Rect Position", "ADBE Vector Rect Roundness"],
  "ADBE Vector Graphic - Fill": ["ADBE Vector Fill Color", "ADBE Vector Fill Opacity"],
  "ADBE Mask Atom": ["ADBE Mask Shape"],
  "ADBE Slider Control": ["ADBE Slider Control-0001"],
  "ADBE Color Control": ["ADBE Color Control-0001"],
  "ADBE Checkbox Control": ["ADBE Checkbox Control-0001"]
};
function document(text = "Alpha beta") {
  return {text, font: "ArialMT", fontSize: 80, tracking: 0, horizontalScale: 100, verticalScale: 100, baselineShift: 0, fauxBold: false, fauxItalic: false, applyFill: true, applyStroke: false, fillColor: [1,1,1], justification: 0, autoLeading: true, leading: 96, boxText: false,
    get baselineLocs() { return this.text.split(/\r|\n/).flatMap((line, i) => [0, i * 96, width(line), i * 96]); },
    characterRange() { return {...this}; }
  };
}
function cloneDoc(d) { return Object.assign(document(d.text), Object.fromEntries(Object.entries(d).filter(([key]) => key !== "baselineLocs"))); }
function width(s) { return [...s].reduce((sum,c) => sum + (c === " " ? 19 : c === "i" ? 13 : c === "W" ? 77 : 41), 0); }
class Prop {
  constructor(name, layer) { this.name = name; this.matchName = name; this.layer = layer; this.children = (CHILDREN[name] || []).map(n => new Prop(n, layer)); this._value = name === "ADBE Text Document" ? document() : 0; this.expression = ""; this.expressionEnabled = false; this.expressionError = ""; this.numKeys = 0; }
  get value() { return this.matchName === "ADBE Text Document" ? cloneDoc(this._value) : this._value; }
  setValue(value) { if (this.rejectOnce) { this.rejectOnce = false; throw Error("injected failure"); } this._value = this.matchName === "ADBE Text Document" ? cloneDoc(value) : value; }
  get numProperties() { return this.children.length; }
  property(key) { return typeof key === "number" ? this.children[key - 1] : this.children.find(p => p.matchName === key || p.name === key); }
  addProperty(name) { if (this.layer.comp.failProperty === name) throw Error("injected property failure"); const p = new Prop(name, this.layer); this.children.push(p); return p; }
}
let nextId = 1;
class Layer {
  constructor(comp, kind, text) { this.comp = comp; this.kind = kind; this.id = nextId++; this.name = "Title"; this.comment = ""; this.parent = null; this.enabled = true; this.locked = false; this.selected = true; this.inPoint = 0; this.outPoint = 5; this.solo = false; this.guideLayer = false; this.threeDLayer = false; this.hasTrackMatte = false; this.isTrackMatte = false; this.groups = ["ADBE Transform Group", "ADBE Effect Parade", "ADBE Mask Parade", ...(kind === "text" ? ["ADBE Text Properties"] : []), ...(kind === "shape" ? ["ADBE Root Vectors Group"] : [])].map(n => new Prop(n, this)); if (kind === "text") this.property("ADBE Text Properties").property("ADBE Text Document").setValue(document(text)); }
  property(name) { return this.groups.find(p => p.matchName === name); }
  remove() { if (this.comp.failRemove === this) { this.comp.failRemove = null; throw Error("injected remove failure"); } const at = this.comp.list.indexOf(this); if (at < 0) throw Error("removed"); this.comp.list.splice(at, 1); }
  moveBefore(other) { this.comp.list.splice(this.comp.list.indexOf(this), 1); this.comp.list.splice(this.comp.list.indexOf(other), 0, this); }
  moveAfter(other) { this.comp.list.splice(this.comp.list.indexOf(this), 1); this.comp.list.splice(this.comp.list.indexOf(other) + 1, 0, this); }
  sourceRectAtTime() { const d = this.property("ADBE Text Properties").property("ADBE Text Document").value; this.comp.measurements.push(d.text); return {left: 2, top: -61, width: width(d.text), height: 63}; }
  duplicate() { const dupe = this.kind === "text" ? new TextLayer(this.comp, "") : new Layer(this.comp, this.kind); for (const key of ["name", "comment", "enabled", "parent", "inPoint", "outPoint"]) dupe[key] = this[key]; dupe.groups = this.groups; this.comp.list.push(dupe); return dupe; }
}
class TextLayer extends Layer { constructor(comp, text) { super(comp, "text", text); } }
class Comp {
  constructor() { this.list = []; this.time = .5; this.frameDuration = 1/30; this.measurements = []; this.layers = {addText: text => this.add(new TextLayer(this, text)), addShape: () => this.add(new Layer(this, "shape")), addNull: () => this.add(new Layer(this, "null"))}; }
  add(l) { this.list.unshift(l); return l; }
  get numLayers() { return this.list.length; }
  get selectedLayers() { return this.list.filter(l => l.selected); }
  layer(i) { return this.list[i - 1]; }
}
const args = overrides => ({action: "apply", durationFrames: 24, staggerFrames: 4, paddingX: 14, paddingY: 10, roundness: 8, boxGap: 3, revealPoint: 45, fillColor: [.3,.1,.9], ...overrides});
function metadata(l) { const b64 = /\[MOTION_WORD_REVEAL_V1\](.*?)\[\/MOTION_WORD_REVEAL_V1\]/.exec(l.comment)?.[1]; return b64 ? JSON.parse(Buffer.from(b64, "base64url").toString()) : null; }
function controller(comp) { return comp.list.find(l => metadata(l)?.role === "controller"); }
function cp(l, name) { return l.property("ADBE Effect Parade").property(name).property(1); }
async function fixture(text = "Alpha beta") {
  const comp = new Comp(), source = comp.layers.addText(text); source.comment = "User notes";
  const app = {project: {activeItem: comp}};
  const scope = await loadHostModules(["generated/motion-contracts.jsx", "src/json.jsx", "src/registry.jsx", "src/commands/text-word-reveal.jsx"], {app, CompItem: Comp, TextLayer, Shape: class Shape {}, ParagraphJustification: {LEFT_JUSTIFY: 0}});
  const command = scope.MotionRegistry.get("ae.text.word-reveal");
  const run = a => { const e = command.preflight(a); if (e) return {error:e}; return command.run(a); };
  return {comp, source, app, command, run};
}
test("native words use measured typography, source and selection survive", async () => {
  const f = await fixture("Wi iii"); const result = f.run(args());
  assert.equal(result.changed, true); assert.equal(f.comp.list.length, 6); assert.equal(f.source.enabled, false); assert.equal(f.source.comment, "User notes");
  assert.deepEqual(f.comp.selectedLayers, [f.source]); assert.equal(f.comp.time, .5);
  assert.deepEqual(f.comp.measurements, ["Wi", "Wi", "Wi iii", "iii"]);
  const word = f.comp.list.find(l => metadata(l)?.role === "word" && metadata(l).order === 1);
  assert.equal(word.property("ADBE Transform Group").property("ADBE Position").value[0], width("Wi "));
  assert.equal(word.parent.parent, f.source);
  assert.match(word.property("ADBE Transform Group").property("ADBE Opacity").expression, /c\.parent\.transform\.opacity/);
  assert.equal(word.property("ADBE Mask Parade").numProperties, 1);
});
test("multiline uses native baselines, not a font-size approximation", async () => {
  const f = await fixture("One\rTwo"); f.run(args());
  const word = f.comp.list.find(l => metadata(l)?.role === "word" && metadata(l).order === 1);
  assert.equal(word.property("ADBE Transform Group").property("ADBE Position").value[1], 96);
});
test("repeated apply adjusts native controls without duplicating or replacing word edits", async () => {
  const f = await fixture(); f.run(args()); const c = controller(f.comp), count = f.comp.numLayers;
  const box = f.comp.list.find(l => metadata(l)?.role === "box"); cp(box, "Override color").setValue(1);
  cp(box, "Word color").setValue([1,0,0,1]); const result = f.run(args({paddingX: 42}));
  assert.equal(result.data.updatedCount, 1); assert.equal(f.comp.numLayers, count); assert.equal(cp(c, "Padding X").value, 42); assert.equal(cp(box, "Override color").value, 1);
});
test("remove restores original source and leaves unrelated content", async () => {
  const f = await fixture(); f.run(args()); const external = f.comp.layers.addShape(); external.selected = false;
  const result = f.run(args({action: "remove"})); assert.equal(result.data.removedCount, 5); assert.deepEqual(f.comp.list, [external, f.source]); assert.equal(f.source.enabled, true); assert.equal(f.source.comment, "User notes");
});
test("generated member selection resolves original source", async () => {
  const f = await fixture(); f.run(args()); f.source.selected = false; const box = f.comp.list.find(l => metadata(l)?.role === "box"); box.selected = true;
  assert.equal(f.run(args({paddingY: 33})).data.updatedCount, 1); assert.deepEqual(f.comp.selectedLayers, [box]);
});
test("invalid arguments and unsupported text are refused before mutation", async () => {
  for (const invalid of [{paddingX: -1}, {durationFrames: 2}, {staggerFrames: .5}, {boxGap: 3, revealPoint: 100}, {fillColor: [1,2,3]}, {extra: true}]) {
    const f = await fixture(); assert.equal(f.run(args(invalid)).error.code, "INVALID_PRESET"); assert.equal(f.comp.numLayers, 1);
  }
  for (const mutate of [s => {s.locked=true;}, s => {s.threeDLayer=true;}, s => {s.property("ADBE Text Properties").property("ADBE Text Document")._value.boxText=true;}, s => {s.property("ADBE Text Properties").property("ADBE Text Document").numKeys=2;}]) {
    const f = await fixture(); mutate(f.source); assert.ok(f.run(args()).error); assert.equal(f.comp.numLayers, 1);
  }
});
test("no composition and no selection have explicit failures", async () => {
  const f = await fixture(); f.app.project.activeItem = null; assert.equal(f.run(args()).error.code, "NO_ACTIVE_COMP"); f.app.project.activeItem=f.comp; f.source.selected=false; assert.equal(f.run(args()).error.code, "NO_SELECTION");
});
test("user keyframes in controller are preserved on attempted apply", async () => {
  const f = await fixture(); f.run(args()); const p = cp(controller(f.comp), "Padding X"); p.numKeys=2;
  assert.equal(f.run(args({paddingX: 22})).error.code, "KEYFRAME_CONFLICT"); assert.equal(p.value, 14);
});
test("modified source asks for explicit rebuild", async () => {
  const f = await fixture(); f.run(args()); f.source.property("ADBE Text Properties").property("ADBE Text Document").setValue(document("Changed")); assert.equal(f.run(args()).error.code, "TRACK_CONFLICT");
});
test("creation failure rolls back all created nodes and visibility", async () => {
  const f = await fixture(); f.comp.failProperty="ADBE Vector Graphic - Fill"; assert.throws(() => f.run(args()), /injected/); assert.deepEqual(f.comp.list, [f.source]); assert.equal(f.source.enabled, true); assert.deepEqual(f.comp.selectedLayers, [f.source]);
});
test("adjust failure restores controls written earlier in operation", async () => {
  const f = await fixture(); f.run(args()); const c=controller(f.comp); cp(c,"Padding Y").rejectOnce=true;
  assert.throws(() => f.run(args({durationFrames: 30,paddingX: 44,paddingY: 55})), /injected/); assert.equal(cp(c,"Duration (frames)").value,24); assert.equal(cp(c,"Padding X").value,14);
});
test("remove refuses to detach external user children", async () => {
  const f = await fixture(); f.run(args()); const external=f.comp.layers.addShape(); external.parent=controller(f.comp); external.selected=false; assert.equal(f.run(args({action:"remove"})).error.code,"TRACK_CONFLICT");
});
test("partial remove failure restores the rig from native duplicates", async () => {
  const f = await fixture(); f.run(args()); f.comp.failRemove=f.comp.list.find(l => metadata(l)?.role === "word"); assert.throws(() => f.run(args({action:"remove"})), /injected/); assert.equal(f.comp.numLayers,6); assert.equal(f.source.enabled,false); assert.ok(controller(f.comp)); assert.equal(f.command.preflight(args()),null);
});

