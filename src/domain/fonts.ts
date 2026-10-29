/**
 * Fonts the reader adds for reading books in: font files picked from disk, or downloaded from a
 * link to a font file or to a stylesheet of @font-face rules such as Google Fonts serves.
 *
 * Font files and stylesheets come from anywhere, so every read here is bounded by the bytes that
 * arrived, and a malformed font yields missing metadata or a FontImportError, never an exception
 * from inside a parser.
 */

import { db, type Font, type FontFile } from '@/domain/db'
import { newId } from '@/domain/ids'
import { isQuotaError, storageFullMessage } from '@/domain/library'

type FontFormat = FontFile['format']

/** A font that cannot be added, with the reason worded for the reader. */
export class FontImportError extends Error {
  override name = 'FontImportError'
}

const MiB = 1024 * 1024
/** Larger than any real font file, CJK fonts included. */
export const fontFileLimit = 32 * MiB
/** The @font-face rules of a CJK family split into hundreds of slices fit in a few hundred KB. */
const stylesheetLimit = 2 * MiB
const stylesheetFileLimit = 1000
/** Font files fetched at once for a stylesheet: enough to hide latency, not enough to flood. */
const downloadConcurrency = 4

const collectionMessage =
  'Font collections (.ttc) aren’t supported. Add the individual .ttf or .otf files instead.'
const blockedMessage =
  'The site didn’t allow Carrel to download it. Use a link from Google Fonts, jsDelivr or cdnjs, ' +
  'or download the file and add it.'
const notFontOrStylesheetMessage = 'The link doesn’t lead to a font file or a font stylesheet.'
const offlineMessage = 'You’re offline. Connect to the internet and try again.'

/** How a message refers to a file: by its name when it has one. */
const subject = (file: Blob) => (file instanceof File && file.name ? `“${file.name}”` : 'It')

const notAFont = (file: Blob) =>
  new FontImportError(`${subject(file)} isn’t a font file Carrel can use: TTF, OTF, WOFF or WOFF2.`)

const tooLarge = (name: string) =>
  new FontImportError(`“${name}” is too large: a font file can be at most 32 MB.`)

const normalizeSpace = (text: string) => text.replace(/\s+/g, ' ').trim()

const viewOf = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

const tagAt = (bytes: Uint8Array, offset: number) =>
  String.fromCharCode(...bytes.subarray(offset, offset + 4))

const signatures = new Map<string, FontFormat | 'collection'>([
  ['wOF2', 'woff2'],
  ['wOFF', 'woff'],
  [String.fromCharCode(0, 1, 0, 0), 'truetype'],
  ['true', 'truetype'],
  ['OTTO', 'opentype'],
  ['ttcf', 'collection'],
])

/** Tells a font file's format from its first four bytes; null when they are not a font's. */
export function detectFontFormat(bytes: Uint8Array): FontFormat | 'collection' | null {
  return bytes.length < 4 ? null : (signatures.get(tagAt(bytes, 0)) ?? null)
}

export interface FontMetadata {
  /** The font's family name, or null when it names none that can be read. */
  family: string | null
  /**
   * The CSS font-weight descriptor the file covers: the range of a variable font's weight axis,
   * such as '200 900', else its OS/2 weight class, such as '700'. Null when it states neither.
   */
  weight: string | null
  italic: boolean
  format: FontFormat
}

/** The only tables the metadata comes from; the rest of a font is never inflated or copied. */
const metadataTables = new Set(['name', 'OS/2', 'fvar'])
/**
 * Largest metadata table inflated. A name table reaches its strings through 16-bit offsets, so
 * nothing it can use lies past 1 MB; OS/2 is about 100 bytes and fvar a few KB. A WOFF table
 * stating more would only inflate into memory for nothing.
 */
const metadataTableLimit = MiB

/** The tables of a TrueType or OpenType file that lie wholly inside it. */
function sfntTables(bytes: Uint8Array): Map<string, Uint8Array> {
  const tables = new Map<string, Uint8Array>()
  if (bytes.length < 12) return tables
  const view = viewOf(bytes)
  const count = view.getUint16(4)
  for (let record = 12; record < 12 + 16 * count && record + 16 <= bytes.length; record += 16) {
    const tag = tagAt(bytes, record)
    const offset = view.getUint32(record + 8)
    const length = view.getUint32(record + 12)
    if (metadataTables.has(tag) && offset + length <= bytes.length) {
      tables.set(tag, bytes.subarray(offset, offset + length))
    }
  }
  return tables
}

