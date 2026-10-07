import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { createCepDocument } from './cep-dom.mjs';
import { createFakeWindow } from '../../../packages/ui-core/tests/fake-dom.mjs';
const built=await build({entryPoints:[fileURLToPath(new URL('../client/src/preset-workspace.ts',import.meta.url))],bundle:true,platform:'node',format:'esm',write:false});
const {createPresetWorkspace}=await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);
const options={phase:'in',direction:'bottom',durationFrames:40,intensity:100,staggerFrames:2,unit:'preset',elasticity:35,overlap:70,speed:100};
async function fixture(t,{failRead=false,holdAdjust=false,storage,locale='pt-BR',inspectionState='ready',phases=0,phaseActionFailure=false,favorites=[],recent=[],cache={personal:{roots:[],folders:[],items:[]}},navigation={view:'edit',category:'studio',query:'',scope:'all',scroll:0}}={}){
  const saved={window:globalThis.window,requestAnimationFrame:globalThis.requestAnimationFrame,cancelAnimationFrame:globalThis.cancelAnimationFrame};globalThis.window=createFakeWindow();const win=globalThis.window;
  globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=()=>{};
  const doc=createCepDocument(),calls=[],context={hasComp:true,selectionCount:1,selectedKeys:0};let readFailure=failRead,adjustFailure=false,holdRead=false,applyFailure=false,timingFailure=false;
  if(phases){
    const create=doc.createElement.bind(doc);
    doc.createElement=tag=>{
      const node=create(tag),listeners=new Map();
      node.addEventListener=(type,handler)=>listeners.set(type,[...(listeners.get(type)??[]),handler]);
      node.removeEventListener=(type,handler)=>listeners.set(type,(listeners.get(type)??[]).filter(listener=>listener!==handler));
      node.emit=(type,init={})=>{const event={target:node,currentTarget:node,defaultPrevented:false,preventDefault(){this.defaultPrevented=true;},...init};for(const listener of [...(listeners.get(type)??[])])listener(event);return event;};
      node.classList.remove=(...names)=>{node.className=node.className.split(/\s+/).filter(name=>!names.includes(name)).join(' ');};
      node.blur=()=>{if(doc.activeElement===node)doc.activeElement=null;node.emit('blur');};
      return node;
    };
  }
  if(storage){win.localStorage=storage;doc.defaultView=win;}
  let resolveRead,resolveAdjust;
  const state={state:'ready',message:'',layerName:'Title',presetId:'studio-letter-silk-rise',target:{compId:1,layerId:2,instance:'one',fingerprint:'a'},options:{...options}};
  if(phases)state.phases=['in','out'].slice(0,phases).map(phase=>({phase,presetId:state.presetId,instance:`one-${phase}`,markerTime:1,options:{...options,phase},controls:[]}));
  if(inspectionState==='no-comp'){state.state='no-comp';state.message='Abra uma composição.';delete state.target;delete state.options;}
  const workspace=createPresetWorkspace(doc,{locale,navigation,cache,context:()=>context,busy:false,apply(){},edit(){},preferences:{snapshot:()=>({favorites,recent,folderColors:{},collapsedFolders:[],presetAutoplay:false,presetSize:200})},
    async execute(command,args){calls.push({command,args});if(command==='ae.presets.inspect'){
      if(readFailure)return {ok:false,error:{message:'Falha na leitura'}};
      if(holdRead){holdRead=false;const copy=structuredClone(state);return await new Promise(resolve=>{resolveRead=()=>resolve({ok:true,data:copy});});}
    }else if(command==='ae.presets.adjust'){
      if(adjustFailure)throw Error('transport');
      if(holdAdjust)await new Promise(resolve=>{resolveAdjust=resolve;});
      state.options={...args.options};state.target.fingerprint+='b';
    }else if(command==='ae.presets.phase-action'){
      if(phaseActionFailure)return {ok:false,error:{message:'Não foi possível remover a fase.'}};
      if(args.action==='remove'){
        state.phases=state.phases.filter(phase=>phase.phase!==args.phase);
        if(state.phases.length){state.presetId=state.phases[0].presetId;state.options={...state.phases[0].options};state.target.fingerprint+='r';}
        else{state.state='unmanaged';state.message='Esta camada não tem um preset Moti.on.';delete state.target;delete state.options;delete state.presetId;}
      }
    }else if(command==='ae.presets.timing'){if(timingFailure)return {ok:false,error:{message:'Destino ocupado por um marcador.'}};if(state.target)state.target.fingerprint+='t';return {ok:true,data:{appliedCount:2}};}else if(command==='ae.presets.phase-apply'&&applyFailure)return {ok:false,error:{message:'A seleção contém um preset. Remova-o antes de aplicar.'}};
    else if(command==='ae.presets.personal-apply')return {ok:true,data:{kind:cache.personal.items.find(item=>item.id===args.itemId)?.kind??'preset'}};
    return {ok:true,data:structuredClone(state)};}});
  t.after(()=>{workspace.dispose();Object.assign(globalThis,saved);});await setImmediate();
  const button=label=>workspace.element.getElementsByTagName('button').find(n=>n.allText===label);
  const intensity=()=>workspace.element.getElementsByTagName('input').find(n=>n.getAttribute('role')==='spinbutton'&&n.getAttribute('aria-label')==='Intensidade · %');
  return {workspace,doc,win,state,calls,button,intensity,cache,context,navigation,
    change(value){const n=intensity();n.value=String(value);n.emit('change');},
    failTiming(){timingFailure=true;},failRead(value){readFailure=value;},failAdjust(){adjustFailure=true;},failApply(){applyFailure=true;},holdRead(){holdRead=true;},releaseRead(){resolveRead();},releaseAdjust(){resolveAdjust();}};
}
test('host inspection state is explained in the selected language',async t=>{
  const f=await fixture(t,{locale:'en-US',inspectionState:'no-comp'});
  assert.match(f.workspace.element.allText,/Open a composition/);
  assert.doesNotMatch(f.workspace.element.allText,/Abra uma composição/);
  assert.ok(f.button('Browse presets'));
});
const selectedPreset='builtin.motion.studio-letter-silk-rise';
const galleryLocation=navigation=>({category:navigation.category,query:navigation.query,scope:navigation.scope,scroll:navigation.scroll,selectedId:navigation.selectedId});

