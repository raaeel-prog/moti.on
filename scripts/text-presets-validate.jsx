/* Included by scripts/text-presets-validate.mjs inside a function with its own job.
 * Applies text presets through the panel's own commands on real text layers in a
 * guarded, empty, isolated project and measures what the text does: where it rests,
 * how it moves for each alignment, size and side, and what removal leaves. */
var report = {status: "RUNNING", hostVersion: app.version, cases: [], errors: [], userProjectGuard: false};
function evidenceWrite() { var f = File(job.report); f.encoding = "UTF-8"; if (!f.open("w")) { throw new Error("Cannot write validation evidence: " + f.error); } f.write(MotionJson.stringify(report)); f.close(); }
var fixtureDispatch = null, fixtureGlobals = {};
function command(id, args) { for (var globalKey in fixtureGlobals) if (Object.prototype.hasOwnProperty.call(fixtureGlobals, globalKey)) { $.global[globalKey] = fixtureGlobals[globalKey]; } return MotionJson.parse(fixtureDispatch(MotionJson.stringify({protocolVersion: MotionContracts.PROTOCOL_VERSION, requestId: "text-validate-" + report.cases.length + "-" + id, command: id, args: args, context: {host: "after-effects", hostVersion: app.version, locale: "en-US"}, options: {preserveSelection: true}}))); }
function scanErrors(group, path, output, time) { if (!group) { return; } var i, p; for (i = 1; i <= group.numProperties; i++) { p = group.property(i); if (p.canSetExpression && p.expressionEnabled && p.expression) { p.valueAtTime(time, false); if (p.expressionError) { output.push({path: path + "/" + p.name, error: String(p.expressionError).slice(0, 300)}); } } if (p.numProperties) { scanErrors(p, path + "/" + p.name, output, time); } } }
function round(v) { return Math.round(v * 100) / 100; }
function box(layer, time) { var r = layer.sourceRectAtTime(time, false); return [round(r.left), round(r.top), round(r.left + r.width), round(r.top + r.height)]; }
function apart(a, b) { var most = 0; for (var i = 0; i < a.length; i++) { most = Math.max(most, Math.abs(a[i] - b[i])); } return round(most); }
var JUSTIFY = null;
try {
  $.evalFile(File(job.host));
  fixtureDispatch = MotionAE.dispatch;
  for (var hostGlobal in $.global) if (hostGlobal.indexOf("Motion") === 0) fixtureGlobals[hostGlobal] = $.global[hostGlobal];
  if (!app.project || app.project.numItems !== 0 || app.project.file) { report.status = "ABORTED_USER_PROJECT_GUARD"; evidenceWrite(); return; }
  report.userProjectGuard = true;
  JUSTIFY = {left: ParagraphJustification.LEFT_JUSTIFY, center: ParagraphJustification.CENTER_JUSTIFY, right: ParagraphJustification.RIGHT_JUSTIFY};
  app.beginSuppressDialogs();
  var comp = app.project.items.addComp("Moti.on isolated text validation", 1920, 1080, 1, job.seconds, 30);
  comp.openInViewer();
  for (var c = 0; c < job.cases.length; c++) {
    var item = job.cases[c], result = {key: item.key, id: item.id, set: item.set, justification: item.justification, fontSize: item.fontSize, direction: item.options.direction, status: "PASS"};
    try {
      var layer = comp.layers.addText(item.text), source = layer.property("ADBE Text Properties").property("ADBE Text Document"), document = source.value;
      document.font = "Arial-BoldMT"; document.fontSize = item.fontSize; document.applyFill = true; document.applyStroke = false; document.fillColor = [1, 1, 1];
      document.justification = JUSTIFY[item.justification]; source.setValue(document);
      // The layer keeps After Effects' own anchor (the text origin) and sits mid-frame.
      var transform = layer.property("ADBE Transform Group");
      transform.property("ADBE Position").setValue([960, 540]);
      var anchor = String(transform.property("ADBE Anchor Point").value), position = String(transform.property("ADBE Position").value);
      result.rest = box(layer, job.restTime);
      for (var other = 1; other <= comp.numLayers; other++) comp.layer(other).selected = false;
      layer.selected = true;
      var options = {}, key;
      for (key in item.options) if (Object.prototype.hasOwnProperty.call(item.options, key)) options[key] = item.options[key];
      options.presetId = item.id;
      var clock = new Date().getTime(); result.ms = {};
      var applied = command(item.mode === "continuous" ? "ae.presets.apply" : "ae.presets.phase-apply", options);
      result.ms.apply = new Date().getTime() - clock; clock = new Date().getTime();
      if (!applied.ok) { result.status = "APPLY_FAIL"; result.error = applied.error; }
      else {
        var errors = [], t;
        for (t = 0; t < job.scanTimes.length; t++) scanErrors(layer, "layer", errors, job.scanTimes[t]);
        result.ms.scan = new Date().getTime() - clock; clock = new Date().getTime();
        if (errors.length) { result.status = "EXPRESSION_FAIL"; result.errors = errors; }
        result.samples = [];
        for (t = 0; t < item.sampleTimes.length; t++) result.samples.push(box(layer, item.sampleTimes[t]));
        if (item.mode !== "continuous") { result.restAfter = box(layer, job.restTime); result.restShift = apart(result.rest, result.restAfter); if (result.restShift > .5) result.status = "REST_MOVED"; }
        result.ms.samples = new Date().getTime() - clock; clock = new Date().getTime();
        result.anchorKept = String(transform.property("ADBE Anchor Point").value) === anchor;
        result.positionKept = String(transform.property("ADBE Position").valueAtTime(job.restTime, false)) === position;
        if (!result.anchorKept || !result.positionKept) result.status = "LAYER_TRANSFORM_CHANGED";
        // Removal: every phase through the panel's own commands, then nothing of ours remains.
        var inspected = command("ae.presets.inspect", {}), removeError = null;
        if (inspected.ok && inspected.data.phases) {
          for (var ph = inspected.data.phases.length - 1; ph >= 0; ph--) { var now = command("ae.presets.inspect", {}); var removed = command("ae.presets.phase-action", {target: now.data.target, phase: inspected.data.phases[ph].phase, action: "remove"}); if (!removed.ok) removeError = removed.error; }
        } else { var single = command("ae.presets.remove", {}); if (!single.ok) removeError = single.error; }
        result.ms.remove = new Date().getTime() - clock;
        var animators = layer.property("ADBE Text Properties").property("ADBE Text Animators");
        result.removed = {error: removeError, animators: animators.numProperties, effects: layer.property("ADBE Effect Parade").numProperties, comment: String(layer.comment), rest: box(layer, job.restTime)};
        if (removeError || animators.numProperties || layer.property("ADBE Effect Parade").numProperties || apart(result.removed.rest, result.rest) > .01) result.status = result.status === "PASS" ? "REMOVE_FAIL" : result.status;
      }
      layer.remove();
    } catch (caseError) { result.status = "ERROR"; result.error = String(caseError) + " @" + (caseError.line || 0); try { if (layer) layer.remove(); } catch (ignored) {} }
    report.cases.push(result);
    if (c % 10 === 0) evidenceWrite();
  }
  report.status = "DONE";
  evidenceWrite();
  app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);
  app.endSuppressDialogs(false);
  app.quit();
} catch (error) { report.status = "FAIL"; report.errors.push({message: String(error), line: error.line || 0}); try { evidenceWrite(); } catch (ignored) { $.writeln(String(ignored)); } if (report.userProjectGuard) { app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES); app.endSuppressDialogs(false); app.quit(); } }
