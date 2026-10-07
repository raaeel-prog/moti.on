import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { createCepDocument } from './cep-dom.mjs';
const built=await build({entryPoints:[fileURLToPath(new URL('../client/src/preset-timing-controls.ts',import.meta.url))],bundle:true,platform:'node',format:'esm',write:false});
const {createPresetTimingControls,defaultPresetTimingDraft}=await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);
function fixture({busy=false}={}){
 const doc=createCepDocument(),draft=defaultPresetTimingDraft(),context={hasComp:true,selectionCount:3},calls=[];let blocked='';
 const panel=createPresetTimingControls(doc,{locale:'pt-BR',draft,busy,context:()=>context,blockedReason:()=>blocked,onApply:args=>calls.push(args)});
 const choose=(name,value)=>{const field=panel.element.getElementsByTagName('select').find(p=>p.getAttribute('aria-label')===name);field.value=value;field.emit('change');};
 const apply=()=>panel.element.getElementsByTagName('button').find(p=>/marcadores$/.test(p.allText));
 const input=panel.element.getElementsByTagName('input')[0];
 return {panel,draft,context,calls,choose,apply,input,block(value){blocked=value;panel.updateContext();},frames(value){input.value=value;input.emit('input');}};
}
test('timing utility starts collapsed and align sends playhead semantics without a hidden offset',()=>{
 const f=fixture();assert.equal(f.panel.element.open,false);f.apply().click();assert.deepEqual(f.calls,[{operation:'align',phase:'in',frames:0,order:'forward'}]);
});
test('stagger sends signed frames and timeline order; shifting targets the chosen phase',()=>{
 const f=fixture();f.choose('Operação','stagger');f.choose('Ordem das camadas','reverse');f.choose('Marcador','out');f.frames('-4');f.apply().click();assert.deepEqual(f.calls[0],{operation:'stagger',phase:'out',frames:-4,order:'reverse'});
 f.choose('Operação','shift');f.frames('6');f.apply().click();assert.equal(f.calls[1].frames,6);assert.equal(f.calls[1].phase,'out');
});
test('invalid numbers and unsuitable context prevent any request and recover on correction',()=>{
 const f=fixture();f.choose('Operação','shift');
 for(const value of ['','1.5','601','NaN']){f.frames(value);assert.equal(f.apply().disabled,true);f.apply().click();}assert.equal(f.calls.length,0);
 f.frames('3');assert.equal(f.apply().disabled,false);f.context.selectionCount=0;f.panel.updateContext();assert.equal(f.apply().disabled,true);
 f.context.selectionCount=51;f.panel.updateContext();assert.equal(f.apply().disabled,true);f.context.selectionCount=2;f.context.hasComp=false;f.panel.updateContext();assert.equal(f.apply().disabled,true);
});
test('dirty editor and busy mutation block timing dispatch while retaining values',()=>{
 const f=fixture();f.block('Aplique ou descarte os ajustes.');assert.equal(f.apply().disabled,true);assert.match(f.panel.element.allText,/descarte/);f.block('');assert.equal(f.apply().disabled,false);
 const busy=fixture({busy:true});busy.apply().click();assert.equal(busy.calls.length,0);assert.equal(busy.input.disabled,true);
});

