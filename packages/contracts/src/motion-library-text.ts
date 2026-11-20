import type { MotionLibraryOptions, MotionLibraryPreset } from "./motion-library.js";
import { libraryTextReference } from "./motion-library-math.js";

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

/** A unit sliding under its window must start fully hidden: the travel becomes
 * 1.1 em of the unit's own sample (distances are read in em; see
 * libraryTextReference), whatever its authored length. */
function maskTravel(config: Config, unit: Unit): Config {
  const [x, y, z] = config.position ?? [0, 0, 0], k = 1.1 * libraryTextReference(unit) / (Math.hypot(x, y) || 1);
  return { ...config, position: [Math.round(x * k), Math.round(y * k), z] };
}

/**
 * Retoque de Tipografia › Caracteres (2026-11-18). A mesma receita servia letras,
 * palavras e linhas; letra é menor e chega em sequência mais rápida, então pede
 * outro desenho: desfoque só no eixo do movimento (rastro, não névoa), giros e
 * escalas pela linha de base, ataque curto e assentamento definido. Só a unidade
 * Caracteres usa estes ajustes; IDs não mudam. Chave: `família-variante`.
 */
export const CHARACTER_TUNING: Readonly<Record<string, Config>> = {
  // Opacidade: luz que acende letra a letra, com leve rastro vertical.
  "fade-cascade": { easing: "quad-out", position: [0, 14, 0], text: { blur: 6, blurAxis: "y" } },
  // Foco: cada letra entra desfocada e um pouco maior, do centro para fora.
  "fade-focus": { easing: "expo-out", scale: [12, 12, 0], text: { blur: 16, order: "center-out" } },
  // Posição: o rastro acompanha a direção da viagem.
  "position-rise": { easing: "expo-out", position: [0, 72, 0], text: { blur: 12, blurAxis: "y" } },
  "position-slide": { easing: "quint-out", text: { blur: 18, blurAxis: "x" } },
  "position-ricochet": { text: { blur: 6, blurAxis: "y" } },
  "position-drop-bounce": { scale: [0, 18, 0], text: { blur: 6, blurAxis: "y", origin: [0, 0.36, 0] } },
  // Rotação: as letras giram apoiadas na linha de base, como peças tipográficas.
  "rotate-lean": { easing: "spring", defaults: { elasticity: 35 } },
  "rotate-turn": { easing: "expo-out", scale: [-45, -45, 0], text: { blur: 4, origin: [0, 0.36, 0] } },
  "rotate-scatter": { text: { blur: 8 } },
  "rotate-somersault": { text: { blur: 6, blurAxis: "y" } },
  // Escala: nascer da base (broto, crescer, leque) e explodir do centro (florescer, impacto).
  "scale-bloom": { defaults: { elasticity: 45 } },
  "scale-sprout": { text: { origin: [0, 0.36, 0], blur: 4, blurAxis: "y" } },
  "scale-grow-base": { easing: "quint-out", text: { origin: [0, 0.36, 0], blur: 3, blurAxis: "y" } },
  "scale-baseline-fan": { text: { origin: [0, 0.36, 0] } },
  "scale-width": { easing: "expo-out", text: { blur: 8, blurAxis: "x" } },
  "scale-impact": { text: { order: "center-out" } },
  "scale-rubber-slide": { text: { blur: 8, blurAxis: "x" } },
  // Entreletra: o espaço fecha com rastro horizontal, não névoa.
  "tracking-converge": { easing: "expo-out", text: { blur: 8, blurAxis: "x" } },
  "tracking-elastic": { text: { blur: 4, blurAxis: "x" } },
  // Janelas: corte seco, chegada rápida.
  "mask-rise-window": { easing: "expo-out", text: { blur: 4, blurAxis: "y" } },
  "mask-side-window": { easing: "expo-out", text: { blur: 6, blurAxis: "x" } },
  "mask-slant-window": { easing: "quint-out" },
  // Combinações: cada uma com um traço só dela.
  "combination-lift-turn": { text: { origin: [0, 0.36, 0], blur: 6, blurAxis: "y" } },
  "combination-spiral": { text: { blur: 6 } },
  "combination-color-rise": { easing: "expo-out", text: { blur: 4, blurAxis: "y" } }
};

