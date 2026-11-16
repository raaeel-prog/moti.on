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

function fixture(t,{locale='pt-BR',busy=false,twoPhases=false,sharedInstance=false,live,frameRate=24,dropFrame=false,phases,disclosures}={}){
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
  const inspection={state:'ready',message:'',layerName:'Title',target:{compId:1,layerId:2,instance:'one',fingerprint:'a'},phases:phases??[phase],frameRate,dropFrame};
  if(twoPhases)inspection.phases.push({...phase,phase:'out',instance:sharedInstance?'in-one':'out-one',options:{...phaseOptions,phase:'out'}});
  const calls=[],dirty=[];
  const editor=createPresetPhaseEditor(doc,{locale,inspection,busy,live,disclosures,reveal:id=>calls.push({reveal:id}),copy:value=>calls.push({copy:value}),execute:(command,args)=>calls.push({command,args:structuredClone(args)}),onDirty:value=>dirty.push(value)});
  t.after(()=>editor.dispose());
  const inputs=()=>editor.element.getElementsByTagName('input');
  const input=(key,phase='in')=>inputs().find(node=>node.id===`phase-${phase}-one-${phase}-${key}`);
  const buttons=label=>editor.element.getElementsByTagName('button').filter(node=>node.allText===label||node.getAttribute('aria-label')===label);
  const edit=(node,value,type='input')=>{node.value=String(value);node.emit(type);};
  const message=node=>editor.element.getElementsByTagName('p').find(item=>item.id===node.getAttribute('aria-describedby'));
  return {doc,editor,inspection,calls,dirty,input,buttons,edit,message};
}

test('phase validation keeps the invalid draft and explains how to correct the same field',t=>{
  const f=fixture(t),number=f.input('intensity');
  assert.equal(f.buttons('Aplicar ajustes').length,0);
  f.edit(number,'401');
  assert.equal(number.value,'401');assert.equal(number.getAttribute('aria-invalid'),'true');
  assert.equal(f.message(number).textContent,'Use um número entre 0 e 300.');
  assert.equal(f.message(number).hidden,false);assert.equal(f.message(number).getAttribute('aria-live'),'polite');
  assert.equal(f.dirty.at(-1),true);number.emit('change');assert.equal(f.calls.length,0);
  f.edit(number,'151,5','change');
  assert.equal(number.value,'151,5');assert.equal(number.getAttribute('aria-invalid'),'false');
  assert.equal(number.getAttribute('aria-describedby'),undefined);
  assert.equal(f.calls[0].command,'ae.presets.phase-adjust');assert.equal(f.calls[0].args.options.intensity,151.5);
  assert.equal(f.inspection.phases[0].options.intensity,100,'editing never changes the inspected snapshot');
  f.edit(number,'100');assert.equal(f.dirty.at(-1),false);
});

test('integer validation rejects partial, fractional, out-of-range and nondecimal drafts in English',t=>{
  const f=fixture(t,{locale:'en-US'}),duration=f.input('durationFrames');
  for(const value of ['', '-', '0', '601', '1.5', '0x10']){
    f.edit(duration,value);assert.equal(duration.value,value);assert.equal(duration.getAttribute('aria-invalid'),'true');
    assert.equal(f.message(duration).textContent,'Enter a whole number between 1 and 600.');
    duration.emit('change');assert.equal(f.calls.length,0);
  }
  f.edit(duration,'48','change');
  assert.equal(f.calls[0].args.options.durationFrames,48);
});

test('both phases retain independent validation and expose an explicit action hierarchy',t=>{
  const f=fixture(t,{twoPhases:true});
  f.edit(f.input('intensity'),'401');f.edit(f.input('durationFrames','out'),'1.5');
  const firstError=f.message(f.input('intensity')),lastError=f.message(f.input('durationFrames','out'));
  assert.notEqual(firstError.id,lastError.id);
  f.edit(f.input('intensity'),'100');assert.equal(f.dirty.at(-1),true);
  f.edit(f.input('durationFrames','out'),'40');assert.equal(f.dirty.at(-1),false);
  assert.equal(f.buttons('Aplicar ajustes').length,0);
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
  busy.input('offset').keydown('Enter');busy.buttons('Atrasar um frame')[0].click();busy.input('durationFrames').emit('change');
  assert.equal(busy.calls.length,0);
});

