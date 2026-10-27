/**
 * Where the text goes across the window. It is centred on the window, not on the space beside
 * a panel, so panels opening and closing leave it where it is; the reader's offset moves it from
 * there. Only a docked sidebar that would cover it moves it, and only as far as needed.
 */

/** A stretch of the window from left to right, in CSS pixels. */
export interface Extent {
  left: number
  width: number
}

/** The room kept between the text and the window's edge or the sidebar. */
export const placementGap = 24

/**
 * The offsets that put the text against the window's left and right edges, given where it sits
 * unmoved. They always include 0, where the layout put it, even off centre (a single page on
 * the right of a spread). Null when it fills the window and has no room to move.
 */
export function offsetRange(text: Extent, viewport: number): { min: number; max: number } | null {
  const min = Math.min(0, Math.ceil(placementGap - text.left))
  const max = Math.max(0, Math.floor(viewport - placementGap - text.left - text.width))
  return min < max ? { min, max } : null
}

export interface Placement {
  /** Pixels the text moves right from where the layout put it; negative moves it left. */
  shift: number
  /** Whether the text is clear of the sidebar; false when there isn't room beside it. */
  clear: boolean
}

export function placeText({
  text,
  viewport,
  offset,
  sidebar,
}: {
  /** Where the text sits unmoved. */
  text: Extent
  viewport: number
  /** The reader's offset from the centre. */
  offset: number
  /** The width of the docked sidebar at the left edge; 0 when it is closed. */
  sidebar: number
}): Placement {
  const range = offsetRange(text, viewport)
  const preferred = range ? Math.min(range.max, Math.max(range.min, offset)) : 0
  if (sidebar <= 0) return { shift: preferred, clear: true }
  const clearing = Math.ceil(sidebar + placementGap - text.left)
  if (range && clearing <= range.max) return { shift: Math.max(preferred, clearing), clear: true }
  // No room beside the sidebar: the text stays put and the sidebar lies over it.
  return { shift: preferred, clear: false }
}
