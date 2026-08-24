/**
 * Códigos de erro do protocolo.
 *
 * Lista fechada, na ordem da §8 do master spec. Um comando não pode inventar um
 * código: se a situação não cabe em nenhum destes, ou ela cabe em
 * `INTERNAL_ERROR` com `details`, ou o conjunto precisa crescer aqui — e crescer
 * aqui é uma mudança revisável que arrasta o schema JSON, o módulo ES5 gerado
 * para o ExtendScript e as duas traduções junto, por construção.
 */

/**
 * Não é um `const enum`: `const enum` quebra com `isolatedModules` e não é
 * consumível pelo módulo ES5 que o ExtendScript carrega. Uma tupla `readonly`
 * dá o mesmo tipo fechado e ainda é iterável em runtime, que é o que a geração
 * de código e o teste de cobertura de tradução precisam.
 */
export const ERROR_CODES = [
  "NO_ACTIVE_PROJECT",
  "NO_ACTIVE_COMP",
  "NO_ACTIVE_SEQUENCE",
  "NO_SELECTION",
  "INVALID_SELECTION_TYPE",
  "UNSUPPORTED_HOST_VERSION",
  "CAPABILITY_UNAVAILABLE",
  "PERMISSION_DENIED",
  "NETWORK_UNAVAILABLE",
  "PROVIDER_ERROR",
  "LICENSE_REQUIRED",
  "MODEL_NOT_INSTALLED",
  "NATIVE_SERVICE_UNAVAILABLE",
  "INVALID_PRESET",
  "EXPRESSION_CONFLICT",
  "KEYFRAME_CONFLICT",
  "TRACK_CONFLICT",
  "ASSET_LICENSE_BLOCKED",
  "USER_CANCELLED",
  "HOST_OPERATION_FAILED",
  "ROLLBACK_FAILED",
  "INTERNAL_ERROR"
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ErrorMeta {
  /**
   * `true` quando o usuário consegue resolver a situação e tentar de novo:
   * selecionar uma camada, abrir uma composição, reconectar a rede.
   *
   * `false` quando repetir a mesma ação produziria o mesmo resultado. A UI usa
   * isso para decidir se oferece "Tentar de novo" — oferecer repetição para um
   * erro não recuperável é pedir para o usuário perder tempo.
   */
  readonly recoverable: boolean;

  /**
   * Chave i18n da ação corretiva, não a frase.
   *
   * A §22.3 exige pt-BR e en-US desde o início, e a §8 exige que todo erro traga
   * ação corretiva. Guardar a frase pronta aqui tornaria o erro monolíngue e
   * amarraria texto de interface a uma constante de protocolo.
   */
  readonly actionKey: string;
}

/**
 * Metadados por código. Todo código precisa de uma entrada: `Record` com a união
 * completa como chave faz o TypeScript recusar a compilação se um código novo
 * for acrescentado sem decidir se é recuperável e o que o usuário deve fazer.
 */
export const ERROR_META: Record<ErrorCode, ErrorMeta> = {
  NO_ACTIVE_PROJECT: { recoverable: true, actionKey: "error.action.openProject" },
  NO_ACTIVE_COMP: { recoverable: true, actionKey: "error.action.openComposition" },
  NO_ACTIVE_SEQUENCE: { recoverable: true, actionKey: "error.action.openSequence" },
  NO_SELECTION: { recoverable: true, actionKey: "error.action.selectLayers" },
  INVALID_SELECTION_TYPE: { recoverable: true, actionKey: "error.action.selectSupportedType" },
  UNSUPPORTED_HOST_VERSION: { recoverable: false, actionKey: "error.action.updateHost" },
  CAPABILITY_UNAVAILABLE: { recoverable: false, actionKey: "error.action.checkSystemCheck" },
  PERMISSION_DENIED: { recoverable: true, actionKey: "error.action.grantPermission" },
  NETWORK_UNAVAILABLE: { recoverable: true, actionKey: "error.action.checkConnection" },
  PROVIDER_ERROR: { recoverable: true, actionKey: "error.action.retryLater" },
  LICENSE_REQUIRED: { recoverable: true, actionKey: "error.action.activateLicense" },
  MODEL_NOT_INSTALLED: { recoverable: true, actionKey: "error.action.installModel" },
  NATIVE_SERVICE_UNAVAILABLE: { recoverable: false, actionKey: "error.action.checkSystemCheck" },
  INVALID_PRESET: { recoverable: false, actionKey: "error.action.reportIssue" },
  EXPRESSION_CONFLICT: { recoverable: true, actionKey: "error.action.chooseConflictMode" },
  KEYFRAME_CONFLICT: { recoverable: true, actionKey: "error.action.chooseConflictMode" },
  TRACK_CONFLICT: { recoverable: true, actionKey: "error.action.chooseTrack" },
  ASSET_LICENSE_BLOCKED: { recoverable: false, actionKey: "error.action.chooseAnotherAsset" },
  USER_CANCELLED: { recoverable: true, actionKey: "error.action.none" },
  HOST_OPERATION_FAILED: { recoverable: true, actionKey: "error.action.checkUndoHistory" },
  ROLLBACK_FAILED: { recoverable: false, actionKey: "error.action.undoManually" },
  INTERNAL_ERROR: { recoverable: false, actionKey: "error.action.exportLogBundle" }
};

/**
 * Verificação em runtime, para a fronteira: o que chega do host é string, não
 * `ErrorCode`.
 */
export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === "string" && (ERROR_CODES as readonly string[]).includes(value);
}
