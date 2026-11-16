import {createToolNumberFields} from "./tool-number-fields.js";
/**
 * Câmera section of the Parallax tab (ADR 0007).
 *
 * The designer picks a shot by intention, previews it with the same kernel the
 * host injects into its expressions, and applies it as a live shot. Applied
 * shots are listed from `ae.camera.inspect`; fine tuning rewrites the same
 * instance (`ae.camera.shot.adjust`), never a second rig.
 */
import { attachActionOverflow, createActionButton, createElement, selectField, type I18n } from "@motion/ui-core";
import {
  CAMERA_CHOREOGRAPHIES, CAMERA_DEEP_START_PX, CAMERA_INTENTS, CAMERA_RECIPES, camPose, camProject, type CameraIntent, type CameraRecipe, type CameraRigFrame,
  type CameraSceneLayer, type CameraShotShape, type CameraShotSpec, type CameraVec3, type CommandResponse
} from "@motion/contracts";
import { SAMPLE_SCENE, choreographyArgs, createChoreographySection, previewLayers, type ChoreographyDraft, type ChoreographyScene } from "./camera-choreography-view.js";
import { createCameraPreviewPlayback } from "./camera-preview-playback.js";

export interface CameraShotState {
  id: string; presetId: string; start: number; duration: number; intensity: number; shape: CameraShotShape;
  /** Choreography beats share a group id and are listed, adjusted and removed together. */
  group?: string; role?: string;
}
export interface CameraInspectData {
  rig: null | { rigId: string; mode: string; shots: CameraShotState[]; maxShots: number };
  mode: string; problem: string;
  /** The layers a choreography would visit, and the rig frame they are seen from. */
  scene?: CameraSceneLayer[]; frame?: CameraRigFrame | null;
}
export interface CameraPanelOptions {
  i18n: I18n;
  execute(command: string, args: Record<string, unknown>, options?: { allowDestructive?: boolean }): Promise<CommandResponse>;
  error(response: CommandResponse): string;
  busy?(value: boolean): void;
  status?(message: string, tone: "ok" | "error" | "info"): void;
  /** Animation frames for previews; omitted in tests. */
  frame?(callback: (now: number) => void): number;
  cancelFrame?(handle: number): void;
}
/** `side` is the fixed settings column of wide docks (720 px+): the view puts it beside the panel. */
export interface CameraPanel { element: HTMLElement; actions: HTMLElement; reason: HTMLElement; side: HTMLElement; refresh(): Promise<void>; dispose(): void }
/** Width from which the choreography settings leave the gallery for their own column (design system 2026-11). */
const SIDE_QUERY = "(min-width: 720px)";

interface Draft { intent: "all" | CameraIntent; recipeId: string; intensity: number; duration: number | null; start: "now" | "comp"; direction: string; seed: number }

const CURVES: ReadonlyArray<[CameraShotShape["curve"], string, string]> = [
  ["silk", "Suave (quíntica)", "Smooth (quintic)"], ["glide", "Deslize", "Glide"], ["sine-in-out", "Seno", "Sine"],
  ["quint-in-out", "Forte", "Strong"], ["expo-in-out", "Expo", "Expo"], ["velvet", "Veludo (saída)", "Velvet (out)"],
  ["drift", "Deriva (saída longa)", "Drift (long out)"], ["snap", "Estalo", "Snap"], ["impact", "Impacto", "Impact"]
];
const INTENTS: Record<"all" | CameraIntent, [string, string]> = {
  all: ["Todos", "All"], highlight: ["Destacar", "Highlight"], reveal: ["Revelar", "Reveal"],
  traverse: ["Atravessar", "Traverse"], impact: ["Impactar", "Impact"], breathe: ["Respirar", "Breathe"]
};
const SVG = "http://www.w3.org/2000/svg";
/** Mini Parallax scene for previews: background, artist and title planes. */
const PREVIEW_RIG: CameraRigFrame = { cx: 80, cy: 45, pz: 0, dist: 300, zoom: 300, width: 160, height: 90, near: 100,
  growth: 2, cover: 1, margin: [8, 8, 4.5, 4.5], duration: 6 };
