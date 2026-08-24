/**
 * Raiz de composição do painel do After Effects.
 *
 * Liga apresentação → cliente de comandos → adapter de host. Este arquivo e o
 * `host-adapter.ts` são os únicos que sabem que o host é o After Effects; tudo
 * que for reaproveitável entre os dois hosts vive em `packages/`.
 *
 * A camada de apresentação aqui ainda é DOM direto sobre o HTML do starter. O
 * shell de navegação, os tokens e a i18n chegam no CHMS-008; substituir o painel
 * agora, no mesmo commit que troca a ponte inteira, tornaria impossível saber
 * qual das duas mudanças quebrou o que.
 */
import type { CommandResponse, HostCapabilities } from "@motion/contracts";
import { buildCapabilities, type ProbeFacts } from "@motion/capability-matrix";

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
  for (const id of ["refreshButton", "createDemoButton", "echoButton", "systemCheckButton"]) {
    const button = element(id);
    if (button instanceof HTMLButtonElement) button.disabled = busy;
  }
}

/** Texto para um valor que o host devolveu como `null`. */
function orDash(value: string | number | null | undefined, fallback = "—"): string {
  return value === null || value === undefined || value === "" ? fallback : String(value);
}

function renderContext(data: ContextData): void {
  setText("hostVersion", orDash(data.hostVersion));
  setText("projectName", orDash(data.projectName, "Projeto ainda não salvo"));
  setText("projectPath", orDash(data.projectPath, "Projeto ainda não salvo"));
  setText("activeItemName", orDash(data.activeItemName, "Nenhum"));

  setText(
    "compositionInfo",
    data.isComposition
      ? `${orDash(data.compWidth)} × ${orDash(data.compHeight)} · ${orDash(data.compDuration)} s · ${orDash(data.compFrameRate)} fps`
      : "Nenhuma composição ativa"
  );
}

/**
 * Mostra uma falha ao usuário.
 *
 * Nunca só "erro": o contrato garante `code`, `message` e `recoverable`, e a
 * mensagem que o usuário lê inclui os três. Um erro sem ação corretiva obriga a
 * pessoa a adivinhar, e é isso que a §8 do master spec proíbe.
 */
function reportFailure(response: CommandResponse): void {
  const error = response.error;
  if (!error) {
    setLog("O comando falhou sem informar o motivo.", "error");
    return;
  }

  setStatus(error.recoverable ? "Não foi possível concluir" : "Erro", "error");
  setLog(`[${error.code}] ${error.message}`, "error");
}

async function start(): Promise<void> {
  const logger = {
    // O logger estruturado com redaction chega no CHMS-007. Até lá, mensagens de
    // diagnóstico do transporte vão para a caixa de log do painel, que é visível
    // ao usuário — e não para o console, banido pela §34.
    warn(message: string) {
      setLog(message, "error");
    }
  };

  const adapter = createAeHostAdapter(logger);

  if (!adapter) {
    setStatus("Fora do After Effects", "error");
    setLog(
      "Este painel só funciona carregado dentro do After Effects. " +
        "Consulte docs/INSTALLATION.md para instalar a extensão em modo de desenvolvimento.",
      "error"
    );
    setBusy(true);
    return;
  }

  const { client } = adapter;

  async function refreshContext(): Promise<void> {
    setBusy(true);
    setStatus("Lendo o contexto…", "busy");

    const response = await client.execute<ContextData>("ae.context.read");

    if (!response.ok || !response.data) {
      reportFailure(response);
      setBusy(false);
      return;
    }

    renderContext(response.data);
    setStatus("Conectado", "ok");
    setLog(`Contexto lido em ${response.timing?.durationMs ?? 0} ms.`, "ok");
    setBusy(false);
  }

  async function createDemo(): Promise<void> {
    setBusy(true);
    setStatus("Criando composição…", "busy");

    const response = await client.execute<{ compositionName: string }>("ae.demo.createComposition");

    if (!response.ok || !response.data) {
      reportFailure(response);
      setBusy(false);
      return;
    }

    setStatus("Conectado", "ok");
    setLog(
      `Composição "${response.data.compositionName}" criada. Um único Ctrl+Z desfaz a operação inteira.`,
      "ok"
    );
    await refreshContext();
  }

  /**
   * Verifica a integridade da ponte com o host.
   *
   * Manda um valor conhecido — com acento, CJK, emoji e caractere de controle —
   * e confere o que volta. É a única forma de saber se os escapes das duas
   * direções estão íntegros *nesta máquina, com esta codepage, nesta versão do
   * After Effects*. Sem isso, um usuário com o painel quebrado só teria "não
   * funciona" para relatar.
   */
  async function verifyBridge(): Promise<void> {
    setBusy(true);
    setStatus("Verificando a ponte…", "busy");

    const probe = 'Composição 日本語 🎬 "aspas" \\barra\\ ';
    const response = await client.execute<{ payload: string }>("ae.diagnostics.echo", {
      payload: probe
    });

    if (!response.ok || !response.data) {
      reportFailure(response);
      setBusy(false);
      return;
    }

    if (response.data.payload === probe) {
      setStatus("Conectado", "ok");
      setLog("Ponte com o host íntegra: o payload voltou idêntico ao enviado.", "ok");
    } else {
      // Falha silenciosa é o pior resultado possível aqui: significa que dados
      // do usuário estão sendo corrompidos no transporte sem ninguém perceber.
      setStatus("Ponte corrompida", "error");
      setLog(
        "O payload voltou diferente do enviado. Caracteres acentuados ou não latinos " +
          "podem estar sendo corrompidos nesta máquina. Exporte o diagnóstico antes de usar o plugin.",
        "error"
      );
    }

    setBusy(false);
  }

  /**
   * Executa a sonda e mostra a matriz de capacidades.
   *
   * A view completa de Settings → System Check chega no CHMS-008, junto com o
   * shell de navegação. Até lá o resultado sai na caixa de log — feio, e
   * informação real: cada linha é resultado de sonda, não suposição.
   */
  async function runSystemCheck(): Promise<void> {
    setBusy(true);
    setStatus("Verificando o sistema…", "busy");

    const response = await client.execute<ProbeFacts>("ae.capability.probe");

    if (!response.ok || !response.data) {
      reportFailure(response);
      setBusy(false);
      return;
    }

    const capabilities: HostCapabilities = buildCapabilities(response.data);

    const lines = Object.entries(capabilities.findings).map(([key, finding]) => {
      const mark = finding.state === "available" ? "✓" : finding.state === "unknown" ? "?" : "✕";
      return `${mark} ${key}${finding.reasonKey ? ` — ${finding.reasonKey}` : ""}`;
    });

    setStatus("Conectado", "ok");
    setLog(
      [
        `Tier de suporte: ${capabilities.supportTier}`,
        `Motor de expressões: ${capabilities.expressionEngine}`,
        ...lines
      ].join("\n"),
      "ok"
    );
    setBusy(false);
  }

  element("refreshButton")?.addEventListener("click", () => void refreshContext());
  element("systemCheckButton")?.addEventListener("click", () => void runSystemCheck());
  element("createDemoButton")?.addEventListener("click", () => void createDemo());
  element("echoButton")?.addEventListener("click", () => void verifyBridge());

  await refreshContext();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => void start());
} else {
  void start();
}
