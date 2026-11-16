// Disposable native AE fixture. Refuses any saved or nonempty project.
// Build first, then run through File > Scripts > Run Script File in AE.
// All project items created here are removed; the receipt and PNGs remain.
(function () {
  var repo = File($.fileName).parent.parent.fsName;
  var parent = new Folder(repo + "/artifacts/tools-audit");
  if (!parent.exists) parent.create();
  var out = new Folder(parent.fsName + "/parallax-native");
  if (!out.exists) out.create();
  var result = { host: app.version, build: app.buildName, os: $.os, startedAt: new Date().toString(), tests: [],
    notCovered: ["Undo/Redo em chamadas separadas: NOT RUN", "Salvar e reabrir: NOT RUN", "Inspecao visual das imagens PNG: NOT RUN"] };
  var comp = null, owned = [], prepared = false, oldEngine = null, serial = 0, planes = [], probes = [], original = [], reference = null;
  var rigArgs = { depthStep: 0, strength: 1, orderMode: "timeline", reverseOrder: false, createCamera: true, preserveFraming: true, controllerName: "QA Parallax" };
  function json(value) {
    if (value === null || value === undefined) return "null";
    if (typeof value === "number") return isFinite(value) ? String(value) : "null";
    if (typeof value === "boolean") return String(value);
    if (typeof value === "string") return "\"" + value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"").replace(/\r/g, "\\r").replace(/\n/g, "\\n").replace(/\t/g, "\\t") + "\"";
    var parts = [], i;
    if (value instanceof Array) { for (i = 0; i < value.length; i++) parts.push(json(value[i])); return "[" + parts.join(",") + "]"; }
    for (i in value) if (Object.prototype.hasOwnProperty.call(value, i)) parts.push(json(String(i)) + ":" + json(value[i]));
    return "{" + parts.join(",") + "}";
  }
  function save() {
    var file = new File(out.fsName + "/result.json"); file.encoding = "UTF-8";
    if (!file.open("w")) throw new Error("Nao foi possivel escrever o recibo de QA.");
    file.write(json(result)); file.close();
  }
  function assert(condition, message) { if (!condition) throw new Error(message); }
  function numbers(value) { var a = []; for (var i = 0; i < value.length; i++) a.push(Number(value[i])); return a; }
  function same(a, b, tolerance) {
    assert(a.length === b.length, "Dimensoes diferentes");
    for (var i = 0; i < a.length; i++) assert(Math.abs(a[i] - b[i]) <= tolerance, "Valor divergente: " + a[i] + " / " + b[i]);
  }
  function remember() {
    for (var i = 1; i <= app.project.numItems; i++) {
      var item = app.project.item(i), found = false;
      for (var j = 0; j < owned.length; j++) if (owned[j] === item.id) found = true;
      if (!found) owned.push(item.id);
    }
  }
  function test(name, fn) {
    try { var detail = fn(); result.tests.push({ name: name, status: "PASS", detail: detail || null }); }
    catch (error) { result.tests.push({ name: name, status: "FAIL", error: String(error), line: error.line || null }); }
    remember(); save();
  }
  function prop(layer, name) { return layer.property("ADBE Transform Group").property(name); }
  function select(list) { for (var i = 1; i <= comp.numLayers; i++) comp.layer(i).selected = false; for (i = 0; i < list.length; i++) list[i].selected = true; }
  function send(command, args, mode) {
    if (app.project.activeItem !== comp) comp.openInViewer();
    assert(app.project.activeItem === comp, "A composicao de QA nao esta ativa.");
    var response = MotionJson.parse(MotionAE.dispatch(MotionJson.stringify({ protocolVersion: 1, requestId: "parallax-audit-" + (++serial), command: command,
      args: args || {}, context: { host: "after-effects", hostVersion: app.version, locale: "pt-BR" },
      options: { mode: mode || "advanced", allowDestructive: true, preserveSelection: true } })));
    remember(); return response;
  }
  function ok(response) { assert(response && response.ok, json(response && (response.error || response))); return response; }
  function copyArgs(reverse) { var args = {}; for (var key in rigArgs) if (Object.prototype.hasOwnProperty.call(rigArgs, key)) args[key] = rigArgs[key]; args.reverseOrder = reverse; return args; }
  function depth(layer) { return Number(prop(layer, "ADBE Position").valueAtTime(0, true)[2]); }
  function removeKeys(property) { property.expression = ""; while (property.numKeys > 0) property.removeKey(property.numKeys); }
  function screens(time) {
    var samples = [];
    for (var i = 0; i < probes.length; i++) {
      var control = probes[i].layer.property("ADBE Effect Parade").property(probes[i].name).property(1);
      samples.push(numbers(control.valueAtTime(time, false)));
      assert(!control.expressionError, "Sonda: " + control.expressionError);
    }
    return samples;
  }
  function shift(a, b) {
    var worst = 0;
    for (var i = 0; i < a.length; i++) worst = Math.max(worst, Math.sqrt(Math.pow(a[i][0] - b[i][0], 2) + Math.pow(a[i][1] - b[i][1], 2)));
    return worst;
  }
  function image(name) {
    var file = new File(out.fsName + "/" + name + ".png");
    comp.saveFrameToPng(0, file); return file.fsName;
  }
  app.beginSuppressDialogs();
  try {
    if (!app.project || app.project.numItems !== 0 || app.project.file !== null) {
      result.fatal = "Abra um projeto novo, vazio e nao salvo. Nenhum item foi alterado."; return;
    }
    prepared = true; oldEngine = app.project.expressionEngine;
    var bundle = new File(repo + "/dist/after-effects-cep/host/index.jsx");
    if(new File(repo+'/artifacts/tools-audit/use-installed-host.flag').exists)bundle=new File(Folder.userData.fsName+'/Adobe/CEP/extensions/com.motion.plugin.ae/host/index.jsx');
    assert(bundle.exists, "Build de host ausente.");
    result.bundle = { path: bundle.fsName, bytes: bundle.length, modified: bundle.modified.toString() };
    $.evalFile(bundle);
    result.pluginVersion = MotionContracts.PLUGIN_VERSION;
    app.project.expressionEngine = "javascript-1.0";
    comp = app.project.items.addComp("Moti.on QA Parallax audit", 1920, 1080, 1, 8, 30);
    comp.renderer = "ADBE Advanced 3d"; comp.openInViewer();
    var positions = [[1350, 250], [420, 780], [1160, 680]], scales = [[-70, 130], [84, 92], [125, 70]];
    for (var i = 0; i < 3; i++) {
      var layer = comp.layers.addSolid([0.18 + i * 0.2, 0.32 + i * 0.1, 0.52], "QA Plane " + i, 500 + i * 80, 300 + i * 50, 1, comp.duration);
      prop(layer, "ADBE Position").setValue(positions[i]); prop(layer, "ADBE Scale").setValue(scales[i]);
      prop(layer, "ADBE Anchor Point").setValue([40 + i * 20, 90 - i * 15]); prop(layer, "ADBE Rotate Z").setValue(23 - i * 13);
      planes.push(layer);
    }
    planes.sort(function (a, b) { return a.index - b.index; });
    var probe = comp.layers.addNull(comp.duration); probe.name = "QA Screen Probes"; probe.guideLayer = true;
    for (i = 0; i < planes.length; i++) {
      layer = planes[i]; original.push({ position: numbers(prop(layer, "ADBE Position").value), scale: numbers(prop(layer, "ADBE Scale").value), anchor: numbers(prop(layer, "ADBE Anchor Point").value), rotation: Number(prop(layer, "ADBE Rotate Z").value) });
      var corners = [[0, 0], [layer.width, 0], [layer.width, layer.height], [0, layer.height]];
      for (var c = 0; c < corners.length; c++) {
        var effect = probe.property("ADBE Effect Parade").addProperty("ADBE Point Control"), effectName = "Screen " + i + " " + c; effect.name = effectName;
        effect.property(1).expression = "thisComp.layer(" + json(layer.name) + ").toComp([" + corners[c][0] + "," + corners[c][1] + ",0]).slice(0,2)";
        probes.push({ layer: probe, name: effectName });
      }
    }
    remember(); select(planes); reference = screens(0); result.referenceImage = image("before");
    test("Rig only: timeline top nearest, native corner framing and no camera keys", function () {
      var created = ok(send("ae.animate.parallax.quick", rigArgs, "quick"));
      assert(created.data.motionApplied === false, "Movimento aplicado automaticamente");
      assert(depth(planes[0]) < depth(planes[1]) && depth(planes[1]) < depth(planes[2]), "Ordem de profundidade incorreta");
      var delta = shift(reference, screens(0)); assert(delta <= 0.5, "Enquadramento mudou " + delta + " px");
      var camera = comp.activeCamera; assert(camera && camera.parent, "Camera ou controle ausente");
      assert(prop(camera, "ADBE Position").numKeys === 0 && prop(camera.parent, "ADBE Position").numKeys === 0, "Camera animada automaticamente");
      result.rigImage = image("rig"); return { maxErrorPx: delta, depths: [depth(planes[0]), depth(planes[1]), depth(planes[2])], layers: comp.numLayers };
    });
    test("Quick repeated does not duplicate or double-compensate", function () {
      var count = comp.numLayers; ok(send("ae.animate.parallax.quick", rigArgs, "quick")); assert(comp.numLayers === count, "Rig duplicado");
      var delta = shift(reference, screens(0)); assert(delta <= 0.5, "Compensacao acumulada"); return { maxErrorPx: delta };
    });
    test("Timeline reorder and explicit reverse keep off-center projection", function () {
      planes[2].moveToBeginning(); select(planes); ok(send("ae.parallax.adjust", copyArgs(false)));
      assert(depth(planes[2]) < depth(planes[0]) && depth(planes[0]) < depth(planes[1]), "Ajustar ignorou a ordem atual");
      ok(send("ae.parallax.adjust", copyArgs(true)));
      assert(depth(planes[1]) < depth(planes[0]) && depth(planes[0]) < depth(planes[2]), "Inversao ignorada");
      var delta = shift(reference, screens(0)); assert(delta <= 0.5, "Reordenacao mudou o enquadramento"); return { maxErrorPx: delta };
    });
    test("External camera refuses preflight without partial mutations", function () {
      var external = comp.layers.addCamera("QA External Camera", [960, 540]); remember(); var count = comp.numLayers;
      var response = send("ae.parallax.adjust", copyArgs(false)); assert(!response.ok, "Camera externa foi adotada"); assert(comp.numLayers === count, "Falha criou itens");
      external.remove(); select(planes); return { code: response.error.code };
    });
    test("Focus, time-bounded zoom and faithful native bake", function () {
      var camera = comp.activeCamera, zoom = camera.property("ADBE Camera Options Group").property("ADBE Camera Zoom");
      ok(send("ae.parallax.auto-focus", { targetLayerName: planes[0].name, focusOffset: 0, enableDepthOfField: true }));
      var focus = camera.property("ADBE Camera Options Group").property("ADBE Camera Focus Distance"); focus.valueAtTime(0, false); assert(!focus.expressionError, focus.expressionError);
      comp.time = 7.9; var rejected = send("ae.parallax.zoom", { zoomLevel: 3200, durationFrames: 30 }); assert(!rejected.ok && zoom.numKeys === 0, "Zoom fora da composicao aceito");
      comp.time = 0; ok(send("ae.parallax.zoom", { zoomLevel: 3200, durationFrames: 30 })); assert(zoom.numKeys === 2, "Zoom sem chaves nativas");
      removeKeys(zoom); zoom.setValue(3000);
      ok(send("ae.parallax.wiggle", { frequency: 0.6, amplitude: 12, seed: 7 }));
      var position = prop(camera, "ADBE Position"), before = [], times = [0, 1 / 30, 2 / 30, 0.2];
      comp.workAreaStart = 0; comp.workAreaDuration = 0.2;
      for (var t = 0; t < times.length; t++) before.push(numbers(position.valueAtTime(times[t], false)));
      select([camera]); ok(send("ae.parallax.bake", { stepFrames: 1 })); assert(!position.expression && position.numKeys >= 7, "Bake incompleto");
      for (t = 0; t < times.length; t++) same(before[t], numbers(position.valueAtTime(times[t], false)), 0.5);
      var count = position.numKeys; removeKeys(position); position.setValue([0, 0, -3000]); select(planes);
      return { focusDistance: Number(focus.valueAtTime(0, false)), bakedKeys: count, endpoint: 0.2 };
    });
    test("Remove restores original planar data and removes only rig artifacts", function () {
      select(planes); ok(send("ae.parallax.remove", {})); assert(comp.numLayers === 4, "Objetos de rig sobraram ou planos foram removidos");
      for (var p = 0; p < planes.length; p++) {
        assert(!planes[p].threeDLayer, "Plano permaneceu 3D"); same(numbers(prop(planes[p], "ADBE Position").value), original[p].position, 0.001);
        same(numbers(prop(planes[p], "ADBE Scale").value), original[p].scale, 0.001); same(numbers(prop(planes[p], "ADBE Anchor Point").value), original[p].anchor, 0.001);
        assert(Math.abs(Number(prop(planes[p], "ADBE Rotate Z").value) - original[p].rotation) < 0.001, "Rotacao alterada");
      }
      var delta = shift(reference, screens(0)); assert(delta <= 0.5, "Remocao mudou projecao"); return { maxErrorPx: delta, userPlanes: planes.length };
    });
  } catch (error) { result.fatal = String(error); result.fatalLine = error.line || null; }
  finally {
    if (prepared) {
      remember();
      try { if (comp) comp.remove(); } catch (compError) { result.cleanupError = String(compError); }
      for (var n = owned.length - 1; n >= 0; n--) {
        for (var index = app.project.numItems; index >= 1; index--) {
          var item = app.project.item(index);
          if (item.id === owned[n]) { try { item.remove(); } catch (itemError) { result.cleanupError = String(itemError); } break; }
        }
      }
      if (oldEngine !== null) { try { app.project.expressionEngine = oldEngine; } catch (engineError) { result.cleanupError = String(engineError); } }
      result.remainingProjectItems = app.project.numItems;
    }
    result.finishedAt = new Date().toString(); result.passCount = 0; result.failCount = 0;
    for (var r = 0; r < result.tests.length; r++) if (result.tests[r].status === "PASS") result.passCount++; else result.failCount++;
    result.status = !result.fatal && !result.cleanupError && result.failCount === 0 && result.tests.length === 6 && result.remainingProjectItems === 0 ? "PASS" : "FAIL";
    save(); app.endSuppressDialogs(false);
  }
}());
