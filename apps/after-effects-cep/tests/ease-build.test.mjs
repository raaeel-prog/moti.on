import test from "node:test";
import assert from "node:assert/strict";
import { loadHostModules } from "./host-harness.mjs";

const build = { durationFrames: 15, useOpacity: true, opacityFrom: 0, opacityTo: 100, useRotation: true, rotationFrom: -8, rotationTo: 0, useScale: false, scaleFrom: 86, scaleTo: 100, usePosition: false, posFromX: 0, posFromY: 80, posToX: 0, posToY: 0 };
const curve = { x1: 0.25, y1: 0.1, x2: 0.25, y2: 1, applyIn: true, applyOut: true };
class FakeComp { constructor(layers) { this.selectedLayers = layers; this.time = 1; this.duration = 5; this.frameDuration = 1 / 30; } }
class FakeProperty {
  constructor(value) { this.value = value; this.keys = []; this.canVaryOverTime = true; this.expressionEnabled = false; }
  get numKeys() { return this.keys.length; }
  keyTime(i) { return this.keys[i - 1].time; }
  keyValue(i) { return this.keys[i - 1].value; }
  valueAtTime() { return this.value; }
  setValue(value) { this.value = value; }
  setValueAtTime(time, value) { if (this.failWrite) throw new Error("injected host failure"); this.keys.push({ time, value }); this.value = value; }
  nearestKeyIndex(time) { return this.keys.findIndex(k => k.time === time) + 1; }
  keyInTemporalEase() { return [{speed: 0, influence: 16.67}]; }
  keyOutTemporalEase() { return [{speed: 0, influence: 16.67}]; }
  keyInInterpolationType() { return 1; }
  keyOutInterpolationType() { return 1; }
  setInterpolationTypeAtKey() {}
  setTemporalContinuousAtKey() {}
  setTemporalAutoBezierAtKey() {}
  setTemporalEaseAtKey() {}
}
function layer() {
  const opacity = new FakeProperty(42), rotation = new FakeProperty(12);
  return { opacity, rotation, locked: false, inPoint: 0, outPoint: 5, property() { return { property(name) { return name === "ADBE Opacity" ? opacity : rotation; } }; } };
}
async function setup(layers = [layer()]) {
  let command;
  const comp = new FakeComp(layers);
  await loadHostModules(["src/commands/keys-ease.jsx"], {
    app: { project: { activeItem: comp } }, CompItem: FakeComp,
    KeyframeInterpolationType: { LINEAR: 1, BEZIER: 2 },
    KeyframeEase: class { constructor(speed, influence) { this.speed = speed; this.influence = influence; } },
    MotionContracts: { ERROR: { INVALID_PRESET: "INVALID_PRESET", HOST_OPERATION_FAILED: "HOST_OPERATION_FAILED", ROLLBACK_FAILED: "ROLLBACK_FAILED" } },
    MotionRegistry: { register(_, value) { command = value; } },
    MotionKeyframes: {
      isSupportedProperty: p => p instanceof FakeProperty,
      captureProperty: property => ({ property, keys: structuredClone(property.keys) }),
      restoreProperty: snapshot => { snapshot.property.keys = structuredClone(snapshot.keys); },
      curveToEase: () => ({ inSpeed: 0, outSpeed: 0, inInfluence: 25, outInfluence: 25 })
    }
  });
  return { command, comp, layers, args: { ...curve, build: { ...build } } };
}
test("build validates duration and enabled properties before writing", async () => {
  const {command, args, layers} = await setup();
  for (const durationFrames of [0, 601, 1.5, NaN]) assert.ok(command.preflight({...args, build: {...build, durationFrames}}));
  assert.ok(command.preflight({...args, build: {...build, useOpacity:false, useRotation:false}}));
  assert.equal(layers[0].opacity.numKeys, 0);
});
test("build preflights every layer, existing keys and active expressions", async () => {
  const {command, args, layers} = await setup([layer(), layer()]);
  layers[1].locked = true; assert.ok(command.preflight(args)); layers[1].locked = false;
  layers[1].opacity.expressionEnabled = true; assert.ok(command.preflight(args)); layers[1].opacity.expressionEnabled = false;
  layers[1].rotation.keys = [{time: 1.25, value: 9}]; assert.ok(command.preflight(args));
  assert.equal(layers[0].opacity.numKeys, 0);
});
test("build rolls back keys and static values on a later property failure", async () => {
  const {command, args, layers} = await setup();
  layers[0].rotation.failWrite = true;
  assert.equal(command.preflight(args), null);
  assert.throws(() => command.run(args), {motionCode: "HOST_OPERATION_FAILED"});
  assert.equal(layers[0].opacity.numKeys, 0);
  assert.equal(layers[0].opacity.value, 42);
  assert.equal(layers[0].rotation.value, 12);
});
test("build uses current time plus frames and reports actual created keyframes", async () => {
  const {command, args, layers, comp} = await setup();
  assert.equal(command.preflight(args), null);
  const result = command.run(args);
  assert.equal(result.data.appliedCount, 4);
  assert.deepEqual(layers[0].opacity.keys, [{time:1,value:0},{time:1.5,value:100}]);
  assert.equal(comp.time, 1);
});

