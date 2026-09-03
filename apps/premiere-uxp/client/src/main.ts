/** Raiz de composição do painel Premiere Pro UXP. */
import {
  buildCapabilities,
  parseHostVersion,
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
  checkboxField,
  createI18n,
  createShell,
  logLine,
  notice,
  propertyRow,
  sectionTitle,
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

import { createPremiereAdapter } from "../../host/src/adapter.js";
import { capabilityProbe, contextRead, selfTest } from "../../host/src/commands.js";
import type { PremiereModule } from "../../host/src/premiere-api.js";
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
  i18n: I18n;
  messages: PremiereMessages;
  logger: MotionLogger;
  dispatcher: Dispatcher | null;
  uxp: unknown;
  canWriteFiles: RuntimeProbeResult;
  motionPreference: ReducedMotionController;
}

const VIEWS: ShellView[] = [
  { id: "context", labelKey: "nav.context", titleKey: "view.context.title" },
  { id: "system", labelKey: "nav.system", titleKey: "view.system.title" },
  { id: "diagnostics", labelKey: "nav.diagnostics", titleKey: "view.diagnostics.title" },
  { id: "settings", labelKey: "nav.settings", titleKey: "view.settings.title" }
];

const PLUGIN_VERSION = "0.1.0";

const state: {
  context: ContextData | null;
  capabilities: HostCapabilities | null;
  selfTest: SelfTestData | null;
  lastError: LocalizedViewError | null;
  busy: boolean;
} = {
  context: null,
  capabilities: null,
  selfTest: null,
  lastError: null,
  busy: false
};

let requestCounter = 0;

function resetState(): void {
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

  resetState();
  const environment = readUxpHostEnvironment(uxp);
  const i18n = createI18n({ locale: environment.uiLocale });
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
    i18n,
    messages,
    logger,
    dispatcher,
    uxp,
    canWriteFiles: environment.canWriteFiles,
    motionPreference
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
      state.context = null;
      state.capabilities = null;
      state.selfTest = null;

      if (!dispatcher || state.busy) {
        return;
      }

      void refreshContext(shell, services, dispatcher);
    },

    dispose() {
      stopObservingWidth();
      motionPreference.dispose();
      logger.info("panel.destroyed", { command: "panel.destroyed" });
      resetState();
    }
  };
}

