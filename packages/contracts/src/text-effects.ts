/** Controls for the three original, managed After Effects text rigs. */
export type TextEffectKind = "wordReveal" | "variableMorph" | "styleSwap";
export type TextEffectAction = "apply" | "remove";
export type WordRevealAction = TextEffectAction | "update" | "bake";
export type WordRevealRenderer = "legacy" | "morph";
export type WordRevealDirection = "bottom" | "top" | "left" | "right";
export interface WordRevealArgs {
  action: WordRevealAction; durationFrames: number; staggerFrames: number;
  paddingX: number; paddingY: number; roundness: number; revealPoint: number; boxGap: number;
  fillColor: [number, number, number];
  /** Omitted by older clients: keep the original word/box reveal. */
  renderer?: WordRevealRenderer;
  direction?: WordRevealDirection;
  smoothness?: number;
  formationPercent?: number;
  holdPercent?: number;
  travelPercent?: number;
  order?: "normal" | "reverse";
  automatic?: boolean;
  progress?: number;
  useSourceColor?: boolean;
  textColor?: [number, number, number];
}
/** Snapshot of the selected original, controller, or managed member. */
export interface WordRevealReadData {
  rigVersion: number;
  renderer: WordRevealRenderer | null;
  controls: WordRevealArgs | null;
  wordCount: number;
  baked: boolean;
}
export type VariableMorphAction = TextEffectAction | "update" | "bake" | "sweep";
export type ProximityMorphRenderer = "auto" | "outline" | "variable";
export type ProximityMorphPreset = "soft-weight" | "strong-weight" | "thin" | "width" | "slant" | "magnify" | "wave" | "rubber";
export type ProximityMorphSweepDirection = "left-to-right" | "right-to-left" | "top-to-bottom" | "bottom-to-top";
export interface VariableMorphArgs {
  action: VariableMorphAction; radius: number; strength: number;
  weight: number; contrast: number; italic: number;
  /** Omission preserves the original variable-font client contract. */
  renderer?: ProximityMorphRenderer;
  preset?: ProximityMorphPreset;
  smoothness?: number;
  /** Destination percentages at full influence, with 100 as the neutral value. */
  scaleX?: number; scaleY?: number;
  skew?: number;
  /** Percentage of font size; a negative value lifts the glyph. */
  lift?: number;
  sweepFrames?: number;
  sweepDirection?: ProximityMorphSweepDirection;
}
export interface VariableMorphReadData {
  rigVersion: number;
  renderer: Exclude<ProximityMorphRenderer, "auto"> | null;
  controls: VariableMorphArgs | null;
  glyphCount: number;
  baked: boolean;
  stale: boolean;
  capabilities: { weight: boolean; contrast: boolean; italic: boolean; variable: boolean; outline: boolean };
  /** Animated or expression-driven controller values that cannot be overwritten. */
  lockedControls?: string[];
}
export interface StyleSwapArgs {
  action: TextEffectAction; durationFrames: number; staggerFrames: number;
  unit: "characters" | "words";
}
export type PulsePreset = "impact" | "electric" | "plasma" | "liquid" | "rupture";
export type PulseRenderer = "legacy" | "morph";
export type PulseAnimationMode = "uniform" | "center-out" | "left-to-right" | "right-to-left";
export interface PulseControls {
  durationFrames: number;
  peakScalePercent: number;
  distortion: number;
  glow: number;
  seed: number;
  accentColor: [number, number, number];
  /** Omission preserves the original V1–V3 pulse payload. */
  animationMode?: PulseAnimationMode;
  waveSpread?: number;
  renderer?: PulseRenderer;
  preset?: PulsePreset;
  fluidity?: number;
}
export type PulseApplyArgs = PulseControls & { action: "apply" };
/** Lifecycle operations read the existing rig rather than overwriting controls. */
export type PulseArgs = PulseApplyArgs | { action: "update" | "bake" | "remove"; renderer?: PulseRenderer };
export interface PulseReadData {
  rigVersion: number;
  renderer: PulseRenderer | null;
  preset: PulsePreset | null;
  controls: PulseApplyArgs | null;
  stale: boolean;
  baked: boolean;
  lockedControls: string[];
  glyphCount: number;
  vertexCount: number;
}
export interface PulsePresetRecipe {
  readonly durationSeconds: number;
  readonly controls: Readonly<Required<Omit<PulseControls, "durationFrames" | "renderer" | "preset">>>;
  /** Normalized cycle boundaries. Every transition uses quintic easing. */
  readonly timing: Readonly<{
    attackStart: number; attackEnd: number; holdEnd: number; releaseEnd: number;
    reboundEnd: number;
    /** Undershoot as a fraction of the full pulse envelope, zero at both ends. */
    reboundDepth: number;
  }>;
  /** Maximum local contour delay as a fraction of a cycle, multiplied by fluidity / 100. */
  readonly matterDelay: number;
  /** Multiplier of the material's vertical expansion relative to the nucleus. */
  readonly matterStretch: number;
  /** Maximum number of procedural open stroke paths, each bounded to 16 vertices. */
  readonly sparks: number;
}
/** Single source for panel defaults and the generated native-host recipe table. */
export const PULSE_PRESETS: Readonly<Record<PulsePreset, PulsePresetRecipe>> = {
  impact: {
    durationSeconds: 1.8,
    controls: { peakScalePercent: 360, animationMode: "center-out", waveSpread: 45, distortion: 65, glow: 80,
      seed: 1, accentColor: [1, 0.68, 0.08], fluidity: 45 },
    timing: { attackStart: 0.02, attackEnd: 0.12, holdEnd: 0.38, releaseEnd: 0.62, reboundEnd: 0.70, reboundDepth: 0.035 },
    matterDelay: 0.08, matterStretch: 1.12, sparks: 0
  },
  electric: {
    durationSeconds: 1.5,
    controls: { peakScalePercent: 340, animationMode: "left-to-right", waveSpread: 35, distortion: 85, glow: 95,
      seed: 1, accentColor: [0.08, 0.86, 1], fluidity: 30 },
    timing: { attackStart: 0.02, attackEnd: 0.09, holdEnd: 0.33, releaseEnd: 0.53, reboundEnd: 0.61, reboundDepth: 0.025 },
    matterDelay: 0.05, matterStretch: 1.10, sparks: 4
  },
  plasma: {
    durationSeconds: 2.2,
    controls: { peakScalePercent: 380, animationMode: "center-out", waveSpread: 60, distortion: 70, glow: 95,
      seed: 1, accentColor: [0.63, 0.18, 1], fluidity: 75 },
    timing: { attackStart: 0.02, attackEnd: 0.18, holdEnd: 0.34, releaseEnd: 0.69, reboundEnd: 0.69, reboundDepth: 0 },
    matterDelay: 0.10, matterStretch: 1.25, sparks: 0
  },
  liquid: {
    durationSeconds: 2.6,
    controls: { peakScalePercent: 320, animationMode: "center-out", waveSpread: 75, distortion: 35, glow: 65,
      seed: 1, accentColor: [0.05, 0.80, 0.65], fluidity: 95 },
    timing: { attackStart: 0.02, attackEnd: 0.22, holdEnd: 0.34, releaseEnd: 0.70, reboundEnd: 0.70, reboundDepth: 0 },
    matterDelay: 0.10, matterStretch: 1.12, sparks: 0
  },
  rupture: {
    durationSeconds: 1.7,
    controls: { peakScalePercent: 420, animationMode: "right-to-left", waveSpread: 40, distortion: 95, glow: 85,
      seed: 1, accentColor: [1, 0.23, 0.18], fluidity: 40 },
    timing: { attackStart: 0.02, attackEnd: 0.09, holdEnd: 0.33, releaseEnd: 0.58, reboundEnd: 0.68, reboundDepth: 0.06 },
    matterDelay: 0.06, matterStretch: 1.20, sparks: 2
  }
};
export function pulsePresetArgs(preset: PulsePreset, frameRate: number | null): Required<PulseApplyArgs> {
  const fps = frameRate !== null && Number.isFinite(frameRate) && frameRate > 0 ? frameRate : 30;
  const recipe = PULSE_PRESETS[preset];
  return {
    action: "apply", renderer: "morph", preset,
    durationFrames: Math.max(12, Math.min(240, Math.round(recipe.durationSeconds * fps))),
    ...recipe.controls,
    accentColor: [...recipe.controls.accentColor]
  };
}
export const WORD_REVEAL_DEFAULTS: Readonly<Required<WordRevealArgs>> = {
  action: "apply", renderer: "morph", durationFrames: 36, staggerFrames: 5,
  paddingX: 0, paddingY: 15, roundness: 0, revealPoint: 50, boxGap: 3, fillColor: [1, 0.12, 0.08],
  direction: "bottom", smoothness: 75, formationPercent: 25, holdPercent: 10,
  travelPercent: 10, order: "normal", automatic: true, progress: 0,
  useSourceColor: true, textColor: [1, 1, 1]
};
export const VARIABLE_MORPH_DEFAULTS: Readonly<VariableMorphArgs> = {
  action: "apply", radius: 250, strength: 100, weight: 100, contrast: 0, italic: 0
};
export const PROXIMITY_MORPH_DEFAULTS: Readonly<Required<VariableMorphArgs>> = {
  action: "apply", renderer: "auto", preset: "soft-weight", radius: 250, strength: 100,
  weight: 35, contrast: 0, italic: 0, smoothness: 75,
  scaleX: 100, scaleY: 100, skew: 0, lift: 0, sweepFrames: 48, sweepDirection: "left-to-right"
};
type ProximityMorphPresetControls = Pick<Required<VariableMorphArgs>, "weight" | "contrast" | "italic" | "scaleX" | "scaleY" | "skew" | "lift">;
const neutralMorphControls: ProximityMorphPresetControls = { weight: 0, contrast: 0, italic: 0, scaleX: 100, scaleY: 100, skew: 0, lift: 0 };
export const PROXIMITY_MORPH_PRESETS: Readonly<Record<ProximityMorphPreset, Readonly<ProximityMorphPresetControls>>> = {
  "soft-weight": { ...neutralMorphControls, weight: 35 },
  "strong-weight": { ...neutralMorphControls, weight: 75 },
  thin: { ...neutralMorphControls, weight: -35 },
  width: { ...neutralMorphControls, scaleX: 112 },
  slant: { ...neutralMorphControls, skew: 12 },
  magnify: { ...neutralMorphControls, scaleX: 115, scaleY: 115 },
  wave: { ...neutralMorphControls, lift: -15 },
  rubber: { ...neutralMorphControls, scaleX: 115, scaleY: 90 }
};
export const STYLE_SWAP_DEFAULTS: Readonly<StyleSwapArgs> = {
  action: "apply", durationFrames: 24, staggerFrames: 2, unit: "characters"
};
