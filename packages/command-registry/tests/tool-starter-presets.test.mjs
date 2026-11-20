import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { createGradientSettings } from "../../contracts/dist/index.js";
import * as registry from "../dist/index.js";

const context = (changes = {}) => ({
  host: "after-effects", hostVersion: "26.5", fps: 30,
  compWidth: 1920, compHeight: 1080, compDurationSeconds: 10,
  currentTimeSeconds: 1, workAreaStart: 0, workAreaDuration: 10,
  selectionCount: 2, selectionLayerCount: 2, selectionKinds: [],
  selectionHasKeyframes: true, selectionHasExpressions: false, selectionIs3D: false,
  averageLayerDurationSeconds: 5, existingRigIdsInSelection: [], ...changes
});

test("editor, reset and Quick use the same professional expression recipes", () => {
  assert.equal(typeof registry.getToolStarterDraft, "function", "central starter drafts API is missing");
  for (const [toolId, commandId] of [
    ["wiggle", "ae.expression.wiggle"], ["flicker", "ae.expression.flicker"],
    ["inertial", "ae.animate.inertial"], ["flip", "ae.layer.flip"],
    ["createNull", "ae.layer.create-null"], ["reverseOrder", "ae.layer.reverse-order"],
    ["sendToEdge", "ae.keys.send-to-edge"]
  ]) {
    const draft = registry.getToolStarterDraft(toolId, context());
    const quick = registry.getQuickProfile(commandId).derive(context());
    const { conflictMode: _conflict, ...args } = quick;
    assert.deepEqual(draft, args, `${toolId} opens with a different recipe than Quick`);
    assert.deepEqual(registry.deriveToolStarterArgs(commandId, context()), quick);
  }
});

test("starter copies isolate nested colors, points, controllers and subsequent resets", () => {
  assert.equal(typeof registry.getToolStarterDraft, "function");
  const word = registry.getToolStarterDraft("wordReveal", context());
  word.fillColor[0] = 0;
  const look = registry.getToolStarterDraft("lookAt", context());
  look.offsetOrientation[0] = 90;
  look.constrainAxes.x = true;
  const clean = registry.getToolStarterDraft("clean");
  clean.selectedItemIds.push(123);
  assert.equal(registry.getToolStarterDraft("wordReveal", context()).fillColor[0], 1);
  assert.deepEqual(registry.getToolStarterDraft("lookAt", context()).offsetOrientation, [0, 0, 0]);
  assert.equal(registry.getToolStarterDraft("lookAt", context()).constrainAxes.x, false);
  assert.deepEqual(registry.getToolStarterDraft("clean").selectedItemIds, []);
  assert.ok(Object.isFrozen(registry.TOOL_STARTER_DRAFTS.wordReveal.fillColor));
});

test("operation recipes retain timeline order, framing and rig-only Parallax", () => {
  assert.equal(typeof registry.deriveToolStarterArgs, "function");
  const args = registry.deriveToolStarterArgs("ae.animate.parallax.quick", context());
  assert.equal(args.orderMode, "timeline");
  assert.equal(args.reverseOrder, false);
  assert.equal(args.preserveFraming, true);
  assert.equal(args.depthStep, 0);
  assert.equal(args.createCamera, true);
  assert.equal(args.preset, undefined, "creating the rig must not apply a camera move");
  assert.deepEqual(args, registry.deriveToolStarterArgs("ae.parallax.create", context()));
  assert.deepEqual(args, registry.getToolStarterDraft("parallax", context()));
  assert.equal(registry.getToolStarterDraft("parallaxFull").operation, "create");
});

test("context-aware presets scale resolution and durations without mutating their context", () => {
  assert.equal(typeof registry.getToolStarterDraft, "function");
  const source = context({ fps: 60, compWidth: 3840, compHeight: 2160, selectionCount: 0, selectionLayerCount: 3, selectionIs3D: true });
  const snapshot = structuredClone(source);
  assert.equal(registry.getToolStarterDraft("wordReveal", source).durationFrames, 72);
  assert.equal(registry.getToolStarterDraft("styleSwap", source).durationFrames, 48);
  assert.equal(registry.getToolStarterDraft("variableMorph", source).radius, 500);
  assert.equal(registry.getToolStarterDraft("wiggle", source).amplitude, 28); // Flutuar: 14 px em 1080p
  assert.equal(registry.getToolStarterDraft("createNull", source).parentSelected, true);
  assert.equal(registry.getToolStarterDraft("createNull", source).dimension, "3d");
  assert.equal(registry.getToolStarterDraft("orbit", source).radius, 540);
  assert.deepEqual(source, snapshot);
});