test('Show in library restores the same selected preset with its search, collection and exact offset',async t=>{
  const navigation={view:'edit',category:'studio',query:'silk',scope:'recent',scroll:780,selectedId:selectedPreset};
  const expected=galleryLocation(navigation),f=await fixture(t,{navigation,recent:[selectedPreset]});
  f.button('Mostrar na biblioteca').click();await setImmediate();
  assert.equal(navigation.view,'browse');assert.deepEqual(galleryLocation(navigation),expected);
  const selected=f.workspace.element.getElementsByTagName('article').find(node=>node.id===selectedPreset);
  assert.equal(selected?.getAttribute('data-selected'),'true');
});

test('Reveal from the phase editor preserves the selected favorite and its gallery position',async t=>{
  const navigation={view:'edit',category:'studio',query:'silk',scope:'favorites',scroll:925,selectedId:selectedPreset};
  const expected=galleryLocation(navigation),f=await fixture(t,{navigation,phases:1,favorites:[selectedPreset]});
  f.button('Revelar').click();await setImmediate();
  assert.equal(navigation.view,'browse');assert.deepEqual(galleryLocation(navigation),expected);
});

test('revealing an applied preset hidden by the saved search makes its card available',async t=>{
  const navigation={view:'edit',category:'studio',query:'does not exist',scope:'all',scroll:530,selectedId:selectedPreset};
  const f=await fixture(t,{navigation});f.button('Mostrar na biblioteca').click();await setImmediate();
  assert.equal(navigation.view,'browse');assert.equal(navigation.category,'studio');assert.equal(navigation.query,'');
  assert.equal(navigation.selectedId,selectedPreset);
  assert.equal(f.workspace.element.getElementsByTagName('article').find(node=>node.id===selectedPreset)?.getAttribute('data-selected'),'true');
});

test('removing the last phase returns to Browse at the last selected preset and exact offset',async t=>{
  const navigation={view:'edit',category:'studio',query:'silk',scope:'recent',scroll:1060,selectedId:selectedPreset};
  const expected=galleryLocation(navigation),f=await fixture(t,{navigation,phases:1,recent:[selectedPreset]});
  f.button('Remover').click();await setImmediate();await setImmediate();
  assert.equal(f.calls.filter(call=>call.command==='ae.presets.phase-action').length,1);
  assert.equal(navigation.view,'browse');assert.deepEqual(galleryLocation(navigation),expected);
  assert.equal(f.workspace.element.getElementsByTagName('article').find(node=>node.id===selectedPreset)?.getAttribute('data-selected'),'true');
});

