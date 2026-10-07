import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {createCepDocument} from './cep-dom.mjs';

const built=await build({
  entryPoints:[fileURLToPath(new URL('../client/src/preset-phase-editor.ts',import.meta.url))],
  alias:{'@motion/ui-core':fileURLToPath(new URL('../../../packages/ui-core/src/index.ts',import.meta.url))},
  bundle:true,platform:'node',format:'esm',write:false
});
const {createPresetPhaseEditor}=await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);

function events(target){
  const listeners=new Map();
  target.addEventListener=(type,callback)=>listeners.set(type,[...(listeners.get(type)??[]),callback]);
  target.removeEventListener=(type,callback)=>listeners.set(type,(listeners.get(type)??[]).filter(item=>item!==callback));
  target.emit=(type,init={})=>{
    const event={type,target,currentTarget:target,button:0,clientX:0,pointerId:1,isPrimary:true,
      defaultPrevented:false,preventDefault(){this.defaultPrevented=true;},stopPropagation(){},...init};
    for(const callback of [...(listeners.get(type)??[])])callback(event);
    return event;
  };
  target.dispatchEvent=event=>{target.emit(event.type,event);return true;};
  return target;
}

function fixture(t,{locale='pt-BR',busy=false,twoPhases=false,sharedInstance=false,live,frameRate=24,dropFrame=false}={}){
  const doc=events(createCepDocument()),create=doc.createElement.bind(doc);
  doc.defaultView=events({});
  doc.createEvent=()=>({initEvent(type){this.type=type;}});
  doc.createElement=tag=>{
    const node=events(create(tag));
    node.classList.remove=(...names)=>{node.className=node.className.split(/\s+/).filter(name=>!names.includes(name)).join(' ');};
    node.blur=()=>{if(doc.activeElement===node)doc.activeElement=null;node.emit('blur');};
    return node;
  };
  const phaseOptions={phase:'in',direction:'bottom',durationFrames:40,intensity:100,staggerFrames:2,unit:'preset',elasticity:0,overlap:70,speed:100,easing:'preset',order:'preset',seed:17};
  const phase={phase:'in',instance:'in-one',presetId:'studio-letter-silk-rise',markerTime:1,options:{...phaseOptions},controls:[{key:'intensity',name:'Intensity',type:'number',min:0,max:300,unit:'%'}]};
  const inspection={state:'ready',message:'',layerName:'Title',target:{compId:1,layerId:2,instance:'one',fingerprint:'a'},phases:[phase],frameRate,dropFrame};
  if(twoPhases)inspection.phases.push({...phase,phase:'out',instance:sharedInstance?'in-one':'out-one',options:{...phaseOptions,phase:'out'}});
  const calls=[],dirty=[];
  const editor=createPresetPhaseEditor(doc,{locale,inspection,busy,live,reveal:id=>calls.push({reveal:id}),copy:value=>calls.push({copy:value}),execute:(command,args)=>calls.push({command,args:structuredClone(args)}),onDirty:value=>dirty.push(value)});
  t.after(()=>editor.dispose());
  const inputs=()=>editor.element.getElementsByTagName('input');
  const input=(key,phase='in')=>inputs().find(node=>node.id===`phase-${phase}-one-${phase}-${key}`);
  const buttons=label=>editor.element.getElementsByTagName('button').filter(node=>node.allText===label||node.getAttribute('aria-label')===label);
  const edit=(node,value,type='input')=>{node.value=String(value);node.emit(type);};
  const message=node=>editor.element.getElementsByTagName('p').find(item=>item.id===node.getAttribute('aria-describedby'));
  return {doc,editor,inspection,calls,dirty,input,buttons,edit,message};
}

test('phase validation keeps the invalid draft and explains how to correct the same field',t=>{
  const f=fixture(t),number=f.input('intensity'),apply=f.buttons('Aplicar ajustes')[0];
  assert.equal(apply.disabled,true);assert.match(apply.title,/Altere um parâmetro/);
  f.edit(number,'401');
  assert.equal(number.value,'401');assert.equal(number.getAttribute('aria-invalid'),'true');
  assert.equal(f.message(number).textContent,'Use um número entre 0 e 300.');
  assert.equal(f.message(number).hidden,false);assert.equal(f.message(number).getAttribute('aria-live'),'polite');
  assert.equal(f.dirty.at(-1),true);assert.equal(apply.disabled,true);assert.match(apply.title,/Corrija os campos/);
  apply.click();assert.equal(f.calls.length,0);
  f.edit(number,'151,5','change');
  assert.equal(number.value,'151,5');assert.equal(number.getAttribute('aria-invalid'),'false');
  assert.equal(number.getAttribute('aria-describedby'),undefined);assert.equal(apply.disabled,false);
  assert.equal(apply.title,'Aplicar ajustes');apply.click();
  assert.equal(f.calls[0].command,'ae.presets.phase-adjust');assert.equal(f.calls[0].args.options.intensity,151.5);
  assert.equal(f.inspection.phases[0].options.intensity,100,'editing never changes the inspected snapshot');
  f.edit(number,'100');assert.equal(apply.disabled,true);assert.equal(f.dirty.at(-1),false);
});

