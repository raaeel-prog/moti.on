import {button,clearNode,createElement} from "@motion/ui-core";
import {uiIcon} from "./ui-icons.js";

export interface PresetLibraryAction {
  id:string;
  group:"copy"|"remove"|"paste";
  label:string;
  reason?:string;
  /** Optional context line (e.g. the copied preset name on the paste tile). */
  detail?:string;
  run():void|Promise<void>;
}
export interface PresetLibraryActions { read():Promise<readonly PresetLibraryAction[]>; }

type Group=PresetLibraryAction["group"];
const SVG_NS="http://www.w3.org/2000/svg";
/** Matches the longest exit animation in ae-preset-actions.css. */
const CLOSE_MS=200;
const FLASH_MS=900;
const GLYPHS:Record<Group,string>={
  copy:"M9 9h10v10H9zM5 15V5h10",
  remove:"M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12",
  paste:"M8 5h8v3H8zM6 7H5v13h14V7h-1M9 13h6M9 16h4"
};

function glyph(doc:Document,group:Group,className:string):Element{
  const svg=doc.createElementNS?.(SVG_NS,"svg");
  if(!svg)return createElement(doc,"span",className);
  svg.setAttribute("class",className);svg.setAttribute("viewBox","0 0 24 24");svg.setAttribute("aria-hidden","true");
  const path=doc.createElementNS(SVG_NS,"path");path.setAttribute("d",GLYPHS[group]);svg.appendChild(path);
  return svg;
}

function reducedMotion(doc:Document):boolean{
  try{return Boolean(doc.defaultView?.matchMedia?.("(prefers-reduced-motion: reduce)").matches);}catch{return false;}
}

