/** Direction variants of a preset card, browsed without opening its settings:
 * Alt+Up/Down walks the variants in a ring (as a variant group does in a
 * preset browser) and a small badge on the card names the chosen side. */
import { libraryDirectionAllowed, type MotionLibraryOptions, type MotionLibraryPreset } from "@motion/contracts";

export type CardDirection = MotionLibraryOptions["direction"];

/** The order the settings list shows: the recipe's own start, then the sides. */
export const DIRECTION_ORDER: readonly CardDirection[] = ["preset", "bottom", "left", "right", "top"];

/** Variants this recipe offers, in list order; "preset" is always first. */
export function cardDirections(preset: MotionLibraryPreset): CardDirection[] {
  return DIRECTION_ORDER.filter(direction => direction === "preset" || libraryDirectionAllowed(preset, direction));
}

/** The variant `step` places away from `current`, wrapping around. A current
 * value outside the list (a diagonal set in Edit) starts from "preset". */
export function cycleDirection(preset: MotionLibraryPreset, current: CardDirection | undefined, step: 1 | -1): CardDirection {
  const list = cardDirections(preset);
  if (list.length < 2) return list[0] ?? "preset";
  const index = Math.max(0, list.indexOf(current ?? "preset"));
  return list[(index + step + list.length) % list.length]!;
}

/** Where the motion comes from, drawn as the arrow pointing the way it travels. */
const GLYPHS: Partial<Record<CardDirection, string>> = { bottom: "↑", top: "↓", left: "→", right: "←" };

/** The badge text for a chosen side; none for the recipe's own start. */
export function directionBadge(direction: CardDirection | undefined): string | null {
  return direction ? GLYPHS[direction] ?? null : null;
}
