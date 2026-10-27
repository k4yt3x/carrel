import { describe, expect, it } from 'vitest'
import {
  infoFromFileName,
  looksLikeIdentifier,
  plainText,
  readDetails,
  readMetadata,
  titleFromFileName,
  titleFromTextRuns,
} from '@/domain/metadata'

describe('readMetadata', () => {
  it('reads EPUB-style language maps and contributor objects', () => {
    const raw = {
      title: { en: '  The   Left Hand of Darkness ' },
      author: [{ name: { en: 'Ursula K. Le Guin' }, role: ['aut'] }],
      language: ['en-us'],
    }
    expect(readMetadata(raw, 'x.epub')).toEqual({
      title: 'The Left Hand of Darkness',
      titleFound: true,
      authors: ['Ursula K. Le Guin'],
      language: 'en-US',
    })
  })

  it('reads plain strings, mixed author lists and drops repeated names', () => {
    const raw = { title: 'Dune', author: ['Frank Herbert', { name: 'Frank Herbert' }, ''] }
    expect(readMetadata(raw, 'dune.mobi')).toMatchObject({
      title: 'Dune',
      authors: ['Frank Herbert'],
      language: null,
    })
  })

  it('takes the title from the file name when the book has none', () => {
    expect(readMetadata({ title: '   ' }, 'my_scanned_book.pdf').title).toBe('my scanned book')
    expect(readMetadata(undefined, 'Story.fb2.zip').title).toBe('Story')
  })

  it('treats stand-in titles and authors as missing', () => {
    const reading = readMetadata(
      { title: '3a7bd3e2360a3d29eea436fcfb7e44c735d117c4', author: ['Unknown'] },
      'Middlemarch.epub',
    )
    expect(reading).toMatchObject({ title: 'Middlemarch', titleFound: true, authors: [] })
    expect(readMetadata({ author: 'Administrator' }, 'a.pdf').authors).toEqual([])
    // A real author named Anonymous stays.
    expect(readMetadata({ author: 'Anonymous' }, 'a.epub').authors).toEqual(['Anonymous'])
  })

  it('strips what word processors add to a title', () => {
    expect(readMetadata({ title: 'Microsoft Word - Field Notes.docx' }, 'x.pdf').title).toBe(
      'Field Notes',
    )
  })

  it('says when nothing gave a title, so the importer can look further', () => {
    const reading = readMetadata({ title: 'untitled' }, 'e3b0c44298fc1c149afbf4c8996fb924.pdf')
    expect(reading).toMatchObject({ title: 'Untitled', titleFound: false })
  })

  it('takes the authors from the file name when the book has none', () => {
    const name =
      'Persuasion -- Jane Austen -- Penguin Classics -- 2003 -- 9780141439686 -- a1b2c3 -- Anna’s Archive.epub'
    expect(readMetadata({}, name)).toMatchObject({
      title: 'Persuasion',
      authors: ['Jane Austen'],
    })
    // The book's own authors win over the file name's.
    expect(readMetadata({ author: 'J. Austen' }, name).authors).toEqual(['J. Austen'])
  })

  it('ignores a language tag that is not BCP 47', () => {
    expect(readMetadata({ language: 'not a language!' }, 'a.epub').language).toBeNull()
  })
})

describe('infoFromFileName', () => {
  it('reads Anna’s Archive names, with several authors', () => {
    expect(
      infoFromFileName(
        'Good Omens -- Terry Pratchett; Neil Gaiman -- 2006 -- HarperTorch -- 0060853980 -- 9f2e -- Anna’s Archive.pdf',
      ),
    ).toEqual({ title: 'Good Omens', authors: ['Terry Pratchett', 'Neil Gaiman'] })
  })

  it('reads Z-Library names', () => {
    expect(infoFromFileName('Emma (Jane Austen) (z-library.sk, 1lib.sk, z-lib.sk).epub')).toEqual({
      title: 'Emma',
      authors: ['Jane Austen'],
    })
  })

  it('keeps parentheses in other names as part of the title', () => {
    expect(infoFromFileName('Dune (Dune Chronicles, Book 1).epub')).toEqual({
      title: 'Dune (Dune Chronicles, Book 1)',
      authors: [],
    })
  })

  it('gives nothing for a name that is a checksum or an identifier', () => {
    expect(infoFromFileName('3a7bd3e2360a3d29eea436fcfb7e44c7.epub').title).toBeNull()
    expect(infoFromFileName('123e4567-e89b-12d3-a456-426614174000.pdf').title).toBeNull()
    expect(infoFromFileName('9780141439686.epub').title).toBeNull()
  })
})

