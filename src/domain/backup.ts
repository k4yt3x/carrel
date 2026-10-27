/**
 * Backups of the library, for a browser that may clear its storage.
 *
 * A backup is a zip file. `manifest.json` describes the library: the books' metadata, reading
 * positions, per-book settings, added fonts and the app's preferences. The files it refers to
 * sit beside it: `books/<id>` holds a book's file, `covers/<id>` its cover thumbnail and
 * `fonts/<fontId>/<n>` the files of an added font.
 *
 * The manifest names its format and version. Any change to its shape is a new version; a
 * Carrel that meets a version newer than its own refuses the backup by name rather than
 * misreading it. `parseManifest` is the only code that reads the version: everything after it
 * sees the current shape, so converting an older manifest belongs there and nowhere else.
 */

import {
  BlobReader,
  BlobWriter,
  configure,
  type FileEntry,
  TextReader,
  TextWriter,
  ZipReader,
  ZipWriter,
} from '@zip.js/zip.js'
import Dexie from 'dexie'
import {
  type Book,
  type BookSettings,
  type Cover,
  db,
  type FontFile,
  type Progress,
} from '@/domain/db'
import { detectFontFormat, fontFileLimit, fontNamed } from '@/domain/fonts'
import { normalizeReadingSettings, type ReadingSettings } from '@/domain/settings'
import { sha256 } from '@/domain/sha256'

// zip.js otherwise compresses in workers started from blob: URLs, which the app's content
// security policy forbids.
configure({ useWebWorkers: false })

/** A backup that cannot be read, with the reason worded for the person restoring it. */
export class BackupError extends Error {
  override name = 'BackupError'
}

const format = 'carrel-backup'
const version = 1
const manifestPath = 'manifest.json'
/** Largest manifest read into memory; a library would need far more books than fit a browser. */
const manifestLimit = 64 * 1024 * 1024
/** Largest cover read: covers are thumbnails, a few tens of kilobytes. */
const coverLimit = 2 * 1024 * 1024

const bookPath = (id: string) => `books/${id}`
const coverPath = (id: string) => `covers/${id}`
const fontPath = (fontId: string, index: number) => `fonts/${fontId}/${index}`

const notABackup = 'This isn’t a Carrel backup.'
const damagedBackup = 'This backup is damaged.'
const newerBackup =
  'This backup was made by a newer version of Carrel. Reload the page and try again.'

/** The cover's fields in the manifest: all set, or all null for a book stored without one. */
type BackupCover =
  | { cover: string; coverType: string; coverWidth: number; coverHeight: number }
  | { cover: null; coverType: null; coverWidth: null; coverHeight: null }

const noCover: BackupCover = { cover: null, coverType: null, coverWidth: null, coverHeight: null }

type BackupBook = Book & {
  fileName: string
  fileType: string
  /** Where the book's file is in the zip; null in a backup made without the books. */
  file: string | null
} & BackupCover

interface BackupFontFile extends Omit<FontFile, 'data'> {
  path: string
  /** The MIME type the file's data had, so it is restored as it was. */
  type: string
}

interface BackupFont {
  id: string
  family: string
  source: string
  addedAt: number
  files: BackupFontFile[]
}

interface Manifest {
  format: typeof format
  version: typeof version
  exportedAt: number
  preferences: unknown
  books: BackupBook[]
  progress: Progress[]
  bookSettings: BookSettings[]
  fonts: BackupFont[]
}

export interface ExportOptions {
  /** Whether the books' files and covers go in the backup, or only what is known about them. */
  includeBooks: boolean
  /** The app's preferences, as JSON-compatible data; restoreBackup hands them back unchanged. */
  preferences: unknown
  /** Called before the first and after each book and font, with the counts so far and in all. */
  onProgress?: (done: number, total: number) => void
}

/**
 * Writes a backup of the library to `target`, such as a stream from the File System Access
 * API, and resolves to null; without a target, resolves to the backup as a blob. A target is
 * closed when the backup is complete and aborted when it fails.
 *
 * Fonts are backed up with their files even without the books: they are small, and the
 * reading settings that name a font need its files to show it.
 *
 * Books are read from the database one at a time and written to the zip uncompressed, since
 * book formats are compressed already.
 */
