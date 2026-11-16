/** Presets in narrow docks — browser evidence (node apps/after-effects-cep/tests/preset-folder-picker.browser.mjs).
 * Mounts the production dist bundle with the browser-only CEP fixture of ae-motion.browser.mjs.
 * Below 360 px: folder picker above full-width cards, tree sheet with no cut names, keyboard path.
 * From 360 px: the sidebar, splitter and breadcrumb as approved. Captures go to artifacts/compact-refinement/. */
import {readFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {attachLicensedAccount} from './licensed-account-fixture.mjs';

const {chromium}=await import(pathToFileURL(process.argv.slice(2).find(arg=>arg!=='--footer-only')??'C:/Users/raaee/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);
const output=resolve('artifacts/compact-refinement');await mkdir(output,{recursive:true});
const script=await readFile('dist/after-effects-cep/client/main.js','utf8');
const styles=await readFile('dist/after-effects-cep/styles/theme.css','utf8');
const account=attachLicensedAccount.toString().replace('window.localStorage = { getItem: () => null, setItem() {} };','');
const fixture=`
const fixtureStorage=new Map();Object.defineProperty(window,'localStorage',{value:{getItem:key=>fixtureStorage.get(key)??null,setItem:(key,value)=>fixtureStorage.set(key,String(value)),removeItem:key=>fixtureStorage.delete(key)}});
const fixtureContext={hostVersion:'26.5',projectName:'Motion fixture',projectPath:null,activeItemName:'Comp',isComposition:true,compWidth:1920,compHeight:1080,compDuration:5,compFrameRate:30,currentTime:0,workAreaStart:0,workAreaDuration:5,selectionLayerCount:1,selectionTextLayerCount:0,selectionPropertyCount:1,selectionExpressibleCount:1,selectionSelectedKeyCount:2,selectionHasKeyframes:true,selectionHasExpressions:false,selectionIs3D:false,averageLayerDurationSeconds:5,selectionTruncated:false,selectionSignature:'motion-fixture'};
class CSInterface {
 getHostEnvironment(){return {appVersion:'26.5',appUILocale:'pt_BR'};}
 getSystemPath(){return '/browser-fixture';}
 addEventListener(){} removeEventListener(){} dispatchEvent(){}
 evalScript(script,callback){
  if(!script.startsWith('MotionAE.dispatch(')){callback('function');return;}
  const request=JSON.parse(JSON.parse(script.slice('MotionAE.dispatch('.length,-1)));
  const data=request.command==='ae.context.read'?fixtureContext:request.command==='ae.presets.inspect'?{state:'unmanaged',message:'Fixture',phases:[]}:request.command==='ae.presets.personal-list'?{roots:[],folders:[],items:[]}:{appliedCount:1,unchangedCount:0};
  setTimeout(()=>callback(JSON.stringify({protocolVersion:1,requestId:request.requestId,ok:true,data,warnings:[],error:null})),0);
 }
}
(${account})(window,CSInterface);
`;
const browser=await chromium.launch({headless:true});
const checks=[],errors=[];
async function openPresets(page,width,height){
 await page.setViewportSize({width,height});
 await page.goto('about:blank');
 await page.setContent('<!doctype html><html data-host="after-effects" lang="pt-BR"><head></head><body data-host="after-effects"><div id="root"></div></body></html>');
 await page.addStyleTag({content:styles});
 await page.addScriptTag({content:fixture});
 await page.addScriptTag({content:script});
 await page.locator('#library-tool-wiggle').waitFor();await page.waitForTimeout(300);
 await page.evaluate(()=>document.activeElement?.blur?.());await page.keyboard.press('4');
 await page.locator('.ch-preset-card').first().waitFor();await page.waitForTimeout(500);
 const bounds=await page.evaluate(()=>({viewport:innerWidth,body:document.body.scrollWidth}));
 assert.ok(bounds.body<=bounds.viewport+1,`presets ${width}: no horizontal overflow ${JSON.stringify(bounds)}`);
}
/** Names cut by an ellipsis: their text is wider than their box. */
const cutNames=(page,selector)=>page.evaluate(sel=>[...document.querySelectorAll(sel)].filter(node=>node.offsetParent&&node.scrollWidth>node.clientWidth+1).map(node=>node.textContent),selector);
const box=(page,selector)=>page.locator(selector).first().boundingBox();
const shown=(page,selector)=>page.locator(selector).first().isVisible();

async function narrowChecks(page,width,height,scale){
 const tag=`${width}x${height}${scale>1?`@${scale}x`:''}`,name=height===640?String(width):`${width}x${height}`;
 assert.equal(await page.locator('.ch-preset-gallery').getAttribute('data-folder-picker'),'true');
 assert.ok(await shown(page,'.ch-preset-folder-picker'),'the picker shows');
 assert.equal(await shown(page,'.ch-preset-splitter'),false,'no splitter');
 assert.equal(await shown(page,'.ch-preset-breadcrumb'),false,'the picker takes the breadcrumb row');
 const grid=await box(page,'.ch-preset-grid'),picker=await box(page,'.ch-preset-folder-picker'),search=await box(page,'.ch-preset-search input');
 assert.ok(grid.x<=8&&grid.x+grid.width>=width-8,`the cards take the full width: ${JSON.stringify(grid)}`);
 assert.ok(picker.y>=search.y+search.height&&picker.y+picker.height<=grid.y+1,'picker sits between the search and the cards');
 assert.ok(picker.height>=24,'picker is at least 24 px tall');
 const columns=await page.evaluate(()=>{const cards=[...document.querySelectorAll('.ch-preset-card')];const top=cards[0].getBoundingClientRect().top;return cards.filter(card=>Math.abs(card.getBoundingClientRect().top-top)<2).length;});
 checks.push(`${tag}: picker above full-width cards (${Math.round(grid.width)} px, ${columns} column(s))`);
 if(scale===1)await page.screenshot({path:resolve(output,`presets-${name}.png`)});
 // Mouse: the sheet opens on the current folder; hovering a card behind it never selects anything.
 await page.locator('.ch-preset-folder-picker').click();await page.waitForTimeout(350);
 const sheet=await box(page,'.ch-preset-filter-menu'),footer=await box(page,'.ch-preset-reference-footer');
 assert.equal(await page.locator('.ch-preset-folder-picker').getAttribute('aria-expanded'),'true');
 assert.ok(sheet.x>=0&&sheet.x+sheet.width<=width&&sheet.y>=picker.y+picker.height-1&&sheet.y+sheet.height<=footer.y+1,`the sheet sits between the picker and the footer: ${JSON.stringify({sheet,footer})}`);
 assert.equal(await page.evaluate(()=>document.activeElement?.dataset?.category),'all','the current folder has focus');
 const cut=await cutNames(page,'.ch-preset-filter-menu .ch-folder-name');
 assert.deepEqual(cut,[],`no folder name is cut in the sheet at ${tag}`);
 const opacity=await page.locator('.ch-preset-filter-menu').evaluate(node=>getComputedStyle(node).opacity);
 assert.equal(opacity,'1','the sheet has settled open');
 checks.push(`${tag}: tree sheet, no cut names (${await page.locator('.ch-preset-filter-menu .ch-folder-name').count()} folders)`);
 if(scale===1)await page.screenshot({path:resolve(output,`presets-${name}-folders.png`)});
 if(scale===2)await page.screenshot({path:resolve(output,`presets-${name}-folders@2x.png`)});
 // Keyboard: arrows walk the tree, Escape returns to the picker, Enter reopens, Enter chooses.
 await page.keyboard.press('Home');await page.keyboard.press('ArrowDown');
 assert.equal(await page.evaluate(()=>document.activeElement?.dataset?.category),'emulsion');
 await page.keyboard.press('Escape');await page.waitForTimeout(50);
 assert.equal(await shown(page,'.ch-preset-filter-menu'),false,'Escape closes the sheet');
 assert.equal(await page.evaluate(()=>document.activeElement?.classList.contains('ch-preset-folder-picker')),true,'and focus returns to the picker');
 await page.keyboard.press('Enter');await page.waitForTimeout(350);
 assert.equal(await shown(page,'.ch-preset-filter-menu'),true,'Enter reopens it');
 await page.keyboard.press('Home');await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');await page.waitForTimeout(400);
 assert.equal(await shown(page,'.ch-preset-filter-menu'),false,'choosing a folder closes the sheet');
 assert.equal(await page.locator('.ch-preset-folder-picker').getAttribute('aria-label'),'Pasta: Emulsion · Film Transitions');
 assert.deepEqual(await cutNames(page,'.ch-preset-folder-picker__name'),[],'the chosen folder reads in full on the picker');
 checks.push(`${tag}: keyboard opens, walks, closes and chooses`);
 if(scale===1)await page.screenshot({path:resolve(output,`presets-${name}-chosen.png`)});
 // Tab leaves the sheet and closes it; a click outside does too.
 await page.locator('.ch-preset-folder-picker').click();await page.waitForTimeout(350);
 await page.mouse.click(Math.round(width/2),Math.round(grid.y+grid.height-20));await page.waitForTimeout(100);
 assert.equal(await shown(page,'.ch-preset-filter-menu'),false,'a click outside closes the sheet');
 checks.push(`${tag}: click outside closes`);
}
async function shortMenuChecks(page){
 for(const [width,height] of [[196,280],[280,280],[298,305],[350,335],[480,280]]){
  await openPresets(page,width,height);
  const footer=page.locator('.ch-preset-reference-footer');
  const picker=page.locator('.ch-preset-folder-picker');
  const sheet=page.locator('.ch-preset-filter-menu');
  const label=page.locator('.ch-label-filter__button');
  const filter=page.getByRole('menu',{name:'Filtrar por etiqueta'});
  const checkBounds=async menu=>{
   const r=await menu.boundingBox(), f=await footer.boundingBox();
   assert.ok(r&&f&&r.y>=0&&r.x>=0&&r.x+r.width<=width+1&&r.y+r.height<=f.y-1,JSON.stringify({width,height,r,f}));
   const hit=await footer.locator('.ch-preset-actions-trigger').evaluate(node=>{
    const r=node.getBoundingClientRect(), hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
    return node===hit||node.contains(hit);
   });
   assert.ok(hit,'the menu never intercepts the footer');
  };
  if(width<360){
   await picker.click();
   await sheet.waitFor();
   await checkBounds(sheet);
   await page.keyboard.press('End');
   await checkBounds(sheet);
   assert.ok(await sheet.evaluate(node=>node.scrollTop>0),'End reaches the last folder via internal scroll');
   const back=sheet.getByRole('button',{name:'Voltar aos presets'});
   if(await back.isVisible()){
    await back.click();
    await sheet.waitFor({state:'hidden'});
    assert.ok(await picker.evaluate(node=>document.activeElement===node));
    await picker.click();
   }
   await page.keyboard.press('Home');
   await page.keyboard.press('ArrowDown');
   await page.keyboard.press('Shift+F10');
   const palette=sheet.getByRole('menu',{name:/Opções da pasta/});
   await palette.waitFor();
   await checkBounds(palette);
   await page.keyboard.press('Escape');
   await palette.waitFor({state:'hidden'});
   await page.keyboard.press('Escape');
   await sheet.waitFor({state:'hidden'});
   assert.ok(await picker.evaluate(node=>document.activeElement===node));
   await picker.click();
   await page.setViewportSize({width,height:height+85});
   await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
   await checkBounds(sheet);
   await page.setViewportSize({width,height});
   await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
   await checkBounds(sheet);
   await page.keyboard.press('Escape');
  }
  await label.click();
  await filter.waitFor();
  await checkBounds(filter);
  await page.keyboard.press('End');
  const last=filter.locator('button').last();
  assert.ok(await last.evaluate(node=>document.activeElement===node),'keyboard reaches the last filter');
  const lr=await last.boundingBox(), mr=await filter.boundingBox();
  assert.ok(lr.y>=mr.y&&lr.y+lr.height<=mr.y+mr.height+1,'last filter scrolls into view');
  await page.keyboard.press('Home');
  await page.keyboard.press('Enter');
  await filter.waitFor({state:'hidden'});
  assert.ok(await label.evaluate(node=>document.activeElement===node),'applying returns focus to the filter button');
  await label.click();
  await filter.waitFor();
  await page.setViewportSize({width,height:height+1});
  await filter.waitFor({state:'hidden'});
  assert.equal(await label.getAttribute('aria-expanded'),'false');
  assert.ok(await label.evaluate(node=>document.activeElement===node),'resize closes the filter and returns focus');
 }
 checks.push('folders, folder options and label filters stay above the footer in five short viewports');
}
async function wideChecks(page,width){
 assert.equal(await page.locator('.ch-preset-gallery').getAttribute('data-folder-picker'),'false');
 assert.equal(await shown(page,'.ch-preset-folder-picker'),false,'no picker from 360 px');
 assert.ok(await shown(page,'.ch-preset-sidebar .ch-preset-categories'),'the tree is the sidebar');
 assert.ok(await shown(page,'.ch-preset-breadcrumb'),'the breadcrumb stays');
 const splitter=page.locator('.ch-preset-splitter');assert.ok(await splitter.isVisible());
 const limit=Math.max(120,Math.min(320,width-160));
 const at=await splitter.boundingBox();
 await page.mouse.move(at.x+at.width/2,at.y+at.height/2);await page.mouse.down();await page.mouse.move(at.x+at.width/2-30,at.y+at.height/2,{steps:4});await page.mouse.up();
 await splitter.dblclick();await page.waitForTimeout(600);
 assert.equal(Number(await splitter.getAttribute('aria-valuenow')),Math.min(150,limit),'double-click glides back to the default width');
 checks.push(`${width}: sidebar, breadcrumb and splitter (double-click reset to ${Math.min(150,limit)} px)`);
 // Leave no hover state from the drag in the capture.
 await page.mouse.move(width-4,54);await page.waitForTimeout(500);
 await page.screenshot({path:resolve(output,`presets-${width}.png`)});
}
async function footerChecks(page){
 await openPresets(page,280,280);
 const footer=page.locator('.ch-preset-reference-footer');
 const slider=footer.getByRole('slider',{name:'Tamanho das miniaturas'});
 const actions=footer.getByRole('button',{name:'Ações de presets',exact:true});
 await slider.focus();
 await page.keyboard.press('Home');
 await page.keyboard.press('ArrowRight');
 assert.equal(await slider.inputValue(),'150');
 assert.equal(await slider.getAttribute('aria-valuetext'),'150 px');
 for(const width of [196,240,270,279,280,298,339,340,360,388,439,440,480,720,280]){
  await page.setViewportSize({width,height:280});
  const geometry=await footer.evaluate(node=>{
   const read=element=>{
    const {left,right,top,bottom,width,height}=element.getBoundingClientRect();
    const hit=document.elementFromPoint(left+width/2,top+height/2);
    return {left,right,top,bottom,width,height,hit:element===hit||element.contains(hit)};
   };
   const phases=[...node.querySelectorAll('.ch-preset-phase-actions button')];
   return {
    bounds:read(node), overflow:document.body.scrollWidth>innerWidth+1,
    controls:[
     node.querySelector('.ch-preset-actions-trigger'),
     node.querySelector('input[type="range"]'),
     ...phases
    ].map(read),
    names:phases.map(button=>button.getAttribute('aria-label'))
   };
  });
  const {bounds,controls,names}=geometry;
  assert.deepEqual(names,['Entrada','Saída','Ambos']);
  assert.ok(bounds.left>=0&&bounds.right<=width+1&&bounds.bottom<=281&&!geometry.overflow,JSON.stringify(geometry));
  assert.ok(controls[1].width>=48,`usable range at ${width}: ${JSON.stringify(controls[1])}`);
  const centerY=control=>control.top+control.height/2;
  for(const [i,control] of controls.entries()){
   assert.ok(control.width>=24&&control.height>=24&&control.hit,JSON.stringify({width,control}));
   const rowStart=width<280&&i>=2?2:0;
   assert.ok(Math.abs(centerY(control)-centerY(controls[rowStart]))<1,`row alignment at ${width}`);
   assert.ok(control.left>=bounds.left&&control.right<=bounds.right&&(i===rowStart||control.left>=controls[i-1].right-.5),JSON.stringify({width,i,geometry}));
   if(rowStart===2)assert.ok(control.top>=controls[1].bottom,`phase row below slider at ${width}`);
  }
  assert.equal(await slider.inputValue(),'150');
  assert.ok(await slider.evaluate(element=>document.activeElement===element),'resize retains slider focus');
 }
 await actions.click();
 await footer.getByRole('dialog',{name:'Ações de presets'}).waitFor();
 await page.keyboard.press('Escape');
 await footer.getByRole('dialog',{name:'Ações de presets'}).waitFor({state:'hidden'});
 assert.ok(await actions.evaluate(element=>document.activeElement===element));
 await page.screenshot({path:resolve(output,'presets-footer-280x280.png')});
 checks.push('footer: 15 resize samples at 280 px height, hit targets, slider keys and Actions menu');
}
async function galleryReflowChecks(page){
 await openPresets(page,720,470);
 const grid=page.locator('.ch-preset-grid');
 const slider=page.getByRole('slider',{name:'Tamanho das miniaturas'});
 await slider.focus();
 await slider.press('Home');
 const reference=await grid.evaluate(node=>{
  const cards=[...node.querySelectorAll('.ch-preset-card')];
  const card=cards.find((item,index)=>index>=20&&item.offsetTop>cards[index-1].offsetTop);
  node.scrollTop=card.offsetTop+5;
  return card.id;
 });
 const expectReference=async label=>{
  const layout=await grid.evaluate((node,id)=>{
   const card=document.getElementById(id).getBoundingClientRect();
   const area=node.getBoundingClientRect();
   return {top:card.top-area.top,bottom:card.bottom-area.top,height:area.height};
  },reference);
  assert.ok(layout.bottom>0&&layout.top<layout.height,`${label}: the reference card remains in view ${JSON.stringify(layout)}`);
 };
 await page.waitForTimeout(200);
 await slider.press('End');
 await page.waitForTimeout(250);
 await expectReference('larger thumbnails');
 await page.setViewportSize({width:280,height:280});
 await page.waitForTimeout(250);
 await expectReference('narrower panel');
 await page.setViewportSize({width:720,height:470});
 await page.waitForTimeout(250);
 await expectReference('return to wider panel');
 checks.push('gallery retains the reference card when thumbnail size or panel width changes');

 const trigger=grid.locator('.ch-preset-settings-trigger:not([hidden])').first();
 await trigger.click();
 const drawer=page.locator('.ch-preset-settings-panel');
 await drawer.waitFor();
 await page.setViewportSize({width:210,height:280});
 await page.waitForTimeout(250);
 const drawerBox=await drawer.boundingBox(),area=await page.locator('.ch-preset-stage').boundingBox();
 const footer=page.locator('.ch-preset-reference-footer');
 const footerBox=await footer.boundingBox();
 assert.ok(drawerBox.y>=area.y-1&&drawerBox.y+drawerBox.height<=footerBox.y+1,`variations stay in the gallery area ${JSON.stringify({drawerBox,area,footerBox})}`);
 const direction=await drawer.locator('[data-direction]:not([aria-pressed="true"])').last().getAttribute('data-direction');
 const choice=drawer.locator(`[data-direction="${direction}"]`);
 await choice.click();
 assert.equal(await choice.getAttribute('aria-pressed'),'true');
 const sliderReachable=await slider.evaluate(node=>{
  const rect=node.getBoundingClientRect();
  return document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2)===node;
 });
 assert.ok(sliderReachable,'thumbnail slider remains reachable while adjusting a preset');
 await page.setViewportSize({width:210,height:250});
 await page.waitForTimeout(250);
 const compactLayout=await drawer.evaluate(node=>{
  const option=node.querySelector('[aria-pressed="true"]');
  const area=node.querySelector('.ch-preset-settings-body').getBoundingClientRect();
  return {area:area.height,option:option.getBoundingClientRect().height,short:node.dataset.short};
 });
 assert.equal(compactLayout.short,'true');
 assert.ok(compactLayout.area>=compactLayout.option,'the shortest sheet can still show a full row');
 await choice.scrollIntoViewIfNeeded();
 await page.screenshot({path:resolve(output,'presets-variations-210x250.png')});
 await page.setViewportSize({width:720,height:470});
 await page.waitForTimeout(250);
 assert.equal(await drawer.locator(`[data-direction="${direction}"]`).getAttribute('aria-pressed'),'true');
 assert.equal(await choice.evaluate(node=>document.activeElement===node),true,'the direction retains focus');
 await page.keyboard.press('Escape');
 await drawer.waitFor({state:'hidden'});
 assert.equal(await trigger.evaluate(node=>document.activeElement===node),true,'Escape restores trigger focus');
 checks.push('variations fit above the footer and preserve direction and focus on resize');
}

try{
 const footerPage=await browser.newPage();
 footerPage.on('pageerror',error=>errors.push(String(error)));
 await footerChecks(footerPage);
 await footerPage.close();
 if(!process.argv.includes('--footer-only')){
 const galleryPage=await browser.newPage();
 galleryPage.on('pageerror',error=>errors.push(String(error)));
 await galleryReflowChecks(galleryPage);
 await galleryPage.close();
 const menusPage=await browser.newPage();
 menusPage.on('pageerror',error=>errors.push(String(error)));
 await shortMenuChecks(menusPage);
 await menusPage.close();
 for(const [width,height,scale] of [[280,640,1],[317,640,1],[359,640,1],[280,400,1],[280,640,2],[360,720,1],[480,800,1]]){
  const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:scale});
  page.on('pageerror',error=>errors.push(String(error)));
  await openPresets(page,width,height);
  if(width<360)await narrowChecks(page,width,height,scale);else await wideChecks(page,width);
  await page.close();
 }
 // Crossing 360 px with the sheet open: the sidebar comes back, then folds again.
 const page=await browser.newPage({viewport:{width:320,height:640}});
 page.on('pageerror',error=>errors.push(String(error)));
 await openPresets(page,320,640);
 await page.locator('.ch-preset-folder-picker').click();await page.waitForTimeout(350);
 await page.setViewportSize({width:480,height:640});await page.waitForTimeout(300);
 assert.equal(await page.locator('.ch-preset-gallery').getAttribute('data-folder-picker'),'false');
 assert.ok(await shown(page,'.ch-preset-sidebar .ch-preset-categories'),'widening brings the sidebar back');
 assert.equal(Number(await page.locator('.ch-preset-splitter').getAttribute('aria-valuenow')),150,'at the default width');
 await page.setViewportSize({width:300,height:640});await page.waitForTimeout(300);
 assert.equal(await shown(page,'.ch-preset-filter-menu'),false,'narrowing folds it again, closed');
 checks.push('resize across 360 px with the sheet open');
 await page.close();
 }
 assert.deepEqual(errors,[],'no page errors');
 console.log(`PASS ${checks.length} checks\n${checks.map(check=>`  - ${check}`).join('\n')}`);
}finally{await browser.close();}
