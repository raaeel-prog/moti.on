import test from "node:test";
import assert from "node:assert/strict";
import {loadHostModules} from "./host-harness.mjs";

const CHILDREN = {
  "ADBE Transform Group": ["ADBE Anchor Point", "ADBE Position", "ADBE Scale", "ADBE Rotate Z", "ADBE Opacity"],
  "ADBE Text Properties": ["ADBE Text Document", "ADBE Text Animators"],
  "ADBE Vector Group": ["ADBE Vectors Group", "ADBE Vector Transform Group"],
  "ADBE Vector Transform Group": ["ADBE Vector Anchor", "ADBE Vector Position", "ADBE Vector Scale", "ADBE Vector Rotation", "ADBE Vector Skew"],
  "ADBE Vector Shape - Group": ["ADBE Vector Shape"],
  "ADBE Vector Graphic - Fill": ["ADBE Vector Fill Color", "ADBE Vector Fill Opacity", "ADBE Vector Fill Rule"],
  "ADBE Slider Control": ["ADBE Slider Control-0001"], "ADBE Color Control": ["ADBE Color Control-0001"], "ADBE Checkbox Control": ["ADBE Checkbox Control-0001"], "ADBE Dropdown Control": ["ADBE Dropdown Control-0001"],
  "ADBE Text Animator": ["ADBE Text Selectors", "ADBE Text Animator Properties"],
  "ADBE Vector Shape - Rect": ["ADBE Vector Rect Size", "ADBE Vector Rect Position", "ADBE Vector Rect Roundness"], "ADBE Mask Atom": ["ADBE Mask Shape"]
};
const copy = value => Array.isArray(value) ? value.map(copy) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).map(([k,v]) => [k,copy(v)])) : value;
function document(text) {
  return {text, font: "ArialMT", fontSize: 70, tracking: 0, horizontalScale: 100, verticalScale: 100, baselineShift: 0, fauxBold: false, fauxItalic: false, applyFill: true, applyStroke: false, fillColor: [1,1,1], justification: 0, leading: 84, autoLeading: true, boxText: false,
    get baselineLocs() {return this.text.split(/\r|\n/).flatMap((line,i) => [0,i*84,line.length*40,i*84]);}, characterRange() {return {...this};}};
}
const cloneDoc = d => Object.assign(document(d.text),Object.fromEntries(Object.entries(d).filter(([key]) => key !== "baselineLocs")));
class Prop {
  constructor(name, layer) {
    this.name = name; this.matchName = name; this.layer = layer; this.children = (CHILDREN[name] || []).map(n => new Prop(n, layer)); this._value = /Anchor|Position/.test(name) ? [0,0] : /Scale/.test(name) ? [100,100] : /Opacity/.test(name) ? 100 : /Color/.test(name) ? [1,1,1,1] : 0; this.expression = ""; this.expressionEnabled = false; this.expressionError = ""; this.keys = []; this.selected = false; this.propertyType = 1; this.propertyValueType = /Color/.test(name) ? 2 : 1;
  }
  get value() {return this.matchName === "ADBE Text Document" ? cloneDoc(this._value) : copy(this._value);}
  setValue(value) {if (this.matchName === "ADBE Position" && this.dimensionsSeparated) throw Error("separated Position leader cannot accept a value");if (this.rejectOnce) {this.rejectOnce = false; throw Error("injected property write failure");} this._value = this.matchName === "ADBE Text Document" ? cloneDoc(value) : copy(value);}
  get numProperties() {return this.children.length;}
  get canSetExpression() {return !this.numProperties;}
  get numKeys() {return this.keys.length;}
  property(k) {return typeof k === "number" ? this.children[k-1] : this.children.find(p => p.name === k || p.matchName === k);}
  addProperty(name) {if (this.layer.comp.failProperty === name) throw Error("injected property creation failure"); const p = new Prop(name, this.layer); this.children.push(p); return p;}
  remove() {const target=this;const remove=children => {const index=children.indexOf(target);if(index>=0) {children.splice(index,1);return true;}return children.some(p => remove(p.children));};if(!remove(this.layer.groups)) throw Error("property already removed");}
  setPropertyParameters(items) {this.menuItems=items;return this;}
  removeKey(i) {this.keys.splice(i-1,1);}
  setValueAtTime(time,value) {if (this.rejectOnce) {this.rejectOnce = false; throw Error("injected key failure");} const key = this.keys.find(k => k.time === time); if (key) key.value = copy(value); else this.keys.push({time,value:copy(value),ease:[{speed:0,influence:33}],in:1,out:1}); this.keys.sort((a,b) => a.time-b.time);}
  setValuesAtTimes(times,values) {this.batchCalls=(this.batchCalls || 0)+1;times.forEach((time,i) => this.setValueAtTime(time,values[i]));}
  valueAtTime(time) {if (this.keys.length) return copy(this.keys.filter(k => k.time <= time).at(-1)?.value ?? this.keys[0].value); return this.value;}
  keyTime(i) {return this.keys[i-1].time;} keyValue(i) {return copy(this.keys[i-1].value);} keyInInterpolationType(i) {return this.keys[i-1].in;} keyOutInterpolationType(i) {return this.keys[i-1].out;}
  keyInTemporalEase(i) {return this.keys[i-1].ease;} keyOutTemporalEase(i) {return this.keys[i-1].ease;} keyTemporalContinuous() {return false;} keyTemporalAutoBezier() {return false;} keySelected() {return false;}
  setInterpolationTypeAtKey(i,a,b) {this.keys[i-1].in = a; this.keys[i-1].out = b;} setTemporalEaseAtKey(i,v) {this.keys[i-1].ease=v;} setTemporalContinuousAtKey() {} setTemporalAutoBezierAtKey() {} setSelectedAtKey() {}
  clone(layer) {const p = new Prop(this.matchName,layer); for (const key of ["name","expression","expressionEnabled","propertyValueType","dimensionsSeparated"]) p[key] = this[key]; p._value = this.matchName === "ADBE Text Document" ? this.value : copy(this._value); p.keys = copy(this.keys); p.children = this.children.map(c => c.clone(layer)); return p;}
}
let id = 1;
class Layer {
  constructor(comp,kind,text) {this.comp = comp; this.kind = kind; this.id = id++; this.name = "Title"; this.matchName = kind === "shape" ? "ADBE Vector Layer" : ""; this.parent = null; this.comment = ""; this.enabled = true; this.locked = false; this.selected = true; this.inPoint = 0; this.outPoint = 3; this.solo = false; this.guideLayer = false; this.threeDLayer = false; this.hasTrackMatte = false; this.isTrackMatte = false; this.motionBlur = false; this.blendingMode = 1; this.groups = ["ADBE Transform Group","ADBE Effect Parade","ADBE Mask Parade",...(kind === "text" ? ["ADBE Text Properties"] : []),...(kind === "shape" ? ["ADBE Root Vectors Group"] : [])].map(n => new Prop(n,this)); if (kind === "text") this.property("ADBE Text Properties").property("ADBE Text Document").setValue(document(text));}
  property(name) {return this.groups.find(p => p.matchName === name);}
  duplicate() {const l = this.kind === "text" ? new TextLayer(this.comp,"") : new Layer(this.comp,this.kind); for (const k of ["name","parent","comment","enabled","inPoint","outPoint","selected"]) l[k] = this[k]; l.groups = this.groups.map(p => p.clone(l)); this.comp.list.push(l); return l;}
  remove() {if (this.comp.failRemoveId === this.id) {this.comp.failRemoveId = null; throw Error("injected layer delete failure");} const at = this.comp.list.indexOf(this); if (at < 0) throw Error("already removed"); this.comp.list.splice(at,1);}
  moveBefore(other) {this.comp.list.splice(this.comp.list.indexOf(this),1); this.comp.list.splice(this.comp.list.indexOf(other),0,this);}
  moveAfter(other) {this.comp.list.splice(this.comp.list.indexOf(this),1); this.comp.list.splice(this.comp.list.indexOf(other)+1,0,this);}
  sourceRectAtTime() {const d = this.property("ADBE Text Properties").property("ADBE Text Document").value; return {left:0,top:-50,width:d.text.length*40,height:50};}
}
class TextLayer extends Layer {constructor(comp,text) {super(comp,"text",text);}}
class Comp {
  constructor() {this.list=[]; this.time=.25; this.frameDuration=1/30; this.layers={addText:text => this.add(new TextLayer(this,text)),addShape:() => this.add(new Layer(this,"shape")),addNull:() => this.add(new Layer(this,"null"))};}
  add(l) {this.list.unshift(l); return l;} get selectedLayers() {return this.list.filter(l => l.selected);} get numLayers() {return this.list.length;} layer(i) {return this.list[i-1];}
  convert() {const source=this.selectedLayers[0]; const l=this.layers.addShape(),root=l.property("ADBE Root Vectors Group"),text=source.property("ADBE Text Properties").property("ADBE Text Document").value.text; let x=0,y=0,count=0; for (const ch of text) {if (ch === "\r" || ch === "\n") {x=0;y+=84;continue;} if (/\s/.test(ch)) {x+=20;continue;} if (this.ambiguous && count++) continue; const g=root.addProperty("ADBE Vector Group"); g.property("ADBE Vector Transform Group").property("ADBE Vector Position").setValue([x,y]); const contents=g.property("ADBE Vectors Group"); const v={vertices:[[0,-50],[30,-50],[30,0],[0,0]],inTangents:[[0,0],[0,0],[0,0],[0,0]],outTangents:[[0,0],[0,0],[0,0],[0,0]],closed:true}; contents.addProperty("ADBE Vector Shape - Group").property("ADBE Vector Shape").setValue(v); if (ch === "O") contents.addProperty("ADBE Vector Shape - Group").property("ADBE Vector Shape").setValue({...v,vertices:[[8,-42],[8,-8],[22,-8],[22,-42]]}); x+=40;} source.enabled=false;}
}
const args = overrides => ({action:"apply",renderer:"morph",durationFrames:24,staggerFrames:4,paddingX:10,paddingY:8,roundness:4,revealPoint:50,boxGap:3,fillColor:[.8,.1,.2],direction:"bottom",smoothness:75,formationPercent:25,holdPercent:10,travelPercent:10,order:"normal",automatic:true,progress:0,useSourceColor:true,textColor:[1,1,1],...overrides});
async function fixture(text="BO box") {
  const comp=new Comp(),source=comp.layers.addText(text); source.comment="User notes"; const app={project:{activeItem:comp},findMenuCommandId:() => 1,executeCommand:() => comp.convert()};
  const scope=await loadHostModules(["generated/motion-contracts.jsx","src/json.jsx","src/registry.jsx","src/keyframe-operations.jsx","src/menu-command.jsx","src/morph-geometry.jsx","src/text-glyph-outlines.jsx","src/commands/text-word-morph.jsx","src/commands/text-word-reveal.jsx"],{app,CompItem:Comp,TextLayer,Shape:class Shape {},ParagraphJustification:{LEFT_JUSTIFY:0},KeyframeInterpolationType:{LINEAR:1},PropertyType:{PROPERTY:1},PropertyValueType:{OneD:1,COLOR:2},KeyframeEase:class KeyframeEase {constructor(speed,influence) {this.speed=speed;this.influence=influence;}}});
  const command=scope.MotionRegistry.get("ae.text.word-reveal"),readCommand=scope.MotionRegistry.get("ae.text.word-reveal.read");
  const run=a => {const e=command.preflight(a); if(e) return {error:e}; return command.run(a);}; const read=() => {const e=readCommand.preflight({}); return e?{error:e}:readCommand.run({}).data;};
  const meta=l => scope.MotionWordMorph.meta(l); const rig=() => comp.list.find(l => meta(l)?.role === "controller"); const words=() => comp.list.filter(l => meta(l)?.role === "word").sort((a,b) => meta(a).order-meta(b).order);
  return {comp,source,scope,run,read,meta,rig,words,command};
}
const cp=(l,name) => l.property("ADBE Effect Parade").property(name).property(1);
test("morph uses native whole-layer glyphs, one vector per word, and a non-rendering reference",async () => {
  const f=await fixture(); assert.deepEqual(f.read(),{rigVersion:0,renderer:null,controls:null,wordCount:0,baked:false}); const r=f.run(args()); assert.equal(r.changed,true); assert.equal(f.comp.numLayers,4); assert.equal(f.source.enabled,false); assert.equal(f.source.comment,"User notes"); assert.deepEqual(f.comp.selectedLayers,[f.source]); assert.equal(f.comp.time,.25);
  const w=f.words()[0],root=w.property("ADBE Root Vectors Group"); assert.equal(root.property(1).name,"Render"); assert.equal(root.property(2).name,"Reference"); assert.ok(root.property(2).property("ADBE Vectors Group").children.every(p => p.matchName === "ADBE Vector Shape - Group")); const path=root.property(1).property("ADBE Vectors Group").property(1).property("ADBE Vector Shape"); assert.match(path.expression,/createPath\(v,ii,oo,true\)/); assert.match(path.expression,/if\(q>=1\)\{targetPath;\}/); assert.equal(w.property("ADBE Mask Parade").numProperties,0); assert.equal(f.read().wordCount,2);
});
test("apply adjusts controls without duplicating geometry and protects animated controls",async () => {
  const f=await fixture(); f.run(args()); const c=f.rig(),count=f.comp.numLayers; f.run(args({paddingX:20})); assert.equal(f.comp.numLayers,count); assert.equal(cp(c,"Padding X").value,20); cp(c,"Travel (%)").expression="value+1"; assert.equal(f.run(args({paddingX:20,travelPercent:50})).error.code,"KEYFRAME_CONFLICT"); assert.equal(cp(c,"Travel (%)").expression,"value+1");
});
test("update preserves null identity, animated controls, colors and repeated-word occurrences",async () => {
  const f=await fixture("BO BO"); f.run(args()); const c=f.rig(),first=f.words()[0]; cp(c,"Duration (frames)").setValueAtTime(.25,24); cp(c,"Travel (%)").expression="value+1"; cp(first,"Override box color").setValue(1); cp(first,"Box color").setValueAtTime(.25,[1,0,0,1]); cp(first,"Box color").keys[0].ease=[{speed:4,influence:81}]; cp(first,"Text color").expression="[0,1,0,1]";
  const doc=f.source.property("ADBE Text Properties").property("ADBE Text Document").value; doc.text="BO BO more"; f.source.property("ADBE Text Properties").property("ADBE Text Document").setValue(doc); assert.equal(f.run(args()).error.code,"TRACK_CONFLICT"); f.run(args({action:"update"})); assert.equal(f.rig(),c); assert.equal(f.words().length,3); assert.equal(cp(c,"Duration (frames)").numKeys,1); assert.equal(cp(c,"Travel (%)").expression,"value+1"); assert.equal(cp(f.words()[0],"Box color").numKeys,1); assert.deepEqual(cp(f.words()[0],"Box color").keyInTemporalEase(1).map(e => ({speed:e.speed,influence:e.influence})),[{speed:4,influence:81}]); assert.equal(cp(f.words()[0],"Text color").expression,"[0,1,0,1]"); assert.equal(cp(f.words()[1],"Override box color").value,0);
});
test("failed conversion or property creation rolls back temporary vectors and source visibility",async () => {
  for (const setup of [f => {f.comp.ambiguous=true;},f => {f.comp.failProperty="ADBE Vector Graphic - Fill";}]) {const f=await fixture(); setup(f); assert.throws(() => f.run(args())); assert.deepEqual(f.comp.list,[f.source]); assert.equal(f.source.enabled,true); assert.equal(f.source.comment,"User notes");}
});
test("failed update leaves old geometry, controller and original visibility intact",async () => {
  const f=await fixture(); f.run(args()); const before=f.comp.list.slice(),c=f.rig(); f.comp.ambiguous=true; assert.throws(() => f.run(args({action:"update"}))); assert.deepEqual(f.comp.list,before); assert.equal(f.rig(),c); assert.equal(f.source.enabled,false);
});
test("remove refuses external children and restores native backups after a partial failure",async () => {
  const f=await fixture(); f.run(args()); const extra=f.comp.layers.addShape(); extra.parent=f.words()[0]; extra.selected=false; assert.equal(f.run(args({action:"remove"})).error.code,"TRACK_CONFLICT"); extra.parent=null; f.comp.failRemoveId=f.words()[0].id; assert.throws(() => f.run(args({action:"remove"}))); assert.equal(f.read().rigVersion,2); assert.equal(f.source.enabled,false); f.run(args({action:"remove"})); assert.equal(f.source.enabled,true); assert.equal(f.comp.numLayers,2); assert.ok(f.comp.list.includes(extra));
});
test("Bake samples actual layer range, clears only managed expressions, and Update returns to live paths",async () => {
  const f=await fixture("O"); f.run(args()); const c=f.rig(),w=f.words()[0],path=w.property("ADBE Root Vectors Group").property(1).property("ADBE Vectors Group").property(1).property("ADBE Vector Shape"); cp(c,"Progress (%)").expression="value"; const r=f.run(args({action:"bake"})); assert.ok(r.data.samples>0); assert.equal(path.expression,""); assert.equal(path.keyTime(1),w.inPoint); assert.ok(path.keyTime(path.numKeys)<w.outPoint); assert.equal(f.read().baked,true); f.comp.time=1; assert.equal(f.read().baked,true); assert.equal(cp(c,"Progress (%)").expression,"value"); f.run(args({action:"update"})); assert.equal(f.rig(),c); assert.equal(f.read().baked,false);
});
test("legacy rigs remain readable and migrate only through explicit Update",async () => {
  const f=await fixture(); f.run(args({renderer:"legacy"})); assert.equal(f.read().rigVersion,1); assert.equal(f.read().renderer,"legacy"); assert.equal(f.run(args()).error.code,"TRACK_CONFLICT"); f.run(args({action:"update"})); assert.equal(f.read().rigVersion,2); assert.equal(f.comp.numLayers,4); f.run(args({action:"remove"})); assert.deepEqual(f.comp.list,[f.source]);
});
test("legacy migration inherits evaluated null values, keyframes, ease and expressions",async () => {
  const f=await fixture(); f.run(args({renderer:"legacy",paddingX:27,roundness:19})); const old=f.comp.list.find(l => f.scope.MotionWordRevealLegacy.meta(l)?.role === "controller");
  cp(old,"Duration (frames)").setValueAtTime(.25,32); cp(old,"Duration (frames)").keys[0].ease=[{speed:9,influence:78}]; cp(old,"Padding Y").expression="value+12"; cp(old,"Padding Y").expressionEnabled=true; cp(old,"Global color").setValueAtTime(.25,[.2,.5,.9,1]);
  f.run(args({action:"update",paddingX:2,roundness:1})); const next=f.rig(); assert.notEqual(next,old); assert.equal(cp(next,"Padding X").value,27); assert.equal(cp(next,"Roundness").value,19); assert.equal(cp(next,"Duration (frames)").numKeys,1); assert.equal(cp(next,"Duration (frames)").keyValue(1),32); assert.deepEqual(cp(next,"Duration (frames)").keyInTemporalEase(1).map(e => ({speed:e.speed,influence:e.influence})),[{speed:9,influence:78}]); assert.equal(cp(next,"Padding Y").expression,"value+12"); assert.equal(cp(next,"Padding Y").expressionEnabled,true); assert.deepEqual(cp(next,"Global color").keyValue(1),[.2,.5,.9,1]);
});
test("legacy migration refuses locked members and externally parented layers before mutating",async () => {
  for (const locked of [true,false]) {const f=await fixture(); f.run(args({renderer:"legacy"})); const old=f.comp.list.find(l => f.scope.MotionWordRevealLegacy.meta(l)?.role === "controller"); if (locked) old.locked=true; else {const extra=f.comp.layers.addShape(); extra.parent=old; extra.selected=false;} const before=f.comp.list.slice(); assert.equal(f.run(args({action:"update"})).error.code,"TRACK_CONFLICT"); assert.deepEqual(f.comp.list,before); assert.equal(f.source.enabled,false); assert.equal(f.read().rigVersion,1);}
});
test("disabled stroke getters are never accessed while fingerprinting native text",async () => {
  const f=await fixture(),p=f.source.property("ADBE Text Properties").property("ADBE Text Document"),d=p.value;
  for (const key of ["strokeColor","strokeWidth"]) Object.defineProperty(d,key,{get() {throw Error("AE cannot retrieve a disabled stroke field");}});
  Object.defineProperty(p,"value",{get() {return d;}});
  assert.equal(f.run(args()).changed,true); assert.equal(f.read().rigVersion,2);
});
test("null selection survives adjustments; a removed selected word falls back to its original",async () => {
  const f=await fixture(); f.run(args()); f.source.selected=false; f.rig().selected=true; const c=f.rig(); f.run(args({paddingX:12})); assert.deepEqual(f.comp.selectedLayers,[c]); c.selected=false; f.words()[0].selected=true; f.run(args({action:"update"})); assert.deepEqual(f.comp.selectedLayers,[f.source]);
});
test("Direction uses a native menu, and v2 exposes no ineffective Reveal point slider",async () => {
  const f=await fixture(); f.run(args()); const e=f.rig().property("ADBE Effect Parade"); assert.equal(e.property("Direction").matchName,"ADBE Dropdown Control"); assert.deepEqual(cp(f.rig(),"Direction").menuItems,["De baixo","De cima","Da esquerda","Da direita"]); assert.equal(e.property("Reveal point (%)"),undefined); assert.equal(f.read().controls.revealPoint,50);
});
test("reference, group-transform and layer-transform edits are detected before update",async () => {
  for (const edit of [w => w.property("ADBE Transform Group").property("ADBE Position").setValue([5,9]),w => w.property("ADBE Root Vectors Group").property(1).property("ADBE Vector Transform Group").property("ADBE Vector Position").setValue([5,0]),w => w.property("ADBE Root Vectors Group").property(1).property("ADBE Vectors Group").children.at(-1).property("ADBE Vector Fill Rule").setValue(2)]) {
    const f=await fixture(); f.run(args()); edit(f.words()[0]); const before=f.comp.list.slice(); assert.equal(f.run(args({action:"update"})).error.code,"TRACK_CONFLICT"); assert.deepEqual(f.comp.list,before);
  }
});
test("partial update deletion restores every old word and keeps controller controls",async () => {
  const f=await fixture(); f.run(args()); const c=f.rig(),keys=f.words().map(w => f.meta(w).key); f.comp.failRemoveId=f.words()[1].id; assert.throws(() => f.run(args({action:"update"}))); assert.equal(f.rig(),c); assert.deepEqual(f.words().map(w => f.meta(w).key),keys); assert.equal(f.read().wordCount,2); assert.equal(f.comp.numLayers,4);
});
test("Bake writes linear subframe keys in a batch and restores expressions when writing fails",async () => {
  const f=await fixture("O"); f.run(args()); const path=f.words()[0].property("ADBE Root Vectors Group").property(1).property("ADBE Vectors Group").property(1).property("ADBE Vector Shape"),before=path.expression; path.rejectOnce=true; assert.throws(() => f.run(args({action:"bake"}))); assert.equal(path.expression,before); assert.equal(path.expressionEnabled,true); assert.equal(path.numKeys,0); assert.equal(f.read().baked,false); const base=path.value; path.valueAtTime=(time,preExpression) => {if(preExpression) return base; const animated=copy(base); animated.vertices[0][0]+=time; return animated;}; const r=f.run(args({action:"bake"})); assert.ok(r.data.samples>r.data.keysWritten); assert.equal(path.batchCalls,2); assert.ok(Math.abs(path.keyTime(2)-path.keyTime(1)-f.comp.frameDuration/4)<1e-10); assert.equal(path.keyInInterpolationType(1),1);
});
test("Bake compresses only exact plateaus and retains both plateau boundary samples",async () => {
  const f=await fixture("O"); f.run(args()); const w=f.words()[0],contents=w.property("ADBE Root Vectors Group").property(1).property("ADBE Vectors Group"),path=contents.property(1).property("ADBE Vector Shape"),base=path.value,step=f.comp.frameDuration/4;
  path.valueAtTime=(time,preExpression) => {if(preExpression) return base; const sample=copy(base); if(time>=w.inPoint+step*2 && time<w.inPoint+step*4) sample.vertices[0][0]+=1; return sample;}; const r=f.run(args({action:"bake"})); assert.ok(r.data.samples>r.data.keysWritten); assert.deepEqual(path.keys.map(k => Math.round((k.time-w.inPoint)/step)),[0,1,2,3,4,330]); assert.equal(path.batchCalls,1); assert.equal(contents.property(2).property("ADBE Vector Shape").numKeys,2);
});
test("Bake evaluates every property at each instant before disabling any expression",async () => {
  const f=await fixture("O"); f.run(args()); const w=f.words()[0],contents=w.property("ADBE Root Vectors Group").property(1).property("ADBE Vectors Group"),props=[contents.property(1).property("ADBE Vector Shape"),contents.property(2).property("ADBE Vector Shape"),contents.property(3).property("ADBE Vector Fill Color"),w.property("ADBE Transform Group").property("ADBE Opacity")],base=props.map(p => p.value),seen=[];
  props.forEach((p,index) => {p.valueAtTime=(time,preExpression) => {if(preExpression) return base[index]; assert.ok(props.every(prop => prop.expression && prop.numKeys===0)); seen.push({index,time}); if(index<2) {const sample=copy(base[index]);sample.vertices[0][0]+=time+index*10;return sample;} return index===2?[time,.5,.8,1]:time*20;};});
  const r=f.run(args({action:"bake"})); assert.equal(seen.length,r.data.samples); for(let i=0;i<seen.length;i+=props.length) {assert.deepEqual(seen.slice(i,i+props.length).map(sample => sample.index),[0,1,2,3]);assert.ok(seen.slice(i,i+props.length).every(sample => sample.time===seen[i].time));} assert.equal(props[0].keyValue(1).vertices[0][0],base[0].vertices[0][0]+w.inPoint); assert.equal(props[1].keyValue(1).vertices[0][0],base[1].vertices[0][0]+w.inPoint+10); assert.equal(props[2].keyValue(1)[0],w.inPoint); assert.equal(props[3].keyValue(1),w.inPoint*20);
});
test("Bake refuses native expression fallback errors before changing any property",async () => {
  const f=await fixture("O"); f.run(args()); const contents=f.words()[0].property("ADBE Root Vectors Group").property(1).property("ADBE Vectors Group"),first=contents.property(1).property("ADBE Vector Shape"),failing=contents.property(2).property("ADBE Vector Shape"),before=first.expression,base=failing.value;
  failing.valueAtTime=(time,preExpression) => {if(!preExpression) failing.expressionError="native fallback: invalid controller expression";return base;}; assert.throws(() => f.run(args({action:"bake"})),/Morph expression rejected/); assert.equal(first.expression,before); assert.equal(first.expressionEnabled,true); assert.equal(first.numKeys,0); assert.equal(failing.numKeys,0); assert.equal(f.read().baked,false);
});
test("Bake rejects excessive total keys before changing any managed property",async () => {
  const f=await fixture(Array(20).fill("Box").join(" ")); f.source.outPoint=100; f.run(args()); const before=f.words()[0].property("ADBE Root Vectors Group").property(1).property("ADBE Vectors Group").property(1).property("ADBE Vector Shape").expression; assert.equal(f.run(args({action:"bake"})).error.code,"INVALID_SELECTION_TYPE"); assert.equal(f.words()[0].property("ADBE Root Vectors Group").property(1).property("ADBE Vectors Group").property(1).property("ADBE Vector Shape").expression,before);
});
test("manual progress follows the complete staggered timeline and respects reverse order",async () => {
  const f=await fixture(); f.run(args({automatic:false,progress:50}));
  const evaluate = w => {
    const script=w.property("ADBE Root Vectors Group").property(1).property("ADBE Vectors Group").property(1).property("ADBE Vector Shape").expression.split("var targetPath=")[0];
    const parent={effect:name => () => cp(f.rig(),name).value};
    return new Function("parent","thisComp","time",script+"return {u,q,g};")(parent,{frameDuration:f.comp.frameDuration},f.comp.time);
  };
  const [first,last]=f.words(); assert.ok(Math.abs(evaluate(first).u-14/24)<1e-10); assert.ok(Math.abs(evaluate(last).u-10/24)<1e-10); assert.ok(evaluate(first).q>evaluate(last).q); cp(f.rig(),"Reverse word order").setValue(1); assert.ok(evaluate(first).q<evaluate(last).q); cp(f.rig(),"Progress (%)").setValue(100); assert.equal(evaluate(first).q,1); assert.equal(evaluate(last).q,1);
});

