import test from "node:test";
import assert from "node:assert/strict";
import { MOTION_LIBRARY_DEFAULTS, isMotionLibraryOptions, validateCommandRequest } from "../dist/index.js";

const target = { compId: 2, layerId: 3, instance: "1726539600-3", fingerprint: '{"version":1}' };
const adjust = () => ({ target: { ...target }, presetId: "mist-reveal", options: { ...MOTION_LIBRARY_DEFAULTS } });
function valid(command, args) {
  return validateCommandRequest({ protocolVersion: 1, requestId: "preset-workspace-1", command,
    args, context: { host: "after-effects", hostVersion: "26.5" } }).valid;
}

test("workspace commands accept their documented inputs, without changing legacy preset commands", () => {
  for (const [command, args] of [
    ["ae.presets.inspect", {}], ["ae.presets.adjust", adjust()],
    ["ae.presets.personal", { action: "list" }], ["ae.presets.personal", { action: "add" }],
    ["ae.presets.personal", { action: "remove", rootId: "root:ab12" }],
    ["ae.presets.personal-apply", { itemId: "ffx:12a.bc-3_0" }],
    ["ae.presets.apply", { presetId: "mist-reveal", ...MOTION_LIBRARY_DEFAULTS }],
    ["ae.presets.remove", {}], ["ae.presets.bake", {}]
  ]) assert.equal(valid(command, args), true, command);
});

test("workspace commands reject unexpected fields and filesystem/script injection parameters", () => {
  for (const [command, args] of [
    ["ae.presets.inspect", {}], ["ae.presets.adjust", adjust()],
    ["ae.presets.personal", { action: "add" }], ["ae.presets.personal-apply", { itemId: "ffx-1" }]
  ]) for (const key of ["path", "script", "code", "extra"])
    assert.equal(valid(command, { ...args, [key]: "/private/user-data.jsx" }), false, `${command}.${key}`);
  assert.equal(valid("ae.presets.adjust", { ...adjust(), target: { ...target, layerIndex: 1 } }), false);
  assert.equal(valid("ae.presets.adjust", { ...adjust(), options: { ...MOTION_LIBRARY_DEFAULTS, code: "alert(1)" } }), false);
});

test("personal library only removes an identified root and never accepts a supplied path", () => {
  for (const args of [{}, { action: "remove" }, { action: "list", rootId: "root-1" },
    { action: "add", rootId: "root-1" }, { action: "refresh" }, { action: "remove", rootId: null }])
    assert.equal(valid("ae.presets.personal", args), false, JSON.stringify(args));
  for (const itemId of ["", "a".repeat(97), "/tmp/a.ffx", "../a.ffx", "C:\\a.ffx", "ffx\n1", "x;alert(1)", 3]) {
    assert.equal(valid("ae.presets.personal-apply", { itemId }), false);
    assert.equal(valid("ae.presets.personal", { action: "remove", rootId: itemId }), false);
  }
  assert.equal(valid("ae.presets.personal-apply", { itemId: "a".repeat(96) }), true);
});

test("adjust rejects incomplete, imprecise or unbounded target identities", () => {
  for (const key of Object.keys(target)) {
    const missing = { ...target }; delete missing[key];
    assert.equal(valid("ae.presets.adjust", { ...adjust(), target: missing }), false, key);
  }
  for (const key of ["compId", "layerId"]) for (const value of [0, -1, 1.5, "2", NaN, Infinity, 9007199254740992])
    assert.equal(valid("ae.presets.adjust", { ...adjust(), target: { ...target, [key]: value } }), false, `${key}=${value}`);
  for (const [key, limit] of [["instance", 128], ["fingerprint", 8192]]) {
    for (const value of ["", "a".repeat(limit + 1), 12])
      assert.equal(valid("ae.presets.adjust", { ...adjust(), target: { ...target, [key]: value } }), false, key);
    assert.equal(valid("ae.presets.adjust", { ...adjust(), target: { ...target, [key]: "a".repeat(limit) } }), true);
  }
  for (const key of ["presetId", "options", "target"]) {
    const args = adjust(); delete args[key];
    assert.equal(valid("ae.presets.adjust", args), false, key);
  }
});

test("Adjust option schema agrees with the shared motion controls on bounds and optional Studio controls", () => {
  for (const [key, values] of [
    ["phase", ["in", "out", "both", "bad", null]],
    ["direction", ["preset", "bottom", "top", "left", "right", "bad"]],
    ["durationFrames", [0, 1, 600, 601, 1.5]], ["intensity", [-1, 0, 34.5, 300, 301]],
    ["staggerFrames", [-1, 0, 60, 61, 1.5]],
    ["unit", ["preset", "characters", "words", "lines", "all", "bad"]],
    ["elasticity", [-1, 0, 50.5, 100, 101]], ["overlap", [-1, 0, 50.5, 100, 101]],
    ["speed", [24, 25, 100.5, 200, 201]],
    ["order", ["preset", "forward", "reverse", "center-out", "edges-in", "random", "bad"]],
    ["seed", [-1, 0, 17, 9999, 10000, 1.5]]
  ]) for (const value of values) {
    const options = { ...MOTION_LIBRARY_DEFAULTS, [key]: value };
    assert.equal(valid("ae.presets.adjust", { ...adjust(), options }), isMotionLibraryOptions(options), `${key}=${value}`);
  }
  for (const key of Object.keys(MOTION_LIBRARY_DEFAULTS)) {
    const options = { ...MOTION_LIBRARY_DEFAULTS }; delete options[key];
    assert.equal(valid("ae.presets.adjust", { ...adjust(), options }), false, key);
  }
});

test("marker timing payload is bounded and rejects unsupported operations and arbitrary parameters",()=>{
 const args={operation:"stagger",phase:"in",frames:3,order:"forward"};
 assert.equal(valid("ae.presets.timing",args),true);
 for(const change of [{frames:601},{frames:-601},{frames:1.5},{frames:"3"},{phase:"both"},{order:"invalid"},{operation:"run"},{path:"/tmp/test.jsx"}])assert.equal(valid("ae.presets.timing",{...args,...change}),false);
 for(const key of Object.keys(args)){const missing={...args};delete missing[key];assert.equal(valid("ae.presets.timing",missing),false);}
});
