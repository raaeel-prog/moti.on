/**
 * Globais que os módulos da camada de host penduram em `$.global`.
 *
 * O ExtendScript não tem sistema de módulos: `scripts/build-extendscript.mjs`
 * concatena os arquivos numa ordem declarada, e cada um se expõe por um global.
 * Estas declarações são o que torna essa comunicação verificável — sem elas,
 * `MotionJson.parse` num arquivo seria apenas um nome desconhecido, e um erro de
 * digitação só apareceria dentro do After Effects.
 *
 * A ordem de carregamento está em `HOST_SOURCE_ORDER`. Um módulo que use um
 * global declarado depois dele compila aqui mas falha no host, e é por isso que
 * a ordem é lista literal e não glob.
 */

/**
 * Códigos de erro, gerados a partir de `packages/contracts/src/errors.ts`.
 *
 * Declarados um a um, e não como `Record<string, string>`: com
 * `noUncheckedIndexedAccess` ligado, o Record faria `ERROR.INTERNAL_ERROR` ter
 * tipo `string | undefined`, e todo uso precisaria de uma checagem de nulo que
 * nunca dispara. Listar as chaves dá o tipo certo e faz um código escrito errado
 * falhar na compilação em vez de virar `undefined` dentro do host.
 */
type MotionErrorCodes = {
  readonly NO_ACTIVE_PROJECT: string;
  readonly NO_ACTIVE_COMP: string;
  readonly NO_ACTIVE_SEQUENCE: string;
  readonly NO_SELECTION: string;
  readonly INVALID_SELECTION_TYPE: string;
  readonly UNSUPPORTED_HOST_VERSION: string;
  readonly CAPABILITY_UNAVAILABLE: string;
  readonly PERMISSION_DENIED: string;
  readonly NETWORK_UNAVAILABLE: string;
  readonly PROVIDER_ERROR: string;
  readonly LICENSE_REQUIRED: string;
  readonly MODEL_NOT_INSTALLED: string;
  readonly NATIVE_SERVICE_UNAVAILABLE: string;
  readonly INVALID_PRESET: string;
  readonly EXPRESSION_CONFLICT: string;
  readonly KEYFRAME_CONFLICT: string;
  readonly TRACK_CONFLICT: string;
  readonly ASSET_LICENSE_BLOCKED: string;
  readonly USER_CANCELLED: string;
  readonly HOST_OPERATION_FAILED: string;
  readonly ROLLBACK_FAILED: string;
  readonly INTERNAL_ERROR: string;
};

declare const MotionContracts: {
  readonly PROTOCOL_VERSION: number;
  readonly ERROR: MotionErrorCodes;
  readonly ERROR_RECOVERABLE: Record<string, boolean>;
  readonly ERROR_ACTION: Record<string, string>;
  readonly META_OPEN: string;
  readonly META_CLOSE: string;
  readonly RIG_PREFIX: string;
  readonly META_OPEN: string;
  readonly META_CLOSE: string;
  readonly PLUGIN_VERSION?: string;
  readonly EXPRESSION_HEADER: string;
};

interface MotionHostDescriptor {
  id: string;
  requirements: string[];
  destructive: boolean;
  mutates: boolean;
  allowsNoopSuccess: boolean;
  supportsDryRun: boolean;
  undoLabelKey: string;
  undoLabels: Record<string, string>;
}

declare const MotionDescriptors: Record<string, MotionHostDescriptor> & {
  __undoLabelFor(descriptor: MotionHostDescriptor, locale: string | null | undefined): string;
};

declare const MotionJson: {
  parse(text: string): unknown;
  stringify(value: unknown): string;
  readonly MAX_DEPTH: number;
  readonly MAX_INPUT_LENGTH: number;
};

declare const MotionTransform: {
  /**
   * Matriz 3x3 linha-maior que leva um vetor do espaco da camada ao espaco
   * do pai. Serve 2D e 3D pelo mesmo caminho.
   */
  linearMatrix(layer: Layer): number[];
  multiply(a: number[], b: number[]): number[];
  apply(matrix: number[], vector: number[]): number[];
  /** Decompoe `Rx . Ry . Rz` de volta em angulos, em graus. */
  eulerFromMatrix(m: number[]): number[];
  /** Caminho de ida que `eulerFromMatrix` desfaz. */
  matrixFromEuler(euler: readonly number[]): number[];
  rotX(graus: number): number[];
  rotY(graus: number): number[];
  rotZ(graus: number): number[];
  readonly IDENTITY: number[];
};

