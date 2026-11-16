/** Full production panel with explicit browser-only CEP/account fixtures.
 * No Adobe process is contacted. Screenshots and timings are not host proof. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {attachLicensedAccount} from './licensed-account-fixture.mjs';

const {chromium}=await import(pathToFileURL(process.argv[2]??'C:/Users/raaee/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);
const output=resolve('artifacts/ae-layout/browser');await mkdir(output,{recursive:true});
const scripts={before:await readFile('artifacts/ae-layout/baseline-main.js','utf8'),after:await readFile('dist/after-effects-cep/client/main.js','utf8')};
const styles={before:await readFile('artifacts/ae-layout/baseline-theme.css','utf8'),after:await readFile('dist/after-effects-cep/styles/theme.css','utf8')};
const browser=await chromium.launch({headless:true});
let page=await browser.newPage();
const errors=[],checks=[],timings={};
page.setDefaultTimeout(8000);
page.on('pageerror',error=>errors.push(String(error)));
const account=attachLicensedAccount.toString().replace('window.localStorage = { getItem: () => null, setItem() {} };','');
const fixture=`
window.fixtureCalls=[];
const fixtureStorage=new Map();Object.defineProperty(window,'localStorage',{value:{getItem:key=>fixtureStorage.get(key)??null,setItem:(key,value)=>fixtureStorage.set(key,String(value)),removeItem:key=>fixtureStorage.delete(key)}});
const fixtureContext={hostVersion:'26.5',projectName:'Browser fixture',projectPath:null,activeItemName:'Layout fixture',isComposition:true,compWidth:1920,compHeight:1080,compDuration:5,compFrameRate:30,currentTime:0,workAreaStart:0,workAreaDuration:5,selectionLayerCount:1,selectionTextLayerCount:1,selectionPropertyCount:1,selectionExpressibleCount:1,selectionSelectedKeyCount:2,selectionHasKeyframes:true,selectionHasExpressions:false,selectionIs3D:false,averageLayerDurationSeconds:5,selectionTruncated:false,selectionSignature:'browser-fixture'};
class CSInterface {
 getHostEnvironment(){return {appVersion:'26.5',appUILocale:'pt_BR'};}
 getSystemPath(){return '/browser-fixture';}
 addEventListener(){} removeEventListener(){} dispatchEvent(){}
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
async function mount(variant,width,height){
 console.log('Mount',variant,width,height);
 await page.setViewportSize({width,height});
 await page.goto('about:blank');
 await page.setContent('<!doctype html><html data-host="after-effects" lang="pt-BR"><head></head><body data-host="after-effects"><div id="root"></div></body></html>');
 await page.addStyleTag({content:styles[variant]});
 await page.addScriptTag({content:fixture});
 await page.addScriptTag({content:scripts[variant]});
 await page.locator('#library-tool-wiggle').waitFor();
 await page.waitForTimeout(350);
}
const shot=name=>page.screenshot({path:resolve(output,name+'.png')});
async function noOverflow(label){
 const bounds=await page.evaluate(()=>({viewport:innerWidth,body:document.body.scrollWidth,root:document.querySelector('.ch-shell').scrollWidth}));
 assert.ok(bounds.body<=bounds.viewport+1&&bounds.root<=bounds.viewport+1,label+': '+JSON.stringify(bounds));
 checks.push(label);
}
try{
 for(const variant of ['before','after']){
  for(const [width,height] of [[280,280],[280,640],[360,720],[480,800],[720,900]]){
   await mount(variant,width,height);await noOverflow(variant+' tools '+width+'x'+height);await shot(variant+'-tools-'+width+'x'+height);
   if(variant==='after')await page.locator('#library-adjust-wiggle').click();
   else{await page.locator('#library-options-wiggle').click();await page.locator('#library-edit-wiggle').click();}
   await page.locator('#wiggle-frequency').waitFor();await page.waitForTimeout(500);await noOverflow(variant+' inspector '+width+'x'+height);await shot(variant+'-inspector-'+width+'x'+height);
   if(variant==='after'){
    const applyBox=await page.locator('#tool-wiggle-apply').boundingBox();assert.ok(applyBox&&applyBox.y>=0&&applyBox.y+applyBox.height<=height,'tool action stays in the viewport');
    if(width>=720){assert.ok(await page.locator('.ch-context-library .ch-tool-grid').evaluate(el=>el.scrollHeight>el.clientHeight));const box=await page.locator('.ch-context-inspector').boundingBox();assert.equal(box.width,300);assert.ok(await page.locator('#library-tool-wiggle').isVisible());}
    await page.locator('#wiggle-frequency').fill('4.5');await page.locator('#wiggle-frequency').press('Tab');
    await page.setViewportSize({width:width>=720?360:720,height});assert.equal(await page.locator('#wiggle-frequency').inputValue(),'4.5');
    await page.setViewportSize({width,height});await page.locator('#tool-inspector-close').click();
    await page.locator('#library-adjust-wiggle').waitFor();
    await page.locator('#library-tool-wiggle').click();await page.waitForFunction(()=>window.fixtureCalls.some(call=>call.command==='ae.expression.wiggle'));
    assert.equal(await page.evaluate(()=>window.fixtureCalls.filter(call=>call.command==='ae.expression.wiggle').length),1);
   }
   const dismiss=page.locator('.ch-toast__dismiss');if(await dismiss.isVisible()){await dismiss.click();await page.waitForTimeout(250);}
   await page.locator('.ch-nav__item[data-view="presets"]').click();await page.locator('.ch-preset-card').first().waitFor();
   await noOverflow(variant+' gallery '+width+'x'+height);await shot(variant+'-presets-'+width+'x'+height);
   if(variant==='after'){
    await page.locator('.ch-preset-settings-trigger').first().click();
    await page.locator('.ch-preset-settings-panel').waitFor({state:'visible'});
    await page.waitForTimeout(250);await noOverflow('preset inspector '+width+'x'+height);await shot('after-preset-inspector-'+width+'x'+height);
    if(width>=720)assert.equal((await page.locator('.ch-preset-settings-panel').boundingBox()).width,300);
    await page.keyboard.press('Escape');await page.locator('.ch-preset-settings-panel').waitFor({state:'hidden'});
    await page.getByRole('tab',{name:'Editar',exact:true}).click();
    const workspace=page.locator('.ch-preset-workspace');await workspace.locator('[data-browse="false"]').waitFor({state:'visible'});
    assert.equal(await page.getByRole('tab',{name:'Navegar',exact:true}).isVisible(),true);
    assert.equal(await page.getByRole('tab',{name:'Editar',exact:true}).isVisible(),true);
    if(width>=720)assert.equal((await workspace.locator('.ch-preset-workspace-content:not(.ch-preset-workspace-browser)').boundingBox()).width,300);
    await noOverflow('layer editor '+width+'x'+height);await shot('after-layer-editor-'+width+'x'+height);
    await page.getByRole('tab',{name:'Navegar',exact:true}).click();
    assert.equal(await page.getByRole('tab',{name:'Navegar',exact:true}).evaluate(el=>el===document.activeElement),true);
   }
  }
  timings[variant]=[];
  await mount(variant,720,900);
  // One warm-up followed by five same-machine samples of local DOM work.
  for(let index=0;index<6;index++){
   console.log('Filter sample',variant,index);
   await page.locator('#library-category-select').click();
   const sample=await page.locator('#library-category-effects').evaluate(node=>{const start=performance.now();node.click();return performance.now()-start;});
   await page.locator('#library-category-select').click();await page.locator('#library-category-all').click();
   if(index)timings[variant].push(sample);
  }
 }
 await page.close();page=await browser.newPage({viewport:{width:280,height:640},deviceScaleFactor:2});page.setDefaultTimeout(8000);page.on('pageerror',error=>errors.push(String(error)));
 await mount('after',280,640);await noOverflow('200% display scale at 280 CSS px');await shot('after-tools-200-percent');
 assert.deepEqual(errors,[]);
 const median=values=>[...values].sort((a,b)=>a-b)[2];
 const before=median(timings.before),after=median(timings.after);
 assert.ok(after<=100,'local filter budget');
 // Frame-sized noise floor for sub-millisecond baseline work.
 const regression=before>=16?(after<=before*1.15?'PASS':'FAIL'):'INCONCLUSIVE';
 if(regression==='FAIL')throw Error('filter regression exceeds 15%');
 await writeFile(resolve(output,'results.json'),JSON.stringify({status:'PASS',hostRuntime:'NOT RUN',checks,timings,median:{before,after},performance:{absoluteBudget:'PASS',relativeRegression:regression,relativeNote:'Below one frame, percentages are sensitive to timer noise; raw five-run samples retained.'},threshold:{absoluteMs:100,regressionPercent:15,noiseFloorMs:16}},null,2));
 console.log(JSON.stringify({status:'PASS',checks:checks.length,median:{before,after},output}));
}catch(error){await shot('failure');await writeFile(resolve(output,'results.json'),JSON.stringify({status:'FAIL',error:String(error.stack),errors,checks,calls:await page.evaluate(()=>window.fixtureCalls)},null,2));throw error;}
finally{await browser.close();}
