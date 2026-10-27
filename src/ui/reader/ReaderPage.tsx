/*
 * Design brief (refactoring-ui Workflow B), reader screen.
 *
 * Feature: read. The page is the figure; everything else stays out of its way.
 * Content, by rank:
 *   primary    the book page
 *   secondary  where you are: the progress in the page's corner and, in paged layout, the
 *              chapter in the running head, set small and muted
 *   tertiary   the controls, out of sight until a tap in the middle of the page, the pointer
 *              nearing the top or bottom edge, or keyboard focus brings them up
 * Actions: no primary action. Back, contents, search, reading settings, full screen and the
 *   progress scrubber are tertiary icon controls on raised bars (surface-raised, shadow-md)
 *   that slide in over the page.
 * Tokens: page colours come from the semantic surface / fg / action-fg tokens, so the book
 *   follows the app's theme; marginal text is 12px fg-muted; bars are 44px tall.
 */

import { useLiveQuery } from 'dexie-react-hooks'
import { FootnoteHandler } from 'foliate-js/footnotes.js'
import type { RelocateDetail, Renderer, TocItem, View } from 'foliate-js/view.js'
import {
  ALargeSmall,
  ArrowLeft,
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  Info,
  ListTree,
  Maximize,
  Minimize,
  Search,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import {
  type FocusEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { db, type Font } from '@/domain/db'
import { type Book, loadFoliate, openBook } from '@/domain/foliate'
import { cssString, fontCssFamily } from '@/domain/fonts'
import { loadBookFile, markOpened, saveProgress } from '@/domain/library'
import { libraryHref } from '@/domain/routes'
import { type ReadingSettings, type Typeface, tocWidthLimits } from '@/domain/settings'
import { useAppSettings } from '@/store/appSettings'
import { BookDetailsDialog } from '@/ui/BookDetails'
import { FontsDialog } from '@/ui/fonts/FontsDialog'
import { FootnotePopup, type Note, presentNote } from '@/ui/reader/FootnotePopup'
import { applyAttributes, fixedLayoutAttributes, paginatorAttributes } from '@/ui/reader/layout'
import {
  createWheelHandler,
  handleKey,
  handleTap,
  type Navigator,
  openExternal,
  viewportPoint,
} from '@/ui/reader/navigation'
import {
  currentPageTheme,
  pageStyles,
  serifFontStack,
  textShiftProperty,
} from '@/ui/reader/pageStyles'
import { type Extent, offsetRange, type Placement, placeText } from '@/ui/reader/placement'
import { SearchSheet } from '@/ui/reader/SearchSheet'
import { SettingsSheet } from '@/ui/reader/SettingsSheet'
import { themeSearchMarks } from '@/ui/reader/searchMarks'
import { TocPanel } from '@/ui/reader/TocPanel'
import { adjacentChapters, flattenToc } from '@/ui/reader/tocTree'
import { useFontFaces } from '@/ui/reader/useFontFaces'
import { useReadingSettings } from '@/ui/reader/useReadingSettings'
import { useMediaQuery } from '@/ui/useMediaQuery'
import { useTheme } from '@/ui/useTheme'

type Status = 'opening' | 'ready' | 'missing' | 'failed'

/** The panel open over the page; the contents are beside it, and open alongside any of these. */
type Panel = 'search' | 'settings' | 'fonts' | 'details' | null

const percent = new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 0 })

/** Zoom levels for fixed-layout pages, in percent of the fitted size. */
const zoomSteps = [50, 75, 100, 125, 150, 200, 300, 400]

function nextZoom(current: number, change: 'in' | 'out' | 'reset'): number {
  if (change === 'reset') return 100
  if (change === 'in') return zoomSteps.find((step) => step > current) ?? current
  return zoomSteps.findLast((step) => step < current) ?? current
}

/** How far an arrow key scrolls in scrolled layout, in CSS pixels: about two lines. */
const arrowScroll = 64

/** How near the top or bottom the pointer brings the bars up: a little more than their height. */
const edgeZone = 64

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Saves the reading position at most every half second, and on demand when leaving.
 * `onSaved` hears of each save: null when it worked, else the error.
 */
