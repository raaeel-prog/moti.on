/** Browser fixture only; never substitutes for AE runtime evidence. */
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
const runtime=process.argv[2]??'C:/Users/raaee/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const {chromium}=await import(pathToFileURL(resolve(runtime)).href);
const out=resolve('artifacts/particles-rising-20261031/browser');await mkdir(out,{recursive:true});
const built=await build({stdin:{resolveDir:process.cwd(),contents:`import {createParticlesEditor} from './apps/after-effects-cep/client/src/particles-editor.ts';import {createI18n} from './packages/ui-core/src/i18n.ts';window.mount=(locale)=>{window.editor?.dispose();document.body.replaceChildren();window.editor=createParticlesEditor(document,{i18n:createI18n({locale})});document.body.appendChild(window.editor.element);};`},bundle:true,format:'iife',platform:'browser',write:false});
const css=await readFile('dist/after-effects-cep/styles/theme.css','utf8');
const browser=await chromium.launch({headless:true}),page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(String(e)));const checks=[];
try{for(const locale of ['pt-BR','en-US'])for(const width of [280,360,480,720]){
 await page.setViewportSize({width,height:900});await page.setContent('<html data-theme="dark"><body data-host="after-effects"></body></html>');await page.addStyleTag({content:css+' body{margin:0;padding:12px;box-sizing:border-box;background:#121212;}'});await page.addScriptTag({content:built.outputFiles[0].text});await page.evaluate(locale=>window.mount(locale),locale);
 assert.equal(await page.locator('#particles-mode').inputValue(),'rising');await page.locator('[data-direction="90"]').click();assert.equal(await page.locator('#particles-direction').inputValue(),'90');
 await page.locator('#particles-direction').fill('225');await page.locator('#particles-direction').press('Enter');assert.equal(await page.evaluate(()=>window.editor.getArgs().direction),225);assert.equal(await page.locator('[data-direction="90"]').getAttribute('aria-pressed'),'false');
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);assert.equal(overflow,false,`${locale} ${width} overflow`);
 await page.screenshot({path:resolve(out,`${locale}-${width}.png`),fullPage:true});checks.push({locale,width,status:'PASS'});
 }assert.deepEqual(errors,[]);await writeFile(resolve(out,'result.json'),JSON.stringify({status:'PASS',checks,errors},null,2));console.log(JSON.stringify({status:'PASS',checks:checks.length}));}finally{await browser.close();}
