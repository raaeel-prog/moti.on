import { protectedWrite, parsesAs } from "./storage-safety.js";
// Curve catalog adapted from the user's FX STUDIO/FxFlow, with permission.
export interface EaseCurve { x1: number; y1: number; x2: number; y2: number }
export interface EasePreset { id: string; name: string; curve: EaseCurve; custom?: boolean }
export const EASE_PRESETS: EasePreset[] = [
  { id: "ease", name: "Ease", curve: { x1: 0.25, y1: 0.1, x2: 0.25, y2: 1.0 } },
  { id: "linear", name: "Linear", curve: { x1: 0.0, y1: 0.0, x2: 1.0, y2: 1.0 } },
  { id: "sine-in", name: "Sine In", curve: { x1: 0.12, y1: 0.0, x2: 0.39, y2: 0.0 } },
  { id: "sine-out", name: "Sine Out", curve: { x1: 0.61, y1: 1.0, x2: 0.88, y2: 1.0 } },
  { id: "sine-in-out", name: "Sine", curve: { x1: 0.37, y1: 0.0, x2: 0.63, y2: 1.0 } },
  { id: "quad-in", name: "Quad In", curve: { x1: 0.11, y1: 0.0, x2: 0.5, y2: 0.0 } },
  { id: "quad-out", name: "Quad Out", curve: { x1: 0.5, y1: 1.0, x2: 0.89, y2: 1.0 } },
  { id: "quad-in-out", name: "Quad", curve: { x1: 0.45, y1: 0.0, x2: 0.55, y2: 1.0 } },
  { id: "cubic-in", name: "Cubic In", curve: { x1: 0.32, y1: 0.0, x2: 0.67, y2: 0.0 } },
  { id: "cubic-out", name: "Cubic Out", curve: { x1: 0.33, y1: 1.0, x2: 0.68, y2: 1.0 } },
  { id: "cubic-in-out", name: "Cubic", curve: { x1: 0.65, y1: 0.0, x2: 0.35, y2: 1.0 } },
  { id: "quart-in", name: "Quart In", curve: { x1: 0.5, y1: 0.0, x2: 0.75, y2: 0.0 } },
  { id: "quart-out", name: "Quart Out", curve: { x1: 0.25, y1: 1.0, x2: 0.5, y2: 1.0 } },
  { id: "quart-in-out", name: "Quart", curve: { x1: 0.76, y1: 0.0, x2: 0.24, y2: 1.0 } },
  { id: "quint-in", name: "Quint In", curve: { x1: 0.64, y1: 0.0, x2: 0.78, y2: 0.0 } },
  { id: "quint-out", name: "Quint Out", curve: { x1: 0.22, y1: 1.0, x2: 0.36, y2: 1.0 } },
  { id: "quint-in-out", name: "Quint", curve: { x1: 0.83, y1: 0.0, x2: 0.17, y2: 1.0 } },
  { id: "expo-in", name: "Expo In", curve: { x1: 0.7, y1: 0.0, x2: 0.84, y2: 0.0 } },
  { id: "expo-out", name: "Expo Out", curve: { x1: 0.16, y1: 1.0, x2: 0.3, y2: 1.0 } },
  { id: "expo-in-out", name: "Expo", curve: { x1: 0.87, y1: 0.0, x2: 0.13, y2: 1.0 } },
  { id: "circ-in", name: "Circ In", curve: { x1: 0.55, y1: 0.0, x2: 1.0, y2: 0.45 } },
  { id: "circ-out", name: "Circ Out", curve: { x1: 0.0, y1: 0.55, x2: 0.45, y2: 1.0 } },
  { id: "circ-in-out", name: "Circ", curve: { x1: 0.85, y1: 0.0, x2: 0.15, y2: 1.0 } },
  { id: "back-in", name: "Back In", curve: { x1: 0.36, y1: 0.0, x2: 0.66, y2: -0.56 } },
  { id: "back-out", name: "Back Out", curve: { x1: 0.34, y1: 1.56, x2: 0.64, y2: 1.0 } },
  { id: "back-in-out", name: "Back", curve: { x1: 0.68, y1: -0.6, x2: 0.32, y2: 1.6 } },
  { id: "snappy", name: "Snappy", curve: { x1: 0.2, y1: 0.9, x2: 0.1, y2: 1.0 } },
  { id: "soft-land", name: "Soft Land", curve: { x1: 0.16, y1: 0.84, x2: 0.24, y2: 1.0 } },
];
export const EASE_STORAGE_KEY = "motion.ease.library.v1";
export interface EaseLibrary { custom: EasePreset[]; favorites: string[] }
export function validCurve(value: unknown): value is EaseCurve {
  if (!value || typeof value !== "object") return false;
  const c = value as EaseCurve;
  return [c.x1, c.y1, c.x2, c.y2].every(v => typeof v === "number" && Number.isFinite(v)) &&
    c.x1 >= 0 && c.x1 <= 1 && c.x2 >= 0 && c.x2 <= 1 && c.y1 >= -1 && c.y1 <= 2 && c.y2 >= -1 && c.y2 <= 2;
}
const validCustomEase = (p: EasePreset): boolean => Boolean(p) && typeof p.id === "string" && p.id.startsWith("custom-") && typeof p.name === "string" && p.name.length <= 80 && validCurve(p.curve);
export function readEaseLibrary(storage: Pick<Storage, "getItem"> | undefined): EaseLibrary {
  try {
    const raw = JSON.parse(storage?.getItem(EASE_STORAGE_KEY) ?? "{}");
    return {
      custom: Array.isArray(raw.custom) ? raw.custom.filter(validCustomEase).slice(0, 200) : [],
      favorites: Array.isArray(raw.favorites) ? raw.favorites.filter((id: unknown) => typeof id === "string").slice(0, 228) : []
    };
  } catch { return { custom: [], favorites: [] }; }
}
/** Grava preservando o anterior (storage-safety.ts). */
export function writeEaseLibrary(storage: Pick<Storage, "getItem" | "setItem"> | undefined, library: EaseLibrary): boolean {
  return protectedWrite(storage, EASE_STORAGE_KEY, JSON.stringify(library), raw => parsesAs(raw, value => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const data = value as { custom?: unknown; favorites?: unknown };
    return (data.custom === undefined || (Array.isArray(data.custom) && data.custom.length <= 200 && data.custom.every(item => validCustomEase(item as EasePreset))))
      && (data.favorites === undefined || (Array.isArray(data.favorites) && data.favorites.every(id => typeof id === "string")));
  }));
}
export const DEFAULT_EASE_BUILD = { durationFrames: 15, useOpacity: true, opacityFrom: 0, opacityTo: 100,
  useScale: false, scaleFrom: 86, scaleTo: 100, useRotation: false, rotationFrom: -8, rotationTo: 0,
  usePosition: false, posFromX: 0, posFromY: 80, posToX: 0, posToY: 0 };
