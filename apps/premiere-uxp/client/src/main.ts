/** Raiz de composição do painel Premiere Pro UXP. */
import {
  buildCapabilities,
  type ProbeFacts
} from "@motion/capability-matrix";
import {
  PROTOCOL_VERSION,
  type CommandRequest,
  type CommandResponse,
  type HostCapabilities
} from "@motion/contracts";
import { createLogger, type MotionLogger } from "@motion/logging";
import {
  button,
  appearanceSettings,
  browserPreferenceStorage,
  createPanelPreferences,
  checkboxField,
  createI18n,
  createDiagnosticsView,
  createEmptyState,
  createShell,
  notice,
  propertyRow,
  sectionTitle,
  selectField,
  type I18n,
  type RenderRegions,
  type Shell,
  type ShellView
} from "@motion/ui-core";
const panelPreferences = createPanelPreferences(document.documentElement, browserPreferenceStorage(window));
import {
  createBrowserReducedMotionController,
  type ReducedMotionController
} from "@motion/ui-motion";

import { createPremiereAdapter } from "../../host/src/adapter.js";
import { capabilityProbe, contextRead, selfTest } from "../../host/src/commands.js";
import type { PremiereModule } from "../../host/src/premiere-api.js";
import { createPremiereSystemView } from "./views/system-view.js";
import { createPanelRequestScope } from "./request-scope.js";
import {
  buildEntrypointConfig,
  createPanelLifecycle,
  type ManagedPanelRuntime,
  type UxpEntrypointConfig
} from "./lifecycle.js";
import {
  createPremiereMessages,
  localizeCommandFailure,
  type LocalizedViewError,
  type PremiereMessages
} from "./messages.js";
import {
  exportDiagnosticsBundle,
  readUxpHostEnvironment,
  type RuntimeProbeResult,
  type UxpHostEnvironment
} from "./uxp-runtime.js";

interface UxpEntrypoints {
  setup(config: UxpEntrypointConfig<unknown>): void;
}

interface UxpModuleWithEntrypoints {
  entrypoints?: UxpEntrypoints;
}

declare function require(module: string): unknown;

interface ContextData {
  hostVersion: string;
  hasProject: boolean;
  projectName: string | null;
  projectPath: string | null;
  sequenceName: string | null;
  sequenceCount: number;
  videoTrackCount: number | null;
  audioTrackCount: number | null;
}

interface SelfTestData {
  checks: Array<{ name: string; ok: boolean; detailKey: string | null }>;
  passed: number;
  total: number;
}

interface PanelServices {
  disposeView: (() => void) | null;
  state: PanelState;
  requests: ReturnType<typeof createPanelRequestScope>;
  i18n: I18n;
  messages: PremiereMessages;
  logger: MotionLogger;
  dispatcher: Dispatcher | null;
  uxp: unknown;
  canWriteFiles: RuntimeProbeResult;
  motionPreference: ReducedMotionController;
  hostLocale: string | undefined;
}

const VIEWS: ShellView[] = [
  { id: "context", labelKey: "nav.context", titleKey: "view.context.title" },
  { id: "tools", labelKey: "nav.tools", titleKey: "view.tools.title" },
  { id: "system", labelKey: "nav.system", titleKey: "view.system.title" },
  { id: "diagnostics", labelKey: "nav.diagnostics", titleKey: "view.diagnostics.title" },
  { id: "settings", labelKey: "nav.settings", titleKey: "view.settings.title" }
];

const PLUGIN_VERSION = "0.1.0";

interface PanelState {
  context: ContextData | null;
  capabilities: HostCapabilities | null;
  selfTest: SelfTestData | null;
  lastError: LocalizedViewError | null;
  busy: boolean;
}

function createState(): PanelState {
  return { context: null, capabilities: null, selfTest: null, lastError: null, busy: false };
}

let requestCounter = 0;

function resetState(state: PanelState): void {
  state.context = null;
  state.capabilities = null;
  state.selfTest = null;
  state.lastError = null;
  state.busy = false;
}

function nextRequestId(): string {
  const cryptoObject = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (typeof cryptoObject?.randomUUID === "function") {
    return cryptoObject.randomUUID();
  }
  requestCounter += 1;
  return `${Date.now().toString(36)}-${requestCounter}`;
}

