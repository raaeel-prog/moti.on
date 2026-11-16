// Resolution-aware originals, all in owned disposable compositions.
(function(){
 var repo=File($.fileName).parent.parent.fsName;$.evalFile(new File(repo+'/scripts/tools-audit-fixture-lib.jsx'));
 var qa=new MotionToolsAudit(repo,'geometry'),file=new File(repo+'/scripts/verify-all-tools-audit-fixtures.json');file.open('r');var cases=MotionJson.parse(file.read()).geometryCases;file.close();
 try{for(var i=0;i<cases.length;i++)for(var mode=0;mode<2;mode++)(function(sample,kind){qa.test(kind+' '+sample.width+'x'+sample.height+': native starter framing',function(){
  var c=qa.comp(kind+' '+sample.width+'x'+sample.height);c.width=sample.width;c.height=sample.height;
  for(var j=0;j<(kind==='cube'?1:3);j++)c.layers.addSolid([.2+j*.15,.3,.7],'Face '+j,180,120,1,8);
  for(j=1;j<=c.numLayers;j++)c.layer(j).selected=true;qa.remember();
  var response=qa.send(c,'ae.3d.'+kind,sample[kind]);qa.ok(response);
  return {args:sample[kind],layers:c.numLayers,image:qa.png(c,kind+'-'+sample.width+'x'+sample.height,2)};
 });}(cases[i],mode===0?'cube':'cylinder'));}catch(error){qa.result.fatal=String(error);}finally{qa.finish();}
}());
