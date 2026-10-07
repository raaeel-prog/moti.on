/** Local presets and media library. Roots come exclusively from the native folder picker.
 * Client payloads contain opaque IDs, never paths or code. Files stay in place. */
/* global Folder, ImportOptions, FootageItem */
(function () {
  var application=/** @type {any} */ (app), FolderApi=/** @type {any} */ (typeof Folder!=="undefined"?Folder:null);
  var SECTION="Moti.on.personal-presets.v1", files=/** @type {any} */ ({}), generation=0, session=String(new Date().getTime())+"-"+Math.floor(Math.random()*1000000);
  var staged = /** @type {any} */ (null);
  var lastMedia = /** @type {any} */ (null);
  /** @param {string} name @returns {string|null} */
  function kindOf(name) {
    if (/\.ffx$/i.test(name)) return "preset";
    if (/\.aep$/i.test(name)) return "project";
    if (/\.(png|jpe?g|tiff?|exr|dpx|psd|bmp|gif|tga|webp|heic)$/i.test(name)) return "image";
    if (/\.(wav|mp3|aif|aiff|m4a|aac)$/i.test(name)) return "audio";
    if (/\.(mov|mp4|m4v|avi|mxf|webm)$/i.test(name)) return "video";
    return null;
  }
  /** @param {any} file @param {string|null} kind @returns {boolean} */
  function validSize(file,kind) {
    var max=kind==="preset"?20*1024*1024:kind==="project"?512*1024*1024:64*1024*1024*1024;
    return Boolean(kind&&file.length>=(kind==="preset"?12:1)&&file.length<=max);
  }
  /** @param {string} message @returns {MotionCommandFailure} */
  function fail(message){return {code:MotionContracts.ERROR.INVALID_PRESET,message:message,recoverable:true,details:null};}
  /** @returns {any[]} */
  function roots(){
    if(!application.settings.haveSetting(SECTION,"roots"))return [];
    var ids=MotionJson.parse(application.settings.getSetting(SECTION,"roots")),out=[];
    if(!(ids instanceof Array)||ids.length>20)throw new Error("Biblioteca pessoal inválida.");
    for(var i=0;i<ids.length;i++){
      var id=ids[i];if(typeof id!=="string"||!/^root-[0-9-]+$/.test(id))throw new Error("Pasta inválida.");
      var r=/** @type {any} */ (MotionJson.parse(application.settings.getSetting(SECTION,id)));
      if(!r||r.id!==id||typeof r.uri!=="string"||r.uri.length>900||!/^(\/|~\/|[A-Za-z]:\/)/.test(r.uri))throw new Error("Pasta inválida.");
      out.push(r);
    }
    return out;
  }
  /** @param {any[]} list */
  function saveRoots(list){var ids=[];for(var i=0;i<list.length;i++){application.settings.saveSetting(SECTION,list[i].id,MotionJson.stringify(list[i]));ids.push(list[i].id);}application.settings.saveSetting(SECTION,"roots",MotionJson.stringify(ids));}
  /** @param {string} text @returns {string} */
  function hash(text){var h=0;for(var i=0;i<text.length;i++)h=(h*31+text.charCodeAt(i))%2147483647;return String(h);}
  /** @param {any} entry @param {any} root @returns {boolean} */
  function inside(entry,root){
    if(entry.alias||!entry.exists)return false;
    var base=root.absoluteURI.replace(/\/$/,"")+"/",uri=entry.absoluteURI;
    if(uri.indexOf(base)!==0)return false;
    var p=entry.parent,n=0;
    while(p&&p.absoluteURI!==root.absoluteURI&&n++<10){if(p.alias)return false;var next=p.parent;if(!next||next.absoluteURI===p.absoluteURI)return false;p=next;}
    return Boolean(p&&p.absoluteURI===root.absoluteURI&&!root.alias);
  }
  /** @param {any[]} list @returns {any} */
  function scan(list){
    files={};generation++;var result=/** @type {any} */ ({roots:[],folders:[],items:[],truncated:false}),seen=0,start=new Date().getTime();
    /** @param {any} folder @param {any} root @param {string} rootId @param {string|null} parentId @param {number} depth */
    function walk(folder,root,rootId,parentId,depth){
      if(depth>8||seen>=5000||result.items.length>=1000||new Date().getTime()-start>1500){result.truncated=true;return;}
      var folderId=parentId===null?rootId:rootId+"-"+hash(folder.absoluteURI);
      result.folders.push({id:folderId,rootId:rootId,parentId:parentId,name:FolderApi.decode(folder.name)});
      var entries=folder.getFiles();entries.sort(/** @param {any} a @param {any} b */ function(a,b){var x=a.name.toLowerCase(),y=b.name.toLowerCase();return x<y?-1:x>y?1:0;});
      for(var i=0;i<entries.length;i++){
        seen++;if(seen>5000||result.items.length>=1000||new Date().getTime()-start>1500){result.truncated=true;break;}
        var e=entries[i];if(e.alias||!inside(e,root)||e.name.charAt(0)===".")continue;
        if(e instanceof FolderApi){walk(e,root,rootId,folderId,depth+1);continue;}
        var kind=kindOf(e.name);if(!validSize(e,kind))continue;
        var id="ffx-"+session+"-"+generation+"-"+result.items.length;
        files[id]={file:e,root:root,rootId:rootId,kind:kind};
        result.items.push({id:id,rootId:rootId,folderId:folderId,name:FolderApi.decode(e.name).replace(/\.[^.]+$/,""),kind:kind,relativePath:FolderApi.decode(e.absoluteURI.substring(root.absoluteURI.length+1))});
      }
    }
    for(var i=0;i<list.length;i++){
      var r=list[i],f=new FolderApi(r.uri),missing=!f.exists||f.alias;
      result.roots.push({id:r.id,name:FolderApi.decode(f.name),missing:Boolean(missing)});
      if(!missing)walk(f,f,r.id,null,0);
    }
    return result;
  }
  MotionRegistry.register("ae.presets.personal",{
    /** @param {any} args */
    preflight:function(args){
      if(!FolderApi||parseFloat(application.version)<25)return fail("A biblioteca requer After Effects 25 ou posterior.");
      for(var key in args)if(Object.prototype.hasOwnProperty.call(args,key)&&key!=="action"&&(key!=="rootId"||args.action!=="remove"))return fail("Parâmetro de biblioteca desconhecido.");
      if(args.action!=="list"&&args.action!=="add"&&args.action!=="remove")return fail("Ação de biblioteca inválida.");
      if(args.action==="remove"&&!/^root-[0-9-]+$/.test(args.rootId||""))return fail("Pasta inválida.");
      return null;
    },
    /** @param {any} args */
    run:function(args){
      var list=roots(),cancelled=false,changed=false;
      if(args.action==="add"){
        if(list.length>=20)throw new Error("A biblioteca aceita até 20 pastas. Remova uma referência antes de adicionar outra.");
        var selected=FolderApi.selectDialog("Adicionar pasta de presets, mídias ou projetos à Minha biblioteca");
        if(!selected)cancelled=true;
        else {
          if(!(selected instanceof FolderApi)||selected.alias||!selected.exists||selected.absoluteURI.length>900)throw new Error("Escolha uma pasta local válida, sem atalhos.");
          var duplicate=false;for(var i=0;i<list.length;i++)if(list[i].uri===selected.absoluteURI)duplicate=true;
          if(!duplicate){list.push({id:"root-"+new Date().getTime()+"-"+list.length,uri:selected.absoluteURI});saveRoots(list);changed=true;}
        }
      }else if(args.action==="remove"){
        var next=[];for(var j=0;j<list.length;j++)if(list[j].id!==args.rootId)next.push(list[j]);
        if(next.length===list.length)throw new Error("A pasta já foi removida da biblioteca.");
        saveRoots(next);list=next;changed=true;
      }
      var data=scan(list);data.cancelled=cancelled;
      return {changed:changed,data:data,warnings:[]};
    }
  });
  /** The same opaque catalog ID authorizes preview. Recheck the approved root and
   * aliases on every read; the panel cannot request an arbitrary filesystem path.
   * @param {any} args @returns {any} */
  function previewRecord(args){
    for(var key in args)if(Object.prototype.hasOwnProperty.call(args,key)&&key!=="itemId")return {error:fail("Parâmetro de prévia desconhecido.")};
    if(typeof args.itemId!=="string"||!/^ffx-[0-9-]{1,90}$/.test(args.itemId))return {error:fail("Item inválido.")};
    if(!FolderApi||parseFloat(application.version)<25)return {error:fail("A biblioteca requer After Effects 25 ou posterior.")};
    var record=files[args.itemId];if(!record)return {error:fail("Atualize a biblioteca e selecione o item novamente.")};
    var list=roots(),approved=false;
    for(var i=0;i<list.length;i++)if(list[i].id===record.rootId&&list[i].uri===record.root.absoluteURI)approved=true;
    if(!approved||!inside(record.file,record.root)||kindOf(record.file.name)!==record.kind||!validSize(record.file,record.kind))return {error:fail("O arquivo foi movido ou não está mais disponível. Atualize a biblioteca.")};
    var supported=record.kind==="image"?/\.(png|jpe?g|gif|webp|bmp)$/i:record.kind==="audio"?/\.(wav|mp3|m4a|aac|aif|aiff)$/i:record.kind==="video"?/\.(mp4|m4v|mov|webm)$/i:null;
    if(!supported||!supported.test(record.file.name))return {error:fail("Prévia indisponível para este formato. A importação no After Effects continua disponível.")};
    if(record.kind==="image"&&record.file.length>64*1024*1024)return {error:fail("A imagem excede 64 MB. Importe no After Effects para visualizar.")};
    var path=String(record.file.fsName).replace(/\\/g,"/");
    if(path.indexOf("//")===0||!/^([A-Za-z]:\/|\/)/.test(path))return {error:fail("Esta localização não permite prévia local. Importe no After Effects para visualizar.")};
    var parts=path.split("/"),encoded=[];
    for(i=0;i<parts.length;i++){var part=parts[i]||"";encoded.push(i===0&&/^[A-Za-z]:$/.test(part)?part:encodeURIComponent(part));}
    var uri=(/^[A-Za-z]:\//.test(path)?"file:///":"file://")+encoded.join("/");
    return {error:null,record:record,uri:uri};
  }
  MotionRegistry.register("ae.presets.personal-preview",{
    preflight:function(args){return previewRecord(args).error;},
    run:function(args){var plan=previewRecord(args);if(plan.error)throw new Error(plan.error.message);return {changed:false,data:{itemId:args.itemId,kind:plan.record.kind,name:FolderApi.decode(plan.record.file.name),uri:plan.uri},warnings:[]};}
  });
  /** @param {any} args @returns {MotionCommandFailure|null} */
  function preflightApply(args){
    staged=null;
    for(var key in args)if(Object.prototype.hasOwnProperty.call(args,key)&&key!=="itemId")return fail("Parâmetro de biblioteca desconhecido.");
    if(typeof args.itemId!=="string"||!/^ffx-[0-9-]{1,90}$/.test(args.itemId))return fail("Item inválido.");
    var record=files[args.itemId],project=application.project,comp=project&&project.activeItem;
    if(!FolderApi||parseFloat(application.version)<25)return fail("A biblioteca requer After Effects 25 ou posterior.");
    if(!record)return fail("Atualize a biblioteca e selecione o item novamente.");
    var list=roots(),approved=false;for(var i=0;i<list.length;i++)if(list[i].id===record.rootId&&list[i].uri===record.root.absoluteURI)approved=true;
    if(!approved||!inside(record.file,record.root)||kindOf(record.file.name)!==record.kind||!validSize(record.file,record.kind))return fail("O arquivo foi movido, removido ou não é válido. Atualize a biblioteca.");
    if(!project)return fail("Abra um projeto.");
    if(record.kind!=="project"&&(!comp||!(comp instanceof CompItem)))return fail("Abra uma composição.");
    var importOptions=null;
    if(record.kind==="preset"){
      record.file.encoding="BINARY";
      if(!record.file.open("r"))return fail("Não foi possível ler o preset.");
      var header;try{header=record.file.read(12);}finally{record.file.close();}
      if((header.substring(0,4)!=="RIFX"&&header.substring(0,4)!=="RIFF")||header.substring(8,12)!=="FaFX")return fail("O arquivo não é um preset nativo do After Effects.");
      var layers=comp.selectedLayers;if(!layers.length||layers.length>50)return fail("Selecione de 1 a 50 camadas para aplicar o preset.");
      for(i=0;i<layers.length;i++)if(layers[i].locked||typeof layers[i].applyPreset!=="function")return fail("Selecione camadas desbloqueadas compatíveis com presets.");
    }else{
      var ImportApi=/** @type {any} */ (typeof ImportOptions!=="undefined"?ImportOptions:null);
      var ImportAs=/** @type {any} */ ($.global).ImportAsType;
      if(!ImportApi||!ImportAs||typeof project.importFile!=="function")return fail("Este host não expõe a importação de arquivos.");
      try{
        importOptions=new ImportApi(record.file);
        var targetType=record.kind==="project"?ImportAs.PROJECT:ImportAs.FOOTAGE;
        if(typeof targetType==="undefined"||typeof importOptions.canImportAs!=="function"||!importOptions.canImportAs(targetType))return fail("O After Effects não reconheceu o formato deste arquivo.");
        importOptions.importAs=targetType;importOptions.sequence=false;
      }catch(error){return fail("Não foi possível preparar a importação deste arquivo.");}
      if(record.kind!=="project"&&(!isFinite(comp.time)||comp.time<0||comp.time>=comp.duration))return fail("Posicione o indicador de tempo dentro da composição para inserir a mídia.");
    }
    staged={itemId:args.itemId,record:record,project:project,comp:comp,options:importOptions,size:record.file.length};
    return null;
  }
  /** @param {any} value @returns {boolean} */
  function isFootage(value){return value instanceof FootageItem;}
  /** @param {any} project @returns {number|null} */
  function revision(project){var value=project.revision;return typeof value==="number"&&isFinite(value)&&value>=1&&Math.floor(value)===value?value:null;}
  /** @param {any} file @returns {number|null} */
  function modifiedTime(file){try{var date=file.modified,value=date&&date.getTime();return typeof value==="number"&&isFinite(value)?value:null;}catch(error){return null;}}
  /** Reuse only our last successful import while the entire project is unchanged.
   * Project.revision also covers interpretation settings not exposed by scripting
   * (for example input color profiles). Any intervening edit imports afresh.
   * Never adopt pre-existing footage: the same PNG can be an image sequence.
   * @param {any} project @param {any} file @returns {any} */
  function existingFootage(project,file){
    var saved=lastMedia;
    if(!saved||saved.project!==project||revision(project)!==saved.revision||file.fsName!==saved.uri||file.length!==saved.size||modifiedTime(file)!==saved.modified)return null;
    for(var i=1;i<=project.numItems;i++){
      var item=project.item(i);
      if(item.id===saved.id&&item===saved.item&&isFootage(item)&&item.file&&item.file.fsName===file.fsName&&!item.footageMissing&&item.useProxy===false&&!item.proxySource&&item.mainSource===saved.source)return item;
    }
    return null;
  }
  /** @param {any} project @param {any} item @param {any} file */
  function rememberFootage(project,item,file){
    var current=revision(project),modified=modifiedTime(file);
    lastMedia=current!==null&&modified!==null?{project:project,revision:current,id:item.id,item:item,source:item.mainSource,uri:file.fsName,size:file.length,modified:modified}:null;
  }
  /** Store a path, never an AE Property reference: adding indexed properties
   * inside an .ffx invalidates existing effects/animators and their children.
   * @param {any} property @returns {any} */
  function selectedProperty(property){
    var path=[],p=property,keys=[],i;
    if(typeof p.keyTime==="function")for(i=0;i<p.selectedKeys.length;i++)keys.push(p.keyTime(p.selectedKeys[i]));
    while(p&&p.parentProperty){
      var parent=p.parentProperty,occurrence=0;
      for(i=1;i<=p.propertyIndex&&i<=parent.numProperties;i++){
        var sibling=parent.property(i);
        if(sibling.matchName===p.matchName&&sibling.name===p.name)occurrence++;
      }
      path.unshift({index:p.propertyIndex,matchName:p.matchName,name:p.name,occurrence:occurrence});p=parent;
    }
    if(!p||!path.length||typeof p.id!=="number")throw new Error("Não foi possível preservar a seleção de propriedades.");
    return {layerId:p.id,path:path,keys:keys};
  }
  /** @param {any} comp @param {any} saved @returns {any} */
  function resolveSelectedProperty(comp,saved){
    var p=/** @type {any} */ (null),i,j;
    for(i=1;i<=comp.numLayers;i++)if(comp.layer(i).id===saved.layerId){p=comp.layer(i);break;}
    for(i=0;p&&i<saved.path.length;i++){
      var step=saved.path[i],next,occurrence=0;
      try{next=p.property(step.index);}catch(indexError){next=null;}
      if(!next||next.matchName!==step.matchName||next.name!==step.name){
        next=null;
        for(j=1;j<=p.numProperties;j++){
          var candidate=p.property(j);
          if(candidate.matchName===step.matchName&&candidate.name===step.name&&++occurrence===step.occurrence){next=candidate;break;}
        }
        if(!next&&step.occurrence===0){try{var named=p.property(step.matchName);if(named&&named.name===step.name)next=named;}catch(nameError){next=null;}}
      }
      p=next;
    }
    return p;
  }
  /** @param {any} project @param {any} comp @returns {any} */
  function captureSelection(project,comp){
    var properties=[];
    if(comp instanceof CompItem)for(var i=0;i<comp.selectedProperties.length;i++)properties.push(selectedProperty(comp.selectedProperties[i]));
    return {items:project.selection,layers:comp instanceof CompItem?comp.selectedLayers:[],properties:properties,time:comp instanceof CompItem?comp.time:null};
  }
  /** @param {any} project @param {any} comp @param {any} before */
  function restoreSelection(project,comp,before){
    var i;
    if(comp instanceof CompItem){
      comp.time=before.time;
      for(i=1;i<=comp.numLayers;i++)comp.layer(i).selected=false;
      for(i=0;i<before.layers.length;i++)before.layers[i].selected=true;
      for(i=0;i<before.properties.length;i++){
        var saved=before.properties[i],property=resolveSelectedProperty(comp,saved);
        // A preset may deliberately remove a property. Restore surviving paths
        // without treating the removed target as a failed preset application.
        if(!property)continue;
        property.selected=true;
        if(typeof property.setSelectedAtKey==="function"){
          for(var k=1;k<=property.numKeys;k++)property.setSelectedAtKey(k,false);
          for(var j=0;j<saved.keys.length;j++)for(k=1;k<=property.numKeys;k++)if(Math.abs(property.keyTime(k)-saved.keys[j])<0.0000001){property.setSelectedAtKey(k,true);break;}
        }
      }
    }
    for(i=1;i<=project.numItems;i++)project.item(i).selected=false;
    for(i=0;i<before.items.length;i++)before.items[i].selected=true;
  }
  MotionRegistry.register("ae.presets.personal-apply",{
    preflight:preflightApply,
    /** @param {any} args */
    run:function(args){
      var plan=staged;staged=null;
      if(!plan||plan.itemId!==args.itemId||application.project!==plan.project||plan.project.activeItem!==plan.comp||!inside(plan.record.file,plan.record.root)||plan.record.file.length!==plan.size)throw new Error("Atualize a biblioteca e tente novamente.");
      var record=plan.record,project=plan.project,comp=plan.comp,before=captureSelection(project,comp);
      if(record.kind==="preset"){
        lastMedia=null;
        try{before.layers[0].applyPreset(record.file);}
        finally{restoreSelection(project,comp,before);}
        return {changed:true,data:{appliedCount:before.layers.length,kind:record.kind},warnings:[]};
      }
      var item=null,layer=null,created=[],previousIds=/** @type {Record<string,boolean>} */ ({}),i;
      for(i=1;i<=project.numItems;i++)previousIds[String(project.item(i).id)]=true;
      try{
        if(record.kind!=="project")item=existingFootage(project,record.file);
        lastMedia=null;
        if(!item)item=project.importFile(plan.options);
        if(!item)throw new Error("A importação não retornou um item.");
        if(record.kind!=="project"){
          if(!isFootage(item)||(!item.hasVideo&&!item.hasAudio))throw new Error("O arquivo importado não contém mídia utilizável.");
          var remaining=comp.duration-before.time;
          var duration=item.mainSource.isStill?remaining:Math.min(remaining,item.duration);
          if(!isFinite(duration)||duration<=0)throw new Error("A mídia não possui duração válida.");
          layer=comp.layers.add(item,duration);
          layer.startTime=before.time;layer.inPoint=before.time;layer.outPoint=before.time+duration;
        }
        restoreSelection(project,comp,before);
        if(record.kind!=="project")rememberFootage(project,item,record.file);
        return {changed:true,data:{appliedCount:1,kind:record.kind,itemName:item.name,reused:!!previousIds[String(item.id)]},warnings:[]};
      }catch(error){
        var rollbackFailed=false;
        if(layer){try{layer.remove();}catch(layerError){rollbackFailed=true;}}
        // Capture only IDs created by this import, including a partially failed
        // .aep import. Existing project items are never rollback targets.
        for(i=project.numItems;i>=1;i--)if(!previousIds[String(project.item(i).id)])created.push(project.item(i));
        for(i=0;i<created.length;i++){
          try{created[i].remove();}catch(removeError){
            // A parent folder may already have removed its children.
            var stillExists=false;
            for(var j=1;j<=project.numItems;j++)if(project.item(j)===created[i])stillExists=true;
            if(stillExists)rollbackFailed=true;
          }
        }
        try{restoreSelection(project,comp,before);}catch(selectionError){rollbackFailed=true;}
        if(rollbackFailed){var failure=/** @type {any} */ (new Error("A importação falhou e a restauração ficou incompleta. Use Desfazer."));failure.motionCode=MotionContracts.ERROR.ROLLBACK_FAILED;throw failure;}
        throw error;
      }
    }
  });
}());