type Dispatcher = (command: string) => Promise<CommandResponse>;

function createDispatcher(
  premiere: PremiereModule,
  logger: MotionLogger,
  environment: UxpHostEnvironment
): Dispatcher {
  const adapter = createPremiereAdapter({
    premiere,
    logger,
    runtime: { canWriteFiles: environment.canWriteFiles }
  });

  adapter.register("pr.context.read", contextRead);
  adapter.register("pr.diagnostics.selfTest", selfTest);
  adapter.register("pr.capability.probe", capabilityProbe);

  return async (command) => {
    const request: CommandRequest = {
      protocolVersion: PROTOCOL_VERSION,
      requestId: nextRequestId(),
      command,
      args: {},
      context: {
        host: "premiere-pro",
        hostVersion: environment.hostVersion,
        ...(environment.uiLocale ? { locale: environment.uiLocale } : {})
      }
    };

    const response = await adapter.dispatch(request);
    logger.recordResponse(command, response);
    return response;
  };
}

function createPanelRuntime(uxp: unknown, rootNode?: unknown): ManagedPanelRuntime | null {
  // O HTML do entrypoint contém um único mount estável. O parâmetro documentado
  // é aceito para que create/show possam compartilhar esta fábrica, mas o UXP
  // continua sendo o dono do rootNode.
  void rootNode;
  const mount = document.getElementById("root");
  if (!mount) {
    return null;
  }

  // Estado e tickets pertencem à montagem, nunca a todo o módulo UXP.
  const state = createState();
  const requests = createPanelRequestScope();
  const environment = readUxpHostEnvironment(uxp);
  const preferredLocale = panelPreferences.snapshot().locale;
  const i18n = createI18n({ locale: preferredLocale === "host" ? environment.uiLocale : preferredLocale });
  const messages = createPremiereMessages(i18n.locale());
  document.documentElement?.setAttribute("lang", i18n.locale());

  const logger = createLogger({
    host: "premiere-pro",
    hostVersion: environment.hostVersion,
    pluginVersion: PLUGIN_VERSION
  });

  let premiere: PremiereModule | null;
  try {
    premiere = require("premierepro") as PremiereModule;
  } catch {
    premiere = null;
  }

  const dispatcher = premiere ? createDispatcher(premiere, logger, environment) : null;
  const motionPreference = createBrowserReducedMotionController(document.documentElement, window);
  const services: PanelServices = {
    disposeView: null,
    state,
    requests,
    i18n,
    messages,
    logger,
    dispatcher,
    uxp,
    canWriteFiles: environment.canWriteFiles,
    motionPreference,
    hostLocale: environment.uiLocale
  };

  const shell = createShell({
    mount,
    document,
    i18n,
    subtitleKey: "app.subtitle.premiere",
    views: VIEWS,
    onRender: (viewId, regions) => renderView(viewId, regions, services)
  });
  const stopObservingWidth = shell.observeWidth(window);

  logger.info("panel.started", { command: "panel.started" });
  if (!dispatcher) {
    shell.setStatus(i18n.t("status.outsideHost"), "error");
  }

  return {
    show() {
      logger.info("panel.shown", { command: "panel.shown" });
      // panel.show é um trigger documentado de invalidação: contexto e matriz
      // não sobrevivem silenciosamente a troca de projeto/sequence.
      requests.invalidate();
      resetState(state);

      if (!dispatcher) {
        return;
      }

      void refreshContext(shell, services, dispatcher);
    },

    dispose() {
      services.disposeView?.();
      services.disposeView = null;
      requests.dispose();
      stopObservingWidth();
      motionPreference.dispose();
      logger.info("panel.destroyed", { command: "panel.destroyed" });
      resetState(state);
    }
  };
}

