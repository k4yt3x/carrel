/*
 * Design brief (refactoring-ui Workflow B), library screen.
 *
 * Feature: find a book and open it; add more.
 * Content, by rank:
 *   primary    the books themselves: cover, then title
 *   secondary  author, reading progress
 *   tertiary   search, sort, the per-book menu
 * Actions: one primary, "Add books" (in the empty state it is the page's only action, so
 *   the header copy is hidden there); search and sort are secondary; removing a book is
 *   tertiary and sits behind each book's menu.
 * Tokens: page bg-surface; text tiers fg / fg-secondary / fg-muted; weights 400 and 600;
 *   covers radius-sm with shadow-md, raised to shadow-lg on hover; grid gaps 24/32 across
 *   and 48 down, so a cover sits closer to its own caption than to the row below.
 */

import { useLiveQuery } from 'dexie-react-hooks'
import { Plus, Search } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { arrangeBooks, isSortOrder, type SortOrder } from '@/domain/arrange'
import { type Book, db } from '@/domain/db'
import { bookExtensions, removeBook } from '@/domain/library'
import { useImports } from '@/store/imports'
import { useLibraryView } from '@/store/libraryView'
import { ConfirmDialog } from '@/ui/ConfirmDialog'
import { BookCard } from '@/ui/library/BookCard'
import { DropOverlay } from '@/ui/library/DropOverlay'
import { EmptyLibrary } from '@/ui/library/EmptyLibrary'
import { ImportNotice } from '@/ui/library/ImportNotice'

const sortLabels: Record<SortOrder, string> = {
  recent: 'Recently read',
  added: 'Recently added',
  title: 'Title',
  author: 'Author',
}

export function LibraryPage() {
  const books = useLiveQuery(() => db.books.toArray(), [])
  const progress = useLiveQuery(
    async () => new Map((await db.progress.toArray()).map((p) => [p.id, p.fraction])),
    [],
  )
  const sort = useLibraryView((state) => state.sort)
  const setSort = useLibraryView((state) => state.setSort)
  const addFiles = useImports((state) => state.add)
  const [query, setQuery] = useState('')
  const [removing, setRemoving] = useState<Book | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const shown = useMemo(() => arrangeBooks(books ?? [], sort, query), [books, sort, query])
  const pickFiles = () => fileInput.current?.click()
  const onDrop = useCallback((files: File[]) => addFiles(files), [addFiles])

  useEffect(() => {
    document.title = 'Carrel'
  }, [])

  const hasBooks = books !== undefined && books.length > 0

  return (
    <div className="min-h-dvh bg-surface">
      <header className="mx-auto max-w-7xl px-4 pt-6 pb-8 sm:px-8 sm:pt-8">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
          <h1 className="font-serif text-2xl font-semibold tracking-tight text-fg">Carrel</h1>
          {hasBooks && (
            <>
              <div className="order-last flex w-full gap-3 sm:order-none sm:ms-auto sm:w-auto">
                <label className="input min-w-0 flex-1 bg-surface-sunken sm:w-64 sm:flex-none">
                  <Search aria-hidden className="size-4 text-fg-muted" />
                  <input
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search"
                    aria-label="Search your library"
                  />
                </label>
                <select
                  className="select w-auto bg-surface-sunken"
                  value={sort}
                  aria-label="Sort books"
                  onChange={(event) => {
                    if (isSortOrder(event.target.value)) setSort(event.target.value)
                  }}
                >
                  {Object.entries(sortLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <button type="button" className="btn btn-primary ms-auto sm:ms-0" onClick={pickFiles}>
                <Plus aria-hidden className="size-4" />
                Add books
              </button>
            </>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 pb-24 sm:px-8">
        {books !== undefined && books.length === 0 && <EmptyLibrary onAdd={pickFiles} />}
        {hasBooks && shown.length === 0 && (
          <div className="py-24 text-center">
            <p className="text-fg">No books match “{query}”.</p>
            <button
              type="button"
              className="btn btn-link mt-2 text-action-fg"
              onClick={() => setQuery('')}
            >
              Clear search
            </button>
          </div>
        )}
        {shown.length > 0 && (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(var(--spacing-32),1fr))] gap-x-6 gap-y-12 sm:gap-x-8">
            {shown.map((book) => (
              <BookCard
                key={book.id}
                book={book}
                fraction={progress?.get(book.id)}
                onRemove={setRemoving}
              />
            ))}
          </ul>
        )}
      </main>

      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        accept={bookExtensions.join(',')}
        onChange={(event) => {
          addFiles([...(event.target.files ?? [])])
          event.target.value = ''
        }}
      />
      <DropOverlay onDrop={onDrop} />
      <ImportNotice />
      <ConfirmDialog
        open={removing !== null}
        title={`Remove “${removing?.title ?? ''}”?`}
        confirmLabel="Remove"
        failureMessage="The book couldn’t be removed. Try again."
        onCancel={() => setRemoving(null)}
        onConfirm={async () => {
          if (removing) await removeBook(removing.id)
          setRemoving(null)
        }}
      >
        The book and your place in it will be deleted from this browser. To read it again, you’ll
        need to add the file again.
      </ConfirmDialog>
    </div>
  )
}
