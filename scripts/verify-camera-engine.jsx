// Verificação real do motor de câmera (ADR 0007) no After Effects.
//
// Exige um projeto NOVO e VAZIO (Arquivo > Novo > Novo projeto): o script cria as
// comps de QA, salva o projeto em artifacts\camera-verify\camera-qa.aep, reabre e
// confere de novo. Qualquer projeto com itens ou já salvo em disco é recusado sem
// mudar nada. Requer `npm run build` antes. Rodar com o AE aberto:
//   AfterFX.exe -r "<repo>\scripts\verify-camera-engine.jsx"
// Saída: artifacts\camera-verify\result.json e PNGs de quadros-chave.
//
// Mede no host o que o harness de Node só imita: a câmera padrão do AE no modo
// independente, a ordem Orientation → Rotate Z, `marker.key(i).parameters` dentro
// da expressão, o foco axial, o Bake e a reabertura do projeto.
(function () {
  var repo = File($.fileName).parent.parent.fsName, out = new Folder(repo + "/artifacts/camera-verify");
  if (!out.exists) out.create();
  var results = { host: app.version, build: app.buildName, os: $.os, startedAt: new Date().toString(), tests: [],
    notCovered: ["Undo em um passo: exige chamadas separadas (o dispatcher abre um único grupo; coberto no harness)."] };
  var FPS = 30, PX = 0.5, DEG = 0.05, comp = null, serial = 0, probeNames = [];
  var PLANES_2D = [
    { name: "QA Fundo", color: [0.10, 0.12, 0.18], size: [1188, 2112], at: [540, 960] },
    { name: "QA Artista", color: [0.85, 0.42, 0.22], size: [620, 980], at: [540, 1080] },
    { name: "QA Título", color: [0.95, 0.88, 0.30], size: [900, 260], at: [540, 420] },
    { name: "QA Logo", color: [0.30, 0.75, 0.95], size: [180, 180], at: [150, 150] }
  ];
  var PLANES_3D = [
    { name: "QA Fundo", color: [0.10, 0.12, 0.18], size: [2600, 4600], at: [540, 960, 1400] },
    { name: "QA Artista", color: [0.85, 0.42, 0.22], size: [620, 980], at: [540, 1060, 500] },
    { name: "QA Título", color: [0.95, 0.88, 0.30], size: [900, 260], at: [540, 420, 0] },
    { name: "QA Logo", color: [0.30, 0.75, 0.95], size: [180, 180], at: [150, 150, -300] }
  ];

  /** Own serializer: the result must be written even when the host failed to load. */
  function toJson(v) {
    if (v === null || v === undefined) return "null";
    if (typeof v === "number") return isFinite(v) ? String(v) : "null";
    if (typeof v === "boolean") return String(v);
    if (typeof v === "string") return "\"" + v.replace(/\\/g, "\\\\").replace(/"/g, "\\\"").replace(/\r/g, "\\r").replace(/\n/g, "\\n").replace(/\t/g, "\\t") + "\"";
    var parts = [], k;
    if (v instanceof Array) { for (k = 0; k < v.length; k++) parts.push(toJson(v[k])); return "[" + parts.join(",") + "]"; }
    for (k in v) if (v.hasOwnProperty(k)) parts.push(toJson(String(k)) + ":" + toJson(v[k]));
    return "{" + parts.join(",") + "}";
  }
  function save() { var f = new File(out.fsName + "/result.json"); f.encoding = "UTF-8"; f.open("w"); f.write(toJson(results)); f.close(); }
  function assert(value, message) { if (!value) throw new Error(message); }
  function test(name, fn) {
    try { var detail = fn(); results.tests.push({ name: name, status: "PASS", detail: detail || null }); }
    catch (e) { results.tests.push({ name: name, status: "FAIL", error: String(e), line: e.line || null }); }
    save();
  }
  /** Plain numbers: concatenating an After Effects array into a string throws. */
  function nums(v) { if (!(v instanceof Array)) return [Number(v)]; var o = []; for (var i = 0; i < v.length; i++) o.push(Number(v[i])); return o; }
  function round(x) { return Math.round(x * 10000) / 10000; }
  /** Every command acts on the active comp: refuse to send anywhere but the QA comp. */
  function guard() { if (app.project.activeItem !== comp) comp.openInViewer(); if (app.project.activeItem !== comp) throw new Error("A comp de QA não está ativa; nada foi enviado."); }
  function send(command, args, destructive) {
    guard();
    return MotionJson.parse(MotionAE.dispatch(MotionJson.stringify({ protocolVersion: 1, requestId: "camera-" + (++serial), command: command,
      args: args || {}, context: { host: "after-effects", hostVersion: app.version, locale: "pt-BR" }, options: destructive ? { allowDestructive: true } : {} })));
  }
  function ok(r, what) { assert(r && r.ok, what + ": " + MotionJson.stringify(r && (r.error || r))); return r; }
  function layer(name) { for (var i = 1; i <= comp.numLayers; i++) if (comp.layer(i).name === name) return comp.layer(i); throw new Error("Camada ausente: " + name); }
  function times(from, to, count) { var o = []; for (var i = 0; i < count; i++) o.push(from + (to - from) * i / (count - 1)); return o; }
  /** saveFrameToPng returns before the file is flushed: wait until its size is non-zero and stops changing. */
  function png(name, t) {
    var path = out.fsName + "/" + name + ".png", f = new File(path), size = 0, last = -1;
    if (f.exists) f.remove();
    comp.saveFrameToPng(t, f);
    for (var i = 0; i < 150; i++) { size = Math.max(0, new File(path).length); if (size > 0 && size === last) break; last = size; $.sleep(100); }
    return size;
  }

  /* ------------------------------------------------------------- scenes */

  function scene(name, planes, threeD) {
    comp = app.project.items.addComp(name, 1080, 1920, 1, 12, FPS);
    comp.openInViewer();
    for (var i = 0; i < planes.length; i++) {
      var p = planes[i], l = comp.layers.addSolid(p.color, p.name, p.size[0], p.size[1], 1, comp.duration);
      if (threeD) l.threeDLayer = true;
      l.property("ADBE Transform Group").property("ADBE Position").setValue(p.at);
    }
    return comp;
  }
  /** One guide null with a Point control per sampled point: toComp is the screen,
   * toWorld (3D Point) the world point after every member expression. */
  function probes(planes) {
    var probe = comp.layers.addNull(comp.duration), parade = probe.property("ADBE Effect Parade");
    probe.name = "QA probe"; probe.guideLayer = true; probeNames = [];
    for (var i = 0; i < planes.length; i++) {
      var w = planes[i].size[0], h = planes[i].size[1], points = [[0, 0], [w, 0], [0, h], [w, h], [w / 2, h / 2]];
      for (var j = 0; j < points.length; j++) {
        var id = planes[i].name + " " + j, target = "thisComp.layer(" + MotionJson.stringify(planes[i].name) + ")", at = "[" + points[j][0] + "," + points[j][1] + ",0]";
        var s = parade.addProperty("ADBE Point Control"); s.name = "S " + id;
        s.property(1).expression = target + ".toComp(" + at + ").slice(0,2)";
        var g = parade.addProperty("ADBE Point3D Control"); g.name = "W " + id;
        g.property(1).expression = target + ".toWorld(" + at + ")";
        probeNames.push(id);
      }
    }
  }
  function probe(kind, id, t) {
    var p = layer("QA probe").property("ADBE Effect Parade").property(kind + " " + id).property(1), v = p.valueAtTime(t, false);
    if (p.expressionError) throw new Error("sonda " + id + ": " + p.expressionError);
    return nums(v);
  }
  function screens(t) { var o = []; for (var i = 0; i < probeNames.length; i++) o.push(probe("S", probeNames[i], t)); return o; }
  function worstShift(a, b) { var w = 0; for (var i = 0; i < a.length; i++) w = Math.max(w, Math.sqrt(Math.pow(a[i][0] - b[i][0], 2) + Math.pow(a[i][1] - b[i][1], 2))); return w; }

  /* ----------------------------------------------- kernel, from the meta */

  function engine() { var e = MotionCameraRig.findEngine(comp); assert(e, "sem rig de câmera"); MotionCameraRig.syncTiming(e.controller, e.meta); return e; }
  function control(e, name, t, fallback) { var c = MotionCameraRig.child(e.controller.property("ADBE Effect Parade"), name); return c ? Number(c.property(1).valueAtTime(t, true)) : fallback; }
  /** The pose the expressions should produce at t, built like the expression prelude. */
  function expected(t) {
    var e = engine(), meta = e.meta, frame = MotionCameraRig.copy(meta.frame), shots = [], i;
    frame.cover = control(e, meta.controls.cover, t, frame.cover) ? 1 : 0;
    var gain = control(e, meta.controls.intensity, t, 100) / 100;
    for (i = 0; i < meta.shots.length; i++) {
      var s = meta.shots[i], sp = s.shape;
      shots.push({ id: s.id, kind: sp.kind, start: s.start, dur: s.dur, amount: control(e, s.control, t, s.amount) / 100 * gain, dir: sp.dir,
        curve: sp.curve, tr: sp.tr, rot: sp.rot, orb: sp.orb, lens: sp.lens, dolly: sp.dolly, imp: sp.imp, org: sp.org });
    }
    var pose = MotionCameraCore.camPose(t, frame, shots);
    var zoomBase = Number(e.camera.property("ADBE Camera Options Group").property("ADBE Camera Zoom").valueAtTime(t, true));
    pose.zoom = pose.zoom * (zoomBase / frame.zoom) * Math.max(1, control(e, meta.controls.lens, t, 100)) / 100;
    return pose;
  }
  /** Largest screen distance between After Effects and the kernel at t, over every probe. */
  function parity(t) {
    var pose = expected(t), worst = 0;
    for (var i = 0; i < probeNames.length; i++) {
      var s = probe("S", probeNames[i], t), w = probe("W", probeNames[i], t), k = MotionCameraCore.camProject(pose, w, comp.width / 2, comp.height / 2);
      worst = Math.max(worst, Math.sqrt(Math.pow(k[0] - s[0], 2) + Math.pow(k[1] - s[1], 2)));
    }
    return worst;
  }
  function parityOver(list) {
    var worst = 0, at = 0, i;
    for (i = 0; i < list.length; i++) { var err = parity(list[i]); if (err > worst) { worst = err; at = list[i]; } }
    return { maxErrorPx: round(worst), at: round(at), samples: list.length };
  }
  function cleanExpressions(list) {
    var e = engine(), errors = [], started = new Date().getTime(), i, k;
    for (k = 0; k < list.length; k++) {
      for (i = 0; i < MotionCameraRig.TARGETS.length; i++) {
        var target = MotionCameraRig.TARGETS[i], owner = target.owner === "controller" ? e.controller : e.camera, prop = MotionCameraRig.locate(owner, target.path);
        prop.valueAtTime(list[k], false);
        if (prop.expressionError) errors.push(target.key + " @" + round(list[k]) + ": " + prop.expressionError);
      }
    }
    assert(!errors.length, errors.join(" | "));
    return { msPerFrame: round((new Date().getTime() - started) / list.length), frames: list.length };
  }
  /** Worst distance (px) a comp corner falls outside the background as After Effects projects it. */
  function uncoveredPx(t) {
    var q = [probe("S", "QA Fundo 0", t), probe("S", "QA Fundo 1", t), probe("S", "QA Fundo 3", t), probe("S", "QA Fundo 2", t)];
    var corners = [[0, 0], [comp.width, 0], [comp.width, comp.height], [0, comp.height]], area = 0, worst = 0, i, j;
    for (i = 0; i < 4; i++) area += q[i][0] * q[(i + 1) % 4][1] - q[(i + 1) % 4][0] * q[i][1];
    for (j = 0; j < 4; j++) {
      for (i = 0; i < 4; i++) {
        var a = q[i], b = q[(i + 1) % 4], ex = b[0] - a[0], ey = b[1] - a[1];
        var inside = (area > 0 ? 1 : -1) * (ex * (corners[j][1] - a[1]) - ey * (corners[j][0] - a[0])) / Math.sqrt(ex * ex + ey * ey);
        worst = Math.max(worst, -inside);
      }
    }
    return worst;
  }
  function angle(a, b) { var d = (a - b) % 360; if (d > 180) d -= 360; if (d < -180) d += 360; return Math.abs(d); }

  app.beginSuppressDialogs();
  try {
    if (!app.project) {
      results.fatal = "O After Effects ainda não tem projeto aberto (tela inicial). Abra um projeto novo e vazio e rode de novo.";
      return;
    }
    if (app.project.numItems !== 0 || app.project.file !== null) {
      results.fatal = "Abra um projeto novo e vazio antes de rodar: o script salva e reabre o projeto de QA. Nada foi alterado.";
      return;
    }
    $.evalFile(new File(repo + "/dist/after-effects-cep/host/index.jsx"));
    if (app.project.expressionEngine !== "javascript-1.0") app.project.expressionEngine = "javascript-1.0";
    results.pluginVersion = MotionContracts.PLUGIN_VERSION;
    var every = [], f;
    for (f = 0; f < 12 * FPS; f += 3) every.push(f / FPS);

    /* ---------------------------------------------------- standalone */

    scene("Moti.on QA Câmera · Independente", PLANES_3D, true);
    probes(PLANES_3D);
    results.renderer = comp.renderer;
    var reference = screens(0.5);

    test("Independente: o rig criado reproduz a câmera padrão do AE antes do shot", function () {
      var r = ok(send("ae.camera.shot.apply", { presetId: "hero-push", startSeconds: 1 }), "aplicar");
      assert(r.data.mode === "standalone", "modo " + r.data.mode);
      var shift = worstShift(screens(0.5), reference);
      assert(shift <= PX, "o quadro mudou " + shift + " px");
      var meta = engine().meta;
      assert(meta.pluginVersion === MotionContracts.PLUGIN_VERSION, "pluginVersion " + meta.pluginVersion);
      return { shiftPx: round(shift), zoom: round(meta.frame.zoom), png: png("independente-0.5s", 0.5) };
    });

    test("Independente: Hero Push, Depth Slide, Arc Hero e Float Loop batem com o núcleo", function () {
      ok(send("ae.camera.shot.apply", { presetId: "depth-slide", startSeconds: 5.5 }), "depth-slide");
      ok(send("ae.camera.shot.apply", { presetId: "arc-hero", startSeconds: 8.5, durationSeconds: 3 }), "arc-hero");
      // Pan, tilt and roll together: the case where an Orientation from lookAt would roll.
      ok(send("ae.camera.shot.adjust", { shotId: "s3", rot: [14, -8, 5], orb: [10, 6] }), "ajustar arc-hero");
      ok(send("ae.camera.shot.apply", { presetId: "float-loop", intensity: 80, seed: 7 }), "float-loop");
      var p = parityOver(every);
      assert(p.maxErrorPx <= PX, "erro " + p.maxErrorPx + " px em " + p.at + " s");
      return { parity: p, pngs: [png("independente-3s", 3), png("independente-7s", 7), png("independente-11s", 11)] };
    });

    test("Independente: expressões sem erro em todos os quadros", function () {
      var list = []; for (f = 0; f < 12 * FPS; f++) list.push(f / FPS);
      return cleanExpressions(list);
    });

    test("Independente: arrastar o marcador muda o tempo do shot dentro da expressão", function () {
      var e = engine(), markers = e.controller.property("ADBE Marker"), index = 0, i;
      for (i = 1; i <= markers.numKeys; i++) if (markers.keyValue(i).getParameters()["Moti.on.shot"] === "s1") index = i;
      assert(index, "marcador do s1 ausente");
      var value = markers.keyValue(index); markers.removeKey(index); value.duration = 2; markers.setValueAtTime(2, value);
      var p = parityOver(times(1.5, 4.5, 13));
      assert(p.maxErrorPx <= PX, "a expressão ignorou o marcador: " + p.maxErrorPx + " px");
      var meta = engine().meta, shot = null;
      for (i = 0; i < meta.shots.length; i++) if (meta.shots[i].id === "s1") shot = meta.shots[i];
      assert(Math.abs(shot.start - 2) < 0.0001 && Math.abs(shot.dur - 2) < 0.0001, "inspect leu " + shot.start + "/" + shot.dur);
      return { parity: p };
    });

    test("Independente: foco no alvo pela profundidade axial", function () {
      var e = engine(), meta = e.meta, parade = e.controller.property("ADBE Effect Parade");
      MotionCameraRig.child(parade, meta.controls.focusTarget).property(1).setValue(layer("QA Título").index);
      MotionCameraRig.child(parade, meta.controls.focusSmooth).property(1).setValue(0);
      var focus = e.camera.property("ADBE Camera Options Group").property("ADBE Camera Focus Distance"), worst = 0, list = [0.5, 2.6, 6.2, 9.4], i;
      for (i = 0; i < list.length; i++) {
        var pose = expected(list[i]), target = probe("W", "QA Título 4", list[i]), ref = [meta.frame.cx, meta.frame.cy, meta.frame.pz];
        var fb = Math.max(1, (ref[0] - pose.c[0]) * pose.f[0] + (ref[1] - pose.c[1]) * pose.f[1] + (ref[2] - pose.c[2]) * pose.f[2]);
        var want = MotionCameraCore.camFocusDepth(pose.c, pose.f, target, 0, 50, fb), got = Number(focus.valueAtTime(list[i], false));
        assert(!focus.expressionError, focus.expressionError);
        worst = Math.max(worst, Math.abs(want - got));
      }
      assert(worst <= PX, "foco " + worst + " px fora");
      return { maxErrorPx: round(worst) };
    });

    test("Independente: motion blur renderiza no shot rápido", function () {
      ok(send("ae.camera.shot.apply", { presetId: "punch-in", startSeconds: 4 }), "punch-in");
      // Frame 121: inside the attack (16% of 0.55 s), where the push is fastest.
      var peak = 121 / FPS, sharp = png("punch-in-sem-blur", peak);
      comp.motionBlur = true;
      for (var i = 0; i < PLANES_3D.length; i++) layer(PLANES_3D[i].name).motionBlur = true;
      var blurred = png("punch-in-com-blur", peak);
      assert(sharp > 0 && blurred > 0, "PNG vazio");
      return { pngSharp: sharp, pngBlur: blurred, shutterAngle: comp.shutterAngle };
    });

    test("Independente: Bake reproduz o movimento e desliga o motor", function () {
      var e = engine(), before = [], angles = [], i;
      var orientation = MotionCameraRig.locate(e.controller, ["ADBE Transform Group", "ADBE Orientation"]), roll = MotionCameraRig.locate(e.controller, ["ADBE Transform Group", "ADBE Rotate Z"]);
      for (i = 0; i < every.length; i++) { before.push(screens(every[i])); angles.push(nums(orientation.valueAtTime(every[i], false)).concat(nums(roll.valueAtTime(every[i], false)))); }
      var r = ok(send("ae.camera.bake", { stepFrames: 1 }), "bake"), worst = 0, worstAngle = 0;
      // Bake removed the rig controls from this layer: fetch the transform again.
      orientation = e.controller.property("ADBE Transform Group").property("ADBE Orientation");
      roll = e.controller.property("ADBE Transform Group").property("ADBE Rotate Z");
      for (i = 0; i < every.length; i++) {
        worst = Math.max(worst, worstShift(screens(every[i]), before[i]));
        var now = nums(orientation.valueAtTime(every[i], false)).concat(nums(roll.valueAtTime(every[i], false)));
        for (var j = 0; j < 4; j++) worstAngle = Math.max(worstAngle, angle(now[j], angles[i][j]));
      }
      assert(!MotionCameraRig.findEngine(comp), "o motor continuou ligado");
      assert(orientation.expression === "" && orientation.numKeys > 0, "Orientation não foi assada");
      assert(worst <= PX && worstAngle <= DEG, "bake " + worst + " px / " + worstAngle + "°");
      return { samples: r.data.samples, maxErrorPx: round(worst), maxErrorDeg: round(worstAngle) };
    });

    test("Independente: depois do Bake a cena tem câmera e o inspect explica", function () {
      var data = ok(send("ae.camera.inspect", {}), "inspect").data;
      assert(!data.rig && /câmera/.test(data.problem), MotionJson.stringify(data));
      return { problem: data.problem };
    });

    /* ------------------------------------------------------ parallax */

    scene("Moti.on QA Câmera · Parallax", PLANES_2D, false);
    probes(PLANES_2D);
    var flat = screens(0.5), i;
    for (i = 1; i <= comp.numLayers; i++) comp.layer(i).selected = false;
    for (i = 0; i < PLANES_2D.length; i++) layer(PLANES_2D[i].name).selected = true;
    var withParallax = null;

    test("Parallax: o rig mantém o layout 2D", function () {
      ok(send("ae.animate.parallax.quick", { depthStep: 0, strength: 1, orderMode: "timeline", createCamera: true, preserveFraming: true, controllerName: "Parallax", depthMode: "area" }), "parallax");
      withParallax = screens(0.5);
      var shift = worstShift(withParallax, flat);
      assert(shift <= PX, "o Parallax mudou o quadro " + shift + " px");
      return { shiftPx: round(shift) };
    });

    test("Parallax: Hero Push começa no layout e segue o núcleo", function () {
      var r = ok(send("ae.camera.shot.apply", { presetId: "hero-push", startSeconds: 1 }), "hero-push");
      assert(r.data.mode === "parallax", "modo " + r.data.mode);
      var shift = worstShift(screens(0.5), withParallax);
      assert(shift <= PX, "o quadro mudou " + shift + " px antes do shot");
      ok(send("ae.camera.shot.apply", { presetId: "depth-slide", startSeconds: 5.5 }), "depth-slide");
      ok(send("ae.camera.shot.apply", { presetId: "whip-reframe", startSeconds: 9 }), "whip-reframe");
      ok(send("ae.camera.shot.apply", { presetId: "float-loop", intensity: 70 }), "float-loop");
      var p = parityOver(every);
      assert(p.maxErrorPx <= PX, "erro " + p.maxErrorPx + " px em " + p.at + " s");
      // Pan turns the background oblique: every comp corner must stay on it.
      var gap = 0, gapAt = 0;
      for (var k = 0; k < every.length; k++) { var u = uncoveredPx(every[k]); if (u > gap) { gap = u; gapAt = every[k]; } }
      assert(gap <= PX, "borda do fundo aparece: " + gap + " px em " + gapAt + " s");
      return { shiftPx: round(shift), parity: p, uncoveredPx: round(gap), uncoveredAt: round(gapAt), margin: engine().meta.frame.margin,
        pngs: [png("parallax-3s", 3), png("parallax-7s", 7), png("parallax-10s", 10)] };
    });

    test("Parallax: a remoção do Parallax espera a câmera sair", function () {
      var r = send("ae.parallax.remove", {}, true);
      assert(!r.ok, "removeu o Parallax com o motor ligado");
      return { code: r.error && r.error.code, message: r.error && r.error.message };
    });

    /* -------------------------------------------------- save, reopen */

    var file = new File(out.fsName + "/camera-qa.aep");
    test("Salvar e reabrir: o rig vivo volta igual", function () {
      var before = parityOver(times(0.2, 11.8, 9));
      app.project.save(file);
      app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);
      app.open(file);
      comp = null;
      for (var k = 1; k <= app.project.numItems; k++) if (app.project.item(k) instanceof CompItem && app.project.item(k).name === "Moti.on QA Câmera · Parallax") comp = app.project.item(k);
      assert(comp, "comp de QA ausente após reabrir");
      comp.openInViewer();
      var after = parityOver(times(0.2, 11.8, 9));
      cleanExpressions(times(0, 11.9, 24));
      assert(after.maxErrorPx <= PX, "após reabrir: " + after.maxErrorPx + " px");
      return { before: before, after: after };
    });

    test("Parallax: remover a câmera e depois o Parallax devolve as camadas 2D", function () {
      var master = engine().controller;
      ok(send("ae.camera.remove", {}, true), "remover câmera");
      assert(String(master.comment).indexOf(MotionCameraRig.TAG) < 0, "metadados do motor ficaram");
      assert(master.property("ADBE Transform Group").property("ADBE Position").expression === "", "expressão ficou no master");
      var shift = worstShift(screens(0.5), withParallax);
      ok(send("ae.parallax.remove", {}, true), "remover Parallax");
      for (var k = 0; k < PLANES_2D.length; k++) assert(!layer(PLANES_2D[k].name).threeDLayer, PLANES_2D[k].name + " continua 3D");
      var back = worstShift(screens(0.5), flat);
      assert(shift <= PX && back <= PX, "quadro " + shift + " / " + back + " px");
      return { afterCameraPx: round(shift), after2dPx: round(back) };
    });

    /* ------------------------------------------- demo left for review */

    scene("Moti.on QA Câmera · Demo", PLANES_2D, false);
    for (i = 1; i <= comp.numLayers; i++) comp.layer(i).selected = comp.layer(i).name.indexOf("QA ") === 0;
    test("Demo: Parallax + Hero Push + Float Loop fica no projeto para revisão", function () {
      ok(send("ae.animate.parallax.quick", { depthStep: 0, strength: 1, orderMode: "timeline", createCamera: true, preserveFraming: true, controllerName: "Parallax" }), "parallax");
      ok(send("ae.camera.shot.apply", { presetId: "hero-push", startSeconds: 0.5 }), "hero-push");
      ok(send("ae.camera.shot.apply", { presetId: "float-loop", intensity: 60 }), "float-loop");
      app.project.save(file);
      return { project: file.fsName };
    });
  } catch (fatal) {
    results.fatal = String(fatal); results.line = fatal.line || null;
  } finally {
    app.endSuppressDialogs(false);
    var pass = 0; for (var t = 0; t < results.tests.length; t++) if (results.tests[t].status === "PASS") pass++;
    results.summary = { pass: pass, total: results.tests.length }; results.finishedAt = new Date().toString();
    save();
  }
})();
