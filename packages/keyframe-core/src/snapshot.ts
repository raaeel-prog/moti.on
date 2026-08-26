import { fail } from "./errors.js";
import {
  DEFAULT_TIME_TOLERANCE_SECONDS,
  assertExactKeys,
  assertStrictlyOrderedTimes,
  canonicalStringify,
  deepFreeze,
  readBoolean,
  readFiniteNumber,
  readNonNegativeTolerance,
  readPlainArray,
  readPlainRecord
} from "./internal.js";
import type {
  KeyframeCapture,
  KeyframeInterpolation,
  KeyframeInterpolationSnapshot,
  KeyframePropertyDescriptor,
  KeyframeSnapshot,
  KeyframeSnapshotEntry,
  KeyframeValue,
  SnapshotValidationOptions,
  SpatialKeyframeSnapshot,
  TemporalEasePoint,
  TemporalEaseSnapshot
} from "./types.js";

const MAX_SERIALIZED_CHARACTERS = 2 * 1024 * 1024;
const INTERPOLATIONS = new Set<KeyframeInterpolation>(["linear", "bezier", "hold"]);

function resolveTimeTolerance(options: unknown): number {
  if (options === undefined) return DEFAULT_TIME_TOLERANCE_SECONDS;
  const record = readPlainRecord(options, "$options", "INVALID_TOLERANCE");
  assertExactKeys(record, [], ["timeToleranceSeconds"], "$options", "INVALID_TOLERANCE");
  if (!Object.hasOwn(record, "timeToleranceSeconds")) return DEFAULT_TIME_TOLERANCE_SECONDS;
  return readNonNegativeTolerance(record.timeToleranceSeconds, "$options.timeToleranceSeconds");
}

function parsePropertyDescriptor(value: unknown): KeyframePropertyDescriptor {
  const record = readPlainRecord(value, "$snapshot.property");
  assertExactKeys(
    record,
    ["valueDimensions", "temporalEaseDimensions", "spatial"],
    [],
    "$snapshot.property"
  );

  const valueDimensions = record.valueDimensions;
  const temporalEaseDimensions = record.temporalEaseDimensions;
  const spatial = readBoolean(record.spatial, "$snapshot.property.spatial");
  if (
    typeof valueDimensions !== "number" ||
    !Number.isInteger(valueDimensions) ||
    valueDimensions < 1 ||
    valueDimensions > 4 ||
    typeof temporalEaseDimensions !== "number" ||
    !Number.isInteger(temporalEaseDimensions) ||
    temporalEaseDimensions < 1 ||
    temporalEaseDimensions > valueDimensions ||
    (spatial && valueDimensions !== 2 && valueDimensions !== 3)
  ) {
    fail("INVALID_DIMENSIONALITY", "The property descriptor has impossible dimensions.", {
      path: "$snapshot.property"
    });
  }

  return { valueDimensions, temporalEaseDimensions, spatial };
}

function parseInterpolation(value: unknown, path: string): KeyframeInterpolationSnapshot {
  const record = readPlainRecord(value, path, "INVALID_INTERPOLATION");
  assertExactKeys(record, ["in", "out"], [], path, "INVALID_INTERPOLATION");
  if (
    typeof record.in !== "string" ||
    !INTERPOLATIONS.has(record.in as KeyframeInterpolation) ||
    typeof record.out !== "string" ||
    !INTERPOLATIONS.has(record.out as KeyframeInterpolation)
  ) {
    fail("INVALID_INTERPOLATION", `${path} contains an unsupported interpolation.`, { path });
  }
  return {
    in: record.in as KeyframeInterpolation,
    out: record.out as KeyframeInterpolation
  };
}

function parseEasePoint(value: unknown, path: string): TemporalEasePoint {
  const record = readPlainRecord(value, path, "INVALID_TEMPORAL_EASE");
  assertExactKeys(record, ["speed", "influence"], [], path, "INVALID_TEMPORAL_EASE");
  const speed = readFiniteNumber(record.speed, `${path}.speed`);
  const influence = readFiniteNumber(record.influence, `${path}.influence`);
  if (influence < 0.1 || influence > 100) {
    fail("INVALID_TEMPORAL_EASE", `${path}.influence must be between 0.1 and 100.`, {
      path: `${path}.influence`
    });
  }
  return { speed, influence };
}

