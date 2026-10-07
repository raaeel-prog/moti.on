import { createActionButton, type ActionButtonOptions } from "./components.js";
import { element } from "./component-dom.js";

export interface PanelActionBarOptions {
  readonly actions: readonly ActionButtonOptions[];
  /** Revalidates current app state, including events from a previous render. */
  readonly canPress?: (() => boolean) | undefined;
}

export interface PanelActionBar {
  readonly element: HTMLElement;
  dispose(): void;
}

/** A presentation-only action group; command execution remains with the caller. */
export function createPanelActionBar(doc: Document, options: PanelActionBarOptions): PanelActionBar {
  const root = element(doc, "div", "ch-panel-action-bar");
  let disposed = false;
  for (const action of options.actions) {
    const control = createActionButton(doc, {
      ...action,
      onPress() {
        if (!disposed && (options.canPress?.() ?? true)) action.onPress();
      }
    });
    if (action.variant === "primary") control.element.className += " ch-panel-action-bar__primary";
    control.button.setAttribute("data-motion", "button-press");
    root.appendChild(control.element);
  }
  return {
    element: root,
    dispose() { disposed = true; }
  };
}