test('removing one phase keeps Edit when another managed phase remains',async t=>{
  const navigation={view:'edit',category:'studio',query:'silk',scope:'all',scroll:890,selectedId:selectedPreset};
  const expected=galleryLocation(navigation),f=await fixture(t,{navigation,phases:2});
  f.button('Remover').click();await setImmediate();await setImmediate();
  assert.equal(navigation.view,'edit');assert.deepEqual(galleryLocation(navigation),expected);
  assert.deepEqual(f.state.phases.map(phase=>phase.phase),['out']);assert.ok(f.button('Revelar'));
});

test('failed removal or failed follow-up inspection retains Edit and the saved gallery position',async t=>{
  for(const failure of ['remove','inspect'])await t.test(failure,async child=>{
    const navigation={view:'edit',category:'studio',query:'silk',scope:'all',scroll:640,selectedId:selectedPreset};
    const expected=galleryLocation(navigation),f=await fixture(child,{navigation,phases:1,phaseActionFailure:failure==='remove'});
    if(failure==='inspect')f.failRead(true);
    f.button('Remover').click();await setImmediate();await setImmediate();
    assert.equal(navigation.view,'edit');assert.deepEqual(galleryLocation(navigation),expected);
    assert.match(f.workspace.element.allText,failure==='remove'?/Não foi possível remover a fase/:/Falha na leitura/);
  });
});
test('applied preset rejects nondecimal text without losing it or sending an adjustment',async t=>{
  const f=await fixture(t),number=f.intensity(),original=f.state.options.intensity;
  for(const value of ['0x20','0b10']){
    number.value=value;number.emit('input');
    assert.equal(number.value,value);assert.equal(number.getAttribute('aria-invalid'),'true');
    assert.equal(f.button('Aplicar ajustes').disabled,true);
    f.button('Aplicar ajustes').click();
    assert.equal(f.calls.some(call=>call.command==='ae.presets.adjust'),false);
    assert.equal(f.state.options.intensity,original);
  }
  number.value='32';number.emit('input');f.button('Aplicar ajustes').click();await setImmediate();
  assert.equal(f.calls.filter(call=>call.command==='ae.presets.adjust').length,1);
  assert.equal(f.state.options.intensity,32);
});
test('preset editor exposes initial read failure and reload recovers',async t=>{
  const f=await fixture(t,{failRead:true});assert.match(f.workspace.element.allText,/Falha na leitura/);assert.ok(f.button('Recarregar'));
  f.failRead(false);f.button('Recarregar').click();await setImmediate();assert.equal(f.intensity().value,'100');
});
test('active Edit tab does not erase a pending draft',async t=>{
  const f=await fixture(t);f.change(135.5);f.button('Editar').click();await setImmediate();assert.equal(f.intensity().value,'135.5');assert.equal(f.button('Aplicar ajustes').disabled,false);
});
test('different composition with identical layer id and fingerprint keeps draft and requires reload',async t=>{
  const f=await fixture(t);f.change(130);f.state.target.compId=2;f.win.emit('focus');await setImmediate();
  assert.equal(f.intensity().value,'130');assert.equal(f.button('Aplicar ajustes').disabled,true);assert.match(f.workspace.element.allText,/Seus ajustes foram mantidos/);
  f.button('Recarregar').click();await setImmediate();assert.equal(f.intensity().value,'100');
});
test('selection becoming empty does not discard local values',async t=>{
  const f=await fixture(t);f.change(145);f.state.state='empty';delete f.state.target;delete f.state.options;f.win.emit('focus');await setImmediate();
  assert.equal(f.intensity().value,'145');assert.equal(f.button('Aplicar ajustes').disabled,true);
});
test('late inspection is rejected while an adjustment runs',async t=>{
  const f=await fixture(t,{holdAdjust:true});f.change(140);f.holdRead();f.win.emit('focus');await setImmediate();f.button('Aplicar ajustes').click();f.releaseRead();await setImmediate();
  assert.equal(f.intensity().value,'140');assert.equal(f.button('Aplicar ajustes').disabled,true);f.releaseAdjust();await setImmediate();await setImmediate();
  assert.equal(f.state.options.intensity,140);assert.equal(f.intensity().value,'140');
});

