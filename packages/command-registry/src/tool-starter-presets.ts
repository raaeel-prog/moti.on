import {
  WORD_REVEAL_DEFAULTS, PROXIMITY_MORPH_DEFAULTS, STYLE_SWAP_DEFAULTS,
  createGradientSettings, cloneParticleArgs, pulsePresetArgs, type QuickContext, type QuickProfile
} from "@motion/contracts";
import { scaleQuickPixelsFrom1080 } from "./quick-defaults.js";

/** Initial editor recipes. Never store user drafts, selection tokens or host objects here.
 * Quick, editor initialization and Reset all copy these same recipes. */
const drafts = {
  loopOut: {
  type: "cycle",
  range: "all",
  numKeyframes: 1,
  duration: 1
},
  smooth: {
  widthSeconds: 0.2,
  samples: 5,
  reference: "current",
  referenceTime: 0
},
  wiggle: {
  frequency: 2,
  amplitude: 20,
  octaves: 1,
  amplitudeMultiplier: 0.5,
  seed: 0
},
  flicker: {
  rate: 6,
  minFactor: 0.7,
  maxFactor: 1,
  seed: 0
},
  parent: {
  targetLayerIndex: 0,
  targetLayerName: "",
  preserveWorldTransform: true,
  unparent: false,
  chainMode: "target"
},
  anchor: {
  gridPoint: "center",
  mode: "normal",
  timeMode: "currentTime",
  fixedTime: 0,
  includeExtents: false,
  preserveVisualPosition: true,
  randomSeed: 0
},
  cutKeys: {
  rangeMode: "afterCti",
  startTime: 0,
  endTime: 0,
  includeBoundary: false
},
  delay: {
  delayFrames: 2,
  order: "timeline",
  reverse: false,
  randomSeed: 0,
  originX: 0,
  originY: 0,
  shiftMode: "layerStart"
},
  rename: {
  scope: "selected",
  prefix: "",
  suffix: "",
  find: "",
  replace: "",
  regex: false,
  counterStart: 1,
  padding: 0,
  sourceName: false
},
  reverseOrder: {
  scope: "selected",
  preserveTrackMattes: true,
  preserveParents: true,
  reverseTimingToo: false
},
  flip: {
  axis: "horizontal",
  pivot: "anchor",
  groupMode: "each",
  preserveTextReadability: true
},
  createNull: {
  placement: "compCenter",
  dimension: "2d",
  parentSelected: false,
  preserveWorldTransform: true,
  size: 100,
  label: 0
},
  textBox: {
  paddingX: 24,
  paddingY: 14,
  roundness: 8,
  fillColor: "#000000",
  fillOpacity: 100
},
  timeController: {
  applyTo: "layer",
  speedPercent: 100,
  offsetFrames: 0,
  reverse: false,
  freeze: false,
  freezeFrame: 0
},
  neon: {
  coreColor: "#ffffff",
  glowColor: "#33ccff",
  strokeWidth: 4,
  glowRadius: 40,
  intensity: 2
},
  sendToEdge: { edge: "start", reference: "comp" },
  cloneKeys: { mode: "repeat", destination: "after" },
  animateKinetic: {
  direction: "in",
  durationFrames: 15,
  overshoot: 1.2,
  rotation: 0,
  scale: 100,
  opacity: 100,
  staggerFrames: 0,
  // O host aceita "none" | "chars" | "words" | "lines"; estava "word".
  splitMode: "none"
},
  inertial: {
  amplitude: 60,
  frequency: 2.5,
  decay: 6,
  maxDurationFrames: 120,
  startMode: "lastKey"
},
  jump: {
  height: 300,
  durationFrames: 20,
  direction: "up",
  squashStretch: 12,
  anticipationFrames: 4,
  staggerFrames: 0
},
  lookAt: {
  targetLayerName: "",
  forwardAxis: "+z",
  offsetOrientation: [0, 0, 0],
  constrainAxes: { x: false, y: false, z: false }
},
  echo: {
  echoTime: -0.05,
  numberOfEchoes: 6,
  startingIntensity: 0.9,
  decay: 0.7,
  operator: "screen",
  animate: false
},
  breakShape: {
  keepOriginal: true,
  preserveAppearance: true,
  namingMode: "groupName"
},
  effector: {
  radius: 400,
  falloffCurve: "smoothstep",
  curve: { x1: 0.33, y1: 0, x2: 0.67, y2: 1 },
  positionAmount: 200,
  scaleAmount: 0,
  rotationAmount: 0,
  opacityAmount: 0
},
  cameraTransition: {
  preset: "pushIn",
  durationFrames: 24,
  amount: 400,
  // Ease in-out simétrico: o começo e o fim suaves, que é o que um movimento de
  // câmera pede por padrão.
  curve: { x1: 0.33, y1: 0, x2: 0.67, y2: 1 }
},
  cylinder: {
  radius: 500,
  height: 0,
  count: 8,
  faceMode: "outward",
  startAngle: 0,
  arcDegrees: 360,
  createCamera: true
},
  cube: {
  size: 400,
  sourceMode: "duplicateOne",
  faceFit: true,
  createCamera: true
},
  wave: {
  mode: "transform",
  amplitude: 40,
  frequency: 50,
  speed: 1,
  direction: "vertical",
  phase: 0,
  falloff: 0,
  bake: false
},
  tile: {
  mode: "effect",
  outputWidth: 200,
  outputHeight: 200,
  mirrorEdges: true,
  gridRows: 3,
  gridColumns: 3,
  spacing: 200
},
  glitch: {
  mode: "continuous",
  intensity: 0.6,
  frequency: 12,
  rgbSplit: 15,
  displacement: 40,
  seed: 1,
  durationFrames: 12
},
  parallaxFull: {
  operation: "create",
  targetLayerName: "",
  focusOffset: 0,
  enableDepthOfField: true,
  zoomLevel: 2000,
  zoomDurationFrames: 30,
  frequency: 2,
  amplitude: 50,
  seed: 12345,
  stepFrames: 1
},
  parallax: {
  depthStep: 0,
  strength: 1,
  orderMode: "timeline",
  reverseOrder: false,
  createCamera: true,
  preserveFraming: true,
  controllerName: "Parallax",
  depthMode: "linear",
  backgroundDepth: 0
},
  fastEdit: {
  operation: "trimToWorkArea",
  duration: 10,
  frameRate: 25,
  width: 1920,
  height: 1080,
  precomposeName: "Precomp",
  moveAllAttributes: true
},
  shapeLibrary: {
  shapeType: "rectangle",
  size: 200,
  // RGB normalizado, que e o que o After Effects usa. Cinza claro para a forma
  // aparecer contra o fundo escuro de uma composicao recem-criada.
  fillColor: [0.85, 0.85, 0.85],
  strokeColor: [0, 0, 0],
  strokeWidth: 0,
  roundness: 20,
  points: 5
},
  trimPath: {
  scope: "layer",
  start: 0,
  end: 100,
  offset: 0,
  animate: true,
  durationFrames: 24,
  reverse: false
},
  pasteKeys: {
  pasteTime: "cti",
  mappingMode: "matchName",
  relativeTiming: true,
  includeExpressions: false,
  includeTangents: true
},
  timeMarkerLoop: {
  inMarkerName: "in",
  outMarkerName: "out",
  loopType: "cycle",
  autoCreateMarkers: false,
  clampToLayer: true
},
  aiToVector: { keepOriginal: true },
  textToVector: { keepOriginal: true },
  particles: cloneParticleArgs(),
  texture: { blendMode: "overlay", opacity: 100 },
  clean: { scanToken: null, findings: [], selectedItemIds: [] },
  orbit: { preset: "frontal", radius: 300, speed: 60, inclination: 0, azimuth: 0, bank: 0, phase: 0, spread: 100, targetMode: "newController", faceTarget: false, bake: false },
  wordReveal: { ...WORD_REVEAL_DEFAULTS },
  variableMorph: { ...PROXIMITY_MORPH_DEFAULTS },
  styleSwap: { ...STYLE_SWAP_DEFAULTS },
  verticalPulse: pulsePresetArgs("impact", 30),
  gradient: createGradientSettings(),
  // Other easing modes keep their algorithm defaults in keyframe-core.
  ease: { x1: 0.22, y1: 1, x2: 0.36, y2: 1, applyIn: true, applyOut: true, convertHold: false }
};

