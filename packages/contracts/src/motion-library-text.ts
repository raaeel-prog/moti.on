import type { MotionLibraryOptions, MotionLibraryPreset } from "./motion-library.js";

/**
 * Original text recipes authored after observing text-preset families. Values
 * are Moti.on design choices, not extracted third-party expressions or assets.
 * Each unit variant remains editable through native After Effects Text Animators.
 * IDs are project identities; changing a label must never change the ID.
 */
type Unit = "characters" | "words" | "lines";
type Family = NonNullable<MotionLibraryPreset["textFamily"]>;
type Config = Partial<Omit<MotionLibraryPreset, "id" | "name" | "category" | "text" | "textFamily" | "textVariant">> & {
  text?: Partial<MotionLibraryPreset["text"]>;
};
interface Variant {
  id: string;
  family: Family;
  pt: string;
  en: string;
  config: Config;
}

const UNITS: readonly Unit[] = ["characters", "words", "lines"];
const UNIT_LABELS: Record<Unit, { "pt-BR": string; "en-US": string }> = {
  characters: { "pt-BR": "Caracteres", "en-US": "Characters" },
  words: { "pt-BR": "Palavras", "en-US": "Words" },
  lines: { "pt-BR": "Linhas", "en-US": "Lines" }
};

function make(unit: Unit, variant: Variant, continuous = false): MotionLibraryPreset {
  const config = variant.config;
  const unitTempo: Partial<MotionLibraryOptions> = unit === "characters"
    ? { durationFrames: 30, staggerFrames: 2 }
    : unit === "words" ? { durationFrames: 34, staggerFrames: 4 }
      : { durationFrames: 40, staggerFrames: 6 };
  return {
    id: `text-v3-${unit}-${variant.family}-${variant.id}`,
    name: {
      "pt-BR": `Texto · ${variant.pt} · ${UNIT_LABELS[unit]["pt-BR"]}`,
      "en-US": `Text · ${variant.en} · ${UNIT_LABELS[unit]["en-US"]}`
    },
    category: continuous ? "text-effects" : `text-${unit}`,
    referenceIndex: null,
    collection: "text",
    textFamily: variant.family,
    textVariant: { id: variant.id, name: { "pt-BR": variant.pt, "en-US": variant.en } },
    mode: continuous ? "continuous" : "transition",
    easing: "glide",
    position: [0, 0, 0], rotation: [0, 0, 0], scale: [0, 0, 0],
    fade: !continuous, waveform: continuous ? "cosine" : "none",
    effect: "none", effectAmount: 0, effectAngle: 0, pivot: "anchor",
    ...config,
    defaults: {
      phase: "in", direction: "preset", unit: "preset", intensity: 100,
      elasticity: 30, overlap: 65, speed: 100, order: "preset", seed: 17,
      ...unitTempo,
      ...(continuous ? { speed: 50, staggerFrames: 0 } : {}),
      ...config.defaults
    },
    text: {
      unit, dimension: "2d", random: false, decode: false, tracking: 0,
      skew: 0, mask: false, order: "forward", blur: 0,
      ...config.text
    }
  };
}

/** Four deliberately distinct finishes in each of the four core families.
 * Expanded across Characters, Words and Lines, these provide 48 own recipes. */
