/** Browser-only integration gate. Run after build with the path to a Playwright package.
 * Example: node apps/after-effects-cep/tests/ui-review.browser.mjs /path/to/playwright/index.mjs
 * Uses the actual custom elements and the complete distributed stylesheet; never connects to Adobe.
 */
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
const { chromium } = await import(pathToFileURL(resolve(process.argv[2])).href);
const output=resolve(process.argv[3]??'artifacts/plugin-review-ui');await mkdir(output,{recursive:true});
const css=await readFile('dist/after-effects-cep/styles/theme.css','utf8');
const result=await build({stdin:{resolveDir:process.cwd(),contents:`
import * as core from './packages/ui-core/src/index.ts';
import {createGradientEditor} from './apps/after-effects-cep/client/src/gradient-editor.ts';
import {createPresetLayerSections} from './apps/after-effects-cep/client/src/preset-layer-sections.ts';
import {createPresetGallery} from './apps/after-effects-cep/client/src/preset-gallery.ts';
import {createAeSettingsView} from './apps/after-effects-cep/client/src/views/settings-view.ts';
import {cloneGradientSettings} from './packages/contracts/src/index.ts';
let dispose=()=>{};const response=data=>({ok:true,data,warnings:[],error:null});
const i18n=core.createI18n({locale:'pt-BR'});
function root(){dispose();dispose=()=>{};core.closeOpenColorPicker(document);document.body.innerHTML='<div class="ch-shell" data-layout="library" id="root"></div>';return document.querySelector('#root');}
function prefs(){return core.createPanelPreferences(document.documentElement);}
window.testUi={core,
 gradient(){const el=root();let data={settings:cloneGradientSettings(),selectionToken:'comp1/layer1',selectionCount:1,appliedCount:1,instances:[],mixedKeys:[],lockedKeys:[],capabilities:{nativeAvailable:true}};data.instances=[{layerId:1,layerName:'Shape',effectIndex:1,settings:data.settings,lockedKeys:[]}];
 let reads=0;const calls=[];const editor=createGradientEditor(document,{i18n,context:()=>({isComposition:true,signature:'comp1/layer1'}),read:async()=>{reads++;return response(data);},execute:async args=>{calls.push(args);data={...data,settings:args.settings??data.settings};return response({});},error:()=> 'error'});
 el.append(editor.element,editor.actions);dispose=()=>editor.dispose();return window.current={editor,calls,get reads(){return reads;},change(){data.settings={...data.settings,angle:120};},root:el};},
 picker(){const el=root(),commits=[],states=[];let finish;core.configureColorPickers(document,{native:{pick:()=>new Promise(resolve=>{finish=resolve;})}});const picker=core.createColorPicker(document,{id:'standalone-color',label:'Cor',value:'#ff0000',onCommit:v=>commits.push(v),onOpenChange:v=>states.push(v)});el.append(picker.trigger);dispose=()=>picker.dispose();return window.current={picker,commits,states,resolve:v=>finish(v)};},
 colors(){const el=root(),calls=[],dirty=[];core.configureColorPickers(document,{});const section=createPresetLayerSections(document,{locale:'pt-BR',busy:false,blocked:false,inspection:{state:'unmanaged',message:'',selection:[{id:1,name:'Shape'}],colors:[{key:'shape.1',label:'Preenchimento',hex:'#FF0000',available:true,reason:''}],colorTarget:{compId:1,layerId:1,fingerprint:'red'}},execute:(command,args)=>calls.push({command,args}),onDirty:value=>dirty.push(value)});el.append(section);return window.current={calls,dirty};},
 gallery(){const el=root();el.innerHTML='<div class="ch-preset-workspace-content" data-browse="true" style="height:100%"></div>';const preferences=prefs();preferences.setPresetAutoplay(false);const navigation={category:'all',scope:'all',query:'',scroll:0};const gallery=createPresetGallery(document,{locale:'pt-BR',preferences,navigation,busy:false,context:()=>({hasComp:true,selectionCount:1,selectedKeys:2}),apply(){},edit(){}});el.firstChild.append(gallery.element);dispose=()=>gallery.dispose();return window.current={gallery,navigation};},
 settings(){const el=root(),preferences=prefs();el.style.overflow='auto';const settings=createAeSettingsView(document,{i18n,preferences,motionPreference:{snapshot:()=>({internal:false,system:true,effective:true,storage:'available'}),setInternal(){},dispose(){}},onLocale(){},onRefresh(){},onNavigate(){}});el.append(settings.element);dispose=()=>settings.dispose();return window.current={settings,preferences};}
};
`},bundle:true,platform:'browser',format:'iife',write:false});
const browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:360,height:720}});
const errors=[];page.on('pageerror',error=>errors.push(String(error)));const checks=[];const check=(name)=>checks.push({name,status:'PASS'});
try {
 await page.setContent('<!doctype html><html lang="pt-BR"><head></head><body></body></html>');await page.addStyleTag({content:css+'\nhtml,body,#root{width:100%;height:100%;} #root{padding:8px;box-sizing:border-box;overflow:auto;}'});await page.addScriptTag({content:result.outputFiles[0].text});
 for(const [width,height] of [[280,280],[360,720],[480,800],[720,900]]){
  await page.setViewportSize({width,height});await page.evaluate(async()=>{testUi.gradient();await current.editor.refresh();});
  await page.locator('#gradient-stop-0-color').click();
  assert.equal(await page.locator('.ch-color-surface').count(),1);
  const box=await page.locator('.ch-color-surface').boundingBox();assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=width&&box.y+box.height<=height+.5);
  assert.equal(await page.locator('.ch-color-surface__row').evaluate(el=>getComputedStyle(el).paddingTop),'0px');
  await page.locator('.ch-color-hex-input').fill('#123abc');
  const before=await page.evaluate(()=>current.reads);await page.evaluate(async()=>{current.change();await current.editor.refresh();});
  assert.equal(await page.evaluate(()=>current.reads),before,'no host read while choosing a color');
  assert.equal(await page.locator('.ch-color-hex-input').inputValue(),'#123abc');
  await page.screenshot({path:resolve(output,`gradient-color-${width}x${height}.png`)});
  await page.locator('.ch-color-hex-input').press('Enter');
  assert.equal(await page.evaluate(()=>current.calls.length),1);assert.deepEqual(await page.evaluate(()=>current.calls[0].changedKeys),['stops.0.color']);
  assert.equal(await page.evaluate(()=>document.activeElement.id),'gradient-stop-0-color');
  check(`gradient overlay, layout, poll guard, one commit, focus ${width}x${height}`);
 }
 await page.setViewportSize({width:360,height:720});
 await page.evaluate(()=>testUi.picker());await page.locator('#standalone-color').click();await page.locator('.ch-color-native').click();
 await page.locator('.ch-color-surface').press('Escape');await page.locator('#standalone-color').click();
 await page.evaluate(()=>current.resolve('#abcdef'));await page.waitForTimeout(30);
 assert.equal(await page.locator('.ch-color-hex-input').inputValue(),'#FF0000');assert.equal(await page.evaluate(()=>current.commits.length),0);check('old native response cannot mutate a reopened session');
 await page.evaluate(()=>{current.picker.close(false);testUi.core.configureColorPickers(document,{native:{pick:()=>{throw new Error('Falha de conexão');}}});current.picker.open();});
 await page.locator('.ch-color-native').click();await page.locator('.ch-color-native-error').waitFor({state:'visible'});assert.match(await page.locator('.ch-color-native-error').textContent(),/Falha de conexão/);assert.equal(await page.evaluate(()=>current.picker.isOpen),true);check('native errors remain visible and preserve local choice');
 await page.evaluate(()=>testUi.colors());await page.locator('.ch-color-hex').fill('336699');assert.equal(await page.evaluate(()=>testUi.core.hasColorDraft(document)),true);
 await page.locator('.ch-layer-selection-name').click();assert.equal(await page.evaluate(()=>current.calls.length),1);assert.equal(await page.locator('.ch-color-hex').inputValue(),'#336699');
 await page.locator('.ch-color-hex').focus();await page.locator('.ch-color-hex').press('Enter');assert.equal(await page.evaluate(()=>current.calls.length),1);
 await page.locator('.ch-color-hex').fill('#12');await page.locator('.ch-layer-selection-name').click();assert.equal(await page.locator('.ch-color-hex').getAttribute('aria-invalid'),'true');assert.equal(await page.evaluate(()=>testUi.core.hasColorDraft(document)),true);
 await page.locator('.ch-color-hex').press('Escape');assert.equal(await page.locator('.ch-color-hex').inputValue(),'#336699');assert.equal(await page.evaluate(()=>testUi.core.hasColorDraft(document)),false);check('hex blur and Enter deduplicate; invalid drafts remain protected; Escape restores');
 const row=await page.locator('.ch-color-list .ch-color-row').boundingBox();const trigger=await page.locator('.ch-color-swatch-trigger').boundingBox();assert.ok(row.height>=trigger.height+16);check('final stylesheet separates list rows and picker rows');
 await page.evaluate(()=>testUi.gallery());assert.equal(await page.locator('[id^="builtin.ease."]').count(),0);
 const previews=page.locator('.ch-preset-preview');await previews.nth(0).click();const id=await page.evaluate(()=>current.navigation.selectedId);await previews.nth(1).focus();
 assert.equal(await page.locator('.ch-preset-card[data-selected="true"]').count(),1);assert.equal(await page.evaluate(()=>current.navigation.selectedId),id);await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>current.navigation.selectedId),id);
 assert.equal(await previews.nth(0).evaluate(el=>getComputedStyle(el).outlineStyle),'none');assert.equal(await previews.nth(1).evaluate(el=>getComputedStyle(el).outlineStyle),'dashed');await page.screenshot({path:resolve(output,'gallery-selection.png')});check('one persistent selected card, distinct keyboard focus, no Curves');
 await page.evaluate(()=>testUi.settings());assert.deepEqual(await page.locator('.ch-settings-section > h3').allTextContents(),['Interface','Prévias','Acessibilidade','Dados locais','Ajuda']);await page.screenshot({path:resolve(output,'settings.png')});check('five local settings groups and effective system motion');
 assert.deepEqual(errors,[]);await writeFile(resolve(output,'browser-results.json'),JSON.stringify({status:'PASS',checks,errors},null,2));console.log(JSON.stringify({status:'PASS',checks:checks.length,output}));
} finally { await browser.close(); }
