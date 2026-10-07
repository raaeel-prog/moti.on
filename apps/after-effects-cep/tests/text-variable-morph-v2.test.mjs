import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {loadHostModules} from './host-harness.mjs';

const TAG='[Moti.on.proximity-morph.v2]';
const defaults={action:'apply',renderer:'auto',radius:250,strength:100,weight:35,contrast:0,italic:0,preset:'soft-weight',smoothness:75,scaleX:100,scaleY:100,skew:0,lift:0,sweepFrames:48,sweepDirection:'left-to-right'};
const errors=Object.fromEntries(['INVALID_PRESET','NO_ACTIVE_COMP','INVALID_SELECTION_TYPE','CAPABILITY_UNAVAILABLE','EXPRESSION_CONFLICT','KEYFRAME_CONFLICT','ROLLBACK_FAILED','TRACK_CONFLICT','HOST_OPERATION_FAILED'].map(k=>[k,k]));
const lerp=(a,b,u)=>Array.isArray(a)?a.map((v,i)=>lerp(v,b[i],u)):a+(b-a)*u;

async function fixture({variable=false,text='A B\rCé',failOffset=false,failKeys=false,ambiguous=false}={}){
  let nextId=1,mutations=0,keyWrites=0;
  const font={designAxesData:variable?[{name:'Weight',tag:'wght',min:100,max:900}]:[],designVector:variable?[400]:[]};
  function document(content=text){return {text:content,font:variable?'VariableFixture':'StaticFixture',fontObject:font,fontSize:100,tracking:0,horizontalScale:100,verticalScale:100,justification:1,leading:120,autoLeading:false,baselineShift:0,fauxBold:false,fauxItalic:false,allCaps:false,smallCaps:false,applyFill:true,applyStroke:false,fillColor:[1,1,1],boxText:false,get baselineLocs(){return this.text.replace(/\r\n/g,'\r').replace(/\n/g,'\r').split('\r').flatMap((line,i)=>[0,i*120,[...line].length*60,i*120]);},characterRange(){return {...this};}};}
  class Property{
    constructor(name,value,parent){Object.assign(this,{name,matchName:name,_value:value,parent,expression:'',expressionEnabled:false,expressionError:'',canSetExpression:true,keys:[]});}
    get owner(){let p=this.parent;while(p&&!p.groups)p=p.parent;return p;}
    get value(){return this.linkedLayer?this.linkedLayer.index:this.valueAtTime(this.owner.comp.time,false);}
    set value(v){this._value=v;}
    get numKeys(){return this.keys.length;}
    get propertyIndex(){return this.parent.children.indexOf(this)+1;}
    setValue(v){if(this.parent.matchName==='ADBE Layer Control'){this.linkedLayer=this.owner.comp.layer(v);}this._value=v;mutations++;}
    setValueAtTime(time,value){if(failKeys&&++keyWrites===3)throw Error('injected key failure');const old=this.keys.find(k=>k.time===time);if(old)old.value=value;else this.keys.push({time,value,interpolation:'LINEAR'});this.keys.sort((a,b)=>a.time-b.time);mutations++;}
    setValuesAtTimes(times,values){for(let i=0;i<times.length;i++)this.setValueAtTime(times[i],values[i]);}
    setInterpolationTypeAtKey(i,inType){this.keys[i-1].interpolation=inType;}
    keyInInterpolationType(i){return this.keys[i-1].interpolation;}
    keyOutInterpolationType(i){return this.keys[i-1].interpolation;}
    keyTime(i){return this.keys[i-1].time;}
    keyValue(i){return this.keys[i-1].value;}
    removeKey(i){this.keys.splice(i-1,1);mutations++;}
    valueAtTime(t,preExpression=false){
      if(this.linkedLayer)return this.linkedLayer.index;
      if(this.expression&&this.expressionEnabled&&!preExpression){return vm.runInNewContext(this.expression,this.owner.context(t));}
      if(!this.keys.length)return this._value;
      if(t<=this.keys[0].time)return this.keys[0].value;if(t>=this.keys.at(-1).time)return this.keys.at(-1).value;
      const index=this.keys.findIndex(k=>k.time>t),a=this.keys[index-1],b=this.keys[index];return lerp(a.value,b.value,(t-a.time)/(b.time-a.time));
    }
    remove(){this.parent.children.splice(this.parent.children.indexOf(this),1);mutations++;}
  }
  class Group{
    constructor(name,parent){Object.assign(this,{name,matchName:name,parent,children:[]});}
    get numProperties(){return this.children.length;}
    get propertyIndex(){return this.parent.children.indexOf(this)+1;}
    property(key){return typeof key==='number'?this.children[key-1]:this.children.find(p=>p.name===key||p.matchName===key);}
    prop(name,value){const p=new Property(name,value,this);this.children.push(p);return p;}
    group(name){const p=new Group(name,this);this.children.push(p);return p;}
    canAddProperty(name){return !(failOffset&&name==='ADBE Vector Filter - Offset');}
    addProperty(name){
      if(name==='ADBE Text Scale 3D'||name==='ADBE Text Position 3D'||name==='ADBE Text Skew'){mutations++;return this.prop(name,name==='ADBE Text Scale 3D'?[100,100,100]:name==='ADBE Text Position 3D'?[0,0,0]:0);}
      const g=this.group(name);mutations++;
      if(name==='ADBE Slider Control'||name==='ADBE Layer Control')g.prop(name+'-0001',0);
      if(name==='ADBE Text Animator'){g.group('ADBE Text Animator Properties');g.group('ADBE Text Selectors');}
      if(name==='ADBE Text Expressible Selector'){g.prop('ADBE Text Range Type2',1);g.prop('ADBE Text Expressible Amount',[100,100,100]);}
      if(name==='ADBE Text Selector'){
        for(const k of ['ADBE Text Index Start','ADBE Text Index End','ADBE Text Index Offset'])g.prop(k,0);
        const a=g.group('ADBE Text Range Advanced');for(const k of ['ADBE Text Range Units','ADBE Text Range Type2','ADBE Text Range Shape','ADBE Text Selector Smoothness','ADBE Text Selector Max Amount','ADBE Text Levels Max Ease','ADBE Text Levels Min Ease','ADBE Text Randomize Order'])a.prop(k,0);
      }
      if(name==='ADBE Vector Group'){g.group('ADBE Vectors Group');const t=g.group('ADBE Vector Transform Group');t.prop('ADBE Vector Anchor',[0,0]);t.prop('ADBE Vector Position',[0,0]);t.prop('ADBE Vector Scale',[100,100]);t.prop('ADBE Vector Rotation',0);t.prop('ADBE Vector Skew',0);t.prop('ADBE Vector Skew Axis',0);t.prop('ADBE Vector Group Opacity',100);}
      if(name==='ADBE Vector Shape - Group')g.prop('ADBE Vector Shape',{vertices:[],inTangents:[],outTangents:[],closed:true});
      if(name==='ADBE Vector Filter - Merge')g.prop('ADBE Vector Merge Type',1);
      if(name==='ADBE Vector Filter - Offset'){g.prop('ADBE Vector Offset Amount',0);g.prop('ADBE Vector Offset Line Join',1);g.prop('ADBE Vector Offset Miter Limit',4);}
      if(name==='ADBE Vector Graphic - Fill'){g.prop('ADBE Vector Fill Color',[1,1,1]);g.prop('ADBE Vector Fill Opacity',100);}
      return g;
    }
    addVariableFontAxis(tag){const existing=this.children.filter(p=>p.matchName.startsWith('ADBE Text VF Axis ')).length;const p=this.prop('ADBE Text VF Axis '+(existing+1),font.designVector[font.designAxesData.findIndex(a=>a.tag===tag)]);mutations++;return p;}
    remove(){this.parent.children.splice(this.parent.children.indexOf(this),1);mutations++;}
  }
  class Layer{
    constructor(comp,kind='text'){
      Object.assign(this,{comp,containingComp:comp,id:nextId++,name:'Editable original',comment:'User notes',kind,selected:kind==='text',enabled:true,locked:false,parent:null,inPoint:0,outPoint:2,threeDLayer:false,motionBlur:false,blendingMode:1,matrix:[1,0,0,1],groups:[],matchName:kind==='shape'?'ADBE Vector Layer':'ADBE Text Layer'});
      this.groups.push(new Group('ADBE Effect Parade',this),new Group('ADBE Transform Group',this),new Group('ADBE Mask Parade',this));
      const t=this.property('ADBE Transform Group');t.prop('ADBE Position',[20,40]);t.prop('ADBE Anchor Point',[0,0]);t.prop('ADBE Scale',[100,100]);t.prop('ADBE Rotate Z',0);t.prop('ADBE Opacity',100);
      if(kind==='text'){const g=new Group('ADBE Text Properties',this);g.prop('ADBE Text Document',document());g.group('ADBE Text Animators');this.groups.push(g);}
      if(kind==='shape')this.groups.push(new Group('ADBE Root Vectors Group',this));
    }
    get index(){return this.comp.items.indexOf(this)+1;}
    get numProperties(){return this.groups.length;}
    property(name){return typeof name==='number'?this.groups[name-1]:this.groups.find(g=>g.matchName===name);}
    duplicate(){const l=new Layer(this.comp);l.property('ADBE Text Properties').property('ADBE Text Document').value=document(this.property('ADBE Text Properties').property('ADBE Text Document').value.text);this.comp.items.unshift(l);mutations++;return l;}
    sourceRectAtTime(){return {left:0,top:-80,width:180,height:200};}
    sourcePointToComp(p){return this.toComp(p,this.comp.time);}
    toComp([x,y],t){const tr=this.property('ADBE Transform Group'),a=tr.property('ADBE Anchor Point').valueAtTime(t,true),pos=tr.property('ADBE Position').valueAtTime(t,false),m=this.matrix;const p=[m[0]*(x-a[0])+m[2]*(y-a[1])+pos[0],m[1]*(x-a[0])+m[3]*(y-a[1])+pos[1]];return this.parent?this.parent.toComp(p,t):p;}
    fromComp(point,t){const q=this.parent?this.parent.fromComp(point,t):point,tr=this.property('ADBE Transform Group'),a=tr.property('ADBE Anchor Point').valueAtTime(t,true),pos=tr.property('ADBE Position').valueAtTime(t,false),m=this.matrix,det=m[0]*m[3]-m[1]*m[2],x=q[0]-pos[0],y=q[1]-pos[1];return [(m[3]*x-m[2]*y)/det+a[0],(-m[1]*x+m[0]*y)/det+a[1]];}
    context(t){const layer=this;return {thisLayer:this.proxy(t),thisComp:{layer:index=>this.comp.layer(index).proxy(t),frameDuration:this.comp.frameDuration},effect:name=>layer.proxy(t).effect(name),text:this.proxy(t).text,textIndex:1,time:t};}
    proxy(t){const layer=this;return {anchorPoint:this.property('ADBE Transform Group').property('ADBE Anchor Point').valueAtTime(t,true),toComp:p=>layer.toComp(p,t),fromComp:p=>layer.fromComp(p,t),text:{sourceText:{toString:()=>layer.property('ADBE Text Properties')?.property('ADBE Text Document').value.text}},transform:{get opacity(){return layer.property('ADBE Transform Group').property('ADBE Opacity').valueAtTime(t,false);}},effect:name=>()=>{const e=layer.property('ADBE Effect Parade').property(name),p=e.property(1);return e.matchName==='ADBE Layer Control'?p.linkedLayer.proxy(t):p.valueAtTime(t,false);}};}
    remove(){this.comp.items.splice(this.comp.items.indexOf(this),1);mutations++;}
  }
  class CompItem{
    constructor(){this.items=[];this.time=.25;this.frameDuration=1/24;this.workAreaStart=0;this.workAreaDuration=2;this.layers={addNull:()=>this.add('null'),addShape:()=>this.add('shape')};}
    add(kind){const l=new Layer(this,kind);this.items.unshift(l);mutations++;return l;}
    get numLayers(){return this.items.length;}
    get selectedLayers(){return this.items.filter(l=>l.selected);}
    layer(i){return this.items[i-1];}
  }
  class Shape{}
  const comp=new CompItem(),layer=comp.add('text'),doc=()=>layer.property('ADBE Text Properties').property('ADBE Text Document');
  const extract=()=>{
    if(ambiguous)throw Error('Ambiguous native glyph mapping');const glyphs=[];let index=0,sourceIndex=0,x=0,y=-40;for(const character of doc().value.text){if(character==='\r'||character==='\n'){x=0;y+=120;sourceIndex+=character.length;continue;}index++;if(!/\s/.test(character)){const vertices=[[x,-40+y+40],[x+50,-40+y+40],[x+50,y+40],[x,y+40]],contours=[{vertices,inTangents:vertices.map(()=>[0,0]),outTangents:vertices.map(()=>[0,0]),closed:true}],bounds={left:x,top:y-40,width:50,height:80};glyphs.push({character,sourceIndex,textIndex:index,contours,bounds,center:[x+25,y]});}x+=60;sourceIndex+=character.length;}return {glyphs,vertexCount:glyphs.length*4};
  };
  const scope=await loadHostModules(['src/json.jsx','src/registry.jsx','src/commands/text-variable-morph.jsx'],{app:{version:'26.5',project:{activeItem:comp}},CompItem,Shape,KeyframeInterpolationType:{LINEAR:'LINEAR'},MotionContracts:{ERROR:errors},MotionTextGlyphOutlines:{extract,bounds:()=>layer.sourceRectAtTime()}});
  scope.MotionTextGlyphOutlines={extract,bounds:()=>layer.sourceRectAtTime()};
  const handler=scope.MotionRegistry.get('ae.text.variable-morph'),reader=scope.MotionRegistry.get('ae.text.variable-morph.read');
  const meta=()=>JSON.parse(decodeURIComponent(layer.comment.split(TAG)[1]));
  const byId=id=>comp.items.find(l=>l.id===id),controller=()=>byId(meta().controllerId),result=()=>byId(meta().resultId);
  const select=l=>{for(const item of comp.items)item.selected=false;l.selected=true;};
  const run=(a={},options={})=>{const input={...defaults,...a};assert.equal(handler.preflight(input),null);return handler.run(input,{},options);};
  return {scope,comp,layer,doc,handler,reader,meta,controller,result,run,select,font,get mutations(){return mutations;}};
}

