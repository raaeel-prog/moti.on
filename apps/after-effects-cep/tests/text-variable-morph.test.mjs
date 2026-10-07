import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {loadHostModules} from './host-harness.mjs';

const TAG='[Moti.on.variable-morph.v1]';
const defaults={action:'apply',radius:250,strength:100,weight:100,contrast:0,italic:0};
const errors=Object.fromEntries(['INVALID_PRESET','NO_ACTIVE_COMP','INVALID_SELECTION_TYPE','CAPABILITY_UNAVAILABLE','EXPRESSION_CONFLICT','KEYFRAME_CONFLICT','ROLLBACK_FAILED'].map(k=>[k,k]));

async function fixture({extraAxes=false,failAxis=false,measureFails=false}={}) {
  let nextId=1,mutations=0;
  const font={postScriptName:'ProportionalVariable',designAxesData:[{name:'Weight',tag:'wght',min:100,max:900,default:400}],designVector:[400]};
  if(extraAxes){font.designAxesData.push({name:'Contrast',tag:'CNTR',min:0,max:100,default:20},{name:'Slant',tag:'slnt',min:-15,max:0,default:0});font.designVector.push(20,0);}
  function document(text='WiM') {
    return {text,font:'ProportionalVariable',fontObject:font,fontSize:100,tracking:0,horizontalScale:1,verticalScale:1,justification:1,boxText:false,
      get baselineLocs(){return measureFails?null:[0,0,[...this.text].reduce((sum,c)=>sum+({W:90,i:20,M:80}[c]??50),0),0];},
      characterRange(){return {font:this.font,fontSize:this.fontSize,tracking:this.tracking};}};
  }
  class Property {
    constructor(name,value,parent){Object.assign(this,{name,matchName:name,value,parent,expression:'',expressionEnabled:false,numKeys:0});}
    setValue(v){this.value=v;mutations++;}
    valueAtTime(){
      if(this.expression)return vm.runInNewContext(this.expression,{thisComp:{layer:index=>{const l=comp.layer(index);return {toComp:point=>l.sourcePointToComp(point)};}}});
      return this.value;
    }
    remove(){this.parent.children.splice(this.parent.children.indexOf(this),1);mutations++;}
  }
  class Group {
    constructor(name,parent){Object.assign(this,{name,matchName:name,parent,children:[]});}
    get numProperties(){return this.children.length;}
    property(key){return typeof key==='number'?this.children[key-1]:this.children.find(p=>p.name===key||p.matchName===key);}
    addProperty(name){
      const p=new Group(name,this);this.children.push(p);mutations++;
      if(name==='ADBE Slider Control'||name==='ADBE Layer Control')p.children.push(new Property(name+'-0001',0,p));
      if(name==='ADBE Text Animator')p.children.push(new Group('ADBE Text Animator Properties',p),new Group('ADBE Text Selectors',p));
      if(name==='ADBE Text Expressible Selector')p.children.push(new Property('ADBE Text Range Type2',1,p),new Property('ADBE Text Expressible Amount',[100,100,100],p));
      return p;
    }
    addVariableFontAxis(tag){
      if(failAxis)throw new Error('native axis failure');
      const p=new Property('ADBE Text VF Axis '+(this.children.length+1),font.designVector[font.designAxesData.findIndex(a=>a.tag===tag)],this);
      p.tag=tag;this.children.push(p);mutations++;return p;
    }
    remove(){this.parent.children.splice(this.parent.children.indexOf(this),1);mutations++;}
  }
  class Layer {
    constructor(comp,isText=true){
      Object.assign(this,{id:nextId++,name:'Editable original',comment:'User comment',containingComp:comp,selected:isText,locked:false,enabled:true,parent:null});
      this.groups=[new Group('ADBE Effect Parade',this),new Group('ADBE Transform Group',this)];
      this.groups[1].children.push(new Property('ADBE Position',[20,40],this.groups[1]));
      if(isText){const g=new Group('ADBE Text Properties',this);g.children.push(new Property('ADBE Text Document',document(),g),new Group('ADBE Text Animators',g));this.groups.push(g);}
    }
    get index(){return this.containingComp.items.indexOf(this)+1;}
    property(name){return this.groups.find(g=>g.matchName===name);}
    duplicate(){const l=new Layer(this.containingComp);l.property('ADBE Text Properties').property('ADBE Text Document').value=document(this.property('ADBE Text Properties').property('ADBE Text Document').value.text);this.containingComp.items.unshift(l);mutations++;return l;}
    sourceRectAtTime(){return {left:0,top:-80,width:190,height:80};}
    sourcePointToComp([x,y]){return [x*2+20,y*2+40];}
    remove(){this.containingComp.items.splice(this.containingComp.items.indexOf(this),1);mutations++;}
  }
  class CompItem {
    constructor(){this.items=[];this.width=640;this.height=360;this.time=.7;this.layers={addNull:()=>{const l=new Layer(this,false);this.items.unshift(l);mutations++;return l;}};}
    get numLayers(){return this.items.length;}
    get selectedLayers(){return this.items.filter(l=>l.selected);}
    layer(i){return this.items[i-1];}
  }
  const comp=new CompItem(),layer=new Layer(comp);comp.items.push(layer);
  const app={version:'26.5x89',project:{activeItem:comp}};
  const scope=await loadHostModules(['src/json.jsx','src/registry.jsx','src/commands/text-variable-morph.jsx'],{app,CompItem,MotionContracts:{ERROR:errors}});
  const handler=scope.MotionRegistry.get('ae.text.variable-morph');
  const meta=()=>JSON.parse(decodeURIComponent(layer.comment.split(TAG)[1]));
  const source=()=>layer.property('ADBE Text Properties').property('ADBE Text Document');
  const controller=()=>comp.items.find(l=>l!==layer);
  const amount=()=>layer.property('ADBE Text Properties').property('ADBE Text Animators').property(meta().animator).property('ADBE Text Selectors').property(meta().selector).property('ADBE Text Expressible Amount');
  const apply=(args={})=>{const input={...defaults,...args};assert.equal(handler.preflight(input),null);return handler.run(input);};
  return {app,comp,layer,handler,meta,source,controller,amount,apply,font,get mutations(){return mutations;}};
}

