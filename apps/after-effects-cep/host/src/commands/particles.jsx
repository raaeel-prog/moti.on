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
  function legacyPreflight(args) {
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
  function legacyRun(args) {
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
  var V2_OPEN = "[MOTION_PARTICLES_V2]", V2_CLOSE = "[/MOTION_PARTICLES_V2]";
  var MODES = ["classic", "dust", "bokeh", "snow", "sparks", "field3d", "rising"];
  // Native match names are populated from the capability receipt, never display labels.
  var NATIVE = { animation: "CC Particle World-0015", extra: "CC Particle World-0019", angle: "CC Particle World-0020", axisX: "CC Particle World-0095", axisY: "CC Particle World-0096", axisZ: "CC Particle World-0097", birthRate: "CC Particle World-0004", longevity: "CC Particle World-0005", velocity: "CC Particle World-0016", x: "CC Particle World-0007", y: "CC Particle World-0008", z: "CC Particle World-0009", radiusX: "CC Particle World-0010", radiusY: "CC Particle World-0011", radiusZ: "CC Particle World-0012", gravity: "CC Particle World-0018", resistance: "CC Particle World-0041", particleType: "CC Particle World-0023", birthSize: "CC Particle World-0024", deathSize: "CC Particle World-0025", variation: "CC Particle World-0026", opacity: "CC Particle World-0027", colorMap: "CC Particle World-0028", birthColor: "CC Particle World-0029", deathColor: "CC Particle World-0030", seed: "CC Particle World-0104" };
  var NUMERIC = /** @type {any[]} */ ([["birthRate", 0, 100], ["longevity", 0.01, 100], ["velocity", 0, 100], ["size", 0.001, 1], ["opacity", 0, 100], ["movement", 0, 5], ["direction", 0, 360], ["spread", 0, 100]]);
  var MARKER = "// MOTION_PARTICLES_V2\n";
  /** @param {any} list @param {any} value @returns {boolean} */
  function includes(list, value) { for (var i = 0; i < list.length; i += 1) if (list[i] === value) return true; return false; }
  /** @param {any} value @returns {boolean} */
  function validColor(value) { return value instanceof Array && value.length === 3 && inRange(value[0], 0, 1) && inRange(value[1], 0, 1) && inRange(value[2], 0, 1); }
  /** @param {Record<string, unknown>} args @returns {MotionCommandFailure|null} */
  function validateArgs(args) {
    var allowed = ["action", "mode", "birthRate", "longevity", "velocity", "size", "opacity", "color", "movement", "seed", "streams", "direction", "spread", "changedFields", "targetRigId", "targetCompId", "precompose"], key, i;
    for (key in args) if (Object.prototype.hasOwnProperty.call(args, key) && !includes(allowed, key)) return failure(MotionContracts.ERROR.INVALID_PRESET, "Parametro de particulas desconhecido.");
    if (typeof args.mode !== "undefined" && !includes(MODES, args.mode)) return failure(MotionContracts.ERROR.INVALID_PRESET, "Modo de particulas desconhecido.");
    if (typeof args.action !== "undefined" && args.action !== "apply" && args.action !== "remove") return failure(MotionContracts.ERROR.INVALID_PRESET, "Acao de particulas desconhecida.");
    for (i = 0; i < NUMERIC.length; i += 1) if (typeof args[NUMERIC[i][0]] !== "undefined" && !inRange(args[NUMERIC[i][0]], NUMERIC[i][1], NUMERIC[i][2])) return failure(MotionContracts.ERROR.INVALID_PRESET, "Valor de particulas fora do intervalo: " + NUMERIC[i][0]);
    if (typeof args.color !== "undefined" && !validColor(args.color)) return failure(MotionContracts.ERROR.INVALID_PRESET, "Cor de particulas invalida.");
    if (typeof args.seed !== "undefined" && (!inRange(args.seed, 0, 10000) || Math.floor(/** @type {number} */ (args.seed)) !== args.seed)) return failure(MotionContracts.ERROR.INVALID_PRESET, "Seed de particulas invalido.");
    if (typeof args.precompose !== "undefined" && typeof args.precompose !== "boolean") return failure(MotionContracts.ERROR.INVALID_PRESET, "Opcao de pre-composicao invalida.");
    if (typeof args.targetRigId !== "undefined" && (typeof args.targetRigId !== "string" || !/^[A-Za-z0-9-]{1,128}$/.test(args.targetRigId))) return failure(MotionContracts.ERROR.INVALID_PRESET, "Identidade de rig invalida.");
    if (typeof args.targetCompId !== "undefined" && (!inRange(args.targetCompId, 1, 9007199254740991) || Math.floor(/** @type {number} */ (args.targetCompId)) !== args.targetCompId)) return failure(MotionContracts.ERROR.INVALID_PRESET, "Composicao invalida.");
    if (typeof args.changedFields !== "undefined") {
      var changes = /** @type {any} */ (args.changedFields);
      if (!(changes instanceof Array) || changes.length > 32) return failure(MotionContracts.ERROR.INVALID_PRESET, "Ajustes invalidos.");
      for (i = 0; i < changes.length; i += 1) if (typeof changes[i] !== "string" || !/^(mode|birthRate|longevity|velocity|size|opacity|color|movement|seed|direction|spread|streams\.[0-3]\.(amount|size|opacity|color|movement))$/.test(changes[i])) return failure(MotionContracts.ERROR.INVALID_PRESET, "Campo de ajuste invalido.");
    }
    if (typeof args.streams !== "undefined") {
      var streams = /** @type {any} */ (args.streams);
      if (!(streams instanceof Array) || streams.length !== 4) return failure(MotionContracts.ERROR.INVALID_PRESET, "Campo 3D requer quatro fluxos.");
      for (i = 0; i < streams.length; i += 1) {
        var stream = streams[i];
        if (!stream || typeof stream !== "object" || !inRange(stream.amount, 0, 3) || !inRange(stream.size, 0.1, 3) || !inRange(stream.opacity, 0, 100) || !validColor(stream.color) || !inRange(stream.movement, 0, 3)) return failure(MotionContracts.ERROR.INVALID_PRESET, "Fluxo de particulas invalido.");
        for (key in stream) if (Object.prototype.hasOwnProperty.call(stream, key) && !includes(["amount", "size", "opacity", "color", "movement"], key)) return failure(MotionContracts.ERROR.INVALID_PRESET, "Parametro de fluxo desconhecido.");
      }
    }
    if (args.changedFields) for (i = 0; i < /** @type {any} */ (args.changedFields).length; i += 1) {
      var changedKey = /** @type {any} */ (args.changedFields)[i];
      if (changedKey.indexOf("streams.") === 0 ? !args.streams : typeof args[changedKey] === "undefined") return failure(MotionContracts.ERROR.INVALID_PRESET, "Valor de ajuste ausente.");
    }
    return null;
  }
  /** @param {any} layer @param {boolean=} moved @returns {any} */
  function readV2(layer, moved) {
    var text = layer.comment || "", start = text.indexOf(V2_OPEN), end = text.indexOf(V2_CLOSE);
    if (start < 0) return null;
    if (end <= start || text.indexOf(V2_OPEN, start + V2_OPEN.length) >= 0) return { invalid: true };
    try { var record = /** @type {any} */ (MotionJson.parse(text.substring(start + V2_OPEN.length, end))); return record && (record.schemaVersion === 2 || record.schemaVersion === 3) && typeof record.rigId === "string" && (moved || record.layerId === layer.id) && (record.role === "controller" || record.role === "stream") ? record : { invalid: true }; } catch (error) { return { invalid: true }; }
  }
  /** @param {any} layer @param {any} record */
  function writeV2(layer, record) {
    var text = layer.comment || "", start = text.indexOf(V2_OPEN), end = text.indexOf(V2_CLOSE);
    var block = V2_OPEN + MotionJson.stringify(record) + V2_CLOSE;
    layer.comment = start < 0 ? (text ? text + "\n" : "") + block : text.substring(0, start) + block + text.substring(end + V2_CLOSE.length);
  }
  /** @param {any} args @returns {any} */
  function settingsFor(args) {
    var mode = args.mode || "classic", defaults = /** @type {any} */ ({ dust: [1.5, 6, 0.035, 0.1, 55, [1, 0.91, 0.75], 0.5], bokeh: [0.6, 7, 0.025, 0.6, 65, [0.72, 0.83, 1], 0.4], snow: [3, 7, 0.09, 0.13, 90, [0.91, 0.96, 1], 0.8], sparks: [1.4, 1.5, 0.6, 0.025, 100, [1, 0.52, 0.12], 1.2], field3d: [3, 8, 0.06, 0.2, 85, [1, 1, 1], 1], rising: [3, 8, 0.06, 0.2, 85, [1, 1, 1], 1] })[mode];
    var result = /** @type {any} */ ({ mode: mode, birthRate: defaults[0], longevity: defaults[1], velocity: defaults[2], size: defaults[3], opacity: defaults[4], color: defaults[5], movement: defaults[6], seed: 1, streams: [] }), keys = /** @type {any[]} */ (["birthRate", "longevity", "velocity", "size", "opacity", "color", "movement", "seed", "direction", "spread"]), i;
    var amounts = [0.4, 0.3, 0.2, 0.1], sizes = [0.45, 0.7, 1, 1.5], opacity = [45, 60, 75, 55], colors = [[0.64, 0.77, 1], [0.76, 0.86, 1], [0.91, 0.94, 1], [1, 0.91, 0.76]], movement = [0.55, 0.8, 1, 1.3];
    if (mode === "rising") { result.direction = 0; result.spread = 10; }
    for (i = 0; i < keys.length; i += 1) if (typeof args[keys[i]] !== "undefined") result[keys[i]] = args[keys[i]];
    for (i = 0; i < 4; i += 1) result.streams.push(args.streams ? args.streams[i] : { amount: amounts[i], size: sizes[i], opacity: opacity[i], color: colors[i], movement: movement[i] });
    return result;
  }
  /** @param {any} settings @param {boolean=} retainDirection @returns {any[]} */
  function descriptors(settings, retainDirection) {
    var output = [], keys = /** @type {any[]} */ (["birthRate", "velocity", "size", "opacity", "movement", "color"]), i, j;
    for (i = 0; i < keys.length; i += 1) output.push({ key: keys[i], name: "Moti.on Particles " + keys[i], color: keys[i] === "color", value: settings[keys[i]] });
    if (typeof settings.direction === "number" || retainDirection) {
      output.push({ key: "direction", name: "Moti.on Particles Direção", angle: true, value: typeof settings.direction === "number" ? settings.direction : 0 });
      output.push({ key: "spread", name: "Moti.on Particles Dispersão", value: typeof settings.spread === "number" ? settings.spread : 10 });
    }
    for (i = 0; i < 4; i += 1) for (j = 0; j < 5; j += 1) { var key = /** @type {any} */ (["amount", "size", "opacity", "movement", "color"][j]); output.push({ key: "streams." + i + "." + key, name: "Moti.on Particles " + (i + 1) + " " + key, color: key === "color", value: settings.streams[i][key] }); }
    return output;
  }
  /** @param {any} parade @param {string} name @returns {any} */
  function namedEffect(parade, name) { var found = null; for (var i = 1; i <= parade.numProperties; i += 1) { var effect = parade.property(i); if (effect.name === name) { if (found) return null; found = effect; } } return found; }
  /** @param {any} comp @param {string} rigId @param {boolean=} readOnly @returns {any} */
  function inspectRig(comp, rigId, readOnly) {
    var controller = null, members = [], i, record;
    for (i = 1; i <= comp.numLayers; i += 1) {
      var layer = comp.layer(i); record = readV2(layer);
      if (!record || record.rigId !== rigId) continue;
      if (layer.locked) return { error: MotionErrors.failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "hostError.layerLocked", "Desbloqueie os membros de Particles.") };
      if (record.role === "controller") { if (controller) return { error: failure(MotionContracts.ERROR.TRACK_CONFLICT, "Controlador duplicado de Particles.") }; controller = layer; }
      else { if (!inRange(record.streamIndex, 0, 3) || Math.floor(record.streamIndex) !== record.streamIndex || members[record.streamIndex]) return { error: failure(MotionContracts.ERROR.TRACK_CONFLICT, "Fluxo de Particles duplicado ou invalido.") }; members[record.streamIndex] = layer; }
    }
    if (!controller || members.length !== 4) return { error: failure(MotionContracts.ERROR.TRACK_CONFLICT, "Rig de Particles incompleto. Use Undo para restaurar os membros.") };
    var owner = readV2(controller);
    if (!owner.memberIds || owner.memberIds.length !== 4 || !owner.settings) return { error: failure(MotionContracts.ERROR.TRACK_CONFLICT, "Metadata de Particles incompleta.") };
    var controls = descriptors(owner.settings, owner.directionControls), parade = controller.property("ADBE Effect Parade");
    for (i = 0; i < controls.length; i += 1) {
      var descriptor = controls[i], effect = namedEffect(parade, descriptor.name), expected = controlType(descriptor);
      var property = effect && effect.matchName === expected ? effect.property(expected + "-0001") : null;
      if (!property) return { error: failure(MotionContracts.ERROR.TRACK_CONFLICT, "Controle gerenciado de Particles ausente ou renomeado.") };
      if (!readOnly && (property.numKeys > 0 || property.expression)) return { error: failure(MotionContracts.ERROR.EXPRESSION_CONFLICT, "Particles possui controles animados manualmente. Preserve-os pelo painel de efeitos.") };
    }
    for (i = 0; i < 4; i += 1) {
      if (!members[i] || members[i].parent !== controller || members[i].id !== owner.memberIds[i]) return { error: failure(MotionContracts.ERROR.TRACK_CONFLICT, "A identidade ou hierarquia do fluxo de Particles mudou.") };
      record = readV2(members[i]); parade = members[i].property("ADBE Effect Parade"); effect = namedEffect(parade, record.effectName);
      if (!effect || effect.matchName !== EFFECT) return { error: failure(MotionContracts.ERROR.TRACK_CONFLICT, "O efeito do fluxo foi removido ou renomeado.") };
      var assignments = nativeAssignments(owner.settings, i);
      for (var j = 0; j < assignments.length; j += 1) {
        var assignment = assignments[j]; property = effect.property(assignment.matchName);
        if (!property || typeof property.setValue !== "function") return { error: failure(MotionContracts.ERROR.CAPABILITY_UNAVAILABLE, "Controle nativo de particulas indisponivel: " + assignment.matchName) };
        if (!readOnly && (property.numKeys > 0 || (property.expression || "") !== (assignment.expression || ""))) return { error: failure(MotionContracts.ERROR.EXPRESSION_CONFLICT, "Um fluxo de Particles possui animacao manual. Preserve-a pelo painel de efeitos.") };
      }
    }
    return { error: null, controller: controller, members: members, record: owner };
  }
  /** @param {any} descriptor @returns {string} */
  function controlType(descriptor) { return descriptor.angle ? "ADBE Angle Control" : descriptor.color ? "ADBE Color Control" : "ADBE Slider Control"; }
  /** @param {any} rig @returns {any} */
  function liveSettings(rig) {
    var settings = /** @type {any} */ (MotionJson.parse(MotionJson.stringify(rig.record.settings))), controls = descriptors(settings, rig.record.directionControls);
    for (var i = 0; i < controls.length; i += 1) {
      var descriptor = controls[i], value = namedEffect(rig.controller.property("ADBE Effect Parade"), descriptor.name).property(controlType(descriptor) + "-0001").value;
      if ((descriptor.key === "direction" || descriptor.key === "spread") && typeof rig.record.settings.direction !== "number") continue;
      if (descriptor.color) value = [value[0], value[1], value[2]];
      if (descriptor.key.indexOf("streams.") === 0) { var parts = descriptor.key.split("."); settings.streams[Number(parts[1])][parts[2]] = value; }
      else settings[descriptor.key] = value;
    }
    if (typeof settings.direction === "number") settings.direction = ((settings.direction % 360) + 360) % 360;
    var firstState = readV2(rig.members[0]), firstEffect = namedEffect(rig.members[0].property("ADBE Effect Parade"), firstState.effectName);
    settings.longevity = firstEffect.property(NATIVE.longevity).value;
    settings.seed = firstEffect.property(NATIVE.seed).value;
    return settings;
  }
  /** @param {any} args @param {string} key @returns {boolean} */
  function changedField(args, key) { return !args.changedFields || includes(args.changedFields, "mode") || includes(args.changedFields, key); }
  /** @param {any} args @param {any} rig @returns {any} */
  function adjustedSettings(args, rig) {
    if (!rig || !args.changedFields || includes(args.changedFields, "mode")) return settingsFor(args);
    var settings = liveSettings(rig);
    for (var i = 0; i < args.changedFields.length; i += 1) {
      var key = args.changedFields[i];
      if (key.indexOf("streams.") === 0) { var parts = key.split("."); settings.streams[Number(parts[1])][parts[2]] = args.streams[Number(parts[1])][parts[2]]; }
      else settings[key] = args[key];
    }
    if (typeof settings.direction === "number" && typeof settings.spread !== "number") settings.spread = 10;
    return settings;
  }
  /** Only native assignments whose recipe actually changes may be rewritten by a patch.
   * @param {any} args @param {any} previous @param {any} assignment @returns {boolean} */
  function nativeChanged(args, previous, assignment) {
    if (!args.changedFields) return true;
    if (!previous || (previous.expression || "") !== (assignment.expression || "")) return true;
    if (assignment.expression) return false;
    return MotionJson.stringify(previous.value) !== MotionJson.stringify(assignment.value);
  }
  /** @param {any} rig @param {any} settings @param {any} args @returns {MotionCommandFailure|null} */
  function patchPreflight(rig, settings, args) {
    var controls = descriptors(settings), i, j;
    for (i = 0; i < controls.length; i += 1) {
      var descriptor = controls[i]; if (!changedField(args, descriptor.key)) continue;
      var effect = namedEffect(rig.controller.property("ADBE Effect Parade"), descriptor.name);
      if (effect) { var property = effect.property(controlType(descriptor) + "-0001"); if (property.numKeys > 0 || property.expression) return failure(MotionContracts.ERROR.EXPRESSION_CONFLICT, "Controle animado: " + descriptor.name); }
    }
    for (i = 0; i < 4; i += 1) {
      var before = nativeAssignments(rig.record.settings, i), after = nativeAssignments(settings, i, rig.record.settings), state = readV2(rig.members[i]);
      var nativeEffect = namedEffect(rig.members[i].property("ADBE Effect Parade"), state.effectName);
      for (j = 0; j < after.length; j += 1) {
        var prior = null; for (var n = 0; n < before.length; n += 1) if (before[n].matchName === after[j].matchName) prior = before[n];
        var dependencyChanged = false;
        for (var d = 0; d < controls.length; d += 1) if (changedField(args, controls[d].key) && (after[j].expression || "").indexOf('effect("' + controls[d].name + '")') >= 0) dependencyChanged = true;
        if (!nativeChanged(args, prior, after[j]) && !dependencyChanged) continue;
        property = nativeEffect.property(after[j].matchName);
        if (!property || (after[j].expression && property.canSetExpression === false)) return failure(MotionContracts.ERROR.CAPABILITY_UNAVAILABLE, "Parametro de particulas indisponivel: " + after[j].matchName);
        if (property.numKeys > 0 || (property.expression || "") !== (prior && prior.expression || "")) return failure(MotionContracts.ERROR.EXPRESSION_CONFLICT, "Parametro nativo animado manualmente: " + after[j].matchName);
      }
    }
    return null;
  }
  var PRECOMP_OPEN = "[MOTION_PARTICLES_PRECOMP]", PRECOMP_CLOSE = "[/MOTION_PARTICLES_PRECOMP]";
  /** @param {any} layer @returns {any} */
  function precompRecord(layer) {
    var text = layer.comment || "", start = text.indexOf(PRECOMP_OPEN), end = text.indexOf(PRECOMP_CLOSE);
    if (start < 0) return null;
    try { var record = /** @type {any} */ (MotionJson.parse(text.substring(start + PRECOMP_OPEN.length, end)));
      return end > start && text.indexOf(PRECOMP_OPEN, start + PRECOMP_OPEN.length) < 0 && record.schemaVersion === 1 && record.layerId === layer.id && typeof record.rigId === "string" && layer.source instanceof CompItem && record.sourceCompId === layer.source.id ? record : { invalid: true };
    } catch (error) { return { invalid: true }; }
  }
  /** Resolve only an owned precomp selected by identity, or the sole owned precomp without a selection.
   * @param {any} contextComp @returns {any} */
  function particlePlacement(contextComp) {
    var selected = contextComp.selectedLayers, candidates = [], record, i;
    if (selected.length === 1) { record = precompRecord(selected[0]); if (record) candidates.push({ wrapper: selected[0], record: record }); }
    if (selected.length === 0) for (i = 1; i <= contextComp.numLayers; i += 1) { record = precompRecord(contextComp.layer(i)); if (record) candidates.push({ wrapper: contextComp.layer(i), record: record }); }
    if (candidates.length > 1) return { error: failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Selecione a pre-composicao de Particulas que deseja editar.") };
    if (!candidates.length) return { comp: contextComp, wrapper: null, record: null };
    var placement = /** @type {any} */ (candidates[0]);
    if (placement.record.invalid) return { error: failure(MotionContracts.ERROR.TRACK_CONFLICT, "A identidade da pre-composicao de Particulas mudou.") };
    if (placement.wrapper.locked) return { error: failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Desbloqueie a camada da pre-composicao de Particulas.") };
    var source = placement.wrapper.source, uses = 0;
    for (i = 1; i <= contextComp.numLayers; i += 1) if (contextComp.layer(i).source === source) uses += 1;
    if (uses !== 1 || (source.usedIn && source.usedIn.length !== 1)) return { error: failure(MotionContracts.ERROR.TRACK_CONFLICT, "A pre-composicao foi compartilhada. Use uma copia independente para editar Particulas.") };
    return { comp: source, wrapper: placement.wrapper, record: placement.record };
  }
  /** @param {Record<string, unknown>} args @returns {MotionCommandFailure|null} */
  function stylePreflight(args) {
    if (typeof app === "undefined" || !app.project) return failure(MotionContracts.ERROR.NO_ACTIVE_PROJECT, "Nenhum projeto aberto.");
    var comp = /** @type {any} */ (app.project.activeItem);
    if (!comp || !(comp instanceof CompItem)) return failure(MotionContracts.ERROR.NO_ACTIVE_COMP, "Nenhuma composicao ativa.");
    if (args.targetCompId && args.targetCompId !== comp.id) return failure(MotionContracts.ERROR.TRACK_CONFLICT, "A composicao de Particles mudou.");
    var contextComp = comp, placement = particlePlacement(contextComp);
    if (placement.error) return placement.error;
    comp = placement.comp;
    var selected = placement.wrapper ? [] : comp.selectedLayers, rigId = placement.record ? placement.record.rigId : null, i;
    if (selected.length > 1) return failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Selecione somente um membro ou controlador de Particles.");
    if (selected.length === 1) {
      var selectedRecord = readV2(selected[0]);
      if (selectedRecord && selectedRecord.invalid) return failure(MotionContracts.ERROR.TRACK_CONFLICT, "Identidade de Particles incompleta ou duplicada.");
      if (selectedRecord) rigId = selectedRecord.rigId;
      else if (metadata(selected[0])) return failure(MotionContracts.ERROR.TRACK_CONFLICT, "O modo classico existente e preservado. Desselecione-o para criar outro estilo.");
    }
    if (!rigId) for (i = 1; i <= comp.numLayers; i += 1) {
      var record = readV2(comp.layer(i));
      if (record && record.invalid) return failure(MotionContracts.ERROR.TRACK_CONFLICT, "Um rig de Particles tem identidade incompleta. Use Undo ou selecione outro rig valido.");
      if (record && record.role === "controller") { if (rigId) return failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Selecione o rig de Particles que deseja ajustar."); rigId = record.rigId; }
    }
    if (args.targetRigId && rigId !== args.targetRigId) return failure(MotionContracts.ERROR.TRACK_CONFLICT, "A selecao de Particles mudou.");
    if (args.changedFields && !rigId) return failure(MotionContracts.ERROR.TRACK_CONFLICT, "O rig de Particles nao esta mais selecionado.");
    var rig = rigId ? inspectRig(comp, rigId, Boolean(args.changedFields) && args.action !== "remove") : null;
    if (rig && rig.error) return rig.error;
    if (rig && args.changedFields && args.action !== "remove") { var patchIssue = patchPreflight(rig, adjustedSettings(args, rig), args); if (patchIssue) return patchIssue; }
    if (args.action === "remove" && !rig) return failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Selecione um rig de Particles para remover.");
    if (args.action === "remove" && placement.wrapper) {
      if (comp.numLayers !== 5 || placement.wrapper.property("ADBE Effect Parade").numProperties !== 0) return failure(MotionContracts.ERROR.TRACK_CONFLICT, "A pre-composicao possui conteudo ou efeitos adicionais do usuario.");
      for (i = 1; i <= contextComp.numLayers; i += 1) if (contextComp.layer(i).parent === placement.wrapper) return failure(MotionContracts.ERROR.TRACK_CONFLICT, "A pre-composicao possui camadas externas vinculadas.");
    }
    if (args.action === "remove") {
      var layers = [rig.controller].concat(rig.members);
      for (i = 0; i < layers.length; i += 1) {
        var expectedCount = i === 0 ? descriptors(rig.record.settings, rig.record.directionControls).length : 1;
        if (layers[i].property("ADBE Effect Parade").numProperties !== expectedCount) return failure(MotionContracts.ERROR.TRACK_CONFLICT, "O rig possui efeitos adicionais do usuario. Preserve-os antes de remover Particles.");
        for (var child = 1; child <= comp.numLayers; child += 1) if (comp.layer(child).parent === layers[i] && !includes(rig.members, comp.layer(child))) return failure(MotionContracts.ERROR.TRACK_CONFLICT, "O rig possui camadas externas vinculadas. Preserve-as antes de remover Particles.");
      }
    }
    if (!rig && args.precompose !== false && typeof comp.layers.precompose !== "function") return failure(MotionContracts.ERROR.CAPABILITY_UNAVAILABLE, "Pre-composicao de particulas indisponivel.");
    if (!rig) {
      var installed = /** @type {any} */ (app).effects || [], required = [EFFECT, "ADBE Slider Control", "ADBE Color Control", "ADBE Angle Control"];
      for (i = 0; i < required.length; i += 1) { var available = false; for (var n = 0; n < installed.length; n += 1) if (installed[n].matchName === required[i]) available = true; if (!available) return failure(MotionContracts.ERROR.CAPABILITY_UNAVAILABLE, "Efeito nativo indisponivel: " + required[i]); }
    }
    dispatchPlan = { classic: false, comp: contextComp, rigComp: comp, wrapper: placement.wrapper, rig: rig, selection: selectionSignature(contextComp), fingerprint: MotionJson.stringify(args) };
    return null;
  }
  /** @param {string} name @returns {string} */
  function controlExpression(name) { return 'parent.effect("Moti.on Particles ' + name + '")(1)'; }
  /** @param {any} settings @param {number} index @param {any=} previousSettings @returns {any[]} */
  function nativeAssignments(settings, index, previousSettings) {
    var stream = String(index + 1) + " ", field = settings.mode === "field3d" || settings.mode === "rising", distribution = field ? 1 : [0.4, 0.3, 0.2, 0.1][index];
    var rate = controlExpression("birthRate") + "*" + (field ? controlExpression(stream + "amount") : String(distribution));
    var velocity = controlExpression("velocity") + "*" + controlExpression("movement") + (field ? "*" + controlExpression(stream + "movement") : "");
    var size = controlExpression("size") + (field ? "*" + controlExpression(stream + "size") : "*" + [0.7, 0.9, 1.1, 1.35][index]);
    var opacity = controlExpression("opacity") + (field ? "*" + controlExpression(stream + "opacity") + "/100" : "");
    var color = field ? 'var a=' + controlExpression("color") + ',b=' + controlExpression(stream + "color") + ';[a[0]*b[0],a[1]*b[1],a[2]*b[2],1]' : controlExpression("color");
    var spark = settings.mode === "sparks", snow = settings.mode === "snow", bokeh = settings.mode === "bokeh";
    var output = [{ matchName: NATIVE.birthRate, value: settings.birthRate, expression: MARKER + "Math.max(0," + rate + ")" }, { matchName: NATIVE.longevity, value: settings.longevity }, { matchName: NATIVE.velocity, value: settings.velocity, expression: MARKER + "Math.max(0," + velocity + ")" }, { matchName: NATIVE.birthSize, value: settings.size, expression: MARKER + "Math.max(0," + size + ")" }, { matchName: NATIVE.deathSize, value: settings.size, expression: MARKER + "Math.max(0," + size + ")*" + (spark ? "0.15" : "0.7") }, { matchName: NATIVE.opacity, value: settings.opacity, expression: MARKER + "Math.min(100,Math.max(0," + opacity + "))" }, { matchName: NATIVE.birthColor, value: settings.color.concat([1]), expression: MARKER + color }, { matchName: NATIVE.deathColor, value: settings.color.concat([1]), expression: MARKER + color }];
    // AE 26.5 render calibration: 4 is shaded; 5 is the sphere with soft alpha.
    var values = /** @type {any[]} */ ([[NATIVE.x, spark ? 0 : [-0.15, 0.12, -0.05, 0.2][index]], [NATIVE.y, spark ? 0.25 : snow ? -0.35 : 0], [NATIVE.z, [-0.35, 0, 0.4, 0.9][index]], [NATIVE.radiusX, spark ? 0.12 : 0.65], [NATIVE.radiusY, spark ? 0.01 : snow ? 0.08 : 0.4], [NATIVE.radiusZ, 0.08], [NATIVE.gravity, spark ? 0.18 : snow ? 0.025 : bokeh ? -0.002 : 0], [NATIVE.resistance, settings.mode === "rising" ? 0 : spark ? 0.2 : 1], [NATIVE.particleType, spark ? 1 : 5], [NATIVE.variation, bokeh ? 70 : 60], [NATIVE.colorMap, 2], [NATIVE.seed, (settings.seed + index * 997) % 10001]]);
    for (var i = 0; i < values.length; i += 1) output.push({ matchName: values[i][0], value: values[i][1] });
    if (typeof settings.direction === "number") {
      output.push({ matchName: NATIVE.animation, value: 2 });
      output.push({ matchName: NATIVE.axisX, value: 0 }, { matchName: NATIVE.axisY, value: 0 }, { matchName: NATIVE.axisZ, value: 1 });
      output.push({ matchName: NATIVE.angle, value: 90 - settings.direction, expression: MARKER + '90-parent.effect("Moti.on Particles Direção")(1)' });
      output.push({ matchName: NATIVE.extra, value: (settings.spread || 0) / 100, expression: MARKER + 'Math.min(1,Math.max(0,parent.effect("Moti.on Particles Dispersão")(1)/100))' });
      for (i = 0; i < output.length; i += 1) if (/** @type {any} */ (output[i]).matchName === NATIVE.gravity) /** @type {any} */ (output[i]).value = 0;
    }
    if (settings.mode === "rising") for (i = 0; i < output.length; i += 1) {
      var fieldAssignment = /** @type {any} */ (output[i]);
      if (fieldAssignment.matchName === NATIVE.radiusY) fieldAssignment.expression = MARKER + "thisComp.height/thisComp.width*0.7";
    }
    // Guides are editor overlays. Disabling them keeps every new emitter clean in the viewer.
    var guideIds = ["0051", "0052", "0053", "0055", "0060", "0061"];
    for (i = 0; i < guideIds.length; i += 1) output.push({ matchName: "CC Particle World-" + guideIds[i], value: 0 });
    if (typeof settings.direction !== "number" && previousSettings && typeof previousSettings.direction === "number") {
      output.push({ matchName: NATIVE.animation, value: 1 }, { matchName: NATIVE.axisX, value: 0 }, { matchName: NATIVE.axisY, value: -1 }, { matchName: NATIVE.axisZ, value: 0 }, { matchName: NATIVE.angle, value: 360 }, { matchName: NATIVE.extra, value: 0.5 });
    }
    return output;
  }
  /** @param {any} args @param {any} plan @returns {MotionCommandResult} */
  function styleRun(args, plan) {
    if (plan.comp !== app.project.activeItem) throw new Error("O contexto de Particles mudou. Aplique novamente.");
    var comp = plan.rigComp || plan.comp, selected = comp.selectedLayers, selectedProperties = comp.selectedProperties || [], time = comp.time, rig = plan.rig, created = [], sources = [], snapshots = /** @type {any[]} */ ([]), comments = /** @type {any[]} */ ([]), addedControls = /** @type {any[]} */ ([]), i;
    var settings = args.action === "remove" && rig ? rig.record.settings : adjustedSettings(args, rig), createdRig = !rig;
    /** @type {any} */
    var result;
    try {
      if (rig) { var checked = inspectRig(comp, rig.record.rigId, Boolean(args.changedFields) && args.action !== "remove"); if (checked.error) throw new Error(checked.error.code + ": " + checked.error.message); rig = checked; }
      if (!rig) {
        var controller = comp.layers.addNull(comp.duration); created.push(controller); if (controller.source) sources.push(controller.source);
        var rigId = String(controller.id) + "-" + String(new Date().getTime()), members = [], memberIds = [];
        controller.name = MotionContracts.RIG_PREFIX + "Particles Controls";
        var controls = descriptors(settings);
        for (i = 0; i < controls.length; i += 1) {
          var control = controls[i], fx = controller.property("ADBE Effect Parade").addProperty(controlType(control)); fx.name = control.name;
        }
        for (i = 0; i < 4; i += 1) {
          var layer = comp.layers.addSolid([0, 0, 0], MotionContracts.RIG_PREFIX + "Particles " + (i + 1), comp.width, comp.height, comp.pixelAspect, comp.duration);
          created.push(layer); if (layer.source) sources.push(layer.source); layer.parent = controller;
          var effect = layer.property("ADBE Effect Parade").addProperty(EFFECT); effect.name = MotionContracts.RIG_PREFIX + "PARTICLES " + rigId + " " + i;
          writeV2(layer, { schemaVersion: 3, rigId: rigId, role: "stream", layerId: layer.id, streamIndex: i, effectName: effect.name }); members.push(layer); memberIds.push(layer.id);
        }
        var owner = { schemaVersion: 3, rigId: rigId, role: "controller", layerId: controller.id, memberIds: memberIds, directionControls: typeof settings.direction === "number", settings: settings }; writeV2(controller, owner);
        rig = { controller: controller, members: members, record: owner };
      }
      if (args.action === "remove") {
        for (i = rig.members.length - 1; i >= 0; i -= 1) { var removedSource = rig.members[i].source; rig.members[i].remove(); if (removedSource && removedSource.usedIn.length === 0) removedSource.remove(); }
        removedSource = rig.controller.source; rig.controller.remove(); if (removedSource && removedSource.usedIn.length === 0) removedSource.remove();
        if (plan.wrapper) { plan.wrapper.remove(); comp.remove(); }
        result = { changed: true, warnings: [], data: { removed: true, rigId: rig.record.rigId, mode: rig.record.settings.mode, streamCount: 4 } };
      } else {
        var descriptorsToWrite = descriptors(settings, rig.record.directionControls);
        // Reacquire every effect/property after indexed addProperty invalidates old AE handles.
        for (i = 0; i < descriptorsToWrite.length; i += 1) {
          var missing = descriptorsToWrite[i];
          if (!namedEffect(rig.controller.property("ADBE Effect Parade"), missing.name)) {
            var added = rig.controller.property("ADBE Effect Parade").addProperty(controlType(missing)); added.name = missing.name; addedControls.push(missing.name);
          }
        }
        var writes = /** @type {any[]} */ ([]);
        for (i = 0; i < descriptorsToWrite.length; i += 1) {
          var descriptor = descriptorsToWrite[i], match = controlType(descriptor);
          if (!createdRig && !changedField(args, descriptor.key) && !includes(addedControls, descriptor.name)) continue;
          var target = namedEffect(rig.controller.property("ADBE Effect Parade"), descriptor.name).property(match + "-0001");
          writes.push({ property: target, value: descriptor.color ? descriptor.value.concat([1]) : descriptor.value, expression: "" });
        }
        for (i = 0; i < 4; i += 1) {
          var state = readV2(rig.members[i]), nativeEffect = namedEffect(rig.members[i].property("ADBE Effect Parade"), state.effectName), assignments = nativeAssignments(settings, i, createdRig ? null : rig.record.settings);
          var beforeAssignments = createdRig ? [] : nativeAssignments(rig.record.settings, i);
          for (var j = 0; j < assignments.length; j += 1) {
            var assignment = assignments[j], priorAssignment = null;
            for (var n = 0; n < beforeAssignments.length; n += 1) if (beforeAssignments[n].matchName === assignment.matchName) priorAssignment = beforeAssignments[n];
            if (!createdRig && !nativeChanged(args, priorAssignment, assignment)) continue;
            var property = nativeEffect.property(assignment.matchName);
            if (!property || typeof property.setValue !== "function" || (assignment.expression && property.canSetExpression === false)) throw new Error("CAPABILITY_UNAVAILABLE: Controle de particulas ausente: " + assignment.matchName);
            writes.push({ property: property, value: assignment.value, expression: assignment.expression || "" });
          }
        }
        for (i = 0; i < writes.length; i += 1) snapshots.push({ property: writes[i].property, value: writes[i].property.value, expression: writes[i].property.expression || "", expressionEnabled: writes[i].property.expressionEnabled });
        comments.push({ layer: rig.controller, value: rig.controller.comment });
        for (i = 0; i < writes.length; i += 1) { var write = writes[i]; write.property.setValue(write.value); if (write.expression || write.property.expression) { write.property.expression = write.expression; write.property.expressionEnabled = Boolean(write.expression); } }
        for (i = 0; i < writes.length; i += 1) if (writes[i].expression && writes[i].property.expressionError) throw new Error("HOST_OPERATION_FAILED: " + writes[i].property.expressionError);
        rig.record.schemaVersion = 3; if (typeof settings.direction === "number") rig.record.directionControls = true; rig.record.settings = settings; writeV2(rig.controller, rig.record);
        result = { changed: true, warnings: [], data: { rigId: rig.record.rigId, controllerLayerId: rig.controller.id, layerId: rig.members[0].id, memberLayerIds: rig.record.memberIds, mode: settings.mode, adjusted: !createdRig, createdLayer: createdRig, streamCount: 4, effectMatchName: EFFECT } };
        if (createdRig && args.precompose !== false) {
          var indices = [], ownedIds = [rig.controller.id].concat(rig.record.memberIds);
          for (i = 1; i <= comp.numLayers; i += 1) if (includes(ownedIds, comp.layer(i).id)) indices.push(i);
          if (indices.length !== 5) throw new Error("TRACK_CONFLICT: Os membros de Particulas mudaram antes da pre-composicao.");
          var inner = comp.layers.precompose(indices, "Moti.on Particulas", true); sources.push(inner);
          var wrapper = null;
          for (i = 1; i <= comp.numLayers; i += 1) if (comp.layer(i).source === inner) wrapper = comp.layer(i);
          if (!wrapper) throw new Error("HOST_OPERATION_FAILED: Camada da pre-composicao ausente.");
          created = [wrapper]; snapshots = []; comments = [];
          // AE may replace moved layer objects. Rebind owned IDs only during this creation transaction.
          var movedController = null, movedMembers = [];
          for (i = 1; i <= inner.numLayers; i += 1) {
            var movedLayer = inner.layer(i), movedRecord = readV2(movedLayer, true);
            if (!movedRecord || movedRecord.rigId !== rig.record.rigId) throw new Error("TRACK_CONFLICT: Membro da pre-composicao invalido.");
            movedRecord.layerId = movedLayer.id;
            if (movedRecord.role === "controller") { movedController = movedLayer; rig.record = movedRecord; }
            else { movedMembers[movedRecord.streamIndex] = movedLayer; writeV2(movedLayer, movedRecord); }
          }
          if (!movedController || movedMembers.length !== 4) throw new Error("TRACK_CONFLICT: Rig incompleto depois da pre-composicao.");
          rig.controller = movedController; rig.members = movedMembers; rig.record.memberIds = [];
          for (i = 0; i < 4; i += 1) rig.record.memberIds.push(movedMembers[i].id);
          writeV2(movedController, rig.record);
          wrapper.comment = PRECOMP_OPEN + MotionJson.stringify({ schemaVersion: 1, rigId: rig.record.rigId, layerId: wrapper.id, sourceCompId: inner.id }) + PRECOMP_CLOSE;
          result.data = { rigId: rig.record.rigId, controllerLayerId: movedController.id, layerId: wrapper.id, memberLayerIds: rig.record.memberIds, mode: settings.mode, adjusted: false, createdLayer: true, streamCount: 4, effectMatchName: EFFECT, precomposed: true, sourceCompId: inner.id };
        } else if (plan.wrapper) { result.data.precomposed = true; result.data.sourceCompId = comp.id; result.data.layerId = plan.wrapper.id; }

      }
    } catch (error) {
      var rollbackFailed = args.action === "remove";
      for (i = snapshots.length - 1; i >= 0; i -= 1) try { var snapshot = snapshots[i]; snapshot.property.setValue(snapshot.value); if (snapshot.expression || snapshot.property.expression) { snapshot.property.expression = snapshot.expression; snapshot.property.expressionEnabled = snapshot.expressionEnabled; } } catch (restoreError) { rollbackFailed = true; }
      for (i = comments.length - 1; i >= 0; i -= 1) try { comments[i].layer.comment = comments[i].value; } catch (commentError) { rollbackFailed = true; }
      for (i = addedControls.length - 1; i >= 0; i -= 1) try { var addedEffect = namedEffect(rig.controller.property("ADBE Effect Parade"), addedControls[i]); if (addedEffect) addedEffect.remove(); } catch (controlError) { rollbackFailed = true; }
      for (i = created.length - 1; i >= 0; i -= 1) try { created[i].remove(); } catch (removeError) { rollbackFailed = true; }
      for (i = sources.length - 1; i >= 0; i -= 1) try { if (sources[i].usedIn.length === 0) sources[i].remove(); } catch (sourceError) { rollbackFailed = true; }
      if (rollbackFailed) { var rollbackFailure = /** @type {Error & {motionCode?: string, cause?: unknown}} */ (new Error("Nao foi possivel restaurar Particles; use Undo.")); rollbackFailure.motionCode = MotionContracts.ERROR.ROLLBACK_FAILED; rollbackFailure.cause = error; throw rollbackFailure; }
      throw error;
    } finally {
      if (!plan.wrapper || args.action !== "remove") comp.time = time;
      for (i = 1; (!plan.wrapper || args.action !== "remove") && i <= comp.numLayers; i += 1) comp.layer(i).selected = false;
      for (i = 0; i < selected.length; i += 1) { try { selected[i].selected = true; } catch (selectionError) { /* Removed managed layers have no remaining selection to restore. */ } }
      for (i = 0; i < selectedProperties.length; i += 1) { try { selectedProperties[i].selected = true; } catch (propertySelectionError) { /* Only properties of removed managed members can be absent here. */ } }
    }
    return result;
  }
  // The three original numeric arguments retain the v1 behavior and effect identity.
  /** @param {Record<string, unknown>} args @returns {Record<string, unknown>} */
  function legacyArgs(args) { var output = /** @type {Record<string, unknown>} */ ({}); for (var i = 0; i < FIELDS.length; i += 1) { var field = /** @type {string} */ (FIELDS[i]); if (typeof args[field] !== "undefined") output[field] = args[field]; } return output; }
  /** @param {any} comp @returns {string} */
  function selectionSignature(comp) { var ids = []; for (var i = 0; i < comp.selectedLayers.length; i += 1) ids.push(String(comp.selectedLayers[i].id)); return ids.join("/"); }
  var dispatchPlan = /** @type {any} */ (null);
  /** @param {Record<string, unknown>} args @returns {MotionCommandFailure|null} */
  function preflight(args) {
    dispatchPlan = null;
    var issue = validateArgs(args); if (issue) return issue;
    var classic = (!args.mode || args.mode === "classic") && !args.changedFields;
    if (classic && args.action !== "remove") {
      if (typeof app !== "undefined" && app.project && app.project.activeItem instanceof CompItem && app.project.activeItem.selectedLayers.length === 1 && precompRecord(app.project.activeItem.selectedLayers[0])) return failure(MotionContracts.ERROR.TRACK_CONFLICT, "O modo Classico nao substitui uma pre-composicao. Desselecione-a para criar um efeito classico.");
      issue = legacyPreflight(legacyArgs(args));
      if (!issue) dispatchPlan = { classic: true, selection: selectionSignature(app.project.activeItem), fingerprint: MotionJson.stringify(args) };
      return issue;
    }
    return stylePreflight(args);
  }
  /** @param {Record<string, unknown>} args @returns {MotionCommandResult} */
  function run(args) {
    var plan = dispatchPlan; dispatchPlan = null;
    if (!plan || !app.project || !app.project.activeItem || plan.fingerprint !== MotionJson.stringify(args) || plan.selection !== selectionSignature(app.project.activeItem)) throw new Error("O contexto de Particles mudou. Aplique novamente.");
    return plan.classic ? legacyRun(legacyArgs(args)) : styleRun(args, plan);
  }
  MotionRegistry.register("ae.effect.particles.read", {
    preflight: function (args) {
      for (var key in args) if (Object.prototype.hasOwnProperty.call(args, key)) return failure(MotionContracts.ERROR.INVALID_PRESET, "A leitura nao recebe parametros.");
      if (typeof app === "undefined" || !app.project) return failure(MotionContracts.ERROR.NO_ACTIVE_PROJECT, "Nenhum projeto aberto.");
      if (!(app.project.activeItem instanceof CompItem)) return failure(MotionContracts.ERROR.NO_ACTIVE_COMP, "Nenhuma composicao ativa.");
      return null;
    },
    run: function () {
      var contextComp = /** @type {CompItem} */ (app.project.activeItem), placement = particlePlacement(contextComp);
      if (placement.error) throw new Error(placement.error.code + ": " + placement.error.message);
      var comp = placement.comp, selected = comp.selectedLayers;
      if (placement.wrapper) {
        var placedRig = inspectRig(comp, placement.record.rigId, true);
        if (placedRig.error) throw new Error(placedRig.error.code + ": " + placedRig.error.message);
        return { changed: false, warnings: [], data: { rigId: placement.record.rigId, compId: contextComp.id, controllerLayerId: placedRig.controller.id, settings: liveSettings(placedRig), precomposed: true, sourceCompId: comp.id } };
      }
      if (selected.length === 0) {
        var candidates = [];
        for (var i = 1; i <= comp.numLayers; i += 1) { var candidate = readV2(comp.layer(i)); if (candidate && candidate.role === "controller") candidates.push(comp.layer(i)); }
        if (candidates.length === 1) selected = candidates;
      }
      if (selected.length !== 1) return { changed: false, warnings: [], data: { rigId: null, compId: comp.id, settings: null } };
      var record = readV2(selected[0]);
      if (!record) return { changed: false, warnings: [], data: { rigId: null, compId: comp.id, settings: null } };
      if (record.invalid) throw new Error("TRACK_CONFLICT: Identidade de Particles invalida.");
      var rig = inspectRig(comp, record.rigId, true);
      if (rig.error) throw new Error(rig.error.code + ": " + rig.error.message);
      return { changed: false, warnings: [], data: { rigId: record.rigId, compId: comp.id, controllerLayerId: rig.controller.id, settings: liveSettings(rig) } };
    }
  });
  MotionRegistry.register("ae.effect.particles", { preflight: preflight, run: run });
})();
