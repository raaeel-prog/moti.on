/**
 * Motor de câmera (ADR 0007) — shots vivos sobre o Parallax v3 e em rig próprio.
 *
 * As expressões geradas rodam aqui num ambiente que imita o After Effects:
 * `effect()` devolve Property (não número), marcadores têm parâmetros e os eixos
 * da câmera saem de Orientation e Rotate Z do controle com a matriz medida no AE
 * (Rx·Ry·Rz, docs/research/after-effects-3d-transform.md). O
 * resultado é comparado com o núcleo de packages/contracts, que é a fonte única
 * da matemática. Isto não substitui o After Effects real (scripts/verify-camera-engine.jsx).
 */
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";

import { loadHostModules } from "./host-harness.mjs";
import { camPose } from "../../../packages/contracts/dist/camera-kernel.js";

const clone = (v) => (Array.isArray(v) ? [...v] : v);
const len = (v) => Math.hypot(...v);

class FakeProperty {
  constructor(layer, matchName, value, name = matchName) {
    Object.assign(this, { layer, matchName, name, value: clone(value), keys: [], expression: "", expressionEnabled: false,
      expressionError: "", canSetExpression: true, propertyIndex: 1, canVaryOverTime: true });
  }
  get numKeys() { return this.keys.length; }
  setValue(v) { this.value = clone(v); }
  setValueAtTime(t, v) { this.keys = this.keys.filter((k) => Math.abs(k.time - t) > 1e-9); this.keys.push({ time: t, value: clone(v) }); this.keys.sort((a, b) => a.time - b.time); }
  setValuesAtTimes(times, values) { times.forEach((t, i) => this.setValueAtTime(t, values[i])); }
  keyTime(i) { return this.keys[i - 1].time; }
  keyValue(i) { return this.keys[i - 1].value; }
  removeKey(i) { this.keys.splice(i - 1, 1); }
  staticAt(t) {
    if (!this.keys.length) return clone(this.value);
    if (t <= this.keys[0].time) return clone(this.keys[0].value);
    for (let i = 1; i < this.keys.length; i++) {
      const a = this.keys[i - 1], b = this.keys[i];
      if (t <= b.time) {
        const u = (t - a.time) / (b.time - a.time);
        return Array.isArray(a.value) ? a.value.map((x, j) => x + (b.value[j] - x) * u) : a.value + (b.value - a.value) * u;
      }
    }
    return clone(this.keys[this.keys.length - 1].value);
  }
  valueAtTime(t, preExpression) {
    if (!preExpression && this.expression && this.expressionEnabled) {
      try { const v = evaluate(this, t); this.expressionError = ""; return v; }
      catch (error) { this.expressionError = String(error.message); return this.staticAt(t); }
    }
    return this.staticAt(t);
  }
}

class FakeGroup {
  constructor(matchName, props) { this.matchName = matchName; this.name = matchName; this.props = props; }
  get numProperties() { return this.props.length; }
  property(key) { return typeof key === "number" ? this.props[key - 1] ?? null : this.props.find((p) => p.matchName === key || p.name === key) ?? null; }
}

class FakeEffect {
  constructor(parade, matchName) {
    this.parade = parade; this.matchName = matchName; this.name = matchName;
    const initial = matchName === "ADBE Layer Control" ? 0 : 0;
    this.param = new FakeProperty(parade.layer, `${matchName}-0001`, initial);
  }
  property(i) { return i === 1 ? this.param : null; }
  get numProperties() { return 1; }
  remove() { this.parade.effects.splice(this.parade.effects.indexOf(this), 1); }
}

class FakeParade {
  constructor(layer) { this.layer = layer; this.effects = []; this.matchName = "ADBE Effect Parade"; }
  get numProperties() { return this.effects.length; }
  property(key) { return typeof key === "number" ? this.effects[key - 1] ?? null : this.effects.find((e) => e.name === key) ?? null; }
  canAddProperty() { return true; }
  addProperty(matchName) { const e = new FakeEffect(this, matchName); this.effects.push(e); return e; }
}

class FakeMarkerValue {
  constructor(comment) { this.comment = comment; this.duration = 0; this.params = {}; }
  getParameters() { return { ...this.params }; }
  setParameters(p) { this.params = { ...p }; }
}

class FakeMarkers {
  constructor() { this.keys = []; this.matchName = "ADBE Marker"; }
  get numKeys() { return this.keys.length; }
  keyTime(i) { return this.keys[i - 1].time; }
  keyValue(i) { return this.keys[i - 1].value; }
  setValueAtTime(t, value) { this.keys = this.keys.filter((k) => Math.abs(k.time - t) > 1e-9); this.keys.push({ time: t, value }); this.keys.sort((a, b) => a.time - b.time); }
  removeKey(i) { this.keys.splice(i - 1, 1); }
}

