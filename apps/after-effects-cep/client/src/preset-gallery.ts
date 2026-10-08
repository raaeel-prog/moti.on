import { attachScrubbableNumber, button, createActionButton, type ActionButtonController, clearNode, createElement, createIcon, createBadge, createEmptyState, createI18n, searchField, selectField, type PanelPreferences } from "@motion/ui-core";
import { MOTION_LIBRARY_PRESETS, MOTION_LIBRARY_DEFAULTS, motionLibraryRequirements, type MotionLibraryRequirements, type MotionLibraryPreset, type MotionLibraryOptions, type PersonalPresetCatalog, type PersonalPresetItem, type PersonalPresetPreview, type PresetDefinitionV1, type QuickContext } from "@motion/contracts";
import { paintLibraryPreview, libraryPreviewPlayback, libraryPreviewEnd, cameraPreviewPlayback } from "./motion-library-preview.js";
import { createPersonalMediaPreview } from "./personal-media-preview.js";
import { normalizeSearch } from "./quick-library.js";

export function presetEasingChoices(locale:string):[string,string][] {
  const pt=locale==="pt-BR";
  return [["preset",pt?"Original":"Original"],["smooth",pt?"Suave":"Smooth"],["cubic",pt?"Acelerada":"Cubic"],["silk",pt?"Sedosa":"Silk"],["glide",pt?"Deslizante":"Glide"],["velvet",pt?"Aveludada":"Velvet"],["drift",pt?"Cauda longa":"Drift"],["snap",pt?"Precisa":"Snap"],["overshoot",pt?"Ultrapassagem":"Overshoot"],["bounce",pt?"Salto":"Bounce"],["spring",pt?"Elástica":"Spring"],["flicker",pt?"Intermitente":"Flicker"]];
}
let gallerySequence = 0;
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

/** One phase selector shared by Browse, Edit, and the copied preset. */
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

