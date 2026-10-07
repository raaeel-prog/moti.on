/** Gradient v1 ABI. Keep native parameter indexes and eight stop slots stable. */
export interface GradientStop { enabled: boolean; color: [number, number, number]; position: number }
export interface GradientSettingsV1 {
  schemaVersion: 1;
  stops: GradientStop[];
  mode: "linear" | "radial" | "angular";
  centerX: number; centerY: number; scale: number; aspect: number; angle: number; cycles: number; offset: number;
  depth: number; depthRadius: number; bulge: number; turbulence: number; turbulenceScale: number; seed: number;
  glow: number; glowRadius: number; glowThreshold: number; highlightProtection: number;
  diffusion: number; diffusionRadius: number; focusX: number; focusY: number; focusRadius: number; focusSoftness: number;
  grain: number; animation: "static" | "loop"; duration: number; phase: number; colorProcessing: "project" | "srgb-linear";
}
export type GradientScalarKey = Exclude<keyof GradientSettingsV1, "schemaVersion" | "stops">;
export interface GradientScalarDescriptor {
  readonly key: GradientScalarKey; readonly index: number; readonly diskId: number;
  readonly kind: "number" | "integer" | "enum"; readonly default: string | number;
  readonly min?: number; readonly max?: number; readonly options?: readonly string[];
}
const scalar = (key: GradientScalarKey, index: number, value: number, min: number, max: number, integer = false): GradientScalarDescriptor =>
  ({ key, index, diskId: 3000 + index, kind: integer ? "integer" : "number", default: value, min, max });
const enumeration = (key: GradientScalarKey, index: number, options: readonly string[]): GradientScalarDescriptor =>
  ({ key, index, diskId: 3000 + index, kind: "enum", default: options[0]!, options });