function parseEaseArray(value: unknown, dimensions: number, path: string): readonly TemporalEasePoint[] {
  const source = readPlainArray(value, path, "INVALID_TEMPORAL_EASE");
  if (source.length !== dimensions) {
    fail("INVALID_TEMPORAL_EASE", `${path} does not match temporalEaseDimensions.`, { path });
  }
  return source.map((point, index) => parseEasePoint(point, `${path}[${index}]`));
}

function parseTemporalEase(
  value: unknown,
  dimensions: number,
  path: string
): TemporalEaseSnapshot {
  const record = readPlainRecord(value, path, "INVALID_TEMPORAL_EASE");
  assertExactKeys(record, ["in", "out"], [], path, "INVALID_TEMPORAL_EASE");
  return {
    in: parseEaseArray(record.in, dimensions, `${path}.in`),
    out: parseEaseArray(record.out, dimensions, `${path}.out`)
  };
}

function parseNumericVector(value: unknown, dimensions: number, path: string): readonly number[] {
  const source = readPlainArray(value, path, "INVALID_DIMENSIONALITY");
  if (source.length !== dimensions) {
    fail("INVALID_DIMENSIONALITY", `${path} does not match valueDimensions.`, { path });
  }
  return source.map((component, index) => readFiniteNumber(component, `${path}[${index}]`));
}

function parseValue(value: unknown, dimensions: number, path: string): KeyframeValue {
  if (dimensions === 1) {
    if (Array.isArray(value)) {
      fail("INVALID_DIMENSIONALITY", `${path} must be scalar.`, { path });
    }
    return readFiniteNumber(value, path);
  }
  return parseNumericVector(value, dimensions, path);
}

function parseSpatial(
  value: unknown,
  descriptor: KeyframePropertyDescriptor,
  path: string
): SpatialKeyframeSnapshot | null {
  if (!descriptor.spatial) {
    if (value !== null) {
      fail("KEYFRAME_CONFLICT", `${path} is present for a non-spatial property.`, { path });
    }
    return null;
  }
  if (value === null) {
    fail("KEYFRAME_CONFLICT", `${path} is required for a spatial property.`, { path });
  }

  const record = readPlainRecord(value, path, "INVALID_SPATIAL_DATA");
  assertExactKeys(
    record,
    ["inTangent", "outTangent", "continuous", "autoBezier"],
    [],
    path,
    "INVALID_SPATIAL_DATA"
  );
  const parseTangent = (candidate: unknown, tangentPath: string): readonly number[] => {
    const source = readPlainArray(candidate, tangentPath, "INVALID_SPATIAL_DATA");
    if (source.length !== descriptor.valueDimensions) {
      fail("INVALID_SPATIAL_DATA", `${tangentPath} does not match valueDimensions.`, {
        path: tangentPath
      });
    }
    return source.map((component, index) =>
      readFiniteNumber(component, `${tangentPath}[${index}]`)
    );
  };

  return {
    inTangent: parseTangent(record.inTangent, `${path}.inTangent`),
    outTangent: parseTangent(record.outTangent, `${path}.outTangent`),
    continuous: readBoolean(record.continuous, `${path}.continuous`, "INVALID_SPATIAL_DATA"),
    autoBezier: readBoolean(record.autoBezier, `${path}.autoBezier`, "INVALID_SPATIAL_DATA")
  };
}

function parseLabel(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 16) {
    fail("KEYFRAME_CONFLICT", `${path} must be an integer from 0 through 16.`, { path });
  }
  return value;
}