test('outline default keeps source editable, uses native compound Offset paths and respects initial selection option',async()=>{
  const f=await fixture(),doc=f.doc().value;f.run({}, {preserveSelection:false});assert.equal(f.comp.numLayers,3);assert.equal(f.layer.enabled,false);assert.strictEqual(f.doc().value,doc);assert.deepEqual(f.comp.selectedLayers,[f.controller()]);assert.equal(f.meta().renderer,'outline');assert.deepEqual(f.meta().glyphs.map(g=>g.textIndex),[1,3,4,5]);
  const root=f.result().property('ADBE Root Vectors Group');assert.equal(root.numProperties,4);assert.deepEqual(root.property(1).property('ADBE Vectors Group').children.map(p=>p.matchName),['ADBE Vector Shape - Group','ADBE Vector Filter - Merge','ADBE Vector Filter - Offset','ADBE Vector Graphic - Fill']);assert.equal(f.result().parent,f.layer);
});

test('signed outline weight follows smooth proximity and glyph rest centers',async()=>{
  const f=await fixture({text:'A'});f.run({weight:-100,radius:100,smoothness:100});f.controller().property('ADBE Transform Group').property('ADBE Position').setValue([45,0]);
  const offset=f.result().property('ADBE Root Vectors Group').property(1).property('ADBE Vectors Group').property('Moti.on Offset').property('ADBE Vector Offset Amount');assert.equal(offset.value,-1);f.controller().property('ADBE Transform Group').property('ADBE Position').setValue([95,0]);assert.equal(offset.value,-.5);f.controller().property('ADBE Transform Group').property('ADBE Position').setValue([145,0]);assert.ok(offset.value===0);
});

