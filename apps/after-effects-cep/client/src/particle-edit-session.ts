import { cloneParticleArgs, isParticleArgs, type ParticleArgs, type ParticleSettings } from "@motion/contracts";

export interface ParticleReadData { rigId: string | null; compId: number; settings: ParticleSettings | null }
const copy = (settings: ParticleSettings): ParticleSettings => cloneParticleArgs(settings.mode, settings);
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
export function particleChanges(base: ParticleSettings, draft: ParticleSettings): string[] {
  const fields = ["mode", "birthRate", "longevity", "velocity", "size", "opacity", "color", "movement", "seed", "direction", "spread"] as const;
  const changes: string[] = fields.filter(key => !same(base[key], draft[key]));
  for (let i = 0; i < 4; i++) for (const key of ["amount", "size", "opacity", "color", "movement"] as const) if (!same(base.streams[i]![key], draft.streams[i]![key])) changes.push(`streams.${i}.${key}`);
  return changes;
}
export function isParticleReadData(value: unknown): value is ParticleReadData {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<ParticleReadData>;
  return Number.isSafeInteger(data.compId) && (data.rigId === null && data.settings === null || typeof data.rigId === "string" && !!data.settings && typeof data.settings.mode === "string" && Array.isArray(data.settings.streams) && Array.isArray(data.settings.color) && ["birthRate", "longevity", "velocity", "size", "opacity", "movement", "seed"].every(key => typeof (data.settings as unknown as Record<string, unknown>)[key] === "number") && isParticleArgs(data.settings));
}
/** Owns drafts by composition and rig. Host refreshes never replace uncommitted fields. */
export class ParticleEditSession {
  private drafts = new Map<string, { baseline: ParticleSettings; draft: ParticleSettings }>();
  private key = "new";
  private target: { rigId: string; compId: number } | null = null;
  constructor(initial: ParticleSettings = cloneParticleArgs()) { this.drafts.set("new", { baseline: copy(initial), draft: copy(initial) }); }
  get settings(): ParticleSettings { return copy(this.drafts.get(this.key)!.draft); }
  edit(settings: ParticleSettings): void { this.drafts.get(this.key)!.draft = copy(settings); }
  reset(settings: ParticleSettings): void { this.edit(settings); }
  hydrate(data: ParticleReadData): ParticleSettings {
    this.key = data.rigId ? `${data.compId}:${data.rigId}` : `new:${data.compId}`;
    this.target = data.rigId ? { rigId: data.rigId, compId: data.compId } : null;
    let entry = this.drafts.get(this.key);
    if (!entry) { const settings = data.settings ?? this.drafts.get("new")!.draft; entry = { baseline: copy(settings), draft: copy(settings) }; this.drafts.set(this.key, entry); }
    if (data.settings) {
      const changes = particleChanges(entry.baseline, entry.draft), next = copy(data.settings);
      if (changes.includes("mode")) { entry.baseline = copy(data.settings); return copy(entry.draft); }
      for (const key of changes) {
        if (key.startsWith("streams.")) { const [, index, field] = key.split(".") as [string, string, keyof ParticleSettings["streams"][number]]; Object.assign(next.streams[Number(index)]!, { [field]: entry.draft.streams[Number(index)]![field] }); }
        else Object.assign(next, { [key]: entry.draft[key as keyof ParticleSettings] });
      }
      entry.baseline = copy(data.settings); entry.draft = next;
    }
    return copy(entry.draft);
  }
  args(): ParticleArgs {
    const entry = this.drafts.get(this.key)!, settings = copy(entry.draft);
    if (!this.target || settings.mode === "classic") return settings;
    return { ...settings, changedFields: particleChanges(entry.baseline, settings), targetRigId: this.target.rigId, targetCompId: this.target.compId };
  }
  applied(): void { const entry = this.drafts.get(this.key)!; entry.baseline = copy(entry.draft); }
}
