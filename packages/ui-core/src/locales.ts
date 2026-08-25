/**
 * Catálogos de mensagens — CHMS-008.
 *
 * Frases completas por chave. Nunca fragmento concatenado: "Composição " + nome
 * + " criada" quebra em qualquer idioma cuja ordem de palavras não seja a do
 * português, e o tradutor não tem como saber o que vem antes ou depois.
 *
 * A paridade entre os dois catálogos é garantida pelo **tipo**, não por teste:
 * `enUS` é `Record<MessageKey, string>`, onde `MessageKey` sai de `ptBR`. Faltar
 * uma chave ou inventar uma que não existe no outro catálogo é erro de
 * compilação, e não algo que se descobre quando um usuário vê a chave crua na
 * tela.
 */

const ptBR = {
  "app.title": "Moti.on",
  "app.subtitle.afterEffects": "After Effects · CEP",
  "app.subtitle.premiere": "Premiere Pro · UXP",

  "nav.context": "Contexto",
  "nav.system": "Sistema",
  "nav.diagnostics": "Diagnóstico",

  "view.context.title": "Contexto do projeto",
  "view.system.title": "Verificação do sistema",
  "view.diagnostics.title": "Diagnóstico da sessão",

  "context.hostVersion": "Versão",
  "context.project": "Projeto",
  "context.path": "Caminho",
  "context.activeItem": "Item ativo",
  "context.composition": "Composição",
  "context.sequence": "Sequência",
  "context.sequenceCount": "Sequências",
  "context.tracks": "Trilhas",
  "context.compositionValue": "{width} × {height} · {duration} s · {frameRate} fps",
  "context.tracksValue": "{video} de vídeo · {audio} de áudio",

  "value.none": "—",
  "value.projectNotSaved": "Projeto ainda não salvo",
  "value.noComposition": "Nenhuma composição ativa",
  "value.noSequence": "Nenhuma sequência ativa",
  "value.noItem": "Nenhum item selecionado",

  "action.refresh": "Atualizar",
  "action.createDemo": "Criar composição de teste",
  "action.verifyBridge": "Verificar ponte com o host",
  "action.runSelfTest": "Executar autoteste",
  "action.runSystemCheck": "Executar verificação",
  "action.clearLogs": "Limpar logs",
  "action.exportBundle": "Exportar diagnóstico",
  "action.enableDebug": "Ativar modo debug",
  "action.disableDebug": "Desativar modo debug",

  "status.initializing": "Inicializando…",
  "status.readingContext": "Lendo o contexto…",
  "status.connected": "Conectado",
  "status.failed": "Erro",
  "status.notCompleted": "Não foi possível concluir",
  "status.outsideHost": "Fora do host",
  "status.creatingComposition": "Criando composição…",
  "status.verifyingBridge": "Verificando a ponte…",
  "status.checkingSystem": "Verificando o sistema…",
  "status.bridgeCorrupted": "Ponte corrompida",

  "message.outsideHost": "Este painel só funciona carregado dentro do host. Consulte docs/INSTALLATION.md para instalar a extensão em modo de desenvolvimento.",
  "message.contextRead": "Contexto lido em {durationMs} ms.",
  "message.systemCheckIdle": "Execute a verificação para medir os recursos disponíveis neste host.",
  "message.compositionCreated": "Composição \"{name}\" criada. Um único Ctrl+Z desfaz a operação inteira.",
  "message.bridgeIntact": "Ponte com o host íntegra: o payload voltou idêntico ao enviado.",
  "message.bridgeCorrupted": "O payload voltou diferente do enviado. Caracteres acentuados ou não latinos podem estar sendo corrompidos nesta máquina. Exporte o diagnóstico antes de usar o plugin.",
  "message.failureWithoutReason": "O comando falhou sem informar o motivo.",
  "message.logsCleared": "Registros removidos: {count}.",
  "message.bundleCopied": "Diagnóstico copiado para a área de transferência.",
  "message.bundleCopyFailed": "Não foi possível copiar o diagnóstico para a área de transferência.",
  "message.debugEnabled": "Modo debug ativo. Ele desliga sozinho depois de 15 minutos.",
  "message.debugDisabled": "Modo debug desativado.",

  "capability.supportTier": "Tier de suporte",
  "capability.expressionEngine": "Motor de expressões",
  "capability.state.available": "Disponível",
  "capability.state.unavailable": "Indisponível",
  "capability.state.unknown": "Não verificado",
  "capability.reason.couldNotDetermine": "A sonda não conseguiu determinar o estado.",
  "capability.reason.notAvailable": "O host não expõe este recurso.",
  "capability.reason.couldNotReadHostPreference": "Não foi possível ler a preferência de segurança do host.",
  "capability.reason.enableScriptFileAccess": "Ative ‘Allow Scripts To Write Files And Access Network’ nas preferências do After Effects.",
  "capability.reason.addonNotPackaged": "O componente nativo não está incluído neste build.",
  "capability.reason.companionNotImplemented": "O serviço acompanhante ainda não está disponível neste build.",
  "capability.reason.premiereOnly": "Este recurso está disponível somente no Premiere Pro.",

  "capability.tier.afterEffects.full": "Suporte completo",
  "capability.tier.afterEffects.compatible": "Compatível",
  "capability.tier.afterEffects.baseline": "Suporte básico",
  "capability.tier.afterEffects.unsupported": "Versão não suportada",
  "capability.tier.afterEffects.unknown": "Versão não verificada",
  "capability.tier.premiere.full": "Suporte completo",
  "capability.tier.premiere.compatible": "Compatível",
  "capability.tier.premiere.baseline": "Suporte básico",
  "capability.tier.premiere.unsupported": "Versão não suportada",
  "capability.tier.premiere.unknown": "Versão não verificada",

  "capability.key.hasProject": "Projeto aberto",
  "capability.key.hasActiveComp": "Composição ativa",
  "capability.key.hasActiveSequence": "Sequência ativa",
  "capability.key.canWriteFiles": "Escrita em disco",
  "capability.key.canAccessNetwork": "Acesso à rede",
  "capability.key.canUseNativeAddon": "Componente nativo",
  "capability.key.canReachCompanion": "Serviço acompanhante",
  "capability.key.canInsertMogrt": "Inserção de MOGRT",
  "capability.key.canReadTranscript": "Leitura de transcrição",
  "capability.key.canImportTranscript": "Importação de transcrição",
  "capability.key.canQueryTranscriptLanguages": "Idiomas de transcrição",
  "capability.key.canReadCaptionTracks": "Trilhas de legenda",
  "capability.key.expressionEngine": "Motor de expressões",

  "logs.empty": "Nenhum registro nesta sessão.",
  "logs.summary": "{count} registros · {dropped} descartados por rotação.",
  "logs.redactionNotice": "Caminhos, nomes de projeto e credenciais são redigidos antes de o registro ser gravado.",

  "error.action.openProject": "Abra um projeto e tente novamente.",
  "error.action.openComposition": "Abra ou ative uma composição e tente novamente.",
  "error.action.openSequence": "Abra ou ative uma sequência e tente novamente.",
  "error.action.selectLayers": "Selecione ao menos uma camada e tente novamente.",
  "error.action.selectSupportedType": "Selecione um tipo de item compatível e tente novamente.",
  "error.action.updateHost": "Atualize o aplicativo Adobe para uma versão compatível.",
  "error.action.checkSystemCheck": "Abra a Verificação do sistema para ver o requisito ausente.",
  "error.action.grantPermission": "Conceda a permissão solicitada e tente novamente.",
  "error.action.checkConnection": "Verifique a conexão de rede e tente novamente.",
  "error.action.retryLater": "Tente novamente mais tarde.",
  "error.action.activateLicense": "Ative uma licença válida e tente novamente.",
  "error.action.installModel": "Instale o modelo necessário e tente novamente.",
  "error.action.reportIssue": "Exporte o diagnóstico e informe o problema ao suporte.",
  "error.action.chooseConflictMode": "Escolha como resolver o conflito antes de aplicar.",
  "error.action.chooseTrack": "Escolha uma trilha compatível e tente novamente.",
  "error.action.chooseAnotherAsset": "Escolha outro asset com licença compatível.",
  "error.action.none": "Nenhuma ação adicional é necessária.",
  "error.action.checkUndoHistory": "Verifique o histórico de Desfazer antes de repetir a operação.",
  "error.action.undoManually": "Use Desfazer manualmente e confira o estado do projeto.",
  "error.action.exportLogBundle": "Exporte o diagnóstico e informe este erro ao suporte.",

  "error.withCode": "[{code}] {message}"
} as const;