declare const MotionUndo: {
  withUndoGroup<T>(label: string, callback: () => T): T;
};

declare const MotionExpressions: {
  renderLoopOut(tokens: {
    type: unknown;
    numKeyframes: unknown;
    duration: unknown;
    useDuration: unknown;
  }): string;
  isManagedLoopOut(source: string): boolean;
  renderSmooth(tokens: {
    widthSeconds: unknown;
    samples: unknown;
    referenceTime: unknown;
  }): string;
  isManagedSmooth(source: string): boolean;
  renderWiggle(tokens: {
    frequency: unknown;
    amplitude: unknown;
    octaves: unknown;
    amplitudeMultiplier: unknown;
    seed: unknown;
  }): string;
  isManagedWiggle(source: string): boolean;
  renderFlicker(tokens: {
    rate: unknown;
    minFactor: unknown;
    maxFactor: unknown;
    seed: unknown;
  }): string;
  isManagedFlicker(source: string): boolean;
  renderTextBoxSize(tokens: { paddingX: unknown; paddingY: unknown }): string;
  isManagedTextBoxSize(source: string): boolean;
  /** Sem tokens: o centro do bounding box nao depende de padding. */
  renderTextBoxPosition(): string;
  isManagedTextBoxPosition(source: string): boolean;
  /**
   * Sondas temporarias de posicionamento; nunca persistidas.
   *
   * `toWorld` quando o destino e uma camada 3D, `toComp` quando e 2D: numa
   * camada 3D o `toComp` devolve a posicao projetada pela camera.
   */
  renderAnchorAverageProbe(indices: readonly number[], toWorld: boolean): string;
  renderBoundsCenterProbe(indices: readonly number[], toWorld: boolean): string;
  renderTimeController(tokens: {
    offsetFrames?: unknown;
    speedPercent?: unknown;
    reverse?: unknown;
    freeze?: unknown;
    freezeFrame?: unknown;
  }): string;
  isManagedTimeController(source: string): boolean;
  renderMarkerLoop(tokens: {
    inMarkerName: string;
    outMarkerName: string;
    loopType: string;
    clampToLayer: boolean;
  }): string;
  isManagedMarkerLoop(source: string): boolean;
  renderKinetic(tokens: {
    durationFrames: unknown;
    overshoot: unknown;
    direction: unknown;
    delayFrames: unknown;
  }): string;
  isManagedKinetic(source: string): boolean;
  renderInertial(tokens: {
    amplitude: unknown;
    frequency: unknown;
    decay: unknown;
    maxDurationFrames: unknown;
    startMode: unknown;
  }): string;
  isManagedInertial(source: string): boolean;
  renderLookAt(tokens: {
    targetLayerName: unknown;
    forwardAxis: unknown;
    offsetOrientation: unknown;
    constrainAxes: unknown;
  }): string;
  isManagedLookAt(source: string): boolean;
  lookAtSupportedAxes(): readonly string[];
  renderOrbit(tokens: { radius: unknown; speed: unknown; inclination: unknown; phase: unknown }): string;
  isManagedOrbit(source: string): boolean;
  renderOrbitFacing(): string;
  isManagedOrbitFacing(source: string): boolean;
  renderWave(tokens: { amplitude: unknown; frequency: unknown; phase: unknown; direction: unknown }): string;
  isManagedWave(source: string): boolean;
  renderGlitchDisplacement(tokens: { amount: unknown; frequency: unknown; seed: unknown }): string;
  isManagedGlitchDisplacement(source: string): boolean;
  renderEffector(tokens: {
    controllerName: unknown;
    radiusEffectName: unknown;
    amountEffectName: unknown;
    falloffCurve: unknown;
    curve: unknown;
    target: unknown;
  }): string;
  isManagedEffector(source: string): boolean;
  renderParallaxFocus(tokens: { targetLayerName: unknown; focusOffset: unknown }): string;
  isManagedParallaxFocus(source: string): boolean;
  renderParallaxWiggle(tokens: { controllerName: unknown; seed: unknown }): string;
  isManagedParallaxWiggle(source: string): boolean;
  /** Nomes dos sliders que o wiggle cria no controller, para o comando e o teste lerem do mesmo lugar. */
  parallaxWiggleSliderNames: { frequency: string; amplitude: string };
};