test('live dragging keeps its existing callback lifecycle and cancel restores the local draft',t=>{
  const gestures=[];
  const f=fixture(t,{live:{start:(phase,key,value)=>{gestures.push(['start',phase.phase,key,value]);return true;},update:value=>gestures.push(['update',value]),finish:(canceled,value)=>gestures.push(['finish',canceled,value])}});
  const number=f.input('intensity');
  number.emit('pointerdown',{clientX:100});f.doc.emit('pointermove',{clientX:140});
  assert.equal(number.value,'101');assert.equal(number.getAttribute('aria-invalid'),'false');
  f.doc.emit('keydown',{key:'Escape'});
  assert.equal(number.value,'100');assert.equal(f.dirty.at(-1),false);assert.equal(f.calls.length,0);
  assert.deepEqual(gestures,[['start','in','intensity',100],['update',101],['update',100],['finish',true,100]]);
});

test('numeric dragging without the native bridge applies once on release and Escape only cancels',t=>{
  const f=fixture(t),number=f.input('durationFrames'),slider=f.input('durationFrames-slider');
  assert.equal(number.getAttribute('data-scrubbable-number'),'true');
  number.emit('pointerdown',{clientX:100});f.doc.emit('pointermove',{clientX:140});assert.equal(f.calls.length,0);f.doc.emit('pointerup');
  assert.equal(number.value,'50');assert.equal(slider.value,'50');
  assert.equal(f.editor.drafts().in.options.durationFrames,50);assert.equal(f.calls.length,1);
  number.emit('pointerdown',{clientX:100});f.doc.emit('pointermove',{clientX:180});f.doc.emit('keydown',{key:'Escape'});
  assert.equal(number.value,'50');assert.equal(slider.value,'50');assert.equal(f.calls.length,1);
  assert.equal(f.calls[0].args.options.durationFrames,50);number.emit('change');assert.equal(f.calls.length,1);
  f.editor.setBlocked(true);number.emit('pointerdown',{clientX:100});f.doc.emit('pointermove',{clientX:180});f.doc.emit('pointerup');
  assert.equal(number.value,'50');
});

test('host Float32 tails display compactly without creating a draft or a command on cancel',t=>{
  const options={phase:'in',direction:'preset',durationFrames:40,intensity:76.5999984741211,staggerFrames:2,unit:'preset',elasticity:0,overlap:70,speed:100,easing:'preset',order:'preset',seed:17};
  const f=fixture(t,{phases:[{phase:'in',instance:'in-one',presetId:'studio-letter-silk-rise',markerTime:1,options,controls:[]}]}),number=f.input('intensity');
  assert.equal(number.value,'76.6');assert.equal(f.dirty.at(-1),false);assert.equal(f.calls.length,0);
  number.emit('pointerdown',{clientX:100});f.doc.emit('pointermove',{clientX:140});f.doc.emit('keydown',{key:'Escape'});
  assert.equal(number.value,'76.6');assert.equal(f.dirty.at(-1),false);assert.equal(f.calls.length,0);
  assert.equal(f.inspection.phases[0].options.intensity,76.5999984741211);
});

test('percentage fields keep untouched fractional host values when another parameter commits',t=>{
  const options={phase:'in',direction:'preset',durationFrames:40,intensity:100,staggerFrames:2,unit:'preset',elasticity:35.4,overlap:70.599998474121,easing:'spring',speed:100};
  const f=fixture(t,{phases:[{phase:'in',instance:'in-one',presetId:'studio-letter-silk-rise',markerTime:1,options,controls:[]}]});
  assert.equal(f.input('overlap').value,'70.6');assert.equal(f.input('elasticity').value,'35.4');assert.equal(f.dirty.at(-1),false);
  f.edit(f.input('intensity'),101,'change');
  assert.equal(f.calls[0].args.options.overlap,70.599998474121);assert.equal(f.calls[0].args.options.elasticity,35.4);
});

test('disclosure UI state is separate from parameter drafts and scoped to the phase instance',t=>{
  const disclosures=new Set(['in-one:in:intensity']),f=fixture(t,{disclosures});
  const toggle=f.input('intensity').parentNode.children[0];
  assert.equal(toggle.getAttribute('aria-expanded'),'true');assert.equal(f.calls.length,0);assert.equal(f.dirty.at(-1),false);
  toggle.emit('click');assert.equal(disclosures.has('in-one:in:intensity'),false);
  toggle.emit('click');assert.equal(disclosures.has('in-one:in:intensity'),true);
});