test('read shows controls and stale typography; Update reuses null and preserves animated controls',async()=>{
  const f=await fixture();f.run();const c=f.controller(),id=c.id,weight=c.property('ADBE Effect Parade').property(f.meta().controls.weight).property(1);weight.setValueAtTime(0,20);weight.setValueAtTime(1,80);f.select(c);f.doc().value.fontSize=120;
  const read=f.reader.run({}).data;assert.equal(read.stale,true);assert.deepEqual(read.lockedControls,['weight']);assert.equal(f.handler.preflight(defaults).code,'TRACK_CONFLICT');const keys=structuredClone(weight.keys);f.run({action:'update'});assert.equal(f.controller().id,id);assert.deepEqual(weight.keys,keys);assert.equal(f.comp.numLayers,3);assert.equal(f.reader.run({}).data.stale,false);assert.deepEqual(f.comp.selectedLayers,[c]);
});

test('repeated Apply adjusts existing rig, protects animated values, and Remove keeps unrelated controller content',async()=>{
  const f=await fixture();f.run();const c=f.controller(),r=f.result();f.run({radius:120});assert.equal(f.controller(),c);assert.equal(f.result(),r);const radius=c.property('ADBE Effect Parade').property(f.meta().controls.radius).property(1);radius.setValueAtTime(0,120);assert.equal(f.handler.preflight({...defaults,radius:200}).code,'KEYFRAME_CONFLICT');c.property('ADBE Effect Parade').addProperty('User effect');f.select(c);f.run({action:'remove'});assert.equal(f.comp.numLayers,2);assert.equal(f.layer.enabled,true);assert.equal(f.layer.comment,'User notes');assert.deepEqual(f.comp.selectedLayers,[c]);assert.equal(c.property('ADBE Effect Parade').numProperties,1);
});

