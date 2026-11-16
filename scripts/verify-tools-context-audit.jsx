// Read-only native preflight checks. A nonempty or saved project is refused.
(function(){
  var repo=File($.fileName).parent.parent.fsName;$.evalFile(new File(repo+'/scripts/tools-audit-fixture-lib.jsx'));
  var qa=new MotionToolsAudit(repo,'context'),file=new File(repo+'/scripts/verify-all-tools-audit-fixtures.json');file.open('r');var input=MotionJson.parse(file.read());file.close();
  function check(id,command,args,requiresComp){qa.test(id+': no active composition',function(){
    var handler=MotionRegistry.get(command);qa.assert(handler && typeof handler.preflight==='function','Handler is missing.');
    // The dispatcher owns the context guards before handler preflight.
    var response=MotionJson.parse(MotionAE.dispatch(MotionJson.stringify({protocolVersion:1,requestId:'no-comp-'+id,command:command,args:args,options:{mode:'advanced',preserveSelection:true,allowDestructive:true},context:{host:'after-effects',hostVersion:app.version}})));
    qa.assert(app.project.numItems===0 && app.project.file===null,'Preflight mutated the empty project.');
    qa.assert(!requiresComp || (response && !response.ok && response.error && typeof response.error.code==='string'),'A composition-dependent command accepted an absent composition.');
    return {command:command,outcome:response.ok?'valid without composition':response.error.code,projectItems:app.project.numItems};
  });}
  try{
    for(var i=0;i<input.tools.length;i++){var tool=input.tools[i];check(tool.id,tool.command,tool.args,tool.id!=='clean');}
    for(i=0;i<input.quickActions.length;i++){var action=input.quickActions[i].id;check('quick.'+action,action==='save-frame'?'ae.quick-tools.save-frame':'ae.quick-tools.apply',{action:action},true);}
  }catch(error){qa.result.fatal=String(error);}finally{qa.finish();}
}());
