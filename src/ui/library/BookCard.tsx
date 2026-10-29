import { Check } from 'lucide-react'
import { type MouseEvent, memo, type ReactNode } from 'react'
import type { Book } from '@/domain/db'
import { readerHref } from '@/domain/routes'
import { formatDay } from '@/ui/format'
import { BookMenu } from '@/ui/library/BookMenu'
import { useCover } from '@/ui/library/covers'

const percent = new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 0 })
const listFormat = new Intl.ListFormat(undefined, { style: 'short', type: 'conjunction' })

/** Where the reader is in the book, in the fewest words that say it; nothing before it is begun. */
function progressLabel(fraction: number | undefined): string {
  if (fraction === undefined) return ''
  // The last page of a book rarely reports exactly 1.
  if (fraction >= 0.995) return 'Finished'
  return percent.format(fraction)
}

// Covers are raised off the page like a book on a shelf; the hairline edge is drawn over the
// image so a white cover still has one. A chosen book's cover is ringed instead.
const binding = 'rounded-sm shadow-md transition-shadow duration-150 group-hover:shadow-lg'
const edge = (selected: boolean) =>
  selected
    ? 'outline-2 outline-offset-2 outline-action'
    : 'outline-1 -outline-offset-1 outline-fg/10'

/**
 * The cover at its own proportions, standing on the bottom of a 2:3 slot so that a row of
 * covers shares a baseline, as books on a shelf do. A book without a cover gets a cloth
 * binding with its title stamped on it.
 */
export function Cover({
  book,
  compact = false,
  selected = false,
}: {
  book: Book
  compact?: boolean
  selected?: boolean
}) {
  const cover = useCover(book.id)
  if (cover) {
    const narrow = cover.width / cover.height <= 2 / 3
    // Covers far down a long shelf load as they come into view.
    return (
      <img
        src={cover.url}
        alt=""
        width={cover.width}
        height={cover.height}
        loading="lazy"
        decoding="async"
        className={`${binding} ${edge(selected)} ${narrow ? 'h-full w-auto' : 'h-auto w-full'}`}
      />
    )
  }
  if (cover !== null) return null
  return (
    <div
      className={`${binding} ${edge(selected)} flex size-full flex-col justify-between bg-cover p-3`}
    >
      {/* A thumbnail is too small to stamp; the cloth alone marks it as a book. */}
      {!compact && (
        <>
          <p className="line-clamp-5 font-serif text-sm font-semibold leading-tight text-on-cover">
            {book.title}
          </p>
          {book.authors.length > 0 && (
            <p className="line-clamp-2 text-xs text-on-cover-muted">{book.authors[0]}</p>
          )}
        </>
      )}
    </div>
  )
}

interface BookItemProps {
  book: Book
  fraction: number | undefined
  /** Whether the library is choosing books for an action, rather than opening them. */
  selecting: boolean
  selected: boolean
  /** A click while choosing; `range` when Shift was held. */
  onToggle(book: Book, range: boolean): void
  /** Starts choosing, with this book chosen. */
  onSelect(book: Book): void
  onDetails(book: Book): void
  onDownload(book: Book): void
  onRemove(book: Book): void
}

/** The round mark of a chosen book, where the book's menu sits while not choosing. */
function SelectMark({ selected }: { selected: boolean }) {
  return (
    <span
      aria-hidden
      className={`grid size-6 place-items-center rounded-full ${
        selected ? 'bg-action text-on-action' : 'ring-1 ring-border-strong ring-inset'
      }`}
    >
      {selected && <Check className="size-4 stroke-3" />}
    </span>
  )
}

/**
 * The part of a book that is clicked: a link to read it, or, while choosing, a checkbox. A
 * checkbox here is a button with the role, so that a click can carry Shift for a range.
 */
