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
    supportsDryRun: false,
    supportsCancel: false,
    undoLabelKey: "undo.ae.demo.createComposition",
    // Criar composição e camada de texto envolve várias chamadas de DOM; o teto
    // padrão é apertado para um projeto grande com o disco ocupado.
    timeoutMs: 30_000
  },
  {
    id: "pr.context.read",
    hosts: ["premiere-pro"],
    requirements: [],
    destructive: false,
    mutates: false,
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
