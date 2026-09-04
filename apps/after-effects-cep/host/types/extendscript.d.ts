/**
 * Declaracoes ambientais do ExtendScript do After Effects.
 *
 * ESTE ARQUIVO E DELIBERADAMENTE PARCIAL. Ele declara apenas os simbolos que a
 * camada de host realmente usa hoje. Nao e, e nao deve virar, uma tentativa de
 * reproduzir o SDK inteiro do After Effects: uma declaracao escrita de memoria
 * para uma API que o codigo nao exercita nao e verificada por nada e da uma
 * falsa sensacao de seguranca.
 *
 * Regra: so acrescente um simbolo aqui quando escrever o codigo que o chama, e
 * confira a assinatura contra a referencia de scripting antes de declarar.
 *
 * A referencia comunitaria (ae-scripting.docsforadobe.dev) e util mas nao e
 * fonte primaria da Adobe; conforme SOURCES.md, qualquer assinatura sensivel a
 * versao precisa ser confirmada no host real antes de ser tratada como certa.
 * O que estiver aqui e apenas o que o painel starter ja executava.
 */

/** Objeto raiz do ExtendScript. `$.global` e o escopo global. */
declare const $: {
  global: Record<string, unknown>;
};

declare class File {
  constructor(path?: string);
  /** Nome do arquivo com extensao, sem o caminho. */
  readonly name: string;
  /** Caminho absoluto no formato nativo do sistema de arquivos. */
  readonly fsName: string;
  /** `true` quando o caminho aponta para um arquivo que existe no disco agora. */
  readonly exists: boolean;
}

/** Opcoes de importacao passadas a `app.project.importFile`. */
declare class ImportOptions {
  constructor(file: File);
}

/**
 * Modos de mescla nativos do After Effects. Declarados so os membros que o
 * host usa hoje — a enumeracao real do ExtendScript tem muitos mais.
 */
declare const BlendingMode: {
  readonly OVERLAY: unknown;
  readonly MULTIPLY: unknown;
  readonly SCREEN: unknown;
  readonly ADD: unknown;
};

declare class Item {
  readonly name: string;
}

declare class FootageItem extends Item {
  /** Camadas que usam este item. Vazio = material nao usado no projeto. */
  readonly usedIn: CompItem[];
  remove(): void;
}

declare class CompItem extends Item {
  /** Gravaveis: sao o que `ae.comp.fast-edit` ajusta. */
  width: number;
  height: number;
  duration: number;
  frameRate: number;
  readonly frameDuration: number;
  time: number;
  readonly workAreaStart: number;
  readonly workAreaDuration: number;
  readonly selectedProperties: Array<PropertyGroup & Property>;
  readonly selectedLayers: Layer[];
  readonly layers: LayerCollection;
  readonly numLayers: number;
  /** 1-indexado, como todo indice de colecao no ExtendScript. */
  layer(index: number): Layer;
}

declare class ItemCollection {
  addComp(
    name: string,
    width: number,
    height: number,
    pixelAspect: number,
    duration: number,
    frameRate: number
  ): CompItem;
}

declare class LayerCollection {
  addText(sourceText?: string): TextLayer;
  /** Cria uma shape layer vazia no topo da composicao. */
  addShape(): ShapeLayer;
  /** Cria um null no topo da composicao. Nasce selecionado. */
  addNull(): Layer;
  addCamera(name: string, centerPoint: readonly [number, number]): CameraLayer;
  /** Precompoe as camadas dos indices informados numa nova composicao. */
  precompose(layerIndices: readonly number[], name: string, moveAllAttributes?: boolean): CompItem;
}

