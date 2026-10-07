import test from "node:test";
import assert from "node:assert/strict";
import { loadHostModules } from "./host-harness.mjs";

const clone = (value) => value && typeof value === "object" ? JSON.parse(JSON.stringify(value)) : value;
const ERROR = Object.fromEntries(["INVALID_PRESET", "NO_ACTIVE_PROJECT", "NO_ACTIVE_COMP", "NO_SELECTION", "INVALID_SELECTION_TYPE", "TRACK_CONFLICT", "KEYFRAME_CONFLICT", "EXPRESSION_CONFLICT", "CAPABILITY_UNAVAILABLE", "HOST_OPERATION_FAILED", "ROLLBACK_FAILED"].map((v) => [v, v]));
const defaults = { action: "apply", durationFrames: 12, staggerFrames: 2, unit: "characters" };
const PROGRESS = "Moti.on Swap - Progress";
const DURATION = "Moti.on Swap - Duration";
const STAGGER = "Moti.on Swap - Stagger";

class Property {
  constructor(name, value, owner) {
    this.matchName = name; this.name = name; this._value = clone(value); this.owner = owner;
    this.numKeys = 0; this.canSetExpression = true; this.expressionEnabled = false; this.expressionError = ""; this._expression = "";
  }
  get value() { return this.link ? this.link.index : clone(this._value); }
  setValue(value) {
    if (this.failSet) { this.failSet = false; throw new Error("injected setValue failure"); }
    if (this.matchName === "ADBE Layer Control-0001") this.link = this.owner.comp.layer(value);
    this._value = clone(value);
  }
  get expression() { return this._expression; }
  set expression(value) {
    this._expression = value;
    if (this.owner.comp.failExpression && value.startsWith("// MOTION_STYLE_SWAP") && this.matchName === "ADBE Text Expressible Amount") {
      this.owner.comp.failExpression -= 1;
      if (this.owner.comp.failExpression === 0) throw new Error("injected expression failure");
    }
  }
}
class Group {
  constructor(name, owner) { this.matchName = name; this.name = name; this.owner = owner; this.items = []; }
  get numProperties() { return this.items.length; }
  get propertyIndex() { return this.parent.items.indexOf(this) + 1; }
  property(key) { return typeof key === "number" ? this.items[key - 1] : this.items.find((p) => p.matchName === key || p.name === key); }
  canAddProperty() { return true; }
  push(item) { this.items.push(item); item.parent = this; return item; }
  addProperty(name) {
    if (name === "ADBE Text Animator") {
      const item = this.push(new Group(name, this.owner));
      item.push(new Group("ADBE Text Animator Properties", this.owner));
      item.push(new Group("ADBE Text Selectors", this.owner));
      return item;
    }
    if (name === "ADBE Text Expressible Selector") {
      const item = this.push(new Group(name, this.owner));
      item.push(new Property("ADBE Text Range Type2", 1, this.owner));
      item.push(new Property("ADBE Text Expressible Amount", 100, this.owner));
      return item;
    }
    if (name === "ADBE Slider Control" || name === "ADBE Layer Control" || name === "ADBE Checkbox Control") {
      const item = this.push(new Group(name, this.owner));
      item.push(new Property(name + "-0001", 0, this.owner));
      return item;
    }
    return this.push(new Property(name, 100, this.owner));
  }
  remove() { this.parent.items.splice(this.parent.items.indexOf(this), 1); }
}
class Layer {
  constructor(comp, name) {
    this.comp = comp; this.name = name; this.comment = "user note " + name;
    this.enabled = true; this.selected = true; this.locked = false; this.threeDLayer = false; this.parent = null; this.solo = false;
    this.inPoint = 0; this.outPoint = 20; this.startTime = 0; this.groups = {};
    this.groups["ADBE Effect Parade"] = new Group("ADBE Effect Parade", this);
    this.groups["ADBE Mask Parade"] = new Group("ADBE Mask Parade", this);
    const transform = this.groups["ADBE Transform Group"] = new Group("ADBE Transform Group", this);
    for (const [key, value] of Object.entries({ "ADBE Position": [300, 200], "ADBE Anchor Point": [0, 0], "ADBE Scale": [100, 100], "ADBE Rotate Z": 0, "ADBE Opacity": 72 })) transform.push(new Property(key, value, this));
  }
  get index() { return this.comp.all.indexOf(this) + 1; }
  property(name) { return this.groups[name]; }
  remove() {
    if (this.failRemove) { this.failRemove = false; throw new Error("injected remove failure"); }
    this.comp.all.splice(this.comp.all.indexOf(this), 1);
  }
}
class TextLayer extends Layer {
  constructor(comp, name, text) {
    super(comp, name);
    this.rect = { left: -10, top: -35, width: 280, height: 40 };
    const group = this.groups["ADBE Text Properties"] = new Group("ADBE Text Properties", this);
    group.push(new Property("ADBE Text Document", { text, font: "UserFont", fontSize: 48, fillColor: [1, 0.8, 0.4] }, this));
    group.push(new Group("ADBE Text Animators", this));
  }
  sourceRectAtTime() { return clone(this.rect); }
  duplicate() {
    const copy = new TextLayer(this.comp, this.name, this.property("ADBE Text Properties").property("ADBE Text Document").value.text);
    copy.comment = this.comment; copy.rect = clone(this.rect); copy.inPoint = this.inPoint; copy.outPoint = this.outPoint; copy.startTime = this.startTime;
    copy.property("ADBE Text Properties").property("ADBE Text Document").setValue(this.property("ADBE Text Properties").property("ADBE Text Document").value);
    for (const property of this.property("ADBE Transform Group").items) copy.property("ADBE Transform Group").property(property.matchName).setValue(property.value);
    this.comp.all.splice(this.index - 1, 0, copy);
    return copy;
  }
}
class CompItem {
  constructor() {
    this.all = []; this.time = 1; this.frameDuration = 1 / 30;
    this.layers = { addNull: () => { const layer = new Layer(this, "Null"); this.all.unshift(layer); return layer; } };
  }
  get numLayers() { return this.all.length; }
  layer(index) { return this.all[index - 1]; }
  get selectedLayers() { return this.all.filter((layer) => layer.selected); }
}
function metadata(layer) {
  const match = /\[MOTION_STYLE_SWAP_V1\](.*?)\[\/MOTION_STYLE_SWAP_V1\]/.exec(layer.comment);
  return match ? JSON.parse(match[1]) : null;
}
const role = (comp, value) => comp.all.find((layer) => metadata(layer)?.role === value);
const control = (layer, name) => layer.property("ADBE Effect Parade").property(name).property(1);
const selector = (layer) => layer.property("ADBE Text Properties").property("ADBE Text Animators").property(1).property("ADBE Text Selectors").property(1);
const transform = (layer, name) => layer.property("ADBE Transform Group").property(name);
const document = (layer) => layer.property("ADBE Text Properties").property("ADBE Text Document");
function visibleCenter(layer) {
  const rect = layer.rect; const anchor = transform(layer, "ADBE Anchor Point").value; const position = transform(layer, "ADBE Position").value;
  const scale = transform(layer, "ADBE Scale").value; const angle = transform(layer, "ADBE Rotate Z").value * Math.PI / 180;
  const x = (rect.left + rect.width / 2 - anchor[0]) * scale[0] / 100;
  const y = (rect.top + rect.height / 2 - anchor[1]) * scale[1] / 100;
  return [position[0] + x * Math.cos(angle) - y * Math.sin(angle), position[1] + x * Math.sin(angle) + y * Math.cos(angle)];
}
async function fixture() {
  const comp = new CompItem();
  const a = new TextLayer(comp, "Style A", "Text Swapping"); const b = new TextLayer(comp, "Style B", "TEXT SWAPPING");
  transform(b, "ADBE Position").setValue([490, 340]); b.rect.width = 360;
  document(b).setValue({ ...document(b).value, font: "OtherUserFont", fontSize: 60 });
  comp.all.push(a, b);
  const scope = await loadHostModules(["src/registry.jsx", "src/commands/text-style-swap.jsx"], { app: { project: { activeItem: comp } }, CompItem, TextLayer, MotionContracts: { ERROR }, MotionJson: JSON });
  const handler = scope.MotionRegistry.get("ae.text.style-swap");
  const run = (overrides = {}) => { const args = { ...defaults, ...overrides }; assert.equal(handler.preflight(args), null); return handler.run(args); };
  return { comp, a, b, handler, run };
}

