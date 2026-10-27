/*
 * Design brief (refactoring-ui Workflow B), reader screen.
 *
 * Feature: read. The page is the figure; everything else stays out of its way.
 * Content, by rank:
 *   primary    the book page
 *   secondary  where you are: chapter and progress, set small and muted in the page margins
 *   tertiary   the controls, hidden until a tap in the middle of the page asks for them
 * Actions: no primary action. Back, search, contents, reading settings, full screen and the
 *   progress scrubber are tertiary icon controls on raised bars (surface-raised, shadow-md)
 *   that slide in over the page.
 * Tokens: page colours come from the semantic surface / fg / action-fg tokens, so the book
 *   follows the app's theme; marginal text is 12px fg-muted; bars are 64px tall.
 */

import { useLiveQuery } from 'dexie-react-hooks'
import { FootnoteHandler } from 'foliate-js/footnotes.js'
import type { RelocateDetail, Renderer, TocItem, View } from 'foliate-js/view.js'
import {
  ALargeSmall,
  ArrowLeft,
  ListTree,
  Maximize,
  Minimize,
  Search,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { db } from '@/domain/db'
import { type Book, loadFoliate, openBook } from '@/domain/foliate'
import { fontCssFamily } from '@/domain/fonts'
import { loadBookFile, markOpened, saveProgress } from '@/domain/library'
import { libraryHref } from '@/domain/routes'
import type { ReadingSettings } from '@/domain/settings'
import { useAppSettings } from '@/store/appSettings'
import { FontsDialog } from '@/ui/fonts/FontsDialog'
import { FootnotePopup, type Note, presentNote } from '@/ui/reader/FootnotePopup'
import { applyAttributes, fixedLayoutAttributes, paginatorAttributes } from '@/ui/reader/layout'
import {
  createWheelHandler,
  handleKey,
  handleTap,
  type Navigator,
  viewportX,
} from '@/ui/reader/navigation'
import { currentPageTheme, pageStyles, systemFontStacks } from '@/ui/reader/pageStyles'
import { SearchSheet } from '@/ui/reader/SearchSheet'
import { SettingsSheet } from '@/ui/reader/SettingsSheet'
import { themeSearchMarks } from '@/ui/reader/searchMarks'
import { TocDrawer } from '@/ui/reader/TocDrawer'
import { useFontFaces } from '@/ui/reader/useFontFaces'
import { useReadingSettings } from '@/ui/reader/useReadingSettings'
import { useTheme } from '@/ui/useTheme'

type Status = 'opening' | 'ready' | 'missing' | 'failed'

type Panel = 'toc' | 'search' | 'settings' | 'fonts' | null

const percent = new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 0 })

/** Zoom levels for fixed-layout pages, in percent of the fitted size. */
const zoomSteps = [50, 75, 100, 125, 150, 200, 300, 400]

