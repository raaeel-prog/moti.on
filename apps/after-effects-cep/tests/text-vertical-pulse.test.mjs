import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { loadHostModules } from "./host-harness.mjs";

const ERROR = Object.fromEntries([
  "INVALID_PRESET", "NO_ACTIVE_PROJECT", "NO_ACTIVE_COMP", "NO_SELECTION", "INVALID_SELECTION_TYPE",
  "TRACK_CONFLICT", "KEYFRAME_CONFLICT", "EXPRESSION_CONFLICT", "CAPABILITY_UNAVAILABLE",
  "HOST_OPERATION_FAILED", "ROLLBACK_FAILED"
].map(code => [code, code]));
const defaults = {
  action: "apply", durationFrames: 74, peakScalePercent: 360,
  distortion: 80, glow: 80, seed: 1, accentColor: [1, 0.68, 0.08]
};
const legacyDefaults = { ...defaults, peakScalePercent: 235, distortion: 50, glow: 60, accentColor: [1, 0.62, 0.12] };
const clone = value => value && typeof value === "object" ? JSON.parse(JSON.stringify(value)) : value;

class Property {
  constructor(owner, matchName, value) {
    this.owner = owner; this.matchName = matchName; this.name = matchName; this._value = clone(value);
    this._expression = ""; this.expressionEnabled = false; this.expressionError = ""; this.numKeys = 0;
    this.dimensionsSeparated = false; this.canSetExpression = true; this.isModified = false;
  }
  assertLive() { if (this.stale) throw Error("invalidated native property reference"); }
  get value() { this.assertLive(); return clone(this._value); }
  setValue(value) {
    this.assertLive();
    if (this.owner.comp.failWaveControl && this.parentGroup?.name === "Moti.on Pulse · Wave spread (%)") {
      this.owner.comp.failWaveControl = false; throw Error("injected wave control failure");
    }
    this.isModified ||= JSON.stringify(this._value) !== JSON.stringify(value);
    this._value = clone(value);
  }
  get expression() { this.assertLive(); return this._expression; }
  set expression(value) {
    this.assertLive();
    if (!this.canSetExpression) throw Error("property does not support expressions");
    if (this.owner.comp.failBlur && this.matchName === "ADBE Gaussian Blur 2-0001") {
      this.owner.comp.failBlur = false; throw Error("injected blur failure");
    }
    if (this.owner.comp.failGlow && this.matchName === "ADBE Glo2-0004") {
      this.owner.comp.failGlow = false; throw Error("injected native Glow failure");
    }
    if (this.owner.comp.failSelector && this.matchName === "ADBE Text Expressible Amount" && this.owner.comment.includes('"role":"glow"')) {
      this.owner.comp.failSelector = false; throw Error("injected selector failure");
    }
    this._expression = value; this.expressionEnabled = Boolean(value);
  }
  removeKey() { this.numKeys -= 1; }
}
class Group {
  constructor(owner, matchName) { this.owner = owner; this.matchName = matchName; this.name = matchName; this.items = []; }
  get numProperties() { return this.items.length; }
  property(key) {
    if (this.stale) throw Error("invalidated native property group reference");
    return typeof key === "number" ? this.items[key - 1] ?? null : this.items.find(item => item.matchName === key || item.name === key) ?? null;
  }
  push(item) { item.parentGroup = this; this.items.push(item); return item; }
  remove() {
    const parent = this.parentGroup;
    parent.items.splice(parent.items.indexOf(this), 1);
    parent.invalidateIndexedReferences();
  }
  invalidateIndexedReferences() {
    if (!["ADBE Effect Parade", "ADBE Text Animators", "ADBE Text Selectors", "ADBE Text Animator Properties"].includes(this.matchName) || !this.owner.comp.invalidateEffectReferences) return;
    const copy = original => {
      const replacement = original instanceof Group ? new Group(original.owner, original.matchName) : new Property(original.owner, original.matchName, original._value);
      replacement.name = original.name;
      if (original instanceof Group) for (const item of original.items) replacement.push(copy(item));
      else {
        replacement._expression = original._expression; replacement.expressionEnabled = original.expressionEnabled;
        replacement.numKeys = original.numKeys; replacement.dimensionsSeparated = original.dimensionsSeparated;
        replacement.canSetExpression = original.canSetExpression; replacement.isModified = original.isModified;
      }
      original.stale = true;
      return replacement;
    };
    this.items = this.items.map(original => { const replacement = copy(original); replacement.parentGroup = this; return replacement; });
  }
  canAddProperty(name) {
    return ["ADBE Slider Control", "ADBE Color Control", "ADBE Gaussian Blur 2", "ADBE Turbulent Displace", "ADBE Glo2",
      "ADBE Text Animator", "ADBE Text Expressible Selector", "ADBE Text Scale 3D", "ADBE Text Opacity"].includes(name) &&
      !this.owner.comp.unavailableEffects?.includes(name);
  }
  addProperty(name) {
    if (!this.canAddProperty(name)) throw Error("unsupported effect");
    this.invalidateIndexedReferences();
    if (name === "ADBE Text Scale 3D" || name === "ADBE Text Opacity") return this.push(new Property(this.owner, name, name === "ADBE Text Scale 3D" ? [100, 100, 100] : 100));
    const effect = this.push(new Group(this.owner, name));
    if (name === "ADBE Text Animator") {
      effect.push(new Group(this.owner, "ADBE Text Selectors"));
      const props = effect.push(new Group(this.owner, "ADBE Text Animator Properties"));
      props.push(new Property(this.owner, "ADBE Text Position 3D", [0, 0, 0]));
      props.push(new Property(this.owner, "ADBE Text Opacity", 100));
      return effect;
    }
    if (name === "ADBE Text Expressible Selector") {
      const unit = effect.push(new Property(this.owner, "ADBE Text Range Type2", 1)); unit.canSetExpression = false;
      if (!this.owner.comp.missingSelectorAmount) effect.push(new Property(this.owner, "ADBE Text Expressible Amount", [100, 100, 100]));
      return effect;
    }
    const properties = name === "ADBE Turbulent Displace"
      ? ["-0001", "-0002", "-0003", "-0004", "-0005", "-0006", "-0007", "-0008", "-0009", "-0010"].map(suffix => name + suffix)
      : name === "ADBE Glo2" ? ["-0003", "-0004", "-0007"].map(suffix => name + suffix)
      : [name + "-0001"];
    for (const key of properties) {
      if (key === this.owner.comp.missingGlowParameter) continue;
      effect.push(new Property(this.owner, key, key === "ADBE Turbulent Displace-0001" || key === "ADBE Glo2-0007" ? 1 : 0));
    }
    return effect;
  }
}
class TextLayer {
  constructor(comp, name, content = "PULSE") {
    this.comp = comp; this.id = comp.nextId++; this.name = name; this.comment = `User note: ${name}`;
    this.enabled = true; this.selected = true; this.selectedProperties = []; this.locked = false;
    this.threeDLayer = false; this.solo = false; this.guideLayer = false;
    this.hasTrackMatte = false; this.isTrackMatte = false; this.parent = null;
    this.groups = {};
    const text = this.groups["ADBE Text Properties"] = new Group(this, "ADBE Text Properties");
    text.push(new Property(this, "ADBE Text Document", { text: content, boxText: false }));
    text.push(new Group(this, "ADBE Text Animators"));
    const more = text.push(new Group(this, "ADBE Text More Options"));
    const grouping = more.push(new Property(this, "ADBE Text Anchor Point Option", 1)); grouping.canSetExpression = false;
    more.push(new Property(this, "ADBE Text Anchor Point Align", [0, 0]));
    this.groups["ADBE Effect Parade"] = new Group(this, "ADBE Effect Parade");
    this.groups["ADBE Mask Parade"] = new Group(this, "ADBE Mask Parade");
    const transform = this.groups["ADBE Transform Group"] = new Group(this, "ADBE Transform Group");
    for (const [name, value] of Object.entries({
      "ADBE Anchor Point": [0, 0], "ADBE Position": [300, 200], "ADBE Scale": [100, 100],
      "ADBE Rotate Z": 0, "ADBE Opacity": 100
    })) transform.push(new Property(this, name, value));
  }
  property(name) { return this.groups[name] ?? null; }
  get index() { return this.comp.layers.indexOf(this) + 1; }
  moveBefore(other) {
    this.comp.layers.splice(this.comp.layers.indexOf(this), 1);
    this.comp.layers.splice(this.comp.layers.indexOf(other), 0, this);
  }
  moveToEnd() { this.comp.layers.splice(this.comp.layers.indexOf(this), 1); this.comp.layers.push(this); }
  sourceRectAtTime() { return { left: -10, top: -42, width: 240, height: 52 }; }
  duplicate() {
    const copy = new TextLayer(this.comp, this.name, this.property("ADBE Text Properties").property("ADBE Text Document").value.text);
    copy.comment = this.comment; copy.parent = this.parent;
    const originalText = this.property("ADBE Text Properties").property("ADBE Text Document");
    const copiedText = copy.property("ADBE Text Properties").property("ADBE Text Document");
    copiedText.numKeys = originalText.numKeys; copiedText._expression = originalText._expression; copiedText.expressionEnabled = originalText.expressionEnabled;
    for (const original of this.property("ADBE Transform Group").items)
      copy.property("ADBE Transform Group").property(original.matchName).setValue(original.value);
    this.comp.layers.splice(this.comp.layers.indexOf(this), 0, copy); this.selected = false;
    return copy;
  }
  remove() { this.comp.layers.splice(this.comp.layers.indexOf(this), 1); }
}
class CompItem {
  constructor() { this.layers = []; this.nextId = 1; this.time = 1.25; this.frameDuration = 1 / 30; this.failBlur = false; }
  get selectedLayers() { return this.layers.filter(layer => layer.selected); }
  get numLayers() { return this.layers.length; }
  layer(index) { return this.layers[index - 1]; }
}
async function fixture() {
  const comp = new CompItem();
  const source = new TextLayer(comp, "Original"); comp.layers.push(source);
  const scope = await loadHostModules(["src/registry.jsx", "src/commands/text-vertical-pulse.jsx"], {
    app: { project: { activeItem: comp } }, CompItem, TextLayer,
    MotionContracts: { ERROR }, MotionJson: JSON
  });
  const handler = scope.MotionRegistry.get("ae.text.vertical-pulse");
  return { comp, source, handler, run: args => handler.run({ ...defaults, ...args }) };
}
function role(comp, role) {
  return comp.layers.find(layer => layer.comment.includes('"role":"' + role + '"'));
}
function control(source, name) { return source.property("ADBE Effect Parade").property(name).property(1); }
function evaluate(property, source, comp, progress, start = 1.25, textIndex = 1, textTotal = 11) {
  const style = {
    setText() { return this; }, setApplyFill() { return this; },
    setFillColor(color) { this.fillColor = color; return this; }, setApplyStroke() { return this; }
  };
  const sourceText = { ...source.property("ADBE Text Properties").property("ADBE Text Document").value, getStyleAt: () => style };
  const parent = {
    effect(name) { return () => control(source, name).value; },
    transform: { opacity: 100 },
    sourceRectAtTime: () => source.sourceRectAtTime(), text: { sourceText }
  };
  return vm.runInNewContext(property.expression, {
    parent, thisComp: { frameDuration: comp.frameDuration },
    time: start + defaults.durationFrames * comp.frameDuration * progress, textIndex, textTotal, Math
  });
}
function selector(layer) { return layer.property("ADBE Text Properties").property("ADBE Text Animators").property(1).property("ADBE Text Selectors").property(1).property("ADBE Text Expressible Amount"); }
function characterScale(layer) { return layer.property("ADBE Text Properties").property("ADBE Text Animators").property(1).property("ADBE Text Animator Properties").property("ADBE Text Scale 3D"); }
function glyphHeight(layer, source, comp, progress, index = 1, total = 11) {
  const amount = evaluate(selector(layer), source, comp, progress, 1.25, index, total);
  const scale = evaluate(characterScale(layer), source, comp, progress);
  return 100 + (scale[1] - 100) * amount / 100;
}
// Frozen V1 expression fixtures: migration must recognize the released templates, not just their comment.
function legacyTemplates(roleName) {
  const read = name => `parent.effect(${JSON.stringify(`Moti.on Pulse · ${name}`)})(1)`;
  const prefix = "// MOTION_VERTICAL_PULSE_V1\n";
  const duration = read("Cycle (frames)"), peak = read("Vertical scale (%)"), tears = read("Tears (%)"), glow = read("Glow (%)"), seed = read("Variation"), accent = read("Glow color");
  const pulse = `var cycle=Math.max(12,Math.min(240,${duration}))*thisComp.frameDuration;\n` +
    "var elapsed=time-1.25;var p=0,burst=0;\nif(elapsed>=0){var u=(elapsed/cycle)%1;\n" +
    "function smooth(v){v=Math.max(0,Math.min(1,v));return v*v*(3-2*v);}\n" +
    "if(u<.16){p=smooth(u/.16);burst=Math.sin(Math.PI*u/.16);}" +
    "else if(u<.45)p=1;else if(u<.70){p=1-smooth((u-.45)/.25);burst=Math.sin(Math.PI*(u-.45)/.25);}" +
    "else if(u<.82)p=-.08*Math.sin((u-.70)/.12*Math.PI);}\n";
  const center = prefix + "var r=parent.sourceRectAtTime(time,false);[r.left+r.width/2,r.top+r.height/2];";
  const position = roleName === "edge" ? prefix + pulse + `var d=Math.max(0,Math.min(100,${tears}));var s=${seed};var r=parent.sourceRectAtTime(time,false);` +
    "[r.left+r.width/2+Math.sin(elapsed*9+s*.013)*d*.08*Math.max(0,p),r.top+r.height/2+Math.cos(elapsed*6+s*.021)*d*.035*Math.max(0,p)];" : center;
  const scale = prefix + pulse + `var peak=Math.max(120,Math.min(300,${peak}));[100,` +
    (roleName === "core" ? "100+(peak-100)*p" : roleName === "glow" ? "102+(peak-102)*Math.max(0,p)*1.02" : "104+(peak-104)*Math.max(0,p)*1.04") + "];";
  const opacity = prefix + pulse + (roleName === "core" ? "parent.transform.opacity;" : roleName === "glow" ?
    `parent.transform.opacity*Math.min(1,.25+${glow}/100*.95+.2*Math.max(0,p));` :
    `parent.transform.opacity*Math.min(1,${tears}/100*(.25+.9*Math.max(0,p))); `);
  const color = roleName === "core" ? "[1,1,1]" : roleName === "glow" ? "[c[0],c[1],c[2]]" : "[c[0]*.95,c[1]*.18,c[2]*.08]";
  const sourceText = prefix + "var src=parent.text.sourceText;var style=src.getStyleAt(0,time).setText(src);" +
    `var c=${accent};style.setApplyFill(true).setFillColor(${color}).setApplyStroke(false);`;
  return [sourceText, center, position, scale, opacity, roleName === "glow" ?
    prefix + pulse + `(4+${glow}*.4)*(.5+.5*Math.max(0,p));` :
    prefix + pulse + tears + (roleName === "core" ? "*.7*burst;" : "*.55*(.35*Math.max(0,p)+.65*burst);"),
  prefix + ` (time-1.25)*210+${seed}*13;`.trimStart()];
}
// Frozen released V2 templates are independent of the current host builder.
function legacyV2Templates(roleName) {
  const V2_EXPR = "// MOTION_VERTICAL_PULSE_V2\n";
  const CONTROL = {
    durationFrames: "Moti.on Pulse · Cycle (frames)", peakScalePercent: "Moti.on Pulse · Vertical scale (%)",
    distortion: "Moti.on Pulse · Tears (%)", glow: "Moti.on Pulse · Glow (%)",
    seed: "Moti.on Pulse · Variation", accentColor: "Moti.on Pulse · Glow color"
  };
  const effectRead = name => "parent.effect(" + JSON.stringify(name) + ")(1)";
  const _MotionJson = JSON;
  function legacyV2PulseExpression(meta) {
    return "var cycle=Math.max(12,Math.min(240," + effectRead(CONTROL.durationFrames) + "))*thisComp.frameDuration;\n" +
      "var elapsed=time-" + String(meta.start) + ";var p=0,burst=0;\n" +
      "if(elapsed>=0){var u=(elapsed/cycle)%1;\n" +
      "function smooth(v){v=Math.max(0,Math.min(1,v));return v*v*(3-2*v);}\n" +
      "if(u<.12){var attack=u/.12;p=1-Math.pow(1-attack,3);burst=Math.sin(Math.PI*attack);}" +
      "else if(u<.43)p=1;else if(u<.66){var release=(u-.43)/.23;p=1-smooth(release);burst=Math.sin(Math.PI*release);}" +
      "else if(u<.76)p=-.06*Math.sin((u-.66)/.10*Math.PI);}\n";
  }
  function legacyV2ExpressionTemplates(role, meta) {
    const center = V2_EXPR + "var r=parent.sourceRectAtTime(time,false);[r.left+r.width/2,r.top+r.height/2];";
    const position = V2_EXPR + legacyV2PulseExpression(meta) +
      "var d=Math.max(0,Math.min(100," + effectRead(CONTROL.distortion) + "));" +
      "var s=" + effectRead(CONTROL.seed) + ";var r=parent.sourceRectAtTime(time,false);" +
      "var tick=Math.floor(elapsed/thisComp.frameDuration);" +
      "[r.left+r.width/2+Math.sin(tick*2.17+s*.73)*d*" + (role === "core" ? ".005" : role === "glow" ? ".015" : ".03") +
      "*burst,r.top+r.height/2+Math.cos(tick*1.79+s*.41)*d*" + (role === "core" ? ".03" : role === "glow" ? ".05" : ".08") + "*burst];";
    const scale = V2_EXPR + legacyV2PulseExpression(meta) +
      "var peak=Math.max(120,Math.min(450," + effectRead(CONTROL.peakScalePercent) + "));" +
      "[76,100+(peak-100)*p" + (role === "core" ? "" : role === "glow" ? "+40*burst" : "+22*burst") + "];";
    const opacity = V2_EXPR + legacyV2PulseExpression(meta) +
      (role === "core" ? "parent.transform.opacity;" : role === "glow" ?
        "parent.transform.opacity*Math.max(0,Math.min(100," + effectRead(CONTROL.glow) + "))/100*Math.min(1,.85*Math.max(0,p)+1.6*burst);" :
        "parent.transform.opacity*Math.max(0,Math.min(100," + effectRead(CONTROL.distortion) + "))/100*Math.min(1,burst*1.45);");
    const color = role === "core" ? "[1,1,1]" : role === "glow" ?
      "[c[0],Math.min(1,c[1]*(1.17+.06*burst*Math.sin(elapsed*8+s*.41))),c[2]*.3]" :
      "[c[0],c[1]*(.06+.2*burst*(.5+.5*Math.sin(elapsed*6+s*.73))),c[2]*.03]";
    const sourceText = V2_EXPR + (role === "core" ? "" : legacyV2PulseExpression(meta) + "var s=" + effectRead(CONTROL.seed) + ";") +
      "var src=parent.text.sourceText;var style=src.getStyleAt(0,time).setText(src);" +
      "var c=" + effectRead(CONTROL.accentColor) + ";style.setApplyFill(true).setFillColor(" + color + ").setApplyStroke(false);";
    const templates = [sourceText, center, position, scale, opacity];
    if (role === "glow") {
      templates.push(V2_EXPR + legacyV2PulseExpression(meta) + "1.2+.6*burst;");
      templates.push(V2_EXPR + legacyV2PulseExpression(meta) + "35+25*burst;");
      templates.push(V2_EXPR + legacyV2PulseExpression(meta) + "var g=Math.max(0,Math.min(100," + effectRead(CONTROL.glow) + "))/100;" +
        "var s=" + effectRead(CONTROL.seed) + ";g*(1.8*Math.max(0,p)+4.5*burst)*(1+.08*Math.sin(elapsed*8+s*.41));");
    }
    else {
      templates.push(V2_EXPR + legacyV2PulseExpression(meta) + "Math.max(0,Math.min(100," + effectRead(CONTROL.distortion) + "))*" + (role === "core" ? "1.2" : "1.85") + "*burst;");
      templates.push(V2_EXPR + "(time-" + String(meta.start) + ")*1080+" + effectRead(CONTROL.seed) + "*137;");
    }
    return templates;
  }
  return legacyV2ExpressionTemplates(roleName, { start: 1.25 });
}
function legacyRig(comp, version = 1) {
  if (version === 1) role(comp, "glow").moveBefore(role(comp, "edge"));
  for (const layer of comp.layers) {
    layer.comment = layer.comment.replaceAll("MOTION_VERTICAL_PULSE_V3", `MOTION_VERTICAL_PULSE_V${version}`).replace('"version":3', `"version":${version}`);
    const meta = JSON.parse(layer.comment.split(`[MOTION_VERTICAL_PULSE_V${version}]`)[1].split(`[/MOTION_VERTICAL_PULSE_V${version}]`)[0]);
    if (meta.role === "source") {
      for (const name of ["Direction", "Wave spread (%)"]) {
        const added = layer.property("ADBE Effect Parade").property(`Moti.on Pulse · ${name}`);
        if (added) added.remove();
      }
      if (version === 1) for (const [key, label] of Object.entries({ peakScalePercent: "Vertical scale (%)", distortion: "Tears (%)", glow: "Glow (%)", accentColor: "Glow color" }))
        control(layer, `Moti.on Pulse · ${label}`).setValue(key === "accentColor" ? [...legacyDefaults[key], 1] : legacyDefaults[key]);
      continue;
    }
    const animators = layer.property("ADBE Text Properties").property("ADBE Text Animators");
    while (animators.numProperties) animators.property(animators.numProperties).remove();
    layer.property("ADBE Text Properties").property("ADBE Text More Options").property("ADBE Text Anchor Point Align").setValue([0, 0]);
    if (meta.role === "glow" && version === 1) {
      const parade = layer.property("ADBE Effect Parade");
      while (parade.numProperties > 1) parade.property(parade.numProperties).remove();
    }
    const transform = layer.property("ADBE Transform Group");
    const effect = layer.property("ADBE Effect Parade").property(1);
    const properties = [layer.property("ADBE Text Properties").property("ADBE Text Document"),
      ...["ADBE Anchor Point", "ADBE Position", "ADBE Scale", "ADBE Opacity"].map(name => transform.property(name)),
      effect.property(meta.role === "glow" ? "ADBE Gaussian Blur 2-0001" : "ADBE Turbulent Displace-0002")];
    if (meta.role === "glow" && version === 2) {
      const glow = layer.property("ADBE Effect Parade").property(2);
      properties.push(glow.property("ADBE Glo2-0003"), glow.property("ADBE Glo2-0004"));
    }
    if (meta.role !== "glow") properties.push(effect.property("ADBE Turbulent Displace-0006"));
    const templates = version === 1 ? legacyTemplates(meta.role) : legacyV2Templates(meta.role);
    for (let i = 0; i < properties.length; i += 1) properties[i].expression = templates[i];
    if (effect?.matchName === "ADBE Turbulent Displace") {
      effect.property("ADBE Turbulent Displace-0001").setValue(version === 1 ? 1 : 9);
      effect.property("ADBE Turbulent Displace-0003").setValue(version === 1 ? (role(comp, "core") === layer ? 22 : 18) : (role(comp, "core") === layer ? 10 : 6));
      effect.property("ADBE Turbulent Displace-0010").setValue(version === 1 ? 7 : 1);
    }
  }
}
function snapshot(comp) {
  const state = item => item instanceof Group ? {
    name: item.name, matchName: item.matchName, items: item.items.map(state)
  } : { name: item.name, matchName: item.matchName, value: item.value, expression: item.expression,
    enabled: item.expressionEnabled, numKeys: item.numKeys };
  return comp.layers.map(layer => ({ id: layer.id, comment: layer.comment, enabled: layer.enabled, selected: layer.selected,
    properties: Object.entries(layer.groups).map(([name, group]) => ({ name, items: group.items.map(state) })) }));
}