/** The tables of a WOFF 1.0 file that lie wholly inside it, inflated where they are deflated. */
async function woffTables(bytes: Uint8Array<ArrayBuffer>): Promise<Map<string, Uint8Array>> {
  const tables = new Map<string, Uint8Array>()
  if (bytes.length < 44) return tables
  const view = viewOf(bytes)
  const count = view.getUint16(12)
  for (let record = 44; record < 44 + 20 * count && record + 20 <= bytes.length; record += 20) {
    const tag = tagAt(bytes, record)
    const offset = view.getUint32(record + 4)
    const storedLength = view.getUint32(record + 8)
    const length = view.getUint32(record + 12)
    const usable = offset + storedLength <= bytes.length && length <= metadataTableLimit
    if (!metadataTables.has(tag) || !usable) continue
    const stored = bytes.subarray(offset, offset + storedLength)
    const table = storedLength < length ? await inflate(stored, length) : stored
    if (table) tables.set(tag, table)
  }
  return tables
}

/** Inflates a zlib stream that should come to `length` bytes; null when it is damaged or longer. */
async function inflate(
  compressed: Uint8Array<ArrayBuffer>,
  length: number,
): Promise<Uint8Array | null> {
  try {
    const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate'))
    const { bytes, complete } = await readLimited(stream, length)
    return complete ? bytes : null
  } catch (error) {
    // A damaged table is read as missing. Whether the font is usable at all is for the
    // browser's own check to decide, not the metadata.
    console.warn('could not inflate a WOFF table', error)
    return null
  }
}

/**
 * Orders the name records that can hold the family name: the typographic family (16) over the
 * legacy family (1), which splits a family into groups of four styles; then Windows records in
 * US English, other Windows records, then Mac Roman ones. Null for every other record.
 */
function familyRank(platform: number, encoding: number, language: number, nameId: number) {
  if (nameId !== 16 && nameId !== 1) return null
  let rank: number
  // Windows encodings 0, 1 and 10 are UTF-16BE; the others are East Asian legacy encodings.
  if (platform === 3 && (encoding === 0 || encoding === 1 || encoding === 10)) {
    rank = language === 0x0409 ? 0 : 1
  } else if (platform === 1 && encoding === 0) {
    rank = language === 0 ? 2 : 3
  } else {
    return null
  }
  return nameId === 16 ? rank : rank + 4
}

function familyFromNameTable(table: Uint8Array | undefined): string | null {
  if (!table || table.length < 6) return null
  const view = viewOf(table)
  const count = view.getUint16(2)
  const storage = view.getUint16(4)
  const candidates: { rank: number; text: Uint8Array; utf16: boolean }[] = []
  for (let record = 6; record < 6 + 12 * count && record + 12 <= table.length; record += 12) {
    const platform = view.getUint16(record)
    const rank = familyRank(
      platform,
      view.getUint16(record + 2),
      view.getUint16(record + 4),
      view.getUint16(record + 6),
    )
    const length = view.getUint16(record + 8)
    const offset = storage + view.getUint16(record + 10)
    if (rank !== null && offset + length <= table.length) {
      candidates.push({
        rank,
        text: table.subarray(offset, offset + length),
        utf16: platform === 3,
      })
    }
  }
  candidates.sort((a, b) => a.rank - b.rank)
  for (const { text, utf16 } of candidates) {
    // Mac Roman and Latin-1 agree on ASCII, which is what family names are written in.
    const decoded = utf16
      ? new TextDecoder('utf-16be').decode(text)
      : Array.from(text, (byte) => String.fromCharCode(byte)).join('')
    const family = normalizeSpace(decoded.replaceAll('\0', ''))
    if (family) return family
  }
  return null
}

function weightClass(os2: Uint8Array | undefined): string | null {
  if (!os2 || os2.length < 6) return null
  const weight = viewOf(os2).getUint16(4)
  return weight >= 1 && weight <= 1000 ? String(weight) : null
}

/**
 * The range of a variable font's weight axis, as a CSS font-weight range. The OS/2 weight class
 * names only the default instance, and a rule declaring that alone makes the browser fake bold
 * rather than move along the axis.
 */
