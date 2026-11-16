/**
 * Camera choreographies (ADR 0007): reads the 3D layers of the scene and writes
 * a planned chain of "visit" shots — deep start, reveal through the layers,
 * framings with the focus racking to each layer, return to the design — plus
 * an optional breathing loop. Each beat gets its own marker; all beats share
 * one intensity control and a group id, so the choreography is adjusted and
 * removed as a whole.
 *
 * Preflight validates everything with the project untouched; the dispatcher
 * opens the single Undo group. A failed run restores expressions, markers,
 * controls, metadata, motion blur and any layer it created.
 */
(function () {
  var Rig = typeof MotionCameraRig !== "undefined" ? MotionCameraRig : /** @type {any} */ (null);
  /** @type {Record<string, number>} */
  var KEYS = { choreographyId: 1, startSeconds: 1, durationSeconds: 1, order: 1, layers: 1, focus: 1, motionBlur: 1, life: 1, intensity: 1, maxSubjects: 1, depth: 1 };
  /** @type {Record<string, number>} */
  var ORDERS = { auto: 1, "back-to-front": 1, "front-to-back": 1, reading: 1, spread: 1 };
  /** The deep start's default travel into the scene, px of Z (CAMERA_DEEP_START_PX). */
  var DEEP_START = 2500;
  /** Most focus racks a choreography writes. */
  var MAX_FOCUS = 10;

  /** @param {string} code @param {string} message @param {any} [details] @returns {MotionCommandFailure} */
  function failure(code, message, details) { return { code: code, message: message, recoverable: true, details: details || null }; }
  /** @param {unknown} v @param {number} min @param {number} max @returns {boolean} */
  function inRange(v, min, max) { return typeof v === "number" && isFinite(v) && v >= min && v <= max; }
  /** @param {any} e @returns {string} */
  function messageOf(e) { return e && typeof e.message === "string" ? e.message : String(e); }
  /** @param {any} context @returns {string} */
  function localeOf(context) { return context && typeof context.locale === "string" ? context.locale : "pt-BR"; }
  /** @param {string} locale @returns {boolean} */
  function english(locale) { return locale.indexOf("en") === 0; }
  /** @param {string} id @returns {any} */
  function recipeOf(id) {
    var list = /** @type {any} */ ($.global).MotionCameraChoreographies || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  /** Start and length of the choreography inside the comp. @param {any} comp @param {any} recipe @param {any} args @returns {any} */
  function windowOf(comp, recipe, args) {
    var start = typeof args.startSeconds === "number" ? args.startSeconds : comp.time;
    var dur = typeof args.durationSeconds === "number" ? args.durationSeconds : recipe.durationSeconds;
    return [start, Math.min(dur, comp.duration - start)];
  }
  /** The plan the run will write, computed without touching the project. The
   * layers are read halfway through the choreography, where entrance animations
   * have settled. The focus racks fit in what is left of the shot limit.
   * @param {any} p @param {any} recipe @param {any} args @returns {any} */
  function planOf(p, recipe, args) {
    var comp = p.comp, frame = Rig.frameOf(p), win = windowOf(comp, recipe, args);
    var scene = Rig.scene(p, frame, args.layers === "selection", win[0] + win[1] / 2);
    var core = /** @type {any} */ ($.global).MotionCameraCore;
    var budget = Rig.MAX_SHOTS - (p.meta ? p.meta.shots.length : 0) - (args.life === false ? 0 : 1);
    var opts = { start: win[0], duration: win[1], frame: comp.frameDuration, order: args.order || "auto",
      maxSubjects: typeof args.maxSubjects === "number" ? args.maxSubjects : 0, depth: typeof args.depth === "number" ? args.depth : DEEP_START,
      focus: args.focus !== false, maxFocus: MAX_FOCUS };
    var plan = core.camPlanChoreography(scene, frame, recipe, opts);
    if (plan.beats.length + plan.focus.length > budget) {
      opts.maxFocus = budget - plan.beats.length;
      opts.focus = opts.focus && opts.maxFocus > 0;
      plan = core.camPlanChoreography(scene, frame, recipe, opts);
    }
    return { frame: frame, scene: scene, plan: plan, start: win[0], duration: win[1], budget: budget };
  }

  /** @param {any} args @returns {MotionCommandFailure|null} */
  function preflight(args) {
    var key;
    for (key in args) if (Object.prototype.hasOwnProperty.call(args, key) && KEYS[key] !== 1) return failure(MotionContracts.ERROR.INVALID_PRESET, "Coreografia: argumento inválido.", { field: key });
    var recipe = typeof args.choreographyId === "string" ? recipeOf(args.choreographyId) : null;
    if (!recipe) return failure(MotionContracts.ERROR.INVALID_PRESET, "Coreografia: desconhecida.", { field: "choreographyId" });
    if (args.order !== undefined && ORDERS[args.order] !== 1) return failure(MotionContracts.ERROR.INVALID_PRESET, "Coreografia: ordem inválida.", { field: "order" });
    if (args.layers !== undefined && args.layers !== "auto" && args.layers !== "selection") return failure(MotionContracts.ERROR.INVALID_PRESET, "Coreografia: camadas inválidas.", { field: "layers" });
    if (args.intensity !== undefined && !inRange(args.intensity, 0, 200)) return failure(MotionContracts.ERROR.INVALID_PRESET, "Coreografia: intensidade fora de 0–200%.", { field: "intensity" });
    if (args.maxSubjects !== undefined && (!inRange(args.maxSubjects, 1, 6) || Math.floor(args.maxSubjects) !== args.maxSubjects)) return failure(MotionContracts.ERROR.INVALID_PRESET, "Coreografia: de 1 a 6 camadas.", { field: "maxSubjects" });
    if (args.depth !== undefined && !inRange(args.depth, 0, 20000)) return failure(MotionContracts.ERROR.INVALID_PRESET, "Coreografia: profundidade entre 0 e 20000 px.", { field: "depth" });
    for (key in { focus: 1, motionBlur: 1, life: 1 }) if (args[key] !== undefined && typeof args[key] !== "boolean") return failure(MotionContracts.ERROR.INVALID_PRESET, "Coreografia: opção inválida.", { field: key });
    if (typeof app === "undefined" || !app.project) return failure(MotionContracts.ERROR.NO_ACTIVE_PROJECT, "Nenhum projeto aberto.");
    if (!(app.project.activeItem instanceof CompItem)) return failure(MotionContracts.ERROR.NO_ACTIVE_COMP, "Abra uma composição.");
    var comp = /** @type {any} */ (app.project.activeItem);
    if (args.startSeconds !== undefined && !inRange(args.startSeconds, 0, comp.duration - 2)) return failure(MotionContracts.ERROR.INVALID_PRESET, "Coreografia: começa tarde demais (precisa de 2 s na composição).", { field: "startSeconds" });
    if (args.durationSeconds !== undefined && !inRange(args.durationSeconds, 2, 120)) return failure(MotionContracts.ERROR.INVALID_PRESET, "Coreografia: duração entre 2 e 120 s.", { field: "durationSeconds" });
    try {
      var p = Rig.plan(comp, true);
      Rig.checkWritable(p);
      var win = windowOf(comp, recipe, args);
      if (win[1] < 2) return failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Coreografia: faltam pelo menos 2 s até o fim da composição.");
      var whole = planOf(p, recipe, args), planned = whole.plan;
      if (planned.main < 0) return failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, args.layers === "selection" ?
        "Coreografia: selecione camadas 3D visíveis além do fundo." : "Coreografia: precisa de pelo menos uma camada 3D visível além do fundo.");
      if (planned.beats.length > whole.budget) return failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Câmera: limite de " + Rig.MAX_SHOTS + " shots por composição. Remova shots antes.");
    } catch (e) {
      return failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, messageOf(e));
    }
    return null;
  }

  /** Marker label of a beat. @param {any} recipe @param {any} beat @param {any[]} scene @param {number} index @param {number} total @param {string} locale @returns {string} */
  function beatLabel(recipe, beat, scene, index, total, locale) {
    var en = english(locale), what = beat.role === "deep" ? (en ? "Deep" : "Fundo da cena") : beat.role === "home" ? (en ? "Layout" : "Layout") : "", i;
    for (i = 0; i < scene.length; i++) if (scene[i].id === beat.layer) what = scene[i].name;
    return recipe.name[en ? "en-US" : "pt-BR"] + " · " + (index + 1) + "/" + total + " · " + what;
  }
  /** Turns motion blur on for the comp and the visited layers, remembering how it was once.
   * @param {any} p @param {any[]} scene @returns {any} the states to restore if the run fails */
  function enableMotionBlur(p, scene) {
    var comp = p.comp, undo = /** @type {any} */ ({ comp: comp.motionBlur, layers: [] }), i;
    if (!p.meta.mb) p.meta.mb = { comp: comp.motionBlur, layers: [] };
    for (i = 0; i < scene.length; i++) {
      var layer = Rig.byId(comp, scene[i].id);
      if (!layer) continue;
      var known = false;
      for (var j = 0; j < p.meta.mb.layers.length; j++) if (p.meta.mb.layers[j][0] === layer.id) known = true;
      if (!known) p.meta.mb.layers.push([layer.id, layer.motionBlur ? 1 : 0]);
      undo.layers.push([layer.id, layer.motionBlur]);
      layer.motionBlur = true;
    }
    comp.motionBlur = true;
    return undo;
  }
  /** @param {any} p @param {any} undo */
  function undoMotionBlur(p, undo) {
    if (!undo) return;
    p.comp.motionBlur = undo.comp;
    for (var i = 0; i < undo.layers.length; i++) { var layer = Rig.byId(p.comp, undo.layers[i][0]); if (layer) layer.motionBlur = undo.layers[i][1]; }
  }

  /** @param {any} args @param {any} context @returns {MotionCommandResult} */
  function run(args, context) {
    var comp = /** @type {any} */ (app.project.activeItem), locale = localeOf(context), recipe = recipeOf(args.choreographyId);
    var p = Rig.plan(comp, true), blur = /** @type {any} */ (null), optics = /** @type {any[]} */ ([]), i;
    try {
      Rig.establish(p, locale);
      Rig.syncTiming(p.controller, p.meta);
      Rig.prepareWrite(p, locale);
      // Beats keep a base amount (100, the breath 45); the shared control scales them all.
      var meta = p.meta, planned = planOf(p, recipe, args), plan = planned.plan, amount = 100;
      var intensity = typeof args.intensity === "number" ? args.intensity : 100;
      var group = "c" + meta.next, en = english(locale);
      var control = (en ? "Moti.on Camera " : "Moti.on Câmera ") + group + " · " + recipe.name[en ? "en-US" : "pt-BR"] + " (%)";
      Rig.ensureControl(p, control, "slider", intensity);
      var total = plan.beats.length;
      for (i = 0; i < total; i++) {
        var beat = plan.beats[i];
        var shot = { id: "s" + meta.next, presetId: recipe.id, presetVersion: recipe.version, group: group, role: beat.role, layer: beat.layer,
          start: beat.start, dur: beat.dur, amount: amount, control: control,
          shape: { kind: "visit", dir: "to", curve: beat.curve, tr: beat.tr, rot: beat.rot, orb: beat.orb, lens: beat.lens, dolly: 0,
            imp: beat.imp, org: [6, 1847, 6, 0], vis: beat.vis } };
        meta.next += 1;
        meta.shots.push(shot);
        Rig.placeMarker(p, meta, shot, beatLabel(recipe, beat, planned.scene, i, total, locale));
      }
      // Focus racks: one Layer Control per layer they land on, so the focus follows
      // that layer live (After Effects keeps the link when it is renamed or moved).
      // No markers: a rack belongs to the move around it.
      var focusControls = /** @type {Record<string, string>} */ ({}), focusCount = 0;
      for (i = 0; i < plan.focus.length; i++) {
        var key = plan.focus[i], target = planned.scene[key.layer], layer = Rig.byId(comp, target.id);
        if (!layer) continue;
        var name = focusControls["L" + target.id];
        if (!name) {
          focusCount += 1;
          name = (en ? "Moti.on Camera " : "Moti.on Câmera ") + group + " · " + (en ? "Focus " : "Foco ") + focusCount;
          Rig.ensureControl(p, name, "layer", layer.index);
          focusControls["L" + target.id] = name;
        }
        meta.shots.push({ id: "s" + meta.next, presetId: recipe.id, presetVersion: recipe.version, group: group, role: "focus", layer: target.id,
          start: key.start, dur: key.dur, amount: amount, control: control, focus: { control: name, local: target.lc || [0, 0] },
          shape: { kind: "focus", dir: "to", curve: "silk", tr: [0, 0, 0], rot: [0, 0, 0], orb: [0, 0], lens: 1, dolly: 0,
            imp: [0, 0.2, 0, 1.2, 4], org: [6, 1847, 6, 0], vis: [0, 0, 0, 1, target.c[0], target.c[1], target.c[2], 0] } });
        meta.next += 1;
      }
      if (args.life !== false) {
        // A slow organic breath over the whole choreography, a whole number of cycles.
        var breath = Rig.recipe("float-loop"), loop = Rig.copy(breath.shot);
        loop.org[0] = planned.duration / Math.max(1, Math.round(planned.duration / loop.org[0]));
        var life = { id: "s" + meta.next, presetId: breath.id, presetVersion: breath.version, group: group, role: "life", layer: -1,
          start: planned.start, dur: planned.duration, amount: 45, control: control, shape: loop };
        // No marker: it would sit on the first beat's time, and After Effects keeps
        // one marker per instant. The breath spans the choreography and keeps its stored timing.
        meta.next += 1;
        meta.shots.push(life);
      }
      if (args.focus !== false) {
        // The racks only read with depth of field: a wide aperture sized to the comp.
        // The first choreography to change them records how they were; removing the
        // last choreography puts them back.
        var parade = p.controller.property("ADBE Effect Parade"), values = /** @type {any[]} */ ([[meta.controls.dof, 1], [meta.controls.aperture, Math.round(comp.width * 0.06)], [meta.controls.blur, 100]]);
        var record = !meta.optics;
        if (record) meta.optics = [];
        for (i = 0; i < values.length; i++) {
          var effect = Rig.child(parade, values[i][0]);
          if (!effect) continue;
          optics.push([effect, effect.property(1).value]);
          if (record) meta.optics.push([values[i][0], effect.property(1).value]);
          effect.property(1).setValue(values[i][1]);
        }
      }
      Rig.writeAll(p, meta);
      if (args.motionBlur !== false) blur = enableMotionBlur(p, planned.scene);
      Rig.writeMeta(p.controller, meta);
      var warnings = [], asked = typeof args.depth === "number" ? args.depth : DEEP_START;
      for (i = 0; i < plan.warnings.length; i++) {
        if (plan.warnings[i] === "no-deep-start") warnings.push({ code: "CAMERA_NO_DEEP_START", message: en ? "There is no room in front of the background for the camera to go in: the opening starts on the layout." :
          "Não há espaço na frente do fundo para a câmera entrar: a abertura começa no layout.", details: null });
        if (plan.warnings[i] === "depth-adjusted") warnings.push({ code: "CAMERA_DEPTH_ADJUSTED", message: en ?
          "The camera went " + plan.depth + " px in instead of " + asked + " px: at that depth a layer would sit against the lens." :
          "A câmera entrou " + plan.depth + " px em vez de " + asked + " px: nessa profundidade uma camada ficaria colada na lente.", details: { depth: plan.depth, asked: asked } });
      }
      var names = [];
      for (i = 0; i < plan.subjects.length; i++) names.push(planned.scene[plan.subjects[i]].name);
      return { changed: true, warnings: warnings, data: { rigId: meta.rigId, groupId: group, mode: meta.mode, beats: total, subjects: names,
        hidden: plan.hidden, depth: plan.depth, focusRacks: plan.focus.length, start: planned.start, duration: planned.duration } };
    } catch (e) {
      undoMotionBlur(p, blur);
      for (i = optics.length - 1; i >= 0; i--) { try { optics[i][0].property(1).setValue(optics[i][1]); } catch (restoreError) { /* rollback reports */ } }
      Rig.rollback(p);
      throw e;
    }
  }

  MotionRegistry.register("ae.camera.choreography.apply", { preflight: preflight, run: run });
}());
