import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {createCepDocument} from './cep-dom.mjs';
import {createPanelPreferences,createI18n} from '../../../packages/ui-core/dist/index.js';
const built=await build({entryPoints:[fileURLToPath(new URL('../client/src/views/settings-view.ts',import.meta.url))],bundle:true,platform:'node',format:'esm',write:false});
const {createAeSettingsView}=await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);
for(const locale of ['pt-BR','en-US'])test(`local settings organize five groups and reset only the named data (${locale})`,()=>{
 const doc=createCepDocument(),values=new Map(),preferences=createPanelPreferences(doc.documentElement,{getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)});
 preferences.toggleFavorite('wiggle');preferences.recordColor('#abcdef');preferences.recordUse('neon');preferences.setTheme('light');preferences.setPresetAutoplay(false);
 const locales=[],navigations=[],motions=[];let refreshes=0;
 const view=createAeSettingsView(doc,{i18n:createI18n({locale}),preferences,motionPreference:{snapshot:()=>({internal:false,system:true,effective:true,storage:'available'}),setInternal:value=>motions.push(value)},onLocale:value=>locales.push(value),onRefresh:()=>refreshes++,onNavigate:value=>navigations.push(value)});
 const control=id=>view.element.getElementsByTagName('button').find(node=>node.id===id);
 assert.equal(view.element.getElementsByTagName('section').length,5);
 for(const section of view.element.getElementsByTagName('section')) {
  const heading=section.getElementsByTagName('h3')[0];
  assert.equal(section.getAttribute('aria-labelledby'),heading.id);
  assert.ok(heading.textContent.length>0,'the visible section heading supplies its accessible name');
 }
 assert.match(view.element.allText,locale==='pt-BR'?/sistema está reduzindo/:/system is reducing/);
 const helpSection=[...view.element.getElementsByTagName('section')].find(node=>node.className.includes('ch-settings-help'));
 assert.match(helpSection?.allText??helpSection?.textContent??'',locale==='pt-BR'?/Clique aplica · › abre a página · Botão direito: mais opções/:/Click applies · › opens the page · Right click: more options/);
 control('settings-clear-colors').click();assert.deepEqual(preferences.snapshot().recentColors,[]);assert.deepEqual(preferences.snapshot().favorites,['wiggle']);assert.deepEqual(preferences.snapshot().recent,['neon']);
 control('settings-reset-preview').click();assert.equal(preferences.snapshot().presetAutoplay,true);assert.equal(preferences.snapshot().theme,'light');assert.equal(refreshes,1);
 control('settings-reset-interface').click();assert.equal(preferences.snapshot().theme,'dark');assert.deepEqual(locales,['host']);assert.deepEqual(preferences.snapshot().favorites,['wiggle']);
 control('settings-help-diagnostics').click();assert.deepEqual(navigations,['diagnostics']);
 view.dispose();control('settings-clear-favorites').click();assert.deepEqual(preferences.snapshot().favorites,['wiggle']);
});

for(const locale of ['pt-BR','en-US'])test(`settings preserve native labels, descriptions, keyboard and preference changes (${locale})`,()=>{
 const doc=createCepDocument(),preferences=createPanelPreferences(doc.documentElement,{getItem:()=>null,setItem(){}}),motions=[],routes=[];
 let refreshes=0;
 const view=createAeSettingsView(doc,{i18n:createI18n({locale}),preferences,motionPreference:{snapshot:()=>({internal:false,system:false,effective:false,storage:'available'}),setInternal:value=>motions.push(value)},onLocale(){},onRefresh:()=>refreshes++,onNavigate:value=>routes.push(value)});
 const inputs=view.element.getElementsByTagName('input'),labels=view.element.getElementsByTagName('label');
 for(const id of ['settings-pin-dock','settings-preview-autoplay','settings-reduce-motion']) {
  const input=inputs.find(node=>node.id===id),label=labels.find(node=>node.htmlFor===id);
  assert.equal(input.type,'checkbox');assert.ok(label?.textContent.length>0,'label activation uses the native for/id association');
  if(id!=='settings-pin-dock') {
   const description=view.element.getElementsByTagName('div').find(node=>(node.id||node.getAttribute('id'))===input.getAttribute('aria-describedby'));
   assert.ok(description?.textContent.length>0,'description stays associated with its checkbox');
  }
 }
 const autoplay=inputs.find(node=>node.id==='settings-preview-autoplay');autoplay.checked=false;autoplay.emit('change');
 assert.equal(preferences.snapshot().presetAutoplay,false);assert.equal(refreshes,1);
 const motion=inputs.find(node=>node.id==='settings-reduce-motion');motion.checked=true;motion.emit('change');assert.deepEqual(motions,[true]);
 const size=inputs.find(node=>node.id==='settings-preview-size');size.value='220';size.keydown('Enter');assert.equal(preferences.snapshot().presetSize,220);
 size.value='999';size.keydown('Enter');assert.equal(preferences.snapshot().presetSize,220,'invalid typed size cannot alter the preference');
 const help=view.element.getElementsByTagName('button').find(node=>node.id==='settings-help-context');help.keydown('Enter');assert.deepEqual(routes,['context']);
 for(const action of view.element.getElementsByTagName('button').filter(node=>/^settings-(?:clear|reset)-/.test(node.id)))assert.equal(action.getAttribute('aria-describedby'),'settings-local-description');
 view.dispose();autoplay.checked=true;autoplay.emit('change');motion.checked=false;motion.emit('change');
 assert.equal(preferences.snapshot().presetAutoplay,false);assert.deepEqual(motions,[true]);
});