test('auto native VF applies signed axes and Update uses fresh animator generation without changing old controls',async()=>{
  const f=await fixture({variable:true});f.run({weight:-100});assert.equal(f.meta().renderer,'variable');assert.equal(f.comp.numLayers,2);assert.equal(f.layer.enabled,true);const first=f.meta().animators[0].name;const axis=f.layer.property('ADBE Text Properties').property('ADBE Text Animators').property(first).property('ADBE Text Animator Properties').property('ADBE Text VF Axis 1');assert.equal(axis.value,100);
  f.doc().value.text='New';f.run({action:'update'});assert.notEqual(f.meta().animators[0].name,first);assert.equal(f.layer.property('ADBE Text Properties').property('ADBE Text Animators').numProperties,1);assert.equal(f.meta().glyphCount,3);f.run({action:'remove'});assert.equal(f.comp.numLayers,1);
});

test('sweep writes two positional keys across mapped text and refuses to replace motion',async()=>{
  const f=await fixture();f.run();const before=f.comp.time;f.run({action:'sweep',sweepFrames:24,sweepDirection:'right-to-left'});const pos=f.controller().property('ADBE Transform Group').property('ADBE Position');assert.equal(pos.numKeys,2);assert.ok(pos.keyValue(1)[0]>pos.keyValue(2)[0]);assert.equal(f.comp.time,before);assert.equal(f.handler.preflight({...defaults,action:'sweep'}).code,'KEYFRAME_CONFLICT');
});

