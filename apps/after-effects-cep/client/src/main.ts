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
  button,
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

const VIEWS: ShellView[] = [
  { id: "context", labelKey: "nav.context", titleKey: "view.context.title" },
  { id: "system", labelKey: "nav.system", titleKey: "view.system.title" },
  { id: "diagnostics", labelKey: "nav.diagnostics", titleKey: "view.diagnostics.title" }
];

/** Versão do plugin, embutida no bundle para aparecer no bundle de suporte. */
const PLUGIN_VERSION = "0.1.0";

const state: {
  context: ContextData | null;
  capabilities: HostCapabilities | null;
  lastError: string | null;
  busy: boolean;
  busyReason: string | null;
} = {
  context: null,
  capabilities: null,
  lastError: null,
  busy: false,
  busyReason: null
};

function start(): void {
  const mount = document.getElementById("root");
  if (!mount) {
    return;
  }

  const logger = createLogger({ pluginVersion: PLUGIN_VERSION });
  const i18n = createI18n({});

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
    onRender: (viewId, regions) => renderView(viewId, regions, { i18n, logger, adapter })
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
}

function renderView(viewId: string, regions: RenderRegions, wiring: Wiring): void {
  const { i18n, logger, adapter } = wiring;

  if (!adapter) {
    regions.content.appendChild(notice(document, i18n.t("message.outsideHost"), "error"));
    return;
  }

  const shell = regions.shell;
  const client = adapter.client;

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
