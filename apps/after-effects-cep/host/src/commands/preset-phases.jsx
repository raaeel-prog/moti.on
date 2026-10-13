/** Independent entrance/exit instances. All recipe code comes from the bundled
 * library; stored expressions are compared for ownership, never executed. */
(function(global){
  /* global MarkerValue */
  var lib=/** @type {any} */ (global).MotionPresetLibrary,TAG="[Moti.on.library.v3]",LEGACY_TAG="[Moti.on.library.v2]",TR="ADBE Transform Group",ROLES=/** @type {any} */ (["in","out"]),serial=0;
  /** @param {string} message @param {string=} code @returns {MotionCommandFailure} */
  function fail(message,code){return {code:code||MotionContracts.ERROR.INVALID_PRESET,message:message,recoverable:true,details:null};}
  /** @param {any} value @returns {any} */
  function clone(value){return MotionJson.parse(MotionJson.stringify(value));}
  /** @param {any} layer @returns {boolean} */
  function has(layer){var text=String(layer.comment||"");return text.indexOf(TAG)>=0||text.indexOf(LEGACY_TAG)>=0;}
  /** @param {any} root @returns {string} */
  function prefix(root){return "// Moti.on phases v"+(root.sharedVersion||root.version)+":"+root.instance+"\n";}
  /** @param {any} layer @returns {any} */
  function metadata(layer){
    var text=String(layer.comment||""),tag=text.indexOf(TAG)>=0?TAG:LEGACY_TAG,at=text.indexOf(tag);if(at<0)return null;
    var r=clone(MotionJson.parse(decodeURIComponent(text.substring(at+tag.length).split("\n")[0]||"")));
    if(!r||(r.version!==2&&r.version!==3)||r.version!== (tag===TAG?3:2)||typeof r.instance!=="string"||r.instance.length>128||!/^[0-9-]+$/.test(r.instance)||typeof r.was3D!=="boolean"||!r.slots||!(r.shared instanceof Array)||r.shared.length>6)throw new Error("Identidade das fases inválida.");
    var roles=r.version===3?["in","out","effect"]:ROLES;
    for(var i=0;i<roles.length;i++){var role=roles[i],s=role==="effect"?r.textEffect:r.slots[role];if(!s)continue;
      if(!s.meta||!lib.definition({presetId:s.presetId})||s.meta.presetId!==s.presetId||(role!=="effect"&&s.meta.markerInstance!==r.instance)||lib.validate(s.meta.options))throw new Error("Receita da fase inválida.");
      if((role!=="effect"&&s.meta.options.phase!==role)||(role==="effect"&&(!isTextEffect({presetId:s.presetId})||s.meta.markerVersion!==undefined))||s.meta.instance!==r.instance+"-"+(role==="in"?1:role==="out"?2:3)||!(s.meta.effects instanceof Array)||!(s.meta.expressions instanceof Array)||!(s.meta.animators instanceof Array)||!(s.meta.masks instanceof Array))throw new Error("Vínculos da fase inválidos.");
      var groups=[s.meta.effects,s.meta.animators,s.meta.masks],owned="Moti.on "+s.meta.instance+" · ",names=/** @type {any} */ ({});
      for(var g=0;g<groups.length;g++){if(groups[g].length>64)throw new Error("Limite de controles excedido.");for(var n=0;n<groups[g].length;n++){var record=groups[g][n];if(!record||typeof record.name!=="string"||record.name.indexOf(owned)!==0||record.name.length>240||typeof record.matchName!=="string"||names[record.name])throw new Error("Identidade de controle inválida.");names[record.name]=true;}}
      if(s.meta.expressions.length>64)throw new Error("Limite de expressões excedido.");
      for(n=0;n<s.meta.expressions.length;n++){record=s.meta.expressions[n];if(!record||!(record.path instanceof Array)||record.path.length<2||record.path.length>12||record.original!==""||typeof record.enabled!=="boolean")throw new Error("Expressão de fase inválida.");
        var named=record.path[0]==="ADBE Text Properties"&&record.path[1]==="ADBE Text Animators"?record.path[2]:record.path[1];
        if(record.path[0]!=="ADBE Effect Parade"&&record.path[0]!=="ADBE Text Properties"&&record.path[0]!=="ADBE Mask Parade")throw new Error("Propriedade de fase inválida.");
        if(record.path[1]!=="ADBE Text Document"&&!names[named])throw new Error("Vínculo de expressão inválido.");}
    }
    if(r.sharedVersion!==undefined&&r.sharedVersion!==2&&r.sharedVersion!==3)throw new Error("Versão das transformações inválida.");
    if(r.textState){var ts=r.textState;if(typeof ts.perChar3D!=="boolean"||typeof ts.managedPerChar3D!=="boolean"||typeof ts.grouping!=="number"||ts.grouping<1||ts.grouping>4||typeof ts.managedGrouping!=="number"||ts.managedGrouping<1||ts.managedGrouping>4)throw new Error("Estado de texto inválido.");}
    var transforms=/** @type {any} */ ({"ADBE Position":true,"ADBE Scale":true,"ADBE Rotate X":true,"ADBE Rotate Y":true,"ADBE Rotate Z":true,"ADBE Opacity":true}),seen=/** @type {any} */ ({});
    for(i=0;i<r.shared.length;i++){var shared=r.shared[i];if(!shared||!(shared.path instanceof Array)||shared.path.length!==2||shared.path[0]!==TR||!transforms[shared.path[1]]||seen[shared.path[1]]||shared.expression!==""||typeof shared.managed!=="string"||shared.managed.indexOf(prefix(r))!==0)throw new Error("Transformação original inválida.");seen[shared.path[1]]=true;}
    return r;
  }
  /** @param {any} layer @param {any} root */
  function save(layer,root){var text=String(layer.comment||""),tags=/** @type {any[]} */ ([TAG,LEGACY_TAG]);for(var i=0;i<tags.length;i++){var at=text.indexOf(tags[i]);if(at>=0){var end=text.indexOf("\n",at);text=text.substring(0,at>0&&text.charAt(at-1)==="\n"?at-1:at)+(end<0?"":text.substring(end));}}layer.comment=text+(root?(text?"\n":"")+(root.version===2?LEGACY_TAG:TAG)+encodeURIComponent(MotionJson.stringify(root)):"");}
  /** @param {any} layer @param {any} root @returns {MotionCommandFailure|null} */
  function ownership(layer,root){
    for(var i=0;i<root.shared.length;i++){var p=lib.locate(layer,root.shared[i].path);if(!p||p.expression!==root.shared[i].managed)return fail("Uma expressão compartilhada foi alterada. Desfaça a alteração antes de editar.",MotionContracts.ERROR.EXPRESSION_CONFLICT);}
    for(i=0;i<ROLES.length;i++){var s=root.slots[ROLES[i]];if(s){var e=lib.verifyOwnership(layer,s.meta);if(e)return e;}}
    if(root.textEffect){var effectError=lib.verifyOwnership(layer,root.textEffect.meta);if(effectError)return effectError;}
    if(root.textState){var grouping=groupingProperty(layer),ts=root.textState;if(!grouping||grouping.numKeys||grouping.expression||grouping.value!==ts.managedGrouping||layer.threeDPerChar!==ts.managedPerChar3D)return fail("O agrupamento ou o modo 3D do texto mudou. Restaure a configuração antes de editar.",MotionContracts.ERROR.EXPRESSION_CONFLICT);}
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
    var textEffect=/** @type {any} */ (null);if(root.textEffect){var effectValue=lib.inspectLayer(layer,comp,root.textEffect.meta);if(effectValue.state!=="ready")return effectValue;textEffect={presetId:root.textEffect.presetId,instance:root.textEffect.meta.instance,options:effectValue.options,controls:controls(root.textEffect.meta)};}
    if(!phases.length&&!textEffect)return {state:"conflict",message:"Nenhuma fase válida foi encontrada."};
    var fp=MotionJson.stringify({instance:root.instance,phases:byRole,textEffect:textEffect,inPoint:layer.inPoint,outPoint:layer.outPoint,markers:current,frameRate:comp.frameRate,dropFrame:!!comp.dropFrame});
    return {state:"ready",message:"",layerName:layer.name,presetId:phases.length?phases[0].presetId:textEffect.presetId,options:phases.length?phases[0].options:textEffect.options,phases:phases,textEffect:textEffect||undefined,frameRate:comp.frameRate,dropFrame:comp.dropFrame,target:{compId:comp.id,layerId:layer.id,instance:root.instance,fingerprint:fp}};
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
    var s=role==="effect"?root.textEffect:root.slots[role],m=s.meta,p=lib.definition({presetId:s.presetId});if(role!=="effect")m.markerInstance=root.instance;
    // Masked recipes need the text bounds; mid-layer is at rest between the phases.
    var plan={layer:layer,comp:layer.containingComp,p:p,args:m.options,meta:m,created:[],snapshots:[],locale:context.locale||"pt-BR",deferMetadata:true,deferMarkers:true,rect:layer.sourceRectAtTime((layer.inPoint+layer.outPoint)/2,false)};plans.push(plan);lib.applyLayer(plan);
    var retained=[];for(var i=0;i<m.expressions.length;i++){var item=m.expressions[i];if(item.path[0]!==TR){retained.push(item);continue;}
      var prop=lib.locate(layer,item.path),known=false;for(var j=0;j<root.shared.length;j++)if(MotionJson.stringify(root.shared[j].path)===MotionJson.stringify(item.path))known=true;
      if(!known){var base=lib.snapshot(prop);base.expression=item.original;base.enabled=item.enabled;root.shared.push(base);}
      components.push({path:item.path,expression:prop.expression});
    }m.expressions=retained;
  }
  /** @param {any} layer @param {any} root */
  function erase(layer,root){if(root.textEffect)lib.removeLayer(layer,root.textEffect.meta,true);for(var i=0;i<ROLES.length;i++)if(root.slots[ROLES[i]])lib.removeLayer(layer,root.slots[ROLES[i]].meta,true);lib.restore(layer,root.shared);lib.removeMarkers(layer,root);save(layer,null);restoreTextState(layer,root);layer.threeDLayer=root.was3D;}
  /** @param {any} args @param {boolean=} targeted @returns {any} */
  function prepare(args,targeted){
    var comp=app.project&&app.project.activeItem;if(!comp||!(comp instanceof CompItem))return {error:fail("Abra uma composição.",MotionContracts.ERROR.NO_ACTIVE_COMP)};
    var layers=/** @type {any[]} */ (comp.selectedLayers);if(!layers.length||layers.length>50)return {error:fail("Selecione de uma a 50 camadas.",MotionContracts.ERROR.INVALID_SELECTION_TYPE)};
    if(targeted){if(layers.length!==1)return {error:fail("Selecione uma camada para editar uma fase.")};var inspection=has(layers[0])?inspectLayer(layers[0],comp):lib.inspectLayer(layers[0],comp),t=args.target;if(!t||inspection.state!=="ready"||inspection.target.compId!==t.compId||inspection.target.layerId!==t.layerId||inspection.target.instance!==t.instance||inspection.target.fingerprint!==t.fingerprint)return {error:fail("A seleção ou os controles mudaram. Recarregue antes de editar.")};}
    var batch=[];
    for(var i=0;i<layers.length;i++){
      var layer=/** @type {any} */ (layers[i]),root,old,e=null;
      if(layer.locked)return {error:fail("Desbloqueie a camada para editar.",MotionContracts.ERROR.INVALID_SELECTION_TYPE)};
      try{root=metadata(layer);old=root?null:lib.metadata(layer);}catch(error){return {error:fail("Os metadados do preset estão incompletos.")};}
      if(root){e=ownership(layer,root);if(!e){var now=read(layer,comp,root);if(now.state!=="ready")return {error:fail(now.message)};for(var n=0;n<now.phases.length;n++){var entry=now.phases[n];root.slots[entry.phase].meta.options.presetId=entry.presetId;for(var key in entry.options)if(Object.prototype.hasOwnProperty.call(entry.options,key))root.slots[entry.phase].meta.options[key]=entry.options[key];}if(now.textEffect){root.textEffect.meta.options=clone(now.textEffect.options);root.textEffect.meta.options.presetId=now.textEffect.presetId;}}}
      else if(old){e=lib.verifyOwnership(layer,old);var legacy=lib.inspectLayer(layer,comp);if(legacy.state!=="ready")return {error:fail(legacy.message)};if(lib.definition({presetId:old.presetId}).mode!=="transition"&&!isTextEffect({presetId:old.presetId}))return {error:fail("Remova o efeito contínuo antes de aplicar uma entrada ou saída.")};old.options=legacy.options;old.options.presetId=old.presetId;}
      if(e)return {error:e};
      var rootId=root?root.instance:String(new Date().getTime())+"-"+layer.id+"-"+(++serial),state=root?cues(layer,root):old?cues(layer,old):{inTime:null,outTime:null};
      batch.push({layer:layer,root:root,old:old,rootId:rootId,state:state,comment:String(layer.comment||""),was3D:layer.threeDLayer,perChar3D:layer.threeDPerChar,grouping:groupingProperty(layer)?groupingProperty(layer).value:null,markers:root?captureCues(layer,root):old?captureCues(layer,old):[]});
    }return {error:null,comp:comp,batch:batch};
  }
  /** @param {any} layer @returns {any} */
  function groupingProperty(layer){var text=layer.property("ADBE Text Properties"),more=text&&text.property("ADBE Text More Options");return more&&more.property("ADBE Text Anchor Point Option");}
  /** @param {any} args @returns {boolean} */
  function isTextEffect(args){var p=lib.definition(args);return !!p&&p.category==="text-effects"&&p.mode==="continuous";}
  /** @param {any} root @returns {any[]} */
  function slotList(root){var out=[];if(root){if(root.slots.in)out.push(root.slots.in);if(root.slots.out)out.push(root.slots.out);if(root.textEffect)out.push(root.textEffect);}return out;}
  /** Derive one shared grouping and the per-character 3D gate before mutation.
   * @param {any} root @returns {any} */
  function textDemand(root){var list=slotList(root),group=null,threeD=false;
    for(var i=0;i<list.length;i++){var p=lib.definition({presetId:list[i].presetId});if(!p||p.category.indexOf("text-")!==0)continue;
      if(p.text.dimension==="3d")threeD=true;
      if(p.collection!=="text"&&p.text.grouping===undefined)continue;
      if(!p.rotation[0]&&!p.rotation[1]&&!p.rotation[2]&&!p.scale[0]&&!p.scale[1]&&!p.scale[2]&&!p.text.pivot)continue;
      var opts=list[i].meta.options,unit=p.text.grouping||(opts.unit==="preset"?p.text.unit:opts.unit),value=unit==="words"?2:unit==="lines"?3:unit==="all"?4:1;
      if(group!==null&&group!==value)return {error:fail("Estas receitas precisam de agrupamentos de pivô diferentes. Use o mesmo agrupamento para entrada, saída e efeito.",MotionContracts.ERROR.EXPRESSION_CONFLICT)};group=value;
    }return {error:null,group:group,threeD:threeD};
  }
  /** @param {any} layer @param {any} root @param {any=} previous @returns {MotionCommandFailure|null} */
  function textPreflight(layer,root,previous){var demand=textDemand(root);if(demand.error)return demand.error;if(!demand.threeD&&demand.group===null)return null;
    if(demand.threeD&&typeof layer.threeDPerChar!=="boolean")return fail("O host não oferece texto 3D por caractere nesta camada.",MotionContracts.ERROR.CAPABILITY_UNAVAILABLE);
    var gp=groupingProperty(layer);if(demand.group!==null){if(!gp)return fail("Agrupamento de texto indisponível neste host.",MotionContracts.ERROR.CAPABILITY_UNAVAILABLE);if(gp.numKeys||gp.expression)return fail("O agrupamento tem animação do usuário. Edite-o no After Effects antes de aplicar.",MotionContracts.ERROR.EXPRESSION_CONFLICT);
    }
    if((demand.group!==null&&gp.value!==demand.group)||(demand.threeD&&!layer.threeDPerChar)){var text=layer.property("ADBE Text Properties"),animators=text&&text.property("ADBE Text Animators"),owned=slotList(root).concat(slotList(previous)),names=/** @type {any} */ ({});for(var j=0;j<owned.length;j++)for(var n=0;n<owned[j].meta.animators.length;n++)names[owned[j].meta.animators[n].name]=true;
      for(j=1;animators&&j<=animators.numProperties;j++)if(!Object.prototype.hasOwnProperty.call(names,animators.property(j).name))return fail("Um animador do usuário usa o agrupamento ou o modo 3D atual. Preserve essa configuração ou use outra camada.",MotionContracts.ERROR.EXPRESSION_CONFLICT);
    }return null;
  }
  /** @param {any} layer @param {any} root */
  function restoreTextState(layer,root){if(!root.textState)return;var ts=root.textState,gp=groupingProperty(layer);if(gp)gp.setValue(ts.grouping);layer.threeDPerChar=ts.perChar3D;}
  /** Only the last component restores the original layer-level text state.
   * @param {any} layer @param {any} root */
  function configureText(layer,root){var demand=textDemand(root);if(demand.error)throw new Error(demand.error.message);var gp=groupingProperty(layer);
    if(!root.textState&&(demand.threeD||demand.group!==null))root.textState={perChar3D:!!layer.threeDPerChar,grouping:gp?gp.value:1,managedPerChar3D:!!layer.threeDPerChar,managedGrouping:gp?gp.value:1};
    if(root.textState){var ts=root.textState;if(demand.group!==null){gp.setValue(demand.group);ts.managedGrouping=demand.group;}if(demand.threeD){layer.threeDPerChar=true;ts.managedPerChar3D=true;}}
  }
  /** @param {any} q @param {string} role @param {any} options @returns {any} */
  function candidate(q,role,options){var root=q.root?clone(q.root):{version:3,instance:q.rootId,was3D:q.was3D,slots:{},shared:[]};if(q.old){if(isTextEffect({presetId:q.old.presetId}))root.textEffect=newSlot(root,"effect",q.old.presetId,q.old.options);else for(var i=0;i<ROLES.length;i++)if(q.old.options.phase===ROLES[i]||q.old.options.phase==="both")root.slots[ROLES[i]]=newSlot(root,ROLES[i],q.old.presetId,q.old.options);}if(options){if(role==="effect")root.textEffect=newSlot(root,"effect",options.presetId,options);else for(i=0;i<ROLES.length;i++)if(options.phase===ROLES[i]||options.phase==="both")root.slots[ROLES[i]]=newSlot(root,ROLES[i],options.presetId,options);}return root;}
  /** @param {any} args @param {string} action @returns {MotionCommandFailure|null} */
  function effectPreflight(args,action){var options=null,allowed=action==="apply"?null:action==="adjust"?{target:true,presetId:true,options:true}:{target:true,action:true};
    if(allowed)for(var key in args)if(Object.prototype.hasOwnProperty.call(args,key)&&!Object.prototype.hasOwnProperty.call(allowed,key))return fail("Parâmetro de efeito desconhecido.");
    if(action==="apply")options=clone(args);else if(action==="adjust"){if(!args.options||Object.prototype.hasOwnProperty.call(args.options,"presetId"))return fail("Ajustes de efeito inválidos.");options=clone(args.options);options.presetId=args.presetId;}
    if(options){var invalid=lib.validate(options);if(invalid)return invalid;if(!isTextEffect(options))return fail("Escolha um efeito contínuo de texto.");}
    if(action==="action"&&args.action!=="remove"&&args.action!=="reset")return fail("Ação de efeito inválida.");
    var prepared=prepare(args,action!=="apply");if(prepared.error)return prepared.error;
    for(var i=0;i<prepared.batch.length;i++){var q=prepared.batch[i],slot=q.root&&q.root.textEffect,legacy=q.old&&isTextEffect({presetId:q.old.presetId})?q.old:null;
      if(action!=="apply"&&!slot&&!legacy)return fail("Esse efeito não está aplicado à camada.");
      if(action==="adjust"&&args.presetId!==(slot?slot.presetId:legacy.presetId))return fail("A receita do efeito mudou. Recarregue antes de ajustar.");
      var values=options||(args.action==="reset"?defaults(slot?slot.presetId:legacy.presetId,"both"):null);
      if(values){var owner={prefixes:q.root?[prefix(q.root)]:q.old?["// Moti.on preset v1:"+q.old.instance+"\n"]:[]},error=lib.preflight(values,"apply",true,[q.layer],owner);if(error)return error;error=textPreflight(q.layer,candidate(q,"effect",values),q.root);if(error)return error;}
    }return null;
  }
  /** @returns {boolean} */
  function hasSelected(){var comp=app.project&&app.project.activeItem;if(!comp||!(comp instanceof CompItem))return false;for(var i=0;i<comp.selectedLayers.length;i++)if(has(comp.selectedLayers[i]))return true;return false;}
  /** @param {any} args @param {string} action @returns {MotionCommandFailure|null} */
  function removePreflight(args,action){if(action==="bake")return fail("Rigs de texto e fases permanecem editáveis. Remova os componentes ou mantenha seus animadores.",MotionContracts.ERROR.CAPABILITY_UNAVAILABLE);for(var key in args)if(Object.prototype.hasOwnProperty.call(args,key)&&key!=="target"&&key!=="targets")return fail("Parâmetro de remoção desconhecido.");var ready=prepare(args,!!args.target);return ready.error;}
  /** @param {any} args @returns {MotionCommandResult} */
  function removeAll(args){return run(args,{locale:"pt-BR"},"remove-all");}
  /** @param {any} args @param {any} context @param {string} action @returns {MotionCommandResult} */
  function effectRun(args,context,action){return run(args,context,"effect-"+action);}
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
      if(options){var textError=textPreflight(q.layer,candidate(q,args.phase,options),q.root);if(textError)return textError;var owner={prefixes:q.root?[prefix(q.root)]:q.old?["// Moti.on preset v1:"+q.old.instance+"\n"]:[]};var e=lib.preflight(options,"apply",true,[q.layer],owner);if(e)return e;}
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
  /** @param {any} q @param {any} root @returns {any} */
  function migrate(q,root){if(q.root){if(q.root.version===2){q.root.sharedVersion=2;q.root.version=3;}return q.root;}
    if(q.old){var old=q.old;lib.removeLayer(q.layer,old);if(isTextEffect({presetId:old.presetId}))root.textEffect=newSlot(root,"effect",old.presetId,old.options);else for(var i=0;i<ROLES.length;i++)if(old.options.phase===ROLES[i]||old.options.phase==="both")root.slots[ROLES[i]]=newSlot(root,ROLES[i],old.presetId,old.options);}
    return root;
  }
  /** @param {any} root @param {string} role @param {string} id @param {any} options @returns {any} */
  function newSlot(root,role,id,options){var args=clone(options);args.phase=role==="effect"?"both":role;args.presetId=id;var slot=/** @type {any} */ ({presetId:id,meta:{version:1,instance:root.instance+"-"+(role==="in"?1:role==="out"?2:3),presetId:id,was3D:root.was3D,options:args,expressions:[],effects:[],animators:[],masks:[]}});if(role!=="effect"){slot.meta.markerInstance=root.instance;slot.meta.markerVersion=1;slot.meta.markerDurationFrames=args.durationFrames;}return slot;}
  /** @param {any} args @param {any} context @param {string} action @returns {MotionCommandResult} */
  function run(args,context,action){
    var isEffect=action.indexOf("effect-")===0,baseAction=isEffect?action.substring(7):action,error=isEffect?effectPreflight(args,baseAction):action==="remove-all"?removePreflight(args,"remove"):preflight(args,action);if(error){var invalid=/** @type {any} */ (new Error(error.message));invalid.motionCode=error.code;throw invalid;}var prepared=prepare(args,action!=="apply"&&action!=="effect-apply"&&action!=="remove-all"?true:!!args.target),done=/** @type {any[]} */ ([]),plans=/** @type {any[]} */ ([]);
    try{for(var i=0;i<prepared.batch.length;i++){
      var q=prepared.batch[i],oldRoot=q.root?clone(q.root):null,keepRole;
      // A rollback rebuilds the previous slots: carry the user's tuned geometry into them too.
      for(keepRole=0;oldRoot&&keepRole<ROLES.length;keepRole++){var previousSlot=q.root.slots[ROLES[keepRole]],kept=previousSlot?lib.liveValues(q.layer,previousSlot.meta):null;if(kept)oldRoot.slots[ROLES[keepRole]].meta.keep=kept;}
      var root=q.root||{version:3,sharedVersion:2,instance:q.rootId,was3D:q.old?q.old.was3D:q.was3D,shared:[],slots:/** @type {any} */ ({})},components=/** @type {any[]} */ ([]),times={inTime:q.state.inTime,outTime:q.state.outTime};
      // Register recovery before legacy removal or any other mutation.
      done.push({q:q,root:root,oldRoot:oldRoot});migrate(q,root);
      if(action==="remove-all"){if(root.textEffect){lib.removeLayer(q.layer,root.textEffect.meta,true);delete root.textEffect;}for(var rr=0;rr<ROLES.length;rr++)if(root.slots[ROLES[rr]]){lib.removeLayer(q.layer,root.slots[ROLES[rr]].meta,true);delete root.slots[ROLES[rr]];}times={inTime:null,outTime:null};}
      else if(isEffect){var effectPrior=root.textEffect;if(baseAction==="action"&&args.action==="remove"){lib.removeLayer(q.layer,effectPrior.meta,true);delete root.textEffect;}else{var effectValues=baseAction==="apply"?clone(args):baseAction==="adjust"?clone(args.options):defaults(effectPrior.presetId,"both"),effectId=baseAction==="action"?effectPrior.presetId:args.presetId;effectValues.presetId=effectId;if(effectPrior)lib.removeLayer(q.layer,effectPrior.meta,true);root.textEffect=newSlot(root,"effect",effectId,effectValues);}}
      else if(action==="timing"){times[args.phase==="in"?"inTime":"outTime"]+=args.frames*prepared.comp.frameDuration;}
      else if(action==="action"&&args.action==="remove"){lib.removeLayer(q.layer,root.slots[args.phase].meta,true);delete root.slots[args.phase];times[args.phase==="in"?"inTime":"outTime"]=null;}
      else{var values=action==="apply"?args:action==="adjust"?clone(args.options):clone(root.slots[args.phase].meta.options),id=action==="apply"?args.presetId:action==="adjust"?args.presetId:root.slots[args.phase].presetId;
        if(action==="action")values=defaults(id,args.phase);values.presetId=id;
        for(var r=0;r<ROLES.length;r++){var role=ROLES[r];if(values.phase!==role&&values.phase!=="both")continue;var prior=root.slots[role],keep=prior&&prior.presetId===id&&action!=="action"?lib.liveValues(q.layer,prior.meta):null;if(prior)lib.removeLayer(q.layer,prior.meta,true);root.slots[role]=newSlot(root,role,id,values);if(keep)root.slots[role].meta.keep=keep;if(prior&&action!=="action"&&prior.presetId===id&&prior.meta.options.durationFrames===values.durationFrames)root.slots[role].meta.markerDurationFrames=prior.meta.markerDurationFrames;times[role==="in"?"inTime":"outTime"]=phaseTime(q,role,values,action==="action");}
      }
      configureText(q.layer,root);lib.restore(q.layer,root.shared);
      for(r=0;r<ROLES.length;r++)if(root.slots[ROLES[r]])renderSlot(q.layer,root,ROLES[r],context,components,plans);
      if(root.textEffect)renderSlot(q.layer,root,"effect",context,components,plans);
      combine(q.layer,root,components);writeCues(q.layer,root,times,q.markers);
      // Shared entries no longer used are restored, then removed from metadata.
      var retained=[];for(r=0;r<root.shared.length;r++)if(root.shared[r].managed)retained.push(root.shared[r]);root.shared=retained;
      if(!root.slots.in&&!root.slots.out&&!root.textEffect){save(q.layer,null);restoreTextState(q.layer,root);q.layer.threeDLayer=root.was3D;}else save(q.layer,root);
    }}catch(problem){var failed=false;
      for(i=plans.length-1;i>=0;i--){try{var plan=plans[i];lib.restore(plan.layer,plan.snapshots);for(var j=plan.created.length-1;j>=0;j--){var item=plan.created[j],g=lib.locate(plan.layer,item.group),e=lib.child(g,item.name);if(e)e.remove();}}catch(partialError){failed=true;}}
      for(i=done.length-1;i>=0;i--)try{var d=/** @type {any} */ (done[i]);erase(d.q.layer,d.root);d.q.layer.comment=d.q.comment;d.q.layer.threeDLayer=d.q.was3D;if(typeof d.q.perChar3D==="boolean")d.q.layer.threeDPerChar=d.q.perChar3D;var gp=groupingProperty(d.q.layer);if(gp&&d.q.grouping!==null)gp.setValue(d.q.grouping);
        if(d.oldRoot){configureText(d.q.layer,d.oldRoot);components=[];if(d.oldRoot.textEffect)renderSlot(d.q.layer,d.oldRoot,"effect",context,components,[]);for(r=0;r<ROLES.length;r++)if(d.oldRoot.slots[ROLES[r]])renderSlot(d.q.layer,d.oldRoot,ROLES[r],context,components,[]);combine(d.q.layer,d.oldRoot,components);lib.restoreMarkers(d.q.layer,d.oldRoot,d.q.markers);d.q.layer.comment=d.q.comment;}
        else if(d.q.old){var m=d.q.old;lib.applyLayer({layer:d.q.layer,comp:prepared.comp,p:lib.definition({presetId:m.presetId}),args:m.options,meta:m,created:[],snapshots:[],locale:context.locale||"pt-BR",rect:d.q.layer.sourceRectAtTime((d.q.layer.inPoint+d.q.layer.outPoint)/2,false)});lib.restoreMarkers(d.q.layer,m,d.q.markers);d.q.layer.comment=d.q.comment;}
      }catch(rollbackError){failed=true;}
      if(failed){var failure=/** @type {any} */ (new Error("Falha ao restaurar as fases; use Desfazer."));failure.motionCode=MotionContracts.ERROR.ROLLBACK_FAILED;throw failure;}throw problem;
    }return {changed:true,data:{appliedCount:prepared.batch.length,phase:args.phase},warnings:[]};
  }
  MotionRegistry.register("ae.presets.phase-apply",{preflight:function(args){return preflight(args,"apply");},run:function(args,context){return run(args,context,"apply");}});
  MotionRegistry.register("ae.presets.phase-adjust",{preflight:function(args){return preflight(args,"adjust");},run:function(args,context){return run(args,context,"adjust");}});
  MotionRegistry.register("ae.presets.phase-action",{preflight:function(args){return preflight(args,"action");},run:function(args,context){return run(args,context,"action");}});
  MotionRegistry.register("ae.presets.phase-timing",{preflight:function(args){return preflight(args,"timing");},run:function(args,context){return run(args,context,"timing");}});
  MotionRegistry.register("ae.presets.text-effect-adjust",{preflight:function(args){return effectPreflight(args,"adjust");},run:function(args,context){return effectRun(args,context,"adjust");}});
  MotionRegistry.register("ae.presets.text-effect-action",{preflight:function(args){return effectPreflight(args,"action");},run:function(args,context){return effectRun(args,context,"action");}});
  global.MotionPresetPhases={has:has,hasSelected:hasSelected,inspectLayer:inspectLayer,metadata:metadata,contribution:contribution,isTextEffect:isTextEffect,effectPreflight:effectPreflight,effectRun:effectRun,transitionPreflight:/** @param {any} args */ function(args){return preflight(args,"apply");},transitionRun:/** @param {any} args @param {any} context */ function(args,context){return run(args,context,"apply");},removePreflight:removePreflight,remove:removeAll};
}($.global));
