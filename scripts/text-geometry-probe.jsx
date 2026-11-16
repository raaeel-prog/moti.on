/* Isolated geometry probe: where After Effects places text under Tracking,
 * Scale and Anchor Point Grouping for left, centred and right paragraphs, how
 * the expressible selector counts units, and what an expression can read of the
 * paragraph. Writes artifacts/text-presets/geometry-probe.json. Never runs
 * against a populated project. */
(function () {
  var root = File($.fileName).parent.parent.fsName.replace(/\\/g, "/");
  var target = File(root + "/artifacts/text-presets/geometry-probe.json");
  var report = { status: "RUNNING", version: app.version, rest: {}, tracking: [], scale: [], counts: [], expressions: [], errors: [] };
  function write() { target.encoding = "UTF-8"; if (!target.open("w")) { throw new Error("Evidence write unavailable: " + target.error); } target.write($.global.MotionJson.stringify(report)); target.close(); }
  var JUST = {};
  function box(layer) { var r = layer.sourceRectAtTime(0, false); return { left: Math.round(r.left * 100) / 100, top: Math.round(r.top * 100) / 100, right: Math.round((r.left + r.width) * 100) / 100, bottom: Math.round((r.top + r.height) * 100) / 100 }; }
  function text(comp, value, justification) {
    var layer = comp.layers.addText(value), source = layer.property("ADBE Text Properties").property("ADBE Text Document"), document = source.value;
    document.font = "Arial-BoldMT"; document.fontSize = 100; document.applyFill = true; document.applyStroke = false; document.fillColor = [1, 1, 1];
    document.tracking = 0; document.justification = JUST[justification]; source.setValue(document); return layer;
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
  try {
    $.evalFile(File(root + "/apps/after-effects-cep/host/src/json.jsx"));
    if (!app.project || app.project.numItems !== 0 || app.project.file) { report.status = "ABORTED_USER_PROJECT_GUARD"; write(); return; }
    JUST = { left: ParagraphJustification.LEFT_JUSTIFY, center: ParagraphJustification.CENTER_JUSTIFY, right: ParagraphJustification.RIGHT_JUSTIFY };
    app.beginSuppressDialogs();
    var comp = app.project.items.addComp("Moti.on isolated geometry probe", 1920, 1080, 1, 4, 30), sides = ["left", "center", "right"], s, g, layer, sample = "MOTION PRESETS";
    comp.openInViewer();
    for (s = 0; s < sides.length; s++) {
      layer = text(comp, sample, sides[s]); report.rest[sides[s]] = box(layer);
      // Does a Position animator count in sourceRectAtTime?
      animator(layer, { "ADBE Text Position 3D": [0, -500, 0] }); report.rest[sides[s] + "-position"] = box(layer); layer.remove();
      layer = text(comp, sample, sides[s]); animator(layer, { "ADBE Text Tracking Amount": 100 }); report.tracking.push({ side: sides[s], amount: 100, box: box(layer) }); layer.remove();
      layer = text(comp, sample, sides[s]); animator(layer, { "ADBE Text Tracking Amount": -50 }); report.tracking.push({ side: sides[s], amount: -50, box: box(layer) }); layer.remove();
      for (g = 1; g <= 4; g++) {
        layer = text(comp, sample, sides[s]); grouping(layer, g); animator(layer, { "ADBE Text Scale 3D": [50, 50, 100] }); report.scale.push({ side: sides[s], grouping: g, box: box(layer) }); layer.remove();
        layer = text(comp, "MOTION PRESETS\rTEXTO", sides[s]); grouping(layer, g); report.scale.push({ side: sides[s], grouping: g, lines: 2, restBox: box(layer) });
        animator(layer, { "ADBE Text Scale 3D": [50, 50, 100] }); report.scale[report.scale.length - 1].box = box(layer); layer.remove();
      }
    }
    // Selector counting: which textTotal moves the layer for each Based On mode.
    var modes = [1, 2, 3, 4], m, n, found;
    for (m = 0; m < modes.length; m++) {
      layer = text(comp, "AB CD\rEF", "left"); var rest = box(layer);
      var a = animator(layer, { "ADBE Text Position 3D": [0, -500, 0] }, "0", modes[m]), amount = a.property("ADBE Text Selectors").property(1).property("ADBE Text Expressible Amount");
      found = -1; for (n = 1; n <= 12; n++) { amount.expression = "textTotal==" + n + "?100:0"; if (box(layer).top < rest.top - 100) { found = n; break; } }
      var indices = []; for (n = 1; n <= 12; n++) { amount.expression = "textIndex==" + n + "?100:0"; var b = box(layer); indices.push({ index: n, moved: b.top < rest.top - 100, box: b }); }
      report.counts.push({ basedOn: modes[m], textTotal: found, indices: indices }); layer.remove();
    }
    // Paragraph and style reads from an expression.
    layer = text(comp, "AB CD\rEF", "right"); layer.name = "Probe text";
    var solid = comp.layers.addSolid([0, 0, 0], "Probe reader", 10, 10, 1, 4), opacity = solid.property("ADBE Transform Group").property("ADBE Position");
    var reads = ["thisComp.layer(\"Probe text\").text.sourceText.style.justification", "thisComp.layer(\"Probe text\").text.sourceText.style.fontSize", "thisComp.layer(\"Probe text\").text.sourceText.style.tracking",
      "thisComp.layer(\"Probe text\").text.sourceText.length", "thisComp.layer(\"Probe text\").text.sourceText.value.length", "thisComp.layer(\"Probe text\").text.sourceText.split(\"\\r\").length",
      "thisComp.layer(\"Probe text\").text.sourceText.getStyleAt(0,0).justification", "thisComp.layer(\"Probe text\").text.sourceText.style.leading",
      "thisComp.layer(\"Probe text\").text.sourceText.style.isParagraphRightToLeft", "thisComp.layer(\"Probe text\").sourceRectAtTime(time,false).width"];
    for (n = 0; n < reads.length; n++) {
      opacity.expression = "var v=" + reads[n] + ";[typeof v===\"number\"?v:(typeof v===\"string\"?v.length+1000:(v===true?1:v===false?0:-1)),0];";
      var value = opacity.valueAtTime(0, false)[0];
      report.expressions.push({ read: reads[n], value: value, error: opacity.expressionError || "" });
    }
    report.status = "PASS";
    write();
    app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);
    app.endSuppressDialogs(false);
    app.quit();
  } catch (error) { report.status = "FAIL"; report.errors.push({ message: String(error), line: error.line || 0 }); try { write(); } catch (writeError) { $.writeln(String(writeError)); } }
}());
