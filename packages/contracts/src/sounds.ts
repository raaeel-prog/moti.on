/**
 * Biblioteca de sons do Moti.on. Todos sao sintetizados no build
 * (`scripts/generate-sfx.mjs` + `scripts/sfx-library.mjs`, ADR 0006); nenhum
 * sample de terceiros. Os seis primeiros sao os sons historicos dos Elementos.
 */
export interface SoundLocalizedText { readonly "pt-BR": string; readonly "en-US": string }

export const SOUND_FAMILIES = [
  "approach", "bass", "beep", "blast", "boom", "metal", "click", "glass", "creak", "drone", "pop", "slide", "swoosh", "knock", "transition"
] as const;
export type SoundFamily = (typeof SOUND_FAMILIES)[number];

export interface MotionSound {
  readonly id: string;
  readonly family: SoundFamily;
  readonly name: SoundLocalizedText;
}

const t = (pt: string, en: string): SoundLocalizedText => ({ "pt-BR": pt, "en-US": en });

export const SOUND_FAMILY_NAMES: Readonly<Record<SoundFamily, SoundLocalizedText>> = {
  approach: t("Aproximação", "Approach"), bass: t("Grave", "Bass"), beep: t("Bipe", "Beep"), blast: t("Explosão", "Blast"),
  boom: t("Estrondo", "Boom"), metal: t("Metal", "Metal"), click: t("Clique", "Click"), glass: t("Vidro", "Glass"),
  creak: t("Rangido", "Creak"), drone: t("Ambiência", "Drone"), pop: t("Estalo", "Pop"), slide: t("Deslize", "Slide"),
  swoosh: t("Passagem", "Swoosh"), knock: t("Batida", "Knock"), transition: t("Transição", "Transition")
};

export const MOTION_SOUNDS = [
  { id: "whoosh", family: "swoosh", name: t("Passagem", "Whoosh") },
  { id: "impact", family: "boom", name: t("Impacto", "Impact") },
  { id: "pop", family: "pop", name: t("Estalo", "Pop") },
  { id: "rise", family: "approach", name: t("Subida", "Rise") },
  { id: "click", family: "click", name: t("Clique", "Click") },
  { id: "chime", family: "glass", name: t("Sino", "Chime") },
  { id: "approach", family: "approach", name: t("Chegada", "Incoming") },
  { id: "riser-pulse", family: "approach", name: t("Subida pulsante", "Pulsing riser") },
  { id: "sub-drop", family: "bass", name: t("Queda sub", "Sub drop") },
  { id: "bass-hit", family: "bass", name: t("Pancada grave", "Bass hit") },
  { id: "beep", family: "beep", name: t("Bipe", "Beep") },
  { id: "beep-double", family: "beep", name: t("Bipe duplo", "Double beep") },
  { id: "blip", family: "beep", name: t("Blip", "Blip") },
  { id: "blast", family: "blast", name: t("Detonação", "Detonation") },
  { id: "noise-burst", family: "blast", name: t("Rajada", "Noise burst") },
  { id: "boom-deep", family: "boom", name: t("Estrondo profundo", "Deep boom") },
  { id: "boom-cinema", family: "boom", name: t("Estrondo de cinema", "Trailer boom") },
  { id: "thud", family: "boom", name: t("Baque", "Thud") },
  { id: "clang", family: "metal", name: t("Golpe metálico", "Metal strike") },
  { id: "tick", family: "click", name: t("Tique", "Tick") },
  { id: "glass-clink", family: "glass", name: t("Tinido de vidro", "Glass clink") },
  { id: "creak", family: "creak", name: t("Rangido", "Creak") },
  { id: "creak-slow", family: "creak", name: t("Rangido lento", "Slow creak") },
  { id: "drone-dark", family: "drone", name: t("Ambiência escura", "Dark drone") },
  { id: "drone-air", family: "drone", name: t("Ambiência aérea", "Airy drone") },
  { id: "bubble", family: "pop", name: t("Bolha", "Bubble") },
  { id: "slide-up", family: "slide", name: t("Deslize para cima", "Slide up") },
  { id: "slide-down", family: "slide", name: t("Deslize para baixo", "Slide down") },
  { id: "swish", family: "swoosh", name: t("Chicote", "Swish") },
  { id: "swoosh-deep", family: "swoosh", name: t("Passagem grave", "Deep swoosh") },
  { id: "tap", family: "knock", name: t("Toque", "Tap") },
  { id: "knock", family: "knock", name: t("Bater à porta", "Door knock") },
  { id: "glitch", family: "transition", name: t("Falha digital", "Digital glitch") },
  { id: "reverse-swell", family: "transition", name: t("Crescendo reverso", "Reverse swell") },
  { id: "sweep-whoosh", family: "transition", name: t("Varredura", "Sweep") }
] as const satisfies readonly MotionSound[];

export type SoundId = (typeof MOTION_SOUNDS)[number]["id"];
export const SOUND_IDS: readonly SoundId[] = MOTION_SOUNDS.map(sound => sound.id);

export function findSound(id: string): MotionSound | undefined {
  return (MOTION_SOUNDS as readonly MotionSound[]).find(sound => sound.id === id);
}

export const SOUND_LIMITS = { gainDb: [-24, 6] } as const;

export interface SoundInsertArgs {
  readonly soundId: string;
  /** Toca de tras para frente (esticamento de -100%). */
  readonly reverse?: boolean;
  readonly gainDb?: number;
}

/** Mesma regra do host (`sound-insert.jsx`): o painel recusa antes de enviar. */
export function soundInsertError(args: unknown): string | null {
  if (typeof args !== "object" || args === null || Array.isArray(args)) return "args";
  const record = args as Record<string, unknown>;
  for (const key of Object.keys(record)) if (!["soundId", "reverse", "gainDb"].includes(key)) return key;
  if (typeof record["soundId"] !== "string" || !findSound(record["soundId"])) return "soundId";
  if (record["reverse"] !== undefined && typeof record["reverse"] !== "boolean") return "reverse";
  const gain = record["gainDb"];
  if (gain !== undefined && !(typeof gain === "number" && Number.isFinite(gain) && gain >= SOUND_LIMITS.gainDb[0] && gain <= SOUND_LIMITS.gainDb[1])) return "gainDb";
  return null;
}