test('slider progress follows the numeric draft, mixed state disables the absolute slider and default reset is inactive',t=>{
  const f=fixture(t),number=f.input('intensity'),range=f.input('intensity-slider'),reset=number.parentNode.children[2];
  assert.equal(reset.disabled,true);f.edit(number,'150');assert.equal(range.style['--ch-slider-progress'],'50%');assert.equal(reset.disabled,false);
  number.setAttribute('data-mixed','true');f.edit(number,'');assert.equal(range.disabled,true);assert.equal(range.parentNode.parentNode.getAttribute('data-mixed'),'true');
  assert.equal(reset.disabled,false);
});

test('clicking Reset after typing commits its default instead of applying the blurred draft first',async t=>{
  const f=fixture(t),number=f.input('durationFrames'),reset=number.parentNode.children[2];
  f.edit(f.input('intensity'),135);number.focus();f.edit(number,60);f.doc.emit('pointerdown',{target:reset});number.emit('blur');
  assert.equal(f.calls.length,0);f.doc.emit('pointerup');reset.emit('click');await new Promise(resolve=>setTimeout(resolve,5));
  assert.equal(f.calls.length,1);assert.equal(f.calls[0].args.options.durationFrames,Number(number.value));assert.notEqual(number.value,'60');
});

test('checkbox click incorporates a typed value in one confirmation after pointer release',async t=>{
  const f=fixture(t),number=f.input('intensity'),box=f.input('motion-blur');
  number.focus();f.edit(number,140);f.doc.emit('pointerdown',{target:box});number.emit('blur');assert.equal(f.calls.length,0);
  f.doc.emit('pointerup');box.checked=true;box.emit('change');await new Promise(resolve=>setTimeout(resolve,5));
  assert.equal(f.calls.length,1);assert.equal(f.calls[0].args.options.intensity,140);assert.equal(f.calls[0].args.options.motionBlur,true);
});


test('a stacked effect row shows loop controls, its window and shifts the effect cue',t=>{
  const options={phase:'in',direction:'preset',durationFrames:24,intensity:100,staggerFrames:2,unit:'preset',elasticity:30,overlap:65,speed:100,easing:'preset',order:'preset',seed:17};
  const effect={phase:'effect',instance:'one-3',presetId:'momentum-spin-loop',markerTime:0,markerDuration:4,options,controls:[{key:'intensity',name:'Intensity',type:'number',min:0,max:300,unit:'%'},{key:'speed',name:'Speed',type:'number',min:25,max:200,unit:'%'}]};
  const f=fixture(t,{live:{start:()=>true,update(){},finish(){}},frameRate:30,phases:[effect]});
  const inputs=f.editor.element.getElementsByTagName('input'),ids=inputs.map(node=>node.id);
  assert.ok(ids.includes('phase-one-3-effect-intensity'));assert.ok(ids.includes('phase-one-3-effect-speed'));
  assert.ok(!ids.includes('phase-one-3-effect-durationFrames'),'no transition length');
  assert.equal(f.editor.element.getElementsByTagName('select').length,0,'no curve for a loop');
  const text=f.editor.element.allText;
  assert.match(text,/Efeito: Rotação contínua/);assert.match(text,/Janela de 120 frames/);assert.match(text,/Deslocar efeito/);
  assert.match(inputs.find(node=>node.id==='phase-one-3-effect-intensity').title,/Solte para aplicar/);
  f.buttons('Atrasar um frame')[0].emit('click');
  assert.deepEqual(f.calls.at(-1),{command:'ae.presets.phase-timing',args:{target:f.inspection.target,phase:'effect',frames:1}});
});

