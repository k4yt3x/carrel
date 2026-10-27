import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, type Font } from '@/domain/db'
import {
  addFontFiles,
  addFontFromUrl,
  detectFontFormat,
  type FontFaceSource,
  FontImportError,
  fontCssFamily,
  fontFaceRules,
  parseFontFaceCss,
  readFontMetadata,
  removeFont,
} from '@/domain/fonts'
import {
  ascii,
  type FontOptions,
  macName,
  nameTable,
  os2Table,
  sfnt,
  windowsName,
  woff,
  woff2,
} from './fontFixtures'

const MiB = 1024 * 1024
const accept = async (_file: Blob) => {}

/** The FontImportError a promise rejects with; fails the test when it resolves or throws else. */
async function refusal(promise: Promise<unknown>): Promise<FontImportError> {
  const error = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  )
  expect(error).toBeInstanceOf(FontImportError)
  return error as FontImportError
}

const metadataOf = (bytes: Uint8Array<ArrayBuffer>) => readFontMetadata(new Blob([bytes]))

const ttf = (name: string, options: FontOptions = {}) => new File([sfnt(options)], name)

/** Names long enough that WOFF stores the name table deflated. */
const longNames = (family: string) => [
  windowsName(0, 'Copyright '.repeat(20)),
  windowsName(1, family),
]

/** An fvar table with the given axes, each defaulting to its minimum. */
function fvarTable(axes: readonly [tag: string, min: number, max: number][]) {
  const table = new Uint8Array(16 + 20 * axes.length)
  const view = new DataView(table.buffer)
  view.setUint16(0, 1)
  view.setUint16(4, 16)
  view.setUint16(8, axes.length)
  view.setUint16(10, 20)
  for (const [i, [tag, min, max]] of axes.entries()) {
    const record = 16 + 20 * i
    table.set(ascii(tag), record)
    view.setInt32(record + 4, min * 0x10000)
    view.setInt32(record + 8, min * 0x10000)
    view.setInt32(record + 12, max * 0x10000)
  }
  return table
}

/** The tables of a variable Literata at weight class 400, with the given fvar axes. */
const variableTables = (...axes: [tag: string, min: number, max: number][]) => ({
  name: nameTable([windowsName(1, 'Literata')]),
  'OS/2': os2Table(400, false),
  fvar: fvarTable(axes),
})

beforeEach(async () => {
  await db.open()
})

afterEach(async () => {
  await db.delete()
  vi.restoreAllMocks()
})

describe('detectFontFormat', () => {
  it('tells each format by its signature', () => {
    expect(detectFontFormat(sfnt())).toBe('truetype')
    expect(detectFontFormat(ascii('true\0\0'))).toBe('truetype')
    expect(detectFontFormat(sfnt({ flavor: 'opentype' }))).toBe('opentype')
    expect(detectFontFormat(woff().bytes)).toBe('woff')
    expect(detectFontFormat(woff2())).toBe('woff2')
    expect(detectFontFormat(ascii('ttcf\0\x02\0\0'))).toBe('collection')
    expect(detectFontFormat(ascii('PK\x03\x04'))).toBeNull()
    expect(detectFontFormat(ascii('@font-face {'))).toBeNull()
    expect(detectFontFormat(ascii('wOF'))).toBeNull()
  })
})