test('an inspection already in flight cannot replace a number while its press is held',async t=>{
  const f=await fixture(t),number=f.intensity();
  f.holdRead();f.win.emit('focus');await setImmediate();
  f.state.target.fingerprint='selection-changed';
  number.setAttribute('data-scrub-pressed','true');
  f.releaseRead();await setImmediate();
  assert.equal(f.intensity(),number);
  assert.equal(f.workspace.element.getElementsByRole('tabpanel')[0].getAttribute('aria-busy'),'false');
  number.removeAttribute('data-scrub-pressed');
  f.win.emit('focus');await setImmediate();
  assert.notEqual(f.intensity(),number);
});
test('uncertain adjustment blocks resubmission and failed reload preserves draft',async t=>{
  const f=await fixture(t);f.change(155);f.failAdjust();f.button('Aplicar ajustes').click();await setImmediate();assert.equal(f.button('Aplicar ajustes').disabled,true);assert.equal(f.intensity().value,'155');
  f.failRead(true);f.button('Recarregar').click();await setImmediate();assert.equal(f.intensity().value,'155');assert.equal(f.button('Aplicar ajustes').disabled,true);
});
test('preset editor tabs link to their panel and support Home/End',async t=>{
  const f=await fixture(t);const tabs=f.workspace.element.getElementsByRole('tab');const panel=f.workspace.element.getElementsByRole('tabpanel')[0];
  assert.equal(panel.getAttribute('aria-labelledby'),tabs[1].id);assert.equal(tabs[1].getAttribute('aria-controls'),panel.id);
  // End on the already selected Edit tab preserves the draft as well as the tab state.
  f.change(120);f.workspace.element.getElementsByRole('tablist')[0].keydown('End');assert.equal(f.intensity().value,'120');assert.equal(f.doc.activeElement,tabs[1]);
});

test('applied preset order shows seed only for random sequencing and keeps the draft',async t=>{
  const f=await fixture(t);
  const choice=label=>f.workspace.element.getElementsByTagName('select').find(n=>n.getAttribute('aria-label')===label);
  assert.ok(choice('Direção').children.some(n=>n.value==='preset'));
  assert.equal(f.workspace.element.getElementsByTagName('input').some(n=>n.getAttribute('aria-label')==='Variação'),false);
  f.change(135);let order=choice('Ordem');order.value='random';order.emit('change');
  const seed=f.workspace.element.getElementsByTagName('input').find(n=>n.getAttribute('role')==='spinbutton'&&n.getAttribute('aria-label')==='Variação');
  assert.ok(seed);seed.value='10000';seed.emit('change');assert.equal(seed.value,'10000');assert.equal(seed.getAttribute('aria-invalid'),'true');assert.equal(f.button('Aplicar ajustes').disabled,true);
  seed.value='57';seed.emit('change');f.button('Aplicar ajustes').click();await setImmediate();await setImmediate();
  const args=f.calls.find(c=>c.command==='ae.presets.adjust').args.options;
  assert.equal(args.order,'random');assert.equal(args.seed,57);assert.equal(args.intensity,135);
});


test('invalid numeric draft remains visible and blocks host mutation until corrected',async t=>{
  const f=await fixture(t);f.change(401);
  assert.equal(f.intensity().value,'401');assert.equal(f.intensity().getAttribute('aria-invalid'),'true');
  assert.match(f.workspace.element.allText,/Use um número entre 0 e 300/);
  f.button('Aplicar ajustes').click();await setImmediate();assert.equal(f.calls.some(c=>c.command==='ae.presets.adjust'),false);
  f.state.target.compId=5;f.win.emit('focus');await setImmediate();assert.equal(f.intensity().value,'401');
  f.change(151.5);assert.equal(f.intensity().getAttribute('aria-invalid'),'false');assert.equal(f.button('Aplicar ajustes').disabled,true,'changed selection still needs an explicit reload');
  f.button('Recarregar').click();await setImmediate();assert.equal(f.intensity().value,'100');
  f.change(151.5);f.button('Aplicar ajustes').click();await setImmediate();await setImmediate();assert.equal(f.state.options.intensity,151.5);
});

