import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {URL} from 'node:url';
import vm from 'node:vm';
import test from 'node:test';

const source=readFileSync(new URL('../runtime.jsx',import.meta.url),'utf8');
const manifest=JSON.parse(readFileSync(new URL('../manifest.json',import.meta.url),'utf8'));
function fixture({missing=false,unavailable='',failure=''}={}) {
  let next=10;const items=[];const comps=[];
  class Property {
    constructor(matchName,value=0,owner=null){this.matchName=matchName;this.name=matchName;this._value=value;this.owner=owner;this.expression='';this.expressionEnabled=false;this.canSetExpression=true;this.keys=[];this.selectedKeys=[];this.selected=false;}
    get value(){return this.target?this.target.index:this._value;}set value(v){this._value=v;}
    get numKeys(){return this.keys.length;}
    setValue(value){this.value=value;if(this.matchName==='ADBE Layer Control-0001')this.target=this.owner.containingComp.layer(value);}
    setValueAtTime(time,value){const key=this.keys.find(k=>Math.abs(k.time-time)<1e-8);if(key)key.value=value;else this.keys.push({time,value});this.keys.sort((a,b)=>a.time-b.time);}
    keyTime(i){return this.keys[i-1].time;}keyValue(i){return this.keys[i-1].value;}
    removeKey(i){this.keys.splice(i-1,1);if(this.owner?.remap===this&&!this.keys.length){this.owner._timeRemapEnabled=false;this.canSetExpression=false;}}
    setSelectedAtKey(i,yes){this.selectedKeys=this.selectedKeys.filter(x=>x!==i);if(yes)this.selectedKeys.push(i);}
    setInterpolationTypeAtKey(){}
    valueAtTime(time,pre){if(this.expression&&this.expressionEnabled&&!pre)return evaluate(this,time);if(!this.keys.length)return this.value;let before=this.keys[0],after=this.keys.at(-1);for(const key of this.keys){if(key.time<=time+1e-8)before=key;if(key.time>=time-1e-8){after=key;break;}}if(before===after||typeof before.value!=='number')return before.value;const t=(time-before.time)/(after.time-before.time);return before.value+(after.value-before.value)*t;}
  }
  class Group {
    constructor(owner,name=''){this.owner=owner;this.name=name;this.matchName=name;this.children=[];}
    get numProperties(){return this.children.length;}
    property(key){return typeof key==='number'?this.children[key-1]:this.children.find(p=>p.matchName===key||p.name===key);}
    canAddProperty(key){return key!==unavailable;}
    addProperty(key){if(key===failure)throw Error('injected '+key);const group=new Group(this.owner,key);for(let i=1;i<=8;i++)group.children.push(new Property(`${key}-${String(i).padStart(4,'0')}`,0,this.owner));this.children.push(group);return group;}
  }
  function item(name,duration=2.4){const value={id:next++,name,duration,frameDuration:1/30,width:960,height:540,comment:'',mainSource:{},get usedIn(){return comps.filter(c=>items.includes(c)&&c.all.some(l=>l.source===value));},remove(){items.splice(items.indexOf(value),1);}};items.push(value);return value;}
  class Layer {
    constructor(comp,source,name){this.containingComp=comp;this.source=source;this.id=next++;this.name=name||source.name;this.comment='';this.selected=false;this.locked=false;this.enabled=true;this.hasVideo=true;this.parent=null;this.startTime=0;this.inPoint=0;this.outPoint=comp.duration;this.effects=new Group(this,'ADBE Effect Parade');this.transform=new Group(this,'ADBE Transform Group');for(const [name,value]of [['ADBE Opacity',100],['ADBE Scale',[100,100]],['ADBE Position',[480,270]],['ADBE Anchor Point',[480,270]],['ADBE Rotate Z',0]])this.transform.children.push(new Property(name,value,this));this.marker=new Property('ADBE Marker',0,this);this.remap=new Property('ADBE Time Remapping',0,this);this.remap.canSetExpression=false;this._timeRemapEnabled=false;this.selectedProperties=[];}
    get index(){return this.containingComp.all.indexOf(this)+1;}
    get numProperties(){return 4;}
    property(key){if(typeof key==='number')return [this.effects,this.transform,this.marker,this.remap][key-1];return {'ADBE Effect Parade':this.effects,'ADBE Transform Group':this.transform,'ADBE Marker':this.marker,'ADBE Time Remapping':this.remap}[key];}
    get timeRemapEnabled(){return this._timeRemapEnabled;}set timeRemapEnabled(value){this._timeRemapEnabled=value;this.remap.canSetExpression=value;if(value&&!this.remap.numKeys){this.remap.setValueAtTime(this.startTime,0);this.remap.setValueAtTime(this.startTime+this.source.duration,this.source.duration);}}
    copyToComp(comp){if(failure==='copy')throw Error('injected copy failure');const clone=comp.layers.add(this.source);for(const key of ['startTime','inPoint','outPoint','parent','threeDLayer'])clone[key]=this[key];for(const p of this.transform.children){const dest=clone.transform.property(p.matchName);dest.value=p.value;dest.keys=JSON.parse(JSON.stringify(p.keys));}return clone;}
    moveToBeginning(){const a=this.containingComp.all;a.splice(a.indexOf(this),1);a.unshift(this);}
    moveAfter(target){const a=this.containingComp.all;a.splice(a.indexOf(this),1);a.splice(a.indexOf(target)+1,0,this);}
    remove(){const a=this.containingComp.all;a.splice(a.indexOf(this),1);}
  }
  class Comp {
    constructor(name='Test edit',w=960,h=540,pa=1,duration=2.4,fps=30){this.id=next++;this.name=name;this.width=w;this.height=h;this.pixelAspect=pa;this.duration=duration;this.frameRate=fps;this.frameDuration=1/fps;this.time=1.2;this.all=[];this.comment='';this.layers={add:source=>{const layer=new Layer(this,source);this.all.unshift(layer);return layer;},addNull:()=>{const l=this.layers.add(item('Null',duration));l.nullLayer=true;return l;}};comps.push(this);items.push(this);}
    get numLayers(){return this.all.length;}get selectedLayers(){return this.all.filter(l=>l.selected);}layer(i){return this.all[i-1];}
    get usedIn(){return comps.filter(c=>items.includes(c)&&c.all.some(l=>l.source===this));}remove(){items.splice(items.indexOf(this),1);this.all=[];}
  }
  function evaluate(property,time){function view(layer){return {marker:{key(name){const k=layer.marker.keys.find(k=>k.value.comment===name);if(!k)throw Error('missing CUT');return {time:k.time};}},effect(index){const e=layer.effects.property(index);return child=>{const p=e.property(child);return e.matchName==='ADBE Layer Control'?view(p.target):p.value;};}};}const l=view(property.owner),c=property.owner.containingComp;return vm.runInNewContext(property.expression,{thisLayer:l,effect:l.effect,thisComp:{frameDuration:c.frameDuration,width:c.width,height:c.height},time,Math});}
  const comp=new Comp();const a=comp.layers.add(item('A'));a.outPoint=1.2;const b=comp.layers.add(item('B'));b.inPoint=1.2;a.selected=b.selected=true;
  const key=a.transform.property('ADBE Position');key.setValueAtTime(.2,[470,270]);key.setValueAtTime(.9,[480,270]);key.selectedKeys=[1];key.selected=true;a.selectedProperties=[key];
  const app={effects:['ADBE Slider Control','ADBE Layer Control','ADBE Exposure2','ADBE Invert','ADBE Tint','ADBE Gaussian Blur 2','ADBE Noise'].filter(k=>k!==unavailable).map(matchName=>({matchName})),project:{activeItem:comp,items:{addComp:(...args)=>new Comp(...args)},get numItems(){return items.length;},item:i=>items[i-1],importFile(options){const imported=item('Original scan',1);imported.file=options.file;return imported;}},beginUndoGroup(){throw Error('caller owns Undo');},endUndoGroup(){throw Error('caller owns Undo');}};
  class File{constructor(path){this.fsName=path.replaceAll('\\','/');this.exists=!missing;}}
  class Folder{constructor(path){this.fsName=path.replaceAll('\\','/');this.exists=true;}}
  const ctx=vm.createContext({app,File,Folder,ImportOptions:function(file){this.file=file;},MarkerValue:function(comment){this.comment=comment;},BlendingMode:{NORMAL:1},AlphaMode:{STRAIGHT:1},KeyframeInterpolationType:{LINEAR:1},Math,Date,Error,isFinite});ctx.$={global:ctx};vm.runInContext(`(function(){${source}\n}());`,ctx);ctx.EmulsionV2.configure(manifest,'C:/Emulsion/materials');return {api:ctx.EmulsionV2,comp,a,b,key,items,app,evaluate};
}
const args=(extra={})=>({presetId:manifest.profiles[0].id,durationFrames:12,intensity:100,...extra});
test('actual v2 manifest has three executable original film profiles',()=>{assert.equal(manifest.profiles.length,3);const f=fixture();assert.equal(f.api.preflight(f.comp,args()),null);});
for(const [name,extra]of [['zero duration',{durationFrames:0}],['fractional frames',{durationFrames:7.5}],['oversized duration',{durationFrames:121}],['infinite intensity',{intensity:Infinity}],['unknown profile',{presetId:'film-no-such'}],['invalid seed',{seed:-1}]])test(`rejects ${name} before mutation`,()=>{const f=fixture();assert.ok(f.api.preflight(f.comp,args(extra)));assert.equal(f.comp.numLayers,2);});
for(const [name,change]of [['parenting',f=>{f.a.parent=f.b;}],['3D',f=>{f.a.threeDLayer=true;}],['locked clip',f=>{f.a.locked=true;}],['adjustment',f=>{f.a.adjustmentLayer=true;}],['source expressions',f=>{f.key.expression='time';f.key.expressionEnabled=true;}]])test(`rejects unsupported ${name}`,()=>{const f=fixture();change(f);assert.ok(f.api.preflight(f.comp,args()));assert.equal(f.comp.numLayers,2);});
test('Apply copies only the two source clips and preserves originals, keys, selection and time',()=>{const f=fixture();const before=JSON.stringify(f.key.keys);const r=f.api.apply(f.comp,args());assert.equal(r.created,true);assert.equal(f.a.parent,null);assert.equal(f.a.outPoint,1.2);assert.equal(f.b.inPoint,1.2);assert.equal(f.key.keys.length,2);assert.equal(JSON.stringify(f.key.keys),before);assert.deepEqual(f.key.selectedKeys,[1]);assert.ok(f.a.selected&&f.b.selected);assert.equal(f.comp.time,1.2);assert.equal(f.a.effects.numProperties,0);const planes=f.items.filter(x=>String(x.comment).startsWith('EMULSION_V2_PLANE'));assert.equal(planes.length,2);for(const plane of planes)assert.equal(plane.numLayers,1);assert.equal(f.api.inspect(r.layer).state,'ready');});
test('source-aware native expressions use real source wrappers, negative and macro anchors',()=>{const f=fixture();const r=f.api.apply(f.comp,args());const plane=f.comp.all.find(l=>l.comment.includes('role=A'));const p=manifest.profiles[0].segments;for(const s of p){const time=1.2-.2+((s.from+s.to)/2)*.4;const scale=f.evaluate(plane.transform.property('ADBE Scale'),time);if(s.source==='A')assert.ok(scale[0]>=100);const remap=plane.remap;assert.equal(remap.numKeys,1);assert.equal(plane.timeRemapEnabled,true);assert.ok(f.evaluate(remap,time)>=0);}assert.equal(f.api.owns(r.layer),true);});
test('repeat Apply at cut updates controls without duplicate source copies',()=>{const f=fixture();const a=f.api.apply(f.comp,args());const count=f.items.length;const b=f.api.apply(f.comp,args({intensity:70}));assert.equal(b.created,false);assert.equal(a.layer.id,b.layer.id);assert.equal(f.items.length,count);assert.equal(f.api.inspect(a.layer).options.intensity,70);});
test('targeted Adjust rejects stale fingerprint and preserves original clips',()=>{const f=fixture();const r=f.api.apply(f.comp,args());const state=f.api.inspect(r.layer);const input={target:state.target,presetId:state.presetId,options:{durationFrames:10,intensity:80}};assert.equal(f.api.adjustPreflight(input),null);f.api.adjust(input);assert.equal(f.api.adjustPreflight(input).code,'STALE_TARGET');assert.equal(f.a.outPoint,1.2);});
test('missing material and native effects fail before creating layers',()=>{const f=fixture({missing:true});assert.equal(f.api.preflight(f.comp,args()).code,'ASSET_NOT_FOUND');const g=fixture({unavailable:'ADBE Tint'});assert.equal(g.api.preflight(g.comp,args()).code,'CAPABILITY_UNAVAILABLE');assert.equal(f.comp.numLayers,2);});
test('partial source-copy failure removes only created plane items',()=>{const f=fixture({failure:'copy'});const before=f.items.length;assert.throws(()=>f.api.apply(f.comp,args()),/copy/);assert.equal(f.items.length,before);assert.equal(f.comp.numLayers,2);});
test('partial native effect failure rolls back managed layers and all source planes',()=>{const f=fixture({failure:'ADBE Noise'});const before=f.items.length;assert.throws(()=>f.api.apply(f.comp,args()),/Noise/);assert.equal(f.items.length,before);assert.equal(f.comp.numLayers,2);assert.ok(f.a.selected&&f.b.selected);});
test('ownership follows native IDs and remains valid after rename',()=>{const f=fixture();const r=f.api.apply(f.comp,args());r.layer.name='My film';assert.equal(f.api.owns(r.layer),true);r.layer.id+=1000;assert.equal(f.api.owns(r.layer),false);});
test('Remove deletes managed event, preserves original source clips and keys',()=>{const f=fixture();const r=f.api.apply(f.comp,args());f.a.selected=f.b.selected=false;r.layer.selected=true;const removed=f.api.remove(f.comp);assert.equal(removed.removed,1);assert.equal(f.comp.numLayers,2);assert.equal(f.key.keys.length,2);});
test('Bake retains native Time Remap base key and preserves rendered exposure sample',()=>{const f=fixture();const r=f.api.apply(f.comp,args());const plane=f.comp.all.find(l=>l.comment.includes('role=A'));const exposure=plane.effects.property(2).property('ADBE Exposure2-0003');const expected=f.evaluate(exposure,1.1);f.a.selected=f.b.selected=false;r.layer.selected=true;const result=f.api.bake(f.comp);assert.equal(result.baked,1);assert.equal(plane.timeRemapEnabled,true);assert.ok(plane.remap.numKeys>1);assert.equal(exposure.expression,'');assert.ok(Math.abs(exposure.valueAtTime(1.1)-expected)<1e-7);assert.equal(f.api.owns(r.layer),false);});
test('raw runtime parses as ES3 and exports from nested native activation scope',()=>{const require=createRequire(import.meta.url);require('acorn').parse(source,{ecmaVersion:3});const f=fixture();assert.equal(typeof f.api.apply,'function');});