test("pulse validates input and text selection before mutation", async () => {
  const { comp, source, handler } = await fixture();
  assert.equal(handler.preflight(defaults), null);
  assert.equal(handler.preflight({ ...defaults, peakScalePercent: 450 }), null);
  for (const patch of [{ durationFrames: 11 }, { seed: 1.5 }, { peakScalePercent: 451 }, { accentColor: [1, 2, 0] }])
    assert.equal(handler.preflight({ ...defaults, ...patch }).code, ERROR.INVALID_PRESET);
  source.locked = true;
  assert.equal(handler.preflight(defaults).code, ERROR.INVALID_SELECTION_TYPE);
  source.locked = false; source.selected = false;
  assert.equal(handler.preflight(defaults).code, ERROR.NO_SELECTION);
  assert.equal(comp.numLayers, 1);
});

test("pulse creates three linked echoes, keeps source content and selection, and follows cycle timing", async () => {
  const { comp, source, handler, run } = await fixture();
  const original = { comment: source.comment, text: source.property("ADBE Text Properties").property("ADBE Text Document").value, time: comp.time };
  assert.equal(handler.preflight(defaults), null);
  const result = run({});
  assert.equal(result.data.createdCount, 3);
  assert.equal(comp.numLayers, 4);
  assert.equal(source.enabled, false);
  assert.deepEqual(source.property("ADBE Text Properties").property("ADBE Text Document").value, original.text);
  assert.equal(comp.time, original.time);
  assert.deepEqual(comp.selectedLayers, [source]);
  for (const name of ["core", "glow", "edge"]) assert.equal(role(comp, name).parent, source);
  assert.deepEqual(comp.layers, [role(comp, "core"), role(comp, "edge"), role(comp, "glow"), source]);
  assert.match(role(comp, "glow").property("ADBE Effect Parade").property(1).matchName, /Gaussian Blur/);
  assert.equal(role(comp, "glow").property("ADBE Effect Parade").property(2).matchName, "ADBE Glo2");
  assert.match(role(comp, "edge").property("ADBE Effect Parade").property(1).matchName, /Turbulent Displace/);
  const expression = role(comp, "core").property("ADBE Transform Group").property("ADBE Scale").expression;
  const parent = { effect(name) { return () => control(source, name).value; } };
  const evaluate = seconds => vm.runInNewContext(expression, { parent, thisComp: { frameDuration: comp.frameDuration }, time: original.time + seconds, Math });
  const cycle = defaults.durationFrames * comp.frameDuration;
  assert.deepEqual(Array.from(evaluate(0)), [76, 100]);
  assert.deepEqual(Array.from(evaluate(cycle * 0.4)), [76, 100]);
  assert.equal(glyphHeight(role(comp, "core"), source, comp, 0.4), 360);
  assert.deepEqual(Array.from(evaluate(cycle * 0.9)), [76, 100]);
  assert.ok(source.comment.startsWith(original.comment));
});

