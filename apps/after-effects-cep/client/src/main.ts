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
  anchorGrid,
  button,
  checkboxField,
  colorField,
  createI18n,
  createShell,
  hint,
  logLine,
  notice,
  normalizeHexColor,
  numberField,
  propertyRow,
  sectionTitle,
  selectField,
  textField,
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

interface LayerSummary {
  index: number;
  name: string;
  type: string;
  parentIndex: number | null;
  selected: boolean;
}

type ChainMode = "target" | "chain";

interface ParentDraft {
  /** `0` significa "nenhum alvo". O host recusa isso fora do modo encadear. */
  targetLayerIndex: number;
  /** Soma de verificação contra timeline mudado entre a leitura e o clique. */
  targetLayerName: string;
  preserveWorldTransform: boolean;
  unparent: boolean;
  chainMode: ChainMode;
}

/**
 * `preserveWorldTransform` nasce ligado porque é o comportamento do pickwhip do
 * timeline: reparentar sem mexer na aparência. Chegar com ele desligado faria as
 * camadas saltarem no primeiro clique de quem não leu o campo.
 */
const DEFAULT_PARENT: ParentDraft = {
  targetLayerIndex: 0,
  targetLayerName: "",
  preserveWorldTransform: true,
  unparent: false,
  chainMode: "target"
};

type AnchorGridPoint =
  | "topLeft"
  | "topCenter"
  | "topRight"
  | "midLeft"
  | "center"
  | "midRight"
  | "bottomLeft"
  | "bottomCenter"
  | "bottomRight";

const ANCHOR_GRID: ReadonlyArray<{ ponto: AnchorGridPoint; rotulo: MessageKey }> = [
  { ponto: "topLeft", rotulo: "anchor.grid.topLeft" },
  { ponto: "topCenter", rotulo: "anchor.grid.topCenter" },
  { ponto: "topRight", rotulo: "anchor.grid.topRight" },
  { ponto: "midLeft", rotulo: "anchor.grid.midLeft" },
  { ponto: "center", rotulo: "anchor.grid.center" },
  { ponto: "midRight", rotulo: "anchor.grid.midRight" },
  { ponto: "bottomLeft", rotulo: "anchor.grid.bottomLeft" },
  { ponto: "bottomCenter", rotulo: "anchor.grid.bottomCenter" },
  { ponto: "bottomRight", rotulo: "anchor.grid.bottomRight" }
];

interface AnchorDraft {
  gridPoint: AnchorGridPoint;
  mode: "normal" | "reverse" | "random";
  timeMode: "currentTime" | "fixed";
  fixedTime: number;
  includeExtents: boolean;
  preserveVisualPosition: boolean;
  randomSeed: number;
}

/**
 * Centro com aparência preservada: é o alinhamento que se pede na maior parte
 * das vezes, e é o único que não move nada ao ser aplicado sem pensar.
 */
const DEFAULT_ANCHOR: AnchorDraft = {
  gridPoint: "center",
  mode: "normal",
  timeMode: "currentTime",
  fixedTime: 0,
  includeExtents: false,
  preserveVisualPosition: true,
  randomSeed: 0
};

type CutRangeMode =
  | "beforeCti"
  | "afterCti"
  | "insideWorkArea"
  | "outsideWorkArea"
  | "betweenMarkers";

interface CutKeysDraft {
  rangeMode: CutRangeMode;
  startTime: number;
  endTime: number;
  includeBoundary: boolean;
}

/**
 * "Depois do cursor" é o corte mais comum e não pede nenhum número: a
 * ferramenta abre pronta para uso.
 *
 * Os tempos nascem zerados porque o host exige que campos inativos sejam
 * canônicos — ele recusa valores fora do modo em vez de ignorá-los em silêncio,
 * e o painel precisa mandar exatamente zero quando o modo não os usa.
 */
const DEFAULT_CUT_KEYS: CutKeysDraft = {
  rangeMode: "afterCti",
  startTime: 0,
  endTime: 0,
  includeBoundary: false
};

type DelayOrder = "timeline" | "selection" | "name" | "distance" | "random";

interface DelayDraft {
  delayFrames: number;
  order: DelayOrder;
  reverse: boolean;
  randomSeed: number;
  originX: number;
  originY: number;
  shiftMode: "layerStart" | "keyframes";
}

/** Dois quadros por passo na ordem do timeline: a cascata clássica. */
const DEFAULT_DELAY: DelayDraft = {
  delayFrames: 2,
  order: "timeline",
  reverse: false,
  randomSeed: 0,
  originX: 0,
  originY: 0,
  shiftMode: "layerStart"
};

type LayerScope = "selected" | "composition";

interface RenameDraft {
  scope: LayerScope;
  prefix: string;
  suffix: string;
  find: string;
  replace: string;
  regex: boolean;
  counterStart: number;
  padding: number;
  sourceName: boolean;
}

/**
 * Contador desligado por padrão (`padding: 0`) e escopo na seleção.
 *
 * Abrir a ferramenta não pode propor uma renomeação em massa da composição
 * inteira: o escopo mais amplo precisa ser uma escolha, não o que já está
 * marcado quando a pessoa chega.
 */
const DEFAULT_RENAME: RenameDraft = {
  scope: "selected",
  prefix: "",
  suffix: "",
  find: "",
  replace: "",
  regex: false,
  counterStart: 1,
  padding: 0,
  sourceName: false
};

interface ReverseOrderDraft {
  scope: LayerScope;
  preserveTrackMattes: boolean;
  preserveParents: boolean;
  reverseTimingToo: boolean;
}

/** Preservar relações é o padrão; mexer no tempo exige pedido explícito (§7). */
const DEFAULT_REVERSE_ORDER: ReverseOrderDraft = {
  scope: "selected",
  preserveTrackMattes: true,
  preserveParents: true,
  reverseTimingToo: false
};

interface FlipDraft {
  axis: "horizontal" | "vertical";
  pivot: "anchor" | "selectionBounds" | "compCenter";
  groupMode: "each" | "group";
  preserveTextReadability: boolean;
}

/**
 * Horizontal em torno da âncora é o espelhamento que a pessoa espera de um
 * comando chamado "Espelhar": a camada não sai do lugar e só o conteúdo inverte.
 * Legibilidade preservada nasce ligada porque texto invertido raramente é o
 * pedido — e quem quiser o efeito desliga um campo.
 */
const DEFAULT_FLIP: FlipDraft = {
  axis: "horizontal",
  pivot: "anchor",
  groupMode: "each",
  preserveTextReadability: true
};

type NullPlacement = "compCenter" | "averageAnchor" | "selectionBounds";

interface CreateNullDraft {
  placement: NullPlacement;
  dimension: "2d" | "3d";
  parentSelected: boolean;
  preserveWorldTransform: boolean;
  size: number;
  /** Índice de rótulo do After Effects, 0 a 16 — não o nome da camada. */
  label: number;
}

/**
 * Centro da composição sem parentear é o caso que funciona com zero seleção, e
 * por isso é o padrão: abrir a ferramenta e clicar em Aplicar produz algo útil
 * mesmo com nada selecionado.
 */
