import { attachMenuGlide, attachScrubbableNumber, button, checkboxField, createActionButton, type ActionButtonController, clearNode, createElement, createIcon, createEmptyState, createI18n, searchField, selectField, updateSliderFill, type PanelPreferences } from "@motion/ui-core";
import { MOTION_LIBRARY_PRESETS, MOTION_LIBRARY_DEFAULTS, MOTION_PENNER_FAMILIES, libraryUsesDirection, libraryDirectionAllowed, libraryTextSweeps, libraryTextOrder, libraryTextBase, motionLibraryRequirements, parsePennerEasing, type MotionPennerShape, type MotionLibraryRequirements, type MotionLibraryPreset, type MotionLibraryOptions, type PersonalPresetCatalog, type PersonalPresetItem, type PersonalPresetPreview, type PresetDefinitionV1, type QuickContext } from "@motion/contracts";
import { paintLibraryPreview, libraryPreviewPlayback, libraryPreviewEnd, cameraPreviewPlayback, librarySample } from "./motion-library-preview.js";
import { createPersonalMediaPreview } from "./personal-media-preview.js";
import { normalizeSearch } from "./quick-library.js";
import { createElementsEditor, type ElementsEditor, type ElementsEditorOptions } from "./elements-editor.js";
import { createSoundLibrary, type SoundLibrary, type SoundLibraryOptions } from "./sound-library.js";
import { SOUND_FAMILIES, SOUND_FAMILY_NAMES, type ElementKind, type SoundFamily } from "@motion/contracts";
import { MOTION_PRESET_FAMILIES, TEXT_PRESET_FAMILIES, motionPresetNavigation, textPresetNavigation, type PresetBrowseNavigation } from "./preset-navigation.js";
import { textReferenceAsset, type TextReferenceAsset } from "./text-reference-assets.js";
import { emulsionReferenceFor } from "./emulsion-reference-assets.js";
import { MOTION_LIBRARY_EMULSION_PRESETS } from "@motion/contracts";
import { createPresetLibraryActions, type PresetLibraryActions } from "./preset-library-actions.js";
import { createFolderPicker } from "./preset-folder-picker.js";
import { placePopoverIn, popoverBox } from "./preset-drawer.js";
import { createPreviewWall, previewSpec, sharedFrameCache } from "./preview-wall.js";
import { TEXT_REFERENCE_MANIFEST } from "./generated/text-reference-manifest.js";
import { setUiIcon, uiIcon } from "./ui-icons.js";
import { cycleDirection, directionBadge } from "./preset-direction-cycle.js";
import { openContextMenu, closeContextMenu, placeMenu, type ContextMenuEntry, type ContextMenuHandle } from "./context-menu.js";
import { attachReflowGlide, browserMotionEnv, playStagger, scrollIntoViewSmooth, tween, aeMotionCurve, aeMotionMs, type TweenHandle } from "./motion/index.js";

/** Bundled renders live next to the panel; the manifest never supplies a path. */
const TEXT_REFERENCE_BASE = "../assets/text-previews/";
/** Options that change what a text render shows. Phase is not one: the render
 * plays the entrance and the exit, and the card loops whichever is chosen. */
const RENDERED_KEYS = ["direction", "unit", "easing", "order", "seed", "intensity", "durationFrames", "staggerFrames", "elasticity", "overlap", "speed", "settleAmount", "settleCount", "settleDamping"] as const;
/** True when the card's current settings are the ones the AE render used. */
const LAYOUT_PROPERTIES: readonly (readonly [string, string])[] = [["--preview-size", "200px"], ["--preset-sidebar-width", "150px"]];
const layoutPropertiesRegistered = new WeakSet<Document>();
const PRESET_OVERSCAN_ROWS = 2;
const PRESET_CARD_CACHE_SIZE = 32;

type CardLayout = {
  columns: number;
  rowHeight: number;
  rowGap: number;
  paddingTop: number;
  paddingBottom: number;
};
/**
 * As variáveis de tamanho da galeria são lidas só pelo elemento que as recebe
 * (a grade e a raiz da galeria). Uma variável CSS comum é herdada, então cada
 * passo do controle de tamanho ou do divisor recalculava o estilo de todos os
 * descendentes: ~124 ms por passo com 473 cards, contra ~32 ms sem herança
 * (medido no painel, 2026-11-16). Registrá-las sem herança corta esse custo.
 * O valor inicial precisa existir para a sintaxe <length>; quem não define a
 * variável recebe o mesmo padrão que os `var(--x, padrão)` das folhas pediam.
 */
function registerLayoutProperties(doc: Document): void {
  if (layoutPropertiesRegistered.has(doc)) return;
  layoutPropertiesRegistered.add(doc);
  const css = (doc.defaultView as (Window & { CSS?: { registerProperty?(rule: { name: string; syntax: string; inherits: boolean; initialValue: string }): void } }) | null)?.CSS;
  if (typeof css?.registerProperty !== "function") return;
  for (const [name, initialValue] of LAYOUT_PROPERTIES) {
    // Lança se a variável já foi registrada (painel recriado no mesmo documento).
    try { css.registerProperty({ name, syntax: "<length>", inherits: false, initialValue }); } catch { /* já registrada */ }
  }
}

export function textReferenceMatches(asset: TextReferenceAsset, draft: MotionLibraryOptions): boolean {
  return RENDERED_KEYS.every(key => draft[key] === undefined || asset.options[key] === undefined || draft[key] === asset.options[key]);
}

/** The After Effects render of a text recipe seen from a side: the side's own
 * render ("<id>--<side>") when it differs from the authored one, else the card's. */
export function textReferenceFor(p: MotionLibraryPreset, direction: MotionLibraryOptions["direction"] | undefined): TextReferenceAsset | undefined {
  const side = direction && direction !== "preset" && direction !== libraryTextBase(p) ? direction : "";
  return (side ? textReferenceAsset(TEXT_REFERENCE_MANIFEST, `${p.id}--${side}`) : undefined) ?? textReferenceAsset(TEXT_REFERENCE_MANIFEST, p.id);
}

/** Curves for the easing selector. A classic family appears once; its entry
 * carries the current acceleration so the selector keeps showing it, and
 * {@link presetEasingShapeChoices} picks In, Out or In-Out. */
export function presetEasingChoices(locale:string,current?:string):[string,string][] {
  const pt=locale==="pt-BR",shape=parsePennerEasing(current)?.shape??"out";
  const families:Record<typeof MOTION_PENNER_FAMILIES[number],[string,string]>={sine:["Senoidal","Sine"],quad:["Quadrática","Quad"],quart:["Quártica","Quart"],quint:["Quíntica","Quint"],expo:["Exponencial","Expo"],circ:["Circular","Circ"]};
  return [["preset",pt?"Original":"Original"],["smooth",pt?"Suave":"Smooth"],["cubic",pt?"Acelerada":"Cubic"],["silk",pt?"Sedosa":"Silk"],["glide",pt?"Deslizante":"Glide"],["velvet",pt?"Aveludada":"Velvet"],["drift",pt?"Cauda longa":"Drift"],["snap",pt?"Precisa":"Snap"],["overshoot",pt?"Recuo":"Back"],["bounce",pt?"Salto":"Bounce"],["spring",pt?"Elástica":"Spring"],["settle-wave",pt?"Ricochete":"Ricochet"],["settle-hop",pt?"Quique":"Hop"],["flicker",pt?"Intermitente":"Flicker"],
    ...MOTION_PENNER_FAMILIES.map((family):[string,string]=>[`${family}-${shape}`,families[family][pt?0:1]])];
}

/** Acceleration of a classic family: Out settles into the resting pose. */
export function presetEasingShapeChoices(locale:string):[MotionPennerShape,string][] {
  const pt=locale==="pt-BR";
  return [["out",pt?"Out · desacelera":"Out · decelerate"],["in",pt?"In · acelera":"In · accelerate"],["in-out",pt?"In-Out · os dois":"In-Out · both"]];
}

/** The same family with another acceleration; other curves stay unchanged. */
export function withEasingShape(easing:string,shape:MotionPennerShape):string {
  const penner=parsePennerEasing(easing);return penner?`${penner.family}-${shape}`:easing;
}

/** Layer motion blur requested by a preset; the host turns on only switches
 * that are off, and turns off only the ones it turned on. */
export function motionBlurField(doc:Document,options:{id:string;locale:string;checked:boolean;disabled:boolean;onChange(checked:boolean):void}):HTMLElement {
  const pt=options.locale==="pt-BR",field=checkboxField(doc,{id:options.id,label:"Motion blur",checked:options.checked,disabled:options.disabled,onChange:options.onChange});
  field.title=pt?"Liga o motion blur da camada e, se preciso, da composição. Remover o preset desliga só o que o Moti.on ligou.":"Turns on the layer's motion blur and, when needed, the composition's. Removing the preset turns off only what Moti.on turned on.";
  return field;
}

/** Acceleration select under the curve, visible only for a classic family.
 * `sync` follows a curve changed elsewhere without rebuilding the form. */
export function createEasingShapeField(doc:Document,options:{id:string;locale:string;easing:string|undefined;disabled:boolean;className:string;onChange(easing:NonNullable<MotionLibraryOptions["easing"]>):void}):{element:HTMLElement;sync(easing:string|undefined):void} {
  const label=options.locale==="pt-BR"?"Aceleração":"Acceleration";let current=options.easing;
  const element=selectField(doc,{id:options.id,label,value:parsePennerEasing(current)?.shape??"out",disabled:options.disabled,
    options:presetEasingShapeChoices(options.locale).map(([value,text])=>({value,label:text})),
    onChange:value=>{const shape=presetEasingShapeChoices(options.locale).find(([item])=>item===value)?.[0];if(!shape||!current)return;current=withEasingShape(current,shape);options.onChange(current as NonNullable<MotionLibraryOptions["easing"]>);}});
  element.className+=` ${options.className}`;element.getElementsByTagName("select")[0]?.setAttribute("aria-label",label);
  const sync=(easing:string|undefined):void=>{current=easing;const penner=parsePennerEasing(easing);element.hidden=!penner;const select=element.getElementsByTagName("select")[0];if(select&&penner)select.value=penner.shape;};
  sync(current);return {element,sync};
}

/** Settle controls shown for Ricochet/Hop curves, with curve-specific wording. */
export function settleFieldLabels(kind: string, locale: string): [keyof Pick<MotionLibraryOptions, "settleAmount" | "settleCount" | "settleDamping">, string, number, number][] {
  const pt = locale === "pt-BR", hop = kind === "settle-hop";
  return [
    ["settleAmount", hop ? pt ? "Altura do quique · %" : "Hop height · %" : pt ? "Ricochete · %" : "Ricochet · %", 0, 100],
    ["settleCount", hop ? pt ? "Quiques" : "Hops" : pt ? "Oscilações" : "Oscillations", .5, 8],
    ["settleDamping", hop ? pt ? "Perda por quique · %" : "Loss per hop · %" : pt ? "Amortecimento · %" : "Damping · %", 0, 100]
  ];
}
let gallerySequence = 0;
/** Largura inicial da árvore de pastas no estudo do design system (150 px), arrastável de 120 até o limite. */
const DEFAULT_TREE_WIDTH = 150;
type Curve = { x1: number; y1: number; x2: number; y2: number };
// Built-in generators reuse the package's preset metadata. Their preview is a
// local SVG renderer, not an imported media package or executable preset file.
export interface GalleryPreset extends Pick<PresetDefinitionV1, "id" | "version" | "displayName" | "category" | "hosts" | "minHostVersion" | "requirements" | "operationPlan"> {
  tags: string;
  curve: Curve;
  preview: { renderer: "curve" | "camera" | "motion"; fixtureId: string };
  handler: "ae.keys.ease.apply" | "ae.camera.transition" | "ae.presets.apply" | "ae.presets.phase-apply" | "ae.presets.camera-transition";
  applyMode: "properties" | "camera" | "layers" | "precomp";
  reapplyPolicy: "update-ease" | "reject-existing-keys" | "adjust-managed";
  motion?: MotionLibraryPreset;
  navigation?: PresetBrowseNavigation;
  params: Record<string, unknown>;
}
const cameraCurve = { x1: 0.33, y1: 0, x2: 0.67, y2: 1 };
const cameraDefinitions: [string, string, string][] = [
  ["pushIn", "Aproximar", "Push in"], ["pullOut", "Afastar", "Pull out"],
  ["truckLeft", "Deslocar à esquerda", "Truck left"], ["truckRight", "Deslocar à direita", "Truck right"],
  ["craneUp", "Subir", "Crane up"], ["craneDown", "Descer", "Crane down"],
  ["panLeft", "Girar à esquerda", "Pan left"], ["panRight", "Girar à direita", "Pan right"],
  ["tiltUp", "Inclinar acima", "Tilt up"], ["tiltDown", "Inclinar abaixo", "Tilt down"],
  ["zoomIn", "Zoom", "Zoom in"]
];
export function defaultLibraryOptions(p: MotionLibraryPreset, fps?: number): MotionLibraryOptions {
  const options = { ...MOTION_LIBRARY_DEFAULTS, ...p.defaults };
  if (!p.tempo || p.mode !== "transition" || !fps || !Number.isFinite(fps) || fps <= 0) return options;
  // Signature timing is authored in seconds at 30 fps: keep the same feel at
  // the composition's own rate, expressed in its frames.
  return { ...options, durationFrames: signatureFrames(options.durationFrames, fps, 1, 600), staggerFrames: signatureFrames(options.staggerFrames, fps, 0, 60) };
}

/** Frames authored at the 30 fps reference, in a composition's frames. */
export function signatureFrames(frames: number, fps: number | undefined, min: number, max: number): number {
  const rate = fps && Number.isFinite(fps) && fps > 0 ? fps : 30;
  return Math.max(min, Math.min(max, Math.round(frames * rate / 30)));
}

/** A recipe's tempo window in composition frames; kinetic looks keep it narrow. */
export function signatureDurationRange(p: MotionLibraryPreset, fps?: number): [number, number] {
  if (!p.tempo || p.mode !== "transition") return [1, 600];
  return [signatureFrames(p.tempo.minFrames, fps, 1, 600), signatureFrames(p.tempo.maxFrames, fps, 1, 600)];
}

/** A phase selector for editing and preparing a copied preset; never applies. */
export function createPresetPhaseControl(doc: Document, options: {
  locale: string;
  value: MotionLibraryOptions["phase"];
  disabled: boolean;
  label?: string;
  onChange(value: MotionLibraryOptions["phase"]): void;
}): HTMLElement {
  const pt = options.locale === "pt-BR";
  const row = createElement(doc, "div", "ch-preset-phase-row");
  const label = options.label ?? (pt ? "Animação" : "Animation");
  row.appendChild(createElement(doc, "span", "ch-preset-phase-label", label));
  const group = createElement(doc, "div", "ch-preset-phase");
  group.setAttribute("role", "radiogroup"); group.setAttribute("aria-label", label);
  const values: MotionLibraryOptions["phase"][] = ["in", "out", "both"];
  const controls: HTMLButtonElement[] = [];
  let selected = options.value;
  function choose(value: MotionLibraryOptions["phase"], focus = false): void {
    if (options.disabled) return;
    selected = value;
    for (const control of controls) {
      const active = control.dataset.phase === value;
      control.setAttribute("aria-checked", String(active)); control.tabIndex = active ? 0 : -1;
      if (focus && active) control.focus();
    }
    options.onChange(value);
  }
  for (const [index, value] of values.entries()) {
    const control = button(doc, {
      label: pt ? ["Entrada", "Saída", "Ambos"][index]! : ["In", "Out", "Both"][index]!,
      disabled: options.disabled, onClick: () => choose(value)
    });
    control.dataset.phase = value; control.setAttribute("role", "radio");
    control.setAttribute("aria-checked", String(value === selected)); control.tabIndex = value === selected ? 0 : -1;
    control.addEventListener("keydown", event => {
      const direction = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
      if (!direction && event.key !== "Home" && event.key !== "End") return;
      event.preventDefault();
      const next = event.key === "Home" ? 0 : event.key === "End" ? values.length - 1 : (values.indexOf(selected) + direction + values.length) % values.length;
      choose(values[next]!, true);
    });
    controls.push(control); group.appendChild(control);
  }
  row.appendChild(group);
  return row;
}

/** Independent commands, deliberately separate from the Edit/Paste selector.
 * Arrow keys move focus only; Enter and Space activate the focused command. */
export function createPresetPhaseActions(doc: Document, options: {
  locale: string; onApply(phase: MotionLibraryOptions["phase"]): void;
}): { element: HTMLElement; controls: Map<MotionLibraryOptions["phase"], ActionButtonController> } {
  const pt = options.locale === "pt-BR", element = createElement(doc, "div", "ch-preset-phase-actions");
  element.setAttribute("role", "group"); element.setAttribute("aria-label", pt ? "Aplicar animação" : "Apply animation");
  element.setAttribute("data-motion", "view-enter"); element.setAttribute("data-active", "true");
  const controls = new Map<MotionLibraryOptions["phase"], ActionButtonController>();
  for (const [index, phase] of (["in", "out", "both"] as const).entries()) {
    const control = createActionButton(doc, {
      label: (pt ? ["Entrada", "Saída", "Ambos"] : ["In", "Out", "Both"])[index]!,
      variant: "primary", size: 24, onPress: () => options.onApply(phase)
    });
    control.button.dataset.phase = phase; controls.set(phase, control); element.appendChild(control.element);
    control.button.addEventListener("keydown", event => {
      const direction = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
      if (!direction && event.key !== "Home" && event.key !== "End") return;
      event.preventDefault();
      const next = event.key === "Home" ? 0 : event.key === "End" ? 2 : (index + direction + 3) % 3;
      [...controls.values()][next]?.button.focus();
    });
  }
  return { element, controls };
}
interface RequirementLabel { id: string; label: string; detail: string }

/** Selos curtos do inspector, na ordem em que o usuário decide: tipo de camada,
 * 3D e o que precisa estar instalado. */
export function requirementLabels(needs: MotionLibraryRequirements, pt: boolean): RequirementLabel[] {
  const out: RequirementLabel[] = [];
  if (needs.layer === "text") out.push({ id: "text", label: pt ? "Texto" : "Text", detail: pt ? "Aplica em camadas de texto." : "Applies to text layers." });
  else if (needs.layer === "composition") out.push({ id: "precomp", label: pt ? "Pré-comp" : "Precomp", detail: pt ? "Cria uma pré-comp de transição acima das camadas." : "Creates a transition precomp above the layers." });
  else out.push({ id: "visual", label: pt ? "Camada visual" : "Visual layer", detail: pt ? "Aplica em camadas com imagem: texto, forma, sólido ou footage." : "Applies to layers with pixels: text, shape, solid or footage." });
  if (needs.threeD) out.push({ id: "3d", label: "3D", detail: pt ? "Com câmera, parent ou pré-comp recolhida, converta a camada em 3D." : "With a camera, parent or collapsed precomp, make the layer 3D." });
  if (needs.motionCore) out.push({ id: "core", label: "Moti.on Core", detail: pt ? "Precisa do plugin Moti.on Core instalado." : "Needs the Moti.on Core plugin installed." });
  if (needs.cycore) out.push({ id: "cycore", label: "Cycore", detail: pt ? "Usa efeitos Cycore, incluídos no After Effects." : "Uses Cycore effects, included with After Effects." });
  return out;
}

/** Motivo para desativar Aplicar antes do clique, a partir da seleção lida.
 * Campos ausentes (host antigo) nunca bloqueiam. */
export function requirementReason(needs: MotionLibraryRequirements, context: { selectionCount: number; textLayers?: number | undefined; lockedLayers?: number | undefined }, pt: boolean): string | null {
  if (needs.layer === "composition") return null;
  if (typeof context.lockedLayers === "number" && context.lockedLayers > 0) return pt ? "Desbloqueie as camadas selecionadas" : "Unlock the selected layers";
  if (needs.layer === "text" && typeof context.textLayers === "number" && context.textLayers < context.selectionCount)
    return pt ? "Selecione apenas camadas de texto" : "Select text layers only";
  return null;
}

/** Search words for the Momentum techniques, in both locales. */
function momentumTags(motion: MotionLibraryPreset): string {
  if (motion.collection !== "momentum") return "";
  const words = ["impulso"];
  if (motion.easing === "settle-wave") words.push("ricochete ricochet");
  if (motion.easing === "settle-hop") words.push("quique hop bounce");
  if (motion.travel === "offscreen") words.push("fora do quadro offscreen push");
  if (motion.pivot === "offset") words.push("pêndulo pendulum pivô pivot");
  if (motion.pivot === "edge") words.push("dobradiça hinge borda edge");
  if (motion.mode === "continuous") words.push("loop contínuo");
  return `${words.join(" ")} `;
}

