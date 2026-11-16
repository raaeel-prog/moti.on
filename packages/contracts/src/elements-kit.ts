/**
 * Pecas de montagem das receitas de Elementos: trechos, trilhas, textos e
 * formas recorrentes. So dados; o host e a previa interpretam as receitas.
 */
import type {
  ElementChannel, ElementColorRole, ElementEase, ElementLayer, ElementLocalizedText, ElementRgb, ElementSegment, ElementShapeLayer,
  ElementTextLayer, ElementTrack, ElementWindow, MotionElement
} from "./elements.js";

export const seg = (window: ElementWindow, start: number, end: number, from: number, to: number, ease: ElementEase): ElementSegment => ({ window, start, end, from, to, ease });
export const track = (channel: ElementChannel, ...segments: ElementSegment[]): ElementTrack => ({ channel, segments });
export const text = (pt: string, en: string): ElementLocalizedText => ({ "pt-BR": pt, "en-US": en });
export const WHITE: ElementRgb = [1, 1, 1];
export const INK: ElementRgb = [.07, .07, .09];

/** Entrada de `from` ao repouso e Saida do repouso a `to`. */
export function inOut(channel: ElementChannel, from: number, rest: number, to: number,
  inRange: readonly [number, number] = [0, .6], outRange: readonly [number, number] = [.4, 1], ease: readonly [ElementEase, ElementEase] = ["out", "in"]): ElementTrack {
  return track(channel, seg("in", inRange[0], inRange[1], from, rest, ease[0]), seg("out", outRange[0], outRange[1], rest, to, ease[1]));
}
/** Traco que se desenha na Entrada e se apaga pela outra ponta na Saida. */
export function drawInOut(inRange: readonly [number, number] = [0, .8], outRange: readonly [number, number] = [0, .8]): ElementTrack[] {
  return [track("trimEnd", seg("in", inRange[0], inRange[1], 0, 100, "out")), track("trimStart", seg("out", outRange[0], outRange[1], 0, 100, "in"))];
}
/** Traco de uma passada so (elementos `oneshot`). */
export function drawOnce(draw: readonly [number, number] = [0, .5], erase: readonly [number, number] = [.4, 1]): ElementTrack[] {
  return [track("trimEnd", seg("all", draw[0], draw[1], 0, 100, "out")), track("trimStart", seg("all", erase[0], erase[1], 0, 100, "in-out"))];
}
export const fadeInOut = (inRange: readonly [number, number] = [0, .6], outRange: readonly [number, number] = [0, .6]): ElementTrack =>
  inOut("opacity", 0, 100, 0, inRange, outRange, ["out", "in"]);

export interface TextSpec {
  readonly id?: "title" | "subtitle";
  readonly color?: ElementColorRole;
  readonly position: readonly [number, number];
  readonly align?: "left" | "center";
  readonly size: number;
  readonly bold?: boolean;
  readonly tracks: readonly ElementTrack[];
}
export function textLayer(spec: TextSpec): ElementTextLayer {
  return { type: "text", id: spec.id ?? "title", color: spec.color ?? "text", position: spec.position, align: spec.align ?? "left", size: spec.size, bold: spec.bold ?? true, tracks: spec.tracks };
}

/** Pontos de uma curva amostrada, arredondados ao decimo de pixel. */
export function sampled(count: number, at: (u: number) => readonly [number, number]): Array<readonly [number, number]> {
  const points: Array<readonly [number, number]> = [];
  for (let i = 0; i <= count; i++) { const [x, y] = at(i / count); points.push([Math.round(x * 10) / 10, Math.round(y * 10) / 10]); }
  return points;
}
/** Poligono regular (fechado) ou contorno de circulo com tremor de mao. */
export function wobblyLoop(rx: number, ry: number, wobble: number, seed: number, turns = 1.08, count = 40): Array<readonly [number, number]> {
  return sampled(count, u => {
    const a = -Math.PI / 2 + u * turns * 2 * Math.PI, r = 1 + wobble * Math.sin(seed + u * 9.7) * Math.sin(seed * 1.7 + u * 4.1);
    return [Math.cos(a) * rx * r, Math.sin(a) * ry * r];
  });
}
export function polygon(sides: number, radius: number, rotation = -90): Array<readonly [number, number]> {
  const points: Array<readonly [number, number]> = [];
  for (let i = 0; i < sides; i++) {
    const a = (rotation + i * 360 / sides) * Math.PI / 180;
    points.push([Math.round(Math.cos(a) * radius * 10) / 10, Math.round(Math.sin(a) * radius * 10) / 10]);
  }
  return points;
}
/** Coracao amostrado da curva classica, com a ponta para baixo. */
export function heart(size: number, count = 36): Array<readonly [number, number]> {
  return sampled(count, u => {
    const a = u * 2 * Math.PI, k = size / 17;
    return [k * 16 * Math.pow(Math.sin(a), 3), -k * (13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a))];
  }).slice(0, -1);
}

export type ElementRecipe = MotionElement;
export type ShapeSpec = ElementShapeLayer;
export type AnyLayer = ElementLayer;
