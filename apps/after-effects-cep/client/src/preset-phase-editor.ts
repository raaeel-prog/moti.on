import {attachCompactNumberEditing, attachScrubbableNumber, button, createActionButton, createElement, createI18n, createIcon, selectField} from "@motion/ui-core";
import type {PresetInspection, PresetPhaseInspection} from "@motion/contracts";
import {defaultLibraryOptions, GALLERY_PRESETS, gallerySequenceControls, presetEasingChoices} from "./preset-gallery.js";
import {formatPresetOffset,parsePresetOffset} from "./preset-timecode.js";

export function createPresetPhaseEditor(doc:Document, options:{
  locale:string; inspection:PresetInspection; busy:boolean;
  reveal(id:string):void; copy(phase:PresetPhaseInspection):void;
  execute(command:string,args:Record<string,unknown>):void;
  onDirty(dirty:boolean):void;
  live?:{start(phase:PresetPhaseInspection,key:string,initial:number):boolean;update(value:number):void;finish(canceled:boolean,value:number):void};
}):{element:HTMLElement;setBlocked(blocked:boolean,busy?:boolean):void;dispose():void} {
  const cleanups:Array<()=>void>=[],dirtyPhases=new Set<string>(),pendingOffsets=new Set<string>();
  const hostActions:HTMLButtonElement[]=[],refreshers:Array<()=>void>=[];
  let blocked=false,blockedBusy=false,disposed=false;
  const i18n=createI18n({locale:options.locale}),pt=i18n.locale()==="pt-BR",data=options.inspection;
  const reportDirty=():void=>options.onDirty(dirtyPhases.size>0||pendingOffsets.size>0);
  const element=createElement(doc,"div","ch-phase-editor");
  const selected=createElement(doc,"div","ch-phase-layer");
  selected.appendChild(createElement(doc,"span","",pt?"Camada: ":"Layer: "));
  selected.appendChild(createElement(doc,"strong","",data.layerName??""));element.appendChild(selected);
  const section=doc.createElement("details");section.className="ch-edit-section";section.open=true;
  section.appendChild(createElement(doc,"summary","",pt?"Presets":"Presets"));element.appendChild(section);
  for(const phase of data.phases??[]){
    const preset=GALLERY_PRESETS.find(item=>item.motion?.id===phase.presetId)?.motion;if(!preset)continue;
    const row=doc.createElement("details");row.className="ch-phase-instance";row.open=true;row.dataset.phase=phase.phase;
    const title=createElement(doc,"summary","ch-phase-heading");
    title.appendChild(createElement(doc,"span","ch-phase-title",`${phase.phase==="in"?(pt?"Entrada":"In"):(pt?"Saída":"Out")}: ${preset.name[pt?"pt-BR":"en-US"]}`));
    row.appendChild(title);section.appendChild(row);
    const actions=createElement(doc,"div","ch-phase-actions");row.appendChild(actions);
    const command=(action:"remove"|"reset"):void=>options.execute("ae.presets.phase-action",{target:data.target,phase:phase.phase,action});
    for(const [label,variant,onClick] of [
      [pt?"Revelar":"Reveal","tertiary",()=>options.reveal(phase.presetId)],
      [pt?"Copiar":"Copy","tertiary",()=>options.copy(phase)],
      [pt?"Remover":"Remove","destructive",()=>command("remove")],
      [pt?"Restaurar":"Reset","tertiary",()=>command("reset")]
    ] as const){const action=button(doc,{label,variant,disabled:options.busy,onClick});action.classList.add("ch-phase-link");actions.appendChild(action);if(variant==="destructive"||label===(pt?"Restaurar":"Reset"))hostActions.push(action);}
    const body=createElement(doc,"div","ch-phase-parameters");row.appendChild(body);
    const dragHint=createElement(doc,"p","ch-preset-hint");dragHint.hidden=true;body.appendChild(dragHint);
    const draft={...phase.options},valid=new Map<string,boolean>();let dirty=false;
    const applyLabel=pt?"Aplicar ajustes":"Apply changes",unchangedReason=pt?"Altere um parâmetro para aplicar.":"Change a parameter to apply.";
    const applyControl=createActionButton(doc,{id:`phase-${phase.instance}-${phase.phase}-apply`,label:applyLabel,variant:"primary",disabled:true,disabledReason:unchangedReason,onPress:()=>{
      if(!disposed&&!options.busy&&!blocked)options.execute("ae.presets.phase-adjust",{target:data.target,phase:phase.phase,presetId:phase.presetId,options:draft});
    }});
    const apply=applyControl.button;applyControl.element.classList.add("ch-phase-primary-action");
    const update=():void=>{
      const invalid=[...valid.values()].some(value=>!value);
      dirty=JSON.stringify(draft)!==JSON.stringify(phase.options);
      if(dirty||invalid)dirtyPhases.add(phase.phase);else dirtyPhases.delete(phase.phase);
      reportDirty();apply.disabled=options.busy||blocked||!dirty||invalid;
      const reason=options.busy||blockedBusy?i18n.t("phaseEditor.wait"):blocked?i18n.t("phaseEditor.reloadSelection"):invalid?i18n.t("phaseEditor.correctFields"):!dirty?unchangedReason:undefined;
      applyControl.setDisabled(apply.disabled,reason);
    };
    refreshers.push(update);
    const numeric=(key:"durationFrames"|"intensity"|"staggerFrames"|"elasticity"|"overlap"|"seed",label:string,min:number,max:number,integer=true):void=>{
      const field=createElement(doc,"label","ch-phase-field");field.appendChild(createElement(doc,"span","",label));
      const input=doc.createElement("input");input.id=`phase-${phase.instance}-${phase.phase}-${key}`;input.type="text";input.inputMode=integer?"numeric":"decimal";input.value=String(draft[key]??defaultLibraryOptions(preset)[key]??0);input.setAttribute("aria-label",`${phase.phase==="in"?(pt?"Entrada":"In"):(pt?"Saída":"Out")} · ${label}`);input.disabled=options.busy;
      input.min=String(min);input.max=String(max);input.step=integer?"1":"0.1";
      const error=createElement(doc,"p","ch-field__error");error.id=`${input.id}-error`;error.hidden=true;error.setAttribute("aria-live","polite");error.setAttribute("aria-atomic","true");
      const live=options.live&&phase.controls.some(control=>control.key===key);
      input.title=live?(pt?"Clique para digitar. Arraste para ajustar; Shift: fino, Alt: amplo.":"Click to type. Drag to adjust; Shift: fine, Alt: coarse."):(pt?"Clique para digitar. Arraste ao vivo ainda indisponível.":"Click to type. Live dragging is currently unavailable.");
      const validate=():void=>{
        if(options.busy||blocked)return;
        const text=input.value.trim().replace(",","."),value=Number(text);
        const ok=/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text)&&Number.isFinite(value)&&value>=min&&value<=max&&(!integer||Number.isInteger(value));
        valid.set(key,ok);input.setAttribute("aria-invalid",String(!ok));error.hidden=ok;
        error.textContent=ok?"":i18n.t(integer?"field.integerRange":"field.numberRange",{min,max});
        if(ok){input.removeAttribute("aria-describedby");draft[key]=value;}else input.setAttribute("aria-describedby",error.id);
        update();
      };
      input.addEventListener("input",validate);input.addEventListener("change",validate);field.appendChild(input);body.appendChild(field);body.appendChild(error);
      if(live){let dragging=false;field.classList.add("ch-phase-scrub-row");cleanups.push(attachScrubbableNumber(input,{hitTarget:field,onGestureStart:value=>{dragging=options.live!.start(phase,key,value);if(!dragging){dragHint.textContent=pt?"O arraste ao vivo não pôde começar nesta seleção.":"Live dragging could not start for this selection.";dragHint.hidden=false;}else dragHint.hidden=true;return dragging;},onInput:value=>{if(dragging)options.live!.update(value);},onGestureEnd:(value,canceled)=>{if(!dragging)return;dragging=false;options.live!.finish(canceled,value);}}));}
      else cleanups.push(attachCompactNumberEditing(input));
    };
    const choice=(key:"direction"|"easing"|"unit"|"order",label:string,choices:[string,string][]):void=>{
      const field=selectField(doc,{id:`phase-${phase.instance}-${phase.phase}-${key}`,label,value:String(draft[key]??"preset"),disabled:options.busy,options:choices.map(([value,label])=>({value,label})),onChange:value=>{draft[key]=value as never;update();}});field.className+=" ch-phase-field";body.appendChild(field);
    };
    numeric("durationFrames",pt?"Duração · frames":"Duration · frames",1,600);
    numeric("intensity",pt?"Intensidade · %":"Intensity · %",0,300,false);
    if(!options.live){dragHint.textContent=pt?"Arraste ao vivo indisponível nesta sessão. Você ainda pode digitar e aplicar ajustes.":"Live dragging is unavailable in this session. You can still type and apply changes.";dragHint.hidden=false;}
    if(preset.position.some(value=>value!==0)||preset.pivot==="edge")choice("direction",pt?"Direção":"Direction",[["preset",pt?"Original":"Original"],["bottom",pt?"Inferior":"Bottom"],["left",pt?"Esquerda":"Left"],["right",pt?"Direita":"Right"],["top",pt?"Superior":"Top"]]);
    choice("easing",pt?"Curva":"Curve",presetEasingChoices(options.locale));
    if(preset.category.startsWith("text-")){
      choice("unit",pt?"Animar por":"Animate by",[["preset",pt?"Original":"Original"],["characters",pt?"Caracteres":"Characters"],["words",pt?"Palavras":"Words"],["lines",pt?"Linhas":"Lines"],["all",pt?"Tudo":"All"]]);
      numeric("staggerFrames",pt?"Intervalo · frames":"Stagger · frames",0,60);
      choice("order",pt?"Ordem":"Order",[["preset",pt?"Original":"Original"],["forward",pt?"Em sequência":"Forward"],["reverse",pt?"Reversa":"Reverse"],["center-out",pt?"Centro para bordas":"Center out"],["edges-in",pt?"Bordas para centro":"Edges in"],["random",pt?"Aleatória":"Random"]]);
      if(["studio","native","premium","signature"].includes(preset.collection??""))numeric("overlap",pt?"Sobreposição · %":"Overlap · %",0,100);
    }
    if(draft.easing==="spring"||preset.easing==="spring")numeric("elasticity",pt?"Elasticidade · %":"Elasticity · %",0,100);
    if(gallerySequenceControls(preset,draft).seed)numeric("seed",pt?"Variação":"Variation",0,9999);
    const timing=createElement(doc,"div","ch-phase-field ch-phase-shift");timing.appendChild(createElement(doc,"span","",pt?"Deslocar transição":"Shift transition"));
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
    const zero=formatPresetOffset(0,data.frameRate??24,data.dropFrame),amount=doc.createElement("input");amount.id=`phase-${phase.instance}-${phase.phase}-offset`;amount.type="text";amount.value=zero;amount.disabled=options.busy;amount.setAttribute("aria-label",`${phase.phase==="in"?(pt?"Entrada":"In"):(pt?"Saída":"Out")} · ${pt?"Deslocamento em frames":"Frame offset"}`);amount.title=pt?"Digite frames relativos ou HH:MM:SS:FF e pressione Enter. As setas movem um frame. Arraste ao vivo indisponível neste controle.":"Enter relative frames or HH:MM:SS:FF and press Enter. Arrows move one frame. Live dragging is unavailable on this control.";
    const offsetError=createElement(doc,"p","ch-field__error");offsetError.id=`${amount.id}-error`;offsetError.hidden=true;offsetError.setAttribute("aria-live","polite");offsetError.setAttribute("aria-atomic","true");
    const validateOffset=():number|undefined=>{
      const frames=parsePresetOffset(amount.value,data.frameRate??24,data.dropFrame),ok=frames!==undefined&&Math.abs(frames)<=600;
      amount.setAttribute("aria-invalid",String(!ok));offsetError.hidden=ok;offsetError.textContent=ok?"":i18n.t("phaseEditor.offsetInvalid");
      if(ok)amount.removeAttribute("aria-describedby");else amount.setAttribute("aria-describedby",offsetError.id);
      if(!ok||frames!==0)pendingOffsets.add(phase.phase);else pendingOffsets.delete(phase.phase);reportDirty();
      return ok?frames:undefined;
    };
    amount.addEventListener("input",()=>{if(!options.busy&&!blocked)validateOffset();});
    amount.addEventListener("keydown",event=>{
      if(options.busy||blocked||event.isComposing)return;
      if(event.key==="Enter"){
        event.preventDefault();const frames=validateOffset();if(frames===undefined)return;
        amount.value=zero;validateOffset();shift(frames);
      }
      if(event.key==="Escape"){event.preventDefault();amount.value=zero;validateOffset();amount.blur();}
    });cleanups.push(attachCompactNumberEditing(amount));controls.appendChild(amount);
    controls.appendChild(shiftButton(1));body.appendChild(timing);body.appendChild(offsetError);
    const footer=createElement(doc,"div","ch-phase-adjust-actions");footer.appendChild(button(doc,{label:pt?"Descartar":"Discard",variant:"tertiary",disabled:options.busy,onClick:()=>{options.onDirty(false);options.execute("ae.presets.inspect",{});}}));footer.appendChild(applyControl.element);body.appendChild(footer);update();
  }
  return {element,setBlocked(value,busy=false){blocked=value;blockedBusy=busy;for(const action of hostActions){action.disabled=options.busy||blocked;action.title=blocked?(busy?i18n.t("phaseEditor.wait"):i18n.t("phaseEditor.reloadSelection")):action.getAttribute("aria-label")??action.textContent??"";}for(const input of Array.from(element.getElementsByTagName("input")))input.disabled=options.busy||blocked;for(const select of Array.from(element.getElementsByTagName("select")))select.disabled=options.busy||blocked;for(const refresh of refreshers)refresh();},dispose(){disposed=true;for(const cleanup of cleanups)cleanup();}};
}
