// Verificacao no After Effects (Windows) dos 4 efeitos nativos do MotionCore.aex.
// Rodar com: AfterFX.exe -r "<repo>\scripts\verify-ae-native.jsx"
// (projeto descartavel, nada e salvo). Saida: artifacts\ae-native-verify\result.json
// e um PNG por efeito. Tambem roda no macOS (afterfx -r / File > Scripts).
(function () {
  var here = Folder(File($.fileName).parent.parent.fsName + "/artifacts/ae-native-verify");
  if (!here.exists) here.create();
  var effects = [
    { name: "Moti.on Glitch Core", match: "CHMS Motion Core" },
    { name: "Moti.on Wave Core", match: "CHMS Wave Core" },
    { name: "Moti.on Native Transition", match: "Moti.on Native Transition" },
    { name: "Moti.on Gradient", match: "Moti.on Gradient" }
  ];
  var lines = [];
  function q(s) { return '"' + String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r?\n/g, " ") + '"'; }

  function registered(match) {
    for (var i = 0; i < app.effects.length; i++) {
      if (app.effects[i].matchName === match) return app.effects[i];
    }
    return null;
  }

  function renderFrame(comp, file) {
    if (file.exists) file.remove();
    comp.saveFrameToPng(0.5, file);
    for (var t = 0; t < 100 && !file.exists; t++) $.sleep(100);
    $.sleep(300);
    return file.exists ? file.length : 0;
  }

  app.beginSuppressDialogs();
  try {
    app.newProject();
    var comp = app.project.items.addComp("MotiOn Verify", 320, 180, 1, 2, 30);
    var base = comp.layers.addSolid([0.2, 0.4, 0.8], "Base", 320, 180, 1, 2);
    var baseSize = renderFrame(comp, File(here.fsName + "/frame-base.png"));
    lines.push('"ae":{"version":' + q(app.version) + ',"buildName":' + q(app.buildName) + '},');
    lines.push('"baseFrameBytes":' + baseSize + ',');
    lines.push('"effects":[');
    for (var e = 0; e < effects.length; e++) {
      var spec = effects[e], info = registered(spec.match), entry = '{"name":' + q(spec.name) + ',"matchName":' + q(spec.match);
      entry += ',"registered":' + (info ? "true" : "false");
      if (info) entry += ',"displayName":' + q(info.displayName) + ',"category":' + q(info.category);
      var applied = false, err = "", bytes = 0;
      try {
        var fx = base.property("ADBE Effect Parade").addProperty(spec.match);
        applied = fx !== null;
        bytes = renderFrame(comp, File(here.fsName + "/frame-" + e + ".png"));
        fx.remove();
      } catch (x) { err = x.toString(); }
      entry += ',"applied":' + applied + ',"frameBytes":' + bytes + ',"error":' + q(err) + '}';
      lines.push(entry + (e < effects.length - 1 ? "," : ""));
    }
    lines.push("]");
  } catch (fatal) {
    lines.push('"fatal":' + q(fatal.toString()));
  }
  app.endSuppressDialogs(false);
  var out = File(here.fsName + "/result.json");
  out.encoding = "UTF-8";
  out.open("w");
  out.write("{" + lines.join("\n") + "}\n");
  out.close();
  app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);
})();