export type ToolStarterId = keyof typeof drafts;

type DeepReadonly<T> = T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K]> } : T;
function freezeDeep<T>(value: T): DeepReadonly<T> {
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) freezeDeep(item);
    Object.freeze(value);
  }
  return value as DeepReadonly<T>;
}
function copy<T>(value: T): T {
  if (Array.isArray(value)) return value.map(item => copy(item)) as T;
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copy(item)])) as T;
  return value;
}

export const TOOL_STARTER_DRAFTS: DeepReadonly<typeof drafts> = freezeDeep(copy(drafts));

/** Map stays explicit: read commands and state-free actions do not get fake drafts. */
export const TOOL_STARTER_COMMANDS: Readonly<Record<string, ToolStarterId>> = Object.freeze({
  "ae.expression.loopout": "loopOut", "ae.expression.smooth": "smooth",
  "ae.expression.wiggle": "wiggle", "ae.expression.flicker": "flicker",
  "ae.layer.parent": "parent", "ae.anchor.align": "anchor", "ae.keys.cut": "cutKeys",
  "ae.keys.delay": "delay", "ae.layer.rename": "rename", "ae.layer.reverse-order": "reverseOrder",
  "ae.layer.flip": "flip", "ae.layer.create-null": "createNull", "ae.text.box": "textBox",
  "ae.time.controller": "timeController", "ae.style.neon": "neon", "ae.keys.send-to-edge": "sendToEdge",
  "ae.keys.clone": "cloneKeys", "ae.animate.kinetic": "animateKinetic", "ae.animate.inertial": "inertial",
  "ae.animate.jump": "jump", "ae.3d.look-at": "lookAt", "ae.effect.echo": "echo",
  "ae.shape.break": "breakShape", "ae.rig.effector": "effector", "ae.camera.transition": "cameraTransition",
  "ae.3d.cylinder": "cylinder", "ae.3d.cube": "cube", "ae.effect.wave": "wave",
  "ae.effect.tile": "tile", "ae.effect.glitch": "glitch", "ae.animate.parallax.quick": "parallax",
  "ae.parallax.create": "parallax", "ae.parallax.adjust": "parallax", "ae.comp.fast-edit": "fastEdit",
  "ae.shape.library": "shapeLibrary", "ae.shape.trim-path": "trimPath", "ae.keys.paste": "pasteKeys",
  "ae.time.marker-loop": "timeMarkerLoop", "ae.vector.ai-to-vector": "aiToVector",
  "ae.vector.text-to-vector": "textToVector", "ae.effect.particles": "particles", "ae.asset.texture": "texture",
  "ae.project.clean": "clean", "ae.3d.orbit": "orbit", "ae.text.word-reveal": "wordReveal",
  "ae.text.variable-morph": "variableMorph", "ae.text.style-swap": "styleSwap",
  "ae.text.vertical-pulse": "verticalPulse", "ae.effect.gradient": "gradient", "ae.keys.ease.apply": "ease"
});

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