describe('readFontMetadata', () => {
  it('reads the family, weight and slant of TrueType and OpenType fonts', async () => {
    const bold = sfnt({ names: [windowsName(1, 'Literata')], weight: 700, italic: true })
    expect(await metadataOf(bold)).toEqual({
      family: 'Literata',
      weight: '700',
      italic: true,
      format: 'truetype',
    })
    const light = sfnt({
      names: [windowsName(1, 'Source Serif')],
      weight: 300,
      flavor: 'opentype',
    })
    expect(await metadataOf(light)).toEqual({
      family: 'Source Serif',
      weight: '300',
      italic: false,
      format: 'opentype',
    })
  })

  it('prefers the typographic family name, and US English among Windows names', async () => {
    const names = [
      macName(16, 'Literata Mac'),
      windowsName(1, 'Literata SemiBold'),
      windowsName(16, 'Literata Deutsch', 0x0407),
      windowsName(16, 'Literata'),
    ]
    expect((await metadataOf(sfnt({ names }))).family).toBe('Literata')
    expect((await metadataOf(sfnt({ names: names.slice(0, 3) }))).family).toBe('Literata Deutsch')
    expect((await metadataOf(sfnt({ names: names.slice(0, 2) }))).family).toBe('Literata Mac')
  })

  it('falls back to Mac Roman names when no Windows name can be decoded', async () => {
    const shiftJis = { platform: 3, encoding: 2, language: 0x0411, nameId: 16, value: 'Mincho' }
    const names = [shiftJis, macName(1, 'Old Style')]
    expect((await metadataOf(sfnt({ names }))).family).toBe('Old Style')
  })

  it('reads a WOFF 1.0 file, inflating its tables', async () => {
    const { bytes, compressed } = woff({
      names: longNames('Literata'),
      weight: 600,
      italic: true,
    })
    expect(compressed).toEqual(['OS/2', 'name'])
    expect(await metadataOf(bytes)).toEqual({
      family: 'Literata',
      weight: '600',
      italic: true,
      format: 'woff',
    })
  })

  it('reads a variable font’s weight axis as a weight range', async () => {
    const variable = variableTables(['wdth', 75, 100], ['wght', 200, 900])
    expect((await metadataOf(sfnt({ tables: variable }))).weight).toBe('200 900')
    const { bytes, compressed } = woff({ tables: variable })
    expect(compressed).toContain('fvar')
    expect((await metadataOf(bytes)).weight).toBe('200 900')
    const fractional = variableTables(['wght', 100.5, 900])
    expect((await metadataOf(sfnt({ tables: fractional }))).weight).toBe('100.5 900')
    // Without a usable weight axis, the OS/2 weight class stands.
    const unusable: [tag: string, min: number, max: number][] = [
      ['wdth', 75, 100],
      ['wght', 900, 200],
      ['wght', 0, 900],
    ]
    for (const axis of unusable) {
      expect((await metadataOf(sfnt({ tables: variableTables(axis) }))).weight).toBe('400')
    }
  })

  it('reads only the format of a WOFF2 file, whose tables need Brotli', async () => {
    expect(await metadataOf(woff2())).toEqual({
      family: null,
      weight: null,
      italic: false,
      format: 'woff2',
    })
  })

  it('refuses a font collection and anything that is not a font', async () => {
    expect((await refusal(metadataOf(ascii('ttcf\0\x02\0\0')))).message).toMatch(/\.ttc/)
    const page = new File(['<!doctype html>'], 'page.html')
    expect((await refusal(readFontMetadata(page))).message).toMatch(/“page.html” isn’t a font/)
  })

  it('reads truncated and inconsistent fonts as missing metadata rather than failing', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fonts = [
      { bytes: sfnt(), format: 'truetype' },
      { bytes: woff({ names: longNames('Literata') }).bytes, format: 'woff' },
      { bytes: woff({ tables: variableTables(['wght', 200, 900]) }).bytes, format: 'woff' },
    ]
    for (const { bytes, format } of fonts) {
      for (let end = 4; end < bytes.length; end++) {
        await expect(metadataOf(bytes.slice(0, end))).resolves.toMatchObject({ format })
      }
    }
    const name = nameTable([windowsName(1, 'Literata')])
    const view = new DataView(name.buffer)
    view.setUint16(2, 500) // more name records than the table holds
    view.setUint16(14, 0xffff) // a string running past the end of the table
    const os2 = os2Table(700, true).slice(0, 5)
    const fvar = fvarTable([['wght', 200, 900]]).slice(0, 24) // an axis cut off after its minimum
    expect(await metadataOf(sfnt({ tables: { name, 'OS/2': os2, fvar } }))).toEqual({
      family: null,
      weight: null,
      italic: false,
      format: 'truetype',
    })
  })

  it('reads a deflated table whose stated length is wrong or absurd as missing', async () => {
    // The name table's directory entry follows OS/2's; its stored and full lengths are at +8
    // and +12.
    const statingLength = (length: (stored: number) => number) => {
      const { bytes } = woff({ names: longNames('Literata') })
      const view = new DataView(bytes.buffer)
      view.setUint32(64 + 12, length(view.getUint32(64 + 8)))
      return bytes
    }
    expect((await metadataOf(statingLength((stored) => stored + 1))).family).toBeNull()
    expect((await metadataOf(statingLength(() => 0xffffffff))).family).toBeNull()
    expect((await metadataOf(statingLength(() => 2000))).family).toBe('Literata')
  })
})

