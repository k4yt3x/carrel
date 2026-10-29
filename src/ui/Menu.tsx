import type { LucideIcon } from 'lucide-react'
import { type ReactNode, type ToggleEvent, useId, useRef, useState } from 'react'
import { flushSync } from 'react-dom'

export interface MenuItem {
  label: string
  icon: LucideIcon
  /** A destructive action, shown in the danger colour. */
  danger?: boolean
  onSelect(): void
}

interface MenuProps {
  /** What the button shows. */
  children: ReactNode
  /** The button's accessible name, when what it shows is only an icon. */
  label?: string
  /** What the button's tip says, when it shows only an icon (see Tooltips). */
  tooltip?: string
  buttonClassName: string
  /** Which edge of the button the menu lines up with. */
  align: 'start' | 'end'
  items: MenuItem[]
}

const gap = 4

const item =
  'flex w-full items-center gap-3 rounded-md px-3 py-2 text-start text-sm hover:bg-surface-hover focus-visible:bg-surface-hover'

/**
 * A button that opens a short list of actions. The list is a popover, so it opens in the top
 * layer (above dialogs too) and closes on Escape or a click elsewhere.
 */
export function Menu({ children, label, tooltip, buttonClassName, align, items }: MenuProps) {
  const id = useId()
  const button = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  // The actions are drawn only while the menu shows: a shelf of books has a menu for each.
  const [open, setOpen] = useState(false)

  // The menu is detached from the button in the top layer. Before it shows, it is placed under
  // the button, lined up with the chosen edge; once it has a size, it flips above the button
  // if it would run off the bottom of the viewport, and moves in from a side it would run off.
  const placeBelow = (event: ToggleEvent<HTMLDivElement>) => {
    if (event.newState !== 'open' || !button.current || !menu.current) return
    // In place before the menu shows, so it shows whole and is measured whole below.
    flushSync(() => setOpen(true))
    const anchor = button.current.getBoundingClientRect()
    Object.assign(
      menu.current.style,
      align === 'end'
        ? {
            top: `${anchor.bottom + gap}px`,
            right: `${document.documentElement.clientWidth - anchor.right}px`,
            left: 'auto',
          }
        : { top: `${anchor.bottom + gap}px`, left: `${anchor.left}px`, right: 'auto' },
    )
  }
  const keepInView = (event: ToggleEvent<HTMLDivElement>) => {
    if (event.newState !== 'open') setOpen(false)
    if (event.newState !== 'open' || !button.current || !menu.current) return
    const anchor = button.current.getBoundingClientRect()
    const { offsetWidth: width, offsetHeight: height, style } = menu.current
    if (anchor.bottom + gap + height > window.innerHeight) {
      style.top = `${Math.max(gap, anchor.top - gap - height)}px`
    }
    const viewport = document.documentElement.clientWidth
    const left = align === 'end' ? anchor.right - width : anchor.left
    const fitted = Math.max(gap, Math.min(left, viewport - gap - width))
    if (fitted !== left) Object.assign(style, { left: `${fitted}px`, right: 'auto' })
  }

  return (
    <>
      <button
        ref={button}
        type="button"
        popoverTarget={id}
        className={buttonClassName}
        aria-label={label}
        data-tooltip={tooltip}
      >
        {children}
      </button>
      {/* A ring as well as the shadow: over a dialog, itself raised, a dark theme's shadow
          barely shows. */}
      <div
        ref={menu}
        id={id}
        popover="auto"
        onBeforeToggle={placeBelow}
        onToggle={keepInView}
        className="inset-auto m-0 min-w-48 rounded-lg border-0 bg-surface-raised p-1 text-fg shadow-lg ring-1 ring-border"
      >
        {open &&
          items.map(({ label: itemLabel, icon: Icon, danger, onSelect }) => (
            <button
              key={itemLabel}
              type="button"
              className={`${item} ${danger ? 'text-danger-fg' : ''}`}
              onClick={() => {
                menu.current?.hidePopover()
                onSelect()
              }}
            >
              <Icon aria-hidden className={`size-4 ${danger ? '' : 'text-fg-muted'}`} />
              {itemLabel}
            </button>
          ))}
      </div>
    </>
  )
}
