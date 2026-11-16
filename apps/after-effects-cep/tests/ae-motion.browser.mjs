/** AE motion upgrade — browser evidence per phase (node apps/after-effects-cep/tests/ae-motion.browser.mjs f0).
 * Mounts the production dist bundle with a browser-only CEP fixture (no Adobe process).
 * Playwright runs a modern Chromium: Chromium 99 limits are enforced by ae-css-runtime.test.mjs. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {attachLicensedAccount} from './licensed-account-fixture.mjs';

const phase=process.argv[2]??'f0';
const PHASES=['f0','f1','f2','f3','f4','f5','f6','f7','f8','f9'];
/** Every phase up to the requested one runs, so later phases keep the earlier evidence green. */
const reached=id=>PHASES.indexOf(id)<=PHASES.indexOf(phase);
const {chromium}=await import(pathToFileURL(process.argv[3]??'C:/Users/raaee/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);
const output=resolve('artifacts/ae-motion',phase);await mkdir(output,{recursive:true});
const script=await readFile('dist/after-effects-cep/client/main.js','utf8');
const styles=await readFile('dist/after-effects-cep/styles/theme.css','utf8');
const account=attachLicensedAccount.toString().replace('window.localStorage = { getItem: () => null, setItem() {} };','');
const fixture=`
window.fixtureCalls=[];
const fixtureStorage=new Map();Object.defineProperty(window,'localStorage',{value:{getItem:key=>fixtureStorage.get(key)??null,setItem:(key,value)=>fixtureStorage.set(key,String(value)),removeItem:key=>fixtureStorage.delete(key)}});
const fixtureContext={hostVersion:'26.5',projectName:'Motion fixture',projectPath:null,activeItemName:'Comp',isComposition:true,compWidth:1920,compHeight:1080,compDuration:5,compFrameRate:30,currentTime:0,workAreaStart:0,workAreaDuration:5,selectionLayerCount:1,selectionTextLayerCount:0,selectionPropertyCount:1,selectionExpressibleCount:1,selectionSelectedKeyCount:2,selectionHasKeyframes:true,selectionHasExpressions:false,selectionIs3D:false,averageLayerDurationSeconds:5,selectionTruncated:false,selectionSignature:'motion-fixture'};
class CSInterface {
 getHostEnvironment(){return {appVersion:'26.5',appUILocale:'pt_BR'};}
 getSystemPath(){return '/browser-fixture';}
 addEventListener(){} removeEventListener(){} dispatchEvent(){}
 evalScript(script,callback){
  if(!script.startsWith('MotionAE.dispatch(')){callback('function');return;}
  const request=JSON.parse(JSON.parse(script.slice('MotionAE.dispatch('.length,-1)));
  window.fixtureCalls.push(request);
  const data=request.command==='ae.context.read'?fixtureContext:request.command==='ae.presets.inspect'?{state:'unmanaged',message:'Fixture',phases:[]}:request.command==='ae.presets.personal-list'?{roots:[],folders:[],items:[]}:{appliedCount:1,unchangedCount:0};
  setTimeout(()=>callback(JSON.stringify({protocolVersion:1,requestId:request.requestId,ok:true,data,warnings:[],error:null})),0);
 }
}
(${account})(window,CSInterface);
`;
const browser=await chromium.launch({headless:true});
const checks=[],errors=[];
async function mount(page,width,height,reduced=false){
 await page.setViewportSize({width,height});
 await page.goto('about:blank');
 await page.setContent('<!doctype html><html data-host="after-effects" lang="pt-BR"><head></head><body data-host="after-effects"><div id="root"></div></body></html>');
 await page.addStyleTag({content:styles});
 await page.addScriptTag({content:fixture+(reduced?"localStorage.setItem('motion.ui.reduceMotion.v1','1');":'')});
 await page.addScriptTag({content:script});
 await page.locator('#library-tool-wiggle').waitFor();
 await page.waitForTimeout(400);
}
async function noOverflow(page,label){
 const bounds=await page.evaluate(()=>({viewport:innerWidth,body:document.body.scrollWidth}));
 assert.ok(bounds.body<=bounds.viewport+1,label+': '+JSON.stringify(bounds));
 checks.push(label);
}
/** Focus a control from the keyboard and report the focus-ring animation on it. */
async function focusRing(page){
 await page.locator('body').click({position:{x:2,y:2}});
 await page.keyboard.press('Tab');
 return page.evaluate(()=>{
  const active=document.activeElement;
  const names=active?active.getAnimations().map(animation=>animation.animationName):[];
  return {tag:active?.tagName,visible:active?.matches(':focus-visible'),names};
 });
}
const activeView=page=>page.evaluate(()=>document.querySelector('.ch-shell').getAttribute('data-view'));
const blur=page=>page.evaluate(()=>document.activeElement?.blur?.());
async function viewMotion(page,keyName){
 await page.keyboard.press(keyName);
 return page.evaluate(()=>{const body=document.querySelector('.ch-view-body');return {view:document.querySelector('.ch-shell').getAttribute('data-view'),direction:body.getAttribute('data-direction'),names:body.getAnimations().map(animation=>animation.animationName)};});
}
/** F1 — nav pill spring, directional views, 1–5 shortcuts, toast lift and stack shift. */
async function shellChecks(page){
 await page.waitForTimeout(100);
 const pill=await page.evaluate(()=>{const node=document.querySelector('.ch-nav__indicator');const style=getComputedStyle(node);return {ready:node.getAttribute('data-ready'),motion:node.getAttribute('data-motion'),timing:style.transitionTimingFunction,property:style.transitionProperty};});
 assert.equal(pill.ready,'true','the pill is ready once placed');
 assert.match(pill.motion,/selection-glide/);
 assert.match(pill.timing,/cubic-bezier\(0\.34, 1\.56, 0\.64, 1\)/,'the pill travels on the approved spring: '+JSON.stringify(pill));
 checks.push('nav pill spring');
 await blur(page);
 const forward=await viewMotion(page,'2');
 assert.deepEqual([forward.view,forward.direction],['ease','forward']);
 assert.ok(forward.names.includes('ch-ae-view-forward'),'ease enters from the right: '+JSON.stringify(forward));
 const parallax=await viewMotion(page,'3');
 assert.deepEqual([parallax.view,parallax.direction],['parallax','forward']);
 const back=await viewMotion(page,'1');
 assert.deepEqual([back.view,back.direction],['home','back']);
 assert.ok(back.names.includes('ch-ae-view-back'),'home enters from the left: '+JSON.stringify(back));
 const presets=await viewMotion(page,'4');
 assert.equal(presets.view,'presets');
 assert.ok(presets.names.includes('ch-ae-view-fade'),'presets only fades (fixed settings panel): '+JSON.stringify(presets));
 checks.push('directional views and 1–5 shortcuts');
 await blur(page);await page.keyboard.press('1');await page.waitForTimeout(300);
 await page.keyboard.press('Numpad3');
 assert.equal(await activeView(page),'home','the keypad never switches views');
 await page.evaluate(()=>{const input=document.createElement('input');input.id='zz-digits';document.body.appendChild(input);input.focus();});
 await page.keyboard.press('3');
 assert.equal(await activeView(page),'home','typing a digit in a field stays in the field');
 await page.evaluate(()=>document.getElementById('zz-digits').remove());
 await blur(page);await page.keyboard.press('Control+2');
 assert.equal(await activeView(page),'home','modified digits are not shortcuts');
 assert.equal(await page.locator('.ch-nav__item[data-view="parallax"]').getAttribute('aria-keyshortcuts'),'3');
 checks.push('shortcuts step aside for keypad, fields and modifiers');
 await page.waitForTimeout(500);
 const lift=await page.evaluate(()=>{const region=document.getElementById('app-toasts');const style=getComputedStyle(region);return {bottom:style.bottom,transform:style.transform,lift:getComputedStyle(document.documentElement).getPropertyValue('--ch-feedback-bottom').trim(),timing:style.transitionTimingFunction};});
 assert.equal(lift.bottom,'0px');
 const raised=Number(lift.transform.match(/matrix\(1, 0, 0, 1, 0, (-?[\d.]+)\)/)?.[1]);
 assert.ok(Math.abs(-raised-parseFloat(lift.lift))<=2,'the region rides the lift as a translate: '+JSON.stringify(lift));
 assert.ok(-raised>38,'on home the toasts sit above the Quick dock: '+JSON.stringify(lift));
 assert.match(lift.timing,/cubic-bezier\(0\.2, 0\.8, 0\.2, 1\)/,'the lift glides');
 checks.push('toast lift glides above the dock');
 const stack=await page.evaluate(async()=>{
  const region=document.getElementById('app-toasts');
  const frame=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  const make=text=>{const node=document.createElement('div');node.className='ch-toast';node.setAttribute('data-motion','toast-enter toast-exit');node.setAttribute('data-open','true');node.textContent=text;node.style.height='40px';region.appendChild(node);return node;};
  const sliding=node=>node.getAnimations().some(animation=>animation.transitionProperty==='transform');
  const first=make('first');await frame();await new Promise(resolve=>setTimeout(resolve,500));
  const entry=first.getAnimations().length;
  const second=make('second');await Promise.resolve();await Promise.resolve();
  const onArrival=sliding(first);
  const motion=first.getAttribute('data-motion');
  await new Promise(resolve=>setTimeout(resolve,500));
  second.remove();await Promise.resolve();await Promise.resolve();
  const onLeave=sliding(first);
  first.remove();
  return {entry,onArrival,onLeave,motion};
 });
 assert.equal(stack.entry,0,'a landed toast keeps no animation (fill backwards)');
 assert.ok(stack.onArrival&&stack.onLeave,'the stack slides when a toast arrives or leaves: '+JSON.stringify(stack));
 assert.match(stack.motion,/stack-shift/);
 checks.push('toast stack shifts smoothly');
}
/** F2 — rich tooltip (name, kbd, title borrowed), interface icons, masked shared glyphs, spring press. */
async function polishChecks(page){
 await blur(page);await page.keyboard.press('1');await page.waitForTimeout(400);
 const tab=page.locator('.ch-nav__item[data-view="parallax"]');
 await tab.hover();
 assert.equal(await tab.getAttribute('title'),null,'the native title is borrowed while hovered');
 await page.waitForTimeout(150);
 assert.equal(await page.locator('#rich-tooltip').getAttribute('data-open'),null,'a cold tip waits');
 await page.waitForTimeout(450);
 const shown=await page.evaluate(()=>{const tip=document.getElementById('rich-tooltip');const tab=document.querySelector('.ch-nav__item[data-view="parallax"]');const box=tip.getBoundingClientRect();return {open:tip.getAttribute('data-open'),name:tip.querySelector('strong')?.firstChild?.textContent,kbd:tip.querySelector('kbd')?.textContent,described:tab.getAttribute('aria-describedby'),inside:box.left>=7&&box.right<=innerWidth-7,below:box.top>=tab.getBoundingClientRect().bottom};});
 assert.deepEqual(shown,{open:'true',name:'Parallax',kbd:'3',described:'rich-tooltip',inside:true,below:true},'rich tip with the shortcut');
 await page.screenshot({path:resolve(output,'rich-tooltip-360.png')});
 await page.keyboard.press('Escape');
 assert.equal(await page.locator('#rich-tooltip').getAttribute('data-open'),null,'Escape dismisses the tip');
 await page.mouse.move(2,300);await page.waitForTimeout(50);
 assert.ok(await tab.getAttribute('title'),'the title comes back on leave');
 checks.push('rich tooltip');
 const press=await page.evaluate(()=>getComputedStyle(document.querySelector('.ch-nav__item')).transitionTimingFunction);
 assert.match(press,/cubic-bezier\(0\.34, 1\.56, 0\.64, 1\)/,'nav items release on the spring: '+press);
 await page.keyboard.press('2');await page.waitForTimeout(500);
 const ease=await page.evaluate(()=>{const star=document.querySelector('.ch-ease-star');const chevron=document.querySelector('.ch-select-trigger__chevron');return {starIcon:Boolean(star?.querySelector('.ch-ui-icon')),starText:star?.textContent,chevronMask:chevron?getComputedStyle(chevron,'::before').webkitMaskImage:'none-in-view',chevronFont:chevron?getComputedStyle(chevron).fontSize:'0px'};});
 assert.ok(ease.starIcon&&ease.starText==='','ease stars are icons, not glyphs: '+JSON.stringify(ease));
 if(ease.chevronMask!=='none-in-view')assert.match(ease.chevronMask,/data:image\/svg\+xml/,'shared chevrons are painted with the icon mask');
 assert.equal(ease.chevronFont,'0px');
 await page.screenshot({path:resolve(output,'ease-icons-360.png')});
 checks.push('interface icons');
 await page.keyboard.press('1');await page.waitForTimeout(400);
}
/** F3 — library: spring cascade with titles, tile lift, menu from origin with a sliding highlight, smooth keyboard scroll. */
async function libraryChecks(page){
 await blur(page);await page.keyboard.press('2');await page.waitForTimeout(350);await page.keyboard.press('1');
 await page.waitForTimeout(60);
 const cascade=await page.evaluate(()=>{const grid=document.querySelector('.ch-tool-grid');const tile=grid.querySelector('.ch-tool-tile[data-cascade="true"]');const title=grid.querySelector('.ch-tool-group-title');return {motion:grid.getAttribute('data-motion'),stagger:grid.getAttribute('data-stagger'),tile:tile?.getAnimations().map(a=>a.animationName),title:title?.getAnimations().map(a=>a.animationName)};});
 assert.equal(cascade.stagger,'true','home cascades on entry: '+JSON.stringify(cascade));
 assert.ok(cascade.tile?.includes('ch-ae-rise')&&cascade.title?.includes('ch-ae-view-rise'),'tiles and group titles rise in order: '+JSON.stringify(cascade));
 await page.waitForTimeout(1000);
 assert.equal(await page.locator('.ch-tool-grid').getAttribute('data-stagger'),'false','the cascade releases once played');
 checks.push('library cascade on the spring');
 const tile=page.locator('.ch-tool-tile > button[data-motion~="tile-hover"]').first();
 await tile.hover();await page.waitForTimeout(600);
 const lift=await tile.evaluate(node=>getComputedStyle(node).transform);
 assert.equal(lift,'matrix(1, 0, 0, 1, 0, -2)','tiles lift 2 px on hover');
 await page.mouse.move(2,300);
 checks.push('tile lift');
 const trigger=page.locator('#library-category-select');
 if(await trigger.count()){
  await trigger.click();await page.waitForTimeout(450);
  const menu=await page.evaluate(()=>{const menu=document.getElementById('library-menu');const glide=menu.querySelector('.ch-library-menu__glide');const checked=menu.querySelector('[aria-checked="true"]');return {open:menu.getAttribute('data-open'),glide:menu.getAttribute('data-glide'),origin:getComputedStyle(menu).transformOrigin,at:glide?.style.transform,checkedTop:checked?.offsetTop};});
  assert.equal(menu.open,'true');assert.equal(menu.glide,'true');
  assert.equal(menu.at,`translateY(${menu.checkedTop}px)`,'the highlight starts on the current option: '+JSON.stringify(menu));
  const third=page.locator('#library-menu .ch-button').nth(2);
  await third.hover();await page.waitForTimeout(500);
  const moved=await page.evaluate(()=>{const menu=document.getElementById('library-menu');const glide=menu.querySelector('.ch-library-menu__glide');const third=menu.querySelectorAll('.ch-button')[2];return {at:glide.style.transform,top:third.offsetTop,timing:getComputedStyle(glide).transitionTimingFunction};});
  assert.equal(moved.at,`translateY(${moved.top}px)`,'the highlight follows the pointer');
  assert.match(moved.timing,/cubic-bezier\(0\.34, 1\.56, 0\.64, 1\)/);
  await page.screenshot({path:resolve(output,'library-menu-360.png')});
  await page.keyboard.press('Escape');await page.waitForTimeout(300);
  checks.push('menu from origin with sliding highlight');
 }
 const scrolled=await page.evaluate(async()=>{
  const grid=document.querySelector('.ch-tool-grid');grid.scrollTop=0;
  const box=grid.getBoundingClientRect();
  const nodes=[...grid.querySelectorAll('.ch-tool-tile > button[id^="library-tool-"]')];
  const hidden=nodes.findIndex(node=>node.getBoundingClientRect().top>box.bottom);
  if(hidden<1)return {skipped:true};
  nodes[hidden-1].parentNode.querySelector('.ch-tool-adjust').focus();
  return {skipped:false,id:nodes[hidden].id};
 });
 if(!scrolled.skipped){
  await page.keyboard.press('Tab');
  const during=await page.evaluate(()=>({active:document.activeElement.id,gliding:document.querySelector('.ch-tool-grid').getAttribute('data-programmatic-scroll')}));
  assert.deepEqual(during,{active:scrolled.id,gliding:'true'},'keyboard focus scrolls the grid smoothly');
  await page.waitForTimeout(600);
  assert.ok(await page.evaluate(()=>document.querySelector('.ch-tool-grid').scrollTop>0));
  checks.push('smooth keyboard scroll');
 }
}
/** F4 — sliding inspector: sheet over the library with a scrim below 720 px, column above; quiet library; animated close. */
async function inspectorChecks(page,width){
 const height=page.viewportSize().height;
 await blur(page);await page.keyboard.press('1');await page.waitForTimeout(1100);
 await page.locator('#library-adjust-wiggle').click();
 await page.locator('#wiggle-frequency').waitFor();
 const opened=await page.evaluate(()=>{const inspector=document.querySelector('.ch-context-inspector');const grid=document.querySelector('.ch-context-library .ch-tool-grid');return {role:inspector.getAttribute('role'),modal:inspector.getAttribute('aria-modal'),names:inspector.getAnimations().map(a=>a.animationName),width:Math.round(inspector.getBoundingClientRect().width),gridShown:getComputedStyle(grid).display!=='none',gridStagger:grid.getAttribute('data-stagger'),body:document.querySelector('.ch-view-body').getAnimations().length};});
 await page.waitForTimeout(500);
 const scrim=await page.evaluate(()=>{const node=document.querySelector('.ch-context-scrim');return node?{open:node.getAttribute('data-open'),opacity:getComputedStyle(node).opacity,display:getComputedStyle(node).display}:null;});
 if(width<720){
  assert.deepEqual([opened.role,opened.modal],['dialog','true'],'below 720 px the inspector is a modal sheet');
  assert.ok(opened.names.includes('ch-ae-sheet-in'),'the sheet slides in: '+JSON.stringify(opened));
  assert.equal(opened.width,Math.max(280,Math.min(360,width-48)),'sheet width max(280, min(360, 100% − 48))');
  assert.ok(opened.gridShown,'the library stays on screen under the scrim');
  assert.equal(scrim.open,'true');assert.ok(Number(scrim.opacity)>0.9);
  await page.screenshot({path:resolve(output,`inspector-sheet-${width}.png`)});
  await page.keyboard.press('Shift+Tab');await page.keyboard.press('Shift+Tab');
  assert.ok(await page.evaluate(()=>document.querySelector('.ch-context-inspector').contains(document.activeElement)),'focus stays in the sheet');
  await page.keyboard.press('2');
  assert.equal(await activeView(page),'tools','the open sheet keeps the digit keys');
 }else{
  assert.equal(opened.role,null,'from 720 px the inspector is a column');
  assert.equal(opened.width,300);
  assert.ok(opened.names.includes('ch-ae-view-forward'),'the column slides in 12 px: '+JSON.stringify(opened));
  assert.equal(scrim.display,'none');
  await page.screenshot({path:resolve(output,`inspector-column-${width}.png`)});
 }
 assert.notEqual(opened.gridStagger,'true','the library behind the inspector does not cascade again');
 assert.equal(opened.body,0,'home → tools does not slide the whole view');
 await page.locator('#tool-inspector-close').focus();
 await page.keyboard.press('Escape');
 const closing=await page.evaluate(()=>({closing:document.querySelector('.ch-context-inspector')?.getAttribute('data-closing'),names:document.querySelector('.ch-context-inspector')?.getAnimations().map(a=>a.animationName)}));
 assert.equal(closing.closing,'true','Esc plays the exit before leaving');
 await page.waitForTimeout(400);
 const back=await page.evaluate(()=>({view:document.querySelector('.ch-shell').getAttribute('data-view'),focus:document.activeElement?.id,stagger:document.querySelector('.ch-tool-grid').getAttribute('data-stagger')==='true',body:document.querySelector('.ch-view-body').getAnimations().length}));
 assert.deepEqual(back,{view:'home',focus:'library-adjust-wiggle',stagger:false,body:0},'back home quietly with focus on the adjust button');
 if(width<720&&width-Math.max(280,Math.min(360,width-48))>=24){
  await page.locator('#library-adjust-wiggle').click();await page.locator('#wiggle-frequency').waitFor();await page.waitForTimeout(450);
  await page.mouse.click(10,height/2);await page.waitForTimeout(400);
  assert.equal(await activeView(page),'home','a click on the scrim closes the sheet');
 }
 checks.push(`inspector ${width<720?'sheet':'column'} ${width}`);
}
/** F5 — command palette: Ctrl+K, ranked results, sliding highlight, Enter / Shift+Enter, Esc returns focus, recents. */
async function paletteChecks(page){
 await blur(page);await page.keyboard.press('1');await page.waitForTimeout(400);
 const trigger=page.locator('#nav-command-palette');
 assert.equal(await trigger.getAttribute('aria-keyshortcuts'),'Control+K');
 await trigger.focus();
 await page.keyboard.press('Control+k');
 const opened=await page.evaluate(()=>{const dialog=document.getElementById('command-palette');return {hidden:dialog.hidden,modal:dialog.getAttribute('aria-modal'),focus:document.activeElement.id,names:dialog.getAnimations().map(a=>a.animationName),groups:[...dialog.querySelectorAll('.ch-palette__group')].map(node=>node.textContent)};});
 assert.equal(opened.hidden,false);assert.equal(opened.modal,'true');assert.equal(opened.focus,'command-palette-input');
 assert.ok(opened.names.includes('ch-ae-palette-in'),'the palette drops in on the spring: '+JSON.stringify(opened));
 assert.deepEqual(opened.groups,['Telas','Ferramentas','Ações rápidas','Ajustes'],'empty query lists every kind');
 await page.keyboard.type('wig');
 const typed=await page.evaluate(()=>{const first=document.querySelector('.ch-palette__option');const glide=document.querySelector('.ch-palette__glide');return {first:first?.querySelector('.ch-palette__title').textContent,selected:first?.getAttribute('aria-selected'),active:document.getElementById('command-palette-input').getAttribute('aria-activedescendant'),glide:glide.style.transform,top:first?.offsetTop,cascade:[...document.querySelectorAll('.ch-palette__option')].some(node=>node.getAnimations().length)};});
 assert.equal(typed.first,'Wiggle');assert.equal(typed.selected,'true');assert.equal(typed.active,'command-palette-option-0');
 assert.equal(typed.glide,`translateY(${typed.top}px)`,'the highlight sits on the active result');
 assert.equal(typed.cascade,false,'results never cascade while typing');
 await page.waitForTimeout(450);await page.screenshot({path:resolve(output,'palette-360.png')});
 await page.keyboard.press('Escape');await page.waitForTimeout(300);
 assert.deepEqual(await page.evaluate(()=>({hidden:document.getElementById('command-palette').hidden,focus:document.activeElement.id})),{hidden:true,focus:'nav-command-palette'},'Esc closes and gives focus back');
 checks.push('palette opens, ranks and closes');
 await page.keyboard.press('Control+k');await page.keyboard.type('parallax');await page.keyboard.press('Enter');await page.waitForTimeout(400);
 assert.equal(await activeView(page),'parallax','Enter runs the view command');
 await page.keyboard.press('Control+k');await page.keyboard.type('wiggle');await page.keyboard.press('Shift+Enter');
 await page.locator('#wiggle-frequency').waitFor();
 assert.equal(await activeView(page),'tools','Shift+Enter opens the adjustments');
 await page.waitForTimeout(450);
 await page.keyboard.press('Control+k');await page.keyboard.type('flicker');await page.keyboard.press('Shift+Enter');
 await page.waitForTimeout(100);
 const swapped=await page.evaluate(()=>document.querySelector('.ch-context-inspector').getAttribute('data-swap'));
 assert.equal(swapped,'true','another tool replaces the open one with a crossfade');
 await page.waitForTimeout(350);
 await page.locator('#tool-inspector-close').click();
 const exit=await page.evaluate(()=>document.querySelector('.ch-context-inspector').getAnimations().map(a=>a.animationName));
 assert.deepEqual(exit,['ch-ae-sheet-out'],'closing after a swap plays the exit, not the crossfade');
 await page.waitForTimeout(400);
 await page.keyboard.press('Control+k');
 const recent=await page.evaluate(()=>[...document.querySelectorAll('.ch-palette__group')].map(node=>node.textContent)[0]);
 assert.equal(recent,'Recentes','recent commands come first');
 await page.keyboard.press('ArrowDown');
 const moved=await page.evaluate(()=>document.getElementById('command-palette-input').getAttribute('aria-activedescendant'));
 assert.equal(moved,'command-palette-option-1','↓ moves the active result');
 await page.keyboard.press('Control+k');await page.waitForTimeout(300);
 assert.equal(await page.evaluate(()=>document.getElementById('command-palette').hidden),true,'Ctrl+K toggles it closed');
 checks.push('palette runs commands, recents and keyboard');
 await blur(page);await page.keyboard.press('1');await page.waitForTimeout(400);
}
/** F6 — curve editor: presets morph the handles, the name slides in, handles spring on hover. */
async function curveChecks(page){
 await blur(page);await page.keyboard.press('2');await page.waitForTimeout(500);
 const presets=page.locator('.ch-ease-preset');
 if(await presets.count()<2){checks.push('curve morph SKIPPED (no ease library in this width)');await page.keyboard.press('1');return;}
 await presets.nth(0).click();await page.waitForTimeout(500);
 const before=await page.evaluate(()=>[...document.querySelectorAll('.ch-curve__handle')].map(node=>node.getAttribute('cx')+','+node.getAttribute('cy')).join(' '));
 await presets.nth(3).click();await page.waitForTimeout(60);
 const during=await page.evaluate(()=>[...document.querySelectorAll('.ch-curve__handle')].map(node=>node.getAttribute('cx')+','+node.getAttribute('cy')).join(' '));
 await page.waitForTimeout(450);
 const after=await page.evaluate(()=>[...document.querySelectorAll('.ch-curve__handle')].map(node=>node.getAttribute('cx')+','+node.getAttribute('cy')).join(' '));
 assert.notEqual(after,before,'the preset changed the curve');
 assert.ok(during!==after&&during!==before,'the handles travel between the curves: '+JSON.stringify({before,during,after}));
 const name=await page.evaluate(()=>document.querySelector('.ch-ease-curve-name [data-motion~="text-swap"]')?.textContent??null);
 assert.ok(name,'the curve name slides in');
 const timing=await page.evaluate(()=>getComputedStyle(document.querySelector('.ch-curve__handle')).transitionTimingFunction);
 assert.match(timing,/cubic-bezier\(0\.34, 1\.56, 0\.64, 1\)/,'handles settle on the spring');
 checks.push('curve morph, name swap, handle spring');
 await page.keyboard.press('1');await page.waitForTimeout(400);
}
/** F7 — presets: sliding tab underline, folders rising in, splitter grip and double-click reset. */
async function presetChecks(page){
 await blur(page);await page.keyboard.press('4');await page.locator('.ch-preset-card').first().waitFor();await page.waitForTimeout(500);
 const tabs=await page.evaluate(()=>{const glide=document.querySelector('.ch-preset-tabs__glide');const selected=document.querySelector('.ch-preset-tabs [aria-selected="true"]');return glide&&selected?{at:glide.style.transform,left:selected.offsetLeft,width:glide.style.width,w:selected.offsetWidth}:null;});
 assert.ok(tabs,'the tabs have one sliding underline');
 assert.equal(tabs.at,`translateX(${tabs.left}px)`);assert.equal(tabs.width,`${tabs.w}px`);
 checks.push('preset tab underline');
 const toggle=page.locator('.ch-folder-toggle[aria-expanded]').first();
 if(await toggle.count()){
  if(await toggle.getAttribute('aria-expanded')==='true'){await toggle.click();await page.waitForTimeout(100);}
  await page.locator('.ch-folder-toggle[aria-expanded="false"]').first().click();
  const rise=await page.evaluate(()=>{const rows=[...document.querySelectorAll('.ch-preset-categories > [data-cascade="true"]')];return {count:rows.length,names:rows[0]?.getAnimations().map(a=>a.animationName)??[]};});
  assert.ok(rise.count>0&&rise.names.includes('ch-ae-view-rise'),'opened folder rows rise in: '+JSON.stringify(rise));
  checks.push('folders open with a rise');
 }
 const splitter=page.locator('.ch-preset-splitter');
 if(await splitter.isVisible()){
  const box=await splitter.boundingBox();
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+40,box.y+box.height/2,{steps:4});
  assert.equal(await splitter.getAttribute('data-dragging'),'true','the grip shows it is held');
  await page.mouse.up();
  assert.equal(await splitter.getAttribute('data-dragging'),null);
  await splitter.dblclick();await page.waitForTimeout(600);
  assert.equal(await splitter.getAttribute('aria-valuenow'),'228','double-click glides back to the default width');
  checks.push('splitter drag and double-click reset');
 }
 await page.screenshot({path:resolve(output,'presets-720.png')});
 await page.keyboard.press('Escape');await blur(page);await page.keyboard.press('1');await page.waitForTimeout(400);
}
/** F8 — chip ring slides between chips across redraws, camera cards lift, toggles pop, Settings sections rise, gradient stops snap. */
async function surfaceChecks(page){
 await blur(page);await page.keyboard.press('3');await page.waitForTimeout(600);
 const segments=await page.evaluate(()=>document.querySelector('.ch-parallax-segments > .ch-chip-glide')?.style.transform??null);
 assert.ok(segments,'the Parallax segments have a sliding ring');
 const other=page.locator('.ch-parallax-segments .ch-chip[aria-selected="false"]').first();
 await other.click();await page.waitForTimeout(40);
 const segment=await page.evaluate(()=>{const glide=document.querySelector('.ch-parallax-segments > .ch-chip-glide');const chip=document.querySelector('.ch-parallax-segments .ch-chip[aria-selected="true"]');return {ready:glide.getAttribute('data-ready'),at:glide.style.transform,target:`translate(${chip.offsetLeft}px, ${chip.offsetTop}px)`};});
 assert.deepEqual([segment.at,segment.ready],[segment.target,'true'],'after the redraw the ring travels from the old segment: '+JSON.stringify(segment));
 checks.push('segment ring slides across redraws');
 await page.waitForTimeout(500);
 const camera=page.locator('#parallax-segment-camera');
 if(await camera.count()&&await camera.getAttribute('aria-selected')!=='true'){await camera.click();await page.waitForTimeout(500);}
 const intents=page.locator('.ch-camera-intents .ch-chip');
 if(await intents.count()<=2)checks.push('camera chips SKIPPED (not rendered in fixture)');
 if(await intents.count()>2){
  await page.waitForTimeout(100);
  const before=await page.evaluate(()=>document.querySelector('.ch-camera-intents > .ch-chip-glide')?.style.transform??null);
  assert.ok(before,'the intent chips have a ring');
  await intents.nth(2).click();await page.waitForTimeout(40);
  const moving=await page.evaluate(()=>{const glide=document.querySelector('.ch-camera-intents > .ch-chip-glide');const chip=document.querySelector('.ch-camera-intents .ch-chip[data-active="true"]');return {ready:glide.getAttribute('data-ready'),at:glide.style.transform,target:`translate(${chip.offsetLeft}px, ${chip.offsetTop}px)`,timing:getComputedStyle(glide).transitionTimingFunction};});
  assert.equal(moving.at,moving.target,'the ring heads to the new chip');
  assert.equal(moving.ready,'true','it travels (redrawn group starts at the old place)');
  assert.match(moving.timing,/cubic-bezier\(0\.34, 1\.56, 0\.64, 1\)/);
  checks.push('chip ring slides across redraws');
  const card=page.locator('.ch-camera-card').first();
  await card.hover();await page.waitForTimeout(600);
  assert.equal(await card.evaluate(node=>getComputedStyle(node).transform),'matrix(1, 0, 0, 1, 0, -2)','camera cards lift on hover');
  await page.mouse.move(2,300);
  checks.push('camera cards lift');
 }
 await blur(page);await page.keyboard.press('5');await page.waitForTimeout(60);
 const settings=await page.evaluate(()=>{const sections=[...document.querySelectorAll('.ch-settings > [data-cascade="true"]')];return {count:sections.length,names:sections[1]?.getAnimations().map(a=>a.animationName)??[],account:document.querySelector('.ch-view-body > .ch-account, .ch-view-body > [data-cascade="true"]')?.getAttribute('data-cascade')};});
 assert.ok(settings.count>=3&&settings.names.includes('ch-ae-view-rise'),'Settings sections rise in on arrival: '+JSON.stringify(settings));
 await page.waitForTimeout(900);
 checks.push('settings sections rise in');
 const pop=await page.evaluate(()=>{const box=document.createElement('input');box.type='checkbox';box.id='zz-pop';document.querySelector('.ch-settings').appendChild(box);box.click();const names=box.getAnimations().map(a=>a.animationName);box.remove();return names;});
 assert.ok(pop.includes('ch-ae-pop-soft'),'a flipped checkbox pops: '+JSON.stringify(pop));
 checks.push('toggle pop');
 await blur(page);await page.keyboard.press('1');await page.waitForTimeout(500);
 const gradient=page.locator('#library-adjust-gradient');
 if(await gradient.count()){
  await gradient.click();
  const stop=page.locator('#gradient-stop-2-enabled');
  if(await stop.count().catch(()=>0)&&await stop.isVisible().catch(()=>false)){
   const marker=page.locator('.ch-gradient-marker[data-slot="2"]');
   const was=await stop.isChecked();
   await stop.click();await page.waitForTimeout(30);
   assert.equal(await marker.getAttribute('data-pop'),was?'out':'in','a stop snaps in or shrinks out');
   await page.waitForTimeout(500);
   assert.equal(await marker.isHidden(),was,'and ends hidden or shown');
   checks.push('gradient stops snap and shrink');
  }else checks.push('gradient stops SKIPPED (section closed in fixture)');
  await page.locator('#tool-inspector-close').click();await page.waitForTimeout(400);
 }
}
/** F9 — every view (and the palette and inspector) at every width: no horizontal overflow, new controls ≥ 24 px. */
async function matrixChecks(page,width,height){
 for(const [key,view] of [['2','ease'],['3','parallax'],['4','presets'],['5','settings'],['1','home']]){
  await blur(page);await page.keyboard.press(key);await page.waitForTimeout(450);
  assert.equal(await activeView(page),view);
  await noOverflow(page,`matrix ${view} ${width}x${height}`);
 }
 await page.keyboard.press('Control+k');await page.keyboard.type('a');await page.waitForTimeout(450);
 const palette=await page.evaluate(()=>{const box=document.getElementById('command-palette').getBoundingClientRect();const option=document.querySelector('.ch-palette__option')?.getBoundingClientRect();return {left:box.left,right:box.right,bottom:box.bottom,option:option?Math.round(option.height):0};});
 assert.ok(palette.left>=0&&palette.right<=width&&palette.bottom<=height,'the palette fits the panel: '+JSON.stringify(palette));
 assert.ok(palette.option>=24,'palette rows are at least 24 px');
 await page.keyboard.press('Escape');await page.waitForTimeout(300);
 if(height>=400){
  await page.locator('#library-adjust-wiggle').click();await page.locator('#wiggle-frequency').waitFor();await page.waitForTimeout(450);
  await noOverflow(page,`matrix inspector ${width}x${height}`);
  const close=await page.locator('#tool-inspector-close').boundingBox();
  assert.ok(close&&close.height>=24,'close adjustments is at least 24 px tall');
  await page.locator('#tool-inspector-close').click();await page.waitForTimeout(400);
 }
 const search=await page.evaluate(()=>{const node=document.getElementById('nav-command-palette');const box=node.getBoundingClientRect();return getComputedStyle(node).display==='none'?null:Math.min(box.width,box.height);});
 assert.ok(search===null||search>=24,'nav search is at least 24 px');
}
/** F9 — main-thread cost of the new motion: long tasks (> 50 ms) while switching views, opening the inspector, palette and tips. */
async function performanceChecks(page){
 await page.evaluate(()=>{window.zzLong=[];try{new PerformanceObserver(list=>{for(const entry of list.getEntries())window.zzLong.push({at:Math.round(entry.startTime),ms:Math.round(entry.duration),label:window.zzLabel});}).observe({entryTypes:['longtask']});}catch{/* Some CEP/browser builds do not expose long-task observations. */}});
 const label=text=>page.evaluate(value=>{window.zzLabel=value;},text);
 const metrics={};
 for(const [key,name] of [['2','view ease'],['3','view parallax'],['5','view settings'],['1','view home'],['4','view presets'],['1','view home again']]){
  await label(name);await blur(page);const start=Date.now();await page.keyboard.press(key);await page.waitForTimeout(600);metrics[name]=Date.now()-start-600;
 }
 await label('inspector');await page.locator('#library-adjust-wiggle').click();await page.locator('#wiggle-frequency').waitFor();await page.waitForTimeout(500);
 await label('inspector close');await page.locator('#tool-inspector-close').click();await page.waitForTimeout(500);
 await label('palette');await page.keyboard.press('Control+k');await page.waitForTimeout(450);await page.keyboard.type('cam');await page.waitForTimeout(200);await page.keyboard.press('Escape');await page.waitForTimeout(300);
 await label('tooltip');await page.locator('.ch-nav__item[data-view="ease"]').hover();await page.waitForTimeout(700);await page.mouse.move(2,300);
 const long=await page.evaluate(()=>window.zzLong);
 const motionOnly=long.filter(entry=>['inspector close','palette','tooltip'].includes(entry.label));
 await writeFile(resolve(output,'performance.json'),JSON.stringify({longTasks:long,note:'Headless Chromium on the dev machine; CEP timing differs. View switches include the view render itself.'},null,2));
 assert.deepEqual(motionOnly.filter(entry=>entry.ms>50),[],'closing the inspector, the palette and tips never block the main thread over 50 ms: '+JSON.stringify(motionOnly));
 checks.push(`performance: ${long.length} long task(s) over 50 ms, none in inspector close, palette or tips`);
}
try{
 for(const [width,height,scale] of [[280,640,1],[360,720,1],[480,800,1],[720,900,1],[280,280,1],[280,640,2]]){
  const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:scale});
  page.on('pageerror',error=>errors.push(String(error)));
  await mount(page,width,height);
  await noOverflow(page,`home ${width}x${height}@${scale}x`);
  const tokens=await page.evaluate(()=>{const style=getComputedStyle(document.documentElement);return ['--ease-spring','--dur-glide','--stagger-step'].map(name=>style.getPropertyValue(name).trim());});
  assert.deepEqual(tokens,['cubic-bezier(.34, 1.56, .64, 1)','450ms','22ms'],'AE motion tokens resolve on the root');
  if(width===360&&scale===1&&reached('f1')){
   await shellChecks(page);
   await page.screenshot({path:resolve(output,'shell-360.png')});
   await page.keyboard.press('1');await page.waitForTimeout(400);
  }
  if(width===360&&scale===1&&reached('f2'))await polishChecks(page);
  if(width===360&&scale===1&&reached('f3'))await libraryChecks(page);
  if(scale===1&&height>=640&&reached('f4'))await inspectorChecks(page,width);
  if(width===360&&scale===1&&reached('f5'))await paletteChecks(page);
  if(width===720&&scale===1&&reached('f6'))await curveChecks(page);
  if(width===720&&scale===1&&reached('f7'))await presetChecks(page);
  if(width===480&&scale===1&&reached('f8'))await surfaceChecks(page);
  if(scale===1&&reached('f9'))await matrixChecks(page,width,height);
  if(width===360&&scale===1&&reached('f9'))await performanceChecks(page);
  if(width===360&&scale===1){
   const ring=await focusRing(page);
   assert.ok(ring.visible&&ring.names.includes('ch-ae-focus-in'),'keyboard focus settles with the focus-ring motion: '+JSON.stringify(ring));
   checks.push('focus ring animates');
   await page.locator('.ch-nav__item[data-view="settings"]').click();
   await page.locator('#settings-help-system').click();
   await page.locator('#motion-probe').waitFor();
   await page.locator('#motion-probe').scrollIntoViewIfNeeded();
   await page.locator('.ch-motion-probe__strip').focus();
   for(const key of ['Control+k','1','2','3','4','5','Meta'])await page.keyboard.press(key);
   const keys=await page.locator('#motion-probe-key .ch-row__value').textContent();
   assert.equal(keys,'5 (Digit5) · 4 (Digit4) · 3 (Digit3) · 2 (Digit2) · 1 (Digit1) · Ctrl+K','probe keeps the recent keys; a lone modifier does not erase them');
   await page.locator('.ch-motion-probe__strip').hover();await page.mouse.wheel(0,100);await page.mouse.wheel(0,100);
   assert.match(await page.locator('#motion-probe-wheel .ch-row__value').textContent(),/aos saltos \(roda\) ×2/,'probe counts wheel notches');
   await noOverflow(page,'motion probe 360');
   await page.screenshot({path:resolve(output,'motion-probe-360.png')});
   checks.push('motion probe');
  }
  await page.screenshot({path:resolve(output,`home-${width}x${height}@${scale}x.png`)});
  await page.close();
 }
 const reducedPage=await browser.newPage({viewport:{width:360,height:720}});
 reducedPage.on('pageerror',error=>errors.push(String(error)));
 await mount(reducedPage,360,720,true);
 assert.equal(await reducedPage.evaluate(()=>document.documentElement.getAttribute('data-reduced-motion')),'true');
 const ring=await focusRing(reducedPage);
 assert.deepEqual(ring.names,[],'reduced motion: focus ring appears without animation');
 checks.push('reduced motion removes the focus animation');
 if(reached('f1')){
  await blur(reducedPage);await reducedPage.keyboard.press('2');
  assert.equal(await reducedPage.evaluate(()=>document.querySelector('.ch-view-body').getAnimations().length),0,'reduced: views switch without sliding');
  await reducedPage.keyboard.press('1');await reducedPage.waitForTimeout(200);
  checks.push('reduced: views do not slide');
 }
 if(reached('f4')){
  await reducedPage.locator('#library-adjust-wiggle').click();await reducedPage.locator('#wiggle-frequency').waitFor();
  assert.equal(await reducedPage.evaluate(()=>document.querySelector('.ch-context-inspector').getAnimations().length),0,'reduced: the sheet is just there');
  await reducedPage.locator('#tool-inspector-close').click();
  assert.equal(await activeView(reducedPage),'home','reduced: closing does not wait for an exit');
  checks.push('reduced: inspector without motion');
 }
 if(reached('f5')){
  await reducedPage.keyboard.press('Control+k');
  assert.equal(await reducedPage.evaluate(()=>document.getElementById('command-palette').getAnimations().length),0,'reduced: the palette appears without motion');
  await reducedPage.keyboard.press('Escape');
  assert.equal(await reducedPage.evaluate(()=>document.getElementById('command-palette').hidden),true,'reduced: Esc hides at once');
  checks.push('reduced: palette without motion');
 }
 await reducedPage.close();
 assert.deepEqual(errors,[]);
 await writeFile(resolve(output,'results.json'),JSON.stringify({status:'PASS',phase,hostRuntime:'NOT RUN',checks},null,2));
 console.log(JSON.stringify({status:'PASS',phase,checks:checks.length,output}));
}catch(error){
 await writeFile(resolve(output,'results.json'),JSON.stringify({status:'FAIL',phase,error:String(error.stack),errors,checks},null,2));
 throw error;
}finally{await browser.close();}