let nextId = 100;
class FakeLayer {
  constructor(comp, { name = "Camada", position = [540, 960, 0], threeD = true, size = [1080, 1920] } = {}) {
    Object.assign(this, { comp, name, id: nextId++, comment: "", parent: null, threeDLayer: threeD, guideLayer: false, locked: false,
      enabled: true, size, selected: false, motionBlur: false });
    this.transform = new FakeGroup("ADBE Transform Group", [
      new FakeProperty(this, "ADBE Anchor Point", [size[0] / 2, size[1] / 2, 0]), new FakeProperty(this, "ADBE Position", position),
      new FakeProperty(this, "ADBE Scale", [100, 100, 100]), new FakeProperty(this, "ADBE Orientation", [0, 0, 0]),
      new FakeProperty(this, "ADBE Rotate X", 0), new FakeProperty(this, "ADBE Rotate Y", 0), new FakeProperty(this, "ADBE Rotate Z", 0)]);
    this.parade = new FakeParade(this);
    this.markers = new FakeMarkers();
  }
  get index() { return this.comp.list.indexOf(this) + 1; }
  property(mn) {
    if (mn === "ADBE Transform Group") return this.transform;
    if (mn === "ADBE Effect Parade") return this.parade;
    if (mn === "ADBE Marker") return this.markers;
    return null;
  }
  prop(mn) { return this.transform.property(mn); }
  sourceRectAtTime() { return { left: 0, top: 0, width: this.size[0], height: this.size[1] }; }
  remove() { this.comp.list.splice(this.comp.list.indexOf(this), 1); }
}

class FakeCameraLayer extends FakeLayer {
  constructor(comp, opts) {
    super(comp, { ...opts, threeD: true });
    this.autoOrient = 2;
    this.options = new FakeGroup("ADBE Camera Options Group", [
      new FakeProperty(this, "ADBE Camera Zoom", 3000), new FakeProperty(this, "ADBE Camera Focus Distance", 3000),
      new FakeProperty(this, "ADBE Camera Depth of Field", 0), new FakeProperty(this, "ADBE Camera Aperture", 25.3),
      new FakeProperty(this, "ADBE Camera Blur Level", 100)]);
  }
  property(mn) { return mn === "ADBE Camera Options Group" ? this.options : super.property(mn); }
}

class FakeCompItem {
  constructor() {
    Object.assign(this, { id: 77, list: [], width: 1080, height: 1920, duration: 10, frameDuration: 1 / 25, time: 0,
      motionBlur: false, pixelAspect: 1, selectedLayers: [] });
    this.layers = {
      addNull: () => { const n = new FakeLayer(this, { name: "Null", threeD: false, size: [100, 100] }); this.list.unshift(n); return n; },
      addCamera: (name, center) => { const c = new FakeCameraLayer(this, { name, position: [center[0], center[1], -2666.67] }); this.list.unshift(c); return c; }
    };
  }
  get numLayers() { return this.list.length; }
  layer(i) { return this.list[i - 1] ?? null; }
}

/** Expression API of a layer at time t, as an expression sees it. */
function api(layer, t) {
  return {
    index: layer.index,
    effect(name) {
      const e = layer.parade.property(name);
      if (!e) throw new Error(`Effect not found: ${name}`);
      return () => {
        const v = e.param.valueAtTime(t, false);
        if (e.matchName === "ADBE Layer Control") {
          if (!v) throw new Error("Layer control is None");
          return api(layer.comp.layer(v), t);
        }
        return { value: v, valueOf: () => v };
      };
    },
    marker: { numKeys: layer.markers.numKeys, key: (i) => ({ time: layer.markers.keyTime(i), duration: layer.markers.keyValue(i).duration, parameters: layer.markers.keyValue(i).getParameters() }) },
    toWorld: (p, ti = t) => worldOf(layer, p, ti),
    anchorPoint: { valueAtTime: (ti) => layer.prop("ADBE Anchor Point").staticAt(ti) }
  };
}

const mul = (a, b) => a.map((row) => [0, 1, 2].map((j) => row[0] * b[0][j] + row[1] * b[1][j] + row[2] * b[2][j]));
const rx = (d) => { const t = d * Math.PI / 180; return [[1, 0, 0], [0, Math.cos(t), -Math.sin(t)], [0, Math.sin(t), Math.cos(t)]]; };
const ry = (d) => { const t = d * Math.PI / 180; return [[Math.cos(t), 0, Math.sin(t)], [0, 1, 0], [-Math.sin(t), 0, Math.cos(t)]]; };
const rz = (d) => { const t = d * Math.PI / 180; return [[Math.cos(t), -Math.sin(t), 0], [Math.sin(t), Math.cos(t), 0], [0, 0, 1]]; };
/** Camera axes (right, down, forward) from the controller's evaluated Orientation
 * and Rotate Z, composed as After Effects does: Rx·Ry·Rz(orientation)·Rz(rotation). */
