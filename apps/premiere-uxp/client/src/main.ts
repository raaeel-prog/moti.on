/**
 * Raiz de composição do painel do Premiere Pro.
 *
 * Diferente do After Effects, aqui não existe ponte a atravessar: o UXP roda o
 * painel e o código de host no mesmo runtime, então o adapter é chamado direto,
 * sem serialização e sem escape. O que continua igual é o **contrato** — o mesmo
 * `CommandRequest`, os mesmos 22 códigos de erro, a mesma regra do `ok` — porque
 * é o contrato, e não o transporte, que mantém os dois hosts coerentes.
 *
 * Isso também é o motivo de o adapter existir como camada separada em vez de o
 * painel chamar `premierepro` direto: quando o CHMS-008 trouxer o shell de UI
 * compartilhado, ele fala com um `dispatch(request)` que funciona igual nos dois
 * lados.
 */
import type { CommandRequest, CommandResponse, HostCapabilities } from "@motion/contracts";
import { buildCapabilities, type ProbeFacts } from "@motion/capability-matrix";
import { PROTOCOL_VERSION } from "@motion/contracts";

import { createPremiereAdapter } from "../../host/src/adapter.js";
import { capabilityProbe, contextRead, selfTest } from "../../host/src/commands.js";
import type { PremiereModule } from "../../host/src/premiere-api.js";

interface UxpEntrypoints {
  setup(config: {
    plugin?: { create?: () => void; destroy?: () => void };
    panels?: Record<string, { show?: () => void }>;
  }): void;
}

declare function require(module: string): unknown;

interface ContextData {
  hasProject: boolean;
  projectName: string | null;
  projectPath: string | null;
  sequenceName: string | null;
  sequenceCount: number;
  videoTrackCount: number | null;
  audioTrackCount: number | null;
}

interface SelfTestData {
  checks: Array<{ name: string; ok: boolean; detail: string | null }>;
  passed: number;
  total: number;
}

type StatusState = "ok" | "error" | "busy";

function element(id: string): HTMLElement | null {
  return document.getElementById(id);
}

function setText(id: string, value: string): void {
  const node = element(id);
  if (node) node.textContent = value;
}

function setStatus(message: string, state?: StatusState): void {
  const dot = element("statusDot");
  if (dot) dot.className = "status-dot" + (state ? ` is-${state}` : "");
  setText("statusText", message);
}

function setLog(message: string, state?: StatusState): void {
  const box = element("logBox");
  if (!box) return;
  box.className = "log-box" + (state ? ` is-${state}` : "");
  box.textContent = message;
}

function setBusy(busy: boolean): void {
  for (const id of ["refreshButton", "selfTestButton", "systemCheckButton"]) {
    const button = element(id);
    if (button instanceof HTMLButtonElement) button.disabled = busy;
  }
}

function orDash(value: string | number | null | undefined, fallback = "—"): string {
  return value === null || value === undefined || value === "" ? fallback : String(value);
}

function reportFailure(response: CommandResponse): void {
  const error = response.error;
  if (!error) {
    setLog("O comando falhou sem informar o motivo.", "error");
    return;
  }
  setStatus(error.recoverable ? "Não foi possível concluir" : "Erro", "error");
  setLog(`[${error.code}] ${error.message}`, "error");
}

let requestCounter = 0;

/**
 * `requestId` mesmo sem ponte a correlacionar.
 *
 * Aqui a chamada é direta e a correlação é trivialmente garantida. O id continua
 * existindo porque ele é o que amarra a resposta ao pedido **no log**: quando o
 * CHMS-007 trouxer o logger com redaction, um diagnóstico exportado precisa
 * permitir reconstruir a sequência de operações, e sem id isso vira adivinhação.
 */
function nextRequestId(): string {
  const cryptoObject = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (typeof cryptoObject?.randomUUID === "function") return cryptoObject.randomUUID();
  requestCounter += 1;
  return `${Date.now().toString(36)}-${requestCounter}`;
}

