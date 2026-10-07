import { MOTION_LIBRARY_PREMIUM_PRESETS } from "./motion-library-premium.js";
import { MOTION_LIBRARY_STUDIO_PRESETS } from "./motion-library-studio.js";
import { MOTION_LIBRARY_CAMERA_PRESETS } from "./motion-library-camera.js";
import { MOTION_LIBRARY_NATIVE_PRESETS } from "./motion-library-native.js";

/**
 * Original, declarative Moti.on animation library.
 *
 * referenceIndex links to the review catalog only; no third-party preset,
 * expression, asset or implementation is embedded here. Host adapters own
 * evaluation, capability checks, Undo and managed-artifact lifecycle.
 */
export interface MotionLibraryPreset {
  id: string;
  name: { "pt-BR": string; "en-US": string };
  category:
    | "motion-2d"
    | "motion-3d"
    | "motion-effects"
    | "text-characters"
    | "text-words"
    | "text-lines"
    | "text-effects";
  /** Index in the reviewed video; original Studio recipes have no external reference. */
  referenceIndex: number | null;
  /** Exact master-spec overlay recipe; does not apply directly to user layers. */
  cameraSpec?: { id: string; blur: "none" | "gaussian" | "lens"; exposure?: number; native?: { style: number; angle: number }; impact?: CameraImpactSpec };
  collection?: "studio" | "gemini" | "native" | "premium";
  /** Original multi-axis trajectory; optional to preserve legacy recipes. */
  choreography?: {
    path: "linear" | "arc" | "spiral" | "rebound" | "swing";
    distribution?: "uniform" | "alternate" | "scatter";
    turns?: number;
  };
  /** Curated initial controls; omitted values use the legacy library defaults. */
  defaults?: Partial<MotionLibraryOptions>;
  mode: "transition" | "continuous" | "static";
  easing: "smooth" | "cubic" | "overshoot" | "bounce" | "flicker" | "silk" | "glide" | "spring";
  /** Nominal offsets/amplitudes in pixels for a 1080-pixel-high composition. */
  position: [number, number, number];
  /** X, Y and Z offsets/amplitudes in degrees. */
  rotation: [number, number, number];
  /** Transition offsets from 100%; continuous amplitudes in percentage points. */
  scale: [number, number, number];
  fade: boolean;
  waveform: "none" | "wiggle" | "cosine" | "abs-cosine" | "orbit";
  effect:
    | "none"
    | "blur"
    | "blur-wave"
    | "chroma2"
    | "duotone"
    | "contrast"
    | "rgb"
    | "native-rgb"
    | "native-glitch"
    | "extrude"
    | "shadow"
    | "shadow-stripes"
    | "shadow-gradient"
    | "turbulent"
    | "camera-dark"
    | "camera-light"
    | "camera-distort"
    | "camera-shake"
    | "camera-zoom"
    | "camera-spin";
  /** Effect-specific nominal amount; zero when no effect is requested. */
  effectAmount: number;
  /** Screen-space direction: 0° right, 90° down, 180° left, 270° up. */
  effectAngle: number;
  text: {
    unit: "characters" | "words" | "lines" | "all";
    random: boolean;
    decode: boolean;
    tracking: number;
    skew: number;
    mask: boolean;
    /** Sequence order, with random retained for legacy recipes. */
    order?: "forward" | "reverse" | "center-out" | "edges-in" | "random";
    /** Per-unit text blur in nominal pixels; independent of whole-layer effects. */
    blur?: number;
    /** Discrete per-unit reveal; independent of geometric easing. */
    reveal?: "typewriter";
  };
  pivot: "anchor" | "edge";
}

/**
 * Impact camera shake evaluated around the CUT marker by `cameraImpactSample`.
 * Pixel values are nominal for a 1080-pixel-high composition. Blur uses the
 * recipe's cameraSpec.blur/effectAmount and the light flash cameraSpec.exposure.
 */
export interface CameraImpactSpec {
  /** One damped kick at CUT, a pre-beat plus the kick, or an organic sway. */
  hit: "single" | "double" | "sway";
  /** Exponent of the rise into CUT; larger values strike later and drier. */
  attack: number;
  /** Screen-space kick direction: 0° right, 90° down. */
  angle: number;
  /** Peak travel in pixels and peak roll in degrees. */
  travel: number;
  roll: number;
  /** Oscillation frequency (Hz) and post-CUT damping (1/s). */
  frequency: number;
  damping: number;
  /** Share of seeded organic texture, in percent. */
  texture: number;
  /** Scale spike at CUT and symmetric zoom-through, in percent. */
  punch: number;
  zoom: number;
  /** Transform shutter angle for real motion blur; 0 disables it. */
  shutter: number;
  /** Glow intensity at CUT; 0 omits the effect. */
  glow: number;
  /** Wave Warp height in pixels; 0 omits the effect. */
  wave: number;
}

export interface MotionLibraryOptions {
  /** Use the recipe's curve or explicitly choose its transition response. */
  easing?: "preset" | MotionLibraryPreset["easing"];
  phase: "in" | "out" | "both";
  direction: "preset" | "bottom" | "left" | "right" | "top";
  /** Preserve recipe sequence unless explicitly overridden. */
  order?: "preset" | "forward" | "reverse" | "center-out" | "edges-in" | "random";
  /** Deterministic variation of scattered motion and random sequencing. */
  seed?: number;
  durationFrames: number;
  intensity: number;
  staggerFrames: number;
  unit: "preset" | "characters" | "words" | "lines" | "all";
  /** Spring strength, from no overshoot to the maximum bounded response. */
  elasticity?: number;
  /** Maximum portion of a transition shared by neighboring text units. */
  overlap?: number;
  /** Continuous-animation frequency, as a percentage of the base cycle speed. */
  speed?: number;
}

export const MOTION_LIBRARY_DEFAULTS: Readonly<MotionLibraryOptions> = {
  phase: "in",
  direction: "preset",
  durationFrames: 24,
  intensity: 100,
  staggerFrames: 2,
  unit: "preset"
};

/** Accept the complete legacy controls plus finite, bounded optional Studio controls. */
export function isMotionLibraryOptions(value: unknown): value is MotionLibraryOptions {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const requiredKeys = [
    "phase", "direction", "durationFrames", "intensity", "staggerFrames", "unit"
  ];
  const expectedKeys = [...requiredKeys, "elasticity", "overlap", "speed", "order", "seed", "easing"];
  const keys = Reflect.ownKeys(value);
  if (keys.length < requiredKeys.length || keys.length > expectedKeys.length) return false;
  if (requiredKeys.some((key) => !Object.prototype.hasOwnProperty.call(value, key))) return false;
  for (const key of keys) {
    if (typeof key !== "string" || !expectedKeys.includes(key)) return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, "value")) return false;
  }
  const options = value as Record<string, unknown>;
  for (const [key, minimum, maximum] of [
    ["elasticity", 0, 100], ["overlap", 0, 100], ["speed", 25, 200]
  ] as const) {
    if (!Object.prototype.hasOwnProperty.call(options, key)) continue;
    const number = options[key];
    if (typeof number !== "number" || !Number.isFinite(number) || number < minimum || number > maximum) return false;
  }
  if (Object.prototype.hasOwnProperty.call(options, "easing") && !["preset", "smooth", "cubic", "overshoot", "bounce", "flicker", "silk", "glide", "spring"].includes(options.easing as string)) return false;
  if (Object.prototype.hasOwnProperty.call(options, "order") && !["preset", "forward", "reverse", "center-out", "edges-in", "random"].includes(options.order as string)) return false;
  if (Object.prototype.hasOwnProperty.call(options, "seed") && (typeof options.seed !== "number" || !Number.isInteger(options.seed) || options.seed < 0 || options.seed > 9999)) return false;
  return (options.phase === "in" || options.phase === "out" || options.phase === "both")
    && (options.direction === "preset" || options.direction === "bottom" || options.direction === "left"
      || options.direction === "right" || options.direction === "top")
    && typeof options.durationFrames === "number" && Number.isInteger(options.durationFrames)
    && options.durationFrames >= 1 && options.durationFrames <= 600
    && typeof options.intensity === "number" && Number.isFinite(options.intensity)
    && options.intensity >= 0 && options.intensity <= 300
    && typeof options.staggerFrames === "number" && Number.isInteger(options.staggerFrames)
    && options.staggerFrames >= 0 && options.staggerFrames <= 60
    && (options.unit === "preset" || options.unit === "characters" || options.unit === "words"
      || options.unit === "lines" || options.unit === "all");
}

