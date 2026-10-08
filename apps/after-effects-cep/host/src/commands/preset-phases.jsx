/** Independent entrance/exit instances. All recipe code comes from the bundled
 * library; stored expressions are compared for ownership, never executed. */
(function(global){
  /* global MarkerValue */
  var lib=/** @type {any} */ (global).MotionPresetLibrary,TAG="[Moti.on.library.v2]",TR="ADBE Transform Group",ROLES=/** @type {any} */ (["in","out"]),serial=0;
  /** @param {string} message @param {string=} code @returns {MotionCommandFailure} */
  function fail(message,code){return {code:code||MotionContracts.ERROR.INVALID_PRESET,message:message,recoverable:true,details:null};}
  /** @param {any} value @returns {any} */
  function clone(value){return MotionJson.parse(MotionJson.stringify(value));}
  /** @param {any} layer @returns {boolean} */
  function has(layer){return String(layer.comment||"").indexOf(TAG)>=0;}
  /** @param {any} root @returns {string} */
  function prefix(root){return "// Moti.on phases v2:"+root.instance+"\n";}
  /** @param {any} layer @returns {any} */
  function metadata(layer){
    var text=String(layer.comment||""),at=text.indexOf(TAG);if(at<0)return null;
    var r=clone(MotionJson.parse(decodeURIComponent(text.substring(at+TAG.length).split("\n")[0]||"")));
    if(!r||r.version!==2||typeof r.instance!=="string"||r.instance.length>128||!/^[0-9-]+$/.test(r.instance)||typeof r.was3D!=="boolean"||!r.slots||!(r.shared instanceof Array)||r.shared.length>6)throw new Error("Identidade das fases inválida.");
    for(var i=0;i<ROLES.length;i++){var s=r.slots[ROLES[i]];if(!s)continue;
      if(!s.meta||!lib.definition({presetId:s.presetId})||s.meta.presetId!==s.presetId||s.meta.markerInstance!==r.instance||lib.validate(s.meta.options))throw new Error("Receita da fase inválida.");
      if(s.meta.options.phase!==ROLES[i]||s.meta.instance!==r.instance+"-"+(ROLES[i]==="in"?1:2)||!(s.meta.effects instanceof Array)||!(s.meta.expressions instanceof Array)||!(s.meta.animators instanceof Array)||!(s.meta.masks instanceof Array))throw new Error("Vínculos da fase inválidos.");
      var groups=[s.meta.effects,s.meta.animators,s.meta.masks],owned="Moti.on "+s.meta.instance+" · ",names=/** @type {any} */ ({});
      for(var g=0;g<groups.length;g++){if(groups[g].length>64)throw new Error("Limite de controles excedido.");for(var n=0;n<groups[g].length;n++){var record=groups[g][n];if(!record||typeof record.name!=="string"||record.name.indexOf(owned)!==0||record.name.length>240||typeof record.matchName!=="string"||names[record.name])throw new Error("Identidade de controle inválida.");names[record.name]=true;}}
      if(s.meta.expressions.length>64)throw new Error("Limite de expressões excedido.");
      for(n=0;n<s.meta.expressions.length;n++){record=s.meta.expressions[n];if(!record||!(record.path instanceof Array)||record.path.length<2||record.path.length>12||record.original!==""||typeof record.enabled!=="boolean")throw new Error("Expressão de fase inválida.");
        var named=record.path[0]==="ADBE Text Properties"&&record.path[1]==="ADBE Text Animators"?record.path[2]:record.path[1];
        if(record.path[0]!=="ADBE Effect Parade"&&record.path[0]!=="ADBE Text Properties"&&record.path[0]!=="ADBE Mask Parade")throw new Error("Propriedade de fase inválida.");
        if(record.path[1]!=="ADBE Text Document"&&!names[named])throw new Error("Vínculo de expressão inválido.");}
    }
    var transforms=/** @type {any} */ ({"ADBE Position":true,"ADBE Scale":true,"ADBE Rotate X":true,"ADBE Rotate Y":true,"ADBE Rotate Z":true,"ADBE Opacity":true}),seen=/** @type {any} */ ({});
    for(i=0;i<r.shared.length;i++){var shared=r.shared[i];if(!shared||!(shared.path instanceof Array)||shared.path.length!==2||shared.path[0]!==TR||!transforms[shared.path[1]]||seen[shared.path[1]]||shared.expression!==""||typeof shared.managed!=="string"||shared.managed.indexOf(prefix(r))!==0)throw new Error("Transformação original inválida.");seen[shared.path[1]]=true;}
    return r;
  }
  /** @param {any} layer @param {any} root */
  function save(layer,root){var text=String(layer.comment||""),at=text.indexOf(TAG);if(at>=0){var end=text.indexOf("\n",at);text=text.substring(0,at>0&&text.charAt(at-1)==="\n"?at-1:at)+(end<0?"":text.substring(end));}layer.comment=text+(root?(text?"\n":"")+TAG+encodeURIComponent(MotionJson.stringify(root)):"");}
  /** @param {any} layer @param {any} root @returns {MotionCommandFailure|null} */
  function ownership(layer,root){
    for(var i=0;i<root.shared.length;i++){var p=lib.locate(layer,root.shared[i].path);if(!p||p.expression!==root.shared[i].managed)return fail("Uma expressão compartilhada foi alterada. Desfaça a alteração antes de editar.",MotionContracts.ERROR.EXPRESSION_CONFLICT);}
    for(i=0;i<ROLES.length;i++){var s=root.slots[ROLES[i]];if(s){var e=lib.verifyOwnership(layer,s.meta);if(e)return e;}}
    return null;
  }
  /** @param {any} layer @param {any} root @returns {any} */
  function cues(layer,root){return lib.markerState(layer,root);}
  /** @param {any} layer @param {any} root @returns {any[]} */
  function captureCues(layer,root){return lib.snapshotMarkers(layer,root);}
  /** Each split cue receives a fresh value; never mutate the rollback snapshot.
   * @param {any} source @returns {any} */
  function cloneCue(source){var value=/** @type {any} */ (new MarkerValue(source.comment)),fields=/** @type {any[]} */ (["chapter","url","frameTarget","duration","cuePointName","eventCuePoint","label","protectedRegion"]);
    for(var i=0;i<fields.length;i++)if(typeof source[fields[i]]!=="undefined")value[fields[i]]=source[fields[i]];
    value.setParameters(source.getParameters());return value;
  }
  /** Preserve arbitrary marker payloads; merge a coincident In/Out cue. @param {any} layer @param {any} root @param {any} times @param {any[]} previous */
  function writeCues(layer,root,times,previous){
    var p=layer.property("ADBE Marker");lib.removeMarkers(layer,root);
    var list=/** @type {any[]} */ ([]),a=times.inTime,b=times.outTime;
    if(a!==null&&b!==null&&Math.abs(a-b)<.000001)list.push({time:a,role:"both"});else{if(a!==null)list.push({time:a,role:"in"});if(b!==null)list.push({time:b,role:"out"});}
    for(var i=0;i<list.length;i++){var item=/** @type {any} */ (list[i]),value=/** @type {any} */ (new MarkerValue(item.role==="both"?"Moti.on In / Out":item.role==="in"?"Moti.on In":"Moti.on Out"));
      for(var j=0;j<previous.length;j++){var params=previous[j].value.getParameters(),role=params["Moti.on.phase"];if(role===item.role||role==="both"){value=cloneCue(previous[j].value);break;}}
      params=value.getParameters();params["Moti.on.instance"]=root.instance;params["Moti.on.phase"]=item.role;value.setParameters(params);p.setValueAtTime(item.time,value);
    }
  }
  /** @param {any} layer @param {any} root @param {any} times @returns {MotionCommandFailure|null} */
  function checkCues(layer,root,times){
    var p=layer.property("ADBE Marker"),state=cues(layer,root),fd=layer.containingComp.frameDuration;
    if(!p||typeof MarkerValue==="undefined")return fail("Marcadores indisponíveis nesta camada.",MotionContracts.ERROR.CAPABILITY_UNAVAILABLE);
    if(state.duplicate)return fail("Há marcadores de fase duplicados.");
    if(p.numKeys-state.count+(times.inTime!==null?1:0)+(times.outTime!==null?1:0)>250)return fail("A camada excederia 250 marcadores.");
    if(times.inTime!==null&&(times.inTime<layer.inPoint+fd-.000001||times.inTime>layer.outPoint+.000001))return fail("A entrada deve permanecer dentro dos limites da camada.");
    if(times.outTime!==null&&(times.outTime>layer.outPoint-fd+.000001||times.outTime<layer.inPoint-.000001))return fail("A saída deve permanecer dentro dos limites da camada.");
    if(times.inTime!==null&&times.outTime!==null&&times.inTime>times.outTime+.000001)return fail("A entrada e a saída não podem se sobrepor.");
    for(var i=1;i<=p.numKeys;i++){var params=p.keyValue(i).getParameters();if(params["Moti.on.instance"]===root.instance)continue;
      if((times.inTime!==null&&Math.abs(p.keyTime(i)-times.inTime)<.000001)||(times.outTime!==null&&Math.abs(p.keyTime(i)-times.outTime)<.000001))return fail("Um marcador existente ocupa esse frame.",MotionContracts.ERROR.KEYFRAME_CONFLICT);
    }return null;
  }
  /** @param {any} layer @param {any} comp @param {any} root @returns {any} */
  function read(layer,comp,root){
    var phases=/** @type {any[]} */ ([]),current=cues(layer,root),byRole=/** @type {any} */ ({});
    for(var i=0;i<ROLES.length;i++){var role=ROLES[i],s=root.slots[role];if(!s)continue;var value=lib.inspectLayer(layer,comp,s.meta);if(value.state!=="ready")return value;
      byRole[role]={presetId:s.presetId,instance:s.meta.instance,options:value.options,controls:controls(s.meta)};phases.push({phase:role,presetId:s.presetId,instance:s.meta.instance,options:value.options,controls:byRole[role].controls,markerTime:role==="in"?current.inTime:current.outTime});
    }
    if(!phases.length)return {state:"conflict",message:"Nenhuma fase válida foi encontrada."};
    var fp=MotionJson.stringify({instance:root.instance,phases:byRole,inPoint:layer.inPoint,outPoint:layer.outPoint,markers:current,frameRate:comp.frameRate,dropFrame:!!comp.dropFrame});
    return {state:"ready",message:"",layerName:layer.name,presetId:phases[0]&&phases[0].presetId,options:phases[0]&&phases[0].options,phases:phases,frameRate:comp.frameRate,dropFrame:comp.dropFrame,target:{compId:comp.id,layerId:layer.id,instance:root.instance,fingerprint:fp}};
  }
  /** @param {any} meta @returns {any[]} */
  function controls(meta){var spec=/** @type {any} */ ({durationFrames:[1,600,"frames"],intensity:[0,300,"%"],staggerFrames:[0,60,"frames"],elasticity:[0,100,"%"],overlap:[0,100,"%"],speed:[25,200,"%"],seed:[0,9999,""]}),names=/** @type {any} */ ({durationFrames:meta.effects[0].name,intensity:meta.effects[1].name,staggerFrames:meta.effects[2].name}),out=[];if(meta.controls)for(var k in meta.controls)if(Object.prototype.hasOwnProperty.call(meta.controls,k))names[k]=meta.controls[k];for(k in names)if(Object.prototype.hasOwnProperty.call(names,k)&&spec[k])out.push({key:k,name:names[k],type:"number",min:spec[k][0],max:spec[k][1],unit:spec[k][2]});return out;}

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
  function erase(layer,root){for(var i=0;i<ROLES.length;i++)if(root.slots[ROLES[i]])lib.removeLayer(layer,root.slots[ROLES[i]].meta,true);lib.restore(layer,root.shared);lib.removeMarkers(layer,root);save(layer,null);layer.threeDLayer=root.was3D;}
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
      else if(old){e=lib.verifyOwnership(layer,old);var legacy=lib.inspectLayer(layer,comp);if(legacy.state!=="ready")return {error:fail(legacy.message)};if(lib.definition({presetId:old.presetId}).mode!=="transition")return {error:fail("Remova o efeito contínuo antes de aplicar uma entrada ou saída.")};old.options=legacy.options;old.options.presetId=old.presetId;}
      if(e)return {error:e};
      var rootId=root?root.instance:String(new Date().getTime())+"-"+layer.id+"-"+(++serial),state=root?cues(layer,root):old?cues(layer,old):{inTime:null,outTime:null};
      batch.push({layer:layer,root:root,old:old,rootId:rootId,state:state,comment:String(layer.comment||""),was3D:layer.threeDLayer,markers:root?captureCues(layer,root):old?captureCues(layer,old):[]});
    }return {error:null,comp:comp,batch:batch};
  }
  /** @param {any} args @param {string} action @returns {any} */
  function preflight(args,action){
    var allowed=/** @type {any} */ (action==="apply"?null:action==="adjust"?{target:true,phase:true,presetId:true,options:true}:action==="timing"?{target:true,phase:true,frames:true}:{target:true,phase:true,action:true});
    if(allowed)for(var key in args)if(Object.prototype.hasOwnProperty.call(args,key)&&!allowed[key])return fail("Parâmetro de fase desconhecido.");
    if(action==="apply"){var invalid=lib.validate(args);if(invalid)return invalid;if(lib.definition(args).mode!=="transition")return fail("Escolha uma receita de entrada/saída.");}
      else{if(args.phase!=="in"&&args.phase!=="out")return fail("Escolha Entrada ou Saída.");if(action==="adjust"){if(!args.options||args.options.phase!==args.phase)return fail("Os parâmetros pertencem a outra fase.");var adjusted=clone(args.options);adjusted.presetId=args.presetId;invalid=lib.validate(adjusted);if(invalid)return invalid;}
      if(action==="action"&&args.action!=="remove"&&args.action!=="reset")return fail("Ação de fase inválida.");
      if(action==="timing"&&(typeof args.frames!=="number"||!isFinite(args.frames)||Math.floor(args.frames)!==args.frames||Math.abs(args.frames)>600))return fail("Use um deslocamento inteiro de até 600 frames.");}
    var prepared=prepare(args,action!=="apply");if(prepared.error)return prepared.error;
    for(var i=0;i<prepared.batch.length;i++){var q=prepared.batch[i],slots=q.root?q.root.slots:null,legacyPhase=q.old?q.old.options.phase:null;
      if(action!=="apply"&&!((slots&&slots[args.phase])||(q.old&&(legacyPhase===args.phase||legacyPhase==="both"))))return fail("Essa fase não está aplicada à camada.");
      if(action==="adjust"&&args.presetId!==(slots?slots[args.phase].presetId:q.old.presetId))return fail("A receita da fase mudou. Recarregue antes de ajustar.");
      var options=action==="apply"?clone(args):action==="adjust"?clone(args.options):action==="action"&&args.action==="reset"?defaults(slots?slots[args.phase].presetId:q.old.presetId,args.phase):null;if(options&&action!=="action")options.presetId=args.presetId;
      if(options){var owner={prefixes:q.root?[prefix(q.root)]:q.old?["// Moti.on preset v1:"+q.old.instance+"\n"]:[]};var e=lib.preflight(options,"apply",true,[q.layer],owner);if(e)return e;}
      var times={inTime:q.state.inTime,outTime:q.state.outTime},fd=prepared.comp.frameDuration;
      if(options)for(var phaseIndex=0;phaseIndex<ROLES.length;phaseIndex++){var phaseRole=ROLES[phaseIndex];if(options.phase===phaseRole||options.phase==="both")times[phaseRole==="in"?"inTime":"outTime"]=phaseTime(q,phaseRole,options,action==="action");}
      if(action==="timing")times[args.phase==="in"?"inTime":"outTime"]+=args.frames*fd;
      if(action==="action"&&args.action==="remove")times[args.phase==="in"?"inTime":"outTime"]=null;
      // During lazy migration the old instance is accepted only as owned here.
      e=checkCues(q.layer,q.root||q.old||{instance:q.rootId},times);if(e)return e;
    }return null;
  }
  /** @param {string} id @param {string} role @returns {any} */
  function defaults(id,role){var p=lib.definition({presetId:id}),v=/** @type {any} */ ({presetId:id,phase:role,direction:"preset",durationFrames:24,intensity:100,staggerFrames:2,unit:"preset",easing:"preset",order:"preset",seed:17,elasticity:30,overlap:65,speed:100});if(p.defaults)for(var key in p.defaults)if(Object.prototype.hasOwnProperty.call(p.defaults,key))v[key]=p.defaults[key];v.presetId=id;v.phase=role;return v;}
  /** Keep hand-positioned cues when changing any parameter except duration/recipe.
   * @param {any} q @param {string} role @param {any} options @param {boolean} reset @returns {number} */
  function phaseTime(q,role,options,reset){var old=q.root&&q.root.slots[role],prior=old?old.meta.options:q.old&&q.old.options,cue=q.state[role==="in"?"inTime":"outTime"],id=old?old.presetId:q.old&&q.old.presetId;if(!reset&&prior&&id===options.presetId&&prior.durationFrames===options.durationFrames&&cue!==null)return cue;var duration=Math.min(options.durationFrames*q.layer.containingComp.frameDuration,(q.layer.outPoint-q.layer.inPoint)/(options.phase==="both"?2:1));return role==="in"?q.layer.inPoint+duration:q.layer.outPoint-duration;}
  /** @param {any} q @returns {any} */
  function migrate(q){if(q.root)return q.root;var root={version:2,instance:q.rootId,was3D:q.old?q.old.was3D:q.was3D,shared:[],slots:/** @type {any} */ ({})};
    if(q.old){var old=q.old;lib.removeLayer(q.layer,old);for(var i=0;i<ROLES.length;i++)if(old.options.phase===ROLES[i]||old.options.phase==="both")root.slots[ROLES[i]]=newSlot(root,ROLES[i],old.presetId,old.options);}
    return root;
  }
  /** @param {any} root @param {string} role @param {string} id @param {any} options @returns {any} */
  function newSlot(root,role,id,options){var args=clone(options);args.phase=role;args.presetId=id;return {presetId:id,meta:{version:1,instance:root.instance+"-"+(role==="in"?1:2),presetId:id,was3D:root.was3D,options:args,markerInstance:root.instance,markerVersion:1,markerDurationFrames:args.durationFrames,expressions:[],effects:[],animators:[],masks:[]}};}
  /** @param {any} args @param {any} context @param {string} action @returns {MotionCommandResult} */
  function run(args,context,action){
    var error=preflight(args,action);if(error)throw new Error(error.message);var prepared=prepare(args,action!=="apply"),done=/** @type {any[]} */ ([]),plans=/** @type {any[]} */ ([]);
    try{for(var i=0;i<prepared.batch.length;i++){
      var q=prepared.batch[i],oldRoot=q.root?clone(q.root):null,root=migrate(q),components=/** @type {any[]} */ ([]),times={inTime:q.state.inTime,outTime:q.state.outTime};done.push({q:q,root:root,oldRoot:oldRoot});
      if(action==="timing"){times[args.phase==="in"?"inTime":"outTime"]+=args.frames*prepared.comp.frameDuration;}
      else if(action==="action"&&args.action==="remove"){lib.removeLayer(q.layer,root.slots[args.phase].meta,true);delete root.slots[args.phase];times[args.phase==="in"?"inTime":"outTime"]=null;}
      else{var values=action==="apply"?args:action==="adjust"?clone(args.options):clone(root.slots[args.phase].meta.options),id=action==="apply"?args.presetId:action==="adjust"?args.presetId:root.slots[args.phase].presetId;
        if(action==="action")values=defaults(id,args.phase);values.presetId=id;
        for(var r=0;r<ROLES.length;r++){var role=ROLES[r];if(values.phase!==role&&values.phase!=="both")continue;var prior=root.slots[role];if(prior)lib.removeLayer(q.layer,prior.meta,true);root.slots[role]=newSlot(root,role,id,values);if(prior&&action!=="action"&&prior.presetId===id&&prior.meta.options.durationFrames===values.durationFrames)root.slots[role].meta.markerDurationFrames=prior.meta.markerDurationFrames;times[role==="in"?"inTime":"outTime"]=phaseTime(q,role,values,action==="action");}
      }
      lib.restore(q.layer,root.shared);
      for(r=0;r<ROLES.length;r++)if(root.slots[ROLES[r]])renderSlot(q.layer,root,ROLES[r],context,components,plans);
      combine(q.layer,root,components);writeCues(q.layer,root,times,q.markers);
      // Shared entries no longer used are restored, then removed from metadata.
      var retained=[];for(r=0;r<root.shared.length;r++)if(root.shared[r].managed)retained.push(root.shared[r]);root.shared=retained;
      if(!root.slots.in&&!root.slots.out){save(q.layer,null);q.layer.threeDLayer=root.was3D;}else save(q.layer,root);
    }}catch(problem){var failed=false;
      for(i=plans.length-1;i>=0;i--){try{var plan=plans[i];lib.restore(plan.layer,plan.snapshots);for(var j=plan.created.length-1;j>=0;j--){var item=plan.created[j],g=lib.locate(plan.layer,item.group),e=lib.child(g,item.name);if(e)e.remove();}}catch(partialError){failed=true;}}
      for(i=done.length-1;i>=0;i--)try{var d=/** @type {any} */ (done[i]);erase(d.q.layer,d.root);d.q.layer.comment=d.q.comment;d.q.layer.threeDLayer=d.q.was3D;
        if(d.oldRoot){components=[];for(r=0;r<ROLES.length;r++)if(d.oldRoot.slots[ROLES[r]])renderSlot(d.q.layer,d.oldRoot,ROLES[r],context,components,[]);combine(d.q.layer,d.oldRoot,components);save(d.q.layer,d.oldRoot);lib.restoreMarkers(d.q.layer,d.oldRoot,d.q.markers);}
        else if(d.q.old){var m=d.q.old;lib.applyLayer({layer:d.q.layer,comp:prepared.comp,p:lib.definition({presetId:m.presetId}),args:m.options,meta:m,created:[],snapshots:[],locale:context.locale||"pt-BR",rect:d.q.layer.sourceRectAtTime((d.q.layer.inPoint+d.q.layer.outPoint)/2,false)});lib.restoreMarkers(d.q.layer,m,d.q.markers);d.q.layer.comment=d.q.comment;}
      }catch(rollbackError){failed=true;}
      if(failed){var failure=/** @type {any} */ (new Error("Falha ao restaurar as fases; use Desfazer."));failure.motionCode=MotionContracts.ERROR.ROLLBACK_FAILED;throw failure;}throw problem;
    }return {changed:true,data:{appliedCount:prepared.batch.length,phase:args.phase},warnings:[]};
  }
  MotionRegistry.register("ae.presets.phase-apply",{preflight:function(args){return preflight(args,"apply");},run:function(args,context){return run(args,context,"apply");}});
  MotionRegistry.register("ae.presets.phase-adjust",{preflight:function(args){return preflight(args,"adjust");},run:function(args,context){return run(args,context,"adjust");}});
  MotionRegistry.register("ae.presets.phase-action",{preflight:function(args){return preflight(args,"action");},run:function(args,context){return run(args,context,"action");}});
  MotionRegistry.register("ae.presets.phase-timing",{preflight:function(args){return preflight(args,"timing");},run:function(args,context){return run(args,context,"timing");}});
  global.MotionPresetPhases={has:has,inspectLayer:inspectLayer,metadata:metadata,contribution:contribution};
}($.global));
