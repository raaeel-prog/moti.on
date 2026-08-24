/**
 * Comandos do Premiere Pro no P0.
 *
 * Os dois leem, nenhum muta. Isso é deliberado: o CHMS-005 entrega a fronteira
 * de transação testada, e o primeiro comando que de fato altera uma sequência
 * chega quando houver uma feature que precise dele. Escrever um comando mutante
 * agora, sem feature, seria inventar um caso de uso para exercitar código.
 */
import type { CommandFailure } from "@motion/contracts";

import type { PremiereCommandContext, PremiereCommandHandler } from "./adapter.js";

/**
 * `pr.context.read` — lê projeto e sequência ativa.
 */
export const contextRead: PremiereCommandHandler = {
  async preflight(): Promise<CommandFailure | null> {
    // Ler o contexto funciona mesmo sem projeto: a resposta é "nenhum projeto
    // aberto", que é informação útil, não erro. `null` explícito declara que a
    // ausência de validação é decisão e não esquecimento.
    return null;
  },

  async run(context: PremiereCommandContext) {
    const { project } = context;

    if (!project) {
      return {
        changed: false,
        warnings: [],
        data: {
          host: "Premiere Pro",
          hasProject: false,
          projectName: null,
          projectPath: null,
          sequenceName: null,
          sequenceCount: 0,
          videoTrackCount: null,
          audioTrackCount: null
        }
      };
    }

    const [activeSequence, sequences] = await Promise.all([
      project.getActiveSequence(),
      project.getSequences()
    ]);

    const trackCounts = activeSequence
      ? await Promise.all([activeSequence.getVideoTrackCount(), activeSequence.getAudioTrackCount()])
      : [null, null];

    return {
      changed: false,
      warnings: [],
      data: {
        host: "Premiere Pro",
        hasProject: true,
        // Nomes e caminhos vão crus para o painel, que os exibe. O que NÃO pode
        // acontecer é irem para o log: a §25 proíbe registrar nome e caminho de
        // projeto, e a redaction que garante isso chega no CHMS-007.
        projectName: project.name,
        projectPath: project.path,
        sequenceName: activeSequence ? activeSequence.name : null,
        sequenceCount: sequences.length,
        videoTrackCount: trackCounts[0],
        audioTrackCount: trackCounts[1]
      }
    };
  }
};

/**
 * `pr.diagnostics.selfTest` — verifica que o módulo `premierepro` responde.
 *
 * Cada verificação é um fato observado, não uma suposição. Um autoteste que
 * reporta sucesso sem ter medido nada é pior que autoteste nenhum: dá confiança
 * onde não há base para ela.
 */
export const selfTest: PremiereCommandHandler = {
  async preflight(): Promise<CommandFailure | null> {
    return null;
  },

  async run(context: PremiereCommandContext) {
    const { premiere, project } = context;
    const checks: Array<{ name: string; ok: boolean; detail: string | null }> = [];

    const hasModule = Boolean(premiere && premiere.Project);
    checks.push({
      name: "module.premierepro",
      ok: hasModule,
      detail: hasModule ? null : "O módulo premierepro não foi carregado."
    });

    checks.push({
      name: "project.active",
      ok: Boolean(project),
      detail: project ? null : "Nenhum projeto aberto."
    });

    // Sondagem por símbolo, não por versão. A §9 é explícita: nenhuma feature
    // pode depender apenas de comparar hostVersion.
    const hasTransactionApi =
      Boolean(project) &&
      typeof project?.executeTransaction === "function" &&
      typeof project?.lockedAccess === "function";

    checks.push({
      name: "project.transactionApi",
      ok: hasTransactionApi,
      detail: hasTransactionApi
        ? null
        : "lockedAccess e executeTransaction não foram encontrados. Requer Premiere Pro 25.6 ou posterior."
    });

    return {
      changed: false,
      // Um autoteste com verificação reprovada não é falha do comando: o comando
      // fez o trabalho dele, que era medir. A reprovação vai como aviso, e a UI
      // mostra qual linha falhou.
      warnings: checks
        .filter((check) => !check.ok)
        .map((check) => ({
          code: "SELF_TEST_CHECK_FAILED",
          message: check.detail ?? `Verificação ${check.name} não passou.`,
          details: { check: check.name }
        })),
      data: {
        checks,
        passed: checks.filter((check) => check.ok).length,
        total: checks.length
      }
    };
  }
};