test('stale preset notice stays mounted across repeated context polls',async t=>{
  const f=await fixture(t);f.change(120);f.state.target.compId=3;f.win.emit('focus');await setImmediate();
  const banner=f.workspace.element.getElementsByTagName('div').find(n=>n.className==='ch-alert ch-alert--warning');
  assert.ok(banner);assert.match(banner.allText,/A seleção mudou/);assert.match(banner.allText,/Recarregar descarta os ajustes/);
  f.win.emit('focus');await setImmediate();assert.equal(f.workspace.element.getElementsByTagName('div').find(n=>n.className==='ch-alert ch-alert--warning'),banner);
});

test('Browse and Edit stay visible and keyboard navigation focuses their actual tabs',async t=>{
  const f=await fixture(t),tabs=f.workspace.element.getElementsByRole('tablist')[0];
  tabs.keydown('Home');assert.equal(tabs.hidden,false);assert.equal(f.navigation.view,'browse');assert.equal(f.doc.activeElement,f.button('Navegar'));
  assert.equal(f.button('Navegar').getAttribute('aria-selected'),'true');
  assert.equal(f.workspace.element.getElementsByTagName('button').some(node=>node.getAttribute('aria-label')==='Editar preset aplicado'),false,'the visible Edit tab replaces the duplicate icon');
  tabs.keydown('End');await setImmediate();assert.equal(f.navigation.view,'edit');assert.equal(f.doc.activeElement,f.button('Editar'));
});

test('Edit phase is explicit, keyboard operable, and reset only changes the draft',async t=>{
  const f=await fixture(t),phase=f.workspace.element.getElementsByRole('radiogroup').find(node=>node.getAttribute('aria-label')==='Animação');
  phase.getElementsByTagName('button')[0].keydown('End');
  assert.equal(phase.getElementsByTagName('button')[2].getAttribute('aria-checked'),'true');
  f.change(160);f.button('Restaurar padrão').click();
  assert.equal(f.intensity().value,'100');assert.equal(f.button('Aplicar ajustes').disabled,false);
  assert.equal(f.calls.some(c=>c.command==='ae.presets.adjust'),false);
  const resetPhase=f.workspace.element.getElementsByRole('radiogroup').find(node=>node.getAttribute('aria-label')==='Animação');
  assert.equal(resetPhase.getElementsByTagName('button')[0].getAttribute('aria-checked'),'true');
  f.button('Aplicar ajustes').click();await setImmediate();
  assert.equal(f.calls.find(c=>c.command==='ae.presets.adjust').args.options.phase,'in');
});

test('copied recipe survives selection changes and pastes its chosen phase to multiple layers',async t=>{
  const f=await fixture(t);f.button('Copiar preset aplicado').click();
  assert.deepEqual(Object.keys(f.cache.copied).sort(),['options','presetId']);
  assert.notEqual(f.cache.copied.options,f.state.options);
  f.context.selectionCount=3;f.state.state='multiple';delete f.state.target;delete f.state.options;
  f.win.emit('focus');await setImmediate();
  assert.ok(f.button('Colar na seleção'));assert.equal(f.button('Colar na seleção').disabled,false);
  const phase=f.workspace.element.getElementsByRole('radiogroup').find(node=>node.getAttribute('aria-label')==='Colar como');
  phase.getElementsByTagName('button')[2].click();f.button('Colar na seleção').click();await setImmediate();await setImmediate();
  const paste=f.calls.find(c=>c.command==='ae.presets.phase-apply');
  assert.equal(paste.args.presetId,'studio-letter-silk-rise');assert.equal(paste.args.phase,'both');assert.equal(paste.args.intensity,100);
  assert.equal('target' in paste.args,false);assert.match(f.workspace.element.allText,/Preset colado na seleção/);
});

test('copy and paste cannot discard a dirty draft, and paste uses current context',async t=>{
  const f=await fixture(t);f.button('Copiar preset aplicado').click();f.change(130);
  assert.equal(f.button('Copiar preset aplicado').disabled,true);assert.equal(f.button('Colar na seleção').disabled,true);
  f.button('Colar na seleção').click();assert.equal(f.calls.some(c=>c.command==='ae.presets.phase-apply'),false);
  f.button('Descartar ajustes').click();await setImmediate();
  f.context.hasComp=false;f.workspace.updateContext();assert.equal(f.button('Colar na seleção').disabled,true);assert.match(f.workspace.element.allText,/Abra uma composição/);
  f.context.hasComp=true;f.context.selectionCount=0;f.workspace.updateContext();assert.equal(f.button('Colar na seleção').disabled,true);
  f.context.selectionCount=2;f.workspace.updateContext();assert.equal(f.button('Colar na seleção').disabled,false);
});

