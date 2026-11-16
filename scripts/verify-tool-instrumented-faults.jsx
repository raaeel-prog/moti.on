// QA-only derived host; installed bytes are never overwritten by instrumentation.
(function(){
 var repo=File($.fileName).parent.parent.fsName,requestFile=new File(repo+'/artifacts/tools-audit/faults-request.json');requestFile.open('r');var request=MotionJson.parse(requestFile.read());requestFile.close();
 if(!/^(?:[A-Za-z][A-Za-z0-9]*|quick\.[a-z][a-z-]*)$/.test(request.tool)||request.phase!=='probe'&&request.phase!=='fault')throw new Error('Invalid instrumented fixture.');
 if(request.variant && !((request.tool==='createNull' && (request.variant==='parent-preserve'||request.variant==='parent-jump'))||(request.tool==='clean' && request.variant==='multiple')))throw new Error('Invalid scene variant.');
 $.evalFile(new File(repo+'/scripts/tools-audit-fixture-lib.jsx'));$.evalFile(new File(repo+'/scripts/tools-audit-state.jsx'));
 var caseId=request.tool+(request.variant?'-'+request.variant:'');
 var qa=new MotionToolsAudit(repo,'fault-instrumented-'+caseId+'-'+request.phase),state=null,c=null;qa.result.requestId=request.requestId;
 var evidenceFolder=new Folder(repo+'/artifacts/tools-audit/faults-instrumented-native');if(!evidenceFolder.exists)evidenceFolder.create();
 function read(file){var f=new File(file);f.open('r');var data=MotionJson.parse(f.read());f.close();return data;}
 try{qa.test(request.tool+': '+request.phase+' transaction',function(){
  $.global.MotionCatalogPrepareOnly=true;try{$.evalFile(new File(repo+'/scripts/verify-all-tools-audit.jsx'));}finally{$.global.MotionCatalogPrepareOnly=false;}
  var scene=$.global.MotionCatalogForUndo.prepare(request.tool);c=scene.comp;
  if(request.tool==='createNull' && request.variant){
   var children=c.selectedLayers,oldParent=c.layers.addNull();oldParent.name='QA original parent';oldParent.property('ADBE Transform Group').property('ADBE Position').setValue([83,61]);
   for(var ci=0;ci<children.length;ci++){children[ci].parent=ci===0?oldParent:null;children[ci].selected=true;var opacity=children[ci].property('ADBE Transform Group').property('ADBE Opacity');opacity.setValueAtTime(0,20);opacity.setValueAtTime(1,80);opacity.selected=true;opacity.setSelectedAtKey(1,true);opacity.setSelectedAtKey(2,true);}
   oldParent.selected=false;scene.args.parentSelected=true;scene.args.preserveWorldTransform=request.variant==='parent-preserve';scene.args.placement='compCenter';
  }
  if(request.tool==='clean' && request.variant==='multiple'){
   var cleanLayer=c.layers.addSolid([.3,.4,.5],'Owned extra cleanup QA',80,80,1,8),cleanSource=cleanLayer.source;
   cleanSource.comment=MotionContracts.META_OPEN+MotionJson.stringify({schemaVersion:1,rigId:'qa-clean-extra',rigType:'ae.asset.texture'})+MotionContracts.META_CLOSE;
   scene.args.selectedItemIds.push(cleanSource.id);cleanLayer.remove();
  }
  if(request.tool==='particles'){for(var si=c.numLayers;si>=1;si--)c.layer(si).remove();}
  qa.remember();var instrumentation=read(repo+'/artifacts/tools-audit/faults-native/instrumentation.json'),precision=read(repo+'/artifacts/tools-audit/faults-native/result.json');
  var snapshot=request.tool==='verticalPulse'?$.global.MotionCatalogForUndo.snapshot:MotionAuditState;
  qa.result.snapshotRevision=request.tool==='verticalPulse'?'bounded-pulse-1':'pre-expression-text-2';
  qa.result.snapshotCoverage=request.tool==='verticalPulse'?'bounded transforms, effects, vector structure and project inventory; generated property values excluded':'full bounded native property state';
  qa.result.stage='before snapshot';qa.save();
  var before=snapshot(c);
  $.evalFile(new File(repo+'/artifacts/tools-audit/faults-native/host-instrumented.jsx'));
  // Loading the derived host starts a fresh session clipboard. Seed that session,
  // rather than relying on the canonical host's clipboard from scene preparation.
  if(request.tool==='pasteKeys')qa.ok(qa.send(c,'ae.keys.copy',{}));
  if(request.tool==='clean'){var cleanScan=qa.ok(qa.send(c,'ae.project.clean',{removeConfirmed:false}));scene.args.scanToken=cleanScan.scanToken;}
  state={armed:true,calls:0,failAt:request.phase==='probe'?0:request.failAt,comp:c,snapshot:snapshot,injected:false,partial:null,last:null};$.global.MotionAuditNativeFault=state;
  if(request.tool==='createNull' && request.variant && request.phase==='fault'){state.failAt=0;state.failLabel=request.variant==='parent-preserve'?'assign parent@':'setParentWithJump@';state.labelCalls=0;state.failLabelAt=2;}
  qa.result.stage='dispatch';qa.save();
  var response=null,thrown=null;try{response=qa.send(c,scene.command,scene.args);}catch(error){thrown=String(error);qa.remember();}finally{state.armed=false;}
  qa.result.stage='after snapshot';qa.save();
  var after=snapshot(c),comparison=MotionAuditCompare(before,after,precision.host===app.version?precision.textColorTolerance||0:0);
  qa.result.tool=request.tool;qa.result.phase=request.phase;qa.result.command=scene.command;qa.result.source=instrumentation;qa.result.nativeCalls=state.calls;qa.result.injection={failAt:state.failAt,label:state.last,injected:state.injected,partialMutation:state.partial!==null&&state.partial!==before};qa.result.before=before;qa.result.after=after;qa.result.response=response;qa.result.thrown=thrown;qa.result.comparison=comparison;qa.save();
  if(request.phase==='probe'){qa.assert(response&&response.ok,'No-fault instrumented control did not succeed.');qa.assert(scene.mutates===false||!comparison.equal,'No-fault control returned success without changing state.');}
  else{qa.assert(state.injected,'Requested boundary was not reached.');qa.assert(response&&!response.ok,'Injected failure did not return a structured command failure.');qa.assert(comparison.equal,'Partial failure did not restore the original native state.');}
  return {nativeCalls:state.calls,injected:state.injected,error:response&&response.error?response.error.code:null,restored:comparison.equal};
 });}catch(error){qa.result.fatal=String(error);}finally{
  $.global.MotionAuditNativeFault=null;qa.finish();
  var source=new File(Folder.userData.fsName+'/Adobe/CEP/extensions/com.motion.plugin.ae/host/index.jsx');$.evalFile(source);
  var output=new File(evidenceFolder.fsName+'/'+caseId+'-'+request.phase+'.json');output.encoding='UTF-8';if(output.open('w')){output.write(MotionJson.stringify(qa.result));output.close();}
 }
}());
