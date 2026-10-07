import test from "node:test";
import assert from "node:assert/strict";
import { loadHostModules } from "./host-harness.mjs";
import { GRADIENT_DEFAULTS, GRADIENT_NATIVE, GRADIENT_SCALARS, cloneGradientSettings } from "../../../packages/contracts/dist/index.js";
const clone = v => structuredClone(v);
class Property {
  constructor(value) { this.value = clone(value); this.keys = []; this.expression = ""; this.expressionEnabled = false; this.canSetExpression = true; this.failOnce = false; }
  get numKeys() { return this.keys.length; }
  valueAtTime(time, preExpression = false) { const exact = this.keys.find(k => Math.abs(k.time - time) < 1e-8); const value = clone(exact ? exact.value : this.value); return !preExpression && this.expressionEnabled && this.expression === "value*2" ? value * 2 : value; }
  setValue(value) { if (this.failOnce) { this.failOnce = false; throw Error("injected write failure"); } if (this.keys.length) throw Error("static write over animation"); this.value = clone(value); }
  setValueAtTime(time, value) { if (this.failOnce) { this.failOnce = false; throw Error("injected keyed failure"); } const key = this.keys.find(k => Math.abs(k.time - time) < 1e-8); if (key) key.value = clone(value); else this.keys.push({time, value: clone(value), ease: "native-default"}); this.keys.sort((a,b) => a.time-b.time); }
  keyTime(index) { return this.keys[index-1].time; }
  setValueAtKey(index,value) { if (this.failOnce) { this.failOnce=false; throw Error("injected keyed failure"); } this.keys[index-1].value=clone(value); }
  removeKey(index) { this.keys.splice(index-1,1); }
}
class Effect {
  constructor(parade, matchName) {
    this.parade = parade; this.matchName = matchName; this.name = matchName; this.enabled = true; this.properties = [];
    for (const d of GRADIENT_SCALARS) this.properties[d.index-1] = new Property(d.kind === "enum" ? 1 : d.default);
    for(let i=0;i<8;i++) { const s=GRADIENT_DEFAULTS.stops[i]; this.properties.push(new Property(s.enabled?1:0),new Property([...s.color,1]),new Property(s.position)); }
    this.properties.push(new Property(1));
  }
  get numProperties() { return this.properties.length; }
  get propertyIndex() { return this.parade.effects.indexOf(this)+1; }
  property(index) { return this.properties[index-1]; }
  remove() { if(this.parade.failRemoveOnce) { this.parade.failRemoveOnce=false; throw Error("injected removal failure"); } this.parade.effects.splice(this.propertyIndex-1,1); if(this.parade.clearSelectionOnRemove)this.parade.owner.selected=false; }
  moveTo(index) { this.parade.effects.splice(this.propertyIndex-1,1); this.parade.effects.splice(index-1,0,this); }
}
class Parade {
  constructor() { this.effects=[]; this.available=true; this.failAddOnce=false; this.failRemoveOnce=false; }
  get numProperties() { return this.effects.length; }
  property(index) { return this.effects[index-1]; }
  canAddProperty(name) { return this.available && name===GRADIENT_NATIVE.matchName; }
  addProperty(name) { if(this.failAddOnce) {this.failAddOnce=false;throw Error("injected add failure");} const effect=new Effect(this,name);this.effects.push(effect);return effect; }
}
let nextId=10;
class Layer {
  constructor(comp) { this.comp=comp;this.id=nextId++;this.name="Layer "+this.id;this.comment="Original user comment";this.locked=false;this.selected=true;this.hasVideo=true;this.nullLayer=false;this.parade=new Parade();this.parade.owner=this;this.source={usedIn:[],removed:false,remove(){this.removed=true;}}; }
  get index() { return this.comp.items.indexOf(this)+1; }
  property(name) { return name==="ADBE Effect Parade"?this.parade:null; }
  moveToEnd() { this.comp.items.splice(this.index-1,1);this.comp.items.push(this); }
  remove() { this.comp.items.splice(this.index-1,1); }
}
class CompItem {
  constructor() { this.id=1;this.items=[];this.time=1;this.width=1920;this.height=1080;this.pixelAspect=1.33;this.duration=8;this.layers={addSolid:(color,name,width,height,pixelAspect,duration)=>{this.lastSolid={color,name,width,height,pixelAspect,duration};for(const l of this.items)l.selected=false;const l=new Layer(this);l.name=name;this.items.unshift(l);return l;}}; }
  get selectedLayers() { return this.items.filter(l=>l.selected); }
  get numLayers() { return this.items.length; }
  layer(i) { return this.items[i-1]; }
}
async function fixture(count=2) {
  const comp=new CompItem();for(let i=0;i<count;i++)comp.items.push(new Layer(comp));
  const app={version:"26.5",project:{activeItem:comp},effects:[{matchName:GRADIENT_NATIVE.matchName}],undo:[],beginUndoGroup(label){this.undo.push(label);},endUndoGroup(){this.ends=(this.ends||0)+1;}};
  const scope=await loadHostModules(["generated/motion-contracts.jsx","generated/motion-descriptors.jsx","src/json.jsx","src/undo.jsx","src/registry.jsx","src/commands/effect-gradient.jsx","src/dispatch.jsx"],{app,CompItem,MotionKeyframes:{captureProperty:p=>({property:p,keys:clone(p.keys)}),restoreProperty:s=>{s.property.keys=clone(s.keys);}}});
  const send=(args,command="ae.effect.gradient")=>JSON.parse(scope.MotionAE.dispatch(JSON.stringify({protocolVersion:1,requestId:"gradient",command,args,context:{host:"after-effects",hostVersion:"26.5"}})));
  return {app,comp,send,read:()=>send({},"ae.effect.gradient.read"),apply:settings=>send({action:"apply",settings:settings||cloneGradientSettings()})};
}
test("Gradient applies idempotently, preserves selection and reads fixed native controls",async()=>{
 const f=await fixture();const ids=f.comp.selectedLayers.map(l=>l.id);assert.equal(f.apply().ok,true);assert.equal(f.apply().data.changed,0);assert.equal(f.comp.items[0].parade.numProperties,1);const read=f.read();assert.equal(read.ok,true);assert.equal(read.data.instances.length,2);assert.deepEqual(read.data.settings,cloneGradientSettings());assert.deepEqual(f.comp.selectedLayers.map(l=>l.id),ids);assert.equal(f.app.undo.length,2);assert.equal(f.app.ends,2);
});
test("Gradient validates the whole selection and native capability before any undo or mutation",async()=>{
 for(const scenario of ["locked","missing","no-video","invalid-settings","no-selection"]){const f=await fixture();if(scenario==="locked")f.comp.items[1].locked=true;if(scenario==="missing")f.comp.items[1].parade.available=false;if(scenario==="no-video")f.comp.items[1].hasVideo=false;if(scenario==="no-selection")f.comp.items.forEach(l=>l.selected=false);const s=cloneGradientSettings();if(scenario==="invalid-settings")s.stops[0].color[0]=Infinity;const result=f.apply(s);assert.equal(result.ok,false,scenario);assert.equal(f.app.undo.length,0,scenario);assert.equal(f.comp.items[0].parade.numProperties,0,scenario);}
});
test("Targeted edits preserve unrelated channels, manual keyframe ease and expression fields",async()=>{
 const f=await fixture(1);f.apply();const effect=f.comp.items[0].parade.property(1);const angle=effect.property(6);angle.keys=[{time:0,value:10,ease:"bezier"},{time:1,value:20,ease:"hold"},{time:3,value:50,ease:"linear"}];effect.property(15).expression="value*2";effect.property(15).expressionEnabled=true;const read=f.read().data;assert.ok(read.lockedKeys.includes("glow"));const settings=cloneGradientSettings();settings.angle=90;settings.glow=4;assert.equal(f.send({action:"update",settings,changedKeys:["angle"],selectionToken:read.selectionToken}).ok,true);assert.deepEqual(angle.keys,[{time:0,value:10,ease:"bezier"},{time:1,value:90,ease:"hold"},{time:3,value:50,ease:"linear"}]);assert.equal(effect.property(15).value,.35);assert.equal(effect.property(15).expression,"value*2");
 const before=f.app.undo.length;assert.equal(f.send({action:"update",settings,changedKeys:["glow"]}).error.code,"EXPRESSION_CONFLICT");assert.equal(f.app.undo.length,before);
});
test("Read aggregates mixed controls and rejects stale selection/time tokens",async()=>{
 const f=await fixture();f.apply();f.comp.items[1].parade.property(1).property(6).value=45;const read=f.read().data;assert.ok(read.mixedKeys.includes("angle"));f.comp.time=2;const settings=cloneGradientSettings();settings.angle=90;const before=f.app.undo.length;assert.equal(f.send({action:"update",settings,changedKeys:["angle"],selectionToken:read.selectionToken}).error.code,"TRACK_CONFLICT");assert.equal(f.app.undo.length,before);
});
test("A failed later write rolls back all earlier values, keys and user comments",async()=>{
 const f=await fixture();f.apply();const a=f.comp.items[0].parade.property(1).property(6);a.keys=[{time:0,value:12,ease:"bezier"}];const before=clone(a.keys);f.comp.items[1].parade.property(1).property(6).failOnce=true;const settings=cloneGradientSettings();settings.angle=90;const result=f.send({action:"update",settings,changedKeys:["angle"]});assert.equal(result.ok,false);assert.equal(result.error.code,"HOST_OPERATION_FAILED");assert.deepEqual(a.keys,before);assert.equal(f.comp.items[1].parade.property(1).property(6).value,0);assert.equal(f.app.ends,f.app.undo.length);
});
test("Failed apply removes only effects created by that batch",async()=>{
 const f=await fixture();f.comp.items[1].parade.failAddOnce=true;const result=f.apply();assert.equal(result.ok,false);assert.equal(f.comp.items[0].parade.numProperties,0);assert.equal(f.comp.items[0].comment,"Original user comment");
});
test("Remove restores an earlier removed effect if a later removal fails",async()=>{
 const f=await fixture();f.apply();f.comp.items[0].parade.property(1).property(15).expression="time";f.comp.items[0].parade.property(1).property(15).expressionEnabled=true;f.comp.items[1].parade.failRemoveOnce=true;assert.equal(f.send({action:"remove"}).ok,false);assert.equal(f.comp.items[0].parade.numProperties,1);assert.equal(f.comp.items[0].parade.property(1).property(15).expression,"time");assert.equal(f.comp.items[0].parade.property(1).property(15).expressionEnabled,true);assert.equal(f.send({action:"remove"}).ok,true);assert.equal(f.comp.items[0].parade.numProperties,0);assert.equal(f.comp.items[0].comment,"Original user comment");
});
test("Manual or renamed native effects are never overwritten or removed",async()=>{
 const f=await fixture(1);f.comp.items[0].parade.addProperty(GRADIENT_NATIVE.matchName);assert.equal(f.apply().error.code,"TRACK_CONFLICT");assert.equal(f.send({action:"remove"}).error.code,"TRACK_CONFLICT");assert.equal(f.comp.items[0].parade.numProperties,1);assert.equal(f.app.undo.length,0);
});
test("Background uses composition geometry and duration at the bottom without changing selection",async()=>{
 const f=await fixture();const ids=f.comp.selectedLayers.map(l=>l.id);const result=f.send({action:"create-background",settings:cloneGradientSettings()});assert.equal(result.ok,true);assert.equal(f.comp.numLayers,3);assert.equal(f.comp.layer(3).id,result.data.createdLayerId);assert.deepEqual(f.comp.lastSolid,{color:[1,1,1],name:"Moti.on Gradient",width:1920,height:1080,pixelAspect:1.33,duration:8});assert.equal(f.comp.layer(3).outPoint,8);assert.deepEqual(f.comp.selectedLayers.map(l=>l.id),ids);
});
test("Create background without native module and mismatched ABI fail closed",async()=>{
 const f=await fixture();f.app.effects=[];assert.equal(f.send({action:"create-background",settings:cloneGradientSettings()}).error.code,"CAPABILITY_UNAVAILABLE");assert.equal(f.comp.numLayers,2);f.apply();f.comp.items[0].parade.property(1).property(54).value=2;assert.equal(f.read().error.code,"CAPABILITY_UNAVAILABLE");
});