test("style swap creates aligned editable copies and restores source content, comments and visibility on Remove", async () => {
  const { comp, a, b, run } = await fixture();
  const original = [a, b].map((layer) => ({ comment: layer.comment, text: document(layer).value, position: transform(layer, "ADBE Position").value, opacity: transform(layer, "ADBE Opacity").value }));
  const result = run();
  assert.equal(result.data.createdCount, 3); assert.equal(comp.numLayers, 5); assert.equal(comp.time, 1);
  assert.equal(a.enabled, false); assert.equal(b.enabled, false); assert.deepEqual(comp.selectedLayers, [role(comp, "controller")]);
  assert.deepEqual(transform(role(comp, "controller"), "ADBE Position").value, [290,185]);
  assert.deepEqual(visibleCenter(role(comp, "from")), visibleCenter(role(comp, "to")));
  assert.deepEqual(document(role(comp, "to")).value, original[1].text);
  assert.deepEqual(transform(b, "ADBE Position").value, original[1].position);
  run({ action: "remove" });
  assert.deepEqual(comp.all, [a, b]); assert.equal(a.enabled, true); assert.equal(b.enabled, true);
  [a, b].forEach((layer, index) => { assert.equal(layer.comment, original[index].comment); assert.deepEqual(document(layer).value, original[index].text); assert.deepEqual(transform(layer, "ADBE Position").value, original[index].position); assert.equal(transform(layer, "ADBE Opacity").value, original[index].opacity); });
});

