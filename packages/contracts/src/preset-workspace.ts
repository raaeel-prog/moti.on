import type { MotionLibraryOptions } from "./motion-library.js";

/** Stable identity captured by Inspect; Adjust must reject a stale target. */
export interface PresetTarget {
  compId: number;
  layerId: number;
  instance: string;
  fingerprint: string;
}

export interface PresetInspection {
  state: "ready" | "no-comp" | "no-selection" | "multiple" | "unmanaged" | "conflict";
  message: string;
  target?: PresetTarget;
  /** Same recipe in timeline order; every identity is checked on apply. */
  targets?: PresetTarget[];
  /** Options whose values differ across the selected layers. */
  mixedKeys?: (keyof MotionLibraryOptions)[];
  layerName?: string;
  presetId?: string;
  options?: MotionLibraryOptions;
  /** A generated transition overlay; phase/direction belong to layer presets. */
  cameraTransition?: boolean;
  phases?: PresetPhaseInspection[];
  frameRate?: number;
  dropFrame?: boolean;
  /** Native live-gesture capability is explicitly opt-in after host proof. */
  liveGesture?: boolean;
  selection?: {id: number; name: string}[];
  colors?: PresetColorInspection[];
  colorTarget?: PresetColorTarget;
  colorsTruncated?: boolean;
}

export interface PresetColorTarget {compId:number; layerId:number; fingerprint:string}
export interface PresetColorInspection {
  key:string; label:string; hex:string|null; available:boolean; reason:string;
}
export interface PresetColorAdjustArgs {target:PresetColorTarget; key:string; hex:string}

export interface PresetPhaseInspection {
  phase: "in" | "out";
  presetId: string;
  instance: string;
  options: MotionLibraryOptions;
  markerTime: number | null;
  controls: {key: keyof MotionLibraryOptions; name: string; type: "number"; min: number; max: number; unit: string}[];
}

export interface PresetPhaseAdjustArgs {
  target: PresetTarget;
  phase: "in" | "out";
  presetId: string;
  options: MotionLibraryOptions;
}

export interface PresetPhaseActionArgs {
  target: PresetTarget;
  phase: "in" | "out";
  action: "remove" | "reset";
}

export interface PresetPhaseTimingArgs {
  target: PresetTarget;
  phase: "in" | "out";
  frames: number;
}

export interface CameraTransitionArgs {
  presetId: string;
  durationFrames: number;
  intensity: number;
}

/** Adjust the inspected, still-selected managed layer or homogeneous selection. */
export interface PresetAdjustArgs {
  target: PresetTarget;
  targets?: PresetTarget[];
  /** When supplied, only these options replace each layer's current values. */
  optionKeys?: (keyof MotionLibraryOptions)[];
  presetId: string;
  options: MotionLibraryOptions;
}

/** Root and item identifiers are opaque host-issued tokens, never filesystem paths. */
export type PersonalPresetArgs =
  | { action: "list" }
  | { action: "add" }
  | { action: "remove"; rootId: string };

/** Host-issued local URI for passive playback, never accepted as command input. */
export interface PersonalPresetPreview {
  itemId: string;
  kind: "image" | "audio" | "video";
  name: string;
  uri: string;
}

export interface PersonalPresetApplyArgs {
  itemId: string;
}

export interface PersonalPresetRoot {
  id: string;
  name: string;
  missing: boolean;
}

export interface PersonalPresetFolder {
  id: string;
  rootId: string;
  parentId: string | null;
  name: string;
}

export interface PersonalPresetItem {
  id: string;
  rootId: string;
  folderId: string;
  name: string;
  /** Display-only path relative to the registered root. Never used as apply input. */
  relativePath: string;
  /** Omitted by legacy hosts for .ffx entries. */
  kind?: "preset" | "image" | "audio" | "video" | "project";
}

export interface PersonalPresetCatalog {
  roots: PersonalPresetRoot[];
  folders: PersonalPresetFolder[];
  items: PersonalPresetItem[];
  truncated: boolean;
  cancelled?: boolean;
}

/** Change owned timing cues only; layer boundaries and unrelated keys stay put. */
export interface PresetTimingArgs {
  operation: "shift" | "align" | "stagger" | "duration";
  phase: "in" | "out";
  /** Relative shift, stagger step or absolute phase duration; ignored by align. */
  frames: number;
  /** Timeline layer order, never incidental selection order. */
  order: "forward" | "reverse" | "random";
  /** Reproducible shuffle of timeline order; default 17. */
  seed?: number;
}
