import { aeMotionMs } from "./catalog.js";
import type { MotionEnv, TimeoutHandle } from "./env.js";

/**
 * Height glide, generalised from quick-dock.ts `setOpen` (the approved dock motion).
 * The CSS transition lives on `[data-motion~="height-glide"]` in ae-motion.css; this
 * measures the rendered height, pins it, reflows and sets the target, so a reversal
 * mid-flight starts from where the element is. Open settles to `height: auto`.
 */
export interface HeightGlideOptions {
  open?: boolean;
  /** Hide the body once closed so its controls leave the tab order and a11y tree. */
  hideWhenClosed?: boolean;
  onSettled?(open: boolean): void;
}
export interface HeightGlide {
  set(open: boolean): void;
  readonly open: boolean;
  dispose(): void;
}

function renderedHeight(node: HTMLElement): number {
  if (node.hidden) return 0;
  return node.getBoundingClientRect?.().height ?? node.offsetHeight ?? 0;
}

export function createHeightGlide(env: MotionEnv, body: HTMLElement, options: HeightGlideOptions = {}): HeightGlide {
  const hide = options.hideWhenClosed !== false;
  let open = options.open ?? !body.hidden;
  let timer: TimeoutHandle | undefined;
  body.setAttribute("data-open", String(open));
  if (!open) { body.style?.setProperty?.("height", "0px"); if (hide) body.hidden = true; }

  function finish(): void {
    timer = undefined;
    if (open) body.style?.removeProperty?.("height");
    else if (hide) body.hidden = true;
    options.onSettled?.(open);
  }

  return {
    set(next) {
      if (next === open) return;
      if (timer !== undefined) { env.clearTimeout(timer); timer = undefined; }
      const from = renderedHeight(body);
      body.hidden = false;
      open = next;
      if (env.reduced()) {
        body.setAttribute("data-open", String(open));
        body.style?.setProperty?.("height", open ? "" : "0px");
        finish();
        return;
      }
      body.style?.setProperty?.("height", `${from}px`);
      void body.offsetHeight;
      body.setAttribute("data-open", String(open));
      const to = open ? Math.max(body.scrollHeight || 0, 0) : 0;
      body.style?.setProperty?.("height", `${to}px`);
      timer = env.timeout(finish, aeMotionMs("height-glide"));
    },
    get open() { return open; },
    dispose() { if (timer !== undefined) env.clearTimeout(timer); timer = undefined; }
  };
}
