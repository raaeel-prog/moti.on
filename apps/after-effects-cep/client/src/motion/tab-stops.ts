/**
 * Removes a subtree from the Tab order and restores it exactly (Chromium 99 has no
 * `inert`). Extracted from quick-dock.ts; used for modal sheets and closed sections.
 */
const FOCUSABLE = ["button", "input", "select", "textarea", "a"];

export function suspendTabStops(root: HTMLElement): () => void {
  const saved = new Map<HTMLElement, string | null>();
  for (const tag of FOCUSABLE) {
    for (const node of Array.from(root.getElementsByTagName(tag)) as HTMLElement[]) {
      if (saved.has(node)) continue;
      saved.set(node, node.getAttribute("tabindex") ?? null);
      node.setAttribute("tabindex", "-1");
    }
  }
  return () => {
    for (const [node, previous] of saved) {
      if (previous === null) node.removeAttribute("tabindex"); else node.setAttribute("tabindex", previous);
    }
    saved.clear();
  };
}