test("Remove requires a managed effect and never opens Undo for an empty target",async()=>{const f=await fixture();const result=f.send({action:"remove"});assert.equal(result.ok,false);assert.equal(result.error.code,"INVALID_SELECTION_TYPE");assert.equal(f.app.undo.length,0);});
test("Removing a selected effect restores layer selection cleared by the native host",async()=>{const f=await fixture();f.apply();const ids=f.comp.selectedLayers.map(l=>l.id);for(const l of f.comp.items)l.parade.clearSelectionOnRemove=true;assert.equal(f.send({action:"remove"}).ok,true);assert.deepEqual(f.comp.selectedLayers.map(l=>l.id),ids);assert.equal(f.comp.time,1);});
test("Adding a stop only touches its fixed channel; new CTI keys preserve earlier keys",async()=>{const f=await fixture(1);f.apply();const effect=f.comp.items[0].parade.property(1);const color=effect.property(31);color.keys=[{time:0,value:[1,0,0,1],ease:"bezier"}];const settings=cloneGradientSettings();settings.stops[4].enabled=true;settings.stops[4].position=.55;assert.equal(f.send({action:"update",settings,changedKeys:["stops.4.enabled","stops.4.position"]}).ok,true);assert.deepEqual(color.keys,[{time:0,value:[1,0,0,1],ease:"bezier"}]);settings.stops[0].color=[0,1,0];assert.equal(f.send({action:"update",settings,changedKeys:["stops.0.color"]}).ok,true);assert.deepEqual(color.keys[0],{time:0,value:[1,0,0,1],ease:"bezier"});assert.deepEqual(color.keys[1],{time:1,value:[0,1,0,1],ease:"native-default"});});

