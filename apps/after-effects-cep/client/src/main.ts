/**
 * Raiz de composição do painel do After Effects.
 *
 * Liga apresentação → cliente de comandos → adapter de host. Este arquivo e o
 * `host-adapter.ts` são os únicos que sabem que o host é o After Effects; tudo
 * que for reaproveitável entre os dois hosts vive em `packages/`.
 *
 * A apresentação é o shell compartilhado de `@motion/ui-core` (CHMS-008): a
 * navegação, os tokens e a i18n são os mesmos do painel do Premiere, e o que
 * muda entre os dois é apenas quais linhas cada view desenha.
 */
import type { CommandResponse, HostCapabilities } from "@motion/contracts";
import { buildCapabilities, type ProbeFacts } from "@motion/capability-matrix";
import { createLogger, type MotionLogger } from "@motion/logging";
import {
  anchorGrid,
  button,
  checkboxField,
  colorField,
  createI18n,
  createShell,
  hint,
  logLine,
  notice,
  normalizeHexColor,
  numberField,
  propertyRow,
  sectionTitle,
  selectField,
  textField,
  toolGrid,
  toolTile,
  bezierEditor,
  type I18n,
  type RenderRegions,
  type RowTone,
  type Shell,
  type ShellView
} from "@motion/ui-core";
import {
  createBrowserReducedMotionController,
  type ReducedMotionController
} from "@motion/ui-motion";

import { createAeHostAdapter } from "./host-adapter.js";

interface ContextData {
  hostVersion: string | null;
  projectName: string | null;
  projectPath: string | null;
  activeItemName: string | null;
  isComposition: boolean;
  compWidth: number | null;
  compHeight: number | null;
  compDuration: number | null;
  compFrameRate: number | null;
}

type LoopOutType = "cycle" | "pingpong" | "offset" | "continue";
type LoopOutRange = "all" | "keys" | "duration";

interface LoopOutDraft {
  type: LoopOutType;
  range: LoopOutRange;
  numKeyframes: number;
  duration: number;
}

interface LoopOutResultData {
  appliedCount: number;
  unchangedCount: number;
}

/** Mesma forma do LoopOut: os dois comandos reportam o lote da mesma maneira. */
type SmoothResultData = LoopOutResultData;

const DEFAULT_LOOP_OUT: LoopOutDraft = {
  type: "cycle",
  range: "all",
  numKeyframes: 1,
  duration: 1
};

type SmoothReference = "current" | "fixed";

interface SmoothDraft {
  widthSeconds: number;
  samples: number;
  reference: SmoothReference;
  referenceTime: number;
}

interface WiggleDraft {
  frequency: number;
  amplitude: number;
  octaves: number;
  amplitudeMultiplier: number;
  seed: number;
}

/**
 * Padroes: 2 oscilacoes por segundo e amplitude 30, o exemplo mais comum de
 * wiggle para posicao. Oitavas e queda repetem os padroes da propria Adobe (1 e
 * 0.5), e semente 0 e o offset padrao — ou seja, o estado inicial nao altera o
 * comportamento nativo da expressao.
 */
const DEFAULT_WIGGLE: WiggleDraft = {
  frequency: 2,
  amplitude: 30,
  octaves: 1,
  amplitudeMultiplier: 0.5,
  seed: 0
};

interface FlickerDraft {
  rate: number;
  minFactor: number;
  maxFactor: number;
  seed: number;
}

/**
 * Padroes: 12 atualizacoes por segundo, fator entre 0 e 1. O fator multiplica
 * o valor da propriedade, entao 0 apaga no quadro sorteado e 1 mantem o valor
 * original — a faixa padrao e a piscada classica de opacidade.
 */
const DEFAULT_FLICKER: FlickerDraft = {
  rate: 12,
  minFactor: 0,
  maxFactor: 1,
  seed: 0
};

interface LayerSummary {
  index: number;
  name: string;
  type: string;
  parentIndex: number | null;
  selected: boolean;
}

type ChainMode = "target" | "chain";

interface ParentDraft {
  /** `0` significa "nenhum alvo". O host recusa isso fora do modo encadear. */
  targetLayerIndex: number;
  /** Soma de verificação contra timeline mudado entre a leitura e o clique. */
  targetLayerName: string;
  preserveWorldTransform: boolean;
  unparent: boolean;
  chainMode: ChainMode;
}

/**
 * `preserveWorldTransform` nasce ligado porque é o comportamento do pickwhip do
 * timeline: reparentar sem mexer na aparência. Chegar com ele desligado faria as
 * camadas saltarem no primeiro clique de quem não leu o campo.
 */
const DEFAULT_PARENT: ParentDraft = {
  targetLayerIndex: 0,
  targetLayerName: "",
  preserveWorldTransform: true,
  unparent: false,
  chainMode: "target"
};

type AnchorGridPoint =
  | "topLeft"
  | "topCenter"
  | "topRight"
  | "midLeft"
  | "center"
  | "midRight"
  | "bottomLeft"
  | "bottomCenter"
  | "bottomRight";

const ANCHOR_GRID: ReadonlyArray<{ ponto: AnchorGridPoint; rotulo: MessageKey }> = [
  { ponto: "topLeft", rotulo: "anchor.grid.topLeft" },
  { ponto: "topCenter", rotulo: "anchor.grid.topCenter" },
  { ponto: "topRight", rotulo: "anchor.grid.topRight" },
  { ponto: "midLeft", rotulo: "anchor.grid.midLeft" },
  { ponto: "center", rotulo: "anchor.grid.center" },
  { ponto: "midRight", rotulo: "anchor.grid.midRight" },
  { ponto: "bottomLeft", rotulo: "anchor.grid.bottomLeft" },
  { ponto: "bottomCenter", rotulo: "anchor.grid.bottomCenter" },
  { ponto: "bottomRight", rotulo: "anchor.grid.bottomRight" }

];
interface AnchorDraft {
  gridPoint: AnchorGridPoint;
  mode: "normal" | "reverse" | "random";
  timeMode: "currentTime" | "fixed";
  fixedTime: number;
  includeExtents: boolean;
  preserveVisualPosition: boolean;
  randomSeed: number;
}

/**
 * Centro com aparência preservada: é o alinhamento que se pede na maior parte
 * das vezes, e é o único que não move nada ao ser aplicado sem pensar.
 */
const DEFAULT_ANCHOR: AnchorDraft = {
  gridPoint: "center",
  mode: "normal",
  timeMode: "currentTime",
  fixedTime: 0,
  includeExtents: false,
  preserveVisualPosition: true,
  randomSeed: 0
};

type CutRangeMode =
  | "beforeCti"
  | "afterCti"
  | "insideWorkArea"
  | "outsideWorkArea"
  | "betweenMarkers";

interface CutKeysDraft {
  rangeMode: CutRangeMode;
  startTime: number;
  endTime: number;
  includeBoundary: boolean;
}

/**
 * "Depois do cursor" é o corte mais comum e não pede nenhum número: a
 * ferramenta abre pronta para uso.
 *
 * Os tempos nascem zerados porque o host exige que campos inativos sejam
 * canônicos — ele recusa valores fora do modo em vez de ignorá-los em silêncio,
 * e o painel precisa mandar exatamente zero quando o modo não os usa.
 */
const DEFAULT_CUT_KEYS: CutKeysDraft = {
  rangeMode: "afterCti",
  startTime: 0,
  endTime: 0,
  includeBoundary: false
};

type DelayOrder = "timeline" | "selection" | "name" | "distance" | "random";

interface DelayDraft {
  delayFrames: number;
  order: DelayOrder;
  reverse: boolean;
  randomSeed: number;
  originX: number;
  originY: number;
  shiftMode: "layerStart" | "keyframes";
}

/** Dois quadros por passo na ordem do timeline: a cascata clássica. */
const DEFAULT_DELAY: DelayDraft = {
  delayFrames: 2,
  order: "timeline",
  reverse: false,
  randomSeed: 0,
  originX: 0,
  originY: 0,
  shiftMode: "layerStart"
};

type LayerScope = "selected" | "composition";

interface RenameDraft {
  scope: LayerScope;
  prefix: string;
  suffix: string;
  find: string;
  replace: string;
  regex: boolean;
  counterStart: number;
  padding: number;
  sourceName: boolean;
}

/**
 * Contador desligado por padrão (`padding: 0`) e escopo na seleção.
 *
 * Abrir a ferramenta não pode propor uma renomeação em massa da composição
 * inteira: o escopo mais amplo precisa ser uma escolha, não o que já está
 * marcado quando a pessoa chega.
 */
const DEFAULT_RENAME: RenameDraft = {
  scope: "selected",
  prefix: "",
  suffix: "",
  find: "",
  replace: "",
  regex: false,
  counterStart: 1,
  padding: 0,
  sourceName: false
};

interface ReverseOrderDraft {
  scope: LayerScope;
  preserveTrackMattes: boolean;
  preserveParents: boolean;
  reverseTimingToo: boolean;
}

/** Preservar relações é o padrão; mexer no tempo exige pedido explícito (§7). */
const DEFAULT_REVERSE_ORDER: ReverseOrderDraft = {
  scope: "selected",
  preserveTrackMattes: true,
  preserveParents: true,
  reverseTimingToo: false
};

interface FlipDraft {
  axis: "horizontal" | "vertical";
  pivot: "anchor" | "selectionBounds" | "compCenter";
  groupMode: "each" | "group";
  preserveTextReadability: boolean;
}

/**
 * Horizontal em torno da âncora é o espelhamento que a pessoa espera de um
 * comando chamado "Espelhar": a camada não sai do lugar e só o conteúdo inverte.
 * Legibilidade preservada nasce ligada porque texto invertido raramente é o
 * pedido — e quem quiser o efeito desliga um campo.
 */
const DEFAULT_FLIP: FlipDraft = {
  axis: "horizontal",
  pivot: "anchor",
  groupMode: "each",
  preserveTextReadability: true
};

type NullPlacement = "compCenter" | "averageAnchor" | "selectionBounds";

interface CreateNullDraft {
  placement: NullPlacement;
  dimension: "2d" | "3d";
  parentSelected: boolean;
  preserveWorldTransform: boolean;
  size: number;
  /** Índice de rótulo do After Effects, 0 a 16 — não o nome da camada. */
  label: number;
}

/**
 * Centro da composição sem parentear é o caso que funciona com zero seleção, e
 * por isso é o padrão: abrir a ferramenta e clicar em Aplicar produz algo útil
 * mesmo com nada selecionado.
 */
const DEFAULT_CREATE_NULL: CreateNullDraft = {
  placement: "compCenter",
  dimension: "2d",
  parentSelected: false,
  preserveWorldTransform: true,
  size: 100,
  label: 0
};

interface TextBoxDraft {
  paddingX: number;
  paddingY: number;
  roundness: number;
  /** `#rrggbb` minusculo; convertido para os canais 0..1 do host no envio. */
  fillColor: string;
  fillOpacity: number;
}

/**
 * Padroes de legenda: margem confortavel, canto levemente arredondado, preto
 * opaco. Preto e a escolha que funciona sobre qualquer material sem virar
 * decisao de design — quem quiser cor troca num campo.
 */
const DEFAULT_TEXT_BOX: TextBoxDraft = {
  paddingX: 24,
  paddingY: 14,
  roundness: 8,
  fillColor: "#000000",
  fillOpacity: 100
};

/**
 * Padroes do `smooth()` do After Effects: janela de 0,2 s e 5 amostras. Sao os
 * valores que a documentacao da Adobe usa quando os argumentos sao omitidos, e
 * comecar longe deles faria o resultado surpreender quem ja conhece a expressao.
 */
const DEFAULT_SMOOTH: SmoothDraft = {
  widthSeconds: 0.2,
  samples: 5,
  reference: "current",
  referenceTime: 0
};


interface EaseDraft {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  applyIn: boolean;
  applyOut: boolean;
}


type TimeControllerApplyTo = "layer" | "properties";

interface TimeControllerDraft {
  applyTo: TimeControllerApplyTo;
  speedPercent: number;
  offsetFrames: number;
  reverse: boolean;
  freeze: boolean;
  freezeFrame: number;
}

const DEFAULT_TIME_CONTROLLER: TimeControllerDraft = {
  applyTo: "layer",
  speedPercent: 100,
  offsetFrames: 0,
  reverse: false,
  freeze: false,
  freezeFrame: 0
};


type ReverseKeysDraft = Record<string, never>;
const DEFAULT_REVERSE_KEYS: ReverseKeysDraft = {};
type CloneKeysMode = "repeat" | "mirror";
interface CloneKeysDraft { mode: CloneKeysMode; }
const DEFAULT_CLONE_KEYS: CloneKeysDraft = { mode: "repeat" };

type AnimateKineticDirection = "in" | "out" | "both";
type AnimateKineticSplit = "none" | "chars" | "words" | "lines";

interface AnimateKineticDraft {
  direction: AnimateKineticDirection;
  durationFrames: number;
  /**
   * Quanto a animação passa do alvo antes de assentar. É **número**, de 0 a 10,
   * e não um liga/desliga: o host recusa qualquer outra coisa. Estava declarado
   * `boolean` aqui, e por isso o comando falhava em toda execução.
   */
  overshoot: number;
  rotation: number;
  scale: number;
  opacity: number;
  staggerFrames: number;
  splitMode: AnimateKineticSplit;
}
const DEFAULT_ANIMATE_KINETIC: AnimateKineticDraft = {
  direction: "in",
  durationFrames: 15,
  overshoot: 1.2,
  rotation: 0,
  scale: 100,
  opacity: 100,
  staggerFrames: 0,
  // O host aceita "none" | "chars" | "words" | "lines"; estava "word".
  splitMode: "none"
};

type InertialStartMode = "everyKey" | "lastKey";

interface InertialDraft {
  amplitude: number;
  frequency: number;
  decay: number;
  maxDurationFrames: number;
  startMode: InertialStartMode;
}

const DEFAULT_INERTIAL: InertialDraft = {
  amplitude: 100,
  frequency: 2,
  decay: 4,
  maxDurationFrames: 30,
  startMode: "lastKey"
};

type JumpDirection = "up" | "down" | "left" | "right";

interface JumpDraft {
  height: number;
  durationFrames: number;
  direction: JumpDirection;
  squashStretch: number;
  anticipationFrames: number;
  staggerFrames: number;
}

const DEFAULT_JUMP: JumpDraft = {
  height: 300,
  durationFrames: 20,
  direction: "up",
  squashStretch: 12,
  anticipationFrames: 4,
  staggerFrames: 0
};

type LookAtAxis = "+z" | "-z" | "+x" | "-x";

interface LookAtDraft {
  targetLayerName: string;
  forwardAxis: LookAtAxis;
  constrainAxes: { x: boolean; y: boolean; z: boolean };
}

const DEFAULT_LOOK_AT: LookAtDraft = {
  targetLayerName: "",
  forwardAxis: "+z",
  constrainAxes: { x: false, y: false, z: false }
};

type OrbitTargetMode = "newController" | "reuseController";

interface OrbitDraft {
  radius: number;
  speed: number;
  inclination: number;
  phase: number;
  targetMode: OrbitTargetMode;
  faceTarget: boolean;
  bake: boolean;
}

const DEFAULT_ORBIT: OrbitDraft = {
  radius: 400,
  speed: 60,
  inclination: 15,
  phase: 0,
  targetMode: "newController",
  faceTarget: true,
  bake: false
};

type EchoOperator =
  | "add"
  | "maximum"
  | "minimum"
  | "screen"
  | "compositeInBack"
  | "compositeInFront"
  | "blend";

interface EchoDraft {
  echoTime: number;
  numberOfEchoes: number;
  startingIntensity: number;
  decay: number;
  operator: EchoOperator;
  animate: boolean;
}

const DEFAULT_ECHO: EchoDraft = {
  echoTime: -0.05,
  numberOfEchoes: 6,
  startingIntensity: 0.9,
  decay: 0.7,
  operator: "screen",
  animate: false
};

type FastEditOperation =
  | "trimToWorkArea"
  | "setDuration"
  | "setFrameRate"
  | "setResolution"
  | "fitLayers"
  | "shiftLayersToZero"
  | "precompose";

interface FastEditDraft {
  operation: FastEditOperation;
  duration: number;
  frameRate: number;
  width: number;
  height: number;
  precomposeName: string;
  moveAllAttributes: boolean;
}

type BreakShapeNaming = "groupName" | "indexed";

interface BreakShapeDraft {
  keepOriginal: boolean;
  preserveAppearance: boolean;
  namingMode: BreakShapeNaming;
}

const DEFAULT_BREAK_SHAPE: BreakShapeDraft = {
  keepOriginal: true,
  preserveAppearance: true,
  namingMode: "groupName"
};

type EffectorFalloff = "linear" | "smoothstep" | "bezier";

interface EffectorDraft {
  radius: number;
  falloffCurve: EffectorFalloff;
  curve: { x1: number; y1: number; x2: number; y2: number };
  positionAmount: number;
  scaleAmount: number;
  rotationAmount: number;
  opacityAmount: number;
}

const DEFAULT_EFFECTOR: EffectorDraft = {
  radius: 400,
  falloffCurve: "smoothstep",
  curve: { x1: 0.33, y1: 0, x2: 0.67, y2: 1 },
  positionAmount: 200,
  scaleAmount: 0,
  rotationAmount: 0,
  opacityAmount: 0
};

/** Os onze presets do CHMS-024, na ordem em que o painel os lista. */
const CAMERA_TRANSITION_PRESETS = [
  "pushIn",
  "pullOut",
  "truckLeft",
  "truckRight",
  "craneUp",
  "craneDown",
  "panLeft",
  "panRight",
  "tiltUp",
  "tiltDown",
  "zoomIn"
] as const;

type CameraTransitionPreset = (typeof CAMERA_TRANSITION_PRESETS)[number];

interface CameraTransitionDraft {
  preset: CameraTransitionPreset;
  durationFrames: number;
  amount: number;
  curve: { x1: number; y1: number; x2: number; y2: number };
}

const DEFAULT_CAMERA_TRANSITION: CameraTransitionDraft = {
  preset: "pushIn",
  durationFrames: 24,
  amount: 400,
  // Ease in-out simétrico: o começo e o fim suaves, que é o que um movimento de
  // câmera pede por padrão.
  curve: { x1: 0.33, y1: 0, x2: 0.67, y2: 1 }
};

type CylinderFaceMode = "inward" | "outward" | "none";

interface CylinderDraft {
  radius: number;
  height: number;
  count: number;
  faceMode: CylinderFaceMode;
  startAngle: number;
  arcDegrees: number;
  createCamera: boolean;
}

const DEFAULT_CYLINDER: CylinderDraft = {
  radius: 500,
  height: 0,
  count: 8,
  faceMode: "outward",
  startAngle: 0,
  arcDegrees: 360,
  createCamera: true
};

type CubeSourceMode = "sixLayers" | "duplicateOne";

interface CubeDraft {
  size: number;
  sourceMode: CubeSourceMode;
  faceFit: boolean;
  createCamera: boolean;
}

const DEFAULT_CUBE: CubeDraft = {
  size: 400,
  sourceMode: "duplicateOne",
  faceFit: true,
  createCamera: true
};

type WaveMode = "transform" | "effect";
type WaveDirection = "horizontal" | "vertical";

interface WaveDraft {
  mode: WaveMode;
  amplitude: number;
  frequency: number;
  speed: number;
  direction: WaveDirection;
  phase: number;
  falloff: number;
  bake: boolean;
}

const DEFAULT_WAVE: WaveDraft = {
  mode: "transform",
  amplitude: 40,
  frequency: 50,
  speed: 1,
  direction: "vertical",
  phase: 0,
  falloff: 0,
  bake: false
};

type TileMode = "effect" | "grid";

interface TileDraft {
  mode: TileMode;
  outputWidth: number;
  outputHeight: number;
  mirrorEdges: boolean;
  gridRows: number;
  gridColumns: number;
  spacing: number;
}

const DEFAULT_TILE: TileDraft = {
  mode: "effect",
  outputWidth: 200,
  outputHeight: 200,
  mirrorEdges: true,
  gridRows: 3,
  gridColumns: 3,
  spacing: 200
};

type GlitchMode = "continuous" | "oneShot";

interface GlitchDraft {
  mode: GlitchMode;
  intensity: number;
  frequency: number;
  rgbSplit: number;
  displacement: number;
  seed: number;
  durationFrames: number;
}

const DEFAULT_GLITCH: GlitchDraft = {
  mode: "continuous",
  intensity: 0.6,
  frequency: 12,
  rgbSplit: 15,
  displacement: 40,
  seed: 1,
  durationFrames: 12
};

type ParallaxFullOperation = "autoFocus" | "zoom" | "wiggle" | "bake";

interface ParallaxFullDraft {
  operation: ParallaxFullOperation;
  targetLayerName: string;
  focusOffset: number;
  enableDepthOfField: boolean;
  zoomLevel: number;
  zoomDurationFrames: number;
  frequency: number;
  amplitude: number;
  seed: number;
  stepFrames: number;
}

const DEFAULT_PARALLAX_FULL: ParallaxFullDraft = {
  operation: "autoFocus",
  targetLayerName: "",
  focusOffset: 0,
  enableDepthOfField: true,
  zoomLevel: 2000,
  zoomDurationFrames: 30,
  frequency: 2,
  amplitude: 50,
  seed: 12345,
  stepFrames: 1
};

type ParallaxOrderMode = "selection" | "timeline";

interface ParallaxDraft {
  depthStep: number;
  strength: number;
  orderMode: ParallaxOrderMode;
  createCamera: boolean;
  preserveFraming: boolean;
  controllerName: string;
}

const DEFAULT_PARALLAX: ParallaxDraft = {
  depthStep: 200,
  strength: 1,
  orderMode: "selection",
  createCamera: true,
  preserveFraming: true,
  controllerName: "Parallax"
};

const DEFAULT_FAST_EDIT: FastEditDraft = {
  operation: "trimToWorkArea",
  duration: 10,
  frameRate: 25,
  width: 1920,
  height: 1080,
  precomposeName: "Precomp",
  moveAllAttributes: true
};

type ShapeType =
  | "circle"
  | "rectangle"
  | "roundedRectangle"
  | "polygon"
  | "star"
  | "line"
  | "arrow"
  | "callout";

interface ShapeLibraryDraft {
  shapeType: ShapeType;
  size: number;
  fillColor: readonly [number, number, number];
  strokeColor: readonly [number, number, number];
  strokeWidth: number;
  roundness: number;
  points: number;
}

const DEFAULT_SHAPE_LIBRARY: ShapeLibraryDraft = {
  shapeType: "rectangle",
  size: 200,
  // RGB normalizado, que e o que o After Effects usa. Cinza claro para a forma
  // aparecer contra o fundo escuro de uma composicao recem-criada.
  fillColor: [0.85, 0.85, 0.85],
  strokeColor: [0, 0, 0],
  strokeWidth: 0,
  roundness: 20,
  points: 5
};

type TrimPathScope = "layer" | "group";

interface TrimPathDraft {
  scope: TrimPathScope;
  start: number;
  end: number;
  offset: number;
  animate: boolean;
  durationFrames: number;
  reverse: boolean;
}

const DEFAULT_TRIM_PATH: TrimPathDraft = {
  scope: "layer",
  start: 0,
  end: 100,
  offset: 0,
  animate: true,
  durationFrames: 24,
  reverse: false
};

type PasteTimeMode = "cti" | "layerIn" | "original";
type PasteMappingMode = "matchName" | "order";

interface CopyKeysDraft {
  pasteTime: PasteTimeMode;
  mappingMode: PasteMappingMode;
  relativeTiming: boolean;
  includeExpressions: boolean;
  includeTangents: boolean;
}

const DEFAULT_COPY_KEYS: CopyKeysDraft = {
  pasteTime: "cti",
  mappingMode: "matchName",
  relativeTiming: true,
  includeExpressions: false,
  includeTangents: true
};

type TimeMarkerLoopType = "cycle" | "pingpong";

interface TimeMarkerLoopDraft {
  inMarkerName: string;
  outMarkerName: string;
  loopType: TimeMarkerLoopType;
  autoCreateMarkers: boolean;
  clampToLayer: boolean;
}
const DEFAULT_TIME_MARKER_LOOP: TimeMarkerLoopDraft = {
  inMarkerName: "in",
  outMarkerName: "out",
  loopType: "cycle",
  autoCreateMarkers: false,
  clampToLayer: true
};

const DEFAULT_EASE: EaseDraft = {
  x1: 0.25,
  y1: 0.1,
  x2: 0.25,
  y2: 1.0,
  applyIn: true,
  applyOut: true
};


interface AiToVectorDraft { keepOriginal: boolean; }
const DEFAULT_AI_TO_VECTOR: AiToVectorDraft = { keepOriginal: true };

interface TextToVectorDraft { keepOriginal: boolean; }
const DEFAULT_TEXT_TO_VECTOR: TextToVectorDraft = { keepOriginal: true };

interface ParticlesDraft { birthRate: number; longevity: number; velocity: number; }
const DEFAULT_PARTICLES: ParticlesDraft = { birthRate: 2, longevity: 1, velocity: 1 };

interface TextureDraft { blendMode: string; opacity: number; }
const DEFAULT_TEXTURE: TextureDraft = { blendMode: "overlay", opacity: 100 };

interface CleanDraft { removeConfirmed: boolean; }
const DEFAULT_CLEAN: CleanDraft = { removeConfirmed: false };
type MessageKey = Parameters<I18n["t"]>[0];
type ToolId =
  | "loopOut"
  | "smooth"
  | "wiggle"
  | "flicker"
  | "textBox"
  | "parent"
  | "createNull"
  | "flip"
  | "rename"
  | "reverseOrder"
  | "cutKeys"
  | "delay"
  | "anchor"
  | "ease"
  | "aiToVector"
  | "textToVector"
  | "particles"
  | "texture"
  | "clean"
  | "reverseKeys"
  | "cloneKeys"
  | "timeController"
  | "animateKinetic"
  | "timeMarkerLoop"
  | "inertial"
  | "jump"
  | "copyKeys"
  | "pasteKeys"
  | "trimPath"
  | "shapeLibrary"
  | "lookAt"
  | "orbit"
  | "echo"
  | "fastEdit"
  | "parallax"
  | "wave"
  | "tile"
  | "glitch"
  | "cylinder"
  | "cube"
  | "cameraTransition"
  | "effector"
  | "breakShape"
  | "parallaxFull";

/**
 * Uma ferramenta do navegador.
 *
 * O registro existe para que acrescentar uma ferramenta seja acrescentar uma
 * entrada — e não mais uma aba na navegação e mais uma ramificação no
 * `renderView`. Era assim antes, e com quatro comandos o painel já gastava sete
 * abas: a §22 pede grade de ícones e uma tarefa dominante por vez.
 */
interface ToolDefinition {
  /** Precisa bater com uma chave de ícone do shell. */
  readonly id: ToolId;
  readonly nameKey: MessageKey;
  readonly descriptionKey: MessageKey;
  render(regions: RenderRegions, i18n: I18n): void;
  disabledReason(i18n: I18n): string | null;
  apply(shell: Shell, i18n: I18n, logger: MotionLogger, client: Client): Promise<void>;
  reset(): void;
  /**
   * Carga sob demanda ao abrir a ferramenta, e de novo pelo botão Atualizar.
   *
   * Existe porque `render` é síncrono e não fala com o host: uma ferramenta que
   * precisa de dados do projeto — a lista de camadas, por exemplo — não pode
   * buscá-los no meio do desenho. Ferramentas que não precisam simplesmente não
   * declaram o gancho, e o botão Atualizar não aparece para elas.
   */
  load?(): Promise<void>;
  /**
   * Rótulo do botão de recarga. Existe porque `load` serve a duas coisas
   * diferentes: o Parentesco relê a lista de camadas, e as ferramentas com
   * prévia recalculam a prévia. Um rótulo só para os dois mentia em quatro
   * das cinco ferramentas.
   */
  loadLabelKey?: MessageKey;
}

