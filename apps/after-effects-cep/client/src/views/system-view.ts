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

export interface AeSystemViewOptions {
  readonly i18n: I18n;
  readonly capabilities: HostCapabilities | null;
  readonly hasError: boolean;
  readonly busyReason?: string | undefined;
  readonly canPress?: (() => boolean) | undefined;
  onRunCheck(): void;
  onVerifyBridge(): void;
}

export interface AeSystemView {
  readonly content: HTMLElement;
  readonly actions: HTMLElement;
  dispose(): void;
}

/** Presents the current capability snapshot; the caller owns bridge requests. */
export function createAeSystemView(doc: Document, options: AeSystemViewOptions): AeSystemView {
  const { i18n, capabilities } = options;
  const content = createElement(doc, "div", "ch-system-view");

  if (capabilities) {
    content.appendChild(
      propertyRow(
        doc,
        i18n.t("capability.supportTier"),
        i18n.t(`capability.tier.afterEffects.${capabilities.supportTier}` as Parameters<I18n["t"]>[0])
      )
    );
    content.appendChild(sectionTitle(doc, i18n.t("view.system.title")));

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
  } else if (!options.hasError) {
    content.appendChild(notice(doc, i18n.t("message.systemCheckIdle")));
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
        id: "system-bridge",
        label: i18n.t("action.verifyBridge"),
        ...busy,
        onPress: options.onVerifyBridge
      }
    ]
  });

  return { content, actions: bar.element, dispose: () => bar.dispose() };
}