test("style swap visual alignment includes independent anchors, scale, rotation and negative scale", async () => {
  const { comp, a, b, run } = await fixture();
  transform(a, "ADBE Anchor Point").setValue([25, -12]); transform(a, "ADBE Scale").setValue([150, 70]); transform(a, "ADBE Rotate Z").setValue(28);
  transform(b, "ADBE Anchor Point").setValue([-19, 7]); transform(b, "ADBE Scale").setValue([-80, 115]); transform(b, "ADBE Rotate Z").setValue(-15);
  run();
  const first = visibleCenter(role(comp, "from")); const second = visibleCenter(role(comp, "to"));
  assert.ok(Math.abs(first[0] - second[0]) < 1e-9); assert.ok(Math.abs(first[1] - second[1]) < 1e-9);
});

test("reapply adjusts the existing rig, counts words and preserves user progress keys and original start", async () => {
  const { comp, run } = await fixture(); run();
  const controller = role(comp, "controller"); control(controller, PROGRESS).numKeys = 2;
  comp.time = 3; const result = run({ unit: "words", durationFrames: 20, staggerFrames: 5 });
  assert.equal(result.data.createdCount, 0); assert.equal(comp.numLayers, 5); assert.equal(role(comp, "controller"), controller);
  assert.equal(control(controller, DURATION).value, 20); assert.equal(control(controller, STAGGER).value, 5); assert.equal(control(controller, PROGRESS).numKeys, 2);
  assert.equal(metadata(controller).count, 2); assert.equal(metadata(controller).start, 1);
  assert.equal(selector(role(comp, "from")).property("ADBE Text Range Type2").value, 3);
});

test("generated selector equations are complementary, stagger by units and reach exact endpoints", async () => {
  const { comp, run } = await fixture(); run();
  let progress = 0;
  const c = { effect: (name) => () => ({ [PROGRESS]: progress, [DURATION]: 12, [STAGGER]: 2 })[name] };
  function amount(layer, index) {
    const source = selector(layer).property("ADBE Text Expressible Amount").expression;
    return new Function("effect", "textIndex", "textTotal", source.replace(/100 \* (f|\(1 - f\));$/, "return 100 * $1;"))(() => () => c, index, 13);
  }
  for (progress of [0, 25, 50, 75, 100]) {
    for (let index = 1; index <= 13; index++) assert.ok(Math.abs(amount(role(comp, "from"), index) + amount(role(comp, "to"), index) - 100) < 1e-9);
  }
  progress = 0; assert.equal(amount(role(comp, "from"), 1), 0); assert.equal(amount(role(comp, "to"), 13), 100);
  progress = 100; assert.equal(amount(role(comp, "from"), 13), 100); assert.equal(amount(role(comp, "to"), 1), 0);
  progress = 50; assert.ok(amount(role(comp, "from"), 1) > amount(role(comp, "from"), 13));
});