export const GALLERY_PRESETS: GalleryPreset[] = [
  ...[...MOTION_LIBRARY_PRESETS, ...MOTION_LIBRARY_EMULSION_PRESETS].sort((a, b) => {
    const rank = (p: MotionLibraryPreset): number => p.collection === "premium" ? (p.cameraSpec ? 1 : 0) : p.collection === "signature" ? 1.5 : p.collection === "momentum" ? 1.75 : p.collection === "reveal" ? 1.8 : p.collection === "looks" ? 1.85 : p.collection === "text" ? 1.9 : p.collection === "studio" ? 2 : 3;
    return rank(a) - rank(b);
  }).map((motion): GalleryPreset => {
    const transition = motion.id.startsWith("camera-") || Boolean(motion.filmSpec);
    const handler = transition ? "ae.presets.camera-transition" : motion.mode==="transition"?"ae.presets.phase-apply":"ae.presets.apply";
    const defaults = defaultLibraryOptions(motion);
    const navigation = textPresetNavigation(motion) ?? motionPresetNavigation(motion, transition ? "camera-transitions" : motion.category);
    const params = transition ? { presetId: motion.id, durationFrames: defaults.durationFrames, intensity: defaults.intensity } : { presetId: motion.id, ...defaults };
    return {
    // Text collection cards already sit in their unit's folder: the card shows the
    // variant ("Cascata de luz"), while search tags keep the full recipe name.
    id: `builtin.motion.${motion.id}`, version: "1.0.0", displayName: motion.textVariant?.name ?? motion.name,
    category: transition ? "camera-transitions" : motion.category, hosts: ["after-effects"], minHostVersion: { "after-effects": "25.0" },
    requirements: [transition ? "active-composition" : motion.category.startsWith("text-") ? "selected-text-layers" : "selected-visual-layers"],
    operationPlan: { command: handler, args: params },
    tags: `${motion.collection ?? ""} ${motion.family ?? ""} ${motion.tempo?.character ?? ""} ${motion.category} ${motion.easing} ${motion.effect} ${motion.waveform} ${motion.choreography?.path ?? ""} ${motion.choreography?.distribution ?? ""} ${momentumTags(motion)}${motion.name["pt-BR"]} ${motion.name["en-US"]}`,
    curve: cameraCurve, preview: { renderer: "motion", fixtureId: `${motion.id}-v1` },
    handler, applyMode: transition ? "precomp" : "layers", reapplyPolicy: "adjust-managed", motion, params,
    ...(navigation ? { navigation } : {})
  }; }),
  ...cameraDefinitions.map(([id, pt, en]): GalleryPreset => {
    const params = { preset: id, durationFrames: 30, amount: /^(pan|tilt)/.test(id) ? 15 : 400, curve: cameraCurve, cameraName: "" };
    return { id: `builtin.camera.${id}`, version: "1.0.0", displayName: { "pt-BR": pt, "en-US": en },
      category: "camera", hosts: ["after-effects"], minHostVersion: { "after-effects": "25.0" },
      requirements: ["camera-without-parent", "target-property-without-keyframes"],
      operationPlan: { command: "ae.camera.transition", args: params }, tags: `camera 3d ${id}`, curve: cameraCurve,
      preview: { renderer: "camera", fixtureId: `camera-${id}-v1` }, handler: "ae.camera.transition",
      applyMode: "camera", reapplyPolicy: "reject-existing-keys", params };
  })
];
const presetById = new Map(GALLERY_PRESETS.map(preset => [preset.id, preset]));
const presetSearchIndexes = new Map<string, ReadonlyMap<string, string>>();

function presetSearchIndex(locale: string): ReadonlyMap<string, string> {
  let index = presetSearchIndexes.get(locale);
  if (!index) {
    index = new Map(GALLERY_PRESETS.map(preset => [
      preset.id, normalizeSearch(`${preset.displayName[locale] ?? preset.id} ${preset.tags}`)
    ]));
    presetSearchIndexes.set(locale, index);
  }
  return index;
}

/** Saved collection IDs remain stable when their visible labels improve. */
export function galleryCategoryMatches(category: string, preset: GalleryPreset): boolean {
  if (category === "emulsion") return Boolean(preset.motion?.filmSpec);
  if (category.startsWith("emulsion-")) return preset.motion?.filmSpec?.family === category.slice("emulsion-".length);
  if (category.includes("/")) return preset.navigation?.filter === category;
  if (category === "camera-impact") return Boolean(preset.motion?.cameraSpec?.impact);
  if (category === "signature") return preset.motion?.collection === "signature";
  if (category.startsWith("signature-")) return preset.motion?.collection === "signature" && preset.motion.family === category.substring("signature-".length);
  if (category === "momentum") return preset.motion?.collection === "momentum";
  if (category === "reveal" || category === "looks") return preset.motion?.collection === category;
  if (category.startsWith("momentum-")) return preset.motion?.collection === "momentum" && preset.category === `motion-${category.substring("momentum-".length)}`;
  if (category === "premium") return preset.motion?.collection === "premium";
  if (category.startsWith("premium-")) return preset.motion?.collection === "premium" &&
    (category === "premium-camera" ? preset.category === "camera-transitions" : preset.category.startsWith(category === "premium-text" ? "text-" : "motion-") && preset.category !== "camera-transitions");
  return category === "all" || category === "animation" && Boolean(preset.motion) && !preset.category.startsWith("camera") ||
    category === "motion" && preset.category.startsWith("motion-") || category === "text" && preset.category.startsWith("text-") ||
    category === "studio" && preset.motion?.collection === "studio" || category === "gemini" && preset.motion?.collection === "gemini" ||
    category === "classics" && Boolean(preset.motion) && !preset.motion?.filmSpec && preset.motion?.collection !== "premium" && preset.motion?.collection !== "signature" && preset.motion?.collection !== "momentum" && preset.motion?.collection !== "reveal" && preset.motion?.collection !== "looks" && preset.motion?.collection !== "text" ||
    (category === "camera" || category === "transitions") && preset.category.startsWith("camera") || category === "camera-moves" && preset.category === "camera" || preset.category === category;
}

/** A family subfolder needs this many live presets; smaller ones stay in the parent folder only. */
export const MIN_FAMILY_PRESETS = 3;
/** Live presets of a browse family ("motion-2d/blur"). */
export function familySize(filter: string): number {
  return GALLERY_PRESETS.filter(preset => !preset.motion?.retired && preset.navigation?.filter === filter).length;
}

/** Folders with no live preset are hidden; insert folders (elements, sounds) and the
 * personal library own their content and always stay. One child alone folds into its parent. */
export function pruneEmptyFolders<T extends {id: string; children?: T[]}>(nodes: T[]): T[] {
  const live = (id: string): boolean => GALLERY_PRESETS.some(preset => !preset.motion?.retired && galleryCategoryMatches(id, preset));
  const keep = (node: T): T | null => {
    if (node.id === "all" || node.id === "personal" || node.id.startsWith("elements") || node.id.startsWith("sounds")) return node;
    const children = (node.children ?? []).map(keep).filter((child): child is T => Boolean(child));
    if (!children.length && !live(node.id)) return null;
    return {...node, children: children.length > 1 ? children : []};
  };
  return nodes.map(keep).filter((node): node is T => Boolean(node));
}

/** Folder IDs of the collection-based tree (before 2026-11-18) and where they now live. */
export function legacyFolderId(id: string): string {
  if (id === "emulsion" || id.startsWith("emulsion-")) return "camera-transitions/film";
  if (id === "camera-impact" || id === "premium-camera" || id === "camera") return "camera-transitions";
  if (id === "reveal") return "motion-2d/reveal";
  if (id === "looks") return "motion-effects/looks";
  const unit = /^(?:momentum|premium)-(2d|3d|effects)$/.exec(id);
  if (unit) return `motion-${unit[1]}`;
  if (id === "momentum" || id === "premium-motion" || id === "animation" || id === "classics" || id === "studio" || id === "gemini") return "motion";
  if (id === "signature" || id.startsWith("signature-") || id === "premium-text") return "text";
  return "all";
}

export function gallerySequenceControls(preset: MotionLibraryPreset, options: MotionLibraryOptions): {order: boolean; seed: boolean} {
  const unit = options.unit === "preset" ? preset.text.unit : options.unit;
  const order = options.order && options.order !== "preset" ? options.order : preset.text.order ?? (preset.text.random ? "random" : "forward");
  const sequence = preset.category.startsWith("text-") && unit !== "all";
  const seeded = preset.collection === "signature" && (preset.text.reveal === "resolve" || preset.effect === "film-burn" || preset.effect === "projector");
  return {order: sequence, seed: preset.choreography?.distribution === "scatter" || sequence && order === "random" || preset.mode === "continuous" && preset.waveform === "wiggle" || seeded};
}

export function presetArgs(preset: GalleryPreset, context: QuickContext): Record<string, unknown> {
  if (preset.category === "ease" || preset.motion) return { ...preset.params };
  return { ...preset.params, durationFrames: Math.max(1, Math.round(context.fps)),
    amount: Number(preset.params.amount) * (/^(pan|tilt)/.test(String(preset.params.preset)) ? 1 : context.compWidth / 1920) };
}

/** Invert cubic time by bisection; this is the same normalized curve sent to AE. */
export function curveProgress(curve: Curve, time: number): number {
  const cubic = (t: number, a: number, b: number): number => 3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t * t * b + t ** 3;
  let lo = 0, hi = 1;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (cubic(mid, curve.x1, curve.x2) < time) lo = mid; else hi = mid;
  }
  return cubic((lo + hi) / 2, curve.y1, curve.y2);
}

/** Camera fixture: three depth planes, 1920x1080, one-node camera at z=-1600.
 * Projection follows each native command's world axis, sign and zoom change. */
export function cameraPoint(id: string, progress: number, point: number[]): number[] {
  const offset = 400 * progress;
  let x = point[0] ?? 0, y = point[1] ?? 0, z = (point[2] ?? 0) + 1600;
  if (id === "pushIn") z -= offset;
  if (id === "pullOut") z += offset;
  if (id === "truckLeft") x += offset;
  if (id === "truckRight") x -= offset;
  if (id === "craneUp") y += offset;
  if (id === "craneDown") y -= offset;
  const angle = progress * 15 * Math.PI / 180;
  if (id === "panLeft" || id === "panRight") {
    const a = id === "panLeft" ? angle : -angle;
    const nx = x * Math.cos(a) + z * Math.sin(a);
    z = -x * Math.sin(a) + z * Math.cos(a); x = nx;
  }
  if (id === "tiltUp" || id === "tiltDown") {
    const a = id === "tiltUp" ? angle : -angle;
    const ny = y * Math.cos(a) - z * Math.sin(a);
    z = y * Math.sin(a) + z * Math.cos(a); y = ny;
  }
  const zoom = 1600 + (id === "zoomIn" ? offset : 0);
  return [160 + x * zoom / Math.max(1, z) / 6, 90 + y * zoom / Math.max(1, z) / 6];
}

export interface PresetNavigation {
  query: string; category: string; scope: string; scroll: number;
  selectedId?: string; drafts?: Record<string, MotionLibraryOptions>;
  recentOrder?: string[];
  pendingRevealId?: string;
  sidebarWidth?: number; view?: "browse" | "edit";
  /** "Focar pasta": a árvore mostra só esta pasta (com caminho e voltar), como no Composer. */
  focusFolder?: string;
  /** Folder label colors the tree and the cards are filtered by (Composer "filter by label"). */
  labelFilter?: string[];
  cameraApplyMode?: "precomp" | "layers";
}
export interface GalleryApplyResult { ok: boolean; message?: string; }

