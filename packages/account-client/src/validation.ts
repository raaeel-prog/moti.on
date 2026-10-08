import { isMotionLibraryOptions, isGradientSettings, MOTION_LIBRARY_PRESETS } from "@motion/contracts";
import type { AccountConfig, AccountUser, LeaseClaims, SignedLease, SyncKind, SyncRecord } from "./types.js";
export const MAX_LEASE_MS = 7 * 24 * 60 * 60 * 1000;
export function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
export function identifier(value: unknown): value is string { return typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/.test(value); }
const names = (value: unknown): value is string => typeof value === "string" && value.trim() === value && value.length > 0 && value.length <= 80 && ![...value].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
const recipes = new Set(MOTION_LIBRARY_PRESETS.map(item => item.id));
export function validConfig(config: AccountConfig | undefined): config is AccountConfig {
  return !!config && /^https:\/\/[a-z0-9][a-z0-9.-]+(?::443)?$/i.test(config.url) && !config.url.includes("..")
    && typeof config.publishableKey === "string" && config.publishableKey.length >= 16 && config.publishableKey.length <= 4096
    && !config.publishableKey.startsWith("sb_secret_") && config.leasePublicKey.length >= 32 && config.leasePublicKey.length < 4096;
}
export function validUser(value: unknown): value is AccountUser {
  return object(value) && identifier(value["id"]) && typeof value["email"] === "string" && value["email"].length <= 320 && typeof value["name"] === "string" && value["name"].length <= 200;
}
export function signedLease(value: unknown): value is SignedLease { return object(value) && typeof value["payload"] === "string" && value["payload"].length <= 2048 && typeof value["signature"] === "string" && /^[a-zA-Z0-9_-]{86}$/.test(value["signature"]); }
export function leaseClaims(value: unknown): value is LeaseClaims {
  return object(value) && value["version"] === 1 && value["audience"] === "motion-plugin" && identifier(value["accountId"]) && identifier(value["deviceId"]) && identifier(value["licenseId"])
    && typeof value["issuedAt"] === "number" && Number.isSafeInteger(value["issuedAt"]) && typeof value["expiresAt"] === "number" && Number.isSafeInteger(value["expiresAt"])
    && value["expiresAt"] > value["issuedAt"] && value["expiresAt"] - value["issuedAt"] <= MAX_LEASE_MS;
}
const choices: Record<string, readonly unknown[]> = { theme: ["dark", "light"], locale: ["host", "pt-BR", "en-US"], density: ["default", "compact"], presetAutoplay: [true, false], quickDockPinned: [true, false], reduceMotion: [true, false] };
export function validSyncValue(kind: SyncKind, id: string, value: unknown, deleted = false): boolean {
  if (!identifier(id) || !["preferences", "favorites", "variants", "gradients"].includes(kind)) return false;
  if (deleted) return value === null;
  if (kind === "preferences") return id === "presetSize" ? typeof value === "number" && Number.isFinite(value) && value >= 140 && value <= 320 : choices[id]?.includes(value) === true;
  if (kind === "favorites") return value === true;
  if (!object(value) || Object.keys(value).sort().join(",") !== (kind === "variants" ? "id,name,options,presetId" : "id,name,settings") || value["id"] !== id || !names(value["name"])) return false;
  if (kind === "variants") return /^variant-[a-z0-9-]{1,110}$/.test(id) && typeof value["presetId"] === "string" && recipes.has(value["presetId"]) && isMotionLibraryOptions(value["options"]);
  return /^custom-[a-zA-Z0-9._-]{1,110}$/.test(id) && isGradientSettings(value["settings"]);
}
export function validRecord(value: unknown): value is SyncRecord { return object(value) && typeof value["kind"] === "string" && typeof value["id"] === "string" && typeof value["deleted"] === "boolean" && Number.isSafeInteger(value["revision"]) && (value["revision"] as number) >= 0 && validSyncValue(value["kind"] as SyncKind, value["id"], value["value"], value["deleted"]); }
export function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