test('new 3D geometry starters scale to landscape, portrait and square compositions',()=>{
 for(const [width,height] of [[640,360],[360,640],[512,512],[1920,1080],[3840,2160]]){
  const ctx=context({compWidth:width,compHeight:height}),factor=Math.min(width,height)/1080;
  assert.equal(registry.getToolStarterDraft('cube',ctx).size,Math.round(400*factor),'cube must not open at 400px in a 360px composition');
  assert.equal(registry.getToolStarterDraft('cylinder',ctx).radius,Math.round(500*factor));
 }
 assert.equal(registry.getToolStarterDraft('cube').size,400,'no-context drafts keep the established design size');
});

test("state-free actions and guarded editors do not acquire fake presets or quick actions", () => {
  assert.equal(typeof registry.getToolStarterDraft, "function");
  for (const id of ["copyKeys", "reverseKeys", "reverseValues", "beat", "missing"]) {
    assert.equal(registry.getToolStarterDraft(id), undefined, `${id} has no resettable draft`);
  }
  assert.equal(registry.getQuickProfile("ae.keys.ease.apply"), undefined);
  assert.equal(registry.getQuickProfile("ae.keys.copy"), undefined);
  assert.equal(registry.getQuickProfile("ae.effect.gradient"), undefined);
  assert.ok(registry.getToolStarterDraft("ease"));
  assert.equal(registry.deriveToolStarterArgs("ae.keys.copy", context()), undefined);
});

test("all new quick operation profiles use the canonical draft conversion", () => {
  assert.equal(typeof registry.deriveToolStarterArgs, "function");
  for (const commandId of [
    "ae.text.word-reveal", "ae.text.variable-morph", "ae.text.vertical-pulse", "ae.text.style-swap",
    "ae.animate.parallax.quick", "ae.keys.delay", "ae.3d.look-at", "ae.3d.orbit", "ae.keys.paste",
    "ae.keys.clone", "ae.vector.ai-to-vector", "ae.vector.text-to-vector", "ae.animate.jump",
    "ae.camera.transition", "ae.shape.library"
  ]) {
    const profile = registry.getQuickProfile(commandId);
    assert.ok(profile, `${commandId} is still local to the panel`);
    assert.deepEqual(profile.derive(context()), registry.deriveToolStarterArgs(commandId, context()));
    assert.deepEqual(profile.liveControls, [], `${commandId} must not promise controls it does not create`);
  }
  const delay = registry.deriveToolStarterArgs("ae.keys.delay", context());
  assert.equal(delay.shiftMode, "layerStart", "Quick and editor preserve the established layer cascade");
  assert.deepEqual(delay.spatialOrigin, [0, 0]);
  assert.equal(delay.originX, undefined);
});

test("the complete 52-tool product inventory has a draft or an explicit state-free classification", () => {
  const source = ts.createSourceFile("main.ts", readFileSync(new URL("../../../apps/after-effects-cep/client/src/main.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
  let tools;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === "TOOLS") tools = node.initializer.elements;
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.equal(tools.length, 52);
  const stateFree = new Set(["reverseKeys", "reverseValues", "beat", "copyKeys"]);
  for (const node of tools) {
    const field = name => node.properties.find(property => property.name?.getText(source) === name)?.initializer.text;
    const toolId = field("id"), commandId = field("commandId");
    if (stateFree.has(toolId)) {
      assert.equal(registry.getToolStarterDraft(toolId), undefined);
      assert.equal(registry.getToolStarterProfile(commandId), undefined);
    } else {
      assert.ok(registry.getToolStarterDraft(toolId), `${toolId} has no initial/reset recipe`);
      assert.equal(registry.getToolStarterProfile(commandId).toolId, toolId, `${toolId} is mapped to another editor`);
    }
  }
});

test("new gradients use animated Aurora without modifying the gradient ABI defaults", () => {
  const starter = registry.getToolStarterDraft("gradient");
  assert.deepEqual(starter, createGradientSettings());
  assert.equal(starter.animation, "loop");
  assert.equal(starter.duration, 6);
  assert.equal(starter.stops.length, 8);
  starter.stops[0].color[0] = 8;
  assert.notEqual(registry.getToolStarterDraft("gradient").stops[0].color[0], 8);
});

test("the premium easing starter is editor-only and preserves Hold by default", () => {
  assert.deepEqual(registry.getToolStarterDraft("ease"), {
    x1: 0.22, y1: 1, x2: 0.36, y2: 1, applyIn: true, applyOut: true, convertHold: false
  });
  assert.equal(registry.getQuickProfile("ae.keys.ease.apply"), undefined);
});
