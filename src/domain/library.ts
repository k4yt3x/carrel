import Dexie from 'dexie'
import { makeThumbnail, type Thumbnail } from '@/domain/cover'
import { type Book, db, type Progress } from '@/domain/db'
import { loadFoliate, openBook } from '@/domain/foliate'
import { type BookMetadata, normalizeMetadata } from '@/domain/metadata'
import { sha256 } from '@/domain/sha256'

/** File extensions the import picker offers. Detection itself goes by content. */
export const bookExtensions = [
  '.epub',
  '.mobi',
  '.azw',
  '.azw3',
  '.kf8',
  '.fb2',
  '.fbz',
  '.cbz',
  '.pdf',
] as const

/** A file that cannot be imported, with the reason worded for the person importing it. */
export class ImportError extends Error {
  override name = 'ImportError'
}

export interface Inspection extends BookMetadata {
  cover: Thumbnail | null
}

/** Reads a book's metadata and cover. Throws ImportError when the file is not a book. */
export async function inspectBook(file: File): Promise<Inspection> {
  const { NotFoundError, UnsupportedTypeError } = await loadFoliate()
  let book: Awaited<ReturnType<typeof openBook>>
  try {
    book = await openBook(file)
  } catch (error) {
    if (error instanceof UnsupportedTypeError) {
      throw new ImportError('It isn’t in a format Carrel reads: EPUB, MOBI, AZW3, FB2, CBZ or PDF.')
    }
    if (error instanceof NotFoundError) throw new ImportError('The file is empty.')
    console.error(`could not parse ${file.name}`, error)
    throw new ImportError('It couldn’t be read as a book. The file may be damaged.')
  }
  try {
    const metadata = normalizeMetadata(book.metadata, file.name)
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

const isQuotaError = (error: unknown) =>
  error instanceof Dexie.QuotaExceededError ||
  (error instanceof DOMException && error.name === 'QuotaExceededError')

async function importFile(
  file: File,
  inspect: (file: File) => Promise<Inspection>,
): Promise<{ book: Book; added: boolean }> {
  const id = await sha256(file)
  const existing = await db.books.get(id)
  if (existing) return { book: existing, added: false }
  const { cover, ...metadata } = await inspect(file)
  const book: Book = { id, ...metadata, addedAt: Date.now(), openedAt: null }
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
      else if (isQuotaError(error)) reason = 'This browser has no storage space left for it.'
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
async function requestPersistentStorage(): Promise<void> {
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
  await db.transaction('rw', db.books, db.files, db.covers, db.progress, async () => {
    await db.books.delete(id)
    await db.files.delete(id)
    await db.covers.delete(id)
    await db.progress.delete(id)
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