test("reapply updates controls without duplicates; remove restores only managed work", async () => {
  const { comp, source, handler, run } = await fixture();
  const comment = source.comment;
  run({});
  const echoes = [role(comp, "core"), role(comp, "glow"), role(comp, "edge")];
  assert.equal(handler.preflight(defaults), null);
  assert.equal(run({}).changed, false);
  const adjusted = run({ peakScalePercent: 250, glow: 75 });
  assert.equal(adjusted.data.updatedCount, 1);
  assert.equal(comp.numLayers, 4);
  assert.equal(control(source, "Moti.on Pulse · Vertical scale (%)").value, 250);
  assert.equal(control(source, "Moti.on Pulse · Glow (%)").value, 75);
  assert.deepEqual([role(comp, "core"), role(comp, "glow"), role(comp, "edge")], echoes);
  const remove = { action: "remove" };
  assert.equal(handler.preflight(remove), null);
  assert.equal(handler.run(remove).data.removedCount, 3);
  assert.deepEqual(comp.layers, [source]);
  assert.equal(source.enabled, true);
  assert.equal(source.comment, comment);
  assert.equal(source.property("ADBE Effect Parade").numProperties, 0);
});

test("modified echoes are never removed, and creation failure rolls back the source and copies", async () => {
  const { comp, source, handler, run } = await fixture();
  const comment = source.comment;
  comp.failBlur = true;
  assert.throws(() => run({}), /injected blur failure/);
  assert.equal(comp.numLayers, 1);
  assert.equal(source.comment, comment);
  assert.equal(source.enabled, true);
  assert.equal(source.property("ADBE Effect Parade").numProperties, 0);
  run({});
  role(comp, "edge").property("ADBE Effect Parade").addProperty("ADBE Gaussian Blur 2");
  assert.equal(handler.preflight({ action: "remove" }).code, ERROR.TRACK_CONFLICT);
  assert.equal(comp.numLayers, 4);
});