export function createPresetGallery(doc: Document, options: {
  locale: string; preferences: PanelPreferences; busy: boolean;
  libraryActions?: PresetLibraryActions;
  navigation: PresetNavigation;
  revealId?: string | undefined;
  scrollToReveal?: boolean;
  apply(preset: GalleryPreset, settings?: MotionLibraryOptions, mode?: "precomp" | "layers"): void | Promise<GalleryApplyResult>;
  edit(preset: GalleryPreset): void;
  personal?: PersonalPresetCatalog | undefined;
  personalAction?(action: "add" | "list" | "remove", rootId?: string): void;
  applyPersonal?(itemId: string): void;
  previewPersonal?(itemId:string):Promise<PersonalPresetPreview>;
  lifecycle?(action: "remove" | "bake"): void;
  openApplied?: (() => void) | undefined;
  /** Grava os ajustes atuais como variação, sem aplicar. Devolve a frase de resultado. */
  saveVariant?(presetId: string, name: string, settings: MotionLibraryOptions): { ok: boolean; message: string };
  context?(): { hasComp: boolean; selectionCount: number; selectedKeys: number; fps?: number | undefined; textLayers?: number | undefined; lockedLayers?: number | undefined };
  /** Pasta Elementos: insercao de formas, tarjas e titulos (`ae.elements.insert`). */
  elements?: Omit<ElementsEditorOptions, "i18n" | "context" | "category" | "query"> | undefined;
  /** Pasta Sons: insercao dos sons sintetizados (`ae.sound.insert`). */
  sounds?: Omit<SoundLibraryOptions, "i18n" | "context" | "family" | "query"> | undefined;
}): { element: HTMLElement; updateContext(): void; dispose(): void } {
  const i18n = createI18n({ locale: options.locale });
  const pt = i18n.locale() === "pt-BR", nav = options.navigation;
  const searchIndex = presetSearchIndex(i18n.locale());
  let primaryApply: ActionButtonController | undefined;
  let phaseActions: ReturnType<typeof createPresetPhaseActions> | undefined;
  let applying = false;
  let applyFeedback: { presetId: string; phase?: MotionLibraryOptions["phase"]; state: "loading" | "success" | "error"; message: string } | undefined;
  nav.drafts ??= {};
  // Curve editing belongs to Suavização. Keep user curve libraries untouched.
  if (nav.category === "ease") nav.category = "all";
  if (nav.selectedId?.startsWith("builtin.ease.")) nav.selectedId = "";
  if (nav.pendingRevealId?.startsWith("builtin.ease.")) delete nav.pendingRevealId;
  const requestedPreset = options.revealId ? presetById.get(options.revealId) : undefined;
  if (requestedPreset) {
    const prefs = options.preferences.snapshot();
    const categoryVisible = galleryCategoryMatches(nav.category, requestedPreset);
    const queryVisible = searchIndex.get(requestedPreset.id)!.includes(normalizeSearch(nav.query));
    const scopeVisible = nav.scope === "favorites" ? prefs.favorites.includes(requestedPreset.id) : nav.scope === "recent" ? (nav.recentOrder ?? prefs.recent).includes(requestedPreset.id) : true;
    // A palette reveal goes to the card. Returning from Edit to the same
    // visible selection restores the saved offset, even if it is offscreen.
    if (options.scrollToReveal || nav.selectedId !== requestedPreset.id || !categoryVisible || !queryVisible || !scopeVisible || nav.labelFilter?.length) {
      nav.pendingRevealId = requestedPreset.id;
      if (!categoryVisible) nav.category = "all";
      if (!queryVisible) nav.query = "";
      if (!scopeVisible) nav.scope = "all";
      nav.labelFilter = [];
    }
    nav.selectedId = requestedPreset.id;
  }
  function cancelReveal(): void { delete nav.pendingRevealId; }
  const labels: Record<string, string> = {
    all: pt ? "Todos os presets" : "All presets", studio: pt ? "Suaves e editoriais" : "Soft and editorial", "motion-2d": "Motion · 2D", "motion-3d": "Motion · 3D",
    "motion-effects": pt ? "Motion · Efeitos" : "Motion · Effects", "text-characters": pt ? "Texto · Caracteres" : "Text · Characters",
    "text-words": pt ? "Texto · Palavras" : "Text · Words", "text-lines": pt ? "Texto · Linhas" : "Text · Lines",
    "text-effects": pt ? "Texto · Efeitos" : "Text · Effects", ease: pt ? "Curvas" : "Curves", camera: pt ? "Câmera" : "Camera",
    text: pt ? "Tipografia" : "Typography", motion: pt ? "Animações" : "Animations", transitions: pt ? "Transições" : "Transitions",
    momentum: pt ? "Impulso" : "Momentum", "momentum-2d": pt ? "Impulso · 2D" : "Momentum · 2D",
    "momentum-3d": pt ? "Impulso · 3D" : "Momentum · 3D", "momentum-effects": pt ? "Impulso · Efeitos" : "Momentum · Effects",
    reveal: pt ? "Revelações" : "Reveals", looks: "Looks", emulsion: "Emulsion · Film Transitions"
  };
  for (const category of ["text-characters", "text-words", "text-lines"]) for (const [family, labelPt, labelEn] of TEXT_PRESET_FAMILIES)
    labels[`${category}/${family}`] = `${labels[category]} · ${pt ? labelPt : labelEn}`;
  const galleryId=`preset-gallery-${++gallerySequence}`;
  const discoveryCategories = ["text", "motion", "transitions"] as const;
  const invalidNumbers=new Map<string,Map<string,string>>();
  let personalPreview:ReturnType<typeof createPersonalMediaPreview>|undefined;
  let elementsView:ElementsEditor|SoundLibrary|undefined;
  const element = createElement(doc, "div", "ch-preset-gallery");
  const scroll = createElement(doc, "div", "ch-preset-scroll");
  const toolbar = createElement(doc, "div", "ch-quick-toolbar ch-preset-toolbar-approved"); element.appendChild(toolbar);
  // The folder picker above the cards; below 360 px it opens the tree as a sheet.
  const filterButton = button(doc, { label: "", onClick: () => setFilters(filterButton.getAttribute("aria-expanded") !== "true") });
  const filterMenu = createElement(doc, "div", "ch-preset-filter-menu");
  const referenceFooter=createElement(doc,"footer","ch-preset-reference-footer");
  const footerTop = (): number => referenceFooter.getBoundingClientRect().top;
  filterMenu.id = `${galleryId}-filters`; filterMenu.hidden = true;
  filterMenu.setAttribute("data-motion", "surface-morph");
  filterMenu.setAttribute("aria-label", pt ? "Filtros de presets" : "Preset filters");
  filterMenu.setAttribute("role", "region");
  filterButton.setAttribute("aria-controls", filterMenu.id);
  function setFilters(open: boolean): void {
    if(open){closeEditor();labelMenu?.close(false);libraryActions.close();}
    folderPicker.setOpen(open);
    // The tree was measured while hidden: place the highlight now that it has a layout.
    if(open)folderGlide.refresh(false);
  }
  element.appendChild(filterMenu);
  const folderPicker = createFolderPicker(doc, {locale: options.locale, gallery: element, trigger: filterButton, menu: filterMenu, footerTop, onClose: closeFolderMenu,
    current: () => { const rows = Array.from(filterMenu.getElementsByTagName("button")).filter(node => node.className === "ch-folder-select"); return rows.find(node => node.dataset.category === nav.category) ?? rows[0] ?? null; }});
  function queueSearch(value: string): void {
    if (disposed) return;
    cancelReveal();
    nav.query = value;
    nav.scroll = 0;
    pendingScroll = 0;
    clearSearch.hidden = !value;
    syncDiscovery();
    clearTimeout(debounce);
    debounce = window.setTimeout(() => { if (!disposed) draw(); }, 250);
  }
  const searchControl=searchField(doc,{id:`${galleryId}-search`,label:pt?"Buscar preset":"Find a preset",placeholder:pt?"Buscar preset":"Find a preset",value:nav.query,expandable:false,onInput:queueSearch});
  searchControl.className+=" ch-preset-search";
  const search=searchControl.getElementsByTagName("input")[0]!;
  search.setAttribute("aria-label",pt?"Buscar preset":"Find a preset");
  const clearSearch = button(doc, { label: "×", onClick: () => {
    search.value = "";
    queueSearch("");
    search.focus();
  } });
  clearSearch.classList.add("ch-preset-search-clear");
  clearSearch.setAttribute("aria-label", pt ? "Limpar busca" : "Clear search");
  clearSearch.title = pt ? "Limpar busca" : "Clear search";
  clearSearch.hidden = !search.value;
  search.parentNode?.appendChild(clearSearch);
  const syncSearch = (): void => { toolbar.setAttribute("data-search-expanded", searchControl.getAttribute("data-expanded") ?? "false"); };
  const searchObserver = typeof MutationObserver !== "undefined" ? new MutationObserver(syncSearch) : null;
  searchObserver?.observe(searchControl, {attributes:true,attributeFilter:["data-expanded"]}); syncSearch();
  const filters = createElement(doc, "div", "ch-preset-filters");
  // Barra de cima: estrela no canto e a busca (com o filtro dentro). "Recentes" vive no menu do filtro.
  const scopeButtons: HTMLButtonElement[] = [];
  function setScope(scope: string): void {
    if (disposed) return;
    cancelReveal(); nav.scope = nav.scope === scope ? "all" : scope; delete nav.recentOrder;
    for (const node of scopeButtons) node.setAttribute("aria-pressed", String(nav.scope === node.dataset.scope));
    draw();
  }
  const favoritesButton = button(doc, { label: pt ? "Favoritos" : "Favorites", onClick: () => setScope("favorites") });
  favoritesButton.dataset.scope = "favorites"; favoritesButton.setAttribute("aria-pressed", String(nav.scope === "favorites"));
  // Estrela em contorno do estudo ("Só favoritos"); o nome segue para leitores de tela e dica.
  setUiIcon(favoritesButton, "star", "★"); favoritesButton.setAttribute("aria-label", pt ? "Só favoritos" : "Favorites only"); favoritesButton.title = pt ? "Só favoritos" : "Favorites only";
  scopeButtons.push(favoritesButton); filters.appendChild(favoritesButton);
  filters.classList.add("ch-preset-toolbar-scope"); toolbar.appendChild(filters);
  // Filtro por etiqueta (Composer: search-bar__labels + active-labels): botão + bolinhas ativas.
  const labelFilter = createElement(doc, "div", "ch-label-filter");
  const labelButton = button(doc, { label: "", onClick: () => openLabelMenu() });
  let labelMenu: ContextMenuHandle | undefined;
  labelButton.className = "ch-label-filter__button"; setUiIcon(labelButton, "filter", "≡");
  labelButton.setAttribute("aria-haspopup", "menu"); labelButton.setAttribute("aria-expanded", "false"); labelButton.dataset.focusKey = "labels.filter";
  const labelChips = createElement(doc, "div", "ch-label-filter__chips");
  labelFilter.appendChild(labelButton); labelFilter.appendChild(labelChips);
  (searchControl.getElementsByClassName?.("ch-field__control")[0] ?? searchControl).appendChild(labelFilter);
  searchControl.classList.add("ch-preset-search--with-filter");
  const browser = createElement(doc, "div", "ch-preset-browser"); scroll.appendChild(browser);
  const categories = createElement(doc, "nav", "ch-preset-categories"); categories.setAttribute("aria-label", pt ? "Categorias de presets" : "Preset categories"); filterMenu.appendChild(categories);
  function focusKey(): string | undefined { return (doc.activeElement as HTMLElement | null)?.dataset?.focusKey; }
  function restoreFocus(key?: string): void {
    if (!key) return;
    const cardKey = key.match(/^(preview|title|adjust|favorite)\.(.+)$/);
    if (cardKey && resultIndex.has(cardKey[2]!)) renderCardWindow(cardKey[2]);
    const target = Array.from(element.querySelectorAll<HTMLElement>("[data-focus-key]")).find(node => node.dataset.focusKey === key);
    if (target) {
      if (doc.activeElement !== target) target.focus({ preventScroll: Boolean(cardKey) });
    }
    else search.focus();
  }
  function focusSearch(): void {
    search.focus();
  }
  type FolderNode = {id: string; label: string; children?: FolderNode[]; rootId?: string};
  /** Effect families of a motion folder, only those with cards; one family alone is no subfolder. */
  function motionFamilies(category: string): FolderNode[] {
    const used = MOTION_PRESET_FAMILIES.filter(([family]) => familySize(`${category}/${family}`) >= MIN_FAMILY_PRESETS);
    return used.length > 1 ? used.map(([family, labelPt, labelEn]) => ({id: `${category}/${family}`, label: pt ? labelPt : labelEn})) : [];
  }
  // Árvore por função (2026-11-18): o que o preset faz decide a pasta, não a coleção de origem.
  // Signature, Impulso, Premium e Emulsion continuam na busca (tags) e nos IDs salvos, mas não
  // repetem cards em pastas próprias. Pasta sem preset ativo não aparece.
  const folders: FolderNode[] = pruneEmptyFolders([
    {id:"all",label:labels.all!},
    {id: "motion", label: pt ? "Animações" : "Animations", children: [
      {id:"motion-2d",label:pt?"Entradas e saídas 2D":"2D in & out",children:motionFamilies("motion-2d")},
      {id:"motion-3d",label:pt?"Entradas e saídas 3D":"3D in & out",children:motionFamilies("motion-3d")},
      {id:"motion-effects",label:pt?"Efeitos e looks":"Effects & looks",children:motionFamilies("motion-effects")}]},
    {id: "text", label: pt ? "Tipografia" : "Typography", children: [
      ...(["text-characters", "text-words", "text-lines"] as const).map((category,index) => ({id:category,label:(pt?["Caracteres","Palavras","Linhas"]:["Characters","Words","Lines"])[index]!,
        children:TEXT_PRESET_FAMILIES.filter(([family])=>familySize(`${category}/${family}`)>=MIN_FAMILY_PRESETS).map(([family,labelPt,labelEn])=>({id:`${category}/${family}`,label:pt?labelPt:labelEn}))})),
      {id:"text-effects",label:pt?"Efeitos de texto":"Text effects"}]},
    {id:"transitions",label:pt?"Transições":"Transitions",children:[
      {id:"camera-transitions",label:pt?"Transições de corte":"Cut transitions",children:motionFamilies("camera-transitions")},
      {id:"camera-moves",label:pt?"Movimentos de câmera":"Camera moves"}]},
    {id: "elements", label: pt ? "Elementos" : "Elements", children: [
      {id:"elements-shape",label:pt?"Formas":"Shapes"},{id:"elements-drawn",label:pt?"Traços à mão":"Hand drawn"},{id:"elements-lower-third",label:pt?"Tarjas":"Lower thirds"},
      {id:"elements-text-box",label:pt?"Caixas de texto":"Text boxes"},{id:"elements-title",label:pt?"Títulos":"Titles"},{id:"elements-social",label:pt?"Redes sociais":"Social media"},
      {id:"elements-transition",label:pt?"Transições":"Transitions"},{id:"elements-background",label:pt?"Fundos":"Backgrounds"},
      {id:"elements-counter",label:pt?"Timers e contadores":"Timers & counters"}]},
    {id: "sounds", label: pt ? "Sons" : "Sounds", children: SOUND_FAMILIES.map(family => ({id:`sounds-${family}`,label:SOUND_FAMILY_NAMES[family][pt?"pt-BR":"en-US"]}))},
    {id:"personal",label:pt?"Minha biblioteca":"My library",children:[]}
  ]);
  // Pasta salva de uma árvore antiga abre a pasta por função equivalente.
  if (!nav.category.startsWith("personal") && !folderPath(folders, nav.category)) nav.category = legacyFolderId(nav.category);
  function personalFolders(parentId: string | null, rootId: string): FolderNode[] {
    return (options.personal?.folders ?? []).filter(f => f.rootId === rootId && f.parentId === parentId).map(f => ({id:`personal.${f.id}`,label:f.name,rootId,children:personalFolders(f.id,rootId)}));
  }
  folders[folders.length - 1]!.children = (options.personal?.roots ?? []).flatMap(root => root.missing
    ? [{id:`personal.${root.id}`, label:`${root.name} · ${pt?"indisponível":"unavailable"}`, rootId:root.id}]
    : personalFolders(null,root.id));
  // Estudo: os grupos começam recolhidos, só o caminho da pasta atual aberto. Acontece uma vez;
  // depois vale o que o usuário abrir e fechar (collapsedFolders).
  if (!options.preferences.snapshot().gallery?.treeSeeded && typeof options.preferences.setGallery === "function") {
    const keep = new Set(collectionPath(folders, nav.category).map(node => node.id));
    const collapsed = options.preferences.snapshot().collapsedFolders;
    const fold = (list: FolderNode[]): void => { for (const node of list) { if (!node.children?.length || node.id === "personal") continue; if (!keep.has(node.id) && !collapsed.includes(node.id)) options.preferences.toggleFolder(node.id); fold(node.children); } };
    fold(folders);
    options.preferences.setGallery({ treeSeeded: true });
  }
  let colorFolder = "";
  /** Where the right click that opened the folder menu happened (null: the "…" button). */
  let palettePoint: {x: number; y: number} | null = null;
  /** The folder whose chevron just turned: only that one animates after the redraw. */
  let turnedFolder: string | null = null;
  /** The star just toggled: it pops once after the redraw. */
  /** Menu da pasta aberto (ou null): o clique fora e o resize o fecham. */
  let openPalette: HTMLElement | null = null, paletteScroll = 0;
  // Ordem e cores do menu de etiquetas do Composer (Kv = [none, ...Yv]). Os ids
  // continuam os já salvos nas preferências: "cyan" é o Seafoam e "pink" o Magenta;
  // "orange" segue válido para etiquetas antigas, só não é mais oferecido.
  const FOLDER_LABELS: [string, string][] = pt
    ? [["", "Sem etiqueta"], ["red", "Vermelho"], ["yellow", "Amarelo"], ["green", "Verde"], ["cyan", "Verde-água"], ["blue", "Azul"], ["purple", "Roxo"], ["pink", "Magenta"]]
    : [["", "No label"], ["red", "Red"], ["yellow", "Yellow"], ["green", "Green"], ["cyan", "Seafoam"], ["blue", "Blue"], ["purple", "Purple"], ["pink", "Magenta"]];
  function activeLabels(): string[] { return (nav.labelFilter ?? []).filter(color => FOLDER_LABELS.some(([id]) => id === color && id)); }
  /** A folder stays in the filtered tree when its label (own or inherited) or a descendant's matches. */
  function labelVisible(node: FolderNode, effective: string, colors: Record<string, string>): boolean {
    const wanted = activeLabels();
    if (!wanted.length || wanted.includes(effective)) return true;
    return (node.children ?? []).some(child => labelVisible(child, colors[child.id] || effective, colors));
  }
  /** Folders whose own label is filtered: their cards (and their subfolders' cards) are shown. */
  function labelledFolders(colors: Record<string, string>): string[] {
    const wanted = activeLabels(), found: string[] = [];
    const walk = (list: FolderNode[]): void => { for (const node of list) { if (wanted.includes(colors[node.id] ?? "")) found.push(node.id); else walk(node.children ?? []); } };
    walk(folders); return found;
  }
  function setLabelFilter(colors: string[]): void {
    if (disposed) return;
    cancelReveal(); nav.labelFilter = colors; nav.scroll = 0; draw();
  }
  function labelName(color: string): string { return FOLDER_LABELS.find(([id]) => id === color)?.[1] ?? color; }
  function drawLabelFilter(): void {
    const active = activeLabels();
    clearNode(labelChips);
    labelFilter.dataset.active = String(active.length > 0 || nav.scope === "recent");
    const title = pt ? "Filtrar por etiqueta" : "Filter by label";
    const shown = [...(nav.scope === "recent" ? [pt ? "Recentes" : "Recent"] : []), ...active.map(labelName)];
    labelButton.title = shown.length ? `${title}: ${shown.join(", ")}` : title;
    labelButton.setAttribute("aria-label", labelButton.title);
    labelButton.setAttribute("aria-pressed", String(shown.length > 0));
    for (const color of active) {
      const chip = button(doc, { label: "", onClick: () => { setLabelFilter(active.filter(item => item !== color)); restoreFocus("labels.filter"); } });
      chip.className = "ch-label-chip"; chip.dataset.color = color;
      chip.setAttribute("aria-label", `${pt ? "Remover filtro" : "Remove filter"}: ${labelName(color)}`); chip.title = chip.getAttribute("aria-label")!;
      setUiIcon(chip, "close", "×"); labelChips.appendChild(chip);
    }
    searchControl.dataset.chips = String(active.length > 0);
    searchControl.style.setProperty("--chips-space", `${26 + active.length * 18}px`);
  }
  function openLabelMenu(): void {
    if (disposed) return;
    if (labelMenu) { labelMenu.close(); return; }
    setFilters(false); closeFolderMenu(); closeEditor(); libraryActions.close();
    const colors = options.preferences.snapshot().folderColors, used = new Set(Object.values(colors).filter(Boolean)), active = activeLabels();
    const rect = labelButton.getBoundingClientRect?.();
    const entries: ContextMenuEntry[] = [
      { id: "recent", label: pt ? "Recentes" : "Recent", icon: "clock", checked: nav.scope === "recent", run: () => setScope("recent") },
      { separator: true },
      { section: pt ? "Filtrar por etiqueta" : "Filter by label" },
      { id: "clear", label: pt ? "Limpar filtros" : "Clear all filters", icon: "close", ...(active.length ? {} : { disabledReason: pt ? "Nenhum filtro ativo" : "No active filter" }), run: () => setLabelFilter([]) },
      { separator: true },
      ...FOLDER_LABELS.filter(([id]) => id).map(([id, name]): ContextMenuEntry => ({
        id, label: name, swatch: id, checked: active.includes(id),
        ...(used.has(id) || active.includes(id) ? {} : { disabledReason: pt ? "Nenhuma pasta com esta etiqueta" : "No folder has this label" }),
        run: () => setLabelFilter(active.includes(id) ? active.filter(item => item !== id) : [...active, id])
      }))
    ];
    if (discoveryAvailable() && discovery.hidden) {
      entries.push({ separator: true }, { section: pt ? "Explorar presets" : "Explore presets" });
      for (const id of discoveryCategories) entries.push({ id: `discover.${id}`, label: labels[id]!, run: () => goToDiscoveryCategory(id) });
    }
    const anchor = (rect?.bottom ?? 0) + 4;
    const bottom = footerTop();
    // Preserve the search row when there is room for a few filter items below it.
    const top = bottom - anchor >= 80 ? anchor : element.getBoundingClientRect().top + 4;
    labelMenu = openContextMenu(doc, {
      x: rect?.left ?? 0, y: anchor, verticalBounds: { top, bottom },
      label: pt ? "Filtrar por etiqueta" : "Filter by label", entries, returnFocus: labelButton,
      onClose: () => { labelMenu = undefined; labelButton.setAttribute("aria-expanded", "false"); }
    });
    labelButton.setAttribute("aria-expanded", "true");
  }
  function folderPath(list: FolderNode[], id: string): FolderNode[] | null {
    for (const node of list) {
      if (node.id === id) return [node];
      const below = folderPath(node.children ?? [], id);
      if (below) return [node, ...below];
    }
    return null;
  }
  function closeFolderMenu(): void {
    if (!colorFolder) return;
    colorFolder = ""; drawFolders();
  }
  function setFocusFolder(id: string | null): void {
    if (disposed) return;
    cancelReveal(); colorFolder = ""; nav.scroll = 0;
    if (id) {
      nav.focusFolder = id; nav.category = id;
      if (options.preferences.snapshot().collapsedFolders.includes(id)) options.preferences.toggleFolder(id);
    } else delete nav.focusFolder;
    draw();
    restoreFocus(id ? `folder.${id}` : "focus.back");
  }
  /** Popover "…" do Composer: Focar pasta · etiquetas · Limpar todas as etiquetas. */
  function folderMenu(node: FolderNode, current: string): HTMLElement {
    const palette = createElement(doc, "div", "ch-folder-palette");
    palette.setAttribute("role", "menu"); palette.setAttribute("aria-label", `${pt ? "Opções da pasta" : "Folder options"}: ${node.label}`);
    const item = (label: string, onClick: () => void, key: string): HTMLButtonElement => {
      const entry = button(doc, { label, onClick }); entry.className = "ch-folder-menu-item";
      entry.setAttribute("role", "menuitem"); entry.dataset.focusKey = key; return entry;
    };
    palette.appendChild(item(pt ? "Focar pasta" : "Focus Folder", () => setFocusFolder(node.id), `focus.${node.id}`));
    palette.appendChild(createElement(doc, "div", "ch-folder-menu-separator"));
    const swatches = createElement(doc, "div", "ch-folder-labels");
    swatches.setAttribute("role", "group"); swatches.setAttribute("aria-label", pt ? "Cor da etiqueta" : "Label color");
    for (const [color, name] of FOLDER_LABELS) {
      const swatch = button(doc, { label: "", onClick: () => { options.preferences.setFolderColor(node.id, color); colorFolder = ""; if (activeLabels().length) draw(); else { drawFolders(); drawLabelFilter(); } restoreFocus(`more.${node.id}`); } });
      swatch.className = "ch-folder-swatch"; swatch.dataset.color = color || "none"; swatch.title = name;
      swatch.setAttribute("aria-label", name); swatch.setAttribute("role", "menuitemradio");
      swatch.setAttribute("aria-checked", String(current === color)); swatch.setAttribute("aria-pressed", String(current === color));
      swatches.appendChild(swatch);
    }
    palette.appendChild(swatches);
    palette.appendChild(item(pt ? "Limpar todas as etiquetas" : "Clear all labels", () => {
      options.preferences.clearFolderColors(); colorFolder = ""; nav.labelFilter = []; draw(); restoreFocus(`more.${node.id}`);
    }, `clear.${node.id}`));
    if (node.rootId && node.id === `personal.${node.rootId}`) {
      palette.appendChild(createElement(doc, "div", "ch-folder-menu-separator"));
      palette.appendChild(item(pt ? "Remover da biblioteca" : "Remove from library", () => options.personalAction?.("remove", node.rootId), `remove.${node.id}`));
    }
    return palette;
  }
  /** O menu escapa do overflow da árvore (no Composer ele invade o grid): fixo sob a linha. */
  function placePalette(palette: HTMLElement, row: HTMLElement, point: {x: number; y: number} | null): void {
    const view = doc.defaultView, rect = row.getBoundingClientRect?.();
    if (!view || !rect || rect.height === 0) return;
    const bottom = Math.min(view.innerHeight, footerTop());
    const width = Math.min(222, view.innerWidth - 8), x = Math.max(4, point?.x ?? rect.left + 6);
    const y = point?.y ?? rect.bottom + 2;
    palette.style.position = "fixed";
    palette.style.boxSizing = "border-box";
    palette.style.width = `${width}px`;
    palette.style.maxHeight = `${Math.max(0, bottom - 8)}px`;
    const {left, top} = placeMenu(x, y, width, palette.offsetHeight, view.innerWidth, bottom);
    palette.style.left = `${left}px`; palette.style.top = `${top}px`;
    palette.style.transformOrigin = top < y ? "left bottom" : "left top";
  }
  /** Cabeçalho do modo foco: voltar + caminho completo "A / B". */
  function focusHeader(path: FolderNode[]): HTMLElement {
    const header = createElement(doc, "div", "ch-folder-focus");
    const back = button(doc, { label: "‹", onClick: () => setFocusFolder(null) });
    back.className = "ch-folder-focus-back"; back.dataset.focusKey = "focus.back";
    setUiIcon(back, "chevron-left", "‹"); back.setAttribute("aria-label", pt ? "Mostrar todos os itens" : "Show all items");
    const label = path.map(n => n.label).join(" / ");
    const title = createElement(doc, "span", "ch-folder-focus-path", label); title.title = label;
    header.appendChild(back); header.appendChild(title);
    return header;
  }
  const motionEnv = browserMotionEnv(doc.defaultView, doc.documentElement);
  /** Folder just opened by its toggle: its children rise in after the redraw. */
  let openedFolder: string | null = null;
  categories.setAttribute("data-motion", "list-stagger");
  /** One highlight slides between folders and springs back to the current one. */
  const folderGlide = attachMenuGlide(categories, () => Array.from(categories.children).filter(node => node.classList.contains("ch-folder-row")) as HTMLElement[]);
  function drawFolders(): void {
    const focused = doc.activeElement?.closest?.(".ch-preset-categories") === categories ? focusKey() : undefined;
    const scroll = categories.scrollTop; clearNode(categories);
    const prefs = options.preferences.snapshot();
    openPalette = null; let paletteRow: HTMLElement | null = null;
    function branch(node: FolderNode, depth: number, inherited = ""): void {
      if (!labelVisible(node, prefs.folderColors[node.id] || inherited, prefs.folderColors)) return;
      // 20 px por nível, raízes rentes (medida do Composer: tree-view-row offset × 20 px).
      // Recuo do estudo: 14 px por nível.
      const row = createElement(doc,"div","ch-folder-row"); row.style.paddingLeft = `${depth * 14}px`;
      row.dataset.depth=String(depth);
      row.dataset.selected=String(nav.category===node.id);
      const color = prefs.folderColors[node.id] || inherited; if(color) row.dataset.color=color;
      const expanded = !prefs.collapsedFolders.includes(node.id);
      const toggle = button(doc,{label:node.children?.length ? expanded?"▾":"▸":"",onClick:()=>{openedFolder=expanded?null:node.id;turnedFolder=node.id;options.preferences.toggleFolder(node.id);drawFolders();openedFolder=null;turnedFolder=null;}});
      toggle.className="ch-folder-toggle"; toggle.disabled=!node.children?.length;
      if(turnedFolder===node.id)toggle.dataset.turn=expanded?"open":"close";
      if(node.children?.length)setUiIcon(toggle,expanded?"chevron-down":"chevron-right",toggle.textContent??"");
      toggle.dataset.focusKey=`toggle.${node.id}`;
      toggle.setAttribute("aria-label",`${expanded?(pt?"Recolher":"Collapse"):(pt?"Expandir":"Expand")} ${node.label}`);
      if(node.children?.length)toggle.setAttribute("aria-expanded",String(expanded));row.appendChild(toggle);
      const selectFolder = button(doc,{label:"",onClick:()=>{if(disposed)return;cancelReveal();nav.category=node.id;nav.scroll=0;const sheet=folderPicker.isOpen();setFilters(false);if(sheet)filterButton.focus();draw();}});
      selectFolder.dataset.category=node.id;selectFolder.className="ch-folder-select";
      selectFolder.dataset.focusKey=`folder.${node.id}`;
      const folderIcon=createElement(doc,"span","ch-folder-icon");const folderGlyph=uiIcon(doc,"folder",14);if(folderGlyph){folderIcon.appendChild(folderGlyph);folderIcon.dataset.outline="true";}
      selectFolder.appendChild(folderIcon);selectFolder.appendChild(createElement(doc,"span","ch-folder-name",node.label));
      selectFolder.title=node.label; selectFolder.setAttribute("aria-pressed",String(nav.category===node.id));row.appendChild(selectFolder);
      const more = button(doc,{label:"…",onClick:()=>{colorFolder=colorFolder===node.id?"":node.id;drawFolders();}});
      setUiIcon(more,"more","…");more.className="ch-folder-more";more.setAttribute("aria-label",`${pt?"Etiqueta e opções":"Label and options"}: ${node.label}`);more.setAttribute("aria-expanded",String(colorFolder===node.id));row.appendChild(more);categories.appendChild(row);
      more.dataset.focusKey=`more.${node.id}`;
      row.addEventListener("contextmenu",event=>{
        const pointer=event as MouseEvent;pointer.preventDefault();pointer.stopPropagation();if(disposed)return;
        closeContextMenu();palettePoint={x:pointer.clientX,y:pointer.clientY};colorFolder=node.id;drawFolders();
        restoreFocus(`focus.${node.id}`);
      });
      if(colorFolder===node.id){
        const palette=folderMenu(node,prefs.folderColors[node.id]??"");categories.appendChild(palette);openPalette=palette;paletteRow=row;
      }
      if(expanded)for(const child of node.children??[])branch(child,depth+1,color);
      if(node.id==="personal"){
        const add=button(doc,{label:pt?"+ Adicionar pasta":"+ Add folder",disabled:options.busy||!options.personalAction,onClick:()=>options.personalAction?.("add")});add.className="ch-folder-add";categories.appendChild(add);
      }
    }
    const focusPath = nav.focusFolder ? folderPath(folders, nav.focusFolder) : null;
    if (nav.focusFolder && !focusPath) delete nav.focusFolder;
    const focusNode = focusPath?.[focusPath.length - 1];
    if (focusPath && focusNode) {
      categories.appendChild(focusHeader(focusPath));
      const inheritedColor = [...focusPath].reverse().map(n => prefs.folderColors[n.id]).find(Boolean) ?? "";
      for (const child of focusNode.children ?? []) branch(child, 0, inheritedColor);
    } else for(const node of folders)branch(node,0);
    categories.scrollTop=scroll;paletteScroll=scroll;restoreFocus(focused);
    if(openPalette&&paletteRow)placePalette(openPalette,paletteRow,palettePoint);
    if(!openPalette)palettePoint=null;
    folderGlide.refresh(categories.offsetHeight>0);
    if(openedFolder)riseChildren(openedFolder);
  }
  /** The rows a folder just revealed rise in under it (list-stagger); closing stays instant. */
  function riseChildren(id: string): void {
    const rows = Array.from(categories.children) as HTMLElement[];
    const start = rows.findIndex(row => row.querySelector?.(`[data-focus-key="toggle.${id}"]`));
    if (start < 0) return;
    const depth = Number(rows[start]!.dataset.depth ?? 0), revealed: HTMLElement[] = [];
    for (const row of rows.slice(start + 1)) {
      if (!row.classList.contains("ch-folder-row")) continue;
      if (Number(row.dataset.depth ?? 0) <= depth) break;
      revealed.push(row);
    }
    playStagger(motionEnv, categories, revealed, { cap: 8 });
  }
  // Arrow keys walk the visible menu entries; Left/Right fold the focused folder.
  function shownInMenu(node: HTMLElement): boolean {
    for (let current: HTMLElement | null = node; current && current !== filterMenu; current = current.parentNode as HTMLElement | null) if (current.hidden) return false;
    return true;
  }
  function menuEntries(): HTMLButtonElement[] {
    return Array.from(filterMenu.getElementsByTagName("button")).filter(node => !node.disabled && shownInMenu(node) &&
      (Boolean(node.dataset.scope) || node.className === "ch-folder-select" || node.className.includes("ch-folder-add")));
  }
  filterMenu.addEventListener("keydown", event => {
    const active = doc.activeElement as HTMLButtonElement | null, entries = menuEntries(), index = active ? entries.indexOf(active) : -1;
    if (index < 0) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const next = event.key === "Home" ? 0 : event.key === "End" ? entries.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + entries.length) % entries.length;
      entries[next]?.focus(); return;
    }
    if ((event.key !== "ArrowRight" && event.key !== "ArrowLeft") || active!.className !== "ch-folder-select") return;
    const row = active!.parentNode as HTMLElement, toggle = row.children[0] as HTMLButtonElement | undefined;
    const expanded = toggle?.getAttribute("aria-expanded");
    event.preventDefault();
    if (event.key === "ArrowRight" ? expanded === "false" : expanded === "true") { toggle!.click(); return; }
    if (event.key === "ArrowRight") return;
    const rows = Array.from(categories.children) as HTMLElement[], depth = Number(row.dataset.depth);
    for (let i = rows.indexOf(row) - 1; i >= 0; i--) if (rows[i]!.className === "ch-folder-row" && Number(rows[i]!.dataset.depth) < depth) {
      Array.from(rows[i]!.getElementsByTagName("button")).find(node => node.className === "ch-folder-select")?.focus(); return;
    }
  });
  const stage = createElement(doc, "div", "ch-preset-stage"); browser.appendChild(stage);
  const grid = createElement(doc, "div", "ch-preset-grid");
  let results: readonly GalleryPreset[] = [];
  let resultIndex = new Map<string, number>();
  let cardLayout: CardLayout | undefined;
  let windowFrame = 0;
  let layoutDirty = true;
  let rowTracks = "";
  let menuCardId: string | undefined;
  const mountedCards = new Map<string, ReturnType<typeof createCard>>();
  const cachedCards = new Map<string, ReturnType<typeof createCard>>();
  const canMeasureGrid = typeof doc.defaultView?.getComputedStyle === "function";
  // Redimensionar o painel ou o divisor: cards que mudam de coluna deslizam até o novo lugar.
  const stopGridGlide = attachReflowGlide(motionEnv, grid, { nodes: () => Array.from(grid.children).filter(node => (node as HTMLElement).classList?.contains("ch-preset-card")) as HTMLElement[], viewport: scroll });
  const browserHeading = createElement(doc, "div", "ch-preset-browser-heading");
  const breadcrumb = createElement(doc, "nav", "ch-preset-breadcrumb");
  breadcrumb.setAttribute("aria-label", pt ? "Caminho da coleção" : "Collection path");
  const resultCount = createElement(doc, "span", "ch-preset-result-count");
  resultCount.setAttribute("role", "status"); resultCount.setAttribute("aria-live", "polite");
  const clearFilters = button(doc, {label: pt ? "Limpar filtros" : "Clear filters", onClick: () => {
    if (disposed) return;
    cancelReveal(); clearTimeout(debounce); nav.query = ""; nav.scope = "all"; nav.scroll = 0; nav.labelFilter = [];
    delete nav.recentOrder; search.value = ""; draw(); search.focus();
  }});
  clearFilters.classList.add("ch-preset-clear-filters");
  browserHeading.appendChild(filterButton); browserHeading.appendChild(breadcrumb); browserHeading.appendChild(resultCount); browserHeading.appendChild(clearFilters);
  const discovery = createElement(doc, "nav", "ch-preset-discovery");
  discovery.setAttribute("aria-label", pt ? "Explorar presets" : "Explore presets");
  discovery.hidden = true;
  function discoveryAvailable(): boolean { return !nav.query.trim() && !nav.category.startsWith("personal") && !isInsertFolder(); }
  function goToDiscoveryCategory(id: typeof discoveryCategories[number]): void {
    if (disposed) return;
    cancelReveal(); nav.category = id; nav.scroll = 0; delete nav.focusFolder;
    draw();
  }
  for (const id of discoveryCategories) {
    const shortcut = button(doc, { label: labels[id]!, onClick: () => goToDiscoveryCategory(id) });
    shortcut.dataset.category = id;
    shortcut.dataset.focusKey = `discover.${id}`;
    discovery.appendChild(shortcut);
  }
  function syncDiscovery(): void {
    discovery.hidden = !(discoveryAvailable() && stage.clientHeight >= 220);
    for (const shortcut of Array.from(discovery.getElementsByTagName("button")))
      shortcut.setAttribute("aria-pressed", String(shortcut.dataset.category === nav.category));
  }
  stage.appendChild(browserHeading); stage.appendChild(discovery); stage.appendChild(grid);
  function collectionPath(nodes: FolderNode[], id: string, parents: FolderNode[] = []): FolderNode[] {
    for (const node of nodes) {
      const path = [...parents, node];
      if (node.id === id) return path;
      const nested = collectionPath(node.children ?? [], id, path);
      if (nested.length) return nested;
    }
    return [];
  }
  function drawBrowserHeading(count?: number): void {
    clearNode(breadcrumb);
    const path = collectionPath(folders, nav.category);
    for (const [index, node] of path.entries()) {
      if (index) breadcrumb.appendChild(createElement(doc, "span", "ch-preset-path-separator", "›"));
      const item = button(doc, {label: node.label, onClick: () => {
        if (disposed) return;
        cancelReveal(); nav.category = node.id; nav.scroll = 0; draw();
        restoreFocus(`path.${node.id}`);
      }});
      item.title = node.label; item.dataset.focusKey = `path.${node.id}`;
      if (index === path.length - 1) item.setAttribute("aria-current", "page");
      breadcrumb.appendChild(item);
    }
    breadcrumb.title = path.map(node => node.label).join(" › ");
    folderPicker.setPath(path.length ? path.map(node => node.label) : [labels[nav.category] ?? labels.all!]);
    resultCount.textContent = count === undefined ? "" : `${count} ${pt ? count === 1 ? "item" : "itens" : count === 1 ? "item" : "items"}`;
    clearFilters.hidden = !nav.query && nav.scope === "all" && !activeLabels().length;
    syncDiscovery();
  }
  const editor = createElement(doc, "section", "ch-preset-editor"); editor.hidden = false; editor.setAttribute("aria-label", pt ? "Ajustes do preset" : "Preset settings"); stage.appendChild(editor);
  const editorHeader = createElement(doc, "div", "ch-preset-editor-header");
  editorHeader.appendChild(createElement(doc, "span", "", pt ? "Ajustes do preset" : "Preset settings"));
  editorHeader.appendChild(button(doc, {label: pt ? "Fechar" : "Close", onClick: () => closeEditor(true)})); editor.appendChild(editorHeader);
  const numericCleanups:Array<()=>void>=[];
  /** Direction previews in the open drawer; rebuilt with the drawer's content. */
  function disposeNumbers():void{for(const dispose of numericCleanups.splice(0))dispose();}
  const inspector = createElement(doc, "section", "ch-preset-inspector"); editor.appendChild(inspector);
  const actions = createElement(doc, "div", "ch-preset-applybar");
  const settingsPanel = createElement(doc, "section", "ch-preset-settings-panel");
  settingsPanel.id = `${galleryId}-settings`; settingsPanel.hidden = true;
  settingsPanel.setAttribute("role", "dialog"); settingsPanel.setAttribute("aria-modal", "false");
  settingsPanel.setAttribute("data-motion", "surface-morph"); settingsPanel.setAttribute("data-open", "false");
  const settingsHeader = createElement(doc, "div", "ch-preset-settings-header");
  const settingsTitle = createElement(doc, "span", ""); settingsTitle.id = `${galleryId}-settings-title`;
  settingsPanel.setAttribute("aria-labelledby", settingsTitle.id); settingsHeader.appendChild(settingsTitle);
  const settingsClose = button(doc, {label:"×",onClick:()=>closeEditor(true)});
  setUiIcon(settingsClose, "close", "×");
  settingsClose.setAttribute("aria-label", pt ? "Fechar ajustes" : "Close settings"); settingsHeader.appendChild(settingsClose);
  settingsPanel.appendChild(settingsHeader);
  const settingsBody = createElement(doc, "div", "ch-preset-settings-body"); settingsPanel.appendChild(settingsBody);
  let settingsOpen = false, settingsTimer: ReturnType<typeof setTimeout> | undefined;
  const savedTabStops = new Map<HTMLElement,string|null>();
  function settingsTabStops(enabled: boolean): void {
    for(const node of Array.from(settingsPanel.querySelectorAll<HTMLElement>("button,input,select,summary"))) {
      if(enabled) { const old=savedTabStops.get(node); if(old===null)node.removeAttribute("tabindex");else if(old!==undefined)node.setAttribute("tabindex",old); }
      else { if(!savedTabStops.has(node))savedTabStops.set(node,node.getAttribute("tabindex") ?? null);node.setAttribute("tabindex","-1"); }
    }
    if(enabled)savedTabStops.clear();
  }
  // Collection navigation and preview controls remain visible while browsing.
  if (options.openApplied) {
    const edit = button(doc,{label:"",title:pt?"Editar preset aplicado":"Edit applied preset",onClick:()=>{if(disposed)return;rememberScroll();options.openApplied?.();}});
    edit.setAttribute("aria-label",pt?"Editar preset aplicado":"Edit applied preset");
    edit.classList.add("ch-preset-toolbar-action"); edit.appendChild(createIcon(doc,"rename"));
    toolbar.appendChild(edit);
  }
  const auto = button(doc,{label:"",title:"Autoplay",onClick:()=>{options.preferences.setPresetAutoplay(!options.preferences.snapshot().presetAutoplay);auto.setAttribute("aria-pressed",String(options.preferences.snapshot().presetAutoplay));restartPreviews();}});
  auto.setAttribute("aria-label","Autoplay");auto.setAttribute("aria-pressed",String(options.preferences.snapshot().presetAutoplay));
  auto.classList.add("ch-preset-autoplay");setUiIcon(auto,"autoplay","▶");toolbar.appendChild(searchControl);
  const footer = createElement(doc, "div", "ch-preset-footer ch-preset-preview-controls");
  /** Every card in the grid has the same width: it is measured once per layout
   * change (resize, thumbnail size), never per card, since each read of
   * clientWidth lays out the whole grid. */
  let cardPixels = 0;
  const cardWidth = (view: HTMLElement): number => cardPixels || (cardPixels = view.clientWidth);
  const sizeName=pt?"Tamanho das miniaturas":"Thumbnail size";
  const sizeLabel=createElement(doc,"div","ch-preset-size");
  const size=doc.createElement("input");
  size.type="range";size.min="140";size.max="320";size.step="10";
  size.className="ch-slider-track";
  size.value=String(options.preferences.snapshot().presetSize);
  size.setAttribute("aria-label",sizeName);
  const sizeValue = doc.createElement("input");
  sizeValue.className = "ch-preset-size-value ch-slider-value";
  sizeValue.value = size.value;
  sizeValue.min = size.min;
  sizeValue.max = size.max;
  sizeValue.step = size.step;
  sizeValue.setAttribute("aria-label", pt ? "Tamanho da miniatura em pixels" : "Thumbnail size in pixels");
  const updateSizeDescription=():void=>{
    size.title=`${sizeName} (${size.value} px)`;
    size.setAttribute("aria-valuetext",`${size.value} px`);
    sizeValue.setAttribute("aria-valuenow", size.value);
    updateSliderFill(size);
  };
  updateSizeDescription();
  // Arrastar o controle só mexe na grade, no máximo uma vez por quadro. Gravar
  // a preferência (JSON + localStorage + tema) fica para quando o usuário solta.
  let sizeFrame=0, sizeUnsaved=false;
  const applySize=():void=>{
    sizeFrame=0;
    cardPixels=0;
    grid.style.setProperty("--preview-size",`${size.value}px`);
    layoutDirty = true;
    renderCardWindow();
    positionSettings();
  };
  const commitSize=():void=>{
    if(sizeFrame){cancelAnimationFrame(sizeFrame);applySize();}
    if(!sizeUnsaved)return;
    sizeUnsaved=false;
    options.preferences.setPresetSize(Number(size.value));
  };
  const previewSize = (): void => {
    sizeUnsaved=true;
    updateSizeDescription();
    if(!sizeFrame)sizeFrame=requestAnimationFrame(applySize);
  };
  size.addEventListener("input",()=>{
    sizeValue.value = size.value;
    previewSize();
  });
  size.addEventListener("change",commitSize);
  function setSizeFromValue(value: number, commit: boolean): void {
    const normalized = Math.round(value / 10) * 10;
    if (Number(size.value) !== normalized) {
      size.value = String(normalized);
      previewSize();
    }
    if (commit) {
      sizeValue.value = size.value;
      commitSize();
    }
  }
  const stopSizeScrub = attachScrubbableNumber(sizeValue, {
    onInput: value => { if (sizeValue.getAttribute("data-scrubbing") === "true") setSizeFromValue(value, false); },
    onCommit: value => setSizeFromValue(value, true),
    onGestureEnd: (value, canceled) => { if (canceled) {
      setSizeFromValue(value, false);
      sizeUnsaved = false;
    } }
  });
  sizeValue.addEventListener("blur", () => { sizeValue.value = size.value; });
  sizeValue.addEventListener("dblclick", () => setSizeFromValue(200, true));
  sizeLabel.appendChild(size);
  sizeLabel.appendChild(sizeValue);
  footer.appendChild(sizeLabel);
  // Estudo: a reprodução das prévias é um botão da barra de cima, ao lado da estrela.
  auto.setAttribute("aria-label",pt?"Reproduzir prévias ao passar o cursor":"Play previews on hover");auto.title=auto.getAttribute("aria-label")!;toolbar.appendChild(auto);
  const sidebar=createElement(doc,"aside","ch-preset-sidebar");
  const splitter=createElement(doc,"div","ch-preset-splitter");splitter.setAttribute("role","separator");splitter.setAttribute("aria-orientation","vertical");splitter.setAttribute("aria-label",pt?"Largura das pastas":"Folder width");splitter.setAttribute("tabindex","0");
  element.removeChild(toolbar);sidebar.appendChild(toolbar);
  element.removeChild(filterMenu);sidebar.appendChild(filterMenu);folderPicker.setOpen(false);
  // Navegar/Editar (preset-workspace.ts) entra na linha da busca enquanto a galeria
  // existe: uma linha a menos acima dos cards. Volta para a área de trabalho no dispose,
  // antes de Editar ou de um redesenho limpar o conteúdo da biblioteca.
  let adoptedTabs: { tabs: HTMLElement; home: HTMLElement; next: Node | null } | undefined;
  const childElements = (node: Node): HTMLElement[] => Array.from(node.childNodes ?? []).filter((child): child is HTMLElement => Boolean((child as HTMLElement).classList));
  function syncTabsGlide(tabs: HTMLElement): void {
    const children = childElements(tabs);
    const glide = children.find(child => child.classList.contains("ch-preset-tabs__glide"));
    const selected = children.find(child => child.getAttribute("aria-selected") === "true");
    if (!glide || !selected || !selected.offsetWidth) return;
    glide.style.width = `${selected.offsetWidth}px`; glide.style.transform = `translateX(${selected.offsetLeft}px)`;
  }
  function adoptWorkspaceTabs(): void {
    if (disposed) return;
    if (adoptedTabs) { syncTabsGlide(adoptedTabs.tabs); return; }
    let home = element.parentNode as HTMLElement | null;
    while (home && !home.classList?.contains("ch-preset-workspace")) home = home.parentNode as HTMLElement | null;
    const tabs = home ? childElements(home).find(child => child.classList.contains("ch-preset-tabs")) : undefined;
    if (!home || !tabs) return;
    adoptedTabs = { tabs, home, next: tabs.nextSibling };
    tabs.classList.add("ch-preset-tabs--inline");
    toolbar.insertBefore(tabs, toolbar.firstChild);
    syncTabsGlide(tabs);
  }
  function releaseWorkspaceTabs(): void {
    if (!adoptedTabs) return;
    const { tabs, home, next } = adoptedTabs; adoptedTabs = undefined;
    tabs.classList.remove("ch-preset-tabs--inline");
    home.insertBefore(tabs, next && next.parentNode === home ? next : home.firstChild);
  }
  // A área de trabalho insere a galeria logo depois de criá-la.
  void Promise.resolve().then(adoptWorkspaceTabs);
  const selectionSummary = createElement(doc, "div", "ch-preset-selection-summary");
  const selectedName = createElement(doc, "span", "ch-preset-selected-name");
  const selectionStatus = createElement(doc, "span", "ch-preset-selection-status");
  selectionSummary.setAttribute("role", "status");
  selectionSummary.appendChild(selectedName); selectionSummary.appendChild(selectionStatus);
  referenceFooter.appendChild(selectionSummary);
  function selectionSummaryText(name: string, status: string): void {
    // "Selecione um preset" fica apagado (estudo); um nome escolhido fica em negrito.
    const empty = [pt ? "Selecione um preset" : "Select a preset", pt ? "Selecione um arquivo" : "Select a file"].includes(name);
    selectionSummary.setAttribute("data-empty", String(empty));
    selectedName.textContent = name; selectedName.title = name;
    selectionStatus.textContent = status; selectionStatus.title = status;
  }
  const libraryActions=createPresetLibraryActions(doc,options.locale,options.libraryActions,()=>{setFilters(false);labelMenu?.close(false);closeEditor();});
  referenceFooter.appendChild(libraryActions.element);referenceFooter.appendChild(footer);referenceFooter.appendChild(actions);
  element.appendChild(sidebar);element.appendChild(splitter);element.appendChild(scroll);element.appendChild(referenceFooter);element.appendChild(settingsPanel);
  let splitterHeld=false;
  const sidebarLimit=():number=>Math.max(120,Math.min(320,(element.getBoundingClientRect().width||window.innerWidth||506)-160));
  function setSidebar(value:number,persist=false):void {
    // The grid beside the sidebar changes width with it.
    cardPixels=0;
    const width=Math.round(Math.max(120,Math.min(sidebarLimit(),value)));nav.sidebarWidth=width;
    element.setAttribute("data-narrow-tree",String(width<140));
    element.style.setProperty("--preset-sidebar-width",width+"px");splitter.setAttribute("aria-valuemin","120");splitter.setAttribute("aria-valuemax",String(sidebarLimit()));splitter.setAttribute("aria-valuenow",String(width));
    if(persist)options.preferences.setGallery?.({sidebarWidth:width});
  }
  // Pointer capture keeps the drag when the cursor leaves the panel; the grip settles on the
  // spring when released; a double-click glides back to the default width (F7).
  let splitterPointer: number | null = null, sidebarTween: TweenHandle | null = null;
  const moveSplitter=(event:MouseEvent):void=>{if(splitterHeld){closeEditor();setSidebar(event.clientX-element.getBoundingClientRect().left);}};
  function stopSplitter():void{
    if(!splitterHeld)return;splitterHeld=false;splitter.removeAttribute("data-dragging");
    doc.removeEventListener("mousemove",moveSplitter);doc.removeEventListener("mouseup",stopSplitter);window.removeEventListener("blur",stopSplitter);
    if(splitterPointer!==null&&typeof splitter.hasPointerCapture==="function"&&splitter.hasPointerCapture(splitterPointer))splitter.releasePointerCapture(splitterPointer);
    splitterPointer=null;setSidebar(nav.sidebarWidth??DEFAULT_TREE_WIDTH,true);
  }
  function holdSplitter(event:MouseEvent):void{event.preventDefault();sidebarTween?.cancel();splitterHeld=true;splitter.setAttribute("data-dragging","true");}
  splitter.addEventListener("pointerdown",event=>{
    const pointer=event as PointerEvent;if(pointer.button!==0||typeof splitter.setPointerCapture!=="function")return;
    holdSplitter(pointer);splitterPointer=pointer.pointerId;splitter.setPointerCapture(pointer.pointerId);
  });
  splitter.addEventListener("pointermove",event=>{if(splitterPointer!==null&&(event as PointerEvent).pointerId===splitterPointer)moveSplitter(event as PointerEvent);});
  splitter.addEventListener("pointerup",()=>stopSplitter());
  splitter.addEventListener("pointercancel",()=>stopSplitter());
  splitter.addEventListener("lostpointercapture",()=>stopSplitter());
  splitter.addEventListener("mousedown",event=>{if(splitterHeld)return;holdSplitter(event as MouseEvent);doc.addEventListener("mousemove",moveSplitter);doc.addEventListener("mouseup",stopSplitter);window.addEventListener("blur",stopSplitter);});
  splitter.addEventListener("dblclick",()=>{
    closeEditor();sidebarTween?.cancel();
    sidebarTween=tween(motionEnv,{from:nav.sidebarWidth??DEFAULT_TREE_WIDTH,to:DEFAULT_TREE_WIDTH,durationMs:aeMotionMs("height-glide"),curve:aeMotionCurve("height-glide"),onUpdate:value=>setSidebar(value),onDone:()=>setSidebar(DEFAULT_TREE_WIDTH,true)});
  });
  splitter.addEventListener("keydown",event=>{if(!["ArrowLeft","ArrowRight","Home","End"].includes(event.key))return;event.preventDefault();closeEditor();setSidebar(event.key==="Home"?120:event.key==="End"?sidebarLimit():(nav.sidebarWidth??DEFAULT_TREE_WIDTH)+(event.key==="ArrowLeft"?-8:8),true);});
  // Sized by resize(): a narrow dock (folder picker) leaves the saved width for when the panel widens.
  const sidebarWidth=():number=>nav.sidebarWidth??options.preferences.snapshot().gallery?.sidebarWidth??DEFAULT_TREE_WIDTH;

  registerLayoutProperties(doc);
  grid.style.setProperty("--preview-size",`${size.value}px`);
  let disposed = false, debounce = 0, scrollRestoreFrame = 0, scrollRestoreRevision = 0;
  let pendingScroll: number | undefined;
  function rememberScroll(): void {
    if (disposed || grid.isConnected === false) return;
    // A remount starts at zero before it has layout. Keep its saved destination
    // until restoration, but capture a real scroll even before its event arrives.
    nav.scroll = pendingScroll !== undefined && grid.scrollTop === 0 ? pendingScroll : grid.scrollTop;
  }
  function restoreScroll(): void {
    const revision = scrollRestoreRevision;
    const revealId = nav.pendingRevealId;
    const finish = (): void => {
      if (disposed || revision !== scrollRestoreRevision) return;
      scrollRestoreFrame = 0;
      if (grid.isConnected === false) return;
      if (layoutDirty) renderCardWindow();
      const previousTop = grid.scrollTop;
      grid.scrollTop = pendingScroll ?? nav.scroll;
      if (revealId && nav.pendingRevealId === revealId) {
        renderCardWindow(revealId);
        const card = mountedCards.get(revealId)?.card;
        if (card) {
          const viewport = grid.getBoundingClientRect(), bounds = card.getBoundingClientRect();
          if (viewport.height > 0 && bounds.height > 0) {
            if (bounds.top < viewport.top) grid.scrollTop += bounds.top - viewport.top;
            else if (bounds.bottom > viewport.bottom) grid.scrollTop += bounds.height > viewport.height ? bounds.top - viewport.top : bounds.bottom - viewport.bottom;
            delete nav.pendingRevealId;
          }
        }
      }
      nav.scroll = grid.scrollTop;
      pendingScroll = undefined;
      if (nav.scroll !== previousTop || revealId) renderCardWindow();
    };
    if ((pendingScroll ?? 0) <= 0 && !revealId) { finish(); return; }
    scrollRestoreFrame = requestAnimationFrame(() => {
      if (disposed || revision !== scrollRestoreRevision) return;
      scrollRestoreFrame = requestAnimationFrame(finish);
    });
  }
  let editorTrigger: HTMLElement | null = null;
  const previewPlayers = new Map<string, () => void>();
  const scenes = new Map<string,{view:HTMLElement; paint:(time:number)=>void; rest:()=>void; replay:()=>void; ready:()=>boolean; pause:()=>void; release:()=>void; start:number}>();
  const visible = new Set<string>(); let activePreview="", animationFrame=0,lastPaint=0,pausedAt=0;
  let hoverCard: HTMLElement | null = null, hoverTimer = 0, hoverPlayId = "", intentTimer: ReturnType<typeof setTimeout> | undefined;
  /** Every text card on screen plays its rendered preview at once, drawn from
   * frames decoded once (as Animation Composer does): no <video> per card, so
   * nothing stalls or blinks. Direction tiles play one at a time. Cards are
   * rendered at 30 fps over 4 s; direction tiles at 30 fps over 3 s. */
  // Direction tiles in the settings drawer all play at once, like the cards.
  const cardWall = createPreviewWall(doc, "ch-preset-player");
  const frameCache = sharedFrameCache(doc);
  const TEXT_DIRECTION_SECONDS = 3;
  const referenceFps = (asset: { durationSeconds: number }): number => asset.durationSeconds === TEXT_DIRECTION_SECONDS ? 15 : 30;
  /** While the list scrolls, cards slide under a still pointer: hover and
   * previews stay off until it settles, or the grid lit up card after card. */
  const SCROLL_QUIET_MS = 200;
  let scrollQuietUntil = 0, scrollTimer: ReturnType<typeof setTimeout> | undefined;
  const scrolling = (): boolean => performance.now() < scrollQuietUntil;
  /** A card that arrives in view plays its whole cycle from the start: entrance,
   * hold, exit and the blank reset. One that only grazed the edge and returns
   * within this window keeps its cycle, so jitter at the edge never restarts it. */
  const REENTRY_GRACE_MS = 900;
  /** A card plays once at least half of it is in view: one peeking in at the
   * edge stays on its still, so its cycle starts where it can be seen. */
  const VIEW_THRESHOLD = 0.5;
  /** The pointer must stay out this long before previews pause. CEP re-fires
   * leave/enter while a card repaints under the cursor; pausing on each one
   * stalled the hovered preview every other frame. */
  const LEAVE_GRACE_MS = 400;
  const leftAt = new Map<string, number>(), cueTimers = new Map<string, number>();
  let leaveTimer = 0, mediaTimer = 0;
  // CEP can remain visible while the editor or another app owns focus. Hidden
  // alone is insufficient: stop on both native window blur and panel exit.
  let panelActive = typeof doc.hasFocus === "function" ? doc.hasFocus() : true, pointerInside=false;
  const reduced = (): boolean => doc.documentElement.getAttribute("data-reduced-motion") === "true";
  const canPlay = (): boolean => panelActive && !disposed && !doc.hidden && !options.busy && !reduced();
  const autoplay = (): boolean => options.preferences.snapshot().presetAutoplay && !reduced();
  /** Every card rests on its still. In CEP, a grid of cards looping their
   * entrances at once blinked from black to text, and the panel dropped video
   * frames to empty grey; only the card being looked at plays. */
  function prepare(scene: {rest:()=>void}): void { scene.rest(); }
  function clearCue(id: string): void { const timer=cueTimers.get(id); if(timer!==undefined){clearTimeout(timer);cueTimers.delete(id);} }
  /** One card plays: the one the pointer has rested on (with autoplay on) or,
   * with the pointer elsewhere, the selected card. */
  function playingIds(): string[] {
    if (scrolling()) return [];
    if (hoverCard && autoplay()) return hoverPlayId === hoverCard.id && visible.has(hoverPlayId) ? [hoverPlayId] : [];
    return nav.selectedId && visible.has(nav.selectedId) ? [nav.selectedId] : [];
  }
  /** A card that starts playing starts its cycle; one that stops returns to its still. */
  let playingNow: string[] = [];
  function settlePlaying(): void {
    const ids = playingIds();
    // Offscreen cards are the observer's: released, or rewound to their still.
    for (const id of playingNow) if (!ids.includes(id) && visible.has(id)) scenes.get(id)?.rest();
    for (const id of ids) if (!playingNow.includes(id)) { const scene = scenes.get(id); if (scene) scene.start = performance.now(); }
    playingNow = ids;
  }
  const intersections = typeof IntersectionObserver !== "undefined" ? new IntersectionObserver(entries=>{
    for(const entry of entries){
      const id=(entry.target as HTMLElement).dataset.previewId!,scene=scenes.get(id);
      if(disposed||scene?.view!==entry.target)continue;
      // Any part in view gets its still at once; playing waits for half the card.
      if(entry.isIntersecting&&!scene.ready())prepare(scene);
      if(entry.isIntersecting&&entry.intersectionRatio>=VIEW_THRESHOLD){
        if(visible.has(id))continue;
        visible.add(id);clearCue(id);
        const away=leftAt.get(id);leftAt.delete(id);
        // A real arrival plays the whole cycle from its first frame: entrance,
        // hold, exit. Only a graze of the edge keeps the cycle it had.
        const fresh=away===undefined||performance.now()-away>REENTRY_GRACE_MS;
        if(fresh)cardWall.detach(scene.view);
        if(!scene.ready())prepare(scene);else if(fresh)scene.replay();else if(canPlay())cardWall.resume(scene.view);
        if(fresh)scene.start=performance.now();
      }
      else {
        if(!visible.has(id)&&entry.isIntersecting)continue;
        visible.delete(id);if(activePreview===id)activePreview="";
        if(!near.has(id)){leftAt.delete(id);clearCue(id);scene.release();continue;}
        // Inside the prepared band the card freezes; once it has really left,
        // it is rewound offscreen so its next arrival starts the cycle again.
        scene.pause();leftAt.set(id,performance.now());clearCue(id);
        cueTimers.set(id,window.setTimeout(()=>{cueTimers.delete(id);if(!disposed&&!visible.has(id)&&scenes.get(id)===scene&&near.has(id))prepare(scene);},REENTRY_GRACE_MS));
      }
    }
    if(!playingIds().length){cancelAnimationFrame(animationFrame);animationFrame=0;}
    schedulePreviews();
  },{root:grid,threshold:[0,VIEW_THRESHOLD]}) : null;
  // Cards within a couple of rows of the viewport get their artwork built ahead
  // of time, a little per frame, so none is built while the list is scrolling.
  const near = new Set<string>(), prepQueue: string[] = []; let prepFrame = 0;
  const PREP_BUDGET_MS = 4, AHEAD_MARGIN = "480px 0px 480px 0px";
  function pumpPrep(): void {
    prepFrame = 0;
    if(disposed)return;
    const started = performance.now();
    do {
      const id = prepQueue.shift(), scene = id ? scenes.get(id) : undefined;
      if(id && scene && near.has(id) && !scene.ready()) prepare(scene);
    } while(prepQueue.length && performance.now() - started < PREP_BUDGET_MS);
    if(prepQueue.length) prepFrame = requestAnimationFrame(pumpPrep);
  }
  const ahead = intersections && typeof IntersectionObserver !== "undefined" ? new IntersectionObserver(entries=>{
    for(const entry of entries){
      const id=(entry.target as HTMLElement).dataset.previewId!,scene=scenes.get(id);
      if(disposed||scene?.view!==entry.target)continue;
      if(entry.isIntersecting){near.add(id);if(!scene.ready()&&!visible.has(id))prepQueue.push(id);}
      else{near.delete(id);if(!visible.has(id)){leftAt.delete(id);clearCue(id);scene.release();}}
    }
    if(prepQueue.length&&!prepFrame)prepFrame=requestAnimationFrame(pumpPrep);
  },{root:grid,rootMargin:AHEAD_MARGIN,threshold:0}) : null;
  function schedulePreviews(): void {
    settlePlaying();
    if(animationFrame||!canPlay()||!playingIds().length)return;
    animationFrame=requestAnimationFrame(tickPreviews);
  }
  function tickPreviews(now:number): void {
    animationFrame=0;
    if(!canPlay())return;
    settlePlaying();const ids=playingNow;if(!ids.length)return;
    if(now-lastPaint>=1000/30-1){
      lastPaint=now;for(const id of ids){const scene=scenes.get(id);if(scene)scene.paint((now-scene.start)/1000);}
    }
    schedulePreviews();
  }
  function pausePreviews(): void {
    clearTimeout(leaveTimer);leaveTimer=0;
    if(panelActive)pausedAt=performance.now();
    panelActive=false;cancelAnimationFrame(animationFrame);animationFrame=0;activePreview="";
    // Keep the last visible frame; do not rebuild every SVG when focus changes.
    // The video pauses once the panel stays inactive: toggling it on every
    // focus flicker stuttered the rendered previews.
    clearTimeout(mediaTimer);mediaTimer=window.setTimeout(()=>{mediaTimer=0;if(!panelActive)cardWall.pause();},LEAVE_GRACE_MS);
  }
  function resumePreviews(): void {
    if(disposed||doc.hidden)return;
    // Clicks, focus, tooltips and the pointer crossing the settings sheet pause
    // and resume constantly: continue from the paused frame, never restart, or
    // every preview jumps back to its empty first frame and the text blinks.
    clearTimeout(leaveTimer);leaveTimer=0;clearTimeout(mediaTimer);mediaTimer=0;
    if(!panelActive&&pausedAt){
      const idle=performance.now()-pausedAt;
      for(const scene of scenes.values())scene.start+=idle;
      for(const [id,time] of leftAt)leftAt.set(id,time+idle);
    }
    pausedAt=0;panelActive=true;
    if(!reduced())cardWall.resume();
    schedulePreviews();
  }
  function restartPreviews(): void {
    cancelAnimationFrame(animationFrame);animationFrame=0;activePreview="";
    for(const id of visible){const scene=scenes.get(id);if(scene){prepare(scene);scene.start=performance.now();}}
    schedulePreviews();
  }
  // The pointer over the panel is enough to play: in CEP the panel only gains
  // focus on a click, and gating on focus left drawn previews frozen while
  // the rendered ones kept running.
  const enterPanel=():void=>{pointerInside=true;clearTimeout(leaveTimer);leaveTimer=0;resumePreviews();};
  const movePanel=():void=>{if(!panelActive||leaveTimer)enterPanel();};
  // Once the pointer has really left, the playing card goes back to its still
  // instead of freezing on whatever frame it had reached.
  const leavePanel=():void=>{pointerInside=false;clearTimeout(leaveTimer);leaveTimer=window.setTimeout(()=>{leaveTimer=0;if(pointerInside)return;pausePreviews();setHover(null);for(const id of playingNow)if(visible.has(id))scenes.get(id)?.rest();},LEAVE_GRACE_MS);};
  const windowFocus=():void=>{if(pointerInside)resumePreviews();};
  element.addEventListener("mouseenter",enterPanel);element.addEventListener("mouseleave",leavePanel);element.addEventListener("mousemove",movePanel);
  // Hover lives in an attribute, not :hover. CEP re-fires leave/enter while
  // a card repaints under the cursor, and :hover toggled with it every frame;
  // a card keeps its hover until the pointer has really been elsewhere a moment.
  const HOVER_GRACE_MS = 140;
  /** The pointer rests this long on a card before it plays: sweeping across
   * the grid starts nothing. */
  const HOVER_INTENT_MS = 150;
  const cardOf = (target: EventTarget | null): HTMLElement | null => {
    const node = target as HTMLElement | null;
    return node && typeof node.closest === "function" ? node.closest<HTMLElement>(".ch-preset-card") : null;
  };
  function setHover(card: HTMLElement | null): void {
    clearTimeout(hoverTimer);hoverTimer=0;
    if(card===hoverCard)return;
    hoverCard?.removeAttribute("data-hover");
    hoverCard=card;card?.setAttribute("data-hover","true");
    clearTimeout(intentTimer);intentTimer=undefined;hoverPlayId="";
    if(card)intentTimer=setTimeout(()=>{intentTimer=undefined;if(hoverCard!==card||disposed)return;hoverPlayId=card.id;schedulePreviews();},HOVER_INTENT_MS);
    schedulePreviews();
  }
  function quietScroll(): void {
    scrollQuietUntil=performance.now()+SCROLL_QUIET_MS;
    // Rendered previews keep playing; only new decoding waits for the list to settle.
    frameCache.hold(true);
    if(hoverCard)setHover(null);else schedulePreviews();
    clearTimeout(scrollTimer);scrollTimer=setTimeout(()=>{scrollTimer=undefined;frameCache.hold(false);if(!disposed)schedulePreviews();},SCROLL_QUIET_MS+20);
  }
  grid.addEventListener("pointerover",event=>{if(scrolling())return;const card=cardOf(event.target);if(card)setHover(card);});
  // After a scroll the hover returns with the next movement over a card.
  grid.addEventListener("pointermove",event=>{if(hoverCard||scrolling())return;const card=cardOf(event.target);if(card)setHover(card);});
  grid.addEventListener("pointerout",event=>{
    if(!hoverCard||hoverCard.contains?.((event as PointerEvent).relatedTarget as Node))return;
    clearTimeout(hoverTimer);hoverTimer=window.setTimeout(()=>{hoverTimer=0;setHover(null);},HOVER_GRACE_MS);
  });
  element.addEventListener("mousedown",resumePreviews);element.addEventListener("focusin",resumePreviews);
  window.addEventListener("blur",pausePreviews);window.addEventListener("focus",windowFocus);
  // Only a real change of the preference restarts the cycles.
  let reducedSeen=reduced();
  const motionObserver=typeof MutationObserver!=="undefined"?new MutationObserver(()=>{if(reduced()===reducedSeen)return;reducedSeen=reduced();restartPreviews();}):null;
  motionObserver?.observe(doc.documentElement,{attributes:true,attributeFilter:["data-reduced-motion"]});
  function positionSettings(): void {
    if(!settingsOpen || !editorTrigger)return;
    const card = Array.from(grid.querySelectorAll<HTMLElement>(".ch-preset-card")).find(node => node.contains(editorTrigger));
    if (!card) { closeEditor(); return; }
    const focused = doc.activeElement as HTMLElement | null;
    const keepFocus = focused && settingsPanel.contains(focused);
    // In a short dock, the card and the variations cannot share the viewport.
    // Reuse the catalog area while leaving the apply bar outside the sheet.
    const compact = stage.clientHeight > 0 && grid.clientHeight < 168;
    if (compact) stage.setAttribute("data-settings-sheet", "true");
    else stage.removeAttribute("data-settings-sheet");
    settingsPanel.setAttribute("data-layout", compact ? "sheet" : "popover");
    settingsPanel.setAttribute("data-side", compact ? "catalog" : "below");
    if (compact) {
      settingsPanel.setAttribute("data-short", String(stage.clientHeight < 60));
      placePopoverIn(settingsPanel, stage);
      for (const property of ["top", "left", "width"]) settingsPanel.style.removeProperty(property);
      attach(null);
      if (keepFocus && doc.activeElement !== focused) focused.focus({preventScroll:true});
      return;
    }
    settingsPanel.removeAttribute("data-short");
    const wasSheet = settingsPanel.parentNode === stage;
    placePopoverIn(settingsPanel, grid);
    const box = popoverBox(grid, card);
    settingsPanel.style.setProperty("top", `${box.top}px`); settingsPanel.style.setProperty("left", `${box.left}px`);
    if (box.width) settingsPanel.style.setProperty("width", `${box.width}px`); else settingsPanel.style.removeProperty("width");
    attach(card, "below");
    if (wasSheet) {
      const bounds = settingsPanel.getBoundingClientRect(), viewport = grid.getBoundingClientRect();
      if (bounds.top < viewport.top) grid.scrollTop += bounds.top - viewport.top;
      else if (bounds.bottom > viewport.bottom) grid.scrollTop += bounds.bottom - viewport.bottom;
    }
    if (keepFocus && focused === settingsClose) focusVariation();
    else if (keepFocus && doc.activeElement !== focused) focused.focus({preventScroll:true});
  }
  /** Puts the panel back outside the grid, so a redraw of the cards never drops it. */
  function stowDrawer(): void {
    if (settingsPanel.parentNode === element) return;
    settingsPanel.parentNode?.removeChild(settingsPanel); element.appendChild(settingsPanel);
    settingsPanel.removeAttribute("data-layout");
    for (const property of ["top", "left", "width"]) settingsPanel.style.removeProperty(property);
  }

  /** Marks the card that the open settings grow out of; null clears it. */
  let attachedCard: HTMLElement | null = null;
  function attach(card: HTMLElement | null, side?: "above" | "below"): void {
    if (attachedCard && attachedCard !== card) attachedCard.removeAttribute("data-attached");
    attachedCard = card;
    if (card && side) { card.setAttribute("data-attached", side); settingsPanel.setAttribute("data-attached", side); }
    else settingsPanel.removeAttribute("data-attached");
  }
  function focusVariation(): void {
    const target = settingsBody.querySelector<HTMLButtonElement>("[data-direction][aria-pressed=\"true\"]")
      ?? settingsBody.querySelector<HTMLButtonElement>("button") ?? settingsClose;
    target.focus({preventScroll:true});
  }
  function closeEditor(restoreFocus = false): void {
    if(!settingsOpen && settingsPanel.hidden)return;
    settingsOpen=false; element.removeAttribute("data-settings-open"); clearTimeout(settingsTimer);
    stage.removeAttribute("data-settings-sheet");
    // The card keeps its open shape until the drawer has folded back into it.
    const folding = attachedCard; setTimeout(() => { if (!settingsOpen && attachedCard === folding) { folding?.removeAttribute("data-attached"); attachedCard = null; } }, 200);
    settingsPanel.setAttribute("data-open", "false"); settingsPanel.setAttribute("aria-hidden", "true");
    settingsTabStops(false); editorTrigger?.setAttribute("aria-expanded", "false");
    if (restoreFocus) editorTrigger?.focus({preventScroll:true});
    const reduce = reduced() || doc.defaultView?.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if(reduce || settingsPanel.parentNode === stage){settingsPanel.hidden=true;stowDrawer();}
    else settingsTimer=setTimeout(()=>{settingsPanel.hidden=true;stowDrawer();},200);
  }
  function openEditor(preset: GalleryPreset, trigger: HTMLElement): void {
    if(settingsOpen && nav.selectedId===preset.id && editorTrigger===trigger){
      closeEditor(true);return;
    }
    libraryActions.close();
    editorTrigger?.setAttribute("aria-expanded","false");
    setFilters(false); select(preset); clearTimeout(settingsTimer);
    editorTrigger = trigger; settingsOpen = true; element.setAttribute("data-settings-open", "true"); settingsPanel.hidden=false;
    trigger.setAttribute("aria-expanded", "true"); settingsPanel.setAttribute("aria-hidden","false");
    settingsTabStops(true); positionSettings(); void settingsPanel.offsetWidth;
    settingsPanel.setAttribute("data-open","true");
    if (settingsPanel.parentNode === stage) {
      settingsClose.focus({preventScroll:true});
    } else {
      // Bring the attached drawer into view without scrolling the card away.
      if (!scrollIntoViewSmooth(motionEnv, settingsPanel)) settingsPanel.scrollIntoView?.({block:"nearest", inline:"nearest"});
      focusVariation();
    }
    previewPlayers.get(preset.id)?.();
  }
  // Categories live in the anchored menu, which sizes itself to its labels.
  const resize = (): void => { cardPixels = 0; adoptWorkspaceTabs(); folderPicker.update();if(!folderPicker.active())setSidebar(sidebarWidth());syncDiscovery();queueCardWindow(true);if(categories.offsetHeight>0)folderGlide.refresh(false); };
  const outside = (event: MouseEvent): void => { const target = event.target as Node;
    if(settingsOpen && !settingsPanel.contains(target) && !editorTrigger?.contains(target) && !(target as HTMLElement).closest?.(".ch-select-menu"))closeEditor();
    if(openPalette && !openPalette.contains(target) && !(target as HTMLElement).closest?.(".ch-folder-more"))closeFolderMenu();
    if(!element.contains(target))pausePreviews(); if (!filterMenu.hidden && !filterMenu.contains(target) && !filterButton.contains(target)) setFilters(false); };
  const escape = (event: KeyboardEvent): void => { if(event.key!=="Escape"||event.defaultPrevented)return;
    if(settingsOpen){event.preventDefault();closeEditor(true);return;}
    if(colorFolder){event.preventDefault();const id=colorFolder;colorFolder="";drawFolders();restoreFocus(`more.${id}`);return;}
    if(folderPicker.isOpen()){event.preventDefault();setFilters(false);filterButton.focus();}
    };
  doc.addEventListener("mousedown", outside); doc.addEventListener("keydown", escape); window.addEventListener("resize", resize);
  // O menu nativo do Chromium (Recarregar/Voltar) não tem lugar no painel; campos de texto o mantêm.
  element.addEventListener("contextmenu", event => { const target = event.target as HTMLElement | null; if (target?.closest?.("input, textarea")) return; event.preventDefault(); });
  // O menu da pasta é fixo na tela: rolar a árvore ou redimensionar o painel o fecha.
  window.addEventListener("resize", closeFolderMenu);
  // Só um deslocamento real fecha: o redesenho limpa e restaura scrollTop e também emite "scroll".
  categories.addEventListener("scroll", () => { if (openPalette && Math.abs(categories.scrollTop - paletteScroll) > 2) closeFolderMenu(); });
  const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null; observer?.observe(browser);
  resize();
  const ns = "http://www.w3.org/2000/svg";
  function settings(preset: GalleryPreset): MotionLibraryOptions {
    if (!preset.motion) return { ...MOTION_LIBRARY_DEFAULTS };
    return nav.drafts![preset.id] ?? (nav.drafts![preset.id] = defaultLibraryOptions(preset.motion, options.context?.()?.fps));
  }
  /** A click on the selected card clears the selection, once the moment for a
   * second click has passed: a double-click applies instead, and clearing at
   * once would make the selection blink off and back on. */
  const DESELECT_DELAY_MS = 300;
  let deselectTimer = 0;
  function cancelDeselect(): boolean { const pending=Boolean(deselectTimer); clearTimeout(deselectTimer); deselectTimer=0; return pending; }
  function cardClick(preset:GalleryPreset):void {
    if(disposed)return;
    // Direction and effect choices open only from the card's settings button.
    closeEditor();cancelReveal();
    if(nav.selectedId!==preset.id){cancelDeselect();select(preset);return;}
    // The second click of a double-click lands here too: it never schedules.
    if(cancelDeselect())return;
    deselectTimer=window.setTimeout(()=>{deselectTimer=0;if(!disposed&&nav.selectedId===preset.id)deselect();},DESELECT_DELAY_MS);
  }
  function deselect(): void {
    cancelReveal();rememberScroll();closeEditor();nav.selectedId="";
    for (const card of Array.from(grid.querySelectorAll(".ch-preset-card"))) {card.setAttribute("data-selected","false");card.querySelector(".ch-preset-preview")?.setAttribute("aria-pressed","false");}
    drawInspector();schedulePreviews();
  }
  function select(preset: GalleryPreset): void {
    if (disposed) return;
    cancelReveal();
    rememberScroll();
    if (nav.selectedId !== preset.id) closeEditor();
    nav.selectedId = preset.id;
    for (const card of Array.from(grid.querySelectorAll(".ch-preset-card"))) {card.setAttribute("data-selected", String(card.id === preset.id));card.querySelector(".ch-preset-preview")?.setAttribute("aria-pressed",String(card.id===preset.id));}
    drawInspector(preset);
  }
  function directPhaseApply(preset: GalleryPreset): boolean {
    return preset.motion?.mode === "transition" && !(preset.category === "camera-transitions" && (Boolean(preset.motion.cameraSpec || preset.motion.filmSpec) || nav.cameraApplyMode !== "layers"));
  }
  /** Clique direito no card: as ações do card num menu no ponteiro (seleciona primeiro, como o Composer). */
  function openCardMenu(preset: GalleryPreset, adjust: HTMLButtonElement, pointer: MouseEvent): void {
    if (disposed) return;
    closeFolderMenu(); closeEditor(); if (nav.selectedId !== preset.id) select(preset);
    const context = options.context?.(), name = preset.displayName[i18n.locale()] ?? preset.id;
    const blocked = options.busy ? (pt ? "Aguarde a operação atual" : "Wait for the current operation")
      : context && !context.hasComp ? (pt ? "Abra uma composição" : "Open a composition")
      : context && context.selectionCount < 1 && preset.applyMode === "layers" ? (pt ? "Selecione camadas" : "Select layers") : undefined;
    const block = blocked ? { disabledReason: blocked } : {};
    const favorite = options.preferences.snapshot().favorites.includes(preset.id);
    const entries: ContextMenuEntry[] = directPhaseApply(preset)
      ? [{ id: "in", label: pt ? "Aplicar entrada" : "Apply in", icon: "play", ...block, run: () => applyPreset(preset, "in") },
         { id: "out", label: pt ? "Aplicar saída" : "Apply out", icon: "play", ...block, run: () => applyPreset(preset, "out") },
         { id: "both", label: pt ? "Aplicar entrada e saída" : "Apply in and out", icon: "play", ...block, run: () => applyPreset(preset, "both") }]
      : [{ id: "apply", label: pt ? "Aplicar" : "Apply", icon: "play", shortcut: pt ? "Duplo clique" : "Double-click", ...block, run: () => applyPreset(preset) }];
    if (!adjust.hidden) entries.push({ id: "adjust", label: pt ? "Variações…" : "Variations…", icon: "sliders", run: () => openEditor(preset, adjust) });
    entries.push({ separator: true });
    entries.push({ id: "favorite", label: pt ? favorite ? "Remover dos favoritos" : "Adicionar aos favoritos" : favorite ? "Remove from favorites" : "Add to favorites",
      icon: favorite ? "star-filled" : "star", run: () => { toggleCardFavorite(preset); restoreFocus(`favorite.${preset.id}`); } });
    const home = [preset.navigation?.filter, preset.category].find((id): id is string => Boolean(id && folderPath(folders, id)));
    if (home && home !== nav.category) entries.push({ id: "reveal", label: pt ? "Mostrar na pasta" : "Show in folder", icon: "folder", run: () => {
      cancelReveal(); clearTimeout(debounce);
      for (const node of folderPath(folders, home) ?? []) if (node.id !== home && options.preferences.snapshot().collapsedFolders.includes(node.id)) options.preferences.toggleFolder(node.id);
      nav.category = home; nav.query = ""; search.value = ""; nav.scope = "all"; nav.labelFilter = []; delete nav.focusFolder;
      nav.selectedId = preset.id; nav.pendingRevealId = preset.id; nav.scroll = 0; draw();
    } });
    const clipboard = doc.defaultView?.navigator?.clipboard;
    if (clipboard?.writeText) entries.push({ id: "copy", label: pt ? "Copiar nome" : "Copy name", icon: "copy", run: () => { void clipboard.writeText(name).catch(() => undefined); } });
    closeContextMenu();
    menuCardId = preset.id;
    openContextMenu(doc, { x: pointer.clientX, y: pointer.clientY, label: `${pt ? "Ações do preset" : "Preset actions"}: ${name}`, entries,
      returnFocus: mountedCards.get(preset.id)?.title ?? null,
      onClose: () => { menuCardId = undefined; queueCardWindow(); } });
  }
  function applyPreset(preset: GalleryPreset, phase?: MotionLibraryOptions["phase"]): void {
    if (disposed || options.busy || applying) return;
    if (nav.selectedId !== preset.id) select(preset);
    updateContext();
    if(options.busy||invalidNumbers.get(preset.id)?.size||actions.querySelector<HTMLButtonElement>("button")?.disabled)return;
    if (phase) settings(preset).phase = phase;
    const feedbackPhase = phase ?? (directPhaseApply(preset) ? settings(preset).phase : undefined);
    rememberScroll();
    applying = true;
    applyFeedback = { presetId: preset.id, ...(feedbackPhase ? {phase: feedbackPhase} : {}), state: "loading", message: pt ? "Aplicando…" : "Applying…" };
    updateContext(); refreshPreview(preset);
    const finish = (result?: GalleryApplyResult): void => {
      if (disposed) return;
      applying = false;
      applyFeedback = result ? {presetId:preset.id,...(feedbackPhase?{phase:feedbackPhase}:{}),state:result.ok?"success":"error",message:result.message || (result.ok?(pt?"Aplicado":"Applied"):(pt?"Não foi possível aplicar":"Could not apply"))} : undefined;
      updateContext();
    };
    try {
      const result = options.apply(preset, preset.motion ? { ...settings(preset) } : undefined,
        preset.motion?.cameraSpec || preset.motion?.filmSpec ? "precomp" : preset.category === "camera-transitions" ? nav.cameraApplyMode ?? "precomp" : "layers");
      if (result) void result.then(finish, () => finish({ok:false,message:pt?"Não foi possível aplicar. Tente novamente.":"Could not apply. Try again."}));
      else finish(); // A legacy void callback provides no evidence of success.
    } catch { finish({ok:false,message:pt?"Não foi possível aplicar. Tente novamente.":"Could not apply. Try again."}); }
  }
  /** Share of the thumbnail that a painted subject must cover to count as shown. */
  const REST_VISIBLE = .004;
  /** Largest visible painted shape, as a share of the thumbnail; null without layout (tests). */
  function paintedArea(svg: SVGSVGElement): number | null {
    const box = svg.getBoundingClientRect?.();
    if (!box || !box.width || !box.height || typeof getComputedStyle !== "function") return null;
    let best = 0;
    for (const el of Array.from(svg.querySelectorAll("path,text,rect,circle,ellipse,polygon,line,polyline"))) {
      if (el.closest("defs,clipPath,mask,filter,pattern")) continue;
      const r = el.getBoundingClientRect(), w = Math.max(0, Math.min(r.right, box.right) - Math.max(r.left, box.left)), h = Math.max(0, Math.min(r.bottom, box.bottom) - Math.max(r.top, box.top));
      if (!w || !h) continue;
      let opacity = 1;
      for (let node: Element | null = el; node && node !== svg.parentElement; node = node.parentElement) {
        const own = node.getAttribute("opacity"); if (own !== null) opacity *= Number(own);
        opacity *= Number(getComputedStyle(node).opacity || 1);
      }
      best = Math.max(best, w * h * opacity);
    }
    return best / (box.width * box.height);
  }
  /** Paints the first candidate time that shows the subject, or the best one. */
  function paintFirstVisible(svg: SVGSVGElement, candidates: number[], paintAt: (time: number) => void, shown?: (time: number) => boolean): void {
    let best = candidates[0] ?? 0, bestArea = -1;
    for (const time of candidates) {
      paintAt(time);
      const area = paintedArea(svg);
      // Not laid out yet (hidden grid, tests): judge by the motion math instead.
      if (area === null) { if (!shown || shown(time)) return; continue; }
      if (area > bestArea) { bestArea = area; best = time; }
      if (area >= REST_VISIBLE) return;
    }
    paintAt(best);
  }
  function preview(preset: GalleryPreset) {
    const previewOptions = (): MotionLibraryOptions => settings(preset);
    const overlay = (): boolean => preset.category === "camera-transitions" && (Boolean(preset.motion?.cameraSpec || preset.motion?.filmSpec) || nav.cameraApplyMode !== "layers");
    const filmReference = emulsionReferenceFor(preset.motion);
    const referenceBase = filmReference ? "../packs/emulsion-v2/previews/" : TEXT_REFERENCE_BASE;
    const name = preset.displayName[options.locale] ?? preset.id;
    const view = button(doc, { label: "" });
    view.className = "ch-preset-preview";
    if (preset.motion?.id === "text-v3-lines-mask-slant-window") view.dataset.previewStyle = "two-line-type";
    if (preset.motion?.cameraSpec?.native || preset.motion?.cameraSpec?.impact || preset.motion?.effect.startsWith("native-")) view.title = pt ? "Prévia ilustrativa; o efeito se adapta à imagem aplicada." : "Illustrative preview; the effect adapts to the applied image.";
    view.setAttribute("aria-label", `${pt ? "Prévia" : "Preview"}: ${name}`);
    view.setAttribute("aria-pressed",String(nav.selectedId===preset.id));view.dataset.focusKey=`preview.${preset.id}`;
    const svg = doc.createElementNS(ns, "svg"); svg.setAttribute("viewBox", "0 0 320 180"); svg.setAttribute("aria-hidden", "true"); view.appendChild(svg);
    // Text recipes always show their real After Effects render, for the side
    // the card is set to; a drawing remains only for a recipe with no render.
    const textMotion = preset.motion?.category.startsWith("text-") ? preset.motion : undefined;
    let reference = filmReference ?? (textMotion ? textReferenceFor(textMotion, previewOptions().direction) : undefined);
    let poster: HTMLImageElement | undefined;
    /** Until its first still or drawing is on it, a card shows a loading
     * skeleton instead of an empty black box. */
    const loaded = (): void => { delete view.dataset.loading; };
    /** The still is made once and never hidden; the shared player plays over it.
     * The first still goes on the card as soon as the card exists, loaded lazily
     * by the panel as it nears the view, so scrolling never meets an empty card.
     * A new still (another side) replaces the old one only once decoded, so the
     * card never shows an empty box. */
    const showPoster = (): void => {
      if (!reference) return;
      view.dataset.media = "true";
      const src = referenceBase + reference.poster;
      if (poster?.dataset.src === src) return;
      const next = doc.createElement("img"), previous = poster; poster = next;
      next.className = "ch-preset-media"; next.alt = ""; next.setAttribute("aria-hidden", "true"); next.dataset.src = src; next.decoding = "async";
      if (!previous) {
        next.loading = "lazy";
        next.addEventListener("load", loaded, { once: true }); next.addEventListener("error", loaded, { once: true });
        next.src = src; view.appendChild(next);
        return;
      }
      next.src = src;
      const place = (): void => { if (poster !== next || disposed) return; previous.parentNode?.removeChild(previous); view.appendChild(next); loaded(); };
      if (typeof next.decode === "function") void next.decode().then(place, place); else place();
    };
    const dropPoster = (): void => { cardWall.detach(view); poster?.parentNode?.removeChild(poster); poster = undefined; delete view.dataset.media; };
    view.dataset.loading = "true";
    const usesReference = (): boolean => {
      const next = filmReference ?? (textMotion ? textReferenceFor(textMotion, previewOptions().direction) : undefined);
      if (next !== reference) { cardWall.detach(view); reference = next; if (!reference) dropPoster(); }
      return Boolean(reference) && (Boolean(filmReference) || !overlay());
    };
    const path = (d: string, cls: string): void => { const n = doc.createElementNS(ns, "path"); n.setAttribute("d", d); n.setAttribute("class", cls); svg.appendChild(n); };
    function paint(seconds: number): void {
      clearNode(svg);
      if (preset.motion) { paintLibraryPreview(svg, preset.motion, previewOptions(), seconds, overlay()); return; }
      const time = Math.min(1, seconds), progress = curveProgress(preset.curve, time);
      if (preset.category === "ease") {
        const { x1, y1, x2, y2 } = preset.curve;
        path("M26 24V138H292", "ch-preset-guide");
        path(`M32 132C${32 + x1 * 256} ${132 - y1 * 100} ${32 + x2 * 256} ${132 - y2 * 100} 288 32`, "ch-preset-curve");
        const dot = doc.createElementNS(ns, "circle"); dot.setAttribute("cx", String(32 + time * 256)); dot.setAttribute("cy", String(132 - progress * 100)); dot.setAttribute("r", "6"); dot.setAttribute("class", "ch-preset-dot"); svg.appendChild(dot);
      } else {
        const id = String(preset.params.preset);
        for (const [cx, cy, z, size] of [[-800, 0, 800, 500], [0, 0, 0, 480], [650, 100, -400, 360]]) {
          const points = [[cx! - size! / 2, cy! - size! / 2, z!], [cx! + size! / 2, cy! - size! / 2, z!], [cx! + size! / 2, cy! + size! / 2, z!], [cx! - size! / 2, cy! + size! / 2, z!]];
          path(points.map((p, i) => `${i ? "L" : "M"}${cameraPoint(id, progress, p).join(" ")}`).join(" ") + "Z", z === 0 ? "ch-preset-subject" : "ch-preset-depth");
        }
      }
    }
    /** Artwork is on the card at its still frame, so playback can start with no build. */
    let ready = false, restKey = "", restTime = 0;
    const rest = (): void => {
      ready = true;
      if (usesReference()) { showPoster(); playReference(); return; }
      dropPoster(); loaded();
      const draft=previewOptions(),duration=draft.durationFrames/30,end=libraryPreviewEnd(draft);
      // The still frame is searched by painting and measuring candidates, which
      // is the costly part; the answer only changes with the card's settings.
      const key = `${overlay()}|${JSON.stringify(draft)}`;
      if (key === restKey) { svg.setAttribute("opacity", "1"); paint(restTime); return; }
      // A still frame should reveal the movement, rather than show every entrance at rest.
      const preferred=overlay()?duration*.25:preset.motion?.mode==="transition"
        ?draft.phase==="out"?end-duration*.65:duration*.65
        :preset.motion?1.4:.5;
      svg.setAttribute("opacity", "1");
      // Staggered text, blinks, delayed parts and cut transitions can be
      // invisible at that instant: walk forward to the first frame that shows
      // the subject (toward the exit start for Out), so no card looks empty.
      const candidates=[preferred];
      if(preset.motion){
        const from=overlay()?0:preset.motion.mode==="transition"&&draft.phase==="out"?end-duration:preferred;
        const to=overlay()?duration:preset.motion.mode==="transition"?(draft.phase==="out"?Math.max(0,end-duration*1.6):end):preferred+4;
        for(let k=1;k<=12;k++)candidates.push(from+(to-from)*k/12);
      }
      const motion=preset.motion;
      const shown=motion&&!overlay()?(time:number):boolean=>{const sample=librarySample(motion,draft,time,motion.category.startsWith("text-")?6:0,motion.category.startsWith("text-")?7:1);return sample.opacity>.4&&Math.abs(sample.sx)>.25&&Math.abs(sample.sy)>.25;}:undefined;
      paintFirstVisible(svg,candidates,time=>{restTime=time;paint(time);},shown);
      restKey = key;
    };
    function play(): void {
      if(disposed||doc.hidden||options.busy)return;
      panelActive=true;
      if(!intersections&&!visible.has(preset.id)){
        for(const id of visible)scenes.get(id)?.release();visible.clear();visible.add(preset.id);
      }
      if(reduced()){rest();return;}
      activePreview=preset.id;const scene=scenes.get(preset.id);if(scene)scene.start=performance.now();schedulePreviews();
    }
    view.dataset.previewId=preset.id;
    const drawAt = (elapsed: number): void => {
      const sample=overlay()?cameraPreviewPlayback(previewOptions(),elapsed):preset.motion?libraryPreviewPlayback(preset.motion,previewOptions(),elapsed):{time:elapsed%1.65,opacity:1};
      svg.setAttribute("opacity",String(sample.opacity));paint(sample.time);
    };
    // Releasing far cards frees their drawing; the small still stays, so a card
    // scrolled back never arrives empty.
    /** A visible text card plays with all the others (autoplay on); with autoplay
     * off only the selected card plays. Reduced motion keeps the still. */
    function playReference(): void {
      if (!reference || reduced() || (!autoplay() && nav.selectedId !== preset.id)) { cardWall.detach(view); return; }
      const spec = previewSpec(view, referenceBase + reference.video, referenceFps(reference), cardWidth(view));
      // A card still outside the view only decodes ahead, on its still: if it
      // played there, it arrived halfway through, often already leaving.
      if (intersections && !visible.has(preset.id)) {
        cardWall.detach(view);
        // Warming only; a clip that cannot decode shows its failure once attached.
        frameCache.get(spec, "ahead").catch(() => undefined);
        return;
      }
      cardWall.attach(view, spec);
      if (!canPlay()) cardWall.pause(view);
    }
    const scene = {view,rest,replay:()=>{if(usesReference()){showPoster();playReference();}},ready:()=>ready,pause:()=>cardWall.pause(view),release:()=>{ready=false;clearNode(svg);cardWall.detach(view);if(!poster)view.dataset.loading="true";},start:performance.now(),paint:(elapsed:number)=>{
      if (usesReference()) { showPoster(); playReference(); return; }
      dropPoster(); drawAt(elapsed);
    }};
    if (usesReference()) showPoster();
    return { scene, play };
  }
  /** Each allowed direction as a compact row, the way a variant list reads:
   * a click picks it and the card itself plays it. Diagonals, curve and the
   * rest stay in Edit. */
  function directionPicker(preset: GalleryPreset, p: MotionLibraryPreset, draft: MotionLibraryOptions): HTMLElement {
    const directions=createElement(doc,"div","ch-preset-directions");directions.setAttribute("role","group");directions.setAttribute("aria-label",pt?"Direção":"Direction");
    const items:HTMLElement[]=[];
    const choose=(direction:MotionLibraryOptions["direction"]):void=>{draft.direction=direction;for(const item of items)item.setAttribute("aria-pressed",String(item.dataset.direction===direction));syncDirectionBadge(preset);refreshPreview(preset);previewPlayers.get(preset.id)?.();};
    // A sweep in place that opens from the middle names its original start.
    const centred=libraryTextSweeps(p).length>0&&libraryTextOrder(p,"preset",p.text.unit)==="center-out";
    const order:readonly (readonly [MotionLibraryOptions["direction"],string])[]=[["preset",centred?(pt?"Do centro":"From centre"):"Original"],["bottom",pt?"De baixo":"From bottom"],["left",pt?"Da esquerda":"From left"],["right",pt?"Da direita":"From right"],["top",pt?"De cima":"From top"]];
    const allowed=order.filter(([direction])=>direction==="preset"||libraryDirectionAllowed(p,direction));
    const holder=createElement(doc,"div","ch-preset-direction-list");
    holder.setAttribute("aria-label",pt?"Todas as direções":"All directions");directions.appendChild(holder);
    for(const [direction,label] of allowed){
      const item=directionRow(direction,label,()=>choose(direction));
      items.push(item);holder.appendChild(item);
    }
    for(const item of items)item.setAttribute("aria-pressed",String(item.dataset.direction===draft.direction));
    return directions;
  }
  /** One direction as a compact list row. */
  function directionRow(direction: MotionLibraryOptions["direction"], label: string, onChoose: () => void): HTMLButtonElement {
    const row=button(doc,{label,disabled:options.busy,onClick:onChoose});row.className="ch-preset-direction-option";row.dataset.direction=direction;row.title=label;
    return row;
  }
  /** Shows the chosen side on the card, so a variant reads at a glance. */
  function syncDirectionBadge(preset: GalleryPreset, card?: HTMLElement | null): void {
    const host = card ?? Array.from(grid.querySelectorAll<HTMLElement>(".ch-preset-card")).find(node => node.id === preset.id);
    const badge = host?.querySelector<HTMLElement>(".ch-preset-direction-badge");
    if (!host || !badge || !preset.motion) return;
    const direction = settings(preset).direction, glyph = directionBadge(direction);
    badge.textContent = glyph ?? "";
    badge.hidden = !glyph;
    host.dataset.direction = direction;
  }
  function refreshPreview(preset?: GalleryPreset): void {
    if(!preset)return;
    const scene=scenes.get(preset.id);if(!scene)return;
    if(visible.has(preset.id))scene.rest();scene.start=performance.now();schedulePreviews();
  }
  function drawInspector(preset?: GalleryPreset): void {
    const sameSelection = inspector.dataset.preset === preset?.id;
    const focusedId = sameSelection && (inspector.contains?.(doc.activeElement) || settingsBody.contains?.(doc.activeElement)) ? (doc.activeElement as HTMLElement)?.id : "";
    inspector.dataset.preset = preset?.id ?? "";
    // Restore the persistent close button before replacing the body controls.
    settingsTabStops(true);
    disposeNumbers();clearNode(inspector); clearNode(settingsBody);
    primaryApply = undefined; phaseActions = undefined; clearNode(actions); actions.removeAttribute("data-phase-actions"); actions.removeAttribute("data-floating"); element.removeAttribute("data-phase-actions");
    editor.hidden = !preset;
    actions.hidden = false;
    if (!preset) { const placeholder=createPresetPhaseActions(doc,{locale:options.locale,onApply:()=>{}});for(const control of placeholder.controls.values())control.setDisabled(true,pt?"Selecione um preset.":"Select a preset.");actions.appendChild(placeholder.element); inspector.appendChild(createElement(doc, "p", "ch-preset-hint", pt ? "Escolha um preset para aplicar ou ajustar." : "Choose a preset to apply or adjust.")); selectionSummaryText(pt?"Selecione um preset":"Select a preset",options.context?.().hasComp===false?(pt?"Abra uma composição":"Open a composition"):""); return; }
    const presetId=preset.id;
    settingsTitle.textContent = preset.displayName[options.locale] ?? preset.id;
    // Lean box: name, badges and notes stay out; the card already shows them,
    // and an unmet requirement explains itself on the disabled Apply button.
    const primaryFields = createElement(doc, "div", "ch-preset-primary-fields"); inspector.appendChild(primaryFields);
    const p = preset.motion;
    const camera = preset.category === "camera-transitions";
    const overlay = camera && (Boolean(p?.cameraSpec || p?.filmSpec) || nav.cameraApplyMode !== "layers");
    if (p) {
      const draft = settings(preset);
      if (camera && !p.cameraSpec && !p.filmSpec) {
        const label=pt?"Aplicação":"Apply to";
        const row=selectField(doc,{id:`${galleryId}-camera-mode`,label,value:nav.cameraApplyMode??"precomp",disabled:options.busy,
          options:[{value:"precomp",label:pt?"Transição em pré-comp":"Precomp transition"},{value:"layers",label:pt?"Camadas selecionadas":"Selected layers"}],
          onChange:value=>{nav.cameraApplyMode=value==="layers"?"layers":"precomp";drawInspector(preset);previewPlayers.get(preset.id)?.();}});
        row.className+=" ch-preset-field ch-preset-field--select ch-camera-apply-mode";
        row.getElementsByTagName("select")[0]?.setAttribute("aria-label",label);
        inspector.appendChild(row);
      }
      // Before applying, the settings only choose how it moves: the direction
      // by sight and its character. Duration, intensity, curve, motion blur and
      // the rest live in Edit, on the applied preset.
      const adjustments = createElement(doc, "div", "ch-preset-adjustments");
      if (!overlay && libraryUsesDirection(p)) adjustments.appendChild(directionPicker(preset, p, draft));
      invalidNumbers.delete(presetId);
      settingsBody.appendChild(adjustments);

    } else inspector.appendChild(createElement(doc, "p", "ch-preset-hint", preset.category === "ease" ? pt ? "Selecione dois ou mais keyframes." : "Select two or more keyframes." : pt ? "Selecione uma câmera sem parent nem animação na propriedade." : "Select an unparented camera without keys on the target property."));
    if(!p) settingsBody.appendChild(button(doc,{label:preset.category==="ease"?(pt?"Editar curva":"Edit curve"):(pt?"Editar movimento":"Edit motion"),onClick:()=>{if(disposed)return;rememberScroll();options.edit(preset);}}));
    if (directPhaseApply(preset)) {
      actions.setAttribute("data-phase-actions", "true");
      phaseActions = createPresetPhaseActions(doc, {locale: options.locale, onApply: phase => applyPreset(preset,phase)});
      actions.appendChild(phaseActions.element);
    } else {
      primaryApply = createActionButton(doc, { id: "preset-primary-apply", label: overlay ? (pt ? "Criar transição" : "Create transition") : (pt ? "Aplicar preset" : "Apply preset"),
      variant: "primary", size: 28, onPress: () => { if (!disposed) applyPreset(preset); } });
      primaryApply.button.classList.add("ch-preset-primary-apply");
      primaryApply.element.classList.add("ch-preset-primary-action"); actions.appendChild(primaryApply.element);
    }
    // The lean transition inspector has no inline fields; do not leave its
    // empty bordered section between the cards and the application buttons.
    editor.hidden = inspector.children.length === 1 && primaryFields.children.length === 0;
    if(phaseActions&&editor.hidden){actions.setAttribute("data-floating","true");element.setAttribute("data-phase-actions","true");}
    updateContext();
    if(focusedId) doc.getElementById(focusedId)?.focus();
    if(settingsOpen)positionSettings();
    else settingsTabStops(false);
  }
  function updateContext(): void {
    if(isInsertFolder()){
      selectionSummaryText(pt ? "Elementos" : "Elements", options.context?.().hasComp ? (pt ? "Inserir na composição" : "Insert into composition") : (pt ? "Abra uma composição" : "Open a composition"));
      elementsView?.refresh();return;
    }
    const context = options.context?.();
    if(nav.category.startsWith("personal")){
      const selected=options.personal?.items.find(item=>item.id===nav.selectedId);
      const reason=selected?personalItemReason(selected):null;
      selectionSummaryText(selected?.name ?? (pt ? "Selecione um arquivo" : "Select a file"), reason ?? "");
      for(const control of Array.from(actions.getElementsByTagName("button"))){control.disabled=options.busy||Boolean(reason);control.title=reason??"";control.setAttribute("aria-disabled",String(control.disabled));}
      return;
    }
    const selected = GALLERY_PRESETS.find(preset => preset.id === nav.selectedId);
    const reason = !selected ? (pt ? "Selecione um preset" : "Select a preset") : !context ? null : !context.hasComp ? (pt ? "Abra uma composição" : "Open a composition")
      : selected?.category === "ease" && context.selectedKeys < 1 ? (pt ? "Selecione keyframes" : "Select keyframes")
      : context.selectionCount < 1 && (!selected?.category.startsWith("camera") || selected && directPhaseApply(selected)) ? (pt ? "Nenhuma camada selecionada" : "No layer selected")
      : selected?.motion ? requirementReason(motionLibraryRequirements(selected.motion), context, pt) : null;
    const visibleSelection = Boolean(selected && resultIndex.has(selected.id));
    const phaseError = applyFeedback?.phase && applyFeedback.presetId === selected?.id && applyFeedback.state === "error"
      ? applyFeedback.message : undefined;
    // Without a preset the name already asks for one: the status adds only a missing composition.
    selectionSummaryText(selected ? selected.displayName[i18n.locale()] ?? selected.id : (pt ? "Selecione um preset" : "Select a preset"),
      applying ? (pt ? "Aplicando…" : "Applying…") : !selected ? (context?.hasComp === false ? (pt ? "Abra uma composição" : "Open a composition") : "")
        : reason ?? phaseError ?? (!visibleSelection ? (pt ? "Seleção fora do filtro" : "Selection outside filter") : context ? `${context.selectionCount} ${pt ? context.selectionCount === 1 ? "camada selecionada" : "camadas selecionadas" : context.selectionCount === 1 ? "selected layer" : "selected layers"}` : ""));
    const target = actions.querySelector<HTMLElement>(".ch-preset-target");
    if (target) target.textContent = reason ?? (context ? `${context.selectionCount} ${context.selectionCount === 1 ? (pt ? "camada selecionada" : "selected layer") : (pt ? "camadas selecionadas" : "selected layers")}` : "");
    for (const control of Array.from(actions.getElementsByTagName("button"))) {
      control.disabled = options.busy || applying || Boolean(reason) || Boolean(selected && invalidNumbers.get(selected.id)?.size);
      control.setAttribute("aria-disabled", String(control.disabled));
      control.title = reason ?? "";
    }
    for (const [phase, control] of phaseActions?.controls ?? []) {
      const feedback = applyFeedback?.presetId === selected?.id && applyFeedback?.phase === phase ? applyFeedback : undefined;
      control.setState(feedback?.state ?? "default", feedback?.message);
      const unavailable = options.busy || applying || Boolean(reason) || Boolean(selected && invalidNumbers.get(selected.id)?.size);
      control.setDisabled(unavailable && feedback?.state !== "loading", options.busy || applying ? (pt ? "Aguarde a operação atual." : "Wait for the current operation.") : reason ?? (pt ? "Corrija os campos indicados." : "Correct the highlighted fields."));
    }
    if (primaryApply) {
      const feedback = applyFeedback?.presetId === selected?.id ? applyFeedback : undefined;
      primaryApply.setState(feedback?.state ?? "default", feedback?.message);
      const invalid = Boolean(selected && invalidNumbers.get(selected.id)?.size);
      const unavailable = options.busy || applying || Boolean(reason) || invalid;
      primaryApply.setDisabled(unavailable && feedback?.state !== "loading", options.busy || applying ? (pt ? "Aguarde a operação atual." : "Wait for the current operation.")
        : reason ?? (invalid ? (pt ? "Corrija os campos indicados." : "Correct the highlighted fields.") : undefined));
    }
  }

  function categoryMatches(preset: GalleryPreset): boolean {
    return galleryCategoryMatches(nav.category, preset);
  }
  function personalItemReason(item:PersonalPresetItem):string|null {
    const context=options.context?.(),kind=item.kind??"preset";
    if(!context||kind==="project")return null;
    if(!context.hasComp)return pt?"Abra uma composição":"Open a composition";
    if(kind==="preset"&&context.selectionCount<1)return pt?"Selecione uma camada":"Select a layer";
    return null;
  }
  function applyPersonalItem(item:PersonalPresetItem):void {
    if(disposed||options.busy||personalItemReason(item))return;
    cancelReveal();
    nav.selectedId = item.id;
    rememberScroll();
    options.applyPersonal?.(item.id);
  }
  function showAllPresets(): void {
    if (disposed) return;
    cancelReveal();
    clearTimeout(debounce);
    nav.query = ""; nav.category = "all"; nav.scope = "all"; nav.scroll = 0;
    delete nav.recentOrder;
    search.value = "";
    if (nav.selectedId && !GALLERY_PRESETS.some(preset => preset.id === nav.selectedId)) nav.selectedId = "";
    setFilters(false); draw(); focusSearch();
  }
  function emptyState(personal = false): HTMLElement {
    const noPersonalFiles = personal && !options.personal?.items.length && !normalizeSearch(nav.query);
    const description = noPersonalFiles ? "presets.empty.personal" : normalizeSearch(nav.query) || nav.category !== "all" ? "presets.empty.search"
      : nav.scope === "favorites" ? "presets.empty.favorites" : nav.scope === "recent" ? "presets.empty.recent" : "presets.empty.search";
    const addFolder = noPersonalFiles && Boolean(options.personalAction);
    const state = createEmptyState(doc, {
      icon: "search", title: i18n.t("presets.empty.title"), description: i18n.t(description),
      action: { label: i18n.t(addFolder ? "presets.addFolder" : "presets.showAll"), onClick: () => {
        if (addFolder) { if (!options.busy) options.personalAction?.("add"); }
        else showAllPresets();
      } }
    });
    if (addFolder && options.busy) state.getElementsByTagName("button")[0]!.disabled = true;
    return state;
  }
  function drawPersonal(): void {
    const catalog=options.personal;
    const header=createElement(doc,"div","ch-personal-heading");header.appendChild(createElement(doc,"span","",pt?"Minha biblioteca · arquivos locais":"My library · local files"));
    header.appendChild(button(doc,{label:pt?"Atualizar":"Refresh",disabled:options.busy,onClick:()=>options.personalAction?.("list")}));grid.appendChild(header);
    const selectedFolder=nav.category.substring("personal.".length);
    function contains(folderId:string):boolean {if(nav.category==="personal")return true;let id:string|null=folderId;for(let i=0;id&&i<10;i++){if(id===selectedFolder)return true;id=catalog?.folders.find(f=>f.id===id)?.parentId??null;}return false;}
    const items=(catalog?.items??[]).filter(item=>contains(item.folderId)&&normalizeSearch(item.name+" "+item.relativePath).includes(normalizeSearch(nav.query)));
    drawBrowserHeading(items.length);
    if(!items.length)grid.appendChild(emptyState(true));
    for(const item of items){
      const row=createElement(doc,"article","ch-personal-item");row.setAttribute("data-selected",String(nav.selectedId===item.id));
      const selectFile=button(doc,{label:item.name,onClick:()=>{if(disposed)return;cancelReveal();nav.selectedId=item.id;draw();}});selectFile.title=item.relativePath;selectFile.addEventListener("dblclick",()=>applyPersonalItem(item));row.appendChild(selectFile);
      selectFile.dataset.focusKey=`personal.${item.id}`;selectFile.setAttribute("aria-pressed",String(nav.selectedId===item.id));
      row.appendChild(createElement(doc,"span","ch-preset-hint",item.relativePath));grid.appendChild(row);
    }
    primaryApply = undefined; clearNode(actions);const selected=items.find(i=>i.id===nav.selectedId);
    actions.hidden=!selected;
    if(selected){
      const kind=selected.kind??"preset";
      if(options.previewPersonal&&(kind==="image"||kind==="audio"||kind==="video")){
        personalPreview=createPersonalMediaPreview(doc,{locale:options.locale,item:selected,load:options.previewPersonal});grid.appendChild(personalPreview.element);
      }
      const label=kind==="project"?(pt?"Importar projeto":"Import project"):kind==="preset"?(pt?"Aplicar .ffx":"Apply .ffx"):(pt?"Adicionar à composição":"Add to composition");
      actions.appendChild(createElement(doc,"span","ch-preset-selection-name",selected.name));actions.appendChild(button(doc,{label,disabled:options.busy||Boolean(personalItemReason(selected)),onClick:()=>applyPersonalItem(selected)}));
      grid.appendChild(createElement(doc,"p","ch-preset-hint",kind==="project"?(pt?"Importa o conteúdo no painel Projeto sem abrir outro projeto.":"Imports contents into the Project panel without opening a different project."):kind==="preset"?(pt?"Aplica às camadas selecionadas no tempo atual. Edite nos Controles do efeito.":"Applies to selected layers at the current time. Edit in Effect Controls."):(pt?"Adiciona a mídia à composição no tempo atual.":"Adds media to the composition at the current time.")));
    }
    if(catalog?.truncated)grid.appendChild(createElement(doc,"p","ch-preset-hint",pt?"Pasta grande: exibição limitada. Adicione uma subpasta para ver os demais arquivos.":"Large folder: limited results. Add a subfolder to see more files."));
    updateContext();
  }

  /** Elementos e Sons sao inseridos, nao aplicados a camadas. */
  function isInsertFolder(): boolean { return nav.category.startsWith("elements")||nav.category.startsWith("sounds"); }
  /** Elementos sao inseridos, nao aplicados a camadas: a pasta mostra a tela de insercao. */
  function drawElements(): void {
    drawBrowserHeading();
    if(!options.elements){grid.appendChild(emptyState());return;}
    if(nav.category.startsWith("sounds")){
      if(!options.sounds){grid.appendChild(emptyState());return;}
      const family=nav.category==="sounds"?undefined:nav.category.substring("sounds-".length) as SoundFamily;
      elementsView=createSoundLibrary(doc,{...options.sounds,i18n,family,query:nav.query,context:()=>({isComposition:Boolean(options.context?.().hasComp)})});
      grid.appendChild(elementsView.element);
      primaryApply=undefined;clearNode(actions);actions.hidden=false;actions.appendChild(elementsView.actions);
      return;
    }
    const kind=nav.category==="elements"?undefined:nav.category.substring("elements-".length) as ElementKind;
    elementsView=createElementsEditor(doc,{...options.elements,i18n,category:kind,query:nav.query,
      context:()=>({isComposition:Boolean(options.context?.().hasComp)})});
    grid.appendChild(elementsView.element);
    primaryApply=undefined;clearNode(actions);actions.hidden=false;actions.appendChild(elementsView.actions);
  }

  function createCard(preset: GalleryPreset) {
    const name = preset.displayName[i18n.locale()] ?? preset.id;
    const card = createElement(doc, "article", "ch-preset-card");
    card.id = preset.id;
    const { scene, play } = preview(preset);
    card.appendChild(scene.view);
    if (preset.motion && libraryUsesDirection(preset.motion)) {
      const badge = createElement(doc, "span", "ch-preset-direction-badge");
      badge.setAttribute("aria-hidden", "true");
      card.appendChild(badge);
    }
    if (preset.motion && motionLibraryRequirements(preset.motion).motionCore) {
      const core = createElement(doc, "span", "ch-preset-core-badge", "Core");
      core.title = pt ? "Precisa do plugin Moti.on Core instalado." : "Needs the Moti.on Core plugin installed.";
      card.appendChild(core);
    }
    const title = button(doc, { label: name });
    title.classList.add("ch-preset-apply");
    title.title = name;
    title.dataset.focusKey = `title.${preset.id}`;
    const adjust = button(doc, { label: "", disabled: options.busy });
    adjust.classList.add("ch-preset-settings-trigger");
    adjust.appendChild(createIcon(doc, "variants"));
    adjust.setAttribute("aria-haspopup", "dialog");
    adjust.setAttribute("aria-controls", settingsPanel.id);
    adjust.setAttribute("aria-label", `${pt ? "Variações" : "Variations"}: ${name}`);
    adjust.setAttribute("aria-expanded", "false");
    adjust.title = pt ? "Variações" : "Variations";
    adjust.dataset.focusKey = `adjust.${preset.id}`;
    const favorite = button(doc, { label: "" });
    favorite.classList.add("ch-preset-favorite");
    favorite.appendChild(createIcon(doc, "favorite"));
    favorite.dataset.focusKey = `favorite.${preset.id}`;
    const actions = createElement(doc, "div", "ch-preset-actions");
    actions.appendChild(title);
    actions.appendChild(adjust);
    actions.appendChild(favorite);
    card.appendChild(actions);
    return { card, scene, play, title, adjust, favorite, name, row: 0 };
  }

  function syncFavorite(view: ReturnType<typeof createCard>, marked: boolean): void {
    const text = i18n.t(marked ? "presets.unfavorite" : "presets.favorite", { name: view.name });
    view.favorite.setAttribute("aria-pressed", String(marked));
    view.favorite.setAttribute("aria-label", text);
    view.favorite.title = text;
  }

  function syncCard(preset: GalleryPreset, view: ReturnType<typeof createCard>, favorites: Set<string>): void {
    view.card.setAttribute("data-selected", String(nav.selectedId === preset.id));
    view.scene.view.setAttribute("aria-pressed", String(nav.selectedId === preset.id));
    const motion = preset.motion;
    const cut = preset.category === "camera-transitions" && (Boolean(motion?.cameraSpec || motion?.filmSpec) || nav.cameraApplyMode !== "layers");
    view.adjust.hidden = Boolean(motion && (cut || !libraryUsesDirection(motion)));
    syncDirectionBadge(preset, view.card);
    syncFavorite(view, favorites.has(preset.id));
  }

  function mountCard(preset: GalleryPreset, favorites: Set<string>): ReturnType<typeof createCard> {
    const view = cachedCards.get(preset.id) ?? createCard(preset);
    cachedCards.delete(preset.id);
    mountedCards.set(preset.id, view);
    syncCard(preset, view, favorites);
    scenes.set(preset.id, view.scene);
    previewPlayers.set(preset.id, view.play);
    if (intersections) {
      intersections.observe(view.scene.view);
      ahead?.observe(view.scene.view);
    } else if (visible.size < 2) {
      visible.add(preset.id);
      view.scene.rest();
    }
    return view;
  }

  function unmountCard(id: string, view: ReturnType<typeof createCard>): void {
    if (hoverCard === view.card) setHover(null);
    if (activePreview === id) activePreview = "";
    intersections?.unobserve?.(view.scene.view);
    ahead?.unobserve?.(view.scene.view);
    visible.delete(id);
    near.delete(id);
    leftAt.delete(id);
    clearCue(id);
    const queued = prepQueue.indexOf(id);
    if (queued >= 0) prepQueue.splice(queued, 1);
    view.scene.release();
    scenes.delete(id);
    previewPlayers.delete(id);
    view.card.parentNode?.removeChild(view.card);
    delete view.favorite.dataset.pop;
    mountedCards.delete(id);
    cachedCards.set(id, view);
    if (cachedCards.size > PRESET_CARD_CACHE_SIZE) cachedCards.delete(cachedCards.keys().next().value!);
  }

  function setRow(view: ReturnType<typeof createCard>, row: number): void {
    if (view.row === row) return;
    if (row) view.card.style.setProperty("grid-row-start", String(row));
    else view.card.style.removeProperty("grid-row-start");
    view.row = row;
  }

  function setRowTracks(tracks: string): void {
    if (rowTracks === tracks) return;
    rowTracks = tracks;
    if (tracks) grid.style.setProperty("grid-template-rows", tracks);
    else grid.style.removeProperty("grid-template-rows");
  }

  function measureCardLayout(favorites: Set<string>): CardLayout | undefined {
    if (!canMeasureGrid || !grid.clientWidth || !grid.clientHeight || !results.length) return undefined;
    // A previous wider layout can contain several cards assigned to the same
    // row. Let CSS place them automatically while measuring the new columns.
    for (const view of mountedCards.values()) setRow(view, 0);
    let sample = mountedCards.values().next().value;
    if (!sample) {
      sample = mountCard(results[0]!, favorites);
      grid.appendChild(sample.card);
    }
    const style = doc.defaultView!.getComputedStyle(grid);
    const columns = (style.gridTemplateColumns ?? "").trim().split(/\s+/);
    const rowHeight = sample.card.getBoundingClientRect().height;
    if (!rowHeight || !columns.every(column => Number.parseFloat(column) > 0 && column.endsWith("px"))) return undefined;
    return {
      columns: columns.length,
      rowHeight,
      rowGap: Number.parseFloat(style.rowGap) || 0,
      paddingTop: Number.parseFloat(style.paddingTop) || 0,
      paddingBottom: Number.parseFloat(style.paddingBottom) || 0
    };
  }

  function renderCardWindow(includeId?: string, refresh = false): void {
    if (!results.length) {
      for (const [id, view] of mountedCards) unmountCard(id, view);
      cardLayout = undefined;
      setRowTracks("");
      grid.removeAttribute("data-virtual");
      return;
    }
    let favorites: Set<string> | undefined;
    if (layoutDirty) {
      favorites = new Set(options.preferences.snapshot().favorites);
      cardLayout = measureCardLayout(favorites);
      layoutDirty = !cardLayout;
    }
    const layout = cardLayout;
    let start = 0;
    // Before attachment there is no geometry. Seed the grid without building
    // the catalog. Fall back to all results if a visible grid cannot be measured.
    let end = results.length;
    const wanted = new Map<string, number>();
    if (layout) {
      const { columns, rowHeight, rowGap, paddingTop, paddingBottom } = layout;
      const rowCount = Math.ceil(results.length / columns);
      setRowTracks(`repeat(${rowCount}, ${rowHeight}px)`);
      if (!grid.hasAttribute("data-virtual")) grid.setAttribute("data-virtual", "true");
      const stride = rowHeight + rowGap;
      const viewportHeight = grid.clientHeight;
      const maxTop = rowCount * stride - rowGap + paddingTop + paddingBottom - viewportHeight;
      const top = Math.min(grid.scrollTop, Math.max(0, maxTop)) - paddingTop;
      start = Math.max(0, Math.floor(top / stride) - PRESET_OVERSCAN_ROWS) * columns;
      end = Math.min(results.length, (Math.ceil((top + viewportHeight) / stride) + PRESET_OVERSCAN_ROWS) * columns);
      const focusedCardId = cardOf(doc.activeElement)?.id;
      const drawerCardId = !settingsPanel.hidden ? cardOf(editorTrigger)?.id : undefined;
      // Pin only the owning rows. A far-away draft or focused control must not
      // expand the mounted window to every row between it and the viewport.
      for (const id of [focusedCardId, drawerCardId, menuCardId, includeId]) {
        const index = id ? resultIndex.get(id) : undefined;
        if (index === undefined || (index >= start && index < end)) continue;
        const row = Math.floor(index / columns);
        for (let i = row * columns; i < Math.min(results.length, (row + 1) * columns); i++) wanted.set(results[i]!.id, i);
      }
    } else {
      setRowTracks("");
      grid.removeAttribute("data-virtual");
      if (canMeasureGrid && (!grid.clientWidth || !grid.clientHeight)) end = Math.min(results.length, 8);
      const index = includeId ? resultIndex.get(includeId) : undefined;
      if (index !== undefined) wanted.set(includeId!, index);
    }
    for (let i = start; i < end; i++) wanted.set(results[i]!.id, i);
    for (const [id, view] of mountedCards) if (!wanted.has(id)) unmountCard(id, view);
    const currentFocus = doc.activeElement as HTMLElement | null;
    let next = grid.firstChild;
    for (const index of [...wanted.values()].sort((a, b) => a - b)) {
      const preset = results[index]!;
      const existing = mountedCards.get(preset.id);
      if (!existing || refresh) favorites ??= new Set(options.preferences.snapshot().favorites);
      const view = existing ?? mountCard(preset, favorites!);
      if (existing && refresh) syncCard(preset, existing, favorites!);
      setRow(view, layout ? Math.floor(index / layout.columns) + 1 : 0);
      if (view.card !== next) grid.insertBefore(view.card, next);
      next = view.card.nextSibling;
    }
    // Moving an already focused node can blur it during a reorder.
    if (currentFocus && currentFocus !== doc.activeElement && grid.contains(currentFocus)) currentFocus.focus({ preventScroll: true });
    schedulePreviews();
  }

  function queueCardWindow(remeasure = false): void {
    if (remeasure) layoutDirty = true;
    if (disposed || !canMeasureGrid || windowFrame || !results.length) return;
    windowFrame = requestAnimationFrame(() => {
      windowFrame = 0;
      const reflow = layoutDirty;
      renderCardWindow();
      if (reflow) positionSettings();
    });
  }

  function toggleCardFavorite(preset: GalleryPreset): void {
    options.preferences.toggleFavorite(preset.id);
    if (nav.scope === "favorites") {
      draw();
      return;
    }
    const view = mountedCards.get(preset.id);
    if (!view) return;
    const marked = options.preferences.snapshot().favorites.includes(preset.id);
    syncFavorite(view, marked);
    if (marked) view.favorite.dataset.pop = "true";
    else delete view.favorite.dataset.pop;
  }
  function draw(): void {
    clearSearch.hidden = !search.value;
    personalPreview?.dispose();
    personalPreview = undefined;
    elementsView?.dispose();
    elementsView = undefined;
    if (nav.scope !== "recent") delete nav.recentOrder;
    scrollRestoreRevision++;
    if (scrollRestoreFrame) cancelAnimationFrame(scrollRestoreFrame);
    scrollRestoreFrame = 0;
    pendingScroll = nav.scroll;
    const focused = focusKey();
    closeEditor();
    if (settingsPanel.parentNode === grid) {
      settingsPanel.hidden = true;
      stowDrawer();
      attach(null);
    }
    closeContextMenu();
    drawLabelFilter();
    drawFolders();
    const personal = nav.category.startsWith("personal");
    const insert = isInsertFolder();
    const wasPersonal = grid.classList.contains("ch-preset-grid--personal");
    grid.classList.toggle("ch-preset-grid--personal", personal || insert);
    filters.hidden = personal || insert;
    if (personal || insert) {
      results = [];
      resultIndex.clear();
      renderCardWindow();
      clearNode(grid);
      drawInspector();
      if (personal) drawPersonal();
      else drawElements();
      restoreFocus(focused);
      restoreScroll();
      return;
    }
    if (wasPersonal) clearNode(grid);
    for (const node of Array.from(grid.children)) {
      if (node !== settingsPanel && !node.classList.contains("ch-preset-card")) grid.removeChild(node);
    }
    for (const b of Array.from(filters.querySelectorAll<HTMLButtonElement>("[data-scope]"))) {
      b.setAttribute("aria-pressed", String(nav.scope === b.dataset.scope));
    }
    const prefs = options.preferences.snapshot();
    // Applying records recency immediately. The saved browsing order still
    // points to the same preset when returning from Edit.
    if (nav.scope === "recent") nav.recentOrder ??= [...prefs.recent];
    const items = nav.scope === "recent"
      ? nav.recentOrder!.map(id => presetById.get(id)).filter((preset): preset is GalleryPreset => Boolean(preset))
      : GALLERY_PRESETS;
    const labelRoots = activeLabels().length ? labelledFolders(prefs.folderColors) : null;
    const favorites = new Set(prefs.favorites);
    const query = normalizeSearch(nav.query);
    results = items.filter(preset =>
      (!preset.motion?.retired || nav.scope === "favorites") &&
      categoryMatches(preset) &&
      (nav.scope !== "favorites" || favorites.has(preset.id)) &&
      (!labelRoots || labelRoots.some(id => galleryCategoryMatches(id, preset))) &&
      searchIndex.get(preset.id)!.includes(query)
    );
    resultIndex = new Map(results.map((preset, index) => [preset.id, index]));
    drawBrowserHeading(results.length);
    // Reset to the requested position before choosing the subset. If the new
    // results need more scroll extent, restoreScroll applies it after layout.
    if (nav.scroll === 0) grid.scrollTop = 0;
    layoutDirty = true;
    renderCardWindow(undefined, true);
    if (!results.length) grid.appendChild(emptyState());
    // Keep the selected preset and its draft even when the filter hides it.
    drawInspector(nav.selectedId ? presetById.get(nav.selectedId) : undefined);
    restoreFocus(focused);
    restoreScroll();
    if (layoutDirty) queueCardWindow();
  }

  grid.addEventListener("click", event => {
    const card = cardOf(event.target);
    const preset = card ? presetById.get(card.id) : undefined;
    const view = preset ? mountedCards.get(preset.id) : undefined;
    if (disposed || !preset || !view) return;
    const target = event.target as Node;
    if (view.adjust.contains(target) && !view.adjust.disabled) openEditor(preset, view.adjust);
    else if (view.favorite.contains(target)) toggleCardFavorite(preset);
    else if (view.scene.view.contains(target) || view.title.contains(target)) {
      cardClick(preset);
      view.play();
    }
  });
  grid.addEventListener("dblclick", event => {
    const card = cardOf(event.target);
    const preset = card ? presetById.get(card.id) : undefined;
    const view = preset ? mountedCards.get(preset.id) : undefined;
    if (!view || !preset || disposed || options.busy) return;
    const target = event.target as Node;
    if (view.scene.view.contains(target) || view.title.contains(target)) {
      cancelDeselect();
      applyPreset(preset);
    }
  });
  grid.addEventListener("contextmenu", event => {
    const card = cardOf(event.target);
    const preset = card ? presetById.get(card.id) : undefined;
    const view = preset ? mountedCards.get(preset.id) : undefined;
    if (!view || !preset || disposed) return;
    event.preventDefault();
    event.stopPropagation();
    openCardMenu(preset, view.adjust, event);
  });

  grid.addEventListener("keydown", event => {
    if (disposed || settingsOpen) return;
    const target = event.target as HTMLElement;
    const card = cardOf(target);
    const index = card ? resultIndex.get(card.id) : undefined;
    if (index === undefined || !card) return;
    if (event.key === "Tab" && cardLayout) {
      // Native Tab handles controls within the card. At the edge of a mounted
      // window, continue in catalog order even if the next card is offscreen.
      const view = mountedCards.get(card.id)!;
      const edge = event.shiftKey ? target === view.scene.view : target === view.favorite;
      const next = results[index + (event.shiftKey ? -1 : 1)];
      if (edge && next && !mountedCards.has(next.id)) {
        event.preventDefault();
        renderCardWindow(next.id);
        const neighbor = mountedCards.get(next.id)!;
        (event.shiftKey ? neighbor.favorite : neighbor.scene.view).focus();
        renderCardWindow();
      }
      return;
    }
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    if (!target.classList.contains("ch-preset-preview") && !target.classList.contains("ch-preset-apply")) return;
    if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      const preset = results[index]!, motion = preset.motion;
      event.preventDefault();
      if (!motion || !libraryUsesDirection(motion) || options.busy) return;
      const draft = settings(preset);
      draft.direction = cycleDirection(motion, draft.direction, event.key === "ArrowDown" ? 1 : -1);
      syncDirectionBadge(preset, card);
      if (nav.selectedId !== preset.id) select(preset);
      refreshPreview(preset);
      previewPlayers.get(preset.id)?.();
      return;
    }
    const columns = cardLayout?.columns ?? 1;
    const step = event.key === "ArrowUp" ? -columns : event.key === "ArrowDown" ? columns : event.key === "ArrowLeft" ? -1 : 1;
    const next = event.key === "Home" ? 0 : event.key === "End" ? results.length - 1 : Math.max(0, Math.min(results.length - 1, index + step));
    const preset = results[next]!;
    event.preventDefault();
    renderCardWindow(preset.id);
    const view = mountedCards.get(preset.id);
    if (!view) return;
    select(preset);
    view.scene.view.focus({ preventScroll: true });
    // Jump across a large gap immediately to keep keyboard focus visible.
    if (Math.abs(next - index) > columns || !scrollIntoViewSmooth(motionEnv, view.card, grid)) {
      view.card.scrollIntoView?.({ block: "nearest", inline: "nearest" });
      renderCardWindow();
    }
    rememberScroll();
  });
  grid.addEventListener("scroll", () => {
    if (disposed || grid.isConnected === false) return;
    quietScroll();
    queueCardWindow();
    if (pendingScroll === undefined || grid.scrollTop > 0) {
      nav.scroll = grid.scrollTop;
      if (pendingScroll !== undefined) pendingScroll = grid.scrollTop;
    }
    // The settings drawer is part of the grid and scrolls with it.
  });
  grid.addEventListener("focusout", () => queueCardWindow());
  const gridObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => queueCardWindow(true)) : null;
  gridObserver?.observe(grid);
  scroll.addEventListener("scroll", () => { if(filterButton.getAttribute("aria-expanded")==="true")setFilters(false); });
  const visibility = (): void => { if(doc.hidden)pausePreviews();else if(pointerInside)resumePreviews(); }; doc.addEventListener("visibilitychange", visibility);
  draw();
  return { element, updateContext, dispose() { if(disposed)return;releaseWorkspaceTabs();stopSizeScrub();commitSize();rememberScroll();personalPreview?.dispose();personalPreview=undefined;elementsView?.dispose();elementsView=undefined;disposeNumbers();clearTimeout(settingsTimer); libraryActions.dispose(); stopGridGlide(); stopSplitter(); gridObserver?.disconnect(); if(windowFrame)cancelAnimationFrame(windowFrame); cachedCards.clear(); savedTabStops.clear(); searchObserver?.disconnect(); disposed = true; scrollRestoreRevision++;if(scrollRestoreFrame)cancelAnimationFrame(scrollRestoreFrame);scrollRestoreFrame=0; cancelAnimationFrame(animationFrame);animationFrame=0;for(const scene of scenes.values())scene.release();scenes.clear();visible.clear();near.clear();prepQueue.length=0;cancelAnimationFrame(prepFrame);prepFrame=0;clearTimeout(leaveTimer);clearTimeout(mediaTimer);clearTimeout(hoverTimer);clearTimeout(intentTimer);clearTimeout(scrollTimer);frameCache.hold(false);cardWall.dispose();cancelDeselect();hoverCard=null;for(const timer of cueTimers.values())clearTimeout(timer);cueTimers.clear();leftAt.clear();previewPlayers.clear();window.removeEventListener("blur",pausePreviews);window.removeEventListener("focus",windowFocus);intersections?.disconnect();ahead?.disconnect();motionObserver?.disconnect(); clearTimeout(debounce); observer?.disconnect(); window.removeEventListener("resize", resize);window.removeEventListener("resize", closeFolderMenu); closeContextMenu(); doc.removeEventListener("mousedown", outside); doc.removeEventListener("keydown", escape); doc.removeEventListener("visibilitychange", visibility); } };
}
