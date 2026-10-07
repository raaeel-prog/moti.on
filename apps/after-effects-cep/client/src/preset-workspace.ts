import { attachScrubbableNumber, button, createActionButton, type ActionButtonController, clearNode, createElement, createAlert, createBadge, createI18n, selectField, type AlertController } from "@motion/ui-core";
import { isMotionLibraryOptions, type CommandResponse, type MotionLibraryOptions, type PersonalPresetCatalog, type PersonalPresetPreview, type PresetInspection, type PresetTarget, type PresetTimingArgs } from "@motion/contracts";
import { createPresetGallery, createPresetPhaseControl, defaultLibraryOptions, GALLERY_PRESETS, gallerySequenceControls, presetEasingChoices } from "./preset-gallery.js";
import { focusedPoll } from "./focused-poll.js";
import { createPresetTimingControls, defaultPresetTimingDraft } from "./preset-timing-controls.js";
import { createPresetVariants, type PresetVariant, type PresetVariantError, type PresetVariantResult, type PresetVariantStorage } from "./preset-variants.js";
import {cepGestureFiles,createNativeGestures} from "./native-gesture.js";
import {createPresetPhaseEditor} from "./preset-phase-editor.js";
import {createPresetLayerSections} from "./preset-layer-sections.js";
import {hostFailureMessage} from "./host-feedback.js";

