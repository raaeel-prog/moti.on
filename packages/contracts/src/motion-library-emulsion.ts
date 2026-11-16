import type { MotionLibraryPreset } from "./motion-library.js";

/** Test integration of an independently packaged, original film library.
 * The standalone manifest and runtime remain under packs/emulsion/. */
const recipes = [
  ["film-gate-cyan", "Gate Ciano", "Cyan Gate", "chemical"],
  ["film-leader-amber", "Leader Âmbar", "Amber Leader", "splice"],
  ["film-contact-silver", "Contato Prata", "Silver Contact", "splice"]
] as const;

export const MOTION_LIBRARY_EMULSION_PRESETS: readonly MotionLibraryPreset[] = recipes.map(([id, pt, en, family]) => ({
  id, name: { "pt-BR": pt, "en-US": en },
  collection: "emulsion", category: "motion-effects", referenceIndex: null,
  filmSpec: { id, family, version: 2 },
  mode: "transition", easing: "smooth", position: [0, 0, 0], rotation: [0, 0, 0],
  scale: [0, 0, 0], fade: false, waveform: "none", effect: "camera-light", effectAmount: 0, effectAngle: 0,
  text: { unit: "all", random: false, decode: false, tracking: 0, skew: 0, mask: false }, pivot: "anchor",
  tempo: { character: "cinematic", minFrames: 4, maxFrames: 48 },
  defaults: { phase: "both", durationFrames: 12, intensity: 100, staggerFrames: 0, unit: "all", direction: "preset" }
}));
