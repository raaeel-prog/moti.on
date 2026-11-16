(function(){
  var repo=File($.fileName).parent.parent.fsName;$.evalFile(new File(repo+'/scripts/tools-audit-fixture-lib.jsx'));
  if(!$.global.MotionCatalogPrepareOnly && new File(repo+'/artifacts/tools-audit/undo-request.json').exists){$.evalFile(new File(repo+'/scripts/verify-tools-undo.jsx'));return;}
  if(!$.global.MotionCatalogPrepareOnly && new File(repo+'/artifacts/tools-audit/context-request.json').exists){$.evalFile(new File(repo+'/scripts/verify-tools-context-audit.jsx'));return;}
  if(!$.global.MotionCatalogPrepareOnly && new File(repo+'/artifacts/tools-audit/particles-polish-request.json').exists){$.evalFile(new File(repo+'/scripts/verify-particles-polish.jsx'));return;}
  if(!$.global.MotionCatalogPrepareOnly && new File(repo+'/artifacts/tools-audit/neon-request.json').exists){$.evalFile(new File(repo+'/scripts/verify-neon-tools-audit.jsx'));return;}
  if(!$.global.MotionCatalogPrepareOnly && new File(repo+'/artifacts/tools-audit/geometry-request.json').exists){$.evalFile(new File(repo+'/scripts/verify-geometry-tools-audit.jsx'));return;}
  var qa=new MotionToolsAudit(repo,'catalog'),file=new File(repo+'/scripts/verify-all-tools-audit-fixtures.json');file.open('r');var input=MotionJson.parse(file.read());file.close();
  var focused={parallax:true,ease:true,gradient:true,particles:true},scenes=[];
  function prop(l,n){return l.property('ADBE Transform Group').property(n);}
  function deselect(c){var selected=c.selectedProperties;for(var i=selected.length-1;i>=0;i--)selected[i].selected=false;for(i=1;i<=c.numLayers;i++)c.layer(i).selected=false;}
  function shape(c,n){var l=c.layers.addShape();l.name=n;for(var i=0;i<2;i++){var group=l.property('ADBE Root Vectors Group').addProperty('ADBE Vector Group');group.name='Part '+i;var contents=group.property('ADBE Vectors Group');contents.addProperty('ADBE Vector Shape - Rect');contents=group.property('ADBE Vectors Group');contents.addProperty('ADBE Vector Graphic - Fill');}return l;}
  function inspectProperties(g){var out=[];for(var i=1;i<=g.numProperties;i++){var p=g.property(i),r={matchName:p.matchName,name:p.name};if(p.propertyType===PropertyType.PROPERTY){r.keys=p.numKeys;r.expression=p.canSetExpression?p.expression:null;var numeric=p.propertyValueType===PropertyValueType.OneD || p.propertyValueType===PropertyValueType.TwoD || p.propertyValueType===PropertyValueType.ThreeD || p.propertyValueType===PropertyValueType.TwoD_SPATIAL || p.propertyValueType===PropertyValueType.ThreeD_SPATIAL || p.propertyValueType===PropertyValueType.COLOR;
      // Expressions are observed separately after dispatch. Evaluating a managed
      // vector-path dependency during the exhaustive snapshot can stall AE 26.5.
      if(numeric && !r.expression){try{r.values=[];if(p.numKeys){for(var k=1;k<=p.numKeys;k++)r.values.push({time:p.keyTime(k),value:p.keyValue(k)});}else r.value=p.value;}catch(e){r.valueError=String(e);}}
    }else r.children=inspectProperties(p);out.push(r);}return out;}
  function snapshot(c){var layers=[];for(var i=1;i<=c.numLayers;i++){var l=c.layer(i);layers.push({id:l.id,name:l.name,comment:l.comment,start:l.startTime,inPoint:l.inPoint,outPoint:l.outPoint,parent:l.parent?l.parent.id:null,properties:inspectProperties(l)});}return MotionJson.stringify({layers:layers,duration:c.duration,workAreaStart:c.workAreaStart,workAreaDuration:c.workAreaDuration});}
  function expressions(g){for(var i=1;i<=g.numProperties;i++){var p=g.property(i);if(p.propertyType!==PropertyType.PROPERTY)expressions(p);else if(p.canSetExpression && p.expressionEnabled){p.valueAtTime(2,false);qa.assert(!p.expressionError,p.name+': '+p.expressionError);}}}
  function preflightScenarios(c,tool,args){
    var handler=MotionRegistry.get(tool.command),selected=c.selectedLayers,propertySelection=c.selectedProperties,request={options:{mode:'advanced',preserveSelection:true,allowDestructive:true},context:{host:'after-effects',hostVersion:app.version}},scenarios={};
    var before=snapshot(c),issue;
    try{deselect(c);issue=handler.preflight(args,request);qa.assert(snapshot(c)===before,'Empty-selection preflight mutated the composition.');scenarios.emptySelection={status:'PASS',outcome:issue?issue.code:'valid without selection'};}
    finally{for(var i=0;i<selected.length;i++)try{selected[i].selected=true;}catch(e){}for(i=0;i<propertySelection.length;i++)try{propertySelection[i].selected=true;}catch(e2){}}
    var locks=[];
    try{for(i=0;i<selected.length;i++){locks.push(selected[i].locked);selected[i].locked=true;}before=snapshot(c);issue=handler.preflight(args,request);qa.assert(snapshot(c)===before,'Locked-selection preflight mutated the composition.');scenarios.lockedSelection={status:'PASS',outcome:issue?issue.code:'valid without modifying selected layers'};}
    finally{for(i=0;i<locks.length;i++)selected[i].locked=locks[i];}
    return scenarios;
  }
  function fixture(tool){var c=qa.comp(tool.id),kind=tool.id,ls=[],text=/^(wordReveal|variableMorph|styleSwap|verticalPulse|textBox|textToVector)$/.test(kind),shapes=/^(breakShape|trimPath|neon)$/.test(kind),count=3;
    if(text || kind==='cube')count=1;if(kind==='styleSwap')count=2;
    for(var i=0;i<count;i++){var l;if(text)l=c.layers.addText('Motion QA');else if(shapes)l=shape(c,'Shape '+i);else l=c.layers.addSolid([.15+i*.2,.3,.65],'QA '+i,180,120,1,8);ls.push(l);prop(l,'ADBE Anchor Point').setValue([0,0,0]);prop(l,'ADBE Position').setValue([80+i*160,90+i*50,0]);l.startTime=i*.1;}
    qa.remember();
    if(kind==='styleSwap')c.time=.5;
    if(kind==='cube')prop(ls[0],'ADBE Anchor Point').setValue([90,60,0]);
    if(kind==='beat'){var audio=app.project.importFile(new ImportOptions(new File(repo+'/artifacts/tools-audit/beat-fixture.wav')));c.layers.add(audio);}
    if(kind==='aiToVector'){var vector=app.project.importFile(new ImportOptions(new File(repo+'/artifacts/tools-audit/vector-fixture.ai')));ls=[c.layers.add(vector)];}
    if(kind==='timeController' || kind==='timeMarkerLoop'){var source=qa.comp('Time remap source');source.layers.addSolid([.3,.5,.7],'Source',160,90,1,8);c.openInViewer();ls=[c.layers.add(source)];}
    if(kind==='cameraTransition')ls=[c.layers.addCamera('QA Camera',[320,180])];
    deselect(c);for(i=0;i<ls.length;i++)ls[i].selected=true;
    if(/^(loopOut|smooth|wiggle|flicker|ease|cutKeys|delay|cloneKeys|inertial|animateKinetic|copyKeys|pasteKeys|reverseKeys|reverseValues|sendToEdge|timeMarkerLoop|beat)$/.test(kind)){
      var p=prop(ls[0],'ADBE Opacity');p.setValueAtTime(0,20);p.setValueAtTime(.8,90);p.setValueAtTime(1.6,50);p.selected=true;for(i=1;i<=p.numKeys;i++)p.setSelectedAtKey(i,true);
    }
    if(kind==='timeMarkerLoop'){ls[0].property('ADBE Marker').setValueAtTime(0,new MarkerValue('in'));ls[0].property('ADBE Marker').setValueAtTime(2,new MarkerValue('out'));}
    if(kind==='animateKinetic'){for(i=0;i<ls.length;i++){var position=prop(ls[i],'ADBE Position');position.setValueAtTime(0,[80+i*160,90+i*50,0]);position.setValueAtTime(1,[120+i*160,160+i*30,0]);}}
    if(kind==='fastEdit'){c.workAreaStart=.25;c.workAreaDuration=3;}
    qa.remember();return {comp:c,layers:ls};
  }
  function prepareUndo(toolId){
    for(var i=0;i<input.tools.length;i++)if(input.tools[i].id===toolId){var tool=input.tools[i],scene=fixture(tool),c=scene.comp,args=MotionJson.parse(MotionJson.stringify(tool.args));
      if(tool.id==='rename')args.prefix='QA Renamed ';
      if(tool.id==='parent'){var target=scene.layers[scene.layers.length-1];args={targetLayerIndex:target.index,targetLayerName:target.name,preserveWorldTransform:true,unparent:false,chainMode:'target'};target.selected=false;}
      if(tool.id==='texture')args={assetIdOrPath:repo+'/artifacts/tools-audit/parallax-native/before.png',blendMode:'overlay',opacity:100,fitMode:'cover'};
      if(tool.id==='pasteKeys'){qa.ok(qa.send(c,'ae.keys.copy',{}));c.time=3;}
      if(tool.id==='sendToEdge'){var p=prop(scene.layers[0],'ADBE Opacity');while(p.numKeys)p.removeKey(p.numKeys);p.setValueAtTime(.2,20);p.setValueAtTime(.9,90);p.setValueAtTime(1.8,50);p.selected=true;for(var k=1;k<=p.numKeys;k++)p.setSelectedAtKey(k,true);}
      if(tool.id==='clean'){
        var disposable=c.layers.addSolid([.2,.3,.4],'Owned unused QA',80,80,1,8),unused=disposable.source;
        unused.comment=MotionContracts.META_OPEN+MotionJson.stringify({schemaVersion:1,rigId:'qa-clean-owned',rigType:'ae.asset.texture'})+MotionContracts.META_CLOSE;disposable.remove();qa.remember();
        var scan=qa.ok(qa.send(c,tool.command,{removeConfirmed:false}));args={removeConfirmed:true,selectedItemIds:[unused.id],scanToken:scan.scanToken};
      }
      return {comp:c,command:tool.command,args:args,mutates:tool.mutates};
    }
    if(toolId.indexOf('quick.')===0){var action=toolId.substring(6),comp=qa.comp('Undo '+action),layer;
      if(action==='dash-stroke')layer=shape(comp,'Quick source');
      else if(action==='freeze'){var source=qa.comp('Freeze source');source.layers.addSolid([.2,.4,.8],'Source',160,90,1,8);comp.openInViewer();layer=comp.layers.add(source);comp.time=2;}
      else layer=comp.layers.addSolid([.2,.4,.8],'Quick source',160,90,1,8);
      prop(layer,'ADBE Position').setValue([50,50,0]);qa.remember();layer.selected=true;
      if(action==='save-frame')qa.saveProject();
      return {comp:comp,command:action==='save-frame'?'ae.quick-tools.save-frame':'ae.quick-tools.apply',args:{action:action},mutates:action!=='save-frame'};
    }
    throw new Error('Unknown catalog Undo fixture.');
  }
  // Structural shape inspection deliberately avoids evaluating generated paths.
  function vectorStructure(group){var result=[];if(!group)return result;for(var i=1;i<=group.numProperties;i++){var p=group.property(i),entry={name:p.name,matchName:p.matchName};if(p.propertyType!==PropertyType.PROPERTY)entry.children=vectorStructure(p);result.push(entry);}return result;}
  function snapshotUndo(comp){var layers=[],names=['ADBE Anchor Point','ADBE Position','ADBE Scale','ADBE Rotate Z','ADBE Opacity'];
    for(var i=1;i<=comp.numLayers;i++){var layer=comp.layer(i),record={id:layer.id,name:layer.name,comment:layer.comment,start:layer.startTime,inPoint:layer.inPoint,outPoint:layer.outPoint,parent:layer.parent?layer.parent.id:null,threeD:layer.threeDLayer,enabled:layer.enabled,shy:layer.shy,stretch:layer.stretch,properties:[],effects:[],markers:[]};
      for(var j=0;j<names.length;j++){var p=prop(layer,names[j]);if(!p)continue;var item={name:names[j],expression:p.canSetExpression?p.expression:null,keys:[]};if(!item.expression){if(!p.numKeys)item.value=p.value;for(var k=1;k<=p.numKeys;k++){var key={time:p.keyTime(k),value:p.keyValue(k),inType:Number(p.keyInInterpolationType(k)),outType:Number(p.keyOutInterpolationType(k))};item.keys.push(key);}}record.properties.push(item);}
      var remap=layer.property('ADBE Time Remapping');record.timeRemapEnabled=layer.canSetTimeRemapEnabled?layer.timeRemapEnabled:false;
      if(remap && record.timeRemapEnabled){var remapping={expression:remap.expression,keys:[]};for(j=1;j<=remap.numKeys;j++)remapping.keys.push({time:remap.keyTime(j),value:remap.keyValue(j)});record.timeRemap=remapping;}
      var markers=layer.property('ADBE Marker');if(markers)for(j=1;j<=markers.numKeys;j++)record.markers.push({time:markers.keyTime(j),comment:markers.keyValue(j).comment});
      record.vectors=vectorStructure(layer.property('ADBE Root Vectors Group'));
      var parade=layer.property('ADBE Effect Parade');if(parade)for(j=1;j<=parade.numProperties;j++){var fx=parade.property(j);record.effects.push({name:fx.name,matchName:fx.matchName});}layers.push(record);
    }var items=[];for(i=1;i<=app.project.numItems;i++){var projectItem=app.project.item(i);items.push({id:projectItem.id,name:projectItem.name,comment:projectItem.comment,type:projectItem.typeName});}
    return MotionJson.stringify({layers:layers,projectItems:items,duration:comp.duration,workAreaStart:comp.workAreaStart,workAreaDuration:comp.workAreaDuration});
  }
  $.global.MotionCatalogForUndo={prepare:prepareUndo,snapshot:snapshotUndo};
  if($.global.MotionCatalogPrepareOnly)return;
  app.beginSuppressDialogs();
  try{
    for(var t=0;t<input.tools.length;t++)(function(tool){
      if(focused[tool.id])return;
      qa.test(tool.id+': native default apply and evaluated expressions',function(){
        var scene=fixture(tool),c=scene.comp,args=tool.args;
        if(tool.id==='parent')args={targetLayerIndex:scene.layers[scene.layers.length-1].index,targetLayerName:scene.layers[scene.layers.length-1].name,preserveWorldTransform:true,unparent:false,chainMode:'target'};
        if(tool.id==='parent')scene.layers[scene.layers.length-1].selected=false;
        if(tool.id==='texture')args={assetIdOrPath:repo+'/artifacts/tools-audit/parallax-native/before.png',blendMode:'overlay',opacity:100,fitMode:'cover'};
        if(tool.id==='pasteKeys'){qa.ok(qa.send(c,'ae.keys.copy',{}));c.time=3;}
        var selection=[];for(var sl=0;sl<c.selectedLayers.length;sl++){var target=c.selectedLayers[sl];selection.push({id:target.id,name:target.name,matchName:target.matchName,isText:target instanceof TextLayer,hasTextGroup:!!target.property('ADBE Text Properties')});}
        var before=snapshot(c),response=qa.send(c,tool.command,args),after=snapshot(c);
        qa.result.lastCommand={tool:tool.id,args:args,selection:selection,response:response};if(!response.ok){if(!qa.result.failedInputs)qa.result.failedInputs=[];qa.result.failedInputs.push(qa.result.lastCommand);}qa.save();qa.ok(response);
        qa.assert(!tool.mutates || tool.allowsNoop || before!==after,'Success without an observable change.');
        for(var i=1;i<=c.numLayers;i++)expressions(c.layer(i));
        var negative=preflightScenarios(c,tool,args),beforeRepeat=snapshot(c),repeated=qa.send(c,tool.command,args);
        if(!repeated.ok)qa.assert(snapshot(c)===beforeRepeat,'Rejected repeat partially mutated the scene.');
        for(i=1;i<=c.numLayers;i++)expressions(c.layer(i));
        var rendered=qa.png(c,tool.id,Math.min(2,c.duration-c.frameDuration));scenes.push({id:c.id,tool:tool.id});
        return {tool:tool.id,command:tool.command,args:args,response:response,changed:before!==after,image:rendered,scenarios:negative,reapply:repeated};
      });
    }(input.tools[t]));
    for(var q=0;q<input.quickActions.length;q++)(function(action){
      qa.test('quick '+action.id+': native action result',function(){
        var c=qa.comp('quick '+action.id),l;
        if(action.id==='dash-stroke')l=shape(c,'Quick source');
        else if(action.id==='freeze'){var source=qa.comp('Freeze source');source.layers.addSolid([.2,.4,.8],'Source',160,90,1,8);c.openInViewer();l=c.layers.add(source);c.time=2;}
        else l=c.layers.addSolid([.2,.4,.8],'Quick source',160,90,1,8);
        prop(l,'ADBE Position').setValue([50,50,0]);qa.remember();l.selected=true;
        if(action.id==='save-frame'){qa.saveProject();var exported=qa.ok(qa.send(c,'ae.quick-tools.save-frame',{action:'save-frame'}));qa.assert(exported.outputPath && new File(exported.outputPath).exists && new File(exported.outputPath).length>8,'Export did not create the PNG.');return {action:action.id,response:exported};}
        var before=snapshot(c),response=qa.send(c,'ae.quick-tools.apply',{action:action.id});qa.ok(response);qa.assert(before!==snapshot(c),'Quick action returned success without changing the scene.');
        for(var i=1;i<=c.numLayers;i++)expressions(c.layer(i));return {action:action.id,response:response};
      });
    }(input.quickActions[q]));
    qa.test('Catalog QA project save/reopen preserves evaluated native output',function(){qa.reopen();for(var i=0;i<scenes.length;i++){var c=null;for(var j=1;j<=app.project.numItems;j++)if(app.project.item(j).id===scenes[i].id)c=app.project.item(j);qa.assert(c,'Lost QA comp after reopen.');for(j=1;j<=c.numLayers;j++)expressions(c.layer(j));}return {verifiedComps:scenes.length};});
  }catch(e){qa.result.fatal=String(e);}finally{qa.finish();app.endSuppressDialogs(false);}
}());
