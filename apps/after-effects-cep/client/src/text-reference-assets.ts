import {isMotionLibraryOptions, type MotionLibraryOptions} from "@motion/contracts";

export interface TextReferenceAsset {
  video: string; poster: string; hash: string; durationSeconds: number;
  text: string; options: MotionLibraryOptions;
}
export interface TextReferenceManifest {schemaVersion: 1; presets: Record<string, TextReferenceAsset>;}

/** Rendered assets are original local media; never accept remote URLs or paths
 * supplied by a catalog. The manifest cannot load executable content. */
export function textReferenceAsset(manifest: unknown, id: string): TextReferenceAsset | undefined {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) return;
  const root = manifest as Partial<TextReferenceManifest>;
  if (root.schemaVersion !== 1 || !root.presets || typeof root.presets !== "object") return;
  const item = root.presets[id];
  if (!item || typeof item !== "object" || !/^[a-z0-9-]+\.mp4$/.test(item.video) || !/^[a-z0-9-]+\.jpg$/.test(item.poster)
    || typeof item.hash !== "string" || !/^[a-f0-9]{64}$/i.test(item.hash) || typeof item.text !== "string" || item.text.length > 180
    || !Number.isFinite(item.durationSeconds) || item.durationSeconds <= 0 || item.durationSeconds > 60 || !isMotionLibraryOptions(item.options)) return;
  return item;
}

