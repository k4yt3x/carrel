// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { relativeFontSizes, relativeFontSizesInDocument } from '@/domain/fontSizes'

describe('relativeFontSizes', () => {
  it('turns absolute sizes into rem at the browser default of 16px', () => {
    expect(relativeFontSizes('p { font-size: 12pt; } h1{font-size:24px}')).toBe(
      'p { font-size: 1rem; } h1{font-size:1.5rem}',
    )
    expect(relativeFontSizes('.x { font-size: 0.5in !important }')).toBe(
      '.x { font-size: 3rem !important }',
    )
  })

  it('turns size keywords into rem, but not words that merely contain them', () => {
    expect(relativeFontSizes('p { font-size: medium } q { font-size: x-large }')).toBe(
      'p { font-size: 1rem } q { font-size: 1.5rem }',
    )
    expect(relativeFontSizes('p { font: small-caps 12px Georgia }')).toBe(
      'p { font: small-caps 0.75rem Georgia }',
    )
  })

  it('leaves relative sizes, other properties and quoted font names alone', () => {
    const css =
      'p { font-size: 1.2em; margin: 12px; font-size-adjust: 0.5; line-height: 18px } ' +
      'h2 { font: 14pt/1.4 "Large Print", serif }'
    expect(relativeFontSizes(css)).toBe(
      'p { font-size: 1.2em; margin: 12px; font-size-adjust: 0.5; line-height: 18px } ' +
        'h2 { font: 1.1667rem/1.4 "Large Print", serif }',
    )
  })

  it('rewrites a style attribute, which has no selector or braces', () => {
    expect(relativeFontSizes('font-size:10pt;color:red')).toBe('font-size:0.8333rem;color:red')
  })
})

describe('relativeFontSizesInDocument', () => {
  it('rewrites style elements and attributes, but not inside SVG', () => {
    const doc = new DOMParser().parseFromString(
      `<html><head><style>p { font-size: 18px }</style></head><body>
        <p style="font-size: 9pt">a</p>
        <svg><text style="font-size: 12px">b</text></svg>
      </body></html>`,
      'text/html',
    )
    relativeFontSizesInDocument(doc)
    expect(doc.querySelector('style')?.textContent).toBe('p { font-size: 1.125rem }')
    expect(doc.querySelector('p')?.getAttribute('style')).toBe('font-size: 0.75rem')
    expect(doc.querySelector('text')?.getAttribute('style')).toBe('font-size: 12px')
  })
})