function BookTarget({
  book,
  selecting,
  selected,
  onToggle,
  className,
  children,
}: Pick<BookItemProps, 'book' | 'selecting' | 'selected' | 'onToggle'> & {
  className: string
  children: ReactNode
}) {
  if (!selecting) {
    return (
      <a href={readerHref(book.id)} className={className} data-book={book.id}>
        {children}
      </a>
    )
  }
  return (
    // biome-ignore lint/a11y/useSemanticElements: an <input type="checkbox"> can't hold the cover and title as one target, and its clicks from a label don't reliably carry Shift
    <button
      type="button"
      role="checkbox"
      aria-checked={selected}
      data-book={book.id}
      className={`${className} cursor-pointer text-start`}
      onClick={(event: MouseEvent) => onToggle(book, event.shiftKey)}
    >
      {children}
    </button>
  )
}

function ItemEnd({
  book,
  selecting,
  selected,
  onSelect,
  onDetails,
  onDownload,
  onRemove,
}: Pick<
  BookItemProps,
  'book' | 'selecting' | 'selected' | 'onSelect' | 'onDetails' | 'onDownload' | 'onRemove'
>) {
  // The mark takes the menu's place, in the same 32-pixel square.
  if (selecting) {
    return (
      <span className="grid size-8 place-items-center">
        <SelectMark selected={selected} />
      </span>
    )
  }
  return (
    <BookMenu
      title={book.title}
      onDetails={() => onDetails(book)}
      onSelect={() => onSelect(book)}
      onDownload={() => onDownload(book)}
      onRemove={() => onRemove(book)}
    />
  )
}

/** Two records of a book that say the same: the library reads every book afresh on each change. */
function sameBook(a: Book, b: Book): boolean {
  if (a === b) return true
  const keys = Object.keys(a) as (keyof Book)[]
  if (keys.length !== Object.keys(b).length) return false
  return keys.every((key) => {
    const x = a[key]
    const y = b[key]
    if (Array.isArray(x) && Array.isArray(y)) {
      return x.length === y.length && x.every((each, index) => each === y[index])
    }
    return Object.is(x, y)
  })
}

/**
 * Whether a book's item can stay as it was drawn. Without this, adding one book, typing a
 * letter of a search or choosing a book would redraw every book on the shelf.
 */
function sameItem(previous: BookItemProps, next: BookItemProps): boolean {
  const keys = Object.keys(next) as (keyof BookItemProps)[]
  if (keys.length !== Object.keys(previous).length) return false
  return keys.every((key) =>
    key === 'book' ? sameBook(previous.book, next.book) : Object.is(previous[key], next[key]),
  )
}

export const BookCard = memo(function BookCard(props: BookItemProps) {
  const { book, fraction, selecting, selected } = props
  const foot = (
    <div className="mt-auto flex h-8 items-center justify-between">
      <span className="text-xs text-fg-muted">{progressLabel(fraction)}</span>
      <div className="-me-2">
        <ItemEnd {...props} />
      </div>
    </div>
  )
  return (
    // The progress row sits at the bottom of every card, so a row of books keeps one line for
    // it however many lines their titles take. While choosing, the whole card is the checkbox,
    // its mark included; otherwise the book's menu sits beside the link.
    // A card out of view is skipped when the page is laid out and drawn, at the size it last
    // had (at first, about a card's height); a long shelf otherwise lays out every card each
    // time a book is added. That clips what a card draws outside itself, so the card reaches
    // into the gaps around it, far enough for its focus ring and its cover's shadow.
    <li className="-m-3 flex flex-col p-3 [contain-intrinsic-block-size:auto_21rem] [content-visibility:auto]">
      <BookTarget
        {...props}
        className="group flex w-full grow flex-col rounded-sm focus-visible:outline-offset-4"
      >
        <div className="flex aspect-2/3 items-end justify-center">
          <Cover book={book} selected={selecting && selected} />
        </div>
        <p className="mt-3 line-clamp-2 text-sm font-semibold leading-tight text-fg">
          {book.title}
        </p>
        {book.authors.length > 0 && (
          <p className="mt-1 truncate text-sm text-fg-secondary">
            {listFormat.format(book.authors)}
          </p>
        )}
        {selecting && foot}
      </BookTarget>
      {!selecting && foot}
    </li>
  )
}, sameItem)

