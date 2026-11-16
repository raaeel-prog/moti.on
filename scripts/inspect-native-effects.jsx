// Inventário dos efeitos nativos do After Effects para looks e revelações.
// Rodar com o AE já aberto e o projeto do usuário salvo:
//   AfterFX.exe -r "<repo>\scripts\inspect-native-effects.jsx"
// 1. Lista app.effects (somente leitura).
// 2. Para cada candidato, aplica o efeito num sólido de uma comp temporária, lê
//    índice, nome, matchName, tipo e valor padrão de cada parâmetro e remove tudo.
// Não envia comandos do Moti.on e não salva o projeto.
// Saída: artifacts\native-effects\inventory.json.
(function () {
  var repo = File($.fileName).parent.parent.fsName, out = new Folder(repo + "/artifacts/native-effects");
  if (!out.exists) out.create();
  var candidates = ["ADBE Linear Wipe", "ADBE Radial Wipe", "ADBE Venetian Blinds", "ADBE Block Dissolve", "ADBE IRIS", "ADBE Iris Wipe",
    "ADBE Gradient Wipe", "ADBE Card Wipe", "CC Grid Wipe", "CC Radial ScaleWipe", "CC Scale Wipe", "CC Line Sweep", "CC Jaws", "CC Light Wipe", "CC Twister",
    "ADBE Noise", "VISINF Grain Implant", "ADBE Posterize", "ADBE Posterize Time", "ADBE Find Edges", "ADBE Threshold2", "ADBE Tint",
    "ADBE Photo Filter", "ADBE CurvesCustom", "ADBE HUE SATURATION", "ADBE Brightness & Contrast 2", "CC Vignette", "CC Ball Action",
    "ADBE Mosaic", "ADBE Grid", "ADBE Turbulent Displace", "ADBE Wave Warp", "ADBE Bulge", "ADBE Optics Compensation", "ADBE Glo2",
    "ADBE Box Blur2", "ADBE Gaussian Blur 2", "ADBE Shift Channels", "CC Color Offset", "ADBE Fractal Noise", "ADBE Exposure2",
    "ADBE Black&White", "ADBE Color Balance 2", "ADBE Easy Levels2", "ADBE Vibrance", "ADBE Fill", "ADBE Ramp", "ADBE Displacement Map",
    "ADBE Lens Blur", "ADBE Sharpen", "ADBE Unsharp Mask", "ADBE Venetian Blinds", "CC Kernel", "ADBE Roughen Edges", "ADBE Stroke",
    "ADBE Channel Mixer", "ADBE Color Key", "ADBE Set Matte3", "ADBE Echo", "ADBE Drop Shadow", "ADBE Radial Shadow", "ADBE Motion Blur",
    "CC Force Motion Blur", "ADBE Transform", "ADBE Offset", "ADBE Strobe", "CC Toner", "ADBE Leave Color", "ADBE Change Color",
    "ADBE Scatter", "ADBE Write-on", "ADBE Cell Pattern", "ADBE Checkerboard", "ADBE Brush Strokes", "ADBE Cartoonify", "ADBE Emboss",
    "ADBE Texturize", "ADBE Color Emboss", "ADBE Glo2", "CC Light Rays", "CC Light Sweep", "ADBE Lens Flare"];
  var result = {host: app.version, os: $.os, startedAt: new Date().toString(), available: [], parameters: {}, missing: []};
  var comp = null, layer = null, source = null, previous = app.project.activeItem;
  function write() { var f = new File(out.fsName + "/inventory.json"); f.encoding = "UTF-8"; f.open("w"); f.write(jsonish(result)); f.close(); }
  function quote(s) { return '"' + String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "") + '"'; }
  function jsonish(v) {
    if (v === null || v === undefined) return "null";
    if (typeof v === "number") return isFinite(v) ? String(v) : "null";
    if (typeof v === "boolean") return v ? "true" : "false";
    if (typeof v === "string") return quote(v);
    if (v instanceof Array) { var a = []; for (var i = 0; i < v.length; i++) a.push(jsonish(v[i])); return "[" + a.join(",") + "]"; }
    var parts = []; for (var k in v) if (v.hasOwnProperty(k)) parts.push(quote(k) + ":" + jsonish(v[k])); return "{" + parts.join(",") + "}";
  }
  function typeName(t) { var names = ["NO_VALUE", "ThreeD_SPATIAL", "ThreeD", "TwoD_SPATIAL", "TwoD", "OneD", "COLOR", "CUSTOM_VALUE", "MARKER", "LAYER_INDEX", "MASK_INDEX", "SHAPE", "TEXT_DOCUMENT"];
    for (var i = 0; i < names.length; i++) if (PropertyValueType[names[i]] === t) return names[i]; return String(t); }
  app.beginSuppressDialogs();
  try {
    for (var e = 0; e < app.effects.length; e++) { var fx = app.effects[e]; result.available.push([fx.matchName, fx.displayName, fx.category]); }
    comp = app.project.items.addComp("Moti.on QA Inventário de efeitos", 400, 400, 1, 2, 30);
    layer = comp.layers.addSolid([.5, .5, .5], "inventario", 400, 400, 1, 2); source = layer.source;
    var parade = layer.property("ADBE Effect Parade"), seen = {};
    for (var c = 0; c < candidates.length; c++) {
      var name = candidates[c]; if (seen[name]) continue; seen[name] = true;
      if (!parade.canAddProperty(name)) { result.missing.push(name); continue; }
      var effect = parade.addProperty(name), params = [];
      for (var p = 1; p <= effect.numProperties; p++) {
        var prop = effect.property(p), entry = {index: p, name: prop.name, matchName: prop.matchName};
        try { entry.type = typeName(prop.propertyValueType); } catch (noType) { entry.type = "group"; }
        try { var v = prop.value; entry.value = v instanceof Array ? v : typeof v === "number" || typeof v === "boolean" ? v : String(v); } catch (noValue) {}
        try { if (prop.hasMin) entry.min = prop.minValue; if (prop.hasMax) entry.max = prop.maxValue; } catch (noRange) {}
        try { if (prop.isDropdownEffect) entry.dropdown = true; } catch (noDropdown) {}
        params.push(entry);
      }
      result.parameters[name] = {displayName: effect.name, parameters: params};
      effect.remove();
    }
  } catch (fatal) {
    result.fatal = String(fatal); result.line = fatal.line || null;
  } finally {
    try { if (comp) comp.remove(); } catch (ignored) {}
    try { if (source) source.remove(); } catch (gone) {}
    if (previous instanceof CompItem) previous.openInViewer();
    app.endSuppressDialogs(false);
    result.finishedAt = new Date().toString();
    write();
  }
})();