test('outline Bake materializes managed expressions only and Update restores a live rig',async()=>{
  const f=await fixture({text:'A'});f.run();f.run({action:'sweep',sweepFrames:24});f.run({action:'bake'});assert.equal(f.meta().baked,true);const offset=f.result().property('ADBE Root Vectors Group').property(1).property('ADBE Vectors Group').property('Moti.on Offset').property('ADBE Vector Offset Amount');assert.equal(offset.expression,'');assert.ok(offset.numKeys>1);const c=f.controller(),keys=structuredClone(c.property('ADBE Transform Group').property('ADBE Position').keys);f.run({action:'update'});assert.equal(f.meta().baked,false);assert.equal(f.controller(),c);assert.deepEqual(c.property('ADBE Transform Group').property('ADBE Position').keys,keys);
});

test('native Bake creates disjoint indexed ranges, native axis keys, and preserves source typography',async()=>{
  const f=await fixture({variable:true,text:'A B\rC'}),doc=f.doc().value;f.run();f.run({action:'sweep',sweepFrames:24});f.run({action:'bake'});assert.equal(f.meta().baked,true);assert.strictEqual(f.doc().value,doc);const animators=f.layer.property('ADBE Text Properties').property('ADBE Text Animators');assert.equal(animators.numProperties,3);
  for(let i=0;i<3;i++){const a=animators.property(i+1),sel=a.property('ADBE Text Selectors').property(1);assert.equal(sel.matchName,'ADBE Text Selector');assert.equal(sel.property('ADBE Text Index Start').value,[0,2,3][i]);assert.equal(sel.property('ADBE Text Index End').value,[1,3,4][i]);const axis=a.property('ADBE Text Animator Properties').property('ADBE Text VF Axis 1');assert.equal(axis.expression,'');assert.ok(axis.numKeys>1);}f.run({action:'update'});assert.equal(animators.numProperties,1);assert.equal(f.meta().baked,false);
});

