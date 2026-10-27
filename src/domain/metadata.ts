/**
 * foliate-js reports metadata in the shape each format happens to have: a title may be a
 * string or a map from language to string, authors may be strings, objects with a `name`,
 * or a list of either. This reduces all of them to the fields the library shows.
 *
 * Metadata is often missing or filled with stand-ins: a tool writes "Unknown" for an author it
 * wasn't given, a title copied from a file named by its checksum, or "Microsoft Word -
 * report.docx". Those are treated as missing, and the title and authors are looked for next
 * in the file's name, which download sites fill with both.
 */

export interface BookMetadata {
  title: string
  authors: string[]
  language: string | null
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const clean = (text: string) => text.replace(/\s+/g, ' ').trim()

/** A plain string, or the first entry of a language map. */
function text(value: unknown): string | null {
  if (typeof value === 'string') return clean(value) || null
  if (isRecord(value)) {
    for (const entry of Object.values(value)) {
      const found = typeof entry === 'string' ? clean(entry) : ''
      if (found) return found
    }
  }
  return null
}

/** What tools write in place of a title or a name they don't have. */
const placeholders = new Set([
  'unknown',
  'unknown author',
  'unknown authors',
  'author unknown',
  'untitled',
  'untitled document',
  'no title',
  'title',
  'author',
  'none',
  'null',
  'undefined',
  'n/a',
  '-',
  // A PDF's author is often the account name of the computer that wrote it.
  'admin',
  'administrator',
  'owner',
  'user',
])

/** Checksums, UUIDs and other identifiers, which name a file but not a book. */
export function looksLikeIdentifier(text: string): boolean {
  const value = text.replace(/^urn:(uuid|isbn):/i, '').trim()
  return (
    /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i.test(value) ||
    /^[0-9a-f]{16,}$/i.test(value) ||
    /^[0-9-]{10,}$/.test(value)
  )
}

const usable = (value: string | null): value is string =>
  value !== null &&
  /[\p{L}\p{N}]/u.test(value) &&
  !placeholders.has(value.toLowerCase()) &&
  !looksLikeIdentifier(value)

const documentExtension = /\.(docx?|odt|rtf|pdf|epub|mobi|azw3?|fb2|txt|html?|tex|indd|pages)$/i

/** A title as a word processor or converter left it, without the program's additions. */
function cleanTitle(title: string): string {
  return clean(title.replace(/^microsoft (word|powerpoint) - /i, '').replace(documentExtension, ''))
}

function contributors(value: unknown): string[] {
  const list = Array.isArray(value) ? value : [value]
  const names = list.map((item) =>
    isRecord(item) && 'name' in item ? text(item.name) : text(item),
  )
  return [...new Set(names.filter(usable))]
}

function language(value: unknown): string | null {
  const first = Array.isArray(value) ? value[0] : value
  if (typeof first !== 'string' || !first.trim()) return null
  try {
    return Intl.getCanonicalLocales(first.trim())[0] ?? null
  } catch {
    return null
  }
}

/** The file name without the book extensions, for books whose metadata has no title. */
export function titleFromFileName(fileName: string): string {
  const base = fileName.replace(/\.(fb2\.zip|[a-z0-9]{1,5})$/i, '')
  return clean(base.replace(/[_]+/g, ' ')) || fileName
}

const splitNames = (names: string) =>
  names
    .split(/\s*;\s*/)
    .map(clean)
    .filter(usable)

/**
 * The title and authors a file's name gives, read in the patterns download sites name files
 * by: Anna's Archive's "Title -- Author -- Publisher -- … -- Anna’s Archive" and Z-Library's
 * "Title (Author) (z-library.sk, …)". Any other name is taken as the title alone. A name that
 * is an identifier, such as a checksum, gives nothing.
 */
export function infoFromFileName(fileName: string): { title: string | null; authors: string[] } {
  const stem = titleFromFileName(fileName)
  const parts = stem.split(/\s+--\s+/)
  if (parts.length >= 3) {
    const [title = '', authors = ''] = parts
    return { title: usable(clean(title)) ? clean(title) : null, authors: splitNames(authors) }
  }
  const zLibrary = /^(.*?)\s*\(([^()]*)\)\s*\([^()]*\b(z-?lib|1lib|z-library)\b[^()]*\)$/i.exec(
    stem,
  )
  if (zLibrary) {
    const [, title = '', authors = ''] = zLibrary
    return { title: usable(clean(title)) ? clean(title) : null, authors: splitNames(authors) }
  }
  return { title: usable(stem) ? stem : null, authors: [] }
}

export interface MetadataReading extends BookMetadata {
  /** False when no title was found and `title` is a stand-in the importer may improve on. */
  titleFound: boolean
}

export function readMetadata(raw: unknown, fileName: string): MetadataReading {
  const metadata = isRecord(raw) ? raw : {}
  const fromFile = infoFromFileName(fileName)
  const ownTitle = text(metadata.title)
  const metadataTitle = ownTitle === null ? null : cleanTitle(ownTitle)
  const title = usable(metadataTitle) ? metadataTitle : fromFile.title
  const authors = contributors(metadata.author)
  return {
    title: title ?? 'Untitled',
    titleFound: title !== null,
    authors: authors.length > 0 ? authors : fromFile.authors,
    language: language(metadata.language),
  }
}

/** A run of text on a page, with its size and its distance from the top (percent). */
export interface TextRun {
  text: string
  size: number
  top: number
}

/**
 * The title printed on a first page: the largest type in its upper part, when something there
 * is set clearly larger than the body text. Null for pages with no such line, such as a scan
 * without text or a page that starts with running text.
 */
export function titleFromTextRuns(runs: readonly TextRun[]): string | null {
  const sized = runs.filter((run) => run.text.trim() && run.size > 0 && Number.isFinite(run.top))
  if (sized.length === 0) return null
  const sizes = sized.map((run) => run.size).sort((a, b) => a - b)
  const median = sizes[Math.floor(sizes.length / 2)] ?? 0
  const upper = sized.filter((run) => run.top < 60)
  const largest = Math.max(0, ...upper.map((run) => run.size))
  if (largest < median * 1.3) return null
  const title = clean(
    upper
      .filter((run) => run.size >= largest * 0.85)
      // Runs on one line share a top, give or take a fraction; the sort is stable, so they keep
      // the page's own order.
      .sort((a, b) => Math.round(a.top) - Math.round(b.top))
      .map((run) => run.text)
      .join(' '),
  )
  return title.length >= 3 && title.length <= 200 && usable(title) ? title : null
}

/** What a book says about itself beyond its title and authors, for its details. */
export interface BookDetails {
  subtitle: string | null
  series: { name: string; position: string | null } | null
  publisher: string | null
  /** As the book gives it: a year, a date, or a timestamp. */
  published: string | null
  /** Plain text, its paragraphs separated by blank lines. */
  description: string | null
  subjects: string[]
  isbn: string | null
  /** Translators, editors and illustrators, by their role. */
  contributors: { role: 'translator' | 'editor' | 'illustrator'; names: string[] }[]
  rights: string | null
}

const entities: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
}

