// Sondagem das capacidades do After Effects para os Elementos animados.
// Rodar com o AE já aberto e o projeto do usuário salvo:
//   AfterFX.exe -r "<repo>\scripts\probe-elements-capabilities.jsx"
// Cria duas comps temporárias (pai e pré-comp), testa Trim Paths, Repetidor,
// Propriedades essenciais (texto e cor) vistas da comp pai e a importação de um
// WAV como camada de áudio; apaga tudo no fim. Não envia comandos do Moti.on e
// não salva o projeto. Saída: artifacts\elements-probe\result.json.
(function () {
  var repo = File($.fileName).parent.parent.fsName, out = new Folder(repo + "/artifacts/elements-probe");
  var r = {host: app.version, os: $.os, startedAt: new Date().toString(), steps: {}};
  var parent = null, inner = null, footage = null, previous = app.project.activeItem;
  function step(name, fn) { try { r.steps[name] = {ok: true, value: fn()}; } catch (e) { r.steps[name] = {ok: false, error: String(e), line: e.line || null}; } }
  function quote(s) { return '"' + String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "") + '"'; }
  function json(v) {
    if (v === null || v === undefined) return "null";
    if (typeof v === "number") return isFinite(v) ? String(v) : "null";
    if (typeof v === "boolean") return v ? "true" : "false";
    if (typeof v === "string") return quote(v);
    if (v instanceof Array) { var a = []; for (var i = 0; i < v.length; i++) a.push(json(v[i])); return "[" + a.join(",") + "]"; }
    var parts = []; for (var k in v) if (v.hasOwnProperty(k)) parts.push(quote(k) + ":" + json(v[k])); return "{" + parts.join(",") + "}";
  }
  function children(group) { var list = []; for (var i = 1; i <= group.numProperties; i++) { var p = group.property(i); list.push([p.matchName, p.name]); } return list; }
  app.beginSuppressDialogs();
  try {
    inner = app.project.items.addComp("Moti.on QA Elemento", 1280, 720, 1, 4, 30);
    parent = app.project.items.addComp("Moti.on QA Elemento pai", 1280, 720, 1, 4, 30);
    var text = null, shape = null, fill = null;
    step("text", function () { text = inner.layers.addText("Moti.on"); var doc = text.property("ADBE Text Properties").property("ADBE Text Document"); return {matchName: doc.matchName, value: String(doc.value.text), font: doc.value.font}; });
    step("shapeOperators", function () {
      shape = inner.layers.addShape(); var root = shape.property("ADBE Root Vectors Group");
      var group = root.addProperty("ADBE Vector Group"), contents = group.property("ADBE Vectors Group");
      contents.addProperty("ADBE Vector Shape - Ellipse"); contents.addProperty("ADBE Vector Graphic - Stroke");
      contents = shape.property("ADBE Root Vectors Group").property(1).property("ADBE Vectors Group");
      var trim = contents.addProperty("ADBE Vector Filter - Trim");
      contents = shape.property("ADBE Root Vectors Group").property(1).property("ADBE Vectors Group");
      var repeater = contents.addProperty("ADBE Vector Filter - Repeater");
      contents = shape.property("ADBE Root Vectors Group").property(1).property("ADBE Vectors Group");
      fill = contents.addProperty("ADBE Vector Graphic - Fill");
      contents = shape.property("ADBE Root Vectors Group").property(1).property("ADBE Vectors Group");
      var stroke = contents.property("ADBE Vector Graphic - Stroke");
      return {trim: children(contents.property("ADBE Vector Filter - Trim")), repeater: children(contents.property("ADBE Vector Filter - Repeater")),
        repeaterTransform: children(contents.property("ADBE Vector Filter - Repeater").property("ADBE Vector Repeater Transform")), stroke: children(stroke)};
    });
    step("essentialApi", function () {
      var doc = text.property("ADBE Text Properties").property("ADBE Text Document");
      return {canAdd: typeof doc.canAddToMotionGraphicsTemplate, addAs: typeof doc.addToMotionGraphicsTemplateAs, add: typeof doc.addToMotionGraphicsTemplate,
        controllerCount: typeof inner.motionGraphicsTemplateControllerCount, setName: typeof inner.setMotionGraphicsControllerName};
    });
    step("essentialAdd", function () {
      var doc = text.property("ADBE Text Properties").property("ADBE Text Document"), color = shape.property("ADBE Root Vectors Group").property(1).property("ADBE Vectors Group").property("ADBE Vector Graphic - Fill").property("ADBE Vector Fill Color");
      var a = doc.canAddToMotionGraphicsTemplate(inner), b = doc.addToMotionGraphicsTemplateAs(inner, "Título"), c = color.canAddToMotionGraphicsTemplate(inner), d = color.addToMotionGraphicsTemplateAs(inner, "Cor principal");
      var names = []; for (var i = 1; i <= inner.motionGraphicsTemplateControllerCount; i++) names.push(inner.getMotionGraphicsTemplateControllerName(i));
      return {canText: a, addedText: b, canColor: c, addedColor: d, controllers: names, templateName: inner.motionGraphicsTemplateName};
    });
    var layer = null;
    step("overrides", function () {
      layer = parent.layers.add(inner);
      var group = layer.property("ADBE Layer Overrides"), list = group ? children(group) : null;
      return {found: !!group, children: list};
    });
    step("overrideSet", function () {
      var group = layer.property("ADBE Layer Overrides"), textOverride = null, colorOverride = null;
      for (var i = 1; i <= group.numProperties; i++) { var p = group.property(i); if (p.name === "Título") textOverride = p; if (p.name === "Cor principal") colorOverride = p; }
      var doc = textOverride.value; doc.text = "Nome editado"; textOverride.setValue(doc); colorOverride.setValue([1, .2, .3]);
      var innerText = String(text.property("ADBE Text Properties").property("ADBE Text Document").value.text);
      return {overrideText: String(textOverride.value.text), innerText: innerText, overrideColor: colorOverride.value, textMatch: textOverride.matchName, colorMatch: colorOverride.matchName};
    });
    step("audioImport", function () {
      var file = new File(out.fsName + "/probe.wav"), options = new ImportOptions(file);
      var can = options.canImportAs(ImportAsType.FOOTAGE); footage = app.project.importFile(options);
      var audio = parent.layers.add(footage);
      return {canImport: can, hasAudio: footage.hasAudio, hasVideo: footage.hasVideo, duration: footage.duration, layerHasAudio: audio.hasAudio, audioEnabled: audio.audioEnabled, layerType: audio.matchName};
    });
  } catch (fatal) {
    r.fatal = String(fatal); r.line = fatal.line || null;
  } finally {
    try { if (parent) parent.remove(); } catch (a) {}
    try { if (inner) inner.remove(); } catch (b) {}
    try { if (footage) footage.remove(); } catch (c) {}
    if (previous instanceof CompItem) previous.openInViewer();
    app.endSuppressDialogs(false);
    r.finishedAt = new Date().toString();
    var f = new File(out.fsName + "/result.json"); f.encoding = "UTF-8"; f.open("w"); f.write(json(r)); f.close();
  }
})();
