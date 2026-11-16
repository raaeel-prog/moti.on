/**
 * Pure helpers for the Quick actions chrome (Onyx Vivo): copy, filter tabs,
 * keyboard map and search normalisation. No DOM state lives here.
 */
import type { QuickAction } from "./quick-actions.js";

export type QuickTab = "all" | "layers" | "project" | "effects" | "favorites";

/** Two rows of nine mirror the keyboard: QWERTYUIO / ASDFGHJKL. */
export const QUICK_KEYS = "QWERTYUIOASDFGHJKL";

/** Numeric keypad layout onto the 3×3 anchor grid (7 = top-left, 3 = bottom-right). */
const NUMPAD_TO_ANCHOR: Readonly<Record<string, number>> = Object.freeze({ "7": 0, "8": 1, "9": 2, "4": 3, "5": 4, "6": 5, "1": 6, "2": 7, "3": 8 });

export function anchorIndexForKey(key: string): number | null {
  return NUMPAD_TO_ANCHOR[key] ?? null;
}

/** Index of the visible tile a plain letter selects, or -1. */
export function tileIndexForKey(key: string): number {
  return key.length === 1 ? QUICK_KEYS.indexOf(key.toUpperCase()) : -1;
}

/** The two keyboard rows the two tile rows mirror. */
const KEY_ROWS = [QUICK_KEYS.slice(0, 9), QUICK_KEYS.slice(9)] as const;

/** Columns of the two-row strip that holds `count` tiles (ae-quick-actions.css `--qa-columns`). */
export function stripColumns(count: number): number {
  return Math.max(1, Math.ceil(count / 2));
}

/** Letter of the tile at `index` in a two-row strip `columns` wide: each row mirrors its keyboard row. */
export function tileLetter(index: number, columns: number): string {
  return KEY_ROWS[Math.floor(index / columns)]?.[index % columns] ?? "";
}

/** Visible tile a plain letter selects in a two-row strip `columns` wide holding `count` tiles, or -1. */
export function tileIndexForLetter(key: string, columns: number, count: number): number {
  if (key.length !== 1) return -1;
  const letter = key.toUpperCase();
  for (let row = 0; row < KEY_ROWS.length; row++) {
    const column = KEY_ROWS[row]!.indexOf(letter);
    if (column < 0 || column >= columns) continue;
    const index = row * columns + column;
    return index < count ? index : -1;
  }
  return -1;
}

export function withFavorite(favorites: readonly QuickAction[], action: QuickAction): QuickAction[] {
  return favorites.includes(action) ? favorites.filter(item => item !== action) : [...favorites, action];
}

export function withRecent(recents: readonly QuickAction[], action: QuickAction, limit = 4): QuickAction[] {
  return [action, ...recents.filter(item => item !== action)].slice(0, limit);
}

export interface QuickTabDefinition {
  readonly id: QuickTab;
  readonly pt: string;
  readonly en: string;
  /** 24-unit stroke drawing for the compact segmented control. */
  readonly path: string;
}

export const QUICK_TABS: readonly QuickTabDefinition[] = Object.freeze([
  { id: "all", pt: "Tudo", en: "All", path: "M4 4h6.5v6.5H4zM13.5 4H20v6.5h-6.5zM4 13.5h6.5V20H4zM13.5 13.5H20V20h-6.5z" },
  { id: "layers", pt: "Camada", en: "Layer", path: "M12 4l8 4-8 4-8-4zM4 12l8 4 8-4M4 16l8 4 8-4" },
  { id: "project", pt: "Criar e exportar", en: "Create and export", path: "M12 5v14M5 12h14" },
  { id: "effects", pt: "Efeitos", en: "Effects", path: "M12 3l2 5.5 5.5 1.5-5.5 2-2 5.5-2-5.5-5.5-2 5.5-1.5z" },
  { id: "favorites", pt: "Favoritos", en: "Favorites", path: "M12 3.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 16.9l-5.3 2.7 1-5.8-4.2-4.1 5.9-.9z" }
] as const);

export const QUICK_COPY = {
  "pt-BR": {
    filters: "Filtrar ações", shortcuts: "Atalhos", keys: "Mostrar atalhos (segure Alt)", recents: "Recentes",
    noRecents: "nenhuma ainda", noFavorites: "Nenhum favorito ainda. Clique com o botão direito em uma ação para fixá-la.",
    pinned: (abbr: string) => `${abbr} fixado nos favoritos`,
    unpinned: (abbr: string) => `${abbr} removido dos favoritos`, favoriteHint: "Botão direito: favoritar",
    previous: "Ações anteriores", next: "Mais ações"
  },
  "en-US": {
    filters: "Filter actions", shortcuts: "Shortcuts", keys: "Show shortcuts (hold Alt)", recents: "Recent",
    noRecents: "none yet", noFavorites: "No favorites yet. Right-click an action to pin it.",
    pinned: (abbr: string) => `${abbr} pinned to favorites`,
    unpinned: (abbr: string) => `${abbr} removed from favorites`, favoriteHint: "Right-click: favorite",
    previous: "Previous actions", next: "More actions"
  }
};