describe('looksLikeIdentifier', () => {
  it('tells checksums and UUIDs from titles made of digits', () => {
    expect(looksLikeIdentifier('urn:uuid:123e4567-e89b-12d3-a456-426614174000')).toBe(true)
    expect(looksLikeIdentifier('d41d8cd98f00b204e9800998ecf8427e')).toBe(true)
    expect(looksLikeIdentifier('1984')).toBe(false)
    expect(looksLikeIdentifier('Catch-22')).toBe(false)
  })
})

describe('titleFromTextRuns', () => {
  const body = Array.from({ length: 12 }, (_, i) => ({
    text: `Body line ${i}`,
    size: 11,
    top: 30 + i * 5,
  }))

  it('takes the large type at the top of the page, in reading order', () => {
    const runs = [
      { text: 'Gravity’s', size: 30, top: 12 },
      { text: 'Rainbow', size: 30, top: 12.2 },
      { text: 'A Novel', size: 18, top: 20 },
      ...body,
    ]
    expect(titleFromTextRuns(runs)).toBe('Gravity’s Rainbow')
  })

  it('finds nothing on a page where no line stands out', () => {
    expect(titleFromTextRuns(body)).toBeNull()
    expect(titleFromTextRuns([])).toBeNull()
  })

  it('ignores large type low on the page, such as a page number or a publisher’s mark', () => {
    expect(titleFromTextRuns([...body, { text: 'PENGUIN', size: 40, top: 90 }])).toBeNull()
  })
})

describe('titleFromFileName', () => {
  it('keeps a name without an extension whole', () => {
    expect(titleFromFileName('README')).toBe('README')
  })
})

describe('readDetails', () => {
  it('reads what an EPUB says about itself', () => {
    const details = readDetails({
      subtitle: 'Or, The Whale',
      belongsTo: { series: [{ name: 'Great Novels', position: '3' }] },
      publisher: { name: 'Harper & Brothers' },
      published: '1851-11-14',
      description:
        '<p>The voyage of the <i>Pequod</i>.</p><p>Call me Ishmael &amp; more&#8230;</p>',
      subject: ['Whaling', { name: 'Sea stories' }, 'Whaling'],
      identifier: 'urn:uuid:1234',
      altIdentifier: ['urn:isbn:978-0-14-243724-7'],
      translator: [{ name: 'A. Translator' }],
      rights: 'Public domain',
    })
    expect(details).toEqual({
      subtitle: 'Or, The Whale',
      series: { name: 'Great Novels', position: '3' },
      publisher: 'Harper & Brothers',
      published: '1851-11-14',
      description: 'The voyage of the Pequod.\n\nCall me Ishmael & more…',
      subjects: ['Whaling', 'Sea stories'],
      isbn: '9780142437247',
      contributors: [{ role: 'translator', names: ['A. Translator'] }],
      rights: 'Public domain',
    })
  })

  it('leaves out what is missing or only a stand-in', () => {
    const details = readDetails({ publisher: 'Unknown', identifier: 'urn:uuid:abc' })
    expect(details.publisher).toBeNull()
    expect(details.isbn).toBeNull()
    expect(details.description).toBeNull()
    expect(details.subjects).toEqual([])
    expect(details.contributors).toEqual([])
    expect(readDetails(null).series).toBeNull()
  })

  it('finds an ISBN given with its scheme', () => {
    expect(readDetails({ altIdentifier: [{ scheme: 'ISBN', value: '0-306-40615-2' }] }).isbn).toBe(
      '0306406152',
    )
  })
})

describe('plainText', () => {
  it('keeps paragraphs and line breaks, and drops the markup', () => {
    expect(plainText('<div>One<br/>line</div>\n<p>Two &lt;three&gt;</p><script>x()</script>')).toBe(
      'One\nline\n\nTwo <three>',
    )
  })
})