test("shared extraction maps AE character indices across spaces, manual lines and surrogate pairs",async () => {
  const f=await fixture("A B\rCé😀D"),created=[],original=f.source.property("ADBE Text Properties").property("ADBE Text Document").value;
  const result=f.scope.MotionTextGlyphOutlines.extract(f.comp,f.source,created);
  assert.deepEqual(result.glyphs.map(g => [g.character,g.sourceIndex,g.textIndex]),[["A",0,1],["B",2,3],["C",4,4],["é",5,5],["😀",6,6],["D",8,7]]);
  assert.equal(result.vertexCount,24);assert.deepEqual(result.glyphs[2].center,[15,59]);
  assert.deepEqual(created,[]);assert.deepEqual(f.comp.list,[f.source]);assert.deepEqual(f.comp.selectedLayers,[f.source]);assert.equal(f.comp.time,.25);assert.equal(f.source.enabled,true);
  assert.deepEqual(f.source.property("ADBE Text Properties").property("ADBE Text Document").value,original);
  const lines=await fixture("A\r\nB\nC"),mapped=lines.scope.MotionTextGlyphOutlines.extract(lines.comp,lines.source,[]);
  assert.deepEqual(mapped.glyphs.map(g => [g.sourceIndex,g.textIndex]),[[0,1],[3,2],[5,3]]);
});