function renderView(viewId: string, regions: RenderRegions, services: PanelServices): void {
  const { i18n, messages, dispatcher } = services;

  if (viewId === "settings") {
    renderSettings(regions, services);
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
    renderSystem(regions, services);
    renderCurrentError(viewId, regions, services);

    const checkLabel = i18n.t("action.runSystemCheck");
    regions.actions.appendChild(
      button(document, {
        label: checkLabel,
        variant: "primary",
        disabled: state.busy,
        title: state.busy ? messages.t("disabled.busy") : checkLabel,
        onClick: () => void runSystemCheck(regions.shell, services, dispatcher)
      })
    );

    const selfTestLabel = i18n.t("action.runSelfTest");
    regions.actions.appendChild(
      button(document, {
        label: selfTestLabel,
        disabled: state.busy,
        title: state.busy ? messages.t("disabled.busy") : selfTestLabel,
        onClick: () => void runSelfTest(regions.shell, services, dispatcher)
      })
    );
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
  const { i18n, messages } = services;
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

function renderSystem(regions: RenderRegions, services: PanelServices): void {
  const { i18n, messages } = services;
  const capabilities = state.capabilities;

  if (capabilities) {
    const versionKnown = parseHostVersion(capabilities.hostVersion) !== null;
    regions.content.appendChild(
      propertyRow(
        document,
        i18n.t("capability.supportTier"),
        versionKnown
          ? i18n.t(
              `capability.tier.premiere.${capabilities.supportTier}` as Parameters<I18n["t"]>[0]
            )
          : i18n.t("capability.state.unknown"),
        versionKnown ? undefined : "unknown"
      )
    );

    for (const [key, finding] of Object.entries(capabilities.findings)) {
      if (!finding) {
        continue;
      }

      const tone: RowTone =
        finding.state === "available" ? "ok" : finding.state === "unknown" ? "unknown" : "off";
      const value =
        finding.state === "available"
          ? i18n.t("capability.state.available")
          : `${i18n.t(`capability.state.${finding.state}` as Parameters<I18n["t"]>[0])} — ${
              finding.reasonKey
                ? i18n.t(finding.reasonKey as Parameters<I18n["t"]>[0])
                : ""
            }`.trim();

      regions.content.appendChild(
        propertyRow(document, i18n.t(`capability.key.${key}` as Parameters<I18n["t"]>[0]), value, tone)
      );
    }
  }

  if (state.selfTest) {
    regions.content.appendChild(sectionTitle(document, i18n.t("action.runSelfTest")));
    for (const check of state.selfTest.checks) {
      const nameKey = `selfTest.name.${check.name}`;
      const checkName = messages.has(nameKey) ? messages.t(nameKey) : check.name;
      const detail =
        check.detailKey && messages.has(check.detailKey)
          ? messages.t(check.detailKey)
          : check.detailKey;

      regions.content.appendChild(
        propertyRow(
          document,
          checkName,
          check.ok
            ? i18n.t("capability.state.available")
            : `${i18n.t("capability.state.unavailable")}${detail ? ` — ${detail}` : ""}`,
          check.ok ? "ok" : "off"
        )
      );
    }
  }

  if (!capabilities && !state.selfTest) {
    regions.content.appendChild(notice(document, messages.t("message.systemCheckNotRun")));
  }
}

function renderSettings(regions: RenderRegions, services: PanelServices): void {
  const { i18n, motionPreference } = services;
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

function renderDiagnostics(regions: RenderRegions, services: PanelServices): void {
  const { i18n, messages, logger, canWriteFiles } = services;
  const entries = logger.entries();
  const size = logger.size();

  regions.content.appendChild(notice(document, i18n.t("logs.redactionNotice")));
  if (canWriteFiles !== true) {
    regions.content.appendChild(
      notice(document, messages.t("message.exportUnavailable"), "warning")
    );
  }
  regions.content.appendChild(
    sectionTitle(document, i18n.t("logs.summary", { count: size.entries, dropped: size.dropped }))
  );

  if (entries.length === 0) {
    regions.content.appendChild(notice(document, i18n.t("logs.empty")));
  } else {
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

  const exportLabel = i18n.t("action.exportBundle");
  const exportDisabled = state.busy || canWriteFiles !== true;
  regions.actions.appendChild(
    button(document, {
      label: exportLabel,
      variant: "primary",
      disabled: exportDisabled,
      title: state.busy
        ? messages.t("disabled.busy")
        : canWriteFiles !== true
          ? messages.t("disabled.exportUnavailable")
          : exportLabel,
      onClick: () => void exportBundle(regions.shell, services)
    })
  );

  const clearLabel = i18n.t("action.clearLogs");
  regions.actions.appendChild(
    button(document, {
      label: clearLabel,
      disabled: state.busy,
      title: state.busy ? messages.t("disabled.busy") : clearLabel,
      onClick: () => {
        const removed = logger.clear();
        state.lastError = null;
        regions.shell.setStatus(i18n.t("message.logsCleared", { count: removed }), "ok");
        regions.shell.rerender();
      }
    })
  );

  const debugLabel = logger.isDebugMode()
    ? i18n.t("action.disableDebug")
    : i18n.t("action.enableDebug");
  regions.actions.appendChild(
    button(document, {
      label: debugLabel,
      disabled: state.busy,
      title: state.busy ? messages.t("disabled.busy") : debugLabel,
      onClick: () => {
        if (logger.isDebugMode()) {
          logger.disableDebugMode();
          regions.shell.setStatus(i18n.t("message.debugDisabled"));
        } else {
          logger.enableDebugMode();
          regions.shell.setStatus(i18n.t("message.debugEnabled"), "ok");
        }
        regions.shell.rerender();
      }
    })
  );
}

function renderCurrentError(
  viewId: string,
  regions: RenderRegions,
  services: PanelServices
): void {
  const error = state.lastError;
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
  const { i18n } = services;
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

function setBusy(shell: Shell, busy: boolean): void {
  state.busy = busy;
  shell.rerender();
}

async function refreshContext(
  shell: Shell,
  services: PanelServices,
  dispatch: Dispatcher
): Promise<void> {
  const { i18n } = services;
  state.lastError = null;
  shell.setStatus(i18n.t("status.readingContext"), "busy");
  setBusy(shell, true);

  const response = (await dispatch("pr.context.read")) as CommandResponse<ContextData>;
  if (!response.ok || !response.data) {
    state.context = null;
    reportFailure(shell, services, response, "context");
    setBusy(shell, false);
    return;
  }

  state.context = response.data;
  shell.setStatus(i18n.t("status.connected"), "ok");
  setBusy(shell, false);
}

async function runSelfTest(
  shell: Shell,
  services: PanelServices,
  dispatch: Dispatcher
): Promise<void> {
  const { i18n, messages } = services;
  state.lastError = null;
  shell.setStatus(messages.t("status.runningSelfTest"), "busy");
  setBusy(shell, true);

  const response = (await dispatch("pr.diagnostics.selfTest")) as CommandResponse<SelfTestData>;
  if (!response.ok || !response.data) {
    reportFailure(shell, services, response, "system");
    setBusy(shell, false);
    return;
  }

  state.selfTest = response.data;
  const allPassed = response.data.passed === response.data.total;
  shell.setStatus(
    i18n.t(allPassed ? "status.connected" : "status.notCompleted"),
    allPassed ? "ok" : "error"
  );
  setBusy(shell, false);
}

async function runSystemCheck(
  shell: Shell,
  services: PanelServices,
  dispatch: Dispatcher
): Promise<void> {
  const { i18n } = services;
  state.lastError = null;
  shell.setStatus(i18n.t("status.checkingSystem"), "busy");
  setBusy(shell, true);

  const response = (await dispatch("pr.capability.probe")) as CommandResponse<ProbeFacts>;
  if (!response.ok || !response.data) {
    reportFailure(shell, services, response, "system");
    setBusy(shell, false);
    return;
  }

  state.capabilities = buildCapabilities(response.data);
  shell.setStatus(i18n.t("status.connected"), "ok");
  setBusy(shell, false);
}

async function exportBundle(shell: Shell, services: PanelServices): Promise<void> {
  const { i18n, messages, logger, uxp } = services;
  state.lastError = null;
  shell.setStatus(messages.t("status.exporting"), "busy");
  setBusy(shell, true);

  const result = await exportDiagnosticsBundle(uxp, logger.exportBundle());

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

    state.lastError = {
      viewId: "diagnostics",
      message,
      recovery
    };

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

  setBusy(shell, false);
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
