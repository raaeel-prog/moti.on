/** Short, movable camera transitions. User footage never enters the precomp.
 * The outer adjustment layer processes the composite (including 3D layers).
 * CUT is a native layer marker and remains the editable peak after moving it. */
(function (global) {
  /* global MarkerValue, KeyframeInterpolationType */
  var TAG = "[Moti.on.camera-transition.v1]";
  var SOURCE_TAG = "[Moti.on.camera-transition.source.v1]";
  var SOLID_TAG = "[Moti.on.camera-transition.solid.v1]";
  var FX = "ADBE Effect Parade";
  var NATIVE_TRANSITION = "Moti.on Native Transition";
  var catalog = /** @type {any} */ (global).MotionLibraryCatalog;
  /** @param {string} code @param {string} message @returns {MotionCommandFailure} */
  function fail(code, message) { return {code:code,message:message,recoverable:true,details:null}; }
  /** @param {string} id @returns {any} */
  function definition(id) { for(var i=0;i<catalog.length;i++)if(catalog[i].id===id&&catalog[i].effect.indexOf("camera-")===0)return catalog[i];return null; }
  /** @param {any} layer @returns {boolean} */
  function owns(layer) { return String(layer.comment||"").indexOf(TAG)>=0; }
  /** @param {any} layer @returns {any} */
  function metadata(layer) {
    var comment=String(layer.comment||""),at=comment.indexOf(TAG);if(at<0)return null;
    var m=/** @type {any} */ (MotionJson.parse(decodeURIComponent(comment.substring(at+TAG.length).split("\n")[0]||"")));
    if(!m||m.version!==1||typeof m.instance!=="string"||!/^[0-9-]+$/.test(m.instance)||!definition(m.presetId)||!m.controls||!(m.effects instanceof Array)||!(m.expressions instanceof Array))throw new Error("Metadados da transição incompletos.");return m;
  }
  /** @param {any} layer @param {any} m */
  function save(layer,m) { var text=String(layer.comment||""),at=text.indexOf(TAG);if(at>=0){var end=text.indexOf("\n",at);text=text.substring(0,at)+(end<0?"":text.substring(end));}layer.comment=text+(text?"\n":"")+TAG+encodeURIComponent(MotionJson.stringify(m)); }
  /** @param {any} group @param {string} name @returns {any} */
  function child(group,name) { for(var i=1;group&&i<=group.numProperties;i++){var p=group.property(i);if(p.name===name||p.matchName===name)return p;}return null; }
  /** @param {any} layer @param {any} record @returns {any} */
  function expressionProperty(layer,record) { var effect=child(layer.property(FX),record.effect);return effect&&child(effect,record.property); }
  /** @param {any} layer @param {any} m @param {string} key @returns {any} */
  function control(layer,m,key) { var effect=child(layer.property(FX),m.controls[key]);return effect&&effect.property(1); }
  /** @param {any} m @returns {string} */
  function prefix(m) { return "// Moti.on camera transition v1:"+m.instance+"\n"; }
  /** @param {any} layer @returns {number|null} */
  function peak(layer) { var markers=layer.property("ADBE Marker");for(var i=1;markers&&i<=markers.numKeys;i++)if(markers.keyValue(i).comment==="CUT")return markers.keyTime(i);return null; }
  /** @param {number} center @param {number} frames @param {number} frameDuration @param {number} compDuration @returns {any} */
  function timing(center,frames,frameDuration,compDuration) {
    var count=Math.min(frames,Math.floor(compDuration/frameDuration+0.00001)),duration=count*frameDuration;
    var cut=Math.max(0,Math.min(compDuration,center));
    var start=Math.max(0,Math.min(compDuration-duration,cut-Math.floor(count/2)*frameDuration));
    return {start:start,end:start+duration,cut:cut,frames:count,duration:duration};
  }
  /** @param {any} p @returns {string[]} */
  function requiredEffects(p) {
    if(p.cameraSpec&&p.cameraSpec.native)return ["ADBE Slider Control",NATIVE_TRANSITION];
    if(p.cameraSpec&&p.cameraSpec.impact)return impactEffects(p);
    var effects=["ADBE Slider Control","ADBE Geometry2"],blur=blurEffect(p);
    if(blur)effects.push(blur);
    if(p.effect==="camera-dark"||p.effect==="camera-light")effects.push("ADBE Tint");
    if(p.effect==="camera-distort"||p.effect==="camera-shake")effects.push("ADBE Turbulent Displace");
    if(p.cameraSpec&&p.cameraSpec.exposure)effects.push("ADBE Exposure2");
    return effects;
  }
  /** @param {any} p @returns {string|null} */
  function blurEffect(p) {
    if(p.cameraSpec&&p.cameraSpec.blur==="none")return null;
    if(p.cameraSpec&&p.cameraSpec.blur==="lens"){
      var installed=/** @type {any} */ (app).effects;
      for(var i=0;installed&&i<installed.length;i++)if(installed[i].matchName==="ADBE Camera Lens Blur")return "ADBE Camera Lens Blur";
    }
    return "ADBE Gaussian Blur 2";
  }
  /** @param {any} args @returns {MotionCommandFailure|null} */
  function validate(args) {
    var allowed={presetId:true,durationFrames:true,intensity:true};for(var key in args)if(Object.prototype.hasOwnProperty.call(args,key)&&!Object.prototype.hasOwnProperty.call(allowed,key))return fail(MotionContracts.ERROR.INVALID_PRESET,"Parâmetro de transição desconhecido.");
    if(!definition(args.presetId)||typeof args.durationFrames!=="number"||!isFinite(args.durationFrames)||Math.floor(args.durationFrames)!==args.durationFrames||args.durationFrames<2||args.durationFrames>600||typeof args.intensity!=="number"||!isFinite(args.intensity)||args.intensity<0||args.intensity>300)return fail(MotionContracts.ERROR.INVALID_PRESET,"Preset, duração ou intensidade de transição inválidos.");return null;
  }
  /** @param {any} comp @param {any} args @returns {any} */
  function target(comp,args) {
    var selected=comp.selectedLayers,i;
    for(i=0;i<selected.length;i++)if(owns(selected[i]))return selected[i];
    var wanted=timing(comp.time,args.durationFrames,comp.frameDuration,comp.duration).cut;
    for(i=1;i<=comp.numLayers;i++){var l=comp.layer(i);if(!owns(l))continue;var m=metadata(l),at=peak(l);if(m.presetId===args.presetId&&at!==null&&Math.abs(at-wanted)<comp.frameDuration*.05)return l;}return null;
  }
  /** @param {any} layer @param {any} m @returns {MotionCommandFailure|null} */
  function ownership(layer,m) {
    if(layer.locked)return fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE,"Desbloqueie a pré-comp de transição para continuar.");
    if(!layer.source||!(layer.source instanceof CompItem)||String(layer.source.comment||"")!==SOURCE_TAG+m.instance||!layer.adjustmentLayer||layer.threeDLayer||layer.collapseTransformation||layer.timeRemapEnabled)return fail(MotionContracts.ERROR.INVALID_PRESET,"A estrutura da pré-comp de transição foi alterada.");
    if(peak(layer)===null)return fail(MotionContracts.ERROR.INVALID_PRESET,"Restaure o marcador CUT para ajustar a transição.");
    for(var i=0;i<m.effects.length;i++){var e=child(layer.property(FX),m.effects[i].name);if(!e||e.matchName!==m.effects[i].matchName)return fail(MotionContracts.ERROR.INVALID_PRESET,"Um efeito da transição foi removido ou renomeado.");if(e.matchName===NATIVE_TRANSITION&&!nativeCompatible(e))return fail(MotionContracts.ERROR.CAPABILITY_UNAVAILABLE,"Moti.on Native Transition incompatível. Atualize o plugin nativo e reinicie o After Effects.");}
    for(i=0;i<m.expressions.length;i++){var prop=expressionProperty(layer,m.expressions[i]);if(!prop||prop.expression.indexOf(prefix(m))!==0)return fail(MotionContracts.ERROR.EXPRESSION_CONFLICT,"Uma expressão da transição foi alterada. Desfaça essa alteração antes de continuar.");}return null;
  }
  /** @param {any} layer @param {any} m @returns {MotionCommandFailure|null} */
  function editable(layer,m) { if(m.baked)return fail(MotionContracts.ERROR.EXPRESSION_CONFLICT,"A transição foi convertida em keyframes. Edite os keyframes no After Effects.");for(var key in m.controls)if(Object.prototype.hasOwnProperty.call(m.controls,key)){var p=control(layer,m,key);if(!p||p.numKeys||p.expression)return fail(MotionContracts.ERROR.EXPRESSION_CONFLICT,"Um controle tem keyframes ou expressão. Edite a transição no After Effects para preservar a animação.");}return null; }
  /** @param {any} source @returns {number} */
  function sourceUses(source) { var count=0,comps=source.usedIn||[];for(var i=0;i<comps.length;i++)for(var j=1;j<=comps[i].numLayers;j++)if(comps[i].layer(j).source===source)count++;return count; }
  /** @param {any} args @returns {MotionCommandFailure|null} */
  function preflight(args) {
    var error=validate(args);if(error)return error;
    var comp=app.project&&app.project.activeItem;if(!comp||!(comp instanceof CompItem))return fail(MotionContracts.ERROR.NO_ACTIVE_COMP,"Abra uma composição.");
    if(hasSelected(comp)&&comp.selectedLayers.length!==1)return fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE,"Selecione uma única pré-comp de transição para ajustar.");
    if(comp.duration<comp.frameDuration*2-.000001)return fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE,"A composição precisa ter pelo menos dois frames.");
    var required=requiredEffects(definition(args.presetId)),installed=/** @type {any} */ (app).effects;
    for(var i=0;i<required.length;i++){var found=false;for(var j=0;installed&&j<installed.length;j++)if(installed[j].matchName===required[i])found=true;if(!found)return fail(MotionContracts.ERROR.CAPABILITY_UNAVAILABLE,"Efeito nativo indisponível: "+required[i]);}
    try{var l=target(comp,args);if(l){var m=metadata(l);if(m.presetId!==args.presetId)return fail(MotionContracts.ERROR.EXPRESSION_CONFLICT,"A pré-comp selecionada usa outra transição. Desmarque-a para criar uma nova.");error=ownership(l,m)||editable(l,m);if(error)return error;
      if(l.source.numLayers!==1||String(l.source.layer(1).comment||"")!==SOLID_TAG+m.instance)return fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE,"O conteúdo da pré-comp foi alterado. Ajuste a transição pelos Controles do efeito.");
      if(sourceUses(l.source)>1&&Math.abs(l.source.duration-Math.min(args.durationFrames*comp.frameDuration,comp.duration))>comp.frameDuration*.05)return fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE,"Esta pré-comp é compartilhada. Duplique a origem antes de alterar sua duração.");}}catch(e){return fail(MotionContracts.ERROR.INVALID_PRESET,"Os metadados da transição estão incompletos.");}return null;
  }
  /** @param {any} layer @param {any} m @param {string} name @param {string} matchName @returns {any} */
  function addEffect(layer,m,name,matchName) { var effect=layer.property(FX).addProperty(matchName);if(!effect||effect.matchName!==matchName)throw new Error("Efeito nativo indisponível: "+matchName);effect.name="Moti.on "+m.instance+" · "+name;m.effects.push({name:effect.name,matchName:matchName});return effect; }
  /** @param {any} layer @param {any} m @param {string} key @param {string} label @param {number} value */
  function addControl(layer,m,key,label,value) { var e=addEffect(layer,m,label,"ADBE Slider Control");e.property(1).setValue(value);m.controls[key]=e.name; }
  /** @param {any} m @param {string} key @returns {string} */
  function readControl(m,key) { return "effect("+MotionJson.stringify(m.controls[key])+")(1)"; }
  /** Expression source is generated only from shipped recipes and native control names.
   * @param {any} m @returns {string} */
  function envelope(m) {
    return prefix(m)+"var mid=marker.key('CUT').time;var fd=thisComp.frameDuration;var span=Math.max(2,Math.min(600,"+readControl(m,"durationFrames")+"))*fd/2;mid=Math.max(inPoint,Math.min(outPoint,mid));var a=Math.max(inPoint,mid-span),b=Math.min(outPoint,mid+span);var u=Math.abs(time-mid)<fd*.00001?1:time<mid?(time-a)/Math.max(fd*.01,mid-a):(b-time)/Math.max(fd*.01,b-mid);u=Math.max(0,Math.min(1,u));var w=u*u*u*(u*(u*6-15)+10);var amp=Math.max(0,Math.min(300,"+readControl(m,"intensity")+"))/100;var age=time-mid;\n";
  }
  /** @param {any} effect @param {string} name @returns {any} */
  function nativeProperty(effect,name) { var p=child(effect,name);if(!p||p.matchName!==name)throw new Error("Parâmetro nativo indisponível: "+name);return p; }
  /** @param {any} effect @returns {boolean} */
  function nativeCompatible(effect) { for(var i=2001;i<=2005;i++)if(!child(effect,NATIVE_TRANSITION+"-"+i))return false;return true; }
  /** @param {any} layer @param {any} m @param {any} effect @param {string} property @param {string} body */
  function express(layer,m,effect,property,body) { var p=nativeProperty(effect,property);if(!p.canSetExpression)throw new Error("Expressão não suportada: "+property);p.expression=envelope(m)+body;p.expressionEnabled=true;m.expressions.push({effect:effect.name,property:property}); }
  /** @param {any} layer @param {any} m */
  function checkExpressions(layer,m) { for(var i=0;i<m.expressions.length;i++){var prop=expressionProperty(layer,m.expressions[i]);prop.valueAtTime(peak(layer),false);if(prop.expressionError)throw new Error("Expressão de câmera recusada: "+prop.expressionError);} }
  /** @param {any} layer @param {any} m @param {any} p @param {any} comp @param {any} args */
  function configure(layer,m,p,comp,args) {
    if(p.cameraSpec&&p.cameraSpec.native){configureNative(layer,m,p,args);return;}
    if(p.cameraSpec&&p.cameraSpec.impact){configureImpact(layer,m,p,comp,args);return;}
    addControl(layer,m,"durationFrames","Duração (frames)",args.durationFrames);addControl(layer,m,"intensity","Intensidade (%)",args.intensity);addControl(layer,m,"blur","Desfoque (px)",p.effectAmount*comp.height/1080);addControl(layer,m,"zoom","Zoom (%)",p.scale[0]);addControl(layer,m,"rotation","Giro (graus)",p.rotation[2]);
    if(p.effect==="camera-distort"||p.effect==="camera-shake")addControl(layer,m,"distortion","Distorção (px)",(p.cameraSpec?35:p.effectAmount)*comp.height/1080);
    if(p.effect==="camera-shake")addControl(layer,m,"shake","Tremor (px)",p.position[0]*comp.height/1080);
    var e=addEffect(layer,m,"Transformação de câmera","ADBE Geometry2");
    nativeProperty(e,"ADBE Geometry2-0011").setValue(1);
    nativeProperty(e,"ADBE Geometry2-0001").setValue([comp.width/2,comp.height/2]);nativeProperty(e,"ADBE Geometry2-0002").setValue([comp.width/2,comp.height/2]);
    express(layer,m,e,"ADBE Geometry2-0003","100+Math.max(0,"+readControl(m,"zoom")+")*amp*w;");
    express(layer,m,e,"ADBE Geometry2-0007",readControl(m,"rotation")+"*amp*w"+(p.effect==="camera-shake"?"*Math.cos(age*43)":"")+";");
    if(p.effect==="camera-shake")express(layer,m,e,"ADBE Geometry2-0002","var s="+readControl(m,"shake")+"*amp*w;value+[Math.cos(age*71)*s,Math.sin(age*53)*s*.65];");
    var blur=blurEffect(p);m.blurEffect=blur;
    if(blur){e=addEffect(layer,m,"Desfoque de câmera",blur);
      nativeProperty(e,blur==="ADBE Camera Lens Blur"?"ADBE Camera Lens Blur-0021":"ADBE Gaussian Blur 2-0003").setValue(1);
      express(layer,m,e,blur+"-0001","Math.max(0,"+readControl(m,"blur")+")*amp*w;");}
    if(p.cameraSpec&&p.cameraSpec.exposure){
      addControl(layer,m,"exposure","Exposição (EV)",p.cameraSpec.exposure);
      e=addEffect(layer,m,"Exposição","ADBE Exposure2");express(layer,m,e,"ADBE Exposure2-0003",readControl(m,"exposure")+"*amp*w;");
    }
    if(p.effect==="camera-distort"||p.effect==="camera-shake"){e=addEffect(layer,m,"Distorção de câmera","ADBE Turbulent Displace");nativeProperty(e,"ADBE Turbulent Displace-0003").setValue(Math.max(2,90*comp.height/1080));express(layer,m,e,"ADBE Turbulent Displace-0002","Math.max(0,"+readControl(m,"distortion")+")*amp*w;");express(layer,m,e,"ADBE Turbulent Displace-0006","age*180;");}
    if(p.effect==="camera-dark"||p.effect==="camera-light"){e=addEffect(layer,m,"Passagem de luz","ADBE Tint");var color=p.effect==="camera-dark"?[0,0,0,1]:[1,1,1,1];nativeProperty(e,"ADBE Tint-0001").setValue(color);nativeProperty(e,"ADBE Tint-0002").setValue(color);express(layer,m,e,"ADBE Tint-0003","Math.min(100,100*amp*w);");}
    checkExpressions(layer,m);
  }
  /** Impact shakes add only the effects their recipe uses.
   * @param {any} p @returns {string[]} */
  function impactEffects(p) {
    var s=p.cameraSpec.impact,effects=["ADBE Slider Control","ADBE Geometry2"];
    if(s.wave)effects.push("ADBE Wave Warp");
    if(p.cameraSpec.blur!=="none")effects.push("ADBE Gaussian Blur 2");
    if(p.cameraSpec.exposure)effects.push("ADBE Exposure2");
    if(s.glow)effects.push("ADBE Glo2");
    return effects;
  }
  /** One shared sample per property: the same cameraImpactSample the gallery draws.
   * Hit shape and attack are recipe structure; every amount stays a Slider control.
   * @param {any} m @param {any} p @returns {string} */
  function impactSample(m,p) {
    var s=p.cameraSpec.impact,core=/** @type {any} */ (global).MotionLibraryCore;
    /** @param {string} key @returns {string} */
    function read(key) { return m.controls[key]?readControl(m,key):"0"; }
    return "var impact="+core.cameraImpactSample.toString()+";\nvar r=impact(age,w,span,fd,amp,"+read("seed")+",thisComp.width,thisComp.height,{hit:"+MotionJson.stringify(s.hit)+",attack:"+Number(s.attack)+",angle:"+read("angle")+",travel:"+read("travel")+",roll:"+read("roll")+",frequency:"+read("frequency")+",damping:"+read("damping")+",texture:"+read("texture")+",punch:"+read("punch")+",zoom:"+read("zoom")+",blur:"+read("blur")+",exposure:"+read("exposure")+",glow:"+read("glow")+",wave:"+read("wave")+"});\n";
  }
  /** Wave Warp (edges pinned) and Gaussian Blur run before Transform, whose overscan
   * then pushes the blur's translucent edge out of frame; light acts on the result.
   * @param {any} layer @param {any} m @param {any} p @param {any} comp @param {any} args */
  function configureImpact(layer,m,p,comp,args) {
    var s=p.cameraSpec.impact,k=comp.height/1080,e;
    addControl(layer,m,"durationFrames","Duração (frames)",args.durationFrames);addControl(layer,m,"intensity","Intensidade (%)",args.intensity);
    addControl(layer,m,"travel","Tremor (px)",s.travel*k);addControl(layer,m,"angle","Direção (graus)",s.angle);addControl(layer,m,"roll","Giro (graus)",s.roll);
    addControl(layer,m,"frequency","Frequência (Hz)",s.frequency);addControl(layer,m,"damping","Amortecimento",s.damping);addControl(layer,m,"texture","Textura (%)",s.texture);
    addControl(layer,m,"seed","Variação",layer.id%1000);addControl(layer,m,"punch","Punch (%)",s.punch);addControl(layer,m,"zoom","Zoom (%)",s.zoom);
    addControl(layer,m,"shutter","Desfoque de movimento (graus)",s.shutter);
    if(p.cameraSpec.blur!=="none")addControl(layer,m,"blur","Desfoque (px)",p.effectAmount*k);
    if(p.cameraSpec.exposure)addControl(layer,m,"exposure","Luz (EV)",p.cameraSpec.exposure);
    if(s.glow)addControl(layer,m,"glow","Brilho",s.glow);
    if(s.wave)addControl(layer,m,"wave","Onda (px)",s.wave*k);
    var sample=impactSample(m,p);
    if(s.wave){e=addEffect(layer,m,"Onda de impacto","ADBE Wave Warp");
      nativeProperty(e,"ADBE Wave Warp-0001").setValue(1);nativeProperty(e,"ADBE Wave Warp-0003").setValue(Math.max(8,260*k));nativeProperty(e,"ADBE Wave Warp-0005").setValue(0);nativeProperty(e,"ADBE Wave Warp-0006").setValue(2);nativeProperty(e,"ADBE Wave Warp-0008").setValue(2);
      express(layer,m,e,"ADBE Wave Warp-0002",sample+"r[7];");express(layer,m,e,"ADBE Wave Warp-0004",readControl(m,"angle")+"+90;");express(layer,m,e,"ADBE Wave Warp-0007",sample+"r[8];");}
    if(p.cameraSpec.blur!=="none"){e=addEffect(layer,m,"Desfoque de impacto","ADBE Gaussian Blur 2");nativeProperty(e,"ADBE Gaussian Blur 2-0003").setValue(1);express(layer,m,e,"ADBE Gaussian Blur 2-0001",sample+"Math.max(0,r[4]);");}
    e=addEffect(layer,m,"Câmera de impacto","ADBE Geometry2");
    nativeProperty(e,"ADBE Geometry2-0011").setValue(1);
    nativeProperty(e,"ADBE Geometry2-0001").setValue([comp.width/2,comp.height/2]);nativeProperty(e,"ADBE Geometry2-0002").setValue([comp.width/2,comp.height/2]);
    nativeProperty(e,"ADBE Geometry2-0009").setValue(0);
    express(layer,m,e,"ADBE Geometry2-0002",sample+"[value[0]+r[0],value[1]+r[1]];");
    express(layer,m,e,"ADBE Geometry2-0003",sample+"r[3];");
    express(layer,m,e,"ADBE Geometry2-0007",sample+"r[2];");
    // The shutter opens with the envelope: both window edges stay bit-identical to the source.
    express(layer,m,e,"ADBE Geometry2-0010","Math.max(0,Math.min(360,"+readControl(m,"shutter")+"))*Math.min(1,w*20);");
    if(p.cameraSpec.exposure){e=addEffect(layer,m,"Luz de impacto","ADBE Exposure2");express(layer,m,e,"ADBE Exposure2-0003",sample+"r[5];");}
    if(s.glow){e=addEffect(layer,m,"Brilho de impacto","ADBE Glo2");nativeProperty(e,"ADBE Glo2-0003").setValue(Math.min(1000,60*k));express(layer,m,e,"ADBE Glo2-0004",sample+"Math.max(0,r[6]);");}
    m.impactEngineVersion=1;
    checkExpressions(layer,m);
  }
  /** Six native trajectories use distinct cut envelopes; the signed flow keeps
   * the outgoing and incoming image movement continuous around the CUT marker.
   * @param {number} style @returns {string} */
  function nativeCurve(style) { return ["w*w","Math.pow(w,1.35)","Math.pow(w,.85)","Math.pow(Math.sin(w*Math.PI/2),2)","w*w*w","Math.pow(w,1.1)"][style-1] || "w"; }
  /** @param {any} layer @param {any} m @param {any} p @param {any} args */
  function configureNative(layer,m,p,args) {
    addControl(layer,m,"durationFrames","Duração (frames)",args.durationFrames);
    addControl(layer,m,"intensity","Intensidade (%)",args.intensity);
    var engine=addEffect(layer,m,"Transição de imagem",NATIVE_TRANSITION);
    if(!nativeCompatible(engine)){var incompatible=/** @type {any} */ (new Error("Moti.on Native Transition incompatível. Atualize o plugin nativo e reinicie o After Effects."));incompatible.motionCode=MotionContracts.ERROR.CAPABILITY_UNAVAILABLE;throw incompatible;}
    nativeProperty(engine,NATIVE_TRANSITION+"-2002").setValue(p.cameraSpec.native.style);
    nativeProperty(engine,NATIVE_TRANSITION+"-2003").setValue(p.cameraSpec.native.angle);
    nativeProperty(engine,NATIVE_TRANSITION+"-2005").setValue(p.cameraSpec.native.style===1||p.cameraSpec.native.style===5?64:p.cameraSpec.native.style===6?16:24);
    express(layer,m,engine,NATIVE_TRANSITION+"-2001","Math.min(100,100*amp*("+nativeCurve(p.cameraSpec.native.style)+"));");
    express(layer,m,engine,NATIVE_TRANSITION+"-2004","var r=Math.max(-1,Math.min(1,age/Math.max(fd,span*.24)));r*(1.5-.5*r*r);");
    m.nativeEngineVersion=1;
    checkExpressions(layer,m);
  }
  /** @param {any} comp @returns {any[]} */
  function selectedProperties(comp) { var out=[],properties=comp.selectedProperties||[];for(var i=0;i<properties.length;i++)out.push({property:properties[i],keys:properties[i].selectedKeys||[]});return out; }
  /** @param {any} comp @param {any[]} selected @param {any[]} properties */
  function restoreSelection(comp,selected,properties) {
    for(var i=1;i<=comp.numLayers;i++){var layer=comp.layer(i),wanted=false;for(var j=0;j<selected.length;j++)if(layer===selected[j])wanted=true;if(layer.selected!==wanted)layer.selected=wanted;}
    for(i=0;i<properties.length;i++){var record=properties[i];record.property.selected=true;for(j=0;j<record.keys.length;j++)record.property.setSelectedAtKey(record.keys[j],true);}
  }
  /** @param {any} layer @param {any} m @param {any} args @param {any} comp */
  function update(layer,m,args,comp) {
    var cut=peak(layer);if(cut===null)throw new Error("Marcador CUT ausente.");var t=timing(cut,args.durationFrames,comp.frameDuration,comp.duration),markers=layer.property("ADBE Marker"),i,markerIndex=0;
    for(i=1;i<=markers.numKeys;i++)if(markers.keyValue(i).comment==="CUT")markerIndex=i;
    var prior={start:layer.startTime,inPoint:layer.inPoint,outPoint:layer.outPoint,duration:layer.source.duration,solidOut:layer.source.layer(1).outPoint,comment:layer.comment,cut:cut,marker:markers.keyValue(markerIndex),durationControl:control(layer,m,"durationFrames").value,intensityControl:control(layer,m,"intensity").value};
    try{markers.removeKey(markerIndex);layer.source.duration=t.duration;layer.source.layer(1).outPoint=t.duration;layer.startTime=t.start;layer.inPoint=t.start;layer.outPoint=t.end;markers.setValueAtTime(t.cut,prior.marker);control(layer,m,"durationFrames").setValue(t.frames);control(layer,m,"intensity").setValue(args.intensity);m.options={durationFrames:t.frames,intensity:args.intensity};save(layer,m);}
    catch(e){layer.source.duration=prior.duration;layer.source.layer(1).outPoint=prior.solidOut;layer.startTime=prior.start;layer.inPoint=prior.inPoint;layer.outPoint=prior.outPoint;for(i=markers.numKeys;i>=1;i--)if(markers.keyValue(i).comment==="CUT")markers.removeKey(i);markers.setValueAtTime(prior.cut,prior.marker);control(layer,m,"durationFrames").setValue(prior.durationControl);control(layer,m,"intensity").setValue(prior.intensityControl);layer.comment=prior.comment;throw e;}
  }
  /** @param {any} args @param {any} context @returns {MotionCommandResult} */
  function apply(args,context) {
    var comp=/** @type {any} */ (app.project.activeItem),selected=comp.selectedLayers,properties=selectedProperties(comp),time=comp.time,layer=target(comp,args),created=!layer,p=definition(args.presetId),source=/** @type {any} */ (null),solid=/** @type {any} */ (null),m,t;
    try{
      if(layer){m=metadata(layer);update(layer,m,args,comp);}
      else{t=timing(time,args.durationFrames,comp.frameDuration,comp.duration);var name=p.name[(context.locale||"pt-BR").indexOf("pt")===0?"pt-BR":"en-US"];
        source=app.project.items.addComp("Moti.on · "+name,comp.width,comp.height,comp.pixelAspect,t.duration,comp.frameRate);solid=source.layers.addSolid([1,1,1],"Moti.on · Área da transição",comp.width,comp.height,comp.pixelAspect,t.duration);layer=comp.layers.add(source);layer.name="Moti.on · "+name;layer.adjustmentLayer=true;layer.collapseTransformation=false;layer.startTime=t.start;layer.inPoint=t.start;layer.outPoint=t.end;layer.label=9;layer.moveToBeginning();
        m={version:1,instance:String(new Date().getTime())+"-"+layer.id,presetId:p.id,controls:{},effects:[],expressions:[],options:{durationFrames:t.frames,intensity:args.intensity}};source.comment=SOURCE_TAG+m.instance;solid.comment=SOLID_TAG+m.instance;solid.source.comment=SOLID_TAG+m.instance;layer.property("ADBE Marker").setValueAtTime(t.cut,new MarkerValue("CUT"));configure(layer,m,p,comp,{durationFrames:t.frames,intensity:args.intensity});save(layer,m);
      }
    }catch(error){if(created){var solidSource=solid&&solid.source;try{if(layer)layer.remove();if(source)source.remove();if(solidSource&&(!solidSource.usedIn||!solidSource.usedIn.length))solidSource.remove();}catch(rollback){var failure=/** @type {any} */ (new Error("Falha ao restaurar a criação da transição."));failure.motionCode=MotionContracts.ERROR.ROLLBACK_FAILED;throw failure;}}throw error;}
    finally{comp.time=time;restoreSelection(comp,selected,properties);}
    return {changed:true,data:{appliedCount:1,presetId:p.id,layerId:layer.id,precompId:layer.source.id,created:created,cameraTransition:true},warnings:p.cameraSpec&&p.cameraSpec.blur==="lens"&&m.blurEffect!=="ADBE Camera Lens Blur"?[{code:"LENS_BLUR_FALLBACK",details:{requested:"ADBE Camera Lens Blur",applied:"ADBE Gaussian Blur 2"},message:(context.locale||"pt").indexOf("pt")===0?"Desfoque de lente indisponível: foi usado desfoque gaussiano. A aparência será diferente.":"Lens blur unavailable: Gaussian blur was used. The appearance will differ."}]:[]};
  }
  /** @param {any} comp @returns {boolean} */
  function hasSelected(comp) { var layers=comp&&comp.selectedLayers||[];for(var i=0;i<layers.length;i++)if(owns(layers[i]))return true;return false; }
  /** @param {any} layer @returns {any} */
  function inspect(layer) {
    var m,error;try{m=metadata(layer);error=ownership(layer,m)||editable(layer,m);}catch(e){return {state:"conflict",message:"Os metadados da transição estão incompletos."};}if(error)return {state:"conflict",layerName:layer.name,message:error.message};
    var opts={phase:"both",direction:"bottom",durationFrames:control(layer,m,"durationFrames").value,intensity:control(layer,m,"intensity").value,staggerFrames:0,unit:"all",elasticity:0,overlap:0,speed:100},comp=layer.containingComp;
    return {state:"ready",message:"",cameraTransition:true,layerName:layer.name,presetId:m.presetId,options:opts,target:{compId:comp.id,layerId:layer.id,instance:m.instance,fingerprint:MotionJson.stringify({instance:m.instance,options:opts,inPoint:layer.inPoint,outPoint:layer.outPoint,cut:peak(layer)})}};
  }
  /** @param {any} args @returns {any} */
  function adjustArgs(args) { return {presetId:args.presetId,durationFrames:args.options.durationFrames,intensity:args.options.intensity}; }
  /** @param {any} args @returns {MotionCommandFailure|null} */
  function adjustPreflight(args) { var comp=/** @type {any} */ (app.project&&app.project.activeItem);if(!comp||!(comp instanceof CompItem)||comp.selectedLayers.length!==1)return fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE,"Selecione uma única pré-comp de transição.");var state=inspect(comp.selectedLayers[0]);if(state.state!=="ready")return fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE,state.message);var t=args.target;if(!t||args.presetId!==state.presetId||t.compId!==state.target.compId||t.layerId!==state.target.layerId||t.instance!==state.target.instance||t.fingerprint!==state.target.fingerprint)return fail(MotionContracts.ERROR.INVALID_PRESET,"A seleção, os controles ou o marcador mudaram. Recarregue antes de ajustar.");for(var key in args.options)if(Object.prototype.hasOwnProperty.call(args.options,key)&&key!=="durationFrames"&&key!=="intensity"&&args.options[key]!==state.options[key])return fail(MotionContracts.ERROR.INVALID_PRESET,"A transição usa duração e intensidade. Outros controles ficam no After Effects.");return preflight(adjustArgs(args)); }
  /** @param {string} action @returns {MotionCommandFailure|null} */
  function selectionPreflight(action) { var comp=/** @type {any} */ (app.project.activeItem),layers=comp.selectedLayers;for(var i=0;i<layers.length;i++){if(!owns(layers[i]))return fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE,"Selecione somente pré-comps de transição para esta ação.");try{var m=metadata(layers[i]),error=ownership(layers[i],m);if(error)return error;if(action==="bake"){if((layers[i].outPoint-layers[i].inPoint)/comp.frameDuration>1800)return fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE,"Converta transições de até 1.800 frames.");for(var j=0;j<m.expressions.length;j++)if(expressionProperty(layers[i],m.expressions[j]).numKeys)return fail(MotionContracts.ERROR.EXPRESSION_CONFLICT,"A conversão preserva keyframes existentes. Remova o conflito antes de converter.");}}catch(e){return fail(MotionContracts.ERROR.INVALID_PRESET,"Os metadados da transição estão incompletos.");}}return null; }
  /** Remove the timeline instance; preserve the source like native layer deletion.
   * @returns {MotionCommandResult} */
  function remove() { var layers=/** @type {any} */ (app.project.activeItem).selectedLayers;for(var i=0;i<layers.length;i++)layers[i].remove();return {changed:layers.length>0,data:{appliedCount:layers.length},warnings:[]}; }
  /** @returns {MotionCommandResult} */
  function bake() {
    var comp=/** @type {any} */ (app.project.activeItem),layers=comp.selectedLayers,samples=/** @type {any[]} */ ([]),i,j,k;
    for(i=0;i<layers.length;i++){var m=metadata(layers[i]);for(j=0;j<m.expressions.length;j++){var p=expressionProperty(layers[i],m.expressions[j]),times=[],values=[];for(k=0;k<=Math.ceil((layers[i].outPoint-layers[i].inPoint)/comp.frameDuration);k++){var t=Math.min(layers[i].outPoint,layers[i].inPoint+k*comp.frameDuration);times.push(t);values.push(p.valueAtTime(t,false));}samples.push({p:p,times:times,values:values,base:p.valueAtTime(0,true),expression:p.expression,enabled:p.expressionEnabled});}}
    try{for(i=0;i<samples.length;i++){var s=samples[i];s.p.expression="";s.p.setValuesAtTimes(s.times,s.values);for(j=1;j<=s.p.numKeys;j++)s.p.setInterpolationTypeAtKey(j,KeyframeInterpolationType.LINEAR,KeyframeInterpolationType.LINEAR);}}
    catch(e){for(i=0;i<samples.length;i++){var r=samples[i];while(r.p.numKeys)r.p.removeKey(r.p.numKeys);r.p.expression="";r.p.setValue(r.base);r.p.expression=r.expression;r.p.expressionEnabled=r.enabled;}throw e;}
    for(i=0;i<layers.length;i++){var meta=metadata(layers[i]);meta.expressions=[];meta.baked=true;save(layers[i],meta);}return {changed:samples.length>0,data:{appliedCount:layers.length},warnings:[]};
  }
  MotionRegistry.register("ae.presets.camera-transition",{preflight:preflight,run:apply});
  /** @type {any} */ (global).MotionCameraTransition={validate:validate,preflight:preflight,apply:apply,owns:owns,metadata:metadata,timing:timing,envelope:envelope,hasSelected:hasSelected,inspect:inspect,adjustArgs:adjustArgs,adjustPreflight:adjustPreflight,selectionPreflight:selectionPreflight,remove:remove,bake:bake};
}($.global));
