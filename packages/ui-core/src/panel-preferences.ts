import { selectField, hint } from "./shell.js";
import type { I18n } from "./i18n.js";

type Theme = "dark" | "light";
type PanelLocale = "host" | "pt-BR" | "en-US";
type Density = "default" | "compact";
type PreferenceStorage = Pick<Storage, "getItem" | "setItem">;
const STORAGE_KEY = "motion.panel.preferences.v1";
/**
 * Cópia do que estava salvo quando a leitura falhou. Sem ela, o próximo
 * salvamento (trocar o tema, favoritar) apagaria favoritos e recentes que
 * talvez ainda fossem recuperáveis.
 */
export const PREFERENCES_BACKUP_KEY = "motion.panel.preferences.v1.unreadable";
/** Abas que o painel reabre. "tools" depende de uma ferramenta aberta; as de
 * suporte são de passagem. */
const RESTORABLE_VIEWS = ["home", "ease", "presets", "settings"];
const GALLERY_SCOPES = ["all", "favorites", "recent"];
const MAX_DRAFTS = 24;

export interface GalleryMemory { category: string; scope: string; query: string; presetId: string }
type DraftValue = string | number | boolean;

/** Guarda somente preferências e IDs de ferramentas, nunca dados do projeto. */
export function createPanelPreferences(root: HTMLElement, storage?: PreferenceStorage) {
  let theme: Theme = "dark";
  let locale: PanelLocale = "host";
  let density: Density = "default";
  let category = "all";
  let favorites: string[] = [];
  let recent: string[] = [];
  let recentColors: string[] = [];
  const hexes = (value: unknown, limit: number): string[] => Array.isArray(value)
    ? [...new Set(value.filter((hex): hex is string => typeof hex === "string" && /^#[0-9a-f]{6}$/.test(hex)))].slice(0, limit)
    : [];
  let presetAutoplay = true, presetSize = 200;
  let quickDockPinned = false;
  let lastView = "";
  let gallery: GalleryMemory = { category: "all", scope: "all", query: "", presetId: "" };
  let drafts: Record<string, Record<string, DraftValue>> = {};
  /** `true` quando havia dado salvo ilegível; uma cópia ficou em PREFERENCES_BACKUP_KEY. */
  let recovered = false;
  const folderColors: Record<string, string> = {};
  let collapsedFolders: string[] = [];
  const colors = ["red", "orange", "yellow", "green", "cyan", "blue", "purple", "pink"];
  const folderId = (v: string): boolean => /^[a-zA-Z][a-zA-Z0-9.-]{0,95}$/.test(v);
  let persistent = Boolean(storage);
  const ids = (value: unknown, limit: number): string[] => Array.isArray(value)
    ? [...new Set(value.filter((id): id is string =>
      typeof id === "string" && /^[a-zA-Z][a-zA-Z0-9.-]{0,95}$/.test(id)))].slice(0, limit)
    : [];
  const cleanDrafts = (value: unknown): Record<string, Record<string, DraftValue>> => {
    const out: Record<string, Record<string, DraftValue>> = {};
    if (!value || typeof value !== "object" || Array.isArray(value)) return out;
    for (const [id, draft] of Object.entries(value).slice(0, MAX_DRAFTS)) {
      if (ids([id], 1).length === 0 || !draft || typeof draft !== "object" || Array.isArray(draft)) continue;
      const fields: Record<string, DraftValue> = {};
      for (const [key, field] of Object.entries(draft).slice(0, 40)) {
        if (!/^[a-zA-Z]{1,32}$/.test(key)) continue;
        if (typeof field === "boolean" || (typeof field === "number" && Number.isFinite(field)) || (typeof field === "string" && field.length <= 40)) fields[key] = field;
      }
      out[id] = fields;
    }
    return out;
  };
  const cleanGallery = (value: unknown): GalleryMemory => {
    const next: GalleryMemory = { category: "all", scope: "all", query: "", presetId: "" };
    if (!value || typeof value !== "object" || Array.isArray(value)) return next;
    const data = value as Record<string, unknown>;
    if (typeof data["category"] === "string" && folderId(data["category"])) next.category = data["category"];
    if (typeof data["scope"] === "string" && GALLERY_SCOPES.includes(data["scope"])) next.scope = data["scope"];
    if (typeof data["query"] === "string" && data["query"].length <= 120 && !Array.from(data["query"]).some(character => character.charCodeAt(0) < 32)) next.query = data["query"];
    if (typeof data["presetId"] === "string" && ids([data["presetId"]], 1).length === 1) next.presetId = data["presetId"];
    return next;
  };
  let readable = true;
  let unreadableRaw = "";
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (raw) { readable = false; unreadableRaw = raw; }
    if (raw && raw.length <= 32_768) {
      const saved: unknown = JSON.parse(raw);
      if (saved && typeof saved === "object" && "version" in saved && saved.version === 1) {
        readable = true;
        const data = saved as Record<string, unknown>;
        if (data["locale"] === "pt-BR" || data["locale"] === "en-US") locale = data["locale"];
        if (data["theme"] === "light") theme = "light";
        if (data["density"] === "compact") density = "compact";
        if (typeof data["category"] === "string" && ["all", "keyframes", "layers", "animation", "spatial", "shapes", "effects", "project"].includes(data["category"])) category = data["category"];
        favorites = ids(data["favorites"], 100);
        recent = ids(data["recent"], 8);
        recentColors = hexes(data["recentColors"], 8);
        if (typeof data["presetAutoplay"] === "boolean") presetAutoplay = data["presetAutoplay"];
        if (typeof data["presetSize"] === "number" && data["presetSize"] >= 140 && data["presetSize"] <= 320) presetSize = data["presetSize"];
        if (typeof data["quickDockPinned"] === "boolean") quickDockPinned = data["quickDockPinned"];
        collapsedFolders = ids(data["collapsedFolders"], 100);
        // Campos adicionados sem mudar a versão: um build anterior lê o mesmo
        // registro e só ignora o que não conhece.
        if (typeof data["lastView"] === "string" && RESTORABLE_VIEWS.includes(data["lastView"])) lastView = data["lastView"];
        gallery = cleanGallery(data["gallery"]);
        drafts = cleanDrafts(data["drafts"]);
        const labels = data["folderColors"];
        if (labels && typeof labels === "object" && !Array.isArray(labels)) {
          for (const [key, color] of Object.entries(labels).slice(0, 100)) if (folderId(key) && typeof color === "string" && colors.includes(color)) folderColors[key] = color;
        }
      }
    }
  } catch { readable = false; }
  if (!readable && storage) {
    // Guarda o original antes de qualquer gravação. Se nem a cópia couber (ou
    // se a própria leitura falhou), o painel fica só na sessão em vez de
    // sobrescrever o que existia.
    if (unreadableRaw) {
      try {
        storage.setItem(PREFERENCES_BACKUP_KEY, unreadableRaw.slice(0, 65_536));
        recovered = true;
      } catch { persistent = false; }
    } else persistent = false;
  }

  function apply(): void {
    root.setAttribute("data-theme", theme);
    root.setAttribute("data-density", density);
  }
  function save(): void {
    apply();
    if (!storage || (!readable && !recovered)) return;
    try {
      const base = { version: 1, theme, locale, density, category, favorites, recent, recentColors, presetAutoplay, presetSize, quickDockPinned, folderColors, collapsedFolders, lastView, gallery };
      let serialized = JSON.stringify({ ...base, drafts });
      // Rascunhos são o primeiro a ceder: preferências e favoritos sempre cabem.
      if (serialized.length > 32_768) serialized = JSON.stringify({ ...base, drafts: {} });
      storage.setItem(STORAGE_KEY, serialized);
      persistent = true;
    } catch { persistent = false; }
  }
  apply();
  return {
    snapshot: () => ({ theme, locale, density, category, favorites: [...favorites], recent: [...recent], recentColors: [...recentColors], persistent, recovered, presetAutoplay, presetSize, quickDockPinned, folderColors: { ...folderColors }, collapsedFolders: [...collapsedFolders], lastView, gallery: { ...gallery }, drafts: JSON.parse(JSON.stringify(drafts)) as Record<string, Record<string, DraftValue>> }),
    /** Só as abas principais; não grava se nada mudou (é chamado a cada render). */
    setLastView(value: string) { if (RESTORABLE_VIEWS.includes(value) && value !== lastView) { lastView = value; save(); } },
    setGallery(value: Partial<GalleryMemory>) {
      const next = cleanGallery({ ...gallery, ...value });
      if (JSON.stringify(next) === JSON.stringify(gallery)) return;
      gallery = next; save();
    },
    setDrafts(value: Record<string, unknown>) {
      const next = cleanDrafts(value);
      if (JSON.stringify(next) === JSON.stringify(drafts)) return;
      drafts = next; save();
    },
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
    recordColor(hex: string) {
      const value = typeof hex === "string" ? hex.toLowerCase() : "";
      if (!/^#[0-9a-f]{6}$/.test(value)) return;
      recentColors = hexes([value, ...recentColors.filter((item) => item !== value)], 8); save();
    },
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
    hint(doc, i18n.t(current.persistent ? "settings.preferences.local" : "settings.preferences.session")),
    ...(current.recovered ? [hint(doc, i18n.t("settings.preferences.recovered"))] : [])
  ];
}
