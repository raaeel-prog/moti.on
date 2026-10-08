/**
 * "Suavização rápida": the floating ease window (CEP Modeless extension).
 *
 * Same curve editor, same apply controller and the same host command as the
 * docked panel, in a ~300×360 window that sits next to the timeline. It has no
 * shell: a header with the title, the compact editor, a status line and a
 * footer with Apply, Live and a way back to the full editor.
 *
 * It follows the timeline selection while visible, with or without focus
 * (`visiblePoll`), one read at a time, never during a write.
 */
import { createLogger } from "@motion/logging";
import { createI18n, createElement, createActionButton, createPanelPreferences, browserPreferenceStorage, type I18n } from "@motion/ui-core";
import { createBrowserReducedMotionController } from "@motion/ui-motion";
import { createAeHostAdapter } from "./host-adapter.js";
import { hostFailureMessage } from "./host-feedback.js";
import { createEaseEditor } from "./ease-editor.js";
import { DEFAULT_EASE, cloneEaseDraft, easeNeedsPair, type EaseDraft } from "./ease-args.js";
import { readEaseLive, writeEaseLive } from "./ease-library.js";
import { createEaseController, type EaseApplyOutcome } from "./ease-controller.js";
import { EASE_NAVIGATE_EVENT, EASE_QUICK_CLOSED_EVENT, createEaseApplyLock, createEaseSync, readSharedDraft } from "./ease-sync.js";
import { PANEL_EXTENSION_ID, createCepEvents } from "./cep-events.js";
import { visiblePoll } from "./visible-poll.js";

const PLUGIN_VERSION = "0.2.0";
const QUICK_POLL_MS = 500;

interface QuickContext { selectionSignature?: string; isComposition: boolean; selectionSelectedKeyCount: number; hostVersion: string | null }

function storageOf(): Storage | undefined { try { return window.localStorage; } catch { return undefined; } }

