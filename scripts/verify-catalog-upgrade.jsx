// Verificação real da leva de 14/10/2026 sobre o catálogo de motion: presets
// novos (dobradiça, pêndulo contínuo, batida, giro de moeda) e melhorias dos
// antigos (Quique ajustável, panorâmica horizontal, motion blur nos rápidos).
// Rodar com o AE já aberto e o projeto do usuário salvo:
//   AfterFX.exe -r "<repo>\scripts\verify-catalog-upgrade.jsx"
// Carrega o host compilado (dist), cria uma comp de QA e a remove no fim, com os
// sólidos que criou; o projeto não é salvo. Cada comando só é enviado com a comp
// de QA ativa. Saída: artifacts\catalog-upgrade-verify\result.json e PNGs.
// Requer `npm run build` antes.
(function () {
  var repo = File($.fileName).parent.parent.fsName, out = new Folder(repo + "/artifacts/catalog-upgrade-verify");
  if (!out.exists) out.create();
  var results = {host: app.version, build: app.buildName, os: $.os, startedAt: new Date().toString(), tests: []};
  var previous = app.project.activeItem, comp = null, serial = 0, sources = [];
  function save() { var f = new File(out.fsName + "/result.json"); f.encoding = "UTF-8"; f.open("w"); f.write(MotionJson.stringify(results)); f.close(); }
  function assert(value, message) { if (!value) throw new Error(message); }
  function near(a, b, tolerance) { return Math.abs(a - b) <= (tolerance || .001); }
  function test(name, fn) {
    try { var detail = fn(); results.tests.push({name: name, status: "PASS", detail: detail || null}); }
    catch (e) { results.tests.push({name: name, status: "FAIL", error: String(e), line: e.line || null}); }
  }
  /** Every command acts on the active comp: refuse to run anywhere but the QA comp. */
  function guard() { if (app.project.activeItem !== comp) comp.openInViewer(); if (app.project.activeItem !== comp) throw new Error("A comp de QA não está ativa; nada foi enviado."); }
  function send(command, args) {
    guard();
    var r = MotionJson.parse(MotionAE.dispatch(MotionJson.stringify({protocolVersion: 1, requestId: "catalog-" + (++serial),
      command: "ae.presets." + command, args: args, context: {host: "after-effects", hostVersion: app.version, locale: "pt-BR"}, options: {preserveSelection: true}})));
    assert(r.ok, command + ": " + MotionJson.stringify(r.error || r));
    return r;
  }
  function find(id) { for (var i = 0; i < MotionLibraryCatalog.length; i++) if (MotionLibraryCatalog[i].id === id) return MotionLibraryCatalog[i]; throw new Error("Preset ausente: " + id); }
  /** The gallery's own defaults: recipe defaults over the library's. */
  function args(id, over) {
    var p = find(id), o = {presetId: id, phase: "in", direction: "preset", durationFrames: 24, intensity: 100, staggerFrames: 2, unit: "preset"}, k;
    if (p.defaults) for (k in p.defaults) if (p.defaults.hasOwnProperty(k)) o[k] = p.defaults[k];
    if (over) for (k in over) if (over.hasOwnProperty(k)) o[k] = over[k];
    o.presetId = id; return o;
  }
  function solid(name) {
    for (var i = 1; i <= comp.numLayers; i++) comp.layer(i).selected = false;
    var l = comp.layers.addSolid([.3, .75, .5], name, 200, 200, 1, 5); sources.push(l.source); l.selected = true; return l;
  }
  function tr(l, name) { return l.property("ADBE Transform Group").property(name); }
  function sample(l, name, t) { var p = tr(l, name), v = p.valueAtTime(t, false); if (p.expressionError) throw new Error(name + " @" + t + ": " + p.expressionError); return v; }
  function control(l, label) { var fx = l.property("ADBE Effect Parade"); for (var i = 1; i <= fx.numProperties; i++) if (fx.property(i).name.indexOf(" · " + label) > 0) return fx.property(i).property(1); return null; }
  /** Composition position of a layer-space point on a 2D layer without parent. */
  function world(l, point, t) {
    var p = sample(l, "ADBE Position", t), r = sample(l, "ADBE Rotate Z", t) * Math.PI / 180, a = tr(l, "ADBE Anchor Point").valueAtTime(t, true), s = sample(l, "ADBE Scale", t);
    var x = (point[0] - a[0]) * s[0] / 100, y = (point[1] - a[1]) * s[1] / 100;
    return [p[0] + x * Math.cos(r) - y * Math.sin(r), p[1] + x * Math.sin(r) + y * Math.cos(r)];
  }
  function png(name, t) { var f = new File(out.fsName + "/" + name + ".png"); if (f.exists) f.remove(); comp.saveFrameToPng(t, f); return name; }
  function clean(l) { try { l.remove(); } catch (ignored) {} }

  app.beginSuppressDialogs();
  try {
    $.evalFile(new File(repo + "/dist/after-effects-cep/host/index.jsx"));
    comp = app.project.items.addComp("Moti.on QA Catálogo", 1920, 1080, 1, 5, 30); comp.openInViewer();
    comp.motionBlur = false;

    test("Dobradiça: gira pela borda escolhida, que fica parada", function () {
      var edges = [["left", [0, 100]], ["right", [200, 100]], ["top", [100, 0]], ["bottom", [100, 200]]], worst = 0;
      for (var i = 0; i < edges.length; i++) {
        var l = solid("hinge-" + edges[i][0]);
        send("phase-apply", args("momentum-hinge", {phase: "in", direction: edges[i][0]}));
        var rest = world(l, edges[i][1], 2), turned = false;
        for (var f = 0; f <= 40; f++) { var now = world(l, edges[i][1], f / 30); worst = Math.max(worst, Math.abs(now[0] - rest[0]), Math.abs(now[1] - rest[1])); if (Math.abs(sample(l, "ADBE Rotate Z", f / 30)) > 1) turned = true; }
        assert(turned, edges[i][0] + " não girou");
        if (i === 0) png("dobradica-0.25s", .25);
        clean(l);
      }
      assert(worst < .01, "a borda andou " + worst + " px");
      return {worst: worst};
    });

    test("Pêndulo contínuo: balança em torno do Centro da transição, que não se move", function () {
      var l = solid("pendulo-loop");
      send("apply", args("momentum-pendulum-loop"));
      var center = control(l, "Centro da transição").value, rest = world(l, center, 0), worst = 0, low = 0, high = 0;
      for (var f = 0; f <= 150; f++) { var t = f / 30, now = world(l, center, t), angle = sample(l, "ADBE Rotate Z", t); worst = Math.max(worst, Math.abs(now[0] - rest[0]), Math.abs(now[1] - rest[1])); low = Math.min(low, angle); high = Math.max(high, angle); }
      png("pendulo-continuo-1.00s", 1);
      clean(l);
      assert(worst < .01 && low < -10 && high > 10, "centro andou " + worst + " px; ângulo " + low + ".." + high);
      return {worst: worst, low: low, high: high};
    });

    test("Batida: os dois eixos pulsam juntos, a cada segundo, e descansam entre as batidas", function () {
      var l = solid("batida"), peak = 0;
      send("apply", args("momentum-heartbeat"));
      for (var f = 0; f <= 60; f++) { var t = f / 30, s = sample(l, "ADBE Scale", t), next = sample(l, "ADBE Scale", t + 1); assert(near(s[0], s[1], 1e-6) && near(s[0], next[0], 1e-4) && s[0] >= 100 - 1e-6, "pulso irregular em " + t); peak = Math.max(peak, s[0]); }
      var rest = sample(l, "ADBE Scale", .7)[0];
      clean(l);
      assert(peak > 112 && peak < 116 && near(rest, 100, .01), "pico " + peak + ", repouso " + rest);
      return {peak: peak};
    });

    test("Giro de moeda: camada 3D girando em Y a 180°/s, pela Velocidade", function () {
      var l = solid("moeda");
      send("apply", args("momentum-coin-spin"));
      var ok = l.threeDLayer && near(sample(l, "ADBE Rotate Y", 1), 180) && near(sample(l, "ADBE Rotate Y", 2), 360);
      control(l, "Velocidade (%)").setValue(50);
      ok = ok && near(sample(l, "ADBE Rotate Y", 2), 180);
      png("moeda-0.40s", .4);
      clean(l); assert(ok, "rotação Y fora do esperado");
    });

    test("Saltos antigos agora são Quique com controles ao vivo e o mesmo caráter", function () {
      var ids = ["bounce-pop", "bounce-flip", "glitch-slide", "aggressive-orbit"], detail = {};
      for (var i = 0; i < ids.length; i++) {
        var l = solid(ids[i]);
        send("phase-apply", args(ids[i], {phase: "in"}));
        var amount = control(l, "Ricochete (%)"), count = control(l, "Oscilações"), damping = control(l, "Amortecimento (%)");
        assert(amount && count && damping, ids[i] + ": controles do Quique ausentes");
        assert(amount.value === 48 && count.value === 3 && damping.value === 78, ids[i] + ": valores " + amount.value + "/" + count.value + "/" + damping.value);
        var names = ["ADBE Position", "ADBE Scale", "ADBE Opacity", "ADBE Rotate Z"];
        for (var f = 0; f <= 30; f++) for (var n = 0; n < names.length; n++) sample(l, names[n], f / 30);
        // Live: lowering the hop height changes the frame halfway through the transition.
        var before = sample(l, "ADBE Opacity", .4); amount.setValue(10); var after = sample(l, "ADBE Opacity", .4);
        detail[ids[i]] = {motionBlur: l.motionBlur, before: before, after: after};
        clean(l);
        assert(Math.abs(before - after) > .01, ids[i] + ": o controle não mudou o quique (" + before + " / " + after + ")");
      }
      return detail;
    });

    test("Panorâmica cinematográfica desliza na horizontal", function () {
      var l = solid("panoramica"), steps = [], start = null, rest = null;
      send("phase-apply", args("cinematic-pan", {phase: "in"}));
      // Read each value on its own, so a host failure names the step it came from.
      var times = [0, .1, .5, 1, 3];
      for (var i = 0; i < times.length; i++) {
        try { var v = sample(l, "ADBE Position", times[i]), copy = [Number(v[0]), Number(v[1])]; steps.push({t: times[i], x: copy[0], y: copy[1]}); if (times[i] === 0) start = copy; if (times[i] === 3) rest = copy; }
        catch (step) { steps.push({t: times[i], error: String(step)}); }
      }
      try { steps.push({scale0: Number(sample(l, "ADBE Scale", 0)[0]), opacity0: Number(sample(l, "ADBE Opacity", 0))}); } catch (other) { steps.push({other: String(other)}); }
      clean(l);
      results.panSteps = steps;
      assert(start && rest, "posição ilegível: " + MotionJson.stringify(steps));
      assert(Math.abs(start[0] - rest[0]) > 100 && Math.abs(start[1] - rest[1]) < 1e-6, "início " + start.join(",") + " / repouso " + rest.join(","));
      return steps;
    });

    test("Transições rápidas aplicam com motion blur; as lentas não mexem nos switches", function () {
      var l = solid("rapida");
      send("phase-apply", args("momentum-push", {phase: "in"}));
      var fast = l.motionBlur === true && comp.motionBlur === true;
      clean(l); comp.motionBlur = false;
      var slow = solid("lenta");
      send("phase-apply", args("arc-arrival", {phase: "in"}));
      var untouched = slow.motionBlur === false && comp.motionBlur === false;
      clean(slow);
      assert(fast && untouched, "rápida " + fast + ", lenta intocada " + untouched);
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