const TOOLS: readonly ToolDefinition[] = [
  {
    id: "loopOut",
    nameKey: "tool.loopOut.name",
    descriptionKey: "tool.loopOut.description",
    render: renderLoopOut,
    disabledReason: loopOutDisabledReason,
    apply: applyLoopOut,
    reset: () => {
      state.loopOut = { ...DEFAULT_LOOP_OUT };
    }
  },
  {
    id: "smooth",
    nameKey: "tool.smooth.name",
    descriptionKey: "tool.smooth.description",
    render: renderSmooth,
    disabledReason: smoothDisabledReason,
    apply: applySmooth,
    reset: () => {
      state.smooth = { ...DEFAULT_SMOOTH };
    }
  },
  {
    id: "wiggle",
    nameKey: "tool.wiggle.name",
    descriptionKey: "tool.wiggle.description",
    render: renderWiggle,
    disabledReason: wiggleDisabledReason,
    apply: applyWiggle,
    reset: () => {
      state.wiggle = { ...DEFAULT_WIGGLE };
    }
  },
  {
    id: "flicker",
    nameKey: "tool.flicker.name",
    descriptionKey: "tool.flicker.description",
    render: renderFlicker,
    disabledReason: flickerDisabledReason,
    apply: applyFlicker,
    reset: () => {
      state.flicker = { ...DEFAULT_FLICKER };
    }
  },
  {
    id: "rename",
    nameKey: "tool.rename.name",
    descriptionKey: "tool.rename.description",
    render: renderRename,
    disabledReason: renameDisabledReason,
    apply: applyRename,
    load: refreshRenamePreview,
    reset: () => {
      state.rename = { ...DEFAULT_RENAME };
      state.renamePreview = null;
      state.previewError = null;
    }
  },
  {
    id: "reverseOrder",
    nameKey: "tool.reverseOrder.name",
    descriptionKey: "tool.reverseOrder.description",
    render: renderReverseOrder,
    disabledReason: reverseOrderDisabledReason,
    apply: applyReverseOrder,
    load: refreshReversePreview,
    reset: () => {
      state.reverseOrder = { ...DEFAULT_REVERSE_ORDER };
      state.reversePreview = null;
      state.previewError = null;
    }
  },
  {
    id: "anchor",
    nameKey: "tool.anchor.name",
    descriptionKey: "tool.anchor.description",
    render: renderAnchor,
    disabledReason: anchorDisabledReason,
    apply: applyAnchor,
    load: refreshAnchorPreview,
    reset: () => {
      state.anchor = { ...DEFAULT_ANCHOR };
      state.anchorPreview = null;
      state.previewError = null;
    }
  },
  {
    id: "cutKeys",
    nameKey: "tool.cutKeys.name",
    descriptionKey: "tool.cutKeys.description",
    render: renderCutKeys,
    disabledReason: cutKeysDisabledReason,
    apply: applyCutKeys,
    load: refreshCutKeysPreview,
    reset: () => {
      state.cutKeys = { ...DEFAULT_CUT_KEYS };
      state.cutKeysPreview = null;
      state.previewError = null;
    }
  },
  {
    id: "delay",
    nameKey: "tool.delay.name",
    descriptionKey: "tool.delay.description",
    render: renderDelay,
    disabledReason: delayDisabledReason,
    apply: applyDelay,
    load: refreshDelayPreview,
    reset: () => {
      state.delay = { ...DEFAULT_DELAY };
      state.delayPreview = null;
      state.previewError = null;
    }
  },
  {
    id: "flip",
    nameKey: "tool.flip.name",
    descriptionKey: "tool.flip.description",
    render: renderFlip,
    disabledReason: flipDisabledReason,
    apply: applyFlip,
    reset: () => {
      state.flip = { ...DEFAULT_FLIP };
    }
  },
  {
    id: "createNull",
    nameKey: "tool.createNull.name",
    descriptionKey: "tool.createNull.description",
    render: renderCreateNull,
    disabledReason: createNullDisabledReason,
    apply: applyCreateNull,
    reset: () => {
      state.createNull = { ...DEFAULT_CREATE_NULL };
    }
  },
  {
    id: "parent",
    nameKey: "tool.parent.name",
    descriptionKey: "tool.parent.description",
    render: renderParent,
    disabledReason: parentDisabledReason,
    apply: applyParent,
    load: loadLayers,
    loadLabelKey: "action.refreshLayers",
    reset: () => {
      state.parent = { ...DEFAULT_PARENT };
    }
  },
  {
    id: "textBox",
    nameKey: "tool.textBox.name",
    descriptionKey: "tool.textBox.description",
    render: renderTextBox,
    disabledReason: textBoxDisabledReason,
    apply: applyTextBox,
    reset: () => {
      state.textBox = { ...DEFAULT_TEXT_BOX };
    }
  },
  {
    id: "ease",
    nameKey: "tool.ease.name",
    descriptionKey: "tool.ease.description",
    render: renderEase,
    disabledReason: easeDisabledReason,
    apply: applyEase,
    reset: () => {
      state.ease = { ...DEFAULT_EASE };
    }
  },
  {
    id: "aiToVector",
    nameKey: "tool.aiToVector.name",
    descriptionKey: "tool.aiToVector.description",
    render: renderAiToVector,
    disabledReason: aiToVectorDisabledReason,
    apply: applyAiToVector,
    reset: () => { state.aiToVector = { ...DEFAULT_AI_TO_VECTOR }; }
  },
  {
    id: "textToVector",
    nameKey: "tool.textToVector.name",
    descriptionKey: "tool.textToVector.description",
    render: renderTextToVector,
    disabledReason: textToVectorDisabledReason,
    apply: applyTextToVector,
    reset: () => { state.textToVector = { ...DEFAULT_TEXT_TO_VECTOR }; }
  },
  {
    id: "particles",
    nameKey: "tool.particles.name",
    descriptionKey: "tool.particles.description",
    render: renderParticles,
    disabledReason: particlesDisabledReason,
    apply: applyParticles,
    reset: () => { state.particles = { ...DEFAULT_PARTICLES }; }
  },
  {
    id: "texture",
    nameKey: "tool.texture.name",
    descriptionKey: "tool.texture.description",
    render: renderTexture,
    disabledReason: textureDisabledReason,
    apply: applyTexture,
    reset: () => { state.texture = { ...DEFAULT_TEXTURE }; }
  },
  {
    id: "clean",
    nameKey: "tool.clean.name",
    descriptionKey: "tool.clean.description",
    render: renderClean,
    disabledReason: cleanDisabledReason,
    apply: applyClean,
    reset: () => { state.clean = { ...DEFAULT_CLEAN }; }
  },
  {
    id: "reverseKeys",
    nameKey: "tool.reverseKeys.name",
    descriptionKey: "tool.reverseKeys.description",
    render: renderReverseKeys,
    disabledReason: reverseKeysDisabledReason,
    apply: applyReverseKeys,
    reset: () => { state.reverseKeys = { ...DEFAULT_REVERSE_KEYS }; }
  },
  {
    id: "cloneKeys",
    nameKey: "tool.cloneKeys.name",
    descriptionKey: "tool.cloneKeys.description",
    render: renderCloneKeys,
    disabledReason: cloneKeysDisabledReason,
    apply: applyCloneKeys,
    reset: () => { state.cloneKeys = { ...DEFAULT_CLONE_KEYS }; }
  },
  {
    id: "timeController",
    nameKey: "tool.timeController.name",
    descriptionKey: "tool.timeController.description",
    render: renderTimeController,
    disabledReason: timeControllerDisabledReason,
    apply: applyTimeController,
    reset: () => { state.timeController = { ...DEFAULT_TIME_CONTROLLER }; }
  },
  {
    id: "animateKinetic",
    nameKey: "tool.animateKinetic.name",
    descriptionKey: "tool.animateKinetic.description",
    render: renderAnimateKinetic,
    disabledReason: animateKineticDisabledReason,
    apply: applyAnimateKinetic,
    reset: () => { state.animateKinetic = { ...DEFAULT_ANIMATE_KINETIC }; }
  },
  {
    id: "inertial",
    nameKey: "tool.inertial.name",
    descriptionKey: "tool.inertial.description",
    render: renderInertial,
    disabledReason: inertialDisabledReason,
    apply: applyInertial,
    reset: () => {
      state.inertial = { ...DEFAULT_INERTIAL };
    }
  },
  {
    id: "jump",
    nameKey: "tool.jump.name",
    descriptionKey: "tool.jump.description",
    render: renderJump,
    disabledReason: jumpDisabledReason,
    apply: applyJump,
    reset: () => {
      state.jump = { ...DEFAULT_JUMP };
    }
  },
  {
    id: "copyKeys",
    nameKey: "tool.copyKeys.name",
    descriptionKey: "tool.copyKeys.description",
    render: renderCopyKeys,
    disabledReason: copyKeysDisabledReason,
    apply: applyCopyKeys,
    reset: () => {
      state.copyKeys = { ...DEFAULT_COPY_KEYS };
    }
  },
  {
    id: "pasteKeys",
    nameKey: "tool.pasteKeys.name",
    descriptionKey: "tool.pasteKeys.description",
    render: renderPasteKeys,
    disabledReason: copyKeysDisabledReason,
    apply: applyPasteKeys,
    reset: () => {
      state.copyKeys = { ...DEFAULT_COPY_KEYS };
    }
  },
  {
    id: "lookAt",
    nameKey: "tool.lookAt.name",
    descriptionKey: "tool.lookAt.description",
    render: renderLookAt,
    disabledReason: lookAtDisabledReason,
    apply: applyLookAt,
    reset: () => {
      state.lookAt = { ...DEFAULT_LOOK_AT };
    }
  },
  {
    id: "orbit",
    nameKey: "tool.orbit.name",
    descriptionKey: "tool.orbit.description",
    render: renderOrbit,
    disabledReason: orbitDisabledReason,
    apply: applyOrbit,
    reset: () => {
      state.orbit = { ...DEFAULT_ORBIT };
    }
  },
  {
    id: "breakShape",
    nameKey: "tool.breakShape.name",
    descriptionKey: "tool.breakShape.description",
    render: renderBreakShape,
    disabledReason: breakShapeDisabledReason,
    apply: applyBreakShape,
    reset: () => {
      state.breakShape = { ...DEFAULT_BREAK_SHAPE };
    }
  },
  {
    id: "effector",
    nameKey: "tool.effector.name",
    descriptionKey: "tool.effector.description",
    render: renderEffector,
    disabledReason: effectorDisabledReason,
    apply: applyEffector,
    reset: () => {
      state.effector = { ...DEFAULT_EFFECTOR };
    }
  },
  {
    id: "cameraTransition",
    nameKey: "tool.cameraTransition.name",
    descriptionKey: "tool.cameraTransition.description",
    render: renderCameraTransition,
    disabledReason: cameraTransitionDisabledReason,
    apply: applyCameraTransition,
    reset: () => {
      state.cameraTransition = { ...DEFAULT_CAMERA_TRANSITION };
    }
  },
  {
    id: "cylinder",
    nameKey: "tool.cylinder.name",
    descriptionKey: "tool.cylinder.description",
    render: renderCylinder,
    disabledReason: cylinderDisabledReason,
    apply: applyCylinder,
    reset: () => {
      state.cylinder = { ...DEFAULT_CYLINDER };
    }
  },
  {
    id: "cube",
    nameKey: "tool.cube.name",
    descriptionKey: "tool.cube.description",
    render: renderCube,
    disabledReason: cubeDisabledReason,
    apply: applyCube,
    reset: () => {
      state.cube = { ...DEFAULT_CUBE };
    }
  },
  {
    id: "wave",
    nameKey: "tool.wave.name",
    descriptionKey: "tool.wave.description",
    render: renderWave,
    disabledReason: waveDisabledReason,
    apply: applyWave,
    reset: () => {
      state.wave = { ...DEFAULT_WAVE };
    }
  },
  {
    id: "tile",
    nameKey: "tool.tile.name",
    descriptionKey: "tool.tile.description",
    render: renderTile,
    disabledReason: tileDisabledReason,
    apply: applyTile,
    reset: () => {
      state.tile = { ...DEFAULT_TILE };
    }
  },
  {
    id: "glitch",
    nameKey: "tool.glitch.name",
    descriptionKey: "tool.glitch.description",
    render: renderGlitch,
    disabledReason: glitchDisabledReason,
    apply: applyGlitch,
    reset: () => {
      state.glitch = { ...DEFAULT_GLITCH };
    }
  },
  {
    id: "echo",
    nameKey: "tool.echo.name",
    descriptionKey: "tool.echo.description",
    render: renderEcho,
    disabledReason: echoDisabledReason,
    apply: applyEcho,
    reset: () => {
      state.echo = { ...DEFAULT_ECHO };
    }
  },
  {
    id: "parallaxFull",
    nameKey: "tool.parallaxFull.name",
    descriptionKey: "tool.parallaxFull.description",
    render: renderParallaxFull,
    disabledReason: parallaxFullDisabledReason,
    apply: applyParallaxFull,
    reset: () => {
      state.parallaxFull = { ...DEFAULT_PARALLAX_FULL };
    }
  },
  {
    id: "parallax",
    nameKey: "tool.parallax.name",
    descriptionKey: "tool.parallax.description",
    render: renderParallax,
    disabledReason: parallaxDisabledReason,
    apply: applyParallax,
    reset: () => {
      state.parallax = { ...DEFAULT_PARALLAX };
    }
  },
  {
    id: "fastEdit",
    nameKey: "tool.fastEdit.name",
    descriptionKey: "tool.fastEdit.description",
    render: renderFastEdit,
    disabledReason: fastEditDisabledReason,
    apply: applyFastEdit,
    // O resumo é lido do host por um comando próprio, porque o dispatcher
    // recusa `dryRun` em comando que muta. Sem este gancho a prévia existia mas
    // nunca era pedida, e o painel mostrava o campo sempre vazio.
    load: refreshFastEditSummary,
    reset: () => {
      state.fastEdit = { ...DEFAULT_FAST_EDIT };
      state.fastEditSummary = null;
    }
  },
  {
    id: "shapeLibrary",
    nameKey: "tool.shapeLibrary.name",
    descriptionKey: "tool.shapeLibrary.description",
    render: renderShapeLibrary,
    disabledReason: shapeLibraryDisabledReason,
    apply: applyShapeLibrary,
    reset: () => {
      state.shapeLibrary = { ...DEFAULT_SHAPE_LIBRARY };
    }
  },
  {
    id: "trimPath",
    nameKey: "tool.trimPath.name",
    descriptionKey: "tool.trimPath.description",
    render: renderTrimPath,
    disabledReason: trimPathDisabledReason,
    apply: applyTrimPath,
    reset: () => {
      state.trimPath = { ...DEFAULT_TRIM_PATH };
    }
  },
  {
    id: "timeMarkerLoop",
    nameKey: "tool.timeMarkerLoop.name",
    descriptionKey: "tool.timeMarkerLoop.description",
    render: renderTimeMarkerLoop,
    disabledReason: timeMarkerLoopDisabledReason,
    apply: applyTimeMarkerLoop,
    reset: () => { state.timeMarkerLoop = { ...DEFAULT_TIME_MARKER_LOOP }; }
  },
];

const VIEWS: ShellView[] = [
  { id: "context", labelKey: "nav.context", titleKey: "view.context.title" },
  { id: "tools", labelKey: "nav.tools", titleKey: "view.tools.title" },
  { id: "system", labelKey: "nav.system", titleKey: "view.system.title" },
  { id: "diagnostics", labelKey: "nav.diagnostics", titleKey: "view.diagnostics.title" },
  { id: "settings", labelKey: "nav.settings", titleKey: "view.settings.title" }
];

/** Versão do plugin, embutida no bundle para aparecer no bundle de suporte. */
const PLUGIN_VERSION = "0.1.0";

const state: {
  context: ContextData | null;
  capabilities: HostCapabilities | null;
  lastError: string | null;
  busy: boolean;
  busyReason: string | null;
  loopOut: LoopOutDraft;
  smooth: SmoothDraft;
  wiggle: WiggleDraft;
  flicker: FlickerDraft;
  textBox: TextBoxDraft;
  parent: ParentDraft;
  createNull: CreateNullDraft;
  flip: FlipDraft;
  rename: RenameDraft;
  reverseOrder: ReverseOrderDraft;
  cutKeys: CutKeysDraft;
  delay: DelayDraft;
  anchor: AnchorDraft;
  aiToVector: AiToVectorDraft;
  textToVector: TextToVectorDraft;
  particles: ParticlesDraft;
  texture: TextureDraft;
  clean: CleanDraft;
  /** Prévias em cache; `null` enquanto a primeira não voltou. */
  renamePreview: RenamePreviewData | null;
  reversePreview: ReversePreviewData | null;
  cutKeysPreview: CutKeysPreviewData | null;
  delayPreview: DelayPreviewData | null;

  ease: EaseDraft;
  reverseKeys: ReverseKeysDraft;
  cloneKeys: CloneKeysDraft;
  timeController: TimeControllerDraft;
  animateKinetic: AnimateKineticDraft;
  inertial: InertialDraft;
  jump: JumpDraft;
  copyKeys: CopyKeysDraft;
  trimPath: TrimPathDraft;
  shapeLibrary: ShapeLibraryDraft;
  lookAt: LookAtDraft;
  orbit: OrbitDraft;
  echo: EchoDraft;
  fastEdit: FastEditDraft;
  parallax: ParallaxDraft;
  parallaxFull: ParallaxFullDraft;
  breakShape: BreakShapeDraft;
  effector: EffectorDraft;
  cameraTransition: CameraTransitionDraft;
  cylinder: CylinderDraft;
  cube: CubeDraft;
  wave: WaveDraft;
  tile: TileDraft;
  glitch: GlitchDraft;
  fastEditSummary: string | null;
  timeMarkerLoop: TimeMarkerLoopDraft;
  anchorPreview: AnchorPreviewData | null;
  /** Motivo da última prévia recusada, mostrado dentro da view. */
  previewError: string | null;
  /** Cache da lista de camadas; `null` enquanto nunca foi lida. */
  layers: LayerSummary[] | null;
  layersTotal: number;
  /** `null` mostra a grade; um id abre o editor daquela ferramenta. */
  activeTool: ToolId | null;
} = {
  context: null,
  capabilities: null,
  lastError: null,
  busy: false,
  busyReason: null,
  loopOut: { ...DEFAULT_LOOP_OUT },
  smooth: { ...DEFAULT_SMOOTH },
  wiggle: { ...DEFAULT_WIGGLE },
  flicker: { ...DEFAULT_FLICKER },
  textBox: { ...DEFAULT_TEXT_BOX },
  parent: { ...DEFAULT_PARENT },
  createNull: { ...DEFAULT_CREATE_NULL },
  flip: { ...DEFAULT_FLIP },
  rename: { ...DEFAULT_RENAME },
  reverseOrder: { ...DEFAULT_REVERSE_ORDER },
  cutKeys: { ...DEFAULT_CUT_KEYS },
  delay: { ...DEFAULT_DELAY },
  anchor: { ...DEFAULT_ANCHOR },
  ease: { ...DEFAULT_EASE },
  aiToVector: { ...DEFAULT_AI_TO_VECTOR },
  textToVector: { ...DEFAULT_TEXT_TO_VECTOR },
  particles: { ...DEFAULT_PARTICLES },
  texture: { ...DEFAULT_TEXTURE },
  clean: { ...DEFAULT_CLEAN },
  reverseKeys: { ...DEFAULT_REVERSE_KEYS },
  cloneKeys: { ...DEFAULT_CLONE_KEYS },
  timeController: { ...DEFAULT_TIME_CONTROLLER },
  animateKinetic: { ...DEFAULT_ANIMATE_KINETIC },
  inertial: { ...DEFAULT_INERTIAL },
  jump: { ...DEFAULT_JUMP },
  copyKeys: { ...DEFAULT_COPY_KEYS },
  trimPath: { ...DEFAULT_TRIM_PATH },
  shapeLibrary: { ...DEFAULT_SHAPE_LIBRARY },
  lookAt: { ...DEFAULT_LOOK_AT },
  orbit: { ...DEFAULT_ORBIT },
  echo: { ...DEFAULT_ECHO },
  fastEdit: { ...DEFAULT_FAST_EDIT },
  parallax: { ...DEFAULT_PARALLAX },
  parallaxFull: { ...DEFAULT_PARALLAX_FULL },
  breakShape: { ...DEFAULT_BREAK_SHAPE },
  effector: { ...DEFAULT_EFFECTOR },
  cameraTransition: { ...DEFAULT_CAMERA_TRANSITION },
  cylinder: { ...DEFAULT_CYLINDER },
  cube: { ...DEFAULT_CUBE },
  wave: { ...DEFAULT_WAVE },
  tile: { ...DEFAULT_TILE },
  glitch: { ...DEFAULT_GLITCH },
  fastEditSummary: null,
  timeMarkerLoop: { ...DEFAULT_TIME_MARKER_LOOP },
  renamePreview: null,
  reversePreview: null,
  cutKeysPreview: null,
  delayPreview: null,

  anchorPreview: null,
  previewError: null,
  layers: null,
  layersTotal: 0,
  activeTool: null
};

function start(): void {
  const mount = document.getElementById("root");
  if (!mount) {
    return;
  }

  const logger = createLogger({ pluginVersion: PLUGIN_VERSION });
  const i18n = createI18n({});
  const motionPreference = createBrowserReducedMotionController(document.documentElement, window);
  const disposeMotionPreference = (): void => {
    motionPreference.dispose();
    window.removeEventListener("unload", disposeMotionPreference);
  };
  window.addEventListener("unload", disposeMotionPreference);

  // O adapter precisa do logger antes de o shell existir: ele reporta falha de
  // transporte, e uma falha logo no primeiro comando não pode depender de a
  // interface já estar montada.
  const adapter = createAeHostAdapter(logger);

  if (adapter) {
    // "pt_BR", com underscore — formato medido no After Effects 26.3, não
    // suposto. `normalizeLocale` cuida da conversão.
    i18n.setLocale(adapter.uiLocale());
    logger.setHost("after-effects");
  }

  // O idioma acessível precisa acompanhar o catálogo realmente selecionado.
  // Deixar o `lang` fixo em pt-BR faz leitores de tela pronunciarem inglês com
  // regras de português quando o After Effects está em en-US.
  document.documentElement.lang = i18n.locale();

  const shell = createShell({
    mount,
    document,
    i18n,
    subtitleKey: "app.subtitle.afterEffects",
    views: VIEWS,
    onRender: (viewId, regions) =>
      renderView(viewId, regions, { i18n, logger, adapter, motionPreference })
  });

  shell.observeWidth(window);
  logger.info("panel.started", { command: "panel.started" });

  if (!adapter) {
    shell.setStatus(i18n.t("status.outsideHost"), "error");
    return;
  }

  void refreshContext(shell, i18n, logger, adapter.client);
}

interface Wiring {
  i18n: I18n;
  logger: MotionLogger;
  adapter: ReturnType<typeof createAeHostAdapter>;
  motionPreference: ReducedMotionController;
}

function renderView(viewId: string, regions: RenderRegions, wiring: Wiring): void {
  const { i18n, logger, adapter, motionPreference } = wiring;

  if (viewId === "settings") {
    renderSettings(regions, i18n, motionPreference);
    return;
  }

  if (!adapter) {
    regions.content.appendChild(notice(document, i18n.t("message.outsideHost"), "error"));
    return;
  }

  const shell = regions.shell;
  const client = adapter.client;
  // Sempre a fiação deste render: os handlers de campo disparam trabalho
  // assíncrono e precisam do cliente que `render` não recebe.
  wiringAtual = { shell, i18n, logger, client };

  // A falha pertence à tarefa que a pessoa acabou de executar, portanto aparece
  // na view atual — inclusive Sistema — e não fica escondida em outra aba.
  if (state.lastError) {
    regions.content.appendChild(notice(document, state.lastError, "error"));
  }

  if (viewId === "context") {
    renderContext(regions, i18n);
    regions.actions.appendChild(
      button(document, {
        label: i18n.t("action.refresh"),
        variant: "primary",
        disabled: state.busy,
        title: state.busy ? state.busyReason ?? i18n.t("status.initializing") : i18n.t("action.refresh"),
        onClick: () => void refreshContext(shell, i18n, logger, client)
      })
  );
    regions.actions.appendChild(
      button(document, {
        label: i18n.t("action.createDemo"),
        disabled: state.busy,
        title: state.busy ? state.busyReason ?? i18n.t("status.initializing") : i18n.t("action.createDemo"),
        onClick: () => void createDemo(shell, i18n, logger, client)
      })
  );
    return;
  }

  if (viewId === "tools") {
    const tool = TOOLS.find((item) => item.id === state.activeTool);

    // Sem ferramenta escolhida: so a grade. A §22 proibe inspector antes da
    // escolha — parametros de quatro ferramentas na mesma tela seriam quatro
    // tarefas competindo.
    if (!tool) {
      regions.content.appendChild(notice(document, i18n.t("message.toolsInstructions")));
      regions.content.appendChild(
        toolGrid(
          document,
          TOOLS.map((item) =>
            toolTile(document, {
              id: item.id,
              label: i18n.t(item.nameKey),
              description: i18n.t(item.descriptionKey),
              onSelect: () => {
                state.activeTool = item.id;
                state.lastError = null;
                shell.rerender();
                // Depois do rerender: a ferramenta já está desenhada quando a
                // carga começa, então o estado ocupado aparece no lugar certo.
                void item.load?.();
              }
            })
          )
        )
      );
      return;
    }

    // Ferramenta aberta: o titulo passa a ser o nome dela. Deixa-lo em
    // "Ferramentas" obrigaria o usuario a voltar a grade para lembrar onde esta.
    shell.setViewTitle(i18n.t(tool.nameKey));
    tool.render(regions, i18n);

    const disabledReason = tool.disabledReason(i18n);
    regions.actions.appendChild(
      button(document, {
        label: i18n.t("action.apply"),
        variant: "primary",
        ...(disabledReason ? { disabled: true as const, disabledReason } : { disabled: false as const }),
        title: disabledReason ?? i18n.t("action.apply"),
        onClick: () => void tool.apply(shell, i18n, logger, client)
      })
  );
    // Só ferramentas que leem dados do projeto ganham Atualizar. Um botão que
    // não faz nada nas outras cinco seria pior que a ausência dele.
    if (tool.load) {
      regions.actions.appendChild(
        button(document, {
          label: i18n.t(tool.loadLabelKey ?? "action.refreshPreview"),
          ...(state.busy
            ? { disabled: true as const, disabledReason: state.busyReason ?? i18n.t("status.initializing") }
            : { disabled: false as const }),
          title: state.busy
            ? state.busyReason ?? i18n.t("status.initializing")
            : i18n.t(tool.loadLabelKey ?? "action.refreshPreview"),
          onClick: () => void tool.load?.()
        })
  );
    }
    regions.actions.appendChild(
      button(document, {
        label: i18n.t("action.reset"),
        ...(state.busy
          ? { disabled: true as const, disabledReason: state.busyReason ?? i18n.t("status.initializing") }
          : { disabled: false as const }),
        title: state.busy ? state.busyReason ?? i18n.t("status.initializing") : i18n.t("action.reset"),
        onClick: () => {
          tool.reset();
          state.lastError = null;
          shell.rerender();
        }
      })
  );
    regions.actions.appendChild(
      button(document, {
        label: i18n.t("action.backToTools"),
        ...(state.busy
          ? { disabled: true as const, disabledReason: state.busyReason ?? i18n.t("status.initializing") }
          : { disabled: false as const }),
        title: state.busy ? state.busyReason ?? i18n.t("status.initializing") : i18n.t("action.backToTools"),
        onClick: () => {
          state.activeTool = null;
          state.lastError = null;
          shell.rerender();
        }
      })
  );
    return;
  }

  if (viewId === "system") {
    renderSystem(regions, i18n);
    regions.actions.appendChild(
      button(document, {
        label: i18n.t("action.runSystemCheck"),
        variant: "primary",
        disabled: state.busy,
        title: state.busy
          ? state.busyReason ?? i18n.t("status.initializing")
          : i18n.t("action.runSystemCheck"),
        onClick: () => void runSystemCheck(shell, i18n, logger, client)
      })
  );
    regions.actions.appendChild(
      button(document, {
        label: i18n.t("action.verifyBridge"),
        disabled: state.busy,
        title: state.busy
          ? state.busyReason ?? i18n.t("status.initializing")
          : i18n.t("action.verifyBridge"),
        onClick: () => void verifyBridge(shell, i18n, logger, client)
      })
  );
    return;
  }

  renderDiagnostics(regions, i18n, logger);
}

/** Texto para um valor que o host devolveu como `null`. */
function orFallback(i18n: I18n, value: string | number | null, fallbackKey: Parameters<I18n["t"]>[0]): string {
  return value === null || value === "" ? i18n.t(fallbackKey) : String(value);
}

function renderContext(regions: RenderRegions, i18n: I18n): void {
  const context = state.context;

  if (!context) {
    if (!state.lastError) {
      regions.content.appendChild(notice(document, i18n.t("status.readingContext")));
    }
  } else {
    const rows: Array<[string, string]> = [
      [i18n.t("context.hostVersion"), orFallback(i18n, context.hostVersion, "value.none")],
      [i18n.t("context.project"), orFallback(i18n, context.projectName, "value.projectNotSaved")],
      [i18n.t("context.path"), orFallback(i18n, context.projectPath, "value.projectNotSaved")],
      [i18n.t("context.activeItem"), orFallback(i18n, context.activeItemName, "value.noItem")],
      [
        i18n.t("context.composition"),
        context.isComposition
          ? i18n.t("context.compositionValue", {
              width: orFallback(i18n, context.compWidth, "value.none"),
              height: orFallback(i18n, context.compHeight, "value.none"),
              duration: i18n.formatNumber(context.compDuration, 2),
              frameRate: i18n.formatNumber(context.compFrameRate, 2)
            })
          : i18n.t("value.noComposition")
      ]
    ];

    for (const [label, value] of rows) {
      regions.content.appendChild(propertyRow(document, label, value));
    }
  }

}

function isLoopOutType(value: string): value is LoopOutType {
  return value === "cycle" || value === "pingpong" || value === "offset" || value === "continue";
}

function isLoopOutRange(value: string): value is LoopOutRange {
  return value === "all" || value === "keys" || value === "duration";
}

function isLoopOutDraftValid(draft: LoopOutDraft): boolean {
  if (draft.type === "continue" || draft.range === "all") {
    return true;
  }
  if (draft.range === "keys") {
    return Number.isFinite(draft.numKeyframes) && Number.isInteger(draft.numKeyframes) &&
      draft.numKeyframes >= 1 && draft.numKeyframes <= 1000;
  }
  return Number.isFinite(draft.duration) && draft.duration > 0 && draft.duration <= 3600;
}

function loopOutDisabledReason(i18n: I18n): string | null {
  if (state.busy) {
    return state.busyReason ?? i18n.t("status.initializing");
  }
  if (!state.context?.isComposition) {
    return i18n.t("message.loopOutNoActiveComp");
  }
  if (!isLoopOutDraftValid(state.loopOut)) {
    return i18n.t("message.loopOutInvalidNumber");
  }
  return null;
}

/** As faixas repetem host e biblioteca; ver docs/research/after-effects-wiggle-and-seed.md. */
function isFlickerDraftValid(draft: FlickerDraft): boolean {
  if (!Number.isFinite(draft.rate) || draft.rate <= 0 || draft.rate > 120) return false;
  if (!Number.isFinite(draft.minFactor) || draft.minFactor < 0 || draft.minFactor > 10) return false;
  if (!Number.isFinite(draft.maxFactor) || draft.maxFactor < 0 || draft.maxFactor > 10) return false;
  if (draft.minFactor > draft.maxFactor) return false;
  return Number.isInteger(draft.seed) && draft.seed >= 0 && draft.seed <= 100_000;
}

function flickerDisabledReason(i18n: I18n): string | null {
  if (state.busy) {
    return state.busyReason ?? i18n.t("status.initializing");
  }
  if (!state.context?.isComposition) {
    return i18n.t("message.flickerNoActiveComp");
  }
  // A faixa invertida ganha mensagem propria: o usuario precisa saber QUAL
  // regra quebrou, e nao apenas que algum numero esta errado.
  if (state.flicker.minFactor > state.flicker.maxFactor) {
    return i18n.t("message.flickerRangeInverted");
  }
  if (!isFlickerDraftValid(state.flicker)) {
    return i18n.t("message.flickerInvalidNumber");
  }
  return null;
}

function renderFlicker(regions: RenderRegions, i18n: I18n): void {
  const shell = regions.shell;
  const draft = state.flicker;

  regions.content.appendChild(notice(document, i18n.t("message.flickerInstructions")));
  if (state.context && !state.context.isComposition) {
    regions.content.appendChild(notice(document, i18n.t("message.flickerNoActiveComp"), "warning"));
  }

  regions.content.appendChild(sectionTitle(document, i18n.t("flicker.section.main")));

  regions.content.appendChild(
    numberField(document, {
      id: "flicker-rate",
      label: i18n.t("flicker.rate"),
      value: draft.rate,
      min: 0.1,
      max: 120,
      step: 1,
      unit: i18n.t("flicker.unit.perSecond"),
      disabled: state.busy,
      onCommit: (value) => {
        state.flicker.rate = value;
        shell.rerender();
      }
    })
  );

  regions.content.appendChild(
    numberField(document, {
      id: "flicker-min",
      label: i18n.t("flicker.minFactor"),
      value: draft.minFactor,
      min: 0,
      max: 10,
      step: 0.05,
      disabled: state.busy,
      onCommit: (value) => {
        state.flicker.minFactor = value;
        shell.rerender();
      }
    })
  );

  regions.content.appendChild(
    numberField(document, {
      id: "flicker-max",
      label: i18n.t("flicker.maxFactor"),
      value: draft.maxFactor,
      min: 0,
      max: 10,
      step: 0.05,
      disabled: state.busy,
      onCommit: (value) => {
        state.flicker.maxFactor = value;
        shell.rerender();
      }
    })
  );

  regions.content.appendChild(
    numberField(document, {
      id: "flicker-seed",
      label: i18n.t("flicker.seed"),
      description: i18n.t("flicker.seed.description"),
      value: draft.seed,
      min: 0,
      max: 100_000,
      step: 1,
      disabled: state.busy,
      onCommit: (value) => {
        state.flicker.seed = value;
        shell.rerender();
      }
    })
  );
}

/** As faixas repetem host e biblioteca; ver docs/research/after-effects-wiggle-and-seed.md. */
function isWiggleDraftValid(draft: WiggleDraft): boolean {
  if (!Number.isFinite(draft.frequency) || draft.frequency <= 0 || draft.frequency > 100) return false;
  if (!Number.isFinite(draft.amplitude) || draft.amplitude < 0 || draft.amplitude > 100_000) return false;
  if (!Number.isInteger(draft.octaves) || draft.octaves < 1 || draft.octaves > 10) return false;
  if (
    !Number.isFinite(draft.amplitudeMultiplier) ||
    draft.amplitudeMultiplier < 0 ||
    draft.amplitudeMultiplier > 10
  ) {
    return false;
  }
  return Number.isInteger(draft.seed) && draft.seed >= 0 && draft.seed <= 100_000;
}

function wiggleDisabledReason(i18n: I18n): string | null {
  if (state.busy) {
    return state.busyReason ?? i18n.t("status.initializing");
  }
  if (!state.context?.isComposition) {
    return i18n.t("message.wiggleNoActiveComp");
  }
  if (!isWiggleDraftValid(state.wiggle)) {
    return i18n.t("message.wiggleInvalidNumber");
  }
  return null;
}

