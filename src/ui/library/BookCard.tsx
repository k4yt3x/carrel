import { useLiveQuery } from 'dexie-react-hooks'
import { type Book, db } from '@/domain/db'
import { readerHref } from '@/domain/routes'
import { BookMenu } from '@/ui/library/BookMenu'
import { useObjectUrl } from '@/ui/useObjectUrl'

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
// image so a white cover still has one.
const binding =
  'rounded-sm shadow-md outline-1 -outline-offset-1 outline-fg/10 transition-shadow duration-150 group-hover:shadow-lg'

/**
 * The cover at its own proportions, standing on the bottom of a 2:3 slot so that a row of
 * covers shares a baseline, as books on a shelf do. A book without a cover gets a cloth
 * binding with its title stamped on it.
 */
function Cover({ book }: { book: Book }) {
  // undefined while the query runs, null once it has found no cover
  const cover = useLiveQuery(async () => (await db.covers.get(book.id)) ?? null, [book.id])
  const url = useObjectUrl(cover?.image)
  if (cover && url) {
    const narrow = cover.width / cover.height <= 2 / 3
    return (
      <img
        src={url}
        alt=""
        width={cover.width}
        height={cover.height}
        className={`${binding} ${narrow ? 'h-full w-auto' : 'h-auto w-full'}`}
      />
    )
  }
  if (cover !== null) return null
  return (
    <div className={`${binding} flex size-full flex-col justify-between bg-cover p-3`}>
      <p className="line-clamp-5 font-serif text-sm font-semibold leading-tight text-on-cover">
        {book.title}
      </p>
      {book.authors.length > 0 && (
        <p className="line-clamp-2 text-xs text-on-cover-muted">{book.authors[0]}</p>
      )}
    </div>
  )
}

interface BookCardProps {
  book: Book
  fraction: number | undefined
  onRemove(book: Book): void
}

export function BookCard({ book, fraction, onRemove }: BookCardProps) {
  return (
    // The progress row sits at the bottom of every card, so a row of books keeps one line for
    // it however many lines their titles take.
    <li className="flex flex-col">
      <a
        href={readerHref(book.id)}
        className="group block rounded-sm focus-visible:outline-offset-4"
      >
        <div className="flex aspect-2/3 items-end justify-center">
          <Cover book={book} />
        </div>
        <p className="mt-3 line-clamp-2 text-sm font-semibold leading-tight text-fg">
          {book.title}
        </p>
        {book.authors.length > 0 && (
          <p className="mt-1 truncate text-sm text-fg-secondary">
            {listFormat.format(book.authors)}
          </p>
        )}
      </a>
      <div className="mt-auto flex h-8 items-center justify-between">
        <span className="text-xs text-fg-muted">{progressLabel(fraction)}</span>
        <div className="-me-2">
          <BookMenu title={book.title} onRemove={() => onRemove(book)} />
        </div>
      </div>
    </li>
  )
}