/** Retoque por cima da receita compartilhada: campos de texto e padrões se somam. */
function tuned(unit: Unit, variant: Variant): Config {
  const extra = unit === "characters" ? CHARACTER_TUNING[`${variant.family}-${variant.id}`] : undefined;
  if (!extra) return variant.config;
  return {
    ...variant.config, ...extra,
    text: { ...variant.config.text, ...extra.text },
    defaults: { ...variant.config.defaults, ...extra.defaults }
  };
}

function make(unit: Unit, variant: Variant, continuous = false): MotionLibraryPreset {
  const base = tuned(unit, variant);
  const config = base.text?.mask ? maskTravel(base, unit) : base;
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
    position: [0, 25, 0], rotation: [0, 0, -35], text: { origin: [0, -.36, 0], blur: 3 }, easing: "glide"
  } },
  { id: "turn", family: "rotate", pt: "Giro limpo", en: "Clean turn", config: {
    rotation: [0, 0, 130], text: { order: "reverse", blur: 5 }, easing: "velvet",
    defaults: { durationFrames: 36 }
  } },
  { id: "swing", family: "rotate", pt: "Balanço de chegada", en: "Arrival swing", config: {
    rotation: [0, 0, -58], text: { origin: [0, -1.1, 0], order: "center-out" }, easing: "spring",
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
    scale: [0, -100, 0], position: [0, 28, 0], text: { origin: [0, .36, 0] }, easing: "settle-hop",
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
    text: { dimension: "3d", origin: [0, -.36, 0], blur: 3 }, easing: "glide",
    defaults: { durationFrames: 38, overlap: 62 }
  } },
  { id: "yaw-3d", family: "rotate", pt: "Porta giratória 3D", en: "3D revolving door", config: {
    position: [-35, 0, 90], rotation: [0, 86, -6],
    text: { dimension: "3d", origin: [-.3, 0, 0], order: "center-out", blur: 3 }, easing: "silk",
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
    text: { dimension: "3d", origin: [0, -.36, 0], tracking: 18, blur: 4, order: "edges-in" }, easing: "velvet",
    defaults: { durationFrames: 44, overlap: 76 }
  } },
  { id: "lift-turn", family: "combination", pt: "Subida em torção", en: "Twisting lift", config: {
    position: [0, 100, 0], rotation: [0, 0, -28], scale: [-65, -65, 0],
    text: { tracking: 32, blur: 5, order: "center-out" }, easing: "spring",
    defaults: { durationFrames: 40, elasticity: 34, overlap: 76 }
  } },
  { id: "focus-spacing", family: "combination", pt: "Foco e espaçamento", en: "Focus and spacing", config: {
    position: [-80, 0, 0], scale: [45, 45, 0],
    text: { tracking: 80, blur: 14, order: "edges-in", fill: [0.38, 0.73, 1] }, easing: "drift",
    defaults: { durationFrames: 44, overlap: 84 }
  } }
];

/** Behaviours a professional text library is expected to cover that the sets
 * above did not: segments that arrive one at a time or as one block, damped
 * swings on rotation, scale and the mask window, an elastic spacing settle,
 * a flickering decode and segments gathering from scattered directions. Values
 * are Moti.on's own; see docs/research/2026-10-16-text-presets-behavior.md. */
