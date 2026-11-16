/** Particle World remains the legacy renderer; new modes are original editable recipes. */
export const PARTICLE_MODES = ["classic", "dust", "bokeh", "snow", "sparks", "field3d", "rising"] as const;
export type ParticleMode = typeof PARTICLE_MODES[number];
export type ParticleColor = [number, number, number];
export interface ParticleStream {
  amount: number; size: number; opacity: number; color: ParticleColor; movement: number;
}
export interface ParticleArgs {
  action?: "apply" | "remove";
  mode?: ParticleMode;
  birthRate?: number; longevity?: number; velocity?: number;
  size?: number; opacity?: number; color?: ParticleColor; movement?: number; seed?: number;
  direction?: number; spread?: number; precompose?: boolean;
  changedFields?: string[]; targetRigId?: string; targetCompId?: number;
  streams?: ParticleStream[];
}
export interface ParticleSettings extends ParticleArgs {
  mode: ParticleMode; birthRate: number; longevity: number; velocity: number;
  size: number; opacity: number; color: ParticleColor; movement: number; seed: number; streams: ParticleStream[];
}
const stream = (amount: number, size: number, opacity: number, color: ParticleColor, movement: number): ParticleStream => ({ amount, size, opacity, color, movement });
const fieldStreams = (): ParticleStream[] => [stream(.4, .45, 45, [.64, .77, 1], .55), stream(.3, .7, 60, [.76, .86, 1], .8), stream(.2, 1, 75, [.91, .94, 1], 1), stream(.1, 1.5, 55, [1, .91, .76], 1.3)];
export const PARTICLE_PRESETS: readonly Readonly<ParticleSettings>[] = [
  { mode: "classic", birthRate: 2, longevity: 1, velocity: 1, size: .05, opacity: 100, color: [1, .8, .4], movement: 1, seed: 1, streams: fieldStreams() },
  { mode: "dust", birthRate: 1.5, longevity: 6, velocity: .035, size: .1, opacity: 55, color: [1, .91, .75], movement: .5, seed: 1, streams: fieldStreams() },
  { mode: "bokeh", birthRate: .6, longevity: 7, velocity: .025, size: .6, opacity: 65, color: [.72, .83, 1], movement: .4, seed: 1, streams: fieldStreams() },
  { mode: "snow", birthRate: 3, longevity: 7, velocity: .09, size: .13, opacity: 90, color: [.91, .96, 1], movement: .8, seed: 1, streams: fieldStreams() },
  { mode: "sparks", birthRate: 1.4, longevity: 1.5, velocity: .6, size: .025, opacity: 100, color: [1, .52, .12], movement: 1.2, seed: 1, streams: fieldStreams() },
  { mode: "field3d", birthRate: 3, longevity: 8, velocity: .06, size: .2, opacity: 85, color: [1, 1, 1], movement: 1, seed: 1, streams: fieldStreams() },
  { mode: "rising", birthRate: 3, longevity: 8, velocity: .06, size: .2, opacity: 85, color: [1, 1, 1], movement: 1, seed: 1, direction: 0, spread: 10, streams: fieldStreams() }
];
export function cloneParticleArgs(mode: ParticleMode = "rising", settings?: ParticleArgs): ParticleSettings {
  const preset = PARTICLE_PRESETS.find(item => item.mode === mode) ?? PARTICLE_PRESETS[0]!;
  const source = { ...preset, ...settings, mode };
  return { ...source, color: [...source.color], streams: source.streams.map(item => ({ ...item, color: [...item.color] })) };
}
const range = (value: unknown, min: number, max: number): value is number => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
const color = (value: unknown): value is ParticleColor => Array.isArray(value) && value.length === 3 && value.every(item => range(item, 0, 1));
const fields = new Set(["action", "mode", "birthRate", "longevity", "velocity", "size", "opacity", "color", "movement", "seed", "streams", "direction", "spread", "changedFields", "targetRigId", "targetCompId", "precompose"]);
export function isParticleArgs(value: unknown): value is ParticleArgs {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const args = value as Record<string, unknown>;
  if (Object.keys(args).some(key => !fields.has(key))) return false;
  if (args["action"] !== undefined && args["action"] !== "apply" && args["action"] !== "remove") return false;
  if (args["mode"] !== undefined && !PARTICLE_MODES.includes(args["mode"] as ParticleMode)) return false;
  for (const [key, min, max] of [["birthRate", 0, 100], ["longevity", .01, 100], ["velocity", 0, 100], ["size", .001, 1], ["opacity", 0, 100], ["movement", 0, 5]] as const) if (args[key] !== undefined && !range(args[key], min, max)) return false;
  if (args["color"] !== undefined && !color(args["color"])) return false;
  if (args["seed"] !== undefined && (!range(args["seed"], 0, 10000) || !Number.isInteger(args["seed"]))) return false;
  if (args["direction"] !== undefined && !range(args["direction"], 0, 360)) return false;
  if (args["spread"] !== undefined && !range(args["spread"], 0, 100)) return false;
  if (args["targetRigId"] !== undefined && (typeof args["targetRigId"] !== "string" || !/^[A-Za-z0-9-]{1,128}$/.test(args["targetRigId"]))) return false;
  if (args["targetCompId"] !== undefined && (!range(args["targetCompId"], 1, Number.MAX_SAFE_INTEGER) || !Number.isInteger(args["targetCompId"]))) return false;
  if (args["changedFields"] !== undefined && (!Array.isArray(args["changedFields"]) || args["changedFields"].length > 32 || !args["changedFields"].every(key => typeof key === "string" && /^(mode|birthRate|longevity|velocity|size|opacity|color|movement|seed|direction|spread|streams\.[0-3]\.(amount|size|opacity|color|movement))$/.test(key)))) return false;
  if (Array.isArray(args["changedFields"]) && args["changedFields"].some((key: string) => key.startsWith("streams.") ? args["streams"] === undefined : args[key] === undefined)) return false;
  if (args["streams"] !== undefined) {
    if (!Array.isArray(args["streams"]) || args["streams"].length !== 4) return false;
    if (!args["streams"].every(item => item && typeof item === "object" && Object.keys(item).length === 5 && range(item.amount, 0, 3) && range(item.size, .1, 3) && range(item.opacity, 0, 100) && color(item.color) && range(item.movement, 0, 3))) return false;
  }
  return true;
}
