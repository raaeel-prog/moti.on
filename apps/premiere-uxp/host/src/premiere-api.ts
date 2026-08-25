/**
 * Subconjunto tipado do módulo `premierepro`.
 *
 * Declarado aqui, e não importado em runtime: o módulo é fornecido pelo Premiere.
 * O pacote oficial de tipos existe, mas este workspace ainda não o declara como
 * dependência direta; manter o subconjunto usado deixa a fronteira auditável sem
 * transformar uma dependência transitiva em contrato acidental.
 *
 * **Toda assinatura abaixo foi verificada contra a referência oficial da Adobe**
 * em 2026-08-24; o registro está em `docs/research/premiere-uxp-transactions.md`.
 * Nada aqui foi escrito de memória — três detalhes teriam saído errados se
 * fossem: as duas APIs de transação são síncronas e não assíncronas, o callback
 * da transação *recebe* o `CompoundAction` em vez de devolver ações, e a versão
 * mínima é 25.6.
 *
 * Regra para quem acrescentar um símbolo: verifique na referência antes, e
 * atualize o registro de pesquisa. Um tipo inventado compila e mente.
 */

/** Ação individual. Opaca de propósito: nada neste código constrói uma. */
export interface PremiereAction {
  readonly __premiereAction?: unique symbol;
}

/**
 * Acumulador de ações de uma transação.
 *
 * `addAction(action: Action): boolean` e `empty: boolean` — ambos desde 25.6.
 */
export interface CompoundAction {
  addAction(action: PremiereAction): boolean;
  readonly empty: boolean;
}

export interface PremiereProject {
  /**
   * `lockedAccess(callback: () => void): void` — desde 25.6.
   *
   * **Síncrona.** Segura o estado do projeto durante a execução do callback.
   * Trabalho assíncrono aqui dentro quebra essa garantia, e é o que as regras
   * `no-async-in-locked-access` do plugin oficial da Adobe impedem.
   */
  lockedAccess(callback: () => void): void;

  /**
   * `executeTransaction(callback: (compoundAction: CompoundAction) => void, undoString?: string): boolean`
   * — desde 25.6.
   *
   * **Síncrona**, e devolve `boolean` dizendo se a transação executou. O callback
   * recebe o acumulador; as ações entram por `compound.addAction(...)`.
   */
  executeTransaction(
    callback: (compoundAction: CompoundAction) => void,
    undoString?: string
  ): boolean;

  getActiveSequence(): Promise<PremiereSequence | null>;
  getSequences(): Promise<PremiereSequence[]>;

  readonly name: string;
  readonly path: string;
}

export interface PremiereSequence {
  readonly name: string;
  getVideoTrackCount(): Promise<number>;
  getAudioTrackCount(): Promise<number>;
  getCaptionTrackCount?: () => Promise<number>;
  getCaptionTrack?: (trackIndex: number) => Promise<unknown>;
}

export interface PremiereSequenceEditor {
  insertMogrtFromPath?: (...args: unknown[]) => unknown;
  insertMogrtFromLibrary?: (...args: unknown[]) => unknown;
}

export interface PremiereTranscriptApi {
  exportToJSON?: (...args: unknown[]) => Promise<string>;
  importFromJSON?: (...args: unknown[]) => unknown;
  createImportTextSegmentsAction?: (...args: unknown[]) => PremiereAction;
  querySupportedLanguages?: () => unknown[];
}

/**
 * O módulo `premierepro`, injetado no adapter em vez de importado no topo.
 *
 * A injeção é o que torna o adapter testável: o app passa
 * `require("premierepro")`, e os testes passam um duplo. Sem isso, testar
 * qualquer caminho exigiria abrir o Premiere Pro.
 */
export interface PremiereModule {
  Project: {
    getActiveProject(): Promise<PremiereProject | null>;
  };
  SequenceEditor?: {
    getEditor?: (sequence: PremiereSequence) => PremiereSequenceEditor;
  };
  Transcript?: PremiereTranscriptApi;
}
