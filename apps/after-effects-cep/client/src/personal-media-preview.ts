import { attachScrubbableNumber, button, createElement } from "@motion/ui-core";
import type { PersonalPresetItem, PersonalPresetPreview } from "@motion/contracts";

/** A passive local player. Importing remains a separate library action. */
export function createPersonalMediaPreview(doc:Document,options:{
  locale:string;
  item:PersonalPresetItem;
  load(itemId:string):Promise<PersonalPresetPreview>;
}):{element:HTMLElement;dispose():void}{
  const pt=options.locale==="pt-BR",item=options.item;
  const element=createElement(doc,"section","ch-personal-preview");
  element.setAttribute("aria-label",pt?`Prévia de ${item.name}`:`Preview of ${item.name}`);
  const heading=createElement(doc,"div","ch-personal-preview-heading");element.appendChild(heading);
  heading.appendChild(createElement(doc,"span","",item.name));
  const status=createElement(doc,"p","ch-preset-hint",pt?"Carregando prévia local…":"Loading local preview…");
  status.setAttribute("role","status");status.setAttribute("aria-live","polite");element.appendChild(status);
  const body=createElement(doc,"div","ch-personal-preview-body");element.appendChild(body);
  let disposed=false,sequence=0,media:HTMLMediaElement|undefined;
  const cleanups:Array<()=>void>=[];
  function release():void{
    for(const cleanup of cleanups.splice(0))cleanup();
    if(media){try{media.pause();media.removeAttribute("src");media.load();}catch{/* The view may already be detached. */}media=undefined;}
    while(body.firstChild)body.removeChild(body.firstChild);
  }
  function error():void{status.hidden=false;status.textContent=pt?"O formato ou codec não pode ser reproduzido no painel. Você ainda pode importar o arquivo no After Effects.":"The panel cannot play this format or codec. You can still import the file in After Effects.";}
  async function load():Promise<void>{
    const current=++sequence;release();status.hidden=false;status.textContent=pt?"Carregando prévia local…":"Loading local preview…";
    try{
      const result=await options.load(item.id);
      if(disposed||current!==sequence)return;
      if(result.itemId!==item.id||result.kind!==item.kind||!/^file:\/\/\//i.test(result.uri)||result.uri.length>8192)throw Error(pt?"A prévia retornou um arquivo inválido.":"The preview returned an invalid file.");
      if(result.kind==="image"){
        const image=doc.createElement("img");image.alt=item.name;image.className="ch-personal-preview-image";
        image.addEventListener("load",()=>{if(!disposed&&current===sequence)status.hidden=true;});
        image.addEventListener("error",()=>{if(!disposed&&current===sequence)error();});cleanups.push(()=>image.removeAttribute("src"));body.appendChild(image);image.src=result.uri;return;
      }
      const player=result.kind==="video"?doc.createElement("video"):doc.createElement("audio");media=player;
      player.className="ch-personal-preview-player";player.controls=true;player.preload="metadata";
      player.setAttribute("aria-label",pt?`Reproduzir ${item.name}`:`Play ${item.name}`);
      if(result.kind==="video")player.setAttribute("playsinline","");
      player.addEventListener("error",()=>{if(!disposed&&current===sequence)error();});
      player.addEventListener("loadedmetadata",()=>{if(!disposed&&current===sequence)status.hidden=true;});
      body.appendChild(player);
      const controls=createElement(doc,"div","ch-personal-preview-controls");body.appendChild(controls);
      const loop=button(doc,{label:pt?"Repetir":"Loop",onClick:()=>{player.loop=!player.loop;loop.setAttribute("aria-pressed",String(player.loop));}});
      loop.setAttribute("aria-pressed","false");controls.appendChild(loop);
      controls.appendChild(button(doc,{label:pt?"Voltar ao início":"Restart",onClick:()=>{try{player.currentTime=0;}catch{/* Metadata may still be loading. */}}}));
      const pitchPreview=result.kind==="audio"&&("preservesPitch" in player||"webkitPreservesPitch" in player);
      const label=createElement(doc,"label","ch-personal-preview-rate");
      label.appendChild(createElement(doc,"span","",pitchPreview?(pt?"Tom / velocidade · semitons":"Pitch / speed · semitones"):(pt?"Velocidade · ×":"Speed · ×")));
      const value=doc.createElement("input");value.type="number";value.min=pitchPreview?"-12":"0.5";value.max=pitchPreview?"12":"2";value.step="0.1";value.value=pitchPreview?"0":"1";
      value.setAttribute("aria-label",pitchPreview?(pt?"Tom da prévia":"Preview pitch"):(pt?"Velocidade da prévia":"Preview speed"));label.appendChild(value);controls.appendChild(label);
      function updateRate():void{
        const amount=Number(value.value.trim().replace(",","."));const valid=Boolean(value.value.trim())&&Number.isFinite(amount)&&amount>=Number(value.min)&&amount<=Number(value.max);value.setAttribute("aria-invalid",String(!valid));if(!valid)return;
        player.playbackRate=pitchPreview?Math.pow(2,amount/12):amount;
        const pitchPlayer=player as HTMLMediaElement&{preservesPitch?:boolean;webkitPreservesPitch?:boolean};
        if("preservesPitch" in pitchPlayer)pitchPlayer.preservesPitch=!pitchPreview;
        if("webkitPreservesPitch" in pitchPlayer)pitchPlayer.webkitPreservesPitch=!pitchPreview;
      }
      value.addEventListener("input",updateRate);value.addEventListener("change",updateRate);
      cleanups.push(attachScrubbableNumber(value,{helpText:pt?"Arraste para ajustar a prévia · Shift: precisão · Clique para digitar":"Drag to adjust preview · Shift: fine · Click to type"}));
      body.appendChild(createElement(doc,"p","ch-preset-hint",pt?"Estes ajustes afetam somente a prévia. Adicionar à composição usa o arquivo original.":"These settings affect preview only. Add to composition uses the original file."));
      player.src=result.uri;
    }catch(caught){if(!disposed&&current===sequence){status.hidden=false;status.textContent=caught instanceof Error?caught.message:(pt?"Não foi possível abrir a prévia.":"Could not open the preview.");}}
  }
  heading.appendChild(button(doc,{label:pt?"Recarregar prévia":"Reload preview",onClick:()=>{if(!disposed)void load();}}));
  void load();
  return {element,dispose(){if(disposed)return;disposed=true;sequence++;release();}};
}