function basisOf(camera, t) {
  const o = camera.parent.prop("ADBE Orientation").valueAtTime(t, false), roll = camera.parent.prop("ADBE Rotate Z").valueAtTime(t, false);
  const m = mul(mul(mul(rx(o[0]), ry(o[1])), rz(o[2])), rz(roll));
  return [0, 1, 2].map((j) => [m[0][j], m[1][j], m[2][j]]);
}
const forwardOf = (camera, t) => basisOf(camera, t)[2];
function worldOf(layer, p, t) {
  if (layer instanceof FakeCameraLayer && layer.parent) {
    const m = layer.parent.prop("ADBE Position").valueAtTime(t, false), f = forwardOf(layer, t);
    const d = -layer.prop("ADBE Position").staticAt(t)[2];
    return m.map((x, i) => x - d * f[i]);
  }
  const pos = layer.prop("ADBE Position").staticAt(t), anchor = layer.prop("ADBE Anchor Point").staticAt(t);
  return [pos[0] + p[0] - anchor[0], pos[1] + p[1] - anchor[1], (pos[2] ?? 0) + (p[2] ?? 0) - (anchor[2] ?? 0)];
}
function evaluate(prop, t) {
  const layer = prop.layer;
  return vm.runInNewContext(prop.expression, {
    time: t, value: prop.staticAt(t), index: layer.index, thisLayer: api(layer, t), parent: layer.parent ? api(layer.parent, t) : null,
    thisComp: { frameDuration: layer.comp.frameDuration },
    normalize: (v) => { const n = len(v); return v.map((x) => x / n); },
    toWorld: (p, ti = t) => worldOf(layer, p, ti),
    toWorldVec: (v, ti = t) => (layer instanceof FakeCameraLayer ? forwardOf(layer, ti) : v)
  });
}

/** Parallax v3 scene: master null, camera child at [0,0,-3000] and three planes. */
function parallaxScene() {
  const comp = new FakeCompItem();
  const back = new FakeLayer(comp, { name: "Fundo", position: [540, 960, 0], size: [1188, 2112] });
  const mid = new FakeLayer(comp, { name: "Artista", position: [540, 1000, -1250] });
  const front = new FakeLayer(comp, { name: "Título", position: [540, 400, -2500] });
  const master = new FakeLayer(comp, { name: "Parallax", position: [540, 960, 0], size: [100, 100] });
  master.guideLayer = true;
  const camera = new FakeCameraLayer(comp, { name: "MOTION | PARALLAX | CAMERA", position: [0, 0, -3000] });
  camera.parent = master;
  camera.autoOrient = 1;
  comp.list.push(camera, master, front, mid, back);
  back.prop("ADBE Anchor Point").setValue([594, 1056, 0]);
  return { comp, master, camera, back, mid, front };
}
/** A 1080×1920 flyer on Parallax v3 (`area` depth): background, artist, title and logo,
 * each compensated by k = 1 + z/3000 so the layout reads unchanged through the camera. */
function flyerScene() {
  const comp = new FakeCompItem();
  const plane = (name, x, y, w, h, z) => {
    const k = 1 + z / 3000, layer = new FakeLayer(comp, { name, position: [540 + (x - 540) * k, 960 + (y - 960) * k, z], size: [w, h] });
    layer.prop("ADBE Scale").setValue([100 * k, 100 * k, 100]);
    return layer;
  };
  const back = plane("Fundo", 540, 960, 1188, 2112, 0), artist = plane("Artista", 540, 1080, 620, 980, -833.3);
  const title = plane("Título", 540, 420, 900, 260, -1666.7), logo = plane("Logo", 150, 150, 180, 180, -2500);
  const master = new FakeLayer(comp, { name: "Parallax", position: [540, 960, 0], size: [100, 100] });
  master.guideLayer = true;
  const camera = new FakeCameraLayer(comp, { name: "MOTION | PARALLAX | CAMERA", position: [0, 0, -3000] });
  camera.parent = master;
  comp.list.push(camera, master, logo, title, artist, back);
  return { comp, master, camera, back, artist, title, logo, members: [logo, title, artist, back] };
}
function writeParallaxMeta(scope, s) {
  const originals = (s.members ?? [s.front, s.mid, s.back]).map((l) => ({ id: l.id, position: l.prop("ADBE Position").value.slice(0, 2),
    scale: [100, 100, 100], anchor: l.prop("ADBE Anchor Point").value, rotation: 0 }));
  s.master.comment = scope.MotionRigMeta.write("", JSON.stringify({ schemaVersion: 3, rigType: "parallax.quick", rigId: "parallax-77-1",
    compId: 77, cameraId: s.camera.id, referenceTime: 0, frame: { cx: 540, cy: 960, zoom: 3000 }, originals, applied: originals,
    totalDepth: 2500, state: "committed" }));
}