async function start(): Promise<void> {
  let premiere: PremiereModule;

  try {
    premiere = require("premierepro") as PremiereModule;
  } catch {
    // Painel aberto fora do Premiere, ou versão sem o módulo. Estado honesto em
    // vez de tela em branco.
    setStatus("Fora do Premiere Pro", "error");
    setLog(
      "Este painel só funciona carregado dentro do Premiere Pro 25.6 ou posterior. " +
        "Consulte docs/INSTALLATION.md.",
      "error"
    );
    setBusy(true);
    return;
  }

  const uiLocale = (() => {
    try {
      const uxp = require("uxp") as { host?: { uiLocale?: string } };
      return uxp.host?.uiLocale;
    } catch {
      // uiLocale não é essencial: sem ele o rótulo de Desfazer cai no inglês, o
      // que é degradação visível e não silenciosa.
      return undefined;
    }
  })();

  const adapter = createPremiereAdapter({
    premiere,
    logger: {
      warn(message: string) {
        setLog(message, "error");
      }
    }
  });

  adapter.register("pr.context.read", contextRead);
  adapter.register("pr.diagnostics.selfTest", selfTest);
  adapter.register("pr.capability.probe", capabilityProbe);

  function buildRequest(command: string): CommandRequest {
    return {
      protocolVersion: PROTOCOL_VERSION,
      requestId: nextRequestId(),
      command,
      args: {},
      context: {
        host: "premiere-pro",
        hostVersion: "unknown",
        ...(uiLocale ? { locale: uiLocale } : {})
      }
    };
  }

  async function refreshContext(): Promise<void> {
    setBusy(true);
    setStatus("Lendo o contexto…", "busy");

    const response = (await adapter.dispatch(buildRequest("pr.context.read"))) as CommandResponse<ContextData>;

    if (!response.ok || !response.data) {
      reportFailure(response);
      setBusy(false);
      return;
    }

    const data = response.data;
    setText("projectName", orDash(data.projectName, "Nenhum projeto aberto"));
    setText("projectPath", orDash(data.projectPath, "Projeto ainda não salvo"));
    setText("sequenceName", orDash(data.sequenceName, "Nenhuma sequência ativa"));
    setText("sequenceCount", String(data.sequenceCount));
    setText(
      "trackCount",
      data.videoTrackCount === null
        ? "—"
        : `${data.videoTrackCount} vídeo · ${data.audioTrackCount} áudio`
    );

    setStatus("Conectado", "ok");
    setLog(`Contexto lido em ${response.timing?.durationMs ?? 0} ms.`, "ok");
    setBusy(false);
  }

  async function runSelfTest(): Promise<void> {
    setBusy(true);
    setStatus("Executando autoteste…", "busy");

    const response = (await adapter.dispatch(
      buildRequest("pr.diagnostics.selfTest")
    )) as CommandResponse<SelfTestData>;

    if (!response.ok || !response.data) {
      reportFailure(response);
      setBusy(false);
      return;
    }

    // Cada linha mostra o que foi medido. Uma verificação reprovada traz o
    // motivo, não só o símbolo de erro: "falhou" sem motivo obriga o usuário a
    // adivinhar o que fazer.
    const lines = response.data.checks.map(
      (check) => `${check.ok ? "✓" : "✕"} ${check.name}${check.detail ? ` — ${check.detail}` : ""}`
    );

    const allPassed = response.data.passed === response.data.total;
    setStatus(allPassed ? "Conectado" : "Verificações pendentes", allPassed ? "ok" : "error");
    setLog(lines.join("\n"), allPassed ? "ok" : "error");
    setBusy(false);
  }

  /**
   * Executa a sonda e mostra a matriz de capacidades.
   *
   * A view completa de Settings → System Check chega no CHMS-008, junto com o
   * shell de navegação. Até lá o resultado sai na caixa de log — que é feio, e é
   * informação real: cada linha é resultado de sonda, não suposição. Deixar a
   * sonda sem nenhuma saída visível até a UI ficar pronta seria construir código
   * que ninguém consegue exercitar.
   */
  async function runSystemCheck(): Promise<void> {
    setBusy(true);
    setStatus("Verificando o sistema…", "busy");

    const response = (await adapter.dispatch(
      buildRequest("pr.capability.probe")
    )) as CommandResponse<ProbeFacts>;

    if (!response.ok || !response.data) {
      reportFailure(response);
      setBusy(false);
      return;
    }

    const capabilities: HostCapabilities = buildCapabilities(response.data);

    const lines = Object.entries(capabilities.findings).map(([key, finding]) => {
      const mark = finding.state === "available" ? "✓" : finding.state === "unknown" ? "?" : "✕";
      // A razão sai junto: a §9 exige que todo requisito ausente seja explicado,
      // e "indisponível" sozinho obriga o usuário a adivinhar o que fazer.
      return `${mark} ${key}${finding.reasonKey ? ` — ${finding.reasonKey}` : ""}`;
    });

    setStatus("Conectado", "ok");
    setLog([`Tier de suporte: ${capabilities.supportTier}`, ...lines].join("\n"), "ok");
    setBusy(false);
  }

  element("refreshButton")?.addEventListener("click", () => void refreshContext());
  element("selfTestButton")?.addEventListener("click", () => void runSelfTest());
  element("systemCheckButton")?.addEventListener("click", () => void runSystemCheck());

  await refreshContext();
}

// O UXP exige os hooks de ciclo de vida. Vazios de propósito: não há nada a
// fazer neles, e o logger estruturado que registraria o ciclo chega no CHMS-007.
const entrypoints = (require("uxp") as { entrypoints: UxpEntrypoints }).entrypoints;

entrypoints.setup({
  plugin: {
    create() {},
    destroy() {}
  },
  panels: {
    mainPanel: {
      show() {
        void start();
      }
    }
  }
});

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => void start());
} else {
  void start();
}
