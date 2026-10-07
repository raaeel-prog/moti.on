/** Inspect native colors without modifying the project. Keys resolve only against
 * a fresh, bounded inspection; panel input never becomes a property path. */
(function(global){
  var LIMIT=32,NODES=512;
  /** @param {string} message @returns {MotionCommandFailure} */
  function fail(message){return {code:MotionContracts.ERROR.INVALID_PRESET,message:message,recoverable:true,details:null};}
  /** @param {any} color @returns {boolean} */
  function valid(color){if(!color||color.length<3)return false;for(var i=0;i<3;i++)if(typeof color[i]!=="number"||!isFinite(color[i])||color[i]<0||color[i]>1)return false;return true;}
  /** @param {any} color @returns {string|null} */
  function hex(color){if(!valid(color))return null;var result="#";for(var i=0;i<3;i++){var value=Math.round(color[i]*255).toString(16);result+=(value.length<2?"0":"")+value;}return result.toUpperCase();}
  /** @param {any} property @param {any} layer @returns {string} */
  function blocked(property,layer){if(layer.locked)return "Camada bloqueada";if(property.numKeys>0)return "Cor animada";if(property.expression)return "Controlada por expressão";return "";}
  /** @param {any} layer @returns {any} */
  function scan(layer){
    var entries=/** @type {any[]} */ ([]),visited=0,truncated=false;
    /** @param {any} property @param {string} key @param {string} label @param {string} signature @param {string=} attribute */
    function add(property,key,label,signature,attribute){
      if(entries.length>=LIMIT){truncated=true;return;}
      var color=null,reason=blocked(property,layer),doc;
      try{
        if(attribute){doc=property.value;if(typeof doc.characterRange!=="function"||!String(doc.text).length)reason=reason||"Estilo de texto indisponível";
          else{var range=doc.characterRange(0,String(doc.text).length),enabled=attribute==="fillColor"?range.applyFill:range.applyStroke;
            if(enabled===false)return;
            if(enabled!==true||!valid(range[attribute]))reason=reason||"Cores ou estilos variados";else color=range[attribute];}}
        else color=property.value;
      }catch(error){reason=reason||"Cor indisponível";}
      if(!valid(color))reason=reason||"Cor indisponível";
      entries.push({key:key,label:label.substring(0,160),hex:hex(color),available:!reason,reason:reason,property:property,attribute:attribute||null,signature:signature,raw:valid(color)?[color[0],color[1],color[2],color.length>3?color[3]:1]:null});
    }
    /** @param {any} group @param {string} path @param {string} label @param {string} signature @param {number} depth */
    function shapes(group,path,label,signature,depth){
      if(!group)return;if(depth>12){truncated=true;return;}
      for(var i=1;i<=group.numProperties;i++){
        if(++visited>NODES){truncated=true;return;}
        var p=group.property(i);if(!p)continue;
        var id=path+"."+i,name=String(p.name||p.matchName).substring(0,80),sig=signature+"/"+p.matchName+":"+name;
        if(p.matchName==="ADBE Vector Fill Color"||p.matchName==="ADBE Vector Stroke Color")add(p,"shape"+id,label+(p.matchName==="ADBE Vector Fill Color"?" · Preenchimento":" · Contorno"),sig);
        else if(p.numProperties)shapes(p,id,p.matchName==="ADBE Vector Group"?name:label,sig,depth+1);
      }
    }
    var text=layer.property("ADBE Text Properties"),source=text&&text.property("ADBE Text Document");
    if(source){add(source,"text.fill","Texto · Preenchimento","text.fill","fillColor");add(source,"text.stroke","Texto · Contorno","text.stroke","strokeColor");}
    shapes(layer.property("ADBE Root Vectors Group"),"","Forma","shapes",0);
    // Only controls named in an owned Moti.on instance are eligible here.
    var names=/** @type {any} */ ({}),lib=/** @type {any} */ (global).MotionPresetLibrary,phases=/** @type {any} */ (global).MotionPresetPhases;
    try{var root=phases&&phases.has(layer)?phases.metadata(layer):null,metas=/** @type {any[]} */ ([]);
      if(root){if(root.slots.in)metas.push(root.slots.in.meta);if(root.slots.out)metas.push(root.slots.out.meta);}else{var legacy=lib.metadata(layer);if(legacy)metas.push(legacy);}
      for(var m=0;m<metas.length;m++)for(var n=0;n<metas[m].effects.length;n++)names[metas[m].effects[n].name]=true;
    }catch(metadataError){/* Invalid metadata must never authorize an unrelated effect. */}
    var effects=layer.property("ADBE Effect Parade");
    if(effects)for(var e=1;e<=effects.numProperties&&e<=NODES;e++){var effect=effects.property(e);if(effect&&effect.matchName==="ADBE Color Control"&&names[effect.name]){var color=effect.property("ADBE Color Control-0001");if(color)add(color,"control."+e,String(effect.name),"control:"+effect.name);}}
    var rows=[],fingerprint=[];
    for(var j=0;j<entries.length;j++){var item=entries[j];rows.push({key:item.key,label:item.label,hex:item.hex,available:item.available,reason:item.reason});fingerprint.push([item.key,item.signature,item.raw,item.reason]);}
    return {entries:entries,rows:rows,truncated:truncated,fingerprint:MotionJson.stringify(fingerprint)};
  }
  /** @param {any} data */
  function decorate(data){
    var comp=app.project&&app.project.activeItem;if(!comp||!(comp instanceof CompItem))return;
    var current=/** @type {any} */ (comp),layers=/** @type {any[]} */ (current.selectedLayers);data.selection=[];
    for(var i=0;i<layers.length&&i<50;i++)data.selection.push({id:layers[i].id,name:layers[i].name});
    if(layers.length!==1)return;
    var colors=scan(layers[0]);data.colors=colors.rows;data.colorsTruncated=colors.truncated;data.colorTarget={compId:current.id,layerId:layers[0].id,fingerprint:colors.fingerprint};
    if(!data.layerName)data.layerName=layers[0].name;
  }
  /** @param {any} args @returns {any} */
  function prepare(args){
    if(!args||!/^#[0-9a-fA-F]{6}$/.test(args.hex)||typeof args.key!=="string"||!args.target)return {error:fail("Use uma cor hexadecimal de seis dígitos.")};
    for(var k in args)if(Object.prototype.hasOwnProperty.call(args,k)&&k!=="hex"&&k!=="key"&&k!=="target")return {error:fail("Parâmetro de cor desconhecido.")};
    var comp=app.project&&app.project.activeItem;
    if(!comp||!(comp instanceof CompItem)||comp.selectedLayers.length!==1)return {error:fail("Selecione uma camada para editar suas cores.")};
    var current=/** @type {any} */ (comp),layer=/** @type {any} */ (current.selectedLayers[0]),colors=scan(layer),target=args.target;
    if(target.compId!==current.id||target.layerId!==layer.id||target.fingerprint!==colors.fingerprint)return {error:fail("A seleção ou as cores mudaram. Recarregue os controles.")};
    for(var i=0;i<colors.entries.length;i++)if(colors.entries[i].key===args.key){var entry=colors.entries[i];if(!entry.available)return {error:fail(entry.reason)};return {error:null,entry:entry};}
    return {error:fail("Esse controle de cor não está disponível.")};
  }
  /** @param {any} entry @param {number[]} color */
  function write(entry,color){if(entry.attribute){var doc=entry.property.value;doc.characterRange(0,String(doc.text).length)[entry.attribute]=color.slice(0,3);entry.property.setValue(doc);}else entry.property.setValue(color);}
  MotionRegistry.register("ae.presets.color-adjust",{
    preflight:function(args){return prepare(args).error;},
    run:function(args){var ready=prepare(args);if(ready.error)throw new Error(ready.error.message);var entry=ready.entry,input=/** @type {any} */ (args);
      if(entry.hex===input.hex.toUpperCase())return {changed:false,data:{appliedCount:0},warnings:[]};
      var color=[];for(var i=0;i<3;i++)color.push(parseInt(input.hex.substr(1+i*2,2),16)/255);color.push(entry.raw[3]);
      try{write(entry,color);}catch(error){try{write(entry,entry.raw);}catch(restoreError){var failure=/** @type {any} */ (new Error("Falha ao restaurar a cor; use Desfazer."));failure.motionCode=MotionContracts.ERROR.ROLLBACK_FAILED;throw failure;}throw error;}
      return {changed:true,data:{appliedCount:1},warnings:[]};
    }
  });
  /** @type {any} */ (global).MotionPresetLibrary.decorateColors=decorate;
}($.global));
