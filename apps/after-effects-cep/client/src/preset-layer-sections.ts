import {button,createColorPicker,createElement,supportsColorOverlay,type ColorPicker} from "@motion/ui-core";
import type {PresetInspection} from "@motion/contracts";

/** Native selection and colors have their own sections, independent of recipes. */
export function createPresetLayerSections(doc:Document,options:{
  locale:string; inspection:PresetInspection; busy:boolean; blocked:boolean;
  execute(command:string,args:Record<string,unknown>):void;
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
    const commit=(value:string):void=>{if(disabled)return;const ok=/^#[0-9a-fA-F]{6}$/.test(value);input.setAttribute("aria-invalid",String(!ok));if(!ok)return;input.value=value.toUpperCase();if(swatch)swatch.value=value;picker?.update(value);if(value.toUpperCase()===color.hex)return;options.execute("ae.presets.color-adjust",{target:data.colorTarget,key:color.key,hex:value});};
    input.addEventListener("keydown",event=>{if(event.key==="Enter"){commit(input.value.trim());input.blur();}if(event.key==="Escape"){input.value=color.hex??"—";input.removeAttribute("aria-invalid");input.blur();}});
    input.addEventListener("input",()=>input.removeAttribute("aria-invalid"));
    if(unavailable){row.appendChild(createElement(doc,"span","ch-color-unavailable",color.reason||(pt?"Indisponível":"Unavailable")));input.title=color.reason;if(swatch)swatch.title=color.reason;}
  }
  return root;
}
