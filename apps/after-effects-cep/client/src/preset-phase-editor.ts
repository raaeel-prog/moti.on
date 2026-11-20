import {attachCompactNumberEditing, attachScrubbableNumber, createNumberDisclosure, button, createElement, createI18n, createIcon, selectField} from "@motion/ui-core";
import {MOTION_SETTLE_DEFAULTS, libraryDirectionAllowed, libraryUsesDiagonals, libraryUsesDirection, type PresetInspection, type PresetPhaseInspection, type PresetPhaseRole} from "@motion/contracts";
import {createEasingShapeField, motionBlurField, defaultLibraryOptions, GALLERY_PRESETS, gallerySequenceControls, presetEasingChoices, settleFieldLabels} from "./preset-gallery.js";
import {formatPresetOffset,parsePresetOffset} from "./preset-timecode.js";

/** Visible name of a slot; the effect is the loop or look stacked with In/Out. */
export function presetPhaseLabel(phase:PresetPhaseRole,locale:string):string {
  const pt=locale.startsWith("pt");
  return phase==="in"?(pt?"Entrada":"In"):phase==="out"?(pt?"Saída":"Out"):(pt?"Efeito":"Effect");
}

/** Parameters the native drag bridge accepts (plugin/gesture), on In and Out only. */
const LIVE_KEYS=new Set(["durationFrames","intensity","staggerFrames","elasticity","overlap","seed"]);

/** Session-only drafts; property and layer references never leave the host. */
export interface PresetPhaseDraft { options: PresetPhaseInspection["options"]; numbers: Record<string,string>; offset: string; }
export type PresetPhaseDrafts = Record<string,PresetPhaseDraft>;

