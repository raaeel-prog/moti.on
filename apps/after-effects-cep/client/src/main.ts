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
  colorField,
  createI18n,
  createShell,
  logLine,
  notice,
  normalizeHexColor,
  numberField,
  propertyRow,
  sectionTitle,
  selectField,
  toolGrid,
  toolTile,
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

type LoopOutType = "cycle" | "pingpong" | "offset" | "continue";
type LoopOutRange = "all" | "keys" | "duration";

interface LoopOutDraft {
  type: LoopOutType;
  range: LoopOutRange;
  numKeyframes: number;
  duration: number;
}

interface LoopOutResultData {
  appliedCount: number;
  unchangedCount: number;
}

/** Mesma forma do LoopOut: os dois comandos reportam o lote da mesma maneira. */
type SmoothResultData = LoopOutResultData;

const DEFAULT_LOOP_OUT: LoopOutDraft = {
  type: "cycle",
  range: "all",
  numKeyframes: 1,
  duration: 1
};

type SmoothReference = "current" | "fixed";

interface SmoothDraft {
  widthSeconds: number;
  samples: number;
  reference: SmoothReference;
  referenceTime: number;
}

interface WiggleDraft {
  frequency: number;
  amplitude: number;
  octaves: number;
  amplitudeMultiplier: number;
  seed: number;
}

/**
 * Padroes: 2 oscilacoes por segundo e amplitude 30, o exemplo mais comum de
 * wiggle para posicao. Oitavas e queda repetem os padroes da propria Adobe (1 e
 * 0.5), e semente 0 e o offset padrao — ou seja, o estado inicial nao altera o
 * comportamento nativo da expressao.
 */
const DEFAULT_WIGGLE: WiggleDraft = {
  frequency: 2,
  amplitude: 30,
  octaves: 1,
  amplitudeMultiplier: 0.5,
  seed: 0
};

interface FlickerDraft {
  rate: number;
  minFactor: number;
  maxFactor: number;
  seed: number;
}

/**
 * Padroes: 12 atualizacoes por segundo, fator entre 0 e 1. O fator multiplica
 * o valor da propriedade, entao 0 apaga no quadro sorteado e 1 mantem o valor
 * original — a faixa padrao e a piscada classica de opacidade.
 */
const DEFAULT_FLICKER: FlickerDraft = {
  rate: 12,
  minFactor: 0,
  maxFactor: 1,
  seed: 0
};

interface TextBoxDraft {
  paddingX: number;
  paddingY: number;
  roundness: number;
  /** `#rrggbb` minusculo; convertido para os canais 0..1 do host no envio. */
  fillColor: string;
  fillOpacity: number;
}

/**
 * Padroes de legenda: margem confortavel, canto levemente arredondado, preto
 * opaco. Preto e a escolha que funciona sobre qualquer material sem virar
 * decisao de design — quem quiser cor troca num campo.
 */
const DEFAULT_TEXT_BOX: TextBoxDraft = {
  paddingX: 24,
  paddingY: 14,
  roundness: 8,
  fillColor: "#000000",
  fillOpacity: 100
};

/**
 * Padroes do `smooth()` do After Effects: janela de 0,2 s e 5 amostras. Sao os
 * valores que a documentacao da Adobe usa quando os argumentos sao omitidos, e
 * comecar longe deles faria o resultado surpreender quem ja conhece a expressao.
 */
const DEFAULT_SMOOTH: SmoothDraft = {
  widthSeconds: 0.2,
  samples: 5,
  reference: "current",
  referenceTime: 0
};

type MessageKey = Parameters<I18n["t"]>[0];
type ToolId = "loopOut" | "smooth" | "wiggle" | "flicker" | "textBox";

/**
 * Uma ferramenta do navegador.
 *
 * O registro existe para que acrescentar uma ferramenta seja acrescentar uma
 * entrada — e não mais uma aba na navegação e mais uma ramificação no
 * `renderView`. Era assim antes, e com quatro comandos o painel já gastava sete
 * abas: a §22 pede grade de ícones e uma tarefa dominante por vez.
 */
interface ToolDefinition {
  /** Precisa bater com uma chave de ícone do shell. */
  readonly id: ToolId;
  readonly nameKey: MessageKey;
  readonly descriptionKey: MessageKey;
  render(regions: RenderRegions, i18n: I18n): void;
  disabledReason(i18n: I18n): string | null;
  apply(shell: Shell, i18n: I18n, logger: MotionLogger, client: Client): Promise<void>;
  reset(): void;
}