export const MOTION_LIBRARY_PRESETS: readonly MotionLibraryPreset[] = [
  {
    id: "mist-reveal",
    name: {"pt-BR": "Revelação suave", "en-US": "Mist reveal"},
    category: "motion-2d",
    referenceIndex: 0,
    mode: "transition",
    easing: "smooth",
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [0, 0, 0],
    fade: true,
    waveform: "none",
    effect: "blur",
    effectAmount: 28,
    effectAngle: 0,
    text: {"unit": "all", "random": false, "decode": false, "tracking": 0, "skew": 0, "mask": false},
    pivot: "anchor"
  },
  {
    id: "slow-fade",
    name: {"pt-BR": "Aparição gradual", "en-US": "Gradual fade"},
    category: "motion-2d",
    referenceIndex: 1,
    mode: "transition",
    easing: "cubic",
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [0, 0, 0],
    fade: true,
    waveform: "none",
    effect: "none",
    effectAmount: 0,
    effectAngle: 0,
    text: {"unit": "all", "random": false, "decode": false, "tracking": 0, "skew": 0, "mask": false},
    pivot: "anchor"
  },
  {
    id: "arc-arrival",
    name: {"pt-BR": "Chegada em arco", "en-US": "Arc arrival"},
    category: "motion-2d",
    referenceIndex: 2,
    mode: "transition",
    easing: "smooth",
    position: [0, 160, 0],
    rotation: [0, 0, 15],
    scale: [0, 0, 0],
    fade: true,
    waveform: "none",
    effect: "none",
    effectAmount: 0,
    effectAngle: 0,
    text: {"unit": "all", "random": false, "decode": false, "tracking": 0, "skew": 0, "mask": false},
    pivot: "anchor"
  },
  {
    id: "spring-arc",
    name: {"pt-BR": "Arco elástico", "en-US": "Spring arc"},
    category: "motion-2d",
    referenceIndex: 3,
    mode: "transition",
    easing: "overshoot",
    position: [0, 160, 0],
    rotation: [0, 0, 22],
    scale: [0, 0, 0],
    fade: true,
    waveform: "none",
    effect: "none",
    effectAmount: 0,
    effectAngle: 0,
    text: {"unit": "all", "random": false, "decode": false, "tracking": 0, "skew": 0, "mask": false},
    pivot: "anchor"
  },
  {
    id: "rise-and-unfold",
    name: {"pt-BR": "Subir e abrir", "en-US": "Rise and unfold"},
    category: "motion-2d",
    referenceIndex: 4,
    mode: "transition",
    easing: "smooth",
    position: [0, 160, 0],
    rotation: [0, 0, -12],
    scale: [-100, -100, 0],
    fade: true,
    waveform: "none",
    effect: "none",
    effectAmount: 0,
    effectAngle: 0,
    text: {"unit": "all", "random": false, "decode": false, "tracking": 0, "skew": 0, "mask": false},
    pivot: "anchor"
  },
  {
    id: "elastic-flourish",
    name: {"pt-BR": "Giro expansivo", "en-US": "Elastic flourish"},
    category: "motion-2d",
    referenceIndex: 5,
    mode: "transition",
    easing: "overshoot",
    position: [0, 190, 0],
    rotation: [0, 0, 35],
    scale: [-100, -100, 0],
    fade: true,
    waveform: "none",
    effect: "none",
    effectAmount: 0,
    effectAngle: 0,
    text: {"unit": "all", "random": false, "decode": false, "tracking": 0, "skew": 0, "mask": false},
    pivot: "anchor"
  },
  {
    id: "spring-rise",
    name: {"pt-BR": "Expansão ascendente", "en-US": "Spring rise"},
    category: "motion-2d",
    referenceIndex: 6,
    mode: "transition",
    easing: "overshoot",
    position: [0, 160, 0],
    rotation: [0, 0, 0],
    scale: [-100, -100, 0],
    fade: true,
    waveform: "none",
    effect: "none",
    effectAmount: 0,
    effectAngle: 0,
    text: {"unit": "all", "random": false, "decode": false, "tracking": 0, "skew": 0, "mask": false},
    pivot: "anchor"
  },
  {
    id: "elastic-pop",
    name: {"pt-BR": "Expansão elástica", "en-US": "Elastic pop"},
    category: "motion-2d",
    referenceIndex: 7,
    mode: "transition",
    easing: "overshoot",
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [-100, -100, 0],
    fade: true,
    waveform: "none",
    effect: "none",
    effectAmount: 0,
    effectAngle: 0,
    text: {"unit": "all", "random": false, "decode": false, "tracking": 0, "skew": 0, "mask": false},
    pivot: "anchor"
  },
  {
    id: "bounce-pop",
    name: {"pt-BR": "Expansão com impacto", "en-US": "Bounce pop"},
    category: "motion-2d",
    referenceIndex: 8,
    mode: "transition",
    easing: "bounce",
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [-100, -100, 0],
    fade: true,
    waveform: "none",
    effect: "none",
    effectAmount: 0,
    effectAngle: 0,
    text: {"unit": "all", "random": false, "decode": false, "tracking": 0, "skew": 0, "mask": false},
    pivot: "anchor"
  },
  {
    id: "hinged-reveal",
    name: {"pt-BR": "Abertura pela borda", "en-US": "Hinged reveal"},
    category: "motion-3d",
    referenceIndex: 9,
    mode: "transition",
    easing: "smooth",
    position: [0, 0, 0],
    rotation: [75, 0, 0],
    scale: [0, 0, 0],
    fade: true,
    waveform: "none",
    effect: "none",
    effectAmount: 0,
    effectAngle: 0,
    text: {"unit": "all", "random": false, "decode": false, "tracking": 0, "skew": 0, "mask": false},
    pivot: "edge"
  },
  {
    id: "depth-turn",
    name: {"pt-BR": "Giro em profundidade", "en-US": "Depth turn"},
    category: "motion-3d",
    referenceIndex: 10,
    mode: "transition",
    easing: "smooth",
    position: [0, 160, -280],
    rotation: [22, -42, -8],
    scale: [0, 0, 0],
    fade: true,
    waveform: "none",
    effect: "none",
    effectAmount: 0,
    effectAngle: 0,
    text: {"unit": "all", "random": false, "decode": false, "tracking": 0, "skew": 0, "mask": false},
    pivot: "anchor"
  },
  {
    id: "reverse-depth-turn",
    name: {"pt-BR": "Giro de aproximação", "en-US": "Approaching turn"},
    category: "motion-3d",
    referenceIndex: 11,
    mode: "transition",
    easing: "smooth",
    position: [0, 180, 220],
    rotation: [-30, 35, 8],
    scale: [0, 0, 0],
    fade: true,
    waveform: "none",
    effect: "none",
    effectAmount: 0,
    effectAngle: 0,
    text: {"unit": "all", "random": false, "decode": false, "tracking": 0, "skew": 0, "mask": false},
    pivot: "anchor"
  },
  {
    id: "spring-depth-swing",
    name: {"pt-BR": "Balanço espacial", "en-US": "Spatial spring swing"},
    category: "motion-3d",
    referenceIndex: 12,
    mode: "transition",
    easing: "overshoot",
    position: [0, 140, -180],
    rotation: [-55, 18, 12],
    scale: [0, 0, 0],
    fade: true,
    waveform: "none",
    effect: "none",
    effectAmount: 0,
    effectAngle: 0,
    text: {"unit": "all", "random": false, "decode": false, "tracking": 0, "skew": 0, "mask": false},
    pivot: "anchor"
  },
  {
    id: "elastic-pivot",
    name: {"pt-BR": "Pivô elástico", "en-US": "Elastic pivot"},
    category: "motion-3d",
    referenceIndex: 13,
    mode: "transition",
    easing: "overshoot",
    position: [0, 0, 0],
    rotation: [0, 110, 0],
    scale: [0, 0, 0],
    fade: true,
    waveform: "none",
    effect: "none",
    effectAmount: 0,
    effectAngle: 0,
    text: {"unit": "all", "random": false, "decode": false, "tracking": 0, "skew": 0, "mask": false},
    pivot: "anchor"
  },
  {
    id: "bounce-flip",
    name: {"pt-BR": "Virada com impacto", "en-US": "Bounce flip"},
    category: "motion-3d",
    referenceIndex: 14,
    mode: "transition",
    easing: "bounce",
    position: [0, 0, 0],
    rotation: [90, 0, 0],
    scale: [0, 0, 0],
    fade: true,
    waveform: "none",
    effect: "none",
    effectAmount: 0,
    effectAngle: 0,
    text: {"unit": "all", "random": false, "decode": false, "tracking": 0, "skew": 0, "mask": false},
    pivot: "anchor"
  },
  {
    id: "front-fold",
    name: {"pt-BR": "Abertura frontal", "en-US": "Front fold"},
    category: "motion-3d",
    referenceIndex: 15,
    mode: "transition",
    easing: "smooth",
    position: [0, 0, -220],
    rotation: [-90, 0, 0],
    scale: [0, 0, 0],
    fade: true,
    waveform: "none",
    effect: "none",
    effectAmount: 0,
    effectAngle: 0,
    text: {"unit": "all", "random": false, "decode": false, "tracking": 0, "skew": 0, "mask": false},
    pivot: "anchor"
  },
  {
    id: "liquid-softness",
    name: {"pt-BR": "Ondas difusas", "en-US": "Diffuse waves"},
    category: "motion-effects",
    referenceIndex: 16,
    mode: "continuous",
    easing: "smooth",
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [0, 0, 0],
    fade: false,
    waveform: "cosine",
    effect: "blur-wave",
    effectAmount: 18,
    effectAngle: 0,
    text: {"unit": "all", "random": false, "decode": false, "tracking": 0, "skew": 0, "mask": false},
    pivot: "anchor"
  },
  {
    id: "two-tone-offset",
    name: {"pt-BR": "Desvio bicolor", "en-US": "Two-tone offset"},
    category: "motion-effects",
    referenceIndex: 17,
    mode: "static",
    easing: "smooth",
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [0, 0, 0],
    fade: false,
    waveform: "none",
    effect: "chroma2",
    effectAmount: 8,
    effectAngle: 0,
    text: {"unit": "all", "random": false, "decode": false, "tracking": 0, "skew": 0, "mask": false},
    pivot: "anchor"
  },
  {
    id: "ink-pair",
    name: {"pt-BR": "Duas tintas", "en-US": "Two inks"},
    category: "motion-effects",
    referenceIndex: 18,
    mode: "static",
    easing: "smooth",
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [0, 0, 0],
    fade: false,
    waveform: "none",
    effect: "duotone",
    effectAmount: 100,
    effectAngle: 0,
    text: {"unit": "all", "random": false, "decode": false, "tracking": 0, "skew": 0, "mask": false},
    pivot: "anchor"
  },
  {
    id: "color-punch",
    name: {"pt-BR": "Cor intensa", "en-US": "Color punch"},
    category: "motion-effects",
    referenceIndex: 19,
    mode: "static",
    easing: "smooth",
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [0, 0, 0],
    fade: false,
    waveform: "none",
    effect: "contrast",
    effectAmount: 35,
    effectAngle: 0,
    text: {"unit": "all", "random": false, "decode": false, "tracking": 0, "skew": 0, "mask": false},
    pivot: "anchor"
  },
  {
    id: "channel-offset",
    name: {"pt-BR": "Canais deslocados", "en-US": "Offset channels"},
    category: "motion-effects",
    referenceIndex: 20,
    mode: "static",
    easing: "smooth",
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [0, 0, 0],
    fade: false,
    waveform: "none",
    effect: "rgb",
    effectAmount: 8,
    effectAngle: 0,
    text: {"unit": "all", "random": false, "decode": false, "tracking": 0, "skew": 0, "mask": false},
    pivot: "anchor"
  },
  {
    id: "depth-left",
    name: {"pt-BR": "Volume à esquerda", "en-US": "Left volume"},
    category: "motion-effects",
    referenceIndex: 21,
    mode: "static",
    easing: "smooth",
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [0, 0, 0],
    fade: false,
    waveform: "none",
    effect: "extrude",
    effectAmount: 32,
    effectAngle: 180,
    text: {"unit": "all", "random": false, "decode": false, "tracking": 0, "skew": 0, "mask": false},
    pivot: "anchor"
  },
  {
    id: "depth-right",
    name: {"pt-BR": "Volume à direita", "en-US": "Right volume"},
    category: "motion-effects",
    referenceIndex: 22,
    mode: "static",
    easing: "smooth",
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [0, 0, 0],
    fade: false,
    waveform: "none",
    effect: "extrude",
    effectAmount: 32,
    effectAngle: 0,
    text: {"unit": "all", "random": false, "decode": false, "tracking": 0, "skew": 0, "mask": false},
    pivot: "anchor"
  },
  {
    id: "depth-above",
    name: {"pt-BR": "Volume superior", "en-US": "Upper volume"},
    category: "motion-effects",
    referenceIndex: 23,
    mode: "static",
    easing: "smooth",
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [0, 0, 0],
    fade: false,
    waveform: "none",
    effect: "extrude",
    effectAmount: 32,
    effectAngle: 270,
    text: {"unit": "all", "random": false, "decode": false, "tracking": 0, "skew": 0, "mask": false},
    pivot: "anchor"
  },
  {
    id: "depth-diagonal-up",
    name: {"pt-BR": "Volume diagonal superior", "en-US": "Upper diagonal volume"},
    category: "motion-effects",
    referenceIndex: 24,
    mode: "static",
    easing: "smooth",
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [0, 0, 0],
    fade: false,
    waveform: "none",
    effect: "extrude",
    effectAmount: 38,
    effectAngle: 315,
    text: {"unit": "all", "random": false, "decode": false, "tracking": 0, "skew": 0, "mask": false},
    pivot: "anchor"
  },
  {
    id: "depth-diagonal",
    name: {"pt-BR": "Volume diagonal", "en-US": "Diagonal volume"},
    category: "motion-effects",
    referenceIndex: 25,
    mode: "static",
    easing: "smooth",
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [0, 0, 0],
    fade: false,
    waveform: "none",
    effect: "extrude",
    effectAmount: 38,
    effectAngle: 45,
    text: {"unit": "all", "random": false, "decode": false, "tracking": 0, "skew": 0, "mask": false},
    pivot: "anchor"
  },
  {
    id: "cast-shadow",
    name: {"pt-BR": "Sombra estendida", "en-US": "Extended shadow"},
    category: "motion-effects",
    referenceIndex: 26,
    mode: "static",
    easing: "smooth",
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [0, 0, 0],
    fade: false,
    waveform: "none",
    effect: "shadow",
    effectAmount: 120,
    effectAngle: 45,
    text: {"unit": "all", "random": false, "decode": false, "tracking": 0, "skew": 0, "mask": false},
    pivot: "anchor"
  },
  {
    id: "striped-shadow",
    name: {"pt-BR": "Sombra listrada", "en-US": "Striped shadow"},
    category: "motion-effects",
    referenceIndex: 27,
    mode: "static",
    easing: "smooth",
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [0, 0, 0],
    fade: false,
    waveform: "none",
    effect: "shadow-stripes",
    effectAmount: 120,
    effectAngle: 45,
    text: {"unit": "all", "random": false, "decode": false, "tracking": 0, "skew": 0, "mask": false},
    pivot: "anchor"
  },
  {
    id: "fading-shadow",
    name: {"pt-BR": "Sombra em degradê", "en-US": "Fading shadow"},
    category: "motion-effects",
    referenceIndex: 28,
    mode: "static",
    easing: "smooth",
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [0, 0, 0],
    fade: false,
    waveform: "none",
    effect: "shadow-gradient",
    effectAmount: 120,
    effectAngle: 45,
    text: {"unit": "all", "random": false, "decode": false, "tracking": 0, "skew": 0, "mask": false},
    pivot: "anchor"
  },
  {
    id: "horizontal-jitter",
    name: {"pt-BR": "Tremor lateral", "en-US": "Lateral jitter"},
    category: "motion-effects",
    referenceIndex: 29,
    mode: "continuous",
    easing: "smooth",
    position: [18, 0, 0],
    rotation: [0, 0, 0],
    scale: [0, 0, 0],
    fade: false,
    waveform: "wiggle",
    effect: "none",
    effectAmount: 0,
    effectAngle: 0,
    text: {"unit": "all", "random": false, "decode": false, "tracking": 0, "skew": 0, "mask": false},
    pivot: "anchor"
  },
  {
    id: "breathing-drift",
    name: {"pt-BR": "Flutuação expansiva", "en-US": "Breathing drift"},
    category: "motion-effects",
    referenceIndex: 30,
    mode: "continuous",
    easing: "smooth",
    position: [16, 26, 0],
    rotation: [0, 0, 4],
    scale: [5, 5, 0],
    fade: false,
    waveform: "cosine",
    effect: "none",
    effectAmount: 0,
    effectAngle: 0,
    text: {"unit": "all", "random": false, "decode": false, "tracking": 0, "skew": 0, "mask": false},
    pivot: "anchor"
  },
  {
    id: "restless-drift",
    name: {"pt-BR": "Flutuação irregular", "en-US": "Restless drift"},
    category: "motion-effects",
    referenceIndex: 31,
    mode: "continuous",
    easing: "smooth",
    position: [14, 20, 0],
    rotation: [0, 0, 5],
    scale: [4, 4, 0],
    fade: false,
    waveform: "wiggle",
    effect: "none",
    effectAmount: 0,
    effectAngle: 0,
    text: {"unit": "all", "random": false, "decode": false, "tracking": 0, "skew": 0, "mask": false},
    pivot: "anchor"
  },
  {
    id: "rhythmic-hop",
    name: {"pt-BR": "Salto ritmado", "en-US": "Rhythmic hop"},
    category: "motion-effects",
    referenceIndex: 32,
    mode: "continuous",
    easing: "smooth",
    position: [0, -35, 0],
    rotation: [0, 0, 6],
    scale: [0, 0, 0],
    fade: false,
    waveform: "abs-cosine",
    effect: "none",
    effectAmount: 0,
    effectAngle: 0,
    text: {"unit": "all", "random": false, "decode": false, "tracking": 0, "skew": 0, "mask": false},
    pivot: "anchor"
  },
  {
    id: "rolling-hop",
    name: {"pt-BR": "Salto lateral", "en-US": "Rolling hop"},
    category: "motion-effects",
    referenceIndex: 33,
    mode: "continuous",
    easing: "smooth",
    position: [28, -35, 0],
    rotation: [0, 0, 8],
    scale: [0, 0, 0],
    fade: false,
    waveform: "orbit",
    effect: "none",
    effectAmount: 0,
    effectAngle: 0,
    text: {"unit": "all", "random": false, "decode": false, "tracking": 0, "skew": 0, "mask": false},
    pivot: "anchor"
  },
  {
    id: "gentle-sway",
    name: {"pt-BR": "Balanço suave", "en-US": "Gentle sway"},
    category: "motion-effects",
    referenceIndex: 34,
    mode: "continuous",
    easing: "smooth",
    position: [28, 14, 0],
    rotation: [0, 0, 5],
    scale: [0, 0, 0],
    fade: false,
    waveform: "cosine",
    effect: "none",
    effectAmount: 0,
    effectAngle: 0,
    text: {"unit": "all", "random": false, "decode": false, "tracking": 0, "skew": 0, "mask": false},
    pivot: "anchor"
  },
  {
    id: "handheld-sway",
    name: {"pt-BR": "Balanço irregular", "en-US": "Handheld sway"},
    category: "motion-effects",
    referenceIndex: 35,
    mode: "continuous",
    easing: "smooth",
    position: [12, 16, 0],
    rotation: [0, 0, 3],
    scale: [0, 0, 0],
    fade: false,
    waveform: "wiggle",
    effect: "none",
    effectAmount: 0,
    effectAngle: 0,
    text: {"unit": "all", "random": false, "decode": false, "tracking": 0, "skew": 0, "mask": false},
    pivot: "anchor"
  },
  {
    id: "letter-dissolve",
    name: {"pt-BR": "Letras em sequência", "en-US": "Sequential letters"},
    category: "text-characters",
    referenceIndex: 36,
    mode: "transition",
    choreography: { path: "rebound" },
    easing: "glide",
    position: [22, -32, -40],
    rotation: [6, -6, 0],
    scale: [0, 0, 0],
    fade: true,
    waveform: "none",
    effect: "none",
    effectAmount: 0,
    effectAngle: 0,
    text: {"unit": "characters", "random": false, "decode": false, "tracking": -8, "skew": 0, "mask": false, "blur": 4},
    pivot: "anchor"
  },
  {
    id: "text-dissolve",
    name: {"pt-BR": "Texto em conjunto", "en-US": "Unified text fade"},
    category: "text-characters",
    referenceIndex: 37,
    mode: "transition",
    choreography: { path: "swing" },
    easing: "overshoot",
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [-20, -20, 0],
    fade: true,
    waveform: "none",
    effect: "none",
    effectAmount: 0,
    effectAngle: 0,
    text: {"unit": "all", "random": false, "decode": false, "tracking": 0, "skew": 0, "mask": false, "blur": 8},
    pivot: "anchor"
  },
  {
    id: "letter-stretch-rise",
    name: {"pt-BR": "Letras que se abrem", "en-US": "Unfolding letters"},
    category: "text-characters",
    referenceIndex: 38,
    mode: "transition",
    choreography: { path: "arc" },
    easing: "spring",
    position: [0, 80, 0],
    rotation: [0, 0, 12],
    scale: [0, -100, 0],
    fade: true,
    waveform: "none",
    effect: "none",
    effectAmount: 0,
    effectAngle: 0,
    text: {"unit": "characters", "random": false, "decode": false, "tracking": 8, "skew": 0, "mask": false, "blur": 12},
    pivot: "anchor"
  },
  {
    id: "scattered-letters",
    name: {"pt-BR": "Letras dispersas", "en-US": "Scattered letters"},
    category: "text-characters",
    referenceIndex: 39,
    mode: "transition",
    choreography: { path: "spiral" },
    easing: "overshoot",
    position: [100, 80, 0],
    rotation: [0, 0, 25],
    scale: [-65, -65, 0],
    fade: true,
    waveform: "none",
    effect: "none",
    effectAmount: 0,
    effectAngle: 0,
    text: {"unit": "characters", "random": true, "decode": false, "tracking": 16, "skew": 0, "mask": false, "blur": 0},
    pivot: "anchor"
  },
  {
    id: "spring-letters",
    name: {"pt-BR": "Letras elásticas", "en-US": "Spring letters"},
    category: "text-characters",
    referenceIndex: 40,
    mode: "transition",
    easing: "glide",
    position: [0, 80, 0],
    rotation: [0, 0, -20],
    scale: [-100, -100, 0],
    fade: true,
    waveform: "none",
    effect: "none",
    effectAmount: 0,
    effectAngle: 0,
    text: {"unit": "characters", "random": false, "decode": false, "tracking": -16, "skew": 0, "mask": false, "blur": 4},
    pivot: "anchor"
  },
  {
    id: "word-signal",
    name: {"pt-BR": "Palavras em sinal", "en-US": "Word signal"},
    category: "text-words",
    referenceIndex: 41,
    mode: "transition",
    choreography: { path: "rebound" },
    easing: "spring",
    position: [32, -42, 10],
    rotation: [11, -11, 0],
    scale: [-45, -45, 0],
    fade: true,
    waveform: "none",
    effect: "none",
    effectAmount: 0,
    effectAngle: 0,
    text: {"unit": "words", "random": false, "decode": true, "tracking": -8, "skew": 0, "mask": false, "blur": 8},
    pivot: "anchor"
  },
  {
    id: "word-scramble-burst",
    name: {"pt-BR": "Palavras em expansão", "en-US": "Word scramble burst"},
    category: "text-words",
    referenceIndex: 42,
    mode: "transition",
    choreography: { path: "swing" },
    easing: "glide",
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [-45, -45, 0],
    fade: true,
    waveform: "none",
    effect: "none",
    effectAmount: 0,
    effectAngle: 0,
    text: {"unit": "words", "random": true, "decode": true, "tracking": 0, "skew": 0, "mask": false, "blur": 12},
    pivot: "anchor"
  },
  {
    id: "word-rise",
    name: {"pt-BR": "Palavras ascendentes", "en-US": "Rising words"},
    category: "text-words",
    referenceIndex: 43,
    mode: "transition",
    choreography: { path: "arc" },
    easing: "overshoot",
    position: [0, 100, 0],
    rotation: [0, 0, 0],
    scale: [0, 0, 0],
    fade: true,
    waveform: "none",
    effect: "none",
    effectAmount: 0,
    effectAngle: 0,
    text: {"unit": "words", "random": false, "decode": false, "tracking": 8, "skew": 0, "mask": false, "blur": 0},
    pivot: "anchor"
  },
  {
    id: "word-slide",
    name: {"pt-BR": "Palavras deslizantes", "en-US": "Sliding words"},
    category: "text-words",
    referenceIndex: 44,
    mode: "transition",
    choreography: { path: "spiral" },
    easing: "spring",
    position: [140, 0, 0],
    rotation: [0, 0, 0],
    scale: [0, 0, 0],
    fade: true,
    waveform: "none",
    effect: "none",
    effectAmount: 0,
    effectAngle: 0,
    text: {"unit": "words", "random": false, "decode": false, "tracking": 16, "skew": 0, "mask": false, "blur": 4},
    pivot: "anchor"
  },
  {
    id: "word-curtain",
    name: {"pt-BR": "Palavras sob recorte", "en-US": "Word curtain"},
    category: "text-words",
    referenceIndex: 45,
    mode: "transition",
    easing: "overshoot",
    position: [0, 100, 0],
    rotation: [0, 0, 0],
    scale: [0, 0, 0],
    fade: true,
    waveform: "none",
    effect: "none",
    effectAmount: 0,
    effectAngle: 0,
    text: {"unit": "words", "random": false, "decode": false, "tracking": -16, "skew": 0, "mask": true, "blur": 8},
    pivot: "anchor"
  },
  {
    id: "word-tilt-rise",
    name: {"pt-BR": "Palavras inclinadas", "en-US": "Tilting words"},
    category: "text-words",
    referenceIndex: 46,
    mode: "transition",
    choreography: { path: "rebound" },
    easing: "glide",
    position: [42, -52, 60],
    rotation: [16, -16, 0],
    scale: [0, 0, 0],
    fade: true,
    waveform: "none",
    effect: "none",
    effectAmount: 0,
    effectAngle: 0,
    text: {"unit": "words", "random": false, "decode": false, "tracking": -8, "skew": 0, "mask": false, "blur": 12},
    pivot: "anchor"
  },
  {
    id: "word-swing-in",
    name: {"pt-BR": "Palavras em balanço", "en-US": "Swinging words"},
    category: "text-words",
    referenceIndex: 47,
    mode: "transition",
    choreography: { path: "swing" },
    easing: "spring",
    position: [120, 0, 0],
    rotation: [0, 0, 28],
    scale: [-70, -70, 0],
    fade: true,
    waveform: "none",
    effect: "none",
    effectAmount: 0,
    effectAngle: 0,
    text: {"unit": "words", "random": false, "decode": false, "tracking": 0, "skew": 0, "mask": false, "blur": 0},
    pivot: "anchor"
  },
  {
    id: "lively-lines",
    name: {"pt-BR": "Linhas vibrantes", "en-US": "Lively lines"},
    category: "text-lines",
    referenceIndex: 48,
    mode: "transition",
    choreography: { path: "arc" },
    easing: "glide",
    position: [0, 90, 0],
    rotation: [0, 0, 10],
    scale: [-30, -30, 0],
    fade: true,
    waveform: "wiggle",
    effect: "none",
    effectAmount: 0,
    effectAngle: 0,
    text: {"unit": "lines", "random": false, "decode": false, "tracking": 8, "skew": 0, "mask": false, "blur": 4},
    pivot: "anchor"
  },
  {
    id: "line-spark",
    name: {"pt-BR": "Linhas intermitentes", "en-US": "Flickering lines"},
    category: "text-lines",
    referenceIndex: 49,
    mode: "transition",
    choreography: { path: "spiral" },
    easing: "overshoot",
    position: [40, 60, 0],
    rotation: [0, 0, 0],
    scale: [-50, -50, 0],
    fade: true,
    waveform: "none",
    effect: "none",
    effectAmount: 0,
    effectAngle: 0,
    text: {"unit": "lines", "random": true, "decode": false, "tracking": 16, "skew": 0, "mask": false, "blur": 8},
    pivot: "anchor"
  },
  {
    id: "line-resolve",
    name: {"pt-BR": "Linhas decifradas", "en-US": "Resolving lines"},
    category: "text-lines",
    referenceIndex: 50,
    mode: "transition",
    easing: "spring",
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [0, 0, 0],
    fade: true,
    waveform: "none",
    effect: "none",
    effectAmount: 0,
    effectAngle: 0,
    text: {"unit": "lines", "random": false, "decode": true, "tracking": -16, "skew": 0, "mask": false, "blur": 12},
    pivot: "anchor"
  },
  {
    id: "living-code",
    name: {"pt-BR": "Código vivo", "en-US": "Living code"},
    category: "text-effects",
    referenceIndex: 51,
    mode: "continuous",
    choreography: { path: "rebound" },
    easing: "overshoot",
    position: [52, -62, 110],
    rotation: [21, -21, 0],
    scale: [0, 0, 0],
    fade: false,
    waveform: "wiggle",
    effect: "none",
    effectAmount: 0,
    effectAngle: 0,
    text: {"unit": "characters", "random": true, "decode": true, "tracking": -8, "skew": 0, "mask": false, "blur": 0},
    pivot: "anchor"
  },
  {
    id: "signal-spacing",
    name: {"pt-BR": "Sinal espaçado", "en-US": "Spaced signal"},
    category: "text-effects",
    referenceIndex: 52,
    mode: "continuous",
    choreography: { path: "swing" },
    easing: "glide",
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [-95, -95, 0],
    fade: true,
    waveform: "wiggle",
    effect: "none",
    effectAmount: 0,
    effectAngle: 0,
    text: {"unit": "characters", "random": false, "decode": true, "tracking": 0, "skew": 0, "mask": false, "blur": 4},
    pivot: "anchor"
  },
  {
    id: "letter-shimmer",
    name: {"pt-BR": "Letras oscilantes", "en-US": "Letter shimmer"},
    category: "text-effects",
    referenceIndex: 53,
    mode: "continuous",
    choreography: { path: "arc" },
    easing: "spring",
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [0, 0, 0],
    fade: true,
    waveform: "wiggle",
    effect: "none",
    effectAmount: 0,
    effectAngle: 0,
    text: {"unit": "characters", "random": false, "decode": false, "tracking": 8, "skew": 0, "mask": false, "blur": 8},
    pivot: "anchor"
  },
  {
    id: "letter-wobble",
    name: {"pt-BR": "Letras flexíveis", "en-US": "Flexible letters"},
    category: "text-effects",
    referenceIndex: 54,
    mode: "continuous",
    choreography: { path: "spiral" },
    easing: "glide",
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [0, 0, 0],
    fade: false,
    waveform: "wiggle",
    effect: "none",
    effectAmount: 0,
    effectAngle: 0,
    text: {"unit": "characters", "random": false, "decode": false, "tracking": 16, "skew": 12, "mask": false, "blur": 12},
    pivot: "anchor"
  },
  {
    id: "liquid-letters",
    name: {"pt-BR": "Letras líquidas", "en-US": "Liquid letters"},
    category: "text-effects",
    referenceIndex: 55,
    mode: "continuous",
    easing: "overshoot",
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [0, 0, 0],
    fade: false,
    waveform: "wiggle",
    effect: "turbulent",
    effectAmount: 12,
    effectAngle: 0,
    text: {"unit": "characters", "random": false, "decode": false, "tracking": -16, "skew": 0, "mask": false, "blur": 0},
    pivot: "anchor"
  },

  {
    id: "gemini-hyper-elastic",
    name: {"pt-BR": "Salto Hiper-elástico", "en-US": "Hyper Elastic Bounce"},
    category: "text-characters",
    referenceIndex: null,
    collection: "gemini",
    mode: "transition",
    choreography: { path: "rebound", distribution: "alternate" },
    easing: "spring",
    position: [0, -180, 0],
    rotation: [0, 0, 15],
    scale: [-80, -80, 0],
    fade: true,
    waveform: "none",
    effect: "blur",
    effectAmount: 15,
    effectAngle: 0,
    text: {"unit": "characters", "random": false, "decode": false, "tracking": -10, "skew": 0, "mask": false, "blur": 8},
    pivot: "anchor",
    defaults: { durationFrames: 45, elasticity: 60, overlap: 65 }
  },
  {
    id: "gemini-cinematic-sweep",
    name: {"pt-BR": "Varredura Cinematográfica", "en-US": "Cinematic Sweep"},
    category: "text-words",
    referenceIndex: null,
    collection: "gemini",
    mode: "transition",
    choreography: { path: "arc" },
    easing: "glide",
    position: [-200, 40, -100],
    rotation: [0, -30, 0],
    scale: [0, 0, 0],
    fade: true,
    waveform: "none",
    effect: "none",
    effectAmount: 0,
    effectAngle: 0,
    text: {"unit": "words", "random": false, "decode": false, "tracking": 15, "skew": -10, "mask": false, "blur": 25},
    pivot: "edge",
    defaults: { durationFrames: 50, staggerFrames: 6, overlap: 80 }
  },
  {
    id: "gemini-digital-rain",
    name: {"pt-BR": "Chuva Digital", "en-US": "Digital Rain"},
    category: "text-characters",
    referenceIndex: null,
    collection: "gemini",
    mode: "transition",
    choreography: { path: "linear" },
    easing: "smooth",
    position: [0, -200, 0],
    rotation: [0, 0, 0],
    scale: [0, 0, 0],
    fade: true,
    waveform: "none",
    effect: "rgb",
    effectAmount: 30,
    effectAngle: 90,
    text: {"unit": "characters", "random": true, "decode": true, "tracking": 5, "skew": 0, "mask": false, "blur": 0},
    pivot: "anchor",
    defaults: { durationFrames: 30, staggerFrames: 1, overlap: 90 }
  },
  {
    id: "gemini-slow-drift",
    name: {"pt-BR": "Deriva Lenta", "en-US": "Slow Drift"},
    category: "text-lines",
    referenceIndex: null,
    collection: "gemini",
    mode: "transition",
    choreography: { path: "swing" },
    easing: "silk",
    position: [50, 20, 200],
    rotation: [10, -5, 0],
    scale: [0, 0, 0],
    fade: true,
    waveform: "none",
    effect: "none",
    effectAmount: 0,
    effectAngle: 0,
    text: {"unit": "lines", "random": false, "decode": false, "tracking": -5, "skew": 0, "mask": false, "blur": 10},
    pivot: "anchor",
    defaults: { durationFrames: 60, staggerFrames: 10, overlap: 70 }
  },
  {
    id: "gemini-aggressive-pop",
    name: {"pt-BR": "Estouro Agressivo", "en-US": "Aggressive Pop"},
    category: "text-words",
    referenceIndex: null,
    collection: "gemini",
    mode: "transition",
    choreography: { path: "spiral" },
    easing: "overshoot",
    position: [0, 0, -400],
    rotation: [0, 0, -45],
    scale: [-100, -100, 0],
    fade: true,
    waveform: "none",
    effect: "contrast",
    effectAmount: 40,
    effectAngle: 0,
    text: {"unit": "words", "random": false, "decode": false, "tracking": 20, "skew": 0, "mask": false, "blur": 5},
    pivot: "anchor",
    defaults: { durationFrames: 25, staggerFrames: 3, overlap: 50 }
  },
  ...MOTION_LIBRARY_STUDIO_PRESETS,
  {
    id: "premium-elastic-drop",
    name: {"pt-BR": "Queda elástica premium", "en-US": "Premium elastic drop"},
    category: "motion-2d",
    referenceIndex: null,
    collection: "gemini",
    mode: "transition",
    easing: "overshoot",
    position: [0, -400, 0],
    rotation: [0, 0, 0],
    scale: [-50, -50, 0],
    fade: true,
    waveform: "none",
    effect: "none",
    effectAmount: 0,
    effectAngle: 0,
    text: {"unit": "all", "random": false, "decode": false, "tracking": 0, "skew": 0, "mask": false},
    pivot: "anchor"
  },
  {
    id: "cinematic-pan",
    name: {"pt-BR": "Panorâmica cinematográfica", "en-US": "Cinematic pan"},
    category: "motion-2d",
    referenceIndex: null,
    collection: "gemini",
    mode: "transition",
    easing: "smooth",
    position: [0, 150, 0],
    rotation: [0, 0, 0],
    scale: [0, 0, 0],
    fade: true,
    waveform: "none",
    effect: "none",
    effectAmount: 0,
    effectAngle: 0,
    text: {"unit": "all", "random": false, "decode": false, "tracking": 0, "skew": 0, "mask": false},
    pivot: "anchor"
  },
  {
    id: "glitch-slide",
    name: {"pt-BR": "Deslizamento glitch", "en-US": "Glitch slide"},
    category: "motion-2d",
    referenceIndex: null,
    collection: "gemini",
    mode: "transition",
    easing: "bounce",
    position: [0, -180, 0],
    rotation: [0, 0, 0],
    scale: [0, 0, 0],
    fade: true,
    waveform: "none",
    effect: "blur",
    effectAmount: 35,
    effectAngle: 90,
    text: {"unit": "all", "random": false, "decode": false, "tracking": 0, "skew": 0, "mask": false},
    pivot: "anchor"
  },
  {
    id: "dynamic-flip-3d",
    name: {"pt-BR": "Giro 3D dinâmico", "en-US": "Dynamic 3D flip"},
    category: "motion-3d",
    referenceIndex: null,
    collection: "gemini",
    mode: "transition",
    easing: "overshoot",
    position: [0, 0, 0],
    rotation: [180, 180, 0],
    scale: [0, 0, 0],
    fade: true,
    waveform: "none",
    effect: "none",
    effectAmount: 0,
    effectAngle: 0,
    text: {"unit": "all", "random": false, "decode": false, "tracking": 0, "skew": 0, "mask": false},
    pivot: "anchor"
  },
  {
    id: "smooth-z-push",
    name: {"pt-BR": "Avanço Z suave", "en-US": "Smooth Z push"},
    category: "motion-3d",
    referenceIndex: null,
    collection: "gemini",
    mode: "transition",
    easing: "smooth",
    position: [0, 0, -800],
    rotation: [0, 0, 0],
    scale: [0, 0, 0],
    fade: true,
    waveform: "none",
    effect: "none",
    effectAmount: 0,
    effectAngle: 0,
    text: {"unit": "all", "random": false, "decode": false, "tracking": 0, "skew": 0, "mask": false},
    pivot: "anchor"
  },
  {
    id: "aggressive-orbit",
    name: {"pt-BR": "Órbita agressiva", "en-US": "Aggressive orbit"},
    category: "motion-3d",
    referenceIndex: null,
    collection: "gemini",
    mode: "transition",
    easing: "bounce",
    position: [0, 0, 0],
    rotation: [0, -270, 0],
    scale: [-80, -80, 0],
    fade: true,
    waveform: "none",
    effect: "none",
    effectAmount: 0,
    effectAngle: 0,
    text: {"unit": "all", "random": false, "decode": false, "tracking": 0, "skew": 0, "mask": false},
    pivot: "anchor"
  },
  {
    id: "premium-rgb-split",
    name: {"pt-BR": "Separação RGB premium", "en-US": "Premium RGB split"},
    category: "motion-effects",
    referenceIndex: null,
    collection: "gemini",
    mode: "continuous",
    easing: "smooth",
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [0, 0, 0],
    fade: false,
    waveform: "wiggle",
    effect: "rgb",
    effectAmount: 25,
    effectAngle: 0,
    text: {"unit": "all", "random": false, "decode": false, "tracking": 0, "skew": 0, "mask": false},
    pivot: "anchor"
  },
  {
    id: "soft-dream-blur",
    name: {"pt-BR": "Desfoque de sonho", "en-US": "Soft dream blur"},
    category: "motion-effects",
    referenceIndex: null,
    collection: "gemini",
    mode: "continuous",
    easing: "smooth",
    position: [0, 15, 0],
    rotation: [0, 0, 0],
    scale: [0, 0, 0],
    fade: false,
    waveform: "cosine",
    effect: "blur-wave",
    effectAmount: 40,
    effectAngle: 0,
    text: {"unit": "all", "random": false, "decode": false, "tracking": 0, "skew": 0, "mask": false},
    pivot: "anchor"
  },
  {
    id: "cinematic-contrast",
    name: {"pt-BR": "Contraste cinematográfico", "en-US": "Cinematic contrast"},
    category: "motion-effects",
    referenceIndex: null,
    collection: "gemini",
    mode: "static",
    easing: "smooth",
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [0, 0, 0],
    fade: false,
    waveform: "none",
    effect: "contrast",
    effectAmount: 60,
    effectAngle: 0,
    text: {"unit": "all", "random": false, "decode": false, "tracking": 0, "skew": 0, "mask": false},
    pivot: "anchor"
  },
  {
    id: "elegant-decode",
    name: {"pt-BR": "Decodificação elegante", "en-US": "Elegant decode"},
    category: "text-characters",
    referenceIndex: null,
    collection: "gemini",
    mode: "transition",
    choreography: { path: "rebound" },
    easing: "spring",
    position: [62, -72, 160],
    rotation: [26, -26, 0],
    scale: [0, 0, 0],
    fade: true,
    waveform: "none",
    effect: "none",
    effectAmount: 0,
    effectAngle: 0,
    text: {"unit": "characters", "random": false, "decode": true, "tracking": -8, "skew": 0, "mask": false, "blur": 4},
    pivot: "anchor"
  },
  {
    id: "bouncy-letters",
    name: {"pt-BR": "Letras saltitantes", "en-US": "Bouncy letters"},
    category: "text-characters",
    referenceIndex: null,
    collection: "gemini",
    mode: "transition",
    choreography: { path: "swing" },
    easing: "overshoot",
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [-120, -120, 0],
    fade: true,
    waveform: "none",
    effect: "none",
    effectAmount: 0,
    effectAngle: 0,
    text: {"unit": "characters", "random": false, "decode": false, "tracking": 0, "skew": 0, "mask": false, "blur": 8},
    pivot: "anchor"
  },
  {
    id: "glitchy-chars",
    name: {"pt-BR": "Caracteres com glitch", "en-US": "Glitchy chars"},
    category: "text-characters",
    referenceIndex: null,
    collection: "gemini",
    mode: "transition",
    choreography: { path: "arc" },
    easing: "glide",
    position: [0, 40, 0],
    rotation: [0, 0, 0],
    scale: [0, 0, 0],
    fade: true,
    waveform: "none",
    effect: "rgb",
    effectAmount: 15,
    effectAngle: 0,
    text: {"unit": "characters", "random": true, "decode": false, "tracking": 8, "skew": 0, "mask": false, "blur": 12},
    pivot: "anchor"
  },
  {
    id: "smooth-word-slide",
    name: {"pt-BR": "Deslizamento suave de palavras", "en-US": "Smooth word slide"},
    category: "text-words",
    referenceIndex: null,
    collection: "gemini",
    mode: "transition",
    choreography: { path: "spiral" },
    easing: "spring",
    position: [0, 80, 0],
    rotation: [0, 0, 0],
    scale: [0, 0, 0],
    fade: true,
    waveform: "none",
    effect: "none",
    effectAmount: 0,
    effectAngle: 0,
    text: {"unit": "words", "random": false, "decode": false, "tracking": 16, "skew": 0, "mask": true, "blur": 0},
    pivot: "anchor"
  },
  {
    id: "impact-words",
    name: {"pt-BR": "Palavras de impacto", "en-US": "Impact words"},
    category: "text-words",
    referenceIndex: null,
    collection: "gemini",
    mode: "transition",
    easing: "glide",
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [50, 50, 0],
    fade: true,
    waveform: "none",
    effect: "none",
    effectAmount: 0,
    effectAngle: 0,
    text: {"unit": "words", "random": false, "decode": false, "tracking": -16, "skew": 0, "mask": false, "blur": 4},
    pivot: "anchor"
  },
  {
    id: "cinematic-line-drop",
    name: {"pt-BR": "Queda de linha cinematográfica", "en-US": "Cinematic line drop"},
    category: "text-lines",
    referenceIndex: null,
    collection: "gemini",
    mode: "transition",
    choreography: { path: "rebound" },
    easing: "overshoot",
    position: [72, -82, 210],
    rotation: [31, -31, 0],
    scale: [0, 0, 0],
    fade: true,
    waveform: "none",
    effect: "none",
    effectAmount: 0,
    effectAngle: 0,
    text: {"unit": "lines", "random": false, "decode": false, "tracking": -8, "skew": 0, "mask": false, "blur": 8},
    pivot: "anchor"
  },
  {
    id: "neon-glitch-strike",
    name: {"pt-BR": "Glitch de Neon", "en-US": "Neon Glitch Strike"},
    category: "motion-effects",
    referenceIndex: null,
    collection: "gemini",
    mode: "continuous",
    easing: "flicker",
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [0, 0, 0],
    fade: false,
    waveform: "wiggle",
    effect: "chroma2",
    effectAmount: 30,
    effectAngle: 0,
    text: {"unit": "all", "random": false, "decode": false, "tracking": 0, "skew": 0, "mask": false},
    pivot: "anchor"
  },
  {
    id: "cyber-text-reveal",
    name: {"pt-BR": "Revelação Cyberpunk", "en-US": "Cyberpunk Text Reveal"},
    category: "text-characters",
    referenceIndex: null,
    collection: "gemini",
    mode: "transition",
    choreography: { path: "swing" },
    easing: "spring",
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [-145, -145, 0],
    fade: true,
    waveform: "none",
    effect: "rgb",
    effectAmount: 25,
    effectAngle: 0,
    text: {"unit": "characters", "random": true, "decode": true, "tracking": 0, "skew": 0, "mask": false, "blur": 12},
    pivot: "anchor"
  },
  {
    id: "digital-overload",
    name: {"pt-BR": "Sobrecarga Digital", "en-US": "Digital Overload"},
    category: "motion-effects",
    referenceIndex: null,
    collection: "gemini",
    mode: "continuous",
    easing: "bounce",
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [40, 40, 0],
    fade: false,
    waveform: "wiggle",
    effect: "turbulent",
    effectAmount: 40,
    effectAngle: 0,
    text: {"unit": "all", "random": false, "decode": false, "tracking": 0, "skew": 0, "mask": false},
    pivot: "anchor"
  },
  {
    id: "cinematic-deep-focus",
    name: {"pt-BR": "Foco Profundo", "en-US": "Cinematic Deep Focus"},
    category: "motion-effects",
    referenceIndex: null,
    collection: "gemini",
    mode: "transition",
    easing: "smooth",
    position: [0, 0, -800],
    rotation: [0, 0, 0],
    scale: [0, 0, 0],
    fade: true,
    waveform: "none",
    effect: "blur",
    effectAmount: 45,
    effectAngle: 0,
    text: {"unit": "all", "random": false, "decode": false, "tracking": 0, "skew": 0, "mask": false},
    pivot: "anchor",
    defaults: { phase: "both" }
  },
  {
    id: "epic-title-float",
    name: {"pt-BR": "Título Épico Flutuante", "en-US": "Epic Title Float"},
    category: "text-words",
    referenceIndex: null,
    collection: "gemini",
    mode: "transition",
    easing: "smooth",
    position: [0, 60, 0],
    rotation: [0, 0, 0],
    scale: [0, 0, 0],
    fade: true,
    waveform: "none",
    effect: "shadow-gradient",
    effectAmount: 40,
    effectAngle: 180,
    text: {"unit": "words", "random": false, "decode": false, "tracking": 0, "skew": 0, "mask": false, "blur": 15},
    pivot: "anchor",
    defaults: { phase: "both" }
  },
  {
    id: "luxury-extrusion",
    name: {"pt-BR": "Extrusão de Luxo", "en-US": "Luxury Extrusion"},
    category: "motion-3d",
    referenceIndex: null,
    collection: "gemini",
    mode: "transition",
    easing: "smooth",
    position: [0, 0, 0],
    rotation: [-35, 45, 0],
    scale: [0, 0, 0],
    fade: true,
    waveform: "none",
    effect: "extrude",
    effectAmount: 40,
    effectAngle: 0,
    text: {"unit": "all", "random": false, "decode": false, "tracking": 0, "skew": 0, "mask": false},
    pivot: "anchor",
    defaults: { phase: "both" }
  },
  {
    id: "pop-duotone-spring",
    name: {"pt-BR": "Estouro Pop (Duotone)", "en-US": "Pop Duotone Spring"},
    category: "motion-effects",
    referenceIndex: null,
    collection: "gemini",
    mode: "transition",
    easing: "spring",
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [-100, -100, 0],
    fade: true,
    waveform: "none",
    effect: "duotone",
    effectAmount: 100,
    effectAngle: 0,
    text: {"unit": "all", "random": false, "decode": false, "tracking": 0, "skew": 0, "mask": false},
    pivot: "anchor",
    defaults: { phase: "both", elasticity: 60 }
  },
  {
    id: "jelly-text-bounce",
    name: {"pt-BR": "Texto de Gelatina", "en-US": "Jelly Text Bounce"},
    category: "text-characters",
    referenceIndex: null,
    collection: "gemini",
    mode: "transition",
    easing: "bounce",
    position: [0, -100, 0],
    rotation: [0, 0, 0],
    scale: [-100, -100, 0],
    fade: true,
    waveform: "none",
    effect: "none",
    effectAmount: 0,
    effectAngle: 0,
    text: {"unit": "characters", "random": false, "decode": false, "tracking": 0, "skew": 0, "mask": false},
    pivot: "anchor",
    defaults: { phase: "both" }
  },
  {
    id: "happy-whip-pan",
    name: {"pt-BR": "Whip Pan Animado", "en-US": "Happy Whip Pan"},
    category: "motion-2d",
    referenceIndex: null,
    collection: "gemini",
    mode: "transition",
    easing: "silk",
    position: [0, 400, 0],
    rotation: [0, 0, 15],
    scale: [0, 0, 0],
    fade: true,
    waveform: "none",
    effect: "contrast",
    effectAmount: 20,
    effectAngle: 0,
    text: {"unit": "all", "random": false, "decode": false, "tracking": 0, "skew": 0, "mask": false},
    pivot: "anchor",
    defaults: { phase: "both" }
  },
  ...MOTION_LIBRARY_CAMERA_PRESETS,
  ...MOTION_LIBRARY_NATIVE_PRESETS,
  ...MOTION_LIBRARY_PREMIUM_PRESETS
];
