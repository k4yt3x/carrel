/*
 * Design brief (refactoring-ui Workflow B), reader screen.
 *
 * Feature: read. The page is the figure; everything else stays out of its way.
 * Content, by rank:
 *   primary    the book page
 *   secondary  where you are: chapter and progress, set small and muted in the page margins
 *   tertiary   the controls, hidden until a tap in the middle of the page asks for them
 * Actions: no primary action. Back, contents and the progress scrubber are tertiary icon
 *   controls on raised bars (surface-raised, shadow-md) that slide in over the page.
 * Tokens: page colours come from the semantic surface / fg / action-fg tokens, so the book
 *   follows the app's theme; marginal text is 12px fg-muted; bars are 64px tall.
 */

import { useLiveQuery } from 'dexie-react-hooks'
import type { RelocateDetail, Renderer, TocItem, View } from 'foliate-js/view.js'
import { ArrowLeft, ListTree } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { db } from '@/domain/db'
import { type Book, loadFoliate, openBook } from '@/domain/foliate'
import { loadBookFile, markOpened, saveProgress } from '@/domain/library'
import { libraryHref } from '@/domain/routes'
import {
  createWheelHandler,
  handleKey,
  handleTap,
  type Navigator,
  viewportX,
} from '@/ui/reader/navigation'
import { colorSchemeQuery, currentPageTheme, pageStyles } from '@/ui/reader/pageStyles'
import { TocDrawer } from '@/ui/reader/TocDrawer'

type Status = 'opening' | 'ready' | 'missing' | 'failed'

const percent = new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 0 })

/** Saves the reading position at most every half second, and on demand when leaving. */
function createProgressSaver(id: string, onError: (error: unknown) => void) {
  let pending: { location: string; fraction: number } | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  const flush = () => {
    clearTimeout(timer)
    if (!pending) return
    const progress = pending
    pending = null
    saveProgress({ id, ...progress }).catch(onError)
  }
  return {
    schedule(progress: { location: string; fraction: number }) {
      pending = progress
      clearTimeout(timer)
      timer = setTimeout(flush, 500)
    },
    flush,
  }
}

/** Opens a link from a book in a new tab, if it is a kind of link worth following. */
function openExternal(href: string) {
  let url: URL
  try {
    url = new URL(href)
  } catch {
    return
  }
  if (!['http:', 'https:', 'mailto:'].includes(url.protocol)) return
  window.open(url, '_blank', 'noopener,noreferrer')
}

/**
 * Running heads and feet in the page margins: in a two-page spread the left page carries the
 * book's title and the right the chapter's, as in a printed book; the progress goes at the
 * foot of the last page.
 */
function fillMarginals(renderer: Renderer, title: string, detail: RelocateDetail) {
  const heads = renderer.heads ?? []
  const feet = renderer.feet ?? []
  const chapter = detail.tocItem?.label?.trim() ?? ''
  heads.forEach((head, index) => {
    head.textContent = heads.length > 1 && index === 0 ? title : chapter || title
  })
  feet.forEach((foot, index) => {
    foot.textContent = index === feet.length - 1 ? percent.format(detail.fraction) : ''
  })
}

function positionLabel(position: RelocateDetail | null, fixedLayout: boolean): string {
  if (!position) return ''
  if (fixedLayout && position.section) {
    return `${position.section.current + 1} of ${position.section.total}`
  }
  return percent.format(position.fraction)
}

