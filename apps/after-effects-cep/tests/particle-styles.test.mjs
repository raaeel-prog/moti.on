import test from 'node:test';
import assert from 'node:assert/strict';
import {loadHostModules} from './host-harness.mjs';
import {cloneParticleArgs} from '../../../packages/contracts/dist/index.js';
const cc='CC Particle World',slider='ADBE Slider Control',color='ADBE Color Control',angle='ADBE Angle Control';
// Measured on AE26.5x89; longevity and random seed explicitly cannot host expressions.
const nativeIds=['0015','0019','0020','0095','0096','0097','0004','0005','0016','0024','0025','0027','0029','0030','0007','0008','0009','0010','0011','0012','0018','0041','0023','0026','0028','0104','0051','0052','0053','0055','0060','0061'];
async function fixture(config={}){
 let nextId=0,failures=0;const sources=[];
 class CompItem{
  constructor(){this.id=123;this.layers=[];this.time=1.25;this.width=640;this.height=360;this.pixelAspect=1;this.duration=8;this.selectedProperties=[{selected:true}];this.layers.addNull=()=>makeLayer('Null');this.layers.addSolid=(c,name)=>makeLayer(name);this.layers.precompose=(indices,name)=>{const inner=new CompItem();inner.id=456;inner.name=name;const moving=indices.map(index=>this.layer(index));for(const layer of moving)this.layers.splice(this.layers.indexOf(layer),1);inner.layers.push(...moving);const wrapper=makeLayer(name);wrapper.source=inner;Object.defineProperty(inner,'usedIn',{get:()=>this.layers.some(layer=>layer.source===inner)?[this]:[]});inner.remove=()=>{inner.removed=true;};return inner;};}
  get numLayers(){return this.layers.length;}layer(i){return this.layers[i-1];}get selectedLayers(){return this.layers.filter(layer=>layer.selected);}
 }
 const comp=new CompItem();
 function makeLayer(name){
  const effects=[],layer={id:++nextId,name,comment:'',locked:false,selected:false,parent:null,property(){return parade;},remove(){comp.layers.splice(comp.layers.indexOf(this),1);}};
  const parade={get numProperties(){return effects.length;},canAddProperty:()=>true,property(index){return typeof index==='number'?effects[index-1]:effects.find(effect=>effect.name===index);},addProperty(matchName){
   const effect={name:matchName,matchName,remove(){effects.splice(effects.indexOf(this),1);}},props=new Map();
   const ids=matchName===cc?nativeIds.map(id=>`${cc}-${id}`):[`${matchName}-0001`];
   for(const id of ids){let expression='';const prop={value:matchName===color?[1,0,0,1]:1,numKeys:0,expressionEnabled:false,canSetExpression:!id.endsWith('-0005')&&!id.endsWith('-0104'),expressionError:'',setValue(value){if(config.failId===id&&failures++===0)throw Error('native partial failure');this.value=structuredClone(value);}};
    Object.defineProperty(prop,'expression',{get:()=>expression,set:value=>{if(!prop.canSetExpression)throw Error('unavailable expression capability');expression=value;}});props.set(id,prop);
   }
   effect.property=id=>config.missingId===id?null:props.get(id);effects.push(effect);return effect;
  }};
  layer.source={get usedIn(){return comp.layers.filter(candidate=>candidate.source===this);},remove(){sources.splice(sources.indexOf(this),1);}};sources.push(layer.source);comp.layers.unshift(layer);return layer;
 }
 const app={project:{activeItem:comp},effects:[cc,slider,color,angle].filter(name=>name!==config.missingEffect).map(matchName=>({matchName}))};
 const scope=await loadHostModules(['generated/motion-contracts.jsx','src/json.jsx','src/registry.jsx','src/commands/particles.jsx'],{app,CompItem});
 const command=scope.MotionRegistry.get('ae.effect.particles');
 const run=(args={mode:'dust'})=>{args={precompose:false,...args};assert.equal(command.preflight(args),null);return command.run(args);};
 return {scope,command,comp,config,sources,run,makeLayer,findController:()=>comp.layers.find(layer=>layer.comment.includes('"role":"controller"')),findStream:i=>comp.layers.find(layer=>layer.comment.includes(`"streamIndex":${i}`))};
}
test('all five styled recipes create native color/size/movement at four reproducible depths',async()=>{
 for(const mode of ['dust','bokeh','snow','sparks','field3d']){
  const f=await fixture(),result=f.run({mode});assert.equal(result.data.mode,mode);assert.equal(result.data.streamCount,4);assert.equal(f.comp.numLayers,5);assert.equal(f.comp.time,1.25);assert.equal(f.comp.selectedLayers.length,0);
  const controller=f.findController();assert.ok(controller);assert.equal(controller.property().numProperties,26);
  const depths=[],seeds=[];for(let i=0;i<4;i++){const layer=f.findStream(i),fx=layer.property().property(1);assert.equal(layer.parent,controller);depths.push(fx.property(`${cc}-0009`).value);seeds.push(fx.property(`${cc}-0104`).value);assert.equal(fx.property(`${cc}-0005`).expression,'');assert.equal(fx.property(`${cc}-0023`).value,mode==='sparks'?1:5,'native render calibration: 4 is shaded, 5 has soft alpha');assert.match(fx.property(`${cc}-0024`).expression,/MOTION_PARTICLES_V2/);assert.match(fx.property(`${cc}-0029`).expression,/color/);assert.equal(fx.property(`${cc}-0055`).value,0);}
  assert.deepEqual(depths,[-.35,0,.4,.9]);assert.equal(new Set(seeds).size,4);
 }
});
test('selecting any member or controller adjusts the same rig and keeps unrelated layers/effects',async()=>{
 const f=await fixture();f.run({mode:'dust'});const ids=f.comp.layers.map(layer=>layer.id),controller=f.findController();f.findStream(2).selected=true;
 assert.equal(f.run({mode:'bokeh',size:.2}).data.adjusted,true);assert.deepEqual(f.comp.layers.map(layer=>layer.id),ids);assert.equal(f.findStream(2).selected,true);
 const user=f.makeLayer('User image');user.property().addProperty(slider);f.findStream(2).selected=false;user.selected=true;f.run({mode:'field3d'});assert.equal(f.comp.numLayers,6);assert.equal(controller,f.findController());assert.equal(user.property().numProperties,1);assert.equal(user.selected,true);
});
test('field amount,size,opacity,color and movement each drive their matching native properties',async()=>{
 const f=await fixture();f.run({mode:'field3d'});const fx=f.findStream(3).property().property(1);
 assert.match(fx.property(`${cc}-0004`).expression,/4 amount/);assert.match(fx.property(`${cc}-0024`).expression,/4 size/);assert.match(fx.property(`${cc}-0027`).expression,/4 opacity/);assert.match(fx.property(`${cc}-0029`).expression,/4 color/);assert.match(fx.property(`${cc}-0016`).expression,/4 movement/);
 assert.equal(f.findController().property().property('Moti.on Particles longevity'),undefined,'longevity must not pretend to be a live control');
});

