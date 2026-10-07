import type { QuickContext } from "@motion/contracts";

/** Order matches the preset menu on the central orbit null. */
export const ORBIT_PRESETS = [
  "frontal", "horizontal", "vertical", "diagonal", "reverseDiagonal", "side", "sphere", "tiltedSphere"
] as const;

export type OrbitPreset = typeof ORBIT_PRESETS[number];
export type OrbitTargetMode = "newController" | "reuseController";

export interface OrbitDraft {
  preset: OrbitPreset;
  radius: number;
  speed: number;
  inclination: number;
  azimuth: number;
  bank: number;
  phase: number;
  spread: number;
  targetMode: OrbitTargetMode;
  faceTarget: boolean;
  bake: boolean;
}

export const DEFAULT_ORBIT: Readonly<OrbitDraft> = Object.freeze({
  preset: "frontal",
  radius: 300,
  speed: 60,
  inclination: 0,
  azimuth: 0,
  bank: 0,
  phase: 0,
  spread: 100,
  targetMode: "newController",
  faceTarget: false,
  bake: false
});

/** A visible orbit scaled to the composition; the host distributes its members. */
export function deriveOrbitPreset(context: Readonly<QuickContext>, preset: OrbitPreset = "frontal"): OrbitDraft {
  const width = Number.isFinite(context.compWidth) && context.compWidth > 0 ? context.compWidth : 1920;
  const height = Number.isFinite(context.compHeight) && context.compHeight > 0 ? context.compHeight : 1080;
  return { ...DEFAULT_ORBIT, preset, radius: Math.max(1, Math.round(Math.min(width, height) * 0.25)) };
}

/** Presets restore their pose while keeping an explicitly drafted size and speed. */
export function selectOrbitPreset(draft: Readonly<OrbitDraft>, preset: OrbitPreset): OrbitDraft {
  return { ...DEFAULT_ORBIT, preset, radius: draft.radius, speed: draft.speed };
}
