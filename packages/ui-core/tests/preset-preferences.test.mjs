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

test('selective resets preserve personal libraries, drafts and unrelated preferences',()=>{
  const records=new Map([
    ['motion.panel.preferences.v1',JSON.stringify({version:1,theme:'light',density:'compact',locale:'en-US',favorites:['wiggle'],recent:['neon'],recentColors:['#123abc'],presetAutoplay:false,presetSize:280,drafts:{gradient:{angle:30}},gallery:{category:'text',scope:'all',query:'reveal',presetId:'builtin.motion.arc-arrival'}})],
    ['motion.ease.library.v1','personal curves'],['motion.gradient.library.v1','personal gradient'],['motion.auth','account']
  ]);
  const preferences=createPanelPreferences(root,{getItem:key=>records.get(key)??null,setItem:(key,value)=>records.set(key,value)});
  preferences.clearRecentColors();assert.deepEqual(preferences.snapshot().recentColors,[]);assert.deepEqual(preferences.snapshot().recent,['neon']);
  preferences.resetPreviews();assert.equal(preferences.snapshot().presetSize,200);assert.equal(preferences.snapshot().presetAutoplay,true);assert.equal(preferences.snapshot().theme,'light');
  preferences.resetInterface();assert.equal(preferences.snapshot().theme,'dark');assert.equal(preferences.snapshot().locale,'host');assert.deepEqual(preferences.snapshot().favorites,['wiggle']);
  assert.deepEqual(preferences.snapshot().drafts,{gradient:{angle:30}});assert.equal(preferences.snapshot().gallery.query,'reveal');
  assert.equal(records.get('motion.ease.library.v1'),'personal curves');assert.equal(records.get('motion.gradient.library.v1'),'personal gradient');assert.equal(records.get('motion.auth'),'account');
  preferences.clearFavorites();assert.deepEqual(preferences.snapshot().favorites,[]);assert.deepEqual(preferences.snapshot().recent,['neon']);
});

test('retired gallery Curves state migrates without deleting saved curve data or favorites',()=>{
  const raw=JSON.stringify({version:1,gallery:{category:'ease',scope:'favorites',query:'',presetId:'builtin.ease.balanced'},favorites:['builtin.ease.balanced','wiggle'],drafts:{'custom.curve':{intensity:20}}});
  const p=createPanelPreferences(root,{getItem:()=>raw,setItem(){}});
  assert.deepEqual(p.snapshot().gallery,{category:'all',scope:'favorites',query:'',presetId:''});
  assert.deepEqual(p.snapshot().favorites,['builtin.ease.balanced','wiggle']);assert.deepEqual(p.snapshot().drafts,{'custom.curve':{intensity:20}});
});
