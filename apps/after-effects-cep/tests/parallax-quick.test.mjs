import test from "node:test";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { loadHostModules } from "./host-harness.mjs";

let nextId = 1;
const clone = (v) => structuredClone(v);
class Property {
  constructor(value) { this.value = clone(value); this.numKeys = 0; this.expression = ""; this.keys = []; }
  setValue(value) { if (this.failOnce) { this.failOnce = false; throw new Error("injected write failure"); } this.value = clone(value); }
  setValueAtTime(t, value) { this.keys.push({ t, value: clone(value) }); this.numKeys = this.keys.length; }
  valueAtTime(t) { return clone(this.keys.find((k) => k.t === t)?.value ?? this.value); }
  removeKey(i) { this.keys.splice(i-1, 1); this.numKeys = this.keys.length; }
  setInterpolationTypeAtKey() {}
  setSpatialAutoBezierAtKey() {}
  setSpatialTangentsAtKey() {}
}
class Layer {
  constructor() {
    this.id = nextId++; this.comment = "User notes"; this.threeDLayer = false; this.parent = null;
    this.selected = true; this.enabled = true; this.hasVideo = true; this.blendingMode = 1;
    this.source = {mainSource:{isStill:true},pixelAspect:1};
    this.values = Object.fromEntries(Object.entries({"ADBE Position":[1350,250],"ADBE Scale":[-70,130],"ADBE Anchor Point":[40,90],"ADBE Rotate Z":23,"ADBE Opacity":100,"ADBE Orientation":[0,0,0],"ADBE Rotate X":0,"ADBE Rotate Y":0}).map(([k,v])=>[k,new Property(v)]));
  }
  get index() { return this.comp.items.indexOf(this)+1; }
  property(name) {
    if (name === "ADBE Transform Group") return {property:(key)=>this.values[key]};
    return {numProperties:0};
  }
  remove() { this.comp.items.splice(this.comp.items.indexOf(this),1); }
  moveToBeginning() { this.remove(); this.comp.items.unshift(this); }
}
class CameraLayer extends Layer {
  constructor() { super(); this.zoom = new Property(2000); this.dof = new Property(1); }
  property(name) { if (name === "ADBE Camera Options Group") return {property:(key)=>key === "ADBE Camera Zoom" ? this.zoom : this.dof}; return super.property(name); }
}
class LightLayer extends Layer {}
class CompItem {
  constructor(n=4) {
    this.id = nextId++; this.width=1920;this.height=1080;this.pixelAspect=1;this.renderer="ADBE Advanced 3d";this.time=0;this.duration=6;
    this.items=Array.from({length:n},()=>new Layer());this.items.forEach(l=>l.comp=this);
    // AE addCamera/addNull reindex existing layers AND change the selected layers.
    this.layers={addCamera:()=>this.add(new CameraLayer()),addNull:()=>this.add(new Layer())};
  }
  add(layer) { this.items.forEach(l=>l.selected=false);layer.comp=this;this.items.unshift(layer);return layer; }
  get activeCamera() { return this.items.find(l=>l instanceof CameraLayer && l.enabled); }
  get numLayers() { return this.items.length; }
  get selectedLayers() { return (this.selectionOrder ?? this.items).filter(l=>l.selected); }
  layer(index) { return this.items[index-1]; }
}
const args = {depthStep:0,strength:1,orderMode:"selection",createCamera:true,preserveFraming:true,controllerName:"Parallax"};
async function setup(n=4) {
  const comp=new CompItem(n), original=[...comp.items];
  const scope=await loadHostModules(["generated/motion-contracts.jsx","src/json.jsx","src/registry.jsx","src/rig-meta.jsx","src/commands/animate-parallax-quick.jsx"],{app:{project:{activeItem:comp}},CompItem,CameraLayer,LightLayer,Property,PropertyType:{PROPERTY:1},AutoOrientType:{NO_AUTO_ORIENT:0},BlendingMode:{NORMAL:1},KeyframeInterpolationType:{LINEAR:1}});
  const handler=scope.MotionRegistry.get("ae.animate.parallax.quick");
  return {comp,original,scope,handler,run:(a=args)=>{assert.equal(handler.preflight(a),null);return handler.run(a);}};
}
const value=(l,k)=> {
  const p=l.values[k];
  if (!p.expression || !p.expressionEnabled) return p.value;
  return Array.from(runInNewContext(p.expression, {value:p.value, transform: {position: k === "ADBE Scale" ? value(l,"ADBE Position") : p.value}}));
};
function corners(layer) {
  const p=value(layer,"ADBE Position"),s=value(layer,"ADBE Scale"),a=value(layer,"ADBE Anchor Point"),r=value(layer,"ADBE Rotate Z")*Math.PI/180;
  return [[0,0],[500,0],[500,300],[0,300],a].map(([x,y])=>{
    x=(x-a[0])*s[0]/100;y=(y-a[1])*s[1]/100;
    const xx=p[0]+x*Math.cos(r)-y*Math.sin(r), yy=p[1]+x*Math.sin(r)+y*Math.cos(r),k=3000/(3000+(p[2]??0));
    return [960+(xx-960)*k,540+(yy-540)*k];
  });
}
test("realistic selection changes do not consume the new camera as a participant",async()=>{
  const f=await setup();const result=f.run();assert.equal(result.data.layerCount,4);
  assert.deepEqual(f.original.map(l=>value(l,"ADBE Position")[2]),[-2500,-5000/3,-2500/3,-0]);
  assert.ok(f.original.every(l=>l.threeDLayer&&!l.parent&&l.selected));
  assert.equal(f.comp.activeCamera.zoom.value,3000);assert.deepEqual(value(f.comp.activeCamera,"ADBE Position"),[0,0,-3000]);
});
test("selection and timeline order distribute depth differently", async()=>{
  const selected = await setup(3);
  selected.comp.selectionOrder = [selected.original[2], selected.original[0], selected.original[1]];
  selected.run();
  assert.deepEqual(selected.original.map(l=>value(l,"ADBE Position")[2]),[-1250,-0,-2500]);

  const timeline = await setup(3);
  timeline.comp.selectionOrder = [timeline.original[2], timeline.original[0], timeline.original[1]];
  timeline.run({...args,orderMode:"timeline"});
  assert.deepEqual(timeline.original.map(l=>value(l,"ADBE Position")[2]),[-2500,-1250,-0]);
});
test("off-center anchor, mirror, nonuniform scale and rotated corners preserve projection within 1e-8",async()=>{
  const f=await setup();const before=f.original.map(corners);f.run();const after=f.original.map(corners);
  before.flat(2).forEach((v,i)=>assert.ok(Math.abs(v-after.flat(2)[i])<1e-8));
});
test("metadata survives a serialized round-trip, preserves comments, and adjusts A-B-A without drift",async()=>{
  const f=await setup();const notes=f.original.map(l=>l.comment);f.run();const before=f.original.map(corners);const count=f.comp.numLayers;
  const master=f.comp.items.find(l=>l.comment.includes('"rigType":"parallax.quick"'));
  master.comment="Prefix\n"+master.comment+"\nSuffix";
  f.run({...args,strength:0.5});f.run();assert.equal(f.comp.numLayers,count);
  assert.deepEqual(f.original.map(corners),before);assert.deepEqual(f.original.map(l=>l.comment),notes);
  assert.ok(master.comment.startsWith("Prefix\n")&&master.comment.endsWith("\nSuffix"));
});
test("partial plane write failure restores all originals and removes only newly created objects",async()=>{
  const f=await setup();const before=f.original.map(l=>clone(l.values));f.original[1].values["ADBE Scale"].failOnce=true;
  assert.throws(()=>f.run(),/injected write failure/);assert.equal(f.comp.numLayers,4);
  f.original.forEach((l,i)=>{assert.equal(l.threeDLayer,false);for(const k of ["ADBE Position","ADBE Scale","ADBE Anchor Point"])assert.deepEqual(l.values[k].value,before[i][k].value);});
});
for(const [name,change] of [
  ["locked",f=>f.original[1].locked=true],["parent",f=>f.original[1].parent=f.original[0]],
  ["pre-existing 3D",f=>f.original[1].threeDLayer=true],["separated position",f=>f.original[1].values["ADBE Position"].dimensionsSeparated=true],
  ["disabled expression",f=>f.original[1].values["ADBE Scale"].expression="value"],["rotation keys",f=>f.original[1].values["ADBE Rotate Z"].numKeys=1],
  ["matte provider",f=>f.original[1].isTrackMatte=true],["matte consumer",f=>f.original[1].hasTrackMatte=true],
  ["unsupported renderer",f=>f.comp.renderer="Advanced 3D"],["non-square pixels",f=>f.comp.pixelAspect=2],
  ["external camera",f=>f.comp.add(new CameraLayer())],
  ["solo",f=>f.original[1].solo=true]
]) test(`${name} fails before mutation`,async()=>{const f=await setup();change(f);const count=f.comp.numLayers;assert.ok(f.handler.preflight(args));assert.equal(f.comp.numLayers,count);});
test("one plane and preserveFraming off are explicitly refused",async()=>{const f=await setup(1);assert.ok(f.handler.preflight(args));const g=await setup();assert.ok(g.handler.preflight({...args,preserveFraming:false}));});
test("manual edits and composition duplication cannot silently adopt or overwrite an existing rig",async()=>{
  const f=await setup();f.run();f.original[0].values["ADBE Scale"].value=[1,2,100];assert.ok(f.handler.preflight(args));
  const g=await setup();g.run();g.comp.id++;assert.ok(g.handler.preflight(args));
});
test("depth safety rollback leaves the original scene intact",async()=>{const f=await setup();assert.throws(()=>f.run({...args,depthStep:10000}),/85%/);assert.equal(f.comp.numLayers,4);assert.ok(f.original.every(l=>!l.threeDLayer));});
test("Create and Quick share one executor; movement produces native Position keys without changing Zoom",async()=>{
  const f=await setup();assert.equal(f.scope.MotionRegistry.get("ae.parallax.create").run,f.handler.run);f.run();
  const h=f.scope.MotionRegistry.get("ae.parallax.move");const a={preset:"subtle",durationSeconds:3};assert.equal(h.preflight(a),null);h.run(a);
  const camera=f.comp.activeCamera;assert.equal(camera.zoom.value,3000);assert.deepEqual(camera.parent.values["ADBE Position"].keys,[{t:0,value:[960,540,0]},{t:3,value:[998.4,540,90]}]);assert.ok(h.preflight(a));
});
test("remove restores original 2D transforms and preserves layer comments",async()=>{
  const f=await setup();const before=f.original.map(l=>[value(l,"ADBE Position"),value(l,"ADBE Scale"),l.comment]);f.run();
  const h=f.scope.MotionRegistry.get("ae.parallax.remove");assert.equal(h.preflight({}),null);h.run({});
  assert.equal(f.comp.numLayers,4);assert.deepEqual(f.original.map(l=>[value(l,"ADBE Position"),value(l,"ADBE Scale"),l.comment]),before);assert.ok(f.original.every(l=>!l.threeDLayer));
});

