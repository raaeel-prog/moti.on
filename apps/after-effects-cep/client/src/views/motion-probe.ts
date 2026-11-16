import { createElement, propertyRow, sectionTitle } from "@motion/ui-core";
import { isReducedMotion } from "../motion/env.js";

/**
 * Motion probe (motion upgrade F0), shown under System. It answers in the real host
 * what a browser cannot: which Chromium CEP runs, whether Ctrl+K and the digit keys
 * reach the panel, and whether the wheel already scrolls smoothly (trackpad deltas)
 * or in notches (mouse wheel). Read-only; it never talks to the host.
 */
const COPY = {
  "pt-BR": {
    title: "Sonda de movimento", engine: "Motor", scale: "Escala da tela", reduced: "Movimento reduzido",
    system: "sistema", panel: "painel", yes: "sim", no: "não", key: "Teclas recebidas", keyHint: "pressione Ctrl+K e 1–5 com o foco aqui",
    wheel: "Roda do mouse", wheelHint: "role a faixa abaixo", notch: "aos saltos (roda)", smooth: "contínua (trackpad)",
    strip: "Role aqui para testar a rolagem"
  },
  "en-US": {
    title: "Motion probe", engine: "Engine", scale: "Display scale", reduced: "Reduced motion",
    system: "system", panel: "panel", yes: "yes", no: "no", key: "Keys received", keyHint: "press Ctrl+K and 1–5 with focus here",
    wheel: "Mouse wheel", wheelHint: "scroll the strip below", notch: "in notches (wheel)", smooth: "continuous (trackpad)",
    strip: "Scroll here to test scrolling"
  }
};

interface ProbeWindow {
  navigator?: { userAgent?: string };
  devicePixelRatio?: number;
  matchMedia?(query: string): { matches: boolean };
}

export function chromiumVersion(userAgent: string | undefined): string {
  return userAgent?.match(/Chrome\/([\d.]+)/)?.[1] ?? "?";
}

/** A modifier pressed on its own (e.g. the Windows key of a screenshot shortcut) says nothing. */
const MODIFIER_KEYS = new Set(["Control", "Shift", "Alt", "Meta", "OS", "AltGraph", "CapsLock"]);
/** The probe keeps this many keys, newest first, so one screenshot shows the whole test. */
export const KEY_HISTORY = 6;

export function isModifierOnly(event: KeyboardEvent): boolean {
  return MODIFIER_KEYS.has(event.key);
}

/** "Ctrl+K", or "1 (Digit1)" for digits so the top row and the numpad can be told apart. */
export function describeKey(event: KeyboardEvent): string {
  const mods = [event.ctrlKey && "Ctrl", event.metaKey && "Meta", event.altKey && "Alt", event.shiftKey && "Shift"].filter(Boolean);
  const key = event.key.length === 1 ? event.key.toUpperCase() : event.key;
  const label = [...mods, key].join("+");
  return /^\d$/.test(event.key) ? `${label} (${event.code || "—"})` : label;
}

/** Notches arrive as whole lines or ≥100 px steps; trackpads send small fractional deltas. */
export function wheelKind(event: WheelEvent): "notch" | "smooth" {
  return event.deltaMode === 1 || (Number.isInteger(event.deltaY) && Math.abs(event.deltaY) >= 100) ? "notch" : "smooth";
}

export function createMotionProbe(doc: Document, locale: string): { element: HTMLElement; dispose(): void } {
  const copy = COPY[locale === "pt-BR" ? "pt-BR" : "en-US"];
  const win = (doc.defaultView ?? null) as ProbeWindow | null;
  const root = doc.documentElement;
  const element = createElement(doc, "section", "ch-motion-probe");
  element.id = "motion-probe";
  element.appendChild(sectionTitle(doc, copy.title));
  element.appendChild(propertyRow(doc, copy.engine, `Chromium ${chromiumVersion(win?.navigator?.userAgent)}`));
  element.appendChild(propertyRow(doc, copy.scale, `${Math.round((win?.devicePixelRatio ?? 1) * 100)}%`));
  let system = false;
  try { system = Boolean(win?.matchMedia?.("(prefers-reduced-motion: reduce)").matches); } catch { /* No media queries. */ }
  element.appendChild(propertyRow(doc, copy.reduced, `${isReducedMotion(root) ? copy.yes : copy.no} (${copy.system}: ${system ? copy.yes : copy.no})`));
  const keyRow = propertyRow(doc, copy.key, copy.keyHint);
  keyRow.id = "motion-probe-key";
  element.appendChild(keyRow);
  const wheelRow = propertyRow(doc, copy.wheel, copy.wheelHint);
  wheelRow.id = "motion-probe-wheel";
  element.appendChild(wheelRow);
  const strip = createElement(doc, "div", "ch-motion-probe__strip");
  strip.setAttribute("tabindex", "0");
  strip.setAttribute("aria-label", copy.strip);
  strip.appendChild(createElement(doc, "div", "ch-motion-probe__track", copy.strip));
  element.appendChild(strip);

  const valueOf = (row: HTMLElement): HTMLElement | null => (row.lastChild as HTMLElement | null) ?? null;
  const keys: string[] = [];
  const wheels = { notch: 0, smooth: 0 };
  const onKey = (event: Event): void => {
    const key = event as KeyboardEvent;
    if (isModifierOnly(key) || key.repeat) return;
    // With the strip focused the probe keeps printable keys, so 1–5 and Ctrl+K are
    // recorded instead of switching views or opening the palette. Tab still leaves.
    if (key.target === strip && key.key.length === 1) key.preventDefault?.();
    keys.unshift(describeKey(key));
    keys.length = Math.min(keys.length, KEY_HISTORY);
    const value = valueOf(keyRow);
    if (value) { value.textContent = keys.join(" · "); value.title = keys.join(" · "); }
  };
  const onWheel = (event: Event): void => {
    const wheel = event as WheelEvent;
    wheels[wheelKind(wheel)]++;
    const value = valueOf(wheelRow);
    if (value) value.textContent = `${copy.notch} ×${wheels.notch} · ${copy.smooth} ×${wheels.smooth} · Δ${Math.round(wheel.deltaY * 10) / 10}`;
  };
  doc.addEventListener?.("keydown", onKey, true);
  strip.addEventListener("wheel", onWheel);
  return {
    element,
    dispose() {
      doc.removeEventListener?.("keydown", onKey, true);
      strip.removeEventListener?.("wheel", onWheel);
    }
  };
}