const summary = (sources: FontFaceSource[]) =>
  sources.map(({ url, ...source }) => ({ ...source, url: url.href }))

describe('parseFontFaceCss', () => {
  const base = new URL('https://fonts.googleapis.com/css2?family=Literata')

  it('lists every rule of a Google Fonts stylesheet', () => {
    const css = `/* cyrillic */
@font-face {
  font-family: 'Literata';
  font-style: italic;
  font-weight: 200   900;
  font-display: swap;
  src: url(https://fonts.gstatic.com/s/literata/v40/cyrillic.woff2) format('woff2');
  unicode-range: U+0301, U+0400-045F,
    U+0490-0491, U+2116;
}
/* latin */
@font-face {
  font-family: 'Literata';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url(https://fonts.gstatic.com/s/literata/v40/latin.woff2) format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153;
}
@font-face {
  font-family: 'Noto Serif JP';
  font-style: normal;
  font-weight: 700;
  src: url(https://fonts.gstatic.com/s/notoserifjp/v30/119.woff2) format('woff2');
  unicode-range: U+25ee8, U+25f23;
}`
    expect(summary(parseFontFaceCss(css, base))).toEqual([
      {
        family: 'Literata',
        url: 'https://fonts.gstatic.com/s/literata/v40/cyrillic.woff2',
        format: 'woff2',
        weight: '200 900',
        style: 'italic',
        unicodeRange: 'U+0301, U+0400-045F, U+0490-0491, U+2116',
      },
      {
        family: 'Literata',
        url: 'https://fonts.gstatic.com/s/literata/v40/latin.woff2',
        format: 'woff2',
        weight: '400',
        style: 'normal',
        unicodeRange: 'U+0000-00FF, U+0131, U+0152-0153',
      },
      {
        family: 'Noto Serif JP',
        url: 'https://fonts.gstatic.com/s/notoserifjp/v30/119.woff2',
        format: 'woff2',
        weight: '700',
        style: 'normal',
        unicodeRange: 'U+25ee8, U+25f23',
      },
    ])
  })

  it('takes the best source of each rule and leaves out rules with none it can use', () => {
    const css = `
      @font-face {
        font-family: A;
        src: local('A'), url(a.eot?#iefix) format('embedded-opentype'), url(a.svg#a) format('svg'),
          url(a.ttf) format('truetype'), url("a.woff2") format("woff2") tech(variations),
          url(a.woff) format('woff');
      }
      @font-face { font-family: B; src: url(b.ttf), url(b.otf); }
      @font-face { font-family: C; src: url(c.woff) format("woff"), url(c) format(woff2-variations); }
      @font-face { font-family: D; src: local('D'); }
      @font-face { font-family: E; src: url(e.eot) format('embedded-opentype'), url(e.svg); }
      @font-face { font-family: F; src: url(font?id=1); }
      @font-face { src: url(g.woff2); }
    `
    const sources = parseFontFaceCss(css, base)
    expect(sources.map(({ family, url, format }) => [family, url.pathname, format])).toEqual([
      ['A', '/a.woff2', 'woff2'],
      ['B', '/b.otf', 'opentype'],
      ['C', '/c', 'woff2'],
    ])
  })

  it('resolves relative URLs against the stylesheet’s own', () => {
    const sheet = new URL('https://cdn.jsdelivr.net/npm/@fontsource/literata@5/index.css')
    const urls = [
      './files/a.woff2',
      '../b.woff2',
      '/c.woff2',
      '//fonts.example/d.woff2',
      'https://other.example/e.woff2',
    ]
    const css = urls.map((url, i) => `@font-face { font-family: F${i}; src: url(${url}); }`)
    expect(parseFontFaceCss(css.join('\n'), sheet).map(({ url }) => url.href)).toEqual([
      'https://cdn.jsdelivr.net/npm/@fontsource/literata@5/files/a.woff2',
      'https://cdn.jsdelivr.net/npm/@fontsource/b.woff2',
      'https://cdn.jsdelivr.net/c.woff2',
      'https://fonts.example/d.woff2',
      'https://other.example/e.woff2',
    ])
  })

  it('reads unquoted and escaped family names, and fills in absent descriptors', () => {
    const css = `
      @font-face { font-family: Source   Serif
        4; src: url(a.woff2); }
      @font-face {
        font-family: "Caf\\e9  \\"Noir\\"";
        src: url(b.woff2);
        font-weight: bold;
        font-style: oblique 10deg;
      }
      @font-face { font-family: 'Two', 'Families'; src: url(c.woff2); }
    `
    expect(summary(parseFontFaceCss(css, base))).toEqual([
      {
        family: 'Source Serif 4',
        url: 'https://fonts.googleapis.com/a.woff2',
        format: 'woff2',
        weight: '400',
        style: 'normal',
        unicodeRange: null,
      },
      {
        family: 'Café "Noir"',
        url: 'https://fonts.googleapis.com/b.woff2',
        format: 'woff2',
        weight: 'bold',
        style: 'oblique 10deg',
        unicodeRange: null,
      },
    ])
  })

  it('ignores rules in comments and strings, and finds rules nested in other at-rules', () => {
    const css = `
      /* @font-face { font-family: Ghost; src: url(ghost.woff2); } */
      .note::before { content: "@font-face { font-family: Ghost; src: url(ghost.woff2) }"; }
      @supports (font-tech(variations)) {
        @media screen {
          @font-face { font-family: /* inline */ Real; src: url("odd;name}.woff2") /* x */; }
        }
      }
    `
    expect(parseFontFaceCss(css, base).map(({ family, url }) => [family, url.href])).toEqual([
      ['Real', new URL('odd;name}.woff2', base).href],
    ])
  })

  it('drops descriptor values that are not of the expected shape', () => {
    const css = `@font-face {
      font-family: A;
      src: url(a.woff2);
      font-weight: 400 "x";
      font-style: italic url(x);
      unicode-range: U+0-7F, expression(alert(1));
    }`
    expect(parseFontFaceCss(css, base)).toMatchObject([
      { weight: '400', style: 'normal', unicodeRange: null },
    ])
  })
})

