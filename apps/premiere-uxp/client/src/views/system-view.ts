import { parseHostVersion } from "@motion/capability-matrix";
import type { HostCapabilities } from "@motion/contracts";
import {
  createElement,
  createPanelActionBar,
  notice,
  propertyRow,
  sectionTitle,
  type I18n,
  type RowTone
} from "@motion/ui-core";
import type { PremiereMessages } from "../messages.js";

export interface PremiereSystemViewOptions {
  readonly i18n: I18n;
  readonly messages: PremiereMessages;
  readonly capabilities: HostCapabilities | null;
  readonly selfTest: {
    checks: Array<{ name: string; ok: boolean; detailKey: string | null }>;
    passed: number;
    total: number;
  } | null;
  readonly busyReason?: string | undefined;
  readonly canPress?: (() => boolean) | undefined;
  onRunCheck(): void;
  onSelfTest(): void;
}

export interface PremiereSystemView {
  readonly content: HTMLElement;
  readonly actions: HTMLElement;
  dispose(): void;
}

/** Presents capability and self-test snapshots without issuing host requests. */
export function createPremiereSystemView(
  doc: Document,
  options: PremiereSystemViewOptions
): PremiereSystemView {
  const { i18n, messages, capabilities, selfTest } = options;
  const content = createElement(doc, "div", "ch-system-view");

  if (capabilities) {
    const versionKnown = parseHostVersion(capabilities.hostVersion) !== null;
    content.appendChild(
      propertyRow(
        doc,
        i18n.t("capability.supportTier"),
        versionKnown
          ? i18n.t(`capability.tier.premiere.${capabilities.supportTier}` as Parameters<I18n["t"]>[0])
          : i18n.t("capability.state.unknown"),
        versionKnown ? undefined : "unknown"
      )
    );

    for (const [key, finding] of Object.entries(capabilities.findings)) {
      if (!finding) continue;

      const tone: RowTone =
        finding.state === "available" ? "ok" : finding.state === "unknown" ? "unknown" : "off";
      const value =
        finding.state === "available"
          ? i18n.t("capability.state.available")
          : `${i18n.t(`capability.state.${finding.state}` as Parameters<I18n["t"]>[0])} — ${
              finding.reasonKey ? i18n.t(finding.reasonKey as Parameters<I18n["t"]>[0]) : ""
            }`.trim();

      content.appendChild(
        propertyRow(doc, i18n.t(`capability.key.${key}` as Parameters<I18n["t"]>[0]), value, tone)
      );
    }
  }

  if (selfTest) {
    content.appendChild(sectionTitle(doc, i18n.t("action.runSelfTest")));
    for (const check of selfTest.checks) {
      const nameKey = `selfTest.name.${check.name}`;
      const checkName = messages.has(nameKey) ? messages.t(nameKey) : check.name;
      const detail =
        check.detailKey && messages.has(check.detailKey)
          ? messages.t(check.detailKey)
          : check.detailKey;

      content.appendChild(
        propertyRow(
          doc,
          checkName,
          check.ok
            ? i18n.t("capability.state.available")
            : `${i18n.t("capability.state.unavailable")}${detail ? ` — ${detail}` : ""}`,
          check.ok ? "ok" : "off"
        )
      );
    }
  }

  if (!capabilities && !selfTest) {
    content.appendChild(notice(doc, messages.t("message.systemCheckNotRun")));
  }

  const busy = options.busyReason
    ? { disabled: true, disabledReason: options.busyReason }
    : { disabled: false };
  const bar = createPanelActionBar(doc, {
    canPress: options.canPress,
    actions: [
      {
        id: "system-check",
        label: i18n.t("action.runSystemCheck"),
        variant: "primary",
        ...busy,
        onPress: options.onRunCheck
      },
      {
        id: "system-self-test",
        label: i18n.t("action.runSelfTest"),
        ...busy,
        onPress: options.onSelfTest
      }
    ]
  });

  return { content, actions: bar.element, dispose: () => bar.dispose() };
}
