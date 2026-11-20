import { button, createElement, MOTION_BLUE_ACCENT, normalizeHexColor, type I18n, type PanelPreferences } from "@motion/ui-core";

const swatches = [
  [MOTION_BLUE_ACCENT, "settings.accent.blue"], ["#bb9cff", "settings.accent.violet"],
  ["#57cdde", "settings.accent.cyan"], ["#75cd9a", "settings.accent.green"],
  ["#f2b966", "settings.accent.amber"], ["#f5a6c6", "settings.accent.pink"],
  ["host", "settings.accent.host"]
] as const;

export function createAccentSetting(doc: Document, i18n: I18n, preferences: PanelPreferences) {
  const view = doc.defaultView;
  const element = createElement(doc, "div", "ch-accent-setting");
  const label = createElement(doc, "span", "ch-accent-setting__caption", i18n.t("settings.accent.label"));
  label.id = "settings-accent-label";
  const trigger = button(doc, { label: "" });
  trigger.classList.add("ch-accent-setting__trigger");
  const dot = (value?: string): HTMLElement => {
    const icon = createElement(doc, "span", "ch-accent-swatch");
    icon.setAttribute("aria-hidden", "true");
    if (value) icon.style.setProperty("--swatch", value);
    return icon;
  };
  const name = createElement(doc, "span", "ch-accent-setting__name");
  name.id = "settings-accent-name";
  const chevron = createElement(doc, "span", "ch-accent-setting__chevron", "⌄");
  chevron.setAttribute("aria-hidden", "true");
  trigger.appendChild(dot());
  trigger.appendChild(name);
  trigger.appendChild(chevron);
  trigger.setAttribute("aria-labelledby", `${label.id} ${name.id}`);
  trigger.setAttribute("aria-controls", "settings-accent-palette");
  trigger.setAttribute("aria-haspopup", "dialog");
  trigger.setAttribute("aria-expanded", "false");
  element.appendChild(label);
  element.appendChild(trigger);

  const palette = createElement(doc, "div", "ch-accent-palette");
  palette.id = "settings-accent-palette";
  palette.setAttribute("aria-labelledby", label.id);
  palette.setAttribute("role", "dialog");
  palette.setAttribute("data-motion", "menu-pop");
  palette.hidden = true;
  const list = createElement(doc, "div", "ch-accent-palette__swatches");
  palette.appendChild(list);
  const cells = swatches.map(([value, key]) => {
    const control = button(doc, { label: "", onClick: () => select(value) });
    control.classList.add("ch-accent-palette__option");
    control.appendChild(dot(value === "host" ? "var(--ae-host-accent, #c8ccd3)" : value));
    control.appendChild(createElement(doc, "span", "", i18n.t(key)));
    list.appendChild(control);
    return { value, control, key };
  });
  const custom = createElement(doc, "div", "ch-accent-palette__custom");
  custom.appendChild(createElement(doc, "span", "", i18n.t("settings.accent.custom")));
  const color = doc.createElement("input");
  color.type = "color";
  color.hidden = color.type !== "color";
  color.setAttribute("aria-label", i18n.t("settings.accent.picker"));
  const hex = doc.createElement("input");
  hex.type = "text";
  hex.maxLength = 7;
  hex.spellcheck = false;
  hex.setAttribute("aria-label", i18n.t("settings.accent.hex"));
  hex.setAttribute("aria-describedby", "settings-accent-feedback");
  custom.appendChild(color);
  custom.appendChild(hex);
  palette.appendChild(custom);
  const feedback = createElement(doc, "small", "ch-accent-palette__feedback");
  feedback.id = "settings-accent-feedback";
  feedback.setAttribute("role", "status");
  palette.appendChild(feedback);
  element.appendChild(palette);

  function sync(): void {
    const value = preferences.accentChoice();
    name.textContent = i18n.t(cells.find(cell => cell.value === value)?.key ?? "settings.accent.custom");
    for (const cell of cells) cell.control.setAttribute("aria-pressed", String(cell.value === value));
    const style = doc.documentElement.style;
    const source = value === "host" ? style?.getPropertyValue?.("--ae-accent-source") || "#c8ccd3" : value;
    const visible = style?.getPropertyValue?.("--ae-accent") || source;
    color.value = source;
    hex.value = source.toUpperCase();
    hex.removeAttribute("aria-invalid");
    feedback.textContent = source !== visible ? i18n.t("settings.accent.adjusted", { color: visible.toUpperCase() }) : "";
    feedback.hidden = !feedback.textContent;
  }

  function position(): void {
    if (palette.hidden || !view) return;
    const anchor = trigger.getBoundingClientRect();
    const edge = 8, gap = 4;
    const below = view.innerHeight - anchor.bottom - edge - gap;
    const above = anchor.top - edge - gap;
    const down = below >= palette.scrollHeight || below >= above;
    palette.style.setProperty("max-height", `${Math.max(40, down ? below : above)}px`);
    palette.style.setProperty("left", `${Math.max(edge, Math.min(view.innerWidth - palette.offsetWidth - edge, anchor.right - palette.offsetWidth))}px`);
    palette.style.setProperty("top", `${Math.max(edge, down ? anchor.bottom + gap : anchor.top - palette.offsetHeight - gap)}px`);
  }

  function select(value: string): void {
    preferences.setAccent(value);
    sync();
    position();
  }

  function commitHex(): void {
    const value = normalizeHexColor(hex.value);
    if (value) select(value);
    else {
      hex.setAttribute("aria-invalid", "true");
      feedback.textContent = i18n.t("settings.accent.invalid");
      feedback.hidden = false;
      position();
    }
  }

  function close(restoreFocus = false): void {
    if (palette.hidden) return;
    palette.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    if (restoreFocus) trigger.focus({ preventScroll: true });
  }

  const outside = (event: Event): void => { if (!element.contains(event.target as Node)) close(); };
  const escape = (event: KeyboardEvent): void => {
    if (event.key !== "Escape" || palette.hidden) return;
    event.preventDefault();
    event.stopPropagation();
    close(true);
  };
  trigger.addEventListener("click", () => {
    if (!palette.hidden) { close(); return; }
    sync();
    palette.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    position();
    (cells.find(cell => cell.value === preferences.accentChoice())?.control ?? hex).focus({ preventScroll: true });
  });
  palette.addEventListener("focusout", event => {
    if (event.relatedTarget && !element.contains(event.relatedTarget as Node)) close();
  });
  color.addEventListener("change", () => select(color.value));
  hex.addEventListener("change", commitHex);
  hex.addEventListener("keydown", event => {
    if (event.key === "Enter") { event.preventDefault(); commitHex(); }
  });
  doc.addEventListener("pointerdown", outside, true);
  doc.addEventListener("keydown", escape, true);
  doc.addEventListener("scroll", position, true);
  view?.addEventListener("resize", position);
  sync();
  return { element, dispose() {
    close();
    doc.removeEventListener("pointerdown", outside, true);
    doc.removeEventListener("keydown", escape, true);
    doc.removeEventListener("scroll", position, true);
    view?.removeEventListener("resize", position);
  } };
}
