/**
 * Plain-text books. A text file carries no structure for the renderer, so it is given one:
 * its bytes are decoded, its text is broken into paragraphs, and it is divided into chapters at
 * lines that read as chapter headings, each chapter a section of the book.
 *
 * A reading position names the section it is in, so the rules that divide a text are part of
 * every position saved in one: changing them moves readers' places in their text books.
 */

/** A run of the text under one heading; the text before the first heading has none. */
export interface Chapter {
  heading: string | null
  paragraphs: string[]
}

// Legacy encodings are told apart on this much of the file; the rest is decoded the same way.
const sampleSize = 1 << 20

/** The bytes as text in this encoding, or null where they are not valid in it. */
function decodeStrictly(bytes: Uint8Array, encoding: string, partial = false): string | null {
  try {
    // A sample may end partway through a character, which streaming leaves for a next call.
    return new TextDecoder(encoding, { fatal: true }).decode(bytes, { stream: partial })
  } catch {
    return null
  }
}

// The multi-byte encodings of Chinese, Japanese and Korean text from before Unicode. The bytes
// of one are often valid in another, so each is judged by how much of what it reads is common:
// text decoded as the wrong one comes out as rare characters in no particular order.
const legacyEncodings = ['gb18030', 'big5', 'shift_jis', 'euc-jp', 'euc-kr']
const commonCharacters = new Set(
  // Chinese, in simplified and traditional forms, then Korean.
  '的一是不了在人有我他这這个個们們中来來上大为為和国國到说說时時要就出会會也你对對着著地道' +
    '이다는의에가을고하지한로서도기사리나를으어대자',
)
const isCommon = (character: string) =>
  commonCharacters.has(character) || (character >= '\u3041' && character <= '\u3096')

/** The share of the characters past ASCII that are common in some language's text. */
function commonShare(text: string): number {
  let wide = 0
  let common = 0
  for (const character of text) {
    if (character <= '\u007f') continue
    wide++
    if (isCommon(character)) common++
  }
  return wide === 0 ? 0 : common / wide
}

// Single-byte encodings by language, for scripts beyond ASCII's letters and for letters with
// accents. Every byte is valid in each, so the reader's languages choose between them.
const scriptEncodings: [RegExp, string][] = [
  [/^(ru|uk|be|bg|sr|mk)\b/, 'windows-1251'],
  [/^el\b/, 'windows-1253'],
  [/^he\b/, 'windows-1255'],
  [/^(ar|fa|ur)\b/, 'windows-1256'],
  [/^th\b/, 'windows-874'],
]
const accentEncodings: [RegExp, string][] = [
  [/^(pl|cs|sk|hu|sl|hr|ro|bs|sq)\b/, 'windows-1250'],
  [/^(tr|az)\b/, 'windows-1254'],
  [/^(lt|lv|et)\b/, 'windows-1257'],
  [/^vi\b/, 'windows-1258'],
]
const byLanguage = (table: [RegExp, string][], languages: readonly string[]) =>
  languages
    .map((language) => table.find(([pattern]) => pattern.test(language.toLowerCase()))?.[1])
    .find((encoding) => encoding !== undefined)

/**
 * The single-byte encoding for text whose letters are mostly past ASCII (another script) or
 * mostly within it (accented Latin), as the reader's languages have it.
 */
function singleByteEncoding(sample: Uint8Array, languages: readonly string[]): string {
  let high = 0
  let letters = 0
  for (const byte of sample) {
    if (byte >= 0x80) high++
    else if ((byte | 0x20) >= 0x61 && (byte | 0x20) <= 0x7a) letters++
  }
  // Letters with accents are a few of a Latin text's; another script's are nearly all of it.
  return high > (high + letters) * 0.6
    ? (byLanguage(scriptEncodings, languages) ?? 'windows-1251')
    : (byLanguage(accentEncodings, languages) ?? 'windows-1252')
}

/**
 * The text of a file in whatever encoding it is in: Unicode by its byte order mark or its
 * validity, else the legacy encoding that reads it best. `languages` are the reader's, which
 * settle the single-byte encodings that every file is valid in. Throws for a file that holds
 * something other than text.
 */
export function decodeText(bytes: Uint8Array, languages: readonly string[]): string {
  const text = decodeAs(bytes, languages)
  if (text.includes('\u0000')) throw new Error('the file holds something other than text')
  return text
}

