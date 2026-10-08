import type { AccountStorage, SyncKind, SyncOperation, SyncRecord, SyncSnapshot } from "./types.js";
import { clone, identifier, object, validRecord, validSyncValue } from "./validation.js";
interface LocalState { version: 1; accountId: string; imported: boolean; records: SyncRecord[]; queue: SyncOperation[]; conflicts: number }
const key = (record: Pick<SyncRecord, "kind" | "id">): string => `${record.kind}:${record.id}`;
export function createSyncController(storage: AccountStorage, randomId: () => string) {
  let state: LocalState | null = null;
  let status: SyncSnapshot["status"] = "idle";
  let chain: Promise<unknown> = Promise.resolve();
  function exclusive<T>(fn: () => Promise<T>): Promise<T> { const next = chain.then(fn, fn); chain = next.catch(() => undefined); return next; }
  const write = async (next: LocalState): Promise<void> => { const raw = JSON.stringify(next); if (raw.length > 2_000_000) throw new Error("SYNC_LIMIT"); await storage.write(next.accountId, raw); state = next; };
  function required(): LocalState { if (!state) throw new Error("SIGN_IN_REQUIRED"); return state; }
  function visible(current: LocalState): SyncRecord[] {
    const entries = new Map(current.records.map(record => [key(record), clone(record)]));
    for (const op of current.queue) entries.set(key(op), { kind: op.kind, id: op.id, value: clone(op.value), deleted: op.deleted, revision: op.baseRevision });
    return [...entries.values()];
  }
  async function load(accountId: string | null): Promise<void> {
    return exclusive(async () => {
      state = null; status = "idle";
      if (!accountId) return;
      const raw = await storage.read(accountId);
      if (!raw) { state = { version: 1, accountId, imported: false, records: [], queue: [], conflicts: 0 }; return; }
      try {
        if (raw.length > 2_000_000) throw new Error("size");
        const parsed: unknown = JSON.parse(raw);
        if (!object(parsed) || parsed["version"] !== 1 || parsed["accountId"] !== accountId || typeof parsed["imported"] !== "boolean" || !Array.isArray(parsed["records"]) || parsed["records"].length > 2000 || !parsed["records"].every(validRecord) || !Array.isArray(parsed["queue"]) || parsed["queue"].length > 1000 || !Number.isSafeInteger(parsed["conflicts"]) || (parsed["conflicts"] as number) < 0) throw new Error("schema");
        const ids = new Set<string>();
        for (const op of parsed["queue"]) {
          if (!object(op) || !identifier(op["mutationId"]) || ids.has(op["mutationId"]) || !validRecord({ ...op, revision: op["baseRevision"] })) throw new Error("queue");
          ids.add(op["mutationId"]);
        }
        state = parsed as unknown as LocalState;
      } catch { status = "error"; throw new Error("SYNC_STORAGE_INVALID"); }
    });
  }
  function enqueue(kind: SyncKind, id: string, value: unknown, deleted = false): Promise<void> {
    return exclusive(async () => {
      if (!validSyncValue(kind, id, value, deleted)) throw new Error("SYNC_INVALID");
      const current = required(), next = clone(current);
      if (next.queue.length >= 1000) throw new Error("SYNC_LIMIT");
      const previous = next.queue.filter(op => op.kind === kind && op.id === id).at(-1);
      const record = next.records.find(item => item.kind === kind && item.id === id);
      // Retain every outstanding mutation until acknowledged. Later edits depend on the prior revision.
      const baseRevision = previous ? previous.baseRevision + 1 : record?.revision ?? 0;
      next.queue.push({ kind, id, value: clone(value), deleted, baseRevision, mutationId: randomId() });
      await write(next);
    });
  }
  function importLocal(records: Array<Pick<SyncRecord, "kind" | "id" | "value">>): Promise<void> {
    return exclusive(async () => {
      const current = required(); if (current.imported) return;
      const next = clone(current), known = new Map(visible(next).map(record => [key(record), record]));
      for (const record of records) {
        if (!validSyncValue(record.kind, record.id, record.value)) throw new Error("SYNC_INVALID");
        const existing = known.get(key(record));
        if (existing && !existing.deleted && JSON.stringify(existing.value) === JSON.stringify(record.value)) continue;
        if (existing && record.kind === "preferences") continue;
        let item = clone(record);
        if (existing && ["variants", "gradients"].includes(record.kind)) {
          const id = `${record.id.slice(0, 64)}-copy-${randomId()}`;
          item = { ...item, id, value: { ...(item.value as Record<string, unknown>), id, name: `${String((item.value as Record<string, unknown>)["name"]).slice(0,  60)} (local)` } };
        }
        next.queue.push({ ...item, deleted: false, mutationId: randomId(), baseRevision: existing && item.id === record.id ? existing.revision : 0 });
        known.set(key(item), { ...item, revision: 0, deleted: false });
      }
      if (next.queue.length > 1000) throw new Error("SYNC_LIMIT");
      next.imported = true; await write(next);
    });
  }
  function sync(send: (accountId: string, operations: SyncOperation[]) => Promise<unknown>): Promise<SyncRecord[]> {
    return exclusive(async () => {
      const current = required(); status = "syncing";
      try {
        let next = clone(current);
        do {
          const batch = next.queue.slice(0, 100), body = await send(next.accountId, clone(batch));
          if (!object(body) || body["accountId"] !== next.accountId || !Array.isArray(body["records"]) || body["records"].length > 2000 || !body["records"].every(validRecord) || !Array.isArray(body["acknowledged"]) || !batch.every(op => (body["acknowledged"] as unknown[]).includes(op.mutationId)) || !Number.isSafeInteger(body["conflicts"]) || (body["conflicts"] as number) < 0) throw new Error("SYNC_RESPONSE_INVALID");
          next = { ...next, records: clone(body["records"] as SyncRecord[]), queue: next.queue.slice(batch.length), conflicts: next.conflicts + (body["conflicts"] as number) };
          // Durable ack before the next batch. Network failure can replay only idempotent operations.
          await write(next);
        } while (next.queue.length > 0);
        status = "idle"; return visible(next);
      } catch (error) { status = "error"; throw error; }
    });
  }
  return { load, enqueue, importLocal, sync, snapshot: (): SyncSnapshot => ({ status, pending: state?.queue.length ?? 0, conflicts: state?.conflicts ?? 0, records: state ? visible(state) : [] }) };
}