export const GRADIENT_SCALARS: readonly GradientScalarDescriptor[] = [
  enumeration("mode", 1, ["linear", "radial", "angular"]),
  scalar("centerX", 2, .5, -2, 3), scalar("centerY", 3, .5, -2, 3), scalar("scale", 4, 1, .01, 10),
  scalar("aspect", 5, 1, .1, 10), scalar("angle", 6, 0, -36000, 36000), scalar("cycles", 7, 1, .1, 20), scalar("offset", 8, 0, -100, 100),
  scalar("depth", 9, .25, 0, 2), scalar("depthRadius", 10, 40, 0, 500), scalar("bulge", 11, .2, -2, 2),
  scalar("turbulence", 12, .15, 0, 2), scalar("turbulenceScale", 13, 200, 1, 2000), scalar("seed", 14, 1, 0, 1000000, true),
  scalar("glow", 15, .35, 0, 5), scalar("glowRadius", 16, 32, 0, 500), scalar("glowThreshold", 17, .6, 0, 10), scalar("highlightProtection", 18, .5, 0, 1),
  scalar("diffusion", 19, 0, 0, 1), scalar("diffusionRadius", 20, 30, 0, 500), scalar("focusX", 21, .5, -2, 3), scalar("focusY", 22, .5, -2, 3),
  scalar("focusRadius", 23, .25, 0, 2), scalar("focusSoftness", 24, .25, .001, 2), scalar("grain", 25, 0, 0, 1),
  enumeration("animation", 26, ["static", "loop"]), scalar("duration", 27, 4, .1, 120), scalar("phase", 28, 0, -36000, 36000),
  enumeration("colorProcessing", 29, ["project", "srgb-linear"])
];
export const GRADIENT_NATIVE = { matchName: "Moti.on Gradient", schemaVersion: 1, stopStartIndex: 30, schemaIndex: 54, parameterCount: 54 } as const;
export const GRADIENT_PARAMETER_KEYS: readonly string[] = [
  ...GRADIENT_SCALARS.map(({ key }) => key),
  ...Array.from({ length: 8 }, (_, slot) => ["enabled", "color", "position"].map((field) => `stops.${slot}.${field}`)).flat()
];
const initialColors: [number, number, number][] = [[.025, .035, .12], [.16, .12, .85], [.98, .28, .45], [1, .84, .66]];
const defaultScalars = Object.fromEntries(GRADIENT_SCALARS.map(({ key, default: value }) => [key, value]));
export const GRADIENT_DEFAULTS: Readonly<GradientSettingsV1> = {
  ...defaultScalars, schemaVersion: 1,
  stops: Array.from({ length: 8 }, (_, slot) => ({ enabled: slot < 4, color: [...initialColors[Math.min(3, slot)]!], position: Math.min(1, slot / 3) }))
} as GradientSettingsV1;
export function cloneGradientSettings(settings: Readonly<GradientSettingsV1> = GRADIENT_DEFAULTS): GradientSettingsV1 {
  return { ...settings, stops: settings.stops.map((stop) => ({ ...stop, color: [...stop.color] })) };
}
export interface GradientValidationIssue { path: string; message: string }
export type GradientValidationResult = { valid: true; value: GradientSettingsV1; issues: readonly [] } | { valid: false; issues: GradientValidationIssue[] };
/** Reject unknown versions, hidden slots and non-finite/HDR out-of-range values. */
export function validateGradientSettings(value: unknown): GradientValidationResult {
  const issues: GradientValidationIssue[] = [];
  const issue = (path: string, message: string): void => { issues.push({ path, message }); };
  if (!value || typeof value !== "object" || Array.isArray(value)) return { valid: false, issues: [{ path: "", message: "Expected gradient settings." }] };
  const object = value as Record<string, unknown>;
  const allowed = new Set(["schemaVersion", "stops", ...GRADIENT_SCALARS.map(({ key }) => key)]);
  for (const key of Object.keys(object)) if (!allowed.has(key)) issue(key, "Unknown gradient field.");
  if (object["schemaVersion"] !== 1) issue("schemaVersion", "Unsupported gradient schema.");
  for (const descriptor of GRADIENT_SCALARS) {
    const item = object[descriptor.key];
    if (descriptor.kind === "enum") {
      if (typeof item !== "string" || !descriptor.options!.includes(item)) issue(descriptor.key, "Invalid option.");
    } else if (typeof item !== "number" || !Number.isFinite(item) || item < descriptor.min! || item > descriptor.max! || descriptor.kind === "integer" && !Number.isInteger(item)) issue(descriptor.key, "Value outside the supported range.");
  }
  const stops = object["stops"];
  if (!Array.isArray(stops) || stops.length !== 8) issue("stops", "Exactly eight fixed slots are required.");
  else {
    let enabled = 0;
    stops.forEach((stop: unknown, slot) => {
      if (!stop || typeof stop !== "object" || Array.isArray(stop)) { issue(`stops.${slot}`, "Invalid stop."); return; }
      const item = stop as Record<string, unknown>;
      for (const key of Object.keys(item)) if (!["enabled", "color", "position"].includes(key)) issue(`stops.${slot}.${key}`, "Unknown stop field.");
      if (typeof item["enabled"] !== "boolean") issue(`stops.${slot}.enabled`, "Expected boolean.");
      if (item["enabled"] === true) enabled++;
      if (typeof item["position"] !== "number" || !Number.isFinite(item["position"]) || item["position"] < 0 || item["position"] > 1) issue(`stops.${slot}.position`, "Position must be from zero to one.");
      if (!Array.isArray(item["color"]) || item["color"].length !== 3 || !item["color"].every((channel: unknown) => typeof channel === "number" && Number.isFinite(channel) && channel >= -16 && channel <= 64)) issue(`stops.${slot}.color`, "Expected three finite HDR color channels.");
    });
    if (enabled < 2) issue("stops", "At least two stops must be enabled.");
  }
  return issues.length ? { valid: false, issues } : { valid: true, value: cloneGradientSettings(value as GradientSettingsV1), issues: [] };
}
export function isGradientSettings(value: unknown): value is GradientSettingsV1 { return validateGradientSettings(value).valid; }
export type GradientPresetId = "aurora" | "ember" | "lagoon" | "dusk" | "pearl" | "citrus" | "electric" | "rose";
export interface GradientPreset { readonly id: GradientPresetId; readonly settings: Readonly<GradientSettingsV1> }
function preset(id: GradientPresetId, colors: [number, number, number][], changes: Partial<Omit<GradientSettingsV1, "stops">> = {}): GradientPreset {
  const settings = { ...cloneGradientSettings(), ...changes };
  settings.stops = settings.stops.map((stop, slot) => ({ ...stop, color: [...colors[Math.min(colors.length - 1, slot)]!], enabled: slot < colors.length, position: Math.min(1, slot / (colors.length - 1)) }));
  return { id, settings };
}
export const GRADIENT_PRESETS: readonly GradientPreset[] = [
  preset("aurora", initialColors, { scale: 1.35, angle: -18, bulge: .45, turbulence: .5, turbulenceScale: 550,
    glow: .55, glowRadius: 70, diffusion: .65, diffusionRadius: 100, focusRadius: .06, focusSoftness: .4 }),
  preset("ember", [[.035, .006, .018], [.45, .035, .015], [1, .27, .04], [1, .92, .52]], { angle: -25, glow: .5 }),
  preset("lagoon", [[.01, .025, .12], [.015, .3, .55], [.04, .9, .68], [.8, 1, .72]], { mode: "radial", turbulence: .22 }),
  preset("dusk", [[.06, .018, .17], [.3, .055, .5], [.84, .23, .39], [1, .67, .44]], { angle: 65, bulge: .35 }),
  preset("pearl", [[.28, .32, .42], [.67, .73, .88], [1, .88, .81], [.79, 1, .97]], { depth: .12, glow: .18, turbulence: .08 }),
  preset("citrus", [[.08, .16, .01], [.41, .63, .02], [.94, .89, .04], [1, .4, .025]], { angle: 25, cycles: 1.25 }),
  preset("electric", [[.02, .01, .13], [.31, .015, 1], [.015, .8, 1], [.91, 1, 1]], { mode: "angular", glow: .65, turbulence: .3 }),
  preset("rose", [[.1, .013, .065], [.61, .055, .28], [1, .4, .63], [1, .87, .91]], { angle: -45, bulge: .3 })
];
export function gradientPresetSettings(id: GradientPresetId): GradientSettingsV1 {
  const recipe = GRADIENT_PRESETS.find((item) => item.id === id);
  if (!recipe) throw new Error("Unknown gradient preset.");
  return cloneGradientSettings(recipe.settings);
}
export interface GradientInstanceData {
  layerId: number; layerName: string; effectIndex: number; settings: GradientSettingsV1; lockedKeys: string[];
}
export interface GradientReadData {
  settings: GradientSettingsV1 | null; selectionToken: string; selectionCount: number; appliedCount: number;
  instances: GradientInstanceData[]; mixedKeys: string[]; lockedKeys: string[]; capabilities: { nativeAvailable: boolean };
}
export type GradientArgs =
  | { action: "apply" | "create-background"; settings: GradientSettingsV1; selectionToken?: string }
  | { action: "update"; settings: GradientSettingsV1; changedKeys: string[]; selectionToken?: string }
  | { action: "remove"; selectionToken?: string };