const PARITY: readonly Variant[] = [
  { id: "sequence", family: "fade", pt: "Sequência nítida", en: "Crisp sequence", config: {
    easing: "snap", defaults: { durationFrames: 30, overlap: 0 }
  } },
  { id: "block", family: "position", pt: "Deslize em bloco", en: "Block slide", config: {
    position: [-170, 0, 0], text: { blur: 8, blurAxis: "x" }, easing: "velvet",
    defaults: { durationFrames: 30, staggerFrames: 0, overlap: 100 }
  } },
  { id: "swing-settle", family: "rotate", pt: "Giro com ricochete", en: "Ricochet turn", config: {
    rotation: [0, 0, -42], text: { origin: [0, .36, 0] }, easing: "settle-wave",
    defaults: { durationFrames: 40, settleAmount: 34, settleCount: 3, settleDamping: 60, overlap: 72 }
  } },
  { id: "drop-settle", family: "scale", pt: "Escala com ricochete", en: "Ricochet scale", config: {
    scale: [-100, -100, 0], text: { origin: [0, -.36, 0] }, easing: "settle-wave",
    defaults: { durationFrames: 38, settleAmount: 30, settleCount: 2, settleDamping: 62, overlap: 70 }
  } },
  { id: "elastic", family: "tracking", pt: "Entreletra elástica", en: "Elastic spacing", config: {
    scale: [-30, -30, 0], text: { tracking: 60, order: "center-out" }, easing: "spring",
    defaults: { durationFrames: 40, elasticity: 45, overlap: 78 }
  } },
  { id: "window-settle", family: "mask", pt: "Janela com impulso", en: "Momentum window", config: {
    position: [0, 140, 0], text: { mask: true }, easing: "settle-wave",
    defaults: { durationFrames: 38, settleAmount: 22, settleCount: 2, settleDamping: 66, overlap: 80 }
  } },
  { id: "signal", family: "decode", pt: "Sinal decodificado", en: "Decoded signal", config: {
    scale: [-40, -40, 0], text: { reveal: "resolve", order: "random" }, easing: "flicker",
    defaults: { durationFrames: 34, seed: 59, overlap: 55 }
  } },
  { id: "gather", family: "combination", pt: "Dispersão que se reúne", en: "Scattered gathering", config: {
    position: [90, 60, 0], rotation: [0, 0, 40], scale: [-45, -45, 0],
    choreography: { path: "linear", distribution: "scatter" },
    text: { order: "random", blur: 4 }, easing: "velvet",
    defaults: { durationFrames: 42, seed: 31, overlap: 78 }
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
    position: [10, 8, 0], rotation: [0, 0, 3], text: { tracking: 8, origin: [0, -.5, 0] },
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
    rotation: [0, 0, 7], text: { origin: [0, -.6, 0] }, defaults: { speed: 50 }
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
    rotation: [0, 14, 3], text: { dimension: "3d", origin: [0, -.36, 0] }, defaults: { speed: 40 }
  } },
  { unit: "characters", id: "skew-jiggle", family: "loop", pt: "Tremor inclinado", en: "Slanted jiggle", config: {
    text: { skew: 6 }, rotation: [0, 0, 2], waveform: "wiggle", defaults: { speed: 70, intensity: 80, seed: 67 }
  } },
  { unit: "lines", id: "jitter", family: "loop", pt: "Agitação tipográfica", en: "Typographic jitter", config: {
    position: [6, 4, 0], rotation: [0, 0, 2.5], text: { tracking: 6 }, waveform: "wiggle",
    defaults: { speed: 110, intensity: 70, seed: 89 }
  } }
];

/** Gaps measured frame by frame in the behaviour study (GAP-01…13 in
 * docs/research/2026-10-16-text-presets-behavior.md). Each lists the units
 * where the behaviour reads well; values are Moti.on's own. */