describe('fontFaceRules', () => {
  it('declares each file under the font’s CSS family, with any URL kept intact', () => {
    const font: Font = {
      id: 'f1',
      family: 'Literata',
      source: 'Literata.woff2',
      addedAt: 0,
      files: [
        {
          data: new Blob(),
          format: 'woff2',
          weight: '200 900',
          style: 'normal',
          unicodeRange: 'U+0000-00FF, U+0131',
        },
        {
          data: new Blob(),
          format: 'truetype',
          weight: '400',
          style: 'italic',
          unicodeRange: null,
        },
      ],
    }
    const urls = [
      'https://example.com/a"b\\c).woff2?x=;}{',
      "https://example.com/line\nbreak's.ttf",
    ]
    const css = fontFaceRules(font, (file) => urls[font.files.indexOf(file)] ?? '')
    const base = new URL('https://base.example/')
    expect(summary(parseFontFaceCss(css, base))).toEqual([
      {
        family: fontCssFamily('f1'),
        url: new URL(urls[0] ?? '', base).href,
        format: 'woff2',
        weight: '200 900',
        style: 'normal',
        unicodeRange: 'U+0000-00FF, U+0131',
      },
      {
        family: fontCssFamily('f1'),
        url: new URL(urls[1] ?? '', base).href,
        format: 'truetype',
        weight: '400',
        style: 'italic',
        unicodeRange: null,
      },
    ])
  })
})

