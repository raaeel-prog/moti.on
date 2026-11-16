/**
 * Command palette model (motion upgrade F5): pure ranking, no DOM. Entries come from the
 * panel (tools, Quick actions, views, settings) and run through the panel's own paths.
 * Score per query word: title prefix > word start in the title > inside the title >
 * keywords > letters in order; every word must match. Recent commands get a bonus.
 */
export type PaletteKind = "preset" | "effect" | "tool" | "quick" | "view" | "setting";
export type PalettePhase = "in" | "out" | "both";

export interface PaletteResult { ok: boolean; message: string }
export interface PaletteTarget { key: string; label: string; reason: string | null }
export type PaletteOperation =
  | { type: "apply"; execute(): Promise<PaletteResult> }
  | { type: "phase"; currentTarget(): PaletteTarget; readTarget(): Promise<PaletteTarget>; execute(phase: PalettePhase): Promise<PaletteResult> };

export interface PaletteEntry {
  id: string;
  kind: PaletteKind;
  title: string;
  /** Second line: what it does, or where it lives (searchable). */
  detail?: string;
  /** Usage hint shown after the detail, never searched ("Enter applies…"). */
  hint?: string;
  /** Extra words to match (aliases, abbreviations, other language). */
  keywords?: string;
  /** Shown as a <kbd> (e.g. "1", "Q"). */
  shortcut?: string;
  /** Why it cannot run now; the entry stays listed and says so. */
  reason?: string | null;
  /** Navigation and editor actions have no host mutation. */
  run?(): void;
  operation?: PaletteOperation;
  suggested?: boolean;
  /** Shift+Enter: open the item's editor or reveal its card. */
  adjust?(): void;
}

export interface RankedEntry { entry: PaletteEntry; score: number }
export interface PaletteGroup { kind: PaletteKind; entries: PaletteEntry[] }

/** Display order of the groups when nothing is typed. */
export const KIND_ORDER: readonly PaletteKind[] = ["view", "preset", "effect", "tool", "quick", "setting"];
export const RECENT_LIMIT = 5;
const RESULT_LIMIT = 40;

export function normalize(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

function isSubsequence(needle: string, haystack: string): boolean {
  let index = 0;
  for (const char of haystack) if (char === needle[index]) index++;
  return index === needle.length;
}

function wordStarts(text: string, word: string): boolean {
  return text.split(/[\s\-·/()]+/).some(part => part.startsWith(word));
}

/** Score of one query word against one entry; 0 means no match. */
function wordScore(word: string, title: string, extra: string): number {
  if (title.startsWith(word)) return 100;
  if (wordStarts(title, word)) return 70;
  if (title.includes(word)) return 40;
  if (wordStarts(extra, word)) return 30;
  if (extra.includes(word)) return 15;
  if (word.length >= 2 && isSubsequence(word, title.replace(/ /g, ""))) return 10;
  return 0;
}

export function scoreEntry(query: string, entry: PaletteEntry, recent: readonly string[] = []): number {
  const normalizedQuery = normalize(query);
  const words = normalizedQuery.split(" ").filter(Boolean);
  const title = normalize(entry.title);
  const extra = normalize(`${entry.keywords ?? ""} ${entry.detail ?? ""}`);
  let score = title === normalizedQuery ? 50 : 0;
  for (const word of words) {
    const value = wordScore(word, title, extra);
    if (!value) return 0;
    score += value;
  }
  const recentIndex = recent.indexOf(entry.id);
  if (recentIndex >= 0) score += 25 - recentIndex * 4;
  if (entry.reason) score -= 5;
  return Math.max(1, score);
}

/** Ranked matches for a query; with no query, the recent commands only. */
export function rankEntries(query: string, entries: readonly PaletteEntry[], recent: readonly string[] = []): RankedEntry[] {
  if (!normalize(query)) {
    return recent.slice(0, RECENT_LIMIT)
      .map(id => entries.find(entry => entry.id === id))
      .filter((entry): entry is PaletteEntry => Boolean(entry))
      .map((entry, index) => ({ entry, score: 1000 - index }));
  }
  return entries
    .map(entry => ({ entry, score: scoreEntry(query, entry, recent) }))
    .filter(item => item.score > 0)
    // On a tie, going somewhere beats applying something (a view before the tool of the same name).
    .sort((a, b) => b.score - a.score || KIND_ORDER.indexOf(a.entry.kind) - KIND_ORDER.indexOf(b.entry.kind) || a.entry.title.localeCompare(b.entry.title))
    .slice(0, RESULT_LIMIT);
}

/**
 * Groups for display. With a query, groups follow their best match (so the top result is
 * first on screen); without one, recents come first and then every kind in KIND_ORDER.
 */
export function groupEntries(query: string, entries: readonly PaletteEntry[], recent: readonly string[] = []): { recent: PaletteEntry[]; groups: PaletteGroup[] } {
  if (!normalize(query)) {
    const recents = rankEntries("", entries, recent).map(item => item.entry);
    const groups = KIND_ORDER.map(kind => ({ kind, entries: entries.filter(entry => entry.kind === kind) })).filter(group => group.entries.length);
    return { recent: recents, groups };
  }
  const groups: PaletteGroup[] = [];
  for (const { entry } of rankEntries(query, entries, recent)) {
    let group = groups.find(item => item.kind === entry.kind);
    if (!group) { group = { kind: entry.kind, entries: [] }; groups.push(group); }
    group.entries.push(entry);
  }
  return { recent: [], groups };
}

/** Newest first, without duplicates. */
export function withRecent(recent: readonly string[], id: string): string[] {
  return [id, ...recent.filter(item => item !== id)].slice(0, RECENT_LIMIT);
}
