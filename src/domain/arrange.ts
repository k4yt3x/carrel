import type { Book } from '@/domain/db'

export const sortOrders = ['recent', 'added', 'title', 'author'] as const
export type SortOrder = (typeof sortOrders)[number]

export const isSortOrder = (value: unknown): value is SortOrder =>
  sortOrders.includes(value as SortOrder)

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true })

/** Case- and accent-insensitive form for matching a search against titles and names. */
const fold = (text: string) => text.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase()

const lastActivity = (book: Book) => Math.max(book.addedAt, book.openedAt ?? 0)

const compare: Record<SortOrder, (a: Book, b: Book) => number> = {
  recent: (a, b) => lastActivity(b) - lastActivity(a),
  added: (a, b) => b.addedAt - a.addedAt,
  title: (a, b) => collator.compare(a.title, b.title),
  // Books without an author go last rather than first.
  author: (a, b) =>
    collator.compare(a.authors[0] ?? '\uffff', b.authors[0] ?? '\uffff') ||
    collator.compare(a.title, b.title),
}

/** The books matching every word of the query, in the chosen order. */
export function arrangeBooks(books: readonly Book[], sort: SortOrder, query: string): Book[] {
  const words = fold(query).split(/\s+/).filter(Boolean)
  const matches = words.length
    ? books.filter((book) => {
        const haystack = fold([book.title, ...book.authors].join(' '))
        return words.every((word) => haystack.includes(word))
      })
    : [...books]
  return matches.sort(compare[sort])
}