function renderWiggle(regions: RenderRegions, i18n: I18n): void {
  const shell = regions.shell;
  const draft = state.wiggle;

  regions.content.appendChild(notice(document, i18n.t("message.wiggleInstructions")));
  if (state.context && !state.context.isComposition) {
    regions.content.appendChild(notice(document, i18n.t("message.wiggleNoActiveComp"), "warning"));
  }

  regions.content.appendChild(sectionTitle(document, i18n.t("wiggle.section.main")));

  regions.content.appendChild(
    numberField(document, {
      id: "wiggle-frequency",
      label: i18n.t("wiggle.frequency"),
      value: draft.frequency,
      min: 0.01,
      max: 100,
      step: 0.1,
      unit: i18n.t("wiggle.unit.hertz"),
      disabled: state.busy,
      onCommit: (value) => {
        state.wiggle.frequency = value;
        shell.rerender();
      }
    })
  );

  regions.content.appendChild(
    numberField(document, {
      id: "wiggle-amplitude",
      label: i18n.t("wiggle.amplitude"),
      value: draft.amplitude,
      min: 0,
      max: 100_000,
      step: 1,
      disabled: state.busy,
      onCommit: (value) => {
        state.wiggle.amplitude = value;
        shell.rerender();
      }
    })
  );

  // Oitavas e queda controlam o detalhe do ruido. Ficam numa secao propria
  // porque a maioria dos usos nao os altera.
  regions.content.appendChild(sectionTitle(document, i18n.t("wiggle.section.detail")));

  regions.content.appendChild(
    numberField(document, {
      id: "wiggle-octaves",
      label: i18n.t("wiggle.octaves"),
      value: draft.octaves,
      min: 1,
      max: 10,
      step: 1,
      disabled: state.busy,
      onCommit: (value) => {
        state.wiggle.octaves = value;
        shell.rerender();
      }
    })
  );

  regions.content.appendChild(
    numberField(document, {
      id: "wiggle-falloff",
      label: i18n.t("wiggle.amplitudeMultiplier"),
      value: draft.amplitudeMultiplier,
      min: 0,
      max: 10,
      step: 0.05,
      disabled: state.busy,
      onCommit: (value) => {
        state.wiggle.amplitudeMultiplier = value;
        shell.rerender();
      }
    })
  );

  regions.content.appendChild(
    numberField(document, {
      id: "wiggle-seed",
      label: i18n.t("wiggle.seed"),
      description: i18n.t("wiggle.seed.description"),
      value: draft.seed,
      min: 0,
      max: 100_000,
      step: 1,
      disabled: state.busy,
      onCommit: (value) => {
        state.wiggle.seed = value;
        shell.rerender();
      }
    })
  );
}

function isSmoothReference(value: string): value is SmoothReference {
  return value === "current" || value === "fixed";
}

/**
 * As faixas repetem as do host e as da biblioteca de propósito.
 *
 * Validar aqui evita uma ida ao ExtendScript para receber `INVALID_PRESET`, e o
 * host valida de novo porque nada que atravessa a ponte é confiável.
 */
function isSmoothDraftValid(draft: SmoothDraft): boolean {
  if (!Number.isFinite(draft.widthSeconds) || draft.widthSeconds <= 0 || draft.widthSeconds > 3600) {
    return false;
  }
  if (
    !Number.isInteger(draft.samples) ||
    draft.samples < 1 ||
    draft.samples > 101
  ) {
    return false;
  }
  if (draft.reference === "current") {
    return true;
  }
  return Number.isFinite(draft.referenceTime) && draft.referenceTime >= 0;
}

function smoothDisabledReason(i18n: I18n): string | null {
  if (state.busy) {
    return state.busyReason ?? i18n.t("status.initializing");
  }
  if (!state.context?.isComposition) {
    return i18n.t("message.smoothNoActiveComp");
  }
  if (!isSmoothDraftValid(state.smooth)) {
    return i18n.t("message.smoothInvalidNumber");
  }
  return null;
}

function renderSmooth(regions: RenderRegions, i18n: I18n): void {
  const shell = regions.shell;
  const draft = state.smooth;

  regions.content.appendChild(notice(document, i18n.t("message.smoothInstructions")));
  if (state.context && !state.context.isComposition) {
    regions.content.appendChild(notice(document, i18n.t("message.smoothNoActiveComp"), "warning"));
  }

  regions.content.appendChild(sectionTitle(document, i18n.t("smooth.section.main")));

  regions.content.appendChild(
    numberField(document, {
      id: "smooth-width",
      label: i18n.t("smooth.width"),
      value: draft.widthSeconds,
      min: 0.001,
      max: 3600,
      step: 0.05,
      unit: i18n.t("smooth.unit.seconds"),
      disabled: state.busy,
      onCommit: (value) => {
        state.smooth.widthSeconds = value;
        shell.rerender();
      }
    })
  );

  regions.content.appendChild(
    numberField(document, {
      id: "smooth-samples",
      label: i18n.t("smooth.samples"),
      value: draft.samples,
      min: 1,
      max: 101,
      step: 1,
      disabled: state.busy,
      onCommit: (value) => {
        state.smooth.samples = value;
        shell.rerender();
      }
    })
  );

  regions.content.appendChild(
    selectField(document, {
      id: "smooth-reference",
      label: i18n.t("smooth.reference"),
      value: draft.reference,
      options: [
        { value: "current", label: i18n.t("smooth.reference.current") },
        { value: "fixed", label: i18n.t("smooth.reference.fixed") }
      ],
      disabled: state.busy,
      onChange: (value) => {
        if (!isSmoothReference(value)) return;
        state.smooth.reference = value;
        shell.rerender();
      }
    })
  );

  // O campo de tempo só aparece quando ele governa alguma coisa: mostrá-lo
  // desabilitado ao lado de "Tempo atual" seria ruído permanente.
  if (draft.reference === "fixed") {
    regions.content.appendChild(
      numberField(document, {
        id: "smooth-reference-time",
        label: i18n.t("smooth.referenceTime"),
        value: draft.referenceTime,
        min: 0,
        max: 10800,
        step: 0.1,
        unit: i18n.t("smooth.unit.seconds"),
        disabled: state.busy,
        onCommit: (value) => {
          state.smooth.referenceTime = value;
          shell.rerender();
        }
      })
  );
  }
}

function renderLoopOut(regions: RenderRegions, i18n: I18n): void {
  const shell = regions.shell;
  const draft = state.loopOut;

  regions.content.appendChild(notice(document, i18n.t("message.loopOutInstructions")));
  if (state.context && !state.context.isComposition) {
    regions.content.appendChild(notice(document, i18n.t("message.loopOutNoActiveComp"), "warning"));
  }

  regions.content.appendChild(sectionTitle(document, i18n.t("loopOut.section.main")));
  regions.content.appendChild(
    selectField(document, {
      id: "motion-loopout-type",
      label: i18n.t("loopOut.type"),
      value: draft.type,
      options: [
        { value: "cycle", label: i18n.t("loopOut.type.cycle") },
        { value: "pingpong", label: i18n.t("loopOut.type.pingpong") },
        { value: "offset", label: i18n.t("loopOut.type.offset") },
        { value: "continue", label: i18n.t("loopOut.type.continue") }
      ],
      ...(state.busy
        ? { disabled: true, disabledReason: state.busyReason ?? i18n.t("status.initializing") }
        : { disabled: false }),
      onChange: (value) => {
        if (!isLoopOutType(value)) return;
        state.loopOut.type = value;
        if (value === "continue") state.loopOut.range = "all";
        shell.rerender();
      }
    })
  );

  const continueMode = draft.type === "continue";
  regions.content.appendChild(
    selectField(document, {
      id: "motion-loopout-range",
      label: i18n.t("loopOut.range"),
      value: continueMode ? "all" : draft.range,
      options: [
        { value: "all", label: i18n.t("loopOut.range.all") },
        { value: "keys", label: i18n.t("loopOut.range.keys") },
        { value: "duration", label: i18n.t("loopOut.range.duration") }
      ],
      ...(state.busy || continueMode
        ? {
            disabled: true,
            disabledReason: state.busy
              ? state.busyReason ?? i18n.t("status.initializing")
              : i18n.t("loopOut.type.continue")
          }
        : { disabled: false }),
      onChange: (value) => {
        if (!isLoopOutRange(value)) return;
        state.loopOut.range = value;
        shell.rerender();
      }
    })
  );

  if (!continueMode && draft.range === "keys") {
    regions.content.appendChild(
      numberField(document, {
        id: "motion-loopout-keyframes",
        label: i18n.t("loopOut.numKeyframes"),
        value: draft.numKeyframes,
        min: 1,
        max: 1000,
        step: 1,
        ...(state.busy
          ? { disabled: true, disabledReason: state.busyReason ?? i18n.t("status.initializing") }
          : { disabled: false }),
        onInput: (value) => {
          state.loopOut.numKeyframes = value;
        },
        onCommit: (value) => {
          state.loopOut.numKeyframes = value;
          shell.rerender();
        }
      })
  );
  }

  if (!continueMode && draft.range === "duration") {
    regions.content.appendChild(
      numberField(document, {
        id: "motion-loopout-duration",
        label: i18n.t("loopOut.duration"),
        value: draft.duration,
        min: 0.01,
        max: 3600,
        step: 0.01,
        unit: "s",
        ...(state.busy
          ? { disabled: true, disabledReason: state.busyReason ?? i18n.t("status.initializing") }
          : { disabled: false }),
        onInput: (value) => {
          state.loopOut.duration = value;
        },
        onCommit: (value) => {
          state.loopOut.duration = value;
          shell.rerender();
        }
      })
  );
  }

  regions.content.appendChild(sectionTitle(document, i18n.t("loopOut.section.safety")));
  regions.content.appendChild(
    propertyRow(document, i18n.t("loopOut.safeConflict"), i18n.t("loopOut.safeConflict.value"), "ok")
  );
  regions.content.appendChild(notice(document, i18n.t("loopOut.safeConflict.description")));
}

function renderSystem(regions: RenderRegions, i18n: I18n): void {
  const capabilities = state.capabilities;

  if (!capabilities) {
    if (!state.lastError) {
      regions.content.appendChild(notice(document, i18n.t("message.systemCheckIdle")));
    }
    return;
  }

  regions.content.appendChild(
    propertyRow(
      document,
      i18n.t("capability.supportTier"),
      i18n.t(`capability.tier.afterEffects.${capabilities.supportTier}` as Parameters<I18n["t"]>[0])
    )
  );

  regions.content.appendChild(sectionTitle(document, i18n.t("view.system.title")));

  for (const [key, finding] of Object.entries(capabilities.findings)) {
    if (!finding) {
      continue;
    }

    // Estado por texto, não só por cor: a §22.4 proíbe status que dependa de cor.
    const tone: RowTone =
      finding.state === "available" ? "ok" : finding.state === "unknown" ? "unknown" : "off";
    const value =
      finding.state === "available"
        ? i18n.t("capability.state.available")
        : `${i18n.t(`capability.state.${finding.state}` as Parameters<I18n["t"]>[0])} — ${
            finding.reasonKey ? i18n.t(finding.reasonKey as Parameters<I18n["t"]>[0]) : ""
          }`.trim();

    regions.content.appendChild(
      propertyRow(
        document,
        i18n.t(`capability.key.${key}` as Parameters<I18n["t"]>[0]),
        value,
        tone
      )
    );
  }
}

function renderSettings(
  regions: RenderRegions,
  i18n: I18n,
  motionPreference: ReducedMotionController
): void {
  regions.content.appendChild(sectionTitle(document, i18n.t("settings.interface.title")));
  regions.content.appendChild(
    checkboxField(document, {
      id: "settings-reduce-motion",
      label: i18n.t("settings.reduceMotion.label"),
      description: i18n.t("settings.reduceMotion.description"),
      checked: motionPreference.snapshot().internal,
      onChange: (checked) => {
        motionPreference.setInternal(checked);
        regions.shell.rerender();
      }
    })
  );
}

function renderDiagnostics(regions: RenderRegions, i18n: I18n, logger: MotionLogger): void {
  const entries = logger.entries();
  const size = logger.size();

  regions.content.appendChild(notice(document, i18n.t("logs.redactionNotice")));
  regions.content.appendChild(
    sectionTitle(document, i18n.t("logs.summary", { count: size.entries, dropped: size.dropped }))
  );

  if (entries.length === 0) {
    regions.content.appendChild(notice(document, i18n.t("logs.empty")));
  } else {
    // Mais recente primeiro: quem abre o diagnóstico está atrás do que acabou de
    // acontecer, não do início da sessão.
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const entry = entries[index];
      if (!entry) {
        continue;
      }

      const parts = [
        entry.timestamp.slice(11, 19),
        entry.level.toUpperCase(),
        entry.message ?? entry.command ?? "-"
      ];
      if (entry.durationMs !== null) {
        parts.push(`${entry.durationMs} ms`);
      }
      if (entry.errorCode) {
        parts.push(entry.errorCode);
      }

      const level = entry.level === "error" || entry.level === "warn" ? entry.level : undefined;
      regions.content.appendChild(logLine(document, parts.join("  "), level));
    }
  }

  const shell = regions.shell;

  regions.actions.appendChild(
    button(document, {
      label: i18n.t("action.exportBundle"),
      variant: "primary",
      onClick: () => exportBundle(shell, i18n, logger)
    })
  );
  regions.actions.appendChild(
    button(document, {
      label: i18n.t("action.clearLogs"),
      onClick: () => {
        const removed = logger.clear();
        shell.setStatus(i18n.t("message.logsCleared", { count: removed }), "ok");
        shell.rerender();
      }
    })
  );
  regions.actions.appendChild(
    button(document, {
      label: logger.isDebugMode() ? i18n.t("action.disableDebug") : i18n.t("action.enableDebug"),
      onClick: () => {
        if (logger.isDebugMode()) {
          logger.disableDebugMode();
          shell.setStatus(i18n.t("message.debugDisabled"));
        } else {
          logger.enableDebugMode();
          shell.setStatus(i18n.t("message.debugEnabled"), "ok");
        }
        shell.rerender();
      }
    })
  );
}

/**
 * Mostra uma falha ao usuário.
 *
 * Nunca só "erro": o contrato garante `code`, `message` e `recoverable`, e a
 * mensagem que o usuário lê inclui os três. Um erro sem ação corretiva obriga a
 * pessoa a adivinhar, e é isso que a §8 do master spec proíbe.
 */
/**
 * Texto local para uma falha de host.
 *
 * Separado de `reportFailure` porque a prévia precisa do texto sem mexer no
 * status do painel: uma regra recusada na prévia é informação dentro da view, e
 * não um erro da última ação.
 */
function describeFailure(i18n: I18n, response: CommandResponse): string {
  const error = response.error;
  if (!error) return i18n.t("message.failureWithoutReason");

  const action = error.action
    ? i18n.has(error.action)
      ? i18n.t(error.action as Parameters<I18n["t"]>[0])
      : error.action
    : null;
  const localizedMessage = i18n.t(error.recoverable ? "status.notCompleted" : "status.failed");
  const failure = i18n.t("error.withCode", { code: error.code, message: localizedMessage });
  return action ? `${failure} — ${action}` : failure;
}

function reportFailure(shell: Shell, i18n: I18n, response: CommandResponse): void {
  const error = response.error;

  if (!error) {
    state.lastError = i18n.t("message.failureWithoutReason");
    shell.setStatus(i18n.t("status.failed"), "error");
    return;
  }

  const action = error.action
    ? i18n.has(error.action)
      ? i18n.t(error.action as Parameters<I18n["t"]>[0])
      : error.action
    : null;
  // `message` atravessa uma fronteira de host e pode vir de versão antiga,
  // exceção de provider ou texto não localizado. A UI nunca o renderiza. Código
  // e recoverable escolhem uma mensagem local; action fornece a correção exata.
  const localizedMessage = i18n.t(error.recoverable ? "status.notCompleted" : "status.failed");
  const failure = i18n.t("error.withCode", { code: error.code, message: localizedMessage });
  state.lastError = action ? `${failure} — ${action}` : failure;
  shell.setStatus(i18n.t(error.recoverable ? "status.notCompleted" : "status.failed"), "error");
}

type Client = NonNullable<ReturnType<typeof createAeHostAdapter>>["client"];

function setBusy(shell: Shell, busy: boolean, reason?: string): void {
  state.busy = busy;
  state.busyReason = busy ? reason ?? null : null;
  shell.rerender();
}

async function refreshContext(
  shell: Shell,
  i18n: I18n,
  logger: MotionLogger,
  client: Client,
  successStatus?: string
): Promise<void> {
  shell.setStatus(i18n.t("status.readingContext"), "busy");
  setBusy(shell, true, i18n.t("status.readingContext"));

  const response = await client.execute<ContextData>("ae.context.read");
  logger.recordResponse("ae.context.read", response);

  if (!response.ok || !response.data) {
    state.context = null;
    reportFailure(shell, i18n, response);
    setBusy(shell, false);
    return;
  }

  state.context = response.data;
  state.lastError = null;
  logger.setHost("after-effects", response.data.hostVersion ?? undefined);
  shell.setStatus(successStatus ?? i18n.t("status.connected"), "ok");
  setBusy(shell, false);
}

function isLoopOutResultData(value: unknown): value is LoopOutResultData {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<LoopOutResultData>;
  return Number.isInteger(candidate.appliedCount) && (candidate.appliedCount ?? -1) >= 0 &&
    Number.isInteger(candidate.unchangedCount) && (candidate.unchangedCount ?? -1) >= 0;
}

async function applyFlicker(
  shell: Shell,
  i18n: I18n,
  logger: MotionLogger,
  client: Client
): Promise<void> {
  if (state.busy) return;

  if (!state.context?.isComposition) {
    state.lastError = i18n.t("message.flickerNoActiveComp");
    shell.setStatus(i18n.t("status.notCompleted"), "error");
    shell.rerender();
    return;
  }

  const draft = state.flicker;
  if (!isFlickerDraftValid(draft)) {
    state.lastError = draft.minFactor > draft.maxFactor
      ? i18n.t("message.flickerRangeInverted")
      : i18n.t("message.flickerInvalidNumber");
    shell.setStatus(i18n.t("status.notCompleted"), "error");
    shell.rerender();
    return;
  }

  shell.setStatus(i18n.t("status.applyingFlicker"), "busy");
  setBusy(shell, true, i18n.t("status.applyingFlicker"));

  const response = await client.execute<SmoothResultData>(
    "ae.expression.flicker",
    {
      rate: draft.rate,
      minFactor: draft.minFactor,
      maxFactor: draft.maxFactor,
      seed: draft.seed,
      conflictMode: "skip"
    },
    { preserveSelection: true }
  );
  logger.recordResponse("ae.expression.flicker", response);

  if (!response.ok || !isSmoothResultData(response.data)) {
    if (!response.ok) {
      reportFailure(shell, i18n, response);
    } else {
      state.lastError = i18n.t("message.failureWithoutReason");
      logger.error("Resposta Flicker invalida.", {
        command: "ae.expression.flicker",
        errorCode: "INVALID_HOST_RESPONSE",
        result: "failure"
      });
      shell.setStatus(i18n.t("status.failed"), "error");
    }
    setBusy(shell, false);
    return;
  }

  state.lastError = null;
  const success = response.data.appliedCount > 0
    ? i18n.t("message.flickerApplied", { count: response.data.appliedCount })
    : i18n.t("message.flickerAlreadyApplied", { count: response.data.unchangedCount });
  shell.setStatus(success, "ok");
  setBusy(shell, false);
}

interface LayerListResultData {
  layers: LayerSummary[];
  totalCount: number;
  truncated: boolean;
}

function isLayerSummary(value: unknown): value is LayerSummary {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    Number.isInteger(record.index) &&
    (record.index as number) >= 1 &&
    typeof record.name === "string" &&
    typeof record.type === "string" &&
    (record.parentIndex === null || Number.isInteger(record.parentIndex)) &&
    typeof record.selected === "boolean"
  );
}

function isLayerListResultData(value: unknown): value is LayerListResultData {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    Array.isArray(record.layers) &&
    record.layers.every(isLayerSummary) &&
    Number.isInteger(record.totalCount) &&
    typeof record.truncated === "boolean"
  );
}

/**
 * Lê a lista de camadas para o seletor de alvo.
 *
 * Falha aqui não bloqueia a ferramenta: o painel continua utilizável para
 * desparentear, que não precisa de alvo. Deixar a ferramenta inteira inacessível
 * porque uma leitura falhou seria pior que a leitura ausente.
 */
async function loadLayers(): Promise<void> {
  const fiacao = wiringAtual;
  if (!fiacao || state.busy) return;
  const { shell, i18n, logger, client } = fiacao;
  setBusy(shell, true, i18n.t("status.loadingLayers"));

  const response = await client.execute<LayerListResultData>("ae.layer.list", {});
  logger.recordResponse("ae.layer.list", response);

  if (!response.ok || !isLayerListResultData(response.data)) {
    state.layers = null;
    state.layersTotal = 0;
    if (!response.ok) {
      reportFailure(shell, i18n, response);
    } else {
      logger.error("Resposta de lista de camadas invalida.", {
        command: "ae.layer.list",
        errorCode: "INVALID_HOST_RESPONSE",
        result: "failure"
      });
    }
    setBusy(shell, false);
    return;
  }

  state.layers = response.data.layers;
  state.layersTotal = response.data.totalCount;

  // O alvo guardado pode ter sumido ou trocado de nome desde a última leitura.
  // Mantê-lo apontando para um índice que virou outra camada é exatamente o erro
  // silencioso que a soma de verificação do host existe para pegar.
  const alvo = state.parent.targetLayerIndex;
  if (alvo !== 0) {
    const ainda = state.layers.find(
      (camada) => camada.index === alvo && camada.name === state.parent.targetLayerName
    );
    if (!ainda) {
      state.parent.targetLayerIndex = 0;
      state.parent.targetLayerName = "";
    }
  }

  setBusy(shell, false);
}

interface TextBoxResultData {
  createdCount: number;
  unchangedCount: number;
}

function isTextBoxResultData(value: unknown): value is TextBoxResultData {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    Number.isInteger(record.createdCount) &&
    (record.createdCount as number) >= 0 &&
    Number.isInteger(record.unchangedCount) &&
    (record.unchangedCount as number) >= 0
  );
}

function isTextBoxDraftValid(draft: TextBoxDraft): boolean {
  for (const valor of [draft.paddingX, draft.paddingY, draft.roundness]) {
    if (!Number.isFinite(valor) || valor < 0 || valor > 10_000) return false;
  }
  if (!Number.isFinite(draft.fillOpacity) || draft.fillOpacity < 0 || draft.fillOpacity > 100) {
    return false;
  }
  return normalizeHexColor(draft.fillColor) !== null;
}

/**
 * `#rrggbb` para os tres canais 0..1 que o `ADBE Vector Fill Color` recebe.
 *
 * A divisao por 255 e a conversao direta do valor sRGB. Se o projeto estiver com
 * gerenciamento de cor ativo, o After Effects pode interpretar esses numeros no
 * espaco de trabalho e a cor exibida nao bater exatamente com o seletor — isso
 * ainda nao foi medido em host e esta registrado em docs/HOST_LIMITATIONS.md.
 */
function hexToChannels(hex: string): [number, number, number] {
  const normalized = normalizeHexColor(hex) ?? "#000000";
  return [
    parseInt(normalized.slice(1, 3), 16) / 255,
    parseInt(normalized.slice(3, 5), 16) / 255,
    parseInt(normalized.slice(5, 7), 16) / 255
  ];
}

interface RenamePreviewItem {
  index: number;
  before: string;
  after: string;
}

interface RenamePreviewData {
  totalCount: number;
  changedCount: number;
  sourceChangedCount: number;
  items: RenamePreviewItem[];
}

/**
 * Uma posição na pilha, antes ou depois da inversão.
 *
 * O host devolve o registro inteiro — índice, índice original, nome e tempo — e
 * não só o nome. Eu havia tipado como `string[]`, e a prévia teria sido
 * rejeitada em silêncio pelo guarda a cada abertura da ferramenta: a lista
 * ficaria eternamente em "calculando". Só a execução em host mostrou isso.
 */
interface ReverseOrderEntry {
  index: number;
  originalIndex: number;
  name: string;
  startTime: number;
}

interface ReversePreviewData {
  targetCount: number;
  timingChangedCount: number;
  before: ReverseOrderEntry[];
  after: ReverseOrderEntry[];
}

function isRenamePreviewData(value: unknown): value is RenamePreviewData {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    Number.isInteger(record.totalCount) &&
    Number.isInteger(record.changedCount) &&
    Number.isInteger(record.sourceChangedCount) &&
    Array.isArray(record.items) &&
    record.items.every((item) => {
      if (typeof item !== "object" || item === null) return false;
      const entry = item as Record<string, unknown>;
      return (
        Number.isInteger(entry.index) &&
        typeof entry.before === "string" &&
        typeof entry.after === "string"
      );
    })
  );
}

function isReversePreviewData(value: unknown): value is ReversePreviewData {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  const entradas = (list: unknown): boolean =>
    Array.isArray(list) &&
    list.every((item) => {
      if (typeof item !== "object" || item === null) return false;
      const entrada = item as Record<string, unknown>;
      return (
        Number.isInteger(entrada.index) &&
        Number.isInteger(entrada.originalIndex) &&
        typeof entrada.name === "string" &&
        typeof entrada.startTime === "number"
      );
    });
  return (
    Number.isInteger(record.targetCount) &&
    Number.isInteger(record.timingChangedCount) &&
    entradas(record.before) &&
    entradas(record.after)
  );
}

/**
 * Teto de linhas desenhadas numa prévia.
 *
 * Uma composição com centenas de camadas produziria centenas de nós a cada
 * confirmação de campo, e a lista é para conferir a regra — não para ler o
 * projeto inteiro. O rodapé diz quantas ficaram de fora.
 */
const PREVIEW_MAX_ROWS = 40;

interface FiacaoCorrente {
  shell: Shell;
  i18n: I18n;
  logger: MotionLogger;
  client: Client;
}

/**
 * Fiação corrente, preenchida a cada render.
 *
 * `render` é síncrono e não recebe o cliente, mas os campos precisam pedir uma
 * prévia nova ao host a cada confirmação. Guardar a fiação aqui é o que liga as
 * duas coisas sem espalhar o cliente por dentro de cada componente.
 */
let wiringAtual: FiacaoCorrente | null = null;

/**
 * Descarta respostas de prévia que chegam fora de ordem.
 *
 * Os campos confirmam rápido, e uma prévia pedida antes pode voltar depois. Sem
 * este contador, a lista mostraria o resultado de uma regra que a pessoa já
 * trocou — e ela aplicaria confiando no que está vendo.
 */
let previewSequence = 0;

async function refreshRenamePreview(): Promise<void> {
  const fiacao = wiringAtual;
  if (!fiacao) return;

  const sequencia = previewSequence + 1;
  previewSequence = sequencia;

  const draft = state.rename;
  const response = await fiacao.client.execute<RenamePreviewData>("ae.layer.rename.preview", {
    scope: draft.scope,
    prefix: draft.prefix,
    suffix: draft.suffix,
    find: draft.find,
    replace: draft.replace,
    regex: draft.regex,
    counterStart: draft.counterStart,
    padding: draft.padding,
    sourceName: draft.sourceName,
    preview: true
  });
  fiacao.logger.recordResponse("ae.layer.rename.preview", response);

  if (sequencia !== previewSequence) return;

  state.renamePreview = response.ok && isRenamePreviewData(response.data) ? response.data : null;
  // A prévia recusada é informação, não falha do painel: uma regex perigosa
  // recusada aqui é exatamente o guarda funcionando, e a pessoa precisa ver o
  // motivo antes de clicar em Aplicar.
  state.previewError = response.ok ? null : describeFailure(fiacao.i18n, response);
  fiacao.shell.rerender();
}

async function refreshReversePreview(): Promise<void> {
  const fiacao = wiringAtual;
  if (!fiacao) return;

  const sequencia = previewSequence + 1;
  previewSequence = sequencia;

  const draft = state.reverseOrder;
  const response = await fiacao.client.execute<ReversePreviewData>(
    "ae.layer.reverse-order.preview",
    {
      scope: draft.scope,
      preserveTrackMattes: draft.preserveTrackMattes,
      preserveParents: draft.preserveParents,
      reverseTimingToo: draft.reverseTimingToo
    }
  );
  fiacao.logger.recordResponse("ae.layer.reverse-order.preview", response);

  if (sequencia !== previewSequence) return;

  state.reversePreview = response.ok && isReversePreviewData(response.data) ? response.data : null;
  state.previewError = response.ok ? null : describeFailure(fiacao.i18n, response);
  fiacao.shell.rerender();
}

/** Desenha a lista de prévia com teto de linhas e rodapé de contagem. */
function renderPreviewRows(
  regions: RenderRegions,
  i18n: I18n,
  linhas: readonly { antes: string; depois: string }[],
  total: number
): void {
  if (linhas.length === 0) {
    regions.content.appendChild(hint(document, i18n.t("message.previewEmpty")));
    return;
  }

  for (const linha of linhas.slice(0, PREVIEW_MAX_ROWS)) {
    regions.content.appendChild(propertyRow(document, linha.antes, linha.depois));
  }
  if (total > PREVIEW_MAX_ROWS) {
    regions.content.appendChild(
      hint(document, i18n.t("message.previewMore", { count: total - PREVIEW_MAX_ROWS }))
    );
  }
}

interface AnchorPreviewData {
  targetCount: number;
  changedCount: number;
  targets: Array<{
    layerName: string;
    gridPoint: string;
    anchorBefore: number[];
    anchorAfter: number[];
    changed: boolean;
  }>;
}

function isAnchorPreviewData(value: unknown): value is AnchorPreviewData {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  const par = (v: unknown): boolean =>
    Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === "number");
  return (
    Number.isInteger(record.targetCount) &&
    Number.isInteger(record.changedCount) &&
    Array.isArray(record.targets) &&
    record.targets.every((item) => {
      if (typeof item !== "object" || item === null) return false;
      const alvo = item as Record<string, unknown>;
      return (
        typeof alvo.layerName === "string" &&
        typeof alvo.gridPoint === "string" &&
        par(alvo.anchorBefore) &&
        par(alvo.anchorAfter) &&
        typeof alvo.changed === "boolean"
      );
    })
  );
}

function anchorArgs(draft: AnchorDraft, preview: boolean): Record<string, unknown> {
  return {
    gridPoint: draft.gridPoint,
    mode: draft.mode,
    boundsSource: "visual",
    timeMode: draft.timeMode,
    // Campo inativo é canônico: o host recusa um tempo fixo fora do modo em vez
    // de ignorá-lo, então o painel precisa mandar exatamente zero.
    fixedTime: draft.timeMode === "fixed" ? draft.fixedTime : 0,
    includeExtents: draft.includeExtents,
    preserveVisualPosition: draft.preserveVisualPosition,
    randomSeed: draft.randomSeed,
    preview
  };
}

async function refreshAnchorPreview(): Promise<void> {
  const fiacao = wiringAtual;
  if (!fiacao) return;

  const sequencia = previewSequence + 1;
  previewSequence = sequencia;

  const response = await fiacao.client.execute<AnchorPreviewData>(
    "ae.anchor.align.preview",
    anchorArgs(state.anchor, true)
  );
  fiacao.logger.recordResponse("ae.anchor.align.preview", response);
  if (sequencia !== previewSequence) return;

  state.anchorPreview = response.ok && isAnchorPreviewData(response.data) ? response.data : null;
  state.previewError = response.ok ? null : describeFailure(fiacao.i18n, response);
  fiacao.shell.rerender();
}