test("shared extraction removes text animators only from its temporary duplicate and preserves source animation",async () => {
  const f=await fixture("O"),animators=f.source.property("ADBE Text Properties").property("ADBE Text Animators"),animator=animators.addProperty("ADBE Text Animator"),position=f.source.property("ADBE Transform Group").property("ADBE Position");
  animator.name="User animator";position.setValueAtTime(.1,[30,80]);position.expression="value+[4,5]";position.expressionEnabled=true;
  const snapshot={keys:copy(position.keys),expression:position.expression,enabled:position.expressionEnabled},convert=f.comp.convert;
  f.comp.convert=function () {const temp=this.selectedLayers[0];assert.notEqual(temp,f.source);assert.equal(temp.property("ADBE Text Properties").property("ADBE Text Animators").numProperties,0);assert.equal(temp.property("ADBE Transform Group").property("ADBE Position").numKeys,0);assert.equal(temp.property("ADBE Transform Group").property("ADBE Position").expression,"");convert.call(this);};
  const result=f.scope.MotionTextGlyphOutlines.extract(f.comp,f.source,[]);
  assert.equal(result.glyphs[0].contours.length,2);assert.equal(animators.numProperties,1);assert.equal(animators.property(1),animator);
  assert.deepEqual({keys:position.keys,expression:position.expression,enabled:position.expressionEnabled},snapshot);
});

