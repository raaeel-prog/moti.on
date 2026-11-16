import type { MotionLibraryPreset } from "@motion/contracts";

export interface EmulsionReferenceAsset { video: string; poster: string; durationSeconds: number; }
const references = new Map<string, EmulsionReferenceAsset>();

/** Only authored catalog IDs can resolve the pack's local, inert media. */
export function emulsionReferenceFor(preset: MotionLibraryPreset | undefined): EmulsionReferenceAsset | undefined {
  if (!preset?.filmSpec || preset.collection !== "emulsion" || preset.filmSpec.id !== preset.id || !/^[a-z][a-z0-9-]+$/.test(preset.id)) return;
  let asset = references.get(preset.id);
  if (!asset) { asset = { video: `${preset.id}.mp4`, poster: `${preset.id}.jpg`, durationSeconds: 2.4 }; references.set(preset.id, asset); }
  return asset;
}
