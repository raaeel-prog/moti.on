import {button, createElement} from "./shell.js";
import {updateSliderFill} from "./slider-fill.js";

export interface NumberDisclosureOptions {
  label:string; resetLabel:string; defaultValue:number; min:number; max:number; step:number;
  mixedValue?:number;
  expanded?:boolean;
  inlineValue?: {unit?: Element};
  onExpandedChange?(expanded:boolean):void;
  /** The existing input remains the owner of validation and draft changes. */
  blocked?:()=>boolean;
  gesture?:{start(value:number):boolean;update(value:number):void;finish(canceled:boolean,value:number):void};
}

/** An opt-in compact row around an existing numeric input; never sends a host command. */
export function createNumberDisclosure(doc:Document,input:HTMLInputElement,options:NumberDisclosureOptions):{
  element:HTMLElement;header:HTMLElement;range:HTMLInputElement;reset:HTMLButtonElement;toggle:HTMLButtonElement;sync():void;cancel():void;dispose():void;
} {
  const {min,max,step}=options;
  if(![min,max,step,options.defaultValue].every(Number.isFinite)||max<=min||step<=0||options.defaultValue<min||options.defaultValue>max)throw new Error("Invalid numeric disclosure limits/default.");
  const element=createElement(doc,"div","ch-number-disclosure"),header=createElement(doc,"div","ch-number-disclosure__header");
  const body=createElement(doc,"div","ch-number-disclosure__body");body.id=`${input.id}-slider-body`;body.hidden=!options.expanded;
  let disposed=false,active:false|{draft:string;value:number;pointer:boolean}=false,rejected=false;
  const listeners:Array<()=>void>=[];
  const unavailable=():boolean=>disposed||input.disabled||input.readOnly||Boolean(options.blocked?.());
  const read=():number|undefined=>{
    // Mixed selections have no common absolute slider value. The number keeps
    // its existing relative-drag/typing contract, rather than inventing a mean.
    if(input.getAttribute("data-mixed")==="true")return undefined;
    const text=input.value.trim().replace(",","."),value=Number(text);
    return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text)&&Number.isFinite(value)&&value>=min&&value<=max&&(step<1||Number.isInteger(value))?value:undefined;
  };
  const emit=(type:"input"|"change"):void=>{const event=doc.createEvent("Event");event.initEvent(type,true,false);input.dispatchEvent(event);};
  const listen=(target:EventTarget,type:string,callback:EventListener):void=>{target.addEventListener(type,callback);listeners.push(()=>target.removeEventListener?.(type,callback));};
  const toggle=button(doc,{label:options.label,variant:"tertiary",onClick:()=>{
    if(unavailable()||active)return;
    // `hidden` pode valer "until-found" no DOM atual; aberto = estava oculto.
    const open=body.hidden!==false;
    setExpanded(open);
    options.onExpandedChange?.(open);
  }});
  toggle.classList.add("ch-number-disclosure__toggle");toggle.setAttribute("aria-expanded",String(!body.hidden));toggle.setAttribute("aria-controls",body.id);
  function resetValue():void {
    if(unavailable()||active||read()===options.defaultValue)return;
    input.value=String(options.defaultValue);
    emit("input");
    emit("change");
    sync();
  }
  const reset=button(doc,{label:options.resetLabel,variant:"tertiary",onClick:resetValue});
  reset.classList.add("ch-number-disclosure__reset");reset.setAttribute("aria-label",`${options.resetLabel} · ${options.label}`);
  header.appendChild(toggle);header.appendChild(input);header.appendChild(reset);element.appendChild(header);element.appendChild(body);
  const limits=createElement(doc,"div","ch-number-disclosure__limits");limits.appendChild(createElement(doc,"span","",String(min)));limits.appendChild(createElement(doc,"span","",String(max)));body.appendChild(limits);
  const range=doc.createElement("input");range.id=`${input.id}-slider`;range.type="range";range.className="ch-number-disclosure__range";range.min=String(min);range.max=String(max);range.step=String(step);range.setAttribute("aria-label",options.label);body.appendChild(range);
  const valueGroup=options.inlineValue ? createElement(doc,"div","ch-slider-value-group") : undefined;
  function setExpanded(open:boolean):void {
    body.hidden=!open;
    toggle.setAttribute("aria-expanded",String(open));
    if(!valueGroup)return;
    const unit=options.inlineValue?.unit;
    if(open){
      valueGroup.appendChild(input);
      if(unit)valueGroup.appendChild(unit);
    }else{
      header.insertBefore(input,reset);
      if(unit)header.insertBefore(unit,reset);
    }
  }
  if(valueGroup){
    element.classList.add("ch-number-disclosure--inline");
    range.classList.add("ch-slider-track");
    input.classList.add("ch-slider-value");
    body.appendChild(valueGroup);
    listen(input,"dblclick",resetValue);
    setExpanded(!body.hidden);
  }
  function sync():void {
    if(disposed)return;
    const value=read();if(value!==undefined)range.value=String(value);
    if(valueGroup)updateSliderFill(range,value===undefined?NaN:Number(range.value));
    else range.style?.setProperty("--ch-slider-progress",`${value===undefined?0:Math.max(0,Math.min(100,(value-min)/(max-min)*100))}%`);
    element.setAttribute("data-invalid",String(input.getAttribute("aria-invalid")==="true"));
    element.setAttribute("data-mixed",String(input.getAttribute("data-mixed")==="true"));
    range.disabled=unavailable()||value===undefined;reset.disabled=unavailable()||value===options.defaultValue;toggle.disabled=unavailable();
  }
  function start(pointer:boolean):boolean {
    if(active)return true;
    const value=read();if(unavailable()||value===undefined)return false;
    if(rejected)return false;
    if(options.gesture?.start(value)===false){rejected=true;sync();return false;}
    active={draft:input.value,value,pointer};element.setAttribute("data-adjusting","true");return true;
  }
  function finish(canceled:boolean):void {
    if(!active){rejected=false;return;}
    const previous=active;active=false;rejected=false;element.removeAttribute("data-adjusting");
    if(canceled){input.value=previous.draft;emit("input");options.gesture?.update(previous.value);}
    else emit("change");
    options.gesture?.finish(canceled,read()??previous.value);sync();
  }
  const press=(event:Event):void=>{const mouse=event as MouseEvent;if(mouse.button!==0)return;if(!start(true))event.preventDefault();};
  listen(range,"pointerdown",press);listen(range,"mousedown",press);
  listen(range,"input",()=>{
    if(unavailable()||rejected){if(active)finish(true);sync();return;}
    const value=Number(range.value);
    if(!Number.isFinite(value)||value<min||value>max||(step>=1&&!Number.isInteger(value))){sync();return;}
    if(!start(false)){sync();return;}
    input.value=String(value);emit("input");options.gesture?.update(value);
  });
  listen(range,"change",()=>{if(active&&!active.pointer)finish(false);});
  listen(range,"keydown",event=>{const key=event as KeyboardEvent;if(key.isComposing)return;if(key.key==="Escape"){if(active){event.preventDefault();event.stopPropagation();finish(true);}return;}if(["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Home","End","PageUp","PageDown"].includes(key.key)&&!start(false))event.preventDefault();});
  listen(range,"keyup",event=>{if(["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Home","End","PageUp","PageDown"].includes((event as KeyboardEvent).key)){if(active&&!active.pointer)finish(false);else rejected=false;}});
  listen(range,"blur",()=>finish(true));
  for(const type of ["pointerup","mouseup"])listen(doc,type,()=>{if(active&&active.pointer)finish(unavailable());else rejected=false;});
  listen(doc,"pointercancel",()=>finish(true));
  listen(doc,"keydown",event=>{if((event as KeyboardEvent).key==="Escape"&&active){event.preventDefault();event.stopPropagation();finish(true);}});
  if(doc.defaultView)listen(doc.defaultView,"blur",()=>finish(true));
  listen(input,"input",sync);listen(input,"change",sync);sync();
  return {element,header,range,reset,toggle,sync,cancel:()=>finish(true),dispose(){if(disposed)return;finish(true);disposed=true;listeners.forEach(remove=>remove());}};
}
