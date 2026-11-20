import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {createFakeDocument} from '../../../packages/ui-core/tests/fake-dom.mjs';
const code=await build({entryPoints:[fileURLToPath(new URL('../client/src/host-theme.ts',import.meta.url))],bundle:true,format:'esm',platform:'node',write:false});
const {accentTokens,hostThemeTokens,createHostTheme,themeContrast}=await import('data:text/javascript;base64,'+Buffer.from(code.outputFiles[0].text).toString('base64'));
const gray=n=>({red:n,green:n,blue:n});
test('native RGB is exact, sRGB takes precedence, theme changes do not render, listeners clean up',()=>{
 const values=new Map(),attrs=new Map();let listener,removed,mode='host',skin={panelBackgroundColorSRGB:{color:gray(50)},panelBackgroundColor:{color:gray(66)}};
 const root={style:{setProperty:(k,v)=>values.set(k,v),removeProperty:k=>values.delete(k)},setAttribute:(k,v)=>attrs.set(k,v)};
 const controller=createHostTheme(root,{getHostEnvironment:()=>({appSkinInfo:skin}),addEventListener:(event,fn)=>{assert.equal(event,'com.adobe.csxs.events.ThemeColorChanged');listener=fn;},removeEventListener:(event,fn)=>{removed=fn;}},()=>mode);
 assert.equal(values.get('--bg-host'),'#323232');assert.equal(attrs.get('data-theme'),'dark');
 skin={panelBackgroundColor:{color:gray(220)}};listener();assert.equal(values.get('--bg-host'),'#dcdcdc');assert.equal(attrs.get('data-theme'),'light');
 mode='dark';controller.refresh();assert.equal(values.size,0,'manual theme leaves CSS in control');listener();assert.equal(values.size,0);
 mode='host';controller.refresh();assert.equal(values.get('--bg-host'),'#dcdcdc');controller.dispose();assert.equal(removed,listener);assert.equal(values.size,0);listener();assert.equal(values.size,0);
});
test('malformed, missing and unavailable CEP skin use screenshot fallback',()=>{
 for(const value of [undefined,null,{},gray(NaN),gray(-1),{red:'50',green:50,blue:50},gray(256)])assert.equal(hostThemeTokens(value).tokens['bg-host'],'#323232');
 const values=new Map();const controller=createHostTheme({style:{setProperty:(k,v)=>values.set(k,v),removeProperty:k=>values.delete(k)},setAttribute(){}},{getHostEnvironment(){throw Error('CEP unavailable');}},()=> 'host');assert.equal(values.get('--bg-host'),'#323232');controller.dispose();
});
test('all native gray brightness levels keep text AA and essential control/focus contrast',()=>{
 for(let n=0;n<256;n++){
  const {tokens}=hostThemeTokens(gray(n),gray(n));
  assert.equal(tokens['bg-host'],'#'+n.toString(16).padStart(2,'0').repeat(3));
  for(const bg of ['bg-host','surface-deep','surface-raised','surface-active']){
   for(const fg of ['text-primary','text-secondary','text-muted','action-text','ok','warn','danger'])assert.ok(themeContrast(tokens[fg],tokens[bg])>=4.5,`${n} ${fg}/${bg}`);
   assert.ok(themeContrast(tokens['border-control'],tokens[bg])>=3,`${n} border/${bg}`);
   assert.ok(themeContrast(tokens['ch-border-focus'],tokens[bg])>=3,`${n} focus/${bg}`);
  }
 }
});
test('AE appearance migration defaults to host and retains manual choice; Premiere remains dark/light',async()=>{
 const built=await build({entryPoints:[fileURLToPath(new URL('../../../packages/ui-core/src/panel-preferences.ts',import.meta.url))],bundle:true,format:'esm',platform:'node',write:false});
 const {createPanelPreferences}=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
 const doc=createFakeDocument(),root=doc.createElement('html');let saved=JSON.stringify({version:1,theme:'light',favorites:['wiggle']});const storage={getItem:()=>saved,setItem:(_k,v)=>saved=v};let refreshes=0;
 const ae=createPanelPreferences(root,storage,{hostTheme:true,onThemeChange:()=>refreshes++});assert.equal(ae.snapshot().theme,'host');assert.deepEqual(ae.snapshot().favorites,['wiggle']);
 ae.setTheme('light');assert.equal(root.getAttribute('data-theme'),'light');assert.equal(createPanelPreferences(root,storage,{hostTheme:true}).snapshot().theme,'light');assert.ok(refreshes>=2);
 assert.equal(ae.accentChoice(),'host');
 ae.setAccent('BB9CFF');ae.setAccent('bad');
 assert.equal(createPanelPreferences(root,storage,{hostTheme:true}).accentChoice(),'#bb9cff');
 assert.deepEqual(ae.snapshot().favorites,['wiggle']);
 ae.resetInterface();assert.equal(ae.snapshot().theme,'host');
 assert.equal(ae.accentChoice(),'host');
 const premiere=createPanelPreferences(root);premiere.setTheme('host');assert.equal(premiere.snapshot().theme,'dark');assert.equal(premiere.supportsHostTheme,false);
});

