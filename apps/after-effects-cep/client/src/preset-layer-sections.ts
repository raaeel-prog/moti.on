import {button,createColorPicker,createElement,supportsColorOverlay,type ColorPicker} from "@motion/ui-core";
import type {PresetInspection} from "@motion/contracts";

/** Native selection and colors have their own sections, independent of recipes. */
export function createPresetLayerSections(doc:Document,options:{
  locale:string; inspection:PresetInspection; busy:boolean; blocked:boolean;
  execute(command:string,args:Record<string,unknown>):void;
  onDirty?(value:boolean):void;
}):HTMLElement {
  const pt=options.locale==="pt-BR",data=options.inspection,root=createElement(doc,"div","ch-layer-sections");
  const section=(label:string):HTMLDetailsElement=>{const el=doc.createElement("details");el.className="ch-edit-section";el.setAttribute("data-motion","disclosure-expand");el.open=true;el.appendChild(createElement(doc,"summary","",label));root.appendChild(el);return el;};
  const selection=section(pt?"Seleção de camadas":"Layer Selection"),list=createElement(doc,"div","ch-layer-selection");selection.appendChild(list);
  for(const layer of data.selection??[])list.appendChild(createElement(doc,"div","ch-layer-selection-name",layer.name));
  if(!data.selection?.length)list.appendChild(createElement(doc,"p","ch-preset-hint",data.layerName??(pt?"Nenhuma camada selecionada.":"No selected layer.")));
  const refresh=button(doc,{label:pt?"Atualizar seleção":"Refresh selection",disabled:options.busy,onClick:()=>options.execute("ae.presets.inspect",{})});refresh.classList.add("ch-phase-link");list.appendChild(refresh);
  const colors=section(pt?"Cores":"Colors"),body=createElement(doc,"div","ch-color-list");colors.appendChild(body);
  if(data.colorsTruncated)body.appendChild(createElement(doc,"p","ch-preset-hint",pt?"A lista mostra até 32 cores. Ajuste os demais controles no After Effects.":"This list shows up to 32 colors. Edit the remaining controls in After Effects."));
  if(!data.colors?.length){body.appendChild(createElement(doc,"p","ch-preset-hint",data.selection&&data.selection.length>1?(pt?"Selecione uma camada para editar suas cores.":"Select one layer to edit its colors."):(pt?"Esta camada não tem controles de cor compatíveis.":"This layer has no compatible color controls.")));return root;}
  const dirtyFields=new Set<string>();
  const dirty=(key:string,value:boolean):void=>{if(value)dirtyFields.add(key);else dirtyFields.delete(key);options.onDirty?.(dirtyFields.size>0);};
  for(const color of data.colors){
    const row=createElement(doc,"div","ch-color-row"),label=createElement(doc,"span","ch-color-label",color.label);body.appendChild(row);row.appendChild(label);
    const values=createElement(doc,"div","ch-color-values");row.appendChild(values);
    const unavailable=!color.available||!data.colorTarget,disabled=options.busy||options.blocked||unavailable;
    const input=doc.createElement("input");input.type="text";input.value=color.hex??"—";input.maxLength=7;input.className="ch-color-hex";input.disabled=disabled;input.setAttribute("aria-label",`${color.label} · Hexadecimal`);values.appendChild(input);
    // The native color input does not open in short CEP panels; the in-panel
    // picker does. Runtimes without overlays keep the native swatch.
    let picker:ColorPicker|null=null,swatch:HTMLInputElement|null=null;
    const choose=pt?"Escolher cor":"Choose color";
    if(supportsColorOverlay(doc)){
      picker=createColorPicker(doc,{id:`preset-color-${color.key}`,label:`${color.label} · ${choose}`,value:(color.hex??"#000000").toLowerCase(),disabled,
        ...(disabled?{disabledReason:color.reason||(pt?"Indisponível":"Unavailable")}:{}),onCommit:value=>commit(value)});
      picker.trigger.classList.add("ch-color-swatch-trigger");values.appendChild(picker.trigger);
    }else{
      swatch=doc.createElement("input");swatch.type="color";swatch.value=color.hex??"#000000";swatch.className="ch-color-swatch";swatch.disabled=disabled;swatch.setAttribute("aria-label",`${color.label} · ${choose}`);values.appendChild(swatch);
      const native=swatch;native.addEventListener("change",()=>commit(native.value));
    }
    let committed=color.hex?.toUpperCase()??"—";
    const clearDraft=():void=>{input.removeAttribute("data-color-draft");dirty(color.key,false);};
    const commit=(value:string):boolean=>{
      if(disabled||root.isConnected===false)return false;
      const normalized=value.trim().replace(/^#?/,"#").toUpperCase(),ok=/^#[0-9A-F]{6}$/.test(normalized);
      input.setAttribute("aria-invalid",String(!ok));
      if(!ok){input.setAttribute("data-color-draft","true");dirty(color.key,true);return false;}
      input.value=normalized;clearDraft();if(swatch)swatch.value=normalized;picker?.update(normalized);
      if(normalized===committed)return true;
      committed=normalized;
      options.execute("ae.presets.color-adjust",{target:data.colorTarget,key:color.key,hex:normalized});return true;
    };
    input.addEventListener("keydown",event=>{
      if(event.key==="Enter"){event.preventDefault();if(commit(input.value))input.blur();}
      if(event.key==="Escape"){event.preventDefault();input.value=committed;input.removeAttribute("aria-invalid");clearDraft();input.blur();}
    });
    input.addEventListener("blur",()=>{if(input.hasAttribute("data-color-draft"))commit(input.value);});
    input.addEventListener("input",()=>{
      input.setAttribute("data-color-draft","true");input.setAttribute("aria-invalid",String(!/^#?[0-9a-fA-F]{6}$/.test(input.value.trim())));dirty(color.key,true);
    });
    if(unavailable){row.appendChild(createElement(doc,"span","ch-color-unavailable",color.reason||(pt?"Indisponível":"Unavailable")));input.title=color.reason;if(swatch)swatch.title=color.reason;}
  }
  return root;
}
