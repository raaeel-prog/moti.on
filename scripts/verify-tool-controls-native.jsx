// First-party native panel fixtures. Requests name an allowlisted fixture/phase only.
(function(){
 var repo=File($.fileName).parent.parent.fsName,requestFile=new File(repo+'/artifacts/tools-audit/controls-request.json');
 $.evalFile(new File(repo+'/scripts/tools-audit-state.jsx'));
 requestFile.open('r');var request=MotionJson.parse(requestFile.read());requestFile.close();
 if(!/^[A-Za-z][A-Za-z0-9]*$/.test(request.tool))throw new Error('Invalid tool identity.');
 var folder=new Folder(repo+'/artifacts/tools-audit/controls-native');if(!folder.exists)folder.create();
 var file=new File(folder.fsName+'/'+request.tool+'-result.json'),state,c;
 function assert(value,message){if(!value)throw new Error(message);}
 function ids(){var result=[];for(var i=1;i<=app.project.numItems;i++)result.push(app.project.item(i).id);return result;}
 function save(){file.encoding='UTF-8';assert(file.open('w'),'Cannot save control receipt.');file.write(MotionJson.stringify(state));file.close();}
 function find(){for(var i=1;i<=app.project.numItems;i++)if(app.project.item(i).id===state.compId)return app.project.item(i);return null;}
 function snapshot(){return MotionAuditState(c);}
 if(request.phase==='prepare'){
  assert(app.project && !app.project.file && app.project.numItems===0,'Requires an EMPTY UNSAVED project.');
  $.global.MotionCatalogPrepareOnly=true;try{$.evalFile(new File(repo+'/scripts/verify-all-tools-audit.jsx'));}finally{$.global.MotionCatalogPrepareOnly=false;}
  if(request.tool==='particles')c=app.project.items.addComp('Moti.on QA controls particles',640,360,1,8,30);
  else c=$.global.MotionCatalogForUndo.prepare(request.tool).comp;
  c.openInViewer();state={tool:request.tool,host:app.version,compId:c.id,ownedIds:ids(),before:snapshot(),observations:[],status:'RUNNING',completed:false};save();return;
 }
 assert(file.exists,'Preparation missing.');file.open('r');state=MotionJson.parse(file.read());file.close();
 if(request.phase==='reopen-probe'){
  assert(app.project && app.project.file===null && app.project.numItems===0,'Probe requires empty project.');
  var ownPath=new File(folder.fsName+'/'+request.tool+'.aep');assert(typeof state.projectFile==='string' && new File(state.projectFile).fsName===ownPath.fsName,'Unexpected QA save path.');
  app.open(ownPath);c=find();assert(c,'QA saved comp missing.');state.ownedIds=ids();
  state.persistenceBefore=state.observations[state.observations.length-1].snapshot;state.persistenceAfter=snapshot();state.persistenceComparison=MotionAuditPersistenceCompare(state.persistenceBefore,state.persistenceAfter);state.reopen=state.persistenceComparison.equal?'PASS':'FAIL';state.status=state.reopen;for(var oi=0;oi<state.observations.length;oi++)if(state.observations[oi].status!=='PASS')state.status='FAIL';save();return;
 }
 c=find();assert(c,'QA composition ownership changed.');
 var currentFile=app.project.file;
 if(currentFile!==null){assert(typeof state.projectFile==='string','Unexpected saved project.');assert(currentFile.fsName===new File(state.projectFile).fsName,'Saved project ownership changed.');}
 if(request.phase==='observe'){
  var observed=snapshot(),basis=request.reference==='previous' && state.observations.length?state.observations[state.observations.length-1].snapshot:state.before,changed=observed!==basis,expected=request.expectChanged===true,values=[],valuePass=true;
  if(request.effect){
   for(var li=1;li<=c.numLayers;li++){var parade=c.layer(li).property('ADBE Effect Parade'),found=false;
    if(parade)for(var fi=1;fi<=parade.numProperties;fi++){var effect=parade.property(fi);if(effect.matchName===request.effect.matchName){var parameter=effect.property(request.effect.parameter),value=parameter.value;values.push(value);if(MotionJson.stringify(value)!==MotionJson.stringify(request.effect.value))valuePass=false;found=true;}}
    if(!found)valuePass=false;
   }
  }
  if(request.tool==='gradient')state.gradientRead=MotionJson.parse(MotionAE.dispatch(MotionJson.stringify({protocolVersion:1,requestId:'qa-gradient-control-read',command:'ae.effect.gradient.read',args:{},context:{host:'after-effects',hostVersion:app.version,locale:'pt-BR'},options:{}})));
  state.observations.push({label:String(request.label||''),changed:changed,status:changed===expected && valuePass?'PASS':'FAIL',nativeValues:values,snapshot:observed,at:new Date().toString()});
  state.ownedIds=ids();state.status='PASS';for(var i=0;i<state.observations.length;i++)if(state.observations[i].status!=='PASS')state.status='FAIL';save();return;
 }
 if(request.phase==='persist'){
  var before=snapshot();state.projectFile=new File(folder.fsName+'/'+request.tool+'.aep').fsName;app.project.save(new File(state.projectFile));app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);app.open(new File(state.projectFile));c=find();assert(c,'QA comp missing after reopen.');state.persistenceBefore=before;state.persistenceAfter=snapshot();state.persistenceComparison=MotionAuditPersistenceCompare(before,state.persistenceAfter);state.reopen=state.persistenceComparison.equal?'PASS':'FAIL';if(state.reopen==='FAIL')state.status='FAIL';state.ownedIds=ids();save();return;
 }
 if(request.phase==='cleanup'){
  for(var n=1;n<=app.project.numItems;n++){var known=false;for(var j=0;j<state.ownedIds.length;j++)if(app.project.item(n).id===state.ownedIds[j])known=true;assert(known,'Unexpected project item; refusing cleanup.');}
  app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);app.newProject();state.remainingProjectItems=app.project.numItems;state.completed=true;save();return;
 }
 throw new Error('Unknown control phase.');
}());
