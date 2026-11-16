// Verificação real das transições 3D novas (Premium) e dos Timers e contadores no After Effects.
//   AfterFX.exe -m -r "<repo>\scripts\verify-counters-3d.jsx"
// Carrega o host compilado (dist) e trabalha numa comp de QA. Num AE aberto só
// por este roteiro (projeto vazio e sem arquivo) ele fecha sem salvar e sai;
// num projeto do usuário ele só remove o que criou e não salva nada.
// Saída: artifacts\counters-3d-verify\result.json e PNGs. Requer `npm run build`.
(function () {
  var repo = File($.fileName).parent.parent.fsName, out = new Folder(repo + "/artifacts/counters-3d-verify");
  if (!out.exists) out.create();
  var results = { host: app.version, build: app.buildName, os: $.os, startedAt: new Date().toString(), tests: [] };
  var owned = Boolean(app.project) && app.project.numItems === 0 && !app.project.file;
  var previous = app.project.activeItem, comp = null, serial = 0, before = {};
  for (var b = 1; b <= app.project.numItems; b++) before[app.project.item(b).id] = true;
  function save() { var f = new File(out.fsName + "/result.json"); f.encoding = "UTF-8"; f.open("w"); f.write(MotionJson.stringify(results)); f.close(); }
  function assert(value, message) { if (!value) throw new Error(message); }
  function near(a, b, tolerance) { return Math.abs(a - b) <= (tolerance || .000001); }
  function test(name, fn) {
    try { var detail = fn(); results.tests.push({ name: name, status: "PASS", detail: detail || null }); }
    catch (e) { results.tests.push({ name: name, status: "FAIL", error: String(e), line: e.line || null }); }
  }
  function guard() { if (app.project.activeItem !== comp) comp.openInViewer(); if (app.project.activeItem !== comp) throw new Error("A comp de QA não está ativa; nada foi enviado."); }
  function host() { $.evalFile(new File(repo + "/dist/after-effects-cep/host/index.jsx")); }
  function dispatch(command, args, locale) {
    guard(); host();
    return MotionJson.parse(MotionAE.dispatch(MotionJson.stringify({ protocolVersion: 1, requestId: "qa-" + (++serial), command: command, args: args,
      context: { host: "after-effects", hostVersion: app.version, locale: locale || "pt-BR" }, options: { preserveSelection: true } })));
  }
  /** saveFrameToPng returns before the file is flushed: wait until its size stops changing. */
  function png(name, t) {
    var path = out.fsName + "/" + name + ".png", f = new File(path), size = 0, last = -1;
    if (f.exists) f.remove();
    comp.saveFrameToPng(t, f);
    for (var i = 0; i < 150; i++) { size = Math.max(0, new File(path).length); if (size > 0 && size === last) break; last = size; $.sleep(100); }
    return size;
  }

  // ---- Transições 3D ----------------------------------------------------------
  var THREE_D = ["premium-page-turn", "premium-flip-drop", "premium-depth-spiral", "premium-tilted-slide", "premium-floor-rise", "premium-turntable-approach", "premium-corner-swing", "premium-side-flip-bounce"];
  function find(id) { for (var i = 0; i < MotionLibraryCatalog.length; i++) if (MotionLibraryCatalog[i].id === id) return MotionLibraryCatalog[i]; throw new Error("Preset ausente: " + id); }
  function presetArgs(id) {
    // An installed Moti.on panel may reload an older host and its catalog: read the build under test.
    host();
    var p = find(id), o = { presetId: id, phase: "both", direction: "preset", durationFrames: 24, intensity: 100, staggerFrames: 0, unit: "preset" }, k;
    if (p.defaults) for (k in p.defaults) if (p.defaults.hasOwnProperty(k)) o[k] = p.defaults[k];
    o.presetId = id; o.phase = "both"; return o;
  }
  function solid(name) {
    for (var i = 1; i <= comp.numLayers; i++) comp.layer(i).selected = false;
    var l = comp.layers.addSolid([.92, .38, .22], name, 400, 300, 1, 5); l.selected = true; return l;
  }
  function value(l, name, t) { var p = l.property("ADBE Transform Group").property(name), v = p.valueAtTime(t, false); if (p.expressionError) throw new Error(name + " @" + t + ": " + p.expressionError); return v; }

  // ---- Contadores ---------------------------------------------------------------
  function innerOf(layer) { return layer.source; }
  function counterText(inner, layerName, t) {
    var p = inner.layer(layerName).property("ADBE Text Properties").property("ADBE Text Document"), v = p.valueAtTime(t, false);
    if (p.expressionError) throw new Error(layerName + " @" + t + ": " + p.expressionError);
    return v.text;
  }
  function expressionErrors(inner, time) {
    var errors = [];
    function walk(group, path) {
      for (var i = 1; i <= group.numProperties; i++) {
        var p = group.property(i);
        if (p.numProperties !== undefined && p.propertyType !== PropertyType.PROPERTY) { walk(p, path + "/" + p.name); continue; }
        var driven = false; try { driven = p.canSetExpression && p.expressionEnabled; } catch (none) { driven = false; }
        if (!driven) continue;
        p.valueAtTime(time, false);
        if (p.expressionError) errors.push(path + "/" + p.name + ": " + p.expressionError);
      }
    }
    for (var l = 1; l <= inner.numLayers; l++) walk(inner.layer(l), inner.layer(l).name);
    return errors;
  }
  function insert(id, locale) {
    comp.time = 0;
    var r = dispatch("ae.elements.insert", { elementId: id, sound: "none" }, locale);
    assert(r.ok, id + ": " + MotionJson.stringify(r.error || r));
    return { response: r, layer: comp.layer(1), inner: innerOf(comp.layer(1)) };
  }

  app.beginSuppressDialogs();
  try {
    host();
    results.catalog = { motion: MotionLibraryCatalog.length };
    comp = app.project.items.addComp("Moti.on QA 3D e contadores", 1920, 1080, 1, 12, 30); comp.openInViewer();

    for (var i = 0; i < THREE_D.length; i++) (function (id) {
      test(id + " · Ambos: aplica sem erro de expressão, oculto nas bordas e neutro no repouso", function () {
        var l = solid(id), restPosition = l.property("ADBE Transform Group").property("ADBE Position").value, r = dispatch("ae.presets.phase-apply", presetArgs(id));
        try {
          assert(r.ok, MotionJson.stringify(r.error || r));
          assert(l.threeDLayer, "a camada não virou 3D");
          var names = ["ADBE Position", "ADBE Scale", "ADBE Rotate X", "ADBE Rotate Y", "ADBE Rotate Z", "ADBE Opacity", "ADBE Anchor Point"];
          for (var f = 0; f <= 150; f++) for (var n = 0; n < names.length; n++) value(l, names[n], f / 30);
          var mid = l.outPoint / 2;
          assert(near(value(l, "ADBE Opacity", mid), 100, .001), "opacidade no repouso " + value(l, "ADBE Opacity", mid));
          assert(near(value(l, "ADBE Rotate X", mid), 0, .001) && near(value(l, "ADBE Rotate Y", mid), 0, .001) && near(value(l, "ADBE Rotate Z", mid), 0, .001), "rotação no repouso");
          var p = value(l, "ADBE Position", mid);
          assert(near(p[0], restPosition[0], .01) && near(p[1], restPosition[1], .01), "posição no repouso " + p.join(","));
          assert(value(l, "ADBE Opacity", 0) < .001, "início visível");
          assert(value(l, "ADBE Opacity", l.outPoint) < .001, "fim visível");
          var size = png(id.replace("premium-", "3d-") + "-entrada", .25);
          return { effects: l.property("ADBE Effect Parade").numProperties, png: size };
        } finally { l.remove(); }
      });
    })(THREE_D[i]);

    test("Contagem regressiva: relógio em segundos reais, anel e sliders publicados", function () {
      var e = insert("countdown-ring"), inner = e.inner;
      var controllers = []; for (var c = 1; c <= inner.motionGraphicsTemplateControllerCount; c++) controllers.push(inner.getMotionGraphicsTemplateControllerName(c));
      var listed = "|" + controllers.join("|") + "|";
      assert(listed.indexOf("|Início|") >= 0 && listed.indexOf("|Fim|") >= 0, "controles: " + controllers.join("|"));
      var texts = { t0: counterText(inner, "Título", 0), t3: counterText(inner, "Título", 3), end: counterText(inner, "Título", inner.duration) };
      assert(texts.t0 === "00:10" && texts.t3 === "00:07" && texts.end === "00:00", MotionJson.stringify(texts));
      var errors = expressionErrors(inner, 3); assert(errors.length === 0, errors.join(" | "));
      texts.png = png("contagem-regressiva", 3);
      e.layer.remove(); return texts;
    });

    test("Número em destaque: separadores pt-BR, legenda editável e slider Fim muda a contagem", function () {
      var e = insert("stat-count"), inner = e.inner, d = inner.duration;
      var start = counterText(inner, "Título", 0), done = counterText(inner, "Título", d * .85);
      assert(start === "0+" && done === "1.000+", start + " / " + done);
      var end = inner.layer("Moti.on Cores").property("ADBE Effect Parade").property("Fim").property("ADBE Slider Control-0001");
      end.setValue(25000);
      var edited = counterText(inner, "Título", d * .85);
      assert(edited === "25.000+", "depois do slider: " + edited);
      var errors = expressionErrors(inner, d / 2); assert(errors.length === 0, errors.join(" | "));
      var shot = png("numero-em-destaque", d * .6 + e.layer.startTime);
      e.layer.remove(); return { start: start, done: done, edited: edited, png: shot };
    });

    test("Inglês: separadores e nomes dos sliders em inglês", function () {
      var e = insert("rating", "en-US"), inner = e.inner, v = counterText(inner, "Title", inner.duration * .85);
      assert(v === "4.9", "nota " + v);
      e.layer.remove(); return { value: v };
    });

    var OTHERS = ["stopwatch", "percent-bar", "follower-ticker"];
    for (var o = 0; o < OTHERS.length; o++) (function (id) {
      test(id + " · expressões sem erro do começo ao fim", function () {
        var e = insert(id), inner = e.inner, samples = [];
        for (var k = 0; k <= 4; k++) {
          var t = inner.duration * k / 4, errors = expressionErrors(inner, t);
          assert(errors.length === 0, "@" + t + ": " + errors.join(" | "));
          samples.push(counterText(inner, "Título", Math.min(t, inner.duration - .01)));
        }
        var shot = png(id, inner.duration * .5);
        e.layer.remove(); return { samples: samples, png: shot };
      });
    })(OTHERS[o]);
  } catch (fatal) {
    results.fatal = String(fatal); results.line = fatal.line || null;
  } finally {
    var ok = 0; for (var t = 0; t < results.tests.length; t++) if (results.tests[t].status === "PASS") ok++;
    results.summary = { pass: ok, total: results.tests.length }; results.finishedAt = new Date().toString();
    if (owned) {
      save();
      app.endSuppressDialogs(false);
      app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);
      app.quit();
    } else {
      var created = [];
      for (var n = app.project.numItems; n >= 1; n--) { var it = app.project.item(n); if (!before[it.id]) created.push(it); }
      for (var pass = 0; pass < 3; pass++) for (var c2 = 0; c2 < created.length; c2++) {
        var x = created[c2]; if (!x) continue;
        var kind = x instanceof CompItem ? 0 : x instanceof FolderItem ? 2 : 1;
        if (kind !== pass) continue;
        try { x.remove(); created[c2] = null; } catch (gone) { created[c2] = null; }
      }
      if (previous instanceof CompItem) previous.openInViewer();
      app.endSuppressDialogs(false);
      save();
    }
  }
})();
