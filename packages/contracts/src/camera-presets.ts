/**
 * Camera shot recipes for the Parallax tab. Original Moti.on recipes: the names
 * come from the user's own camera study and are generic film terms; no preset,
 * expression or value was copied from another plugin (MASTER_BUILD_SPEC §0.8).
 *
 * A recipe is declarative data, validated before it reaches the host, and never
 * carries project ids. Amounts are normalized by `camera-kernel.ts`: X by the
 * visible width, Y by the visible height and Z by the camera distance, so one
 * recipe reads the same on a 1080×1920 flyer and a 1920×1080 frame.
 */
export const CAMERA_RECIPE_SCHEMA_VERSION = 1;

/** Groups follow the designer's intention, not the camera axis. */
export const CAMERA_INTENTS = ["highlight", "reveal", "traverse", "impact", "breathe"] as const;
export type CameraIntent = typeof CAMERA_INTENTS[number];

export const CAMERA_SHOT_KINDS = ["move", "pulse", "loop"] as const;
export const CAMERA_SHOT_DIRECTIONS = ["to", "from", "through"] as const;

/** Curves offered for camera moves: the shared library curves plus "impact". */
export const CAMERA_CURVES = ["silk", "glide", "sine-in-out", "quad-in-out", "quint-in-out", "expo-in-out",
  "velvet", "drift", "snap", "smooth", "sine-in", "quad-in", "expo-in", "impact"] as const;
export type CameraCurve = typeof CAMERA_CURVES[number];

export interface CameraShotShape {
  kind: typeof CAMERA_SHOT_KINDS[number];
  dir: typeof CAMERA_SHOT_DIRECTIONS[number];
  curve: CameraCurve;
  tr: [number, number, number];
  rot: [number, number, number];
  orb: [number, number];
  lens: number;
  dolly: number;
  imp: [number, number, number, number, number];
  org: [number, number, number, number];
}

export interface CameraRecipe {
  schemaVersion: 1;
  id: string;
  version: number;
  intent: CameraIntent;
  /** First delivery that verifies the recipe in After Effects. */
  milestone: 1 | 2 | 3;
  name: { "pt-BR": string; "en-US": string };
  description: { "pt-BR": string; "en-US": string };
  durationSeconds: number;
  /** Recipes with fast moves ask for native motion blur when applied. */
  motionBlur: boolean;
  shot: CameraShotShape;
}

const STILL: CameraShotShape = {
  kind: "move", dir: "to", curve: "silk", tr: [0, 0, 0], rot: [0, 0, 0], orb: [0, 0], lens: 1, dolly: 0,
  imp: [0, 0.2, 0, 1.2, 4], org: [6, 1847, 6, 0]
};

function recipe(id: string, intent: CameraIntent, milestone: 1 | 2 | 3, pt: string, en: string, ptDescription: string,
  enDescription: string, durationSeconds: number, motionBlur: boolean, shot: Partial<CameraShotShape>): CameraRecipe {
  return {
    schemaVersion: 1, id, version: 1, intent, milestone, name: { "pt-BR": pt, "en-US": en },
    description: { "pt-BR": ptDescription, "en-US": enDescription }, durationSeconds, motionBlur,
    shot: { ...STILL, ...shot }
  };
}

/** The eleven study shots that the engine supports today (Rack Reveal waits for rack focus). */
export const CAMERA_RECIPES: readonly CameraRecipe[] = [
  recipe("hero-push", "highlight", 1, "Hero Push", "Hero Push",
    "Avanço suave em profundidade que valoriza o protagonista.", "A gentle push in depth that sells the hero.",
    4, false, { curve: "silk", tr: [0, 0, 0.08] }),
  recipe("depth-slide", "traverse", 1, "Depth Slide", "Depth Slide",
    "Travelling lateral que atravessa os planos, com leve contra-pan.", "A lateral track across the planes with a slight counter-pan.",
    3, false, { dir: "through", curve: "sine-in-out", tr: [0.07, 0, 0.02], rot: [-1, 0, 0] }),
  recipe("float-loop", "breathe", 1, "Float Loop", "Float Loop",
    "Respiração contínua que fecha o loop sem emenda.", "A continuous breath that closes its loop seamlessly.",
    6, false, { kind: "loop", tr: [0.01, 0.006, 0], rot: [0, 0, 0.25], org: [6, 1847, 6, 0] }),
  recipe("reveal-pull", "reveal", 2, "Reveal Pull", "Reveal Pull",
    "Começa perto e recua até revelar o layout completo.", "Starts close and pulls back to reveal the full layout.",
    3, false, { dir: "from", curve: "drift", tr: [0, 0.02, 0.1] }),
  recipe("pedestal-reveal", "reveal", 2, "Pedestal Reveal", "Pedestal Reveal",
    "Sobe até o enquadramento final com o tilt compensado.", "Rises into the final frame with a compensated tilt.",
    2.5, false, { dir: "from", curve: "glide", tr: [0, 0.06, 0], rot: [0, 1.5, 0] }),
  recipe("arc-hero", "highlight", 2, "Arc Hero", "Arc Hero",
    "Arco curto em volta do protagonista, sem sair do foco.", "A short arc around the hero that keeps it centered.",
    4, false, { dir: "through", curve: "sine-in-out", tr: [0, 0, 0.02], orb: [6, 2] }),
  recipe("punch-in", "impact", 2, "Punch In", "Punch In",
    "Avanço rápido com ultrapassagem e acomodação.", "A fast push with overshoot and settle.",
    0.55, true, { curve: "impact", tr: [0, 0, 0.05], imp: [0, 0.16, 0.06, 1.5, 4] }),
  recipe("whip-reframe", "traverse", 2, "Whip Reframe", "Whip Reframe",
    "Chicote de pan para reenquadrar; pede motion blur.", "A whip pan that reframes; asks for motion blur.",
    // 5° moves the pivot ~260 px at Parallax zoom 3000; a vertical flyer only sees
    // ±10° horizontally, so a bigger pan would end with the design out of frame.
    0.35, true, { curve: "expo-in-out", rot: [5, 0, 0] }),
  recipe("dolly-zoom", "highlight", 2, "Dolly Zoom", "Dolly Zoom",
    "Avança e compensa a lente: o plano de foco fica, o fundo muda.", "Pushes in and compensates the lens: the focal plane stays, the depth shifts.",
    3, false, { curve: "sine-in-out", tr: [0, 0, 0.12], dolly: 1 }),
  recipe("beat-hit", "impact", 2, "Beat Hit", "Beat Hit",
    "Batida curta que volta ao lugar, para marcar o ritmo.", "A short hit that returns to rest to mark the beat.",
    0.35, true, { kind: "pulse", tr: [0, 0, 0.02], rot: [0, 0, 0.4], imp: [0, 0.2, 0, 1.2, 5] }),
  recipe("controlled-handheld", "breathe", 2, "Controlled Handheld", "Controlled Handheld",
    "Câmera na mão contida: drift lento e tremor fino, com semente.", "Restrained handheld: slow drift and fine tremor, seeded.",
    6, false, { kind: "loop", tr: [0.003, 0.003, 0.001], rot: [0.15, 0.15, 0.2], org: [6, 4242, 7, 0.35] })
];

