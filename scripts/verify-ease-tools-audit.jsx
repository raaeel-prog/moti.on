(function(){
  var repo=File($.fileName).parent.parent.fsName;$.evalFile(new File(repo+'/scripts/tools-audit-fixture-lib.jsx'));
  var qa=new MotionToolsAudit(repo,'ease'),c=qa.comp('keys'),curve={x1:.5,y1:.5,x2:.5,y2:1,applyIn:true,applyOut:true};
  function select(p){var selected=c.selectedProperties;for(var i=selected.length-1;i>=0;i--)selected[i].selected=false;for(i=1;i<=c.numLayers;i++)c.layer(i).selected=false;p.selected=true;for(i=1;i<=p.numKeys;i++)p.setSelectedAtKey(i,true);}
  function layer(name){var l=c.layers.addNull();l.name=name;qa.remember();return l;}
  function transform(l,name){return l.property('ADBE Transform Group').property(name);}
  function keyed(p,a,b){p.setValueAtTime(0,a);p.setValueAtTime(2,b);select(p);return p;}
  function apply(p,args){select(p);return qa.ok(qa.send(c,'ae.keys.ease.apply',args||curve));}
  function ease(p,i,side){var a=side==='in'?p.keyInTemporalEase(i):p.keyOutTemporalEase(i),out=[];for(var j=0;j<a.length;j++)out.push({speed:a[j].speed,influence:a[j].influence});return out;}
  app.beginSuppressDialogs();
  try{
    qa.test('Scalar and vector native velocities respect duration and signed change',function(){
      var p=keyed(transform(layer('Opacity'),'ADBE Opacity'),0,100);apply(p);qa.assert(p.numKeys===2,'Plain Bezier added keys.');qa.assert(Math.abs(ease(p,1,'out')[0].speed-50)<.0001,'Incorrect scalar speed.');
      var scale=keyed(transform(layer('Scale'),'ADBE Scale'),[100,100],[200,50]);apply(scale);var speeds=ease(scale,1,'out');qa.assert(Math.abs(speeds[0].speed-50)<.0001 && Math.abs(speeds[1].speed+25)<.0001,'Incorrect component speed.');return {scalar:ease(p,1,'out'),vector:speeds};
    });
    qa.test('Native spatial curve retains tangents, key count and curved-path speed',function(){
      var p=keyed(transform(layer('Spatial'),'ADBE Position'),[100,100,0],[500,100,0]);p.setSpatialAutoBezierAtKey(1,false);p.setSpatialAutoBezierAtKey(2,false);p.setSpatialTangentsAtKey(1,[0,0,0],[0,400,0]);p.setSpatialTangentsAtKey(2,[0,400,0],[0,0,0]);
      apply(p);qa.assert(p.numKeys===2,'Plain spatial easing added keys.');qa.assert(Math.abs(p.keyOutSpatialTangent(1)[1]-400)<.001 && Math.abs(p.keyInSpatialTangent(2)[1]-400)<.001,'Spatial tangents changed.');
      qa.assert(Math.abs(ease(p,1,'out')[0].speed-400)<.1,'Native path length was replaced by a chord.');return {ease:ease(p,1,'out'),sample:p.valueAtTime(1,false)};
    });
    qa.test('Hold remains Hold until explicit conversion',function(){
      var p=keyed(transform(layer('Hold'),'ADBE Opacity'),0,100);p.setInterpolationTypeAtKey(1,KeyframeInterpolationType.HOLD,KeyframeInterpolationType.HOLD);apply(p);qa.assert(p.keyOutInterpolationType(1)===KeyframeInterpolationType.HOLD,'Hold was silently changed.');
      var args=MotionJson.parse(MotionJson.stringify(curve));args.convertHold=true;apply(p,args);qa.assert(p.keyOutInterpolationType(1)===KeyframeInterpolationType.BEZIER,'Explicit conversion did not apply.');return {converted:true};
    });
    qa.test('Color with constant red: measure native shared ease units',function(){
      var l=layer('Color'),p=l.property('ADBE Effect Parade').addProperty('ADBE Color Control').property(1);keyed(p,[.2,.1,.3,1],[.2,.9,.3,1]);
      var samples=[], candidates=[0,.4,40,50,100];
      for(var s=0;s<candidates.length;s++){p.setInterpolationTypeAtKey(1,KeyframeInterpolationType.BEZIER,KeyframeInterpolationType.BEZIER);p.setInterpolationTypeAtKey(2,KeyframeInterpolationType.BEZIER,KeyframeInterpolationType.BEZIER);p.setTemporalAutoBezierAtKey(1,false);p.setTemporalAutoBezierAtKey(2,false);p.setTemporalContinuousAtKey(1,false);p.setTemporalContinuousAtKey(2,false);p.setTemporalEaseAtKey(1,[new KeyframeEase(0,50)],[new KeyframeEase(candidates[s],50)]);p.setTemporalEaseAtKey(2,[new KeyframeEase(0,50)],[new KeyframeEase(0,50)]);samples.push({speed:candidates[s],value:p.valueAtTime(1,false)});}
      apply(p);var observed=p.valueAtTime(1,false);qa.assert(Math.abs(observed[1]-.65)<.0001,'Green-only color easing diverged: '+observed[1]);
      var multi=layer('Color combined').property('ADBE Effect Parade').addProperty('ADBE Color Control').property(1);
      keyed(multi,[.1,.1,.3,1],[.7,.9,.3,1]);
      qa.result.colorDiagnostics=[];
      var candidatesMulti=[0,40,76.5,100,102,127.5,178.5];
      for(var cm=0;cm<candidatesMulti.length;cm++){try{multi.setInterpolationTypeAtKey(1,KeyframeInterpolationType.BEZIER,KeyframeInterpolationType.BEZIER);multi.setInterpolationTypeAtKey(2,KeyframeInterpolationType.BEZIER,KeyframeInterpolationType.BEZIER);multi.setTemporalAutoBezierAtKey(1,false);multi.setTemporalAutoBezierAtKey(2,false);multi.setTemporalContinuousAtKey(1,false);multi.setTemporalContinuousAtKey(2,false);multi.setTemporalEaseAtKey(1,[new KeyframeEase(0,50)],[new KeyframeEase(candidatesMulti[cm],50)]);multi.setTemporalEaseAtKey(2,[new KeyframeEase(0,50)],[new KeyframeEase(0,50)]);qa.result.colorDiagnostics.push({speed:candidatesMulti[cm],value:multi.valueAtTime(1,false)});}catch(colorError){qa.result.colorDiagnostics.push({speed:candidatesMulti[cm],error:String(colorError)});}}
      qa.save();apply(multi);qa.result.colorAfterApply={inEase:ease(multi,2,'in'),outEase:ease(multi,1,'out'),auto1:multi.keyTemporalAutoBezier(1),auto2:multi.keyTemporalAutoBezier(2),continuous1:multi.keyTemporalContinuous(1),continuous2:multi.keyTemporalContinuous(2),a:multi.keyValue(1),b:multi.keyValue(2)};qa.save();
      var combined=multi.valueAtTime(1,false);qa.result.colorCombined=combined;qa.save();qa.assert(Math.abs(combined[0]-.5125)<.0001 && Math.abs(combined[1]-.65)<.0001,'Multi-channel color easing diverged: '+MotionJson.stringify(combined));
      return {easeChannels:p.keyOutTemporalEase(1).length,hostApplied:ease(p,1,'out'),hostSample:observed,combined:combined,candidates:samples,expectedGreen:.65};
    });
    qa.test('Independent incoming side preserves outgoing native ease and selection',function(){
      var p=transform(layer('Sides'),'ADBE Rotate Z');p.setValueAtTime(0,0);p.setValueAtTime(1,90);p.setValueAtTime(3,0);p.setTemporalEaseAtKey(2,[new KeyframeEase(12,37)],[new KeyframeEase(25,42)]);select(p);p.setSelectedAtKey(1,false);p.setSelectedAtKey(3,false);
      var before=ease(p,2,'out'),args=MotionJson.parse(MotionJson.stringify(curve));args.applyOut=false;qa.ok(qa.send(c,'ae.keys.ease.apply',args));qa.assert(MotionJson.stringify(ease(p,2,'out'))===MotionJson.stringify(before),'Unselected side changed.');qa.assert(p.selectedKeys.length===1 && p.selectedKeys[0]===2,'Key selection changed.');return {outgoing:before};
    });
    qa.test('Generated session reapply replaces owned keys; plain restores original pair',function(){
      var p=keyed(transform(layer('Session'),'ADBE Opacity'),0,100),args=MotionJson.parse(MotionJson.stringify(curve));args.points=[{x:.5,y:.5,inX:.4,inY:.4,outX:.6,outY:.6}];
      var first=apply(p,args);qa.assert(p.numKeys===3,'Point key was not generated.');args.session=first.session;var repeated=apply(p,args);qa.assert(p.numKeys===3,'Session generated duplicate keys.');
      var plain=MotionJson.parse(MotionJson.stringify(curve));plain.session=repeated.session;apply(p,plain);qa.assert(p.numKeys===2,'Session did not restore plain source keys.');return {remainingKeys:p.numKeys};
    });
    qa.test('Separated dimensions receive scalar easing without changing separation',function(){
      var leader=transform(layer('Separated'),'ADBE Position');leader.dimensionsSeparated=true;var p=keyed(leader.getSeparationFollower(0),100,400);apply(p);qa.assert(leader.dimensionsSeparated && p.numKeys===2,'Separated position was merged or regenerated.');return {ease:ease(p,1,'out')};
    });
  }catch(e){qa.result.fatal=String(e);}finally{qa.finish();app.endSuppressDialogs(false);}
}());
