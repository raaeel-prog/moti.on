/** Apresentação de resultados reais, sem conhecer comandos ou adapters Adobe. */
import {
  createToastRegion,
  type ComponentScheduler,
  type ToastAction,
  type ToastHandle,
  type ToastRegionController,
  type ToastRegionLabels
} from "./components.js";

export interface FeedbackLabels {
  region: string;
  dismiss: string;
  queued(count: number): string;
  success: string;
  error: string;
  warning: string;
  info: string;
}

export interface FeedbackOptions {
  id?: string;
  labels(): FeedbackLabels;
  scheduler?: ComponentScheduler;
  maxVisible?: number;
}

export interface FeedbackReportOptions {
  key?: string;
  detail?: string;
  actions?: readonly ToastAction[];
}

export interface FeedbackStatus {
  message: string;
  state: "busy" | "ok" | "error";
}

export interface FeedbackController {
  readonly element: HTMLElement;
  readonly region: ToastRegionController;
  onStatus(status: FeedbackStatus): void;
  reportError(message: string, options?: FeedbackReportOptions): ToastHandle;
  reportWarning(message: string, options?: FeedbackReportOptions): ToastHandle;
  reportInfo(message: string, options?: FeedbackReportOptions): ToastHandle;
  refreshLabels(): void;
  clear(): void;
  dispose(): void;
}

export function createFeedbackController(doc: Document, options: FeedbackOptions): FeedbackController {
  function regionLabels(): ToastRegionLabels {
    const labels = options.labels();
    return {
      label: labels.region,
      dismissLabel: labels.dismiss,
      queuedLabel: labels.queued,
      stateLabels: { success: labels.success, warning: labels.warning, error: labels.error }
    };
  }
  const region = createToastRegion(doc, {
    id: options.id ?? "motion-feedback",
    ...regionLabels(),
    ...(options.scheduler ? { scheduler: options.scheduler } : {}),
    ...(options.maxVisible !== undefined ? { maxVisible: options.maxVisible } : {})
  });
  let running = false;
  let disposed = false;

  function report(
    state: "error" | "warning" | "default",
    message: string,
    reportOptions: FeedbackReportOptions = {}
  ): ToastHandle {
    const labels = options.labels();
    const stateLabel = state === "default" ? labels.info : labels[state];
    return region.push({
      message,
      state,
      stateLabel,
      tone: state === "error" ? "destructive" : state === "default" ? "info" : state,
      recoverable: state === "error",
      dedupKey: `${state}:${reportOptions.key ?? message}`,
      ...(reportOptions.detail !== undefined ? { detail: reportOptions.detail } : {}),
      ...(reportOptions.actions ? { actions: reportOptions.actions } : {})
    });
  }

  return {
    element: region.element,
    region,
    onStatus(status) {
      if (disposed) return;
      if (status.state === "busy") {
        running = true;
        return;
      }
      const wasRunning = running;
      running = false;
      // Um status de inicialização/contexto não é resultado de uma operação.
      // Em falha, reportError recebe a mensagem concreta do resultado tipado.
      if (wasRunning && status.state === "ok" && status.message.trim()) {
        region.push({
          message: status.message,
          state: "success",
          stateLabel: options.labels().success,
          dedupKey: `success:${status.message}`,
          durationMs: 3000
        });
      }
    },
    reportError(message, reportOptions) {
      running = false;
      return report("error", message, reportOptions);
    },
    reportWarning(message, reportOptions) {
      running = false;
      return report("warning", message, reportOptions);
    },
    reportInfo(message, reportOptions) { return report("default", message, reportOptions); },
    refreshLabels() { if (!disposed) region.updateLabels(regionLabels()); },
    clear() {
      running = false;
      region.clear();
    },
    dispose() {
      disposed = true;
      running = false;
      region.dispose();
    }
  };
}
