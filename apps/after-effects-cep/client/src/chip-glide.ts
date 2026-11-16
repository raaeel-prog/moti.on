import type { MotionEnv } from "./motion/env.js";

/**
 * Sliding selection for chip groups (motion upgrade F8): one ring travels to the active
 * chip on the spring of the nav pill (selection-glide). Views redraw these groups on
 * every choice, so the last place of each group (by its key) is remembered and a new
 * ring starts there before moving. A ring that already sits on its chip is left alone,
 * so repeated observer passes never restart a slide in flight.
 */
export interface GlidePlace { left: number; top: number; width: number; height: number }

const memory = new Map<string, GlidePlace>();
const ACTIVE = '.ch-chip[data-active="true"], .ch-chip[aria-selected="true"], .ch-chip[aria-pressed="true"], .ch-chip[aria-checked="true"]';
const noop = (): void => {};

/** The group's identity across redraws: its most specific class (e.g. "ch-camera-modes"). */
export function glideKey(group: Element): string {
  const classes = (group.getAttribute("class") ?? "").split(/\s+/).filter(name => name && name !== "ch-chip-group");
  return classes[classes.length - 1] ?? (group.id || "chips");
}

export function placeSignature(place: GlidePlace): string {
  return `${place.left},${place.top},${place.width},${place.height}`;
}

function placeOf(chip: HTMLElement): GlidePlace {
  return { left: chip.offsetLeft, top: chip.offsetTop, width: chip.offsetWidth, height: chip.offsetHeight };
}

function put(glide: HTMLElement, place: GlidePlace): void {
  glide.style.width = `${place.width}px`;
  glide.style.height = `${place.height}px`;
  glide.style.transform = `translate(${place.left}px, ${place.top}px)`;
}

function glideGroup(group: HTMLElement, env: MotionEnv): void {
  let glide = Array.from(group.children).find(node => node.classList?.contains("ch-chip-glide")) as HTMLElement | undefined;
  const active = group.querySelector<HTMLElement>(ACTIVE);
  if (!active || !active.offsetWidth) { glide?.setAttribute("data-visible", "false"); return; }
  // Positioned first, so the chip offsets are measured inside the group.
  group.setAttribute("data-glide", "true");
  const key = glideKey(group);
  const next = placeOf(active);
  const signature = placeSignature(next);
  if (glide) {
    glide.setAttribute("data-visible", "true");
    if (glide.getAttribute("data-at") === signature) return;
    glide.setAttribute("data-ready", String(!env.reduced()));
    glide.setAttribute("data-at", signature);
    put(glide, next);
    memory.set(key, next);
    return;
  }
  glide = group.ownerDocument.createElement("span");
  glide.className = "ch-chip-glide";
  glide.setAttribute("aria-hidden", "true");
  glide.setAttribute("data-motion", "selection-glide");
  glide.setAttribute("data-visible", "true");
  glide.setAttribute("data-at", signature);
  group.insertBefore(glide, group.firstChild);
  const previous = memory.get(key);
  memory.set(key, next);
  glide.setAttribute("data-ready", "false");
  if (!previous || env.reduced() || placeSignature(previous) === signature) { put(glide, next); return; }
  // A redrawn group: start where its ring was, then travel on the next frame.
  put(glide, previous);
  const ring = glide;
  if (env.frame(() => { void ring.offsetWidth; ring.setAttribute("data-ready", "true"); put(ring, next); }) === null) put(ring, next);
}

/** Adds or refreshes the sliding ring of every chip group under `root`. */
export function glideChipGroups(root: ParentNode, env: MotionEnv): void {
  for (const group of Array.from(root.querySelectorAll?.(".ch-chip-group") ?? []) as HTMLElement[]) glideGroup(group, env);
}

/** Keeps every chip group under `root` gliding as views redraw or selections change. */
export function attachChipGlides(root: HTMLElement, env: MotionEnv): () => void {
  const Observer = (root.ownerDocument?.defaultView as (Window & typeof globalThis) | null)?.MutationObserver;
  if (typeof Observer !== "function") return noop;
  let pending = false;
  const run = (): void => { pending = false; glideChipGroups(root, env); };
  const observer = new Observer(() => {
    if (pending) return;
    pending = true;
    if (env.frame(run) === null) run();
  });
  observer.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-active", "aria-selected", "aria-pressed", "aria-checked"] });
  run();
  return () => observer.disconnect();
}

/** Test seam: forget every remembered place. */
export function resetChipGlides(): void { memory.clear(); }