async function fixture(build = parallaxScene) {
  const scene = build();
  const calls = [];
  const app = { project: { activeItem: scene.comp, expressionEngine: "javascript-1.0" },
    beginUndoGroup: (label) => calls.push(["begin", label]), endUndoGroup: () => calls.push(["end"]) };
  const scope = await loadHostModules([
    "generated/motion-contracts.jsx", "generated/motion-descriptors.jsx", "src/json.jsx", "generated/camera-library.jsx",
    "src/undo.jsx", "src/registry.jsx", "src/expression-templates.jsx", "src/rig-meta.jsx", "src/transform-math.jsx", "src/camera/camera-rig.jsx",
    "src/commands/camera-shots.jsx", "src/commands/camera-choreography.jsx", "src/dispatch.jsx"
  ], { app, CompItem: FakeCompItem, CameraLayer: FakeCameraLayer, MarkerValue: FakeMarkerValue, AutoOrientType: { NO_AUTO_ORIENT: 1 } });
  if (scene.master) writeParallaxMeta(scope, scene);
  const run = (command, args = {}, options = {}) => JSON.parse(scope.MotionAE.dispatch(JSON.stringify({
    protocolVersion: 1, requestId: `r-${calls.length}`, command, args, context: { host: "after-effects", hostVersion: "26.5", locale: "pt-BR" }, options })));
  return { ...scene, scope, calls, run };
}

function engineMeta(layer) {
  const tag = "[Moti.on.camera.v1]", at = layer.comment.indexOf(tag);
  return at < 0 ? null : JSON.parse(decodeURIComponent(layer.comment.slice(at + tag.length).split("\n")[0]));
}
function kernelPose(meta, t, gain = 1, live = {}) {
  const shots = meta.shots.map((s) => ({ ...s.shape, start: s.start, dur: s.dur, amount: (live[s.id] ?? s.amount) / 100 * gain }));
  return camPose(t, meta.frame, shots);
}
const near = (a, b, eps = 1e-6) => [].concat(a).forEach((x, i) => assert.ok(Math.abs(x - [].concat(b)[i]) <= eps, `${a} vs ${b}`));

test("Hero Push sobre o Parallax: controles, marcador e expressões que reproduzem o núcleo", async () => {
  const f = await fixture();
  f.comp.time = 1;
  const response = f.run("ae.camera.shot.apply", { presetId: "hero-push" });
  assert.equal(response.ok, true, JSON.stringify(response.error));
  assert.equal(response.data.mode, "parallax");
  assert.deepEqual(f.calls.filter((c) => c[0] === "begin").length, 1, "um único Undo");
  const meta = engineMeta(f.master);
  assert.equal(meta.shots.length, 1);
  assert.equal(meta.frame.near, 500, "plano mais próximo a 500 px da câmera");
  assert.deepEqual(meta.frame.margin, [54, 54, 96, 96], "sobra do fundo vira margem de cobertura");
  assert.equal(f.master.parade.numProperties, 10, "nove controles do rig e um do shot");
  assert.equal(f.master.markers.numKeys, 1);
  const marker = f.master.markers.keyValue(1);
  assert.equal(marker.duration, 4);
  assert.equal(marker.getParameters()["Moti.on.shot"], "s1");
  for (const prop of [f.master.prop("ADBE Position"), f.master.prop("ADBE Orientation"), f.master.prop("ADBE Rotate Z"), f.camera.options.property("ADBE Camera Zoom")]) {
    assert.ok(prop.expression.startsWith("// MOTION_EXPRESSION v1 | ae.camera.kernel\n// Moti.on camera v1:" + meta.rigId + "\n"));
    assert.equal(prop.expressionEnabled, true);
  }
  // Antes do shot o quadro é o original; no fim, o mesmo pose do núcleo.
  near(f.master.prop("ADBE Position").valueAtTime(0.5, false), [540, 960, 0]);
  near(f.camera.options.property("ADBE Camera Zoom").valueAtTime(0.5, false), [3000]);
  for (const t of [2, 3.5, 6]) {
    const pose = kernelPose(meta, t);
    near(f.master.prop("ADBE Position").valueAtTime(t, false), pose.m);
    near(f.camera.options.property("ADBE Camera Zoom").valueAtTime(t, false), [pose.zoom]);
    near(forwardOf(f.camera, t), pose.f);
  }
  assert.ok(f.master.prop("ADBE Position").valueAtTime(6, false)[2] > 100, "a câmera avançou");
});