export async function exportLibrary(
  target: WritableStream<Uint8Array> | null,
  { includeBooks, preferences, onProgress }: ExportOptions,
): Promise<Blob | null> {
  const exportedAt = Date.now()
  const output = target ?? new BlobWriter('application/zip')
  const zip = new ZipWriter(output)
  try {
    const books = await db.books.toArray()
    const fonts = await db.fonts.toArray()
    const total = books.length + fonts.length
    let done = 0
    onProgress?.(done, total)

    const backupBooks: BackupBook[] = []
    for (const { id, title, authors, language, addedAt, openedAt } of books) {
      const stored = await db.files.get(id)
      // A book removed while the backup is being written is left out of it.
      if (stored) {
        const { file } = stored
        let path: string | null = null
        let cover = noCover
        if (includeBooks) {
          path = bookPath(id)
          await zip.add(path, new BlobReader(file), { level: 0 })
          const thumbnail = await db.covers.get(id)
          if (thumbnail) {
            const { image, width, height } = thumbnail
            cover = {
              cover: coverPath(id),
              coverType: image.type,
              coverWidth: width,
              coverHeight: height,
            }
            await zip.add(cover.cover, new BlobReader(image), { level: 0 })
          }
        }
        backupBooks.push({
          id,
          title,
          authors,
          language,
          addedAt,
          openedAt,
          fileName: file.name,
          fileType: file.type,
          file: path,
          ...cover,
        })
      }
      onProgress?.(++done, total)
    }

    const backupFonts: BackupFont[] = []
    for (const { id, family, source, addedAt, files } of fonts) {
      const backupFiles: BackupFontFile[] = []
      for (const [index, { data, format, weight, style, unicodeRange }] of files.entries()) {
        const path = fontPath(id, index)
        await zip.add(path, new BlobReader(data), { level: 0 })
        backupFiles.push({ path, type: data.type, format, weight, style, unicodeRange })
      }
      backupFonts.push({ id, family, source, addedAt, files: backupFiles })
      onProgress?.(++done, total)
    }

    const progress = (await db.progress.toArray()).map(
      ({ id, location, fraction, updatedAt }): Progress => ({
        id,
        location,
        fraction,
        updatedAt,
      }),
    )
    const bookSettings = (await db.bookSettings.toArray()).map(
      ({ id, settings }): BookSettings => ({ id, settings }),
    )
    const manifest: Manifest = {
      format,
      version,
      exportedAt,
      preferences,
      books: backupBooks,
      progress,
      bookSettings,
      fonts: backupFonts,
    }
    await zip.add(manifestPath, new TextReader(JSON.stringify(manifest)))
    await zip.close()
  } catch (error) {
    // A File System Access stream keeps what was written once it closes; aborting it leaves no
    // truncated backup behind in the file the reader picked.
    if (target && !target.locked) {
      await target.abort(error).catch((abortError: unknown) => {
        console.warn('could not discard the unfinished backup', abortError)
      })
    }
    throw error
  }
  return output instanceof BlobWriter ? output.getData() : null
}

export interface BackupSummary {
  exportedAt: number
  books: number
  /** Books whose files are in the backup, so restoring it can add them to the library. */
  booksWithFiles: number
  fonts: number
}

/** Reads what a backup holds without restoring it. Throws BackupError when it can't be read. */
export async function inspectBackup(file: Blob): Promise<BackupSummary> {
  const { manifest } = await openBackup(file)
  return {
    exportedAt: manifest.exportedAt,
    books: manifest.books.length,
    booksWithFiles: manifest.books.filter((book) => book.file !== null).length,
    fonts: manifest.fonts.length,
  }
}

export interface RestoreOptions {
  /** Called before the first and after each book and font, with the counts so far and in all. */
  onProgress?: (done: number, total: number) => void
}

export interface RestoreOutcome {
  addedBooks: number
  /** Books in the backup that the library already has; those are left as they are. */
  alreadyPresent: number
  /** Titles of books whose files in the backup are missing, unreadable or not their files. */
  damaged: string[]
  restoredProgress: number
  addedFonts: number
  /** The preferences the backup carries, as stored; the caller normalizes them. */
  preferences: unknown
}

/**
 * Adds what a backup holds to the library without replacing anything in it, so restoring the
 * same backup again changes nothing. Throws BackupError when the backup can't be read.
 *
 * Books the library has are kept as they are, and books the backup holds no file for are not
 * added. A reading position replaces the library's when it is newer, and a book's own
 * settings are added when the book has none. Both are restored for books that are not in the
 * library too: ids are the hashes of the books' files, so they apply when that file is added
 * later. A font is added unless the library has one with the same id or the same name; the
 * restored settings that name it then name the library's.
 */