function parseKeyframe(
  value: unknown,
  descriptor: KeyframePropertyDescriptor,
  path: string,
  withRelativeTime: boolean
): KeyframeSnapshotEntry {
  const record = readPlainRecord(value, path);
  const required = [
    "timeSeconds",
    "value",
    "interpolation",
    "temporalEase",
    "temporalContinuous",
    "temporalAutoBezier",
    "spatial",
    "roving",
    "selected"
  ];
  if (withRelativeTime) required.push("relativeTimeSeconds");
  assertExactKeys(record, required, ["label"], path);

  const timeSeconds = readFiniteNumber(record.timeSeconds, `${path}.timeSeconds`);
  const interpolation = parseInterpolation(record.interpolation, `${path}.interpolation`);
  const spatial = parseSpatial(record.spatial, descriptor, `${path}.spatial`);
  const temporalAutoBezier = readBoolean(
    record.temporalAutoBezier,
    `${path}.temporalAutoBezier`
  );
  if (
    temporalAutoBezier &&
    (interpolation.in === "hold" || interpolation.out === "hold")
  ) {
    fail("KEYFRAME_CONFLICT", "Temporal auto-Bezier conflicts with HOLD interpolation.", {
      path
    });
  }

  const roving = readBoolean(record.roving, `${path}.roving`);
  if (roving && !descriptor.spatial) {
    fail("KEYFRAME_CONFLICT", "Roving is only valid for spatial properties.", {
      path: `${path}.roving`
    });
  }

  const base = {
    timeSeconds,
    relativeTimeSeconds: withRelativeTime
      ? readFiniteNumber(record.relativeTimeSeconds, `${path}.relativeTimeSeconds`)
      : 0,
    value: parseValue(record.value, descriptor.valueDimensions, `${path}.value`),
    interpolation,
    temporalEase: parseTemporalEase(
      record.temporalEase,
      descriptor.temporalEaseDimensions,
      `${path}.temporalEase`
    ),
    temporalContinuous: readBoolean(
      record.temporalContinuous,
      `${path}.temporalContinuous`
    ),
    temporalAutoBezier,
    spatial,
    roving,
    selected: readBoolean(record.selected, `${path}.selected`)
  } satisfies Omit<KeyframeSnapshotEntry, "label">;

  if (Object.hasOwn(record, "label")) {
    return { ...base, label: parseLabel(record.label, `${path}.label`) };
  }
  return base;
}

function validateRovingBoundaries(keyframes: readonly KeyframeSnapshotEntry[]): void {
  if (keyframes.length === 0) return;
  const first = keyframes[0];
  const last = keyframes[keyframes.length - 1];
  if (first?.roving) {
    fail("KEYFRAME_CONFLICT", "The first keyframe cannot rove.", {
      path: "$snapshot.keyframes[0].roving"
    });
  }
  if (last?.roving) {
    fail("KEYFRAME_CONFLICT", "The last keyframe cannot rove.", {
      path: `$snapshot.keyframes[${keyframes.length - 1}].roving`
    });
  }
}

function validateKeyframeSnapshotWithTolerances(
  input: unknown,
  relativeTolerance: number,
  orderingTolerance: number
): KeyframeSnapshot {
  const record = readPlainRecord(input, "$snapshot");
  assertExactKeys(
    record,
    ["format", "schemaVersion", "property", "sourceStartSeconds", "keyframes"],
    [],
    "$snapshot"
  );
  if (record.format !== "motion-keyframes") {
    fail("INVALID_SNAPSHOT", "Unsupported keyframe snapshot format.", { path: "$snapshot.format" });
  }
  if (record.schemaVersion !== 1) {
    fail("UNSUPPORTED_SCHEMA_VERSION", "Unsupported keyframe snapshot schema version.", {
      path: "$snapshot.schemaVersion"
    });
  }

  const property = parsePropertyDescriptor(record.property);
  const sourceStartSeconds = readFiniteNumber(
    record.sourceStartSeconds,
    "$snapshot.sourceStartSeconds"
  );
  const sourceKeyframes = readPlainArray(record.keyframes, "$snapshot.keyframes");
  if (sourceKeyframes.length === 0) {
    fail("INVALID_SNAPSHOT", "A keyframe snapshot must contain at least one keyframe.", {
      path: "$snapshot.keyframes"
    });
  }

  const keyframes = sourceKeyframes.map((keyframe, index) =>
    parseKeyframe(keyframe, property, `$snapshot.keyframes[${index}]`, true)
  );
  assertStrictlyOrderedTimes(
    keyframes.map((keyframe) => keyframe.timeSeconds),
    orderingTolerance,
    "$snapshot.keyframes"
  );
  validateRovingBoundaries(keyframes);

  for (let index = 0; index < keyframes.length; index += 1) {
    const keyframe = keyframes[index];
    if (keyframe === undefined) continue;
    const expected = keyframe.timeSeconds - sourceStartSeconds;
    if (Math.abs(keyframe.relativeTimeSeconds - expected) > relativeTolerance) {
      fail("KEYFRAME_CONFLICT", "Relative timing conflicts with absolute timing.", {
        path: `$snapshot.keyframes[${index}].relativeTimeSeconds`
      });
    }
  }

  return deepFreeze({
    format: "motion-keyframes",
    schemaVersion: 1,
    property,
    sourceStartSeconds,
    keyframes
  });
}