/** A new, deeply independent draft for initial opening or an explicit Reset.
 * Context is sampled by the caller at that action, never retained in a recipe. */
export function getToolStarterDraft<T extends object = Record<string, unknown>>(toolId: ToolStarterId, context?: Readonly<QuickContext>): T;
export function getToolStarterDraft<T extends object = Record<string, unknown>>(toolId: string, context?: Readonly<QuickContext>): T | undefined;
export function getToolStarterDraft<T extends object = Record<string, unknown>>(toolId: string, context?: Readonly<QuickContext>): T | undefined {
  if (!Object.prototype.hasOwnProperty.call(TOOL_STARTER_DRAFTS, toolId)) return undefined;
  const result = copy(TOOL_STARTER_DRAFTS[toolId as ToolStarterId]) as Record<string, unknown>;
  if (!context) return result as T;
  switch (toolId) {
    case "wiggle": result["amplitude"] = scaleQuickPixelsFrom1080(20, context); break;
    case "createNull":
      result["placement"] = context.selectionLayerCount > 0 ? "averageAnchor" : "compCenter";
      result["parentSelected"] = context.selectionLayerCount > 0;
      result["dimension"] = context.selectionIs3D ? "3d" : "2d";
      result["size"] = clamp(Math.round(scaleQuickPixelsFrom1080(100, context)), 1, 10000);
      break;
    case "reverseOrder": result["scope"] = context.selectionLayerCount >= 2 ? "selected" : "composition"; break;
    case "wordReveal":
      result["durationFrames"] = clamp(Math.round(context.fps * 1.2), 4, 180);
      result["staggerFrames"] = clamp(Math.round(context.fps / 6), 0, 60);
      break;
    case "variableMorph": result["radius"] = clamp(250 * context.compHeight / 1080, 1, 5000); break;
    case "styleSwap": result["durationFrames"] = clamp(Math.round(context.fps * 0.8), 1, 300); break;
    case "verticalPulse": return copy(pulsePresetArgs("impact", context.fps)) as T;
    case "orbit": result["radius"] = Math.max(1, Math.round(Math.min(context.compWidth, context.compHeight) * 0.25)); break;
    case "cube": result["size"] = clamp(Math.round(400 * Math.min(context.compWidth, context.compHeight) / 1080), 1, 10000); break;
    case "cylinder": result["radius"] = clamp(Math.round(500 * Math.min(context.compWidth, context.compHeight) / 1080), 1, 10000); break;
    case "jump":
      result["height"] = 180 * context.compHeight / 1080;
      result["durationFrames"] = Math.max(1, Math.round(context.fps * 0.67));
      break;
    case "cameraTransition":
      result["durationFrames"] = Math.max(1, Math.round(context.fps));
      result["amount"] = 400 * context.compWidth / 1920;
      break;
    case "shapeLibrary": result["size"] = 200 * context.compHeight / 1080; break;
  }
  return result as T;
}