const CORE: readonly Variant[] = [
  { id: "cascade", family: "fade", pt: "Cascata de luz", en: "Light cascade", config: {
    easing: "glide", defaults: { overlap: 55 }
  } },
  { id: "focus", family: "fade", pt: "Foco aveludado", en: "Velvet focus", config: {
    easing: "velvet", text: { blur: 12, order: "reverse" }, defaults: { durationFrames: 38, overlap: 75 }
  } },
  { id: "center", family: "fade", pt: "Centro luminoso", en: "Luminous center", config: {
    easing: "silk", text: { blur: 4, order: "center-out" }, defaults: { durationFrames: 36, overlap: 50 }
  } },
  { id: "spark", family: "fade", pt: "Centelhas ordenadas", en: "Ordered sparks", config: {
    easing: "flicker", text: { order: "random" }, defaults: { durationFrames: 26, seed: 43, overlap: 35 }
  } },
  { id: "rise", family: "position", pt: "Subida precisa", en: "Precise rise", config: {
    position: [0, 90, 0], text: { blur: 5, blurAxis: "y" }, easing: "velvet"
  } },
  { id: "drop", family: "position", pt: "Queda macia", en: "Soft drop", config: {
    position: [0, -130, 0], text: { order: "reverse", blur: 7, blurAxis: "y" }, easing: "silk",
    defaults: { durationFrames: 36, overlap: 72 }
  } },
  { id: "slide", family: "position", pt: "Deslize lateral", en: "Lateral slide", config: {
    position: [-220, 0, 0], text: { blur: 9, blurAxis: "x", order: "edges-in" }, easing: "drift",
    defaults: { durationFrames: 34, overlap: 80 }
  } },
  { id: "ricochet", family: "position", pt: "Chegada com impulso", en: "Momentum arrival", config: {
    position: [0, 115, 0], easing: "settle-wave", text: { blur: 2 },
    defaults: { durationFrames: 40, settleAmount: 28, settleCount: 2, settleDamping: 65, overlap: 70 }
  } },
  { id: "lean", family: "rotate", pt: "Inclinação elegante", en: "Elegant lean", config: {
    position: [0, 25, 0], rotation: [0, 0, -35], text: { pivot: [0, -32, 0], blur: 3 }, easing: "glide"
  } },
  { id: "turn", family: "rotate", pt: "Giro limpo", en: "Clean turn", config: {
    rotation: [0, 0, 130], text: { order: "reverse", blur: 5 }, easing: "velvet",
    defaults: { durationFrames: 36 }
  } },
  { id: "swing", family: "rotate", pt: "Balanço de chegada", en: "Arrival swing", config: {
    rotation: [0, 0, -58], text: { pivot: [0, -70, 0], order: "center-out" }, easing: "spring",
    defaults: { durationFrames: 42, elasticity: 48, overlap: 72 }
  } },
  { id: "scatter", family: "rotate", pt: "Torção dispersa", en: "Scattered twist", config: {
    rotation: [0, 0, -95], position: [0, 35, 0], text: { order: "random", blur: 4 }, easing: "snap",
    defaults: { seed: 61, durationFrames: 28, overlap: 45 }
  } },
  { id: "bloom", family: "scale", pt: "Expansão viva", en: "Living bloom", config: {
    scale: [-100, -100, 0], easing: "spring", text: { order: "center-out" },
    defaults: { durationFrames: 36, elasticity: 42, overlap: 68 }
  } },
  { id: "near", family: "scale", pt: "Redução de perto", en: "Near reduction", config: {
    scale: [110, 110, 0], text: { blur: 8, order: "reverse" }, easing: "drift",
    defaults: { durationFrames: 34, overlap: 78 }
  } },
  { id: "width", family: "scale", pt: "Abertura horizontal", en: "Horizontal unfold", config: {
    scale: [-100, 0, 0], text: { tracking: 18, order: "edges-in" }, easing: "silk",
    defaults: { durationFrames: 32, overlap: 55 }
  } },
  { id: "height", family: "scale", pt: "Abertura vertical", en: "Vertical unfold", config: {
    scale: [0, -100, 0], position: [0, 28, 0], text: { pivot: [0, 36, 0] }, easing: "settle-hop",
    defaults: { durationFrames: 38, settleAmount: 24, settleCount: 2, settleDamping: 68 }
  } }
];

/** True per-segment depth, X/Y/Z turns and explicit local pivot offsets. */
const THREE_D: readonly Variant[] = [
  { id: "tunnel-3d", family: "position", pt: "Túnel 3D", en: "3D tunnel", config: {
    position: [0, 0, -720], rotation: [8, -12, 0], text: { dimension: "3d", blur: 6, tracking: 12 },
    easing: "drift", defaults: { durationFrames: 42, overlap: 72 }
  } },
  { id: "approach-3d", family: "position", pt: "Aproximação 3D", en: "3D approach", config: {
    position: [0, 45, 450], rotation: [-24, 12, 0], scale: [20, 20, 20],
    text: { dimension: "3d", blur: 5, order: "reverse" }, easing: "velvet",
    defaults: { durationFrames: 36, overlap: 80 }
  } },
  { id: "pitch-3d", family: "rotate", pt: "Dobradiça 3D", en: "3D hinge", config: {
    position: [0, 0, 90], rotation: [-82, 0, 0],
    text: { dimension: "3d", pivot: [0, -44, 0], blur: 3 }, easing: "glide",
    defaults: { durationFrames: 38, overlap: 62 }
  } },
  { id: "yaw-3d", family: "rotate", pt: "Porta giratória 3D", en: "3D revolving door", config: {
    position: [-35, 0, 90], rotation: [0, 86, -6],
    text: { dimension: "3d", pivot: [-26, 0, 0], order: "center-out", blur: 3 }, easing: "silk",
    defaults: { durationFrames: 40, overlap: 70 }
  } },
  { id: "tumble-3d", family: "rotate", pt: "Rodopio espacial 3D", en: "3D spatial tumble", config: {
    position: [0, 70, -260], rotation: [-150, 110, -35],
    text: { dimension: "3d", order: "random", blur: 6 }, easing: "spring",
    defaults: { durationFrames: 46, elasticity: 34, seed: 37, overlap: 75 }
  } },
  { id: "depth-bloom-3d", family: "scale", pt: "Expansão em profundidade 3D", en: "3D depth bloom", config: {
    position: [0, 0, -320], rotation: [12, -18, 8], scale: [-85, -85, -85],
    text: { dimension: "3d", order: "edges-in", blur: 4 }, easing: "spring",
    defaults: { durationFrames: 40, elasticity: 40, overlap: 66 }
  } }
];