function weightAxis(fvar: Uint8Array | undefined): string | null {
  if (!fvar || fvar.length < 16) return null
  const view = viewOf(fvar)
  const axes = view.getUint16(4)
  const count = view.getUint16(8)
  const size = view.getUint16(10)
  if (size < 16) return null
  for (let axis = axes; axis < axes + size * count && axis + 16 <= fvar.length; axis += size) {
    if (tagAt(fvar, axis) !== 'wght') continue
    // Axis values are 16.16 fixed-point numbers.
    const min = view.getInt32(axis + 4) / 0x10000
    const max = view.getInt32(axis + 12) / 0x10000
    if (!(min >= 1 && min < max && max <= 1000)) return null
    const number = (value: number) => String(Math.round(value * 100) / 100)
    return `${number(min)} ${number(max)}`
  }
  return null
}

/** fsSelection bit 0 marks an italic face. */
const isItalic = (os2: Uint8Array | undefined) =>
  os2 !== undefined && os2.length >= 64 && (viewOf(os2).getUint16(62) & 1) === 1

/**
 * Reads a font file's family name, weight and slant, so a picked file can be named and placed
 * without asking the reader. WOFF2 tables are Brotli-compressed, which browsers do not expose
 * to scripts, so a WOFF2 file yields its format alone. Throws FontImportError for a font
 * collection and for anything that is not a font file.
 */
export async function readFontMetadata(data: Blob): Promise<FontMetadata> {
  return metadataOf(new Uint8Array(await data.arrayBuffer()), data)
}

async function metadataOf(bytes: Uint8Array<ArrayBuffer>, data: Blob): Promise<FontMetadata> {
  const format = detectFontFormat(bytes)
  if (format === 'collection') throw new FontImportError(collectionMessage)
  if (format === null) throw notAFont(data)
  if (format === 'woff2') return { family: null, weight: null, italic: false, format }
  const tables = format === 'woff' ? await woffTables(bytes) : sfntTables(bytes)
  const os2 = tables.get('OS/2')
  return {
    family: familyFromNameTable(tables.get('name')),
    weight: weightAxis(tables.get('fvar')) ?? weightClass(os2),
    italic: isItalic(os2),
    format,
  }
}

/** One font file named by an @font-face rule, with the descriptors that place it. */
export interface FontFaceSource {
  family: string
  url: URL
  /** The format the rule declares, or the one its file extension implies. */
  format: FontFormat
  weight: string
  style: string
  unicodeRange: string | null
}

const commentOrString = /("(?:[^"\\]|\\[\s\S])*"|'(?:[^'\\]|\\[\s\S])*')|\/\*[\s\S]*?(?:\*\/|$)/g

/** Replaces comments with a space, leaving alone a comment marker inside a string. */
const stripComments = (css: string) =>
  css.replace(commentOrString, (_comment, string?: string) => string ?? ' ')

const fontFaceTokens = /"(?:[^"\\]|\\[\s\S])*"|'(?:[^'\\]|\\[\s\S])*'|@font-face(?![\w-])|[{};]/gi

/** The text between the braces of each @font-face rule, wherever it is nested. */
function fontFaceBodies(css: string): string[] {
  const bodies: string[] = []
  let state: 'outside' | 'prelude' | 'inside' = 'outside'
  let start = 0
  let depth = 0
  for (const match of css.matchAll(fontFaceTokens)) {
    const token = match[0]
    if (state === 'outside') {
      if (token.startsWith('@')) state = 'prelude'
    } else if (state === 'prelude') {
      if (token === '{') {
        state = 'inside'
        start = match.index + 1
        depth = 0
      } else if (!token.startsWith('@')) {
        state = 'outside'
      }
    } else if (token === '{') {
      depth++
    } else if (token === '}') {
      if (depth > 0) {
        depth--
      } else {
        bodies.push(css.slice(start, match.index))
        state = 'outside'
      }
    }
  }
  return bodies
}