export function startQuickEase(doc: Document = document): void {
  const mount = doc.getElementById("root");
  if (!mount) return;
  const storage = storageOf();
  const logger = createLogger({ pluginVersion: PLUGIN_VERSION });
  const preferences = createPanelPreferences(doc.documentElement, browserPreferenceStorage(window));
  const i18n: I18n = createI18n({});
  const motion = createBrowserReducedMotionController(doc.documentElement, window);
  const adapter = createAeHostAdapter(logger, () => { const locale = preferences.snapshot().locale; return locale === "host" ? undefined : locale; });
  const preferred = preferences.snapshot().locale;
  i18n.setLocale(preferred === "host" ? adapter?.uiLocale() : preferred);
  doc.documentElement.lang = i18n.locale();
  doc.documentElement.setAttribute("data-runtime", "cep");
  doc.documentElement.setAttribute("data-surface", "quick-ease");
  const events = createCepEvents();
  events.setWindowTitle(i18n.t("ease.quick.title"));

  const root = createElement(doc, "div", "ch-quick-ease");
  mount.appendChild(root);
  const header = createElement(doc, "header", "ch-quick-ease__header");
  header.appendChild(createElement(doc, "h1", "ch-quick-ease__title", i18n.t("ease.quick.title")));
  root.appendChild(header);
  const status = createElement(doc, "p", "ch-quick-ease__status"); status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite");

  if (!adapter) {
    status.textContent = i18n.t("ease.quick.outsideHost"); status.setAttribute("data-tone", "error");
    root.appendChild(status);
    return;
  }
  logger.setHost("after-effects");

  let context: QuickContext | null = null;
  let busy = false;
  let draft: EaseDraft = readSharedDraft(storage)?.draft ?? cloneEaseDraft(DEFAULT_EASE);
  draft.live = readEaseLive(storage);

  const disabledReason = (): string | null => {
    if (busy) return i18n.t("status.initializing");
    if (!context?.isComposition) return i18n.t("message.easeNoActiveComp");
    if (!draft.applyIn && !draft.applyOut) return i18n.t("ease.needsSide");
    if (context.selectionSelectedKeyCount < 1) return i18n.t("ease.quick.needsKeys");
    if (easeNeedsPair(draft) && context.selectionSelectedKeyCount < 2) return i18n.t("ease.quick.needsPair");
    return null;
  };
  const setStatus = (text: string, tone: "ok" | "error" | "busy" | "hint"): void => { status.textContent = text; status.setAttribute("data-tone", tone); };
  const refreshGuidance = (): void => {
    const reason = disabledReason();
    root.setAttribute("data-has-selection", String(!reason));
    if (reason) apply.setDisabled(true, reason); else apply.setDisabled(false);
    if (!busy) setStatus(reason ?? i18n.t("ease.quick.ready", { count: context?.selectionSelectedKeyCount ?? 0 }), reason ? "hint" : "ok");
  };

  const controller = createEaseController({
    origin: "quick",
    execute: async args => {
      const response = await adapter.client.execute<{ appliedCount?: number; skippedCount?: number; removedCount?: number; session?: unknown }>("ae.keys.ease.apply", args, { preserveSelection: true });
      logger.recordResponse("ae.keys.ease.apply", response);
      return response;
    },
    draft: () => draft,
    selectionSignature: () => context?.selectionSignature ?? null,
    disabledReason, busy: () => busy,
    setBusy: value => { busy = value; root.setAttribute("aria-busy", String(value)); if (value) setStatus(i18n.t("status.applyingEase"), "busy"); },
    report: outcome => report(outcome),
    lock: createEaseApplyLock(storage)
  });

  function report(outcome: EaseApplyOutcome): void {
    switch (outcome.kind) {
      case "applied": setStatus(i18n.t(outcome.quiet ? "ease.liveApplied" : "message.easeApplied", { count: outcome.appliedCount }), "ok"); sync.publish(draft, outcome.session); void readContext(); return;
      case "noChange": setStatus(i18n.t("ease.noChange"), "error"); return;
      case "stale": setStatus(i18n.t("ease.stale"), "error"); return;
      case "conflict": setStatus(outcome.response.error ? hostFailureMessage(outcome.response.error, i18n) : i18n.t("ease.sessionConflict"), "error"); return;
      case "failed": setStatus(outcome.response.error ? hostFailureMessage(outcome.response.error, i18n) : i18n.t("message.failureWithoutReason"), "error"); return;
      case "discarded": if (!outcome.quiet && outcome.reason === "selection") setStatus(i18n.t("ease.stale"), "error"); return;
    }
  }

  const editor = createEaseEditor(doc, {
    i18n, draft, busy: false, compact: true,
    platformMeta: /mac/i.test(typeof navigator === "undefined" ? "" : navigator.platform ?? ""),
    onChange: next => { draft = next; },
    onCommit: next => { draft = next; sync.publish(draft, controller.session()); refreshGuidance(); if (draft.live) controller.scheduleLive(); },
    onCancel: () => controller.cancelPending("escape"),
    onLiveToggle: live => { draft.live = live; writeEaseLive(storage, live); setStatus(i18n.t(live ? "ease.liveOn" : "ease.liveOff"), "hint"); if (!live) controller.cancelPending("live-off"); },
    onApply: () => { void controller.apply(); }
  });
  root.appendChild(editor.element);
  root.appendChild(status);

  const footer = createElement(doc, "footer", "ch-quick-ease__footer");
  const full = createActionButton(doc, { id: "quick-ease-full", label: i18n.t("ease.quick.fullEditor"), variant: "tertiary",
    onPress: () => { events.requestOpenExtension(PANEL_EXTENSION_ID); events.dispatch(EASE_NAVIGATE_EVENT, "ease"); } });
  const apply = createActionButton(doc, { id: "quick-ease-apply", label: i18n.t("ease.quick.apply"), variant: "primary", onPress: () => { void controller.apply(); } });
  footer.appendChild(full.element); footer.appendChild(apply.element);
  root.appendChild(footer);

  const sync = createEaseSync({
    storage, events, origin: "quick",
    onRemoteChange: remote => { draft = { ...remote.draft, live: draft.live }; controller.setSession(remote.session); editor.setDraft(draft); refreshGuidance(); }
  });
  const shared = readSharedDraft(storage);
  if (shared) controller.setSession(shared.session);

  let reading = false;
  async function readContext(): Promise<void> {
    if (reading || busy || doc.querySelector(".ch-curve[data-dragging]")) return;
    reading = true;
    try {
      const response = await adapter!.client.execute<QuickContext>("ae.context.read");
      logger.recordResponse("ae.context.read", response);
      if (response.ok && response.data) {
        context = response.data;
        logger.setHost("after-effects", response.data.hostVersion ?? undefined);
        controller.onSelectionSignature(response.data.selectionSignature ?? null);
        if (!busy) refreshGuidance();
      }
    } catch { /* next tick */ } finally { reading = false; }
  }
  const polling = visiblePoll(doc, readContext, QUICK_POLL_MS, () => !busy);
  refreshGuidance();

  window.addEventListener("unload", () => {
    controller.cancelPending("close");
    events.dispatch(EASE_QUICK_CLOSED_EVENT, context?.selectionSignature ?? "");
    polling.dispose(); sync.dispose(); editor.dispose(); controller.dispose(); motion.dispose();
  });
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => startQuickEase());
  else startQuickEase();
}
