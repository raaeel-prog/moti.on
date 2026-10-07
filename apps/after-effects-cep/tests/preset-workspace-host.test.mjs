import test from 'node:test';
import assert from 'node:assert/strict';
import {loadHostModules} from './host-harness.mjs';

async function handlers(){
  const scope=await loadHostModules(['src/json.jsx','src/registry.jsx','src/commands/preset-library.jsx','src/commands/personal-preset-library.jsx'],{
    app:{version:'26.5',project:null}, Folder:function(){},
    MotionContracts:{ERROR:{INVALID_PRESET:'INVALID_PRESET'}},
    MotionLibraryCore:{},MotionLibraryCatalog:[]
  });return scope.MotionRegistry;
}
test('host rejects unknown fields before reading selection, files, or mutating',async()=>{
  const h=await handlers();
  for(const [id,args]of [
    ['ae.presets.inspect',{code:'evil'}],
    ['ae.presets.adjust',{target:{},options:{},presetId:'x',path:'/tmp/preset'}],
    ['ae.presets.adjust',{target:{compId:1,layerId:2,instance:'x',fingerprint:'x',code:'evil'},options:{},presetId:'x'}],
    ['ae.presets.adjust',{target:{},options:{presetId:'other'},presetId:'x'}],
    ['ae.presets.personal',{action:'list',rootId:'root-1'}],
    ['ae.presets.personal',{action:'add',path:'/tmp'}],
    ['ae.presets.personal-apply',{itemId:'ffx-1-0',path:'/tmp/evil.jsx'}]
  ])assert.equal(h.get(id).preflight(args).code,'INVALID_PRESET',id);
});
test('host refuses unissued file tokens, prototype names and direct filesystem paths',async()=>{
  const h=await handlers();
  for(const itemId of ['__proto__','constructor','/tmp/foo.ffx','file:///tmp/foo.ffx','ffx-1-0'])assert.equal(h.get('ae.presets.personal-apply').preflight({itemId}).code,'INVALID_PRESET');
});