export async function restoreBackup(
  file: Blob,
  { onProgress }: RestoreOptions = {},
): Promise<RestoreOutcome> {
  const { manifest, entries } = await openBackup(file)
  const outcome: RestoreOutcome = {
    addedBooks: 0,
    alreadyPresent: 0,
    damaged: [],
    restoredProgress: await restoreProgress(manifest.progress),
    addedFonts: 0,
    preferences: manifest.preferences,
  }

  const total = manifest.books.length + manifest.fonts.length
  let done = 0
  onProgress?.(done, total)
  // A font the library has under the same name stands in for the backup's: settings that
  // name the backup's font name the library's instead.
  const fontIds = new Map<string, string>()
  for (const font of manifest.fonts) {
    const restored = await restoreFont(font, entries)
    if (restored) fontIds.set(font.id, restored.id)
    if (restored?.added) outcome.addedFonts++
    onProgress?.(++done, total)
  }
  await restoreBookSettings(
    manifest.bookSettings.map((record) => ({
      ...record,
      settings: withFontIds(record.settings, fontIds),
    })),
  )
  outcome.preferences = preferencesWithFontIds(manifest.preferences, fontIds)

  for (const book of manifest.books) {
    if (await db.books.get(book.id)) outcome.alreadyPresent++
    else if (book.file !== null) {
      const result = await restoreBook(book, book.file, entries)
      if (result === 'added') outcome.addedBooks++
      else if (result === 'present') outcome.alreadyPresent++
      else outcome.damaged.push(book.title)
    }
    onProgress?.(++done, total)
  }
  return outcome
}

function withFontIds(settings: ReadingSettings, fontIds: ReadonlyMap<string, string>) {
  const { typeface } = settings
  if (typeof typeface !== 'object' || !('fontId' in typeface)) return settings
  return { ...settings, typeface: { fontId: fontIds.get(typeface.fontId) ?? typeface.fontId } }
}

/** The preferences as stored, with their reading settings' font named as in the library. */
function preferencesWithFontIds(preferences: unknown, fontIds: ReadonlyMap<string, string>) {
  if (!isRecord(preferences) || !isRecord(preferences.reading)) return preferences
  const { typeface } = preferences.reading
  if (!isRecord(typeface) || typeof typeface.fontId !== 'string') return preferences
  const fontId = fontIds.get(typeface.fontId) ?? typeface.fontId
  return { ...preferences, reading: { ...preferences.reading, typeface: { fontId } } }
}

async function restoreProgress(records: readonly Progress[]): Promise<number> {
  return db.transaction('rw', db.progress, async () => {
    let restored = 0
    for (const record of records) {
      const stored = await db.progress.get(record.id)
      // The later position wins wherever it is, so an old backup never moves a reader back.
      if (stored && stored.updatedAt >= record.updatedAt) continue
      await db.progress.put(record)
      restored++
    }
    return restored
  })
}

async function restoreBookSettings(records: readonly BookSettings[]): Promise<void> {
  await db.transaction('rw', db.bookSettings, async () => {
    for (const record of records) {
      if (!(await db.bookSettings.get(record.id))) await db.bookSettings.add(record)
    }
  })
}

async function restoreBook(
  book: BackupBook,
  path: string,
  entries: ReadonlyMap<string, FileEntry>,
): Promise<'added' | 'present' | 'damaged'> {
  const entry = entries.get(path)
  const data = entry ? await readEntry(entry, book.fileType) : null
  // A book's id is the hash of its bytes: a file that hashes to anything else is not that book.
  if (!data || (await sha256(data)) !== book.id) return 'damaged'
  const { id, title, authors, language, addedAt, openedAt } = book
  const file = new File([data], book.fileName, { type: book.fileType })
  const cover = await readCover(book, entries)
  try {
    await db.transaction('rw', db.books, db.files, db.covers, async () => {
      await db.books.add({ id, title, authors, language, addedAt, openedAt })
      await db.files.add({ id, file })
      if (cover) await db.covers.add(cover)
    })
  } catch (error) {
    // Another tab added the same book between the lookup in restoreBackup and this write.
    if (error instanceof Dexie.ConstraintError && (await db.books.get(id))) return 'present'
    throw error
  }
  return 'added'
}

/** The book's cover, or null when it has none; a cover that can't be read is left out. */
async function readCover(
  book: BackupBook,
  entries: ReadonlyMap<string, FileEntry>,
): Promise<Cover | null> {
  if (book.cover === null) return null
  const entry = entries.get(book.cover)
  const image =
    entry && entry.uncompressedSize <= coverLimit ? await readEntry(entry, book.coverType) : null
  if (!image) {
    console.warn(`restoring ${book.title} without its cover, which the backup lacks`)
    return null
  }
  return { id: book.id, image, width: book.coverWidth, height: book.coverHeight }
}

/**
 * Adds a backup's font unless the library has it, under the same id or the same name. The
 * id of the font in the library afterwards, or null when the backup's files for it are
 * damaged or aren't font files the library would take.
 */
