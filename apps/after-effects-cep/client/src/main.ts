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
import type {
  CommandResponse,
  HostCapabilities,
  QuickContext,
  QuickProfile,
  TextEffectKind
} from "@motion/contracts";
import { buildCapabilities, type ProbeFacts } from "@motion/capability-matrix";
import { createLogger, type MotionLogger } from "@motion/logging";
import { renderTextEffect, resetTextEffect, textEffectArgs, validTextEffect, hydrateWordReveal, isWordRevealReadData,
  wordRevealActionLabel, wordRevealDisabledReason, markWordRevealReadFailed, hydrateVariableMorph, isVariableMorphReadData,
  variableMorphActionLabel, variableMorphDisabledReason, markVariableMorphReadFailed, variableMorphCompatibleArgs } from "./text-effects.js";
import { renderVerticalPulse, resetVerticalPulse, validVerticalPulse, verticalPulseAction, verticalPulseArgs,
  hydrateVerticalPulse, isVerticalPulseReadData, markVerticalPulseReadFailed, verticalPulseActionLabel,
  verticalPulseReadDisabledReason, verticalPulseRevision } from "./vertical-pulse.js";
import { WORD_REVEAL_DEFAULTS, PROXIMITY_MORPH_DEFAULTS, STYLE_SWAP_DEFAULTS, pulsePresetArgs, isMotionLibraryOptions, type MotionLibraryOptions } from "@motion/contracts";
import { createAeSystemView } from "./views/system-view.js";
import { createAeSettingsView } from "./views/settings-view.js";
import { groupToolSections } from "./views/tool-sections.js";
import { focusedPoll } from "./focused-poll.js";
import { createGradientEditor } from "./gradient-editor.js";
import type { GradientReadData } from "@motion/contracts";
import {
  anchorGrid,
  browserPreferenceStorage,
  createPanelPreferences,
  createElement,
  createActionButton,
  type ActionButtonOptions,
  button,
  checkboxField,
  colorField,
  configureColorPickers,
  attachActionOverflow,
  createI18n,
  createDiagnosticsView,
  createShell,
  hint,
  notice,
  normalizeHexColor,
  numberField,
  propertyRow,
  sectionTitle,
  selectField,
  textField,
  bezierEditor,
  type I18n,
  type RenderRegions,
  type Shell,
  type ShellView,
  createFeedbackController,
  createAlert,
  type FeedbackController
} from "@motion/ui-core";

let globalFeedback: FeedbackController | null = null;
/** Catálogo ativo, para traduzir avisos do host fora do escopo de `start`. */
let warningI18n: I18n | null = null;

/** Avisos do host traduzidos; texto sem tradução segura não aparece cru. */
function reportHostWarnings(warnings: CommandResponse["warnings"]): void {
  if (!warnings.length || !warningI18n) return;
  const text = hostWarningMessage(warnings, warningI18n);
  if (text) globalFeedback?.reportWarning(text);
}
let feedbackReady = false;
import { getDescriptor, getQuickProfile } from "@motion/command-registry";
import {
  createBrowserReducedMotionController,
  type ReducedMotionController
} from "@motion/ui-motion";

import { createAeHostAdapter } from "./host-adapter.js";
import { createQuickLibrary, type LibraryState, type LibraryItem, type TileFeedback } from "./quick-library.js";
import { createQuickActions, updateQuickActions, quickActionName, type QuickAction } from "./quick-actions.js";
import { createQuickDock } from "./quick-dock.js";
import { hostFailureMessage, hostWarningMessage } from "./host-feedback.js";
import { createEaseEditor } from "./ease-editor.js";
import { createEaseActions, type EaseAction } from "./ease-actions.js";
import { DEFAULT_ORBIT, ORBIT_PRESETS, deriveOrbitPreset, selectOrbitPreset, type OrbitDraft, type OrbitTargetMode } from "./orbit-presets.js";
import { presetArgs, defaultLibraryOptions, GALLERY_PRESETS, type PresetNavigation } from "./preset-gallery.js";

const panelPreferences = createPanelPreferences(document.documentElement, browserPreferenceStorage(window));
let panelHostLocale: string | undefined;
const libraryNavigation: LibraryState = { category: panelPreferences.snapshot().category, scope: "all", query: "", scroll: 0 };
let disposeView: (() => void) | null = null;
let refreshLibrary: (() => void) | null = null;
/** Tile feedback of the mounted tool library (A6.4); null outside the library view. */
let quickTileFeedback: ((id: string, state: TileFeedback) => void) | null = null;
let refreshToolContext: (() => void) | null = null;
let refreshPresetContext: (() => void) | null = null;
let orbitAdvancedOpen = false;
import { createPresetWorkspace, type PresetWorkspaceCache } from "./preset-workspace.js";
const presetWorkspaceCache: PresetWorkspaceCache = {};
const presetNavigation: PresetNavigation = restorePresetNavigation();

/**
 * Reabre a galeria onde o usuário parou: categoria, filtro, busca, preset
 * selecionado e os ajustes que ele mudou e ainda não aplicou. Pastas pessoais
 * não voltam sozinhas, porque a pasta pode ter saído do disco entre sessões.
 */
function restorePresetNavigation(): PresetNavigation {
  const saved = panelPreferences.snapshot();
  const drafts: Record<string, MotionLibraryOptions> = {};
  for (const [id, draft] of Object.entries(saved.drafts)) {
    if (GALLERY_PRESETS.some(preset => preset.id === id && preset.motion) && isMotionLibraryOptions(draft)) drafts[id] = draft;
  }
  const category = saved.gallery.category.startsWith("personal") ? "all" : saved.gallery.category;
  const known = GALLERY_PRESETS.some(preset => preset.id === saved.gallery.presetId);
  return {
    category, scope: saved.gallery.scope, query: saved.gallery.query, scroll: 0, drafts,
    ...(known ? { selectedId: saved.gallery.presetId } : {})
  };
}

/** Grava só ajustes que diferem do padrão do preset; abrir um preset não é editá-lo. */
function rememberPresetNavigation(): void {
  const changed: Record<string, MotionLibraryOptions> = {};
  for (const [id, draft] of Object.entries(presetNavigation.drafts ?? {})) {
    const motion = GALLERY_PRESETS.find(preset => preset.id === id)?.motion;
    if (motion && JSON.stringify(draft) !== JSON.stringify(defaultLibraryOptions(motion, state.context?.compFrameRate ?? undefined))) changed[id] = draft;
  }
  panelPreferences.setGallery({
    category: presetNavigation.category.startsWith("personal") ? "all" : presetNavigation.category,
    scope: presetNavigation.scope, query: presetNavigation.query, presetId: presetNavigation.selectedId ?? ""
  });
  panelPreferences.setDrafts(changed);
}

