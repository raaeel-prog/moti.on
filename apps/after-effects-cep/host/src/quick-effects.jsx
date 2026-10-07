/** Managed numeric expressions. The expression carries its own versioned control records. */
(function (global) {
  var HEADER = "// Moti.on quick-expression v2 ";
  var MAX_CONTROLS = 96;

  /** @param {string} code @param {string} message @returns {MotionCommandFailure} */
  function fail(code, message) { return { code: code, message: message, recoverable: true, details: null }; }
  /** @param {any} value @returns {any} */
  function clone(value) { return MotionJson.parse(MotionJson.stringify(value)); }
  /** Name lookup by enumeration avoids AE's 39-byte property(string) limit.
   * Never use a saved index as identity: a reordered effect must still match. */
  /** @param {any} parade @param {string} name @returns {any} */
  function control(parade, name) {
    if (!parade) return null;
    for (var i = 1; i <= parade.numProperties; i += 1) {
      var effect = parade.property(i);
      if (effect && effect.name === name) return effect;
    }
    return null;
  }
  /** @param {any} property @returns {any} */
  function capture(property) {
    var path = [], current = property, guard = 0;
    while (current && current.parentProperty && guard < 64) {
      path.unshift({ index: current.propertyIndex, matchName: current.matchName });
      current = current.parentProperty;
      guard += 1;
    }
    return { layer: current, path: path, fallback: property };
  }
  /** @param {any} handle @returns {any} */
  function resolve(handle) {
    var current = handle.layer, i;
    for (i = 0; i < handle.path.length; i += 1) {
      var step = handle.path[i];
      // In the real DOM all property indices exist. Fakes may omit them.
      if (typeof step.index !== "number" && !step.matchName) return handle.fallback;
      current = current.property(typeof step.index === "number" ? step.index : step.matchName);
      if (!current || (step.matchName && current.matchName !== step.matchName)) throw new Error("A propriedade de destino mudou.");
    }
    return current;
  }
  /** @param {any[]} records @returns {Record<string, string>} */
  function references(records) {
    var refs = /** @type {Record<string, string>} */ ({}), i;
    for (i = 0; i < records.length; i += 1) refs[records[i].paramId] = MotionLiveControls.expressionReference(records[i]);
    return refs;
  }
  /** @param {string} kind @param {any} refs @param {any} meta @returns {string} */
  function body(kind, refs, meta) {
    var lines = "var on = " + refs.enabled + ";\nvar mix = " + refs.intensity + " / 100;\nvar result = value;\n";
    if (kind === "wiggle") {
      lines += "var f = " + refs.frequency + ";\nvar a = " + refs.amplitude + ";\n" +
        "seedRandom(Math.floor(" + refs.seed + "), true);\n" +
        "if (on && mix > 0 && f > 0 && a > 0) {\n" +
        "  var w = wiggle(f, a, Math.round(" + refs.octaves + "), " + refs.amplitudeMultiplier + ");\n" +
        "  var mask = Math.round(" + (refs.axes || "7") + ");\n" +
        "  if (typeof value === 'number') result = value + (w - value) * mix;\n" +
        "  else { result = []; for (var i = 0; i < value.length; i++) {\n" +
        "    var delta = w[i] - value[i];\n" +
        (meta.scale ? "    if (" + refs.linkedScale + ") delta = value[0] === 0 ? w[0] - value[0] : (w[0] - value[0]) * value[i] / value[0];\n" : "") +
        "    result[i] = value[i] + ((mask & (1 << i)) ? delta * mix : 0);\n" +
        "  } }\n}\n";
    } else if (kind === "flicker") {
      lines += "var rate = " + refs.rate + ";\n" +
        "if (on && mix > 0 && rate > 0) {\n" +
        "  seedRandom(Math.floor(" + refs.seed + ") + Math.floor(time * rate) * 1009, true);\n" +
        "  var lo = " + refs.minFactor + ", hi = " + refs.maxFactor + ";\n" +
        "  var factor = 1 + (random(Math.min(lo, hi), Math.max(lo, hi)) - 1) * mix;\n" +
        "  result = value * factor;\n}\n";
    } else if (kind === "smooth") {
      lines += "if (on && mix > 0) result = value + (smooth(" + refs.widthSeconds + ", Math.round(" + refs.samples + "), " + refs.useCurrentTime + " ? time : " + refs.referenceTime + ") - value) * mix;\n";
    } else {
      lines += "if (on && mix > 0 && numKeys > 1) {\nvar modes = ['cycle', 'pingpong', 'offset', 'continue'];\n" +
        "var mode = modes[Math.round(" + refs.type + ") - 1];\n" +
        "var looped = " + refs.useDuration + " ? loopOutDuration(mode, " + refs.duration + ") : loopOut(mode, Math.min(numKeys - 1, Math.round(" + refs.numKeyframes + ")));\n" +
        "result = value + (looped - value) * mix;\n}\n";
    }
    if (meta.opacity) lines += "result = Math.max(0, Math.min(100, result));\n";
    if (meta.color) lines += "for (var c = 0; c < result.length; c++) result[c] = Math.max(0, Math.min(1, result[c]));\n";
    return lines + "result;";
  }
  /** @param {any} meta @returns {string} */
  function render(meta) { return HEADER + MotionJson.stringify(meta) + "\n" + body(meta.kind, references(meta.records), meta); }
  /** @param {string} source @param {string} kind @returns {any} */
  function metadata(source, kind) {
    if (source.indexOf(HEADER) !== 0 || source.length > 48000) return null;
    try {
      var end = source.indexOf("\n");
      var meta = /** @type {any} */ (MotionJson.parse(source.substring(HEADER.length, end)));
      if (!meta || meta.kind !== kind || meta.version !== 2 || !meta.records || meta.records.length > 16) return null;
      return render(meta) === source ? meta : null;
    } catch (error) { return null; }
  }
  /** @param {string} kind @param {string} source @returns {boolean} */
  function legacy(kind, source) {
    if (kind === "wiggle") return MotionExpressions.isManagedWiggleLive(source) || MotionExpressions.isManagedWiggle(source);
    if (kind === "flicker") return MotionExpressions.isManagedFlickerLive(source) || MotionExpressions.isManagedFlicker(source);
    if (kind === "smooth") return MotionExpressions.isManagedSmoothLive(source) || MotionExpressions.isManagedSmooth(source);
    return MotionExpressions.isManagedLoopOutLive(source) || MotionExpressions.isManagedLoopOut(source);
  }
  /** @param {string} kind @param {any} args @param {any} options @returns {any} */
  function prepare(kind, args, options) {
    var comp = app.project ? app.project.activeItem : null;
    if (!comp || !(comp instanceof CompItem)) return { error: fail("NO_ACTIVE_COMP", "Abra uma composicao."), items: [] };
    var selected = comp.selectedProperties || [], leaves = /** @type {any[]} */ ([]), i, j;
    for (i = 0; i < selected.length; i += 1) {
      var candidate = selected[i];
      if (candidate && candidate.propertyType === PropertyType.PROPERTY) {
        var duplicate = false;
        for (j = 0; j < leaves.length; j += 1) if (leaves[j] === candidate) duplicate = true;
        if (!duplicate) leaves.push(candidate);
      }
    }
    // Flicker has a documented layer-only fallback. Other tools never choose an arbitrary property.
    if (!leaves.length && kind === "flicker") {
      var layers = /** @type {any[]} */ (comp.selectedLayers || []);
      for (i = 0; i < layers.length; i += 1) {
        var transform = layers[i].property("ADBE Transform Group");
        var opacity = transform ? transform.property("ADBE Opacity") : null;
        if (opacity) leaves.push(opacity);
      }
    }
    if (!leaves.length) return { error: fail("NO_SELECTION", "Selecione uma propriedade numerica."), items: [] };
    if (leaves.length > 32) return { error: fail("INVALID_SELECTION_TYPE", "Selecione ate 32 propriedades por operacao."), items: [] };
    var items = /** @type {any[]} */ ([]), totals = /** @type {any[]} */ ([]);
    for (i = 0; i < leaves.length; i += 1) {
      var property = leaves[i], type = property.propertyValueType;
      if (!property.canSetExpression || !(type === PropertyValueType.OneD || type === PropertyValueType.TwoD || type === PropertyValueType.TwoD_SPATIAL || type === PropertyValueType.ThreeD || type === PropertyValueType.ThreeD_SPATIAL || type === PropertyValueType.COLOR))
        return { error: fail("INVALID_SELECTION_TYPE", "A selecao contem uma propriedade nao numerica ou sem suporte."), items: [] };
      var handle = capture(property), layer = handle.layer;
      if (!layer || typeof layer.property !== "function" || layer.locked) return { error: fail("INVALID_SELECTION_TYPE", "A camada esta bloqueada ou indisponivel."), items: [] };
      var parent = property.parentProperty;
      while (parent && parent !== layer) {
        if (typeof parent.name === "string" && parent.name.indexOf("Moti.on") === 0 && parent.matchName && (parent.matchName.indexOf("Control") >= 0 || parent.matchName.indexOf("Pseudo/Moti") === 0))
          return { error: fail("INVALID_SELECTION_TYPE", "Selecione a propriedade original, fora dos controles Moti.on."), items: [] };
        parent = parent.parentProperty;
      }
      if ((kind === "loopout" && property.numKeys < 2) || (kind === "smooth" && property.numKeys < 2)) return { error: fail("INVALID_SELECTION_TYPE", "Selecione uma propriedade com pelo menos dois keyframes."), items: [] };
      var before = String(property.expression || ""), meta = metadata(before, kind), old = legacy(kind, before);
      if (before && !meta && !old) return { error: fail("EXPRESSION_CONFLICT", "A expressao existente foi preservada."), items: [] };
      if (old && property.expressionError) return { error: fail("EXPRESSION_CONFLICT", "A expressao anterior precisa de reparo no Effect Controls."), items: [] };
      if (meta) {
        var parade = layer.property("ADBE Effect Parade");
        for (j = 0; j < meta.records.length; j += 1) {
          var record = meta.records[j], effect = control(parade, record.name);
          if (!effect || effect.matchName !== record.matchName) return { error: fail("EXPRESSION_CONFLICT", "Um controle foi removido ou renomeado. Restaure o vinculo no Effect Controls antes de reaplicar."), items: [] };
        }
      }
      var config = configuration(kind, args, property, comp, options);
      var group = null;
      for (j = 0; j < totals.length; j += 1) if (totals[j].layer === layer) group = totals[j];
      if (!group) { group = { layer: layer, count: layer.property("ADBE Effect Parade").numProperties }; totals.push(group); }
      if (!meta && !old) group.count += 1;
      if (group.count > MAX_CONTROLS) return { error: fail("INVALID_SELECTION_TYPE", "Esta camada atingiu o limite de 96 efeitos. Aplique em menos propriedades."), items: [] };
      items.push({ handle: handle, before: before, enabled: property.expressionEnabled === true, meta: meta, legacy: old, config: config, selected: property.selected === true });
    }
    return { error: null, items: items };
  }
  /** @param {string} kind @param {any} args @param {any} property @param {any} comp @param {any} options @returns {any} */
  function configuration(kind, args, property, comp, options) {
    var bindings = /** @type {any[]} */ ([]), values = /** @type {Record<string, any>} */ ({}), order = 0;
    /** @param {string} id @param {string} pt @param {string} en @param {any} value @param {number} min @param {number} max @param {string} [unit] @param {string} [control] */
    function add(id, pt, en, value, min, max, unit, control) {
      bindings.push({ paramId: id, label: { "pt-BR": pt, "en-US": en }, help: { "pt-BR": pt, "en-US": en }, control: control || "slider", target: "layer", order: ++order, min: min, max: max, unit: unit || "none" });
      values[id] = value;
    }
    var name = property.matchName || "", scale = name === "ADBE Scale", color = property.propertyValueType === PropertyValueType.COLOR;
    if (kind === "wiggle") {
      var amplitude = args.amplitude;
      var unit = "none";
      var quick = !options || options.mode !== "advanced";
      if (name.indexOf("ADBE Position") === 0 || name === "ADBE Anchor Point") { unit = "px"; if (quick) amplitude = 20 * Math.min(comp.width || 1920, comp.height || 1080) / 1080; }
      else if (name.indexOf("ADBE Rotate") === 0 || name === "ADBE Orientation") { unit = "°"; if (quick) amplitude = 5; }
      else if (scale) { unit = "%"; if (quick) amplitude = 4; }
      else if (quick) amplitude = color ? 0.02 : 2;
      add("frequency", "Frequência", "Frequency", args.frequency, 0, 100);
      add("amplitude", "Amplitude", "Amplitude", amplitude, 0, 100000, unit);
      add("seed", "Semente", "Seed", args.seed, 0, 100000);
      add("intensity", "Intensidade", "Intensity", 100, 0, 100, "%");
      add("enabled", "Ativo", "Enabled", true, 0, 1, "none", "checkbox");
      add("octaves", "Detalhe", "Detail", args.octaves, 1, 10);
      add("amplitudeMultiplier", "Detalhe: amplitude", "Detail: amplitude", args.amplitudeMultiplier, 0, 10);
      if (typeof property.value !== "number") add("axes", "Eixos (1 X · 2 Y · 4 Z)", "Axes (1 X · 2 Y · 4 Z)", 7, 0, 15);
      else values.axes = 7;
      if (scale) add("linkedScale", "Vincular proporções", "Link proportions", true, 0, 1, "none", "checkbox");
    } else if (kind === "flicker") {
      add("rate", "Frequência", "Frequency", args.rate, 0, 120);
      add("minFactor", "Fator mínimo", "Minimum factor", args.minFactor, 0, 10, "x");
      add("maxFactor", "Fator máximo", "Maximum factor", args.maxFactor, 0, 10, "x");
      add("seed", "Semente", "Seed", args.seed, 0, 100000);
      add("intensity", "Intensidade", "Intensity", 100, 0, 100, "%");
      add("enabled", "Ativo", "Enabled", true, 0, 1, "none", "checkbox");
    } else {
      if (kind === "smooth") {
        add("widthSeconds", "Janela", "Width", args.widthSeconds, 0.001, 3600, "s"); add("samples", "Amostras", "Samples", args.samples, 1, 101);
        add("referenceTime", "Tempo de referência", "Reference time", typeof args.referenceTime === "number" ? args.referenceTime : 0, 0, 86400, "s");
        add("useCurrentTime", "Acompanhar tempo", "Follow time", args.referenceTime === "current", 0, 1, "none", "checkbox");
      }
      else { var types = ["cycle", "pingpong", "offset", "continue"], index = 0; while (index < 4 && types[index] !== args.type) index += 1;
        add("type", "Modo (1 Ciclo · 2 Pingpong · 3 Offset · 4 Continue)", "Mode (1 Cycle · 2 Pingpong · 3 Offset · 4 Continue)", index + 1, 1, 4);
        add("numKeyframes", "Intervalo de keys", "Keyframe interval", args.numKeyframes, 0, 10000);
        add("duration", "Intervalo em segundos", "Interval in seconds", args.duration || 0, 0, 3600, "s");
        add("useDuration", "Usar segundos", "Use seconds", args.useDuration === true, 0, 1, "none", "checkbox"); }
      add("intensity", "Intensidade", "Intensity", 100, 0, 100, "%");
      add("enabled", "Ativo", "Enabled", true, 0, 1, "none", "checkbox");
    }
    return { bindings: bindings, values: values, scale: scale, color: color, opacity: name === "ADBE Opacity" };
  }
  /** @param {string} kind @param {any} args @param {any} context @param {any} options @returns {MotionCommandResult} */
  function run(kind, args, context, options) {
    var prepared = prepare(kind, args, options);
    if (prepared.error) throw new Error(prepared.error.message);
    var items = prepared.items, created = /** @type {any[]} */ ([]), written = /** @type {any[]} */ ([]), touched = /** @type {any[]} */ ([]), applied = 0, unchanged = 0, i, j;
    var grouped = /** @type {any} */ (global.MotionGroupedControls);
    var migrations = /** @type {any[]} */ ([]);
    // Capture every legacy value/keyframe before adding any effect.
    for (i = 0; i < items.length; i += 1) {
      if (items[i].meta && !items[i].meta.records[0].propertyIndex) {
        items[i].oldRecords = items[i].meta.records;
        items[i].states = grouped.capture(items[i].handle.layer, items[i].oldRecords);
      }
      if (!items[i].legacy && (!items[i].meta || items[i].states)) grouped.preset({bindings: items[i].config.bindings, locale: MotionLivePreset.normalizarLocale(context ? context.locale : null)});
    }
    try {
      // Resolve every path before creating an effect. addProperty can invalidate earlier handles.
      for (i = 0; i < items.length; i += 1) {
        var item = items[i];
        if (item.legacy || (item.meta && !item.states && (!options || options.mode !== "advanced"))) { unchanged += 1; continue; }
        if (item.meta && !item.states) {
          var effects = item.handle.layer.property("ADBE Effect Parade");
          for (j = 0; j < item.meta.records.length; j += 1) {
            var record = item.meta.records[j], param = control(effects, record.name).property(record.propertyIndex || 1);
            // Advanced Apply updates requested parameters only; intensity, axes and activation are adjusted in the host.
            if ((!Object.prototype.hasOwnProperty.call(args, record.paramId) && !(kind === "smooth" && record.paramId === "useCurrentTime")) || param.numKeys > 0 || param.expression) continue;
            written.push({ layer: item.handle.layer, name: record.name, propertyIndex: record.propertyIndex || 1, value: clone(param.value) });
            param.setValue(item.config.values[record.paramId]);
          }
          applied += 1;
          continue;
        }
        resolve(item.handle);
        var config = item.config;
        var made = MotionLiveControls.create(item.handle.layer, {
          grouped: true,
          tool: kind === "loopout" ? "LoopOut" : kind.charAt(0).toUpperCase() + kind.substring(1),
          rigId: "ae.expression." + kind + "." + i,
          locale: MotionLivePreset.normalizarLocale(context ? context.locale : null),
          bindings: config.bindings, values: config.values, targetKind: "layer", controlBudget: MAX_CONTROLS
        });
        created.push({ layer: item.handle.layer, records: made.records });
        if (item.states) { grouped.copyStates(item.handle.layer, made.records, item.states); migrations.push(item); }
        item.meta = { version: 2, kind: kind, scale: config.scale, color: config.color, opacity: config.opacity, records: made.records };
        item.desired = render(item.meta);
      }
      for (i = 0; i < items.length; i += 1) {
        var target = items[i];
        if (!target.desired) continue;
        var property = resolve(target.handle);
        touched.push(target);
        property.expression = target.desired;
        property.expressionEnabled = true;
        // Force evaluation at the current time before reporting success.
        if (typeof property.valueAtTime === "function") property.valueAtTime(/** @type {CompItem} */ (app.project.activeItem).time, false);
        if (property.expressionError || !property.expressionEnabled) throw new Error("O After Effects recusou a expressao.");
        applied += 1;
      }
      for (i = 0; i < migrations.length; i += 1) {
        migrations[i].removing = true;
        grouped.remove(migrations[i].handle.layer, migrations[i].oldRecords);
      }
    } catch (error) {
      var rollback = true;
      for (i = migrations.length - 1; i >= 0; i -= 1) {
        if (migrations[i].removing) { try { grouped.restoreLegacy(migrations[i].handle.layer, migrations[i].states); } catch (legacyError) { rollback = false; } }
      }
      for (i = touched.length - 1; i >= 0; i -= 1) {
        try { var restore = resolve(touched[i].handle); restore.expression = touched[i].before; restore.expressionEnabled = touched[i].enabled; }
        catch (restoreError) { rollback = false; }
      }
      for (i = written.length - 1; i >= 0; i -= 1) {
        try { control(written[i].layer.property("ADBE Effect Parade"), written[i].name).property(written[i].propertyIndex).setValue(written[i].value); }
        catch (writeError) { rollback = false; }
      }
      for (i = created.length - 1; i >= 0; i -= 1) {
        try { grouped.remove(created[i].layer, created[i].records); }
        catch (removeError) { rollback = false; }
      }
      if (!rollback) { var failure = /** @type {any} */ (new Error("A restauracao nao foi concluida; use Desfazer.")); failure.motionCode = "ROLLBACK_FAILED"; throw failure; }
      throw error;
    } finally {
      // Restore only the property-selection state we captured, after all reindexing.
      for (i = 0; i < items.length; i += 1) { try { resolve(items[i].handle).selected = items[i].selected; } catch (selectionError) { /* Host may have removed a target after a failure. */ } }
    }
    return { changed: applied > 0, warnings: [], data: { appliedCount: applied, unchangedCount: unchanged, liveControls: true } };
  }
  global.MotionQuickEffects = { prepare: prepare, run: run, metadata: metadata, capture: capture, resolve: resolve, control: control };
}($.global));
