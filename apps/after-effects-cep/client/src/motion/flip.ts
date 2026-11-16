import type { MotionEnv } from "./env.js";

/**
 * FLIP reordering: records positions, runs `mutate`, then starts each moved node at its
 * old offset so the `[data-motion~="stack-shift"]` transition slides it into place.
 * Used for toast stacks, palette rows and folder lists. Reduced motion just mutates.
 */
export function flip(env: MotionEnv, nodes: readonly HTMLElement[], mutate: () => void): void {
  if (env.reduced() || !nodes.length || typeof nodes[0]!.getBoundingClientRect !== "function") { mutate(); return; }
  const before = new Map(nodes.map(node => [node, node.getBoundingClientRect()] as const));
  mutate();
  const moved: HTMLElement[] = [];
  for (const [node, first] of before) {
    if (!node.parentNode) continue;
    const last = node.getBoundingClientRect();
    const dx = first.left - last.left, dy = first.top - last.top;
    if (!dx && !dy) continue;
    node.style.setProperty("transition", "none");
    node.style.setProperty("transform", `translate(${Math.round(dx)}px, ${Math.round(dy)}px)`);
    moved.push(node);
  }
  if (!moved.length) return;
  void moved[0]!.offsetWidth;
  for (const node of moved) {
    node.style.removeProperty("transition");
    node.style.removeProperty("transform");
  }
}
