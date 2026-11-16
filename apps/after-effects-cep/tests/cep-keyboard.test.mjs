import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';import {fileURLToPath} from 'node:url';
const result=await build({entryPoints:[fileURLToPath(new URL('../client/src/cep-keyboard.ts',import.meta.url))],bundle:true,format:'esm',platform:'node',write:false});
const {createCepKeyboard,cepControlKeyInterests}=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
function target(){const listeners=new Map();return {addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn);},removeEventListener(type,fn){listeners.get(type)?.delete(fn);},fire(type){for(const fn of listeners.get(type)??[])fn();}};}
const node=tagName=>({tagName,parentElement:null,getAttribute(){return null;}});
test('custom controls retain Enter/navigation in CEP and release keys on blur, blank focus and disposal',async()=>{
 const doc={...target(),activeElement:node('BODY'),hidden:false},win=target(),calls=[];
 const controller=createCepKeyboard(doc,win,{registerKeyEventsInterest:value=>calls.push(value)},'Win32');assert.equal(calls.length,0);
 doc.activeElement=node('BUTTON');doc.fire('focusin');let keys=JSON.parse(calls.at(-1));assert.ok(keys.some(k=>k.keyCode===13&&!k.ctrlKey&&!k.altKey&&!k.shiftKey));assert.ok(keys.some(k=>k.keyCode===37&&k.altKey));assert.ok(!keys.some(k=>k.keyCode===90),'Ctrl+Z remains a host undo');
 const count=calls.length;doc.fire('focusin');assert.equal(calls.length,count);win.fire('blur');assert.equal(calls.at(-1),'');win.fire('focus');assert.notEqual(calls.at(-1),'');
 doc.activeElement=node('BODY');doc.fire('focusout');await Promise.resolve();assert.equal(calls.at(-1),'');doc.activeElement=node('BUTTON');doc.fire('focusin');controller.dispose();assert.equal(calls.at(-1),'');const disposed=calls.length;win.fire('focus');doc.fire('focusin');assert.equal(calls.length,disposed);
});
test('OS virtual key codes are platform-specific and no host-edit shortcuts are reserved',()=>{
 assert.ok(cepControlKeyInterests('MacIntel').some(k=>k.keyCode===36));assert.ok(cepControlKeyInterests('Win32').some(k=>k.keyCode===13));for(const keys of [cepControlKeyInterests('MacIntel'),cepControlKeyInterests('Win32')])assert.ok(!keys.some(k=>k.keyCode===90));
});
test('absent and failing CEP capability preserve browser usability and lifecycle',()=>{
 const doc={...target(),activeElement:node('BUTTON'),hidden:false},win=target();for(const host of [undefined,{}, {registerKeyEventsInterest(){throw Error('unavailable');}}]){const controller=createCepKeyboard(doc,win,host,'Win32');doc.fire('focusin');win.fire('blur');controller.dispose();}
});