test("precomps, video footage, text and shapes share the planar projection",async()=>{
  const f=await setup();
  f.original[0].source=new CompItem(0);
  f.original[1].source.mainSource.isStill=false;
  f.original[2].source=null;
  f.original[3].source=null;
  f.run();assert.ok(f.original.every(l=>l.threeDLayer));
});
test("manual depth changes preserve projection through real generated expressions and Quick does not reset them",async()=>{
  const f=await setup();const before=corners(f.original[0]);f.run();
  const layer=f.original[0];layer.values["ADBE Position"].setValue([1350,250,-1200]);
  const after=corners(layer);before.flat().forEach((v,i)=>assert.ok(Math.abs(v-after.flat()[i])<1e-8));
  const reused=f.handler.run(args,{}, {mode:"quick"});
  assert.equal(reused.data.status,"reused");assert.equal(layer.values["ADBE Position"].value[2],-1200);
});
test("moving the null leaves plane compensation frozen while the camera follows its parent",async()=>{
  const f=await setup();f.run();const camera=f.comp.activeCamera;
  assert.ok(camera.parent.threeDLayer);assert.ok(f.original.every(l=>!l.parent));
  const before=f.original.map(corners);camera.parent.values["ADBE Position"].setValue([1100,540,200]);
  assert.deepEqual(f.original.map(corners),before);
});

test("collapsed planar PSD precomps and locked interleaved overlays remain editable", async()=>{
  const f=await setup(5);
  for(const l of f.original) {l.source=new CompItem(2);l.collapseTransformation=true;}
  const overlay=f.original[1];overlay.selected=false;overlay.locked=true;
  const before=clone(overlay.values);
  const result=f.run();assert.equal(result.data.layerCount,4);
  assert.equal(overlay.threeDLayer,false);assert.equal(overlay.locked,true);
  assert.deepEqual(clone(overlay.values),before);
  assert.ok(f.original.filter(l=>l!==overlay).every(l=>!l.collapseTransformation));
  assert.equal(overlay.collapseTransformation,true);
  const remove=f.scope.MotionRegistry.get("ae.parallax.remove");remove.run({});
  assert.ok(f.original.every(l=>l.collapseTransformation));
});
test("collapsed precomps containing nested 3D are refused before mutation",async()=>{
 const f=await setup();f.original[0].source=new CompItem(1);f.original[0].collapseTransformation=true;
 f.original[0].source.layer(1).threeDLayer=true;
 assert.match(f.handler.preflight(args).message,/cena 3D/);assert.equal(f.comp.numLayers,4);
});