test("shared extraction rejoins Position only on the duplicate and preserves animated source followers",async () => {
  const f=await fixture("O"),transform=f.source.property("ADBE Transform Group"),position=transform.property("ADBE Position"),x=transform.addProperty("ADBE Position_0"),y=transform.addProperty("ADBE Position_1"),convert=f.comp.convert;
  position.setValueAtTime(.1,[30,80]);position.dimensionsSeparated=true;
  x.setValueAtTime(.1,30);x.setValueAtTime(.5,50);x.expression="value+10";x.expressionEnabled=true;
  y.setValueAtTime(.2,80);y.setValueAtTime(.7,120);y.expression="value-5";y.expressionEnabled=true;
  const xKeys=copy(x.keys),yKeys=copy(y.keys),leaderKeys=copy(position.keys);
  f.comp.convert=function () {const temporary=this.selectedLayers[0],p=temporary.property("ADBE Transform Group").property("ADBE Position");assert.notEqual(temporary,f.source);assert.equal(p.dimensionsSeparated,false);assert.equal(p.numKeys,0);assert.deepEqual(p.value,[0,0]);convert.call(this);};
  const result=f.scope.MotionTextGlyphOutlines.extract(f.comp,f.source,[]);
  assert.equal(result.glyphs.length,1);assert.equal(position.dimensionsSeparated,true);assert.deepEqual(position.keys,leaderKeys);assert.deepEqual(x.keys,xKeys);assert.deepEqual(y.keys,yKeys);assert.equal(x.expression,"value+10");assert.equal(y.expression,"value-5");assert.equal(x.expressionEnabled,true);assert.equal(y.expressionEnabled,true);assert.deepEqual(f.comp.list,[f.source]);
});

