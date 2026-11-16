// Verificação real de motion blur ao aplicar (T5) e das curvas clássicas (T6)
// no After Effects. Rodar com o AE já aberto e o projeto do usuário salvo:
//   AfterFX.exe -r "<repo>\scripts\verify-motion-blur-easing.jsx"
// Carrega o host compilado (dist), cria uma comp de QA e a remove no fim, com
// os sólidos que criou; o projeto não é salvo. Cada comando só é enviado com a
// comp de QA ativa. Saída: artifacts\motion-blur-easing-verify\result.json.
// Requer `npm run build` antes.
(function () {
  var repo = File($.fileName).parent.parent.fsName, out = new Folder(repo + "/artifacts/motion-blur-easing-verify");
  if (!out.exists) out.create();
  var results = {host: app.version, build: app.buildName, os: $.os, startedAt: new Date().toString(), tests: []};
  var previous = app.project.activeItem, comp = null, serial = 0, sources = [];
  function save() { var f = new File(out.fsName + "/result.json"); f.encoding = "UTF-8"; f.open("w"); f.write(MotionJson.stringify(results)); f.close(); }
  function assert(value, message) { if (!value) throw new Error(message); }
  function test(name, fn) {
    try { var detail = fn(); results.tests.push({name: name, status: "PASS", detail: detail || null}); }
    catch (e) { results.tests.push({name: name, status: "FAIL", error: String(e), line: e.line || null}); }
  }
  /** Every command acts on the active comp: refuse to run anywhere but the QA comp. */
  function guard() { if (app.project.activeItem !== comp) comp.openInViewer(); if (app.project.activeItem !== comp) throw new Error("A comp de QA não está ativa; nada foi enviado."); }
  function send(command, args) {
    guard();
    var r = MotionJson.parse(MotionAE.dispatch(MotionJson.stringify({protocolVersion: 1, requestId: "blur-ease-" + (++serial),
      command: "ae.presets." + command, args: args, context: {host: "after-effects", hostVersion: app.version, locale: "pt-BR"}, options: {preserveSelection: true}})));
    if (command !== "inspect") assert(r.ok, command + ": " + MotionJson.stringify(r.error || r));
    return r;
  }
  function inspect() { var state = send("inspect", {}).data; assert(state.state === "ready", state.message); return state; }
  function find(id) { for (var i = 0; i < MotionLibraryCatalog.length; i++) if (MotionLibraryCatalog[i].id === id) return MotionLibraryCatalog[i]; throw new Error("Preset ausente: " + id); }
  function args(id, over) {
    var p = find(id), o = {presetId: id, phase: "in", direction: "preset", durationFrames: 24, intensity: 100, staggerFrames: 0, unit: "preset"}, k;
    if (p.defaults) for (k in p.defaults) if (p.defaults.hasOwnProperty(k)) o[k] = p.defaults[k];
    if (over) for (k in over) if (over.hasOwnProperty(k)) o[k] = over[k];
    o.presetId = id; return o;
  }
  function solid(name) {
    for (var i = 1; i <= comp.numLayers; i++) comp.layer(i).selected = false;
    var l = comp.layers.addSolid([.85, .3, .55], name, 240, 240, 1, 5); sources.push(l.source); l.selected = true; return l;
  }
  function select(l) { for (var i = 1; i <= comp.numLayers; i++) comp.layer(i).selected = comp.layer(i) === l; }
  function clean(l) { try { l.remove(); } catch (ignored) {} }

  app.beginSuppressDialogs();
  try {
    $.evalFile(new File(repo + "/dist/after-effects-cep/host/index.jsx"));
    comp = app.project.items.addComp("Moti.on QA Motion blur e curvas", 1920, 1080, 1, 5, 30); comp.openInViewer();
    comp.motionBlur = false;

    test("Motion blur ao aplicar liga camada e composição; Remover desliga só o que o Moti.on ligou", function () {
      var l = solid("blur");
      send("apply", args("momentum-spin-loop", {motionBlur: true}));
      assert(l.motionBlur === true && comp.motionBlur === true, "não ligou: camada " + l.motionBlur + ", comp " + comp.motionBlur);
      assert(inspect().options.motionBlur === true, "inspeção sem motionBlur");
      send("remove", {});
      var ok = l.motionBlur === false && comp.motionBlur === false; clean(l);
      assert(ok, "não desligou");
    });

    test("Switches que o usuário ligou continuam ligados depois de Remover", function () {
      var l = solid("usuario"); l.motionBlur = true; comp.motionBlur = true;
      send("apply", args("momentum-spin-loop", {motionBlur: true}));
      send("remove", {});
      var ok = l.motionBlur === true && comp.motionBlur === true; clean(l); comp.motionBlur = false;
      assert(ok, "desligou o que era do usuário");
    });

    test("A composição continua com motion blur enquanto outra camada usa", function () {
      var other = solid("outra"), l = solid("blur-2");
      send("apply", args("momentum-spin-loop", {motionBlur: true}));
      other.motionBlur = true; select(l);
      send("remove", {});
      // Read everything before removing the layers: a removed layer is an invalid object.
      var detail = "camada " + l.motionBlur + ", comp " + comp.motionBlur, ok = l.motionBlur === false && comp.motionBlur === true;
      clean(l); clean(other); comp.motionBlur = false;
      assert(ok, detail);
    });

    test("Fases: a camada mantém motion blur enquanto alguma fase pedir", function () {
      var l = solid("fases");
      send("phase-apply", args("momentum-push", {phase: "in", durationFrames: 20, motionBlur: true}));
      send("phase-apply", args("momentum-push-spin", {phase: "out", durationFrames: 20}));
      assert(l.motionBlur && comp.motionBlur, "entrada não ligou");
      var state = inspect();
      send("phase-action", {target: state.target, phase: "in", action: "remove"});
      var off = l.motionBlur === false && comp.motionBlur === false;
      send("phase-action", {target: inspect().target, phase: "out", action: "remove"});
      clean(l); assert(off, "ao remover a única fase com motion blur, os switches deviam desligar");
    });

    test("As 18 curvas clássicas: o AE avalia exatamente libraryEase em cada frame", function () {
      var recipe = null, worst = 0, checked = 0, i, k;
      for (i = 0; i < MotionLibraryCatalog.length && !recipe; i++) {
        var c = MotionLibraryCatalog[i];
        // Rotation is value + angle × weight: it reads the curve directly.
        if (c.mode === "transition" && !c.collection && c.category === "motion-2d" && c.rotation[2] && c.waveform === "none" && !c.choreography && c.pivot === "anchor") recipe = c;
      }
      assert(recipe, "nenhuma receita clássica com rotação no catálogo");
      var families = ["sine", "quad", "quart", "quint", "expo", "circ"], shapes = ["in", "out", "in-out"], duration = 20 / 30;
      for (i = 0; i < families.length; i++) for (k = 0; k < shapes.length; k++) {
        var kind = families[i] + "-" + shapes[k], l = solid(kind), rz = l.property("ADBE Transform Group").property("ADBE Rotate Z");
        send("phase-apply", args(recipe.id, {phase: "in", durationFrames: 20, easing: kind}));
        for (var f = 0; f <= 20; f++) {
          var t = f / 30, value = rz.valueAtTime(t, false);
          if (rz.expressionError) throw new Error(kind + ": " + rz.expressionError);
          var expected = recipe.rotation[2] * (1 - MotionLibraryCore.libraryEase(t / duration, kind, 30));
          worst = Math.max(worst, Math.abs(value - expected)); checked++;
        }
        clean(l);
      }
      assert(worst < .0001, "diferença máxima " + worst);
      return {recipe: recipe.id, samples: checked, worst: worst};
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