async function restoreFont(
  font: BackupFont,
  entries: ReadonlyMap<string, FileEntry>,
): Promise<{ id: string; added: boolean } | null> {
  const present = await libraryFont(font)
  if (present) return { id: present.id, added: false }
  const files: FontFile[] = []
  for (const { path, type, ...descriptors } of font.files) {
    const entry = entries.get(path)
    const data =
      entry && entry.uncompressedSize <= fontFileLimit ? await readEntry(entry, type) : null
    const kind = data
      ? detectFontFormat(new Uint8Array(await data.slice(0, 4).arrayBuffer()))
      : null
    if (!data || kind === null || kind === 'collection') {
      console.warn(`skipped the font ${font.family}: its files in the backup are damaged`)
      return null
    }
    files.push({ data, ...descriptors })
  }
  const { id, family, source, addedAt } = font
  return db.transaction('rw', db.fonts, async () => {
    const raced = await libraryFont(font)
    if (raced) return { id: raced.id, added: false }
    await db.fonts.add({ id, family, source, addedAt, files })
    return { id, added: true }
  })
}

/** The library's copy of a font, by its id or else its name. */
async function libraryFont({ id, family }: { id: string; family: string }) {
  return (await db.fonts.get(id)) ?? (await fontNamed(family))
}

/** An entry's data, or null when the backup's copy of it is damaged. */
async function readEntry(entry: FileEntry, type: string): Promise<Blob | null> {
  try {
    return await entry.getData<Blob>(new BlobWriter(type), { checkCrc32: true })
  } catch (error) {
    // A file that stops being readable (moved or changed on disk since it was picked) is not
    // damage to the backup, and nothing more can be read from it.
    if (error instanceof DOMException) throw error
    console.warn(`could not read ${entry.filename} from the backup`, error)
    return null
  }
}

interface OpenedBackup {
  manifest: Manifest
  /** The files in the zip, by path. */
  entries: ReadonlyMap<string, FileEntry>
}

async function openBackup(file: Blob): Promise<OpenedBackup> {
  let entries: Map<string, FileEntry>
  try {
    const all = await new ZipReader(new BlobReader(file)).getEntries()
    const files = all.filter((entry): entry is FileEntry => !entry.directory)
    entries = new Map(files.map((entry) => [entry.filename, entry]))
  } catch (error) {
    if (error instanceof DOMException) throw error
    throw new BackupError(notABackup, { cause: error })
  }
  const entry = entries.get(manifestPath)
  // zip.js refuses an entry that inflates past its declared size, so this bounds the read.
  if (!entry || entry.uncompressedSize > manifestLimit) throw new BackupError(notABackup)
  let text: string
  try {
    text = await entry.getData<string>(new TextWriter(), { checkCrc32: true })
  } catch (error) {
    if (error instanceof DOMException) throw error
    throw new BackupError(damagedBackup, { cause: error })
  }
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (error) {
    throw new BackupError(notABackup, { cause: error })
  }
  return { manifest: parseManifest(raw, entries), entries }
}

/**
 * Validates a manifest, which comes from a file anyone could have made. A record that is not
 * valid, or repeats an id, is left out rather than written to the library.
 */
function parseManifest(raw: unknown, entries: ReadonlyMap<string, FileEntry>): Manifest {
  if (!isRecord(raw) || raw.format !== format) throw new BackupError(notABackup)
  const { version: found, exportedAt, books, progress, bookSettings, fonts } = raw
  if (typeof found === 'number' && Number.isInteger(found) && found > version) {
    throw new BackupError(newerBackup)
  }
  if (
    found !== version ||
    !isTime(exportedAt) ||
    !Array.isArray(books) ||
    !Array.isArray(progress) ||
    !Array.isArray(bookSettings) ||
    !Array.isArray(fonts)
  ) {
    throw new BackupError(damagedBackup)
  }
  return {
    format,
    version,
    exportedAt,
    preferences: raw.preferences,
    books: validRecords('books', books, parseBook),
    progress: validRecords('reading positions', progress, parseProgress),
    bookSettings: validRecords('book settings', bookSettings, parseBookSettings),
    fonts: validRecords('fonts', fonts, (value) => parseFont(value, entries)),
  }
}

function validRecords<T extends { id: string }>(
  kind: string,
  values: readonly unknown[],
  parse: (value: unknown) => T | null,
): T[] {
  const ids = new Set<string>()
  const records: T[] = []
  for (const value of values) {
    const record = parse(value)
    if (!record || ids.has(record.id)) continue
    ids.add(record.id)
    records.push(record)
  }
  const skipped = values.length - records.length
  if (skipped > 0) console.warn(`skipped ${skipped} invalid or repeated ${kind} in the backup`)
  return records
}

