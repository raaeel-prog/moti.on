import { cloneGradientSettings, type GradientSettingsV1 } from "./gradient.js";

/** Gradient palettes (2026-10-14): original color sets generated from OKLCH, so
 * every family keeps the same lightness and chroma structure. A palette changes
 * only the stops; the gradient's shape, light and texture stay as the user set
 * them. Twelve hue families times eight harmonies. Keep IDs stable. */
export const GRADIENT_PALETTE_FAMILIES = [
  ["red", 27], ["orange", 52], ["amber", 80], ["lime", 122], ["green", 150], ["teal", 183],
  ["cyan", 213], ["blue", 258], ["indigo", 280], ["violet", 305], ["magenta", 335], ["rose", 0]
] as const;
export type GradientPaletteFamily = typeof GRADIENT_PALETTE_FAMILIES[number][0];
export const GRADIENT_PALETTE_STYLES = ["deep", "analog", "contrast", "pastel", "neon", "dusk", "duotone", "mist"] as const;
export type GradientPaletteStyle = typeof GRADIENT_PALETTE_STYLES[number];
export interface GradientPalette {
  readonly id: `${GradientPaletteFamily}-${GradientPaletteStyle}`;
  readonly family: GradientPaletteFamily;
  readonly style: GradientPaletteStyle;
  /** Display-referred sRGB, 0..1, from dark to light where the style has an order. */
  readonly colors: readonly (readonly [number, number, number])[];
}

/** OKLab to linear sRGB (Björn Ottosson's published matrices). */
function linearRgb(L: number, C: number, hue: number): [number, number, number] {
  const a = C * Math.cos(hue * Math.PI / 180), b = C * Math.sin(hue * Math.PI / 180);
  const l = (L + .3963377774 * a + .2158037573 * b) ** 3, m = (L - .1055613458 * a - .0638541728 * b) ** 3, s = (L - .0894841775 * a - 1.291485548 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + .2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - .3413193965 * s, -.0041960863 * l - .7034186147 * m + 1.707614701 * s];
}
const encode = (value: number): number => value <= .0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - .055;
/** An OKLCH color in sRGB: chroma shrinks until it fits, so the hue never shifts. */
export function oklchToSrgb(L: number, C: number, hue: number): [number, number, number] {
  let low = 0, high = C, rgb = linearRgb(L, C, hue);
  const fits = (value: readonly number[]): boolean => value.every(channel => channel >= -1e-6 && channel <= 1 + 1e-6);
  if (!fits(rgb)) {
    for (let i = 0; i < 24; i++) { const mid = (low + high) / 2; if (fits(linearRgb(L, mid, hue))) low = mid; else high = mid; }
    rgb = linearRgb(L, low, hue);
  }
  return rgb.map(channel => Math.round(Math.max(0, Math.min(1, encode(Math.max(0, channel)))) * 10000) / 10000) as [number, number, number];
}

/** Lightness, chroma and hue offset of each stop, per harmony. */
const STYLES: Record<GradientPaletteStyle, readonly (readonly [number, number, number])[]> = {
  deep: [[.2, .07, -8], [.42, .15, 0], [.62, .18, 6], [.82, .11, 14]],
  analog: [[.48, .16, -38], [.62, .18, 0], [.76, .15, 38]],
  contrast: [[.28, .1, 0], [.58, .19, 0], [.86, .12, 180]],
  pastel: [[.84, .07, -22], [.9, .06, 0], [.95, .045, 26]],
  neon: [[.16, .05, 20], [.6, .27, 0], [.88, .17, 60]],
  dusk: [[.17, .07, 45], [.43, .17, 0], [.72, .15, -55], [.9, .08, -80]],
  duotone: [[.26, .12, 0], [.9, .09, 150]],
  mist: [[.34, .025, 0], [.62, .04, 0], [.8, .03, 8], [.96, .012, 0]]
};

export const GRADIENT_PALETTES: readonly GradientPalette[] = GRADIENT_PALETTE_FAMILIES.flatMap(([family, hue]) =>
  GRADIENT_PALETTE_STYLES.map((style): GradientPalette => ({
    id: `${family}-${style}`, family, style,
    colors: STYLES[style].map(([L, C, offset]) => oklchToSrgb(L, C, (hue + offset + 360) % 360))
  })));

/** The same gradient with the palette's colors evenly spaced; shape, light and
 * texture are untouched, and unused slots are disabled. */
export function gradientWithPalette(settings: Readonly<GradientSettingsV1>, palette: GradientPalette): GradientSettingsV1 {
  const next = cloneGradientSettings(settings), count = palette.colors.length;
  next.stops = next.stops.map((stop, slot) => slot < count
    ? { enabled: true, color: [...palette.colors[slot]!] as [number, number, number], position: count > 1 ? slot / (count - 1) : 0 }
    : { ...stop, enabled: false });
  return next;
}