test("pan, tilt e roll juntos: os eixos da câmera no AE batem com o núcleo", async () => {
  const f = await fixture();
  assert.equal(f.run("ae.camera.shot.apply", { presetId: "arc-hero", startSeconds: 0 }).ok, true);
  assert.equal(f.run("ae.camera.shot.adjust", { shotId: "s1", rot: [18, -9, 6], orb: [12, 7] }).ok, true);
  const meta = engineMeta(f.master);
  for (const t of [0.7, 1.9, 3.2, 8]) {
    const pose = kernelPose(meta, t), [r, d, fw] = basisOf(f.camera, t);
    near(r, pose.r, 1e-9); near(d, pose.d, 1e-9); near(fw, pose.f, 1e-9);
    near(worldOf(f.camera, [0, 0, 0], t), pose.c, 1e-6);
  }
});

test("controles vivos: intensidade do shot, intensidade geral e marcador arrastado", async () => {
  const f = await fixture();
  f.run("ae.camera.shot.apply", { presetId: "hero-push", startSeconds: 1 });
  const meta = engineMeta(f.master);
  const shotControl = f.master.parade.property(meta.shots[0].control), gain = f.master.parade.property(meta.controls.intensity);
  shotControl.param.setValue(0);
  near(f.master.prop("ADBE Position").valueAtTime(9, false), [540, 960, 0]);
  shotControl.param.setValue(100);
  gain.param.setValue(50);
  near(f.master.prop("ADBE Position").valueAtTime(9, false), kernelPose(meta, 9, 0.5).m);
  gain.param.setValue(100);
  // Arrastar o marcador muda o início e a duração sem reaplicar.
  const value = f.master.markers.keyValue(1);
  f.master.markers.removeKey(1);
  value.duration = 2;
  f.master.markers.setValueAtTime(5, value);
  near(f.master.prop("ADBE Position").valueAtTime(4.9, false), [540, 960, 0]);
  near(f.master.prop("ADBE Position").valueAtTime(6, false), camPose(6, meta.frame, [{ ...meta.shots[0].shape, start: 5, dur: 2, amount: 1 }]).m);
});

test("segundo shot reaproveita o rig; remover devolve tudo ao estado original", async () => {
  const f = await fixture();
  f.run("ae.camera.shot.apply", { presetId: "hero-push", startSeconds: 0 });
  const second = f.run("ae.camera.shot.apply", { presetId: "float-loop", seed: 12 });
  assert.equal(second.ok, true, JSON.stringify(second.error));
  let meta = engineMeta(f.master);
  assert.deepEqual(meta.shots.map((s) => s.id), ["s1", "s2"]);
  assert.equal(meta.shots[1].start, 0);
  assert.equal(meta.shots[1].dur, 10, "loop cobre a composição");
  assert.equal(meta.shots[1].shape.org[0], 5, "período ajustado para fechar ciclos inteiros");
  assert.equal(meta.shots[1].shape.org[1], 12);
  assert.equal(f.master.parade.numProperties, 11);
  near(f.master.prop("ADBE Position").valueAtTime(3, false), kernelPose(meta, 3).m);
  assert.equal(f.run("ae.camera.shot.remove", { shotId: "s1" }).ok, true);
  meta = engineMeta(f.master);
  assert.deepEqual(meta.shots.map((s) => s.id), ["s2"]);
  assert.equal(f.master.parade.numProperties, 10);
  const last = f.run("ae.camera.shot.remove", { shotId: "s2" });
  assert.equal(last.data.rigRemoved, true);
  assert.equal(engineMeta(f.master), null);
  assert.equal(f.master.parade.numProperties, 0);
  assert.equal(f.master.markers.numKeys, 0);
  for (const prop of [f.master.prop("ADBE Position"), f.master.prop("ADBE Orientation"), f.camera.options.property("ADBE Camera Focus Distance")]) {
    assert.equal(prop.expression, "");
  }
  assert.ok(f.master.comment.includes("parallax.quick"), "o rig de Parallax fica intacto");
});

test("ajustar troca os valores do shot sem duplicar controles", async () => {
  const f = await fixture();
  f.run("ae.camera.shot.apply", { presetId: "depth-slide", startSeconds: 0 });
  const adjusted = f.run("ae.camera.shot.adjust", { shotId: "s1", intensity: 50, tr: [0.03, 0, 0], dir: "to", durationSeconds: 2 });
  assert.equal(adjusted.ok, true, JSON.stringify(adjusted.error));
  const meta = engineMeta(f.master);
  assert.deepEqual(meta.shots[0].shape.tr, [0.03, 0, 0]);
  assert.equal(f.master.parade.property(meta.shots[0].control).param.value, 50);
  assert.equal(f.master.markers.keyValue(1).duration, 2);
  assert.equal(f.master.parade.numProperties, 10);
  near(f.master.prop("ADBE Position").valueAtTime(5, false), kernelPose(meta, 5, 1, { s1: 50 }).m);
  const bad = f.run("ae.camera.shot.adjust", { shotId: "s1", tr: [5, 0, 0] });
  assert.equal(bad.ok, false);
});

