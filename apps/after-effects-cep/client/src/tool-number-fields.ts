import {numberField,createNumberDisclosure,type NumberFieldOptions} from "@motion/ui-core";

/** Presentation around the original input: validation and commits stay with numberField. */
export function createToolNumberFields():{field(doc:Document,options:NumberFieldOptions&{defaultValue?:number;expanded?:boolean}):HTMLElement;dispose():void} {
  const expanded=new Set<string>(),controls:Array<ReturnType<typeof createNumberDisclosure>>=[];
  return {
    field(doc,options){
      const root=numberField(doc,options),input=root.getElementsByTagName("input")[0];
      const initial=options.defaultValue??options.value;
      if(typeof doc.createEvent!=="function"||!input||!Number.isFinite(initial)||initial<options.min||initial>options.max||options.max<=options.min)return root;
      const disclosure=createNumberDisclosure(doc,input,{label:options.label,resetLabel:(doc.documentElement.lang??"pt-BR").startsWith("en")?(options.defaultValue===undefined?"Restore initial value":"Reset"):(options.defaultValue===undefined?"Restaurar inicial":"Restaurar"),defaultValue:initial,min:options.min,max:options.max,step:options.step,expanded:options.expanded??expanded.has(options.id),onExpandedChange:open=>{if(open)expanded.add(options.id);else expanded.delete(options.id);}});
      input.setAttribute("aria-label",options.label);
      const control=root.querySelector(".ch-field__control");
      const unit=root.querySelector(".ch-field__unit");
      if(unit)disclosure.header.insertBefore(unit,disclosure.reset);
      if(control){while(control.firstChild)control.removeChild(control.firstChild);control.appendChild(disclosure.element);}
      root.classList.add("ch-tool-number-field");controls.push(disclosure);
      return root;
    },
    dispose(){for(const control of controls.splice(0))control.dispose();}
  };
}

/** One active standard tool editor is owned by main.ts. */
export const standardToolNumbers=createToolNumberFields();
export const toolNumberField=standardToolNumbers.field;