const MEASURED: readonly (Variant & { units: readonly Unit[] })[] = [
  { units: ["characters"], id: "arc", family: "rotate", pt: "Arco de chegada", en: "Arrival arc", config: {
    rotation: [0, 0, -38], scale: [-55, -55, 0], text: { origin: [0, 2.4, 0], blur: 4 }, easing: "velvet",
    defaults: { durationFrames: 26, staggerFrames: 1, overlap: 82 }
  } },
  { units: ["words"], id: "arc", family: "rotate", pt: "Arco de chegada", en: "Arrival arc", config: {
    rotation: [0, 0, -38], scale: [-55, -55, 0], text: { origin: [0, 2.4, 0], blur: 4 }, easing: "velvet",
    defaults: { durationFrames: 34, staggerFrames: 4, overlap: 75 }
  } },
  // Retired: the arrival arc seen from the top (libraryTextOrient) is this motion.
  { units: ["characters", "words"], id: "arc-top", family: "rotate", pt: "Arco descendente", en: "Descending arc", config: {
    rotation: [0, 0, 38], scale: [-55, -55, 0], text: { origin: [0, -2.4, 0], blur: 4 }, easing: "velvet", retired: true,
    defaults: { durationFrames: 30, overlap: 80 }
  } },
  // Falls in turning a full circle.
  { units: ["characters", "words"], id: "somersault", family: "rotate", pt: "Cambalhota", en: "Somersault", config: {
    position: [0, -120, 0], rotation: [0, 0, 360], scale: [-40, -40, 0], text: { blur: 3 }, easing: "velvet",
    defaults: { durationFrames: 34, overlap: 72 }
  } },
  { units: ["characters", "words"], id: "sprout", family: "scale", pt: "Broto com rebote", en: "Sprouting rebound", config: {
    position: [0, 60, 0], scale: [-100, -100, 0], text: { origin: [0, .36, 0] }, easing: "settle-hop",
    defaults: { durationFrames: 34, staggerFrames: 2, overlap: 70, settleAmount: 14, settleCount: 1, settleDamping: 72 }
  } },
  { units: ["characters", "words"], id: "grow-base", family: "scale", pt: "Crescer da base", en: "Grow from baseline", config: {
    scale: [-100, -100, 0], text: { origin: [0, .36, 0] }, easing: "velvet", defaults: { durationFrames: 30, overlap: 65 }
  } },
  // Retired: growing from the baseline seen from the top is this motion.
  { units: ["characters", "words"], id: "grow-top", family: "scale", pt: "Crescer do topo", en: "Grow from cap line", config: {
    scale: [-100, -100, 0], text: { origin: [0, -.36, 0] }, easing: "velvet", retired: true, defaults: { durationFrames: 30, overlap: 65 }
  } },
  // Retired: growing from the baseline with the Spring character is this motion.
  { units: ["characters", "words"], id: "grow-base-spring", family: "scale", pt: "Crescer da base elástico", en: "Springy baseline growth", config: {
    scale: [-100, -100, 0], text: { origin: [0, .36, 0] }, easing: "spring", retired: true, defaults: { durationFrames: 32, elasticity: 40, overlap: 65 }
  } },
  // Falls stretched tall and squashes on the baseline as the ricochet lands it.
  { units: ["characters", "words"], id: "squash-landing", family: "scale", pt: "Pouso elástico", en: "Squash landing", config: {
    position: [0, -130, 0], scale: [-30, 30, 0], text: { origin: [0, .36, 0] }, easing: "settle-wave",
    defaults: { durationFrames: 34, overlap: 70, settleAmount: 30, settleCount: 2, settleDamping: 60 }
  } },
  // Fans up from the left foot of each unit.
  { units: ["characters", "words"], id: "baseline-fan", family: "scale", pt: "Leque da base", en: "Baseline fan", config: {
    rotation: [0, 0, -50], scale: [-100, -100, 0], text: { origin: [-.32, .36, 0] }, easing: "spring", defaults: { durationFrames: 32, elasticity: 40, overlap: 65 }
  } },
  { units: ["characters", "words"], id: "converge", family: "tracking", pt: "Convergência", en: "Convergence", config: {
    scale: [-100, -100, 0], text: { tracking: 120, blur: 3 }, easing: "velvet",
    defaults: { durationFrames: 38, staggerFrames: 0, overlap: 100 }
  } },
  { units: ["lines"], id: "converge", family: "tracking", pt: "Convergência", en: "Convergence", config: {
    scale: [-100, -100, 0], text: { tracking: 120, blur: 3 }, easing: "velvet",
    defaults: { durationFrames: 48, staggerFrames: 0, overlap: 100 }
  } },
  // Retired: the convergence with the Spring character is this motion.
  { units: ["characters", "words", "lines"], id: "converge-spring", family: "tracking", pt: "Convergência viva", en: "Lively convergence", config: {
    scale: [-100, -100, 0], text: { tracking: 120, blur: 3 }, easing: "spring", retired: true, defaults: { durationFrames: 40, elasticity: 32, overlap: 70 }
  } },
  // Spread wide and oversized, the units snap together and overshoot once.
  { units: ["characters", "words", "lines"], id: "magnetic", family: "tracking", pt: "Atração magnética", en: "Magnetic pull", config: {
    scale: [40, 40, 0], text: { tracking: 200, blur: 4 }, easing: "overshoot", defaults: { durationFrames: 30, staggerFrames: 0, overlap: 100 }
  } },
  { units: ["characters", "words"], id: "flip-3d", family: "rotate", pt: "Virada completa 3D", en: "Full flip 3D", config: {
    position: [0, 0, -380], rotation: [0, 180, 0], scale: [40, 40, 40], text: { dimension: "3d", blur: 3 }, easing: "silk",
    defaults: { durationFrames: 36, overlap: 70 }
  } },
  { units: ["lines"], id: "flip-x-3d", family: "rotate", pt: "Virada vertical 3D", en: "Vertical flip 3D", config: {
    position: [0, 0, -380], rotation: [180, 0, 0], scale: [40, 40, 40], text: { dimension: "3d", blur: 3 }, easing: "silk",
    defaults: { durationFrames: 40, overlap: 70 }
  } },
  { units: ["characters", "words"], id: "spark-scale", family: "combination", pt: "Faísca em escala", en: "Scaling spark", config: {
    scale: [-60, -60, 0], text: { tracking: 22, order: "random" }, easing: "flicker",
    defaults: { durationFrames: 26, seed: 59, overlap: 45 }
  } },
  { units: ["characters", "words"], id: "rebound", family: "tracking", pt: "Espaço com rebote", en: "Rebounding spacing", config: {
    position: [-40, 0, 0], text: { tracking: 60 }, easing: "settle-wave",
    defaults: { durationFrames: 34, overlap: 70, settleAmount: 18, settleCount: 2, settleDamping: 60 }
  } },
  { units: ["lines"], id: "scan", family: "decode", pt: "Varredura de código", en: "Code scan", config: {
    text: { reveal: "resolve", fill: [0.55, 0.55, 0.55] }, easing: "glide",
    defaults: { durationFrames: 30, staggerFrames: 8, overlap: 55 }
  } },
  // Retired: the code scan in reverse Order is this motion.
  { units: ["lines"], id: "scan-reverse", family: "decode", pt: "Varredura de código reversa", en: "Reverse code scan", config: {
    text: { reveal: "resolve", fill: [0.55, 0.55, 0.55], order: "reverse" }, easing: "glide", retired: true,
    defaults: { durationFrames: 30, staggerFrames: 8, overlap: 55 }
  } },
  // Lines that close their spacing as they resolve, last line first.
  { units: ["lines"], id: "closing-code", family: "decode", pt: "Código que se fecha", en: "Closing code", config: {
    text: { reveal: "resolve", fill: [0.55, 0.55, 0.55], order: "reverse", tracking: 40 }, easing: "glide",
    defaults: { durationFrames: 30, staggerFrames: 8, overlap: 55 }
  } }
];

