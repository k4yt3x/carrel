/*
 * Design brief (refactoring-ui Workflow B), library screen.
 *
 * Feature: find a book and open it; add more.
 * Content, by rank:
 *   primary    the books themselves: cover, then title
 *   secondary  author, reading progress
 *   tertiary   search, sort, the per-book menu
 * Actions: one primary, "Add books" (in the empty state it is the page's only action, so
 *   the header copy is hidden there); search, sort and the covers/list switch are secondary;
 *   downloading and removing a book are tertiary and sit behind each book's menu; settings
 *   (theme, fonts, backup, storage) are a quiet icon at the end of the header.
 * Choosing several books: "Select" (or Select in a book's menu) puts the library in a mode
 *   where a click chooses a book instead of opening it, Shift-click chooses a run of them, and
 *   the header becomes a bar for the choice: how many, Select all, Remove. Escape or the close
 *   button leaves it. The mark of a chosen book takes the place of its menu.
 * List: it runs the width of the header, in columns that fill it on wider screens (author,
 *   progress, then the days last read and added), under headings that sort by them.
 * Tokens: page bg-surface; text tiers fg / fg-secondary / fg-muted; weights 400 and 600;
 *   covers radius-sm with shadow-md, raised to shadow-lg on hover; grid gaps 24/32 across
 *   and 48 down, so a cover sits closer to its own caption than to the row below.
 */