function nextZoom(current: number, change: 'in' | 'out' | 'reset'): number {
  if (change === 'reset') return 100
  if (change === 'in') return zoomSteps.find((step) => step > current) ?? current
  return zoomSteps.findLast((step) => step < current) ?? current
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

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
function fillMarginals(renderer: Renderer, title: string, detail: RelocateDetail, shown: boolean) {
  const heads = renderer.heads ?? []
  const feet = renderer.feet ?? []
  const chapter = detail.tocItem?.label?.trim() ?? ''
  heads.forEach((head, index) => {
    head.textContent = !shown ? '' : heads.length > 1 && index === 0 ? title : chapter || title
  })
  feet.forEach((foot, index) => {
    foot.textContent = shown && index === feet.length - 1 ? percent.format(detail.fraction) : ''
  })
}

function positionLabel(position: RelocateDetail | null, fixedLayout: boolean): string {
  if (!position) return ''
  if (fixedLayout && position.section) {
    return `${position.section.current + 1} of ${position.section.total}`
  }
  return percent.format(position.fraction)
}

interface Appearance {
  settings: ReadingSettings
  scheme: 'light' | 'dark'
  /** CSS font-family for the chosen typeface, or null to keep the book's fonts. */
  fontFamily: string | null
  fontFaces: string
}

/** Lays the book out and styles its pages to the settings, changing only what differs. */
function applyAppearance(view: View, appearance: Appearance, applied: { styles: string }) {
  const { settings, scheme, fontFamily, fontFaces } = appearance
  if (view.isFixedLayout) {
    applyAttributes(view.renderer, fixedLayoutAttributes(settings))
    return
  }
  applyAttributes(view.renderer, paginatorAttributes(settings, reducedMotion()))
  const styles = pageStyles({ theme: currentPageTheme(scheme), settings, fontFamily, fontFaces })
  const key = styles.join('\n')
  if (key === applied.styles) return
  applied.styles = key
  view.renderer.setStyles?.(styles)
}

const subscribeToFullscreen = (onChange: () => void) => {
  document.addEventListener('fullscreenchange', onChange)
  return () => document.removeEventListener('fullscreenchange', onChange)
}
const isFullscreen = () => document.fullscreenElement !== null

export function ReaderPage({ bookId }: { bookId: string }) {
  const record = useLiveQuery(() => db.books.get(bookId), [bookId])
  const fonts = useLiveQuery(() => db.fonts.orderBy('family').toArray(), [])
  const { theme, scheme } = useTheme()
  const setTheme = useAppSettings((state) => state.setTheme)
  const [settingsFailed, setSettingsFailed] = useState(false)
  const reading = useReadingSettings(bookId, (error) => {
    console.error('could not save the reading settings', error)
    setSettingsFailed(true)
  })
  const settings = reading.settings
  const host = useRef<HTMLDivElement>(null)
  const viewRef = useRef<View | null>(null)
  const [status, setStatus] = useState<Status>('opening')
  const [toc, setToc] = useState<TocItem[]>([])
  const [position, setPosition] = useState<RelocateDetail | null>(null)
  const [fixedLayout, setFixedLayout] = useState(false)
  const [chromeShown, setChromeShown] = useState(true)
  const [panel, setPanel] = useState<Panel>(null)
  const [note, setNote] = useState<Note | null>(null)
  const [saveFailed, setSaveFailed] = useState(false)
  const [scrub, setScrub] = useState<number | null>(null)
  // Fixed-layout pages only, and for this sitting only: a zoom is for the page in front of you.
  const [zoom, setZoom] = useState(100)
  const fullscreen = useSyncExternalStore(subscribeToFullscreen, isFullscreen)
  const chromeHeld = useRef(false)
  const applied = useRef({ styles: '' })
  const noteDialog = useRef<HTMLDialogElement>(null)
  const noteFrame = useRef<HTMLDivElement>(null)

  const typeface = settings?.typeface
  const chosenFont =
    typeof typeface === 'object' ? fonts?.find((font) => font.id === typeface.fontId) : undefined
  const fontFaces = useFontFaces(chosenFont)
  let fontFamily: string | null = null
  if (chosenFont) fontFamily = `"${fontCssFamily(chosenFont.id)}", ${systemFontStacks().serif}`
  else if (typeface === 'serif') fontFamily = systemFontStacks().serif
  // The generic family, rather than the UI's system-ui stack: it is the reader's own choice
  // of sans-serif for reading, where system-ui is the desktop's choice for menus.
  else if (typeface === 'sans') fontFamily = 'sans-serif'

  // Handlers attached to book documents outlive renders; they read the latest state here.
  const latest = useRef({
    title: '',
    busy: false,
    settings,
    appearance: null as Appearance | null,
    position,
    zoom,
  })
  latest.current = {
    title: record?.title ?? '',
    busy: panel !== null || note !== null,
    settings,
    appearance: settings ? { settings, scheme, fontFamily, fontFaces } : null,
    position,
    zoom,
  }

  useEffect(() => {
    document.title = record ? `${record.title} · Carrel` : 'Carrel'
  }, [record])

  const settingsLoaded = settings !== undefined
  useEffect(() => {
    const container = host.current
    // The book is laid out once, with its settings, rather than laid out and then redone.
    if (!container || !settingsLoaded) return
    let cancelled = false
    let view: View | null = null
    let book: Book | null = null
    const saver = createProgressSaver(bookId, (error) => {
      console.error('could not save the reading position', error)
      setSaveFailed(true)
    })
    const footnotes = new FootnoteHandler()

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
      openSearch: () => {
        setChromeShown(false)
        setNote(null)
        setPanel('search')
      },
      zoom: (change) => {
        if (!view?.isFixedLayout) return false
        setZoom((current) => nextZoom(current, change))
        return true
      },
      isBusy: () => latest.current.busy,
      tapToTurn: () => latest.current.settings?.tapToTurn ?? true,
      wheelTurns: () => {
        const current = latest.current.settings
        if (!current || current.flow === 'scrolled') return false
        // A page fitted to the width or zoomed in can be larger than the window; the wheel
        // scrolls it.
        return !(view?.isFixedLayout && (current.pageFit === 'width' || latest.current.zoom > 100))
      },
    }
    const onKey = (event: KeyboardEvent) => handleKey(event, navigator)
    const onWheel = createWheelHandler(navigator)
    const onHostClick = (event: MouseEvent) => handleTap(event, event.clientX, navigator)

    footnotes.addEventListener('before-render', ({ detail }) => {
      // The note is laid out as one scrolling column on the popup's own background.
      const renderer = detail.view.renderer
      applyAttributes(renderer, {
        flow: 'scrolled',
        'margin-top': '0px',
        'margin-bottom': '0px',
        'margin-left': '0px',
        'margin-right': '0px',
        // In pixels: the paginator reads the number and ignores the unit.
        'max-inline-size': '1200px',
        'no-background': '',
        'no-preload': '',
      })
      const appearance = latest.current.appearance
      if (appearance) {
        renderer.setStyles?.(
          pageStyles({ ...appearance, theme: currentPageTheme(appearance.scheme) }),
        )
      }
      setChromeShown(false)
      presentNote({ dialog: noteDialog, frame: noteFrame }, detail.view)
      setNote({ view: detail.view, href: null })
    })
    footnotes.addEventListener('render', ({ detail }) => {
      setNote({ view: detail.view, href: detail.href })
    })

    const open = async () => {
      const [file, progress] = await Promise.all([loadBookFile(bookId), db.progress.get(bookId)])
      if (cancelled) return
      if (!file) {
        setStatus('missing')
        return
      }
      await Promise.all([loadFoliate(), themeSearchMarks()])
      book = await openBook(file)
      if (cancelled) return

      view = document.createElement('foliate-view') as View
      viewRef.current = view
      view.addEventListener('relocate', (event) => {
        const detail = event.detail
        // A relocation reported while a section is still being laid out can carry no
        // position (NaN); the next one, once it settles, does.
        if (!Number.isFinite(detail.fraction)) return
        setPosition(detail)
        saver.schedule({ location: detail.cfi, fraction: detail.fraction })
        const shown = latest.current.settings?.runningHeads ?? true
        if (view) fillMarginals(view.renderer, latest.current.title, detail, shown)
      })
      view.addEventListener('load', (event) => {
        const { doc } = event.detail
        doc.addEventListener('keydown', onKey)
        doc.addEventListener('wheel', onWheel, { passive: true })
        doc.addEventListener('click', (click) => handleTap(click, viewportX(click, doc), navigator))
      })
      view.addEventListener('link', (event) => {
        if (!view) return
        footnotes.handle(view.book, event)?.catch((error: unknown) => {
          console.error('could not show the note', error)
          setNote(null)
        })
      })
      view.addEventListener('external-link', (event) => {
        event.preventDefault()
        openExternal(event.detail.href)
      })
      container.append(view)
      await view.open(book)
      if (cancelled) return

      const appearance = latest.current.appearance
      if (appearance) applyAppearance(view, appearance, applied.current)
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
      view?.close()
      view?.remove()
      book?.destroy?.()
      viewRef.current = null
      applied.current.styles = ''
    }
  }, [bookId, settingsLoaded])

  // Settings, theme and fonts apply to the open book as they change. The page colours are read
  // from the document's theme tokens, so the theme is a dependency even where the scheme stays
  // the same (light and sepia).
  // biome-ignore lint/correctness/useExhaustiveDependencies: theme changes the tokens read inside
  useEffect(() => {
    const view = viewRef.current
    if (status !== 'ready' || !view || !settings) return
    applyAppearance(view, { settings, scheme, fontFamily, fontFaces }, applied.current)
    const current = latest.current.position
    if (current) fillMarginals(view.renderer, latest.current.title, current, settings.runningHeads)
  }, [status, settings, scheme, theme, fontFamily, fontFaces])

  useEffect(() => {
    const view = viewRef.current
    if (status !== 'ready' || !view?.isFixedLayout) return
    // Unset is the same as 100%; setting it anyway would lay the pages out a second time.
    if (zoom === 100 && !view.renderer.hasAttribute('scale-factor')) return
    applyAttributes(view.renderer, { 'scale-factor': String(zoom) })
  }, [status, zoom])

  // The bars are up when the book opens, so they can be found, and step aside shortly after.
  useEffect(() => {
    if (status !== 'ready' || !chromeShown) return
    const timer = setTimeout(() => {
      if (!chromeHeld.current) setChromeShown(false)
    }, 4000)
    return () => clearTimeout(timer)
  }, [status, chromeShown])

  const goTo = (target: string) => {
    setPanel(null)
    setNote(null)
    setChromeShown(false)
    viewRef.current?.goTo(target).catch((error: unknown) => console.error(error))
  }

  const openPanel = (next: Panel) => {
    setChromeShown(false)
    setPanel(next)
  }

  const commitScrub = () => {
    if (scrub === null) return
    viewRef.current?.goToFraction(scrub).catch((error: unknown) => console.error(error))
    setScrub(null)
  }

  const toggleFullscreen = () => {
    const change = document.fullscreenElement
      ? document.exitFullscreen()
      : document.documentElement.requestFullscreen()
    change.catch((error: unknown) => console.error('could not change full screen', error))
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
  const iconButton = 'btn btn-ghost btn-square'

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
            <div className="flex h-16 items-center gap-1 px-2 sm:px-4">
              <a href={libraryHref} className={iconButton} aria-label="Back to library">
                <ArrowLeft aria-hidden className="size-6" />
              </a>
              <div className="min-w-0 flex-1 px-2">
                <p className="truncate text-sm font-semibold text-fg">{record?.title}</p>
                {chapter && <p className="truncate text-xs text-fg-muted">{chapter}</p>}
              </div>
              <button
                type="button"
                className={iconButton}
                aria-label="Search"
                aria-keyshortcuts="Control+F"
                onClick={() => openPanel('search')}
              >
                <Search aria-hidden className="size-6" />
              </button>
              {toc.length > 0 && (
                <button
                  type="button"
                  className={iconButton}
                  aria-label="Contents"
                  onClick={() => openPanel('toc')}
                >
                  <ListTree aria-hidden className="size-6" />
                </button>
              )}
              <button
                type="button"
                className={iconButton}
                aria-label="Reading settings"
                onClick={() => openPanel('settings')}
              >
                <ALargeSmall aria-hidden className="size-6" />
              </button>
              {document.fullscreenEnabled && (
                <button
                  type="button"
                  className={`${iconButton} max-sm:hidden`}
                  aria-label={fullscreen ? 'Exit full screen' : 'Full screen'}
                  onClick={toggleFullscreen}
                >
                  {fullscreen ? (
                    <Minimize aria-hidden className="size-6" />
                  ) : (
                    <Maximize aria-hidden className="size-6" />
                  )}
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
              {fixedLayout && (
                <div className="flex shrink-0 items-center">
                  <button
                    type="button"
                    className="btn btn-ghost btn-square btn-sm"
                    aria-label="Zoom out"
                    aria-keyshortcuts="Control+-"
                    disabled={zoom <= (zoomSteps[0] ?? zoom)}
                    onClick={() => setZoom((current) => nextZoom(current, 'out'))}
                  >
                    <ZoomOut aria-hidden className="size-4" />
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm w-16 px-0 text-xs font-normal text-fg-muted tabular-nums"
                    aria-label={`Zoom ${zoom}%, reset to fit`}
                    aria-keyshortcuts="Control+0"
                    onClick={() => setZoom(100)}
                  >
                    {zoom}%
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-square btn-sm"
                    aria-label="Zoom in"
                    aria-keyshortcuts="Control+="
                    disabled={zoom >= (zoomSteps.at(-1) ?? zoom)}
                    onClick={() => setZoom((current) => nextZoom(current, 'in'))}
                  >
                    <ZoomIn aria-hidden className="size-4" />
                  </button>
                </div>
              )}
            </div>
          </footer>
        </>
      )}

      {(saveFailed || settingsFailed) && (
        <p
          role="alert"
          className="absolute inset-x-4 bottom-24 z-30 mx-auto max-w-sm rounded-lg bg-danger-subtle px-4 py-3 text-center text-sm text-danger-fg shadow-lg"
        >
          {saveFailed
            ? 'Your place in this book couldn’t be saved.'
            : 'Your reading settings couldn’t be saved.'}
        </p>
      )}

      <TocDrawer
        open={panel === 'toc'}
        items={toc}
        currentHref={position?.tocItem?.href}
        onSelect={goTo}
        onClose={() => setPanel(null)}
      />
      <SearchSheet
        open={panel === 'search'}
        onClose={() => setPanel(null)}
        search={(query) => {
          const view = viewRef.current
          if (!view) throw new Error('search before the book opened')
          return view.search({ query })
        }}
        clear={() => viewRef.current?.clearSearch()}
        onSelect={goTo}
      />
      {settings && (
        <SettingsSheet
          open={panel === 'settings'}
          onClose={() => setPanel(null)}
          settings={settings}
          onChange={reading.update}
          scope={reading.scope}
          onScopeChange={reading.setScope}
          theme={theme}
          onThemeChange={setTheme}
          fixedLayout={fixedLayout}
          fonts={fonts ?? []}
          onManageFonts={() => setPanel('fonts')}
        />
      )}
      <FontsDialog open={panel === 'fonts'} onClose={() => setPanel('settings')} />
      <FootnotePopup
        dialog={noteDialog}
        frame={noteFrame}
        note={note}
        onClose={() => setNote(null)}
        onFollow={goTo}
      />
    </div>
  )
}
