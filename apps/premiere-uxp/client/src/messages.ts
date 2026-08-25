/** Mensagens específicas do Premiere que ainda não pertencem ao shell comum. */
import type { CommandFailure } from "@motion/contracts";
import type { I18n } from "@motion/ui-core";

const ptBR = {
  "value.noProject": "Nenhum projeto aberto",
  "message.noProject": "Abra um projeto no Premiere Pro e clique em Atualizar.",
  "message.systemCheckNotRun": "Execute a verificação para medir as capacidades deste host.",
  "message.exportSaved": "Diagnóstico exportado.",
  "message.exportCancelled": "Exportação cancelada; nenhum arquivo foi gravado.",
  "message.exportUnavailable": "O seletor de arquivos do UXP não está disponível neste host.",
  "message.exportFailed": "Não foi possível exportar o diagnóstico.",
  "message.recovery": "Como corrigir",
  "status.runningSelfTest": "Executando autoteste…",
  "status.exporting": "Exportando diagnóstico…",
  "disabled.busy": "Aguarde a operação atual terminar.",
  "disabled.exportUnavailable": "O host não disponibilizou o seletor de arquivos necessário.",

  "selfTest.name.module.premierepro": "Módulo do Premiere Pro",
  "selfTest.name.host.version": "Versão do host",
  "selfTest.name.project.active": "Projeto ativo",
  "selfTest.name.project.transactionApi": "API de transação",
  "selfTest.detail.moduleUnavailable": "O módulo premierepro não foi carregado.",
  "selfTest.detail.hostVersionUnknown": "O runtime UXP não informou a versão do host.",
  "selfTest.detail.noProject": "Nenhum projeto aberto.",
  "selfTest.detail.transactionUnavailable": "lockedAccess e executeTransaction não foram encontrados neste projeto.",
  "selfTest.detail.transactionNotChecked": "Não verificado: abra um projeto para sondar a API de transação.",
  "selfTest.detail.checkFailed": "Uma verificação do autoteste não passou.",

  "error.code.INTERNAL_ERROR": "O plugin recebeu uma resposta interna inválida.",
  "error.code.HOST_OPERATION_FAILED": "O Premiere Pro não conseguiu concluir a operação.",
  "error.code.CAPABILITY_UNAVAILABLE": "Este recurso não está disponível neste host.",
  "error.code.PERMISSION_DENIED": "A operação não recebeu a permissão necessária.",
  "error.code.NO_ACTIVE_PROJECT": "Nenhum projeto está aberto no Premiere Pro.",
  "error.code.NO_ACTIVE_SEQUENCE": "Nenhuma sequência está ativa no Premiere Pro.",
  "error.code.UNSUPPORTED_HOST_VERSION": "Esta versão do Premiere Pro não é compatível.",
  "error.code.USER_CANCELLED": "A operação foi cancelada."
} as const;

export type PremiereMessageKey = keyof typeof ptBR;
export const PREMIERE_MESSAGE_KEYS = Object.freeze(
  Object.keys(ptBR) as PremiereMessageKey[]
);

const enUS: Record<PremiereMessageKey, string> = {
  "value.noProject": "No project open",
  "message.noProject": "Open a project in Premiere Pro, then click Refresh.",
  "message.systemCheckNotRun": "Run the check to measure this host's capabilities.",
  "message.exportSaved": "Diagnostics exported.",
  "message.exportCancelled": "Export cancelled; no file was written.",
  "message.exportUnavailable": "The UXP file picker is unavailable in this host.",
  "message.exportFailed": "The diagnostics could not be exported.",
  "message.recovery": "How to recover",
  "status.runningSelfTest": "Running self-test...",
  "status.exporting": "Exporting diagnostics...",
  "disabled.busy": "Wait for the current operation to finish.",
  "disabled.exportUnavailable": "The host did not provide the required file picker.",

  "selfTest.name.module.premierepro": "Premiere Pro module",
  "selfTest.name.host.version": "Host version",
  "selfTest.name.project.active": "Active project",
  "selfTest.name.project.transactionApi": "Transaction API",
  "selfTest.detail.moduleUnavailable": "The premierepro module was not loaded.",
  "selfTest.detail.hostVersionUnknown": "The UXP runtime did not report the host version.",
  "selfTest.detail.noProject": "No project is open.",
  "selfTest.detail.transactionUnavailable": "lockedAccess and executeTransaction were not found on this project.",
  "selfTest.detail.transactionNotChecked": "Not checked: open a project to probe the transaction API.",
  "selfTest.detail.checkFailed": "A self-test check did not pass.",

  "error.code.INTERNAL_ERROR": "The plugin received an invalid internal response.",
  "error.code.HOST_OPERATION_FAILED": "Premiere Pro could not complete the operation.",
  "error.code.CAPABILITY_UNAVAILABLE": "This feature is unavailable in this host.",
  "error.code.PERMISSION_DENIED": "The operation did not receive the required permission.",
  "error.code.NO_ACTIVE_PROJECT": "No project is open in Premiere Pro.",
  "error.code.NO_ACTIVE_SEQUENCE": "No sequence is active in Premiere Pro.",
  "error.code.UNSUPPORTED_HOST_VERSION": "This Premiere Pro version is unsupported.",
  "error.code.USER_CANCELLED": "The operation was cancelled."
};

export interface PremiereMessages {
  has(key: string): key is PremiereMessageKey;
  t(key: PremiereMessageKey): string;
}

export function createPremiereMessages(locale: string): PremiereMessages {
  const catalog = locale.toLowerCase().startsWith("pt") ? ptBR : enUS;
  return {
    has: (key): key is PremiereMessageKey => Object.prototype.hasOwnProperty.call(catalog, key),
    t: (key) => catalog[key]
  };
}

export interface LocalizedViewError {
  viewId: string;
  message: string;
  recovery: string | null;
}

/** Mantém o erro ligado à view que iniciou a Promise, não à aba ativa depois. */
export function localizeCommandFailure(
  originViewId: string,
  error: CommandFailure,
  i18n: I18n,
  messages: PremiereMessages
): LocalizedViewError {
  const messageKey = `error.code.${error.code}`;
  const localizedMessage = messages.has(messageKey) ? messages.t(messageKey) : error.message;
  const recovery = error.action
    ? i18n.has(error.action)
      ? i18n.t(error.action as Parameters<I18n["t"]>[0])
      : error.action
    : null;

  return {
    viewId: originViewId,
    message: i18n.t("error.withCode", { code: error.code, message: localizedMessage }),
    recovery
  };
}
