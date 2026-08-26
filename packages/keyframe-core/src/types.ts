export type KeyframeInterpolation = "linear" | "bezier" | "hold";
export type KeyframeValue = number | readonly number[];

export interface KeyframePropertyDescriptor {
  readonly valueDimensions: number;
  readonly temporalEaseDimensions: number;
  readonly spatial: boolean;
}

export interface TemporalEasePoint {
  readonly speed: number;
  readonly influence: number;
}

export interface TemporalEaseSnapshot {
  readonly in: readonly TemporalEasePoint[];
  readonly out: readonly TemporalEasePoint[];
}

export interface KeyframeInterpolationSnapshot {
  readonly in: KeyframeInterpolation;
  readonly out: KeyframeInterpolation;
}

export interface SpatialKeyframeSnapshot {
  readonly inTangent: readonly number[];
  readonly outTangent: readonly number[];
  readonly continuous: boolean;
  readonly autoBezier: boolean;
}

export interface KeyframeCapture {
  readonly timeSeconds: number;
  readonly value: KeyframeValue;
  readonly interpolation: KeyframeInterpolationSnapshot;
  readonly temporalEase: TemporalEaseSnapshot;
  readonly temporalContinuous: boolean;
  readonly temporalAutoBezier: boolean;
  readonly spatial: SpatialKeyframeSnapshot | null;
  readonly roving: boolean;
  readonly selected: boolean;
  readonly label?: number;
}

export interface KeyframeSnapshotEntry extends KeyframeCapture {
  readonly relativeTimeSeconds: number;
}

export interface KeyframeSnapshot {
  readonly format: "motion-keyframes";
  readonly schemaVersion: 1;
  readonly property: KeyframePropertyDescriptor;
  readonly sourceStartSeconds: number;
  readonly keyframes: readonly KeyframeSnapshotEntry[];
}

export interface SnapshotValidationOptions {
  readonly timeToleranceSeconds?: number;
}

export interface KeyframeComparisonTolerance {
  readonly timeSeconds?: number;
  readonly value?: number;
  readonly easeSpeed?: number;
  readonly easeInfluence?: number;
  readonly spatialTangent?: number;
}

export interface ResolvedKeyframeComparisonTolerance {
  readonly timeSeconds: number;
  readonly value: number;
  readonly easeSpeed: number;
  readonly easeInfluence: number;
  readonly spatialTangent: number;
}

export interface KeyframeDifference {
  readonly path: string;
  readonly expected: unknown;
  readonly actual: unknown;
}

export interface KeyframeComparison {
  readonly equal: boolean;
  readonly tolerance: ResolvedKeyframeComparisonTolerance;
  readonly differences: readonly KeyframeDifference[];
}

export type SupportedFrameRate = "23.976" | "29.97" | "30" | "59.94";

export interface Timebase {
  readonly rate: SupportedFrameRate;
  readonly numerator: number;
  readonly denominator: number;
  readonly nominalFramesPerSecond: number;
  readonly dropFrame: boolean;
}

export interface TimebaseOptions {
  readonly dropFrame?: boolean;
}

export type FrameRoundingMode = "nearest" | "floor" | "ceil";

export interface AbsoluteRestoreTiming {
  readonly mode: "absolute";
}

export interface RelativeRestoreTiming {
  readonly mode: "relative";
  readonly targetStartSeconds: number;
}

export interface RestorePlanOptions {
  readonly timing?: AbsoluteRestoreTiming | RelativeRestoreTiming;
  readonly occupiedTimesSeconds?: readonly number[];
  readonly timeToleranceSeconds?: number;
}

export interface CreateRestoreStep {
  readonly phase: "create";
  readonly keyOrdinal: number;
  readonly timeSeconds: number;
  readonly relativeTimeSeconds: number;
  readonly value: KeyframeValue;
}

export interface TemporalRestoreStep {
  readonly phase: "temporal";
  readonly keyOrdinal: number;
  readonly interpolation: KeyframeInterpolationSnapshot;
  readonly temporalEase: TemporalEaseSnapshot;
  readonly temporalContinuous: boolean;
  readonly temporalAutoBezier: boolean;
}

export interface SpatialRestoreStep {
  readonly phase: "spatial";
  readonly keyOrdinal: number;
  readonly spatial: SpatialKeyframeSnapshot;
}

export interface RovingRestoreStep {
  readonly phase: "roving";
  readonly keyOrdinal: number;
  readonly roving: boolean;
}

export interface LabelRestoreStep {
  readonly phase: "label";
  readonly keyOrdinal: number;
  readonly label: number;
}

export interface SelectionRestoreStep {
  readonly phase: "selection";
  readonly keyOrdinal: number;
  readonly selected: boolean;
}

export type RestoreStep =
  | CreateRestoreStep
  | TemporalRestoreStep
  | SpatialRestoreStep
  | RovingRestoreStep
  | LabelRestoreStep
  | SelectionRestoreStep;

export interface RestorePlanTiming {
  readonly mode: "absolute" | "relative";
  readonly sourceStartSeconds: number;
  readonly targetStartSeconds: number;
}

export interface KeyframeRestorePlan {
  readonly format: "motion-keyframe-restore-plan";
  readonly schemaVersion: 1;
  readonly property: KeyframePropertyDescriptor;
  readonly timing: RestorePlanTiming;
  readonly steps: readonly RestoreStep[];
}
