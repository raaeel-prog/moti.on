import type { MotionLibraryPreset } from "./motion-library.js";

/** Original authored choreography. Distances are normalized to a 1080px-high
 * composition. A recipe specifies a path and sequencing, not just a direction.
 * Keep IDs stable: managed projects and personal favorites persist them. */
type Recipe = Partial<Omit<MotionLibraryPreset, "text">> & {
  text?: Partial<MotionLibraryPreset["text"]>;
};
function recipe(id: string, pt: string, en: string, category: MotionLibraryPreset["category"], config: Recipe): MotionLibraryPreset {
  const text = category.startsWith("text-");
  const unit = category === "text-words" ? "words" : category === "text-lines" ? "lines" : text ? "characters" : "all";
  return {
    id: `premium-${id}`, name: { "pt-BR": pt, "en-US": en }, category,
    referenceIndex: null, collection: "premium", mode: "transition", easing: "silk",
    position: [0, 0, 0], rotation: [0, 0, 0], scale: [0, 0, 0],
    fade: true, waveform: "none", effect: "none", effectAmount: 0, effectAngle: 0,
    pivot: "anchor", choreography: { path: "linear" },
    ...config,
    defaults: { durationFrames: 36, intensity: 100, direction: "preset", staggerFrames: text ? 2 : 0,
      elasticity: 0, overlap: 65, speed: 100, order: "preset", seed: 17, ...config.defaults },
    text: { unit, random: false, decode: false, tracking: 0, skew: 0, mask: false, order: "forward", ...config.text }
  };
}

