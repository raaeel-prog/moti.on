import { createElement } from "@motion/ui-core";

/** Keep every field and its position, while giving existing sections one layout owner. */
export function groupToolSections(doc: Document, content: HTMLElement): void {
  const children = Array.from(content.children);
  if (!children.some(child => child.className.split(/\s+/).includes("ch-section-title"))) return;
  let current: HTMLElement | null = null;
  for (const child of children) {
    content.removeChild(child);
    const node = child as HTMLElement;
    if (node.className.split(/\s+/).includes("ch-section-title")) {
      current = createElement(doc, "section", "ch-tool-section");
      current.setAttribute("aria-label", node.textContent ?? "");
      content.appendChild(current);
      current.appendChild(node);
    } else if (current) current.appendChild(node);
    else content.appendChild(node);
  }
}
