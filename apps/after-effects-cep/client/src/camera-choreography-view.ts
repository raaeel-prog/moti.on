import {createToolNumberFields} from "./tool-number-fields.js";
/**
 * Choreographies half of the Câmera section (ADR 0007).
 *
 * The cards preview each choreography over the user's own scene: the layers the
 * host read (`ae.camera.inspect` → `scene`) are planned and projected by the same
 * planner and kernel the host runs, so the card shows the moves the comp will get.
 * Without a scene yet, a small flyer stands in.
 */
import { checkboxField, createElement, selectField, type I18n } from "@motion/ui-core";
import {
  CAMERA_CHOREOGRAPHIES, CAMERA_DEEP_START_PX, CAMERA_RECIPES, camPlanChoreography, camPose, camProject, type CameraChoreography, type CameraPlan,
  type CameraRigFrame, type CameraSceneLayer, type CameraShotSpec, type CameraVec3
} from "@motion/contracts";
import { createCameraPreviewPlayback } from "./camera-preview-playback.js";

export interface ChoreographyDraft {
  id: string; duration: number | null; start: "now" | "comp"; order: string; layers: "auto" | "selection";
  maxSubjects: number; focus: boolean; motionBlur: boolean; life: boolean; intensity: number;
  /** Deep start: px the camera goes into the scene along Z (the motion designer's "Z +2500"). */
  depth?: number;
}

/** Whether a choreography opens with the camera deep in the scene. */
export function opensDeep(choreo: CameraChoreography): boolean {
  return choreo.steps.some((step) => step.to === "deep");
}
export interface ChoreographyScene { scene: CameraSceneLayer[]; frame: CameraRigFrame }


/** A flyer that stands in until the host has read the comp: background, artist, title and logo. */
function member(id: number, name: string, kind: string, x: number, y: number, w: number, h: number, z: number, bg = 0): CameraSceneLayer {
  const k = 1 + z / 3000;
  return { id, name, kind, c: [540 + (x - 540) * k, 960 + (y - 960) * k, z], hw: w / 2 * k, hh: h / 2 * k, bg };
}
export const SAMPLE_SCENE: ChoreographyScene = {
  scene: [member(1, "Fundo", "image", 540, 960, 1188, 2112, 0, 1), member(2, "Artista", "image", 540, 1080, 620, 980, -833.3),
    member(3, "Título", "text", 540, 420, 900, 260, -1666.7), member(4, "Logo", "image", 150, 150, 180, 180, -2500)],
  frame: { cx: 540, cy: 960, pz: 0, dist: 3000, zoom: 3000, width: 1080, height: 1920, near: 500, growth: 2, cover: 1,
    margin: [54, 54, 96, 96], bz: 0, duration: 30 }
};

/** Arguments for `ae.camera.choreography.apply`; only what differs from the host defaults. */
export function choreographyArgs(draft: ChoreographyDraft): Record<string, unknown> {
  const args: Record<string, unknown> = { choreographyId: draft.id, intensity: draft.intensity, order: draft.order, layers: draft.layers,
    focus: draft.focus, motionBlur: draft.motionBlur, life: draft.life };
  if (draft.duration !== null) args.durationSeconds = draft.duration;
  if (draft.start === "comp") args.startSeconds = 0;
  if (draft.maxSubjects > 0) args.maxSubjects = draft.maxSubjects;
  if (typeof draft.depth === "number" && draft.depth !== CAMERA_DEEP_START_PX) args.depth = draft.depth;
  return args;
}

/** The plan a choreography makes over a scene, as kernel shots ready to pose. */
export function previewPlan(choreo: CameraChoreography, source: ChoreographyScene,
  draft: Pick<ChoreographyDraft, "order" | "maxSubjects"> & Partial<Pick<ChoreographyDraft, "duration" | "intensity" | "life" | "depth">>): { plan: CameraPlan; shots: CameraShotSpec[] } {
  const duration = Math.min(draft.duration ?? choreo.durationSeconds, source.frame.duration);
  const gain = (draft.intensity ?? 100) / 100;
  // The cards only draw the planes, so the focus racks are left out.
  const plan = camPlanChoreography(source.scene, source.frame, choreo, { start: 0, duration, frame: 1 / 30,
    order: draft.order, maxSubjects: draft.maxSubjects, depth: draft.depth ?? CAMERA_DEEP_START_PX, focus: false });
  const shots = plan.beats.map((b) => ({ kind: "visit", start: b.start, dur: b.dur, amount: gain, dir: "to", curve: b.curve, tr: b.tr, rot: b.rot,
    orb: b.orb, lens: b.lens, dolly: 0, imp: b.imp, org: [6, 1, 6, 0], vis: b.vis }) as CameraShotSpec);
  if (draft.life) {
    const breath = CAMERA_RECIPES.find(recipe => recipe.id === "float-loop");
    if (breath) {
      const org = [...breath.shot.org] as CameraShotSpec["org"];
      org[0] = duration / Math.max(1, Math.round(duration / org[0]));
      shots.push({ ...breath.shot, org, start: 0, dur: duration, amount: gain * 0.45 } as CameraShotSpec);
    }
  }
  return { plan, shots };
}