test("preflight recusa antes de mexer no projeto", async () => {
  const f = await fixture();
  assert.equal(f.run("ae.camera.shot.apply", { presetId: "nao-existe" }).error.code, "INVALID_PRESET");
  assert.equal(f.run("ae.camera.shot.apply", { presetId: "hero-push", intensity: 900 }).ok, false);
  f.master.prop("ADBE Position").expression = "value + [1, 0, 0]";
  const conflict = f.run("ae.camera.shot.apply", { presetId: "hero-push" });
  assert.equal(conflict.ok, false);
  assert.match(conflict.error.message, /expressão/);
  f.master.prop("ADBE Position").expression = "";
  f.master.prop("ADBE Orientation").setValueAtTime(1, [0, 10, 0]);
  assert.equal(f.run("ae.camera.shot.apply", { presetId: "hero-push" }).ok, false);
  assert.equal(f.calls.length, 0, "nenhum grupo de Undo aberto");
  assert.equal(f.master.parade.numProperties, 0);
});

test("falha no meio da escrita restaura controles, marcadores e comentário", async () => {
  const f = await fixture();
  const before = f.master.comment;
  const zoom = f.camera.options.property("ADBE Camera Zoom");
  Object.defineProperty(zoom, "expressionError", { get: () => (zoom.expression ? "Erro simulado" : ""), set: () => {} });
  const response = f.run("ae.camera.shot.apply", { presetId: "hero-push" });
  assert.equal(response.ok, false);
  assert.equal(f.master.comment, before);
  assert.equal(f.master.parade.numProperties, 0);
  assert.equal(f.master.markers.numKeys, 0);
  assert.equal(f.master.prop("ADBE Position").expression, "");
});

test("foco por alvo segue a profundidade axial e respeita o ajuste", async () => {
  const f = await fixture();
  f.run("ae.camera.shot.apply", { presetId: "hero-push", startSeconds: 2 });
  const meta = engineMeta(f.master);
  const focus = f.camera.options.property("ADBE Camera Focus Distance");
  near([focus.valueAtTime(1, false)], [3000], 1e-6);
  f.master.parade.property(meta.controls.focusTarget).param.setValue(f.mid.index);
  near([focus.valueAtTime(1, false)], [1750], 1e-6);
  f.master.parade.property(meta.controls.focusOffset).param.setValue(-50);
  f.master.parade.property(meta.controls.focusSmooth).param.setValue(0);
  const pose = kernelPose(meta, 6);
  near([focus.valueAtTime(6, false)], [(-1250 - pose.c[2]) * pose.f[2] - 50 + (1000 - pose.c[1]) * pose.f[1] + (540 - pose.c[0]) * pose.f[0]], 1e-6);
  f.master.parade.property(meta.controls.dof).param.setValue(1);
  assert.equal(f.camera.options.property("ADBE Camera Depth of Field").valueAtTime(1, false), 1);
});

test("foco legado do Parallax é substituído e volta ao remover", async () => {
  const f = await fixture();
  const legacy = f.scope.MotionExpressions.renderParallaxFocus({ targetLayerName: "Artista", focusOffset: 0 });
  const focus = f.camera.options.property("ADBE Camera Focus Distance");
  focus.expression = legacy; focus.expressionEnabled = true;
  assert.equal(f.run("ae.camera.shot.apply", { presetId: "hero-push" }).ok, true);
  assert.ok(focus.expression.includes("ae.camera.kernel"));
  f.run("ae.camera.shot.remove", { shotId: "s1" });
  assert.equal(focus.expression, legacy);
});

test("modo independente cria a câmera padrão do AE e a remove com o rig", async () => {
  const scene = () => {
    const comp = new FakeCompItem();
    const a = new FakeLayer(comp, { name: "Produto", position: [540, 960, 200] });
    const b = new FakeLayer(comp, { name: "Fundo", position: [540, 960, 800] });
    comp.list.push(a, b);
    return { comp, a, b };
  };
  const f = await fixture(scene);
  const response = f.run("ae.camera.shot.apply", { presetId: "depth-slide", startSeconds: 0 });
  assert.equal(response.ok, true, JSON.stringify(response.error));
  assert.equal(response.data.mode, "standalone");
  assert.equal(f.comp.numLayers, 4);
  const camera = f.comp.list.find((l) => l instanceof FakeCameraLayer), controller = camera.parent;
  const meta = engineMeta(controller);
  near([meta.frame.zoom], [1080 * 50 / 36]);
  near(camera.prop("ADBE Position").value, [0, 0, -1080 * 50 / 36]);
  near(controller.prop("ADBE Position").valueAtTime(1.5, false), kernelPose(meta, 1.5).m);
  assert.equal(f.run("ae.camera.remove", {}).ok, false, "remoção exige confirmação explícita");
  assert.equal(f.run("ae.camera.remove", {}, { allowDestructive: true }).ok, true);
  assert.equal(f.comp.numLayers, 2);
});

