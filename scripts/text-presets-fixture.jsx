/* Included by the trusted Node generator inside a function with its own job. */
var report = {status: "RUNNING", hostVersion: app.version, entries: [], errors: [], userProjectGuard: false};
function evidenceWrite() { var f = File(job.report); f.encoding = "UTF-8"; if (!f.open("w")) { throw new Error("Cannot write fixture evidence: " + f.error); } f.write(MotionJson.stringify(report)); f.close(); }
var fixtureDispatch=null,fixtureGlobals={};
function command(id, args) { for(var globalKey in fixtureGlobals)if(Object.prototype.hasOwnProperty.call(fixtureGlobals,globalKey)){$.global[globalKey]=fixtureGlobals[globalKey];}return MotionJson.parse(fixtureDispatch(MotionJson.stringify({protocolVersion: MotionContracts.PROTOCOL_VERSION, requestId: "text-fixture-" + report.entries.length + "-" + id, command: id, args: args, context: {host: "after-effects", hostVersion: app.version, locale: "en-US"}, options: {preserveSelection: true}}))); }
/** Sets a text metric where this AE version exposes it; older hosts keep their default. */
function fixtureSet(document, key, value) { try { if (document[key] !== undefined) { document[key] = value; } } catch (ignored) { report.errors.push({message: "text metric " + key + " not settable: " + String(ignored)}); } }
function fixtureTextMetrics(document, fontSize) {
  fixtureSet(document, "tracking", 0);
  fixtureSet(document, "baselineShift", 0);
  fixtureSet(document, "horizontalScale", 1);
  fixtureSet(document, "verticalScale", 1);
  fixtureSet(document, "fauxBold", false);
  fixtureSet(document, "fauxItalic", false);
  fixtureSet(document, "autoLeading", false);
  fixtureSet(document, "leading", Math.round(fontSize * 1.2 * 100) / 100);
}
function scanErrors(group, path, output) { if (!group) { return; } var i, p; for (i = 1; i <= group.numProperties; i++) { p = group.property(i); if (p.canSetExpression && p.expressionEnabled) { p.valueAtTime(app.project.activeItem.time, false); if(p.expressionError) { output.push({path: path + "/" + p.matchName, error: p.expressionError}); } } if (p.numProperties) { scanErrors(p, path + "/" + p.matchName, output); } } }
try {
  $.evalFile(File(job.host));
  fixtureDispatch=MotionAE.dispatch;report.executionCatalogCount=MotionLibraryCatalog.length;
  for(var hostGlobal in $.global)if(hostGlobal.indexOf("Motion")===0)fixtureGlobals[hostGlobal]=$.global[hostGlobal];
  if(report.executionCatalogCount!==job.expectedCatalogCount)throw Error("Unexpected fixture host catalog");
  if (!app.project || app.project.numItems !== 0 || app.project.file) { report.status = "ABORTED_USER_PROJECT_GUARD"; evidenceWrite(); return; }
  report.userProjectGuard = true;
  app.beginSuppressDialogs();
  app.project.bitsPerChannel = job.fixture.colorDepth;
  var i, entry, comp, layer, document, source, rect, transform, applied, inspected, errors, renderItem, output;
  for (i = 0; i < job.entries.length; i++) {
    entry = job.entries[i];
    // A build shard applies only its own entries (every shards-th one).
    if (job.shard !== undefined && i % job.shards !== job.shard) continue;
    if (entry.cached) { report.entries.push({id: entry.id, status: "CACHED", hash: entry.recipeHash}); continue; }
    // A direction tile renders lighter than its card (entry.fixture).
    var fx = entry.fixture || job.fixture;
    comp = app.project.items.addComp(entry.id, fx.width, fx.height, 1, fx.durationSeconds, fx.frameRate);
    comp.bgColor = fx.background;
    comp.renderer = fx.renderer;
    comp.motionBlur = fx.motionBlur;
    comp.shutterAngle = fx.shutterAngle;
    comp.layers.addSolid(fx.background, "Original Onyx fixture background", fx.width, fx.height, 1, fx.durationSeconds);
    layer = comp.layers.addText(entry.text);
    source = layer.property("ADBE Text Properties").property("ADBE Text Document");
    document = source.value;
    document.font = fx.font;
    document.fontSize = entry.fontSize;
    document.fillColor = fx.fillColor;
    document.applyFill = true;
    document.applyStroke = false;
    document.justification = ParagraphJustification.CENTER_JUSTIFY;
    // addText inherits the Character panel (leading, tracking, scale...), so a
    // leftover leading pushed two-line samples off the frame. Pin every metric
    // to what text-preview-sample.ts lays out: 120% leading, no tracking.
    fixtureTextMetrics(document, entry.fontSize);
    source.setValue(document);
    rect = layer.sourceRectAtTime(0, false);
    transform = layer.property("ADBE Transform Group");
    transform.property("ADBE Anchor Point").setValue([rect.left + rect.width / 2, rect.top + rect.height / 2]);
    transform.property("ADBE Position").setValue(fx.position);
    layer.motionBlur = true;
    comp.openInViewer();
    layer.selected = true;
    var options = {}, key;
    for (key in entry.options) { if (Object.prototype.hasOwnProperty.call(entry.options, key)) { options[key] = entry.options[key]; } }
    options.presetId = entry.presetId || entry.id;
    applied = command(entry.mode === "continuous" ? "ae.presets.apply" : "ae.presets.phase-apply", options);
    if (!applied.ok) { report.entries.push({id: entry.id, status: "FAIL", response: applied}); report.failed = (report.failed || 0) + 1; comp.remove(); evidenceWrite(); continue; }
    inspected = command("ae.presets.inspect", {});
    if (!inspected.ok || inspected.data.state !== "ready") { report.entries.push({id: entry.id, status: "INSPECT_FAIL", response: inspected}); report.failed = (report.failed || 0) + 1; comp.remove(); evidenceWrite(); continue; }
    errors = [];
    var sampleTimes = [0, 0.2, 0.5, 1, 1.8, 2.5, 3.5, 3.9], t;
    for (t = 0; t < sampleTimes.length; t++) { if (sampleTimes[t] >= fx.durationSeconds) { continue; } comp.time = sampleTimes[t]; var probe = layer.sourceRectAtTime(sampleTimes[t], false); scanErrors(layer, "layer", errors); }
    if (errors.length) { report.entries.push({id: entry.id, status: "EXPRESSION_FAIL", errors: errors}); report.failed = (report.failed || 0) + 1; comp.remove(); evidenceWrite(); continue; }
    renderItem = app.project.renderQueue.items.add(comp);
    renderItem.timeSpanStart = 0;
    renderItem.timeSpanDuration = fx.durationSeconds;
    output = renderItem.outputModule(1);
    var templates = output.templates, ti;
    for (ti = 0; ti < templates.length; ti++) { if (templates[ti] === "Sem perdas" || templates[ti] === "Lossless") { output.applyTemplate(templates[ti]); break; } }
    output.file = File(entry.avi);
    var diagnosis = [];
    if (job.diagnose) {
      // What AE itself evaluates for every animator: its properties and the selector amount.
      var animators = layer.property("ADBE Text Properties").property("ADBE Text Animators"), ai, pi;
      for (ai = 1; ai <= animators.numProperties; ai++) {
        var animatorGroup = animators.property(ai), props = animatorGroup.property("ADBE Text Animator Properties"), names = [];
        for (pi = 1; pi <= props.numProperties; pi++) { names.push(props.property(pi).matchName + "=" + String(props.property(pi).value)); }
        var amount = animatorGroup.property("ADBE Text Selectors").property(1).property("ADBE Text Expressible Amount");
        diagnosis.push({name: animatorGroup.name, properties: names, error: amount.expressionError, enabled: amount.expressionEnabled, tail: String(amount.expression).slice(-160), at: [String(amount.valueAtTime(0.1, false)), String(amount.valueAtTime(0.3, false)), String(amount.valueAtTime(0.6, false))]});
      }
      try { var rig = MotionPresetPhases.metadata(layer); diagnosis.push({rigAnimators: rig ? [rig.slots["in"], rig.slots.out].map(function (s) { return s ? s.meta.animators.map(function (a) { return a.name + ":" + a.properties.join("+"); }).join(" | ") : "-"; }) : "none"}); } catch (rigError) { diagnosis.push({rigError: String(rigError)}); }
    }
    report.entries.push({id: entry.id, status: "PASS", hash: entry.recipeHash, phaseCount: inspected.data.phases ? inspected.data.phases.length : 0, phases: inspected.data.phases ? inspected.data.phases.length : 0, editableText: source.value.text === entry.text, perCharacter3D: layer.threeDPerChar, diagnosis: diagnosis, outputSettings: output.getSettings(GetSettingsFormat.STRING_SETTABLE)});
    evidenceWrite();
  }
  // Shards render in parallel: copy k queues every shards-th item.
  var shards = job.shards || 1, k, q;
  if (job.shard !== undefined) app.project.save(File(job.aep.replace(/\.aep$/, "-" + job.shard + ".aep")));
  else if (shards === 1) app.project.save(File(job.aep));
  else for (k = 0; k < shards; k++) {
    for (q = 1; q <= app.project.renderQueue.numItems; q++) app.project.renderQueue.item(q).render = (q - 1) % shards === k;
    app.project.save(File(job.aep.replace(/\.aep$/, "-" + k + ".aep")));
  }
  report.status = report.failed ? "PARTIAL" : "PASS";
  evidenceWrite();
  app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);
  app.endSuppressDialogs(false);
  app.quit();
} catch (error) { report.status = "FAIL"; report.errors.push({message: String(error), line: error.line || 0}); try { evidenceWrite(); } catch (ignored) { $.writeln(String(ignored)); } if(report.userProjectGuard){app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);app.endSuppressDialogs(false);app.quit();} }