function decodeAs(bytes: Uint8Array, languages: readonly string[]): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes)
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes)
  const unicode = decodeStrictly(bytes, 'utf-8')
  if (unicode !== null) return unicode
  const sample = bytes.subarray(0, sampleSize)
  const partial = bytes.length > sampleSize
  let best: { encoding: string; share: number } | null = null
  for (const encoding of legacyEncodings) {
    const decoded = decodeStrictly(sample, encoding, partial)
    if (decoded === null) continue
    const share = commonShare(decoded)
    if (share > (best?.share ?? 0.02)) best = { encoding, share }
  }
  const encoding = best?.encoding ?? singleByteEncoding(sample, languages)
  return new TextDecoder(encoding).decode(bytes)
}

const numberWord =
  'one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|' +
  'sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|' +
  'hundred|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|last'
const roman = '(?=[mdclxvi])m*(?:c[md]|d?c*)(?:x[cl]|l?x*)(?:i[xv]|v?i*)'
const counted = `(?:\\d+|${roman}|(?:${numberWord})(?:[-\\s](?:${numberWord}))*)`
// "Chapter 12", "PART TWO", "Livre III", "第十二章", "第1話", "제3장" and the like, then
// perhaps a title; or a part of a book that has no number.
const numbered = new RegExp(
  `^(?:(?:chapter|part|book|volume|chapitre|partie|livre|kapitel|teil|buch|cap[ií]tulo|parte|` +
    `libro|capitolo|hoofdstuk|rozdział|глава|часть|книга|том)\\s+${counted}(?![\\p{L}\\p{N}])` +
    `|第[\\d０-９零〇一二三四五六七八九十百千万两兩]+[章回节節卷集部篇话話幕]` +
    `|제\\s*\\d+\\s*[장화부편])(.*)$`,
  'iu',
)
const unnumbered = new RegExp(
  `^(?:prologue|epilogue|preface|foreword|afterword|introduction|interlude|prólogo|epílogo|` +
    `prologo|épilogue|vorwort|nachwort|пролог|эпилог|序章|序言|楔子|引子|前言|尾声|尾聲|后记|後記|` +
    `番外篇?|终章|終章|プロローグ|エピローグ|あとがき)(?![\\p{L}\\p{N}])(.*)$`,
  'iu',
)
// What may part a heading's number from its title.
const separator = /^[\s.:：、．·\-–—)）]/
const headingLength = 60

/** What follows a heading's number or name, where a paragraph begins as a heading does. */
function headingRest(paragraph: string): string | null {
  if (paragraph.length > headingLength * 2 || Array.from(paragraph).length > headingLength) {
    return null
  }
  const match = numbered.exec(paragraph) ?? unnumbered.exec(paragraph)
  return match ? (match[1] ?? '') : null
}

/** Whether a paragraph reads as a chapter heading rather than as prose. */
export function isHeading(paragraph: string): boolean {
  const rest = headingRest(paragraph)
  if (rest === null) return false
  if (/[,;，；、。]$/.test(rest)) return false
  if (rest === '' || /^[.:：．]/.test(rest)) return true
  // A sentence that ends and goes on is prose, in Chinese or Japanese.
  if (/[。．！？；]./u.test(rest)) return false
  // Chinese and Japanese titles may follow the number with nothing between.
  if (!separator.test(rest)) return /^[\p{Script=Han}\p{N}]/u.test(rest)
  // A title set off only by a space reads as prose when it runs on as a sentence does.
  return !/^\s+\p{Ll}.*[.!?]$/u.test(rest)
}

/** A heading with nothing after its number or name, such as "第四回" or "CHAPTER IV.". */
const isBareHeading = (line: string) => /^[\s.:：．]*$/.test(headingRest(line) ?? '-')

// Control characters other than line breaks and tabs: a form feed parts pages, and the rest
// (an end-of-file mark from DOS among them) are dropped.
const formFeed = /\f/g
const controls = /(?![\t\n])\p{Cc}/gu

const isBlank = (line: string) => line.trim() === ''
const isIndented = (line: string) => /^\s/.test(line) && !isBlank(line)

/**
 * Whether the text's lines are broken at a fixed width, with paragraphs marked by blank lines
 * or by indenting, as in Project Gutenberg's texts. Otherwise each line is a paragraph.
 */
function isWrapped(lines: readonly string[]): boolean {
  const filled = lines.filter((line) => !isBlank(line))
  if (filled.length === 0) return false
  const lengths = filled.map((line) => line.trim().length).sort((a, b) => a - b)
  const longest = lengths[Math.floor(lengths.length * 0.95)] ?? 0
  let continued = 0
  for (let n = 1; n < lines.length; n++) {
    const line = lines[n] ?? ''
    if (!isBlank(lines[n - 1] ?? '') && !isBlank(line) && !isIndented(line)) continued++
  }
  const marked = Math.max(lines.length - filled.length, filled.filter(isIndented).length)
  return longest <= 100 && continued >= filled.length * 0.3 && marked >= filled.length * 0.05
}

