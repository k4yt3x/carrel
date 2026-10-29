import { describe, expect, it } from 'vitest'
import { defaultReadingSettings, type ReadingSettings } from '@/domain/settings'
import {
  applyAttributes,
  barHeight,
  fixedLayoutAttributes,
  paginatorAttributes,
  textBands,
} from '@/ui/reader/layout'
import { type PageTheme, pageStyles, textShiftProperty } from '@/ui/reader/pageStyles'
import { schemeOf } from '@/ui/useTheme'

const light: PageTheme = {
  scheme: 'light',
  background: '#f7f9f9',
  foreground: '#332b29',
  link: '#26643f',
}
const dark: PageTheme = { ...light, scheme: 'dark', background: '#17171c' }

const styles = (
  settings: Partial<ReadingSettings> = {},
  theme = light,
  fontFamily: string | null = null,
) => {
  const [before, after] = pageStyles({
    theme,
    settings: { ...defaultReadingSettings, ...settings },
    fontFamily,
    fontFaces: '',
  })
  return { before, after }
}

describe('pageStyles', () => {
  it('sets the text size on the root, where the book’s relative sizes scale from it', () => {
    expect(styles({ fontSize: 24 }).after).toContain('html { font-size: 24px !important; }')
  })

  it('leaves the book’s fonts alone unless a typeface is chosen, and spares code', () => {
    expect(styles().after).not.toContain('font-family')
    const { after } = styles({}, light, 'Georgia, serif')
    expect(after).toContain('body { font-family: Georgia, serif !important; }')
    expect(after).toMatch(/body \*:not\(pre, code[^)]*\) \{\s*font-family: inherit !important;/)
  })

  it('keeps a book’s colours in a light theme, but not when told otherwise', () => {
    expect(styles().after).not.toContain('color: inherit !important')
    expect(styles({ keepBookColors: false }).after).toContain('color: inherit !important')
  })

  it('always takes the colours over in a dark theme', () => {
    expect(styles({ keepBookColors: true }, dark).after).toContain('color: inherit !important')
  })

  it('paints the page in the theme’s colour, whatever the book gives its body', () => {
    const { after } = styles()
    expect(after).toContain('--theme-bg-color: #f7f9f9;')
    expect(after).toContain('--override-color: true;')
  })

  it('leaves alignment and paragraphs to the book until they are set', () => {
    expect(styles().after).not.toContain('text-align')
    expect(styles().after).not.toContain('text-indent')
    expect(styles({ textAlign: 'justify' }).after).toContain('text-align: justify !important')
    expect(styles({ paragraphs: 'indented' }).after).toContain('text-indent: 1.5em !important')
    expect(styles({ paragraphs: 'spaced' }).after).toContain('text-indent: 0 !important')
  })

  it('moves the text across inside the scroller only in scrolled layout', () => {
    // Moving the body in paged layout would slide the text across the page breaks.
    expect(styles({ flow: 'scrolled' }).after).toContain(`translate: var(${textShiftProperty}`)
    expect(styles({ flow: 'paginated' }).after).not.toContain('translate')
  })

  it('puts the reader’s own CSS last, so it has the final word', () => {
    const { after } = styles({ customCss: 'p { color: hotpink; }', paragraphs: 'spaced' })
    expect(after.trimEnd().endsWith('p { color: hotpink; }')).toBe(true)
  })
})

describe('textBands', () => {
  const bands = (settings: Partial<ReadingSettings>) =>
    textBands({ ...defaultReadingSettings, ...settings })

  it('gives the header and the footer bands as tall as the bars, blank or not', () => {
    expect(bands({ flow: 'paginated' })).toEqual({ top: barHeight, bottom: barHeight })
    expect(bands({ flow: 'scrolled', header: 'blank', footer: 'blank' })).toEqual({
      top: barHeight,
      bottom: barHeight,
    })
    expect(bands({ flow: 'scrolled', header: 'hide' })).toEqual({ top: 0, bottom: barHeight })
    expect(bands({ flow: 'scrolled', footer: 'hide' })).toEqual({ top: barHeight, bottom: 0 })
  })

  it('leaves a page’s margin where a band is hidden, and nothing in scrolled layout', () => {
    const hidden = { header: 'hide', footer: 'hide' } as const
    expect(bands({ flow: 'paginated', ...hidden })).toEqual({ top: 24, bottom: 24 })
    expect(bands({ flow: 'scrolled', ...hidden })).toEqual({ top: 0, bottom: 0 })
  })
})

describe('paginatorAttributes', () => {
  // Paged layout unless a test says otherwise; the default is scrolled.
  const attributes = (settings: Partial<ReadingSettings> = {}, reducedMotion = false) =>
    paginatorAttributes(
      { ...defaultReadingSettings, flow: 'paginated', ...settings },
      reducedMotion,
    )

  it('lays the text out as the settings say', () => {
    expect(attributes({ maxColumnWidth: 720, sideMargin: 32, columns: 'one' })).toMatchObject({
      flow: 'paginated',
      'max-inline-size': '720px',
      'margin-left': '32px',
      'margin-right': '32px',
      'max-column-count': '1',
    })
  })

  it('makes the bands the page’s margins in paged layout only', () => {
    expect(attributes({ header: 'hide' })).toMatchObject({
      'margin-top': '24px',
      'margin-bottom': `${barHeight}px`,
    })
    expect(attributes({ footer: 'hide' })).toMatchObject({
      'margin-top': `${barHeight}px`,
      'margin-bottom': '24px',
    })
    expect(attributes({ flow: 'scrolled' })).toMatchObject({
      'margin-top': '24px',
      'margin-bottom': '24px',
    })
  })

  it('animates page turns unless they are off or the system asks for less motion', () => {
    expect(attributes().animated).toBe('')
    expect(attributes({ pageTurn: 'none' }).animated).toBeNull()
    expect(attributes({}, true).animated).toBeNull()
    expect(attributes({ pageTurn: 'curl' })['turn-style']).toBe('curl')
  })

  it('fits fixed-layout pages and spreads as the settings say', () => {
    expect(
      fixedLayoutAttributes({ ...defaultReadingSettings, pageFit: 'width', spreads: 'none' }),
    ).toEqual({ flow: 'scrolled', zoom: 'fit-width', spread: 'none' })
  })
})

describe('applyAttributes', () => {
  it('writes only what changed, since every write lays the book out again', () => {
    const values = new Map<string, string>([
      ['flow', 'paginated'],
      ['animated', ''],
    ])
    const writes: string[] = []
    const element = {
      getAttribute: (name: string) => values.get(name) ?? null,
      setAttribute: (name: string, value: string) => {
        writes.push(`set ${name}`)
        values.set(name, value)
      },
      removeAttribute: (name: string) => {
        writes.push(`remove ${name}`)
        values.delete(name)
      },
    } as unknown as Element
    applyAttributes(element, { flow: 'paginated', animated: null, gap: '5%' })
    expect(writes).toEqual(['remove animated', 'set gap'])
    applyAttributes(element, { flow: 'paginated', animated: null, gap: '5%' })
    expect(writes).toHaveLength(2)
  })
})

describe('schemeOf', () => {
  it('follows the system only under the system theme', () => {
    expect(schemeOf('system', true)).toBe('dark')
    expect(schemeOf('system', false)).toBe('light')
    expect(schemeOf('light', true)).toBe('light')
    expect(schemeOf('dark', false)).toBe('dark')
  })
})
