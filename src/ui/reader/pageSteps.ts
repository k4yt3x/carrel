/**
 * Moving through the pages of a PDF or comic in scrolled layout, where they hang one under the
 * other on a strip. Page Up and Page Down put the top of a page at the top of the window,
 * exactly, so a page fitted to the window's height fills it. Space goes a screenful at a time
 * but stops at the edges of pages: a page taller than the window ends with its bottom at the
 * window's, and the screenful after starts at the top of a page.
 */

/** A page on the strip, in the scroller's pixels. */
export interface StripPage {
  index: number
  start: number
  size: number
}

/** Leeway for scroll positions, which the browser rounds to whole device pixels. */
const slack = 2

/** The page the top of the window is on, or the one above the gap it is in. */
function pageAtTop(pages: readonly StripPage[], top: number): StripPage | undefined {
  return pages.findLast((page) => page.start <= top + slack)
}

/**
 * Page Down and Page Up: the page whose top goes to the top of the window. Down is the next
 * page; up is the top of the page the window is partway down, or else the page before. Null
 * when there is no such page. `pages` are the pages laid out around the window, in order.
 */
export function pageTarget(
  pages: readonly StripPage[],
  top: number,
  direction: 'next' | 'prev',
  count: number,
): number | null {
  const current = pageAtTop(pages, top)
  if (!current) {
    // Above the first page, in the gap before it.
    return direction === 'next' ? (pages.find((page) => page.start > top)?.index ?? null) : null
  }
  const target =
    direction === 'next'
      ? current.index + 1
      : current.start < top - slack
        ? current.index
        : current.index - 1
  return target >= 0 && target < count ? target : null
}

/**
 * Space and Shift+Space: where the top of the window goes for the next or previous screenful.
 * A page taller than the window is read a screenful at a time, from its top to where its
 * bottom meets the window's; past it, the window goes to the top of the first page not wholly
 * on screen. Going back is the same in reverse. `view` is the window's height.
 */
export function screenTarget(
  pages: readonly StripPage[],
  top: number,
  view: number,
  direction: 'next' | 'prev',
): number {
  const current = pageAtTop(pages, top)
  if (!current) return direction === 'next' ? top + view : Math.max(0, top - view)
  const at = pages.indexOf(current)
  if (direction === 'next') {
    const end = current.start + current.size
    if (end > top + view + slack) return Math.min(top + view, end - view)
    for (let i = at + 1; i < pages.length; i++) {
      const page = pages[i]
      if (!page || page.index !== current.index + (i - at)) break
      if (page.start + page.size > top + view + slack) return page.start
    }
    return top + view
  }
  if (current.start < top - slack) return Math.max(top - view, current.start)
  // At the top of a page: the screenful before it is the pages before it that fit in the
  // window together, or the last screenful of the one before, if that alone is taller.
  const before = pages[at - 1]
  if (!before || before.index !== current.index - 1) return Math.max(0, top - view)
  const end = before.start + before.size
  let first = at - 1
  for (let i = at - 2; i >= 0; i--) {
    const page = pages[i]
    const next = pages[i + 1]
    if (!page || !next || page.index !== next.index - 1 || end - page.start > view + slack) break
    first = i
  }
  const earliest = pages[first] ?? before
  return end - earliest.start <= view + slack ? earliest.start : end - view
}
