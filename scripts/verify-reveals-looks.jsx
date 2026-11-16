// Verificação real das Revelações e dos Looks no After Effects.
// Rodar com o AE já aberto e o projeto do usuário salvo:
//   AfterFX.exe -r "<repo>\scripts\verify-reveals-looks.jsx"
// Carrega o host compilado (dist), cria uma comp de QA e a remove no fim, com os
// sólidos que criou; o projeto não é salvo. Cada comando só é enviado com a comp
// de QA ativa. A transparência é medida com sampleImage numa camada sonda.
// Saída: artifacts\reveals-looks-verify\result.json e PNGs. Requer `npm run build`.
(function () {
  var repo = File($.fileName).parent.parent.fsName, out = new Folder(repo + "/artifacts/reveals-looks-verify");
  if (!out.exists) out.create();
  var results = {host: app.version, build: app.buildName, os: $.os, startedAt: new Date().toString(), tests: [], sides: {}};
  var previous = app.project.activeItem, comp = null, serial = 0, sources = [], probe = null, probeSlider = null;
  function save() { var f = new File(out.fsName + "/result.json"); f.encoding = "UTF-8"; f.open("w"); f.write(MotionJson.stringify(results)); f.close(); }
  function assert(value, message) { if (!value) throw new Error(message); }
  function test(name, fn) {
    try { var detail = fn(); results.tests.push({name: name, status: "PASS", detail: detail || null}); }
    catch (e) { results.tests.push({name: name, status: "FAIL", error: String(e), line: e.line || null}); }
  }
  /** Every command acts on the active comp: refuse to run anywhere but the QA comp. */
  function guard() { if (app.project.activeItem !== comp) comp.openInViewer(); if (app.project.activeItem !== comp) throw new Error("A comp de QA não está ativa; nada foi enviado."); }
  /** An open Moti.on panel may reload its installed host and replace these
   * globals mid-run: load the build under test before every command. */
  function host() { $.evalFile(new File(repo + "/dist/after-effects-cep/host/index.jsx")); results.hostLoads = (results.hostLoads || 0) + 1; }
  function send(command, args) {
    guard(); host();
    var r = MotionJson.parse(MotionAE.dispatch(MotionJson.stringify({protocolVersion: 1, requestId: "reveal-look-" + (++serial),
      command: "ae.presets." + command, args: args, context: {host: "after-effects", hostVersion: app.version, locale: "pt-BR"}, options: {preserveSelection: true}})));
    assert(r.ok, command + ": " + MotionJson.stringify(r.error || r));
    return r;
  }
  function find(id) { host(); for (var i = 0; i < MotionLibraryCatalog.length; i++) if (MotionLibraryCatalog[i].id === id) return MotionLibraryCatalog[i]; throw new Error("Preset ausente: " + id); }
  function args(id, over) {
    var p = find(id), o = {presetId: id, phase: "in", direction: "preset", durationFrames: 24, intensity: 100, staggerFrames: 0, unit: "preset"}, k;
    if (p.defaults) for (k in p.defaults) if (p.defaults.hasOwnProperty(k)) o[k] = p.defaults[k];
    if (over) for (k in over) if (over.hasOwnProperty(k)) o[k] = over[k];
    o.presetId = id; return o;
  }
  /** A 400x200 solid with a native ramp, so looks have something to stylize. */
  function solid(name) {
    for (var i = 1; i <= comp.numLayers; i++) comp.layer(i).selected = false;
    var l = comp.layers.addSolid([.9, .55, .2], name, 400, 200, 1, 4); sources.push(l.source);
    var ramp = l.property("ADBE Effect Parade").addProperty("ADBE Ramp");
    ramp.property("ADBE Ramp-0001").setValue([0, 0]); ramp.property("ADBE Ramp-0003").setValue([400, 200]);
    ramp.property("ADBE Ramp-0002").setValue([.1, .2, .7, 1]); ramp.property("ADBE Ramp-0004").setValue([1, .8, .3, 1]);
    l.selected = true; return l;
  }
  /** Alpha of the target layer at a layer-space point, after its effects. */
  function alpha(target, point, time) {
    probeSlider.expression = "thisComp.layer(" + MotionJson.stringify(target.name) + ").sampleImage([" + point[0] + "," + point[1] + "],[1,1],true,time)[3];";
    var v = probeSlider.valueAtTime(time, false); if (probeSlider.expressionError) throw new Error(probeSlider.expressionError); return v;
  }
  function owned(l, matchName) { var fx = l.property("ADBE Effect Parade"); for (var i = 1; i <= fx.numProperties; i++) if (fx.property(i).matchName === matchName && fx.property(i).name.indexOf("Moti.on ") === 0) return fx.property(i); return null; }
  function png(name, t) { var f = new File(out.fsName + "/" + name + ".png"); if (f.exists) f.remove(); comp.saveFrameToPng(t, f); return name; }
  function clean(l) { try { l.remove(); } catch (ignored) {} }
  var POINTS = {left: [30, 100], right: [370, 100], top: [200, 15], bottom: [200, 185]}, OPPOSITE = {left: "right", right: "left", top: "bottom", bottom: "top"};

  app.beginSuppressDialogs();
  try {
    host();
    comp = app.project.items.addComp("Moti.on QA Revelações e Looks", 1280, 720, 1, 4, 30); comp.openInViewer();
    probe = comp.layers.addNull(4); probe.name = "sonda"; probe.enabled = false; sources.push(probe.source);
    probeSlider = probe.property("ADBE Effect Parade").addProperty("ADBE Slider Control").property(1);

    test("Cada revelação cobre a camada nas bordas e a descobre no repouso", function () {
      var ids = ["reveal-curtain", "reveal-clock", "reveal-blinds", "reveal-blocks", "reveal-grid", "reveal-sweep"], detail = {};
      for (var i = 0; i < ids.length; i++) {
        var l = solid(ids[i]); l.name = ids[i];
        send("phase-apply", args(ids[i], {phase: "both", durationFrames: 30}));
        var start = alpha(l, [200, 100], 0), rest = alpha(l, [200, 100], 2), end = alpha(l, [200, 100], 3.99);
        detail[ids[i]] = {start: start, rest: rest, end: end};
        png(ids[i] + "-0.40s", .4);
        clean(l);
        assert(start < .05 && end < .05 && rest > .95, ids[i] + ": início " + start + ", repouso " + rest + ", fim " + end);
      }
      return detail;
    });

    test("Cortina e Varredura descobrem primeiro o lado escolhido", function () {
      var ids = ["reveal-curtain", "reveal-sweep"], sides = ["left", "right", "top", "bottom"], wrong = [];
      for (var i = 0; i < ids.length; i++) for (var s = 0; s < sides.length; s++) {
        var l = solid(ids[i] + "-" + sides[s]); l.name = ids[i] + "-" + sides[s];
        send("phase-apply", args(ids[i], {phase: "in", durationFrames: 30, direction: sides[s]}));
        var effect = owned(l, ids[i] === "reveal-curtain" ? "ADBE Linear Wipe" : "CS LineSweep"), param = effect.property(1), time = 0;
        // The frame where about half of the layer is uncovered.
        for (var f = 0; f <= 30; f++) { var c = param.valueAtTime(f / 30, false); if (c <= 55) { time = f / 30; break; } }
        var near = alpha(l, POINTS[sides[s]], time), far = alpha(l, POINTS[OPPOSITE[sides[s]]], time), seen = [];
        for (var k in POINTS) if (POINTS.hasOwnProperty(k) && alpha(l, POINTS[k], time) > .5) seen.push(k);
        results.sides[ids[i] + " " + sides[s]] = {angle: effect.property(2).value, completion: param.valueAtTime(time, false), uncovered: seen.join(",")};
        if (!(near > .5 && far < .5)) wrong.push(ids[i] + " " + sides[s] + " → " + seen.join(","));
        clean(l);
      }
      assert(!wrong.length, "lado errado: " + wrong.join("; "));
    });

    test("Cada look aplica sua pilha nativa sem erro de expressão, misturada pela Intensidade", function () {
      var ids = ["look-vhs", "look-crt", "look-film", "look-dots", "look-dither", "look-pencil", "look-frames", "look-sepia"], detail = {};
      for (var i = 0; i < ids.length; i++) {
        var l = solid(ids[i]); l.name = ids[i];
        send("apply", args(ids[i], {intensity: 60}));
        var fx = l.property("ADBE Effect Parade"), count = 0;
        for (var e = 1; e <= fx.numProperties; e++) {
          var effect = fx.property(e); if (effect.name.indexOf("Moti.on ") !== 0 || effect.matchName === "ADBE Slider Control") continue; count++;
          for (var p = 1; p <= effect.numProperties; p++) {
            var prop = effect.property(p), driven = false;
            // Groups and some native rows reject expression queries; they hold no expression.
            try { driven = prop.canSetExpression && prop.expressionEnabled; } catch (noExpression) { driven = false; }
            if (!driven) continue;
            prop.valueAtTime(1, false);
            if (prop.expressionError) throw new Error(effect.matchName + " " + prop.name + ": " + prop.expressionError);
          }
          var built = effect.property("ADBE Effect Built In Params"), mix = built ? built.property("ADBE Effect Mask Opacity") : null;
          if (mix && mix.expressionEnabled && Math.abs(mix.valueAtTime(1, false) - 60) > .001) throw new Error(ids[i] + " " + effect.matchName + ": opacidade " + mix.valueAtTime(1, false));
        }
        var grain = owned(l, "VISINF Grain Implant");
        if (grain) assert(grain.property("VISINF Grain Implant-0021").value === 3, ids[i] + ": granulação ainda em modo de prévia");
        detail[ids[i]] = {effects: count, png: png(ids[i], 1)};
        clean(l);
      }
      return detail;
    });
  } catch (fatal) {
    results.fatal = String(fatal); results.line = fatal.line || null;
  } finally {
    try { if (comp) comp.remove(); } catch (ignored) {}
    // Solids live in the project after their layers go: remove what this script made.
    for (var s = sources.length - 1; s >= 0; s--) try { sources[s].remove(); } catch (gone) {}
    if (previous instanceof CompItem) previous.openInViewer();
    app.endSuppressDialogs(false);
    var pass = 0; for (var t = 0; t < results.tests.length; t++) if (results.tests[t].status === "PASS") pass++;
    results.summary = {pass: pass, total: results.tests.length}; results.finishedAt = new Date().toString();
    save();
  }
})();