const PLANES: Array<{ z: number; w: number; h: number; x: number; y: number; fill: string }> = [
  { z: 0, w: 176, h: 99, x: 80, y: 45, fill: "var(--ch-surface-hover, #303030)" },
  { z: -120, w: 54, h: 60, x: 80, y: 50, fill: "var(--ch-text-secondary, #9a9a9a)" },
  { z: -200, w: 90, h: 14, x: 80, y: 22, fill: "var(--ch-text-primary, #ffffff)" }
];

/** A recipe as a kernel shot for the preview. */
export function previewShot(recipe: CameraRecipe, amount = 1, draft?: Pick<Draft, "intensity" | "duration" | "direction" | "seed">): CameraShotSpec {
  const loop = recipe.shot.kind === "loop";
  const duration = draft?.duration ?? (loop ? 6 : recipe.durationSeconds);
  const org = [...recipe.shot.org] as CameraShotShape["org"];
  if (draft) org[1] = draft.seed;
  if (loop) org[0] = duration / Math.max(1, Math.round(duration / org[0]));
  return { ...recipe.shot, org, start: loop ? 0 : 0.4, dur: duration, amount: draft ? draft.intensity / 100 : amount,
    dir: draft && draft.direction !== "preset" && !loop ? draft.direction : recipe.shot.dir } as CameraShotSpec;
}

/** Projected quads of the preview planes at time t, compensated like Parallax v3. */
export function previewQuads(recipe: CameraRecipe, t: number, draft?: Pick<Draft, "intensity" | "duration" | "direction" | "seed">, source?: ChoreographyScene): number[][] {
  if (source) return previewLayers(source, [previewShot(recipe, 1, draft)], t).map(entry => entry.slice(1));
  const pose = camPose(t, PREVIEW_RIG, [previewShot(recipe, 1, draft)]);
  return PLANES.map((plane) => {
    const k = 1 + plane.z / PREVIEW_RIG.zoom, cx = PREVIEW_RIG.cx + (plane.x - PREVIEW_RIG.cx) * k, cy = PREVIEW_RIG.cy + (plane.y - PREVIEW_RIG.cy) * k;
    const hw = plane.w * k / 2, hh = plane.h * k / 2, out: number[] = [];
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
      const p = camProject(pose, [cx + sx * hw, cy + sy * hh, plane.z] as CameraVec3, PREVIEW_RIG.cx, PREVIEW_RIG.cy);
      out.push(Math.round(p[0] * 100) / 100, Math.round(p[1] * 100) / 100);
    }
    return out;
  });
}

/** Arguments for `ae.camera.shot.apply` from the panel draft. */
export function applyArgs(draft: Draft, recipe: CameraRecipe): Record<string, unknown> {
  const args: Record<string, unknown> = { presetId: recipe.id, intensity: draft.intensity };
  if (draft.duration !== null) args.durationSeconds = draft.duration;
  if (draft.start === "comp") args.startSeconds = 0;
  if (draft.direction !== "preset" && recipe.shot.kind === "move") args.direction = draft.direction;
  if (recipe.shot.kind === "loop") args.seed = draft.seed;
  return args;
}

