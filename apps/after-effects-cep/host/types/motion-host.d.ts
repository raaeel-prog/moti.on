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
