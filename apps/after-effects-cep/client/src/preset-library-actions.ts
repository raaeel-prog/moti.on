import {button,clearNode,createElement} from "@motion/ui-core";

export interface PresetLibraryAction {
  id:string;
  group:"copy"|"remove"|"paste";
  label:string;
  reason?:string;
  run():void|Promise<void>;
}
export interface PresetLibraryActions { read():Promise<readonly PresetLibraryAction[]>; }

/** Presentation only; the workspace owns inspection and all host commands. */
export function createPresetLibraryActions(doc:Document,locale:string,source:PresetLibraryActions|undefined,onOpen:()=>void){
  const pt=locale==="pt-BR";
  const element=createElement(doc,"div","ch-preset-library-actions");
  const menu=createElement(doc,"section","ch-preset-library-actions-menu");menu.hidden=true;menu.setAttribute("role","dialog");menu.setAttribute("aria-label",pt?"Ações de presets":"Preset actions");
  const trigger=button(doc,{label:pt?"Ações de presets":"Preset actions",onClick:()=>{if(menu.hidden)void open();else close();}});
  trigger.setAttribute("aria-haspopup","dialog");trigger.setAttribute("aria-expanded","false");
  element.appendChild(trigger);element.appendChild(menu);
  let disposed=false,revision=0,running=false;
  function close(focus=false):void{revision++;menu.hidden=true;trigger.setAttribute("aria-expanded","false");if(focus)trigger.focus({preventScroll:true});}
  async function open():Promise<void>{
    if(disposed||running)return;onOpen();const token=++revision;menu.hidden=false;trigger.setAttribute("aria-expanded","true");clearNode(menu);
    const status=createElement(doc,"p","ch-preset-actions-status",pt?"Lendo seleção…":"Reading selection…");status.setAttribute("role","status");menu.appendChild(status);
    try{
      const items=await source?.read()??[];if(disposed||token!==revision)return;clearNode(menu);
      for(const [group,title] of [["copy",pt?"Copiar":"Copy"],["remove",pt?"Remover":"Remove"],["paste",pt?"Colar":"Paste"]] as const){
        const column=createElement(doc,"div","ch-preset-actions-column");column.appendChild(createElement(doc,"strong","",title));
        const entries=items.filter(item=>item.group===group);
        if(!entries.length)column.appendChild(createElement(doc,"span","ch-preset-actions-unavailable",pt?"Sem ação disponível":"No action available"));
        for(const item of entries){
          const control=button(doc,{label:item.label,disabled:Boolean(item.reason),onClick:()=>{void run(item);}});control.dataset.action=item.id;control.title=item.reason??item.label;control.setAttribute("aria-disabled",String(Boolean(item.reason)));
          if(group==="paste")control.classList.add("ch-preset-paste-tile");column.appendChild(control);
        }menu.appendChild(column);
      }
    }catch{if(!disposed&&token===revision){clearNode(menu);menu.appendChild(createElement(doc,"p","ch-preset-actions-status",pt?"Não foi possível ler a seleção. Tente novamente.":"Could not read the selection. Try again."));}}
  }
  async function run(item:PresetLibraryAction):Promise<void>{
    if(disposed||running||item.reason)return;running=true;trigger.disabled=true;menu.setAttribute("aria-busy","true");
    for(const control of Array.from(menu.getElementsByTagName("button")))control.disabled=true;
    try{await item.run();if(!disposed)close(true);}catch{if(!disposed){clearNode(menu);menu.appendChild(createElement(doc,"p","ch-preset-actions-status",pt?"A ação não foi confirmada. Confira a seleção.":"The action was not confirmed. Check the selection."));}}
    finally{running=false;if(!disposed){trigger.disabled=false;menu.removeAttribute("aria-busy");}}
  }
  const outside=(event:Event):void=>{if(!menu.hidden&&!element.contains(event.target as Node))close();};
  const key=(event:KeyboardEvent):void=>{if(menu.hidden)return;if(event.key==="Escape"){event.preventDefault();close(true);return;}if(!["ArrowDown","ArrowUp","Home","End"].includes(event.key)||!menu.contains(doc.activeElement))return;
    const controls=Array.from(menu.getElementsByTagName("button")).filter(control=>!control.disabled);if(!controls.length)return;
    const index=controls.indexOf(doc.activeElement as HTMLButtonElement);event.preventDefault();controls[event.key==="Home"?0:event.key==="End"?controls.length-1:(index+(event.key==="ArrowDown"?1:-1)+controls.length)%controls.length]?.focus();};
  doc.addEventListener("mousedown",outside);doc.addEventListener("keydown",key);
  return {element,close,dispose(){disposed=true;close();doc.removeEventListener("mousedown",outside);doc.removeEventListener("keydown",key);}};
}