/** More arrivals with a clear physical idea, tuned on the one-word, two-word and
 * two-line card samples: a gravity drop, a spiral, a split-flap and a stretch. */
const MORE: readonly (Variant & { units: readonly Unit[] })[] = [
  { units: ["characters", "words"], id: "drop-bounce", family: "position", pt: "Queda com quique", en: "Bouncing drop", config: {
    position: [0, -150, 0], easing: "settle-hop",
    defaults: { durationFrames: 36, overlap: 70, settleAmount: 26, settleCount: 2, settleDamping: 62 }
  } },
  { units: ["characters"], id: "spiral", family: "combination", pt: "Espiral de letras", en: "Letter spiral", config: {
    position: [70, -40, 0], rotation: [0, 0, -160], scale: [-80, -80, 0], choreography: { path: "spiral", turns: .75 },
    text: { blur: 3 }, easing: "velvet", defaults: { durationFrames: 40, overlap: 78 }
  } },
  { units: ["characters", "words", "lines"], id: "flap-3d", family: "rotate", pt: "Placa que desce 3D", en: "3D split-flap", config: {
    rotation: [90, 0, 0], text: { dimension: "3d", origin: [0, -.36, 0], blur: 2 }, easing: "settle-wave",
    defaults: { durationFrames: 34, overlap: 70, settleAmount: 20, settleCount: 2, settleDamping: 64 }
  } },
  // Retired: the vertical unfold from the baseline gives this motion.
  { units: ["characters", "words"], id: "stretch", family: "scale", pt: "Esticar e assentar", en: "Stretch and settle", config: {
    scale: [-25, -100, 0], text: { origin: [0, .36, 0] }, easing: "spring", retired: true,
    defaults: { durationFrames: 32, elasticity: 48, overlap: 68 }
  } },
  // Stretched along its travel, the unit squeezes as it stops, then settles.
  { units: ["characters", "words"], id: "rubber-slide", family: "scale", pt: "Elástico lateral", en: "Rubber slide", config: {
    position: [-160, 0, 0], scale: [45, -25, 0], text: { blur: 4, blurAxis: "x" }, easing: "settle-wave",
    defaults: { durationFrames: 32, overlap: 68, settleAmount: 28, settleCount: 2, settleDamping: 58 }
  } }
];

/** The whole text as one unit crossing the frame (GAP-07). It lives in Lines,
 * where a block reads naturally, and keeps the collection's ID pattern. */
const SINGLE_BLOCK: MotionLibraryPreset = (() => {
  // Travel stays in frame pixels: the block crosses the frame, whatever its size.
  const preset = make("lines", { id: "single-block", family: "position", pt: "Bloco único", en: "Single block", config: {
    position: [-1300, 0, 0], travel: "offscreen", text: { blur: 10, blurAxis: "x" }, easing: "glide",
    defaults: { durationFrames: 26, staggerFrames: 0, overlap: 100 }
  } });
  return { ...preset, text: { ...preset.text, unit: "all" } };
})();