function renderAnchor(regions: RenderRegions, i18n: I18n): void {
  const shell = regions.shell;
  const draft = state.anchor;
  const confirma = (mutacao: () => void) => {
    mutacao();
    shell.rerender();
    void refreshAnchorPreview();
  };

  regions.content.appendChild(notice(document, i18n.t("message.anchorInstructions")));
  if (state.context && !state.context.isComposition) {
    regions.content.appendChild(notice(document, i18n.t("message.anchorNoActiveComp"), "warning"));
  }

  regions.content.appendChild(sectionTitle(document, i18n.t("anchor.section.point")));

  // A §14.2 pede grade 3×3. Um select de nove itens diria a mesma coisa, mas
  // esconderia a geometria: a grade é a informação, e ler "superior esquerdo"
  // numa lista custa mais que ver o canto.
  regions.content.appendChild(
    anchorGrid(document, {
      value: draft.gridPoint,
      disabled: state.busy,
      labels: ANCHOR_GRID.map(({ ponto, rotulo }) => ({ value: ponto, label: i18n.t(rotulo) })),
      onSelect: (ponto) =>
        confirma(() => {
          state.anchor.gridPoint = ponto as AnchorGridPoint;
        })
    })
  );

  regions.content.appendChild(
    selectField(document, {
      id: "anchor-mode",
      label: i18n.t("anchor.mode"),
      value: draft.mode,
      disabled: state.busy,
      options: [
        { value: "normal", label: i18n.t("anchor.mode.normal") },
        { value: "reverse", label: i18n.t("anchor.mode.reverse") },
        { value: "random", label: i18n.t("anchor.mode.random") }
      ],
      onChange: (value) =>
        confirma(() => {
          state.anchor.mode =
            value === "reverse" || value === "random" ? value : "normal";
        })
    })
  );

  if (draft.mode === "random") {
    regions.content.appendChild(
      numberField(document, {
        id: "anchor-seed",
        label: i18n.t("anchor.randomSeed"),
        value: draft.randomSeed,
        min: 0,
        max: 2_147_483_647,
        step: 1,
        disabled: state.busy,
        onCommit: (value) =>
          confirma(() => {
            state.anchor.randomSeed = value;
          })
      })
  );
  }

  regions.content.appendChild(sectionTitle(document, i18n.t("anchor.section.options")));

  regions.content.appendChild(
    selectField(document, {
      id: "anchor-time-mode",
      label: i18n.t("anchor.timeMode"),
      value: draft.timeMode,
      disabled: state.busy,
      options: [
        { value: "currentTime", label: i18n.t("anchor.timeMode.currentTime") },
        { value: "fixed", label: i18n.t("anchor.timeMode.fixed") }
      ],
      onChange: (value) =>
        confirma(() => {
          state.anchor.timeMode = value === "fixed" ? "fixed" : "currentTime";
        })
    })
  );

  if (draft.timeMode === "fixed") {
    regions.content.appendChild(
      numberField(document, {
        id: "anchor-fixed-time",
        label: i18n.t("anchor.fixedTime"),
        value: draft.fixedTime,
        min: 0,
        max: 10_800,
        step: 0.1,
        unit: i18n.t("cutKeys.unit.seconds"),
        disabled: state.busy,
        onCommit: (value) =>
          confirma(() => {
            state.anchor.fixedTime = value;
          })
      })
  );
  }

  regions.content.appendChild(
    checkboxField(document, {
      id: "anchor-extents",
      label: i18n.t("anchor.includeExtents"),
      description: i18n.t("anchor.includeExtents.description"),
      checked: draft.includeExtents,
      disabled: state.busy,
      onChange: (checked) =>
        confirma(() => {
          state.anchor.includeExtents = checked;
        })
    })
  );

  regions.content.appendChild(
    checkboxField(document, {
      id: "anchor-preserve",
      label: i18n.t("anchor.preserveVisualPosition"),
      description: i18n.t("anchor.preserveVisualPosition.description"),
      checked: draft.preserveVisualPosition,
      disabled: state.busy,
      onChange: (checked) =>
        confirma(() => {
          state.anchor.preserveVisualPosition = checked;
        })
    })
  );

  regions.content.appendChild(sectionTitle(document, i18n.t("anchor.section.preview")));

  if (state.previewError) {
    regions.content.appendChild(notice(document, state.previewError, "warning"));
    return;
  }
  const previa = state.anchorPreview;
  if (!previa) {
    regions.content.appendChild(hint(document, i18n.t("status.previewing")));
    return;
  }

  const arredonda = (n: number): string => String(Math.round(n * 100) / 100);
  renderPreviewRows(
    regions,
    i18n,
    previa.targets.map((alvo) => ({
      antes: alvo.layerName,
      depois: `${arredonda(alvo.anchorAfter[0] ?? 0)}, ${arredonda(alvo.anchorAfter[1] ?? 0)}`
    })),
    previa.targetCount
  );
  regions.content.appendChild(
    hint(
      document,
      i18n.t("message.previewChanged", {
        changed: previa.changedCount,
        total: previa.targetCount
      })
    )
  );
}

function anchorDisabledReason(i18n: I18n): string | null {
  if (state.busy) {
    return state.busyReason ?? i18n.t("status.initializing");
  }
  if (!state.context?.isComposition) {
    return i18n.t("message.anchorNoActiveComp");
  }
  if (state.previewError) {
    return state.previewError;
  }
  if (state.anchorPreview && state.anchorPreview.changedCount === 0) {
    return i18n.t("message.anchorNothing");
  }
  return null;
}

async function applyAnchor(
  shell: Shell,
  i18n: I18n,
  logger: MotionLogger,
  client: Client
): Promise<void> {
  if (state.busy) return;

  if (!state.context?.isComposition) {
    state.lastError = i18n.t("message.anchorNoActiveComp");
    shell.setStatus(i18n.t("status.notCompleted"), "error");
    shell.rerender();
    return;
  }

  shell.setStatus(i18n.t("status.applyingAnchor"), "busy");
  setBusy(shell, true, i18n.t("status.applyingAnchor"));

  const response = await client.execute<AnchorPreviewData>(
    "ae.anchor.align",
    anchorArgs(state.anchor, false),
    { preserveSelection: true }
  );
  logger.recordResponse("ae.anchor.align", response);

  if (!response.ok) {
    reportFailure(shell, i18n, response);
    setBusy(shell, false);
    return;
  }

  state.lastError = null;
  const alinhadas = isAnchorPreviewData(response.data) ? response.data.changedCount : 0;
  shell.setStatus(i18n.t("message.anchorApplied", { count: alinhadas }), "ok");
  setBusy(shell, false);

  await refreshAnchorPreview();
}

interface CutKeysPreviewData {
  totalCount: number;
  propertyCount: number;
  properties: Array<{ layerName: string; propertyName: string; keyCount: number }>;
}

interface DelayPreviewData {
  targetCount: number;
  targets: Array<{ name: string; offsetFrames: number }>;
}

function isCutKeysPreviewData(value: unknown): value is CutKeysPreviewData {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    Number.isInteger(record.totalCount) &&
    Number.isInteger(record.propertyCount) &&
    Array.isArray(record.properties) &&
    record.properties.every((item) => {
      if (typeof item !== "object" || item === null) return false;
      const entrada = item as Record<string, unknown>;
      return (
        typeof entrada.layerName === "string" &&
        typeof entrada.propertyName === "string" &&
        Number.isInteger(entrada.keyCount)
      );
    })
  );
}

function isDelayPreviewData(value: unknown): value is DelayPreviewData {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    Number.isInteger(record.targetCount) &&
    Array.isArray(record.targets) &&
    record.targets.every((item) => {
      if (typeof item !== "object" || item === null) return false;
      const entrada = item as Record<string, unknown>;
      return typeof entrada.name === "string" && Number.isFinite(entrada.offsetFrames);
    })
  );
}

/** Argumentos do CutKeys, com os tempos canônicos que o host exige. */
function cutKeysArgs(draft: CutKeysDraft, previewOnly: boolean): Record<string, unknown> {
  const entreTempos = draft.rangeMode === "betweenMarkers";
  return {
    rangeMode: draft.rangeMode,
    startTime: entreTempos ? draft.startTime : 0,
    endTime: entreTempos ? draft.endTime : 0,
    includeBoundary: draft.includeBoundary,
    previewOnly
  };
}

function delayArgs(draft: DelayDraft): Record<string, unknown> {
  return {
    delayFrames: draft.delayFrames,
    order: draft.order,
    reverse: draft.reverse,
    randomSeed: draft.randomSeed,
    spatialOrigin: [draft.originX, draft.originY],
    shiftMode: draft.shiftMode
  };
}

async function refreshCutKeysPreview(): Promise<void> {
  const fiacao = wiringAtual;
  if (!fiacao) return;

  const sequencia = previewSequence + 1;
  previewSequence = sequencia;

  const response = await fiacao.client.execute<CutKeysPreviewData>(
    "ae.keys.cut.preview",
    cutKeysArgs(state.cutKeys, true)
  );
  fiacao.logger.recordResponse("ae.keys.cut.preview", response);
  if (sequencia !== previewSequence) return;

  state.cutKeysPreview = response.ok && isCutKeysPreviewData(response.data) ? response.data : null;
  state.previewError = response.ok ? null : describeFailure(fiacao.i18n, response);
  fiacao.shell.rerender();
}

async function refreshDelayPreview(): Promise<void> {
  const fiacao = wiringAtual;
  if (!fiacao) return;

  const sequencia = previewSequence + 1;
  previewSequence = sequencia;

  const response = await fiacao.client.execute<DelayPreviewData>(
    "ae.keys.delay.preview",
    delayArgs(state.delay)
  );
  fiacao.logger.recordResponse("ae.keys.delay.preview", response);
  if (sequencia !== previewSequence) return;

  state.delayPreview = response.ok && isDelayPreviewData(response.data) ? response.data : null;
  state.previewError = response.ok ? null : describeFailure(fiacao.i18n, response);
  fiacao.shell.rerender();
}

function renderCutKeys(regions: RenderRegions, i18n: I18n): void {
  const shell = regions.shell;
  const draft = state.cutKeys;
  const confirma = (mutacao: () => void) => {
    mutacao();
    shell.rerender();
    void refreshCutKeysPreview();
  };

  regions.content.appendChild(notice(document, i18n.t("message.cutKeysInstructions")));
  if (state.context && !state.context.isComposition) {
    regions.content.appendChild(notice(document, i18n.t("message.cutKeysNoActiveComp"), "warning"));
  }

  regions.content.appendChild(sectionTitle(document, i18n.t("cutKeys.section.range")));

  regions.content.appendChild(
    selectField(document, {
      id: "cutkeys-range",
      label: i18n.t("cutKeys.rangeMode"),
      value: draft.rangeMode,
      disabled: state.busy,
      options: [
        { value: "beforeCti", label: i18n.t("cutKeys.rangeMode.beforeCti") },
        { value: "afterCti", label: i18n.t("cutKeys.rangeMode.afterCti") },
        { value: "insideWorkArea", label: i18n.t("cutKeys.rangeMode.insideWorkArea") },
        { value: "outsideWorkArea", label: i18n.t("cutKeys.rangeMode.outsideWorkArea") },
        { value: "betweenMarkers", label: i18n.t("cutKeys.rangeMode.betweenMarkers") }
      ],
      onChange: (value) =>
        confirma(() => {
          state.cutKeys.rangeMode = value as CutRangeMode;
        })
    })
  );

  // De/Até só existem no modo que os usa. O host recusa valores fora do modo,
  // então mostrá-los sempre convidaria a preencher algo que seria rejeitado.
  if (draft.rangeMode === "betweenMarkers") {
    const tempos: ReadonlyArray<{ campo: "startTime" | "endTime"; rotulo: MessageKey }> = [
      { campo: "startTime", rotulo: "cutKeys.startTime" },
      { campo: "endTime", rotulo: "cutKeys.endTime" }
    ];
    for (const { campo, rotulo } of tempos) {
      regions.content.appendChild(
        numberField(document, {
          id: `cutkeys-${campo}`,
          label: i18n.t(rotulo),
          value: draft[campo],
          min: -10_800,
          max: 10_800,
          step: 0.1,
          unit: i18n.t("cutKeys.unit.seconds"),
          disabled: state.busy,
          onCommit: (value) =>
            confirma(() => {
              state.cutKeys[campo] = value;
            })
        })
  );
    }
  }

  regions.content.appendChild(
    checkboxField(document, {
      id: "cutkeys-boundary",
      label: i18n.t("cutKeys.includeBoundary"),
      description: i18n.t("cutKeys.includeBoundary.description"),
      checked: draft.includeBoundary,
      disabled: state.busy,
      onChange: (checked) =>
        confirma(() => {
          state.cutKeys.includeBoundary = checked;
        })
    })
  );

  regions.content.appendChild(sectionTitle(document, i18n.t("cutKeys.section.preview")));

  if (state.previewError) {
    regions.content.appendChild(notice(document, state.previewError, "warning"));
    return;
  }
  const previa = state.cutKeysPreview;
  if (!previa) {
    regions.content.appendChild(hint(document, i18n.t("status.previewing")));
    return;
  }

  renderPreviewRows(
    regions,
    i18n,
    previa.properties.map((item) => ({
      antes: `${item.layerName} › ${item.propertyName}`,
      depois: String(item.keyCount)
    })),
    previa.propertyCount
  );
  regions.content.appendChild(
    hint(
      document,
      previa.totalCount === 0
        ? i18n.t("message.cutKeysNothing")
        // Prévia fala no futuro. Reaproveitar a mensagem de sucesso aqui
        // dizia que os keyframes já tinham saído, antes de qualquer clique.
        : i18n.t("message.cutKeysWillRemove", { count: previa.totalCount })
    )
  );
}

function cutKeysDisabledReason(i18n: I18n): string | null {
  if (state.busy) {
    return state.busyReason ?? i18n.t("status.initializing");
  }
  if (!state.context?.isComposition) {
    return i18n.t("message.cutKeysNoActiveComp");
  }
  if (state.previewError) {
    return state.previewError;
  }
  if (state.cutKeysPreview && state.cutKeysPreview.totalCount === 0) {
    return i18n.t("message.cutKeysNothing");
  }
  return null;
}

async function applyCutKeys(
  shell: Shell,
  i18n: I18n,
  logger: MotionLogger,
  client: Client
): Promise<void> {
  if (state.busy) return;

  if (!state.context?.isComposition) {
    state.lastError = i18n.t("message.cutKeysNoActiveComp");
    shell.setStatus(i18n.t("status.notCompleted"), "error");
    shell.rerender();
    return;
  }

  shell.setStatus(i18n.t("status.applyingCutKeys"), "busy");
  setBusy(shell, true, i18n.t("status.applyingCutKeys"));

  const response = await client.execute<CutKeysPreviewData>(
    "ae.keys.cut",
    cutKeysArgs(state.cutKeys, false),
    { preserveSelection: true }
  );
  logger.recordResponse("ae.keys.cut", response);

  if (!response.ok) {
    reportFailure(shell, i18n, response);
    setBusy(shell, false);
    return;
  }

  state.lastError = null;
  const removidos = isCutKeysPreviewData(response.data) ? response.data.totalCount : 0;
  shell.setStatus(i18n.t("message.cutKeysApplied", { count: removidos }), "ok");
  setBusy(shell, false);

  await refreshCutKeysPreview();
}

function renderDelay(regions: RenderRegions, i18n: I18n): void {
  const shell = regions.shell;
  const draft = state.delay;
  const confirma = (mutacao: () => void) => {
    mutacao();
    shell.rerender();
    void refreshDelayPreview();
  };

  regions.content.appendChild(notice(document, i18n.t("message.delayInstructions")));
  if (state.context && !state.context.isComposition) {
    regions.content.appendChild(notice(document, i18n.t("message.delayNoActiveComp"), "warning"));
  }

  regions.content.appendChild(sectionTitle(document, i18n.t("delay.section.amount")));

  regions.content.appendChild(
    numberField(document, {
      id: "delay-frames",
      label: i18n.t("delay.delayFrames"),
      value: draft.delayFrames,
      min: -100_000,
      max: 100_000,
      step: 1,
      unit: i18n.t("delay.unit.frames"),
      disabled: state.busy,
      onCommit: (value) =>
        confirma(() => {
          state.delay.delayFrames = value;
        })
    })
  );

  regions.content.appendChild(
    selectField(document, {
      id: "delay-shift-mode",
      label: i18n.t("delay.shiftMode"),
      value: draft.shiftMode,
      disabled: state.busy,
      options: [
        { value: "layerStart", label: i18n.t("delay.shiftMode.layerStart") },
        { value: "keyframes", label: i18n.t("delay.shiftMode.keyframes") }
      ],
      onChange: (value) =>
        confirma(() => {
          state.delay.shiftMode = value === "keyframes" ? "keyframes" : "layerStart";
        })
    })
  );

  regions.content.appendChild(sectionTitle(document, i18n.t("delay.section.order")));

  regions.content.appendChild(
    selectField(document, {
      id: "delay-order",
      label: i18n.t("delay.order"),
      value: draft.order,
      disabled: state.busy,
      options: [
        { value: "timeline", label: i18n.t("delay.order.timeline") },
        { value: "selection", label: i18n.t("delay.order.selection") },
        { value: "name", label: i18n.t("delay.order.name") },
        { value: "distance", label: i18n.t("delay.order.distance") },
        { value: "random", label: i18n.t("delay.order.random") }
      ],
      onChange: (value) =>
        confirma(() => {
          state.delay.order = value as DelayOrder;
        })
    })
  );

  // Semente e origem só aparecem no critério que as usa.
  if (draft.order === "random") {
    regions.content.appendChild(
      numberField(document, {
        id: "delay-seed",
        label: i18n.t("delay.randomSeed"),
        value: draft.randomSeed,
        min: 0,
        max: 2_147_483_647,
        step: 1,
        disabled: state.busy,
        onCommit: (value) =>
          confirma(() => {
            state.delay.randomSeed = value;
          })
      })
  );
  }
  if (draft.order === "distance") {
    const origens: ReadonlyArray<{ campo: "originX" | "originY"; rotulo: MessageKey }> = [
      { campo: "originX", rotulo: "delay.originX" },
      { campo: "originY", rotulo: "delay.originY" }
    ];
    for (const { campo, rotulo } of origens) {
      regions.content.appendChild(
        numberField(document, {
          id: `delay-${campo}`,
          label: i18n.t(rotulo),
          value: draft[campo],
          min: -100_000,
          max: 100_000,
          step: 10,
          disabled: state.busy,
          onCommit: (value) =>
            confirma(() => {
              state.delay[campo] = value;
            })
        })
  );
    }
  }

  regions.content.appendChild(
    checkboxField(document, {
      id: "delay-reverse",
      label: i18n.t("delay.reverse"),
      checked: draft.reverse,
      disabled: state.busy,
      onChange: (checked) =>
        confirma(() => {
          state.delay.reverse = checked;
        })
    })
  );

  regions.content.appendChild(sectionTitle(document, i18n.t("delay.section.preview")));

  if (state.previewError) {
    regions.content.appendChild(notice(document, state.previewError, "warning"));
    return;
  }
  const previa = state.delayPreview;
  if (!previa) {
    regions.content.appendChild(hint(document, i18n.t("status.previewing")));
    return;
  }

  renderPreviewRows(
    regions,
    i18n,
    previa.targets.map((alvo) => ({
      antes: alvo.name,
      depois: `${alvo.offsetFrames >= 0 ? "+" : ""}${alvo.offsetFrames} ${i18n.t("delay.unit.frames")}`
    })),
    previa.targetCount
  );
}

function delayDisabledReason(i18n: I18n): string | null {
  if (state.busy) {
    return state.busyReason ?? i18n.t("status.initializing");
  }
  if (!state.context?.isComposition) {
    return i18n.t("message.delayNoActiveComp");
  }
  return state.previewError;
}

async function applyDelay(
  shell: Shell,
  i18n: I18n,
  logger: MotionLogger,
  client: Client
): Promise<void> {
  if (state.busy) return;

  if (!state.context?.isComposition) {
    state.lastError = i18n.t("message.delayNoActiveComp");
    shell.setStatus(i18n.t("status.notCompleted"), "error");
    shell.rerender();
    return;
  }

  shell.setStatus(i18n.t("status.applyingDelay"), "busy");
  setBusy(shell, true, i18n.t("status.applyingDelay"));

  const response = await client.execute<DelayPreviewData>("ae.keys.delay", delayArgs(state.delay), {
    preserveSelection: true
  });
  logger.recordResponse("ae.keys.delay", response);

  if (!response.ok) {
    reportFailure(shell, i18n, response);
    setBusy(shell, false);
    return;
  }

  state.lastError = null;
  const alvos = isDelayPreviewData(response.data) ? response.data.targetCount : 0;
  shell.setStatus(i18n.t("message.delayApplied", { count: alvos }), "ok");
  setBusy(shell, false);

  await refreshDelayPreview();
}

function renderRename(regions: RenderRegions, i18n: I18n): void {
  const shell = regions.shell;
  const draft = state.rename;
  const confirma = (mutacao: () => void) => {
    mutacao();
    shell.rerender();
    void refreshRenamePreview();
  };

  regions.content.appendChild(notice(document, i18n.t("message.renameInstructions")));
  if (state.context && !state.context.isComposition) {
    regions.content.appendChild(notice(document, i18n.t("message.renameNoActiveComp"), "warning"));
  }

  regions.content.appendChild(sectionTitle(document, i18n.t("rename.section.rules")));

  regions.content.appendChild(
    selectField(document, {
      id: "rename-scope",
      label: i18n.t("field.scope"),
      value: draft.scope,
      disabled: state.busy,
      options: [
        { value: "selected", label: i18n.t("scope.selected") },
        { value: "composition", label: i18n.t("scope.composition") }
      ],
      onChange: (value) =>
        confirma(() => {
          state.rename.scope = value === "composition" ? "composition" : "selected";
        })
    })
  );

  const textos: ReadonlyArray<{ campo: "find" | "replace" | "prefix" | "suffix"; rotulo: MessageKey }> = [
    { campo: "find", rotulo: "rename.find" },
    { campo: "replace", rotulo: "rename.replace" },
    { campo: "prefix", rotulo: "rename.prefix" },
    { campo: "suffix", rotulo: "rename.suffix" }
  ];
  for (const { campo, rotulo } of textos) {
    regions.content.appendChild(
      textField(document, {
        id: `rename-${campo}`,
        label: i18n.t(rotulo),
        value: draft[campo],
        maxLength: 256,
        disabled: state.busy,
        onCommit: (value) =>
          confirma(() => {
            state.rename[campo] = value;
          })
      })
  );
  }

  regions.content.appendChild(
    checkboxField(document, {
      id: "rename-regex",
      label: i18n.t("rename.regex"),
      description: i18n.t("rename.regex.description"),
      checked: draft.regex,
      disabled: state.busy,
      onChange: (checked) =>
        confirma(() => {
          state.rename.regex = checked;
        })
    })
  );

  regions.content.appendChild(sectionTitle(document, i18n.t("rename.section.counter")));

  regions.content.appendChild(
    numberField(document, {
      id: "rename-padding",
      label: i18n.t("rename.padding"),
      description: i18n.t("rename.padding.description"),
      value: draft.padding,
      min: 0,
      max: 8,
      step: 1,
      disabled: state.busy,
      onCommit: (value) =>
        confirma(() => {
          state.rename.padding = value;
        })
    })
  );

  // O início do contador só faz diferença com o contador ligado.
  if (draft.padding > 0) {
    regions.content.appendChild(
      numberField(document, {
        id: "rename-counter-start",
        label: i18n.t("rename.counterStart"),
        value: draft.counterStart,
        min: -9999,
        max: 9999,
        step: 1,
        disabled: state.busy,
        onCommit: (value) =>
          confirma(() => {
            state.rename.counterStart = value;
          })
      })
  );
  }

  regions.content.appendChild(
    checkboxField(document, {
      id: "rename-source",
      label: i18n.t("rename.sourceName"),
      description: i18n.t("rename.sourceName.description"),
      checked: draft.sourceName,
      disabled: state.busy,
      onChange: (checked) =>
        confirma(() => {
          state.rename.sourceName = checked;
        })
    })
  );

  regions.content.appendChild(sectionTitle(document, i18n.t("rename.section.preview")));

  if (state.previewError) {
    regions.content.appendChild(notice(document, state.previewError, "warning"));
    return;
  }

  const previa = state.renamePreview;
  if (!previa) {
    regions.content.appendChild(hint(document, i18n.t("status.previewing")));
    return;
  }

  renderPreviewRows(
    regions,
    i18n,
    previa.items.map((item) => ({ antes: item.before, depois: item.after })),
    previa.totalCount
  );
  regions.content.appendChild(
    hint(
      document,
      i18n.t("message.previewChanged", { changed: previa.changedCount, total: previa.totalCount })
    )
  );
}

function renameDisabledReason(i18n: I18n): string | null {
  if (state.busy) {
    return state.busyReason ?? i18n.t("status.initializing");
  }
  if (!state.context?.isComposition) {
    return i18n.t("message.renameNoActiveComp");
  }
  // O motivo da prévia é o motivo do apply: os dois comandos compartilham o
  // mesmo preflight, então uma regra recusada na prévia seria recusada aqui.
  if (state.previewError) {
    return state.previewError;
  }
  if (state.renamePreview && state.renamePreview.changedCount === 0) {
    return i18n.t("message.renameNothingToChange");
  }
  return null;
}

async function applyRename(
  shell: Shell,
  i18n: I18n,
  logger: MotionLogger,
  client: Client
): Promise<void> {
  if (state.busy) return;

  if (!state.context?.isComposition) {
    state.lastError = i18n.t("message.renameNoActiveComp");
    shell.setStatus(i18n.t("status.notCompleted"), "error");
    shell.rerender();
    return;
  }

  const draft = state.rename;
  shell.setStatus(i18n.t("status.applyingRename"), "busy");
  setBusy(shell, true, i18n.t("status.applyingRename"));

  const response = await client.execute<RenamePreviewData>(
    "ae.layer.rename",
    {
      scope: draft.scope,
      prefix: draft.prefix,
      suffix: draft.suffix,
      find: draft.find,
      replace: draft.replace,
      regex: draft.regex,
      counterStart: draft.counterStart,
      padding: draft.padding,
      sourceName: draft.sourceName,
      preview: false
    },
    { preserveSelection: true }
  );
  logger.recordResponse("ae.layer.rename", response);

  if (!response.ok) {
    reportFailure(shell, i18n, response);
    setBusy(shell, false);
    return;
  }

  state.lastError = null;
  const aplicadas = isRenameResultData(response.data) ? response.data.appliedCount : 0;
  shell.setStatus(i18n.t("message.renameApplied", { count: aplicadas }), "ok");
  setBusy(shell, false);

  // Os nomes mudaram: a prévia em cache descreve um estado que não existe mais.
  await refreshRenamePreview();
}

interface RenameResultData {
  appliedCount: number;
}

function isRenameResultData(value: unknown): value is RenameResultData {
  if (typeof value !== "object" || value === null) return false;
  return Number.isInteger((value as Record<string, unknown>).appliedCount);
}

function renderReverseOrder(regions: RenderRegions, i18n: I18n): void {
  const shell = regions.shell;
  const draft = state.reverseOrder;
  const confirma = (mutacao: () => void) => {
    mutacao();
    shell.rerender();
    void refreshReversePreview();
  };

  regions.content.appendChild(notice(document, i18n.t("message.reverseInstructions")));
  if (state.context && !state.context.isComposition) {
    regions.content.appendChild(notice(document, i18n.t("message.reverseNoActiveComp"), "warning"));
  }

  regions.content.appendChild(
    selectField(document, {
      id: "reverse-scope",
      label: i18n.t("field.scope"),
      value: draft.scope,
      disabled: state.busy,
      options: [
        { value: "selected", label: i18n.t("scope.selected") },
        { value: "composition", label: i18n.t("scope.composition") }
      ],
      onChange: (value) =>
        confirma(() => {
          state.reverseOrder.scope = value === "composition" ? "composition" : "selected";
        })
    })
  );

  regions.content.appendChild(sectionTitle(document, i18n.t("reverse.section.options")));

  regions.content.appendChild(
    checkboxField(document, {
      id: "reverse-mattes",
      label: i18n.t("reverse.preserveTrackMattes"),
      checked: draft.preserveTrackMattes,
      disabled: state.busy,
      onChange: (checked) =>
        confirma(() => {
          state.reverseOrder.preserveTrackMattes = checked;
        })
    })
  );

  regions.content.appendChild(
    checkboxField(document, {
      id: "reverse-parents",
      label: i18n.t("reverse.preserveParents"),
      checked: draft.preserveParents,
      disabled: state.busy,
      onChange: (checked) =>
        confirma(() => {
          state.reverseOrder.preserveParents = checked;
        })
    })
  );

  regions.content.appendChild(
    checkboxField(document, {
      id: "reverse-timing",
      label: i18n.t("reverse.reverseTimingToo"),
      description: i18n.t("reverse.reverseTimingToo.description"),
      checked: draft.reverseTimingToo,
      disabled: state.busy,
      onChange: (checked) =>
        confirma(() => {
          state.reverseOrder.reverseTimingToo = checked;
        })
    })
  );

  regions.content.appendChild(sectionTitle(document, i18n.t("reverse.section.preview")));

  if (state.previewError) {
    regions.content.appendChild(notice(document, state.previewError, "warning"));
    return;
  }

  const previa = state.reversePreview;
  if (!previa) {
    regions.content.appendChild(hint(document, i18n.t("status.previewing")));
    return;
  }

  renderPreviewRows(
    regions,
    i18n,
    previa.after.map((entrada, posicao) => ({
      antes: previa.before[posicao]?.name ?? "",
      depois: entrada.name
    })),
    previa.targetCount
  );
}

function reverseOrderDisabledReason(i18n: I18n): string | null {
  if (state.busy) {
    return state.busyReason ?? i18n.t("status.initializing");
  }
  if (!state.context?.isComposition) {
    return i18n.t("message.reverseNoActiveComp");
  }
  if (state.previewError) {
    return state.previewError;
  }
  return null;
}

async function applyReverseOrder(
  shell: Shell,
  i18n: I18n,
  logger: MotionLogger,
  client: Client
): Promise<void> {
  if (state.busy) return;

  if (!state.context?.isComposition) {
    state.lastError = i18n.t("message.reverseNoActiveComp");
    shell.setStatus(i18n.t("status.notCompleted"), "error");
    shell.rerender();
    return;
  }

  const draft = state.reverseOrder;
  shell.setStatus(i18n.t("status.applyingReverseOrder"), "busy");
  setBusy(shell, true, i18n.t("status.applyingReverseOrder"));

  const response = await client.execute<ReversePreviewData>(
    "ae.layer.reverse-order",
    {
      scope: draft.scope,
      preserveTrackMattes: draft.preserveTrackMattes,
      preserveParents: draft.preserveParents,
      reverseTimingToo: draft.reverseTimingToo
    },
    { preserveSelection: true }
  );
  logger.recordResponse("ae.layer.reverse-order", response);

  if (!response.ok) {
    reportFailure(shell, i18n, response);
    setBusy(shell, false);
    return;
  }

  state.lastError = null;
  const alvos = isReversePreviewData(response.data) ? response.data.targetCount : 0;
  shell.setStatus(i18n.t("message.reverseApplied", { count: alvos }), "ok");
  setBusy(shell, false);

  await refreshReversePreview();
}

function renderFlip(regions: RenderRegions, i18n: I18n): void {
  const shell = regions.shell;
  const draft = state.flip;

  regions.content.appendChild(notice(document, i18n.t("message.flipInstructions")));
  if (state.context && !state.context.isComposition) {
    regions.content.appendChild(notice(document, i18n.t("message.flipNoActiveComp"), "warning"));
  }
  // O limite é declarado de saída, e não só quando o comando recusa: descobrir
  // a restrição depois de montar a seleção é pior que saber antes.
  regions.content.appendChild(notice(document, i18n.t("message.flipUnsupportedLayer"), "warning"));

  regions.content.appendChild(sectionTitle(document, i18n.t("flip.section.axis")));

  regions.content.appendChild(
    selectField(document, {
      id: "flip-axis",
      label: i18n.t("flip.axis"),
      value: draft.axis,
      disabled: state.busy,
      options: [
        { value: "horizontal", label: i18n.t("flip.axis.horizontal") },
        { value: "vertical", label: i18n.t("flip.axis.vertical") }
      ],
      onChange: (value) => {
        state.flip.axis = value === "vertical" ? "vertical" : "horizontal";
        shell.rerender();
      }
    })
  );

  regions.content.appendChild(
    selectField(document, {
      id: "flip-pivot",
      label: i18n.t("flip.pivot"),
      value: draft.pivot,
      disabled: state.busy,
      options: [
        { value: "anchor", label: i18n.t("flip.pivot.anchor") },
        { value: "selectionBounds", label: i18n.t("flip.pivot.selectionBounds") },
        { value: "compCenter", label: i18n.t("flip.pivot.compCenter") }
      ],
      onChange: (value) => {
        state.flip.pivot =
          value === "selectionBounds" || value === "compCenter" ? value : "anchor";
        shell.rerender();
      }
    })
  );

  // O centro da composição é o mesmo ponto para todas as camadas, então o modo
  // de agrupamento não muda nada ali. Mostrá-lo seria oferecer uma escolha sem
  // efeito.
  if (draft.pivot !== "compCenter") {
    regions.content.appendChild(
      selectField(document, {
        id: "flip-group-mode",
        label: i18n.t("flip.groupMode"),
        value: draft.groupMode,
        disabled: state.busy,
        options: [
          { value: "each", label: i18n.t("flip.groupMode.each") },
          { value: "group", label: i18n.t("flip.groupMode.group") }
        ],
        onChange: (value) => {
          state.flip.groupMode = value === "group" ? "group" : "each";
          shell.rerender();
        }
      })
  );
  }

  regions.content.appendChild(sectionTitle(document, i18n.t("flip.section.options")));

  regions.content.appendChild(
    checkboxField(document, {
      id: "flip-text-readability",
      label: i18n.t("flip.preserveTextReadability"),
      description: i18n.t("flip.preserveTextReadability.description"),
      checked: draft.preserveTextReadability,
      disabled: state.busy,
      onChange: (checked) => {
        state.flip.preserveTextReadability = checked;
        shell.rerender();
      }
    })
  );
}