test('integer validation rejects partial, fractional, out-of-range and nondecimal drafts in English',t=>{
  const f=fixture(t,{locale:'en-US'}),duration=f.input('durationFrames');
  for(const value of ['', '-', '0', '601', '1.5', '0x10']){
    f.edit(duration,value);assert.equal(duration.value,value);assert.equal(duration.getAttribute('aria-invalid'),'true');
    assert.equal(f.message(duration).textContent,'Enter a whole number between 1 and 600.');
    assert.equal(f.buttons('Apply changes')[0].disabled,true);
  }
  f.edit(duration,'48');f.buttons('Apply changes')[0].click();
  assert.equal(f.calls[0].args.options.durationFrames,48);
});

test('both phases retain independent validation and expose an explicit action hierarchy',t=>{
  const f=fixture(t,{twoPhases:true});
  f.edit(f.input('intensity'),'401');f.edit(f.input('durationFrames','out'),'1.5');
  const firstError=f.message(f.input('intensity')),lastError=f.message(f.input('durationFrames','out'));
  assert.notEqual(firstError.id,lastError.id);
  f.edit(f.input('intensity'),'100');assert.equal(f.dirty.at(-1),true);
  f.edit(f.input('durationFrames','out'),'40');assert.equal(f.dirty.at(-1),false);
  assert.ok(f.buttons('Aplicar ajustes').every(node=>node.className.includes('ch-action-button--primary')));
  assert.ok(f.buttons('Remover').every(node=>node.className.includes('ch-button--destructive')));
  assert.ok(f.buttons('Descartar').every(node=>node.className.includes('ch-button--tertiary')));
  assert.equal(f.buttons('Antecipar um frame')[0].title,'Antecipar um frame');
  f.buttons('Antecipar um frame')[0].click();f.buttons('Atrasar um frame')[1].click();
  assert.deepEqual(f.calls.map(call=>[call.command,call.args.phase,call.args.frames]),[['ae.presets.phase-timing','in',-1],['ae.presets.phase-timing','out',1]]);
});

test('phase selectors have unique label targets even when phase instances match',t=>{
  const f=fixture(t,{twoPhases:true,sharedInstance:true});
  const selects=f.editor.element.getElementsByTagName('select');
  const ids=selects.map(node=>node.id);
  assert.equal(ids.length,new Set(ids).size);
  assert.ok(ids.some(id=>id.includes('-in-easing')));
  assert.ok(ids.some(id=>id.includes('-out-easing')));
});

test('invalid frame offsets stay visible until corrected and valid timecode sends one timing command',t=>{
  const f=fixture(t),offset=f.input('offset');
  for(const value of ['-', '601', '-601', '1.5', '00:00:00:24']){
    f.edit(offset,value);offset.keydown('Enter');
    assert.equal(offset.value,value);assert.equal(offset.getAttribute('aria-invalid'),'true');
    assert.match(f.message(offset).textContent,/−600 e 600/);assert.equal(f.dirty.at(-1),true);
    assert.equal(f.calls.length,0);
  }
  f.edit(offset,'+00:00:01:01');assert.equal(f.dirty.at(-1),true);
  offset.keydown('Enter');assert.equal(f.calls.length,1);assert.equal(f.calls[0].args.frames,25);
  assert.equal(offset.value,'00:00:00:00');assert.equal(offset.getAttribute('aria-invalid'),'false');
  assert.equal(f.dirty.at(-1),false);
});

test('offset escape cancels only its pending draft and keeps dirty numeric parameters',t=>{
  const f=fixture(t),offset=f.input('offset');
  f.edit(f.input('intensity'),'130');f.edit(offset,'bad');offset.keydown('Escape');
  assert.equal(offset.value,'00:00:00:00');assert.equal(offset.getAttribute('aria-invalid'),'false');
  assert.equal(f.input('intensity').value,'130');assert.equal(f.dirty.at(-1),true);assert.equal(f.calls.length,0);
});

test('drop-frame offset validation and busy controls do not send invalid timing commands',t=>{
  const drop=fixture(t,{locale:'en-US',frameRate:30000/1001,dropFrame:true}),offset=drop.input('offset');
  drop.edit(offset,'00:01:00;00');offset.keydown('Enter');
  assert.match(drop.message(offset).textContent,/valid HH:MM:SS:FF/);assert.equal(drop.calls.length,0);
  const busy=fixture(t,{busy:true});busy.edit(busy.input('durationFrames'),'50');busy.edit(busy.input('offset'),'12');
  busy.input('offset').keydown('Enter');busy.buttons('Atrasar um frame')[0].click();busy.buttons('Aplicar ajustes')[0].click();
  assert.equal(busy.calls.length,0);assert.equal(busy.buttons('Aplicar ajustes')[0].title,'Aguarde a operação atual.');
});

test('live dragging keeps its existing callback lifecycle and cancel restores the local draft',t=>{
  const gestures=[];
  const f=fixture(t,{live:{start:(phase,key,value)=>{gestures.push(['start',phase.phase,key,value]);return true;},update:value=>gestures.push(['update',value]),finish:(canceled,value)=>gestures.push(['finish',canceled,value])}});
  const number=f.input('intensity'),row=number.parentNode;
  row.emit('pointerdown',{clientX:100});f.doc.emit('pointermove',{clientX:140});
  assert.equal(number.value,'101');assert.equal(number.getAttribute('aria-invalid'),'false');
  f.doc.emit('keydown',{key:'Escape'});
  assert.equal(number.value,'100');assert.equal(f.dirty.at(-1),false);assert.equal(f.calls.length,0);
  assert.deepEqual(gestures,[['start','in','intensity',100],['update',101],['update',100],['finish',true,100]]);
});

