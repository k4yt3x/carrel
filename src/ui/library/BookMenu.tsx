import { Ellipsis, Trash2 } from 'lucide-react'
import { type ToggleEvent, useId, useRef } from 'react'

interface BookMenuProps {
  title: string
  onRemove(): void
}

const gap = 4

/** The actions on one book, kept behind a button so the shelf shows books rather than controls. */
export function BookMenu({ title, onRemove }: BookMenuProps) {
  const id = useId()
  const button = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)

  // The menu opens in the top layer, detached from the card. Before it shows, it is placed
  // under the button and end-aligned with it; once it has a size, it flips above the button
  // if it would run off the bottom of the viewport.
  const placeBelow = (event: ToggleEvent<HTMLDivElement>) => {
    if (event.newState !== 'open' || !button.current || !menu.current) return
    const anchor = button.current.getBoundingClientRect()
    Object.assign(menu.current.style, {
      top: `${anchor.bottom + gap}px`,
      right: `${document.documentElement.clientWidth - anchor.right}px`,
    })
  }
  const keepInView = (event: ToggleEvent<HTMLDivElement>) => {
    if (event.newState !== 'open' || !button.current || !menu.current) return
    const anchor = button.current.getBoundingClientRect()
    const height = menu.current.offsetHeight
    if (anchor.bottom + gap + height > window.innerHeight) {
      menu.current.style.top = `${Math.max(gap, anchor.top - gap - height)}px`
    }
  }

  return (
    <>
      <button
        ref={button}
        type="button"
        popoverTarget={id}
        className="btn btn-ghost btn-sm btn-square text-fg-muted hover:text-fg"
        aria-label={`More actions for ${title}`}
      >
        <Ellipsis aria-hidden className="size-4" />
      </button>
      <div
        ref={menu}
        id={id}
        popover="auto"
        onBeforeToggle={placeBelow}
        onToggle={keepInView}
        className="inset-auto m-0 min-w-48 rounded-lg border-0 bg-surface-raised p-1 text-fg shadow-lg"
      >
        <button
          type="button"
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-start text-sm text-danger-fg hover:bg-surface-hover focus-visible:bg-surface-hover"
          onClick={() => {
            menu.current?.hidePopover()
            onRemove()
          }}
        >
          <Trash2 aria-hidden className="size-4" />
          Remove from library…
        </button>
      </div>
    </>
  )
}