function renderView(viewId: string, regions: RenderRegions, services: PanelServices): void {
  services.disposeView?.();
  services.disposeView = null;
  const { i18n, messages, dispatcher, state } = services;

  if (viewId === "settings") {
    renderSettings(regions, services);
    return;
  }

  if (viewId === "tools") {
    renderTools(regions, services);
    return;
  }

  if (!dispatcher) {
    regions.content.appendChild(notice(document, i18n.t("message.outsideHost"), "error"));
    return;
  }

  if (viewId === "context") {
    renderContext(regions, services);
    renderCurrentError(viewId, regions, services);

    const label = i18n.t("action.refresh");
    regions.actions.appendChild(
      button(document, {
        label,
        variant: "primary",
        disabled: state.busy,
        title: state.busy ? messages.t("disabled.busy") : label,
        onClick: () => void refreshContext(regions.shell, services, dispatcher)
      })
    );
    return;
  }

  if (viewId === "system") {
    const view = createPremiereSystemView(document, {
      i18n,
      messages,
      capabilities: state.capabilities,
      selfTest: state.selfTest,
      busyReason: state.busy ? messages.t("disabled.busy") : undefined,
      canPress: () => !state.busy,
      onRunCheck: () => void runSystemCheck(regions.shell, services, dispatcher),
      onSelfTest: () => void runSelfTest(regions.shell, services, dispatcher)
    });
    regions.content.appendChild(view.content);
    regions.actions.appendChild(view.actions);
    services.disposeView = view.dispose;
    renderCurrentError(viewId, regions, services);
    return;
  }

  renderDiagnostics(regions, services);
  renderCurrentError(viewId, regions, services);
}

function orFallback(
  i18n: I18n,
  value: string | number | null,
  fallbackKey: Parameters<I18n["t"]>[0]
): string {
  return value === null || value === "" ? i18n.t(fallbackKey) : String(value);
}

function renderContext(regions: RenderRegions, services: PanelServices): void {
  const { i18n, messages, state } = services;
  const context = state.context;

  if (!context) {
    regions.content.appendChild(notice(document, i18n.t("status.readingContext")));
    return;
  }

  const projectName = context.hasProject
    ? orFallback(i18n, context.projectName, "value.none")
    : messages.t("value.noProject");
  const projectPath = context.hasProject
    ? orFallback(i18n, context.projectPath, "value.projectNotSaved")
    : i18n.t("value.none");

  const rows: Array<[string, string]> = [
    [i18n.t("context.hostVersion"), orFallback(i18n, context.hostVersion, "value.none")],
    [i18n.t("context.project"), projectName],
    [i18n.t("context.path"), projectPath],
    [i18n.t("context.sequence"), orFallback(i18n, context.sequenceName, "value.noSequence")],
    [i18n.t("context.sequenceCount"), String(context.sequenceCount)],
    [
      i18n.t("context.tracks"),
      context.videoTrackCount === null
        ? i18n.t("value.none")
        : i18n.t("context.tracksValue", {
            video: context.videoTrackCount,
            audio: context.audioTrackCount ?? 0
          })
    ]
  ];

  for (const [label, value] of rows) {
    regions.content.appendChild(propertyRow(document, label, value));
  }

  if (!context.hasProject) {
    regions.content.appendChild(notice(document, messages.t("message.noProject"), "warning"));
  }
}