const DEFAULT_CREATE_NULL: CreateNullDraft = {
  placement: "compCenter",
  dimension: "2d",
  parentSelected: false,
  preserveWorldTransform: true,
  size: 100,
  label: 0
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
type ToolId =
  | "loopOut"
  | "smooth"
  | "wiggle"
  | "flicker"
  | "textBox"
  | "parent"
  | "createNull"
  | "flip"
  | "rename"
  | "reverseOrder"
  | "cutKeys"
  | "delay"
  | "anchor";

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
  /**
   * Carga sob demanda ao abrir a ferramenta, e de novo pelo botão Atualizar.
   *
   * Existe porque `render` é síncrono e não fala com o host: uma ferramenta que
   * precisa de dados do projeto — a lista de camadas, por exemplo — não pode
   * buscá-los no meio do desenho. Ferramentas que não precisam simplesmente não
   * declaram o gancho, e o botão Atualizar não aparece para elas.
   */
  load?(): Promise<void>;
  /**
   * Rótulo do botão de recarga. Existe porque `load` serve a duas coisas
   * diferentes: o Parentesco relê a lista de camadas, e as ferramentas com
   * prévia recalculam a prévia. Um rótulo só para os dois mentia em quatro
   * das cinco ferramentas.
   */
  loadLabelKey?: MessageKey;
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
    id: "rename",
    nameKey: "tool.rename.name",
    descriptionKey: "tool.rename.description",
    render: renderRename,
    disabledReason: renameDisabledReason,
    apply: applyRename,
    load: refreshRenamePreview,
    reset: () => {
      state.rename = { ...DEFAULT_RENAME };
      state.renamePreview = null;
      state.previewError = null;
    }
  },
  {
    id: "reverseOrder",
    nameKey: "tool.reverseOrder.name",
    descriptionKey: "tool.reverseOrder.description",
    render: renderReverseOrder,
    disabledReason: reverseOrderDisabledReason,
    apply: applyReverseOrder,
    load: refreshReversePreview,
    reset: () => {
      state.reverseOrder = { ...DEFAULT_REVERSE_ORDER };
      state.reversePreview = null;
      state.previewError = null;
    }
  },
  {
    id: "anchor",
    nameKey: "tool.anchor.name",
    descriptionKey: "tool.anchor.description",
    render: renderAnchor,
    disabledReason: anchorDisabledReason,
    apply: applyAnchor,
    load: refreshAnchorPreview,
    reset: () => {
      state.anchor = { ...DEFAULT_ANCHOR };
      state.anchorPreview = null;
      state.previewError = null;
    }
  },
  {
    id: "cutKeys",
    nameKey: "tool.cutKeys.name",
    descriptionKey: "tool.cutKeys.description",
    render: renderCutKeys,
    disabledReason: cutKeysDisabledReason,
    apply: applyCutKeys,
    load: refreshCutKeysPreview,
    reset: () => {
      state.cutKeys = { ...DEFAULT_CUT_KEYS };
      state.cutKeysPreview = null;
      state.previewError = null;
    }
  },
  {
    id: "delay",
    nameKey: "tool.delay.name",
    descriptionKey: "tool.delay.description",
    render: renderDelay,
    disabledReason: delayDisabledReason,
    apply: applyDelay,
    load: refreshDelayPreview,
    reset: () => {
      state.delay = { ...DEFAULT_DELAY };
      state.delayPreview = null;
      state.previewError = null;
    }
  },
  {
    id: "flip",
    nameKey: "tool.flip.name",
    descriptionKey: "tool.flip.description",
    render: renderFlip,
    disabledReason: flipDisabledReason,
    apply: applyFlip,
    reset: () => {
      state.flip = { ...DEFAULT_FLIP };
    }
  },
  {
    id: "createNull",
    nameKey: "tool.createNull.name",
    descriptionKey: "tool.createNull.description",
    render: renderCreateNull,
    disabledReason: createNullDisabledReason,
    apply: applyCreateNull,
    reset: () => {
      state.createNull = { ...DEFAULT_CREATE_NULL };
    }
  },
  {
    id: "parent",
    nameKey: "tool.parent.name",
    descriptionKey: "tool.parent.description",
    render: renderParent,
    disabledReason: parentDisabledReason,
    apply: applyParent,
    load: loadLayers,
    loadLabelKey: "action.refreshLayers",
    reset: () => {
      state.parent = { ...DEFAULT_PARENT };
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
  parent: ParentDraft;
  createNull: CreateNullDraft;
  flip: FlipDraft;
  rename: RenameDraft;
  reverseOrder: ReverseOrderDraft;
  cutKeys: CutKeysDraft;
  delay: DelayDraft;
  anchor: AnchorDraft;
  /** Prévias em cache; `null` enquanto a primeira não voltou. */
  renamePreview: RenamePreviewData | null;
  reversePreview: ReversePreviewData | null;
  cutKeysPreview: CutKeysPreviewData | null;
  delayPreview: DelayPreviewData | null;
  anchorPreview: AnchorPreviewData | null;
  /** Motivo da última prévia recusada, mostrado dentro da view. */
  previewError: string | null;
  /** Cache da lista de camadas; `null` enquanto nunca foi lida. */
  layers: LayerSummary[] | null;
  layersTotal: number;
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
  parent: { ...DEFAULT_PARENT },
  createNull: { ...DEFAULT_CREATE_NULL },
  flip: { ...DEFAULT_FLIP },
  rename: { ...DEFAULT_RENAME },
  reverseOrder: { ...DEFAULT_REVERSE_ORDER },
  cutKeys: { ...DEFAULT_CUT_KEYS },
  delay: { ...DEFAULT_DELAY },
  anchor: { ...DEFAULT_ANCHOR },
  renamePreview: null,
  reversePreview: null,
  cutKeysPreview: null,
  delayPreview: null,
  anchorPreview: null,
  previewError: null,
  layers: null,
  layersTotal: 0,
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
  // Sempre a fiação deste render: os handlers de campo disparam trabalho
  // assíncrono e precisam do cliente que `render` não recebe.
  wiringAtual = { shell, i18n, logger, client };

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
                // Depois do rerender: a ferramenta já está desenhada quando a
                // carga começa, então o estado ocupado aparece no lugar certo.
                void item.load?.();
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
    // Só ferramentas que leem dados do projeto ganham Atualizar. Um botão que
    // não faz nada nas outras cinco seria pior que a ausência dele.
    if (tool.load) {
      regions.actions.appendChild(
        button(document, {
          label: i18n.t(tool.loadLabelKey ?? "action.refreshPreview"),
          ...(state.busy
            ? { disabled: true as const, disabledReason: state.busyReason ?? i18n.t("status.initializing") }
            : { disabled: false as const }),
          title: state.busy
            ? state.busyReason ?? i18n.t("status.initializing")
            : i18n.t(tool.loadLabelKey ?? "action.refreshPreview"),
          onClick: () => void tool.load?.()
        })
      );
    }
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
/**
 * Texto local para uma falha de host.
 *
 * Separado de `reportFailure` porque a prévia precisa do texto sem mexer no
 * status do painel: uma regra recusada na prévia é informação dentro da view, e
 * não um erro da última ação.
 */
function describeFailure(i18n: I18n, response: CommandResponse): string {
  const error = response.error;
  if (!error) return i18n.t("message.failureWithoutReason");

  const action = error.action
    ? i18n.has(error.action)
      ? i18n.t(error.action as Parameters<I18n["t"]>[0])
      : error.action
    : null;
  const localizedMessage = i18n.t(error.recoverable ? "status.notCompleted" : "status.failed");
  const failure = i18n.t("error.withCode", { code: error.code, message: localizedMessage });
  return action ? `${failure} — ${action}` : failure;
}

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

interface LayerListResultData {
  layers: LayerSummary[];
  totalCount: number;
  truncated: boolean;
}

function isLayerSummary(value: unknown): value is LayerSummary {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    Number.isInteger(record.index) &&
    (record.index as number) >= 1 &&
    typeof record.name === "string" &&
    typeof record.type === "string" &&
    (record.parentIndex === null || Number.isInteger(record.parentIndex)) &&
    typeof record.selected === "boolean"
  );
}

function isLayerListResultData(value: unknown): value is LayerListResultData {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    Array.isArray(record.layers) &&
    record.layers.every(isLayerSummary) &&
    Number.isInteger(record.totalCount) &&
    typeof record.truncated === "boolean"
  );
}

/**
 * Lê a lista de camadas para o seletor de alvo.
 *
 * Falha aqui não bloqueia a ferramenta: o painel continua utilizável para
 * desparentear, que não precisa de alvo. Deixar a ferramenta inteira inacessível
 * porque uma leitura falhou seria pior que a leitura ausente.
 */
async function loadLayers(): Promise<void> {
  const fiacao = wiringAtual;
  if (!fiacao || state.busy) return;
  const { shell, i18n, logger, client } = fiacao;
  setBusy(shell, true, i18n.t("status.loadingLayers"));

  const response = await client.execute<LayerListResultData>("ae.layer.list", {});
  logger.recordResponse("ae.layer.list", response);

  if (!response.ok || !isLayerListResultData(response.data)) {
    state.layers = null;
    state.layersTotal = 0;
    if (!response.ok) {
      reportFailure(shell, i18n, response);
    } else {
      logger.error("Resposta de lista de camadas invalida.", {
        command: "ae.layer.list",
        errorCode: "INVALID_HOST_RESPONSE",
        result: "failure"
      });
    }
    setBusy(shell, false);
    return;
  }

  state.layers = response.data.layers;
  state.layersTotal = response.data.totalCount;

  // O alvo guardado pode ter sumido ou trocado de nome desde a última leitura.
  // Mantê-lo apontando para um índice que virou outra camada é exatamente o erro
  // silencioso que a soma de verificação do host existe para pegar.
  const alvo = state.parent.targetLayerIndex;
  if (alvo !== 0) {
    const ainda = state.layers.find(
      (camada) => camada.index === alvo && camada.name === state.parent.targetLayerName
    );
    if (!ainda) {
      state.parent.targetLayerIndex = 0;
      state.parent.targetLayerName = "";
    }
  }

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

interface RenamePreviewItem {
  index: number;
  before: string;
  after: string;
}

interface RenamePreviewData {
  totalCount: number;
  changedCount: number;
  sourceChangedCount: number;
  items: RenamePreviewItem[];
}

/**
 * Uma posição na pilha, antes ou depois da inversão.
 *
 * O host devolve o registro inteiro — índice, índice original, nome e tempo — e
 * não só o nome. Eu havia tipado como `string[]`, e a prévia teria sido
 * rejeitada em silêncio pelo guarda a cada abertura da ferramenta: a lista
 * ficaria eternamente em "calculando". Só a execução em host mostrou isso.
 */
interface ReverseOrderEntry {
  index: number;
  originalIndex: number;
  name: string;
  startTime: number;
}

interface ReversePreviewData {
  targetCount: number;
  timingChangedCount: number;
  before: ReverseOrderEntry[];
  after: ReverseOrderEntry[];
}

function isRenamePreviewData(value: unknown): value is RenamePreviewData {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    Number.isInteger(record.totalCount) &&
    Number.isInteger(record.changedCount) &&
    Number.isInteger(record.sourceChangedCount) &&
    Array.isArray(record.items) &&
    record.items.every((item) => {
      if (typeof item !== "object" || item === null) return false;
      const entry = item as Record<string, unknown>;
      return (
        Number.isInteger(entry.index) &&
        typeof entry.before === "string" &&
        typeof entry.after === "string"
      );
    })
  );
}

