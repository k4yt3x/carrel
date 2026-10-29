import Dexie from 'dexie'
import { makeThumbnail, type Thumbnail } from '@/domain/cover'
import { type Book, db, type Progress } from '@/domain/db'
import { type Book as FoliateBook, loadFoliate, openBook } from '@/domain/foliate'
import { bookFormatNames, formatOf } from '@/domain/formats'
import { type BookMetadata, readMetadata, type TextRun, titleFromTextRuns } from '@/domain/metadata'
import { sha256 } from '@/domain/sha256'

/** A file that cannot be imported, with the reason worded for the person importing it. */
export class ImportError extends Error {
  override name = 'ImportError'
}

export interface Inspection extends BookMetadata {
  cover: Thumbnail | null
}

/** The positioned text of a PDF's first page, as PDF.js lays it out for selection. */
async function firstPageText(book: FoliateBook): Promise<TextRun[]> {
  const section = book.sections[0] as { createDocument?: () => Promise<Document> } | undefined
  if (!section?.createDocument) return []
  const doc = await section.createDocument()
  return Array.from(doc.querySelectorAll<HTMLElement>('.textLayer span'), (span) => ({
    text: span.textContent ?? '',
    size: Number.parseFloat(span.style.getPropertyValue('--font-height')),
    top: Number.parseFloat(span.style.top),
  }))
}

/**
 * For a book whose metadata and file name give no title: the title printed on its first page,
 * which only a PDF (whose pages carry their text with its size and place) can give.
 */
async function titleFromFirstPage(book: FoliateBook): Promise<string | null> {
  if (book.rendition?.layout !== 'pre-paginated') return null
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('reading the first page took too long')), 5000)
    })
    return titleFromTextRuns(await Promise.race([firstPageText(book), timeout]))
  } catch (error) {
    // The book is imported all the same, under its stand-in title.
    console.warn('could not read a title from the first page', error)
    return null
  } finally {
    clearTimeout(timer)
  }
}

const formatList = new Intl.ListFormat('en-GB', { type: 'disjunction' }).format(bookFormatNames)

/** Reads a book's metadata and cover. Throws ImportError when the file is not a book. */
export async function inspectBook(file: File): Promise<Inspection> {
  const { NotFoundError, UnsupportedTypeError } = await loadFoliate()
  let book: Awaited<ReturnType<typeof openBook>>
  try {
    book = await openBook(file)
  } catch (error) {
    if (error instanceof UnsupportedTypeError) {
      throw new ImportError(`It isn’t in a format Carrel reads: ${formatList}.`)
    }
    if (error instanceof NotFoundError) throw new ImportError('The file is empty.')
    console.error(`could not parse ${file.name}`, error)
    throw new ImportError('It couldn’t be read as a book. The file may be damaged.')
  }
  try {
    const { titleFound, ...metadata } = readMetadata(book.metadata, file.name)
    if (!titleFound) metadata.title = (await titleFromFirstPage(book)) ?? metadata.title
    let cover: Thumbnail | null = null
    try {
      const image = await book.getCover?.()
      cover = image ? await makeThumbnail(image) : null
    } catch (error) {
      // A book whose cover cannot be read is still a book; the library draws a stand-in.
      console.warn(`no cover for ${file.name}`, error)
    }
    return { ...metadata, cover }
  } finally {
    book.destroy?.()
  }
}

export type ImportFailure = { fileName: string; reason: string }

export interface ImportOutcome {
  added: Book[]
  /** Books that were already in the library, as they are stored there. */
  duplicates: Book[]
  failed: ImportFailure[]
}

export interface ImportOptions {
  inspect?: (file: File) => Promise<Inspection>
  /** Called after each file, with the number of files processed so far. */
  onProgress?: (done: number) => void
}

/**
 * Whether an error is the browser refusing a write for lack of storage space. Where the
 * space runs out as the transaction commits, Dexie reports the abort, with the refusal inside.
 */
