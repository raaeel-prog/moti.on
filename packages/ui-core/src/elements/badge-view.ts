import { element, requireText } from "../component-dom.js";
import type { BadgeController, BadgeOptions, FeedbackTone } from "../components.js";

const TONES: readonly FeedbackTone[] = ["default", "destructive", "warning", "success", "info"];

export interface BadgeView extends BadgeController {
  update(options: BadgeOptions): void;
}

export function validateBadgeTone(tone: FeedbackTone): void {
  if (!TONES.includes(tone)) throw new Error("Invalid badge tone.");
}

export function validateBadgeOptions(options: BadgeOptions): void {
  requireText(options.label, "label");
  validateBadgeTone(options.tone ?? "default");
  if (options.showIcon !== undefined && typeof options.showIcon !== "boolean") {
    throw new Error("showIcon must be boolean.");
  }
}

/** Static Light DOM, shared by the custom element and the span fallback. */
export function mountBadgeView(doc: Document, root: HTMLElement, options: BadgeOptions): BadgeView {
  validateBadgeOptions(options);
  const icon = element(doc, "span", "ch-badge__icon");
  icon.setAttribute("aria-hidden", "true");
  const label = element(doc, "span", "ch-badge__label");
  root.appendChild(label);
  let rendered: BadgeOptions | undefined;

  function update(next: BadgeOptions): void {
    validateBadgeOptions(next);
    const tone = next.tone ?? "default";
    if (!rendered || (rendered.tone ?? "default") !== tone) {
      // Consumers may add placement classes to the root; tone does not own them.
      const classes = root.className.split(/\s+/).filter(name =>
        name && name !== "ch-badge" && !TONES.some(candidate => name === `ch-badge--${candidate}`));
      root.className = ["ch-badge", `ch-badge--${tone}`, ...classes].join(" ");
      icon.textContent = tone === "success" ? "✓" : tone === "warning" ? "!" : tone === "destructive" ? "×" : "i";
    }
    if (!rendered || rendered.label !== next.label) label.textContent = next.label;
    const showIcon = next.showIcon !== false;
    if (showIcon && icon.parentNode !== root) {
      // Reuse both nodes and basic DOM operations supported by both hosts.
      root.removeChild(label);
      root.appendChild(icon);
      root.appendChild(label);
    } else if (!showIcon && icon.parentNode === root) {
      root.removeChild(icon);
    }
    rendered = { ...next };
  }

  update(options);
  return {
    element: root,
    setLabel(value) { update({ ...rendered!, label: value }); },
    setTone(tone) { update({ ...rendered!, tone }); },
    update
  };
}