function isReversePreviewData(value: unknown): value is ReversePreviewData {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  const entradas = (list: unknown): boolean =>
    Array.isArray(list) &&
    list.every((item) => {
      if (typeof item !== "object" || item === null) return false;
      const entrada = item as Record<string, unknown>;
      return (
        Number.isInteger(entrada.index) &&
        Number.isInteger(entrada.originalIndex) &&
        typeof entrada.name === "string" &&
        typeof entrada.startTime === "number"
      );
    });
  return (
    Number.isInteger(record.targetCount) &&
    Number.isInteger(record.timingChangedCount) &&
    entradas(record.before) &&
    entradas(record.after)
  );
}

/**
 * Teto de linhas desenhadas numa prévia.
 *
 * Uma composição com centenas de camadas produziria centenas de nós a cada
 * confirmação de campo, e a lista é para conferir a regra — não para ler o
 * projeto inteiro. O rodapé diz quantas ficaram de fora.
 */
const PREVIEW_MAX_ROWS = 40;

interface FiacaoCorrente {
  shell: Shell;
  i18n: I18n;
  logger: MotionLogger;
  client: Client;
}

/**
 * Fiação corrente, preenchida a cada render.
 *
 * `render` é síncrono e não recebe o cliente, mas os campos precisam pedir uma
 * prévia nova ao host a cada confirmação. Guardar a fiação aqui é o que liga as
 * duas coisas sem espalhar o cliente por dentro de cada componente.
 */
let wiringAtual: FiacaoCorrente | null = null;

/**
 * Descarta respostas de prévia que chegam fora de ordem.
 *
 * Os campos confirmam rápido, e uma prévia pedida antes pode voltar depois. Sem
 * este contador, a lista mostraria o resultado de uma regra que a pessoa já
 * trocou — e ela aplicaria confiando no que está vendo.
 */
let previewSequence = 0;

async function refreshRenamePreview(): Promise<void> {
  const fiacao = wiringAtual;
  if (!fiacao) return;

  const sequencia = previewSequence + 1;
  previewSequence = sequencia;

  const draft = state.rename;
  const response = await fiacao.client.execute<RenamePreviewData>("ae.layer.rename.preview", {
    scope: draft.scope,
    prefix: draft.prefix,
    suffix: draft.suffix,
    find: draft.find,
    replace: draft.replace,
    regex: draft.regex,
    counterStart: draft.counterStart,
    padding: draft.padding,
    sourceName: draft.sourceName,
    preview: true
  });

  if (sequencia !== previewSequence) return;

  state.renamePreview = response.ok && isRenamePreviewData(response.data) ? response.data : null;
  // A prévia recusada é informação, não falha do painel: uma regex perigosa
  // recusada aqui é exatamente o guarda funcionando, e a pessoa precisa ver o
  // motivo antes de clicar em Aplicar.
  state.previewError = response.ok ? null : describeFailure(fiacao.i18n, response);
  fiacao.shell.rerender();
}

async function refreshReversePreview(): Promise<void> {
  const fiacao = wiringAtual;
  if (!fiacao) return;

  const sequencia = previewSequence + 1;
  previewSequence = sequencia;

  const draft = state.reverseOrder;
  const response = await fiacao.client.execute<ReversePreviewData>(
    "ae.layer.reverse-order.preview",
    {
      scope: draft.scope,
      preserveTrackMattes: draft.preserveTrackMattes,
      preserveParents: draft.preserveParents,
      reverseTimingToo: draft.reverseTimingToo
    }
  );

  if (sequencia !== previewSequence) return;

  state.reversePreview = response.ok && isReversePreviewData(response.data) ? response.data : null;
  state.previewError = response.ok ? null : describeFailure(fiacao.i18n, response);
  fiacao.shell.rerender();
}

/** Desenha a lista de prévia com teto de linhas e rodapé de contagem. */
function renderPreviewRows(
  regions: RenderRegions,
  i18n: I18n,
  linhas: readonly { antes: string; depois: string }[],
  total: number
): void {
  if (linhas.length === 0) {
    regions.content.appendChild(hint(document, i18n.t("message.previewEmpty")));
    return;
  }

  for (const linha of linhas.slice(0, PREVIEW_MAX_ROWS)) {
    regions.content.appendChild(propertyRow(document, linha.antes, linha.depois));
  }
  if (total > PREVIEW_MAX_ROWS) {
    regions.content.appendChild(
      hint(document, i18n.t("message.previewMore", { count: total - PREVIEW_MAX_ROWS }))
    );
  }
}

interface AnchorPreviewData {
  targetCount: number;
  changedCount: number;
  targets: Array<{
    layerName: string;
    gridPoint: string;
    anchorBefore: number[];
    anchorAfter: number[];
    changed: boolean;
  }>;
}

function isAnchorPreviewData(value: unknown): value is AnchorPreviewData {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  const par = (v: unknown): boolean =>
    Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === "number");
  return (
    Number.isInteger(record.targetCount) &&
    Number.isInteger(record.changedCount) &&
    Array.isArray(record.targets) &&
    record.targets.every((item) => {
      if (typeof item !== "object" || item === null) return false;
      const alvo = item as Record<string, unknown>;
      return (
        typeof alvo.layerName === "string" &&
        typeof alvo.gridPoint === "string" &&
        par(alvo.anchorBefore) &&
        par(alvo.anchorAfter) &&
        typeof alvo.changed === "boolean"
      );
    })
  );
}

function anchorArgs(draft: AnchorDraft, preview: boolean): Record<string, unknown> {
  return {
    gridPoint: draft.gridPoint,
    mode: draft.mode,
    boundsSource: "visual",
    timeMode: draft.timeMode,
    // Campo inativo é canônico: o host recusa um tempo fixo fora do modo em vez
    // de ignorá-lo, então o painel precisa mandar exatamente zero.
    fixedTime: draft.timeMode === "fixed" ? draft.fixedTime : 0,
    includeExtents: draft.includeExtents,
    preserveVisualPosition: draft.preserveVisualPosition,
    randomSeed: draft.randomSeed,
    preview
  };
}

async function refreshAnchorPreview(): Promise<void> {
  const fiacao = wiringAtual;
  if (!fiacao) return;

  const sequencia = previewSequence + 1;
  previewSequence = sequencia;

  const response = await fiacao.client.execute<AnchorPreviewData>(
    "ae.anchor.align.preview",
    anchorArgs(state.anchor, true)
  );
  if (sequencia !== previewSequence) return;

  state.anchorPreview = response.ok && isAnchorPreviewData(response.data) ? response.data : null;
  state.previewError = response.ok ? null : describeFailure(fiacao.i18n, response);
  fiacao.shell.rerender();
}

function renderAnchor(regions: RenderRegions, i18n: I18n): void {
  const shell = regions.shell;
  const draft = state.anchor;
  const confirma = (mutacao: () => void) => {
    mutacao();
    shell.rerender();
    void refreshAnchorPreview();
  };

  regions.content.appendChild(notice(document, i18n.t("message.anchorInstructions")));
  if (state.context && !state.context.isComposition) {
    regions.content.appendChild(notice(document, i18n.t("message.anchorNoActiveComp"), "warning"));
  }

  regions.content.appendChild(sectionTitle(document, i18n.t("anchor.section.point")));

  // A §14.2 pede grade 3×3. Um select de nove itens diria a mesma coisa, mas
  // esconderia a geometria: a grade é a informação, e ler "superior esquerdo"
  // numa lista custa mais que ver o canto.
  regions.content.appendChild(
    anchorGrid(document, {
      value: draft.gridPoint,
      disabled: state.busy,
      labels: ANCHOR_GRID.map(({ ponto, rotulo }) => ({ value: ponto, label: i18n.t(rotulo) })),
      onSelect: (ponto) =>
        confirma(() => {
          state.anchor.gridPoint = ponto as AnchorGridPoint;
        })
    })
  );

  regions.content.appendChild(
    selectField(document, {
      id: "anchor-mode",
      label: i18n.t("anchor.mode"),
      value: draft.mode,
      disabled: state.busy,
      options: [
        { value: "normal", label: i18n.t("anchor.mode.normal") },
        { value: "reverse", label: i18n.t("anchor.mode.reverse") },
        { value: "random", label: i18n.t("anchor.mode.random") }
      ],
      onChange: (value) =>
        confirma(() => {
          state.anchor.mode =
            value === "reverse" || value === "random" ? value : "normal";
        })
    })
  );

  if (draft.mode === "random") {
    regions.content.appendChild(
      numberField(document, {
        id: "anchor-seed",
        label: i18n.t("anchor.randomSeed"),
        value: draft.randomSeed,
        min: 0,
        max: 2_147_483_647,
        step: 1,
        disabled: state.busy,
        onCommit: (value) =>
          confirma(() => {
            state.anchor.randomSeed = value;
          })
      })
    );
  }

  regions.content.appendChild(sectionTitle(document, i18n.t("anchor.section.options")));

  regions.content.appendChild(
    selectField(document, {
      id: "anchor-time-mode",
      label: i18n.t("anchor.timeMode"),
      value: draft.timeMode,
      disabled: state.busy,
      options: [
        { value: "currentTime", label: i18n.t("anchor.timeMode.currentTime") },
        { value: "fixed", label: i18n.t("anchor.timeMode.fixed") }
      ],
      onChange: (value) =>
        confirma(() => {
          state.anchor.timeMode = value === "fixed" ? "fixed" : "currentTime";
        })
    })
  );

  if (draft.timeMode === "fixed") {
    regions.content.appendChild(
      numberField(document, {
        id: "anchor-fixed-time",
        label: i18n.t("anchor.fixedTime"),
        value: draft.fixedTime,
        min: 0,
        max: 10_800,
        step: 0.1,
        unit: i18n.t("cutKeys.unit.seconds"),
        disabled: state.busy,
        onCommit: (value) =>
          confirma(() => {
            state.anchor.fixedTime = value;
          })
      })
    );
  }

  regions.content.appendChild(
    checkboxField(document, {
      id: "anchor-extents",
      label: i18n.t("anchor.includeExtents"),
      description: i18n.t("anchor.includeExtents.description"),
      checked: draft.includeExtents,
      disabled: state.busy,
      onChange: (checked) =>
        confirma(() => {
          state.anchor.includeExtents = checked;
        })
    })
  );

  regions.content.appendChild(
    checkboxField(document, {
      id: "anchor-preserve",
      label: i18n.t("anchor.preserveVisualPosition"),
      description: i18n.t("anchor.preserveVisualPosition.description"),
      checked: draft.preserveVisualPosition,
      disabled: state.busy,
      onChange: (checked) =>
        confirma(() => {
          state.anchor.preserveVisualPosition = checked;
        })
    })
  );

  regions.content.appendChild(sectionTitle(document, i18n.t("anchor.section.preview")));

  if (state.previewError) {
    regions.content.appendChild(notice(document, state.previewError, "warning"));
    return;
  }
  const previa = state.anchorPreview;
  if (!previa) {
    regions.content.appendChild(hint(document, i18n.t("status.previewing")));
    return;
  }

  const arredonda = (n: number): string => String(Math.round(n * 100) / 100);
  renderPreviewRows(
    regions,
    i18n,
    previa.targets.map((alvo) => ({
      antes: alvo.layerName,
      depois: `${arredonda(alvo.anchorAfter[0] ?? 0)}, ${arredonda(alvo.anchorAfter[1] ?? 0)}`
    })),
    previa.targetCount
  );
  regions.content.appendChild(
    hint(
      document,
      i18n.t("message.previewChanged", {
        changed: previa.changedCount,
        total: previa.targetCount
      })
    )
  );
}

