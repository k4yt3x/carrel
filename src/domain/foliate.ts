/**
 * The one way a book file becomes a foliate-js book in carrel. Every book, whether it is
 * being inspected on import or opened to read, comes through here so that the guards below
 * are never skipped.
 */

import type { Book, ResourceDataDetail, ResourceLoadDetail } from 'foliate-js/view.js'
import { isMarkupType, sanitizeMarkup } from '@/domain/sanitize'

export type { Book } from 'foliate-js/view.js'

/** Loads foliate-js, which also registers the `<foliate-view>` element. */
export const loadFoliate = () => import('foliate-js/view.js')

/**
 * Keeps a book's scripts out of the page: EPUB script resources are never loaded, and every
 * markup document is sanitized before it is turned into a URL the renderer can load.
 */
function guard(book: Book): void {
  const target = book.transformTarget
  if (!target) return
  target.addEventListener('load', (event) => {
    const detail = (event as CustomEvent<ResourceLoadDetail>).detail
    if (detail.isScript) detail.allow = false
  })
  target.addEventListener('data', (event) => {
    const detail = (event as CustomEvent<ResourceDataDetail>).detail
    const { type } = detail
    // The type is a plain string when the event fires; other listeners (the paginator's CSS
    // rewrite) compare it synchronously, so it is only replaced for markup.
    if (typeof type !== 'string' || !isMarkupType(type)) return
    const sanitized = Promise.resolve(detail.data).then(async (data) => {
      const source = typeof data === 'string' ? data : await new Blob([data as BlobPart]).text()
      return sanitizeMarkup(source, type)
    })
    detail.data = sanitized.then((result) => result.source)
    detail.type = sanitized.then((result) => result.type)
  })
}

export async function openBook(file: File): Promise<Book> {
  const { makeBook } = await loadFoliate()
  const book = await makeBook(file)
  guard(book)
  return book
}