/** The scene's layers on screen at time t, farthest first: [layer index, x0, y0, … x3, y3]. Layers behind the lens are left out. */
export function previewLayers(source: ChoreographyScene, shots: CameraShotSpec[], t: number): number[][] {
  const pose = camPose(t, source.frame, shots), out: Array<[number, number, number[]]> = [];
  source.scene.forEach((layer, index) => {
    const points: number[] = [];
    let depth = Infinity;
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
      const p: CameraVec3 = [layer.c[0] + sx * layer.hw, layer.c[1] + sy * layer.hh, layer.c[2]];
      depth = Math.min(depth, (p[0] - pose.c[0]) * pose.f[0] + (p[1] - pose.c[1]) * pose.f[1] + (p[2] - pose.c[2]) * pose.f[2]);
      const s = camProject(pose, p, source.frame.cx, source.frame.cy);
      points.push(Math.round(s[0]), Math.round(s[1]));
    }
    const centerDepth = (layer.c[0] - pose.c[0]) * pose.f[0] + (layer.c[1] - pose.c[1]) * pose.f[1] + (layer.c[2] - pose.c[2]) * pose.f[2];
    if (depth > 1) out.push([index, centerDepth, points]);
  });
  out.sort((a, b) => b[1] - a[1]);
  return out.map(([index, , points]) => [index, ...points]);
}

export interface ChoreographySectionOptions {
  i18n: I18n;
  draft: ChoreographyDraft;
  source(): ChoreographyScene;
  /** Whether the host read a real scene. */
  real(): boolean;
  frame?(callback: (now: number) => void): number;
  cancelFrame?(handle: number): void;
  onChange(): void;
  /** The gallery shows the cards; the settings pane shows the route and options of the selected one. */
  pane?: "gallery" | "settings";
}

/** Cards, visiting order and options. The apply button lives in the panel's action bar. */
/** Movimento do ícone de cada coreografia (estudo do design system). */
const SCENE_MOVES: Readonly<Record<string, string>> = {
  "deep-reveal": "reveal", "layer-tour": "tour", "full-sequence": "seq", "quick-zooms": "zooms",
  "between-layers": "trav", "hero-orbit": "orbit", "dive-in": "dive"
};