test("premium pulse keeps layer width steady, holds a clean peak and smooths transition light", async () => {
  const { comp, source, run } = await fixture();
  run({ animationMode: "uniform" });
  const core = role(comp, "core"), glow = role(comp, "glow"), edge = role(comp, "edge");
  const strength = layer => layer.property("ADBE Effect Parade").property(1).property("ADBE Turbulent Displace-0002");
  const opacity = layer => layer.property("ADBE Transform Group").property("ADBE Opacity");
  for (const progress of [-0.1, 0, 0.04, 0.14, 0.24, 0.4, 0.60, 0.70, 0.8, 0.9, 1]) {
    for (const layer of [core, glow, edge]) assert.deepEqual(Array.from(evaluate(layer.property("ADBE Transform Group").property("ADBE Scale"), source, comp, progress)), [76, 100]);
  }
  assert.ok(Math.abs(glyphHeight(core, source, comp, 0.14) - 230) < 1e-7, "quintic attack reaches half extension midway through its interval");
  for (const progress of [0.24, 0.4, 0.59]) {
    for (const layer of [core, glow, edge]) assert.ok(Math.abs(glyphHeight(layer, source, comp, progress) - 360) < 1e-7);
    assert.ok(Math.abs(evaluate(strength(core), source, comp, progress)) < 1e-7);
    assert.ok(Math.abs(evaluate(strength(edge), source, comp, progress)) < 1e-7);
    assert.ok(Math.abs(evaluate(opacity(glow), source, comp, progress) - 68) < 1e-7);
    assert.ok(Math.abs(evaluate(opacity(edge), source, comp, progress)) < 1e-7);
    assert.ok(Math.abs(evaluate(glow.property("ADBE Effect Parade").property(1).property("ADBE Gaussian Blur 2-0001"), source, comp, progress) - 1.2) < 1e-7);
  }
  for (const progress of [0.14, 0.70]) {
    assert.ok(evaluate(strength(core), source, comp, progress) > 95);
    assert.ok(evaluate(strength(edge), source, comp, progress) > 147);
    assert.ok(evaluate(opacity(glow), source, comp, progress) >= 79.9999);
    assert.ok(evaluate(opacity(edge), source, comp, progress) >= 79.9999);
    assert.ok(glyphHeight(glow, source, comp, progress) > glyphHeight(edge, source, comp, progress), "yellow rim extends outside red rim");
  }
  for (const progress of [-0.1, 0, 0.03, 0.8, 0.9, 1]) assert.equal(glyphHeight(core, source, comp, progress), 100);
  for (const layer of [core, edge]) assert.equal(layer.property("ADBE Effect Parade").property(1).property("ADBE Turbulent Displace-0001").value, 9);
  assert.doesNotMatch(core.property("ADBE Text Properties").property("ADBE Text Document").expression, /setFont/);
  assert.doesNotMatch(core.property("ADBE Transform Group").property("ADBE Position").expression, /floor|tick/);
});

