/*
 * Design brief (refactoring-ui Workflow B), book details.
 *
 * Feature: what a book says about itself, and where it stands in the library.
 * Content, by rank:
 *   primary    cover, title, authors (as on the shelf, larger)
 *   secondary  the description; publisher, date, series, language, subjects, ISBN
 *   tertiary   the file (format, size) and the reader's history (added, last read, progress)
 * Only what the book gives is shown: no "Unknown" rows.
 * Tokens: title 18px semibold fg; labels 14px fg-muted; values 14px fg; subjects as tags
 *   like the formats on the welcome screen.
 */

import { useLiveQuery } from 'dexie-react-hooks'
import { type ReactNode, useEffect, useState } from 'react'
import { type Book, db } from '@/domain/db'
import { openBook } from '@/domain/foliate'
import { loadBookFile } from '@/domain/library'
import { type BookDetails, readDetails } from '@/domain/metadata'
import { formatBytes, formatDay, formatLanguage } from '@/ui/format'
import { Cover } from '@/ui/library/BookCard'
import { Modal } from '@/ui/Modal'

const listFormat = new Intl.ListFormat(undefined, { style: 'short', type: 'conjunction' })
const percent = new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 0 })
type Loaded = { details: BookDetails; file: { size: number } }
type State = Loaded | 'loading' | 'failed'

/**
 * Reads a book's details: from its metadata when the book is open already, or by opening its
 * file, which the library does only when asked.
 */
function useBookDetails(bookId: string | null, metadata: unknown): State {
  const [state, setState] = useState<State>('loading')
  useEffect(() => {
    if (!bookId) return
    let cancelled = false
    setState('loading')
    const read = async () => {
      const file = await loadBookFile(bookId)
      if (!file) throw new Error(`no file stored for ${bookId}`)
      let raw = metadata
      if (raw === undefined) {
        const book = await openBook(file)
        raw = book.metadata
        book.destroy?.()
      }
      if (!cancelled) setState({ details: readDetails(raw), file })
    }
    read().catch((error: unknown) => {
      console.error('could not read the book’s details', error)
      if (!cancelled) setState('failed')
    })
    return () => {
      cancelled = true
    }
  }, [bookId, metadata])
  return state
}

/** A publication date as given: a year stays a year; a full date is written out. */
function formatPublished(value: string): string {
  const date = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (!date) return value
  const [, year, month, day] = date.map(Number)
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'long', timeZone: 'UTC' }).format(
    Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1),
  )
}

const roleLabels = { translator: 'Translator', editor: 'Editor', illustrator: 'Illustrator' }

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="contents">
      <dt className="text-fg-muted">{label}</dt>
      <dd className="min-w-0 text-fg">{children}</dd>
    </div>
  )
}

function Description({ text }: { text: string }) {
  const [whole, setWhole] = useState(false)
  const long = text.length > 400
  return (
    <div className="text-sm leading-normal text-fg-secondary">
      <div className={`space-y-3 whitespace-pre-line ${long && !whole ? 'line-clamp-6' : ''}`}>
        {text.split('\n\n').map((paragraph, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: paragraphs of fixed text never reorder
          <p key={index}>{paragraph}</p>
        ))}
      </div>
      {long && (
        <button
          type="button"
          className="btn btn-link btn-sm mt-1 h-auto min-h-0 px-0 text-action-fg"
          onClick={() => setWhole((value) => !value)}
        >
          {whole ? 'Less' : 'More'}
        </button>
      )}
    </div>
  )
}

interface BookDetailsDialogProps {
  /** The book shown; null while closed. */
  book: Book | null
  /** The open book's metadata, in the reader; the library reads it from the file. */
  metadata?: unknown
  onClose(): void
}

export function BookDetailsDialog({ book, metadata, onClose }: BookDetailsDialogProps) {
  const state = useBookDetails(book?.id ?? null, metadata)
  const fraction = useLiveQuery(
    async () => (book ? ((await db.progress.get(book.id))?.fraction ?? null) : null),
    [book?.id],
  )
  const details = typeof state === 'object' ? state.details : null
  const file = typeof state === 'object' ? state.file : null
  const language = book?.language ? formatLanguage(book.language) : null
  return (
    <Modal open={book !== null} title="Book details" onClose={onClose}>
      {book && (
        <div className="space-y-6">
          <div className="flex gap-6">
            <div className="flex aspect-2/3 w-24 shrink-0 items-end justify-center">
              <Cover book={book} />
            </div>
            <div className="min-w-0 self-end">
              <p className="text-lg leading-tight font-semibold text-fg">{book.title}</p>
              {details?.subtitle && (
                <p className="mt-1 text-sm text-fg-secondary">{details.subtitle}</p>
              )}
              {book.authors.length > 0 && (
                <p className="mt-2 text-sm text-fg-secondary">{listFormat.format(book.authors)}</p>
              )}
              {details?.series && (
                <p className="mt-1 text-sm text-fg-muted">
                  {details.series.name}
                  {details.series.position && `, book ${details.series.position}`}
                </p>
              )}
            </div>
          </div>

          {state === 'loading' && (
            <p className="flex items-center gap-2 text-sm text-fg-muted" role="status">
              <span className="loading loading-spinner loading-xs" aria-hidden />
              Loading details…
            </p>
          )}
          {state === 'failed' && (
            <p className="text-sm text-danger-fg" role="alert">
              The book’s details couldn’t be read.
            </p>
          )}
          {details?.description && <Description text={details.description} />}

          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-2 text-sm">
            {details?.publisher && <Row label="Publisher">{details.publisher}</Row>}
            {details?.published && (
              <Row label="Published">{formatPublished(details.published)}</Row>
            )}
            {language && <Row label="Language">{language}</Row>}
            {details?.contributors.map(({ role, names }) => (
              <Row key={role} label={roleLabels[role]}>
                {listFormat.format(names)}
              </Row>
            ))}
            {details && details.subjects.length > 0 && (
              <Row label="Subjects">
                <ul className="flex flex-wrap gap-2">
                  {details.subjects.map((subject) => (
                    <li key={subject} className="rounded-sm bg-surface-sunken px-2 py-1 text-xs">
                      {subject}
                    </li>
                  ))}
                </ul>
              </Row>
            )}
            {details?.isbn && (
              <Row label="ISBN">
                <span className="tabular-nums">{details.isbn}</span>
              </Row>
            )}
            {file && (
              <Row label="File">
                {book.format && `${book.format}, `}
                {formatBytes(file.size)}
              </Row>
            )}
            <Row label="Added">{formatDay(book.addedAt)}</Row>
            {book.openedAt !== null && <Row label="Last read">{formatDay(book.openedAt)}</Row>}
            {fraction !== null && fraction !== undefined && (
              <Row label="Progress">{percent.format(fraction)}</Row>
            )}
          </dl>
        </div>
      )}
    </Modal>
  )
}
