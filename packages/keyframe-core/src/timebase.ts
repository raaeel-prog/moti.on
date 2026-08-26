import { fail } from "./errors.js";
import {
  assertExactKeys,
  deepFreeze,
  readBoolean,
  readFiniteNumber,
  readPlainRecord
} from "./internal.js";
import type {
  FrameRoundingMode,
  SupportedFrameRate,
  Timebase,
  TimebaseOptions
} from "./types.js";

const DEFINITIONS = {
  "23.976": { numerator: 24_000, denominator: 1_001, nominalFramesPerSecond: 24 },
  "29.97": { numerator: 30_000, denominator: 1_001, nominalFramesPerSecond: 30 },
  "30": { numerator: 30, denominator: 1, nominalFramesPerSecond: 30 },
  "59.94": { numerator: 60_000, denominator: 1_001, nominalFramesPerSecond: 60 }
} as const;

const DROP_FRAME_RATES = new Set<SupportedFrameRate>(["29.97", "59.94"]);

function isSupportedRate(value: unknown): value is SupportedFrameRate {
  return typeof value === "string" && Object.hasOwn(DEFINITIONS, value);
}

function parseOptions(options: unknown): boolean {
  if (options === undefined) return false;
  const record = readPlainRecord(options, "$timebaseOptions", "INVALID_TIMEBASE");
  assertExactKeys(record, [], ["dropFrame"], "$timebaseOptions", "INVALID_TIMEBASE");
  if (!Object.hasOwn(record, "dropFrame")) return false;
  return readBoolean(record.dropFrame, "$timebaseOptions.dropFrame", "INVALID_TIMEBASE");
}

export function createTimebase(rate: SupportedFrameRate, options?: TimebaseOptions): Timebase;
export function createTimebase(rate: unknown, options?: unknown): Timebase;
export function createTimebase(rate: unknown, options?: unknown): Timebase {
  if (!isSupportedRate(rate)) {
    fail("INVALID_TIMEBASE", "The frame rate is not one of the supported canonical rates.", {
      path: "$rate"
    });
  }
  const dropFrame = parseOptions(options);
  if (dropFrame && !DROP_FRAME_RATES.has(rate)) {
    fail("INVALID_DROP_FRAME", "Drop-frame timecode is only valid for 29.97 or 59.94.", {
      rate
    });
  }
  const definition = DEFINITIONS[rate];
  return deepFreeze({ rate, ...definition, dropFrame });
}

function validateTimebase(input: unknown): Timebase {
  const record = readPlainRecord(input, "$timebase", "INVALID_TIMEBASE");
  assertExactKeys(
    record,
    ["rate", "numerator", "denominator", "nominalFramesPerSecond", "dropFrame"],
    [],
    "$timebase",
    "INVALID_TIMEBASE"
  );
  if (!isSupportedRate(record.rate)) {
    fail("INVALID_TIMEBASE", "The timebase rate is unsupported.", { path: "$timebase.rate" });
  }
  const expected = createTimebase(record.rate, { dropFrame: record.dropFrame === true });
  if (
    record.numerator !== expected.numerator ||
    record.denominator !== expected.denominator ||
    record.nominalFramesPerSecond !== expected.nominalFramesPerSecond ||
    record.dropFrame !== expected.dropFrame
  ) {
    fail("INVALID_TIMEBASE", "The timebase fields conflict with its canonical rate.", {
      path: "$timebase"
    });
  }
  return expected;
}

export function secondsToFrames(secondsInput: number, timebaseInput: Timebase): number {
  const seconds = readFiniteNumber(secondsInput, "$seconds");
  const timebase = validateTimebase(timebaseInput);
  const frames = (seconds * timebase.numerator) / timebase.denominator;
  if (!Number.isFinite(frames)) {
    fail("NON_FINITE_NUMBER", "The frame conversion overflowed.", { path: "$frames" });
  }
  return Object.is(frames, -0) ? 0 : frames;
}

export function framesToSeconds(framesInput: number, timebaseInput: Timebase): number {
  const frames = readFiniteNumber(framesInput, "$frames");
  const timebase = validateTimebase(timebaseInput);
  const seconds = (frames * timebase.denominator) / timebase.numerator;
  if (!Number.isFinite(seconds)) {
    fail("NON_FINITE_NUMBER", "The seconds conversion overflowed.", { path: "$seconds" });
  }
  return Object.is(seconds, -0) ? 0 : seconds;
}

export function snapSecondsToFrame(
  secondsInput: number,
  timebaseInput: Timebase,
  mode: FrameRoundingMode
): number {
  if (mode !== "nearest" && mode !== "floor" && mode !== "ceil") {
    fail("INVALID_ROUNDING_MODE", "Unsupported frame rounding mode.", { path: "$mode" });
  }
  const frames = secondsToFrames(secondsInput, timebaseInput);
  const rounded = mode === "nearest" ? Math.round(frames) : mode === "floor" ? Math.floor(frames) : Math.ceil(frames);
  return framesToSeconds(rounded, timebaseInput);
}