function flipDisabledReason(i18n: I18n): string | null {
  if (state.busy) {
    return state.busyReason ?? i18n.t("status.initializing");
  }
  if (!state.context?.isComposition) {
    return i18n.t("message.flipNoActiveComp");
  }
  return null;
}

async function applyFlip(
  shell: Shell,
  i18n: I18n,
  logger: MotionLogger,
  client: Client
): Promise<void> {
  if (state.busy) return;

  if (!state.context?.isComposition) {
    state.lastError = i18n.t("message.flipNoActiveComp");
    shell.setStatus(i18n.t("status.notCompleted"), "error");
    shell.rerender();
    return;
  }

  const draft = state.flip;
  shell.setStatus(i18n.t("status.applyingFlip"), "busy");
  setBusy(shell, true, i18n.t("status.applyingFlip"));

  const response = await client.execute<SmoothResultData>(
    "ae.layer.flip",
    {
      axis: draft.axis,
      pivot: draft.pivot,
      // O centro da composição é o mesmo ponto para todas, então o modo é
      // irrelevante ali — o painel envia o valor canônico em vez de um resíduo
      // do que o usuário escolheu antes de trocar de pivô.
      groupMode: draft.pivot === "compCenter" ? "each" : draft.groupMode,
      preserveTextReadability: draft.preserveTextReadability
    },
    { preserveSelection: true }
  );
  logger.recordResponse("ae.layer.flip", response);

  if (!response.ok || !isSmoothResultData(response.data)) {
    if (!response.ok) {
      reportFailure(shell, i18n, response);
    } else {
      state.lastError = i18n.t("message.failureWithoutReason");
      logger.error("Resposta de flip invalida.", {
        command: "ae.layer.flip",
        errorCode: "INVALID_HOST_RESPONSE",
        result: "failure"
      });
      shell.setStatus(i18n.t("status.failed"), "error");
    }
    setBusy(shell, false);
    return;
  }

  state.lastError = null;
  shell.setStatus(i18n.t("message.flipApplied", { count: response.data.appliedCount }), "ok");
  setBusy(shell, false);
}

interface CreateNullResultData {
  nullIndex: number;
  nullName: string;
  parentedCount: number;
}

function isCreateNullResultData(value: unknown): value is CreateNullResultData {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    Number.isInteger(record.nullIndex) &&
    typeof record.nullName === "string" &&
    Number.isInteger(record.parentedCount) &&
    (record.parentedCount as number) >= 0
  );
}

function renderCreateNull(regions: RenderRegions, i18n: I18n): void {
  const shell = regions.shell;
  const draft = state.createNull;

  regions.content.appendChild(notice(document, i18n.t("message.createNullInstructions")));
  if (state.context && !state.context.isComposition) {
    regions.content.appendChild(notice(document, i18n.t("message.createNullNoActiveComp"), "warning"));
  }

  regions.content.appendChild(sectionTitle(document, i18n.t("createNull.section.placement")));

  regions.content.appendChild(
    selectField(document, {
      id: "createnull-placement",
      label: i18n.t("createNull.placement"),
      value: draft.placement,
      disabled: state.busy,
      options: [
        { value: "compCenter", label: i18n.t("createNull.placement.compCenter") },
        { value: "averageAnchor", label: i18n.t("createNull.placement.averageAnchor") },
        { value: "selectionBounds", label: i18n.t("createNull.placement.selectionBounds") }
      ],
      onChange: (value) => {
        state.createNull.placement =
          value === "averageAnchor" || value === "selectionBounds" ? value : "compCenter";
        shell.rerender();
      }
    })
  );

  regions.content.appendChild(
    selectField(document, {
      id: "createnull-dimension",
      label: i18n.t("createNull.dimension"),
      value: draft.dimension,
      disabled: state.busy,
      options: [
        { value: "2d", label: i18n.t("createNull.dimension.2d") },
        { value: "3d", label: i18n.t("createNull.dimension.3d") }
      ],
      onChange: (value) => {
        state.createNull.dimension = value === "3d" ? "3d" : "2d";
        shell.rerender();
      }
    })
  );

  regions.content.appendChild(sectionTitle(document, i18n.t("createNull.section.options")));

  regions.content.appendChild(
    checkboxField(document, {
      id: "createnull-parent",
      label: i18n.t("createNull.parentSelected"),
      checked: draft.parentSelected,
      disabled: state.busy,
      onChange: (checked) => {
        state.createNull.parentSelected = checked;
        shell.rerender();
      }
    })
  );

  // Preservar aparência só faz diferença quando há parentesco. Mostrá-lo solto
  // sugeriria que ele governa a posição do próprio null, o que não é o caso.
  if (draft.parentSelected) {
    regions.content.appendChild(
      checkboxField(document, {
        id: "createnull-preserve",
        label: i18n.t("parent.preserveWorldTransform"),
        description: i18n.t("parent.preserveWorldTransform.description"),
        checked: draft.preserveWorldTransform,
        disabled: state.busy,
        onChange: (checked) => {
          state.createNull.preserveWorldTransform = checked;
          shell.rerender();
        }
      })
  );
  }

  regions.content.appendChild(
    numberField(document, {
      id: "createnull-size",
      label: i18n.t("createNull.size"),
      value: draft.size,
      min: 1,
      max: 10_000,
      step: 10,
      unit: i18n.t("textBox.unit.px"),
      disabled: state.busy,
      onCommit: (value) => {
        state.createNull.size = value;
        shell.rerender();
      }
    })
  );

  regions.content.appendChild(
    numberField(document, {
      id: "createnull-label",
      label: i18n.t("createNull.label"),
      description: i18n.t("createNull.label.description"),
      value: draft.label,
      min: 0,
      max: 16,
      step: 1,
      disabled: state.busy,
      onCommit: (value) => {
        state.createNull.label = value;
        shell.rerender();
      }
    })
  );
}

function isCreateNullDraftValid(draft: CreateNullDraft): boolean {
  if (!Number.isInteger(draft.size) || draft.size < 1 || draft.size > 10_000) return false;
  return Number.isInteger(draft.label) && draft.label >= 0 && draft.label <= 16;
}

function createNullDisabledReason(i18n: I18n): string | null {
  if (state.busy) {
    return state.busyReason ?? i18n.t("status.initializing");
  }
  if (!state.context?.isComposition) {
    return i18n.t("message.createNullNoActiveComp");
  }
  if (!isCreateNullDraftValid(state.createNull)) {
    return i18n.t("message.textBoxInvalidNumber");
  }
  return null;
}

async function applyCreateNull(
  shell: Shell,
  i18n: I18n,
  logger: MotionLogger,
  client: Client
): Promise<void> {
  if (state.busy) return;

  if (!state.context?.isComposition) {
    state.lastError = i18n.t("message.createNullNoActiveComp");
    shell.setStatus(i18n.t("status.notCompleted"), "error");
    shell.rerender();
    return;
  }

  const draft = state.createNull;
  if (!isCreateNullDraftValid(draft)) {
    state.lastError = i18n.t("message.textBoxInvalidNumber");
    shell.setStatus(i18n.t("status.notCompleted"), "error");
    shell.rerender();
    return;
  }

  shell.setStatus(i18n.t("status.applyingCreateNull"), "busy");
  setBusy(shell, true, i18n.t("status.applyingCreateNull"));

  const response = await client.execute<CreateNullResultData>(
    "ae.layer.create-null",
    {
      placement: draft.placement,
      dimension: draft.dimension,
      parentSelected: draft.parentSelected,
      preserveWorldTransform: draft.preserveWorldTransform,
      size: draft.size,
      label: draft.label
    },
    { preserveSelection: true }
  );
  logger.recordResponse("ae.layer.create-null", response);

  if (!response.ok || !isCreateNullResultData(response.data)) {
    if (!response.ok) {
      reportFailure(shell, i18n, response);
    } else {
      state.lastError = i18n.t("message.failureWithoutReason");
      logger.error("Resposta de Create Null invalida.", {
        command: "ae.layer.create-null",
        errorCode: "INVALID_HOST_RESPONSE",
        result: "failure"
      });
      shell.setStatus(i18n.t("status.failed"), "error");
    }
    setBusy(shell, false);
    return;
  }

  state.lastError = null;
  shell.setStatus(
    i18n.t("message.createNullCreated", { count: response.data.parentedCount }),
    "ok"
  );
  setBusy(shell, false);

  // A pilha de camadas mudou; o cache do seletor de alvo do Parentesco ficou
  // desatualizado, e um índice velho apontaria para a camada errada.
  state.layers = null;
  state.layersTotal = 0;
}

function renderParent(regions: RenderRegions, i18n: I18n): void {
  const shell = regions.shell;
  const draft = state.parent;

  regions.content.appendChild(notice(document, i18n.t("message.parentInstructions")));
  if (state.context && !state.context.isComposition) {
    regions.content.appendChild(notice(document, i18n.t("message.parentNoActiveComp"), "warning"));
  }

  regions.content.appendChild(sectionTitle(document, i18n.t("parent.section.target")));

  regions.content.appendChild(
    checkboxField(document, {
      id: "parent-unparent",
      label: i18n.t("parent.unparent"),
      description: i18n.t("parent.unparent.description"),
      checked: draft.unparent,
      disabled: state.busy,
      onChange: (checked) => {
        state.parent.unparent = checked;
        // Desparentear não aceita alvo nem encadeamento: o host recusa a
        // combinação, então a interface não pode deixá-la montada.
        if (checked) {
          state.parent.targetLayerIndex = 0;
          state.parent.targetLayerName = "";
          state.parent.chainMode = "target";
        }
        shell.rerender();
      }
    })
  );

  // Alvo e modo só aparecem quando fazem diferença. Mostrá-los desabilitados ao
  // lado de "Desparentear" seria ruído permanente.
  if (!draft.unparent) {
    if (state.layers === null) {
      regions.content.appendChild(notice(document, i18n.t("message.parentListEmpty"), "warning"));
    } else {
      if (state.layersTotal > state.layers.length) {
        regions.content.appendChild(
          notice(document, i18n.t("message.parentListTruncated", { count: state.layersTotal }), "warning")
        );
      }

      regions.content.appendChild(
        selectField(document, {
          id: "parent-target",
          label: i18n.t("parent.targetLayer"),
          value: String(draft.targetLayerIndex),
          disabled: state.busy,
          options: [
            { value: "0", label: i18n.t("value.noTarget") },
            ...state.layers.map((camada) => ({
              value: String(camada.index),
              label: `${camada.index}. ${camada.name}`
            }))
          ],
          onChange: (value) => {
            const indice = Number(value);
            const escolhida = state.layers?.find((camada) => camada.index === indice);
            state.parent.targetLayerIndex = escolhida ? escolhida.index : 0;
            state.parent.targetLayerName = escolhida ? escolhida.name : "";
            shell.rerender();
          }
        })
  );
    }

    regions.content.appendChild(
      selectField(document, {
        id: "parent-chain-mode",
        label: i18n.t("parent.chainMode"),
        value: draft.chainMode,
        disabled: state.busy,
        options: [
          { value: "target", label: i18n.t("parent.chainMode.target") },
          { value: "chain", label: i18n.t("parent.chainMode.chain") }
        ],
        onChange: (value) => {
          state.parent.chainMode = value === "chain" ? "chain" : "target";
          shell.rerender();
        }
      })
  );
  }

  regions.content.appendChild(sectionTitle(document, i18n.t("parent.section.options")));

  regions.content.appendChild(
    checkboxField(document, {
      id: "parent-preserve",
      label: i18n.t("parent.preserveWorldTransform"),
      description: i18n.t("parent.preserveWorldTransform.description"),
      checked: draft.preserveWorldTransform,
      disabled: state.busy,
      onChange: (checked) => {
        state.parent.preserveWorldTransform = checked;
        shell.rerender();
      }
    })
  );
}

function parentDisabledReason(i18n: I18n): string | null {
  if (state.busy) {
    return state.busyReason ?? i18n.t("status.initializing");
  }
  if (!state.context?.isComposition) {
    return i18n.t("message.parentNoActiveComp");
  }
  const draft = state.parent;
  if (!draft.unparent && draft.chainMode === "target" && draft.targetLayerIndex === 0) {
    return i18n.t("message.parentNeedsTarget");
  }
  return null;
}

async function applyParent(
  shell: Shell,
  i18n: I18n,
  logger: MotionLogger,
  client: Client
): Promise<void> {
  if (state.busy) return;

  if (!state.context?.isComposition) {
    state.lastError = i18n.t("message.parentNoActiveComp");
    shell.setStatus(i18n.t("status.notCompleted"), "error");
    shell.rerender();
    return;
  }

  const draft = state.parent;
  if (!draft.unparent && draft.chainMode === "target" && draft.targetLayerIndex === 0) {
    state.lastError = i18n.t("message.parentNeedsTarget");
    shell.setStatus(i18n.t("status.notCompleted"), "error");
    shell.rerender();
    return;
  }

  shell.setStatus(i18n.t("status.applyingParent"), "busy");
  setBusy(shell, true, i18n.t("status.applyingParent"));

  const response = await client.execute<SmoothResultData>(
    "ae.layer.parent",
    {
      targetLayerIndex: draft.unparent ? 0 : draft.targetLayerIndex,
      targetLayerName: draft.unparent ? "" : draft.targetLayerName,
      preserveWorldTransform: draft.preserveWorldTransform,
      unparent: draft.unparent,
      chainMode: draft.unparent ? "target" : draft.chainMode
    },
    { preserveSelection: true }
  );
  logger.recordResponse("ae.layer.parent", response);

  if (!response.ok || !isSmoothResultData(response.data)) {
    if (!response.ok) {
      reportFailure(shell, i18n, response);
    } else {
      state.lastError = i18n.t("message.failureWithoutReason");
      logger.error("Resposta de parentesco invalida.", {
        command: "ae.layer.parent",
        errorCode: "INVALID_HOST_RESPONSE",
        result: "failure"
      });
      shell.setStatus(i18n.t("status.failed"), "error");
    }
    setBusy(shell, false);
    return;
  }

  state.lastError = null;
  const success = response.data.appliedCount > 0
    ? i18n.t("message.parentApplied", { count: response.data.appliedCount })
    : i18n.t("message.parentAlreadyApplied", { count: response.data.unchangedCount });
  shell.setStatus(success, "ok");
  setBusy(shell, false);

  // A hierarquia mudou; a lista em cache não reflete mais o projeto.
  await loadLayers();
  shell.setStatus(success, "ok");
}

function renderTextBox(regions: RenderRegions, i18n: I18n): void {
  const shell = regions.shell;
  const draft = state.textBox;

  regions.content.appendChild(notice(document, i18n.t("message.textBoxInstructions")));
  if (state.context && !state.context.isComposition) {
    regions.content.appendChild(notice(document, i18n.t("message.textBoxNoActiveComp"), "warning"));
  }

  regions.content.appendChild(sectionTitle(document, i18n.t("textBox.section.size")));

  regions.content.appendChild(
    numberField(document, {
      id: "textbox-padding-x",
      label: i18n.t("textBox.paddingX"),
      value: draft.paddingX,
      min: 0,
      max: 10_000,
      step: 1,
      unit: i18n.t("textBox.unit.px"),
      disabled: state.busy,
      onCommit: (value) => {
        state.textBox.paddingX = value;
        shell.rerender();
      }
    })
  );

  regions.content.appendChild(
    numberField(document, {
      id: "textbox-padding-y",
      label: i18n.t("textBox.paddingY"),
      description: i18n.t("textBox.paddingY.description"),
      value: draft.paddingY,
      min: 0,
      max: 10_000,
      step: 1,
      unit: i18n.t("textBox.unit.px"),
      disabled: state.busy,
      onCommit: (value) => {
        state.textBox.paddingY = value;
        shell.rerender();
      }
    })
  );

  regions.content.appendChild(
    numberField(document, {
      id: "textbox-roundness",
      label: i18n.t("textBox.roundness"),
      value: draft.roundness,
      min: 0,
      max: 10_000,
      step: 1,
      unit: i18n.t("textBox.unit.px"),
      disabled: state.busy,
      onCommit: (value) => {
        state.textBox.roundness = value;
        shell.rerender();
      }
    })
  );

  regions.content.appendChild(sectionTitle(document, i18n.t("textBox.section.fill")));

  regions.content.appendChild(
    colorField(document, {
      id: "textbox-fill-color",
      label: i18n.t("textBox.fillColor"),
      value: draft.fillColor,
      disabled: state.busy,
      onCommit: (value) => {
        state.textBox.fillColor = value;
        shell.rerender();
      }
    })
  );

  regions.content.appendChild(
    numberField(document, {
      id: "textbox-fill-opacity",
      label: i18n.t("textBox.fillOpacity"),
      value: draft.fillOpacity,
      min: 0,
      max: 100,
      step: 1,
      unit: i18n.t("textBox.unit.percent"),
      disabled: state.busy,
      onCommit: (value) => {
        state.textBox.fillOpacity = value;
        shell.rerender();
      }
    })
  );
}

function textBoxDisabledReason(i18n: I18n): string | null {
  if (state.busy) {
    return state.busyReason ?? i18n.t("status.initializing");
  }
  if (!state.context?.isComposition) {
    return i18n.t("message.textBoxNoActiveComp");
  }
  if (!isTextBoxDraftValid(state.textBox)) {
    return i18n.t("message.textBoxInvalidNumber");
  }
  return null;
}

async function applyTextBox(
  shell: Shell,
  i18n: I18n,
  logger: MotionLogger,
  client: Client
): Promise<void> {
  if (state.busy) return;

  if (!state.context?.isComposition) {
    state.lastError = i18n.t("message.textBoxNoActiveComp");
    shell.setStatus(i18n.t("status.notCompleted"), "error");
    shell.rerender();
    return;
  }

  const draft = state.textBox;
  if (!isTextBoxDraftValid(draft)) {
    state.lastError = i18n.t("message.textBoxInvalidNumber");
    shell.setStatus(i18n.t("status.notCompleted"), "error");
    shell.rerender();
    return;
  }

  shell.setStatus(i18n.t("status.applyingTextBox"), "busy");
  setBusy(shell, true, i18n.t("status.applyingTextBox"));

  const response = await client.execute<TextBoxResultData>(
    "ae.text.box",
    {
      paddingX: draft.paddingX,
      paddingY: draft.paddingY,
      roundness: draft.roundness,
      fillColor: hexToChannels(draft.fillColor),
      fillOpacity: draft.fillOpacity,
      // Uma caixa por camada de texto é a única forma implementada; o host
      // recusa `false` em vez de ignorar. Ver docs/HOST_LIMITATIONS.md.
      createPerLayer: true,
      conflictMode: "skip"
    },
    { preserveSelection: true }
  );
  logger.recordResponse("ae.text.box", response);

  if (!response.ok || !isTextBoxResultData(response.data)) {
    if (!response.ok) {
      reportFailure(shell, i18n, response);
    } else {
      state.lastError = i18n.t("message.failureWithoutReason");
      logger.error("Resposta de caixa de texto invalida.", {
        command: "ae.text.box",
        errorCode: "INVALID_HOST_RESPONSE",
        result: "failure"
      });
      shell.setStatus(i18n.t("status.failed"), "error");
    }
    setBusy(shell, false);
    return;
  }

  state.lastError = null;
  const success = response.data.createdCount > 0
    ? i18n.t("message.textBoxCreated", { count: response.data.createdCount })
    : i18n.t("message.textBoxAlreadyCreated", { count: response.data.unchangedCount });
  shell.setStatus(success, "ok");
  setBusy(shell, false);
}

async function applyWiggle(
  shell: Shell,
  i18n: I18n,
  logger: MotionLogger,
  client: Client
): Promise<void> {
  if (state.busy) return;

  if (!state.context?.isComposition) {
    state.lastError = i18n.t("message.wiggleNoActiveComp");
    shell.setStatus(i18n.t("status.notCompleted"), "error");
    shell.rerender();
    return;
  }

  const draft = state.wiggle;
  if (!isWiggleDraftValid(draft)) {
    state.lastError = i18n.t("message.wiggleInvalidNumber");
    shell.setStatus(i18n.t("status.notCompleted"), "error");
    shell.rerender();
    return;
  }

  shell.setStatus(i18n.t("status.applyingWiggle"), "busy");
  setBusy(shell, true, i18n.t("status.applyingWiggle"));

  const response = await client.execute<SmoothResultData>(
    "ae.expression.wiggle",
    {
      frequency: draft.frequency,
      amplitude: draft.amplitude,
      octaves: draft.octaves,
      amplitudeMultiplier: draft.amplitudeMultiplier,
      seed: draft.seed,
      conflictMode: "skip"
    },
    { preserveSelection: true }
  );
  logger.recordResponse("ae.expression.wiggle", response);

  if (!response.ok || !isSmoothResultData(response.data)) {
    if (!response.ok) {
      reportFailure(shell, i18n, response);
    } else {
      state.lastError = i18n.t("message.failureWithoutReason");
      logger.error("Resposta Wiggle invalida.", {
        command: "ae.expression.wiggle",
        errorCode: "INVALID_HOST_RESPONSE",
        result: "failure"
      });
      shell.setStatus(i18n.t("status.failed"), "error");
    }
    setBusy(shell, false);
    return;
  }

  state.lastError = null;
  const success = response.data.appliedCount > 0
    ? i18n.t("message.wiggleApplied", { count: response.data.appliedCount })
    : i18n.t("message.wiggleAlreadyApplied", { count: response.data.unchangedCount });
  shell.setStatus(success, "ok");
  setBusy(shell, false);
}

function isSmoothResultData(value: unknown): value is SmoothResultData {
  return isLoopOutResultData(value);
}

async function applySmooth(
  shell: Shell,
  i18n: I18n,
  logger: MotionLogger,
  client: Client
): Promise<void> {
  if (state.busy) return;

  if (!state.context?.isComposition) {
    state.lastError = i18n.t("message.smoothNoActiveComp");
    shell.setStatus(i18n.t("status.notCompleted"), "error");
    shell.rerender();
    return;
  }

  const draft = state.smooth;
  if (!isSmoothDraftValid(draft)) {
    state.lastError = i18n.t("message.smoothInvalidNumber");
    shell.setStatus(i18n.t("status.notCompleted"), "error");
    shell.rerender();
    return;
  }

  // "current" vira o token que o host traduz para `time`; o tempo fixo viaja
  // como número. A conversão acontece aqui, e não no host, para que o host
  // continue recebendo apenas tokens da allowlist.
  const referenceTime = draft.reference === "current" ? "current" : draft.referenceTime;

  shell.setStatus(i18n.t("status.applyingSmooth"), "busy");
  setBusy(shell, true, i18n.t("status.applyingSmooth"));

  const response = await client.execute<SmoothResultData>(
    "ae.expression.smooth",
    {
      widthSeconds: draft.widthSeconds,
      samples: draft.samples,
      referenceTime,
      conflictMode: "skip"
    },
    { preserveSelection: true }
  );
  logger.recordResponse("ae.expression.smooth", response);

  if (!response.ok || !isSmoothResultData(response.data)) {
    if (!response.ok) {
      reportFailure(shell, i18n, response);
    } else {
      state.lastError = i18n.t("message.failureWithoutReason");
      logger.error("Resposta Smooth inválida.", {
        command: "ae.expression.smooth",
        errorCode: "INVALID_HOST_RESPONSE",
        result: "failure"
      });
      shell.setStatus(i18n.t("status.failed"), "error");
    }
    setBusy(shell, false);
    return;
  }

  state.lastError = null;
  const success = response.data.appliedCount > 0
    ? i18n.t("message.smoothApplied", { count: response.data.appliedCount })
    : i18n.t("message.smoothAlreadyApplied", { count: response.data.unchangedCount });
  shell.setStatus(success, "ok");
  setBusy(shell, false);
}

async function applyLoopOut(
  shell: Shell,
  i18n: I18n,
  logger: MotionLogger,
  client: Client
): Promise<void> {
  if (state.busy) return;

  if (!state.context?.isComposition) {
    state.lastError = i18n.t("message.loopOutNoActiveComp");
    shell.setStatus(i18n.t("status.notCompleted"), "error");
    shell.rerender();
    return;
  }

  const draft = state.loopOut;
  if (!isLoopOutDraftValid(draft)) {
    state.lastError = i18n.t("message.loopOutInvalidNumber");
    shell.setStatus(i18n.t("status.notCompleted"), "error");
    shell.rerender();
    return;
  }

  const useDuration = draft.type !== "continue" && draft.range === "duration";
  const numKeyframes = draft.type !== "continue" && draft.range === "keys" ? draft.numKeyframes : 0;
  const duration = useDuration ? draft.duration : 0;

  shell.setStatus(i18n.t("status.applyingLoopOut"), "busy");
  setBusy(shell, true, i18n.t("status.applyingLoopOut"));

  const response = await client.execute<LoopOutResultData>(
    "ae.expression.loopout",
    {
      type: draft.type,
      numKeyframes,
      duration,
      useDuration,
      conflictMode: "skip"
    },
    { preserveSelection: true }
  );
  logger.recordResponse("ae.expression.loopout", response);

  if (!response.ok || !isLoopOutResultData(response.data)) {
    if (!response.ok) {
      reportFailure(shell, i18n, response);
    } else {
      state.lastError = i18n.t("message.failureWithoutReason");
      logger.error("Resposta LoopOut inválida.", {
        command: "ae.expression.loopout",
        errorCode: "INVALID_HOST_RESPONSE",
        result: "failure"
      });
      shell.setStatus(i18n.t("status.failed"), "error");
    }
    setBusy(shell, false);
    return;
  }

  state.lastError = null;
  const success = response.data.appliedCount > 0
    ? i18n.t("message.loopOutApplied", { count: response.data.appliedCount })
    : i18n.t("message.loopOutAlreadyApplied", { count: response.data.unchangedCount });
  shell.setStatus(success, "ok");
  setBusy(shell, false);
}

async function createDemo(
  shell: Shell,
  i18n: I18n,
  logger: MotionLogger,
  client: Client
): Promise<void> {
  shell.setStatus(i18n.t("status.creatingComposition"), "busy");
  setBusy(shell, true, i18n.t("status.creatingComposition"));

  const response = await client.execute<{ compositionName: string }>("ae.demo.createComposition");
  logger.recordResponse("ae.demo.createComposition", response);

  if (!response.ok || !response.data) {
    reportFailure(shell, i18n, response);
    setBusy(shell, false);
    return;
  }

  state.lastError = null;
  const success = i18n.t("message.compositionCreated", { name: response.data.compositionName });
  await refreshContext(shell, i18n, logger, client, success);
}

/**
 * Verifica a integridade da ponte com o host.
 *
 * Manda um valor conhecido — com acento, CJK, emoji e aspas — e confere o que
 * volta. É a única forma de saber se os escapes das duas direções estão íntegros
 * *nesta máquina, com esta codepage, nesta versão do After Effects*.
 */
async function verifyBridge(
  shell: Shell,
  i18n: I18n,
  logger: MotionLogger,
  client: Client
): Promise<void> {
  shell.setStatus(i18n.t("status.verifyingBridge"), "busy");
  setBusy(shell, true, i18n.t("status.verifyingBridge"));

  const probe = 'Composição 日本語 🎬 "aspas" \\barra\\ ';
  const response = await client.execute<{ payload: string }>("ae.diagnostics.echo", { payload: probe });
  logger.recordResponse("ae.diagnostics.echo", response);

  if (!response.ok || !response.data) {
    reportFailure(shell, i18n, response);
    setBusy(shell, false);
    return;
  }

  if (response.data.payload === probe) {
    state.lastError = null;
    shell.setStatus(i18n.t("message.bridgeIntact"), "ok");
  } else {
    // Falha silenciosa é o pior resultado possível aqui: significa que dados do
    // usuário estão sendo corrompidos no transporte sem ninguém perceber.
    state.lastError = i18n.t("message.bridgeCorrupted");
    logger.error("ae.diagnostics.echo", {
      command: "ae.diagnostics.echo",
      errorCode: "BRIDGE_PAYLOAD_MISMATCH",
      result: "failure"
    });
    shell.setStatus(i18n.t("status.bridgeCorrupted"), "error");
  }

  setBusy(shell, false);
}

async function runSystemCheck(
  shell: Shell,
  i18n: I18n,
  logger: MotionLogger,
  client: Client
): Promise<void> {
  shell.setStatus(i18n.t("status.checkingSystem"), "busy");
  setBusy(shell, true, i18n.t("status.checkingSystem"));

  const response = await client.execute<ProbeFacts>("ae.capability.probe");
  logger.recordResponse("ae.capability.probe", response);

  if (!response.ok || !response.data) {
    reportFailure(shell, i18n, response);
    setBusy(shell, false);
    return;
  }

  state.capabilities = buildCapabilities(response.data);
  state.lastError = null;
  shell.setStatus(i18n.t("status.connected"), "ok");
  setBusy(shell, false);
}

function exportBundle(shell: Shell, i18n: I18n, logger: MotionLogger): void {
  const bundle = JSON.stringify(logger.exportBundle(), null, 2);

  // Área de transferência via textarea temporário: o CEP 12 embute um Chromium
  // antigo, e `navigator.clipboard` exige contexto seguro que uma página
  // `file://` nem sempre satisfaz. O caminho antigo funciona nos dois.
  const area = document.createElement("textarea");
  area.value = bundle;
  document.body.appendChild(area);
  area.select();

  let copied: boolean;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }
  document.body.removeChild(area);

  shell.setStatus(
    i18n.t(copied ? "message.bundleCopied" : "message.bundleCopyFailed"),
    copied ? "ok" : "error"
  );
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => start());
} else {
  start();
}




function easeDisabledReason(i18n: I18n): string | null {
  if (state.busy) return state.busyReason ?? i18n.t("status.initializing");
  if (!state.context?.isComposition) return i18n.t("message.easeNoActiveComp");
  return null;
}

function renderEase(regions: RenderRegions, i18n: I18n): void {
  // shell unused
  const container = regions.content;

  container.appendChild(checkboxField(document, {
    id: "ease-apply-in",
    label: i18n.t("ease.applyIn"),
    checked: state.ease.applyIn,
    onChange: (checked) => {
      state.ease.applyIn = checked;
    }
  }));

  container.appendChild(checkboxField(document, {
    id: "ease-apply-out",
    label: i18n.t("ease.applyOut"),
    checked: state.ease.applyOut,
    onChange: (checked) => {
      state.ease.applyOut = checked;
    }
  }));

  container.appendChild(bezierEditor(document, {
    label: "",
    outHandleLabel: "",
    inHandleLabel: "",
    x1: state.ease.x1,
    y1: state.ease.y1,
    x2: state.ease.x2,
    y2: state.ease.y2,
    onChange: (nx1, ny1, nx2, ny2) => {
      state.ease.x1 = nx1;
      state.ease.y1 = ny1;
      state.ease.x2 = nx2;
      state.ease.y2 = ny2;
    }
  }));

  container.appendChild(hint(document, i18n.t("message.easeInstructions")));
}

async function applyEase(shell: Shell, i18n: I18n, logger: MotionLogger, client: Client): Promise<void> {
  if (state.busy) return;
  shell.setStatus(i18n.t("status.applyingEase") || "Aplicando curva...", "busy");
  setBusy(shell, true, i18n.t("status.applyingEase"));

  const response = await client.execute("ae.keys.ease.apply", {
    x1: state.ease.x1,
    y1: state.ease.y1,
    x2: state.ease.x2,
    y2: state.ease.y2,
    applyIn: state.ease.applyIn,
    applyOut: state.ease.applyOut
  });
  logger.recordResponse("ae.keys.ease.apply", response);

  if (response.ok) {
    shell.setStatus(i18n.t("message.easeApplied"), "ok");
  } else {
    reportFailure(shell, i18n, response);
  }
  setBusy(shell, false);
}

function reverseKeysDisabledReason(i18n: I18n): string | null {
  if (state.busy) return state.busyReason ?? i18n.t("status.initializing");
  if (!state.context?.isComposition) return i18n.t("message.reverseKeysNoActiveComp");
  return null;
}

