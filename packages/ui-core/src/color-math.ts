/** Pure color conversions for the in-panel picker. No DOM, no host. */

export interface Rgb { readonly r: number; readonly g: number; readonly b: number; }
/** Hue in degrees [0, 360); saturation and value in [0, 1]. */
export interface Hsv { readonly h: number; readonly s: number; readonly v: number; }

const HEX = /^#?([0-9a-fA-F]{6})$/;

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

export function hexToRgb(hex: string): Rgb | null {
  const match = HEX.exec(typeof hex === "string" ? hex.trim() : "");
  if (!match?.[1]) return null;
  const value = parseInt(match[1], 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

export function rgbToHex(rgb: Rgb): string {
  const channel = (value: number): string => Math.round(Math.min(255, Math.max(0, value))).toString(16).padStart(2, "0");
  return `#${channel(rgb.r)}${channel(rgb.g)}${channel(rgb.b)}`;
}

export function rgbToHsv(rgb: Rgb): Hsv {
  const r = rgb.r / 255, g = rgb.g / 255, b = rgb.b / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
  let h = 0;
  if (delta > 0) {
    if (max === r) h = 60 * (((g - b) / delta) % 6);
    else if (max === g) h = 60 * ((b - r) / delta + 2);
    else h = 60 * ((r - g) / delta + 4);
  }
  return { h: (h + 360) % 360, s: max === 0 ? 0 : delta / max, v: max };
}

export function hsvToRgb(hsv: Hsv): Rgb {
  const h = ((Number.isFinite(hsv.h) ? hsv.h : 0) % 360 + 360) % 360;
  const s = clamp01(hsv.s), v = clamp01(hsv.v);
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}

export function hexToHsv(hex: string): Hsv | null {
  const rgb = hexToRgb(hex);
  return rgb ? rgbToHsv(rgb) : null;
}

export function hsvToHex(hsv: Hsv): string {
  return rgbToHex(hsvToRgb(hsv));
}

/** Clamp an HSV triple into the picker's domain. */
export function clampHsv(hsv: Hsv): Hsv {
  const h = Number.isFinite(hsv.h) ? Math.min(359.999, Math.max(0, hsv.h)) : 0;
  return { h, s: clamp01(hsv.s), v: clamp01(hsv.v) };
}