function anchorDisabledReason(i18n: I18n): string | null {
  if (state.busy) {
    return state.busyReason ?? i18n.t("status.initializing");
  }
  if (!state.context?.isComposition) {
    return i18n.t("message.anchorNoActiveComp");
  }
  if (state.previewError) {
    return state.previewError;
  }
  if (state.anchorPreview && state.anchorPreview.changedCount === 0) {
    return i18n.t("message.anchorNothing");
  }
  return null;
}

async function applyAnchor(
  shell: Shell,
  i18n: I18n,
  logger: MotionLogger,
  client: Client
): Promise<void> {
  if (state.busy) return;

  if (!state.context?.isComposition) {
    state.lastError = i18n.t("message.anchorNoActiveComp");
    shell.setStatus(i18n.t("status.notCompleted"), "error");
    shell.rerender();
    return;
  }

  shell.setStatus(i18n.t("status.applyingAnchor"), "busy");
  setBusy(shell, true, i18n.t("status.applyingAnchor"));

  const response = await client.execute<AnchorPreviewData>(
    "ae.anchor.align",
    anchorArgs(state.anchor, false),
    { preserveSelection: true }
  );
  logger.recordResponse("ae.anchor.align", response);

  if (!response.ok) {
    reportFailure(shell, i18n, response);
    setBusy(shell, false);
    return;
  }

  state.lastError = null;
  const alinhadas = isAnchorPreviewData(response.data) ? response.data.changedCount : 0;
  shell.setStatus(i18n.t("message.anchorApplied", { count: alinhadas }), "ok");
  setBusy(shell, false);

  await refreshAnchorPreview();
}

interface CutKeysPreviewData {
  totalCount: number;
  propertyCount: number;
  properties: Array<{ layerName: string; propertyName: string; keyCount: number }>;
}

interface DelayPreviewData {
  targetCount: number;
  targets: Array<{ name: string; offsetFrames: number }>;
}

function isCutKeysPreviewData(value: unknown): value is CutKeysPreviewData {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    Number.isInteger(record.totalCount) &&
    Number.isInteger(record.propertyCount) &&
    Array.isArray(record.properties) &&
    record.properties.every((item) => {
      if (typeof item !== "object" || item === null) return false;
      const entrada = item as Record<string, unknown>;
      return (
        typeof entrada.layerName === "string" &&
        typeof entrada.propertyName === "string" &&
        Number.isInteger(entrada.keyCount)
      );
    })
  );
}

function isDelayPreviewData(value: unknown): value is DelayPreviewData {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    Number.isInteger(record.targetCount) &&
    Array.isArray(record.targets) &&
    record.targets.every((item) => {
      if (typeof item !== "object" || item === null) return false;
      const entrada = item as Record<string, unknown>;
      return typeof entrada.name === "string" && Number.isFinite(entrada.offsetFrames);
    })
  );
}

/** Argumentos do CutKeys, com os tempos canônicos que o host exige. */
function cutKeysArgs(draft: CutKeysDraft, previewOnly: boolean): Record<string, unknown> {
  const entreTempos = draft.rangeMode === "betweenMarkers";
  return {
    rangeMode: draft.rangeMode,
    startTime: entreTempos ? draft.startTime : 0,
    endTime: entreTempos ? draft.endTime : 0,
    includeBoundary: draft.includeBoundary,
    previewOnly
  };
}

function delayArgs(draft: DelayDraft): Record<string, unknown> {
  return {
    delayFrames: draft.delayFrames,
    order: draft.order,
    reverse: draft.reverse,
    randomSeed: draft.randomSeed,
    spatialOrigin: [draft.originX, draft.originY],
    shiftMode: draft.shiftMode
  };
}

async function refreshCutKeysPreview(): Promise<void> {
  const fiacao = wiringAtual;
  if (!fiacao) return;

  const sequencia = previewSequence + 1;
  previewSequence = sequencia;

  const response = await fiacao.client.execute<CutKeysPreviewData>(
    "ae.keys.cut.preview",
    cutKeysArgs(state.cutKeys, true)
  );
  if (sequencia !== previewSequence) return;

  state.cutKeysPreview = response.ok && isCutKeysPreviewData(response.data) ? response.data : null;
  state.previewError = response.ok ? null : describeFailure(fiacao.i18n, response);
  fiacao.shell.rerender();
}

async function refreshDelayPreview(): Promise<void> {
  const fiacao = wiringAtual;
  if (!fiacao) return;

  const sequencia = previewSequence + 1;
  previewSequence = sequencia;

  const response = await fiacao.client.execute<DelayPreviewData>(
    "ae.keys.delay.preview",
    delayArgs(state.delay)
  );
  if (sequencia !== previewSequence) return;

  state.delayPreview = response.ok && isDelayPreviewData(response.data) ? response.data : null;
  state.previewError = response.ok ? null : describeFailure(fiacao.i18n, response);
  fiacao.shell.rerender();
}

function renderCutKeys(regions: RenderRegions, i18n: I18n): void {
  const shell = regions.shell;
  const draft = state.cutKeys;
  const confirma = (mutacao: () => void) => {
    mutacao();
    shell.rerender();
    void refreshCutKeysPreview();
  };

  regions.content.appendChild(notice(document, i18n.t("message.cutKeysInstructions")));
  if (state.context && !state.context.isComposition) {
    regions.content.appendChild(notice(document, i18n.t("message.cutKeysNoActiveComp"), "warning"));
  }

  regions.content.appendChild(sectionTitle(document, i18n.t("cutKeys.section.range")));

  regions.content.appendChild(
    selectField(document, {
      id: "cutkeys-range",
      label: i18n.t("cutKeys.rangeMode"),
      value: draft.rangeMode,
      disabled: state.busy,
      options: [
        { value: "beforeCti", label: i18n.t("cutKeys.rangeMode.beforeCti") },
        { value: "afterCti", label: i18n.t("cutKeys.rangeMode.afterCti") },
        { value: "insideWorkArea", label: i18n.t("cutKeys.rangeMode.insideWorkArea") },
        { value: "outsideWorkArea", label: i18n.t("cutKeys.rangeMode.outsideWorkArea") },
        { value: "betweenMarkers", label: i18n.t("cutKeys.rangeMode.betweenMarkers") }
      ],
      onChange: (value) =>
        confirma(() => {
          state.cutKeys.rangeMode = value as CutRangeMode;
        })
    })
  );

  // De/Até só existem no modo que os usa. O host recusa valores fora do modo,
  // então mostrá-los sempre convidaria a preencher algo que seria rejeitado.
  if (draft.rangeMode === "betweenMarkers") {
    const tempos: ReadonlyArray<{ campo: "startTime" | "endTime"; rotulo: MessageKey }> = [
      { campo: "startTime", rotulo: "cutKeys.startTime" },
      { campo: "endTime", rotulo: "cutKeys.endTime" }
    ];
    for (const { campo, rotulo } of tempos) {
      regions.content.appendChild(
        numberField(document, {
          id: `cutkeys-${campo}`,
          label: i18n.t(rotulo),
          value: draft[campo],
          min: -10_800,
          max: 10_800,
          step: 0.1,
          unit: i18n.t("cutKeys.unit.seconds"),
          disabled: state.busy,
          onCommit: (value) =>
            confirma(() => {
              state.cutKeys[campo] = value;
            })
        })
      );
    }
  }

  regions.content.appendChild(
    checkboxField(document, {
      id: "cutkeys-boundary",
      label: i18n.t("cutKeys.includeBoundary"),
      description: i18n.t("cutKeys.includeBoundary.description"),
      checked: draft.includeBoundary,
      disabled: state.busy,
      onChange: (checked) =>
        confirma(() => {
          state.cutKeys.includeBoundary = checked;
        })
    })
  );

  regions.content.appendChild(sectionTitle(document, i18n.t("cutKeys.section.preview")));

  if (state.previewError) {
    regions.content.appendChild(notice(document, state.previewError, "warning"));
    return;
  }
  const previa = state.cutKeysPreview;
  if (!previa) {
    regions.content.appendChild(hint(document, i18n.t("status.previewing")));
    return;
  }

  renderPreviewRows(
    regions,
    i18n,
    previa.properties.map((item) => ({
      antes: `${item.layerName} › ${item.propertyName}`,
      depois: String(item.keyCount)
    })),
    previa.propertyCount
  );
  regions.content.appendChild(
    hint(
      document,
      previa.totalCount === 0
        ? i18n.t("message.cutKeysNothing")
        // Prévia fala no futuro. Reaproveitar a mensagem de sucesso aqui
        // dizia que os keyframes já tinham saído, antes de qualquer clique.
        : i18n.t("message.cutKeysWillRemove", { count: previa.totalCount })
    )
  );
}

