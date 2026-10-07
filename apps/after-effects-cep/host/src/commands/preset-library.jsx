/** Original built-in motion library. Owns only tagged expressions and newly added
 * effects/animators/masks. Existing keys and expressions are never replaced. */
(function (global) {
  /* global CameraLayer, Shape, KeyframeInterpolationType, MarkerValue */
  var core = /** @type {any} */ (global).MotionLibraryCore;
  var catalog = /** @type {any} */ (global).MotionLibraryCatalog;
  var cameraTransition = /** @type {any} */ (global).MotionCameraTransition;
  var TAG = "[Moti.on.library.v1]";
  var MN_TRANSFORM = "ADBE Transform Group";
  var MN_EFFECTS = "ADBE Effect Parade";
  var MN_TEXT = "ADBE Text Properties";
  var MN_ANIMATORS = "ADBE Text Animators";
  var NATIVE_CORE = "CHMS Motion Core";
  var CONTROL_KEYS = ["durationFrames", "intensity", "staggerFrames"];
  var CONTROL_LABELS = ["Duração (frames)", "Intensidade (%)", "Intervalo do texto (frames)"];
  var CONTROL_LABELS_EN = ["Duration (frames)", "Intensity (%)", "Text stagger (frames)"];
  /** @param {string} code @param {string} message @returns {MotionCommandFailure} */
  function fail(code, message) { return {code: code, message: message, recoverable: true, details: null}; }
  /** @param {any} args @returns {any} */
  function definition(args) { if(!catalog||!args)return null;for (var i = 0; i < catalog.length; i++) if (catalog[i].id === args.presetId) return catalog[i]; return null; }
  /** Marker ownership is carried by parameters, so users may rename or move
   * their timing cues. Comment text alone never grants permission to delete.
   * @param {any} layer @returns {any} */
  function markerProperty(layer) {
    var p=layer.property("ADBE Marker");
    return typeof MarkerValue!=="undefined"&&p&&typeof p.setValueAtTime==="function"&&typeof p.keyValue==="function"?p:null;
  }
  /** @param {any} value @param {any} meta @returns {string} */
  function markerRole(value,meta) {
    if(!meta||!value||typeof value.getParameters!=="function")return "";
    var params=value.getParameters(),role=params["Moti.on.phase"];
    return params["Moti.on.instance"]===meta.instance&&(role==="in"||role==="out"||role==="both")?role:"";
  }
  /** @param {any} layer @param {any} meta @returns {any} */
  function markerState(layer,meta) {
    var prop=markerProperty(layer),result={inTime:null,outTime:null,count:0,duplicate:false};
    if(!prop||!meta)return result;
    for(var i=1;i<=prop.numKeys;i++){
      var role=markerRole(prop.keyValue(i),meta);if(!role)continue;result.count++;
      if(role!=="out"){if(result.inTime!==null)result.duplicate=true;result.inTime=prop.keyTime(i);}
      if(role!=="in"){if(result.outTime!==null)result.duplicate=true;result.outTime=prop.keyTime(i);}
    }
    return result;
  }
  /** @param {any} layer @param {any} meta @returns {any[]} */
  function snapshotMarkers(layer,meta) {
    var p=markerProperty(layer),items=/** @type {any[]} */ ([]);if(!p)return items;
    for(var i=1;i<=p.numKeys;i++)if(markerRole(p.keyValue(i),meta))items.push({time:p.keyTime(i),value:p.keyValue(i)});
    return items;
  }
  /** @param {any} layer @param {any} meta */
  function removeMarkers(layer,meta) {
    var p=markerProperty(layer);if(!p)return;
    for(var i=p.numKeys;i>=1;i--)if(markerRole(p.keyValue(i),meta))p.removeKey(i);
  }
  /** @param {any} layer @param {any} meta @param {any[]} items */
  function restoreMarkers(layer,meta,items) {
    var p=markerProperty(layer);if(!p)return;removeMarkers(layer,meta);
    for(var i=0;i<items.length;i++)p.setValueAtTime(items[i].time,items[i].value);
  }
  /** Preserve hand-positioned cues until duration is explicitly changed.
   * @param {any} layer @param {any} meta @param {any} args @param {any} comp @returns {any[]} */
  function markerTargets(layer,meta,args,comp) {
    var state=markerState(layer,meta),span=layer.outPoint-layer.inPoint,duration=Math.min(args.durationFrames*comp.frameDuration,span/(args.phase==="both"?2:1));
    var preserve=meta&&meta.markerVersion===1&&meta.options&&meta.options.durationFrames===args.durationFrames;
    var input=args.phase!=="out"?(preserve&&state.inTime!==null?state.inTime:layer.inPoint+duration):null;
    var output=args.phase!=="in"?(preserve&&state.outTime!==null?state.outTime:layer.outPoint-duration):null;
    if(input!==null&&output!==null&&Math.abs(input-output)<.000001)return [{role:"both",time:input}];
    var result=[];if(input!==null)result.push({role:"in",time:input});if(output!==null)result.push({role:"out",time:output});return result;
  }
  /** @param {any} layer @param {any} meta @param {any} args @param {any} comp @returns {MotionCommandFailure|null} */
  function markerPreflight(layer,meta,args,comp) {
    var prop=markerProperty(layer);if(!prop)return null;
    var state=markerState(layer,meta),targets=markerTargets(layer,meta,args,comp);
    if(prop.numKeys-state.count+targets.length>250)return fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE,"A camada excederia 250 marcadores incluindo os marcadores In/Out. Reduza os marcadores antes de aplicar o preset.");
    if(state.duplicate)return fail(MotionContracts.ERROR.INVALID_PRESET,"Há marcadores de timing duplicados. Remova a cópia antes de ajustar o preset.");
    for(var i=1;i<=prop.numKeys;i++)if(!markerRole(prop.keyValue(i),meta))for(var j=0;j<targets.length;j++)if(Math.abs(prop.keyTime(i)-targets[j].time)<.000001)return fail(MotionContracts.ERROR.KEYFRAME_CONFLICT||MotionContracts.ERROR.INVALID_PRESET,"Um marcador existente ocupa o fim da entrada ou o início da saída. Mova esse marcador ou escolha outra duração.");
    return null;
  }
  /** @param {any} plan */
  function applyMarkers(plan) {
    var prop=markerProperty(plan.layer),meta=plan.meta;if(!prop||plan.p.mode!=="transition")return;
    var targets=markerTargets(plan.layer,meta,plan.args,plan.comp);
    plan.markerSnapshots=snapshotMarkers(plan.layer,meta);plan.markersTouched=true;
    removeMarkers(plan.layer,meta);
    for(var i=0;i<targets.length;i++){
      var t=targets[i],value=/** @type {any} */ (new MarkerValue(t.role==="both"?"Moti.on In / Out":t.role==="in"?"Moti.on In":"Moti.on Out"));
      for(var prior=0;prior<plan.markerSnapshots.length;prior++)if(markerRole(plan.markerSnapshots[prior].value,meta)===t.role){value=plan.markerSnapshots[prior].value;break;}
      var params=value.getParameters();params["Moti.on.instance"]=meta.instance;params["Moti.on.phase"]=t.role;value.setParameters(params);prop.setValueAtTime(t.time,value);
    }
    if(!meta.markerVersion||!meta.options||meta.options.durationFrames!==plan.args.durationFrames)meta.markerDurationFrames=plan.args.durationFrames;
    meta.markerVersion=1;
  }
  /** Serialized only for marker-enabled transition instances. The native duration
   * slider scales each cue span; dragging cues sets independent In/Out durations.
   * @param {any} meta @returns {string} */
  function markerExpression(meta) {
    if(meta.markerVersion!==1)return "";
    return "var markerIn=dur,markerOut=dur,markerScale=dur/("+meta.markerDurationFrames+"*thisComp.frameDuration);\n"+
      "var cues=thisLayer.marker;for(var mi=1;mi<=Math.min(cues.numKeys,250);mi++){var cue=cues.key(mi),params=cue.parameters;if(params[\"Moti.on.instance\"]==="+MotionJson.stringify(meta.markerInstance||meta.instance)+"){var role=params[\"Moti.on.phase\"];if(role===\"in\"||role===\"both\")markerIn=(cue.time-inPoint)*markerScale;if(role===\"out\"||role===\"both\")markerOut=(outPoint-cue.time)*markerScale;}}\n"+
      "var markerSpan=Math.max(.0001,outPoint-inPoint);markerIn=Math.max(.0001,Math.min(markerSpan,markerIn));markerOut=Math.max(.0001,Math.min(markerSpan,markerOut));\n";
  }
  /** @param {any} layer @returns {any} */
  function metadata(layer) {
    var comment = String(layer.comment || ""), at = comment.indexOf(TAG);
    if (at < 0) return null;
    var line = comment.substring(at + TAG.length).split("\n")[0] || "";
    var m = /** @type {any} */ (MotionJson.parse(decodeURIComponent(line)));
    if (!m || m.version !== 1 || typeof m.instance !== "string" || !/^[0-9-]+$/.test(m.instance) || !definition({presetId:m.presetId}) || !(m.expressions instanceof Array) || !(m.effects instanceof Array) || !(m.animators instanceof Array) || !(m.masks instanceof Array)) throw new Error("Metadados do preset inválidos.");
    if(m.markerVersion!==undefined&&(m.markerVersion!==1||typeof m.markerDurationFrames!=="number"||!isFinite(m.markerDurationFrames)||m.markerDurationFrames<1||m.markerDurationFrames>600))throw new Error("Metadados de timing inválidos.");
    return m;
  }
  /** @param {any} layer @param {any} meta */
  function saveMetadata(layer, meta) {
    var comment = String(layer.comment || "");
    var start = comment.indexOf(TAG);
    if (start >= 0) {
      var end = comment.indexOf("\n", start);
      comment = comment.substring(0, start > 0 && comment.charAt(start - 1) === "\n" ? start - 1 : start) + (end < 0 ? "" : comment.substring(end));
    }
    layer.comment = comment + (meta ? (comment ? "\n" : "") + TAG + encodeURIComponent(MotionJson.stringify(meta)) : "");
  }
  /** @param {any} group @param {string} name @returns {any} */
  function child(group,name) { if(!group)return null;for(var i=1;i<=group.numProperties;i++){var p=group.property(i);if(p.name===name||p.matchName===name)return p;}return null; }
  /** @param {any} layer @param {any[]} path @returns {any} */
  function locate(layer, path) { var p = layer; for (var i = 0; p && i < path.length; i++) p = child(p,path[i]); return p; }
  /** Resolve indexed groups by their unique owned name; adding another effect
   * invalidates AE property objects, so rollback keeps paths instead of objects.
   * @param {any} prop @returns {any[]} */
  function propertyPath(prop) {
    var path=[],p=prop;
    while(p && p.parentProperty) {
      var parent=p.parentProperty,mn=parent.matchName;
      path.unshift(mn===MN_EFFECTS || mn===MN_ANIMATORS || mn==="ADBE Text Selectors" || mn==="ADBE Mask Parade" ? p.name : p.matchName);
      p=parent;
    }
    return path;
  }
  /** @param {any} p @returns {any} */
  function snapshot(p) { return {path:propertyPath(p), value:p.valueAtTime(0,true), expression:p.canSetExpression ? p.expression : "", enabled:p.canSetExpression ? p.expressionEnabled : false, keys:p.numKeys || 0}; }
  /** @param {any} layer @param {any[]} snapshots */
  function restore(layer,snapshots) {
    for (var i = snapshots.length - 1; i >= 0; i--) {
      var s = snapshots[i], p = locate(layer,s.path);
      if (p.canSetExpression) p.expression = "";
      if (!s.keys && !p.numKeys) p.setValue(s.value);
      if (p.canSetExpression) { p.expression = s.expression; p.expressionEnabled = s.enabled; }
    }
  }
  /** @param {any} meta @returns {string} */
  function prefix(meta) { return "// Moti.on preset v1:" + meta.instance + "\n"; }
  /** @param {any} layer @param {any} meta @returns {MotionCommandFailure|null} */
  function verifyOwnership(layer, meta) {
    if (!meta) return null;
    for (var i = 0; i < meta.expressions.length; i++) {
      var p = locate(layer, meta.expressions[i].path);
      if (!p || p.expression.indexOf(prefix(meta)) !== 0) return fail(MotionContracts.ERROR.EXPRESSION_CONFLICT, "Uma expressão do preset foi alterada. Desfaça essa alteração antes de ajustar ou remover o preset.");
    }
    var groups = /** @type {any} */ ([[MN_EFFECTS, meta.effects], [MN_TEXT, meta.animators], ["ADBE Mask Parade", meta.masks]]);
    for (i = 0; i < groups.length; i++) {
      var records = groups[i][1];
      var group = layer.property(groups[i][0]);
      if (i === 1 && group) group = group.property(MN_ANIMATORS);
      for (var j = 0; j < records.length; j++) {
        var e = group && child(group,records[j].name);
        if (!e || e.matchName !== records[j].matchName) return fail(MotionContracts.ERROR.INVALID_PRESET, "Um controle do preset foi removido ou renomeado. Desfaça essa alteração antes de continuar.");
      }
    }
    return null;
  }
  /** @param {any} args @returns {MotionCommandFailure|null} */
  function validate(args) {
    var allowed = /** @type {Record<string,boolean>} */ ({presetId:true, phase:true, direction:true, durationFrames:true, intensity:true, staggerFrames:true, unit:true,easing:true,elasticity:true,overlap:true,speed:true,order:true,seed:true});
    for (var k in args) if (Object.prototype.hasOwnProperty.call(args,k) && !allowed[k]) return fail(MotionContracts.ERROR.INVALID_PRESET,"Opção de preset desconhecida.");
    if (!definition(args) || (args.phase !== "in" && args.phase !== "out" && args.phase !== "both") || (args.direction !== "preset" && args.direction !== "left" && args.direction !== "right" && args.direction !== "top" && args.direction !== "bottom")) return fail(MotionContracts.ERROR.INVALID_PRESET,"Preset, fase ou direção inválidos.");
    if (typeof args.durationFrames !== "number" || !isFinite(args.durationFrames) || args.durationFrames < 1 || args.durationFrames > 600 || Math.floor(args.durationFrames) !== args.durationFrames || typeof args.intensity !== "number" || !isFinite(args.intensity) || args.intensity < 0 || args.intensity > 300 || typeof args.staggerFrames !== "number" || !isFinite(args.staggerFrames) || args.staggerFrames < 0 || args.staggerFrames > 60 || Math.floor(args.staggerFrames) !== args.staggerFrames) return fail(MotionContracts.ERROR.INVALID_PRESET,"Duração, intensidade ou intervalo fora do limite.");
    if(Object.prototype.hasOwnProperty.call(args,"easing")&&args.easing!=="preset"&&args.easing!=="smooth"&&args.easing!=="cubic"&&args.easing!=="overshoot"&&args.easing!=="bounce"&&args.easing!=="flicker"&&args.easing!=="silk"&&args.easing!=="glide"&&args.easing!=="spring")return fail(MotionContracts.ERROR.INVALID_PRESET,"Suavização inválida.");
    var optional=["elasticity","overlap","speed"];
    for(var o=0;o<optional.length;o++){var option=optional[o];if(!option||!Object.prototype.hasOwnProperty.call(args,option))continue;
      var v=args[option],min=option==="speed"?25:0,max=option==="speed"?200:100;
      if(typeof v!=="number"||!isFinite(v)||v<min||v>max)return fail(MotionContracts.ERROR.INVALID_PRESET,"Elasticidade, sobreposição ou velocidade fora do limite.");
    }
    if (args.unit !== "preset" && args.unit !== "characters" && args.unit !== "words" && args.unit !== "lines" && args.unit !== "all") return fail(MotionContracts.ERROR.INVALID_PRESET,"Divisão de texto inválida.");
    if (Object.prototype.hasOwnProperty.call(args,"order") && args.order !== "preset" && args.order !== "forward" && args.order !== "reverse" && args.order !== "center-out" && args.order !== "edges-in" && args.order !== "random") return fail(MotionContracts.ERROR.INVALID_PRESET,"Ordem de texto inválida.");
    if (Object.prototype.hasOwnProperty.call(args,"seed") && (typeof args.seed !== "number" || !isFinite(args.seed) || Math.floor(args.seed) !== args.seed || args.seed < 0 || args.seed > 9999)) return fail(MotionContracts.ERROR.INVALID_PRESET,"Variação fora do limite.");
    return null;
  }
  /** @param {any} p @returns {boolean} */
  function isText(p) { return p.category.indexOf("text-") === 0; }
  /** @param {any} p @returns {boolean} */
  function usesNativeCore(p) { return p.effect === "native-rgb" || p.effect === "native-glitch"; }
  /** The renderer contract is verified independently of translated labels.
   * @param {any} effect @returns {boolean} */
  function nativeCoreCompatible(effect) {
    for (var i = 1; i <= 5; i++) if (!effect || !effect.property(NATIVE_CORE + "-000" + i)) return false;
    return true;
  }
  /** @param {any} p @returns {string[]} */
  function requiredEffects(p) {
    var r = ["ADBE Slider Control"];
    if (p.effect.indexOf("camera-") === 0) r.push("ADBE Gaussian Blur 2");
    if (p.effect === "camera-dark" || p.effect === "camera-light") r.push("ADBE Tint");
    if (p.effect === "camera-distort" || p.effect === "camera-shake") r.push("ADBE Turbulent Displace");
    if (p.effect === "blur" || p.effect === "blur-wave") r.push("ADBE Gaussian Blur 2");
    if (p.effect === "blur-wave") r.push("ADBE Wave Warp");
    if (p.effect === "duotone" || p.effect === "chroma2") r.push("ADBE Tint");
    if (p.effect === "rgb" || p.effect === "chroma2") r.push("Mettle SkyBox Chromatic Aberrat");
    if (usesNativeCore(p)) r.push(NATIVE_CORE);
    if (p.effect === "contrast") { r.push("ADBE Brightness & Contrast 2"); r.push("ADBE HUE SATURATION"); }
    if (p.effect === "turbulent") r.push("ADBE Turbulent Displace");
    if (p.effect === "extrude" || p.effect.indexOf("shadow") === 0) r.push("ADBE Drop Shadow");
    if (p.effect === "shadow-stripes") { r.push("ADBE Venetian Blinds"); r.push("CC Composite"); }
    return r;
  }
  /** @param {any} args @param {string} action @param {boolean=} migration @param {any[]=} selectedOverride @param {any=} phaseOwner @returns {MotionCommandFailure|null} */
  function preflight(args, action, migration, selectedOverride, phaseOwner) {
    if (action === "apply") { var validation = validate(args); if (validation) return validation; }
    else { for (var k in args) if (Object.prototype.hasOwnProperty.call(args,k)) return fail(MotionContracts.ERROR.INVALID_PRESET,"Esta ação não recebe parâmetros."); }
    var comp = app.project && app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) return fail(MotionContracts.ERROR.NO_ACTIVE_COMP,"Abra uma composição.");
    var layers = selectedOverride || comp.selectedLayers;
    if (!layers.length) return fail(MotionContracts.ERROR.NO_SELECTION,"Selecione uma camada na composição.");
    if (layers.length > 50) return fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE,"Aplique a até 50 camadas por vez.");
    if (cameraTransition && cameraTransition.hasSelected(comp)) {
      if (action !== "apply") return cameraTransition.selectionPreflight(action);
      return fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE,"Selecione as camadas de conteúdo para aplicar este preset diretamente. Para editar a pré-comp de transição, use Editar.");
    }
    var p = action === "apply" ? definition(args) : null;
    if (p && p.cameraSpec) return fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE,"Use a transição em pré-comp para este preset; ele processa a composição sem alterar as camadas.");
    for (var i = 0; i < layers.length; i++) {
      var l = /** @type {any} */ (layers[i]);
      if (l.locked || !l.hasVideo || l.nullLayer || l instanceof CameraLayer || l instanceof LightLayer) return fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE,"Selecione camadas visuais desbloqueadas.");
      var m;
      try { m = phaseOwner ? null : metadata(l); } catch (badMetadata) { return fail(MotionContracts.ERROR.INVALID_PRESET,"Os metadados do preset estão incompletos."); }
      var ownership = verifyOwnership(l,m); if (ownership) return ownership;
      if (action !== "apply") {
        if (!m) continue;
        if (action === "bake" && isText(definition({presetId:m.presetId}))) return fail(MotionContracts.ERROR.CAPABILITY_UNAVAILABLE,"Presets de texto permanecem editáveis pelos animadores. A conversão em keyframes está disponível para motion.");
        if (action === "bake" && (l.outPoint-l.inPoint)/comp.frameDuration > 1800) return fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE,"Converta camadas de até 1.800 frames por vez.");
        for (var b = 0; action === "bake" && m && b < m.expressions.length; b++) if (locate(l,m.expressions[b].path).numKeys) return fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE,"A conversão preserva keyframes existentes: escolha uma camada sem keyframes nas propriedades do preset.");
        continue;
      }
      if (m && m.presetId !== p.id) return fail(MotionContracts.ERROR.EXPRESSION_CONFLICT,"A camada já tem outro preset. Use Remover da seleção antes de aplicar este.");
      if (m && !m.expressionVersion && !migration) return fail(MotionContracts.ERROR.EXPRESSION_CONFLICT,"Este preset mantém as expressões da versão anterior. Use Editar e Ajustar para atualizar a animação explicitamente.");
      if (isText(p) && !l.property(MN_TEXT)) return fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE,"Este preset precisa de uma camada de texto.");
      if (p.category === "motion-3d" && !l.threeDLayer && (l.parent || /** @type {any} */ (comp).activeCamera || (l.source instanceof CompItem && l.collapseTransformation))) return fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE,"Converta a camada em 3D antes de usar este preset com câmera, parent ou transformações recolhidas.");
      var tr = l.property(MN_TRANSFORM), pos = tr.property("ADBE Position");
      if (!isText(p) && (p.position[0] || p.position[1] || p.position[2] || p.pivot === "edge") && pos.dimensionsSeparated) return fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE,"Reúna as dimensões de Position para aplicar presets de motion.");
      if (l.outPoint <= l.inPoint) return fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE,"A camada precisa ter duração positiva.");
      if(p.mode==="transition"&&!phaseOwner){var markerError=markerPreflight(l,m,args,comp);if(markerError)return markerError;}
      if (!isText(p)) {
        var names = [];
        if (p.position[0] || p.position[1] || p.position[2] || p.pivot === "edge") names.push("ADBE Position");
        if (p.scale[0] || p.scale[1] || p.scale[2]) names.push("ADBE Scale");
        if (p.rotation[2]) names.push("ADBE Rotate Z");
        if (p.fade) names.push("ADBE Opacity");
        if (l.threeDLayer || p.category === "motion-3d") { if (p.rotation[0]) names.push("ADBE Rotate X"); if (p.rotation[1]) names.push("ADBE Rotate Y"); }
        for (var j = 0; j < names.length; j++) {
          var prop = tr.property(names[j]);
          var phaseOwned=false;
          if(phaseOwner&&prop&&prop.expression)for(var pi=0;pi<phaseOwner.prefixes.length;pi++)if(prop.expression.indexOf(phaseOwner.prefixes[pi])===0)phaseOwned=true;
          if (prop && prop.expression && !phaseOwned && (!m || prop.expression.indexOf(prefix(m)) !== 0)) return fail(MotionContracts.ERROR.EXPRESSION_CONFLICT,"A transformação contém uma expressão existente. Remova o conflito antes de aplicar.");
        }
      }
      var effects = requiredEffects(p), parade = l.property(MN_EFFECTS);
      for (j = 0; j < effects.length; j++) {
        try { if (!parade || !parade.canAddProperty(effects[j])) return fail(MotionContracts.ERROR.CAPABILITY_UNAVAILABLE,"Efeito nativo indisponível: " + effects[j]); }
        catch (capabilityError) { return fail(MotionContracts.ERROR.CAPABILITY_UNAVAILABLE,"Não foi possível verificar o efeito: " + effects[j]); }
      }
      if (m && usesNativeCore(p)) {
        for (j = 0; j < m.effects.length; j++) if (m.effects[j].matchName === NATIVE_CORE && !nativeCoreCompatible(child(parade,m.effects[j].name))) return fail(MotionContracts.ERROR.CAPABILITY_UNAVAILABLE,"CHMS Motion Core incompatível: atualize o plugin para usar os cinco controles deste preset.");
      }
    }
    return null;
  }
  /** Header is generated exclusively from bundled functions and validated values.
   * @param {any} p @param {any} args @param {any} m @param {boolean} text @returns {string} */
  function header(p,args,m,text) {
    var duration = "effect("+MotionJson.stringify(m.effects[0].name)+")(1)", amount = "effect("+MotionJson.stringify(m.effects[1].name)+")(1)", stagger = "effect("+MotionJson.stringify(m.effects[2].name)+")(1)";
    var unit = args.unit === "preset" ? p.text.unit : args.unit,studio=p.collection==="studio"||p.collection==="native"||p.collection==="premium";
    var order=args.order&&args.order!=="preset"?args.order:(p.text.order||(p.text.random?"random":"forward")),sequence="",seed=typeof args.seed==="number"?args.seed:17;
    if(text&&unit!=="all"){
      if(order==="random")sequence="var order="+core.libraryOrder.toString()+";idx=order(idx,total"+(typeof args.seed==="number"||p.collection==="premium"?",seed":"")+");\n";
      else if(order!=="forward")sequence="var sequence="+core.librarySequence.toString()+";idx=sequence(idx,total,"+MotionJson.stringify(order)+");\n";
    }
    return prefix(m) + "var ease="+core.libraryEase.toString()+";\nvar timing="+(studio?core.libraryStudioTiming:core.libraryTiming).toString()+";\nvar wave="+core.libraryWave.toString()+";\n" +
      "var amp=Math.max(0,Math.min(300,"+amount+"))/100;var dur=Math.max(1,Math.min(600,"+duration+"))*thisComp.frameDuration;\n"+
      "var elastic="+controlExpression(m,"elasticity",30)+",overlap="+controlExpression(m,"overlap",65)+",speed="+(studio?"Math.max(25,Math.min(200,"+controlExpression(m,"speed",100)+"))/100":"1")+",age=(time-inPoint)*speed;\n"+
      "var seed=Math.max(0,Math.min(9999,Math.floor("+controlExpression(m,"seed",seed)+")));var idx="+(text && unit !== "all" ? "textIndex-1" : "0")+",rawIndex=idx,total="+(text && unit !== "all" ? "textTotal" : "1")+";\n"+sequence+
      markerExpression(m)+
      (m.markerVersion===1?"var totalSpan="+(args.phase==="both"?"markerIn+markerOut":"0")+";if(totalSpan>markerSpan){markerIn*=markerSpan/totalSpan;markerOut*=markerSpan/totalSpan;}var u=["+(args.phase==="out"?"1":"timing(time,inPoint,outPoint,markerIn,\"in\",idx,total,Math.max(0,Math.min(60,"+stagger+"))*thisComp.frameDuration"+(studio?",overlap":"")+")[0]")+","+(args.phase==="in"?"1":"timing(time,inPoint,outPoint,markerOut,\"out\",idx,total,Math.max(0,Math.min(60,"+stagger+"))*thisComp.frameDuration"+(studio?",overlap":"")+")[1]")+"];\n":
      "var u=timing(time,inPoint,outPoint,dur,"+MotionJson.stringify(args.phase)+",idx,total,Math.max(0,Math.min(60,"+stagger+"))*thisComp.frameDuration"+(studio?",overlap":"")+");\n")+
      "var w="+(p.mode === "transition" ? "2-ease(u[0],"+MotionJson.stringify(args.easing&&args.easing!=="preset"?args.easing:p.easing)+",elastic)-ease(u[1],"+MotionJson.stringify(args.easing&&args.easing!=="preset"?args.easing:p.easing)+",elastic)" : "wave(age,idx,"+MotionJson.stringify(p.waveform === "none" ? "wiggle" : p.waveform)+",seed)")+";var fadeWeight=w;\n"+
      (p.mode === "transition" && p.waveform !== "none" ? "w+=wave(age,idx,"+MotionJson.stringify(p.waveform)+",seed)*Math.abs(w)*0.25;\n" : "")+
      (p.choreography ? "var choreography="+core.libraryChoreography.toString()+";var pose=choreography(Math.max(0,Math.min(1,Math.min(u[0],u[1]))),w,"+p.position.join(",")+","+MotionJson.stringify(p.choreography.path)+","+MotionJson.stringify(p.choreography.distribution||"uniform")+",rawIndex,seed,"+(typeof p.choreography.turns==="number"?p.choreography.turns:1)+","+MotionJson.stringify(args.direction)+");\n" : "");
  }
  /** @param {any} meta @param {string} key @param {number} fallback @returns {string} */
  function controlExpression(meta,key,fallback){return meta.controls&&meta.controls[key]?"effect("+MotionJson.stringify(meta.controls[key])+")(1)":String(fallback);}
  /** @param {any} plan @param {any[]} path @param {string} expression */
  function express(plan,path,expression) {
    var prop = locate(plan.layer,path);
    if (!prop || !prop.canSetExpression) throw new Error("A propriedade do preset não aceita expressão: "+path.join("/")+"");
    plan.snapshots.push(snapshot(prop));
    var known = false;
    for (var i=0;i<plan.meta.expressions.length;i++) if (MotionJson.stringify(plan.meta.expressions[i].path) === MotionJson.stringify(path)) known=true;
    if (!known) plan.meta.expressions.push({path:path,original:prop.expression,enabled:prop.expressionEnabled});
    prop.expression=expression;prop.expressionEnabled=true;
    prop.valueAtTime(Math.max(plan.layer.inPoint,Math.min(plan.layer.outPoint-plan.comp.frameDuration,plan.comp.time)),false);
    if (prop.expressionError) throw new Error("O After Effects recusou a expressão do preset: "+prop.expressionError);
  }
  /** @param {any} plan @param {any} property @param {any} value */
  function set(plan,property,value) { if(!property)throw new Error("Parâmetro de efeito nativo ausente.");var before=snapshot(property);plan.snapshots.push(before);if(!property.numKeys&&!property.expression){try{property.setValue(value);}catch(error){var failure=/** @type {any} */ (new Error("Parâmetro "+before.path.join("/")+": "+String(error)));failure.cause=error;throw failure;}} }
  /** @param {any} plan @param {string} key @param {string} matchName @returns {any} */
  function effect(plan,key,matchName) {
    var name="Moti.on "+plan.meta.instance+" · "+key, parade=plan.layer.property(MN_EFFECTS), e=child(parade,name);
    if(!e){e=parade.addProperty(matchName);e.name=name;plan.created.push({group:[MN_EFFECTS],name:name});var known=false;for(var n=0;n<plan.meta.effects.length;n++)if(plan.meta.effects[n].name===name)known=true;if(!known)plan.meta.effects.push({name:name,matchName:matchName});}
    if(e.matchName!==matchName)throw new Error("Controle do preset incompatível.");return e;
  }
  /** @param {any} plan @param {any} e @param {string} suffix @param {string} body */
  function effectExpression(plan,e,suffix,body) { express(plan,[MN_EFFECTS,e.name,e.matchName+suffix],header(plan.p,plan.args,plan.meta,false)+body); }
  /** @param {any} plan */
  function effects(plan) {
    var p=plan.p, a=p.effectAmount, e, i;
    if(usesNativeCore(p)){
      var nativeKey=plan.locale.indexOf("pt")===0?"Motor de cor":"Color engine";
      for(i=0;i<plan.meta.effects.length;i++)if(plan.meta.effects[i].matchName===NATIVE_CORE)nativeKey=plan.meta.effects[i].name.split(" · ").slice(1).join(" · ");
      e=effect(plan,nativeKey,NATIVE_CORE);
      if(!nativeCoreCompatible(e)){
        var incompatible=/** @type {any} */ (new Error("CHMS Motion Core incompatível: atualize o plugin para usar os cinco controles deste preset."));
        incompatible.motionCode=MotionContracts.ERROR.CAPABILITY_UNAVAILABLE;throw incompatible;
      }
      var nativeEnvelope=p.mode==="transition"?"Math.max(0,Math.min(1,fadeWeight))":"1",pixelScale=plan.comp.height/1080;
      effectExpression(plan,e,"-0001","Math.max(0,Math.min(100,100*amp*"+nativeEnvelope+"));");
      set(plan,e.property(NATIVE_CORE+"-0002"),Math.min(200,a*pixelScale));
      set(plan,e.property(NATIVE_CORE+"-0003"),p.effect==="native-glitch"?12:0);
      set(plan,e.property(NATIVE_CORE+"-0004"),p.effect==="native-glitch"?Math.min(2000,64*pixelScale):0);
      set(plan,e.property(NATIVE_CORE+"-0005"),17);
      plan.meta.nativeEngine={matchName:NATIVE_CORE,contractVersion:1};
    }
    if(p.effect.indexOf("camera-")===0){
      var localized=plan.locale.indexOf("pt")===0;
      var envelope="Math.max(0,Math.min(1,fadeWeight))";
      e=effect(plan,localized?"Desfoque de câmera":"Camera blur","ADBE Gaussian Blur 2");
      effectExpression(plan,e,"-0001",String(a*plan.comp.height/1080)+"*amp*"+envelope+";");
      set(plan,e.property("ADBE Gaussian Blur 2-0003"),1);
      if(p.effect==="camera-dark"||p.effect==="camera-light"){
        e=effect(plan,localized?"Passagem de luz":"Light transition","ADBE Tint");
        var color=p.effect==="camera-dark"?[0,0,0,1]:[1,1,1,1];
        set(plan,e.property("ADBE Tint-0001"),color);set(plan,e.property("ADBE Tint-0002"),color);
        effectExpression(plan,e,"-0003","Math.min(100,100*amp*"+envelope+");");
      }
      if(p.effect==="camera-distort"||p.effect==="camera-shake"){
        e=effect(plan,localized?"Distorção de câmera":"Camera distortion","ADBE Turbulent Displace");
        effectExpression(plan,e,"-0002",String(a*plan.comp.height/1080)+"*amp*"+envelope+";");
        set(plan,e.property("ADBE Turbulent Displace-0003"),Math.max(2,90*plan.comp.height/1080));
        effectExpression(plan,e,"-0006","age*180;");
      }
    }
    if(p.effect==="blur"||p.effect==="blur-wave") {
      e=effect(plan,"Desfoque","ADBE Gaussian Blur 2");effectExpression(plan,e,"-0001",String(a)+"*amp*"+(p.mode==="transition"?"Math.max(0,w)":"(0.45+0.55*Math.abs(w))")+";");
    }
    if(p.effect==="blur-wave"){
      e=effect(plan,"Onda","ADBE Wave Warp");set(plan,e.property("ADBE Wave Warp-0003"),100);effectExpression(plan,e,"-0002",String(Math.max(5,a*0.45))+"*amp;");
    }
    var env = p.mode==="transition"?"*Math.abs(w)":"";
    if(p.effect==="duotone"||p.effect==="chroma2"){
      e=effect(plan,"Duas cores","ADBE Tint");set(plan,e.property("ADBE Tint-0001"),[0.06,0.08,0.23,1]);set(plan,e.property("ADBE Tint-0002"),[0.98,0.50,0.23,1]);effectExpression(plan,e,"-0003","Math.min(100,amp*100"+env+");");
    }
    if(p.effect==="rgb"||p.effect==="chroma2"){
      e=effect(plan,"Separação de cores","Mettle SkyBox Chromatic Aberrat");
      set(plan,e.property("Mettle SkyBox Chromatic Aberrat-0010"),90);set(plan,e.property("Mettle SkyBox Chromatic Aberrat-0011"),60);
      effectExpression(plan,e,"-0004",String(-a)+"*amp"+env+";");effectExpression(plan,e,"-0006",String(a)+"*amp"+env+";");
    }
    if(p.effect==="contrast"){
      e=effect(plan,"Contraste","ADBE Brightness & Contrast 2");effectExpression(plan,e,"-0002","Math.min(100,amp*30"+env+");");
      e=effect(plan,"Saturação","ADBE HUE SATURATION");set(plan,e.property("ADBE HUE SATURATION-0005"),30);express(plan,[MN_EFFECTS,e.name,"ADBE Effect Built In Params","ADBE Effect Mask Opacity"],header(p,plan.args,plan.meta,false)+"Math.min(100,amp*100"+env+");");
    }
    if(p.effect==="turbulent"){
      e=effect(plan,"Turbulência","ADBE Turbulent Displace");effectExpression(plan,e,"-0002",String(a)+"*amp"+env+";");set(plan,e.property("ADBE Turbulent Displace-0003"),30);effectExpression(plan,e,"-0006","age*180;");
    }
    if(p.effect==="extrude"||p.effect.indexOf("shadow")===0){
      var shadow=p.effect!=="extrude", angle=p.effectAngle+90;
      for(i=0;i<7;i++){
        e=effect(plan,(shadow?"Sombra ":"Extrusão ")+(i+1),"ADBE Drop Shadow");
        var shade=shadow?0.025:0.12+i*.013;
        set(plan,e.property("ADBE Drop Shadow-0001"),[shade,shade,shade*1.1,1]);
        set(plan,e.property("ADBE Drop Shadow-0003"),angle);
        set(plan,e.property("ADBE Drop Shadow-0005"),0);
        effectExpression(plan,e,"-0002",p.effect==="shadow-gradient"?String(245-i*15)+"*Math.min(1,amp)"+env+";":"255*Math.min(1,amp)"+env+";");
        effectExpression(plan,e,"-0004",String(a*Math.pow(2,i)/127)+"*amp"+env+";");
      }
      if(p.effect==="shadow-stripes"){
        e=effect(plan,"Listras","ADBE Venetian Blinds");set(plan,e.property("ADBE Venetian Blinds-0001"),40);set(plan,e.property("ADBE Venetian Blinds-0002"),p.effectAngle);set(plan,e.property("ADBE Venetian Blinds-0003"),12);
        e=effect(plan,"Frente original","CC Composite");set(plan,e.property("CC Composite-0003"),0);
      }
    }
  }
  /** @param {any} plan @param {string} role @returns {any} */
  function animator(plan,role){
    var name="Moti.on "+plan.meta.instance+" · "+role, group=plan.layer.property(MN_TEXT).property(MN_ANIMATORS), a=child(group,name);
    if(!a){a=group.addProperty("ADBE Text Animator");a.name=name;plan.created.push({group:[MN_TEXT,MN_ANIMATORS],name:name});var record=null;for(var n=0;n<plan.meta.animators.length;n++)if(plan.meta.animators[n].name===name)record=plan.meta.animators[n];if(record)record.properties=[];else plan.meta.animators.push({name:name,matchName:"ADBE Text Animator",properties:[]});}
    var selectors=a.property("ADBE Text Selectors"), sel=child(selectors,"Moti.on Timing");
    if(!sel){sel=selectors.addProperty("ADBE Text Expressible Selector");sel.name="Moti.on Timing";}
    var unit=plan.args.unit==="preset"?plan.p.text.unit:plan.args.unit;
    set(plan,sel.property("ADBE Text Range Type2"),unit==="words"?3:unit==="lines"?4:1);
    return a;
  }
  /** @param {any} plan @param {any} a @param {string} mn @param {any} value */
  function textProperty(plan,a,mn,value){var g=a.property("ADBE Text Animator Properties"),record=null,exists=false;for(var i=0;i<plan.meta.animators.length;i++)if(plan.meta.animators[i].name===a.name)record=plan.meta.animators[i];for(i=0;record&&i<record.properties.length;i++)if(record.properties[i]===mn)exists=true;var p=exists?g.property(mn):g.addProperty(mn);set(plan,p,value);if(!exists)record.properties.push(mn);}
  /** @param {any} plan @param {any} a @param {string} body */
  function textSelector(plan,a,body){express(plan,[MN_TEXT,MN_ANIMATORS,a.name,"ADBE Text Selectors","Moti.on Timing","ADBE Text Expressible Amount"],header(plan.p,plan.args,plan.meta,true)+body);}
  /** @param {any} plan */
  function textAnimation(plan){
    var p=plan.p,xy=core.libraryDirection(p.position[0],p.position[1],plan.args.direction),a=animator(plan,"Movimento");
    if(p.choreography){
      // One vector selector maps nominal pixels to independent X/Y/Z paths.
      // Separate animators keep rotation, tracking and scale from borrowing the
      // position selector's three different channel weights.
      textProperty(plan,a,"ADBE Text Position 3D",[plan.comp.height,plan.comp.height,plan.comp.height]);
      textSelector(plan,a,"[pose[0]*amp*100/1080,pose[1]*amp*100/1080,pose[2]*amp*100/1080];");
      if(p.scale[0]||p.scale[1]||p.scale[2]){
        a=animator(plan,"Escala");textProperty(plan,a,"ADBE Text Scale 3D",[100+p.scale[0],100+p.scale[1],100+p.scale[2]]);
        textSelector(plan,a,"[pose[4]*amp*100,pose[5]*amp*100,w*amp*100];");
      }
      if(p.rotation[2]){a=animator(plan,"Rotação");textProperty(plan,a,"ADBE Text Rotation",p.rotation[2]);textSelector(plan,a,"pose[3]*amp*100;");}
      if(p.text.tracking||p.text.skew){
        a=animator(plan,"Tipografia");
        if(p.text.tracking)textProperty(plan,a,"ADBE Text Tracking Amount",p.text.tracking);
        if(p.text.skew)textProperty(plan,a,"ADBE Text Skew",p.text.skew);
        textSelector(plan,a,"w*amp*100;");
      }
    }else{
    textProperty(plan,a,"ADBE Text Position 3D",[xy[0]*plan.comp.height/1080,xy[1]*plan.comp.height/1080,p.position[2]*plan.comp.height/1080]);
    textProperty(plan,a,"ADBE Text Scale 3D",[100+p.scale[0],100+p.scale[1],100+p.scale[2]]);
    textProperty(plan,a,"ADBE Text Rotation",p.rotation[2]);
    if(p.text.tracking)textProperty(plan,a,"ADBE Text Tracking Amount",p.text.tracking);
    if(p.text.skew)textProperty(plan,a,"ADBE Text Skew",p.text.skew);
    textSelector(plan,a,"[w*amp*100,w*amp*100,w*amp*100];");
    }
    if(p.fade){a=animator(plan,"Opacidade");textProperty(plan,a,"ADBE Text Opacity",0);textSelector(plan,a,p.text.reveal==="typewriter"?"Math.min(u[0],u[1])<(idx+1)/total?Math.min(1,amp)*100:0;":p.mode==="transition"?"var opacity=Math.max(0,Math.min(1,fadeWeight*amp));[opacity*100,opacity*100,opacity*100];":"var opacity=Math.abs(w)*Math.min(1,amp)*.7;[opacity*100,opacity*100,opacity*100];");}
    if(p.text.blur){a=animator(plan,"Foco");var blur=p.text.blur*plan.comp.height/1080;textProperty(plan,a,"ADBE Text Blur",[blur,blur]);textSelector(plan,a,"var b=Math.max(0,w)*amp*100;[b,b,b];");}
    if(p.text.decode){a=animator(plan,"Decodificação");textProperty(plan,a,"ADBE Text Character Offset",30);textSelector(plan,a,"var amount=Math.round(Math.sin(Math.floor((time-inPoint)*18)*7.7+textIndex*11.3)*30)*"+(p.mode==="transition"?"Math.max(0,Math.min(1,w))":"1")+"*amp;[amount*100/30,amount*100/30,amount*100/30];");}
    if(p.text.mask){
      var masks=plan.layer.property("ADBE Mask Parade"),name="Moti.on "+plan.meta.instance+" · Janela",mask=child(masks,name);
      if(!mask){
        mask=masks.addProperty("ADBE Mask Atom");mask.name=name;plan.created.push({group:["ADBE Mask Parade"],name:name});plan.meta.masks.push({name:name,matchName:"ADBE Mask Atom"});
        var rect=plan.rect,shape=new Shape(),pad=8;
        shape.vertices=[[rect.left-pad,rect.top-pad],[rect.left+rect.width+pad,rect.top-pad],[rect.left+rect.width+pad,rect.top+rect.height+pad],[rect.left-pad,rect.top+rect.height+pad]];
        shape.inTangents=[[0,0],[0,0],[0,0],[0,0]];shape.outTangents=[[0,0],[0,0],[0,0],[0,0]];shape.closed=true;mask.property("ADBE Mask Shape").setValue(shape);
      }
    }
  }
  /** @param {any} plan */
  function layerAnimation(plan){
    var p=plan.p, tr=plan.layer.property(MN_TRANSFORM),h=header(p,plan.args,plan.meta,false),xy=core.libraryDirection(p.position[0],p.position[1],plan.args.direction),scale=plan.comp.height/1080;
    var vec=[xy[0]*scale,xy[1]*scale,p.position[2]*scale],terms=[],i;
    for(i=0;i<(plan.layer.threeDLayer?3:2);i++)terms.push(p.choreography?"value["+i+"]+pose["+i+"]*"+scale+"*amp":"value["+i+"]+"+vec[i]+"*amp*"+(p.effect==="camera-shake"?"(wave(age*3,"+i+",\"wiggle\",seed)*fadeWeight)":p.mode==="transition"?"w":"wave(age,"+i+","+MotionJson.stringify(p.waveform)+",seed)"));
    if(vec[0]||vec[1]||vec[2]||p.pivot==="edge"){
      var body="["+terms.join(",")+"];";
      if(p.pivot==="edge"){
        // Rotate around a source-space edge while leaving Anchor Point intact.
        // The extra position offsets cancel the edge displacement at rest.
        var anchor=tr.property("ADBE Anchor Point").valueAtTime(plan.layer.inPoint,true),rect=plan.layer.sourceRectAtTime(plan.layer.inPoint,false);
        var edgeDirection=plan.args.direction==="preset"?(Math.abs(p.rotation[1])>Math.abs(p.rotation[0])?"left":"bottom"):plan.args.direction;
        var edge=edgeDirection==="left"?rect.left:edgeDirection==="right"?rect.left+rect.width:anchor[0];
        var edgeY=edgeDirection==="top"?rect.top:edgeDirection==="bottom"?rect.top+rect.height:anchor[1];
        var dx=anchor[0]-edge,dy=anchor[1]-edgeY;
        body="var q="+(p.choreography?"pose[3]":"w")+"*amp,rx="+p.rotation[0]+"*q*Math.PI/180,ry="+p.rotation[1]+"*q*Math.PI/180;var sx=transform.scale[0]/100,sy=transform.scale[1]/100;var vx="+dx+"*sx,vy="+dy+"*sy;var delta=[vx*(Math.cos(ry)-1)+vy*Math.sin(rx)*Math.sin(ry),vy*(Math.cos(rx)-1),-vx*Math.sin(ry)+vy*Math.sin(rx)*Math.cos(ry)];["+terms[0]+"+delta[0],"+terms[1]+"+delta[1],"+terms[2]+"+delta[2]];";
        if(!plan.layer.threeDLayer)body="var q="+(p.choreography?"pose[3]":"w")+"*amp,rz="+p.rotation[2]+"*q*Math.PI/180;var vx="+dx+"*transform.scale[0]/100,vy="+dy+"*transform.scale[1]/100;var delta=[vx*(Math.cos(rz)-1)-vy*Math.sin(rz),vx*Math.sin(rz)+vy*(Math.cos(rz)-1)];["+terms[0]+"+delta[0],"+terms[1]+"+delta[1]];";
      }
      express(plan,[MN_TRANSFORM,"ADBE Position"],h+body);
    }
    if(p.scale[0]||p.scale[1]||p.scale[2]){
      terms=[];for(i=0;i<(plan.layer.threeDLayer?3:2);i++)terms.push("value["+i+"]*(1+"+p.scale[i]+"/100*amp*"+(p.choreography?(i===0?"pose[4]":i===1?"pose[5]":"w"):p.mode==="transition"?"w":"wave(age,"+i+","+MotionJson.stringify(p.waveform)+",seed+2)")+")");express(plan,[MN_TRANSFORM,"ADBE Scale"],h+"["+terms.join(",")+"];");
    }
    var rotations=["ADBE Rotate X","ADBE Rotate Y","ADBE Rotate Z"];
    for(i=0;i<3;i++)if(p.rotation[i]&&(i===2||plan.layer.threeDLayer))express(plan,[MN_TRANSFORM,rotations[i]],h+"value+"+p.rotation[i]+"*amp*"+(p.choreography?"pose[3]":p.effect==="camera-shake"?"(wave(age*3,"+i+",\"wiggle\",seed+6)*fadeWeight)":p.mode==="transition"?"w":"wave(age,"+i+","+MotionJson.stringify(p.waveform)+",seed+6)")+";");
    if(p.fade)express(plan,[MN_TRANSFORM,"ADBE Opacity"],h+"value*(1-Math.max(0,Math.min(1,fadeWeight*amp)));");
  }
  /** @param {any} plan */
  function applyLayer(plan){
    var l=plan.layer,m=plan.meta,p=plan.p,labels=plan.locale.indexOf("pt")===0?CONTROL_LABELS:CONTROL_LABELS_EN;
    if(p.category==="motion-3d")l.threeDLayer=true;
    for(var i=0;i<CONTROL_KEYS.length;i++){
      // Keep control names and order stable when locale changes or Apply repeats.
      var key=m.effects[i]?m.effects[i].name.split(" · ").slice(1).join(" · "):labels[i];
      var e=effect(plan,key,"ADBE Slider Control");set(plan,e.property(1),plan.args[CONTROL_KEYS[i] || "durationFrames"]);
    }
    var extras=[];
    if(p.mode==="transition"&&((plan.args.easing&&plan.args.easing!=="preset"?plan.args.easing:p.easing)==="spring"||(m.controls&&m.controls.elasticity)))extras.push({key:"elasticity",pt:"Elasticidade (%)",en:"Elasticity (%)",fallback:30});
    if(p.collection==="studio"||p.collection==="native"||p.collection==="premium"){
      if(isText(p)&&p.mode==="transition")extras.push({key:"overlap",pt:"Sobreposição (%)",en:"Overlap (%)",fallback:65});
      if(p.mode==="continuous")extras.push({key:"speed",pt:"Velocidade (%)",en:"Speed (%)",fallback:100});
      if(p.collection==="premium")extras.push({key:"seed",pt:"Variação",en:"Variation",fallback:17});
    }
    if(extras.length){
      if(!m.controls)m.controls={};
      for(i=0;i<extras.length;i++){
        var extra=extras[i];if(!extra)continue;var name=m.controls[extra.key]?m.controls[extra.key].split(" · ").slice(1).join(" · "):(plan.locale.indexOf("pt")===0?extra.pt:extra.en);
        var control=effect(plan,name,"ADBE Slider Control"),value=typeof plan.args[extra.key]==="number"?plan.args[extra.key]:(p.defaults&&typeof p.defaults[extra.key]==="number"?p.defaults[extra.key]:extra.fallback);
        set(plan,control.property(1),value);m.controls[extra.key]=control.name;
      }
    }
    if(!plan.deferMarkers)applyMarkers(plan);
    if(isText(p))textAnimation(plan);else layerAnimation(plan);
    effects(plan);m.options=plan.args;m.expressionVersion=2;if(!plan.deferMetadata)saveMetadata(l,m);
  }
  /** @param {any} args @param {any} context @param {any=} layerOptions @returns {MotionCommandResult} */
  function apply(args,context,layerOptions){
    var comp=/** @type {any} */ (app.project.activeItem),layers=comp.selectedLayers,p=definition(args),plans=/** @type {any[]} */ ([]),i;
    try{
      for(i=0;i<layers.length;i++){
        var l=layers[i],m=metadata(l),old=String(l.comment||""),was3D=l.threeDLayer;
        if(!m)m={version:1,instance:String(new Date().getTime())+"-"+l.id,presetId:p.id,was3D:was3D,expressions:[],effects:[],animators:[],masks:[]};
        var plan={layer:l,comp:comp,p:p,args:layerOptions?layerOptions[String(l.id)]:args,meta:m,oldComment:old,was3D:was3D,created:[],snapshots:[],locale:context.locale||"pt-BR",rect:l.sourceRectAtTime(l.inPoint,false)};plans.push(plan);applyLayer(plan);
      }
    }catch(error){
      var rollbackFailed=false;
      for(i=plans.length-1;i>=0;i--){var q=plans[i];try{if(q.markersTouched)restoreMarkers(q.layer,q.meta,q.markerSnapshots);restore(q.layer,q.snapshots);for(var j=q.created.length-1;j>=0;j--){var item=q.created[j],g=locate(q.layer,item.group),e=child(g,item.name);if(e)e.remove();}q.layer.threeDLayer=q.was3D;q.layer.comment=q.oldComment;}catch(rollbackError){rollbackFailed=true;}}
      if(rollbackFailed){var failure=/** @type {any} */ (new Error("Falha ao restaurar o preset."));failure.motionCode=MotionContracts.ERROR.ROLLBACK_FAILED;failure.cause=error;throw failure;}throw error;
    }
    var warnings=[];if(p.mode==="transition")for(i=0;i<plans.length;i++)if(!markerProperty(plans[i].layer)){warnings.push({code:"CAPABILITY_UNAVAILABLE",message:"Marcadores indisponíveis nesta camada; use o controle Duração do efeito.",details:null});break;}
    return {changed:true,data:{appliedCount:plans.length,presetId:p.id},warnings:warnings};
  }
  /** @param {any} layer @param {any} m @param {boolean=} preserveMetadata */
  function removeLayer(layer,m,preserveMetadata){
    removeMarkers(layer,m);
    for(var i=0;i<m.expressions.length;i++){var r=m.expressions[i],p=locate(layer,r.path);p.expression=r.original;p.expressionEnabled=r.enabled;}
    var groups=/** @type {any} */ ([[MN_EFFECTS,m.effects],[MN_TEXT,m.animators],["ADBE Mask Parade",m.masks]]);
    for(i=0;i<groups.length;i++){var group=layer.property(groups[i][0]);if(i===1&&group)group=group.property(MN_ANIMATORS);var records=groups[i][1];for(var j=records.length-1;j>=0;j--){var e=child(group,records[j].name);if(e)e.remove();}}
    if(!preserveMetadata){if(!m.was3D&&definition({presetId:m.presetId}).category==="motion-3d")layer.threeDLayer=false;saveMetadata(layer,null);}
  }
  /** @returns {MotionCommandResult} */
  function remove(){var layers=/** @type {any} */ (app.project.activeItem).selectedLayers,count=0;for(var i=0;i<layers.length;i++){var m=metadata(layers[i]);if(m){removeLayer(layers[i],m);count++;}}return {changed:count>0,data:{appliedCount:count},warnings:[]};}
  /** Baking writes only properties created or expression-managed by this module.
   * Text selectors depend on textIndex and are explicitly excluded in preflight.
   * @returns {MotionCommandResult} */
  function bake(){
    var comp=/** @type {any} */ (app.project.activeItem),layers=comp.selectedLayers,samples=/** @type {any[]} */ ([]),layerSnapshots=/** @type {any[]} */ ([]),i,j,k;
    for(i=0;i<layers.length;i++){var l=layers[i],m=metadata(l);if(!m)continue;
      layerSnapshots.push({layer:l,meta:m,comment:l.comment,markers:snapshotMarkers(l,m)});
      for(j=0;j<m.expressions.length;j++){var p=locate(l,m.expressions[j].path),times=[],values=[];for(k=0;k<=Math.ceil((l.outPoint-l.inPoint)/comp.frameDuration);k++){var t=Math.min(l.outPoint,l.inPoint+k*comp.frameDuration);times.push(t);values.push(p.valueAtTime(t,false));}samples.push({property:p,times:times,values:values,base:p.valueAtTime(0,true),expression:p.expression,enabled:p.expressionEnabled});}
    }
    try{
      for(i=0;i<samples.length;i++){var s=samples[i];s.property.expression="";s.property.setValuesAtTimes(s.times,s.values);for(j=1;j<=s.property.numKeys;j++)s.property.setInterpolationTypeAtKey(j,KeyframeInterpolationType.LINEAR,KeyframeInterpolationType.LINEAR);}
      for(i=0;i<layerSnapshots.length;i++){removeMarkers(layerSnapshots[i].layer,layerSnapshots[i].meta);saveMetadata(layerSnapshots[i].layer,null);}
    }catch(error){
      var rollbackFailed=false;
      for(i=0;i<samples.length;i++){var r=samples[i];try{while(r.property.numKeys)r.property.removeKey(r.property.numKeys);r.property.expression="";r.property.setValue(r.base);r.property.expression=r.expression;r.property.expressionEnabled=r.enabled;}catch(restoreError){rollbackFailed=true;}}
      for(i=0;i<layerSnapshots.length;i++){var ls=layerSnapshots[i];try{restoreMarkers(ls.layer,ls.meta,ls.markers);ls.layer.comment=ls.comment;}catch(markerRestoreError){rollbackFailed=true;}}
      if(rollbackFailed){var failure=/** @type {any} */ (new Error("Falha ao restaurar a conversão do preset."));failure.motionCode=MotionContracts.ERROR.ROLLBACK_FAILED;failure.cause=error;throw failure;}throw error;
    }
    return {changed:samples.length>0,data:{appliedCount:samples.length},warnings:[]};
  }
  /** Read the native controls, not the last panel draft. Animated controls stay
   * editable in AE; this editor never flattens their keys or expressions.
   * @returns {any} */
  function inspect() {
    var comp=app.project&&app.project.activeItem;
    if(!comp||!(comp instanceof CompItem))return {state:"no-comp",message:"Abra uma composição."};
    var layers=comp.selectedLayers;
    if(!layers.length)return {state:"no-selection",message:"Selecione uma camada com um preset Moti.on."};
    if(layers.length>50)return {state:"multiple",message:"Edite até 50 camadas por vez."};
    if(layers.length===1)return inspectLayer(layers[0],comp);
    var ordered=/** @type {any[]} */ ([]),targets=[],first=null,mixed=/** @type {Record<string,boolean>} */ ({});
    for(var i=0;i<layers.length;i++)ordered.push(layers[i]);
    ordered.sort(function(a,b){return a.index-b.index;});
    for(i=0;i<ordered.length;i++){
      var item=inspectLayer(ordered[i],comp);
      if(item.state!=="ready")return {state:"multiple",message:"Selecione camadas com o mesmo preset e controles editáveis. "+(item.layerName?item.layerName+": ":"")+item.message};
      if(item.phases)return {state:"multiple",message:"Selecione uma camada para editar suas fases de entrada e saída."};
      if(item.cameraTransition)return {state:"multiple",message:"Edite uma pré-comp de transição de cada vez."};
      if(first&&first.presetId!==item.presetId)return {state:"multiple",message:"As camadas têm receitas diferentes. Selecione camadas com o mesmo preset para editar em conjunto."};
      if(first)for(var key in first.options)if(Object.prototype.hasOwnProperty.call(first.options,key)&&first.options[key]!==item.options[key])mixed[key]=true;
      if(!first)first=item;targets.push(item.target);
    }
    first.mixedKeys=[];for(var mixedKey in mixed)if(Object.prototype.hasOwnProperty.call(mixed,mixedKey))first.mixedKeys.push(mixedKey);
    first.targets=targets;first.layerName=String(ordered.length)+" camadas";first.message=first.mixedKeys.length?"Os valores marcados como Vários serão preservados. Somente os parâmetros ajustados serão alterados nas "+ordered.length+" camadas.":"Os ajustes serão aplicados às "+ordered.length+" camadas selecionadas.";return first;
  }
  /** @param {any} l @param {any} comp @param {any=} override @returns {any} */
  function inspectLayer(l,comp,override) {
    var m;
    var phases=/** @type {any} */ (global).MotionPresetPhases;
    if(!override&&phases&&phases.has(l))return phases.inspectLayer(l,comp);
    if(cameraTransition && cameraTransition.owns(l))return cameraTransition.inspect(l);
    try{m=override||metadata(l);}catch(e){return {state:"conflict",message:"Os metadados do preset estão incompletos."};}
    if(!m)return {state:"unmanaged",layerName:l.name,message:"Esta camada não tem um preset Moti.on. Presets .ffx podem ser editados nos Controles do efeito."};
    var ownership=verifyOwnership(l,m);
    if(ownership)return {state:"conflict",layerName:l.name,message:ownership.message};
    if(l.locked)return {state:"conflict",layerName:l.name,message:"Desbloqueie a camada para editar."};
    var p=definition({presetId:m.presetId}),opts=/** @type {any} */ ({}),key;
    for(key in m.options)if(Object.prototype.hasOwnProperty.call(m.options,key)&&key!=="presetId")opts[key]=m.options[key];
    if(typeof opts.elasticity!=="number")opts.elasticity=p.defaults&&p.defaults.elasticity!==undefined?p.defaults.elasticity:30;
    if(typeof opts.overlap!=="number")opts.overlap=p.defaults&&p.defaults.overlap!==undefined?p.defaults.overlap:65;
    if(typeof opts.speed!=="number")opts.speed=p.defaults&&p.defaults.speed!==undefined?p.defaults.speed:100;
    var controls=/** @type {any[]} */ ([]),i;
    for(i=0;i<CONTROL_KEYS.length;i++)controls.push({key:CONTROL_KEYS[i],name:m.effects[i].name});
    if(m.controls)for(key in m.controls)if(Object.prototype.hasOwnProperty.call(m.controls,key))controls.push({key:key,name:m.controls[key]});
    for(i=0;i<controls.length;i++){
      var c=/** @type {any} */ (controls[i]),effect=child(l.property(MN_EFFECTS),c.name),prop=effect&&effect.property(1);
      if(!prop||prop.numKeys||prop.expression)return {state:"conflict",layerName:l.name,message:"Um controle tem keyframes ou expressão. Edite esse controle no After Effects para preservar a animação."};
      opts[c.key]=prop.value;
    }
    if(typeof opts.easing!=="string")opts.easing="preset";
    if(typeof opts.order!=="string")opts.order="preset";
    if(typeof opts.seed!=="number")opts.seed=p.defaults&&typeof p.defaults.seed==="number"?p.defaults.seed:17;
    var fingerprint=MotionJson.stringify({instance:m.instance,presetId:m.presetId,options:opts,inPoint:l.inPoint,outPoint:l.outPoint,markers:markerState(l,m)});
    return {state:"ready",message:"",layerName:l.name,presetId:m.presetId,options:opts,target:{compId:/** @type {any} */ (comp).id,layerId:l.id,instance:m.instance,fingerprint:fingerprint}};
  }
  /** @param {any} args @returns {any} */
  function adjustArgs(args){var out=/** @type {any} */ ({presetId:args.presetId});for(var key in args.options)if(Object.prototype.hasOwnProperty.call(args.options,key))out[key]=args.options[key];return out;}
  /** @param {any} args @returns {MotionCommandFailure|null} */
  function adjustPreflight(args){
    var allowed={target:true,targets:true,optionKeys:true,presetId:true,options:true};
    for(var key in args)if(Object.prototype.hasOwnProperty.call(args,key)&&!Object.prototype.hasOwnProperty.call(allowed,key))return fail(MotionContracts.ERROR.INVALID_PRESET,"Parâmetro de ajuste desconhecido.");
    if(!args.options||typeof args.options!=="object"||Object.prototype.hasOwnProperty.call(args.options,"presetId"))return fail(MotionContracts.ERROR.INVALID_PRESET,"Ajustes inválidos.");
    if(typeof args.optionKeys!=="undefined"){
      if(!(args.optionKeys instanceof Array)||args.optionKeys.length<1||args.optionKeys.length>12)return fail(MotionContracts.ERROR.INVALID_PRESET,"Escolha os parâmetros que serão alterados.");
      var known={phase:true,direction:true,durationFrames:true,intensity:true,staggerFrames:true,unit:true,easing:true,elasticity:true,overlap:true,speed:true,order:true,seed:true},seen=/** @type {Record<string,boolean>} */ ({});
      for(var option=0;option<args.optionKeys.length;option++){var optionKey=args.optionKeys[option];if(typeof optionKey!=="string"||!Object.prototype.hasOwnProperty.call(known,optionKey)||seen[optionKey]||!Object.prototype.hasOwnProperty.call(args.options,optionKey))return fail(MotionContracts.ERROR.INVALID_PRESET,"Parâmetro parcial inválido.");seen[optionKey]=true;}
    }
    var optionsError=validate(adjustArgs(args));if(optionsError)return optionsError;
    var t=args.target;if(!t||typeof t!=="object")return fail(MotionContracts.ERROR.INVALID_PRESET,"Alvo inválido.");
    var targetKeys={compId:true,layerId:true,instance:true,fingerprint:true};for(key in t)if(Object.prototype.hasOwnProperty.call(t,key)&&!Object.prototype.hasOwnProperty.call(targetKeys,key))return fail(MotionContracts.ERROR.INVALID_PRESET,"Alvo inválido.");
    var current=inspect();
    if(current.state!=="ready")return fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE,current.message);
    if(!t||current.presetId!==args.presetId||current.target.compId!==t.compId||current.target.layerId!==t.layerId||current.target.instance!==t.instance||current.target.fingerprint!==t.fingerprint)return fail(MotionContracts.ERROR.INVALID_PRESET,"A seleção ou os controles mudaram. Recarregue os valores antes de ajustar.");
    if(current.targets){
      if(!(args.targets instanceof Array)||args.targets.length!==current.targets.length)return fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE,"A seleção de camadas mudou. Recarregue antes de ajustar.");
      for(var i=0;i<current.targets.length;i++){
        var expected=args.targets[i],actual=current.targets[i];
        if(!expected||typeof expected!=="object")return fail(MotionContracts.ERROR.INVALID_PRESET,"Alvo do lote inválido.");
        for(key in expected)if(Object.prototype.hasOwnProperty.call(expected,key)&&!Object.prototype.hasOwnProperty.call(targetKeys,key))return fail(MotionContracts.ERROR.INVALID_PRESET,"Alvo do lote inválido.");
        if(expected.compId!==actual.compId||expected.layerId!==actual.layerId||expected.instance!==actual.instance||expected.fingerprint!==actual.fingerprint)return fail(MotionContracts.ERROR.INVALID_PRESET,"A seleção ou os controles mudaram. Recarregue o lote antes de ajustar.");
      }
    }else if(typeof args.targets!=="undefined")return fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE,"A seleção de camadas mudou. Recarregue antes de ajustar.");
    if(current.cameraTransition)return cameraTransition.adjustPreflight(args);
    if(current.mixedKeys&&current.mixedKeys.length&&!args.optionKeys)return fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE,"A seleção possui valores diferentes. Ajuste um parâmetro no editor atualizado antes de aplicar.");
    var prepared=prepareAdjustOptions(args);return prepared.error;
  }
  /** Resolve every layer's own options before mutation, preserving untouched mixed values.
   * @param {any} args @returns {any} */
  function prepareAdjustOptions(args){
    var comp=/** @type {CompItem} */ (app.project.activeItem),layers=comp.selectedLayers,byLayer=/** @type {Record<string,any>} */ ({});
    for(var i=0;i<layers.length;i++){
      var layer=/** @type {any} */ (layers[i]),current=inspectLayer(layer,comp),options=/** @type {any} */ ({}),key;
      if(current.state!=="ready")return {error:fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE,current.message)};
      for(key in current.options)if(Object.prototype.hasOwnProperty.call(current.options,key))options[key]=current.options[key];
      if(args.optionKeys)for(var j=0;j<args.optionKeys.length;j++)options[args.optionKeys[j]]=args.options[args.optionKeys[j]];
      else for(key in args.options)if(Object.prototype.hasOwnProperty.call(args.options,key))options[key]=args.options[key];
      options.presetId=args.presetId;
      var error=preflight(options,"apply",true,[layer]);if(error)return {error:error};
      byLayer[String(layer.id)]=options;
    }
    return {error:null,options:byLayer};
  }
  /** @param {any} args @param {any} context @returns {MotionCommandResult} */
  function adjustRun(args,context){
    var error=adjustPreflight(args);if(error){var invalid=/** @type {any} */ (new Error(error.message));invalid.motionCode=error.code;throw invalid;}
    if(cameraTransition&&cameraTransition.hasSelected(app.project.activeItem))return cameraTransition.apply(cameraTransition.adjustArgs(args),context);
    var prepared=prepareAdjustOptions(args);if(prepared.error)throw new Error(prepared.error.message);
    return apply(adjustArgs(args),context,prepared.options);
  }
  MotionRegistry.register("ae.presets.inspect",{preflight:function(args){for(var key in args)if(Object.prototype.hasOwnProperty.call(args,key))return fail(MotionContracts.ERROR.INVALID_PRESET,"A leitura não recebe parâmetros.");return null;},run:function(){var data=inspect(),library=/** @type {any} */ (global).MotionPresetLibrary;if(library.decorateColors)library.decorateColors(data);return {changed:false,data:data,warnings:[]};}});
  MotionRegistry.register("ae.presets.adjust",{preflight:adjustPreflight,run:adjustRun});
  MotionRegistry.register("ae.presets.apply",{preflight:function(args){return preflight(args,"apply");},run:apply});
  MotionRegistry.register("ae.presets.remove",{preflight:function(args){return preflight(args,"remove");},run:function(){return cameraTransition && cameraTransition.hasSelected(app.project.activeItem)?cameraTransition.remove():remove();}});
  MotionRegistry.register("ae.presets.bake",{preflight:function(args){return preflight(args,"bake");},run:function(){return cameraTransition && cameraTransition.hasSelected(app.project.activeItem)?cameraTransition.bake():bake();}});
  global.MotionPresetLibrary={validate:validate,metadata:metadata,requiredEffects:requiredEffects,header:header,markerState:markerState,verifyOwnership:verifyOwnership,definition:definition,preflight:preflight,applyLayer:applyLayer,removeLayer:removeLayer,inspectLayer:inspectLayer,locate:locate,child:child,snapshot:snapshot,restore:restore,saveMetadata:saveMetadata,snapshotMarkers:snapshotMarkers,restoreMarkers:restoreMarkers,removeMarkers:removeMarkers};
}($.global));
