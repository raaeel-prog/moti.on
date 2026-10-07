import test from 'node:test';
import assert from 'node:assert/strict';
import { loadHostModules } from './host-harness.mjs';
const ids=['CC Particle World-0004','CC Particle World-0005','CC Particle World-0016'];
async function fixture(config={}) {
  let failures=0;
  const items=[];
  class CompItem {
    constructor(){this.layers=[];this.width=320;this.height=180;this.pixelAspect=1;this.duration=3;this.time=.5;this.layers.addSolid=()=>{const l=makeLayer();l.source={usedIn:[],remove(){items.splice(items.indexOf(this),1);}};items.push(l.source);this.layers.push(l);return l;};}
    get numLayers(){return this.layers.length;}
    layer(i){return this.layers[i-1];}
    get selectedLayers(){return this.layers.filter(l=>l.selected);}
  }
  const comp=new CompItem();
  function makeLayer(){
    const effects=[];
    const parade={get numProperties(){return effects.length;},canAddProperty(){return !config.missing;},property(i){return effects[i-1];},addProperty(){
      const props=Object.fromEntries(ids.map((id,i)=>[id,{value:[2,1,1][i],numKeys:0,expression:'',setValue(v){if(config.failParameter===i&&failures++===0)throw new Error('injected write failure');this.value=v;}}]));
      const effect={name:'CC Particle World',matchName:'CC Particle World',property(n){return config.missingParameter===n?null:props[n];},remove(){effects.splice(effects.indexOf(this),1);}};effects.push(effect);return effect;
    }};
    return {id:23,comment:'user comment',locked:false,selected:true,property(){return parade;},remove(){comp.layers.splice(comp.layers.indexOf(this),1);}};
  }
  if(!config.empty)comp.layers.push(makeLayer());
  const app={project:{activeItem:comp},effects:config.missing?[]:[{matchName:'CC Particle World'}]};
  const scope=await loadHostModules(['generated/motion-contracts.jsx','src/json.jsx','src/registry.jsx','src/commands/particles.jsx'],{app,CompItem});
  return {cmd:scope.MotionRegistry.get('ae.effect.particles'),comp,items,config};
}
const args={birthRate:3,longevity:2,velocity:.4};
function apply(f,a=args){assert.equal(f.cmd.preflight(a),null);return f.cmd.run(a);}
test('Particles applies measured parameter IDs and adjusts one owned instance',async()=>{const f=await fixture();apply(f);const l=f.comp.layer(1),fx=l.property().property(1);assert.equal(fx.property(ids[0]).value,3);assert.equal(fx.property(ids[1]).value,2);assert.equal(fx.property(ids[2]).value,.4);assert.ok(l.comment.startsWith('user comment\n'));assert.equal(apply(f,{...args,birthRate:4}).data.adjusted,true);assert.equal(l.property().numProperties,1);assert.equal(f.comp.time,.5);assert.equal(l.selected,true);});
test('Particles creates and reuses emitter with no selection',async()=>{const f=await fixture({empty:true});assert.equal(apply(f).data.createdLayer,true);assert.equal(f.comp.selectedLayers.length,0);apply(f);assert.equal(f.comp.numLayers,1);assert.equal(f.items.length,1);});
test('Particles leaves user effect and metadata untouched',async()=>{const f=await fixture();const l=f.comp.layer(1);l.property().addProperty();assert.equal(f.cmd.preflight(args).code,'TRACK_CONFLICT');assert.equal(l.comment,'user comment');assert.equal(l.property().numProperties,1);});
test('Particles rejects manual keys and disabled expressions before updating',async()=>{const f=await fixture();apply(f);const p=f.comp.layer(1).property().property(1).property(ids[0]);p.numKeys=2;assert.equal(f.cmd.preflight(args).code,'EXPRESSION_CONFLICT');p.numKeys=0;p.expression='value*2';assert.equal(f.cmd.preflight(args).code,'EXPRESSION_CONFLICT');assert.equal(p.value,3);});
test('Particles rejects locked layer, unknown args, invalid numbers and missing plugin',async()=>{const f=await fixture();f.comp.layer(1).locked=true;assert.equal(f.cmd.preflight(args).code,'TRACK_CONFLICT');assert.equal(f.cmd.preflight({velocity:NaN}).code,'INVALID_PRESET');assert.equal(f.cmd.preflight({unsupported:true}).code,'INVALID_PRESET');const m=await fixture({empty:true,missing:true});assert.equal(m.cmd.preflight(args).code,'CAPABILITY_UNAVAILABLE');assert.equal(m.comp.numLayers,0);});
test('Particles removes created effect and restores comment after partial failure',async()=>{const f=await fixture({failParameter:1});assert.equal(f.cmd.preflight(args),null);assert.throws(()=>f.cmd.run(args),/injected/);assert.equal(f.comp.layer(1).property().numProperties,0);assert.equal(f.comp.layer(1).comment,'user comment');});
test('Particles removes generated solid and footage on failure',async()=>{const f=await fixture({empty:true,missingParameter:ids[2]});assert.equal(f.cmd.preflight(args),null);assert.throws(()=>f.cmd.run(args),/CAPABILITY/);assert.equal(f.comp.numLayers,0);assert.equal(f.items.length,0);});
test('Particles restores previous values after failed adjustment',async()=>{const f=await fixture();apply(f);f.config.failParameter=1;assert.equal(f.cmd.preflight({...args,birthRate:9}),null);assert.throws(()=>f.cmd.run({...args,birthRate:9}),/injected/);const fx=f.comp.layer(1).property().property(1);assert.equal(fx.property(ids[0]).value,3);assert.equal(fx.property(ids[1]).value,2);});
test('Particles rejects renamed owned effects and malformed ownership',async()=>{const f=await fixture();apply(f);const l=f.comp.layer(1);l.property().property(1).name='User renamed';assert.equal(f.cmd.preflight(args).code,'TRACK_CONFLICT');const m=await fixture();m.comp.layer(1).comment+='[MOTION_PARTICLES_V1]invalid';assert.equal(m.cmd.preflight(args).code,'TRACK_CONFLICT');});
test('Particles consumes staged preflight once and refuses changed args',async()=>{const f=await fixture();assert.equal(f.cmd.preflight(args),null);assert.throws(()=>f.cmd.run({...args,velocity:9}),/contexto/);assert.equal(f.comp.layer(1).property().numProperties,0);assert.throws(()=>f.cmd.run(args),/contexto/);});