describe('addFontFiles', () => {
  it('stores the files as one font, each with its own weight and style', async () => {
    const validate = vi.fn(accept)
    const regular = ttf('Literata[wght].ttf', { tables: variableTables(['wght', 200, 900]) })
    const boldItalic = new File(
      [woff({ names: longNames('Literata'), weight: 700, italic: true }).bytes],
      'Literata-BoldItalic.woff',
    )
    const font = await addFontFiles([regular, boldItalic], { validate })
    expect(font).toMatchObject({
      family: 'Literata',
      source: 'Literata[wght].ttf, Literata-BoldItalic.woff',
    })
    const describeFiles = (stored: Font | undefined) =>
      stored?.files.map(({ data, format, weight, style, unicodeRange }) => ({
        size: data.size,
        format,
        weight,
        style,
        unicodeRange,
      }))
    const expected = [
      {
        size: regular.size,
        format: 'truetype',
        weight: '200 900',
        style: 'normal',
        unicodeRange: null,
      },
      {
        size: boldItalic.size,
        format: 'woff',
        weight: '700',
        style: 'italic',
        unicodeRange: null,
      },
    ]
    expect(describeFiles(font)).toEqual(expected)
    expect(describeFiles(await db.fonts.get(font.id))).toEqual(expected)
    expect(validate.mock.calls.map(([file]) => file)).toEqual([regular, boldItalic])
  })

  it('names and places WOFF2 files by their file names, which is all they give', async () => {
    const files = [
      new File([woff2()], 'Source_Serif-Regular.woff2'),
      new File([woff2()], 'Source_Serif-SemiBoldItalic.woff2'),
      new File([woff2()], 'Source_Serif-Italic.woff2'),
      new File([woff2()], 'Source_Serif.woff2'),
    ]
    const font = await addFontFiles(files, { validate: accept })
    expect(font.family).toBe('Source Serif')
    expect(font.files.map(({ weight, style }) => [weight, style])).toEqual([
      ['400', 'normal'],
      ['600', 'italic'],
      ['400', 'italic'],
      ['400', 'normal'],
    ])
  })

  it('refuses a name already in the library, whatever its case, until that font is removed', async () => {
    const first = await addFontFiles([ttf('a.ttf', { names: [windowsName(1, 'Literata')] })], {
      validate: accept,
    })
    const validate = vi.fn(accept)
    const same = ttf('b.ttf', { names: [windowsName(1, 'LITERATA')] })
    expect((await refusal(addFontFiles([same], { validate }))).message).toMatch(
      /“Literata” is already in your library/,
    )
    expect(validate).not.toHaveBeenCalled()
    expect(await db.fonts.count()).toBe(1)
    await removeFont(first.id)
    expect((await addFontFiles([same], { validate })).family).toBe('LITERATA')
  })

  it('refuses files it cannot use and stores nothing', async () => {
    const good = ttf('Good.ttf')
    const cases: [File[], RegExp][] = [
      [[], /No font files/],
      [[good, new File([ascii('ttcf\0\x02\0\0')], 'Pair.ttc')], /\.ttc/],
      [[good, new File(['<svg/>'], 'logo.svg')], /“logo.svg” isn’t a font/],
    ]
    for (const [files, message] of cases) {
      expect((await refusal(addFontFiles(files, { validate: accept }))).message).toMatch(message)
    }
    const damaged = async () => {
      throw new FontImportError('It couldn’t be read as a font.')
    }
    await refusal(addFontFiles([good], { validate: damaged }))
    expect(await db.fonts.count()).toBe(0)
  })

  it('refuses a file over 32 MB', async () => {
    const huge = new File([sfnt(), new Uint8Array(32 * MiB)], 'Huge.ttf')
    const error = await refusal(addFontFiles([huge], { validate: accept }))
    expect(error.message).toMatch(/“Huge.ttf” is too large/)
    expect(await db.fonts.count()).toBe(0)
  })

  it('says so when the browser has no storage space left', async () => {
    const full = new DOMException('The quota has been exceeded.', 'QuotaExceededError')
    // Refused as the write is made, or as the transaction commits, which aborts it.
    for (const refused of [full, new Dexie.AbortError('Transaction aborted', full)]) {
      vi.spyOn(db.fonts, 'bulkAdd').mockRejectedValueOnce(refused)
      const error = await refusal(addFontFiles([ttf('Good.ttf')], { validate: accept }))
      expect(error.message).toMatch(/run out of storage space/)
    }
  })
})

type Route = () => Response

/** A fetch that answers the given URLs and 404s the rest. */
function stubFetch(routes: Record<string, Route>) {
  const table = new Map(Object.entries(routes))
  return vi.fn(
    async (input: RequestInfo | URL, _init?: RequestInit) =>
      table.get(String(input))?.() ?? new Response('', { status: 404 }),
  )
}

const css =
  (text: string): Route =>
  () =>
    new Response(text, { headers: { 'content-type': 'text/css; charset=utf-8' } })

const file =
  (bytes: Uint8Array<ArrayBuffer>, type = 'font/woff2'): Route =>
  () =>
    new Response(bytes, { headers: { 'content-type': type } })