test('host rejection of paste is visible and keeps the copied configuration',async t=>{
  const f=await fixture(t);f.button('Copiar preset aplicado').click();f.failApply();
  f.button('Colar na seleção').click();await setImmediate();
  assert.match(f.workspace.element.allText,/Remova-o antes de aplicar/);assert.equal(f.cache.copied.presetId,'studio-letter-silk-rise');
  assert.doesNotMatch(f.workspace.element.allText,/Preset colado na seleção/);
  f.button('Limpar').click();assert.equal(f.cache.copied,undefined);assert.equal(f.button('Colar na seleção'),undefined);
});

test('copied configuration remains available after workspace recreation',async t=>{
  const cache={personal:{roots:[],folders:[],items:[]}};
  await t.test('copy in first workspace',async child=>{const first=await fixture(child,{cache});first.button('Copiar preset aplicado').click();});
  await t.test('read in recreated workspace',async child=>{const second=await fixture(child,{cache});assert.ok(second.button('Colar na seleção'));assert.equal(second.cache.copied.options.durationFrames,40);});
});

for(const [kind,label,message] of [['preset','Aplicar .ffx','Preset aplicado'],['image','Adicionar à composição','Mídia adicionada'],['audio','Adicionar à composição','Mídia adicionada'],['video','Adicionar à composição','Mídia adicionada'],['project','Importar projeto','Projeto importado no painel Projeto']]){
  test(`personal ${kind} reports its actual import action`,async t=>{
    const cache={personal:{roots:[],folders:[],items:[{id:'item',rootId:'root',folderId:'folder',name:'Local asset',relativePath:'asset',kind}]}};
    const f=await fixture(t,{cache,navigation:{view:'browse',category:'personal',query:'',scope:'all',scroll:0,selectedId:'item'}});
    f.button(label).click();await setImmediate();assert.match(f.workspace.element.allText,new RegExp(message));
    assert.equal(f.calls.find(c=>c.command==='ae.presets.personal-apply').args.itemId,'item');
  });
}

function variantStorage(){let value=null;return {getItem:()=>value,setItem:(key,next)=>{value=next;},raw:()=>value};}
function nameVariant(f,name){const input=f.workspace.element.getElementsByTagName('input').find(node=>node.getAttribute('aria-label')==='Nome da variação');input.value=name;input.emit('input');}

test('saved variations stay collapsed, persist between workspaces and load without mutating the host',async t=>{
  const storage=variantStorage();
  await t.test('save inspected settings',async child=>{
    const f=await fixture(child,{storage}),section=f.workspace.element.getElementsByTagName('details').find(node=>node.className==='ch-preset-variants');
    assert.equal(section.open,false);section.open=true;section.emit('toggle');
    nameVariant(f,'Título suave');f.button('Salvar preset aplicado').click();await setImmediate();
    assert.match(f.workspace.element.allText,/Variação salva neste painel/);assert.equal(f.calls.some(call=>call.command==='ae.presets.phase-apply'),false);
    assert.equal(f.workspace.element.getElementsByTagName('details').find(node=>node.className==='ch-preset-variants').open,true);
  });
  await t.test('load, phase override, paste',async child=>{
    const f=await fixture(child,{storage});f.state.state='multiple';delete f.state.target;delete f.state.options;f.context.selectionCount=2;f.win.emit('focus');await setImmediate();
    assert.ok(f.button('Carregar para colar'));f.button('Carregar para colar').click();assert.equal(f.cache.copied.presetId,'studio-letter-silk-rise');
    assert.equal(f.calls.some(call=>call.command==='ae.presets.phase-apply'),false);
    const phase=f.workspace.element.getElementsByRole('radiogroup').find(node=>node.getAttribute('aria-label')==='Colar como');phase.getElementsByTagName('button')[2].click();
    f.button('Colar na seleção').click();await setImmediate();assert.equal(f.calls.find(call=>call.command==='ae.presets.phase-apply').args.phase,'both');
    assert.equal(JSON.parse(storage.raw()).items[0].options.phase,'in','paste phase never edits the saved recipe');
  });
});