test('v2 preflight enforces source/parent 2D, 128 characters including spaces, and work-area budget without mutation',async()=>{
  const f=await fixture();let start=f.mutations;f.layer.threeDLayer=true;assert.equal(f.handler.preflight(defaults).code,'INVALID_SELECTION_TYPE');f.layer.threeDLayer=false;f.doc().value.text='A'+' '.repeat(128);assert.equal(f.handler.preflight(defaults).code,'INVALID_SELECTION_TYPE');assert.equal(f.mutations,start);
  f.doc().value.text='A';f.run();f.layer.outPoint=5000;f.comp.workAreaDuration=2;assert.equal(f.handler.preflight({...defaults,action:'bake'}),null);f.comp.workAreaDuration=5000;start=f.mutations;assert.equal(f.handler.preflight({...defaults,action:'bake'}).code,'INVALID_PRESET');assert.equal(f.mutations,start);
});

test('geometry ownership prevents custom edits from being removed',async()=>{
  const f=await fixture();f.run();const shape=f.result().property('ADBE Root Vectors Group').property(1).property('ADBE Vectors Group').property(1).property('ADBE Vector Shape');shape.value.vertices[0][0]+=1;assert.equal(f.handler.preflight({...defaults,action:'remove'}).code,'TRACK_CONFLICT');
});

test('outline failure and ambiguous mapping roll back without deleting original text or notes',async()=>{
  for(const option of [{failOffset:true},{ambiguous:true}]){const f=await fixture(option),doc=f.doc().value;assert.throws(()=>f.run(),/Offset Paths|Ambiguous/);assert.equal(f.comp.numLayers,1);assert.equal(f.layer.comment,'User notes');assert.equal(f.layer.enabled,true);assert.strictEqual(f.doc().value,doc);assert.deepEqual(f.comp.selectedLayers,[f.layer]);}
});

test('partial Bake write rolls back expressions, geometry metadata and controller motion',async()=>{
  const f=await fixture({failKeys:true,text:'A'});f.run();const comment=f.layer.comment;assert.throws(()=>f.run({action:'bake'}),/injected key failure/);assert.equal(f.layer.comment,comment);const offset=f.result().property('ADBE Root Vectors Group').property(1).property('ADBE Vectors Group').property('Moti.on Offset').property('ADBE Vector Offset Amount');assert.ok(offset.expression.startsWith('// Moti.on proximity morph v2'));assert.equal(offset.expressionEnabled,true);assert.equal(offset.numKeys,0);
});

