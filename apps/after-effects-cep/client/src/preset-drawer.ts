/** The preset variations open as a compact popover hanging from the card that
 * owns them: as wide as the card, right under its label, floating over the
 * cards below without pushing the grid. These helpers place it there. */

export interface PopoverBox {
  readonly top: number;
  readonly left: number;
  readonly width: number;
}

/** Where the popover sits inside the scrolling `grid`: under `card`, with the
 * card's left edge and width, in the grid's content coordinates so it scrolls
 * with the cards. Without layout (no size) it falls back to the origin. */
export function popoverBox(grid: HTMLElement, card: HTMLElement): PopoverBox {
  const outer = grid.getBoundingClientRect?.(), inner = card.getBoundingClientRect?.();
  if (!outer || !inner || !inner.width) return { top: 0, left: 0, width: 0 };
  const scrollTop = Number(grid.scrollTop) || 0, scrollLeft = Number(grid.scrollLeft) || 0;
  const borderTop = Number(grid.clientTop) || 0, borderLeft = Number(grid.clientLeft) || 0;
  return {
    top: Math.round(inner.bottom - outer.top - borderTop + scrollTop),
    left: Math.round(inner.left - outer.left - borderLeft + scrollLeft),
    width: Math.round(inner.width),
  };
}

/** Moves `popover` to the end of `grid`, out of the card flow (it is absolutely
 * positioned), unless it is already there. */
export function placePopoverIn(popover: HTMLElement, grid: HTMLElement): void {
  if (popover.parentNode === grid) return;
  popover.parentNode?.removeChild(popover);
  grid.appendChild(popover);
}
