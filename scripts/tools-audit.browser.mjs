/** Browser-only panel checks. The explicit CEP/account fixture never contacts Adobe or a service. */
/* global window, document, innerWidth */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {attachLicensedAccount} from '../apps/after-effects-cep/tests/licensed-account-fixture.mjs';
const {chromium}=await import(pathToFileURL(process.argv.slice(2).find(arg=>!arg.startsWith('--'))??'C:/Users/raaee/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);
const out=path.resolve('artifacts/tools-audit/browser');await mkdir(out,{recursive:true});
const bundleRoot=path.resolve(process.env.TOOLS_AUDIT_BUNDLE_ROOT??'dist/after-effects-cep');
const bundle=await readFile(path.join(bundleRoot,'client/main.js'),'utf8'),css=await readFile(path.join(bundleRoot,'styles/theme.css'),'utf8');
const bundleSha256=createHash('sha256').update(bundle).digest('hex');
const errors=[],checks=[],browser=await chromium.launch({headless:true}),page=await browser.newPage();let currentRoute=null;
page.on('pageerror',e=>errors.push(String(e)));page.setDefaultTimeout(10000);
const context={hostVersion:'26.5',projectName:'Browser QA',projectPath:null,activeItemName:'QA',isComposition:true,compWidth:1920,compHeight:1080,compDuration:8,compFrameRate:30,currentTime:0,workAreaStart:0,workAreaDuration:8,selectionLayerCount:2,selectionTextLayerCount:2,selectionPropertyCount:1,selectionExpressibleCount:1,selectionSelectedKeyCount:2,selectionHasKeyframes:true,selectionHasExpressions:false,selectionIs3D:false,averageLayerDurationSeconds:8,selectionTruncated:false,selectionSignature:'browser'};
const fixture=`window.auditCalls=[];window.auditContext=${JSON.stringify(context)};
class CSInterface{getHostEnvironment(){return {appVersion:'26.5',appUILocale:'pt_BR'};}getSystemPath(){return '/fixture';}addEventListener(){}removeEventListener(){}evalScript(script,callback){if(!script.startsWith('MotionAE.dispatch(')){callback('function');return;}const request=JSON.parse(JSON.parse(script.slice('MotionAE.dispatch('.length,-1)));window.auditCalls.push(request);let data={appliedCount:1,unchangedCount:0};if(request.command==='ae.context.read')data=window.auditContext;else if(request.command==='ae.effect.gradient.read')data={settings:null,selectionToken:'browser',selectionCount:2,appliedCount:0,instances:[],mixedKeys:[],lockedKeys:[],capabilities:{nativeAvailable:true}};else if(request.command==='ae.presets.inspect')data={state:'unmanaged',phases:[]};else if(request.command==='ae.presets.personal-list')data={roots:[],folders:[],items:[]};else if(request.command==='ae.text.word-reveal.read')data={rigVersion:0,renderer:null,controls:null,wordCount:0,baked:false};else if(request.command==='ae.text.variable-morph.read')data={rigVersion:0,renderer:null,controls:null,glyphCount:0,baked:false};setTimeout(()=>callback(JSON.stringify({protocolVersion:1,requestId:request.requestId,ok:true,data,warnings:[],error:null})),0);}}
(${attachLicensedAccount.toString()})(window,CSInterface);`;
async function mount(width){await page.setViewportSize({width,height:800});await page.goto('about:blank');await page.setContent('<!doctype html><html data-host="after-effects" lang="pt-BR"><body data-host="after-effects"><div id="root"></div></body></html>');await page.addStyleTag({content:css});await page.addScriptTag({content:fixture});await page.addScriptTag({content:bundle});await page.locator('#library-tool-wiggle').waitFor();}
async function overflow(label){const bounds=await page.evaluate(()=>({width:innerWidth,body:document.body.scrollWidth}));assert.ok(bounds.body<=bounds.width+1,label+JSON.stringify(bounds));checks.push(label);}
function mutations(calls){return calls.filter(r=>!(/\.read$|\.preview$|\.inspect$/.test(r.command)) && !['ae.presets.personal-list','ae.layer.list','ae.capability.probe'].includes(r.command) && !(r.command==='ae.project.clean' && r.args.removeConfirmed===false));}
try{
 for(const width of [280,360,480,720]){
  for(const tool of ['wiggle','particles','gradient','parallax']){
   await mount(width);await page.locator('#library-tool-'+tool).click();
   const selector=tool==='parallax'?'#parallaxFull-operation':tool==='gradient'?'#gradient-animation':'#tool-'+tool+'-apply';await page.locator(selector).waitFor({state:'attached'});await page.waitForTimeout(180);
   const writes=await page.evaluate(()=>window.auditCalls.filter(r=>!(/\.read$|\.preview$|\.inspect$/.test(r.command)) && r.command!=='ae.presets.personal-list'));
   assert.deepEqual(writes,[],tool+' opening mutated the host');await overflow(tool+' '+width);
   await page.screenshot({path:path.join(out,tool+'-'+width+'.png')});
   if(tool==='particles'){await page.locator('#particles-mode').locator('..').locator('.ch-select-trigger').click();await page.getByRole('option',{name:'Campo 3D',exact:true}).click();await page.locator('.ch-particles-streams > summary').click();await overflow('field3d '+width);await page.screenshot({path:path.join(out,'particles-field3d-'+width+'.png')});}
   if(tool==='gradient'){assert.equal(await page.locator('#gradient-animation').inputValue(),'loop');}
  }
 }
 if(process.argv.includes('--all-tools'))for(const width of [280,360,480,720]){
  await mount(width);
  const ids=await page.locator('[id^="library-tool-"]').evaluateAll(nodes=>nodes.map(node=>node.id.slice('library-tool-'.length)));
  assert.equal(ids.length,44,'Visible library tool inventory changed.');
  for(const id of ids){
   for(const route of ['tool','adjust']){
    currentRoute={id,route,width};
    const before=await page.evaluate(()=>window.auditCalls.length);
    await page.locator('#library-'+route+'-'+id).click();await page.locator(id==='parallax'?'#parallaxFull-operation':'#tool-inspector-close').waitFor({state:id==='parallax'?'attached':'visible'});await page.waitForTimeout(180);
    const calls=await page.evaluate(start=>window.auditCalls.slice(start),before);assert.deepEqual(mutations(calls),[],id+'/'+route+' mutated the host while opening');
    await overflow('route '+route+' '+id+' '+width);
    if(id==='parallax')await page.getByRole('tab',{name:'Ferramentas',exact:true}).click();
    else {if(route==='tool')await page.keyboard.press('Escape');else await page.locator('#tool-inspector-close').click();await page.locator('#tool-inspector-close').waitFor({state:'detached'});}
   }
  }
 }
 assert.deepEqual(errors,[]);await writeFile(path.join(out,'result.json'),JSON.stringify({status:'PASS',completed:true,kind:'browser-only',bundleRoot,bundleSha256,checks,errors},null,2));console.log(JSON.stringify({status:'PASS',checks:checks.length}));
}catch(e){await page.screenshot({path:path.join(out,'route-failure.png')});await writeFile(path.join(out,'result.json'),JSON.stringify({status:'FAIL',completed:true,kind:'browser-only',bundleRoot,bundleSha256,currentRoute,checks,errors,error:String(e)},null,2));throw e;}finally{await browser.close();}