test("reapply migrates V1 in place with unchanged arguments and retains editability, timing, and selection", async () => {
  const { comp, source, handler, run } = await fixture();
  run({}); legacyRig(comp);
  const echoes = [role(comp, "core"), role(comp, "glow"), role(comp, "edge")];
  source.selected = false; echoes[2].selected = true;
  const initialComment = source.comment, start = comp.time;
  assert.equal(handler.preflight(legacyDefaults), null);
  const result = run(legacyDefaults);
  assert.equal(result.changed, true);
  assert.equal(result.data.createdCount, 0);
  assert.equal(result.data.updatedCount, 1);
  assert.equal(comp.numLayers, 4);
  assert.deepEqual([role(comp, "core"), role(comp, "glow"), role(comp, "edge")], echoes);
  assert.deepEqual(comp.layers, [echoes[0], echoes[2], echoes[1], source]);
  assert.deepEqual(comp.selectedLayers, [echoes[2]]);
  assert.equal(comp.time, start);
  for (const layer of [source, ...echoes]) {
    assert.match(layer.comment, /\[MOTION_VERTICAL_PULSE_V3\]/);
    assert.match(layer.comment, /"version":3/);
    assert.doesNotMatch(layer.comment, /MOTION_VERTICAL_PULSE_V1/);
  }
  assert.ok(source.comment.startsWith("User note: Original"));
  assert.ok(initialComment.includes('"start":1.25'));
  assert.ok(source.comment.includes('"start":1.25'));
  const scale = echoes[0].property("ADBE Transform Group").property("ADBE Scale");
  assert.match(scale.expression, /^\/\/ MOTION_VERTICAL_PULSE_V3\n/);
  assert.deepEqual(Array.from(evaluate(scale, source, comp, 0.4, start)), [76, 100]);
  assert.equal(glyphHeight(echoes[0], source, comp, 0.4), 235);
  assert.equal(run(legacyDefaults).changed, false);
  assert.equal(handler.run({ action: "remove" }).data.removedCount, 3);
  assert.equal(source.comment, "User note: Original");
});

