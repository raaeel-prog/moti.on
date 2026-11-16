/** Move only owned preset timing cues. Layer edges, animation properties and
 * marker payloads remain intact; every destination is checked before mutation.
 * v1 cues are points (end of the entrance, start of the exit); v2 cues are
 * windows, so shift/align/stagger move the whole phase and Duration resizes it. */
(function (global) {
  var EPSILON = 0.000001;
  var ALLOWED = {operation:true,phase:true,frames:true,order:true,seed:true};

  /** @param {string} code @param {string} message @returns {MotionCommandFailure} */
  function fail(code,message) { return {code:code,message:message,recoverable:true,details:null}; }
  /** @param {any} value @returns {boolean} */
  function finite(value) { return typeof value==="number"&&isFinite(value); }
  /** @param {any} args @returns {MotionCommandFailure|null} */
  function validate(args) {
    if(!args||typeof args!=="object"||args instanceof Array)return fail(MotionContracts.ERROR.INVALID_PRESET,"Ajuste de timing inválido.");
    var key;
    for(key in args)if(Object.prototype.hasOwnProperty.call(args,key)&&!Object.prototype.hasOwnProperty.call(ALLOWED,key))return fail(MotionContracts.ERROR.INVALID_PRESET,"Parâmetro de timing desconhecido.");
    for(key in ALLOWED)if(key!=="seed"&&Object.prototype.hasOwnProperty.call(ALLOWED,key)&&!Object.prototype.hasOwnProperty.call(args,key))return fail(MotionContracts.ERROR.INVALID_PRESET,"Parâmetro de timing ausente.");
    if(args.operation!=="shift"&&args.operation!=="align"&&args.operation!=="stagger"&&args.operation!=="duration")return fail(MotionContracts.ERROR.INVALID_PRESET,"Operação de timing inválida.");
    if(args.phase!=="in"&&args.phase!=="out")return fail(MotionContracts.ERROR.INVALID_PRESET,"Escolha a entrada ou a saída.");
    if(!finite(args.frames)||Math.floor(args.frames)!==args.frames||args.frames< -600||args.frames>600)return fail(MotionContracts.ERROR.INVALID_PRESET,"O intervalo precisa ser inteiro entre -600 e 600 frames.");
    if(args.operation==="duration"&&args.frames<1)return fail(MotionContracts.ERROR.INVALID_PRESET,"A duração da fase precisa estar entre 1 e 600 frames.");
    if(args.order!=="forward"&&args.order!=="reverse"&&args.order!=="random")return fail(MotionContracts.ERROR.INVALID_PRESET,"Ordem de timing inválida.");
    if(typeof args.seed!=="undefined"&&(!finite(args.seed)||Math.floor(args.seed)!==args.seed||args.seed<0||args.seed>9999))return fail(MotionContracts.ERROR.INVALID_PRESET,"A variação precisa ser inteira entre 0 e 9999.");
    return null;
  }
  /** @param {any} group @param {string} name @returns {any} */
  function named(group,name) {
    if(!group)return null;for(var i=1;i<=group.numProperties;i++){var p=group.property(i);if(p.name===name)return p;}return null;
  }
  /** @param {any} marker @param {any} meta @returns {string} */
  function roleOf(marker,meta) {
    if(!marker||typeof marker.getParameters!=="function")return "";
    var parameters=marker.getParameters(),role=parameters["Moti.on.phase"];
    return parameters["Moti.on.instance"]===meta.instance&&(role==="in"||role==="out"||role==="both")?role:"";
  }
  /** @param {any} property @param {any} meta @returns {any} */
  function cues(property,meta) {
    var result=/** @type {any} */ ({input:null,output:null,merged:false,duplicate:false});
    for(var i=1;i<=property.numKeys;i++){
      var value=property.keyValue(i),role=roleOf(value,meta);if(!role)continue;
      var cue={index:i,time:property.keyTime(i),value:value};
      if(role==="both")result.merged=true;
      if(role!=="out"){if(result.input)result.duplicate=true;result.input=cue;}
      if(role!=="in"){if(result.output)result.duplicate=true;result.output=cue;}
    }
    return result;
  }
  /** @param {any} layer @param {any} meta @returns {MotionCommandFailure|null} */
  function durationPreflight(layer,meta) {
    var effect=meta.effects&&meta.effects[0]&&named(layer.property("ADBE Effect Parade"),meta.effects[0].name),control=effect&&effect.property(1);
    if(!control||control.numKeys||control.expression||!finite(control.value)||Math.abs(control.value-meta.markerDurationFrames)>EPSILON)return fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE,"O controle Duração foi animado ou alterado. Restaure a duração original dos marcadores ou ajuste o timing diretamente no After Effects.");
    return null;
  }
  /** @param {any} error @returns {any} */
  function rejected(error) { return {error:error,targets:[]}; }
  /** Effective In/Out windows of a v2 layer as AE plays them now.
   * @param {any} layer @param {any} state @param {number} fd @returns {any} */
  function rangeWindows(layer,state,fd) {
    var W=/** @type {any} */ (global).MotionMarkerWindow,result=/** @type {any} */ ({valid:true,input:null,output:null});
    if(state.input)result.input=W.cueWindow("in",state.input.time,state.input.value.duration,state.input.value.getParameters(),layer,fd);
    if(state.output)result.output=W.cueWindow("out",state.output.time,state.output.value.duration,state.output.value.getParameters(),layer,fd);
    var list=[result.input,result.output];
    for(var i=0;i<list.length;i++)if(list[i]&&(!finite(list[i].start)||!finite(list[i].end)||list[i].duration<=EPSILON))result.valid=false;
    return result;
  }
  /** Plan one v2 cue move: the window must stay inside the layer, keep a length
   * and never cross the other phase.
   * @param {any} target @param {any} args @param {any} comp @param {number} position @returns {MotionCommandFailure|null} */
  function planRange(target,args,comp,position) {
    var W=/** @type {any} */ (global).MotionMarkerWindow,fd=comp.frameDuration,layer=target.layer,own=args.phase==="in"?target.windows.input:target.windows.output,other=args.phase==="in"?target.windows.output:target.windows.input;
    var length=args.operation==="duration"?args.frames*fd:own.duration;
    var start=args.operation==="shift"?own.start+args.frames*fd:args.operation==="duration"?(args.phase==="in"?own.start:own.end-length):comp.time+(args.operation==="stagger"?position*args.frames*fd:0),end=start+length;
    var conflict=fail(MotionContracts.ERROR.KEYFRAME_CONFLICT,"A fase sairia da camada ou cruzaria a outra fase. Ajuste o cursor ou o intervalo.");
    if(!finite(start)||!finite(end)||length<=EPSILON||start<layer.inPoint-EPSILON||end>layer.outPoint+EPSILON)return conflict;
    if(other&&(args.phase==="in"?end>other.start+EPSILON:start<other.end-EPSILON))return conflict;
    for(var k=1;k<=target.property.numKeys;k++)if(k!==target.cue.index&&Math.abs(target.property.keyTime(k)-start)<=EPSILON)return fail(MotionContracts.ERROR.KEYFRAME_CONFLICT,"O destino está ocupado por outro marcador. Ajuste o cursor ou o intervalo.");
    var before=target.cue.value.getParameters(),after=W.edgeParams(before,args.phase,start,end,layer,fd);
    target.afterTime=start;target.afterDuration=length;target.afterParams=after;
    target.changed=Math.abs(start-target.beforeTime)>EPSILON||Math.abs(length-target.cue.value.duration)>EPSILON||before[W.EDGE]!==after[W.EDGE];
    return null;
  }
  /** Value written for a target: v2 gets a fresh copy with its new window.
   * @param {any} target @returns {any} */
  function movedValue(target) {
    if(!target.windows)return target.cue.value;
    var value=/** @type {any} */ (global).MotionMarkerWindow.copy(target.cue.value);value.duration=target.afterDuration;value.setParameters(target.afterParams);return value;
  }
  /** @param {any} args @returns {any} */
  function prepare(args) {
    var invalid=validate(args);if(invalid)return rejected(invalid);
    var comp=app.project&&app.project.activeItem;
    if(!comp||!(comp instanceof CompItem))return rejected(fail(MotionContracts.ERROR.NO_ACTIVE_COMP,"Abra uma composição."));
    if(!finite(comp.frameDuration)||comp.frameDuration<=0||!finite(comp.time))return rejected(fail(MotionContracts.ERROR.CAPABILITY_UNAVAILABLE,"Não foi possível ler o tempo da composição."));
    var library=/** @type {any} */ (global).MotionPresetLibrary;
    if(!library||typeof library.metadata!=="function"||typeof library.verifyOwnership!=="function")return rejected(fail(MotionContracts.ERROR.CAPABILITY_UNAVAILABLE,"Recarregue o painel para atualizar os controles de timing."));
    var layers=comp.selectedLayers,targets=/** @type {any[]} */ ([]),i;
    if(!layers||!layers.length)return rejected(fail(MotionContracts.ERROR.NO_SELECTION,"Selecione camadas com marcadores de preset Moti.on."));
    if(layers.length>50)return rejected(fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE,"Ajuste até 50 camadas por vez."));
    for(i=0;i<layers.length;i++){
      var layer=/** @type {any} */ (layers[i]),meta,ownership;
      if(layer.locked)return rejected(fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE,"Desbloqueie todas as camadas selecionadas."));
      try{meta=library.metadata(layer);ownership=meta?library.verifyOwnership(layer,meta):null;}catch(metadataError){return rejected(fail(MotionContracts.ERROR.INVALID_PRESET,"Os dados do preset estão incompletos. Reaplique o preset antes de ajustar o timing."));}
      if(!meta||(meta.markerVersion!==1&&meta.markerVersion!==2)||!finite(meta.markerDurationFrames))return rejected(fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE,"Todas as camadas precisam de marcadores de transição Moti.on. Reaplique o preset nas camadas sem marcadores."));
      if(ownership)return rejected(ownership);
      // v2 reads only the cues, so a changed Duration slider cannot disagree with them.
      if(meta.markerVersion===1){var durationError=durationPreflight(layer,meta);if(durationError)return rejected(durationError);}
      var property=layer.property("ADBE Marker");
      if(!property||typeof property.keyValue!=="function"||typeof property.setValueAtTime!=="function"||typeof property.removeKey!=="function"||typeof property.keySelected!=="function"||typeof property.setSelectedAtKey!=="function")return rejected(fail(MotionContracts.ERROR.CAPABILITY_UNAVAILABLE,"A camada não permite editar marcadores."));
      if(property.numKeys>250)return rejected(fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE,"Reduza a camada a até 250 marcadores antes de ajustar o timing."));
      var state=cues(property,meta),cue=args.phase==="in"?state.input:state.output;
      if(state.merged)return rejected(fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE,"O marcador In / Out combinado não pode ser movido por fase. Aumente a camada ou reduza a duração e reaplique o preset."));
      if(state.duplicate)return rejected(fail(MotionContracts.ERROR.INVALID_PRESET,"Há marcadores Moti.on duplicados. Remova a cópia antes de ajustar o timing."));
      if(!cue)return rejected(fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE,args.phase==="in"?"Uma camada não tem marcador de entrada Moti.on.":"Uma camada não tem marcador de saída Moti.on."));
      if(meta.options&&meta.options.phase==="both"&&(!state.input||!state.output))return rejected(fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE,"Uma fase do preset está sem marcador. Reaplique o preset para restaurar os marcadores antes de ajustar o timing."));
      if(!finite(layer.inPoint)||!finite(layer.outPoint)||layer.outPoint-layer.inPoint<=EPSILON)return rejected(fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE,"A camada precisa ter duração positiva."));
      if(meta.markerVersion===1&&((state.input&&(!finite(state.input.time)||state.input.time<=layer.inPoint||state.input.time>layer.outPoint))||(state.output&&(!finite(state.output.time)||state.output.time<layer.inPoint||state.output.time>=layer.outPoint))))return rejected(fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE,"Um marcador está fora do intervalo da camada. Corrija-o na timeline antes de continuar."));
      var selectedTimes=[];for(var selected=1;selected<=property.numKeys;selected++)if(property.keySelected(selected))selectedTimes.push(property.keyTime(selected));
      var windows=meta.markerVersion===2?rangeWindows(layer,state,comp.frameDuration):null;
      if(windows&&!windows.valid)return rejected(fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE,"Um marcador de fase está sem duração ou fora da camada. Corrija-o na timeline antes de continuar."));
      targets.push({layer:layer,meta:meta,property:property,cue:cue,state:state,windows:windows,beforeTime:cue.time,afterTime:cue.time,selectedTimes:selectedTimes,propertySelected:property.selected});
    }
    targets.sort(function(a,b){return args.order==="reverse"?b.layer.index-a.layer.index:a.layer.index-b.layer.index;});
    if(args.order==="random"){
      // Stable shuffle: the same timeline order and seed produce the same order.
      var randomState=(typeof args.seed==="number"?args.seed:17)+1;
      for(var shuffle=targets.length-1;shuffle>0;shuffle--){
        randomState=(randomState*48271)%2147483647;
        var swap=Math.floor((randomState/2147483647)*(shuffle+1)),held=targets[shuffle];targets[shuffle]=targets[swap];targets[swap]=held;
      }
    }
    var changed=0;
    for(i=0;i<targets.length;i++){
      if(targets[i].windows){var rangeError=planRange(targets[i],args,comp,i);if(rangeError)return rejected(rangeError);if(targets[i].changed)changed++;continue;}
      var target=targets[i],destination=args.operation==="duration"?(args.phase==="in"?target.layer.inPoint+args.frames*comp.frameDuration:target.layer.outPoint-args.frames*comp.frameDuration):args.operation==="shift"?target.beforeTime+args.frames*comp.frameDuration:comp.time+(args.operation==="stagger"?i*args.frames*comp.frameDuration:0);
      var input=args.phase==="in"?destination:(target.state.input?target.state.input.time:null),output=args.phase==="out"?destination:(target.state.output?target.state.output.time:null);
      if(!finite(destination)||destination<target.layer.inPoint||destination>target.layer.outPoint||(args.phase==="in"&&destination-target.layer.inPoint<=EPSILON)||(args.phase==="out"&&target.layer.outPoint-destination<=EPSILON))return rejected(fail(MotionContracts.ERROR.KEYFRAME_CONFLICT,"O timing solicitado sairia da camada ou deixaria a fase sem duração. Ajuste o cursor ou o intervalo."));
      if(input!==null&&output!==null&&input>output+EPSILON)return rejected(fail(MotionContracts.ERROR.KEYFRAME_CONFLICT,"A entrada e a saída se sobreporiam. Ajuste o cursor ou o intervalo."));
      for(var k=1;k<=target.property.numKeys;k++)if(k!==target.cue.index&&Math.abs(target.property.keyTime(k)-destination)<=EPSILON)return rejected(fail(MotionContracts.ERROR.KEYFRAME_CONFLICT,"O destino está ocupado por outro marcador. Ajuste o cursor ou o intervalo."));
      target.afterTime=destination;target.changed=Math.abs(destination-target.beforeTime)>EPSILON;if(target.changed)changed++;
    }
    return {error:null,targets:targets,changedCount:changed};
  }
  /** @param {any} target @param {string} phase @returns {number} */
  function currentIndex(target,phase) {
    for(var i=1;i<=target.property.numKeys;i++)if(roleOf(target.property.keyValue(i),target.meta)===phase)return i;
    return 0;
  }
  /** Restore selected marker keys by time because moving a key changes indices.
   * @param {any} target @param {boolean} applied */
  function restoreSelection(target,applied) {
    for(var i=1;i<=target.property.numKeys;i++){
      var time=target.property.keyTime(i),selected=false;
      for(var j=0;j<target.selectedTimes.length;j++){
        var original=target.selectedTimes[j],expected=applied&&Math.abs(original-target.beforeTime)<=EPSILON?target.afterTime:original;
        if(Math.abs(time-expected)<=EPSILON){selected=true;break;}
      }
      if(target.property.keySelected(i)!==selected)target.property.setSelectedAtKey(i,selected);
    }
    if(typeof target.propertySelected==="boolean"&&target.property.selected!==target.propertySelected)target.property.selected=target.propertySelected;
  }
  /** @param {any} args @returns {MotionCommandResult} */
  function run(args) {
    var plan=prepare(args);if(plan.error)throw new Error(plan.error.message);
    var touched=/** @type {any[]} */ ([]),i;
    try{
      for(i=0;i<plan.targets.length;i++){
        var target=plan.targets[i];if(!target.changed)continue;touched.push(target);
        var index=currentIndex(target,args.phase);if(!index)throw new Error("O marcador mudou antes da aplicação.");
        target.property.removeKey(index);target.property.setValueAtTime(target.afterTime,movedValue(target));restoreSelection(target,true);
      }
    }catch(error){
      var rollbackFailed=false;
      for(i=touched.length-1;i>=0;i--){var previous=touched[i];try{var moved=currentIndex(previous,args.phase);if(moved)previous.property.removeKey(moved);previous.property.setValueAtTime(previous.beforeTime,previous.cue.value);restoreSelection(previous,false);}catch(restoreError){rollbackFailed=true;}}
      if(rollbackFailed){var failure=/** @type {any} */ (new Error("Não foi possível restaurar todos os marcadores. Use Desfazer."));failure.motionCode=MotionContracts.ERROR.ROLLBACK_FAILED;failure.cause=error;throw failure;}throw error;
    }
    return {changed:plan.changedCount>0,data:{appliedCount:plan.changedCount,selectedCount:plan.targets.length,operation:args.operation,phase:args.phase},warnings:[]};
  }
  MotionRegistry.register("ae.presets.timing",{preflight:function(args){return prepare(args).error;},run:run});
}($.global));
