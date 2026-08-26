import {
  deepFreeze,
  readNonNegativeTolerance,
  readPlainRecord,
  assertExactKeys
} from "./internal.js";
import { validateKeyframeSnapshotForComparison } from "./snapshot.js";
import type {
  KeyframeComparison,
  KeyframeComparisonTolerance,
  KeyframeDifference,
  KeyframeSnapshot,
  ResolvedKeyframeComparisonTolerance,
  SpatialKeyframeSnapshot,
  TemporalEaseSnapshot
} from "./types.js";

const DEFAULT_TOLERANCE: ResolvedKeyframeComparisonTolerance = deepFreeze({
  timeSeconds: 1e-9,
  value: 1e-9,
  easeSpeed: 1e-9,
  easeInfluence: 1e-9,
  spatialTangent: 1e-9
});

function resolveTolerance(input: unknown): ResolvedKeyframeComparisonTolerance {
  if (input === undefined) return DEFAULT_TOLERANCE;
  const record = readPlainRecord(input, "$tolerance", "INVALID_TOLERANCE");
  const keys = [
    "timeSeconds",
    "value",
    "easeSpeed",
    "easeInfluence",
    "spatialTangent"
  ] as const;
  assertExactKeys(record, [], keys, "$tolerance", "INVALID_TOLERANCE");
  const resolved = { ...DEFAULT_TOLERANCE };
  for (const key of keys) {
    if (Object.hasOwn(record, key)) {
      resolved[key] = readNonNegativeTolerance(record[key], `$tolerance.${key}`);
    }
  }
  return deepFreeze(resolved);
}

function sameNumber(expected: number, actual: number, tolerance: number): boolean {
  return Math.abs(expected - actual) <= tolerance;
}

function pushDifference(
  differences: KeyframeDifference[],
  path: string,
  expected: unknown,
  actual: unknown
): void {
  differences.push(deepFreeze({ path, expected, actual }));
}

function compareNumber(
  differences: KeyframeDifference[],
  path: string,
  expected: number,
  actual: number,
  tolerance: number
): void {
  if (!sameNumber(expected, actual, tolerance)) {
    pushDifference(differences, path, expected, actual);
  }
}

function compareExact(
  differences: KeyframeDifference[],
  path: string,
  expected: unknown,
  actual: unknown
): void {
  if (!Object.is(expected, actual)) pushDifference(differences, path, expected, actual);
}

function compareVector(
  differences: KeyframeDifference[],
  path: string,
  expected: number | readonly number[],
  actual: number | readonly number[],
  tolerance: number
): void {
  if (typeof expected === "number" || typeof actual === "number") {
    if (typeof expected !== "number" || typeof actual !== "number") {
      pushDifference(differences, path, expected, actual);
      return;
    }
    compareNumber(differences, path, expected, actual, tolerance);
    return;
  }
  if (expected.length !== actual.length) {
    pushDifference(differences, path, expected, actual);
    return;
  }
  for (let index = 0; index < expected.length; index += 1) {
    const expectedValue = expected[index];
    const actualValue = actual[index];
    if (expectedValue !== undefined && actualValue !== undefined) {
      compareNumber(differences, `${path}[${index}]`, expectedValue, actualValue, tolerance);
    }
  }
}

function compareEase(
  differences: KeyframeDifference[],
  path: string,
  expected: TemporalEaseSnapshot,
  actual: TemporalEaseSnapshot,
  tolerance: ResolvedKeyframeComparisonTolerance
): void {
  for (const direction of ["in", "out"] as const) {
    if (expected[direction].length !== actual[direction].length) {
      pushDifference(differences, `${path}.${direction}`, expected[direction], actual[direction]);
      continue;
    }
    for (let index = 0; index < expected[direction].length; index += 1) {
      const expectedPoint = expected[direction][index];
      const actualPoint = actual[direction][index];
      if (expectedPoint === undefined || actualPoint === undefined) continue;
      compareNumber(
        differences,
        `${path}.${direction}[${index}].speed`,
        expectedPoint.speed,
        actualPoint.speed,
        tolerance.easeSpeed
      );
      compareNumber(
        differences,
        `${path}.${direction}[${index}].influence`,
        expectedPoint.influence,
        actualPoint.influence,
        tolerance.easeInfluence
      );
    }
  }
}

