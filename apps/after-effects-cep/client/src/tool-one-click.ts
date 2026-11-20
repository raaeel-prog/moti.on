/**
 * Ferramentas de um clique (plano 2026-11-19, docs/PLANO_FERRAMENTAS_UM_CLIQUE_2026-11-19.md).
 *
 * - "apply": o clique aplica o preset padrão premium; depois o botão Editar,
 *   ao lado da busca, abre a página da ferramenta.
 * - "run": o clique executa a operação; não há o que editar depois.
 * - "open": a ferramenta precisa de uma escolha (alvo, fonte, cores, arquivo)
 *   e o clique abre a página dela.
 *
 * Alt+clique continua abrindo a página em qualquer ladrilho. Parallax fica em "open":
 * tem aba própria, com prévia da receita antes de aplicar.
 */
export type ToolClickMode = "apply" | "run" | "open";

const APPLY_TOOLS: ReadonlySet<string> = new Set([
  "wiggle", "flicker", "smooth", "loopOut", "inertial", "jump", "animateKinetic", "verticalPulse",
  "wordReveal", "variableMorph", "wave", "glitch", "echo", "neon", "textBox", "trimPath", "orbit",
  "timeController"
]);
const RUN_TOOLS: ReadonlySet<string> = new Set([
  "reverseOrder", "cutKeys", "delay", "copyKeys", "pasteKeys", "breakShape", "aiToVector",
  "textToVector", "timeMarkerLoop"
]);

export function toolClickMode(toolId: string): ToolClickMode {
  if (APPLY_TOOLS.has(toolId)) return "apply";
  if (RUN_TOOLS.has(toolId)) return "run";
  return "open";
}

/** How many applied tools the Edit button remembers per selection. */
const APPLIED_MAX = 6;
/** Selections remembered at once; older ones fall off first. */
const SELECTIONS_MAX = 24;

/**
 * Lembra, por seleção, as ferramentas "apply" aplicadas nesta sessão do painel.
 *
 * É o que alimenta o botão Editar ao lado da busca: aparece quando a seleção
 * atual recebeu um efeito pelo clique rápido e some quando a seleção muda para
 * algo sem efeito lembrado. Não lê a camada no host — uma camada animada em
 * outra sessão do painel ainda se edita pelo Alt+clique.
 */
export interface AppliedTools {
  record(selectionKey: string, toolId: string): void;
  forget(selectionKey: string, toolId: string): void;
  /** Newest first. */
  list(selectionKey: string): readonly string[];
}

export function createAppliedTools(): AppliedTools {
  let entries: ReadonlyArray<readonly [string, readonly string[]]> = [];
  const without = (key: string) => entries.filter(([entry]) => entry !== key);
  const current = (key: string): readonly string[] => entries.find(([entry]) => entry === key)?.[1] ?? [];
  return {
    record(key, toolId) {
      if (!key) return;
      const tools = [toolId, ...current(key).filter(id => id !== toolId)].slice(0, APPLIED_MAX);
      entries = [[key, tools] as const, ...without(key)].slice(0, SELECTIONS_MAX);
    },
    forget(key, toolId) {
      const tools = current(key).filter(id => id !== toolId);
      entries = tools.length ? entries.map(entry => entry[0] === key ? [key, tools] as const : entry) : without(key);
    },
    list: key => current(key)
  };
}