/** Loops the study found missing: a held, stepped jitter and periodic scatter. */
const MEASURED_EFFECTS: readonly (Variant & { unit: Unit })[] = [
  { unit: "characters", id: "stepped-jitter", family: "loop", pt: "Tremor em degraus", en: "Stepped jitter", config: {
    position: [5, 5, 0], rotation: [0, 0, 6], waveform: "stepped", defaults: { speed: 50, seed: 67 }
  } },
  { unit: "characters", id: "fine-tremor", family: "loop", pt: "Tremor fino", en: "Fine tremor", config: {
    position: [2, 2, 0], scale: [3, 3, 0], waveform: "stepped", defaults: { speed: 50, seed: 71 }
  } },
  { unit: "characters", id: "heartbeat", family: "loop", pt: "Batida tipográfica", en: "Typographic heartbeat", config: {
    scale: [8, 8, 0], waveform: "heartbeat", defaults: { speed: 60, intensity: 90 }
  } },
  { unit: "characters", id: "scatter-pulse", family: "loop", pt: "Dispersão periódica", en: "Periodic scatter", config: {
    position: [160, 120, 0], rotation: [0, 0, 120], scale: [-60, -60, 0], text: { random: true, blur: 6 },
    waveform: "burst", defaults: { speed: 45, intensity: 70, seed: 31 }
  } }
];

/** Arrivals for titles, ads and social formats the sets above lacked: a slam
 * from far too close, units zipping in from both sides at once, a window cut on
 * a slant and a colour that sweeps through the text and settles on its own fill. */
const TITLES: readonly (Variant & { units: readonly Unit[] })[] = [
  { units: ["characters", "words", "lines"], id: "impact", family: "scale", pt: "Impacto", en: "Impact", config: {
    scale: [260, 260, 0], text: { blur: 10 }, easing: "settle-wave",
    defaults: { durationFrames: 16, overlap: 60, settleAmount: 18, settleCount: 1.5, settleDamping: 70 }
  } },
  { units: ["characters", "words"], id: "zipper", family: "position", pt: "Zíper", en: "Zipper", config: {
    position: [0, 110, 0], choreography: { path: "linear", distribution: "alternate" }, text: { blur: 4, blurAxis: "y" }, easing: "velvet",
    defaults: { durationFrames: 30, overlap: 75 }
  } },
  { units: ["characters", "words", "lines"], id: "slant-window", family: "mask", pt: "Corte inclinado", en: "Slanted cut", config: {
    position: [0, 150, 0], text: { mask: true, skew: 18 }, easing: "glide",
    defaults: { durationFrames: 30, overlap: 80 }
  } },
  { units: ["characters", "words"], id: "color-rise", family: "combination", pt: "Varredura de cor", en: "Color sweep", config: {
    position: [0, 40, 0], text: { fill: [1, .74, .26], blur: 2 }, easing: "silk",
    defaults: { durationFrames: 34, overlap: 60 }
  } }
];

export const MOTION_LIBRARY_TEXT_PRESETS: readonly MotionLibraryPreset[] = [
  ...UNITS.flatMap((unit) => [...CORE, ...THREE_D, ...TYPOGRAPHY, ...COMBINATIONS, ...PARITY].map((variant) => make(unit, variant))),
  ...EFFECTS.map((variant) => make(variant.unit, variant, true)),
  ...MEASURED.flatMap((variant) => variant.units.map((unit) => make(unit, variant))),
  ...MORE.flatMap((variant) => variant.units.map((unit) => make(unit, variant))),
  SINGLE_BLOCK,
  ...MEASURED_EFFECTS.map((variant) => make(variant.unit, variant, true)),
  ...TITLES.flatMap((variant) => variant.units.map((unit) => make(unit, variant)))
];

/** Measurable authored coverage, separate from any installed/public competitor
 * inventory. This contains only this collection's original recipes. */
export const MOTION_TEXT_COVERAGE = {
  coreVariantsPerFamilyAndUnit: 4,
  coreTransitions: UNITS.length * CORE.length,
  threeDTransitions: UNITS.length * THREE_D.length,
  typographyTransitions: UNITS.length * TYPOGRAPHY.length,
  combinedTransitions: UNITS.length * COMBINATIONS.length,
  parityTransitions: UNITS.length * PARITY.length,
  continuousEffects: EFFECTS.length
} as const;