function renderReverseKeys(regions: RenderRegions, i18n: I18n): void {
  // shell unused
  regions.content.appendChild(hint(document, i18n.t("message.reverseKeysInstructions")));
}

async function applyReverseKeys(shell: Shell, i18n: I18n, logger: MotionLogger, client: Client): Promise<void> {
  if (state.busy) return;
  shell.setStatus(i18n.t("status.applyingReverseKeys") || "Revertendo chaves...", "busy");
  setBusy(shell, true, i18n.t("status.applyingReverseKeys"));

  const response = await client.execute("ae.keys.reverse", {});
  logger.recordResponse("ae.keys.reverse", response);
  if (response.ok) {
    shell.setStatus(i18n.t("message.reverseKeysApplied"), "ok");
  } else {
    reportFailure(shell, i18n, response);
  }
  setBusy(shell, false);
}

function cloneKeysDisabledReason(i18n: I18n): string | null {
  if (state.busy) return state.busyReason ?? i18n.t("status.initializing");
  if (!state.context?.isComposition) return i18n.t("message.cloneKeysNoActiveComp");
  return null;
}

function renderCloneKeys(regions: RenderRegions, i18n: I18n): void {
  const shell = regions.shell;
  regions.content.appendChild(
    selectField(document, {
      id: "cloneKeys-mode",
      label: i18n.t("cloneKeys.mode"),
      value: state.cloneKeys.mode,
      options: [
        { value: "repeat", label: i18n.t("cloneKeys.mode.repeat") },
        { value: "mirror", label: i18n.t("cloneKeys.mode.mirror") }
      ],
      onChange: (value) => {
        state.cloneKeys.mode = value as CloneKeysMode;
        shell.rerender();
      }
    })
  );

  regions.content.appendChild(hint(document, i18n.t("message.cloneKeysInstructions")));
}

async function applyCloneKeys(shell: Shell, i18n: I18n, logger: MotionLogger, client: Client): Promise<void> {
  if (state.busy) return;
  shell.setStatus(i18n.t("status.applyingCloneKeys") || "Clonando chaves...", "busy");
  setBusy(shell, true, i18n.t("status.applyingCloneKeys"));

  const response = await client.execute("ae.keys.clone", {
    mode: state.cloneKeys.mode
  });
  logger.recordResponse("ae.keys.clone", response);
  if (response.ok) {
    shell.setStatus(i18n.t("message.cloneKeysApplied"), "ok");
  } else {
    reportFailure(shell, i18n, response);
  }
  setBusy(shell, false);
}

function timeControllerDisabledReason(i18n: I18n): string | null {
  if (state.busy) return state.busyReason ?? i18n.t("status.initializing");
  if (!state.context?.isComposition) return i18n.t("message.timeControllerNoActiveComp");
  return null;
}

function renderTimeController(regions: RenderRegions, i18n: I18n): void {
  const shell = regions.shell;
  const t = state.timeController;

  regions.content.appendChild(
    selectField(document, {
      id: "timeController-applyTo",
      label: i18n.t("timeController.applyTo"),
      value: t.applyTo,
      options: [
        { value: "layer", label: i18n.t("timeController.applyTo.layer") },
        { value: "properties", label: i18n.t("timeController.applyTo.properties") }
      ],
      onChange: (value) => {
        t.applyTo = value as TimeControllerApplyTo;
        shell.rerender();
      }
    })
  );

  regions.content.appendChild(
    numberField(document, {
      id: "timeController-speedPercent",
      label: i18n.t("timeController.speedPercent"),
      value: t.speedPercent,
      min: 0,
      max: 1000,
      step: 1,
      onCommit: (value) => {
        t.speedPercent = value;
        shell.rerender();
      }
    })
  );

  regions.content.appendChild(
    numberField(document, {
      id: "timeController-offsetFrames",
      label: i18n.t("timeController.offsetFrames"),
      value: t.offsetFrames,
      min: -99999,
      max: 99999,
      step: 1,
      onCommit: (value) => {
        t.offsetFrames = value;
        shell.rerender();
      }
    })
  );

  regions.content.appendChild(
    checkboxField(document, {
      id: "timeController-reverse",
      label: i18n.t("timeController.reverse"),
      checked: t.reverse,
      onChange: (checked) => {
        t.reverse = checked;
        shell.rerender();
      }
    })
  );

  regions.content.appendChild(
    checkboxField(document, {
      id: "timeController-freeze",
      label: i18n.t("timeController.freeze"),
      checked: t.freeze,
      onChange: (checked) => {
        t.freeze = checked;
        shell.rerender();
      }
    })
  );

  if (t.freeze) {
    regions.content.appendChild(
      numberField(document, {
        id: "timeController-freezeFrame",
        label: i18n.t("timeController.freezeFrame"),
        value: t.freezeFrame,
        min: 0,
        max: 99999,
        step: 1,
        onCommit: (value) => {
          t.freezeFrame = value;
          shell.rerender();
        }
      })
  );
  }
}

async function applyTimeController(shell: Shell, i18n: I18n, logger: MotionLogger, client: Client): Promise<void> {
  if (state.busy) return;
  shell.setStatus(i18n.t("status.applyingTimeController") || "Aplicando controlador de tempo...", "busy");
  setBusy(shell, true, i18n.t("status.applyingTimeController"));

  const response = await client.execute("ae.time.controller", {
    applyTo: state.timeController.applyTo,
    speedPercent: state.timeController.speedPercent,
    offsetFrames: state.timeController.offsetFrames,
    reverse: state.timeController.reverse,
    freeze: state.timeController.freeze,
    freezeFrame: state.timeController.freezeFrame
  });
  logger.recordResponse("ae.time.controller", response);

  if (response.ok) {
    shell.setStatus(i18n.t("message.timeControllerApplied"), "ok");
  } else {
    reportFailure(shell, i18n, response);
  }
  setBusy(shell, false);
}

function animateKineticDisabledReason(i18n: I18n): string | null {
  if (state.busy) return state.busyReason ?? i18n.t("status.initializing");
  if (!state.context?.isComposition) return i18n.t("message.animateKineticNoActiveComp");
  return null;
}

function renderAnimateKinetic(regions: RenderRegions, i18n: I18n): void {
  const shell = regions.shell;
  const t = state.animateKinetic;

  regions.content.appendChild(
    selectField(document, {
      id: "animateKinetic-direction",
      label: i18n.t("animateKinetic.direction"),
      value: t.direction,
      options: [
        { value: "in", label: i18n.t("animateKinetic.direction.in") },
        { value: "out", label: i18n.t("animateKinetic.direction.out") },
        { value: "both", label: i18n.t("animateKinetic.direction.both") }
      ],
      onChange: (value) => {
        t.direction = value as AnimateKineticDirection;
        shell.rerender();
      }
    })
  );

  // Os limites são os do preflight do host, para o campo não aceitar o que o
  // comando vai recusar.
  for (const campo of [
    {
      id: "durationFrames",
      key: "animateKinetic.durationFrames",
      min: 1,
      max: 1000,
      step: 1,
      unit: "animateKinetic.unit.frames"
    },
    { id: "overshoot", key: "animateKinetic.overshoot", min: 0, max: 10, step: 0.1, unit: null },
    { id: "rotation", key: "animateKinetic.rotation", min: -36000, max: 36000, step: 1, unit: "animateKinetic.unit.degrees" },
    { id: "scale", key: "animateKinetic.scale", min: -10000, max: 10000, step: 1, unit: "animateKinetic.unit.percent" },
    { id: "opacity", key: "animateKinetic.opacity", min: 0, max: 100, step: 1, unit: "animateKinetic.unit.percent" },
    {
      id: "staggerFrames",
      key: "animateKinetic.staggerFrames",
      min: 0,
      max: 1000,
      step: 1,
      unit: "animateKinetic.unit.frames"
    }
  ] as const) {
    regions.content.appendChild(
      numberField(document, {
        id: "animateKinetic-" + campo.id,
        label: i18n.t(campo.key),
        value: t[campo.id],
        min: campo.min,
        max: campo.max,
        step: campo.step,
        // `overshoot` é um fator adimensional. Com exactOptionalPropertyTypes,
        // passar `undefined` não é o mesmo que omitir a chave.
        ...(campo.unit ? { unit: i18n.t(campo.unit) } : {}),
        onCommit: (value) => {
          state.animateKinetic = { ...state.animateKinetic, [campo.id]: value };
          shell.rerender();
        }
      })
    );
  }

  regions.content.appendChild(
    selectField(document, {
      id: "animateKinetic-splitMode",
      label: i18n.t("animateKinetic.splitMode"),
      value: t.splitMode,
      options: [
        { value: "none", label: i18n.t("animateKinetic.split.none") },
        { value: "chars", label: i18n.t("animateKinetic.split.chars") },
        { value: "words", label: i18n.t("animateKinetic.split.words") },
        { value: "lines", label: i18n.t("animateKinetic.split.lines") }
      ],
      onChange: (value) => {
        t.splitMode = value as AnimateKineticSplit;
        shell.rerender();
      }
    })
  );

  regions.content.appendChild(hint(document, i18n.t("message.animateKineticInstructions")));
}


async function applyAnimateKinetic(shell: Shell, i18n: I18n, logger: MotionLogger, client: Client): Promise<void> {
  if (state.busy) return;
  shell.setStatus(i18n.t("status.applyingAnimateKinetic"), "busy");
  setBusy(shell, true, i18n.t("status.applyingAnimateKinetic"));

  const response = await client.execute("ae.animate.kinetic", {
    direction: state.animateKinetic.direction,
    durationFrames: state.animateKinetic.durationFrames,
    overshoot: state.animateKinetic.overshoot,
    rotation: state.animateKinetic.rotation,
    scale: state.animateKinetic.scale,
    opacity: state.animateKinetic.opacity,
    staggerFrames: state.animateKinetic.staggerFrames,
    splitMode: state.animateKinetic.splitMode
  });
  logger.recordResponse("ae.animate.kinetic", response);

  if (response.ok) {
    shell.setStatus(i18n.t("message.animateKineticApplied"), "ok");
  } else {
    reportFailure(shell, i18n, response);
  }
  setBusy(shell, false);
}


function inertialDisabledReason(i18n: I18n): string | null {
  if (state.busy) return state.busyReason ?? i18n.t("status.initializing");
  if (!state.context?.isComposition) return i18n.t("message.inertialNoActiveComp");
  return null;
}

function renderInertial(regions: RenderRegions, i18n: I18n): void {
  const shell = regions.shell;
  const t = state.inertial;

  regions.content.appendChild(
    numberField(document, {
      id: "inertial-amplitude",
      label: i18n.t("inertial.amplitude"),
      value: t.amplitude,
      min: 0,
      max: 1000,
      step: 1,
      unit: i18n.t("inertial.unit.percent"),
      onCommit: (value) => {
        t.amplitude = value;
        shell.rerender();
      }
    })
  );

  regions.content.appendChild(
    numberField(document, {
      id: "inertial-frequency",
      label: i18n.t("inertial.frequency"),
      value: t.frequency,
      min: 0,
      max: 60,
      step: 0.1,
      unit: i18n.t("inertial.unit.hertz"),
      onCommit: (value) => {
        t.frequency = value;
        shell.rerender();
      }
    })
  );

  regions.content.appendChild(
    numberField(document, {
      id: "inertial-decay",
      label: i18n.t("inertial.decay"),
      value: t.decay,
      min: 0,
      max: 100,
      step: 0.1,
      onCommit: (value) => {
        t.decay = value;
        shell.rerender();
      }
    })
  );

  regions.content.appendChild(
    numberField(document, {
      id: "inertial-maxDurationFrames",
      label: i18n.t("inertial.maxDuration"),
      value: t.maxDurationFrames,
      min: 1,
      max: 10000,
      step: 1,
      unit: i18n.t("inertial.unit.frames"),
      onCommit: (value) => {
        t.maxDurationFrames = value;
        shell.rerender();
      }
    })
  );

  regions.content.appendChild(
    selectField(document, {
      id: "inertial-startMode",
      label: i18n.t("inertial.startMode"),
      value: t.startMode,
      options: [
        { value: "lastKey", label: i18n.t("inertial.startMode.lastKey") },
        { value: "everyKey", label: i18n.t("inertial.startMode.everyKey") }
      ],
      onChange: (value) => {
        t.startMode = value as InertialStartMode;
        shell.rerender();
      }
    })
  );

  regions.content.appendChild(hint(document, i18n.t("message.inertialInstructions")));
}

async function applyInertial(shell: Shell, i18n: I18n, logger: MotionLogger, client: Client): Promise<void> {
  if (state.busy) return;

  if (!state.context?.isComposition) {
    state.lastError = i18n.t("message.inertialNoActiveComp");
    shell.setStatus(i18n.t("status.notCompleted"), "error");
    shell.rerender();
    return;
  }

  shell.setStatus(i18n.t("status.applyingInertial"), "busy");
  setBusy(shell, true, i18n.t("status.applyingInertial"));

  const response = await client.execute("ae.animate.inertial", { ...state.inertial });
  logger.recordResponse("ae.animate.inertial", response);

  if (response.ok) {
    shell.setStatus(i18n.t("message.inertialApplied"), "ok");
  } else {
    reportFailure(shell, i18n, response);
  }
  setBusy(shell, false);
}

function jumpDisabledReason(i18n: I18n): string | null {
  if (state.busy) return state.busyReason ?? i18n.t("status.initializing");
  if (!state.context?.isComposition) return i18n.t("message.jumpNoActiveComp");
  return null;
}

function renderJump(regions: RenderRegions, i18n: I18n): void {
  const shell = regions.shell;
  const t = state.jump;

  regions.content.appendChild(
    numberField(document, {
      id: "jump-height",
      label: i18n.t("jump.height"),
      value: t.height,
      min: 1,
      max: 100000,
      step: 1,
      unit: i18n.t("jump.unit.px"),
      onCommit: (value) => {
        t.height = value;
        shell.rerender();
      }
    })
  );

  regions.content.appendChild(
    numberField(document, {
      id: "jump-durationFrames",
      label: i18n.t("jump.durationFrames"),
      value: t.durationFrames,
      min: 4,
      max: 10000,
      step: 1,
      unit: i18n.t("jump.unit.frames"),
      onCommit: (value) => {
        t.durationFrames = value;
        shell.rerender();
      }
    })
  );

  regions.content.appendChild(
    selectField(document, {
      id: "jump-direction",
      label: i18n.t("jump.direction"),
      value: t.direction,
      options: [
        { value: "up", label: i18n.t("jump.direction.up") },
        { value: "down", label: i18n.t("jump.direction.down") },
        { value: "left", label: i18n.t("jump.direction.left") },
        { value: "right", label: i18n.t("jump.direction.right") }
      ],
      onChange: (value) => {
        t.direction = value as JumpDirection;
        shell.rerender();
      }
    })
  );

  regions.content.appendChild(
    numberField(document, {
      id: "jump-squashStretch",
      label: i18n.t("jump.squashStretch"),
      value: t.squashStretch,
      min: 0,
      max: 90,
      step: 1,
      unit: i18n.t("jump.unit.percent"),
      onCommit: (value) => {
        t.squashStretch = value;
        shell.rerender();
      }
    })
  );

  regions.content.appendChild(
    numberField(document, {
      id: "jump-anticipationFrames",
      label: i18n.t("jump.anticipation"),
      value: t.anticipationFrames,
      min: 0,
      max: Math.max(0, t.durationFrames - 4),
      step: 1,
      unit: i18n.t("jump.unit.frames"),
      onCommit: (value) => {
        t.anticipationFrames = value;
        shell.rerender();
      }
    })
  );

  regions.content.appendChild(
    numberField(document, {
      id: "jump-staggerFrames",
      label: i18n.t("jump.stagger"),
      value: t.staggerFrames,
      min: 0,
      max: 10000,
      step: 1,
      unit: i18n.t("jump.unit.frames"),
      onCommit: (value) => {
        t.staggerFrames = value;
        shell.rerender();
      }
    })
  );

  regions.content.appendChild(hint(document, i18n.t("message.jumpInstructions")));
}

async function applyJump(shell: Shell, i18n: I18n, logger: MotionLogger, client: Client): Promise<void> {
  if (state.busy) return;

  if (!state.context?.isComposition) {
    state.lastError = i18n.t("message.jumpNoActiveComp");
    shell.setStatus(i18n.t("status.notCompleted"), "error");
    shell.rerender();
    return;
  }

  shell.setStatus(i18n.t("status.applyingJump"), "busy");
  setBusy(shell, true, i18n.t("status.applyingJump"));

  const response = await client.execute("ae.animate.jump", { ...state.jump });
  logger.recordResponse("ae.animate.jump", response);

  if (response.ok) {
    shell.setStatus(i18n.t("message.jumpApplied"), "ok");
  } else {
    reportFailure(shell, i18n, response);
  }
  setBusy(shell, false);
}

function copyKeysDisabledReason(i18n: I18n): string | null {
  if (state.busy) return state.busyReason ?? i18n.t("status.initializing");
  if (!state.context?.isComposition) return i18n.t("message.copyKeysNoActiveComp");
  return null;
}

function renderCopyKeys(regions: RenderRegions, i18n: I18n): void {
  regions.content.appendChild(hint(document, i18n.t("message.copyKeysInstructions")));
}

async function applyCopyKeys(shell: Shell, i18n: I18n, logger: MotionLogger, client: Client): Promise<void> {
  if (state.busy) return;

  if (!state.context?.isComposition) {
    state.lastError = i18n.t("message.copyKeysNoActiveComp");
    shell.setStatus(i18n.t("status.notCompleted"), "error");
    shell.rerender();
    return;
  }

  shell.setStatus(i18n.t("status.copyingKeys"), "busy");
  setBusy(shell, true, i18n.t("status.copyingKeys"));

  const response = await client.execute("ae.keys.copy", {});
  logger.recordResponse("ae.keys.copy", response);

  if (response.ok) {
    shell.setStatus(i18n.t("message.copyKeysCopied"), "ok");
  } else {
    reportFailure(shell, i18n, response);
  }
  setBusy(shell, false);
}

function renderPasteKeys(regions: RenderRegions, i18n: I18n): void {
  const shell = regions.shell;
  const t = state.copyKeys;

  regions.content.appendChild(
    selectField(document, {
      id: "pasteKeys-pasteTime",
      label: i18n.t("copyKeys.pasteTime"),
      value: t.pasteTime,
      options: [
        { value: "cti", label: i18n.t("copyKeys.pasteTime.cti") },
        { value: "layerIn", label: i18n.t("copyKeys.pasteTime.layerIn") },
        { value: "original", label: i18n.t("copyKeys.pasteTime.original") }
      ],
      onChange: (value) => {
        t.pasteTime = value as PasteTimeMode;
        shell.rerender();
      }
    })
  );

  regions.content.appendChild(
    selectField(document, {
      id: "pasteKeys-mappingMode",
      label: i18n.t("copyKeys.mappingMode"),
      value: t.mappingMode,
      options: [
        { value: "matchName", label: i18n.t("copyKeys.mappingMode.matchName") },
        { value: "order", label: i18n.t("copyKeys.mappingMode.order") }
      ],
      onChange: (value) => {
        t.mappingMode = value as PasteMappingMode;
        shell.rerender();
      }
    })
  );

  // Colar no tempo original ignora ancora, e entao a opcao de preservar
  // intervalos nao descreve nada: mostrar um controle sem efeito e pior do que
  // nao mostrar.
  if (t.pasteTime !== "original") {
    regions.content.appendChild(
      checkboxField(document, {
        id: "pasteKeys-relativeTiming",
        label: i18n.t("copyKeys.relativeTiming"),
        checked: t.relativeTiming,
        onChange: (checked) => {
          t.relativeTiming = checked;
          shell.rerender();
        }
      })
    );
  }

  regions.content.appendChild(
    checkboxField(document, {
      id: "pasteKeys-includeTangents",
      label: i18n.t("copyKeys.includeTangents"),
      checked: t.includeTangents,
      onChange: (checked) => {
        t.includeTangents = checked;
        shell.rerender();
      }
    })
  );

  regions.content.appendChild(
    checkboxField(document, {
      id: "pasteKeys-includeExpressions",
      label: i18n.t("copyKeys.includeExpressions"),
      checked: t.includeExpressions,
      onChange: (checked) => {
        t.includeExpressions = checked;
        shell.rerender();
      }
    })
  );

  regions.content.appendChild(hint(document, i18n.t("message.pasteKeysInstructions")));
}

async function applyPasteKeys(shell: Shell, i18n: I18n, logger: MotionLogger, client: Client): Promise<void> {
  if (state.busy) return;

  if (!state.context?.isComposition) {
    state.lastError = i18n.t("message.copyKeysNoActiveComp");
    shell.setStatus(i18n.t("status.notCompleted"), "error");
    shell.rerender();
    return;
  }

  shell.setStatus(i18n.t("status.pastingKeys"), "busy");
  setBusy(shell, true, i18n.t("status.pastingKeys"));

  const response = await client.execute("ae.keys.paste", { ...state.copyKeys });
  logger.recordResponse("ae.keys.paste", response);

  if (response.ok) {
    shell.setStatus(i18n.t("message.copyKeysPasted"), "ok");
  } else {
    reportFailure(shell, i18n, response);
  }
  setBusy(shell, false);
}


function lookAtDisabledReason(i18n: I18n): string | null {
  if (state.busy) return state.busyReason ?? i18n.t("status.initializing");
  if (!state.context?.isComposition) return i18n.t("message.lookAtNoActiveComp");
  if (state.lookAt.targetLayerName.trim().length === 0) return i18n.t("message.lookAtNeedsTarget");
  return null;
}

function renderLookAt(regions: RenderRegions, i18n: I18n): void {
  const shell = regions.shell;
  const t = state.lookAt;

  regions.content.appendChild(
    textField(document, {
      id: "lookAt-targetLayerName",
      label: i18n.t("lookAt.target"),
      value: t.targetLayerName,
      maxLength: 200,
      onCommit: (value) => {
        t.targetLayerName = value;
        shell.rerender();
      }
    })
  );

  // Só os quatro eixos do plano XZ: os verticais exigiriam decompor a matriz de
  // volta em ângulos de Euler, e o host os recusa. Oferecê-los aqui seria
  // prometer uma falha.
  regions.content.appendChild(
    selectField(document, {
      id: "lookAt-forwardAxis",
      label: i18n.t("lookAt.forwardAxis"),
      value: t.forwardAxis,
      options: [
        { value: "+z", label: i18n.t("lookAt.axis.zPos") },
        { value: "-z", label: i18n.t("lookAt.axis.zNeg") },
        { value: "+x", label: i18n.t("lookAt.axis.xPos") },
        { value: "-x", label: i18n.t("lookAt.axis.xNeg") }
      ],
      onChange: (value) => {
        t.forwardAxis = value as LookAtAxis;
        shell.rerender();
      }
    })
  );

  for (const [eixo, chave] of [
    ["x", "lookAt.constrain.x"],
    ["y", "lookAt.constrain.y"],
    ["z", "lookAt.constrain.z"]
  ] as const) {
    regions.content.appendChild(
      checkboxField(document, {
        id: `lookAt-constrain-${eixo}`,
        label: i18n.t(chave),
        checked: t.constrainAxes[eixo],
        onChange: (checked) => {
          t.constrainAxes = { ...t.constrainAxes, [eixo]: checked };
          shell.rerender();
        }
      })
    );
  }

  regions.content.appendChild(hint(document, i18n.t("message.lookAtInstructions")));
}

async function applyLookAt(shell: Shell, i18n: I18n, logger: MotionLogger, client: Client): Promise<void> {
  if (state.busy) return;

  if (!state.context?.isComposition) {
    state.lastError = i18n.t("message.lookAtNoActiveComp");
    shell.setStatus(i18n.t("status.notCompleted"), "error");
    shell.rerender();
    return;
  }

  shell.setStatus(i18n.t("status.applyingLookAt"), "busy");
  setBusy(shell, true, i18n.t("status.applyingLookAt"));

  const response = await client.execute("ae.3d.look-at", {
    targetLayerName: state.lookAt.targetLayerName,
    forwardAxis: state.lookAt.forwardAxis,
    upAxis: "+y",
    offsetOrientation: [0, 0, 0],
    constrainAxes: { ...state.lookAt.constrainAxes }
  });
  logger.recordResponse("ae.3d.look-at", response);

  if (response.ok) {
    shell.setStatus(i18n.t("message.lookAtApplied"), "ok");
  } else {
    reportFailure(shell, i18n, response);
  }
  setBusy(shell, false);
}

function orbitDisabledReason(i18n: I18n): string | null {
  if (state.busy) return state.busyReason ?? i18n.t("status.initializing");
  if (!state.context?.isComposition) return i18n.t("message.orbitNoActiveComp");
  return null;
}

function renderOrbit(regions: RenderRegions, i18n: I18n): void {
  const shell = regions.shell;
  const t = state.orbit;

  for (const campo of [
    { id: "radius", key: "orbit.radius", min: 1, max: 1000000, step: 1, unit: "orbit.unit.px" },
    { id: "speed", key: "orbit.speed", min: -36000, max: 36000, step: 1, unit: "orbit.unit.degreesPerSecond" },
    { id: "inclination", key: "orbit.inclination", min: -360, max: 360, step: 1, unit: "orbit.unit.degrees" },
    { id: "phase", key: "orbit.phase", min: -36000, max: 36000, step: 1, unit: "orbit.unit.degrees" }
  ] as const) {
    regions.content.appendChild(
      numberField(document, {
        id: `orbit-${campo.id}`,
        label: i18n.t(campo.key),
        value: t[campo.id],
        min: campo.min,
        max: campo.max,
        step: campo.step,
        unit: i18n.t(campo.unit),
        onCommit: (value) => {
          state.orbit = { ...state.orbit, [campo.id]: value };
          shell.rerender();
        }
      })
    );
  }

  regions.content.appendChild(
    selectField(document, {
      id: "orbit-targetMode",
      label: i18n.t("orbit.targetMode"),
      value: t.targetMode,
      options: [
        { value: "newController", label: i18n.t("orbit.targetMode.new") },
        { value: "reuseController", label: i18n.t("orbit.targetMode.reuse") }
      ],
      onChange: (value) => {
        t.targetMode = value as OrbitTargetMode;
        shell.rerender();
      }
    })
  );

  regions.content.appendChild(
    checkboxField(document, {
      id: "orbit-faceTarget",
      label: i18n.t("orbit.faceTarget"),
      checked: t.faceTarget,
      onChange: (checked) => {
        t.faceTarget = checked;
        shell.rerender();
      }
    })
  );

  regions.content.appendChild(
    checkboxField(document, {
      id: "orbit-bake",
      label: i18n.t("orbit.bake"),
      checked: t.bake,
      onChange: (checked) => {
        t.bake = checked;
        shell.rerender();
      }
    })
  );

  regions.content.appendChild(hint(document, i18n.t("message.orbitInstructions")));
}

async function applyOrbit(shell: Shell, i18n: I18n, logger: MotionLogger, client: Client): Promise<void> {
  if (state.busy) return;

  if (!state.context?.isComposition) {
    state.lastError = i18n.t("message.orbitNoActiveComp");
    shell.setStatus(i18n.t("status.notCompleted"), "error");
    shell.rerender();
    return;
  }

  shell.setStatus(i18n.t("status.applyingOrbit"), "busy");
  setBusy(shell, true, i18n.t("status.applyingOrbit"));

  const response = await client.execute("ae.3d.orbit", { ...state.orbit });
  logger.recordResponse("ae.3d.orbit", response);

  if (response.ok) {
    shell.setStatus(i18n.t("message.orbitApplied"), "ok");
  } else {
    reportFailure(shell, i18n, response);
  }
  setBusy(shell, false);
}






function breakShapeDisabledReason(i18n: I18n): string | null {
  if (state.busy) return state.busyReason ?? i18n.t("status.initializing");
  if (!state.context?.isComposition) return i18n.t("message.breakShapeNoActiveComp");
  return null;
}

function renderBreakShape(regions: RenderRegions, i18n: I18n): void {
  const shell = regions.shell;
  const t = state.breakShape;

  regions.content.appendChild(
    selectField(document, {
      id: "breakShape-namingMode",
      label: i18n.t("breakShape.namingMode"),
      value: t.namingMode,
      options: [
        { value: "groupName", label: i18n.t("breakShape.namingMode.groupName") },
        { value: "indexed", label: i18n.t("breakShape.namingMode.indexed") }
      ],
      onChange: (value) => {
        t.namingMode = value as BreakShapeNaming;
        shell.rerender();
      }
    })
  );

  regions.content.appendChild(
    checkboxField(document, {
      id: "breakShape-preserveAppearance",
      label: i18n.t("breakShape.preserveAppearance"),
      checked: t.preserveAppearance,
      onChange: (checked) => {
        t.preserveAppearance = checked;
        shell.rerender();
      }
    })
  );

  regions.content.appendChild(
    checkboxField(document, {
      id: "breakShape-keepOriginal",
      label: i18n.t("breakShape.keepOriginal"),
      checked: t.keepOriginal,
      onChange: (checked) => {
        t.keepOriginal = checked;
        shell.rerender();
      }
    })
  );

  regions.content.appendChild(hint(document, i18n.t("message.breakShapeInstructions")));
}

async function applyBreakShape(shell: Shell, i18n: I18n, logger: MotionLogger, client: Client): Promise<void> {
  if (state.busy) return;

  if (!state.context?.isComposition) {
    state.lastError = i18n.t("message.breakShapeNoActiveComp");
    shell.setStatus(i18n.t("status.notCompleted"), "error");
    shell.rerender();
    return;
  }

  shell.setStatus(i18n.t("status.applyingBreakShape"), "busy");
  setBusy(shell, true, i18n.t("status.applyingBreakShape"));

  // Cria uma camada por grupo e pode remover a original: o comando é declarado
  // destrutivo e o dispatcher exige consentimento explícito.
  const response = await client.execute<{ brokenLayers: number }>(
    "ae.shape.break",
    { recursive: false, keepOriginal: state.breakShape.keepOriginal, preserveAppearance: state.breakShape.preserveAppearance, namingMode: state.breakShape.namingMode },
    { allowDestructive: true }
  );
  logger.recordResponse("ae.shape.break", response);

  if (response.ok) {
    // Grupos que não puderam ser achatados viram warning: dizer que houve
    // ressalva é mais honesto do que um "pronto" liso.
    shell.setStatus(
      i18n.t("message.breakShapeApplied", { count: response.data?.brokenLayers ?? 0 }),
      response.warnings.length > 0 ? "busy" : "ok"
    );
  } else {
    reportFailure(shell, i18n, response);
  }
  setBusy(shell, false);
}

function effectorDisabledReason(i18n: I18n): string | null {
  if (state.busy) return state.busyReason ?? i18n.t("status.initializing");
  if (!state.context?.isComposition) return i18n.t("message.effectorNoActiveComp");
  const t = state.effector;
  // Todas as intensidades em zero é um pedido vazio: o host recusa, e desabilitar
  // aqui explica por quê antes de o usuário clicar.
  if (t.positionAmount === 0 && t.scaleAmount === 0 && t.rotationAmount === 0 && t.opacityAmount === 0) {
    return i18n.t("message.effectorNeedsAmount");
  }
  return null;
}