test("shared extraction flattens nested native group transforms without changing Bézier handles or counters",async () => {
  const f=await fixture("O"),convert=f.comp.convert;
  f.comp.convert=function () {
    convert.call(this);const vector=this.list.find(l => l.kind==="shape"),group=vector.property("ADBE Root Vectors Group").property(1),contents=group.property("ADBE Vectors Group"),transform=group.property("ADBE Vector Transform Group");
    transform.property("ADBE Vector Position").setValue([40,84]);transform.property("ADBE Vector Scale").setValue([200,50]);transform.property("ADBE Vector Rotation").setValue(90);
    const nested=contents.addProperty("ADBE Vector Group"),nestedContents=nested.property("ADBE Vectors Group"),paths=contents.children.filter(p => p.matchName==="ADBE Vector Shape - Group");
    nested.property("ADBE Vector Transform Group").property("ADBE Vector Position").setValue([5,10]);
    for(const path of paths) {contents.children.splice(contents.children.indexOf(path),1);nestedContents.children.push(path);}
    const p=paths[0].property("ADBE Vector Shape"),value=p.value;value.inTangents[0]=[1,2];value.outTangents[0]=[3,4];p.setValue(value);
  };
  const result=f.scope.MotionTextGlyphOutlines.extract(f.comp,f.source,[]),outer=result.glyphs[0].contours[0];
  const near=(a,b) => a.every((v,i) => Math.abs(v-b[i])<1e-10);
  assert.ok(near(outer.vertices[0],[60,94]));assert.ok(near(outer.inTangents[0],[-1,2]));assert.ok(near(outer.outTangents[0],[-2,6]));
  assert.equal(outer.closed,true);assert.equal(result.glyphs[0].contours.length,2);assert.ok(near(result.glyphs[0].center,[47.5,124]));assert.equal(result.vertexCount,8);
});