export const GALLERY_PRESETS: GalleryPreset[] = [
  ...[...MOTION_LIBRARY_PRESETS].sort((a, b) => {
    const rank = (p: MotionLibraryPreset): number => p.collection === "premium" ? (p.cameraSpec ? 1 : 0) : p.collection === "signature" ? 1.5 : p.collection === "studio" ? 2 : 3;
    return rank(a) - rank(b);
  }).map((motion): GalleryPreset => {
    const transition = motion.id.startsWith("camera-");
    const handler = transition ? "ae.presets.camera-transition" : motion.mode==="transition"?"ae.presets.phase-apply":"ae.presets.apply";
    const defaults = defaultLibraryOptions(motion);
    const params = transition ? { presetId: motion.id, durationFrames: defaults.durationFrames, intensity: defaults.intensity } : { presetId: motion.id, ...defaults };
    return {
    id: `builtin.motion.${motion.id}`, version: "1.0.0", displayName: motion.name,
    category: motion.id.startsWith("camera-") ? "camera-transitions" : motion.category, hosts: ["after-effects"], minHostVersion: { "after-effects": "25.0" },
    requirements: [transition ? "active-composition" : motion.category.startsWith("text-") ? "selected-text-layers" : "selected-visual-layers"],
    operationPlan: { command: handler, args: params },
    tags: `${motion.collection ?? ""} ${motion.family ?? ""} ${motion.tempo?.character ?? ""} ${motion.category} ${motion.easing} ${motion.effect} ${motion.waveform} ${motion.choreography?.path ?? ""} ${motion.choreography?.distribution ?? ""} ${motion.name["pt-BR"]} ${motion.name["en-US"]}`,
    curve: cameraCurve, preview: { renderer: "motion", fixtureId: `${motion.id}-v1` },
    handler, applyMode: transition ? "precomp" : "layers", reapplyPolicy: "adjust-managed", motion, params
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

/** Saved collection IDs remain stable when their visible labels improve. */
export function galleryCategoryMatches(category: string, preset: GalleryPreset): boolean {
  if (category === "camera-impact") return Boolean(preset.motion?.cameraSpec?.impact);
  if (category === "signature") return preset.motion?.collection === "signature";
  if (category.startsWith("signature-")) return preset.motion?.collection === "signature" && preset.motion.family === category.substring("signature-".length);
  if (category === "premium") return preset.motion?.collection === "premium";
  if (category.startsWith("premium-")) return preset.motion?.collection === "premium" &&
    (category === "premium-camera" ? preset.category === "camera-transitions" : preset.category.startsWith(category === "premium-text" ? "text-" : "motion-") && preset.category !== "camera-transitions");
  return category === "all" || category === "animation" && Boolean(preset.motion) && !preset.category.startsWith("camera") ||
    category === "motion" && preset.category.startsWith("motion-") || category === "text" && preset.category.startsWith("text-") ||
    category === "studio" && preset.motion?.collection === "studio" || category === "gemini" && preset.motion?.collection === "gemini" ||
    category === "classics" && Boolean(preset.motion) && preset.motion?.collection !== "premium" && preset.motion?.collection !== "signature" ||
    category === "camera" && preset.category.startsWith("camera") || category === "camera-moves" && preset.category === "camera" || preset.category === category;
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
  cameraApplyMode?: "precomp" | "layers";
}

export function createPresetGallery(doc: Document, options: {
  locale: string; preferences: PanelPreferences; busy: boolean;
  navigation: PresetNavigation;
  revealId?: string | undefined;
  apply(preset: GalleryPreset, settings?: MotionLibraryOptions, mode?: "precomp" | "layers"): void;
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
}): { element: HTMLElement; updateContext(): void; dispose(): void } {
  const i18n = createI18n({ locale: options.locale });
  const pt = i18n.locale() === "pt-BR", nav = options.navigation;
  let primaryApply: ActionButtonController | undefined;
  nav.drafts ??= {};
  // Curve editing belongs to Suavização. Keep user curve libraries untouched.
  if (nav.category === "ease") nav.category = "all";
  if (nav.selectedId?.startsWith("builtin.ease.")) nav.selectedId = "";
  if (nav.pendingRevealId?.startsWith("builtin.ease.")) delete nav.pendingRevealId;
  const requestedPreset = GALLERY_PRESETS.find(preset => preset.id === options.revealId);
  if (requestedPreset) {
    const prefs = options.preferences.snapshot();
    const categoryVisible = galleryCategoryMatches(nav.category, requestedPreset);
    const queryVisible = normalizeSearch(`${requestedPreset.displayName[i18n.locale()] ?? requestedPreset.id} ${requestedPreset.tags}`).includes(normalizeSearch(nav.query));
    const scopeVisible = nav.scope === "favorites" ? prefs.favorites.includes(requestedPreset.id) : nav.scope === "recent" ? (nav.recentOrder ?? prefs.recent).includes(requestedPreset.id) : true;
    if (nav.selectedId !== requestedPreset.id || !categoryVisible || !queryVisible || !scopeVisible) {
      // The panel can remount before its two layout frames. Keep the request in
      // session navigation until a mounted gallery actually reveals the card.
      nav.pendingRevealId = requestedPreset.id;
      if (!categoryVisible) nav.category = "all";
      if (!queryVisible) nav.query = "";
      if (!scopeVisible) nav.scope = "all";
    }
    nav.selectedId = requestedPreset.id;
  }
  function cancelReveal(): void { delete nav.pendingRevealId; }
  const labels: Record<string, string> = {
    all: pt ? "Todos os presets" : "All presets", studio: pt ? "Suaves e editoriais" : "Soft and editorial", "motion-2d": "Motion · 2D", "motion-3d": "Motion · 3D",
    "motion-effects": pt ? "Motion · Efeitos" : "Motion · Effects", "text-characters": pt ? "Texto · Caracteres" : "Text · Characters",
    "text-words": pt ? "Texto · Palavras" : "Text · Words", "text-lines": pt ? "Texto · Linhas" : "Text · Lines",
    "text-effects": pt ? "Texto · Efeitos" : "Text · Effects", ease: pt ? "Curvas" : "Curves", camera: pt ? "Câmera" : "Camera",
    text: pt ? "Tipografia" : "Typography", motion: "Motion", transitions: pt ? "Transições" : "Transitions"
  };
  const galleryId=`preset-gallery-${++gallerySequence}`;
  const invalidNumbers=new Map<string,Map<string,string>>();
  let personalPreview:ReturnType<typeof createPersonalMediaPreview>|undefined;
  const element = createElement(doc, "div", "ch-preset-gallery");
  const scroll = createElement(doc, "div", "ch-preset-scroll");
  const toolbar = createElement(doc, "div", "ch-quick-toolbar ch-preset-toolbar-approved"); element.appendChild(toolbar);
  const filterButton = button(doc, { label: "", onClick: () => setFilters(filterButton.getAttribute("aria-expanded") !== "true") });
  filterButton.className += " ch-preset-filter-trigger";
  const collectionIcon = createIcon(doc, "presets");
  (collectionIcon.firstChild as Element | null)?.setAttribute("d", "M2 5l7-3 7 3-7 3-7-3ZM2 9l7 3 7-3M2 13l7 3 7-3");
  filterButton.appendChild(collectionIcon);
  const filterLabel = createElement(doc, "span", "", labels[nav.category] ?? labels.all);
  filterButton.appendChild(filterLabel);
  filterButton.appendChild(createElement(doc, "span", "ch-library-chevron"));
  filterButton.setAttribute("aria-expanded", "false");
  filterButton.setAttribute("aria-label", pt ? "Filtrar presets" : "Filter presets");
  toolbar.appendChild(filterButton);
  const filterMenu = createElement(doc, "div", "ch-preset-filter-menu");
  filterMenu.id = `${galleryId}-filters`; filterMenu.hidden = true;
  filterMenu.setAttribute("data-motion", "surface-morph");
  filterMenu.setAttribute("aria-label", pt ? "Filtros de presets" : "Preset filters");
  filterMenu.setAttribute("role", "region");
  filterButton.setAttribute("aria-controls", filterMenu.id);
  let filterTimer: ReturnType<typeof setTimeout> | undefined;
  function setFilters(open: boolean): void {
    clearTimeout(filterTimer);
    if(open) closeEditor();
    filterButton.setAttribute("aria-expanded", String(open));
    filterMenu.setAttribute("aria-hidden", String(!open));
    if (open) { filterMenu.hidden = false; void filterMenu.offsetWidth; filterMenu.setAttribute("data-open", "true"); filterMenu.querySelector<HTMLButtonElement>("button")?.focus(); }
    else { filterMenu.setAttribute("data-open", "false"); filterTimer = setTimeout(() => { filterMenu.hidden = true; }, 200); }
  }
  element.appendChild(filterMenu);
  const searchControl=searchField(doc,{id:`${galleryId}-search`,label:pt?"Buscar preset":"Find a preset",placeholder:pt?"Buscar preset":"Find a preset",value:nav.query,
    onInput(value){if(disposed)return;cancelReveal();nav.query=value;nav.scroll=0;pendingScroll=0;clearTimeout(debounce);debounce=window.setTimeout(()=>{if(!disposed)draw();},250);}});
  searchControl.className+=" ch-preset-search";
  const search=searchControl.getElementsByTagName("input")[0]!;
  search.setAttribute("aria-label",pt?"Buscar preset":"Find a preset");
  const syncSearch = (): void => { toolbar.setAttribute("data-search-expanded", searchControl.getAttribute("data-expanded") ?? "false"); };
  const searchObserver = typeof MutationObserver !== "undefined" ? new MutationObserver(syncSearch) : null;
  searchObserver?.observe(searchControl, {attributes:true,attributeFilter:["data-expanded"]}); syncSearch();
  const filters = createElement(doc, "div", "ch-preset-filters");
  for (const scope of ["favorites", "recent"]) {
    const b = button(doc, { label: pt ? scope === "favorites" ? "Favoritos" : "Recentes" : scope === "favorites" ? "Favorites" : "Recent", onClick: () => { if(disposed)return; cancelReveal(); nav.scope = nav.scope === scope ? "all" : scope; delete nav.recentOrder; b.setAttribute("aria-pressed", String(nav.scope === scope)); draw(); } });
    b.dataset.scope = scope; b.setAttribute("aria-pressed", String(nav.scope === scope)); filters.appendChild(b);
  }
  filterMenu.appendChild(filters);
  const browser = createElement(doc, "div", "ch-preset-browser"); scroll.appendChild(browser);
  const categories = createElement(doc, "nav", "ch-preset-categories"); categories.setAttribute("aria-label", pt ? "Categorias de presets" : "Preset categories"); filterMenu.appendChild(categories);
  function focusKey(): string | undefined { return (doc.activeElement as HTMLElement | null)?.dataset?.focusKey; }
  function restoreFocus(key?: string): void {
    if (!key) return;
    const target = Array.from(element.querySelectorAll<HTMLElement>("[data-focus-key]")).find(node => node.dataset.focusKey === key);
    if (target) target.focus();
    else focusSearch();
  }
  function focusSearch(): void {
    searchControl.getElementsByTagName("button")[0]?.click();
    search.focus();
  }
  type FolderNode = {id: string; label: string; children?: FolderNode[]; rootId?: string};
  const folders: FolderNode[] = [
    {id: "signature", label: "Signature", children: [
      {id:"signature-essentials",label:pt?"Entrada e saída":"In & out"},{id:"signature-cinema",label:"Cinema"},
      {id:"signature-light-matter",label:pt?"Luz e matéria":"Light & matter"},{id:"signature-variation",label:pt?"Variação":"Variation"}]},
    {id: "text", label: pt ? "Tipografia" : "Typography", children: [
      {id:"text-characters",label:pt?"Caracteres":"Characters"},{id:"text-words",label:pt?"Palavras":"Words"},
      {id:"text-lines",label:pt?"Linhas":"Lines"},{id:"text-effects",label:pt?"Efeitos de texto":"Text effects"}]},
    {id: "motion", label: "Motion", children: [
      {id:"motion-2d",label:pt?"Transições 2D":"2D transitions"}, {id:"motion-3d",label:pt?"Transições 3D":"3D transitions"}, {id:"motion-effects",label:pt?"Efeitos":"Effects"}]},
    {id:"transitions",label:pt?"Transições":"Transitions",children:[{id:"camera-transitions",label:pt?"Transições de corte":"Cut transitions"},{id:"camera-impact",label:pt?"Impacto e tremor":"Impact & shake"},{id:"camera-moves",label:pt?"Movimentos 3D":"3D movements"}]},
    {id:"all",label:labels.all!},
    {id:"personal",label:pt?"Minha biblioteca":"My library",children:[]}
  ];
  function personalFolders(parentId: string | null, rootId: string): FolderNode[] {
    return (options.personal?.folders ?? []).filter(f => f.rootId === rootId && f.parentId === parentId).map(f => ({id:`personal.${f.id}`,label:f.name,rootId,children:personalFolders(f.id,rootId)}));
  }
  folders[folders.length - 1]!.children = (options.personal?.roots ?? []).flatMap(root => root.missing
    ? [{id:`personal.${root.id}`, label:`${root.name} · ${pt?"indisponível":"unavailable"}`, rootId:root.id}]
    : personalFolders(null,root.id));
  let colorFolder = "";
  function drawFolders(): void {
    const focused = doc.activeElement?.closest?.(".ch-preset-categories") === categories ? focusKey() : undefined;
    const scroll = categories.scrollTop; clearNode(categories);
    const prefs = options.preferences.snapshot();
    const colorLabels = pt ? ["Vermelho","Laranja","Amarelo","Verde","Ciano","Azul","Roxo","Rosa"] : ["Red","Orange","Yellow","Green","Cyan","Blue","Purple","Pink"];
    function branch(node: FolderNode, depth: number, inherited = ""): void {
      const row = createElement(doc,"div","ch-folder-row"); row.style.paddingLeft = `${depth * 10}px`;
      row.dataset.depth=String(depth);
      row.dataset.selected=String(nav.category===node.id);
      const color = prefs.folderColors[node.id] || inherited; if(color) row.dataset.color=color;
      const expanded = !prefs.collapsedFolders.includes(node.id);
      const toggle = button(doc,{label:node.children?.length ? expanded?"▾":"▸":"",onClick:()=>{options.preferences.toggleFolder(node.id);drawFolders();}});
      toggle.className="ch-folder-toggle"; toggle.disabled=!node.children?.length;
      toggle.dataset.focusKey=`toggle.${node.id}`;
      toggle.setAttribute("aria-label",`${expanded?(pt?"Recolher":"Collapse"):(pt?"Expandir":"Expand")} ${node.label}`);
      if(node.children?.length)toggle.setAttribute("aria-expanded",String(expanded));row.appendChild(toggle);
      const selectFolder = button(doc,{label:"",onClick:()=>{if(disposed)return;cancelReveal();nav.category=node.id;nav.scroll=0;setFilters(false);filterButton.focus();draw();}});
      selectFolder.dataset.category=node.id;selectFolder.className="ch-folder-select";
      selectFolder.dataset.focusKey=`folder.${node.id}`;
      selectFolder.appendChild(createElement(doc,"span","ch-folder-icon"));selectFolder.appendChild(createElement(doc,"span","ch-folder-name",node.label));
      selectFolder.title=node.label; selectFolder.setAttribute("aria-pressed",String(nav.category===node.id));row.appendChild(selectFolder);
      const more = button(doc,{label:"…",onClick:()=>{colorFolder=colorFolder===node.id?"":node.id;drawFolders();}});
      more.className="ch-folder-more";more.setAttribute("aria-label",`${pt?"Etiqueta e opções":"Label and options"}: ${node.label}`);more.setAttribute("aria-expanded",String(colorFolder===node.id));row.appendChild(more);categories.appendChild(row);
      more.dataset.focusKey=`more.${node.id}`;
      if(colorFolder===node.id){
        const palette=createElement(doc,"div","ch-folder-palette");palette.setAttribute("role","group");palette.setAttribute("aria-label",pt?"Cor da etiqueta":"Label color");
        for(const [i,c] of ["red","orange","yellow","green","cyan","blue","purple","pink"].entries()){
          const swatch=button(doc,{label:prefs.folderColors[node.id]===c?"✓":"",onClick:()=>{options.preferences.setFolderColor(node.id,c);colorFolder="";drawFolders();restoreFocus(`more.${node.id}`);}});
          swatch.dataset.color=c;swatch.title=colorLabels[i]!;swatch.setAttribute("aria-label",colorLabels[i]!);swatch.setAttribute("aria-pressed",String(prefs.folderColors[node.id]===c));palette.appendChild(swatch);
        }
        palette.appendChild(button(doc,{label:pt?"Sem etiqueta":"No label",onClick:()=>{options.preferences.setFolderColor(node.id,"");colorFolder="";drawFolders();restoreFocus(`more.${node.id}`);}}));
        if(node.rootId&&node.id===`personal.${node.rootId}`)palette.appendChild(button(doc,{label:pt?"Remover da biblioteca":"Remove from library",onClick:()=>options.personalAction?.("remove",node.rootId)}));
        categories.appendChild(palette);
      }
      if(expanded)for(const child of node.children??[])branch(child,depth+1,color);
      if(node.id==="personal"){
        const add=button(doc,{label:pt?"+ Adicionar pasta":"+ Add folder",disabled:options.busy||!options.personalAction,onClick:()=>options.personalAction?.("add")});add.className="ch-folder-add";categories.appendChild(add);
      }
    }
    for(const node of folders)branch(node,0);categories.scrollTop=scroll;restoreFocus(focused);
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
  const grid = createElement(doc, "div", "ch-preset-grid"); stage.appendChild(grid);
  const editor = createElement(doc, "section", "ch-preset-editor"); editor.hidden = false; editor.setAttribute("aria-label", pt ? "Ajustes do preset" : "Preset settings"); stage.appendChild(editor);
  const editorHeader = createElement(doc, "div", "ch-preset-editor-header");
  editorHeader.appendChild(createElement(doc, "span", "", pt ? "Ajustes do preset" : "Preset settings"));
  editorHeader.appendChild(button(doc, {label: pt ? "Fechar" : "Close", onClick: () => closeEditor(true)})); editor.appendChild(editorHeader);
  const numericCleanups:Array<()=>void>=[];
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
  auto.classList.add("ch-preset-autoplay","ch-preset-toolbar-action");auto.appendChild(createIcon(doc,"presets"));toolbar.appendChild(auto);toolbar.appendChild(searchControl);
  // Thumbnail size shares the catalog toolbar rather than owning a row.
  const footer = createElement(doc, "div", "ch-preset-footer ch-preset-preview-controls"); toolbar.appendChild(footer);
  const sizeLabel=createElement(doc,"label","ch-preset-size");sizeLabel.title=pt?"Miniaturas":"Thumbnails";sizeLabel.appendChild(createElement(doc,"span","",pt?"Miniaturas":"Thumbnails"));
  const size=doc.createElement("input");size.type="range";size.min="140";size.max="320";size.step="20";size.value=String(options.preferences.snapshot().presetSize);size.setAttribute("aria-label",pt?"Tamanho das miniaturas":"Thumbnail size");
  size.addEventListener("input",()=>{options.preferences.setPresetSize(Number(size.value));grid.style.setProperty("--preview-size",`${size.value}px`);});sizeLabel.appendChild(size);footer.appendChild(sizeLabel);
  element.appendChild(scroll);element.appendChild(actions);element.appendChild(settingsPanel);
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
      grid.scrollTop = pendingScroll ?? nav.scroll;
      if (revealId && nav.pendingRevealId === revealId) {
        const card = Array.from(grid.querySelectorAll<HTMLElement>(".ch-preset-card")).find(node => node.id === revealId);
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
    };
    if ((pendingScroll ?? 0) <= 0 && !revealId) { finish(); return; }
    scrollRestoreFrame = requestAnimationFrame(() => {
      if (disposed || revision !== scrollRestoreRevision) return;
      scrollRestoreFrame = requestAnimationFrame(finish);
    });
  }
  let editorTrigger: HTMLElement | null = null;
  const previewPlayers = new Map<string, () => void>();
  const scenes = new Map<string,{view:HTMLElement; paint:(time:number)=>void; rest:()=>void; release:()=>void; start:number}>();
  const visible = new Set<string>(); let activePreview="", animationFrame=0,lastPaint=0,paintCost=0;
  // CEP can remain visible while the editor or another app owns focus. Hidden
  // alone is insufficient: stop on both native window blur and panel exit.
  let panelActive = typeof doc.hasFocus === "function" ? doc.hasFocus() : true, pointerInside=false;
  const reduced = (): boolean => doc.documentElement.getAttribute("data-reduced-motion") === "true";
  const canPlay = (): boolean => panelActive && !disposed && !doc.hidden && !options.busy && !reduced();
  function playingId(): string {
    if(activePreview && visible.has(activePreview))return activePreview;
    if(!options.preferences.snapshot().presetAutoplay)return "";
    if(nav.selectedId && visible.has(nav.selectedId))return nav.selectedId;
    return visible.values().next().value ?? "";
  }
  const intersections = typeof IntersectionObserver !== "undefined" ? new IntersectionObserver(entries=>{
    for(const entry of entries){
      const id=(entry.target as HTMLElement).dataset.previewId!,scene=scenes.get(id);
      if(disposed||scene?.view!==entry.target)continue;
      if(entry.isIntersecting){if(!visible.has(id)){visible.add(id);scene?.rest();if(scene)scene.start=performance.now();}}
      else {visible.delete(id);if(activePreview===id)activePreview="";scene?.release();}
    }
    if(!playingId()){cancelAnimationFrame(animationFrame);animationFrame=0;}
    schedulePreviews();
  },{root:grid,threshold:0.05}) : null;
  function schedulePreviews(): void {
    if(animationFrame||!canPlay()||!playingId())return;
    animationFrame=requestAnimationFrame(tickPreviews);
  }
  function tickPreviews(now:number): void {
    animationFrame=0;
    if(!canPlay())return;
    const id=playingId(),scene=scenes.get(id);
    if(!scene)return;
    // Only one preview animates; a full library must never multiply SVG/filter
    // work. It follows the display rate and halves it, on a steady cadence,
    // when a frame's rebuild is expensive (heavy filters in an older CEP).
    const interval=paintCost>8?1000/30:1000/60;
    if(now-lastPaint>=interval-2){
      lastPaint=now;const started=performance.now();
      scene.paint((now-scene.start)/1000);
      paintCost=paintCost*.8+(performance.now()-started)*.2;
    }
    schedulePreviews();
  }
  function pausePreviews(): void {
    panelActive=false;cancelAnimationFrame(animationFrame);animationFrame=0;activePreview="";
    // Keep the last visible frame; do not rebuild every SVG when focus changes.
  }
  function resumePreviews(): void {
    if(disposed||doc.hidden)return;
    panelActive=true;lastPaint=0;
    for(const id of visible){const scene=scenes.get(id);if(scene)scene.start=performance.now();}
    schedulePreviews();
  }
  function restartPreviews(): void {
    cancelAnimationFrame(animationFrame);animationFrame=0;activePreview="";
    for(const id of visible){const scene=scenes.get(id);scene?.rest();if(scene)scene.start=performance.now();}
    schedulePreviews();
  }
  const enterPanel=():void=>{pointerInside=true;if(typeof doc.hasFocus!=="function"||doc.hasFocus())resumePreviews();};
  const leavePanel=():void=>{pointerInside=false;pausePreviews();};
  const windowFocus=():void=>{if(pointerInside)resumePreviews();};
  element.addEventListener("mouseenter",enterPanel);element.addEventListener("mouseleave",leavePanel);
  element.addEventListener("mousedown",resumePreviews);element.addEventListener("focusin",resumePreviews);
  window.addEventListener("blur",pausePreviews);window.addEventListener("focus",windowFocus);
  const motionObserver=typeof MutationObserver!=="undefined"?new MutationObserver(restartPreviews):null;
  motionObserver?.observe(doc.documentElement,{attributes:true,attributeFilter:["data-reduced-motion"]});
  function positionSettings(): void {
    if(!settingsOpen || !editorTrigger)return;
    const box = editorTrigger.getBoundingClientRect();
    const width = doc.documentElement.clientWidth || 360;
    const height = doc.documentElement.clientHeight || doc.defaultView?.innerHeight || 640;
    const panelWidth = Math.min(280, width - 16);
    const panelHeight = Math.min(settingsPanel.scrollHeight || 320, height - 96);
    const below = height - box.bottom - 48, above = box.top - 8;
    const opensAbove = below < Math.min(panelHeight, 180) && above > below;
    const top = opensAbove ? Math.max(8,box.top-panelHeight-6) : Math.min(box.bottom+6,Math.max(8,height-128));
    settingsPanel.style.left = `${Math.max(8,Math.min(box.right-panelWidth,width-panelWidth-8))}px`;
    settingsPanel.style.top = `${top}px`;
    settingsPanel.style.width = `${panelWidth}px`;
    settingsPanel.style.maxHeight = `${Math.max(80, Math.min(panelHeight,height-top-48))}px`;
    settingsPanel.setAttribute("data-side", opensAbove ? "above" : "below");
  }
  function closeEditor(restoreFocus = false): void {
    if(!settingsOpen && settingsPanel.hidden)return;
    settingsOpen=false; clearTimeout(settingsTimer);
    settingsPanel.setAttribute("data-open", "false"); settingsPanel.setAttribute("aria-hidden", "true");
    settingsTabStops(false); editorTrigger?.setAttribute("aria-expanded", "false");
    if (restoreFocus) editorTrigger?.focus();
    const reduce = reduced() || doc.defaultView?.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if(reduce)settingsPanel.hidden=true;
    else settingsTimer=setTimeout(()=>{settingsPanel.hidden=true;},200);
  }
  function openEditor(preset: GalleryPreset, trigger: HTMLElement): void {
    if(settingsOpen && nav.selectedId===preset.id && editorTrigger===trigger){closeEditor(true);return;}
    setFilters(false); select(preset); clearTimeout(settingsTimer);
    editorTrigger = trigger; settingsOpen = true; settingsPanel.hidden=false;
    trigger.setAttribute("aria-expanded", "true"); settingsPanel.setAttribute("aria-hidden","false");
    settingsTabStops(true); positionSettings(); void settingsPanel.offsetWidth;
    settingsPanel.setAttribute("data-open","true");
    (settingsBody.querySelector<HTMLButtonElement>("button") ?? settingsClose).focus();
    previewPlayers.get(preset.id)?.();
  }
  // Categories live in the anchored menu, which sizes itself to its labels.
  const resize = (): void => { positionSettings(); };
  const outside = (event: MouseEvent): void => { const target = event.target as Node;
    if(settingsOpen && !settingsPanel.contains(target) && !editorTrigger?.contains(target) && !(target as HTMLElement).closest?.(".ch-select-menu"))closeEditor();
    if(!element.contains(target))pausePreviews(); if (!filterMenu.hidden && !filterMenu.contains(target) && !filterButton.contains(target)) setFilters(false); };
  const escape = (event: KeyboardEvent): void => { if(event.key!=="Escape"||event.defaultPrevented)return;
    if(settingsOpen){event.preventDefault();closeEditor(true);return;}
    if(colorFolder){event.preventDefault();const id=colorFolder;colorFolder="";drawFolders();restoreFocus(`more.${id}`);}else if(!filterMenu.hidden){event.preventDefault();setFilters(false);filterButton.focus();}
    };
  doc.addEventListener("mousedown", outside); doc.addEventListener("keydown", escape); window.addEventListener("resize", resize);
  const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null; observer?.observe(browser);
  resize();
  const ns = "http://www.w3.org/2000/svg";
  function settings(preset: GalleryPreset): MotionLibraryOptions {
    if (!preset.motion) return { ...MOTION_LIBRARY_DEFAULTS };
    return nav.drafts![preset.id] ?? (nav.drafts![preset.id] = defaultLibraryOptions(preset.motion, options.context?.()?.fps));
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
  function applyPreset(preset: GalleryPreset): void {
    if (disposed || options.busy) return;
    if (nav.selectedId !== preset.id) select(preset);
    updateContext();
    if(options.busy||invalidNumbers.get(preset.id)?.size||actions.querySelector<HTMLButtonElement>("button")?.disabled)return;
    rememberScroll();
    options.apply(preset, preset.motion ? { ...settings(preset) } : undefined,
      preset.motion?.cameraSpec ? "precomp" : preset.category === "camera-transitions" ? nav.cameraApplyMode ?? "precomp" : "layers");
  }
  function preview(preset: GalleryPreset): HTMLElement {
    const overlay = (): boolean => preset.category === "camera-transitions" && (Boolean(preset.motion?.cameraSpec) || nav.cameraApplyMode !== "layers");
    const name = preset.displayName[options.locale] ?? preset.id;
    const view = button(doc, { label: "", onClick: () => { select(preset); play(); } });
    view.className = "ch-preset-preview";
    if (preset.motion?.cameraSpec?.native || preset.motion?.cameraSpec?.impact || preset.motion?.effect.startsWith("native-")) view.title = pt ? "Prévia ilustrativa; o efeito se adapta à imagem aplicada." : "Illustrative preview; the effect adapts to the applied image.";
    view.setAttribute("aria-label", `${pt ? "Prévia" : "Preview"}: ${name}`);
    view.setAttribute("aria-pressed",String(nav.selectedId===preset.id));view.dataset.focusKey=`preview.${preset.id}`;
    view.addEventListener("dblclick",()=>{if(!options.busy)applyPreset(preset);});
    const svg = doc.createElementNS(ns, "svg"); svg.setAttribute("viewBox", "0 0 320 180"); svg.setAttribute("aria-hidden", "true"); view.appendChild(svg);
    const path = (d: string, cls: string): void => { const n = doc.createElementNS(ns, "path"); n.setAttribute("d", d); n.setAttribute("class", cls); svg.appendChild(n); };
    function paint(seconds: number): void {
      clearNode(svg);
      if (preset.motion) { paintLibraryPreview(svg, preset.motion, settings(preset), seconds, overlay()); return; }
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
    const rest = (): void => {
      const draft=settings(preset),duration=draft.durationFrames/30;
      // A still frame should reveal the movement, rather than show every entrance at rest.
      const time=overlay()?duration*.25:preset.motion?.mode==="transition"
        ?draft.phase==="out"?libraryPreviewEnd(draft)-duration*.65:duration*.65
        :preset.motion?1.4:.5;
      svg.setAttribute("opacity", "1");paint(time);
    };
    const halt = (): void => { if(activePreview===preset.id)activePreview="";if(!options.preferences.snapshot().presetAutoplay){rest();cancelAnimationFrame(animationFrame);animationFrame=0;} };
    function play(): void {
      if(disposed||doc.hidden||options.busy)return;
      if(typeof doc.hasFocus==="function"&&!doc.hasFocus())return;
      panelActive=true;
      if(!intersections&&!visible.has(preset.id)){
        for(const id of visible)scenes.get(id)?.release();visible.clear();visible.add(preset.id);
      }
      if(reduced()){rest();return;}
      const previous=playingId();if(previous&&previous!==preset.id)scenes.get(previous)?.rest();
      activePreview=preset.id;const scene=scenes.get(preset.id);if(scene)scene.start=performance.now();schedulePreviews();
    }
    view.dataset.previewId=preset.id;
    scenes.set(preset.id,{view,rest,release:()=>clearNode(svg),start:performance.now(),paint:elapsed=>{
      const sample=overlay()?cameraPreviewPlayback(settings(preset),elapsed):preset.motion?libraryPreviewPlayback(preset.motion,settings(preset),elapsed):{time:elapsed%1.65,opacity:1};
      svg.setAttribute("opacity",String(sample.opacity));paint(sample.time);
    }});
    if(intersections)intersections.observe(view);else if(visible.size<2){visible.add(preset.id);rest();}
    previewPlayers.set(preset.id,play);
    view.addEventListener("mouseenter",play);view.addEventListener("focus",play);
    view.addEventListener("mouseleave",halt);view.addEventListener("blur",halt);
    return view;
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
    primaryApply = undefined; clearNode(actions);
    editor.hidden = !preset;
    actions.hidden = !preset;
    if (!preset) { actions.appendChild(createElement(doc,"span","ch-preset-hint",pt?"Selecione uma miniatura":"Select a preview")); inspector.appendChild(createElement(doc, "p", "ch-preset-hint", pt ? "Escolha um preset para aplicar ou ajustar." : "Choose a preset to apply or adjust.")); return; }
    const presetId=preset.id;
    settingsTitle.textContent = preset.displayName[options.locale] ?? preset.id;
    const heading = createElement(doc, "div", "ch-preset-approved-heading");
    heading.appendChild(createElement(doc, "span", "", preset.displayName[options.locale] ?? preset.id));
    heading.appendChild(createBadge(doc, { label: pt ? "Ajustável" : "Editable", showIcon: false }).element);
    inspector.appendChild(heading);
    if (preset.motion) {
      const needs = requirementLabels(motionLibraryRequirements(preset.motion), pt);
      const list = createElement(doc, "div", "ch-preset-requirements");
      list.setAttribute("aria-label", pt ? "Requisitos" : "Requirements");
      for (const need of needs) {
        const badge = createBadge(doc, { label: need.label, showIcon: false }).element;
        badge.title = need.detail; badge.dataset.requirement = need.id;
        list.appendChild(badge);
      }
      inspector.appendChild(list);
      inspector.appendChild(createElement(doc, "p", "ch-preset-hint ch-preset-illustrative", pt
        ? "A prévia mostra a receita numa cena de exemplo; o resultado se adapta às suas camadas."
        : "The preview shows the recipe on a sample scene; the result adapts to your layers."));
    }
    const primaryFields = createElement(doc, "div", "ch-preset-primary-fields"); inspector.appendChild(primaryFields);
    const p = preset.motion;
    const camera = preset.category === "camera-transitions";
    const overlay = camera && (Boolean(p?.cameraSpec) || nav.cameraApplyMode !== "layers");
    if (p) {
      const draft = settings(preset), fields = createElement(doc, "div", "ch-preset-fields");
      const activeNumbers=new Set<string>();
      if (camera && !p.cameraSpec) {
        const label=pt?"Aplicação":"Apply to";
        const row=selectField(doc,{id:`${galleryId}-camera-mode`,label,value:nav.cameraApplyMode??"precomp",disabled:options.busy,
          options:[{value:"precomp",label:pt?"Transição em pré-comp":"Precomp transition"},{value:"layers",label:pt?"Camadas selecionadas":"Selected layers"}],
          onChange:value=>{nav.cameraApplyMode=value==="layers"?"layers":"precomp";drawInspector(preset);previewPlayers.get(preset.id)?.();}});
        row.className+=" ch-preset-field ch-preset-field--select ch-camera-apply-mode";
        row.getElementsByTagName("select")[0]?.setAttribute("aria-label",label);
        inspector.appendChild(row);
      }
      const adjustments = createElement(doc, "div", "ch-preset-adjustments");
      function choice(key: "direction" | "phase" | "unit" | "order" | "easing", label: string, choices: [string, string][]): void {
        const row=selectField(doc,{id:`${galleryId}-${key}`,label,value:draft[key]??"preset",disabled:options.busy,
          options:choices.map(([value,text])=>({value,label:text})),onChange:value=>{Object.assign(draft,{[key]:value});refreshPreview(preset);if(key==="unit"||key==="order"||key==="phase"||key==="easing")drawInspector(preset);}});
        row.className+=" ch-preset-field ch-preset-field--select";
        row.getElementsByTagName("select")[0]?.setAttribute("aria-label",label);
        fields.appendChild(row);
      }
      function number(key: "durationFrames" | "intensity" | "staggerFrames" | "elasticity" | "overlap" | "speed" | "seed", label: string, min: number, max: number, container: HTMLElement = fields): void {
        activeNumbers.add(key);
        const step=["intensity","elasticity","overlap","speed"].includes(key) ? 0.1 : 1;
        const wrapper=createElement(doc,"div","ch-preset-field--number");
        const row=createElement(doc,"label","ch-preset-field");row.appendChild(createElement(doc,"span","",label));
        const field=doc.createElement("input");field.type="number";field.id=`${galleryId}-${key}-input`;field.min=String(min);field.max=String(max);field.step=String(step);field.value=invalidNumbers.get(presetId)?.get(key)??String(draft[key]);field.disabled=options.busy;field.setAttribute("aria-label",label);
        const validation=createElement(doc,"div","ch-field__error");validation.id=`${galleryId}-${key}-error`;validation.setAttribute("role","alert");field.setAttribute("aria-describedby",validation.id);
        function validationState(valid:boolean):void {
          field.setAttribute("aria-invalid",String(!valid));validation.hidden=valid;
          validation.textContent=valid?"":pt?`Use ${step===1?"um número inteiro":"um número"} entre ${min} e ${max}.`:`Enter ${step===1?"a whole number":"a number"} from ${min} to ${max}.`;
        }
        function commit():void {
          const text=field.value.trim().replace(",","."),n=Number(text);
          const valid=/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text)&&Number.isFinite(n)&&n>=min&&n<=max&&(step!==1||Number.isInteger(n));
          validationState(valid);
          if(!valid){if(!invalidNumbers.has(presetId))invalidNumbers.set(presetId,new Map());invalidNumbers.get(presetId)!.set(key,field.value);}
          else{invalidNumbers.get(presetId)?.delete(key);draft[key]=n;refreshPreview(preset);}
          updateContext();
        }
        validationState(!invalidNumbers.get(presetId)?.has(key));
        numericCleanups.push(attachScrubbableNumber(field,{helpText:pt?"Arraste para ajustar · Shift: precisão · Alt: rápido · Clique para digitar":"Drag to adjust · Shift: fine · Alt: fast · Click to type"}));
        field.addEventListener("input",commit);field.addEventListener("change",commit);field.addEventListener("keydown",event=>{if(event.key==="Enter")commit();});row.appendChild(field);wrapper.appendChild(row);wrapper.appendChild(validation);container.appendChild(wrapper);
      }
      if (p.mode === "transition" && !overlay) primaryFields.appendChild(createPresetPhaseControl(doc, {
        locale: options.locale, value: draft.phase, disabled: options.busy,
        onChange: value => { draft.phase = value; refreshPreview(preset); }
      }));
      if (!overlay && (p.position[0] || p.position[1] || p.pivot === "edge")) {
        const directions = createElement(doc, "div", "ch-preset-directions"); directions.setAttribute("role", "group"); directions.setAttribute("aria-label", pt ? "Direção" : "Direction");
        for (const [direction, label] of [["preset",pt?"Original":"Original"],["bottom",pt?"De baixo":"From bottom"],["left",pt?"Da esquerda":"From left"],["right",pt?"Da direita":"From right"],["top",pt?"De cima":"From top"]] as const) {
          const item = button(doc, {label, disabled: options.busy, onClick: () => { draft.direction = direction; for (const child of Array.from(directions.children)) child.setAttribute("aria-pressed", String((child as HTMLElement).dataset.direction === direction)); refreshPreview(preset); }});
          item.dataset.direction = direction; item.setAttribute("aria-pressed", String(draft.direction === direction)); directions.appendChild(item);
        }
        adjustments.appendChild(directions);
      }
      // Signature recipes keep their duration inside the authored tempo window.
      if (p.mode === "transition") { const [minimum, maximum] = overlay ? [2, 600] : signatureDurationRange(p, options.context?.()?.fps); number("durationFrames", pt ? "Duração · frames" : "Duration · frames", minimum, maximum, primaryFields); }
      number("intensity", pt ? "Intensidade · %" : "Intensity · %", 0, 300);
      if(p.mode==="transition"&&!overlay)choice("easing",pt?"Suavização":"Easing",presetEasingChoices(options.locale));
      if (p.category.startsWith("text-")) {
        choice("unit", pt ? "Dividir texto" : "Text units", [["preset",pt?"Padrão do preset":"Preset default"],["characters",pt?"Caracteres":"Characters"],["words",pt?"Palavras":"Words"],["lines",pt?"Linhas":"Lines"],["all",pt?"Texto inteiro":"Whole text"]]);
        if (p.mode === "transition") number("staggerFrames", pt ? "Intervalo · frames" : "Stagger · frames", 0, 60);
      }
      const sequenceControls = gallerySequenceControls(p, draft);
      if (!overlay && sequenceControls.order) choice("order", pt ? "Ordem" : "Order", [["preset",pt?"Original":"Original"],["forward",pt?"Primeiro ao último":"First to last"],["reverse",pt?"Último ao primeiro":"Last to first"],["center-out",pt?"Centro para fora":"Center outward"],["edges-in",pt?"Bordas para dentro":"Edges inward"],["random",pt?"Aleatória":"Random"]]);
      if (!overlay && sequenceControls.seed) { draft.seed ??= p.defaults?.seed ?? 17; number("seed", pt ? "Variação" : "Variation", 0, 9999); }
      adjustments.appendChild(fields);
      adjustments.appendChild(button(doc,{label:pt?"Restaurar padrão":"Reset defaults",disabled:options.busy,onClick:()=>{nav.drafts![preset.id]=defaultLibraryOptions(p,options.context?.()?.fps);invalidNumbers.delete(presetId);drawInspector(preset);previewPlayers.get(preset.id)?.();}}));
      if (options.saveVariant && !p.cameraSpec && !p.id.startsWith("camera-")) {
        // Guardar o ajuste antes de aplicar: a variação aparece em Editar →
        // Variações salvas e pode ser aplicada depois em qualquer seleção.
        const status = createElement(doc, "p", "ch-preset-hint ch-preset-variant-status");
        status.setAttribute("role", "status");
        adjustments.appendChild(button(doc, { label: pt ? "Salvar como variação" : "Save as variation", disabled: options.busy || Boolean(invalidNumbers.get(presetId)?.size), onClick: () => {
          if (disposed || invalidNumbers.get(presetId)?.size) return;
          const result = options.saveVariant!(p.id, preset.displayName[options.locale] ?? p.id, { ...settings(preset) });
          status.textContent = result.message;
          status.dataset.state = result.ok ? "ok" : "error";
        } }));
        adjustments.appendChild(status);
      }
      if (p.collection === "studio" || p.collection === "premium" || p.collection === "native" || p.collection === "signature" || draft.easing==="spring") {
        const details = createElement(doc, "details", "ch-preset-refine");
        details.appendChild(createElement(doc, "summary", "", pt ? "Refinar movimento" : "Refine motion"));
        const advanced = createElement(doc, "div", "ch-preset-fields");
        if ((draft.easing&&draft.easing!=="preset"?draft.easing:p.easing) === "spring") number("elasticity", pt ? "Elasticidade · %" : "Elasticity · %", 0, 100, advanced);
        if (p.category.startsWith("text-") && p.mode === "transition") number("overlap", pt ? "Sobreposição · %" : "Overlap · %", 0, 100, advanced);
        if (p.mode === "continuous") number("speed", pt ? "Velocidade · %" : "Speed · %", 25, 200, advanced);
        if (advanced.children.length) {
          details.appendChild(advanced);
          details.appendChild(createElement(doc,"p","ch-preset-hint",p.mode === "continuous" ? pt ? "Menor velocidade deixa o ciclo mais lento." : "Lower speed makes the cycle slower." : pt ? "Sobreposição maior aproxima as entradas; elasticidade controla a acomodação." : "More overlap brings arrivals closer; elasticity controls settling."));
          adjustments.appendChild(details);
        }
      }
      adjustments.appendChild(createElement(doc, "p", "ch-preset-hint", overlay ? pt ? "Cria uma pré-comp acima das camadas, com o marcador CUT no tempo atual. Arraste o marcador para mover o pico da transição." : "Creates a precomp above the layers with a CUT marker at the current time. Drag the marker to move the transition peak." : p.mode === "transition" ? pt ? "Entrada no início da camada; saída no fim." : "In at the layer start; out at its end." : pt ? "Ajustes editáveis nos Controles do efeito." : "Editable settings in Effect Controls."));
      for(const key of invalidNumbers.get(presetId)?.keys()??[])if(!activeNumbers.has(key))invalidNumbers.get(presetId)?.delete(key);
      settingsBody.appendChild(adjustments);

    } else inspector.appendChild(createElement(doc, "p", "ch-preset-hint", preset.category === "ease" ? pt ? "Selecione dois ou mais keyframes." : "Select two or more keyframes." : pt ? "Selecione uma câmera sem parent nem animação na propriedade." : "Select an unparented camera without keys on the target property."));
    if(!p) settingsBody.appendChild(button(doc,{label:preset.category==="ease"?(pt?"Editar curva":"Edit curve"):(pt?"Editar movimento":"Edit motion"),onClick:()=>{if(disposed)return;rememberScroll();options.edit(preset);}}));
    const target = createElement(doc, "span", "ch-preset-target"); actions.appendChild(target);
    primaryApply = createActionButton(doc, { id: "preset-primary-apply", label: overlay ? (pt ? "Criar transição" : "Create transition") : (pt ? "Aplicar preset" : "Apply preset"),
      variant: "primary", onPress: () => { if (!disposed) applyPreset(preset); } });
    primaryApply.button.classList.add("ch-preset-primary-apply");
    primaryApply.element.classList.add("ch-preset-primary-action"); actions.appendChild(primaryApply.element);
    updateContext();
    if(focusedId) doc.getElementById(focusedId)?.focus();
    if(settingsOpen)positionSettings();
    else settingsTabStops(false);
  }
  function updateContext(): void {
    const context = options.context?.();
    if(nav.category.startsWith("personal")){
      const selected=options.personal?.items.find(item=>item.id===nav.selectedId);
      const reason=selected?personalItemReason(selected):null;
      for(const control of Array.from(actions.getElementsByTagName("button"))){control.disabled=options.busy||Boolean(reason);control.title=reason??"";control.setAttribute("aria-disabled",String(control.disabled));}
      return;
    }
    const selected = GALLERY_PRESETS.find(preset => preset.id === nav.selectedId);
    const reason = !context ? null : !context.hasComp ? (pt ? "Abra uma composição" : "Open a composition")
      : selected?.category === "ease" && context.selectedKeys < 1 ? (pt ? "Selecione keyframes" : "Select keyframes")
      : context.selectionCount < 1 && !selected?.category.startsWith("camera") ? (pt ? "Nenhuma camada selecionada" : "No layer selected")
      : selected?.motion ? requirementReason(motionLibraryRequirements(selected.motion), context, pt) : null;
    const target = actions.querySelector<HTMLElement>(".ch-preset-target");
    if (target) target.textContent = reason ?? (context ? `${context.selectionCount} ${context.selectionCount === 1 ? (pt ? "camada selecionada" : "selected layer") : (pt ? "camadas selecionadas" : "selected layers")}` : "");
    for (const control of Array.from(actions.getElementsByTagName("button"))) {
      control.disabled = options.busy || Boolean(reason) || Boolean(selected && invalidNumbers.get(selected.id)?.size);
      control.setAttribute("aria-disabled", String(control.disabled));
      control.title = reason ?? "";
    }
    if (primaryApply) {
      const invalid = Boolean(selected && invalidNumbers.get(selected.id)?.size);
      const unavailable = options.busy || Boolean(reason) || invalid;
      primaryApply.setDisabled(unavailable, options.busy ? (pt ? "Aguarde a operação atual." : "Wait for the current operation.")
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

  function draw(): void {
    personalPreview?.dispose();personalPreview=undefined;
    if (nav.scope !== "recent") delete nav.recentOrder;
    scrollRestoreRevision++;
    if(scrollRestoreFrame){cancelAnimationFrame(scrollRestoreFrame);scrollRestoreFrame=0;}
    pendingScroll = nav.scroll;
    const focused=focusKey();
    const category = folders.flatMap(folder => [folder, ...(folder.children ?? []).flatMap(child => [child, ...(child.children ?? [])])]).find(folder => folder.id === nav.category);
    filterLabel.textContent = category?.label ?? labels[nav.category] ?? labels.all!;
    cancelAnimationFrame(animationFrame); animationFrame=0;activePreview="";intersections?.disconnect();visible.clear();scenes.clear();previewPlayers.clear();closeEditor();clearNode(grid);drawFolders();
    grid.classList.toggle("ch-preset-grid--personal",nav.category.startsWith("personal"));
    filters.hidden=nav.category.startsWith("personal");
    if(nav.category.startsWith("personal")){drawInspector();drawPersonal();restoreFocus(focused);restoreScroll();return;}
    for (const b of Array.from(filters.querySelectorAll<HTMLButtonElement>("[data-scope]"))) b.setAttribute("aria-pressed", String(nav.scope === b.dataset.scope));
    const prefs = options.preferences.snapshot();
    // Applying records recency immediately. Retain this browsing order while
    // editing/removing so the saved offset still points to the same preview.
    if (nav.scope === "recent") nav.recentOrder ??= [...prefs.recent];
    const items = nav.scope === "recent" ? nav.recentOrder!.map(id => GALLERY_PRESETS.find(p => p.id === id)).filter((p): p is GalleryPreset => Boolean(p)) : GALLERY_PRESETS;
    let count = 0, selected:GalleryPreset|undefined;
    for (const preset of items) {
      if (!categoryMatches(preset)) continue;
      if (nav.scope === "favorites" && !prefs.favorites.includes(preset.id)) continue;
      const name = preset.displayName[i18n.locale()] ?? preset.id;
      if (!normalizeSearch(`${name} ${preset.tags}`).includes(normalizeSearch(nav.query))) continue;
      count++;
      if(nav.selectedId===preset.id)selected=preset;
      const card = createElement(doc, "article", "ch-preset-card"); card.id = preset.id; card.setAttribute("data-selected", String(nav.selectedId === preset.id));
      card.appendChild(preview(preset));
      if (preset.motion && motionLibraryRequirements(preset.motion).motionCore) {
        const core = createElement(doc, "span", "ch-preset-core-badge", "Core");
        core.title = pt ? "Precisa do plugin Moti.on Core instalado." : "Needs the Moti.on Core plugin installed.";
        card.appendChild(core);
      }
      const title = button(doc, { label: name, onClick: () => { select(preset); previewPlayers.get(preset.id)?.(); } }); title.classList.add("ch-preset-apply"); title.title = name;
      title.dataset.focusKey=`title.${preset.id}`;
      const actions = createElement(doc, "div", "ch-preset-actions");
      actions.appendChild(title);
      const adjust = button(doc, {label: "", disabled: options.busy, onClick: () => openEditor(preset, adjust)});
      adjust.classList.add("ch-preset-settings-trigger"); adjust.appendChild(createIcon(doc,"settings"));
      adjust.setAttribute("aria-haspopup","dialog"); adjust.setAttribute("aria-controls",settingsPanel.id);
      adjust.setAttribute("aria-label", `${pt ? "Ajustes" : "Settings"}: ${name}`); adjust.setAttribute("aria-expanded", "false"); adjust.title = pt ? "Direção e ajustes" : "Direction and settings"; actions.appendChild(adjust);
      adjust.dataset.focusKey=`adjust.${preset.id}`;
      const fav = button(doc, { label: "", onClick: () => { options.preferences.toggleFavorite(preset.id); draw(); } });
      const isFavorite = prefs.favorites.includes(preset.id);
      const favoriteLabel = i18n.t(isFavorite ? "presets.unfavorite" : "presets.favorite", { name });
      fav.classList.add("ch-preset-favorite"); fav.appendChild(createIcon(doc, "favorite")); fav.setAttribute("aria-label", favoriteLabel); fav.setAttribute("aria-pressed", String(isFavorite)); fav.title = favoriteLabel; actions.appendChild(fav);
      fav.dataset.focusKey=`favorite.${preset.id}`;
      card.appendChild(actions); grid.appendChild(card);
    }
    if (!count) grid.appendChild(emptyState());
    // Filtering only hides the current selection; returning to the library
    // restores that preset and its draft instead of silently choosing another.
    drawInspector(selected ?? GALLERY_PRESETS.find(preset => preset.id === nav.selectedId)); schedulePreviews();restoreFocus(focused);restoreScroll();
  }
  grid.addEventListener("scroll", () => {
    if (disposed || grid.isConnected === false) return;
    if (pendingScroll === undefined || grid.scrollTop > 0) {
      nav.scroll = grid.scrollTop;
      if (pendingScroll !== undefined) pendingScroll = grid.scrollTop;
    }
    closeEditor();
  });
  scroll.addEventListener("scroll", () => { closeEditor(); if(filterButton.getAttribute("aria-expanded")==="true")setFilters(false); });
  const visibility = (): void => { if(doc.hidden)pausePreviews();else if(pointerInside&&(typeof doc.hasFocus!=="function"||doc.hasFocus()))resumePreviews(); }; doc.addEventListener("visibilitychange", visibility);
  draw();
  return { element, updateContext, dispose() { if(disposed)return;rememberScroll();personalPreview?.dispose();personalPreview=undefined;disposeNumbers();clearTimeout(filterTimer); clearTimeout(settingsTimer); savedTabStops.clear(); searchObserver?.disconnect(); disposed = true; scrollRestoreRevision++;if(scrollRestoreFrame)cancelAnimationFrame(scrollRestoreFrame);scrollRestoreFrame=0; cancelAnimationFrame(animationFrame);animationFrame=0;for(const scene of scenes.values())scene.release();scenes.clear();visible.clear();previewPlayers.clear();window.removeEventListener("blur",pausePreviews);window.removeEventListener("focus",windowFocus);intersections?.disconnect();motionObserver?.disconnect(); clearTimeout(debounce); observer?.disconnect(); window.removeEventListener("resize", resize); doc.removeEventListener("mousedown", outside); doc.removeEventListener("keydown", escape); doc.removeEventListener("visibilitychange", visibility); } };
}
