import type { MotionLibraryPreset } from "./motion-library.js";

/** Signature collection: original premium text choreography. Every recipe is
 * authored at the 30 fps reference and declares its tempo character. Kinetic
 * looks depend on velocity and keep a narrow duration window; cinematic looks
 * key their effects to progress and keep their character at any duration.
 * Every transition settles on the untouched source text: per-unit properties
 * and layer effects reach their neutral values at rest.
 * Keep IDs stable: managed projects and personal favorites persist them. */
type Recipe = Partial<Omit<MotionLibraryPreset, "text" | "tempo">> & {
  text?: Partial<MotionLibraryPreset["text"]>;
  tempo: NonNullable<MotionLibraryPreset["tempo"]>;
};
function signature(id: string, pt: string, en: string, family: NonNullable<MotionLibraryPreset["family"]>,
  category: MotionLibraryPreset["category"], config: Recipe): MotionLibraryPreset {
  const unit = category === "text-words" ? "words" : category === "text-lines" ? "lines" : category === "text-effects" ? "all" : "characters";
  return {
    id: `signature-${id}`, name: { "pt-BR": pt, "en-US": en }, category, family,
    referenceIndex: null, collection: "signature", mode: "transition", easing: "velvet",
    position: [0, 0, 0], rotation: [0, 0, 0], scale: [0, 0, 0],
    fade: true, waveform: "none", effect: "none", effectAmount: 0, effectAngle: 0, pivot: "anchor",
    ...config,
    defaults: { durationFrames: 36, intensity: 100, direction: "preset", staggerFrames: unit === "all" ? 0 : 2,
      elasticity: 0, overlap: 80, speed: 100, order: "preset", seed: 17, ...config.defaults },
    text: { unit, random: false, decode: false, tracking: 0, skew: 0, mask: false, order: "forward", ...config.text }
  };
}

const AMBER: [number, number, number] = [1, .56, .2];
const EMBER: [number, number, number] = [1, .46, .12];
const DAYLIGHT: [number, number, number] = [1, .94, .84];
const STEEL: [number, number, number] = [.55, .78, 1];