/** Camera nativa. Ja e 3D por natureza, e por isso o Look At a aceita sem exigir threeDLayer. */
declare class CameraLayer extends Layer {}

/** After Effects built-in MarkerValue constructor. */
declare class MarkerValue {
  constructor(comment?: string, chapter?: string, url?: string, frameTarget?: string);
  comment: string;
  chapter: string;
  url: string;
  frameTarget: string;
  duration: number;
}

interface MotionCapturedEase {
  speed: number;
  influence: number;
}

interface MotionCapturedSpatialKey {
  inTangent: unknown;
  outTangent: unknown;
  continuous: boolean;
  autoBezier: boolean;
}

interface MotionCapturedKey {
  time: number;
  value: unknown;
  inInterpolation: unknown;
  outInterpolation: unknown;
  inEase: MotionCapturedEase[];
  outEase: MotionCapturedEase[];
  temporalContinuous: boolean;
  temporalAutoBezier: boolean;
  roving: boolean;
  selected: boolean;
  label?: number;
  spatial: MotionCapturedSpatialKey | null;
}

interface MotionPropertySnapshot {
  property: Property;
  spatial: boolean;
  supportsLabels: boolean;
  keys: MotionCapturedKey[];
}

/** Adapter compartilhado de snapshot/restore do CHMS-016. */
/** Operacoes comuns sobre efeitos nativos, compartilhadas por Echo, Glitch, Wave e Tile. */
declare const MotionEffects: {
  readonly PARADE: string;
  parade(layer: unknown): PropertyGroup | null;
  findManaged(lista: PropertyGroup, matchName: string, nomeGerenciado: string): PropertyGroup | null;
  findAny(lista: PropertyGroup, matchName: string): PropertyGroup | null;
  add(lista: PropertyGroup, matchName: string, nomeGerenciado: string): PropertyGroup;
  setStatic(property: Property, valor: unknown): void;
  snapshot(
    efeito: PropertyGroup,
    parametros: readonly string[]
  ): { efeito: PropertyGroup; nome: string; valores: Array<Record<string, unknown>> };
  restore(anterior: { efeito: PropertyGroup; nome: string; valores: Array<Record<string, unknown>> }): void;
};

type MotionLiveControlKind = "slider" | "angle" | "color" | "checkbox" | "point" | "dropdown";
type MotionLiveControlTarget = "layer" | "controller" | "comp-controller";
type MotionLiveControlTargetKind = MotionLiveControlTarget | "camera-controller";

interface MotionLiveControlBindingHost {
  paramId: string;
  label: Record<string, string>;
  control: MotionLiveControlKind;
  target: MotionLiveControlTarget;
  order: number;
  help: Record<string, string>;
  unit?: "px" | "%" | "°" | "fps" | "frames" | "s" | "x" | "none";
  min?: number;
  max?: number;
  softMin?: number;
  softMax?: number;
  step?: number;
  options?: Array<{ value: number; label: Record<string, string> }>;
}

interface MotionLiveControlsConfig {
  rigId: string;
  tool: string;
  locale: string;
  targetKind: MotionLiveControlTargetKind;
  bindings: MotionLiveControlBindingHost[];
  values: Record<string, unknown>;
}

interface MotionLiveControlRecord extends Record<string, unknown> {
  schemaVersion: 1;
  paramId: string;
  name: string;
  matchName: string;
  index: number;
  control: MotionLiveControlKind;
  actualControl: MotionLiveControlKind;
  target: MotionLiveControlTarget;
  order: number;
  locale: string;
  lastAppliedValue: unknown;
  unit?: string;
  min?: number;
  max?: number;
  optionValues?: number[];
  fallback?: "dropdown-as-slider";
}