import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowDown, LayoutGrid, List, Plus, Search, Settings, Trash2, X } from 'lucide-react'
import {
  lazy,
  Suspense,
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { arrangeBooks, isSortOrder, type SortOrder } from '@/domain/arrange'
import { type Book, db } from '@/domain/db'
import { bookExtensions } from '@/domain/formats'
import { loadBookFile, removeBook, removeBooks } from '@/domain/library'
import { useImports } from '@/store/imports'
import { useLibraryView } from '@/store/libraryView'
import { BookDetailsDialog } from '@/ui/BookDetails'
import { ConfirmDialog } from '@/ui/ConfirmDialog'
import { saveFile } from '@/ui/download'
import { BookCard, BookRow, listColumns } from '@/ui/library/BookCard'
import { forgetCovers } from '@/ui/library/covers'
import { DropOverlay } from '@/ui/library/DropOverlay'
import { EmptyLibrary } from '@/ui/library/EmptyLibrary'
import { toggleSelection } from '@/ui/library/selection'
import { pickerAccept } from '@/ui/platform'
import { useThrottledLiveQuery } from '@/ui/useThrottledLiveQuery'

const sortLabels: Record<SortOrder, string> = {
  recent: 'Recently read',
  added: 'Recently added',
  title: 'Title',
  author: 'Author',
}

const count = new Intl.NumberFormat()

// Settings load apart from the library, as soon as it is drawn rather than before.
const LibrarySettings = lazy(async () => ({
  default: (await import('@/ui/library/LibrarySettings')).LibrarySettings,
}))

/** A heading of the list that sorts the books by its column, marked while it does. */
function SortHeading({
  order,
  label,
  sort,
  onSort,
  className = '',
}: {
  order: SortOrder
  label: string
  sort: SortOrder
  onSort(order: SortOrder): void
  className?: string
}) {
  const active = sort === order
  return (
    <button
      type="button"
      aria-pressed={active}
      className={`flex items-center gap-1 justify-self-start text-xs font-semibold tracking-wide uppercase ${
        active ? 'text-fg' : 'text-fg-muted hover:text-fg'
      } ${className}`}
      onClick={() => onSort(order)}
    >
      {label}
      {active && <ArrowDown aria-hidden className="size-3" />}
    </button>
  )
}

/** The link or checkbox of a book on show. */
const bookTarget = (id: string) =>
  document.querySelector<HTMLElement>(`[data-book="${CSS.escape(id)}"]`)

export function LibraryPage() {
  // An import adds books faster than the shelf can be laid out again for each.
  const books = useThrottledLiveQuery(() => db.books.toArray(), 250)
  const progress = useLiveQuery(
    async () => new Map((await db.progress.toArray()).map((p) => [p.id, p.fraction])),
    [],
  )
  const sort = useLibraryView((state) => state.sort)
  const setSort = useLibraryView((state) => state.setSort)
  const layout = useLibraryView((state) => state.layout)
  const setLayout = useLibraryView((state) => state.setLayout)
  const addFiles = useImports((state) => state.add)
  const [query, setQuery] = useState('')
  const [removing, setRemoving] = useState<Book | null>(null)
  const [detailed, setDetailed] = useState<Book | null>(null)
  // Choosing books for an action: which are chosen, and the one clicked last, where a
  // Shift-click's run starts.
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const anchor = useRef<string | null>(null)
  const [removingChosen, setRemovingChosen] = useState(false)
  // Settings open as they are, or straight to restoring a backup.
  const [settings, setSettings] = useState<'closed' | 'open' | 'restore'>('closed')
  const [downloadFailed, setDownloadFailed] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  // The field shows each letter as it is typed; the shelf follows when it has drawn.
  const searched = useDeferredValue(query)
  const shown = useMemo(() => arrangeBooks(books ?? [], sort, searched), [books, sort, searched])
  // For the books' own actions, which stay the same from one drawing to the next.
  const shownNow = useRef(shown)
  useLayoutEffect(() => {
    shownNow.current = shown
  })
  // Only books on show count as chosen, so nothing out of sight is acted on.
  const chosen = shown.filter((book) => selected.has(book.id))
  const allChosen = shown.length > 0 && chosen.length === shown.length
  const pickFiles = () => fileInput.current?.click()
  const onDrop = useCallback((files: File[]) => addFiles(files), [addFiles])

  useEffect(() => {
    document.title = 'Carrel'
  }, [])

  const hasBooks = books !== undefined && books.length > 0

  const download = useCallback(async (book: Book) => {
    setDownloadFailed(null)
    try {
      const file = await loadBookFile(book.id)
      if (!file) throw new Error(`no file stored for ${book.id}`)
      // Too slow for the share sheet, which a second tap opens.
      if ((await saveFile(file, file.name)) === 'retry') setDownloadFailed(book.title)
    } catch (error) {
      console.error('could not download the book', error)
      setDownloadFailed(book.title)
    }
  }, [])
  const Item = layout === 'list' ? BookRow : BookCard

  // Switching modes takes away the control that had the focus (Select, a book's menu, a
  // book's checkbox); the focus moves to what stands in its place.
  const selectButton = useRef<HTMLButtonElement>(null)
  const focusAfterSwitch = useRef<(() => HTMLElement | null) | null>(null)
  useLayoutEffect(() => {
    focusAfterSwitch.current?.()?.focus()
    focusAfterSwitch.current = null
  })

  const startSelecting = useCallback((book?: Book) => {
    setSelected(new Set(book ? [book.id] : []))
    anchor.current = book?.id ?? null
    const first = book?.id ?? shownNow.current[0]?.id
    focusAfterSwitch.current = first ? () => bookTarget(first) : null
    setSelecting(true)
  }, [])
  const stopSelecting = useCallback(() => {
    const focused = document.activeElement?.closest<HTMLElement>('[data-book]')?.dataset.book
    focusAfterSwitch.current = focused ? () => bookTarget(focused) : () => selectButton.current
    setSelecting(false)
    setSelected(new Set())
    anchor.current = null
  }, [])
  const toggle = useCallback((book: Book, range: boolean) => {
    // Read now: the update runs later, after the anchor has moved to this book.
    const from = anchor.current
    const order = shownNow.current.map((each) => each.id)
    setSelected((current) =>
      toggleSelection({ selected: current, order, id: book.id, anchor: from, range }),
    )
    anchor.current = book.id
  }, [])
  const selectAll = useCallback(() => setSelected(new Set(shown.map((book) => book.id))), [shown])

  // While choosing, Escape stops and Ctrl+A (or Command+A) chooses every book on show. Keys
  // meant for a dialog or a field are left to it.
  useEffect(() => {
    if (!selecting) return
    const onKey = (event: KeyboardEvent) => {
      const target = event.target instanceof Element ? event.target : null
      if (target?.closest('dialog, input, textarea, select')) return
      if (event.key === 'Escape') {
        stopSelecting()
      } else if (event.key === 'a' && (event.ctrlKey || event.metaKey) && !event.altKey) {
        event.preventDefault()
        selectAll()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selecting, stopSelecting, selectAll])

  useEffect(() => {
    if (!downloadFailed) return
    const timer = setTimeout(() => setDownloadFailed(null), 6000)
    return () => clearTimeout(timer)
  }, [downloadFailed])

  return (
    // A column the height of the window, so the empty library's welcome can sit in the middle of
    // the space under the header; inside the edges the system draws over (a notch, the home
    // indicator).
    <div className="flex min-h-dvh flex-col bg-surface pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]">
      <header className="mx-auto w-full max-w-7xl px-4 pt-6 pb-8 sm:px-8 sm:pt-8">
        {selecting ? (
          <div className="flex items-center gap-3 sm:gap-6">
            <h1 className="sr-only">Carrel</h1>
            <button
              type="button"
              className="btn btn-ghost btn-square -ms-2"
              aria-label="Stop selecting"
              data-tooltip=""
              onClick={stopSelecting}
            >
              <X aria-hidden className="size-6" />
            </button>
            <p
              className="text-lg font-semibold whitespace-nowrap text-fg tabular-nums"
              role="status"
            >
              {chosen.length === 0 ? 'None selected' : `${count.format(chosen.length)} selected`}
            </p>
            <div className="ms-auto flex gap-3">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={allChosen ? () => setSelected(new Set()) : selectAll}
              >
                {allChosen ? 'Select none' : 'Select all'}
              </button>
              {/* On a phone the bar has room for the bin alone. */}
              <button
                type="button"
                className="btn text-danger-fg max-sm:btn-square disabled:text-fg-muted"
                disabled={chosen.length === 0}
                onClick={() => setRemovingChosen(true)}
              >
                <Trash2 aria-hidden className="size-4" />
                <span className="max-sm:sr-only">Remove…</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-4 sm:gap-x-6">
            <h1 className="flex items-center gap-3 text-2xl font-semibold tracking-tight text-fg max-sm:order-1">
              <img
                src="/icons/icon-192.png"
                alt=""
                width={32}
                height={32}
                draggable={false}
                className="size-8 shrink-0"
              />
              Carrel
            </h1>
            {hasBooks && (
              <>
                {/* Search and sort take a row of their own until the window is wide enough for
                    the whole toolbar on one. On a phone the toolbar is three rows: the name and
                    the actions, search, then how the books are arranged. */}
                <div className="order-last flex w-full gap-3 max-sm:contents lg:order-none lg:ms-auto lg:w-auto">
                  <label className="input min-w-0 flex-1 bg-surface-sunken max-sm:order-4 max-sm:basis-full lg:w-64 lg:flex-none">
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
                    className="select w-auto bg-surface-sunken max-sm:order-5"
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
                <button
                  ref={selectButton}
                  type="button"
                  className="btn btn-ghost ms-auto max-sm:order-6 lg:ms-0"
                  onClick={() => startSelecting()}
                >
                  Select
                </button>
                <fieldset className="flex rounded-md bg-surface-track p-1 max-sm:order-7">
                  <legend className="sr-only">Show books as</legend>
                  {(
                    [
                      ['grid', 'Covers', LayoutGrid],
                      ['list', 'List', List],
                    ] as const
                  ).map(([value, label, Icon]) => (
                    <label key={value} data-tooltip={label}>
                      <input
                        type="radio"
                        name="library-layout"
                        className="peer sr-only"
                        checked={layout === value}
                        aria-label={label}
                        onChange={() => setLayout(value)}
                      />
                      <span className="grid size-8 cursor-pointer place-items-center rounded-sm text-fg-muted hover:text-fg peer-checked:bg-surface-selected peer-checked:text-fg peer-checked:shadow-sm peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus">
                        <Icon aria-hidden className="size-4" />
                      </span>
                    </label>
                  ))}
                </fieldset>
                <button
                  type="button"
                  className="btn btn-primary max-sm:order-2 max-sm:ms-auto"
                  onClick={pickFiles}
                >
                  <Plus aria-hidden className="size-4" />
                  Add books
                </button>
              </>
            )}
            <button
              type="button"
              className={`btn btn-ghost btn-square -me-2 max-sm:order-3 ${hasBooks ? '' : 'ms-auto'}`}
              aria-label="Settings"
              data-tooltip=""
              onClick={() => setSettings('open')}
            >
              <Settings aria-hidden className="size-6" />
            </button>
          </div>
        )}
      </header>

      {/* The bottom padding about matches the header above, so what is centred in here sits at
          the middle of the window. */}
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 pb-24 sm:px-8">
        {books !== undefined && books.length === 0 && (
          <EmptyLibrary onAdd={pickFiles} onRestore={() => setSettings('restore')} />
        )}
        {hasBooks && shown.length === 0 && (
          <div className="py-24 text-center">
            <p className="text-fg">No books match “{searched}”.</p>
            <button
              type="button"
              className="btn btn-link mt-2 text-action-fg"
              onClick={() => setQuery('')}
            >
              Clear search
            </button>
          </div>
        )}
        {shown.length > 0 && layout === 'list' && (
          // Narrow screens show each book's author under its title, with no headings.
          <fieldset
            className={`${listColumns(selecting)} hidden items-center border-b border-border pb-3 md:grid ${
              selecting ? 'px-3' : ''
            }`}
          >
            <legend className="sr-only">Sort by</legend>
            {/* Over the mark (while choosing) and the cover, nothing. */}
            <span className={selecting ? 'col-span-2' : ''} />
            <SortHeading order="title" label="Title" sort={sort} onSort={setSort} />
            <SortHeading order="author" label="Author" sort={sort} onSort={setSort} />
            <SortHeading
              order="recent"
              label="Last read"
              sort={sort}
              onSort={setSort}
              className="hidden lg:flex"
            />
            <SortHeading
              order="added"
              label="Added"
              sort={sort}
              onSort={setSort}
              className="hidden lg:flex"
            />
            <span className="text-end text-xs font-semibold tracking-wide text-fg-muted uppercase">
              Progress
            </span>
          </fieldset>
        )}
        {shown.length > 0 && (
          <ul
            // While choosing, a Shift-click would otherwise select the text between two books.
            className={`${selecting ? 'select-none' : ''} ${
              layout === 'list'
                ? 'divide-y divide-border'
                : 'grid grid-cols-[repeat(auto-fill,minmax(var(--spacing-32),1fr))] gap-x-6 gap-y-12 sm:gap-x-8'
            }`}
          >
            {shown.map((book) => (
              <Item
                key={book.id}
                book={book}
                fraction={progress?.get(book.id)}
                selecting={selecting}
                selected={selected.has(book.id)}
                onToggle={toggle}
                onSelect={startSelecting}
                onDetails={setDetailed}
                onDownload={download}
                onRemove={setRemoving}
              />
            ))}
          </ul>
        )}
        {downloadFailed && (
          <p
            role="alert"
            className="fixed inset-x-4 bottom-[calc(24px+env(safe-area-inset-bottom))] z-60 mx-auto max-w-sm rounded-lg bg-danger-subtle px-4 py-3 text-center text-sm text-danger-fg shadow-lg"
          >
            “{downloadFailed}” couldn’t be downloaded. Try again.
          </p>
        )}
      </main>

      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        accept={pickerAccept(bookExtensions)}
        onChange={(event) => {
          addFiles([...(event.target.files ?? [])])
          event.target.value = ''
        }}
      />
      <DropOverlay onDrop={onDrop} />
      <Suspense fallback={null}>
        <LibrarySettings
          open={settings !== 'closed'}
          restore={settings === 'restore'}
          onClose={() => setSettings('closed')}
        />
      </Suspense>
      <BookDetailsDialog book={detailed} onClose={() => setDetailed(null)} />
      <ConfirmDialog
        open={removing !== null}
        title={`Remove “${removing?.title ?? ''}”?`}
        confirmLabel="Remove"
        failureMessage="The book couldn’t be removed. Try again."
        onCancel={() => setRemoving(null)}
        onConfirm={async () => {
          if (removing) {
            await removeBook(removing.id)
            forgetCovers([removing.id])
          }
          setRemoving(null)
        }}
      >
        The book and your place in it will be deleted from this browser.
      </ConfirmDialog>
      <ConfirmDialog
        open={removingChosen}
        title={
          chosen.length === 1
            ? `Remove “${chosen[0]?.title ?? ''}”?`
            : `Remove ${count.format(chosen.length)} books?`
        }
        confirmLabel="Remove"
        failureMessage="The books couldn’t be removed. Try again."
        onCancel={() => setRemovingChosen(false)}
        onConfirm={async () => {
          const ids = chosen.map((book) => book.id)
          await removeBooks(ids)
          forgetCovers(ids)
          setRemovingChosen(false)
          stopSelecting()
        }}
      >
        {chosen.length === 1
          ? 'The book and your place in it will be deleted from this browser.'
          : 'The books and your places in them will be deleted from this browser.'}
      </ConfirmDialog>
    </div>
  )
}