function renderSettings(regions: RenderRegions, services: PanelServices): void {
  const { i18n, motionPreference } = services;
  regions.content.appendChild(sectionTitle(document, i18n.t("settings.interface.title")));
  regions.content.appendChild(selectField(document, {
    id: "settings-language", label: i18n.t("settings.language.label"), value: panelPreferences.snapshot().locale,
    options: [
      { value: "host", label: i18n.t("settings.language.host") },
      { value: "pt-BR", label: "Português (Brasil)" },
      { value: "en-US", label: "English" }
    ],
    onChange: value => {
      panelPreferences.setLocale(value);
      i18n.setLocale(value === "host" ? services.hostLocale : value);
      services.messages = createPremiereMessages(i18n.locale());
      document.documentElement.setAttribute("lang", i18n.locale());
      regions.shell.rerender();
    }
  }));
  for (const field of appearanceSettings(document, i18n, panelPreferences, () => regions.shell.rerender())) {
    regions.content.appendChild(field);
  }
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

function renderTools(regions: RenderRegions, services: PanelServices): void {
  const { i18n } = services;
  regions.content.appendChild(createEmptyState(document, {
    icon: "tools",
    title: i18n.t("premiere.tools.unavailable"),
    description: i18n.t("premiere.tools.description"),
    action: { label: i18n.t("premiere.tools.context"), onClick: () => regions.shell.navigate("context") }
  }));
}

function renderDiagnostics(regions: RenderRegions, services: PanelServices): void {
  const { i18n, messages, logger, canWriteFiles, state } = services;
  const view = createDiagnosticsView(document, {
    i18n,
    entries: logger.entries(),
    droppedEntries: logger.size().dropped,
    debugMode: logger.isDebugMode(),
    busyReason: state.busy ? messages.t("disabled.busy") : undefined,
    exportUnavailableReason: canWriteFiles !== true ? messages.t("disabled.exportUnavailable") : undefined,
    exportUnavailableNotice: canWriteFiles !== true ? messages.t("message.exportUnavailable") : undefined,
    canPress: () => !state.busy,
    onExport: () => void exportBundle(regions.shell, services),
    onClear: () => {
      const removed = logger.clear();
      state.lastError = null;
      regions.shell.setStatus(i18n.t("message.logsCleared", { count: removed }), "ok");
      regions.shell.rerender();
    },
    onToggleDebug: () => {
      if (logger.isDebugMode()) {
        logger.disableDebugMode();
        regions.shell.setStatus(i18n.t("message.debugDisabled"));
      } else {
        logger.enableDebugMode();
        regions.shell.setStatus(i18n.t("message.debugEnabled"), "ok");
      }
      regions.shell.rerender();
    }
  });
  regions.content.appendChild(view.content);
  regions.actions.appendChild(view.actions);
  services.disposeView = view.dispose;
}

function renderCurrentError(
  viewId: string,
  regions: RenderRegions,
  services: PanelServices
): void {
  const error = services.state.lastError;
  if (!error || error.viewId !== viewId) {
    return;
  }

  regions.content.appendChild(notice(document, error.message, "error"));
  if (error.recovery) {
    regions.content.appendChild(
      notice(
        document,
        `${services.messages.t("message.recovery")}: ${error.recovery}`,
        "warning"
      )
    );
  }
}

function reportFailure(
  shell: Shell,
  services: PanelServices,
  response: CommandResponse,
  originViewId: string
): void {
  const { i18n, state } = services;
  const error = response.error;

  if (!error) {
    state.lastError = {
      viewId: originViewId,
      message: i18n.t("message.failureWithoutReason"),
      recovery: i18n.t("error.action.exportLogBundle")
    };
    shell.setStatus(i18n.t("status.failed"), "error");
    return;
  }

  state.lastError = localizeCommandFailure(originViewId, error, i18n, services.messages);
  shell.setStatus(i18n.t(error.recoverable ? "status.notCompleted" : "status.failed"), "error");
}

function setBusy(shell: Shell, services: PanelServices, busy: boolean): void {
  services.state.busy = busy;
  shell.rerender();
}

/** Invalida a entrega à UI; não promete cancelar operações já enviadas ao host. */
async function runPanelRequest<T>(
  shell: Shell,
  services: PanelServices,
  originViewId: string,
  pendingMessage: string,
  execute: () => Promise<T>,
  accept: (result: T) => void
): Promise<void> {
  const ticket = services.requests.begin();
  if (!ticket) return;
  try {
    services.state.lastError = null;
    shell.setStatus(pendingMessage, "busy");
    setBusy(shell, services, true);
    const result = await execute();
    if (services.requests.isCurrent(ticket)) accept(result);
  } catch {
    if (!services.requests.isCurrent(ticket)) return;
    // Falhas inesperadas também liberam busy, sem expor paths ou erro cru.
    services.state.lastError = localizeCommandFailure(originViewId, {
      code: "HOST_OPERATION_FAILED", message: "Panel operation failed.",
      recoverable: true, action: "error.action.exportLogBundle"
    }, services.i18n, services.messages);
    shell.setStatus(services.i18n.t("status.failed"), "error");
    services.logger.error("panel.operation.failed", { errorCode: "HOST_OPERATION_FAILED" });
  } finally {
    // Um callback velho nunca libera o busy de uma solicitação mais recente.
    if (services.requests.finish(ticket)) setBusy(shell, services, false);
  }
}

async function refreshContext(
  shell: Shell,
  services: PanelServices,
  dispatch: Dispatcher
): Promise<void> {
  const { i18n, state } = services;
  return runPanelRequest(shell, services, "context", i18n.t("status.readingContext"),
    () => dispatch("pr.context.read") as Promise<CommandResponse<ContextData>>, (response) => {
      if (!response.ok || !response.data) {
        state.context = null;
        reportFailure(shell, services, response, "context");
        return;
      }
      state.context = response.data;
      shell.setStatus(i18n.t("status.connected"), "ok");
    });
}

async function runSelfTest(
  shell: Shell,
  services: PanelServices,
  dispatch: Dispatcher
): Promise<void> {
  const { i18n, messages, state } = services;
  return runPanelRequest(shell, services, "system", messages.t("status.runningSelfTest"),
    () => dispatch("pr.diagnostics.selfTest") as Promise<CommandResponse<SelfTestData>>, (response) => {
      if (!response.ok || !response.data) {
        reportFailure(shell, services, response, "system");
        return;
      }
      state.selfTest = response.data;
      const allPassed = response.data.passed === response.data.total;
      shell.setStatus(i18n.t(allPassed ? "status.connected" : "status.notCompleted"), allPassed ? "ok" : "error");
    });
}

async function runSystemCheck(
  shell: Shell,
  services: PanelServices,
  dispatch: Dispatcher
): Promise<void> {
  const { i18n, state } = services;
  return runPanelRequest(shell, services, "system", i18n.t("status.checkingSystem"),
    () => dispatch("pr.capability.probe") as Promise<CommandResponse<ProbeFacts>>, (response) => {
      if (!response.ok || !response.data) {
        reportFailure(shell, services, response, "system");
        return;
      }
      state.capabilities = buildCapabilities(response.data);
      shell.setStatus(i18n.t("status.connected"), "ok");
    });
}

async function exportBundle(shell: Shell, services: PanelServices): Promise<void> {
  const { i18n, messages, logger, uxp, state } = services;
  return runPanelRequest(shell, services, "diagnostics", messages.t("status.exporting"),
    () => exportDiagnosticsBundle(uxp, logger.exportBundle()), (result) => {
      if (result.status === "saved") {
        logger.info("diagnostics.exported", {
          command: "diagnostics.export",
          result: "success"
        });
        shell.setStatus(messages.t("message.exportSaved"), "ok");
      } else if (result.status === "cancelled") {
        logger.info("diagnostics.export.cancelled", {
          command: "diagnostics.export",
          result: "cancelled"
        });
        shell.setStatus(messages.t("message.exportCancelled"));
      } else {
        const unavailable = result.status === "unsupported";
        const message = messages.t(unavailable ? "message.exportUnavailable" : "message.exportFailed");
        const recovery = i18n.t(
          unavailable ? "error.action.updateHost" : "error.action.grantPermission"
        );
        state.lastError = { viewId: "diagnostics", message, recovery };
        if (unavailable) {
          logger.warn("diagnostics.export.unavailable", { reason: result.reason });
        } else {
          logger.error("diagnostics.export.failed", {
            command: "diagnostics.export",
            result: "failure",
            errorCode: result.reason
          });
        }
        shell.setStatus(i18n.t("status.notCompleted"), "error");
      }
    });
}

function loadUxpModule(): UxpModuleWithEntrypoints | null {
  try {
    return require("uxp") as UxpModuleWithEntrypoints;
  } catch {
    return null;
  }
}

function onDomReady(callback: () => void): void {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", callback);
  } else {
    callback();
  }
}

const uxpModule = loadUxpModule();
const panelLifecycle = createPanelLifecycle<unknown>((rootNode) =>
  createPanelRuntime(uxpModule, rootNode)
);

if (uxpModule) {
  const entrypoints = uxpModule.entrypoints;
  if (!entrypoints || typeof entrypoints.setup !== "function") {
    throw new Error("O runtime UXP não expôs entrypoints.setup.");
  }

  // Erros de setup não são capturados: mascará-los com o fallback de DOM faria
  // uma falha real de lifecycle parecer uma inicialização normal.
  entrypoints.setup(buildEntrypointConfig(panelLifecycle));
} else {
  // Fallback exclusivo para preview fora do UXP. Dentro do host, somente os
  // callbacks documentados controlam montagem e cleanup.
  onDomReady(() => {
    panelLifecycle.show();
  });
}
