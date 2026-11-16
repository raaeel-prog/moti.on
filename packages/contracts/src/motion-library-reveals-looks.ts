import type { MotionLibraryPreset } from "./motion-library.js";

/** Revelações e Looks (2026-10-14): original recipes on native After Effects and
 * Cycore effects only, chosen from the effect inventory of AE 26.5
 * (artifacts/native-effects/inventory.json, scripts/inspect-native-effects.jsx).
 *
 * Reveals are transitions: a native transition effect hides the layer at the
 * edges and its completion follows the eased weight, so they need no fade.
 * Looks are stacks that stylize the layer; Intensity blends them in through each
 * effect's own opacity, so they also ease in and out in the stacked effect slot.
 * No third-party preset, name or asset is embedded. Keep IDs stable. */
type Recipe = Partial<Omit<MotionLibraryPreset, "text">>;
function recipe(id: string, pt: string, en: string, category: MotionLibraryPreset["category"], config: Recipe): MotionLibraryPreset {
  return {
    id, name: { "pt-BR": pt, "en-US": en }, category, referenceIndex: null,
    mode: "transition", easing: "silk",
    position: [0, 0, 0], rotation: [0, 0, 0], scale: [0, 0, 0],
    fade: false, waveform: "none", effect: "none", effectAmount: 0, effectAngle: 0, pivot: "anchor",
    ...config,
    text: { unit: "all", random: false, decode: false, tracking: 0, skew: 0, mask: false }
  };
}
const reveal = (id: string, pt: string, en: string, effect: MotionLibraryPreset["effect"], config: Recipe = {}): MotionLibraryPreset =>
  recipe(`reveal-${id}`, pt, en, "motion-2d", { collection: "reveal", effect, ...config, defaults: { durationFrames: 24, ...config.defaults } });
const look = (id: string, pt: string, en: string, effect: MotionLibraryPreset["effect"], animated: boolean): MotionLibraryPreset =>
  recipe(`look-${id}`, pt, en, "motion-effects", {
    collection: "looks", effect, mode: animated ? "continuous" : "static", waveform: animated ? "wiggle" : "none", easing: "smooth",
    defaults: animated ? { speed: 100 } : {}
  });

export const MOTION_LIBRARY_REVEAL_PRESETS: readonly MotionLibraryPreset[] = [
  reveal("curtain", "Cortina", "Curtain Wipe", "reveal-linear", { defaults: { direction: "left" } }),
  reveal("clock", "Relógio", "Clock Wipe", "reveal-radial", { easing: "glide" }),
  reveal("blinds", "Persiana", "Blinds Reveal", "reveal-blinds", { defaults: { direction: "left" } }),
  reveal("blocks", "Blocos", "Block Reveal", "reveal-blocks", { easing: "smooth", defaults: { durationFrames: 20 } }),
  reveal("grid", "Grade em losango", "Diamond Grid", "reveal-grid", { easing: "glide", defaults: { durationFrames: 28 } }),
  reveal("sweep", "Varredura diagonal", "Diagonal Sweep", "reveal-sweep", { easing: "velvet", defaults: { direction: "left" } })
];

export const MOTION_LIBRARY_LOOK_PRESETS: readonly MotionLibraryPreset[] = [
  look("vhs", "Fita VHS", "VHS Tape", "look-vhs", true),
  look("crt", "Tubo CRT", "CRT Tube", "look-crt", false),
  look("film", "Grão de película", "Film Grain", "look-film", true),
  look("dots", "Retícula de pontos", "Dot Screen", "look-halftone", false),
  look("dither", "Pontilhado", "Dither Grain", "look-dither", false),
  look("pencil", "Traço a lápis", "Pencil Lines", "look-sketch", false),
  look("frames", "Quadro a quadro", "Frame by Frame", "look-stopmotion", true),
  look("sepia", "Sépia antiga", "Old Sepia", "look-vintage", false)
];