function renderEffector(regions: RenderRegions, i18n: I18n): void {
  const shell = regions.shell;
  const t = state.effector;

  regions.content.appendChild(
    numberField(document, {
      id: "effector-radius",
      label: i18n.t("effector.radius"),
      value: t.radius,
      min: 1,
      max: 1000000,
      step: 10,
      unit: i18n.t("effector.unit.px"),
      onCommit: (value) => {
        t.radius = value;
        shell.rerender();
      }
    })
  );

  regions.content.appendChild(
    selectField(document, {
      id: "effector-falloffCurve",
      label: i18n.t("effector.falloffCurve"),
      value: t.falloffCurve,
      options: [
        { value: "linear", label: i18n.t("effector.falloffCurve.linear") },
        { value: "smoothstep", label: i18n.t("effector.falloffCurve.smoothstep") },
        { value: "bezier", label: i18n.t("effector.falloffCurve.bezier") }
      ],
      onChange: (value) => {
        t.falloffCurve = value as EffectorFalloff;
        shell.rerender();
      }
    })
  );

  // O editor só aparece na curva customizada: nas outras duas a forma é fixa e
  // desenhar nela não mudaria nada.
  if (t.falloffCurve === "bezier") {
    regions.content.appendChild(
      bezierEditor(document, {
        x1: t.curve.x1,
        y1: t.curve.y1,
        x2: t.curve.x2,
        y2: t.curve.y2,
        label: i18n.t("effector.curve"),
        outHandleLabel: i18n.t("ease.curve.outHandle"),
        inHandleLabel: i18n.t("ease.curve.inHandle"),
        onChange: (x1, y1, x2, y2) => {
          t.curve = { x1, y1, x2, y2 };
        }
      })
    );
  }

  for (const campo of [
    { id: "positionAmount", key: "effector.positionAmount", unit: "effector.unit.px" },
    { id: "scaleAmount", key: "effector.scaleAmount", unit: "effector.unit.percent" },
    { id: "rotationAmount", key: "effector.rotationAmount", unit: "effector.unit.degrees" },
    { id: "opacityAmount", key: "effector.opacityAmount", unit: "effector.unit.percent" }
  ] as const) {
    regions.content.appendChild(
      numberField(document, {
        id: "effector-" + campo.id,
        label: i18n.t(campo.key),
        value: t[campo.id],
        min: -100000,
        max: 100000,
        step: 1,
        unit: i18n.t(campo.unit),
        onCommit: (value) => {
          state.effector = { ...state.effector, [campo.id]: value };
          shell.rerender();
        }
      })
    );
  }

  regions.content.appendChild(hint(document, i18n.t("message.effectorInstructions")));
}

async function applyEffector(shell: Shell, i18n: I18n, logger: MotionLogger, client: Client): Promise<void> {
  if (state.busy) return;

  if (!state.context?.isComposition) {
    state.lastError = i18n.t("message.effectorNoActiveComp");
    shell.setStatus(i18n.t("status.notCompleted"), "error");
    shell.rerender();
    return;
  }

  shell.setStatus(i18n.t("status.applyingEffector"), "busy");
  setBusy(shell, true, i18n.t("status.applyingEffector"));

  const response = await client.execute("ae.rig.effector", {
    effectorType: "null",
    radius: state.effector.radius,
    falloffCurve: state.effector.falloffCurve,
    curve: { ...state.effector.curve },
    positionAmount: state.effector.positionAmount,
    scaleAmount: state.effector.scaleAmount,
    rotationAmount: state.effector.rotationAmount,
    opacityAmount: state.effector.opacityAmount
  });
  logger.recordResponse("ae.rig.effector", response);

  if (response.ok) {
    shell.setStatus(i18n.t("message.effectorApplied"), "ok");
  } else {
    reportFailure(shell, i18n, response);
  }
  setBusy(shell, false);
}

function cameraTransitionDisabledReason(i18n: I18n): string | null {
  if (state.busy) return state.busyReason ?? i18n.t("status.initializing");
  if (!state.context?.isComposition) return i18n.t("message.cameraTransitionNoActiveComp");
  return null;
}

function renderCameraTransition(regions: RenderRegions, i18n: I18n): void {
  const shell = regions.shell;
  const t = state.cameraTransition;

  regions.content.appendChild(
    selectField(document, {
      id: "cameraTransition-preset",
      label: i18n.t("cameraTransition.preset"),
      value: t.preset,
      options: CAMERA_TRANSITION_PRESETS.map((preset) => ({
        value: preset,
        label: i18n.t(("cameraTransition.preset." + preset) as MessageKey)
      })),
      onChange: (value) => {
        t.preset = value as CameraTransitionPreset;
        shell.rerender();
      }
    })
  );

  regions.content.appendChild(
    numberField(document, {
      id: "cameraTransition-amount",
      label: i18n.t("cameraTransition.amount"),
      value: t.amount,
      min: -1000000,
      max: 1000000,
      step: 10,
      // A unidade depende do preset: os que giram medem em graus, os demais em
      // pixels. Rotular tudo de "px" mentiria em quatro dos onze.
      unit: i18n.t(t.preset.startsWith("pan") || t.preset.startsWith("tilt")
        ? "cameraTransition.unit.degrees"
        : "cameraTransition.unit.px"),
      onCommit: (value) => {
        t.amount = value;
        shell.rerender();
      }
    })
  );

  regions.content.appendChild(
    numberField(document, {
      id: "cameraTransition-durationFrames",
      label: i18n.t("cameraTransition.duration"),
      value: t.durationFrames,
      min: 1,
      max: 10000,
      step: 1,
      unit: i18n.t("cameraTransition.unit.frames"),
      onCommit: (value) => {
        t.durationFrames = value;
        shell.rerender();
      }
    })
  );

  // O mesmo editor do CHMS-018: a curva desenhada aqui vira o ease dos dois
  // keyframes da transição, pela mesma conversão.
  regions.content.appendChild(
    bezierEditor(document, {
      x1: t.curve.x1,
      y1: t.curve.y1,
      x2: t.curve.x2,
      y2: t.curve.y2,
      label: i18n.t("cameraTransition.curve"),
      outHandleLabel: i18n.t("ease.curve.outHandle"),
      inHandleLabel: i18n.t("ease.curve.inHandle"),
      onChange: (x1, y1, x2, y2) => {
        t.curve = { x1, y1, x2, y2 };
      }
    })
  );

  regions.content.appendChild(hint(document, i18n.t("message.cameraTransitionInstructions")));
}

async function applyCameraTransition(
  shell: Shell,
  i18n: I18n,
  logger: MotionLogger,
  client: Client
): Promise<void> {
  if (state.busy) return;

  if (!state.context?.isComposition) {
    state.lastError = i18n.t("message.cameraTransitionNoActiveComp");
    shell.setStatus(i18n.t("status.notCompleted"), "error");
    shell.rerender();
    return;
  }

  shell.setStatus(i18n.t("status.applyingCameraTransition"), "busy");
  setBusy(shell, true, i18n.t("status.applyingCameraTransition"));

  const response = await client.execute("ae.camera.transition", {
    preset: state.cameraTransition.preset,
    durationFrames: state.cameraTransition.durationFrames,
    amount: state.cameraTransition.amount,
    curve: { ...state.cameraTransition.curve },
    // Vazio significa "a primeira câmera da composição", que é o caso comum.
    cameraName: ""
  });
  logger.recordResponse("ae.camera.transition", response);

  if (response.ok) {
    shell.setStatus(i18n.t("message.cameraTransitionApplied"), "ok");
  } else {
    reportFailure(shell, i18n, response);
  }
  setBusy(shell, false);
}

function cylinderDisabledReason(i18n: I18n): string | null {
  if (state.busy) return state.busyReason ?? i18n.t("status.initializing");
  if (!state.context?.isComposition) return i18n.t("message.cylinderNoActiveComp");
  return null;
}

function renderCylinder(regions: RenderRegions, i18n: I18n): void {
  const shell = regions.shell;
  const t = state.cylinder;

  for (const campo of [
    { id: "radius", key: "cylinder.radius", min: 1, max: 1000000, step: 10, unit: "cylinder.unit.px" },
    { id: "height", key: "cylinder.height", min: 0, max: 1000000, step: 10, unit: "cylinder.unit.px" },
    { id: "count", key: "cylinder.count", min: 1, max: 500, step: 1, unit: null },
    { id: "startAngle", key: "cylinder.startAngle", min: -3600, max: 3600, step: 1, unit: "cylinder.unit.degrees" },
    { id: "arcDegrees", key: "cylinder.arcDegrees", min: 1, max: 3600, step: 1, unit: "cylinder.unit.degrees" }
  ] as const) {
    regions.content.appendChild(
      numberField(document, {
        id: "cylinder-" + campo.id,
        label: i18n.t(campo.key),
        value: t[campo.id],
        min: campo.min,
        max: campo.max,
        step: campo.step,
        // `count` é adimensional. Com exactOptionalPropertyTypes, passar
        // `unit: undefined` não é o mesmo que omitir a chave — então ela é
        // adicionada só quando existe unidade.
        ...(campo.unit ? { unit: i18n.t(campo.unit) } : {}),
        onCommit: (value) => {
          state.cylinder = { ...state.cylinder, [campo.id]: value };
          shell.rerender();
        }
      })
    );
  }

  regions.content.appendChild(
    selectField(document, {
      id: "cylinder-faceMode",
      label: i18n.t("cylinder.faceMode"),
      value: t.faceMode,
      options: [
        { value: "outward", label: i18n.t("cylinder.faceMode.outward") },
        { value: "inward", label: i18n.t("cylinder.faceMode.inward") },
        { value: "none", label: i18n.t("cylinder.faceMode.none") }
      ],
      onChange: (value) => {
        t.faceMode = value as CylinderFaceMode;
        shell.rerender();
      }
    })
  );

  regions.content.appendChild(
    checkboxField(document, {
      id: "cylinder-createCamera",
      label: i18n.t("cylinder.createCamera"),
      checked: t.createCamera,
      onChange: (checked) => {
        t.createCamera = checked;
        shell.rerender();
      }
    })
  );

  regions.content.appendChild(hint(document, i18n.t("message.cylinderInstructions")));
}

async function applyCylinder(shell: Shell, i18n: I18n, logger: MotionLogger, client: Client): Promise<void> {
  if (state.busy) return;

  if (!state.context?.isComposition) {
    state.lastError = i18n.t("message.cylinderNoActiveComp");
    shell.setStatus(i18n.t("status.notCompleted"), "error");
    shell.rerender();
    return;
  }

  shell.setStatus(i18n.t("status.applyingCylinder"), "busy");
  setBusy(shell, true, i18n.t("status.applyingCylinder"));

  // O comando pode duplicar camadas para preencher o arco, e por isso é
  // declarado destrutivo.
  const response = await client.execute("ae.3d.cylinder", { ...state.cylinder }, { allowDestructive: true });
  logger.recordResponse("ae.3d.cylinder", response);

  if (response.ok) {
    shell.setStatus(i18n.t("message.cylinderApplied"), "ok");
  } else {
    reportFailure(shell, i18n, response);
  }
  setBusy(shell, false);
}

function cubeDisabledReason(i18n: I18n): string | null {
  if (state.busy) return state.busyReason ?? i18n.t("status.initializing");
  if (!state.context?.isComposition) return i18n.t("message.cubeNoActiveComp");
  return null;
}

function renderCube(regions: RenderRegions, i18n: I18n): void {
  const shell = regions.shell;
  const t = state.cube;

  regions.content.appendChild(
    numberField(document, {
      id: "cube-size",
      label: i18n.t("cube.size"),
      value: t.size,
      min: 1,
      max: 100000,
      step: 10,
      unit: i18n.t("cube.unit.px"),
      onCommit: (value) => {
        t.size = value;
        shell.rerender();
      }
    })
  );

  regions.content.appendChild(
    selectField(document, {
      id: "cube-sourceMode",
      label: i18n.t("cube.sourceMode"),
      value: t.sourceMode,
      options: [
        { value: "duplicateOne", label: i18n.t("cube.sourceMode.duplicateOne") },
        { value: "sixLayers", label: i18n.t("cube.sourceMode.sixLayers") }
      ],
      onChange: (value) => {
        t.sourceMode = value as CubeSourceMode;
        shell.rerender();
      }
    })
  );

  regions.content.appendChild(
    checkboxField(document, {
      id: "cube-faceFit",
      label: i18n.t("cube.faceFit"),
      checked: t.faceFit,
      onChange: (checked) => {
        t.faceFit = checked;
        shell.rerender();
      }
    })
  );

  regions.content.appendChild(
    checkboxField(document, {
      id: "cube-createCamera",
      label: i18n.t("cube.createCamera"),
      checked: t.createCamera,
      onChange: (checked) => {
        t.createCamera = checked;
        shell.rerender();
      }
    })
  );

  regions.content.appendChild(hint(document, i18n.t("message.cubeInstructions")));
}

async function applyCube(shell: Shell, i18n: I18n, logger: MotionLogger, client: Client): Promise<void> {
  if (state.busy) return;

  if (!state.context?.isComposition) {
    state.lastError = i18n.t("message.cubeNoActiveComp");
    shell.setStatus(i18n.t("status.notCompleted"), "error");
    shell.rerender();
    return;
  }

  shell.setStatus(i18n.t("status.applyingCube"), "busy");
  setBusy(shell, true, i18n.t("status.applyingCube"));

  const response = await client.execute(
    "ae.3d.cube",
    {
      size: state.cube.size,
      sourceMode: state.cube.sourceMode,
      faceFit: state.cube.faceFit,
      createCamera: state.cube.createCamera,
      // Girar o cubo é trabalho do controller na timeline, não do preset: o
      // painel cria o rig alinhado e o usuário gira depois.
      controllerOrientation: [0, 0, 0],
      keepSources: true
    },
    { allowDestructive: true }
  );
  logger.recordResponse("ae.3d.cube", response);

  if (response.ok) {
    shell.setStatus(i18n.t("message.cubeApplied"), "ok");
  } else {
    reportFailure(shell, i18n, response);
  }
  setBusy(shell, false);
}

function waveDisabledReason(i18n: I18n): string | null {
  if (state.busy) return state.busyReason ?? i18n.t("status.initializing");
  if (!state.context?.isComposition) return i18n.t("message.waveNoActiveComp");
  return null;
}

function renderWave(regions: RenderRegions, i18n: I18n): void {
  const shell = regions.shell;
  const t = state.wave;

  regions.content.appendChild(
    selectField(document, {
      id: "wave-mode",
      label: i18n.t("wave.mode"),
      value: t.mode,
      options: [
        { value: "transform", label: i18n.t("wave.mode.transform") },
        { value: "effect", label: i18n.t("wave.mode.effect") }
      ],
      onChange: (value) => {
        t.mode = value as WaveMode;
        // Assar só existe no modo transform: manter a marca ligada ao trocar de
        // modo mandaria ao host um pedido que ele recusa.
        if (t.mode !== "transform") t.bake = false;
        shell.rerender();
      }
    })
  );

  regions.content.appendChild(
    numberField(document, {
      id: "wave-amplitude",
      label: i18n.t("wave.amplitude"),
      value: t.amplitude,
      min: -100000,
      max: 100000,
      step: 1,
      unit: i18n.t("wave.unit.px"),
      onCommit: (value) => {
        t.amplitude = value;
        shell.rerender();
      }
    })
  );

  regions.content.appendChild(
    numberField(document, {
      id: "wave-speed",
      label: i18n.t("wave.speed"),
      value: t.speed,
      min: -1000,
      max: 1000,
      step: 0.1,
      unit: i18n.t("wave.unit.hertz"),
      onCommit: (value) => {
        t.speed = value;
        shell.rerender();
      }
    })
  );

  // Comprimento de onda só descreve o efeito nativo; no modo transform a camada
  // inteira se move e não há onda dentro dela.
  if (t.mode === "effect") {
    regions.content.appendChild(
      numberField(document, {
        id: "wave-frequency",
        label: i18n.t("wave.frequency"),
        value: t.frequency,
        min: 0,
        max: 1000,
        step: 1,
        onCommit: (value) => {
          t.frequency = value;
          shell.rerender();
        }
      })
    );
  }

  regions.content.appendChild(
    selectField(document, {
      id: "wave-direction",
      label: i18n.t("wave.direction"),
      value: t.direction,
      options: [
        { value: "vertical", label: i18n.t("wave.direction.vertical") },
        { value: "horizontal", label: i18n.t("wave.direction.horizontal") }
      ],
      onChange: (value) => {
        t.direction = value as WaveDirection;
        shell.rerender();
      }
    })
  );

  regions.content.appendChild(
    numberField(document, {
      id: "wave-phase",
      label: i18n.t("wave.phase"),
      value: t.phase,
      min: -36000,
      max: 36000,
      step: 1,
      unit: i18n.t("wave.unit.degrees"),
      onCommit: (value) => {
        t.phase = value;
        shell.rerender();
      }
    })
  );

  regions.content.appendChild(
    numberField(document, {
      id: "wave-falloff",
      label: i18n.t("wave.falloff"),
      value: t.falloff,
      min: 0,
      max: 1,
      step: 0.05,
      onCommit: (value) => {
        t.falloff = value;
        shell.rerender();
      }
    })
  );

  if (t.mode === "transform") {
    regions.content.appendChild(
      checkboxField(document, {
        id: "wave-bake",
        label: i18n.t("wave.bake"),
        checked: t.bake,
        onChange: (checked) => {
          t.bake = checked;
          shell.rerender();
        }
      })
    );
  }

  regions.content.appendChild(hint(document, i18n.t("message.waveInstructions")));
}

async function applyWave(shell: Shell, i18n: I18n, logger: MotionLogger, client: Client): Promise<void> {
  if (state.busy) return;

  if (!state.context?.isComposition) {
    state.lastError = i18n.t("message.waveNoActiveComp");
    shell.setStatus(i18n.t("status.notCompleted"), "error");
    shell.rerender();
    return;
  }

  shell.setStatus(i18n.t("status.applyingWave"), "busy");
  setBusy(shell, true, i18n.t("status.applyingWave"));

  const response = await client.execute("ae.effect.wave", { ...state.wave });
  logger.recordResponse("ae.effect.wave", response);

  if (response.ok) {
    shell.setStatus(i18n.t("message.waveApplied"), "ok");
  } else {
    reportFailure(shell, i18n, response);
  }
  setBusy(shell, false);
}

function tileDisabledReason(i18n: I18n): string | null {
  if (state.busy) return state.busyReason ?? i18n.t("status.initializing");
  if (!state.context?.isComposition) return i18n.t("message.tileNoActiveComp");
  return null;
}

function renderTile(regions: RenderRegions, i18n: I18n): void {
  const shell = regions.shell;
  const t = state.tile;

  regions.content.appendChild(
    selectField(document, {
      id: "tile-mode",
      label: i18n.t("tile.mode"),
      value: t.mode,
      options: [
        { value: "effect", label: i18n.t("tile.mode.effect") },
        { value: "grid", label: i18n.t("tile.mode.grid") }
      ],
      onChange: (value) => {
        t.mode = value as TileMode;
        shell.rerender();
      }
    })
  );

  if (t.mode === "effect") {
    for (const [campo, chave] of [
      ["outputWidth", "tile.outputWidth"],
      ["outputHeight", "tile.outputHeight"]
    ] as const) {
      regions.content.appendChild(
        numberField(document, {
          id: "tile-" + campo,
          label: i18n.t(chave),
          value: t[campo],
          min: 1,
          max: 10000,
          step: 10,
          unit: i18n.t("tile.unit.percent"),
          onCommit: (value) => {
            state.tile = { ...state.tile, [campo]: value };
            shell.rerender();
          }
        })
      );
    }

    regions.content.appendChild(
      checkboxField(document, {
        id: "tile-mirrorEdges",
        label: i18n.t("tile.mirrorEdges"),
        checked: t.mirrorEdges,
        onChange: (checked) => {
          t.mirrorEdges = checked;
          shell.rerender();
        }
      })
    );
  } else {
    for (const [campo, chave, maximo] of [
      ["gridRows", "tile.gridRows", 100],
      ["gridColumns", "tile.gridColumns", 100]
    ] as const) {
      regions.content.appendChild(
        numberField(document, {
          id: "tile-" + campo,
          label: i18n.t(chave),
          value: t[campo],
          min: 1,
          max: maximo,
          step: 1,
          onCommit: (value) => {
            state.tile = { ...state.tile, [campo]: value };
            shell.rerender();
          }
        })
      );
    }

    regions.content.appendChild(
      numberField(document, {
        id: "tile-spacing",
        label: i18n.t("tile.spacing"),
        value: t.spacing,
        min: 0,
        max: 100000,
        step: 10,
        unit: i18n.t("tile.unit.px"),
        onCommit: (value) => {
          t.spacing = value;
          shell.rerender();
        }
      })
    );
  }

  regions.content.appendChild(hint(document, i18n.t("message.tileInstructions")));
}

async function applyTile(shell: Shell, i18n: I18n, logger: MotionLogger, client: Client): Promise<void> {
  if (state.busy) return;

  if (!state.context?.isComposition) {
    state.lastError = i18n.t("message.tileNoActiveComp");
    shell.setStatus(i18n.t("status.notCompleted"), "error");
    shell.rerender();
    return;
  }

  shell.setStatus(i18n.t("status.applyingTile"), "busy");
  setBusy(shell, true, i18n.t("status.applyingTile"));

  // O modo grade cria dezenas de camadas, e o comando é declarado destrutivo.
  const response = await client.execute("ae.effect.tile", { ...state.tile }, { allowDestructive: true });
  logger.recordResponse("ae.effect.tile", response);

  if (response.ok) {
    shell.setStatus(i18n.t("message.tileApplied"), "ok");
  } else {
    reportFailure(shell, i18n, response);
  }
  setBusy(shell, false);
}

function glitchDisabledReason(i18n: I18n): string | null {
  if (state.busy) return state.busyReason ?? i18n.t("status.initializing");
  if (!state.context?.isComposition) return i18n.t("message.glitchNoActiveComp");
  return null;
}

function renderGlitch(regions: RenderRegions, i18n: I18n): void {
  const shell = regions.shell;
  const t = state.glitch;

  regions.content.appendChild(
    selectField(document, {
      id: "glitch-mode",
      label: i18n.t("glitch.mode"),
      value: t.mode,
      options: [
        { value: "continuous", label: i18n.t("glitch.mode.continuous") },
        { value: "oneShot", label: i18n.t("glitch.mode.oneShot") }
      ],
      onChange: (value) => {
        t.mode = value as GlitchMode;
        shell.rerender();
      }
    })
  );

  for (const [campo, chave, minimo, maximo, passo] of [
    ["intensity", "glitch.intensity", 0, 1, 0.05],
    ["frequency", "glitch.frequency", 0, 120, 1],
    ["rgbSplit", "glitch.rgbSplit", 0, 200, 1],
    ["displacement", "glitch.displacement", 0, 2000, 5]
  ] as const) {
    regions.content.appendChild(
      numberField(document, {
        id: "glitch-" + campo,
        label: i18n.t(chave),
        value: t[campo],
        min: minimo,
        max: maximo,
        step: passo,
        onCommit: (value) => {
          state.glitch = { ...state.glitch, [campo]: value };
          shell.rerender();
        }
      })
    );
  }

  regions.content.appendChild(
    numberField(document, {
      id: "glitch-seed",
      label: i18n.t("glitch.seed"),
      value: t.seed,
      min: 0,
      max: 1000000,
      step: 1,
      onCommit: (value) => {
        t.seed = value;
        shell.rerender();
      }
    })
  );

  // Duração só descreve o estalo; no modo contínuo o rig cobre a composição.
  if (t.mode === "oneShot") {
    regions.content.appendChild(
      numberField(document, {
        id: "glitch-durationFrames",
        label: i18n.t("glitch.durationFrames"),
        value: t.durationFrames,
        min: 1,
        max: 10000,
        step: 1,
        unit: i18n.t("glitch.unit.frames"),
        onCommit: (value) => {
          t.durationFrames = value;
          shell.rerender();
        }
      })
    );
  }

  regions.content.appendChild(hint(document, i18n.t("message.glitchInstructions")));
}

async function applyGlitch(shell: Shell, i18n: I18n, logger: MotionLogger, client: Client): Promise<void> {
  if (state.busy) return;

  if (!state.context?.isComposition) {
    state.lastError = i18n.t("message.glitchNoActiveComp");
    shell.setStatus(i18n.t("status.notCompleted"), "error");
    shell.rerender();
    return;
  }

  shell.setStatus(i18n.t("status.applyingGlitch"), "busy");
  setBusy(shell, true, i18n.t("status.applyingGlitch"));

  const response = await client.execute<{ effectCount: number }>("ae.effect.glitch", {
    ...state.glitch,
    frameHold: false
  });
  logger.recordResponse("ae.effect.glitch", response);

  if (response.ok) {
    // Um efeito ausente na instalação vira warning e o glitch continua: dizer
    // quantos entraram é mais honesto do que só "aplicado".
    shell.setStatus(
      i18n.t("message.glitchApplied", { count: response.data?.effectCount ?? 0 }),
      response.warnings.length > 0 ? "busy" : "ok"
    );
  } else {
    reportFailure(shell, i18n, response);
  }
  setBusy(shell, false);
}

function echoDisabledReason(i18n: I18n): string | null {
  if (state.busy) return state.busyReason ?? i18n.t("status.initializing");
  if (!state.context?.isComposition) return i18n.t("message.echoNoActiveComp");
  return null;
}

function renderEcho(regions: RenderRegions, i18n: I18n): void {
  const shell = regions.shell;
  const t = state.echo;

  regions.content.appendChild(
    numberField(document, {
      id: "echo-echoTime",
      label: i18n.t("echo.echoTime"),
      value: t.echoTime,
      min: -10,
      max: 10,
      step: 0.01,
      unit: i18n.t("echo.unit.seconds"),
      onCommit: (value) => {
        t.echoTime = value;
        shell.rerender();
      }
    })
  );

  regions.content.appendChild(
    numberField(document, {
      id: "echo-numberOfEchoes",
      label: i18n.t("echo.numberOfEchoes"),
      value: t.numberOfEchoes,
      min: 1,
      max: 100,
      step: 1,
      onCommit: (value) => {
        t.numberOfEchoes = value;
        shell.rerender();
      }
    })
  );

  regions.content.appendChild(
    numberField(document, {
      id: "echo-startingIntensity",
      label: i18n.t("echo.startingIntensity"),
      value: t.startingIntensity,
      min: 0,
      max: 1,
      step: 0.05,
      onCommit: (value) => {
        t.startingIntensity = value;
        shell.rerender();
      }
    })
  );

  regions.content.appendChild(
    numberField(document, {
      id: "echo-decay",
      label: i18n.t("echo.decay"),
      value: t.decay,
      min: 0,
      max: 1,
      step: 0.05,
      onCommit: (value) => {
        t.decay = value;
        shell.rerender();
      }
    })
  );

  regions.content.appendChild(
    selectField(document, {
      id: "echo-operator",
      label: i18n.t("echo.operator"),
      value: t.operator,
      options: [
        { value: "add", label: i18n.t("echo.operator.add") },
        { value: "maximum", label: i18n.t("echo.operator.maximum") },
        { value: "minimum", label: i18n.t("echo.operator.minimum") },
        { value: "screen", label: i18n.t("echo.operator.screen") },
        { value: "compositeInBack", label: i18n.t("echo.operator.compositeInBack") },
        { value: "compositeInFront", label: i18n.t("echo.operator.compositeInFront") },
        { value: "blend", label: i18n.t("echo.operator.blend") }
      ],
      onChange: (value) => {
        t.operator = value as EchoOperator;
        shell.rerender();
      }
    })
  );

  regions.content.appendChild(
    checkboxField(document, {
      id: "echo-animate",
      label: i18n.t("echo.animate"),
      checked: t.animate,
      onChange: (checked) => {
        t.animate = checked;
        shell.rerender();
      }
    })
  );

  regions.content.appendChild(hint(document, i18n.t("message.echoInstructions")));
}

async function applyEcho(shell: Shell, i18n: I18n, logger: MotionLogger, client: Client): Promise<void> {
  if (state.busy) return;

  if (!state.context?.isComposition) {
    state.lastError = i18n.t("message.echoNoActiveComp");
    shell.setStatus(i18n.t("status.notCompleted"), "error");
    shell.rerender();
    return;
  }

  shell.setStatus(i18n.t("status.applyingEcho"), "busy");
  setBusy(shell, true, i18n.t("status.applyingEcho"));

  const response = await client.execute("ae.effect.echo", { ...state.echo });
  logger.recordResponse("ae.effect.echo", response);

  if (response.ok) {
    shell.setStatus(i18n.t("message.echoApplied"), "ok");
  } else {
    reportFailure(shell, i18n, response);
  }
  setBusy(shell, false);
}



/**
 * Cada branch mantém o ID literal ao lado do payload exato. Além de impedir
 * chave extra no preflight estrito, isto deixa o gate de alcançabilidade provar
 * que as quatro operações realmente atravessam o client.
 */
async function executeParallaxFull(
  client: Client,
  t: ParallaxFullDraft
): Promise<{ command: string; response: CommandResponse }> {
  if (t.operation === "autoFocus") {
    return {
      command: "ae.parallax.auto-focus",
      response: await client.execute("ae.parallax.auto-focus", {
        targetLayerName: t.targetLayerName,
        focusOffset: t.focusOffset,
        enableDepthOfField: t.enableDepthOfField
      })
    };
  }
  if (t.operation === "zoom") {
    return {
      command: "ae.parallax.zoom",
      response: await client.execute("ae.parallax.zoom", {
        zoomLevel: t.zoomLevel,
        durationFrames: t.zoomDurationFrames
      })
    };
  }
  if (t.operation === "wiggle") {
    return {
      command: "ae.parallax.wiggle",
      response: await client.execute("ae.parallax.wiggle", {
        frequency: t.frequency,
        amplitude: t.amplitude,
        seed: t.seed
      })
    };
  }
  return {
    command: "ae.parallax.bake",
    response: await client.execute("ae.parallax.bake", { stepFrames: t.stepFrames })
  };
}

function parallaxFullDisabledReason(i18n: I18n): string | null {
  if (state.busy) return state.busyReason ?? i18n.t("status.initializing");
  if (!state.context?.isComposition) return i18n.t("message.parallaxFullNoActiveComp");
  // O foco precisa de um alvo nomeado, e o host recusa nome vazio. Dizer isso
  // aqui evita a ida ao host só para voltar com erro.
  if (state.parallaxFull.operation === "autoFocus" && state.parallaxFull.targetLayerName.trim() === "") {
    return i18n.t("message.parallaxFullNeedsTarget");
  }
  return null;
}

function renderParallaxFull(regions: RenderRegions, i18n: I18n): void {
  const shell = regions.shell;
  const t = state.parallaxFull;

  regions.content.appendChild(
    selectField(document, {
      id: "parallaxFull-operation",
      label: i18n.t("parallaxFull.operation"),
      value: t.operation,
      options: [
        { value: "autoFocus", label: i18n.t("parallaxFull.op.autoFocus") },
        { value: "zoom", label: i18n.t("parallaxFull.op.zoom") },
        { value: "wiggle", label: i18n.t("parallaxFull.op.wiggle") },
        { value: "bake", label: i18n.t("parallaxFull.op.bake") }
      ],
      onChange: (value) => {
        t.operation = value as ParallaxFullOperation;
        shell.rerender();
      }
    })
  );

  if (t.operation === "autoFocus") {
    regions.content.appendChild(
      textField(document, {
        id: "parallaxFull-targetLayerName",
        label: i18n.t("parallaxFull.targetLayerName"),
        value: t.targetLayerName,
        // O mesmo teto do preflight do host, e o mesmo do Look At.
        maxLength: 80,
        onCommit: (value) => {
          t.targetLayerName = value;
          shell.rerender();
        }
      })
    );
    regions.content.appendChild(
      numberField(document, {
        id: "parallaxFull-focusOffset",
        label: i18n.t("parallaxFull.focusOffset"),
        value: t.focusOffset,
        min: -100000,
        max: 100000,
        step: 10,
        unit: i18n.t("parallaxFull.unit.px"),
        onCommit: (value) => {
          t.focusOffset = value;
          shell.rerender();
        }
      })
    );
    regions.content.appendChild(
      checkboxField(document, {
        id: "parallaxFull-enableDepthOfField",
        label: i18n.t("parallaxFull.enableDepthOfField"),
        checked: t.enableDepthOfField,
        onChange: (checked) => {
          t.enableDepthOfField = checked;
          shell.rerender();
        }
      })
    );
  }

  if (t.operation === "zoom") {
    for (const campo of [
      { id: "zoomLevel", key: "parallaxFull.zoomLevel", min: 1, max: 1000000, step: 50, unit: "parallaxFull.unit.px" },
      {
        id: "zoomDurationFrames",
        key: "parallaxFull.zoomDuration",
        min: 1,
        max: 100000,
        step: 1,
        unit: "parallaxFull.unit.frames"
      }
    ] as const) {
      regions.content.appendChild(
        numberField(document, {
          id: "parallaxFull-" + campo.id,
          label: i18n.t(campo.key),
          value: t[campo.id],
          min: campo.min,
          max: campo.max,
          step: campo.step,
          unit: i18n.t(campo.unit),
          onCommit: (value) => {
            state.parallaxFull = { ...state.parallaxFull, [campo.id]: value };
            shell.rerender();
          }
        })
      );
    }
  }

  if (t.operation === "wiggle") {
    for (const campo of [
      { id: "frequency", key: "parallaxFull.frequency", min: 0, max: 1000, step: 0.1, unit: "parallaxFull.unit.hertz" },
      { id: "amplitude", key: "parallaxFull.amplitude", min: 0, max: 100000, step: 1, unit: "parallaxFull.unit.px" },
      { id: "seed", key: "parallaxFull.seed", min: 0, max: 1000000, step: 1, unit: null }
    ] as const) {
      regions.content.appendChild(
        numberField(document, {
          id: "parallaxFull-" + campo.id,
          label: i18n.t(campo.key),
          value: t[campo.id],
          min: campo.min,
          max: campo.max,
          step: campo.step,
          // `seed` não tem unidade; com exactOptionalPropertyTypes, passar
          // `undefined` não é o mesmo que omitir a chave.
          ...(campo.unit ? { unit: i18n.t(campo.unit) } : {}),
          onCommit: (value) => {
            state.parallaxFull = { ...state.parallaxFull, [campo.id]: value };
            shell.rerender();
          }
        })
      );
    }
  }

  if (t.operation === "bake") {
    regions.content.appendChild(
      numberField(document, {
        id: "parallaxFull-stepFrames",
        label: i18n.t("parallaxFull.stepFrames"),
        value: t.stepFrames,
        min: 1,
        max: 100,
        step: 1,
        unit: i18n.t("parallaxFull.unit.frames"),
        onCommit: (value) => {
          t.stepFrames = value;
          shell.rerender();
        }
      })
    );
  }

  regions.content.appendChild(
    hint(document, i18n.t(("message.parallaxFull." + t.operation) as MessageKey))
  );
}