test('saved variants use only committed valid values and deletion offers undo',async t=>{
  const storage=variantStorage(),f=await fixture(t,{storage});nameVariant(f,'Original');f.change(145);
  assert.equal(f.button('Salvar preset aplicado').disabled,true);f.button('Salvar preset aplicado').click();assert.equal(storage.raw(),null);
  f.button('Descartar ajustes').click();await setImmediate();f.button('Salvar preset aplicado').click();await setImmediate();
  assert.equal(JSON.parse(storage.raw()).items[0].options.intensity,100);
  f.button('Excluir variação').click();assert.equal(JSON.parse(storage.raw()).items.length,0);assert.ok(f.button('Desfazer exclusão'));
  f.button('Desfazer exclusão').click();assert.equal(JSON.parse(storage.raw()).items[0].name,'Original');assert.match(f.workspace.element.allText,/Variação restaurada/);
});

test('storage write failure is shown without a saved item or success message',async t=>{
  const f=await fixture(t,{storage:{getItem:()=>null,setItem(){throw Error('quota');}}});nameVariant(f,'Not saved');f.button('Salvar preset aplicado').click();await setImmediate();
  assert.match(f.workspace.element.allText,/Não foi possível confirmar o salvamento/);assert.doesNotMatch(f.workspace.element.allText,/Variação salva neste painel/);
  assert.equal(f.button('Carregar para colar'),undefined);assert.equal(f.workspace.element.getElementsByTagName('input').find(node=>node.getAttribute('aria-label')==='Nome da variação').value,'Not saved');
});

test('saving is blocked during inspection and re-enabled when an unchanged read completes',async t=>{
  const storage=variantStorage(),f=await fixture(t,{storage});nameVariant(f,'After read');f.holdRead();f.win.emit('focus');
  assert.equal(f.button('Salvar preset aplicado').disabled,true);f.button('Salvar preset aplicado').click();assert.equal(storage.raw(),null);
  f.releaseRead();await setImmediate();assert.equal(f.button('Salvar preset aplicado').disabled,false);
  f.holdRead();f.button('Salvar preset aplicado').click();
  assert.equal(f.button('Salvar preset aplicado').disabled,true);assert.equal(storage.raw(),null,'saving waits for its own fresh host inspection');
  f.releaseRead();await setImmediate();assert.equal(JSON.parse(storage.raw()).items[0].name,'After read');assert.equal(f.button('Salvar preset aplicado').disabled,false);
});

test('saving rejects changed controls or another selected layer and keeps the entered name',async t=>{
  for(const change of ['controls','layer'])await t.test(change,async child=>{
    const storage=variantStorage(),f=await fixture(child,{storage});nameVariant(f,'Keep my name');
    if(change==='controls'){f.state.options.intensity=200;f.state.target.fingerprint='changed';}else f.state.target.layerId=3;
    const reads=f.calls.filter(call=>call.command==='ae.presets.inspect').length;
    f.button('Salvar preset aplicado').click();await setImmediate();
    assert.equal(f.calls.filter(call=>call.command==='ae.presets.inspect').length,reads+1);
    assert.equal(storage.raw(),null);assert.match(f.workspace.element.allText,/A seleção ou os ajustes mudaram/);
    assert.equal(f.workspace.element.getElementsByTagName('input').find(node=>node.getAttribute('aria-label')==='Nome da variação').value,'Keep my name');
    assert.equal(f.button('Salvar preset aplicado').disabled,true);
    f.button('Recarregar').click();await setImmediate();f.button('Salvar preset aplicado').click();await setImmediate();
    assert.equal(JSON.parse(storage.raw()).items[0].options.intensity,f.state.options.intensity);
    assert.equal(f.calls.some(call=>call.command!=='ae.presets.inspect'),false,'saving never mutates the host');
  });
});

test('a failed save inspection preserves storage and name and requires reload',async t=>{
  const storage=variantStorage(),f=await fixture(t,{storage});nameVariant(f,'Retry later');f.failRead(true);
  f.button('Salvar preset aplicado').click();await setImmediate();
  assert.equal(storage.raw(),null);assert.match(f.workspace.element.allText,/Falha na leitura/);assert.equal(f.button('Salvar preset aplicado').disabled,true);
  assert.equal(f.workspace.element.getElementsByTagName('input').find(node=>node.getAttribute('aria-label')==='Nome da variação').value,'Retry later');
  f.failRead(false);f.button('Recarregar').click();await setImmediate();assert.equal(f.button('Salvar preset aplicado').disabled,false);
});