test("modo independente recusa cena 2D e câmera existente", async () => {
  const flat = () => { const comp = new FakeCompItem(); comp.list.push(new FakeLayer(comp, { threeD: false })); return { comp }; };
  const f = await fixture(flat);
  assert.match(f.run("ae.camera.shot.apply", { presetId: "hero-push" }).error.message, /Parallax/);
  const inspect = f.run("ae.camera.inspect");
  assert.equal(inspect.ok, true);
  assert.match(inspect.data.problem, /camadas 3D/);
  const withCamera = () => { const comp = new FakeCompItem(); comp.list.push(new FakeCameraLayer(comp, {}), new FakeLayer(comp)); return { comp }; };
  const g = await fixture(withCamera);
  assert.match(g.run("ae.camera.shot.apply", { presetId: "hero-push" }).error.message, /já tem uma câmera/);
});

test("inspect lista shots com a intensidade viva", async () => {
  const f = await fixture();
  f.run("ae.camera.shot.apply", { presetId: "hero-push", startSeconds: 1, intensity: 80 });
  const data = f.run("ae.camera.inspect").data;
  assert.equal(data.mode, "parallax");
  assert.equal(data.rig.shots.length, 1);
  assert.equal(data.rig.shots[0].intensity, 80);
  assert.equal(data.rig.shots[0].presetId, "hero-push");
});

test("coreografia: lê as camadas, escreve as visitas com marcadores e o foco segue cada camada", async () => {
  const f = await fixture(flyerScene);
  const response = f.run("ae.camera.choreography.apply", { choreographyId: "layer-tour", startSeconds: 0, durationSeconds: 9, intensity: 100 });
  assert.equal(response.ok, true, JSON.stringify(response.error));
  assert.deepEqual(response.data.subjects, ["Artista", "Título", "Logo"], "do fundo para a frente, sem o fundo");
  assert.equal(f.calls.filter((c) => c[0] === "begin").length, 1, "um único Undo");
  const meta = engineMeta(f.master), visits = meta.shots.filter((s) => s.shape.kind === "visit"), racks = meta.shots.filter((s) => s.shape.kind === "focus");
  assert.equal(visits.length, 5);
  assert.ok(visits.every((s) => s.shape.vis[8] === 1), "as visitas deixam o foco para os racks");
  assert.equal(response.data.focusRacks, racks.length);
  assert.deepEqual(racks.map((s) => s.layer), [f.artist.id, f.title.id, f.logo.id, f.artist.id], "o foco vai para cada camada visitada e volta ao protagonista");
  assert.equal(meta.shots.length, 5 + 1 + racks.length, "mais a respiração e os racks de foco");
  assert.ok(meta.shots.every((s) => s.group === "c1" && s.control === meta.shots[0].control), "um controle para a coreografia");
  assert.equal(f.master.markers.numKeys, 5, "um marcador por passo; a respiração e os racks não têm marcador");
  assert.equal(f.master.parade.numProperties, 9 + 1 + 3, "nove controles do rig, um da coreografia e um Layer Control por camada focada");
  const focusLayers = [...new Set(racks.map((s) => s.focus.control))].map((name) => f.master.parade.property(name).param.value);
  assert.deepEqual(focusLayers, [f.artist.index, f.title.index, f.logo.index], "cada Layer Control aponta a sua camada");
  assert.equal(f.master.parade.property(meta.controls.dof).param.value, 1, "profundidade de campo ligada");
  assert.ok(f.comp.motionBlur && f.members.every((l) => l.motionBlur), "motion blur na comp e nas camadas");
  // The expressions reproduce the kernel, with each beat at its base amount times the shared control.
  const pose = (t) => camPose(t, meta.frame, meta.shots.map((s) => ({ ...s.shape, start: s.start, dur: s.dur, amount: s.amount / 100 })));
  for (const t of [0.3, 2, 3.4, 5, 7, 8.9]) {
    near(f.master.prop("ADBE Position").valueAtTime(t, false), pose(t).m, 1e-6);
    near(forwardOf(f.camera, t), pose(t).f, 1e-9);
    near([f.camera.options.property("ADBE Camera Zoom").valueAtTime(t, false)], [pose(t).zoom], 1e-6);
  }
  // Holding on the artist, the camera faces it and the focus sits on it.
  f.master.parade.property(meta.controls.focusSmooth).param.setValue(0);
  const beat = visits.find((s) => s.role === "subject"), t = beat.start + beat.dur + 0.1, p = pose(t);
  const centre = f.artist.prop("ADBE Position").value;
  const depth = (centre[0] - p.c[0]) * p.f[0] + (centre[1] - p.c[1]) * p.f[1] + (centre[2] - p.c[2]) * p.f[2];
  near([f.camera.options.property("ADBE Camera Focus Distance").valueAtTime(t, false)], [depth], 1e-6);
  // Half intensity on the shared control scales the whole choreography.
  f.master.parade.property(meta.shots[0].control).param.setValue(50);
  near(f.master.prop("ADBE Position").valueAtTime(t, false),
    camPose(t, meta.frame, meta.shots.map((s) => ({ ...s.shape, start: s.start, dur: s.dur, amount: s.amount / 100 * 0.5 }))).m, 1e-6);
  // Removing the choreography gives everything back.
  const removed = f.run("ae.camera.shot.remove", { groupId: "c1" });
  assert.equal(removed.ok, true, JSON.stringify(removed.error));
  assert.equal(removed.data.rigRemoved, true);
  assert.ok(!f.comp.motionBlur && f.members.every((l) => !l.motionBlur), "motion blur devolvido");
  assert.equal(f.master.parade.numProperties, 0);
  assert.equal(f.master.markers.numKeys, 0);
});

