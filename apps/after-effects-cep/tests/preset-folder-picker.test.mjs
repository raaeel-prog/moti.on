import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const built=await build({entryPoints:[fileURLToPath(new URL('../client/src/preset-folder-picker.ts',import.meta.url))],bundle:true,platform:'node',format:'esm',write:false});
const {FOLDER_PICKER_BREAKPOINT,folderPickerActive,folderPickerLabel}=await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);

test('the picker replaces the tree below 360 px only',()=>{
  assert.equal(FOLDER_PICKER_BREAKPOINT,360);
  for(const width of [280,317,359])assert.equal(folderPickerActive(width),true,String(width));
  for(const width of [360,480,720])assert.equal(folderPickerActive(width),false,String(width));
  assert.equal(folderPickerActive(0),false,'a panel without layout keeps the sidebar');
});

test('the picker names the folder and its parent, never the whole path',()=>{
  assert.deepEqual(folderPickerLabel(['Todos os presets']),{parent:'',name:'Todos os presets',full:'Todos os presets'});
  assert.deepEqual(folderPickerLabel(['Signature','Entrada e saída']),{parent:'Signature',name:'Entrada e saída',full:'Signature › Entrada e saída'});
  assert.deepEqual(folderPickerLabel(['Tipografia','Caracteres','Cascata']),{parent:'Caracteres',name:'Cascata',full:'Tipografia › Caracteres › Cascata'});
  assert.deepEqual(folderPickerLabel([]),{parent:'',name:'',full:''});
});
