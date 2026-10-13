import {build} from 'esbuild';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),client=path.join(root,'dist/after-effects-cep/client'),evidence=path.join(root,'artifacts/text-presets');
await mkdir(client,{recursive:true});
await build({stdin:{contents:`import {createPresetGallery} from './apps/after-effects-cep/client/src/preset-gallery.ts';
const nav={category:'text',query:'',scope:'all',scroll:0};window.qaCalls=[];
const preferences={snapshot:()=>({favorites:[],recent:[],folderColors:{},collapsedFolders:[],presetAutoplay:false,presetSize:200})};
window.gallery=createPresetGallery(document,{locale:new URL(location.href).searchParams.get('locale')||'pt-BR',navigation:nav,preferences,context:()=>({hasComp:true,selectionCount:1,textLayers:1,fps:24,compWidth:480,compHeight:270,selectedKeys:0}),busy:false,apply:(...args)=>window.qaCalls.push(args),edit:()=>{}});
document.querySelector('main').appendChild(window.gallery.element);`,resolveDir:root},bundle:true,format:'iife',platform:'browser',outfile:path.join(client,'text-qa.js')});
await writeFile(path.join(client,'text-qa.html'),'<!doctype html><html lang="pt-BR" data-theme="onyx"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="../styles/theme.css"><title>Moti.on text QA</title><body><main class="ch-shell" style="width:100%;min-width:280px;padding:8px"></main><script src="text-qa.js"></script></body></html>');
const {chromium}=await import(process.env.MOTION_PLAYWRIGHT_MODULE||'file:///C:/Users/raaee/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright/index.mjs');
const browser=await chromium.launch({executablePath:process.env.MOTION_CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
const rows=[];
try{
  for(const locale of ['pt-BR','en-US'])for(const width of [280,360,480,720]){
    await page.setViewportSize({width,height:960});await page.goto(`http://127.0.0.1:4178/after-effects-cep/client/text-qa.html?locale=${locale}`);await page.waitForSelector('.ch-preset-card');
    await page.locator('.ch-preset-card').filter({hasText:locale==='pt-BR'?'Cascata de luz':'Light cascade'}).first().locator('.ch-preset-preview').click();
    const sample=page.getByRole('textbox',{name:locale==='pt-BR'?'Texto de amostra':'Sample text'});await sample.fill('Ação 👩‍💻\nMoti.on');
    await page.getByRole('button',{name:locale==='pt-BR'?'Render AE':'AE render',exact:true}).click();await page.waitForTimeout(100);
    const row=await page.evaluate(()=>({scrollWidth:globalThis.document.documentElement.scrollWidth,width:globalThis.innerWidth,stage:globalThis.document.querySelector('.ch-text-preview-stage')?.getBoundingClientRect().width,video:globalThis.document.querySelector('.ch-text-preview-video')?.getAttribute('src'),calls:globalThis.window.qaCalls.length}));
    row.locale=locale;row.viewport=width;row.pass=row.scrollWidth<=width+1&&row.stage>0&&row.calls===0;
    rows.push(row);await page.screenshot({path:path.join(evidence,`text-ui-${locale}-${width}.png`),fullPage:false});
    await page.getByRole('button',{name:locale==='pt-BR'?'Simulação interativa':'Interactive simulation',exact:true}).click();
    if(await page.locator('.ch-text-preview-video').getAttribute('src'))throw Error('Hidden reference did not release media');
  }
}finally{await browser.close();}
const report={status:errors.length||rows.some(row=>!row.pass)?'FAIL':'PASS',scope:'Browser layout and interactions; no Adobe host calls',rows,errors};
await writeFile(path.join(evidence,'ui-qa.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
if(report.status!=='PASS')throw Error('Text UI QA failed');