test('settle fields never start a native drag the bridge would refuse',t=>{
  const started=[];
  const options={phase:'in',direction:'preset',durationFrames:30,intensity:100,staggerFrames:2,unit:'preset',elasticity:30,overlap:65,speed:100,easing:'settle-wave',order:'preset',seed:17,settleAmount:35,settleCount:2.5,settleDamping:55};
  const entrance={phase:'in',instance:'one-1',presetId:'momentum-push',markerTime:1,options,controls:['intensity','settleAmount'].map(key=>({key,name:key,type:'number',min:0,max:300,unit:'%'}))};
  const f=fixture(t,{live:{start:(phase,key)=>{started.push(key);return true;},update(){},finish(){}},phases:[entrance]});
  const inputs=f.editor.element.getElementsByTagName('input');
  const settle=inputs.find(node=>node.id==='phase-one-1-in-settleAmount');
  settle.emit('pointerdown',{clientX:100});f.doc.emit('pointermove',{clientX:140});f.doc.emit('pointerup');
  assert.deepEqual(started,[]);assert.equal(f.calls[0].command,'ae.presets.phase-adjust');
});

test('a classic easing family exposes its acceleration and applies the combined curve',t=>{
  const options={phase:'in',direction:'preset',durationFrames:30,intensity:100,staggerFrames:2,unit:'preset',elasticity:30,overlap:65,speed:100,easing:'expo-out',order:'preset',seed:17};
  const entrance={phase:'in',instance:'one-1',presetId:'momentum-push',markerTime:1,options,controls:[]};
  const f=fixture(t,{phases:[entrance]}),selects=f.editor.element.getElementsByTagName('select');
  const curve=selects.find(node=>node.id==='phase-one-1-in-easing'),shape=selects.find(node=>node.id==='phase-one-1-in-easing-shape');
  assert.equal(curve.value,'expo-out');assert.equal(shape.value,'out');
  assert.equal(curve.getElementsByTagName('option').filter(node=>node.textContent==='Exponencial').length,1,'one entry per family');
  shape.value='in-out';shape.emit('change');
  assert.equal(f.calls.at(-1).args.options.easing,'expo-in-out');
  curve.value='smooth';curve.emit('change');
  let node=shape,hidden=false;while(node){hidden||=node.hidden===true;node=node.parentElement??node.parentNode;}
  assert.equal(hidden,true,'acceleration hides for other curves');
});

test('motion blur is a per-phase request sent with the adjusted options',t=>{
  const options={phase:'in',direction:'preset',durationFrames:30,intensity:100,staggerFrames:2,unit:'preset',elasticity:30,overlap:65,speed:100,easing:'preset',order:'preset',seed:17};
  const f=fixture(t,{phases:[{phase:'in',instance:'one-1',presetId:'momentum-push',markerTime:1,options,controls:[]}]});
  const box=f.editor.element.getElementsByTagName('input').find(node=>node.id==='phase-one-1-in-motion-blur');
  assert.equal(box.type,'checkbox');assert.equal(box.checked,false);
  box.checked=true;box.emit('change');
  assert.equal(f.calls.at(-1).command,'ae.presets.phase-adjust');assert.equal(f.calls.at(-1).args.options.motionBlur,true);
});

test('disclosed sliders apply once on release and local reset preserves sibling values',async t=>{
  const f=fixture(t),number=f.input('intensity'),slider=f.input('intensity-slider');
  const header=number.parentNode,wrapper=header.parentNode,body=wrapper.children[1];
  const toggle=header.children[0],reset=header.children[2];
  assert.equal(body.hidden,true);assert.equal(toggle.getAttribute('aria-expanded'),'false');
  assert.equal(toggle.getAttribute('aria-controls'),body.id);toggle.emit('click');
  assert.equal(body.hidden,false);assert.equal(toggle.getAttribute('aria-expanded'),'true');
  f.edit(number,'145,5');assert.equal(slider.value,'145.5');
  f.edit(f.input('durationFrames'),'60');
  slider.emit('pointerdown');f.edit(slider,180);assert.equal(f.calls.length,0);f.doc.emit('pointerup');
  assert.equal(number.value,'180');assert.equal(f.editor.drafts().in.options.intensity,180);
  assert.equal(f.calls.length,1);assert.equal(f.calls[0].args.options.intensity,180);await Promise.resolve();
  reset.emit('click');assert.equal(number.value,'100');assert.equal(slider.value,'100');
  assert.equal(f.editor.drafts().in.options.durationFrames,60);assert.equal(f.calls.length,2);
  f.edit(number,'401');assert.equal(slider.disabled,true);assert.equal(number.value,'401');
  reset.emit('click');assert.equal(slider.disabled,false);assert.equal(number.getAttribute('aria-invalid'),'false');
  assert.equal(f.input('offset-slider'),undefined);assert.equal(f.input('seed-slider'),undefined);
});