test('a disposed workspace cannot persist a pending save',async t=>{
  const storage=variantStorage(),f=await fixture(t,{storage});nameVariant(f,'Abandoned save');f.holdRead();f.button('Salvar preset aplicado').click();
  f.workspace.dispose();f.releaseRead();await setImmediate();assert.equal(storage.raw(),null);
});

test('deletion undo survives workspace recreation and clears the session tombstone only after restore',async t=>{
  const storage=variantStorage(),cache={personal:{roots:[],folders:[],items:[]}};
  await t.test('delete before navigation',async child=>{
    const f=await fixture(child,{storage,cache});nameVariant(f,'Recover after navigation');f.button('Salvar preset aplicado').click();await setImmediate();
    f.button('Excluir variação').click();assert.ok(cache.removedVariant);assert.equal(JSON.parse(storage.raw()).items.length,0);
  });
  await t.test('restore after navigation',async child=>{
    let rejectWrite=true;const f=await fixture(child,{cache,storage:{getItem:storage.getItem,setItem(key,value){if(rejectWrite)throw Error('quota');storage.setItem(key,value);}}});
    assert.ok(f.button('Desfazer exclusão'));f.button('Desfazer exclusão').click();assert.ok(cache.removedVariant);assert.match(f.workspace.element.allText,/Não foi possível confirmar/);
    rejectWrite=false;f.button('Desfazer exclusão').click();assert.equal(cache.removedVariant,undefined);assert.equal(JSON.parse(storage.raw()).items[0].name,'Recover after navigation');
  });
});

test('a transient storage read alert clears on recovery while operation feedback remains',async t=>{
  const storage=variantStorage();let denyRead=false;
  const f=await fixture(t,{storage:{getItem(key){if(denyRead)throw Error('denied');return storage.getItem(key);},setItem:storage.setItem}});
  nameVariant(f,'Saved');f.button('Salvar preset aplicado').click();await setImmediate();assert.match(f.workspace.element.allText,/Variação salva neste painel/);
  denyRead=true;f.button('Atualizar variações').click();assert.match(f.workspace.element.allText,/Não foi possível ler as variações/);
  denyRead=false;f.state.target.fingerprint='recovered';f.win.emit('focus');await setImmediate();
  assert.ok(f.button('Carregar para colar'));assert.doesNotMatch(f.workspace.element.allText,/Não foi possível ler as variações/);assert.match(f.workspace.element.allText,/Variação salva neste painel/);
  nameVariant(f,'Saved');f.button('Salvar preset aplicado').click();await setImmediate();assert.match(f.workspace.element.allText,/Já existe uma variação/);
  f.state.target.fingerprint='redraw';f.win.emit('focus');await setImmediate();assert.match(f.workspace.element.allText,/Já existe uma variação/,'a healthy read must not erase operation errors');
});

test('workspace dispatches timing for multiple layers and refreshes inspection after mutation',async t=>{
 const f=await fixture(t);f.state.state='multiple';delete f.state.target;delete f.state.options;f.context.selectionCount=2;f.win.emit('focus');await setImmediate();
 // Timing succeeds even while the single-preset editor cannot show multiple layers.
 f.button('Alinhar marcadores').click();await setImmediate();await setImmediate();
 assert.deepEqual(f.calls.find(c=>c.command==='ae.presets.timing').args,{operation:'align',phase:'in',frames:0,order:'forward'});
 assert.match(f.workspace.element.allText,/Marcadores organizados/);
});
test('workspace timing protects unsaved drafts and exposes host collision failures',async t=>{
 const f=await fixture(t);f.change(123);assert.equal(f.button('Alinhar marcadores').disabled,true);f.button('Alinhar marcadores').click();assert.equal(f.calls.some(c=>c.command==='ae.presets.timing'),false);
 f.button('Descartar ajustes').click();await setImmediate();f.failTiming();f.button('Alinhar marcadores').click();await setImmediate();assert.match(f.workspace.element.allText,/Destino ocupado/);assert.equal(f.intensity().value,'100');
});