test("shared extraction cleans partial native conversion and ambiguous mappings while preserving unrelated layers",async () => {
  for(const partial of [false,true]) {
    const f=await fixture("BO"),external=f.comp.layers.addShape(),created=[external];external.selected=false;
    if(partial) {const convert=f.comp.convert;f.comp.convert=function () {convert.call(this);this.time=1.9;throw Error("native conversion interrupted");};} else f.comp.ambiguous=true;
    assert.throws(() => f.scope.MotionTextGlyphOutlines.extract(f.comp,f.source,created),partial?/native conversion interrupted/:/Ambiguous native glyph mapping/);
    assert.deepEqual(created,[external]);assert.equal(f.comp.numLayers,2);assert.ok(f.comp.list.includes(external));assert.ok(f.comp.list.includes(f.source));assert.equal(f.source.enabled,true);assert.equal(f.comp.time,.25);assert.deepEqual(f.comp.selectedLayers,[f.source]);
  }
});

test("shared extraction rejects malformed surrogates and absent menus before duplicating text",async () => {
  for(const text of ["A\ud800","A\udc00"]) {const f=await fixture(text),before=f.comp.list.slice();assert.throws(() => f.scope.MotionTextGlyphOutlines.extract(f.comp,f.source,[]),/Invalid text surrogate/);assert.deepEqual(f.comp.list,before);}
  const f=await fixture();f.scope.MotionMenuCommand.resolver=() => null;assert.throws(() => f.scope.MotionTextGlyphOutlines.extract(f.comp,f.source,[]),/Text outlines command unavailable/);assert.deepEqual(f.comp.list,[f.source]);
});

