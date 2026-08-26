/**
 * Catálogo de comandos.
 *
 * Fonte única sobre o que cada comando **é** — separada de onde ele é
 * implementado. O host registra comportamento (`preflight` e `run`); os
 * requisitos vêm daqui.
 *
 * A separação existe porque um comando que declarasse a própria destrutividade
 * colocaria essa declaração a um caractere de distância do código que apaga dado
 * do usuário. `destructive: false` escrito por engano num comando destrutivo
 * derruba toda a proteção do dispatcher de uma vez.
 *
 * Este arquivo também é o que garante que painel e host falam do mesmo conjunto:
 * um comando registrado no host sem descriptor, ou um descriptor sem
 * implementação, é um botão que nunca funciona ou um comando que a UI nunca
 * oferece. O teste de contrato compara os dois conjuntos.
 */
import type { CapabilityRequirement, HostId } from "@motion/contracts";

export interface CommandDescriptor {
  id: string;
  hosts: HostId[];

  /**
   * Capacidades que precisam estar disponíveis. O dispatcher recusa o comando
   * antes de qualquer mutação quando um requisito não é atendido, e a UI usa a
   * mesma lista para explicar exatamente o que falta num botão desabilitado.
   */
  requirements: CapabilityRequirement[];

  /**
   * Apaga ou substitui dado que o usuário criou. Exige `allowDestructive`
   * explícito no pedido; sem isso o dispatcher devolve `PERMISSION_DENIED`.
   *
   * Nem todo comando que muta é destrutivo: criar uma composição muta e não
   * destrói nada.
   */
  destructive: boolean;

  /**
   * Altera o projeto. É o que decide se o dispatcher abre um grupo de Undo, e é
   * o que faz a regra do `ok` funcionar: um comando que muta e reporta que nada
   * mudou não pode responder `ok: true`.
   */
  mutates: boolean;

  /** Sucesso idempotente quando o estado desejado ja existe. */
  allowsNoopSuccess: boolean;

  supportsDryRun: boolean;
  supportsCancel: boolean;

  /**
   * Chave i18n do rótulo que aparece em Edit > Undo. Chave e não frase: o
   * usuário vê o histórico de Undo no idioma dele.
   */
  undoLabelKey: string;

  /**
   * Teto em milissegundos. Estourar não significa que nada aconteceu — a
   * operação pode ter sido aplicada no host e apenas a resposta não voltou. A
   * mensagem de timeout precisa dizer isso.
   */
  timeoutMs: number;
}

const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * Comandos da fase P0.
 *
 * São quatro comandos que fazem trabalho real, não amostras: três substituem o
 * que o starter já expunha, e `diagnostics.echo` existe para que o caminho de
 * payload grande por arquivo temporário tenha um consumidor de verdade em vez de
 * ficar sem exercício até alguma fase futura.
 */
