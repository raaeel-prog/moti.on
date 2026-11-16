// Verificação real da coleção Impulso (Momentum) no After Effects.
// Rodar com o AE já aberto e o projeto do usuário salvo:
//   AfterFX.exe -r "<repo>\scripts\verify-momentum-presets.jsx"
// Carrega o host compilado (dist), cria uma comp de QA no projeto aberto e a
// remove no fim; o projeto não é salvo. Saída: artifacts\momentum-verify\
// result.json e PNGs de quadros-chave. Requer `npm run build` antes.
(function () {
  var repo = File($.fileName).parent.parent.fsName, out = new Folder(repo + "/artifacts/momentum-verify");
  if (!out.exists) out.create();
  var results = {host: app.version, build: app.buildName, os: $.os, startedAt: new Date().toString(), tests: []};
  var previous = app.project.activeItem, comp = null, serial = 0;
  function save() { var f = new File(out.fsName + "/result.json"); f.encoding = "UTF-8"; f.open("w"); f.write(MotionJson.stringify(results)); f.close(); }
  function assert(value, message) { if (!value) throw new Error(message); }
  function near(a, b, tolerance) { return Math.abs(a - b) <= (tolerance || .000001); }
  function test(name, fn) {
    try { var detail = fn(); results.tests.push({name: name, status: "PASS", detail: detail || null}); }
    catch (e) { results.tests.push({name: name, status: "FAIL", error: String(e), line: e.line || null}); }
  }
  /** Every command acts on the active comp: refuse to run anywhere but the QA comp. */
  function guard() { if (app.project.activeItem !== comp) comp.openInViewer(); if (app.project.activeItem !== comp) throw new Error("A comp de QA não está ativa; nada foi enviado."); }
  function send(command, args) {
    guard();
    return MotionJson.parse(MotionAE.dispatch(MotionJson.stringify({protocolVersion: 1, requestId: "momentum-" + (++serial),
      command: "ae.presets." + command, args: args, context: {host: "after-effects", hostVersion: app.version, locale: "pt-BR"}, options: {preserveSelection: true}})));
  }
  function find(id) { for (var i = 0; i < MotionLibraryCatalog.length; i++) if (MotionLibraryCatalog[i].id === id) return MotionLibraryCatalog[i]; throw new Error("Preset ausente: " + id); }
  function args(id, over) {
    var p = find(id), o = {presetId: id, phase: "in", direction: "preset", durationFrames: 24, intensity: 100, staggerFrames: 0, unit: "preset"}, k;
    if (p.defaults) for (k in p.defaults) if (p.defaults.hasOwnProperty(k)) o[k] = p.defaults[k];
    if (over) for (k in over) if (over.hasOwnProperty(k)) o[k] = over[k];
    o.presetId = id; return o;
  }
  function solid(name) {
    for (var i = 1; i <= comp.numLayers; i++) comp.layer(i).selected = false;
    var l = comp.layers.addSolid([.92, .38, .22], name, 200, 200, 1, 5); l.selected = true; return l;
  }
  function tr(l, name) { return l.property("ADBE Transform Group").property(name); }
  function control(l, label) {
    var fx = l.property("ADBE Effect Parade"), found = [];
    for (var i = 1; i <= fx.numProperties; i++) if (fx.property(i).name.indexOf(" · " + label) > 0) found.push(fx.property(i).property(1));
    return found;
  }
  function sample(l, name, t) { var p = tr(l, name), v = p.valueAtTime(t, false); if (p.expressionError) throw new Error(name + " @" + t + ": " + p.expressionError); return v; }
  /** Composition-space corners of a 2D layer without parent, after expressions. */
  function corners(l, t) {
    var p = sample(l, "ADBE Position", t), s = sample(l, "ADBE Scale", t), r = sample(l, "ADBE Rotate Z", t) * Math.PI / 180, a = tr(l, "ADBE Anchor Point").valueAtTime(t, true), rect = l.sourceRectAtTime(t, false), list = [], i;
    var xs = [rect.left, rect.left + rect.width], ys = [rect.top, rect.top + rect.height];
    for (i = 0; i < 4; i++) { var x = (xs[i % 2] - a[0]) * s[0] / 100, y = (ys[i > 1 ? 1 : 0] - a[1]) * s[1] / 100; list.push([p[0] + x * Math.cos(r) - y * Math.sin(r), p[1] + x * Math.sin(r) + y * Math.cos(r)]); }
    return list;
  }
  function outside(list) {
    var left = true, right = true, top = true, bottom = true;
    for (var i = 0; i < list.length; i++) { left = left && list[i][0] < 0; right = right && list[i][0] > comp.width; top = top && list[i][1] < 0; bottom = bottom && list[i][1] > comp.height; }
    return left || right || top || bottom;
  }
  function hidden(l, t) {
    if (sample(l, "ADBE Opacity", t) < .0001) return true;
    var s = sample(l, "ADBE Scale", t); if (Math.abs(s[0]) < .0001 || Math.abs(s[1]) < .0001) return true;
    return !l.threeDLayer && outside(corners(l, t));
  }
  function world(l, point, t) {
    var p = sample(l, "ADBE Position", t), r = sample(l, "ADBE Rotate Z", t) * Math.PI / 180, a = tr(l, "ADBE Anchor Point").valueAtTime(t, true), s = sample(l, "ADBE Scale", t);
    var x = (point[0] - a[0]) * s[0] / 100, y = (point[1] - a[1]) * s[1] / 100;
    return [p[0] + x * Math.cos(r) - y * Math.sin(r), p[1] + x * Math.sin(r) + y * Math.cos(r)];
  }
  /** saveFrameToPng returns before the file is flushed: wait until its size is non-zero and stops changing. */
  function png(name, t) {
    var path = out.fsName + "/" + name + ".png", f = new File(path), size = 0, last = -1;
    if (f.exists) f.remove();
    comp.saveFrameToPng(t, f);
    for (var i = 0; i < 150; i++) { size = Math.max(0, new File(path).length); if (size > 0 && size === last) break; last = size; $.sleep(100); }
    return size;
  }

  app.beginSuppressDialogs();
  try {
    $.evalFile(new File(repo + "/dist/after-effects-cep/host/index.jsx"));
    comp = app.project.items.addComp("Moti.on QA Impulso", 1920, 1080, 1, 5, 30); comp.openInViewer();
    var momentum = [];
    for (var m = 0; m < MotionLibraryCatalog.length; m++) if (MotionLibraryCatalog[m].collection === "momentum") momentum.push(MotionLibraryCatalog[m]);
    results.catalog = {total: MotionLibraryCatalog.length, momentum: momentum.length};

    for (var i = 0; i < momentum.length; i++) (function (p) {
      if (p.mode !== "transition") return;
      test(p.id + " · Ambos: aplica, sem erro de expressão, oculto nas bordas e neutro no repouso", function () {
        var l = solid(p.id), rest = tr(l, "ADBE Position").value, r = send("phase-apply", args(p.id, {phase: "both"}));
        try {
          assert(r.ok, MotionJson.stringify(r.error || r));
          var names = ["ADBE Position", "ADBE Scale", "ADBE Rotate Z", "ADBE Opacity"];
          if (l.threeDLayer) { names.push("ADBE Rotate X"); names.push("ADBE Rotate Y"); }
          for (var f = 0; f <= 150; f++) for (var n = 0; n < names.length; n++) sample(l, names[n], f / 30);
          var mid = sample(l, "ADBE Position", 2.5);
          assert(near(mid[0], rest[0], .001) && near(mid[1], rest[1], .001), "repouso fora do lugar");
          assert(near(sample(l, "ADBE Opacity", 2.5), 100, .001) && near(sample(l, "ADBE Rotate Z", 2.5), 0, .001), "repouso alterado");
          assert(hidden(l, 0), "início visível"); assert(hidden(l, l.outPoint), "fim visível");
          return {effects: l.property("ADBE Effect Parade").numProperties, threeD: l.threeDLayer};
        } finally { l.remove(); }
      });
    })(momentum[i]);

    test("Ricochete: controles ao vivo mudam o assentamento sem reaplicar", function () {
      var l = solid("ricochete"), r = send("phase-apply", args("momentum-push", {phase: "in"}));
      assert(r.ok, MotionJson.stringify(r.error || r));
      var amount = control(l, "Ricochete (%)")[0], before = sample(l, "ADBE Position", .5)[1];
      assert(near(amount.value, 30), "valor inicial"); amount.setValue(90);
      var after = sample(l, "ADBE Position", .5)[1]; png("push-settle", .5); l.remove();
      assert(!near(before, after, .01), "o slider não alterou a posição");
      return {before: before, after: after};
    });

    test("Fora do quadro: distância medida na comp e parent 2D", function () {
      var l = solid("empurrao"), r = send("phase-apply", args("momentum-push", {phase: "in"}));
      assert(r.ok, MotionJson.stringify(r.error || r));
      var distance = control(l, "Distância (px)")[0].value, expected = 1080 - 440 + Math.max(8, .02 * 1920);
      assert(near(distance, expected, .01), "distância " + distance + " ≠ " + expected);
      png("push-start", 0); png("push-mid", .25); l.remove();
      var parent = comp.layers.addNull(5); parent.property("ADBE Transform Group").property("ADBE Rotate Z").setValue(90); parent.property("ADBE Transform Group").property("ADBE Scale").setValue([150, 150]);
      var child = solid("filho"); child.parent = parent; r = send("phase-apply", args("momentum-push", {phase: "in"}));
      assert(r.ok, MotionJson.stringify(r.error || r));
      // A parent's transform is not modeled by corners(); compare screen motion via toComp-free math.
      var p0 = sample(child, "ADBE Position", 0), p1 = sample(child, "ADBE Position", 2), d = [p0[0] - p1[0], p0[1] - p1[1]], screen = [-1.5 * d[1], 1.5 * d[0]];
      var travel = control(child, "Distância (px)")[0].value; child.remove(); parent.remove();
      assert(near(screen[0], 0, .01) && near(screen[1], travel, .01), "direção na tela " + screen.join(","));
      return {distance: distance, parentTravel: travel};
    });

    test("Fora do quadro recusa camada 3D sem alterar nada", function () {
      var l = solid("3d"); l.threeDLayer = true; var comment = l.comment, r = send("phase-apply", args("momentum-push", {phase: "in"}));
      var effects = l.property("ADBE Effect Parade").numProperties, kept = l.comment === comment; l.remove();
      assert(!r.ok && effects === 0 && kept, "aplicou em 3D: " + MotionJson.stringify(r));
      return {code: r.error && r.error.code};
    });

    test("Pêndulo: o centro da transição fica parado, também após mover o ponto", function () {
      var l = solid("pendulo"), r = send("phase-apply", args("momentum-pendulum", {phase: "both"}));
      assert(r.ok, MotionJson.stringify(r.error || r));
      var centers = control(l, "Centro da transição"), c = centers[0].value, rest = world(l, c, 2.5), worst = 0, f;
      for (f = 0; f <= 150; f++) { var w = world(l, f < 75 ? c : centers[1].value, f / 30); worst = Math.max(worst, Math.abs(w[0] - rest[0]), Math.abs(w[1] - rest[1])); }
      png("pendulum-in", .4);
      centers[0].setValue([c[0] + 140, c[1] + 60]); var moved = world(l, [c[0] + 140, c[1] + 60], 2.5), movedWorst = 0;
      for (f = 0; f < 40; f++) { var v = world(l, [c[0] + 140, c[1] + 60], f / 30); movedWorst = Math.max(movedWorst, Math.abs(v[0] - moved[0]), Math.abs(v[1] - moved[1])); }
      l.remove();
      assert(worst < .01 && movedWorst < .01, "centro se moveu " + worst + " / " + movedWorst);
      return {maxDrift: worst, maxDriftAfterMove: movedWorst};
    });

    test("Efeitos: rotação contínua em °/s e piscar só mostra ou esconde", function () {
      var l = solid("giro"), r = send("apply", args("momentum-spin-loop"));
      assert(r.ok, MotionJson.stringify(r.error || r));
      var a = sample(l, "ADBE Rotate Z", 1), b = sample(l, "ADBE Rotate Z", 2); l.remove();
      assert(near(a, 90, .001) && near(b, 180, .001), "rotação " + a + "/" + b);
      l = solid("piscar"); r = send("apply", args("momentum-blink")); assert(r.ok, MotionJson.stringify(r.error || r));
      var seen = {}; for (var f = 0; f <= 60; f++) seen[String(sample(l, "ADBE Opacity", f / 30))] = true; l.remove();
      assert(seen["0"] && seen["100"], "valores " + MotionJson.stringify(seen));
      return {spin: [a, b], blink: seen};
    });

    test("3D: capotagem, queda em profundidade e pêndulo profundo renderizam", function () {
      var ids = ["momentum-tumble-x", "momentum-depth-drop", "momentum-deep-pendulum"], sizes = {};
      for (var k = 0; k < ids.length; k++) {
        var l = solid(ids[k]), r = send("phase-apply", args(ids[k], {phase: "in"}));
        assert(r.ok, MotionJson.stringify(r.error || r)); sizes[ids[k]] = png(ids[k], .45); l.remove();
      }
      return sizes;
    });

    test("Remover as duas fases devolve a camada ao estado original", function () {
      var l = solid("remover"); l.comment = "original"; var r = send("phase-apply", args("momentum-pendulum", {phase: "both"}));
      assert(r.ok, MotionJson.stringify(r.error || r));
      var state = send("inspect", {}).data; assert(state.state === "ready", state.message);
      assert(send("phase-action", {target: state.target, phase: "in", action: "remove"}).ok, "remover entrada");
      state = send("inspect", {}).data;
      assert(send("phase-action", {target: state.target, phase: "out", action: "remove"}).ok, "remover saída");
      var clean = l.comment === "original" && l.property("ADBE Effect Parade").numProperties === 0 && !tr(l, "ADBE Position").expression && !tr(l, "ADBE Rotate Z").expression && !tr(l, "ADBE Opacity").expression;
      l.remove(); assert(clean, "sobrou algo na camada");
    });
  } catch (fatal) {
    results.fatal = String(fatal); results.line = fatal.line || null;
  } finally {
    try { if (comp) comp.remove(); } catch (ignored) {}
    if (previous instanceof CompItem) previous.openInViewer();
    app.endSuppressDialogs(false);
    var pass = 0; for (var t = 0; t < results.tests.length; t++) if (results.tests[t].status === "PASS") pass++;
    results.summary = {pass: pass, total: results.tests.length}; results.finishedAt = new Date().toString();
    save();
  }
})();