export const isQuotaError = (error: unknown): boolean =>
  error instanceof Dexie.QuotaExceededError ||
  (error instanceof DOMException && error.name === 'QuotaExceededError') ||
  (error instanceof Dexie.AbortError && isQuotaError(error.inner))

/** What the reader is told when a write fails for lack of storage space. */
export const storageFullMessage = 'The browser has run out of storage space for Carrel.'

/**
 * Longest title or name kept, and most authors: far past any real book, and well inside what
 * a backup takes back (src/domain/backup.ts), so every book in the library can be restored.
 */
const nameLimit = 1_000
const authorLimit = 100

const clip = (text: string) =>
  text.length > nameLimit ? `${Array.from(text).slice(0, nameLimit).join('').trimEnd()}…` : text

async function importFile(
  file: File,
  inspect: (file: File) => Promise<Inspection>,
): Promise<{ book: Book; added: boolean }> {
  const id = await sha256(file)
  const existing = await db.books.get(id)
  if (existing) return { book: existing, added: false }
  const { cover, title, authors, language } = await inspect(file)
  const book: Book = {
    id,
    title: clip(title),
    authors: authors.slice(0, authorLimit).map(clip),
    language,
    format: formatOf(file),
    addedAt: Date.now(),
    openedAt: null,
  }
  try {
    await db.transaction('rw', db.books, db.files, db.covers, async () => {
      await db.books.add(book)
      await db.files.add({ id, file })
      if (cover) await db.covers.add({ id, ...cover })
    })
  } catch (error) {
    // Another tab imported the same file between the lookup above and this write.
    if (error instanceof Dexie.ConstraintError) {
      const stored = await db.books.get(id)
      if (stored) return { book: stored, added: false }
    }
    throw error
  }
  return { book, added: true }
}

/**
 * Adds files to the library, one at a time so a large batch never holds more than one book
 * in memory. A file whose bytes are already in the library, including earlier in the same
 * batch, is reported as a duplicate rather than stored twice.
 */
export async function importFiles(
  files: readonly File[],
  { inspect = inspectBook, onProgress }: ImportOptions = {},
): Promise<ImportOutcome> {
  const outcome: ImportOutcome = { added: [], duplicates: [], failed: [] }
  for (const [index, file] of files.entries()) {
    try {
      const { book, added } = await importFile(file, inspect)
      if (added) outcome.added.push(book)
      else outcome.duplicates.push(book)
    } catch (error) {
      let reason = 'It couldn’t be added to the library.'
      if (error instanceof ImportError) reason = error.message
      else if (isQuotaError(error)) reason = storageFullMessage
      else console.error(`could not import ${file.name}`, error)
      outcome.failed.push({ fileName: file.name, reason })
    }
    onProgress?.(index + 1)
  }
  if (outcome.added.length > 0) void requestPersistentStorage()
  return outcome
}

/**
 * Asks the browser not to evict the library under storage pressure. Browsers decide by
 * themselves whether to grant it, and asking again after a grant is harmless.
 */
export async function requestPersistentStorage(): Promise<void> {
  try {
    if (navigator.storage && !(await navigator.storage.persisted())) {
      await navigator.storage.persist()
    }
  } catch (error) {
    console.warn('persistent storage request failed', error)
  }
}

/** Deletes a book and everything stored with it. */
export async function removeBook(id: string): Promise<void> {
  await removeBooks([id])
}

/** Removes books with everything kept for them, all or none of them. */
export async function removeBooks(ids: readonly string[]): Promise<void> {
  const tables = [db.books, db.files, db.covers, db.progress, db.bookSettings]
  await db.transaction('rw', tables, async () => {
    await Promise.all(tables.map((table) => table.bulkDelete([...ids])))
  })
}

export async function loadBookFile(id: string): Promise<File | undefined> {
  return (await db.files.get(id))?.file
}

export async function markOpened(id: string): Promise<void> {
  await db.books.update(id, { openedAt: Date.now() })
}

export async function saveProgress(progress: Omit<Progress, 'updatedAt'>): Promise<void> {
  await db.progress.put({ ...progress, updatedAt: Date.now() })
}