// Chinese and Japanese are written without spaces, so their lines join without one.
const unspaced = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\u3000-\u303f\uff00-\uffef]/u
const joinLines = (before: string, after: string) =>
  unspaced.test(before.at(-1) ?? '') || unspaced.test(after[0] ?? '')
    ? `${before}${after}`
    : `${before} ${after}`

// A heading may follow a line that ends a sentence, or a rule of dashes or the like.
const endsSentence = /[.!?。！？．…”’」』"')）\]］】\-—_=*~]$/u
// A line of dashes, stars or the like stands apart from the lines around it; a mark or two
// alone on a line is the end of a sentence broken at the width.
const isRule = (line: string) =>
  /^[\p{P}\p{S}\s]+$/u.test(line) && line.replace(/\s/g, '').length >= 3

/**
 * The text's paragraphs, each on one line and trimmed. In text broken at a width, a heading
 * may sit on the line after the end of a paragraph, and its title on the line after it.
 */
function paragraphsOf(text: string): string[] {
  const lines = text
    .replace(/\r\n?/g, '\n')
    .replace(formFeed, '\n')
    .replace(controls, '')
    .split('\n')
  if (!isWrapped(lines)) return lines.map((line) => line.trim()).filter((line) => line !== '')
  const paragraphs: string[] = []
  let current: string | null = null
  for (const [n, line] of lines.entries()) {
    if (isBlank(line)) {
      current = null
      continue
    }
    const trimmed = line.trim()
    let starts = current === null || isIndented(line) || isRule(trimmed) || isRule(current)
    if (current !== null && !starts) {
      starts = isHeading(current)
        ? !(isBlank(lines[n + 1] ?? '') && isHeading(joinLines(current, trimmed)))
        : isHeading(trimmed) && (endsSentence.test(current) || isBareHeading(trimmed))
    }
    if (starts || current === null) {
      paragraphs.push(trimmed)
      current = trimmed
    } else {
      current = joinLines(current, trimmed)
      paragraphs[paragraphs.length - 1] = current
    }
  }
  return paragraphs
}

/**
 * The text's chapters. A heading starts one only when text follows it before the next heading,
 * so that a table of contents, or a part's title just before its first chapter's, stays text.
 */
export function divideText(text: string): Chapter[] {
  const paragraphs = paragraphsOf(text)
  const headings = paragraphs.map(isHeading)
  const chapters: Chapter[] = []
  let current: Chapter | null = null
  for (const [n, paragraph] of paragraphs.entries()) {
    if (headings[n] && headings[n + 1] === false) {
      current = { heading: paragraph, paragraphs: [] }
      chapters.push(current)
    } else {
      if (!current) {
        current = { heading: null, paragraphs: [] }
        chapters.push(current)
      }
      current.paragraphs.push(paragraph)
    }
  }
  return chapters
}

const escapeHtml = (text: string) =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')

/** A chapter as the HTML document of a section. */
export function chapterDocument({ heading, paragraphs }: Chapter): string {
  const title = heading === null ? '' : escapeHtml(heading)
  const body = [
    ...(heading === null ? [] : [`<h2>${title}</h2>`]),
    ...paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`),
  ]
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title></head><body>${body.join('\n')}</body></html>`
}

/**
 * A foliate-js book of the chapters: one section each, and a table of contents of those with
 * a heading. Its title comes from the file's name, as for any book whose metadata has none.
 */
export function makeTextBook(chapters: readonly Chapter[]) {
  const documents = chapters.map(chapterDocument)
  const urls = new Map<number, string>()
  const load = (index: number) => {
    let url = urls.get(index)
    if (!url) {
      url = URL.createObjectURL(new Blob([documents[index] ?? ''], { type: 'text/html' }))
      urls.set(index, url)
    }
    return url
  }
  return {
    metadata: {},
    sections: documents.map((html, index) => ({
      id: index,
      size: html.length,
      load: () => load(index),
      createDocument: () => new DOMParser().parseFromString(html, 'text/html'),
    })),
    toc: chapters.flatMap(({ heading }, index) =>
      heading === null ? [] : [{ label: heading, href: String(index) }],
    ),
    resolveHref: (href: string) => ({ index: Number(href) }),
    splitTOCHref: (href: string) => [Number(href)],
    getTOCFragment: (doc: Document) => doc.body,
    getCover: () => null,
    destroy: () => {
      for (const url of urls.values()) URL.revokeObjectURL(url)
      urls.clear()
    },
  }
}
