import {
  appearanceSettings, checkboxField, createAlert, createActionButton, createElement, hint, numberField, sectionTitle, selectField,
  type I18n, type PanelPreferences
} from "@motion/ui-core";
import type { ReducedMotionController } from "@motion/ui-motion";

/** Local preferences and explicit support navigation; no host calls or account placeholders. */
export function createAeSettingsView(doc: Document, options: {
  i18n: I18n;
  preferences: PanelPreferences;
  motionPreference: ReducedMotionController;
  onLocale(value: string): void;
  onRefresh(): void;
  onNavigate(view: "context" | "system" | "diagnostics"): void;
  /** Offered only once the floating ease window is proven in a real host (capabilities.ts). */
  easeAutoOpen?: { checked: boolean; onChange(value: boolean): void } | null;
}): { element: HTMLElement; dispose(): void } {
  const { i18n, preferences, motionPreference } = options;
  let alive = true;
  const element = createElement(doc, "div", "ch-settings");
  const section = (key: "settings.interface.title" | "settings.preview.title" | "settings.accessibility.title" | "settings.local.title" | "settings.help.title"): HTMLElement => {
    const group = createElement(doc, "section", "ch-settings-section");
    group.setAttribute("aria-label", i18n.t(key));
    group.appendChild(sectionTitle(doc, i18n.t(key)));
    element.appendChild(group);
    return group;
  };
  const appearance = section("settings.interface.title");
  appearance.appendChild(selectField(doc, {
    id: "settings-language", label: i18n.t("settings.language.label"), value: preferences.snapshot().locale,
    options: [
      { value: "host", label: i18n.t("settings.language.host") },
      { value: "pt-BR", label: "Português (Brasil)" },
      { value: "en-US", label: "English" }
    ],
    onChange: value => { if (alive) options.onLocale(value); }
  }));
  for (const field of appearanceSettings(doc, i18n, preferences, () => { if (alive) options.onRefresh(); }).slice(0, 2)) appearance.appendChild(field);
  appearance.appendChild(checkboxField(doc, {
    id: "settings-pin-dock", label: i18n.t("settings.pinDock"), checked: preferences.snapshot().quickDockPinned,
    onChange: checked => { if (alive) { preferences.setQuickDockPinned(checked); options.onRefresh(); } }
  }));
  if (!preferences.snapshot().persistent) appearance.appendChild(createAlert(doc, { tone: "warning", title: i18n.t("settings.preferences.session") }).element);
  const preview = section("settings.preview.title");
  preview.appendChild(checkboxField(doc, {
    id: "settings-preview-autoplay", label: i18n.t("settings.preview.autoplay"), description: i18n.t("settings.preview.description"), checked: preferences.snapshot().presetAutoplay,
    onChange: checked => { if (alive) { preferences.setPresetAutoplay(checked); options.onRefresh(); } }
  }));
  preview.appendChild(numberField(doc, {
    id: "settings-preview-size", label: i18n.t("settings.preview.size"), value: preferences.snapshot().presetSize, min: 140, max: 320, step: 10, unit: "px",
    onCommit: value => { if (alive) { preferences.setPresetSize(value); options.onRefresh(); } }
  }));
  const accessibility = section("settings.accessibility.title");
  accessibility.appendChild(checkboxField(doc, {
    id: "settings-reduce-motion", label: i18n.t("settings.reduceMotion.label"),
    description: i18n.t("settings.reduceMotion.description"), checked: motionPreference.snapshot().internal,
    onChange: checked => { if (alive) { motionPreference.setInternal(checked); options.onRefresh(); } }
  }));
  if (options.easeAutoOpen) {
    accessibility.appendChild(checkboxField(doc, {
      id: "settings-ease-auto-open", label: i18n.t("settings.easeAutoOpen.label"),
      description: i18n.t("settings.easeAutoOpen.description"), checked: options.easeAutoOpen.checked,
      onChange: checked => { if (alive) options.easeAutoOpen?.onChange(checked); }
    }));
  }
  if (motionPreference.snapshot().system) accessibility.appendChild(hint(doc, i18n.t("settings.accessibility.system")));
  const local = section("settings.local.title");
  local.appendChild(hint(doc, i18n.t("settings.local.description")));
  if (preferences.snapshot().recovered) local.appendChild(hint(doc, i18n.t("settings.preferences.recovered")));
  const localStatus = createElement(doc, "p", "ch-hint");
  localStatus.setAttribute("role", "status"); localStatus.setAttribute("aria-live", "polite");
  const localAction = (id: string, label: Parameters<I18n["t"]>[0], act: () => void): void => {
    const control = createActionButton(doc, { id, label: i18n.t(label), variant: "tertiary", onPress: () => {
      if (!alive) return;
      act(); localStatus.textContent = i18n.t(preferences.snapshot().persistent ? "settings.local.updated" : "settings.preferences.session");
    } });
    control.element.classList.add("ch-settings-help-action"); local.appendChild(control.element);
  };
  localAction("settings-clear-recent", "settings.local.recent", () => preferences.clearRecent());
  localAction("settings-clear-colors", "settings.local.colors", () => preferences.clearRecentColors());
  localAction("settings-clear-favorites", "settings.local.favorites", () => preferences.clearFavorites());
  localAction("settings-reset-interface", "settings.local.interface", () => { preferences.resetInterface(); options.onLocale("host"); });
  localAction("settings-reset-preview", "settings.local.preview", () => { preferences.resetPreviews(); options.onRefresh(); });
  local.appendChild(localStatus);
  const help = section("settings.help.title");
  help.classList.add("ch-settings-help");
  for (const view of ["context", "system", "diagnostics"] as const) {
    const action = createActionButton(doc, {
      id: `settings-help-${view}`, label: i18n.t(`settings.help.${view}`), variant: "tertiary",
      onPress: () => { if (alive) options.onNavigate(view); }
    });
    action.element.classList.add("ch-settings-help-action");
    help.appendChild(action.element);
  }
  return { element, dispose: () => { alive = false; } };
}
