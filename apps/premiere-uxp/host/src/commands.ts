/**
 * Comandos do Premiere Pro no P0.
 *
 * Os dois leem, nenhum muta. Isso é deliberado: o CHMS-005 entrega a fronteira
 * de transação testada, e o primeiro comando que de fato altera uma sequência
 * chega quando houver uma feature que precise dele. Escrever um comando mutante
 * agora, sem feature, seria inventar um caso de uso para exercitar código.
 */
import type { CommandFailure } from "@motion/contracts";
import type { ProbeFacts, ProbeResult } from "@motion/capability-matrix";

import type { PremiereCommandContext, PremiereCommandHandler } from "./adapter.js";
import type { PremiereSequence } from "./premiere-api.js";

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
          hostVersion: context.hostVersion,
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
        hostVersion: context.hostVersion,
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
    const checks: Array<{ name: string; ok: boolean; detailKey: string | null }> = [];

    const hasModule = Boolean(premiere && premiere.Project);
    checks.push({
      name: "module.premierepro",
      ok: hasModule,
      detailKey: hasModule ? null : "selfTest.detail.moduleUnavailable"
    });

    const hasHostVersion = context.hostVersion !== "unknown";
    checks.push({
      name: "host.version",
      ok: hasHostVersion,
      detailKey: hasHostVersion ? null : "selfTest.detail.hostVersionUnknown"
    });

    checks.push({
      name: "project.active",
      ok: Boolean(project),
      detailKey: project ? null : "selfTest.detail.noProject"
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
      detailKey: hasTransactionApi
        ? null
        : project
          ? "selfTest.detail.transactionUnavailable"
          : "selfTest.detail.transactionNotChecked"
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
          message: check.detailKey ?? "selfTest.detail.checkFailed",
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

/**
 * `pr.capability.probe` — coleta os fatos crus de capacidade do Premiere Pro.
 *
 * Coleta, e não decide. A derivação da matriz é a função pura `buildCapabilities`
 * em `packages/capability-matrix`, compartilhada com o After Effects — é isso que
 * impede os dois hosts de divergirem em silêncio sobre o que "disponível"
 * significa.
 *
 * Toda sonda é por **presença de símbolo**, nunca por comparação de versão. A §9
 * é explícita: nenhuma feature pode depender apenas de `parseFloat(hostVersion)`.
 * Um Premiere 26.3 com o módulo de transcrição indisponível e um 26.2 com ele
 * presente existem os dois na prática.
 */
export const capabilityProbe: PremiereCommandHandler = {
  async preflight(): Promise<CommandFailure | null> {
    return null;
  },

  async run(context: PremiereCommandContext) {
    const { premiere, project } = context;

    /** Executa uma sonda, devolvendo "unknown" quando ela lança. */
    const safe = (probe: () => boolean): ProbeResult => {
      try {
        return probe() === true;
      } catch {
        return "unknown";
      }
    };

    let activeSequence: PremiereSequence | null = null;
    let activeSequenceKnown = true;
    if (project) {
      try {
        activeSequence = await project.getActiveSequence();
      } catch {
        activeSequenceKnown = false;
      }
    }

    const moduleRecord = premiere as unknown as Record<string, unknown>;

    const hasMethods = (target: unknown, methods: string[]): boolean => {
      if ((typeof target !== "object" && typeof target !== "function") || target === null) {
        return false;
      }

      const record = target as Record<string, unknown>;
      return methods.every((method) => typeof record[method] === "function");
    };

    const transcript = (): unknown => moduleRecord["Transcript"];

    const canInsertMogrt: ProbeResult = (() => {
      const hasEditorFactory = safe(() => hasMethods(moduleRecord["SequenceEditor"], ["getEditor"]));
      if (hasEditorFactory !== true) {
        return hasEditorFactory;
      }
      if (!activeSequence) {
        // A factory sozinha não prova que a instância expõe inserção. Sem uma
        // sequência não existe objeto documentado que possa ser inspecionado.
        return "unknown";
      }

      return safe(() => {
        const sequenceEditor = moduleRecord["SequenceEditor"] as Record<string, unknown>;
        const getEditor = sequenceEditor["getEditor"] as (sequence: unknown) => unknown;
        const editor = getEditor.call(sequenceEditor, activeSequence);
        return (
          hasMethods(editor, ["insertMogrtFromPath"]) ||
          hasMethods(editor, ["insertMogrtFromLibrary"])
        );
      });
    })();

    const canReadCaptionTracks: ProbeResult = activeSequence
      ? safe(() => hasMethods(activeSequence, ["getCaptionTrackCount", "getCaptionTrack"]))
      : "unknown";

    const reasons: NonNullable<ProbeFacts["reasons"]> = {
      canUseNativeAddon: "capability.reason.addonNotPackaged",
      canReachCompanion: "capability.reason.companionNotImplemented"
    };

    const facts: ProbeFacts = {
      host: "premiere-pro",
      hostVersion: context.hostVersion,

      hasProject: Boolean(project),
      hasActiveSequence: activeSequenceKnown ? Boolean(activeSequence) : "unknown",

      // O adapter recebe este fato da presença real de getFileForSaving no UXP.
      // A existência de `file.write` ainda é validada depois que o usuário
      // escolhe o destino, porque antes disso não há File para inspecionar.
      canWriteFiles: context.runtime.canWriteFiles,
      // network não está declarado no manifest. Isso é escolha, não limitação:
      // o P0 não fala com a rede, e a permissão chega com o provider no CHMS-029.
      canAccessNetwork: false,

      canUseNativeAddon: false,
      canReachCompanion: false,

      // Cada flag verifica o método documentado que executa aquela operação.
      // Objetos estáticos como Transcript/CaptionTrack não são construtores.
      canInsertMogrt,
      canReadTranscript: safe(() => hasMethods(transcript(), ["exportToJSON"])),
      canImportTranscript: safe(() =>
        hasMethods(transcript(), ["importFromJSON", "createImportTextSegmentsAction"])
      ),
      canQueryTranscriptLanguages: safe(() =>
        hasMethods(transcript(), ["querySupportedLanguages"])
      ),
      canReadCaptionTracks,

      reasons
    };

    return {
      changed: false,
      warnings: [],
      data: facts as unknown as Record<string, unknown>
    };
  }
};
