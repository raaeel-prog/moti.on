/**
 * Shared ease draft between the two surfaces (docked panel and floating
 * window): the draft and the host session live in localStorage, and a CEP
 * event with the revision tells the other surface to reload. The event also
 * carries the payload, so the protocol works even if CEP keeps localStorage
 * per extension (open uncertainty recorded in
 * docs/research/cep-modeless-quick-ease.md).
 *
 * The host is written by one surface at a time: a short lease in storage
 * refuses a second apply while the first is in flight.
 */
import { protectedWrite, type ProtectedStorage } from "./storage-safety.js";
import { DEFAULT_EASE, cloneEaseDraft, validEaseSession, type EaseDraft, type EaseSession } from "./ease-args.js";
import { validCurve } from "./ease-library.js";
import type { CepEvents } from "./cep-events.js";

export const EASE_DRAFT_KEY = "motion.ease.draft.v1";
export const EASE_LOCK_KEY = "motion.ease.lock.v1";
export const EASE_SYNC_EVENT = "com.motion.plugin.ease.sync";
export const EASE_QUICK_CLOSED_EVENT = "com.motion.plugin.ease.quick-closed";
export const EASE_NAVIGATE_EVENT = "com.motion.plugin.ease.navigate";
export const EASE_LOCK_MS = 2000;
const MAX_EVENT_PAYLOAD = 60_000;

export type EaseOrigin = "panel" | "quick";
export interface EaseSharedDraft { revision: number; updatedAt: string; origin: EaseOrigin; draft: EaseDraft; session: EaseSession | null }

const MODES = ["bezier", "back", "elastic", "bounce"], DIRECTIONS = ["in", "out", "inOut"];

function validDraft(value: unknown): value is EaseDraft {
  if (!value || typeof value !== "object") return false;
  const d = value as EaseDraft;
  return MODES.includes(d.mode) && DIRECTIONS.includes(d.direction) && (d.view === "value" || d.view === "speed")
    && validCurve({ x1: d.x1, y1: d.y1, x2: d.x2, y2: d.y2 }) && Array.isArray(d.points) && d.points.length <= 16
    && typeof d.applyIn === "boolean" && typeof d.applyOut === "boolean" && !!d.back && !!d.elastic && !!d.bounce;
}

function parseShared(raw: string | null | undefined): EaseSharedDraft | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as EaseSharedDraft;
    if (!value || typeof value !== "object" || !Number.isFinite(value.revision) || !validDraft(value.draft)) return null;
    const session = validEaseSession(value.session) ? value.session : null;
    const draft = { ...cloneEaseDraft(DEFAULT_EASE), ...cloneEaseDraft(value.draft) };
    return { revision: value.revision, updatedAt: String(value.updatedAt ?? ""), origin: value.origin === "quick" ? "quick" : "panel", draft, session };
  } catch { return null; }
}

export function readSharedDraft(storage: Pick<Storage, "getItem"> | undefined): EaseSharedDraft | null {
  try { return parseShared(storage?.getItem(EASE_DRAFT_KEY)); } catch { return null; }
}

export function writeSharedDraft(storage: ProtectedStorage | undefined, value: { origin: EaseOrigin; draft: EaseDraft; session: EaseSession | null }, previousRevision: number): EaseSharedDraft | null {
  const stored = readSharedDraft(storage);
  const revision = Math.max(stored?.revision ?? 0, previousRevision) + 1;
  const next: EaseSharedDraft = { revision, updatedAt: new Date().toISOString(), origin: value.origin, draft: cloneEaseDraft(value.draft), session: value.session };
  if (!storage) return next;
  return protectedWrite(storage, EASE_DRAFT_KEY, JSON.stringify(next), raw => parseShared(raw) !== null) ? next : null;
}

export interface EaseApplyLock { acquire(owner: EaseOrigin, now?: number): boolean; release(owner: EaseOrigin): void }

/** Lease in storage: one surface writes to the host at a time. Expires on its own. */
export function createEaseApplyLock(storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> | undefined, ttlMs = EASE_LOCK_MS): EaseApplyLock {
  const read = (): { owner: EaseOrigin; until: number } | null => {
    try { const raw = storage?.getItem(EASE_LOCK_KEY); return raw ? JSON.parse(raw) as { owner: EaseOrigin; until: number } : null; } catch { return null; }
  };
  return {
    acquire(owner, now = Date.now()) {
      const current = read();
      if (current && current.owner !== owner && Number(current.until) > now) return false;
      try { storage?.setItem(EASE_LOCK_KEY, JSON.stringify({ owner, until: now + ttlMs })); } catch { /* lock is best effort */ }
      return true;
    },
    release(owner) {
      const current = read();
      if (!current || current.owner === owner) { try { storage?.removeItem(EASE_LOCK_KEY); } catch { /* ignore */ } }
    }
  };
}

export interface EaseSyncOptions {
  storage: ProtectedStorage | undefined;
  events: CepEvents;
  origin: EaseOrigin;
  onRemoteChange(shared: EaseSharedDraft): void;
}

export function createEaseSync(options: EaseSyncOptions): { publish(draft: EaseDraft, session: EaseSession | null): EaseSharedDraft | null; revision(): number; dispose(): void } {
  let lastSeen = readSharedDraft(options.storage)?.revision ?? 0;
  const stop = options.events.listen(EASE_SYNC_EVENT, event => {
    if (event.extensionId && event.extensionId === options.events.extensionId()) return;
    let shared: EaseSharedDraft | null;
    if (event.data.startsWith("{")) shared = parseShared(event.data);
    else {
      const revision = Number(event.data);
      if (!Number.isFinite(revision) || revision <= lastSeen) return;
      shared = readSharedDraft(options.storage);
    }
    if (!shared || shared.revision <= lastSeen || shared.origin === options.origin) return;
    lastSeen = shared.revision;
    options.onRemoteChange(shared);
  });
  return {
    revision: () => lastSeen,
    publish(draft, session) {
      const written = writeSharedDraft(options.storage, { origin: options.origin, draft, session }, lastSeen);
      if (!written) return null;
      lastSeen = written.revision;
      const payload = JSON.stringify(written);
      options.events.dispatch(EASE_SYNC_EVENT, payload.length <= MAX_EVENT_PAYLOAD ? payload : String(written.revision));
      return written;
    },
    dispose: stop
  };
}
