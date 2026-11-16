// Disposable visual QA fixture. Run only in an owned, empty After Effects process.
(function () {
  var repo=File($.fileName).parent.parent.fsName;
  var output=new Folder(repo+"/artifacts/ae-native");if(!output.exists)output.create();
  var result={status:"FAIL",host:app.version,build:app.buildName};
  try {
    if(!app.project||app.project.file||app.project.numItems!==0)throw new Error("QA requires an empty unsaved project; nothing changed.");
    $.evalFile(new File(Folder.userData.fsName+"/Adobe/CEP/extensions/com.motion.plugin.ae/host/index.jsx"));
    var comp=app.project.items.addComp("Moti.on Native UI QA",1280,720,1,6,30);
    comp.openInViewer();var layer=comp.layers.addText("Moti.on\rNative UI QA");layer.name="Native UI QA Text";
    layer.property("ADBE Transform Group").property("ADBE Position").setValue([640,360]);
    layer.selected=true;comp.time=.7;
    result.status="PASS";result.compId=comp.id;result.layerId=layer.id;
    result.note="Fixture preparation only. UI application, adjustment and Undo need separate evidence.";
  } catch(error){result.error=String(error);}
  var file=new File(output.fsName+"/host-fixture.json");file.encoding="UTF-8";
  if(file.open("w")){file.write(typeof MotionJson!=="undefined"?MotionJson.stringify(result):result.status+": "+result.error);file.close();}
}());