test('native recipe defaults match editor contracts while explicit older values stay editable',async()=>{
 for(const mode of ['dust','bokeh','snow','sparks','field3d']){
  const f=await fixture(),expected=cloneParticleArgs(mode);f.run({mode});const controls=f.findController().property();
  for(const key of ['birthRate','velocity','size','opacity','movement'])assert.equal(controls.property('Moti.on Particles '+key).property(`${slider}-0001`).value,expected[key],mode+'/'+key);
  assert.equal(f.findStream(0).property().property(1).property(`${cc}-0005`).value,expected.longevity);
 }
 const f=await fixture();f.run({mode:'bokeh',birthRate:.35,size:.16,opacity:34});const controls=f.findController().property();
 assert.equal(controls.property('Moti.on Particles size').property(`${slider}-0001`).value,.16);
 assert.equal(controls.property('Moti.on Particles opacity').property(`${slider}-0001`).value,34);
});
test('creation failure cleans every managed layer and source without touching selection',async()=>{
 const f=await fixture({failId:`${cc}-0027`}),user=f.makeLayer('User');user.selected=true;const before=f.sources.length;
 assert.equal(f.command.preflight({mode:'snow'}),null);assert.throws(()=>f.command.run({mode:'snow'}),/native partial failure/);assert.deepEqual([...f.comp.layers],[user]);assert.equal(f.sources.length,before);assert.equal(user.selected,true);assert.equal(f.comp.time,1.25);
});
test('adjustment snapshots restore controller values, expressions, metadata and all four streams',async()=>{
 const f=await fixture();f.run({mode:'field3d'});const comments=f.comp.layers.map(layer=>layer.comment),controller=f.findController(),old=controller.property().property('Moti.on Particles size').property(`${slider}-0001`).value;
 f.config.failId=`${cc}-0027`;assert.equal(f.command.preflight({mode:'bokeh',size:.4}),null);assert.throws(()=>f.command.run({mode:'bokeh',size:.4}),/native partial failure/);assert.deepEqual(f.comp.layers.map(layer=>layer.comment),comments);assert.equal(controller.property().property('Moti.on Particles size').property(`${slider}-0001`).value,old);assert.equal(f.comp.numLayers,5);
});
test('preflight detects locked, missing, duplicated, reparented and manually animated members before writes',async()=>{
 const f=await fixture();f.run({mode:'field3d'});const layer=f.findStream(1);layer.locked=true;assert.equal(f.command.preflight({mode:'dust'}).code,'INVALID_SELECTION_TYPE');layer.locked=false;layer.parent=null;assert.equal(f.command.preflight({mode:'dust'}).code,'TRACK_CONFLICT');layer.parent=f.findController();
 const p=layer.property().property(1).property(`${cc}-0024`);p.numKeys=1;assert.equal(f.command.preflight({mode:'dust'}).code,'EXPRESSION_CONFLICT');p.numKeys=0;p.expression='value*2';assert.equal(f.command.preflight({mode:'dust'}).code,'EXPRESSION_CONFLICT');
});
test('preflight refuses unavailable capabilities and malformed stream data without creating members',async()=>{
 const f=await fixture({missingEffect:color});assert.equal(f.command.preflight({mode:'dust'}).code,'CAPABILITY_UNAVAILABLE');assert.equal(f.comp.numLayers,0);
 for(const args of [{mode:'unknown'},{mode:'field3d',streams:[]},{mode:'snow',color:[2,0,0]},{seed:1.1},{seed:10001}])assert.equal(f.command.preflight(args).code,'INVALID_PRESET');
});
test('selection changing after preflight prevents mutation and consumes the prepared command',async()=>{
 const f=await fixture();assert.equal(f.command.preflight({mode:'dust'}),null);const user=f.makeLayer('User');user.selected=true;assert.throws(()=>f.command.run({mode:'dust'}),/contexto/);assert.equal(f.comp.numLayers,1);assert.throws(()=>f.command.run({mode:'dust'}),/contexto/);
});
test('remove only deletes the owned rig; extra user effects or children block it',async()=>{
 const f=await fixture();f.run({mode:'field3d'});const user=f.makeLayer('User'),controller=f.findController();user.parent=controller;assert.equal(f.command.preflight({action:'remove'}).code,'TRACK_CONFLICT');user.parent=null;
 const extra=f.findStream(1).property().addProperty(slider);assert.equal(f.command.preflight({action:'remove'}).code,'TRACK_CONFLICT');extra.remove();assert.equal(f.run({action:'remove'}).data.removed,true);assert.deepEqual([...f.comp.layers],[user]);assert.equal(f.sources.length,1);
});

 test('rising creates a live angle and spread with native direction physics and broad emission',async()=>{
 const f=await fixture();f.run({mode:'rising'});const c=f.findController();
 assert.equal(c.property().property('Moti.on Particles Direção').matchName,angle);
 for(let i=0;i<4;i++){const fx=f.findStream(i).property().property(1);assert.equal(fx.property(`${cc}-0015`).value,2);assert.equal(fx.property(`${cc}-0018`).value,0);assert.equal(fx.property(`${cc}-0097`).value,1);assert.match(fx.property(`${cc}-0020`).expression,/Direção/);assert.match(fx.property(`${cc}-0019`).expression,/Dispersão/);}
 });
 test('patch preserves native edits and animated unrelated controls; read is inert and returns live values',async()=>{
 const f=await fixture();f.run({mode:'field3d'});const c=f.findController(),opacity=c.property().property('Moti.on Particles opacity').property(`${slider}-0001`);opacity.setValue(42);opacity.numKeys=1;
 c.selected=true;const read=f.scope.MotionRegistry.get('ae.effect.particles.read');assert.ok(read);assert.equal(read.preflight({}),null);const data=read.run({}).data;assert.equal(data.settings.opacity,42);assert.equal(data.rigId,JSON.parse(c.comment.split('[MOTION_PARTICLES_V2]')[1].split('[/MOTION_PARTICLES_V2]')[0]).rigId);
 f.run({mode:'field3d',direction:90,spread:10,changedFields:['direction','spread'],targetRigId:data.rigId,targetCompId:123});assert.equal(opacity.value,42);assert.equal(opacity.numKeys,1);assert.equal(f.comp.numLayers,5);
 const a=c.property().property('Moti.on Particles Direção').property(`${angle}-0001`);a.numKeys=1;assert.equal(f.command.preflight({mode:'field3d',direction:180,changedFields:['direction']}).code,'EXPRESSION_CONFLICT');
 });
 test('patch target drift is rejected without mutating and legacy numeric calls stay classic',async()=>{
 const f=await fixture();f.run({mode:'rising'});assert.equal(f.command.preflight({mode:'rising',direction:90,changedFields:['direction'],targetRigId:'wrong',targetCompId:123}).code,'TRACK_CONFLICT');
 assert.equal(f.command.preflight({mode:'rising',direction:90,changedFields:['direction'],targetCompId:999}).code,'TRACK_CONFLICT');
 });

 test('direction opt-in migrates v2 and rollback removes only newly added controls',async()=>{
 const f=await fixture();f.run({mode:'field3d'});const c=f.findController();c.comment=c.comment.replace('"schemaVersion":3','"schemaVersion":2');const before=c.comment,keys=c.property().numProperties;
 f.config.failId=`${cc}-0020`;assert.equal(f.command.preflight({mode:'field3d',direction:90,changedFields:['direction']}),null);assert.throws(()=>f.command.run({mode:'field3d',direction:90,changedFields:['direction']}),/native partial failure/);assert.equal(c.property().numProperties,keys);assert.equal(c.comment,before);
 f.config.failId=null;f.run({mode:'field3d',direction:90,changedFields:['direction']});assert.equal(c.property().numProperties,keys+2);assert.match(c.comment,/"schemaVersion":3/);assert.equal(f.comp.numLayers,5);
 });
 test('switching to an original style clears directional physics and remains removable',async()=>{
 const f=await fixture();f.run({mode:'rising'});f.run({mode:'snow'});const fx=f.findStream(0).property().property(1);assert.equal(fx.property(`${cc}-0015`).value,1);assert.equal(fx.property(`${cc}-0020`).expression,'');assert.equal(fx.property(`${cc}-0018`).value,.025);assert.equal(f.run({action:'remove'}).data.removed,true);
 });
 test('malformed sparse updates cannot omit their values',async()=>{
 const f=await fixture();f.run({mode:'rising'});assert.equal(f.command.preflight({mode:'rising',changedFields:['direction']}).code,'INVALID_PRESET');assert.equal(f.command.preflight({mode:'rising',changedFields:['streams.0.size']}).code,'INVALID_PRESET');
 });

 test('a patch refuses native animation that conflicts with its changed controller, but preserves unrelated overrides',async()=>{
 const f=await fixture();f.run({mode:'rising'});const p=f.findStream(0).property().property(1).property(`${cc}-0024`);p.expression='value*2';
 f.run({mode:'rising',direction:90,changedFields:['direction']});assert.equal(p.expression,'value*2');
 assert.equal(f.command.preflight({mode:'rising',size:.4,changedFields:['size']}).code,'EXPRESSION_CONFLICT');
 });

 test('new styled creation precomposes only owned layers and a selected wrapper reads/adjusts its internal rig',async()=>{
 const f=await fixture(),user=f.makeLayer('User image');user.selected=true;
 const created=f.run({mode:'rising',precompose:true});assert.equal(f.comp.numLayers,2);assert.equal(user.selected,true);
 const wrapper=f.comp.layers.find(l=>l.source instanceof f.comp.constructor);assert.ok(wrapper);assert.equal(wrapper.source.numLayers,5);assert.equal(created.data.precomposed,true);
 user.selected=false;wrapper.selected=true;const read=f.scope.MotionRegistry.get('ae.effect.particles.read');assert.equal(read.preflight({}),null);let data=read.run({}).data;assert.equal(data.settings.direction,0);assert.equal(data.compId,123);
 f.run({mode:'rising',direction:90,changedFields:['direction'],targetRigId:data.rigId,targetCompId:123});data=read.run({}).data;assert.equal(data.settings.direction,90);assert.equal(wrapper.source.numLayers,5);assert.equal(f.comp.numLayers,2);
 });
