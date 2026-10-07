/** Native Gradient v1: fixed slots, targeted edits and transactional rollback. */
(function () {
  var ABI = /** @type {any} */ (MotionContracts.GRADIENT);
  var NAME = "Moti.on Gradient [MOTION_GRADIENT_V1]";
  var OPEN = "[MOTION_GRADIENT_V1]", CLOSE = "[/MOTION_GRADIENT_V1]";
  /** @param {string} code @param {string} message @param {any} [details] @returns {MotionCommandFailure} */
  function fail(code, message, details) { return {code: code, message: message, recoverable: true, details: details || null}; }
  /** @param {any} object @param {string} key @returns {boolean} */
  function own(object, key) { return Object.prototype.hasOwnProperty.call(object, key); }
  /** @param {any} value @returns {any} */
  function copy(value) { return MotionJson.parse(MotionJson.stringify(value)); }
  /** @param {any} a @param {any} b @returns {boolean} */
  function same(a, b) {
    if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) <= 0.000001 * Math.max(1, Math.abs(a), Math.abs(b));
    if (a && b && typeof a.length === "number" && typeof b.length === "number" && typeof a !== "string" && typeof b !== "string") { if (a.length !== b.length) return false; for (var i = 0; i < a.length; i += 1) if (!same(a[i], b[i])) return false; return true; }
    return a === b;
  }
  /** @param {any} value @param {number} lo @param {number} hi @returns {boolean} */
  function range(value, lo, hi) { return typeof value === "number" && isFinite(value) && value >= lo && value <= hi; }
  /** @param {any} array @param {any} value @returns {number} */
  function indexOf(array, value) { for (var i = 0; i < array.length; i += 1) if (array[i] === value) return i; return -1; }
  /** @param {any} settings @returns {MotionCommandFailure|null} */
  function validateSettings(settings) {
    if (!settings || typeof settings !== "object" || settings.schemaVersion !== 1) return fail(MotionContracts.ERROR.INVALID_PRESET, "Versao de gradiente invalida.");
    var allowed = /** @type {any} */ ({schemaVersion: true, stops: true}), i, key, d, value;
    for (i = 0; i < ABI.scalars.length; i += 1) {
      d = ABI.scalars[i]; allowed[d.key] = true; value = settings[d.key];
      if (d.kind === "enum" ? indexOf(d.options, value) < 0 : !range(value, d.min, d.max) || d.kind === "integer" && Math.floor(value) !== value) return fail(MotionContracts.ERROR.INVALID_PRESET, "Controle fora da faixa.", {field: d.key});
    }
    for (key in settings) if (own(settings, key) && !own(allowed, key)) return fail(MotionContracts.ERROR.INVALID_PRESET, "Controle desconhecido.", {field: key});
    if (Object.prototype.toString.call(settings.stops) !== "[object Array]" || settings.stops.length !== 8) return fail(MotionContracts.ERROR.INVALID_PRESET, "Gradientes usam oito posicoes fixas de cor.");
    var enabled = 0;
    for (i = 0; i < 8; i += 1) {
      var stop = settings.stops[i];
      if (!stop || typeof stop !== "object" || typeof stop.enabled !== "boolean" || !range(stop.position, 0, 1) || Object.prototype.toString.call(stop.color) !== "[object Array]" || stop.color.length !== 3) return fail(MotionContracts.ERROR.INVALID_PRESET, "Ponto de cor invalido.", {slot: i});
      for (key in stop) if (own(stop, key) && key !== "enabled" && key !== "color" && key !== "position") return fail(MotionContracts.ERROR.INVALID_PRESET, "Campo de ponto desconhecido.");
      for (var c = 0; c < 3; c += 1) if (!range(stop.color[c], -16, 64)) return fail(MotionContracts.ERROR.INVALID_PRESET, "Cor HDR fora da faixa.");
      if (stop.enabled) enabled += 1;
    }
    return enabled < 2 ? fail(MotionContracts.ERROR.INVALID_PRESET, "Ative ao menos dois pontos de cor.") : null;
  }
  /** @param {any} args @param {boolean} readOnly @returns {MotionCommandFailure|null} */
  function validateArgs(args, readOnly) {
    var key, allowed = readOnly ? {} : {action: true, settings: true, changedKeys: true, selectionToken: true};
    for (key in args) if (own(args, key) && !own(allowed, key)) return fail(MotionContracts.ERROR.INVALID_PRESET, "Argumento de gradiente desconhecido.", {field: key});
    if (readOnly) return null;
    if (indexOf(["apply", "update", "remove", "create-background"], args.action) < 0) return fail(MotionContracts.ERROR.INVALID_PRESET, "Operacao de gradiente invalida.");
    if (typeof args.selectionToken !== "undefined" && (typeof args.selectionToken !== "string" || !args.selectionToken.length || args.selectionToken.length > 8192)) return fail(MotionContracts.ERROR.INVALID_PRESET, "Selecao invalida.");
    if (args.action !== "remove") { var error = validateSettings(args.settings); if (error) return error; }
    else if (typeof args.settings !== "undefined") return fail(MotionContracts.ERROR.INVALID_PRESET, "Remover nao recebe configuracoes.");
    if (args.action === "update") {
      if (Object.prototype.toString.call(args.changedKeys) !== "[object Array]" || args.changedKeys.length < 1 || args.changedKeys.length > ABI.keys.length) return fail(MotionContracts.ERROR.INVALID_PRESET, "Informe os controles alterados.");
      var seen = /** @type {any} */ ({});
      for (var i = 0; i < args.changedKeys.length; i += 1) {
        key = args.changedKeys[i];
        if (typeof key !== "string" || indexOf(ABI.keys, key) < 0 || own(seen, key)) return fail(MotionContracts.ERROR.INVALID_PRESET, "Controle alterado invalido.");
        seen[key] = true;
      }
    } else if (typeof args.changedKeys !== "undefined") return fail(MotionContracts.ERROR.INVALID_PRESET, "Apenas Atualizar recebe controles alterados.");
    return null;
  }
  /** @param {string} comment @returns {any} */
  function metadataBlock(comment) {
    var at = comment.indexOf(OPEN), end;
    while (at >= 0) {
      end = comment.indexOf(CLOSE, at + OPEN.length);
      if (end >= 0) {
        try {
          var data = /** @type {any} */ (MotionJson.parse(comment.substring(at + OPEN.length, end)));
          if (data && data.schemaVersion === 1 && data.matchName === ABI.native.matchName && data.effectName === NAME) return {data: data, start: at, end: end + CLOSE.length};
        } catch (ignored) { /* A user annotation can contain these delimiters. */ }
      }
      // Search from the next opening marker so an unclosed user annotation
      // cannot hide the valid metadata appended by this tool.
      at = comment.indexOf(OPEN, at + OPEN.length);
    }
    return null;
  }
  /** @param {any} layer @returns {any} */
  function metadata(layer) {
    var block = metadataBlock(String(layer.comment || ""));
    return block ? block.data : null;
  }
  /** @param {string} comment @returns {string} */
  function stripMetadata(comment) { var block = metadataBlock(comment); return block ? comment.substring(0, block.start) + comment.substring(block.end) : comment; }
  /** @param {any} layer */
  function mark(layer) { layer.comment = stripMetadata(String(layer.comment || "")) + OPEN + MotionJson.stringify({schemaVersion: 1, matchName: ABI.native.matchName, effectName: NAME}) + CLOSE; }
  /** @param {any} layer @returns {any} */
  function locate(layer) {
    var parade = layer.property("ADBE Effect Parade"), effect = null, index = 0, other = false;
    if (!parade) return {parade: null, effect: null, index: 0, conflict: false};
    for (var i = 1; i <= parade.numProperties; i += 1) { var candidate = parade.property(i); if (candidate && candidate.matchName === ABI.native.matchName) { if (candidate.name !== NAME || effect) other = true; else { effect = candidate; index = i; } } }
    if (effect && !metadata(layer)) other = true;
    return {parade: parade, effect: effect, index: index, conflict: other};
  }
  /** @param {any} effect @returns {boolean} */
  function compatible(effect) { try { return effect.matchName === ABI.native.matchName && effect.numProperties >= ABI.native.parameterCount && effect.property(ABI.native.schemaIndex).value === 1; } catch (ignored) { return false; } }
  /** @param {any} layer @returns {number} */
  function layerId(layer) { return typeof layer.id === "number" ? layer.id : layer.index; }
  /** @param {any} comp @returns {string} */
  function selectionToken(comp) { var ids = []; for (var i = 0; i < comp.selectedLayers.length; i += 1) ids.push(layerId(comp.selectedLayers[i])); return MotionJson.stringify([comp.id, comp.time, ids]); }
  /** @returns {boolean} */
  function installed() { try { var effects = /** @type {any} */ (app).effects; for (var i = 0; effects && i < effects.length; i += 1) if (effects[i].matchName === ABI.native.matchName) return true; } catch (ignored) { /* Unknown native capability remains unavailable. */ } return false; }
  /** @param {string} key @returns {any} */
  function parameter(key) {
    for (var i = 0; i < ABI.scalars.length; i += 1) if (ABI.scalars[i].key === key) return ABI.scalars[i];
    var parts = key.split("."), slot = Number(parts[1]), field = parts[2];
    return {key: key, index: ABI.native.stopStartIndex + slot * 3 + (field === "enabled" ? 0 : (field === "color" ? 1 : 2)), kind: field, slot: slot, field: field};
  }
  /** @param {any} settings @param {string} key @returns {any} */
  function getSetting(settings, key) { var p = parameter(key); return typeof p.slot === "number" ? settings.stops[p.slot][p.field] : settings[key]; }
  /** @param {any} settings @param {string} key @param {any} value */
  function setSetting(settings, key, value) { var p = parameter(key); if (typeof p.slot === "number") settings.stops[p.slot][p.field] = value; else settings[key] = value; }
  /** @param {any} settings @param {string} key @returns {any} */
  function nativeValue(settings, key) { var p = parameter(key), value = getSetting(settings, key); if (p.kind === "enum") return indexOf(p.options, value) + 1; if (p.kind === "enabled") return value ? 1 : 0; if (p.kind === "color") return [value[0], value[1], value[2], 1]; return value; }
  /** @param {any} effect @param {number} time @returns {any} */
  function readSettings(effect, time) {
    var settings = copy(ABI.defaults), locked = [], i;
    for (i = 0; i < ABI.keys.length; i += 1) {
      var key = ABI.keys[i], descriptor = parameter(key), p = effect.property(descriptor.index), value = p.valueAtTime(time, false);
      if (p.expression) locked.push(key);
      if (descriptor.kind === "enum") value = descriptor.options[Math.round(value) - 1];
      else if (descriptor.kind === "enabled") value = value > 0;
      else if (descriptor.kind === "color") value = [value[0], value[1], value[2]];
      setSetting(settings, key, value);
    }
    return {settings: settings, lockedKeys: locked};
  }
  /** @param {any} args @param {boolean} readOnly @returns {any} */
  function prepare(args, readOnly) {
    var error = validateArgs(args, readOnly); if (error) return {error: error};
    if (!app.project) return {error: fail(MotionContracts.ERROR.NO_ACTIVE_PROJECT, "Abra um projeto.")};
    var comp = /** @type {any} */ (app.project.activeItem);
    if (!comp || !(comp instanceof CompItem)) return {error: fail(MotionContracts.ERROR.NO_ACTIVE_COMP, "Abra uma composicao.")};
    if (!readOnly && args.selectionToken && args.selectionToken !== selectionToken(comp)) return {error: fail(MotionContracts.ERROR.TRACK_CONFLICT, "A selecao ou o tempo mudou. Atualize os controles antes de editar.", {reason: "stale-selection"})};
    var available = installed(), items = /** @type {any[]} */ ([]), selected = comp.selectedLayers, i;
    if (!readOnly && args.action === "create-background") {
      if (!available) return {error: fail(MotionContracts.ERROR.CAPABILITY_UNAVAILABLE, "Instale ou atualize o Moti.on Core para usar Gradientes.")};
      return {comp: comp, items: items, nativeAvailable: available};
    }
    if (!readOnly && !selected.length) return {error: fail(MotionContracts.ERROR.NO_SELECTION, "Selecione camadas para aplicar Gradientes.")};
    for (i = 0; i < selected.length; i += 1) {
      var layer = /** @type {any} */ (selected[i]), found = locate(layer);
      if (found.conflict) return {error: fail(MotionContracts.ERROR.TRACK_CONFLICT, "Existe um gradiente nao gerenciado ou duplicado. Preserve-o antes de continuar.", {layerId: layerId(layer)})};
      if (found.effect && !compatible(found.effect)) return {error: fail(MotionContracts.ERROR.CAPABILITY_UNAVAILABLE, "Atualize o Moti.on Core para acessar estes controles.")};
      if (!readOnly) {
        if (layer.locked) return {error: fail(MotionContracts.ERROR.TRACK_CONFLICT, "Desbloqueie todas as camadas selecionadas.")};
        if (!found.parade || layer.hasVideo === false || layer.nullLayer === true) return {error: fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Selecione texto, forma ou uma camada visual.")};
        if (args.action === "update" && !found.effect) return {error: fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Aplique Gradientes a todas as camadas antes de atualizar.")};
        if (args.action === "apply" && !found.effect && !found.parade.canAddProperty(ABI.native.matchName)) return {error: fail(MotionContracts.ERROR.CAPABILITY_UNAVAILABLE, "Instale ou atualize o Moti.on Core para usar Gradientes.")};
        if (found.effect && args.action !== "remove") {
          var keys = args.action === "update" ? args.changedKeys : ABI.keys;
          var merged = readSettings(found.effect, comp.time).settings;
          for (var j = 0; j < keys.length; j += 1) {
            var key = keys[j], p = found.effect.property(parameter(key).index);
            if (p.expression && !same(p.valueAtTime(comp.time, false), nativeValue(args.settings, key))) return {error: fail(MotionContracts.ERROR.EXPRESSION_CONFLICT, "Edite este controle com expressao no After Effects.", {field: key})};
            setSetting(merged, key, getSetting(args.settings, key));
          }
          error = validateSettings(merged); if (error) return {error: error};
        }
      }
      if (found.effect) available = true;
      items.push({layer: layer, found: found});
    }
    if (!readOnly && args.action === "remove") {
      var managedCount = 0;
      for (i = 0; i < items.length; i += 1) if (items[i].found.effect) managedCount += 1;
      if (!managedCount) return {error: fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "A selecao nao possui um gradiente gerenciado para remover.")};
    }
    return {comp: comp, items: items, nativeAvailable: available};
  }
  /** @param {any} args @returns {MotionCommandFailure|null} */
  function preflight(args) { return prepare(args, false).error || null; }
  /** @param {any} args @returns {MotionCommandFailure|null} */
  function preflightRead(args) { return prepare(args, true).error || null; }
  /** @param {any} plan @returns {any} */
  function readData(plan) {
    var instances = [], locked = [], mixed = [], first = null;
    for (var i = 0; i < plan.items.length; i += 1) {
      var item = plan.items[i]; if (!item.found.effect) continue;
      var read = readSettings(item.found.effect, plan.comp.time);
      instances.push({layerId: layerId(item.layer), layerName: item.layer.name, effectIndex: item.found.index, settings: read.settings, lockedKeys: read.lockedKeys});
      for (var j = 0; j < read.lockedKeys.length; j += 1) if (indexOf(locked, read.lockedKeys[j]) < 0) locked.push(read.lockedKeys[j]);
      if (!first) first = read.settings;
      else for (j = 0; j < ABI.keys.length; j += 1) if (!same(getSetting(first, ABI.keys[j]), getSetting(read.settings, ABI.keys[j])) && indexOf(mixed, ABI.keys[j]) < 0) mixed.push(ABI.keys[j]);
    }
    return {settings: first, instances: instances, selectionCount: plan.items.length, appliedCount: instances.length, selectionToken: selectionToken(plan.comp), mixedKeys: mixed, lockedKeys: locked, capabilities: {nativeAvailable: plan.nativeAvailable}};
  }
  /** @param {any} args @returns {any} */
  function read(args) { var plan = prepare(args, true); if (plan.error) throw new Error(plan.error.code); return {data: readData(plan), warnings: []}; }
  /** @param {any} effect @param {number} time @returns {any} */
  function capture(effect, time) {
    var states = [];
    for (var i = 1; i < ABI.native.schemaIndex; i += 1) {
      var p = effect.property(i);
      states.push({index: i, value: copy(p.valueAtTime(time, true)), expression: p.expression || "", expressionEnabled: p.expressionEnabled === true, keys: p.numKeys > 0 ? MotionKeyframes.captureProperty(p) : null});
    }
    return {states: states, name: effect.name, enabled: effect.enabled, index: effect.propertyIndex};
  }
  /** @param {any} layer @param {any} snapshot */
  function restore(layer, snapshot) {
    var found = locate(layer), effect = found.effect, p;
    if (!effect) { found.parade.addProperty(ABI.native.matchName); effect = found.parade.property(found.parade.numProperties); effect.name = NAME; effect.moveTo(snapshot.index); effect = found.parade.property(snapshot.index); }
    for (var i = 0; i < snapshot.states.length; i += 1) {
      var state = snapshot.states[i]; p = effect.property(state.index);
      if (p.expression) p.expression = "";
      if (state.keys) { state.keys.property = p; MotionKeyframes.restoreProperty(state.keys, null); }
      else { for (var k = p.numKeys; k > 0; k -= 1) p.removeKey(k); p.setValue(state.value); }
      if (state.expression) p.expression = state.expression;
      if (p.canSetExpression) p.expressionEnabled = state.expressionEnabled;
    }
    effect.enabled = snapshot.enabled; effect.name = snapshot.name;
  }
  /** @param {any} effect @param {any} settings @param {any} keys @param {number} time @returns {number} */
  function write(effect, settings, keys, time) {
    var count = 0;
    for (var i = 0; i < keys.length; i += 1) {
      var key = keys[i], p = effect.property(parameter(key).index), value = nativeValue(settings, key);
      if (same(p.valueAtTime(time, false), value)) continue;
      if (p.expression) throw new Error("Protected expression changed after preflight.");
      if (p.numKeys > 0) {
        var at = 0;
        for (var k = 1; k <= p.numKeys; k += 1) if (Math.abs(p.keyTime(k) - time) < 0.0000001) { at = k; break; }
        if (at) p.setValueAtKey(at, value); else p.setValueAtTime(time, value);
      } else p.setValue(value);
      count += 1;
    }
    return count;
  }
  /** @param {any} args @returns {any} */
  function run(args) {
    var plan = prepare(args, false); if (plan.error) throw new Error(plan.error.code);
    var comp = plan.comp, saved = /** @type {any[]} */ ([]), createdLayer = /** @type {any} */ (null), createdSource = /** @type {any} */ (null);
    var selectedIds = /** @type {any[]} */ ([]), originalTime = comp.time, changed = 0, i;
    for (i = 0; i < comp.selectedLayers.length; i += 1) selectedIds.push(layerId(comp.selectedLayers[i]));
    function restoreContext() {
      for (var index = 1; index <= comp.numLayers; index += 1) {
        var layer = comp.layer(index), selected = false;
        for (var member = 0; member < selectedIds.length; member += 1) if (layerId(layer) === selectedIds[member]) selected = true;
        // Removing a selected effect can deselect its layer in AE. Avoid
        // toggling unchanged layers so surviving property/key selections stay intact.
        if (layer.selected !== selected) layer.selected = selected;
      }
      if (comp.time !== originalTime) comp.time = originalTime;
    }
    // Capture every existing target before the first mutation.
    for (i = 0; i < plan.items.length; i += 1) { var item = plan.items[i]; saved.push({layer: item.layer, comment: String(item.layer.comment || ""), snapshot: item.found.effect ? capture(item.found.effect, comp.time) : null, touched: false}); }
    try {
      if (args.action === "create-background") {
        createdLayer = comp.layers.addSolid([1, 1, 1], "Moti.on Gradient", comp.width, comp.height, comp.pixelAspect, comp.duration); createdSource = createdLayer.source;
        createdLayer.startTime = 0; createdLayer.inPoint = 0; createdLayer.outPoint = comp.duration; createdLayer.moveToEnd();
        saved.push({layer: createdLayer, comment: "", snapshot: null, touched: false});
      }
      for (i = 0; i < saved.length; i += 1) {
        var record = saved[i], found = locate(record.layer), effect = found.effect;
        if (args.action === "remove") {
          if (effect) { record.touched = true; effect.remove(); record.layer.comment = stripMetadata(record.comment); changed += 1; }
        } else {
          record.touched = true;
          if (!effect) { found.parade.addProperty(ABI.native.matchName); effect = found.parade.property(found.parade.numProperties); effect.name = NAME; mark(record.layer); if (!compatible(effect)) throw new Error("Native gradient ABI mismatch."); changed += 1; }
          changed += write(effect, args.settings, args.action === "update" ? args.changedKeys : ABI.keys, comp.time);
        }
      }
      restoreContext();
      return {data: {changed: changed, layers: saved.length, action: args.action, createdLayerId: createdLayer ? layerId(createdLayer) : null}, warnings: []};
    } catch (error) {
      var rollbackFailed = false;
      for (i = saved.length - 1; i >= 0; i -= 1) {
        var rollback = saved[i]; if (!rollback.touched || rollback.layer === createdLayer) continue;
        try { if (rollback.snapshot) restore(rollback.layer, rollback.snapshot); else { var added = locate(rollback.layer).effect; if (added) added.remove(); } rollback.layer.comment = rollback.comment; } catch (restoreError) { rollbackFailed = true; }
      }
      if (createdLayer) try { createdLayer.remove(); if (createdSource && createdSource.usedIn.length === 0) createdSource.remove(); } catch (removeError) { rollbackFailed = true; }
      try { restoreContext(); } catch (selectionError) { rollbackFailed = true; }
      if (rollbackFailed) { var tagged = /** @type {any} */ (new Error("Gradient rollback failed.")); tagged.motionCode = MotionContracts.ERROR.ROLLBACK_FAILED; throw tagged; }
      throw error;
    }
  }
  MotionRegistry.register("ae.effect.gradient.read", {preflight: preflightRead, run: read});
  MotionRegistry.register("ae.effect.gradient", {preflight: preflight, run: run});
}());
