// Original visual calibration, using only owned compositions and native CC Particle World.
(function(){
 var repo=File($.fileName).parent.parent.fsName;$.evalFile(new File(repo+'/scripts/tools-audit-fixture-lib.jsx'));
 var qa=new MotionToolsAudit(repo,'particles-polish');
 var recipes=[{mode:'dust',birthRate:1.5,size:.1,opacity:55},{mode:'bokeh',birthRate:.6,size:.6,opacity:65},{mode:'snow',birthRate:3,size:.13,opacity:90},{mode:'field3d',birthRate:3,size:.2,opacity:85}];
 try{for(var i=0;i<recipes.length;i++)(function(recipe){qa.test(recipe.mode+': calibrated native render',function(){var c=qa.comp(recipe.mode);qa.ok(qa.send(c,'ae.effect.particles',recipe));return {settings:recipe,early:qa.png(c,recipe.mode+'-2s',2),settled:qa.png(c,recipe.mode+'-5s',5)};});}(recipes[i]));
 qa.test('Particle type calibration: actual installed enum renders',function(){var c=qa.comp('native-types');qa.ok(qa.send(c,'ae.effect.particles',recipes[1]));var images=[];for(var type=3;type<=6;type++){for(var n=1;n<=c.numLayers;n++){var effects=c.layer(n).property('ADBE Effect Parade');for(var e=1;e<=effects.numProperties;e++)if(effects.property(e).matchName==='CC Particle World')effects.property(e).property('CC Particle World-0023').setValue(type);}images.push(qa.png(c,'native-type-'+type,2));}return {images:images};});
 }catch(error){qa.result.fatal=String(error);}finally{qa.finish();}
}());
