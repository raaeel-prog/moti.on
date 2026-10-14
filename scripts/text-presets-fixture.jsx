/* Included by the trusted Node generator inside a function with its own job. */
var report = {status: "RUNNING", hostVersion: app.version, entries: [], errors: [], userProjectGuard: false};
function evidenceWrite() { var f = File(job.report); f.encoding = "UTF-8"; if (!f.open("w")) { throw new Error("Cannot write fixture evidence: " + f.error); } f.write(MotionJson.stringify(report)); f.close(); }
var fixtureDispatch=null,fixtureGlobals={};
function command(id, args) { for(var globalKey in fixtureGlobals)if(Object.prototype.hasOwnProperty.call(fixtureGlobals,globalKey)){$.global[globalKey]=fixtureGlobals[globalKey];}return MotionJson.parse(fixtureDispatch(MotionJson.stringify({protocolVersion: MotionContracts.PROTOCOL_VERSION, requestId: "text-fixture-" + report.entries.length + "-" + id, command: id, args: args, context: {host: "after-effects", hostVersion: app.version, locale: "en-US"}, options: {preserveSelection: true}}))); }
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
    if (entry.cached) { report.entries.push({id: entry.id, status: "CACHED", hash: entry.recipeHash}); continue; }
    comp = app.project.items.addComp(entry.id, job.fixture.width, job.fixture.height, 1, job.fixture.durationSeconds, job.fixture.frameRate);
    comp.bgColor = job.fixture.background;
    comp.renderer = job.fixture.renderer;
    comp.motionBlur = job.fixture.motionBlur;
    comp.shutterAngle = job.fixture.shutterAngle;
    comp.layers.addSolid(job.fixture.background, "Original Onyx fixture background", job.fixture.width, job.fixture.height, 1, job.fixture.durationSeconds);
    layer = comp.layers.addText(job.fixture.text);
    source = layer.property("ADBE Text Properties").property("ADBE Text Document");
    document = source.value;
    document.font = job.fixture.font;
    document.fontSize = job.fixture.fontSize;
    document.fillColor = job.fixture.fillColor;
    document.applyFill = true;
    document.applyStroke = false;
    document.justification = ParagraphJustification.CENTER_JUSTIFY;
    source.setValue(document);
    rect = layer.sourceRectAtTime(0, false);
    transform = layer.property("ADBE Transform Group");
    transform.property("ADBE Anchor Point").setValue([rect.left + rect.width / 2, rect.top + rect.height / 2]);
    transform.property("ADBE Position").setValue(job.fixture.position);
    layer.motionBlur = true;
    comp.openInViewer();
    layer.selected = true;
    var options = {}, key;
    for (key in entry.options) { if (Object.prototype.hasOwnProperty.call(entry.options, key)) { options[key] = entry.options[key]; } }
    options.presetId = entry.id;
    applied = command(entry.mode === "continuous" ? "ae.presets.apply" : "ae.presets.phase-apply", options);
    if (!applied.ok) { report.entries.push({id: entry.id, status: "FAIL", response: applied,args:options,definitionFound:!!MotionPresetLibrary.definition(options),catalogCount:MotionLibraryCatalog.length}); report.status = "FAIL"; evidenceWrite(); throw new Error("Preset application failed: " + entry.id); }
    inspected = command("ae.presets.inspect", {});
    if (!inspected.ok || inspected.data.state !== "ready") { throw new Error("Preset inspection failed: " + entry.id); }
    errors = [];
    var sampleTimes = [0, 0.2, 0.5, 1, 1.8, 2.5, 3.5, 3.9], t;
    for (t = 0; t < sampleTimes.length; t++) { comp.time = sampleTimes[t]; var probe = layer.sourceRectAtTime(sampleTimes[t], false); scanErrors(layer, "layer", errors); }
    if (errors.length) { report.entries.push({id: entry.id, status: "EXPRESSION_FAIL", errors: errors}); report.status = "FAIL"; evidenceWrite(); throw new Error("Expression error: " + entry.id); }
    renderItem = app.project.renderQueue.items.add(comp);
    renderItem.timeSpanStart = 0;
    renderItem.timeSpanDuration = job.fixture.durationSeconds;
    output = renderItem.outputModule(1);
    var templates = output.templates, ti;
    for (ti = 0; ti < templates.length; ti++) { if (templates[ti] === "Sem perdas" || templates[ti] === "Lossless") { output.applyTemplate(templates[ti]); break; } }
    output.file = File(entry.avi);
    report.entries.push({id: entry.id, status: "PASS", hash: entry.recipeHash, phaseCount: inspected.data.phases ? inspected.data.phases.length : 0, hasTextEffect: !!inspected.data.textEffect, editableText: source.value.text === job.fixture.text, perCharacter3D: layer.threeDPerChar, outputSettings: output.getSettings(GetSettingsFormat.STRING_SETTABLE)});
    evidenceWrite();
  }
  app.project.save(File(job.aep));
  report.status = "PASS";
  evidenceWrite();
  app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);
  app.endSuppressDialogs(false);
  app.quit();
} catch (error) { report.status = "FAIL"; report.errors.push({message: String(error), line: error.line || 0}); try { evidenceWrite(); } catch (ignored) { $.writeln(String(ignored)); } if(report.userProjectGuard){app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);app.endSuppressDialogs(false);app.quit();} }