function cutKeysDisabledReason(i18n: I18n): string | null {
  if (state.busy) {
    return state.busyReason ?? i18n.t("status.initializing");
  }
  if (!state.context?.isComposition) {
    return i18n.t("message.cutKeysNoActiveComp");
  }
  if (state.previewError) {
    return state.previewError;
  }
  if (state.cutKeysPreview && state.cutKeysPreview.totalCount === 0) {
    return i18n.t("message.cutKeysNothing");
  }
  return null;
}

async function applyCutKeys(
  shell: Shell,
  i18n: I18n,
  logger: MotionLogger,
  client: Client
): Promise<void> {
  if (state.busy) return;

  if (!state.context?.isComposition) {
    state.lastError = i18n.t("message.cutKeysNoActiveComp");
    shell.setStatus(i18n.t("status.notCompleted"), "error");
    shell.rerender();
    return;
  }

  shell.setStatus(i18n.t("status.applyingCutKeys"), "busy");
  setBusy(shell, true, i18n.t("status.applyingCutKeys"));

  const response = await client.execute<CutKeysPreviewData>(
    "ae.keys.cut",
    cutKeysArgs(state.cutKeys, false),
    { preserveSelection: true }
  );
  logger.recordResponse("ae.keys.cut", response);

  if (!response.ok) {
    reportFailure(shell, i18n, response);
    setBusy(shell, false);
    return;
  }

  state.lastError = null;
  const removidos = isCutKeysPreviewData(response.data) ? response.data.totalCount : 0;
  shell.setStatus(i18n.t("message.cutKeysApplied", { count: removidos }), "ok");
  setBusy(shell, false);

  await refreshCutKeysPreview();
}

function renderDelay(regions: RenderRegions, i18n: I18n): void {
  const shell = regions.shell;
  const draft = state.delay;
  const confirma = (mutacao: () => void) => {
    mutacao();
    shell.rerender();
    void refreshDelayPreview();
  };

  regions.content.appendChild(notice(document, i18n.t("message.delayInstructions")));
  if (state.context && !state.context.isComposition) {
    regions.content.appendChild(notice(document, i18n.t("message.delayNoActiveComp"), "warning"));
  }

  regions.content.appendChild(sectionTitle(document, i18n.t("delay.section.amount")));

  regions.content.appendChild(
    numberField(document, {
      id: "delay-frames",
      label: i18n.t("delay.delayFrames"),
      value: draft.delayFrames,
      min: -100_000,
      max: 100_000,
      step: 1,
      unit: i18n.t("delay.unit.frames"),
      disabled: state.busy,
      onCommit: (value) =>
        confirma(() => {
          state.delay.delayFrames = value;
        })
    })
  );

  regions.content.appendChild(
    selectField(document, {
      id: "delay-shift-mode",
      label: i18n.t("delay.shiftMode"),
      value: draft.shiftMode,
      disabled: state.busy,
      options: [
        { value: "layerStart", label: i18n.t("delay.shiftMode.layerStart") },
        { value: "keyframes", label: i18n.t("delay.shiftMode.keyframes") }
      ],
      onChange: (value) =>
        confirma(() => {
          state.delay.shiftMode = value === "keyframes" ? "keyframes" : "layerStart";
        })
    })
  );

  regions.content.appendChild(sectionTitle(document, i18n.t("delay.section.order")));

  regions.content.appendChild(
    selectField(document, {
      id: "delay-order",
      label: i18n.t("delay.order"),
      value: draft.order,
      disabled: state.busy,
      options: [
        { value: "timeline", label: i18n.t("delay.order.timeline") },
        { value: "selection", label: i18n.t("delay.order.selection") },
        { value: "name", label: i18n.t("delay.order.name") },
        { value: "distance", label: i18n.t("delay.order.distance") },
        { value: "random", label: i18n.t("delay.order.random") }
      ],
      onChange: (value) =>
        confirma(() => {
          state.delay.order = value as DelayOrder;
        })
    })
  );

  // Semente e origem só aparecem no critério que as usa.
  if (draft.order === "random") {
    regions.content.appendChild(
      numberField(document, {
        id: "delay-seed",
        label: i18n.t("delay.randomSeed"),
        value: draft.randomSeed,
        min: 0,
        max: 2_147_483_647,
        step: 1,
        disabled: state.busy,
        onCommit: (value) =>
          confirma(() => {
            state.delay.randomSeed = value;
          })
      })
    );
  }
  if (draft.order === "distance") {
    const origens: ReadonlyArray<{ campo: "originX" | "originY"; rotulo: MessageKey }> = [
      { campo: "originX", rotulo: "delay.originX" },
      { campo: "originY", rotulo: "delay.originY" }
    ];
    for (const { campo, rotulo } of origens) {
      regions.content.appendChild(
        numberField(document, {
          id: `delay-${campo}`,
          label: i18n.t(rotulo),
          value: draft[campo],
          min: -100_000,
          max: 100_000,
          step: 10,
          disabled: state.busy,
          onCommit: (value) =>
            confirma(() => {
              state.delay[campo] = value;
            })
        })
      );
    }
  }

  regions.content.appendChild(
    checkboxField(document, {
      id: "delay-reverse",
      label: i18n.t("delay.reverse"),
      checked: draft.reverse,
      disabled: state.busy,
      onChange: (checked) =>
        confirma(() => {
          state.delay.reverse = checked;
        })
    })
  );

  regions.content.appendChild(sectionTitle(document, i18n.t("delay.section.preview")));

  if (state.previewError) {
    regions.content.appendChild(notice(document, state.previewError, "warning"));
    return;
  }
  const previa = state.delayPreview;
  if (!previa) {
    regions.content.appendChild(hint(document, i18n.t("status.previewing")));
    return;
  }

  renderPreviewRows(
    regions,
    i18n,
    previa.targets.map((alvo) => ({
      antes: alvo.name,
      depois: `${alvo.offsetFrames >= 0 ? "+" : ""}${alvo.offsetFrames} ${i18n.t("delay.unit.frames")}`
    })),
    previa.targetCount
  );
}

function delayDisabledReason(i18n: I18n): string | null {
  if (state.busy) {
    return state.busyReason ?? i18n.t("status.initializing");
  }
  if (!state.context?.isComposition) {
    return i18n.t("message.delayNoActiveComp");
  }
  return state.previewError;
}

async function applyDelay(
  shell: Shell,
  i18n: I18n,
  logger: MotionLogger,
  client: Client
): Promise<void> {
  if (state.busy) return;

  if (!state.context?.isComposition) {
    state.lastError = i18n.t("message.delayNoActiveComp");
    shell.setStatus(i18n.t("status.notCompleted"), "error");
    shell.rerender();
    return;
  }

  shell.setStatus(i18n.t("status.applyingDelay"), "busy");
  setBusy(shell, true, i18n.t("status.applyingDelay"));

  const response = await client.execute<DelayPreviewData>("ae.keys.delay", delayArgs(state.delay), {
    preserveSelection: true
  });
  logger.recordResponse("ae.keys.delay", response);

  if (!response.ok) {
    reportFailure(shell, i18n, response);
    setBusy(shell, false);
    return;
  }

  state.lastError = null;
  const alvos = isDelayPreviewData(response.data) ? response.data.targetCount : 0;
  shell.setStatus(i18n.t("message.delayApplied", { count: alvos }), "ok");
  setBusy(shell, false);

  await refreshDelayPreview();
}

