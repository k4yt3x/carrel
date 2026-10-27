import { useEffect, useRef } from 'react'

/** How long the pointer rests on a control before its name shows. */
const restMs = 500
/** Within this long of one tip going away, the next shows at once, as the pointer runs along a bar. */
const warmMs = 400
/** Space between a control and its tip, and between the tip and the window's edges. */
const gap = 6

const isMac = /Mac|iPhone|iPad/.test(navigator.platform)

/** A shortcut from aria-keyshortcuts, as the keyboard labels it: "Control+F" is ⌘F on a Mac. */
function formatShortcut(shortcut: string): string {
  const keys = shortcut.split(' ')[0]?.split('+') ?? []
  if (isMac) return keys.map((key) => (key === 'Control' ? '⌘' : key)).join('')
  return keys.map((key) => (key === 'Control' ? 'Ctrl' : key)).join('+')
}

/**
 * Names the icon-only controls: a control marked `data-tooltip` shows a small tip with its
 * name (the attribute's value, or its aria-label when the value is empty), its shortcut from
 * aria-keyshortcuts, and its aria-description on a line of its own. The tip shows
 * when the pointer rests on the control or the keyboard reaches it, and goes on any press, key
 * or scroll. A finger has no hover, and a control it taps keeps its tip to itself.
 *
 * One tip serves the whole app, in the top layer, so dialogs never cover it. It repeats what
 * the control already says to assistive technology, so it is hidden from that.
 */
export function Tooltips() {
  const tip = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const element = tip.current
    if (!element) return
    const part = (name: string) => element.querySelector<HTMLElement>(`[data-part="${name}"]`)
    const [name, keys, detail] = [part('name'), part('keys'), part('detail')]
    let anchor: HTMLElement | null = null
    let timer: ReturnType<typeof setTimeout> | undefined
    let hiddenAt = 0
    // A control pressed keeps its tip away until the pointer leaves it: what the press opened
    // (a menu, a panel) is what matters then.
    let pressed: HTMLElement | null = null
    // Only Tab brings a tip with the focus. Focus also lands on a control when a dialog it
    // opened closes, or when the app moves it, and a tip then would be noise.
    let tabbing = false

    const place = (target: HTMLElement) => {
      const box = target.getBoundingClientRect()
      const { offsetWidth: width, offsetHeight: height } = element
      const viewport = document.documentElement.clientWidth
      const left = Math.min(
        Math.max(gap, box.left + box.width / 2 - width / 2),
        viewport - gap - width,
      )
      // Below the control, unless that runs off the window: then above (the reader's bottom bar).
      const below = box.bottom + gap
      const top = below + height > window.innerHeight - gap ? box.top - gap - height : below
      Object.assign(element.style, { left: `${left}px`, top: `${top}px` })
    }
    const show = (target: HTMLElement) => {
      const label = target.dataset.tooltip || target.getAttribute('aria-label') || ''
      if (!label || !target.isConnected) return
      anchor = target
      if (name) name.textContent = label
      if (detail) detail.textContent = target.getAttribute('aria-description') ?? ''
      const shortcut = target.getAttribute('aria-keyshortcuts')
      if (keys) keys.textContent = shortcut ? formatShortcut(shortcut) : ''
      if (!element.matches(':popover-open')) element.showPopover()
      place(target)
    }
    const hide = () => {
      clearTimeout(timer)
      if (!anchor) return
      anchor = null
      hiddenAt = Date.now()
      if (element.matches(':popover-open')) element.hidePopover()
    }
    const tooltipped = (target: EventTarget | null) =>
      target instanceof Element ? target.closest<HTMLElement>('[data-tooltip]') : null

    const onPointerOver = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return
      const target = tooltipped(event.target)
      if (!target || target === anchor || target === pressed) return
      hide()
      const warm = Date.now() - hiddenAt < warmMs
      timer = setTimeout(() => show(target), warm ? 0 : restMs)
    }
    const onPointerOut = (event: PointerEvent) => {
      const from = tooltipped(event.target)
      if (!from || (event.relatedTarget instanceof Node && from.contains(event.relatedTarget))) {
        return
      }
      if (from === pressed) pressed = null
      if (from === anchor) hide()
      else clearTimeout(timer)
    }
    const onFocusIn = (event: FocusEvent) => {
      const target = tooltipped(event.target)
      if (!tabbing || !target?.matches(':focus-visible')) return
      clearTimeout(timer)
      show(target)
    }
    const onFocusOut = (event: FocusEvent) => {
      if (tooltipped(event.target) === anchor) hide()
    }
    // Tab moves on to the next control, which shows its own tip; any other key acts.
    const onKeyDown = (event: KeyboardEvent) => {
      if (['Shift', 'Control', 'Alt', 'Meta'].includes(event.key)) return
      tabbing = event.key === 'Tab'
      if (!tabbing) hide()
    }
    const onPointerDown = (event: PointerEvent) => {
      tabbing = false
      pressed = tooltipped(event.target)
      hide()
    }

    document.addEventListener('pointerover', onPointerOver)
    document.addEventListener('pointerout', onPointerOut)
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    document.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('wheel', hide, { passive: true })
    window.addEventListener('scroll', hide, true)
    window.addEventListener('resize', hide)
    window.addEventListener('blur', hide)
    return () => {
      hide()
      document.removeEventListener('pointerover', onPointerOver)
      document.removeEventListener('pointerout', onPointerOut)
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
      document.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('wheel', hide)
      window.removeEventListener('scroll', hide, true)
      window.removeEventListener('resize', hide)
      window.removeEventListener('blur', hide)
    }
  }, [])

  return (
    <div
      ref={tip}
      popover="manual"
      aria-hidden
      className="pointer-events-none fixed inset-auto m-0 max-w-64 rounded-md border-0 bg-fg px-2 py-1 text-xs leading-normal text-surface shadow-lg"
    >
      <span className="flex gap-2">
        <span data-part="name" />
        <span data-part="keys" className="text-surface/70 empty:hidden" />
      </span>
      <span data-part="detail" className="block text-surface/70 empty:hidden" />
    </div>
  )
}
