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
  /**
   * Wiggle v3, "Flutuação": ruído Perlin contínuo (`noise`) mais duas órbitas
   * lentas com frequências sem relação inteira. O caminho passa pelas
   * diagonais em curvas, em vez dos trechos retos do `wiggle()` (que sorteia
   * um alvo novo por eixo a cada 1/f s). Reaproveita os MESMOS controles da v2
   * — o grupo do Effect Controls é um FFX pré-gerado por conjunto de rótulos:
   * Frequência = ciclos por segundo; Detalhe = camadas finas de ruído;
   * Detalhe: amplitude = peso de cada camada seguinte, como no wiggle.
   * Rotação e valores 1D inclinam junto com o eixo X (mesma semente e
   * velocidade), o que dá o balanço de algo boiando. Entra suave em 0,6 s a
   * partir do início da camada.
   * @param {any} refs @param {any} meta @returns {string}
   */
  /** Formula 1D por eixo (ver `axis` em configuration). @param {unknown} axis @returns {string} */
  function oneD(axis) {
    if (axis === 0 || axis === 1 || axis === 2) return "drift(" + axis + ")";
    if (axis === 10) return "(n(9, 1) * 0.6 + drift(1) * 0.4)";
    if (axis === 11) return "(n(8, 1) * 0.6 + d0 * 0.4)";
    return "(n(5, 1) * 0.6 + d0 * 0.4)";
  }
  /** @param {any} refs @param {any} meta @returns {string} */
  function drift(refs, meta) {
    return "var f = " + refs.frequency + ";\nvar a = " + refs.amplitude + ";\n" +
      "var s = Math.floor(" + refs.seed + ");\n" +
      "var oct = Math.round(" + refs.octaves + "), mul = " + refs.amplitudeMultiplier + ";\n" +
      "if (on && mix > 0 && f > 0 && a > 0) {\n" +
      "  var t0 = time - inPoint, t = t0 * f;\n" +
      "  var n = function (k, q) { return noise([t * q + k * 13.17, s * 7.31 + k]); };\n" +
      "  var drift = function (axis) {\n" +
      "    var d = axis === 0 ? n(1, 1) * 0.65 + Math.cos(t * 2.31 + s) * 0.35\n" +
      "      : axis === 1 ? n(2, 1) * 0.65 + Math.sin(t * 1.43 + s * 1.7) * 0.35 : n(6 + axis, 1) * 0.8;\n" +
      "    var w = mul * 0.35, q = 2;\n" +
      "    for (var o = 1; o < oct; o++) { d += n(20 + axis * 7 + o, q) * w; w *= mul; q *= 2; }\n" +
      "    return d;\n" +
      "  };\n" +
      "  var g = a * ease(t0, 0, 0.6, 0, 1) * mix;\n" +
      "  var d0 = drift(0);\n" +
      "  if (typeof value === 'number') result = value + " + oneD(meta.axis) + " * g;\n" +
      "  else { var mask = Math.round(" + (refs.axes || "7") + "); result = []; for (var i = 0; i < value.length; i++) {\n" +
      "    var delta = (i === 0 ? d0 : drift(i)) * g;\n" +
      (meta.scale ? "    if (" + refs.linkedScale + ") delta = value[0] === 0 ? d0 * g : d0 * g * value[i] / value[0];\n" : "") +
      "    result[i] = value[i] + ((mask & (1 << i)) ? delta : 0);\n" +
      "  } }\n}\n";
  }
  /** @param {string} kind @param {any} refs @param {any} meta @returns {string} */
  function body(kind, refs, meta) {
    var lines = "var on = " + refs.enabled + ";\nvar mix = " + refs.intensity + " / 100;\nvar result = value;\n";
    if (kind === "wiggle" && meta.version === 3) {
      lines += drift(refs, meta);
    } else if (kind === "wiggle") {
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
      if (!meta || meta.kind !== kind || !(meta.version === 2 || (meta.version === 3 && kind === "wiggle")) || !meta.records || meta.records.length > 16) return null;
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
    // Wiggle com camada selecionada e nenhuma propriedade: Posicao + Rotacao,
    // que e o uso do preset Flutuar. A rotacao recebe a amplitude em graus.
    var swayLeaves = /** @type {any[]} */ ([]);
    if (!leaves.length && kind === "wiggle") {
      var picked = /** @type {any[]} */ (comp.selectedLayers || []);
      for (i = 0; i < picked.length; i += 1) {
        var transformGroup = picked[i].property("ADBE Transform Group");
        if (!transformGroup) continue;
        var position = transformGroup.property("ADBE Position");
        if (position && position.dimensionsSeparated) {
          if (transformGroup.property("ADBE Position_0")) leaves.push(transformGroup.property("ADBE Position_0"));
          if (transformGroup.property("ADBE Position_1")) leaves.push(transformGroup.property("ADBE Position_1"));
        } else if (position) leaves.push(position);
        // Rotacao em X/Y/Z (bits 1/2/4 de rotationAxes). X e Y so existem em camada 3D.
        var rotAxes = typeof args.rotationAxes === "number" ? args.rotationAxes : 7;
        if (!(typeof args.rotation === "number" && args.rotation <= 0)) {
          var rotNames = picked[i].threeDLayer ? ["ADBE Rotate X", "ADBE Rotate Y", "ADBE Rotate Z"] : ["", "", "ADBE Rotate Z"];
          for (j = 0; j < 3; j += 1) {
            var rotation = rotNames[j] && (rotAxes & (1 << j)) ? transformGroup.property(rotNames[j]) : null;
            if (rotation) { leaves.push(rotation); swayLeaves.push(rotation); }
          }
        }
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
      var sway = false;
      for (j = 0; j < swayLeaves.length; j += 1) if (swayLeaves[j] === property) sway = true;
      var config = configuration(kind, args, property, comp, options, sway);
      var group = null;
      for (j = 0; j < totals.length; j += 1) if (totals[j].layer === layer) group = totals[j];
      if (!group) { group = { layer: layer, count: layer.property("ADBE Effect Parade").numProperties }; totals.push(group); }
      if (!meta && !old) group.count += 1;
      if (group.count > MAX_CONTROLS) return { error: fail("INVALID_SELECTION_TYPE", "Esta camada atingiu o limite de 96 efeitos. Aplique em menos propriedades."), items: [] };
      items.push({ handle: handle, before: before, enabled: property.expressionEnabled === true, meta: meta, legacy: old, config: config, selected: property.selected === true });
    }
    return { error: null, items: items };
  }
  /** @param {string} kind @param {any} args @param {any} property @param {any} comp @param {any} options @param {boolean} [sway] Rotacao escolhida pelo fallback de camada. @returns {any} */
  function configuration(kind, args, property, comp, options, sway) {
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
      // Pixels chegam do painel ja escalados pela resolucao (Flutuar: 14 px em 1080p).
      if (name.indexOf("ADBE Position") === 0 || name === "ADBE Anchor Point") { unit = "px"; if (quick && !(typeof amplitude === "number" && amplitude > 0)) amplitude = 14 * Math.min(comp.width || 1920, comp.height || 1080) / 1080; }
      else if (sway) { unit = "°"; amplitude = typeof args.rotation === "number" ? args.rotation : 0.6; }
      else if (name.indexOf("ADBE Rotate") === 0 || name === "ADBE Orientation") { unit = "°"; if (quick) amplitude = 3; }
      else if (scale) { unit = "%"; if (quick) amplitude = 2; }
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
    // Eixo do movimento 1D da Flutuacao: Posicao separada segue o proprio eixo;
    // Rotacao X inclina com o vertical, Y com o horizontal; Z e o resto balancam.
    var axis = name === "ADBE Position_0" ? 0 : name === "ADBE Position_1" ? 1 : name === "ADBE Position_2" ? 2
      : name === "ADBE Rotate X" ? 10 : name === "ADBE Rotate Y" ? 11 : -1;
    return { bindings: bindings, values: values, scale: scale, color: color, opacity: name === "ADBE Opacity", axis: axis };
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
        item.meta = { version: kind === "wiggle" ? 3 : 2, kind: kind, scale: config.scale, color: config.color, opacity: config.opacity, records: made.records };
        if (kind === "wiggle" && config.axis !== -1) item.meta.axis = config.axis;
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
