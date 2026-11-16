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
  var EFFECT_RAMP_FRAMES = 6;
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
    return params["Moti.on.instance"]===meta.instance&&(role==="in"||role==="out"||role==="both"||role==="effect")?role:"";
  }
  /** @param {any} layer @param {any} meta @returns {any} */
  function markerState(layer,meta) {
    var prop=markerProperty(layer),result=/** @type {any} */ ({inTime:null,outTime:null,inDuration:null,outDuration:null,count:0,duplicate:false});
    if(!prop||!meta)return result;
    for(var i=1;i<=prop.numKeys;i++){
      var role=markerRole(prop.keyValue(i),meta);if(!role)continue;result.count++;
      // A stacked effect is timed by one cue with a duration (phases v3).
      if(role==="effect"){if(result.effectTime!==undefined)result.duplicate=true;result.effectTime=prop.keyTime(i);result.effectDuration=prop.keyValue(i).duration;continue;}
      var cueValue=prop.keyValue(i);
      if(role!=="out"){if(result.inTime!==null)result.duplicate=true;result.inTime=prop.keyTime(i);result.inDuration=cueValue.duration;result.inParams=cueValue.getParameters();}
      if(role!=="in"){if(result.outTime!==null)result.duplicate=true;result.outTime=prop.keyTime(i);result.outDuration=cueValue.duration;result.outParams=cueValue.getParameters();}
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
  /** v1 cues were scaled by the Duration slider relative to the length they were written with.
   * @param {any} layer @param {any} meta @returns {number} */
  function legacyScale(layer,meta) {
    var e=meta.effects&&meta.effects[0]&&child(layer.property(MN_EFFECTS),meta.effects[0].name),c=e&&e.property(1),v=c&&c.value;
    return typeof v==="number"&&isFinite(v)&&v>0&&meta.markerDurationFrames>0?v/meta.markerDurationFrames:1;
  }
  /** Keep a window inside the layer; an empty or invalid one falls back to the default.
   * @param {string} role @param {any} w @param {any} fallback @param {any} layer @returns {any} */
  function fitWindow(role,w,fallback,layer) {
    var start=Math.max(layer.inPoint,Math.min(layer.outPoint,w.start)),end=Math.min(layer.outPoint,w.start+w.duration);
    if(!isFinite(start)||!isFinite(end)||end-start<=.000001)return {role:role,time:fallback.start,duration:fallback.duration};
    return {role:role,time:start,duration:end-start};
  }
  /** Range cues (marker version 2): the entrance plays from its cue start for the
   * cue duration and the exit ends at its cue end. Hand-placed cues survive until
   * the Duration changes; v1 point cues become the windows they used to play.
   * @param {any} layer @param {any} meta @param {any} args @param {any} comp @returns {any[]} */
  function markerTargets(layer,meta,args,comp) {
    var W=/** @type {any} */ (global).MotionMarkerWindow,state=markerState(layer,meta),fd=comp.frameDuration,span=layer.outPoint-layer.inPoint;
    var length=Math.max(0,Math.min(args.durationFrames*fd,span/(args.phase==="both"?2:1)));
    var inDefault={start:layer.inPoint,duration:length},outDefault={start:layer.outPoint-length,duration:length};
    var input=args.phase!=="out"?inDefault:null,output=args.phase!=="in"?outDefault:null;
    var preserve=meta&&(meta.markerVersion===1||meta.markerVersion===2)&&meta.options&&meta.options.durationFrames===args.durationFrames;
    if(preserve&&meta.markerVersion===2){
      if(input&&state.inTime!==null)input=W.cueWindow("in",state.inTime,state.inDuration,state.inParams,layer,fd);
      if(output&&state.outTime!==null)output=W.cueWindow("out",state.outTime,state.outDuration,state.outParams,layer,fd);
    }else if(preserve){
      var scale=legacyScale(layer,meta);
      if(input&&state.inTime!==null)input={start:layer.inPoint,duration:(state.inTime-layer.inPoint)*scale};
      if(output&&state.outTime!==null){var tail=(layer.outPoint-state.outTime)*scale;output={start:layer.outPoint-tail,duration:tail};}
    }
    var result=[];
    if(input)result.push(fitWindow("in",input,inDefault,layer));
    if(output)result.push(fitWindow("out",output,outDefault,layer));
    // Two cues cannot share a frame on one layer; fall back to the default layout.
    if(result.length===2&&Math.abs(result[0].time-result[1].time)<.000001)result=[{role:"in",time:inDefault.start,duration:inDefault.duration},{role:"out",time:outDefault.start,duration:outDefault.duration}];
    return result;
  }
  /** @param {any} layer @param {any} meta @param {any} args @param {any} comp @returns {MotionCommandFailure|null} */
  function markerPreflight(layer,meta,args,comp) {
    var prop=markerProperty(layer);if(!prop)return null;
    var state=markerState(layer,meta),targets=markerTargets(layer,meta,args,comp);
    if(prop.numKeys-state.count+targets.length>250)return fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE,"A camada excederia 250 marcadores incluindo os marcadores In/Out. Reduza os marcadores antes de aplicar o preset.");
    if(state.duplicate)return fail(MotionContracts.ERROR.INVALID_PRESET,"Há marcadores de timing duplicados. Remova a cópia antes de ajustar o preset.");
    for(var i=1;i<=prop.numKeys;i++)if(!markerRole(prop.keyValue(i),meta))for(var j=0;j<targets.length;j++)if(Math.abs(prop.keyTime(i)-targets[j].time)<.000001)return fail(MotionContracts.ERROR.KEYFRAME_CONFLICT||MotionContracts.ERROR.INVALID_PRESET,"Um marcador existente ocupa o início de uma fase. Mova esse marcador ou escolha outra duração.");
    return null;
  }
  /** @param {any} plan */
  function applyMarkers(plan) {
    var prop=markerProperty(plan.layer),meta=plan.meta,W=/** @type {any} */ (global).MotionMarkerWindow;if(!prop||plan.p.mode!=="transition")return;
    var targets=markerTargets(plan.layer,meta,plan.args,plan.comp),fd=plan.comp.frameDuration;
    plan.markerSnapshots=snapshotMarkers(plan.layer,meta);plan.markersTouched=true;
    removeMarkers(plan.layer,meta);
    for(var i=0;i<targets.length;i++){
      var t=targets[i],label=t.role==="in"?"Moti.on In":"Moti.on Out",value=/** @type {any} */ (new MarkerValue(label));
      // Copy a prior cue so user payloads survive; the snapshot itself stays intact for rollback.
      for(var prior=0;prior<plan.markerSnapshots.length;prior++){var was=markerRole(plan.markerSnapshots[prior].value,meta);if(was===t.role||was==="both"){value=W.copy(plan.markerSnapshots[prior].value);if(was==="both")value.comment=label;break;}}
      var params=value.getParameters();params["Moti.on.instance"]=meta.instance;params["Moti.on.phase"]=t.role;
      value.duration=t.duration;value.setParameters(W.edgeParams(params,t.role,t.time,t.time+t.duration,plan.layer,fd));prop.setValueAtTime(t.time,value);
    }
    meta.markerDurationFrames=plan.args.durationFrames;
    meta.markerVersion=2;
  }
  /** Serialized only for marker-enabled transition instances. The native duration
   * slider scales each cue span; dragging cues sets independent In/Out durations.
   * @param {any} meta @returns {string} */
  function markerExpression(meta) {
    if(meta.markerVersion===2)return /** @type {any} */ (global).MotionMarkerWindow.expression(MotionJson.stringify(meta.markerInstance||meta.instance));
    if(meta.markerVersion!==1)return "";
    return "var markerIn=dur,markerOut=dur,markerScale=dur/("+meta.markerDurationFrames+"*thisComp.frameDuration);\n"+
      "var cues=thisLayer.marker;for(var mi=1;mi<=Math.min(cues.numKeys,250);mi++){var cue=cues.key(mi),params=cue.parameters;if(params[\"Moti.on.instance\"]==="+MotionJson.stringify(meta.markerInstance||meta.instance)+"){var role=params[\"Moti.on.phase\"];if(role===\"in\"||role===\"both\")markerIn=(cue.time-inPoint)*markerScale;if(role===\"out\"||role===\"both\")markerOut=(outPoint-cue.time)*markerScale;}}\n"+
      "var markerSpan=Math.max(.0001,outPoint-inPoint);markerIn=Math.max(.0001,Math.min(markerSpan,markerIn));markerOut=Math.max(.0001,Math.min(markerSpan,markerOut));\n";
  }
  /** A stacked effect reads its window from its cue: the loop eases in and out at
   * both edges, and a steady spin keeps its last angle instead of unwinding.
   * @param {any} meta @param {any} p @returns {string} */
  function effectWindowExpression(meta,p) {
    if(meta.effectCue!==1)return "";
    return "var effectStart=inPoint,effectEnd=outPoint,effectCues=thisLayer.marker;for(var ei=1;ei<=Math.min(effectCues.numKeys,250);ei++){var effectCue=effectCues.key(ei),effectParams=effectCue.parameters;if(effectParams[\"Moti.on.instance\"]==="+MotionJson.stringify(meta.markerInstance)+"&&effectParams[\"Moti.on.phase\"]===\"effect\"){effectStart=effectCue.time;effectEnd=effectCue.time+effectCue.duration;}}\n"+
      "var effectWindow="+core.libraryEffectWindow.toString()+";var effectNow=effectWindow(time,effectStart,effectEnd,"+EFFECT_RAMP_FRAMES+"*thisComp.frameDuration);age=effectNow[1]*speed;"+(p.waveform==="spin"?"":"amp*=effectNow[0];")+"\n";
  }
  /** @param {any} layer @returns {any} */
  function metadata(layer) {
    var comment = String(layer.comment || ""), at = comment.indexOf(TAG);
    if (at < 0) return null;
    var line = comment.substring(at + TAG.length).split("\n")[0] || "";
    var m = /** @type {any} */ (MotionJson.parse(decodeURIComponent(line)));
    if (!m || m.version !== 1 || typeof m.instance !== "string" || !/^[0-9-]+$/.test(m.instance) || !definition({presetId:m.presetId}) || !(m.expressions instanceof Array) || !(m.effects instanceof Array) || !(m.animators instanceof Array) || !(m.masks instanceof Array)) throw new Error("Metadados do preset inválidos.");
    if(m.markerVersion!==undefined&&((m.markerVersion!==1&&m.markerVersion!==2)||typeof m.markerDurationFrames!=="number"||!isFinite(m.markerDurationFrames)||m.markerDurationFrames<1||m.markerDurationFrames>600))throw new Error("Metadados de timing inválidos.");
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
  /** @param {any} direction @returns {boolean} */
  function isDiagonal(direction){return direction==="top-left"||direction==="top-right"||direction==="bottom-left"||direction==="bottom-right";}
  /** @param {any} args @returns {MotionCommandFailure|null} */
  function validate(args) {
    var allowed = /** @type {Record<string,boolean>} */ ({presetId:true, phase:true, direction:true, durationFrames:true, intensity:true, staggerFrames:true, unit:true,easing:true,elasticity:true,overlap:true,speed:true,order:true,seed:true,settleAmount:true,settleCount:true,settleDamping:true,motionBlur:true,exitOrder:true});
    for (var k in args) if (Object.prototype.hasOwnProperty.call(args,k) && !allowed[k]) return fail(MotionContracts.ERROR.INVALID_PRESET,"Opção de preset desconhecida.");
    if (!definition(args) || (args.phase !== "in" && args.phase !== "out" && args.phase !== "both") || (args.direction !== "preset" && args.direction !== "left" && args.direction !== "right" && args.direction !== "top" && args.direction !== "bottom" && !isDiagonal(args.direction))) return fail(MotionContracts.ERROR.INVALID_PRESET,"Preset, fase ou direção inválidos.");
    if (isDiagonal(args.direction) && !core.libraryUsesDiagonals(definition(args))) return fail(MotionContracts.ERROR.INVALID_PRESET,"Este preset não aceita direção diagonal.");
    if (Object.prototype.hasOwnProperty.call(args,"exitOrder") && args.exitOrder !== "mirror" && args.exitOrder !== "repeat") return fail(MotionContracts.ERROR.INVALID_PRESET,"Ordem de saída inválida.");
    if (typeof args.durationFrames !== "number" || !isFinite(args.durationFrames) || args.durationFrames < 1 || args.durationFrames > 600 || Math.floor(args.durationFrames) !== args.durationFrames || typeof args.intensity !== "number" || !isFinite(args.intensity) || args.intensity < 0 || args.intensity > 300 || typeof args.staggerFrames !== "number" || !isFinite(args.staggerFrames) || args.staggerFrames < 0 || args.staggerFrames > 60 || Math.floor(args.staggerFrames) !== args.staggerFrames) return fail(MotionContracts.ERROR.INVALID_PRESET,"Duração, intensidade ou intervalo fora do limite.");
    if(Object.prototype.hasOwnProperty.call(args,"easing")&&(typeof args.easing!=="string"||!/^(preset|smooth|cubic|overshoot|bounce|flicker|silk|glide|spring|velvet|drift|snap|settle-wave|settle-hop|(sine|quad|quart|quint|expo|circ)-(in|out|in-out))$/.test(args.easing)))return fail(MotionContracts.ERROR.INVALID_PRESET,"Suavização inválida.");
    if(Object.prototype.hasOwnProperty.call(args,"motionBlur")&&typeof args.motionBlur!=="boolean")return fail(MotionContracts.ERROR.INVALID_PRESET,"Motion blur inválido.");
    var optional=["elasticity","overlap","speed","settleAmount","settleCount","settleDamping"];
    for(var o=0;o<optional.length;o++){var option=optional[o];if(!option||!Object.prototype.hasOwnProperty.call(args,option))continue;
      var v=args[option],min=option==="speed"?25:option==="settleCount"?0.5:0,max=option==="speed"?200:option==="settleCount"?8:100;
      if(typeof v!=="number"||!isFinite(v)||v<min||v>max)return fail(MotionContracts.ERROR.INVALID_PRESET,"Elasticidade, sobreposição, velocidade ou assentamento fora do limite.");
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
  /** Collections authored on Studio timing and its Speed/Overlap controls.
   * @param {any} p @returns {boolean} */
  function studioTimed(p) { return p.collection==="studio"||p.collection==="native"||p.collection==="premium"||p.collection==="signature"||p.collection==="momentum"||p.collection==="text"; }
  /** @param {string} kind @returns {boolean} */
  function isSettle(kind) { return kind==="settle-wave"||kind==="settle-hop"; }
  /** Option, then recipe default, then the curve's own default.
   * @param {any} p @param {any} args @param {string} key @param {string} kind @returns {number} */
  function settleDefault(p,args,key,kind) {
    if(typeof args[key]==="number")return args[key];
    if(p.defaults&&typeof p.defaults[key]==="number")return p.defaults[key];
    var wave=kind==="settle-wave";return key==="settleAmount"?(wave?35:40):key==="settleCount"?(wave?2.5:3):(wave?55:60);
  }
  /** A 3D layer turns around the transition center only in its own XY plane.
   * @param {any} tr @returns {boolean} */
  function flatOrientation(tr) {
    var names=["ADBE Rotate X","ADBE Rotate Y"],i;
    for(i=0;i<names.length;i++){var r=tr.property(names[i]);if(r&&Math.abs(r.value)>.000001)return false;}
    var o=tr.property("ADBE Orientation");if(o&&o.value)for(i=0;i<o.value.length;i++)if(Math.abs(o.value[i])>.000001)return false;
    return true;
  }
  /** Layer space to composition space through 2D parents, pre-expression, at
   * time t: [a,b,c,d,e,f] with x'=a*x+c*y+e and y'=b*x+d*y+f. Null for 3D.
   * @param {any} layer @param {number} time @returns {any} */
  function compAffine(layer,time) {
    var m=/** @type {any} */ ([1,0,0,1,0,0]),l=layer,guard=0;
    while(l&&guard++<64){
      if(l.threeDLayer)return null;
      var tr=l.property(MN_TRANSFORM),A=/** @type {any} */ (tr.property("ADBE Anchor Point").valueAtTime(time,true)),P=/** @type {any} */ (tr.property("ADBE Position").valueAtTime(time,true)),S=/** @type {any} */ (tr.property("ADBE Scale").valueAtTime(time,true)),r=tr.property("ADBE Rotate Z").valueAtTime(time,true)*Math.PI/180;
      var cs=Math.cos(r),sn=Math.sin(r),a=cs*S[0]/100,b=sn*S[0]/100,c=-sn*S[1]/100,d=cs*S[1]/100,e=P[0]-(a*A[0]+c*A[1]),f=P[1]-(b*A[0]+d*A[1]);
      m=[a*m[0]+c*m[1],b*m[0]+d*m[1],a*m[2]+c*m[3],b*m[2]+d*m[3],a*m[4]+c*m[5]+e,b*m[4]+d*m[5]+f];
      l=l.parent;
    }
    return m;
  }
  /** Read-only: the parent can map the screen direction back into its own space.
   * @param {any} layer @returns {boolean} */
  function travelMeasurable(layer) {
    if(!layer.parent)return true;
    var times=[layer.inPoint,Math.max(layer.inPoint,layer.outPoint-layer.containingComp.frameDuration)];
    for(var i=0;i<times.length;i++){var pm=/** @type {any} */ (compAffine(layer.parent,times[i]));if(!pm||Math.abs(pm[0]*pm[3]-pm[2]*pm[1])<.000000001)return false;}
    return true;
  }
  /** Distance, in composition pixels, that takes the layer out of frame along the
   * recipe's screen direction, at the start of each requested phase; and that
   * direction expressed in the parent's space, where Position lives.
   * @param {any} plan @param {any} xy @returns {{distance:number,unit:number[]}} */
  function offscreenTravel(plan,xy) {
    var l=plan.layer,comp=plan.comp,p=plan.p,length=Math.sqrt(xy[0]*xy[0]+xy[1]*xy[1]);
    if(length<.000001)throw new Error("O preset não define uma direção de saída.");
    var ux=xy[0]/length,uy=xy[1]/length,times=/** @type {any} */ ([]),distance=0,i,j;
    if(plan.args.phase!=="out")times.push(l.inPoint);
    if(plan.args.phase!=="in")times.push(Math.max(l.inPoint,l.outPoint-comp.frameDuration));
    var amp=Math.max(1,plan.args.intensity/100),grow=Math.max(1,1+Math.max(p.scale[0],p.scale[1])/100*amp),inflate=p.rotation[2]||grow>1?grow:0;
    for(i=0;i<times.length;i++){
      var m=compAffine(l,times[i]);if(!m)throw new Error("Este preset sai do quadro em 2D. Use uma camada 2D, sem parent 3D.");
      var rect=l.sourceRectAtTime(times[i],false),A=/** @type {any} */ (l.property(MN_TRANSFORM).property("ADBE Anchor Point").valueAtTime(times[i],true));
      var xs=/** @type {any} */ ([rect.left,rect.left+rect.width]),ys=/** @type {any} */ ([rect.top,rect.top+rect.height]),minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
      for(j=0;j<4;j++){var x=xs[j%2],y=ys[j>1?1:0],cx=m[0]*x+m[2]*y+m[4],cy=m[1]*x+m[3]*y+m[5];minX=Math.min(minX,cx);maxX=Math.max(maxX,cx);minY=Math.min(minY,cy);maxY=Math.max(maxY,cy);}
      distance=Math.max(distance,core.libraryOffscreenDistance(m[0]*A[0]+m[2]*A[1]+m[4],m[1]*A[0]+m[3]*A[1]+m[5],minX,minY,maxX,maxY,inflate,ux,uy,comp.width,comp.height,Math.max(8,.02*Math.max(comp.width,comp.height))));
    }
    var unit=[ux,uy];
    if(l.parent){
      var pm=/** @type {any} */ (compAffine(l.parent,times[0])),det=pm?pm[0]*pm[3]-pm[2]*pm[1]:0;
      if(Math.abs(det)<.000000001)throw new Error("A escala do parent é zero; não há como medir a saída do quadro.");
      unit=[(pm[3]*ux-pm[2]*uy)/det,(-pm[1]*ux+pm[0]*uy)/det];
    }
    return {distance:Math.round(distance*100)/100,unit:unit};
  }
  /** Layer and composition motion blur follow the presets that ask for it. Only
   * switches Moti.on turned on are turned off again, and the composition's only
   * when no other layer still uses motion blur. Returns the switches it owns.
   * @param {any} layer @param {any} owned @param {boolean} desired @param {any=} composition @returns {any} */
  function syncMotionBlur(layer,owned,desired,composition) {
    var comp=composition||layer.containingComp,next={layer:!!(owned&&owned.layer),comp:!!(owned&&owned.comp)};
    if(desired){
      if(!layer.motionBlur){layer.motionBlur=true;next.layer=true;}
      if(!comp.motionBlur){comp.motionBlur=true;next.comp=true;}
    }else{
      if(next.layer){layer.motionBlur=false;next.layer=false;}
      if(next.comp){var others=false;for(var i=1;i<=comp.numLayers;i++){var other=comp.layer(i);if(other!==layer&&other.motionBlur)others=true;}if(!others)comp.motionBlur=false;next.comp=false;}
    }
    return next.layer||next.comp?next:null;
  }
  /** Live values the user may have tuned in AE, carried when a phase is rebuilt.
   * @param {any} layer @param {any} meta @returns {any} */
  function liveValues(layer,meta) {
    if(!meta||!meta.controls)return null;
    var out=/** @type {any} */ ({direction:meta.options&&meta.options.direction,travelComputed:meta.travelComputed}),keys=/** @type {any} */ (["center","travel"]),found=false;
    for(var i=0;i<keys.length;i++){var name=meta.controls[keys[i]],e=name&&child(layer.property(MN_EFFECTS),name),prop=e&&e.property(1);if(prop&&!prop.numKeys&&!prop.expression){out[keys[i]]=prop.value;found=true;}}
    return found?out:null;
  }
  /** Signature looks whose texture or sequence depends on the seed.
   * @param {any} p @returns {boolean} */
  function signatureSeeded(p) { return p.text.order === "random" || p.text.reveal === "resolve" || (p.choreography && p.choreography.distribution === "scatter") || p.effect === "film-burn" || p.effect === "projector"; }
  /** The renderer contract is verified independently of translated labels.
   * @param {any} effect @returns {boolean} */
  function nativeCoreCompatible(effect) {
    for (var i = 1; i <= 5; i++) if (!effect || !effect.property(NATIVE_CORE + "-000" + i)) return false;
    return true;
  }
  /** Fonte unica com a galeria: packages/contracts/src/motion-library-requirements.ts,
   * montada em MotionLibraryCore. @param {any} p @returns {string[]} */
  function requiredEffects(p) { return /** @type {any} */ (global).MotionLibraryCore.libraryRequiredEffects(p); }
  /** @param {any} args @param {string} action @param {boolean=} migration @param {any[]=} selectedOverride @param {any=} phaseOwner @returns {MotionCommandFailure|null} */
  function preflight(args, action, migration, selectedOverride, phaseOwner) {
    if (action === "apply") { var validation = validate(args); if (validation) return validation; }
    else { for (var k in args) if (Object.prototype.hasOwnProperty.call(args,k)&&!(action==="remove"&&(k==="target"||k==="targets"))) return fail(MotionContracts.ERROR.INVALID_PRESET,"Esta ação não recebe esse parâmetro."); }
    var comp = app.project && app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) return fail(MotionContracts.ERROR.NO_ACTIVE_COMP,"Abra uma composição.");
    var layers = selectedOverride || comp.selectedLayers;
    if (!layers.length) return fail(MotionContracts.ERROR.NO_SELECTION,"Selecione uma camada na composição.");
    if (layers.length > 50) return fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE,"Aplique a até 50 camadas por vez.");
    if(action==="remove"&&(Object.prototype.hasOwnProperty.call(args,"target")||Object.prototype.hasOwnProperty.call(args,"targets"))){var targetError=removeTargetPreflight(args);if(targetError)return targetError;}
    if (cameraTransition && cameraTransition.hasSelected(comp)) {
      if (action !== "apply") return cameraTransition.selectionPreflight(action);
      return fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE,"Selecione as camadas de conteúdo para aplicar este preset diretamente. Para editar a pré-comp de transição, use Editar.");
    }
    var p = action === "apply" ? definition(args) : null;
    if (p && p.cameraSpec) return fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE,"Use a transição em pré-comp para este preset; ele processa a composição sem alterar as camadas.");
    for (var i = 0; i < layers.length; i++) {
      var l = /** @type {any} */ (layers[i]);
      if (l.locked) return MotionErrors.failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE,"hostError.layerLocked","Selecione camadas visuais desbloqueadas.",null,{selectionIndex:i});
      if (!l.hasVideo || l.nullLayer || l instanceof CameraLayer || l instanceof LightLayer) return fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE,"Selecione camadas visuais desbloqueadas.");
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
      if (!isText(p) && (p.position[0] || p.position[1] || p.position[2] || p.pivot !== "anchor") && pos.dimensionsSeparated) return fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE,"Reúna as dimensões de Position para aplicar presets de motion.");
      // Leaving the frame is measured in the composition plane; a 3D layer or
      // parent would need the camera's projection, which is not modeled.
      if (p.travel === "offscreen") { for (var up = l; up; up = up.parent) if (up.threeDLayer) return fail(MotionContracts.ERROR.CAPABILITY_UNAVAILABLE,"Este preset sai do quadro em 2D. Use uma camada 2D, sem parent 3D.");
        if (!travelMeasurable(l)) return fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE,"A escala do parent é zero; não há como medir a saída do quadro."); }
      if (p.pivot === "offset" && l.threeDLayer && !flatOrientation(tr)) return fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE,"Zere Orientation e as rotações X e Y para girar em torno do centro da transição.");
      if (l.outPoint <= l.inPoint) return fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE,"A camada precisa ter duração positiva.");
      if (isText(p) && !phaseOwner) { var textError = textLayerPreflight(l, textDemandFor(p, args)); if (textError) return textError; }
      if(p.mode==="transition"&&!phaseOwner){var markerError=markerPreflight(l,m,args,comp);if(markerError)return markerError;}
      if (!isText(p)) {
        var names = [];
        if (p.position[0] || p.position[1] || p.position[2] || p.pivot !== "anchor") names.push("ADBE Position");
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
        try { if (!parade || !parade.canAddProperty(effects[j])) return MotionErrors.failure(MotionContracts.ERROR.CAPABILITY_UNAVAILABLE,"hostError.effectUnavailable","Efeito nativo indisponível: " + effects[j],{effect:effects[j]}); }
        catch (capabilityError) { return MotionErrors.failure(MotionContracts.ERROR.CAPABILITY_UNAVAILABLE,"hostError.effectUnavailable","Não foi possível verificar o efeito: " + effects[j],{effect:effects[j]}); }
      }
      if (m && usesNativeCore(p)) {
        for (j = 0; j < m.effects.length; j++) if (m.effects[j].matchName === NATIVE_CORE && !nativeCoreCompatible(child(parade,m.effects[j].name))) return fail(MotionContracts.ERROR.CAPABILITY_UNAVAILABLE,"CHMS Motion Core incompatível: atualize o plugin para usar os cinco controles deste preset.");
      }
    }
    return null;
  }
  /** Header is generated exclusively from bundled functions and validated values.
   * A text selector based on characters may pass `locate`, code that defines
   * `loc` (libraryTextLocate): the timing then runs on the unit that character
   * belongs to instead of the selector's own unit.
   * `lineLocate` is that code for a Characters selector, used when the order runs per line.
   * @param {any} p @param {any} args @param {any} m @param {boolean} text @param {string=} locate @param {string=} lineLocate @returns {string} */
  function header(p,args,m,text,locate,lineLocate) {
    var duration = "effect("+MotionJson.stringify(m.effects[0].name)+")(1)", amount = "effect("+MotionJson.stringify(m.effects[1].name)+")(1)", stagger = "effect("+MotionJson.stringify(m.effects[2].name)+")(1)";
    var unit = args.unit === "preset" ? p.text.unit : args.unit,studio=studioTimed(p);
    var kind=args.easing&&args.easing!=="preset"?args.easing:p.easing,settles=p.mode==="transition"&&isSettle(kind),easeTail=settles?",elastic,settleA,settleN,settleD":",elastic";
    // A side other than the authored one mirrors the sequence too (libraryTextOrient).
    var facing=text?core.libraryTextOrient(p,args.direction):p;
    // In place, the direction picks where the sweep starts (libraryTextOrder).
    var order=args.order&&args.order!=="preset"?args.order:(text?core.libraryTextOrder(p,args.direction||"preset",unit):(facing.text.order||(facing.text.random?"random":"forward"))),sequence="",seed=typeof args.seed==="number"?args.seed:17;
    // Exit order: the shared timing already mirrors (last in, first out); repeat
    // reads the exit with the reversed index. Mirror keeps the legacy expression.
    var exitIndex=text&&unit!=="all"&&args.exitOrder==="repeat"?"(total-1-idx)":"idx";
    if(text&&unit!=="all"){
      if(order==="random")sequence="var order="+core.libraryOrder.toString()+";idx=order(idx,total"+(typeof args.seed==="number"||p.collection==="premium"?",seed":"")+");\n";
      // Characters open from (or close to) the middle of their own line, as AE lays each line out.
      else if(unit==="characters"&&(order==="center-out"||order==="edges-in")){
        if(!locate)locate=lineLocate||"var loc=[textIndex-1,textTotal,textIndex-1,textTotal];\n";
        sequence="var sequence="+core.librarySequence.toString()+";idx=sequence(loc[2],loc[3],"+MotionJson.stringify(order)+");total=Math.max(1,loc[3]);\n";
      }
      else if(order!=="forward")sequence="var sequence="+core.librarySequence.toString()+";idx=sequence(idx,total,"+MotionJson.stringify(order)+");\n";
    }
    return prefix(m) + (locate||"") + "var ease="+core.libraryEase.toString()+";\nvar timing="+(studio?core.libraryStudioTiming:core.libraryTiming).toString()+";\nvar wave="+core.libraryWave.toString()+";\n" +
      "var amp=Math.max(0,Math.min(300,"+amount+"))/100;var dur=Math.max(1,Math.min(600,"+duration+"))*thisComp.frameDuration;\n"+
      "var elastic="+controlExpression(m,"elasticity",30)+",overlap="+controlExpression(m,"overlap",65)+",speed="+(studio?"Math.max(25,Math.min(200,"+controlExpression(m,"speed",100)+"))/100":"1")+",age=(time-inPoint)*speed;\n"+
      "var seed=Math.max(0,Math.min(9999,Math.floor("+controlExpression(m,"seed",seed)+")));var idx="+(locate?"loc[0]":text && unit !== "all" ? "textIndex-1" : "0")+",rawIndex=idx,total="+(locate?"loc[1]":text && unit !== "all" ? "textTotal" : "1")+";\n"+sequence+
      markerExpression(m)+effectWindowExpression(m,p)+
      (m.markerVersion===2?"var u=["+(args.phase==="out"?"1":"timing(time,inStart,outEnd,markerIn,\"in\",idx,total,Math.max(0,Math.min(60,"+stagger+"))*thisComp.frameDuration"+(studio?",overlap":"")+")[0]")+","+(args.phase==="in"?"1":"timing(time,inStart,outEnd,markerOut,\"out\","+exitIndex+",total,Math.max(0,Math.min(60,"+stagger+"))*thisComp.frameDuration"+(studio?",overlap":"")+")[1]")+"];\n":
      m.markerVersion===1?"var totalSpan="+(args.phase==="both"?"markerIn+markerOut":"0")+";if(totalSpan>markerSpan){markerIn*=markerSpan/totalSpan;markerOut*=markerSpan/totalSpan;}var u=["+(args.phase==="out"?"1":"timing(time,inPoint,outPoint,markerIn,\"in\",idx,total,Math.max(0,Math.min(60,"+stagger+"))*thisComp.frameDuration"+(studio?",overlap":"")+")[0]")+","+(args.phase==="in"?"1":"timing(time,inPoint,outPoint,markerOut,\"out\","+exitIndex+",total,Math.max(0,Math.min(60,"+stagger+"))*thisComp.frameDuration"+(studio?",overlap":"")+")[1]")+"];\n":
      "var u=timing(time,inPoint,outPoint,dur,"+MotionJson.stringify(args.phase)+",idx,total,Math.max(0,Math.min(60,"+stagger+"))*thisComp.frameDuration"+(studio?",overlap":"")+");\n"+
      (exitIndex!=="idx"&&args.phase!=="in"?"u[1]=timing(time,inPoint,outPoint,dur,"+MotionJson.stringify(args.phase)+","+exitIndex+",total,Math.max(0,Math.min(60,"+stagger+"))*thisComp.frameDuration"+(studio?",overlap":"")+")[1];\n":""))+
      // Settle curves read their live controls; the exit term turns into anticipation.
      (settles?"var settleA="+controlExpression(m,"settleAmount",settleDefault(p,args,"settleAmount",kind))+",settleN="+controlExpression(m,"settleCount",settleDefault(p,args,"settleCount",kind))+",settleD="+controlExpression(m,"settleDamping",settleDefault(p,args,"settleDamping",kind))+";\n":"")+
      "var w="+(p.mode === "transition" ? "2-ease(u[0],"+MotionJson.stringify(kind)+easeTail+")-ease(u[1],"+MotionJson.stringify(kind)+easeTail+(settles?",1":"")+")" : "wave(age,idx,"+MotionJson.stringify(p.waveform === "none" ? "wiggle" : p.waveform)+",seed)")+";var fadeWeight=w;\n"+
      (p.mode === "transition" && p.waveform !== "none" ? "w+=wave(age,idx,"+MotionJson.stringify(p.waveform)+",seed)*Math.abs(w)*0.25;\n" : "")+
      (p.choreography ? "var choreography="+core.libraryChoreography.toString()+";var pose=choreography(Math.max(0,Math.min(1,Math.min(u[0],u[1]))),w,"+p.position.join(",")+","+MotionJson.stringify(p.choreography.path)+","+MotionJson.stringify(p.choreography.distribution||"uniform")+",rawIndex,seed,"+(typeof p.choreography.turns==="number"?p.choreography.turns:1)+","+MotionJson.stringify(args.direction)+");\n" : "")+
      ((p.text.reveal==="resolve"||p.text.reveal==="roll")&&p.collection!=="signature"?"var glyph="+core.librarySignatureGlyph.toString()+";\n":"")+
      (p.collection==="text"&&p.text.decode?"var decodeGlyph="+core.libraryTextDecode.toString()+";\n":"")+
      // Signature looks share one progress, velocity and envelope with the preview.
      (p.collection==="signature" ? "var envelope="+core.librarySignatureEnvelope.toString()+";var glyph="+core.librarySignatureGlyph.toString()+";var sp=Math.max(0,Math.min(1,Math.min(u[0],u[1])));var sv="+(p.mode==="transition"?"("+core.librarySignatureVelocity.toString()+")(sp,"+MotionJson.stringify(args.easing&&args.easing!=="preset"?args.easing:p.easing)+",elastic,ease)":"0")+";\n" : "");
  }
  /** A Point Control is read as a vector; without the control, the Anchor Point.
   * @param {any} meta @param {string} key @returns {string} */
  function pointExpression(meta,key){return meta.controls&&meta.controls[key]?"effect("+MotionJson.stringify(meta.controls[key])+")(1)":"transform.anchorPoint";}
  /** AE expressions return a Property for effect(...)(1): typeof is not "number"
   * until it is converted, and the shared curves test typeof. Number() works in both.
   * @param {any} meta @param {string} key @param {number|string} fallback @returns {string} */
  function controlExpression(meta,key,fallback){return meta.controls&&meta.controls[key]?"Number(effect("+MotionJson.stringify(meta.controls[key])+")(1))":String(fallback);}
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
    if(p.collection==="signature"&&p.effect!=="rgb"){/** @type {any} */ (global).MotionSignatureEffects.apply(plan,{effect:effect,set:set,express:express,effectExpression:effectExpression,header:header});return;}
    var looks=/** @type {any} */ (global).MotionLookEffects;
    if(looks&&looks.handles(p)){looks.apply(plan,{effect:effect,set:set,express:express,effectExpression:effectExpression,header:header});return;}
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
  /** @param {any} plan @param {string} role @param {boolean=} characters a selector on characters, whatever the unit @returns {any} */
  function animator(plan,role,characters){
    var name="Moti.on "+plan.meta.instance+" · "+role, group=plan.layer.property(MN_TEXT).property(MN_ANIMATORS), a=child(group,name);
    if(plan.textUsed)plan.textUsed[name+"|"]=true;
    if(!a){a=group.addProperty("ADBE Text Animator");a.name=name;plan.created.push({group:[MN_TEXT,MN_ANIMATORS],name:name});var record=null;for(var n=0;n<plan.meta.animators.length;n++)if(plan.meta.animators[n].name===name)record=plan.meta.animators[n];if(record)record.properties=[];else plan.meta.animators.push({name:name,matchName:"ADBE Text Animator",properties:[]});}
    var selectors=a.property("ADBE Text Selectors"), sel=child(selectors,"Moti.on Timing");
    if(!sel){sel=selectors.addProperty("ADBE Text Expressible Selector");sel.name="Moti.on Timing";}
    var unit=plan.args.unit==="preset"?plan.p.text.unit:plan.args.unit;
    set(plan,sel.property("ADBE Text Range Type2"),characters?1:unit==="words"?3:unit==="lines"?4:1);
    return a;
  }
  /** @param {any} plan @param {any} a @param {string} mn @param {any} value */
  function textProperty(plan,a,mn,value){if(plan.textUsed)plan.textUsed[a.name+"|"+mn]=true;var g=a.property("ADBE Text Animator Properties"),record=null,exists=false;for(var i=0;i<plan.meta.animators.length;i++)if(plan.meta.animators[i].name===a.name)record=plan.meta.animators[i];for(i=0;record&&i<record.properties.length;i++)if(record.properties[i]===mn)exists=true;var p=exists?g.property(mn):g.addProperty(mn);set(plan,p,value);if(!exists)record.properties.push(mn);}
  /** @param {any} plan @param {any} a @param {string} body @param {string=} locate */
  function textSelector(plan,a,body,locate){var unit=plan.args.unit==="preset"?plan.p.text.unit:plan.args.unit;express(plan,[MN_TEXT,MN_ANIMATORS,a.name,"ADBE Text Selectors","Moti.on Timing","ADBE Text Expressible Amount"],header(plan.p,plan.args,plan.meta,true,locate,unit==="characters"?textLocateCode(plan,"characters"):undefined)+body);}
  /** The expressible selector stops at ±100%: a vector this long (px) carries any
   * per-unit offset as amount×TEXT_SPAN/100 (measured on AE 26.5). */
  var TEXT_SPAN=20000;
  /** The same ceiling would cut Intensity above 100% and every anticipation:
   * movement, scale, turn and blur values are TEXT_RANGE times the recipe and
   * their selectors return a TEXT_RANGE-th, so weight × Intensity reaches
   * ±TEXT_RANGE before AE clamps. A power of two keeps a unit that has not
   * started exactly at zero scale (a third leaves 1e-14, which AE still counts
   * in the layer's bounds). Skew has its own range (textSkew). */
  var TEXT_RANGE=4;
  /** Recipe distances are drawn for the card sample of the recipe's unit; AE reads
   * them in em of the live font size (libraryTextReference), so every text keeps
   * the card's proportions. A recipe that crosses the frame keeps frame pixels.
   * @param {any} plan @returns {string} */
  function textEm(plan){return plan.p.travel==="offscreen"?String(plan.comp.height/1080):String(textSnapshot(plan).fontSize/core.libraryTextReference(plan.p.text.unit));}
  /** The text and its font size as the preset finds them. The expressions never
   * read the layer's own Source Text: After Effects then re-evaluates them on
   * every keystroke, and its text tool stops deleting and types ahead of the
   * cursor. A later font size keeps the applied proportions until the preset is
   * adjusted or applied again.
   * @param {any} plan @returns {{text:string,fontSize:number}} */
  function textSnapshot(plan){
    if(plan.textSnapshot)return plan.textSnapshot;
    var source="",size=0;
    try{var d=plan.layer.property(MN_TEXT).property("ADBE Text Document").value;source=String(d.text);size=Number(d.fontSize);}catch(readError){plan.textSnapshotError=String(readError);}
    plan.textSnapshot={text:source,fontSize:size>0?size:core.libraryTextReference(plan.p.text.unit)};
    return plan.textSnapshot;
  }
  /** Code that defines `loc` (libraryTextLocate) for a selector's character on the
   * text as applied. Once the text is edited to another length, a character's
   * place is read on one line and its unit spread evenly over the applied units,
   * until the preset is adjusted or applied again.
   * @param {any} plan @param {string} unit @returns {string} */
  function textLocateCode(plan,unit){
    var source=textSnapshot(plan).text,count=source.replace(/[\r\n]/g,"").split(String.fromCharCode(3)).join("").length,units=core.libraryTextLocate(source,0,unit)[1];
    var estimate=unit==="characters"?"[textIndex-1,textTotal,textIndex-1,textTotal]":"[Math.min("+(units-1)+",Math.floor((textIndex-1)*"+units+"/Math.max(1,textTotal))),"+units+",textIndex-1,textTotal]";
    return "var loc=textTotal==="+count+"?("+core.libraryTextLocate.toString()+")("+MotionJson.stringify(source)+",textIndex-1,"+MotionJson.stringify(unit)+"):"+estimate+";\n";
  }
  /** An animator vector in recipe pixels, read live in em of the font and
   * carried at TEXT_RANGE times its size.
   * @param {any} plan @param {any} a @param {string} mn @param {number[]} v */
  function textDistance(plan,a,mn,v){
    // A side turned by libraryDirection leaves float dust (3e-15) on the other axis.
    var terms=[],moves=false,clean=[];for(var i=0;i<v.length;i++){var n=/** @type {number} */ (v[i]);clean.push(Math.abs(n)<1e-9?0:n*TEXT_RANGE);terms.push(clean[i]+"*em");if(clean[i])moves=true;}
    textProperty(plan,a,mn,clean);
    if(moves)express(plan,[MN_TEXT,MN_ANIMATORS,a.name,"ADBE Text Animator Properties",mn],prefix(plan.meta)+"var em="+textEm(plan)+";["+terms.join(",")+"];");
  }
  /** Real X/Y turns need per-character 3D; legacy 2D recipes never add them.
   * @param {any} plan @param {any} a @param {any} o the recipe facing its side */
  function textRotation3D(plan,a,o){if(!core.libraryTextThreeD(o))return;if(o.rotation[0])textProperty(plan,a,"ADBE Text Rotation X",o.rotation[0]*TEXT_RANGE);if(o.rotation[1])textProperty(plan,a,"ADBE Text Rotation Y",o.rotation[1]*TEXT_RANGE);}
  /** Centred spacing. Tracking Amount widens a line from its aligned edge (a left
   * paragraph stretches to the right), so each character instead moves away from
   * the centre of its own line by its column times the recipe's spacing, at the
   * weight of the unit it belongs to: the line widens around its centre for any
   * alignment and rests exactly where it was.
   * @param {any} plan @param {string} weight */
  function textSpacing(plan,weight){
    var p=plan.p,a=animator(plan,"Espaçamento",true),unit=plan.args.unit==="preset"?p.text.unit:plan.args.unit;
    textProperty(plan,a,"ADBE Text Position 3D",[TEXT_SPAN,TEXT_SPAN,TEXT_SPAN]);
    textSelector(plan,a,"var spread=(loc[2]-(loc[3]-1)/2)*"+p.text.tracking+"*"+textEm(plan)+"*"+weight+"*amp;[spread*100/"+TEXT_SPAN+",0,0];",
      textLocateCode(plan,unit));
  }
  /** Holds each unit's pivot (libraryTextPivot: its visual centre plus the
   * recipe's origin) in place while this phase scales and turns it, so a unit
   * turns around that point instead of its baseline anchor and the text never
   * shifts at rest. Reads the applied font size and the live Anchor Point Grouping.
   * @param {any} plan @param {any} o the recipe facing its side @param {string[]} scale weights of X, Y, Z @param {string} turn weight of the turns */
  function textHold(plan,o,scale,turn){
    var r=o.rotation,s=o.scale,threeD=core.libraryTextThreeD(o);
    if(!s[0]&&!s[1]&&!s[2]&&!r[2]&&!(threeD&&(r[0]||r[1])))return;
    var a=animator(plan,"Centro");textProperty(plan,a,"ADBE Text Position 3D",[TEXT_SPAN,TEXT_SPAN,TEXT_SPAN]);
    textSelector(plan,a,"var hold="+core.libraryTextHold.toString()+",pivot="+core.libraryTextPivot.toString()+";\n"+
      "var c=pivot("+MotionJson.stringify(o.text.origin||[0,0,0])+",Number(text.moreOption.anchorPointGrouping),"+textSnapshot(plan).fontSize+");\n"+
      // The movement selectors stop at ±TEXT_RANGE: the hold follows the same amount.
      "var reach=function(v){return Math.max(-"+TEXT_RANGE+",Math.min("+TEXT_RANGE+",v));};\n"+
      "var h=hold(c,1+"+s[0]+"/100*reach(amp*"+scale[0]+"),1+"+s[1]+"/100*reach(amp*"+scale[1]+"),1+"+s[2]+"/100*reach(amp*"+scale[2]+"),"+r[0]+"*reach(amp*"+turn+"),"+r[1]+"*reach(amp*"+turn+"),"+r[2]+"*reach(amp*"+turn+"),"+threeD+");\n"+
      "[h[0]*100/"+TEXT_SPAN+",h[1]*100/"+TEXT_SPAN+",h[2]*100/"+TEXT_SPAN+"];");
  }
  /** Rest values of the animator properties the text recipes use. */
  var TEXT_NEUTRAL=/** @type {Record<string,any>} */ ({"ADBE Text Tracking Amount":0,"ADBE Text Anchor Point 3D":[0,0,0],"ADBE Text Position 3D":[0,0,0],"ADBE Text Scale 3D":[100,100,100],"ADBE Text Rotation":0,"ADBE Text Rotation X":0,"ADBE Text Rotation Y":0,"ADBE Text Skew":0,"ADBE Text Blur":[0,0],"ADBE Text Opacity":100,"ADBE Text Character Offset":0});
  /** A layer built by an earlier engine keeps owned parts this build no longer
   * uses: the edge-anchored Tracking Amount, the weighted Anchor Point, an
   * animator for spacing. They are set to rest (a property) or silenced (a
   * selector) through set/express, so Undo and rollback restore them exactly.
   * @param {any} plan */
  function textSettleStale(plan){
    var animators=plan.meta.animators,list=plan.layer.property(MN_TEXT).property(MN_ANIMATORS);
    for(var i=0;i<animators.length;i++){var record=animators[i],a=child(list,record.name);if(!a)continue;
      if(!plan.textUsed[record.name+"|"]){express(plan,[MN_TEXT,MN_ANIMATORS,record.name,"ADBE Text Selectors","Moti.on Timing","ADBE Text Expressible Amount"],prefix(plan.meta)+"0;");continue;}
      for(var j=0;j<record.properties.length;j++){var mn=record.properties[j];if(plan.textUsed[record.name+"|"+mn]||!Object.prototype.hasOwnProperty.call(TEXT_NEUTRAL,mn))continue;
        var property=a.property("ADBE Text Animator Properties").property(mn);if(property){if(property.expression)express(plan,[MN_TEXT,MN_ANIMATORS,record.name,"ADBE Text Animator Properties",mn],prefix(plan.meta)+"value;");set(plan,property,TEXT_NEUTRAL[mn]);}}
    }
  }
  /** Skew stops at ±70° in AE, so it rides its own animator with the largest
   * range that keeps the recipe's slant inside that limit.
   * @param {any} plan */
  function textSkew(plan){
    var skew=plan.p.text.skew,range=Math.max(1,Math.min(TEXT_RANGE,Math.floor(70/Math.abs(skew)))),a=animator(plan,"Tipografia");
    textProperty(plan,a,"ADBE Text Skew",skew*range);textSelector(plan,a,"w*amp*100/"+range+";");
  }
  /** @param {any} plan */
  function textAnimation(plan){
    plan.textUsed={};
    var p=plan.p,o=core.libraryTextOrient(p,plan.args.direction),xy=core.libraryDirection(p.position[0],p.position[1],plan.args.direction),a=animator(plan,"Movimento");
    if(p.choreography){
      // One vector selector maps nominal pixels to independent X/Y/Z paths.
      // Separate animators keep rotation, spacing and scale from borrowing the
      // position selector's three different channel weights.
      textProperty(plan,a,"ADBE Text Position 3D",[TEXT_SPAN,TEXT_SPAN,TEXT_SPAN]);
      textSelector(plan,a,"var em="+textEm(plan)+";[pose[0]*em*amp*100/"+TEXT_SPAN+",pose[1]*em*amp*100/"+TEXT_SPAN+",pose[2]*em*amp*100/"+TEXT_SPAN+"];");
      if(o.scale[0]||o.scale[1]||o.scale[2]){
        a=animator(plan,"Escala");textProperty(plan,a,"ADBE Text Scale 3D",[100+o.scale[0]*TEXT_RANGE,100+o.scale[1]*TEXT_RANGE,100+o.scale[2]*TEXT_RANGE]);
        textSelector(plan,a,"[pose[4]*amp*100/"+TEXT_RANGE+",pose[5]*amp*100/"+TEXT_RANGE+",w*amp*100/"+TEXT_RANGE+"];");
      }
      if(o.rotation[2]||core.libraryTextThreeD(o)&&(o.rotation[0]||o.rotation[1])){a=animator(plan,"Rotação");textProperty(plan,a,"ADBE Text Rotation",o.rotation[2]*TEXT_RANGE);textRotation3D(plan,a,o);textSelector(plan,a,"pose[3]*amp*100/"+TEXT_RANGE+";");}
      if(p.text.skew)textSkew(plan);
      textHold(plan,o,["pose[4]","pose[5]","w"],"pose[3]");
    }else{
      textDistance(plan,a,"ADBE Text Position 3D",[xy[0],xy[1],p.position[2]]);
      textProperty(plan,a,"ADBE Text Scale 3D",[100+o.scale[0]*TEXT_RANGE,100+o.scale[1]*TEXT_RANGE,100+o.scale[2]*TEXT_RANGE]);
      textProperty(plan,a,"ADBE Text Rotation",o.rotation[2]*TEXT_RANGE);
      textRotation3D(plan,a,o);
      textSelector(plan,a,"var move=w*amp*100/"+TEXT_RANGE+";[move,move,move];");
      textHold(plan,o,["w","w","w"],"w");
      if(p.text.skew)textSkew(plan);
    }
    if(p.text.tracking)textSpacing(plan,"w");
    if(p.fade){a=animator(plan,"Opacidade");textProperty(plan,a,"ADBE Text Opacity",0);textSelector(plan,a,p.text.reveal==="typewriter"?"Math.min(u[0],u[1])<(idx+1)/total?Math.min(1,amp)*100:0;":p.mode==="transition"?"var opacity=Math.max(0,Math.min(1,fadeWeight*amp));[opacity*100,opacity*100,opacity*100];":"var opacity=Math.abs(w)*Math.min(1,amp)*.7;[opacity*100,opacity*100,opacity*100];");}
    if(p.text.blur){a=animator(plan,"Foco");textDistance(plan,a,"ADBE Text Blur",[o.text.blurAxis==="y"?0:p.text.blur,o.text.blurAxis==="x"?0:p.text.blur]);textSelector(plan,a,"var b="+(p.mode==="transition"?"Math.max(0,w)":"Math.abs(w)")+"*amp*100/"+TEXT_RANGE+";[b,b,b];");}
    // The fill tints arriving units and returns to the editable source fill at rest.
    if(p.text.fill&&(p.mode==="transition"||p.collection==="text")){a=animator(plan,"Cor");textProperty(plan,a,"ADBE Text Fill Color",[p.text.fill[0],p.text.fill[1],p.text.fill[2],1]);textSelector(plan,a,"var c="+(p.mode==="transition"?"Math.max(0,Math.min(1,fadeWeight))":"(.5+.5*w)")+"*Math.min(1,amp)*100;[c,c,c];");}
    if((p.text.reveal==="resolve"||p.text.reveal==="roll")&&p.mode==="transition"){a=animator(plan,"Glifos");textProperty(plan,a,"ADBE Text Character Offset",30);textSelector(plan,a,"var g=glyph("+MotionJson.stringify(p.text.reveal)+",Math.min(u[0],u[1]),fadeWeight,rawIndex,seed)*(amp>0?100/30:0);[g,g,g];");}
    if(p.text.decode){a=animator(plan,"Decodificação");textProperty(plan,a,"ADBE Text Character Offset",30);textSelector(plan,a,"var amount="+(p.collection==="text"?"decodeGlyph(age,idx,seed)":"Math.round(Math.sin(Math.floor((time-inPoint)*18)*7.7+textIndex*11.3)*30)")+"*"+(p.mode==="transition"?"Math.max(0,Math.min(1,w))":"1")+"*amp;[amount*100/30,amount*100/30,amount*100/30];");}
    if(p.text.mask){
      var masks=plan.layer.property("ADBE Mask Parade"),name="Moti.on "+plan.meta.instance+" · Janela",mask=child(masks,name);
      if(!mask){
        mask=masks.addProperty("ADBE Mask Atom");mask.name=name;plan.created.push({group:["ADBE Mask Parade"],name:name});plan.meta.masks.push({name:name,matchName:"ADBE Mask Atom"});
        var rect=plan.rect,shape=new Shape(),pad=8;
        shape.vertices=[[rect.left-pad,rect.top-pad],[rect.left+rect.width+pad,rect.top-pad],[rect.left+rect.width+pad,rect.top+rect.height+pad],[rect.left-pad,rect.top+rect.height+pad]];
        shape.inTangents=[[0,0],[0,0],[0,0],[0,0]];shape.outTangents=[[0,0],[0,0],[0,0],[0,0]];shape.closed=true;mask.property("ADBE Mask Shape").setValue(shape);
      }
    }
    textSettleStale(plan);
  }
  /** @param {any} plan */
  function layerAnimation(plan){
    var p=plan.p, tr=plan.layer.property(MN_TRANSFORM),h=header(p,plan.args,plan.meta,false),xy=core.libraryDirection(p.position[0],p.position[1],plan.args.direction),scale=plan.comp.height/1080;
    var vec=[xy[0]*scale,xy[1]*scale,p.position[2]*scale],terms=[],i,unit=plan.travelUnit;
    // Each rotation axis has its own weight; a pivot must turn by exactly that angle.
    /** @param {number} axis @returns {string} */
    function rotationWeight(axis){return p.choreography?"pose[3]":p.effect==="camera-shake"?"(wave(age*3,"+axis+",\"wiggle\",seed+6)*fadeWeight)":p.mode==="transition"?"w":"wave(age,"+axis+","+MotionJson.stringify(p.waveform)+",seed+6)";}
    for(i=0;i<(plan.layer.threeDLayer?3:2);i++)terms.push(unit&&i<2?"value["+i+"]+travel*"+unit[i]+"*w":p.choreography?"value["+i+"]+pose["+i+"]*"+scale+"*amp":"value["+i+"]+"+vec[i]+"*amp*"+(p.effect==="camera-shake"?"(wave(age*3,"+i+",\"wiggle\",seed)*fadeWeight)":p.mode==="transition"?"w":"wave(age,"+i+","+MotionJson.stringify(p.waveform)+",seed)"));
    if(vec[0]||vec[1]||vec[2]||p.pivot!=="anchor"){
      // Out-of-frame travel is measured, not scaled by Intensity: it always clears the frame.
      var body=(unit?"var travel="+controlExpression(plan.meta,"travel",0)+";":"")+"["+terms.join(",")+"];";
      if(p.pivot==="offset"){
        // Turn around the live transition center C: the position cancels how far C
        // moves when the layer rotates by d around its Anchor Point, in the rest
        // rotation's frame. Anchor Point is never changed.
        var rz=p.rotation[2],q="("+rotationWeight(2)+")*amp";
        body=(unit?"var travel="+controlExpression(plan.meta,"travel",0)+";":"")+"var q="+q+",d=("+rz+")*q*Math.PI/180,c="+pointExpression(plan.meta,"center")+",a=transform.anchorPoint,s=transform.scale;"+
          "var vx=(c[0]-a[0])*s[0]/100,vy=(c[1]-a[1])*s[1]/100,r0=(transform.rotation-("+rz+")*q)*Math.PI/180;"+
          "var ex=vx*(1-Math.cos(d))+vy*Math.sin(d),ey=vy*(1-Math.cos(d))-vx*Math.sin(d);"+
          "["+terms[0]+"+ex*Math.cos(r0)-ey*Math.sin(r0),"+terms[1]+"+ex*Math.sin(r0)+ey*Math.cos(r0)"+(terms.length>2?","+terms[2]:"")+"];";
      }
      if(p.pivot==="edge"){
        // Rotate around a source-space edge while leaving Anchor Point intact.
        // The extra position offsets cancel the edge displacement at rest.
        var anchor=tr.property("ADBE Anchor Point").valueAtTime(plan.layer.inPoint,true),rect=plan.layer.sourceRectAtTime(plan.layer.inPoint,false);
        var edgeDirection=plan.args.direction==="preset"?(Math.abs(p.rotation[1])>Math.abs(p.rotation[0])?"left":"bottom"):plan.args.direction;
        var edge=edgeDirection==="left"?rect.left:edgeDirection==="right"?rect.left+rect.width:anchor[0];
        var edgeY=edgeDirection==="top"?rect.top:edgeDirection==="bottom"?rect.top+rect.height:anchor[1];
        var dx=anchor[0]-edge,dy=anchor[1]-edgeY;
        body="var rx="+p.rotation[0]+"*("+rotationWeight(0)+")*amp*Math.PI/180,ry="+p.rotation[1]+"*("+rotationWeight(1)+")*amp*Math.PI/180;var sx=transform.scale[0]/100,sy=transform.scale[1]/100;var vx="+dx+"*sx,vy="+dy+"*sy;var delta=[vx*(Math.cos(ry)-1)+vy*Math.sin(rx)*Math.sin(ry),vy*(Math.cos(rx)-1),-vx*Math.sin(ry)+vy*Math.sin(rx)*Math.cos(ry)];["+terms[0]+"+delta[0],"+terms[1]+"+delta[1],"+terms[2]+"+delta[2]];";
        if(!plan.layer.threeDLayer)body="var rz=("+p.rotation[2]+")*("+rotationWeight(2)+")*amp*Math.PI/180;var vx="+dx+"*transform.scale[0]/100,vy="+dy+"*transform.scale[1]/100;var delta=[vx*(Math.cos(rz)-1)-vy*Math.sin(rz),vx*Math.sin(rz)+vy*(Math.cos(rz)-1)];["+terms[0]+"+delta[0],"+terms[1]+"+delta[1]];";
      }
      express(plan,[MN_TRANSFORM,"ADBE Position"],h+body);
    }
    if(p.scale[0]||p.scale[1]||p.scale[2]){
      terms=[];for(i=0;i<(plan.layer.threeDLayer?3:2);i++){var factor="1+"+p.scale[i]+"/100*amp*"+(p.choreography?(i===0?"pose[4]":i===1?"pose[5]":"w"):p.mode==="transition"?"w":"wave(age,"+i+","+MotionJson.stringify(p.waveform)+",seed+2)");
        // A Momentum layer hidden at zero scale stays flat above 100% Intensity instead of flipping.
        terms.push("value["+i+"]*"+(p.collection==="momentum"&&p.scale[i]<0?"Math.max(0,"+factor+")":"("+factor+")"));}express(plan,[MN_TRANSFORM,"ADBE Scale"],h+"["+terms.join(",")+"];");
    }
    var rotations=["ADBE Rotate X","ADBE Rotate Y","ADBE Rotate Z"];
    for(i=0;i<3;i++)if(p.rotation[i]&&(i===2||plan.layer.threeDLayer))express(plan,[MN_TRANSFORM,rotations[i]],h+"value+"+p.rotation[i]+"*amp*"+rotationWeight(i)+";");
    if(p.fade)express(plan,[MN_TRANSFORM,"ADBE Opacity"],h+"value*(1-Math.max(0,Math.min(1,fadeWeight*amp)));");
  }
  /** Measured travel and the transition center become live controls. A rebuilt
   * preset keeps the user's center, and keeps an edited distance while the
   * direction is unchanged; a distance never edited is measured again.
   * @param {any} plan */
  function liveGeometry(plan){
    var p=plan.p,m=plan.meta,pt=plan.locale.indexOf("pt")===0,keep=m.keep||liveValues(plan.layer,m),name,control;
    delete m.keep;
    if(isText(p)||(p.travel!=="offscreen"&&p.pivot!=="offset"))return;
    if(!m.controls)m.controls={};
    if(p.travel==="offscreen"){
      var measured=offscreenTravel(plan,core.libraryDirection(p.position[0],p.position[1],plan.args.direction)),value=measured.distance;
      if(keep&&typeof keep.travel==="number"&&keep.direction===plan.args.direction&&typeof keep.travelComputed==="number"&&Math.abs(keep.travel-keep.travelComputed)>.01)value=keep.travel;
      name=m.controls.travel?m.controls.travel.split(" · ").slice(1).join(" · "):(pt?"Distância (px)":"Distance (px)");
      control=effect(plan,name,"ADBE Slider Control");set(plan,control.property(1),value);
      m.controls.travel=control.name;m.travelComputed=measured.distance;plan.travelUnit=measured.unit;
    }
    if(p.pivot==="offset"){
      var tr=plan.layer.property(MN_TRANSFORM),anchor=tr.property("ADBE Anchor Point").valueAtTime(plan.layer.inPoint,true),rect=plan.layer.sourceRectAtTime(plan.layer.inPoint,false),offset=p.pivotOffset||[0,0];
      var center=keep&&keep.center&&keep.center.length>=2?[keep.center[0],keep.center[1]]:[anchor[0]+offset[0]*rect.width,anchor[1]+offset[1]*rect.height];
      name=m.controls.center?m.controls.center.split(" · ").slice(1).join(" · "):(pt?"Centro da transição":"Transition center");
      control=effect(plan,name,"ADBE Point Control");set(plan,control.property(1),center);
      m.controls.center=control.name;
    }
  }
  /** Anchor Point Grouping of a text layer (1 characters, 2 words, 3 lines, 4 all).
   * @param {any} layer @returns {any} */
  function textGrouping(layer){var text=layer.property(MN_TEXT),more=text&&text.property("ADBE Text More Options");return more?more.property("ADBE Text Anchor Point Option"):null;}
  /** The pivot grouping and per-character 3D one text recipe needs. Recipes
   * outside the text collection keep the layer's own grouping.
   * @param {any} p @param {any} opts @returns {{group:number|null,threeD:boolean}} */
  function textDemandFor(p,opts){var out={group:/** @type {number|null} */ (null),threeD:false,soft:false};if(!p||p.category.indexOf("text-")!==0)return out;
    out.threeD=core.libraryTextThreeD(p);
    if(!p.rotation[0]&&!p.rotation[1]&&!p.rotation[2]&&!p.scale[0]&&!p.scale[1]&&!p.scale[2]&&!p.text.origin)return out;
    var o=opts||{},unit=p.text.grouping||(!o.unit||o.unit==="preset"?p.text.unit:o.unit);
    // Older recipes were drawn turning whole words and lines but left AE on its
    // default per-character pivot. They now ask for their unit's grouping too,
    // softly: it yields to a recipe that requires another grouping and never
    // overrides a layer whose own animators depend on its grouping.
    if(p.collection!=="text"&&p.text.grouping===undefined){if(unit==="characters")return out;out.soft=true;}
    out.group=unit==="words"?2:unit==="lines"?3:unit==="all"?4:1;return out;}
  /** Animators the user built on the layer, outside Moti.on.
   * @param {any} layer @returns {boolean} */
  function userTextAnimators(layer){var text=layer.property(MN_TEXT),list=text&&text.property(MN_ANIMATORS);for(var j=1;list&&j<=list.numProperties;j++)if(String(list.property(j).name).indexOf("Moti.on ")!==0)return true;return false;}
  /** A soft grouping request is dropped where it cannot apply cleanly.
   * @param {any} layer @param {any} demand @returns {any} */
  function textDemandAllowed(layer,demand){if(!demand.soft||demand.group===null)return demand;var gp=textGrouping(layer);
    if(!gp||gp.numKeys||gp.expression||(gp.value!==demand.group&&userTextAnimators(layer)))return {group:null,threeD:demand.threeD,soft:true};return demand;}
  /** A user animator depends on the grouping and 3D mode it was built with.
   * @param {any} layer @param {any} requested @returns {MotionCommandFailure|null} */
  function textLayerPreflight(layer,requested){var demand=textDemandAllowed(layer,requested);if(!demand.threeD&&demand.group===null)return null;
    if(demand.threeD&&typeof layer.threeDPerChar!=="boolean")return fail(MotionContracts.ERROR.CAPABILITY_UNAVAILABLE,"O host não oferece texto 3D por caractere nesta camada.");
    var gp=textGrouping(layer);if(demand.group!==null){if(!gp)return fail(MotionContracts.ERROR.CAPABILITY_UNAVAILABLE,"Agrupamento de texto indisponível neste host.");if(gp.numKeys||gp.expression)return fail(MotionContracts.ERROR.EXPRESSION_CONFLICT,"O agrupamento tem animação do usuário. Edite-o no After Effects antes de aplicar.");}
    if(((demand.group!==null&&gp.value!==demand.group)||(demand.threeD&&!layer.threeDPerChar))&&userTextAnimators(layer)){return fail(MotionContracts.ERROR.EXPRESSION_CONFLICT,"Um animador do usuário usa o agrupamento ou o modo 3D atual. Preserve essa configuração ou use outra camada.");}
    return null;
  }
  /** A single text preset owns the layer's grouping and 3D mode while applied;
   * the values it found come back on removal.
   * @param {any} plan */
  function configureTextLayer(plan){var l=plan.layer,m=plan.meta,demand=textDemandAllowed(plan.layer,textDemandFor(plan.p,plan.args)),gp=textGrouping(l);
    if(!demand.threeD&&demand.group===null){restoreTextLayer(l,m);return;}
    if(!plan.textBefore)plan.textBefore={perChar3D:l.threeDPerChar,grouping:gp?gp.value:null,state:m.textState?MotionJson.parse(MotionJson.stringify(m.textState)):null};
    if(!m.textState)m.textState={perChar3D:!!l.threeDPerChar,grouping:gp?gp.value:1};
    if(gp&&demand.group!==null&&gp.value!==demand.group)gp.setValue(demand.group);
    var want=demand.threeD||m.textState.perChar3D;if(!!l.threeDPerChar!==want)l.threeDPerChar=want;
  }
  /** @param {any} layer @param {any} m */
  function restoreTextLayer(layer,m){if(!m.textState)return;var gp=textGrouping(layer);if(gp)gp.setValue(m.textState.grouping);layer.threeDPerChar=m.textState.perChar3D;delete m.textState;}
  /** @param {any} plan */
  function applyLayer(plan){
    var l=plan.layer,m=plan.meta,p=plan.p,labels=plan.locale.indexOf("pt")===0?CONTROL_LABELS:CONTROL_LABELS_EN;
    if(p.category==="motion-3d")l.threeDLayer=true;
    for(var i=0;i<CONTROL_KEYS.length;i++){
      // Keep control names and order stable when locale changes or Apply repeats.
      var key=m.effects[i]?m.effects[i].name.split(" · ").slice(1).join(" · "):labels[i];
      var e=effect(plan,key,"ADBE Slider Control");set(plan,e.property(1),plan.args[CONTROL_KEYS[i] || "durationFrames"]);
    }
    var extras=[],kind=plan.args.easing&&plan.args.easing!=="preset"?plan.args.easing:p.easing;
    if(p.mode==="transition"&&(kind==="spring"||(m.controls&&m.controls.elasticity)))extras.push({key:"elasticity",pt:"Elasticidade (%)",en:"Elasticity (%)",fallback:30});
    if(p.mode==="transition"&&(isSettle(kind)||(m.controls&&m.controls.settleAmount))){
      var settleKind=isSettle(kind)?kind:"settle-wave";
      extras.push({key:"settleAmount",pt:"Ricochete (%)",en:"Settle (%)",fallback:settleDefault(p,{},"settleAmount",settleKind)});
      extras.push({key:"settleCount",pt:"Oscilações",en:"Oscillations",fallback:settleDefault(p,{},"settleCount",settleKind)});
      extras.push({key:"settleDamping",pt:"Amortecimento (%)",en:"Damping (%)",fallback:settleDefault(p,{},"settleDamping",settleKind)});
    }
    if(studioTimed(p)){
      if(isText(p)&&p.mode==="transition")extras.push({key:"overlap",pt:"Sobreposição (%)",en:"Overlap (%)",fallback:65});
      if(p.mode==="continuous")extras.push({key:"speed",pt:"Velocidade (%)",en:"Speed (%)",fallback:100});
      if(p.collection==="text"||p.collection==="premium"||(p.collection==="signature"&&signatureSeeded(p)))extras.push({key:"seed",pt:"Variação",en:"Variation",fallback:17});
    }
    if(extras.length){
      if(!m.controls)m.controls={};
      for(i=0;i<extras.length;i++){
        var extra=extras[i];if(!extra)continue;var name=m.controls[extra.key]?m.controls[extra.key].split(" · ").slice(1).join(" · "):(plan.locale.indexOf("pt")===0?extra.pt:extra.en);
        var control=effect(plan,name,"ADBE Slider Control"),value=typeof plan.args[extra.key]==="number"?plan.args[extra.key]:(p.defaults&&typeof p.defaults[extra.key]==="number"?p.defaults[extra.key]:extra.fallback);
        set(plan,control.property(1),value);m.controls[extra.key]=control.name;
      }
    }
    liveGeometry(plan);
    // Phases decide motion blur for the whole layer once every slot is rendered.
    if(!plan.deferMetadata){plan.switches={layer:l.motionBlur,comp:plan.comp.motionBlur};m.blur=syncMotionBlur(l,m.blur,plan.args.motionBlur===true,plan.comp);if(!m.blur)delete m.blur;}
    if(!plan.deferMarkers)applyMarkers(plan);
    if(isText(p)&&!plan.deferMetadata)configureTextLayer(plan);
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
      for(i=plans.length-1;i>=0;i--){var q=plans[i];try{if(q.markersTouched)restoreMarkers(q.layer,q.meta,q.markerSnapshots);restore(q.layer,q.snapshots);for(var j=q.created.length-1;j>=0;j--){var item=q.created[j],g=locate(q.layer,item.group),e=child(g,item.name);if(e)e.remove();}if(q.switches){q.layer.motionBlur=q.switches.layer;q.comp.motionBlur=q.switches.comp;}if(q.textBefore){var gq=textGrouping(q.layer);if(gq&&q.textBefore.grouping!==null)gq.setValue(q.textBefore.grouping);if(typeof q.textBefore.perChar3D==="boolean")q.layer.threeDPerChar=q.textBefore.perChar3D;if(q.textBefore.state)q.meta.textState=q.textBefore.state;else delete q.meta.textState;}q.layer.threeDLayer=q.was3D;q.layer.comment=q.oldComment;}catch(rollbackError){rollbackFailed=true;}}
      if(rollbackFailed){var failure=/** @type {any} */ (new Error("Falha ao restaurar o preset."));failure.motionCode=MotionContracts.ERROR.ROLLBACK_FAILED;failure.cause=error;throw failure;}throw error;
    }
    var warnings=[];if(p.mode==="transition")for(i=0;i<plans.length;i++)if(!markerProperty(plans[i].layer)){warnings.push({code:"CAPABILITY_UNAVAILABLE",message:"Marcadores indisponíveis nesta camada; use o controle Duração do efeito.",details:null});break;}
    return {changed:true,data:{appliedCount:plans.length,presetId:p.id},warnings:warnings};
  }
  /** @param {any} layer @param {any} m @param {boolean=} preserveMetadata */
  function removeLayer(layer,m,preserveMetadata){
    removeMarkers(layer,m);
    // Ordinary removal verifies ownership first; only a rollback after a failed
    // render reaches properties whose owned effect was already removed.
    for(var i=0;i<m.expressions.length;i++){var r=m.expressions[i],p=locate(layer,r.path);if(!p)continue;p.expression=r.original;p.expressionEnabled=r.enabled;}
    var groups=/** @type {any} */ ([[MN_EFFECTS,m.effects],[MN_TEXT,m.animators],["ADBE Mask Parade",m.masks]]);
    for(i=0;i<groups.length;i++){var group=layer.property(groups[i][0]);if(i===1&&group)group=group.property(MN_ANIMATORS);var records=groups[i][1];for(var j=records.length-1;j>=0;j--){var e=child(group,records[j].name);if(e)e.remove();}}
    if(!preserveMetadata){if(m.blur)syncMotionBlur(layer,m.blur,false);restoreTextLayer(layer,m);if(!m.was3D&&definition({presetId:m.presetId}).category==="motion-3d")layer.threeDLayer=false;saveMetadata(layer,null);}
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
    // Distance and transition center are free geometry in AE, not panel options:
    // users may even animate them, so they never block inspection.
    if(m.controls)for(key in m.controls)if(Object.prototype.hasOwnProperty.call(m.controls,key)&&key!=="travel"&&key!=="center")controls.push({key:key,name:m.controls[key]});
    // Rebuilding a phase recreates these controls: keys or expressions would be lost.
    var geometry=/** @type {any} */ (["travel","center"]);
    for(i=0;m.controls&&i<geometry.length;i++){var owned=m.controls[geometry[i]],live=owned&&child(l.property(MN_EFFECTS),owned),value=live&&live.property(1);if(value&&(value.numKeys||value.expression))return {state:"conflict",layerName:l.name,message:"Distância ou Centro da transição têm keyframes ou expressão. Edite esse controle no After Effects para preservar a animação."};}
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
      if(!(args.optionKeys instanceof Array)||args.optionKeys.length<1||args.optionKeys.length>17)return fail(MotionContracts.ERROR.INVALID_PRESET,"Escolha os parâmetros que serão alterados.");
      var known={phase:true,direction:true,durationFrames:true,intensity:true,staggerFrames:true,unit:true,easing:true,elasticity:true,overlap:true,speed:true,order:true,seed:true,settleAmount:true,settleCount:true,settleDamping:true,motionBlur:true,exitOrder:true},seen=/** @type {Record<string,boolean>} */ ({});
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
  MotionRegistry.register("ae.presets.inspect",{preflight:function(args){for(var key in args)if(Object.prototype.hasOwnProperty.call(args,key))return fail(MotionContracts.ERROR.INVALID_PRESET,"A leitura não recebe parâmetros.");return null;},run:function(args,context){var data=inspect(),library=/** @type {any} */ (global).MotionPresetLibrary;if(library.decorateColors)library.decorateColors(data);var contextReader=MotionRegistry.get("ae.context.read");if(contextReader)data.context=contextReader.run({},context).data;var toolReader=/** @type {any} */ (global).MotionToolControls;if(toolReader)data.tools=toolReader.inspect();return {changed:false,data:data,warnings:[]};}});
  MotionRegistry.register("ae.presets.adjust",{preflight:adjustPreflight,run:adjustRun});
  // The dispatcher calls run(args, context, options); apply's third parameter is
  // the per-layer Adjust map, so the request options must never reach it.
  // A loop or look applied to a layer that already has In/Out joins its effect slot.
  /** @param {any} args @returns {any} */
  function stacking(args){var phases=/** @type {any} */ (global).MotionPresetPhases;return phases&&phases.routesApply(args)?phases:null;}
  MotionRegistry.register("ae.presets.apply",{preflight:function(args){var phases=stacking(args);return phases?phases.applyPreflight(args):preflight(args,"apply");},run:function(args,context){var phases=stacking(args);return phases?phases.applyRun(args,context):apply(args,context);}});
  /** Validate the captured editor selection again immediately before removing.
   * @param {any} args @returns {MotionCommandFailure|null} */
  function removeTargetPreflight(args){
    var current=inspect(),keys=/** @type {Record<string,boolean>} */ ({compId:true,layerId:true,instance:true,fingerprint:true});
    /** @param {any} expected @param {any} actual @returns {boolean} */
    function matches(expected,actual){
      if(!expected||!actual||typeof expected!=="object")return false;
      for(var key in expected)if(Object.prototype.hasOwnProperty.call(expected,key)&&!keys[key])return false;
      return expected.compId===actual.compId&&expected.layerId===actual.layerId&&expected.instance===actual.instance&&expected.fingerprint===actual.fingerprint;
    }
    if(current.state!=="ready"||!matches(args.target,current.target))return fail(MotionContracts.ERROR.INVALID_PRESET,"A seleção ou o preset mudou. Nada foi removido.");
    var expected=args.targets,actual=current.targets;
    if(expected||actual){if(!(expected instanceof Array)||!(actual instanceof Array)||expected.length!==actual.length)return fail(MotionContracts.ERROR.INVALID_PRESET,"A seleção de camadas mudou. Nada foi removido.");for(var i=0;i<actual.length;i++)if(!matches(expected[i],actual[i]))return fail(MotionContracts.ERROR.INVALID_PRESET,"A seleção de camadas mudou. Nada foi removido.");}
    return null;
  }
  MotionRegistry.register("ae.presets.remove",{preflight:function(args){return preflight(args,"remove");},run:function(args){var error=preflight(args,"remove");if(error){var invalid=/** @type {any} */ (new Error(error.message));invalid.motionCode=error.code;throw invalid;}return cameraTransition && cameraTransition.hasSelected(app.project.activeItem)?cameraTransition.remove():remove();}});
  MotionRegistry.register("ae.presets.bake",{preflight:function(args){return preflight(args,"bake");},run:function(){return cameraTransition && cameraTransition.hasSelected(app.project.activeItem)?cameraTransition.bake():bake();}});
  global.MotionPresetLibrary={validate:validate,metadata:metadata,requiredEffects:requiredEffects,header:header,markerState:markerState,verifyOwnership:verifyOwnership,definition:definition,preflight:preflight,applyLayer:applyLayer,removeLayer:removeLayer,inspectLayer:inspectLayer,locate:locate,child:child,snapshot:snapshot,restore:restore,saveMetadata:saveMetadata,snapshotMarkers:snapshotMarkers,restoreMarkers:restoreMarkers,removeMarkers:removeMarkers,liveValues:liveValues,syncMotionBlur:syncMotionBlur,textGrouping:textGrouping,textDemandFor:textDemandFor,textDemandAllowed:textDemandAllowed};
}($.global));
