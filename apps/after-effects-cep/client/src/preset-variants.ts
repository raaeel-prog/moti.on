import { MOTION_LIBRARY_PRESETS, isMotionLibraryOptions, type MotionLibraryOptions } from "@motion/contracts";

export interface PresetVariant {
  id: string;
  name: string;
  presetId: string;
  options: MotionLibraryOptions;
}
export type PresetVariantError = "unavailable" | "read" | "invalid" | "write" | "name" | "duplicate" | "limit" | "missing";
export type PresetVariantResult = { ok: true; items: PresetVariant[] } | { ok: false; error: PresetVariantError };
export type PresetVariantExport = { ok: true; json: string } | { ok: false; error: PresetVariantError };
export type PresetVariantStorage = Pick<Storage, "getItem" | "setItem">;
export const PRESET_VARIANTS_STORAGE_KEY = "motion.preset.variants.v1";
const MAX_ITEMS = 100, MAX_NAME = 80, MAX_BYTES = 131_072;
const recipes = new Set(MOTION_LIBRARY_PRESETS.filter(preset => !preset.id.startsWith("camera-")).map(preset => preset.id));
const idPattern = /^variant-[a-z0-9-]{1,80}$/;

function plain(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const actual = Reflect.ownKeys(value);
  return actual.length === keys.length && actual.every(key => typeof key === "string" && keys.includes(key) && Object.prototype.hasOwnProperty.call(Object.getOwnPropertyDescriptor(value, key), "value"));
}
function validName(value: unknown): value is string {
  return typeof value === "string" && value === value.trim() && value.length > 0 && value.length <= MAX_NAME && Array.from(value).every(character => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127);
}
function validVariant(value: unknown): value is PresetVariant {
  return plain(value, ["id", "name", "presetId", "options"]) && typeof value["id"] === "string" && idPattern.test(value["id"])
    && validName(value["name"]) && typeof value["presetId"] === "string" && recipes.has(value["presetId"]) && isMotionLibraryOptions(value["options"]);
}
function clone(variant: PresetVariant): PresetVariant { return { ...variant, options: { ...variant.options } }; }
function nameKey(name: string): string { return name.toLocaleLowerCase(); }
function newId(): string { return `variant-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`; }
function parse(raw: string): PresetVariantResult {
  if (raw.length > MAX_BYTES) return { ok: false, error: "invalid" };
  try {
    const data: unknown = JSON.parse(raw);
    if (!plain(data, ["version", "items"]) || data["version"] !== 1 || !Array.isArray(data["items"]) || data["items"].length > MAX_ITEMS) return { ok: false, error: "invalid" };
    const ids = new Set<string>(), names = new Set<string>(), items: PresetVariant[] = [];
    for (const candidate of data["items"]) {
      if (!validVariant(candidate) || ids.has(candidate.id) || names.has(nameKey(candidate.name))) return { ok: false, error: "invalid" };
      ids.add(candidate.id); names.add(nameKey(candidate.name)); items.push(clone(candidate));
    }
    return { ok: true, items };
  } catch { return { ok: false, error: "invalid" }; }
}
function copyName(name: string, items: PresetVariant[]): string | undefined {
  const names = new Set(items.map(item => nameKey(item.name)));
  for (let index = 2; index <= MAX_ITEMS + 1; index++) {
    const suffix = ` (${index})`, candidate = `${name.slice(0, MAX_NAME - suffix.length).trimEnd()}${suffix}`;
    if (!names.has(nameKey(candidate))) return candidate;
  }
  return undefined;
}
function availableId(items: PresetVariant[]): string | undefined {
  for (let attempt = 0; attempt <= MAX_ITEMS; attempt++) {
    const id = newId(); if (!items.some(item => item.id === id)) return id;
  }
  return undefined;
}
function sameRecipe(left: PresetVariant, right: PresetVariant): boolean {
  return left.name === right.name && left.presetId === right.presetId
    && Object.keys(left.options).length === Object.keys(right.options).length
    && Object.keys(left.options).every(key => left.options[key as keyof MotionLibraryOptions] === right.options[key as keyof MotionLibraryOptions]);
}

/** Recipes only. Every mutation reloads storage, so another panel's saved items
 * are retained. Corrupt/unreadable storage is never replaced by an empty list. */