export type EaseBuild = typeof DEFAULT_EASE_BUILD;
/** Live apply flag, persisted per panel (preferences drafts are overwritten wholesale elsewhere). */
export const EASE_LIVE_KEY = "motion.ease.live.v1";
export function readEaseLive(storage: Pick<Storage, "getItem"> | undefined): boolean {
  try { return storage?.getItem(EASE_LIVE_KEY) === "1"; } catch { return false; }
}
export function writeEaseLive(storage: Pick<Storage, "getItem" | "setItem"> | undefined, live: boolean): boolean {
  return protectedWrite(storage, EASE_LIVE_KEY, live ? "1" : "0", raw => raw === "1" || raw === "0");
}
/** "Open Quick ease when keyframes are selected" — off by default, standalone key. */
export const EASE_AUTO_OPEN_KEY = "motion.ease.autoOpen.v1";
export function readEaseAutoOpen(storage: Pick<Storage, "getItem"> | undefined): boolean {
  try { return storage?.getItem(EASE_AUTO_OPEN_KEY) === "1"; } catch { return false; }
}
export function writeEaseAutoOpen(storage: Pick<Storage, "getItem" | "setItem"> | undefined, value: boolean): boolean {
  return protectedWrite(storage, EASE_AUTO_OPEN_KEY, value ? "1" : "0", raw => raw === "1" || raw === "0");
}
