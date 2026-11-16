/* Original isolated fixture probe. Never runs against a populated project. */
(function () {
  var root = File($.fileName).parent.parent.fsName.replace(/\\/g, "/");
  var target = File(root + "/artifacts/text-presets/ae-capabilities.json");
  var report = { status: "RUNNING", version: app.version, os: $.os, projectInitiallyEmpty: false, properties: [], errors: [] };
  function write() { var serialized = $.global.MotionJson.stringify(report); target.encoding = "UTF-8"; if (!target.open("w")) { throw new Error("Evidence write unavailable: " + target.error); } target.write(serialized); target.close(); }
  function walk(group, path, depth) { var i, p, item, value; if (depth > 4 || !group) { return; } for (i = 1; i <= group.numProperties; i++) { p = group.property(i); item = {path: path + "/" + p.matchName, name: p.name, matchName: p.matchName, propertyType: String(p.propertyType)}; try { value = p.value; if (typeof value === "number" || typeof value === "string" || value instanceof Array) { item.value = value; } } catch (ignore) {} report.properties.push(item); if (p.numProperties) { walk(p, item.path, depth + 1); } } }
  try {
    $.evalFile(File(root + "/apps/after-effects-cep/host/src/json.jsx"));
    report.projectInitiallyEmpty = !app.project || (app.project.numItems === 0 && !app.project.file);
    if (!report.projectInitiallyEmpty) { report.status = "ABORTED_USER_PROJECT_GUARD"; write(); return; }
    app.beginSuppressDialogs();
    var comp = app.project.items.addComp("Moti.on isolated capability probe", 480, 270, 1, 4, 24);
    var layer = comp.layers.addText("MOTI.ON\rTexto 3D");
    report.before = {threeDLayer: layer.threeDLayer, threeDPerChar: layer.threeDPerChar};
    report.hasThreeDPerChar = typeof layer.threeDPerChar !== "undefined";
    layer.threeDPerChar = true;
    report.after = {threeDLayer: layer.threeDLayer, threeDPerChar: layer.threeDPerChar};
    var animators = layer.property("ADBE Text Properties").property("ADBE Text Animators");
    var animator = animators.addProperty("ADBE Text Animator");
    var properties = animator.property("ADBE Text Animator Properties");
    var names = ["ADBE Text Position 3D", "ADBE Text Scale 3D", "ADBE Text Rotation X", "ADBE Text Rotation Y", "ADBE Text Rotation", "ADBE Text Anchor Point 3D", "ADBE Text Opacity", "ADBE Text Blur", "ADBE Text Tracking Amount", "ADBE Text Fill Color", "ADBE Text Fill Opacity", "ADBE Text Character Offset", "ADBE Text Skew", "ADBE Text Skew Axis"];
    report.animatorCapabilities = [];
    var i, p, item;
    for (i = 0; i < names.length; i++) { item = {matchName: names[i], canAddProperty: properties.canAddProperty(names[i])}; if (item.canAddProperty) { p = properties.addProperty(names[i]); item.value = p.value; item.propertyValueType = String(p.propertyValueType); } report.animatorCapabilities.push(item); }
    var more = layer.property("ADBE Text Properties").property("ADBE Text More Options");
    var grouping = more.property("ADBE Text Anchor Point Option");
    report.groupingValues = [];
    for (i = 1; i <= 4; i++) { grouping.setValue(i); report.groupingValues.push(grouping.value); }
    var alignment = more.property("ADBE Text Anchor Point Align");
    alignment.setValue([50, 50]);
    report.alignment = alignment.value;
    var selectors = animator.property("ADBE Text Selectors");
    report.expressionSelector = selectors.canAddProperty("ADBE Text Expressible Selector");
    var selector = selectors.addProperty("ADBE Text Expressible Selector");
    walk(selector, "Selector", 0);
    walk(layer.property("ADBE Text Properties"), "Text", 0);
    report.outputTemplates = comp ? app.project.renderQueue.items.add(comp).outputModule(1).templates : [];
    report.status = "PASS";
    write();
    app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);
    app.endSuppressDialogs(false);
    app.quit();
  } catch (error) { report.status = "FAIL"; report.errors.push({message: String(error), line: error.line || 0}); try { write(); } catch (writeError) { $.writeln(String(writeError)); } }
}());