type GalleryOptions = Parameters<typeof createPresetGallery>[1];
export interface PresetWorkspaceCache {
  personal?: PersonalPresetCatalog;
  /** Session-only recipe data: never retains host layer identities or expressions. */
  copied?: { presetId: string; options: MotionLibraryOptions };
  /** Keep the last deletion reversible when navigation recreates the workspace. */
  removedVariant?: PresetVariant;
}
let workspaceSequence = 0;
export function createPresetWorkspace(doc: Document, options: GalleryOptions & {
  cache: PresetWorkspaceCache;
  execute(command: string, args: Record<string, unknown>): Promise<CommandResponse<unknown>>;
}): { element: HTMLElement; updateContext(): void; dispose(): void } {
  let liveActive=false,gestureError="",phaseEditor:ReturnType<typeof createPresetPhaseEditor>|undefined;
  let retainedPhaseEditor:ReturnType<typeof createPresetPhaseEditor>|undefined,needsInspection=false;
  const gestures=createNativeGestures(cepGestureFiles(doc.defaultView),(active,message)=>{
    liveActive=active;if(active)content.setAttribute("data-gesture-active","true");else content.removeAttribute("data-gesture-active");
    if(active){gestureError="";epoch++;activeRead=0;content.setAttribute("aria-busy","false");}
    else if(!disposed){dirty=false;if(message)gestureError=message;void inspect(true);}
    tabState();
  });
  const i18n=createI18n({locale:options.locale}),pt=i18n.locale()==="pt-BR",nav=options.navigation;
  const hostError=(response:CommandResponse<unknown>,fallback:string):string=>response.error?(pt?response.error.message:hostFailureMessage(response.error,i18n)):fallback;
  const inspectionMessage=(data:PresetInspection):string=>{
    if(pt)return data.message;
    switch(data.state){
      case "no-comp":return "Open a composition.";
      case "no-selection":return "Select a layer with a Moti.on preset.";
      case "multiple":return "Select up to 50 compatible layers with the same editable preset.";
      case "unmanaged":return "This layer has no Moti.on preset. Edit .ffx presets in Effect Controls.";
      case "conflict":return "This preset cannot be edited here. Check its controls in After Effects.";
      default:return "Select a layer with a Moti.on preset.";
    }
  };
  const element=createElement(doc,"div","ch-preset-workspace"),tabs=createElement(doc,"div","ch-preset-tabs"),content=createElement(doc,"div","ch-preset-workspace-content");
  element.appendChild(tabs);element.appendChild(content);
  const workspaceId=`preset-workspace-${++workspaceSequence}`;
  let disposed=false, epoch=0, busy=false, readSequence=0, activeRead=0, gallery:ReturnType<typeof createPresetGallery>|undefined;
  let revealId:string|undefined;
  let snapshot:PresetInspection|undefined,draft:MotionLibraryOptions|undefined,dirty=false,stale=false;
  let error="", notice:HTMLElement|undefined, editApply:HTMLButtonElement|undefined;
  let editApplyControl:ActionButtonController|undefined;
  let noticeAlert:AlertController|undefined, noticeKey="";
  let pasteButton:HTMLButtonElement|undefined, pasteHint:HTMLElement|undefined, copyButton:HTMLButtonElement|undefined;
  let transferStatus="";
  const timingDraft=defaultPresetTimingDraft();
  let timingControls:ReturnType<typeof createPresetTimingControls>|undefined;
  let variantStorage:PresetVariantStorage|undefined;
  try{variantStorage=doc.defaultView?.localStorage;}catch{ /* The section reports unavailable storage explicitly. */ }
  const variants=createPresetVariants(variantStorage);
  let variantsOpen=false,variantName="",selectedVariant="",variantStatus="",variantError=false;
  let variantManageOpen=false,renameVariantName="",renameVariantId="";
  let variantBackupOpen=false,variantBackupText="";
  let saveVariantButton:HTMLButtonElement|undefined,updateVariantButton:HTMLButtonElement|undefined,applyVariantButton:HTMLButtonElement|undefined;
  let displayedVariant:PresetVariant|undefined;
  const invalidNumbers=new Map<string,string>();
  const changedKeys=new Set<keyof MotionLibraryOptions>();
  const isMixed=(key:keyof MotionLibraryOptions):boolean=>Boolean(snapshot?.mixedKeys?.includes(key)&&!changedKeys.has(key));
  const numericCleanups:Array<()=>void>=[];
  function disposeNumbers(preservePhase=false):void{
    if(preservePhase&&phaseEditor){retainedPhaseEditor?.dispose();retainedPhaseEditor=phaseEditor;}
    else phaseEditor?.dispose();
    phaseEditor=undefined;
    if(!preservePhase){retainedPhaseEditor?.dispose();retainedPhaseEditor=undefined;}
    for(const dispose of numericCleanups.splice(0))dispose();timingControls?.dispose();timingControls=undefined;
  }
  const browse=button(doc,{label:pt?"Navegar":"Browse",onClick:()=>switchView("browse")});
  const edit=button(doc,{label:pt?"Editar":"Edit",onClick:()=>switchView("edit")});
  tabs.setAttribute("role","tablist");
  tabs.setAttribute("aria-label",pt?"Biblioteca de presets":"Preset library");
  content.id=`${workspaceId}-content`;content.setAttribute("role","tabpanel");
  browse.id=`${workspaceId}-browse`;edit.id=`${workspaceId}-edit`;
  for(const tab of [browse,edit]){tab.setAttribute("role","tab");tabs.appendChild(tab);}
  const isBusy=():boolean=>busy||options.busy||liveActive;
  const numberPressed=():boolean=>Array.from(content.getElementsByTagName("input")).some(input=>input.getAttribute("data-scrub-pressed")==="true"||input.getAttribute("data-scrubbing")==="true");
  const numberHovered=():boolean=>Boolean(content.querySelector(".ch-phase-scrub-row:hover"));
  function tabState():void {content.setAttribute("data-browse",String((nav.view??"browse")==="browse"));tabs.hidden=false;for(const [tab,view] of [[browse,"browse"],[edit,"edit"]] as const){tab.setAttribute("aria-selected",String((nav.view??"browse")===view));tab.setAttribute("aria-controls",content.id);tab.tabIndex=(nav.view??"browse")===view?0:-1;tab.disabled=isBusy();}content.setAttribute("aria-labelledby",nav.view==="edit"?edit.id:browse.id);}
  tabs.addEventListener("keydown",event=>{if(!isBusy()&&["ArrowLeft","ArrowRight","Home","End"].includes(event.key)){event.preventDefault();switchView(event.key==="Home"?"browse":event.key==="End"?"edit":nav.view==="edit"?"browse":"edit");(nav.view==="edit"?edit:browse).focus();}});
  function switchView(view:"browse"|"edit",initial=false):void {
    if(!initial&&(isBusy()||nav.view===view))return;disposeNumbers(dirty&&Boolean(snapshot?.phases?.length));nav.view=view;epoch++;activeRead=0;needsInspection=view==="edit"&&dirty&&Boolean(retainedPhaseEditor);gallery?.dispose();gallery=undefined;noticeAlert?.dispose();noticeAlert=undefined;noticeKey="";clearNode(content);notice=undefined;tabState();
    if(view==="browse")drawBrowse();else{drawEdit();void inspect();}polling?.refresh();
  }
  function showError(message:string):void {error=message;if(nav.view==="edit"){if(snapshot?.target)stale=true;drawEdit();}else drawBrowse();}
  function revealPreset(presetId:string):void {
    if(isBusy())return;
    const preset=GALLERY_PRESETS.find(item=>item.motion?.id===presetId);
    if(!preset)return;
    revealId=preset.id;
    switchView("browse");
  }
  function drawBrowse():void {
    if(disposed||nav.view==="edit")return;gallery?.dispose();clearNode(content);
    if(error)content.appendChild(createAlert(doc,{title:error,tone:"info"}).element);
    gallery=createPresetGallery(doc,{...options,...(revealId?{revealId}:{}),openApplied:undefined,busy:busy||options.busy,personal:options.cache.personal,
      personalAction:(action,rootId)=>{void personal(action,rootId);},applyPersonal:itemId=>{void applyPersonal(itemId);},previewPersonal:async itemId=>{
        const response=await options.execute("ae.presets.personal-preview",{itemId});
        if(!response.ok||!response.data)throw Error(hostError(response,pt?"Não foi possível abrir a prévia.":"Could not open preview."));
        return response.data as PersonalPresetPreview;
      }});
    revealId=undefined;content.appendChild(gallery.element);
  }
  async function personal(action:"list"|"add"|"remove",rootId?:string):Promise<void>{
    if(isBusy())return;busy=true;error="";tabState();drawBrowse();
    try{
      const response=await options.execute("ae.presets.personal",rootId?{action,rootId}:{action});
      if(disposed)return;if(!response.ok||!response.data){showError(hostError(response,pt?"Não foi possível abrir a biblioteca.":"Could not open the library."));return;}
      options.cache.personal=response.data as PersonalPresetCatalog;
      if(action==="remove")nav.category="personal";
      else if(action==="add"&&!options.cache.personal.cancelled)nav.category="personal";
    }catch{if(!disposed)error=pt?"Não foi possível acessar a biblioteca. Tente novamente.":"Could not access the library. Try again.";}
    finally{busy=false;if(!disposed){tabState();drawBrowse();}}
  }
  async function applyPersonal(itemId:string):Promise<void>{
    if(isBusy())return;busy=true;error="";tabState();drawBrowse();
    try{const result=await options.execute("ae.presets.personal-apply",{itemId});if(!disposed){
      const kind=(result.data as {kind?:string}|null)?.kind??options.cache.personal?.items.find(item=>item.id===itemId)?.kind??"preset";
      error=result.ok?(kind==="project"?(pt?"Projeto importado no painel Projeto.":"Project imported into the Project panel."):kind==="preset"?(pt?"Preset aplicado. Ajuste nos Controles do efeito.":"Preset applied. Adjust in Effect Controls."):(pt?"Mídia adicionada à composição no tempo atual.":"Media added to the composition at the current time.")):hostError(result,pt?"Não foi possível adicionar o item.":"Unable to add this item.");
    }}
    catch{if(!disposed)error=pt?"Falha ao aplicar o preset.":"Failed to apply preset.";}
    finally{busy=false;if(!disposed){tabState();drawBrowse();}}
  }
  function sameTarget(a?:PresetTarget,b?:PresetTarget):boolean{return Boolean(a&&b&&a.compId===b.compId&&a.layerId===b.layerId&&a.instance===b.instance);}
  async function inspect(force=false):Promise<void>{
    if(disposed||isBusy()||numberPressed()||(!force&&numberHovered())||activeRead||nav.view!=="edit"||doc.hidden)return;
    const token=epoch,readId=++readSequence;activeRead=readId;content.setAttribute("aria-busy","true");updateNotice();
    try{
      const response=await options.execute("ae.presets.inspect",{});
      if(disposed||token!==epoch||numberPressed()||(!force&&numberHovered())||nav.view!=="edit")return;
      if(!response.ok||!response.data){showError(hostError(response,pt?"Não foi possível ler a seleção.":"Unable to read selection."));return;}
      const next=response.data as PresetInspection;
      if(!force&&snapshot?.state===next.state&&snapshot?.target?.fingerprint===next.target?.fingerprint&&(sameTarget(next.target,snapshot?.target)||(!next.target&&!snapshot?.target))&&snapshot?.message===next.message&&JSON.stringify(snapshot?.targets)===JSON.stringify(next.targets)&&JSON.stringify(snapshot?.mixedKeys)===JSON.stringify(next.mixedKeys)&&JSON.stringify(snapshot?.colorTarget)===JSON.stringify(next.colorTarget)&&JSON.stringify(snapshot?.selection)===JSON.stringify(next.selection)){needsInspection=false;updateNotice();return;}
      // A host selection change must not silently discard local edits.
      if(!force&&dirty){stale=true;needsInspection=false;updateNotice();return;}
      snapshot=next;draft=next.options?{...next.options}:undefined;dirty=false;stale=false;needsInspection=false;error=gestureError;gestureError="";invalidNumbers.clear();changedKeys.clear();drawEdit();
    }catch{if(!disposed&&token===epoch)showError(pt?"A leitura falhou. Tente novamente.":"Reading failed. Try again.");}
    finally{if(activeRead===readId){activeRead=0;content.setAttribute("aria-busy","false");if(!disposed)updateNotice();}}
  }
  function updateNotice():void {
    if(!notice)return;
    const key=error|| (stale?"stale":"");
    if(key!==noticeKey){
      noticeAlert?.dispose();noticeAlert=undefined;noticeKey=key;clearNode(notice);
      if(key){
        noticeAlert=createAlert(doc,{
          title:error||(pt?"A seleção mudou":"Selection changed"),
          ...(stale&&!error?{description:pt?"Seus ajustes foram mantidos. Recarregar descarta os ajustes e lê a seleção atual.":"Your edits were kept. Reload discards edits and reads the current selection."}:{}),
          tone:error?"destructive":"warning",
          actions:[{label:pt?"Recarregar":"Reload",dismissOnPress:false,onPress:()=>{if(!isBusy())void inspect(true);}}]
        });
        notice.appendChild(noticeAlert.element);
      }
    }
    notice.hidden=!key;
    if(noticeAlert)for(const action of Array.from(noticeAlert.element.getElementsByTagName("button")))action.disabled=isBusy();
    if(editApply){editApply.disabled=isBusy()||stale||!dirty||invalidNumbers.size>0;editApply.title=isBusy()?(pt?"Aguarde a operação atual.":"Wait for the current operation."):stale?(pt?"Recarregue a seleção antes de aplicar.":"Reload the selection before applying."):invalidNumbers.size>0?(pt?"Corrija os campos indicados.":"Correct the highlighted fields."):!dirty?(pt?"Ajuste um parâmetro para aplicar.":"Change a parameter to apply."):"";}
    if(editApply&&editApplyControl)editApplyControl.setDisabled(editApply.disabled,editApply.title||undefined);
    phaseEditor?.setBlocked(stale||needsInspection||isBusy(),isBusy());
    updateTransferContext();
    timingControls?.updateContext();
  }
  function pasteReason(copied=options.cache.copied):string {
    const context=options.context?.();
    if(!copied||!isMotionLibraryOptions(copied.options)||!GALLERY_PRESETS.some(p=>p.motion?.id===copied.presetId&&!p.category.startsWith("camera")))return pt?"Copie um preset de movimento ou texto aplicado.":"Copy an applied motion or text preset.";
    if(dirty)return pt?"Aplique ou descarte os ajustes antes de colar.":"Apply or discard your changes before pasting.";
    if(context&&!context.hasComp)return pt?"Abra uma composição.":"Open a composition.";
    if(context&&context.selectionCount<1)return pt?"Selecione as camadas que receberão o preset.":"Select the layers that will receive the preset.";
    return "";
  }
  function updateTransferContext():void {
    const reason=pasteReason();
    if(pasteButton){pasteButton.disabled=isBusy()||Boolean(reason);pasteButton.setAttribute("aria-disabled",String(pasteButton.disabled));pasteButton.title=reason;}
    if(pasteHint)pasteHint.textContent=reason||transferStatus||(pt?"Selecione as camadas de destino e cole a configuração copiada.":"Select destination layers and paste the copied settings.");
    if(copyButton){copyButton.disabled=isBusy()||dirty||stale||invalidNumbers.size>0||Boolean(snapshot?.mixedKeys?.length);copyButton.title=dirty?(pt?"Aplique ou descarte os ajustes antes de copiar.":"Apply or discard your changes before copying."):"";}
    if(saveVariantButton)saveVariantButton.disabled=!canSaveVariant();
    if(updateVariantButton)updateVariantButton.disabled=!canSaveVariant();
    if(applyVariantButton){const variantReason=pasteReason(displayedVariant);applyVariantButton.disabled=isBusy()||Boolean(variantReason);applyVariantButton.title=variantReason;}
  }
  function canSaveVariant():boolean {
    return !isBusy()&&!activeRead&&!dirty&&!stale&&invalidNumbers.size===0&&snapshot?.state==="ready"&&!snapshot.cameraTransition&&!snapshot.mixedKeys?.length&&Boolean(snapshot.target&&snapshot.presetId&&snapshot.options&&isMotionLibraryOptions(snapshot.options));
  }
  function variantErrorText(code:PresetVariantError):string {
    const messages:Record<PresetVariantError,[string,string]>={
      unavailable:["Armazenamento local indisponível. As variações não podem ser salvas.","Local storage is unavailable. Variations cannot be saved."],
      read:["Não foi possível ler as variações. Os dados existentes foram preservados.","Could not read variations. Existing data was preserved."],
      invalid:["Os dados das variações são inválidos ou incompatíveis. Nenhum dado foi substituído.","Variation data is invalid or incompatible. No data was replaced."],
      write:["Não foi possível confirmar o salvamento. Tente atualizar a lista.","Could not confirm the save. Try refreshing the list."],
      name:["Use um nome de 1 a 80 caracteres, sem quebras de linha.","Use a name of 1 to 80 characters, without line breaks."],
      duplicate:["Já existe uma variação com esse nome. Escolha outro nome.","A variation with this name already exists. Choose another name."],
      limit:["Limite de 100 variações atingido. Exclua uma antes de salvar.","The limit of 100 variations was reached. Delete one before saving."],
      missing:["A variação não está mais disponível. Atualize a lista.","The variation is no longer available. Refresh the list."]
    };
    return messages[code][pt?0:1];
  }
  function acceptVariantResult(result:PresetVariantResult,message:string):boolean {
    // Current storage health is rendered separately; a transient read failure
    // must not replace the last operation's feedback after storage recovers.
    if(!result.ok&&(result.error==="read"||result.error==="unavailable"))return false;
    variantError=!result.ok;variantStatus=result.ok?message:variantErrorText(result.error);
    return result.ok;
  }
  async function saveVariant(updateId?:string):Promise<void> {
    if(!canSaveVariant()||!snapshot?.target||!snapshot.presetId)return;
    const expected={...snapshot.target},expectedTargets=JSON.stringify(snapshot.targets??[]),presetId=snapshot.presetId,name=variantName,token=++epoch;
    busy=true;tabState();drawEdit();
    try{
      const response=await options.execute("ae.presets.inspect",{});
      if(disposed||token!==epoch||nav.view!=="edit")return;
      if(!response.ok||!response.data){
        stale=true;variantError=true;variantStatus=hostError(response,pt?"Não foi possível conferir o preset aplicado. Recarregue a seleção antes de salvar.":"Could not verify the applied preset. Reload the selection before saving.");return;
      }
      const current=response.data as PresetInspection;
      if(current.state!=="ready"||current.cameraTransition||Boolean(current.mixedKeys?.length)||!sameTarget(current.target,expected)||current.target?.fingerprint!==expected.fingerprint||JSON.stringify(current.targets??[])!==expectedTargets||current.presetId!==presetId||!current.options||!isMotionLibraryOptions(current.options)){
        stale=true;variantError=true;variantStatus=pt?"A seleção ou os ajustes mudaram. Recarregue os valores antes de salvar a variação.":"The selection or settings changed. Reload the values before saving the variation.";return;
      }
      const saved=updateId?variants.update(updateId,presetId,current.options):variants.save(name,presetId,current.options);
      const message=updateId?(pt?"Variação atualizada com os ajustes aplicados.":"Variation updated with the applied settings."):(pt?"Variação salva neste painel.":"Variation saved in this panel.");
      if(acceptVariantResult(saved,message)&&saved.ok){selectedVariant=updateId??saved.items[saved.items.length-1]!.id;if(!updateId)variantName="";}
    }catch{
      if(!disposed&&token===epoch){stale=true;variantError=true;variantStatus=pt?"A leitura falhou. Recarregue a seleção antes de salvar a variação.":"Reading failed. Reload the selection before saving the variation.";}
    }finally{busy=false;if(!disposed&&token===epoch){tabState();drawEdit();}}
  }
  function drawVariants():void {
    saveVariantButton=undefined;updateVariantButton=undefined;applyVariantButton=undefined;displayedVariant=undefined;
    const section=doc.createElement("details");section.className="ch-preset-variants";section.open=variantsOpen;
    section.appendChild(createElement(doc,"summary","",pt?"Variações salvas":"Saved variations"));
    section.addEventListener("toggle",()=>{variantsOpen=section.open;});
    const body=createElement(doc,"div","ch-preset-variants-body");section.appendChild(body);content.appendChild(section);
    const result=variants.read();
    const storageError=result.ok?"":variantErrorText(result.error);
    const items=result.ok?result.items:[];
    if(!items.some(item=>item.id===selectedVariant))selectedVariant=items[0]?.id??"";
    if(items.length){
      displayedVariant=items.find(item=>item.id===selectedVariant);
      if(renameVariantId!==selectedVariant){renameVariantId=selectedVariant;renameVariantName=displayedVariant?.name??"";}
      const select=selectField(doc,{id:`${workspaceId}-variant`,label:pt?"Variação":"Variation",value:selectedVariant,disabled:isBusy(),options:items.map(item=>({value:item.id,label:item.name})),onChange:value=>{selectedVariant=value;drawEdit();}});
      select.getElementsByTagName("select")[0]?.setAttribute("aria-label",pt?"Variação salva":"Saved variation");body.appendChild(select);
      const actions=createElement(doc,"div","ch-preset-variant-actions");body.appendChild(actions);
      applyVariantButton=button(doc,{label:pt?"Aplicar variação na seleção":"Apply variation to selection",disabled:isBusy()||Boolean(pasteReason(displayedVariant)),onClick:()=>{
        if(isBusy())return;const current=variants.read();
        if(!current.ok){acceptVariantResult(current,"");drawEdit();return;}
        const chosen=current.items.find(item=>item.id===selectedVariant);
        if(!chosen){acceptVariantResult({ok:false,error:"missing"},"");drawEdit();return;}
        void paste({presetId:chosen.presetId,options:{...chosen.options}},chosen.name);
      }});actions.appendChild(applyVariantButton);
      actions.appendChild(button(doc,{label:pt?"Carregar para colar":"Load for paste",disabled:isBusy(),onClick:()=>{
        if(isBusy())return;const current=variants.read();
        if(!current.ok){acceptVariantResult(current,"");drawEdit();return;}
        const chosen=current.items.find(item=>item.id===selectedVariant);
        if(!chosen){acceptVariantResult({ok:false,error:"missing"},"");drawEdit();return;}
        options.cache.copied={presetId:chosen.presetId,options:{...chosen.options}};
        variantError=false;variantStatus=pt?`Variação “${chosen.name}” carregada. Use Colar na seleção.`:`Variation “${chosen.name}” loaded. Use Paste to selection.`;
        transferStatus=variantStatus;drawEdit();
      }}));
      const manage=doc.createElement("details");manage.open=variantManageOpen;manage.className="ch-preset-variant-manage";
      manage.appendChild(createElement(doc,"summary","",pt?"Gerenciar variação":"Manage variation"));manage.addEventListener("toggle",()=>{variantManageOpen=manage.open;});
      const manageBody=createElement(doc,"div","ch-preset-variants-body ch-preset-variant-save");manage.appendChild(manageBody);body.appendChild(manage);
      const renameLabel=doc.createElement("label");renameLabel.htmlFor=`${workspaceId}-variant-rename`;renameLabel.textContent=pt?"Nome da variação selecionada":"Selected variation name";manageBody.appendChild(renameLabel);
      const rename=doc.createElement("input");rename.type="text";rename.id=renameLabel.htmlFor;rename.maxLength=80;rename.value=renameVariantName;rename.disabled=isBusy();rename.setAttribute("aria-label",renameLabel.textContent);rename.addEventListener("input",()=>{renameVariantName=rename.value;});manageBody.appendChild(rename);
      const manageActions=createElement(doc,"div","ch-preset-variant-actions");manageBody.appendChild(manageActions);
      manageActions.appendChild(button(doc,{label:pt?"Renomear":"Rename",disabled:isBusy(),onClick:()=>{
        if(isBusy())return;acceptVariantResult(variants.rename(selectedVariant,renameVariantName),pt?"Variação renomeada.":"Variation renamed.");drawEdit();
      }}));
      manageActions.appendChild(button(doc,{label:pt?"Duplicar":"Duplicate",disabled:isBusy(),onClick:()=>{
        if(isBusy())return;const duplicated=variants.duplicate(selectedVariant);
        if(acceptVariantResult(duplicated,pt?"Cópia da variação criada.":"Variation copy created.")&&duplicated.ok)selectedVariant=duplicated.items[duplicated.items.length-1]!.id;drawEdit();
      }}));
      updateVariantButton=button(doc,{label:pt?"Atualizar com o preset aplicado":"Update from applied preset",disabled:!canSaveVariant(),onClick:()=>{void saveVariant(selectedVariant);}});manageBody.appendChild(updateVariantButton);
      manageBody.appendChild(createElement(doc,"p","ch-preset-hint",pt?"Atualizar substitui os ajustes desta variação pelos ajustes já aplicados à camada. O nome é mantido.":"Updating replaces this variation's settings with those already applied to the layer. Its name is kept."));
      manageActions.appendChild(button(doc,{label:pt?"Excluir variação":"Delete variation",variant:"destructive",disabled:isBusy(),onClick:()=>{
        if(isBusy())return;const current=variants.read();
        if(!current.ok){acceptVariantResult(current,"");drawEdit();return;}
        const chosen=current.items.find(item=>item.id===selectedVariant),removed=variants.remove(selectedVariant);
        if(acceptVariantResult(removed,pt?"Variação excluída. Você pode desfazer nesta sessão.":"Variation deleted. You can undo during this session.")&&chosen)options.cache.removedVariant=chosen;
        drawEdit();
      }}));
    }else if(result.ok)body.appendChild(createElement(doc,"p","ch-preset-hint",pt?"Nenhuma variação salva neste painel.":"No saved variations in this panel."));
    const save=createElement(doc,"div","ch-preset-variant-save");
    const nameLabel=doc.createElement("label");nameLabel.textContent=pt?"Nome da variação":"Variation name";nameLabel.htmlFor=`${workspaceId}-variant-name`;save.appendChild(nameLabel);
    const name=doc.createElement("input");name.type="text";name.id=nameLabel.htmlFor;name.maxLength=80;name.value=variantName;name.disabled=isBusy();name.setAttribute("aria-label",pt?"Nome da variação":"Variation name");
    name.addEventListener("input",()=>{variantName=name.value;});save.appendChild(name);
    saveVariantButton=button(doc,{label:pt?"Salvar preset aplicado":"Save applied preset",disabled:!canSaveVariant(),onClick:()=>{void saveVariant();}});save.appendChild(saveVariantButton);body.appendChild(save);
    body.appendChild(createElement(doc,"p","ch-preset-hint",pt?"Salva os ajustes já aplicados de uma receita de movimento ou texto. Aplique ou descarte alterações pendentes primeiro.":"Saves the applied settings of a motion or text recipe. Apply or discard pending changes first."));
    const footer=createElement(doc,"div","ch-preset-variant-actions");
    footer.appendChild(button(doc,{label:pt?"Atualizar variações":"Refresh variations",disabled:isBusy(),onClick:()=>{if(isBusy())return;acceptVariantResult(variants.read(),pt?"Lista atualizada.":"List refreshed.");drawEdit();}}));
    if(options.cache.removedVariant)footer.appendChild(button(doc,{label:pt?"Desfazer exclusão":"Undo deletion",disabled:isBusy(),onClick:()=>{
      const removed=options.cache.removedVariant;if(isBusy()||!removed)return;const restored=variants.restore(removed);
      if(acceptVariantResult(restored,pt?"Variação restaurada.":"Variation restored.")){selectedVariant=removed.id;delete options.cache.removedVariant;}drawEdit();
    }}));body.appendChild(footer);
    const backup=doc.createElement("details");backup.className="ch-preset-variant-backup";backup.open=variantBackupOpen;
    backup.appendChild(createElement(doc,"summary","",pt?"Backup de variações":"Variation backup"));backup.addEventListener("toggle",()=>{variantBackupOpen=backup.open;});
    const backupBody=createElement(doc,"div","ch-preset-variants-body");backup.appendChild(backupBody);body.appendChild(backup);
    backupBody.appendChild(createElement(doc,"p","ch-preset-hint",pt?"Copie o backup para guardar suas variações ou cole um backup neste campo para adicioná-las. As variações existentes são preservadas.":"Copy the backup to keep your variations, or paste a backup in this field to add them. Existing variations are preserved."));
    const backupText=doc.createElement("textarea");backupText.className="ch-preset-variant-backup-text";backupText.rows=6;backupText.maxLength=131072;backupText.value=variantBackupText;backupText.disabled=isBusy();backupText.spellcheck=false;backupText.setAttribute("aria-label",pt?"Dados do backup de variações":"Variation backup data");backupText.addEventListener("input",()=>{variantBackupText=backupText.value;});backupBody.appendChild(backupText);
    const backupActions=createElement(doc,"div","ch-preset-variant-actions");backupBody.appendChild(backupActions);
    const copyBackup=async():Promise<void>=>{
      if(isBusy())return;const exported=variants.exportJson();
      if(!exported.ok){acceptVariantResult(exported,"");drawEdit();return;}
      const token=epoch;
      variantBackupText=exported.json;backupText.value=variantBackupText;
      let copied=false;
      try{const clipboard=doc.defaultView?.navigator?.clipboard;if(clipboard?.writeText){await clipboard.writeText(variantBackupText);copied=true;}}catch{ /* Selecting the text keeps backup available when CEP denies clipboard access. */ }
      if(disposed||token!==epoch||nav.view!=="edit")return;variantError=false;variantStatus=copied?(pt?"Backup copiado.":"Backup copied."):(pt?"Backup preparado. Copie o texto selecionado.":"Backup prepared. Copy the selected text.");drawEdit();
      if(!copied){const field=content.getElementsByTagName("textarea")[0];field?.focus();field?.select?.();}
    };
    backupActions.appendChild(button(doc,{label:pt?"Copiar backup":"Copy backup",disabled:isBusy(),onClick:()=>{void copyBackup();}}));
    backupActions.appendChild(button(doc,{label:pt?"Importar backup":"Import backup",disabled:isBusy(),onClick:()=>{
      if(isBusy())return;const imported=variants.importJson(variantBackupText);
      if(acceptVariantResult(imported,pt?"Backup importado. As variações existentes foram mantidas.":"Backup imported. Existing variations were kept."))renameVariantId="";drawEdit();
    }}));
    const feedbackText=storageError||variantStatus,feedbackError=Boolean(storageError)||variantError;
    if(feedbackText){const feedback=createElement(doc,"p",feedbackError?"ch-field__error":"ch-preset-hint",feedbackText);feedback.setAttribute("role",feedbackError?"alert":"status");feedback.setAttribute("aria-live","polite");body.appendChild(feedback);}
  }
  function drawTransfer():void {
    pasteButton=undefined;pasteHint=undefined;
    const copied=options.cache.copied;
    if(!copied)return;
    const preset=GALLERY_PRESETS.find(p=>p.motion?.id===copied.presetId)?.motion;
    if(!preset)return;
    const transfer=createElement(doc,"section","ch-preset-transfer");transfer.setAttribute("aria-label",pt?"Preset copiado":"Copied preset");
    const heading=createElement(doc,"div","ch-preset-transfer-heading");
    heading.appendChild(createElement(doc,"span","",`${pt?"Copiado":"Copied"}: ${preset.name[options.locale as "pt-BR"|"en-US"]??preset.id}`));
    heading.appendChild(button(doc,{label:pt?"Limpar":"Clear",disabled:isBusy(),onClick:()=>{if(isBusy())return;delete options.cache.copied;transferStatus="";drawEdit();}}));transfer.appendChild(heading);
    if(preset.mode==="transition")transfer.appendChild(createPresetPhaseControl(doc,{locale:options.locale,value:copied.options.phase,disabled:isBusy(),label:pt?"Colar como":"Paste as",onChange:phase=>{copied.options.phase=phase;transferStatus="";updateTransferContext();}}));
    pasteButton=button(doc,{label:pt?"Colar na seleção":"Paste to selection",disabled:isBusy()||Boolean(pasteReason()),onClick:()=>{void paste();}});transfer.appendChild(pasteButton);
    pasteHint=createElement(doc,"p","ch-preset-hint");pasteHint.setAttribute("role","status");pasteHint.setAttribute("aria-live","polite");transfer.appendChild(pasteHint);content.appendChild(transfer);
  }
  async function paste(copied=options.cache.copied,variantLabel?:string):Promise<void> {
    if(isBusy()||!copied||pasteReason(copied))return;
    if(variantLabel){variantStatus="";variantError=false;}
    busy=true;epoch++;activeRead=0;error="";transferStatus="";tabState();drawEdit();
    try {
      const recipe=GALLERY_PRESETS.find(item=>item.motion?.id===copied.presetId)?.motion;
      const response=await options.execute(recipe?.mode==="transition"?"ae.presets.phase-apply":"ae.presets.apply",{presetId:copied.presetId,...copied.options});
      if(disposed)return;
      if(!response.ok){error=hostError(response,pt?"Não foi possível colar o preset.":"Could not paste the preset.");}
      else{snapshot=undefined;transferStatus=variantLabel?(pt?`Variação “${variantLabel}” aplicada na seleção.`:`Variation “${variantLabel}” applied to selection.`):(pt?"Preset colado na seleção.":"Preset pasted to selection.");if(variantLabel){variantStatus=transferStatus;variantError=false;}}
    }catch{if(!disposed)error=pt?"Falha ao colar. Confira a seleção e tente novamente.":"Paste failed. Check the selection and try again.";}
    finally{busy=false;if(!disposed){tabState();if(!snapshot)await inspect(true);else drawEdit();}}
  }
  function timingBlockedReason():string {
    if(dirty||invalidNumbers.size)return pt?"Aplique ou descarte os ajustes antes de organizar os marcadores.":"Apply or discard your changes before arranging markers.";
    if(stale)return pt?"Recarregue a seleção antes de organizar os marcadores.":"Reload the selection before arranging markers.";
    return "";
  }
  async function arrangeTiming(args:PresetTimingArgs):Promise<void> {
    if(isBusy()||timingBlockedReason())return;
    busy=true;epoch++;activeRead=0;error="";timingDraft.message="";tabState();drawEdit();
    try{
      const response=await options.execute("ae.presets.timing",{...args});
      if(disposed)return;
      if(response.ok){
        const count=(response.data as {appliedCount?:number}|null)?.appliedCount;
        timingDraft.message=count===0?(pt?"Os marcadores já estão no destino solicitado.":"Markers are already at the requested position."):(pt?"Marcadores organizados na seleção.":"Markers arranged in the selection.");
        snapshot=undefined;
      }else timingDraft.message=hostError(response,pt?"Não foi possível organizar os marcadores.":"Could not arrange the markers.");
    }catch{if(!disposed)timingDraft.message=pt?"Não foi possível confirmar a alteração. Confira os marcadores na timeline.":"Could not confirm the change. Check the markers in the timeline.";}
    finally{busy=false;if(!disposed){tabState();if(!snapshot)await inspect(true);else drawEdit();}}
  }
  function drawUtilities():void{
    drawVariants();drawTransfer();
    timingControls=createPresetTimingControls(doc,{locale:options.locale,draft:timingDraft,busy:isBusy(),...(options.context?{context:options.context}:{}),blockedReason:timingBlockedReason,onApply:args=>{void arrangeTiming(args);}});
    content.appendChild(timingControls.element);
  }
  function drawLayerSections(data:PresetInspection):void{
    content.appendChild(createPresetLayerSections(doc,{locale:options.locale,inspection:data,busy:isBusy(),blocked:dirty||stale,execute:(command,args)=>{void phaseCommand(command,args);}}));
  }
  function drawEdit():void {
    content.setAttribute("data-editor","other");
    disposeNumbers(dirty&&Boolean(snapshot?.phases?.length));noticeAlert?.dispose();noticeAlert=undefined;noticeKey="";clearNode(content);editApply=undefined;copyButton=undefined;notice=createElement(doc,"div","ch-workspace-notice");content.appendChild(notice);
    const data=snapshot;
    if(data?.state==="ready"&&data.phases?.length){
      phaseEditor=retainedPhaseEditor??createPresetPhaseEditor(doc,{locale:options.locale,inspection:data,busy:isBusy(),
        reveal:revealPreset,
        copy:phase=>{options.cache.copied={presetId:phase.presetId,options:{...phase.options}};transferStatus=pt?"Fase copiada. Selecione a camada de destino e cole.":"Phase copied. Select the destination layer and paste.";updateTransferContext();},
        execute:(command,args)=>{void phaseCommand(command,args);},onDirty:value=>{dirty=value;updateTransferContext();},
        ...(gestures.available()&&data.target&&!data.targets?.length?{live:{start:(phase,key)=>{if(isBusy()||stale)return false;const hostValue=Number(phase.options[key as keyof MotionLibraryOptions]);if(!Number.isFinite(hostValue))return false;gestures.start(data.target!,phase,key,hostValue);return liveActive;},update:value=>gestures.update(value),finish:(canceled,value)=>{void gestures.finish(canceled,value);}}}: {})});retainedPhaseEditor=undefined;
      content.appendChild(phaseEditor.element);
      drawLayerSections(data);drawUtilities();updateNotice();return;
    }
    if(data?.state!=="ready"||!data.options||!data.target||!draft){
      const message = data ? inspectionMessage(data) : (error ? (pt ? "Não foi possível carregar os controles." : "Could not load the controls.") : (pt ? "Lendo a camada selecionada…" : "Reading selected layer…"));
      if(data?.layerName){const layer=createElement(doc,"div","ch-phase-layer");layer.appendChild(createElement(doc,"span","",pt?"Camada: ":"Layer: "));layer.appendChild(createElement(doc,"strong","",data.layerName));content.appendChild(layer);}
      const presets=doc.createElement("details");presets.className="ch-edit-section";presets.open=true;presets.appendChild(createElement(doc,"summary","","Presets"));presets.appendChild(createElement(doc,"p","ch-preset-hint",message));presets.appendChild(button(doc,{label:pt?"Ver presets":"Browse presets",onClick:()=>switchView("browse")}));content.appendChild(presets);
      if(data)drawLayerSections(data);drawUtilities();updateNotice(); return;
    }
    const preset=GALLERY_PRESETS.find(p=>p.motion?.id===data.presetId)?.motion;
    if(!preset){error=pt?"Este preset não está disponível nesta versão do painel.":"This preset is not available in this panel version.";updateNotice();return;}
    const heading=createElement(doc,"div","ch-applied-heading");heading.appendChild(createElement(doc,"span","ch-applied-layer",data.layerName??""));heading.appendChild(createElement(doc,"h3","",preset.name[options.locale as "pt-BR"|"en-US"]??preset.id));heading.appendChild(createBadge(doc,{label:pt?"Ajustável":"Editable",showIcon:false}).element);content.appendChild(heading);
    heading.appendChild(button(doc,{label:pt?"Mostrar na biblioteca":"Show in library",disabled:isBusy(),onClick:()=>{
      if(data.presetId)revealPreset(data.presetId);
    }}));
    if(data.targets?.length)content.appendChild(createElement(doc,"p","ch-preset-hint",pt?(data.mixedKeys?.length?"Vários indica valores diferentes. Apenas os parâmetros ajustados serão alterados em todas as camadas.":`${data.targets.length} camadas selecionadas. Os ajustes serão aplicados em conjunto.`):(data.mixedKeys?.length?"Multiple indicates different values. Only adjusted parameters change on all layers.":`${data.targets.length} selected layers. Changes apply together.`)));
    const fields=createElement(doc,"div","ch-applied-fields");content.appendChild(fields);
    const activeNumbers=new Set<string>();
    const changed=(key:keyof MotionLibraryOptions):void=>{
      if(snapshot?.mixedKeys?.includes(key)||draft![key]!==snapshot?.options?.[key])changedKeys.add(key);else changedKeys.delete(key);
      dirty=changedKeys.size>0||invalidNumbers.size>0;updateNotice();
    };
    function numeric(key:"durationFrames"|"intensity"|"staggerFrames"|"elasticity"|"overlap"|"speed"|"seed",label:string,min:number,max:number,step=1):void {
      activeNumbers.add(key);
      const row=createElement(doc,"div","ch-applied-field ch-applied-field--numeric"),header=createElement(doc,"div","ch-applied-control"),controls=createElement(doc,"div","ch-applied-number");
      const parts=label.split(" · "),toggle=button(doc,{label:parts[0]!,disabled:busy,onClick:()=>{controls.hidden=!controls.hidden;controls.setAttribute("data-open",String(!controls.hidden));toggle.setAttribute("aria-expanded",String(!controls.hidden));}});
      toggle.className="ch-applied-disclosure";toggle.setAttribute("aria-expanded","false");toggle.setAttribute("aria-controls",`${workspaceId}-range-${key}`);header.appendChild(toggle);
      controls.id=`${workspaceId}-range-${key}`;controls.hidden=true;controls.setAttribute("data-motion","view-enter");
      const displayValue=():string=>String(Number(Number(draft![key]).toFixed(step===1?0:4)));
      const slider=doc.createElement("input"),number=doc.createElement("input");slider.type="range";number.type="number";
      for(const input of [slider,number]){input.min=String(min);input.max=String(max);input.step=String(step);input.value=displayValue();input.setAttribute("aria-label",label);input.disabled=busy;}
      if(isMixed(key)){number.value="";number.placeholder=pt?"Vários":"Multiple";number.setAttribute("data-mixed","true");number.title=pt?"Vários valores. Arraste ou digite para definir o mesmo valor nas camadas.":"Multiple values. Drag or type to set the same value on all layers.";}
      if(invalidNumbers.has(key))number.value=invalidNumbers.get(key)!;
      const validation=createElement(doc,"div","ch-field__error");validation.id=`${workspaceId}-${key}-error`;validation.setAttribute("role","alert");validation.hidden=true;number.setAttribute("aria-describedby",validation.id);
      const value=createElement(doc,"div","ch-applied-value");value.appendChild(number);value.appendChild(createElement(doc,"span","ch-applied-unit",parts[1]??""));header.appendChild(value);controls.appendChild(slider);
      function validationState(valid:boolean):void {
        validation.hidden=valid;number.setAttribute("aria-invalid",String(!valid));
        validation.textContent=valid?"":pt?`Use ${step===1?"um número inteiro":"um número"} entre ${min} e ${max}.`:`Enter ${step===1?"a whole number":"a number"} from ${min} to ${max}.`;
      }
      function commit(input:HTMLInputElement):void {
        if(input.value.trim()===""&&snapshot?.mixedKeys?.includes(key)){
          changedKeys.delete(key);invalidNumbers.delete(key);draft![key]=snapshot.options![key] as never;number.setAttribute("data-mixed","true");validationState(true);dirty=changedKeys.size>0||invalidNumbers.size>0;updateNotice();return;
        }
        const text=input.value.trim().replace(",","."),value=Number(text);
        const valid=/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text)&&Number.isFinite(value)&&value>=min&&value<=max&&(step!==1||Number.isInteger(value));
        validationState(valid);
        if(!valid){invalidNumbers.set(key,input.value);changed(key);return;}
        invalidNumbers.delete(key);draft![key]=value;slider.value=String(value);if(input===slider)number.value=String(value);number.removeAttribute("data-mixed");changed(key);
      }
      validationState(!invalidNumbers.has(key));
      numericCleanups.push(attachScrubbableNumber(number,{mixedValue:Number(draft![key]),helpText:pt?"Arraste para ajustar · Shift: precisão · Alt: rápido · Clique para digitar":"Drag to adjust · Shift: fine · Alt: fast · Click to type"}));
      const reset=button(doc,{label:pt?"Restaurar este valor":"Reset this value",disabled:busy,onClick:()=>{const defaults=defaultLibraryOptions(preset!),original=defaults[key];if(typeof original!=="number")return;number.value=String(original);commit(number);}});reset.classList.add("ch-applied-value-reset");controls.appendChild(reset);
      slider.addEventListener("input",()=>commit(slider));number.addEventListener("input",()=>commit(number));number.addEventListener("change",()=>commit(number));number.addEventListener("keydown",event=>{if(event.key==="Enter")commit(number);});row.appendChild(header);row.appendChild(controls);row.appendChild(validation);fields.appendChild(row);
    }
    function choice(key:"direction"|"phase"|"unit"|"order"|"easing",label:string,choices:[string,string][]):void {
      const row=selectField(doc,{id:`${workspaceId}-${key}`,label,value:isMixed(key)?"":draft![key]??"preset",disabled:busy,
        options:[...(isMixed(key)?[{value:"",label:pt?"Vários":"Multiple"}]:[]),...choices.map(([value,text])=>({value,label:text}))],onChange:value=>{if(!value)return;Object.assign(draft!,{[key]:value});changed(key);if(key==="unit"||key==="order"||key==="easing")drawEdit();}});
      row.className+=" ch-applied-field ch-applied-field--select";
      row.getElementsByTagName("select")[0]?.setAttribute("aria-label",label);
      fields.appendChild(row);
    }
    if(preset.mode==="transition"){
      if(!data.cameraTransition&&isMixed("phase"))choice("phase",pt?"Animação":"Animation",[["in",pt?"Entrada":"In"],["out",pt?"Saída":"Out"],["both",pt?"Ambos":"Both"]]);
      else if(!data.cameraTransition)fields.appendChild(createPresetPhaseControl(doc,{locale:options.locale,value:draft.phase,disabled:isBusy(),onChange:value=>{draft!.phase=value;changed("phase");}}));
      numeric("durationFrames",pt?"Duração · frames":"Duration · frames",data.cameraTransition?2:1,600);
    }
    if(!data.cameraTransition&&(preset.position[0]||preset.position[1]||preset.pivot==="edge"))choice("direction",pt?"Direção":"Direction",[["preset",pt?"Original":"Original"],["bottom",pt?"De baixo":"From bottom"],["top",pt?"De cima":"From top"],["left",pt?"Da esquerda":"From left"],["right",pt?"Da direita":"From right"]]);
    numeric("intensity",pt?"Intensidade · %":"Intensity · %",0,300,.1);
    if(preset.mode==="transition"&&!data.cameraTransition)choice("easing",pt?"Suavização":"Easing",presetEasingChoices(options.locale));
    if(data.cameraTransition)fields.appendChild(createElement(doc,"p","ch-preset-hint",pt?"Arraste o marcador CUT para posicionar o pico da transição. Desfoque, zoom e demais ajustes estão nos Controles do efeito.":"Drag the CUT marker to position the transition peak. Blur, zoom and other settings are available in Effect Controls."));
    if(preset.category.startsWith("text-")){
      choice("unit",pt?"Dividir texto":"Text units",[["preset",pt?"Padrão do preset":"Preset default"],["characters",pt?"Caracteres":"Characters"],["words",pt?"Palavras":"Words"],["lines",pt?"Linhas":"Lines"],["all",pt?"Texto inteiro":"Whole text"]]);
      if(preset.mode==="transition")numeric("staggerFrames",pt?"Intervalo · frames":"Stagger · frames",0,60);
    }
    const sequenceControls=gallerySequenceControls(preset,draft);
    if(!data.cameraTransition&&sequenceControls.order)choice("order",pt?"Ordem":"Order",[["preset",pt?"Original":"Original"],["forward",pt?"Primeiro ao último":"First to last"],["reverse",pt?"Último ao primeiro":"Last to first"],["center-out",pt?"Centro para fora":"Center outward"],["edges-in",pt?"Bordas para dentro":"Edges inward"],["random",pt?"Aleatória":"Random"]]);
    if(!data.cameraTransition&&sequenceControls.seed){draft.seed??=17;numeric("seed",pt?"Variação":"Variation",0,9999);}
    if(preset.collection==="studio"||preset.collection==="premium"||preset.collection==="native"||draft.easing==="spring"){
      if((draft.easing&&draft.easing!=="preset"?draft.easing:preset.easing)==="spring"||isMixed("easing"))numeric("elasticity",pt?"Elasticidade · %":"Elasticity · %",0,100,.1);
      if(preset.category.startsWith("text-")&&preset.mode==="transition")numeric("overlap",pt?"Sobreposição · %":"Overlap · %",0,100,.1);
      if(preset.mode==="continuous")numeric("speed",pt?"Velocidade · %":"Speed · %",25,200,.1);
    }
    for(const key of invalidNumbers.keys())if(!activeNumbers.has(key))invalidNumbers.delete(key);
    const tools=createElement(doc,"div","ch-applied-tools");
    tools.appendChild(button(doc,{label:pt?"Restaurar padrão":"Reset defaults",disabled:isBusy()||stale,onClick:()=>{if(isBusy()||stale)return;draft={elasticity:30,overlap:65,speed:100,order:"preset",seed:17,easing:"preset",...defaultLibraryOptions(preset)};invalidNumbers.clear();for(const key of Object.keys(draft) as (keyof MotionLibraryOptions)[])changedKeys.add(key);dirty=true;drawEdit();}}));
    if(!data.cameraTransition){
      copyButton=button(doc,{label:pt?"Copiar preset aplicado":"Copy applied preset",disabled:isBusy()||dirty||stale||Boolean(data.mixedKeys?.length),onClick:()=>{
        if(isBusy()||dirty||stale||snapshot?.mixedKeys?.length||!snapshot?.options||!snapshot.presetId||!isMotionLibraryOptions(snapshot.options))return;
        options.cache.copied={presetId:snapshot.presetId,options:{...snapshot.options}};transferStatus=pt?"Configuração copiada. Selecione as camadas de destino.":"Settings copied. Select destination layers.";drawEdit();
      }});tools.appendChild(copyButton);
    }
    content.appendChild(tools);
    const actions=createElement(doc,"div","ch-applied-actions");
    actions.appendChild(createActionButton(doc,{id:"preset-edit-discard",label:pt?"Descartar ajustes":"Discard changes",variant:"tertiary",disabled:isBusy(),disabledReason:pt?"Aguarde a operação atual.":"Wait for the current operation.",onPress:()=>{if(!disposed&&!isBusy())void inspect(true);}}).element);
    editApplyControl=createActionButton(doc,{id:"preset-edit-apply",label:pt?"Aplicar ajustes":"Apply changes",variant:"primary",onPress:()=>{if(!disposed&&!isBusy())void adjust();}});
    editApply=editApplyControl.button;editApplyControl.element.classList.add("ch-preset-primary-action");actions.appendChild(editApplyControl.element);content.appendChild(actions);
    const lifecycle=createElement(doc,"div","ch-preset-footer");
    if(options.lifecycle){lifecycle.appendChild(createActionButton(doc,{id:"preset-edit-remove",label:pt?"Remover da seleção":"Remove from selection",variant:"destructive",disabled:isBusy(),disabledReason:pt?"Aguarde a operação atual.":"Wait for the current operation.",onPress:()=>{if(!disposed&&!isBusy())options.lifecycle?.("remove");}}).element);
      if(!preset.category.startsWith("text-"))lifecycle.appendChild(createActionButton(doc,{id:"preset-edit-bake",label:pt?"Converter em keyframes":"Bake to keyframes",disabled:isBusy(),disabledReason:pt?"Aguarde a operação atual.":"Wait for the current operation.",onPress:()=>{if(!disposed&&!isBusy())options.lifecycle?.("bake");}}).element);}
    content.appendChild(lifecycle);drawLayerSections(data);drawUtilities();
    // One scroll region keeps utilities reachable without pushing Apply out of
    // short Adobe panels. Moving existing nodes preserves listeners and focus.
    const editBody=createElement(doc,"div","ch-applied-edit-body");
    for(const child of Array.from(content.children))if(child!==notice&&child!==actions){content.removeChild(child);editBody.appendChild(child);}
    content.removeChild(actions);content.appendChild(editBody);content.appendChild(actions);content.setAttribute("data-editor","legacy");updateNotice();
  }
  async function adjust():Promise<void>{
    if(isBusy()||stale||!dirty||invalidNumbers.size>0||!snapshot?.target||!draft)return;
    busy=true;epoch++;activeRead=0;error="";tabState();const args={target:snapshot.target,...(snapshot.targets?{targets:snapshot.targets.map(target=>({...target})),optionKeys:[...changedKeys]}:{}),presetId:snapshot.presetId,options:{...draft}};drawEdit();
    try{
      const response=await options.execute("ae.presets.adjust",args);
      if(disposed)return;if(!response.ok){error=hostError(response,pt?"Não foi possível ajustar.":"Unable to adjust.");stale=true;}
      else{dirty=false;snapshot=undefined;}
    }catch{if(!disposed){error=pt?"Falha ao ajustar. Recarregue os valores antes de tentar novamente.":"Adjustment failed. Reload values before trying again.";stale=true;}}
    finally{busy=false;if(!disposed){tabState();if(!snapshot)await inspect(true);else drawEdit();}}
  }
  async function phaseCommand(command:string,args:Record<string,unknown>):Promise<void>{
    if(isBusy())return;if(command==="ae.presets.inspect"){
      // Discard is a local draft operation. A host read can be in flight (or
      // waiting behind the native gesture), so redraw from the last accepted
      // inspection immediately and let the normal poll refresh later.
      dirty=false;stale=false;needsInspection=false;error="";epoch++;activeRead=0;drawEdit();void inspect(true);return;
    }
    if(stale||needsInspection)return;
    if(command==="ae.presets.color-adjust"&&(dirty||stale)){error=pt?"Aplique ou descarte os ajustes do preset antes de alterar a cor.":"Apply or discard preset changes before changing colors.";updateNotice();return;}
    const removing=command==="ae.presets.phase-action"&&args.action==="remove";
    let removed=false;
    busy=true;epoch++;activeRead=0;error="";tabState();drawEdit();
    try{const response=await options.execute(command,args);if(disposed)return;if(!response.ok){error=hostError(response,pt?"Não foi possível editar a fase.":"Unable to edit phase.");stale=true;}else{removed=removing;dirty=false;snapshot=undefined;}}
    catch{if(!disposed){error=pt?"Falha ao editar a fase. Recarregue os controles.":"Phase editing failed. Reload controls.";stale=true;}}
    finally{busy=false;if(!disposed){tabState();if(!snapshot)await inspect(true);else drawEdit();
      // Keep Edit when another phase remains. After the last phase is removed,
      // Browse restores the existing selection and gallery offset.
      if(removed&&!disposed&&nav.view==="edit"&&snapshot?.state==="unmanaged")switchView("browse");
    }}
  }
  const polling=focusedPoll(doc,()=>{void inspect();},750,()=>nav.view==="edit");
  nav.view??="browse";switchView(nav.view,true);
  if(!options.cache.personal&&nav.view==="browse")void personal("list");
  return {element,updateContext(){gallery?.updateContext();updateTransferContext();timingControls?.updateContext();},dispose(){disposed=true;gestures.dispose();disposeNumbers();epoch++;noticeAlert?.dispose();gallery?.dispose();polling?.dispose();}};
}
