/** Native word-box morph v2. The source stays editable; only managed vectors are replaced. */
/** @param {any} global */
(function (global) {
  /* global Shape, KeyframeInterpolationType */
  var host = /** @type {any} */ (global);
  var TYPE = "ae.text.word-reveal", OPEN = "[MOTION_WORD_REVEAL_V2]", CLOSE = "[/MOTION_WORD_REVEAL_V2]";
  var PREFIX = "// MOTION_WORD_MORPH_V2\n";
  /** @type {any[]} */
  var CONTROLS = [
    ["durationFrames", "Duration (frames)", 4, 180, 36], ["staggerFrames", "Stagger (frames)", 0, 60, 5],
    ["paddingX", "Padding X", 0, 500, 0], ["paddingY", "Padding Y", 0, 500, 15],
    ["roundness", "Roundness", 0, 500, 0], ["revealPoint", "Reveal point (%)", 10, 90, 50],
    ["boxGap", "Box gap", 0, 100, 3], ["smoothness", "Smoothness (%)", 0, 100, 75],
    ["formationPercent", "Formation (%)", 0, 60, 25], ["holdPercent", "Hold (%)", 0, 30, 10],
    ["travelPercent", "Travel (%)", 0, 100, 10], ["progress", "Progress (%)", 0, 100, 0]
  ];
  var DIRECTIONS = /** @type {any} */ ({bottom: 1, top: 2, left: 3, right: 4});
  /** @param {string} code @param {string} message @param {any} [details] @returns {MotionCommandFailure} */
  function fail(code, message, details) { return {code: code, message: message, recoverable: true, details: details || null}; }
  /** @param {any} v @param {number} lo @param {number} hi @returns {boolean} */
  function range(v, lo, hi) { return typeof v === "number" && isFinite(v) && v >= lo && v <= hi; }
  /** @param {any} a @param {any} b @returns {boolean} */
  function same(a, b) {
    if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) <= 0.000001 * Math.max(1, Math.abs(a), Math.abs(b));
    if (a && b && typeof a.length === "number" && typeof b.length === "number") {
      if (a.length !== b.length) return false;
      for (var i = 0; i < a.length; i += 1) if (!same(a[i], b[i])) return false;
      return true;
    }
    return a === b;
  }
  /** @param {any} value @returns {boolean} */
  function color(value) { return Object.prototype.toString.call(value) === "[object Array]" && value.length === 3 && range(value[0], 0, 1) && range(value[1], 0, 1) && range(value[2], 0, 1); }
  /** @param {any} layer @returns {any} */
  function meta(layer) {
    try {
      var s = String(layer.comment || ""), at = s.indexOf(OPEN), end = s.indexOf(CLOSE, at + OPEN.length);
      if (at < 0 || end < 0) return null;
      var m = /** @type {any} */ (MotionJson.parse(s.substring(at + OPEN.length, end)));
      return m && m.schemaVersion === 2 && m.rigType === TYPE && typeof m.rigId === "string" && typeof m.sourceId === "number" ? m : null;
    } catch (ignored) { return null; }
  }
  /** @param {any} layer @param {any} m */
  function writeMeta(layer, m) { layer.comment = OPEN + MotionJson.stringify(m) + CLOSE; }
  /** @param {any} layer @returns {any} */
  function textProp(layer) { var g = layer.property("ADBE Text Properties"); return g ? g.property("ADBE Text Document") : null; }
  /** @param {any} layer @returns {boolean} */
  function isText(layer) { return layer instanceof TextLayer; }
  /** @param {any} layer @param {string} name @returns {any} */
  function control(layer, name) { var e = layer.property("ADBE Effect Parade").property(name); return e ? e.property(1) : null; }
  /** @param {string} text @returns {string} */
  function hash(text) { var h = 2166136261; for (var i = 0; i < text.length; i += 1) { h ^= text.charCodeAt(i); h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24); } return String(h >>> 0); }
  /** @param {any} source @returns {string} */
  function fingerprint(source) {
    var d = textProp(source).value;
    return hash(MotionJson.stringify([String(d.text), d.font, d.fontSize, d.tracking, d.justification, d.leading, d.autoLeading, d.horizontalScale, d.verticalScale, d.baselineShift, d.fauxBold, d.fauxItalic, d.allCaps, d.smallCaps, d.applyFill, d.applyFill ? d.fillColor : null, d.applyStroke, d.applyStroke ? d.strokeColor : null, d.applyStroke ? d.strokeWidth : null, d.baselineLocs]));
  }
  /** @param {any} comp @param {number} id @returns {any} */
  function layerById(comp, id) { for (var i = 1; i <= comp.numLayers; i += 1) if (comp.layer(i).id === id) return comp.layer(i); return null; }
  /** @param {any} comp @param {any} source @returns {any} */
  function findRig(comp, source) {
    var found = /** @type {any} */ (null), i, layer, m;
    for (i = 1; i <= comp.numLayers; i += 1) {
      layer = comp.layer(i); m = meta(layer);
      if (m && m.role === "controller" && m.sourceId === source.id) {
        if (found) return {conflict: true};
        found = {controller: layer, meta: m, members: [], words: []};
      }
    }
    if (found) for (i = 1; i <= comp.numLayers; i += 1) {
      layer = comp.layer(i); m = meta(layer);
      if (m && m.rigId === found.meta.rigId && m.sourceId === source.id) { found.members.push(layer); if (m.role === "word") found.words.push(layer); }
    }
    return found;
  }
  /** @param {any} args @returns {any} */
  function normalized(args) {
    var out = /** @type {any} */ ({action: args.action, renderer: "morph"}), i, c;
    for (i = 0; i < CONTROLS.length; i += 1) { c = CONTROLS[i]; out[c[0]] = typeof args[c[0]] === "undefined" ? c[4] : args[c[0]]; }
    out.fillColor = args.fillColor; out.direction = args.direction || "bottom"; out.order = args.order || "normal";
    out.automatic = typeof args.automatic === "undefined" ? true : args.automatic;
    out.useSourceColor = typeof args.useSourceColor === "undefined" ? true : args.useSourceColor;
    out.textColor = typeof args.textColor === "undefined" ? [1, 1, 1] : args.textColor;
    return out;
  }
  /** @param {any} args @returns {MotionCommandFailure|null} */
  function validate(args) {
    var allowed = /** @type {any} */ ({action: true, renderer: true, fillColor: true, direction: true, order: true, automatic: true, useSourceColor: true, textColor: true});
    var i, c, key;
    for (i = 0; i < CONTROLS.length; i += 1) allowed[CONTROLS[i][0]] = true;
    for (key in args) if (Object.prototype.hasOwnProperty.call(args, key) && !allowed[key]) return fail(MotionContracts.ERROR.INVALID_PRESET, "Controle de morph desconhecido.", {field: key});
    if (args.action !== "apply" && args.action !== "update" && args.action !== "remove" && args.action !== "bake") return fail(MotionContracts.ERROR.INVALID_PRESET, "Operacao de morph invalida.");
    if (args.renderer && args.renderer !== "morph" && args.renderer !== "legacy") return fail(MotionContracts.ERROR.INVALID_PRESET, "Renderizador invalido.");
    var a = normalized(args);
    for (i = 0; i < CONTROLS.length; i += 1) { c = CONTROLS[i]; if (!range(a[c[0]], c[2], c[3]) || i < 2 && Math.floor(a[c[0]]) !== a[c[0]]) return fail(MotionContracts.ERROR.INVALID_PRESET, "Controle fora da faixa.", {field: c[0]}); }
    if (a.formationPercent + a.holdPercent > 90) return fail(MotionContracts.ERROR.INVALID_PRESET, "Nascimento e pausa devem deixar ao menos 10% para a transformacao.");
    if (!color(a.fillColor) || !color(a.textColor)) return fail(MotionContracts.ERROR.INVALID_PRESET, "Cor de morph invalida.");
    if (!Object.prototype.hasOwnProperty.call(DIRECTIONS, a.direction) || a.order !== "normal" && a.order !== "reverse" || typeof a.automatic !== "boolean" || typeof a.useSourceColor !== "boolean") return fail(MotionContracts.ERROR.INVALID_PRESET, "Direcao ou modo invalido.");
    return null;
  }
  /** @param {any} controller @returns {any} */
  function readControls(controller) {
    var a = /** @type {any} */ ({action: "apply", renderer: "morph"}), i, c;
    for (i = 0; i < CONTROLS.length; i += 1) { c = CONTROLS[i]; if (c[0] === "revealPoint") { var cm = meta(controller); a.revealPoint = cm && typeof cm.legacyRevealPoint === "number" ? cm.legacyRevealPoint : 50; continue; } var p = control(controller, c[1]); if (!p) throw new Error("Missing morph control"); a[c[0]] = p.value; }
    var dir = Math.round(control(controller, "Direction").value);
    a.direction = dir === 2 ? "top" : dir === 3 ? "left" : dir === 4 ? "right" : "bottom";
    a.order = control(controller, "Reverse word order").value > 0 ? "reverse" : "normal";
    a.automatic = control(controller, "Automatic").value > 0; a.useSourceColor = control(controller, "Use source color").value > 0;
    a.fillColor = control(controller, "Global color").value.slice(0, 3); a.textColor = control(controller, "Text color").value.slice(0, 3);
    return a;
  }
  /** @param {any} controller @param {any} args @returns {any} */
  function readLegacyControls(controller, args) {
    var a = normalized(args);
    for (var i = 0; i < 7; i += 1) { var p = control(controller, CONTROLS[i][1]); if (!p) throw new Error("Legacy reveal control missing"); a[CONTROLS[i][0]] = p.value; }
    var fill = control(controller, "Global color"); if (!fill) throw new Error("Legacy reveal color missing"); a.fillColor = fill.value.slice(0, 3);
    return a;
  }
  /** @param {any} comp @param {any} rig @returns {MotionCommandFailure|null} */
  function inspectLegacy(comp, rig) {
    var legacy = host.MotionWordRevealLegacy;
    for (var i = 0; i < rig.members.length; i += 1) {
      var layer = rig.members[i]; if (layer.locked) return fail(MotionContracts.ERROR.TRACK_CONFLICT, "Desbloqueie os membros da revelacao antiga antes de migrar.");
      for (var j = 1; j <= comp.numLayers; j += 1) {
        var child = comp.layer(j), m = legacy.meta(child);
        if (child.parent === layer && (!m || m.rigId !== rig.meta.rigId)) return fail(MotionContracts.ERROR.TRACK_CONFLICT, "Desvincule camadas externas da revelacao antiga antes de migrar.");
      }
    }
    try { readLegacyControls(rig.controller, {action: "update"}); } catch (e) { return fail(MotionContracts.ERROR.TRACK_CONFLICT, "Os controles da revelacao antiga foram renomeados ou removidos."); }
    return null;
  }
  /** @param {any} source @param {boolean} existing @returns {MotionCommandFailure|null} */
  function validateSource(source, existing) {
    var p = textProp(source), d = p ? p.value : null;
    if (source.locked || !d || !existing && source.enabled === false) return fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Use texto visivel e desbloqueado.");
    if (d.boxText || source.threeDLayer || source.hasTrackMatte || source.isTrackMatte || source.solo || source.guideLayer) return fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Use texto de ponto 2D, sem matte, solo ou camada guia.");
    if (p.numKeys > 0 || p.expression) return fail(MotionContracts.ERROR.KEYFRAME_CONFLICT, "Use conteudo de texto estatico.");
    if (source.property("ADBE Text Properties").property("ADBE Text Animators").numProperties || source.property("ADBE Effect Parade").numProperties || source.property("ADBE Mask Parade").numProperties) return fail(MotionContracts.ERROR.TRACK_CONFLICT, "Use texto sem animadores, efeitos ou mascaras.");
    if (!d.applyFill || d.applyStroke) return fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "O morph preciso requer preenchimento solido, sem contorno.");
    if (typeof d.characterRange !== "function" || !d.baselineLocs || typeof source.id !== "number") return fail(MotionContracts.ERROR.CAPABILITY_UNAVAILABLE, "O host nao expoe os estilos e identificadores necessarios.");
    var text = String(d.text), words = text.match(/\S+/g);
    if (!words || words.length > 60 || text.length > 2000 || /[\u0590-\u08ff\u200f\u202a-\u202e\t]/.test(text)) return fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Use de 1 a 60 palavras horizontais, da esquerda para a direita, ate 2000 caracteres.");
    var style = d.characterRange(0, text.length), attrs = ["font", "fontSize", "tracking", "horizontalScale", "verticalScale", "baselineShift", "fauxBold", "fauxItalic", "applyFill", "applyStroke", "fillColor"];
    for (var i = 0; i < attrs.length; i += 1) if (typeof style[String(attrs[i])] === "undefined") return fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Use um estilo uniforme em toda a camada.");
    var lines = text.replace(/\r\n/g, "\r").replace(/\n/g, "\r").split("\r");
    if (d.baselineLocs.length !== lines.length * 4) return fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Use linhas horizontais com quebras manuais.");
    for (i = 0; i < lines.length; i += 1) if (/\S/.test(String(lines[i])) && (!range(d.baselineLocs[i * 4], -100000, 100000) || !range(d.baselineLocs[i * 4 + 1], -100000, 100000) || Math.abs(d.baselineLocs[i * 4 + 3] - d.baselineLocs[i * 4 + 1]) > 0.01)) return fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Use linhas horizontais.");
    return null;
  }
  /** @param {any} comp @param {any} rig @returns {MotionCommandFailure|null} */
  function inspectRig(comp, rig) {
    if (rig.conflict || rig.members.length !== rig.meta.memberCount || rig.words.length !== rig.meta.wordCount || rig.controller.parent === null || rig.controller.parent.id !== rig.meta.sourceId) return fail(MotionContracts.ERROR.TRACK_CONFLICT, "A estrutura do morph foi alterada.");
    for (var i = 0; i < rig.members.length; i += 1) {
      var layer = rig.members[i], m = meta(layer);
      if (layer.locked || m.role === "word" && layer.parent !== rig.controller) return fail(MotionContracts.ERROR.TRACK_CONFLICT, "Desbloqueie e restaure os membros do morph.");
      for (var j = 1; j <= comp.numLayers; j += 1) if (comp.layer(j).parent === layer && (!meta(comp.layer(j)) || meta(comp.layer(j)).rigId !== rig.meta.rigId)) return fail(MotionContracts.ERROR.TRACK_CONFLICT, "Desvincule camadas externas antes de alterar o morph.");
      if (m.role === "word" && signature(layer, rig.meta.baked) !== m.signature) return fail(MotionContracts.ERROR.TRACK_CONFLICT, "Um path ou uma expressao do morph foi personalizado. Preserve-o antes de atualizar ou remover.");
    }
    try { readControls(rig.controller); } catch (e) { return fail(MotionContracts.ERROR.TRACK_CONFLICT, "Os controles do morph foram renomeados ou removidos."); }
    return null;
  }
  /** @param {any} args @param {boolean} [readOnly] @returns {any} */
  function prepare(args, readOnly) {
    if (!readOnly) { var e = validate(args); if (e) return {error: e}; }
    if (!app.project) return {error: fail(MotionContracts.ERROR.NO_ACTIVE_PROJECT, "Abra um projeto.")};
    var comp = /** @type {any} */ (app.project.activeItem);
    if (!comp || !(comp instanceof CompItem)) return {error: fail(MotionContracts.ERROR.NO_ACTIVE_COMP, "Abra uma composicao.")};
    var selected = comp.selectedLayers, items = /** @type {any[]} */ ([]), selectedIds = [], selectedSourceIds = [], seen = /** @type {any} */ ({});
    if (!selected || !selected.length) return {error: fail(MotionContracts.ERROR.NO_SELECTION, "Selecione um texto ou seu morph.")};
    for (var i = 0; i < selected.length; i += 1) {
      var source = /** @type {any} */ (selected[i]), m = meta(source), legacy = host.MotionWordRevealLegacy;
      if (!m && legacy) m = legacy.meta(source);
      if (m) source = layerById(comp, m.sourceId);
      if (!source || !isText(source)) return {error: fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Selecione uma camada de texto.")};
      selectedIds.push((/** @type {any} */ (selected[i])).id); selectedSourceIds.push(source.id);
      if (seen[source.id]) continue; seen[source.id] = true;
      var rig = findRig(comp, source), old = !rig && legacy ? legacy.findRig(comp, source) : null;
      if (rig) { var re = inspectRig(comp, rig); if (re) return {error: re}; }
      if (old && old.conflict) return {error: fail(MotionContracts.ERROR.TRACK_CONFLICT, "Existem rigs antigos duplicados.")};
      if (old && !readOnly) { var oldError = inspectLegacy(comp, old); if (oldError) return {error: oldError}; }
      if (!readOnly) {
        if (source.locked) return {error: fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Desbloqueie o texto.")};
        if (args.action === "apply" || args.action === "update") {
          e = validateSource(source, !!rig || !!old); if (e) return {error: e};
          if (old && args.action !== "update") return {error: fail(MotionContracts.ERROR.TRACK_CONFLICT, "Use Atualizar para migrar a revelacao antiga.")};
          if (rig && args.action === "apply" && (rig.meta.baked || rig.meta.fingerprint !== fingerprint(source))) return {error: fail(MotionContracts.ERROR.TRACK_CONFLICT, "O texto mudou ou o morph foi convertido em keyframes. Use Atualizar.")};
          if (!rig || args.action === "update") {
            if (!host.MotionMorphGeometry || !host.MotionTextGlyphOutlines || !host.MotionMenuCommand || !host.MotionMenuCommand.resolver(["Create Shapes from Text", "Criar formas a partir do texto", "Criar formas a partir de texto"])) return {error: fail(MotionContracts.ERROR.CAPABILITY_UNAVAILABLE, "Create Shapes from Text nao esta disponivel neste host/idioma.")};
          }
          var a = rig && args.action === "update" ? readControls(rig.controller) : old && args.action === "update" ? readLegacyControls(old.controller, args) : normalized(args);
          var count = (String(textProp(source).value.text).match(/\S+/g) || []).length, start = rig ? rig.controller.inPoint : old ? old.controller.inPoint : comp.time;
          if (start < source.inPoint || start >= source.outPoint || start + (a.durationFrames + Math.max(0, count - 1) * a.staggerFrames) * comp.frameDuration > source.outPoint + comp.frameDuration * .001) return {error: fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Nao ha tempo suficiente na camada para todas as palavras.", {reason: "insufficient-tail"})};
          if (rig && args.action === "apply") { var ce = controlChanges(rig.controller, normalized(args), false); if (ce.error) return {error: ce.error}; }
        }
        if (args.action === "bake") {
          if (!rig) return {error: fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Selecione um morph vetorial para converter em keyframes.")};
          if ((source.outPoint - rig.controller.inPoint) / comp.frameDuration > 3600) return {error: fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Para converter em keyframes, use um trecho de ate 3600 quadros.")};
        }
      }
      items.push({source: source, rig: rig, legacy: old});
    }
    if (!readOnly && args.action === "bake") {
      var estimate = 0;
      for (i = 0; i < items.length; i += 1) if (!items[i].rig.meta.baked) for (var wi = 0; wi < items[i].rig.words.length; wi += 1) {
        var word = items[i].rig.words[wi]; estimate += (Math.ceil((word.outPoint - word.inPoint) / comp.frameDuration * 4) + 1) * managedProperties(word).length;
      }
      if (estimate > 120000) return {error: fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "O trecho excede 120000 keyframes. Reduza a duracao ou o numero de palavras antes de converter.")};
    }
    return {error: null, comp: comp, items: items, selected: selected, selectedIds: selectedIds, selectedSourceIds: selectedSourceIds};
  }
  /** @param {any} layer @param {any} parent */
  function attach(layer, parent) {
    layer.parent = parent;
    var t = layer.property("ADBE Transform Group");
    t.property("ADBE Anchor Point").setValue([0, 0]); t.property("ADBE Position").setValue([0, 0]); t.property("ADBE Scale").setValue([100, 100]); t.property("ADBE Rotate Z").setValue(0);
  }
  /** @param {any} p @param {string} source */
  function expression(p, source) { p.expression = PREFIX + source; p.expressionEnabled = true; if (p.expressionError) throw new Error("Morph expression rejected"); }
  /** @param {any} layer @param {string} name @param {string} type @param {any} value */
  function addControl(layer, name, type, value) { var effects = layer.property("ADBE Effect Parade"), e = effects.addProperty(type), index = effects.numProperties; if (type === "ADBE Dropdown Control") { e.property(1).setPropertyParameters(["De baixo", "De cima", "Da esquerda", "Da direita"]); e = effects.property(index); } e.name = name; e.property(1).setValue(value); }
  /** @param {any} a @returns {any[]} */
  function controlValues(a) {
    var out = [], i;
    for (i = 0; i < CONTROLS.length; i += 1) if (CONTROLS[i][0] !== "revealPoint") out.push([CONTROLS[i][1], a[CONTROLS[i][0]], "ADBE Slider Control"]);
    out.push(["Global color", a.fillColor.concat([1]), "ADBE Color Control"], ["Direction", DIRECTIONS[a.direction], "ADBE Dropdown Control"], ["Reverse word order", a.order === "reverse" ? 1 : 0, "ADBE Checkbox Control"], ["Automatic", a.automatic ? 1 : 0, "ADBE Checkbox Control"], ["Use source color", a.useSourceColor ? 1 : 0, "ADBE Checkbox Control"], ["Text color", a.textColor.concat([1]), "ADBE Color Control"]);
    return out;
  }
  /** @param {any} controller @param {any} a @param {boolean} write @returns {any} */
  function controlChanges(controller, a, write) {
    var values = controlValues(a), changed = /** @type {any[]} */ ([]);
    for (var i = 0; i < values.length; i += 1) {
      var v = values[i], p = control(controller, v[0]);
      if (!p) return {error: fail(MotionContracts.ERROR.TRACK_CONFLICT, "Controle do morph ausente.")};
      if (same(p.value, v[1])) continue;
      if (p.numKeys || p.expression) return {error: fail(MotionContracts.ERROR.KEYFRAME_CONFLICT, "Um controle animado seria substituido. Ajuste-o no After Effects.", {field: v[0]})};
      changed.push({property: p, value: p.value, expression: p.expression, enabled: p.expressionEnabled, next: v[1]});
    }
    if (write) for (i = 0; i < changed.length; i += 1) changed[i].property.setValue(changed[i].next);
    return {error: null, changed: changed};
  }
  /** @param {any} comp @param {any} source @param {any[]} created @returns {any[]} */
  function outlines(comp, source, created) {
    var extracted = host.MotionTextGlyphOutlines.extract(comp, source, created), glyphs = extracted.glyphs;
    var content = String(textProp(source).value.text), tokens = content.match(/\S+/g) || [];
    var words = [], at = 0, seen = /** @type {any} */ ({});
    for (var i = 0; i < tokens.length; i += 1) {
      var token = String(tokens[i]), chars = 0, wordGlyphs = [], wordShapes = [];
      for (var j = 0; j < token.length; j += 1) { if (token.charCodeAt(j) >= 0xd800 && token.charCodeAt(j) <= 0xdbff) j += 1; chars += 1; }
      for (j = 0; j < chars; j += 1) { var glyph = glyphs[at++]; wordGlyphs.push(glyph); for (var k = 0; k < glyph.contours.length; k += 1) wordShapes.push(glyph.contours[k]); }
      var key = hash(token); seen[key] = (seen[key] || 0) + 1;
      words.push({text: token, key: key + "-" + seen[key], glyphs: wordGlyphs, bounds: host.MotionTextGlyphOutlines.bounds(wordShapes)});
    }
    return words;
  }
  /** @param {number} order @param {number} wordCount @returns {string} */
  function timing(order, wordCount) {
    return "var c=parent;function clamp(x){return Math.max(0,Math.min(1,x));}function soft(x){if(x<=0)return 0;if(x>=1)return 1;var a=1+3*Math.max(0,Math.min(100,c.effect('Smoothness (%)')(1)))/100;var p=Math.pow(x,a);return p/(p+Math.pow(1-x,a));}var rank=c.effect('Reverse word order')(1)>0?" + (wordCount - 1 - order) + ":" + order + ";var d=Math.max(4,c.effect('Duration (frames)')(1))*thisComp.frameDuration;var st=Math.max(0,c.effect('Stagger (frames)')(1))*thisComp.frameDuration;var u=c.effect('Automatic')(1)>0?clamp((time-c.inPoint-rank*st)/d):clamp((clamp(c.effect('Progress (%)')(1)/100)*(d+" + (wordCount - 1) + "*st)-rank*st)/d);var formation=Math.max(0,Math.min(.6,c.effect('Formation (%)')(1)/100));var hold=Math.max(0,Math.min(.9-formation,c.effect('Hold (%)')(1)/100));var g=formation>0?soft(u/formation):1;var q=soft(clamp((u-formation-hold)/Math.max(.1,1-formation-hold)));";
  }
  /** @param {any} word @param {number} order @param {number} wordCount @param {any} data @param {number} pathIndex @param {number} left @param {number} right @param {boolean} first @param {boolean} last @returns {string} */
  function pathExpression(word, order, wordCount, data, pathIndex, left, right, first, last) {
    var b = word.bounds;
    return timing(order, wordCount) + "var targetPath=thisLayer.content('Reference').content(" + pathIndex + ").path;if(q>=1){targetPath;}else{var px=Math.max(0,c.effect('Padding X')(1)),py=Math.max(0,c.effect('Padding Y')(1));var L=" + b.left + "-px+Math.max(0,c.effect('Box gap')(1))/2;var T=" + b.top + "-py;var W=Math.max(.001," + b.width + "+2*px-Math.max(0,c.effect('Box gap')(1)));var H=Math.max(.001," + b.height + "+2*py);var cell={x:L+W*" + left + ",y:T,width:W*" + (right - left) + ",height:H,maxRadius:W*" + word.radiusFraction + ",first:" + first + ",last:" + last + "};" + host.MotionMorphGeometry.sourceExpression(data, "cell", "Math.max(0,c.effect('Roundness')(1))") + "var tv=targetPath.points(),ti=targetPath.inTangents(),to=targetPath.outTangents();var dir=Math.round(c.effect('Direction')(1));var dx=dir===3?-1:dir===4?1:0,dy=dir===1?1:dir===2?-1:0;var travel=Math.max(0,c.effect('Travel (%)')(1))/100*H*Math.sin(Math.PI*q);var v=[],ii=[],oo=[];for(var i=0;i<sv.length;i++){var x=sv[i][0],y=sv[i][1],ix=si[i][0],iy=si[i][1],ox=so[i][0],oy=so[i][1];if(dir===1){y=T+H+(y-T-H)*g;iy*=g;oy*=g;}else if(dir===2){y=T+(y-T)*g;iy*=g;oy*=g;}else if(dir===3){x=L+(x-L)*g;ix*=g;ox*=g;}else{x=L+W+(x-L-W)*g;ix*=g;ox*=g;}v.push([x+(tv[i][0]-x)*q+dx*travel,y+(tv[i][1]-y)*q+dy*travel]);ii.push([ix+(ti[i][0]-ix)*q,iy+(ti[i][1]-iy)*q]);oo.push([ox+(to[i][0]-ox)*q,oy+(to[i][1]-oy)*q]);}createPath(v,ii,oo,true);}";
  }
  /** @param {any} s @returns {any} */
  function nativeShape(s) { var v = new Shape(); v.vertices = s.vertices; v.inTangents = s.inTangents; v.outTangents = s.outTangents; v.closed = s.closed; return v; }
  /** @param {any} layer @param {boolean} baked @returns {string} */
  function signature(layer, baked) {
    var root = layer.property("ADBE Root Vectors Group"), values = [], render = root ? root.property(1) : null, reference = root ? root.property(2) : null;
    if (!root || root.numProperties !== 2 || !render || render.name !== "Render" || !reference || reference.name !== "Reference") return "invalid";
    /** @param {any} p */
    function visit(p) {
      values.push(p.matchName);
      if (p.numProperties) { for (var i = 1; i <= p.numProperties; i += 1) visit(p.property(i)); }
      else if (p.canSetExpression && p.expression) values.push(p.expression, p.expressionEnabled, p.numKeys);
      else if (p.matchName === "ADBE Vector Shape") { if (baked && p.numKeys) { for (var k = 1; k <= p.numKeys; k += 1) values.push(p.keyTime(k), p.keyValue(k)); } else values.push(p.value.vertices, p.value.inTangents, p.value.outTangents, p.value.closed); }
      else if (p.numKeys) { for (var j = 1; j <= p.numKeys; j += 1) values.push(p.keyTime(j), p.keyValue(j)); }
      else values.push(p.value);
    }
    visit(root); visit(layer.property("ADBE Transform Group")); values.push(layer.motionBlur, layer.blendingMode);
    return hash(MotionJson.stringify(values));
  }
  /** @param {any} comp @param {any} source @param {any} a @param {number} start @param {any[]} created @returns {any} */
  function controller(comp, source, a, start, created) {
    var c = comp.layers.addNull(); created.push(c); c.name = source.name + " - Box Morph"; c.enabled = false; attach(c, source); c.inPoint = start; c.outPoint = source.outPoint;
    var values = controlValues(a); for (var i = 0; i < values.length; i += 1) addControl(c, values[i][0], values[i][2], values[i][1]);
    return c;
  }
  /** @param {any} p @param {string} name @returns {any} */
  function captureControl(p, name) { return {name: name, value: p.value, expression: p.expression, enabled: p.expressionEnabled, keys: p.numKeys ? host.MotionKeyframes.captureProperty(p) : null}; }
  /** @param {any} layer @param {any} saved */
  function restoreControl(layer, saved) {
    var target = control(layer, saved.name); if (!target) throw new Error("Managed color control missing");
    if (saved.keys) {
      var keySnapshot = {property: target, propertySelected: saved.keys.propertySelected, spatial: saved.keys.spatial, supportsLabels: saved.keys.supportsLabels, keys: saved.keys.keys};
      host.MotionKeyframes.restoreProperty(keySnapshot, null);
    } else target.setValue(saved.value);
    target.expression = saved.expression; target.expressionEnabled = saved.enabled;
  }
  /** @param {any} previous @param {any} next */
  function inheritLegacyControls(previous, next) {
    for (var i = 0; i < 7; i += 1) if (CONTROLS[i][0] !== "revealPoint") restoreControl(next, captureControl(control(previous, CONTROLS[i][1]), CONTROLS[i][1]));
    restoreControl(next, captureControl(control(previous, "Global color"), "Global color"));
  }
  /** @param {any} layer @returns {any} */
  function wordColors(layer) {
    var names = ["Override box color", "Box color", "Override text color", "Text color"], snapshots = [];
    for (var i = 0; i < names.length; i += 1) {
      var p = control(layer, String(names[i])); if (!p) throw new Error("Word color control missing");
      snapshots.push(captureControl(p, String(names[i])));
    }
    return snapshots;
  }
  /** @param {any} comp @param {any} source @param {any} c @param {any} a @param {any[]} words @param {string} rigId @param {any} oldColors @param {any[]} created @returns {any[]} */
  function createWords(comp, source, c, a, words, rigId, oldColors, created) {
    var layers = [], originalColor = textProp(source).value.fillColor;
    for (var order = 0; order < words.length; order += 1) {
      var word = words[order], layer = comp.layers.addShape(); created.push(layer); layers.push(layer); layer.enabled = false;
      layer.name = source.name + " - " + (order + 1) + " " + word.text; attach(layer, c); layer.inPoint = c.inPoint; layer.outPoint = source.outPoint; layer.motionBlur = source.motionBlur; layer.blendingMode = source.blendingMode;
      var colors = oldColors[word.key];
      addControl(layer, "Override box color", "ADBE Checkbox Control", 0); addControl(layer, "Box color", "ADBE Color Control", a.fillColor.concat([1]));
      addControl(layer, "Override text color", "ADBE Checkbox Control", 0); addControl(layer, "Text color", "ADBE Color Control", a.textColor.concat([1]));
      if (colors) for (var ci = 0; ci < colors.length; ci += 1) restoreControl(layer, colors[ci]);
      var root = layer.property("ADBE Root Vectors Group"); root.addProperty("ADBE Vector Group").name = "Render"; root.addProperty("ADBE Vector Group").name = "Reference";
      var total = 0, g, p, j; for (g = 0; g < word.glyphs.length; g += 1) total += Math.max(.001, word.glyphs[g].bounds.width);
      word.radiusFraction = Math.min(Math.max(.001, word.glyphs[0].bounds.width), Math.max(.001, word.glyphs[word.glyphs.length - 1].bounds.width)) / total;
      var weight = 0, pathIndex = 0, specs = /** @type {any[]} */ ([]);
      for (g = 0; g < word.glyphs.length; g += 1) {
        var left = weight / total; weight += Math.max(.001, word.glyphs[g].bounds.width); var right = weight / total;
        var boxWidth = Math.max(.001, word.bounds.width + 2 * a.paddingX - a.boxGap);
        var cell = {x: word.bounds.left - a.paddingX + a.boxGap / 2 + boxWidth * left, y: word.bounds.top - a.paddingY, width: boxWidth * (right - left), height: word.bounds.height + 2 * a.paddingY, maxRadius: boxWidth * word.radiusFraction, first: g === 0, last: g === word.glyphs.length - 1};
        var data = host.MotionMorphGeometry.prepareGlyph(word.glyphs[g].contours, cell, {roundness: a.roundness});
        for (j = 0; j < data.length; j += 1) {
          pathIndex += 1; var reference = root.property(2).property("ADBE Vectors Group"); reference.addProperty("ADBE Vector Shape - Group").name = "Target " + pathIndex;
          reference = root.property(2).property("ADBE Vectors Group"); reference.property(pathIndex).property("ADBE Vector Shape").setValue(nativeShape(data[j].target));
          var render = root.property(1).property("ADBE Vectors Group"); render.addProperty("ADBE Vector Shape - Group").name = "Morph " + pathIndex;
          render = root.property(1).property("ADBE Vectors Group"); render.property(pathIndex).property("ADBE Vector Shape").setValue(nativeShape(data[j].target));
          specs.push({index: pathIndex, code: pathExpression(word, order, words.length, data[j], pathIndex, left, right, cell.first, cell.last)});
        }
      }
      var inside = root.property(1).property("ADBE Vectors Group"); inside.addProperty("ADBE Vector Graphic - Fill");
      inside = root.property(1).property("ADBE Vectors Group"); var fill = inside.property(inside.numProperties); fill.property("ADBE Vector Fill Rule").setValue(1);
      expression(fill.property("ADBE Vector Fill Color"), timing(order, words.length) + "var from=effect('Override box color')(1)>0?effect('Box color')(1):c.effect('Global color')(1);var to=effect('Override text color')(1)>0?effect('Text color')(1):(c.effect('Use source color')(1)>0?" + MotionJson.stringify(originalColor) + ":c.effect('Text color')(1));[linear(q,from[0],to[0]),linear(q,from[1],to[1]),linear(q,from[2],to[2]),1];");
      for (p = 0; p < specs.length; p += 1) expression(root.property(1).property("ADBE Vectors Group").property(specs[p].index).property("ADBE Vector Shape"), specs[p].code);
      expression(layer.property("ADBE Transform Group").property("ADBE Opacity"), "parent.parent.transform.opacity;");
      writeMeta(layer, {schemaVersion: 2, rigType: TYPE, rigId: rigId, sourceId: source.id, role: "word", order: order, key: word.key, signature: signature(layer, false)});
      layer.moveBefore(source);
    }
    return layers;
  }
  /** @param {any[]} members @returns {any[]} */
  function backup(members) {
    var backups = /** @type {any[]} */ ([]), i, j;
    try {
      for (i = 0; i < members.length; i += 1) { var l = members[i], copy = l.duplicate(); backups.push({id: l.id, original: l, copy: copy, parentId: l.parent ? l.parent.id : null, parent: l.parent, enabled: l.enabled, comment: l.comment, deleted: false}); copy.enabled = false; copy.comment = ""; }
      for (i = 0; i < backups.length; i += 1) { var parent = backups[i].parent; for (j = 0; j < backups.length; j += 1) if (backups[j].id === backups[i].parentId) parent = backups[j].copy; backups[i].copy.parent = parent; }
    } catch (error) { for (i = backups.length - 1; i >= 0; i -= 1) backups[i].copy.remove(); throw error; }
    return backups;
  }
  /** @param {any[]} backups */
  function deleteOriginals(backups) { for (var i = 0; i < backups.length; i += 1) { backups[i].original.remove(); backups[i].deleted = true; } }
  /** @param {any[]} backups */
  function cleanupBackups(backups) { for (var i = backups.length - 1; i >= 0; i -= 1) backups[i].copy.remove(); }
  /** @param {any[]} backups @returns {boolean} */
  function restoreBackups(backups) {
    var bad = false;
    for (var i = 0; i < backups.length; i += 1) try {
      var r = backups[i], parent = r.parent;
      for (var j = 0; j < backups.length; j += 1) if (backups[j].id === r.parentId) parent = backups[j].deleted ? backups[j].copy : backups[j].original;
      if (r.deleted) { r.copy.parent = parent; r.copy.enabled = r.enabled; r.copy.comment = r.comment; }
      else { r.original.parent = parent; r.copy.remove(); }
    } catch (ignored) { bad = true; }
    return bad;
  }
  /** @returns {Error} */
  function rollbackError() { var e = /** @type {any} */ (new Error("Word morph rollback failed")); e.motionCode = MotionContracts.ERROR.ROLLBACK_FAILED; return e; }
  /** @param {any} prepared @param {any} args @returns {MotionCommandResult} */
  function apply(prepared, args) {
    var created = /** @type {any[]} */ ([]), stages = /** @type {any[]} */ ([]), changed = /** @type {any[]} */ ([]), backups = /** @type {any[]} */ ([]), i, j;
    try {
      for (i = 0; i < prepared.items.length; i += 1) {
        var item = prepared.items[i], rig = item.rig;
        if (rig && args.action === "apply") {
          var updates = controlChanges(rig.controller, normalized(args), false); if (updates.error) throw new Error("Morph controls changed after preflight");
          for (j = 0; j < updates.changed.length; j += 1) changed.push(updates.changed[j]);
          continue;
        }
        var a = rig ? readControls(rig.controller) : item.legacy ? readLegacyControls(item.legacy.controller, args) : normalized(args), start = rig ? rig.controller.inPoint : item.legacy ? item.legacy.controller.inPoint : prepared.comp.time;
        var c = rig ? rig.controller : controller(prepared.comp, item.source, a, start, created), rigId = rig ? rig.meta.rigId : "wm-" + item.source.id + "-" + c.id;
        if (item.legacy) inheritLegacyControls(item.legacy.controller, c);
        var oldColors = /** @type {any} */ ({}); if (rig) for (j = 0; j < rig.words.length; j += 1) oldColors[meta(rig.words[j]).key] = wordColors(rig.words[j]);
        var words = outlines(prepared.comp, item.source, created), layers = createWords(prepared.comp, item.source, c, a, words, rigId, oldColors, created);
        var oldMembers = rig ? rig.words : item.legacy ? item.legacy.members : [], m = {schemaVersion: 2, rigType: TYPE, rigId: rigId, sourceId: item.source.id, role: "controller", originalEnabled: rig ? rig.meta.originalEnabled : item.legacy ? item.legacy.meta.originalEnabled : item.source.enabled, fingerprint: fingerprint(item.source), memberCount: words.length + 1, wordCount: words.length, legacyRevealPoint: a.revealPoint, baked: false};
        stages.push({source: item.source, oldEnabled: item.source.enabled, controller: c, oldComment: c.comment, oldOutPoint: c.outPoint, words: layers, oldMembers: oldMembers, existing: !!rig, meta: m});
      }
      // Validate and stage every source before deleting any previous geometry.
      for (i = 0; i < stages.length; i += 1) { var copies = backup(stages[i].oldMembers); for (j = 0; j < copies.length; j += 1) backups.push(copies[j]); }
      deleteOriginals(backups);
      for (i = 0; i < changed.length; i += 1) changed[i].property.setValue(changed[i].next);
      for (i = 0; i < stages.length; i += 1) { var stage = stages[i]; stage.controller.outPoint = stage.source.outPoint; writeMeta(stage.controller, stage.meta); for (j = 0; j < stage.words.length; j += 1) stage.words[j].enabled = true; stage.source.enabled = false; stage.controller.moveBefore(stage.source); }
    } catch (error) {
      var bad = restoreBackups(backups);
      for (i = changed.length - 1; i >= 0; i -= 1) try { changed[i].property.setValue(changed[i].value); changed[i].property.expression = changed[i].expression; changed[i].property.expressionEnabled = changed[i].enabled; } catch (restoreControl) { bad = true; }
      for (i = created.length - 1; i >= 0; i -= 1) try { created[i].remove(); } catch (removeCreated) { bad = true; }
      for (i = 0; i < stages.length; i += 1) try { stages[i].source.enabled = stages[i].oldEnabled; if (stages[i].existing) { stages[i].controller.comment = stages[i].oldComment; stages[i].controller.outPoint = stages[i].oldOutPoint; } } catch (restoreState) { bad = true; }
      if (bad) throw rollbackError(); throw error;
    }
    try { cleanupBackups(backups); } catch (cleanup) { throw rollbackError(); }
    return {changed: stages.length > 0 || changed.length > 0, warnings: [], data: {appliedCount: prepared.items.length, updatedCount: args.action === "update" ? stages.length : changed.length ? prepared.items.length : 0, createdCount: created.length, renderer: "morph"}};
  }
  /** @param {any} prepared @returns {MotionCommandResult} */
  function remove(prepared) {
    var backups = /** @type {any[]} */ ([]), states = /** @type {any[]} */ ([]), i, j;
    try {
      for (i = 0; i < prepared.items.length; i += 1) {
        var item = prepared.items[i], rig = item.rig || item.legacy; if (!rig) continue;
        var b = backup(rig.members); for (j = 0; j < b.length; j += 1) backups.push(b[j]);
        states.push({source: item.source, enabled: item.source.enabled, original: rig.meta.originalEnabled});
      }
      deleteOriginals(backups);
      for (i = 0; i < states.length; i += 1) states[i].source.enabled = states[i].original;
    } catch (error) {
      var bad = restoreBackups(backups); for (i = 0; i < states.length; i += 1) try { states[i].source.enabled = states[i].enabled; } catch (restoreState) { bad = true; }
      if (bad) throw rollbackError(); throw error;
    }
    try { cleanupBackups(backups); } catch (cleanup) { throw rollbackError(); }
    return {changed: backups.length > 0, warnings: [], data: {removedCount: backups.length}};
  }
  /** @param {any} layer @returns {any[]} */
  function managedProperties(layer) {
    var list = [];
    /** @param {any} p */
    function visit(p) { if (p.numProperties) { for (var i = 1; i <= p.numProperties; i += 1) visit(p.property(i)); } else if (p.canSetExpression && String(p.expression || "").indexOf(PREFIX) === 0) list.push(p); }
    visit(layer.property("ADBE Root Vectors Group")); var opacity = layer.property("ADBE Transform Group").property("ADBE Opacity"); if (String(opacity.expression || "").indexOf(PREFIX) === 0) list.push(opacity);
    return list;
  }
  /** Strict equality compresses plateaus without discarding animation detail. @param {any} a @param {any} b @returns {boolean} */
  function sameSample(a, b) {
    if (a === b) return true;
    if (!a || !b) return false;
    if (a.vertices && b.vertices) return a.closed === b.closed && sameSample(a.vertices, b.vertices) && sameSample(a.inTangents, b.inTangents) && sameSample(a.outTangents, b.outTangents);
    if (typeof a.length === "number" && typeof b.length === "number") { if (a.length !== b.length) return false; for (var i = 0; i < a.length; i += 1) if (!sameSample(a[i], b[i])) return false; return true; }
    return false;
  }
  /** @param {any[]} times @param {any[]} values @returns {any} */
  function compactPlateaus(times, values) {
    var indices = /** @type {any[]} */ ([0]), n = times.length;
    for (var i = 1; i < n; i += 1) if (!sameSample(values[i], values[i - 1])) { if (indices[indices.length - 1] !== i - 1) indices.push(i - 1); indices.push(i); }
    if (indices[indices.length - 1] !== n - 1) indices.push(n - 1);
    var outputTimes = [], outputValues = [];
    for (i = 0; i < indices.length; i += 1) { outputTimes.push(times[indices[i]]); outputValues.push(values[indices[i]]); }
    return {times: outputTimes, values: outputValues};
  }
  /** @param {any} prepared @returns {MotionCommandResult} */
  function bake(prepared) {
    var snapshots = /** @type {any[]} */ ([]), rigs = /** @type {any[]} */ ([]), i, j, k, sampleCount = 0, writtenCount = 0;
    // Evaluate every property before disabling a single expression.
    for (i = 0; i < prepared.items.length; i += 1) {
      var rig = prepared.items[i].rig; if (rig.meta.baked) continue;
      rigs.push({rig: rig, comment: rig.controller.comment, words: []});
      for (j = 0; j < rig.words.length; j += 1) {
        var word = rig.words[j], props = managedProperties(word); rigs[rigs.length - 1].words.push({layer: word, comment: word.comment});
        var times = [], start = word.inPoint, end = word.outPoint - prepared.comp.frameDuration * .001;
        for (k = 0; start + k * prepared.comp.frameDuration / 4 < end; k += 1) times.push(start + k * prepared.comp.frameDuration / 4); times.push(end);
        var wordSnapshots = /** @type {any[]} */ ([]), p;
        for (p = 0; p < props.length; p += 1) { if (props[p].numKeys) throw new Error("Managed morph path has user keyframes"); wordSnapshots.push({property: props[p], expression: props[p].expression, enabled: props[p].expressionEnabled, value: props[p].valueAtTime(start, true), times: times, values: []}); }
        // Keep evaluations at the same instant adjacent so the host can reuse its expression cache.
        for (k = 0; k < times.length; k += 1) for (p = 0; p < props.length; p += 1) { var evaluated = props[p].valueAtTime(times[k], false); if (props[p].expressionError) throw new Error("Morph expression rejected"); wordSnapshots[p].values.push(evaluated); }
        for (p = 0; p < wordSnapshots.length; p += 1) { var ws = wordSnapshots[p], compact = compactPlateaus(times, ws.values); ws.times = compact.times; ws.values = compact.values; snapshots.push(ws); sampleCount += times.length; writtenCount += compact.times.length; }
      }
    }
    try {
      for (i = 0; i < snapshots.length; i += 1) { var s = snapshots[i]; s.property.expression = ""; s.property.expressionEnabled = false; if (typeof s.property.setValuesAtTimes === "function") s.property.setValuesAtTimes(s.times, s.values); else for (k = 0; k < s.times.length; k += 1) s.property.setValueAtTime(s.times[k], s.values[k]); for (k = 1; k <= s.property.numKeys; k += 1) s.property.setInterpolationTypeAtKey(k, KeyframeInterpolationType.LINEAR, KeyframeInterpolationType.LINEAR); }
      for (i = 0; i < rigs.length; i += 1) { var m = meta(rigs[i].rig.controller); m.baked = true; writeMeta(rigs[i].rig.controller, m); for (j = 0; j < rigs[i].words.length; j += 1) { var wm = meta(rigs[i].words[j].layer); wm.signature = signature(rigs[i].words[j].layer, true); writeMeta(rigs[i].words[j].layer, wm); } }
    } catch (error) {
      var bad = false;
      for (i = snapshots.length - 1; i >= 0; i -= 1) try { s = snapshots[i]; for (k = s.property.numKeys; k >= 1; k -= 1) s.property.removeKey(k); s.property.setValue(s.value); s.property.expression = s.expression; s.property.expressionEnabled = s.enabled; } catch (restoreProperty) { bad = true; }
      for (i = 0; i < rigs.length; i += 1) try { rigs[i].rig.controller.comment = rigs[i].comment; for (j = 0; j < rigs[i].words.length; j += 1) rigs[i].words[j].layer.comment = rigs[i].words[j].comment; } catch (restoreMeta) { bad = true; }
      if (bad) throw rollbackError(); throw error;
    }
    return {changed: snapshots.length > 0, warnings: [], data: {bakedCount: rigs.length, samples: sampleCount, keysWritten: writtenCount, renderer: "morph"}};
  }
  /** @param {any} args @returns {boolean} */
  function handles(args) {
    if (args.renderer === "morph" || args.action === "update" || args.action === "bake") return true;
    try { var comp = app.project ? app.project.activeItem : null; if (!(comp instanceof CompItem)) return false; var selected = comp.selectedLayers; for (var i = 0; i < selected.length; i += 1) if (meta(selected[i]) || selected[i] instanceof TextLayer && findRig(comp, selected[i])) return true; } catch (ignored) { /* ordinary preflight reports context errors */ }
    return false;
  }
  host.MotionWordMorph = {
    handles: handles, meta: meta, findRig: findRig,
    /** @param {any} args */
    preflight: function (args) { return prepare(args).error; },
    /** @param {any} args */
    run: function (args) {
      var prepared = prepare(args); if (prepared.error) throw new Error("Morph context changed");
      try { return args.action === "remove" ? remove(prepared) : args.action === "bake" ? bake(prepared) : apply(prepared, args); }
      finally { for (var i = 1; i <= prepared.comp.numLayers; i += 1) prepared.comp.layer(i).selected = false; for (i = 0; i < prepared.selectedIds.length; i += 1) { var surviving = layerById(prepared.comp, prepared.selectedIds[i]) || layerById(prepared.comp, prepared.selectedSourceIds[i]); if (surviving) surviving.selected = true; } }
    }
  };
  MotionRegistry.register("ae.text.word-reveal.read", {
    preflight: function (args) { for (var key in args) if (Object.prototype.hasOwnProperty.call(args, key)) return fail(MotionContracts.ERROR.INVALID_PRESET, "A leitura nao aceita controles."); var p = prepare(args, true); return p.error || (p.items.length !== 1 ? fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Selecione somente um texto para ler os controles.") : null); },
    run: function (args) {
      var prepared = prepare(args, true); if (prepared.error || prepared.items.length !== 1) throw new Error("Select one reveal source to read controls");
      var item = prepared.items[0];
      if (item.rig) return {changed: false, warnings: [], data: {rigVersion: 2, renderer: "morph", controls: readControls(item.rig.controller), wordCount: item.rig.meta.wordCount, baked: item.rig.meta.baked === true}};
      if (item.legacy) { var a = /** @type {any} */ ({action: "apply", renderer: "legacy"}); for (var i = 0; i < 7; i += 1) a[CONTROLS[i][0]] = control(item.legacy.controller, CONTROLS[i][1]).value; a.fillColor = control(item.legacy.controller, "Global color").value.slice(0, 3); var legacyControls = normalized(a); legacyControls.renderer = "legacy"; return {changed: false, warnings: [], data: {rigVersion: 1, renderer: "legacy", controls: legacyControls, wordCount: (item.legacy.meta.memberCount - 1) / 2, baked: false}}; }
      return {changed: false, warnings: [], data: {rigVersion: 0, renderer: null, controls: null, wordCount: 0, baked: false}};
    }
  });
}($.global));
