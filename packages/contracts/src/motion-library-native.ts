import type { MotionLibraryPreset } from "./motion-library.js";

/** Original recipes for the five-parameter CHMS Motion Core renderer.
 * Older rgb/chroma2 recipes retain their renderer and visual identity. */
export const MOTION_LIBRARY_NATIVE_PRESETS: readonly MotionLibraryPreset[] = [
  {
    id: "native-rgb",
    name: { "pt-BR": "RGB preciso", "en-US": "Precise RGB" },
    category: "motion-effects", referenceIndex: null, collection: "native",
    defaults: { intensity: 100, staggerFrames: 0 },
    mode: "static", easing: "silk",
    position: [0, 0, 0], rotation: [0, 0, 0], scale: [0, 0, 0],
    fade: false, waveform: "none", effect: "native-rgb", effectAmount: 12, effectAngle: 0,
    text: { unit: "all", random: false, decode: false, tracking: 0, skew: 0, mask: false },
    pivot: "anchor"
  },
  {
    id: "native-rgb-reveal",
    name: { "pt-BR": "Revelação cromática", "en-US": "Chromatic reveal" },
    category: "motion-effects", referenceIndex: null, collection: "native",
    defaults: { durationFrames: 30, intensity: 100, staggerFrames: 0 },
    mode: "transition", easing: "silk",
    position: [0, 40, 0], rotation: [0, 0, 0], scale: [0, 0, 0],
    fade: true, waveform: "none", effect: "native-rgb", effectAmount: 36, effectAngle: 0,
    text: { unit: "all", random: false, decode: false, tracking: 0, skew: 0, mask: false },
    pivot: "anchor"
  },
  {
    id: "native-text-chromatic",
    name: { "pt-BR": "Letras cromáticas", "en-US": "Chromatic letters" },
    category: "text-characters", referenceIndex: null, collection: "native",
    defaults: { durationFrames: 36, intensity: 100, staggerFrames: 2, overlap: 65 },
    mode: "transition", easing: "silk",
    position: [0, 28, 0], rotation: [0, 0, 0], scale: [0, 0, 0],
    fade: true, waveform: "none", effect: "native-rgb", effectAmount: 20, effectAngle: 0,
    text: { unit: "characters", random: false, decode: false, tracking: 0, skew: 0, mask: false, order: "forward" },
    pivot: "anchor"
  },
  {
    id: "native-glitch-title",
    name: { "pt-BR": "Título digital", "en-US": "Digital title" },
    category: "text-effects", referenceIndex: null, collection: "native",
    defaults: { durationFrames: 30, intensity: 100, staggerFrames: 0, overlap: 65 },
    mode: "transition", easing: "silk",
    position: [0, 0, 0], rotation: [0, 0, 0], scale: [0, 0, 0],
    fade: true, waveform: "none", effect: "native-glitch", effectAmount: 32, effectAngle: 0,
    text: { unit: "all", random: false, decode: false, tracking: 0, skew: 0, mask: false, order: "forward" },
    pivot: "anchor"
  }
];
