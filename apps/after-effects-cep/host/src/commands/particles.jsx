/** CC Particle World: controls measured in AE 26.5, independent of UI locale.
 * The host already renders particles natively. This adapter owns setup,
 * instance identity and reversible parameter updates.
 */
(function () {
  var EFFECT = "CC Particle World";
  var FIELDS = ["birthRate", "longevity", "velocity"];
  var PARAMS = ["CC Particle World-0004", "CC Particle World-0005", "CC Particle World-0016"];
  var DEFAULTS = [2, 1, 1];
  var OPEN = "[MOTION_PARTICLES_V1]", CLOSE = "[/MOTION_PARTICLES_V1]";
  var staged = /** @type {any} */ (null);
  /** @param {string} code @param {string} message @returns {MotionCommandFailure} */
  function failure(code, message) { return { code: code, message: message, recoverable: true, details: null }; }
  /** @param {any} value @param {number} min @param {number} max @returns {boolean} */
  function inRange(value, min, max) { return typeof value === "number" && isFinite(value) && value >= min && value <= max; }
  /** @param {any} layer @returns {any} */
  function metadata(layer) {
    var text = layer.comment || "", start = text.indexOf(OPEN), end = text.indexOf(CLOSE);
    if (start < 0 || end <= start) return null;
    try {
      var record = /** @type {any} */ (MotionJson.parse(text.substring(start + OPEN.length, end)));
      return record && record.schemaVersion === 1 && typeof record.effectName === "string" ? record : null;
    } catch (error) { return null; }
  }
  /** @param {any} layer @returns {any} */
  function inspect(layer) {
    if (layer.locked) return { error: MotionErrors.failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "hostError.layerLocked", "Desbloqueie a camada emissora.") };
    var parade = layer.property("ADBE Effect Parade"), record = metadata(layer), found = null;
    if (!parade || !parade.canAddProperty(EFFECT)) return { error: failure(MotionContracts.ERROR.CAPABILITY_UNAVAILABLE, "CC Particle World nao esta disponivel nesta camada/instalacao.") };
    for (var i = 1; i <= parade.numProperties; i += 1) {
      var effect = parade.property(i);
      if (effect.matchName !== EFFECT) continue;
      if (!record || effect.name !== record.effectName || found) return { error: failure(MotionContracts.ERROR.TRACK_CONFLICT, "A camada ja possui particulas do usuario ou mais de uma instancia. Ajuste pelo painel de efeitos.") };
      found = effect;
    }
    if (record && !found) return { error: failure(MotionContracts.ERROR.TRACK_CONFLICT, "O emissor gerenciado foi removido ou renomeado. Preserve o rig existente e use outra camada.") };
    if (!record && (layer.comment || "").indexOf(OPEN) >= 0) return { error: failure(MotionContracts.ERROR.TRACK_CONFLICT, "Os dados do emissor estao incompletos. Use outra camada para preservar o projeto.") };
    if (found) {
      for (i = 0; i < PARAMS.length; i += 1) {
        var parameter = found.property(PARAMS[i]);
        if (!parameter || typeof parameter.setValue !== "function") return { error: failure(MotionContracts.ERROR.CAPABILITY_UNAVAILABLE, "Esta versao de CC Particle World nao expoe os controles esperados.") };
        if (parameter.numKeys > 0 || parameter.expression) return { error: failure(MotionContracts.ERROR.EXPRESSION_CONFLICT, "As particulas possuem animacao manual. Ajuste pelos controles do efeito para preserva-la.") };
      }
    }
    return { effect: found, record: record, error: null };
  }
  /** @param {Record<string, unknown>} args @returns {MotionCommandFailure|null} */
  function preflight(args) {
    staged = null;
    for (var key in args) if (Object.prototype.hasOwnProperty.call(args, key) && key !== "birthRate" && key !== "longevity" && key !== "velocity") return failure(MotionContracts.ERROR.INVALID_PRESET, "Parametro de particulas desconhecido.");
    if (typeof args.birthRate !== "undefined" && !inRange(args.birthRate, 0, 100)) return failure(MotionContracts.ERROR.INVALID_PRESET, "Birth Rate precisa estar entre 0 e 100.");
    if (typeof args.longevity !== "undefined" && !inRange(args.longevity, 0.01, 100)) return failure(MotionContracts.ERROR.INVALID_PRESET, "Longevity precisa estar entre 0,01 e 100 segundos.");
    if (typeof args.velocity !== "undefined" && !inRange(args.velocity, 0, 100)) return failure(MotionContracts.ERROR.INVALID_PRESET, "Velocity precisa estar entre 0 e 100.");
    if (typeof app === "undefined" || !app.project) return failure(MotionContracts.ERROR.NO_ACTIVE_PROJECT, "Nenhum projeto aberto.");
    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) return failure(MotionContracts.ERROR.NO_ACTIVE_COMP, "Nenhuma composicao ativa.");
    var selected = comp.selectedLayers;
    if (selected.length > 1) return failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Selecione no maximo uma camada emissora.");
    var target = selected.length === 1 ? selected[0] : null;
    if (!target) {
      for (var i = 1; i <= comp.numLayers; i += 1) {
        var candidate = comp.layer(i), record = metadata(candidate);
        if (record && record.role === "emitter") {
          if (target) return failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Selecione o emissor que deseja ajustar.");
          target = candidate;
        }
      }
    }
    var state = target ? inspect(target) : null;
    if (state && state.error) return state.error;
    if (!target) {
      var available = false, installed = /** @type {any} */ (app).effects || [];
      for (var n = 0; n < installed.length; n += 1) if (installed[n].matchName === EFFECT) available = true;
      if (!available) return failure(MotionContracts.ERROR.CAPABILITY_UNAVAILABLE, "CC Particle World nao esta instalado neste After Effects.");
    }
    staged = { comp: comp, layer: target, fingerprint: MotionJson.stringify(args) };
    return null;
  }
  /** @param {Record<string, unknown>} args @returns {MotionCommandResult} */
  function run(args) {
    var plan = staged; staged = null;
    if (!plan || plan.comp !== app.project.activeItem || plan.fingerprint !== MotionJson.stringify(args)) throw new Error("O contexto de Particles mudou. Aplique novamente.");
    var comp = plan.comp, layer = plan.layer, selected = comp.selectedLayers, time = comp.time;
    var createdLayer = false, createdEffect = false, source = null, effect = null, previous = [], comment = layer ? layer.comment : "";
    var result;
    try {
      if (!layer) {
        layer = comp.layers.addSolid([0, 0, 0], "Moti.on Particles", comp.width, comp.height, comp.pixelAspect, comp.duration);
        createdLayer = true; source = layer.source;
      }
      comment = layer.comment;
      var state = inspect(layer);
      if (state.error) throw new Error(state.error.code + ": " + state.error.message);
      effect = state.effect;
      if (!effect) {
        effect = layer.property("ADBE Effect Parade").addProperty(EFFECT); createdEffect = true;
        var identity = String(layer.id) + "-" + String(new Date().getTime());
        effect.name = MotionContracts.RIG_PREFIX + "PARTICLES " + identity;
        var record = { schemaVersion: 1, effectName: effect.name, role: createdLayer ? "emitter" : "effect" };
        layer.comment = (comment ? comment + "\n" : "") + OPEN + MotionJson.stringify(record) + CLOSE;
      }
      // Resolve all parameters before writing any of them.
      var properties = [];
      for (var p = 0; p < PARAMS.length; p += 1) {
        var property = effect.property(PARAMS[p]);
        if (!property || typeof property.setValue !== "function") throw new Error("CAPABILITY_UNAVAILABLE: Controle de particulas ausente: " + PARAMS[p]);
        properties.push(property); previous.push(property.value);
      }
      for (p = 0; p < properties.length; p += 1) properties[p].setValue(typeof args[/** @type {string} */ (FIELDS[p])] === "number" ? args[/** @type {string} */ (FIELDS[p])] : DEFAULTS[p]);
      result = { changed: true, warnings: [], data: { layerId: layer.id, effectMatchName: EFFECT, adjusted: !createdEffect, createdLayer: createdLayer } };
    } catch (error) {
      var rollbackFailed = false;
      try {
        if (createdLayer) { layer.remove(); if (source && source.usedIn.length === 0) source.remove(); }
        else {
          if (createdEffect && effect) effect.remove();
          else if (effect) for (var r = 0; r < previous.length; r += 1) effect.property(PARAMS[r]).setValue(previous[r]);
          if (layer) layer.comment = comment;
        }
      } catch (rollbackError) { rollbackFailed = true; }
      if (rollbackFailed) {
        var rollbackFailure = /** @type {Error & {cause?: unknown, motionCode?: string}} */ (new Error("Nao foi possivel restaurar Particles; use Undo."));
        rollbackFailure.cause = error;
        rollbackFailure.motionCode = MotionContracts.ERROR.ROLLBACK_FAILED;
        throw rollbackFailure;
      }
      throw error;
    } finally {
      comp.time = time;
      for (var l = 1; l <= comp.numLayers; l += 1) comp.layer(l).selected = false;
      for (l = 0; l < selected.length; l += 1) selected[l].selected = true;
    }
    return result;
  }
  MotionRegistry.register("ae.effect.particles", { preflight: preflight, run: run });
})();
