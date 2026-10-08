/**
 * Two editable text styles, aligned on generated copies. Originals retain
 * their text, styling, transforms, timing and animation; only visibility and
 * a namespaced comment block change until Remove. The dispatcher owns Undo.
 */
(function () {
  var OPEN = "\n[MOTION_STYLE_SWAP_V1]";
  var CLOSE = "[/MOTION_STYLE_SWAP_V1]";
  var HEADER = "// MOTION_STYLE_SWAP v1\n";
  var PROGRESS = "Moti.on Swap - Progress";
  var DURATION = "Moti.on Swap - Duration";
  var STAGGER = "Moti.on Swap - Stagger";
  var AUTOMATIC = "Moti.on Swap - Automatic";
  var FOLLOW = "Moti.on Swap - Follow Null";
  var REFERENCE = "Moti.on Swap - Text";
  var LINK = "Moti.on Swap - Controller";
  var MORPH = "Moti.on Swap - Morph";
  var BLEND_WIDTH = "Moti.on Swap - Blend Width";
  var MORPH_HEADER = "// MOTION_STYLE_SWAP v4 morph\n";
  var CONVERGE_HEADER = "// MOTION_STYLE_SWAP v4 converge\n";
  var TRANSFORMS = ["ADBE Anchor Point", "ADBE Position", "ADBE Scale", "ADBE Rotate Z"];

  /** @param {string} code @param {string} message @returns {MotionCommandFailure} */
  function failure(code, message) { return {code: code, message: message, recoverable: true, details: null}; }
  /** @param {string} code @param {string} message @returns {Error & {motionCode?: string}} */
  function error(code, message) {
    var e = /** @type {Error & {motionCode?: string}} */ (new Error(message));
    e.motionCode = code;
    return e;
  }
  /** @param {unknown} value @param {number} min @param {number} max @returns {boolean} */
  function integer(value, min, max) { return typeof value === "number" && isFinite(value) && Math.floor(value) === value && value >= min && value <= max; }
  /** @param {any} layer @returns {any} */
  function meta(layer) {
    var text = String(layer.comment || "");
    var a = text.indexOf(OPEN);
    var b = text.indexOf(CLOSE, a + OPEN.length);
    if (a < 0 || b < 0) return null;
    try { return MotionJson.parse(text.substring(a + OPEN.length, b)); } catch (e) { return null; }
  }
  /** @param {any} layer @param {any} data @returns {void} */
  function tag(layer, data) { layer.comment = cleanComment(layer.comment) + OPEN + MotionJson.stringify(data) + CLOSE; }
  /** @param {unknown} value @returns {string} */
  function cleanComment(value) {
    var text = String(value || "");
    var a = text.indexOf(OPEN);
    var b = text.indexOf(CLOSE, a + OPEN.length);
    return a < 0 || b < 0 ? text : text.substring(0, a) + text.substring(b + CLOSE.length);
  }
  /** @param {any} layer @returns {any} */
  function animators(layer) { var text = layer.property("ADBE Text Properties"); return text ? text.property("ADBE Text Animators") : null; }
  /** @param {any} layer @param {string} name @returns {any} */
  function control(layer, name) {
    var effects = layer.property("ADBE Effect Parade");
    for (var i = 1; effects && i <= effects.numProperties; i += 1) {
      var effect = effects.property(i);
      if (effect.name === name) return effect.property(1);
    }
    return null;
  }
  /** @param {any} layer @param {string} name @param {string} matchName @param {number} value @returns {void} */
  function addControl(layer, name, matchName, value) {
    var effects = layer.property("ADBE Effect Parade");
    if (!effects || !effects.canAddProperty(matchName)) throw error(MotionContracts.ERROR.CAPABILITY_UNAVAILABLE, "O After Effects nao disponibilizou os controles nativos de expressao.");
    var item = effects.addProperty(matchName);
    item.name = name;
    item.property(1).setValue(value);
  }
  /** @param {any} property @param {string} source @returns {void} */
  function expression(property, source) {
    if (!property || !property.canSetExpression) throw error(MotionContracts.ERROR.CAPABILITY_UNAVAILABLE, "O seletor de texto nao aceita expressoes nesta versao.");
    property.expression = source;
    property.expressionEnabled = true;
    if (property.expressionError || property.expressionEnabled !== true) throw error(MotionContracts.ERROR.HOST_OPERATION_FAILED, "O After Effects recusou a expressao da troca de estilos.");
  }
  /** @param {number} start @param {number} count @param {boolean} [manualControl] @param {boolean} [followNull] @returns {string} */
  function progressExpression(start, count, manualControl, followNull) {
    var timed = (manualControl ? "var automatic = effect(\"" + AUTOMATIC + "\")(1);\n" : "") + "var d = Math.max(1, effect(\"" + DURATION + "\")(1));\n" +
      "var s = Math.max(0, effect(\"" + STAGGER + "\")(1));\n" +
      "var seconds = (d + s * " + (count - 1) + ") * thisComp.frameDuration;\n" +
      (manualControl ? "automatic == 0 || " : "") + "numKeys > 0 ? value : 100 * Math.max(0, Math.min(1, (time - " + start + ") / seconds));";
    if (!followNull) return HEADER + timed;
    return HEADER + "if (effect(\"" + FOLLOW + "\")(1) == 1) {\n" +
      "var l=effect(\"" + REFERENCE + "\")(1),b=l.sourceRectAtTime(time,false);\n" +
      "var p=l.fromComp(toComp(anchorPoint));\n" +
      "100*Math.max(0,Math.min(1,(p[0]-b.left)/Math.max(0.001,b.width)));\n" +
      "} else {\n" + timed + "\n}";
  }
  /** @param {string} role @param {string} linkName @param {boolean} [followNull] @param {boolean} [morph] @returns {string} */
  function amountExpression(role, linkName, followNull, morph) {
    return HEADER + "var c = effect(" + MotionJson.stringify(linkName) + ")(1);\n" +
      "var d = Math.max(1, c.effect(\"" + DURATION + "\")(1));\n" +
      "var s = Math.max(0, c.effect(\"" + STAGGER + "\")(1));\n" +
      "var p = Math.max(0, Math.min(100, c.effect(\"" + PROGRESS + "\")(1))) / 100;\n" +
      "var u = Math.max(0, Math.min(1, (p * (d + s * (textTotal - 1)) - s * (textIndex - 1)) / d));\n" +
      (followNull ? (morph ?
        "if(c.effect(\"" + FOLLOW + "\")(1) == 1) { var w=Math.max(1,Math.min(6,c.effect(\"" + BLEND_WIDTH + "\")(1))); u=Math.max(0,Math.min(1,(p*(textTotal-1+w)-(textIndex-1))/w)); }\n" :
        "if(c.effect(\"" + FOLLOW + "\")(1) == 1) u=Math.max(0,Math.min(1,p*textTotal-(textIndex-1)));\n") : "") +
      "var f = u * u * (3 - 2 * u);\n" + (role === "from" ? "100 * f;" : "100 * (1 - f);");
  }
  /** @param {string} role @param {string} linkName @param {any} model @param {boolean} convergence @returns {string} */
  function morphExpression(role, linkName, model, convergence) {
    var opacity = amountExpression(role, linkName, true, true);
    var body = opacity.substring(HEADER.length, opacity.lastIndexOf("\n") + 1);
    var envelope = "var m=Math.max(0,Math.min(2,c.effect(\"" + MORPH + "\")(1)/100));\nvar bell=16*u*u*(1-u)*(1-u);\n";
    if (!convergence) return MORPH_HEADER + body + envelope + "100*bell*m;";
    return CONVERGE_HEADER + body + envelope + "var q=(textIndex-0.5)/Math.max(1,textTotal);\n" +
      "var a=" + MotionJson.stringify(model.start) + ",b=" + MotionJson.stringify(model.end) + ";\n" +
      "[bell*m*(a[0]+(b[0]-a[0])*q),bell*m*(a[1]+(b[1]-a[1])*q),0];";
  }
  /** @param {any} layer @param {string} [kind] @returns {any} */
  function selector(layer, kind) {
    var prefix = kind === "morph" ? MORPH_HEADER : kind === "converge" ? CONVERGE_HEADER : HEADER;
    var groups = animators(layer);
    for (var i = 1; groups && i <= groups.numProperties; i += 1) {
      var animator = groups.property(i);
      var selectors = animator.property("ADBE Text Selectors");
      for (var j = 1; selectors && j <= selectors.numProperties; j += 1) {
        var item = selectors.property(j);
        var amount = item.property("ADBE Text Expressible Amount");
        if (amount && String(amount.expression).indexOf(prefix) === 0) return item;
      }
    }
    return null;
  }
  /** @param {any} layer @param {any} controller @param {string} role @param {string} unit @param {string} linkName @returns {void} */
  function addAnimator(layer, controller, role, unit, linkName) {
    addControl(layer, linkName, "ADBE Layer Control", controller.index);
    var groups = animators(layer);
    var animator = groups.addProperty("ADBE Text Animator");
    var index = animator.propertyIndex;
    animator.name = "Moti.on - Troca de estilos";
    animator.property("ADBE Text Animator Properties").addProperty("ADBE Text Opacity");
    animator = groups.property(index);
    animator.property("ADBE Text Animator Properties").property("ADBE Text Opacity").setValue(0);
    var selectors = animator.property("ADBE Text Selectors");
    // Remove an automatically supplied Range Selector, when the host adds one.
    while (selectors.numProperties > 0) selectors.property(selectors.numProperties).remove();
    var item = selectors.addProperty("ADBE Text Expressible Selector");
    item.name = "Moti.on - Sequencia";
    item.property("ADBE Text Range Type2").setValue(unit === "words" ? 3 : 1);
    expression(item.property("ADBE Text Expressible Amount"), amountExpression(role, linkName, true, true));
  }
  /** @param {any} layer @param {string} role @param {string} unit @param {string} linkName @param {any} model @param {boolean} convergence @param {any[]} added @returns {void} */
  function addMorphAnimator(layer, role, unit, linkName, model, convergence, added) {
    var groups = animators(layer);
    var animator = groups.addProperty("ADBE Text Animator");
    var index = animator.propertyIndex;
    added.push({layer: layer, index: index});
    animator.name = convergence ? "Moti.on - Convergencia" : "Moti.on - Morfismo liquido";
    var names = convergence ? ["ADBE Text Position 3D"] : ["ADBE Text Blur", "ADBE Text Scale 3D"];
    var values = convergence ? [[100, 100, 0]] : [model.blur, [68, 118, 100]];
    for (var i = 0; i < names.length; i += 1) {
      var properties = groups.property(index).property("ADBE Text Animator Properties");
      if (!properties.canAddProperty(names[i])) throw error(MotionContracts.ERROR.CAPABILITY_UNAVAILABLE, "Esta versao nao disponibiliza o desfoque e a deformacao de texto necessarios ao morfismo.");
      properties.addProperty(names[i]);
      groups.property(index).property("ADBE Text Animator Properties").property(names[i]).setValue(values[i]);
    }
    var selectors = groups.property(index).property("ADBE Text Selectors");
    while (selectors.numProperties > 0) selectors.property(selectors.numProperties).remove();
    var item = selectors.addProperty("ADBE Text Expressible Selector");
    item.name = convergence ? "Moti.on - Uniao" : "Moti.on - Dissolver e formar";
    item.property("ADBE Text Range Type2").setValue(unit === "words" ? 3 : 1);
    expression(item.property("ADBE Text Expressible Amount"), morphExpression(role, linkName, model, convergence));
  }
  /** @param {any} layer @param {number} time @param {number} [fraction] @returns {[number, number]} */
  function center(layer, time, fraction) {
    var rect = layer.sourceRectAtTime(time, false);
    var transform = layer.property("ADBE Transform Group");
    var anchor = transform.property("ADBE Anchor Point").value;
    var scale = transform.property("ADBE Scale").value;
    var position = transform.property("ADBE Position").value;
    var angle = transform.property("ADBE Rotate Z").value * Math.PI / 180;
    var x = (rect.left + rect.width * (typeof fraction === "number" ? fraction : 0.5) - anchor[0]) * scale[0] / 100;
    var y = (rect.top + rect.height / 2 - anchor[1]) * scale[1] / 100;
    return [position[0] + x * Math.cos(angle) - y * Math.sin(angle), position[1] + x * Math.sin(angle) + y * Math.cos(angle)];
  }
  /** @param {any} layer @param {[number, number]} delta @returns {[number, number]} */
  function localVector(layer, delta) {
    var transform = layer.property("ADBE Transform Group");
    var scale = transform.property("ADBE Scale").value;
    var angle = transform.property("ADBE Rotate Z").value * Math.PI / 180;
    var x = delta[0] * Math.cos(angle) + delta[1] * Math.sin(angle);
    var y = -delta[0] * Math.sin(angle) + delta[1] * Math.cos(angle);
    return [Math.abs(scale[0]) < 0.001 ? 0 : x * 100 / scale[0], Math.abs(scale[1]) < 0.001 ? 0 : y * 100 / scale[1]];
  }
  /** @param {any} layer @param {any} other @param {number} time @returns {any} */
  function morphModel(layer, other, time) {
    var document = layer.property("ADBE Text Properties").property("ADBE Text Document").value;
    var otherDocument = other.property("ADBE Text Properties").property("ADBE Text Document").value;
    var size = Math.max(8, Number(document.fontSize) || 48);
    var model = {blur: [Math.min(64, size * 0.14), Math.min(48, size * 0.10)], start: [0, 0], end: [0, 0]};
    // A normalized run aligns differing widths at the liquid midpoint. Multiline
    // text keeps its line layout; it still receives the local blur/deformation.
    if (!/[\r\n]/.test(String(document.text) + String(otherDocument.text))) {
      var a = center(layer, time, 0), b = center(other, time, 0);
      model.start = localVector(layer, [(b[0] - a[0]) / 2, (b[1] - a[1]) / 2]);
      a = center(layer, time, 1); b = center(other, time, 1);
      model.end = localVector(layer, [(b[0] - a[0]) / 2, (b[1] - a[1]) / 2]);
    }
    return model;
  }
  /** @param {any} model @returns {boolean} */
  function validMorphModel(model) {
    if (!model) return false;
    var names = ["blur", "start", "end"];
    for (var i = 0; i < names.length; i += 1) {
      var v = model[String(names[i])];
      if (!v || v.length !== 2 || typeof v[0] !== "number" || typeof v[1] !== "number" || !isFinite(v[0]) || !isFinite(v[1])) return false;
    }
    return model.blur[0] >= 0 && model.blur[0] <= 64 && model.blur[1] >= 0 && model.blur[1] <= 48;
  }
  /** @param {any} layer @param {string} kind @returns {any} */
  function morphProperties(layer, kind) {
    var groups = animators(layer), prefix = kind === "morph" ? MORPH_HEADER : CONVERGE_HEADER;
    for (var i = 1; groups && i <= groups.numProperties; i += 1) {
      var animator = groups.property(i), selectors = animator.property("ADBE Text Selectors");
      for (var j = 1; selectors && j <= selectors.numProperties; j += 1) {
        var amount = selectors.property(j).property("ADBE Text Expressible Amount");
        if (amount && String(amount.expression).indexOf(prefix) === 0) return animator.property("ADBE Text Animator Properties");
      }
    }
    return null;
  }
  /** @param {any} property @param {any} expected @returns {boolean} */
  function untouched(property, expected) {
    if (!property || property.numKeys || property.expression) return false;
    var actual = property.value;
    if (actual && expected && typeof actual.length === "number" && typeof expected.length === "number") {
      if (actual.length !== expected.length) return false;
      // Native text animator values are stored as floats. Ownership checks must
      // allow their rounding without treating it as a user's manual change.
      for (var i = 0; i < actual.length; i += 1) if (!isFinite(actual[i]) || Math.abs(actual[i] - expected[i]) > .00001 * Math.max(1, Math.abs(expected[i]))) return false;
      return true;
    }
    return actual === expected;
  }
  /** @param {any} layer @param {unknown} unit @returns {number} */
  function unitCount(layer, unit) {
    var text = String(layer.property("ADBE Text Properties").property("ADBE Text Document").value.text);
    return unit === "words" ? (text.match(/\S+/g) || []).length : text.replace(/[\r\n]/g, "").length;
  }
  /** @param {any} comp @param {string} id @returns {any} */
  function findRig(comp, id) {
    var found = /** @type {any} */ ({id: id, from: null, to: null, sourceFrom: null, sourceTo: null, controller: null});
    for (var i = 1; i <= comp.numLayers; i += 1) {
      var layer = comp.layer(i);
      var data = meta(layer);
      if (!data || data.id !== id) continue;
      if (data.role !== "from" && data.role !== "to" && data.role !== "sourceFrom" && data.role !== "sourceTo" && data.role !== "controller") return null;
      if (found[data.role]) return null;
      found[data.role] = layer;
    }
    return found;
  }
  /** @param {Record<string, unknown>} args @returns {any} */
  function prepare(args) {
    var allowed = {action: true, durationFrames: true, staggerFrames: true, unit: true};
    for (var key in args) if (Object.prototype.hasOwnProperty.call(args, key) && !Object.prototype.hasOwnProperty.call(allowed, key)) return {error: failure(MotionContracts.ERROR.INVALID_PRESET, "Argumento de troca de estilos desconhecido.")};
    if ((args.action !== "apply" && args.action !== "remove") || !integer(args.durationFrames, 1, 300) || !integer(args.staggerFrames, 0, 60) || (args.unit !== "characters" && args.unit !== "words")) return {error: failure(MotionContracts.ERROR.INVALID_PRESET, "Configuracao de troca de estilos invalida.")};
    if (!app.project) return {error: failure(MotionContracts.ERROR.NO_ACTIVE_PROJECT, "Abra um projeto.")};
    var comp = /** @type {any} */ (app.project.activeItem);
    if (!comp || !(comp instanceof CompItem)) return {error: failure(MotionContracts.ERROR.NO_ACTIVE_COMP, "Abra uma composicao.")};
    var selected = /** @type {any[]} */ (comp.selectedLayers);
    if (!selected.length) return {error: failure(MotionContracts.ERROR.NO_SELECTION, "Selecione dois textos ou uma camada da troca de estilos.")};
    var id = null;
    for (var i = 0; i < selected.length; i += 1) {
      var data = meta(selected[i]);
      if (data) {
        if (id && id !== data.id) return {error: failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Selecione somente um rig de troca de estilos.")};
        id = data.id;
      }
    }
    if (id) {
      for (i = 0; i < selected.length; i += 1) if (!meta(selected[i])) return {error: failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "A selecao mistura uma troca de estilos e camadas externas.")};
      var rig = findRig(comp, id);
      if (!rig || !rig.from || !rig.to || !rig.sourceFrom || !rig.sourceTo || !rig.controller) return {error: failure(MotionContracts.ERROR.TRACK_CONFLICT, "A troca de estilos esta incompleta ou duplicada. Desfaca a alteracao do rig antes de continuar.")};
      var roles = [rig.from, rig.to, rig.sourceFrom, rig.sourceTo, rig.controller];
      for (i = 0; i < roles.length; i += 1) if (roles[i].locked) return {error: failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Desbloqueie as camadas da troca de estilos.")};
      var md = meta(rig.controller);
      if (typeof md.start !== "number" || !isFinite(md.start) || !integer(md.count, 1, 500) || typeof meta(rig.sourceFrom).enabled !== "boolean" || typeof meta(rig.sourceTo).enabled !== "boolean") return {error: failure(MotionContracts.ERROR.TRACK_CONFLICT, "A metadata da troca de estilos foi modificada.")};
      if (!selector(rig.from) || !selector(rig.to) || !control(rig.controller, PROGRESS) || !control(rig.controller, DURATION) || !control(rig.controller, STAGGER)) return {error: failure(MotionContracts.ERROR.TRACK_CONFLICT, "Um controle gerenciado foi removido ou substituido.")};
      if (md.controlsVersion >= 2 && !control(rig.controller, AUTOMATIC) || md.controlsVersion >= 3 && (!control(rig.controller, FOLLOW) || !control(rig.controller, REFERENCE) || control(rig.controller, REFERENCE).value !== rig.sourceFrom.index)) return {error: failure(MotionContracts.ERROR.TRACK_CONFLICT, "Um controle gerenciado foi removido ou substituido.")};
      if (md.controlsVersion >= 4 && (!control(rig.controller, MORPH) || !control(rig.controller, BLEND_WIDTH))) return {error: failure(MotionContracts.ERROR.TRACK_CONFLICT, "Um controle do morfismo foi removido.")};
      if (args.action === "apply") {
        if (control(rig.controller, DURATION).numKeys || control(rig.controller, STAGGER).numKeys || control(rig.controller, DURATION).expression || control(rig.controller, STAGGER).expression) return {error: failure(MotionContracts.ERROR.KEYFRAME_CONFLICT, "Duracao ou intervalo contem animacao manual; ajuste esses controles na timeline.")};
        if (control(rig.controller, PROGRESS).expression !== progressExpression(md.start, md.count, md.controlsVersion >= 2, md.controlsVersion >= 3)) return {error: failure(MotionContracts.ERROR.EXPRESSION_CONFLICT, "A expressao de progresso foi personalizada; ajuste o rig na timeline.")};
        var countA = unitCount(rig.from, args.unit);
        var countB = unitCount(rig.to, args.unit);
        if (countA !== countB || countA < 1 || countA > 500) return {error: failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "As copias devem ter o mesmo numero de caracteres ou palavras na unidade escolhida.")};
        var generated = [rig.from, rig.to];
        for (var g = 0; g < generated.length; g += 1) {
          var gm = meta(generated[g]);
          var gs = selector(generated[g]);
          if (!control(generated[g], gm.link) || gs.property("ADBE Text Expressible Amount").expression !== amountExpression(gm.role, gm.link, md.controlsVersion >= 3, md.controlsVersion >= 4) || gs.property("ADBE Text Expressible Amount").numKeys || gs.property("ADBE Text Range Type2").numKeys) return {error: failure(MotionContracts.ERROR.EXPRESSION_CONFLICT, "O seletor ou vinculo da troca foi personalizado; ajuste o rig na timeline.")};
          if (md.controlsVersion >= 4) {
            if (!validMorphModel(gm.model)) return {error: failure(MotionContracts.ERROR.TRACK_CONFLICT, "A geometria do morfismo foi modificada.")};
            var kinds = ["morph", "converge"];
            for (var ki = 0; ki < kinds.length; ki += 1) {
              var ms = selector(generated[g], String(kinds[ki])), mp = morphProperties(generated[g], String(kinds[ki]));
              if (!ms || !mp || ms.property("ADBE Text Expressible Amount").numKeys || ms.property("ADBE Text Range Type2").numKeys || ms.property("ADBE Text Expressible Amount").expression !== morphExpression(gm.role, gm.link, gm.model, ki === 1) || (ki === 0 ? !untouched(mp.property("ADBE Text Blur"), gm.model.blur) || !untouched(mp.property("ADBE Text Scale 3D"), [68, 118, 100]) : !untouched(mp.property("ADBE Text Position 3D"), [100, 100, 0]))) return {error: failure(MotionContracts.ERROR.EXPRESSION_CONFLICT, "O morfismo foi personalizado; ajuste os controles na timeline.")};
            }
          }
          var sourceText = generated[g].property("ADBE Text Properties").property("ADBE Text Document");
          if (sourceText.numKeys || sourceText.expression) return {error: failure(MotionContracts.ERROR.KEYFRAME_CONFLICT, "O texto das copias esta animado; ajuste o rig na timeline.")};
        }
        var end = md.start + (Number(args.durationFrames) + (countA - 1) * Number(args.staggerFrames)) * comp.frameDuration;
        var timedMode = md.controlsVersion < 3 || !md.controlsVersion || control(rig.controller, FOLLOW).value === 0 && control(rig.controller, AUTOMATIC).value === 1;
        if (timedMode && end > Math.min(rig.from.outPoint, rig.to.outPoint) + 0.00001) return {error: failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "O novo tempo ultrapassa a duracao das copias; estenda as camadas antes de ajustar.")};
      }
      for (i = 1; i <= comp.numLayers; i += 1) {
        var other = comp.layer(i);
        if (other.parent === rig.controller || other.parent === rig.from || other.parent === rig.to) return {error: failure(MotionContracts.ERROR.TRACK_CONFLICT, "Remova os vinculos de parent para as camadas geradas antes de alterar o rig.")};
      }
      return {comp: comp, rig: rig, selected: selected, metadata: md};
    }
    if (args.action === "remove") return {error: failure(MotionContracts.ERROR.NO_SELECTION, "Selecione uma camada da troca de estilos para remover.")};
    if (selected.length !== 2) return {error: failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Selecione exatamente dois textos: o superior e o estilo inicial.")};
    var sources = /** @type {any} */ (selected[0].index < selected[1].index ? [selected[0], selected[1]] : [selected[1], selected[0]]);
    var counts = /** @type {any} */ ([]);
    for (i = 0; i < sources.length; i += 1) {
      var source = /** @type {any} */ (sources[i]);
      if (typeof TextLayer === "undefined" || !(source instanceof TextLayer) || /** @type {any} */ (source).locked || !/** @type {any} */ (source).enabled) return {error: failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Use duas camadas de texto visiveis e desbloqueadas.")};
      if (source.threeDLayer || source.parent) return {error: failure(MotionContracts.ERROR.CAPABILITY_UNAVAILABLE, "A troca de estilos aceita textos 2D sem parent para alinhar as copias com precisao.")};
      var sourceExtra = /** @type {any} */ (source);
      var masks = source.property("ADBE Mask Parade");
      if (sourceExtra.hasTrackMatte || sourceExtra.isTrackMatte || sourceExtra.guideLayer || (masks && masks.numProperties > 0) || (animators(source) && animators(source).numProperties > 0)) return {error: failure(MotionContracts.ERROR.CAPABILITY_UNAVAILABLE, "Use textos sem matte, mascara, guide ou animadores anteriores para alinhar a troca com precisao.")};
      if (String(source.comment || "").indexOf(OPEN) >= 0) return {error: failure(MotionContracts.ERROR.TRACK_CONFLICT, "O texto possui metadata de troca de estilos incompleta.")};
      var textProperty = /** @type {any} */ (source.property("ADBE Text Properties").property("ADBE Text Document"));
      if (textProperty.numKeys || textProperty.expression) return {error: failure(MotionContracts.ERROR.KEYFRAME_CONFLICT, "Use textos com conteudo e estilo estaticos; anime o progresso no rig gerado.")};
      var text = String(textProperty.value.text);
      var count = args.unit === "words" ? (text.match(/\S+/g) || []).length : text.replace(/[\r\n]/g, "").length;
      if (count < 1 || count > 500) return {error: failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Use de 1 a 500 caracteres ou palavras por camada.")};
      counts.push(count);
      var transform = /** @type {any} */ (source.property("ADBE Transform Group"));
      for (var j = 0; j < TRANSFORMS.length; j += 1) {
        var prop = transform.property(TRANSFORMS[j]);
        if (!prop || prop.numKeys || prop.expression || prop.dimensionsSeparated) return {error: failure(MotionContracts.ERROR.KEYFRAME_CONFLICT, "Posicao, ancora, escala e rotacao devem estar estaticas e sem dimensoes separadas.")};
      }
      var group = animators(source);
      if (!group || !group.canAddProperty("ADBE Text Animator") || typeof source.duplicate !== "function" || typeof source.sourceRectAtTime !== "function") return {error: failure(MotionContracts.ERROR.CAPABILITY_UNAVAILABLE, "Esta versao nao disponibiliza os animadores e limites de texto necessarios.")};
    }
    if (counts[0] !== counts[1]) return {error: failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Os dois textos precisam ter o mesmo numero de caracteres ou palavras na unidade escolhida.")};
    if (sources[0].solo !== sources[1].solo) return {error: failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Os dois textos devem compartilhar o mesmo estado Solo.")};
    if (comp.time < Math.max(sources[0].inPoint, sources[1].inPoint) || comp.time >= Math.min(sources[0].outPoint, sources[1].outPoint)) return {error: failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Posicione o indicador em um trecho comum dos dois textos.")};
    return {comp: comp, sources: sources, count: counts[0], selected: selected};
  }
  /** @param {Record<string, unknown>} args @returns {MotionCommandFailure|null} */
  function preflight(args) { return prepare(args).error || null; }
  /** @param {any} comp @param {any[]} selected @returns {void} */
  function restoreSelection(comp, selected) {
    for (var i = 1; i <= comp.numLayers; i += 1) comp.layer(i).selected = false;
    for (i = 0; i < selected.length; i += 1) { try { selected[i].selected = true; } catch (removed) { /* A selected generated layer may have been removed. */ } }
  }
  /** @param {any} plan @param {Record<string, unknown>} args @returns {MotionCommandResult} */
  function create(plan, args) {
    var comp = plan.comp;
    var a = plan.sources[0];
    var b = plan.sources[1];
    var originals = [{layer: a, comment: a.comment, enabled: a.enabled}, {layer: b, comment: b.comment, enabled: b.enabled}];
    var created = [];
    var id = "swap-" + String(new Date().getTime()) + "-" + String(comp.numLayers);
    var linkName = LINK + " " + id;
    var succeeded = false;
    try {
      var from = a.duplicate(); created.push(from);
      var to = b.duplicate(); created.push(to);
      var controller = comp.layers.addNull(); created.push(controller);
      from.name = "Moti.on - Inicial - " + a.name;
      to.name = "Moti.on - Final - " + b.name;
      controller.name = "Moti.on - Troca de estilos";
      controller.guideLayer = true;
      controller.inPoint = Math.min(a.inPoint, b.inPoint);
      controller.outPoint = Math.max(a.outPoint, b.outPoint);
      var ca = /** @type {any} */ (center(a, comp.time));
      var cb = /** @type {any} */ (center(b, comp.time));
      controller.property("ADBE Transform Group").property("ADBE Position").setValue(center(a, comp.time, 0));
      var position = to.property("ADBE Transform Group").property("ADBE Position");
      position.setValue([position.value[0] + ca[0] - cb[0], position.value[1] + ca[1] - cb[1]]);
      addControl(controller, PROGRESS, "ADBE Slider Control", 0);
      addControl(controller, DURATION, "ADBE Slider Control", Number(args.durationFrames));
      addControl(controller, STAGGER, "ADBE Slider Control", Number(args.staggerFrames));
      addControl(controller, AUTOMATIC, "ADBE Checkbox Control", 0);
      addControl(controller, FOLLOW, "ADBE Checkbox Control", 1);
      addControl(controller, REFERENCE, "ADBE Layer Control", a.index);
      addControl(controller, MORPH, "ADBE Slider Control", 100);
      addControl(controller, BLEND_WIDTH, "ADBE Slider Control", 2.4);
      expression(control(controller, PROGRESS), progressExpression(comp.time, plan.count, true, true));
      var fromModel = morphModel(from, to, comp.time), toModel = morphModel(to, from, comp.time), addedAnimators = /** @type {any[]} */ ([]);
      addAnimator(from, controller, "from", String(args.unit), linkName);
      addAnimator(to, controller, "to", String(args.unit), linkName);
      addMorphAnimator(from, "from", String(args.unit), linkName, fromModel, false, addedAnimators);
      addMorphAnimator(from, "from", String(args.unit), linkName, fromModel, true, addedAnimators);
      addMorphAnimator(to, "to", String(args.unit), linkName, toModel, false, addedAnimators);
      addMorphAnimator(to, "to", String(args.unit), linkName, toModel, true, addedAnimators);
      tag(from, {id: id, role: "from", link: linkName, model: fromModel});
      tag(to, {id: id, role: "to", link: linkName, model: toModel});
      tag(controller, {id: id, role: "controller", start: comp.time, count: plan.count, unit: args.unit, controlsVersion: 4});
      tag(a, {id: id, role: "sourceFrom", enabled: a.enabled});
      tag(b, {id: id, role: "sourceTo", enabled: b.enabled});
      a.enabled = false;
      b.enabled = false;
      succeeded = true;
    } catch (e) {
      try {
        for (var i = 0; i < originals.length; i += 1) { var original = /** @type {any} */ (originals[i]); original.layer.comment = original.comment; original.layer.enabled = original.enabled; }
        for (i = created.length - 1; i >= 0; i -= 1) created[i].remove();
      } catch (rollback) { throw error(MotionContracts.ERROR.ROLLBACK_FAILED, "A troca de estilos falhou ao restaurar o projeto. Use Desfazer."); }
      throw e;
    } finally { restoreSelection(comp, succeeded ? [controller] : plan.selected); }
    return {changed: true, warnings: [], data: {createdCount: 3, appliedCount: 2, unit: args.unit, controllerName: controller.name}};
  }
  /** @param {any} plan @param {Record<string, unknown>} args @returns {MotionCommandResult} */
  function adjust(plan, args) {
    var rig = plan.rig;
    var duration = control(rig.controller, DURATION);
    var stagger = control(rig.controller, STAGGER);
    var progress = control(rig.controller, PROGRESS);
    var fromUnit = selector(rig.from).property("ADBE Text Range Type2");
    var toUnit = selector(rig.to).property("ADBE Text Range Type2");
    var countA = unitCount(rig.from, args.unit);
    var fromAmount = selector(rig.from).property("ADBE Text Expressible Amount"), toAmount = selector(rig.to).property("ADBE Text Expressible Amount");
    var ctrlPosition = rig.controller.property("ADBE Transform Group").property("ADBE Position");
    var snapshot = {duration: duration.value, stagger: stagger.value, from: fromUnit.value, to: toUnit.value, expression: progress.expression, enabled: progress.expressionEnabled, comment: rig.controller.comment, position: ctrlPosition.value, fromExpression: fromAmount.expression, toExpression: toAmount.expression, fromEnabled: fromAmount.expressionEnabled, toEnabled: toAmount.expressionEnabled};
    var added = [], addedAnimators = /** @type {any[]} */ ([]), positioned = false;
    var fromComment = rig.from.comment, toComment = rig.to.comment;
    var morphUnits = /** @type {any[]} */ ([]);
    if (plan.metadata.controlsVersion >= 4) {
      var existingLayers = [rig.from, rig.to], kinds = ["morph", "converge"];
      for (var eli = 0; eli < existingLayers.length; eli += 1) for (var eki = 0; eki < kinds.length; eki += 1) morphUnits.push({layer: existingLayers[eli], kind: kinds[eki], value: selector(existingLayers[eli], kinds[eki]).property("ADBE Text Range Type2").value});
    }
    try {
      if (!control(rig.controller, AUTOMATIC)) {
        addControl(rig.controller, AUTOMATIC, "ADBE Checkbox Control", 0); added.push(AUTOMATIC);
      }
      if (!control(rig.controller, FOLLOW)) { addControl(rig.controller, FOLLOW, "ADBE Checkbox Control", 1); added.push(FOLLOW); }
      if (!control(rig.controller, REFERENCE)) { addControl(rig.controller, REFERENCE, "ADBE Layer Control", rig.sourceFrom.index); added.push(REFERENCE); }
      if (!control(rig.controller, MORPH)) { addControl(rig.controller, MORPH, "ADBE Slider Control", 100); added.push(MORPH); }
      if (!control(rig.controller, BLEND_WIDTH)) { addControl(rig.controller, BLEND_WIDTH, "ADBE Slider Control", 2.4); added.push(BLEND_WIDTH); }
      duration = control(rig.controller, DURATION); stagger = control(rig.controller, STAGGER); progress = control(rig.controller, PROGRESS);
      if (!(plan.metadata.controlsVersion >= 3) && !ctrlPosition.numKeys && !ctrlPosition.expression) { ctrlPosition.setValue(center(rig.sourceFrom, plan.comp.time, 0)); positioned = true; }
      if (!(plan.metadata.controlsVersion >= 4)) {
        var fm = meta(rig.from), tm = meta(rig.to);
        fm.model = morphModel(rig.from, rig.to, plan.comp.time); tm.model = morphModel(rig.to, rig.from, plan.comp.time);
        addMorphAnimator(rig.from, "from", String(args.unit), fm.link, fm.model, false, addedAnimators);
        addMorphAnimator(rig.from, "from", String(args.unit), fm.link, fm.model, true, addedAnimators);
        addMorphAnimator(rig.to, "to", String(args.unit), tm.link, tm.model, false, addedAnimators);
        addMorphAnimator(rig.to, "to", String(args.unit), tm.link, tm.model, true, addedAnimators);
        tag(rig.from, fm); tag(rig.to, tm);
      }
      // Adding native indexed animators invalidates earlier Property handles.
      fromUnit = selector(rig.from).property("ADBE Text Range Type2"); toUnit = selector(rig.to).property("ADBE Text Range Type2");
      fromAmount = selector(rig.from).property("ADBE Text Expressible Amount"); toAmount = selector(rig.to).property("ADBE Text Expressible Amount");
      duration.setValue(args.durationFrames); stagger.setValue(args.staggerFrames);
      fromUnit.setValue(args.unit === "words" ? 3 : 1); toUnit.setValue(args.unit === "words" ? 3 : 1);
      var layers = [rig.from, rig.to];
      for (var li = 0; li < layers.length; li += 1) {
        selector(layers[li], "morph").property("ADBE Text Range Type2").setValue(args.unit === "words" ? 3 : 1);
        selector(layers[li], "converge").property("ADBE Text Range Type2").setValue(args.unit === "words" ? 3 : 1);
      }
      expression(progress, progressExpression(plan.metadata.start, countA, true, true));
      expression(fromAmount, amountExpression("from", meta(rig.from).link, true, true));
      expression(toAmount, amountExpression("to", meta(rig.to).link, true, true));
      plan.metadata.unit = args.unit; plan.metadata.count = countA; plan.metadata.controlsVersion = 4; tag(rig.controller, plan.metadata);
    } catch (e) {
      try {
        for (var rai = addedAnimators.length - 1; rai >= 0; rai -= 1) animators(addedAnimators[rai].layer).property(addedAnimators[rai].index).remove();
        rig.from.comment = fromComment; rig.to.comment = toComment;
        for (var mui = 0; mui < morphUnits.length; mui += 1) selector(morphUnits[mui].layer, morphUnits[mui].kind).property("ADBE Text Range Type2").setValue(morphUnits[mui].value);
        if (added.length) {
          for (var ai = added.length - 1; ai >= 0; ai--) rig.controller.property("ADBE Effect Parade").property(added[ai]).remove();
          duration = control(rig.controller, DURATION); stagger = control(rig.controller, STAGGER); progress = control(rig.controller, PROGRESS);
        }
        fromUnit = selector(rig.from).property("ADBE Text Range Type2"); toUnit = selector(rig.to).property("ADBE Text Range Type2");
        fromAmount = selector(rig.from).property("ADBE Text Expressible Amount"); toAmount = selector(rig.to).property("ADBE Text Expressible Amount");
        if (positioned) ctrlPosition.setValue(snapshot.position);
        duration.setValue(snapshot.duration); stagger.setValue(snapshot.stagger); fromUnit.setValue(snapshot.from); toUnit.setValue(snapshot.to);
        progress.expression = snapshot.expression; progress.expressionEnabled = snapshot.enabled; rig.controller.comment = snapshot.comment;
        fromAmount.expression = snapshot.fromExpression; fromAmount.expressionEnabled = snapshot.fromEnabled;
        toAmount.expression = snapshot.toExpression; toAmount.expressionEnabled = snapshot.toEnabled;
      } catch (rollback) { throw error(MotionContracts.ERROR.ROLLBACK_FAILED, "Nao foi possivel restaurar os controles. Use Desfazer."); }
      throw e;
    }
    return {changed: true, warnings: [], data: {adjustedCount: 2, createdCount: 0, unit: args.unit}};
  }
  /** @param {any} plan @returns {MotionCommandResult} */
  function remove(plan) {
    var rig = plan.rig;
    // Keep generated layers until original visibility/comments have restored.
    // Native layer deletion cannot be rolled back with the same layer identity;
    // report a partial delete explicitly so the single host Undo restores it.
    var a = {enabled: rig.sourceFrom.enabled, comment: rig.sourceFrom.comment};
    var b = {enabled: rig.sourceTo.enabled, comment: rig.sourceTo.comment};
    var selection = [];
    for (var i = 0; i < plan.selected.length; i += 1) {
      var selected = plan.selected[i];
      if (selected === rig.from) selected = rig.sourceFrom;
      else if (selected === rig.to) selected = rig.sourceTo;
      else if (selected === rig.controller) { selection.push(rig.sourceFrom); selected = rig.sourceTo; }
      selection.push(selected);
    }
    var removed = 0;
    try {
      rig.sourceFrom.enabled = meta(rig.sourceFrom).enabled;
      rig.sourceTo.enabled = meta(rig.sourceTo).enabled;
      rig.sourceFrom.comment = cleanComment(rig.sourceFrom.comment);
      rig.sourceTo.comment = cleanComment(rig.sourceTo.comment);
      rig.from.remove(); removed += 1;
      rig.to.remove(); removed += 1;
      rig.controller.remove(); removed += 1;
    } catch (e) {
      if (removed) throw error(MotionContracts.ERROR.ROLLBACK_FAILED, "A remocao foi interrompida; use Desfazer para restaurar o rig completo.");
      rig.sourceFrom.enabled = a.enabled; rig.sourceFrom.comment = a.comment;
      rig.sourceTo.enabled = b.enabled; rig.sourceTo.comment = b.comment;
      throw e;
    }
    restoreSelection(plan.comp, selection);
    return {changed: true, warnings: [], data: {removedCount: 3, restoredCount: 2}};
  }
  /** @param {Record<string, unknown>} args @returns {MotionCommandResult} */
  function run(args) {
    var plan = prepare(args);
    if (plan.error) throw error(plan.error.code, plan.error.message);
    if (!plan.rig) return create(plan, args);
    return args.action === "remove" ? remove(plan) : adjust(plan, args);
  }
  MotionRegistry.register("ae.text.style-swap", {preflight: preflight, run: run});
})();