test("V1 removal stays compatible and migration failure restores every managed expression, value, and comment", async () => {
  const first = await fixture();
  first.run({}); legacyRig(first.comp);
  assert.equal(first.handler.preflight({ action: "remove" }), null);
  assert.equal(first.handler.run({ action: "remove" }).data.removedCount, 3);
  assert.equal(first.source.comment, "User note: Original");
  assert.equal(first.source.enabled, true);
  const { comp, source, handler, run } = await fixture();
  run({}); legacyRig(comp);
  const original = snapshot(comp);
  comp.failBlur = true;
  assert.throws(() => run({ peakScalePercent: 420, distortion: 100, glow: 100 }), /injected blur failure/);
  assert.deepEqual(snapshot(comp), original);
  assert.equal(comp.time, 1.25);
  assert.equal(comp.numLayers, 4);
  assert.equal(control(source, "Moti.on Pulse · Vertical scale (%)").value, 235);
  assert.equal(handler.preflight(legacyDefaults), null);
  assert.equal(run(legacyDefaults).changed, true);
});

test("migration refuses user expressions and mismatched rig versions before mutation", async () => {
  const { comp, handler, run } = await fixture();
  run({}); legacyRig(comp);
  const core = role(comp, "core"), position = core.property("ADBE Transform Group").property("ADBE Position");
  const expression = position.expression;
  position.expression = "[30,40];";
  const original = snapshot(comp);
  assert.equal(handler.preflight(defaults).code, ERROR.TRACK_CONFLICT);
  assert.deepEqual(snapshot(comp), original);
  position.expression = expression + "\n[30,40];";
  assert.equal(handler.preflight(defaults).code, ERROR.TRACK_CONFLICT, "a retained ownership header cannot authorize a user expression");
  position.expression = expression;
  core.comment = core.comment.replaceAll("MOTION_VERTICAL_PULSE_V1", "MOTION_VERTICAL_PULSE_V2").replace('"version":1', '"version":2');
  assert.equal(handler.preflight(defaults).code, ERROR.TRACK_CONFLICT);
});

