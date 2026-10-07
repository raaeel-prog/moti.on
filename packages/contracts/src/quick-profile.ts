import type { HostId } from "./protocol.js";

export const QUICK_PROFILE_LOCALES = ["pt-BR", "en-US"] as const;
export type QuickProfileLocale = (typeof QUICK_PROFILE_LOCALES)[number];
export type QuickLocalizedText = Record<QuickProfileLocale, string>;

export type QuickSelectionKind =
  | "text"
  | "shape"
  | "av"
  | "camera"
  | "light"
  | "null"
  | "adjustment"
  | "solid"
  | "precomp";

export type LiveControlKind =
  | "slider"
  | "angle"
  | "color"
  | "checkbox"
  | "point"
  | "dropdown";

export type LiveControlTarget = "layer" | "controller" | "comp-controller";
export type LiveControlUnit = "px" | "%" | "°" | "fps" | "frames" | "s" | "x" | "none";

export interface LiveControlOption {
  value: number;
  label: Record<string, string>;
}

export interface LiveControlBinding {
  paramId: string;
  label: QuickLocalizedText;
  control: LiveControlKind;
  target: LiveControlTarget;
  order: number;
  unit?: LiveControlUnit;
  /** Limites duros aplicados pela expressão; o efeito do host não os impõe. */
  min?: number;
  max?: number;
  /** Faixa recomendada exibida no painel. */
  softMin?: number;
  softMax?: number;
  step?: number;
  options?: LiveControlOption[];
  help: QuickLocalizedText;
}

export interface QuickContext {
  host: HostId;
  hostVersion: string;
  fps: number;
  compWidth: number;
  compHeight: number;
  compDurationSeconds: number;
  currentTimeSeconds: number;
  workAreaStart: number;
  workAreaDuration: number;
  /**
   * Propriedades selecionadas na timeline. É o número que as ferramentas de
   * expressão contam, porque cada uma delas escreve numa propriedade.
   */
  selectionCount: number;
  /**
   * Camadas selecionadas.
   *
   * Não é derivável de `selectionCount`. No After Effects, selecionar uma
   * propriedade também seleciona a camada dona, mas selecionar uma camada não
   * seleciona propriedade nenhuma — e esse é o caso mais comum de todos.
   * As ferramentas de operação (Null, Espelhar, Inverter ordem) contam camadas;
   * se lessem `selectionCount` veriam zero justamente quando o usuário acabou
   * de clicar em duas camadas e espera que elas sejam parenteadas.
   */
  selectionLayerCount: number;
  selectionKinds: QuickSelectionKind[];
  selectionHasKeyframes: boolean;
  selectionHasExpressions: boolean;
  selectionIs3D: boolean;
  averageLayerDurationSeconds: number;
  existingRigIdsInSelection: string[];
  lastUsedPresetId?: string;
}

export interface QuickProfile<
  TArgs extends Record<string, unknown> = Record<string, unknown>
> {
  factoryPresetId: string;
  /** Função pura. O registry apenas armazena a referência; nunca a executa. */
  derive?(context: QuickContext): Partial<TArgs>;
  liveControls: LiveControlBinding[];
  previewAssetId: string;
  oneLine: QuickLocalizedText;
  needs: QuickLocalizedText;
  budgetMs: number;
}
