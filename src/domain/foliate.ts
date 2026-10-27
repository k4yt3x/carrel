/**
 * The one way a book file becomes a foliate-js book in carrel. Every book, whether it is
 * being inspected on import or opened to read, comes through here so that the guards below
 * are never skipped.
 */

import type { Book, ResourceDataDetail, ResourceLoadDetail } from 'foliate-js/view.js'
import { relativeFontSizes, relativeFontSizesInDocument } from '@/domain/fontSizes'
import { markupParseType, sanitizeDocument, sanitizeMarkup } from '@/domain/sanitize'

export type { Book } from 'foliate-js/view.js'

/** Loads foliate-js, which also registers the `<foliate-view>` element. */
export const loadFoliate = () => import('foliate-js/view.js')

/**
 * Prepares a book's resources before the renderer loads them. Scripts are kept out of the
 * page: EPUB script resources are never loaded, and every markup document is sanitized. And
 * absolute font sizes, in stylesheets and in the markup, become relative to the page's root,
 * so that the reader's text size applies to them (see fontSizes.ts).
 */
export function guard(book: Book): void {
  const target = book.transformTarget
  if (!target) {
    guardOldMobi(book)
    return
  }
  target.addEventListener('load', (event) => {
    const detail = (event as CustomEvent<ResourceLoadDetail>).detail
    if (detail.isScript) detail.allow = false
  })
  target.addEventListener('data', (event) => {
    const detail = (event as CustomEvent<ResourceDataDetail>).detail
    const { type } = detail
    if (type === 'text/css') {
      detail.data = Promise.resolve(detail.data).then((data) =>
        typeof data === 'string' ? relativeFontSizes(data) : data,
      )
      return
    }
    // The type is a plain string when the event fires; other listeners (the paginator's CSS
    // rewrite) compare it synchronously, so it is only replaced for markup.
    const parseAs = typeof type === 'string' ? markupParseType(type) : null
    if (!parseAs) return
    // SVG documents keep their sizes, which are in the drawing's own units.
    const rewrite = parseAs === 'image/svg+xml' ? undefined : relativeFontSizesInDocument
    const sanitized = Promise.resolve(detail.data).then(async (data) => {
      const source = typeof data === 'string' ? data : await new Blob([data as BlobPart]).text()
      return sanitizeMarkup(source, parseAs, rewrite)
    })
    detail.data = sanitized.then((result) => result.source)
    detail.type = sanitized.then((result) => result.type)
  })
}

/**
 * Old (pre-KF8) MOBI books have no resource events: their sections are parsed into documents
 * by the book's own `createDocument`, and written out from those. Each document is sanitized
 * as it is made.
 */
function guardOldMobi(book: Book): void {
  const mobi = book as Book & { createDocument?: (section: unknown) => Promise<Document> }
  const createDocument = mobi.createDocument?.bind(mobi)
  if (!createDocument) return
  mobi.createDocument = async (section) => {
    const doc = await createDocument(section)
    sanitizeDocument(doc)
    return doc
  }
}

export async function openBook(file: File): Promise<Book> {
  const { makeBook } = await loadFoliate()
  const book = await makeBook(file)
  guard(book)
  return book
}
