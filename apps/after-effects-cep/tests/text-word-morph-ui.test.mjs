import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { WORD_REVEAL_DEFAULTS } from '../../../packages/contracts/dist/index.js';

async function moduleAt(file) {
  const bundled = await build({entryPoints:[fileURLToPath(new URL(file,import.meta.url))],bundle:true,platform:'node',format:'esm',write:false});
  return import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
}
const ui = await moduleAt('../client/src/text-effects.ts');
const feedback = await moduleAt('../client/src/host-feedback.ts');
const locale = language => ({locale:()=>language,t:key=>key});
const snapshot = overrides => ({rigVersion:2,renderer:'morph',controls:{...WORD_REVEAL_DEFAULTS},wordCount:2,baked:false,...overrides});

test('Word reveal snapshots validate version, renderer and controls before hydration',()=>{
  assert.equal(ui.isWordRevealReadData({rigVersion:0,renderer:null,controls:null,wordCount:0,baked:false}),true);
  assert.equal(ui.isWordRevealReadData(snapshot()),true);
  assert.equal(ui.isWordRevealReadData(snapshot({rigVersion:1,renderer:'legacy'})),true);
  for(const invalid of [null,{},snapshot({rigVersion:3}),snapshot({renderer:'legacy'}),snapshot({controls:{}}),snapshot({wordCount:-1}),snapshot({wordCount:1.5}),snapshot({baked:'yes'}),{rigVersion:0,renderer:'morph',controls:null,wordCount:0,baked:false}])
    assert.equal(ui.isWordRevealReadData(invalid),false);
});

test('Word reveal hydration copies colors and does not reset a new-text draft',()=>{
  ui.resetTextEffect('wordReveal');
  const selected=snapshot({controls:{...WORD_REVEAL_DEFAULTS,durationFrames:71,fillColor:[.1,.2,.3],textColor:[.4,.5,.6]}});
  ui.hydrateWordReveal(selected);
  const args=ui.textEffectArgs('wordReveal');args.fillColor[0]=.9;args.textColor[0]=.9;
  assert.deepEqual(ui.textEffectArgs('wordReveal').fillColor,[.1,.2,.3]);
  assert.deepEqual(selected.controls.textColor,[.4,.5,.6]);
  ui.hydrateWordReveal({rigVersion:0,renderer:null,controls:null,wordCount:0,baked:false});
  assert.equal(ui.textEffectArgs('wordReveal').durationFrames,71);
  assert.equal(ui.textEffectArgs('wordReveal').renderer,'morph');
});

test('A failed selection read blocks editor Apply until a successful snapshot',()=>{
  ui.markWordRevealReadFailed();
  assert.equal(ui.wordRevealDisabledReason(locale('pt-BR'),true),'wordReveal.readInvalid');
  assert.equal(ui.wordRevealDisabledReason(locale('pt-BR'),false),null,'Quick can retry its own read');
  ui.hydrateWordReveal(snapshot());
  assert.equal(ui.wordRevealDisabledReason(locale('pt-BR'),true),null);
});

test('All known word morph preflight failures have localized recovery text',async()=>{
  const source=await readFile(new URL('../host/src/commands/text-word-morph.jsx',import.meta.url),'utf8');
  const messages=[...new Set([...source.matchAll(/fail\(MotionContracts\.ERROR\.[A-Z_]+,\s*"([^"]+)"/g)].map(match=>match[1]))];
  assert.ok(messages.length>=25);
  for(const message of messages)for(const language of ['pt-BR','en-US']) {
    const translated=feedback.hostFailureMessage({message,recoverable:true},locale(language));
    assert.notEqual(translated,'status.notCompleted',`${language}: ${message}`);
    assert.ok(translated.length>10);
  }
  assert.match(feedback.hostFailureMessage({message:'Um controle animado seria substituido. Ajuste-o no After Effects.',recoverable:true},locale('en-US')),/manual animation/);
  assert.equal(feedback.hostFailureMessage({message:'/Users/private/project.aep arbitrary exception',recoverable:true},locale('en-US')),'status.notCompleted','unknown host text must stay private');
});
