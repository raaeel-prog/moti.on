/** Session-only snapshot. Never synchronize host identities or project paths. */
export interface SelectionContext {
  selectionSignature?: string;
  hostVersion: string | null;
  projectName: string | null;
  projectPath: string | null;
  activeItemName: string | null;
  isComposition: boolean;
  compWidth: number | null;
  compHeight: number | null;
  compDuration: number | null;
  compFrameRate: number | null;
  currentTime: number | null;
  workAreaStart: number | null;
  workAreaDuration: number | null;
  selectionLayerCount: number;
  selectionPropertyCount: number;
  selectionExpressibleCount: number;
  selectionSelectedKeyCount: number;
  selectionHasKeyframes: boolean;
  selectionHasExpressions: boolean;
  selectionIs3D: boolean;
  selectionTextLayerCount?: number;
  selectionLockedLayerCount?: number;
  averageLayerDurationSeconds: number | null;
  selectionTruncated: boolean;
}
export interface ManagedToolTarget {
  compId: number;
  layerId: number;
  effectIndex: number;
  matchName: string;
  fingerprint: string;
}
export interface ManagedToolControl {
  id: string;
  label: string;
  kind: "slider" | "angle" | "checkbox" | "color" | "point" | "dropdown";
  value: number | number[];
  min?: number;
  max?: number;
  options?: { value: number; label: string }[];
  locked: boolean;
}
export interface ManagedToolInspection {
  id: string;
  name: string;
  layerName: string;
  target: ManagedToolTarget;
  controls: ManagedToolControl[];
}
