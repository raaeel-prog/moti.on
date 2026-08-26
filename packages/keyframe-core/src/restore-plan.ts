import { fail } from "./errors.js";
import {
  DEFAULT_TIME_TOLERANCE_SECONDS,
  assertExactKeys,
  assertStrictlyOrderedTimes,
  canonicalStringify,
  deepFreeze,
  readFiniteNumber,
  readNonNegativeTolerance,
  readPlainArray,
  readPlainRecord
} from "./internal.js";
import { validateKeyframeSnapshot } from "./snapshot.js";
import type {
  KeyframeRestorePlan,
  KeyframeSnapshot,
  RestorePlanOptions,
  RestoreStep
} from "./types.js";

interface ResolvedRestoreOptions {
  readonly mode: "absolute" | "relative";
  readonly targetStartSeconds: number | null;
  readonly occupiedTimesSeconds: readonly number[];
  readonly timeToleranceSeconds: number;
}

function parseRestoreOptions(input: unknown): ResolvedRestoreOptions {
  if (input === undefined) {
    return {
      mode: "absolute",
      targetStartSeconds: null,
      occupiedTimesSeconds: [],
      timeToleranceSeconds: DEFAULT_TIME_TOLERANCE_SECONDS
    };
  }

  const record = readPlainRecord(input, "$restoreOptions", "INVALID_RESTORE_OPTIONS");
  assertExactKeys(
    record,
    [],
    ["timing", "occupiedTimesSeconds", "timeToleranceSeconds"],
    "$restoreOptions",
    "INVALID_RESTORE_OPTIONS"
  );

  const timeToleranceSeconds = Object.hasOwn(record, "timeToleranceSeconds")
    ? readNonNegativeTolerance(record.timeToleranceSeconds, "$restoreOptions.timeToleranceSeconds")
    : DEFAULT_TIME_TOLERANCE_SECONDS;

  let mode: "absolute" | "relative" = "absolute";
  let targetStartSeconds: number | null = null;
  if (Object.hasOwn(record, "timing")) {
    const timing = readPlainRecord(
      record.timing,
      "$restoreOptions.timing",
      "INVALID_RESTORE_OPTIONS"
    );
    if (timing.mode === "absolute") {
      assertExactKeys(timing, ["mode"], [], "$restoreOptions.timing", "INVALID_RESTORE_OPTIONS");
    } else if (timing.mode === "relative") {
      assertExactKeys(
        timing,
        ["mode", "targetStartSeconds"],
        [],
        "$restoreOptions.timing",
        "INVALID_RESTORE_OPTIONS"
      );
      mode = "relative";
      targetStartSeconds = readFiniteNumber(
        timing.targetStartSeconds,
        "$restoreOptions.timing.targetStartSeconds"
      );
    } else {
      fail("INVALID_RESTORE_OPTIONS", "Unsupported restore timing mode.", {
        path: "$restoreOptions.timing.mode"
      });
    }
  }

  let occupiedTimesSeconds: readonly number[] = [];
  if (Object.hasOwn(record, "occupiedTimesSeconds")) {
    const source = readPlainArray(
      record.occupiedTimesSeconds,
      "$restoreOptions.occupiedTimesSeconds",
      "INVALID_RESTORE_OPTIONS"
    );
    occupiedTimesSeconds = source.map((time, index) =>
      readFiniteNumber(time, `$restoreOptions.occupiedTimesSeconds[${index}]`)
    );
    assertStrictlyOrderedTimes(
      occupiedTimesSeconds,
      timeToleranceSeconds,
      "$restoreOptions.occupiedTimesSeconds"
    );
  }

  return { mode, targetStartSeconds, occupiedTimesSeconds, timeToleranceSeconds };
}

