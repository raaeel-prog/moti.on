import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {attachLicensedAccount} from './licensed-account-fixture.mjs';
import {chromium} from 'file:///C:/Users/raaee/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const account=attachLicensedAccount.toString().replace('window.localStorage = { getItem: () => null, setItem() {} };','');
const fixture=`
window.fixtureCalls=[];window.fixtureLocale='pt-BR';
const fixtureStorage=new Map();Object.defineProperty(window,'localStorage',{value:{getItem:key=>fixtureStorage.get(key)??null,setItem:(key,value)=>fixtureStorage.set(key,String(value)),removeItem:key=>fixtureStorage.delete(key)}});
window.fixtureContext={hostVersion:'26.5',projectName:'Browser fixture',projectPath:null,activeItemName:'UI fixture',isComposition:true,compWidth:1920,compHeight:1080,compDuration:5,compFrameRate:30,currentTime:0,workAreaStart:0,workAreaDuration:5,selectionLayerCount:1,selectionTextLayerCount:1,selectionPropertyCount:1,selectionExpressibleCount:1,selectionSelectedKeyCount:2,selectionHasKeyframes:true,selectionHasExpressions:false,selectionIs3D:false,averageLayerDurationSeconds:5,selectionTruncated:false,selectionSignature:'browser-fixture'};
window.fixtureInspection={state:'ready',message:'',layerName:'Título de teste',frameRate:30,presetId:'studio-letter-silk-rise',target:{compId:1,layerId:2,instance:'browser',fingerprint:'one'},options:{phase:'in',direction:'bottom',durationFrames:40,intensity:100,staggerFrames:2,unit:'preset',elasticity:35,overlap:70,speed:100},phases:[]};
window.fixtureInspection.phases=['in','out'].map(phase=>({phase,instance:'browser-'+phase,presetId:'studio-letter-silk-rise',markerTime:phase==='in'?0:4,options:{...window.fixtureInspection.options,phase},controls:[]}));
class CSInterface {
 getHostEnvironment(){return {appVersion:'26.5',appUILocale:'pt_BR',appSkinInfo:{panelBackgroundColorSRGB:{color:{red:50,green:50,blue:50}}}};}
 getSystemPath(){return '/browser-fixture';} addEventListener(){} removeEventListener(){} dispatchEvent(){}
 evalScript(script,callback){
  if(!script.startsWith('MotionAE.dispatch(')){callback('function');return;}
  const request=JSON.parse(JSON.parse(script.slice('MotionAE.dispatch('.length,-1)));window.fixtureCalls.push(request);
  if(request.command==='ae.presets.phase-adjust'){
   window.fixtureInspection.phases.find(phase=>phase.phase===request.args.phase).options={...request.args.options};window.fixtureInspection.target.fingerprint+='x';
  }
  const data=request.command==='ae.context.read'?window.fixtureContext:request.command==='ae.presets.inspect'?window.fixtureInspection:request.command==='ae.presets.personal-list'?{roots:[],folders:[],items:[]}: {appliedCount:1,unchangedCount:0};
  setTimeout(()=>callback(JSON.stringify({protocolVersion:1,requestId:request.requestId,ok:true,data,warnings:[],error:null})),0);
 }
}
(${account})(window,CSInterface);
`;
const output=resolve('artifacts/composer-ui/browser');await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true}),checks=[],errors=[];
try {
 for(const [width,height,scale] of [[280,640,1],[360,720,1],[480,800,1],[720,900,1],[280,280,1],[506,512,1.25],[506,512,1.5],[506,512,2]]) {
  const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:scale});page.setDefaultTimeout(8000);page.on('pageerror',e=>errors.push(String(e)));
  await page.setContent('<html data-host="after-effects" lang="pt-BR"><body data-host="after-effects"><div id="root"></div></body></html>');
  await page.addStyleTag({content:await readFile('dist/after-effects-cep/styles/theme.css','utf8')});
  await page.addScriptTag({content:fixture});await page.addScriptTag({content:await readFile('dist/after-effects-cep/client/main.js','utf8')});
  await page.locator('#library-tool-wiggle').waitFor();await page.locator('.ch-nav__item[data-view="presets"]').click();
  const grid=page.locator('.ch-preset-grid'),search=page.getByRole('searchbox',{name:'Buscar preset'}),summary=page.locator('.ch-preset-selection-summary');
  await grid.waitFor();await page.evaluate(()=>document.documentElement.setAttribute('data-reduced-motion','true'));
  await page.waitForTimeout(150);
  assert.equal(await page.locator('.ch-preset-result-count').innerText(),`${await page.locator('.ch-preset-card').count()} itens`);
  assert.equal(await page.locator('.ch-preset-phase-actions button:disabled').count(),3);
  const first=page.locator('.ch-preset-preview').first();await first.focus();await page.keyboard.press('ArrowRight');
  const selected=await page.locator('.ch-preset-card[data-selected="true"]').getAttribute('id');
  assert.equal(selected,await page.locator('.ch-preset-card').nth(1).getAttribute('id'));
  assert.equal(await page.locator('.ch-preset-settings-panel').isVisible(),false,'arrow keys only select');
  assert.ok(await summary.innerText());assert.equal(await page.evaluate(()=>window.fixtureCalls.filter(c=>c.command==='ae.presets.phase-apply').length),0);
  await page.keyboard.press('Home');assert.equal(await page.locator('.ch-preset-card[data-selected="true"]').getAttribute('id'),await page.locator('.ch-preset-card').first().getAttribute('id'));
  await page.screenshot({path:resolve(output,`browse-${width}x${height}-${scale}.png`)});
  await search.fill('missing-preset-xyz');await page.waitForTimeout(300);
  assert.equal(await page.locator('.ch-preset-result-count').innerText(),'0 itens');assert.match(await summary.textContent(),/Seleção fora do filtro/);
  await page.getByRole('button',{name:'Limpar filtros',exact:true}).click();await grid.waitFor();assert.equal(await search.inputValue(),'');
  await page.getByRole('tab',{name:'Editar',exact:true}).click();await page.locator('.ch-phase-instance').first().waitFor();
  assert.equal(await page.locator('.ch-preset-grid').count(),0,'Edit has no hidden gallery at any width');
  assert.equal(await page.locator('.ch-phase-instance').count(),2);
  const phase=page.locator('.ch-phase-instance[data-phase="in"]');
  const intensity=phase.getByRole('spinbutton',{name:'Entrada · Intensidade · %',exact:true});
  await intensity.fill('137.5');await page.keyboard.press('Enter');
  await page.waitForFunction(()=>window.fixtureCalls.some(c=>c.command==='ae.presets.phase-adjust'&&c.args.options.intensity===137.5));
  await page.locator('.ch-phase-instance[data-phase="in"]').getByRole('spinbutton',{name:'Entrada · Intensidade · %',exact:true}).waitFor();
  const disclosure=page.locator('.ch-phase-instance[data-phase="in"] .ch-number-disclosure').first();
  await disclosure.locator('button[aria-expanded]').click();
  assert.ok(await disclosure.locator('input[type="range"]').isVisible());
  await page.screenshot({path:resolve(output,`edit-${width}x${height}-${scale}.png`)});
  assert.ok(await page.evaluate(()=>document.body.scrollWidth<=innerWidth),'no horizontal overflow');
  await page.getByRole('tab',{name:'Navegar',exact:true}).click();await grid.waitFor();
  assert.equal(await page.locator('.ch-preset-card[data-selected="true"]').getAttribute('id'),await page.locator('.ch-preset-card').first().getAttribute('id'));
  const footer=await page.locator('.ch-preset-reference-footer').boundingBox();assert.ok(footer.y+footer.height<=height+1);
  checks.push({width,height,scale,browse:'PASS',edit:'PASS',keyboard:'PASS',filter:'PASS',numericCommit:'PASS',overflow:'PASS'});
  await page.close();
 }
 assert.deepEqual(errors,[]);
 await writeFile(resolve(output,'results.json'),JSON.stringify({status:'PASS',checks,errors,host:'NOT RUN — browser uses a command fixture'},null,2));
 console.log(JSON.stringify({status:'PASS',viewports:checks.length,checks:checks.length*6}));
}finally{await browser.close();}
