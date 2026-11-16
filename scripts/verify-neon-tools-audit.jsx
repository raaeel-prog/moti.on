// Native visual calibration; refuses a saved or nonempty project.
(function(){
 var repo=File($.fileName).parent.parent.fsName;$.evalFile(new File(repo+'/scripts/tools-audit-fixture-lib.jsx'));
 var qa=new MotionToolsAudit(repo,'neon');
 try{qa.test('Dark shape: inspect Glow threshold and compare native halo',function(){
  var c=qa.comp('dark shape'),layer=c.layers.addShape();layer.name='QA dark red';
  var root=layer.property('ADBE Root Vectors Group'),group=root.addProperty('ADBE Vector Group'),contents=group.property('ADBE Vectors Group');
  contents.addProperty('ADBE Vector Shape - Rect').property('ADBE Vector Rect Size').setValue([180,100]);
  contents=group.property('ADBE Vectors Group');contents.addProperty('ADBE Vector Graphic - Fill').property('ADBE Vector Fill Color').setValue([.2,0,0,1]);
  qa.remember();layer.selected=true;
  var file=new File(repo+'/scripts/verify-all-tools-audit-fixtures.json');file.open('r');var tools=MotionJson.parse(file.read()).tools;file.close();var args;
  for(var i=0;i<tools.length;i++)if(tools[i].id==='neon')args=tools[i].args;
  qa.ok(qa.send(c,'ae.style.neon',args));var effect=layer.property('ADBE Effect Parade').property(1),parameters=[];
  for(i=1;i<=effect.numProperties;i++){var p=effect.property(i),record={index:i,matchName:p.matchName,name:p.name};try{record.value=p.value;record.min=p.minValue;record.max=p.maxValue;}catch(ignored){}parameters.push(record);}
  var original=qa.png(c,'current-default',0),threshold=effect.property('ADBE Glo2-0002');qa.assert(threshold,'Measured threshold parameter missing.');var before=threshold.value;qa.assert(before===0,'Managed Neon kept the native cutoff that suppressed dark shapes.');
  threshold.setValue(0);var tuned=qa.png(c,'threshold-zero',0);
  qa.ok(qa.send(c,'ae.style.neon',args));qa.assert(layer.property('ADBE Effect Parade').numProperties===1,'Repeated Neon stacked effects.');
  threshold.setValueAtTime(0,0);threshold.setValueAtTime(1,80);var keyed=qa.send(c,'ae.style.neon',args);qa.assert(!keyed.ok && keyed.error.code==='KEYFRAME_CONFLICT' && threshold.numKeys===2,'Threshold animation was not protected.');
  while(threshold.numKeys)threshold.removeKey(threshold.numKeys);threshold.setValue(0);threshold.expression='value';var expressed=qa.send(c,'ae.style.neon',args);qa.assert(!expressed.ok && expressed.error.code==='EXPRESSION_CONFLICT','Threshold expression was overwritten.');threshold.expression='';
  return {parameters:parameters,thresholdBefore:before,thresholdAfter:threshold.value,original:original,tuned:tuned};
 });
 qa.test('Native second-target failure restores both text documents and all managed Glow values',function(){
  var c=qa.comp('rollback'),a=c.layers.addText('Before A'),b=c.layers.addText('Before B'),args={mode:'editable',coreColor:[1,1,1],glowColor:[.2,.8,1],strokeWidth:4,glowRadius:40,intensity:2};
  a.selected=true;b.selected=true;qa.remember();qa.ok(qa.send(c,'ae.style.neon',args));
  a.property('ADBE Effect Parade').property(1).property('ADBE Glo2-0002').setValue(80);
  function snapshot(){var records=[],ids=['0002','0003','0004','0007','0012','0013'];for(var i=1;i<=c.numLayers;i++){var l=c.layer(i),text=l.property('ADBE Text Properties').property('ADBE Text Document').value,fx=l.property('ADBE Effect Parade').property(1),values=[];for(var j=0;j<ids.length;j++)values.push(fx.property('ADBE Glo2-'+ids[j]).value);records.push({id:l.id,text:text.text,fill:text.fillColor,stroke:text.strokeColor,width:text.strokeWidth,over:text.strokeOverFill,values:values});}return MotionJson.stringify(records);}
  var before=snapshot(),original=MotionEffects.setStatic,writes=0,response;
  MotionEffects.setStatic=function(property,value){writes++;if(writes===9)throw new Error('QA injected second-target write failure');return original(property,value);};
  try{response=qa.send(c,'ae.style.neon',{mode:'editable',coreColor:[1,.2,.1],glowColor:[.8,.2,1],strokeWidth:8,glowRadius:70,intensity:5});}finally{MotionEffects.setStatic=original;}
  qa.assert(!response.ok,'Injected failure returned success.');qa.assert(snapshot()===before,'Native rollback changed text or Glow values.');
  return {writesBeforeFailure:9,code:response.error.code,restoredThreshold:a.property('ADBE Effect Parade').property(1).property('ADBE Glo2-0002').value};
 });}catch(error){qa.result.fatal=String(error);}finally{qa.finish();}
}());
