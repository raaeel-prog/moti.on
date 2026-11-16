import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';import assert from 'node:assert/strict';
import {attachLicensedAccount} from './licensed-account-fixture.mjs';
import {chromium} from 'file:///C:/Users/raaee/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const account=attachLicensedAccount.toString().replace('window.localStorage = { getItem: () => null, setItem() {} };','');
const fixture=`
window.fixtureCalls=[];
const fixtureStorage=new Map();Object.defineProperty(window,'localStorage',{value:{getItem:key=>fixtureStorage.get(key)??null,setItem:(key,value)=>fixtureStorage.set(key,String(value)),removeItem:key=>fixtureStorage.delete(key)}});
const fixtureContext={hostVersion:'26.5',projectName:'Browser fixture',projectPath:null,activeItemName:'Layout fixture',isComposition:true,compWidth:1920,compHeight:1080,compDuration:5,compFrameRate:30,currentTime:0,workAreaStart:0,workAreaDuration:5,selectionLayerCount:1,selectionTextLayerCount:1,selectionPropertyCount:1,selectionExpressibleCount:1,selectionSelectedKeyCount:2,selectionHasKeyframes:true,selectionHasExpressions:false,selectionIs3D:false,averageLayerDurationSeconds:5,selectionTruncated:false,selectionSignature:'browser-fixture'};
window.fixtureTheme={panelBackgroundColorSRGB:{color:{red:50,green:50,blue:50}}};window.themeListeners=[];
class CSInterface {
 getHostEnvironment(){return {appVersion:'26.5',appUILocale:'pt_BR',appSkinInfo:window.fixtureTheme};}
 getSystemPath(){return '/browser-fixture';}
 addEventListener(type,fn){if(type==='com.adobe.csxs.events.ThemeColorChanged')window.themeListeners.push(fn);} removeEventListener(type,fn){window.themeListeners=window.themeListeners.filter(item=>item!==fn);} dispatchEvent(){}
 evalScript(script,callback){
  if(!script.startsWith('MotionAE.dispatch(')){callback('function');return;}
  const request=JSON.parse(JSON.parse(script.slice('MotionAE.dispatch('.length,-1)));
  window.fixtureCalls.push(request);
  const data=request.command==='ae.context.read'?fixtureContext:request.command==='ae.presets.inspect'?window.fixtureInspection??{state:'unmanaged',message:'Fixture sem preset aplicado',phases:[]}:request.command==='ae.presets.personal-list'?{roots:[],folders:[],items:[]}: {appliedCount:1,unchangedCount:0};
  setTimeout(()=>callback(JSON.stringify({protocolVersion:1,requestId:request.requestId,ok:true,data,warnings:[],error:null})),0);
 }
}
(${account})(window,CSInterface);
`;