test('shared proximity kernel reaches exact endpoints and blends linear/smooth falloff deterministically',async()=>{
  const f=await fixture(),fn=f.scope.MotionProximityMorph.influence;assert.equal(fn(0,100,100,75),1);assert.equal(fn(100,100,100,75),0);assert.equal(fn(50,100,100,75),.5);assert.equal(fn(25,100,100,0),.75);assert.equal(fn(25,100,100,100),.84375);assert.equal(fn(0,100,50,75),.5);
});

test('Update restores old native animator and link after a partial destructive commit',async()=>{
  const f=await fixture({variable:true,text:'A'});f.run();const old=f.meta(),c=f.controller(),animators=f.layer.property('ADBE Text Properties').property('ADBE Text Animators'),link=f.layer.property('ADBE Effect Parade').property(old.link),remove=link.remove.bind(link);let first=true;link.remove=()=>{remove();if(first){first=false;throw Error('injected old link removal');}};
  assert.throws(()=>f.run({action:'update'}),/injected old link removal/);assert.equal(animators.numProperties,1);assert.equal(animators.property(1).name,old.animators[0].name);assert.equal(f.controller(),c);assert.equal(f.reader.run({}).data.rigVersion,2);assert.equal(f.reader.run({}).data.baked,false);assert.equal(f.comp.numLayers,2);
});

test('native Bake restores the contextual animator if commit removes it before failing',async()=>{
  const f=await fixture({variable:true,text:'A'});f.run();const old=f.meta(),a=f.layer.property('ADBE Text Properties').property('ADBE Text Animators').property(old.animators[0].name),remove=a.remove.bind(a);a.remove=()=>{remove();throw Error('injected old animator removal');};
  assert.throws(()=>f.run({action:'bake'}),/injected old animator removal/);assert.equal(f.meta().baked,false);assert.equal(f.layer.property('ADBE Text Properties').property('ADBE Text Animators').numProperties,1);assert.equal(f.reader.run({}).data.baked,false);
});

test('Remove restores managed outline and ownership when controller deletion fails',async()=>{
  const f=await fixture({text:'A'});f.run();const c=f.controller();f.select(f.result());c.remove=()=>{throw Error('injected controller removal');};assert.throws(()=>f.run({action:'remove'}),/injected controller removal/);assert.equal(f.comp.numLayers,3);assert.equal(f.layer.enabled,false);assert.equal(f.controller(),c);assert.equal(f.reader.run({}).data.rigVersion,2);assert.equal(f.result().parent,f.layer);assert.deepEqual(f.comp.selectedLayers,[f.result()]);
});

test('native commit comment failure preserves all source and controller ownership',async()=>{
  const f=await fixture({variable:true,text:'A'});f.run();let comment=f.layer.comment,first=true;Object.defineProperty(f.layer,'comment',{configurable:true,get:()=>comment,set:value=>{if(first){first=false;throw Error('injected source comment');}comment=value;}});assert.throws(()=>f.run({action:'bake'}),/injected source comment/);assert.equal(f.meta().baked,false);assert.equal(f.reader.run({}).data.rigVersion,2);assert.equal(f.layer.property('ADBE Text Properties').property('ADBE Text Animators').numProperties,1);
});

test('native layout changes from managed lift do not invalidate source fingerprint or presets',async()=>{
  const f=await fixture({variable:true,text:'A'});f.scope.LineOrientation={HORIZONTAL:1,VERTICAL_RIGHT_TO_LEFT:2};f.doc().value.lineOrientation=1;f.run({lift:-15});Object.defineProperty(f.doc().value,'baselineLocs',{get:()=>[0,0,60,-15]});assert.equal(f.reader.run({}).data.stale,false);f.run({lift:0,scaleX:115,scaleY:90});f.doc().value.lineOrientation=2;assert.equal(f.reader.run({}).data.stale,true);assert.equal(f.handler.preflight(defaults).code,'INVALID_SELECTION_TYPE');assert.equal(f.handler.preflight({...defaults,action:'bake'}).code,'TRACK_CONFLICT');
});