export function createChoreographySection(doc: Document, options: ChoreographySectionOptions): { element: HTMLElement; stop(): void; dispose(): void } {
  const numbers=createToolNumberFields(),numberField=numbers.field;
  const { i18n, draft } = options, en = i18n.locale().startsWith("en"), t = (pt: string, english: string): string => (en ? english : pt);
  const element = createElement(doc, "section", "ch-camera-section ch-camera-choreos");
  const playback = createCameraPreviewPlayback(doc, element, options);

  function stop(): void { playback.stop(); }
  /** Cena do estudo: fundo, plano do meio e plano da frente, com o movimento de cada coreografia. */
  function sceneIcon(id: string): HTMLElement {
    const scene = createElement(doc, "span", "ch-camera-scene");
    scene.setAttribute("aria-hidden", "true");
    const rig = createElement(doc, "span", "ch-camera-rig");
    rig.setAttribute("data-move", SCENE_MOVES[id] ?? "reveal");
    for (const depth of ["back", "mid", "front"]) rig.appendChild(createElement(doc, "i", `ch-camera-rig__plane ch-camera-rig__plane--${depth}`));
    scene.appendChild(rig);
    return scene;
  }
  function card(choreo: CameraChoreography): HTMLElement {
    const button = createElement(doc, "button", "ch-camera-card ch-camera-card--choreo");
    button.setAttribute("type", "button");
    button.setAttribute("data-choreography", choreo.id);
    button.setAttribute("aria-pressed", String(choreo.id === draft.id));
    button.setAttribute("title", choreo.description[en ? "en-US" : "pt-BR"]);
    // Design system 2026-11: o ícone da coreografia é a cena do estudo (três planos sobre preto) que faz o
    // movimento dela no hover. A rota pelas camadas reais continua em Ajustes.
    const scene = sceneIcon(choreo.id), rig = scene.firstChild as HTMLElement;
    button.appendChild(scene);
    const replay = (): void => {
      rig.removeAttribute("data-play"); void rig.offsetWidth; rig.setAttribute("data-play", "true");
    };
    button.addEventListener("mouseenter", replay);
    button.addEventListener("focus", replay);
    button.appendChild(createElement(doc, "span", "ch-camera-card__name", choreo.name[en ? "en-US" : "pt-BR"]));
    button.appendChild(createElement(doc, "span", "ch-camera-card__meta", `${choreo.durationSeconds.toLocaleString(en ? "en-US" : "pt-BR")} s`));
    button.addEventListener("click", () => { draft.id = choreo.id; draft.duration = null; options.onChange(); });
    return button;
  }

  const settings = options.pane === "settings";
  element.setAttribute("data-pane", settings ? "settings" : "gallery");
  element.appendChild(createElement(doc, "div", "ch-section-title", t("Coreografias", "Choreographies")));
  const choreo = CAMERA_CHOREOGRAPHIES.find((c) => c.id === draft.id);
  if (!settings) {
    // Two lines in narrow docks (ae-camera.css); the whole text stays in the tooltip.
    const about = createElement(doc, "p", "ch-camera-status", t(
      "Lê as camadas 3D da cena e monta uma sequência inteira: a câmera vem lá de trás, passa entre as camadas, dá zoom em cada uma com o foco e volta ao layout.",
      "Reads the 3D layers of the scene and builds a whole sequence: the camera comes from the back, passes between the layers, zooms in on each with the focus and returns to the layout."));
    about.title = about.textContent ?? "";
    element.appendChild(about);
    const grid = createElement(doc, "div", "ch-camera-grid");
    for (const entry of CAMERA_CHOREOGRAPHIES) grid.appendChild(card(entry));
    element.appendChild(grid);
  }

  if (choreo && settings) {
    const source = options.source(), { plan } = previewPlan(choreo, source, draft);
    const names = plan.subjects.map((i) => (source.scene[i] as CameraSceneLayer).name);
    const route = createElement(doc, "p", "ch-camera-status ch-camera-route", options.real()
      ? `${t("Visita", "Visits")}: ${names.join(" → ") || "—"}${plan.hidden ? ` · ${t(`${plan.hidden} camada(s) começam atrás da câmera`, `${plan.hidden} layer(s) start behind the camera`)}` : ""}`
      : t("Abra uma composição com camadas 3D ou Parallax para ver as camadas que a câmera vai visitar.", "Open a composition with 3D layers or Parallax to see the layers the camera will visit."));
    route.setAttribute("role", "status");
    element.appendChild(route);
    element.appendChild(numberField(doc, { id: "choreo-duration", label: t("Duração", "Duration"), value: draft.duration ?? choreo.durationSeconds, defaultValue: choreo.durationSeconds,
      min: 2, max: 120, step: 0.5, unit: "s", onCommit: (v) => { draft.duration = v; options.onChange(); } }));
    if (opensDeep(choreo)) {
      element.appendChild(numberField(doc, { id: "choreo-depth", label: t("Profundidade", "Depth"), value: draft.depth ?? CAMERA_DEEP_START_PX,
        defaultValue: CAMERA_DEEP_START_PX, min: 0, max: 6000, step: 100, unit: "px", onCommit: (v) => { draft.depth = v; options.onChange(); } }));
    }
    element.appendChild(selectField(doc, { id: "choreo-order", label: t("Ordem", "Order"), value: draft.order,
      options: [{ value: "auto", label: t("Da coreografia", "From the choreography") }, { value: "back-to-front", label: t("Do fundo para a frente", "Back to front") },
        { value: "front-to-back", label: t("Da frente para o fundo", "Front to back") }, { value: "reading", label: t("Ordem de leitura", "Reading order") },
        { value: "spread", label: t("De canto a canto", "Corner to corner") }],
      onChange: (v) => { draft.order = v; options.onChange(); } }));
    element.appendChild(selectField(doc, { id: "choreo-layers", label: t("Camadas", "Layers"), value: draft.layers,
      options: [{ value: "auto", label: t("Reconhecer automaticamente", "Detect automatically") }, { value: "selection", label: t("Só as selecionadas", "Selected only") }],
      onChange: (v) => { draft.layers = v === "selection" ? "selection" : "auto"; } }));
    element.appendChild(selectField(doc, { id: "choreo-subjects", label: t("Camadas visitadas", "Layers visited"), value: String(draft.maxSubjects),
      options: [{ value: "0", label: t("Da coreografia", "From the choreography") }, ...[1, 2, 3, 4, 5, 6].map((n) => ({ value: String(n), label: String(n) }))],
      onChange: (v) => { draft.maxSubjects = Number(v) || 0; options.onChange(); } }));
    element.appendChild(selectField(doc, { id: "choreo-start", label: t("Início", "Start"), value: draft.start,
      options: [{ value: "now", label: t("Tempo atual", "Current time") }, { value: "comp", label: t("Início da composição", "Composition start") }],
      onChange: (v) => { draft.start = v === "comp" ? "comp" : "now"; } }));
    element.appendChild(numberField(doc, { id: "choreo-intensity", label: t("Intensidade", "Intensity"), value: draft.intensity, defaultValue: 100, min: 0, max: 200, step: 5, unit: "%",
      onCommit: (v) => { draft.intensity = v; options.onChange(); } }));
    const check = (id: string, label: string, value: boolean, set: (v: boolean) => void): void => {
      element.appendChild(checkboxField(doc, { id, label, checked: value, onChange: set }));
    };
    check("choreo-focus", t("Foco automático em cada camada", "Auto focus on each layer"), draft.focus, (v) => { draft.focus = v; });
    check("choreo-blur", t("Motion blur na composição", "Motion blur on the composition"), draft.motionBlur, (v) => { draft.motionBlur = v; });
    check("choreo-life", t("Respiração orgânica", "Organic breathing"), draft.life, (v) => { draft.life = v; options.onChange(); });
  }
  return { element, stop, dispose(){playback.dispose();numbers.dispose();} };
}