const RECIPE_KEYS = ["schemaVersion", "id", "version", "intent", "milestone", "name", "description", "durationSeconds", "motionBlur", "shot"];
const SHOT_KEYS = ["kind", "dir", "curve", "tr", "rot", "orb", "lens", "dolly", "imp", "org"];

function ownKeysOnly(value: object, allowed: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === allowed.length && keys.every((key) => allowed.includes(key)) &&
    Object.getOwnPropertyNames(value).every((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return Boolean(descriptor && "value" in descriptor);
    });
}

function finiteArray(value: unknown, length: number, min: number, max: number): boolean {
  return Array.isArray(value) && value.length === length &&
    value.every((item) => typeof item === "number" && Number.isFinite(item) && item >= min && item <= max);
}

function bilingual(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const text = value as Record<string, unknown>;
  return ownKeysOnly(text, ["pt-BR", "en-US"]) && ["pt-BR", "en-US"].every((locale) =>
    typeof text[locale] === "string" && (text[locale] as string).length > 0 && (text[locale] as string).length <= 160);
}

/** Validates a shot shape: own data keys only, finite numbers within the limits
 * the kernel and the host accept. */
export function isCameraShotShape(value: unknown): value is CameraShotShape {
  if (!value || typeof value !== "object" || !ownKeysOnly(value, SHOT_KEYS)) return false;
  const shot = value as Record<string, unknown>;
  if (!(CAMERA_SHOT_KINDS as readonly unknown[]).includes(shot.kind) ||
    !(CAMERA_SHOT_DIRECTIONS as readonly unknown[]).includes(shot.dir) ||
    !(CAMERA_CURVES as readonly unknown[]).includes(shot.curve) ||
    !finiteArray(shot.tr, 3, -1, 1) || !finiteArray(shot.rot, 3, -90, 90) || !finiteArray(shot.orb, 2, -60, 60) ||
    !finiteArray(shot.imp, 5, 0, 20) || !finiteArray(shot.org, 4, 0, 1000000)) return false;
  const [anticipation, attack, overshoot] = shot.imp as CameraShotShape["imp"];
  const [period, , tremor, mix] = shot.org as CameraShotShape["org"];
  return typeof shot.lens === "number" && Number.isFinite(shot.lens) && shot.lens >= 0.25 && shot.lens <= 4 &&
    typeof shot.dolly === "number" && Number.isFinite(shot.dolly) && shot.dolly >= 0 && shot.dolly <= 1 &&
    anticipation <= 0.5 && attack >= 0.02 && attack <= 0.8 && overshoot <= 1 &&
    period >= 0.25 && period <= 120 && tremor <= 30 && mix <= 1;
}

/** Validates a recipe before it can reach the host. No eval, no project ids. */
export function isCameraRecipe(value: unknown): value is CameraRecipe {
  if (!value || typeof value !== "object" || !ownKeysOnly(value, RECIPE_KEYS)) return false;
  const item = value as Record<string, unknown>;
  return item.schemaVersion === CAMERA_RECIPE_SCHEMA_VERSION && typeof item.id === "string" &&
    /^[a-z][a-z0-9-]{1,47}$/.test(item.id) && !item.id.startsWith("camera-") &&
    Number.isInteger(item.version) && (item.version as number) >= 1 &&
    (CAMERA_INTENTS as readonly unknown[]).includes(item.intent) &&
    (item.milestone === 1 || item.milestone === 2 || item.milestone === 3) &&
    bilingual(item.name) && bilingual(item.description) &&
    typeof item.durationSeconds === "number" && Number.isFinite(item.durationSeconds) &&
    item.durationSeconds >= 0.1 && item.durationSeconds <= 60 && typeof item.motionBlur === "boolean" &&
    isCameraShotShape(item.shot);
}

/** Looks a recipe up by id; undefined for anything not in the catalog. */
export function cameraRecipe(id: string): CameraRecipe | undefined {
  return CAMERA_RECIPES.find((item) => item.id === id);
}
