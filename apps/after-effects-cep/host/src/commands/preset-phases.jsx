/** Independent entrance, exit and stacked effect instances (phases v3). All
 * recipe code comes from the bundled library; stored expressions are compared
 * for ownership, never executed. Version 2 roots (entrance/exit only) stay
 * readable and are rewritten as version 3 on their next edit. */
(function(global){
  /* global MarkerValue */
  var lib=/** @type {any} */ (global).MotionPresetLibrary,TAG="[Moti.on.library.v3]",LEGACY_TAG="[Moti.on.library.v2]",TR="ADBE Transform Group",ROLES=/** @type {any} */ (["in","out","effect"]),SLOT=/** @type {any} */ ({"in":1,"out":2,"effect":3}),serial=0;
  /** Nome legível de cada fase no Effect Controls, o mesmo dos marcadores. */
  var PHASE_LABEL=/** @type {any} */ ({"in":"Moti.on In","out":"Moti.on Out","effect":"Moti.on FX"});
  /** @param {string} message @param {string=} code @returns {MotionCommandFailure} */
  function fail(message,code){return {code:code||MotionContracts.ERROR.INVALID_PRESET,message:message,recoverable:true,details:null};}
  /** @param {any} value @returns {any} */
  function clone(value){return MotionJson.parse(MotionJson.stringify(value));}
  /** @param {any} layer @returns {boolean} */
  function has(layer){var text=String(layer.comment||"");return text.indexOf(TAG)>=0||text.indexOf(LEGACY_TAG)>=0;}
  /** @param {any} root @returns {string} */
  function prefix(root){return "// Moti.on phases v"+root.version+":"+root.instance+"\n";}
  /** Entrance and exit play transitions; the effect slot plays a loop or a look.
   * @param {string} role @param {any} p @returns {boolean} */
  function fits(role,p){return role==="effect"?p.mode!=="transition":p.mode==="transition";}
  /** @param {any} layer @returns {any} */
  function metadata(layer){
    var text=String(layer.comment||""),tag=text.indexOf(TAG)>=0?TAG:LEGACY_TAG,at=text.indexOf(tag);if(at<0)return null;
    var r=clone(MotionJson.parse(decodeURIComponent(text.substring(at+tag.length).split("\n")[0]||"")));
    if(!r||r.version!==(tag===TAG?3:2)||typeof r.instance!=="string"||r.instance.length>128||!/^[0-9-]+$/.test(r.instance)||typeof r.was3D!=="boolean"||!r.slots||!(r.shared instanceof Array)||r.shared.length>6)throw new Error("Identidade das fases inválida.");
    if(r.blur!==undefined&&(!r.blur||typeof r.blur.layer!=="boolean"||typeof r.blur.comp!=="boolean"))throw new Error("Motion blur das fases inválido.");
    for(var i=0;i<ROLES.length;i++){var role=ROLES[i],s=r.slots[role];if(!s)continue;
      var p=s.meta?lib.definition({presetId:s.presetId}):null;
      if(!p||(role==="effect"&&r.version!==3)||s.meta.presetId!==s.presetId||s.meta.markerInstance!==r.instance||lib.validate(s.meta.options))throw new Error("Receita da fase inválida.");
      if(!fits(role,p)||(role==="effect"?s.meta.effectCue!==1:s.meta.options.phase!==role)||s.meta.instance!==r.instance+"-"+SLOT[role]||!(s.meta.effects instanceof Array)||!(s.meta.expressions instanceof Array)||!(s.meta.animators instanceof Array)||!(s.meta.masks instanceof Array))throw new Error("Vínculos da fase inválidos.");
      if(s.meta.label!==undefined&&(s.meta.label!==PHASE_LABEL[role]||!lib.ownedLabels[s.meta.label]))throw new Error("Rótulo da fase inválido.");
      var groups=[s.meta.effects,s.meta.animators,s.meta.masks],owned=lib.ownedPrefix(s.meta)+" · ",names=/** @type {any} */ ({});
      for(var g=0;g<groups.length;g++){if(groups[g].length>64)throw new Error("Limite de controles excedido.");for(var n=0;n<groups[g].length;n++){var record=groups[g][n];if(!record||typeof record.name!=="string"||record.name.indexOf(owned)!==0||record.name.length>240||typeof record.matchName!=="string"||names[record.name])throw new Error("Identidade de controle inválida.");names[record.name]=true;}}
      if(s.meta.expressions.length>64)throw new Error("Limite de expressões excedido.");
      for(n=0;n<s.meta.expressions.length;n++){record=s.meta.expressions[n];if(!record||!(record.path instanceof Array)||record.path.length<2||record.path.length>12||record.original!==""||typeof record.enabled!=="boolean")throw new Error("Expressão de fase inválida.");
        var named=record.path[0]==="ADBE Text Properties"&&record.path[1]==="ADBE Text Animators"?record.path[2]:record.path[1];
        if(record.path[0]!=="ADBE Effect Parade"&&record.path[0]!=="ADBE Text Properties"&&record.path[0]!=="ADBE Mask Parade")throw new Error("Propriedade de fase inválida.");
        if(record.path[1]!=="ADBE Text Document"&&!names[named])throw new Error("Vínculo de expressão inválido.");}
    }
    if(r.textState!==undefined){var ts=r.textState;if(!ts||typeof ts.perChar3D!=="boolean"||typeof ts.managedPerChar3D!=="boolean"||typeof ts.grouping!=="number"||ts.grouping<1||ts.grouping>4||typeof ts.managedGrouping!=="number"||ts.managedGrouping<1||ts.managedGrouping>4)throw new Error("Estado de texto inválido.");}
    var transforms=/** @type {any} */ ({"ADBE Position":true,"ADBE Scale":true,"ADBE Rotate X":true,"ADBE Rotate Y":true,"ADBE Rotate Z":true,"ADBE Opacity":true}),seen=/** @type {any} */ ({});
    for(i=0;i<r.shared.length;i++){var shared=r.shared[i];if(!shared||!(shared.path instanceof Array)||shared.path.length!==2||shared.path[0]!==TR||!transforms[shared.path[1]]||seen[shared.path[1]]||shared.expression!==""||typeof shared.managed!=="string"||shared.managed.indexOf(prefix(r))!==0)throw new Error("Transformação original inválida.");seen[shared.path[1]]=true;}
    return r;
  }
  /** Any older tag line is dropped; the root is written under its own version.
   * @param {any} layer @param {any} root */
  function save(layer,root){var text=String(layer.comment||""),tags=/** @type {any} */ ([TAG,LEGACY_TAG]);
    for(var i=0;i<tags.length;i++){var at=text.indexOf(tags[i]);if(at<0)continue;var end=text.indexOf("\n",at);text=text.substring(0,at>0&&text.charAt(at-1)==="\n"?at-1:at)+(end<0?"":text.substring(end));}
    layer.comment=text+(root?(text?"\n":"")+(root.version===2?LEGACY_TAG:TAG)+encodeURIComponent(MotionJson.stringify(root)):"");}
  /** @param {any} layer @param {any} root @returns {MotionCommandFailure|null} */
  function ownership(layer,root){
    for(var i=0;i<root.shared.length;i++){var p=lib.locate(layer,root.shared[i].path);if(!p||p.expression!==root.shared[i].managed)return fail("Uma expressão compartilhada foi alterada. Desfaça a alteração antes de editar.",MotionContracts.ERROR.EXPRESSION_CONFLICT);}
    for(i=0;i<ROLES.length;i++){var s=root.slots[ROLES[i]];if(s){var e=lib.verifyOwnership(layer,s.meta);if(e)return e;}}
    if(root.textState){var gp=groupingProperty(layer),ts=root.textState;if(!gp||gp.numKeys||gp.expression||gp.value!==ts.managedGrouping||!!layer.threeDPerChar!==ts.managedPerChar3D)return fail("O agrupamento ou o modo 3D do texto mudou. Restaure a configuração antes de editar.",MotionContracts.ERROR.EXPRESSION_CONFLICT);}
    return null;
  }
  /** @param {any} layer @param {any} root @returns {any} */
  function cues(layer,root){var state=lib.markerState(layer,root);if(state.effectTime===undefined){state.effectTime=null;state.effectDuration=null;}return state;}
  /** @param {any} layer @param {any} root @returns {any[]} */
  function captureCues(layer,root){return lib.snapshotMarkers(layer,root);}
  /** Phase slots still time transitions by point cues (end of the entrance,
   * start of the exit); a single preset with range cues (v2) is read as those points.
   * @param {any} layer @param {any} state @returns {any} */
  function pointCues(layer,state){
    var W=/** @type {any} */ (global).MotionMarkerWindow,fd=layer.containingComp.frameDuration;
    if(state.inTime!==null)state.inTime=W.cueWindow("in",state.inTime,state.inDuration,state.inParams,layer,fd).end;
    if(state.outTime!==null)state.outTime=W.cueWindow("out",state.outTime,state.outDuration,state.outParams,layer,fd).start;
    return state;
  }
  /** Each split cue receives a fresh value; never mutate the rollback snapshot.
   * @param {any} source @returns {any} */
  function cloneCue(source){var value=/** @type {any} */ (new MarkerValue(source.comment)),fields=/** @type {any[]} */ (["chapter","url","frameTarget","duration","cuePointName","eventCuePoint","label","protectedRegion"]);
    for(var i=0;i<fields.length;i++)if(typeof source[fields[i]]!=="undefined")value[fields[i]]=source[fields[i]];
    value.setParameters(source.getParameters());return value;
  }
  /** Preserve arbitrary marker payloads; merge a coincident In/Out cue; the effect
   * cue carries its window as the marker duration.
   * @param {any} layer @param {any} root @param {any} times @param {any[]} previous @param {string} locale */
  function writeCues(layer,root,times,previous,locale){
    var p=layer.property("ADBE Marker");lib.removeMarkers(layer,root);
    var list=/** @type {any[]} */ ([]),a=times.inTime,b=times.outTime;
    if(a!==null&&b!==null&&Math.abs(a-b)<.000001)list.push({time:a,role:"both"});else{if(a!==null)list.push({time:a,role:"in"});if(b!==null)list.push({time:b,role:"out"});}
    if(times.effectTime!==null)list.push({time:times.effectTime,role:"effect"});
    for(var i=0;i<list.length;i++){var item=/** @type {any} */ (list[i]),effect=item.role==="effect",label=effect?(String(locale||"").indexOf("pt")===0?"Moti.on Efeito":"Moti.on Effect"):item.role==="both"?"Moti.on In / Out":item.role==="in"?"Moti.on In":"Moti.on Out",value=/** @type {any} */ (new MarkerValue(label));
      for(var j=0;j<previous.length;j++){var params=previous[j].value.getParameters(),role=params["Moti.on.phase"];if(effect?role==="effect":role===item.role||role==="both"){value=cloneCue(previous[j].value);break;}}
      if(effect)value.duration=times.effectDuration;
      params=value.getParameters();params["Moti.on.instance"]=root.instance;params["Moti.on.phase"]=item.role;value.setParameters(params);p.setValueAtTime(item.time,value);
    }
  }
  /** A frame is taken when another owned cue or any user marker sits on it.
   * @param {any} layer @param {any} root @param {any} times @param {number} time @returns {boolean} */
  function occupied(layer,root,times,time){
    if((times.inTime!==null&&Math.abs(times.inTime-time)<.000001)||(times.outTime!==null&&Math.abs(times.outTime-time)<.000001))return true;
    var p=layer.property("ADBE Marker");for(var i=1;p&&i<=p.numKeys;i++)if(p.keyValue(i).getParameters()["Moti.on.instance"]!==root.instance&&Math.abs(p.keyTime(i)-time)<.000001)return true;
    return false;
  }
  /** @param {any} layer @param {any} root @param {any} times @returns {MotionCommandFailure|null} */
  function checkCues(layer,root,times){
    var p=layer.property("ADBE Marker"),state=cues(layer,root),fd=layer.containingComp.frameDuration,effect=times.effectTime;
    if(!p||typeof MarkerValue==="undefined")return fail("Marcadores indisponíveis nesta camada.",MotionContracts.ERROR.CAPABILITY_UNAVAILABLE);
    if(state.duplicate)return fail("Há marcadores de fase duplicados.");
    if(p.numKeys-state.count+(times.inTime!==null?1:0)+(times.outTime!==null?1:0)+(effect!==null?1:0)>250)return fail("A camada excederia 250 marcadores.");
    if(times.inTime!==null&&(times.inTime<layer.inPoint+fd-.000001||times.inTime>layer.outPoint+.000001))return fail("A entrada deve permanecer dentro dos limites da camada.");
    if(times.outTime!==null&&(times.outTime>layer.outPoint-fd+.000001||times.outTime<layer.inPoint-.000001))return fail("A saída deve permanecer dentro dos limites da camada.");
    if(times.inTime!==null&&times.outTime!==null&&times.inTime>times.outTime+.000001)return fail("A entrada e a saída não podem se sobrepor.");
    if(effect!==null){
      if(times.effectDuration<fd-.000001||effect<layer.inPoint-.000001||effect+times.effectDuration>layer.outPoint+.000001)return fail("O efeito deve permanecer dentro dos limites da camada.");
      if((times.inTime!==null&&Math.abs(times.inTime-effect)<.000001)||(times.outTime!==null&&Math.abs(times.outTime-effect)<.000001))return fail("O efeito não pode começar no mesmo frame da entrada ou da saída.",MotionContracts.ERROR.KEYFRAME_CONFLICT);
    }
    for(var i=1;i<=p.numKeys;i++){var params=p.keyValue(i).getParameters();if(params["Moti.on.instance"]===root.instance)continue;
      var at=p.keyTime(i);if((times.inTime!==null&&Math.abs(at-times.inTime)<.000001)||(times.outTime!==null&&Math.abs(at-times.outTime)<.000001)||(effect!==null&&Math.abs(at-effect)<.000001))return fail("Um marcador existente ocupa esse frame.",MotionContracts.ERROR.KEYFRAME_CONFLICT);
    }return null;
  }
  /** @param {any} layer @param {any} comp @param {any} root @returns {any} */
  function read(layer,comp,root){
    var phases=/** @type {any[]} */ ([]),current=cues(layer,root),byRole=/** @type {any} */ ({});
    for(var i=0;i<ROLES.length;i++){var role=ROLES[i],s=root.slots[role];if(!s)continue;var value=lib.inspectLayer(layer,comp,s.meta);if(value.state!=="ready")return value;
      byRole[role]={presetId:s.presetId,instance:s.meta.instance,options:value.options,controls:controls(s.meta)};
      var entry=/** @type {any} */ ({phase:role,presetId:s.presetId,instance:s.meta.instance,options:value.options,controls:byRole[role].controls,markerTime:role==="in"?current.inTime:role==="out"?current.outTime:current.effectTime});
      if(role==="effect")entry.markerDuration=current.effectDuration;phases.push(entry);
    }
    if(!phases.length)return {state:"conflict",message:"Nenhuma fase válida foi encontrada."};
    var fp=MotionJson.stringify({instance:root.instance,phases:byRole,inPoint:layer.inPoint,outPoint:layer.outPoint,markers:current,frameRate:comp.frameRate,dropFrame:!!comp.dropFrame});
    return {state:"ready",message:"",layerName:layer.name,presetId:phases[0]&&phases[0].presetId,options:phases[0]&&phases[0].options,phases:phases,frameRate:comp.frameRate,dropFrame:comp.dropFrame,target:{compId:comp.id,layerId:layer.id,instance:root.instance,fingerprint:fp}};
  }
  /** @param {any} meta @returns {any[]} */
  function controls(meta){var spec=/** @type {any} */ ({durationFrames:[1,600,"frames"],intensity:[0,300,"%"],staggerFrames:[0,60,"frames"],elasticity:[0,100,"%"],overlap:[0,100,"%"],speed:[25,200,"%"],seed:[0,9999,""],settleAmount:[0,100,"%"],settleCount:[0.5,8,""],settleDamping:[0,100,"%"]}),names=/** @type {any} */ ({durationFrames:meta.effects[0].name,intensity:meta.effects[1].name,staggerFrames:meta.effects[2].name}),out=[];if(meta.controls)for(var k in meta.controls)if(Object.prototype.hasOwnProperty.call(meta.controls,k))names[k]=meta.controls[k];for(k in names)if(Object.prototype.hasOwnProperty.call(names,k)&&spec[k])out.push({key:k,name:names[k],type:"number",min:spec[k][0],max:spec[k][1],unit:spec[k][2]});return out;}

  /** @param {any} layer @param {any} comp @returns {any} */
  function inspectLayer(layer,comp){try{var root=metadata(layer),e=ownership(layer,root);if(e)return {state:"conflict",layerName:layer.name,message:e.message};if(layer.locked)return {state:"conflict",layerName:layer.name,message:"Desbloqueie a camada para editar."};return read(layer,comp,root);}catch(error){return {state:"conflict",layerName:layer.name,message:String(error)};}}
  /** Convert a freshly generated recipe expression into an isolated contribution.
   * @param {string} expression @param {string} neutral @returns {string} */
  function contribution(expression,neutral){var body=expression.replace(/;\s*$/, ""),at=body.lastIndexOf(";");if(at<0)throw new Error("Receita de transformação inválida.");return "(function(value){\n"+body.substring(0,at+1)+"\nreturn "+body.substring(at+1).replace(/^\s+/,"")+";\n})("+neutral+")";}
  /** @param {any} layer @param {any} root @param {any[]} components */
  function combine(layer,root,components){
    for(var i=0;i<root.shared.length;i++){var original=root.shared[i],p=lib.locate(layer,original.path),name=original.path[1],vector=name==="ADBE Position"||name==="ADBE Scale",multiply=name==="ADBE Scale"||name==="ADBE Opacity",count=layer.threeDLayer?3:2,terms=[],names=[];
      for(var j=0;j<components.length;j++)if(MotionJson.stringify(components[j].path)===MotionJson.stringify(original.path))names.push(contribution(components[j].expression,vector?(multiply?(count===3?"[100,100,100]":"[100,100]"):(count===3?"[0,0,0]":"[0,0]")):(multiply?"100":"0")));
      if(!names.length){p.expression=original.expression;p.expressionEnabled=original.enabled;original.managed="";continue;}
      var expression=prefix(root);for(j=0;j<names.length;j++)expression+="var phase"+j+"="+names[j]+";\n";
      for(var k=0;k<(vector?count:1);k++){var term=vector?"value["+k+"]":"value";for(j=0;j<names.length;j++)term+=(multiply?"*":"+")+"phase"+j+(vector?"["+k+"]":"")+(multiply?"/100":"");terms.push(term);}
      expression+=(vector?"["+terms.join(",")+"]":terms[0])+";";p.expression=expression;p.expressionEnabled=true;original.managed=expression;
      p.valueAtTime(Math.max(layer.inPoint,Math.min(layer.outPoint-layer.containingComp.frameDuration,layer.containingComp.time)),false);if(p.expressionError)throw new Error(p.expressionError);
    }
  }
  /** @param {any} layer @param {any} root @param {string} role @param {any} context @param {any[]} components @param {any[]} plans */
  function renderSlot(layer,root,role,context,components,plans){
    var s=root.slots[role],m=s.meta,p=lib.definition({presetId:s.presetId});m.markerInstance=root.instance;
    // Masked recipes need the text bounds; mid-layer is at rest between the phases.
    var plan={layer:layer,comp:layer.containingComp,p:p,args:m.options,meta:m,created:[],snapshots:[],locale:context.locale||"pt-BR",deferMetadata:true,deferMarkers:true,rect:layer.sourceRectAtTime((layer.inPoint+layer.outPoint)/2,false)};plans.push(plan);lib.applyLayer(plan);
    var retained=[];for(var i=0;i<m.expressions.length;i++){var item=m.expressions[i];if(item.path[0]!==TR){retained.push(item);continue;}
      var prop=lib.locate(layer,item.path),known=false;for(var j=0;j<root.shared.length;j++)if(MotionJson.stringify(root.shared[j].path)===MotionJson.stringify(item.path))known=true;
      if(!known){var base=lib.snapshot(prop);base.expression=item.original;base.enabled=item.enabled;root.shared.push(base);}
      components.push({path:item.path,expression:prop.expression});
    }m.expressions=retained;
  }
  /** @param {any} layer @param {any} root */
  function erase(layer,root){for(var i=0;i<ROLES.length;i++)if(root.slots[ROLES[i]])lib.removeLayer(layer,root.slots[ROLES[i]].meta,true);lib.restore(layer,root.shared);lib.removeMarkers(layer,root);save(layer,null);restoreTextState(layer,root);layer.threeDLayer=root.was3D;}
  /** @param {any} args @param {boolean=} targeted @returns {any} */
  function prepare(args,targeted){
    var comp=app.project&&app.project.activeItem;if(!comp||!(comp instanceof CompItem))return {error:fail("Abra uma composição.",MotionContracts.ERROR.NO_ACTIVE_COMP)};
    var layers=/** @type {any[]} */ (comp.selectedLayers);if(!layers.length||layers.length>50)return {error:fail("Selecione de uma a 50 camadas.",MotionContracts.ERROR.INVALID_SELECTION_TYPE)};
    if(targeted){if(layers.length!==1)return {error:fail("Selecione uma camada para editar uma fase.")};var inspection=has(layers[0])?inspectLayer(layers[0],comp):lib.inspectLayer(layers[0],comp),t=args.target;if(!t||inspection.state!=="ready"||inspection.target.compId!==t.compId||inspection.target.layerId!==t.layerId||inspection.target.instance!==t.instance||inspection.target.fingerprint!==t.fingerprint)return {error:fail("A seleção ou os controles mudaram. Recarregue antes de editar.")};}
    var batch=[];
    for(var i=0;i<layers.length;i++){
      var layer=/** @type {any} */ (layers[i]),root,old,e=null;
      try{root=metadata(layer);old=root?null:lib.metadata(layer);}catch(error){return {error:fail("Os metadados do preset estão incompletos.")};}
      if(root){e=ownership(layer,root);if(!e){var now=read(layer,comp,root);if(now.state!=="ready")return {error:fail(now.message)};for(var n=0;n<now.phases.length;n++){var entry=now.phases[n];root.slots[entry.phase].meta.options.presetId=entry.presetId;for(var key in entry.options)if(Object.prototype.hasOwnProperty.call(entry.options,key))root.slots[entry.phase].meta.options[key]=entry.options[key];}}}
      // A legacy preset becomes the matching slot: a transition its In/Out, a loop or look the effect.
      else if(old){e=lib.verifyOwnership(layer,old);var legacy=lib.inspectLayer(layer,comp);if(legacy.state!=="ready")return {error:fail(legacy.message)};old.options=legacy.options;old.options.presetId=old.presetId;}
      if(e)return {error:e};
      var rootId=root?root.instance:String(new Date().getTime())+"-"+layer.id+"-"+(++serial),state=root?cues(layer,root):old?(old.markerVersion===2?pointCues(layer,cues(layer,old)):cues(layer,old)):{inTime:null,outTime:null,effectTime:null,effectDuration:null};
      batch.push({layer:layer,root:root,old:old,rootId:rootId,state:state,comment:String(layer.comment||""),was3D:layer.threeDLayer,perChar3D:layer.threeDPerChar,grouping:groupingProperty(layer)?groupingProperty(layer).value:null,switches:{layer:layer.motionBlur,comp:/** @type {any} */ (comp).motionBlur},markers:root?captureCues(layer,root):old?captureCues(layer,old):[]});
    }return {error:null,comp:comp,batch:batch};
  }
  /** @param {any} q @param {string} role @returns {boolean} */
  function covers(q,role){
    if(q.root)return !!q.root.slots[role];if(!q.old)return false;
    var p=lib.definition({presetId:q.old.presetId}),phase=q.old.options.phase;
    return fits(role,p)&&(role==="effect"||phase===role||phase==="both");
  }
  /** @param {any} args @param {string} action @returns {MotionCommandFailure|null} */
  function preflight(args,action){
    var allowed=/** @type {any} */ (action==="apply"?null:action==="adjust"?{target:true,phase:true,presetId:true,options:true}:action==="timing"?{target:true,phase:true,frames:true}:{target:true,phase:true,action:true});
    if(allowed)for(var key in args)if(Object.prototype.hasOwnProperty.call(args,key)&&!allowed[key])return fail("Parâmetro de fase desconhecido.");
    if(action==="apply"){var invalid=lib.validate(args);if(invalid)return invalid;}
    else{if(!SLOT[args.phase])return fail("Escolha Entrada, Saída ou Efeito.");if(action==="adjust"){if(!args.options||(args.phase!=="effect"&&args.options.phase!==args.phase))return fail("Os parâmetros pertencem a outra fase.");var adjusted=clone(args.options);adjusted.presetId=args.presetId;invalid=lib.validate(adjusted);if(invalid)return invalid;}
      if(action==="action"&&args.action!=="remove"&&args.action!=="reset")return fail("Ação de fase inválida.");
      if(action==="timing"&&(typeof args.frames!=="number"||!isFinite(args.frames)||Math.floor(args.frames)!==args.frames||Math.abs(args.frames)>600))return fail("Use um deslocamento inteiro de até 600 frames.");}
    var prepared=prepare(args,action!=="apply");if(prepared.error)return prepared.error;
    for(var i=0;i<prepared.batch.length;i++){var q=prepared.batch[i],slots=q.root?q.root.slots:null;
      if(action!=="apply"&&!covers(q,args.phase))return fail("Essa fase não está aplicada à camada.");
      if(action==="adjust"&&args.presetId!==(slots?slots[args.phase].presetId:q.old.presetId))return fail("A receita da fase mudou. Recarregue antes de ajustar.");
      var job=schedule(q,args,action);
      if(job.options){var owner={prefixes:q.root?[prefix(q.root)]:q.old?["// Moti.on preset v1:"+q.old.instance+"\n"]:[]};var e=lib.preflight(job.options,"apply",true,[q.layer],owner);if(e)return e;}
      e=textPreflight(q.layer,textDemand(plannedSlots(q,args,action,job)));if(e)return e;
      // During lazy migration the old instance is accepted only as owned here.
      e=checkCues(q.layer,q.root||q.old||{instance:q.rootId},job.times);if(e)return e;
    }return null;
  }
  /** @param {string} id @param {string} phase @returns {any} */
  function defaults(id,phase){var p=lib.definition({presetId:id}),v=/** @type {any} */ ({presetId:id,phase:phase,direction:"preset",durationFrames:24,intensity:100,staggerFrames:2,unit:"preset",easing:"preset",order:"preset",seed:17,elasticity:30,overlap:65,speed:100});if(p.defaults)for(var key in p.defaults)if(Object.prototype.hasOwnProperty.call(p.defaults,key))v[key]=p.defaults[key];v.presetId=id;v.phase=phase;return v;}
  /** Keep hand-positioned cues when changing any parameter except duration/recipe.
   * @param {any} q @param {string} role @param {any} options @param {boolean} reset @returns {number} */
  function phaseTime(q,role,options,reset){var old=q.root&&q.root.slots[role],prior=old?old.meta.options:q.old&&q.old.options,cue=q.state[role==="in"?"inTime":"outTime"],id=old?old.presetId:q.old&&q.old.presetId;if(!reset&&prior&&id===options.presetId&&prior.durationFrames===options.durationFrames&&cue!==null)return cue;var duration=Math.min(options.durationFrames*q.layer.containingComp.frameDuration,(q.layer.outPoint-q.layer.inPoint)/(options.phase==="both"?2:1));return role==="in"?q.layer.inPoint+duration:q.layer.outPoint-duration;}
  /** The effect plays over the whole layer unless its cue was placed by hand,
   * which survives every edit except Reset and is kept inside the layer.
   * @param {any} q @param {boolean} keep @returns {any} */
  function effectSpan(q,keep){var l=q.layer,fd=l.containingComp.frameDuration,cue=q.state.effectTime;
    if(keep&&cue!==null){var start=Math.max(l.inPoint,Math.min(cue,l.outPoint-fd)),end=Math.min(l.outPoint,cue+Math.max(0,q.state.effectDuration||0));if(end-start>=fd-.000001)return {start:start,duration:end-start,placed:true};}
    return {start:l.inPoint,duration:l.outPoint-l.inPoint,placed:false};
  }
  /** What a command does to one layer: the options it renders, the slots it
   * rewrites and the cues it leaves. Shared by preflight and run.
   * @param {any} q @param {any} args @param {string} action @returns {any} */
  function schedule(q,args,action){
    var current=q.root?q.root.slots[args.phase]:null,fd=q.layer.containingComp.frameDuration,options=null,roles=/** @type {any[]} */ ([]),r,span=null;
    var times=/** @type {any} */ ({inTime:q.state.inTime,outTime:q.state.outTime,effectTime:q.state.effectTime,effectDuration:q.state.effectDuration});
    if(action==="apply"){options=clone(args);roles=lib.definition(args).mode!=="transition"?["effect"]:args.phase==="both"?["in","out"]:[args.phase];}
    else if(action==="adjust"){options=clone(args.options);options.presetId=args.presetId;roles=[args.phase];}
    else if(action==="action"&&args.action==="reset"){var source=current?current.meta.options:q.old.options;options=defaults(current?current.presetId:q.old.presetId,args.phase==="effect"?source.phase:args.phase);roles=[args.phase];}
    if(action==="timing"){if(args.phase==="effect")times.effectTime+=args.frames*fd;else times[args.phase==="in"?"inTime":"outTime"]+=args.frames*fd;}
    if(action==="action"&&args.action==="remove"){if(args.phase==="effect"){times.effectTime=null;times.effectDuration=null;}else times[args.phase==="in"?"inTime":"outTime"]=null;}
    for(r=0;r<roles.length;r++){if(roles[r]==="effect"){span=effectSpan(q,action!=="action");continue;}times[roles[r]==="in"?"inTime":"outTime"]=phaseTime(q,roles[r],options,action==="action");}
    // A migrated legacy loop gains its window here.
    var effectStays=times.effectTime!==null||(!!q.old&&lib.definition({presetId:q.old.presetId}).mode!=="transition"&&!(action==="action"&&args.action==="remove"));
    if(!span&&effectStays&&times.effectTime===null)span=effectSpan(q,false);
    if(span){times.effectTime=span.start;times.effectDuration=span.duration;
      // A default window steps off frames already taken instead of replacing a marker.
      for(var n=0;!span.placed&&n<10&&times.effectDuration>2*fd&&occupied(q.layer,q.root||q.old||{instance:q.rootId},times,times.effectTime);n++){times.effectTime+=fd;times.effectDuration-=fd;}}
    return {options:options,roles:roles,times:times};
  }
  /** @param {any} q @returns {any} */
  function migrate(q){if(q.root)return q.root;var root={version:3,instance:q.rootId,was3D:q.old?q.old.was3D:q.was3D,shared:[],slots:/** @type {any} */ ({})};
    if(q.old){var old=q.old,p=lib.definition({presetId:old.presetId});lib.removeLayer(q.layer,old);delete old.textState;
      if(!fits("in",p))root.slots.effect=newSlot(root,"effect",old.presetId,old.options);
      else for(var i=0;i<2;i++)if(old.options.phase===ROLES[i]||old.options.phase==="both")root.slots[ROLES[i]]=newSlot(root,ROLES[i],old.presetId,old.options);}
    return root;
  }
  /** @param {any} root @param {string} role @param {string} id @param {any} options @returns {any} */
  function newSlot(root,role,id,options){var args=clone(options);if(role!=="effect")args.phase=role;args.presetId=id;
    var meta=/** @type {any} */ ({version:1,instance:root.instance+"-"+SLOT[role],label:PHASE_LABEL[role],presetId:id,was3D:root.was3D,options:args,markerInstance:root.instance,expressions:[],effects:[],animators:[],masks:[]});
    if(role==="effect")meta.effectCue=1;else{meta.markerVersion=1;meta.markerDurationFrames=args.durationFrames;}
    return {presetId:id,meta:meta};}
  /** Anchor Point Grouping of a text layer (1 characters, 2 words, 3 lines, 4 all).
   * @param {any} layer @returns {any} */
  function groupingProperty(layer){return lib.textGrouping(layer);}
  /** One shared pivot grouping and the per-character 3D gate for a set of slots.
   * Recipes outside the text collection keep the layer's own grouping.
   * @param {any[]} list @returns {any} */
  function textDemand(list){var group=null,threeD=false,soft=/** @type {number|null} */ (null),softConflict=false;
    for(var i=0;i<list.length;i++){var one=lib.textDemandFor(lib.definition({presetId:list[i].presetId}),list[i].options);if(one.threeD)threeD=true;if(one.group===null)continue;var value=one.group;
      // Older recipes ask softly: they follow a required grouping or each other.
      if(one.soft){if(soft!==null&&soft!==value)softConflict=true;soft=value;continue;}
      if(group!==null&&group!==value)return {error:fail("Estas receitas precisam de agrupamentos de pivô diferentes. Use a mesma divisão de texto na entrada, na saída e no efeito.",MotionContracts.ERROR.EXPRESSION_CONFLICT),group:null,threeD:false,soft:false};group=value;
    }
    if(group===null&&soft!==null&&!softConflict)return {error:null,group:soft,threeD:threeD,soft:true};
    return {error:null,group:group,threeD:threeD,soft:false};
  }
  /** @param {any} root @returns {any[]} */
  function slotList(root){var out=[];for(var i=0;i<ROLES.length;i++){var s=root.slots[ROLES[i]];if(s)out.push({presetId:s.presetId,options:s.meta.options});}return out;}
  /** The slots a scheduled command leaves on the layer.
   * @param {any} q @param {any} args @param {string} action @param {any} job @returns {any[]} */
  function plannedSlots(q,args,action,job){var out=[],replaced=/** @type {any} */ ({});
    for(var r=0;r<job.roles.length;r++)replaced[job.roles[r]]=true;if(action==="action"&&args.action==="remove")replaced[args.phase]=true;
    for(r=0;r<ROLES.length;r++){var role=ROLES[r];if(replaced[role])continue;
      if(q.root&&q.root.slots[role])out.push({presetId:q.root.slots[role].presetId,options:q.root.slots[role].meta.options});
      else if(!q.root&&covers(q,role))out.push({presetId:q.old.presetId,options:q.old.options});}
    if(job.options&&job.roles.length)out.push({presetId:job.options.presetId,options:job.options});return out;
  }
  /** A user animator depends on the grouping and 3D mode it was built with.
   * @param {any} layer @param {any} requested @returns {MotionCommandFailure|null} */
  function textPreflight(layer,requested){if(requested.error)return requested.error;var demand=lib.textDemandAllowed(layer,requested);if(!demand.threeD&&demand.group===null)return null;
    if(demand.threeD&&typeof layer.threeDPerChar!=="boolean")return fail("O host não oferece texto 3D por caractere nesta camada.",MotionContracts.ERROR.CAPABILITY_UNAVAILABLE);
    var gp=groupingProperty(layer);if(demand.group!==null){if(!gp)return fail("Agrupamento de texto indisponível neste host.",MotionContracts.ERROR.CAPABILITY_UNAVAILABLE);if(gp.numKeys||gp.expression)return fail("O agrupamento tem animação do usuário. Edite-o no After Effects antes de aplicar.",MotionContracts.ERROR.EXPRESSION_CONFLICT);}
    if((demand.group!==null&&gp.value!==demand.group)||(demand.threeD&&!layer.threeDPerChar)){var text=layer.property("ADBE Text Properties"),animators=text&&text.property("ADBE Text Animators");
      for(var j=1;animators&&j<=animators.numProperties;j++)if(String(animators.property(j).name).indexOf("Moti.on ")!==0)return fail("Um animador do usuário usa o agrupamento ou o modo 3D atual. Preserve essa configuração ou use outra camada.",MotionContracts.ERROR.EXPRESSION_CONFLICT);}
    return null;
  }
  /** Put the layer's original grouping and 3D mode back.
   * @param {any} layer @param {any} root */
  function restoreTextState(layer,root){if(!root.textState)return;var ts=root.textState,gp=groupingProperty(layer);if(gp)gp.setValue(ts.grouping);layer.threeDPerChar=ts.perChar3D;delete root.textState;}
  /** Set the grouping and 3D mode the current slots need; the original values are
   * stored once and come back when no slot needs them any more.
   * @param {any} layer @param {any} root */
  function configureText(layer,root){var requested=textDemand(slotList(root));if(requested.error)throw new Error(requested.error.message);var demand=lib.textDemandAllowed(layer,requested),gp=groupingProperty(layer);
    if(!demand.threeD&&demand.group===null){restoreTextState(layer,root);return;}
    if(!root.textState)root.textState={perChar3D:!!layer.threeDPerChar,grouping:gp?gp.value:1,managedPerChar3D:!!layer.threeDPerChar,managedGrouping:gp?gp.value:1};
    var ts=root.textState;
    if(gp){var group=demand.group!==null?demand.group:ts.grouping;if(gp.value!==group)gp.setValue(group);ts.managedGrouping=group;}
    var want=demand.threeD||ts.perChar3D;if(!!layer.threeDPerChar!==want)layer.threeDPerChar=want;ts.managedPerChar3D=want;
  }
  /** @param {any} root @returns {boolean} */
  function empty(root){for(var i=0;i<ROLES.length;i++)if(root.slots[ROLES[i]])return false;return true;}
  /** @param {any} args @param {any} context @param {string} action @returns {MotionCommandResult} */
  function run(args,context,action){
    var error=preflight(args,action);if(error)throw new Error(error.message);var prepared=prepare(args,action!=="apply"),done=/** @type {any[]} */ ([]),plans=/** @type {any[]} */ ([]);
    try{for(var i=0;i<prepared.batch.length;i++){
      var q=prepared.batch[i],oldRoot=q.root?clone(q.root):null,keepRole;
      // A rollback rebuilds the previous slots: carry the user's tuned geometry into them too.
      for(keepRole=0;oldRoot&&keepRole<ROLES.length;keepRole++){var previousSlot=q.root.slots[ROLES[keepRole]],kept=previousSlot?lib.liveValues(q.layer,previousSlot.meta):null;if(kept)oldRoot.slots[ROLES[keepRole]].meta.keep=kept;}
      var job=schedule(q,args,action),root=migrate(q),components=/** @type {any[]} */ ([]);root.version=3;done.push({q:q,root:root,oldRoot:oldRoot});
      if(action==="action"&&args.action==="remove"){lib.removeLayer(q.layer,root.slots[args.phase].meta,true);delete root.slots[args.phase];}
      else if(action!=="timing"){var values=job.options,id=values.presetId;
        for(var r=0;r<job.roles.length;r++){var role=job.roles[r],prior=root.slots[role],keep=prior&&prior.presetId===id&&action!=="action"?lib.liveValues(q.layer,prior.meta):null;if(prior)lib.removeLayer(q.layer,prior.meta,true);root.slots[role]=newSlot(root,role,id,values);if(keep)root.slots[role].meta.keep=keep;if(role!=="effect"&&prior&&action!=="action"&&prior.presetId===id&&prior.meta.options.durationFrames===values.durationFrames)root.slots[role].meta.markerDurationFrames=prior.meta.markerDurationFrames;}
      }
      configureText(q.layer,root);lib.restore(q.layer,root.shared);
      for(r=0;r<ROLES.length;r++)if(root.slots[ROLES[r]])renderSlot(q.layer,root,ROLES[r],context,components,plans);
      combine(q.layer,root,components);writeCues(q.layer,root,job.times,q.markers,context.locale||"pt-BR");
      // The layer uses motion blur while any slot asks for it.
      var blur=false;for(r=0;r<ROLES.length;r++)if(root.slots[ROLES[r]]&&root.slots[ROLES[r]].meta.options.motionBlur===true)blur=true;
      root.blur=lib.syncMotionBlur(q.layer,root.blur,blur);if(!root.blur)delete root.blur;
      // Shared entries no longer used are restored, then removed from metadata.
      var retained=[];for(r=0;r<root.shared.length;r++)if(root.shared[r].managed)retained.push(root.shared[r]);root.shared=retained;
      if(empty(root)){save(q.layer,null);restoreTextState(q.layer,root);q.layer.threeDLayer=root.was3D;}else save(q.layer,root);
    }}catch(problem){var failed=false;
      for(i=plans.length-1;i>=0;i--){try{var plan=plans[i];lib.restore(plan.layer,plan.snapshots);for(var j=plan.created.length-1;j>=0;j--){var item=plan.created[j],g=lib.locate(plan.layer,item.group),e=lib.child(g,item.name);if(e)e.remove();}}catch(partialError){failed=true;}}
      for(i=done.length-1;i>=0;i--)try{var d=/** @type {any} */ (done[i]);erase(d.q.layer,d.root);d.q.layer.comment=d.q.comment;d.q.layer.threeDLayer=d.q.was3D;
        if(typeof d.q.perChar3D==="boolean")d.q.layer.threeDPerChar=d.q.perChar3D;var gpBack=groupingProperty(d.q.layer);if(gpBack&&d.q.grouping!==null)gpBack.setValue(d.q.grouping);
        if(d.oldRoot){if(d.oldRoot.textState){if(gpBack)gpBack.setValue(d.oldRoot.textState.managedGrouping);d.q.layer.threeDPerChar=d.oldRoot.textState.managedPerChar3D;}components=[];for(r=0;r<ROLES.length;r++)if(d.oldRoot.slots[ROLES[r]])renderSlot(d.q.layer,d.oldRoot,ROLES[r],context,components,[]);combine(d.q.layer,d.oldRoot,components);save(d.q.layer,d.oldRoot);lib.restoreMarkers(d.q.layer,d.oldRoot,d.q.markers);}
        else if(d.q.old){var m=d.q.old;lib.applyLayer({layer:d.q.layer,comp:prepared.comp,p:lib.definition({presetId:m.presetId}),args:m.options,meta:m,created:[],snapshots:[],locale:context.locale||"pt-BR",rect:d.q.layer.sourceRectAtTime((d.q.layer.inPoint+d.q.layer.outPoint)/2,false)});lib.restoreMarkers(d.q.layer,m,d.q.markers);d.q.layer.comment=d.q.comment;}
        d.q.layer.motionBlur=d.q.switches.layer;prepared.comp.motionBlur=d.q.switches.comp;
      }catch(rollbackError){failed=true;}
      if(failed){var failure=/** @type {any} */ (new Error("Falha ao restaurar as fases; use Desfazer."));failure.motionCode=MotionContracts.ERROR.ROLLBACK_FAILED;throw failure;}throw problem;
    }return {changed:true,data:{appliedCount:prepared.batch.length,phase:args.phase},warnings:[]};
  }
  /** Direct Apply of a loop or look joins the effect slot when a selected layer
   * already has phases or a legacy transition; otherwise it stays a single preset.
   * @param {any} args @returns {boolean} */
  function routesApply(args){
    var p=lib.definition(args),comp=app.project&&app.project.activeItem;
    if(!p||p.mode==="transition"||p.cameraSpec||!comp||!(comp instanceof CompItem))return false;
    var layers=/** @type {any[]} */ (comp.selectedLayers);
    for(var i=0;i<layers.length&&i<50;i++){if(has(layers[i]))return true;
      try{var old=lib.metadata(layers[i]);if(old&&old.presetId!==p.id&&lib.definition({presetId:old.presetId}).mode==="transition")return true;}catch(invalid){return false;}}
    return false;
  }
  MotionRegistry.register("ae.presets.phase-apply",{preflight:function(args){return preflight(args,"apply");},run:function(args,context){return run(args,context,"apply");}});
  MotionRegistry.register("ae.presets.phase-adjust",{preflight:function(args){return preflight(args,"adjust");},run:function(args,context){return run(args,context,"adjust");}});
  MotionRegistry.register("ae.presets.phase-action",{preflight:function(args){return preflight(args,"action");},run:function(args,context){return run(args,context,"action");}});
  MotionRegistry.register("ae.presets.phase-timing",{preflight:function(args){return preflight(args,"timing");},run:function(args,context){return run(args,context,"timing");}});
  global.MotionPresetPhases={has:has,inspectLayer:inspectLayer,metadata:metadata,contribution:contribution,routesApply:routesApply,applyPreflight:function(/** @type {any} */ args){return preflight(args,"apply");},applyRun:function(/** @type {any} */ args,/** @type {any} */ context){return run(args,context,"apply");}};
}($.global));