/** Splits at `separator` where it stands outside strings and parentheses. */
function splitTopLevel(text: string, separator: ',' | ';'): string[] {
  const parts: string[] = []
  let quote = ''
  let depth = 0
  let start = 0
  for (let i = 0; i < text.length; i++) {
    const char = text.charAt(i)
    if (quote) {
      if (char === '\\') i++
      else if (char === quote) quote = ''
    } else if (char === '"' || char === "'") {
      quote = char
    } else if (char === '(') {
      depth++
    } else if (char === ')') {
      depth = Math.max(0, depth - 1)
    } else if (char === separator && depth === 0) {
      parts.push(text.slice(start, i))
      start = i + 1
    }
  }
  parts.push(text.slice(start))
  return parts
}

const unescapeCss = (text: string) =>
  text.replace(/\\(?:([\da-fA-F]{1,6})\s?|([\s\S]))/g, (_escape, hex?: string, char?: string) => {
    if (hex === undefined) return char === '\n' ? '' : (char ?? '')
    const code = Number.parseInt(hex, 16)
    const valid = code > 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff)
    return valid ? String.fromCodePoint(code) : '\uFFFD'
  })

/** A CSS string's content, or an unquoted token, with its escapes resolved. */
function unquote(text: string): string {
  const quoted = /^(["'])([\s\S]*)\1$/.exec(text)
  return unescapeCss(quoted ? (quoted[2] ?? '') : text)
}

const formatHints = new Map<string, FontFormat>([
  ['woff2', 'woff2'],
  ['woff2-variations', 'woff2'],
  ['woff', 'woff'],
  ['woff-variations', 'woff'],
  ['opentype', 'opentype'],
  ['opentype-variations', 'opentype'],
  ['truetype', 'truetype'],
  ['truetype-variations', 'truetype'],
])

const extensionFormats = new Map<string, FontFormat>([
  ['woff2', 'woff2'],
  ['woff', 'woff'],
  ['otf', 'opentype'],
  ['ttf', 'truetype'],
])

/** The order sources are preferred in: smallest files first. */
const formatPreference: readonly FontFormat[] = ['woff2', 'woff', 'opentype', 'truetype']

const sourceFunction =
  /\s*([\w-]+)\(((?:"(?:[^"\\]|\\[\s\S])*"|'(?:[^'\\]|\\[\s\S])*'|[^"')])*)\)\s*/y

/**
 * One entry of a `src` list, such as `url(a.woff2) format("woff2") tech(variations)`. Null for
 * local() and for a file in a format Carrel cannot use (EOT, SVG) or cannot tell.
 */
function parseSource(entry: string, base: URL): { url: URL; format: FontFormat } | null {
  const calls: [name: string, argument: string][] = []
  for (let position = 0; position < entry.length; position = sourceFunction.lastIndex) {
    sourceFunction.lastIndex = position
    const match = sourceFunction.exec(entry)
    if (!match) return null
    calls.push([(match[1] ?? '').toLowerCase(), (match[2] ?? '').trim()])
  }
  const [first, ...hints] = calls
  if (first?.[0] !== 'url') return null
  const href = unquote(first[1])
  if (!href || !URL.canParse(href, base)) return null
  const url = new URL(href, base)
  const hint = hints.find(([name]) => name === 'format')
  let format: FontFormat | undefined
  if (hint) {
    for (const option of splitTopLevel(hint[1], ',')) {
      format ??= formatHints.get(unquote(option.trim()).toLowerCase())
    }
  } else {
    const extension = /\.(\w+)$/.exec(url.pathname)?.[1]?.toLowerCase()
    format = extension === undefined ? undefined : extensionFormats.get(extension)
  }
  return format ? { url, format } : null
}

function bestSource(src: string, base: URL): { url: URL; format: FontFormat } | null {
  let best: { url: URL; format: FontFormat } | null = null
  for (const entry of splitTopLevel(src, ',')) {
    const source = parseSource(entry.trim(), base)
    const better =
      source !== null &&
      (best === null ||
        formatPreference.indexOf(source.format) < formatPreference.indexOf(best.format))
    if (better) best = source
  }
  return best
}

/** An @font-face family descriptor names exactly one family, quoted or not. */
function familyOf(value: string | undefined): string | null {
  if (value === undefined || splitTopLevel(value, ',').length !== 1) return null
  return normalizeSpace(unquote(value)) || null
}

const weightValue = String.raw`(?:normal|bold|\d+(?:\.\d+)?)`
const weightPattern = new RegExp(`^${weightValue}(?: ${weightValue})?$`, 'i')
const stylePattern = /^(?:normal|italic|oblique(?: -?\d+(?:\.\d+)?(?:deg|grad|rad|turn)){0,2})$/i
const rangeValue = String.raw`u\+[\da-f?]{1,6}(?:-[\da-f]{1,6})?`
const unicodeRangePattern = new RegExp(`^${rangeValue}(?: ?, ?${rangeValue})*$`, 'i')

/**
 * A descriptor's value with its whitespace normalised; null when it is absent or malformed, so
 * that a browser would ignore it too. The values are written into rules of Carrel's own later,
 * which is why only the expected shapes get through.
 */
function descriptor(value: string | undefined, pattern: RegExp): string | null {
  if (value === undefined) return null
  const normalized = normalizeSpace(value)
  return pattern.test(normalized) ? normalized : null
}

/**
 * Lists the font files a stylesheet's @font-face rules name, with relative URLs resolved
 * against `base`. Each rule contributes its best source (WOFF2 over WOFF over OpenType over
 * TrueType); a rule with no family or no source Carrel can use is left out.
 */
export function parseFontFaceCss(css: string, base: URL): FontFaceSource[] {
  const sources: FontFaceSource[] = []
  for (const body of fontFaceBodies(stripComments(css))) {
    const descriptors = new Map<string, string>()
    for (const declaration of splitTopLevel(body, ';')) {
      const colon = declaration.indexOf(':')
      if (colon > 0) {
        const name = declaration.slice(0, colon).trim().toLowerCase()
        descriptors.set(name, declaration.slice(colon + 1).trim())
      }
    }
    const family = familyOf(descriptors.get('font-family'))
    const source = bestSource(descriptors.get('src') ?? '', base)
    if (!family || !source) continue
    sources.push({
      family,
      ...source,
      weight: descriptor(descriptors.get('font-weight'), weightPattern) ?? '400',
      style: descriptor(descriptors.get('font-style'), stylePattern) ?? 'normal',
      unicodeRange: descriptor(descriptors.get('unicode-range'), unicodeRangePattern),
    })
  }
  return sources
}

/**
 * The CSS family name a book is styled with to use an added font. It is derived from the id,
 * not the reader's name for the font, so it can never match a system font's name.
 */
export const fontCssFamily = (id: string): string => `carrel-font-${id}`

/** A CSS string literal, with every character that could end the string or the rule escaped. */
export function cssString(text: string): string {
  let escaped = ''
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0
    const unsafe = char === '"' || char === '\\' || code < 0x20 || code === 0x7f
    escaped += unsafe ? `\\${code.toString(16)} ` : char
  }
  return `"${escaped}"`
}

/** The @font-face rules that make a font available under its `fontCssFamily` name. */
export function fontFaceRules(font: Font, urlFor: (file: FontFile) => string): string {
  const family = cssString(fontCssFamily(font.id))
  return font.files
    .map((file) => {
      const descriptors = [
        `font-family: ${family}`,
        `src: url(${cssString(urlFor(file))}) format(${cssString(file.format)})`,
        `font-weight: ${file.weight}`,
        `font-style: ${file.style}`,
        ...(file.unicodeRange ? [`unicode-range: ${file.unicodeRange}`] : []),
        'font-display: swap',
      ]
      return `@font-face { ${descriptors.join('; ')}; }`
    })
    .join('\n')
}

/** Throws FontImportError when the browser cannot use a file, given with its bytes. */
type Validate = (file: Blob, bytes: Uint8Array<ArrayBuffer>) => Promise<void>

export interface AddFontOptions {
  /** Defaults to loading the file. */
  validate?: Validate
}

/** Loads the file as the browser would for a book, which finds damage the metadata cannot. */
async function loadsInBrowser(file: Blob, bytes: Uint8Array<ArrayBuffer>): Promise<void> {
  const face = new FontFace('carrel-probe', bytes)
  try {
    await face.load()
  } catch (error) {
    console.warn('font did not load', error)
    throw new FontImportError(
      `${subject(file)} couldn’t be read as a font. The file may be damaged.`,
    )
  }
}

/** The library's font with this family name, ignoring case as CSS does. */
export const fontNamed = (family: string): Promise<Font | undefined> =>
  db.fonts.where('family').equalsIgnoreCase(family).first()

/** Refuses a family name the library already has. */
async function assertFamilyFree(family: string): Promise<void> {
  const existing = await fontNamed(family)
  if (existing) {
    throw new FontImportError(
      `A font named “${existing.family}” is already in your library. Remove it to add this one.`,
    )
  }
}

/** Stores fonts unless one of their names was taken since it was last checked. */
async function storeFonts(fonts: Font[]): Promise<void> {
  try {
    await db.transaction('rw', db.fonts, async () => {
      for (const font of fonts) await assertFamilyFree(font.family)
      await db.fonts.bulkAdd(fonts)
    })
  } catch (error) {
    if (!isQuotaError(error)) throw error
    throw new FontImportError(storageFullMessage)
  }
}

/** The weights that style names in file names stand for, as CSS numbers them. */
const styleWeights: [RegExp, string][] = [
  [/^(?:thin|hairline)$/i, '100'],
  [/^(?:extra|ultra)-?light$/i, '200'],
  [/^light$/i, '300'],
  [/^(?:regular|normal|book)$/i, '400'],
  [/^medium$/i, '500'],
  [/^(?:semi|demi)-?bold$/i, '600'],
  [/^bold$/i, '700'],
  [/^(?:extra|ultra)-?bold$/i, '800'],
  [/^(?:black|heavy)$/i, '900'],
]
const styleWord = styleWeights.map(([word]) => word.source.slice(1, -1)).join('|')
const styleSuffix = new RegExp(
  `[-_ ]+(?:(${styleWord})(?:[-_ ]?(italic|oblique))?|(italic|oblique))$`,
  'i',
)

/**
 * The weight and slant a file name gives, as `Literata-SemiBoldItalic.woff2` does: for files
 * whose own tables can't be read (WOFF2), so a family's files don't all come out regular.
 */
function styleFromFileName(name: string): { weight: string | null; italic: boolean } {
  const match = styleSuffix.exec(name.replace(/\.[^.]*$/, ''))
  if (!match) return { weight: null, italic: false }
  const [, word, slant, slantAlone] = match
  const weight = word ? (styleWeights.find(([pattern]) => pattern.test(word))?.[1] ?? null) : null
  return { weight, italic: Boolean(slant || slantAlone) }
}

/** A family name from a file name such as `Literata-BoldItalic.ttf`, for fonts that give none. */
function familyFromFileName(name: string): string {
  const stem = name.replace(/\.[^.]*$/, '')
  return (
    normalizeSpace(stem.replace(styleSuffix, '').replace(/[-_]+/g, ' ')) ||
    normalizeSpace(stem) ||
    'Untitled font'
  )
}

async function addFiles(
  files: readonly File[],
  source: string,
  { validate = loadsInBrowser }: AddFontOptions,
): Promise<Font> {
  const [first] = files
  if (!first) throw new FontImportError('No font files were chosen.')
  for (const file of files) if (file.size > fontFileLimit) throw tooLarge(file.name)
  // Each file is read once, for its metadata and to load it, and let go before the next.
  const read: { file: File; metadata: FontMetadata }[] = []
  const name = await (async () => {
    const bytes = new Uint8Array(await first.arrayBuffer())
    const metadata = await metadataOf(bytes, first)
    const family = metadata.family || familyFromFileName(first.name)
    // Before any file is loaded, the slowest step.
    await assertFamilyFree(family)
    await validate(first, bytes)
    read.push({ file: first, metadata })
    return family
  })()
  for (const file of files.slice(1)) {
    const bytes = new Uint8Array(await file.arrayBuffer())
    const metadata = await metadataOf(bytes, file)
    await validate(file, bytes)
    read.push({ file, metadata })
  }
  const font: Font = {
    id: newId(),
    family: name,
    source,
    addedAt: Date.now(),
    files: read.map(({ file, metadata }) => {
      // A WOFF2 file says nothing of itself that can be read here; its name says the rest.
      const named = metadata.format === 'woff2' ? styleFromFileName(file.name) : null
      return {
        data: file,
        format: metadata.format,
        weight: metadata.weight ?? named?.weight ?? '400',
        style: metadata.italic || named?.italic ? 'italic' : 'normal',
        unicodeRange: null,
      }
    }),
  }
  await storeFonts([font])
  return font
}

/**
 * Adds font files to the library as one font, such as the regular, bold and italic files of a
 * family. Each file's weight and style come from the file itself. Throws FontImportError when
 * a file cannot be used or the font's name is already taken; nothing is stored then.
 */
export async function addFontFiles(
  files: readonly File[],
  options: AddFontOptions = {},
): Promise<Font> {
  return addFiles(files, files.map((file) => file.name).join(', '), options)
}

export interface AddFontFromUrlOptions extends AddFontOptions {
  /** Called as the font files of a stylesheet download, with the count done and the total. */
  onProgress?: (done: number, total: number) => void
  fetch?: typeof fetch
}

/**
 * Reads a stream until it ends or grows past `limit` bytes, whichever comes first. A function
 * limit is chosen from the first four bytes, so content can be sniffed before it is sized.
 */
async function readLimited(
  stream: ReadableStream<Uint8Array>,
  limit: number | ((head: Uint8Array) => number),
): Promise<{ bytes: Uint8Array<ArrayBuffer>; complete: boolean }> {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  let max = typeof limit === 'number' ? limit : undefined
  const concat = () => {
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    return bytes
  }
  for (;;) {
    const { done, value } = await reader.read()
    if (done) return { bytes: concat(), complete: true }
    chunks.push(value)
    size += value.byteLength
    if (max === undefined && size >= 4 && typeof limit === 'function') {
      max = limit(concat().subarray(0, 4))
    }
    if (max !== undefined && size > max) {
      await reader.cancel()
      return { bytes: concat(), complete: false }
    }
  }
}

interface Download {
  bytes: Uint8Array<ArrayBuffer>
  /** False when the body was cut off at the limit. */
  complete: boolean
  contentType: string
  /** Where the response came from after redirects, for resolving the URLs inside it. */
  url: URL
}

async function download(
  fetchFont: typeof fetch,
  url: URL,
  limit: number | ((head: Uint8Array) => number),
  signal?: AbortSignal,
): Promise<Download> {
  let response: Response
  try {
    response = await fetchFont(url.href, {
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal,
    })
  } catch (error) {
    // fetch rejects with a bare TypeError for every network failure. A site refusing
    // cross-origin requests is the likeliest one for a font link, and scripts are not told
    // which it was.
    if (!(error instanceof TypeError)) throw error
    console.warn(`could not download ${url.href}`, error)
    // Offline, every site fails the same way; that one the browser does say.
    if (globalThis.navigator?.onLine === false) throw new FontImportError(offlineMessage)
    throw new FontImportError(blockedMessage)
  }
  if (!response.ok) {
    throw new FontImportError(
      `The download failed: the site answered with error ${response.status}.`,
    )
  }
  let body: { bytes: Uint8Array<ArrayBuffer>; complete: boolean }
  try {
    body = response.body
      ? await readLimited(response.body, limit)
      : { bytes: new Uint8Array(0), complete: true }
  } catch (error) {
    if (!(error instanceof TypeError)) throw error
    console.warn(`download of ${url.href} broke off`, error)
    throw new FontImportError('The download was interrupted. Try again.')
  }
  return {
    ...body,
    contentType: response.headers.get('content-type') ?? '',
    url: response.url ? new URL(response.url) : url,
  }
}

/** The last segment of a URL's path, as a file name for messages and fallback names. */
function fileNameOf(url: URL): string {
  const segment = url.pathname.split('/').pop() ?? ''
  try {
    return decodeURIComponent(segment) || url.hostname
  } catch {
    // A malformed percent escape still names the file well enough as it is.
    return segment
  }
}

/** Downloads each URL once, a few at a time; stops and throws at the first failure. */
async function downloadFontFiles(
  urls: readonly URL[],
  fetchFont: typeof fetch,
  validate: Validate,
  onProgress?: (done: number, total: number) => void,
): Promise<Map<string, { data: File; format: FontFormat }>> {
  const files = new Map<string, { data: File; format: FontFormat }>()
  const controller = new AbortController()
  const failures: unknown[] = []
  const queue = urls.values()
  onProgress?.(0, urls.length)
  const work = async () => {
    for (const url of queue) {
      if (failures.length > 0) return
      try {
        const name = fileNameOf(url)
        const body = await download(fetchFont, url, fontFileLimit, controller.signal)
        if (!body.complete) throw tooLarge(name)
        const data = new File([body.bytes], name)
        const format = detectFontFormat(body.bytes)
        if (format === 'collection') throw new FontImportError(collectionMessage)
        if (format === null) throw notAFont(data)
        await validate(data, body.bytes)
        files.set(url.href, { data, format })
      } catch (error) {
        failures.push(error)
        controller.abort()
        return
      }
      onProgress?.(files.size, urls.length)
    }
  }
  await Promise.all(Array.from({ length: downloadConcurrency }, work))
  if (failures.length > 0) throw failures[0]
  return files
}

async function addFromStylesheet(
  css: string,
  location: URL,
  base: URL,
  isCss: boolean,
  fetchFont: typeof fetch,
  { validate = loadsInBrowser, onProgress }: AddFontFromUrlOptions,
): Promise<Font[]> {
  const sources = parseFontFaceCss(css, base)
  if (sources.length === 0) {
    throw new FontImportError(
      isCss
        ? 'The stylesheet doesn’t include any fonts Carrel can use.'
        : notFontOrStylesheetMessage,
    )
  }
  // Rules often share a file, as when a variable font is listed once per weight.
  const urls = [...new Map(sources.map(({ url }) => [url.href, url])).values()]
  if (urls.length > stylesheetFileLimit) {
    throw new FontImportError(
      `The stylesheet lists ${urls.length} font files; Carrel downloads at most 1,000.`,
    )
  }
  if (urls.some((url) => url.protocol !== 'https:')) {
    throw new FontImportError('The stylesheet links to fonts that aren’t on https addresses.')
  }
  const families = new Map<string, { family: string; sources: FontFaceSource[] }>()
  for (const source of sources) {
    const key = source.family.toLowerCase()
    const entry = families.get(key) ?? { family: source.family, sources: [] }
    entry.sources.push(source)
    families.set(key, entry)
  }
  const groups = [...families.values()]
  for (const group of groups) await assertFamilyFree(group.family)
  const files = await downloadFontFiles(urls, fetchFont, validate, onProgress)
  const addedAt = Date.now()
  const fonts = groups.map(
    (group): Font => ({
      id: newId(),
      family: group.family,
      source: location.href,
      addedAt,
      files: group.sources.map(({ url, weight, style, unicodeRange }) => {
        const file = files.get(url.href)
        if (!file) throw new Error(`${url.href} was not downloaded`)
        return { ...file, weight, style, unicodeRange }
      }),
    }),
  )
  await storeFonts(fonts)
  return fonts
}

/**
 * Downloads fonts from a link to a font file or to a stylesheet of @font-face rules, such as
 * Google Fonts' embed link. A stylesheet adds one font per family it names, with every file
 * it lists. Throws
 * FontImportError, with nothing stored, when the link or any file in it cannot be used.
 */
export async function addFontFromUrl(
  url: string,
  options: AddFontFromUrlOptions = {},
): Promise<Font[]> {
  const trimmed = url.trim()
  if (!URL.canParse(trimmed)) {
    throw new FontImportError('That isn’t a web address. Use a link that starts with https://.')
  }
  const location = new URL(trimmed)
  if (location.protocol !== 'https:') {
    throw new FontImportError(
      'Carrel downloads fonts only over https. Use a link that starts with https://.',
    )
  }
  // Called unbound: the browser's fetch throws when called as a method of another object.
  const fetchFont = options.fetch ?? globalThis.fetch
  const response = await download(fetchFont, location, (head) =>
    detectFontFormat(head) === null ? stylesheetLimit : fontFileLimit,
  )
  const isCss = /^text\/css\b/i.test(response.contentType)
  if (detectFontFormat(response.bytes) !== null) {
    const name = fileNameOf(location)
    if (!response.complete) throw tooLarge(name)
    return [await addFiles([new File([response.bytes], name)], location.href, options)]
  }
  if (!response.complete) {
    throw new FontImportError(
      isCss
        ? 'The stylesheet is too large: a font stylesheet can be at most 2 MB.'
        : notFontOrStylesheetMessage,
    )
  }
  const css = new TextDecoder().decode(response.bytes)
  return addFromStylesheet(css, location, response.url, isCss, fetchFont, options)
}

/** Deletes a font from the library. */
export async function removeFont(id: string): Promise<void> {
  await db.fonts.delete(id)
}
