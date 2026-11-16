import test from "node:test";
import assert from "node:assert/strict";
import { loadHostModules } from "../../../apps/after-effects-cep/tests/host-harness.mjs";
import { HOST_SOURCE_ORDER } from "../../../scripts/build-extendscript.mjs";
import { TOOL_STARTER_COMMANDS, deriveToolStarterArgs } from "../dist/index.js";

class CompItem {
  name = "Starter contract";
  width = 1920; height = 1080; duration = 10; frameRate = 30; time = 1;
  workAreaStart = 0; workAreaDuration = 10; numLayers = 0;
  selectedLayers = []; selectedProperties = []; markers = { numKeys: 0 }; layers = { length: 0 };
  layer() { return null; }
}
const context = {
  host: "after-effects", hostVersion: "26.5", fps: 30, compWidth: 1920, compHeight: 1080,
  compDurationSeconds: 10, currentTimeSeconds: 1, workAreaStart: 0, workAreaDuration: 10,
  selectionCount: 0, selectionLayerCount: 0, selectionKinds: [], selectionHasKeyframes: false,
  selectionHasExpressions: false, selectionIs3D: false, averageLayerDurationSeconds: 0, existingRigIdsInSelection: []
};
const scope = await loadHostModules(HOST_SOURCE_ORDER.map(path => path.startsWith("../") ? path.slice(3) : `src/${path}`), {
  app: { project: { activeItem: new CompItem(), expressionEngine: "javascript-1.0", items: { length: 0 } } },
  CompItem, FootageItem: class {},
  PropertyType: { PROPERTY: 6412, INDEXED_GROUP: 6413, NAMED_GROUP: 6414 },
  KeyframeInterpolationType: { LINEAR: 6612, BEZIER: 6613, HOLD: 6614 },
  PropertyValueType: { NO_VALUE: 6613, ThreeD_SPATIAL: 6614, TwoD_SPATIAL: 6616 },
  KeyframeEase: class {}, ParagraphJustification: { LEFT_JUSTIFY: 7415, CENTER_JUSTIFY: 7416 },
  BlendingMode: { NORMAL: 5012, ADD: 5006 }, TrackMatteType: { NO_TRACK_MATTE: 6012, ALPHA: 6013 },
  LayerQuality: { BEST: 3113 }, File: class {}, Folder: class {}, ImportOptions: class {}
});

for (const commandId of Object.keys(TOOL_STARTER_COMMANDS)) {
  test(`${commandId}: editor starter converts to valid host arguments`, () => {
    const args = deriveToolStarterArgs(commandId, context);
    if (commandId === "ae.layer.parent") {
      assert.equal(args, undefined, "the target identity must be chosen explicitly in the editor");
      return;
    }
    assert.ok(args, `${commandId} is mapped but has no argument conversion`);
    const handler = scope.MotionRegistry.get(commandId);
    assert.ok(handler, `${commandId} is not registered in the host`);
    const failure = handler.preflight(args, {}, {});
    assert.notEqual(failure?.code, "INVALID_PRESET", `${commandId}: ${JSON.stringify(failure)}; ${JSON.stringify(args)}`);
  });
}