/** Toda chave que a interface pode pedir. Derivada do catálogo, não escrita à mão. */
export type MessageKey = keyof typeof ptBR;

const enUS: Record<MessageKey, string> = {
  "app.title": "Moti.on",
  "app.subtitle.afterEffects": "After Effects · CEP",
  "app.subtitle.premiere": "Premiere Pro · UXP",

  "nav.context": "Context",
  "nav.system": "System",
  "nav.diagnostics": "Diagnostics",

  "view.context.title": "Project context",
  "view.system.title": "System check",
  "view.diagnostics.title": "Session diagnostics",

  "context.hostVersion": "Version",
  "context.project": "Project",
  "context.path": "Path",
  "context.activeItem": "Active item",
  "context.composition": "Composition",
  "context.sequence": "Sequence",
  "context.sequenceCount": "Sequences",
  "context.tracks": "Tracks",
  "context.compositionValue": "{width} × {height} · {duration} s · {frameRate} fps",
  "context.tracksValue": "{video} video · {audio} audio",

  "value.none": "—",
  "value.projectNotSaved": "Project not saved yet",
  "value.noComposition": "No active composition",
  "value.noSequence": "No active sequence",
  "value.noItem": "No item selected",

  "action.refresh": "Refresh",
  "action.createDemo": "Create test composition",
  "action.verifyBridge": "Verify host bridge",
  "action.runSelfTest": "Run self-test",
  "action.runSystemCheck": "Run check",
  "action.clearLogs": "Clear logs",
  "action.exportBundle": "Export diagnostics",
  "action.enableDebug": "Enable debug mode",
  "action.disableDebug": "Disable debug mode",

  "status.initializing": "Starting…",
  "status.readingContext": "Reading context…",
  "status.connected": "Connected",
  "status.failed": "Error",
  "status.notCompleted": "Could not complete",
  "status.outsideHost": "Outside the host",
  "status.creatingComposition": "Creating composition…",
  "status.verifyingBridge": "Verifying the bridge…",
  "status.checkingSystem": "Checking the system…",
  "status.bridgeCorrupted": "Bridge corrupted",

  "message.outsideHost": "This panel only works when loaded inside the host application. See docs/INSTALLATION.md to install the extension in development mode.",
  "message.contextRead": "Context read in {durationMs} ms.",
  "message.systemCheckIdle": "Run the check to measure the capabilities available in this host.",
  "message.compositionCreated": "Composition \"{name}\" created. A single Ctrl+Z undoes the whole operation.",
  "message.bridgeIntact": "Host bridge intact: the payload came back identical to what was sent.",
  "message.bridgeCorrupted": "The payload came back different from what was sent. Accented or non-Latin characters may be corrupted on this machine. Export the diagnostics before using the plugin.",
  "message.failureWithoutReason": "The command failed without reporting a reason.",
  "message.logsCleared": "Entries removed: {count}.",
  "message.bundleCopied": "Diagnostics copied to the clipboard.",
  "message.bundleCopyFailed": "The diagnostics bundle could not be copied to the clipboard.",
  "message.debugEnabled": "Debug mode is on. It turns itself off after 15 minutes.",
  "message.debugDisabled": "Debug mode is off.",

  "capability.supportTier": "Support tier",
  "capability.expressionEngine": "Expression engine",
  "capability.state.available": "Available",
  "capability.state.unavailable": "Unavailable",
  "capability.state.unknown": "Not verified",
  "capability.reason.couldNotDetermine": "The probe could not determine the state.",
  "capability.reason.notAvailable": "The host does not expose this feature.",
  "capability.reason.couldNotReadHostPreference": "The host security preference could not be read.",
  "capability.reason.enableScriptFileAccess": "Enable ‘Allow Scripts To Write Files And Access Network’ in the After Effects preferences.",
  "capability.reason.addonNotPackaged": "The native component is not included in this build.",
  "capability.reason.companionNotImplemented": "The companion service is not available in this build yet.",
  "capability.reason.premiereOnly": "This feature is available only in Premiere Pro.",

  "capability.tier.afterEffects.full": "Full support",
  "capability.tier.afterEffects.compatible": "Compatible",
  "capability.tier.afterEffects.baseline": "Baseline support",
  "capability.tier.afterEffects.unsupported": "Unsupported version",
  "capability.tier.afterEffects.unknown": "Version not verified",
  "capability.tier.premiere.full": "Full support",
  "capability.tier.premiere.compatible": "Compatible",
  "capability.tier.premiere.baseline": "Baseline support",
  "capability.tier.premiere.unsupported": "Unsupported version",
  "capability.tier.premiere.unknown": "Version not verified",

  "capability.key.hasProject": "Open project",
  "capability.key.hasActiveComp": "Active composition",
  "capability.key.hasActiveSequence": "Active sequence",
  "capability.key.canWriteFiles": "Disk write access",
  "capability.key.canAccessNetwork": "Network access",
  "capability.key.canUseNativeAddon": "Native component",
  "capability.key.canReachCompanion": "Companion service",
  "capability.key.canInsertMogrt": "MOGRT insertion",
  "capability.key.canReadTranscript": "Transcript reading",
  "capability.key.canImportTranscript": "Transcript import",
  "capability.key.canQueryTranscriptLanguages": "Transcript languages",
  "capability.key.canReadCaptionTracks": "Caption tracks",
  "capability.key.expressionEngine": "Expression engine",

  "logs.empty": "No entries in this session.",
  "logs.summary": "{count} entries · {dropped} dropped by rotation.",
  "logs.redactionNotice": "Paths, project names and credentials are redacted before an entry is written.",

  "error.action.openProject": "Open a project and try again.",
  "error.action.openComposition": "Open or activate a composition and try again.",
  "error.action.openSequence": "Open or activate a sequence and try again.",
  "error.action.selectLayers": "Select at least one layer and try again.",
  "error.action.selectSupportedType": "Select a supported item type and try again.",
  "error.action.updateHost": "Update the Adobe application to a supported version.",
  "error.action.checkSystemCheck": "Open System Check to review the missing requirement.",
  "error.action.grantPermission": "Grant the requested permission and try again.",
  "error.action.checkConnection": "Check the network connection and try again.",
  "error.action.retryLater": "Try again later.",
  "error.action.activateLicense": "Activate a valid license and try again.",
  "error.action.installModel": "Install the required model and try again.",
  "error.action.reportIssue": "Export diagnostics and report the issue to support.",
  "error.action.chooseConflictMode": "Choose how to resolve the conflict before applying.",
  "error.action.chooseTrack": "Choose a compatible track and try again.",
  "error.action.chooseAnotherAsset": "Choose another asset with a compatible license.",
  "error.action.none": "No additional action is required.",
  "error.action.checkUndoHistory": "Check the Undo history before repeating the operation.",
  "error.action.undoManually": "Undo manually and verify the project state.",
  "error.action.exportLogBundle": "Export diagnostics and report this error to support.",

  "error.withCode": "[{code}] {message}"
};

export const CATALOGS: Record<string, Record<MessageKey, string>> = {
  "pt-BR": ptBR,
  "en-US": enUS
};

export const FALLBACK_LOCALE = "en-US";