declare class Layer {
  /** Campo do usuario. O plugin so escreve entre os marcadores de metadata. */
  comment: string;
  /** Uma adjustment layer afeta tudo que estiver abaixo dela na composicao. */
  adjustmentLayer: boolean;
  /** Janela em que a camada existe na composicao. */
  inPoint: number;
  outPoint: number;
  duplicate(): Layer;
  readonly parentProperty: null;
  name: string;
  /** Selecao da camada. O After Effects seleciona toda camada recem-criada. */
  selected: boolean;
  /**
   * Camada pai. Atribuir aqui cria o vinculo de parentesco; o rig de caixa
   * reescreve ancora e posicao logo depois, entao nao depende de a atribuicao
   * preservar ou nao o transform.
   */
  parent: Layer | null;
  /**
   * Busca por matchName ou por nome de exibicao. A camada de host deve sempre
   * passar matchName: nome de exibicao muda conforme o idioma do aplicativo.
   */
  property(nameOrMatchName: string): PropertyGroup;
  /** Posicao 1-indexada na ordem da timeline. */
  readonly index: number;
  /** `true` para camadas Null. Usado apenas para rotular o seletor de alvo. */
  readonly nullLayer: boolean;
  /** Indice de cor de rotulo, 0 a 16. 0 significa sem rotulo. */
  label: number;
  threeDLayer: boolean;
  /** Selecao da camada. */
  selected: boolean;
  readonly source: SolidSource;
  startTime: number;
  /** Projeta um ponto da camada para coordenadas da composicao. */
  sourcePointToComp(point: number[]): number[];
  /**
   * Parenteia SEM preservar o world transform: a camada pula para onde o
   * transform do pai a levar. Medido em docs/research/after-effects-parenting.md
   * — o nome engana, o "jump" e o que ela causa, nao o que evita.
   */
  setParentWithJump(layer: Layer): void;
  /**
   * Retangulo da fonte no espaco da camada. `top` costuma ser negativo em
   * texto, porque a origem fica na baseline.
   */
  sourceRectAtTime(time: number, includeExtents: boolean): SourceRect;
  /** Move esta camada para logo abaixo da informada, na ordem da timeline. */
  moveAfter(layer: Layer): void;
  /** Move esta camada para logo acima da informada. */
  moveBefore(layer: Layer): void;
  /** Move esta camada para o topo da composicao. */
  moveToBeginning(): void;
  readonly trackMatteLayer: Layer | null;
  readonly trackMatteType: unknown;
  remove(): void;
}

declare class TextLayer extends Layer {}

declare class ShapeLayer extends Layer {}

/** Retangulo devolvido por `sourceRectAtTime`, no espaco da propria camada. */
interface SourceRect {
  readonly top: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
}

/** Fonte de um solido ou null; largura e altura sao gravaveis. */
declare class SolidSource {
  name: string;
  width: number;
  height: number;
}

declare class PropertyGroup {
  /**
   * Gravavel quando o grupo e membro de um grupo indexado — o caso dos
   * operadores de shape, que e como o Trim Paths recebe o nome gerenciado.
   */
  name: string;
  readonly matchName: string;
  readonly propertyIndex: number;
  readonly parentProperty: PropertyGroup | Layer | null;
  readonly numProperties: number;
  property(nameOrMatchName: string): PropertyGroup & Property;
  /** 1-indexado. Usado para varrer conteudo de shape, cujo tamanho e variavel. */
  property(index: number): PropertyGroup & Property;
  addProperty(matchName: string): PropertyGroup & Property;
  /**
   * O efeito pode ser acrescentado nesta instalacao? E a unica sonda honesta:
   * o After Effects nao expoe catalogo de efeitos consultavel.
   */
  canAddProperty(matchName: string): boolean;
  /** Remove este grupo do pai. Usado para desfazer grupos criados por um comando. */
  remove(): void;
}

declare class Property {
  readonly name: string;
  readonly matchName: string;
  /** `true` apenas na propriedade interna de um Dropdown Menu Control. */
  readonly isDropdownEffect: boolean;
  readonly propertyIndex: number;
  readonly parentProperty: PropertyGroup | Layer | null;
  readonly propertyType: number;
  readonly propertyValueType: number;
  readonly canSetExpression: boolean;
  expression: string;
  expressionEnabled: boolean;
  readonly canVaryOverTime: boolean;
  readonly expressionError: string;
  readonly numKeys: number;
  readonly selectedKeys: number[];
  /** Valor do keyframe de indice 1-baseado. */
  keyValue(index: number): unknown;
  /**
   * Grava o valor de um keyframe existente. E o unico caminho quando a
   * propriedade e animada: `setValue` levanta erro com `numKeys > 0`.
   */
  setValueAtKey(index: number, value: unknown): void;
  value: unknown;
  setValue(value: unknown): void;
  /**
   * Define os itens de um Dropdown Menu Control e devolve um novo handle.
   * O handle anterior fica invalido depois da chamada.
   */
  setPropertyParameters(items: string[]): Property;
  /**
   * Valor avaliado no tempo informado, ja com expressao aplicada quando
   * `preExpression` e false. E o que permite usar o motor de expressoes como
   * calculadora e assar o resultado.
   */
  valueAtTime(time: number, preExpression: boolean): unknown;
  keyTime(index: number): number;
  keyValue(index: number): unknown;
  keyInInterpolationType(index: number): unknown;
  keyOutInterpolationType(index: number): unknown;
  keyInTemporalEase(index: number): KeyframeEase[];
  keyOutTemporalEase(index: number): KeyframeEase[];
  keyTemporalContinuous(index: number): boolean;
  keyTemporalAutoBezier(index: number): boolean;
  keyInSpatialTangent(index: number): number[];
  keyOutSpatialTangent(index: number): number[];
  keySpatialContinuous(index: number): boolean;
  keySpatialAutoBezier(index: number): boolean;
  keyRoving(index: number): boolean;
  keySelected(index: number): boolean;
  keyLabel(index: number): number;
  removeKey(index: number): void;
  setValueAtTime(time: number, value: unknown): void;
  setInterpolationTypeAtKey(index: number, inType: unknown, outType: unknown): void;
  setTemporalEaseAtKey(index: number, inEase: KeyframeEase[], outEase: KeyframeEase[]): void;
  setTemporalContinuousAtKey(index: number, continuous: boolean): void;
  setTemporalAutoBezierAtKey(index: number, autoBezier: boolean): void;
  setSpatialTangentsAtKey(index: number, inTangent: unknown, outTangent: unknown): void;
  setSpatialContinuousAtKey(index: number, continuous: boolean): void;
  setSpatialAutoBezierAtKey(index: number, autoBezier: boolean): void;
  setRovingAtKey(index: number, roving: boolean): void;
  setSelectedAtKey(index: number, selected: boolean): void;
  setLabelAtKey(index: number, label: number): void;
}

