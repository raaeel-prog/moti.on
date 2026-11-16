// Each phase executes in a separate AE scheduling boundary. Undo/Redo themselves
// are sent through the observed native UI, never from inside the mutating script.
(function(){
  var repo=File($.fileName).parent.parent.fsName,requestFile=new File(repo+'/artifacts/tools-audit/undo-request.json');requestFile.open('r');var request=MotionJson.parse(requestFile.read());requestFile.close();
  var allowed={parallax:true,gradient:true,particles:true,ease:true,wordReveal:true};
  var catalogFile=new File(repo+'/scripts/verify-all-tools-audit-fixtures.json');catalogFile.open('r');var catalog=MotionJson.parse(catalogFile.read());catalogFile.close();
  for(var entry=0;entry<catalog.tools.length;entry++)allowed[catalog.tools[entry].id]=true;
  for(entry=0;entry<catalog.quickActions.length;entry++)allowed['quick.'+catalog.quickActions[entry].id]=true;
  if(!allowed[request.tool])throw new Error('Unknown Undo fixture.');
  var folder=new Folder(repo+'/artifacts/tools-audit/undo-native');if(!folder.exists)folder.create();
  var stateFile=new File(folder.fsName+'/'+request.tool+'-result.json'),state=null,c=null;
  function assert(value,message){if(!value)throw new Error(message);}
  function save(){stateFile.encoding='UTF-8';assert(stateFile.open('w'),'Cannot write Undo evidence.');stateFile.write(MotionJson.stringify(state));stateFile.close();}
  function remember(){var ids=[];for(var i=1;i<=app.project.numItems;i++)ids.push(app.project.item(i).id);return ids;}
  function own(){assert(app.project,'No QA project.');var ids=state.ownedIds;for(var i=1;i<=app.project.numItems;i++){var found=false;for(var j=0;j<ids.length;j++)if(ids[j]===app.project.item(i).id)found=true;assert(found,'Project ownership changed.');}var file=app.project.file;if(file!==null)assert(file.fsName===new File(state.projectFile).fsName,'Saved project ownership changed.');}
  function find(){for(var i=1;i<=app.project.numItems;i++)if(app.project.item(i).id===state.compId)return app.project.item(i);return null;}
  function transform(l,n){return l.property('ADBE Transform Group').property(n);}
  function snap(){var out={layers:[],projectItems:[]};c=find();if(!c)return {missingComp:true};if(state.generic)return $.global.MotionCatalogForUndo.snapshot(c);for(var i=1;i<=c.numLayers;i++){var l=c.layer(i),p=transform(l,'ADBE Opacity'),position=transform(l,'ADBE Position'),fx=l.property('ADBE Effect Parade');var key=[];if(p)for(var k=1;k<=p.numKeys;k++){var e=p.keyOutTemporalEase(k);key.push({time:p.keyTime(k),value:p.keyValue(k),type:Number(p.keyOutInterpolationType(k)),speed:e[0].speed,influence:e[0].influence});}out.layers.push({id:l.id,name:l.name,comment:l.comment,threeD:l.threeDLayer,position:position.valueAtTime(0,true),effects:fx?fx.numProperties:0,keys:key});}for(i=1;i<=app.project.numItems;i++){var item=app.project.item(i);out.projectItems.push({id:item.id,name:item.name,comment:item.comment,type:item.typeName});}return out;}
  if(request.phase==='prepare'){
    assert(app.project && !app.project.file && app.project.numItems===0,'Undo preparation requires an EMPTY UNSAVED project.');
    var special=request.tool==='parallax' || request.tool==='gradient' || request.tool==='particles' || request.tool==='ease' || request.tool==='wordReveal',prepared=null;
    if(!special){$.global.MotionCatalogPrepareOnly=true;try{$.evalFile(new File(repo+'/scripts/verify-all-tools-audit.jsx'));}finally{$.global.MotionCatalogPrepareOnly=false;}prepared=$.global.MotionCatalogForUndo.prepare(request.tool);c=prepared.comp;}
    else {c=app.project.items.addComp('Moti.on QA Undo '+request.tool,640,360,1,8,30);c.openInViewer();}
    if(special){
    if(request.tool==='wordReveal')c.layers.addText('Motion Undo');
    else if(request.tool!=='particles')for(var n=0;n<(request.tool==='parallax'?2:1);n++){var l=c.layers.addSolid([.2+n*.3,.3,.7],'QA source '+n,180,120,1,8);transform(l,'ADBE Position').setValue([100+n*200,150,0]);}
    for(n=1;n<=c.numLayers;n++)c.layer(n).selected=true;
    if(request.tool==='ease'){var p=transform(c.layer(1),'ADBE Opacity');p.setValueAtTime(0,20);p.setValueAtTime(2,100);p.selected=true;p.setSelectedAtKey(1,true);p.setSelectedAtKey(2,true);}
    }
    state={tool:request.tool,host:app.version,compId:c.id,ownedIds:remember(),history:[],status:'RUNNING',generic:!special};if(prepared){state.command=prepared.command;state.args=prepared.args;state.mutates=prepared.mutates;}if(app.project.file!==null)state.projectFile=app.project.file.fsName;state.before=snap();save();return;
  }
  assert(stateFile.exists,'Undo preparation is missing.');stateFile.open('r');state=MotionJson.parse(stateFile.read());stateFile.close();own();c=find();
  if(request.phase==='apply'){
    assert(c,'QA composition missing.');c.openInViewer();
    var command,args={};
    if(state.generic){command=state.command;args=state.args;}
    else if(request.tool==='parallax'){command='ae.animate.parallax.quick';args={depthStep:0,strength:1,orderMode:'timeline',reverseOrder:false,createCamera:true,preserveFraming:true,controllerName:'QA Undo Parallax'};}
    else if(request.tool==='particles'){command='ae.effect.particles';args={mode:'field3d'};}
    else if(request.tool==='ease'){command='ae.keys.ease.apply';args={x1:.22,y1:1,x2:.36,y2:1,applyIn:true,applyOut:true};}
    else if(request.tool==='gradient'){command='ae.effect.gradient';var f=new File(repo+'/scripts/verify-gradient-tools-audit-fixtures.json');f.open('r');var recipes=MotionJson.parse(f.read());f.close();args=recipes.recipes[0].args;}
    else{command='ae.text.word-reveal';var input=new File(repo+'/scripts/verify-all-tools-audit-fixtures.json');input.open('r');var tools=MotionJson.parse(input.read()).tools;input.close();for(var i=0;i<tools.length;i++)if(tools[i].id==='wordReveal')args=tools[i].args;}
    state.response=MotionJson.parse(MotionAE.dispatch(MotionJson.stringify({protocolVersion:1,requestId:'undo-'+request.tool,command:command,args:args,context:{host:'after-effects',hostVersion:app.version},options:{mode:'advanced',preserveSelection:true,allowDestructive:true}})));
    var currentIds=remember();for(var ownedIndex=0;ownedIndex<currentIds.length;ownedIndex++){var known=false;for(var previousIndex=0;previousIndex<state.ownedIds.length;previousIndex++)if(state.ownedIds[previousIndex]===currentIds[ownedIndex])known=true;if(!known)state.ownedIds.push(currentIds[ownedIndex]);}
    save();assert(state.response.ok,MotionJson.stringify(state.response.error));
    state.menuIds={undoPT:app.findMenuCommandId('Desfazer'),undoEN:app.findMenuCommandId('Undo'),redoPT:app.findMenuCommandId('Refazer'),redoEN:app.findMenuCommandId('Redo')};save();return;
  }
  // Capture after AE has returned to its event loop, outside the dispatch that
  // built text/vector expressions. This avoids synchronous dependency reads.
  if(request.phase==='capture'){
    state.after=snap();if(state.mutates===false){state.undo='NOT APPLICABLE';state.redo='NOT APPLICABLE';state.status='PASS';}else assert(MotionJson.stringify(state.before)!==MotionJson.stringify(state.after),'The tool did not change the QA scene.');save();return;
  }
  if(request.phase==='inspect'){
    var current=snap(),expected=request.observe==='undo'?state.before:state.after,pass=MotionJson.stringify(current)===MotionJson.stringify(expected);
    state.history.push({action:request.observe,status:pass?'PASS':'FAIL',observed:current,at:new Date().toString()});if(request.observe==='undo')state.undo=pass?'PASS':'FAIL';else state.redo=pass?'PASS':'FAIL';state.status=state.undo==='PASS' && state.redo==='PASS'?'PASS':'RUNNING';save();return;
  }
  if(request.phase==='persist'){
    state.projectFile=folder.fsName+'/'+request.tool+'.aep';app.project.save(new File(state.projectFile));app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);app.open(new File(state.projectFile));state.ownedIds=remember();state.reopen=MotionJson.stringify(snap())===MotionJson.stringify(state.after)?'PASS':'FAIL';save();return;
  }
  if(request.phase==='cleanup'){own();app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);app.newProject();state.remainingProjectItems=app.project.numItems;save();return;}
  throw new Error('Unknown Undo phase.');
}());
