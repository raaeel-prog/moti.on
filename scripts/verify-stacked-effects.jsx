// Verificação real do efeito empilhado (fases v3) no After Effects.
// Rodar com o AE já aberto e o projeto do usuário salvo:
//   AfterFX.exe -r "<repo>\scripts\verify-stacked-effects.jsx"
// Carrega o host compilado (dist), cria uma comp de QA no projeto aberto e a
// remove no fim; o projeto não é salvo. Cada comando só é enviado com a comp de
// QA ativa. Saída: artifacts\stacked-effects-verify\result.json e PNGs.
// Requer `npm run build` antes.
(function () {
  var repo = File($.fileName).parent.parent.fsName, out = new Folder(repo + "/artifacts/stacked-effects-verify");
  if (!out.exists) out.create();
  var results = {host: app.version, build: app.buildName, os: $.os, startedAt: new Date().toString(), tests: []};
  var previous = app.project.activeItem, comp = null, serial = 0, RAMP = 6, sources = [];
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
    var r = MotionJson.parse(MotionAE.dispatch(MotionJson.stringify({protocolVersion: 1, requestId: "stacked-" + (++serial),
      command: "ae.presets." + command, args: args, context: {host: "after-effects", hostVersion: app.version, locale: "pt-BR"}, options: {preserveSelection: true}})));
    if (command !== "inspect") assert(r.ok, command + ": " + MotionJson.stringify(r.error || r));
    return r;
  }
  function inspect() { var state = send("inspect", {}).data; assert(state.state === "ready", state.message); return state; }
  function phase(state, name) { for (var i = 0; i < state.phases.length; i++) if (state.phases[i].phase === name) return state.phases[i]; return null; }
  function roles(state) { var list = []; for (var i = 0; i < state.phases.length; i++) list.push(state.phases[i].phase); return list.join(","); }
  function find(id) { for (var i = 0; i < MotionLibraryCatalog.length; i++) if (MotionLibraryCatalog[i].id === id) return MotionLibraryCatalog[i]; throw new Error("Preset ausente: " + id); }
  function args(id, over) {
    var p = find(id), o = {presetId: id, phase: "in", direction: "preset", durationFrames: 24, intensity: 100, staggerFrames: 0, unit: "preset"}, k;
    if (p.defaults) for (k in p.defaults) if (p.defaults.hasOwnProperty(k)) o[k] = p.defaults[k];
    if (over) for (k in over) if (over.hasOwnProperty(k)) o[k] = over[k];
    o.presetId = id; return o;
  }
  function solid(name) {
    for (var i = 1; i <= comp.numLayers; i++) comp.layer(i).selected = false;
    var l = comp.layers.addSolid([.22, .55, .92], name, 240, 240, 1, 5); sources.push(l.source); l.selected = true; return l;
  }
  function tr(l, name) { return l.property("ADBE Transform Group").property(name); }
  function sample(l, name, t) { var p = tr(l, name), v = p.valueAtTime(t, false); if (p.expressionError) throw new Error(name + " @" + t + ": " + p.expressionError); return v; }
  function effectKey(l) { var m = l.property("ADBE Marker"); for (var i = 1; i <= m.numKeys; i++) if (m.keyValue(i).getParameters()["Moti.on.phase"] === "effect") return i; return 0; }
  /** Drag the effect cue as a user would: same payload, new time and duration. */
  function retime(l, start, duration) { var m = l.property("ADBE Marker"), i = effectKey(l), v = m.keyValue(i); m.removeKey(i); v.duration = duration; m.setValueAtTime(start, v); }
  function spin(t, start, end) { return 90 * MotionLibraryCore.libraryEffectWindow(t, start, end, RAMP * comp.frameDuration)[1]; }
  /** saveFrameToPng returns before the file is flushed: wait until its size is non-zero and stops changing. */
  function png(name, t) {
    var path = out.fsName + "/" + name + ".png", f = new File(path), size = 0, last = -1;
    if (f.exists) f.remove();
    comp.saveFrameToPng(t, f);
    for (var i = 0; i < 150; i++) { size = Math.max(0, new File(path).length); if (size > 0 && size === last) break; last = size; $.sleep(100); }
    return size;
  }
  function clean(l) { try { l.remove(); } catch (ignored) {} }

  app.beginSuppressDialogs();
  try {
    $.evalFile(new File(repo + "/dist/after-effects-cep/host/index.jsx"));
    comp = app.project.items.addComp("Moti.on QA Efeito empilhado", 1920, 1080, 1, 5, 30); comp.openInViewer();
    assert(typeof MotionLibraryCore.libraryEffectWindow === "function", "host compilado sem libraryEffectWindow; rode npm run build");

    test("Entrada + Saída + Efeito: três slots, marcador com duração e soma das rotações sem erro", function () {
      var reference = solid("so-saida"); send("phase-apply", args("momentum-push-spin", {phase: "out", durationFrames: 20}));
      var times = [], exitOnly = [], t;
      for (t = 0; t <= 4.95; t += 5 / 30) { times.push(t); exitOnly.push(sample(reference, "ADBE Rotate Z", t)); }
      reference.selected = false; clean(reference);
      var l = solid("empilhado");
      send("phase-apply", args("momentum-push", {phase: "in", durationFrames: 20}));
      send("phase-apply", args("momentum-push-spin", {phase: "out", durationFrames: 20}));
      send("apply", args("momentum-spin-loop"));
      var state = inspect(), effect = phase(state, "effect"), m = l.property("ADBE Marker"), cue = m.keyValue(effectKey(l)), worst = 0;
      assert(roles(state) === "in,out,effect", roles(state));
      assert(l.comment.indexOf("[Moti.on.library.v1]") < 0 && l.comment.indexOf("[Moti.on.library.v3]") >= 0, "metadados v3");
      assert(cue.comment === "Moti.on Efeito" && near(cue.duration, 5), "marcador " + cue.comment + " " + cue.duration);
      assert(near(effect.markerTime, 0) && near(effect.markerDuration, 5), "janela " + effect.markerTime + "+" + effect.markerDuration);
      for (var i = 0; i < times.length; i++) {
        var names = ["ADBE Position", "ADBE Scale", "ADBE Opacity"];
        for (var n = 0; n < names.length; n++) sample(l, names[n], times[i]);
        worst = Math.max(worst, Math.abs(sample(l, "ADBE Rotate Z", times[i]) - exitOnly[i] - spin(times[i], 0, 5)));
      }
      assert(worst < .001, "rotação combinada difere em " + worst);
      var frames = {start: png("empilhado-0.30s", .3), middle: png("empilhado-2.50s", 2.5), end: png("empilhado-4.70s", 4.7)};
      clean(l); return {worst: worst, samples: times.length, png: frames};
    });

    test("Arrastar o marcador e mudar a duração reprogramam o efeito ao vivo; ajuste e deslocamento preservam a janela", function () {
      var l = solid("janela");
      send("phase-apply", args("momentum-push", {phase: "in", durationFrames: 20}));
      send("apply", args("momentum-spin-loop"));
      retime(l, 1, 2);
      assert(near(sample(l, "ADBE Rotate Z", .9), 0), "antes da janela: " + sample(l, "ADBE Rotate Z", .9));
      assert(near(sample(l, "ADBE Rotate Z", 2), spin(2, 1, 3)), "meio da janela");
      assert(near(sample(l, "ADBE Rotate Z", 4), spin(3, 1, 3)), "ângulo mantido após a janela");
      var state = inspect(), effect = phase(state, "effect");
      assert(near(effect.markerTime, 1) && near(effect.markerDuration, 2), "inspeção " + effect.markerTime + "+" + effect.markerDuration);
      var options = effect.options; options.intensity = 50;
      send("phase-adjust", {target: state.target, phase: "effect", presetId: effect.presetId, options: options});
      state = inspect(); effect = phase(state, "effect");
      assert(effect.options.intensity === 50 && near(effect.markerTime, 1) && near(effect.markerDuration, 2), "ajuste moveu a janela");
      assert(near(sample(l, "ADBE Rotate Z", 2), spin(2, 1, 3) / 2), "Intensidade 50%");
      send("phase-timing", {target: state.target, phase: "effect", frames: 6});
      effect = phase(inspect(), "effect");
      assert(near(effect.markerTime, 1.2) && near(effect.markerDuration, 2), "deslocamento " + effect.markerTime);
      clean(l);
    });

    test("Restaurar e Remover o efeito não tocam Entrada e Saída", function () {
      var l = solid("slots"); l.comment = "original";
      send("phase-apply", args("momentum-push", {phase: "in", durationFrames: 20}));
      send("phase-apply", args("momentum-push-spin", {phase: "out", durationFrames: 20}));
      send("apply", args("momentum-spin-loop", {intensity: 150}));
      retime(l, .5, 1);
      var state = inspect(), entrance = MotionJson.stringify(phase(state, "in")), exit = MotionJson.stringify(phase(state, "out"));
      send("phase-action", {target: state.target, phase: "effect", action: "reset"});
      state = inspect();
      assert(phase(state, "effect").options.intensity === 100 && near(phase(state, "effect").markerTime, 0), "restaurar");
      assert(MotionJson.stringify(phase(state, "in")) === entrance && MotionJson.stringify(phase(state, "out")) === exit, "restaurar mexeu nas outras fases");
      send("phase-action", {target: state.target, phase: "effect", action: "remove"});
      state = inspect();
      assert(roles(state) === "in,out" && !effectKey(l) && MotionJson.stringify(phase(state, "out")) === exit, "remover efeito");
      send("phase-action", {target: state.target, phase: "in", action: "remove"});
      send("phase-action", {target: inspect().target, phase: "out", action: "remove"});
      var ok = l.comment === "original" && l.property("ADBE Effect Parade").numProperties === 0 && l.property("ADBE Marker").numKeys === 0 && !tr(l, "ADBE Rotate Z").expression && !tr(l, "ADBE Position").expression;
      clean(l); assert(ok, "sobrou algo na camada");
    });

    test("Um loop aplicado antes (v1) migra para o slot de efeito ao receber uma Entrada", function () {
      var l = solid("migracao");
      send("apply", args("momentum-spin-loop", {intensity: 120}));
      assert(l.comment.indexOf("[Moti.on.library.v1]") >= 0, "loop isolado continua v1");
      send("phase-apply", args("momentum-push", {phase: "in", durationFrames: 20}));
      var state = inspect(), effect = phase(state, "effect");
      assert(roles(state) === "in,effect" && effect.options.intensity === 120 && l.comment.indexOf("[Moti.on.library.v1]") < 0, roles(state));
      assert(near(sample(l, "ADBE Rotate Z", 2.5), 1.2 * spin(2.5, 0, 5)), "rotação migrada");
      clean(l);
    });

    test("Piscar entra e sai da janela sem estalo", function () {
      var l = solid("piscar");
      send("phase-apply", args("momentum-push", {phase: "in", durationFrames: 20}));
      send("apply", args("momentum-blink"));
      retime(l, 1, 2);
      var edges = [.95, 1, 3, 3.5], low = 100, high = 0, i;
      for (i = 0; i < edges.length; i++) assert(near(sample(l, "ADBE Opacity", edges[i]), 100), "visível fora da janela em " + edges[i]);
      for (i = 0; i < 40; i++) { var v = sample(l, "ADBE Opacity", 1.3 + i * .035); low = Math.min(low, v); high = Math.max(high, v); }
      assert(low < 1 && high > 99, "pisca no platô: " + low + "–" + high);
      clean(l); return {low: low, high: high};
    });

    test("A janela padrão evita o marcador do usuário no primeiro frame", function () {
      var l = solid("marcador"), user = new MarkerValue("Marcador do usuário");
      l.property("ADBE Marker").setValueAtTime(0, user);
      send("phase-apply", args("momentum-push", {phase: "in", durationFrames: 20}));
      send("apply", args("momentum-spin-loop"));
      var effect = phase(inspect(), "effect"), m = l.property("ADBE Marker"), kept = false;
      for (var i = 1; i <= m.numKeys; i++) if (m.keyValue(i).comment === "Marcador do usuário" && near(m.keyTime(i), 0)) kept = true;
      clean(l);
      assert(kept && near(effect.markerTime, comp.frameDuration) && near(effect.markerTime + effect.markerDuration, 5), "janela " + effect.markerTime + "+" + effect.markerDuration);
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