test('slider pointer and keyboard gestures preserve live lifecycle, cancellation and gating',t=>{
  const gestures=[];
  const f=fixture(t,{live:{start:(phase,key,value)=>{gestures.push(['start',key,value]);return true;},update:value=>gestures.push(['update',value]),finish:(canceled,value)=>gestures.push(['finish',canceled,value])}});
  const slider=f.input('intensity-slider'),number=f.input('intensity');
  slider.emit('pointerdown');slider.emit('mousedown');f.edit(slider,150);f.doc.emit('keydown',{key:'Escape'});
  assert.equal(number.value,'100');assert.equal(slider.value,'100');
  assert.deepEqual(gestures,[['start','intensity',100],['update',150],['update',100],['finish',true,100]]);
  gestures.length=0;
  slider.emit('keydown',{key:'ArrowRight'});f.edit(slider,100.1);slider.emit('change');slider.emit('keyup',{key:'ArrowRight'});
  assert.deepEqual(gestures,[['start','intensity',100],['update',100.1],['finish',false,100.1]]);
  gestures.length=0;slider.emit('pointerdown');f.edit(slider,170);f.editor.setBlocked(true);
  assert.equal(number.value,'100.1');assert.equal(slider.disabled,true);assert.deepEqual(gestures.at(-1),['finish',true,100.1]);
  const before=gestures.length;slider.emit('pointerdown');f.edit(slider,200);number.parentNode.children[2].emit('click');
  assert.equal(gestures.length,before);assert.equal(number.value,'100.1');assert.equal(f.calls.length,0);
});

test('failed slider live start keeps the draft, and unsupported controls stay local',t=>{
  const started=[];
  const f=fixture(t,{live:{start:(_phase,key)=>{started.push(key);return false;},update(){assert.fail('must not update');},finish(){assert.fail('must not finish');}}});
  const slider=f.input('intensity-slider');slider.emit('pointerdown');slider.emit('mousedown');f.edit(slider,150);f.doc.emit('pointerup');
  assert.deepEqual(started,['intensity']);assert.equal(f.input('intensity').value,'100');
  const duration=f.input('durationFrames-slider');duration.emit('pointerdown');f.edit(duration,45);f.doc.emit('pointerup');
  assert.equal(f.input('durationFrames').value,'45');assert.equal(f.calls.length,1);
  assert.equal(f.calls[0].args.options.durationFrames,45);
});

test('an exit phase of text chooses its order; an entrance has none',t=>{
  const f=fixture(t,{twoPhases:true}),selects=()=>f.editor.element.getElementsByTagName('select');
  assert.equal(selects().find(node=>node.id==='phase-in-one-in-exitOrder'),undefined,'an entrance has no exit order');
  const exit=selects().find(node=>node.id==='phase-out-one-out-exitOrder');
  assert.equal(exit.value,'mirror','absent means mirrored, the legacy order');
  assert.deepEqual(exit.getElementsByTagName('option').map(node=>node.textContent),['Espelhada','Na mesma ordem']);
  exit.value='repeat';exit.emit('change');
  assert.equal(f.calls.at(-1).command,'ae.presets.phase-adjust');assert.equal(f.calls.at(-1).args.options.exitOrder,'repeat');
});

test('a travelling recipe offers the four diagonals; a reveal keeps its four sides',t=>{
  const options={phase:'in',direction:'preset',durationFrames:30,intensity:100,staggerFrames:2,unit:'preset',elasticity:30,overlap:65,speed:100,easing:'preset',order:'preset',seed:17};
  const directions=presetId=>{const f=fixture(t,{phases:[{phase:'in',instance:'one-1',presetId,markerTime:1,options,controls:[]}]});
    return f.editor.element.getElementsByTagName('select').find(node=>node.id==='phase-one-1-in-direction').getElementsByTagName('option').map(node=>node.value);};
  assert.deepEqual(directions('momentum-push'),['preset','bottom','left','right','top','top-left','top-right','bottom-left','bottom-right']);
  assert.deepEqual(directions('reveal-curtain'),['preset','bottom','left','right','top']);
});
