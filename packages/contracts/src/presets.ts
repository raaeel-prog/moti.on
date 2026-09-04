import type { HostId } from "./protocol.js";
import type { LiveControlBinding, QuickLocalizedText } from "./quick-profile.js";

export const PRESET_SCHEMA_VERSION = 2 as const;

export type PresetJsonPrimitive = null | boolean | number | string;
export type PresetJsonValue =
  | PresetJsonPrimitive
  | PresetJsonValue[]
  | { [key: string]: PresetJsonValue };

/**
 * O §23 ainda não fecha a forma de cada controle de UI. Mantemos essa parte
 * extensível, mas estritamente JSON; execução continua restrita ao operationPlan
 * declarativo validado pelo consumidor.
 */
export type PresetControl = Record<string, PresetJsonValue>;

interface PresetDefinitionBase {
  id: string;
  version: string;
  displayName: Record<string, string>;
  category: string;
  hosts: HostId[];
  minHostVersion?: Partial<Record<HostId, string>>;
  requirements: string[];
  controls: PresetControl[];
  operationPlan: PresetJsonValue;
  checksum: string;
  signature?: string;
}

export interface PresetPreviewV1 {
  thumbnail: string;
  video?: string;
}

export interface PresetDefinitionV1 extends PresetDefinitionBase {
  schemaVersion: 1;
  preview?: PresetPreviewV1;
}

export interface PresetQuickDefinition {
  isDefault: boolean;
  liveControls: LiveControlBinding[];
  budgetMs: number;
  oneLine: QuickLocalizedText;
  needs: QuickLocalizedText;
  creates: QuickLocalizedText;
}

export interface PresetPreviewV2 {
  poster: string;
  loop: string;
  fixtureId: string;
  renderedAt: string;
  checksum: string;
}

export interface PresetDefinition extends PresetDefinitionBase {
  schemaVersion: typeof PRESET_SCHEMA_VERSION;
  quick?: PresetQuickDefinition;
  preview: PresetPreviewV2;
}

export type PresetDefinitionV2 = PresetDefinition;

export interface PresetV2MigrationPreview {
  /** Fallbacks usados somente quando o preview v1 não possui o asset equivalente. */
  poster?: string;
  loop?: string;
  fixtureId: string;
  renderedAt: string;
  checksum: string;
}

export interface PresetV2MigrationOptions {
  preview: PresetV2MigrationPreview;
  quick?: PresetQuickDefinition;
  /** Checksum recalculado sobre a representação canônica v2. */
  checksum: string;
  /** Assinatura recalculada para v2; a assinatura v1 nunca é reaproveitada. */
  signature?: string;
}

export interface PresetV1DowngradeOptions {
  checksum: string;
  signature?: string;
  includePreview?: boolean;
}

export type PresetSignatureVerifier = (preset: Readonly<PresetDefinition>) => boolean;
