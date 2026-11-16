/**
 * The sample text every text preset previews with, laid out the way After
 * Effects lays out the reference render (scripts/text-presets-render.mjs):
 * centred Arial Bold in a 480x270 composition, drawn on the 320x180 card.
 *
 * One word for presets that animate letters, two words for presets that
 * animate words, two lines for presets that animate lines.
 */
import { libraryTextReference } from "@motion/contracts";

export type TextPreviewUnit = "characters" | "words" | "lines" | "all";

export interface TextPreviewSample {
  /** Source text exactly as the AE fixture types it ("\r" separates lines). */
  text: string;
  /** Font size in composition pixels at 480x270. */
  fontSize: number;
}

/** A unit as the selector sees it: its anchor on the card at rest (centre of
 * its advance, on the baseline), its line, its advance width, the column its
 * first character takes in that line and the characters the line holds
 * (spaces included, as After Effects counts them). */
export interface TextPreviewSegment { text: string; x: number; y: number; index: number; count: number; size: number; line: number; width: number; column: number; columns: number; }

/** The sample size is the size recipe distances are drawn for
 * (libraryTextReference) at the render's 270 px height: a quarter of it. */
const sample = (text: string, unit: TextPreviewUnit): TextPreviewSample => ({ text, fontSize: libraryTextReference(unit) / 4 });
const SAMPLES: Record<TextPreviewUnit, TextPreviewSample> = {
  characters: sample("MOTION", "characters"),
  all: sample("MOTION", "all"),
  words: sample("MOTION PRESETS", "words"),
  lines: sample("MOTION\rPRESETS", "lines")
};

/** Card pixels per composition pixel (320 / 480). */
export const TEXT_PREVIEW_SCALE = 2 / 3;
/** Composition centre the fixture anchors the text block on, in card pixels. */
const CENTER = { x: 160, y: 90 };
/** Arial Bold advance widths and cap height, in thousandths of an em. */
const ADVANCE: Record<string, number> = {
  A: 722, B: 722, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 556, K: 722, L: 611, M: 833,
  N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611, " ": 278, ".": 278
};
const CAP_HEIGHT = 716, LEADING = 1.2;
const advance = (c: string): number => (ADVANCE[c] ?? 556) / 1000;
const measure = (text: string, size: number): number => Array.from(text).reduce((sum, c) => sum + advance(c) * size, 0);

export function textPreviewSample(unit: TextPreviewUnit): TextPreviewSample { return SAMPLES[unit]; }

/** Baseline of each line: the caps block is centred on the composition. */
function baselines(unit: TextPreviewUnit): { lines: string[]; size: number; first: number; step: number } {
  const sample = SAMPLES[unit], size = sample.fontSize * TEXT_PREVIEW_SCALE, lines = sample.text.split("\r");
  const cap = CAP_HEIGHT / 1000 * size, step = LEADING * size;
  return { lines, size, first: CENTER.y - (cap + step * (lines.length - 1)) / 2 + cap, step };
}

/** Rest positions of each selector unit. */
export function textPreviewSegments(unit: TextPreviewUnit): TextPreviewSegment[] {
  const { lines, size, first, step } = baselines(unit);
  if (unit === "all") { const text = lines.join(" "); return [{ text, x: CENTER.x, y: first, index: 0, count: 1, size, line: 0, width: measure(text, size), column: 0, columns: Array.from(text).length }]; }
  const out: Omit<TextPreviewSegment, "count">[] = [];
  let index = 0;
  lines.forEach((line, row) => {
    const y = first + row * step, columns = Array.from(line).length;
    if (unit === "lines") { out.push({ text: line, x: CENTER.x, y, index: index++, size, line: row, width: measure(line, size), column: 0, columns }); return; }
    let cursor = CENTER.x - measure(line, size) / 2, column = 0;
    const tokens = unit === "words" ? line.match(/\S+|\s+/g) ?? [] : Array.from(line);
    for (const token of tokens) {
      const width = measure(token, size);
      if (unit === "characters" || /\S/.test(token)) out.push({ text: token, x: cursor + width / 2, y, index: index++, size, line: row, width, column, columns });
      cursor += width; column += Array.from(token).length;
    }
  });
  const count = Math.max(1, index);
  return out.map(segment => ({ ...segment, count }));
}

/**
 * Horizontal anchors under the host's centred spacing, given each unit's
 * spacing in card pixels per column: every character moves away from its line's
 * centre by its column times its unit's spacing, so a unit's anchor moves by the
 * spacing at its middle column and every line widens around its own centre.
 */
export function textPreviewSpreadX(segments: readonly TextPreviewSegment[], perColumn: readonly number[]): number[] {
  return segments.map((segment, i) => segment.x + (segment.column + (Array.from(segment.text).length - 1) / 2 - (segment.columns - 1) / 2) * (perColumn[i] ?? 0));
}

/** Each character's centre relative to the centre of the whole string. */
export function textPreviewCharCenters(text: string, size: number): number[] {
  const width = measure(text, size);
  let cursor = -width / 2;
  return Array.from(text).map(c => { const w = advance(c) * size, centre = cursor + w / 2; cursor += w; return centre; });
}

/** Bounds of the resting block on the card, for masks and reveal windows. */
export function textPreviewBounds(unit: TextPreviewUnit): { left: number; top: number; right: number; bottom: number } {
  const { lines, size, first, step } = baselines(unit), width = Math.max(...lines.map(line => measure(line, size)));
  const cap = CAP_HEIGHT / 1000 * size;
  return { left: CENTER.x - width / 2, top: first - cap, right: CENTER.x + width / 2, bottom: first + step * (lines.length - 1) };
}
