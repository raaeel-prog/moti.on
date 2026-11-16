/**
 * Elementos animados (`ae.elements.insert`, ADR 0006).
 *
 * Cada insercao cria uma pre-composicao nova com camadas de shape (operadores
 * nativos: Trim Paths, Repetidor) e de texto desenhadas a partir da receita em
 * `lib().catalog`, e a coloca na composicao ativa no tempo atual. Nada
 * e importado de terceiros; o unico arquivo lido e o WAV sintetizado pelo
 * proprio Moti.on.
 *
 * - **Edicao.** Textos e cores viram Propriedades essenciais da pre-comp. Na
 *   camada pai elas aparecem como substituicoes ("ADBE Layer Overrides"), entao
 *   duas copias da mesma camada podem ter textos diferentes.
 * - **Cores.** Uma camada nula "Moti.on Cores" guarda um Controle de cor por
 *   papel; formas e textos leem esses controles por expressao.
 * - **Tempo.** As expressoes leem `thisComp.duration`: mudar a duracao da
 *   pre-comp leva a Saida junto, sem keyframe para mover.
 * - **Caixas.** Retangulos com `fit` medem o texto com `sourceRectAtTime`.
 *
 * Handles de propriedade: acrescentar um irmao num grupo de shape invalida os
 * handles ja obtidos (medido em `text-box.jsx`). Todo grupo e relido depois de
 * cada `addProperty`.
 */
