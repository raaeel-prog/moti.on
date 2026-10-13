/* Observation only: installed FFX is applied to disposable original text.
 * Third-party expressions and media are never copied into the product. */
var report={status:"RUNNING",runId:job.runId,hostVersion:app.version,userProjectGuard:false,entries:[]};
function writeReport(){var serialized=MotionJson.stringify(report),file=File(job.report);file.encoding="UTF-8";if(!file.open("w"))throw Error(file.error);try{file.write(serialized);}finally{file.close();}}
function observe(group,path,out){var i,p,record,k,easing,e;
  for(i=1;i<=group.numProperties;i++){
    p=group.property(i);record={path:path+"/"+p.matchName,name:p.name,matchName:p.matchName};
    if(p.numProperties){record.children=[];observe(p,record.path,record.children);}
    else{
      record.keys=[];if(p.numKeys)for(k=1;k<=p.numKeys;k++){
        var key={time:p.keyTime(k)},keyValue=p.keyValue(k);if(typeof keyValue==="number"||typeof keyValue==="string"||typeof keyValue==="boolean"||keyValue instanceof Array)key.value=keyValue;
        try{key.inInterpolation=String(p.keyInInterpolationType(k));key.outInterpolation=String(p.keyOutInterpolationType(k));easing=p.keyInTemporalEase(k);key.inEase=[];for(e=0;e<easing.length;e++)key.inEase.push({speed:easing[e].speed,influence:easing[e].influence});easing=p.keyOutTemporalEase(k);key.outEase=[];for(e=0;e<easing.length;e++)key.outEase.push({speed:easing[e].speed,influence:easing[e].influence});}catch(ignored){}
        record.keys.push(key);
      }
      try{var value=p.value;if(typeof value==="number"||typeof value==="string"||typeof value==="boolean"||value instanceof Array)record.value=value;}catch(ignoredValue){}
      if(p.canSetExpression&&p.expression){record.expression={enabled:p.expressionEnabled,length:p.expression.length,usesTextIndex:/textIndex/.test(p.expression),usesTextTotal:/textTotal/.test(p.expression),usesEase:/ease|linear/.test(p.expression),usesRandom:/random|seedRandom/.test(p.expression),usesWave:/sin|cos|wiggle/.test(p.expression)};}
    }
    out.push(record);
  }
}
try{
  $.evalFile(File(job.host));
  if(!app.project||app.project.numItems!==0||app.project.file){report.status="ABORTED_USER_PROJECT_GUARD";writeReport();return;}
  report.userProjectGuard=true;writeReport();app.beginSuppressDialogs();
  var i,entry,comp,layer,source,document,rect,animators,observed;
  for(i=0;i<job.entries.length;i++){
    entry=job.entries[i];comp=app.project.items.addComp("Study "+entry.name,480,270,1,5,24);comp.bgColor=[.071,.071,.071];
    comp.duration=4;comp.motionBlur=true;comp.shutterAngle=180;comp.layers.addSolid([.071,.071,.071],"Original study background",480,270,1,4);
    layer=comp.layers.addText("Make it\rMoti.on");layer.motionBlur=true;source=layer.property("ADBE Text Properties").property("ADBE Text Document");document=source.value;document.font="ArialMT";document.fontSize=52;document.fillColor=[.91,.92,.94];document.justification=ParagraphJustification.CENTER_JUSTIFY;source.setValue(document);
    rect=layer.sourceRectAtTime(0,false);layer.property("ADBE Transform Group").property("ADBE Anchor Point").setValue([rect.left+rect.width/2,rect.top+rect.height/2]);layer.property("ADBE Transform Group").property("ADBE Position").setValue([240,135]);
    comp.openInViewer();comp.time=0;layer.selected=true;report.activePreset=entry.name;report.stage="applyPreset";writeReport();layer.applyPreset(File(entry.path));report.stage="observe";writeReport();
    observed=[];observe(layer.property("ADBE Text Properties").property("ADBE Text Animators"),"text/animators",observed);
    var more=[];observe(layer.property("ADBE Text Properties").property("ADBE Text More Options"),"text/more",more);
    var controls=[];observe(layer.property("ADBE Effect Parade"),"effects",controls);
    if(entry.avi){var renderItem=app.project.renderQueue.items.add(comp),output=renderItem.outputModule(1),templates=output.templates,ti;renderItem.timeSpanStart=0;renderItem.timeSpanDuration=4;for(ti=0;ti<templates.length;ti++)if(templates[ti]==="Sem perdas"||templates[ti]==="Lossless"){output.applyTemplate(templates[ti]);break;}output.file=File(entry.avi);}
    report.entries.push({name:entry.name,ffxSha256:entry.sha256,status:"PASS",animators:observed,more:more,controls:controls,threeDLayer:layer.threeDLayer,threeDPerChar:layer.threeDPerChar,editableText:source.value.text==="Make it\rMoti.on"});writeReport();
  }
  if(job.aep)app.project.save(File(job.aep));report.status="PASS";writeReport();app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);app.endSuppressDialogs(false);app.quit();
}catch(error){report.status="FAIL";report.error={message:String(error),line:error.line||0};try{writeReport();}catch(ignoredWrite){}if(report.userProjectGuard){app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);app.endSuppressDialogs(false);app.quit();}}
