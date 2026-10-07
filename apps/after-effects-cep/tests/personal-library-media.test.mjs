import test from 'node:test';
import assert from 'node:assert/strict';
import { loadHostModules } from './host-harness.mjs';

async function fixture(config={}) {
  const calls=[],settings=new Map(),records=new Map(),folders=new Map();let nextId=1;
  class Folder {
    constructor(uri){if(folders.has(uri))return folders.get(uri);this.absoluteURI=uri;this.fsName=uri;this.name=uri.split('/').at(-1);this.exists=true;this.alias=false;this.entries=[];folders.set(uri,this);}
    getFiles(){return this.entries;}
    static decode(text){return decodeURIComponent(text);}
    static selectDialog(){return config.cancel?null:root;}
  }
  const root=new Folder('/library');
  class File {
    constructor(name,data={}){this.name=name;this.absoluteURI='/library/'+name;this.fsName=this.absoluteURI;this.parent=root;this.exists=true;this.length=512;this.modified=new Date(1000);this.alias=false;this.data=data;Object.assign(this,data);records.set(name,this);root.entries.push(this);}
    open(){calls.push(['open',this.name]);return true;}
    read(){return this.data.header??'RIFX0000FaFX';}
    close(){}
  }
  new File('movimento.ffx');new File('foto.png',{isStill:true,hasVideo:true});new File('som.wav',{hasAudio:true,duration:2});new File('video.mp4',{hasVideo:true,hasAudio:true,duration:20});new File('projeto.aep');
  new File('script.jsx');new File('alias.png',{alias:true});new File('vazio.wav',{length:0});
  class FootageItem {
    constructor(file){this.id=nextId++;this.file=file;this.name=file.name;this.useProxy=false;this.proxySource=null;this.hasVideo=!!file.data.hasVideo;this.hasAudio=!!file.data.hasAudio;this.duration=file.data.duration??0;this.mainSource={isStill:!!file.data.isStill};}
    remove(){if(config.removeError)throw new Error('rollback');project.all.splice(project.all.indexOf(this),1);}
  }
  class CompItem {
    constructor(){this.id=nextId++;this.duration=8;this.time=3;this.all=[];this.layers={add:(item,duration)=>{calls.push(['add',item.name,duration]);if(config.addError)throw new Error('add');const l={id:nextId++,source:item,selected:true,remove(){comp.all.splice(comp.all.indexOf(this),1);}};this.all.forEach(l=>{l.selected=false;});this.selectedProperties.forEach(p=>{p.selected=false;});this.all.unshift(l);project.revision++;return l;}};}
    get numLayers(){return this.all.length;}
    get selectedLayers(){return this.all.filter(l=>l.selected);}
    get selectedProperties(){return this.all.flatMap(l=>allProperties(l)).filter(p=>p.selected);}
    layer(i){return this.all[i-1];}
  }
  function allProperties(parent){return (parent.children??[]).flatMap(p=>[p,...allProperties(p)]);}
  function property(parent,name,matchName,{selected=false,times=[],keys=[]}={}){
    const p={parentProperty:parent,name,matchName,propertyIndex:parent.children.length+1,children:[],valid:true,_selected:selected,times,keys:new Set(keys),get numProperties(){return this.children.length;},get numKeys(){return this.times.length;},get selectedKeys(){return [...this.keys];},keyTime(i){return this.times[i-1];},setSelectedAtKey(i,value){if(value)this.keys.add(i);else this.keys.delete(i);},get selected(){if(!this.valid)throw new Error('Object is invalid');return this._selected;},set selected(value){if(!this.valid)throw new Error('Object is invalid');this._selected=value;},property(id){return typeof id==='number'?this.children[id-1]:this.children.find(c=>c.matchName===id);}};
    parent.children.push(p);return p;
  }
  const comp=new CompItem(),original={id:nextId++,children:[],get numProperties(){return this.children.length;},property(id){return typeof id==='number'?this.children[id-1]:this.children.find(c=>c.matchName===id);},selected:true,locked:false,applyPreset(file){calls.push(['applyPreset',file.name]);}};comp.all.push(original);comp.selected=true;
  const effects=property(original,'Effects','ADBE Effect Parade'),effect=property(effects,'Slider Control','ADBE Slider Control'),selected=property(effect,'Slider','ADBE Slider Control-0001',{selected:true,times:[0,1,2],keys:[2]});
  const project={all:[comp],revision:1,activeItem:comp,get numItems(){return this.all.length;},get selection(){return this.all.filter(i=>i.selected);},item(i){return this.all[i-1];},importFile(options){calls.push(['import',options.importAs]);this.all.forEach(i=>{i.selected=false;});const item=new FootageItem(options.file);item.selected=true;this.all.push(item);this.revision++;if(config.importError)throw new Error('import');return item;}};
  const app={version:'26.5',project,settings:{haveSetting:(s,k)=>settings.has(s+k),getSetting:(s,k)=>settings.get(s+k),saveSetting:(s,k,v)=>settings.set(s+k,v)}};
  class ImportOptions {constructor(file){this.file=file;}canImportAs(type){calls.push(['probe',type]);return !config.unsupported;}}
  const scope=await loadHostModules(['src/json.jsx','src/registry.jsx','src/commands/personal-preset-library.jsx'],{app,Folder,File,CompItem,FootageItem,ImportOptions,MotionContracts:{ERROR:{INVALID_PRESET:'INVALID_PRESET',ROLLBACK_FAILED:'ROLLBACK_FAILED'}}});scope.ImportAsType={FOOTAGE:'FOOTAGE',PROJECT:'PROJECT'};
  const library=scope.MotionRegistry.get('ae.presets.personal'),apply=scope.MotionRegistry.get('ae.presets.personal-apply');
  assert.equal(library.preflight({action:'add'}),null);const catalog=library.run({action:'add'}).data;
  function args(name){const item=catalog.items.find(i=>i.name===name);assert.ok(item,name);return {itemId:item.id};}
  function send(name){const a=args(name);assert.equal(apply.preflight(a),null);return apply.run(a);}
  return {calls,records,root,app,comp,original,project,library,apply,catalog,args,send,property,allProperties,effects,effect,selected,FootageItem};
}
function preserved(f){assert.equal(f.comp.time,3);assert.deepEqual(f.comp.selectedLayers,[f.original]);assert.equal(f.comp.selectedProperties[0].selected,true);assert.deepEqual(f.project.selection,[f.comp]);}