export function createCameraPanel(doc: Document, options: CameraPanelOptions): CameraPanel {
  const numbers=createToolNumberFields(),numberField=numbers.field;
  const { i18n } = options, en = i18n.locale().startsWith("en");
  const element = createElement(doc, "div", "ch-camera-panel"), actions = createElement(doc, "div", "ch-panel-action-bar ch-camera-actions");
  const reason = createElement(doc, "p", "ch-camera-action-reason");
  reason.setAttribute("role", "status");
  reason.hidden = true;
  const overflow = attachActionOverflow(doc, actions, { label: i18n.t("action.moreActions") });
  const draft: Draft = { intent: "all", recipeId: CAMERA_RECIPES[0]?.id ?? "", intensity: 100, duration: null, start: "now", direction: "preset", seed: 1847 };
  const choreo: ChoreographyDraft = { id: CAMERA_CHOREOGRAPHIES[0]?.id ?? "", duration: null, start: "now", order: "auto", layers: "auto",
    maxSubjects: 0, focus: true, motionBlur: true, life: true, intensity: 100, depth: CAMERA_DEEP_START_PX };
  let inspect: CameraInspectData | null = null, selectedShot = "", editing: CameraShotState | null = null, alive = true, working = false;
  let armedRemove = 0, inspectRevision = 0;
  const playback = createCameraPreviewPlayback(doc, element, options);
  // Design system 2026-11: the options stay on screen with the gallery. Below 720 px they fold under the
  // cards ("Ajustes  10 s · 100 %"); from 720 px they are the fixed side column.
  const pane: "gallery" | "settings" = "gallery";
  let settingsOpen = false, settingsView: { stop(): void; dispose(): void } | null = null;
  const side = createElement(doc, "aside", "ch-camera-side");
  side.setAttribute("aria-label", en ? "Settings" : "Ajustes");
  const sideQuery = doc.defaultView?.matchMedia?.(SIDE_QUERY) ?? null;
  const wide = (): boolean => Boolean(sideQuery?.matches);
  const onSideChange = (): void => { if (alive) render(); };
  sideQuery?.addEventListener?.("change", onSideChange);
  let mode: "choreos" | "shots" = "choreos", selectedGroup = "", groupIntensity = 100, choreoView: { stop(): void; dispose(): void } | null = null;
  const realScene = (): boolean => Boolean(inspect?.frame && inspect.scene && inspect.scene.length > 1);
  const sceneSource = () => (realScene() ? { scene: inspect?.scene ?? [], frame: inspect?.frame as CameraRigFrame } : SAMPLE_SCENE);
  const name = (r: CameraRecipe): string => r.name[en ? "en-US" : "pt-BR"];
  const recipeOf = (id: string): CameraRecipe | undefined => CAMERA_RECIPES.find((r) => r.id === id);
  const t = (pt: string, english: string): string => (en ? english : pt);

  function paint(svg: SVGSVGElement, recipe: CameraRecipe, time: number): void {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const source = realScene() ? sceneSource() : undefined;
    const shotDraft = draft.recipeId === recipe.id ? draft : undefined;
    const projected = source ? previewLayers(source, [previewShot(recipe, 1, shotDraft)], time) : null;
    const quads = projected ? projected.map(entry => entry.slice(1)) : previewQuads(recipe, time, shotDraft);
    quads.forEach((quad, i) => {
      const poly = doc.createElementNS(SVG, "polygon");
      const points: string[] = [];
      for (let j = 0; j < quad.length; j += 2) points.push(`${quad[j]},${quad[j + 1]}`);
      poly.setAttribute("points", points.join(" "));
      const layer = source?.scene[projected?.[i]?.[0] ?? -1];
      if (layer) poly.setAttribute("class", `ch-camera-plane ch-camera-plane--${layer.bg ? "background" : layer.kind === "text" ? "text" : "subject"}`);
      else poly.setAttribute("fill", PLANES[i]?.fill ?? "#888");
      svg.appendChild(poly);
    });
  }
  function play(svg: SVGSVGElement, recipe: CameraRecipe): void {
    const shot = previewShot(recipe, 1, draft.recipeId === recipe.id ? draft : undefined);
    const span = shot.dur + (shot.kind === "loop" ? 0 : 1.2);
    playback.play(time => paint(svg, recipe, time % span), () => paint(svg, recipe, shot.kind === "loop" ? 0 : 0.4 + shot.dur * 0.6));
  }
  function stop(): void { playback.stop(); }

  function section(title: string): HTMLElement {
    const box = createElement(doc, "section", "ch-camera-section");
    box.appendChild(createElement(doc, "div", "ch-section-title", title));
    element.appendChild(box);
    return box;
  }
  function card(recipe: CameraRecipe): HTMLElement {
    const button = createElement(doc, "button", "ch-camera-card");
    const title = name(recipe);
    button.setAttribute("type", "button");
    button.setAttribute("data-recipe", recipe.id);
    button.setAttribute("aria-pressed", String(recipe.id === draft.recipeId));
    button.setAttribute("title", `${title} · ${recipe.description[en ? "en-US" : "pt-BR"]}`);
    if (typeof doc.createElementNS === "function") {
      const svg = doc.createElementNS(SVG, "svg") as SVGSVGElement;
      const frame = realScene() ? sceneSource().frame : PREVIEW_RIG;
      svg.setAttribute("viewBox", `0 0 ${frame.width} ${frame.height}`);
      svg.setAttribute("preserveAspectRatio", "xMidYMid slice");
      svg.setAttribute("aria-hidden", "true");
      svg.setAttribute("class", "ch-camera-card__preview");
      const shot = previewShot(recipe, 1, draft.recipeId === recipe.id ? draft : undefined);
      paint(svg, recipe, shot.kind === "loop" ? 0 : 0.4 + shot.dur * 0.6);
      button.appendChild(svg);
      button.addEventListener("mouseenter", () => play(svg, recipe));
      button.addEventListener("focus", () => play(svg, recipe));
      button.addEventListener("mouseleave", stop);
      button.addEventListener("blur", stop);
    }
    button.appendChild(createElement(doc, "span", "ch-camera-card__name", title));
    button.appendChild(createElement(doc, "span", "ch-camera-card__meta",
      recipe.shot.kind === "loop" ? t("loop", "loop") : `${recipe.durationSeconds.toLocaleString(en ? "en-US" : "pt-BR")} s`));
    button.addEventListener("click", () => { draft.recipeId = recipe.id; draft.duration = null; render(); });
    return button;
  }
  function field(box: HTMLElement, node: HTMLElement): void { box.appendChild(node); }

  function renderApply(): void {
    const box = section(t("Shots de câmera", "Camera shots"));
    box.setAttribute("data-pane", pane);
    const intents = createElement(doc, "div", "ch-chip-group ch-camera-intents");
    intents.setAttribute("role", "group");
    for (const intent of ["all", ...CAMERA_INTENTS] as const) {
      const chip = createElement(doc, "button", "ch-chip", INTENTS[intent][en ? 1 : 0]);
      chip.setAttribute("type", "button");
      chip.setAttribute("aria-pressed", String(draft.intent === intent));
      chip.setAttribute("data-active", String(draft.intent === intent));
      chip.addEventListener("click", () => { draft.intent = intent; render(); });
      intents.appendChild(chip);
    }
    box.appendChild(intents);
    const grid = createElement(doc, "div", "ch-camera-grid");
    for (const r of CAMERA_RECIPES) if (draft.intent === "all" || r.intent === draft.intent) grid.appendChild(card(r));
    box.appendChild(grid);
  }
  function renderShotFields(box: HTMLElement, recipe: CameraRecipe | undefined): void {
    if (!recipe) return;
    const loop = recipe.shot.kind === "loop";
    field(box, numberField(doc, { id: "camera-intensity", label: t("Intensidade", "Intensity"), value: draft.intensity, min: 0, max: 300, step: 5, unit: "%",
      onCommit: (v) => { draft.intensity = v; render(); } }));
    field(box, numberField(doc, { id: "camera-duration", label: t("Duração", "Duration"), value: draft.duration ?? recipe.durationSeconds, min: 0.1, max: 60, step: 0.05, unit: "s",
      ...(loop ? { description: t("Loops preenchem a composição quando a duração não é mudada.", "Loops fill the composition unless the duration changes.") } : {}),
      onCommit: (v) => { draft.duration = v; render(); } }));
    field(box, selectField(doc, { id: "camera-start", label: t("Início", "Start"), value: draft.start,
      options: [{ value: "now", label: t("Tempo atual", "Current time") }, { value: "comp", label: t("Início da composição", "Composition start") }],
      onChange: (v) => { draft.start = v === "comp" ? "comp" : "now"; } }));
    if (recipe.shot.kind === "move") {
      field(box, selectField(doc, { id: "camera-direction", label: t("Direção", "Direction"), value: draft.direction,
        options: [{ value: "preset", label: t("Da receita", "From the recipe") }, { value: "to", label: t("Sai do design", "Leaves the design") },
          { value: "from", label: t("Chega ao design", "Arrives at the design") }, { value: "through", label: t("Atravessa o design", "Crosses the design") }],
        onChange: (v) => { draft.direction = v; render(); } }));
    }
    if (loop) {
      field(box, numberField(doc, { id: "camera-seed", label: t("Variação", "Variation"), value: draft.seed, min: 0, max: 9999, step: 1,
        onCommit: (v) => { draft.seed = v; render(); } }));
    }
  }

  function shotLabel(shot: CameraShotState): string {
    const r = recipeOf(shot.presetId), fmt = (v: number) => v.toLocaleString(en ? "en-US" : "pt-BR", { maximumFractionDigits: 2 });
    return `${shot.id} · ${r ? name(r) : shot.presetId} · ${fmt(shot.start)}–${fmt(shot.start + shot.duration)} s · ${Math.round(shot.intensity)}%`;
  }
  /** One row per choreography: its beats move, adjust and go away together. */
  function groupLabel(group: string, beats: CameraShotState[]): string {
    const first = beats[0] as CameraShotState, c = CAMERA_CHOREOGRAPHIES.find((x) => x.id === first.presetId) ?? CAMERA_CHOREOGRAPHIES.find((x) => beats.some((b) => b.presetId === x.id));
    const fmt = (v: number) => v.toLocaleString(en ? "en-US" : "pt-BR", { maximumFractionDigits: 1 });
    const start = Math.min(...beats.map((b) => b.start)), end = Math.max(...beats.map((b) => b.start + b.duration));
    const steps = beats.filter((b) => b.role !== "life").length;
    return `${group} · ${c ? c.name[en ? "en-US" : "pt-BR"] : t("Coreografia", "Choreography")} · ${fmt(start)}–${fmt(end)} s · ${steps} ${t("passos", "steps")} · ${Math.round(first.intensity)}%`;
  }
  function renderShots(): void {
    const box = section(t("Na composição", "In the composition"));
    const shots = inspect?.rig?.shots ?? [];
    if (!shots.length) { box.appendChild(createElement(doc, "p", "ch-hint", t("Nenhum shot ainda.", "No shots yet."))); return; }
    const list = createElement(doc, "div", "ch-camera-shots"), seen = new Set<string>();
    list.setAttribute("role", "listbox");
    for (const shot of shots) {
      if (shot.group) {
        if (seen.has(shot.group)) continue;
        seen.add(shot.group);
        const group = shot.group, beats = shots.filter((s) => s.group === group);
        const row = createElement(doc, "button", "ch-camera-shot ch-camera-shot--group", groupLabel(group, beats));
        row.setAttribute("type", "button");
        row.setAttribute("role", "option");
        row.setAttribute("aria-selected", String(group === selectedGroup));
        row.addEventListener("click", () => { selectedGroup = group; groupIntensity = shot.intensity; selectedShot = ""; editing = null; render(); });
        list.appendChild(row);
        continue;
      }
      const row = createElement(doc, "button", "ch-camera-shot", shotLabel(shot));
      row.setAttribute("type", "button");
      row.setAttribute("role", "option");
      row.setAttribute("aria-selected", String(shot.id === selectedShot));
      row.addEventListener("click", () => { selectedShot = shot.id; selectedGroup = ""; editing = JSON.parse(JSON.stringify(shot)) as CameraShotState; render(); });
      list.appendChild(row);
    }
    box.appendChild(list);
    if (selectedGroup) {
      box.appendChild(numberField(doc, { id: "camera-group-intensity", label: t("Intensidade da coreografia", "Choreography intensity"), value: groupIntensity,
        min: 0, max: 200, step: 5, unit: "%", description: t("Arraste os marcadores no controle da câmera para mudar o tempo de cada passo.",
          "Drag the markers on the camera control to retime each step."), onCommit: (v) => { groupIntensity = v; } }));
      return;
    }
    if (!editing) return;
    const e = editing, details = createElement(doc, "details", "ch-camera-fine");
    details.setAttribute("open", "");
    details.appendChild(createElement(doc, "summary", "", t("Ajuste fino", "Fine tuning")));
    const num = (id: string, label: string, value: number, min: number, max: number, step: number, unit: string, set: (v: number) => void): void => {
      details.appendChild(numberField(doc, { id: `camera-edit-${id}`, label, value, min, max, step, unit, onCommit: set }));
    };
    num("intensity", t("Intensidade", "Intensity"), e.intensity, 0, 300, 5, "%", (v) => { e.intensity = v; });
    num("start", t("Início", "Start"), e.start, 0, 3600, 0.05, "s", (v) => { e.start = v; });
    num("duration", t("Duração", "Duration"), e.duration, 0.05, 600, 0.05, "s", (v) => { e.duration = v; });
    const axes: Array<[string, string, number, (v: number) => void]> = [
      ["x", t("Lateral (X)", "Truck (X)"), e.shape.tr[0] * 100, (v) => { e.shape.tr[0] = v / 100; }],
      ["y", t("Vertical (Y)", "Pedestal (Y)"), e.shape.tr[1] * 100, (v) => { e.shape.tr[1] = v / 100; }],
      ["z", t("Profundidade (Z)", "Dolly (Z)"), e.shape.tr[2] * 100, (v) => { e.shape.tr[2] = v / 100; }]
    ];
    for (const [id, label, value, set] of axes) num(id, label, Math.round(value * 100) / 100, -100, 100, 0.1, "%", set);
    const turns: Array<[string, string, number, (v: number) => void]> = [
      ["pan", "Pan", e.shape.rot[0], (v) => { e.shape.rot[0] = v; }], ["tilt", "Tilt", e.shape.rot[1], (v) => { e.shape.rot[1] = v; }],
      ["roll", "Roll", e.shape.rot[2], (v) => { e.shape.rot[2] = v; }]
    ];
    for (const [id, label, value, set] of turns) num(id, label, value, -90, 90, 0.1, "°", set);
    if (e.shape.kind === "move") {
      details.appendChild(selectField(doc, { id: "camera-edit-curve", label: t("Curva", "Curve"), value: e.shape.curve,
        options: CURVES.map(([value, pt, english]) => ({ value, label: en ? english : pt })),
        onChange: (v) => { e.shape.curve = v as CameraShotShape["curve"]; } }));
    }
    box.appendChild(details);
  }

  async function run(command: string, args: Record<string, unknown>, done: string, destructive = false): Promise<void> {
    if (working) return;
    working = true; options.busy?.(true);
    renderActions();
    try {
      const response = await options.execute(command, args, destructive ? { allowDestructive: true } : undefined);
      if (!alive) return;
      if (response.ok) {
        const warning = response.warnings?.[0]?.message;
        options.status?.(warning ? `${done} ${warning}` : done, "ok");
      } else options.status?.(options.error(response), "error");
    } finally {
      working = false; options.busy?.(false);
      if (alive) await refresh();
    }
  }
  function renderActions(): void {
    const focused = doc.activeElement as HTMLElement | null;
    const focusId = focused && actions.contains(focused) ? focused.id : "";
    for (const child of Array.from(actions.children)) if (child !== overflow.button) actions.removeChild(child);
    const recipe = recipeOf(draft.recipeId);
    const blocked = working ? t("Processando câmera…", "Updating camera…") : inspect?.rig ? "" : inspect?.problem ?? "";
    const choreoPreset = CAMERA_CHOREOGRAPHIES.find((x) => x.id === choreo.id);
    const primaryReason = blocked || ((mode === "choreos" ? !choreoPreset : !recipe) ? t("Escolha um preset de câmera.", "Choose a camera preset.") : "");
    if (reason.textContent !== primaryReason) reason.textContent = primaryReason;
    reason.hidden = !primaryReason;
    const add = (id: string, label: string, variant: "primary" | "default" | "destructive", onPress: () => void): void => {
      const disabledReason = variant === "primary" ? primaryReason : working ? blocked : "";
      const control = createActionButton(doc, { id, label, variant, ...(disabledReason ? { disabled: true, disabledReason } : {}), onPress: () => {
        if (alive && !working) onPress();
      } });
      if (variant === "primary") control.element.classList.add("ch-panel-action-bar__primary");
      actions.appendChild(control.element);
    };
    if (mode === "choreos") {
      add("camera-choreo-apply", t("Aplicar coreografia", "Apply choreography"), "primary", () => {
        if (choreoPreset) void run("ae.camera.choreography.apply", choreographyArgs(choreo), t(`${choreoPreset.name["pt-BR"]} aplicada.`, `${choreoPreset.name["en-US"]} applied.`));
      });
    } else {
      add("camera-apply", t("Aplicar shot", "Apply shot"), "primary", () => {
        if (recipe) void run("ae.camera.shot.apply", applyArgs(draft, recipe), t(`${name(recipe)} aplicado.`, `${name(recipe)} applied.`));
      });
    }
    const group = selectedGroup ? inspect?.rig?.shots.find((s) => s.group === selectedGroup) : undefined;
    if (group) {
      add("camera-group-update", t("Atualizar coreografia", "Update choreography"), "default", () => {
        void run("ae.camera.shot.adjust", { shotId: group.id, intensity: groupIntensity }, t("Coreografia atualizada.", "Choreography updated."));
      });
      add("camera-group-remove", t("Remover coreografia", "Remove choreography"), "default", () => {
        const id = selectedGroup;
        selectedGroup = "";
        void run("ae.camera.shot.remove", { groupId: id }, t("Coreografia removida.", "Choreography removed."));
      });
    }
    if (editing) {
      const e = editing;
      add("camera-update", t("Atualizar shot", "Update shot"), "default", () => {
        const args: Record<string, unknown> = { shotId: e.id, intensity: e.intensity, startSeconds: e.start, durationSeconds: e.duration,
          tr: e.shape.tr, rot: e.shape.rot };
        if (e.shape.kind === "move") args.curve = e.shape.curve;
        void run("ae.camera.shot.adjust", args, t("Shot atualizado.", "Shot updated."));
      });
      add("camera-remove-shot", t("Remover shot", "Remove shot"), "default", () => {
        selectedShot = ""; editing = null;
        void run("ae.camera.shot.remove", { shotId: e.id }, t("Shot removido.", "Shot removed."));
      });
    }
    if (inspect?.rig) {
      add("camera-bake", t("Bake da câmera", "Bake camera"), "default", () => {
        selectedShot = ""; editing = null;
        void run("ae.camera.bake", { stepFrames: 1 }, t("Câmera convertida em keyframes.", "Camera baked to keyframes."));
      });
      const armed = armedRemove > Date.now();
      add("camera-remove", armed ? t("Confirmar remoção", "Confirm removal") : t("Remover câmera", "Remove camera"), "destructive", () => {
        if (armedRemove <= Date.now()) { armedRemove = Date.now() + 4000; renderActions(); return; }
        armedRemove = 0; selectedShot = ""; editing = null;
        void run("ae.camera.remove", {}, t("Rig de câmera removido.", "Camera rig removed."), true);
      });
    }
    overflow.refresh();
    if (focusId) doc.getElementById?.(focusId)?.focus({ preventScroll: true });
  }
  /** Settings open before the scrollable cards, or alongside them in a wide dock. */
  function renderSettings(): HTMLElement {
    const block = createElement(doc, "section", "ch-camera-settings");
    const isWide = wide();
    block.setAttribute("data-open", String(isWide || settingsOpen));
    if (isWide) {
      block.appendChild(createElement(doc, "div", "ch-camera-settings__head", mode === "choreos" ? t("Ajustes da coreografia", "Choreography settings") : t("Ajustes do shot", "Shot settings")));
    } else block.hidden = !settingsOpen;
    const body = createElement(doc, "div", "ch-camera-settings__body");
    body.id = "camera-settings-body";
    body.hidden = !(isWide || settingsOpen);
    if (mode === "choreos") {
      const view = createChoreographySection(doc, { i18n, draft: choreo, source: sceneSource, real: realScene, pane: "settings",
        ...(options.frame ? { frame: options.frame } : {}), ...(options.cancelFrame ? { cancelFrame: options.cancelFrame } : {}), onChange: render });
      settingsView = view;
      body.appendChild(view.element);
    } else renderShotFields(body, recipeOf(draft.recipeId));
    block.appendChild(body);
    return block;
  }
  function render(): void {
    numbers.dispose();
    stop();
    choreoView?.dispose();
    choreoView = null;
    settingsView?.dispose();
    settingsView = null;
    while (element.firstChild) element.removeChild(element.firstChild);
    while (side.firstChild) side.removeChild(side.firstChild);
    const rigMode = inspect?.rig?.mode ?? inspect?.mode ?? "";
    const message = rigMode === "parallax" ? t("A câmera move o rig de Parallax: um único dono para a pose.", "The camera drives the Parallax rig: one owner for the pose.")
      : rigMode === "standalone" ? t("Rig de câmera próprio sobre a cena 3D.", "Own camera rig over the 3D scene.") : "";
    if (message) {
      const note = createElement(doc, "p", "ch-camera-status", message);
      note.setAttribute("role", "status");
      element.appendChild(note);
    }
    // One task at a time: a whole choreography over the scene, or a single shot.
    const modes = createElement(doc, "div", "ch-chip-group ch-camera-modes");
    modes.setAttribute("role", "group");
    for (const [value, pt, english] of [["choreos", "Coreografias", "Choreographies"], ["shots", "Shots individuais", "Single shots"]] as const) {
      const chip = createElement(doc, "button", "ch-chip", en ? english : pt);
      chip.setAttribute("type", "button");
      chip.id = `camera-mode-${value}`;
      chip.setAttribute("aria-pressed", String(mode === value));
      chip.setAttribute("data-active", String(mode === value));
      chip.addEventListener("click", () => { mode = value; render(); });
      modes.appendChild(chip);
    }
    const bar = createElement(doc, "div", "ch-camera-toolbar");
    bar.appendChild(modes);
    if (!wide()) bar.appendChild(settingsToggle());
    element.appendChild(bar);
    element.setAttribute("data-pane", pane);
    const settings = renderSettings();
    if (wide()) side.appendChild(settings); else element.appendChild(settings);
    if (mode === "choreos") {
      const view = createChoreographySection(doc, { i18n, draft: choreo, source: sceneSource, real: realScene, pane,
        ...(options.frame ? { frame: options.frame } : {}), ...(options.cancelFrame ? { cancelFrame: options.cancelFrame } : {}), onChange: render });
      choreoView = view;
      element.appendChild(view.element);
    } else {
      renderApply();
    }
    side.hidden = !wide();
    renderShots();
    renderActions();
  }
  /** "10 s · 100 %": what Apply will use, readable without opening the pane. */
  function settingsSummary(): string {
    const locale = en ? "en-US" : "pt-BR";
    if (mode === "choreos") {
      const c = CAMERA_CHOREOGRAPHIES.find((x) => x.id === choreo.id);
      const seconds = choreo.duration ?? c?.durationSeconds;
      return [seconds === undefined ? "" : `${seconds.toLocaleString(locale)} s`, `${choreo.intensity} %`].filter(Boolean).join(" · ");
    }
    const recipe = recipeOf(draft.recipeId);
    const seconds = draft.duration ?? (recipe && recipe.shot.kind !== "loop" ? recipe.durationSeconds : undefined);
    return [seconds === undefined ? t("loop", "loop") : `${seconds.toLocaleString(locale)} s`, `${draft.intensity} %`].join(" · ");
  }
  /** Twirl row of the study: "▸ Ajustes ........ 10 s · 100 %". */
  function settingsToggle(): HTMLElement {
    const toggle = createElement(doc, "button", "ch-camera-settings-toggle");
    toggle.setAttribute("type", "button");
    toggle.id = "camera-settings-toggle";
    toggle.setAttribute("aria-expanded", String(settingsOpen));
    toggle.setAttribute("aria-controls", "camera-settings-body");
    const label = t("Ajustes", "Settings");
    toggle.setAttribute("aria-label", `${label}: ${settingsSummary()}`);
    toggle.title = `${label} · ${settingsSummary()}`;
    toggle.appendChild(createElement(doc, "span", "ch-camera-settings-toggle__twirl"));
    toggle.appendChild(createElement(doc, "span", "ch-camera-settings-toggle__label", label));
    toggle.appendChild(createElement(doc, "span", "ch-camera-settings-toggle__meta", settingsSummary()));
    toggle.addEventListener("click", () => { settingsOpen = !settingsOpen; render(); doc.getElementById?.("camera-settings-toggle")?.focus(); });
    return toggle;
  }
  async function refresh(): Promise<void> {
    const revision = ++inspectRevision;
    const response = await options.execute("ae.camera.inspect", {});
    if (!alive || revision !== inspectRevision) return;
    inspect = response.ok ? (response.data as CameraInspectData) : { rig: null, mode: "", problem: options.error(response) };
    const shot = inspect.rig?.shots.find((s) => s.id === selectedShot);
    if (!shot) { selectedShot = ""; editing = null; }
    if (!inspect.rig?.shots.some((s) => s.group === selectedGroup)) selectedGroup = "";
    render();
  }
  render();
  return { element, actions, reason, side, refresh, dispose: () => { numbers.dispose(); alive = false; overflow.dispose(); playback.dispose(); choreoView?.dispose(); settingsView?.dispose(); sideQuery?.removeEventListener?.("change", onSideChange); } };
}
