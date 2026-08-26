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
  /** Nome do arquivo com extensao, sem o caminho. */
  readonly name: string;
  /** Caminho absoluto no formato nativo do sistema de arquivos. */
  readonly fsName: string;
}

declare class Item {
  readonly name: string;
}

declare class CompItem extends Item {
  readonly width: number;
  readonly height: number;
  readonly duration: number;
  readonly frameRate: number;
  time: number;
  readonly selectedProperties: Array<PropertyGroup & Property>;
  readonly layers: LayerCollection;
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
}

declare class Layer {
  /**
   * Busca por matchName ou por nome de exibicao. A camada de host deve sempre
   * passar matchName: nome de exibicao muda conforme o idioma do aplicativo.
   */
  property(nameOrMatchName: string): PropertyGroup;
}

declare class TextLayer extends Layer {}

declare class PropertyGroup {
  property(nameOrMatchName: string): PropertyGroup & Property;
}

declare class Property {
  readonly propertyType: number;
  readonly propertyValueType: number;
  readonly canSetExpression: boolean;
  expression: string;
  expressionEnabled: boolean;
  readonly expressionError: string;
  readonly numKeys: number;
  value: unknown;
  setValue(value: unknown): void;
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

declare class TextDocument {
  fontSize: number;
  fillColor: [number, number, number];
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