/**
 * The columns of the list, shared by its heading and its rows: the cover, the title, then on
 * wider screens the author in a column of its own, on the widest the days the book was last
 * read and added, and the progress; the last column holds the book's menu. While choosing,
 * the menu's column goes and a column for the mark leads the row instead, and the rows (and
 * their heading) are inset, so a chosen row's tint has room around what it holds. Each row
 * lays its cells on these columns through a subgrid, so the columns line up down the list.
 */
export function listColumns(selecting: boolean): string {
  // Whole class names, for Tailwind to find.
  return selecting
    ? 'grid gap-x-4 grid-cols-[var(--spacing-8)_var(--spacing-12)_minmax(0,1fr)_var(--spacing-16)] md:grid-cols-[var(--spacing-8)_var(--spacing-12)_minmax(0,3fr)_minmax(0,2fr)_var(--spacing-24)] lg:grid-cols-[var(--spacing-8)_var(--spacing-12)_minmax(0,3fr)_minmax(0,2fr)_var(--spacing-32)_var(--spacing-32)_var(--spacing-24)]'
    : 'grid gap-x-4 grid-cols-[var(--spacing-12)_minmax(0,1fr)_var(--spacing-16)_var(--spacing-8)] md:grid-cols-[var(--spacing-12)_minmax(0,3fr)_minmax(0,2fr)_var(--spacing-24)_var(--spacing-8)] lg:grid-cols-[var(--spacing-12)_minmax(0,3fr)_minmax(0,2fr)_var(--spacing-32)_var(--spacing-32)_var(--spacing-24)_var(--spacing-8)]'
}

/**
 * The same book as a row of a list, for libraries scanned by title and author rather than by
 * cover. The cover shrinks to a thumbnail that still says which book it is.
 */
export const BookRow = memo(function BookRow(props: BookItemProps) {
  const { book, fraction, selecting, selected } = props
  const authors = book.authors.length > 0 ? listFormat.format(book.authors) : ''
  return (
    <li
      className={`${listColumns(selecting)} items-center py-2 ${selecting ? 'px-3' : ''} ${
        selecting && selected ? 'bg-action-subtle/50' : ''
      }`}
    >
      {/* While choosing, the whole row is the checkbox, its mark at the start. */}
      <BookTarget
        {...props}
        className={`group grid grid-cols-subgrid items-center rounded-md focus-visible:outline-offset-2 ${
          selecting ? 'col-span-full' : 'col-[1/-2]'
        }`}
      >
        {selecting && (
          <span className="grid place-items-center">
            <SelectMark selected={selected} />
          </span>
        )}
        {/* Centred in its slot: a wide cover, a thin strip, is easier to place there. */}
        <div className="flex aspect-2/3 items-center justify-center">
          <Cover book={book} compact />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-fg group-hover:text-action-fg">
            {book.title}
          </p>
          {authors && (
            <p className="mt-1 truncate text-sm text-fg-secondary md:hidden">{authors}</p>
          )}
        </div>
        <p className="hidden truncate text-sm text-fg-secondary md:block">{authors}</p>
        <span className="hidden text-sm text-fg-secondary lg:block">
          {book.openedAt === null ? '' : formatDay(book.openedAt)}
        </span>
        <span className="hidden text-sm text-fg-secondary lg:block">{formatDay(book.addedAt)}</span>
        <span className="text-end text-xs text-fg-muted tabular-nums">
          {progressLabel(fraction)}
        </span>
      </BookTarget>
      {!selecting && <ItemEnd {...props} />}
    </li>
  )
}, sameItem)