const output=resolve('artifacts/preset-library-video');await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true});const checks=[],errors=[],timings=[];
try{
for(const [width,height,scale] of [[506,512,1],[280,640,1],[360,720,1],[480,800,1],[720,900,1],[280,280,1],[506,512,1.25],[506,512,1.5],[506,512,2]]){
 console.log('Viewport',width,height,scale);const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:scale});page.on('pageerror',error=>errors.push(String(error)));page.setDefaultTimeout(6000);
 await page.setContent('<!doctype html><html data-host="after-effects" lang="pt-BR"><body data-host="after-effects"><div id="root"></div></body></html>');
 await page.addStyleTag({content:await readFile('dist/after-effects-cep/styles/theme.css','utf8')});await page.addScriptTag({content:fixture});await page.addScriptTag({content:await readFile('dist/after-effects-cep/client/main.js','utf8')});
 await page.locator('#library-tool-wiggle').waitFor();await page.locator('.ch-nav__item[data-view="presets"]').click();
 const sidebar=page.locator('.ch-preset-sidebar'),grid=page.locator('.ch-preset-grid'),footer=page.locator('.ch-preset-reference-footer'),panel=page.locator('.ch-preset-settings-panel');
 await sidebar.waitFor();await page.waitForTimeout(300);
 assert.ok(await sidebar.locator('input[type="search"]').isVisible());
 assert.ok((await sidebar.locator('input[type="search"]').boundingBox()).width>=80,'search stays usable in narrow trees');
 const side=await sidebar.boundingBox(),catalog=await grid.boundingBox(),foot=await footer.boundingBox();assert.ok(side.width>=120&&catalog.width>=140,JSON.stringify({side,catalog,foot}));assert.ok(catalog.x>=side.x+side.width);assert.ok(foot.y+foot.height<=height+1);
 assert.ok(await page.evaluate(()=>document.body.scrollWidth<=innerWidth),'no horizontal overflow');checks.push(width+' layout '+scale);
 const slider=footer.getByRole('slider',{name:'Tamanho das miniaturas'}),sliderBounds=await slider.boundingBox();
 assert.ok(Math.abs(sliderBounds.width-88)<1,'thumbnail slider has one fixed 88px width at every viewport');
 const actionsBounds=await footer.getByRole('button',{name:'Ações de presets',exact:true}).boundingBox();
 assert.ok(Math.abs(sliderBounds.y+sliderBounds.height/2-actionsBounds.y-actionsBounds.height/2)<2,'slider stays beside preset actions: '+JSON.stringify({sliderBounds,actionsBounds}));
 checks.push(width+' fixed thumbnail slider '+scale);
 await page.screenshot({path:resolve(output,'browse-'+width+'x'+height+'-'+scale+'.png')});
 const card=page.locator('.ch-preset-card').first(),trigger=card.locator('.ch-preset-settings-trigger');
 await trigger.hover();await page.waitForTimeout(200);assert.equal(await panel.getAttribute('data-open'),'false');
 await card.locator('.ch-preset-preview').click();await panel.waitFor({state:'visible'});await page.waitForTimeout(250);
 if(width===506&&scale===1){
  const entry=await panel.evaluate(el=>({opacity:getComputedStyle(el).opacity,transition:getComputedStyle(el).transitionProperty}));assert.equal(entry.opacity,'1');assert.match(entry.transition,/opacity/);
  await page.keyboard.press('Escape');assert.equal(await panel.getAttribute('data-open'),'false');assert.equal(await panel.getAttribute('aria-hidden'),'true');
  assert.equal(await panel.evaluate(el=>el.hidden),false,'exit keeps the surface until its transition finishes');
  await panel.waitFor({state:'hidden'});await card.locator('.ch-preset-preview').click();await page.waitForTimeout(250);
  checks.push('menu entry and exit preserve attached geometry and accessibility');
 }
 const selected=await card.getAttribute('id');const before=await grid.boundingBox();
 const right=panel.locator('[data-direction="right"]');assert.ok(await right.isVisible());await right.click();
 await page.evaluate(()=>document.documentElement.setAttribute('data-reduced-motion','true'));
 const selectedMarkup=await card.locator('.ch-preset-preview svg').innerHTML();
 await panel.locator('[data-direction="left"]').hover();await page.waitForTimeout(200);assert.equal(await card.locator('.ch-preset-preview svg').innerHTML(),selectedMarkup,'hover never changes direction drawing');
 assert.equal(await right.getAttribute('aria-pressed'),'true');
 await page.mouse.move(width-2,2);await page.waitForTimeout(200);assert.equal(await panel.getAttribute('data-open'),'true','leaving keeps clicked menu');
 const other=page.locator('.ch-preset-settings-trigger:visible').nth(1);await other.dispatchEvent('mouseenter');await page.waitForTimeout(200);assert.equal(await page.locator('.ch-preset-card[data-selected="true"]').getAttribute('id'),selected);assert.equal(await other.getAttribute('aria-expanded'),'false');
 const menuBounds=await panel.boundingBox(),cardBounds=await card.boundingBox();assert.ok(Math.abs(menuBounds.width-cardBounds.width)<1.1);assert.ok(Math.abs(menuBounds.x-cardBounds.x)<1.1);assert.deepEqual(await grid.boundingBox(),before);
 await page.screenshot({path:resolve(output,'menu-'+width+'x'+height+'-'+scale+'.png')});
 await page.keyboard.press('Escape');await panel.waitFor({state:'hidden'});assert.equal(await card.getAttribute('data-selected'),'true');
 await card.locator('.ch-preset-preview').click();await panel.waitFor({state:'visible'});assert.equal(await panel.locator('[data-direction="right"]').getAttribute('aria-pressed'),'true');
 await panel.locator('.ch-preset-directions-toggle').click();assert.equal(await panel.locator('.ch-preset-direction-tile svg:visible').count(),4);await page.keyboard.press('Escape');
 checks.push(width+' click-only direction, menu and drafts '+scale);
 const separator=page.getByRole('separator',{name:'Largura das pastas'});await separator.focus();await page.keyboard.press('End');const max=Number(await separator.getAttribute('aria-valuenow'));await page.keyboard.press('ArrowLeft');assert.equal(Number(await separator.getAttribute('aria-valuenow')),Math.max(120,max-8));checks.push(width+' splitter '+scale);
 if(width===506&&scale===1){
  await separator.focus();await page.keyboard.press('Home');
  const size=footer.getByRole('slider',{name:'Tamanho das miniaturas'});await size.fill('140');await size.dispatchEvent('input');
  const smallWidth=(await card.boundingBox()).width;await size.fill('320');await size.dispatchEvent('input');assert.ok((await card.boundingBox()).width>smallWidth,'slider changes actual column count');
  for(const resizedWidth of [280,360,439,440,506,720]){
   await page.setViewportSize({width:resizedWidth,height});
   assert.equal(await size.inputValue(),'320','resizing preserves the chosen thumbnail size');
   assert.ok(Math.abs((await size.boundingBox()).width-88)<1,'resizing never stretches the slider');
   assert.ok(await page.evaluate(()=>document.body.scrollWidth<=innerWidth),'footer fits across the wrap breakpoint');
  }
  await page.setViewportSize({width,height});checks.push('slider width and choice survive resizing across 439/440px');
  const divider=await separator.boundingBox();await page.mouse.move(divider.x+divider.width/2,divider.y+30);await page.mouse.down();await page.mouse.move(180,divider.y+30);await page.mouse.up();assert.ok(Math.abs(Number(await separator.getAttribute('aria-valuenow'))-180)<2);
  const search=sidebar.getByRole('searchbox');await search.fill('does-not-exist');await page.waitForTimeout(300);assert.equal(await page.locator('.ch-preset-card').count(),0);await search.fill('');await page.waitForTimeout(300);await card.waitFor();
  const toggle=sidebar.locator('.ch-folder-toggle:not(:disabled)').first();await toggle.click();assert.equal(await toggle.getAttribute('aria-expanded'),'false');await toggle.click();assert.equal(await toggle.getAttribute('aria-expanded'),'true');
  const firstView=card.locator('.ch-preset-preview');
  for(let index=0;index<6;index++){const sample=await firstView.evaluate(el=>{const start=performance.now();el.click();return performance.now()-start;});if(index)timings.push(sample);await page.keyboard.press('Escape');}
  assert.ok(Math.max(...timings)<100,'local click feedback stays under 100ms');checks.push('search, folder disclosure, slider columns, pointer splitter, click performance');
  await page.evaluate(()=>{window.fixtureInspection={state:'ready',message:'',presetId:'studio-letter-silk-rise',target:{compId:1,layerId:2,instance:'browser',fingerprint:'one'},options:{phase:'in',direction:'bottom',durationFrames:40,intensity:100,staggerFrames:2,unit:'preset',elasticity:35,overlap:70,speed:100}};});
  const actions=page.getByRole('button',{name:'Ações de presets',exact:true});await actions.click();const menu=page.locator('.ch-preset-library-actions-menu');await menu.locator('[data-action="copy-preset"]').waitFor();assert.equal(await menu.locator('.ch-preset-actions-column').count(),3);
  assert.equal(await menu.locator('[data-action="paste-preset"]').isDisabled(),true);await page.screenshot({path:resolve(output,'actions-506.png')});await menu.locator('[data-action="copy-preset"]').click();await menu.waitFor({state:'hidden'});
  await actions.click();await menu.locator('[data-action="paste-preset"]').waitFor();assert.equal(await menu.locator('[data-action="paste-preset"]').isEnabled(),true);await menu.locator('[data-action="paste-preset"]').click();await page.waitForFunction(()=>window.fixtureCalls.some(call=>call.command==='ae.presets.phase-apply'));
  assert.equal(await page.evaluate(()=>window.fixtureCalls.filter(call=>call.command==='ae.presets.phase-apply').length),1);checks.push('actions inspect/copy/paste through existing commands');
 }
 await page.close();
}
assert.deepEqual(errors,[]);await writeFile(resolve(output,'results.json'),JSON.stringify({status:'PASS',checks,errors,timings,adobeRuntime:'NOT RUN'},null,2));console.log(JSON.stringify({status:'PASS',checks:checks.length}));
}finally{await browser.close();}