interface ContextData {
  selectionSignature?: string;
  hostVersion: string | null;
  projectName: string | null;
  projectPath: string | null;
  activeItemName: string | null;
  isComposition: boolean;
  compWidth: number | null;
  compHeight: number | null;
  compDuration: number | null;
  compFrameRate: number | null;
  currentTime: number | null;
  workAreaStart: number | null;
  workAreaDuration: number | null;
  /**
   * Retrato da seleção na timeline. É o que permite o painel decidir sozinho o
   * que dá para aplicar, em vez de perguntar ao usuário o que ele acabou de
   * fazer — ou tentar e falhar.
   */
  selectionLayerCount: number;
  selectionPropertyCount: number;
  /** Propriedades selecionadas que aceitam expressão. */
  selectionExpressibleCount: number;
  /**
   * Keyframes efetivamente selecionados, somados sobre as propriedades.
   *
   * Não é o mesmo que `selectionHasKeyframes`: uma propriedade pode ter
   * keyframes sem nenhum deles selecionado, e as ferramentas de keyframe operam
   * sobre `selectedKeys`. É esta contagem que decide se o ladrilho pode acender.
   */
  selectionSelectedKeyCount: number;
  selectionHasKeyframes: boolean;
  selectionHasExpressions: boolean;
  selectionIs3D: boolean;
  /** Camadas de texto entre as lidas. Ausente em hosts anteriores a este campo. */
  selectionTextLayerCount?: number;
  /** Camadas bloqueadas entre as lidas. Ausente em hosts anteriores a este campo. */
  selectionLockedLayerCount?: number;
  averageLayerDurationSeconds: number | null;
  /** `true` quando a seleção passou do teto de varredura do host. */
  selectionTruncated: boolean;
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

/**
 * `ae.keys.reverse` (rótulo "Espelhar keys" abaixo) já ocupa o verbo "reverse"
 * no id do comando — ele move os TEMPOS (espelha em torno do ponto médio da
 * seleção). Esta ferramenta é a operação distinta que o Keyframe Ops chama de
 * Reverse de verdade: os tempos ficam parados e são os VALORES que trocam de
 * lugar. As duas são fáceis de confundir, e por isso o nome e a descrição
 * abaixo evitam a palavra "espelhar" e a palavra "reverter" apontando cada
 * uma para o efeito que ela realmente produz.
 */
type ReverseValuesDraft = Record<string, never>;
const DEFAULT_REVERSE_VALUES: ReverseValuesDraft = {};
interface NeonDraft {
  coreColor: string;
  glowColor: string;
  strokeWidth: number;
  glowRadius: number;
  intensity: number;
}
// Branco no núcleo e ciano no brilho: é o neon de referência, e deixa o efeito
// visível já na primeira aplicação sem o usuário abrir dois seletores de cor.
const DEFAULT_NEON: NeonDraft = {
  coreColor: "#ffffff",
  glowColor: "#33ccff",
  strokeWidth: 4,
  glowRadius: 40,
  intensity: 2
};

type SendToEdgeEdge = "start" | "end";
type SendToEdgeReference = "comp" | "layer" | "workArea";
interface SendToEdgeDraft {
  edge: SendToEdgeEdge;
  reference: SendToEdgeReference;
}
// "comp" e o padrao porque e a unica referencia que existe em toda composicao:
// work area pode cobrir a comp inteira e camada exige que a selecao pertenca a
// uma so — nenhuma das duas e um ponto de partida seguro.
const DEFAULT_SEND_TO_EDGE: SendToEdgeDraft = { edge: "start", reference: "comp" };

type CloneKeysMode = "repeat" | "mirror";
type CloneKeysDestination = "after" | "cti" | "comp-end" | "layer-end" | "work-area-end";
interface CloneKeysDraft { mode: CloneKeysMode; destination: CloneKeysDestination; }
const DEFAULT_CLONE_KEYS: CloneKeysDraft = { mode: "repeat", destination: "after" };

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

type LookAtAxis = "+z" | "-z" | "+x" | "-x" | "+y" | "-y";

interface LookAtDraft {
  targetLayerName: string;
  forwardAxis: LookAtAxis;
  offsetOrientation: [number, number, number];
  constrainAxes: { x: boolean; y: boolean; z: boolean };
}

const DEFAULT_LOOK_AT: LookAtDraft = {
  targetLayerName: "",
  forwardAxis: "+z",
  offsetOrientation: [0, 0, 0],
  constrainAxes: { x: false, y: false, z: false }
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

type ParallaxFullOperation = "create" | "adjust" | "remove" | "subtle" | "truck" | "vertical" | "dolly" | "autoFocus" | "zoom" | "wiggle" | "bake";

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
  depthStep: 0,
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

interface CleanFinding { id: number | null; name: string; origin: "managed" | "external"; risk: "low" | "high"; }
interface CleanDraft { scanToken: string | null; findings: CleanFinding[]; selectedItemIds: number[]; }
const DEFAULT_CLEAN: CleanDraft = { scanToken: null, findings: [], selectedItemIds: [] };
type MessageKey = Parameters<I18n["t"]>[0];
type ToolId =
  | "loopOut"
  | "smooth"
  | "wiggle"
  | "flicker"
  | "textBox"
  | "wordReveal"
  | "variableMorph"
  | "styleSwap"
  | "verticalPulse"
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
  | "reverseValues"
  | "sendToEdge"
  | "neon"
  | "beat"
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
  | "gradient"
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
interface ToolDefinitionBase {
  /** Precisa bater com uma chave de ícone do shell. */
  readonly id: ToolId;
  readonly nameKey: MessageKey;
  readonly descriptionKey: MessageKey;
  /**
   * Comando que o clique aplica direto, quando ele tem `QuickProfile`.
   *
   * Ferramenta sem isto — Copiar keys, Limpar projeto, Alinhador — continua
   * abrindo a tela: nao ha preset a aplicar, so uma operacao a configurar.
   */
  readonly commandId?: string;
  disabledReason(i18n: I18n): string | null;
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
type ToolDefinition = ToolDefinitionBase & ({
  readonly id: Exclude<ToolId, "gradient">;
  render(regions: RenderRegions, i18n: I18n): void;
  apply(shell: Shell, i18n: I18n, logger: MotionLogger, client: Client): Promise<void>;
  reset(): void;
} | { readonly id: "gradient"; readonly editor: "gradient" });

/**
 * Categorias da grade de ferramentas.
 *
 * Sete grupos, e não um por afinidade fina: o objetivo é dar ao usuário um
 * primeiro corte por onde varrer, e vinte títulos de seção seriam tão pouco
 * navegáveis quanto a lista plana que eles substituem.
 *
 * A ordem aqui **é** a ordem na tela, e começa pelo que se usa mais: mexer em
 * keyframe é o trabalho diário; converter vetor e limpar projeto são pontuais.
 */
const TOOL_CATEGORIES = [
  "keyframes",
  "layers",
  "animation",
  "spatial",
  "shapes",
  "effects",
  "project"
] as const;

type ToolCategory = (typeof TOOL_CATEGORIES)[number];

/**
 * A categoria de cada ferramenta.
 *
 * `Record<ToolId, ...>` é exaustivo de propósito: uma ferramenta nova sem
 * categoria vira erro de compilação, e não um ladrilho que some da grade
 * agrupada sem ninguém notar. É a mesma razão de `tool-icons.test.mjs` existir
 * para os ícones.
 */
const TOOL_CATEGORY: Record<ToolId, ToolCategory> = {
  cutKeys: "keyframes",
  delay: "keyframes",
  ease: "keyframes",
  reverseKeys: "keyframes",
  reverseValues: "keyframes",
  sendToEdge: "keyframes",
  cloneKeys: "keyframes",
  copyKeys: "keyframes",
  pasteKeys: "keyframes",
  timeController: "keyframes",
  timeMarkerLoop: "keyframes",

  rename: "layers",
  reverseOrder: "layers",
  anchor: "layers",
  flip: "layers",
  createNull: "layers",
  parent: "layers",
  fastEdit: "layers",

  loopOut: "animation",
  smooth: "animation",
  wiggle: "animation",
  flicker: "animation",
  animateKinetic: "animation",
  jump: "animation",
  inertial: "animation",

  lookAt: "spatial",
  orbit: "spatial",
  cylinder: "spatial",
  cube: "spatial",
  cameraTransition: "spatial",
  parallax: "spatial",
  parallaxFull: "spatial",

  breakShape: "shapes",
  shapeLibrary: "shapes",
  trimPath: "shapes",
  textBox: "shapes",
  wordReveal: "animation",
  variableMorph: "animation",
  styleSwap: "animation",
  verticalPulse: "effects",
  effector: "shapes",

  gradient: "effects",
  wave: "effects",
  tile: "effects",
  glitch: "effects",
  echo: "effects",
  particles: "effects",
  neon: "effects",
  beat: "animation",

  aiToVector: "project",
  textToVector: "project",
  texture: "project",
  clean: "project"
};

const CATEGORY_NAME_KEY: Record<ToolCategory, MessageKey> = {
  keyframes: "tools.category.keyframes",
  layers: "tools.category.layers",
  animation: "tools.category.animation",
  spatial: "tools.category.spatial",
  shapes: "tools.category.shapes",
  effects: "tools.category.effects",
  project: "tools.category.project"
};

const TOOLS: readonly ToolDefinition[] = [
  {
    id: "wordReveal",
    commandId: "ae.text.word-reveal",
    nameKey: "tool.wordReveal.name",
    descriptionKey: "tool.wordReveal.description",
    render: (regions, i18n) => renderTextEffect("wordReveal", regions, i18n, state.busy),
    disabledReason: (i18n) => textEffectsDisabledReason("wordReveal", "ae.text.word-reveal", i18n),
    apply: (shell, i18n, logger, client) => applyTextEffect("wordReveal", "ae.text.word-reveal", shell, i18n, logger, client),
    reset: () => resetTextEffect("wordReveal"),
    load: refreshWordRevealControls,
    loadLabelKey: "wordReveal.readControls"
  },
  {
    id: "variableMorph",
    commandId: "ae.text.variable-morph",
    nameKey: "tool.variableMorph.name",
    descriptionKey: "tool.variableMorph.description",
    render: (regions, i18n) => renderTextEffect("variableMorph", regions, i18n, state.busy),
    disabledReason: (i18n) => textEffectsDisabledReason("variableMorph", "ae.text.variable-morph", i18n),
    apply: (shell, i18n, logger, client) => applyTextEffect("variableMorph", "ae.text.variable-morph", shell, i18n, logger, client),
    load: refreshVariableMorphControls,
    reset: () => resetTextEffect("variableMorph")
  },
  {
    id: "styleSwap",
    commandId: "ae.text.style-swap",
    nameKey: "tool.styleSwap.name",
    descriptionKey: "tool.styleSwap.description",
    render: (regions, i18n) => renderTextEffect("styleSwap", regions, i18n, state.busy),
    disabledReason: (i18n) => textEffectsDisabledReason("styleSwap", "ae.text.style-swap", i18n),
    apply: (shell, i18n, logger, client) => applyTextEffect("styleSwap", "ae.text.style-swap", shell, i18n, logger, client),
    reset: () => resetTextEffect("styleSwap")
  },
  {
    id: "verticalPulse",
    commandId: "ae.text.vertical-pulse",
    nameKey: "tool.verticalPulse.name",
    descriptionKey: "tool.verticalPulse.description",
    render: (regions, i18n) => renderVerticalPulse(regions, i18n, state.busy, state.context?.compFrameRate ?? null),
    disabledReason: verticalPulseDisabledReason,
    apply: applyVerticalPulse,
    reset: () => resetVerticalPulse(state.context?.compFrameRate ?? null),
    load: refreshVerticalPulseControls,
    loadLabelKey: "verticalPulse.readControls"
  },
  {
    id: "loopOut",
    commandId: "ae.expression.loopout",
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
    commandId: "ae.expression.smooth",
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
    commandId: "ae.expression.wiggle",
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
    commandId: "ae.expression.flicker",
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
    commandId: "ae.layer.rename",
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
    commandId: "ae.layer.reverse-order",
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
    commandId: "ae.anchor.align",
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
    commandId: "ae.keys.cut",
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
    commandId: "ae.keys.delay",
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
    commandId: "ae.layer.flip",
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
    commandId: "ae.layer.create-null",
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
    commandId: "ae.layer.parent",
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
    commandId: "ae.text.box",
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
    commandId: "ae.keys.ease.apply",
    // O clique abre o editor; o commandId identifica a aplicacao explicita.
    // O gráfico de velocidade é o produto desta ferramenta — aplicar uma curva
    // sem mostrá-la antes é justamente o que ninguém quer aqui.
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
    commandId: "ae.vector.ai-to-vector",
    nameKey: "tool.aiToVector.name",
    descriptionKey: "tool.aiToVector.description",
    render: renderAiToVector,
    disabledReason: aiToVectorDisabledReason,
    apply: applyAiToVector,
    reset: () => { state.aiToVector = { ...DEFAULT_AI_TO_VECTOR }; }
  },
  {
    id: "textToVector",
    commandId: "ae.vector.text-to-vector",
    nameKey: "tool.textToVector.name",
    descriptionKey: "tool.textToVector.description",
    render: renderTextToVector,
    disabledReason: textToVectorDisabledReason,
    apply: applyTextToVector,
    reset: () => { state.textToVector = { ...DEFAULT_TEXT_TO_VECTOR }; }
  },
  {
    id: "particles",
    commandId: "ae.effect.particles",
    nameKey: "tool.particles.name",
    descriptionKey: "tool.particles.description",
    render: renderParticles,
    disabledReason: particlesDisabledReason,
    apply: applyParticles,
    reset: () => { state.particles = { ...DEFAULT_PARTICLES }; }
  },
  {
    id: "texture",
    commandId: "ae.asset.texture",
    nameKey: "tool.texture.name",
    descriptionKey: "tool.texture.description",
    render: renderTexture,
    disabledReason: textureDisabledReason,
    apply: applyTexture,
    reset: () => { state.texture = { ...DEFAULT_TEXTURE }; }
  },
  {
    id: "clean",
    commandId: "ae.project.clean",
    nameKey: "tool.clean.name",
    descriptionKey: "tool.clean.description",
    render: renderClean,
    disabledReason: cleanDisabledReason,
    apply: applyClean,
    reset: () => { state.clean = { scanToken: null, findings: [], selectedItemIds: [] }; }
  },
  {
    id: "reverseKeys",
    commandId: "ae.keys.reverse",
    nameKey: "tool.reverseKeys.name",
    descriptionKey: "tool.reverseKeys.description",
    render: renderReverseKeys,
    disabledReason: reverseKeysDisabledReason,
    apply: applyReverseKeys,
    reset: () => { state.reverseKeys = { ...DEFAULT_REVERSE_KEYS }; }
  },
  {
    id: "reverseValues",
    commandId: "ae.keys.reverse-values",
    nameKey: "tool.reverseValues.name",
    descriptionKey: "tool.reverseValues.description",
    render: renderReverseValues,
    disabledReason: reverseValuesDisabledReason,
    apply: applyReverseValues,
    reset: () => { state.reverseValues = { ...DEFAULT_REVERSE_VALUES }; }
  },
  {
    id: "sendToEdge",
    commandId: "ae.keys.send-to-edge",
    nameKey: "tool.sendToEdge.name",
    descriptionKey: "tool.sendToEdge.description",
    render: renderSendToEdge,
    disabledReason: sendToEdgeDisabledReason,
    apply: applySendToEdge,
    reset: () => { state.sendToEdge = { ...DEFAULT_SEND_TO_EDGE }; }
  },
  {
    id: "neon",
    commandId: "ae.style.neon",
    nameKey: "tool.neon.name",
    descriptionKey: "tool.neon.description",
    render: renderNeon,
    disabledReason: neonDisabledReason,
    apply: applyNeon,
    reset: () => { state.neon = { ...DEFAULT_NEON }; }
  },
  {
    id: "beat",
    commandId: "ae.audio.beat",
    nameKey: "tool.beat.name",
    descriptionKey: "tool.beat.description",
    render: renderBeat,
    disabledReason: beatDisabledReason,
    apply: applyBeat,
    reset: () => {}
  },
  {
    id: "cloneKeys",
    commandId: "ae.keys.clone",
    nameKey: "tool.cloneKeys.name",
    descriptionKey: "tool.cloneKeys.description",
    render: renderCloneKeys,
    disabledReason: cloneKeysDisabledReason,
    apply: applyCloneKeys,
    reset: () => { state.cloneKeys = { ...DEFAULT_CLONE_KEYS }; }
  },
  {
    id: "timeController",
    commandId: "ae.time.controller",
    nameKey: "tool.timeController.name",
    descriptionKey: "tool.timeController.description",
    render: renderTimeController,
    disabledReason: timeControllerDisabledReason,
    apply: applyTimeController,
    reset: () => { state.timeController = { ...DEFAULT_TIME_CONTROLLER }; }
  },
  {
    id: "animateKinetic",
    commandId: "ae.animate.kinetic",
    nameKey: "tool.animateKinetic.name",
    descriptionKey: "tool.animateKinetic.description",
    render: renderAnimateKinetic,
    disabledReason: animateKineticDisabledReason,
    apply: applyAnimateKinetic,
    reset: () => { state.animateKinetic = { ...DEFAULT_ANIMATE_KINETIC }; }
  },
  {
    id: "inertial",
    commandId: "ae.animate.inertial",
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
    commandId: "ae.animate.jump",
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
    commandId: "ae.keys.copy",
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
    commandId: "ae.keys.paste",
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
    commandId: "ae.3d.look-at",
    nameKey: "tool.lookAt.name",
    descriptionKey: "tool.lookAt.description",
    render: renderLookAt,
    disabledReason: lookAtDisabledReason,
    apply: applyLookAt,
    reset: () => {
      state.lookAt = {
        ...DEFAULT_LOOK_AT,
        offsetOrientation: [...DEFAULT_LOOK_AT.offsetOrientation],
        constrainAxes: { ...DEFAULT_LOOK_AT.constrainAxes }
      };
    }
  },
  {
    id: "orbit",
    commandId: "ae.3d.orbit",
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
    commandId: "ae.shape.break",
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
    commandId: "ae.rig.effector",
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
    commandId: "ae.camera.transition",
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
    commandId: "ae.3d.cylinder",
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
    commandId: "ae.3d.cube",
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
    id: "gradient",
    commandId: "ae.effect.gradient",
    nameKey: "tool.gradient.name",
    descriptionKey: "tool.gradient.description",
    editor: "gradient",
    disabledReason: () => state.busy ? state.busyReason : null
  },
  {
    id: "wave",
    commandId: "ae.effect.wave",
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
    commandId: "ae.effect.tile",
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
    commandId: "ae.effect.glitch",
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
    commandId: "ae.effect.echo",
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
    id: "parallax",
    commandId: "ae.animate.parallax.quick",
    nameKey: "tool.parallax.name",
    descriptionKey: "tool.parallax.description",
    render: renderUnifiedParallax,
    disabledReason: parallaxFullDisabledReason,
    apply: applyParallaxFull,
    reset: () => {
      state.parallax = { ...DEFAULT_PARALLAX };
      state.parallaxFull = { ...DEFAULT_PARALLAX_FULL };
    }
  },
  {
    id: "fastEdit",
    commandId: "ae.comp.fast-edit",
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
    commandId: "ae.shape.library",
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
    commandId: "ae.shape.trim-path",
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
    commandId: "ae.time.marker-loop",
    nameKey: "tool.timeMarkerLoop.name",
    descriptionKey: "tool.timeMarkerLoop.description",
    render: renderTimeMarkerLoop,
    disabledReason: timeMarkerLoopDisabledReason,
    apply: applyTimeMarkerLoop,
    reset: () => { state.timeMarkerLoop = { ...DEFAULT_TIME_MARKER_LOOP }; }
  },
];

const VIEWS: ShellView[] = [
  // Entrada de busca, favoritos e ferramentas recentes; Quick preserva a view.
  { id: "home", labelKey: "library.browse", titleKey: "view.home.title" },
  { id: "ease", primary: true, labelKey: "tool.ease.name", titleKey: "tool.ease.name" },
  { id: "presets", labelKey: "library.presets", titleKey: "library.presets" },
  { id: "tools", labelKey: "library.edit", titleKey: "view.tools.title" },
  { id: "context", utilityOnly: true, labelKey: "nav.context", titleKey: "view.context.title" },
  { id: "system", utilityOnly: true, labelKey: "nav.system", titleKey: "view.system.title" },
  { id: "diagnostics", utilityOnly: true, labelKey: "nav.diagnostics", titleKey: "view.diagnostics.title" },
  { id: "settings", labelKey: "nav.settings", titleKey: "view.settings.title" }
];

/** Versão do plugin, embutida no bundle para aparecer no bundle de suporte. */
const PLUGIN_VERSION = "0.2.0";

const state: {
  context: ContextData | null;
  capabilities: HostCapabilities | null;
  _lastError: string | null;
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
  reverseValues: ReverseValuesDraft;
  sendToEdge: SendToEdgeDraft;
  neon: NeonDraft;
  /** Filtro da grade de ferramentas; sobrevive ao redesenho. */
  toolQuery: string;
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
  _lastError: null,
  get lastError() { return this._lastError; },
  set lastError(value: string | null) {
    this._lastError = value;
    if (value) globalFeedback?.reportError(value);
  },
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
  reverseValues: { ...DEFAULT_REVERSE_VALUES },
  sendToEdge: { ...DEFAULT_SEND_TO_EDGE },
  neon: { ...DEFAULT_NEON },
  toolQuery: "",
  cloneKeys: { ...DEFAULT_CLONE_KEYS },
  timeController: { ...DEFAULT_TIME_CONTROLLER },
  animateKinetic: { ...DEFAULT_ANIMATE_KINETIC },
  inertial: { ...DEFAULT_INERTIAL },
  jump: { ...DEFAULT_JUMP },
  copyKeys: { ...DEFAULT_COPY_KEYS },
  trimPath: { ...DEFAULT_TRIM_PATH },
  shapeLibrary: { ...DEFAULT_SHAPE_LIBRARY },
  lookAt: {
    ...DEFAULT_LOOK_AT,
    offsetOrientation: [...DEFAULT_LOOK_AT.offsetOrientation],
    constrainAxes: { ...DEFAULT_LOOK_AT.constrainAxes }
  },
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
  warningI18n = i18n;
  const motionPreference = createBrowserReducedMotionController(document.documentElement, window);
  const disposeMotionPreference = (): void => {
    motionPreference.dispose();
    window.removeEventListener("unload", disposeMotionPreference);
  };
  window.addEventListener("unload", disposeMotionPreference);

  // O adapter precisa do logger antes de o shell existir: ele reporta falha de
  // transporte, e uma falha logo no primeiro comando não pode depender de a
  // interface já estar montada.
  const adapter = createAeHostAdapter(logger, () => {
    const locale = panelPreferences.snapshot().locale;
    return locale === "host" ? undefined : locale;
  });

  if (adapter) {
    // "pt_BR", com underscore — formato medido no After Effects 26.3, não
    // suposto. `normalizeLocale` cuida da conversão.
    panelHostLocale = adapter.uiLocale();
    logger.setHost("after-effects");

    // Moti.on Theme Sync: Inject native highlight color and typography
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const csInterface = new (window as any).CSInterface();
      const applyTheme = () => {
        const env = csInterface.getHostEnvironment();
        if (env && env.appSkinInfo) {
          const rgb = env.appSkinInfo.systemHighlightColor;
          if (rgb) {
            const highlightHex = `#${Math.round(rgb.red).toString(16).padStart(2, '0')}${Math.round(rgb.green).toString(16).padStart(2, '0')}${Math.round(rgb.blue).toString(16).padStart(2, '0')}`;
            document.documentElement.style.setProperty('--focus-ring', highlightHex);
          }
          document.documentElement.style.setProperty('--ch-font-family', '"Adobe Clean", sans-serif');
        }
      };
      applyTheme();
      csInterface.addEventListener("com.adobe.csxs.events.ThemeColorChanged", applyTheme);
    } catch { /* Ignored */ }
  }

  const preferredLocale = panelPreferences.snapshot().locale;
  i18n.setLocale(preferredLocale === "host" ? panelHostLocale : preferredLocale);

  // O idioma acessível precisa acompanhar o catálogo realmente selecionado.
  // Deixar o `lang` fixo em pt-BR faz leitores de tela pronunciarem inglês com
  // regras de português quando o After Effects está em en-US.
  document.documentElement.lang = i18n.locale();
  document.documentElement.setAttribute("data-runtime", "cep");

  const initialView = panelPreferences.snapshot().lastView;
  const shell = createShell({
    mount,
    document,
    i18n,
    subtitleKey: "app.subtitle.afterEffects",
    views: VIEWS,
    layout: "library",
    toolContext: () => {
      const tool = TOOLS.find(item => item.id === state.activeTool);
      return tool ? i18n.t(tool.nameKey) : null;
    },
    onStatus: (message, status) => {
      if (!feedbackReady || !status) return;
      if (status === "error" && !state.lastError) globalFeedback?.reportError(message);
      globalFeedback?.onStatus({ message, state: status });
    },
    onRender: (viewId, regions) => {
      panelPreferences.setLastView(viewId);
      renderView(viewId, regions, { i18n, logger, adapter, motionPreference });
    }
  });
  // Reabre na aba em que o painel foi fechado. Lida antes do createShell,
  // porque o primeiro render já grava a aba inicial.
  if (initialView && initialView !== shell.activeView()) shell.navigate(initialView);

  globalFeedback = createFeedbackController(document, {
    id: "app-toasts",
    labels: () => i18n.locale() === "pt-BR"
      ? { region: "Notificações", dismiss: "Fechar", queued: n => `${n} avisos aguardando`, success: "Concluído", error: "Erro", warning: "Atenção", info: "Informação" }
      : { region: "Notifications", dismiss: "Dismiss", queued: n => `${n} queued notifications`, success: "Complete", error: "Error", warning: "Warning", info: "Information" }
  });
  mount.appendChild(globalFeedback.element);
  window.addEventListener("unload", () => { rememberPresetNavigation(); disposeView?.(); globalFeedback?.dispose(); });
  // Grava a navegação da galeria em segundo plano; só escreve quando mudou.
  const navigationMemory = setInterval(rememberPresetNavigation, 2000);
  window.addEventListener("unload", () => clearInterval(navigationMemory));

  shell.observeWidth(window);
  logger.info("panel.started", { command: "panel.started" });

  if (!adapter) {
    shell.setStatus(i18n.t("status.outsideHost"), "error");
    return;
  }

  void refreshContext(shell, i18n, logger, adapter.client).finally(() => { feedbackReady = true; });

  // A partir daqui o painel se mantem sozinho: trocar de composicao ou de
  // selecao na timeline chega aqui sem o usuario apertar nada.
  const pararWatch = startContextWatch(shell, logger, adapter.client);
  window.addEventListener("unload", pararWatch);
}

interface Wiring {
  i18n: I18n;
  logger: MotionLogger;
  adapter: ReturnType<typeof createAeHostAdapter>;
  motionPreference: ReducedMotionController;
}

/**
 * Grade de ferramentas com busca.
 *
 * São 49 ferramentas numa lista só. Sem filtro, achar uma exige percorrer a
 * grade inteira — em 280 px isso é uma coluna de 49 linhas.
 *
 * ## Por que o filtro não redesenha a tela
 *
 * O padrão do painel é `shell.rerender()`, que limpa e remonta o conteúdo.
 * Chamá-lo a cada tecla recriaria o próprio campo de busca e o foco morreria no
 * meio da digitação. Então o filtro mexe só na visibilidade dos ladrilhos já
 * montados: sem remontagem, sem perda de foco, e sem custo por tecla.
 *
 * `state.toolQuery` sobrevive ao redesenho para o filtro continuar valendo
 * quando a tela volta da ferramenta para a grade.
 */
/**
 * Monta o `QuickContext` do contrato a partir do que o painel já leu do host.
 *
 * `selectionKinds` e `existingRigIdsInSelection` saem vazios: o
 * `ae.context.read` ainda não classifica tipo de camada nem lê metadata de rig.
 * Devolver vazio é honesto — o derivador trata os dois como "não sei", e os
 * perfis atuais não dependem deles. No dia em que um perfil depender, o campo
 * precisa existir de verdade antes, e não ser preenchido com chute aqui.
 */
function quickContextFromState(context: ContextData): QuickContext {
  return {
    host: "after-effects",
    hostVersion: context.hostVersion ?? "0",
    fps: context.compFrameRate ?? 30,
    compWidth: context.compWidth ?? 1920,
    compHeight: context.compHeight ?? 1080,
    compDurationSeconds: context.compDuration ?? 0,
    currentTimeSeconds: context.currentTime ?? 0,
    workAreaStart: context.workAreaStart ?? 0,
    workAreaDuration: context.workAreaDuration ?? context.compDuration ?? 0,
    selectionCount: context.selectionPropertyCount,
    // Camadas e propriedades são contagens diferentes, e as ferramentas de
    // operação dependem da primeira: quem seleciona duas camadas e clica em Null
    // tem zero propriedades selecionadas.
    selectionLayerCount: context.selectionLayerCount,
    selectionKinds: [],
    selectionHasKeyframes: context.selectionHasKeyframes,
    selectionHasExpressions: context.selectionHasExpressions,
    selectionIs3D: context.selectionIs3D,
    averageLayerDurationSeconds: context.averageLayerDurationSeconds ?? 0,
    existingRigIdsInSelection: []
  };
}

/**
 * Aplica o preset de fábrica da ferramenta direto na seleção.
 *
 * É o coração do produto: um clique, e a propriedade selecionada sai animada com
 * os sliders já no Effect Controls. Nenhuma tela intermediária — a configuração
 * fina acontece nos próprios controles, dentro do After Effects.
 *
 * `derive` é uma função pura do contexto: a amplitude sai da resolução da
 * composição, a duração sai do fps. Por isso o preset se comporta igual numa
 * comp 1080p e numa 4K, sem o usuário ajustar nada.
 */
async function applyQuickPreset(
  tool: ToolDefinition, commandId: string, profile: Readonly<Pick<QuickProfile, "derive" | "liveControls">>,
  shell: Shell, i18n: I18n, logger: MotionLogger, client: Client,
  selectedPreset?: { name: string; recentId: string }
): Promise<void> {
  if (state.busy) return;
  state.lastError = null;
  const name = selectedPreset?.name ?? i18n.t(tool.nameKey);
  let applied = false;
  if (!selectedPreset) quickTileFeedback?.(tool.id, "loading");
  setBusy(shell, true, i18n.t("status.applyingQuick", { tool: name }));
  shell.setStatus(i18n.t("status.applyingQuick", { tool: name }), "busy");
  try {
    // Refresh defaults at click time; the command revalidates the real selection.
    const current = await client.execute<ContextData>("ae.context.read");
    logger.recordResponse("ae.context.read", current);
    if (!current.ok || !current.data) { reportFailure(shell, i18n, current); return; }
    state.context = current.data;
    if (!current.data.isComposition) {
      state.lastError = i18n.t("message.quickNoActiveComp");
      shell.setStatus(state.lastError, "error");
      return;
    }
    let args = profile.derive ? profile.derive(quickContextFromState(current.data)) : {};
    let preserveMorphSelection = false;
    if (commandId === "ae.text.word-reveal") {
      const selected = await client.execute("ae.text.word-reveal.read", {});
      logger.recordResponse("ae.text.word-reveal.read", selected);
      if (!selected.ok) { reportFailure(shell, i18n, selected); return; }
      if (!isWordRevealReadData(selected.data)) { shell.setStatus(i18n.t("wordReveal.readInvalid"), "error"); return; }
      hydrateWordReveal(selected.data);
      if (selected.data.controls) args = { ...selected.data.controls, renderer: selected.data.renderer, action: "apply" };
    }
    if (commandId === "ae.text.variable-morph") {
      const selected = await client.execute("ae.text.variable-morph.read", {});
      logger.recordResponse("ae.text.variable-morph.read", selected);
      if (!selected.ok) { reportFailure(shell, i18n, selected); return; }
      if (!isVariableMorphReadData(selected.data)) { shell.setStatus(i18n.t("proximityMorph.readInvalid"), "error"); return; }
      hydrateVariableMorph(selected.data, Math.max(1, Math.min(5000, 250 * (current.data.compHeight ?? 1080) / 1080)));
      if (selected.data.controls) args = variableMorphCompatibleArgs({ ...selected.data.controls, renderer: selected.data.renderer ?? "auto", action: "apply" }, selected.data.rigVersion);
      preserveMorphSelection = selected.data.rigVersion > 0;
    }
    if (commandId === "ae.text.vertical-pulse") {
      const selected = await client.execute("ae.text.vertical-pulse.read", {});
      logger.recordResponse("ae.text.vertical-pulse.read", selected);
      if (!selected.ok) { reportFailure(shell, i18n, selected); return; }
      if (!isVerticalPulseReadData(selected.data)) { shell.setStatus(i18n.t("verticalPulse.readInvalid"), "error"); return; }
      hydrateVerticalPulse(selected.data, current.data.compFrameRate);
      const blocked = verticalPulseReadDisabledReason(i18n, current.data.compFrameRate);
      if (blocked) { shell.setStatus(blocked, "error"); return; }
      args = selected.data.controls ? { ...selected.data.controls, renderer: selected.data.renderer ?? "legacy" }
        : { ...pulsePresetArgs("impact", current.data.compFrameRate) };
    }
    const response = await client.execute(commandId, args as Record<string, unknown>,
      { mode: "quick", emitLiveControls: true, preserveSelection: commandId === "ae.text.variable-morph" ? preserveMorphSelection : commandId !== "ae.text.style-swap" });
    logger.recordResponse(commandId, response);
    if (!response.ok) { reportFailure(shell, i18n, response); return; }
    if (response.warnings.length) reportHostWarnings(response.warnings);
    panelPreferences.recordUse(selectedPreset?.recentId ?? tool.id);
    if (!selectedPreset) state.activeTool = tool.id;
    const data = response.data as { appliedCount?: number; unchangedCount?: number; skippedCount?: number; mode?: string; status?: string } | null;
    applied = !(commandId === "ae.keys.ease.apply" && data?.appliedCount === 0);
    const reused = data?.appliedCount === 0 && (data?.unchangedCount ?? 0) > 0;
    // Resultado com caminho de volta: "Ajustar" abre a ferramenta que acabou de
    // ser aplicada, com os mesmos controles do editor.
    if (!selectedPreset && applied) globalFeedback?.attachToNextSuccess([{
      label: i18n.t("feedback.adjust"), dismissOnPress: true,
      onPress: () => {
        state.activeTool = tool.id; state.lastError = null;
        if (shell.activeView() === "tools") shell.rerender(); else shell.navigate("tools");
        void tool.load?.();
      }
    }]);
    if (commandId === "ae.3d.orbit") {
      const draft = { ...args };
      delete draft["applyPreset"];
      state.orbit = { ...state.orbit, ...draft };
      shell.setStatus(i18n.t(state.orbit.bake ? "message.orbitBaked" : "message.orbitApplied"), "ok");
    } else if (commandId === "ae.keys.ease.apply") {
      shell.setStatus(i18n.t("message.easeApplied", { count: data?.appliedCount ?? 0 }),
        data?.appliedCount === 0 ? "error" : "ok");
    } else if (commandId === "ae.animate.parallax.quick") {
      shell.setStatus(i18n.t(data?.status === "reused" ? "message.parallaxReused" : data?.mode === "adjust" ? "message.parallaxAdjusted" : "message.parallaxCreated"), "ok");
    } else if (commandId === "ae.text.style-swap") shell.setStatus(i18n.t("textEffects.styleSwap.applied"), "ok");
    else shell.setStatus(i18n.t(reused ? "message.quickReused" : profile.liveControls.length > 0 ? "message.quickApplied" : "message.quickAppliedOperation", { tool: name }), "ok");
    if (commandId === "ae.text.word-reveal") {
      const selected = await client.execute("ae.text.word-reveal.read", {});
      logger.recordResponse("ae.text.word-reveal.read", selected);
      if (selected.ok && isWordRevealReadData(selected.data)) hydrateWordReveal(selected.data);
    }
    if (commandId === "ae.text.variable-morph") {
      const selected = await client.execute("ae.text.variable-morph.read", {});
      logger.recordResponse("ae.text.variable-morph.read", selected);
      if (selected.ok && isVariableMorphReadData(selected.data)) hydrateVariableMorph(selected.data);
    }
    if (commandId === "ae.text.vertical-pulse") {
      const selected = await client.execute("ae.text.vertical-pulse.read", {});
      logger.recordResponse("ae.text.vertical-pulse.read", selected);
      if (selected.ok && isVerticalPulseReadData(selected.data)) {
        hydrateVerticalPulse(selected.data, current.data.compFrameRate);
        verticalPulseReadContextKey = contextFingerprint(state.context);
      }
    }
  } catch {
    state.lastError = i18n.t("message.failureWithoutReason");
    shell.setStatus(state.lastError, "error");
  } finally {
    setBusy(shell, false);
    if (!selectedPreset) quickTileFeedback?.(tool.id, applied ? "success" : "idle");
  }
}

/**
 * Liga o navegador de ferramentas compartilhado ao estado e ao catálogo deste
 * painel.
 *
 * O componente vive em `@motion/ui-core` e não sabe nada de `state`, de
 * `MessageKey` nem do host: recebe textos já traduzidos e devolve DOM. É o que
 * o torna testável de verdade — `main.ts` monta o shell no import e não pode
 * ser carregado por um teste, então enquanto a lógica morava aqui só dava para
 * verificá-la lendo o próprio código-fonte com expressão regular.
 */
async function applyLibraryCommand(action: "apply" | "phase-apply" | "remove" | "bake" | "camera-transition", args: Record<string, unknown>, recentId: string,
  shell: Shell, i18n: I18n, logger: MotionLogger, client: Client): Promise<void> {
  if (state.busy) return;
  const pt = i18n.locale() === "pt-BR";
  setBusy(shell, true); state.lastError = null;
  shell.setStatus(pt ? "Atualizando preset…" : "Updating preset…", "busy");
  try {
    const command = `ae.presets.${action}`;
    const response = await client.execute(command, args, { preserveSelection: true });
    logger.recordResponse(command, response);
    if (!response.ok) {
      state.lastError = response.error?.message || (pt ? "Não foi possível aplicar o preset." : "Unable to apply preset.");
      shell.setStatus(state.lastError, "error"); return;
    }
    if (recentId) panelPreferences.recordUse(recentId);
    const count = Number((response.data as { appliedCount?: number } | null)?.appliedCount ?? 0);
    // setBusy(false) recreates the workspace; choose Edit before that render so
    // its fresh inspection loads the values actually applied in After Effects.
    if (count > 0 && (action === "apply" || action === "phase-apply" || action === "camera-transition")) presetNavigation.view = "edit";
    // Removing a managed preset returns to the browser context retained before
    // application, including the selected card, filters and scroll position.
    if (count > 0 && action === "remove") presetNavigation.view = "browse";
    const message = action === "camera-transition" && count ? pt ? "Transição pronta. O marcador CUT indica o corte." : "Transition ready. The CUT marker marks the cut." : count ? pt ? action === "remove" ? "Preset removido da seleção." : action === "bake" ? "Animação convertida em keyframes." : "Preset aplicado. Ajuste na aba Editar." : action === "remove" ? "Preset removed." : action === "bake" ? "Animation baked to keyframes." : "Preset applied. Adjust in the Edit tab." : pt ? "Nenhum preset gerenciado na seleção." : "No managed preset in selection.";
    shell.setStatus(message, count ? "ok" : "busy");
    if (response.warnings.length) reportHostWarnings(response.warnings);
  } catch { shell.setStatus(i18n.t("message.failureWithoutReason"), "error"); }
  finally { setBusy(shell, false); }
}

async function applyQuickAction(action: QuickAction, shell: Shell, i18n: I18n, logger: MotionLogger, client: Client): Promise<void> {
  if (state.busy) return;
  const name = quickActionName(action, i18n.locale());
  state.lastError = null;
  setBusy(shell, true, i18n.t("status.applyingQuick", { tool: name }));
  shell.setStatus(i18n.t("status.applyingQuick", { tool: name }), "busy");
  try {
    const command = action === "save-frame" ? "ae.quick-tools.save-frame" : "ae.quick-tools.apply";
    const response = await client.execute(command, { action }, { mode: "quick", emitLiveControls: false, preserveSelection: true });
    logger.recordResponse(command, response);
    if (!response.ok) { reportFailure(shell, i18n, response); return; }
    const data = response.data as { changedItems: number; unchangedItems: number; outputPath?: string };
    const message = data.outputPath ? `${name}: ${data.outputPath}`
      : i18n.t(data.unchangedItems && !data.changedItems ? "message.quickReused" : "message.quickAppliedOperation", { tool: name });
    shell.setStatus(message, "ok");
    if (response.warnings.length) reportHostWarnings(response.warnings);
    const current = await client.execute<ContextData>("ae.context.read");
    logger.recordResponse("ae.context.read", current);
    if (current.ok && current.data) state.context = current.data;
  } catch {
    state.lastError = i18n.t("message.failureWithoutReason");
    shell.setStatus(state.lastError, "error");
  } finally { setBusy(shell, false); }
}

function renderToolBrowser(
  regions: RenderRegions, i18n: I18n, shell: Shell, logger: MotionLogger, client: Client
): void {
  regions.content.classList.add("ch-browser-body");
  regions.content.parentElement?.setAttribute("data-browser", "true");
  const anchor = createElement(document, "section", "ch-quick-anchor");
  anchor.setAttribute("aria-label", i18n.t("tool.anchor.name"));
  const grid = anchorGrid(document, {
    value: "", disabled: state.busy,
    labels: ANCHOR_GRID.map(({ ponto, rotulo }) => ({ value: ponto, label: i18n.t(rotulo) })),
    onSelect: point => {
      if (state.busy) return;
      state.anchor = { ...state.anchor, mode: "normal", gridPoint: point as AnchorGridPoint };
      void applyAnchor(shell, i18n, logger, client);
    }
  });
  grid.id = "library-anchor-grid";
  anchor.appendChild(grid);
  const edit = (tool: ToolDefinition): void => {
    state.activeTool = tool.id;
    state.lastError = null;
    if (shell.activeView() === "tools") shell.rerender();
    else shell.navigate("tools");
    void tool.load?.();
  };
  const quickOptions = () => ({ locale: i18n.locale(), busy: state.busy,
    hasComp: Boolean(state.context?.isComposition), selectionCount: state.context?.selectionLayerCount ?? 0 });
  const quickActions = createQuickActions(document, {
    ...quickOptions(), onAction: action => { void applyQuickAction(action, shell, i18n, logger, client); }
  });
  anchor.appendChild(quickActions);
  const dock = createQuickDock(document, {
    content: anchor, locale: i18n.locale(), pinned: panelPreferences.snapshot().quickDockPinned,
    onPinChange: pinned => panelPreferences.setQuickDockPinned(pinned),
    onHeightChange: height => document.documentElement.style.setProperty("--ch-feedback-bottom", `${height + 38}px`)
  });

  const icons = ["ease", "reverseOrder", "wiggle", "cameraTransition", "shapeLibrary", "neon", "context"];
  const libraryItems = (): LibraryItem[] => TOOLS.filter(tool => !["ease", "cloneKeys", "reverseKeys", "reverseValues", "sendToEdge"].includes(tool.id)).map(tool => {
      const profile = tool.commandId ? getQuickProfile(tool.commandId) ?? operationQuickProfile(tool.id) : undefined;
      const quick = Boolean(tool.id !== "beat" && tool.id !== "ease" && profile && !getDescriptor(tool.commandId ?? "")?.destructive);
      return {
        id: tool.id, name: i18n.t(tool.nameKey), description: i18n.t(tool.descriptionKey),
        aliases: TOOL_ALIASES[tool.id] ?? tool.id, category: TOOL_CATEGORY[tool.id],
        interaction: tool.id === "anchor" ? "direct-control" : quick ? "quick" : "configure",
        reason: tool.id === "ease" || tool.id === "anchor" ? (state.busy ? state.busyReason : null) : tool.disabledReason(i18n),
        edit: () => edit(tool),
        run: () => {
          if (tool.id === "anchor") { dock.expandAndFocus(); return; }
          if (profile && tool.commandId) void applyQuickPreset(tool, tool.commandId, profile, shell, i18n, logger, client);
        }
      };
    });
  const library = createQuickLibrary(document, {
    locale: i18n.locale(), navigation: libraryNavigation, preferences: panelPreferences, anchor: dock.element,
    categories: TOOL_CATEGORIES.map((id, index) => ({ id, name: i18n.t(CATEGORY_NAME_KEY[id]), icon: icons[index] ?? "tools" })),
    onNavigate: () => { state.toolQuery = libraryNavigation.query; panelPreferences.setCategory(libraryNavigation.category); },
    items: libraryItems()
  });
  refreshLibrary = () => {
    library.update(libraryItems());
    updateQuickActions(quickActions, quickOptions());
    for (const node of grid.querySelectorAll<HTMLButtonElement>("button")) {
      node.disabled = state.busy || !state.context?.isComposition || !state.context.selectionLayerCount;
      node.setAttribute("aria-disabled", String(node.disabled));
    }
    dock.update({ ...quickOptions(), contextKey: [state.context?.activeItemName, state.context?.selectionSignature, state.context?.selectionLayerCount].join("|"), busy: state.busy });
    shell.refreshChrome();
  };
  quickTileFeedback = library.setFeedback;
  disposeView = () => { library.dispose(); dock.dispose(); refreshLibrary = null; quickTileFeedback = null; document.documentElement.style.setProperty("--ch-feedback-bottom", "38px"); };
  regions.content.appendChild(library.element);
  refreshLibrary();

}

const TOOL_ALIASES: Partial<Record<ToolId, string>> = {
  wordReveal: "word box reveal palavras caixas texto text revelacao",
  variableMorph: "morph morphing proximity proximidade variable font fonte variavel peso italico",
  styleSwap: "text swapping font swap troca fontes estilos texto",
  verticalPulse: "pulso vertical de texto texto glow brilho rasgo distorcao pulse vertical text pulse stretched text eletrico plasma liquido ruptura",
  anchor: "ancora anchor point pivot pivo", ease: "ease easing suavizar curva bezier",
  wiggle: "wiggle tremer oscilacao shake", flicker: "flicker piscar opacidade",
  smooth: "smooth suavizar expressao", createNull: "null nulo controlador",
  reverseOrder: "reverse layers order inverter ordem", loopOut: "loop repeat repetir",
  cameraTransition: "camera movimento transicao", timeController: "time remap tempo"
};

/** Adapt existing editor drafts to commands that perform an immediate operation.
 * Rig generators without a reusable-instance contract stay in their editor. */
function operationQuickProfile(id: ToolId): Pick<QuickProfile, "derive" | "liveControls"> | undefined {
  const factories: Partial<Record<ToolId, NonNullable<QuickProfile["derive"]>>> = {
    wordReveal: context => ({ ...WORD_REVEAL_DEFAULTS,
      durationFrames: Math.max(4, Math.min(180, Math.round(context.fps * 1.2))),
      staggerFrames: Math.max(0, Math.min(60, Math.round(context.fps / 6))) }),
    variableMorph: context => ({ ...PROXIMITY_MORPH_DEFAULTS, radius: Math.max(1, Math.min(5000, 250 * context.compHeight / 1080)) }),
    verticalPulse: context => ({ ...pulsePresetArgs("impact", context.fps) }),
    styleSwap: context => ({ ...STYLE_SWAP_DEFAULTS, durationFrames: Math.max(1, Math.min(300, Math.round(context.fps * 0.8))) }),
    parallax: () => ({ ...DEFAULT_PARALLAX }),
    ease: () => ({ ...DEFAULT_EASE, x1: 0.333, y1: 0, x2: 0.667, y2: 1 }),
    delay: () => delayArgs({ ...DEFAULT_DELAY, shiftMode: "keyframes" }),
    lookAt: () => ({ ...DEFAULT_LOOK_AT, upAxis: "+y", offsetOrientation: [...DEFAULT_LOOK_AT.offsetOrientation], constrainAxes: { ...DEFAULT_LOOK_AT.constrainAxes } }),
    orbit: context => ({ ...deriveOrbitPreset(context) }),
    copyKeys: () => ({}),
    pasteKeys: () => ({ ...DEFAULT_COPY_KEYS }),
    cloneKeys: () => ({ ...DEFAULT_CLONE_KEYS }),
    aiToVector: () => ({ ...DEFAULT_AI_TO_VECTOR }),
    textToVector: () => ({ ...DEFAULT_TEXT_TO_VECTOR }),
    jump: context => ({ ...DEFAULT_JUMP, height: 180 * context.compHeight / 1080,
      durationFrames: Math.max(1, Math.round(context.fps * 0.67)) }),
    cameraTransition: context => ({ ...DEFAULT_CAMERA_TRANSITION,
      durationFrames: Math.max(1, Math.round(context.fps)), amount: 400 * context.compWidth / 1920, cameraName: "" }),
    shapeLibrary: context => ({ ...DEFAULT_SHAPE_LIBRARY,
      size: 200 * context.compHeight / 1080, position: [context.compWidth / 2, context.compHeight / 2] })
  };
  const derive = factories[id];
  return derive ? { derive, liveControls: [] } : undefined;
}

function renderView(viewId: string, regions: RenderRegions, wiring: Wiring): void {
  disposeView?.();
  disposeView = null;
  refreshLibrary = null; refreshToolContext = null; refreshPresetContext = null;
  globalFeedback?.refreshLabels();
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
  // Every color field in this panel shares recent colors and the system dialog.
  configureColorPickers(document, {
    recent: { list: () => panelPreferences.snapshot().recentColors, record: hex => panelPreferences.recordColor(hex) },
    native: {
      pick: async hex => {
        const response = await client.execute<{ cancelled: boolean; hex: string | null }>("ae.ui.color-picker", { hex });
        logger.recordResponse("ae.ui.color-picker", response);
        return response.ok ? response.data?.hex ?? null : null;
      }
    }
  });

  // A falha pertence à tarefa que a pessoa acabou de executar. O ToastRegion
  // agora se encarrega de exibi-la de forma flutuante sem quebrar a grade,
  // mantendo o design limpo.

  if (viewId === "home") {
    renderToolBrowser(regions, i18n, shell, logger, client);
    return;
  }

  if (viewId === "presets") {
    regions.content.classList.add("ch-browser-body");
    regions.content.parentElement?.setAttribute("data-browser", "true");
    const gallery = createPresetWorkspace(document, {
      cache: presetWorkspaceCache,
      context: () => ({ hasComp: Boolean(state.context?.isComposition), selectionCount: state.context?.selectionLayerCount ?? 0, selectedKeys: state.context?.selectionSelectedKeyCount ?? 0, fps: state.context?.compFrameRate ?? undefined, textLayers: state.context?.selectionTextLayerCount, lockedLayers: state.context?.selectionLockedLayerCount }),
      execute: async (command, args) => { const response = await client.execute(command, args, {preserveSelection:true}); if(command !== "ae.presets.inspect") logger.recordResponse(command,response); return response; },
      locale: i18n.locale(), preferences: panelPreferences, busy: state.busy, navigation: presetNavigation,
      apply: (preset, settings, mode) => {
        if (preset.category === "camera-transitions" && mode !== "layers") {
          void applyLibraryCommand("camera-transition", { presetId: preset.motion!.id,
            durationFrames: settings?.durationFrames ?? preset.params.durationFrames,
            intensity: settings?.intensity ?? preset.params.intensity }, preset.id, shell, i18n, logger, client); return;
        }
        if (preset.motion) { void applyLibraryCommand(preset.motion.mode==="transition"?"phase-apply":"apply", { presetId: preset.motion.id, ...settings }, preset.id, shell, i18n, logger, client); return; }
        const tool = TOOLS.find(item => item.commandId === preset.handler);
        if (tool) void applyQuickPreset(tool, preset.handler, { derive: context => presetArgs(preset, context), liveControls: [] },
          shell, i18n, logger, client, { name: preset.displayName[i18n.locale()] ?? preset.id, recentId: preset.id });
      },
      lifecycle: action => { void applyLibraryCommand(action, {}, "", shell, i18n, logger, client); },
      edit: preset => {
        if (!state.context) return;
        const args = presetArgs(preset, quickContextFromState(state.context));
        if (preset.category === "ease") { state.ease = { ...DEFAULT_EASE, ...preset.curve }; state.activeTool = "ease"; }
        else {
          state.cameraTransition = { ...DEFAULT_CAMERA_TRANSITION, preset: args.preset as CameraTransitionPreset,
            amount: Number(args.amount), durationFrames: Number(args.durationFrames), curve: { ...preset.curve } };
          state.activeTool = "cameraTransition";
        }
        shell.navigate(preset.category === "ease" ? "ease" : "tools");
      }
    });
    document.documentElement.style.setProperty("--ch-feedback-bottom", "92px");
    refreshPresetContext = gallery.updateContext;
    disposeView = () => { gallery.dispose(); refreshPresetContext = null; document.documentElement.style.setProperty("--ch-feedback-bottom", "38px"); }; regions.content.appendChild(gallery.element); return;
  }

  if (["context", "system", "diagnostics"].includes(viewId)) {
    const back = createActionButton(document, {
      id: "support-back-settings", label: i18n.t("settings.help.back"), variant: "tertiary",
      onPress: () => shell.navigate("settings")
    });
    back.element.classList.add("ch-support-back");
    regions.content.appendChild(back.element);
  }

  if (viewId === "context") {
    // Sem botao Atualizar: `startContextWatch` rele o host a cada 700 ms e
    // redesenha quando algo muda. Um botao aqui ofereceria ao usuario um
    // trabalho que o programa ja faz — e era a reclamacao que originou o
    // polling.
    renderContext(regions, i18n);
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

  if (viewId === "tools" || viewId === "ease") {
    const tool = TOOLS.find((item) => item.id === (viewId === "ease" ? "ease" : state.activeTool));

    // Sem ferramenta escolhida: so a grade. A §22 proibe inspector antes da
    // escolha — parametros de quatro ferramentas na mesma tela seriam quatro
    // tarefas competindo.
    if (!tool) {
      renderToolBrowser(regions, i18n, shell, logger, client);
      return;
    }

    // Ferramenta aberta: o titulo passa a ser o nome dela. Deixa-lo em
    // "Ferramentas" obrigaria o usuario a voltar a grade para lembrar onde esta.
    shell.setViewTitle(i18n.t(tool.nameKey));
    regions.content.classList.add("ch-tool-editor");
    regions.content.setAttribute("data-tool", tool.id);
    if (tool.id === "gradient") {
      let storage: Storage | undefined;
      try { storage = window.localStorage; } catch { /* The editor reports storage failures on save. */ }
      const editor = createGradientEditor(document, {
        i18n, ...(storage ? { storage } : {}),
        context: () => ({ isComposition: Boolean(state.context?.isComposition), signature: contextFingerprint(state.context) }),
        read: async () => {
          const response = await client.execute<GradientReadData>("ae.effect.gradient.read", {});
          logger.recordResponse("ae.effect.gradient.read", response);
          return response;
        },
        execute: async args => {
          const response = await client.execute("ae.effect.gradient", args);
          logger.recordResponse("ae.effect.gradient", response);
          return response;
        },
        error: response => response.error ? hostFailureMessage(response.error, i18n) : i18n.t("gradient.operationFailed"),
        busy: value => { state.busy = value; shell.setBusy(value); }
      });
      regions.content.appendChild(editor.element); regions.actions.appendChild(editor.actions);
      const overflow = attachActionOverflow(document, editor.actions, { label: i18n.t("action.moreActions") });
      const refresh = () => { void editor.refresh(); };
      refreshToolContext = refresh;
      const polling = focusedPoll(document, refresh, CONTEXT_POLL_MS);
      const stopPositioning = keepFeedbackAboveActions(regions.actions);
      disposeView = () => { editor.dispose(); overflow.dispose(); polling.dispose(); stopPositioning(); refreshToolContext = null; };
      void editor.refresh();
      return;
    }
    tool.render(regions, i18n);
    groupToolSections(document, regions.content);
    for (const section of Array.from(regions.content.getElementsByTagName("details"))) {
      section.classList.add("ch-tool-disclosure");
      section.setAttribute("data-motion", "disclosure-expand");
    }
    const refreshEditorContext = refreshToolContext as (() => void) | null;

    const editorContext = contextFingerprint(state.context);
    const currentDisabledReason = (): string | null => tool.load && editorContext !== contextFingerprint(state.context)
      ? (i18n.locale() === "pt-BR" ? "A seleção mudou. Atualize a prévia antes de aplicar." : "Selection changed. Refresh the preview before applying.")
      : tool.disabledReason(i18n);
    const disabledReason = currentDisabledReason();
    const contextNotice = createAlert(document, { tone: "warning", title: disabledReason ?? i18n.t("action.apply") });
    contextNotice.element.hidden = !disabledReason;
    regions.content.appendChild(contextNotice.element);
    const disposeEditor = disposeView as (() => void) | null;
    let actionAreaAlive = true;
    const actionBar = createElement(document, "div", "ch-panel-action-bar ch-tool-action-bar");
    const appendAction = (options: ActionButtonOptions) => {
      const control = createActionButton(document, { ...options, onPress: () => {
        if (actionAreaAlive && !state.busy) options.onPress();
      } });
      control.element.classList.add("ch-tool-action-control");
      if (options.variant === "primary") control.element.classList.add("ch-panel-action-bar__primary");
      actionBar.appendChild(control.element);
      return control;
    };
    const removing = tool.id === "verticalPulse" && verticalPulseAction(state.context?.compFrameRate ?? null) === "remove"
      || tool.id === "wordReveal" && textEffectArgs("wordReveal").action === "remove"
      || tool.id === "variableMorph" && textEffectArgs("variableMorph").action === "remove";
    const applyControl = appendAction({
      id: `tool-${tool.id}-apply`,
      label: tool.id === "wordReveal" ? wordRevealActionLabel(i18n) : tool.id === "variableMorph" ? variableMorphActionLabel(i18n)
        : tool.id === "verticalPulse" ? verticalPulseActionLabel(i18n, state.context?.compFrameRate ?? null) : removing ? i18n.t("textEffects.remove") : tool.id === "clean"
        ? i18n.t(state.clean.scanToken ? "action.clean.remove" : "action.clean.scan") : i18n.t("action.apply"),
      variant: removing ? "destructive" : "primary",
      disabled: Boolean(disabledReason), ...(disabledReason ? { disabledReason } : {}),
      onPress: () => {
        const invalid = regions.content.querySelector<HTMLInputElement>("[aria-invalid='true']");
        if (invalid) { invalid.focus(); return; }
        if (!currentDisabledReason()) void tool.apply(shell, i18n, logger, client);
      }
    });
    refreshToolContext = () => {
      if (tool.id === "wordReveal" && editorContext !== contextFingerprint(state.context) && !state.busy) void refreshWordRevealControls();
      if (tool.id === "variableMorph" && editorContext !== contextFingerprint(state.context) && !state.busy) void refreshVariableMorphControls();
      if (tool.id === "verticalPulse" && editorContext !== contextFingerprint(state.context) && !state.busy) void refreshVerticalPulseControls();
      refreshEditorContext?.();
      const reason = currentDisabledReason();
      contextNotice.element.hidden = !reason;
      contextNotice.setTitle(reason ?? i18n.t("action.apply"));
      applyControl.setDisabled(Boolean(reason), reason ?? undefined);
      footer.refresh?.();
      shell.refreshChrome();
      shell.setViewTitle(i18n.t(tool.nameKey));
    };
    // Filled once the footer exists; context refreshes can relabel its actions.
    const footer: { refresh?: () => void } = {};
    const busy = state.busy ? { disabled: true, disabledReason: state.busyReason ?? i18n.t("status.initializing") } : {};
    if (tool.load) appendAction({
      id: `tool-${tool.id}-refresh`, label: i18n.t(tool.loadLabelKey ?? "action.refreshPreview"), ...busy,
      onPress: () => { void tool.load?.(); }
    });
    appendAction({
      id: `tool-${tool.id}-reset`, label: i18n.t("action.reset"), variant: "tertiary", ...busy,
      onPress: () => { tool.reset(); state.lastError = null; shell.rerender(); }
    });
    // "← Ferramentas" in the header already leaves the editor; a footer Back
    // only pushed the actions onto a second row.
    regions.actions.appendChild(actionBar);
    const overflow = attachActionOverflow(document, actionBar, { label: i18n.t("action.moreActions") });
    footer.refresh = overflow.refresh;
    const stopPositioningFeedback = keepFeedbackAboveActions(regions.actions);
    disposeView = () => { actionAreaAlive = false; disposeEditor?.(); contextNotice.dispose(); overflow.dispose(); stopPositioningFeedback(); };
    return;
  }

  if (viewId === "system") {
    const view = createAeSystemView(document, {
      i18n,
      capabilities: state.capabilities,
      hasError: Boolean(state.lastError),
      busyReason: state.busy ? state.busyReason ?? i18n.t("status.initializing") : undefined,
      canPress: () => !state.busy,
      onRunCheck: () => void runSystemCheck(shell, i18n, logger, client),
      onVerifyBridge: () => void verifyBridge(shell, i18n, logger, client)
    });
    mountSupportView(regions, view);
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
  if (state.context.selectionExpressibleCount < 1) {
    return i18n.t("message.quickNeedsExpressible");
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
  if (state.context.selectionExpressibleCount < 1) {
    return i18n.t("message.quickNeedsExpressible");
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
  if (state.context.selectionExpressibleCount < 1) {
    return i18n.t("message.quickNeedsExpressible");
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
  if (state.context.selectionExpressibleCount < 1) {
    return i18n.t("message.quickNeedsExpressible");
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

function renderSettings(
  regions: RenderRegions,
  i18n: I18n,
  motionPreference: ReducedMotionController
): void {
  const view = createAeSettingsView(document, {
    i18n, preferences: panelPreferences, motionPreference,
    onLocale: value => {
      panelPreferences.setLocale(value);
      i18n.setLocale(value === "host" ? panelHostLocale : value);
      document.documentElement.lang = i18n.locale();
      regions.shell.rerender();
    },
    onRefresh: () => regions.shell.rerender(),
    onNavigate: viewId => regions.shell.navigate(viewId)
  });
  regions.content.appendChild(view.element);
  disposeView = () => view.dispose();
}

function mountSupportView(
  regions: RenderRegions,
  view: { content: HTMLElement; actions: HTMLElement; dispose(): void }
): void {
  regions.content.appendChild(view.content);
  regions.actions.appendChild(view.actions);
  const stopPositioningFeedback = keepFeedbackAboveActions(regions.actions);
  disposeView = () => { view.dispose(); stopPositioningFeedback(); };
}

/** Keeps feedback above the real footer height, including wrapped/translated actions. */
function keepFeedbackAboveActions(actions: HTMLElement): () => void {
  const positionFeedback = (): void => {
    const top = actions.getBoundingClientRect().top;
    const offset = Math.max(38, document.documentElement.clientHeight - top + 8);
    document.documentElement.style.setProperty("--ch-feedback-bottom", `${offset}px`);
  };
  const observer = typeof ResizeObserver === "function" ? new ResizeObserver(positionFeedback) : null;
  observer?.observe(actions);
  window.addEventListener("resize", positionFeedback);
  positionFeedback();
  return () => {
    observer?.disconnect();
    window.removeEventListener("resize", positionFeedback);
    document.documentElement.style.setProperty("--ch-feedback-bottom", "38px");
  };
}

function renderDiagnostics(regions: RenderRegions, i18n: I18n, logger: MotionLogger): void {
  const shell = regions.shell;
  const view = createDiagnosticsView(document, {
    i18n,
    entries: logger.entries(),
    droppedEntries: logger.size().dropped,
    debugMode: logger.isDebugMode(),
    busyReason: state.busy ? state.busyReason ?? i18n.t("status.initializing") : undefined,
    canPress: () => !state.busy,
    onExport: () => exportBundle(shell, i18n, logger),
    onClear: () => {
      const removed = logger.clear();
      shell.setStatus(i18n.t("message.logsCleared", { count: removed }), "ok");
      shell.rerender();
    },
    onToggleDebug: () => {
      if (logger.isDebugMode()) {
        logger.disableDebugMode();
        shell.setStatus(i18n.t("message.debugDisabled"));
      } else {
        logger.enableDebugMode();
        shell.setStatus(i18n.t("message.debugEnabled"), "ok");
      }
      shell.rerender();
    }
  });
  mountSupportView(regions, view);
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
  const localizedMessage = hostFailureMessage(error, i18n);
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
  // Local host preflight messages explain the specific conflict. Render as plain
  // text; paths/stacks fall back to the localized code and recovery action.
  const localizedMessage = hostFailureMessage(error, i18n);
  const failure = i18n.t("error.withCode", { code: error.code, message: localizedMessage });
  state.lastError = action ? `${failure} — ${action}` : failure;
  shell.setStatus(i18n.t(error.recoverable ? "status.notCompleted" : "status.failed"), "error");
}

type Client = NonNullable<ReturnType<typeof createAeHostAdapter>>["client"];

function setBusy(shell: Shell, busy: boolean, reason?: string): void {
  state.busy = busy;
  state.busyReason = busy ? reason ?? null : null;
  shell.setBusy(busy);
  if (refreshLibrary) refreshLibrary();
  else shell.rerender();
}

/**
 * Assinatura do contexto que importa para a interface.
 *
 * Só entram os campos que mudam o que o painel mostra ou habilita. `currentTime`
 * fica de fora de propósito: ele muda a cada quadro que o usuário arrasta o CTI,
 * e incluí-lo faria o painel se redesenhar durante um scrub — matando o foco de
 * quem estivesse digitando na busca.
 */
function contextFingerprint(context: ContextData | null): string {
  if (!context) return "sem-contexto";
  return [
    context.selectionSignature ?? "",
    context.isComposition ? "1" : "0",
    context.activeItemName ?? "",
    context.compWidth ?? "",
    context.compHeight ?? "",
    context.compFrameRate ?? "",
    context.compDuration ?? "",
    context.selectionLayerCount,
    context.selectionPropertyCount,
    context.selectionExpressibleCount,
    context.selectionSelectedKeyCount,
    context.selectionHasKeyframes ? "1" : "0",
    context.selectionHasExpressions ? "1" : "0",
    context.selectionIs3D ? "1" : "0",
    context.selectionTextLayerCount ?? "",
    context.selectionLockedLayerCount ?? ""
  ].join("\u0000");
}

/** Cadência do polling. Ver `startContextWatch` para o porquê deste número. */
const CONTEXT_POLL_MS = 700;

/**
 * Mantém o contexto fresco sozinho, sem botão de Atualizar.
 *
 * O usuário troca de composição, seleciona outra camada, aplica um keyframe — e
 * o painel precisa acompanhar. Exigir que ele aperte "Atualizar" depois de cada
 * uma dessas ações é pedir que ele faça o trabalho do programa.
 *
 * Três cuidados que fazem isso não atrapalhar:
 *
 * 1. **Só redesenha quando algo que importa mudou.** Um `rerender()` por tique
 *    destruiria o foco de quem está digitando na busca ou num campo numérico.
 *    A assinatura decide, e ela ignora o tempo corrente justamente para o
 *    painel não piscar durante um scrub.
 * 2. **Silencioso.** Não mexe em `busy` nem no status: o polling é pano de
 *    fundo, e uma leitura de rotina não pode parecer uma operação do usuário.
 *    Falha de leitura também não vira erro na tela — o tique seguinte tenta de
 *    novo, e um `evalScript` perdido não merece um alerta vermelho.
 * 3. **Não concorre.** Pula o tique enquanto uma operação está em curso ou
 *    enquanto a leitura anterior não voltou, senão uma fila de leituras se
 *    empilha atrás de um comando lento.
 *
 * 700 ms é o meio-termo: rápido o bastante para a troca de seleção parecer
 * instantânea, e folgado o bastante para o custo do `evalScript` sumir no ruído.
 */
function startContextWatch(shell: Shell, logger: MotionLogger, client: Client): () => void {
  let assinatura = contextFingerprint(state.context);
  let lendo = false;
  const numberGesturePending = (): boolean => Boolean(document.querySelector(".ch-preset-workspace input[data-scrub-pressed], .ch-preset-workspace input[data-scrubbing], .ch-preset-workspace [data-gesture-active], .ch-preset-workspace .ch-phase-scrub-row:hover"));

  const polling = focusedPoll(document, () => {
    if (lendo || state.busy || document.hidden || numberGesturePending() || document.querySelector(".ch-bezier[data-dragging]")) return;
    lendo = true;

    void client
      .execute<ContextData>("ae.context.read")
      .then((response) => {
        if (state.busy || numberGesturePending() || document.querySelector(".ch-bezier[data-dragging]") || !response.ok || !response.data) return;

        const nova = contextFingerprint(response.data);
        state.context = response.data;
        if (nova === assinatura) return;

        assinatura = nova;
        // O host pode ter mudado de versão entre leituras? Não — mas o log
        // precisa do host preenchido antes do primeiro erro, e esta é a única
        // leitura que roda sempre.
        logger.setHost("after-effects", response.data.hostVersion ?? undefined);
        if (refreshLibrary) refreshLibrary();
        else if (refreshToolContext) refreshToolContext();
        else if (refreshPresetContext) refreshPresetContext();
        else if (!document.querySelector(".ch-preset-workspace")) shell.rerender();
      })
      .catch(() => {
        // Silêncio deliberado: ver o item 2 acima.
      })
      .then(() => {
        lendo = false;
      });
  }, CONTEXT_POLL_MS);

  return () => polling.dispose();
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
    { mode: "advanced", emitLiveControls: true, preserveSelection: true }
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
      onSelect: (ponto) => {
        if (state.busy || !wiringAtual) return;
        state.anchor.gridPoint = ponto as AnchorGridPoint;
        void applyAnchor(shell, i18n, wiringAtual.logger, wiringAtual.client);
      }
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
  if (state.context.selectionLayerCount < 1) {
    return i18n.t("message.quickNeedsLayers");
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

  panelPreferences.recordUse("anchor");
  if (shell.activeView() === "tools" && state.activeTool === "anchor") await refreshAnchorPreview();
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
  if (state.context.selectionLayerCount < 1) {
    return i18n.t("message.quickNeedsLayers");
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
    { mode: "advanced", emitLiveControls: true, preserveSelection: true }
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
    { mode: "advanced", emitLiveControls: true, preserveSelection: true }
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
    { mode: "advanced", emitLiveControls: true, preserveSelection: true }
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
  if (!state.ease.applyIn && !state.ease.applyOut) return i18n.t("ease.needsSide");
  if (state.context.selectionSelectedKeyCount < 1) return i18n.t("message.quickNeedsKeys");
  return null;
}

function renderEase(regions: RenderRegions, i18n: I18n): void {
  const actions = createEaseActions(document, {
    i18n, disabledReason: easeActionsDisabledReason(i18n),
    onAction: action => {
      if (wiringAtual && !easeActionsDisabledReason(i18n)) {
        void applyEaseAction(action, regions.shell, i18n, wiringAtual.logger, wiringAtual.client);
      }
    }
  });
  regions.content.appendChild(actions.element);
  refreshToolContext = () => actions.update(easeActionsDisabledReason(i18n));
  const editor = createEaseEditor(document, {
    i18n, curve: state.ease, busy: state.busy,
    onChange: curve => { Object.assign(state.ease, curve); },
    onApply: () => { if (wiringAtual && !easeDisabledReason(i18n)) void applyEase(regions.shell, i18n, wiringAtual.logger, wiringAtual.client); }
  });
  disposeView = () => { actions.dispose(); editor.dispose(); };
  regions.content.appendChild(editor.element);
  const sides = createElement(document, "div", "ch-ease-sides");
  sides.appendChild(checkboxField(document, { id: "ease-apply-in", label: i18n.t("ease.applyIn"), checked: state.ease.applyIn,
    onChange: value => { state.ease.applyIn = value; regions.shell.rerender(); } }));
  sides.appendChild(checkboxField(document, { id: "ease-apply-out", label: i18n.t("ease.applyOut"), checked: state.ease.applyOut,
    onChange: value => { state.ease.applyOut = value; regions.shell.rerender(); } }));
  (editor.element.querySelector(".ch-ease-main") ?? editor.element).appendChild(sides);
}

function easeActionsDisabledReason(i18n: I18n): string | null {
  if (state.busy) return state.busyReason ?? i18n.t("status.initializing");
  if (!state.context?.isComposition) return i18n.t("message.easeNoActiveComp");
  if (state.context.selectionSelectedKeyCount < 1) return i18n.t("ease.actions.needsSelection");
  return null;
}

async function applyEaseAction(action: EaseAction, shell: Shell, i18n: I18n, logger: MotionLogger, client: Client): Promise<void> {
  if (easeActionsDisabledReason(i18n)) return;
  state.lastError = null;
  const label = i18n.t(action.labelKey);
  setBusy(shell, true, i18n.t("status.applyingQuick", { tool: label }));
  shell.setStatus(i18n.t("status.applyingQuick", { tool: label }), "busy");
  try {
    const response = await client.execute<{ appliedCount: number }>(action.command, { ...action.args }, { preserveSelection: true });
    logger.recordResponse(action.command, response);
    if (!response.ok) {
      if (response.error?.code === "KEYFRAME_CONFLICT") {
        const key = action.command === "ae.keys.reverse" || action.command === "ae.keys.reverse-values" ? "ease.conflict.reverse"
          : action.args.destination === "cti" ? "ease.conflict.cursor"
          : action.args.destination === "layer-start" || action.args.destination === "layer-end" ? "ease.conflict.edge" : "ease.conflict.after";
        state.lastError = i18n.t(key);
        shell.setStatus(i18n.t("status.notCompleted"), "error");
      } else reportFailure(shell, i18n, response);
      return;
    }
    if (response.warnings.length) reportHostWarnings(response.warnings);
    shell.setStatus(i18n.t("message.quickAppliedOperation", { tool: label }), "ok");
    const current = await client.execute<ContextData>("ae.context.read");
    logger.recordResponse("ae.context.read", current);
    if (current.ok && current.data) state.context = current.data;
  } catch {
    state.lastError = i18n.t("message.failureWithoutReason");
    shell.setStatus(state.lastError, "error");
  } finally { setBusy(shell, false); }
}

async function applyEase(shell: Shell, i18n: I18n, logger: MotionLogger, client: Client): Promise<void> {
  if (state.busy) return;
  const invalid = document.querySelector<HTMLInputElement>(".ch-ease-editor [aria-invalid='true']");
  if (invalid) { invalid.focus(); return; }
  const args = { ...state.ease };
  state.lastError = null;
  setBusy(shell, true, i18n.t("status.applyingEase"));
  shell.setStatus(i18n.t("status.applyingEase"), "busy");
  try {
    const response = await client.execute<{ appliedCount: number; skippedCount: number }>("ae.keys.ease.apply", args);
    logger.recordResponse("ae.keys.ease.apply", response);
    if (response.warnings.length) reportHostWarnings(response.warnings);
    if (response.ok && (response.data?.appliedCount ?? 0) > 0) {
      shell.setStatus(i18n.t("message.easeApplied", { count: response.data!.appliedCount }), "ok");
    } else if (!response.ok) reportFailure(shell, i18n, response);
    else shell.setStatus(i18n.t("ease.noChange"), "error");
  } catch {
    shell.setStatus(i18n.t("message.failureWithoutReason"), "error");
  } finally { setBusy(shell, false); }
}

function reverseKeysDisabledReason(i18n: I18n): string | null {
  if (state.busy) return state.busyReason ?? i18n.t("status.initializing");
  if (!state.context?.isComposition) return i18n.t("message.reverseKeysNoActiveComp");
  if (state.context.selectionSelectedKeyCount < 1) {
    return i18n.t("message.quickNeedsKeys");
  }
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

function reverseValuesDisabledReason(i18n: I18n): string | null {
  if (state.busy) return state.busyReason ?? i18n.t("status.initializing");
  if (!state.context?.isComposition) return i18n.t("message.reverseValuesNoActiveComp");
  if (state.context.selectionSelectedKeyCount < 1) {
    return i18n.t("message.quickNeedsKeys");
  }
  return null;
}

function renderReverseValues(regions: RenderRegions, i18n: I18n): void {
  // shell unused
  regions.content.appendChild(hint(document, i18n.t("message.reverseValuesInstructions")));
}

async function applyReverseValues(shell: Shell, i18n: I18n, logger: MotionLogger, client: Client): Promise<void> {
  if (state.busy) return;
  shell.setStatus(i18n.t("status.applyingReverseValues"), "busy");
  setBusy(shell, true, i18n.t("status.applyingReverseValues"));

  const response = await client.execute("ae.keys.reverse-values", {});
  logger.recordResponse("ae.keys.reverse-values", response);
  if (response.ok) {
    shell.setStatus(i18n.t("message.reverseValuesApplied"), "ok");
  } else {
    reportFailure(shell, i18n, response);
  }
  setBusy(shell, false);
}

function sendToEdgeDisabledReason(i18n: I18n): string | null {
  if (state.busy) return state.busyReason ?? i18n.t("status.initializing");
  if (!state.context?.isComposition) return i18n.t("message.sendToEdgeNoActiveComp");
  if (state.context.selectionSelectedKeyCount < 1) {
    return i18n.t("message.quickNeedsKeys");
  }
  return null;
}

function renderSendToEdge(regions: RenderRegions, i18n: I18n): void {
  const shell = regions.shell;
  const draft = state.sendToEdge;

  regions.content.appendChild(
    selectField(document, {
      id: "sendToEdge-edge",
      label: i18n.t("sendToEdge.edge"),
      value: draft.edge,
      options: [
        { value: "start", label: i18n.t("sendToEdge.edge.start") },
        { value: "end", label: i18n.t("sendToEdge.edge.end") }
      ],
      onChange: (value) => {
        draft.edge = value as SendToEdgeEdge;
        shell.rerender();
      }
    })
  );

  regions.content.appendChild(
    selectField(document, {
      id: "sendToEdge-reference",
      label: i18n.t("sendToEdge.reference"),
      value: draft.reference,
      options: [
        { value: "comp", label: i18n.t("sendToEdge.reference.comp") },
        { value: "layer", label: i18n.t("sendToEdge.reference.layer") },
        { value: "workArea", label: i18n.t("sendToEdge.reference.workArea") }
      ],
      onChange: (value) => {
        draft.reference = value as SendToEdgeReference;
        shell.rerender();
      }
    })
  );

  regions.content.appendChild(hint(document, i18n.t("message.sendToEdgeInstructions")));
}

async function applySendToEdge(shell: Shell, i18n: I18n, logger: MotionLogger, client: Client): Promise<void> {
  if (state.busy) return;
  shell.setStatus(i18n.t("status.applyingSendToEdge"), "busy");
  setBusy(shell, true, i18n.t("status.applyingSendToEdge"));

  const response = await client.execute("ae.keys.send-to-edge", {
    edge: state.sendToEdge.edge,
    reference: state.sendToEdge.reference
  });
  logger.recordResponse("ae.keys.send-to-edge", response);
  if (response.ok) {
    shell.setStatus(i18n.t("message.sendToEdgeApplied"), "ok");
  } else {
    reportFailure(shell, i18n, response);
  }
  setBusy(shell, false);
}

function beatDisabledReason(i18n: I18n): string | null {
  if (state.busy) return state.busyReason ?? i18n.t("status.initializing");
  if (!state.context?.isComposition) return i18n.t("message.beatNoActiveComp");
  if (state.context.selectionExpressibleCount < 1) {
    return i18n.t("message.quickNeedsExpressible");
  }
  return null;
}

function renderBeat(regions: RenderRegions, i18n: I18n): void {
  // Sem campos: os dois parâmetros do Beat viram Live Controls no Effect
  // Controls, e é lá que o ajuste acontece. A tela só explica o pré-requisito.
  regions.content.appendChild(hint(document, i18n.t("message.beatInstructions")));
}

async function applyBeat(shell: Shell, i18n: I18n, logger: MotionLogger, client: Client): Promise<void> {
  if (state.busy) return;
  shell.setStatus(i18n.t("status.applyingBeat"), "busy");
  setBusy(shell, true, i18n.t("status.applyingBeat"));

  const response = await client.execute<{ createdAmplitudeLayer: boolean }>("ae.audio.beat", {
    mode: 1,
    shakeFreq: 10,
    shakeAmp: 30
  });
  logger.recordResponse("ae.audio.beat", response);
  if (response.ok) {
    // Quando o comando converte o áudio ele acrescenta uma camada à
    // composição. Dizer isso é o mínimo: uma camada que aparece sozinha na
    // timeline, sem aviso, parece defeito e não recurso.
    shell.setStatus(
      i18n.t(
        response.data?.createdAmplitudeLayer
          ? "message.beatCreatedAmplitude"
          : "message.beatApplied"
      ),
      "ok"
    );
  } else {
    reportFailure(shell, i18n, response);
  }
  setBusy(shell, false);
}

function neonDisabledReason(i18n: I18n): string | null {
  if (state.busy) return state.busyReason ?? i18n.t("status.initializing");
  if (!state.context?.isComposition) return i18n.t("message.neonNoActiveComp");
  return null;
}

function renderNeon(regions: RenderRegions, i18n: I18n): void {
  const shell = regions.shell;
  const draft = state.neon;

  regions.content.appendChild(
    colorField(document, {
      id: "neon-core-color",
      label: i18n.t("neon.coreColor"),
      value: draft.coreColor,
      disabled: state.busy,
      onCommit: (value) => {
        draft.coreColor = value;
        shell.rerender();
      }
    })
  );

  regions.content.appendChild(
    colorField(document, {
      id: "neon-glow-color",
      label: i18n.t("neon.glowColor"),
      value: draft.glowColor,
      disabled: state.busy,
      onCommit: (value) => {
        draft.glowColor = value;
        shell.rerender();
      }
    })
  );

  regions.content.appendChild(
    numberField(document, {
      id: "neon-stroke-width",
      label: i18n.t("neon.strokeWidth"),
      value: draft.strokeWidth,
      // 0 a 1000 e a faixa que a referencia do TextDocument documenta; o host
      // valida a mesma faixa, entao o painel nao inventa um teto mais apertado.
      min: 0,
      max: 1000,
      step: 1,
      disabled: state.busy,
      onCommit: (value) => {
        draft.strokeWidth = value;
        shell.rerender();
      }
    })
  );

  regions.content.appendChild(
    numberField(document, {
      id: "neon-glow-radius",
      label: i18n.t("neon.glowRadius"),
      value: draft.glowRadius,
      min: 0,
      max: 1000,
      step: 1,
      disabled: state.busy,
      onCommit: (value) => {
        draft.glowRadius = value;
        shell.rerender();
      }
    })
  );

  regions.content.appendChild(
    numberField(document, {
      id: "neon-intensity",
      label: i18n.t("neon.intensity"),
      value: draft.intensity,
      min: 0,
      max: 100,
      step: 0.1,
      disabled: state.busy,
      onCommit: (value) => {
        draft.intensity = value;
        shell.rerender();
      }
    })
  );

  regions.content.appendChild(hint(document, i18n.t("message.neonInstructions")));
}

async function applyNeon(shell: Shell, i18n: I18n, logger: MotionLogger, client: Client): Promise<void> {
  if (state.busy) return;
  shell.setStatus(i18n.t("status.applyingNeon"), "busy");
  setBusy(shell, true, i18n.t("status.applyingNeon"));

  const draft = state.neon;
  const response = await client.execute("ae.style.neon", {
    // O host so aceita "editable" e "glowOnly"; o painel manda sempre
    // "editable", porque a camada sem texto ja cai sozinha no brilho apenas e
    // devolve o aviso. Um seletor para isso ofereceria uma escolha que o
    // proprio comando ja toma pelo tipo da camada.
    mode: "editable",
    coreColor: hexToChannels(draft.coreColor),
    glowColor: hexToChannels(draft.glowColor),
    strokeWidth: draft.strokeWidth,
    glowRadius: draft.glowRadius,
    intensity: draft.intensity
  });
  logger.recordResponse("ae.style.neon", response);
  if (response.ok) {
    shell.setStatus(i18n.t("message.neonApplied"), "ok");
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

  regions.content.appendChild(selectField(document, {
    id: "cloneKeys-destination", label: i18n.t("cloneKeys.destination"), value: state.cloneKeys.destination,
    options: (["after", "cti", "comp-end", "layer-end", "work-area-end"] as const).map(value => ({
      value, label: i18n.t(`cloneKeys.destination.${value}`)
    })),
    onChange: value => { state.cloneKeys.destination = value as CloneKeysDestination; shell.rerender(); }
  }));
  regions.content.appendChild(hint(document, i18n.t("message.cloneKeysInstructions")));
}

async function applyCloneKeys(shell: Shell, i18n: I18n, logger: MotionLogger, client: Client): Promise<void> {
  if (state.busy) return;
  shell.setStatus(i18n.t("status.applyingCloneKeys") || "Clonando chaves...", "busy");
  setBusy(shell, true, i18n.t("status.applyingCloneKeys"));

  const response = await client.execute("ae.keys.clone", {
    mode: state.cloneKeys.mode, destination: state.cloneKeys.destination
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
  if (state.context.selectionExpressibleCount < 1) {
    return i18n.t("message.quickNeedsExpressible");
  }
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
  if (!state.context.selectionLayerCount) return i18n.t("message.lookAtNeedsSelection");
  if (Object.values(state.lookAt.constrainAxes).every(Boolean)) return i18n.t("message.lookAtAllAxesLocked");
  return null;
}

function renderLookAt(regions: RenderRegions, i18n: I18n): void {
  const shell = regions.shell;
  const t = state.lookAt;

  // Removido o campo "Alvo" para simplificar a ferramenta e ser 1-clique

  regions.content.appendChild(
    selectField(document, {
      id: "lookAt-forwardAxis",
      label: i18n.t("lookAt.forwardAxis"),
      value: t.forwardAxis,
      options: [
        { value: "+z", label: i18n.t("lookAt.axis.zPos") },
        { value: "-z", label: i18n.t("lookAt.axis.zNeg") },
        { value: "+x", label: i18n.t("lookAt.axis.xPos") },
        { value: "-x", label: i18n.t("lookAt.axis.xNeg") },
        { value: "+y", label: i18n.t("lookAt.axis.yPos") },
        { value: "-y", label: i18n.t("lookAt.axis.yNeg") }
      ],
      onChange: (value) => {
        t.forwardAxis = value as LookAtAxis;
        shell.rerender();
      }
    })
  );

  for (const { index, axis, labelKey } of [
    { index: 0, axis: "x", labelKey: "lookAt.offset.x" },
    { index: 1, axis: "y", labelKey: "lookAt.offset.y" },
    { index: 2, axis: "z", labelKey: "lookAt.offset.z" }
  ] as const) {
    regions.content.appendChild(
      numberField(document, {
        id: `lookAt-offset-${axis}`,
        label: i18n.t(labelKey),
        value: t.offsetOrientation[index],
        min: -3600,
        max: 3600,
        step: 1,
        unit: i18n.t("lookAt.unit.degrees"),
        onCommit: (value) => {
          const offsetOrientation: [number, number, number] = [...t.offsetOrientation];
          offsetOrientation[index] = value;
          t.offsetOrientation = offsetOrientation;
          shell.rerender();
        }
      })
    );
  }

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
    offsetOrientation: [...state.lookAt.offsetOrientation],
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
  if (!state.context.selectionLayerCount) return i18n.t("message.orbitNeedsSelection");
  return null;
}

function renderOrbit(regions: RenderRegions, i18n: I18n): void {
  const shell = regions.shell;
  const t = state.orbit;

  regions.content.appendChild(sectionTitle(document, i18n.t("orbit.presets")));
  regions.content.appendChild(hint(document, i18n.t("message.orbitPresetInstructions")));
  const presets = createElement(document, "div", "ch-preset-variant-actions");
  presets.setAttribute("role", "group");
  presets.setAttribute("aria-label", i18n.t("orbit.presets"));
  const presetControls = ORBIT_PRESETS.map(preset => {
    const reason = orbitDisabledReason(i18n);
    const control = createActionButton(document, {
      id: `orbit-preset-${preset}`, label: i18n.t(`orbit.preset.${preset}`),
      variant: "secondary", disabled: Boolean(reason), ...(reason ? { disabledReason: reason } : {}),
      onPress: () => {
        if (orbitDisabledReason(i18n) || !wiringAtual) return;
        const draft = selectOrbitPreset(state.orbit, preset);
        const tool = TOOLS.find(candidate => candidate.id === "orbit");
        if (!tool) return;
        void applyQuickPreset(tool, "ae.3d.orbit", { derive: () => ({ ...draft, applyPreset: true }), liveControls: [] },
          shell, i18n, wiringAtual.logger, wiringAtual.client,
          { name: i18n.t(`orbit.preset.${preset}`), recentId: "orbit" });
      }
    });
    presets.appendChild(control.element);
    return control;
  });
  regions.content.appendChild(presets);
  refreshToolContext = () => {
    const reason = orbitDisabledReason(i18n);
    for (const control of presetControls) control.setDisabled(Boolean(reason), reason ?? undefined);
  };

  regions.content.appendChild(hint(document, i18n.t("message.orbitInstructions")));
  const advanced = createElement(document, "details", "ch-preset-adjustments") as HTMLDetailsElement;
  advanced.open = orbitAdvancedOpen;
  advanced.addEventListener("toggle", () => { orbitAdvancedOpen = advanced.open; });
  advanced.appendChild(createElement(document, "summary", "", i18n.t("orbit.advanced")));

  for (const campo of [
    { id: "radius", key: "orbit.radius", min: 1, max: 1000000, step: 1, unit: "orbit.unit.px" },
    { id: "speed", key: "orbit.speed", min: -36000, max: 36000, step: 1, unit: "orbit.unit.degreesPerSecond" },
    { id: "inclination", key: "orbit.inclination", min: -360, max: 360, step: 1, unit: "orbit.unit.degrees" },
    { id: "azimuth", key: "orbit.azimuth", min: -360, max: 360, step: 1, unit: "orbit.unit.degrees" },
    { id: "bank", key: "orbit.bank", min: -360, max: 360, step: 1, unit: "orbit.unit.degrees" },
    { id: "phase", key: "orbit.phase", min: -36000, max: 36000, step: 1, unit: "orbit.unit.degrees" },
    { id: "spread", key: "orbit.spread", min: 0, max: 100, step: 1, unit: "orbit.unit.percent" }
  ] as const) {
    advanced.appendChild(
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

  advanced.appendChild(
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

  advanced.appendChild(
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

  advanced.appendChild(
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

  regions.content.appendChild(advanced);
}

async function applyOrbit(shell: Shell, i18n: I18n, logger: MotionLogger, client: Client): Promise<void> {
  if (state.busy) return;

  const reason = orbitDisabledReason(i18n);
  if (reason) {
    state.lastError = reason;
    shell.setStatus(i18n.t("status.notCompleted"), "error");
    shell.rerender();
    return;
  }

  shell.setStatus(i18n.t("status.applyingOrbit"), "busy");
  setBusy(shell, true, i18n.t("status.applyingOrbit"));

  try {
    const response = await client.execute("ae.3d.orbit", { ...state.orbit }, { mode: "advanced", emitLiveControls: true, preserveSelection: true });
    logger.recordResponse("ae.3d.orbit", response);
    if (response.ok) {
      if (response.warnings.length) reportHostWarnings(response.warnings);
      shell.setStatus(i18n.t(state.orbit.bake ? "message.orbitBaked" : "message.orbitApplied"), "ok");
    } else reportFailure(shell, i18n, response);
  } catch {
    state.lastError = i18n.t("message.failureWithoutReason");
    shell.setStatus(state.lastError, "error");
  } finally { setBusy(shell, false); }
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
        min: 1,
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
    // O core é obrigatório; warnings indicam controles animados preservados.
    // O efeito continua editável diretamente no Effect Controls.
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
  if (t.operation === "create") return { command: "ae.parallax.create", response: await client.execute("ae.parallax.create", { ...state.parallax }) };
  // Adjust must execute the host's redistribution path. In Quick mode the
  // existing rig is intentionally reused without changes.
  if (t.operation === "adjust") return { command: "ae.parallax.adjust", response: await client.execute("ae.parallax.adjust", { ...state.parallax }, { mode: "advanced" }) };
  if (t.operation === "remove") return { command: "ae.parallax.remove", response: await client.execute("ae.parallax.remove", {}, { allowDestructive: true }) };
  if (["subtle", "truck", "vertical", "dolly"].includes(t.operation)) return {
    command: "ae.parallax.move", response: await client.execute("ae.parallax.move", { preset: t.operation, durationSeconds: 3 })
  };
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
        { value: "create", label: i18n.t("parallaxFull.op.create") },
        { value: "adjust", label: i18n.t("parallaxFull.op.adjust") },
        { value: "subtle", label: i18n.t("parallaxFull.op.subtle") },
        { value: "truck", label: i18n.t("parallaxFull.op.truck") },
        { value: "vertical", label: i18n.t("parallaxFull.op.vertical") },
        { value: "dolly", label: i18n.t("parallaxFull.op.dolly") },
        { value: "remove", label: i18n.t("parallaxFull.op.remove") },
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
    shell.setStatus(i18n.t(state.parallaxFull.operation === "remove" ? "message.parallaxRemoved" :
      ["subtle", "truck", "vertical", "dolly"].includes(state.parallaxFull.operation) ? "message.parallaxMotionApplied" :
      state.parallaxFull.operation === "create" ? "message.parallaxCreated" :
      state.parallaxFull.operation === "adjust" ? "message.parallaxAdjusted" : "message.parallaxFullApplied"), "ok");
  } else {
    reportFailure(shell, i18n, response);
  }
  setBusy(shell, false);
}

function renderUnifiedParallax(regions: RenderRegions, i18n: I18n): void {
  renderParallaxFull(regions, i18n);
  if (state.parallaxFull.operation === "create" || state.parallaxFull.operation === "adjust") renderParallax(regions, i18n);
}

function renderParallax(regions: RenderRegions, i18n: I18n): void {
  const shell = regions.shell;
  const t = state.parallax;

  for (const campo of [
    { id: "depthStep", key: "parallax.depthStep", min: 0, max: 100000, step: 10, unit: "parallax.unit.px" },
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


function vectorDisabledReason(i18n: I18n): string | null {
  if (state.busy) return state.busyReason ?? i18n.t("status.initializing");
  if (!state.context?.isComposition) return i18n.t("message.quickNoActiveComp");
  if (state.context.selectionLayerCount < 1) return i18n.t("message.quickNeedsLayers");
  return null;
}
function aiToVectorDisabledReason(i18n: I18n): string | null { return vectorDisabledReason(i18n); }
function renderAiToVector(regions: RenderRegions, i18n: I18n): void {
  const shell = regions.shell;
  regions.content.appendChild(checkboxField(document, { id: "field.aiToVector.keepOriginal", label: i18n.t("field.aiToVector.keepOriginal"), checked: state.aiToVector.keepOriginal, onChange: (val: boolean) => { state.aiToVector.keepOriginal = val; shell.rerender(); } }));
  regions.content.appendChild(hint(document, i18n.t("message.aiToVectorInstructions")));
}
async function applyAiToVector(shell: Shell, i18n: I18n, logger: MotionLogger, client: Client): Promise<void> {
  if (state.busy) return;
  setBusy(shell, true, i18n.t("status.applyingQuick", { tool: i18n.t("tool.aiToVector.name") }));
  const response = await client.execute("ae.vector.ai-to-vector", { keepOriginal: state.aiToVector.keepOriginal });
  logger.recordResponse("ae.vector.ai-to-vector", response);
  if (response.ok) { shell.setStatus(i18n.t("message.aiToVectorApplied"), "ok"); } else { reportFailure(shell, i18n, response); }
  setBusy(shell, false);
}

function textToVectorDisabledReason(i18n: I18n): string | null { return vectorDisabledReason(i18n); }
function renderTextToVector(regions: RenderRegions, i18n: I18n): void {
  const shell = regions.shell;
  regions.content.appendChild(checkboxField(document, { id: "field.textToVector.keepOriginal", label: i18n.t("field.textToVector.keepOriginal"), checked: state.textToVector.keepOriginal, onChange: (val: boolean) => { state.textToVector.keepOriginal = val; shell.rerender(); } }));
  regions.content.appendChild(hint(document, i18n.t("message.textToVectorInstructions")));
}
async function applyTextToVector(shell: Shell, i18n: I18n, logger: MotionLogger, client: Client): Promise<void> {
  if (state.busy) return;
  setBusy(shell, true, i18n.t("status.applyingQuick", { tool: i18n.t("tool.textToVector.name") }));
  const response = await client.execute("ae.vector.text-to-vector", { keepOriginal: state.textToVector.keepOriginal });
  logger.recordResponse("ae.vector.text-to-vector", response);
  if (response.ok) { shell.setStatus(i18n.t("message.textToVectorApplied"), "ok"); } else { reportFailure(shell, i18n, response); }
  setBusy(shell, false);
}

function particlesDisabledReason(i18n: I18n): string | null {
  if (state.busy) return state.busyReason ?? i18n.t("status.initializing");
  if (!state.context?.isComposition) return i18n.t("message.quickNoActiveComp");
  return null;
}
function renderParticles(regions: RenderRegions, i18n: I18n): void {
  const shell = regions.shell;
  regions.content.appendChild(numberField(document, { id: "field.particles.birthRate", label: i18n.t("field.particles.birthRate"), value: state.particles.birthRate, min: 0.1, max: 10, step: 0.1, onCommit: (val: number) => { state.particles.birthRate = val; shell.rerender(); }}));
  regions.content.appendChild(numberField(document, { id: "field.particles.longevity", label: i18n.t("field.particles.longevity"), value: state.particles.longevity, min: 0.1, max: 10, step: 0.1, onCommit: (val: number) => { state.particles.longevity = val; shell.rerender(); }}));
  regions.content.appendChild(numberField(document, { id: "field.particles.velocity", label: i18n.t("field.particles.velocity"), value: state.particles.velocity, min: 0, max: 5, step: 0.1, onCommit: (val: number) => { state.particles.velocity = val; shell.rerender(); }}));
  regions.content.appendChild(hint(document, i18n.t("message.particlesInstructions")));
}
async function applyParticles(shell: Shell, i18n: I18n, logger: MotionLogger, client: Client): Promise<void> {
  if (state.busy) return;
  setBusy(shell, true, i18n.t("status.applyingQuick", { tool: i18n.t("tool.particles.name") }));
  const response = await client.execute("ae.effect.particles", { birthRate: state.particles.birthRate, longevity: state.particles.longevity, velocity: state.particles.velocity });
  logger.recordResponse("ae.effect.particles", response);
  if (response.ok) { shell.setStatus(i18n.t("message.particlesApplied"), "ok"); } else { reportFailure(shell, i18n, response); }
  setBusy(shell, false);
}

function textureDisabledReason(i18n: I18n): string | null {
  if (state.busy) return state.busyReason ?? i18n.t("status.initializing");
  if (!state.context?.isComposition) return i18n.t("message.quickNoActiveComp");
  return null;
}
function renderTexture(regions: RenderRegions, i18n: I18n): void {
  const shell = regions.shell;
  regions.content.appendChild(numberField(document, { id: "field.texture.opacity", label: i18n.t("field.texture.opacity"), value: state.texture.opacity, min: 0, max: 100, step: 1, onCommit: (val: number) => { state.texture.opacity = val; shell.rerender(); }}));
  regions.content.appendChild(hint(document, i18n.t("message.textureInstructions")));
}
async function applyTexture(shell: Shell, i18n: I18n, logger: MotionLogger, client: Client): Promise<void> {
  if (state.busy) return;
  setBusy(shell, true, i18n.t("status.applyingQuick", { tool: i18n.t("tool.texture.name") }));
  const response = await client.execute("ae.asset.texture", { blendMode: state.texture.blendMode, opacity: state.texture.opacity });
  logger.recordResponse("ae.asset.texture", response);
  if (response.ok) { shell.setStatus(i18n.t("message.textureApplied"), "ok"); } else { reportFailure(shell, i18n, response); }
  setBusy(shell, false);
}

function cleanDisabledReason(i18n: I18n): string | null {
  if (state.busy) return state.busyReason ?? i18n.t("status.initializing");
  if (state.clean.scanToken && state.clean.selectedItemIds.length === 0) return i18n.t("message.clean.selectManaged");
  return null;
}
function renderClean(regions: RenderRegions, i18n: I18n): void {
  const shell = regions.shell;
  if (!state.clean.scanToken) {
    regions.content.appendChild(hint(document, i18n.t("message.cleanInstructions")));
    return;
  }
  regions.content.appendChild(hint(document, i18n.t("message.clean.previewCount", { count: state.clean.findings.length })));
  if (state.clean.findings.length === 0) regions.content.appendChild(hint(document, i18n.t("message.clean.none")));
  for (const finding of state.clean.findings) {
    if (finding.origin === "managed" && finding.id !== null) {
      const id = finding.id;
      regions.content.appendChild(checkboxField(document, {
        id: "clean-item-" + id,
        label: i18n.t("message.clean.managedItem", { name: finding.name }),
        checked: state.clean.selectedItemIds.includes(id),
        onChange: (checked) => {
          state.clean.selectedItemIds = checked
            ? state.clean.selectedItemIds.concat(id)
            : state.clean.selectedItemIds.filter(value => value !== id);
          shell.rerender();
        }
      }));
    } else {
      regions.content.appendChild(hint(document, i18n.t("message.clean.externalItem", { name: finding.name })));
    }
  }
  regions.content.appendChild(button(document, {
    label: i18n.t("action.clean.refresh"),
    onClick: () => void refreshCleanPreview()
  }));
}
async function applyClean(shell: Shell, i18n: I18n, logger: MotionLogger, client: Client): Promise<void> {
  if (state.busy) return;
  if (!state.clean.scanToken) { await scanClean(shell, i18n, logger, client); return; }
  if (state.clean.selectedItemIds.length === 0) return;
  setBusy(shell, true, i18n.t("status.clean.removing"));
  const response = await client.execute("ae.project.clean", {
    removeConfirmed: true,
    selectedItemIds: state.clean.selectedItemIds.slice(),
    scanToken: state.clean.scanToken
  }, { allowDestructive: true });
  logger.recordResponse("ae.project.clean", response);
  if (response.ok) {
    const removed = response.data && typeof response.data === "object" && "removedCount" in response.data
      ? Number(response.data.removedCount) : 0;
    state.clean = { scanToken: null, findings: [], selectedItemIds: [] };
    shell.setStatus(i18n.t("message.clean.removed", { count: removed }), "ok");
  } else {
    state.clean = { scanToken: null, findings: [], selectedItemIds: [] };
    reportFailure(shell, i18n, response);
  }
  setBusy(shell, false);
}

async function refreshCleanPreview(): Promise<void> {
  const wiring = wiringAtual;
  if (!wiring) return;
  await scanClean(wiring.shell, wiring.i18n, wiring.logger, wiring.client);
}

function isCleanPreviewData(data: unknown): data is { scanToken: string; findings: CleanFinding[] } {
  if (!data || typeof data !== "object") return false;
  const candidate = data as Record<string, unknown>;
  return typeof candidate.scanToken === "string" && candidate.scanToken.length > 0 &&
    Array.isArray(candidate.findings) && candidate.findings.every((item: unknown) => {
      if (!item || typeof item !== "object") return false;
      const finding = item as Record<string, unknown>;
      return (finding.id === null || (typeof finding.id === "number" && Number.isInteger(finding.id) && finding.id > 0)) &&
        typeof finding.name === "string" &&
        (finding.origin === "managed" || finding.origin === "external") &&
        (finding.risk === "low" || finding.risk === "high");
    });
}

async function scanClean(shell: Shell, i18n: I18n, logger: MotionLogger, client: Client): Promise<void> {
  if (state.busy) return;
  state.clean = { scanToken: null, findings: [], selectedItemIds: [] };
  setBusy(shell, true, i18n.t("status.clean.scanning"));
  const response = await client.execute("ae.project.clean", { removeConfirmed: false });
  logger.recordResponse("ae.project.clean", response);
  if (response.ok && isCleanPreviewData(response.data)) {
    state.clean = { scanToken: response.data.scanToken, findings: response.data.findings, selectedItemIds: [] };
    shell.setStatus(i18n.t("message.clean.scanReady"), "ok");
  } else if (response.ok) {
    shell.setStatus(i18n.t("message.clean.invalidPreview"), "error");
  } else {
    reportFailure(shell, i18n, response);
  }
  setBusy(shell, false);
}

function textEffectsDisabledReason(kind: TextEffectKind, command: string, i18n: I18n): string | null {
  if (state.busy) return state.busyReason ?? i18n.t("status.initializing");
  if (!state.context?.isComposition) return i18n.t("message.textBoxNoActiveComp");
  if (!state.context.selectionLayerCount) return i18n.t("textEffects.needsSelection");
  if (kind === "wordReveal") {
    const readReason = wordRevealDisabledReason(i18n, state.activeTool === "wordReveal" && wiringAtual?.shell.activeView() === "tools");
    if (readReason) return readReason;
  }
  if (kind === "variableMorph") {
    const readReason = variableMorphDisabledReason(i18n, state.activeTool === "variableMorph" && wiringAtual?.shell.activeView() === "tools");
    if (readReason) return readReason;
  }
  if (!validTextEffect(kind, command)) return i18n.t("textEffects.invalid");
  return null;
}

function verticalPulseDisabledReason(i18n: I18n): string | null {
  if (state.busy) return state.busyReason ?? i18n.t("status.initializing");
  if (!state.context?.isComposition) return i18n.t("verticalPulse.noActiveComp");
  if (!state.context.selectionLayerCount) return i18n.t("verticalPulse.needsText");
  const editor = state.activeTool === "verticalPulse" && wiringAtual?.shell.activeView() === "tools";
  if (editor && (verticalPulseReadingKey !== null || verticalPulseReadContextKey !== contextFingerprint(state.context))) return i18n.t("verticalPulse.reading");
  if (editor) {
    const readReason = verticalPulseReadDisabledReason(i18n, state.context.compFrameRate, true);
    if (readReason) return readReason;
    if (!validVerticalPulse(state.context.compFrameRate)) return i18n.t("textEffects.invalid");
  }
  return null;
}

async function applyVerticalPulse(shell: Shell, i18n: I18n, logger: MotionLogger, client: Client): Promise<void> {
  if (state.busy) return;
  const reason = verticalPulseDisabledReason(i18n);
  if (reason) { state.lastError = reason; shell.rerender(); return; }
  const action = verticalPulseAction(state.context?.compFrameRate ?? null);
  const args = verticalPulseArgs(state.context?.compFrameRate ?? null);
  setBusy(shell, true, i18n.t(action === "bake" ? "verticalPulse.baking" : action === "update" ? "verticalPulse.updating" : "verticalPulse.applying"));
  try {
    const response = await client.execute("ae.text.vertical-pulse", args, { preserveSelection: true });
    logger.recordResponse("ae.text.vertical-pulse", response);
    if (!response.ok) reportFailure(shell, i18n, response);
    else {
      state.lastError = null;
      if (response.warnings.length) reportHostWarnings(response.warnings);
      shell.setStatus(i18n.t(action === "remove" ? "verticalPulse.removed" : action === "bake" ? "verticalPulse.baked"
        : action === "update" ? "verticalPulse.updated" : "verticalPulse.applied"), "ok");
      // The mutation may have changed engines or lifecycle state. Keep Apply
      // blocked if its following read rejects or throws before hydration.
      markVerticalPulseReadFailed();
      const selected = await client.execute("ae.text.vertical-pulse.read", {});
      logger.recordResponse("ae.text.vertical-pulse.read", selected);
      if (selected.ok && isVerticalPulseReadData(selected.data)) {
        hydrateVerticalPulse(selected.data, state.context?.compFrameRate ?? null);
        verticalPulseReadContextKey = contextFingerprint(state.context);
      } else {
        markVerticalPulseReadFailed();
        if (!selected.ok) reportFailure(shell, i18n, selected);
        else { state.lastError = i18n.t("verticalPulse.readInvalid"); shell.setStatus(state.lastError, "error"); }
      }
    }
  } catch {
    state.lastError = i18n.t("message.failureWithoutReason");
    shell.setStatus(state.lastError, "error");
  } finally { setBusy(shell, false); }
}

let verticalPulseReadSequence = 0;
let verticalPulseReadContextKey: string | null = null;
let verticalPulseReadingKey: string | null = null;
/** Automatic selection reads stay silent and never overwrite edits made while awaiting the host. */
async function refreshVerticalPulseControls(): Promise<void> {
  const wiring = wiringAtual;
  if (!wiring || state.busy) return;
  const { shell, i18n, logger, client } = wiring;
  const signature = contextFingerprint(state.context);
  if (verticalPulseReadingKey === signature) return;
  const sequence = ++verticalPulseReadSequence, revision = verticalPulseRevision();
  verticalPulseReadingKey = signature;
  const isCurrent = (): boolean => sequence === verticalPulseReadSequence && signature === contextFingerprint(state.context)
    && state.activeTool === "verticalPulse" && shell.activeView() === "tools";
  try {
    const response = await client.execute("ae.text.vertical-pulse.read", {});
    logger.recordResponse("ae.text.vertical-pulse.read", response);
    if (!isCurrent()) return;
    if (!response.ok) { verticalPulseReadContextKey = signature; markVerticalPulseReadFailed(); reportFailure(shell, i18n, response); }
    else if (!isVerticalPulseReadData(response.data)) {
      verticalPulseReadContextKey = signature; markVerticalPulseReadFailed(); state.lastError = i18n.t("verticalPulse.readInvalid"); shell.setStatus(state.lastError, "error");
    } else if (hydrateVerticalPulse(response.data, state.context?.compFrameRate ?? null, revision)) {
      verticalPulseReadContextKey = signature; state.lastError = null;
    } else {
      verticalPulseReadContextKey = signature; markVerticalPulseReadFailed();
    }
  } catch {
    if (isCurrent()) { verticalPulseReadContextKey = signature; markVerticalPulseReadFailed(); state.lastError = i18n.t("verticalPulse.readInvalid"); shell.setStatus(state.lastError, "error"); }
  } finally {
    if (sequence === verticalPulseReadSequence) verticalPulseReadingKey = null;
    if (isCurrent()) shell.rerender();
  }
}

async function applyTextEffect(kind: TextEffectKind, command: string, shell: Shell, i18n: I18n, logger: MotionLogger, client: Client): Promise<void> {
  if (state.busy) return;
  const reason = textEffectsDisabledReason(kind, command, i18n);
  if (reason) { state.lastError = reason; shell.rerender(); return; }
  setBusy(shell, true, i18n.t("textEffects.applying"));
  try {
    const args = textEffectArgs(kind);
    let preserveSelection = kind === "wordReveal";
    if (kind === "variableMorph") {
      const selected = await client.execute("ae.text.variable-morph.read", {});
      logger.recordResponse("ae.text.variable-morph.read", selected);
      if (!selected.ok) { reportFailure(shell, i18n, selected); return; }
      if (!isVariableMorphReadData(selected.data)) { markVariableMorphReadFailed(); shell.setStatus(i18n.t("proximityMorph.readInvalid"), "error"); return; }
      preserveSelection = args.action !== "apply" || selected.data.rigVersion > 0;
    }
    const response = await client.execute(command, args, { preserveSelection });
    logger.recordResponse(command, response);
    if (!response.ok) reportFailure(shell, i18n, response);
    else {
      state.lastError = null;
      shell.setStatus(i18n.t(args.action === "remove" ? "textEffects.removed" : args.action === "bake" ? kind === "variableMorph" ? "proximityMorph.baked" : "wordReveal.baked"
        : args.action === "sweep" ? "proximityMorph.swept" : kind === "variableMorph" && args.action === "update" ? "proximityMorph.updated" : "textEffects.applied"), "ok");
      if (kind === "wordReveal") {
        const selected = await client.execute("ae.text.word-reveal.read", {});
        logger.recordResponse("ae.text.word-reveal.read", selected);
        if (selected.ok && isWordRevealReadData(selected.data)) hydrateWordReveal(selected.data);
      }
      if (kind === "variableMorph") {
        const selected = await client.execute("ae.text.variable-morph.read", {});
        logger.recordResponse("ae.text.variable-morph.read", selected);
        if (selected.ok && isVariableMorphReadData(selected.data)) hydrateVariableMorph(selected.data);
      }
    }
  } catch {
    state.lastError = i18n.t("message.failureWithoutReason");
    shell.setStatus(state.lastError, "error");
  } finally { setBusy(shell, false); }
}

let wordRevealReadSequence = 0;
let variableMorphReadSequence = 0;
async function refreshVariableMorphControls(): Promise<void> {
  const wiring = wiringAtual;
  if (!wiring || state.busy) return;
  const { shell, i18n, logger, client } = wiring;
  const sequence = ++variableMorphReadSequence;
  const signature = contextFingerprint(state.context);
  setBusy(shell, true, i18n.t("proximityMorph.reading"));
  const isCurrent = (): boolean => sequence === variableMorphReadSequence && signature === contextFingerprint(state.context)
    && state.activeTool === "variableMorph" && shell.activeView() === "tools";
  try {
    const response = await client.execute("ae.text.variable-morph.read", {});
    logger.recordResponse("ae.text.variable-morph.read", response);
    if (!isCurrent()) return;
    if (!response.ok) { markVariableMorphReadFailed(); reportFailure(shell, i18n, response); }
    else if (!isVariableMorphReadData(response.data)) {
      markVariableMorphReadFailed(); state.lastError = i18n.t("proximityMorph.readInvalid"); shell.setStatus(state.lastError, "error");
    } else {
      hydrateVariableMorph(response.data, Math.max(1, Math.min(5000, 250 * (state.context?.compHeight ?? 1080) / 1080)));
      state.lastError = null;
    }
  } catch {
    if (isCurrent()) { markVariableMorphReadFailed(); state.lastError = i18n.t("proximityMorph.readInvalid"); shell.setStatus(state.lastError, "error"); }
  } finally { if (sequence === variableMorphReadSequence) setBusy(shell, false); }
}
async function refreshWordRevealControls(): Promise<void> {
  const wiring = wiringAtual;
  if (!wiring || state.busy) return;
  const { shell, i18n, logger, client } = wiring;
  const sequence = ++wordRevealReadSequence;
  const signature = contextFingerprint(state.context);
  setBusy(shell, true, i18n.t("wordReveal.reading"));
  try {
    const response = await client.execute("ae.text.word-reveal.read", {});
    logger.recordResponse("ae.text.word-reveal.read", response);
    if (sequence !== wordRevealReadSequence || signature !== contextFingerprint(state.context) || state.activeTool !== "wordReveal") return;
    if (!response.ok) { markWordRevealReadFailed(); reportFailure(shell, i18n, response); }
    else if (!isWordRevealReadData(response.data)) {
      markWordRevealReadFailed(); state.lastError = i18n.t("wordReveal.readInvalid"); shell.setStatus(state.lastError, "error");
    } else { hydrateWordReveal(response.data); state.lastError = null; }
  } catch { markWordRevealReadFailed(); state.lastError = i18n.t("wordReveal.readInvalid"); shell.setStatus(state.lastError, "error"); }
  finally { if (sequence === wordRevealReadSequence) setBusy(shell, false); }
}
