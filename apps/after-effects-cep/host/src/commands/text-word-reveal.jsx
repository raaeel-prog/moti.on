/** Native, editable word/box reveal. The untouched source is the transform parent. */
(function () {
  /* global Shape */
  var OPEN = "[MOTION_WORD_REVEAL_V1]";
  var CLOSE = "[/MOTION_WORD_REVEAL_V1]";
  var TYPE = "ae.text.word-reveal";
  var B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  /** @type {any} */
  var CONTROLS = [
    ["durationFrames", "Duration (frames)", 4, 180],
    ["staggerFrames", "Stagger (frames)", 0, 60],
    ["paddingX", "Padding X", 0, 500],
    ["paddingY", "Padding Y", 0, 500],
    ["roundness", "Roundness", 0, 500],
    ["revealPoint", "Reveal point (%)", 10, 90],
    ["boxGap", "Box gap", 0, 100]
  ];

  /** @param {string} code @param {string} message @param {any} [details] @returns {MotionCommandFailure} */
  function fail(code, message, details) { return {code: code, message: message, recoverable: true, details: details || null}; }
  /** @param {any} n @param {number} lo @param {number} hi @returns {boolean} */
  function range(n, lo, hi) { return typeof n === "number" && isFinite(n) && n >= lo && n <= hi; }
  /** @param {any} data @returns {string} */
  function encode(data) {
    var s = MotionJson.stringify(data), out = "", bits = 0, buffer = 0;
    for (var i = 0; i < s.length; i += 1) {
      buffer = (buffer << 8) | s.charCodeAt(i); bits += 8;
      while (bits >= 6) { bits -= 6; out += B64.charAt((buffer >> bits) & 63); }
    }
    if (bits > 0) out += B64.charAt((buffer << (6 - bits)) & 63);
    return OPEN + out + CLOSE;
  }
  /** @param {any} layer @returns {any} */
  function meta(layer) {
    try {
      var s = String(layer.comment || ""), start = s.indexOf(OPEN), end = s.indexOf(CLOSE, start + OPEN.length);
      if (start < 0 || end < 0) return null;
      var text = s.substring(start + OPEN.length, end), out = "", bits = 0, buffer = 0;
      for (var i = 0; i < text.length; i += 1) {
        var v = B64.indexOf(text.charAt(i)); if (v < 0) return null;
        buffer = (buffer << 6) | v; bits += 6;
        if (bits >= 8) { bits -= 8; out += String.fromCharCode((buffer >> bits) & 255); }
      }
      var data = /** @type {any} */ (MotionJson.parse(out));
      return data && data.schemaVersion === 1 && data.rigType === TYPE && typeof data.rigId === "string" ? data : null;
    } catch (e) { return null; }
  }
  /** @param {any} layer @returns {boolean} */
  function isText(layer) { return layer instanceof TextLayer; }
  /** @param {any} layer @returns {any} */
  function textProp(layer) { var g = layer.property("ADBE Text Properties"); return g ? g.property("ADBE Text Document") : null; }
  /** @param {any} source @returns {string} */
  function fingerprint(source) {
    var d = textProp(source).value;
    var str = MotionJson.stringify([String(d.text), d.font, d.fontSize, d.tracking, d.justification, d.leading, d.autoLeading, d.horizontalScale, d.verticalScale, d.baselineShift, d.fauxBold, d.fauxItalic, d.allCaps, d.smallCaps, d.applyFill, d.applyFill ? d.fillColor : null, d.applyStroke, d.applyStroke ? d.strokeColor : null, d.applyStroke ? d.strokeWidth : null, d.baselineLocs]);
    var hash = 2166136261;
    for (var i = 0; i < str.length; i += 1) { hash ^= str.charCodeAt(i); hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24); }
    return String(hash >>> 0);
  }
  /** @param {any} args @returns {MotionCommandFailure|null} */
  function validate(args) {
    var allowed = /** @type {any} */ ({action: true, fillColor: true});
    for (var i = 0; i < CONTROLS.length; i += 1) allowed[CONTROLS[i][0]] = true;
    for (var key in args) if (Object.prototype.hasOwnProperty.call(args, key) && !allowed[key]) return fail(MotionContracts.ERROR.INVALID_PRESET, "Argumento de revelacao desconhecido.", {field: key});
    if (args.action !== "apply" && args.action !== "remove") return fail(MotionContracts.ERROR.INVALID_PRESET, "Acao invalida.", {field: "action"});
    for (i = 0; i < CONTROLS.length; i += 1) {
      var c = CONTROLS[i], value = args[c[0]];
      if (!range(value, Number(c[2]), Number(c[3])) || (i < 2 && Math.floor(value) !== value)) return fail(MotionContracts.ERROR.INVALID_PRESET, "Controle fora da faixa.", {field: c[0]});
    }
    if (Object.prototype.toString.call(args.fillColor) !== "[object Array]" || args.fillColor.length !== 3) return fail(MotionContracts.ERROR.INVALID_PRESET, "Cor invalida.", {field: "fillColor"});
    for (i = 0; i < 3; i += 1) if (!range(args.fillColor[i], 0, 1)) return fail(MotionContracts.ERROR.INVALID_PRESET, "Cor invalida.", {field: "fillColor"});
    return null;
  }
  /** @param {any} comp @param {any} source @returns {any} */
  function findRig(comp, source) {
    var found = /** @type {any} */ (null);
    for (var i = 1; i <= comp.numLayers; i += 1) {
      var layer = comp.layer(i), m = meta(layer);
      if (m && m.role === "controller" && m.sourceId === source.id && layer.parent === source) {
        if (found) return {conflict: true};
        found = {controller: layer, meta: m, members: []};
      }
    }
    if (found) for (i = 1; i <= comp.numLayers; i += 1) {
      layer = comp.layer(i); m = meta(layer);
      if (m && m.rigId === found.meta.rigId && m.sourceId === source.id) found.members.push(layer);
    }
    return found;
  }
  /** @param {any} layer @param {string} name @returns {any} */
  function control(layer, name) { var g = layer.property("ADBE Effect Parade"); var e = g ? g.property(name) : null; return e ? e.property(1) : null; }
  /** @param {any} args @returns {any} */
  function prepare(args) {
    var error = validate(args); if (error) return {error: error};
    if (!app.project) return {error: fail(MotionContracts.ERROR.NO_ACTIVE_PROJECT, "Abra um projeto.")};
    var comp = /** @type {any} */ (app.project.activeItem);
    if (!comp || !(comp instanceof CompItem)) return {error: fail(MotionContracts.ERROR.NO_ACTIVE_COMP, "Abra uma composicao.")};
    var selected = comp.selectedLayers;
    if (!selected || selected.length === 0) return {error: fail(MotionContracts.ERROR.NO_SELECTION, "Selecione um texto ou rig de revelacao.")};
    var items = [], seen = /** @type {any} */ ({}), i, j;
    for (i = 0; i < selected.length; i += 1) {
      var source = /** @type {any} */ (selected[i]), selectedMeta = meta(source);
      if (selectedMeta) {
        source = null;
        for (j = 1; j <= comp.numLayers; j += 1) if ((/** @type {any} */ (comp.layer(j))).id === selectedMeta.sourceId) source = comp.layer(j);
      }
      if (!source || !isText(source)) return {error: fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Selecione uma camada de texto.")};
      if (seen[source.id]) continue; seen[source.id] = true;
      if (source.locked) return {error: fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Desbloqueie o texto.")};
      var rig = findRig(comp, source);
      if (rig && rig.conflict) return {error: fail(MotionContracts.ERROR.TRACK_CONFLICT, "Existem rigs duplicados para o texto.")};
      if (rig) {
        for (j = 0; j < rig.members.length; j += 1) if (rig.members[j].locked) return {error: fail(MotionContracts.ERROR.TRACK_CONFLICT, "Desbloqueie os membros do rig.")};
        if (args.action === "apply") {
          if (rig.meta.fingerprint !== fingerprint(source) || rig.members.length !== rig.meta.memberCount || rig.controller.outPoint !== source.outPoint) return {error: fail(MotionContracts.ERROR.TRACK_CONFLICT, "O texto ou a estrutura mudou. Remova a revelacao antes de recriar.")};
          for (j = 0; j <= CONTROLS.length; j += 1) {
            var cp = control(rig.controller, j === CONTROLS.length ? "Global color" : String(CONTROLS[j][1]));
            if (!cp || cp.numKeys > 0 || cp.expression) return {error: fail(MotionContracts.ERROR.KEYFRAME_CONFLICT, "Os controles foram renomeados ou animados. Ajuste-os no After Effects.")};
          }
        }
        // Never delete a user's layer indirectly by removing its parent.
        if (args.action === "remove") for (j = 1; j <= comp.numLayers; j += 1) {
          var child = comp.layer(j);
          if (child.parent && meta(child.parent) && meta(child.parent).rigId === rig.meta.rigId && (!meta(child) || meta(child).rigId !== rig.meta.rigId)) return {error: fail(MotionContracts.ERROR.TRACK_CONFLICT, "Desvincule as camadas externas do rig antes de remover.")};
        }
      } else if (args.action === "apply") {
        var prop = textProp(source), doc = prop ? prop.value : null;
        if (source.enabled === false) return {error: fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Ative a visibilidade do texto antes de aplicar.", {reason: "source-disabled"})};
        if (!doc || doc.boxText || source.threeDLayer || source.hasTrackMatte || source.isTrackMatte || source.solo || source.guideLayer) return {error: fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Use texto de ponto 2D, sem matte, solo ou camada guia.")};
        if (prop.numKeys > 0 || prop.expression) return {error: fail(MotionContracts.ERROR.KEYFRAME_CONFLICT, "Use texto estatico, sem expressao ou keyframes no conteudo.")};
        if (source.property("ADBE Text Properties").property("ADBE Text Animators").numProperties > 0 || source.property("ADBE Effect Parade").numProperties > 0 || source.property("ADBE Mask Parade").numProperties > 0) return {error: fail(MotionContracts.ERROR.TRACK_CONFLICT, "Use texto sem animadores, efeitos ou mascaras; as transformacoes sao preservadas.")};
        if (typeof doc.characterRange !== "function" || !doc.baselineLocs || typeof source.id !== "number") return {error: fail(MotionContracts.ERROR.CAPABILITY_UNAVAILABLE, "O host nao expoe medicao e estilos de texto necessarios.")};
        if (typeof source.sourceRectAtTime !== "function" || !range(doc.fontSize, 1, 2000)) return {error: fail(MotionContracts.ERROR.CAPABILITY_UNAVAILABLE, "O texto nao permite medicao.")};
        var content = String(doc.text), words = content.match(/\S+/g);
        if (!words || words.length > 60 || content.length > 2000) return {error: fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Use de 1 a 60 palavras, ate 2000 caracteres.")};
        if (/[\u0590-\u08ff\u200f\u202a-\u202e\t]/.test(content)) return {error: fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Use texto horizontal da esquerda para a direita, sem tabulacoes.")};
        var style = doc.characterRange(0, content.length), attributes = /** @type {any} */ (["font", "fontSize", "tracking", "horizontalScale", "verticalScale", "baselineShift", "fauxBold", "fauxItalic", "applyFill", "applyStroke"]);
        for (j = 0; j < attributes.length; j += 1) if (typeof style[attributes[j]] === "undefined") return {error: fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Use um estilo uniforme em toda a camada.")};
        if ((style.applyFill && typeof style.fillColor === "undefined") || (style.applyStroke && (typeof style.strokeColor === "undefined" || typeof style.strokeWidth === "undefined"))) return {error: fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Use cores e contorno uniformes.")};
        var lines = /** @type {any} */ (content.replace(/\r\n/g, "\r").replace(/\n/g, "\r").split("\r"));
        if (doc.baselineLocs.length !== lines.length * 4) return {error: fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Use texto horizontal com quebras manuais de linha.")};
        for (j = 0; j < lines.length; j += 1) if (/\S/.test(lines[j]) && (!range(doc.baselineLocs[j * 4], -100000, 100000) || !range(doc.baselineLocs[j * 4 + 1], -100000, 100000) || Math.abs(doc.baselineLocs[j * 4 + 3] - doc.baselineLocs[j * 4 + 1]) > 0.01)) return {error: fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "O texto precisa ter linhas horizontais.")};
        if (comp.time < source.inPoint || comp.time >= source.outPoint) return {error: fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Posicione o cursor dentro do tempo da camada.")};
      }
      if (args.action === "apply") {
        var wordCount = rig ? (rig.meta.memberCount - 1) / 2 : (String(textProp(source).value.text).match(/\S+/g) || []).length;
        var start = rig ? rig.controller.inPoint : comp.time;
        var finish = start + (args.durationFrames + Math.max(0, wordCount - 1) * args.staggerFrames) * comp.frameDuration;
        if (finish > source.outPoint + comp.frameDuration * 0.001) return {error: fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Nao ha tempo suficiente apos o cursor para revelar todas as palavras.", {reason: "insufficient-tail"})};
      }
      items.push({source: source, rig: rig});
    }
    return {error: null, comp: comp, items: items, selected: selected};
  }
  /** @param {any} p @param {string} s */
  function expression(p, s) { p.expression = "// Moti.on word reveal v1\n" + s; p.expressionEnabled = true; if (p.expressionError) throw new Error("Expression rejected"); }
  /** @param {any} layer @param {any} parent @param {number[]} position */
  function attach(layer, parent, position) {
    layer.parent = parent;
    var t = layer.property("ADBE Transform Group");
    t.property("ADBE Anchor Point").setValue([0, 0]); t.property("ADBE Position").setValue(position);
    t.property("ADBE Scale").setValue([100, 100]); t.property("ADBE Rotate Z").setValue(0);
  }
  /** @param {any} layer @param {string} name @param {string} mn @param {any} value */
  function addControl(layer, name, mn, value) { var e = layer.property("ADBE Effect Parade").addProperty(mn); e.name = name; e.property(1).setValue(value); }
  /** @param {any} controller @param {any} args */
  function setControls(controller, args) {
    for (var i = 0; i < CONTROLS.length; i += 1) control(controller, String(CONTROLS[i][1])).setValue(args[CONTROLS[i][0]]);
    control(controller, "Global color").setValue([args.fillColor[0], args.fillColor[1], args.fillColor[2], 1]);
  }
  /** @param {number} order @param {string} controller @returns {string} */
  function timing(order, controller) {
    return "var c=" + controller + ";var f=thisComp.frameDuration;var d=Math.max(4,c.effect('Duration (frames)')(1))*f;var t=time-c.inPoint-" + order + "*Math.max(0,c.effect('Stagger (frames)')(1))*f;var p=Math.max(.1,Math.min(.9,c.effect('Reveal point (%)')(1)/100));";
  }
  /** @param {any} comp @param {any} item @param {any} args @param {any[]} created @returns {any} */
  function createRig(comp, item, args, created) {
    var source = item.source, doc = textProp(source).value, baselines = doc.baselineLocs;
    var lines = /** @type {any} */ (String(doc.text).replace(/\r\n/g, "\r").replace(/\n/g, "\r").split("\r"));
    var controller = comp.layers.addNull(); created.push(controller);
    controller.name = source.name + " - Word Reveal"; controller.enabled = false;
    attach(controller, source, [0, 0]); controller.inPoint = comp.time; controller.outPoint = source.outPoint;
    var m = {schemaVersion: 1, rigType: TYPE, rigId: "wr-" + source.id + "-" + controller.id, role: "controller", sourceId: source.id, originalEnabled: source.enabled, fingerprint: fingerprint(source), memberCount: 1};
    controller.comment = encode(m);
    for (var i = 0; i < CONTROLS.length; i += 1) addControl(controller, String(CONTROLS[i][1]), "ADBE Slider Control", args[CONTROLS[i][0]]);
    addControl(controller, "Global color", "ADBE Color Control", [args.fillColor[0], args.fillColor[1], args.fillColor[2], 1]);
    var measure = comp.layers.addText(""); var measureIndex = created.length; created.push(measure); measure.enabled = false;
    var measureProp = textProp(measure), order = 0;
    for (var line = 0; line < lines.length; line += 1) {
      var re = /\S+/g, match;
      while ((match = re.exec(lines[line])) !== null) {
        var word = match[0], prefix = lines[line].substring(0, match.index + word.length);
        var md = textProp(source).value; md.text = prefix; md.justification = ParagraphJustification.LEFT_JUSTIFY; measureProp.setValue(md);
        var prefixRect = measure.sourceRectAtTime(comp.time, false);
        md = textProp(source).value; md.text = word; md.justification = ParagraphJustification.LEFT_JUSTIFY; measureProp.setValue(md);
        var r = measure.sourceRectAtTime(comp.time, false);
        if (!range(r.width, 0.001, 100000) || !range(r.height, 0.001, 100000)) throw new Error("Word measurement failed");
        var x = baselines[line * 4] + prefixRect.left + prefixRect.width - r.left - r.width, y = baselines[line * 4 + 1];
        var text = comp.layers.addText(""); created.push(text); textProp(text).setValue(md);
        text.name = source.name + " - " + (order + 1) + " " + word;
        attach(text, controller, [x, y]); text.inPoint = controller.inPoint; text.outPoint = source.outPoint;
        text.motionBlur = source.motionBlur; text.blendingMode = source.blendingMode;
        text.comment = encode({schemaVersion: 1, rigType: TYPE, rigId: m.rigId, role: "word", sourceId: source.id, order: order});
        var animators = text.property("ADBE Text Properties").property("ADBE Text Animators");
        var animator = animators.addProperty("ADBE Text Animator"); animator.name = "Rise";
        animator.property("ADBE Text Selectors").addProperty("ADBE Text Selector");
        animator = animators.property(1);
        var pos = animator.property("ADBE Text Animator Properties").addProperty("ADBE Text Position 3D");
        expression(pos, timing(order, "parent") + "var q=ease(t,d*p,d,0,1);[0,(1-q)*" + (r.height + 4) + ",0];");
        var mask = text.property("ADBE Mask Parade").addProperty("ADBE Mask Atom"); mask.name = "Reveal window";
        var shape = new Shape(); shape.vertices = [[r.left - 2, r.top - 2], [r.left + r.width + 2, r.top - 2], [r.left + r.width + 2, r.top + r.height + 1], [r.left - 2, r.top + r.height + 1]];
        shape.inTangents = [[0,0],[0,0],[0,0],[0,0]]; shape.outTangents = [[0,0],[0,0],[0,0],[0,0]]; shape.closed = true;
        mask.property("ADBE Mask Shape").setValue(shape);
        expression(text.property("ADBE Transform Group").property("ADBE Opacity"), timing(order, "parent") + "t<d*p?0:c.parent.transform.opacity;");
        var box = comp.layers.addShape(); created.push(box); box.name = source.name + " - Box " + (order + 1);
        attach(box, controller, [x, y]); box.inPoint = controller.inPoint; box.outPoint = source.outPoint;
        box.motionBlur = source.motionBlur;
        box.comment = encode({schemaVersion: 1, rigType: TYPE, rigId: m.rigId, role: "box", sourceId: source.id, order: order});
        addControl(box, "Override color", "ADBE Checkbox Control", 0);
        addControl(box, "Word color", "ADBE Color Control", [args.fillColor[0], args.fillColor[1], args.fillColor[2], 1]);
        var root = box.property("ADBE Root Vectors Group"); root.addProperty("ADBE Vector Group");
        var inner = root.property(1).property("ADBE Vectors Group"); inner.addProperty("ADBE Vector Shape - Rect"); inner.addProperty("ADBE Vector Graphic - Fill");
        var rect = inner.property("ADBE Vector Shape - Rect");
        expression(rect.property("ADBE Vector Rect Size"), timing(order, "parent") + "var h=" + r.height + "+2*Math.max(0,c.effect('Padding Y')(1));var q=t<d*p?ease(t,0,d*p,0,1):ease(t,d*p,d,1,0);[Math.max(0," + r.width + "+2*Math.max(0,c.effect('Padding X')(1))-Math.max(0,c.effect('Box gap')(1))),h*q];");
        expression(rect.property("ADBE Vector Rect Position"), timing(order, "parent") + "var h=" + r.height + "+2*Math.max(0,c.effect('Padding Y')(1));var q=t<d*p?ease(t,0,d*p,0,1):ease(t,d*p,d,1,0);[" + (r.left + r.width / 2) + "," + (r.top + r.height) + "+Math.max(0,c.effect('Padding Y')(1))-h*q/2];");
        expression(rect.property("ADBE Vector Rect Roundness"), "Math.max(0,parent.effect('Roundness')(1));");
        expression(inner.property("ADBE Vector Graphic - Fill").property("ADBE Vector Fill Color"), "effect('Override color')(1)>0?effect('Word color')(1):parent.effect('Global color')(1);");
        expression(box.property("ADBE Transform Group").property("ADBE Opacity"), "parent.parent.transform.opacity;");
        box.moveAfter(text); text.moveBefore(source); box.moveAfter(text);
        order += 1; m.memberCount += 2;
      }
    }
    // Never compare a removed native handle: even equality can throw in AE.
    measure.remove();
    created.splice(measureIndex, 1);
    controller.comment = encode(m); controller.moveBefore(source);
    return controller;
  }
  /** @param {any} prepared @param {any} args @returns {MotionCommandResult} */
  function apply(prepared, args) {
    var created = /** @type {any} */ ([]), updated = /** @type {any} */ ([]), visibility = /** @type {any} */ ([]), count = 0, i, j;
    try {
      for (i = 0; i < prepared.items.length; i += 1) {
        var item = prepared.items[i];
        if (item.rig) {
          var snapshot = [];
          for (j = 0; j <= CONTROLS.length; j += 1) { var p = control(item.rig.controller, j === CONTROLS.length ? "Global color" : String(CONTROLS[j][1])); snapshot.push({property: p, value: p.value}); }
          updated.push(snapshot); setControls(item.rig.controller, args);
        } else {
          createRig(prepared.comp, item, args, created);
          visibility.push({source: item.source, enabled: item.source.enabled}); item.source.enabled = false;
        }
        count += 1;
      }
    } catch (e) {
      var bad = false;
      for (i = updated.length - 1; i >= 0; i -= 1) for (j = 0; j < updated[i].length; j += 1) try { updated[i][j].property.setValue(updated[i][j].value); } catch (restoreControl) { bad = true; }
      for (i = created.length - 1; i >= 0; i -= 1) try { created[i].remove(); } catch (removeLayer) { bad = true; }
      for (i = 0; i < visibility.length; i += 1) try { visibility[i].source.enabled = visibility[i].enabled; } catch (restoreVisibility) { bad = true; }
      if (bad) { var rollback = /** @type {any} */ (new Error("Word reveal rollback failed")); rollback.motionCode = MotionContracts.ERROR.ROLLBACK_FAILED; throw rollback; }
      throw e;
    }
    return {changed: count > 0, warnings: [], data: {appliedCount: count, createdCount: created.length, updatedCount: updated.length}};
  }
  /** @param {any} prepared @returns {MotionCommandResult} */
  function remove(prepared) {
    // Duplicate all managed members first. These retain native keys, effects and
    // edited word styles, and can restore a partially failed host deletion.
    var backups = /** @type {any} */ ([]), removedCount = 0, i, j;
    try {
      for (i = 0; i < prepared.items.length; i += 1) {
        var item = prepared.items[i]; if (!item.rig) continue;
        for (j = 0; j < item.rig.members.length; j += 1) {
          var original = item.rig.members[j], copy = original.duplicate();
          backups.push({original: original, copy: copy, enabled: original.enabled, parent: original.parent, deleted: false, source: item.source, sourceEnabled: item.source.enabled}); copy.enabled = false;
        }
      }
      for (i = 0; i < backups.length; i += 1) { backups[i].original.remove(); backups[i].deleted = true; removedCount += 1; }
      for (i = 0; i < prepared.items.length; i += 1) if (prepared.items[i].rig) prepared.items[i].source.enabled = prepared.items[i].rig.meta.originalEnabled;
    } catch (e) {
      var failed = false;
      for (i = 0; i < backups.length; i += 1) {
        var record = backups[i];
        try {
          var parent = record.parent;
          for (j = 0; j < backups.length; j += 1) if (backups[j].original === parent) parent = backups[j].deleted ? backups[j].copy : backups[j].original;
          if (!record.deleted) { record.original.parent = parent; record.copy.remove(); }
          else { record.copy.parent = parent; record.copy.enabled = record.enabled; }
          record.source.enabled = record.sourceEnabled;
        } catch (restore) { failed = true; }
      }
      if (failed) { var error = /** @type {any} */ (new Error("Word reveal removal rollback failed")); error.motionCode = MotionContracts.ERROR.ROLLBACK_FAILED; throw error; }
      throw e;
    }
    // All originals are gone and source visibility is restored. A failure here
    // must be reported, never swallowed as a successful cleanup.
    try { for (i = backups.length - 1; i >= 0; i -= 1) backups[i].copy.remove(); }
    catch (cleanup) { var cleanupError = /** @type {any} */ (new Error("Word reveal backup cleanup failed")); cleanupError.motionCode = MotionContracts.ERROR.ROLLBACK_FAILED; throw cleanupError; }
    return {changed: removedCount > 0, warnings: [], data: {removedCount: removedCount}};
  }
  /** Keep v1 serialization compatible while the panel carries v2 defaults. @param {any} args @returns {any} */
  function legacyArgs(args) {
    var optional = /** @type {any} */ ({direction: true, smoothness: true, formationPercent: true, holdPercent: true, travelPercent: true, order: true, automatic: true, progress: true, useSourceColor: true, textColor: true}), out = /** @type {any} */ ({});
    for (var key in args) if (Object.prototype.hasOwnProperty.call(args, key) && !optional[key] && !(key === "renderer" && args[key] === "legacy")) out[key] = args[key];
    return out;
  }
  MotionRegistry.register("ae.text.word-reveal", {
    preflight: function (args) { return (/** @type {any} */ ($.global.MotionWordMorph)) && (/** @type {any} */ ($.global.MotionWordMorph)).handles(args) ? (/** @type {any} */ ($.global.MotionWordMorph)).preflight(args) : prepare(legacyArgs(args)).error; },
    run: function (args) {
      if ((/** @type {any} */ ($.global.MotionWordMorph)) && (/** @type {any} */ ($.global.MotionWordMorph)).handles(args)) return (/** @type {any} */ ($.global.MotionWordMorph)).run(args);
      args = legacyArgs(args);
      var prepared = prepare(args); if (prepared.error) throw new Error("Word reveal context changed");
      try { return args.action === "remove" ? remove(prepared) : apply(prepared, args); }
      finally {
        for (var i = 1; i <= prepared.comp.numLayers; i += 1) prepared.comp.layer(i).selected = false;
        for (i = 0; i < prepared.selected.length; i += 1) try { prepared.selected[i].selected = true; } catch (removedSelection) { /* A selected managed member was intentionally removed. */ }
        if (args.action === "remove") for (i = 0; i < prepared.items.length; i += 1) prepared.items[i].source.selected = true;
      }
    }
  });
  $.global.MotionWordRevealLegacy = {meta: meta, findRig: findRig};
}());
