import { describe, expect, it } from 'vitest'
import { normalizeMetadata, titleFromFileName } from '@/domain/metadata'

describe('normalizeMetadata', () => {
  it('reads EPUB-style language maps and contributor objects', () => {
    const raw = {
      title: { en: '  The   Left Hand of Darkness ' },
      author: [{ name: { en: 'Ursula K. Le Guin' }, role: ['aut'] }],
      language: ['en-us'],
    }
    expect(normalizeMetadata(raw, 'x.epub')).toEqual({
      title: 'The Left Hand of Darkness',
      authors: ['Ursula K. Le Guin'],
      language: 'en-US',
    })
  })

  it('reads plain strings, mixed author lists and drops repeated names', () => {
    const raw = { title: 'Dune', author: ['Frank Herbert', { name: 'Frank Herbert' }, ''] }
    expect(normalizeMetadata(raw, 'dune.mobi')).toEqual({
      title: 'Dune',
      authors: ['Frank Herbert'],
      language: null,
    })
  })

  it('takes the title from the file name when the book has none', () => {
    expect(normalizeMetadata({ title: '   ' }, 'my_scanned_book.pdf').title).toBe('my scanned book')
    expect(normalizeMetadata(undefined, 'Story.fb2.zip').title).toBe('Story')
  })

  it('ignores a language tag that is not BCP 47', () => {
    expect(normalizeMetadata({ language: 'not a language!' }, 'a.epub').language).toBeNull()
  })
})

describe('titleFromFileName', () => {
  it('keeps a name without an extension whole', () => {
    expect(titleFromFileName('README')).toBe('README')
  })
})
