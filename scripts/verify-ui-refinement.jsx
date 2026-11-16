// Creates an isolated, unsaved QA fixture; refuses to touch an existing project.
// Run in an owned AfterFX.exe -m process after building the review candidate.
(function () {
  var repo = File($.fileName).parent.parent.fsName;
  var output = new Folder(repo + "/artifacts/ui-refinement-host");
  if (!output.exists) output.create();
  var result = {host: app.version, build: app.buildName, os: $.os, status: "FAIL"};
  try {
    if (!app.project || app.project.file || app.project.numItems !== 0) throw new Error("QA requires an empty unsaved project; nothing changed.");
    $.evalFile(new File(repo + "/dist/after-effects-cep/host/index.jsx"));
    var comp = app.project.items.addComp("Moti.on UI Refinement QA", 1280, 720, 1, 6, 30);
    comp.openInViewer();
    var layer = comp.layers.addText("Moti.on\rInterface QA");
    layer.name = "UI QA Text";
    layer.property("ADBE Transform Group").property("ADBE Position").setValue([640,360]);
    layer.selected = true; comp.time = 0.7;
    result.status = "PASS"; result.compId = comp.id; result.layerId = layer.id;
    result.note = "Fixture prepared only; UI application and Undo require separate observations.";
  } catch (error) { result.error = String(error); }
  var file = new File(output.fsName + "/fixture.json"); file.encoding = "UTF-8";
  if (file.open("w")) { file.write(MotionJson.stringify(result)); file.close(); }
}());
