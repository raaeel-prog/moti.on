/** FFX DOM double for command tests; real FFX bytes are separately exercised in AE. */
import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {loadHostModules as load} from './host-harness.mjs';
const folder=fileURLToPath(new URL('../assets/control-presets/',import.meta.url));
const catalog=JSON.parse(readFileSync(path.join(folder,'catalog.json'),'utf8'));
export class PresetFile {
  constructor(name='') {this.fsName=name;this.name=path.basename(name);this.exists=existsSync(path.join(folder,this.name));this.parent={parent:{fsName:'/mock'}};}
}
export class GroupParam {
  constructor(name,matchName,parent,value=0) {Object.assign(this,{name,matchName,parentProperty:parent,value,canVaryOverTime:true,canSetExpression:true,numKeys:0,expression:'',expressionEnabled:false,propertyType:1});}
  setValue(value){if(this.numKeys)throw new Error('setValue on animated parameter');this.value=value;}
  removeKey(){this.numKeys--;}
}
export function installPresetDouble(layer,comp) {
 if(!layer||layer.applyPreset||!layer.property)return;
 layer.containingComp=comp;
 layer.applyPreset=function(file){
  const entry=Object.values(catalog).find(e=>e.file===file.name);
  if(!entry)throw new Error('Unknown fixture preset');
  const parade=this.property('ADBE Effect Parade');
  const effect=parade.addProperty(entry.matchName);
  const params=entry.labels.map((label,i)=>new GroupParam(label,entry.matchName+'-'+String(i+1).padStart(4,'0'),effect));
  Object.defineProperty(effect,'numProperties',{get:()=>params.length,configurable:true});
  if(!effect.propertyIndex)Object.defineProperty(effect,'propertyIndex',{get:()=>{for(let i=1;i<=parade.numProperties;i++)if(parade.property(i)===effect)return i;return 0;},configurable:true});
  effect.property=(index)=>typeof index==='number'?params[index-1]??null:params.find(p=>p.matchName===index||p.name===index)??null;
  effect.params=params;effect.param=params[0];effect.parentProperty=parade;
 };
}
export async function loadHostModules(files,globals={}) {
 const needed=['src/json.jsx','src/effect-operations.jsx','src/keyframe-operations.jsx','generated/control-presets.jsx','src/grouped-controls.jsx','src/live-controls.jsx','src/live-preset.jsx'];
 const expanded=[];
 for(const file of files){
  if(file==='src/live-controls.jsx'||file==='src/quick-effects.jsx'||file==='src/commands/rig-effector.jsx'||file==='src/commands/parallax-advanced.jsx')for(const dep of needed)if(!expanded.includes(dep))expanded.push(dep);
  if(!expanded.includes(file))expanded.push(file);
 }
 const comp=globals.app?.project?.activeItem;
 if(comp){
  const layers=new Set(comp.selectedLayers??[]);
  for(const p of comp.selectedProperties??[]){let l=p;while(l.parentProperty)l=l.parentProperty;layers.add(l);}
  for(let i=1;i<=(comp.numLayers??0);i++)layers.add(comp.layer(i));
  for(const l of layers)installPresetDouble(l,comp);
  if(comp.layers?.addNull){const original=comp.layers.addNull.bind(comp.layers);comp.layers.addNull=(...a)=>{const l=original(...a);installPresetDouble(l,comp);return l;};}
 }
 return load(expanded,{File:PresetFile,...globals});
}
