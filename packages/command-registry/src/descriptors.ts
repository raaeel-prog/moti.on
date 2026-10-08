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
import type { CapabilityRequirement, HostId, QuickProfile } from "@motion/contracts";

import { scaleQuickPixelsFrom1080 } from "./quick-defaults.js";

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

  /** Perfil de aplicação em um clique. Destrutivos nunca podem registrar um. */
  quickProfile?: QuickProfile;
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
    id: "ae.tools.adjust", hosts: ["after-effects"],
    requirements: ["hasProject", "hasActiveComp"],
    destructive: false, mutates: true, allowsNoopSuccess: true,
    supportsDryRun: false, supportsCancel: false,
    undoLabelKey: "undo.ae.tools.adjust", timeoutMs: 15_000
  },
  {
    id: "ae.text.word-reveal.read", hosts: ["after-effects"],
    requirements: ["hasProject", "hasActiveComp"],
    destructive: false, mutates: false, allowsNoopSuccess: false,
    supportsDryRun: false, supportsCancel: false,
    undoLabelKey: "undo.none", timeoutMs: 15_000
  },
  {
    id: "ae.text.word-reveal", hosts: ["after-effects"],
    requirements: ["hasProject", "hasActiveComp", "expressionEngine"],
    destructive: false, mutates: true, allowsNoopSuccess: true,
    supportsDryRun: false, supportsCancel: false,
    undoLabelKey: "undo.ae.text.word-reveal", timeoutMs: 60_000
  },
  {
    id: "ae.text.variable-morph.read", hosts: ["after-effects"],
    requirements: ["hasProject", "hasActiveComp"],
    destructive: false, mutates: false, allowsNoopSuccess: false,
    supportsDryRun: false, supportsCancel: false,
    undoLabelKey: "undo.none", timeoutMs: 15_000
  },
  {
    id: "ae.text.variable-morph", hosts: ["after-effects"],
    requirements: ["hasProject", "hasActiveComp", "expressionEngine"],
    destructive: false, mutates: true, allowsNoopSuccess: true,
    supportsDryRun: false, supportsCancel: false,
    undoLabelKey: "undo.ae.text.variable-morph", timeoutMs: 60_000
  },
  {
    id: "ae.text.style-swap", hosts: ["after-effects"],
    requirements: ["hasProject", "hasActiveComp", "expressionEngine"],
    destructive: false, mutates: true, allowsNoopSuccess: true,
    supportsDryRun: false, supportsCancel: false,
    undoLabelKey: "undo.ae.text.style-swap", timeoutMs: 60_000
  },
  {
    id: "ae.text.vertical-pulse.read", hosts: ["after-effects"],
    requirements: ["hasProject", "hasActiveComp"],
    destructive: false, mutates: false, allowsNoopSuccess: false,
    supportsDryRun: false, supportsCancel: false,
    undoLabelKey: "undo.none", timeoutMs: 15_000
  },
  {
    id: "ae.text.vertical-pulse", hosts: ["after-effects"],
    requirements: ["hasProject", "hasActiveComp", "expressionEngine"],
    destructive: false, mutates: true, allowsNoopSuccess: true,
    supportsDryRun: false, supportsCancel: false,
    undoLabelKey: "undo.ae.text.vertical-pulse", timeoutMs: 60_000
  },
  {
    id: "ae.presets.camera-transition", hosts: ["after-effects"],
    requirements: ["hasProject", "hasActiveComp", "expressionEngine"],
    destructive: false, mutates: true, allowsNoopSuccess: false,
    supportsDryRun: false, supportsCancel: false,
    undoLabelKey: "undo.ae.presets.camera-transition", timeoutMs: 60_000
  },
  ...["apply", "remove", "bake"].map((action): CommandDescriptor => ({
    id: `ae.presets.${action}`, hosts: ["after-effects"],
    requirements: ["hasProject", "hasActiveComp", "expressionEngine"],
    destructive: false, mutates: true, allowsNoopSuccess: true,
    supportsDryRun: false, supportsCancel: false,
    undoLabelKey: `undo.ae.presets.${action}`, timeoutMs: 60_000
  })),
  ...["apply", "adjust", "action", "timing"].map((action): CommandDescriptor => ({
    id: `ae.presets.phase-${action}`, hosts: ["after-effects"],
    requirements: ["hasProject", "hasActiveComp", "expressionEngine"],
    destructive: false, mutates: true, allowsNoopSuccess: false,
    supportsDryRun: false, supportsCancel: false,
    undoLabelKey: `undo.ae.presets.phase-${action}`, timeoutMs: 60_000
  })),
  {
    id: "ae.presets.color-adjust", hosts: ["after-effects"],
    requirements: ["hasProject", "hasActiveComp"],
    destructive: false, mutates: true, allowsNoopSuccess: true,
    supportsDryRun: false, supportsCancel: false,
    undoLabelKey: "undo.ae.presets.color-adjust", timeoutMs: DEFAULT_TIMEOUT_MS
  },
  {
    id: "ae.presets.inspect", hosts: ["after-effects"],
    requirements: [],
    destructive: false, mutates: false, allowsNoopSuccess: false,
    supportsDryRun: false, supportsCancel: false,
    undoLabelKey: "undo.none", timeoutMs: DEFAULT_TIMEOUT_MS
  },
  {
    id: "ae.presets.adjust", hosts: ["after-effects"],
    requirements: ["hasProject", "hasActiveComp", "expressionEngine"],
    destructive: false, mutates: true, allowsNoopSuccess: true,
    supportsDryRun: false, supportsCancel: false,
    undoLabelKey: "undo.ae.presets.adjust", timeoutMs: 60_000
  },
  {
    id: "ae.presets.timing", hosts: ["after-effects"],
    requirements: ["hasProject", "hasActiveComp", "expressionEngine"],
    destructive: false, mutates: true, allowsNoopSuccess: true,
    supportsDryRun: false, supportsCancel: false,
    undoLabelKey: "undo.ae.presets.timing", timeoutMs: 60_000
  },
  {
    id: "ae.presets.personal", hosts: ["after-effects"],
    requirements: [],
    destructive: false, mutates: false, allowsNoopSuccess: false,
    supportsDryRun: false, supportsCancel: false,
    undoLabelKey: "undo.none", timeoutMs: 120_000
  },
  {
    id: "ae.presets.personal-preview", hosts: ["after-effects"],
    requirements: [],
    destructive: false, mutates: false, allowsNoopSuccess: false,
    supportsDryRun: false, supportsCancel: false,
    undoLabelKey: "undo.none", timeoutMs: 15_000
  },
  {
    id: "ae.presets.personal-apply", hosts: ["after-effects"],
    requirements: ["hasProject"],
    destructive: false, mutates: true, allowsNoopSuccess: false,
    supportsDryRun: false, supportsCancel: false,
    undoLabelKey: "undo.ae.presets.personal-apply", timeoutMs: 60_000
  },
  {
    id: "ae.quick-tools.apply",
    hosts: ["after-effects"],
    requirements: ["hasProject", "hasActiveComp"],
    destructive: false,
    mutates: true,
    allowsNoopSuccess: true,
    supportsDryRun: false,
    supportsCancel: false,
    undoLabelKey: "undo.ae.quickTools",
    timeoutMs: 30_000
  },
  {
    id: "ae.quick-tools.save-frame",
    hosts: ["after-effects"],
    requirements: ["hasProject", "hasActiveComp"],
    destructive: false,
    mutates: false,
    allowsNoopSuccess: false,
    supportsDryRun: false,
    supportsCancel: false,
    undoLabelKey: "undo.none",
    timeoutMs: 60_000
  },
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
    timeoutMs: DEFAULT_TIMEOUT_MS,
    quickProfile: {
      factoryPresetId: "loopout.ciclo",
      /**
       * Ciclo usando todos os keyframes é o laço que as pessoas querem em
       * nove de cada dez vezes. Trocar para vaivém depois não exige
       * reaplicar: o tipo é um dropdown no Effect Controls.
       */
      derive: () => ({
        type: "cycle",
        numKeyframes: 0,
        duration: 0,
        useDuration: false,
        conflictMode: "skip"
      }),
      // Base numeric controls; Wiggle also adds axes for vectors and linked scale for Scale.
      liveControls: [
        {
          "paramId": "type",
          "label": {
            "pt-BR": "Modo (1 Ciclo · 2 Pingpong · 3 Offset · 4 Continue)",
            "en-US": "Mode (1 Cycle · 2 Pingpong · 3 Offset · 4 Continue)"
          },
          "help": {
            "pt-BR": "Modo (1 Ciclo · 2 Pingpong · 3 Offset · 4 Continue)",
            "en-US": "Mode (1 Cycle · 2 Pingpong · 3 Offset · 4 Continue)"
          },
          "control": "slider",
          "target": "layer",
          "order": 1,
          "min": 1,
          "max": 4,
          "unit": "none"
        },
        {
          "paramId": "numKeyframes",
          "label": {
            "pt-BR": "Intervalo de keys",
            "en-US": "Keyframe interval"
          },
          "help": {
            "pt-BR": "Intervalo de keys",
            "en-US": "Keyframe interval"
          },
          "control": "slider",
          "target": "layer",
          "order": 2,
          "min": 0,
          "max": 10000,
          "unit": "none"
        },
        {
          "paramId": "duration",
          "label": {
            "pt-BR": "Intervalo em segundos",
            "en-US": "Interval in seconds"
          },
          "help": {
            "pt-BR": "Intervalo em segundos",
            "en-US": "Interval in seconds"
          },
          "control": "slider",
          "target": "layer",
          "order": 3,
          "min": 0,
          "max": 3600,
          "unit": "s"
        },
        {
          "paramId": "useDuration",
          "label": {
            "pt-BR": "Usar segundos",
            "en-US": "Use seconds"
          },
          "help": {
            "pt-BR": "Usar segundos",
            "en-US": "Use seconds"
          },
          "control": "checkbox",
          "target": "layer",
          "order": 4,
          "min": 0,
          "max": 1,
          "unit": "none"
        },
        {
          "paramId": "intensity",
          "label": {
            "pt-BR": "Intensidade",
            "en-US": "Intensity"
          },
          "help": {
            "pt-BR": "Intensidade",
            "en-US": "Intensity"
          },
          "control": "slider",
          "target": "layer",
          "order": 5,
          "min": 0,
          "max": 100,
          "unit": "%"
        },
        {
          "paramId": "enabled",
          "label": {
            "pt-BR": "Ativo",
            "en-US": "Enabled"
          },
          "help": {
            "pt-BR": "Ativo",
            "en-US": "Enabled"
          },
          "control": "checkbox",
          "target": "layer",
          "order": 6,
          "min": 0,
          "max": 1,
          "unit": "none"
        }
      ],
      previewAssetId: "preview.loopout.ciclo",
      oneLine: {
        "pt-BR": "Repete a animação existente até o fim da camada.",
        "en-US": "Repeats the existing animation to the end of the layer."
      },
      needs: {
        "pt-BR": "Uma propriedade com pelo menos dois keyframes.",
        "en-US": "A property with at least two keyframes."
      },
      budgetMs: 300
    }
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
    timeoutMs: DEFAULT_TIMEOUT_MS,
    quickProfile: {
      factoryPresetId: "smooth.padrao",
      /**
       * A janela sai do fps: 0,2 s e o mesmo alisado percebido em 24 ou 60
       * quadros. Cinco amostras equilibram efeito e custo — mais amostras
       * pesam em cada quadro renderizado.
       */
      derive: () => ({
        widthSeconds: 0.2,
        samples: 5,
        referenceTime: "current",
        conflictMode: "skip"
      }),
      // Base numeric controls; Wiggle also adds axes for vectors and linked scale for Scale.
      liveControls: [
        {
          "paramId": "widthSeconds",
          "label": {
            "pt-BR": "Janela",
            "en-US": "Width"
          },
          "help": {
            "pt-BR": "Janela",
            "en-US": "Width"
          },
          "control": "slider",
          "target": "layer",
          "order": 1,
          "min": 0.001,
          "max": 3600,
          "unit": "s"
        },
        {
          "paramId": "samples",
          "label": {
            "pt-BR": "Amostras",
            "en-US": "Samples"
          },
          "help": {
            "pt-BR": "Amostras",
            "en-US": "Samples"
          },
          "control": "slider",
          "target": "layer",
          "order": 2,
          "min": 1,
          "max": 101,
          "unit": "none"
        },
        {
          "paramId": "referenceTime",
          "label": {
            "pt-BR": "Tempo de referência",
            "en-US": "Reference time"
          },
          "help": {
            "pt-BR": "Tempo de referência",
            "en-US": "Reference time"
          },
          "control": "slider",
          "target": "layer",
          "order": 3,
          "min": 0,
          "max": 86400,
          "unit": "s"
        },
        {
          "paramId": "useCurrentTime",
          "label": {
            "pt-BR": "Acompanhar tempo",
            "en-US": "Follow time"
          },
          "help": {
            "pt-BR": "Acompanhar tempo",
            "en-US": "Follow time"
          },
          "control": "checkbox",
          "target": "layer",
          "order": 4,
          "min": 0,
          "max": 1,
          "unit": "none"
        },
        {
          "paramId": "intensity",
          "label": {
            "pt-BR": "Intensidade",
            "en-US": "Intensity"
          },
          "help": {
            "pt-BR": "Intensidade",
            "en-US": "Intensity"
          },
          "control": "slider",
          "target": "layer",
          "order": 5,
          "min": 0,
          "max": 100,
          "unit": "%"
        },
        {
          "paramId": "enabled",
          "label": {
            "pt-BR": "Ativo",
            "en-US": "Enabled"
          },
          "help": {
            "pt-BR": "Ativo",
            "en-US": "Enabled"
          },
          "control": "checkbox",
          "target": "layer",
          "order": 6,
          "min": 0,
          "max": 1,
          "unit": "none"
        }
      ],
      previewAssetId: "preview.smooth.padrao",
      oneLine: {
        "pt-BR": "Tira o tranco da animação, sem apagar os keyframes.",
        "en-US": "Takes the jitter out of the animation, without removing keyframes."
      },
      needs: {
        "pt-BR": "Uma propriedade com keyframes.",
        "en-US": "A property with keyframes."
      },
      budgetMs: 300
    }
  },
  {
    // Beat le a camada de amplitude que o assistente nativo gera. Nao cria
    // camada nem roda o assistente; so escreve expressao e Live Controls.
    id: "ae.audio.beat",
    hosts: ["after-effects"],
    requirements: ["hasProject", "hasActiveComp", "expressionEngine"],
    destructive: false,
    mutates: true,
    allowsNoopSuccess: false,
    supportsDryRun: false,
    supportsCancel: false,
    undoLabelKey: "undo.ae.audio.beat",
    timeoutMs: DEFAULT_TIMEOUT_MS,
    quickProfile: {
      factoryPresetId: "beat.pulso",
      /**
       * Padrão profissional inspirado no Brazu: Beat Min/Max para calibração
       * de áudio, Modo Bump (pulsar/piscar) ou Shake (tremer), Bump Min/Max
       * para controle de faixa da propriedade e Shake Freq/Amp.
       */
      derive: () => ({
        beatMin: 30,
        beatMax: 90,
        mode: 1,
        bumpMin: 0,
        bumpMax: 110,
        shakeFreq: 10,
        shakeAmp: 30
      }),
      liveControls: [
        {
          paramId: "beatMin",
          label: { "pt-BR": "Beat Min", "en-US": "Beat Min" },
          help: {
            "pt-BR": "Sensibilidade mínima da batida (limiar de corte de ruído/base).",
            "en-US": "Minimum beat threshold (noise/baseline floor cutoff)."
          },
          control: "slider",
          target: "layer",
          order: 1,
          min: 0,
          max: 500
        },
        {
          paramId: "beatMax",
          label: { "pt-BR": "Beat Max", "en-US": "Beat Max" },
          help: {
            "pt-BR": "Sensibilidade máxima da batida (teto onde atinge o pico).",
            "en-US": "Maximum beat threshold (ceiling where peak is reached)."
          },
          control: "slider",
          target: "layer",
          order: 2,
          min: 0.1,
          max: 500
        },
        {
          paramId: "mode",
          label: { "pt-BR": "Modo", "en-US": "Mode" },
          help: {
            "pt-BR": "Modo de animação: Bump (pulsar) ou Shake (tremer).",
            "en-US": "Animation mode: Bump or Shake."
          },
          control: "dropdown",
          target: "layer",
          order: 3,
          options: [
            { value: 1, label: { "pt-BR": "Bump", "en-US": "Bump" } },
            { value: 2, label: { "pt-BR": "Shake", "en-US": "Shake" } }
          ]
        },
        {
          paramId: "bumpMin",
          label: { "pt-BR": "Bump Min", "en-US": "Bump Min" },
          help: {
            "pt-BR": "Multiplicador mínimo no repouso (quando não há batida).",
            "en-US": "Minimum multiplier at rest (no beat)."
          },
          control: "slider",
          target: "layer",
          order: 4,
          unit: "%",
          min: -1000,
          max: 1000
        },
        {
          paramId: "bumpMax",
          label: { "pt-BR": "Bump Max", "en-US": "Bump Max" },
          help: {
            "pt-BR": "Multiplicador máximo no pico da batida.",
            "en-US": "Maximum multiplier at peak beat."
          },
          control: "slider",
          target: "layer",
          order: 5,
          unit: "%",
          min: -1000,
          max: 1000
        },
        {
          paramId: "shakeFreq",
          label: { "pt-BR": "Shake Freq", "en-US": "Shake Freq" },
          help: {
            "pt-BR": "Frequência de oscilação do Shake na batida.",
            "en-US": "Shake oscillation frequency on beat."
          },
          control: "slider",
          target: "layer",
          order: 6,
          unit: "fps",
          min: 0,
          max: 100
        },
        {
          paramId: "shakeAmp",
          label: { "pt-BR": "Shake Amp", "en-US": "Shake Amp" },
          help: {
            "pt-BR": "Amplitude máxima do Shake no pico da batida.",
            "en-US": "Maximum Shake amplitude at peak beat."
          },
          control: "slider",
          target: "layer",
          order: 7,
          min: 0,
          max: 10000
        }
      ],
      previewAssetId: "preview.beat.pulso",
      oneLine: {
        "pt-BR": "Sincroniza a propriedade com a batida da música.",
        "en-US": "Syncs the property to the music beat."
      },
      needs: {
        "pt-BR": "Uma camada de amplitude na composição (Convert Audio to Keyframes).",
        "en-US": "An amplitude layer in the composition (Convert Audio to Keyframes)."
      },
      budgetMs: 400
    }
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
    timeoutMs: DEFAULT_TIMEOUT_MS,
    quickProfile: {
      factoryPresetId: "wiggle.suave",
      /**
       * Amplitude escala com a resolucao: 20 px numa comp 1080p viram 40 px numa
       * 4K, senao o mesmo preset sacode de menos no projeto grande. A frequencia
       * nao escala — 2 Hz e 2 Hz em qualquer resolucao.
       */
      derive: (context) => ({
        frequency: 2,
        amplitude: scaleQuickPixelsFrom1080(20, context),
        octaves: 1,
        amplitudeMultiplier: 0.5,
        seed: 0,
        conflictMode: "skip"
      }),
      // Base numeric controls; Wiggle also adds axes for vectors and linked scale for Scale.
      liveControls: [
        {
          "paramId": "frequency",
          "label": {
            "pt-BR": "Frequência",
            "en-US": "Frequency"
          },
          "help": {
            "pt-BR": "Frequência",
            "en-US": "Frequency"
          },
          "control": "slider",
          "target": "layer",
          "order": 1,
          "min": 0,
          "max": 100,
          "unit": "none"
        },
        {
          "paramId": "amplitude",
          "label": {
            "pt-BR": "Amplitude",
            "en-US": "Amplitude"
          },
          "help": {
            "pt-BR": "Amplitude",
            "en-US": "Amplitude"
          },
          "control": "slider",
          "target": "layer",
          "order": 2,
          "min": 0,
          "max": 100000,
          "unit": "°"
        },
        {
          "paramId": "seed",
          "label": {
            "pt-BR": "Semente",
            "en-US": "Seed"
          },
          "help": {
            "pt-BR": "Semente",
            "en-US": "Seed"
          },
          "control": "slider",
          "target": "layer",
          "order": 3,
          "min": 0,
          "max": 100000,
          "unit": "none"
        },
        {
          "paramId": "intensity",
          "label": {
            "pt-BR": "Intensidade",
            "en-US": "Intensity"
          },
          "help": {
            "pt-BR": "Intensidade",
            "en-US": "Intensity"
          },
          "control": "slider",
          "target": "layer",
          "order": 4,
          "min": 0,
          "max": 100,
          "unit": "%"
        },
        {
          "paramId": "enabled",
          "label": {
            "pt-BR": "Ativo",
            "en-US": "Enabled"
          },
          "help": {
            "pt-BR": "Ativo",
            "en-US": "Enabled"
          },
          "control": "checkbox",
          "target": "layer",
          "order": 5,
          "min": 0,
          "max": 1,
          "unit": "none"
        },
        {
          "paramId": "octaves",
          "label": {
            "pt-BR": "Detalhe",
            "en-US": "Detail"
          },
          "help": {
            "pt-BR": "Detalhe",
            "en-US": "Detail"
          },
          "control": "slider",
          "target": "layer",
          "order": 6,
          "min": 1,
          "max": 10,
          "unit": "none"
        },
        {
          "paramId": "amplitudeMultiplier",
          "label": {
            "pt-BR": "Detalhe: amplitude",
            "en-US": "Detail: amplitude"
          },
          "help": {
            "pt-BR": "Detalhe: amplitude",
            "en-US": "Detail: amplitude"
          },
          "control": "slider",
          "target": "layer",
          "order": 7,
          "min": 0,
          "max": 10,
          "unit": "none"
        }
      ],
      previewAssetId: "preview.wiggle.suave",
      oneLine: {
        "pt-BR": "Sacode a propriedade selecionada, com sliders para ajustar depois.",
        "en-US": "Shakes the selected property, with sliders to tune afterwards."
      },
      needs: {
        "pt-BR": "Uma propriedade numérica selecionada.",
        "en-US": "A selected numeric property."
      },
      budgetMs: 300
    }
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
    timeoutMs: DEFAULT_TIMEOUT_MS,
    quickProfile: {
      factoryPresetId: "flicker.lampada",
      /**
       * 6 trocas por segundo entre 70 % e 100 % e a piscada de lampada com mau
       * contato — o uso que leva as pessoas a esta ferramenta. Nada aqui escala
       * com resolucao: sao fatores, nao pixels.
       */
      derive: () => ({
        rate: 6,
        minFactor: 0.7,
        maxFactor: 1,
        seed: 0,
        conflictMode: "skip"
      }),
      // Base numeric controls; Wiggle also adds axes for vectors and linked scale for Scale.
      liveControls: [
        {
          "paramId": "rate",
          "label": {
            "pt-BR": "Frequência",
            "en-US": "Frequency"
          },
          "help": {
            "pt-BR": "Frequência",
            "en-US": "Frequency"
          },
          "control": "slider",
          "target": "layer",
          "order": 1,
          "min": 0,
          "max": 120,
          "unit": "none"
        },
        {
          "paramId": "minFactor",
          "label": {
            "pt-BR": "Fator mínimo",
            "en-US": "Minimum factor"
          },
          "help": {
            "pt-BR": "Fator mínimo",
            "en-US": "Minimum factor"
          },
          "control": "slider",
          "target": "layer",
          "order": 2,
          "min": 0,
          "max": 10,
          "unit": "x"
        },
        {
          "paramId": "maxFactor",
          "label": {
            "pt-BR": "Fator máximo",
            "en-US": "Maximum factor"
          },
          "help": {
            "pt-BR": "Fator máximo",
            "en-US": "Maximum factor"
          },
          "control": "slider",
          "target": "layer",
          "order": 3,
          "min": 0,
          "max": 10,
          "unit": "x"
        },
        {
          "paramId": "seed",
          "label": {
            "pt-BR": "Semente",
            "en-US": "Seed"
          },
          "help": {
            "pt-BR": "Semente",
            "en-US": "Seed"
          },
          "control": "slider",
          "target": "layer",
          "order": 4,
          "min": 0,
          "max": 100000,
          "unit": "none"
        },
        {
          "paramId": "intensity",
          "label": {
            "pt-BR": "Intensidade",
            "en-US": "Intensity"
          },
          "help": {
            "pt-BR": "Intensidade",
            "en-US": "Intensity"
          },
          "control": "slider",
          "target": "layer",
          "order": 5,
          "min": 0,
          "max": 100,
          "unit": "%"
        },
        {
          "paramId": "enabled",
          "label": {
            "pt-BR": "Ativo",
            "en-US": "Enabled"
          },
          "help": {
            "pt-BR": "Ativo",
            "en-US": "Enabled"
          },
          "control": "checkbox",
          "target": "layer",
          "order": 6,
          "min": 0,
          "max": 1,
          "unit": "none"
        }
      ],
      previewAssetId: "preview.flicker.lampada",
      oneLine: {
        "pt-BR": "Faz a propriedade piscar, com sliders para ajustar depois.",
        "en-US": "Makes the property flicker, with sliders to tune afterwards."
      },
      needs: {
        "pt-BR": "Uma propriedade numérica selecionada.",
        "en-US": "A selected numeric property."
      },
      budgetMs: 300
    }
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
    timeoutMs: DEFAULT_TIMEOUT_MS,
    /**
     * ## Perfis de operação: por que `liveControls` está vazio
     *
     * Os perfis das ferramentas de expressão — Wiggle, Beat, Flicker — deixam
     * sliders no Effect Controls porque a expressão continua lendo aqueles
     * valores enquanto a animação roda: mexer no slider muda o resultado ao vivo.
     *
     * Criar um null, inverter a ordem das camadas ou espelhar não têm nada
     * equivalente. São operações: acontecem uma vez, escrevem um valor final e
     * terminam. Um slider "Tamanho" no Effect Controls depois do null criado não
     * controlaria coisa alguma — seria um controle morto, pior que nenhum.
     *
     * Então o que estes perfis entregam é a outra metade do pedido: **um clique
     * aplica**, com os parâmetros derivados do contexto em vez de perguntados
     * numa tela. Quem quiser escolher eixo, escopo ou tamanho continua tendo o
     * caminho de sempre — Alt+clique abre a ferramenta inteira.
     *
     * O registry aceita `liveControls: []` sem ressalva; `defineQuickProfile`
     * só exige que o campo seja um array.
     */
    quickProfile: {
      factoryPresetId: "null.controlador",
      /**
       * Com camadas selecionadas, o que se espera de um clique em "Null" é o
       * controlador: um null na âncora média, com tudo parenteado nele e sem
       * ninguém saltando de lugar. Sem seleção, cai no centro da composição —
       * é o único posicionamento que significa algo quando não há de onde tirar
       * uma média.
       *
       * A dimensão acompanha a seleção: parentear camadas 3D a um null 2D
       * achata a cena, e é um estrago silencioso.
       */
      derive: (context) => {
        const temSelecao = context.selectionLayerCount > 0;
        return {
          placement: temSelecao ? "averageAnchor" : "compCenter",
          dimension: context.selectionIs3D ? "3d" : "2d",
          parentSelected: temSelecao,
          preserveWorldTransform: true,
          // O host exige inteiro de 1 a 10000. Um null de 100 px numa comp 4K
          // fica pequeno demais para acertar com o mouse, então o tamanho
          // acompanha a resolução como as amplitudes acompanham.
          size: Math.max(
            1,
            Math.min(10000, Math.round(scaleQuickPixelsFrom1080(100, context)))
          ),
          // Rótulo 0 é "sem cor". Escolher um índice de cor aqui seria chutar
          // qual número é qual cor nesta instalação do After Effects.
          label: 0
        };
      },
      liveControls: [],
      previewAssetId: "preview.null.controlador",
      oneLine: {
        "pt-BR": "Cria um null e parenteia a seleção nele, sem mover nada.",
        "en-US": "Creates a null and parents the selection to it, moving nothing."
      },
      needs: {
        "pt-BR": "Uma composição aberta. Camadas selecionadas viram filhas do null.",
        "en-US": "An open composition. Selected layers become children of the null."
      },
      budgetMs: 400
    }
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
    timeoutMs: DEFAULT_TIMEOUT_MS,
    quickProfile: {
      factoryPresetId: "flip.horizontal",
      /**
       * Horizontal em torno da âncora é o que a palavra "Espelhar" significa
       * para quem clica: o conteúdo inverte e a camada não sai do lugar. Nada
       * aqui depende do contexto — é a mesma operação em qualquer composição —,
       * mas `derive` existe mesmo assim porque o comando exige os quatro campos
       * e recusa argumento ausente.
       */
      derive: () => ({
        axis: "horizontal",
        pivot: "anchor",
        groupMode: "each",
        preserveTextReadability: true
      }),
      liveControls: [],
      previewAssetId: "preview.flip.horizontal",
      oneLine: {
        "pt-BR": "Espelha as camadas selecionadas na horizontal, sem tirá-las do lugar.",
        "en-US": "Mirrors the selected layers horizontally, without moving them."
      },
      needs: {
        "pt-BR": "Camadas 2D sem pai selecionadas.",
        "en-US": "Selected 2D layers with no parent."
      },
      budgetMs: 300
    }
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
    timeoutMs: DEFAULT_TIMEOUT_MS,
    quickProfile: {
      factoryPresetId: "anchor.centro",
      /**
       * Centralizar a âncora preservando a posição visual é o clique único que
       * existe em todo kit de After Effects, e é o padrão da tela. `fixedTime`
       * vai zerado porque o host recusa tempo fixo fora do modo `fixed` em vez
       * de ignorá-lo, e `preview: false` porque o comando de aplicação exige o
       * campo casando com a própria identidade.
       */
      derive: () => ({
        gridPoint: "center",
        mode: "normal",
        boundsSource: "visual",
        timeMode: "currentTime",
        fixedTime: 0,
        includeExtents: false,
        preserveVisualPosition: true,
        randomSeed: 0,
        preview: false
      }),
      liveControls: [],
      previewAssetId: "preview.anchor.centro",
      oneLine: {
        "pt-BR": "Centraliza a âncora sem deixar a camada sair do lugar.",
        "en-US": "Centres the anchor point without moving the layer."
      },
      needs: {
        "pt-BR": "Camadas selecionadas com conteúdo visível.",
        "en-US": "Selected layers with visible content."
      },
      budgetMs: 400
    }
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
    timeoutMs: DEFAULT_TIMEOUT_MS,
    quickProfile: {
      factoryPresetId: "reverseorder.selecao",
      /**
       * O escopo é a única decisão real aqui, e ela tem uma resposta certa por
       * contagem: inverter uma lista de uma camada não muda nada, e o descritor
       * declara `allowsNoopSuccess: false` — o clique falharia com "nada mudou".
       * Com zero ou uma camada selecionada, a composição inteira é o único
       * escopo em que a ferramenta faz o que o nome diz.
       *
       * Matte e parentesco entram preservados porque a inversão é sobre ordem
       * de empilhamento; levar as ligações junto seria uma segunda operação que
       * ninguém pediu.
       */
      derive: (context) => ({
        scope: context.selectionLayerCount >= 2 ? "selected" : "composition",
        preserveTrackMattes: true,
        preserveParents: true,
        reverseTimingToo: false
      }),
      liveControls: [],
      previewAssetId: "preview.reverseorder.selecao",
      oneLine: {
        "pt-BR": "Inverte a ordem das camadas, mantendo mattes e parentesco.",
        "en-US": "Reverses layer order, keeping mattes and parenting."
      },
      needs: {
        "pt-BR": "Duas ou mais camadas selecionadas; sem seleção, inverte a composição.",
        "en-US": "Two or more selected layers; with none, reverses the composition."
      },
      budgetMs: 500
    }
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
    // Sem `quickProfile`, e de proposito.
    //
    // A curva E o parametro continuo desta ferramenta, e o Addendum A1.2 diz
    // que um Quick sem Live Controls e incompleto quando existe parametro
    // continuo. Aqui nao ha Live Control possivel: a curva vive nos keyframes,
    // nao num slider do Effect Controls. O caminho certo e a tela, onde o
    // grafico de velocidade mostra o que vai ser aplicado ANTES de aplicar — que
    // e justamente o que um clique cego tira do usuario.
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
    timeoutMs: DEFAULT_TIMEOUT_MS,
    quickProfile: {
      factoryPresetId: "keysreverse.tempo",
      // Sem `derive`: o comando não aceita argumento nenhum, e o painel manda
      // `{}`. Um `derive` devolvendo objeto vazio diria a mesma coisa com mais
      // linhas — e sugeriria que existe algo a derivar.
      liveControls: [],
      previewAssetId: "preview.keysreverse.tempo",
      oneLine: {
        "pt-BR": "Inverte os keyframes selecionados no tempo.",
        "en-US": "Reverses the selected keyframes in time."
      },
      needs: {
        "pt-BR": "Dois ou mais keyframes selecionados.",
        "en-US": "Two or more selected keyframes."
      },
      budgetMs: 300
    }
  },
  {
    // Espelha os VALORES nos mesmos tempos (CROSSHOST_STUDIO_MASTER_IMPLEMENTATION_SPEC_v2.md
    // §15.2.3) — diferente de ae.keys.reverse, que move os tempos (§15.2.2, Mirror).
    id: "ae.keys.reverse-values",
    hosts: ["after-effects"],
    requirements: ["hasProject", "hasActiveComp"],
    destructive: false,
    mutates: true,
    allowsNoopSuccess: false,
    supportsDryRun: false,
    supportsCancel: false,
    undoLabelKey: "undo.ae.keys.reverse-values",
    timeoutMs: DEFAULT_TIMEOUT_MS,
    quickProfile: {
      factoryPresetId: "keysvalues.inverter",
      // Também sem argumentos: a operação é "troque os valores de ponta a
      // ponta, deixe os tempos onde estão".
      liveControls: [],
      previewAssetId: "preview.keysvalues.inverter",
      oneLine: {
        "pt-BR": "Troca os valores dos keyframes de ponta a ponta, sem mexer nos tempos.",
        "en-US": "Swaps keyframe values end to end, leaving the times alone."
      },
      needs: {
        "pt-BR": "Dois ou mais keyframes selecionados.",
        "en-US": "Two or more selected keyframes."
      },
      budgetMs: 300
    }
  },
  {
    // Envia o grupo selecionado para a borda da timeline (secao 15.5,
    // "Enviar ao comeco" e "Enviar ao final"): as duas operacoes da spec sao
    // a mesma conta com o sinal trocado, escolhida por `edge`.
    id: "ae.keys.send-to-edge",
    hosts: ["after-effects"],
    requirements: ["hasProject", "hasActiveComp"],
    destructive: false,
    mutates: true,
    // Pedir a borda onde o grupo ja esta e um pedido satisfeito de antemao, e
    // nao uma falha. Selecao vazia, que seria o no-op perigoso, o preflight
    // recusa com NO_SELECTION antes de chegar aqui.
    allowsNoopSuccess: true,
    supportsDryRun: false,
    supportsCancel: false,
    undoLabelKey: "undo.ae.keys.send-to-edge",
    timeoutMs: DEFAULT_TIMEOUT_MS,
    quickProfile: {
      factoryPresetId: "sendtoedge.inicio",
      /**
       * Início da composição é o mesmo padrão que a tela da ferramenta já usa.
       * A divergência seria pior que a escolha: duas portas para o mesmo comando
       * com resultados diferentes fariam o clique rápido parecer um comando
       * distinto do botão Aplicar.
       */
      derive: () => ({ edge: "start", reference: "comp" }),
      liveControls: [],
      previewAssetId: "preview.sendtoedge.inicio",
      oneLine: {
        "pt-BR": "Leva os keyframes selecionados para o início da composição.",
        "en-US": "Moves the selected keyframes to the start of the composition."
      },
      needs: {
        "pt-BR": "Keyframes selecionados na timeline.",
        "en-US": "Keyframes selected in the timeline."
      },
      budgetMs: 300
    }
  },
  {
    // Neon do §13. Nao e destrutivo: escreve fill/stroke do texto e adiciona um
    // efeito gerenciado, tudo reversivel pelo Undo do dispatcher.
    id: "ae.style.neon",
    hosts: ["after-effects"],
    requirements: ["hasProject", "hasActiveComp"],
    destructive: false,
    mutates: true,
    // Reaplicar o mesmo neon na mesma camada reescreve os mesmos valores; o
    // comando sempre relata `changed` quando ha camada selecionada, entao o
    // no-op silencioso nao surge — e a selecao vazia o preflight ja recusa.
    allowsNoopSuccess: false,
    supportsDryRun: false,
    supportsCancel: false,
    undoLabelKey: "undo.ae.style.neon",
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
    timeoutMs: DEFAULT_TIMEOUT_MS,
    quickProfile: {
      factoryPresetId: "inertial.natural",
      /**
       * Amplitude 60, frequencia 2,5 e decaimento 6 e o repique que a maioria
       * chama de natural: percebe-se, e para antes de incomodar. Nada aqui
       * escala com resolucao — sao proporcoes do proprio movimento.
       */
      derive: () => ({
        amplitude: 60,
        frequency: 2.5,
        decay: 6,
        maxDurationFrames: 120,
        startMode: "lastKey"
      }),
      liveControls: [
        {
          paramId: "amplitude",
          label: { "pt-BR": "Amplitude", "en-US": "Amplitude" },
          help: { "pt-BR": "Tamanho do repique.", "en-US": "Size of the bounce." },
          control: "slider",
          target: "layer",
          order: 1,
          min: 0,
          max: 1000
        },
        {
          paramId: "frequency",
          label: { "pt-BR": "Frequência", "en-US": "Frequency" },
          help: { "pt-BR": "Repiques por segundo.", "en-US": "Bounces per second." },
          control: "slider",
          target: "layer",
          order: 2,
          min: 0,
          max: 100
        },
        {
          paramId: "decay",
          label: { "pt-BR": "Decaimento", "en-US": "Decay" },
          help: {
            "pt-BR": "Quanto o repique perde força a cada volta.",
            "en-US": "How fast the bounce loses strength."
          },
          control: "slider",
          target: "layer",
          order: 3,
          min: 0,
          max: 100
        }
      ],
      previewAssetId: "preview.inertial.natural",
      oneLine: {
        "pt-BR": "Dá repique elástico ao fim da animação existente.",
        "en-US": "Adds an elastic bounce to the end of the existing animation."
      },
      needs: {
        "pt-BR": "Uma propriedade com keyframes.",
        "en-US": "A property with keyframes."
      },
      budgetMs: 300
    }
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
    id: "ae.effect.gradient.read",
    hosts: ["after-effects"], requirements: ["hasProject", "hasActiveComp"],
    destructive: false, mutates: false, allowsNoopSuccess: false,
    supportsDryRun: false, supportsCancel: false, undoLabelKey: "undo.none", timeoutMs: DEFAULT_TIMEOUT_MS
  },
  {
    id: "ae.effect.gradient",
    hosts: ["after-effects"], requirements: ["hasProject", "hasActiveComp"],
    destructive: false, mutates: true, allowsNoopSuccess: true,
    supportsDryRun: false, supportsCancel: false, undoLabelKey: "undo.ae.effect.gradient", timeoutMs: DEFAULT_TIMEOUT_MS
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
    id: "ae.parallax.create",
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
    id: "ae.parallax.adjust",
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
    id: "ae.parallax.move",
    hosts: ["after-effects"],
    requirements: ["hasProject", "hasActiveComp"],
    destructive: false,
    mutates: true,
    // Reajustar o rig com os mesmos numeros e o modo Adjust da §, e nao falha.
    allowsNoopSuccess: false,
    supportsDryRun: false,
    supportsCancel: false,
    undoLabelKey: "undo.ae.animate.parallaxQuick",
    timeoutMs: 60_000
  },
  {
    id: "ae.parallax.remove",
    hosts: ["after-effects"],
    requirements: ["hasProject", "hasActiveComp"],
    destructive: true,
    mutates: true,
    // Reajustar o rig com os mesmos numeros e o modo Adjust da §, e nao falha.
    allowsNoopSuccess: false,
    supportsDryRun: false,
    supportsCancel: false,
    undoLabelKey: "undo.ae.animate.parallaxQuick",
    timeoutMs: 60_000
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
    allowsNoopSuccess: true,
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
  },
  {
    // Abre o seletor de cor do sistema pelo ExtendScript (`$.colorPicker`). É a
    // saída que independe do tamanho do painel. O diálogo é modal e o usuário
    // decide quanto tempo fica nele, por isso o timeout longo.
    id: "ae.ui.color-picker",
    hosts: ["after-effects"],
    requirements: [],
    destructive: false,
    mutates: false,
    allowsNoopSuccess: false,
    supportsDryRun: false,
    supportsCancel: false,
    undoLabelKey: "undo.none",
    timeoutMs: 600_000
  }
] as const;

const BY_ID = new Map(COMMAND_DESCRIPTORS.map((descriptor) => [descriptor.id, descriptor]));

export function getDescriptor(id: string): CommandDescriptor | undefined {
  return BY_ID.get(id);
}

export function descriptorsForHost(host: HostId): CommandDescriptor[] {
  return COMMAND_DESCRIPTORS.filter((descriptor) => descriptor.hosts.includes(host));
}
