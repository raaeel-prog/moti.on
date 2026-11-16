// Visual and numeric check of the camera choreographies (ADR 0007) in After Effects.
//
// Needs a NEW, EMPTY project, or the camera QA project this script saved before
// (it is closed without saving and replaced by a new one). Any other project is
// refused untouched. Requires `npm run build`. Run with After Effects open:
//   AfterFX.exe -r "<repo>\scripts\verify-camera-choreography.jsx"
// Output: artifacts\camera-choreography\result.json, one contact sheet per
// choreography (8 moments) and the project camera-choreography.aep for review.
(function () {
  var repo = File($.fileName).parent.parent.fsName, out = new Folder(repo + "/artifacts/camera-choreography");
  if (!out.exists) out.create();
  var results = { host: app.version, startedAt: new Date().toString(), tests: [] }, comp = null, serial = 0, FPS = 30;
  var IDS = ["deep-reveal", "layer-tour", "full-sequence", "quick-zooms", "between-layers", "hero-orbit", "dive-in"];
  /** Entrances finish by then: the title scales in from 0 and the date slides up. */
  var SETTLED = 1.2;

  function toJson(v) {
    if (v === null || v === undefined) return "null";
    if (typeof v === "number") return isFinite(v) ? String(v) : "null";
    if (typeof v === "boolean") return String(v);
    if (typeof v === "string") return "\"" + v.replace(/\\/g, "\\\\").replace(/"/g, "\\\"").replace(/\n/g, "\\n") + "\"";
    var parts = [], k;
    if (v instanceof Array) { for (k = 0; k < v.length; k++) parts.push(toJson(v[k])); return "[" + parts.join(",") + "]"; }
    for (k in v) if (v.hasOwnProperty(k)) parts.push(toJson(String(k)) + ":" + toJson(v[k]));
    return "{" + parts.join(",") + "}";
  }
  function save() { var f = new File(out.fsName + "/result.json"); f.encoding = "UTF-8"; f.open("w"); f.write(toJson(results)); f.close(); }
  function assert(value, message) { if (!value) throw new Error(message); }
  function round(x) { return Math.round(x * 1000) / 1000; }
  function test(name, fn) {
    try { results.tests.push({ name: name, status: "PASS", detail: fn() || null }); }
    catch (e) { results.tests.push({ name: name, status: "FAIL", error: String(e), line: e.line || null }); }
    save();
  }
  function guard() { if (app.project.activeItem !== comp) comp.openInViewer(); if (app.project.activeItem !== comp) throw new Error("A comp de QA não está ativa; nada foi enviado."); }
  function send(command, args, destructive) {
    guard();
    return MotionJson.parse(MotionAE.dispatch(MotionJson.stringify({ protocolVersion: 1, requestId: "choreo-" + (++serial), command: command,
      args: args || {}, context: { host: "after-effects", hostVersion: app.version, locale: "pt-BR" }, options: destructive ? { allowDestructive: true } : {} })));
  }
  function ok(r, what) { assert(r && r.ok, what + ": " + MotionJson.stringify(r && (r.error || r))); return r; }
  function tr(layer) { return layer.property("ADBE Transform Group"); }

  /** Real flyer entrances, keyed under the Parallax compensation: the title scales in
   * from 0 and the date slides up 260 px, both done by 1 s. At the comp's first frame
   * the title is degenerate, so the choreography must read the scene later. */
  function entrances() {
    for (var i = 1; i <= comp.numLayers; i++) {
      var layer = comp.layer(i);
      if (layer.name === "NOITE NEON") {
        var scale = tr(layer).property("ADBE Scale"), full = scale.valueAtTime(0, true), zero = [];
        for (var z = 0; z < full.length; z++) zero.push(0);
        scale.setValueAtTime(0, zero); scale.setValueAtTime(0.8, full);
      }
      if (layer.name === "SÁBADO · 22H") {
        var position = tr(layer).property("ADBE Position"), rest = position.valueAtTime(0, true), low = [rest[0], rest[1] + 260];
        if (rest.length > 2) low.push(rest[2]);
        position.setValueAtTime(0, low); position.setValueAtTime(1, rest);
      }
    }
  }
  /** A flyer: textured background, artist, title, date and logo, all 2D, laid out for 1080×1920. */
  function flyer(name, duration) {
    comp = app.project.items.addComp(name, 1080, 1920, 1, duration, FPS);
    comp.openInViewer();
    var bg = comp.layers.addSolid([0.06, 0.07, 0.12], "Fundo", 1188, 2112, 1, duration);
    var ramp = bg.property("ADBE Effect Parade").addProperty("ADBE Ramp");
    ramp.property(1).setValue([594, 0]); ramp.property(2).setValue([0.10, 0.12, 0.30]); ramp.property(3).setValue([594, 2112]); ramp.property(4).setValue([0.45, 0.10, 0.35]);
    // Grain, so the background's motion and magnification read in the frames.
    try { bg.property("ADBE Effect Parade").addProperty("ADBE Noise").property(1).setValue(12); } catch (e) { results.noise = String(e); }
    var spots = [[220, 640, 90], [880, 980, 60], [300, 1500, 110]];
    for (var s = 0; s < spots.length; s++) {
      var dot = comp.layers.addSolid([0.55, 0.35, 0.95], "Forma " + (s + 1), spots[s][2], spots[s][2], 1, duration);
      var ring = dot.property("ADBE Mask Parade").addProperty("ADBE Mask Atom"), circle = new Shape(), r = spots[s][2] / 2, kq = 0.5523 * r;
      circle.vertices = [[r, 0], [2 * r, r], [r, 2 * r], [0, r]];
      circle.inTangents = [[-kq, 0], [0, -kq], [kq, 0], [0, kq]]; circle.outTangents = [[kq, 0], [0, kq], [-kq, 0], [0, -kq]]; circle.closed = true;
      ring.property("ADBE Mask Shape").setValue(circle);
      tr(dot).property("ADBE Position").setValue([spots[s][0], spots[s][1]]);
    }
    var artist = comp.layers.addSolid([0.95, 0.55, 0.25], "Artista", 620, 980, 1, duration);
    tr(artist).property("ADBE Position").setValue([540, 1120]);
    var mask = artist.property("ADBE Mask Parade").addProperty("ADBE Mask Atom"), shape = new Shape();
    shape.vertices = [[310, 0], [620, 260], [560, 980], [60, 980], [0, 260]]; shape.closed = true; mask.property("ADBE Mask Shape").setValue(shape);
    var title = comp.layers.addText("NOITE NEON");
    var doc = title.property("ADBE Text Properties").property("ADBE Text Document").value;
    doc.fontSize = 150; doc.fillColor = [1, 0.92, 0.35]; doc.applyFill = true; doc.justification = ParagraphJustification.CENTER_JUSTIFY;
    title.property("ADBE Text Properties").property("ADBE Text Document").setValue(doc);
    tr(title).property("ADBE Position").setValue([540, 470]);
    var date = comp.layers.addText("SÁBADO · 22H");
    var d2 = date.property("ADBE Text Properties").property("ADBE Text Document").value;
    d2.fontSize = 72; d2.fillColor = [1, 1, 1]; d2.applyFill = true; d2.justification = ParagraphJustification.CENTER_JUSTIFY;
    date.property("ADBE Text Properties").property("ADBE Text Document").setValue(d2);
    tr(date).property("ADBE Position").setValue([540, 1720]);
    var logo = comp.layers.addSolid([0.30, 0.80, 1], "Logo", 180, 180, 1, duration);
    tr(logo).property("ADBE Position").setValue([150, 150]);
    for (var i = 1; i <= comp.numLayers; i++) comp.layer(i).selected = true;
    return comp.numLayers;
  }
  /** One sheet per choreography: 8 moments, 4 × 2 tiles of 270 × 480. */
  function sheet(source, name, moments) {
    var s = app.project.items.addComp(name + " · folha", 1080, 960, 1, 1, FPS), i;
    for (i = 0; i < moments.length; i++) {
      var tile = s.layers.add(source);
      tile.startTime = -moments[i];
      tr(tile).property("ADBE Scale").setValue([25, 25]);
      tr(tile).property("ADBE Position").setValue([135 + (i % 4) * 270, 240 + Math.floor(i / 4) * 480]);
    }
    var label = s.layers.addText(name);
    var doc = label.property("ADBE Text Properties").property("ADBE Text Document").value;
    doc.fontSize = 22; doc.fillColor = [1, 1, 1]; doc.applyFill = true;
    label.property("ADBE Text Properties").property("ADBE Text Document").setValue(doc);
    tr(label).property("ADBE Position").setValue([12, 28]);
    // saveFrameToPng returns before the file is flushed: wait until its size is non-zero and stops changing.
    var path = out.fsName + "/" + name + ".png", f = new File(path), size = 0, last = -1;
    if (f.exists) f.remove();
    s.saveFrameToPng(0, f);
    for (i = 0; i < 150; i++) { size = Math.max(0, new File(path).length); if (size > 0 && size === last) break; last = size; $.sleep(100); }
    return size;
  }

  var qaProject = false;
  app.beginSuppressDialogs();
  try {
    var file = app.project && app.project.file ? app.project.file.fsName.replace(/\\/g, "/") : "";
    if (/\/artifacts\/camera-(verify|choreography)\/camera-[a-z-]+\.aep$/i.test(file)) { app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES); app.newProject(); }
    if (!app.project || app.project.numItems !== 0 || app.project.file !== null) {
      results.fatal = "Abra um projeto novo e vazio antes de rodar. Nada foi alterado.";
      return;
    }
    qaProject = true;
    $.evalFile(new File(repo + "/dist/after-effects-cep/host/index.jsx"));
    if (app.project.expressionEngine !== "javascript-1.0") app.project.expressionEngine = "javascript-1.0";
    for (var n = 0; n < IDS.length; n++) (function (id) {
      test("Coreografia " + id, function () {
        // The open panel reloads its own host into this engine; take ours back first.
        $.evalFile(new File(repo + "/dist/after-effects-cep/host/index.jsx"));
        var recipe = null, k;
        for (k = 0; k < MotionCameraChoreographies.length; k++) if (MotionCameraChoreographies[k].id === id) recipe = MotionCameraChoreographies[k];
        var duration = recipe.durationSeconds + 1, layers = flyer("Moti.on QA Coreografia · " + id, duration);
        ok(send("ae.animate.parallax.quick", { depthStep: 0, strength: 1, orderMode: "timeline", createCamera: true, preserveFraming: true, controllerName: "Parallax", depthMode: "area" }), "parallax");
        entrances();
        comp.time = 0;
        var r = ok(send("ae.camera.choreography.apply", { choreographyId: id, startSeconds: 0 }), id);
        var named = MotionJson.stringify(r.data.subjects);
        if (id === "layer-tour" || id === "full-sequence" || id === "quick-zooms") assert(named.indexOf("NOITE NEON") >= 0, "o título que entra com escala 0 ficou de fora: " + named);
        if (recipe.steps[0].to === "deep") assert(r.data.depth > 0, "sem abertura lá de trás");
        var errors = [], started = new Date().getTime(), engine = MotionCameraRig.findEngine(comp);
        for (var f = 0; f < duration * FPS; f += 2) {
          for (k = 0; k < MotionCameraRig.TARGETS.length; k++) {
            var target = MotionCameraRig.TARGETS[k], owner = target.owner === "controller" ? engine.controller : engine.camera, prop = MotionCameraRig.locate(owner, target.path);
            prop.valueAtTime(f / FPS, false);
            if (prop.expressionError) errors.push(target.key + " @" + f + ": " + prop.expressionError);
          }
        }
        assert(!errors.length, errors.slice(0, 3).join(" | "));
        // Auto focus: holding at the end of every beat (deep, layer or layout), the focus
        // distance is the axial depth to the point the kernel racked to (no smoothing with
        // visits). The racks read their layers live, so only after the entrances settle.
        var meta = engine.meta, parade = engine.controller.property("ADBE Effect Parade"), focusWorst = 0, checked = 0;
        var gain = Number(MotionCameraRig.child(parade, meta.controls.intensity).property(1).value) / 100;
        var focusProp = engine.camera.property("ADBE Camera Options Group").property("ADBE Camera Focus Distance");
        for (k = 0; k < meta.shots.length; k++) {
          var beat = meta.shots[k];
          if (beat.shape.kind !== "visit" || beat.start + beat.dur + 0.1 < SETTLED) continue;
          var at = beat.start + beat.dur + 0.1, specs = [], j;
          for (j = 0; j < meta.shots.length; j++) {
            var s = meta.shots[j], spec = MotionCameraRig.copy(s.shape), control = MotionCameraRig.child(parade, s.control);
            spec.start = s.start; spec.dur = s.dur; spec.amount = s.amount / 100 * Number(control.property(1).value) / 100 * gain; specs.push(spec);
          }
          var pose = MotionCameraCore.camPose(at, meta.frame, specs), fp = pose.fp;
          var ref = [meta.frame.cx, meta.frame.cy, meta.frame.pz];
          var fb = Math.max(1, (ref[0] - pose.c[0]) * pose.f[0] + (ref[1] - pose.c[1]) * pose.f[1] + (ref[2] - pose.c[2]) * pose.f[2]);
          var want = MotionCameraCore.camFocusDepth(pose.c, pose.f, fp, 0, 50, fb), got = Number(focusProp.valueAtTime(at, false));
          focusWorst = Math.max(focusWorst, Math.abs(want - got)); checked++;
        }
        assert(focusWorst <= 0.5, "foco " + focusWorst + " px fora");
        var moments = [], span = recipe.durationSeconds;
        for (k = 0; k < 8; k++) moments.push(round(span * (k + 0.5) / 8));
        var bytes = sheet(comp, id, moments);
        return { beats: r.data.beats, subjects: r.data.subjects, hidden: r.data.hidden, depth: r.data.depth, focusRacks: r.data.focusRacks,
          warnings: r.warnings, msPerFrame: round((new Date().getTime() - started) / (duration * FPS / 2)),
          focusChecks: checked, focusWorstPx: round(focusWorst), moments: moments, sheetBytes: bytes };
      });
    })(IDS[n]);
    app.project.save(new File(out.fsName + "/camera-choreography.aep"));
  } catch (fatal) {
    results.fatal = String(fatal); results.line = fatal.line || null;
  } finally {
    // AE 26.5 shows "falha interna de verificação! {no current context}" when an `AfterFX.exe -r`
    // script ends with a text layer it created still selected, and the modal refuses every later -r
    // (docs/implementation/2026-10-18-camera-engine.md). Only the QA project is touched.
    if (qaProject) try { for (var c = 1; c <= app.project.numItems; c++) { var item = app.project.item(c); if (item instanceof CompItem) for (var q = 1; q <= item.numLayers; q++) item.layer(q).selected = false; } } catch (deselectError) { results.deselect = String(deselectError); }
    app.endSuppressDialogs(false);
    var pass = 0; for (var t = 0; t < results.tests.length; t++) if (results.tests[t].status === "PASS") pass++;
    results.summary = { pass: pass, total: results.tests.length }; results.finishedAt = new Date().toString();
    save();
  }
})();
