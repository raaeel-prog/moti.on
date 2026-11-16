/* Isolated probe for the centred text rig: how animators combine an Anchor
 * Point and a Position, whether an expressible selector may exceed 100%, how
 * line breaks are counted, and the justification an expression reads.
 * Writes artifacts/text-presets/pivot-probe.json. Never runs against a populated project. */
(function () {
  var root = File($.fileName).parent.parent.fsName.replace(/\\/g, "/");
  var target = File(root + "/artifacts/text-presets/pivot-probe.json");
  var report = { status: "RUNNING", version: app.version, cases: [], counts: [], justification: [], errors: [] };
  function write() { target.encoding = "UTF-8"; if (!target.open("w")) { throw new Error("Evidence write unavailable: " + target.error); } target.write($.global.MotionJson.stringify(report)); target.close(); }
  function round(v) { return Math.round(v * 100) / 100; }
  function box(layer, t) { var r = layer.sourceRectAtTime(t || 0, false); return { left: round(r.left), top: round(r.top), right: round(r.left + r.width), bottom: round(r.top + r.height) }; }
  var JUST;
  function text(comp, value, justification) {
    var layer = comp.layers.addText(value), source = layer.property("ADBE Text Properties").property("ADBE Text Document"), document = source.value;
    document.font = "Arial-BoldMT"; document.fontSize = 100; document.applyFill = true; document.applyStroke = false; document.fillColor = [1, 1, 1];
    document.justification = JUST[justification || "left"]; source.setValue(document); return layer;
  }
  function animator(layer, properties, selectorExpression, rangeType) {
    var a = layer.property("ADBE Text Properties").property("ADBE Text Animators").addProperty("ADBE Text Animator"), group = a.property("ADBE Text Animator Properties"), key;
    for (key in properties) { if (properties.hasOwnProperty(key)) { group.addProperty(key).setValue(properties[key]); } }
    if (selectorExpression) {
      var selector = a.property("ADBE Text Selectors").addProperty("ADBE Text Expressible Selector");
      if (rangeType) { selector.property("ADBE Text Range Type2").setValue(rangeType); }
      selector.property("ADBE Text Expressible Amount").expression = selectorExpression;
    } else { a.property("ADBE Text Selectors").addProperty("ADBE Text Selector"); }
    return a;
  }
  function grouping(layer, value) { layer.property("ADBE Text Properties").property("ADBE Text More Options").property("ADBE Text Anchor Point Option").setValue(value); }
  function record(name, layer) { report.cases.push({ name: name, box: box(layer) }); layer.remove(); }
  try {
    $.evalFile(File(root + "/apps/after-effects-cep/host/src/json.jsx"));
    if (!app.project || app.project.numItems !== 0 || app.project.file) { report.status = "ABORTED_USER_PROJECT_GUARD"; write(); return; }
    JUST = { left: ParagraphJustification.LEFT_JUSTIFY, center: ParagraphJustification.CENTER_JUSTIFY, right: ParagraphJustification.RIGHT_JUSTIFY };
    app.beginSuppressDialogs();
    var comp = app.project.items.addComp("Moti.on isolated pivot probe", 1920, 1080, 1, 4, 30), layer;
    comp.openInViewer();
    // One glyph so the box is the glyph's own.
    layer = text(comp, "H"); record("rest", layer);
    layer = text(comp, "H"); animator(layer, { "ADBE Text Scale 3D": [50, 50, 100] }); record("scale50", layer);
    layer = text(comp, "H"); animator(layer, { "ADBE Text Anchor Point 3D": [0, -36, 0], "ADBE Text Position 3D": [0, -36, 0] }); record("rig-only", layer);
    layer = text(comp, "H"); animator(layer, { "ADBE Text Anchor Point 3D": [0, -36, 0], "ADBE Text Position 3D": [0, -36, 0] }); animator(layer, { "ADBE Text Scale 3D": [50, 50, 100] }); record("rig+scale50", layer);
    layer = text(comp, "H"); animator(layer, { "ADBE Text Scale 3D": [50, 50, 100] }); animator(layer, { "ADBE Text Anchor Point 3D": [0, -36, 0], "ADBE Text Position 3D": [0, -36, 0] }); record("scale50+rig", layer);
    layer = text(comp, "H"); animator(layer, { "ADBE Text Anchor Point 3D": [0, -36, 0], "ADBE Text Position 3D": [0, -36, 0] }); animator(layer, { "ADBE Text Rotation": 90 }); record("rig+rot90", layer);
    layer = text(comp, "H"); animator(layer, { "ADBE Text Rotation": 90 }); record("rot90", layer);
    layer = text(comp, "H"); animator(layer, { "ADBE Text Anchor Point 3D": [0, -36, 0] }); record("anchor-only", layer);
    layer = text(comp, "H"); animator(layer, { "ADBE Text Anchor Point 3D": [0, -36, 0] }, "50"); record("anchor-only-50", layer);
    layer = text(comp, "H"); animator(layer, { "ADBE Text Scale 3D": [50, 50, 100] }); animator(layer, { "ADBE Text Scale 3D": [50, 50, 100] }); record("scale50x2", layer);
    layer = text(comp, "H"); animator(layer, { "ADBE Text Position 3D": [0, -100, 0] }, "300"); record("amount300", layer);
    layer = text(comp, "H"); animator(layer, { "ADBE Text Position 3D": [0, -100, 0] }, "-250"); record("amount-250", layer);
    layer = text(comp, "H"); layer.threeDPerChar = true; animator(layer, { "ADBE Text Anchor Point 3D": [0, -36, 0], "ADBE Text Position 3D": [0, -36, 0] }); animator(layer, { "ADBE Text Rotation X": 90 }); record("rig+rotX90-3d", layer);
    // Line breaks the characters mode counts.
    var samples = [["return", "AB\rCD"], ["etx", "AB\u0003CD"], ["newline", "AB\nCD"], ["tab", "AB\tCD"]], s, n;
    for (s = 0; s < samples.length; s++) {
      layer = text(comp, samples[s][1]); var rest = box(layer), a = animator(layer, { "ADBE Text Position 3D": [0, -500, 0] }, "0", 1), amount = a.property("ADBE Text Selectors").property(1).property("ADBE Text Expressible Amount");
      var total = -1; for (n = 1; n <= 8; n++) { amount.expression = "textTotal==" + n + "?100:0"; if (box(layer).top < rest.top - 100) { total = n; break; } }
      amount.expression = "text.sourceText.length==" + samples[s][1].length + "?100:0";
      report.counts.push({ name: samples[s][0], textTotal: total, sourceLengthSeen: box(layer).top < rest.top - 100, restHeight: round(rest.bottom - rest.top) });
      layer.remove();
    }
    // The justification string an expression reads, through a text layer.
    var sides = ["left", "center", "right"];
    for (s = 0; s < sides.length; s++) {
      layer = text(comp, "AB", sides[s]); layer.name = "Probe " + sides[s];
      var reader = comp.layers.addText("x"), sourceText = reader.property("ADBE Text Properties").property("ADBE Text Document");
      sourceText.expression = "String(thisComp.layer(\"Probe " + sides[s] + "\").text.sourceText.style.justification)";
      report.justification.push({ side: sides[s], read: String(sourceText.valueAtTime(0, false).text), error: sourceText.expressionError || "" });
      reader.remove(); layer.remove();
    }
    report.status = "PASS";
    write();
    app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);
    app.endSuppressDialogs(false);
    app.quit();
  } catch (error) { report.status = "FAIL"; report.errors.push({ message: String(error), line: error.line || 0 }); try { write(); } catch (writeError) { $.writeln(String(writeError)); } }
}());
