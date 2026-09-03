/**
 * CHMS-012: pure keyframe snapshots and deterministic restore planning.
 *
 * Host adapters remain responsible for reading/writing Adobe objects and for
 * applying a returned plan inside one validated Undo/transaction boundary.
 */

export {
  KEYFRAME_CORE_ERROR_CODES,
  KeyframeCoreError,
  type KeyframeCoreErrorCode
} from "./errors.js";

export {
  captureKeyframeSnapshot,
  deserializeKeyframeSnapshot,
  serializeKeyframeSnapshot,
  validateKeyframeSnapshot
} from "./snapshot.js";

export { compareKeyframeSnapshots, keyframeSnapshotsEqual } from "./compare.js";

export {
  createTimebase,
  framesToSeconds,
  secondsToFrames,
  snapSecondsToFrame
} from "./timebase.js";

export { createRestorePlan, serializeRestorePlan } from "./restore-plan.js";

export type {
  AbsoluteRestoreTiming,
  CreateRestoreStep,
  FrameRoundingMode,
  KeyframeCapture,
  KeyframeComparison,
  KeyframeComparisonTolerance,
  KeyframeDifference,
  KeyframeInterpolation,
  KeyframeInterpolationSnapshot,
  KeyframePropertyDescriptor,
  KeyframeRestorePlan,
  KeyframeSnapshot,
  KeyframeSnapshotEntry,
  KeyframeValue,
  LabelRestoreStep,
  RelativeRestoreTiming,
  ResolvedKeyframeComparisonTolerance,
  RestorePlanOptions,
  RestorePlanTiming,
  RestoreStep,
  RovingRestoreStep,
  SelectionRestoreStep,
  SnapshotValidationOptions,
  SpatialKeyframeSnapshot,
  SpatialRestoreStep,
  SupportedFrameRate,
  TemporalEasePoint,
  TemporalEaseSnapshot,
  TemporalRestoreStep,
  Timebase,
  TimebaseOptions,
  CubicBezierCurve
} from "./types.js";

export { curveToTemporalEase, applyCurveToDimensions } from "./bezier.js";