test('native axes preserve source text, transforms and timing while selecting the new controller at the transformed text center',async()=>{
  const f=await fixture(),source=f.source().value,position=f.layer.property('ADBE Transform Group').property('ADBE Position').value;
  const result=f.apply();assert.equal(result.changed,true);assert.equal(f.comp.numLayers,2);
  assert.strictEqual(f.source().value,source);assert.strictEqual(f.layer.property('ADBE Transform Group').property('ADBE Position').value,position);
  assert.equal(f.comp.time,.7);assert.deepEqual(f.comp.selectedLayers,[f.controller()]);
  assert.deepEqual(f.controller().property('ADBE Transform Group').property('ADBE Position').value,[210,-40]);
  assert.deepEqual(f.meta().points,[[45,-40],[100,-40],[150,-40]],'native proportional advances, not equally spaced letters');
  assert.deepEqual(f.meta().axes.map(a=>a.tag),['wght']);assert.ok(f.layer.comment.startsWith('User comment\n'));
});

function expressionContext(f,{index=1,controlPoint=[45,-40],scale=1,offset=[0,0]}={}){
  const c=f.controller(),m=f.meta();
  return {text:{sourceText:{toString:()=>f.source().value.text}},textIndex:index,
    toComp:([x,y])=>[x*scale+offset[0],y*scale+offset[1]],
    effect:()=>()=>({anchorPoint:[0,0],toComp:()=>controlPoint,effect:name=>()=>c.property('ADBE Effect Parade').property(name).property(1).value}),
    controls:m.controls};
}

test('proximity expression reaches exact maximum, falls smoothly and returns zero outside radius',async()=>{
  const f=await fixture();f.apply({radius:100});const expression=f.amount().expression;
  assert.equal(vm.runInNewContext(expression,expressionContext(f))[0],100);
  assert.equal(vm.runInNewContext(expression,expressionContext(f,{controlPoint:[95,-40]}))[0],50);
  assert.equal(vm.runInNewContext(expression,expressionContext(f,{controlPoint:[145,-40]}))[0],0);
  assert.equal(vm.runInNewContext(expression,expressionContext(f,{controlPoint:[1000,1000]}))[0],0);
  assert.equal(vm.runInNewContext(expression,expressionContext(f,{controlPoint:[390,120],scale:2,offset:[300,200]}))[0],100,'layer transforms evaluated in comp space');
});

test('native weight, custom contrast and negative slant map to actual font axis ranges',async()=>{
  const f=await fixture({extraAxes:true});f.apply({weight:50,contrast:100,italic:100});
  const values=f.meta().axes.map(axis=>vm.runInNewContext(axis.expression,expressionContext(f)));
  assert.deepEqual(values,[650,100,-15]);
});