export function validateKeyframeSnapshot(
  input: unknown,
  options?: SnapshotValidationOptions
): KeyframeSnapshot {
  const tolerance = resolveTimeTolerance(options);
  return validateKeyframeSnapshotWithTolerances(input, tolerance, tolerance);
}

/**
 * Comparacao pode aceitar um delta temporal largo sem transformar duas keys
 * validas e proximas em duplicatas. Nao faz parte da API publica do package;
 * existe apenas para o comparador usar tolerancias independentes.
 */
export function validateKeyframeSnapshotForComparison(
  input: unknown,
  relativeTolerance: number
): KeyframeSnapshot {
  return validateKeyframeSnapshotWithTolerances(
    input,
    relativeTolerance,
    DEFAULT_TIME_TOLERANCE_SECONDS
  );
}

export function captureKeyframeSnapshot(
  propertyInput: KeyframePropertyDescriptor,
  keyframeInput: readonly KeyframeCapture[],
  options?: SnapshotValidationOptions
): KeyframeSnapshot {
  const tolerance = resolveTimeTolerance(options);
  const property = parsePropertyDescriptor(propertyInput);
  const source = readPlainArray(keyframeInput, "$capture.keyframes");
  if (source.length === 0) {
    fail("INVALID_SNAPSHOT", "A keyframe snapshot must contain at least one keyframe.", {
      path: "$capture.keyframes"
    });
  }

  const parsed = source.map((keyframe, index) =>
    parseKeyframe(keyframe, property, `$capture.keyframes[${index}]`, false)
  );
  assertStrictlyOrderedTimes(
    parsed.map((keyframe) => keyframe.timeSeconds),
    tolerance,
    "$capture.keyframes"
  );
  validateRovingBoundaries(parsed);

  const sourceStartSeconds = parsed[0]?.timeSeconds;
  if (sourceStartSeconds === undefined) {
    fail("INVALID_SNAPSHOT", "A keyframe snapshot must contain at least one keyframe.");
  }
  const keyframes = parsed.map((keyframe) => ({
    ...keyframe,
    relativeTimeSeconds: keyframe.timeSeconds - sourceStartSeconds
  }));

  return validateKeyframeSnapshot(
    {
      format: "motion-keyframes",
      schemaVersion: 1,
      property,
      sourceStartSeconds,
      keyframes
    },
    { timeToleranceSeconds: tolerance }
  );
}

export function serializeKeyframeSnapshot(snapshot: KeyframeSnapshot): string {
  return canonicalStringify(validateKeyframeSnapshot(snapshot));
}

export function deserializeKeyframeSnapshot(serialized: string): KeyframeSnapshot {
  if (typeof serialized !== "string") {
    fail("INVALID_SERIALIZATION", "Serialized keyframes must be a string.");
  }
  if (serialized.length > MAX_SERIALIZED_CHARACTERS) {
    fail("SERIALIZATION_TOO_LARGE", "Serialized keyframes exceed the safe size limit.", {
      maxCharacters: MAX_SERIALIZED_CHARACTERS
    });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized) as unknown;
  } catch {
    fail("INVALID_SERIALIZATION", "Serialized keyframes are not valid JSON.");
  }

  if (canonicalStringify(parsed) !== serialized) {
    fail("NON_CANONICAL_SERIALIZATION", "Serialized keyframes are not canonical.");
  }
  return validateKeyframeSnapshot(parsed);
}