function renderRename(regions: RenderRegions, i18n: I18n): void {
  const shell = regions.shell;
  const draft = state.rename;
  const confirma = (mutacao: () => void) => {
    mutacao();
    shell.rerender();
    void refreshRenamePreview();
  };

  regions.content.appendChild(notice(document, i18n.t("message.renameInstructions")));
  if (state.context && !state.context.isComposition) {
    regions.content.appendChild(notice(document, i18n.t("message.renameNoActiveComp"), "warning"));
  }

  regions.content.appendChild(sectionTitle(document, i18n.t("rename.section.rules")));

  regions.content.appendChild(
    selectField(document, {
      id: "rename-scope",
      label: i18n.t("field.scope"),
      value: draft.scope,
      disabled: state.busy,
      options: [
        { value: "selected", label: i18n.t("scope.selected") },
        { value: "composition", label: i18n.t("scope.composition") }
      ],
      onChange: (value) =>
        confirma(() => {
          state.rename.scope = value === "composition" ? "composition" : "selected";
        })
    })
  );

  const textos: ReadonlyArray<{ campo: "find" | "replace" | "prefix" | "suffix"; rotulo: MessageKey }> = [
    { campo: "find", rotulo: "rename.find" },
    { campo: "replace", rotulo: "rename.replace" },
    { campo: "prefix", rotulo: "rename.prefix" },
    { campo: "suffix", rotulo: "rename.suffix" }
  ];
  for (const { campo, rotulo } of textos) {
    regions.content.appendChild(
      textField(document, {
        id: `rename-${campo}`,
        label: i18n.t(rotulo),
        value: draft[campo],
        maxLength: 256,
        disabled: state.busy,
        onCommit: (value) =>
          confirma(() => {
            state.rename[campo] = value;
          })
      })
    );
  }

  regions.content.appendChild(
    checkboxField(document, {
      id: "rename-regex",
      label: i18n.t("rename.regex"),
      description: i18n.t("rename.regex.description"),
      checked: draft.regex,
      disabled: state.busy,
      onChange: (checked) =>
        confirma(() => {
          state.rename.regex = checked;
        })
    })
  );

  regions.content.appendChild(sectionTitle(document, i18n.t("rename.section.counter")));

  regions.content.appendChild(
    numberField(document, {
      id: "rename-padding",
      label: i18n.t("rename.padding"),
      description: i18n.t("rename.padding.description"),
      value: draft.padding,
      min: 0,
      max: 8,
      step: 1,
      disabled: state.busy,
      onCommit: (value) =>
        confirma(() => {
          state.rename.padding = value;
        })
    })
  );

  // O início do contador só faz diferença com o contador ligado.
  if (draft.padding > 0) {
    regions.content.appendChild(
      numberField(document, {
        id: "rename-counter-start",
        label: i18n.t("rename.counterStart"),
        value: draft.counterStart,
        min: -9999,
        max: 9999,
        step: 1,
        disabled: state.busy,
        onCommit: (value) =>
          confirma(() => {
            state.rename.counterStart = value;
          })
      })
    );
  }

  regions.content.appendChild(
    checkboxField(document, {
      id: "rename-source",
      label: i18n.t("rename.sourceName"),
      description: i18n.t("rename.sourceName.description"),
      checked: draft.sourceName,
      disabled: state.busy,
      onChange: (checked) =>
        confirma(() => {
          state.rename.sourceName = checked;
        })
    })
  );

  regions.content.appendChild(sectionTitle(document, i18n.t("rename.section.preview")));

  if (state.previewError) {
    regions.content.appendChild(notice(document, state.previewError, "warning"));
    return;
  }

  const previa = state.renamePreview;
  if (!previa) {
    regions.content.appendChild(hint(document, i18n.t("status.previewing")));
    return;
  }

  renderPreviewRows(
    regions,
    i18n,
    previa.items.map((item) => ({ antes: item.before, depois: item.after })),
    previa.totalCount
  );
  regions.content.appendChild(
    hint(
      document,
      i18n.t("message.previewChanged", { changed: previa.changedCount, total: previa.totalCount })
    )
  );
}

function renameDisabledReason(i18n: I18n): string | null {
  if (state.busy) {
    return state.busyReason ?? i18n.t("status.initializing");
  }
  if (!state.context?.isComposition) {
    return i18n.t("message.renameNoActiveComp");
  }
  // O motivo da prévia é o motivo do apply: os dois comandos compartilham o
  // mesmo preflight, então uma regra recusada na prévia seria recusada aqui.
  if (state.previewError) {
    return state.previewError;
  }
  if (state.renamePreview && state.renamePreview.changedCount === 0) {
    return i18n.t("message.renameNothingToChange");
  }
  return null;
}

async function applyRename(
  shell: Shell,
  i18n: I18n,
  logger: MotionLogger,
  client: Client
): Promise<void> {
  if (state.busy) return;

  if (!state.context?.isComposition) {
    state.lastError = i18n.t("message.renameNoActiveComp");
    shell.setStatus(i18n.t("status.notCompleted"), "error");
    shell.rerender();
    return;
  }

  const draft = state.rename;
  shell.setStatus(i18n.t("status.applyingRename"), "busy");
  setBusy(shell, true, i18n.t("status.applyingRename"));

  const response = await client.execute<RenamePreviewData>(
    "ae.layer.rename",
    {
      scope: draft.scope,
      prefix: draft.prefix,
      suffix: draft.suffix,
      find: draft.find,
      replace: draft.replace,
      regex: draft.regex,
      counterStart: draft.counterStart,
      padding: draft.padding,
      sourceName: draft.sourceName,
      preview: false
    },
    { preserveSelection: true }
  );
  logger.recordResponse("ae.layer.rename", response);

  if (!response.ok) {
    reportFailure(shell, i18n, response);
    setBusy(shell, false);
    return;
  }

  state.lastError = null;
  const aplicadas = isRenameResultData(response.data) ? response.data.appliedCount : 0;
  shell.setStatus(i18n.t("message.renameApplied", { count: aplicadas }), "ok");
  setBusy(shell, false);

  // Os nomes mudaram: a prévia em cache descreve um estado que não existe mais.
  await refreshRenamePreview();
}

interface RenameResultData {
  appliedCount: number;
}

function isRenameResultData(value: unknown): value is RenameResultData {
  if (typeof value !== "object" || value === null) return false;
  return Number.isInteger((value as Record<string, unknown>).appliedCount);
}

function renderReverseOrder(regions: RenderRegions, i18n: I18n): void {
  const shell = regions.shell;
  const draft = state.reverseOrder;
  const confirma = (mutacao: () => void) => {
    mutacao();
    shell.rerender();
    void refreshReversePreview();
  };

  regions.content.appendChild(notice(document, i18n.t("message.reverseInstructions")));
  if (state.context && !state.context.isComposition) {
    regions.content.appendChild(notice(document, i18n.t("message.reverseNoActiveComp"), "warning"));
  }

  regions.content.appendChild(
    selectField(document, {
      id: "reverse-scope",
      label: i18n.t("field.scope"),
      value: draft.scope,
      disabled: state.busy,
      options: [
        { value: "selected", label: i18n.t("scope.selected") },
        { value: "composition", label: i18n.t("scope.composition") }
      ],
      onChange: (value) =>
        confirma(() => {
          state.reverseOrder.scope = value === "composition" ? "composition" : "selected";
        })
    })
  );

  regions.content.appendChild(sectionTitle(document, i18n.t("reverse.section.options")));

  regions.content.appendChild(
    checkboxField(document, {
      id: "reverse-mattes",
      label: i18n.t("reverse.preserveTrackMattes"),
      checked: draft.preserveTrackMattes,
      disabled: state.busy,
      onChange: (checked) =>
        confirma(() => {
          state.reverseOrder.preserveTrackMattes = checked;
        })
    })
  );

  regions.content.appendChild(
    checkboxField(document, {
      id: "reverse-parents",
      label: i18n.t("reverse.preserveParents"),
      checked: draft.preserveParents,
      disabled: state.busy,
      onChange: (checked) =>
        confirma(() => {
          state.reverseOrder.preserveParents = checked;
        })
    })
  );

  regions.content.appendChild(
    checkboxField(document, {
      id: "reverse-timing",
      label: i18n.t("reverse.reverseTimingToo"),
      description: i18n.t("reverse.reverseTimingToo.description"),
      checked: draft.reverseTimingToo,
      disabled: state.busy,
      onChange: (checked) =>
        confirma(() => {
          state.reverseOrder.reverseTimingToo = checked;
        })
    })
  );

  regions.content.appendChild(sectionTitle(document, i18n.t("reverse.section.preview")));

  if (state.previewError) {
    regions.content.appendChild(notice(document, state.previewError, "warning"));
    return;
  }

  const previa = state.reversePreview;
  if (!previa) {
    regions.content.appendChild(hint(document, i18n.t("status.previewing")));
    return;
  }

  renderPreviewRows(
    regions,
    i18n,
    previa.after.map((entrada, posicao) => ({
      antes: previa.before[posicao]?.name ?? "",
      depois: entrada.name
    })),
    previa.targetCount
  );
}

function reverseOrderDisabledReason(i18n: I18n): string | null {
  if (state.busy) {
    return state.busyReason ?? i18n.t("status.initializing");
  }
  if (!state.context?.isComposition) {
    return i18n.t("message.reverseNoActiveComp");
  }
  if (state.previewError) {
    return state.previewError;
  }
  return null;
}

