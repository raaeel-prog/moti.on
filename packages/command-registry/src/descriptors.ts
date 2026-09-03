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
    id: "ae.anchor.align.preview",
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
    // Transform puro: a compensacao e resolvida por matriz, sem expressao.
    id: "ae.anchor.align",
    hosts: ["after-effects"],
    requirements: ["hasProject", "hasActiveComp"],
    destructive: false,
    mutates: true,
    // Pedir o ponto onde a ancora ja esta e um pedido satisfeito de
    // antemao, e nao uma falha.
    allowsNoopSuccess: true,
    supportsDryRun: false,
    supportsCancel: false,
    undoLabelKey: "undo.ae.anchor.align",
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
    id: "ae.keys.ease.apply",
    hosts: ["after-effects"],
    requirements: ["hasProject", "hasActiveComp"],
    destructive: false,
    mutates: true,
    allowsNoopSuccess: true,
    supportsDryRun: false,
    supportsCancel: false,
    undoLabelKey: "undo.ae.keys.ease.apply",
    timeoutMs: DEFAULT_TIMEOUT_MS
  },
  {
    id: "ae.keys.reverse",
    hosts: ["after-effects"],
    requirements: ["hasProject", "hasActiveComp"],
    destructive: false,
    mutates: true,
    allowsNoopSuccess: false,
    supportsDryRun: false,
    supportsCancel: false,
    undoLabelKey: "undo.ae.keys.reverse",
    timeoutMs: DEFAULT_TIMEOUT_MS
  },
  {
    id: "ae.keys.clone",
    hosts: ["after-effects"],
    requirements: ["hasProject", "hasActiveComp"],
    destructive: false,
    mutates: true,
    allowsNoopSuccess: false,
    supportsDryRun: false,
    supportsCancel: false,
    undoLabelKey: "undo.ae.keys.clone",
    timeoutMs: DEFAULT_TIMEOUT_MS
  },
  {
    id: "ae.time.controller",
    hosts: ["after-effects"],
    requirements: ["hasProject", "hasActiveComp", "expressionEngine"],
    destructive: false,
    mutates: true,
    allowsNoopSuccess: false,
    supportsDryRun: false,
    supportsCancel: false,
    undoLabelKey: "undo.ae.time.controller",
    timeoutMs: DEFAULT_TIMEOUT_MS
  },
  {
    id: "ae.animate.kinetic",
    hosts: ["after-effects"],
    requirements: ["hasProject", "hasActiveComp", "expressionEngine"],
    destructive: false,
    mutates: true,
    allowsNoopSuccess: false,
    supportsDryRun: false,
    supportsCancel: false,
    undoLabelKey: "undo.ae.animate.kinetic",
    timeoutMs: DEFAULT_TIMEOUT_MS
  },
  {
    id: "ae.time.marker-loop",
    hosts: ["after-effects"],
    requirements: ["hasProject", "hasActiveComp", "expressionEngine"],
    destructive: false,
    mutates: true,
    allowsNoopSuccess: false,
    supportsDryRun: false,
    supportsCancel: false,
    undoLabelKey: "undo.ae.time.markerLoop",
    timeoutMs: DEFAULT_TIMEOUT_MS
  },
  {
    id: "ae.animate.inertial",
    hosts: ["after-effects"],
    requirements: ["hasProject", "hasActiveComp", "expressionEngine"],
    destructive: false,
    mutates: true,
    // Reaplicar o mesmo preset numa propriedade que ja o tem e no-op legitimo:
    // o usuario ajusta amplitude, volta ao valor anterior e reaplica.
    allowsNoopSuccess: true,
    supportsDryRun: false,
    supportsCancel: false,
    undoLabelKey: "undo.ae.animate.inertial",
    timeoutMs: DEFAULT_TIMEOUT_MS
  },
  {
    id: "ae.animate.jump",
    hosts: ["after-effects"],
    requirements: ["hasProject", "hasActiveComp"],
    destructive: false,
    mutates: true,
    allowsNoopSuccess: false,
    supportsDryRun: false,
    supportsCancel: false,
    undoLabelKey: "undo.ae.animate.jump",
    timeoutMs: DEFAULT_TIMEOUT_MS
  },
  {
    // Copiar le e nao muta: sem grupo de Undo, porque nao ha o que desfazer.
    id: "ae.keys.copy",
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
    id: "ae.keys.paste",
    hosts: ["after-effects"],
    requirements: ["hasProject", "hasActiveComp"],
    destructive: false,
    mutates: true,
    allowsNoopSuccess: false,
    supportsDryRun: false,
    supportsCancel: false,
    undoLabelKey: "undo.ae.keys.paste",
    timeoutMs: 30_000
  },
  {
    id: "ae.shape.library",
    hosts: ["after-effects"],
    requirements: ["hasProject", "hasActiveComp"],
    destructive: false,
    mutates: true,
    // Cada aplicacao cria uma nova shape layer editavel. Um resultado sem layer
    // criada e falha, nao idempotencia.
    allowsNoopSuccess: false,
    supportsDryRun: false,
    supportsCancel: false,
    undoLabelKey: "undo.ae.shape.library",
    timeoutMs: DEFAULT_TIMEOUT_MS
  },
  {
    id: "ae.shape.trim-path",
    hosts: ["after-effects"],
    requirements: ["hasProject", "hasActiveComp"],
    destructive: false,
    mutates: true,
    // Reaplicar o mesmo corte num grupo que ja o tem e o modo Adjust do
    // criterio de aceite, e nao uma falha.
    allowsNoopSuccess: true,
    supportsDryRun: false,
    supportsCancel: false,
    undoLabelKey: "undo.ae.shape.trimPath",
    timeoutMs: DEFAULT_TIMEOUT_MS
  },
  {
    id: "ae.shape.break",
    hosts: ["after-effects"],
    requirements: ["hasProject", "hasActiveComp"],
    // Cria uma camada por grupo e pode remover a original: reversivel por Undo,
    // mas nao e uma edicao pequena.
    destructive: true,
    mutates: true,
    allowsNoopSuccess: false,
    supportsDryRun: false,
    supportsCancel: false,
    undoLabelKey: "undo.ae.shape.break",
    timeoutMs: 60_000
  },
  {
    id: "ae.rig.effector",
    hosts: ["after-effects"],
    requirements: ["hasProject", "hasActiveComp", "expressionEngine"],
    destructive: false,
    mutates: true,
    // Reaplicar o mesmo effector nas mesmas camadas e pedido ja satisfeito.
    allowsNoopSuccess: true,
    supportsDryRun: false,
    supportsCancel: false,
    undoLabelKey: "undo.ae.rig.effector",
    timeoutMs: DEFAULT_TIMEOUT_MS
  },
  {
    id: "ae.camera.transition",
    hosts: ["after-effects"],
    requirements: ["hasProject", "hasActiveComp"],
    destructive: false,
    mutates: true,
    // Cada aplicacao escreve dois keyframes novos; nao ha estado ja satisfeito.
    allowsNoopSuccess: false,
    supportsDryRun: false,
    supportsCancel: false,
    undoLabelKey: "undo.ae.camera.transition",
    timeoutMs: DEFAULT_TIMEOUT_MS
  },
  {
    id: "ae.3d.cylinder",
    hosts: ["after-effects"],
    requirements: ["hasProject", "hasActiveComp"],
    // Pode duplicar camadas para preencher o arco.
    destructive: true,
    mutates: true,
    // Reajustar o raio do rig existente e o Adjust da secao, e nao falha.
    allowsNoopSuccess: true,
    supportsDryRun: false,
    supportsCancel: false,
    undoLabelKey: "undo.ae.3d.cylinder",
    timeoutMs: 60_000
  },
  {
    id: "ae.3d.cube",
    hosts: ["after-effects"],
    requirements: ["hasProject", "hasActiveComp"],
    destructive: true,
    mutates: true,
    allowsNoopSuccess: true,
    supportsDryRun: false,
    supportsCancel: false,
    undoLabelKey: "undo.ae.3d.cube",
    timeoutMs: 60_000
  },
  {
    id: "ae.effect.wave",
    hosts: ["after-effects"],
    requirements: ["hasProject", "hasActiveComp"],
    destructive: false,
    mutates: true,
    // Reaplicar o mesmo preset e pedido ja satisfeito.
    allowsNoopSuccess: true,
    supportsDryRun: false,
    supportsCancel: false,
    undoLabelKey: "undo.ae.effect.wave",
    // Assar percorre a composicao quadro a quadro.
    timeoutMs: 60_000
  },
  {
    id: "ae.effect.tile",
    hosts: ["after-effects"],
    requirements: ["hasProject", "hasActiveComp"],
    // O modo grade cria dezenas de camadas: e reversivel por Undo, mas nao e
    // uma edicao pequena.
    destructive: true,
    mutates: true,
    allowsNoopSuccess: true,
    supportsDryRun: false,
    supportsCancel: false,
    undoLabelKey: "undo.ae.effect.tile",
    timeoutMs: 60_000
  },
  {
    id: "ae.effect.glitch",
    hosts: ["after-effects"],
    requirements: ["hasProject", "hasActiveComp", "expressionEngine"],
    destructive: false,
    mutates: true,
    allowsNoopSuccess: false,
    supportsDryRun: false,
    supportsCancel: false,
    undoLabelKey: "undo.ae.effect.glitch",
    timeoutMs: DEFAULT_TIMEOUT_MS
  },
  {
    id: "ae.animate.parallax.quick",
    hosts: ["after-effects"],
    requirements: ["hasProject", "hasActiveComp"],
    destructive: false,
    mutates: true,
    // Reajustar o rig com os mesmos numeros e o modo Adjust da §, e nao falha.
    allowsNoopSuccess: true,
    supportsDryRun: false,
    supportsCancel: false,
    undoLabelKey: "undo.ae.animate.parallaxQuick",
    timeoutMs: 60_000
  },
  {
    id: "ae.3d.look-at",
    hosts: ["after-effects"],
    requirements: ["hasProject", "hasActiveComp", "expressionEngine"],
    destructive: false,
    mutates: true,
    // Reapontar para o mesmo alvo com os mesmos eixos e um pedido ja satisfeito.
    allowsNoopSuccess: true,
    supportsDryRun: false,
    supportsCancel: false,
    undoLabelKey: "undo.ae.3d.lookAt",
    timeoutMs: DEFAULT_TIMEOUT_MS
  },
  {
    id: "ae.3d.orbit",
    hosts: ["after-effects"],
    requirements: ["hasProject", "hasActiveComp", "expressionEngine"],
    destructive: false,
    mutates: true,
    allowsNoopSuccess: false,
    supportsDryRun: false,
    supportsCancel: false,
    undoLabelKey: "undo.ae.3d.orbit",
    // Assar percorre a composicao quadro a quadro: precisa de mais folga.
    timeoutMs: 60_000
  },
  {
    id: "ae.effect.echo",
    hosts: ["after-effects"],
    requirements: ["hasProject", "hasActiveComp"],
    destructive: false,
    mutates: true,
    allowsNoopSuccess: true,
    supportsDryRun: false,
    supportsCancel: false,
    undoLabelKey: "undo.ae.effect.echo",
    timeoutMs: DEFAULT_TIMEOUT_MS
  },
  {
    // A previa e leitura pura: sem grupo de Undo, porque nao ha o que desfazer.
    id: "ae.comp.fast-edit.preview",
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
    id: "ae.comp.fast-edit",
    hosts: ["after-effects"],
    requirements: ["hasProject", "hasActiveComp"],
    // Mudar duracao, resolucao ou precompor reescreve a composicao inteira: e
    // reversivel por Undo, mas nao e uma edicao pequena.
    destructive: true,
    mutates: true,
    allowsNoopSuccess: false,
    supportsDryRun: false,
    supportsCancel: false,
    undoLabelKey: "undo.ae.comp.fastEdit",
    timeoutMs: 60_000
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
    id: "ae.vector.ai-to-vector",
    hosts: ["after-effects"],
    requirements: ["hasProject", "hasActiveComp"],
    destructive: false,
    mutates: true,
    allowsNoopSuccess: false,
    supportsDryRun: false,
    supportsCancel: false,
    undoLabelKey: "undo.ae.vector.aiToVector",
    timeoutMs: DEFAULT_TIMEOUT_MS
  },
  {
    id: "ae.parallax.auto-focus",
    hosts: ["after-effects"],
    requirements: ["hasProject", "hasActiveComp"],
    destructive: false,
    mutates: true,
    allowsNoopSuccess: false,
    supportsDryRun: false,
    supportsCancel: false,
    undoLabelKey: "undo.ae.parallax.autoFocus",
    timeoutMs: DEFAULT_TIMEOUT_MS
  },
  {
    id: "ae.parallax.wiggle",
    hosts: ["after-effects"],
    requirements: ["hasProject", "hasActiveComp", "expressionEngine"],
    destructive: false,
    mutates: true,
    allowsNoopSuccess: false,
    supportsDryRun: false,
    supportsCancel: false,
    undoLabelKey: "undo.ae.parallax.wiggle",
    timeoutMs: DEFAULT_TIMEOUT_MS
  },
  {
    id: "ae.parallax.zoom",
    hosts: ["after-effects"],
    requirements: ["hasProject", "hasActiveComp"],
    destructive: false,
    mutates: true,
    allowsNoopSuccess: false,
    supportsDryRun: false,
    supportsCancel: false,
    undoLabelKey: "undo.ae.parallax.zoom",
    timeoutMs: DEFAULT_TIMEOUT_MS
  },
  {
    id: "ae.parallax.bake",
    hosts: ["after-effects"],
    requirements: ["hasProject", "hasActiveComp"],
    destructive: false,
    mutates: true,
    allowsNoopSuccess: false,
    supportsDryRun: false,
    supportsCancel: true,
    undoLabelKey: "undo.ae.parallax.bake",
    timeoutMs: 30000
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
  },
  {
    id: "ae.vector.text-to-vector",
    hosts: ["after-effects"],
    requirements: ["hasProject", "hasActiveComp"],
    destructive: false,
    mutates: true,
    allowsNoopSuccess: false,
    supportsDryRun: false,
    supportsCancel: false,
    undoLabelKey: "undo.ae.vector.textToVector",
    timeoutMs: DEFAULT_TIMEOUT_MS
  },
  {
    id: "ae.effect.particles",
    hosts: ["after-effects"],
    requirements: ["hasProject", "hasActiveComp"],
    destructive: false,
    mutates: true,
    allowsNoopSuccess: false,
    supportsDryRun: false,
    supportsCancel: false,
    undoLabelKey: "undo.ae.effect.particles",
    timeoutMs: DEFAULT_TIMEOUT_MS
  },
  {
    id: "ae.asset.texture",
    hosts: ["after-effects"],
    requirements: ["hasProject", "hasActiveComp"],
    destructive: false,
    mutates: true,
    allowsNoopSuccess: false,
    supportsDryRun: false,
    supportsCancel: false,
    undoLabelKey: "undo.ae.asset.texture",
    timeoutMs: 60000
  },
  {
    id: "ae.project.clean",
    hosts: ["after-effects"],
    requirements: ["hasProject"],
    destructive: true,
    mutates: true,
    allowsNoopSuccess: true,
    // O dispatcher recusa `dryRun` em comando que muta, então declarar suporte
    // aqui era uma promessa que ele nunca cumpria. A prévia deste comando existe
    // por outro caminho: `removeConfirmed: false` devolve quantos itens estão
    // sem uso, sem remover nenhum.
    supportsDryRun: false,
    supportsCancel: false,
    undoLabelKey: "undo.ae.project.clean",
    timeoutMs: 60000
  }
] as const;

const BY_ID = new Map(COMMAND_DESCRIPTORS.map((descriptor) => [descriptor.id, descriptor]));

export function getDescriptor(id: string): CommandDescriptor | undefined {
  return BY_ID.get(id);
}

export function descriptorsForHost(host: HostId): CommandDescriptor[] {
  return COMMAND_DESCRIPTORS.filter((descriptor) => descriptor.hosts.includes(host));
}
