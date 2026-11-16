import { cloneParticleArgs, isParticleArgs, PARTICLE_MODES, type ParticleArgs, type ParticleMode, type ParticleSettings } from "@motion/contracts";
import { colorField, createElement, selectField, type I18n } from "@motion/ui-core";
import { createToolNumberFields } from "./tool-number-fields.js";

type LocaleKey = Parameters<I18n["t"]>[0];
export interface ParticlePreviewPoint { x: number; y: number; radius: number; opacity: number; color: string; streak: boolean }
const frac = (value: number): number => value - Math.floor(value);
const hex = (value: readonly number[]): string => `#${value.map(channel => Math.round(channel * 255).toString(16).padStart(2, "0")).join("")}`;
const rgb = (value: string): [number, number, number] => [parseInt(value.slice(1, 3), 16) / 255, parseInt(value.slice(3, 5), 16) / 255, parseInt(value.slice(5, 7), 16) / 255];
/** A deterministic movement diagram, explicitly labelled as an approximation of the native effect. */
export function sampleParticlePreview(settings: ParticleSettings, seconds: number): ParticlePreviewPoint[] {
  const count = Math.min(72, Math.round(settings.birthRate * settings.longevity * 8));
  return Array.from({ length: count }, (_, index) => {
    const stream = settings.streams[index % 4]!;
    const field = settings.mode === "field3d" || settings.mode === "rising";
    const speed = settings.velocity * settings.movement * (field ? stream.movement : 1);
    const age = frac(index * .61803398875 + settings.seed * .113 + seconds * speed * .25);
    const x0 = frac(index * .754877666 + settings.seed * .173 + .13), y0 = frac(index * .56984029 + settings.seed * .317 + .31);
    let x = frac(x0 + Math.sin(index * 2.1 + seconds * .12) * .02), y = frac(y0 + seconds * speed * .07);
    if (settings.mode === "sparks" || settings.mode === "classic") { x = .5 + Math.cos(index * 2.4) * age * .6; y = .78 - age * .9 + age * age * .6; }
    if (settings.mode === "bokeh") y = frac(y0 - seconds * speed * .08);
    if (settings.mode === "dust" || field) { x = frac(x0 + seconds * speed * .03); y = frac(y0 + Math.sin(seconds * .2 + index) * .025); }
    if (settings.direction !== undefined) {
      const radians = (settings.direction + (frac(index * .381966 + settings.seed * .19) - .5) * (settings.spread ?? 10) * 1.8) * Math.PI / 180;
      x = frac(x0 + Math.sin(radians) * seconds * speed * .08);
      y = frac(y0 - Math.cos(radians) * seconds * speed * .08);
    }
    const depth = field ? [.65, .82, 1, 1.3][index % 4]! : 1;
    return { x, y, radius: Math.max(.8, settings.size * 24 * depth * (field ? stream.size : 1)), opacity: settings.opacity / 100 * (field ? stream.opacity / 100 : 1) * Math.sin(Math.PI * age), color: hex(field ? stream.color.map((value, channel) => value * settings.color[channel]!) : settings.color), streak: settings.mode === "sparks" || settings.mode === "classic" };
  }).filter((_,index)=>(settings.mode!=="field3d" && settings.mode!=="rising") || frac(Math.floor(index/4)*.61803398875)<Math.min(1,settings.streams[index%4]!.amount));
}
export interface ParticlesEditorOptions { i18n: I18n; initial?: ParticleArgs; onChange?(settings: ParticleSettings): void }
export interface ParticlesEditor { element: HTMLElement; getArgs(): ParticleSettings; setArgs(args: ParticleArgs): void; dispose(): void }
export function createParticlesEditor(doc: Document, options: ParticlesEditorOptions): ParticlesEditor {
  const t = (key: string, values?: Record<string, string | number>): string => options.i18n.t(key as LocaleKey, values);
  const element = createElement(doc, "div", "ch-particles-editor"), fields = createElement(doc, "div", "ch-particles-editor__fields");
  const preview = createElement(doc, "div", "ch-particles-preview"), stage = createElement(doc, "div", "ch-particles-preview__stage");
  stage.setAttribute("role", "img"); stage.setAttribute("aria-label", t("particles.preview"));
  const play = createElement(doc, "button", "ch-button ch-button--tertiary", t("particles.play")) as HTMLButtonElement;
  play.type = "button"; play.setAttribute("aria-pressed", "false");
  const caption = createElement(doc, "span", "ch-particles-preview__caption", t("particles.previewHint"));
  preview.appendChild(stage); preview.appendChild(caption); preview.appendChild(play); element.appendChild(preview); element.appendChild(fields);
  let settings = cloneParticleArgs(options.initial?.mode ?? "rising", options.initial), numbers = createToolNumberFields(), disposed = false, playing = false, visible = true, handle = 0, last = 0, seconds = 2;
  const view = doc.defaultView;
  const reduced = (): boolean => doc.documentElement.getAttribute("data-reduced-motion") === "true" || Boolean(view?.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  function draw(): void {
    while (stage.firstChild) stage.removeChild(stage.firstChild);
    for (const point of sampleParticlePreview(settings, seconds)) {
      const dot = createElement(doc, "span", "ch-particles-preview__dot");
      dot.style.left = `${point.x * 100}%`; dot.style.top = `${point.y * 100}%`; dot.style.width = `${point.streak ? 1.3 : point.radius * 2}px`; dot.style.height = `${point.streak ? point.radius * 4 : point.radius * 2}px`;
      dot.style.backgroundColor = point.color; dot.style.opacity = String(Math.max(0, point.opacity));
      if (settings.mode === "dust" || settings.mode === "bokeh") dot.style.filter = `blur(${settings.mode === "bokeh" ? point.radius * .18 : .5}px)`;
      if (point.streak) dot.style.transform = `rotate(${settings.direction ?? -24}deg)`;
      stage.appendChild(dot);
    }
  }
  function stopFrame(): void { if (handle) view?.cancelAnimationFrame(handle); handle = 0; last = 0; }
  function frame(timestamp: number): void {
    handle = 0;
    if (disposed || !playing || doc.hidden || !visible || reduced()) { stopFrame(); return; }
    if (!last || timestamp - last >= 1000 / 30) { seconds += last ? Math.min(.1, (timestamp - last) / 1000) : 0; last = timestamp; draw(); }
    handle = view?.requestAnimationFrame(frame) ?? 0;
  }
  function syncAnimation(): void { stopFrame(); if (playing && !doc.hidden && visible && !reduced()) handle = view?.requestAnimationFrame(frame) ?? 0; play.textContent = t(playing ? "particles.pause" : "particles.play"); play.setAttribute("aria-pressed", String(playing)); }
  function changed(): void {
    for (const button of Array.from(element.getElementsByTagName("button"))) {
      const value = button.getAttribute("data-direction");
      if (value !== null) button.setAttribute("aria-pressed", String(settings.direction !== undefined && settings.direction % 360 === Number(value)));
    }
    draw(); options.onChange?.(cloneParticleArgs(settings.mode, settings)); }
  function number(parent: HTMLElement, key: string, label: string, value: number, min: number, max: number, step: number, commit: (value: number) => void): void {
    parent.appendChild(numbers.field(doc, { id: `particles-${key}`, label, value, min, max, step, onCommit: value => { commit(value); changed(); } }));
  }
  function render(): void {
    numbers.dispose(); numbers = createToolNumberFields(); while (fields.firstChild) fields.removeChild(fields.firstChild);
    fields.appendChild(selectField(doc, { id: "particles-mode", label: t("particles.mode"), value: settings.mode, options: PARTICLE_MODES.map(mode => ({ value: mode, label: t(`particles.mode.${mode}`) })), onChange: mode => { settings = cloneParticleArgs(mode as ParticleMode); render(); changed(); } }));
    if(settings.mode!=="classic")fields.appendChild(selectField(doc,{id:"particles-action",label:t("parallaxFull.operation"),value:settings.action??"apply",options:[{value:"apply",label:t("action.apply")},{value:"remove",label:t("action.remove")}],onChange:action=>{settings.action=action as "apply"|"remove";changed();}}));
    number(fields, "birthRate", t("field.particles.birthRate"), settings.birthRate, 0, 100, .1, value => { settings.birthRate = value; });
    number(fields, "longevity", t("field.particles.longevity"), settings.longevity, .01, 100, .1, value => { settings.longevity = value; });
    number(fields, "velocity", t("field.particles.velocity"), settings.velocity, 0, 100, .01, value => { settings.velocity = value; });
    if (settings.mode !== "classic") {
      number(fields, "size", t("particles.size"), settings.size, .001, 1, .001, value => { settings.size = value; });
      number(fields, "opacity", t("particles.opacity"), settings.opacity, 0, 100, 1, value => { settings.opacity = value; });
      number(fields, "movement", t("particles.movement"), settings.movement, 0, 5, .05, value => { settings.movement = value; });
      number(fields, "seed", t("particles.seed"), settings.seed, 0, 10000, 1, value => { settings.seed = value; });
      fields.appendChild(colorField(doc, { id: "particles-color", label: t("particles.color"), value: hex(settings.color), onCommit: value => { settings.color = rgb(value); changed(); } }));
    }
    if (settings.mode !== "classic") {
      const directionGroup = createElement(doc, "div", "ch-particles-direction");
      const shortcuts = createElement(doc, "div", "ch-particles-direction__shortcuts");
      shortcuts.setAttribute("role", "group"); shortcuts.setAttribute("aria-label", t("particles.direction"));
      for (const [value, arrow, label] of [[0, "↑", "up"], [90, "→", "right"], [180, "↓", "down"], [270, "←", "left"]] as const) {
        const button = createElement(doc, "button", "ch-button ch-button--tertiary", arrow) as HTMLButtonElement;
        button.type = "button"; button.setAttribute("data-direction", String(value)); button.setAttribute("aria-label", t(`particles.direction.${label}`));
        button.setAttribute("aria-pressed", String(settings.direction !== undefined && settings.direction % 360 === value));
        button.addEventListener("click", () => { settings.direction = value; settings.spread ??= 10; render(); changed(); }); shortcuts.appendChild(button);
      }
      directionGroup.appendChild(shortcuts);
      const needle = createElement(doc, "span", "ch-particles-direction__needle", "↑"); needle.setAttribute("aria-hidden", "true"); needle.style.transform = `rotate(${settings.direction ?? 0}deg)`;
      directionGroup.appendChild(needle); fields.appendChild(directionGroup);
      number(fields, "direction", t("particles.direction"), settings.direction ?? 0, 0, 360, 1, value => { settings.direction = value; settings.spread ??= 10; needle.style.transform = `rotate(${value}deg)`; });
      number(fields, "spread", t("particles.spread"), settings.spread ?? 10, 0, 100, 1, value => { settings.direction ??= 0; settings.spread = value; });
      if (settings.direction === undefined) fields.appendChild(createElement(doc, "span", "ch-particles-preview__caption", t("particles.direction.legacy")));
    }
    if (settings.mode === "field3d" || settings.mode === "rising") {
      const streams = createElement(doc, "details", "ch-particles-streams") as HTMLDetailsElement;
      streams.appendChild(createElement(doc, "summary", undefined, t("particles.streams")));
      settings.streams.forEach((stream, index) => {
        const section = createElement(doc, "details", "ch-particles-stream"); section.appendChild(createElement(doc, "summary", undefined, t("particles.stream", { index: index + 1 })));
        number(section, `stream-${index}-amount`, t("particles.amount"), stream.amount, 0, 3, .05, value => { stream.amount = value; });
        number(section, `stream-${index}-size`, t("particles.size"), stream.size, .1, 3, .05, value => { stream.size = value; });
        number(section, `stream-${index}-opacity`, t("particles.opacity"), stream.opacity, 0, 100, 1, value => { stream.opacity = value; });
        number(section, `stream-${index}-movement`, t("particles.movement"), stream.movement, 0, 3, .05, value => { stream.movement = value; });
        section.appendChild(colorField(doc, { id: `particles-stream-${index}-color`, label: t("particles.color"), value: hex(stream.color), onCommit: value => { stream.color = rgb(value); changed(); } }));
        streams.appendChild(section);
      }); fields.appendChild(streams);
    }
    draw();
  }
  play.addEventListener("click", () => { playing = !playing; syncAnimation(); });
  const visibility = (): void => syncAnimation(); doc.addEventListener("visibilitychange", visibility);
  const observer = typeof IntersectionObserver === "function" ? new IntersectionObserver(entries => { visible = entries[0]?.isIntersecting ?? true; syncAnimation(); }) : null;
  observer?.observe(preview); render();
  return { element, getArgs: () => cloneParticleArgs(settings.mode, settings), setArgs(args) { if (disposed || !isParticleArgs(args)) return; settings = cloneParticleArgs(args.mode ?? "rising", args); render(); }, dispose() { disposed = true; stopFrame(); observer?.disconnect(); doc.removeEventListener("visibilitychange", visibility); numbers.dispose(); } };
}