test("preflight rejects mismatched units, animated/3D/parented/matted/masked texts and insufficient overlap without mutation", async () => {
  for (const change of [
    (f) => document(f.b).setValue({ text: "different length" }),
    (f) => { f.a.threeDLayer = true; },
    (f) => { f.a.parent = f.b; },
    (f) => { f.a.locked = true; },
    (f) => { f.a.hasTrackMatte = true; },
    (f) => { f.a.property("ADBE Mask Parade").addProperty("mask"); },
    (f) => { f.a.property("ADBE Text Properties").property("ADBE Text Animators").addProperty("ADBE Text Animator"); },
    (f) => { transform(f.a, "ADBE Position").numKeys = 2; },
    (f) => { f.b.outPoint = 0.9; }
  ]) {
    const f = await fixture(); change(f);
    assert.ok(f.handler.preflight(defaults)); assert.equal(f.comp.numLayers, 2); assert.equal(f.a.enabled, true); assert.equal(f.b.enabled, true);
  }
});

test("failed expression creation rolls back copies, source visibility, source comments and selection", async () => {
  const { comp, a, b, handler } = await fixture(); comp.failExpression = 2;
  const comments = [a.comment, b.comment];
  assert.throws(() => handler.run(defaults), /injected expression/);
  assert.deepEqual(comp.all, [a, b]); assert.equal(a.enabled, true); assert.equal(b.enabled, true); assert.deepEqual([a.comment, b.comment], comments); assert.deepEqual(comp.selectedLayers, [a, b]);
});

test("failed adjustment restores previous controls and expression enabled state", async () => {
  const { comp, handler, run } = await fixture(); run();
  const controller = role(comp, "controller"); const oldExpression = control(controller, PROGRESS).expression;
  control(controller, PROGRESS).expressionEnabled = false;
  control(controller, STAGGER).failSet = true;
  assert.throws(() => handler.run({ ...defaults, durationFrames: 22, staggerFrames: 7 }), /injected setValue/);
  assert.equal(control(controller, DURATION).value, 12); assert.equal(control(controller, STAGGER).value, 2);
  assert.equal(control(controller, PROGRESS).expression, oldExpression); assert.equal(control(controller, PROGRESS).expressionEnabled, false);
});

test("adjustment validates new unit counts/timing and preserves custom expressions before opening Undo", async () => {
  const { comp, handler, run } = await fixture(); run({ unit: "words" });
  document(role(comp, "to")).setValue({ text: "Other typography" });
  assert.equal(handler.preflight(defaults).code, ERROR.INVALID_SELECTION_TYPE);
  assert.equal(handler.preflight({ ...defaults, unit: "words", durationFrames: 300, staggerFrames: 60 }), null);
  role(comp, "to").outPoint = 2;
  control(role(comp,"controller"),"Moti.on Swap - Follow Null").setValue(0);
  control(role(comp,"controller"),"Moti.on Swap - Automatic").setValue(1);
  assert.equal(handler.preflight({ ...defaults, unit: "words", durationFrames: 300 }).code, ERROR.INVALID_SELECTION_TYPE);
  control(role(comp, "controller"), PROGRESS).expression = "value + 10";
  assert.equal(handler.preflight({ ...defaults, unit: "words" }).code, ERROR.EXPRESSION_CONFLICT);
});

test("controller rename and layer reorder keep managed identity; Remove maps selected controller back to originals", async () => {
  const { comp, a, b, run } = await fixture(); run();
  const controller = role(comp, "controller"); controller.name = "My controller";
  comp.all.reverse(); comp.all.forEach((layer) => { layer.selected = layer === controller; });
  run({ action: "remove" });
  assert.equal(comp.numLayers, 2); assert.equal(a.enabled, true); assert.equal(b.enabled, true); assert.ok(a.selected); assert.ok(b.selected);
});

