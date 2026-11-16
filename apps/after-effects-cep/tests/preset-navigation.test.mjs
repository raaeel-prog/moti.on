import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
const moduleAt=async path=>{
  const built=await build({entryPoints:[fileURLToPath(new URL(path,import.meta.url))],bundle:true,platform:'node',format:'esm',write:false});
  return import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);
};
const {textPresetNavigation,motionPresetNavigation,TEXT_PRESET_FAMILIES}=await moduleAt('../client/src/preset-navigation.ts');
const {GALLERY_PRESETS,galleryCategoryMatches}=await moduleAt('../client/src/preset-gallery.ts');

test('each authored text recipe belongs to exactly one family and retains its legacy category',()=>{
  for(const preset of GALLERY_PRESETS){
    if(!['text-characters','text-words','text-lines'].includes(preset.category)){
      // Motion and camera recipes may carry an effect family; it always mirrors motionPresetNavigation.
      if(preset.navigation){const category=preset.category==='camera-transitions'?'camera-transitions':preset.motion?.category;
        assert.deepEqual(preset.navigation,motionPresetNavigation(preset.motion,category),preset.id);
        assert.equal(preset.navigation.filter,`${preset.navigation.category}/${preset.navigation.family}`,preset.id);}
      continue;
    }
    const before=JSON.stringify(preset.motion),metadata=textPresetNavigation(preset.motion);
    assert.deepEqual(metadata,preset.navigation,preset.id);
    assert.ok(galleryCategoryMatches(preset.category,preset));
    assert.equal(TEXT_PRESET_FAMILIES.filter(([family])=>galleryCategoryMatches(`${preset.category}/${family}`,preset)).length,1,preset.id);
    assert.equal(JSON.stringify(preset.motion),before,'navigation never mutates recipes');
    assert.deepEqual(textPresetNavigation({...preset.motion,id:'unrelated',name:{'pt-BR':'Escala','en-US':'Fade'}}),metadata,'names and IDs do not determine families');
  }
});

test('family classification follows actual operations including combined transforms',()=>{
  const base={...GALLERY_PRESETS.find(p=>p.category==='text-characters').motion,position:[0,0,0],scale:[0,0,0],rotation:[0,0,0],fade:false,effect:'none',text:{unit:'characters',random:false,decode:false,tracking:0,skew:0,mask:false}};
  const examples=[
    [{fade:true},'fade'],[{position:[0,12,0]},'position'],[{scale:[-20,0,0]},'scale'],
    [{position:[0,12,0],scale:[-20,0,0]},'position-scale'],
    [{scale:[-20,0,0],text:{...base.text,tracking:20}},'scale-tracking'],
    [{text:{...base.text,tracking:20}},'tracking'],[{rotation:[0,0,30]},'rotation'],
    [{text:{...base.text,decode:true}},'reveal'],[{text:{...base.text,mask:true}},'reveal'],
    [{text:{...base.text,reveal:'typewriter'}},'reveal'],[{text:{...base.text,blur:10}},'blur'],
    [{effect:'film-burn'},'effects'],[{},'other']
  ];
  for(const [recipe,family] of examples)assert.equal(textPresetNavigation({...base,...recipe}).family,family);
  assert.equal(textPresetNavigation({...base,category:'text-effects'}),undefined,'continuous text effects keep their separate category');
});
