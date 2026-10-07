import { selectField, hint } from "./shell.js";
import type { I18n } from "./i18n.js";

type Theme = "dark" | "light";
type PanelLocale = "host" | "pt-BR" | "en-US";
type Density = "default" | "compact";
type PreferenceStorage = Pick<Storage, "getItem" | "setItem">;
const STORAGE_KEY = "motion.panel.preferences.v1";

/** Guarda somente preferências e IDs de ferramentas, nunca dados do projeto. */
export function createPanelPreferences(root: HTMLElement, storage?: PreferenceStorage) {
  let theme: Theme = "dark";
  let locale: PanelLocale = "host";
  let density: Density = "default";
  let category = "all";
  let favorites: string[] = [];
  let recent: string[] = [];
  let presetAutoplay = true, presetSize = 200;
  let quickDockPinned = false;
  const folderColors: Record<string, string> = {};
  let collapsedFolders: string[] = [];
  const colors = ["red", "orange", "yellow", "green", "cyan", "blue", "purple", "pink"];
  const folderId = (v: string): boolean => /^[a-zA-Z][a-zA-Z0-9.-]{0,95}$/.test(v);
  let persistent = Boolean(storage);
  const ids = (value: unknown, limit: number): string[] => Array.isArray(value)
    ? [...new Set(value.filter((id): id is string =>
      typeof id === "string" && /^[a-zA-Z][a-zA-Z0-9.-]{0,95}$/.test(id)))].slice(0, limit)
    : [];
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (raw && raw.length <= 32_768) {
      const saved: unknown = JSON.parse(raw);
      if (saved && typeof saved === "object" && "version" in saved && saved.version === 1) {
        const data = saved as Record<string, unknown>;
        if (data["locale"] === "pt-BR" || data["locale"] === "en-US") locale = data["locale"];
        if (data["theme"] === "light") theme = "light";
        if (data["density"] === "compact") density = "compact";
        if (typeof data["category"] === "string" && ["all", "keyframes", "layers", "animation", "spatial", "shapes", "effects", "project"].includes(data["category"])) category = data["category"];
        favorites = ids(data["favorites"], 100);
        recent = ids(data["recent"], 8);
        if (typeof data["presetAutoplay"] === "boolean") presetAutoplay = data["presetAutoplay"];
        if (typeof data["presetSize"] === "number" && data["presetSize"] >= 140 && data["presetSize"] <= 320) presetSize = data["presetSize"];
        if (typeof data["quickDockPinned"] === "boolean") quickDockPinned = data["quickDockPinned"];
        collapsedFolders = ids(data["collapsedFolders"], 100);
        const labels = data["folderColors"];
        if (labels && typeof labels === "object" && !Array.isArray(labels)) {
          for (const [key, color] of Object.entries(labels).slice(0, 100)) if (folderId(key) && typeof color === "string" && colors.includes(color)) folderColors[key] = color;
        }
      }
    }
  } catch { persistent = false; }

  function apply(): void {
    root.setAttribute("data-theme", theme);
    root.setAttribute("data-density", density);
  }
  function save(): void {
    apply();
    try {
      if (storage) {
        storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, theme, locale, density, category, favorites, recent, presetAutoplay, presetSize, quickDockPinned, folderColors, collapsedFolders }));
        persistent = true;
      }
    } catch { persistent = false; }
  }
  apply();
  return {
    snapshot: () => ({ theme, locale, density, category, favorites: [...favorites], recent: [...recent], persistent, presetAutoplay, presetSize, quickDockPinned, folderColors: { ...folderColors }, collapsedFolders: [...collapsedFolders] }),
    setLocale(value: string) { if (value === "host" || value === "pt-BR" || value === "en-US") { locale = value; save(); } },
    setQuickDockPinned(value: boolean) { if (typeof value === "boolean") { quickDockPinned = value; save(); } },
    setPresetAutoplay(value: boolean) { presetAutoplay = value; save(); },
    setPresetSize(value: number) { if (Number.isFinite(value)) { presetSize = Math.max(140, Math.min(320, value)); save(); } },
    setFolderColor(id: string, color: string) { if (!folderId(id)) return; if (colors.includes(color)) folderColors[id] = color; else delete folderColors[id]; save(); },
    toggleFolder(id: string) { if (!folderId(id)) return; collapsedFolders = collapsedFolders.includes(id) ? collapsedFolders.filter(v => v !== id) : ids([...collapsedFolders, id], 100); save(); },
    setCategory(value: string) { category = value; save(); },
    setTheme(value: string) { if (value === "dark" || value === "light") { theme = value; save(); } },
    setDensity(value: string) { if (value === "default" || value === "compact") { density = value; save(); } },
    toggleFavorite(id: string) {
      if (ids([id], 1).length === 0) return;
      favorites = favorites.includes(id) ? favorites.filter((item) => item !== id) : ids([...favorites, id], 100);
      save();
    },
    recordUse(id: string) { recent = ids([id, ...recent.filter((item) => item !== id)], 8); save(); },
    clearRecent() { recent = []; save(); }
  };
}

export type PanelPreferences = ReturnType<typeof createPanelPreferences>;

/** Storage pode estar ausente ou lançar ao ser acessado no runtime do host. */
export function browserPreferenceStorage(browser: Window): PreferenceStorage | undefined {
  try { return browser.localStorage; } catch { return undefined; }
}

export function appearanceSettings(doc: Document, i18n: I18n, preferences: PanelPreferences,
  rerender: () => void): HTMLElement[] {
  const current = preferences.snapshot();
  return [
    selectField(doc, {
      id: "settings-theme", label: i18n.t("settings.theme.label"), value: current.theme,
      options: [
        { value: "dark", label: i18n.t("settings.theme.dark") },
        { value: "light", label: i18n.t("settings.theme.light") }
      ],
      onChange: (value) => { preferences.setTheme(value); rerender(); }
    }),
    selectField(doc, {
      id: "settings-density", label: i18n.t("settings.density.label"), value: current.density,
      options: [
        { value: "default", label: i18n.t("settings.density.default") },
        { value: "compact", label: i18n.t("settings.density.compact") }
      ],
      onChange: (value) => { preferences.setDensity(value); rerender(); }
    }),
    hint(doc, i18n.t(current.persistent ? "settings.preferences.local" : "settings.preferences.session"))
  ];
}