test("remover a coreografia devolve foco e abertura e leva os Layer Controls, mantendo os outros shots", async () => {
  const f = await fixture(flyerScene);
  const deep = f.run("ae.camera.choreography.apply", { choreographyId: "layer-tour", depth: 30000 });
  assert.equal(deep.ok, false);
  assert.equal(deep.error.details.field, "depth", "profundidade fora de 0–20000 px");
  assert.equal(f.run("ae.camera.shot.apply", { presetId: "hero-push", startSeconds: 0, durationSeconds: 2 }).ok, true);
  let meta = engineMeta(f.master);
  const dof = f.master.parade.property(meta.controls.dof).param, aperture = f.master.parade.property(meta.controls.aperture).param;
  const before = [dof.value, aperture.value], controls = f.master.parade.numProperties;
  const applied = f.run("ae.camera.choreography.apply", { choreographyId: "full-sequence", startSeconds: 0, durationSeconds: 9 });
  assert.equal(applied.ok, true, JSON.stringify(applied.error));
  assert.equal(dof.value, 1, "profundidade de campo ligada para os racks");
  assert.ok(applied.data.depth > 0, "abertura lá de trás");
  const removed = f.run("ae.camera.shot.remove", { groupId: applied.data.groupId });
  assert.equal(removed.ok, true, JSON.stringify(removed.error));
  assert.equal(removed.data.rigRemoved, false, "o Hero Push continua");
  meta = engineMeta(f.master);
  assert.deepEqual([dof.value, aperture.value], before, "foco e abertura como estavam");
  assert.equal(meta.optics, undefined);
  assert.equal(f.master.parade.numProperties, controls, "nenhum Layer Control de foco sobrou");
  assert.deepEqual(meta.shots.map((s) => s.presetId), ["hero-push"]);
});

test("coreografia recusa cena sem camadas além do fundo e respeita a seleção", async () => {
  const f = await fixture(flyerScene);
  const empty = f.run("ae.camera.choreography.apply", { choreographyId: "layer-tour", layers: "selection" });
  assert.equal(empty.ok, false);
  assert.match(empty.error.message, /selecione/);
  f.title.selected = true; f.back.selected = true;
  const one = f.run("ae.camera.choreography.apply", { choreographyId: "layer-tour", layers: "selection", startSeconds: 0, life: false, motionBlur: false });
  assert.equal(one.ok, true, JSON.stringify(one.error));
  assert.deepEqual(one.data.subjects, ["Título"]);
  assert.equal(f.comp.motionBlur, false, "motion blur só quando pedido");
  assert.equal(f.run("ae.camera.choreography.apply", { choreographyId: "nada" }).error.code, "INVALID_PRESET");
  const inspect = f.run("ae.camera.inspect").data;
  assert.deepEqual(inspect.scene.map((l) => [l.name, l.bg]), [["Logo", 0], ["Título", 0], ["Artista", 0], ["Fundo", 1]]);
});

test("bake grava keys por quadro e desliga o motor", async () => {
  const f = await fixture();
  f.comp.duration = 2;
  f.run("ae.camera.shot.apply", { presetId: "hero-push", startSeconds: 0, durationSeconds: 2 });
  const meta = engineMeta(f.master);
  const expected = kernelPose(meta, 1).m;
  const response = f.run("ae.camera.bake", { stepFrames: 1 });
  assert.equal(response.ok, true, JSON.stringify(response.error));
  assert.equal(response.data.samples, 50);
  const position = f.master.prop("ADBE Position");
  assert.equal(position.expression, "");
  assert.equal(position.numKeys, 50);
  near(position.valueAtTime(1, false), expected, 1e-6);
  assert.equal(engineMeta(f.master), null);
  assert.equal(f.master.parade.numProperties, 0);
  assert.equal(f.master.markers.numKeys, 0);
});
