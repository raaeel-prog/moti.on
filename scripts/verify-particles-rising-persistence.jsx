// Run with AfterFX -m -r. Refuses any saved/nonempty project before mutation.
(function(){
 var root="C:/dev/Moti.on/implementation",out=root+"/artifacts/particles-rising-20261031",report={status:"NOT RUN",host:app.version},file=new File(out+"/persistence.aep");
 function save(){var f=new File(out+"/persistence.json");f.encoding="UTF-8";f.open("w");f.write(MotionJson.stringify(report));f.close();}
 if(!app.project||app.project.file||app.project.numItems!==0){report.reason="Dedicated empty unsaved instance required";var blocked=new File(out+"/persistence-blocked.txt");blocked.open("w");blocked.write(report.reason);blocked.close();return;}
 var installed=new File(Folder.userData.fsName+"/Adobe/CEP/extensions/com.motion.plugin.ae/host/index.jsx");$.evalFile(installed);
 function assert(v,m){if(!v)throw new Error(m);}
 function send(c,command,args){c.openInViewer();var r=MotionJson.parse(MotionAE.dispatch(MotionJson.stringify({protocolVersion:1,requestId:"rising-persist",command:command,args:args||{},context:{host:"after-effects",hostVersion:app.version},options:{preserveSelection:true}})));assert(r.ok,MotionJson.stringify(r.error));return r.data;}
 try{
 var c=app.project.items.addComp("Moti.on Rising persistence",640,360,1,8,30),d=send(c,"ae.effect.particles",{mode:"rising",direction:225,spread:20});
 c.saveFrameToPng(2,new File(out+"/before-reopen.png"));app.project.save(file);app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);app.open(file);
 c=null;for(var i=1;i<=app.project.numItems;i++)if(app.project.item(i) instanceof CompItem)c=app.project.item(i);assert(c,"Saved fixture composition missing");
 var read=send(c,"ae.effect.particles.read",{});assert(read.settings.direction===225,"Angle changed after reopen");assert(read.settings.spread===20,"Spread changed after reopen");assert(read.rigId===d.rigId,"Rig identity changed after reopen");assert(c.numLayers===1&&c.layer(1).source instanceof CompItem&&c.layer(1).source.numLayers===5,"Saved precomp structure changed");c.saveFrameToPng(2,new File(out+"/after-reopen.png"));
 report={status:"PASS",host:app.version,loadedHost:installed.fsName,fixture:file.fsName,rigId:read.rigId,direction:read.settings.direction,spread:read.settings.spread,layers:c.numLayers,internalLayers:c.layer(1).source.numLayers};save();
 }catch(e){report={status:"FAIL",host:app.version,error:String(e),line:e.line};save();}
 if(app.project.file&&app.project.file.fsName===file.fsName){app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);app.newProject();}
}());