export const COMMAND_DESCRIPTORS: readonly CommandDescriptor[] = [
  {
    id: "ae.context.read",
    hosts: ["after-effects"],
    requirements: [],
    destructive: false,
    mutates: false,
    allowsNoopSuccess: false,
    supportsDryRun: false,
    supportsCancel: false,
    undoLabelKey: "undo.none",
    timeoutMs: DEFAULT_TIMEOUT_MS
  },
  {
    id: "ae.diagnostics.echo",
    hosts: ["after-effects"],
    requirements: [],
    destructive: false,
    mutates: false,
    allowsNoopSuccess: false,
    supportsDryRun: true,
    supportsCancel: false,
    undoLabelKey: "undo.none",
    timeoutMs: DEFAULT_TIMEOUT_MS
  },
  {
    id: "ae.capability.probe",
    hosts: ["after-effects"],
    requirements: [],
    destructive: false,
    mutates: false,
    allowsNoopSuccess: false,
    supportsDryRun: false,
    supportsCancel: false,
    undoLabelKey: "undo.none",
    timeoutMs: DEFAULT_TIMEOUT_MS
  },
  {
    id: "pr.capability.probe",
    hosts: ["premiere-pro"],
    requirements: [],
    destructive: false,
    mutates: false,
    allowsNoopSuccess: false,
    supportsDryRun: false,
    supportsCancel: false,
    undoLabelKey: "undo.none",
    timeoutMs: DEFAULT_TIMEOUT_MS
  },
  {
    id: "ae.demo.createComposition",
    hosts: ["after-effects"],
    requirements: ["hasProject"],
    destructive: false,
    mutates: true,
    allowsNoopSuccess: false,
    supportsDryRun: false,
    supportsCancel: false,
    undoLabelKey: "undo.ae.demo.createComposition",
    // Criar composição e camada de texto envolve várias chamadas de DOM; o teto
    // padrão é apertado para um projeto grande com o disco ocupado.
    timeoutMs: 30_000
  },
  {
    id: "ae.expression.loopout",
    hosts: ["after-effects"],
    requirements: ["hasProject", "hasActiveComp", "expressionEngine"],
    destructive: false,
    mutates: true,
    allowsNoopSuccess: true,
    supportsDryRun: false,
    supportsCancel: false,
    undoLabelKey: "undo.ae.expression.loopout",
    timeoutMs: DEFAULT_TIMEOUT_MS
  },
  {
    id: "ae.expression.smooth",
    hosts: ["after-effects"],
    requirements: ["hasProject", "hasActiveComp", "expressionEngine"],
    destructive: false,
    mutates: true,
    // Reaplicar o mesmo Smooth em propriedades que ja o tem e um no-op legitimo,
    // e nao uma falha: o usuario pediu um estado, e o estado ja e esse.
    allowsNoopSuccess: true,
    supportsDryRun: false,
    supportsCancel: false,
    undoLabelKey: "undo.ae.expression.smooth",
    timeoutMs: DEFAULT_TIMEOUT_MS
  },
  {
    id: "ae.expression.wiggle",
    hosts: ["after-effects"],
    requirements: ["hasProject", "hasActiveComp", "expressionEngine"],
    destructive: false,
    mutates: true,
    allowsNoopSuccess: true,
    supportsDryRun: false,
    supportsCancel: false,
    undoLabelKey: "undo.ae.expression.wiggle",
    timeoutMs: DEFAULT_TIMEOUT_MS
  },
  {
    id: "ae.expression.flicker",
    hosts: ["after-effects"],
    requirements: ["hasProject", "hasActiveComp", "expressionEngine"],
    destructive: false,
    mutates: true,
    allowsNoopSuccess: true,
    supportsDryRun: false,
    supportsCancel: false,
    undoLabelKey: "undo.ae.expression.flicker",
    timeoutMs: DEFAULT_TIMEOUT_MS
  },
  {
    // Diferente dos comandos de expressao, este CRIA camadas — nao anota
    // propriedades ja existentes. `allowsNoopSuccess` continua verdadeiro
    // porque reaplicar sobre um texto que ja tem caixa gerenciada e um no-op
    // legitimo, e nao um erro.
    id: "ae.text.box",
    hosts: ["after-effects"],
    requirements: ["hasProject", "hasActiveComp", "expressionEngine"],
    destructive: false,
    mutates: true,
    allowsNoopSuccess: true,
    supportsDryRun: false,
    supportsCancel: false,
    undoLabelKey: "undo.ae.text.box",
    timeoutMs: DEFAULT_TIMEOUT_MS
  },
  {
    // Somente leitura: alimenta o seletor de camada alvo do painel.
    id: "ae.layer.list",
    hosts: ["after-effects"],
    requirements: ["hasProject", "hasActiveComp"],
    destructive: false,
    mutates: false,
    allowsNoopSuccess: false,
    supportsDryRun: false,
    supportsCancel: false,
    undoLabelKey: "undo.none",
    timeoutMs: DEFAULT_TIMEOUT_MS
  },
  {
    // Nao exige motor de expressoes: parentesco e transform puro.
    id: "ae.layer.parent",
    hosts: ["after-effects"],
    requirements: ["hasProject", "hasActiveComp"],
    destructive: false,
    mutates: true,
    allowsNoopSuccess: true,
    supportsDryRun: false,
    supportsCancel: false,
    undoLabelKey: "undo.ae.layer.parent",
    timeoutMs: DEFAULT_TIMEOUT_MS
  },
  {
    // Exige motor de expressoes: o posicionamento e calculado pelo proprio
    // After Effects, por uma expressao temporaria que o comando escreve, le e
    // apaga. Sem motor so o centro da composicao funcionaria, e um comando que
    // faz metade do que a interface oferece e pior que um desabilitado.
    id: "ae.layer.create-null",
    hosts: ["after-effects"],
    requirements: ["hasProject", "hasActiveComp", "expressionEngine"],
    destructive: false,
    mutates: true,
    // Cada aplicacao cria um null novo de proposito: nao ha estado idempotente
    // a proteger, entao "nada mudou" aqui seria mesmo uma falha.
    allowsNoopSuccess: false,
    supportsDryRun: false,
    supportsCancel: false,
    undoLabelKey: "undo.ae.layer.createNull",
    timeoutMs: DEFAULT_TIMEOUT_MS
  },
  {
    // Transform puro: nao le nem escreve expressao, entao nao exige motor.
    id: "ae.layer.flip",
    hosts: ["after-effects"],
    requirements: ["hasProject", "hasActiveComp"],
    destructive: false,
    mutates: true,
    // Espelhar de novo NAO e no-op: e a volta ao estado inicial, e continua
    // sendo uma alteracao real do projeto.
    allowsNoopSuccess: false,
    supportsDryRun: false,
    supportsCancel: false,
    undoLabelKey: "undo.ae.layer.flip",
    timeoutMs: DEFAULT_TIMEOUT_MS
  },
  {
    // Preview e um comando separado para nunca abrir um grupo de Undo vazio.
    id: "ae.layer.rename.preview",
    hosts: ["after-effects"],
    requirements: ["hasProject", "hasActiveComp"],
    destructive: false,
    mutates: false,
    allowsNoopSuccess: false,
    supportsDryRun: false,
    supportsCancel: false,
    undoLabelKey: "undo.none",
    timeoutMs: DEFAULT_TIMEOUT_MS
  },
  {
    id: "ae.layer.rename",
    hosts: ["after-effects"],
    requirements: ["hasProject", "hasActiveComp"],
    destructive: false,
    mutates: true,
    allowsNoopSuccess: true,
    supportsDryRun: false,
    supportsCancel: false,
    undoLabelKey: "undo.ae.layer.rename",
    timeoutMs: DEFAULT_TIMEOUT_MS
  },
  {
    id: "ae.layer.reverse-order.preview",
    hosts: ["after-effects"],
    requirements: ["hasProject", "hasActiveComp"],
    destructive: false,
    mutates: false,
    allowsNoopSuccess: false,
    supportsDryRun: false,
    supportsCancel: false,
    undoLabelKey: "undo.none",
    timeoutMs: DEFAULT_TIMEOUT_MS
  },
  {
    id: "ae.layer.reverse-order",
    hosts: ["after-effects"],
    requirements: ["hasProject", "hasActiveComp"],
    destructive: false,
    mutates: true,
    allowsNoopSuccess: false,
    supportsDryRun: false,
    supportsCancel: false,
    undoLabelKey: "undo.ae.layer.reverseOrder",
    timeoutMs: DEFAULT_TIMEOUT_MS
  },
  {
    id: "ae.keys.cut.preview",
    hosts: ["after-effects"],
    requirements: ["hasProject", "hasActiveComp"],
    destructive: false,
    mutates: false,
    allowsNoopSuccess: false,
    supportsDryRun: false,
    supportsCancel: false,
    undoLabelKey: "undo.none",
    timeoutMs: DEFAULT_TIMEOUT_MS
  },
  {
    // Remove keyframes criados pelo usuario; o dispatcher exige consentimento
    // allowDestructive explicito alem do preview obrigatorio no painel.
    id: "ae.keys.cut",
    hosts: ["after-effects"],
    requirements: ["hasProject", "hasActiveComp"],
    destructive: true,
    mutates: true,
    allowsNoopSuccess: true,
    supportsDryRun: false,
    supportsCancel: false,
    undoLabelKey: "undo.ae.keys.cut",
    timeoutMs: DEFAULT_TIMEOUT_MS
  },
  {
    id: "ae.keys.delay.preview",
    hosts: ["after-effects"],
    requirements: ["hasProject", "hasActiveComp"],
    destructive: false,
    mutates: false,
    allowsNoopSuccess: false,
    supportsDryRun: false,
    supportsCancel: false,
    undoLabelKey: "undo.none",
    timeoutMs: DEFAULT_TIMEOUT_MS
  },
  {
    id: "ae.keys.delay",
    hosts: ["after-effects"],
    requirements: ["hasProject", "hasActiveComp"],
    destructive: false,
    mutates: true,
    allowsNoopSuccess: true,
    supportsDryRun: false,
    supportsCancel: false,
    undoLabelKey: "undo.ae.keys.delay",
    timeoutMs: 30_000
  },
  {
    id: "pr.context.read",
    hosts: ["premiere-pro"],
    requirements: [],
    destructive: false,
    mutates: false,
    allowsNoopSuccess: false,
    supportsDryRun: false,
    supportsCancel: false,
    undoLabelKey: "undo.none",
    timeoutMs: DEFAULT_TIMEOUT_MS
  },
  {
    id: "pr.diagnostics.selfTest",
    hosts: ["premiere-pro"],
    requirements: [],
    destructive: false,
    mutates: false,
    allowsNoopSuccess: false,
    supportsDryRun: false,
    supportsCancel: false,
    undoLabelKey: "undo.none",
    timeoutMs: DEFAULT_TIMEOUT_MS
  }
] as const;

const BY_ID = new Map(COMMAND_DESCRIPTORS.map((descriptor) => [descriptor.id, descriptor]));

export function getDescriptor(id: string): CommandDescriptor | undefined {
  return BY_ID.get(id);
}

export function descriptorsForHost(host: HostId): CommandDescriptor[] {
  return COMMAND_DESCRIPTORS.filter((descriptor) => descriptor.hosts.includes(host));
}