const TYPOGRAPHY: readonly Variant[] = [
  { id: "spread", family: "tracking", pt: "Espaços que se encontram", en: "Meeting spaces", config: {
    text: { tracking: 95, order: "center-out", blur: 2 }, easing: "drift",
    defaults: { durationFrames: 42, overlap: 80 }
  } },
  { id: "tighten", family: "tracking", pt: "Compressão tipográfica", en: "Typographic compression", config: {
    text: { tracking: -70, order: "reverse" }, scale: [10, 10, 0], easing: "silk",
    defaults: { durationFrames: 36, overlap: 70 }
  } },
  { id: "rise-window", family: "mask", pt: "Janela ascendente", en: "Rising window", config: {
    position: [0, 150, 0], text: { mask: true, blur: 2, blurAxis: "y" }, easing: "velvet",
    defaults: { durationFrames: 34, overlap: 82 }
  } },
  { id: "side-window", family: "mask", pt: "Janela lateral", en: "Side window", config: {
    position: [-230, 0, 0], text: { mask: true, tracking: 16, order: "reverse" }, easing: "glide",
    defaults: { durationFrames: 38, overlap: 75 }
  } },
  { id: "precise", family: "typewriter", pt: "Escrita precisa", en: "Precise typing", config: {
    text: { reveal: "typewriter" }, easing: "silk",
    defaults: { durationFrames: 48, staggerFrames: 0, overlap: 100 }
  } },
  { id: "reverse", family: "typewriter", pt: "Escrita reversa", en: "Reverse typing", config: {
    text: { reveal: "typewriter", order: "reverse" }, easing: "glide",
    defaults: { durationFrames: 42, staggerFrames: 0, overlap: 100 }
  } },
  { id: "resolve", family: "decode", pt: "Código que se resolve", en: "Resolving code", config: {
    text: { reveal: "resolve", order: "random", blur: 3 }, easing: "glide",
    defaults: { durationFrames: 46, seed: 29, overlap: 58 }
  } },
  { id: "roll", family: "decode", pt: "Contagem de glifos", en: "Glyph countdown", config: {
    text: { reveal: "roll", order: "forward", tracking: 14 }, easing: "snap",
    defaults: { durationFrames: 36, overlap: 65 }
  } }
];

const COMBINATIONS: readonly Variant[] = [
  { id: "resolve-lift", family: "combination", pt: "Código em ascensão", en: "Rising code", config: {
    position: [0, 90, 0], scale: [-38, -38, 0],
    text: { reveal: "resolve", tracking: 26, blur: 3 }, easing: "velvet",
    defaults: { durationFrames: 44, overlap: 74, seed: 71 }
  } },
  { id: "wiggly-lift", family: "combination", pt: "Chegada vibrante", en: "Lively arrival", config: {
    position: [0, 105, 0], rotation: [0, 0, -8], scale: [-50, -50, 0], waveform: "wiggle",
    text: { tracking: 8, blur: 2 }, easing: "glide",
    defaults: { durationFrames: 44, overlap: 82, seed: 47 }
  } },
  { id: "fold-ribbon-3d", family: "combination", pt: "Dobra em sequência 3D", en: "3D folding sequence", config: {
    position: [0, 65, -160], rotation: [-75, 35, -8], scale: [-32, -32, -32],
    text: { dimension: "3d", pivot: [0, -40, 0], tracking: 18, blur: 4, order: "edges-in" }, easing: "velvet",
    defaults: { durationFrames: 44, overlap: 76 }
  } },
  { id: "lift-turn", family: "combination", pt: "Subida em torção", en: "Twisting lift", config: {
    position: [0, 100, 0], rotation: [0, 0, -28], scale: [-65, -65, 0],
    text: { tracking: 32, blur: 5, order: "center-out", pivot: [0, -25, 0] }, easing: "spring",
    defaults: { durationFrames: 40, elasticity: 34, overlap: 76 }
  } },
  { id: "focus-spacing", family: "combination", pt: "Foco e espaçamento", en: "Focus and spacing", config: {
    position: [-80, 0, 0], scale: [45, 45, 0],
    text: { tracking: 80, blur: 14, order: "edges-in", fill: [0.38, 0.73, 1] }, easing: "drift",
    defaults: { durationFrames: 44, overlap: 84 }
  } }
];

