import { Info } from 'lucide-react'
import { type ReactNode, useId, useRef } from 'react'

/** Space between the icon and its tip, and between the tip and the window's edges. */
const gap = 8

/**
 * A small (i) beside a control, for the one thing worth knowing about it that its label can't
 * say. The explanation shows on hover or focus, and on tap where there is no hover; it lives
 * in the top layer, so a scrolling sheet or a dialog never clips it.
 */
export function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  const id = useId()
  const button = useRef<HTMLButtonElement>(null)
  const tip = useRef<HTMLSpanElement>(null)
  // A press focuses the button and then clicks it: the click decides, so a tap doesn't show
  // the tip on focus and hide it again on the click. A tip a click showed stays until the
  // next click, or until the pointer or focus leaves.
  const pressing = useRef(false)
  const clicked = useRef(false)

  const show = () => {
    const anchor = button.current?.getBoundingClientRect()
    const element = tip.current
    if (!anchor || !element || element.matches(':popover-open')) return
    element.showPopover()
    // Below the icon, kept inside the window.
    const width = element.offsetWidth
    const left = Math.min(
      Math.max(gap, anchor.left + anchor.width / 2 - width / 2),
      window.innerWidth - width - gap,
    )
    Object.assign(element.style, { left: `${left}px`, top: `${anchor.bottom + gap / 2}px` })
  }
  const hide = () => {
    pressing.current = false
    clicked.current = false
    if (tip.current?.matches(':popover-open')) tip.current.hidePopover()
  }

  return (
    <>
      <button
        ref={button}
        type="button"
        aria-label={label}
        aria-describedby={id}
        className="inline-grid size-6 shrink-0 cursor-help place-items-center rounded-full text-fg-muted hover:text-fg"
        // Hover shows it for a mouse or a pen (which some drivers report a mouse as); a finger
        // has no hover and taps instead.
        onPointerEnter={(event) => {
          if (event.pointerType !== 'touch') show()
        }}
        onPointerLeave={(event) => {
          if (event.pointerType !== 'touch') hide()
        }}
        onPointerDown={() => {
          pressing.current = true
        }}
        onFocus={() => {
          if (!pressing.current) show()
        }}
        onBlur={hide}
        onClick={() => {
          pressing.current = false
          if (clicked.current) {
            hide()
          } else {
            show()
            clicked.current = true
          }
        }}
        // Escape puts the tip away rather than closing the dialog it is in.
        onKeyDown={(event) => {
          if (event.key !== 'Escape' || !tip.current?.matches(':popover-open')) return
          event.preventDefault()
          event.stopPropagation()
          hide()
        }}
      >
        <Info aria-hidden className="size-4" />
      </button>
      <span
        ref={tip}
        id={id}
        role="tooltip"
        popover="manual"
        className="fixed inset-auto m-0 max-w-64 rounded-md border-0 bg-fg px-3 py-2 text-xs leading-normal font-normal text-surface shadow-lg"
      >
        {children}
      </span>
    </>
  )
}