/** Longest text accepted in a manifest field, far beyond any real title, name or position. */
const textLimit = 10_000
/** Most items accepted in a list inside a record: a book's authors, a font's files. */
const listLimit = 10_000
const fontFormats: readonly FontFile['format'][] = ['woff2', 'woff', 'truetype', 'opentype']

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isText = (value: unknown, limit = textLimit): value is string =>
  typeof value === 'string' && value.length <= limit

const isName = (value: unknown): value is string => isText(value) && value.trim() !== ''

const isTime = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0

const isBookId = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{64}$/.test(value)

const isNameList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.length <= listLimit && value.every(isName)

const isDimension = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 65_535

function isLanguageTag(value: unknown): value is string {
  if (!isText(value, 100)) return false
  try {
    Intl.getCanonicalLocales(value)
    return true
  } catch {
    return false
  }
}

// Font descriptors end up in CSS, so they are held to the characters their grammar uses.
const isFontDescriptor = (value: unknown): value is string =>
  isText(value, 100) && /^[a-z0-9 .-]+$/i.test(value)

const isUnicodeRange = (value: unknown): value is string =>
  isText(value) && /^[0-9a-fu+?,\s-]+$/i.test(value)

const isFontFormat = (value: unknown): value is FontFile['format'] =>
  fontFormats.includes(value as FontFile['format'])

function parseBook(value: unknown): BackupBook | null {
  if (!isRecord(value)) return null
  const { id, title, authors, language, addedAt, openedAt, fileName, fileType, file } = value
  if (
    !isBookId(id) ||
    !isName(title) ||
    !isNameList(authors) ||
    !(language === null || isLanguageTag(language)) ||
    !isTime(addedAt) ||
    !(openedAt === null || isTime(openedAt)) ||
    !isName(fileName) ||
    !isText(fileType, 255) ||
    !(file === null || file === bookPath(id))
  ) {
    return null
  }
  const book = { id, title, authors, language, addedAt, openedAt, fileName, fileType, file }
  const { cover, coverType, coverWidth, coverHeight } = value
  if (cover === null) return { ...book, ...noCover }
  if (
    cover !== coverPath(id) ||
    !isText(coverType, 255) ||
    !/^image\/[a-z0-9.+-]+$/i.test(coverType) ||
    !isDimension(coverWidth) ||
    !isDimension(coverHeight)
  ) {
    return null
  }
  return { ...book, cover, coverType, coverWidth, coverHeight }
}

function parseProgress(value: unknown): Progress | null {
  if (!isRecord(value)) return null
  const { id, location, fraction, updatedAt } = value
  if (
    !isBookId(id) ||
    !isText(location) ||
    typeof fraction !== 'number' ||
    !(fraction >= 0 && fraction <= 1) ||
    !isTime(updatedAt)
  ) {
    return null
  }
  return { id, location, fraction, updatedAt }
}

function parseBookSettings(value: unknown): BookSettings | null {
  if (!isRecord(value) || !isBookId(value.id) || !isRecord(value.settings)) return null
  return { id: value.id, settings: normalizeReadingSettings(value.settings) }
}

function parseFont(value: unknown, entries: ReadonlyMap<string, FileEntry>): BackupFont | null {
  if (!isRecord(value)) return null
  const { id, family, source, addedAt, files } = value
  if (
    !isName(id) ||
    !isName(family) ||
    !isText(source) ||
    !isTime(addedAt) ||
    !Array.isArray(files) ||
    files.length === 0 ||
    files.length > listLimit
  ) {
    return null
  }
  const backupFiles: BackupFontFile[] = []
  for (const [index, file] of files.entries()) {
    const backupFile = parseFontFile(file, fontPath(id, index), entries)
    if (!backupFile) return null
    backupFiles.push(backupFile)
  }
  return { id, family, source, addedAt, files: backupFiles }
}

function parseFontFile(
  value: unknown,
  path: string,
  entries: ReadonlyMap<string, FileEntry>,
): BackupFontFile | null {
  if (!isRecord(value) || value.path !== path || !entries.has(path)) return null
  const { type, format, weight, style, unicodeRange } = value
  if (
    !isText(type, 255) ||
    !isFontFormat(format) ||
    !isFontDescriptor(weight) ||
    !isFontDescriptor(style) ||
    !(unicodeRange === null || isUnicodeRange(unicodeRange))
  ) {
    return null
  }
  return { path, type, format, weight, style, unicodeRange }
}
