/* Interactive Undo fixture. UI Undo is deliberately not simulated by script. */
var report={status:"RUNNING",runId:job.runId,hostVersion:app.version,mode:job.mode};
function saveReport(){var serialized=MotionJson.stringify(report),f=File(job.report);f.encoding="UTF-8";if(!f.open("w"))throw Error(f.error);try{f.write(serialized);}finally{f.close();}}
function check(value,message){if(!value)throw Error(message);}
function command(id,args){var response=MotionJson.parse(MotionAE.dispatch(MotionJson.stringify({protocolVersion:MotionContracts.PROTOCOL_VERSION,requestId:"undo-"+job.mode,command:"ae.presets."+id,args:args||{},context:{host:"after-effects",hostVersion:app.version,locale:"en-US"},options:{preserveSelection:true}})));check(response.ok,MotionJson.stringify(response.error));return response.data;}
function snapshot(layer){return {comment:layer.comment,animators:layer.property("ADBE Text Properties").property("ADBE Text Animators").numProperties,effects:layer.property("ADBE Effect Parade").numProperties,threeDLayer:layer.threeDLayer,threeDPerChar:layer.threeDPerChar,text:layer.property("ADBE Text Properties").property("ADBE Text Document").value.text,markers:layer.property("ADBE Marker").numKeys,selected:layer.selected};}
try{
  $.evalFile(File(job.host));
  var comp,layer;
  if(job.mode==="setup"){
    check(app.project&&app.project.numItems===0&&!app.project.file,"User project guard rejected setup");
    comp=app.project.items.addComp("Moti.on Text v3 Interactive Undo",480,270,1,4,24);layer=comp.layers.addText("Undo Moti.on");layer.comment="Original editable text";layer.property("ADBE Transform Group").property("ADBE Position").setValue([60,135]);layer.selected=true;comp.openInViewer();app.project.save(File(job.project));
    report.before=snapshot(layer);report.status="READY";
  }else{
    check(app.project&&app.project.file&&app.project.file.fsName===File(job.project).fsName,"User project guard rejected operation");comp=app.project.item(1);check(comp.name==="Moti.on Text v3 Interactive Undo","Unexpected fixture");layer=comp.layer(1);check(comp.selectedLayers.length===1&&comp.selectedLayers[0].id===layer.id,"Selection changed");
    if(job.mode==="apply"){
      report.before=snapshot(layer);command("apply",{presetId:"text-v3-characters-rotate-yaw-3d",phase:"both",direction:"preset",durationFrames:24,intensity:100,staggerFrames:2,unit:"preset"});report.after=snapshot(layer);check(report.after.animators>0&&report.after.threeDPerChar,"3D application missing");report.status="AWAITING_UI_UNDO";
    }else if(job.mode==="verify"){
      report.after=snapshot(layer);check(report.after.comment==="Original editable text"&&report.after.animators===0&&report.after.effects===0&&!report.after.threeDLayer&&!report.after.threeDPerChar&&report.after.markers===0&&report.after.text==="Undo Moti.on"&&report.after.selected,"One UI Undo did not restore the fixture");report.status="PASS";report.undo={source:"Windows UI Ctrl+Z",count:1};
    }else if(job.mode==="cleanup"){
      app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);report.status="CLOSED_OWN_FIXTURE";saveReport();app.quit();return;
    }
  }
  saveReport();
}catch(error){report.status="FAIL";report.error={message:String(error),line:error.line||0};try{saveReport();}catch(ignored){}}