test("shared extraction retains a failed cleanup target in the caller ledger for recovery",async () => {
  for(const conversionFails of [false,true]) {
    const f=await fixture("A"),created=[],convert=f.comp.convert;
    f.comp.convert=function () {convert.call(this);this.failRemoveId=this.list.find(l => l.kind==="shape").id;if(conversionFails)throw Error("native conversion failed first");};
    assert.throws(() => f.scope.MotionTextGlyphOutlines.extract(f.comp,f.source,created),error => {
      assert.equal(error.motionCode,"ROLLBACK_FAILED");assert.match(error.message,/injected layer delete failure/);
      if(conversionFails)assert.match(error.message,/original failure: Error: native conversion failed first/);
      return true;
    });
    assert.equal(created.length,1);assert.equal(created[0].kind,"shape");assert.deepEqual(f.comp.selectedLayers,[f.source]);assert.equal(f.comp.time,.25);assert.equal(f.source.enabled,true);
    created[0].remove();assert.deepEqual(f.comp.list,[f.source]);
  }
});

test("shared extraction enforces the existing total native vertex budget and cleans its temporaries",async () => {
  const f=await fixture("A"),convert=f.comp.convert,created=[];
  f.comp.convert=function () {
    convert.call(this);const group=this.list.find(l => l.kind==="shape").property("ADBE Root Vectors Group").property(1).property("ADBE Vectors Group"),path=group.property(1).property("ADBE Vector Shape"),base=path.value;
    const many={vertices:Array.from({length:4096},(_,i) => copy(base.vertices[i%4])),inTangents:Array.from({length:4096},() => [0,0]),outTangents:Array.from({length:4096},() => [0,0]),closed:true};
    path.setValue(many);for(let i=0;i<2;i++)group.addProperty("ADBE Vector Shape - Group").property("ADBE Vector Shape").setValue(many);
  };
  assert.throws(() => f.scope.MotionTextGlyphOutlines.extract(f.comp,f.source,created),/Morph geometry exceeds bounded host budget/);
  assert.deepEqual(created,[]);assert.deepEqual(f.comp.list,[f.source]);assert.deepEqual(f.comp.selectedLayers,[f.source]);assert.equal(f.source.enabled,true);
});
