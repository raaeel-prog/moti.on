/**
 * Glitch rendered by CHMS Motion Core. The native effect is the live control
 * group: no duplicate sliders or expressions are needed to drive its pixels.
 * Applying again adjusts static parameters on the same managed solid; manual
 * keyframes/expressions remain editable. The dispatcher owns the Undo group.
 */
(function () {
  var ALLOWED = {
    mode: true, intensity: true, frequency: true, rgbSplit: true,
    displacement: true, frameHold: true, seed: true, durationFrames: true
  };
  var PLUGIN = "CHMS Motion Core";
  var CONTROLLER_NAME = MotionContracts.RIG_PREFIX + "GLITCH_CORE";
  var EFFECT_NAME = MotionContracts.RIG_PREFIX + PLUGIN;
  var RIG_TYPE = "glitchNative";
  // Stable native parameter order; disk IDs 1 and 2 retain the original ABI.
  var PARAMS = [
    { field: "intensity", matchName: PLUGIN + "-0001", scale: 100, integer: true },
    { field: "rgbSplit", matchName: PLUGIN + "-0002", scale: 1, integer: true },
    { field: "frequency", matchName: PLUGIN + "-0003", scale: 1, integer: false },
    { field: "displacement", matchName: PLUGIN + "-0004", scale: 1, integer: false },
    { field: "seed", matchName: PLUGIN + "-0005", scale: 1, integer: true }
  ];

  /** @param {string} code @param {string} message @param {unknown} details @returns {MotionCommandFailure} */
  function failure(code, message, details) {
    return { code: code, message: message, recoverable: true, details: details };
  }
  /** @param {unknown} value @param {number} min @param {number} max @returns {boolean} */
  function inRange(value, min, max) {
    return typeof value === "number" && isFinite(value) && value >= min && value <= max;
  }
  /** @param {Record<string, unknown>} args @returns {MotionCommandFailure|null} */
  function validateArgs(args) {
    var key;
    for (key in args) {
      if (Object.prototype.hasOwnProperty.call(args, key) && !Object.prototype.hasOwnProperty.call(ALLOWED, key)) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Argumento Glitch desconhecido.", { field: key });
      }
    }
    for (key in ALLOWED) {
      if (Object.prototype.hasOwnProperty.call(ALLOWED, key) && !Object.prototype.hasOwnProperty.call(args, key)) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Argumento Glitch ausente.", { field: key });
      }
    }
    if (args.mode !== "continuous" && args.mode !== "oneShot") {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Modo de Glitch invalido.", { field: "mode" });
    }
    var ranges = [
      { field: "intensity", min: 0, max: 1 },
      { field: "frequency", min: 0, max: 120 },
      { field: "rgbSplit", min: 0, max: 200 },
      { field: "displacement", min: 0, max: 2000 },
      { field: "seed", min: 0, max: 1000000 },
      { field: "durationFrames", min: 1, max: 10000 }
    ];
    for (var i = 0; i < ranges.length; i += 1) {
      var range = ranges[i];
      if (!range || !inRange(args[range.field], range.min, range.max)) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Parametro Glitch fora da faixa permitida.", { field: range ? range.field : "" });
      }
    }
    if (Math.floor(/** @type {number} */ (args.seed)) !== args.seed || Math.floor(/** @type {number} */ (args.durationFrames)) !== args.durationFrames) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Semente e duracao precisam ser inteiras.", null);
    }
    if (typeof args.frameHold !== "boolean") {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "frameHold precisa ser booleano.", { field: "frameHold" });
    }
    if (args.frameHold) {
      return failure(MotionContracts.ERROR.CAPABILITY_UNAVAILABLE, "Este motor ainda nao oferece retencao temporal de quadros.", { feature: "frameHold" });
    }
    return null;
  }

  /** @param {any} layer @returns {any} */
  function engineOn(layer) {
    var parade = MotionEffects.parade(layer);
    if (!parade) return null;
    var exact = MotionEffects.findManaged(parade, PLUGIN, EFFECT_NAME);
    if (exact) return exact;
    var candidate = null;
    for (var i = 1; i <= parade.numProperties; i += 1) {
      var effect = parade.property(i);
      if (effect && effect.matchName === PLUGIN) {
        if (candidate) return null;
        candidate = effect;
      }
    }
    return candidate;
  }

  /** @param {CompItem} comp @returns {{controller: any, error: MotionCommandFailure|null}} */
  function locate(comp) {
    var controller = null;
    for (var i = 1; i <= comp.numLayers; i += 1) {
      var layer = comp.layer(i);
      var marked = MotionRigMeta.has(layer.comment, RIG_TYPE);
      var parade = MotionEffects.parade(layer);
      var legacy = layer.name === CONTROLLER_NAME && parade && MotionEffects.findManaged(parade, PLUGIN, EFFECT_NAME);
      if (layer.name === MotionContracts.RIG_PREFIX + "GLITCH" && parade) {
        var oldTypes = ["ADBE Geometry2", "ADBE Channel Blur", "ADBE Noise"];
        for (var j = 0; j < oldTypes.length; j += 1) {
          var oldType = oldTypes[j];
          if (oldType && MotionEffects.findManaged(parade, oldType, MotionContracts.RIG_PREFIX + oldType)) {
            return { controller: null, error: failure(MotionContracts.ERROR.TRACK_CONFLICT, "A composicao ainda possui o Glitch antigo de efeitos empilhados. Remova esse rig antigo e aplique novamente para usar o motor nativo.", { reason: "legacyEffectStack" }) };
          }
        }
      }
      if (!marked && !legacy) continue;
      if (controller) return { controller: null, error: failure(MotionContracts.ERROR.TRACK_CONFLICT, "Ha mais de um rig Glitch nesta composicao.", { rigType: RIG_TYPE }) };
      controller = layer;
    }
    if (controller && controller.nullLayer) {
      return { controller: null, error: failure(MotionContracts.ERROR.TRACK_CONFLICT, "O Glitch antigo usa um null. Remova esse rig antigo e aplique novamente para criar a camada de ajuste correta.", { reason: "legacyNullController" }) };
    }
    if (controller && (/** @type {any} */ (controller).locked || !controller.adjustmentLayer)) {
      return { controller: null, error: failure(MotionContracts.ERROR.TRACK_CONFLICT, "O controller Glitch esta bloqueado ou deixou de ser uma camada de ajuste.", { reason: "controllerChanged" }) };
    }
    if (controller && !engineOn(controller)) {
      return { controller: null, error: failure(MotionContracts.ERROR.TRACK_CONFLICT, "O efeito gerenciado foi removido ou sua identidade ficou ambigua.", { effect: PLUGIN }) };
    }
    return { controller: controller, error: null };
  }

  /** Catalog probe is read-only, including compositions with no layers. @returns {boolean} */
  function installed() {
    var catalog = /** @type {any} */ (app).effects;
    if (!catalog || typeof catalog.length !== "number") return false;
    for (var i = 0; i < catalog.length; i += 1) {
      if (catalog[i] && catalog[i].matchName === PLUGIN) return true;
    }
    return false;
  }
  /** @param {any} effect @returns {boolean} */
  function compatible(effect) {
    for (var i = 0; i < PARAMS.length; i += 1) {
      var param = PARAMS[i];
      if (!param || !effect.property(param.matchName)) return false;
    }
    return true;
  }
  /** @param {Record<string, unknown>} args @returns {MotionCommandFailure|null} */
  function preflight(args) {
    var validation = validateArgs(args);
    if (validation) return validation;
    var comp = app.project ? app.project.activeItem : null;
    if (!comp || !(comp instanceof CompItem)) return failure(MotionContracts.ERROR.NO_ACTIVE_COMP, "Nenhuma composicao ativa.", null);
    if (args.mode === "oneShot" && (comp.time < 0 || comp.time >= comp.duration)) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Posicione o cursor dentro da composicao.", { field: "durationFrames" });
    }
    if (!installed()) {
      return failure(MotionContracts.ERROR.CAPABILITY_UNAVAILABLE, "CHMS Motion Core nao foi carregado. Instale a versao atual do plugin e reinicie o After Effects.", { effect: PLUGIN });
    }
    var located = locate(comp);
    if (located.error) return located.error;
    if (located.controller && !compatible(engineOn(located.controller))) {
      return failure(MotionContracts.ERROR.CAPABILITY_UNAVAILABLE, "A versao instalada de CHMS Motion Core nao expoe os controles exigidos. Atualize o plugin e reinicie o After Effects.", { effect: PLUGIN, parameterCount: PARAMS.length });
    }
    // A catalog entry alone is not sufficient when a layer can reject effects.
    for (var i = 1; i <= comp.numLayers; i += 1) {
      var parade = MotionEffects.parade(comp.layer(i));
      if (!parade) continue;
      try {
        if (!parade.canAddProperty(PLUGIN)) return failure(MotionContracts.ERROR.CAPABILITY_UNAVAILABLE, "CHMS Motion Core nao esta disponivel para aplicacao.", { effect: PLUGIN });
      } catch (probeError) {
        return failure(MotionContracts.ERROR.CAPABILITY_UNAVAILABLE, "Nao foi possivel verificar CHMS Motion Core.", { effect: PLUGIN });
      }
      break;
    }
    return null;
  }

  /** @param {Record<string, unknown>} args @returns {MotionCommandResult} */
  function run(args) {
    var comp = /** @type {CompItem} */ (app.project.activeItem);
    var located = locate(comp);
    if (located.error) throw new Error("O rig Glitch mudou depois do preflight.");
    var controller = located.controller;
    var created = false;
    var source = /** @type {any} */ (null);
    var previous = controller ? { comment: controller.comment, inPoint: controller.inPoint, outPoint: controller.outPoint } : null;
    var touched = /** @type {Array<any>} */ ([]);
    var selectedLayers = comp.selectedLayers;
    var selectedProperties = comp.selectedProperties;
    var warnings = /** @type {Array<{code: string, message: string, details: unknown}>} */ ([]);
    var i;
    try {
      if (!controller) {
        controller = /** @type {any} */ (comp.layers).addSolid([1, 1, 1], CONTROLLER_NAME, comp.width, comp.height, /** @type {any} */ (comp).pixelAspect, comp.duration);
        created = true;
        source = controller.source;
        controller.adjustmentLayer = true;
        MotionEffects.add(/** @type {PropertyGroup} */ (MotionEffects.parade(controller)), PLUGIN, EFFECT_NAME);
      }
      var effect = engineOn(controller);
      if (!effect || !compatible(effect)) throw new Error("O motor nativo nao expoe o contrato Glitch esperado.");
      for (i = 0; i < PARAMS.length; i += 1) {
        var binding = PARAMS[i];
        if (!binding) continue;
        var property = effect.property(binding.matchName);
        if (property.numKeys > 0 || property.expression) {
          warnings.push({ code: "glitch.animatedParameterPreserved", message: "A animacao manual do parametro foi preservada.", details: { field: binding.field } });
          continue;
        }
        var value = /** @type {number} */ (args[binding.field]) * binding.scale;
        if (binding.integer) value = Math.round(value);
        touched.push({ property: property, value: property.value });
        property.setValue(value);
      }
      controller.inPoint = args.mode === "oneShot" ? comp.time : 0;
      controller.outPoint = args.mode === "oneShot" ? Math.min(comp.duration, comp.time + /** @type {number} */ (args.durationFrames) * comp.frameDuration) : comp.duration;
      controller.comment = MotionRigMeta.write(controller.comment, MotionJson.stringify({ schemaVersion: 1, rigType: RIG_TYPE, effect: PLUGIN, parameterSchema: 1 }));
    } catch (error) {
      var rollbackFailed = false;
      if (created) {
        try {
          controller.remove();
          if (source && source.usedIn.length === 0) source.remove();
        } catch (removeError) { rollbackFailed = true; }
      } else {
        for (i = touched.length - 1; i >= 0; i -= 1) {
          try { touched[i].property.setValue(touched[i].value); } catch (restoreError) { rollbackFailed = true; }
        }
        if (controller && previous) {
          try {
            controller.inPoint = previous.inPoint;
            controller.outPoint = previous.outPoint;
            controller.comment = previous.comment;
          } catch (restoreControllerError) { rollbackFailed = true; }
        }
      }
      if (rollbackFailed) {
        var rollbackError = /** @type {Error & {motionCode?: string}} */ (new Error("Glitch falhou e nao foi possivel restaurar todo o estado anterior."));
        rollbackError.motionCode = MotionContracts.ERROR.ROLLBACK_FAILED;
        throw rollbackError;
      }
      throw error;
    } finally {
      // addSolid changes selection. Restore the previous layers/properties,
      // including on failure, without moving the current-time indicator.
      if (created && controller) {
        try { controller.selected = false; } catch (removedControllerError) { /* Removed during rollback. */ }
      }
      for (i = 0; i < selectedLayers.length; i += 1) {
        var selected = selectedLayers[i];
        if (selected) selected.selected = true;
      }
      for (i = 0; i < selectedProperties.length; i += 1) {
        var selectedProperty = selectedProperties[i];
        if (selectedProperty) /** @type {any} */ (selectedProperty).selected = true;
      }
    }
    return { changed: true, warnings: warnings, data: { effectCount: 1, controllerCreated: created, mode: args.mode, engine: PLUGIN } };
  }
  MotionRegistry.register("ae.effect.glitch", { preflight: preflight, run: run });
}());
