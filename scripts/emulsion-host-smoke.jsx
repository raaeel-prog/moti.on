/* Isolated AE fixture only. Launch with AfterFX.com -m -r; never attach to a user session. */
(function () {
  var root = "C:/dev/Moti.on/implementation";
  var artifactRoot = new Folder(root + "/artifacts/emulsion-native");
  if (!artifactRoot.exists) artifactRoot.create();
  var stamp = String(new Date().getTime());
  var out = new Folder(artifactRoot.fsName + "/run-" + stamp); out.create();
  var log = new File(out.fsName + "/smoke.txt");
  var rows = [];
  var safeSession = false;
  var fatal = null;
  function write(file, text) { file.encoding = "UTF-8"; if (!file.open("w")) throw new Error("Cannot write " + file.fsName); try { file.write(text); } finally { file.close(); } }
  function append(text) { log.encoding = "UTF-8"; if (log.open("a")) { log.writeln(text); log.close(); } }
  function assert(value, message) { if (!value) throw new Error(message); }
  function near(a,b) { return Math.abs(a-b) < 0.00001; }
  function row(name,status,details) { rows.push({name:name,status:status,details:details || ""}); append(status + " | " + name + " | " + (details || "")); }
  function status(value) { write(new File(artifactRoot.fsName + "/status.txt"), value + "\n" + out.fsName); }
  function dispatch(command,args) {
    var raw = MotionAE.dispatch(MotionJson.stringify({protocolVersion:1,requestId:"emulsion-"+stamp+"-"+rows.length,command:command,args:args || {},context:{host:"after-effects",hostVersion:app.version,locale:"pt-BR"},options:{preserveSelection:true}}));
    return MotionJson.parse(raw);
  }
  function okay(response,label) { if (!response.ok) throw new Error(label + ": " + MotionJson.stringify(response.error)); return response.data; }
  function deselect(comp) { for(var i=1;i<=comp.numLayers;i++) comp.layer(i).selected=false; }
  function findLayer(comp,id) { for(var i=1;i<=comp.numLayers;i++) if(comp.layer(i).id===id) return comp.layer(i); throw new Error("Created layer not found: " + id); }
  function effect(layer,index,key) { return layer.property("ADBE Effect Parade").property(index).property(key); }
  function expressions(group,list) { if (!group) return; if (typeof group.expression === "string" && group.expression.indexOf("// EMULSION_EXPRESSION v1")===0) list.push(group); for(var i=1;i<=group.numProperties;i++) expressions(group.property(i),list); }
  function fixture(name) {
    var comp=app.project.items.addComp(name,960,540,1,2.4,30);
    var a=comp.layers.addSolid([0.04,0.22,0.38],"Original plate A",960,540,1,2.4);a.inPoint=0;a.outPoint=1.2;
    var b=comp.layers.addSolid([0.82,0.35,0.08],"Original plate B",960,540,1,2.4);b.inPoint=1.2;b.outPoint=2.4;
    var title=comp.layers.addText("EMULSION  /  ORIGINAL TEST PLATE");
    var text=title.property("ADBE Text Properties").property("ADBE Text Document");var doc=text.value;doc.fontSize=34;doc.fillColor=[1,1,1];text.setValue(doc);
    title.property("ADBE Transform Group").property("ADBE Position").setValue([100,280]);
    var position=a.property("ADBE Transform Group").property("ADBE Position");position.setValueAtTime(0,[480,270]);position.setValueAtTime(1,[480,270]);position.setSelectedAtKey(1,true);
    comp.openInViewer();deselect(comp);a.selected=true;position.selected=true;position.setSelectedAtKey(1,true);comp.time=1.2;
    return {comp:comp,a:a,b:b,title:title,position:position,aStart:a.startTime,aIn:a.inPoint,aOut:a.outPoint,bStart:b.startTime,bIn:b.inPoint,bOut:b.outPoint,time:comp.time,layerCount:comp.numLayers,keySelection:position.selectedKeys.join(",")};
  }
  function preserved(f) { assert(near(f.comp.time,f.time),"Playhead changed"); assert(f.a.selected,"Original layer selection changed");assert(f.position.selectedKeys.join(",")===f.keySelection,"Selected keys changed");assert(near(f.a.startTime,f.aStart)&&near(f.a.inPoint,f.aIn)&&near(f.a.outPoint,f.aOut),"Plate A timing changed");assert(near(f.b.startTime,f.bStart)&&near(f.b.inPoint,f.bIn)&&near(f.b.outPoint,f.bOut),"Plate B timing changed");assert(f.a.parent===null&&f.b.parent===null,"User footage reparented");assert(f.a.property("ADBE Effect Parade").numProperties===0,"User footage received effects"); }
  function inspect(comp,layer) { deselect(comp);layer.selected=true;return okay(dispatch("ae.presets.inspect",{}),"Inspect"); }
  function updateCut(layer,time) { var markers=layer.property("ADBE Marker");var value=null;for(var i=markers.numKeys;i>=1;i--)if(markers.keyValue(i).comment==="CUT"){value=markers.keyValue(i);markers.removeKey(i);}assert(value!==null,"Missing CUT");markers.setValueAtTime(time,value); }
  function nativeUndo() {
    var candidates=["Undo Aplicar transição de câmera","Desfazer Aplicar transição de câmera","Undo Camera transition","Undo","Desfazer"];
    for(var i=0;i<candidates.length;i++){var id=app.findMenuCommandId(candidates[i]);if(id>0)return {id:id,name:candidates[i]};}return null;
  }
  try {
    status("RUNNING");append("HOST " + app.version + " | " + $.os);
    if (app.project && app.project.numItems>0) throw new Error("SAFETY_ABORT: isolated process opened a nonempty project; no mutation performed.");
    safeSession=true;
    app.newProject();
    $.global.MotionEmulsionAssetRoot=root+"/packs/emulsion/assets";
    $.evalFile(new File(root+"/dist/after-effects-cep/host/index.jsx"));
    assert(typeof EmulsionPack!=="undefined","Integrated runtime missing");
    row("host and bundle","PASS",app.version+" | isolated -m process");
    var noComp=dispatch("ae.presets.camera-transition",{presetId:EmulsionPackManifest.recipes[0].id,durationFrames:36,intensity:100});
    assert(!noComp.ok&&noComp.error&&noComp.error.code==="NO_ACTIVE_COMP","No-composition dispatcher preflight failed");row("No comp integrated dispatcher","PASS",MotionJson.stringify(noComp.error));
    var comps=[];
    for(var r=0;r<EmulsionPackManifest.recipes.length;r++) {
      var recipe=EmulsionPackManifest.recipes[r];
      try {
        var f=fixture(recipe.id);var comp=f.comp;
        var args={presetId:recipe.id,durationFrames:36,intensity:100};
        if(r===0){append("DEBUG global pack="+typeof $.global.EmulsionPack+"; catalog size="+EmulsionPackManifest.recipes.length+"; id="+recipe.id);append("DEBUG pack preflight="+MotionJson.stringify(EmulsionPack.preflight(comp,args)));try{append("DEBUG adapter preflight="+MotionJson.stringify(MotionRegistry.get("ae.presets.camera-transition").preflight(args,{locale:"pt-BR"})));}catch(debugError){append("DEBUG adapter exception "+String(debugError.message||debugError)+" @"+debugError.fileName+":"+debugError.line+" stack="+debugError.stack);}}
        var appliedResponse=dispatch("ae.presets.camera-transition",args);
        if(!appliedResponse.ok&&r===0){try{app.beginUndoGroup("Emulsion native debug");var direct=EmulsionPack.apply(comp,args,"pt-BR");append("DEBUG direct apply SUCCESS "+direct.layer.id);}catch(directError){append("DEBUG direct exception "+String(directError.message||directError)+" @"+directError.fileName+":"+directError.line+" stack="+directError.stack);}finally{app.endUndoGroup();}}
        var applied=okay(appliedResponse,"Apply "+recipe.id);
        var layer=findLayer(comp,applied.layerId);
        assert(applied.created===true&&comp.numLayers===f.layerCount+2,"Apply did not create exactly two layers");preserved(f);
        var replay=okay(dispatch("ae.presets.camera-transition",args),"Repeat Apply");assert(replay.created===false&&replay.layerId===layer.id&&comp.numLayers===f.layerCount+2,"Repeat Apply duplicated rig");preserved(f);
        var state=inspect(comp,layer);assert(state.state==="ready"&&state.cameraTransition&&state.presetId===recipe.id,"Inspector did not recognize film rig");
        var processor=null;for(var li=1;li<=comp.numLayers;li++)if(comp.layer(li).adjustmentLayer&&EmulsionPack.owns(comp.layer(li)))processor=comp.layer(li);assert(processor!==null,"Film processor missing");
        var props=[];expressions(layer.property("ADBE Transform Group"),props);expressions(layer.property("ADBE Time Remapping"),props);expressions(processor.property("ADBE Transform Group"),props);expressions(processor.property("ADBE Effect Parade"),props);assert(props.length===9,"Unexpected expression count "+props.length);
        for(var p=0;p<props.length;p++){props[p].valueAtTime(1.2,false);assert(!props[p].expressionError,"Native expression error: "+props[p].expressionError);}
        var exposure=effect(processor,2,"ADBE Exposure2-0003");assert(near(exposure.valueAtTime(1.2,false),recipe.exposure),"Exposure does not peak at CUT");assert(near(exposure.valueAtTime(.4,false),0),"Exposure outside transition is nonzero");
        var remap=layer.property("ADBE Time Remapping");var before=remap.valueAtTime(1.2,false);updateCut(layer,1.4);assert(remap.valueAtTime(1.2,false)<before,"Moving CUT did not retime overlay");assert(near(exposure.valueAtTime(1.4,false),recipe.exposure),"Moving CUT did not retime sibling");updateCut(layer,1.2);
        layer.startTime+=.1;assert(near(layer.property("ADBE Marker").keyTime(1),1.3),"Moving overlay did not move CUT");assert(near(exposure.valueAtTime(1.3,false),recipe.exposure),"Sibling did not follow moved overlay");layer.startTime-=.1;
        state=inspect(comp,layer);var options=state.options;options.durationFrames=30;options.intensity=75;
        okay(dispatch("ae.presets.adjust",{target:state.target,presetId:recipe.id,options:options}),"Adjust");assert(comp.numLayers===f.layerCount+2,"Adjust duplicated pair");assert(near(effect(layer,1,"ADBE Slider Control-0001").value,75)&&near(effect(layer,6,"ADBE Slider Control-0001").value,30),"Adjust did not update native controls");
        state=inspect(comp,layer);options=state.options;options.durationFrames=36;options.intensity=100;okay(dispatch("ae.presets.adjust",{target:state.target,presetId:recipe.id,options:options}),"Reset Adjust");
        comp.time=1.08;comp.saveFrameToPng(1.08,new File(out.fsName+"/"+recipe.id+".png"));
        comps.push(comp);row(recipe.id,"PASS","Apply, repeat, inspector, 9 native expressions, CUT, layer move, Adjust, preservation, rendered still");
      } catch(recipeError) { row(recipe.id,"FAIL",String(recipeError.message||recipeError)+" @line "+recipeError.line); }
    }
    try {
      var lf=fixture("Emulsion lifecycle fixture");var la=okay(dispatch("ae.presets.camera-transition",{presetId:EmulsionPackManifest.recipes[0].id,durationFrames:36,intensity:100}),"Lifecycle apply");var live=findLayer(lf.comp,la.layerId);var liveProcessor=null;for(var l=1;l<=lf.comp.numLayers;l++)if(lf.comp.layer(l).adjustmentLayer)liveProcessor=lf.comp.layer(l);
      var ep=effect(liveProcessor,2,"ADBE Exposure2-0003");var liveValue=ep.valueAtTime(1.2,false);inspect(lf.comp,live);okay(dispatch("ae.presets.bake",{}),"Bake");assert(!EmulsionPack.owns(live)&&ep.expression===""&&ep.numKeys>0&&near(ep.valueAtTime(1.2,false),liveValue),"Bake changed appearance sample or left dependency");row("Bake native","PASS","Frame samples preserve exposure peak; expressions removed; ordinary editable layers retained");
      var rf=fixture("Emulsion remove fixture");var ra=okay(dispatch("ae.presets.camera-transition",{presetId:EmulsionPackManifest.recipes[1].id,durationFrames:36,intensity:100}),"Remove apply");inspect(rf.comp,findLayer(rf.comp,ra.layerId));okay(dispatch("ae.presets.remove",{}),"Remove");assert(rf.comp.numLayers===rf.layerCount,"Remove left layers or removed user footage");row("Remove native","PASS","Managed pair removed; original three layers retained");
    } catch(lifecycleError) { row("Native lifecycle","FAIL",String(lifecycleError.message||lifecycleError)+" @line "+lifecycleError.line); }
    try {
      var nf=fixture("Emulsion negative fixture");var missing=new Folder(out.fsName+"/empty-assets");missing.create();EmulsionPack.configure(EmulsionPackManifest,missing.fsName);var absent=dispatch("ae.presets.camera-transition",{presetId:EmulsionPackManifest.recipes[0].id,durationFrames:36,intensity:100});assert(!absent.ok&&absent.error.message.indexOf("overlay is missing")>=0&&nf.comp.numLayers===nf.layerCount,"Missing-media preflight returned another failure, mutated or succeeded");EmulsionPack.configure(EmulsionPackManifest,root+"/packs/emulsion/assets");row("Missing media","PASS",MotionJson.stringify(absent.error));
      var none=EmulsionPack.preflight(null,{presetId:EmulsionPackManifest.recipes[0].id,durationFrames:36,intensity:100});assert(none&&none.code==="NO_ACTIVE_COMP","No-comp preflight not typed");row("No comp runtime","PASS",none.code);
      var uf=fixture("Emulsion Undo fixture");var ur=okay(dispatch("ae.presets.camera-transition",{presetId:EmulsionPackManifest.recipes[2].id,durationFrames:36,intensity:100}),"Undo apply");var undo=nativeUndo();if(!undo)row("Single Undo","NOT RUN","No localized native Undo command resolved");else{app.executeCommand(undo.id);assert(uf.comp.numLayers===uf.layerCount,"Single Undo did not remove the two managed layers");row("Single Undo","PASS",undo.name+" resolved ID "+undo.id);}
    } catch(negativeError) { row("Negative/Undo native","FAIL",String(negativeError.message||negativeError)+" @line "+negativeError.line); }
    app.project.save(new File(out.fsName+"/emulsion-smoke.aep"));row("Project saved","PASS",out.fsName+"/emulsion-smoke.aep");
    try {
      var renders=Math.min(3,comps.length);
      for(var q=0;q<renders;q++){
        var rq=app.project.renderQueue.items.add(comps[q]);var om=rq.outputModule(1);var templates=om.templates;var chosen=null;for(var t=0;t<templates.length;t++)if(templates[t].indexOf("H.264")>=0&&templates[t].indexOf("15 Mbps")>=0){chosen=templates[t];break;}
        if(!chosen)throw new Error("Native H.264 15 Mbps output template unavailable");om.applyTemplate(chosen);om.file=new File(out.fsName+"/"+comps[q].name+".mp4");rq.timeSpanStart=0;rq.timeSpanDuration=comps[q].duration;
      }
      if(renders>0)app.project.renderQueue.render();
      for(q=0;q<renders;q++){var mp4=new File(out.fsName+"/"+comps[q].name+".mp4");assert(mp4.exists&&mp4.length>1000,"Rendered MP4 missing: "+mp4.fsName);row("Render "+comps[q].name,"PASS",mp4.fsName+" | "+mp4.length+" bytes");}
    } catch(renderError){row("Native MP4 render","FAIL",String(renderError.message||renderError)+" @line "+renderError.line);}
  } catch(error) { fatal=String(error.message||error)+" @line "+error.line;append("FATAL "+fatal); }
  finally {
    var failed=Boolean(fatal);for(var x=0;x<rows.length;x++)if(rows[x].status==="FAIL")failed=true;
    try {var report={host:app.version,os:$.os,isolated:true,protectedUserPid:24736,output:out.fsName,overall:failed?"FAIL":"PASS",fatal:fatal,rows:rows};if(typeof MotionJson!=="undefined"){write(new File(out.fsName+"/smoke.json"),MotionJson.stringify(report));write(new File(artifactRoot.fsName+"/latest.json"),MotionJson.stringify(report));}status(failed?"FAIL":"PASS");}catch(reportError){append("REPORT ERROR "+reportError);}
    if(safeSession){try{app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);append("Owned project closed");}catch(closeError){append("CLOSE ERROR "+String(closeError.message||closeError));}try{append("Quitting owned application");app.quit();}catch(quitError){append("QUIT ERROR "+String(quitError.message||quitError));}}
  }
}());