async function applyReverseOrder(
  shell: Shell,
  i18n: I18n,
  logger: MotionLogger,
  client: Client
): Promise<void> {
  if (state.busy) return;

  if (!state.context?.isComposition) {
    state.lastError = i18n.t("message.reverseNoActiveComp");
    shell.setStatus(i18n.t("status.notCompleted"), "error");
    shell.rerender();
    return;
  }

  const draft = state.reverseOrder;
  shell.setStatus(i18n.t("status.applyingReverseOrder"), "busy");
  setBusy(shell, true, i18n.t("status.applyingReverseOrder"));

  const response = await client.execute<ReversePreviewData>(
    "ae.layer.reverse-order",
    {
      scope: draft.scope,
      preserveTrackMattes: draft.preserveTrackMattes,
      preserveParents: draft.preserveParents,
      reverseTimingToo: draft.reverseTimingToo
    },
    { preserveSelection: true }
  );
  logger.recordResponse("ae.layer.reverse-order", response);

  if (!response.ok) {
    reportFailure(shell, i18n, response);
    setBusy(shell, false);
    return;
  }

  state.lastError = null;
  const alvos = isReversePreviewData(response.data) ? response.data.targetCount : 0;
  shell.setStatus(i18n.t("message.reverseApplied", { count: alvos }), "ok");
  setBusy(shell, false);

  await refreshReversePreview();
}

function renderFlip(regions: RenderRegions, i18n: I18n): void {
  const shell = regions.shell;
  const draft = state.flip;

  regions.content.appendChild(notice(document, i18n.t("message.flipInstructions")));
  if (state.context && !state.context.isComposition) {
    regions.content.appendChild(notice(document, i18n.t("message.flipNoActiveComp"), "warning"));
  }
  // O limite é declarado de saída, e não só quando o comando recusa: descobrir
  // a restrição depois de montar a seleção é pior que saber antes.
  regions.content.appendChild(notice(document, i18n.t("message.flipUnsupportedLayer"), "warning"));

  regions.content.appendChild(sectionTitle(document, i18n.t("flip.section.axis")));

  regions.content.appendChild(
    selectField(document, {
      id: "flip-axis",
      label: i18n.t("flip.axis"),
      value: draft.axis,
      disabled: state.busy,
      options: [
        { value: "horizontal", label: i18n.t("flip.axis.horizontal") },
        { value: "vertical", label: i18n.t("flip.axis.vertical") }
      ],
      onChange: (value) => {
        state.flip.axis = value === "vertical" ? "vertical" : "horizontal";
        shell.rerender();
      }
    })
  );

  regions.content.appendChild(
    selectField(document, {
      id: "flip-pivot",
      label: i18n.t("flip.pivot"),
      value: draft.pivot,
      disabled: state.busy,
      options: [
        { value: "anchor", label: i18n.t("flip.pivot.anchor") },
        { value: "selectionBounds", label: i18n.t("flip.pivot.selectionBounds") },
        { value: "compCenter", label: i18n.t("flip.pivot.compCenter") }
      ],
      onChange: (value) => {
        state.flip.pivot =
          value === "selectionBounds" || value === "compCenter" ? value : "anchor";
        shell.rerender();
      }
    })
  );

  // O centro da composição é o mesmo ponto para todas as camadas, então o modo
  // de agrupamento não muda nada ali. Mostrá-lo seria oferecer uma escolha sem
  // efeito.
  if (draft.pivot !== "compCenter") {
    regions.content.appendChild(
      selectField(document, {
        id: "flip-group-mode",
        label: i18n.t("flip.groupMode"),
        value: draft.groupMode,
        disabled: state.busy,
        options: [
          { value: "each", label: i18n.t("flip.groupMode.each") },
          { value: "group", label: i18n.t("flip.groupMode.group") }
        ],
        onChange: (value) => {
          state.flip.groupMode = value === "group" ? "group" : "each";
          shell.rerender();
        }
      })
    );
  }

  regions.content.appendChild(sectionTitle(document, i18n.t("flip.section.options")));

  regions.content.appendChild(
    checkboxField(document, {
      id: "flip-text-readability",
      label: i18n.t("flip.preserveTextReadability"),
      description: i18n.t("flip.preserveTextReadability.description"),
      checked: draft.preserveTextReadability,
      disabled: state.busy,
      onChange: (checked) => {
        state.flip.preserveTextReadability = checked;
        shell.rerender();
      }
    })
  );
}

function flipDisabledReason(i18n: I18n): string | null {
  if (state.busy) {
    return state.busyReason ?? i18n.t("status.initializing");
  }
  if (!state.context?.isComposition) {
    return i18n.t("message.flipNoActiveComp");
  }
  return null;
}

async function applyFlip(
  shell: Shell,
  i18n: I18n,
  logger: MotionLogger,
  client: Client
): Promise<void> {
  if (state.busy) return;

  if (!state.context?.isComposition) {
    state.lastError = i18n.t("message.flipNoActiveComp");
    shell.setStatus(i18n.t("status.notCompleted"), "error");
    shell.rerender();
    return;
  }

  const draft = state.flip;
  shell.setStatus(i18n.t("status.applyingFlip"), "busy");
  setBusy(shell, true, i18n.t("status.applyingFlip"));

  const response = await client.execute<SmoothResultData>(
    "ae.layer.flip",
    {
      axis: draft.axis,
      pivot: draft.pivot,
      // O centro da composição é o mesmo ponto para todas, então o modo é
      // irrelevante ali — o painel envia o valor canônico em vez de um resíduo
      // do que o usuário escolheu antes de trocar de pivô.
      groupMode: draft.pivot === "compCenter" ? "each" : draft.groupMode,
      preserveTextReadability: draft.preserveTextReadability
    },
    { preserveSelection: true }
  );
  logger.recordResponse("ae.layer.flip", response);

  if (!response.ok || !isSmoothResultData(response.data)) {
    if (!response.ok) {
      reportFailure(shell, i18n, response);
    } else {
      state.lastError = i18n.t("message.failureWithoutReason");
      logger.error("Resposta de flip invalida.", {
        command: "ae.layer.flip",
        errorCode: "INVALID_HOST_RESPONSE",
        result: "failure"
      });
      shell.setStatus(i18n.t("status.failed"), "error");
    }
    setBusy(shell, false);
    return;
  }

  state.lastError = null;
  shell.setStatus(i18n.t("message.flipApplied", { count: response.data.appliedCount }), "ok");
  setBusy(shell, false);
}

interface CreateNullResultData {
  nullIndex: number;
  nullName: string;
  parentedCount: number;
}

function isCreateNullResultData(value: unknown): value is CreateNullResultData {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    Number.isInteger(record.nullIndex) &&
    typeof record.nullName === "string" &&
    Number.isInteger(record.parentedCount) &&
    (record.parentedCount as number) >= 0
  );
}

function renderCreateNull(regions: RenderRegions, i18n: I18n): void {
  const shell = regions.shell;
  const draft = state.createNull;

  regions.content.appendChild(notice(document, i18n.t("message.createNullInstructions")));
  if (state.context && !state.context.isComposition) {
    regions.content.appendChild(notice(document, i18n.t("message.createNullNoActiveComp"), "warning"));
  }

  regions.content.appendChild(sectionTitle(document, i18n.t("createNull.section.placement")));

  regions.content.appendChild(
    selectField(document, {
      id: "createnull-placement",
      label: i18n.t("createNull.placement"),
      value: draft.placement,
      disabled: state.busy,
      options: [
        { value: "compCenter", label: i18n.t("createNull.placement.compCenter") },
        { value: "averageAnchor", label: i18n.t("createNull.placement.averageAnchor") },
        { value: "selectionBounds", label: i18n.t("createNull.placement.selectionBounds") }
      ],
      onChange: (value) => {
        state.createNull.placement =
          value === "averageAnchor" || value === "selectionBounds" ? value : "compCenter";
        shell.rerender();
      }
    })
  );

  regions.content.appendChild(
    selectField(document, {
      id: "createnull-dimension",
      label: i18n.t("createNull.dimension"),
      value: draft.dimension,
      disabled: state.busy,
      options: [
        { value: "2d", label: i18n.t("createNull.dimension.2d") },
        { value: "3d", label: i18n.t("createNull.dimension.3d") }
      ],
      onChange: (value) => {
        state.createNull.dimension = value === "3d" ? "3d" : "2d";
        shell.rerender();
      }
    })
  );

  regions.content.appendChild(sectionTitle(document, i18n.t("createNull.section.options")));

  regions.content.appendChild(
    checkboxField(document, {
      id: "createnull-parent",
      label: i18n.t("createNull.parentSelected"),
      checked: draft.parentSelected,
      disabled: state.busy,
      onChange: (checked) => {
        state.createNull.parentSelected = checked;
        shell.rerender();
      }
    })
  );

  // Preservar aparência só faz diferença quando há parentesco. Mostrá-lo solto
  // sugeriria que ele governa a posição do próprio null, o que não é o caso.
  if (draft.parentSelected) {
    regions.content.appendChild(
      checkboxField(document, {
        id: "createnull-preserve",
        label: i18n.t("parent.preserveWorldTransform"),
        description: i18n.t("parent.preserveWorldTransform.description"),
        checked: draft.preserveWorldTransform,
        disabled: state.busy,
        onChange: (checked) => {
          state.createNull.preserveWorldTransform = checked;
          shell.rerender();
        }
      })
    );
  }

  regions.content.appendChild(
    numberField(document, {
      id: "createnull-size",
      label: i18n.t("createNull.size"),
      value: draft.size,
      min: 1,
      max: 10_000,
      step: 10,
      unit: i18n.t("textBox.unit.px"),
      disabled: state.busy,
      onCommit: (value) => {
        state.createNull.size = value;
        shell.rerender();
      }
    })
  );

  regions.content.appendChild(
    numberField(document, {
      id: "createnull-label",
      label: i18n.t("createNull.label"),
      description: i18n.t("createNull.label.description"),
      value: draft.label,
      min: 0,
      max: 16,
      step: 1,
      disabled: state.busy,
      onCommit: (value) => {
        state.createNull.label = value;
        shell.rerender();
      }
    })
  );
}