test('custom accent keeps text and button states readable in dark and light, and can follow native RGB',()=>{
 const dark=['#202124','#27282a','#303134','#343940'];
 const light=['#e8e8e8','#f2f2f2','#dcdcdc'];
 for(const surfaces of [dark,light])for(const choice of ['#60a5ff','#111111','#ffffff','#ff00ff','host']){
  const tokens=accentTokens(choice,{red:33,green:164,blue:112},surfaces);
  for(const role of ['action-text','action-text-hover','action-text-press']){
   for(const surface of surfaces)assert.ok(themeContrast(tokens[role],surface)>=4.5,`${choice} ${role} on ${surface}`);
  }
  for(const role of ['action-fill','action-fill-hover','action-fill-press'])assert.ok(themeContrast(tokens[role],tokens['action-on'])>=4.5);
  if(choice==='host')assert.equal(tokens['ae-accent-source'],'#21a470');
 }
 assert.equal(accentTokens('#60a5ff',null,dark)['ae-accent'],'#60a5ff');
});
test('design-system scale: three text levels, own hover/active steps and family tones stay legible on every host gray',()=>{
 const darkest=hostThemeTokens(gray(29)).tokens;
 assert.equal(darkest['text-secondary'],'#b2b2b2');assert.equal(darkest['text-tertiary'],'#8e8e8e');assert.equal(darkest['value-editable'],'#8ab8ff');
 assert.equal(darkest['surface-raised'],'#252525');assert.equal(darkest['surface-hover'],'#2d2d2d');assert.equal(darkest['surface-active'],'#373737');
 for(let n=0;n<256;n++){
  const {tokens}=hostThemeTokens(gray(n));
  // Nos cinzas médios nenhuma tinta fecha AA com degraus maiores, então eles encolhem; os temas reais do AE ficam nas pontas.
  if(n<=70||n>=190)assert.equal(new Set([tokens['surface-raised'],tokens['surface-hover'],tokens['surface-active']]).size,3,`${n} surface steps`);
  for(const bg of ['bg-host','surface-deep','surface-raised'])assert.ok(themeContrast(tokens['text-tertiary'],tokens[bg])>=4.5,`${n} tertiary/${bg}`);
  for(const bg of ['bg-host','surface-deep','surface-raised','surface-hover','surface-active'])for(const fg of ['text-secondary','value-editable','value-editable-hover'])assert.ok(themeContrast(tokens[fg],tokens[bg])>=4.5,`${n} ${fg}/${bg}`);
  for(const family of ['keyframes','layers','animation','spatial','shapes','effects','project'])for(const bg of ['surface-deep','surface-hover'])assert.ok(themeContrast(tokens[`fam-${family}`],tokens[bg])>=3,`${n} fam-${family}/${bg}`);
 }
});
