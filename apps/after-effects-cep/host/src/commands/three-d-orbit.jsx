/** One-click Orbital with native controls on a shared 3D null. Dispatcher owns Undo. */
(function () {
  /* global Property CameraLayer */
  var TYPE = "orbit", TR = "ADBE Transform Group", POS = "ADBE Position", ORIENT = "ADBE Orientation";
  var MAX_BAKE_SAMPLES = 18000;
  var PRESETS = ["frontal", "horizontal", "vertical", "diagonal", "reverseDiagonal", "side", "sphere", "tiltedSphere"];
  /** @type {Record<string, boolean>} */
  var REQUIRED = {radius: true, speed: true, inclination: true, phase: true, targetMode: true, faceTarget: true, bake: true};
  /** @type {Record<string, boolean>} */
  var OPTIONAL = {preset: true, azimuth: true, bank: true, spread: true, applyPreset: true};
  /** @type {any[]} */
  var LABELS = [
    ["preset", "Modo orbital", "Orbit mode", "dropdown", 1, 8, "none"],
    ["radius", "Raio", "Radius", "slider", 1, 1000000, "px"],
    ["speed", "Velocidade (graus/s)", "Speed (degrees/s)", "slider", -36000, 36000, "none"],
    ["inclination", "Inclinação X", "X tilt", "angle", -360, 360, "°"],
    ["azimuth", "Perspectiva Y", "Y perspective", "angle", -360, 360, "°"],
    ["bank", "Rotação Z", "Z rotation", "angle", -360, 360, "°"],
    ["phase", "Fase", "Phase", "angle", -36000, 36000, "°"],
    ["spread", "Distribuição esférica", "Sphere spread", "slider", 0, 100, "%"],
    ["faceTarget", "Encarar o centro", "Face centre", "checkbox", 0, 1, "none"]
  ];
  /** @type {any[]} */
  var PRESET_LABELS = [["Frontal", "Front"], ["Horizontal", "Horizontal"], ["Vertical", "Vertical"],
    ["Diagonal", "Diagonal"], ["Diagonal inversa", "Reverse diagonal"], ["Lateral", "Side"],
    ["Esfera", "Sphere"], ["Esfera inclinada", "Tilted sphere"]];
  /** @param {string} code @param {string} message @param {unknown} details @returns {MotionCommandFailure} */
  function fail(code, message, details) { return {code: code, message: message, recoverable: true, details: details}; }
  /** @param {unknown} n @param {number} lo @param {number} hi @returns {boolean} */
  function validNumber(n, lo, hi) { return typeof n === "number" && isFinite(n) && n >= lo && n <= hi; }
  /** @param {any} layer @param {string} name @returns {Property|null} */
  function prop(layer, name) { var group = layer.property(TR), p = group ? group.property(name) : null; return p instanceof Property ? p : null; }
  /** @param {any} layer @returns {boolean} */
  function owned(layer) { return !!(layer && MotionRigMeta.has(layer.comment, TYPE)); }
  /** @param {any} layer @returns {any} */
  function metadata(layer) {
    if (!layer) return null;
    var s = layer.comment || "", start = s.indexOf(MotionContracts.META_OPEN), end = s.indexOf(MotionContracts.META_CLOSE);
    if (start < 0 || end <= start) return null;
    try { return MotionJson.parse(s.substring(start + MotionContracts.META_OPEN.length, end)); } catch (e) { return null; }
  }
  /** @param {Record<string, unknown>} args @returns {MotionCommandFailure|null} */
  function validate(args) {
    var k, found = false;
    for (k in args) if (Object.prototype.hasOwnProperty.call(args, k) && !Object.prototype.hasOwnProperty.call(REQUIRED, k) && !Object.prototype.hasOwnProperty.call(OPTIONAL, k)) return fail(MotionContracts.ERROR.INVALID_PRESET, "Argumento Orbital desconhecido.", {field: k});
    for (k in REQUIRED) if (!Object.prototype.hasOwnProperty.call(args, k)) return fail(MotionContracts.ERROR.INVALID_PRESET, "Argumento Orbital ausente.", {field: k});
    var ranges = [["radius", 1, 1000000], ["speed", -36000, 36000], ["inclination", -360, 360], ["phase", -36000, 36000], ["azimuth", -360, 360], ["bank", -360, 360], ["spread", 0, 100]];
    for (var i = 0; i < ranges.length; i += 1) {
      var r = /** @type {any} */ (ranges[i]), id = /** @type {string} */ (r[0]);
      if ((REQUIRED[id] || typeof args[id] !== "undefined") && !validNumber(args[id], /** @type {number} */ (r[1]), /** @type {number} */ (r[2]))) return fail(MotionContracts.ERROR.INVALID_PRESET, "Valor Orbital invalido.", {field: id});
    }
    if (typeof args.preset !== "undefined") {
      for (i = 0; i < PRESETS.length; i += 1) if (args.preset === PRESETS[i]) found = true;
      if (!found) return fail(MotionContracts.ERROR.INVALID_PRESET, "Preset Orbital invalido.", {field: "preset"});
    }
    if (args.targetMode !== "newController" && args.targetMode !== "reuseController") return fail(MotionContracts.ERROR.INVALID_PRESET, "Modo de controlador invalido.", null);
    if (typeof args.faceTarget !== "boolean" || typeof args.bake !== "boolean" || (typeof args.applyPreset !== "undefined" && typeof args.applyPreset !== "boolean") || (args.applyPreset && !args.preset)) return fail(MotionContracts.ERROR.INVALID_PRESET, "Opcao Orbital invalida.", null);
    return null;
  }
  /** No preset retains the legacy XZ orbit convention. @param {Record<string, unknown>} args @returns {Record<string, any>} */
  function values(args) {
    var mode = 2;
    for (var i = 0; i < PRESETS.length; i += 1) if (args.preset === PRESETS[i]) mode = i + 1;
    return {preset: mode, radius: args.radius, speed: args.speed,
      inclination: args.preset ? args.inclination : 20 - /** @type {number} */ (args.inclination),
      azimuth: args.azimuth || 0, bank: args.bank || 0, phase: args.phase,
      spread: typeof args.spread === "number" ? args.spread : 100, faceTarget: args.faceTarget};
  }
  /** @param {any[]} list @param {any} item @returns {boolean} */
  function includes(list, item) { for (var i = 0; i < list.length; i += 1) if (list[i] === item) return true; return false; }
  /** Resolve a selected null/shared parent and retain saved member order through timeline reorder.
   * @param {CompItem} comp @param {Record<string, unknown>} args @returns {{layers: any[], controller: any, error: MotionCommandFailure|null}} */
  function targets(comp, args) {
    var selection = /** @type {any} */ (comp).selectedLayers || [], all = [], selected = null, common = null, layers = [], i;
    for (i = 1; i <= comp.numLayers; i += 1) if (owned(comp.layer(i))) all.push(comp.layer(i));
    for (i = 0; i < selection.length; i += 1) {
      if (owned(selection[i])) {
        if (selected) return {layers: [], controller: null, error: fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Selecione apenas um nulo Orbital.", null)};
        selected = selection[i];
      } else {
        layers.push(selection[i]); var p = selection[i].parent;
        if (owned(p)) {
          if (common && common !== p) return {layers: [], controller: null, error: fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "As camadas pertencem a orbitas diferentes.", null)};
          common = p;
        }
      }
    }
    if (selected && common && selected !== common) return {layers: [], controller: null, error: fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "O nulo selecionado pertence a outra orbita.", null)};
    var controller = selected || common;
    if (!controller && args.targetMode === "reuseController") {
      if (all.length !== 1) return {layers: [], controller: null, error: fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Selecione o nulo Orbital que deseja reutilizar.", null)};
      controller = all[0];
    }
    if (controller) {
      var members = /** @type {any[]} */ (MotionRigMeta.findMembers(comp, controller)), data = metadata(controller), order = data && data.memberIds || [], sorted = [];
      for (i = 0; i < order.length; i += 1) for (var j = 0; j < members.length; j += 1) if (members[j].id === order[i] && !includes(sorted, members[j])) sorted.push(members[j]);
      for (i = 0; i < members.length; i += 1) if (!includes(sorted, members[i])) sorted.push(members[i]);
      for (i = 0; i < layers.length; i += 1) if (!includes(sorted, layers[i])) sorted.push(layers[i]);
      layers = sorted;
    }
    return {layers: layers, controller: controller, error: layers.length ? null : fail(MotionContracts.ERROR.NO_SELECTION, "Selecione as camadas ou o nulo da orbita.", null)};
  }
  /** Exact names/types only: an ambiguous index must not modify another effect.
   * @param {any} controller @param {any} record @returns {any} */
  function control(controller, record) {
    var parade = controller.property("ADBE Effect Parade"), found = null;
    for (var i = 1; parade && i <= parade.numProperties; i += 1) {
      var e = parade.property(i);
      if (e.name === record.name && e.matchName === record.matchName) { if (found) return null; found = e; }
    }
    return found ? found.property(1) : null;
  }
  /** @param {Record<string, unknown>} args @returns {MotionCommandFailure|null} */
  function preflight(args) {
    var error = validate(args); if (error) return error;
    var comp = /** @type {CompItem} */ (app.project.activeItem), plan = targets(comp, args); if (plan.error) return plan.error;
    var controller = plan.controller, data = metadata(controller), i;
    if (controller && (controller.locked || !controller.threeDLayer || !controller.nullLayer || !prop(controller, POS))) return fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Desbloqueie o nulo Orbital e mantenha-o em 3D.", null);
    if (data && data.schemaVersion === 2) {
      if (!(data.controls instanceof Array) || data.controls.length !== LABELS.length) return fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Os controles da orbita estao incompletos.", null);
      for (i = 0; i < data.controls.length; i += 1) {
        var record = data.controls[i], cp = control(controller, record);
        if (!cp) return fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Um controle Orbital foi removido ou renomeado. Restaure seu nome para ajustar o rig.", {control: record.name});
        if (args.applyPreset && (record.paramId === "preset" || record.paramId === "inclination" || record.paramId === "azimuth" || record.paramId === "bank") && (cp.numKeys > 0 || cp.expression)) return fail(MotionContracts.ERROR.KEYFRAME_CONFLICT, "Preserve a animacao dos angulos e do modo antes de trocar o preset.", {control: record.name});
      }
    }
    var samples = (Math.ceil(comp.duration / comp.frameDuration) + 1) * plan.layers.length * 2;
    if (args.bake && (!isFinite(samples) || samples > MAX_BAKE_SAMPLES)) return fail(MotionContracts.ERROR.INVALID_PRESET, "Bake excede o limite seguro de amostras.", {samples: samples, maximum: MAX_BAKE_SAMPLES});
    for (i = 0; i < plan.layers.length; i += 1) {
      var layer = plan.layers[i];
      if (layer.locked || layer.nullLayer || owned(layer) || (typeof CameraLayer !== "undefined" && layer instanceof CameraLayer) || (typeof LightLayer !== "undefined" && layer instanceof LightLayer)) return fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Selecione camadas visuais editaveis para orbitar.", {selectionIndex: i});
      if (layer.parent && layer.parent !== controller) return fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "A camada ja tem outro parent. Preserve esse rig antes de criar a orbita.", {selectionIndex: i});
      var pos = prop(layer, POS);
      if (!pos || !pos.canSetExpression || /** @type {any} */ (pos).dimensionsSeparated || pos.numKeys > 0) return fail(MotionContracts.ERROR.KEYFRAME_CONFLICT, "Position deve estar sem keyframes e com dimensoes unidas.", {selectionIndex: i});
      if (pos.expression && !MotionExpressions.isManagedOrbit(pos.expression)) return fail(MotionContracts.ERROR.EXPRESSION_CONFLICT, "Position contem uma expressao de usuario.", {selectionIndex: i});
      if (pos.expression && layer.parent !== controller) return fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Expressao Orbital sem seu nulo. Repare o parentesco antes de ajustar.", {selectionIndex: i});
      if (layer.parent === controller && controller && !pos.expression) return fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "O nulo possui uma camada de usuario que nao pertence a orbita.", {selectionIndex: i});
      var orientation = prop(layer, ORIENT);
      if ((layer.threeDLayer && (!orientation || !orientation.canSetExpression)) || (orientation && (orientation.numKeys > 0 || (orientation.expression && !MotionExpressions.isManagedOrbitFacing(orientation.expression))))) return fail(MotionContracts.ERROR.EXPRESSION_CONFLICT, "Orientation contem animacao ou expressao de usuario.", {selectionIndex: i});
    }
    return null;
  }
  /** @param {Property} p @returns {{expression: string, enabled: boolean, value: unknown}} */
  function snapshot(p) {
    // `value` pode estar avaliado pela expressao no CTI; preExpression le o
    // valor subjacente que precisaremos restaurar se o lote falhar.
    var raw = p.valueAtTime(/** @type {CompItem} */ (app.project.activeItem).time, true);
    return {expression: p.expression, enabled: p.expressionEnabled,
      value: raw instanceof Array ? raw.slice(0) : raw};
  }

  /** @param {Property} p @param {{expression: string, enabled: boolean, value: unknown}} before */
  function restoreProperty(p, before) {
    p.expression = "";
    p.expressionEnabled = false;
    while (p.numKeys > 0) p.removeKey(p.numKeys);
    p.setValue(before.value);
    p.expression = before.expression;
    p.expressionEnabled = before.enabled;
  }

  /** @param {Property} p @param {CompItem} comp @returns {{times: number[], values: unknown[]}} */
  function sample(p, comp) {
    var frames = Math.ceil(comp.duration / comp.frameDuration);
    var times = [], values = [];
    for (var i = 0; i <= frames; i += 1) {
      var t = Math.min(comp.duration, i * comp.frameDuration);
      times.push(t);
      values.push(p.valueAtTime(t, false));
    }
    return {times: times, values: values};
  }

  /** @param {Property} p @param {{times: number[], values: unknown[]}} samples */
  function writeSamples(p, samples) {
    p.expression = "";
    p.expressionEnabled = false;
    for (var i = 0; i < samples.times.length; i += 1)
      p.setValueAtTime(/** @type {number} */ (samples.times[i]), samples.values[i]);
  }


  /** @param {any} controller @param {Record<string, any>} desired @param {string} locale @returns {MotionLiveControlsConfig} */
  function config(controller, desired, locale) {
    var bindings = [], options = /** @type {any[]} */ ([]), i;
    for (i = 0; i < PRESET_LABELS.length; i += 1) options.push({value: i + 1, label: {"pt-BR": PRESET_LABELS[i][0], "en-US": PRESET_LABELS[i][1]}});
    for (i = 0; i < LABELS.length; i += 1) {
      var r = LABELS[i], id = /** @type {string} */ (r[0]);
      var binding = /** @type {MotionLiveControlBindingHost} */ ({paramId: id, label: {"pt-BR": r[1], "en-US": r[2]}, control: r[3], target: "controller", order: i + 1, min: r[4], max: r[5], unit: r[6], help: {"pt-BR": "Controla todas as camadas desta orbita.", "en-US": "Controls all layers in this orbit."}});
      if (id === "preset") binding.options = options;
      bindings.push(binding);
    }
    return {rigId: "orbit-" + controller.id, tool: locale === "pt-BR" ? "Orbital" : "Orbit", locale: locale, targetKind: "controller", bindings: bindings, values: desired};
  }
  /** @param {any[]} saved @param {any} created */
  function restoreSelection(saved, created) {
    if (created && created.selected) created.selected = false;
    for (var i = 0; i < saved.length; i += 1) if (!saved[i].selected) saved[i].selected = true;
  }
  /** @param {Record<string, unknown>} args @param {Record<string, unknown>} context @param {Record<string, unknown>} options @returns {MotionCommandResult} */
  function run(args, context, options) {
    var comp = /** @type {CompItem} */ (app.project.activeItem), plan = targets(comp, args), layers = plan.layers, controller = plan.controller;
    var savedSelection = /** @type {any} */ (comp).selectedLayers.slice(0), created = null, states = /** @type {any[]} */ ([]), controlStates = /** @type {any[]} */ ([]), createdControls = /** @type {any[]} */ ([]), warnings = /** @type {any[]} */ ([]), applied = 0;
    var beforeComment = controller ? controller.comment : "", data = metadata(controller), desired = values(args), records, i;
    var startTime = data && data.schemaVersion === 2 ? data.startTime : controller ? 0 : comp.time;
    var lastRequest = data && data.lastRequested || null, changed = false;
    var regularQuick = options && options.mode === "quick" && !args.applyPreset;
    try {
      if (!controller) {
        controller = comp.layers.addNull(); created = controller; controller.name = "Órbita (Moti.on)";
        controller.threeDLayer = true;
        var anchor = prop(controller, "ADBE Anchor Point"); if (anchor) anchor.setValue([0, 0, 0]);
        /** @type {Property} */ (prop(controller, POS)).setValue([comp.width / 2, comp.height / 2, 0]); changed = true;
      }
      if (data && data.schemaVersion === 2) {
        records = data.controls;
        for (i = 0; i < records.length; i += 1) {
          var record = records[i], cp = control(controller, record), id = record.paramId;
          var current = cp.value, logical = id === "faceTarget" ? current > 0.5 : current;
          var explicit = args.applyPreset && (id === "preset" || id === "inclination" || id === "azimuth" || id === "bank");
          var requested = explicit && id !== "preset" ? 0 : desired[id];
          var requestChanged = !lastRequest || desired[id] !== lastRequest[id];
          // Same defaults never erase hand-tuned or animated controller settings.
          var mayWrite = !regularQuick && !cp.numKeys && !cp.expression && (explicit || (id !== "preset" && requestChanged && logical === record.lastAppliedValue));
          if (mayWrite) {
            var hostValue = id === "faceTarget" ? requested ? 1 : 0 : requested;
            if (hostValue !== current) { controlStates.push({property: cp, value: current}); cp.setValue(hostValue); changed = true; }
            record.lastAppliedValue = requested;
          }
        }
      } else {
        var controls = MotionLiveControls.create(controller, config(controller, desired, context.locale === "en-US" ? "en-US" : "pt-BR"));
        records = controls.records; createdControls = records; warnings = controls.warnings; changed = true;
      }
      // Re-resolve property handles after native dimensionality/parent changes.
      for (i = 0; i < layers.length; i += 1) {
        var layer = layers[i], posBefore = prop(layer, POS), facingBefore = prop(layer, ORIENT);
        var layerState = {layer: layer, parent: layer.parent, threeD: layer.threeDLayer, position: snapshot(/** @type {Property} */ (posBefore)), orientation: facingBefore ? snapshot(facingBefore) : null, mutated: false};
        states.push(layerState);
        if (!layer.threeDLayer) { layer.threeDLayer = true; changed = true; }
        layerState.mutated = true;
        if (layer.parent !== controller) { layer.parent = controller; changed = true; }
        var pos = /** @type {Property} */ (prop(layer, POS)), facing = prop(layer, ORIENT);
        if (!facing || !facing.canSetExpression || facing.numKeys || (facing.expression && !MotionExpressions.isManagedOrbitFacing(facing.expression))) throw new Error("Orientation 3D indisponivel ou ocupada.");
        var source = MotionExpressions.renderOrbitLive({controls: records, ordinal: i, count: layers.length, startTime: startTime});
        var facingSource = MotionExpressions.renderOrbitFacingLive({controls: records});
        if (pos.expression !== source || !pos.expressionEnabled) { pos.expression = source; pos.expressionEnabled = true; applied += 1; changed = true; }
        if (facing.expression !== facingSource || !facing.expressionEnabled) { facing.expression = facingSource; facing.expressionEnabled = true; changed = true; }
        if (pos.expressionError || facing.expressionError) throw new Error("After Effects recusou a orbita: " + (pos.expressionError || facing.expressionError));
      }
      if (args.bake) {
        var bakePlan = /** @type {any[]} */ ([]);
        for (i = 0; i < layers.length; i += 1) {
          bakePlan.push({property: prop(layers[i], POS), samples: sample(/** @type {Property} */ (prop(layers[i], POS)), comp)});
          bakePlan.push({property: prop(layers[i], ORIENT), samples: sample(/** @type {Property} */ (prop(layers[i], ORIENT)), comp)});
        }
        for (i = 0; i < bakePlan.length; i += 1) writeSamples(bakePlan[i].property, bakePlan[i].samples);
        changed = true;
      }
      var ids = []; for (i = 0; i < layers.length; i += 1) ids.push(layers[i].id);
      controller.comment = MotionRigMeta.write(controller.comment, MotionJson.stringify({namespace: "Moti.on", schemaVersion: 2, rigType: TYPE, role: "controller", controllerId: controller.id, startTime: startTime, memberIds: ids, controls: records, lastRequested: regularQuick && lastRequest ? lastRequest : desired}));
    } catch (error) {
      var failed = false;
      for (i = states.length - 1; i >= 0; i -= 1) {
        var state = states[i];
        try {
          // A rejected type change can leave an untouched hidden 2D Orientation.
          if (!state.mutated && state.layer.threeDLayer === state.threeD && state.layer.parent === state.parent) continue;
          var currentPos = prop(state.layer, POS), currentOrientation = prop(state.layer, ORIENT);
          if (currentPos) { currentPos.expression = ""; currentPos.expressionEnabled = false; while (currentPos.numKeys > 0) currentPos.removeKey(currentPos.numKeys); }
          if (currentOrientation && state.orientation) {
            currentOrientation.expression = ""; currentOrientation.expressionEnabled = false; while (currentOrientation.numKeys > 0) currentOrientation.removeKey(currentOrientation.numKeys);
          }
          state.layer.parent = state.parent;
          if (state.orientation && state.layer.threeDLayer) restoreProperty(/** @type {Property} */ (prop(state.layer, ORIENT)), state.orientation);
          state.layer.threeDLayer = state.threeD;
          restoreProperty(/** @type {Property} */ (prop(state.layer, POS)), state.position);
        } catch (restoreError) { failed = true; }
      }
      for (i = controlStates.length - 1; i >= 0; i -= 1) try { controlStates[i].property.setValue(controlStates[i].value); } catch (restoreControlError) { failed = true; }
      try {
        if (created) { created.remove(); created = null; }
        else if (controller) {
          for (i = createdControls.length - 1; i >= 0; i -= 1) {
            var parade = controller.property("ADBE Effect Parade"), effect = null;
            for (var e = 1; e <= parade.numProperties; e += 1) if (parade.property(e).name === createdControls[i].name) effect = parade.property(e);
            if (effect && effect.matchName === createdControls[i].matchName) effect.remove(); else failed = true;
          }
          controller.comment = beforeComment;
        }
      } catch (restoreControllerError) { failed = true; }
      var outcome = /** @type {Error & {motionCode?: string}} */ (new Error("Nao foi possivel aplicar Orbital: " + String(error)));
      outcome.motionCode = failed ? MotionContracts.ERROR.ROLLBACK_FAILED : MotionContracts.ERROR.HOST_OPERATION_FAILED; throw outcome;
    } finally { restoreSelection(savedSelection, created); }
    return {changed: changed, warnings: warnings, data: {orbitedLayers: layers.length, appliedCount: applied, controllerCreated: !!created, controllerName: controller.name, controllerLayerIndex: controller.index, baked: !!args.bake, liveControls: records}};
  }
  MotionRegistry.register("ae.3d.orbit", {preflight: preflight, run: run});
})();
