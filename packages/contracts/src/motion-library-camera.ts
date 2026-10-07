import type { CameraImpactSpec, MotionLibraryPreset } from "./motion-library.js";

/**
 * Original camera-style transitions applied to the selected image layer.
 * Every camera effect includes Gaussian Blur; effectAmount is its nominal peak
 * in pixels. The host owns the normalized tint/turbulence envelopes and their
 * capability checks. The shared intensity control scales the complete recipe.
 * Positive scale offsets provide overscan rather than shrinking the source.
 * In settles from the offset to the untouched frame; Out reverses that journey.
 */
function cameraRecipe(
  id: string,
  portuguese: string,
  english: string,
  effect: MotionLibraryPreset["effect"],
  durationFrames: number,
  scale: number,
  blur: number,
  rotation = 0,
  easing: MotionLibraryPreset["easing"] = "silk"
): MotionLibraryPreset {
  return {
    id,
    name: { "pt-BR": portuguese, "en-US": english },
    category: "motion-effects",
    referenceIndex: null,
    collection: "studio",
    defaults: {
      phase: "both", durationFrames, intensity: 100, staggerFrames: 0,
      unit: "all", elasticity: 0, overlap: 0, speed: 100
    },
    mode: "transition",
    easing,
    position: [0, 0, 0],
    rotation: [0, 0, rotation],
    scale: [scale, scale, 0],
    fade: false,
    waveform: "none",
    effect,
    effectAmount: blur,
    effectAngle: 0,
    text: { unit: "all", random: false, decode: false, tracking: 0, skew: 0, mask: false },
    pivot: "anchor"
  };
}

function specRecipe(id: string, pt: string, en: string, effect: MotionLibraryPreset["effect"],
  blur: "none" | "gaussian" | "lens", rotation = 0, shake = false, exposure = 0): MotionLibraryPreset {
  return { ...cameraRecipe(`camera-spec-${id}`, pt, en, effect, 24,
      effect === "camera-distort" || effect === "camera-shake" ? 35 : 0,
      blur === "none" ? 0 : 24, rotation),
    cameraSpec: { id: `camera.${id}`, blur, ...(exposure ? { exposure } : {}) },
    waveform: shake ? "wiggle" : "none",
    position: shake ? [28, 18, 0] : [0, 0, 0]
  };
}

function nativeRecipe(id: string, pt: string, en: string, style: number, angle: number,
  frames: number): MotionLibraryPreset {
  return {
    ...cameraRecipe(`camera-native-${id}`, pt, en, "camera-zoom", frames, 0, 0),
    collection: "premium",
    cameraSpec: { id: `camera.native.${id}`, blur: "none", native: { style, angle } }
  };
}

/** Premium impact shakes: precomp-only, every complement driven by one
 * `cameraImpactSample` evaluation around CUT. Blur and the light flash use the
 * existing cameraSpec blur/exposure fields so tags, preview and host stay uniform. */
function impactRecipe(id: string, pt: string, en: string, frames: number, spec: CameraImpactSpec,
  blur = 0, exposure = 0): MotionLibraryPreset {
  const radians = spec.angle * Math.PI / 180, round = (value: number): number => Math.round(value * 100) / 100 + 0;
  return {
    ...cameraRecipe(`camera-impact-${id}`, pt, en, "camera-shake", frames, spec.zoom + spec.punch, blur, spec.roll),
    collection: "premium",
    cameraSpec: { id: `camera.impact.${id}`, blur: blur ? "gaussian" : "none", ...(exposure ? { exposure } : {}), impact: spec },
    waveform: "wiggle",
    position: [round(spec.travel * Math.cos(radians)), round(spec.travel * Math.sin(radians)), 0],
    effectAngle: spec.angle
  };
}