const TOOLS: readonly ToolDefinition[] = [
  {
    id: "loopOut",
    nameKey: "tool.loopOut.name",
    descriptionKey: "tool.loopOut.description",
    render: renderLoopOut,
    disabledReason: loopOutDisabledReason,
    apply: applyLoopOut,
    reset: () => {
      state.loopOut = { ...DEFAULT_LOOP_OUT };
    }
  },
  {
    id: "smooth",
    nameKey: "tool.smooth.name",
    descriptionKey: "tool.smooth.description",
    render: renderSmooth,
    disabledReason: smoothDisabledReason,
    apply: applySmooth,
    reset: () => {
      state.smooth = { ...DEFAULT_SMOOTH };
    }
  },
  {
    id: "wiggle",
    nameKey: "tool.wiggle.name",
    descriptionKey: "tool.wiggle.description",
    render: renderWiggle,
    disabledReason: wiggleDisabledReason,
    apply: applyWiggle,
    reset: () => {
      state.wiggle = { ...DEFAULT_WIGGLE };
    }
  },
  {
    id: "flicker",
    nameKey: "tool.flicker.name",
    descriptionKey: "tool.flicker.description",
    render: renderFlicker,
    disabledReason: flickerDisabledReason,
    apply: applyFlicker,
    reset: () => {
      state.flicker = { ...DEFAULT_FLICKER };
    }
  },
  {
    id: "textBox",
    nameKey: "tool.textBox.name",
    descriptionKey: "tool.textBox.description",
    render: renderTextBox,
    disabledReason: textBoxDisabledReason,
    apply: applyTextBox,
    reset: () => {
      state.textBox = { ...DEFAULT_TEXT_BOX };
    }
  }
];

