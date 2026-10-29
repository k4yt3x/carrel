/**
 * Turns reading settings into the attributes foliate-js's renderers take. Every attribute
 * change makes the renderer lay the book out again, so only values that differ are written.
 */

import type { ReadingSettings } from '@/domain/settings'

type Attributes = Record<string, string | null>

/** The height of the reader's bars, in CSS pixels. */
export const barHeight = 44

/** A page's margin above or below its text where its band is hidden. */
const bareMargin = 24

/**
 * The bands above and below a reflowable book's text, in CSS pixels: the header and the footer,
 * as tall as the bars, which come up over the bands rather than over the text. A hidden one
 * leaves a page's margin in paged layout, and nothing in scrolled layout.
 */
export function textBands(settings: ReadingSettings): { top: number; bottom: number } {
  const bare = settings.flow === 'scrolled' ? 0 : bareMargin
  return {
    top: settings.header === 'hide' ? bare : barHeight,
    bottom: settings.footer === 'hide' ? bare : barHeight,
  }
}

/** Attributes for reflowable books (EPUB, MOBI, FB2...), laid out by the paginator. */
export function paginatorAttributes(settings: ReadingSettings, reducedMotion: boolean): Attributes {
  // In paged layout the bands are the page's margins. A scroller spans its margins, so in
  // scrolled layout the reader keeps the bands outside it; there the margins only pad vertical
  // text, across the scroll.
  const bands =
    settings.flow === 'scrolled' ? { top: bareMargin, bottom: bareMargin } : textBands(settings)
  return {
    flow: settings.flow,
    'margin-top': `${bands.top}px`,
    'margin-bottom': `${bands.bottom}px`,
    'margin-left': `${settings.sideMargin}px`,
    'margin-right': `${settings.sideMargin}px`,
    'max-inline-size': `${settings.maxColumnWidth}px`,
    'max-column-count': settings.columns === 'one' ? '1' : '2',
    animated: settings.pageTurn !== 'none' && !reducedMotion ? '' : null,
    // Without a turn style the paginator slides the pages along; 'curl' lifts the page.
    'turn-style': settings.pageTurn === 'curl' ? 'curl' : null,
  }
}

/** Attributes for fixed-layout books (PDF, comics, fixed-layout EPUB). */
export function fixedLayoutAttributes(settings: ReadingSettings): Attributes {
  return {
    flow: settings.flow,
    zoom: settings.pageFit === 'width' ? 'fit-width' : 'fit-page',
    spread: settings.spreads,
  }
}

/** Writes the attributes that changed; null removes one. */
export function applyAttributes(element: Element, attributes: Attributes): void {
  for (const [name, value] of Object.entries(attributes)) {
    if (element.getAttribute(name) === value) continue
    if (value === null) element.removeAttribute(name)
    else element.setAttribute(name, value)
  }
}