function createProgressSaver(id: string, onSaved: (error: unknown) => void) {
  let pending: { location: string; fraction: number } | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  const flush = () => {
    clearTimeout(timer)
    if (!pending) return
    const progress = pending
    pending = null
    saveProgress({ id, ...progress }).then(() => onSaved(null), onSaved)
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

/**
 * Running heads in the top margin of paged layout: in a two-page spread the left page carries
 * the book's title and the right the chapter's, as in a printed book. The progress has a
 * corner of its own (see progressText), in every layout.
 */
function fillRunningHeads(
  renderer: Renderer,
  title: string,
  detail: RelocateDetail,
  shown: boolean,
) {
  const heads = renderer.heads ?? []
  const chapter = detail.tocItem?.label?.trim() ?? ''
  heads.forEach((head, index) => {
    head.textContent = !shown ? '' : heads.length > 1 && index === 0 ? title : chapter || title
  })
}

const count = new Intl.NumberFormat()

/**
 * Whether the text on show begins the book: it is in the first section, with none of the
 * section's text before it. The fraction can't say: it is where the text on show ends, so in
 * paged layout it is above zero already on the first page.
 */
function startsBook(position: RelocateDetail): boolean {
  const { section, range } = position
  if (section?.current !== 0 || !range) return position.fraction <= 0
  try {
    const doc = range.startContainer.ownerDocument
    const before = doc?.createRange()
    if (!doc || !before) return position.fraction <= 0
    before.setStart(doc.body ?? doc.documentElement, 0)
    before.setEnd(range.startContainer, range.startOffset)
    return before.toString().trim() === ''
  } catch {
    // A page being replaced can leave the range pointing into a document that is gone.
    return position.fraction <= 0
  }
}

/**
 * What the corner of the page says of the reader's progress. A page is a real page in a fixed
 * layout; in a reflowable book it is one of foliate-js's locations, a fixed length of text, so
 * the numbers stay put whatever the text size or window.
 */
function progressText(
  position: RelocateDetail | null,
  fixedLayout: boolean,
  mode: ReadingSettings['progress'],
): string {
  if (!position || mode === 'none') return ''
  if (mode === 'page') {
    const pages = fixedLayout ? position.section : position.location
    if (pages && pages.total > 0) {
      return `${count.format(Math.min(pages.total, pages.current + 1))} / ${count.format(pages.total)}`
    }
  }
  return percent.format(position.fraction)
}

function positionLabel(position: RelocateDetail | null, fixedLayout: boolean): string {
  if (!position) return ''
  if (fixedLayout && position.section) {
    return `${position.section.current + 1} of ${position.section.total}`
  }
  return percent.format(position.fraction)
}

/**
 * The CSS font-family for a typeface, or null to keep the book's own fonts. A font the reader
 * added goes by its internal family name (its @font-face rules come with the page styles); an
 * installed font goes by its own name. Either falls back to the serif stack.
 */
function cssFontFamily(typeface: Typeface, addedFont: Font | undefined): string | null {
  const serif = serifFontStack()
  if (typeface === 'book') return null
  if (typeface === 'serif') return serif
  // The generic family, rather than the UI's system-ui stack: it is the reader's own choice of
  // sans-serif for reading, where system-ui is the desktop's choice for menus.
  if (typeface === 'sans') return 'sans-serif'
  if ('family' in typeface) return `${cssString(typeface.family)}, ${serif}`
  // A removed font leaves the book's own fonts in place.
  return addedFont ? `${cssString(fontCssFamily(addedFont.id))}, ${serif}` : null
}

/**
 * Where the book's text sits across the window, as laid out and moved: the page body in
 * scrolled layout, the span of the columns in paged layout, the pages shown of a fixed layout.
 * Null before anything is laid out.
 */
function textExtent(view: View): Extent | null {
  let rect: DOMRect | undefined
  if (view.isFixedLayout) {
    // The pages on show; the others are laid out but hidden.
    for (const frame of view.renderer.shadowRoot?.querySelectorAll('iframe') ?? []) {
      const box = frame.getBoundingClientRect()
      if (box.width === 0) continue
      const left = Math.min(rect?.left ?? box.left, box.left)
      const right = Math.max(rect?.right ?? box.right, box.right)
      rect = new DOMRect(left, 0, right - left, 0)
    }
  } else if (view.renderer.getAttribute('flow') === 'scrolled') {
    const doc = view.renderer.getContents?.()[0]?.doc
    const frame = doc?.defaultView?.frameElement?.getBoundingClientRect()
    const body = doc?.body?.getBoundingClientRect()
    if (frame && body) rect = new DOMRect(frame.left + body.left, 0, body.width, 0)
  } else {
    // The columns fill the scroller, less the page's own side padding.
    const container = view.renderer.shadowRoot?.getElementById('container')?.getBoundingClientRect()
    const page = view.renderer.getContents?.()[0]?.doc.documentElement
    if (container && page) {
      const style = getComputedStyle(page)
      const start = Number.parseFloat(style.paddingLeft) || 0
      const end = Number.parseFloat(style.paddingRight) || 0
      rect = new DOMRect(container.left + start, 0, container.width - start - end, 0)
    }
  }
  if (!rect || rect.width === 0) return null
  return { left: Math.round(rect.left), width: Math.round(rect.width) }
}

/**
 * Moves the text across by `shift` pixels. Paged and fixed layouts move the whole view; the
 * page background is the window's, so nothing shows at the edge it leaves. Scrolled layout
 * moves the text inside the scroller (pageStyles), which stays put with its scrollbar.
 */
function applyShift(view: View, shift: number, scrolled: boolean) {
  view.style.translate = scrolled || shift === 0 ? '' : `${shift}px 0`
  for (const { doc } of view.renderer.getContents?.() ?? []) {
    // A page being replaced can be left without a root for a moment.
    doc?.documentElement?.style.setProperty(textShiftProperty, `${scrolled ? shift : 0}px`)
  }
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
  // index.css widens the scroller in scrolled layout by this.
  view.dataset.flow = settings.flow
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
  const { theme, scheme, palette } = useTheme()
  const setTheme = useAppSettings((state) => state.setTheme)
  const [settingsFailed, setSettingsFailed] = useState(false)
  // A failure to save is reported until a later save works.
  const reading = useReadingSettings(bookId, (error) => {
    if (error) console.error('could not save the reading settings', error)
    setSettingsFailed(Boolean(error))
  })
  const settings = reading.settings
  const host = useRef<HTMLDivElement>(null)
  const viewRef = useRef<View | null>(null)
  const [status, setStatus] = useState<Status>('opening')
  const [toc, setToc] = useState<TocItem[]>([])
  // The open book's metadata, for its details; read from the file once, when it opens.
  const [metadata, setMetadata] = useState<unknown>(undefined)
  const [position, setPosition] = useState<RelocateDetail | null>(null)
  const [fixedLayout, setFixedLayout] = useState(false)
  const [chromeShown, setChromeShown] = useState(true)
  const [panel, setPanel] = useState<Panel>(null)
  const [note, setNote] = useState<Note | null>(null)
  const [saveFailed, setSaveFailed] = useState(false)
  const [scrub, setScrub] = useState<number | null>(null)
  // Fixed-layout pages only, and for this sitting only: a zoom is for the page in front of you.
  const [zoom, setZoom] = useState(100)
  // Where the text sits across the window before it is moved, and the window's width; measured
  // as the book is laid out, so the text can be placed and the progress bar lined up with it.
  const [unmoved, setUnmoved] = useState<(Extent & { viewport: number }) | null>(null)
  // The shift on the page now, which every measurement includes.
  const appliedShift = useRef(0)
  const measureFrame = useRef(0)
  const [tocOpen, setTocOpen] = useState(false)
  const contentsButton = useRef<HTMLButtonElement>(null)
  const wide = useMediaQuery('(min-width: 40rem)')
  const textOffset = useAppSettings((state) => state.textOffset)
  const setTextOffset = useAppSettings((state) => state.setTextOffset)
  const tocWidth = useAppSettings((state) => state.tocWidth)
  const setTocWidth = useAppSettings((state) => state.setTocWidth)
  // A line through the middle of the text while the offset is being dragged, and for a moment
  // after, to line it up with the middle of the screen.
  const [guide, setGuide] = useState(false)
  const guideTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const fullscreen = useSyncExternalStore(subscribeToFullscreen, isFullscreen)
  // The bars stay up while the pointer rests on them or focus is inside them.
  const pointerOnBars = useRef(false)
  const focusInBars = useRef(false)
  // Whether the bars came up because the mouse neared an edge, so leaving it puts them away.
  const revealedByPointer = useRef(false)
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const hideChromeAfter = useCallback((ms: number) => {
    clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => {
      if (pointerOnBars.current || focusInBars.current) return
      revealedByPointer.current = false
      setChromeShown(false)
    }, ms)
  }, [])
  /**
   * Brings the bars up when the pointer comes within a bar's height of the top or bottom. Any
   * pointer that hovers counts: a mouse, or a pen, which some drivers report every pointer as
   * (a mouse included). A finger doesn't hover, and its moves are scrolls.
   */
  const revealNearEdge = useCallback(
    (y: number, event: PointerEvent) => {
      if (event.pointerType === 'touch') return
      if (y <= edgeZone || y >= window.innerHeight - edgeZone) {
        revealedByPointer.current = true
        setChromeShown(true)
      } else if (revealedByPointer.current) {
        revealedByPointer.current = false
        hideChromeAfter(600)
      }
    },
    [hideChromeAfter],
  )
  /** Measures where the text sits unmoved, once the layout in progress has settled. */
  const measureText = useCallback(() => {
    cancelAnimationFrame(measureFrame.current)
    measureFrame.current = requestAnimationFrame(() => {
      const view = viewRef.current
      const extent = view ? textExtent(view) : null
      const viewport = host.current?.clientWidth ?? window.innerWidth
      const next = extent && { ...extent, left: extent.left - appliedShift.current, viewport }
      setUnmoved((current) =>
        current?.left === next?.left &&
        current?.width === next?.width &&
        current?.viewport === next?.viewport
          ? current
          : next,
      )
    })
  }, [])
  const applied = useRef({ styles: '' })
  const noteDialog = useRef<HTMLDialogElement>(null)
  const noteFrame = useRef<HTMLDivElement>(null)

  const typeface = settings?.typeface
  const chosenFont =
    typeof typeface === 'object' && 'fontId' in typeface
      ? fonts?.find((font) => font.id === typeface.fontId)
      : undefined
  const fontFaces = useFontFaces(chosenFont)
  const fontFamily = typeface ? cssFontFamily(typeface, chosenFont) : null

  // Handlers attached to book documents outlive renders; they read the latest state here.
  const latest = useRef({
    title: '',
    ready: false,
    busy: false,
    settings,
    appearance: null as Appearance | null,
    position,
    zoom,
  })
  latest.current = {
    title: record?.title ?? '',
    ready: status === 'ready',
    // The contents are a modal sheet on a narrow window; docked, they leave the keys to the page.
    busy: panel !== null || note !== null || (tocOpen && !wide),
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
      if (error) console.error('could not save the reading position', error)
      setSaveFailed(Boolean(error))
    })
    const footnotes = new FootnoteHandler()

    const navigator: Navigator = {
      turn(direction) {
        setChromeShown(false)
        if (!view) return
        const scrolled = latest.current.settings?.flow === 'scrolled'
        const vertical = direction === 'up' || direction === 'down'
        // A page larger than the window scrolls with the arrow keys, as with the wheel; the
        // other keys turn it.
        if (vertical && !scrolled && pagesOverflow()) {
          view
            .pan(0, direction === 'down' ? arrowScroll : -arrowScroll)
            .catch((error: unknown) => console.error('could not scroll the page', error))
          return
        }
        // In scrolled layout an arrow key moves a few lines; a page there is a screenful.
        const line = scrolled ? arrowScroll : undefined
        let turning: Promise<void>
        if (direction === 'left') turning = view.goLeft()
        else if (direction === 'right') turning = view.goRight()
        else if (direction === 'up') turning = view.prev(line)
        else if (direction === 'down') turning = view.next(line)
        else if (direction === 'prev') turning = view.prev()
        else turning = view.next()
        turning.catch((error: unknown) => console.error('could not turn the page', error))
      },
      toggleChrome: () => setChromeShown((shown) => !shown),
      hideChrome: () => setChromeShown(false),
      openSearch: () => {
        if (!latest.current.ready) return
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
        return !pagesOverflow()
      },
    }
    /** A page fitted to the width or zoomed in can be larger than the window. */
    function pagesOverflow() {
      const current = latest.current.settings
      return Boolean(
        view?.isFixedLayout && (current?.pageFit === 'width' || latest.current.zoom > 100),
      )
    }
    const onKey = (event: KeyboardEvent) => handleKey(event, navigator)
    const onWheel = createWheelHandler(navigator)
    const onHostClick = (event: MouseEvent) => handleTap(event, event.clientX, navigator)
    const onHostPointerMove = (event: PointerEvent) => revealNearEdge(event.clientY, event)
    // A quick move toward the top or bottom can carry the pointer out of the window between two
    // of its events, none of them near the edge; leaving through that edge counts as nearing it.
    // Both documents report it, with where the pointer went, outside the window.
    const onWindowOut = (event: PointerEvent) => {
      if (event.relatedTarget === null) revealNearEdge(event.clientY, event)
    }

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
      if (cancelled) return
      const opened = await openBook(file)
      if (cancelled) {
        opened.destroy?.()
        return
      }
      book = opened

      view = document.createElement('foliate-view') as View
      viewRef.current = view
      view.addEventListener('relocate', (event) => {
        const detail = event.detail
        // A relocation reported while a section is still being laid out can carry no
        // position (NaN); the next one, once it settles, does.
        measureText()
        if (!Number.isFinite(detail.fraction)) return
        setPosition(detail)
        saver.schedule({ location: detail.cfi, fraction: detail.fraction })
        const shown = latest.current.settings?.runningHeads ?? true
        if (view) fillRunningHeads(view.renderer, latest.current.title, detail, shown)
      })
      view.addEventListener('load', (event) => {
        const { doc } = event.detail
        // A page loaded as the reader scrolls on takes the shift the others have.
        const scrolled = !view?.isFixedLayout && latest.current.settings?.flow === 'scrolled'
        doc.documentElement?.style.setProperty(
          textShiftProperty,
          `${scrolled ? appliedShift.current : 0}px`,
        )
        doc.addEventListener('keydown', onKey)
        doc.addEventListener('wheel', onWheel, { passive: true })
        doc.addEventListener('click', (click) =>
          handleTap(click, viewportPoint(click, doc).x, navigator),
        )
        doc.addEventListener('pointermove', (move) =>
          revealNearEdge(viewportPoint(move, doc).y, move),
        )
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
      setMetadata(book.metadata ?? {})
      setFixedLayout(view.isFixedLayout)

      // A saved place the book no longer resolves (the reading engine changed how it names
      // places) opens at the same fraction of the book, rather than at the start, where the
      // next save would write over it.
      const resolves = progress ? Boolean(view.resolveNavigation(progress.location)) : false
      await view.init({ lastLocation: resolves ? progress?.location : null })
      if (cancelled) return
      if (progress && !resolves && progress.fraction > 0) {
        await view.goToFraction(progress.fraction)
        if (cancelled) return
      }
      setStatus('ready')
      markOpened(bookId).catch((error: unknown) =>
        console.error('could not record that the book was opened', error),
      )
    }

    window.addEventListener('keydown', onKey)
    window.addEventListener('pagehide', saver.flush)
    container.addEventListener('wheel', onWheel, { passive: true })
    container.addEventListener('click', onHostClick)
    container.addEventListener('pointermove', onHostPointerMove)
    window.addEventListener('pointerout', onWindowOut)
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
      container.removeEventListener('pointermove', onHostPointerMove)
      window.removeEventListener('pointerout', onWindowOut)
      view?.close()
      view?.remove()
      book?.destroy?.()
      viewRef.current = null
      applied.current.styles = ''
      cancelAnimationFrame(measureFrame.current)
      appliedShift.current = 0
      setUnmoved(null)
      setMetadata(undefined)
    }
  }, [bookId, settingsLoaded, revealNearEdge, measureText])

  // Settings, theme and fonts apply to the open book as they change. The page colours are read
  // from the document's theme tokens, so the palette is a dependency even where the scheme
  // stays the same (an edited custom theme).
  // biome-ignore lint/correctness/useExhaustiveDependencies: the palette changes the tokens read inside
  useEffect(() => {
    const view = viewRef.current
    if (status !== 'ready' || !view || !settings) return
    applyAppearance(view, { settings, scheme, fontFamily, fontFaces }, applied.current)
    const current = latest.current.position
    if (current)
      fillRunningHeads(view.renderer, latest.current.title, current, settings.runningHeads)
    measureText()
  }, [status, settings, scheme, palette, fontFamily, fontFaces, measureText])

  useEffect(() => {
    const view = viewRef.current
    if (status !== 'ready' || !view?.isFixedLayout) return
    // Unset is the same as 100%; setting it anyway would lay the pages out a second time.
    if (zoom === 100 && !view.renderer.hasAttribute('scale-factor')) return
    applyAttributes(view.renderer, { 'scale-factor': String(zoom) })
  }, [status, zoom])

  // The window resizing lays the book out again, which measures it; a fixed layout may only
  // scale its pages, so it is measured here as well.
  useEffect(() => {
    if (status !== 'ready') return
    measureText()
    window.addEventListener('resize', measureText)
    return () => window.removeEventListener('resize', measureText)
  }, [status, measureText])

  // The text is centred on the window, whatever panels are open, and moved by the reader's
  // offset; a docked contents sidebar moves it only if it would cover it.
  // The docked contents never take more than half the window, whatever width was kept.
  const viewport = unmoved?.viewport ?? window.innerWidth
  const tocShownWidth = Math.round(Math.min(tocWidth, Math.max(tocWidthLimits.min, viewport / 2)))
  const sidebar = tocOpen && wide ? tocShownWidth : 0
  // A fixed layout that scrolls can't move: its scroller is the whole view, and moving it would
  // take the scrollbar off the window's edge.
  const movable = !(fixedLayout && settings?.flow === 'scrolled')
  let placement: Placement = { shift: 0, clear: true }
  if (unmoved && movable) {
    placement = placeText({
      text: unmoved,
      viewport: unmoved.viewport,
      offset: textOffset,
      sidebar,
    })
  } else if (unmoved) {
    placement = { shift: 0, clear: unmoved.left >= sidebar }
  }
  const { shift } = placement
  const scrolledText = !fixedLayout && settings?.flow === 'scrolled'
  // Before paint, so the text never shows in its old place.
  useLayoutEffect(() => {
    const view = viewRef.current
    if (status !== 'ready' || !view) return
    applyShift(view, shift, scrolledText)
    appliedShift.current = shift
  }, [status, shift, scrolledText])
  const offsetLimits = unmoved && movable ? offsetRange(unmoved, unmoved.viewport) : null
  const shownOffset = offsetLimits
    ? Math.min(offsetLimits.max, Math.max(offsetLimits.min, textOffset))
    : 0
  const holdGuide = (holding: boolean) => {
    clearTimeout(guideTimer.current)
    if (holding) setGuide(true)
    else guideTimer.current = setTimeout(() => setGuide(false), 1200)
  }
  useEffect(() => () => clearTimeout(guideTimer.current), [])

  // The bars start beside the docked contents.
  const barStart = sidebar

  const closeToc = () => {
    // Keyboard focus in the closing contents goes back to the button that opens them.
    const focused = document.activeElement
    const returning = focused?.closest('[data-toc]') && focused.matches(':focus-visible')
    setTocOpen(false)
    if (returning) contentsButton.current?.focus()
  }

  // The bars are up when the book opens, so they can be found, and step aside shortly after;
  // the same goes for each time they come up.
  useEffect(() => {
    if (status !== 'ready' || !chromeShown) return
    hideChromeAfter(4000)
    return () => clearTimeout(hideTimer.current)
  }, [status, chromeShown, hideChromeAfter])

  const goTo = (target: string) => {
    setPanel(null)
    setNote(null)
    setChromeShown(false)
    viewRef.current?.goTo(target).catch((error: unknown) => console.error(error))
  }

  // The chapter buttons step through the contents in reading order.
  const chapters = useMemo(() => flattenToc(toc), [toc])
  const { previous: previousChapter, next: nextChapter } = adjacentChapters(
    chapters,
    position?.tocItem ?? undefined,
  )
  // Unlike a jump from the contents, the bars stay up, for stepping on through the chapters.
  const goToChapter = (href: string) => {
    viewRef.current?.goTo(href).catch((error: unknown) => console.error(error))
  }
  const goToFraction = (fraction: number) => {
    viewRef.current?.goToFraction(fraction).catch((error: unknown) => console.error(error))
  }
  // A fixed layout counts in pages; reflowable text by what is on show (see startsBook).
  const pages = fixedLayout ? position?.section : undefined
  const atBeginning = pages ? pages.current === 0 : position === null || startsBook(position)
  const atEnd = pages ? pages.current >= pages.total - 1 : (position?.fraction ?? 0) >= 0.9999
  const progress =
    scrub !== null && settings?.progress !== 'none'
      ? percent.format(scrub)
      : progressText(position, fixedLayout, settings?.progress ?? 'percent')

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

  const bar = `absolute inset-x-0 z-20 bg-surface-raised shadow-md transition duration-200 ease-out`
  // While the pointer rests on the bars or focus is inside them, they stay up.
  const holdChrome = {
    onPointerEnter: () => {
      pointerOnBars.current = true
    },
    // Leaving the bars for the page puts them away soon after.
    onPointerLeave: () => {
      pointerOnBars.current = false
      hideChromeAfter(1500)
    },
    // The bars stay in the focus order while hidden, so the keyboard can always reach Back and
    // Contents; reaching them brings the bars up. A click focuses a button too, and a closing
    // dialog gives the focus back to the button that opened it: those don't hold the bars.
    onFocus: (event: FocusEvent<HTMLElement>) => {
      if (!(event.target instanceof Element && event.target.matches(':focus-visible'))) return
      focusInBars.current = true
      setChromeShown(true)
    },
    onBlur: () => {
      focusInBars.current = false
    },
  }
  // The bars are 44 pixels tall; their buttons 36, with 20-pixel icons.
  const iconButton = 'btn btn-ghost btn-square [--size:36px]'
  const barIcon = 'size-[20px]'

  return (
    <div className="fixed inset-0 overflow-hidden bg-surface text-fg">
      {/* The book always has the whole window, so panels opening beside it don't move it. */}
      <div ref={host} className="absolute inset-0" />
      {guide && unmoved && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 z-10 border-s border-dashed border-fg-muted"
          style={{ left: unmoved.left + shift + unmoved.width / 2 }}
        />
      )}

      {status === 'opening' && (
        <>
          {/* Where the bar's Back button will be, for a book that is slow to open. */}
          <a
            href={libraryHref}
            className={`${iconButton} absolute start-2 top-[calc(4px+env(safe-area-inset-top))] sm:start-4`}
            aria-label="Back to library"
            data-tooltip=""
          >
            <ArrowLeft aria-hidden className={barIcon} />
          </a>
          <div className="absolute inset-0 grid place-items-center">
            <div className="flex items-center gap-3 text-sm text-fg-muted" role="status">
              <span className="loading loading-spinner loading-sm" aria-hidden />
              Opening book…
            </div>
          </div>
        </>
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
            style={barStart ? { insetInlineStart: barStart } : undefined}
            className={`${bar} top-0 pt-[env(safe-area-inset-top)] ${
              chromeShown
                ? 'translate-y-0 opacity-100'
                : 'pointer-events-none -translate-y-full opacity-0'
            }`}
          >
            {/* The title sits in the middle of the window, between the controls on either side,
                with the book's details beside it. */}
            <div className="grid h-[44px] grid-cols-[1fr_auto_1fr] items-center gap-2 px-2 sm:px-4">
              <div className="flex items-center gap-1">
                <a
                  href={libraryHref}
                  className={iconButton}
                  aria-label="Back to library"
                  data-tooltip=""
                >
                  <ArrowLeft aria-hidden className={barIcon} />
                </a>
                {/* Contents opens from the leading edge, so its button sits on that side; search
                    and settings open from the trailing edge, beside their buttons. */}
                {toc.length > 0 && (
                  <button
                    type="button"
                    className={iconButton}
                    aria-label="Contents"
                    data-tooltip=""
                    ref={contentsButton}
                    aria-expanded={tocOpen}
                    onClick={() => (tocOpen ? closeToc() : setTocOpen(true))}
                  >
                    <ListTree aria-hidden className={barIcon} />
                  </button>
                )}
              </div>
              <div className="flex min-w-0 max-w-[50vw] items-center gap-1">
                <p className="truncate text-sm font-semibold text-fg">{record?.title}</p>
                <button
                  type="button"
                  className="btn btn-ghost btn-square btn-xs shrink-0 text-fg-muted hover:text-fg"
                  aria-label="Book details"
                  data-tooltip=""
                  onClick={() => openPanel('details')}
                >
                  <Info aria-hidden className="size-4" />
                </button>
              </div>
              <div className="flex items-center justify-end gap-1">
                <button
                  type="button"
                  className={iconButton}
                  aria-label="Search"
                  data-tooltip=""
                  aria-keyshortcuts="Control+F"
                  onClick={() => openPanel('search')}
                >
                  <Search aria-hidden className={barIcon} />
                </button>
                <button
                  type="button"
                  className={iconButton}
                  aria-label="Reading settings"
                  data-tooltip=""
                  onClick={() => openPanel('settings')}
                >
                  <ALargeSmall aria-hidden className={barIcon} />
                </button>
                {document.fullscreenEnabled && (
                  <button
                    type="button"
                    className={`${iconButton} max-sm:hidden`}
                    aria-label={fullscreen ? 'Exit full screen' : 'Full screen'}
                    data-tooltip=""
                    onClick={toggleFullscreen}
                  >
                    {fullscreen ? (
                      <Minimize aria-hidden className={barIcon} />
                    ) : (
                      <Maximize aria-hidden className={barIcon} />
                    )}
                  </button>
                )}
              </div>
            </div>
          </header>

          <footer
            {...holdChrome}
            style={barStart ? { insetInlineStart: barStart } : undefined}
            className={`${bar} bottom-0 pb-[env(safe-area-inset-bottom)] ${
              chromeShown
                ? 'translate-y-0 opacity-100'
                : 'pointer-events-none translate-y-full opacity-0'
            }`}
          >
            {/* From the left: the beginning, the previous chapter, the progress across the
                window, the next chapter, the end. The figure itself is in the page's corner. */}
            <div className="flex h-[44px] items-center gap-1 px-2 sm:px-4">
              <button
                type="button"
                className="btn btn-ghost btn-square btn-sm shrink-0"
                aria-label="Beginning of the book"
                data-tooltip=""
                disabled={atBeginning}
                onClick={() => goToFraction(0)}
              >
                <ChevronFirst aria-hidden className="size-4" />
              </button>
              {chapters.length > 0 && (
                <button
                  type="button"
                  className="btn btn-ghost btn-square btn-sm shrink-0"
                  aria-label="Previous chapter"
                  data-tooltip=""
                  aria-description={previousChapter?.label?.trim() || undefined}
                  disabled={!previousChapter}
                  onClick={() => previousChapter && goToChapter(previousChapter.href)}
                >
                  <ChevronLeft aria-hidden className="size-4" />
                </button>
              )}
              <input
                type="range"
                className="range range-xs range-primary mx-2 min-w-0 flex-1"
                min={0}
                max={1}
                step="any"
                aria-label="Position in book"
                aria-valuetext={positionLabel(position, fixedLayout)}
                value={scrub ?? position?.fraction ?? 0}
                onChange={(event) => setScrub(Number(event.target.value))}
                onPointerUp={commitScrub}
                onKeyUp={commitScrub}
                onBlur={commitScrub}
              />
              {chapters.length > 0 && (
                <button
                  type="button"
                  className="btn btn-ghost btn-square btn-sm shrink-0"
                  aria-label="Next chapter"
                  data-tooltip=""
                  aria-description={nextChapter?.label?.trim() || undefined}
                  disabled={!nextChapter}
                  onClick={() => nextChapter && goToChapter(nextChapter.href)}
                >
                  <ChevronRight aria-hidden className="size-4" />
                </button>
              )}
              <button
                type="button"
                className="btn btn-ghost btn-square btn-sm shrink-0"
                aria-label="End of the book"
                data-tooltip=""
                disabled={atEnd}
                onClick={() => goToFraction(1)}
              >
                <ChevronLast aria-hidden className="size-4" />
              </button>
              {fixedLayout && (
                <div className="flex shrink-0 items-center">
                  <button
                    type="button"
                    className="btn btn-ghost btn-square btn-sm"
                    aria-label="Zoom out"
                    data-tooltip=""
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
                    data-tooltip="Reset zoom"
                    aria-keyshortcuts="Control+0"
                    onClick={() => setZoom(100)}
                  >
                    {zoom}%
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-square btn-sm"
                    aria-label="Zoom in"
                    data-tooltip=""
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

          {/* The progress, in the corner of the page as a folio would be, and above the bottom
              bar while the bar is up. For reflowable text it sits in a strip of page colour as
              wide as the text, a bottom margin the text scrolls under rather than runs into; on
              the pages of a fixed layout, in a small label at the page's corner. */}
          {progress && (
            <p
              aria-hidden
              className={`pointer-events-none absolute z-10 bg-surface text-xs text-fg-muted tabular-nums transition-[bottom] duration-200 ease-out ${
                fixedLayout || !unmoved ? 'rounded-sm px-1' : 'h-6 text-end leading-6'
              }`}
              style={{
                bottom: `calc(${chromeShown ? 44 : 0}px + env(safe-area-inset-bottom))`,
                ...(unmoved && !fixedLayout
                  ? { left: unmoved.left + shift, width: unmoved.width }
                  : {
                      right: unmoved
                        ? Math.max(4, unmoved.viewport - (unmoved.left + shift + unmoved.width))
                        : 16,
                      marginBottom: 4,
                    }),
              }}
            >
              {progress}
            </p>
          )}
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

      <TocPanel
        open={tocOpen}
        docked={wide}
        closeOnSelect={!placement.clear}
        width={tocShownWidth}
        onResize={setTocWidth}
        items={toc}
        current={position?.tocItem ?? undefined}
        onSelect={goTo}
        onClose={closeToc}
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
          textOffset={
            movable
              ? {
                  value: shownOffset,
                  range: offsetLimits,
                  onChange: setTextOffset,
                  onHoldChange: holdGuide,
                }
              : undefined
          }
        />
      )}
      <FontsDialog open={panel === 'fonts'} onClose={() => setPanel('settings')} />
      <BookDetailsDialog
        book={panel === 'details' ? (record ?? null) : null}
        metadata={metadata}
        onClose={() => setPanel(null)}
      />
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
