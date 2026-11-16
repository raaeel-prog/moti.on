// Native failure injection on our own helper boundaries; no vendor/runtime files changed.
(function(){
 var repo=File($.fileName).parent.parent.fsName;
 var modeFile=new File(repo+'/artifacts/tools-audit/faults-request.json');
 if(modeFile.exists){modeFile.open('r');var mode=MotionJson.parse(modeFile.read());modeFile.close();if(mode.mode==='instrumented'){$.evalFile(new File(repo+'/scripts/verify-tool-instrumented-faults.jsx'));return;}}
 $.evalFile(new File(repo+'/scripts/tools-audit-fixture-lib.jsx'));$.evalFile(new File(repo+'/scripts/tools-audit-state.jsx'));
 var qa=new MotionToolsAudit(repo,'faults'),catalogFile=new File(repo+'/scripts/verify-all-tools-audit-fixtures.json');catalogFile.open('r');var catalog=MotionJson.parse(catalogFile.read());catalogFile.close();
 function args(id){for(var i=0;i<catalog.tools.length;i++)if(catalog.tools[i].id===id)return MotionJson.parse(MotionJson.stringify(catalog.tools[i].args));throw new Error('Unknown fixture.');}
 function select(comp,layers){for(var i=1;i<=comp.numLayers;i++)comp.layer(i).selected=false;for(i=0;i<layers.length;i++)layers[i].selected=true;}
 function shape(comp,name){var l=comp.layers.addSolid([.2,.3,.6],name,140,100,1,8);return l;}
 function keyCase(id,command,options){qa.test(id+': native keyframe write failure restores all properties',function(){
  var c=qa.comp(id),layer=shape(c,'Fault keys'),group=layer.property('ADBE Transform Group'),props=[group.property('ADBE Opacity'),group.property('ADBE Rotate Z')];
  select(c,[layer]);for(var p=0;p<props.length;p++){props[p].setValueAtTime(.2,20);props[p].setValueAtTime(.9,90);props[p].setValueAtTime(1.8,50);props[p].selected=true;for(var k=1;k<=3;k++)props[p].setSelectedAtKey(k,true);}
  qa.remember();if(id==='pasteKeys'||id==='pasteExpressions'){
   if(id==='pasteExpressions')for(p=0;p<props.length;p++){props[p].expression='value + 20';props[p].expressionEnabled=true;}
   qa.ok(qa.send(c,'ae.keys.copy',{}));c.time=3;
   if(id==='pasteExpressions')for(p=0;p<props.length;p++){props[p].expression='value + 1';props[p].expressionEnabled=false;}
  }
  var before=MotionAuditState(c),original=MotionKeyframes.applyEdit,originalRestore=MotionKeyframes.restoreProperty,calls=0,injected=false,partial=false,response;
  MotionKeyframes.applyEdit=function(plan){
   calls++;if(plan.targets.length<2)throw new Error('Fixture requires two selected properties.');
   // The first target executes against the real host. The next target fails
   // inside applyEdit's own transaction (simulates stale/corrupt native input).
   plan.targets[1].keys[0].time=NaN;injected=true;partial=true;return original(plan);
  };
  MotionKeyframes.restoreProperty=function(snapshot,times){calls++;var result=originalRestore(snapshot,times);if(!injected && calls>=(id==='pasteExpressions'?2:1) && MotionAuditState(c)!==before){partial=true;injected=true;throw new Error('QA injected failure after native key restoration');}return result;};
  var input=options||args(id);if(id==='delay')input.shiftMode='keyframes';
  try{response=qa.send(c,command,input);}finally{MotionKeyframes.applyEdit=original;MotionKeyframes.restoreProperty=originalRestore;}
  if(!qa.result.diagnostics)qa.result.diagnostics=[];qa.result.diagnostics.push({tool:id,calls:calls,injected:injected,response:response,before:before,after:MotionAuditState(c)});
  qa.assert(injected && partial,'Injection boundary was not reached after a real mutation.');qa.assert(!response.ok,'Injected failure returned success.');qa.assert(MotionAuditState(c)===before,'Native rollback changed keys, ease, selection, expressions or project items.');
  return {tool:id,injected:injected,injection:'second target invalidation inside applyEdit, or failure after native restoreProperty',partialExecutionBoundary:partial,helperCalls:calls,error:response.error.code,restored:true};
 });}
 function effectCase(id){qa.test(id+': native effect failure restores both targets',function(){
  var c=qa.comp(id),a=id==='neon'?c.layers.addText('Fault A'):shape(c,'Fault A'),b=id==='neon'?c.layers.addText('Fault B'):shape(c,'Fault B');select(c,[a,b]);qa.remember();
  var input=args(id),command;for(var n=0;n<catalog.tools.length;n++)if(catalog.tools[n].id===id)command=catalog.tools[n].command;if(id==='wave')input.mode='effect';
  var before=MotionAuditState(c),original=MotionEffects.setStatic,calls=0,injected=false,partial=false,response;
  MotionEffects.setStatic=function(property,value){calls++;var result=original(property,value);if(calls===2){partial=MotionAuditState(c)!==before;injected=true;throw new Error('QA injected effect write failure');}return result;};
  try{response=qa.send(c,command,input);}finally{MotionEffects.setStatic=original;}
  if(!qa.result.diagnostics)qa.result.diagnostics=[];qa.result.diagnostics.push({tool:id,calls:calls,injected:injected,response:response,before:before,after:MotionAuditState(c)});
  var comparison=MotionAuditCompare(before,MotionAuditState(c),id==='neon'?qa.result.textColorTolerance||0:0);
  qa.assert(injected && partial,'Effect injection did not follow a real mutation.');qa.assert(!response.ok,'Injected effect failure returned success.');qa.assert(comparison.equal,'Native effect rollback left modified values or orphaned items.');
  return {tool:id,partialMutationObserved:partial,helperCalls:calls,error:response.error.code,restored:true,comparison:comparison};
 });}
 try{
  var keyCases=[['reverseKeys','ae.keys.reverse'],['reverseValues','ae.keys.reverse-values'],['cloneKeys','ae.keys.clone'],['pasteKeys','ae.keys.paste'],['delay','ae.keys.delay'],['sendToEdge','ae.keys.send-to-edge']];
  for(var k=0;k<keyCases.length;k++)keyCase(keyCases[k][0],keyCases[k][1]);
  var pasteExpressionArgs=args('pasteKeys');pasteExpressionArgs.includeExpressions=true;keyCase('pasteExpressions','ae.keys.paste',pasteExpressionArgs);
  effectCase('wave');effectCase('tile');effectCase('echo');
  qa.test('TextDocument unchanged native roundtrip measures color precision',function(){
   var c=qa.comp('text color roundtrip'),l=c.layers.addText('Unchanged roundtrip'),p=l.property('ADBE Text Properties').property('ADBE Text Document'),samples=[];
   for(var r=0;r<11;r++){var text=p.value;samples.push(text.fillColor);if(r<10)p.setValue(text);}
   qa.remember();var max=0;for(r=1;r<samples.length;r++)for(var ch=0;ch<3;ch++)max=Math.max(max,Math.abs(samples[r][ch]-samples[0][ch]));
   qa.assert(max<=0.000001,'Unchanged native text roundtrip exceeds precision budget.');qa.result.textColorTolerance=max;
   return {samples:samples,maxAbsoluteDelta:max,operation:'sourceText.setValue(sourceText.value), no feature command'};
  });
  effectCase('neon');
  qa.test('gradient: second-target creation failure removes partial effects and restores comments',function(){
   var c=qa.comp('gradient'),a=shape(c,'Gradient A'),b=shape(c,'Gradient B');select(c,[a,b]);qa.remember();var before=MotionAuditState(c),original=MotionJson.stringify,calls=0,injected=false,partial=false,response;
   MotionJson.stringify=function(value){var result=original(value);if(value && value.schemaVersion===1 && value.matchName==='Moti.on Gradient' && value.effectName){calls++;if(calls===2){partial=MotionAuditState(c)!==before;injected=true;throw new Error('QA injected second gradient target failure');}}return result;};
   try{response=qa.send(c,'ae.effect.gradient',args('gradient'));}finally{MotionJson.stringify=original;}
   qa.assert(injected && partial,'Gradient injection was not reached after mutation.');qa.assert(!response.ok,'Injected gradient failure returned success.');qa.assert(MotionAuditState(c)===before,'Gradient rollback changed project state.');return {tool:'gradient',partialMutationObserved:partial,error:response.error.code,restored:true};
  });
  qa.test('Feature-free native project reopen measures transient layer/key selection',function(){
   var c=qa.comp('native selection persistence'),l=shape(c,'Native control'),p=l.property('ADBE Transform Group').property('ADBE Opacity');p.setValueAtTime(0,20);p.setValueAtTime(1,80);l.selected=true;p.selected=true;p.setSelectedAtKey(1,true);p.setSelectedAtKey(2,true);qa.remember();var compId=c.id,before=MotionAuditState(c);
   qa.reopen();c=null;for(var i=1;i<=app.project.numItems;i++)if(app.project.item(i).id===compId)c=app.project.item(i);qa.assert(c,'Native control comp missing.');var after=MotionAuditState(c),comparison=MotionAuditPersistenceCompare(before,after);qa.assert(comparison.equal,'Feature-free native reopen changed persisted project content.');return {comparison:comparison,before:before,after:after,operation:'save/reopen native solid and opacity keys, no feature command'};
  });
 }catch(error){qa.result.fatal=String(error);}finally{qa.finish();}
}());
