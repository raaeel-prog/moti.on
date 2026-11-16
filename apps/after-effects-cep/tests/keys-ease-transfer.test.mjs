/**
 * `ae.keys.ease-copy` / `ae.keys.ease-paste` — Animation Composer's Keyframe
 * Actions "Copy", "Paste Easing" and "Paste Value", in the Ease tool. The ease
 * travels as a multiple of each segment's average speed, so a curve keeps its
 * shape between properties of very different ranges.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { loadHostModules } from "./host-harness.mjs";
import { FakeCompItem, FakeKeyframeEase, FakeProperty, PropertyType, PropertyValueType, makeKey } from "./keyframe-fakes.mjs";

async function fixture(comp) {
  const calls = [];
  const app = {
    project: { activeItem: comp, expressionEngine: "javascript-1.0" },
    beginUndoGroup(label) { calls.push(["begin", label]); },
    endUndoGroup() { calls.push(["end"]); }
  };
  const scope = await loadHostModules(
    ["generated/motion-contracts.jsx", "generated/motion-descriptors.jsx", "src/json.jsx", "src/undo.jsx", "src/registry.jsx",
      "src/keyframe-operations.jsx", "src/commands/keys-ease-transfer.jsx", "src/dispatch.jsx"],
    { app, CompItem: FakeCompItem, Property: FakeProperty, PropertyType, PropertyValueType, KeyframeEase: FakeKeyframeEase,
      KeyframeInterpolationType: { LINEAR: 1, BEZIER: 2, HOLD: 3 } }
  );
  const send = (command, args = {}) => JSON.parse(scope.MotionAE.dispatch(JSON.stringify({
    protocolVersion: 1, requestId: `${command}-1`, command, args,
    context: { host: "after-effects", hostVersion: "26.3", locale: "pt_BR" }, options: {}
  })));
  return { send, app, calls };
}

/** A 1D property whose keys carry the given out/in speeds and influences. */
function eased(name, points) {
  const keys = points.map(([time, value, outSpeed = 0, outInfluence = 33, inSpeed = 0, inInfluence = 33]) => {
    const key = makeKey(time, value, outInfluence, inInfluence);
    key.outEase = [new FakeKeyframeEase(outSpeed, outInfluence)];
    key.inEase = [new FakeKeyframeEase(inSpeed, inInfluence)];
    return key;
  });
  return new FakeProperty(name, keys);
}
const outOf = (property, i) => property.keys[i].outEase.map(e => [Math.round(e.speed * 1e6) / 1e6, e.influence]);
const inOf = (property, i) => property.keys[i].inEase.map(e => [Math.round(e.speed * 1e6) / 1e6, e.influence]);

test("a pasted ease keeps its shape: 1.5× the average speed stays 1.5× on another range and duration", async () => {
  // Source: 0 → 100 in 1 s (average 100/s) leaving at 150/s with 40 % influence, arriving at 0/s with 80 %.
  const source = eased("Opacity", [[0, 0, 150, 40], [1, 100, 0, 33, 0, 80]]);
  const comp = new FakeCompItem([source]);
  const f = await fixture(comp);
  const copied = f.send("ae.keys.ease-copy");
  assert.equal(copied.ok, true, JSON.stringify(copied));
  assert.equal(f.calls.length, 0, "copying writes nothing and opens no Undo group");

  // Target: 0 → 50 in 2 s (average 25/s).
  const target = eased("Rotation", [[0, 0, 7, 10], [2, 50, 0, 33, 3, 10]]);
  comp.selectedProperties = [target];
  const pasted = f.send("ae.keys.ease-paste", { target: "ease" });
  assert.equal(pasted.ok, true, JSON.stringify(pasted));
  assert.deepEqual(outOf(target, 0), [[37.5, 40]], "1.5 × 25/s");
  assert.deepEqual(inOf(target, 1), [[0, 80]]);
  assert.deepEqual(target.keys.map(k => [k.time, k.value]), [[0, 0], [2, 50]], "times and values stay");
  assert.equal(f.calls.filter(c => c[0] === "begin").length, 1, "one Undo step");
});

test("a segment that does not move keeps the ease scaled by time only", async () => {
  const source = eased("Opacity", [[0, 30, 20, 50], [2, 30]]);
  const comp = new FakeCompItem([source]);
  const f = await fixture(comp);
  f.send("ae.keys.ease-copy");
  const target = eased("Opacity", [[0, 10], [4, 90]]);
  comp.selectedProperties = [target];
  assert.equal(f.send("ae.keys.ease-paste", { target: "ease" }).ok, true);
  assert.deepEqual(outOf(target, 0), [[10, 50]], "20/s over 2 s is 40; spread over 4 s it is 10/s");
});

test("paste value replaces only the values of the selected keys", async () => {
  const source = eased("Opacity", [[0, 5], [1, 95]]);
  const comp = new FakeCompItem([source]);
  const f = await fixture(comp);
  f.send("ae.keys.ease-copy");
  const target = eased("Opacity", [[2, 0, 40, 60], [3, 100]]);
  comp.selectedProperties = [target];
  assert.equal(f.send("ae.keys.ease-paste", { target: "value" }).ok, true);
  assert.deepEqual(target.keys.map(k => [k.time, k.value]), [[2, 5], [3, 95]]);
  assert.deepEqual(outOf(target, 0), [[40, 60]], "the ease is untouched");
});

test("paste refuses before writing: nothing copied, fewer keys than copied, a different value type", async () => {
  const source = eased("Opacity", [[0, 0], [1, 50], [2, 100]]);
  const comp = new FakeCompItem([source]);
  const f = await fixture(comp);
  const nothing = f.send("ae.keys.ease-paste", { target: "ease" });
  assert.equal(nothing.ok, false); assert.equal(nothing.error.code, "INVALID_SELECTION_TYPE");
  f.send("ae.keys.ease-copy");
  const small = eased("Opacity", [[0, 0], [1, 10]]);
  comp.selectedProperties = [small];
  const before = JSON.stringify(small.keys);
  const fewer = f.send("ae.keys.ease-paste", { target: "ease" });
  assert.equal(fewer.ok, false); assert.equal(fewer.error.code, "INVALID_SELECTION_TYPE"); assert.equal(JSON.stringify(small.keys), before);
  const other = eased("Position", [[0, 0], [1, 1], [2, 2]]);
  other.propertyValueType = PropertyValueType.TwoD;
  comp.selectedProperties = [other];
  const type = f.send("ae.keys.ease-paste", { target: "value" });
  assert.equal(type.ok, false); assert.equal(type.error.code, "INVALID_SELECTION_TYPE");
  assert.equal(f.send("ae.keys.ease-paste", { target: "curve" }).ok, false, "an unknown target is rejected");
});
