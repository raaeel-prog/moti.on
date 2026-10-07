import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
const built=await build({entryPoints:[fileURLToPath(new URL('../client/src/preset-variants.ts',import.meta.url))],bundle:true,platform:'node',format:'esm',write:false});
const {createPresetVariants,PRESET_VARIANTS_STORAGE_KEY}=await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);
const recipe='studio-letter-silk-rise';
const options={phase:'both',direction:'bottom',durationFrames:40,intensity:135,staggerFrames:2,unit:'words',elasticity:35,overlap:70,speed:100};
function storage(initial=null){let value=initial;return {getItem:key=>{assert.equal(key,PRESET_VARIANTS_STORAGE_KEY);return value;},setItem(key,next){assert.equal(key,PRESET_VARIANTS_STORAGE_KEY);value=next;},raw:()=>value};}

test('named recipe persists across controllers and remains detached from caller objects',()=>{
  const disk=storage(),first=createPresetVariants(disk),draft={...options};
  const saved=first.save('  Título suave  ',recipe,draft);assert.equal(saved.ok,true);assert.equal(saved.items[0].name,'Título suave');
  draft.intensity=1;saved.items[0].options.intensity=2;
  const second=createPresetVariants(disk),read=second.read();assert.equal(read.ok,true);assert.equal(read.items[0].options.intensity,135);
  assert.deepEqual(Object.keys(JSON.parse(disk.raw())).sort(),['items','version']);
  assert.deepEqual(Object.keys(read.items[0]).sort(),['id','name','options','presetId']);
});

test('name and count limits are explicit without truncating or replacing data',()=>{
  const disk=storage(),library=createPresetVariants(disk);
  for(const name of ['', 'x'.repeat(81), 'line\nbreak'])assert.deepEqual(library.save(name,recipe,options),{ok:false,error:'name'});
  assert.equal(library.save('x'.repeat(80),recipe,options).ok,true);
  assert.deepEqual(library.save('X'.repeat(80),recipe,options),{ok:false,error:'duplicate'});
  for(let index=1;index<100;index++)assert.equal(library.save('Variation '+index,recipe,options).ok,true);
  const before=disk.raw();assert.deepEqual(library.save('Overflow',recipe,options),{ok:false,error:'limit'});assert.equal(disk.raw(),before);
});

test('only known recipes and bounded plain options are saved',()=>{
  const disk=storage(),library=createPresetVariants(disk);
  for(const [id,value] of [['unknown',options],[recipe,{...options,expression:'value*2'}],[recipe,{...options,intensity:301}],[recipe,{...options,sourcePath:'/private/file'}]])assert.deepEqual(library.save('Unsafe',id,value),{ok:false,error:'invalid'});
  let accessed=false;const hostile={...options};Object.defineProperty(hostile,'intensity',{get(){accessed=true;return 100;}});
  assert.deepEqual(library.save('Getter',recipe,hostile),{ok:false,error:'invalid'});assert.equal(accessed,false);assert.equal(disk.raw(),null);
});

test('invalid serialized data is preserved and never silently overwritten',()=>{
  const valid={id:'variant-a',name:'Saved',presetId:recipe,options};
  for(const raw of ['{bad',JSON.stringify({version:2,items:[]}),JSON.stringify({version:1,items:[{...valid,path:'/private'}]}),JSON.stringify({version:1,items:[{...valid,options:{...options,code:'x'}}]}),JSON.stringify({version:1,items:[valid,valid]}),'x'.repeat(131073)]){
    const disk=storage(raw),library=createPresetVariants(disk);
    assert.deepEqual(library.read(),{ok:false,error:'invalid'});assert.deepEqual(library.save('New',recipe,options),{ok:false,error:'invalid'});assert.equal(disk.raw(),raw);
  }
});

test('missing, denied, quota and unconfirmed storage do not report success',()=>{
  assert.deepEqual(createPresetVariants().save('Name',recipe,options),{ok:false,error:'unavailable'});
  assert.deepEqual(createPresetVariants({getItem(){throw Error('denied');},setItem(){throw Error('should not write');}}).save('Name',recipe,options),{ok:false,error:'read'});
  assert.deepEqual(createPresetVariants({getItem:()=>null,setItem(){throw Error('quota');}}).save('Name',recipe,options),{ok:false,error:'write'});
  assert.deepEqual(createPresetVariants({getItem:()=>null,setItem(){}}).save('Name',recipe,options),{ok:false,error:'write'});
});

test('delete and undo preserve other panels additions and reject conflicting restore',()=>{
  const disk=storage(),first=createPresetVariants(disk),second=createPresetVariants(disk);
  const one=first.save('One',recipe,options).items[0];second.save('Two',recipe,options);
  assert.equal(first.remove(one.id).items.length,1);assert.equal(first.restore(one).items.length,2);
  assert.deepEqual(first.restore(one),{ok:false,error:'duplicate'});assert.deepEqual(first.remove('variant-missing'),{ok:false,error:'missing'});
  assert.deepEqual(second.read().items.map(item=>item.name),['Two','One']);
});

