import {build} from 'esbuild';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),client=path.join(root,'dist/after-effects-cep/client');
const evidenceArg=process.argv.find(arg=>arg.startsWith('--evidence='));
const evidence=evidenceArg?path.resolve(root,evidenceArg.slice(11)):path.join(root,'artifacts/text-presets/ui-request-2026-10-13');
await mkdir(client,{recursive:true});await mkdir(evidence,{recursive:true});
await build({stdin:{contents:`import {createPresetGallery} from './apps/after-effects-cep/client/src/preset-gallery.ts';
const nav={category:'text',query:'',scope:'all',scroll:0,selectedId:'builtin.motion.text-v3-characters-position-rise',selectionExpanded:false};window.qaCalls=[];window.qaNavigation=nav;
const preferences={snapshot:()=>({favorites:[],recent:[],folderColors:{},collapsedFolders:[],presetAutoplay:false,presetSize:200})};
window.gallery=createPresetGallery(document,{locale:new URL(location.href).searchParams.get('locale')||'pt-BR',navigation:nav,preferences,context:()=>({hasComp:true,selectionCount:1,textLayers:1,fps:24,compWidth:480,compHeight:270,selectedKeys:0}),busy:false,apply:(...args)=>window.qaCalls.push(args),edit:()=>{},saveVariant:()=>({ok:true,message:'Saved'})});
document.querySelector('main').appendChild(window.gallery.element);`,resolveDir:root},bundle:true,format:'iife',platform:'browser',outfile:path.join(client,'text-qa.js')});
await writeFile(path.join(client,'text-qa.html'),'<!doctype html><html lang="pt-BR" data-theme="onyx"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="../styles/theme.css"><title>Moti.on text QA</title><body><main class="ch-shell" data-layout="library" style="width:100%;min-width:280px;height:100vh;padding:8px"></main><script src="text-qa.js"></script></body></html>');
const {chromium}=await import(process.env.MOTION_PLAYWRIGHT_MODULE||'file:///C:/Users/raaee/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright/index.mjs');
const browser=await chromium.launch({executablePath:process.env.MOTION_CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const page=await browser.newPage(),errors=[],rows=[];page.on('pageerror',error=>errors.push(String(error)));
try{
  for(const locale of ['pt-BR','en-US'])for(const [width,height] of [[280,640],[360,720],[480,800],[720,900],[360,360]]){
    await page.setViewportSize({width,height});await page.goto(`http://127.0.0.1:4178/after-effects-cep/client/text-qa.html?locale=${locale}`);await page.waitForSelector('.ch-preset-card');
    const initial=await page.locator('.ch-preset-grid').evaluate(node=>node.getBoundingClientRect().height);
    if(await page.locator('.ch-preset-editor').isVisible()||await page.locator('.ch-preset-applybar').isVisible())throw Error('Restored preset opened the lower area');
    for(const id of ['text-v3-characters-position-rise','text-v3-words-loop-wave','premium-glyph-constellation','text-v3-characters-combination-fold-ribbon-3d','text-v3-characters-loop-decode-spacing']){
      const card=page.locator(`[id="builtin.motion.${id}"]`);await card.locator('.ch-preset-preview').click();await page.waitForTimeout(200);
      const selectedGridHeight=await page.locator('.ch-preset-grid').evaluate(node=>node.getBoundingClientRect().height);
      await card.locator('.ch-preset-settings-trigger').scrollIntoViewIfNeeded();await page.waitForTimeout(100);await card.locator('.ch-preset-settings-trigger').click();
      const panel=page.locator('.ch-preset-settings-panel');
      if(id==='text-v3-characters-position-rise'||id==='text-v3-characters-combination-fold-ribbon-3d')await panel.locator('select').filter({has:page.locator('option[value="settle-wave"]')}).selectOption('settle-wave',{force:true});
      await page.waitForTimeout(300);
      const row=await page.evaluate(()=>{
        const doc=globalThis.document,panel=doc.querySelector('.ch-preset-settings-panel'),body=panel.querySelector('.ch-preset-settings-body'),box=panel.getBoundingClientRect();
        return {scrollWidth:doc.documentElement.scrollWidth,width:globalThis.innerWidth,height:globalThis.innerHeight,top:box.top,bottom:box.bottom,panelWidth:box.width,scroll:body.scrollHeight-body.clientHeight,columns:panel.dataset.columns,calls:globalThis.window.qaCalls.length,simulation:doc.querySelectorAll('.ch-text-preview').length,refinementInputs:body.querySelectorAll('.ch-preset-refine input').length};
      });
      row.locale=locale;row.preset=id;row.initialGridHeight=initial;row.selectedGridHeight=selectedGridHeight;
      row.pass=row.scrollWidth<=width+1&&row.top>=7&&row.bottom<=height-7&&row.simulation===0&&row.calls===0&&(height<420||row.scroll<=1);
      rows.push(row);await page.screenshot({path:path.join(evidence,`settings-${locale}-${width}x${height}-${id}.png`),fullPage:false});
      await page.getByRole('button',{name:locale==='pt-BR'?'Fechar ajustes':'Close settings',exact:true}).click();
      await page.getByRole('button',{name:locale==='pt-BR'?'Recolher ajustes do preset':'Collapse preset settings',exact:true}).click();
      if(await page.locator('.ch-preset-editor').isVisible()||await page.locator('.ch-preset-applybar').isVisible())throw Error('Collapse left the lower area visible');
    }
  }
}finally{await browser.close();}
const report={status:errors.length||rows.some(row=>!row.pass)?'FAIL':'PASS',scope:'Browser layout and interactions; no Adobe host calls. Standard heights must fit all fields; short docks use bounded content scrolling.',rows,errors};
await writeFile(path.join(evidence,'ui-qa.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
if(report.status!=='PASS')throw Error('Preset controls UI QA failed');
