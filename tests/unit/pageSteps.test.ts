import { describe, expect, it } from 'vitest'
import { pageTarget, type StripPage, screenTarget } from '@/ui/reader/pageSteps'

/** Pages of one size on a strip, `gap` apart and `gap / 2` from its top, as foliate-js lays them. */
const strip = (count: number, size: number, gap = 2.7, from = 0): StripPage[] =>
  Array.from({ length: count }, (_, i) => ({
    index: from + i,
    start: gap / 2 + (from + i) * (size + gap),
    size,
  }))

const view = 690

describe('pageTarget', () => {
  // Pages fitted to the window's height, as Whole page fits them at 100%.
  const fitted = strip(6, view)
  const startOf = (index: number) => fitted[index]?.start ?? Number.NaN

  it('goes from the top of one page to the top of the next', () => {
    expect(pageTarget(fitted, startOf(0), 'next', 6)).toBe(1)
    expect(pageTarget(fitted, startOf(1), 'next', 6)).toBe(2)
    // Scrolled to a rounded pixel either side of the page's top.
    expect(pageTarget(fitted, Math.floor(startOf(2)), 'next', 6)).toBe(3)
    expect(pageTarget(fitted, Math.ceil(startOf(2)), 'next', 6)).toBe(3)
  })

  it('goes back to the top of the page it is partway down, then to the page before', () => {
    expect(pageTarget(fitted, startOf(2) + 300, 'prev', 6)).toBe(2)
    expect(pageTarget(fitted, startOf(2), 'prev', 6)).toBe(1)
    expect(pageTarget(fitted, startOf(2) + 300, 'next', 6)).toBe(3)
  })

  it('stops at the first and last pages', () => {
    expect(pageTarget(fitted, startOf(0), 'prev', 6)).toBeNull()
    expect(pageTarget(fitted, startOf(5), 'next', 6)).toBeNull()
    // From the margin above the first page, a pixel or so, the next page; from well above it,
    // as when zoomed in, the first.
    expect(pageTarget(fitted, 0, 'next', 6)).toBe(1)
    expect(pageTarget(strip(6, view, 20), 0, 'next', 6)).toBe(0)
  })

  it('counts on from the page at the top, not from a page far off still laid out', () => {
    const pages = [...strip(1, view), ...strip(3, view, 2.7, 8)]
    expect(pageTarget(pages, pages[2]?.start ?? 0, 'next', 20)).toBe(10)
  })
})

describe('screenTarget', () => {
  it('goes a page at a time when a page fills the window', () => {
    const fitted = strip(4, view)
    const [first, second] = fitted
    expect(screenTarget(fitted, first?.start ?? 0, view, 'next')).toBe(second?.start)
    expect(screenTarget(fitted, second?.start ?? 0, view, 'prev')).toBe(first?.start)
  })

  it('reads a tall page a screenful at a time, ending where its bottom meets the window', () => {
    const tall = strip(3, 2.5 * view)
    const [first, second] = tall
    if (!first || !second) throw new Error('no pages')
    const end = first.start + first.size
    expect(screenTarget(tall, first.start, view, 'next')).toBe(first.start + view)
    expect(screenTarget(tall, first.start + view, view, 'next')).toBe(end - view)
    expect(screenTarget(tall, end - view, view, 'next')).toBe(second.start)
    // And back again.
    expect(screenTarget(tall, second.start, view, 'prev')).toBe(end - view)
    expect(screenTarget(tall, end - view, view, 'prev')).toBe(end - 2 * view)
    expect(screenTarget(tall, first.start + 100, view, 'prev')).toBe(first.start)
  })

  it('goes on to the first page not wholly on screen when several fit', () => {
    const small = strip(8, 0.3 * view)
    const at = (index: number) => small[index]?.start ?? Number.NaN
    // Pages 0, 1 and 2 are wholly on screen; 3 is cut off.
    expect(screenTarget(small, at(0), view, 'next')).toBe(at(3))
    // Back from 3, the three pages before it fill the screenful.
    expect(screenTarget(small, at(3), view, 'prev')).toBe(at(0))
    expect(screenTarget(small, at(6), view, 'prev')).toBe(at(3))
  })
})