test("user notes appended while managed survive Remove; partial native deletion reports rollback failure", async () => {
  const f = await fixture(); f.run(); f.a.comment += "\nnew note"; f.run({ action: "remove" });
  assert.equal(f.a.comment, "user note Style A\nnew note");
  const g = await fixture(); g.run(); role(g.comp, "to").failRemove = true;
  assert.throws(() => g.handler.run({ ...defaults, action: "remove" }), (error) => error.motionCode === ERROR.ROLLBACK_FAILED);
});

test("manual progress works at a fixed time and automatic mode starts at the original playhead", async () => {
  const { comp, run } = await fixture();run();
  const expression=control(role(comp,"controller"),PROGRESS).expression;
  const evaluate=async (automatic,value,time,numKeys=0)=>{
    const {runInNewContext}=await import('node:vm');
    return runInNewContext(expression,{effect:name=>()=>({[DURATION]:12,[STAGGER]:2,'Moti.on Swap - Automatic':{valueOf:()=>automatic},'Moti.on Swap - Follow Null':{valueOf:()=>0}})[name],thisComp:{frameDuration:1/30},numKeys,value,time});
  };
  assert.equal(await evaluate(0,0,8),0);
  assert.equal(await evaluate(0,100,8),100);
  assert.equal(await evaluate(0,35,8),35);
  assert.equal(await evaluate(1,0,1),0);
  assert.equal(await evaluate(1,0,10),100);
  assert.equal(await evaluate(1,45,10,2),45,'user keyframes override auto mode');
});

test("legacy swap upgrades its manual controls without overwriting user progress", async () => {
  const {comp,run,handler}=await fixture();run();const controller=role(comp,'controller');
  const progress=control(controller,PROGRESS);
  progress.expression='// MOTION_STYLE_SWAP v1\n'+progress.expression.split('} else {\n')[1].replace(/\n}$/, '');
  controller.property('ADBE Effect Parade').property('Moti.on Swap - Follow Null').remove();
  controller.property('ADBE Effect Parade').property('Moti.on Swap - Text').remove();
  progress.expression=progress.expression.replace('var automatic = effect("Moti.on Swap - Automatic")(1);\n','').replace('automatic == 0 || ','');
  controller.property('ADBE Effect Parade').property('Moti.on Swap - Automatic').remove();
  for(const r of ['from','to']){const amount=selector(role(comp,r)).property('ADBE Text Expressible Amount');amount.expression=amount.expression.split('\n').filter(line=>!line.startsWith('if(c.effect(')).join('\n');}
  const old=metadata(controller);delete old.controlsVersion;
  controller.comment='\n[MOTION_STYLE_SWAP_V1]'+JSON.stringify(old)+'[/MOTION_STYLE_SWAP_V1]';progress.numKeys=2;
  assert.equal(handler.preflight(defaults),null);run();
  assert.equal(metadata(controller).controlsVersion,3);assert.equal(control(controller,PROGRESS).numKeys,2);
  assert.equal(control(controller,'Moti.on Swap - Follow Null').value,1);assert.equal(comp.numLayers,5);
});

test("dragging the null directly controls the swap at a fixed time in the source coordinate system", async () => {
  const {comp,run}=await fixture();run();const p=control(role(comp,'controller'),PROGRESS);
  const {runInNewContext}=await import('node:vm');
  const evaluate=x=>runInNewContext(p.expression,{effect:name=>()=>name==='Moti.on Swap - Follow Null'?{valueOf:()=>1}:{sourceRectAtTime:()=>({left:20,width:200}),fromComp:([cx,cy])=>[(cy-100)/2, -(cx-400)/2]},time:1,anchorPoint:[0,0],toComp:()=>[400,100+2*x]});
  assert.equal(evaluate(-20),0);assert.equal(evaluate(20),0);assert.equal(evaluate(120),50);assert.equal(evaluate(220),100);assert.equal(evaluate(400),100);
  transform(role(comp,'controller'),'ADBE Position').setValue([700,200]);run();
  assert.deepEqual(transform(role(comp,'controller'),'ADBE Position').value,[700,200],'repeat apply preserves moved controller');
});