export const MOTION_LIBRARY_CAMERA_PRESETS: readonly MotionLibraryPreset[] = [
  cameraRecipe("camera-dark-fade", "Fade para preto", "Fade to black", "camera-dark", 24, 4, 12),
  cameraRecipe("camera-light-flash", "Clarão suave", "Soft light flash", "camera-light", 20, 6, 18),
  cameraRecipe("camera-spin-left", "Giro para esquerda", "Left camera turn", "camera-spin", 22, 48, 22, -12, "glide"),
  cameraRecipe("camera-spin-right", "Giro para direita", "Right camera turn", "camera-spin", 22, 48, 22, 12, "glide"),
  cameraRecipe("camera-zoom-soft", "Zoom suave", "Soft camera zoom", "camera-zoom", 24, 28, 16),
  cameraRecipe("camera-zoom-deep", "Zoom profundo", "Deep camera zoom", "camera-zoom", 20, 65, 32, 0, "glide"),
  cameraRecipe("camera-distort-flow", "Distorção fluida", "Fluid camera distortion", "camera-distort", 24, 18, 20),
  {
    ...cameraRecipe("camera-shake-soft", "Tremor amortecido", "Cushioned camera shake", "camera-shake", 18, 22, 10, 4),
    // Deterministic zero-mean oscillation multiplied by the transition envelope.
    position: [28, 18, 0],
    waveform: "wiggle"
  },
  specRecipe("blur-lens", "Desfoque de lente", "Lens blur", "camera-zoom", "lens"),
  specRecipe("blur-gaussian", "Desfoque gaussiano", "Gaussian blur", "camera-zoom", "gaussian"),
  specRecipe("fade-dark", "Fade preto · puro", "Black fade · clean", "camera-dark", "none"),
  specRecipe("fade-light", "Fade branco · puro", "White fade · clean", "camera-light", "none"),
  specRecipe("fade-dark-blur-lens", "Preto + lente", "Black + lens", "camera-dark", "lens"),
  specRecipe("fade-light-blur-lens", "Branco + lente", "White + lens", "camera-light", "lens"),
  specRecipe("exposure-light", "Flash de exposição", "Exposure flash", "camera-zoom", "none", 0, false, 3),
  specRecipe("distort", "Distorção · pura", "Distortion · clean", "camera-distort", "none"),
  specRecipe("distort-rotation", "Distorção + giro", "Distortion + turn", "camera-distort", "none", 12),
  specRecipe("distort-shake", "Distorção + tremor", "Distortion + shake", "camera-shake", "none", 0, true),
  specRecipe("distort-rotation-shake", "Distorção + giro + tremor", "Distortion + turn + shake", "camera-shake", "none", 12, true),
  nativeRecipe("whip", "Whip lateral", "Lateral whip", 1, 0, 18),
  nativeRecipe("punch", "Punch óptico", "Optical punch", 2, 0, 20),
  nativeRecipe("vortex", "Vórtice suave", "Soft vortex", 3, 25, 24),
  nativeRecipe("lens", "Pulso de lente", "Lens pulse", 4, 0, 24),
  nativeRecipe("smear", "Arrasto diagonal", "Diagonal smear", 5, -28, 16),
  nativeRecipe("prism", "Prisma cromático", "Chromatic prism", 6, 15, 22),
  impactRecipe("punch", "Punch de impacto", "Impact punch", 18, { hit: "single", attack: 5, angle: 90, travel: 26, roll: 1.2,
    frequency: 7, damping: 11, texture: 20, punch: 12, zoom: 0, shutter: 180, glow: 0, wave: 0 }),
  impactRecipe("flash", "Impacto de luz", "Light strike", 20, { hit: "single", attack: 6, angle: 90, travel: 22, roll: 1.5,
    frequency: 8, damping: 12, texture: 25, punch: 8, zoom: 0, shutter: 180, glow: .8, wave: 0 }, 4, 1.35),
  impactRecipe("shockwave", "Onda de choque", "Shockwave", 24, { hit: "single", attack: 4, angle: 0, travel: 18, roll: .8,
    frequency: 6, damping: 8, texture: 20, punch: 6, zoom: 0, shutter: 150, glow: 0, wave: 24 }, 0, .4),
  impactRecipe("zoom-through", "Zoom com tremor", "Zoom-through shake", 24, { hit: "single", attack: 3, angle: 90, travel: 20, roll: 2,
    frequency: 9, damping: 10, texture: 35, punch: 4, zoom: 24, shutter: 200, glow: 0, wave: 0 }, 10),
  impactRecipe("rumble", "Tremor sísmico", "Seismic rumble", 30, { hit: "single", attack: 3, angle: 90, travel: 16, roll: 1,
    frequency: 8, damping: 6, texture: 50, punch: 5, zoom: 6, shutter: 120, glow: 0, wave: 0 }, 2),
  impactRecipe("handheld", "Câmera na mão", "Handheld camera", 30, { hit: "sway", attack: 2, angle: 0, travel: 24, roll: 1.8,
    frequency: 2.2, damping: 3, texture: 100, punch: 3, zoom: 0, shutter: 90, glow: 0, wave: 0 }),
  impactRecipe("whip", "Chicote lateral", "Whip jolt", 16, { hit: "single", attack: 7, angle: 0, travel: 70, roll: 1.5,
    frequency: 5, damping: 14, texture: 10, punch: 6, zoom: 0, shutter: 240, glow: 0, wave: 0 }),
  impactRecipe("twist", "Torção de impacto", "Twist hit", 20, { hit: "single", attack: 5, angle: 90, travel: 10, roll: 5,
    frequency: 6, damping: 10, texture: 20, punch: 6, zoom: 0, shutter: 200, glow: 0, wave: 0 }, 3),
  impactRecipe("double", "Batida dupla", "Double hit", 24, { hit: "double", attack: 6, angle: 90, travel: 20, roll: 1.2,
    frequency: 8, damping: 13, texture: 15, punch: 9, zoom: 0, shutter: 180, glow: .4, wave: 0 }, 0, .6),
  impactRecipe("cinematic", "Impacto cinematográfico", "Cinematic impact", 26, { hit: "single", attack: 4, angle: 90, travel: 24, roll: 1.8,
    frequency: 7.5, damping: 9, texture: 30, punch: 10, zoom: 12, shutter: 180, glow: .7, wave: 10 }, 6, 1.1)
];
