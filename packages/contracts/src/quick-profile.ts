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
  selectionCount: number;
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