export function createPresetPhaseEditor(doc:Document, options:{
  locale:string; inspection:PresetInspection; busy:boolean;
  reveal(id:string):void; copy(phase:PresetPhaseInspection):void;
  execute(command:string,args:Record<string,unknown>):void|Promise<void>;
  onDirty(dirty:boolean):void;
  drafts?:PresetPhaseDrafts;
  /** Session UI state, separate from the host parameters and pending drafts. */
  disclosures?:Set<string>;
  live?:{start(phase:PresetPhaseInspection,key:string,initial:number):boolean;update(value:number):void;finish(canceled:boolean,value:number):void};
}):{element:HTMLElement;drafts():PresetPhaseDrafts;setBlocked(blocked:boolean,busy?:boolean):void;dispose():void} {
  const cleanups:Array<()=>void>=[],dirtyPhases=new Set<string>(),pendingOffsets=new Set<string>();
  const draftReaders:Array<()=>[string,PresetPhaseDraft]>=[];
  const hostActions:HTMLButtonElement[]=[],refreshers:Array<()=>void>=[],sliders:Array<ReturnType<typeof createNumberDisclosure>>=[];
  let blocked=false,disposed=false;
  const i18n=createI18n({locale:options.locale}),pt=i18n.locale()==="pt-BR",data=options.inspection;
  const reportDirty=():void=>options.onDirty(dirtyPhases.size>0||pendingOffsets.size>0);
  const element=createElement(doc,"div","ch-phase-editor");
  let pointerHeld=false,releaseTimer:ReturnType<typeof setTimeout>|undefined;
  const releaseCommits=new Set<()=>void>();
  let releaseBatch:Array<()=>void>|undefined;
  const press=(event:Event):void=>{if(element.contains(event.target as Node))pointerHeld=true;};
  const release=():void=>{const pending=pointerHeld||releaseCommits.size>0;pointerHeld=false;if(!pending)return;clearTimeout(releaseTimer);releaseTimer=setTimeout(()=>{
    releaseTimer=undefined;const commits=[...releaseCommits];releaseCommits.clear();releaseBatch=[];
    // Prepare every phase before the first host operation can replace this view.
    for(const commit of commits)commit();const batch=releaseBatch;releaseBatch=undefined;for(const dispatch of batch)dispatch();
  },0);};
  const cancelPress=():void=>{pointerHeld=false;releaseCommits.clear();clearTimeout(releaseTimer);};
  doc.addEventListener("pointerdown",press,true);doc.addEventListener("pointerup",release,true);doc.addEventListener("pointercancel",cancelPress,true);
  cleanups.push(()=>{cancelPress();doc.removeEventListener("pointerdown",press,true);doc.removeEventListener("pointerup",release,true);doc.removeEventListener("pointercancel",cancelPress,true);});
  const selected=createElement(doc,"div","ch-phase-layer");
  // Aba Editar enxuta (2026-11-18): o nome da camada basta; nada de rótulo nem seção "Presets".
  selected.appendChild(createElement(doc,"strong","",data.layerName??""));selected.title=pt?"Camada selecionada":"Selected layer";element.appendChild(selected);
  const section=createElement(doc,"div","ch-edit-section ch-edit-section--phases");element.appendChild(section);
  for(const phase of data.phases??[]){
    const preset=GALLERY_PRESETS.find(item=>item.motion?.id===phase.presetId)?.motion;if(!preset)continue;
    const row=doc.createElement("details");row.className="ch-phase-instance";row.open=true;row.dataset.phase=phase.phase;
    const title=createElement(doc,"summary","ch-phase-heading");
    const name=presetPhaseLabel(phase.phase,options.locale),effect=phase.phase==="effect";
    title.appendChild(createElement(doc,"span","ch-phase-title",`${name}: ${preset.name[pt?"pt-BR":"en-US"]}`));
    row.appendChild(title);section.appendChild(row);
    const actions=createElement(doc,"div","ch-phase-actions");row.appendChild(actions);
    const command=(action:"remove"|"reset"):void=>{if(!disposed&&!options.busy&&!blocked)options.execute("ae.presets.phase-action",{target:data.target,phase:phase.phase,action});};
    const body=createElement(doc,"div","ch-phase-parameters");row.appendChild(body);
    // Só o essencial fica aberto; o resto do preset mora em "Mais ajustes", recolhido.
    const moreKey=`more:${phase.phase}`,more=doc.createElement("details");more.className="ch-phase-more";more.open=options.disclosures?.has(moreKey)??false;
    more.addEventListener("toggle",()=>{if(more.open)options.disclosures?.add(moreKey);else options.disclosures?.delete(moreKey);});
    more.appendChild(createElement(doc,"summary","ch-phase-more__summary",pt?"Mais ajustes":"More settings"));
    const moreBody=createElement(doc,"div","ch-phase-more__body");more.appendChild(moreBody);
    const moreActions=createElement(doc,"div","ch-phase-actions ch-phase-more__actions");
    for(const [label,variant,onClick,target] of [
      [pt?"Restaurar":"Reset","tertiary",()=>command("reset"),actions],
      [pt?"Remover":"Remove","destructive",()=>command("remove"),actions],
      [pt?"Mostrar na biblioteca":"Show in library","tertiary",()=>options.reveal(phase.presetId),moreActions],
      [pt?"Copiar ajustes":"Copy settings","tertiary",()=>options.copy(phase),moreActions]
    ] as const){const action=button(doc,{label,variant,disabled:options.busy,onClick});action.classList.add("ch-phase-link");target.appendChild(action);if(variant==="destructive"||label===(pt?"Restaurar":"Reset"))hostActions.push(action);}
    let host:HTMLElement=body;
    const dragHint=createElement(doc,"p","ch-preset-hint");dragHint.hidden=true;body.appendChild(dragHint);
    const saved=options.drafts?.[phase.phase],baseline={...phase.options},draft={...(saved?.options??phase.options)},valid=new Map<string,boolean>(),numberInputs=new Map<string,HTMLInputElement>();let dirty=false;
    let submitting=false,submitted:string|undefined;
    const feedback=createElement(doc,"p","ch-preset-hint");feedback.hidden=true;feedback.setAttribute("role","status");body.appendChild(feedback);
    const update=():void=>{
      const invalid=[...valid.values()].some(value=>!value);
      dirty=JSON.stringify(draft)!==JSON.stringify(baseline);
      if(dirty||invalid)dirtyPhases.add(phase.phase);else dirtyPhases.delete(phase.phase);
      reportDirty();feedback.setAttribute("data-invalid",String(invalid));
    };
    const commit=():void=>{
      if(disposed||options.busy||blocked||submitting||!dirty||[...valid.values()].some(value=>!value))return;
      // A pointer press blurs a typed number before the destination receives
      // its click. Let Reset/checkbox/select finish before committing the draft.
      if(pointerHeld||releaseTimer!==undefined){releaseCommits.add(commit);return;}
      const signature=JSON.stringify(draft);if(signature===submitted)return;
      submitted=signature;submitting=true;feedback.hidden=false;feedback.textContent=pt?"Aplicando…":"Applying…";
      const args={target:data.target,phase:phase.phase,presetId:phase.presetId,options:{...draft}};
      const dispatch=():void=>{void (async()=>{
        try{await options.execute("ae.presets.phase-adjust",args);if(!disposed)feedback.hidden=true;}
        catch{if(!disposed){feedback.hidden=false;feedback.textContent=pt?"Não foi possível confirmar o ajuste. Recarregue a seleção.":"Could not confirm the adjustment. Reload the selection.";}}
        finally{submitting=false;}
      })();};
      if(releaseBatch)releaseBatch.push(dispatch);else dispatch();
    };
    refreshers.push(update);
    const numeric=(key:"durationFrames"|"intensity"|"staggerFrames"|"elasticity"|"overlap"|"speed"|"seed"|"settleAmount"|"settleCount"|"settleDamping",label:string,min:number,max:number,integer=true):void=>{
      // AE slider values can contain Float32 tails (76.599998474121).
      // Keep the normal step plus Ctrl/Alt precision without making a clean read dirty.
      const display=(value:number):number=>Number(value.toFixed(integer?0:2));
      const field=createElement(doc,"label","ch-phase-field");field.appendChild(createElement(doc,"span","",label));
      const input=doc.createElement("input");input.id=`phase-${phase.instance}-${phase.phase}-${key}`;input.type="text";input.inputMode=integer?"numeric":"decimal";input.value=String(display(Number(draft[key]??defaultLibraryOptions(preset)[key]??0)));input.setAttribute("aria-label",`${name} · ${label}`);input.disabled=options.busy;
      input.min=String(min);input.max=String(max);input.step=integer?"1":"0.1";numberInputs.set(key,input);if(saved?.numbers[key]!==undefined)input.value=saved.numbers[key];
      const error=createElement(doc,"p","ch-field__error");error.id=`${input.id}-error`;error.hidden=true;error.setAttribute("aria-live","polite");error.setAttribute("aria-atomic","true");
      const live=Boolean(options.live)&&!effect&&LIVE_KEYS.has(key)&&phase.controls.some(control=>control.key===key);
      input.title=pt?"Clique para digitar ou arraste para ajustar. Solte para aplicar; Shift: 10×, Ctrl/Alt: fino.":"Click to type or drag to adjust. Release to apply; Shift: 10×, Ctrl/Alt: fine.";
      let nativeDragging=false,numberDragging=false;
      const beginNative=(value:number):boolean=>{nativeDragging=options.live!.start(phase,key,value);dragHint.hidden=nativeDragging;if(!nativeDragging)dragHint.textContent=pt?"O arraste ao vivo não pôde começar nesta seleção.":"Live dragging could not start for this selection.";return nativeDragging;};
      const finishNative=(canceled:boolean,value:number):void=>{if(!nativeDragging)return;nativeDragging=false;numberDragging=false;options.live!.finish(canceled,value);};
      const validate=():void=>{
        if(options.busy||blocked)return;
        const text=input.value.trim().replace(",","."),value=Number(text);
        const ok=/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text)&&Number.isFinite(value)&&value>=min&&value<=max&&(!integer||Number.isInteger(value));
        valid.set(key,ok);input.setAttribute("aria-invalid",String(!ok));error.hidden=ok;
        error.textContent=ok?"":i18n.t(integer?"field.integerRange":"field.numberRange",{min,max});
        if(ok){input.removeAttribute("aria-describedby");const original=baseline[key];draft[key]=typeof original==="number"&&value===display(original)?original:value;}else input.setAttribute("aria-describedby",error.id);
        update();
      };
      input.addEventListener("input",validate);input.addEventListener("change",()=>{validate();if(!nativeDragging)commit();});field.appendChild(input);host.appendChild(field);host.appendChild(error);
      if(key!=="seed"){
        const defaults=defaultLibraryOptions(preset,data.frameRate),curve=draft.easing&&draft.easing!=="preset"?draft.easing:preset.easing;
        const settle=curve==="settle-wave"||curve==="settle-hop"?MOTION_SETTLE_DEFAULTS[curve]:undefined;
        const original=defaults[key]??settle?.[key as keyof typeof settle]??draft[key]??min;
        field.removeChild(input);host.removeChild(field);
        const disclosureKey=`${phase.instance}:${phase.phase}:${key}`;
        const slider=createNumberDisclosure(doc,input,{label,resetLabel:pt?"Restaurar":"Reset",defaultValue:Number(original),min,max,step:integer?1:.1,blocked:()=>options.busy||blocked||disposed,
          expanded:options.disclosures?.has(disclosureKey)??false,onExpandedChange:expanded=>{if(expanded){options.disclosures?.add(disclosureKey);if(options.disclosures&&options.disclosures.size>100)options.disclosures.delete(options.disclosures.values().next().value!);}else options.disclosures?.delete(disclosureKey);},
          ...(live?{gesture:{start:beginNative,update:(value:number)=>options.live!.update(value),finish:finishNative}}:{})});
        host.removeChild(error);host.appendChild(slider.element);host.appendChild(error);sliders.push(slider);cleanups.push(()=>slider.dispose());
      }
      if(saved)validate();
      if(live){field.classList.add("ch-phase-scrub-row");cleanups.push(attachScrubbableNumber(input,{hitTarget:key==="seed"?field:input,onGestureStart:value=>{numberDragging=beginNative(value);return numberDragging;},onInput:value=>{if(numberDragging)options.live!.update(value);},onGestureEnd:(value,canceled)=>finishNative(canceled,value)}));}
      else cleanups.push(attachScrubbableNumber(input));
    };
    let shapeField:ReturnType<typeof createEasingShapeField>|undefined;
    const choice=(key:"direction"|"easing"|"unit"|"order"|"exitOrder",label:string,choices:[string,string][]):void=>{
      const field=selectField(doc,{id:`phase-${phase.instance}-${phase.phase}-${key}`,label,value:String(draft[key]??(key==="exitOrder"?"mirror":"preset")),disabled:options.busy,options:choices.map(([value,label])=>({value,label})),onChange:value=>{draft[key]=value as never;if(key==="easing")shapeField?.sync(value);update();commit();}});field.className+=" ch-phase-field";host.appendChild(field);
    };
    // A loop or look has no transition length or curve: its marker sets the window.
    if(!effect)numeric("durationFrames",pt?"Duração · frames":"Duration · frames",1,600);
    numeric("intensity",pt?"Intensidade · %":"Intensity · %",0,300,false);
    if(preset.position.some(value=>value!==0)||libraryUsesDirection(preset))choice("direction",pt?"Direção":"Direction",([["preset",pt?"Original":"Original"],["bottom",pt?"Inferior":"Bottom"],["left",pt?"Esquerda":"Left"],["right",pt?"Direita":"Right"],["top",pt?"Superior":"Top"],
      ...(libraryUsesDiagonals(preset)?[["top-left",pt?"Superior esquerda":"Top left"],["top-right",pt?"Superior direita":"Top right"],["bottom-left",pt?"Inferior esquerda":"Bottom left"],["bottom-right",pt?"Inferior direita":"Bottom right"]] as [string,string][]:[])] as [string,string][]).filter(([value])=>libraryDirectionAllowed(preset,value)));
    if(!effect)choice("easing",pt?"Curva":"Curve",presetEasingChoices(options.locale,draft.easing));
    if(!effect&&preset.category.startsWith("text-"))numeric("staggerFrames",pt?"Intervalo · frames":"Stagger · frames",0,60);
    host=moreBody;
    if(!effect){shapeField=createEasingShapeField(doc,{id:`phase-${phase.instance}-${phase.phase}-easing-shape`,locale:options.locale,easing:draft.easing,disabled:options.busy,className:"ch-phase-field",onChange:easing=>{draft.easing=easing;update();commit();}});host.appendChild(shapeField.element);}
    if(preset.category.startsWith("text-")){
      choice("unit",pt?"Animar por":"Animate by",[["preset",pt?"Original":"Original"],["characters",pt?"Caracteres":"Characters"],["words",pt?"Palavras":"Words"],["lines",pt?"Linhas":"Lines"],["all",pt?"Tudo":"All"]]);
      choice("order",pt?"Ordem":"Order",[["preset",pt?"Original":"Original"],["forward",pt?"Em sequência":"Forward"],["reverse",pt?"Reversa":"Reverse"],["center-out",pt?"Centro para bordas":"Center out"],["edges-in",pt?"Bordas para centro":"Edges in"],["random",pt?"Aleatória":"Random"]]);
      // Exit sequence relative to the entrance: mirrored (last in, first out) or the same order.
      if(phase.phase==="out")choice("exitOrder",pt?"Saída":"Exit",[["mirror",pt?"Espelhada":"Mirrored"],["repeat",pt?"Na mesma ordem":"Same order"]]);
      if(!effect&&["studio","native","premium","signature","text"].includes(preset.collection??""))numeric("overlap",pt?"Sobreposição · %":"Overlap · %",0,100,false);
    }
    if(!effect&&(draft.easing==="spring"||preset.easing==="spring"))numeric("elasticity",pt?"Elasticidade · %":"Elasticity · %",0,100,false);
    if(effect&&preset.mode==="continuous"&&["studio","native","premium","signature","momentum","text"].includes(preset.collection??""))numeric("speed",pt?"Velocidade · %":"Speed · %",25,200,false);
    const curve=draft.easing&&draft.easing!=="preset"?draft.easing:preset.easing;
    if(!effect&&(curve==="settle-wave"||curve==="settle-hop"))for(const [key,label,min,max] of settleFieldLabels(curve,options.locale)){draft[key]??=MOTION_SETTLE_DEFAULTS[curve][key];numeric(key,label,min,max,false);}
    if(gallerySequenceControls(preset,draft).seed)numeric("seed",pt?"Variação":"Variation",0,9999);
    // The layer uses motion blur while any phase asks for it.
    const blur=motionBlurField(doc,{id:`phase-${phase.instance}-${phase.phase}-motion-blur`,locale:options.locale,checked:draft.motionBlur===true,disabled:options.busy,onChange:checked=>{draft.motionBlur=checked;update();commit();}});blur.classList.add("ch-phase-field");host.appendChild(blur);
    if(effect&&typeof phase.markerDuration==="number"&&typeof data.frameRate==="number"){
      const frames=Math.round(phase.markerDuration*data.frameRate);
      host.appendChild(createElement(doc,"p","ch-preset-hint",pt?`Janela de ${frames} frames, entre rampas suaves. Arraste o marcador “Moti.on Efeito” ou a duração dele no After Effects para mudar.`:`${frames}-frame window between smooth ramps. Drag the “Moti.on Effect” marker or its duration in After Effects to change it.`));
    }
    const timing=createElement(doc,"div","ch-phase-field ch-phase-shift");timing.appendChild(createElement(doc,"span","",effect?(pt?"Deslocar efeito":"Shift effect"):(pt?"Deslocar transição":"Shift transition")));
    const controls=createElement(doc,"div","ch-phase-shift-controls");timing.appendChild(controls);
    const shift=(frames:number):void=>{if(!options.busy&&!blocked&&Number.isInteger(frames)&&frames!==0&&Math.abs(frames)<=600)options.execute("ae.presets.phase-timing",{target:data.target,phase:phase.phase,frames});};
    const shiftButton=(frames:-1|1):HTMLButtonElement=>{
      const label=i18n.t(frames<0?"phaseEditor.shiftEarlier":"phaseEditor.shiftLater");
      const action=button(doc,{label,variant:"tertiary",disabled:options.busy,onClick:()=>shift(frames)});
      action.textContent="";action.setAttribute("aria-label",label);
      const icon=createIcon(doc,"back");
      if(frames>0){if(icon.getAttribute("viewBox")) (icon.firstChild as Element|null)?.setAttribute("transform","rotate(180 9 9)");else icon.textContent="→";}
      action.appendChild(icon);hostActions.push(action);return action;
    };
    controls.appendChild(shiftButton(-1));
    const zero=formatPresetOffset(0,data.frameRate??24,data.dropFrame),amount=doc.createElement("input");amount.id=`phase-${phase.instance}-${phase.phase}-offset`;amount.type="text";amount.value=zero;amount.disabled=options.busy;amount.setAttribute("aria-label",`${name} · ${pt?"Deslocamento em frames":"Frame offset"}`);amount.title=pt?"Digite frames relativos ou HH:MM:SS:FF e pressione Enter. As setas movem um frame. Arraste ao vivo indisponível neste controle.":"Enter relative frames or HH:MM:SS:FF and press Enter. Arrows move one frame. Live dragging is unavailable on this control.";
    if(saved)amount.value=saved.offset;
    draftReaders.push(()=>[phase.phase,{options:{...draft},numbers:Object.fromEntries([...numberInputs].map(([key,input])=>[key,input.value])),offset:amount.value}]);
    const offsetError=createElement(doc,"p","ch-field__error");offsetError.id=`${amount.id}-error`;offsetError.hidden=true;offsetError.setAttribute("aria-live","polite");offsetError.setAttribute("aria-atomic","true");
    const validateOffset=():number|undefined=>{
      const frames=parsePresetOffset(amount.value,data.frameRate??24,data.dropFrame),ok=frames!==undefined&&Math.abs(frames)<=600;
      amount.setAttribute("aria-invalid",String(!ok));offsetError.hidden=ok;offsetError.textContent=ok?"":i18n.t("phaseEditor.offsetInvalid");
      if(ok)amount.removeAttribute("aria-describedby");else amount.setAttribute("aria-describedby",offsetError.id);
      if(!ok||frames!==0)pendingOffsets.add(phase.phase);else pendingOffsets.delete(phase.phase);reportDirty();
      return ok?frames:undefined;
    };
    amount.addEventListener("input",()=>{if(!options.busy&&!blocked)validateOffset();});
    if(saved)validateOffset();
    amount.addEventListener("keydown",event=>{
      if(options.busy||blocked||event.isComposing)return;
      if(event.key==="Enter"){
        event.preventDefault();const frames=validateOffset();if(frames===undefined)return;
        amount.value=zero;validateOffset();shift(frames);
      }
      if(event.key==="Escape"){event.preventDefault();amount.value=zero;validateOffset();amount.blur();}
    });cleanups.push(attachCompactNumberEditing(amount));controls.appendChild(amount);
    controls.appendChild(shiftButton(1));host.appendChild(timing);host.appendChild(offsetError);
    moreBody.appendChild(moreActions);body.appendChild(more);
    const footer=createElement(doc,"div","ch-phase-adjust-actions");footer.appendChild(button(doc,{label:pt?"Descartar":"Discard",variant:"tertiary",disabled:options.busy,onClick:()=>{options.onDirty(false);options.execute("ae.presets.inspect",{});}}));body.appendChild(footer);update();
  }
  return {element,drafts:()=>Object.fromEntries(draftReaders.map(read=>read())),setBlocked(value,busy=false){if(value)for(const slider of sliders)slider.cancel();blocked=value;for(const action of hostActions){action.disabled=options.busy||blocked;action.title=blocked?(busy?i18n.t("phaseEditor.wait"):i18n.t("phaseEditor.reloadSelection")):action.getAttribute("aria-label")??action.textContent??"";}for(const input of Array.from(element.getElementsByTagName("input")))input.disabled=options.busy||blocked;for(const select of Array.from(element.getElementsByTagName("select")))select.disabled=options.busy||blocked;for(const slider of sliders)slider.sync();for(const refresh of refreshers)refresh();},dispose(){disposed=true;for(const cleanup of cleanups)cleanup();}};
}
