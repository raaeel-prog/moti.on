// Prepares an owned render fixture only. Execute aerender separately; never controls mouse/keyboard.
(function () {
  var root = "C:/dev/Moti.on/implementation", base = root + "/artifacts/particles-rising-20261031";
  var configFile = new File(base + "/render-request.json"); configFile.open("r"); var configText = configFile.read(); configFile.close();
  var hostFile = new File(Folder.userData.fsName + "/Adobe/CEP/extensions/com.motion.plugin.ae/host/index.jsx"); $.evalFile(hostFile);
  var config = MotionJson.parse(configText), out = config.output, fixture = new File(out + "/particles.aep");
  var report = {runId: config.runId, status: "PREPARING", host: app.version, loadedHost: {path: hostFile.fsName, bytes: hostFile.length}, jobs: [], tests: []};
  function save() { var f = new File(out + "/preparation.json"); f.encoding = "UTF-8"; f.open("w"); f.write(MotionJson.stringify(report)); f.close(); }
  function assert(value, message) { if (!value) throw new Error(message); }
  if (!app.project || app.project.file || app.project.numItems !== 0) { report.status = "BLOCKED"; report.reason = "An empty unsaved project is required; user project was not changed."; save(); return; }
  var owned = [], serial = 0, comps = [], originalSettings = [];
  function remember() { owned = []; for (var i = 1; i <= app.project.numItems; i++) owned.push(app.project.item(i).id); }
  function own() { for (var i = 1; i <= app.project.numItems; i++) { var found = false; for (var j = 0; j < owned.length; j++) if (app.project.item(i).id === owned[j]) found = true; assert(found, "Fixture ownership changed"); } }
  function send(comp, command, args) {
    comp.openInViewer(); var r = MotionJson.parse(MotionAE.dispatch(MotionJson.stringify({protocolVersion: 1, requestId: "particle-render-" + (++serial), command: command, args: args || {}, context: {host: "after-effects", hostVersion: app.version}, options: {preserveSelection: true}})));
    assert(r.ok, MotionJson.stringify(r.error)); remember(); return r.data;
  }
  function layerById(comp, id) { for (var i = 1; i <= comp.numLayers; i++) if (comp.layer(i).id === id) return comp.layer(i); return null; }
  function make(label, angle, width, height, controlled, inline, velocity) {
    var comp = app.project.items.addComp(label, width, height, 1, 8, 30), args = {mode: "rising", direction: angle, spread: controlled ? 0 : 10, precompose: !inline}; remember();
    if (controlled) { args.birthRate = 10; args.size = 0.03; args.velocity = velocity; args.opacity = 100; args.streams = []; for (var n = 0; n < 4; n++) args.streams.push({amount: n === 0 ? 1 : 0, size: 1, opacity: 100, color: [1,1,1], movement: 1}); }
    var data = send(comp, "ae.effect.particles", args), inner = inline ? comp : comp.layer(1).source;
    assert(inline ? comp.numLayers === 5 : comp.numLayers === 1 && inner.numLayers === 5, "Unexpected precomp structure");
    var controller = layerById(inner, data.controllerLayerId); assert(controller, "Controller missing");
    if (controlled) {
      var birth = controller.property("ADBE Effect Parade").property("Moti.on Particles birthRate").property(1);
      birth.setValueAtTime(0, 10); birth.setValueAtTime(0.1, 0); birth.setInterpolationTypeAtKey(1, KeyframeInterpolationType.HOLD); birth.setInterpolationTypeAtKey(2, KeyframeInterpolationType.HOLD);
      for (var i = 1; i <= inner.numLayers; i++) { var effects = inner.layer(i).property("ADBE Effect Parade"); for (var e = 1; e <= effects.numProperties; e++) if (effects.property(e).matchName === "CC Particle World") {
        var effect = effects.property(e), pairs = [["0007",0],["0008",0],["0009",0],["0010",0.04],["0011",0.04],["0012",0]];
        for (var p = 0; p < pairs.length; p++) { var property = effect.property("CC Particle World-" + pairs[p][0]); if (property.expression) property.expression = ""; property.setValue(pairs[p][1]); }
      }}
    }
    var read = send(comp, "ae.effect.particles.read", {}); assert(read.settings.direction === angle, "Direction read mismatch");
    comps.push(comp); originalSettings.push({name: label, rigId: read.rigId, angle: angle, inline: inline}); return comp;
  }
  function queue(comp, label, seconds) {
    var item = app.project.renderQueue.items.add(comp), module = item.outputModule(1), templates = module.templates, template = null;
    for (var i = 0; i < templates.length; i++) if (/tiff/i.test(templates[i])) template = templates[i];
    assert(template, "TIFF with alpha output template unavailable"); module.applyTemplate(template); module.file = new File(out + "/" + label + "_[#####].tif"); item.timeSpanStart = seconds; item.timeSpanDuration = comp.frameDuration; item.render = true;
    report.jobs.push({label: label, comp: comp.name, time: seconds, file: out + "/" + label + "_" + ("00000" + Math.round(seconds * comp.frameRate)).slice(-5) + ".tif", width: comp.width, height: comp.height});
  }
  try {
    for (var a = 0; a < 5; a++) { var angle = [0,90,180,270,45][a], comp = make("Direction " + angle, angle, 640, 360, true, false, 0.12); queue(comp, "direction-" + angle + "-a", 1); queue(comp, "direction-" + angle + "-b", 1.2); }
    var inline = make("Inline reference", 0, 640, 360, true, true, 0.12); queue(inline, "inline-a", 1); queue(inline, "inline-b", 1.2);
    var still = make("Zero velocity", 0, 640, 360, true, false, 0); queue(still, "still-a", 1); queue(still, "still-b", 1.2);
    var portrait = make("Portrait default", 0, 360, 640, false, false, 0); queue(portrait, "portrait", 3);
    var landscape = make("Landscape default", 0, 640, 360, false, false, 0); queue(landscape, "landscape", 3);
    // Only direction is patched. The controlled birth-rate keyframes must survive it.
    var target = comps[0], read = send(target, "ae.effect.particles.read", {});
    send(target, "ae.effect.particles", {mode: "rising", direction: 225, changedFields: ["direction"], targetRigId: read.rigId, targetCompId: target.id});
    assert(send(target, "ae.effect.particles.read", {}).settings.direction === 225, "Outer precomp patch failed");
    send(target, "ae.effect.particles", {mode: "rising", direction: 0, changedFields: ["direction"], targetRigId: read.rigId, targetCompId: target.id});
    report.tests.push({name: "outer precomp direction adjustment", status: "PASS"});
    own(); app.project.save(fixture); app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES); app.open(fixture); remember();
    for (var s = 0; s < originalSettings.length; s++) {
      var expected = originalSettings[s], reopened = null;
      for (var j = 1; j <= app.project.numItems; j++) if (app.project.item(j) instanceof CompItem && app.project.item(j).name === expected.name) reopened = app.project.item(j);
      assert(reopened, "Saved composition missing"); var current = send(reopened, "ae.effect.particles.read", {});
      assert(current.rigId === expected.rigId && current.settings.direction === expected.angle, "Rig identity or direction changed after reopen");
      assert(expected.inline ? reopened.numLayers === 5 : reopened.numLayers === 1 && reopened.layer(1).source.numLayers === 5, "Rig structure changed after reopen");
    }
    report.tests.push({name: "save/reopen identity, direction and structure", status: "PASS", compositions: originalSettings.length});
    app.project.save(fixture); report.fixture = fixture.fsName; report.status = "PREPARED";
  } catch (error) { report.status = "FAIL"; report.error = String(error); report.line = error.line; }
  finally {
    try { own(); app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES); app.newProject(); report.remainingItems = app.project.numItems; } catch (error) { report.cleanupError = String(error); report.status = "FAIL"; }
    report.completed = true; save();
  }
}());
