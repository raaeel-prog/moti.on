import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
const result=await build({entryPoints:[fileURLToPath(new URL('../src/panel-preferences.ts',import.meta.url))],bundle:true,platform:'node',format:'esm',write:false});
const {createPanelPreferences}=await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
const root={setAttribute(){}};
test('preset preferences persist without changing legacy favorites and theme',()=>{
  let raw=JSON.stringify({version:1,theme:'light',favorites:['builtin.motion.mist-reveal'],recent:['wiggle']});const storage={getItem:()=>raw,setItem:(_,v)=>raw=v};
  const p=createPanelPreferences(root,storage);p.setFolderColor('motion','red');p.toggleFolder('text');p.setPresetSize(240);p.setPresetAutoplay(false);
  const saved=createPanelPreferences(root,storage).snapshot();assert.equal(saved.theme,'light');assert.deepEqual(saved.favorites,['builtin.motion.mist-reveal']);assert.equal(saved.folderColors.motion,'red');assert.deepEqual(saved.collapsedFolders,['text']);assert.equal(saved.presetSize,240);assert.equal(saved.presetAutoplay,false);
  assert.ok(!raw.includes('layerId')&&!raw.includes('options')&&!raw.includes('path'));
});
test('untrusted color and folder values cannot inject styles or prototype data',()=>{
  const p=createPanelPreferences(root,{getItem:()=>'{"version":1,"folderColors":{"motion":"url(evil)","__proto__":"red","text":"green"},"presetSize":99999,"presetAutoplay":"false"}',setItem(){}});
  p.setFolderColor('__proto__','red');p.setFolderColor('camera','url(evil)');const s=p.snapshot();assert.deepEqual(s.folderColors,{text:'green'});assert.equal(s.presetSize,200);assert.equal(s.presetAutoplay,true);
});

test('language choice survives reopen; absent or invalid values follow the host',()=>{
  let raw = JSON.stringify({version:1,locale:'arbitrary'});
  const storage={getItem:()=>raw,setItem:(_,v)=>{raw=v;}};
  const p=createPanelPreferences(root,storage);
  assert.equal(p.snapshot().locale,'host');
  p.setLocale('en-US');
  assert.equal(createPanelPreferences(root,storage).snapshot().locale,'en-US');
  p.setLocale('pt-BR');p.setLocale('invalid');
  assert.equal(createPanelPreferences(root,storage).snapshot().locale,'pt-BR');
  p.setLocale('host');
  assert.equal(createPanelPreferences(root,storage).snapshot().locale,'host');
});

test('quick dock pin is an additive preference and survives reopening with legacy state intact',()=>{
  let raw=JSON.stringify({version:1,theme:'light',locale:'pt-BR',density:'compact',category:'layers',favorites:['wiggle'],recent:['ease'],presetAutoplay:false,presetSize:240,folderColors:{motion:'green'},collapsedFolders:['text']});
  const storage={getItem:()=>raw,setItem:(_,value)=>{raw=value;}};
  const preferences=createPanelPreferences(root,storage);
  assert.equal(preferences.snapshot().quickDockPinned,false);
  preferences.setQuickDockPinned(true);
  const reopened=createPanelPreferences(root,storage);
  assert.deepEqual(reopened.snapshot(),{theme:'light',locale:'pt-BR',density:'compact',category:'layers',favorites:['wiggle'],recent:['ease'],recentColors:[],persistent:true,recovered:false,presetAutoplay:false,presetSize:240,quickDockPinned:true,folderColors:{motion:'green'},collapsedFolders:['text'],lastView:'',gallery:{category:'all',scope:'all',query:'',presetId:''},drafts:{}});
  reopened.setQuickDockPinned(false);
  assert.equal(createPanelPreferences(root,storage).snapshot().quickDockPinned,false);
});

test('invalid saved pin state is ignored and unavailable storage still permits session pinning',()=>{
  const invalid=createPanelPreferences(root,{getItem:()=>JSON.stringify({version:1,quickDockPinned:'true'}),setItem(){}});
  assert.equal(invalid.snapshot().quickDockPinned,false);
  const session=createPanelPreferences(root,{getItem(){throw new Error('unavailable');},setItem(){throw new Error('unavailable');}});
  session.setQuickDockPinned(true);assert.equal(session.snapshot().quickDockPinned,true);assert.equal(session.snapshot().persistent,false);
});

afterEach(() => {
  for (const name of ["HTMLElement", "customElements", "document", "window"]) delete globalThis[name];
});

test('recent colors keep eight unique lowercase hex values and ignore anything else',()=>{
  let raw=JSON.stringify({version:1,recentColors:['#ABCDEF','url(evil)','#abcdef','#123456',42]});const storage={getItem:()=>raw,setItem:(_,v)=>raw=v};
  const p=createPanelPreferences(root,storage);
  assert.deepEqual(p.snapshot().recentColors,['#abcdef','#123456'],'only canonical lowercase hex survives, without duplicates');
  for(const hex of ['#111111','#222222','#333333','#444444','#555555','#666666','#777777','#888888','#999999'])p.recordColor(hex);
  p.recordColor('#555555');p.recordColor('not a color');p.recordColor('#ABCDEF');
  const saved=createPanelPreferences(root,storage).snapshot().recentColors;
  assert.deepEqual(saved,['#abcdef','#555555','#999999','#888888','#777777','#666666','#444444','#333333']);
});
