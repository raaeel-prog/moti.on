(function(){
  var repo=File($.fileName).parent.parent.fsName;
  $.evalFile(new File(repo+'/scripts/tools-audit-fixture-lib.jsx'));
  var qa=new MotionToolsAudit(repo,'particles'), records=[], last=null;
  function deselect(c){for(var i=1;i<=c.numLayers;i++)c.layer(i).selected=false;}
  function expressions(g){for(var i=1;i<=g.numProperties;i++){var p=g.property(i);if(p.propertyType!==PropertyType.PROPERTY)expressions(p);else if(p.canSetExpression && p.expressionEnabled){p.valueAtTime(2,false);qa.assert(!p.expressionError,p.name+': '+p.expressionError);}}}
  function layerId(c,id){for(var i=1;i<=c.numLayers;i++)if(c.layer(i).id===id)return c.layer(i);return null;}
  app.beginSuppressDialogs();
  try{
    var modes=['classic','dust','bokeh','snow','sparks','field3d'];
    for(var m=0;m<modes.length;m++)(function(mode){
      qa.test(mode+': native create, repeat, expression evaluation and rendering',function(){
        var c=qa.comp(mode);c.time=2;var args=mode==='classic'?{birthRate:2,longevity:1,velocity:1}:{mode:mode};
        var data=qa.ok(qa.send(c,'ae.effect.particles',args));var count=c.numLayers;
        qa.assert(count===(mode==='classic'?1:5),'Unexpected native layer count: '+count);
        deselect(c);qa.ok(qa.send(c,'ae.effect.particles',args));qa.assert(c.numLayers===count,'Repeated Apply duplicated the emitter.');
        for(var i=1;i<=c.numLayers;i++)expressions(c.layer(i));
        qa.assert(c.time===2 && c.selectedLayers.length===0,'Selection/time was not preserved.');
        var image=qa.png(c,mode,2);records.push({mode:mode,compId:c.id,rigId:data.rigId,controllerId:data.controllerLayerId,memberIds:data.memberLayerIds});last=c;
        return {layers:count,rig:data,image:image};
      });
    }(modes[m]));
    qa.test('Field 3D: native global and per-stream controls change evaluated values',function(){
      var c=last,record=records[records.length-1],control=layerId(c,record.controllerId),stream=layerId(c,record.memberIds[0]);
      qa.assert(control && stream,'Field rig did not exist.');
      control.property('ADBE Effect Parade').property('Moti.on Particles size').property(1).setValue(.1);
      control.property('ADBE Effect Parade').property('Moti.on Particles 1 size').property(1).setValue(2);
      var size=stream.property('ADBE Effect Parade').property(1).property('CC Particle World-0024');
      var observed=Number(size.valueAtTime(2,false));qa.assert(Math.abs(observed-.2)<.0001,'Live size control did not affect native value: '+observed);
      stream.selected=true;var count=c.numLayers;qa.ok(qa.send(c,'ae.effect.particles',{mode:'field3d',size:.1}));qa.assert(c.numLayers===count,'Adjustment duplicated the rig.');
      stream.locked=true;var rejected=qa.send(c,'ae.effect.particles',{mode:'bokeh'});qa.assert(!rejected.ok,'Locked stream was accepted.');qa.assert(c.numLayers===count,'Locked failure mutated the comp.');stream.locked=false;
      return {nativeSize:observed,lockedCode:rejected.error.code};
    });
    qa.test('Save/reopen preserves every native emitter, controller and expression',function(){
      qa.reopen();
      for(var r=0;r<records.length;r++){var record=records[r],c=null;for(var i=1;i<=app.project.numItems;i++)if(app.project.item(i).id===record.compId)c=app.project.item(i);qa.assert(c,'Missing composition after reopen.');
        qa.assert(c.numLayers===(record.mode==='classic'?1:5),'Missing emitter after reopen.');for(i=1;i<=c.numLayers;i++)expressions(c.layer(i));
        if(record.controllerId)qa.assert(layerId(c,record.controllerId).comment.indexOf(record.rigId)>=0,'Lost persistent rig identity.');
      }return {compositions:records.length};
    });
    qa.test('Field removal preserves an unrelated layer and its source',function(){
      var record=records[records.length-1],c=null;for(var i=1;i<=app.project.numItems;i++)if(app.project.item(i).id===record.compId)c=app.project.item(i);
      c.openInViewer();var user=c.layers.addText('Preserve me');qa.remember();deselect(c);layerId(c,record.controllerId).selected=true;
      qa.ok(qa.send(c,'ae.effect.particles',{action:'remove'}));qa.assert(c.numLayers===1 && c.layer(1).id===user.id,'Removal affected unrelated content.');
      return {remainingUserLayer:user.id};
    });
  }catch(e){qa.result.fatal=String(e);}finally{qa.finish();app.endSuppressDialogs(false);}
}());
