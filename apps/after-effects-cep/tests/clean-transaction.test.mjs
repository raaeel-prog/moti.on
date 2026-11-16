import test from 'node:test';
import assert from 'node:assert/strict';
import {loadHostModules} from './host-harness.mjs';

async function fixture(failAt){
 const items=[],root={id:0},other={id:8};let nativeRemoves=0;
 class FootageItem {
  constructor(id,parent){this.id=id;this.name='Owned '+id;this.usedIn=[];this.comment='[MOTION_META_V1]{"schemaVersion":1,"rigId":"qa-clean","rigType":"ae.asset.texture"}[/MOTION_META_V1]';this.folder=parent;}
  get parentFolder(){return this.folder;}
  set parentFolder(folder){if(failAt==='move'&&this.id===2&&folder.name==='Moti.on Clean transaction')throw Error('native move failed');this.folder=folder;}
  remove(){items.splice(items.indexOf(this),1);}
 }
 const first=new FootageItem(1,root),second=new FootageItem(2,other);items.push(first,second);
 const project={get numItems(){return items.length;},item:i=>items[i-1],items:{addFolder(name){const folder={id:99,name,get numItems(){return items.filter(x=>x.parentFolder===folder).length;},remove(){nativeRemoves++;if(failAt==='commit'&&nativeRemoves===1)throw Error('native delete failed');for(let i=items.length-1;i>=0;i--)if(items[i].parentFolder===folder)items.splice(i,1);items.splice(items.indexOf(folder),1);}};items.push(folder);return folder;}}};
 const scope=await loadHostModules(['generated/motion-contracts.jsx','src/json.jsx','src/registry.jsx','src/commands/clean.jsx'],{app:{project},FootageItem});
 const command=scope.MotionRegistry.get('ae.project.clean');command.preflight({removeConfirmed:false});const scan=command.run({removeConfirmed:false});
 const args={removeConfirmed:true,selectedItemIds:[1,2],scanToken:scan.data.scanToken};assert.equal(command.preflight(args),null);
 return {command,args,items,first,second,root,other,nativeRemoves:()=>nativeRemoves};
}
for(const failAt of ['move','commit'])test(`Clean restores every source and parent folder after ${failAt} failure`,async()=>{
 const f=await fixture(failAt);assert.throws(()=>f.command.run(f.args));assert.deepEqual(f.items.map(x=>x.id),[1,2]);assert.equal(f.first.parentFolder,f.root);assert.equal(f.second.parentFolder,f.other);
});
test('Clean commits all selected sources with one native removal',async()=>{
 const f=await fixture();const result=f.command.run(f.args);assert.equal(result.changed,true);assert.deepEqual(result.data.removedItemIds,[1,2]);assert.equal(f.nativeRemoves(),1);assert.deepEqual(f.items,[]);
});
