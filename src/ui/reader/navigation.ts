/**
 * Turning pages from the keyboard, the mouse wheel and taps on the page.
 *
 * Book pages are documents in iframes, and their events do not reach the app's document, so
 * the reader attaches these handlers to every page document as well as to the app.
 */

/**
 * 'prev' and 'next' are a page: Page Up and Page Down, the wheel in paged layout. 'left' and
 * 'right' are the arrow keys and taps on the sides of the page. 'up' and 'down' are the arrow
 * keys: a page in paged layout, a few lines in scrolled layout, as arrow keys scroll anywhere
 * else. 'screenUp' and 'screenDown' are Space and Shift+Space: a screenful, which in paged
 * layout is a page.
 */
export type Turn = 'prev' | 'next' | 'left' | 'right' | 'up' | 'down' | 'screenUp' | 'screenDown'

export interface Navigator {
  turn(direction: Turn): void
  /** Home and End: the beginning and the end of the book. */
  goToEdge(edge: 'start' | 'end'): void
  toggleChrome(): void
  hideChrome(): void
  openSearch(): void
  /** Zooms fixed-layout pages; false when the book has none, leaving the key to the browser. */
  zoom(change: 'in' | 'out' | 'reset'): boolean
  /** True while something else (a dialog) owns the keyboard. */
  isBusy(): boolean
  /** Whether taps on the sides of the page turn it; otherwise every tap toggles the controls. */
  tapToTurn(): boolean
  /** Whether the wheel turns pages; in scrolled layouts it scrolls instead. */
  wheelTurns(): boolean
}

const editable = (target: EventTarget | null) =>
  target instanceof Element &&
  target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]') !== null

const interactive = 'a[href], button, input, select, textarea, label, audio, video, [role="button"]'

const keyTurns: Record<string, Turn> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
  PageUp: 'prev',
  PageDown: 'next',
}

const zoomKeys: Record<string, 'in' | 'out' | 'reset'> = {
  '+': 'in',
  '=': 'in',
  '-': 'out',
  '0': 'reset',
}

export function handleKey(event: KeyboardEvent, navigator: Navigator): void {
  if (event.defaultPrevented) return
  // The browser's own find can't see into book pages, so Ctrl+F searches the book instead.
  if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'f') {
    event.preventDefault()
    navigator.openSearch()
    return
  }
  // Ctrl with + and - zooms the page of a PDF or comic rather than the whole app.
  const zoom = zoomKeys[event.key]
  if ((event.ctrlKey || event.metaKey) && !event.altKey && zoom && navigator.zoom(zoom)) {
    event.preventDefault()
    return
  }
  if (event.ctrlKey || event.metaKey || event.altKey) return
  if (navigator.isBusy() || editable(event.target)) return
  // Space presses a focused button, such as a chapter in the contents, rather than turning.
  if (event.key === ' ' && event.target instanceof Element && event.target.closest(interactive)) {
    return
  }
  let turn = keyTurns[event.key]
  if (event.key === ' ') turn = event.shiftKey ? 'screenUp' : 'screenDown'
  if (turn) {
    event.preventDefault()
    navigator.turn(turn)
  } else if (event.key === 'Home' || event.key === 'End') {
    event.preventDefault()
    navigator.goToEdge(event.key === 'Home' ? 'start' : 'end')
  } else if (
    event.key === 'Enter' &&
    !(event.target instanceof Element && event.target.closest(interactive))
  ) {
    navigator.toggleChrome()
  } else if (event.key === 'Escape') {
    navigator.hideChrome()
  }
}

/**
 * One page per wheel gesture. A trackpad fling sends a long tail of events; the turn is
 * locked until they stop, so the fling turns one page instead of a dozen.
 */
export function createWheelHandler(navigator: Navigator): (event: WheelEvent) => void {
  const quietMs = 250
  let locked = false
  let timer: ReturnType<typeof setTimeout> | undefined
  return (event) => {
    // Ctrl with the wheel is pinch-zoom on a trackpad.
    if (event.ctrlKey || navigator.isBusy() || !navigator.wheelTurns()) return
    clearTimeout(timer)
    timer = setTimeout(() => {
      locked = false
    }, quietMs)
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
    if (locked || Math.abs(delta) < 4) return
    locked = true
    navigator.turn(delta > 0 ? 'next' : 'prev')
  }
}

/**
 * Taps on the outer thirds of the screen turn the page that way; a tap in the middle shows
 * or hides the reader's controls. `x` is the tap's position in the app's viewport. Taps on
 * links and controls are theirs, not the reader's.
 */
export function handleTap(event: MouseEvent, x: number, navigator: Navigator): void {
  if (event.defaultPrevented || event.button !== 0 || navigator.isBusy()) return
  if (event.target instanceof Element && event.target.closest(interactive)) return
  const selection = (event.view ?? window).getSelection()
  if (selection && !selection.isCollapsed) return
  const position = x / window.innerWidth
  if (!navigator.tapToTurn()) navigator.toggleChrome()
  else if (position < 1 / 3) navigator.turn('left')
  else if (position > 2 / 3) navigator.turn('right')
  else navigator.toggleChrome()
}

/** Where a pointer event inside a page document falls in the app's viewport. */
export function viewportPoint(event: MouseEvent, doc: Document): { x: number; y: number } {
  const frame = doc.defaultView?.frameElement
  if (!(frame instanceof HTMLElement)) return { x: event.clientX, y: event.clientY }
  const rect = frame.getBoundingClientRect()
  // Fixed-layout pages are scaled with a transform; the event's coordinates are not.
  const scale = frame.offsetWidth ? rect.width / frame.offsetWidth : 1
  return { x: rect.left + event.clientX * scale, y: rect.top + event.clientY * scale }
}

/** Opens a link from a book in a new tab, if it is a kind of link worth following. */
export function openExternal(href: string): void {
  let url: URL
  try {
    url = new URL(href)
  } catch {
    return
  }
  if (!['http:', 'https:', 'mailto:'].includes(url.protocol)) return
  window.open(url, '_blank', 'noopener,noreferrer')
}