export const MOTION_LIBRARY_PREMIUM_PRESETS: readonly MotionLibraryPreset[] = [
  recipe("arc-arrival", "Arco coreografado", "Choreographed arc", "motion-2d", {
    position: [-280, 40, 0], rotation: [0, 0, -16], scale: [-12, -12, 0],
    choreography: { path: "arc", turns: 1.4 }, defaults: { durationFrames: 38 }
  }),
  recipe("spiral-unfold", "Espiral que se abre", "Unfolding spiral", "motion-2d", {
    position: [150, -60, 0], rotation: [0, 0, -120], scale: [-72, -72, 0],
    choreography: { path: "spiral", turns: 0.85 }, defaults: { durationFrames: 46 }
  }),
  recipe("rubber-land", "Pouso elástico", "Rubber landing", "motion-2d", {
    position: [0, -190, 0], scale: [-24, 28, 0], easing: "spring",
    choreography: { path: "rebound" }, defaults: { durationFrames: 32, elasticity: 58 }
  }),
  recipe("pendulum-settle", "Pêndulo suave", "Pendulum settle", "motion-2d", {
    position: [100, -80, 0], rotation: [0, 0, 38],
    choreography: { path: "swing", turns: 1.25 }, defaults: { durationFrames: 48 }
  }),
  recipe("snap-stretch", "Impacto horizontal", "Horizontal snap", "motion-2d", {
    position: [-360, 0, 0], scale: [38, -38, 0], easing: "glide",
    choreography: { path: "rebound" }, defaults: { durationFrames: 22 }
  }),
  recipe("paper-fan", "Leque de papel", "Paper fan", "motion-2d", {
    rotation: [0, 0, -65], scale: [-18, -18, 0], pivot: "edge",
    choreography: { path: "swing", turns: 0.6 }, defaults: { durationFrames: 40 }
  }),
  recipe("door-perspective", "Porta em perspectiva", "Perspective door", "motion-3d", {
    rotation: [0, -88, 0], position: [60, 0, 100], pivot: "edge",
    defaults: { durationFrames: 40, direction: "left" }
  }),
  recipe("fold-down", "Dobra suspensa", "Suspended fold", "motion-3d", {
    rotation: [-85, 0, 0], position: [0, -45, 90], pivot: "edge",
    easing: "spring", defaults: { durationFrames: 42, direction: "top", elasticity: 24 }
  }),
  recipe("helix-depth", "Hélice em profundidade", "Depth helix", "motion-3d", {
    position: [180, 35, 520], rotation: [18, -30, -95], scale: [-30, -30, -30],
    choreography: { path: "spiral", turns: 0.9 }, defaults: { durationFrames: 50 }
  }),
  recipe("dolly-focus", "Aproximação em foco", "Dolly into focus", "motion-3d", {
    position: [0, 0, 800], rotation: [0, 12, 0], effect: "blur", effectAmount: 26,
    defaults: { durationFrames: 48 }
  }),
  recipe("card-tumble", "Carta em queda", "Tumbling card", "motion-3d", {
    position: [70, -250, 240], rotation: [60, -25, -35], scale: [-16, -16, -16],
    choreography: { path: "arc", turns: -1.3 }, easing: "glide", defaults: { durationFrames: 38 }
  }),
  recipe("depth-rebound", "Salto em perspectiva", "Perspective rebound", "motion-3d", {
    position: [-180, 80, -300], rotation: [-18, 40, 12], scale: [18, -16, 0],
    choreography: { path: "rebound" }, easing: "spring", defaults: { durationFrames: 34, elasticity: 44 }
  }),
  recipe("glyph-constellation", "Constelação de letras", "Letter constellation", "text-characters", {
    position: [105, 35, 0], rotation: [0, 0, 70], scale: [-55, -55, 0],
    choreography: { path: "spiral", distribution: "scatter", turns: 0.65 },
    text: { order: "random", blur: 5 }, defaults: { durationFrames: 46, overlap: 82 }
  }),
  recipe("glyph-stomp", "Letras em contraponto", "Counterpoint letters", "text-characters", {
    position: [0, 70, 0], rotation: [0, 0, 8], scale: [-25, 30, 0],
    choreography: { path: "rebound", distribution: "alternate" }, easing: "spring",
    defaults: { durationFrames: 28, staggerFrames: 2, elasticity: 35, overlap: 74 }
  }),
  recipe("glyph-lens", "Letras em expansão óptica", "Optical letter expansion", "text-characters", {
    scale: [35, 35, 0], text: { tracking: 18, blur: 28, order: "center-out" },
    easing: "silk", defaults: { durationFrames: 46, overlap: 85 }
  }),
  recipe("typewriter", "Digitação precisa", "Precise typewriter", "text-characters", {
    text: { reveal: "typewriter" }, defaults: { durationFrames: 30, staggerFrames: 3, overlap: 0 }
  }),
  recipe("glyph-ribbon", "Letras em fita", "Ribbon letters", "text-characters", {
    position: [-55, 45, 0], rotation: [0, 0, -48], scale: [-12, -12, 0],
    choreography: { path: "arc", turns: 2 }, text: { order: "edges-in" }, defaults: { durationFrames: 38, overlap: 72 }
  }),
  recipe("glyph-italic", "Corte tipográfico", "Typographic cut", "text-characters", {
    position: [95, 0, 0], scale: [15, -15, 0], text: { skew: -28, tracking: -8, blur: 3, order: "reverse" },
    easing: "glide", defaults: { durationFrames: 24, overlap: 76 }
  }),
  recipe("word-punch", "Impacto de palavras", "Punchy words", "text-words", {
    position: [0, 28, 0], scale: [60, -35, 0], rotation: [45, 0, -5],
    choreography: { path: "rebound" }, text: { blur: 12 }, easing: "spring", defaults: { durationFrames: 26, staggerFrames: 5, elasticity: 45 }
  }),
  recipe("word-crossing", "Palavras cruzadas", "Crossing words", "text-words", {
    position: [-170, 0, 0], rotation: [0, 0, 8],
    choreography: { path: "arc", distribution: "alternate", turns: 0.9 }, text: { blur: 8 },
    defaults: { durationFrames: 38, staggerFrames: 5, overlap: 80 }
  }),
  recipe("word-sculpt", "Palavras esculpidas", "Sculpted words", "text-words", {
    scale: [-60, 32, 0], text: { tracking: 15, blur: 10, order: "center-out" },
    defaults: { durationFrames: 40, staggerFrames: 4, overlap: 72 }
  }),
  recipe("line-accordion", "Linhas em acordeão", "Accordion lines", "text-lines", {
    position: [0, 65, 0], scale: [0, -70, 0], text: { blur: 10 },
    choreography: { path: "rebound", distribution: "alternate" }, easing: "glide", defaults: { durationFrames: 40, staggerFrames: 7, overlap: 72 }
  }),
  recipe("line-swing", "Linhas em balanço", "Swinging lines", "text-lines", {
    position: [-95, 20, 0], rotation: [0, 0, 22],
    choreography: { path: "swing", distribution: "alternate", turns: 0.9 },
    defaults: { durationFrames: 44, staggerFrames: 6, overlap: 78 }
  }),
  recipe("line-editorial", "Encaixe editorial", "Editorial fit", "text-lines", {
    position: [120, 0, 0], scale: [28, -12, 0], text: { tracking: -6, blur: 16, order: "reverse" },
    easing: "glide", defaults: { durationFrames: 34, staggerFrames: 6, overlap: 70 }
  }),
  recipe("word-elegance", "Foco cinematográfico", "Cinematic focus", "text-words", {
    rotation: [-45, 10, 0], scale: [15, 15, 0], text: { tracking: 12, blur: 20 },
    easing: "silk", defaults: { durationFrames: 48, staggerFrames: 5, overlap: 75 }
  }),
  recipe("glyph-cascade", "Cascata de vidro", "Glass cascade", "text-characters", {
    position: [0, -120, 0], rotation: [45, 0, 45], scale: [-10, 30, 0],
    text: { skew: -15, order: "forward" }, choreography: { path: "rebound" },
    easing: "spring", defaults: { durationFrames: 34, staggerFrames: 2, overlap: 65, elasticity: 35 }
  }),
  recipe("line-veil", "Véu suspenso", "Suspended veil", "text-lines", {
    position: [0, 40, 250], rotation: [-15, 0, 0], text: { tracking: -25, blur: 12, order: "reverse" },
    easing: "glide", defaults: { durationFrames: 42, staggerFrames: 5, overlap: 80 }
  }),
  recipe("glyph-breath", "Respiração tipográfica", "Typographic breath", "text-characters", {
    scale: [-20, -20, 0], text: { tracking: -40, blur: 6, order: "center-out" },
    easing: "silk", defaults: { durationFrames: 46, staggerFrames: 2, overlap: 85 }
  }),
  recipe("word-unfold", "Desdobramento de prancheta", "Clipboard unfold", "text-words", {
    rotation: [-90, 0, 0], position: [0, -20, 0], pivot: "edge",
    easing: "overshoot", defaults: { durationFrames: 36, staggerFrames: 4, overlap: 60 }
  }),
  recipe("glyph-kinetic", "Cinética alternada", "Alternating kinetic", "text-characters", {
    position: [0, 80, 0], choreography: { path: "linear", distribution: "alternate" }, text: { blur: 15 },
    easing: "glide", defaults: { durationFrames: 24, staggerFrames: 1, overlap: 85 }
  }),
  recipe("line-float", "Pouso de folha", "Leaf landing", "text-lines", {
    position: [40, 30, 0], rotation: [0, 0, -8], choreography: { path: "swing", turns: 0.5 },
    easing: "smooth", defaults: { durationFrames: 50, staggerFrames: 6, overlap: 85 }
  }),
  recipe("word-zoom", "Perspectiva forçada", "Forced perspective", "text-words", {
    position: [0, 0, -600], text: { blur: 30 }, easing: "spring",
    defaults: { durationFrames: 38, staggerFrames: 4, overlap: 70, elasticity: 20 }
  }),
  recipe("vfx-liquid-morph", "Distorção Líquida", "Liquid Morph", "text-words", {
    effect: "turbulent", effectAmount: 25, effectAngle: 0,
    text: { blur: 8 }, easing: "silk",
    defaults: { durationFrames: 45, overlap: 70 }
  }),
  recipe("vfx-chroma-pulse", "Pulso Cromático", "Chroma Pulse", "text-characters", {
    effect: "rgb", effectAmount: 25, effectAngle: 45,
    scale: [10, 10, 0], text: { tracking: -10, order: "center-out" },
    easing: "glide", defaults: { durationFrames: 30, staggerFrames: 3, overlap: 80 }
  }),
  recipe("vfx-neon-glitch", "Glitch Neon", "Neon Glitch", "text-characters", {
    effect: "native-glitch", effectAmount: 45, effectAngle: 0,
    text: { decode: true, tracking: 8 }, easing: "flicker",
    defaults: { durationFrames: 25, staggerFrames: 1, overlap: 85 }
  }),
  recipe("vfx-aberration-wave", "Onda de Aberração", "Aberration Wave", "text-lines", {
    effect: "chroma2", effectAmount: 20, effectAngle: 0,
    choreography: { path: "swing", turns: 0.8 }, rotation: [0, 0, 5], position: [0, 25, 0],
    easing: "smooth", defaults: { durationFrames: 45, staggerFrames: 6, overlap: 70 }
  }),
  recipe("vfx-high-contrast", "Brilho de Contraste", "High Contrast Flash", "text-words", {
    effect: "contrast", effectAmount: 40, effectAngle: 0,
    scale: [20, 20, 0], text: { blur: 15 },
    easing: "overshoot", defaults: { durationFrames: 35, staggerFrames: 4, overlap: 75 }
  }),
  recipe("vfx-duotone-pop", "Estouro Duotone", "Duotone Pop", "text-words", {
    effect: "duotone", effectAmount: 100, effectAngle: 0,
    choreography: { path: "rebound", distribution: "alternate" }, scale: [-30, -30, 0],
    easing: "spring", defaults: { durationFrames: 38, elasticity: 45, staggerFrames: 4 }
  }),
  recipe("vfx-submerged-lines", "Linhas Submersas", "Submerged Lines", "text-lines", {
    effect: "blur-wave", effectAmount: 20, effectAngle: 0,
    position: [0, -40, 0], text: { blur: 10 },
    easing: "glide", defaults: { durationFrames: 48, staggerFrames: 6, overlap: 80 }
  }),
  recipe("vfx-volumetric-cast", "Sombra Volumétrica", "Volumetric Cast", "text-words", {
    effect: "shadow-gradient", effectAmount: 40, effectAngle: 180,
    position: [0, -40, 200], rotation: [20, 0, 0], scale: [10, 10, 0],
    easing: "smooth", defaults: { durationFrames: 55, staggerFrames: 5, overlap: 70 }
  }),
  recipe("vfx-deep-extrusion", "Extrusão Profunda", "Deep Extrusion", "text-characters", {
    effect: "extrude", effectAmount: 35, effectAngle: 45,
    rotation: [-15, 25, 0], scale: [-20, -20, 0],
    choreography: { path: "rebound" }, easing: "spring",
    defaults: { durationFrames: 42, staggerFrames: 2, elasticity: 40, overlap: 75 }
  })
];
