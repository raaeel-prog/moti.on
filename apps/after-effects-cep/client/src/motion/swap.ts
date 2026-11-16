/**
 * Text swap ("bump"): a fresh node per change so CSS replays the entry animation of
 * `[data-motion~="text-swap"]`. Same text keeps the existing node (no replay on polling).
 * Generalised from the quick dock context pill and the anchor name.
 */
export function swapText(doc: Document, holder: HTMLElement, text: string, className = "ch-swap"): HTMLElement {
  const current = holder.firstChild as HTMLElement | null;
  if (current && holder.getAttribute("data-swap-text") === text) return current;
  while (holder.firstChild) holder.removeChild(holder.firstChild);
  const node = doc.createElement("span");
  node.className = className;
  node.textContent = text;
  node.setAttribute("data-motion", "text-swap");
  holder.setAttribute("data-swap-text", text);
  holder.appendChild(node);
  return node;
}
