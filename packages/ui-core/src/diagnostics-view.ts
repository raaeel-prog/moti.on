import type { I18n } from "./i18n.js";
import { createPanelActionBar } from "./panel-action-bar.js";
import { createElement, logLine, notice, sectionTitle } from "./shell.js";

/** Display-only log data; storage, redaction and export belong to the caller. */
export interface DiagnosticEntry {
  readonly timestamp: string;
  readonly level: "debug" | "info" | "warn" | "error";
  readonly message?: string;
  readonly command: string | null;
  readonly durationMs: number | null;
  readonly errorCode: string | null;
}

export interface DiagnosticsViewOptions {
  readonly i18n: I18n;
  readonly entries: readonly DiagnosticEntry[];
  readonly droppedEntries: number;
  readonly debugMode: boolean;
  readonly busyReason?: string | undefined;
  readonly exportUnavailableReason?: string | undefined;
  readonly exportUnavailableNotice?: string | undefined;
  readonly canPress?: (() => boolean) | undefined;
  onExport(): void;
  onClear(): void;
  onToggleDebug(): void;
}

export interface DiagnosticsView {
  readonly content: HTMLElement;
  readonly actions: HTMLElement;
  dispose(): void;
}

/** Shared session diagnostics for CEP and UXP, without host side effects. */
export function createDiagnosticsView(doc: Document, options: DiagnosticsViewOptions): DiagnosticsView {
  const { i18n, entries } = options;
  const content = createElement(doc, "div", "ch-diagnostics-view");
  content.appendChild(notice(doc, i18n.t("logs.redactionNotice")));
  if (options.exportUnavailableNotice !== undefined) {
    content.appendChild(notice(doc, options.exportUnavailableNotice, "warning"));
  }
  content.appendChild(sectionTitle(doc, i18n.t("logs.summary", {
    count: entries.length,
    dropped: options.droppedEntries
  })));

  if (entries.length === 0) {
    content.appendChild(notice(doc, i18n.t("logs.empty")));
  } else {
    // Keep the logger's chronological snapshot intact, displaying newest first.
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const entry = entries[index];
      if (!entry) continue;
      const parts = [
        entry.timestamp.slice(11, 19),
        entry.level.toUpperCase(),
        entry.message ?? entry.command ?? "-"
      ];
      if (entry.durationMs !== null) parts.push(`${entry.durationMs} ms`);
      if (entry.errorCode) parts.push(entry.errorCode);
      const level = entry.level === "warn" || entry.level === "error" ? entry.level : undefined;
      content.appendChild(logLine(doc, parts.join("  "), level));
    }
  }

  const busy = options.busyReason === undefined
    ? {}
    : { disabled: true, disabledReason: options.busyReason };
  const exportReason = options.busyReason ?? options.exportUnavailableReason;
  const exportDisabled = exportReason === undefined
    ? {}
    : { disabled: true, disabledReason: exportReason };
  const bar = createPanelActionBar(doc, {
    canPress: options.canPress,
    actions: [
      {
        id: "diagnostics-export",
        label: i18n.t("action.exportBundle"),
        variant: "primary",
        ...exportDisabled,
        onPress: options.onExport
      },
      {
        id: "diagnostics-clear",
        label: i18n.t("action.clearLogs"),
        ...busy,
        onPress: options.onClear
      },
      {
        id: "diagnostics-debug",
        label: i18n.t(options.debugMode ? "action.disableDebug" : "action.enableDebug"),
        ...busy,
        onPress: options.onToggleDebug
      }
    ]
  });

  return { content, actions: bar.element, dispose: () => bar.dispose() };
}