async function applyParallaxFull(
  shell: Shell,
  i18n: I18n,
  logger: MotionLogger,
  client: Client
): Promise<void> {
  if (state.busy) return;

  if (!state.context?.isComposition) {
    state.lastError = i18n.t("message.parallaxFullNoActiveComp");
    shell.setStatus(i18n.t("status.notCompleted"), "error");
    shell.rerender();
    return;
  }

  shell.setStatus(i18n.t("status.applyingParallaxFull"), "busy");
  setBusy(shell, true, i18n.t("status.applyingParallaxFull"));

  const { command, response } = await executeParallaxFull(client, state.parallaxFull);
  logger.recordResponse(command, response);

  if (response.ok) {
    shell.setStatus(i18n.t("message.parallaxFullApplied"), "ok");
  } else {
    reportFailure(shell, i18n, response);
  }
  setBusy(shell, false);
}

function parallaxDisabledReason(i18n: I18n): string | null {
  if (state.busy) return state.busyReason ?? i18n.t("status.initializing");
  if (!state.context?.isComposition) return i18n.t("message.parallaxNoActiveComp");
  // O host recusa nome vazio no preflight; dizer isso antes do clique evita a
  // ida ao host so para voltar com erro.
  if (state.parallax.controllerName.trim() === "") return i18n.t("message.parallaxNeedsName");
  return null;
}

function renderParallax(regions: RenderRegions, i18n: I18n): void {
  const shell = regions.shell;
  const t = state.parallax;

  for (const campo of [
    { id: "depthStep", key: "parallax.depthStep", min: 1, max: 100000, step: 10, unit: "parallax.unit.px" },
    { id: "strength", key: "parallax.strength", min: 0, max: 10, step: 0.1, unit: "parallax.unit.factor" }
  ] as const) {
    regions.content.appendChild(
      numberField(document, {
        id: `parallax-${campo.id}`,
        label: i18n.t(campo.key),
        value: t[campo.id],
        min: campo.min,
        max: campo.max,
        step: campo.step,
        unit: i18n.t(campo.unit),
        onCommit: (value) => {
          state.parallax = { ...state.parallax, [campo.id]: value };
          shell.rerender();
        }
      })
    );
  }

  regions.content.appendChild(
    selectField(document, {
      id: "parallax-orderMode",
      label: i18n.t("parallax.orderMode"),
      value: t.orderMode,
      options: [
        { value: "selection", label: i18n.t("parallax.orderMode.selection") },
        { value: "timeline", label: i18n.t("parallax.orderMode.timeline") }
      ],
      onChange: (value) => {
        t.orderMode = value as ParallaxOrderMode;
        shell.rerender();
      }
    })
  );

  regions.content.appendChild(
    textField(document, {
      id: "parallax-controllerName",
      label: i18n.t("parallax.controllerName"),
      value: t.controllerName,
      // O mesmo teto que o preflight do host aplica, para o campo não aceitar
      // o que o comando vai recusar.
      maxLength: 120,
      onCommit: (value) => {
        t.controllerName = value;
        shell.rerender();
      }
    })
  );

  regions.content.appendChild(
    checkboxField(document, {
      id: "parallax-createCamera",
      label: i18n.t("parallax.createCamera"),
      checked: t.createCamera,
      onChange: (checked) => {
        t.createCamera = checked;
        shell.rerender();
      }
    })
  );

  regions.content.appendChild(
    checkboxField(document, {
      id: "parallax-preserveFraming",
      label: i18n.t("parallax.preserveFraming"),
      checked: t.preserveFraming,
      onChange: (checked) => {
        t.preserveFraming = checked;
        shell.rerender();
      }
    })
  );

  regions.content.appendChild(hint(document, i18n.t("message.parallaxInstructions")));
}

async function applyParallax(shell: Shell, i18n: I18n, logger: MotionLogger, client: Client): Promise<void> {
  if (state.busy) return;

  if (!state.context?.isComposition) {
    state.lastError = i18n.t("message.parallaxNoActiveComp");
    shell.setStatus(i18n.t("status.notCompleted"), "error");
    shell.rerender();
    return;
  }

  shell.setStatus(i18n.t("status.applyingParallax"), "busy");
  setBusy(shell, true, i18n.t("status.applyingParallax"));

  const response = await client.execute<{ layerCount: number; cameraDistance: number }>(
    "ae.animate.parallax.quick",
    { ...state.parallax }
  );
  logger.recordResponse("ae.animate.parallax.quick", response);

  if (response.ok) {
    shell.setStatus(i18n.t("message.parallaxApplied", { count: response.data?.layerCount ?? 0 }), "ok");
  } else {
    reportFailure(shell, i18n, response);
  }
  setBusy(shell, false);
}

function fastEditDisabledReason(i18n: I18n): string | null {
  if (state.busy) return state.busyReason ?? i18n.t("status.initializing");
  if (!state.context?.isComposition) return i18n.t("message.fastEditNoActiveComp");
  return null;
}

function renderFastEdit(regions: RenderRegions, i18n: I18n): void {
  const shell = regions.shell;
  const t = state.fastEdit;

  regions.content.appendChild(
    selectField(document, {
      id: "fastEdit-operation",
      label: i18n.t("fastEdit.operation"),
      value: t.operation,
      options: [
        { value: "trimToWorkArea", label: i18n.t("fastEdit.op.trimToWorkArea") },
        { value: "setDuration", label: i18n.t("fastEdit.op.setDuration") },
        { value: "setFrameRate", label: i18n.t("fastEdit.op.setFrameRate") },
        { value: "setResolution", label: i18n.t("fastEdit.op.setResolution") },
        { value: "fitLayers", label: i18n.t("fastEdit.op.fitLayers") },
        { value: "shiftLayersToZero", label: i18n.t("fastEdit.op.shiftLayersToZero") },
        { value: "precompose", label: i18n.t("fastEdit.op.precompose") }
      ],
      onChange: (value) => {
        t.operation = value as FastEditOperation;
        shell.rerender();
      }
    })
  );

  // Cada operação mostra só os campos que ela usa: um campo visível que o host
  // ignora promete um efeito que não vem.
  if (t.operation === "setDuration") {
    regions.content.appendChild(
      numberField(document, {
        id: "fastEdit-duration",
        label: i18n.t("fastEdit.duration"),
        value: t.duration,
        min: 0.001,
        max: 10800,
        step: 0.1,
        unit: i18n.t("fastEdit.unit.seconds"),
        onCommit: (value) => {
          t.duration = value;
          shell.rerender();
        }
      })
    );
  }

  if (t.operation === "setFrameRate") {
    regions.content.appendChild(
      numberField(document, {
        id: "fastEdit-frameRate",
        label: i18n.t("fastEdit.frameRate"),
        value: t.frameRate,
        min: 1,
        max: 999,
        step: 1,
        unit: i18n.t("fastEdit.unit.fps"),
        onCommit: (value) => {
          t.frameRate = value;
          shell.rerender();
        }
      })
    );
  }

  if (t.operation === "setResolution") {
    for (const [campo, chave] of [
      ["width", "fastEdit.width"],
      ["height", "fastEdit.height"]
    ] as const) {
      regions.content.appendChild(
        numberField(document, {
          id: `fastEdit-${campo}`,
          label: i18n.t(chave),
          value: t[campo],
          min: 4,
          max: 30000,
          step: 1,
          unit: i18n.t("fastEdit.unit.px"),
          onCommit: (value) => {
            state.fastEdit = { ...state.fastEdit, [campo]: value };
            shell.rerender();
          }
        })
      );
    }
  }

  if (t.operation === "precompose") {
    regions.content.appendChild(
      textField(document, {
        id: "fastEdit-precomposeName",
        label: i18n.t("fastEdit.precomposeName"),
        value: t.precomposeName,
        maxLength: 200,
        onCommit: (value) => {
          t.precomposeName = value;
          shell.rerender();
        }
      })
    );
    regions.content.appendChild(
      checkboxField(document, {
        id: "fastEdit-moveAllAttributes",
        label: i18n.t("fastEdit.moveAllAttributes"),
        checked: t.moveAllAttributes,
        onChange: (checked) => {
          t.moveAllAttributes = checked;
          shell.rerender();
        }
      })
    );
  }

  if (state.fastEditSummary) {
    regions.content.appendChild(hint(document, state.fastEditSummary));
  }
  regions.content.appendChild(hint(document, i18n.t("message.fastEditInstructions")));
}

/** Argumentos do Fast Edit: só os campos que a operação escolhida usa. */
function fastEditArgs(draft: FastEditDraft): Record<string, unknown> {
  const args: Record<string, unknown> = { operation: draft.operation };
  if (draft.operation === "setDuration") args.duration = draft.duration;
  if (draft.operation === "setFrameRate") args.frameRate = draft.frameRate;
  if (draft.operation === "setResolution") {
    args.width = draft.width;
    args.height = draft.height;
  }
  if (draft.operation === "precompose") {
    args.precomposeName = draft.precomposeName;
    args.moveAllAttributes = draft.moveAllAttributes;
  }
  return args;
}

/**
 * A prévia roda ao abrir a ferramenta e pelo botão Atualizar. É o "resumo antes
 * de combinar mudanças" que a §pede, e ela existe como comando próprio porque o
 * dispatcher recusa `dryRun` em comando que muta.
 */
async function refreshFastEditSummary(): Promise<void> {
  const fiacao = wiringAtual;
  if (!fiacao) return;

  if (!state.context?.isComposition) {
    state.fastEditSummary = null;
    return;
  }

  // Mesma proteção das outras prévias: trocar de operação dispara uma carga
  // nova, e a resposta antiga chegando depois sobrescreveria a atual.
  const sequencia = previewSequence + 1;
  previewSequence = sequencia;

  const response = await fiacao.client.execute<Record<string, unknown>>(
    "ae.comp.fast-edit.preview",
    fastEditArgs(state.fastEdit)
  );
  if (sequencia !== previewSequence) return;

  fiacao.logger.recordResponse("ae.comp.fast-edit.preview", response);

  state.fastEditSummary =
    response.ok && response.data
      ? fiacao.i18n.t("fastEdit.summary", { resumo: describeFastEditSummary(response.data) })
      : null;
  state.previewError = response.ok ? null : describeFailure(fiacao.i18n, response);
  fiacao.shell.rerender();
}

/** Resumo legível do que a operação vai fazer. */
function describeFastEditSummary(data: Record<string, unknown>): string {
  const partes: string[] = [];
  for (const [chave, valor] of Object.entries(data)) {
    if (chave === "operation") continue;
    partes.push(`${chave}: ${String(valor)}`);
  }
  return partes.join(", ");
}

async function applyFastEdit(shell: Shell, i18n: I18n, logger: MotionLogger, client: Client): Promise<void> {
  if (state.busy) return;

  if (!state.context?.isComposition) {
    state.lastError = i18n.t("message.fastEditNoActiveComp");
    shell.setStatus(i18n.t("status.notCompleted"), "error");
    shell.rerender();
    return;
  }

  shell.setStatus(i18n.t("status.applyingFastEdit"), "busy");
  setBusy(shell, true, i18n.t("status.applyingFastEdit"));

  // O comando é declarado destrutivo — reescreve a composição inteira — e o
  // dispatcher exige consentimento explícito. A prévia mostrada acima é o que
  // torna esse consentimento informado.
  const response = await client.execute("ae.comp.fast-edit", fastEditArgs(state.fastEdit), {
    allowDestructive: true
  });
  logger.recordResponse("ae.comp.fast-edit", response);

  if (response.ok) {
    shell.setStatus(i18n.t("message.fastEditApplied"), "ok");
  } else {
    reportFailure(shell, i18n, response);
  }
  setBusy(shell, false);
}

/**
 * O shell fala `#rrggbb`; o host das formas quer `[r, g, b]` com cada canal
 * entre 0 e 1. A conversão fica aqui, num par de funções, em vez de espalhada
 * pelos pontos de uso.
 */
function hexParaCanais(hex: string): readonly [number, number, number] {
  const normal = normalizeHexColor(hex) ?? "#000000";
  const inteiro = Number.parseInt(normal.slice(1), 16);
  return [((inteiro >> 16) & 255) / 255, ((inteiro >> 8) & 255) / 255, (inteiro & 255) / 255];
}

function canaisParaHex(canais: readonly [number, number, number]): string {
  const parte = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v * 255)))
      .toString(16)
      .padStart(2, "0");
  return `#${parte(canais[0])}${parte(canais[1])}${parte(canais[2])}`;
}

function shapeLibraryDisabledReason(i18n: I18n): string | null {
  if (state.busy) return state.busyReason ?? i18n.t("status.initializing");
  if (!state.context?.isComposition) return i18n.t("message.shapeLibraryNoActiveComp");
  return null;
}

function renderShapeLibrary(regions: RenderRegions, i18n: I18n): void {
  const shell = regions.shell;
  const t = state.shapeLibrary;

  regions.content.appendChild(
    selectField(document, {
      id: "shapeLibrary-shapeType",
      label: i18n.t("shapeLibrary.shapeType"),
      value: t.shapeType,
      options: [
        { value: "rectangle", label: i18n.t("shapeLibrary.type.rectangle") },
        { value: "roundedRectangle", label: i18n.t("shapeLibrary.type.roundedRectangle") },
        { value: "circle", label: i18n.t("shapeLibrary.type.circle") },
        { value: "polygon", label: i18n.t("shapeLibrary.type.polygon") },
        { value: "star", label: i18n.t("shapeLibrary.type.star") },
        { value: "line", label: i18n.t("shapeLibrary.type.line") },
        { value: "arrow", label: i18n.t("shapeLibrary.type.arrow") },
        { value: "callout", label: i18n.t("shapeLibrary.type.callout") }
      ],
      onChange: (value) => {
        t.shapeType = value as ShapeType;
        shell.rerender();
      }
    })
  );

  regions.content.appendChild(
    numberField(document, {
      id: "shapeLibrary-size",
      label: i18n.t("shapeLibrary.size"),
      value: t.size,
      min: 1,
      max: 100000,
      step: 1,
      unit: i18n.t("shapeLibrary.unit.px"),
      onCommit: (value) => {
        t.size = value;
        shell.rerender();
      }
    })
  );

  // Arredondamento so descreve alguma coisa no retangulo arredondado; nas outras
  // formas o host o ignora, e mostrar o campo prometeria um efeito que nao vem.
  if (t.shapeType === "roundedRectangle") {
    regions.content.appendChild(
      numberField(document, {
        id: "shapeLibrary-roundness",
        label: i18n.t("shapeLibrary.roundness"),
        value: t.roundness,
        min: 0,
        max: 100000,
        step: 1,
        unit: i18n.t("shapeLibrary.unit.px"),
        onCommit: (value) => {
          t.roundness = value;
          shell.rerender();
        }
      })
    );
  }

  if (t.shapeType === "polygon" || t.shapeType === "star") {
    regions.content.appendChild(
      numberField(document, {
        id: "shapeLibrary-points",
        label: i18n.t("shapeLibrary.points"),
        value: t.points,
        min: 3,
        max: 1000,
        step: 1,
        onCommit: (value) => {
          t.points = value;
          shell.rerender();
        }
      })
    );
  }

  regions.content.appendChild(
    numberField(document, {
      id: "shapeLibrary-strokeWidth",
      label: i18n.t("shapeLibrary.strokeWidth"),
      value: t.strokeWidth,
      min: 0,
      max: 1000,
      step: 1,
      unit: i18n.t("shapeLibrary.unit.px"),
      onCommit: (value) => {
        t.strokeWidth = value;
        shell.rerender();
      }
    })
  );

  for (const campo of [
    { id: "fillColor", key: "shapeLibrary.fillColor" },
    { id: "strokeColor", key: "shapeLibrary.strokeColor" }
  ] as const) {
    regions.content.appendChild(
      colorField(document, {
        id: "shapeLibrary-" + campo.id,
        label: i18n.t(campo.key),
        value: canaisParaHex(t[campo.id]),
        disabled: state.busy,
        onCommit: (value) => {
          state.shapeLibrary = { ...state.shapeLibrary, [campo.id]: hexParaCanais(value) };
          shell.rerender();
        }
      })
    );
  }

  regions.content.appendChild(hint(document, i18n.t("message.shapeLibraryInstructions")));
}

async function applyShapeLibrary(shell: Shell, i18n: I18n, logger: MotionLogger, client: Client): Promise<void> {
  if (state.busy) return;

  if (!state.context?.isComposition) {
    state.lastError = i18n.t("message.shapeLibraryNoActiveComp");
    shell.setStatus(i18n.t("status.notCompleted"), "error");
    shell.rerender();
    return;
  }

  shell.setStatus(i18n.t("status.applyingShapeLibrary"), "busy");
  setBusy(shell, true, i18n.t("status.applyingShapeLibrary"));

  // A forma nasce no centro da composicao, que e o unico ponto que o painel
  // conhece sem perguntar: o CTI da tempo, nao posicao.
  const largura = state.context?.compWidth ?? 1920;
  const altura = state.context?.compHeight ?? 1080;

  const response = await client.execute("ae.shape.library", {
    shapeType: state.shapeLibrary.shapeType,
    size: state.shapeLibrary.size,
    fillColor: [...state.shapeLibrary.fillColor],
    strokeColor: [...state.shapeLibrary.strokeColor],
    strokeWidth: state.shapeLibrary.strokeWidth,
    roundness: state.shapeLibrary.roundness,
    points: state.shapeLibrary.points,
    position: [largura / 2, altura / 2]
  });
  logger.recordResponse("ae.shape.library", response);

  if (response.ok) {
    shell.setStatus(i18n.t("message.shapeLibraryApplied"), "ok");
  } else {
    reportFailure(shell, i18n, response);
  }
  setBusy(shell, false);
}

function trimPathDisabledReason(i18n: I18n): string | null {
  if (state.busy) return state.busyReason ?? i18n.t("status.initializing");
  if (!state.context?.isComposition) return i18n.t("message.trimPathNoActiveComp");
  return null;
}

function renderTrimPath(regions: RenderRegions, i18n: I18n): void {
  const shell = regions.shell;
  const t = state.trimPath;

  regions.content.appendChild(
    selectField(document, {
      id: "trimPath-scope",
      label: i18n.t("trimPath.scope"),
      value: t.scope,
      options: [
        { value: "layer", label: i18n.t("trimPath.scope.layer") },
        { value: "group", label: i18n.t("trimPath.scope.group") }
      ],
      onChange: (value) => {
        t.scope = value as TrimPathScope;
        shell.rerender();
      }
    })
  );

  regions.content.appendChild(
    numberField(document, {
      id: "trimPath-start",
      label: i18n.t("trimPath.start"),
      value: t.start,
      min: 0,
      max: 100,
      step: 1,
      unit: i18n.t("trimPath.unit.percent"),
      onCommit: (value) => {
        t.start = value;
        shell.rerender();
      }
    })
  );

  regions.content.appendChild(
    numberField(document, {
      id: "trimPath-end",
      label: i18n.t("trimPath.end"),
      value: t.end,
      min: 0,
      max: 100,
      step: 1,
      unit: i18n.t("trimPath.unit.percent"),
      onCommit: (value) => {
        t.end = value;
        shell.rerender();
      }
    })
  );

  regions.content.appendChild(
    numberField(document, {
      id: "trimPath-offset",
      label: i18n.t("trimPath.offset"),
      value: t.offset,
      min: -3600,
      max: 3600,
      step: 1,
      unit: i18n.t("trimPath.unit.degrees"),
      onCommit: (value) => {
        t.offset = value;
        shell.rerender();
      }
    })
  );

  regions.content.appendChild(
    checkboxField(document, {
      id: "trimPath-animate",
      label: i18n.t("trimPath.animate"),
      checked: t.animate,
      onChange: (checked) => {
        t.animate = checked;
        shell.rerender();
      }
    })
  );

  // Duracao e sentido so descrevem alguma coisa quando ha animacao: mostrar um
  // controle sem efeito e pior do que nao mostrar.
  if (t.animate) {
    regions.content.appendChild(
      numberField(document, {
        id: "trimPath-durationFrames",
        label: i18n.t("trimPath.durationFrames"),
        value: t.durationFrames,
        min: 1,
        max: 10000,
        step: 1,
        unit: i18n.t("trimPath.unit.frames"),
        onCommit: (value) => {
          t.durationFrames = value;
          shell.rerender();
        }
      })
    );

    regions.content.appendChild(
      checkboxField(document, {
        id: "trimPath-reverse",
        label: i18n.t("trimPath.reverse"),
        checked: t.reverse,
        onChange: (checked) => {
          t.reverse = checked;
          shell.rerender();
        }
      })
    );
  }

  regions.content.appendChild(hint(document, i18n.t("message.trimPathInstructions")));
}

async function applyTrimPath(shell: Shell, i18n: I18n, logger: MotionLogger, client: Client): Promise<void> {
  if (state.busy) return;

  if (!state.context?.isComposition) {
    state.lastError = i18n.t("message.trimPathNoActiveComp");
    shell.setStatus(i18n.t("status.notCompleted"), "error");
    shell.rerender();
    return;
  }

  shell.setStatus(i18n.t("status.applyingTrimPath"), "busy");
  setBusy(shell, true, i18n.t("status.applyingTrimPath"));

  const response = await client.execute("ae.shape.trim-path", { ...state.trimPath });
  logger.recordResponse("ae.shape.trim-path", response);

  if (response.ok) {
    shell.setStatus(i18n.t("message.trimPathApplied"), "ok");
  } else {
    reportFailure(shell, i18n, response);
  }
  setBusy(shell, false);
}

function timeMarkerLoopDisabledReason(i18n: I18n): string | null {
  if (state.busy) return state.busyReason ?? i18n.t("status.initializing");
  if (!state.context?.isComposition) return i18n.t("message.timeMarkerLoopNoActiveComp");
  return null;
}

function renderTimeMarkerLoop(regions: RenderRegions, i18n: I18n): void {
  const shell = regions.shell;
  const t = state.timeMarkerLoop;

  // O host aceita nome de 1 a 80 caracteres, sem espaço nas pontas; o campo
  // reflete o mesmo teto para não aceitar o que o comando vai recusar.
  for (const campo of [
    { id: "inMarkerName", key: "timeMarkerLoop.inMarkerName" },
    { id: "outMarkerName", key: "timeMarkerLoop.outMarkerName" }
  ] as const) {
    regions.content.appendChild(
      textField(document, {
        id: "timeMarkerLoop-" + campo.id,
        label: i18n.t(campo.key),
        value: t[campo.id],
        maxLength: 80,
        onCommit: (value) => {
          state.timeMarkerLoop = { ...state.timeMarkerLoop, [campo.id]: value };
          shell.rerender();
        }
      })
    );
  }

  regions.content.appendChild(
    selectField(document, {
      id: "timeMarkerLoop-loopType",
      label: i18n.t("timeMarkerLoop.loopType"),
      value: t.loopType,
      options: [
        { value: "cycle", label: i18n.t("timeMarkerLoop.loopType.cycle") },
        { value: "pingpong", label: i18n.t("timeMarkerLoop.loopType.pingpong") }
      ],
      onChange: (value) => {
        t.loopType = value as TimeMarkerLoopType;
        shell.rerender();
      }
    })
  );

  regions.content.appendChild(
    checkboxField(document, {
      id: "timeMarkerLoop-autoCreateMarkers",
      label: i18n.t("timeMarkerLoop.autoCreateMarkers"),
      checked: t.autoCreateMarkers,
      onChange: (checked) => {
        t.autoCreateMarkers = checked;
        shell.rerender();
      }
    })
  );

  regions.content.appendChild(
    checkboxField(document, {
      id: "timeMarkerLoop-clampToLayer",
      label: i18n.t("timeMarkerLoop.clampToLayer"),
      checked: t.clampToLayer,
      onChange: (checked) => {
        t.clampToLayer = checked;
        shell.rerender();
      }
    })
  );

  regions.content.appendChild(hint(document, i18n.t("message.timeMarkerLoopInstructions")));
}

async function applyTimeMarkerLoop(shell: Shell, i18n: I18n, logger: MotionLogger, client: Client): Promise<void> {
  if (state.busy) return;
  shell.setStatus(i18n.t("status.applyingTimeMarkerLoop") || "Aplicando loop por marcadores...", "busy");
  setBusy(shell, true, i18n.t("status.applyingTimeMarkerLoop"));

  const response = await client.execute("ae.time.marker-loop", {
    inMarkerName: state.timeMarkerLoop.inMarkerName,
    outMarkerName: state.timeMarkerLoop.outMarkerName,
    loopType: state.timeMarkerLoop.loopType,
    autoCreateMarkers: state.timeMarkerLoop.autoCreateMarkers,
    clampToLayer: state.timeMarkerLoop.clampToLayer
  });
  logger.recordResponse("ae.time.marker-loop", response);
  if (response.ok) {
    shell.setStatus(i18n.t("message.timeMarkerLoopApplied"), "ok");
  } else {
    reportFailure(shell, i18n, response);
  }
  setBusy(shell, false);
}


function aiToVectorDisabledReason(): string | null { return null; }
function renderAiToVector(regions: RenderRegions, i18n: I18n): void {
  const shell = regions.shell;
  regions.content.appendChild(checkboxField(document, { id: "field.aiToVector.keepOriginal", label: i18n.t("field.aiToVector.keepOriginal"), checked: state.aiToVector.keepOriginal, onChange: (val: boolean) => { state.aiToVector.keepOriginal = val; shell.rerender(); } }));
  regions.content.appendChild(hint(document, i18n.t("message.aiToVectorInstructions")));
}
async function applyAiToVector(shell: Shell, i18n: I18n, logger: MotionLogger, client: Client): Promise<void> {
  if (state.busy) return;
  setBusy(shell, true, "Converting...");
  const response = await client.execute("ae.vector.ai-to-vector", { keepOriginal: state.aiToVector.keepOriginal });
  logger.recordResponse("ae.vector.ai-to-vector", response);
  if (response.ok) { shell.setStatus(i18n.t("message.aiToVectorApplied"), "ok"); } else { reportFailure(shell, i18n, response); }
  setBusy(shell, false);
}

function textToVectorDisabledReason(): string | null { return null; }
function renderTextToVector(regions: RenderRegions, i18n: I18n): void {
  const shell = regions.shell;
  regions.content.appendChild(checkboxField(document, { id: "field.textToVector.keepOriginal", label: i18n.t("field.textToVector.keepOriginal"), checked: state.textToVector.keepOriginal, onChange: (val: boolean) => { state.textToVector.keepOriginal = val; shell.rerender(); } }));
  regions.content.appendChild(hint(document, i18n.t("message.textToVectorInstructions")));
}
async function applyTextToVector(shell: Shell, i18n: I18n, logger: MotionLogger, client: Client): Promise<void> {
  if (state.busy) return;
  setBusy(shell, true, "Converting...");
  const response = await client.execute("ae.vector.text-to-vector", { keepOriginal: state.textToVector.keepOriginal });
  logger.recordResponse("ae.vector.text-to-vector", response);
  if (response.ok) { shell.setStatus(i18n.t("message.textToVectorApplied"), "ok"); } else { reportFailure(shell, i18n, response); }
  setBusy(shell, false);
}

function particlesDisabledReason(): string | null { return null; }
function renderParticles(regions: RenderRegions, i18n: I18n): void {
  const shell = regions.shell;
  regions.content.appendChild(numberField(document, { id: "field.particles.birthRate", label: i18n.t("field.particles.birthRate"), value: state.particles.birthRate, min: 0.1, max: 10, step: 0.1, onCommit: (val: number) => { state.particles.birthRate = val; shell.rerender(); }}));
  regions.content.appendChild(numberField(document, { id: "field.particles.longevity", label: i18n.t("field.particles.longevity"), value: state.particles.longevity, min: 0.1, max: 10, step: 0.1, onCommit: (val: number) => { state.particles.longevity = val; shell.rerender(); }}));
  regions.content.appendChild(numberField(document, { id: "field.particles.velocity", label: i18n.t("field.particles.velocity"), value: state.particles.velocity, min: 0, max: 5, step: 0.1, onCommit: (val: number) => { state.particles.velocity = val; shell.rerender(); }}));
  regions.content.appendChild(hint(document, i18n.t("message.particlesInstructions")));
}
async function applyParticles(shell: Shell, i18n: I18n, logger: MotionLogger, client: Client): Promise<void> {
  if (state.busy) return;
  setBusy(shell, true, "Creating particles...");
  const response = await client.execute("ae.effect.particles", { birthRate: state.particles.birthRate, longevity: state.particles.longevity, velocity: state.particles.velocity });
  logger.recordResponse("ae.effect.particles", response);
  if (response.ok) { shell.setStatus(i18n.t("message.particlesApplied"), "ok"); } else { reportFailure(shell, i18n, response); }
  setBusy(shell, false);
}

function textureDisabledReason(): string | null { return null; }
function renderTexture(regions: RenderRegions, i18n: I18n): void {
  const shell = regions.shell;
  regions.content.appendChild(numberField(document, { id: "field.texture.opacity", label: i18n.t("field.texture.opacity"), value: state.texture.opacity, min: 0, max: 100, step: 1, onCommit: (val: number) => { state.texture.opacity = val; shell.rerender(); }}));
  regions.content.appendChild(hint(document, i18n.t("message.textureInstructions")));
}
async function applyTexture(shell: Shell, i18n: I18n, logger: MotionLogger, client: Client): Promise<void> {
  if (state.busy) return;
  setBusy(shell, true, "Applying texture...");
  const response = await client.execute("ae.asset.texture", { blendMode: state.texture.blendMode, opacity: state.texture.opacity });
  logger.recordResponse("ae.asset.texture", response);
  if (response.ok) { shell.setStatus(i18n.t("message.textureApplied"), "ok"); } else { reportFailure(shell, i18n, response); }
  setBusy(shell, false);
}

function cleanDisabledReason(): string | null { return null; }
function renderClean(regions: RenderRegions, i18n: I18n): void {
  const shell = regions.shell;
  regions.content.appendChild(checkboxField(document, { id: "field.clean.removeConfirmed", label: i18n.t("field.clean.removeConfirmed"), checked: state.clean.removeConfirmed, onChange: (val: boolean) => { state.clean.removeConfirmed = val; shell.rerender(); } }));
  regions.content.appendChild(hint(document, i18n.t("message.cleanInstructions")));
}
async function applyClean(shell: Shell, i18n: I18n, logger: MotionLogger, client: Client): Promise<void> {
  if (state.busy) return;
  setBusy(shell, true, "Cleaning project...");
  const response = await client.execute("ae.project.clean", { removeConfirmed: state.clean.removeConfirmed });
  logger.recordResponse("ae.project.clean", response);
  if (response.ok) { shell.setStatus(i18n.t("message.cleanApplied"), "ok"); } else { reportFailure(shell, i18n, response); }
  setBusy(shell, false);
}