test("V3 inspection also refuses altered bodies with a retained expression header", async () => {
  const { comp, handler, run } = await fixture();
  run({});
  const scale = role(comp, "core").property("ADBE Transform Group").property("ADBE Scale");
  scale.expression += "\n[100,180];";
  assert.equal(handler.preflight(defaults).code, ERROR.TRACK_CONFLICT);
  assert.equal(handler.preflight({ action: "remove" }).code, ERROR.TRACK_CONFLICT);
  assert.equal(comp.numLayers, 4);
});

test("migration refuses animated static parameters so rollback never overwrites keyframes", async () => {
  const { comp, handler, run } = await fixture();
  run({}); legacyRig(comp);
  const size = role(comp, "core").property("ADBE Effect Parade").property(1).property("ADBE Turbulent Displace-0003");
  size.numKeys = 1;
  assert.equal(handler.preflight(legacyDefaults).code, ERROR.TRACK_CONFLICT);
  assert.equal(comp.numLayers, 4);
});

test("native glow and chromatic rims animate deterministically and obey the glow control", async () => {
  const { comp, source, run } = await fixture();
  run({ animationMode: "uniform" });
  const glow = role(comp, "glow"), edge = role(comp, "edge");
  const effect = glow.property("ADBE Effect Parade").property(2);
  const intensity = effect.property("ADBE Glo2-0004"), radius = effect.property("ADBE Glo2-0003");
  const opacity = glow.property("ADBE Transform Group").property("ADBE Opacity");
  const color = layer => layer.property("ADBE Text Properties").property("ADBE Text Document");
  const attack = evaluate(intensity, source, comp, 0.14), peak = evaluate(intensity, source, comp, 0.4);
  assert.ok(attack > 4 && peak > 1.3 && peak < 1.6, "strong attack light and visible plateau halo");
  assert.ok(evaluate(radius, source, comp, 0.14) > 59.9999);
  assert.ok(evaluate(radius, source, comp, 0.4) < 35.0001);
  for (const layer of [glow, edge]) {
    const first = Array.from(evaluate(color(layer), source, comp, 0.135).fillColor);
    const later = Array.from(evaluate(color(layer), source, comp, 0.145).fillColor);
    assert.notDeepEqual(first, later, "chromatic rim changes through the transition");
    assert.deepEqual(Array.from(evaluate(color(layer), source, comp, 0.135).fillColor), first);
    assert.ok(first.every(channel => channel >= 0 && channel <= 1));
  }
  assert.ok(evaluate(color(glow), source, comp, 0.14).fillColor[1] > 0.75, "yellow stays luminous and warm");
  assert.ok(evaluate(color(edge), source, comp, 0.14).fillColor[1] < 0.2, "inner rim stays red-orange");
  control(source, "Moti.on Pulse · Glow (%)").setValue(0);
  for (const progress of [-0.1, 0.06, 0.3, 0.545, 0.9]) {
    assert.equal(Math.abs(evaluate(intensity, source, comp, progress)), 0);
    assert.equal(Math.abs(evaluate(opacity, source, comp, progress)), 0);
  }
});

