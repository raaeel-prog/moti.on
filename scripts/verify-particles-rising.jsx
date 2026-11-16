// Owned temporary compositions only; never saves/closes the user's project.
(function () {
  var root = "C:/dev/Moti.on/implementation", out = root + "/artifacts/particles-rising-20261031";
  var previous = app.project.activeItem, original = [], created = [], serial = 0;
  for (var i = 1; i <= app.project.numItems; i++) original.push(app.project.item(i).id);
  var loadedHost = new File(Folder.userData.fsName + "/Adobe/CEP/extensions/com.motion.plugin.ae/host/index.jsx"); $.evalFile(loadedHost);
  var report = {loadedHost: {path:loadedHost.fsName, bytes:loadedHost.length}, host: app.version, status: "RUNNING", tests: [], frames: [], originalItemIds: original, notRun: ["Project reopen", "UI Undo/Redo", "Installed panel interaction"]};
  function save() { var f = new File(out + "/native.json"); f.encoding = "UTF-8"; f.open("w"); f.write(MotionJson.stringify(report)); f.close(); }
  function assert(value, message) { if (!value) throw new Error(message); }
  function test(name, fn) { try { report.tests.push({name:name,status:"PASS",data:fn()}); } catch(e) { report.tests.push({name:name,status:"FAIL",error:String(e),line:e.line}); } save(); }
  function send(comp, command, args) { comp.openInViewer(); var r = MotionJson.parse(MotionAE.dispatch(MotionJson.stringify({protocolVersion:1, requestId:"rising-"+(++serial), command:command, args:command==="ae.effect.particles"?withInline(args||{}):(args||{}), context:{host:"after-effects",hostVersion:app.version}, options:{preserveSelection:true}}))); assert(r.ok, MotionJson.stringify(r.error)); return r.data; }
  function withInline(args){args.precompose=false;return args;}
  function comp(width,height) { var c=app.project.items.addComp("Moti.on QA Rising",width,height,1,8,30);created.push(c);return c; }
  function rememberSources(c) { for(var n=1;n<=c.numLayers;n++) if(c.layer(n).source){var source=c.layer(n).source;created.push(source);if(source instanceof CompItem)rememberSources(source);} }
  function frame(c,name,time) { var path=out+"/"+name+".png",f=new File(path);c.time=time;c.openInViewer();c.saveFrameToPng(time,f);var bytes=0,last=-1,stable=0;for(var wait=0;wait<100;wait++){bytes=new File(path).length;stable=bytes>0&&bytes===last?stable+1:0;if(stable>=2)break;last=bytes;$.sleep(100);}assert(bytes>8&&stable>=2,"Native PNG did not finish: "+name);report.frames.push({path:path,time:time,bytes:bytes}); }
  save();
  try {
    for(var a=0;a<4;a++)(function(angle){test("calibration "+angle,function(){
      var c=comp(640,360), d=send(c,"ae.effect.particles",{mode:"rising",direction:angle,spread:0,velocity:.2,size:.03,birthRate:10,opacity:100});rememberSources(c);
      var control=c.layer(5);for(var j=1;j<=c.numLayers;j++)if(c.layer(j).id===d.controllerLayerId)control=c.layer(j);
      var birth=control.property("ADBE Effect Parade").property("Moti.on Particles birthRate").property(1);
      birth.setValueAtTime(0,10);birth.setValueAtTime(.1,0);birth.setInterpolationTypeAtKey(1,KeyframeInterpolationType.HOLD);birth.setInterpolationTypeAtKey(2,KeyframeInterpolationType.HOLD);
      for(j=1;j<=c.numLayers;j++){var parade=c.layer(j).property("ADBE Effect Parade");for(var k=1;k<=parade.numProperties;k++)if(parade.property(k).matchName==="CC Particle World"){var fx=parade.property(k);fx.property("CC Particle World-0007").setValue(0);fx.property("CC Particle World-0008").setValue(0);fx.property("CC Particle World-0010").setValue(.1);fx.property("CC Particle World-0011").expression="";fx.property("CC Particle World-0011").setValue(.1);}}
      frame(c,"direction-"+angle+"-a",1);frame(c,"direction-"+angle+"-b",1.2);return {controllerLayerId:d.controllerLayerId};
    });}(a*90));
    test("precomp creation, outer-layer adjustment and removal",function(){
      var c=comp(640,360);c.openInViewer();
      var response=MotionJson.parse(MotionAE.dispatch(MotionJson.stringify({protocolVersion:1,requestId:"native-precomp",command:"ae.effect.particles",args:{mode:"rising"},context:{host:"after-effects",hostVersion:app.version},options:{preserveSelection:true}})));assert(response.ok,MotionJson.stringify(response.error));assert(c.numLayers===1,"Parent composition must contain one precomp layer");
      var wrapper=c.layer(1),inner=wrapper.source;created.push(inner);rememberSources(inner);assert(inner instanceof CompItem&&inner.numLayers===5,"Internal rig missing");assert(response.data.precomposed===true,"Precomp receipt missing");wrapper.selected=true;
      var read=send(c,"ae.effect.particles.read",{});assert(read.settings.direction===0,"Cannot read selected precomp");send(c,"ae.effect.particles",{mode:"rising",direction:90,changedFields:["direction"],targetCompId:c.id,targetRigId:read.rigId});assert(send(c,"ae.effect.particles.read",{}).settings.direction===90,"Precomp direction was not adjusted");assert(c.numLayers===1&&inner.numLayers===5,"Adjustment duplicated layers");frame(c,"precomp",3);
      send(c,"ae.effect.particles",{action:"remove"});assert(c.numLayers===0,"Precomp layer was not removed");return {parentLayers:1,internalLayers:5,direction:90,removed:true};
    });
    test("migration keeps native editability and restores original style physics",function(){var c=comp(640,360),d=send(c,"ae.effect.particles",{mode:"field3d"});rememberSources(c);var controller=null;for(var j=1;j<=c.numLayers;j++)if(c.layer(j).id===d.controllerLayerId)controller=c.layer(j);
      controller.comment=controller.comment.replace('"schemaVersion":3','"schemaVersion":2');controller.selected=true;
      send(c,"ae.effect.particles",{mode:"field3d",direction:45,spread:20,changedFields:["direction","spread"],targetRigId:d.rigId,targetCompId:c.id});assert(c.numLayers===5,"Migration duplicated layers");
      var parade=controller.property("ADBE Effect Parade"),op=parade.property("Moti.on Particles opacity").property(1);op.setValueAtTime(0,42);
      send(c,"ae.effect.particles",{mode:"field3d",direction:90,changedFields:["direction"],targetRigId:d.rigId,targetCompId:c.id});assert(controller.property("ADBE Effect Parade").property("Moti.on Particles opacity").property(1).numKeys===1,"Unrelated keyframe lost");
      op=controller.property("ADBE Effect Parade").property("Moti.on Particles opacity").property(1);op.removeKey(1);
      send(c,"ae.effect.particles",{mode:"snow"});assert(send(c,"ae.effect.particles.read",{}).settings.direction===undefined,"Original style still directional");send(c,"ae.effect.particles",{action:"remove"});assert(c.numLayers===0,"Rig removal incomplete");return {migration:"PASS",keyframePreservation:"PASS",remove:"PASS"};
    });
    test("portrait, live read, sparse adjust and idempotency",function(){var c=comp(360,640),d=send(c,"ae.effect.particles",{mode:"rising"});rememberSources(c);var controller=null;for(var j=1;j<=c.numLayers;j++)if(c.layer(j).id===d.controllerLayerId)controller=c.layer(j);
      controller.selected=true;var opacity=controller.property("ADBE Effect Parade").property("Moti.on Particles opacity").property(1);opacity.setValue(42);
      var read=send(c,"ae.effect.particles.read",{});assert(read.settings.opacity===42,"Read missed manual opacity");
      var adjusted=send(c,"ae.effect.particles",{mode:"rising",direction:90,changedFields:["direction"],targetRigId:read.rigId,targetCompId:c.id});assert(c.numLayers===5,"Duplicate rig");assert(opacity.value===42,"Manual opacity overwritten");
      assert(send(c,"ae.effect.particles.read",{}).settings.direction===90,"Direction mismatch");frame(c,"portrait",3);
      return {layers:c.numLayers,read:read,adjusted:adjusted};
    });
  } catch(e) { report.fatal=String(e); }
  finally {
    for(i=0;i<created.length;i++)try{if(created[i] instanceof CompItem)created[i].remove();}catch(ignored){}
    for(i=created.length-1;i>=0;i--)try{if(!(created[i] instanceof CompItem)&&created[i].usedIn.length===0)created[i].remove();}catch(gone){}
    if(previous instanceof CompItem)previous.openInViewer();
    // AE creates its shared Solids folder implicitly; remove only new empty folders.
    for(i=app.project.numItems;i>=1;i--){var item=app.project.item(i),wasOriginal=false;for(var o=0;o<original.length;o++)if(original[o]===item.id)wasOriginal=true;if(!wasOriginal&&item instanceof FolderItem&&item.numItems===0)item.remove();}
    var remaining=[];for(i=1;i<=app.project.numItems;i++)remaining.push(app.project.item(i).id);
    report.remainingItemIds=remaining;report.status=report.fatal?"FAIL":"PASS";for(i=0;i<report.tests.length;i++)if(report.tests[i].status==="FAIL")report.status="FAIL";
    if(MotionJson.stringify(remaining)!==MotionJson.stringify(original)) { report.cleanupError="Original project item identities changed";report.status="FAIL"; }
    report.completed=true;save();
  }
}());
