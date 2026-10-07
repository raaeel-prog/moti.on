/** One self-contained FFX effect per tool. No application XML edits or runtime code generation. */
(function (global) {
  var bundleFile = typeof $.fileName === "string" ? $.fileName : "";
  /** @param {any[]} bindings @param {string} locale @returns {string} */
  function layoutKey(bindings, locale) {
    var sorted = bindings.slice(0), rows = [], i, j;
    sorted.sort(function (a, b) { return a.order - b.order; });
    for (i = 0; i < sorted.length; i += 1) {
      var b = sorted[i], options = null;
      if (b.options) { options = []; for (j = 0; j < b.options.length; j += 1) options.push([b.options[j].value, b.options[j].label[locale] || b.options[j].label["en-US"]]); }
      rows.push([b.paramId, b.control, b.label[locale] || b.label["en-US"], b.unit || "none", typeof b.min === "number" ? b.min : null, typeof b.max === "number" ? b.max : null, options]);
    }
    return MotionJson.stringify(rows);
  }
  /** @param {any} config @returns {any} */
  function preset(config) {
    var key = layoutKey(config.bindings, config.locale);
    var entry = global.MotionControlPresets && /** @type {any} */ (global.MotionControlPresets)[key];
    if (!entry) throw new Error("O preset de controles desta ferramenta não está instalado. Atualize o Moti.on.");
    var file = new File(new File(bundleFile).parent.parent.fsName + "/assets/control-presets/" + entry.file);
    if (!file.exists) throw new Error("O arquivo de controles da ferramenta não foi encontrado. Reinstale o Moti.on.");
    return { entry: entry, file: file };
  }
  /** @param {any} parade @param {string} name @returns {any} */
  function find(parade, name) {
    for (var i = 1; i <= parade.numProperties; i += 1) { var e = parade.property(i); if (e.name === name) return e; }
    return null;
  }
  /** @param {any} layer @param {any} prepared @returns {any} */
  function create(layer, prepared) {
    var bindings = [], i, selected = [], comp = layer.containingComp || app.project.activeItem;
    for (i = 0; i < prepared.items.length; i += 1) bindings.push(prepared.items[i].binding);
    var asset = preset({ bindings: bindings, locale: prepared.locale });
    if (typeof layer.applyPreset !== "function") throw new Error("O After Effects não permite aplicar o preset de controles nesta camada.");
    var parade = layer.property("ADBE Effect Parade"), count = parade.numProperties;
    var base = "Moti.on · " + prepared.tool, name = base, serial = 2;
    while (find(parade, name)) { name = base + " " + serial; serial += 1; }
    // applyPreset acts on selected layers, even when invoked on another layer.
    var layers = comp.selectedLayers || [];
    for (i = 0; i < layers.length; i += 1) selected.push(layers[i]);
    try {
      for (i = 0; i < selected.length; i += 1) selected[i].selected = false;
      layer.selected = true;
      layer.applyPreset(asset.file);
      parade = layer.property("ADBE Effect Parade");
      if (parade.numProperties !== count + 1) throw new Error("O preset não criou exatamente um grupo de controles.");
      var effect = parade.property(count + 1);
      if (effect.matchName !== asset.entry.matchName) throw new Error("O tipo do grupo de controles não corresponde ao preset.");
      effect.name = name;
      var records = [];
      for (i = 0; i < prepared.items.length; i += 1) {
        var item = prepared.items[i], param = effect.property(i + 1);
        if (!param || !param.canVaryOverTime || param.matchName !== asset.entry.matchName + "-" + ("0000" + (i + 1)).slice(-4)) throw new Error("O grupo não expõe o parâmetro animável esperado.");
        param.setValue(item.hostValue);
        var record = {schemaVersion: 1, paramId: item.paramId, name: name, matchName: effect.matchName, index: effect.propertyIndex, propertyIndex: i + 1, control: item.control, actualControl: item.control, target: item.target, order: item.order, locale: prepared.locale, lastAppliedValue: item.logicalValue, unit: item.unit, min: item.binding.min, max: item.binding.max};
        if (item.dropdown) /** @type {any} */ (record).optionValues = item.dropdown.values;
        records.push(record);
      }
      return {records: records, warnings: []};
    } catch (error) {
      parade = layer.property("ADBE Effect Parade");
      for (i = parade.numProperties; i > count; i -= 1) parade.property(i).remove();
      throw error;
    } finally {
      layer.selected = false;
      for (i = 0; i < selected.length; i += 1) selected[i].selected = true;
    }
  }
  /** @param {any} layer @param {any} record @returns {any} */
  function property(layer, record) {
    var effect = find(layer.property("ADBE Effect Parade"), record.name);
    if (!effect || effect.matchName !== record.matchName) throw new Error("O controle foi removido ou renomeado.");
    var p = effect.property(record.propertyIndex || 1);
    if (!p) throw new Error("O parâmetro do controle não existe.");
    return p;
  }
  /** @param {any} layer @param {any[]} records @returns {any[]} */
  function capture(layer, records) {
    var states = [];
    for (var i = 0; i < records.length; i += 1) {
      var r = records[i], p = property(layer, r);
      if (p.expression) throw new Error("Um controle possui expressão própria. Preserve ou remova essa expressão antes de reorganizar o grupo.");
      states.push({record: r, value: p.value, keys: p.numKeys > 0 ? MotionKeyframes.captureProperty(p) : null, index: find(layer.property("ADBE Effect Parade"), r.name).propertyIndex});
    }
    return states;
  }
  /** @param {any} layer @param {any[]} records @param {any[]} states */
  function copyStates(layer, records, states) {
    for (var i = 0; i < records.length; i += 1) {
      for (var j = 0; j < states.length; j += 1) {
        var state = states[j];
        if (records[i].paramId !== state.record.paramId) continue;
        var p = property(layer, records[i]);
        for (var k = p.numKeys; k > 0; k -= 1) p.removeKey(k);
        p.setValue(state.value);
        if (state.keys) { state.keys.property = p; MotionKeyframes.restoreProperty(state.keys, null); }
        records[i].lastAppliedValue = state.record.lastAppliedValue;
      }
    }
  }
  /** @param {any} layer @param {any[]} records */
  function remove(layer, records) {
    var seen = /** @type {Record<string, boolean>} */ ({});
    for (var i = records.length - 1; i >= 0; i -= 1) {
      var r = records[i], key = "$" + r.name;
      if (seen[key]) continue;
      seen[key] = true;
      var e = find(layer.property("ADBE Effect Parade"), r.name);
      if (!e || e.matchName !== r.matchName) throw new Error("O grupo a remover não corresponde ao criado pelo Moti.on.");
      e.remove();
    }
  }
  /** Restore only legacy effects removed by this operation. @param {any} layer @param {any[]} states */
  function restoreLegacy(layer, states) {
    var parade = layer.property("ADBE Effect Parade"), records = [], i;
    for (i = 0; i < states.length; i += 1) {
      var r = states[i].record, e = find(parade, r.name);
      if (!e) { e = parade.addProperty(r.matchName); e.name = r.name; if (typeof e.moveTo === "function") e.moveTo(states[i].index); }
      records.push(r);
    }
    copyStates(layer, records, states);
  }
  /** Stage a controller update; the caller commits only after expressions evaluate.
   * @param {any} layer @param {any} config @param {any} legacyNames @returns {any} */
  function stage(layer, config, legacyNames) {
    var parade = layer.property("ADBE Effect Parade"), entry = preset(config).entry;
    var otherLocale = config.locale === "pt-BR" ? "en-US" : "pt-BR";
    var alternate = preset({bindings: config.bindings, locale: otherLocale}).entry;
    var effect = /** @type {any} */ (null), i, records = /** @type {any[]} */ ([]), legacy = /** @type {any[]} */ ([]);
    for (i = 1; i <= parade.numProperties; i += 1) {
      var candidate = parade.property(i);
      if (candidate.matchName === entry.matchName || candidate.matchName === alternate.matchName) { effect = candidate; break; }
    }
    if (effect) {
      for (i = 0; i < config.bindings.length; i += 1) {
        var b = config.bindings[i];
        records.push({schemaVersion: 1, paramId: b.paramId, name: effect.name, matchName: effect.matchName, index: effect.propertyIndex, propertyIndex: i + 1, control: b.control, actualControl: b.control, target: b.target, order: b.order, locale: config.locale, lastAppliedValue: effect.property(i + 1).value, min: b.min, max: b.max});
      }
    } else if (legacyNames) {
      for (i = 0; i < config.bindings.length; i += 1) {
        var binding = config.bindings[i], old = find(parade, legacyNames[binding.paramId]);
        if (old && old.matchName === "ADBE Slider Control") legacy.push({paramId: binding.paramId, name: old.name, matchName: old.matchName, index: old.propertyIndex, control: "slider", lastAppliedValue: old.property(1).value});
      }
    }
    var states = capture(layer, effect ? records : legacy), created = false, removing = false;
    function rollback() {
      if (removing) restoreLegacy(layer, states);
      if (created) remove(layer, records);
      else if (effect) copyStates(layer, records, states);
    }
    try {
      if (!effect) {
        config.grouped = true;
        records = /** @type {any} */ (global.MotionLiveControls).create(layer, config).records;
        created = true;
        if (legacy.length) copyStates(layer, records, states);
      } else {
        for (i = 0; i < records.length; i += 1) {
          var p = property(layer, records[i]);
          if (!p.numKeys && !p.expression) p.setValue(config.values[records[i].paramId]);
        }
      }
    } catch (error) { rollback(); throw error; }
    return { records: records, legacy: legacy, rollback: rollback, commit: function () { if (legacy.length) { removing = true; remove(layer, legacy); } } };
  }
  global.MotionGroupedControls = { create: create, preset: preset, layoutKey: layoutKey, property: property, capture: capture, copyStates: copyStates, remove: remove, restoreLegacy: restoreLegacy, stage: stage };
}($.global));