test("missing Glow refuses creation or migration before mutation while legacy removal remains available", async () => {
  const first = await fixture();
  first.comp.unavailableEffects = ["ADBE Glo2"];
  const original = snapshot(first.comp);
  assert.equal(first.handler.preflight(defaults).code, ERROR.CAPABILITY_UNAVAILABLE);
  assert.deepEqual(snapshot(first.comp), original);
  const { comp, source, handler, run } = await fixture();
  run({}); legacyRig(comp);
  comp.unavailableEffects = ["ADBE Glo2"];
  const legacy = snapshot(comp);
  assert.equal(handler.preflight(legacyDefaults).code, ERROR.CAPABILITY_UNAVAILABLE);
  assert.deepEqual(snapshot(comp), legacy);
  assert.equal(handler.preflight({ action: "remove" }), null);
  handler.run({ action: "remove" });
  assert.deepEqual(comp.layers, [source]);
});

test("Glow parameter absence and expression failure roll migration back after native reference invalidation", async () => {
  for (const failure of ["ADBE Glo2-0003", "ADBE Glo2-0004", "ADBE Glo2-0007", "expression"]) {
    const { comp, source, handler, run } = await fixture();
    comp.invalidateEffectReferences = true;
    run({}); legacyRig(comp);
    const original = snapshot(comp), time = comp.time;
    if (failure === "expression") comp.failGlow = true;
    else comp.missingGlowParameter = failure;
    assert.throws(() => run({ peakScalePercent: 420, glow: 100 }), error => failure === "expression" ?
      /injected native Glow failure/.test(error.message) : error.motionCode === ERROR.CAPABILITY_UNAVAILABLE);
    assert.deepEqual(snapshot(comp), original);
    assert.equal(comp.time, time);
    assert.equal(comp.numLayers, 4);
    assert.equal(role(comp, "glow").property("ADBE Effect Parade").numProperties, 1);
    comp.missingGlowParameter = null;
    assert.equal(handler.preflight(legacyDefaults), null);
    assert.equal(run(legacyDefaults).data.updatedCount, 1);
    assert.equal(role(comp, "glow").property("ADBE Effect Parade").numProperties, 2);
    assert.equal(control(source, "Moti.on Pulse · Glow (%)").value, 60);
  }
});

test("disabled managed expressions are user edits and are preserved for both rig versions", async () => {
  for (const version of [1, 2, 3]) {
    const { comp, handler, run } = await fixture();
    run({});
    if (version < 3) legacyRig(comp, version);
    const position = role(comp, "core").property("ADBE Transform Group").property("ADBE Position");
    position.expressionEnabled = false;
    const original = snapshot(comp);
    assert.equal(handler.preflight(version === 1 ? legacyDefaults : defaults).code, ERROR.TRACK_CONFLICT);
    assert.equal(handler.preflight({ action: "remove" }).code, ERROR.TRACK_CONFLICT);
    assert.deepEqual(snapshot(comp), original);
  }
});

test("migration restores the edge's original neighbor on failure and leaves unrelated layers untouched", async () => {
  const { comp, handler, run } = await fixture();
  run({}); legacyRig(comp);
  const unrelated = new TextLayer(comp, "Unrelated"); unrelated.selected = false;
  comp.layers.splice(role(comp, "edge").index - 1, 0, unrelated);
  const original = snapshot(comp);
  comp.failGlow = true;
  assert.throws(() => run({}), /injected native Glow failure/);
  assert.deepEqual(snapshot(comp), original);
  assert.equal(handler.preflight(legacyDefaults), null);
  run(legacyDefaults);
  const unrelatedState = snapshot(comp).find(layer => layer.id === unrelated.id);
  assert.deepEqual(unrelatedState, original.find(layer => layer.id === unrelated.id));
  const order = comp.layers.map(layer => layer.id);
  assert.equal(run(legacyDefaults).changed, false);
  assert.deepEqual(comp.layers.map(layer => layer.id), order);
});

