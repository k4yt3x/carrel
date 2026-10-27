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

export interface Book {
  /** SHA-256 of the file's bytes, lowercase hex. Importing the same file again finds it. */
  id: string
  title: string
  authors: string[]
  /** BCP 47 tag from the book's metadata, or null when it declares none. */
  language: string | null
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

export const db = new Dexie('carrel') as Dexie & {
  books: EntityTable<Book, 'id'>
  files: EntityTable<BookFile, 'id'>
  covers: EntityTable<Cover, 'id'>
  progress: EntityTable<Progress, 'id'>
}

db.version(1).stores({
  books: 'id, addedAt, openedAt',
  files: 'id',
  covers: 'id',
  progress: 'id',
})