test('disjoint bake work area fails in preflight without throwing or changing the rig',async()=>{
  const f=await fixture({text:'A'});f.run();f.comp.workAreaStart=3;const before=f.mutations;assert.equal(f.handler.preflight({...defaults,action:'bake'}).code,'INVALID_SELECTION_TYPE');assert.equal(f.mutations,before);
});

test('Bake verifies interpolation between quarter frames and refines nonlinear motion',async()=>{
  const f=await fixture({text:'A'});f.run({radius:60,scaleX:170,skew:25,lift:-20});f.run({action:'sweep',sweepFrames:3});const offset=f.result().property('ADBE Root Vectors Group').property(1).property('ADBE Vectors Group').property('Moti.on Offset').property('ADBE Vector Offset Amount'),times=Array.from({length:17},(_,i)=>.25+i*f.comp.frameDuration/8),before=times.map(t=>offset.valueAtTime(t,false)),reads=new Map(),sample=offset.valueAtTime.bind(offset);offset.valueAtTime=(time,pre)=>{if(!pre&&offset.expression)reads.set(time,(reads.get(time)||0)+1);return sample(time,pre);};f.run({action:'bake'});for(let i=0;i<times.length;i++)assert.ok(Math.abs(offset.valueAtTime(times[i],false)-before[i])<=.025);assert.ok(offset.numKeys>6);assert.equal(offset.expression,'');assert.equal(Math.max(...reads.values()),1);
});

test('Sweep converts comp endpoints into a parented controller space and protects 3D hierarchy',async()=>{
  const f=await fixture({text:'A'});f.run({radius:100});const c=f.controller(),parent=f.comp.add('null');parent.matrix=[0,2,-3,0];parent.property('ADBE Transform Group').property('ADBE Position').setValue([500,200]);c.parent=parent;f.run({action:'sweep',sweepFrames:24});assert.deepEqual(c.toComp([0,0],.25),[-55,0]);assert.deepEqual(c.toComp([0,0],1.25),[145,0]);parent.threeDLayer=true;assert.equal(f.handler.preflight(defaults).code,'INVALID_SELECTION_TYPE');
});

test('Remove retains externally referenced controller and cleans only its owned sliders',async()=>{
  for(const mode of ['layer-control','name-expression','index-expression']){const f=await fixture({text:'A'});f.run();const c=f.controller(),other=f.comp.add('null');if(mode==='layer-control'){const link=other.property('ADBE Effect Parade').addProperty('ADBE Layer Control');link.property(1).setValue(c.index);}else other.property('ADBE Transform Group').property('ADBE Position').expression=`thisComp.layer(${mode==='name-expression'?JSON.stringify(c.name):c.index}).toComp([0,0]);`;const outcome=f.run({action:'remove'});assert.equal(outcome.data.controllerRetained,true);assert.ok(f.comp.items.includes(c));assert.equal(c.property('ADBE Effect Parade').numProperties,0);assert.equal(f.layer.enabled,true);assert.equal(c.comment,'User notes');}
});

test('Remove restores all owned sliders if retained controller cleanup fails halfway',async()=>{
  const f=await fixture({text:'A'});f.run();const c=f.controller(),other=f.comp.add('null'),link=other.property('ADBE Effect Parade').addProperty('ADBE Layer Control');link.property(1).setValue(c.index);const effect=c.property('ADBE Effect Parade').property(f.meta().controls.skew),remove=effect.remove.bind(effect);effect.remove=()=>{remove();throw Error('injected control cleanup');};assert.throws(()=>f.run({action:'remove'}),/injected control cleanup/);assert.equal(c.property('ADBE Effect Parade').numProperties,10);assert.equal(f.reader.run({}).data.rigVersion,2);assert.equal(f.layer.enabled,false);
});
