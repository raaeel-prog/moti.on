import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
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
  const data=request.command==='ae.context.read'?fixtureContext:request.command==='ae.presets.inspect'?{state:'unmanaged',message:'Fixture sem preset aplicado',phases:[]}:request.command==='ae.presets.personal-list'?{roots:[],folders:[],items:[]}: {appliedCount:1,unchangedCount:0};
  setTimeout(()=>callback(JSON.stringify({protocolVersion:1,requestId:request.requestId,ok:true,data,warnings:[],error:null})),0);
 }
}
(${account})(window,CSInterface);
`;

const output=resolve('artifacts/preset-popover');await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true});
const errors=[],checks=[];
try {
for(const [width,scale] of [[280,1],[360,1],[480,1],[720,1],[360,1.25],[360,1.5],[360,2]]) {
 console.log('viewport',width,scale);
 const page=await browser.newPage({viewport:{width,height:720},deviceScaleFactor:scale});page.on('pageerror',error=>errors.push(String(error)));
 await page.setContent('<!doctype html><html data-host="after-effects" lang="pt-BR"><body data-host="after-effects"><div id="root"></div></body></html>');
 await page.addStyleTag({content:await readFile('dist/after-effects-cep/styles/theme.css','utf8')});
 await page.addScriptTag({content:fixture});await page.addScriptTag({content:await readFile('dist/after-effects-cep/client/main.js','utf8')});
 await page.locator('#library-tool-wiggle').waitFor();
 await page.locator('.ch-nav__item[data-view="presets"]').click();
 const trigger=page.locator('.ch-preset-settings-trigger:visible').first();
 const card=trigger.locator('xpath=ancestor::article');
 const panel=page.locator('.ch-preset-settings-panel');
 const grid=page.locator('.ch-preset-grid');
 const before=await grid.boundingBox();
 await trigger.hover();await panel.waitFor({state:'visible'});await page.waitForTimeout(300);
 const bounds=await card.boundingBox(),menu=await panel.boundingBox(),after=await grid.boundingBox();
 assert.ok(Math.abs(bounds.width-menu.width)<=1,'same card width');
 assert.ok(Math.abs(bounds.x-menu.x)<=1,'same card left edge');
 assert.ok(Math.abs(bounds.y+bounds.height-menu.y)<=1,'seam has no gap');
 assert.equal(before.width,after.width,'opening does not shrink gallery');
 assert.equal(before.height,after.height,'opening does not move gallery');
 checks.push(width+': attached geometry and unchanged grid');
 assert.equal(await panel.locator('.ch-preset-direction-tile:visible').count(),4);
 assert.equal(await panel.locator('.ch-preset-direction-tile svg:visible').count(),0);
 const left=panel.locator('[data-direction="left"]');await left.hover();await page.waitForTimeout(250);
 assert.ok((await left.boundingBox()).height<=26,'compact single-line menu rows');
 assert.equal(await panel.getAttribute('data-open'),'true');
 assert.equal(await page.evaluate(()=>window.fixtureCalls.filter(c=>/apply|expression|keyframe/.test(c.command)).length),0);
 await page.screenshot({path:resolve(output,'list-'+width+'.png')});
 await left.click();assert.equal(await left.getAttribute('aria-pressed'),'true');
 await panel.locator('.ch-preset-directions-toggle').click();
 assert.equal(await panel.locator('.ch-preset-direction-tile svg:visible').count(),4);
 await page.screenshot({path:resolve(output,'previews-'+width+'.png')});
 await page.keyboard.press('Escape');await panel.waitFor({state:'hidden'});
 assert.equal(await trigger.evaluate(el=>el===document.activeElement),true);
 checks.push(width+': hover bridge, draft, view all, Escape focus');
 await trigger.click();await panel.waitFor({state:'visible'});await page.keyboard.press('Escape');await trigger.click();await page.waitForTimeout(280);
 assert.equal(await panel.locator('.ch-preset-direction-tile').first().evaluate(el=>el===document.activeElement),true,'keyboard entry focuses a visible choice');
 assert.equal(await panel.getAttribute('data-open'),'true');
 await page.setViewportSize({width:width===720?360:720,height:720});await page.waitForTimeout(250);
 const resizedCard=await card.boundingBox(),resizedMenu=await panel.boundingBox();assert.ok(Math.abs(resizedCard.width-resizedMenu.width)<=1);
 assert.ok(await page.evaluate(()=>document.body.scrollWidth<=innerWidth));
 checks.push(width+': reversal, resize and no overflow');
 await page.keyboard.press('Escape');await panel.waitFor({state:'hidden'});
 await page.setViewportSize({width,height:280});await page.waitForTimeout(250);
 await trigger.scrollIntoViewIfNeeded();await page.waitForTimeout(150);
 await trigger.click();await panel.waitFor({state:'visible'});await page.waitForTimeout(250);
 const shortMenu=await panel.boundingBox();
 assert.ok(shortMenu.y>=0&&shortMenu.y+shortMenu.height<=280,'short dock contains menu');
 await page.screenshot({path:resolve(output,'short-'+width+'.png')});
 await page.keyboard.press('Escape');await panel.waitFor({state:'hidden'});
 await page.evaluate(()=>document.documentElement.setAttribute('data-reduced-motion','true'));
 await page.setViewportSize({width,height:720});await trigger.click();await panel.waitFor({state:'visible'});
 assert.equal(await panel.evaluate(el=>getComputedStyle(el).transform),'none');
 checks.push(width+': short dock stays contained and reduced motion');
 await page.close();
}
assert.deepEqual(errors,[]);
await writeFile(resolve(output,'results.json'),JSON.stringify({status:'PASS',checks,errors,adobeHost:'NOT RUN'},null,2));
console.log(JSON.stringify({status:'PASS',checks:checks.length}));
}finally{await browser.close();}
