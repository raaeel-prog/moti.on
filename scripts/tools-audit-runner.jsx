// Local QA runner. Run once in an empty unsaved project; remove with request {operation:"stop"}.
// Only the four named, repository-owned fixtures can be invoked. Never included in the panel.
(function () {
  // Loading the runner is read-only. Every mutating fixture independently refuses
  // saved/nonempty projects; inspection remains available to diagnose that guard.
  if (!app.project) throw new Error("QA runner requires an open project.");
  var root = File($.fileName).parent.parent.fsName;
  $.evalFile(new File(root + "/dist/after-effects-cep/host/index.jsx"));
  var state = {root: root, started: new Date().getTime(), nonce: "", stopped: false};
  var targets = {parallax: "verify-parallax-tools-audit.jsx", gradient: "verify-gradient-tools-audit.jsx", particles: "verify-particles-tools-audit.jsx", ease: "verify-ease-tools-audit.jsx", all: "verify-all-tools-audit.jsx", inspect: "tools-audit-inspect.jsx", cleanup: "tools-audit-cleanup-probe.jsx", controls: "verify-tool-controls-native.jsx", faults: "verify-tool-faults-native.jsx", instrumented: "verify-tool-instrumented-faults.jsx"};
  function status(data) { var file = new File(root + "/artifacts/tools-audit/runner-status.json"); file.encoding = "UTF-8"; if (file.open("w")) { file.write(MotionJson.stringify(data)); file.close(); } }
  $.global.MotionAuditTick = function () {
    if (state.stopped || new Date().getTime() - state.started > 3600000) return;
    var file = new File(root + "/artifacts/tools-audit/runner-request.json");
    try {
      if (file.exists && file.open("r")) {
        var raw = file.read(); file.close(); var request = MotionJson.parse(raw);
        if (typeof request.nonce === "string" && request.nonce !== state.nonce) {
          state.nonce = request.nonce;
          if (request.operation === "stop") { state.stopped = true; status({status:"STOPPED",nonce:state.nonce}); return; }
          if (!targets[request.operation]) throw new Error("Unknown QA fixture.");
          var script = new File(root + "/scripts/" + targets[request.operation]);
          if (!script.exists) throw new Error("Fixture is not ready.");
          status({status:"RUNNING",nonce:state.nonce,operation:request.operation});
          $.evalFile(script);
          status({status:"COMPLETED",nonce:state.nonce,operation:request.operation});
        }
      }
    } catch (error) { status({status:"FAIL",nonce:state.nonce,error:String(error),line:error.line||null}); }
    if (!state.stopped) app.scheduleTask("$.global.MotionAuditTick()", 750, false);
  };
  var inventory = [];
  for (var i = 1; i <= app.project.numItems; i++) { var item = app.project.item(i); inventory.push({id:item.id,name:item.name,type:item.typeName,children:item instanceof FolderItem ? item.numItems : null}); }
  status({status:"READY",host:app.version,items:inventory,saved:Boolean(app.project.file)});
  app.scheduleTask("$.global.MotionAuditTick()", 750, false);
}());