function isCreateNullDraftValid(draft: CreateNullDraft): boolean {
  if (!Number.isInteger(draft.size) || draft.size < 1 || draft.size > 10_000) return false;
  return Number.isInteger(draft.label) && draft.label >= 0 && draft.label <= 16;
}

function createNullDisabledReason(i18n: I18n): string | null {
  if (state.busy) {
    return state.busyReason ?? i18n.t("status.initializing");
  }
  if (!state.context?.isComposition) {
    return i18n.t("message.createNullNoActiveComp");
  }
  if (!isCreateNullDraftValid(state.createNull)) {
    return i18n.t("message.textBoxInvalidNumber");
  }
  return null;
}

async function applyCreateNull(
  shell: Shell,
  i18n: I18n,
  logger: MotionLogger,
  client: Client
): Promise<void> {
  if (state.busy) return;

  if (!state.context?.isComposition) {
    state.lastError = i18n.t("message.createNullNoActiveComp");
    shell.setStatus(i18n.t("status.notCompleted"), "error");
    shell.rerender();
    return;
  }

  const draft = state.createNull;
  if (!isCreateNullDraftValid(draft)) {
    state.lastError = i18n.t("message.textBoxInvalidNumber");
    shell.setStatus(i18n.t("status.notCompleted"), "error");
    shell.rerender();
    return;
  }

  shell.setStatus(i18n.t("status.applyingCreateNull"), "busy");
  setBusy(shell, true, i18n.t("status.applyingCreateNull"));

  const response = await client.execute<CreateNullResultData>(
    "ae.layer.create-null",
    {
      placement: draft.placement,
      dimension: draft.dimension,
      parentSelected: draft.parentSelected,
      preserveWorldTransform: draft.preserveWorldTransform,
      size: draft.size,
      label: draft.label
    },
    { preserveSelection: true }
  );
  logger.recordResponse("ae.layer.create-null", response);

  if (!response.ok || !isCreateNullResultData(response.data)) {
    if (!response.ok) {
      reportFailure(shell, i18n, response);
    } else {
      state.lastError = i18n.t("message.failureWithoutReason");
      logger.error("Resposta de Create Null invalida.", {
        command: "ae.layer.create-null",
        errorCode: "INVALID_HOST_RESPONSE",
        result: "failure"
      });
      shell.setStatus(i18n.t("status.failed"), "error");
    }
    setBusy(shell, false);
    return;
  }

  state.lastError = null;
  shell.setStatus(
    i18n.t("message.createNullCreated", { count: response.data.parentedCount }),
    "ok"
  );
  setBusy(shell, false);

  // A pilha de camadas mudou; o cache do seletor de alvo do Parentesco ficou
  // desatualizado, e um índice velho apontaria para a camada errada.
  state.layers = null;
  state.layersTotal = 0;
}

function renderParent(regions: RenderRegions, i18n: I18n): void {
  const shell = regions.shell;
  const draft = state.parent;

  regions.content.appendChild(notice(document, i18n.t("message.parentInstructions")));
  if (state.context && !state.context.isComposition) {
    regions.content.appendChild(notice(document, i18n.t("message.parentNoActiveComp"), "warning"));
  }

  regions.content.appendChild(sectionTitle(document, i18n.t("parent.section.target")));

  regions.content.appendChild(
    checkboxField(document, {
      id: "parent-unparent",
      label: i18n.t("parent.unparent"),
      description: i18n.t("parent.unparent.description"),
      checked: draft.unparent,
      disabled: state.busy,
      onChange: (checked) => {
        state.parent.unparent = checked;
        // Desparentear não aceita alvo nem encadeamento: o host recusa a
        // combinação, então a interface não pode deixá-la montada.
        if (checked) {
          state.parent.targetLayerIndex = 0;
          state.parent.targetLayerName = "";
          state.parent.chainMode = "target";
        }
        shell.rerender();
      }
    })
  );

  // Alvo e modo só aparecem quando fazem diferença. Mostrá-los desabilitados ao
  // lado de "Desparentear" seria ruído permanente.
  if (!draft.unparent) {
    if (state.layers === null) {
      regions.content.appendChild(notice(document, i18n.t("message.parentListEmpty"), "warning"));
    } else {
      if (state.layersTotal > state.layers.length) {
        regions.content.appendChild(
          notice(document, i18n.t("message.parentListTruncated", { count: state.layersTotal }), "warning")
        );
      }

      regions.content.appendChild(
        selectField(document, {
          id: "parent-target",
          label: i18n.t("parent.targetLayer"),
          value: String(draft.targetLayerIndex),
          disabled: state.busy,
          options: [
            { value: "0", label: i18n.t("value.noTarget") },
            ...state.layers.map((camada) => ({
              value: String(camada.index),
              label: `${camada.index}. ${camada.name}`
            }))
          ],
          onChange: (value) => {
            const indice = Number(value);
            const escolhida = state.layers?.find((camada) => camada.index === indice);
            state.parent.targetLayerIndex = escolhida ? escolhida.index : 0;
            state.parent.targetLayerName = escolhida ? escolhida.name : "";
            shell.rerender();
          }
        })
      );
    }

    regions.content.appendChild(
      selectField(document, {
        id: "parent-chain-mode",
        label: i18n.t("parent.chainMode"),
        value: draft.chainMode,
        disabled: state.busy,
        options: [
          { value: "target", label: i18n.t("parent.chainMode.target") },
          { value: "chain", label: i18n.t("parent.chainMode.chain") }
        ],
        onChange: (value) => {
          state.parent.chainMode = value === "chain" ? "chain" : "target";
          shell.rerender();
        }
      })
    );
  }

  regions.content.appendChild(sectionTitle(document, i18n.t("parent.section.options")));

  regions.content.appendChild(
    checkboxField(document, {
      id: "parent-preserve",
      label: i18n.t("parent.preserveWorldTransform"),
      description: i18n.t("parent.preserveWorldTransform.description"),
      checked: draft.preserveWorldTransform,
      disabled: state.busy,
      onChange: (checked) => {
        state.parent.preserveWorldTransform = checked;
        shell.rerender();
      }
    })
  );
}

function parentDisabledReason(i18n: I18n): string | null {
  if (state.busy) {
    return state.busyReason ?? i18n.t("status.initializing");
  }
  if (!state.context?.isComposition) {
    return i18n.t("message.parentNoActiveComp");
  }
  const draft = state.parent;
  if (!draft.unparent && draft.chainMode === "target" && draft.targetLayerIndex === 0) {
    return i18n.t("message.parentNeedsTarget");
  }
  return null;
}

async function applyParent(
  shell: Shell,
  i18n: I18n,
  logger: MotionLogger,
  client: Client
): Promise<void> {
  if (state.busy) return;

  if (!state.context?.isComposition) {
    state.lastError = i18n.t("message.parentNoActiveComp");
    shell.setStatus(i18n.t("status.notCompleted"), "error");
    shell.rerender();
    return;
  }

  const draft = state.parent;
  if (!draft.unparent && draft.chainMode === "target" && draft.targetLayerIndex === 0) {
    state.lastError = i18n.t("message.parentNeedsTarget");
    shell.setStatus(i18n.t("status.notCompleted"), "error");
    shell.rerender();
    return;
  }

  shell.setStatus(i18n.t("status.applyingParent"), "busy");
  setBusy(shell, true, i18n.t("status.applyingParent"));

  const response = await client.execute<SmoothResultData>(
    "ae.layer.parent",
    {
      targetLayerIndex: draft.unparent ? 0 : draft.targetLayerIndex,
      targetLayerName: draft.unparent ? "" : draft.targetLayerName,
      preserveWorldTransform: draft.preserveWorldTransform,
      unparent: draft.unparent,
      chainMode: draft.unparent ? "target" : draft.chainMode
    },
    { preserveSelection: true }
  );
  logger.recordResponse("ae.layer.parent", response);

  if (!response.ok || !isSmoothResultData(response.data)) {
    if (!response.ok) {
      reportFailure(shell, i18n, response);
    } else {
      state.lastError = i18n.t("message.failureWithoutReason");
      logger.error("Resposta de parentesco invalida.", {
        command: "ae.layer.parent",
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
    ? i18n.t("message.parentApplied", { count: response.data.appliedCount })
    : i18n.t("message.parentAlreadyApplied", { count: response.data.unchangedCount });
  shell.setStatus(success, "ok");
  setBusy(shell, false);

  // A hierarquia mudou; a lista em cache não reflete mais o projeto.
  await loadLayers();
  shell.setStatus(success, "ok");
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