export function ReaderPage({ bookId }: { bookId: string }) {
  const record = useLiveQuery(() => db.books.get(bookId), [bookId])
  const host = useRef<HTMLDivElement>(null)
  const viewRef = useRef<View | null>(null)
  const [status, setStatus] = useState<Status>('opening')
  const [toc, setToc] = useState<TocItem[]>([])
  const [position, setPosition] = useState<RelocateDetail | null>(null)
  const [fixedLayout, setFixedLayout] = useState(false)
  const [chromeShown, setChromeShown] = useState(true)
  const [tocOpen, setTocOpen] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)
  const [scrub, setScrub] = useState<number | null>(null)
  const chromeHeld = useRef(false)

  // Handlers attached to book documents outlive renders; they read the latest state here.
  const latest = useRef({ title: '', tocOpen: false })
  latest.current = { title: record?.title ?? '', tocOpen }

  useEffect(() => {
    document.title = record ? `${record.title} · Carrel` : 'Carrel'
  }, [record])

  useEffect(() => {
    const container = host.current
    if (!container) return
    let cancelled = false
    let view: View | null = null
    let book: Book | null = null
    const saver = createProgressSaver(bookId, (error) => {
      console.error('could not save the reading position', error)
      setSaveFailed(true)
    })

    const navigator: Navigator = {
      turn(direction) {
        setChromeShown(false)
        if (!view) return
        let turning: Promise<void>
        if (direction === 'left') turning = view.goLeft()
        else if (direction === 'right') turning = view.goRight()
        else if (direction === 'prev') turning = view.prev()
        else turning = view.next()
        turning.catch((error: unknown) => console.error('could not turn the page', error))
      },
      toggleChrome: () => setChromeShown((shown) => !shown),
      hideChrome: () => setChromeShown(false),
      isBusy: () => latest.current.tocOpen,
    }
    const onKey = (event: KeyboardEvent) => handleKey(event, navigator)
    const onWheel = createWheelHandler(navigator)
    const onHostClick = (event: MouseEvent) => handleTap(event, event.clientX, navigator)
    const applyTheme = () => view?.renderer.setStyles?.(pageStyles(currentPageTheme()))
    const schemeQuery = colorSchemeQuery()

    const open = async () => {
      const [file, progress] = await Promise.all([loadBookFile(bookId), db.progress.get(bookId)])
      if (cancelled) return
      if (!file) {
        setStatus('missing')
        return
      }
      await loadFoliate()
      book = await openBook(file)
      if (cancelled) return

      view = document.createElement('foliate-view') as View
      viewRef.current = view
      view.addEventListener('relocate', (event) => {
        const detail = event.detail
        setPosition(detail)
        saver.schedule({ location: detail.cfi, fraction: detail.fraction })
        if (view) fillMarginals(view.renderer, latest.current.title, detail)
      })
      view.addEventListener('load', (event) => {
        const { doc } = event.detail
        doc.addEventListener('keydown', onKey)
        doc.addEventListener('wheel', onWheel, { passive: true })
        doc.addEventListener('click', (click) => handleTap(click, viewportX(click, doc), navigator))
      })
      view.addEventListener('external-link', (event) => {
        event.preventDefault()
        openExternal(event.detail.href)
      })
      container.append(view)
      await view.open(book)
      if (cancelled) return

      const renderer = view.renderer
      if (!view.isFixedLayout) {
        // The paginator takes these as CSS lengths. The top and bottom margins hold the
        // running heads and feet.
        renderer.setAttribute('flow', 'paginated')
        renderer.setAttribute('margin-top', '48px')
        renderer.setAttribute('margin-bottom', '48px')
        renderer.setAttribute('margin-left', '16px')
        renderer.setAttribute('margin-right', '16px')
        renderer.setAttribute('max-inline-size', '640px')
        renderer.setAttribute('max-column-count', '2')
        if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          renderer.toggleAttribute('animated', true)
        }
      }
      applyTheme()
      setToc(book.toc ?? [])
      setFixedLayout(view.isFixedLayout)

      await view.init({ lastLocation: progress?.location ?? null })
      if (cancelled) return
      setStatus('ready')
      markOpened(bookId).catch((error: unknown) =>
        console.error('could not record that the book was opened', error),
      )
    }

    window.addEventListener('keydown', onKey)
    window.addEventListener('pagehide', saver.flush)
    container.addEventListener('wheel', onWheel, { passive: true })
    container.addEventListener('click', onHostClick)
    schemeQuery.addEventListener('change', applyTheme)
    open().catch((error: unknown) => {
      console.error('could not open the book', error)
      if (!cancelled) setStatus('failed')
    })

    return () => {
      cancelled = true
      saver.flush()
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pagehide', saver.flush)
      container.removeEventListener('wheel', onWheel)
      container.removeEventListener('click', onHostClick)
      schemeQuery.removeEventListener('change', applyTheme)
      view?.close()
      view?.remove()
      book?.destroy?.()
      viewRef.current = null
    }
  }, [bookId])

  // The bars are up when the book opens, so they can be found, and step aside shortly after.
  useEffect(() => {
    if (status !== 'ready' || !chromeShown) return
    const timer = setTimeout(() => {
      if (!chromeHeld.current) setChromeShown(false)
    }, 4000)
    return () => clearTimeout(timer)
  }, [status, chromeShown])

  const goTo = (href: string) => {
    setTocOpen(false)
    setChromeShown(false)
    viewRef.current?.goTo(href).catch((error: unknown) => console.error(error))
  }

  const commitScrub = () => {
    if (scrub === null) return
    viewRef.current?.goToFraction(scrub).catch((error: unknown) => console.error(error))
    setScrub(null)
  }

  const chapter = position?.tocItem?.label?.trim()
  const bar = `absolute inset-x-0 z-20 bg-surface-raised shadow-md transition duration-200 ease-out`
  // While the pointer rests on the bars or focus is inside them, they stay up.
  const holdChrome = {
    onPointerEnter: () => {
      chromeHeld.current = true
    },
    onPointerLeave: () => {
      chromeHeld.current = false
    },
    // The bars stay in the focus order while hidden, so the keyboard can always reach Back and
    // Contents; reaching them brings the bars up.
    onFocus: () => {
      chromeHeld.current = true
      setChromeShown(true)
    },
    onBlur: () => {
      chromeHeld.current = false
    },
  }

  return (
    <div className="fixed inset-0 overflow-hidden bg-surface text-fg">
      <div ref={host} className="absolute inset-0" />

      {status === 'opening' && (
        <div className="absolute inset-0 grid place-items-center">
          <div className="flex items-center gap-3 text-sm text-fg-muted" role="status">
            <span className="loading loading-spinner loading-sm" aria-hidden />
            Opening book…
          </div>
        </div>
      )}
      {(status === 'missing' || status === 'failed') && (
        <div className="absolute inset-0 grid place-items-center p-8">
          <div className="max-w-sm text-center" role="alert">
            <p className="text-lg font-semibold text-fg">
              {status === 'missing'
                ? 'This book isn’t in your library'
                : 'This book couldn’t be opened'}
            </p>
            <p className="mt-2 text-sm text-fg-secondary">
              {status === 'missing'
                ? 'It may have been removed in another tab.'
                : 'The file may be damaged or in a form Carrel can’t display.'}
            </p>
            <a href={libraryHref} className="btn btn-primary mt-8">
              Back to library
            </a>
          </div>
        </div>
      )}

      {status === 'ready' && (
        <>
          <header
            {...holdChrome}
            className={`${bar} top-0 pt-[env(safe-area-inset-top)] ${
              chromeShown
                ? 'translate-y-0 opacity-100'
                : 'pointer-events-none -translate-y-full opacity-0'
            }`}
          >
            <div className="flex h-16 items-center gap-2 px-2 sm:px-4">
              <a
                href={libraryHref}
                className="btn btn-ghost btn-square"
                aria-label="Back to library"
              >
                <ArrowLeft aria-hidden className="size-6" />
              </a>
              <div className="min-w-0 flex-1 px-2">
                <p className="truncate text-sm font-semibold text-fg">{record?.title}</p>
                {chapter && <p className="truncate text-xs text-fg-muted">{chapter}</p>}
              </div>
              {toc.length > 0 && (
                <button
                  type="button"
                  className="btn btn-ghost btn-square"
                  aria-label="Contents"
                  onClick={() => setTocOpen(true)}
                >
                  <ListTree aria-hidden className="size-6" />
                </button>
              )}
            </div>
          </header>

          <footer
            {...holdChrome}
            className={`${bar} bottom-0 pb-[env(safe-area-inset-bottom)] ${
              chromeShown
                ? 'translate-y-0 opacity-100'
                : 'pointer-events-none translate-y-full opacity-0'
            }`}
          >
            <div className="mx-auto flex h-16 max-w-3xl items-center gap-4 px-6">
              <input
                type="range"
                className="range range-xs range-primary min-w-0 flex-1"
                min={0}
                max={1}
                step="any"
                aria-label="Position in book"
                aria-valuetext={positionLabel(position, fixedLayout)}
                value={scrub ?? position?.fraction ?? 0}
                onChange={(event) => setScrub(Number(event.target.value))}
                onPointerUp={commitScrub}
                onKeyUp={commitScrub}
              />
              <span className="w-16 shrink-0 text-xs text-fg-muted tabular-nums">
                {scrub !== null ? percent.format(scrub) : positionLabel(position, fixedLayout)}
              </span>
            </div>
          </footer>
        </>
      )}

      {saveFailed && (
        <p
          role="alert"
          className="absolute inset-x-4 bottom-24 z-30 mx-auto max-w-sm rounded-lg bg-danger-subtle px-4 py-3 text-center text-sm text-danger-fg shadow-lg"
        >
          Your place in this book couldn’t be saved.
        </p>
      )}

      <TocDrawer
        open={tocOpen}
        items={toc}
        currentHref={position?.tocItem?.href}
        onSelect={goTo}
        onClose={() => setTocOpen(false)}
      />
    </div>
  )
}