function channels(hex: string): number[] {
  return [1, 3, 5].map(index => Number.parseInt(hex.slice(index, index + 2), 16) / 255);
}

/** Exact host argument conversion, not an additional independent set of defaults.
 * This does not authorize Quick: destructive and editor-only tools retain their gates. */
export function deriveToolStarterArgs(commandId: string, context: Readonly<QuickContext>): Record<string, unknown> | undefined {
  if (commandId === "ae.audio.beat") return { beatMin: 30, beatMax: 90, mode: 1, bumpMin: 0, bumpMax: 110, shakeFreq: 10, shakeAmp: 30 };
  const toolId = TOOL_STARTER_COMMANDS[commandId];
  if (!toolId) return undefined;
  const draft = getToolStarterDraft(toolId, context);
  switch (toolId) {
    // A target identity cannot be inferred from counts; the editor must ask for it.
    case "parent": return undefined;
    case "loopOut": return { type: draft["type"], numKeyframes: 0, duration: 0, useDuration: false, conflictMode: "skip" };
    case "smooth": return { widthSeconds: draft["widthSeconds"], samples: draft["samples"], referenceTime: "current", conflictMode: "skip" };
    case "wiggle": case "flicker": return { ...draft, conflictMode: "skip" };
    case "anchor": return { ...draft, boundsSource: "visual", preview: false };
    case "delay": {
      const { originX, originY, ...fields } = draft;
      return { ...fields, spatialOrigin: [originX, originY] };
    }
    case "textBox": return { ...draft, fillColor: channels(draft["fillColor"] as string), createPerLayer: true, conflictMode: "skip" };
    case "neon": return { ...draft, mode: "editable", coreColor: channels(draft["coreColor"] as string), glowColor: channels(draft["glowColor"] as string) };
    case "lookAt": return { ...draft, upAxis: "+y" };
    case "effector": return { ...draft, effectorType: "null" };
    case "rename": return { ...draft, preview: false };
    case "breakShape": return { ...draft, recursive: false };
    case "cube": return { ...draft, controllerOrientation: [0, 0, 0], keepSources: true };
    case "glitch": return { ...draft, frameHold: false };
    case "cameraTransition": return { ...draft, cameraName: "" };
    case "shapeLibrary": return { ...draft, position: [context.compWidth / 2, context.compHeight / 2] };
    case "cutKeys": return { ...draft, previewOnly: false };
    case "fastEdit": return { operation: draft["operation"] };
    case "clean": return { removeConfirmed: false };
    case "gradient": return { action: "apply", settings: draft };
    default: return draft;
  }
}

export interface ToolStarterProfile {
  readonly commandId: string;
  readonly toolId: ToolStarterId;
  readonly resettable: true;
}
const starterProfiles = new Map(Object.entries(TOOL_STARTER_COMMANDS).map(([commandId, toolId]) => [commandId, Object.freeze({ commandId, toolId, resettable: true as const })]));