const VIEWS: ShellView[] = [
  { id: "context", labelKey: "nav.context", titleKey: "view.context.title" },
  { id: "tools", labelKey: "nav.tools", titleKey: "view.tools.title" },
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
  loopOut: LoopOutDraft;
  smooth: SmoothDraft;
  wiggle: WiggleDraft;
  flicker: FlickerDraft;
  textBox: TextBoxDraft;
  /** `null` mostra a grade; um id abre o editor daquela ferramenta. */
  activeTool: ToolId | null;
} = {
  context: null,
  capabilities: null,
  lastError: null,
  busy: false,
  busyReason: null,
  loopOut: { ...DEFAULT_LOOP_OUT },
  smooth: { ...DEFAULT_SMOOTH },
  wiggle: { ...DEFAULT_WIGGLE },
  flicker: { ...DEFAULT_FLICKER },
  textBox: { ...DEFAULT_TEXT_BOX },
  activeTool: null
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

  if (viewId === "tools") {
    const tool = TOOLS.find((item) => item.id === state.activeTool);

    // Sem ferramenta escolhida: so a grade. A §22 proibe inspector antes da
    // escolha — parametros de quatro ferramentas na mesma tela seriam quatro
    // tarefas competindo.
    if (!tool) {
      regions.content.appendChild(notice(document, i18n.t("message.toolsInstructions")));
      regions.content.appendChild(
        toolGrid(
          document,
          TOOLS.map((item) =>
            toolTile(document, {
              id: item.id,
              label: i18n.t(item.nameKey),
              description: i18n.t(item.descriptionKey),
              onSelect: () => {
                state.activeTool = item.id;
                state.lastError = null;
                shell.rerender();
              }
            })
          )
        )
      );
      return;
    }

    // Ferramenta aberta: o titulo passa a ser o nome dela. Deixa-lo em
    // "Ferramentas" obrigaria o usuario a voltar a grade para lembrar onde esta.
    shell.setViewTitle(i18n.t(tool.nameKey));
    tool.render(regions, i18n);

    const disabledReason = tool.disabledReason(i18n);
    regions.actions.appendChild(
      button(document, {
        label: i18n.t("action.apply"),
        variant: "primary",
        ...(disabledReason ? { disabled: true as const, disabledReason } : { disabled: false as const }),
        title: disabledReason ?? i18n.t("action.apply"),
        onClick: () => void tool.apply(shell, i18n, logger, client)
      })
    );
    regions.actions.appendChild(
      button(document, {
        label: i18n.t("action.reset"),
        ...(state.busy
          ? { disabled: true as const, disabledReason: state.busyReason ?? i18n.t("status.initializing") }
          : { disabled: false as const }),
        title: state.busy ? state.busyReason ?? i18n.t("status.initializing") : i18n.t("action.reset"),
        onClick: () => {
          tool.reset();
          state.lastError = null;
          shell.rerender();
        }
      })
    );
    regions.actions.appendChild(
      button(document, {
        label: i18n.t("action.backToTools"),
        ...(state.busy
          ? { disabled: true as const, disabledReason: state.busyReason ?? i18n.t("status.initializing") }
          : { disabled: false as const }),
        title: state.busy ? state.busyReason ?? i18n.t("status.initializing") : i18n.t("action.backToTools"),
        onClick: () => {
          state.activeTool = null;
          state.lastError = null;
          shell.rerender();
        }
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

function isLoopOutType(value: string): value is LoopOutType {
  return value === "cycle" || value === "pingpong" || value === "offset" || value === "continue";
}

function isLoopOutRange(value: string): value is LoopOutRange {
  return value === "all" || value === "keys" || value === "duration";
}

function isLoopOutDraftValid(draft: LoopOutDraft): boolean {
  if (draft.type === "continue" || draft.range === "all") {
    return true;
  }
  if (draft.range === "keys") {
    return Number.isFinite(draft.numKeyframes) && Number.isInteger(draft.numKeyframes) &&
      draft.numKeyframes >= 1 && draft.numKeyframes <= 1000;
  }
  return Number.isFinite(draft.duration) && draft.duration > 0 && draft.duration <= 3600;
}

function loopOutDisabledReason(i18n: I18n): string | null {
  if (state.busy) {
    return state.busyReason ?? i18n.t("status.initializing");
  }
  if (!state.context?.isComposition) {
    return i18n.t("message.loopOutNoActiveComp");
  }
  if (!isLoopOutDraftValid(state.loopOut)) {
    return i18n.t("message.loopOutInvalidNumber");
  }
  return null;
}

/** As faixas repetem host e biblioteca; ver docs/research/after-effects-wiggle-and-seed.md. */
function isFlickerDraftValid(draft: FlickerDraft): boolean {
  if (!Number.isFinite(draft.rate) || draft.rate <= 0 || draft.rate > 120) return false;
  if (!Number.isFinite(draft.minFactor) || draft.minFactor < 0 || draft.minFactor > 10) return false;
  if (!Number.isFinite(draft.maxFactor) || draft.maxFactor < 0 || draft.maxFactor > 10) return false;
  if (draft.minFactor > draft.maxFactor) return false;
  return Number.isInteger(draft.seed) && draft.seed >= 0 && draft.seed <= 100_000;
}

function flickerDisabledReason(i18n: I18n): string | null {
  if (state.busy) {
    return state.busyReason ?? i18n.t("status.initializing");
  }
  if (!state.context?.isComposition) {
    return i18n.t("message.flickerNoActiveComp");
  }
  // A faixa invertida ganha mensagem propria: o usuario precisa saber QUAL
  // regra quebrou, e nao apenas que algum numero esta errado.
  if (state.flicker.minFactor > state.flicker.maxFactor) {
    return i18n.t("message.flickerRangeInverted");
  }
  if (!isFlickerDraftValid(state.flicker)) {
    return i18n.t("message.flickerInvalidNumber");
  }
  return null;
}

function renderFlicker(regions: RenderRegions, i18n: I18n): void {
  const shell = regions.shell;
  const draft = state.flicker;

  regions.content.appendChild(notice(document, i18n.t("message.flickerInstructions")));
  if (state.context && !state.context.isComposition) {
    regions.content.appendChild(notice(document, i18n.t("message.flickerNoActiveComp"), "warning"));
  }

  regions.content.appendChild(sectionTitle(document, i18n.t("flicker.section.main")));

  regions.content.appendChild(
    numberField(document, {
      id: "flicker-rate",
      label: i18n.t("flicker.rate"),
      value: draft.rate,
      min: 0.1,
      max: 120,
      step: 1,
      unit: i18n.t("flicker.unit.perSecond"),
      disabled: state.busy,
      onCommit: (value) => {
        state.flicker.rate = value;
        shell.rerender();
      }
    })
  );

  regions.content.appendChild(
    numberField(document, {
      id: "flicker-min",
      label: i18n.t("flicker.minFactor"),
      value: draft.minFactor,
      min: 0,
      max: 10,
      step: 0.05,
      disabled: state.busy,
      onCommit: (value) => {
        state.flicker.minFactor = value;
        shell.rerender();
      }
    })
  );

  regions.content.appendChild(
    numberField(document, {
      id: "flicker-max",
      label: i18n.t("flicker.maxFactor"),
      value: draft.maxFactor,
      min: 0,
      max: 10,
      step: 0.05,
      disabled: state.busy,
      onCommit: (value) => {
        state.flicker.maxFactor = value;
        shell.rerender();
      }
    })
  );

  regions.content.appendChild(
    numberField(document, {
      id: "flicker-seed",
      label: i18n.t("flicker.seed"),
      description: i18n.t("flicker.seed.description"),
      value: draft.seed,
      min: 0,
      max: 100_000,
      step: 1,
      disabled: state.busy,
      onCommit: (value) => {
        state.flicker.seed = value;
        shell.rerender();
      }
    })
  );
}

/** As faixas repetem host e biblioteca; ver docs/research/after-effects-wiggle-and-seed.md. */
function isWiggleDraftValid(draft: WiggleDraft): boolean {
  if (!Number.isFinite(draft.frequency) || draft.frequency <= 0 || draft.frequency > 100) return false;
  if (!Number.isFinite(draft.amplitude) || draft.amplitude < 0 || draft.amplitude > 100_000) return false;
  if (!Number.isInteger(draft.octaves) || draft.octaves < 1 || draft.octaves > 10) return false;
  if (
    !Number.isFinite(draft.amplitudeMultiplier) ||
    draft.amplitudeMultiplier < 0 ||
    draft.amplitudeMultiplier > 10
  ) {
    return false;
  }
  return Number.isInteger(draft.seed) && draft.seed >= 0 && draft.seed <= 100_000;
}

function wiggleDisabledReason(i18n: I18n): string | null {
  if (state.busy) {
    return state.busyReason ?? i18n.t("status.initializing");
  }
  if (!state.context?.isComposition) {
    return i18n.t("message.wiggleNoActiveComp");
  }
  if (!isWiggleDraftValid(state.wiggle)) {
    return i18n.t("message.wiggleInvalidNumber");
  }
  return null;
}

function renderWiggle(regions: RenderRegions, i18n: I18n): void {
  const shell = regions.shell;
  const draft = state.wiggle;

  regions.content.appendChild(notice(document, i18n.t("message.wiggleInstructions")));
  if (state.context && !state.context.isComposition) {
    regions.content.appendChild(notice(document, i18n.t("message.wiggleNoActiveComp"), "warning"));
  }

  regions.content.appendChild(sectionTitle(document, i18n.t("wiggle.section.main")));

  regions.content.appendChild(
    numberField(document, {
      id: "wiggle-frequency",
      label: i18n.t("wiggle.frequency"),
      value: draft.frequency,
      min: 0.01,
      max: 100,
      step: 0.1,
      unit: i18n.t("wiggle.unit.hertz"),
      disabled: state.busy,
      onCommit: (value) => {
        state.wiggle.frequency = value;
        shell.rerender();
      }
    })
  );

  regions.content.appendChild(
    numberField(document, {
      id: "wiggle-amplitude",
      label: i18n.t("wiggle.amplitude"),
      value: draft.amplitude,
      min: 0,
      max: 100_000,
      step: 1,
      disabled: state.busy,
      onCommit: (value) => {
        state.wiggle.amplitude = value;
        shell.rerender();
      }
    })
  );

  // Oitavas e queda controlam o detalhe do ruido. Ficam numa secao propria
  // porque a maioria dos usos nao os altera.
  regions.content.appendChild(sectionTitle(document, i18n.t("wiggle.section.detail")));

  regions.content.appendChild(
    numberField(document, {
      id: "wiggle-octaves",
      label: i18n.t("wiggle.octaves"),
      value: draft.octaves,
      min: 1,
      max: 10,
      step: 1,
      disabled: state.busy,
      onCommit: (value) => {
        state.wiggle.octaves = value;
        shell.rerender();
      }
    })
  );

  regions.content.appendChild(
    numberField(document, {
      id: "wiggle-falloff",
      label: i18n.t("wiggle.amplitudeMultiplier"),
      value: draft.amplitudeMultiplier,
      min: 0,
      max: 10,
      step: 0.05,
      disabled: state.busy,
      onCommit: (value) => {
        state.wiggle.amplitudeMultiplier = value;
        shell.rerender();
      }
    })
  );

  regions.content.appendChild(
    numberField(document, {
      id: "wiggle-seed",
      label: i18n.t("wiggle.seed"),
      description: i18n.t("wiggle.seed.description"),
      value: draft.seed,
      min: 0,
      max: 100_000,
      step: 1,
      disabled: state.busy,
      onCommit: (value) => {
        state.wiggle.seed = value;
        shell.rerender();
      }
    })
  );
}

function isSmoothReference(value: string): value is SmoothReference {
  return value === "current" || value === "fixed";
}

/**
 * As faixas repetem as do host e as da biblioteca de propósito.
 *
 * Validar aqui evita uma ida ao ExtendScript para receber `INVALID_PRESET`, e o
 * host valida de novo porque nada que atravessa a ponte é confiável.
 */
function isSmoothDraftValid(draft: SmoothDraft): boolean {
  if (!Number.isFinite(draft.widthSeconds) || draft.widthSeconds <= 0 || draft.widthSeconds > 3600) {
    return false;
  }
  if (
    !Number.isInteger(draft.samples) ||
    draft.samples < 1 ||
    draft.samples > 101
  ) {
    return false;
  }
  if (draft.reference === "current") {
    return true;
  }
  return Number.isFinite(draft.referenceTime) && draft.referenceTime >= 0;
}

function smoothDisabledReason(i18n: I18n): string | null {
  if (state.busy) {
    return state.busyReason ?? i18n.t("status.initializing");
  }
  if (!state.context?.isComposition) {
    return i18n.t("message.smoothNoActiveComp");
  }
  if (!isSmoothDraftValid(state.smooth)) {
    return i18n.t("message.smoothInvalidNumber");
  }
  return null;
}

function renderSmooth(regions: RenderRegions, i18n: I18n): void {
  const shell = regions.shell;
  const draft = state.smooth;

  regions.content.appendChild(notice(document, i18n.t("message.smoothInstructions")));
  if (state.context && !state.context.isComposition) {
    regions.content.appendChild(notice(document, i18n.t("message.smoothNoActiveComp"), "warning"));
  }

  regions.content.appendChild(sectionTitle(document, i18n.t("smooth.section.main")));

  regions.content.appendChild(
    numberField(document, {
      id: "smooth-width",
      label: i18n.t("smooth.width"),
      value: draft.widthSeconds,
      min: 0.001,
      max: 3600,
      step: 0.05,
      unit: i18n.t("smooth.unit.seconds"),
      disabled: state.busy,
      onCommit: (value) => {
        state.smooth.widthSeconds = value;
        shell.rerender();
      }
    })
  );

  regions.content.appendChild(
    numberField(document, {
      id: "smooth-samples",
      label: i18n.t("smooth.samples"),
      value: draft.samples,
      min: 1,
      max: 101,
      step: 1,
      disabled: state.busy,
      onCommit: (value) => {
        state.smooth.samples = value;
        shell.rerender();
      }
    })
  );

  regions.content.appendChild(
    selectField(document, {
      id: "smooth-reference",
      label: i18n.t("smooth.reference"),
      value: draft.reference,
      options: [
        { value: "current", label: i18n.t("smooth.reference.current") },
        { value: "fixed", label: i18n.t("smooth.reference.fixed") }
      ],
      disabled: state.busy,
      onChange: (value) => {
        if (!isSmoothReference(value)) return;
        state.smooth.reference = value;
        shell.rerender();
      }
    })
  );

  // O campo de tempo só aparece quando ele governa alguma coisa: mostrá-lo
  // desabilitado ao lado de "Tempo atual" seria ruído permanente.
  if (draft.reference === "fixed") {
    regions.content.appendChild(
      numberField(document, {
        id: "smooth-reference-time",
        label: i18n.t("smooth.referenceTime"),
        value: draft.referenceTime,
        min: 0,
        max: 10800,
        step: 0.1,
        unit: i18n.t("smooth.unit.seconds"),
        disabled: state.busy,
        onCommit: (value) => {
          state.smooth.referenceTime = value;
          shell.rerender();
        }
      })
    );
  }
}

function renderLoopOut(regions: RenderRegions, i18n: I18n): void {
  const shell = regions.shell;
  const draft = state.loopOut;

  regions.content.appendChild(notice(document, i18n.t("message.loopOutInstructions")));
  if (state.context && !state.context.isComposition) {
    regions.content.appendChild(notice(document, i18n.t("message.loopOutNoActiveComp"), "warning"));
  }

  regions.content.appendChild(sectionTitle(document, i18n.t("loopOut.section.main")));
  regions.content.appendChild(
    selectField(document, {
      id: "motion-loopout-type",
      label: i18n.t("loopOut.type"),
      value: draft.type,
      options: [
        { value: "cycle", label: i18n.t("loopOut.type.cycle") },
        { value: "pingpong", label: i18n.t("loopOut.type.pingpong") },
        { value: "offset", label: i18n.t("loopOut.type.offset") },
        { value: "continue", label: i18n.t("loopOut.type.continue") }
      ],
      ...(state.busy
        ? { disabled: true, disabledReason: state.busyReason ?? i18n.t("status.initializing") }
        : { disabled: false }),
      onChange: (value) => {
        if (!isLoopOutType(value)) return;
        state.loopOut.type = value;
        if (value === "continue") state.loopOut.range = "all";
        shell.rerender();
      }
    })
  );

  const continueMode = draft.type === "continue";
  regions.content.appendChild(
    selectField(document, {
      id: "motion-loopout-range",
      label: i18n.t("loopOut.range"),
      value: continueMode ? "all" : draft.range,
      options: [
        { value: "all", label: i18n.t("loopOut.range.all") },
        { value: "keys", label: i18n.t("loopOut.range.keys") },
        { value: "duration", label: i18n.t("loopOut.range.duration") }
      ],
      ...(state.busy || continueMode
        ? {
            disabled: true,
            disabledReason: state.busy
              ? state.busyReason ?? i18n.t("status.initializing")
              : i18n.t("loopOut.type.continue")
          }
        : { disabled: false }),
      onChange: (value) => {
        if (!isLoopOutRange(value)) return;
        state.loopOut.range = value;
        shell.rerender();
      }
    })
  );

  if (!continueMode && draft.range === "keys") {
    regions.content.appendChild(
      numberField(document, {
        id: "motion-loopout-keyframes",
        label: i18n.t("loopOut.numKeyframes"),
        value: draft.numKeyframes,
        min: 1,
        max: 1000,
        step: 1,
        ...(state.busy
          ? { disabled: true, disabledReason: state.busyReason ?? i18n.t("status.initializing") }
          : { disabled: false }),
        onInput: (value) => {
          state.loopOut.numKeyframes = value;
        },
        onCommit: (value) => {
          state.loopOut.numKeyframes = value;
          shell.rerender();
        }
      })
    );
  }

  if (!continueMode && draft.range === "duration") {
    regions.content.appendChild(
      numberField(document, {
        id: "motion-loopout-duration",
        label: i18n.t("loopOut.duration"),
        value: draft.duration,
        min: 0.01,
        max: 3600,
        step: 0.01,
        unit: "s",
        ...(state.busy
          ? { disabled: true, disabledReason: state.busyReason ?? i18n.t("status.initializing") }
          : { disabled: false }),
        onInput: (value) => {
          state.loopOut.duration = value;
        },
        onCommit: (value) => {
          state.loopOut.duration = value;
          shell.rerender();
        }
      })
    );
  }

  regions.content.appendChild(sectionTitle(document, i18n.t("loopOut.section.safety")));
  regions.content.appendChild(
    propertyRow(document, i18n.t("loopOut.safeConflict"), i18n.t("loopOut.safeConflict.value"), "ok")
  );
  regions.content.appendChild(notice(document, i18n.t("loopOut.safeConflict.description")));
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

function isLoopOutResultData(value: unknown): value is LoopOutResultData {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<LoopOutResultData>;
  return Number.isInteger(candidate.appliedCount) && (candidate.appliedCount ?? -1) >= 0 &&
    Number.isInteger(candidate.unchangedCount) && (candidate.unchangedCount ?? -1) >= 0;
}

async function applyFlicker(
  shell: Shell,
  i18n: I18n,
  logger: MotionLogger,
  client: Client
): Promise<void> {
  if (state.busy) return;

  if (!state.context?.isComposition) {
    state.lastError = i18n.t("message.flickerNoActiveComp");
    shell.setStatus(i18n.t("status.notCompleted"), "error");
    shell.rerender();
    return;
  }

  const draft = state.flicker;
  if (!isFlickerDraftValid(draft)) {
    state.lastError = draft.minFactor > draft.maxFactor
      ? i18n.t("message.flickerRangeInverted")
      : i18n.t("message.flickerInvalidNumber");
    shell.setStatus(i18n.t("status.notCompleted"), "error");
    shell.rerender();
    return;
  }

  shell.setStatus(i18n.t("status.applyingFlicker"), "busy");
  setBusy(shell, true, i18n.t("status.applyingFlicker"));

  const response = await client.execute<SmoothResultData>(
    "ae.expression.flicker",
    {
      rate: draft.rate,
      minFactor: draft.minFactor,
      maxFactor: draft.maxFactor,
      seed: draft.seed,
      conflictMode: "skip"
    },
    { preserveSelection: true }
  );
  logger.recordResponse("ae.expression.flicker", response);

  if (!response.ok || !isSmoothResultData(response.data)) {
    if (!response.ok) {
      reportFailure(shell, i18n, response);
    } else {
      state.lastError = i18n.t("message.failureWithoutReason");
      logger.error("Resposta Flicker invalida.", {
        command: "ae.expression.flicker",
        errorCode: "INVALID_HOST_RESPONSE",
        result: "failure"
      });
      shell.setStatus(i18n.t("status.failed"), "error");
    }
    setBusy(shell, false);
    return;
  }

  state.lastError = null;
  const success = response.data.appliedCount > 0
    ? i18n.t("message.flickerApplied", { count: response.data.appliedCount })
    : i18n.t("message.flickerAlreadyApplied", { count: response.data.unchangedCount });
  shell.setStatus(success, "ok");
  setBusy(shell, false);
}

interface TextBoxResultData {
  createdCount: number;
  unchangedCount: number;
}

function isTextBoxResultData(value: unknown): value is TextBoxResultData {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    Number.isInteger(record.createdCount) &&
    (record.createdCount as number) >= 0 &&
    Number.isInteger(record.unchangedCount) &&
    (record.unchangedCount as number) >= 0
  );
}

function isTextBoxDraftValid(draft: TextBoxDraft): boolean {
  for (const valor of [draft.paddingX, draft.paddingY, draft.roundness]) {
    if (!Number.isFinite(valor) || valor < 0 || valor > 10_000) return false;
  }
  if (!Number.isFinite(draft.fillOpacity) || draft.fillOpacity < 0 || draft.fillOpacity > 100) {
    return false;
  }
  return normalizeHexColor(draft.fillColor) !== null;
}

/**
 * `#rrggbb` para os tres canais 0..1 que o `ADBE Vector Fill Color` recebe.
 *
 * A divisao por 255 e a conversao direta do valor sRGB. Se o projeto estiver com
 * gerenciamento de cor ativo, o After Effects pode interpretar esses numeros no
 * espaco de trabalho e a cor exibida nao bater exatamente com o seletor — isso
 * ainda nao foi medido em host e esta registrado em docs/HOST_LIMITATIONS.md.
 */
function hexToChannels(hex: string): [number, number, number] {
  const normalized = normalizeHexColor(hex) ?? "#000000";
  return [
    parseInt(normalized.slice(1, 3), 16) / 255,
    parseInt(normalized.slice(3, 5), 16) / 255,
    parseInt(normalized.slice(5, 7), 16) / 255
  ];
}

function renderTextBox(regions: RenderRegions, i18n: I18n): void {
  const shell = regions.shell;
  const draft = state.textBox;

  regions.content.appendChild(notice(document, i18n.t("message.textBoxInstructions")));
  if (state.context && !state.context.isComposition) {
    regions.content.appendChild(notice(document, i18n.t("message.textBoxNoActiveComp"), "warning"));
  }

  regions.content.appendChild(sectionTitle(document, i18n.t("textBox.section.size")));

  regions.content.appendChild(
    numberField(document, {
      id: "textbox-padding-x",
      label: i18n.t("textBox.paddingX"),
      value: draft.paddingX,
      min: 0,
      max: 10_000,
      step: 1,
      unit: i18n.t("textBox.unit.px"),
      disabled: state.busy,
      onCommit: (value) => {
        state.textBox.paddingX = value;
        shell.rerender();
      }
    })
  );

  regions.content.appendChild(
    numberField(document, {
      id: "textbox-padding-y",
      label: i18n.t("textBox.paddingY"),
      description: i18n.t("textBox.paddingY.description"),
      value: draft.paddingY,
      min: 0,
      max: 10_000,
      step: 1,
      unit: i18n.t("textBox.unit.px"),
      disabled: state.busy,
      onCommit: (value) => {
        state.textBox.paddingY = value;
        shell.rerender();
      }
    })
  );

  regions.content.appendChild(
    numberField(document, {
      id: "textbox-roundness",
      label: i18n.t("textBox.roundness"),
      value: draft.roundness,
      min: 0,
      max: 10_000,
      step: 1,
      unit: i18n.t("textBox.unit.px"),
      disabled: state.busy,
      onCommit: (value) => {
        state.textBox.roundness = value;
        shell.rerender();
      }
    })
  );

  regions.content.appendChild(sectionTitle(document, i18n.t("textBox.section.fill")));

  regions.content.appendChild(
    colorField(document, {
      id: "textbox-fill-color",
      label: i18n.t("textBox.fillColor"),
      value: draft.fillColor,
      disabled: state.busy,
      onCommit: (value) => {
        state.textBox.fillColor = value;
        shell.rerender();
      }
    })
  );

  regions.content.appendChild(
    numberField(document, {
      id: "textbox-fill-opacity",
      label: i18n.t("textBox.fillOpacity"),
      value: draft.fillOpacity,
      min: 0,
      max: 100,
      step: 1,
      unit: i18n.t("textBox.unit.percent"),
      disabled: state.busy,
      onCommit: (value) => {
        state.textBox.fillOpacity = value;
        shell.rerender();
      }
    })
  );
}

function textBoxDisabledReason(i18n: I18n): string | null {
  if (state.busy) {
    return state.busyReason ?? i18n.t("status.initializing");
  }
  if (!state.context?.isComposition) {
    return i18n.t("message.textBoxNoActiveComp");
  }
  if (!isTextBoxDraftValid(state.textBox)) {
    return i18n.t("message.textBoxInvalidNumber");
  }
  return null;
}

async function applyTextBox(
  shell: Shell,
  i18n: I18n,
  logger: MotionLogger,
  client: Client
): Promise<void> {
  if (state.busy) return;

  if (!state.context?.isComposition) {
    state.lastError = i18n.t("message.textBoxNoActiveComp");
    shell.setStatus(i18n.t("status.notCompleted"), "error");
    shell.rerender();
    return;
  }

  const draft = state.textBox;
  if (!isTextBoxDraftValid(draft)) {
    state.lastError = i18n.t("message.textBoxInvalidNumber");
    shell.setStatus(i18n.t("status.notCompleted"), "error");
    shell.rerender();
    return;
  }

  shell.setStatus(i18n.t("status.applyingTextBox"), "busy");
  setBusy(shell, true, i18n.t("status.applyingTextBox"));

  const response = await client.execute<TextBoxResultData>(
    "ae.text.box",
    {
      paddingX: draft.paddingX,
      paddingY: draft.paddingY,
      roundness: draft.roundness,
      fillColor: hexToChannels(draft.fillColor),
      fillOpacity: draft.fillOpacity,
      // Uma caixa por camada de texto é a única forma implementada; o host
      // recusa `false` em vez de ignorar. Ver docs/HOST_LIMITATIONS.md.
      createPerLayer: true,
      conflictMode: "skip"
    },
    { preserveSelection: true }
  );
  logger.recordResponse("ae.text.box", response);

  if (!response.ok || !isTextBoxResultData(response.data)) {
    if (!response.ok) {
      reportFailure(shell, i18n, response);
    } else {
      state.lastError = i18n.t("message.failureWithoutReason");
      logger.error("Resposta de caixa de texto invalida.", {
        command: "ae.text.box",
        errorCode: "INVALID_HOST_RESPONSE",
        result: "failure"
      });
      shell.setStatus(i18n.t("status.failed"), "error");
    }
    setBusy(shell, false);
    return;
  }

  state.lastError = null;
  const success = response.data.createdCount > 0
    ? i18n.t("message.textBoxCreated", { count: response.data.createdCount })
    : i18n.t("message.textBoxAlreadyCreated", { count: response.data.unchangedCount });
  shell.setStatus(success, "ok");
  setBusy(shell, false);
}

async function applyWiggle(
  shell: Shell,
  i18n: I18n,
  logger: MotionLogger,
  client: Client
): Promise<void> {
  if (state.busy) return;

  if (!state.context?.isComposition) {
    state.lastError = i18n.t("message.wiggleNoActiveComp");
    shell.setStatus(i18n.t("status.notCompleted"), "error");
    shell.rerender();
    return;
  }

  const draft = state.wiggle;
  if (!isWiggleDraftValid(draft)) {
    state.lastError = i18n.t("message.wiggleInvalidNumber");
    shell.setStatus(i18n.t("status.notCompleted"), "error");
    shell.rerender();
    return;
  }

  shell.setStatus(i18n.t("status.applyingWiggle"), "busy");
  setBusy(shell, true, i18n.t("status.applyingWiggle"));

  const response = await client.execute<SmoothResultData>(
    "ae.expression.wiggle",
    {
      frequency: draft.frequency,
      amplitude: draft.amplitude,
      octaves: draft.octaves,
      amplitudeMultiplier: draft.amplitudeMultiplier,
      seed: draft.seed,
      conflictMode: "skip"
    },
    { preserveSelection: true }
  );
  logger.recordResponse("ae.expression.wiggle", response);

  if (!response.ok || !isSmoothResultData(response.data)) {
    if (!response.ok) {
      reportFailure(shell, i18n, response);
    } else {
      state.lastError = i18n.t("message.failureWithoutReason");
      logger.error("Resposta Wiggle invalida.", {
        command: "ae.expression.wiggle",
        errorCode: "INVALID_HOST_RESPONSE",
        result: "failure"
      });
      shell.setStatus(i18n.t("status.failed"), "error");
    }
    setBusy(shell, false);
    return;
  }

  state.lastError = null;
  const success = response.data.appliedCount > 0
    ? i18n.t("message.wiggleApplied", { count: response.data.appliedCount })
    : i18n.t("message.wiggleAlreadyApplied", { count: response.data.unchangedCount });
  shell.setStatus(success, "ok");
  setBusy(shell, false);
}

function isSmoothResultData(value: unknown): value is SmoothResultData {
  return isLoopOutResultData(value);
}

async function applySmooth(
  shell: Shell,
  i18n: I18n,
  logger: MotionLogger,
  client: Client
): Promise<void> {
  if (state.busy) return;

  if (!state.context?.isComposition) {
    state.lastError = i18n.t("message.smoothNoActiveComp");
    shell.setStatus(i18n.t("status.notCompleted"), "error");
    shell.rerender();
    return;
  }

  const draft = state.smooth;
  if (!isSmoothDraftValid(draft)) {
    state.lastError = i18n.t("message.smoothInvalidNumber");
    shell.setStatus(i18n.t("status.notCompleted"), "error");
    shell.rerender();
    return;
  }

  // "current" vira o token que o host traduz para `time`; o tempo fixo viaja
  // como número. A conversão acontece aqui, e não no host, para que o host
  // continue recebendo apenas tokens da allowlist.
  const referenceTime = draft.reference === "current" ? "current" : draft.referenceTime;

  shell.setStatus(i18n.t("status.applyingSmooth"), "busy");
  setBusy(shell, true, i18n.t("status.applyingSmooth"));

  const response = await client.execute<SmoothResultData>(
    "ae.expression.smooth",
    {
      widthSeconds: draft.widthSeconds,
      samples: draft.samples,
      referenceTime,
      conflictMode: "skip"
    },
    { preserveSelection: true }
  );
  logger.recordResponse("ae.expression.smooth", response);

  if (!response.ok || !isSmoothResultData(response.data)) {
    if (!response.ok) {
      reportFailure(shell, i18n, response);
    } else {
      state.lastError = i18n.t("message.failureWithoutReason");
      logger.error("Resposta Smooth inválida.", {
        command: "ae.expression.smooth",
        errorCode: "INVALID_HOST_RESPONSE",
        result: "failure"
      });
      shell.setStatus(i18n.t("status.failed"), "error");
    }
    setBusy(shell, false);
    return;
  }

  state.lastError = null;
  const success = response.data.appliedCount > 0
    ? i18n.t("message.smoothApplied", { count: response.data.appliedCount })
    : i18n.t("message.smoothAlreadyApplied", { count: response.data.unchangedCount });
  shell.setStatus(success, "ok");
  setBusy(shell, false);
}

async function applyLoopOut(
  shell: Shell,
  i18n: I18n,
  logger: MotionLogger,
  client: Client
): Promise<void> {
  if (state.busy) return;

  if (!state.context?.isComposition) {
    state.lastError = i18n.t("message.loopOutNoActiveComp");
    shell.setStatus(i18n.t("status.notCompleted"), "error");
    shell.rerender();
    return;
  }

  const draft = state.loopOut;
  if (!isLoopOutDraftValid(draft)) {
    state.lastError = i18n.t("message.loopOutInvalidNumber");
    shell.setStatus(i18n.t("status.notCompleted"), "error");
    shell.rerender();
    return;
  }

  const useDuration = draft.type !== "continue" && draft.range === "duration";
  const numKeyframes = draft.type !== "continue" && draft.range === "keys" ? draft.numKeyframes : 0;
  const duration = useDuration ? draft.duration : 0;

  shell.setStatus(i18n.t("status.applyingLoopOut"), "busy");
  setBusy(shell, true, i18n.t("status.applyingLoopOut"));

  const response = await client.execute<LoopOutResultData>(
    "ae.expression.loopout",
    {
      type: draft.type,
      numKeyframes,
      duration,
      useDuration,
      conflictMode: "skip"
    },
    { preserveSelection: true }
  );
  logger.recordResponse("ae.expression.loopout", response);

  if (!response.ok || !isLoopOutResultData(response.data)) {
    if (!response.ok) {
      reportFailure(shell, i18n, response);
    } else {
      state.lastError = i18n.t("message.failureWithoutReason");
      logger.error("Resposta LoopOut inválida.", {
        command: "ae.expression.loopout",
        errorCode: "INVALID_HOST_RESPONSE",
        result: "failure"
      });
      shell.setStatus(i18n.t("status.failed"), "error");
    }
    setBusy(shell, false);
    return;
  }

  state.lastError = null;
  const success = response.data.appliedCount > 0
    ? i18n.t("message.loopOutApplied", { count: response.data.appliedCount })
    : i18n.t("message.loopOutAlreadyApplied", { count: response.data.unchangedCount });
  shell.setStatus(success, "ok");
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
