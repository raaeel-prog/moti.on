/** One rendered preview at a time, over the still of whichever host (a
 * direction tile, a selected card) is being looked at: a preview wall
 * (preview-wall.ts) that holds a single host. It stays invisible until a frame
 * is drawn, so a host never shows an empty box, and a clip that cannot be
 * decoded leaves the still in place. */
import { createPreviewWall, previewSpec, type WallEnvironment } from "./preview-wall.js";

export interface PreviewPlayer {
  /** Plays `src` over `host` from its first frame; the same host and source keep playing. */
  show(host: HTMLElement, src: string): void;
  /** Stops and hides, leaving the still; with a host, only if it is the one playing. */
  stop(host?: HTMLElement): void;
  /** Keeps the frame on screen (focus moved to After Effects). */
  pause(host?: HTMLElement): void;
  owner(): HTMLElement | null;
  dispose(): void;
}

/** `fps` is the clip's own rate, so every rendered frame is kept. */
export function createPreviewPlayer(doc: Document, className = "ch-preset-player", fps = 30, environment?: WallEnvironment): PreviewPlayer {
  const wall = createPreviewWall(doc, className, environment);
  let host: HTMLElement | null = null;
  function stop(of?: HTMLElement): void {
    if (of && of !== host) return;
    if (host) wall.detach(host);
    host = null;
  }
  return {
    show(next, src) {
      if (host && host !== next) wall.detach(host);
      host = next;
      wall.attach(next, previewSpec(next, src, fps));
    },
    stop,
    pause(of) { if (host && (!of || of === host)) wall.pause(host); },
    owner: () => host,
    dispose() { stop(); wall.dispose(); }
  };
}