test('repeat Apply reuses the rig and controller despite renaming, updates controls, and remeasures text',async()=>{
  const f=await fixture();f.apply();const id=f.controller().id;f.controller().name='My spatial control';
  f.source().value.text='MiW';f.apply({radius:80,strength:50});
  assert.equal(f.comp.numLayers,2);assert.equal(f.controller().id,id);
  assert.deepEqual(f.comp.selectedLayers,[f.controller()]);
  assert.deepEqual(f.meta().points,[[40,-40],[90,-40],[145,-40]]);
  assert.equal(f.layer.property('ADBE Text Properties').property('ADBE Text Animators').numProperties,1);
});

test('source edits disable stale position mapping until Apply remeasures it',async()=>{
  const f=await fixture();f.apply();f.source().value.text='Changed';
  assert.equal(vm.runInNewContext(f.amount().expression,expressionContext(f))[0],0);
});

test('remove deletes only owned rig and restores original comment and source',async()=>{
  const f=await fixture(),source=f.source().value;f.apply();f.apply({action:'remove'});
  assert.equal(f.comp.numLayers,1);assert.equal(f.layer.comment,'User comment');assert.strictEqual(f.source().value,source);
  assert.equal(f.layer.property('ADBE Text Properties').property('ADBE Text Animators').numProperties,0);
  assert.equal(f.layer.property('ADBE Effect Parade').numProperties,0);
});

test('remove keeps a controller containing unrelated user effects or parented content',async()=>{
  const f=await fixture();f.apply();f.controller().property('ADBE Effect Parade').addProperty('User effect');
  const result=f.apply({action:'remove'});assert.equal(result.data.controllerRetained,true);assert.equal(f.comp.numLayers,2);
  assert.ok(f.controller().property('ADBE Effect Parade').property('User effect'));assert.ok(!f.controller().comment.includes(TAG));
});

test('preflight rejects absent axes, fixed fonts, animated text and malformed controls without mutation',async()=>{
  const f=await fixture(),start=f.mutations;
  assert.equal(f.handler.preflight({...defaults,italic:100}).code,'CAPABILITY_UNAVAILABLE');
  assert.equal(f.handler.preflight({...defaults,radius:0}).code,'INVALID_PRESET');
  assert.equal(f.handler.preflight({...defaults,weight:0}).code,'INVALID_PRESET');
  f.source().numKeys=2;assert.equal(f.handler.preflight(defaults).code,'INVALID_SELECTION_TYPE');f.source().numKeys=0;
  f.app.version='25.6';assert.equal(f.handler.preflight(defaults).code,'CAPABILITY_UNAVAILABLE');f.app.version='26.5';
  f.layer.enabled=false;assert.equal(f.handler.preflight(defaults).code,'INVALID_SELECTION_TYPE');f.layer.enabled=true;
  f.font.designAxesData=[];assert.equal(f.handler.preflight(defaults).code,'CAPABILITY_UNAVAILABLE');
  assert.equal(f.mutations,start);
});

test('manual selector changes and keyed controls are protected',async()=>{
  const f=await fixture();f.apply();const original=f.amount().expression;
  f.amount().expression='user expression';assert.equal(f.handler.preflight(defaults).code,'EXPRESSION_CONFLICT');
  f.amount().expression=original;f.controller().property('ADBE Effect Parade').property(f.meta().controls.radius).property(1).numKeys=1;
  assert.equal(f.handler.preflight(defaults).code,'KEYFRAME_CONFLICT');
});

test('native creation failure rolls back animator, link and null without touching text or selection',async()=>{
  const f=await fixture({failAxis:true}),source=f.source().value;
  assert.throws(()=>f.apply(),/native axis failure/);
  assert.equal(f.comp.numLayers,1);assert.strictEqual(f.source().value,source);assert.equal(f.layer.comment,'User comment');
  assert.equal(f.layer.property('ADBE Text Properties').property('ADBE Text Animators').numProperties,0);
  assert.equal(f.layer.property('ADBE Effect Parade').numProperties,0);assert.deepEqual(f.comp.selectedLayers,[f.layer]);
});

test('AE dormant animator properties do not block reuse; modified unowned properties do',async()=>{
  const f=await fixture();f.apply();
  const ap=f.layer.property('ADBE Text Properties').property('ADBE Text Animators').property(f.meta().animator).property('ADBE Text Animator Properties');
  const dormant={name:'Position',matchName:'ADBE Text Position 3D',value:[0,0,0],isModified:false,numKeys:0,expression:''};
  ap.children.unshift(dormant);
  assert.equal(f.handler.preflight({...defaults}),null);
  f.apply({radius:180});assert.equal(f.comp.numLayers,2);
  dormant.isModified=true;
  assert.equal(f.handler.preflight({...defaults}).code,'EXPRESSION_CONFLICT');
});