/** Metadata for editor/default integration; it never grants Quick availability. */
export function getToolStarterProfile(commandId: string): Readonly<ToolStarterProfile> | undefined {
  return starterProfiles.get(commandId);
}

function operation(commandId: string, id: string, pt: string, en: string, needsPt: string, needsEn: string): QuickProfile {
  return {
    factoryPresetId: id, derive: context => deriveToolStarterArgs(commandId, context)!, liveControls: [],
    previewAssetId: `preview.${id}`, oneLine: { "pt-BR": pt, "en-US": en },
    needs: { "pt-BR": needsPt, "en-US": needsEn }, budgetMs: 1000
  };
}

/** The operations previously hidden in main.ts now participate in registry validation. */
export const TOOL_OPERATION_QUICK_PROFILES: Readonly<Record<string, QuickProfile>> = {
  "ae.text.word-reveal": operation("ae.text.word-reveal", "wordreveal.editorial", "Revela palavras com formação suave.", "Reveals words with a smooth formation.", "Selecione texto editável.", "Select editable text."),
  "ae.text.variable-morph": operation("ae.text.variable-morph", "variablemorph.soft-weight", "Dá peso e presença ao texto por proximidade.", "Adds text weight and presence by proximity.", "Selecione texto editável.", "Select editable text."),
  "ae.text.style-swap": operation("ae.text.style-swap", "styleswap.characters", "Alterna o estilo por caractere.", "Swaps style per character.", "Selecione texto editável.", "Select editable text."),
  "ae.text.vertical-pulse": operation("ae.text.vertical-pulse", "verticalpulse.impact", "Forma um pulso tipográfico de impacto.", "Creates an impactful typographic pulse.", "Selecione texto editável.", "Select editable text."),
  "ae.animate.parallax.quick": operation("ae.animate.parallax.quick", "parallax.timeline", "Distribui profundidade preservando o enquadramento.", "Distributes depth while preserving framing.", "Selecione duas camadas visuais editáveis.", "Select two editable visual layers."),
  "ae.keys.delay": operation("ae.keys.delay", "delay.timeline", "Escalona camadas pela ordem da timeline.", "Staggers layers in timeline order.", "Selecione duas ou mais camadas.", "Select two or more layers."),
  "ae.3d.look-at": operation("ae.3d.look-at", "lookat.target", "Orienta as camadas para o alvo selecionado.", "Orients layers toward the selected target.", "Selecione camadas e um alvo compatível.", "Select layers and a compatible target."),
  "ae.3d.orbit": operation("ae.3d.orbit", "orbit.frontal", "Cria uma órbita frontal editável.", "Creates an editable frontal orbit.", "Selecione camadas visuais editáveis.", "Select editable visual layers."),
  "ae.keys.paste": operation("ae.keys.paste", "keyspaste.cti", "Cola no cursor conservando tangentes e intervalos.", "Pastes at the cursor preserving tangents and spacing.", "Copie keys e selecione propriedades compatíveis.", "Copy keys and select compatible properties."),
  "ae.keys.clone": operation("ae.keys.clone", "keysclone.repeat", "Repete os keyframes depois da seleção.", "Repeats keyframes after the selection.", "Selecione dois ou mais keyframes.", "Select two or more keyframes."),
  "ae.vector.ai-to-vector": operation("ae.vector.ai-to-vector", "vector.illustrator", "Converte Illustrator preservando a origem.", "Converts Illustrator while keeping the source.", "Selecione uma camada Illustrator.", "Select an Illustrator layer."),
  "ae.vector.text-to-vector": operation("ae.vector.text-to-vector", "vector.text", "Converte texto em formas editáveis.", "Converts text to editable shapes.", "Selecione uma camada de texto.", "Select a text layer."),
  "ae.animate.jump": operation("ae.animate.jump", "jump.soft", "Cria um salto com antecipação suave.", "Creates a jump with gentle anticipation.", "Selecione camadas visuais editáveis.", "Select editable visual layers."),
  "ae.camera.transition": operation("ae.camera.transition", "camera.push-in", "Aproxima a câmera com entrada e saída suaves.", "Pushes the camera in with smooth acceleration.", "Abra uma composição com câmera compatível.", "Open a composition with a compatible camera."),
  "ae.shape.library": operation("ae.shape.library", "shape.rectangle", "Cria uma forma editável no centro da composição.", "Creates an editable shape at the composition center.", "Abra uma composição.", "Open a composition.")
};