/** Continuous recipes use independent controls and no IN/OUT markers. Amplitudes
 * are intentionally restrained to keep readable copy during the entire layer. */
const EFFECTS: readonly (Variant & { unit: Unit })[] = [
  { unit: "characters", id: "decode-spacing", family: "loop", pt: "Decodificação e respiro", en: "Decode and breathe", config: {
    scale: [2, 2, 0], text: { decode: true, tracking: 16 },
    defaults: { speed: 45, seed: 83, intensity: 65 }
  } },
  { unit: "words", id: "sway-spacing", family: "loop", pt: "Ondulação tipográfica", en: "Typographic ripple", config: {
    position: [10, 8, 0], rotation: [0, 0, 3], text: { tracking: 8, pivot: [0, -16, 0] },
    waveform: "wiggle", defaults: { speed: 40 }
  } },
  { unit: "lines", id: "jiggle-scale", family: "loop", pt: "Vibração suave", en: "Gentle vibration", config: {
    position: [0, 6, 0], rotation: [0, 0, 1.5], scale: [1.5, 1.5, 0],
    waveform: "wiggle", defaults: { speed: 35, intensity: 80 }
  } },
  { unit: "characters", id: "drift", family: "loop", pt: "Flutuação delicada", en: "Delicate float", config: {
    position: [0, 14, 0], defaults: { speed: 40 }
  } },
  { unit: "words", id: "wave", family: "loop", pt: "Onda de palavras", en: "Word wave", config: {
    position: [0, 22, 0], rotation: [0, 0, 2], defaults: { speed: 45 }
  } },
  { unit: "lines", id: "pulse", family: "loop", pt: "Respiração de escala", en: "Scale breathing", config: {
    scale: [3, 3, 0], defaults: { speed: 40 }
  } },
  { unit: "characters", id: "tilt", family: "loop", pt: "Balanço tipográfico", en: "Typographic sway", config: {
    rotation: [0, 0, 7], text: { pivot: [0, -20, 0] }, defaults: { speed: 50 }
  } },
  { unit: "words", id: "spacing", family: "loop", pt: "Espaçamento vivo", en: "Living spacing", config: {
    text: { tracking: 18 }, defaults: { speed: 45 }
  } },
  { unit: "characters", id: "flicker", family: "loop", pt: "Tremulação suave", en: "Soft flicker", config: {
    waveform: "blink", fade: true, defaults: { speed: 65, intensity: 45, seed: 53 }
  } },
  { unit: "words", id: "color", family: "loop", pt: "Ondulação de cor", en: "Color ripple", config: {
    text: { fill: [0.21, 0.62, 1] }, defaults: { speed: 40 }
  } },
  { unit: "characters", id: "decode", family: "loop", pt: "Código contínuo", en: "Continuous code", config: {
    text: { decode: true }, waveform: "wiggle", defaults: { speed: 65, seed: 79 }
  } },
  { unit: "words", id: "focus", family: "loop", pt: "Respiração de foco", en: "Focus breathing", config: {
    text: { blur: 4 }, defaults: { speed: 35 }
  } },
  { unit: "lines", id: "skew", family: "loop", pt: "Inclinação fluida", en: "Fluid slant", config: {
    text: { skew: 4 }, defaults: { speed: 35 }
  } },
  { unit: "characters", id: "depth-wave-3d", family: "loop", pt: "Onda em profundidade 3D", en: "3D depth wave", config: {
    position: [0, 8, 38], rotation: [5, 8, 0], text: { dimension: "3d" }, defaults: { speed: 35 }
  } },
  { unit: "words", id: "turn-wave-3d", family: "loop", pt: "Giro ondulado 3D", en: "3D turn wave", config: {
    rotation: [0, 14, 3], text: { dimension: "3d", pivot: [0, -18, 0] }, defaults: { speed: 40 }
  } }
];

export const MOTION_LIBRARY_TEXT_PRESETS: readonly MotionLibraryPreset[] = [
  ...UNITS.flatMap((unit) => [...CORE, ...THREE_D, ...TYPOGRAPHY, ...COMBINATIONS].map((variant) => make(unit, variant))),
  ...EFFECTS.map((variant) => make(variant.unit, variant, true))
];

/** Measurable authored coverage, separate from any installed/public competitor
 * inventory. This contains only this collection's original recipes. */
export const MOTION_TEXT_COVERAGE = {
  coreVariantsPerFamilyAndUnit: 4,
  coreTransitions: UNITS.length * CORE.length,
  threeDTransitions: UNITS.length * THREE_D.length,
  typographyTransitions: UNITS.length * TYPOGRAPHY.length,
  combinedTransitions: UNITS.length * COMBINATIONS.length,
  continuousEffects: EFFECTS.length
} as const;