test('library discovers actual supported kinds and excludes executable, empty and alias entries',async()=>{
  const f=await fixture();assert.deepEqual(f.catalog.items.map(i=>i.kind).sort(),['audio','image','preset','project','video']);assert.equal(f.catalog.items.length,5);assert.ok(f.catalog.items.every(i=>!('path' in i)&&!('uri' in i)));assert.deepEqual(f.calls,[]);
});
test('image insertion at CTI fills remaining comp duration and preserves all selection domains',async()=>{
  const f=await fixture();const response=f.send('foto');assert.equal(response.data.kind,'image');assert.equal(response.data.reused,false);const l=f.comp.layer(1);assert.equal(l.startTime,3);assert.equal(l.inPoint,3);assert.equal(l.outPoint,8);assert.equal(f.project.numItems,2);preserved(f);
});
test('audio keeps source duration and video is bounded by the comp, repeated media reuses footage',async()=>{
  const f=await fixture();f.send('som');assert.equal(f.comp.layer(1).outPoint,5);f.send('video');assert.equal(f.comp.layer(1).outPoint,8);const count=f.project.numItems;assert.equal(f.send('video').data.reused,true);assert.equal(f.project.numItems,count);preserved(f);
});
test('preset still applies once to selected layers and does not import a footage file',async()=>{
  const f=await fixture();assert.equal(f.send('movimento').data.appliedCount,1);assert.deepEqual(f.calls,[['open','movimento.ffx'],['applyPreset','movimento.ffx']]);preserved(f);
});
test('project import works without comp, imports as PROJECT and never opens or replaces the current project',async()=>{
  const f=await fixture();f.project.activeItem=null;const result=f.send('projeto');assert.equal(result.data.kind,'project');assert.deepEqual(f.calls,[['probe','PROJECT'],['import','PROJECT']]);assert.equal(f.app.project,f.project);assert.equal(f.project.activeItem,null);assert.equal(f.comp.numLayers,1);
});
test('media accepts no layer selection; preset and missing composition are rejected before mutation',async()=>{
  const f=await fixture();f.original.selected=false;assert.equal(f.apply.preflight(f.args('foto')),null);assert.match(f.apply.preflight(f.args('movimento')).message,/Selecione/);f.project.activeItem=null;assert.match(f.apply.preflight(f.args('foto')).message,/composição/);assert.equal(f.calls.filter(c=>c[0]==='import').length,0);
});
test('unsupported formats and out of range CTI fail before import',async()=>{
  const f=await fixture({unsupported:true});assert.match(f.apply.preflight(f.args('foto')).message,/formato/);assert.equal(f.project.numItems,1);
  const g=await fixture();g.comp.time=8;assert.match(g.apply.preflight(g.args('som')).message,/tempo/);assert.equal(g.project.numItems,1);
});
test('rescan invalidates issued tokens and removed roots reject cached items',async()=>{
  const f=await fixture(),a=f.args('foto');f.library.run({action:'list'});assert.match(f.apply.preflight(a).message,/Atualize/);
  const g=await fixture(),b=g.args('foto');g.library.run({action:'remove',rootId:g.catalog.roots[0].id});assert.match(g.apply.preflight(b).message,/Atualize/);
});
test('file alias, moved, oversized and invalid native preset are rejected',async()=>{
  for(const update of [{exists:false},{alias:true},{length:65*1024**3}]){const f=await fixture();Object.assign(f.records.get('foto.png'),update);assert.ok(f.apply.preflight(f.args('foto')));assert.equal(f.project.numItems,1);}
  const f=await fixture();f.records.get('movimento.ffx').data.header='something bad';assert.match(f.apply.preflight(f.args('movimento')).message,/nativo/);
});
test('run consumes its preflight and rejects file/context changes after staging',async()=>{
  const f=await fixture(),a=f.args('foto');assert.throws(()=>f.apply.run(a),/Atualize/);assert.equal(f.apply.preflight(a),null);f.records.get('foto.png').length++;assert.throws(()=>f.apply.run(a),/Atualize/);assert.equal(f.project.numItems,1);assert.equal(f.apply.preflight(a),null);f.project.activeItem=null;assert.throws(()=>f.apply.run(a),/Atualize/);
});
test('failed import or layer insertion restores existing project and selection without residue',async()=>{
  for(const config of [{addError:true},{importError:true}]){const f=await fixture(config);assert.throws(()=>f.send('foto'));assert.equal(f.project.numItems,1);assert.equal(f.comp.numLayers,1);preserved(f);}
});
test('rollback failure reports a distinct failure and does not claim successful import',async()=>{
  const f=await fixture({addError:true,removeError:true});assert.throws(()=>f.send('foto'),e=>e.motionCode==='ROLLBACK_FAILED');
});
test('pre-existing image sequences and proxies are never reused as a static image',async()=>{
  const f=await fixture(),sequence=new f.FootageItem(f.records.get('foto.png'));
  sequence.mainSource.isStill=false;sequence.duration=2;f.project.all.push(sequence);
  const result=f.send('foto');assert.equal(result.data.reused,false);assert.notEqual(f.comp.layer(1).source,sequence);assert.equal(f.comp.layer(1).outPoint,8);
  f.comp.layer(1).source.useProxy=true;
  assert.equal(f.send('foto').data.reused,false);
});
test('media reuse stops after project interpretation or source file changes',async()=>{
  for(const change of [f=>{f.project.revision++;},f=>{f.records.get('foto.png').modified=new Date(2000);},f=>{f.records.get('foto.png').length++;}]){
    const f=await fixture();f.send('foto');change(f);assert.equal(f.send('foto').data.reused,false);
  }
});
test('ffx restores properties and selected keys through fresh paths after indexed group invalidation',async()=>{
  const f=await fixture();let replacement;
  f.original.applyPreset=()=>{
    f.allProperties(f.original).forEach(p=>{p.valid=false;});f.original.children=[];
    const effects=f.property(f.original,'Effects','ADBE Effect Parade'),effect=f.property(effects,'Slider Control','ADBE Slider Control');
    replacement=f.property(effect,'Slider','ADBE Slider Control-0001',{times:[0,0.5,1,2],keys:[1]});
    f.property(effects,'New Slider','ADBE Slider Control');
  };
  assert.equal(f.send('movimento').changed,true);assert.equal(replacement.selected,true);assert.deepEqual([...replacement.keys],[3]);preserved(f);
});
test('ffx resolves surviving selected property if another effect moves its index',async()=>{
  const f=await fixture();let replacement;
  f.original.applyPreset=()=>{
    f.allProperties(f.original).forEach(p=>{p.valid=false;});f.original.children=[];
    const effects=f.property(f.original,'Effects','ADBE Effect Parade');f.property(effects,'New Effect','ADBE New');
    const effect=f.property(effects,'Slider Control','ADBE Slider Control');replacement=f.property(effect,'Slider','ADBE Slider Control-0001',{times:[0,1,2]});
  };
  f.send('movimento');assert.equal(replacement.selected,true);assert.deepEqual([...replacement.keys],[2]);
});
test('preset removing the formerly selected property does not turn its completed application into a failure',async()=>{
  const f=await fixture();f.original.applyPreset=()=>{f.allProperties(f.original).forEach(p=>{p.valid=false;});f.original.children=[];};
  assert.equal(f.send('movimento').changed,true);assert.deepEqual(f.comp.selectedProperties,[]);assert.equal(f.original.selected,true);
});

