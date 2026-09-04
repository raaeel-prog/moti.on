export const REDUCED_MOTION_STORAGE_KEY = "motion.ui.reduceMotion.v1";
export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

export interface MotionAttributeRoot {
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
}

export interface MotionPreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface MotionMediaQueryEvent {
  readonly matches: boolean;
}

export type MotionMediaQueryListener = (event: MotionMediaQueryEvent) => void;

export interface MotionMediaQuery {
  readonly matches: boolean;
  addEventListener?(type: "change", listener: MotionMediaQueryListener): void;
  removeEventListener?(type: "change", listener: MotionMediaQueryListener): void;
  addListener?(listener: MotionMediaQueryListener): void;
  removeListener?(listener: MotionMediaQueryListener): void;
}

export interface MotionBrowserEnvironment {
  readonly localStorage?: MotionPreferenceStorage;
  matchMedia?(query: string): MotionMediaQuery;
}

export interface ReducedMotionSnapshot {
  readonly internal: boolean;
  readonly system: boolean;
  readonly effective: boolean;
  readonly storage: "available" | "unavailable";
}

export interface ReducedMotionController {
  snapshot(): ReducedMotionSnapshot;
  setInternal(reduced: boolean): void;
  dispose(): void;
}

export interface ReducedMotionControllerOptions {
  readonly root: MotionAttributeRoot;
  readonly storage?: MotionPreferenceStorage;
  readonly mediaQuery?: MotionMediaQuery;
  readonly onChange?: (snapshot: ReducedMotionSnapshot) => void;
}

function frozenSnapshot(
  internal: boolean,
  system: boolean,
  storage: "available" | "unavailable"
): ReducedMotionSnapshot {
  return Object.freeze({ internal, system, effective: internal || system, storage });
}

export function createReducedMotionController(
  options: ReducedMotionControllerOptions
): ReducedMotionController {
  let storageState: "available" | "unavailable" = options.storage ? "available" : "unavailable";
  let internal = false;
  let system = options.mediaQuery?.matches === true;
  let disposed = false;

  if (options.storage) {
    try {
      internal = options.storage.getItem(REDUCED_MOTION_STORAGE_KEY) === "1";
    } catch {
      storageState = "unavailable";
    }
  }

  const snapshot = (): ReducedMotionSnapshot => frozenSnapshot(internal, system, storageState);

  const apply = (notify: boolean): void => {
    const current = snapshot();
    if (current.effective) {
      options.root.setAttribute("data-reduced-motion", "true");
    } else {
      options.root.removeAttribute("data-reduced-motion");
    }
    if (notify) {
      options.onChange?.(current);
    }
  };

  const onSystemChange: MotionMediaQueryListener = (event) => {
    const next = event.matches === true;
    if (next === system) return;
    system = next;
    apply(true);
  };

  if (options.mediaQuery?.addEventListener) {
    options.mediaQuery.addEventListener("change", onSystemChange);
  } else {
    options.mediaQuery?.addListener?.(onSystemChange);
  }

  apply(true);

  return Object.freeze({
    snapshot,

    setInternal(reduced: boolean): void {
      internal = reduced === true;
      if (options.storage && storageState === "available") {
        try {
          options.storage.setItem(REDUCED_MOTION_STORAGE_KEY, internal ? "1" : "0");
        } catch {
          storageState = "unavailable";
        }
      }
      apply(true);
    },

    dispose(): void {
      if (disposed) return;
      disposed = true;
      if (options.mediaQuery?.removeEventListener) {
        options.mediaQuery.removeEventListener("change", onSystemChange);
      } else {
        options.mediaQuery?.removeListener?.(onSystemChange);
      }
    }
  });
}

/**
 * Adapter defensivo para CEP/UXP. Getters de globals podem lançar durante o
 * bootstrap do host, então ausência de storage/media nunca impede o painel.
 */
export function createBrowserReducedMotionController(
  root: MotionAttributeRoot,
  environment: unknown,
  onChange?: (snapshot: ReducedMotionSnapshot) => void
): ReducedMotionController {
  let storage: MotionPreferenceStorage | undefined;
  let mediaQuery: MotionMediaQuery | undefined;
  const browser = environment as MotionBrowserEnvironment;

  try {
    const candidate = browser.localStorage;
    if (candidate && typeof candidate.getItem === "function" && typeof candidate.setItem === "function") {
      storage = candidate;
    }
  } catch {
    storage = undefined;
  }

  try {
    if (typeof browser.matchMedia === "function") {
      mediaQuery = browser.matchMedia(REDUCED_MOTION_QUERY);
    }
  } catch {
    mediaQuery = undefined;
  }

  return createReducedMotionController({
    root,
    ...(storage ? { storage } : {}),
    ...(mediaQuery ? { mediaQuery } : {}),
    ...(onChange ? { onChange } : {})
  });
}
