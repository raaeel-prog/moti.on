/**
 * Previa SVG dos Elementos, desenhada da mesma receita e da mesma `elementTrack`
 * que o host serializa nas expressoes. Escala 1:10 da referencia 1920x1080.
 * A largura do texto e estimada; no After Effects ela vem de `sourceRectAtTime`.
 */
import {
  elementChannelRest, elementCounterText, elementTrack, elementTrackData,
  type ElementChannel, type ElementColorRole, type ElementLayer, type ElementRgb, type ElementTextRole, type MotionElement
} from "@motion/contracts";

const NS = "http://www.w3.org/2000/svg";
const SCALE = .1;
export const ELEMENT_PREVIEW_BOX = [192, 108] as const;

export interface ElementPreviewOptions {
  readonly durationFrames: number;
  readonly animationFrames: number;
  readonly colors: Readonly<Record<ElementColorRole, ElementRgb>>;
  readonly texts: Readonly<Partial<Record<ElementTextRole, string>>>;
  readonly size: number;
  /** Separators of a counter preview; Portuguese when absent. */
  readonly locale?: "pt-BR" | "en-US";
}

/** Instante em que o elemento esta inteiro: o meio da permanencia, ou o pico do disparo. */
export function elementRestTime(element: MotionElement, durationFrames: number): number {
  const seconds = durationFrames / 30;
  return element.timing === "in-out" ? seconds / 2 : seconds * .45;
}

function sample(layer: ElementLayer, channel: ElementChannel, time: number, duration: number, anim: number): number {
  const t = layer.tracks.find(item => item.channel === channel);
  return t ? elementTrack(time, duration, anim, elementTrackData(t.segments)) : elementChannelRest(channel);
}
const rgb = (color: ElementRgb): string => `rgb(${color.map(v => Math.round(v * 255)).join(",")})`;
/** Caixa estimada do texto, com o mesmo ancoramento do host (centro ou meio da esquerda). */
function textBox(element: MotionElement, role: ElementTextRole, options: ElementPreviewOptions): { width: number; height: number } {
  const spec = element.layers.find(l => l.type === "text" && l.id === role);
  if (!spec || spec.type !== "text") return { width: 0, height: 0 };
  const lines = String(options.texts[role] ?? "").split(/\r\n|\r|\n/);
  return { width: Math.max(...lines.map(l => l.length)) * spec.size * (spec.bold ? .6 : .52), height: lines.length * spec.size * 1.1 - spec.size * .35 };
}

export function paintElementPreview(svg: SVGSVGElement, element: MotionElement, options: ElementPreviewOptions, time: number): void {
  const doc = svg.ownerDocument;
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  svg.setAttribute("viewBox", `0 0 ${ELEMENT_PREVIEW_BOX[0]} ${ELEMENT_PREVIEW_BOX[1]}`);
  const node = (tag: string, attrs: Record<string, string | number>, parent: Element): Element => {
    const el = doc.createElementNS(NS, tag);
    for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
    parent.appendChild(el); return el;
  };
  const duration = options.durationFrames / 30, anim = options.animationFrames / 30, k = SCALE * options.size / 100;
  const origin = [element.origin[0] * ELEMENT_PREVIEW_BOX[0], element.origin[1] * ELEMENT_PREVIEW_BOX[1]];
  // Paint order, like the host: the first layer of the recipe is the bottom one.
  for (const layer of element.layers) {
    const at = (channel: ElementChannel): number => sample(layer, channel, time, duration, anim);
    const opacity = at("opacity") / 100, s = at("scale") / 100;
    const x = origin[0]! + (layer.position[0] + at("x")) * k, y = origin[1]! + (layer.position[1] + at("y")) * k;
    const rotation = (layer.type === "shape" ? layer.rotation ?? 0 : 0) + at("rotation");
    const group = node("g", { transform: `translate(${x} ${y}) rotate(${rotation}) scale(${s * at("scaleX") / 100} ${s * at("scaleY") / 100})`, opacity: Math.max(0, Math.min(1, opacity)) }, svg);
    group.setAttribute("data-layer", layer.id);
    const color = rgb(options.colors[layer.color]);
    if (layer.type === "text") {
      const box = textBox(element, layer.id, options);
      const text = node("text", { x: layer.align === "center" ? 0 : 0, y: 0, "font-size": layer.size * k, "font-weight": layer.bold ? 700 : 400, "text-anchor": layer.align === "center" ? "middle" : "start", "dominant-baseline": "central", fill: color }, group);
      text.textContent = layer.counter
        ? elementCounterText(layer.counter, time, duration, options.locale ?? "pt-BR")
        : String(options.texts[layer.id] ?? "").split(/\r\n|\r|\n/)[0] ?? "";
      text.setAttribute("data-width", String(Math.round(box.width * k * 10) / 10));
      continue;
    }
    const g = layer.geometry, stroked = typeof layer.stroke === "number";
    const paint: Record<string, string | number> = stroked
      ? { fill: "none", stroke: color, "stroke-width": at("strokeWidth") ? at("strokeWidth") * k : (layer.stroke ?? 0) * k, "stroke-linecap": "round", "stroke-linejoin": "round" }
      : { fill: color };
    const start = at("trimStart"), end = at("trimEnd");
    if (stroked && (start > 0 || end < 100)) Object.assign(paint, { pathLength: 100, "stroke-dasharray": `${Math.max(0, end - start)} 200`, "stroke-dashoffset": -start });
    const copies = layer.repeater?.copies ?? 1;
    for (let c = 0; c < copies; c++) {
      const holder = copies > 1 ? node("g", { transform: `rotate(${c * (layer.repeater?.rotation ?? 0)})` }, group) : group;
      if (g.shape === "ellipse") node("ellipse", { cx: 0, cy: 0, rx: g.size[0] * k / 2, ry: g.size[1] * k / 2, ...paint }, holder);
      else if (g.shape === "path") node("path", { d: g.points.map((p, i) => `${i ? "L" : "M"}${p[0] * k} ${p[1] * k}`).join(" ") + (g.closed ? "Z" : ""), ...paint }, holder);
      else if (g.shape === "star") {
        const points: string[] = [];
        for (let i = 0; i < g.points * 2; i++) {
          const radius = (i % 2 ? g.inner : g.outer) * k, angle = Math.PI * i / g.points - Math.PI / 2;
          points.push(`${Math.cos(angle) * radius},${Math.sin(angle) * radius}`);
        }
        node("polygon", { points: points.join(" "), ...paint }, holder);
      } else {
        let width = g.size[0], height = g.size[1], cx = g.offset?.[0] ?? 0, cy = g.offset?.[1] ?? 0;
        if (g.fit) {
          const text = element.layers.find(l => l.type === "text" && l.id === g.fit!.layer)!, box = textBox(element, g.fit.layer, options), [l, t, r, b] = g.fit.pad;
          const dx = text.position[0] - layer.position[0], dy = text.position[1] - layer.position[1];
          width = Math.max(g.size[0], box.width + l + r);
          if (g.fit.axis === "both") height = Math.max(g.size[1], box.height + t + b);
          cx = text.type === "text" && text.align === "center" ? dx + (r - l) / 2 : dx - l + width / 2;
          cy = g.fit.axis === "both" ? dy + (b - t) / 2 : 0;
        }
        const rounded = Math.min(g.roundness ?? 0, width / 2, height / 2) * k;
        node("rect", { x: (cx - width / 2) * k, y: (cy - height / 2) * k, width: width * k, height: height * k, rx: rounded, ry: rounded, ...paint }, holder);
      }
    }
  }
}
