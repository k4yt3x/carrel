/**
 * The library lives in one IndexedDB database.
 *
 * A book's bytes, its cover and its reading position are kept in tables of their own rather
 * than on the book record. Listing the library then never touches file data, and saving the
 * reading position on every page turn rewrites a few dozen bytes instead of a record that
 * carries a cover image.
 *
 * Schema changes are appended as new `db.version(n)` steps; a step that has shipped is never
 * edited.
 */

import Dexie, { type EntityTable } from 'dexie'
import type { BookFormat } from '@/domain/formats'
import type { ReadingSettings } from '@/domain/settings'

export interface Book {
  /** SHA-256 of the file's bytes, lowercase hex. Importing the same file again finds it. */
  id: string
  title: string
  authors: string[]
  /** BCP 47 tag from the book's metadata, or null when it declares none. */
  language: string | null
  /** The format the book's file is named as (formatOf), or null when it is named as none. */
  format: BookFormat | null
  /** Milliseconds since the epoch. */
  addedAt: number
  /** Milliseconds since the epoch; null until the book is first opened. */
  openedAt: number | null
}

export interface BookFile {
  id: string
  /** The imported file as it was picked, so its name and type survive for format detection. */
  file: File
}

export interface Cover {
  id: string
  image: Blob
  /** Pixel size of the image, so the library can lay it out before it loads. */
  width: number
  height: number
}

export interface Progress {
  id: string
  /** EPUB CFI of the reading position, as foliate-js reports it. */
  location: string
  /** Position through the whole book, 0 to 1. */
  fraction: number
  updatedAt: number
}

/** A book's own reading settings, which replace the shared ones for that book. */
export interface BookSettings {
  id: string
  settings: ReadingSettings
}

export interface FontFile {
  data: Blob
  format: 'woff2' | 'woff' | 'truetype' | 'opentype'
  /** CSS font-weight descriptor, such as '400' or '100 900' for a variable font. */
  weight: string
  /** CSS font-style descriptor: 'normal', 'italic' or 'oblique'. */
  style: string
  /** CSS unicode-range descriptor, for fonts split into ranges; null when the file covers all. */
  unicodeRange: string | null
}

/** A typeface the reader added, made of one or more font files. */
export interface Font {
  id: string
  /** The name shown to the reader. Books refer to the font by `id`, never by this name. */
  family: string
  /** Where it came from: the file names, or the URL it was downloaded from. */
  source: string
  addedAt: number
  files: FontFile[]
}

export const db = new Dexie('carrel') as Dexie & {
  books: EntityTable<Book, 'id'>
  files: EntityTable<BookFile, 'id'>
  covers: EntityTable<Cover, 'id'>
  progress: EntityTable<Progress, 'id'>
  bookSettings: EntityTable<BookSettings, 'id'>
  fonts: EntityTable<Font, 'id'>
}

db.version(1).stores({
  books: 'id, addedAt, openedAt',
  files: 'id',
  covers: 'id',
  progress: 'id',
})

db.version(2).stores({
  bookSettings: 'id',
  fonts: 'id, family',
})

// Books gain the format their file is named as, which the library shows, worked out from each
// stored file's name and media type. The extensions and types are those of the formats Carrel
// read before this step, written out here so that the step stays as it is when formats change.
db.version(3)
  .stores({})
  .upgrade(async (tx) => {
    const extensions: [string, string][] = [
      ['.epub', 'EPUB'],
      ['.mobi', 'MOBI'],
      ['.azw', 'MOBI'],
      ['.azw3', 'AZW3'],
      ['.kf8', 'AZW3'],
      ['.fb2', 'FB2'],
      ['.fbz', 'FB2'],
      ['.cbz', 'CBZ'],
      ['.pdf', 'PDF'],
    ]
    const types = new Map([
      ['application/epub+zip', 'EPUB'],
      ['application/x-mobipocket-ebook', 'MOBI'],
      ['application/x-fictionbook+xml', 'FB2'],
      ['application/x-zip-compressed-fb2', 'FB2'],
      ['application/vnd.comicbook+zip', 'CBZ'],
      ['application/pdf', 'PDF'],
    ])
    const formats = new Map<string, string | null>()
    await tx.table('files').each(({ id, file }: { id: string; file: File }) => {
      const name = file.name.toLowerCase()
      const named = extensions.find(([extension]) => name.endsWith(extension))?.[1]
      formats.set(id, named ?? types.get(file.type) ?? null)
    })
    await tx
      .table('books')
      .toCollection()
      .modify((book: { id: string; format?: string | null }) => {
        book.format = formats.get(book.id) ?? null
      })
  })
