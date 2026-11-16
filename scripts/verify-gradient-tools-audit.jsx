// Owned disposable AE fixture. Run from File > Scripts > Run Script File.
// Requires an EMPTY UNSAVED project and the current built host. Never runs a vendor script.
// Outputs artifacts/tools-audit/gradient-native/<unique-run>/result.json, QA AEP and PNGs.
// Undo/Redo and actual backend equivalence require separate observed actions/evidence.
(function () {
  var repo = File($.fileName).parent.parent.fsName;
  var stamp = String(new Date().getTime()), base = new Folder(repo + "/artifacts/tools-audit/gradient-native");
  var out = null, comp = null, fixture = null, serial = 0, recipes = [], ownIds = [], qaFile = null, entered = false;
  var result = {schemaVersion: 1, completed: false, status: "RUNNING", host: app.version, build: app.buildName, os: $.os,
    startedAt: new Date().toString(), tests: [], renders: [], backend: [],
    notRun: ["Undo/Redo needs separate UI actions after the dispatcher returns.", "GPU equivalence needs offline pixel comparison and observed actual-backend evidence.", "Full-resolution performance and project color-management parity are outside this small render fixture."]};
  function json(v) {
    if (v === null || v === undefined) return "null";
    if (typeof v === "number") return isFinite(v) ? String(v) : "null";
    if (typeof v === "boolean") return String(v);
    if (typeof v === "string") return "\"" + v.replace(/\\/g, "\\\\").replace(/"/g, "\\\"").replace(/\r/g, "\\r").replace(/\n/g, "\\n").replace(/\t/g, "\\t") + "\"";
    var parts = [], key;
    if (v instanceof Array) { for (key = 0; key < v.length; key++) parts.push(json(v[key])); return "[" + parts.join(",") + "]"; }
    for (key in v) if (v.hasOwnProperty(key)) parts.push(json(String(key)) + ":" + json(v[key]));
    return "{" + parts.join(",") + "}";
  }
  function assert(value, why) { if (!value) throw new Error(why); }
  function mkdir(folder) { if (folder.exists) return; if (!folder.parent.exists) mkdir(folder.parent); assert(folder.create(), "Cannot create evidence folder: " + folder.fsName); }
  function save() { if (!out) return; var file = new File(out.fsName + "/result.json"); file.encoding = "UTF-8"; assert(file.open("w"), "Cannot write result receipt."); file.write(json(result)); file.close(); }
  function test(name, fn) {
    var started = new Date().getTime();
    try { var detail = fn(); result.tests.push({name: name, status: "PASS", milliseconds: new Date().getTime() - started, detail: detail || null}); }
    catch (e) { result.tests.push({name: name, status: "FAIL", error: String(e), line: e.line || null}); }
    save();
  }
  function ownProject() {
    assert(entered && app.project, "The owned QA project is not active.");
    for (var i = 1; i <= app.project.numItems; i++) {
      var id = app.project.item(i).id, found = false;
      for (var k = 0; k < ownIds.length; k++) if (ownIds[k] === id) found = true;
      assert(found, "Project ownership changed; refusing further mutation.");
    }
    if (app.project.file) assert(qaFile && app.project.file.fsName.toLowerCase() === qaFile.fsName.toLowerCase(), "Another saved project is active.");
  }
  function captureIds() { ownIds = []; for (var i = 1; i <= app.project.numItems; i++) ownIds.push(app.project.item(i).id); }
  function guard() { ownProject(); if (app.project.activeItem !== comp) comp.openInViewer(); assert(app.project.activeItem === comp, "The QA composition is not active."); }
  function send(command, args) {
    guard(); var response = MotionJson.parse(MotionAE.dispatch(MotionJson.stringify({protocolVersion: 1, requestId: "gradient-audit-" + (++serial), command: command,
      args: args || {}, context: {host: "after-effects", hostVersion: app.version, locale: "en-US"}})));
    assert(response && typeof response.ok === "boolean", "Malformed host response."); return response;
  }
  function ok(response, why) { assert(response.ok, why + ": " + json(response.error)); return response.data; }
  function read() { return ok(send("ae.effect.gradient.read", {}), "Read"); }
  function select(layer) { for (var i = 1; i <= comp.numLayers; i++) comp.layer(i).selected = comp.layer(i).id === layer.id; }
  function apply(settings) { return ok(send("ae.effect.gradient", {action: "apply", settings: settings}), "Apply"); }
  function effect(layer) { var parade = layer.property("ADBE Effect Parade"), found = null; for (var i = 1; i <= parade.numProperties; i++) if (parade.property(i).matchName === fixture.abi.matchName) { assert(found === null, "Duplicate native gradient."); found = parade.property(i); } return found; }
  function compare(a, b, path) {
    if (typeof a === "number") { assert(typeof b === "number" && Math.abs(a - b) <= .00002, path + " numeric mismatch: " + a + "/" + b); return; }
    if (a && typeof a === "object") { for (var key in a) if (a.hasOwnProperty(key)) compare(a[key], b && b[key], path + "." + key); return; }
    assert(a === b, path + " mismatch.");
  }
  function cleanExpressions(group, times) {
    for (var i = 1; i <= group.numProperties; i++) {
      var p = group.property(i);
      if (p.propertyType !== PropertyType.PROPERTY) cleanExpressions(p, times);
      else if (p.canSetExpression && p.expressionEnabled) {
        for (var j = 0; j < times.length; j++) { p.valueAtTime(times[j], false); assert(!p.expressionError, "Expression error: " + p.name + " " + p.expressionError); }
      }
    }
  }
  function png(recipe, bits, requested, t) {
    guard(); var filename = recipe + "-" + bits + "bpc-request" + requested + "-" + t + "s.png", file = new File(out.fsName + "/" + filename);
    assert(!file.exists, "Evidence filename already exists.");
    assert(typeof comp.saveFrameToPng === "function", "saveFrameToPng is unavailable in this host.");
    var start = new Date().getTime(), size = 0, last = -1, stable = 0;
    comp.time = t; comp.saveFrameToPng(t, file);
    for (var i = 0; i < 150; i++) { size = Math.max(0, new File(file.fsName).length); stable = size > 0 && size === last ? stable + 1 : 0; if (stable >= 2) break; last = size; $.sleep(100); }
    assert(size > 8 && stable >= 2, "PNG did not finish: " + filename);
    result.renders.push({recipeId: recipe, bitsPerChannel: bits, requestedControlValue: requested, timeSeconds: t, filename: filename, bytes: size, milliseconds: new Date().getTime() - start});
    return filename;
  }
  function backendProperty(layer) { var fx = effect(layer), builtin = fx && fx.property("ADBE Effect Built In Params"); return builtin ? builtin.property("ADBE Force CPU GPU") : null; }
  function snapshot(recipe) { comp = recipe.comp; comp.openInViewer(); select(comp.layer(1)); comp.time = 0; return read().settings; }
  try {
    // No host load, output write or composition mutation before this refusal gate.
    assert(app.project && app.project.numItems === 0 && !app.project.file, "Use a new EMPTY UNSAVED project. No user project was modified.");
    var host = new File(repo + "/dist/after-effects-cep/host/index.jsx"), input = new File(repo + "/scripts/verify-gradient-tools-audit-fixtures.json");
    if(new File(repo+'/artifacts/tools-audit/use-installed-host.flag').exists)host=new File(Folder.userData.fsName+'/Adobe/CEP/extensions/com.motion.plugin.ae/host/index.jsx');
    assert(host.exists && input.exists, "Build the host and generate the recipe fixture first.");
    $.evalFile(host);
    input.encoding = "UTF-8"; assert(input.open("r"), "Cannot read recipe fixture."); var raw = input.read(); input.close(); fixture = MotionJson.parse(raw);
    assert(fixture.schemaVersion === 1 && fixture.recipes.length === 7 && fixture.abi.parameterCount === 54, "Unexpected recipe fixture.");
    for (var v = 0; v < fixture.recipes.length; v++) assert(fixture.recipes[v].args.settings.animation === "loop" && fixture.recipes[v].args.settings.duration === 6, "Expected six-second premium loops.");
    mkdir(base); out = new Folder(base.fsName + "/" + stamp); assert(!out.exists, "Run folder collision."); mkdir(out);
    result.recipeModuleSha256 = fixture.gradientModuleSha256; result.fixturePath = input.fsName; result.builtHostPath = host.fsName;
    result.fixtureGeometry = {width: 640, height: 360, pixelAspect: 1, duration: 7, fps: 30};
    result.initialBitsPerChannel = app.project.bitsPerChannel; result.projectGpuAccelType = String(app.project.gpuAccelType);
    entered = true; captureIds(); qaFile = new File(out.fsName + "/gradient-qa.aep"); save(); app.beginSuppressDialogs();
    for (var r = 0; r < fixture.recipes.length; r++) {
      var recipe = fixture.recipes[r], settings = recipe.args.settings;
      comp = app.project.items.addComp("Moti.on QA Gradient - " + recipe.id, 640, 360, 1, 7, 30); comp.openInViewer();
      var target = comp.layers.addSolid([1, 1, 1], "Moti.on QA Gradient source - " + recipe.id, 640, 360, 1, 7);
      target.comment = "Owned Moti.on tools audit " + stamp; comp.time = 0; select(target); captureIds();
      var record = {id: recipe.id, settings: settings, comp: comp, layerId: target.id}; recipes.push(record);
      (function (current, layer) {
        test(current.id + ": apply, exact read and idempotent repeat", function () {
          var before = comp.selectedLayers[0].id; apply(current.settings); var state = read();
          assert(state.appliedCount === 1 && state.selectionCount === 1 && state.capabilities.nativeAvailable, "Gradient did not apply.");
          compare(current.settings, state.settings, current.id); assert(apply(current.settings).changed === 0, "Repeat apply changed the recipe.");
          assert(layer.property("ADBE Effect Parade").numProperties === 1, "Repeat duplicated an effect.");
          assert(comp.selectedLayers.length === 1 && comp.selectedLayers[0].id === before && comp.time === 0, "Apply changed context.");
          return {layerId: layer.id, nativeProperties: effect(layer).numProperties, settings: state.settings};
        });
        test(current.id + ": targeted update, protected expression and removal/reapply", function () {
          var changed = MotionJson.parse(MotionJson.stringify(current.settings)); changed.angle += 13;
          var token = read().selectionToken;
          ok(send("ae.effect.gradient", {action: "update", settings: changed, changedKeys: ["angle"], selectionToken: token}), "Update");
          compare(changed, read().settings, "updated");
          var angle = effect(layer).property(6); angle.expression = "value"; angle.expressionEnabled = true;
          var blocked = MotionJson.parse(MotionJson.stringify(changed)); blocked.angle += 9;
          var response = send("ae.effect.gradient", {action: "update", settings: blocked, changedKeys: ["angle"]});
          assert(!response.ok && response.error.code === "EXPRESSION_CONFLICT", "Expression protection did not reject mutation.");
          assert(angle.expression === "value" && angle.expressionEnabled, "Protected expression changed.");
          cleanExpressions(layer, [0, 3, 6]); angle.expression = ""; angle.expressionEnabled = false;
          ok(send("ae.effect.gradient", {action: "remove", selectionToken: read().selectionToken}), "Remove");
          assert(!effect(layer) && read().appliedCount === 0, "Remove left a managed gradient.");
          apply(current.settings); compare(current.settings, read().settings, "reapplied");
          assert(layer.property("ADBE Effect Parade").numProperties === 1, "Reapply duplicated an effect.");
          return {reapplied: true, expressionProtection: response.error.code};
        });
      }(record, target));
    }
    var depths = [8, 16, 32], times = [0, 3, 6];
    for (var d = 0; d < depths.length; d++) {
      app.project.bitsPerChannel = depths[d];
      for (r = 0; r < recipes.length; r++) {
        record = recipes[r]; comp = record.comp; comp.openInViewer(); select(comp.layer(1));
        (function (current, bits) { test(current.id + ": native " + bits + " bpc renders 0/3/6", function () {
          var files = []; cleanExpressions(comp.layer(1), times);
          for (var ti = 0; ti < times.length; ti++) files.push(png(current.id, bits, 1, times[ti])); return {files: files};
        }); }(record, depths[d]));
      }
      comp = recipes[0].comp; comp.openInViewer(); select(comp.layer(1));
      var backend = backendProperty(comp.layer(1));
      if (!backend) result.backend.push({bitsPerChannel: depths[d], status: "NOT RUN", reason: "ADBE Force CPU GPU is unavailable."});
      else {
        result.backend.push({bitsPerChannel: depths[d], status: "CONTROL OBSERVED", name: backend.name, matchName: backend.matchName, originalValue: backend.value, actualBackend: "NOT RUN"});
        for (var mode = 2; mode <= 3; mode++) (function (bits, requested) {
          test("aurora: backend control request " + requested + " at " + bits + " bpc", function () {
            var p = backendProperty(comp.layer(1)); p.setValue(requested); assert(Number(p.value) === requested, "Backend control rejected the requested value.");
            var files = []; for (var ti = 0; ti < times.length; ti++) files.push(png("aurora", bits, requested, times[ti]));
            p.setValue(1); return {requestedControlValue: requested, actualBackend: "NOT RUN", pixelEquivalence: "NOT RUN", files: files};
          });
        }(depths[d], mode));
        backendProperty(comp.layer(1)).setValue(1);
      }
    }
    test("save and reopen the owned QA AEP preserves all seven editable recipes", function () {
      ownProject(); var before = [], after = [];
      for (var k = 0; k < recipes.length; k++) before.push(snapshot(recipes[k]));
      app.project.save(qaFile); result.project = qaFile.fsName; ownProject(); app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES); app.open(qaFile); ownProject();
      for (k = 0; k < recipes.length; k++) {
        var found = null; for (var n = 1; n <= app.project.numItems; n++) if (app.project.item(n) instanceof CompItem && app.project.item(n).name === "Moti.on QA Gradient - " + recipes[k].id) found = app.project.item(n);
        assert(found, "Saved recipe composition is missing."); recipes[k].comp = found; after.push(snapshot(recipes[k])); compare(before[k], after[k], "reopened " + recipes[k].id); cleanExpressions(comp.layer(1), times);
      }
      return {project: qaFile.fsName, recipeCount: recipes.length};
    });
    test("leave a new empty unsaved project after preserving the owned QA file", function () {
      ownProject(); assert(qaFile.exists && app.project.file && app.project.file.fsName.toLowerCase() === qaFile.fsName.toLowerCase(), "No owned saved QA project to close.");
      app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES); app.newProject();
      assert(app.project && app.project.numItems === 0 && !app.project.file, "Empty project restoration failed."); app.project.bitsPerChannel = result.initialBitsPerChannel;
      return {emptyUnsaved: true};
    });
  } catch (fatal) { result.fatal = String(fatal); result.line = fatal.line || null; }
  finally {
    if (entered) app.endSuppressDialogs(false);
    var passed = 0, failed = 0; for (var i = 0; i < result.tests.length; i++) { if (result.tests[i].status === "PASS") passed++; else failed++; }
    result.completed = true; result.status = !result.fatal && failed === 0 ? "PASS" : "FAIL"; result.summary = {pass: passed, fail: failed, total: result.tests.length, pngs: result.renders.length}; result.finishedAt = new Date().toString();
    if (out) save(); else $.writeln(json(result));
  }
}());