test("Rollback preserves pre-expression static values rather than baking evaluated values",async()=>{const f=await fixture();f.apply();const glow=f.comp.items[0].parade.property(1).property(15);glow.expression="value*2";glow.expressionEnabled=true;f.comp.items[1].parade.property(1).property(6).failOnce=true;const settings=cloneGradientSettings();settings.angle=90;assert.equal(f.send({action:"update",settings,changedKeys:["angle"]}).ok,false);assert.equal(glow.value,.35);assert.equal(glow.expression,"value*2");assert.equal(glow.expressionEnabled,true);assert.equal(glow.valueAtTime(1,false),.7);});

test("Gradient preserves user delimiter text and finds its exact metadata after malformed or foreign blocks",async()=>{
 const open="[MOTION_GRADIENT_V1]", close="[/MOTION_GRADIENT_V1]";
 const foreign=JSON.stringify({schemaVersion:2,matchName:GRADIENT_NATIVE.matchName,effectName:"Moti.on Gradient [MOTION_GRADIENT_V1]"});
 const wrongMatch=JSON.stringify({schemaVersion:1,matchName:"User effect",effectName:"Moti.on Gradient [MOTION_GRADIENT_V1]"});
 const wrongName=JSON.stringify({schemaVersion:1,matchName:GRADIENT_NATIVE.matchName,effectName:"User gradient"});
 for(const comment of [
  "User notes: "+open+"not JSON"+close+" — retain this annotation",
  "User notes: "+open+foreign+close+" — retain this annotation",
  "User notes: "+open+wrongMatch+close+" — retain this annotation",
  "User notes: "+open+wrongName+close+" — retain this annotation",
  "User notes: unclosed "+open+" — retain this annotation",
  "User notes: stray "+close+" — retain this annotation"
 ]){
  const f=await fixture(1), layer=f.comp.items[0];layer.comment=comment;
  assert.equal(f.apply().ok,true);
  assert.ok(layer.comment.startsWith(comment),"Apply removed user comment content");
  assert.equal(f.read().data.appliedCount,1,"Read missed the exact managed metadata after user text");
  assert.equal(f.apply().data.changed,0,"Repeat failed to associate the managed effect");
  assert.equal(layer.parade.numProperties,1);
  assert.equal(f.send({action:"remove"}).ok,true);
  assert.equal(layer.comment,comment,"Remove changed the original annotation");
 }
 const f=await fixture(1), layer=f.comp.items[0];
 layer.comment=open+foreign+close;
 const effect=layer.parade.addProperty(GRADIENT_NATIVE.matchName);effect.name="Moti.on Gradient [MOTION_GRADIENT_V1]";
 assert.equal(f.apply().error.code,"TRACK_CONFLICT","A marked native effect still needs exact matching metadata");
 assert.equal(f.send({action:"remove"}).error.code,"TRACK_CONFLICT");
 assert.equal(layer.comment,open+foreign+close);
 assert.equal(layer.parade.numProperties,1);assert.equal(f.app.undo.length,0);
});