/**
 * Caminho vetorial nativo. E o unico jeito de descrever linha, seta e balao sem
 * importar asset, que a §"ae.shape.library" proibe.
 */
declare class Shape {
  vertices: number[][];
  inTangents: number[][];
  outTangents: number[][];
  closed: boolean;
}

declare class KeyframeEase {
  constructor(speed: number, influence: number);
  readonly speed: number;
  readonly influence: number;
}

declare const PropertyType: {
  readonly PROPERTY: number;
};

declare const PropertyValueType: {
  readonly NO_VALUE: number;
  readonly ThreeD_SPATIAL: number;
  readonly ThreeD: number;
  readonly TwoD_SPATIAL: number;
  readonly TwoD: number;
  readonly OneD: number;
  readonly COLOR: number;
  readonly CUSTOM_VALUE: number;
  readonly MARKER: number;
  readonly LAYER_INDEX: number;
  readonly MASK_INDEX: number;
  readonly SHAPE: number;
  readonly TEXT_DOCUMENT: number;
};

declare const KeyframeInterpolationType: {
  readonly LINEAR: number;
  readonly BEZIER: number;
  readonly HOLD: number;
};

declare class TextDocument {
  fontSize: number;
  /** Escrever aqui tambem liga `applyFill` nos caracteres afetados. */
  fillColor: [number, number, number];
  applyFill: boolean;
  /** Escrever aqui tambem liga `applyStroke` nos caracteres afetados. */
  strokeColor: [number, number, number];
  /** Espessura do contorno. A referencia documenta a faixa 0 a 1000. */
  strokeWidth: number;
  applyStroke: boolean;
  /** `true` desenha o contorno por cima do preenchimento. */
  strokeOverFill: boolean;
  justification: number;
}

declare const ParagraphJustification: {
  readonly LEFT_JUSTIFY: number;
  readonly CENTER_JUSTIFY: number;
  readonly RIGHT_JUSTIFY: number;
};

declare class Project {
  readonly file: File | null;
  readonly activeItem: Item | CompItem | null;
  readonly items: ItemCollection;
  /**
   * Motor de expressoes do projeto.
   *
   * As strings que o After Effects realmente devolve aqui NAO foram conferidas
   * num projeto real; `normalizeExpressionEngine` trata valor irreconhecivel
   * como "unknown" em vez de chutar. Ver docs/HOST_LIMITATIONS.md.
   */
  readonly expressionEngine: string;
}

declare const app: {
  readonly version: string;
  readonly project: Project;
  /**
   * Preferencias do aplicativo.
   *
   * ATENCAO: os nomes de secao e de chave NAO foram verificados contra
   * documentacao da Adobe. Toda leitura precisa estar dentro de try/catch e
   * reportar "unknown" quando falhar, nunca "false".
   */
  readonly preferences: {
    getPrefAsLong(section: string, key: string): number;
  };
  /**
   * ATENCAO: destrutivo. Descarta o projeto aberto e nao entra no historico de
   * Undo. Nunca deve ser chamado dentro de um grupo de Undo nem como fallback
   * silencioso.
   */
  newProject(): Project;
  beginUndoGroup(name: string): void;
  endUndoGroup(): void;
};
