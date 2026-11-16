/**
 * Camera shots (ADR 0007): apply, adjust, remove, inspect and bake live camera
 * shots over the Parallax rig or a standalone camera rig.
 *
 * Every validation runs in preflight, with the project untouched; the
 * dispatcher opens the single Undo group. A failed run restores expressions,
 * markers, controls, metadata and any layer it created.
 */
(function () {
  // Bound when the bundle loads camera/camera-rig.jsx first; read lazily so a partial
  // host (tests) can still load this file.
  var Rig = typeof MotionCameraRig !== "undefined" ? MotionCameraRig : /** @type {any} */ (null);
  /** @type {Record<string, number>} */
  var KINDS = { move: 1, pulse: 1, loop: 1, visit: 1 };
  /** @type {Record<string, number>} */
  var DIRS = { to: 1, from: 1, through: 1 };
  /** @type {Record<string, number>} */
  var CURVES = { silk: 1, glide: 1, "sine-in-out": 1, "quad-in-out": 1, "quint-in-out": 1, "expo-in-out": 1, velvet: 1,
    drift: 1, snap: 1, smooth: 1, "sine-in": 1, "quad-in": 1, "expo-in": 1, impact: 1 };
  /** @type {string[]} */
  var SHAPE_KEYS = ["dir", "curve", "tr", "rot", "orb", "lens", "dolly", "imp", "org"];

  /** @param {string} code @param {string} message @param {any} [details] @returns {MotionCommandFailure} */
  function failure(code, message, details) { return { code: code, message: message, recoverable: true, details: details || null }; }
  /** @param {unknown} v @param {number} min @param {number} max @returns {boolean} */
  function inRange(v, min, max) { return typeof v === "number" && isFinite(v) && v >= min && v <= max; }
  /** @param {unknown} v @param {number} length @param {number} min @param {number} max @returns {boolean} */
  function vector(v, length, min, max) {
    if (!(v instanceof Array) || v.length !== length) return false;
    for (var i = 0; i < length; i++) if (!inRange(v[i], min, max)) return false;
    return true;
  }
  /** Same limits as `isCameraShotShape` in the contracts package.
   * @param {any} s @returns {boolean} */
  function validShape(s) {
    var base = !!s && KINDS[s.kind] === 1 && DIRS[s.dir] === 1 && CURVES[s.curve] === 1 && vector(s.tr, 3, -1, 1) &&
      vector(s.rot, 3, -90, 90) && vector(s.orb, 2, -60, 60) && inRange(s.lens, 0.25, 4) && inRange(s.dolly, 0, 1) &&
      vector(s.imp, 5, 0, 20) && s.imp[0] <= 0.5 && s.imp[1] >= 0.02 && s.imp[1] <= 0.8 && s.imp[2] <= 1 &&
      vector(s.org, 4, 0, 1000000) && s.org[0] >= 0.25 && s.org[0] <= 120 && s.org[2] <= 30 && s.org[3] <= 1;
    if (!base) return false;
    // A visit carries its absolute framing: look-at point, distance, focus point, cut flag,
    // then optionally the focus hand-off flag and the creep.
    if (s.kind !== "visit") return s.vis === undefined;
    var size = s.vis && s.vis.length >= 8 && s.vis.length <= 10 ? s.vis.length : 8;
    return vector(s.vis, size, -1000000, 1000000) && s.vis[3] > 0 && (s.vis[7] === 0 || s.vis[7] === 1) &&
      (size < 9 || s.vis[8] === 0 || s.vis[8] === 1) && (size < 10 || (s.vis[9] >= 0 && s.vis[9] <= 0.2));
  }
  /** @param {any} args @param {Record<string, number>} allowed @returns {string} */
  function unknownKey(args, allowed) {
    for (var key in args) if (Object.prototype.hasOwnProperty.call(args, key) && allowed[key] !== 1) return key;
    return "";
  }
  /** @returns {MotionCommandFailure|null} */
  function compFailure() {
    if (typeof app === "undefined" || !app.project) return failure(MotionContracts.ERROR.NO_ACTIVE_PROJECT, "Nenhum projeto aberto.");
    if (!(app.project.activeItem instanceof CompItem)) return failure(MotionContracts.ERROR.NO_ACTIVE_COMP, "Abra uma composição.");
    return null;
  }
  /** @param {any} e @returns {string} */
  function messageOf(e) { return e && typeof e.message === "string" ? e.message : String(e); }
  /** @param {any} context @returns {string} */
  function localeOf(context) { return context && typeof context.locale === "string" ? context.locale : "pt-BR"; }
  /** @param {any} meta @param {string} id @returns {number} */
  function shotIndex(meta, id) { for (var i = 0; i < meta.shots.length; i++) if (meta.shots[i].id === id) return i; return -1; }

  /** Start, duration and period for a new shot; loops fill the comp by default and
   * keep a whole number of cycles so the comp loops too.
   * @param {any} comp @param {any} recipe @param {any} args @returns {any} */
  function timing(comp, recipe, args) {
    var loop = recipe.shot.kind === "loop", frame = comp.frameDuration;
    var start = typeof args.startSeconds === "number" ? args.startSeconds : loop ? 0 : comp.time;
    var remaining = Math.max(frame, comp.duration - start);
    var dur = typeof args.durationSeconds === "number" ? args.durationSeconds : loop ? remaining : Math.min(recipe.durationSeconds, remaining);
    var period = recipe.shot.org[0];
    if (loop) period = dur / Math.max(1, Math.round(dur / period));
    return { start: start, dur: Math.max(frame, dur), period: period };
  }

  /* ---------------------------------------------------------------- apply */

  var APPLY_KEYS = { presetId: 1, startSeconds: 1, durationSeconds: 1, intensity: 1, direction: 1, seed: 1 };
  /** @param {any} args @returns {MotionCommandFailure|null} */
  function preflightApply(args) {
    var bad = unknownKey(args, APPLY_KEYS);
    if (bad) return failure(MotionContracts.ERROR.INVALID_PRESET, "Câmera: argumento inválido.", { field: bad });
    var recipe = typeof args.presetId === "string" ? Rig.recipe(args.presetId) : null;
    if (!recipe) return failure(MotionContracts.ERROR.INVALID_PRESET, "Câmera: preset desconhecido.", { field: "presetId" });
    if (args.intensity !== undefined && !inRange(args.intensity, 0, 300)) return failure(MotionContracts.ERROR.INVALID_PRESET, "Câmera: intensidade fora de 0–300%.", { field: "intensity" });
    if (args.direction !== undefined && args.direction !== "preset" && DIRS[args.direction] !== 1) return failure(MotionContracts.ERROR.INVALID_PRESET, "Câmera: direção inválida.", { field: "direction" });
    if (args.seed !== undefined && (!inRange(args.seed, 0, 9999) || Math.floor(args.seed) !== args.seed)) return failure(MotionContracts.ERROR.INVALID_PRESET, "Câmera: semente inválida.", { field: "seed" });
    var problem = compFailure();
    if (problem) return problem;
    var comp = /** @type {any} */ (app.project.activeItem);
    if (args.startSeconds !== undefined && !inRange(args.startSeconds, 0, comp.duration - comp.frameDuration)) return failure(MotionContracts.ERROR.INVALID_PRESET, "Câmera: início fora da composição.", { field: "startSeconds" });
    if (args.durationSeconds !== undefined && !inRange(args.durationSeconds, comp.frameDuration, 600)) return failure(MotionContracts.ERROR.INVALID_PRESET, "Câmera: duração inválida.", { field: "durationSeconds" });
    try {
      var p = Rig.plan(comp, true);
      Rig.checkWritable(p);
      if (p.meta && p.meta.shots.length >= Rig.MAX_SHOTS) return failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Câmera: limite de " + Rig.MAX_SHOTS + " shots por composição.");
      var markers = p.controller ? p.controller.property("ADBE Marker") : null;
      if (markers && markers.numKeys >= 250) return failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Câmera: o controle já tem 250 marcadores.");
    } catch (e) {
      return failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, messageOf(e));
    }
    return null;
  }
  /** @param {any} args @param {any} context @returns {MotionCommandResult} */
  function runApply(args, context) {
    var comp = /** @type {any} */ (app.project.activeItem), locale = localeOf(context), recipe = Rig.recipe(args.presetId);
    var p = Rig.plan(comp, true), warnings = [];
    try {
      Rig.establish(p, locale);
      Rig.syncTiming(p.controller, p.meta);
      Rig.prepareWrite(p, locale);
      var meta = p.meta, when = timing(comp, recipe, args), shape = Rig.copy(recipe.shot);
      if (args.direction && args.direction !== "preset") shape.dir = args.direction;
      if (typeof args.seed === "number") shape.org[1] = args.seed;
      shape.org[0] = when.period;
      var shot = { id: "s" + meta.next, presetId: recipe.id, presetVersion: recipe.version, start: when.start, dur: when.dur,
        amount: typeof args.intensity === "number" ? args.intensity : 100, shape: shape, control: "" };
      meta.next += 1;
      shot.control = Rig.shotControlName(shot, recipe, locale);
      Rig.ensureControl(p, shot.control, "slider", shot.amount);
      meta.shots.push(shot);
      Rig.placeMarker(p, meta, shot, recipe.name[locale.indexOf("en") === 0 ? "en-US" : "pt-BR"]);
      Rig.writeAll(p, meta);
      Rig.writeMeta(p.controller, meta);
      if (recipe.motionBlur && !comp.motionBlur) {
        warnings.push({ code: "CAMERA_MOTION_BLUR", message: "Este shot é rápido: ative o motion blur da composição e das camadas.", details: { shotId: shot.id } });
      }
      return { changed: true, warnings: warnings, data: { rigId: meta.rigId, shotId: shot.id, mode: meta.mode, start: shot.start, duration: shot.dur } };
    } catch (e) {
      Rig.rollback(p);
      throw e;
    }
  }

  /* --------------------------------------------------------------- adjust */

  var ADJUST_KEYS = { shotId: 1, intensity: 1, startSeconds: 1, durationSeconds: 1, dir: 1, curve: 1, tr: 1, rot: 1, orb: 1,
    lens: 1, dolly: 1, imp: 1, org: 1 };
  /** @param {any} args @returns {any} */
  function adjustTarget(args) {
    var comp = /** @type {any} */ (app.project.activeItem), p = Rig.plan(comp, false);
    var index = shotIndex(p.meta, args.shotId);
    if (index < 0) Rig.reject("Câmera: shot não encontrado.");
    Rig.syncTiming(p.controller, p.meta);
    var shot = p.meta.shots[index], shape = Rig.copy(shot.shape);
    for (var i = 0; i < SHAPE_KEYS.length; i++) {
      var key = String(SHAPE_KEYS[i]);
      if (args[key] !== undefined) shape[key] = Rig.copy(args[key]);
    }
    if (!validShape(shape)) Rig.reject("Câmera: valores do shot fora dos limites.");
    return { comp: comp, p: p, shot: shot, shape: shape };
  }
  /** @param {any} args @returns {MotionCommandFailure|null} */
  function preflightAdjust(args) {
    var bad = unknownKey(args, ADJUST_KEYS);
    if (bad) return failure(MotionContracts.ERROR.INVALID_PRESET, "Câmera: argumento inválido.", { field: bad });
    if (typeof args.shotId !== "string") return failure(MotionContracts.ERROR.INVALID_PRESET, "Câmera: informe o shot.", { field: "shotId" });
    if (args.intensity !== undefined && !inRange(args.intensity, 0, 300)) return failure(MotionContracts.ERROR.INVALID_PRESET, "Câmera: intensidade fora de 0–300%.", { field: "intensity" });
    var problem = compFailure();
    if (problem) return problem;
    var comp = /** @type {any} */ (app.project.activeItem);
    if (args.startSeconds !== undefined && !inRange(args.startSeconds, 0, comp.duration - comp.frameDuration)) return failure(MotionContracts.ERROR.INVALID_PRESET, "Câmera: início fora da composição.", { field: "startSeconds" });
    if (args.durationSeconds !== undefined && !inRange(args.durationSeconds, comp.frameDuration, 600)) return failure(MotionContracts.ERROR.INVALID_PRESET, "Câmera: duração inválida.", { field: "durationSeconds" });
    try { var t = adjustTarget(args); Rig.checkWritable(t.p); } catch (e) { return failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, messageOf(e)); }
    return null;
  }
  /** @param {any} args @param {any} context @returns {MotionCommandResult} */
  function runAdjust(args, context) {
    var t = adjustTarget(args), p = t.p, shot = t.shot, locale = localeOf(context);
    try {
      Rig.prepareWrite(p, locale);
      shot.shape = t.shape;
      if (typeof args.startSeconds === "number") shot.start = args.startSeconds;
      if (typeof args.durationSeconds === "number") shot.dur = args.durationSeconds;
      if (typeof args.intensity === "number") {
        // In a choreography the intensity is the shared control; each beat keeps its base.
        if (!shot.group) shot.amount = args.intensity;
        Rig.ensureControl(p, shot.control, "slider", args.intensity).property(1).setValue(args.intensity);
      }
      if (typeof args.startSeconds === "number" || typeof args.durationSeconds === "number") {
        var recipe = Rig.recipe(shot.presetId);
        Rig.placeMarker(p, p.meta, shot, recipe ? recipe.name[locale.indexOf("en") === 0 ? "en-US" : "pt-BR"] : shot.presetId);
      }
      Rig.writeAll(p, p.meta);
      Rig.writeMeta(p.controller, p.meta);
      return { changed: true, warnings: [], data: { rigId: p.meta.rigId, shotId: shot.id } };
    } catch (e) {
      Rig.rollback(p);
      throw e;
    }
  }

  /* --------------------------------------------------------------- remove */

  /** Motion blur a choreography switched on goes back to how it was.
   * @param {any} p */
  function restoreMotionBlur(p) {
    var mb = p.meta.mb, i;
    if (!mb) return;
    p.comp.motionBlur = !!mb.comp;
    for (i = 0; i < mb.layers.length; i++) { var layer = Rig.byId(p.comp, mb.layers[i][0]); if (layer) layer.motionBlur = !!mb.layers[i][1]; }
  }
  /** Removes a whole rig: controls, markers and expressions; the standalone
   * camera and controller it created go away too.
   * @param {any} p */
  function teardown(p) {
    var created = p.meta.created || [], comp = p.comp, i;
    restoreMotionBlur(p);
    Rig.detach(p);
    for (i = 0; i < created.length; i++) { var layer = Rig.byId(comp, created[i]); if (layer && layer !== p.controller) layer.remove(); }
    for (i = 0; i < created.length; i++) if (created[i] === p.controller.id) { p.controller.remove(); break; }
  }
  /** Shots a removal targets: one shot by id, or every beat of a choreography.
   * @param {any} meta @param {any} args @returns {number[]} */
  function removalTargets(meta, args) {
    var out = [], i;
    for (i = 0; i < meta.shots.length; i++) {
      var s = meta.shots[i];
      if ((typeof args.shotId === "string" && s.id === args.shotId) || (typeof args.groupId === "string" && s.group === args.groupId)) out.push(i);
    }
    return out;
  }
  /** @param {any} args @returns {MotionCommandFailure|null} */
  function preflightRemoveShot(args) {
    var bad = unknownKey(args, { shotId: 1, groupId: 1 });
    if (bad || (typeof args.shotId === "string") === (typeof args.groupId === "string")) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Câmera: informe o shot ou a coreografia.", { field: bad || "shotId" });
    }
    var problem = compFailure();
    if (problem) return problem;
    try {
      var p = Rig.plan(/** @type {any} */ (app.project.activeItem), false);
      if (!removalTargets(p.meta, args).length) return failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Câmera: shot não encontrado.");
      Rig.checkWritable(p);
    } catch (e) { return failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, messageOf(e)); }
    return null;
  }
  /** @param {any} args @param {any} context @returns {MotionCommandResult} */
  function runRemoveShot(args, context) {
    var p = Rig.plan(/** @type {any} */ (app.project.activeItem), false), meta = p.meta, i, j;
    Rig.syncTiming(p.controller, meta);
    var targets = /** @type {any[]} */ (removalTargets(meta, args)), removed = [];
    for (i = 0; i < targets.length; i++) removed.push(meta.shots[targets[i]].id);
    if (targets.length === meta.shots.length) {
      teardown(p);
      return { changed: true, warnings: [], data: { removed: removed, rigRemoved: true } };
    }
    try {
      Rig.prepareWrite(p, localeOf(context));
      var gone = [];
      for (i = targets.length - 1; i >= 0; i--) gone.push(meta.shots.splice(targets[i], 1)[0]);
      var parade = p.controller.property("ADBE Effect Parade");
      for (i = 0; i < gone.length; i++) {
        Rig.removeMarker(p.controller, meta, gone[i].id);
        // Beats of a choreography share one intensity control, and its focus racks
        // one Layer Control per layer: each goes with the last shot that uses it.
        var names = [gone[i].control];
        if (gone[i].focus) names.push(gone[i].focus.control);
        for (var n = 0; n < names.length; n++) {
          var shared = false;
          for (j = 0; j < meta.shots.length; j++) if (meta.shots[j].control === names[n] || (meta.shots[j].focus && meta.shots[j].focus.control === names[n])) shared = true;
          var effect = shared ? null : Rig.child(parade, names[n]);
          if (effect) effect.remove();
        }
      }
      // The last choreography gone: depth of field, aperture and blur go back to how they were.
      var grouped = false;
      for (j = 0; j < meta.shots.length; j++) if (meta.shots[j].group) grouped = true;
      if (!grouped && meta.optics) {
        for (j = 0; j < meta.optics.length; j++) { var optic = Rig.child(parade, meta.optics[j][0]); if (optic) optic.property(1).setValue(meta.optics[j][1]); }
        delete meta.optics;
      }
      Rig.writeAll(p, meta);
      Rig.writeMeta(p.controller, meta);
      return { changed: true, warnings: [], data: { removed: removed, rigRemoved: false } };
    } catch (e) {
      Rig.rollback(p);
      throw e;
    }
  }
  /** @param {any} args @returns {MotionCommandFailure|null} */
  function preflightRemoveRig(args) {
    var bad = unknownKey(args, {});
    if (bad) return failure(MotionContracts.ERROR.INVALID_PRESET, "Câmera: argumento inválido.", { field: bad });
    var problem = compFailure();
    if (problem) return problem;
    try { Rig.plan(/** @type {any} */ (app.project.activeItem), false); } catch (e) { return failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, messageOf(e)); }
    return null;
  }
  /** @returns {MotionCommandResult} */
  function runRemoveRig() {
    var p = Rig.plan(/** @type {any} */ (app.project.activeItem), false), count = p.meta.shots.length, mode = p.meta.mode;
    teardown(p);
    return { changed: true, warnings: [], data: { removedShots: count, mode: mode } };
  }

  /* -------------------------------------------------------------- inspect */

  /** @param {any} args @returns {MotionCommandFailure|null} */
  function preflightInspect(args) {
    var bad = unknownKey(args, {});
    return bad ? failure(MotionContracts.ERROR.INVALID_PRESET, "Câmera: argumento inválido.", { field: bad }) : compFailure();
  }
  /** Read-only state for the panel: the rig and its shots, or why a shot cannot
   * be applied yet. @returns {MotionCommandResult} */
  function runInspect() {
    var comp = /** @type {any} */ (app.project.activeItem), data = /** @type {any} */ ({ rig: null, mode: "", problem: "", scene: [], frame: null });
    try {
      var p = Rig.plan(comp, true);
      data.mode = p.mode;
      Rig.checkWritable(p);
      if (p.meta) {
        Rig.syncTiming(p.controller, p.meta);
        var shots = [], i;
        for (i = 0; i < p.meta.shots.length; i++) {
          var s = p.meta.shots[i], live = Rig.child(p.controller.property("ADBE Effect Parade"), s.control);
          shots.push({ id: s.id, presetId: s.presetId, start: s.start, duration: s.dur, group: s.group || "", role: s.role || "",
            intensity: live ? Number(live.property(1).valueAtTime(comp.time, true)) : s.amount, shape: s.shape });
        }
        data.rig = { rigId: p.meta.rigId, mode: p.meta.mode, shots: shots, maxShots: Rig.MAX_SHOTS };
      }
      // What a choreography would visit, for the panel's list and preview.
      data.frame = Rig.frameOf(p);
      data.scene = Rig.scene(p, data.frame, false);
    } catch (e) {
      data.problem = messageOf(e);
    }
    return { changed: false, warnings: [], data: data };
  }

  /* ----------------------------------------------------------------- bake */

  /** @param {any} args @returns {MotionCommandFailure|null} */
  function preflightBake(args) {
    var bad = unknownKey(args, { stepFrames: 1 });
    if (bad) return failure(MotionContracts.ERROR.INVALID_PRESET, "Câmera: argumento inválido.", { field: bad });
    if (args.stepFrames !== undefined && (!inRange(args.stepFrames, 1, 10) || Math.floor(args.stepFrames) !== args.stepFrames)) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Câmera: passo do bake entre 1 e 10 quadros.", { field: "stepFrames" });
    }
    var problem = compFailure();
    if (problem) return problem;
    var comp = /** @type {any} */ (app.project.activeItem);
    if (comp.duration / comp.frameDuration / (args.stepFrames || 1) > 10000) return failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Câmera: composição longa demais para o bake (máximo 10000 amostras).");
    try { Rig.plan(comp, false); } catch (e) { return failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, messageOf(e)); }
    return null;
  }
  /** Samples every engine property per frame, writes linear keys and detaches the
   * engine. The standalone camera and controller stay as ordinary layers.
   * @param {any} args @returns {MotionCommandResult} */
  function runBake(args) {
    var comp = /** @type {any} */ (app.project.activeItem), p = Rig.plan(comp, false), meta = p.meta;
    var step = (args.stepFrames || 1) * comp.frameDuration, saved = [], i, k;
    Rig.syncTiming(p.controller, meta);
    var commentBefore = String(p.controller.comment || "");
    try {
      for (i = 0; i < Rig.TARGETS.length; i++) {
        var target = Rig.TARGETS[i], layer = target.owner === "controller" ? p.controller : p.camera, prop = Rig.locate(layer, target.path);
        if (!prop || !Rig.isManaged(prop.expression, meta.rigId)) continue;
        var times = [], values = [], keys = [];
        for (var t = 0; t < comp.duration - 0.000001; t += step) { times.push(t); values.push(prop.valueAtTime(t, false)); }
        for (k = 1; k <= prop.numKeys; k++) keys.push({ t: prop.keyTime(k), v: prop.keyValue(k) });
        saved.push({ prop: prop, expression: prop.expression, enabled: prop.expressionEnabled, keys: keys });
        while (prop.numKeys > 0) prop.removeKey(prop.numKeys);
        prop.expression = "";
        if (typeof prop.setValuesAtTimes === "function") prop.setValuesAtTimes(times, values);
        else for (k = 0; k < times.length; k++) prop.setValueAtTime(times[k], values[k]);
      }
      Rig.detach(p);
      return { changed: true, warnings: [], data: { baked: saved.length, samples: Math.ceil(comp.duration / step) } };
    } catch (e) {
      var failed = false;
      for (i = saved.length - 1; i >= 0; i--) {
        try {
          var s = /** @type {any} */ (saved[i]);
          while (s.prop.numKeys > 0) s.prop.removeKey(s.prop.numKeys);
          for (k = 0; k < s.keys.length; k++) s.prop.setValueAtTime(s.keys[k].t, s.keys[k].v);
          s.prop.expression = s.expression; s.prop.expressionEnabled = s.enabled;
        } catch (restoreError) { failed = true; }
      }
      try { p.controller.comment = commentBefore; } catch (commentError) { failed = true; }
      if (failed) { var error = /** @type {any} */ (new Error("Câmera: restauração incompleta.")); error.motionCode = MotionContracts.ERROR.ROLLBACK_FAILED; throw error; }
      throw e;
    }
  }

  MotionRegistry.register("ae.camera.shot.apply", { preflight: preflightApply, run: runApply });
  MotionRegistry.register("ae.camera.shot.adjust", { preflight: preflightAdjust, run: runAdjust });
  MotionRegistry.register("ae.camera.shot.remove", { preflight: preflightRemoveShot, run: runRemoveShot });
  MotionRegistry.register("ae.camera.remove", { preflight: preflightRemoveRig, run: runRemoveRig });
  MotionRegistry.register("ae.camera.inspect", { preflight: preflightInspect, run: runInspect });
  MotionRegistry.register("ae.camera.bake", { preflight: preflightBake, run: runBake });
}());