/** A font file that goes on for `chunks` MiB, counting how much of it was asked for. */
function endlessFont(chunks: number) {
  const reads = { count: 0 }
  const zeros = new Uint8Array(MiB)
  const route: Route = () =>
    new Response(
      new ReadableStream<Uint8Array>({
        pull(controller) {
          reads.count++
          if (reads.count === 1) controller.enqueue(sfnt())
          else if (reads.count <= chunks) controller.enqueue(zeros)
          else controller.close()
        },
      }),
      { headers: { 'content-type': 'font/ttf' } },
    )
  return { route, reads }
}

describe('addFontFromUrl', () => {
  it('adds one font per family in a stylesheet, downloading each file once', async () => {
    const stylesheet = 'https://fonts.example/css2?family=Noto+Serif+JP&family=Literata'
    const slices = [0, 1, 2].map(
      (i) => `@font-face {
        font-family: 'Noto Serif JP';
        src: url(./jp/${i}.woff2) format('woff2');
        unicode-range: U+${i}000-${i}FFF;
      }`,
    )
    const sheet = `${slices.join('\n')}
      @font-face { font-family: Literata; font-weight: 400; src: url(/literata.woff2); }
      @font-face { font-family: Literata; font-weight: 700; src: url(/literata.woff2); }
      @font-face { font-family: Literata; font-style: italic; src: url(/literata-italic.woff2); }
    `
    const fetch = stubFetch({
      [stylesheet]: css(sheet),
      'https://fonts.example/jp/0.woff2': file(woff2()),
      'https://fonts.example/jp/1.woff2': file(woff2()),
      'https://fonts.example/jp/2.woff2': file(woff2()),
      // A TrueType file served under a WOFF2 name is stored as what it is.
      'https://fonts.example/literata.woff2': file(sfnt()),
      'https://fonts.example/literata-italic.woff2': file(woff2()),
    })
    const validate = vi.fn(accept)
    const progress: [number, number][] = []
    const fonts = await addFontFromUrl(stylesheet, {
      fetch,
      validate,
      onProgress: (done, total) => progress.push([done, total]),
    })
    expect(fonts.map(({ family, source }) => ({ family, source }))).toEqual([
      { family: 'Noto Serif JP', source: stylesheet },
      { family: 'Literata', source: stylesheet },
    ])
    expect(fonts[0]?.files.map(({ unicodeRange }) => unicodeRange)).toEqual([
      'U+0000-0FFF',
      'U+1000-1FFF',
      'U+2000-2FFF',
    ])
    expect(fonts[1]?.files.map(({ format, weight, style }) => [format, weight, style])).toEqual([
      ['truetype', '400', 'normal'],
      ['truetype', '700', 'normal'],
      ['woff2', '400', 'italic'],
    ])
    expect(fetch).toHaveBeenCalledTimes(6)
    expect(validate).toHaveBeenCalledTimes(5)
    expect(progress[0]).toEqual([0, 5])
    expect(progress.at(-1)).toEqual([5, 5])
    expect(await db.fonts.count()).toBe(2)
  })

  it('adds a linked font file under the name inside it, whatever its content type', async () => {
    const url = 'https://raw.example/fonts/Literata-Regular.ttf'
    const bytes = sfnt({ names: [windowsName(1, 'Literata')] })
    const fetch = stubFetch({ [url]: file(bytes, 'text/plain; charset=utf-8') })
    const fonts = await addFontFromUrl(url, { fetch, validate: accept })
    expect(fonts).toMatchObject([
      { family: 'Literata', source: url, files: [{ format: 'truetype' }] },
    ])
    expect(await db.fonts.count()).toBe(1)
  })

  it('explains a download the site blocked or failed', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const blocked = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })
    const url = 'https://fonts.example/a.woff2'
    expect((await refusal(addFontFromUrl(url, { fetch: blocked }))).message).toMatch(
      /didn’t allow Carrel to download it/,
    )
    expect((await refusal(addFontFromUrl(url, { fetch: stubFetch({}) }))).message).toMatch(/404/)
    // Offline, the failure is the connection's, not the site's.
    vi.stubGlobal('navigator', { onLine: false })
    expect((await refusal(addFontFromUrl(url, { fetch: blocked }))).message).toMatch(/offline/)
    vi.unstubAllGlobals()
  })

  it('explains a link that leads to no font', async () => {
    const page = 'https://fonts.example/specimen/Literata'
    const empty = 'https://fonts.example/empty.css'
    const insecure = 'https://fonts.example/insecure.css'
    const fetch = stubFetch({
      [page]: () => new Response('<!doctype html><title>Literata</title>'),
      [empty]: css('@font-face { font-family: A; src: local(A); } body { color: red }'),
      [insecure]: css('@font-face { font-family: A; src: url(http://fonts.example/a.woff2); }'),
    })
    const options = { fetch, validate: accept }
    expect((await refusal(addFontFromUrl(page, options))).message).toMatch(/doesn’t lead to a font/)
    expect((await refusal(addFontFromUrl(empty, options))).message).toMatch(/any fonts/)
    expect((await refusal(addFontFromUrl(insecure, options))).message).toMatch(/https/)
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it('refuses a link that is not https without fetching it', async () => {
    const fetch = stubFetch({})
    for (const link of ['http://fonts.example/a.woff2', 'fonts.example/a.woff2', 'file:///a.ttf']) {
      await refusal(addFontFromUrl(link, { fetch }))
    }
    expect(fetch).not.toHaveBeenCalled()
  })

  it('stops reading a font file past 32 MB and stores nothing', async () => {
    const { route, reads } = endlessFont(48)
    const url = 'https://fonts.example/Huge.ttf'
    const fetch = stubFetch({ [url]: route })
    const error = await refusal(addFontFromUrl(url, { fetch, validate: accept }))
    expect(error.message).toMatch(/“Huge.ttf” is too large/)
    expect(reads.count).toBeLessThan(40)
    expect(await db.fonts.count()).toBe(0)
  })

  it('refuses a stylesheet over 2 MB', async () => {
    const rule = '@font-face { font-family: A; src: url(a.woff2); }\n'
    const url = 'https://fonts.example/huge.css'
    const fetch = stubFetch({
      [url]: css(rule.repeat(Math.ceil((2 * MiB) / rule.length) + 1)),
      'https://fonts.example/a.woff2': file(woff2()),
    })
    const error = await refusal(addFontFromUrl(url, { fetch, validate: accept }))
    expect(error.message).toMatch(/stylesheet is too large/)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('refuses a stylesheet with a font file over 32 MB, storing none of its fonts', async () => {
    const url = 'https://fonts.example/fonts.css'
    const fetch = stubFetch({
      [url]: css(
        '@font-face { font-family: A; src: url(small.woff2); } ' +
          '@font-face { font-family: B; src: url(big.woff2); }',
      ),
      'https://fonts.example/small.woff2': file(woff2()),
      'https://fonts.example/big.woff2': endlessFont(48).route,
    })
    const error = await refusal(addFontFromUrl(url, { fetch, validate: accept }))
    expect(error.message).toMatch(/“big.woff2” is too large/)
    expect(await db.fonts.count()).toBe(0)
  })

  it('refuses a family already in the library before downloading any file', async () => {
    await addFontFiles([ttf('l.ttf', { names: [windowsName(1, 'Literata')] })], {
      validate: accept,
    })
    const url = 'https://fonts.example/fonts.css'
    const fetch = stubFetch({
      [url]: css(
        '@font-face { font-family: Alpha; src: url(a.woff2); } ' +
          '@font-face { font-family: literata; src: url(b.woff2); }',
      ),
      'https://fonts.example/a.woff2': file(woff2()),
      'https://fonts.example/b.woff2': file(woff2()),
    })
    const error = await refusal(addFontFromUrl(url, { fetch, validate: accept }))
    expect(error.message).toMatch(/already in your library/)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(await db.fonts.count()).toBe(1)
  })

  it('refuses a stylesheet of more than 1,000 font files before downloading them', async () => {
    const url = 'https://fonts.example/fonts.css'
    const rules = Array.from(
      { length: 1001 },
      (_, i) => `@font-face { font-family: A; src: url(${i}.woff2); }`,
    )
    const fetch = stubFetch({ [url]: css(rules.join('\n')) })
    const error = await refusal(addFontFromUrl(url, { fetch, validate: accept }))
    expect(error.message).toMatch(/1001 font files/)
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