/**
 * Text from a description, which books often give as HTML: tags are dropped, block ends become
 * paragraph breaks, and character references are read.
 */
export function plainText(html: string): string {
  return (
    html
      // Line ends in the source are only spaces; breaks come from the markup.
      .replace(/\s+/g, ' ')
      .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h[1-6]|blockquote|section)>/gi, '\n\n')
      .replace(/<[^>]*>/g, '')
      .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, name: string) => {
        if (name[0] === '#') {
          const code =
            name[1] === 'x' || name[1] === 'X'
              ? Number.parseInt(name.slice(2), 16)
              : Number.parseInt(name.slice(1), 10)
          return Number.isFinite(code) && code > 0 && code <= 0x10ffff
            ? String.fromCodePoint(code)
            : match
        }
        return entities[name.toLowerCase()] ?? match
      })
      .split(/\n\s*\n/)
      .map((paragraph) =>
        paragraph
          .split('\n')
          .map((line) => clean(line))
          .filter(Boolean)
          .join('\n'),
      )
      .filter(Boolean)
      .join('\n\n')
  )
}

function series(value: unknown): BookDetails['series'] {
  const first = Array.isArray(value) ? value[0] : value
  if (!isRecord(first)) return null
  const name = text(first.name)
  if (!name) return null
  const position = first.position
  const place =
    typeof position === 'number' && Number.isFinite(position)
      ? String(position)
      : typeof position === 'string' && position.trim()
        ? position.trim()
        : null
  return { name, position: place }
}

/** An ISBN among the book's identifiers, as its digits (and a final X). */
function isbn(...values: unknown[]): string | null {
  for (const value of values.flat()) {
    const raw = isRecord(value)
      ? /isbn/i.test(String(value.scheme ?? '')) || /isbn/i.test(String(value.type ?? ''))
        ? String(value.value ?? '')
        : ''
      : typeof value === 'string'
        ? value
        : ''
    const candidate = raw.replace(/^urn:isbn:|^isbn:?\s*/i, '').replace(/[\s-]/g, '')
    if (/^(97[89]\d{10}|\d{9}[\dX])$/i.test(candidate)) return candidate.toUpperCase()
  }
  return null
}

export function readDetails(raw: unknown): BookDetails {
  const metadata = isRecord(raw) ? raw : {}
  const belongsTo = isRecord(metadata.belongsTo) ? metadata.belongsTo : {}
  const description = text(metadata.description)
  const subjects = (Array.isArray(metadata.subject) ? metadata.subject : [metadata.subject])
    .map((subject) => (isRecord(subject) ? text(subject.name) : text(subject)))
    .filter((subject): subject is string => subject !== null)
  const published = text(metadata.published)
  return {
    subtitle: text(metadata.subtitle),
    series: series(belongsTo.series),
    publisher: contributors(metadata.publisher)[0] ?? null,
    published,
    description: description ? plainText(description) || null : null,
    subjects: [...new Set(subjects)],
    isbn: isbn(metadata.identifier, metadata.altIdentifier),
    contributors: (['translator', 'editor', 'illustrator'] as const)
      .map((role) => ({ role, names: contributors(metadata[role]) }))
      .filter((entry) => entry.names.length > 0),
    rights: text(metadata.rights),
  }
}
