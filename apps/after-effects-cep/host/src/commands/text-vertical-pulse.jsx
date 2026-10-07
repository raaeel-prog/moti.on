/** Editable, repeating text pulse based on three managed text echoes. */
(function () {
  var ID = "ae.text.vertical-pulse";
  var OPEN = ["", "[MOTION_VERTICAL_PULSE_V1]", "[MOTION_VERTICAL_PULSE_V2]", "[MOTION_VERTICAL_PULSE_V3]"];
  var CLOSE = ["", "[/MOTION_VERTICAL_PULSE_V1]", "[/MOTION_VERTICAL_PULSE_V2]", "[/MOTION_VERTICAL_PULSE_V3]"];
  var EXPR = "// MOTION_VERTICAL_PULSE_V3\n";
  var V2_EXPR = "// MOTION_VERTICAL_PULSE_V2\n";
  var OLD_EXPR = "// MOTION_VERTICAL_PULSE_V1\n";
  var CONTROL = {
    durationFrames: "Moti.on Pulse · Cycle (frames)",
    peakScalePercent: "Moti.on Pulse · Vertical scale (%)",
    distortion: "Moti.on Pulse · Tears (%)",
    glow: "Moti.on Pulse · Glow (%)",
    seed: "Moti.on Pulse · Variation",
    accentColor: "Moti.on Pulse · Glow color",
    animationMode: "Moti.on Pulse · Direction",
    waveSpread: "Moti.on Pulse · Wave spread (%)"
  };
  var MODES = { "uniform": 1, "center-out": 2, "left-to-right": 3, "right-to-left": 4 };
  var ANIMATOR_NAME = "Moti.on Pulse · Character stretch";
  var SELECTOR_NAME = "Moti.on Pulse · Smooth envelope";
  /** @type {string[]} */
  var ROLES = ["core", "glow", "edge"];
  /** @param {string} key @returns {string} */
  function controlName(key) { return (/** @type {Record<string,string>} */ (CONTROL))[key] || ""; }
  /** @param {string} key @param {number} version @returns {boolean} */
  function hasControl(key, version) { return version >= 3 || (key !== "animationMode" && key !== "waveSpread"); }
  /** Native slider/color values may round to float32; compare their visible value rather than JSON spelling. @param {any} first @param {any} second @returns {boolean} */
  function sameValue(first, second) {
    if (typeof first === "number" && typeof second === "number")
      return Math.abs(first - second) <= 0.000001 * Math.max(1, Math.abs(first), Math.abs(second));
    if (Object.prototype.toString.call(first) === "[object Array]" && Object.prototype.toString.call(second) === "[object Array]") {
      if (first.length !== second.length) return false;
      for (var i = 0; i < first.length; i += 1) if (!sameValue(first[i], second[i])) return false;
      return true;
    }
    return first === second;
  }
  /** @param {any} args @param {string} key @returns {any} */
  function argumentValue(args, key) {
    if (key === "animationMode") return (/** @type {Record<string,number>} */ (MODES))[args.animationMode || "center-out"];
    if (key === "waveSpread") return typeof args.waveSpread === "undefined" ? 55 : args.waveSpread;
    return key === "accentColor" ? [args.accentColor[0], args.accentColor[1], args.accentColor[2], 1] : args[key];
  }

  /** @param {string} code @param {string} message @param {unknown} [details] @returns {MotionCommandFailure} */
  function fail(code, message, details) {
    return { code: code, message: message, recoverable: true, details: typeof details === "undefined" ? null : details };
  }
  /** @param {unknown} value @param {number} min @param {number} max @returns {boolean} */
  function inRange(value, min, max) { return typeof value === "number" && isFinite(value) && value >= min && value <= max; }
  /** @param {any} args @returns {MotionCommandFailure|null} */
  function validate(args) {
    if (!args || typeof args !== "object" || (args.action !== "apply" && args.action !== "remove"))
      return fail(MotionContracts.ERROR.INVALID_PRESET, "Escolha aplicar ou remover o Pulso.");
    var allowed = { action: true, durationFrames: true, peakScalePercent: true, distortion: true, glow: true, seed: true, accentColor: true,
      animationMode: true, waveSpread: true };
    var key, count = 0;
    for (key in args) if (Object.prototype.hasOwnProperty.call(args, key)) {
      if (!Object.prototype.hasOwnProperty.call(allowed, key)) return fail(MotionContracts.ERROR.INVALID_PRESET, "Argumento de pulso desconhecido.", { field: key });
      count += 1;
    }
    if (args.action === "remove") return count === 1 ? null : fail(MotionContracts.ERROR.INVALID_PRESET, "Remover aceita apenas a operação.");
    if (typeof args.animationMode !== "undefined" && (typeof args.animationMode !== "string" || !Object.prototype.hasOwnProperty.call(MODES, args.animationMode)))
      return fail(MotionContracts.ERROR.INVALID_PRESET, "Direção de animação inválida.", { field: "animationMode" });
    if (typeof args.waveSpread !== "undefined" && !inRange(args.waveSpread, 0, 100))
      return fail(MotionContracts.ERROR.INVALID_PRESET, "Propagação fora do limite.", { field: "waveSpread" });
    if (!inRange(args.durationFrames, 12, 240) || Math.floor(args.durationFrames) !== args.durationFrames)
      return fail(MotionContracts.ERROR.INVALID_PRESET, "Duração precisa estar entre 12 e 240 quadros.", { field: "durationFrames" });
    if (!inRange(args.peakScalePercent, 120, 450)) return fail(MotionContracts.ERROR.INVALID_PRESET, "Expansão fora do limite.", { field: "peakScalePercent" });
    if (!inRange(args.distortion, 0, 100)) return fail(MotionContracts.ERROR.INVALID_PRESET, "Rasgos fora do limite.", { field: "distortion" });
    if (!inRange(args.glow, 0, 100)) return fail(MotionContracts.ERROR.INVALID_PRESET, "Brilho fora do limite.", { field: "glow" });
    if (!inRange(args.seed, 0, 1000000) || Math.floor(args.seed) !== args.seed)
      return fail(MotionContracts.ERROR.INVALID_PRESET, "Variação fora do limite.", { field: "seed" });
    if (Object.prototype.toString.call(args.accentColor) !== "[object Array]" || args.accentColor.length !== 3)
      return fail(MotionContracts.ERROR.INVALID_PRESET, "Cor do brilho inválida.", { field: "accentColor" });
    for (var i = 0; i < 3; i += 1) if (!inRange(args.accentColor[i], 0, 1))
      return fail(MotionContracts.ERROR.INVALID_PRESET, "Cor do brilho inválida.", { field: "accentColor" });
    return null;
  }
  /** @param {any} layer @returns {any} */
  function readMeta(layer) {
    var text = String(layer.comment || ""), version = 0, begin = -1, end, i;
    for (i = 1; i < OPEN.length; i += 1) if (text.indexOf(String(OPEN[i])) >= 0) {
      var open = String(OPEN[i]);
      if (version || text.indexOf(open, text.indexOf(open) + open.length) >= 0) throw new Error("Pulse metadata is duplicated");
      version = i; begin = text.indexOf(open);
    }
    if (!version) return null;
    var startTag = String(OPEN[version]), endTag = String(CLOSE[version]);
    end = text.indexOf(endTag, begin + startTag.length);
    if (end < 0) throw new Error("Pulse metadata is incomplete");
    var meta = /** @type {any} */ (MotionJson.parse(text.substring(begin + startTag.length, end)));
    if (!meta || meta.version !== version || meta.type !== ID || typeof meta.rigId !== "string" ||
        typeof meta.sourceId !== "number" || typeof meta.role !== "string") throw new Error("Pulse metadata is invalid");
    return meta;
  }
  /** @param {string} comment @returns {string} */
  function stripMeta(comment) {
    var version = 0, begin = -1, end, i;
    for (i = 1; i < OPEN.length; i += 1) if (comment.indexOf(String(OPEN[i])) >= 0) {
      if (version) throw new Error("Pulse metadata is duplicated");
      version = i; begin = comment.indexOf(String(OPEN[i]));
    }
    if (!version) return comment;
    end = comment.indexOf(String(CLOSE[version]), begin + String(OPEN[version]).length);
    if (end < 0) throw new Error("Pulse metadata is incomplete");
    if (begin > 0 && comment.charAt(begin - 1) === "\n") begin -= 1;
    return comment.substring(0, begin) + comment.substring(end + String(CLOSE[version]).length);
  }
  /** @param {any} layer @param {any} meta @returns {void} */
  function writeMeta(layer, meta) {
    var previous = stripMeta(String(layer.comment || ""));
    layer.comment = previous + (previous ? "\n" : "") + OPEN[meta.version] + MotionJson.stringify(meta) + CLOSE[meta.version];
  }
  /** @param {any} layer @returns {any} */
  function textProperty(layer) {
    var group = layer && layer.property ? layer.property("ADBE Text Properties") : null;
    return group ? group.property("ADBE Text Document") : null;
  }
  /** @param {any} layer @returns {any} */
  function effects(layer) { return layer && layer.property ? layer.property("ADBE Effect Parade") : null; }
  /** @param {any} layer @returns {any} */
  function animators(layer) { var text = layer.property("ADBE Text Properties"); return text ? text.property("ADBE Text Animators") : null; }
  /** @param {any} layer @returns {MotionCommandFailure|null} */
  function animatorCapability(layer) {
    var groups = animators(layer), more = layer.property("ADBE Text Properties").property("ADBE Text More Options");
    if (!groups || !groups.canAddProperty || !groups.canAddProperty("ADBE Text Animator") || !more ||
        !more.property("ADBE Text Anchor Point Option") || !more.property("ADBE Text Anchor Point Align"))
      return fail(MotionContracts.ERROR.CAPABILITY_UNAVAILABLE, "Os animadores de texto e a ancoragem por caractere não estão disponíveis.");
    return null;
  }
  /** @param {any} layer @param {string} name @returns {any} */
  function control(layer, name) { var parade = effects(layer); return parade ? parade.property(name) : null; }
  /** @param {any} comp @param {number} id @returns {any} */
  function layerById(comp, id) {
    for (var i = 1; i <= comp.numLayers; i += 1) if (comp.layer(i).id === id) return comp.layer(i);
    return null;
  }
  /** @param {any} comp @param {any} selected @returns {{source:any,meta:any,error:MotionCommandFailure|null}} */
  function target(comp, selected) {
    var meta;
    try { meta = readMeta(selected); }
    catch (error) { return { source: null, meta: null, error: fail(MotionContracts.ERROR.TRACK_CONFLICT, "Metadados do pulso estão incompletos.") }; }
    if (meta && meta.role !== "source") {
      var source = layerById(comp, meta.sourceId);
      if (!source || !(source instanceof TextLayer))
        return { source: null, meta: null, error: fail(MotionContracts.ERROR.TRACK_CONFLICT, "O texto original do pulso não foi encontrado.") };
      try { var sourceMeta = readMeta(source); }
      catch (parseError) { return { source: null, meta: null, error: fail(MotionContracts.ERROR.TRACK_CONFLICT, "Metadados do texto original estão incompletos.") }; }
      if (!sourceMeta || sourceMeta.rigId !== meta.rigId || sourceMeta.role !== "source")
        return { source: null, meta: null, error: fail(MotionContracts.ERROR.TRACK_CONFLICT, "O eco não pertence mais ao texto selecionado.") };
      return { source: source, meta: sourceMeta, error: null };
    }
    if (!(selected instanceof TextLayer)) return { source: null, meta: null, error: fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Selecione uma camada de texto.") };
    return { source: selected, meta: meta, error: null };
  }
  /** @param {any} comp @param {any} source @param {any} meta @param {boolean} [allowAnimated] @returns {{echoes:any,error:MotionCommandFailure|null}} */
  function inspectRig(comp, source, meta, allowAnimated) {
    if (!meta || meta.sourceId !== source.id || meta.role !== "source" || typeof meta.originalEnabled !== "boolean" || typeof meta.start !== "number" || !isFinite(meta.start))
      return { echoes: null, error: fail(MotionContracts.ERROR.TRACK_CONFLICT, "Metadados do pulso não combinam com o texto.") };
    if (source.enabled || source.locked) return { echoes: null, error: fail(MotionContracts.ERROR.TRACK_CONFLICT, "O texto do pulso foi alterado ou bloqueado.") };
    var found = /** @type {Record<string,any>} */ ({ core: null, glow: null, edge: null }), count = 0, i, layer, m;
    try {
      for (i = 1; i <= comp.numLayers; i += 1) {
        layer = comp.layer(i);
        if (layer === source) continue;
        m = readMeta(layer);
        if (!m || m.rigId !== meta.rigId || m.sourceId !== source.id) continue;
        if (m.version !== meta.version || !Object.prototype.hasOwnProperty.call(found, m.role) || found[m.role]) throw new Error("Unexpected pulse member");
        found[m.role] = layer; count += 1;
      }
    } catch (error) { return { echoes: null, error: fail(MotionContracts.ERROR.TRACK_CONFLICT, "A estrutura do pulso foi alterada.") }; }
    if (count !== 3) return { echoes: null, error: fail(MotionContracts.ERROR.TRACK_CONFLICT, "Falta um eco do pulso. Use Undo ou restaure a estrutura.") };
    for (i = 0; i < ROLES.length; i += 1) {
      layer = found[String(ROLES[i])];
      var text = textProperty(layer), transform = layer.property("ADBE Transform Group"), parade = effects(layer);
      var prefix = meta.version === 1 ? OLD_EXPR : meta.version === 2 ? V2_EXPR : EXPR;
      if (!(layer instanceof TextLayer) || (/** @type {any} */ (layer)).parent !== source || (/** @type {any} */ (layer)).locked || !(/** @type {any} */ (layer)).enabled || !text ||
          String(text.expression || "").indexOf(prefix) !== 0 || !transform ||
          String(transform.property("ADBE Scale").expression || "").indexOf(prefix) !== 0 ||
          !parade || parade.numProperties !== (meta.version >= 2 && ROLES[i] === "glow" ? 2 : 1))
        return { echoes: null, error: fail(MotionContracts.ERROR.TRACK_CONFLICT, "Um eco foi editado. Preserve-o antes de remover ou ajustar.") };
      if (ROLES[i] === "glow" && parade.property(1).matchName !== "ADBE Gaussian Blur 2" ||
          ROLES[i] !== "glow" && parade.property(1).matchName !== "ADBE Turbulent Displace")
        return { echoes: null, error: fail(MotionContracts.ERROR.TRACK_CONFLICT, "Os efeitos de um eco foram modificados.") };
      if (ROLES[i] === "glow" && meta.version >= 2 && parade.property(2).matchName !== "ADBE Glo2")
        return { echoes: null, error: fail(MotionContracts.ERROR.TRACK_CONFLICT, "O brilho de um eco foi modificado.") };
      var managed = expressionProperties(layer, String(ROLES[i]), meta.version);
      var expected = meta.version === 1 ? legacyExpressionTemplates(String(ROLES[i]), meta) :
        meta.version === 2 ? legacyV2ExpressionTemplates(String(ROLES[i]), meta) : echoExpressionTemplates(String(ROLES[i]), meta);
      for (var p = 0; p < managed.length; p += 1) if (!managed[p] || managed[p].numKeys > 0 ||
          !managed[p].expressionEnabled || String(managed[p].expression || "") !== expected[p])
        return { echoes: null, error: fail(MotionContracts.ERROR.TRACK_CONFLICT, "Uma expressão do eco foi editada. Preserve-a antes de ajustar.") };
      if (ROLES[i] !== "glow") {
        var mode = parade.property(1).property("ADBE Turbulent Displace-0001");
        var size = parade.property(1).property("ADBE Turbulent Displace-0003"), seed = parade.property(1).property("ADBE Turbulent Displace-0010");
        if (!mode || !size || !seed || mode.numKeys > 0 || size.numKeys > 0 || seed.numKeys > 0 || mode.expression || size.expression || seed.expression ||
            meta.version >= 2 && mode.value !== 9)
          return { echoes: null, error: fail(MotionContracts.ERROR.TRACK_CONFLICT, "Um parâmetro do rasgo foi animado. Preserve-o antes de ajustar.") };
      } else if (meta.version >= 2) {
        var colors = parade.property(2).property("ADBE Glo2-0007");
        if (!colors || colors.numKeys > 0 || colors.expression || colors.value !== 1)
          return { echoes: null, error: fail(MotionContracts.ERROR.TRACK_CONFLICT, "A cor do brilho foi editada. Preserve-a antes de ajustar.") };
      }
      var groups = animators(layer);
      if (!groups || groups.numProperties !== (meta.version === 3 ? 1 : 0))
        return { echoes: null, error: fail(MotionContracts.ERROR.TRACK_CONFLICT, "Os animadores do eco foram editados. Preserve-os antes de ajustar.") };
      if (meta.version === 3) {
        var animator = groups.property(1), selectors = animator.property("ADBE Text Selectors"), props = animator.property("ADBE Text Animator Properties");
        var more = layer.property("ADBE Text Properties").property("ADBE Text More Options");
        if (animator.matchName !== "ADBE Text Animator" || animator.name !== ANIMATOR_NAME || !selectors || selectors.numProperties !== 1 || !props ||
            selectors.property(1).matchName !== "ADBE Text Expressible Selector" || selectors.property(1).name !== SELECTOR_NAME ||
            !staticValue(selectors.property(1).property("ADBE Text Range Type2"), 1) || !more ||
            !staticValue(more.property("ADBE Text Anchor Point Option"), 1) || !staticValue(more.property("ADBE Text Anchor Point Align"), [0, -50]))
          return { echoes: null, error: fail(MotionContracts.ERROR.TRACK_CONFLICT, "O seletor ou a ancoragem do pulso foi editado.") };
        for (var ap = 1; ap <= props.numProperties; ap += 1) {
          var animatorProp = props.property(ap);
          if (animatorProp.matchName !== "ADBE Text Scale 3D" &&
              (animatorProp.numKeys > 0 || animatorProp.expression || animatorProp.isModified === true))
            return { echoes: null, error: fail(MotionContracts.ERROR.TRACK_CONFLICT, "Uma propriedade do animador foi personalizada. Preserve-a antes de ajustar.") };
        }
      }
      for (var j = 1; j <= comp.numLayers; j += 1) if (comp.layer(j).parent === layer)
        return { echoes: null, error: fail(MotionContracts.ERROR.TRACK_CONFLICT, "Desvincule camadas filhas do eco antes de removê-lo.") };
    }
    for (var key in CONTROL) if (Object.prototype.hasOwnProperty.call(CONTROL, key) && hasControl(key, meta.version)) {
      var effect = control(source, controlName(key));
      if (!effect || effect.matchName !== (key === "accentColor" ? "ADBE Color Control" : "ADBE Slider Control") ||
          (!allowAnimated && (effect.property(1).numKeys > 0 || effect.property(1).expression)))
        return { echoes: null, error: fail(MotionContracts.ERROR.TRACK_CONFLICT, "Um controle do pulso foi renomeado ou animado.") };
    }
    return { echoes: found, error: null };
  }
  /** @param {any} prop @param {any} value @returns {boolean} */
  function staticValue(prop, value) {
    return !!prop && prop.numKeys === 0 && !prop.expression && MotionJson.stringify(prop.value) === MotionJson.stringify(value);
  }
  /** @param {any} args @param {boolean} [allowAnimated] @returns {{error:MotionCommandFailure|null,comp:any,source:any,meta:any,echoes:any}} */
  function prepare(args, allowAnimated) {
    var invalid = validate(args);
    if (invalid) return { error: invalid, comp: null, source: null, meta: null, echoes: null };
    if (!app.project) return { error: fail(MotionContracts.ERROR.NO_ACTIVE_PROJECT, "Abra um projeto."), comp: null, source: null, meta: null, echoes: null };
    var comp = /** @type {any} */ (app.project.activeItem);
    if (!comp || !(comp instanceof CompItem)) return { error: fail(MotionContracts.ERROR.NO_ACTIVE_COMP, "Abra uma composição."), comp: null, source: null, meta: null, echoes: null };
    if (!comp.selectedLayers || comp.selectedLayers.length !== 1)
      return { error: fail(MotionContracts.ERROR.NO_SELECTION, "Selecione uma camada de texto por vez."), comp: comp, source: null, meta: null, echoes: null };
    var selected = /** @type {any} */ (comp.selectedLayers[0]), resolved = target(comp, selected);
    if (resolved.error) return { error: resolved.error, comp: comp, source: null, meta: null, echoes: null };
    var source = resolved.source, meta = resolved.meta;
    if (meta) {
      var owned = inspectRig(comp, source, meta, allowAnimated);
      if (!owned.error && meta.version === 1 && args.action === "apply" &&
          (!effects(source).canAddProperty || !effects(source).canAddProperty("ADBE Glo2")))
        owned.error = fail(MotionContracts.ERROR.CAPABILITY_UNAVAILABLE, "O efeito Glow não está disponível neste After Effects.");
      if (!owned.error && meta.version === 1 && args.action === "apply" &&
          (typeof owned.echoes.edge.moveBefore !== "function" || typeof owned.echoes.edge.moveToEnd !== "function"))
        owned.error = fail(MotionContracts.ERROR.CAPABILITY_UNAVAILABLE, "A ordem das camadas do pulso não pode ser ajustada neste After Effects.");
      if (!owned.error && meta.version < 3 && args.action === "apply") {
        if (control(source, controlName("animationMode")) || control(source, controlName("waveSpread")))
          owned.error = fail(MotionContracts.ERROR.TRACK_CONFLICT, "Um controle com o nome da nova direção já existe no texto.");
        for (var ri = 0; !owned.error && ri < ROLES.length; ri += 1) owned.error = animatorCapability(owned.echoes[String(ROLES[ri])]);
      }
      return { error: owned.error, comp: comp, source: source, meta: meta, echoes: owned.echoes };
    }
    if (args.action === "remove") return { error: fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "O texto selecionado não tem Pulso."), comp: comp, source: source, meta: null, echoes: null };
    var text = textProperty(source), parade = effects(source), transform = source.property("ADBE Transform Group");
    var textGroup = source.property("ADBE Text Properties"), masks = source.property("ADBE Mask Parade");
    if (source.locked || !source.enabled || source.threeDLayer || source.solo || source.guideLayer || source.hasTrackMatte || source.isTrackMatte ||
        !text || !parade || !transform || !textGroup || !masks ||
        parade.numProperties > 0 || masks.numProperties > 0 || textGroup.property("ADBE Text Animators").numProperties > 0 ||
        transform.property("ADBE Position").dimensionsSeparated)
      return { error: fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Use texto 2D visível, sem efeitos, máscaras, animadores ou posição separada."), comp: comp, source: source, meta: null, echoes: null };
    if (typeof source.id !== "number" || !source.sourceRectAtTime || typeof source.moveBefore !== "function" ||
        !parade.canAddProperty || !parade.canAddProperty("ADBE Slider Control") || !parade.canAddProperty("ADBE Color Control") ||
        !parade.canAddProperty("ADBE Gaussian Blur 2") || !parade.canAddProperty("ADBE Turbulent Displace") || !parade.canAddProperty("ADBE Glo2"))
      return { error: fail(MotionContracts.ERROR.CAPABILITY_UNAVAILABLE, "Os controles, Blur, Glow ou Turbulent Displace não estão disponíveis neste After Effects."), comp: comp, source: source, meta: null, echoes: null };
    var document = text.value;
    if (!document || !String(document.text || "").length || document.boxText)
      return { error: fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Use texto de ponto não vazio."), comp: comp, source: source, meta: null, echoes: null };
    if (typeof comp.time !== "number" || !isFinite(comp.time))
      return { error: fail(MotionContracts.ERROR.CAPABILITY_UNAVAILABLE, "O tempo da composição não está disponível."), comp: comp, source: source, meta: null, echoes: null };
    return { error: animatorCapability(source), comp: comp, source: source, meta: null, echoes: null };
  }
  /** @param {any} layer @param {string} matchName @param {any} value @returns {void} */
  function resetProperty(layer, matchName, value) {
    var prop = layer.property("ADBE Transform Group").property(matchName);
    if (!prop) throw new Error("Missing transform property");
    if (prop.expression) { prop.expressionEnabled = false; prop.expression = ""; }
    while (prop.numKeys > 0) prop.removeKey(prop.numKeys);
    prop.setValue(value);
  }
  /** @param {any} source @param {string} key @param {any} value @returns {void} */
  function addControl(source, key, value) {
    var effect = effects(source).addProperty(key === "accentColor" ? "ADBE Color Control" : "ADBE Slider Control");
    effect.name = controlName(key);
    effect.property(1).setValue(value);
  }
  /** @param {any} source @param {string} key @returns {any} */
  function controlValue(source, key) { return control(source, controlName(key)).property(1); }
  /** @param {string} name @returns {string} */
  function effectRead(name) { return "parent.effect(" + MotionJson.stringify(name) + ")(1)"; }
  /** @param {any} meta @returns {string} */
  function legacyV2PulseExpression(meta) {
    return "var cycle=Math.max(12,Math.min(240," + effectRead(CONTROL.durationFrames) + "))*thisComp.frameDuration;\n" +
      "var elapsed=time-" + String(meta.start) + ";var p=0,burst=0;\n" +
      "if(elapsed>=0){var u=(elapsed/cycle)%1;\n" +
      "function smooth(v){v=Math.max(0,Math.min(1,v));return v*v*(3-2*v);}\n" +
      "if(u<.12){var attack=u/.12;p=1-Math.pow(1-attack,3);burst=Math.sin(Math.PI*attack);}" +
      "else if(u<.43)p=1;else if(u<.66){var release=(u-.43)/.23;p=1-smooth(release);burst=Math.sin(Math.PI*release);}" +
      "else if(u<.76)p=-.06*Math.sin((u-.66)/.10*Math.PI);}\n";
  }
  /** @param {any} meta @returns {string} */
  function motionTimingExpression(meta) {
    return "var cycle=Math.max(12,Math.min(240," + effectRead(CONTROL.durationFrames) + "))*thisComp.frameDuration;\n" +
      "var elapsed=time-" + String(meta.start) + ";var u=elapsed<0?-1:(elapsed/cycle)%1;\n" +
      "var mode=Math.max(1,Math.min(4,Math.round(" + effectRead(CONTROL.animationMode) + ")));" +
      "var span=mode===1?0:Math.max(0,Math.min(100," + effectRead(CONTROL.waveSpread) + "))/100*.18;\n";
  }
  /** Quintic edges keep velocity and acceleration continuous at rest, peak, and release. @returns {string} */
  function envelopeExpression() {
    return "function smooth(v){v=Math.max(0,Math.min(1,v));return v*v*v*(v*(v*6-15)+10);}\n" +
      "function pulse(v){if(v<.04||v>=.80)return [0,0];var a;" +
      "if(v<.24){a=smooth((v-.04)/.20);return [a,Math.sin(Math.PI*a)];}" +
      "if(v<.60)return [1,0];a=smooth((v-.60)/.20);return [1-a,Math.sin(Math.PI*a)];}\n";
  }
  /** Smooth overall lighting approximates the staggered glyph envelope with a bounded four-sample average. @param {any} meta @returns {string} */
  function pulseExpression(meta) {
    return motionTimingExpression(meta) + envelopeExpression() +
      "var a=pulse(u),b=pulse(u-span*.5),c=pulse(u-span);" +
      "var p=(a[0]+2*b[0]+c[0])/4,burst=(a[1]+2*b[1]+c[1])/4;\n";
  }
  /** @param {string} role @returns {number} */
  function rimScale(role) { return role === "glow" ? 40 : role === "edge" ? 22 : 0; }
  /** @param {string} role @param {any} meta @returns {string} */
  function selectorExpression(role, meta) {
    return EXPR + motionTimingExpression(meta) + envelopeExpression() +
      "var n=Math.max(1,textTotal),i=Math.max(0,Math.min(n-1,textIndex-1));var rank=0;" +
      "if(n>1){if(mode===2){var center=(n-1)/2,inner=n%2===0?.5:0;" +
      "rank=(Math.abs(i-center)-inner)/Math.max(1,center-inner);}" +
      "else if(mode===3)rank=i/(n-1);else if(mode===4)rank=1-i/(n-1);}" +
      "var v=pulse(u-rank*span);var peak=Math.max(120,Math.min(450," + effectRead(CONTROL.peakScalePercent) + "));" +
      "100*((peak-100)*v[0]+" + String(rimScale(role)) + "*v[1])/(peak+" + String(rimScale(role)) + "-100);";
  }
  /** Exact V1 templates allow safe migration without treating a retained header as ownership. @param {string} role @param {any} meta @returns {string[]} */
  function legacyExpressionTemplates(role, meta) {
    var pulse = "var cycle=Math.max(12,Math.min(240," + effectRead(CONTROL.durationFrames) + "))*thisComp.frameDuration;\n" +
      "var elapsed=time-" + String(meta.start) + ";var p=0,burst=0;\n" +
      "if(elapsed>=0){var u=(elapsed/cycle)%1;\n" +
      "function smooth(v){v=Math.max(0,Math.min(1,v));return v*v*(3-2*v);}\n" +
      "if(u<.16){p=smooth(u/.16);burst=Math.sin(Math.PI*u/.16);}" +
      "else if(u<.45)p=1;else if(u<.70){p=1-smooth((u-.45)/.25);burst=Math.sin(Math.PI*(u-.45)/.25);}" +
      "else if(u<.82)p=-.08*Math.sin((u-.70)/.12*Math.PI);}\n";
    var center = OLD_EXPR + "var r=parent.sourceRectAtTime(time,false);[r.left+r.width/2,r.top+r.height/2];", position = center;
    if (role === "edge") position = OLD_EXPR + pulse + "var d=Math.max(0,Math.min(100," + effectRead(CONTROL.distortion) + "));" +
      "var s=" + effectRead(CONTROL.seed) + ";var r=parent.sourceRectAtTime(time,false);" +
      "[r.left+r.width/2+Math.sin(elapsed*9+s*.013)*d*.08*Math.max(0,p),r.top+r.height/2+Math.cos(elapsed*6+s*.021)*d*.035*Math.max(0,p)];";
    var scale = OLD_EXPR + pulse + "var peak=Math.max(120,Math.min(300," + effectRead(CONTROL.peakScalePercent) + "));" +
      "[100," + (role === "core" ? "100+(peak-100)*p" : role === "glow" ? "102+(peak-102)*Math.max(0,p)*1.02" : "104+(peak-104)*Math.max(0,p)*1.04") + "];";
    var opacity = OLD_EXPR + pulse + (role === "core" ? "parent.transform.opacity;" : role === "glow" ?
      "parent.transform.opacity*Math.min(1,.25+" + effectRead(CONTROL.glow) + "/100*.95+.2*Math.max(0,p));" :
      "parent.transform.opacity*Math.min(1," + effectRead(CONTROL.distortion) + "/100*(.25+.9*Math.max(0,p))); ");
    var color = role === "core" ? "[1,1,1]" : role === "glow" ? "[c[0],c[1],c[2]]" : "[c[0]*.95,c[1]*.18,c[2]*.08]";
    var sourceText = OLD_EXPR + "var src=parent.text.sourceText;var style=src.getStyleAt(0,time).setText(src);" +
      "var c=" + effectRead(CONTROL.accentColor) + ";style.setApplyFill(true).setFillColor(" + color + ").setApplyStroke(false);";
    var templates = [sourceText, center, position, scale, opacity];
    if (role === "glow") templates.push(OLD_EXPR + pulse + "(4+" + effectRead(CONTROL.glow) + "*.4)*(.5+.5*Math.max(0,p));");
    else {
      templates.push(OLD_EXPR + pulse + effectRead(CONTROL.distortion) + (role === "core" ? "*.7*burst;" : "*.55*(.35*Math.max(0,p)+.65*burst);"));
      templates.push(OLD_EXPR + "(time-" + String(meta.start) + ")*210+" + effectRead(CONTROL.seed) + "*13;");
    }
    return templates;
  }
  /** Paths survive native indexed-group invalidation when an effect is added or removed. @param {string} role @param {number} version @returns {any[][]} */
  function expressionPaths(role, version) {
    var list = /** @type {any[][]} */ ([["ADBE Text Properties", "ADBE Text Document"], ["ADBE Transform Group", "ADBE Anchor Point"],
      ["ADBE Transform Group", "ADBE Position"], ["ADBE Transform Group", "ADBE Scale"], ["ADBE Transform Group", "ADBE Opacity"]]);
    if (role === "glow") {
      list.push(["ADBE Effect Parade", 1, "ADBE Gaussian Blur 2-0001"]);
      if (version >= 2) {
        list.push(["ADBE Effect Parade", 2, "ADBE Glo2-0003"]);
        list.push(["ADBE Effect Parade", 2, "ADBE Glo2-0004"]);
      }
    } else {
      list.push(["ADBE Effect Parade", 1, "ADBE Turbulent Displace-0002"]);
      list.push(["ADBE Effect Parade", 1, "ADBE Turbulent Displace-0006"]);
    }
    if (version === 3) {
      list.push(["ADBE Text Properties", "ADBE Text Animators", 1, "ADBE Text Animator Properties", "ADBE Text Scale 3D"]);
      list.push(["ADBE Text Properties", "ADBE Text Animators", 1, "ADBE Text Selectors", 1, "ADBE Text Expressible Amount"]);
    }
    return list;
  }
  /** @param {any} layer @param {any[]|undefined} path @returns {any} */
  function resolveProperty(layer, path) {
    if (!path) return null;
    var prop = layer;
    for (var i = 0; i < path.length && prop; i += 1) prop = prop.property(path[i]);
    return prop;
  }
  /** @param {any} layer @param {string} role @param {number} version @returns {any[]} */
  function expressionProperties(layer, role, version) {
    var paths = expressionPaths(role, version), list = [];
    for (var i = 0; i < paths.length; i += 1) list.push(resolveProperty(layer, paths[i]));
    return list;
  }
  /** @param {string} role @param {any} meta @returns {string[]} */
  function legacyV2ExpressionTemplates(role, meta) {
    var center = V2_EXPR + "var r=parent.sourceRectAtTime(time,false);[r.left+r.width/2,r.top+r.height/2];";
    var position = V2_EXPR + legacyV2PulseExpression(meta) +
      "var d=Math.max(0,Math.min(100," + effectRead(CONTROL.distortion) + "));" +
      "var s=" + effectRead(CONTROL.seed) + ";var r=parent.sourceRectAtTime(time,false);" +
      "var tick=Math.floor(elapsed/thisComp.frameDuration);" +
      "[r.left+r.width/2+Math.sin(tick*2.17+s*.73)*d*" + (role === "core" ? ".005" : role === "glow" ? ".015" : ".03") +
      "*burst,r.top+r.height/2+Math.cos(tick*1.79+s*.41)*d*" + (role === "core" ? ".03" : role === "glow" ? ".05" : ".08") + "*burst];";
    var scale = V2_EXPR + legacyV2PulseExpression(meta) +
      "var peak=Math.max(120,Math.min(450," + effectRead(CONTROL.peakScalePercent) + "));" +
      "[76,100+(peak-100)*p" + (role === "core" ? "" : role === "glow" ? "+40*burst" : "+22*burst") + "];";
    var opacity = V2_EXPR + legacyV2PulseExpression(meta) +
      (role === "core" ? "parent.transform.opacity;" : role === "glow" ?
        "parent.transform.opacity*Math.max(0,Math.min(100," + effectRead(CONTROL.glow) + "))/100*Math.min(1,.85*Math.max(0,p)+1.6*burst);" :
        "parent.transform.opacity*Math.max(0,Math.min(100," + effectRead(CONTROL.distortion) + "))/100*Math.min(1,burst*1.45);");
    var color = role === "core" ? "[1,1,1]" : role === "glow" ?
      "[c[0],Math.min(1,c[1]*(1.17+.06*burst*Math.sin(elapsed*8+s*.41))),c[2]*.3]" :
      "[c[0],c[1]*(.06+.2*burst*(.5+.5*Math.sin(elapsed*6+s*.73))),c[2]*.03]";
    var sourceText = V2_EXPR + (role === "core" ? "" : legacyV2PulseExpression(meta) + "var s=" + effectRead(CONTROL.seed) + ";") +
      "var src=parent.text.sourceText;var style=src.getStyleAt(0,time).setText(src);" +
      "var c=" + effectRead(CONTROL.accentColor) + ";style.setApplyFill(true).setFillColor(" + color + ").setApplyStroke(false);";
    var templates = [sourceText, center, position, scale, opacity];
    if (role === "glow") {
      templates.push(V2_EXPR + legacyV2PulseExpression(meta) + "1.2+.6*burst;");
      templates.push(V2_EXPR + legacyV2PulseExpression(meta) + "35+25*burst;");
      templates.push(V2_EXPR + legacyV2PulseExpression(meta) + "var g=Math.max(0,Math.min(100," + effectRead(CONTROL.glow) + "))/100;" +
        "var s=" + effectRead(CONTROL.seed) + ";g*(1.8*Math.max(0,p)+4.5*burst)*(1+.08*Math.sin(elapsed*8+s*.41));");
    }
    else {
      templates.push(V2_EXPR + legacyV2PulseExpression(meta) + "Math.max(0,Math.min(100," + effectRead(CONTROL.distortion) + "))*" + (role === "core" ? "1.2" : "1.85") + "*burst;");
      templates.push(V2_EXPR + "(time-" + String(meta.start) + ")*1080+" + effectRead(CONTROL.seed) + "*137;");
    }
    return templates;
  }
  /** @param {string} role @param {any} meta @returns {string[]} */
  function echoExpressionTemplates(role, meta) {
    var center = EXPR + "var r=parent.sourceRectAtTime(time,false);[r.left+r.width/2,r.top+r.height/2];";
    var position = EXPR + pulseExpression(meta) +
      "var d=Math.max(0,Math.min(100," + effectRead(CONTROL.distortion) + "));var s=" + effectRead(CONTROL.seed) + ";" +
      "var r=parent.sourceRectAtTime(time,false);" +
      "[r.left+r.width/2+Math.sin(elapsed*7.3+s*.73)*d*" + (role === "core" ? ".002" : role === "glow" ? ".008" : ".015") +
      "*burst,r.top+r.height/2+Math.cos(elapsed*5.9+s*.41)*d*" + (role === "core" ? ".004" : role === "glow" ? ".012" : ".02") + "*burst];";
    var opacity = EXPR + pulseExpression(meta) + (role === "core" ? "parent.transform.opacity;" : role === "glow" ?
      "parent.transform.opacity*Math.max(0,Math.min(100," + effectRead(CONTROL.glow) + "))/100*Math.min(1,.85*p+1.6*burst);" :
      "parent.transform.opacity*Math.max(0,Math.min(100," + effectRead(CONTROL.distortion) + "))/100*Math.min(1,burst*1.45);");
    var color = role === "core" ? "[1,1,1]" : role === "glow" ?
      "[c[0],Math.min(1,c[1]*(1.17+.06*burst*Math.sin(elapsed*8+s*.41))),c[2]*.3]" :
      "[c[0],c[1]*(.06+.2*burst*(.5+.5*Math.sin(elapsed*6+s*.73))),c[2]*.03]";
    var sourceText = EXPR + (role === "core" ? "" : pulseExpression(meta) + "var s=" + effectRead(CONTROL.seed) + ";") +
      "var src=parent.text.sourceText;var style=src.getStyleAt(0,time).setText(src);var c=" + effectRead(CONTROL.accentColor) +
      ";style.setApplyFill(true).setFillColor(" + color + ").setApplyStroke(false);";
    var templates = [sourceText, center, position, EXPR + "[76,100];", opacity];
    if (role === "glow") {
      templates.push(EXPR + pulseExpression(meta) + "1.2+.6*burst;");
      templates.push(EXPR + pulseExpression(meta) + "35+25*burst;");
      templates.push(EXPR + pulseExpression(meta) + "var g=Math.max(0,Math.min(100," + effectRead(CONTROL.glow) + "))/100;var s=" + effectRead(CONTROL.seed) +
        ";g*(1.8*p+4.5*burst)*(1+.08*Math.sin(elapsed*8+s*.41));");
    } else {
      templates.push(EXPR + pulseExpression(meta) + "Math.max(0,Math.min(100," + effectRead(CONTROL.distortion) + "))*" + (role === "core" ? "1.2" : "1.85") + "*burst;");
      templates.push(EXPR + "(time-" + String(meta.start) + ")*1080+" + effectRead(CONTROL.seed) + "*137;");
    }
    templates.push(EXPR + "[100,Math.max(120,Math.min(450," + effectRead(CONTROL.peakScalePercent) + "))+" + String(rimScale(role)) + ",100];");
    templates.push(selectorExpression(role, meta));
    return templates;
  }
  /** @param {string} message @returns {Error} */
  function missingAnimator(message) {
    var error = /** @type {any} */ (new Error(message)); error.motionCode = MotionContracts.ERROR.CAPABILITY_UNAVAILABLE; return error;
  }
  /** @param {any} layer @returns {void} */
  function configureAnimator(layer) {
    var groups = animators(layer);
    if (groups.numProperties === 0) {
      if (!groups.canAddProperty("ADBE Text Animator")) throw missingAnimator("Text animator unavailable");
      groups.addProperty("ADBE Text Animator");
      var animator = animators(layer).property(1), props = animator.property("ADBE Text Animator Properties");
      animator.name = ANIMATOR_NAME;
      if (!props || !props.canAddProperty || !props.canAddProperty("ADBE Text Scale 3D")) throw missingAnimator("Text animator scale unavailable");
      props.addProperty("ADBE Text Scale 3D");
      animator = animators(layer).property(1);
      var selectors = animator.property("ADBE Text Selectors");
      while (selectors.numProperties > 0) selectors.property(selectors.numProperties).remove();
      if (!selectors.canAddProperty || !selectors.canAddProperty("ADBE Text Expressible Selector")) throw missingAnimator("Expression selector unavailable");
      selectors.addProperty("ADBE Text Expressible Selector");
      animator = animators(layer).property(1);
      var selector = animator.property("ADBE Text Selectors").property(1);
      selector.name = SELECTOR_NAME;
      if (!selector.property("ADBE Text Range Type2") || !selector.property("ADBE Text Expressible Amount")) throw missingAnimator("Expression selector parameters unavailable");
      selector.property("ADBE Text Range Type2").setValue(1);
    }
    var more = layer.property("ADBE Text Properties").property("ADBE Text More Options");
    more.property("ADBE Text Anchor Point Option").setValue(1);
    more.property("ADBE Text Anchor Point Align").setValue([0, -50]);
  }
  /** @param {any} layer @param {string} role @param {any} meta @returns {void} */
  function configureEchoExpressions(layer, role, meta) {
    configureAnimator(layer);
    if (role === "glow") {
      if (effects(layer).numProperties === 1) effects(layer).addProperty("ADBE Glo2");
      var effect = effects(layer).property(1), nativeGlow = effects(layer).property(2);
      var amount = effect.property("ADBE Gaussian Blur 2-0001");
      if (!amount) throw new Error("Gaussian Blur amount unavailable");
      if (!nativeGlow || nativeGlow.matchName !== "ADBE Glo2" || !nativeGlow.property("ADBE Glo2-0003") ||
          !nativeGlow.property("ADBE Glo2-0004") || !nativeGlow.property("ADBE Glo2-0007")) {
        var missingGlow = /** @type {any} */ (new Error("Native Glow parameters unavailable"));
        missingGlow.motionCode = MotionContracts.ERROR.CAPABILITY_UNAVAILABLE;
        throw missingGlow;
      }
      nativeGlow.property("ADBE Glo2-0007").setValue(1);
    } else {
      effect = effects(layer).property(1);
      var mode = effect.property("ADBE Turbulent Displace-0001");
      var strength = effect.property("ADBE Turbulent Displace-0002");
      var size = effect.property("ADBE Turbulent Displace-0003");
      var evolution = effect.property("ADBE Turbulent Displace-0006");
      var seed = effect.property("ADBE Turbulent Displace-0010");
      if (!mode || !strength || !size || !evolution || !seed) throw new Error("Turbulent Displace parameters unavailable");
      mode.setValue(9);
      size.setValue(role === "core" ? 10 : 6);
      seed.setValue(1);
    }
    var managed = expressionProperties(layer, role, 3), templates = echoExpressionTemplates(role, meta);
    for (var check = 0; check < managed.length; check += 1) if (!managed[check] || managed[check].canSetExpression === false)
      throw missingAnimator("Managed pulse expression property unavailable");
    for (var p = 0; p < managed.length; p += 1) managed[p].expression = templates[p];
    for (var i = 0; i < managed.length; i += 1) if (managed[i].expressionError) throw new Error("Pulse expression could not be applied");
  }
  /** @param {any} layer @param {string} role @param {any} meta @returns {void} */
  function configureEcho(layer, role, meta) {
    layer.parent = meta.source;
    var sourceText = textProperty(layer);
    if (sourceText.expression) { sourceText.expressionEnabled = false; sourceText.expression = ""; }
    while (sourceText.numKeys > 0) sourceText.removeKey(sourceText.numKeys);
    sourceText.setValue(textProperty(meta.source).value);
    resetProperty(layer, "ADBE Anchor Point", [0, 0]);
    resetProperty(layer, "ADBE Position", [0, 0]);
    resetProperty(layer, "ADBE Scale", [100, 100]);
    resetProperty(layer, "ADBE Rotate Z", 0);
    resetProperty(layer, "ADBE Opacity", 100);
    effects(layer).addProperty(role === "glow" ? "ADBE Gaussian Blur 2" : "ADBE Turbulent Displace");
    configureEchoExpressions(layer, role, meta);
  }
  /** @param {any} comp @param {any} layer @param {string} role @param {number} version @returns {any} */
  function snapshotEcho(comp, layer, role, version) {
    var paths = expressionPaths(role, version), saved = [], i;
    for (i = 0; i < paths.length; i += 1) {
      var prop = resolveProperty(layer, paths[i]);
      saved.push({ path: paths[i], expression: String(prop.expression || ""), enabled: prop.expressionEnabled, restoreValue: false });
    }
    if (role !== "glow") {
      var staticNames = ["ADBE Turbulent Displace-0001", "ADBE Turbulent Displace-0003", "ADBE Turbulent Displace-0010"];
      for (i = 0; i < staticNames.length; i += 1) {
        var path = ["ADBE Effect Parade", 1, staticNames[i]], staticProp = resolveProperty(layer, path);
        saved.push({ path: path, expression: String(staticProp.expression || ""), enabled: staticProp.expressionEnabled, restoreValue: true, value: staticProp.value });
      }
    } else if (version >= 2) {
      var colorsPath = ["ADBE Effect Parade", 2, "ADBE Glo2-0007"], colors = resolveProperty(layer, colorsPath);
      saved.push({ path: colorsPath, expression: String(colors.expression || ""), enabled: colors.expressionEnabled, restoreValue: true, value: colors.value });
    }
    var moreNames = ["ADBE Text Anchor Point Option", "ADBE Text Anchor Point Align"];
    for (i = 0; i < moreNames.length; i += 1) {
      var morePath = ["ADBE Text Properties", "ADBE Text More Options", moreNames[i]], moreProp = resolveProperty(layer, morePath);
      saved.push({ path: morePath, expression: String(moreProp.expression || ""), enabled: moreProp.expressionEnabled, restoreValue: true, value: moreProp.value });
    }
    return { layer: layer, comment: String(layer.comment || ""), effectCount: effects(layer).numProperties, properties: saved,
      animatorCount: animators(layer).numProperties, restoreOrder: role === "edge" && version === 1,
      index: layer.index, nextLayer: layer.index < comp.numLayers ? comp.layer(layer.index + 1) : null };
  }
  /** @param {any} saved @returns {void} */
  function restoreEcho(saved) {
    while (effects(saved.layer).numProperties > saved.effectCount) effects(saved.layer).property(effects(saved.layer).numProperties).remove();
    while (animators(saved.layer).numProperties > saved.animatorCount) animators(saved.layer).property(animators(saved.layer).numProperties).remove();
    for (var i = 0; i < saved.properties.length; i += 1) {
      var state = saved.properties[i], prop = resolveProperty(saved.layer, state.path);
      if (!prop) throw new Error("Pulse rollback property unavailable");
      if (state.restoreValue) prop.setValue(state.value);
      if (prop.canSetExpression !== false) {
        prop.expression = state.expression;
        prop.expressionEnabled = state.enabled;
      }
    }
    saved.layer.comment = saved.comment;
    if (saved.restoreOrder && saved.layer.index !== saved.index) {
      if (saved.nextLayer) saved.layer.moveBefore(saved.nextLayer);
      else saved.layer.moveToEnd();
    }
  }
  /** @param {any} comp @param {any[]} saved @param {any[]} properties @returns {void} */
  function restoreSelection(comp, saved, properties) {
    for (var i = 1; i <= comp.numLayers; i += 1) comp.layer(i).selected = false;
    for (i = 0; i < saved.length; i += 1) if (saved[i]) saved[i].selected = true;
    for (i = 0; i < properties.length; i += 1) try { properties[i].selected = true; } catch (missingProperty) { /* Removed managed properties cannot remain selected. */ }
  }
  /** @param {any} args @returns {{changed:boolean,data:Record<string,unknown>,warnings:any[]}} */
  function run(args) {
    var plan = prepare(args);
    if (plan.error) throw new Error("Pulse context changed after preflight");
    var comp = plan.comp, source = plan.source, meta = plan.meta, key, i;
    var selected = [], selectedProperties = [], originalTime = comp.time;
    for (i = 0; i < comp.selectedLayers.length; i += 1) selected.push(comp.selectedLayers[i]);
    for (i = 0; comp.selectedProperties && i < comp.selectedProperties.length; i += 1) selectedProperties.push(comp.selectedProperties[i]);
    if (args.action === "remove") {
      try {
        for (i = 0; i < ROLES.length; i += 1) plan.echoes[String(ROLES[i])].remove();
        for (key in CONTROL) if (Object.prototype.hasOwnProperty.call(CONTROL, key) && hasControl(key, meta.version)) control(source, controlName(key)).remove();
        source.enabled = meta.originalEnabled;
        source.comment = stripMeta(String(source.comment || ""));
        comp.time = originalTime; restoreSelection(comp, [source], selectedProperties);
      } catch (removeError) {
        var partial = /** @type {any} */ (new Error("Pulse removal could not be rolled back; use Undo"));
        partial.motionCode = MotionContracts.ERROR.ROLLBACK_FAILED;
        throw partial;
      }
      return { changed: true, data: { appliedCount: 1, createdCount: 0, updatedCount: 0, removedCount: 3, cycleFrames: 0, echoLayersPerText: 3 }, warnings: [] };
    }
    if (meta) {
      var old = /** @type {Record<string,any>} */ ({}), oldVersion = meta.version, migrate = meta.version < 3, changed = migrate;
      var oldSourceComment = String(source.comment || ""), oldEchoes = [];
      if (migrate) for (i = 0; i < ROLES.length; i += 1) oldEchoes.push(snapshotEcho(comp, plan.echoes[String(ROLES[i])], String(ROLES[i]), oldVersion));
      for (key in CONTROL) if (Object.prototype.hasOwnProperty.call(CONTROL, key) && hasControl(key, oldVersion)) {
        var prop = controlValue(source, key), next = argumentValue(args, key);
        old[key] = prop.value;
        if (key === "durationFrames" || key === "seed" || key === "animationMode" ? old[key] !== next : !sameValue(old[key], next)) changed = true;
      }
      if (!changed) return { changed: false, data: { appliedCount: 0, createdCount: 0, updatedCount: 0, removedCount: 0, cycleFrames: args.durationFrames, echoLayersPerText: 3 }, warnings: [] };
      try {
        if (migrate) {
          addControl(source, "animationMode", argumentValue(args, "animationMode"));
          addControl(source, "waveSpread", argumentValue(args, "waveSpread"));
        }
        for (key in CONTROL) if (Object.prototype.hasOwnProperty.call(CONTROL, key))
          controlValue(source, key).setValue(argumentValue(args, key));
        if (migrate) {
          if (oldVersion === 1) plan.echoes.edge.moveBefore(plan.echoes.glow);
          for (i = 0; i < ROLES.length; i += 1) {
            var ownedRole = String(ROLES[i]), ownedEcho = plan.echoes[ownedRole], ownedMeta = readMeta(ownedEcho);
            configureEchoExpressions(ownedEcho, ownedRole, { start: meta.start });
            ownedMeta.version = 3; writeMeta(ownedEcho, ownedMeta);
          }
          meta.version = 3; writeMeta(source, meta);
        }
        comp.time = originalTime; restoreSelection(comp, selected, selectedProperties);
      } catch (updateError) {
        try {
          if (migrate) for (key in CONTROL) if (Object.prototype.hasOwnProperty.call(CONTROL, key) && !hasControl(key, oldVersion)) {
            var newControl = control(source, controlName(key)); if (newControl) newControl.remove();
          }
          for (key in old) if (Object.prototype.hasOwnProperty.call(old, key)) controlValue(source, key).setValue(old[key]);
          for (i = 0; i < oldEchoes.length; i += 1) restoreEcho(oldEchoes[i]);
          source.comment = oldSourceComment; comp.time = originalTime; restoreSelection(comp, selected, selectedProperties);
        }
        catch (rollbackError) { var failed = /** @type {any} */ (new Error("Pulse update rollback failed")); failed.motionCode = MotionContracts.ERROR.ROLLBACK_FAILED; throw failed; }
        throw updateError;
      }
      return { changed: true, data: { appliedCount: 1, createdCount: 0, updatedCount: 1, removedCount: 0, cycleFrames: args.durationFrames, echoLayersPerText: 3 }, warnings: [] };
    }
    var originalComment = String(source.comment || ""), originalEnabled = source.enabled, created = [];
    var rig = { version: 3, type: ID, rigId: String(new Date().getTime()) + "-" + String(source.id),
      sourceId: source.id, role: "source", originalEnabled: originalEnabled, start: originalTime };
    try {
      for (i = 0; i < ROLES.length; i += 1) created.push(source.duplicate());
      addControl(source, "durationFrames", args.durationFrames);
      addControl(source, "peakScalePercent", args.peakScalePercent);
      addControl(source, "distortion", args.distortion);
      addControl(source, "glow", args.glow);
      addControl(source, "seed", args.seed);
      addControl(source, "accentColor", [args.accentColor[0], args.accentColor[1], args.accentColor[2], 1]);
      addControl(source, "animationMode", argumentValue(args, "animationMode"));
      addControl(source, "waveSpread", argumentValue(args, "waveSpread"));
      for (i = 0; i < ROLES.length; i += 1) {
        var role = String(ROLES[i]), echo = created[i];
        echo.name = "Moti.on Pulse · " + role + " · " + source.name;
        configureEcho(echo, role, { source: source, start: originalTime });
        writeMeta(echo, { version: 3, type: ID, rigId: rig.rigId, sourceId: source.id, role: role });
      }
      created[2].moveBefore(created[1]);
      writeMeta(source, rig);
      source.enabled = false;
      comp.time = originalTime; restoreSelection(comp, selected, selectedProperties);
      return { changed: true, data: { appliedCount: 1, createdCount: 3, updatedCount: 0, removedCount: 0, cycleFrames: args.durationFrames, echoLayersPerText: 3 }, warnings: [] };
    } catch (createError) {
      var rollbackFailed = false;
      for (i = created.length - 1; i >= 0; i -= 1) try { created[i].remove(); } catch (removeError) { rollbackFailed = true; }
      for (key in CONTROL) if (Object.prototype.hasOwnProperty.call(CONTROL, key)) {
        try { var added = control(source, controlName(key)); if (added) added.remove(); } catch (controlError) { rollbackFailed = true; }
      }
      try { source.comment = originalComment; source.enabled = originalEnabled; comp.time = originalTime; restoreSelection(comp, selected, selectedProperties); }
      catch (restoreError) { rollbackFailed = true; }
      if (rollbackFailed) { var error = /** @type {any} */ (new Error("Pulse creation rollback failed")); error.motionCode = MotionContracts.ERROR.ROLLBACK_FAILED; throw error; }
      throw createError;
    }
  }
  /** The morph module wraps this handler without registering the command twice. */
  (/** @type {any} */ ($.global)).MotionVerticalPulseLegacy = {
    prepare: prepare, run: run, readMeta: readMeta, stripMeta: stripMeta,
    writeMeta: writeMeta, inspectRig: inspectRig, controls: CONTROL, controlValue: controlValue,
    argumentValue: argumentValue, snapshotEcho: snapshotEcho, restoreEcho: restoreEcho,
    hasControl: hasControl, roles: ROLES
  };
  MotionRegistry.register("ae.text.vertical-pulse", { preflight: function (args) { return prepare(args).error; }, run: run });
}());