export const MOTION_LIBRARY_SIGNATURE_PRESETS: readonly MotionLibraryPreset[] = [
  // Essentials: refined entrances and exits carried by typography alone.
  signature("veil-rise", "Véu ascendente", "Veil rise", "essentials", "text-lines", {
    position: [0, 72, 0], text: { mask: true, blur: 7, blurAxis: "y" },
    tempo: { character: "cinematic", minFrames: 24, maxFrames: 60 },
    defaults: { durationFrames: 34, staggerFrames: 6, overlap: 70 }
  }),
  signature("tracking-breath", "Respiro de entreletra", "Tracking breath", "essentials", "text-characters", {
    scale: [6, 6, 0], easing: "drift", text: { tracking: 38, blur: 9, order: "center-out" },
    tempo: { character: "cinematic", minFrames: 30, maxFrames: 72 },
    defaults: { durationFrames: 44, staggerFrames: 2, overlap: 88 }
  }),
  signature("glyph-cascade", "Cascata de glifos", "Glyph cascade", "essentials", "text-characters", {
    position: [0, -46, 0], rotation: [0, 0, 7], scale: [-8, -8, 0], easing: "snap", text: { blur: 4, blurAxis: "y" },
    tempo: { character: "kinetic", minFrames: 14, maxFrames: 28 },
    defaults: { durationFrames: 20, staggerFrames: 2, overlap: 72 }
  }),
  signature("horizon-split", "Horizonte dividido", "Split horizon", "essentials", "text-lines", {
    position: [-180, 0, 0], choreography: { path: "linear", distribution: "alternate" },
    text: { skew: 10, blur: 16, blurAxis: "x", mask: true },
    tempo: { character: "kinetic", minFrames: 18, maxFrames: 36 },
    defaults: { durationFrames: 26, staggerFrames: 4, overlap: 80 }
  }),
  signature("focus-pull", "Troca de foco", "Rack focus", "essentials", "text-words", {
    scale: [5, 5, 0], easing: "drift", text: { blur: 16 },
    tempo: { character: "cinematic", minFrames: 28, maxFrames: 72 },
    defaults: { durationFrames: 40, staggerFrames: 6, overlap: 75 }
  }),
  signature("baseline-unfold", "Desdobrar da base", "Baseline unfold", "essentials", "text-characters", {
    scale: [0, -100, 0], text: { blur: 4, blurAxis: "y" },
    tempo: { character: "kinetic", minFrames: 18, maxFrames: 40 },
    defaults: { durationFrames: 26, staggerFrames: 2, overlap: 78 }
  }),

  // Cinema: film and lens looks synchronized with the per-unit reveal.
  signature("film-burn", "Filme em chamas", "Film burn", "cinema", "text-characters", {
    position: [0, 8, 0], easing: "drift", effect: "film-burn", effectAmount: 82, effectColor: AMBER,
    text: { blur: 5, fill: EMBER },
    tempo: { character: "cinematic", minFrames: 32, maxFrames: 90 },
    defaults: { durationFrames: 48, staggerFrames: 2, overlap: 86 }
  }),
  signature("light-sweep", "Feixe de luz", "Light sweep", "cinema", "text-characters", {
    effect: "light-sweep", effectAmount: 90, effectAngle: -20, effectColor: DAYLIGHT, text: { blur: 4 },
    tempo: { character: "cinematic", minFrames: 28, maxFrames: 72 },
    defaults: { durationFrames: 40, staggerFrames: 2, overlap: 85 }
  }),
  signature("projector", "Projetor antigo", "Old projector", "cinema", "text-characters", {
    easing: "flicker", effect: "projector", effectAmount: 60, text: { blur: 2, order: "random" },
    tempo: { character: "cinematic", minFrames: 20, maxFrames: 48 },
    defaults: { durationFrames: 30, staggerFrames: 1, overlap: 60 }
  }),
  signature("anamorphic", "Feixe anamórfico", "Anamorphic streak", "cinema", "text-lines", {
    scale: [45, -10, 0], effect: "anamorphic", effectAmount: 140, effectColor: STEEL,
    text: { tracking: 26, blur: 18, blurAxis: "x" },
    tempo: { character: "kinetic", minFrames: 20, maxFrames: 40 },
    defaults: { durationFrames: 30, staggerFrames: 4, overlap: 80 }
  }),
  signature("gate-slip", "Quadro deslizante", "Gate slip", "cinema", "text-lines", {
    position: [0, -150, 0], easing: "snap", effect: "gate-slip", effectAmount: 90,
    text: { blur: 10, blurAxis: "y", mask: true },
    tempo: { character: "kinetic", minFrames: 12, maxFrames: 26 },
    defaults: { durationFrames: 18, staggerFrames: 3, overlap: 70 }
  }),
  signature("chroma-focus", "Foco cromático", "Chromatic focus", "cinema", "text-words", {
    scale: [4, 4, 0], easing: "drift", effect: "rgb", effectAmount: 22, text: { blur: 12 },
    tempo: { character: "cinematic", minFrames: 24, maxFrames: 60 },
    defaults: { durationFrames: 36, staggerFrames: 5, overlap: 78 }
  }),

  // Light & matter: glow, rays, ink, dust and smoke.
  signature("bloom-ignite", "Ignição de brilho", "Bloom ignite", "light-matter", "text-characters", {
    easing: "drift", effect: "bloom", effectAmount: 34, effectColor: DAYLIGHT,
    text: { blur: 6, fill: DAYLIGHT, order: "center-out" },
    tempo: { character: "cinematic", minFrames: 28, maxFrames: 72 },
    defaults: { durationFrames: 40, staggerFrames: 2, overlap: 85 }
  }),
  signature("light-rays", "Raios de luz", "Light rays", "light-matter", "text-characters", {
    scale: [6, 6, 0], effect: "light-rays", effectAmount: 240, effectColor: DAYLIGHT,
    text: { blur: 5, order: "center-out" },
    tempo: { character: "cinematic", minFrames: 32, maxFrames: 90 },
    defaults: { durationFrames: 46, staggerFrames: 3, overlap: 82 }
  }),
  signature("ink-bleed", "Tinta que se espalha", "Ink bleed", "light-matter", "text-words", {
    scale: [-10, -10, 0], easing: "drift", effect: "ink-bleed", effectAmount: 14,
    tempo: { character: "cinematic", minFrames: 30, maxFrames: 72 },
    defaults: { durationFrames: 42, staggerFrames: 6, overlap: 70 }
  }),
  signature("dust-assemble", "Poeira que se forma", "Dust assemble", "light-matter", "text-characters", {
    position: [0, -16, 0], effect: "dust", effectAmount: 150, text: { blur: 4, order: "random" },
    tempo: { character: "cinematic", minFrames: 36, maxFrames: 96 },
    defaults: { durationFrames: 50, staggerFrames: 1, overlap: 88 }
  }),
  signature("smoke-dissolve", "Névoa que dissolve", "Smoke dissolve", "light-matter", "text-characters", {
    position: [0, -40, 0], easing: "drift", effect: "smoke", effectAmount: 70, text: { blur: 10, order: "random" },
    tempo: { character: "cinematic", minFrames: 36, maxFrames: 96 },
    defaults: { durationFrames: 52, staggerFrames: 1, overlap: 85 }
  }),
  signature("halo-breath", "Halo que respira", "Breathing halo", "light-matter", "text-effects", {
    mode: "continuous", fade: false, waveform: "cosine", scale: [1.2, 1.2, 0], easing: "silk",
    effect: "halo", effectAmount: 28, effectColor: DAYLIGHT,
    tempo: { character: "loop", minFrames: 1, maxFrames: 600 },
    defaults: { durationFrames: 48, staggerFrames: 0, speed: 45 }
  }),

  // Variation: rhythm, order and glyph changes without editing the source text.
  signature("decode-resolve", "Decodificar e revelar", "Decode resolve", "variation", "text-characters", {
    text: { reveal: "resolve", fill: STEEL },
    tempo: { character: "cinematic", minFrames: 24, maxFrames: 60 },
    defaults: { durationFrames: 34, staggerFrames: 2, overlap: 55 }
  }),
  signature("slot-roll", "Rolagem de slot", "Slot roll", "variation", "text-characters", {
    position: [0, -36, 0], easing: "snap", text: { reveal: "roll", blur: 8, blurAxis: "y", mask: true },
    tempo: { character: "kinetic", minFrames: 16, maxFrames: 34 },
    defaults: { durationFrames: 24, staggerFrames: 2, overlap: 70 }
  }),
  signature("letter-shuffle", "Letras que se reorganizam", "Letter shuffle", "variation", "text-characters", {
    position: [140, 0, 0], rotation: [0, 0, 25], choreography: { path: "arc", distribution: "scatter", turns: .6 },
    text: { blur: 6, order: "random" },
    tempo: { character: "cinematic", minFrames: 28, maxFrames: 72 },
    defaults: { durationFrames: 40, staggerFrames: 1, overlap: 88 }
  }),
  signature("fluid-type", "Digitação fluida", "Fluid typing", "variation", "text-characters", {
    scale: [-30, -30, 0], easing: "snap", text: { blur: 6 },
    tempo: { character: "kinetic", minFrames: 16, maxFrames: 60 },
    defaults: { durationFrames: 30, staggerFrames: 3, overlap: 0 }
  }),
  signature("word-alternate", "Palavras alternadas", "Alternating words", "variation", "text-words", {
    position: [0, 90, 0], easing: "snap", choreography: { path: "linear", distribution: "alternate" },
    text: { mask: true, blur: 8, blurAxis: "y" },
    tempo: { character: "kinetic", minFrames: 16, maxFrames: 36 },
    defaults: { durationFrames: 24, staggerFrames: 4, overlap: 72 }
  }),
  signature("tracking-drift", "Entreletra em maré", "Tracking drift", "variation", "text-effects", {
    mode: "continuous", fade: false, waveform: "cosine", easing: "silk",
    text: { unit: "characters", tracking: 14, blur: 3 },
    tempo: { character: "loop", minFrames: 1, maxFrames: 600 },
    defaults: { durationFrames: 48, staggerFrames: 2, speed: 40 }
  })
];
