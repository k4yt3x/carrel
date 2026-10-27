/**
 * Turns reading settings into the attributes foliate-js's renderers take. Every attribute
 * change makes the renderer lay the book out again, so only values that differ are written.
 */

import type { ReadingSettings } from '@/domain/settings'

type Attributes = Record<string, string | null>

/** Attributes for reflowable books (EPUB, MOBI, FB2...), laid out by the paginator. */
export function paginatorAttributes(settings: ReadingSettings, reducedMotion: boolean): Attributes {
  const scrolled = settings.flow === 'scrolled'
  // The top margin holds the running head, which only paged layout draws; the bottom one
  // matches it.
  const blockMargin = !scrolled && settings.runningHeads ? '48px' : '24px'
  return {
    flow: settings.flow,
    'margin-top': blockMargin,
    'margin-bottom': blockMargin,
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