/* global ImportOptions, FolderItem, FootageItem, Shape */
(function () {
  /** Catalog and track math from generated/motion-library.jsx, read on use:
   * a reloaded host replaces the globals. @returns {any} */
  function lib() { return /** @type {any} */ ($.global).MotionElements; }
  var ALLOWED = { elementId: true, durationFrames: true, animationFrames: true, size: true, sound: true, colors: true, texts: true };
  var COLOR_ROLES = /** @type {any[]} */ (["primary", "accent", "text"]), TEXT_ROLES = /** @type {any[]} */ (["title", "subtitle"]);
  var FOLDER = /** @type {any} */ ({ "pt-BR": "Moti.on Elementos", "en-US": "Moti.on Elements" });
  var SOUND_FOLDER = /** @type {any} */ ({ "pt-BR": "Sons", "en-US": "Sounds" });
  var FOLDER_TAG = "[MOTION_ELEMENTS_FOLDER]", SOUND_TAG = "[MOTION_ELEMENTS_SOUNDS]";
  var OPEN = "[MOTION_ELEMENT_V1]", CLOSE = "[/MOTION_ELEMENT_V1]";
  var REFERENCE = /** @type {any[]} */ ([1920, 1080]);
  var FONTS = { bold: "Arial-BoldMT", regular: "ArialMT" };
  var CAP_ROUND = 2, JOIN_ROUND = 2, STAR = 1;
  /** Sliders of a counter element, published in Essential Properties. */
  var COUNTER_NAMES = /** @type {any} */ ({ start: { "pt-BR": "Início", "en-US": "Start" }, end: { "pt-BR": "Fim", "en-US": "End" } });
  var bundleFile = typeof $.fileName === "string" ? $.fileName : "";
  var staged = /** @type {any} */ (null);

  /** @param {string} code @param {string} message @param {unknown} [details] @returns {MotionCommandFailure} */
  function failure(code, message, details) {
    return { code: code, message: message, recoverable: true, details: typeof details === "undefined" ? null : details };
  }
  /** @param {string} field @param {string} message @returns {MotionCommandFailure} */
  function invalid(field, message) { return failure(MotionContracts.ERROR.INVALID_PRESET, message, { field: field }); }
  /** @param {any} value @param {number} min @param {number} max @returns {boolean} */
  function integerIn(value, min, max) { return typeof value === "number" && isFinite(value) && Math.floor(value) === value && value >= min && value <= max; }
  /** @param {any[]} list @param {any} value @returns {boolean} */
  function has(list, value) { for (var i = 0; i < list.length; i++) if (list[i] === value) return true; return false; }
  /** @param {any} value @returns {boolean} */
  function isRecord(value) { return typeof value === "object" && value !== null && !(value instanceof Array); }
  /** @param {string} id @returns {any} */
  function find(id) {
    var catalog = lib().catalog;
    for (var i = 0; i < catalog.length; i++) if (catalog[i].id === id) return catalog[i];
    return null;
  }
  /** @param {any} element @param {string} kind @returns {any[]} */
  function roles(element, kind) {
    var list = kind === "text" ? TEXT_ROLES : COLOR_ROLES, out = [];
    for (var r = 0; r < list.length; r++) for (var l = 0; l < element.layers.length; l++) {
      var layer = element.layers[l];
      if (kind === "text" ? layer.type === "text" && !layer.counter && layer.id === list[r] : layer.color === list[r]) { out.push(list[r]); break; }
    }
    return out;
  }
  /** @param {any} value @returns {boolean} */
  function isText(value) {
    if (typeof value !== "string" || value.length > lib().limits.textLength) return false;
    for (var i = 0; i < value.length; i++) { var c = value.charCodeAt(i); if ((c < 32 && c !== 10 && c !== 13) || c === 127) return false; }
    return true;
  }
  /** @param {any} value @returns {boolean} */
  function isRgb(value) {
    if (!(value instanceof Array) || value.length !== 3) return false;
    for (var i = 0; i < 3; i++) if (typeof value[i] !== "number" || !isFinite(value[i]) || value[i] < 0 || value[i] > 1) return false;
    return true;
  }

  /** Mesmas regras de `elementInsertError` no contrato. @param {Record<string, any>} args @returns {MotionCommandFailure|null} */
  function validate(args) {
    var limits = lib().limits, key;
    for (key in args) if (Object.prototype.hasOwnProperty.call(args, key) && !Object.prototype.hasOwnProperty.call(ALLOWED, key)) return invalid(key, "Parâmetro de elemento desconhecido.");
    var element = typeof args.elementId === "string" ? find(args.elementId) : null;
    if (!element) return invalid("elementId", "Elemento desconhecido.");
    var duration = typeof args.durationFrames === "undefined" ? element.defaults.durationFrames : args.durationFrames;
    var animation = typeof args.animationFrames === "undefined" ? element.defaults.animationFrames : args.animationFrames;
    if (!integerIn(duration, limits.durationFrames[0], limits.durationFrames[1])) return invalid("durationFrames", "A duração precisa ser um número inteiro de quadros entre 6 e 1800.");
    if (!integerIn(animation, limits.animationFrames[0], limits.animationFrames[1])) return invalid("animationFrames", "A animação precisa ter entre 2 e 120 quadros.");
    if (element.timing === "in-out" && animation * 2 > duration) return invalid("animationFrames", "Entrada e Saída não cabem na duração: aumente a duração ou encurte a animação.");
    if (typeof args.size !== "undefined" && !(typeof args.size === "number" && isFinite(args.size) && args.size >= limits.size[0] && args.size <= limits.size[1])) return invalid("size", "O tamanho precisa estar entre 25% e 400%.");
    if (typeof args.sound !== "undefined" && args.sound !== "preset" && args.sound !== "none" && !has(lib().sounds, args.sound)) return invalid("sound", "Som desconhecido.");
    if (typeof args.colors !== "undefined") {
      if (!isRecord(args.colors)) return invalid("colors", "Cores inválidas.");
      for (key in args.colors) if (Object.prototype.hasOwnProperty.call(args.colors, key) && (!has(COLOR_ROLES, key) || !isRgb(args.colors[key]))) return invalid("colors." + key, "Cor inválida.");
    }
    if (typeof args.texts !== "undefined") {
      if (!isRecord(args.texts)) return invalid("texts", "Textos inválidos.");
      var allowed = roles(element, "text");
      for (key in args.texts) if (Object.prototype.hasOwnProperty.call(args.texts, key) && (!has(allowed, key) || !isText(args.texts[key]))) return invalid("texts." + key, "Texto inválido: até 120 caracteres, sem caracteres de controle.");
    }
    return null;
  }

  /** @param {any} element @param {Record<string, any>} args @param {string} locale @returns {any} */
  function resolve(element, args, locale) {
    var colors = {}, texts = {}, i, role;
    for (i = 0; i < COLOR_ROLES.length; i++) {
      role = COLOR_ROLES[i];
      /** @type {any} */ (colors)[role] = args.colors && args.colors[role] ? args.colors[role] : element.defaults.colors[role];
    }
    var textRoles = roles(element, "text");
    for (i = 0; i < textRoles.length; i++) {
      role = textRoles[i];
      var fallback = element.defaults.texts[role] ? element.defaults.texts[role][locale] : "";
      /** @type {any} */ (texts)[role] = args.texts && typeof args.texts[role] === "string" ? args.texts[role] : fallback;
    }
    var sound = typeof args.sound === "string" ? args.sound : "preset";
    return {
      durationFrames: typeof args.durationFrames === "number" ? args.durationFrames : element.defaults.durationFrames,
      animationFrames: typeof args.animationFrames === "number" ? args.animationFrames : element.defaults.animationFrames,
      size: typeof args.size === "number" ? args.size : 100, sound: sound, colors: colors, texts: texts,
      soundId: sound === "none" ? null : sound === "preset" ? element.sound : sound
    };
  }

  /** @param {string} id @returns {any} */
  function soundFile(id) { return new File(new File(bundleFile).parent.parent.fsName + "/assets/sounds/" + id + ".wav"); }
  /** @param {any} context @returns {string} */
  function localeOf(context) { return context && context.locale === "en-US" ? "en-US" : "pt-BR"; }

  /** @param {Record<string, any>} args @param {any} context @returns {MotionCommandFailure|null} */
  function preflight(args, context) {
    staged = null;
    var problem = validate(args);
    if (problem) return problem;
    if (typeof app === "undefined" || !app.project) return failure(MotionContracts.ERROR.NO_ACTIVE_PROJECT, "Nenhum projeto aberto.");
    var project = /** @type {any} */ (app.project), comp = project.activeItem;
    if (!comp || !(comp instanceof CompItem)) return failure(MotionContracts.ERROR.NO_ACTIVE_COMP, "Abra uma composição para inserir o elemento.");
    // Essential Properties scripting (AE 15.1+) is what keeps text and colors
    // editable on the parent layer; without it the element would be frozen.
    if (typeof /** @type {any} */ (comp).motionGraphicsTemplateControllerCount !== "number") return failure(MotionContracts.ERROR.CAPABILITY_UNAVAILABLE, "Este After Effects não expõe Propriedades essenciais por script.");
    var locale = localeOf(context), element = find(args.elementId), plan = resolve(element, args, locale);
    var ImportAs = /** @type {any} */ ($.global).ImportAsType, file = null, options = null;
    if (plan.soundId) {
      file = soundFile(plan.soundId);
      if (!file.exists) return failure(MotionContracts.ERROR.CAPABILITY_UNAVAILABLE, "O som do elemento não foi encontrado. Reinstale o Moti.on ou escolha Sem som.", { sound: plan.soundId });
      try {
        options = /** @type {any} */ (new ImportOptions(file));
        if (!ImportAs || typeof options.canImportAs !== "function" || !options.canImportAs(ImportAs.FOOTAGE)) return failure(MotionContracts.ERROR.CAPABILITY_UNAVAILABLE, "O After Effects não consegue importar o som do elemento.");
        options.importAs = ImportAs.FOOTAGE;
      } catch (probe) {
        return failure(MotionContracts.ERROR.CAPABILITY_UNAVAILABLE, "O After Effects não consegue importar o som do elemento.");
      }
    }
    staged = { project: project, comp: comp, element: element, plan: plan, locale: locale, file: file, options: options, fingerprint: MotionJson.stringify(args) };
    return null;
  }

  // ---- Expressoes -----------------------------------------------------------

  /** @param {number} n @returns {string} */
  function num(n) { return String(Math.round(n * 10000) / 10000); }
  /** @param {any[]} tracks @param {string} channel @returns {any} */
  function trackOf(tracks, channel) { for (var i = 0; i < tracks.length; i++) if (tracks[i].channel === channel) return tracks[i]; return null; }
  /** @param {any} t @returns {string} */
  function call(t) {
    var data = [], s, i;
    for (i = 0; i < t.segments.length; i++) {
      s = t.segments[i];
      data.push(lib().windowCode[s.window], s.start, s.end, s.from, s.to, lib().easeCode[s.ease]);
    }
    for (i = 0; i < data.length; i++) data[i] = num(data[i]);
    return "elementTrack(time,d,a,[" + data.join(",") + "])";
  }
  /** @param {any} build @returns {string} */
  function header(build) {
    return "var elementTrack=" + lib().track.toString() + ";\nvar d=thisComp.duration,a=" + build.plan.animationFrames + "*thisComp.frameDuration;\n";
  }
  /** @param {any} property @param {string} expression */
  function drive(property, expression) {
    if (!property || !property.canSetExpression) throw new Error("Uma propriedade do elemento não aceita expressão nesta versão do After Effects.");
    property.expression = expression;
  }
  /** @param {any} build @param {string} role @returns {string} */
  function colorRef(build, role) {
    return "thisComp.layer(" + MotionJson.stringify(build.names.controls) + ").effect(" + MotionJson.stringify(build.colorNames[role]) + ")(1)";
  }

  /** The counter of the element, if any (one per element). @param {any} element @returns {any} */
  function counterSpec(element) { for (var i = 0; i < element.layers.length; i++) if (element.layers[i].type === "text" && element.layers[i].counter) return element.layers[i].counter; return null; }
  /** Source Text of a counter: Start → End over the element time, eased like a track,
   * shown as a clock (h:mm:ss or mm:ss) or a grouped number. Separators follow the
   * panel language. @param {any} build @param {any} counter @returns {string} */
  function counterExpression(build, counter) {
    var en = build.locale === "en-US", controls = "thisComp.layer(" + MotionJson.stringify(build.names.controls) + ")";
    var span = counter.span || [0, 1], progress = call({ segments: [{ window: "all", start: span[0], end: span[1], from: 0, to: 1, ease: counter.ease }] });
    var lines = [
      header(build),
      "var c=" + controls + ",f=c.effect(" + MotionJson.stringify(build.counterNames.start) + ")(1),t=c.effect(" + MotionJson.stringify(build.counterNames.end) + ")(1);",
      // A clock runs one second per second whatever the frame rate, and stops at End;
      // numbers follow the eased element time.
      counter.format === "clock"
        ? "var v=f+(t<f?-1:1)*Math.min(Math.abs(t-f),Math.max(0,time)),out;"
        : "var v=f+(t-f)*" + progress + ",out;"
    ];
    if (counter.format === "clock") {
      lines.push("var s=Math.max(0,t<f?Math.ceil(v-1e-6):Math.floor(v+1e-6)),h=Math.floor(s/3600),m=Math.floor(s%3600/60),r=s%60;",
        "var pad=function(n){return (n<10?\"0\":\"\")+n;};",
        "out=(h>0?h+\":\"+pad(m):pad(m))+\":\"+pad(r);");
    } else {
      lines.push("var n=Math.abs(v).toFixed(" + counter.decimals + ").split(\".\");",
        "out=(v<0&&Math.abs(v)>=Math.pow(10,-" + counter.decimals + ")/2?\"-\":\"\")+n[0].replace(/\\B(?=(\\d{3})+(?!\\d))/g," + MotionJson.stringify(en ? "," : ".") + ")+(n.length>1?" + MotionJson.stringify(en ? "." : ",") + "+n[1]:\"\");");
    }
    lines.push(MotionJson.stringify(counter.prefix || "") + "+out+" + MotionJson.stringify(counter.suffix || "") + ";");
    return lines.join("\n");
  }

  /** Expressoes de transformacao da camada: opacidade, escala, rotacao e deslocamento. @param {any} build @param {any} layer @param {any} spec */
  function animateTransform(build, layer, spec) {
    var transform = layer.property("ADBE Transform Group"), tracks = spec.tracks, h = header(build), k = num(build.k);
    var opacity = trackOf(tracks, "opacity"), scale = trackOf(tracks, "scale"), sx = trackOf(tracks, "scaleX"), sy = trackOf(tracks, "scaleY");
    var rotation = trackOf(tracks, "rotation"), x = trackOf(tracks, "x"), y = trackOf(tracks, "y");
    if (opacity) drive(transform.property("ADBE Opacity"), h + call(opacity) + ";");
    if (scale || sx || sy) drive(transform.property("ADBE Scale"), h + "var s=" + (scale ? call(scale) : "100") + ";[s*" + (sx ? call(sx) : "100") + "/100,s*" + (sy ? call(sy) : "100") + "/100];");
    if (rotation) drive(transform.property("ADBE Rotate Z"), h + "value+" + call(rotation) + ";");
    if (x || y) drive(transform.property("ADBE Position"), h + "[value[0]+" + k + "*" + (x ? call(x) : "0") + ",value[1]+" + k + "*" + (y ? call(y) : "0") + "];");
  }

  // ---- Camadas --------------------------------------------------------------

  /** @param {any} build @param {any[]} position @returns {number[]} */
  function place(build, position) { return [build.origin[0] + position[0] * build.k, build.origin[1] + position[1] * build.k]; }
  /** @param {any} element @param {string} id @returns {any} */
  function textSpec(element, id) { for (var i = 0; i < element.layers.length; i++) if (element.layers[i].type === "text" && element.layers[i].id === id) return element.layers[i]; return null; }
  /** @param {string} name @returns {string|null} */
  function font(name) {
    try {
      var fonts = /** @type {any} */ (app).fonts;
      if (fonts && typeof fonts.getFontsByPostScriptName === "function") { var list = fonts.getFontsByPostScriptName(name); if (!list || !list.length) return null; }
    } catch (unknownFonts) { /* Hosts before AE 24 have no font list; the name is still applied. */ }
    return name;
  }

  /** @param {any} build @param {any} spec @returns {any} */
  function addText(build, spec) {
    var value = spec.counter ? "0" : String(build.plan.texts[spec.id] || "").replace(/\r\n|\n/g, "\r");
    var layer = build.inner.layers.addText(value);
    layer.name = build.names[spec.id];
    var source = layer.property("ADBE Text Properties").property("ADBE Text Document"), doc = source.value, face = font(spec.bold ? FONTS.bold : FONTS.regular);
    if (face) doc.font = face;
    else if (!build.fontWarned) {
      build.fontWarned = true;
      build.warnings.push({ code: "elements.fontFallback", message: build.locale === "en-US" ? "Arial is missing; the text keeps the default font." : "A fonte Arial não está instalada; o texto usa a fonte padrão.", details: { font: spec.bold ? FONTS.bold : FONTS.regular } });
    }
    doc.fontSize = Math.max(1, spec.size * build.k);
    doc.applyFill = true; doc.fillColor = [1, 1, 1]; doc.applyStroke = false; doc.tracking = 0;
    doc.justification = spec.align === "center" ? ParagraphJustification.CENTER_JUSTIFY : ParagraphJustification.LEFT_JUSTIFY;
    source.setValue(doc);
    if (spec.counter) drive(source, counterExpression(build, spec.counter));
    var transform = layer.property("ADBE Transform Group");
    // The anchor follows the text box, so the recipe positions the visual
    // center (or left middle) whatever the font metrics are.
    drive(transform.property("ADBE Anchor Point"), "var r=sourceRectAtTime(time,false);[" + (spec.align === "center" ? "r.left+r.width/2" : "r.left") + ",r.top+r.height/2];");
    transform.property("ADBE Position").setValue(place(build, spec.position));
    var fill = layer.property("ADBE Effect Parade").addProperty("ADBE Fill");
    fill.name = build.colorNames[spec.color];
    drive(layer.property("ADBE Effect Parade").property(1).property("ADBE Fill-0002"), colorRef(build, spec.color) + ";");
    animateTransform(build, layer, spec);
    return layer;
  }

  /** @param {any} layer @returns {any} */
  function contents(layer) { return layer.property("ADBE Root Vectors Group").property(1).property("ADBE Vectors Group"); }

  /** @param {any} build @param {any} spec @param {any} g */
  function addGeometry(build, spec, g) {
    var k = build.k, group = contents(g.layer), i;
    if (g.shape === "ellipse") {
      group.addProperty("ADBE Vector Shape - Ellipse");
      contents(g.layer).property("ADBE Vector Shape - Ellipse").property("ADBE Vector Ellipse Size").setValue([g.size[0] * k, g.size[1] * k]);
    } else if (g.shape === "star") {
      group.addProperty("ADBE Vector Shape - Star");
      var star = contents(g.layer).property("ADBE Vector Shape - Star");
      star.property("ADBE Vector Star Type").setValue(STAR); star.property("ADBE Vector Star Points").setValue(g.points);
      star.property("ADBE Vector Star Outer Radius").setValue(g.outer * k); star.property("ADBE Vector Star Inner Radius").setValue(g.inner * k);
    } else if (g.shape === "path") {
      group.addProperty("ADBE Vector Shape - Group");
      var path = new Shape(), vertices = [];
      for (i = 0; i < g.points.length; i++) vertices.push([g.points[i][0] * k, g.points[i][1] * k]);
      path.vertices = vertices; path.closed = g.closed;
      contents(g.layer).property("ADBE Vector Shape - Group").property("ADBE Vector Shape").setValue(path);
    } else {
      group.addProperty("ADBE Vector Shape - Rect");
      var rect = contents(g.layer).property("ADBE Vector Shape - Rect");
      rect.property("ADBE Vector Rect Size").setValue([g.size[0] * k, g.size[1] * k]);
      rect.property("ADBE Vector Rect Position").setValue(g.offset ? [g.offset[0] * k, g.offset[1] * k] : [0, 0]);
      if (g.roundness) rect.property("ADBE Vector Rect Roundness").setValue(g.roundness * k);
      if (g.fit) fit(build, spec, g, rect);
    }
  }

  /** Retangulo que acompanha o texto medido. @param {any} build @param {any} spec @param {any} g @param {any} rect */
  function fit(build, spec, g, rect) {
    var text = textSpec(build.element, g.fit.layer), k = build.k, p = g.fit.pad;
    if (!text) throw new Error("A receita pede uma caixa para um texto que não existe: " + g.fit.layer);
    var dx = num((text.position[0] - spec.position[0]) * k), dy = num((text.position[1] - spec.position[1]) * k);
    var l = num(p[0] * k), t = num(p[1] * k), r = num(p[2] * k), b = num(p[3] * k), byX = g.fit.axis === "x";
    var measure = "var m=thisComp.layer(" + MotionJson.stringify(build.names[g.fit.layer]) + ").sourceRectAtTime(time,false);\n";
    var width = "Math.max(" + num(g.size[0] * k) + ",m.width+" + l + "+" + r + ")";
    drive(rect.property("ADBE Vector Rect Size"), measure + "[" + width + "," + (byX ? num(g.size[1] * k) : "Math.max(" + num(g.size[1] * k) + ",m.height+" + t + "+" + b + ")") + "];");
    var x = text.align === "center" ? dx + "+(" + r + "-" + l + ")/2" : dx + "-" + l + "+" + width + "/2";
    drive(rect.property("ADBE Vector Rect Position"), measure + "[" + x + "," + (byX ? "0" : dy + "+(" + b + "-" + t + ")/2") + "];");
  }

  /** @param {any} build @param {any} spec @returns {any} */
  function addShape(build, spec) {
    var layer = build.inner.layers.addShape(), k = build.k, h = header(build), g = spec.geometry;
    layer.name = build.names[spec.id];
    layer.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group");
    addGeometry(build, spec, { layer: layer, shape: g.shape, size: g.size, offset: g.offset, roundness: g.roundness, fit: g.fit, points: g.points, closed: g.closed, outer: g.outer, inner: g.inner });
    var trimStart = trackOf(spec.tracks, "trimStart"), trimEnd = trackOf(spec.tracks, "trimEnd"), trimOffset = trackOf(spec.tracks, "trimOffset");
    if (trimStart || trimEnd || trimOffset) {
      contents(layer).addProperty("ADBE Vector Filter - Trim");
      var trim = contents(layer).property("ADBE Vector Filter - Trim");
      if (trimStart) drive(trim.property("ADBE Vector Trim Start"), h + call(trimStart) + ";");
      if (trimEnd) drive(trim.property("ADBE Vector Trim End"), h + call(trimEnd) + ";");
      if (trimOffset) drive(contents(layer).property("ADBE Vector Filter - Trim").property("ADBE Vector Trim Offset"), h + call(trimOffset) + ";");
    }
    if (typeof spec.stroke === "number") {
      contents(layer).addProperty("ADBE Vector Graphic - Stroke");
      var stroke = contents(layer).property("ADBE Vector Graphic - Stroke"), width = trackOf(spec.tracks, "strokeWidth");
      stroke.property("ADBE Vector Stroke Width").setValue(spec.stroke * k);
      if (width) drive(stroke.property("ADBE Vector Stroke Width"), h + num(k) + "*" + call(width) + ";");
      stroke.property("ADBE Vector Stroke Line Cap").setValue(CAP_ROUND);
      stroke.property("ADBE Vector Stroke Line Join").setValue(JOIN_ROUND);
      drive(contents(layer).property("ADBE Vector Graphic - Stroke").property("ADBE Vector Stroke Color"), colorRef(build, spec.color) + ";");
    } else {
      contents(layer).addProperty("ADBE Vector Graphic - Fill");
      drive(contents(layer).property("ADBE Vector Graphic - Fill").property("ADBE Vector Fill Color"), colorRef(build, spec.color) + ";");
    }
    if (spec.repeater) {
      contents(layer).addProperty("ADBE Vector Filter - Repeater");
      var repeater = contents(layer).property("ADBE Vector Filter - Repeater");
      repeater.property("ADBE Vector Repeater Copies").setValue(spec.repeater.copies);
      var copy = contents(layer).property("ADBE Vector Filter - Repeater").property("ADBE Vector Repeater Transform");
      copy.property("ADBE Vector Repeater Position").setValue([0, 0]);
      copy.property("ADBE Vector Repeater Rotation").setValue(spec.repeater.rotation);
    }
    var transform = layer.property("ADBE Transform Group");
    transform.property("ADBE Position").setValue(place(build, spec.position));
    if (typeof spec.rotation === "number") transform.property("ADBE Rotate Z").setValue(spec.rotation);
    animateTransform(build, layer, spec);
    return layer;
  }

  /** @param {any} build @returns {any} */
  function addControls(build) {
    var layer = build.inner.layers.addNull(build.inner.duration);
    build.created.solids.push(layer.source);
    layer.name = build.names.controls; layer.guideLayer = true;
    var used = roles(build.element, "color");
    for (var i = 0; i < used.length; i++) {
      var role = used[i], rgb = build.plan.colors[role];
      layer.property("ADBE Effect Parade").addProperty("ADBE Color Control");
      var control = layer.property("ADBE Effect Parade").property(i + 1);
      control.name = build.colorNames[role];
      control.property("ADBE Color Control-0001").setValue([rgb[0], rgb[1], rgb[2], 1]);
    }
    var counter = counterSpec(build.element);
    if (counter) {
      var ends = /** @type {Array<[string, number]>} */ ([["start", counter.from], ["end", counter.to]]);
      for (var e = 0; e < ends.length; e++) {
        var end = /** @type {[string, number]} */ (ends[e]);
        // Re-read the parade: adding an effect invalidates earlier handles.
        layer.property("ADBE Effect Parade").addProperty("ADBE Slider Control");
        var parade = layer.property("ADBE Effect Parade"), slider = parade.property(parade.numProperties);
        slider.name = build.counterNames[end[0]];
        slider.property("ADBE Slider Control-0001").setValue(end[1]);
      }
    }
    return layer;
  }

  /** @param {any} property @param {any} comp @param {string} name @param {any} build */
  function expose(property, comp, name, build) {
    if (typeof property.addToMotionGraphicsTemplateAs !== "function" || !property.canAddToMotionGraphicsTemplate(comp)) {
      throw new Error("Este After Effects não publica " + name + " nas Propriedades essenciais.");
    }
    if (!property.addToMotionGraphicsTemplateAs(comp, name)) throw new Error("Não foi possível publicar " + name + " nas Propriedades essenciais.");
    build.controllers.push(name);
  }

  // ---- Projeto --------------------------------------------------------------

  /** @param {any} project @param {any} parent @param {string} tag @param {string} name @param {any} build @returns {any} */
  function folder(project, parent, tag, name, build) {
    for (var i = 1; i <= project.numItems; i++) {
      var item = project.item(i);
      if (item instanceof FolderItem && /** @type {any} */ (item).parentFolder === parent && String(/** @type {any} */ (item).comment || "").indexOf(tag) >= 0) return item;
    }
    var created = project.items.addFolder(name);
    created.parentFolder = parent; created.comment = tag;
    build.created.folders.push(created);
    return created;
  }
  /** @param {any} project @param {any} file @returns {any} */
  function existingFootage(project, file) {
    for (var i = 1; i <= project.numItems; i++) {
      var item = project.item(i);
      var footage = /** @type {any} */ (item);
      if (item instanceof FootageItem && footage.file && footage.file.fsName === file.fsName && !footage.footageMissing && footage.hasAudio) return item;
    }
    return null;
  }
  /** @param {any} project @param {any} parent @param {string} base @returns {string} */
  function uniqueName(project, parent, base) {
    var taken = {}, i;
    for (i = 1; i <= project.numItems; i++) { var item = project.item(i); if (item.parentFolder === parent) /** @type {any} */ (taken)[item.name] = true; }
    if (!/** @type {any} */ (taken)[base]) return base;
    for (i = 2; /** @type {any} */ (taken)[base + " " + i]; i++) { /* next free serial */ }
    return base + " " + i;
  }

  /** @param {any} build */
  function rollback(build) {
    var failed = false, i;
    var parts = [build.created.layer, build.created.inner];
    for (i = 0; i < parts.length; i++) if (parts[i]) try { parts[i].remove(); } catch (removeError) { failed = true; }
    for (i = 0; i < build.created.solids.length; i++) try { if (build.created.solids[i].usedIn.length === 0) build.created.solids[i].remove(); } catch (solidError) { failed = true; }
    if (build.created.footage) try { if (build.created.footage.usedIn.length === 0) build.created.footage.remove(); else failed = true; } catch (footageError) { failed = true; }
    for (i = build.created.folders.length - 1; i >= 0; i--) try { if (build.created.folders[i].numItems === 0) build.created.folders[i].remove(); } catch (folderError) { failed = true; }
    return !failed;
  }

  /** @param {Record<string, any>} args @returns {MotionCommandResult} */
  function run(args) {
    var plan = staged; staged = null;
    if (!plan || plan.fingerprint !== MotionJson.stringify(args) || app.project !== plan.project || plan.project.activeItem !== plan.comp || (plan.file && !plan.file.exists)) {
      throw new Error("A inserção do elemento precisa de um preflight atualizado.");
    }
    var project = plan.project, comp = plan.comp, element = plan.element, locale = plan.locale, time = comp.time, selected = comp.selectedLayers;
    var scale = Math.min(comp.width / REFERENCE[0], comp.height / REFERENCE[1]) * plan.plan.size / 100;
    var build = /** @type {any} */ ({
      element: element, plan: plan.plan, locale: locale, k: scale, origin: [element.origin[0] * comp.width, element.origin[1] * comp.height],
      names: {}, colorNames: {}, counterNames: { start: COUNTER_NAMES.start[locale], end: COUNTER_NAMES.end[locale] }, controllers: [], warnings: [], fontWarned: false, inner: null,
      created: { layer: null, inner: null, solids: [], footage: null, folders: [] }
    });
    var key;
    for (key in lib().layerNames) if (Object.prototype.hasOwnProperty.call(lib().layerNames, key)) /** @type {any} */ (build.names)[key] = lib().layerNames[key][locale];
    for (key in lib().colorNames) if (Object.prototype.hasOwnProperty.call(lib().colorNames, key)) /** @type {any} */ (build.colorNames)[key] = lib().colorNames[key][locale];
    var layer, inner, i;
    try {
      var home = folder(project, project.rootFolder, FOLDER_TAG, FOLDER[locale], build);
      var duration = plan.plan.durationFrames / comp.frameRate;
      inner = project.items.addComp(uniqueName(project, home, "Moti.on · " + element.name[locale]), comp.width, comp.height, comp.pixelAspect, duration, comp.frameRate);
      build.created.inner = inner; build.inner = inner;
      inner.parentFolder = home;
      var record = { schemaVersion: 1, elementId: element.id, durationFrames: plan.plan.durationFrames, animationFrames: plan.plan.animationFrames, size: plan.plan.size, sound: plan.plan.sound };
      inner.comment = OPEN + MotionJson.stringify(record) + CLOSE;
      addControls(build);
      var made = {};
      // Recipes list layers in paint order (first = bottom); AE stacks each new layer on top.
      for (i = 0; i < element.layers.length; i++) {
        var spec = element.layers[i];
        /** @type {any} */ (made)[spec.id] = spec.type === "text" ? addText(build, spec) : addShape(build, spec);
      }
      if (plan.file) {
        var footage = existingFootage(project, plan.file);
        if (!footage) {
          footage = project.importFile(plan.options); build.created.footage = footage;
          footage.parentFolder = folder(project, home, SOUND_TAG, SOUND_FOLDER[locale], build);
        }
        if (!(footage instanceof FootageItem) || !/** @type {any} */ (footage).hasAudio) throw new Error("O som importado não tem áudio.");
        var audio = inner.layers.add(footage);
        audio.startTime = element.soundFrame / comp.frameRate;
        audio.moveToEnd();
      }
      var textRoles = roles(element, "text"), colorRoles = roles(element, "color");
      for (i = 0; i < textRoles.length; i++) expose(/** @type {any} */ (made)[textRoles[i]].property("ADBE Text Properties").property("ADBE Text Document"), inner, build.names[textRoles[i]], build);
      var controls = inner.layer(build.names.controls).property("ADBE Effect Parade");
      for (i = 0; i < colorRoles.length; i++) expose(controls.property(build.colorNames[colorRoles[i]]).property("ADBE Color Control-0001"), inner, build.colorNames[colorRoles[i]], build);
      if (counterSpec(element)) {
        expose(controls.property(build.counterNames.start).property("ADBE Slider Control-0001"), inner, build.counterNames.start, build);
        expose(controls.property(build.counterNames.end).property("ADBE Slider Control-0001"), inner, build.counterNames.end, build);
      }
      try { inner.motionGraphicsTemplateName = inner.name; } catch (templateName) { /* Optional label of the Essential Graphics panel. */ }
      layer = comp.layers.add(inner);
      build.created.layer = layer;
      layer.startTime = time;
      layer.comment = OPEN + MotionJson.stringify(record) + CLOSE;
      layer.collapseTransformation = true;
      for (i = 1; i <= comp.numLayers; i++) comp.layer(i).selected = false;
      layer.selected = true;
      comp.time = time;
    } catch (error) {
      var restored = rollback(build);
      try { comp.time = time; for (i = 1; i <= comp.numLayers; i++) comp.layer(i).selected = false; for (i = 0; i < selected.length; i++) selected[i].selected = true; } catch (selectionError) { restored = false; }
      if (!restored) {
        var rollbackError = /** @type {Error & {cause?: unknown, motionCode?: string}} */ (new Error("O elemento falhou e não foi possível desfazer tudo; use Desfazer."));
        rollbackError.cause = error; rollbackError.motionCode = MotionContracts.ERROR.ROLLBACK_FAILED;
        throw rollbackError;
      }
      throw error;
    }
    return { changed: true, warnings: build.warnings, data: {
      elementId: element.id, compName: inner.name, layerIndex: layer.index, controllers: build.controllers,
      sound: plan.plan.soundId, importedSound: build.created.footage !== null, durationFrames: plan.plan.durationFrames
    } };
  }

  MotionRegistry.register("ae.elements.insert", { preflight: preflight, run: run });
}());