export function createPresetVariants(storage?: PresetVariantStorage): {
  read(): PresetVariantResult;
  save(name: string, presetId: string, options: MotionLibraryOptions): PresetVariantResult;
  rename(id: string, name: string): PresetVariantResult;
  duplicate(id: string): PresetVariantResult;
  update(id: string, presetId: string, options: MotionLibraryOptions): PresetVariantResult;
  exportJson(): PresetVariantExport;
  importJson(json: string): PresetVariantResult;
  remove(id: string): PresetVariantResult;
  restore(variant: PresetVariant): PresetVariantResult;
} {
  function read(): PresetVariantResult {
    if (!storage) return { ok: false, error: "unavailable" };
    let raw: string | null;
    try { raw = storage.getItem(PRESET_VARIANTS_STORAGE_KEY); } catch { return { ok: false, error: "read" }; }
    if (raw === null) return { ok: true, items: [] };
    return parse(raw);
  }
  function write(items: PresetVariant[]): PresetVariantResult {
    const raw = JSON.stringify({ version: 1, items });
    if (raw.length > MAX_BYTES) return { ok: false, error: "limit" };
    try {
      storage!.setItem(PRESET_VARIANTS_STORAGE_KEY, raw);
      if (storage!.getItem(PRESET_VARIANTS_STORAGE_KEY) !== raw) return { ok: false, error: "write" };
      return { ok: true, items: items.map(clone) };
    } catch { return { ok: false, error: "write" }; }
  }
  function append(variant: PresetVariant): PresetVariantResult {
    if (!validVariant(variant)) return { ok: false, error: "invalid" };
    const current = read(); if (!current.ok) return current;
    if (current.items.length >= MAX_ITEMS) return { ok: false, error: "limit" };
    if (current.items.some(item => item.id === variant.id || nameKey(item.name) === nameKey(variant.name))) return { ok: false, error: "duplicate" };
    return write([...current.items, clone(variant)]);
  }
  return {
    read,
    save(name, presetId, options) {
      const trimmed = name.trim();
      if (!validName(trimmed)) return { ok: false, error: "name" };
      if (!recipes.has(presetId) || !isMotionLibraryOptions(options)) return { ok: false, error: "invalid" };
      return append({ id: newId(), name: trimmed, presetId, options: { ...options } });
    },
    rename(id, name) {
      const trimmed = name.trim();
      if (!validName(trimmed)) return { ok: false, error: "name" };
      const current = read(); if (!current.ok) return current;
      if (!current.items.some(item => item.id === id)) return { ok: false, error: "missing" };
      if (current.items.some(item => item.id !== id && nameKey(item.name) === nameKey(trimmed))) return { ok: false, error: "duplicate" };
      return write(current.items.map(item => item.id === id ? { ...item, name: trimmed } : item));
    },
    duplicate(id) {
      const current = read(); if (!current.ok) return current;
      const original = current.items.find(item => item.id === id);
      if (!original) return { ok: false, error: "missing" };
      if (current.items.length >= MAX_ITEMS) return { ok: false, error: "limit" };
      const name = copyName(original.name, current.items), copyId = availableId(current.items);
      if (!name || !copyId) return { ok: false, error: "duplicate" };
      return write([...current.items, { ...clone(original), id: copyId, name }]);
    },
    update(id, presetId, options) {
      if (!recipes.has(presetId) || !isMotionLibraryOptions(options)) return { ok: false, error: "invalid" };
      const current = read(); if (!current.ok) return current;
      if (!current.items.some(item => item.id === id)) return { ok: false, error: "missing" };
      return write(current.items.map(item => item.id === id ? { ...item, presetId, options: { ...options } } : item));
    },
    exportJson() {
      const current = read(); if (!current.ok) return current;
      return { ok: true, json: JSON.stringify({ version: 1, items: current.items }) };
    },
    importJson(json) {
      const imported = parse(json); if (!imported.ok) return imported;
      const current = read(); if (!current.ok) return current;
      const merged = current.items.map(clone);
      for (const variant of imported.items) {
        // Identical items are a no-op. Conflicting names or IDs
        // create another item; an import can never overwrite an existing one.
        if (merged.some(item => sameRecipe(item, variant))) continue;
        if (merged.length >= MAX_ITEMS) return { ok: false, error: "limit" };
        const id = merged.some(item => item.id === variant.id) ? availableId(merged) : variant.id;
        const name = merged.some(item => nameKey(item.name) === nameKey(variant.name)) ? copyName(variant.name, merged) : variant.name;
        if (!id || !name) return { ok: false, error: "duplicate" };
        merged.push({ ...clone(variant), id, name });
      }
      return merged.length === current.items.length ? current : write(merged);
    },
    remove(id) {
      const current = read(); if (!current.ok) return current;
      if (!current.items.some(item => item.id === id)) return { ok: false, error: "missing" };
      return write(current.items.filter(item => item.id !== id));
    },
    restore: append
  };
}