function assertNoOccupiedConflicts(
  targetTimes: readonly number[],
  occupiedTimes: readonly number[],
  tolerance: number
): void {
  let targetIndex = 0;
  let occupiedIndex = 0;
  while (targetIndex < targetTimes.length && occupiedIndex < occupiedTimes.length) {
    const target = targetTimes[targetIndex];
    const occupied = occupiedTimes[occupiedIndex];
    if (target === undefined || occupied === undefined) break;
    const delta = target - occupied;
    if (Math.abs(delta) <= tolerance) {
      fail("KEYFRAME_CONFLICT", "A restore target collides with an existing keyframe.", {
        targetIndex,
        occupiedIndex
      });
    }
    if (delta < 0) targetIndex += 1;
    else occupiedIndex += 1;
  }
}

export function createRestorePlan(
  snapshotInput: KeyframeSnapshot,
  optionsInput?: RestorePlanOptions
): KeyframeRestorePlan {
  const options = parseRestoreOptions(optionsInput);
  const snapshot = validateKeyframeSnapshot(snapshotInput, {
    timeToleranceSeconds: options.timeToleranceSeconds
  });
  const targetStartSeconds =
    options.mode === "absolute"
      ? snapshot.sourceStartSeconds
      : options.targetStartSeconds;
  if (targetStartSeconds === null) {
    fail("INVALID_RESTORE_OPTIONS", "Relative restore requires targetStartSeconds.");
  }

  const targetTimes = snapshot.keyframes.map((keyframe, index) => {
    const timeSeconds = targetStartSeconds + keyframe.relativeTimeSeconds;
    if (!Number.isFinite(timeSeconds)) {
      fail("NON_FINITE_NUMBER", "A restore target time overflowed.", {
        path: `$restorePlan.keyframes[${index}].timeSeconds`
      });
    }
    return Object.is(timeSeconds, -0) ? 0 : timeSeconds;
  });
  assertStrictlyOrderedTimes(targetTimes, options.timeToleranceSeconds, "$restorePlan.targetTimes");
  assertNoOccupiedConflicts(
    targetTimes,
    options.occupiedTimesSeconds,
    options.timeToleranceSeconds
  );

  const steps: RestoreStep[] = [];
  snapshot.keyframes.forEach((keyframe, keyOrdinal) => {
    const timeSeconds = targetTimes[keyOrdinal];
    if (timeSeconds === undefined) return;
    steps.push({
      phase: "create",
      keyOrdinal,
      timeSeconds,
      relativeTimeSeconds: keyframe.relativeTimeSeconds,
      value: keyframe.value
    });
  });
  snapshot.keyframes.forEach((keyframe, keyOrdinal) => {
    steps.push({
      phase: "temporal",
      keyOrdinal,
      interpolation: keyframe.interpolation,
      temporalEase: keyframe.temporalEase,
      temporalContinuous: keyframe.temporalContinuous,
      temporalAutoBezier: keyframe.temporalAutoBezier
    });
  });
  if (snapshot.property.spatial) {
    snapshot.keyframes.forEach((keyframe, keyOrdinal) => {
      if (keyframe.spatial === null) {
        fail("KEYFRAME_CONFLICT", "A spatial restore step is missing spatial data.", {
          keyOrdinal
        });
      }
      steps.push({ phase: "spatial", keyOrdinal, spatial: keyframe.spatial });
    });
  }
  snapshot.keyframes.forEach((keyframe, keyOrdinal) => {
    steps.push({ phase: "roving", keyOrdinal, roving: keyframe.roving });
  });
  snapshot.keyframes.forEach((keyframe, keyOrdinal) => {
    if (keyframe.label !== undefined) {
      steps.push({ phase: "label", keyOrdinal, label: keyframe.label });
    }
  });
  snapshot.keyframes.forEach((keyframe, keyOrdinal) => {
    steps.push({ phase: "selection", keyOrdinal, selected: keyframe.selected });
  });

  return deepFreeze({
    format: "motion-keyframe-restore-plan",
    schemaVersion: 1,
    property: snapshot.property,
    timing: {
      mode: options.mode,
      sourceStartSeconds: snapshot.sourceStartSeconds,
      targetStartSeconds
    },
    steps
  });
}

export function serializeRestorePlan(plan: KeyframeRestorePlan): string {
  return canonicalStringify(plan);
}