interface MotionLiveControlWarning extends Record<string, unknown> {
  code: string;
  message: string;
}

/** Infraestrutura interna de Expression Controls do CHMS-UX-006. */
declare const MotionLiveControls: {
  readonly MATCH_NAMES: Record<MotionLiveControlKind, string>;
  readonly LAYER_LIMIT: 12;
  readonly CONTROLLER_LIMIT: 24;
  create(
    layer: unknown,
    config: MotionLiveControlsConfig
  ): { records: MotionLiveControlRecord[]; warnings: MotionLiveControlWarning[] };
  read(
    layer: unknown,
    records: MotionLiveControlRecord[]
  ): {
    values: Record<string, unknown>;
    records: MotionLiveControlRecord[];
    entries: Array<Record<string, unknown>>;
    warnings: MotionLiveControlWarning[];
    fingerprint: string;
  };
  update(
    layer: unknown,
    config: MotionLiveControlsConfig,
    records: MotionLiveControlRecord[],
    options?: { overwriteUserOverrides?: boolean }
  ): {
    records: MotionLiveControlRecord[];
    orphanedRecords: MotionLiveControlRecord[];
    warnings: MotionLiveControlWarning[];
    userOverrides: Record<string, unknown>;
    values: Record<string, unknown>;
  };
  relink(
    layer: unknown,
    record: MotionLiveControlRecord,
    effectIndex: number,
    expressionProperties: Property[],
    renderer: (record: MotionLiveControlRecord) => string
  ): { record: MotionLiveControlRecord; warnings: MotionLiveControlWarning[] };
  expressionReference(record: MotionLiveControlRecord): string;
  planPlacement(context: {
    selectionCount?: number;
    cameraRig?: boolean;
    compRig?: boolean;
    existingControlCount?: number;
    requestedControlCount?: number;
  }): { targetKind: MotionLiveControlTargetKind; warnings: MotionLiveControlWarning[] };
};

/** Bloco de metadata de rig no comentario da camada, compartilhado pelos rigs. */
declare const MotionRigMeta: {
  write(comentario: unknown, bloco: string): string;
  has(comentario: unknown, rigType: string): boolean;
  findController(comp: CompItem, rigType: string): Layer | null;
  findMembers(comp: CompItem, controller: Layer): Layer[];
};

declare const MotionKeyframes: {
  readonly MAX_KEYS_PER_BATCH: number;
  isSupportedProperty(property: Property): boolean;
  captureProperty(property: Property): MotionPropertySnapshot;
  restoreProperty(snapshot: MotionPropertySnapshot, overrideTimes: number[] | null): void;
  removeIndicesDescending(property: Property, indices: number[]): void;
  curveToEase(
    curva: { x1: number; y1: number; x2: number; y2: number },
    duracaoSegundos: number,
    diferencaDeValor: number
  ): { outSpeed: number; outInfluence: number; inSpeed: number; inInfluence: number };
  describeProperty(comp: CompItem, property: Property): {
    id: string;
    layerIndex: number;
    layerName: string;
    propertyName: string;
  };
};

/** Erro tipado que um `preflight` devolve para recusar o comando. */
interface MotionCommandFailure {
  code: string;
  message: string;
  recoverable: boolean;
  action?: string;
  details: unknown;
}

/** O que um `run` devolve ao dispatcher. */
interface MotionCommandResult {
  /**
   * O comando aplicou a alteração esperada?
   *
   * Só faz sentido para comando que muta, e é o dispatcher que usa: um comando
   * mutante que devolve `false` aqui nunca responde `ok: true`.
   */
  changed: boolean;
  warnings: Array<{ code: string; message: string; details: unknown }>;
  data: Record<string, unknown>;
}

interface MotionCommandHandler {
  preflight(args: Record<string, unknown>, context: Record<string, unknown>): MotionCommandFailure | null;
  run(args: Record<string, unknown>, context: Record<string, unknown>): MotionCommandResult;
}

declare const MotionRegistry: {
  register(id: string, handler: MotionCommandHandler): void;
  get(id: string): MotionCommandHandler | null;
  ids(): string[];
};