/** Presentation only; the workspace owns inspection and all host commands. */
export function createPresetLibraryActions(doc:Document,locale:string,source:PresetLibraryActions|undefined,onOpen:()=>void){
  const pt=locale==="pt-BR";
  const copy={
    title:{copy:pt?"Copiar":"Copy",remove:pt?"Remover":"Remove",paste:pt?"Colar":"Paste"} as Record<Group,string>,
    caption:{copy:pt?"Da seleção":"From selection",remove:pt?"Fases aplicadas":"Applied phases",paste:pt?"Na seleção atual":"Onto the selection"} as Record<Group,string>,
    empty:pt?"Sem ação disponível":"No action available",
    emptySlot:pt?"Nada copiado":"Nothing copied"
  };
  const element=createElement(doc,"div","ch-preset-library-actions");
  const menu=createElement(doc,"section","ch-preset-library-actions-menu");menu.hidden=true;menu.setAttribute("role","dialog");menu.setAttribute("aria-label",pt?"Ações de presets":"Preset actions");
  const actionsLabel=pt?"Ações de presets":"Preset actions";
  const trigger=button(doc,{label:"",title:actionsLabel,onClick:()=>{if(isOpen)close();else void open();}});
  trigger.classList.add("ch-preset-actions-trigger");
  trigger.setAttribute("aria-label",actionsLabel);
  trigger.setAttribute("aria-haspopup","dialog");trigger.setAttribute("aria-expanded","false");
  const compactIcon=createElement(doc,"span","ch-preset-actions-trigger__icon");
  compactIcon.setAttribute("aria-hidden","true");
  const moreIcon=uiIcon(doc,"more");
  if(moreIcon)compactIcon.appendChild(moreIcon);
  trigger.appendChild(compactIcon);
  trigger.appendChild(createElement(doc,"span","ch-preset-actions-trigger__label",actionsLabel));
  const chevron=createElement(doc,"span","ch-preset-actions-trigger__chevron");chevron.setAttribute("aria-hidden","true");trigger.appendChild(chevron);
  element.appendChild(trigger);element.appendChild(menu);
  let disposed=false,revision=0,running=false,isOpen=false;
  let hideTimer:ReturnType<typeof setTimeout>|undefined,flashTimer:ReturnType<typeof setTimeout>|undefined;

  function cancelHide():void{if(hideTimer!==undefined){clearTimeout(hideTimer);hideTimer=undefined;}}
  function close(focus=false):void{
    revision++;isOpen=false;trigger.setAttribute("aria-expanded","false");element.removeAttribute("data-open");
    if(focus)trigger.focus({preventScroll:true});
    cancelHide();
    if(menu.hidden)return;
    if(disposed||reducedMotion(doc)){menu.hidden=true;menu.removeAttribute("data-state");return;}
    menu.setAttribute("data-state","closing");
    hideTimer=setTimeout(()=>{hideTimer=undefined;if(!isOpen){menu.hidden=true;menu.removeAttribute("data-state");}},CLOSE_MS);
  }
  function flash(group:Group):void{
    if(flashTimer!==undefined)clearTimeout(flashTimer);
    trigger.setAttribute("data-flash",group);
    flashTimer=setTimeout(()=>{flashTimer=undefined;trigger.removeAttribute("data-flash");},FLASH_MS);
  }
  function status(text:string,tone:"busy"|"error"):void{
    clearNode(menu);
    if(tone==="busy")for(let i=0;i<3;i++){const ghost=createElement(doc,"div","ch-preset-actions-ghost");ghost.style.setProperty("--i",String(i));ghost.setAttribute("aria-hidden","true");menu.appendChild(ghost);}
    const line=createElement(doc,"p","ch-preset-actions-status",text);line.setAttribute("role","status");line.setAttribute("data-tone",tone);menu.appendChild(line);
  }
  function card(group:Group,index:number,entries:readonly PresetLibraryAction[]):HTMLElement{
    const column=createElement(doc,"div","ch-preset-actions-column");column.setAttribute("data-group",group);column.style.setProperty("--i",String(index));
    const head=createElement(doc,"div","ch-preset-actions-head");head.appendChild(glyph(doc,group,"ch-preset-actions-glyph"));
    head.appendChild(createElement(doc,"strong","",copy.title[group]));column.appendChild(head);
    column.appendChild(createElement(doc,"span","ch-preset-actions-caption",copy.caption[group]));
    if(!entries.length)column.appendChild(createElement(doc,"span","ch-preset-actions-unavailable",copy.empty));
    entries.forEach((item,order)=>{
      const control=button(doc,{label:item.label,disabled:Boolean(item.reason),onClick:()=>{void run(item);}});
      control.dataset.action=item.id;control.title=item.reason??item.label;control.setAttribute("aria-disabled",String(Boolean(item.reason)));
      control.style.setProperty("--j",String(order));
      if(group==="paste"){
        control.classList.add("ch-preset-paste-tile");control.setAttribute("data-loaded",String(Boolean(item.detail)));
        const stack=createElement(doc,"span","ch-preset-paste-stack");stack.setAttribute("aria-hidden","true");
        stack.appendChild(createElement(doc,"span","ch-preset-paste-sheet"));stack.appendChild(createElement(doc,"span","ch-preset-paste-sheet"));
        control.appendChild(stack);
        const slot=createElement(doc,"span","ch-preset-paste-slot",item.detail??copy.emptySlot);slot.title=item.detail??copy.emptySlot;control.appendChild(slot);
      }
      column.appendChild(control);
    });
    return column;
  }
  async function open():Promise<void>{
    if(disposed||running)return;onOpen();const token=++revision;
    cancelHide();isOpen=true;menu.hidden=false;menu.setAttribute("data-state","open");element.setAttribute("data-open","true");trigger.setAttribute("aria-expanded","true");
    status(pt?"Lendo seleção…":"Reading selection…","busy");
    try{
      const items=await source?.read()??[];if(disposed||token!==revision)return;clearNode(menu);
      (["copy","remove","paste"] as const).forEach((group,index)=>menu.appendChild(card(group,index,items.filter(item=>item.group===group))));
      const loaded=items.some(item=>item.group==="paste"&&Boolean(item.detail));element.setAttribute("data-clipboard",String(loaded));
    }catch{if(!disposed&&token===revision)status(pt?"Não foi possível ler a seleção. Tente novamente.":"Could not read the selection. Try again.","error");}
  }
  async function run(item:PresetLibraryAction):Promise<void>{
    if(disposed||running||item.reason)return;running=true;trigger.disabled=true;menu.setAttribute("aria-busy","true");
    for(const control of Array.from(menu.getElementsByTagName("button")))control.disabled=true;
    try{
      await item.run();
      if(!disposed){if(item.group==="copy")element.setAttribute("data-clipboard","true");flash(item.group);close(true);}
    }catch{if(!disposed)status(pt?"A ação não foi confirmada. Confira a seleção.":"The action was not confirmed. Check the selection.","error");}
    finally{running=false;if(!disposed){trigger.disabled=false;menu.removeAttribute("aria-busy");}}
  }
  /** Spotlight follows the pointer inside each card (CSS reads --mx/--my). */
  const glow=(event:MouseEvent):void=>{
    let node=event.target as HTMLElement|null;
    while(node&&node!==menu&&!node.classList?.contains("ch-preset-actions-column"))node=node.parentElement;
    if(!node||node===menu||typeof node.getBoundingClientRect!=="function")return;
    const box=node.getBoundingClientRect();node.style.setProperty("--mx",`${event.clientX-box.left}px`);node.style.setProperty("--my",`${event.clientY-box.top}px`);
  };
  const outside=(event:Event):void=>{if(isOpen&&!element.contains(event.target as Node))close();};
  const key=(event:KeyboardEvent):void=>{if(!isOpen)return;if(event.key==="Escape"){event.preventDefault();close(true);return;}if(!["ArrowDown","ArrowUp","Home","End"].includes(event.key)||!menu.contains(doc.activeElement))return;
    const controls=Array.from(menu.getElementsByTagName("button")).filter(control=>!control.disabled);if(!controls.length)return;
    const index=controls.indexOf(doc.activeElement as HTMLButtonElement);event.preventDefault();controls[event.key==="Home"?0:event.key==="End"?controls.length-1:(index+(event.key==="ArrowDown"?1:-1)+controls.length)%controls.length]?.focus();};
  menu.addEventListener?.("mousemove",glow);doc.addEventListener("mousedown",outside);doc.addEventListener("keydown",key);
  return {element,close,dispose(){
    disposed=true;close();cancelHide();if(flashTimer!==undefined)clearTimeout(flashTimer);
    menu.removeEventListener?.("mousemove",glow);doc.removeEventListener("mousedown",outside);doc.removeEventListener("keydown",key);
  }};
}