function compareSpatial(
  differences: KeyframeDifference[],
  path: string,
  expected: SpatialKeyframeSnapshot | null,
  actual: SpatialKeyframeSnapshot | null,
  tolerance: ResolvedKeyframeComparisonTolerance
): void {
  if (expected === null || actual === null) {
    if (expected !== actual) pushDifference(differences, path, expected, actual);
    return;
  }
  compareVector(
    differences,
    `${path}.inTangent`,
    expected.inTangent,
    actual.inTangent,
    tolerance.spatialTangent
  );
  compareVector(
    differences,
    `${path}.outTangent`,
    expected.outTangent,
    actual.outTangent,
    tolerance.spatialTangent
  );
  compareExact(differences, `${path}.continuous`, expected.continuous, actual.continuous);
  compareExact(differences, `${path}.autoBezier`, expected.autoBezier, actual.autoBezier);
}

export function compareKeyframeSnapshots(
  expectedInput: KeyframeSnapshot,
  actualInput: KeyframeSnapshot,
  toleranceInput?: KeyframeComparisonTolerance
): KeyframeComparison {
  const tolerance = resolveTolerance(toleranceInput);
  const expected = validateKeyframeSnapshotForComparison(expectedInput, tolerance.timeSeconds);
  const actual = validateKeyframeSnapshotForComparison(actualInput, tolerance.timeSeconds);
  const differences: KeyframeDifference[] = [];

  compareExact(differences, "format", expected.format, actual.format);
  compareExact(differences, "schemaVersion", expected.schemaVersion, actual.schemaVersion);
  compareExact(
    differences,
    "property.valueDimensions",
    expected.property.valueDimensions,
    actual.property.valueDimensions
  );
  compareExact(
    differences,
    "property.temporalEaseDimensions",
    expected.property.temporalEaseDimensions,
    actual.property.temporalEaseDimensions
  );
  compareExact(differences, "property.spatial", expected.property.spatial, actual.property.spatial);
  compareNumber(
    differences,
    "sourceStartSeconds",
    expected.sourceStartSeconds,
    actual.sourceStartSeconds,
    tolerance.timeSeconds
  );

  if (expected.keyframes.length !== actual.keyframes.length) {
    pushDifference(
      differences,
      "keyframes.length",
      expected.keyframes.length,
      actual.keyframes.length
    );
  }
  const length = Math.min(expected.keyframes.length, actual.keyframes.length);
  for (let index = 0; index < length; index += 1) {
    const expectedKey = expected.keyframes[index];
    const actualKey = actual.keyframes[index];
    if (expectedKey === undefined || actualKey === undefined) continue;
    const path = `keyframes[${index}]`;
    compareNumber(
      differences,
      `${path}.timeSeconds`,
      expectedKey.timeSeconds,
      actualKey.timeSeconds,
      tolerance.timeSeconds
    );
    compareNumber(
      differences,
      `${path}.relativeTimeSeconds`,
      expectedKey.relativeTimeSeconds,
      actualKey.relativeTimeSeconds,
      tolerance.timeSeconds
    );
    compareVector(differences, `${path}.value`, expectedKey.value, actualKey.value, tolerance.value);
    compareExact(
      differences,
      `${path}.interpolation.in`,
      expectedKey.interpolation.in,
      actualKey.interpolation.in
    );
    compareExact(
      differences,
      `${path}.interpolation.out`,
      expectedKey.interpolation.out,
      actualKey.interpolation.out
    );
    compareEase(differences, `${path}.temporalEase`, expectedKey.temporalEase, actualKey.temporalEase, tolerance);
    compareExact(
      differences,
      `${path}.temporalContinuous`,
      expectedKey.temporalContinuous,
      actualKey.temporalContinuous
    );
    compareExact(
      differences,
      `${path}.temporalAutoBezier`,
      expectedKey.temporalAutoBezier,
      actualKey.temporalAutoBezier
    );
    compareSpatial(differences, `${path}.spatial`, expectedKey.spatial, actualKey.spatial, tolerance);
    compareExact(differences, `${path}.roving`, expectedKey.roving, actualKey.roving);
    compareExact(differences, `${path}.selected`, expectedKey.selected, actualKey.selected);
    const expectedHasLabel = Object.hasOwn(expectedKey, "label");
    const actualHasLabel = Object.hasOwn(actualKey, "label");
    if (expectedHasLabel !== actualHasLabel || (expectedHasLabel && expectedKey.label !== actualKey.label)) {
      pushDifference(differences, `${path}.label`, expectedKey.label, actualKey.label);
    }
  }

  return deepFreeze({
    equal: differences.length === 0,
    tolerance,
    differences
  });
}

export function keyframeSnapshotsEqual(
  expected: KeyframeSnapshot,
  actual: KeyframeSnapshot,
  tolerance?: KeyframeComparisonTolerance
): boolean {
  return compareKeyframeSnapshots(expected, actual, tolerance).equal;
}
