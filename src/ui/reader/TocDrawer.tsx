import type { TocItem } from 'foliate-js/view.js'
import { X } from 'lucide-react'
import { useEffect, useRef } from 'react'

interface TocDrawerProps {
  open: boolean
  items: TocItem[]
  currentHref: string | undefined
  onSelect(href: string): void
  onClose(): void
}

// Indentation per nesting level, from the spacing scale; deeper levels share the last step.
const indents = ['ps-6', 'ps-12', 'ps-16', 'ps-24'] as const

function TocList({
  items,
  depth,
  currentHref,
  onSelect,
}: Pick<TocDrawerProps, 'items' | 'currentHref' | 'onSelect'> & { depth: number }) {
  return (
    <ul>
      {items.map((item, index) => {
        const current = item.href === currentHref
        return (
          // Hrefs repeat in some books, so the position in the list keys the item.
          // biome-ignore lint/suspicious/noArrayIndexKey: a table of contents never reorders
          <li key={index}>
            <button
              type="button"
              aria-current={current ? 'location' : undefined}
              data-current={current || undefined}
              onClick={() => onSelect(item.href)}
              className={`block w-full py-2 pe-6 text-start text-sm leading-tight hover:bg-surface-hover focus-visible:-outline-offset-2 ${
                indents[Math.min(depth, indents.length - 1)]
              } ${
                current
                  ? 'bg-action-subtle font-semibold text-action-fg hover:bg-action-subtle'
                  : depth === 0
                    ? 'text-fg'
                    : 'text-fg-secondary'
              }`}
            >
              {item.label.trim() || 'Untitled'}
            </button>
            {item.subitems && item.subitems.length > 0 && (
              <TocList
                items={item.subitems}
                depth={depth + 1}
                currentHref={currentHref}
                onSelect={onSelect}
              />
            )}
          </li>
        )
      })}
    </ul>
  )
}

/** The book's table of contents, in a sheet from the leading edge. */
export function TocDrawer({ open, items, currentHref, onSelect, onClose }: TocDrawerProps) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
      // Start on the chapter being read, so the keyboard moves from where the reader is.
      const current = dialog.querySelector<HTMLElement>('[data-current]')
      current?.focus()
      current?.scrollIntoView({ block: 'center' })
    }
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: Escape is the keyboard way out of a modal dialog, and the browser handles it
    <dialog
      ref={ref}
      aria-labelledby="toc-title"
      onClose={onClose}
      // A click on the backdrop lands on the dialog element itself.
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      className="fixed inset-y-0 start-0 m-0 h-full max-h-none w-full max-w-none bg-surface-raised p-0 text-fg shadow-2xl backdrop:bg-scrim/40 sm:w-96"
    >
      <div className="flex h-full flex-col">
        <div className="flex h-16 shrink-0 items-center justify-between ps-6 pe-2">
          <h2 id="toc-title" className="text-sm font-semibold text-fg">
            Contents
          </h2>
          <button
            type="button"
            className="btn btn-ghost btn-square"
            aria-label="Close contents"
            onClick={onClose}
          >
            <X aria-hidden className="size-6" />
          </button>
        </div>
        <nav aria-labelledby="toc-title" className="min-h-0 flex-1 overflow-y-auto pb-8">
          <TocList items={items} depth={0} currentHref={currentHref} onSelect={onSelect} />
        </nav>
      </div>
    </dialog>
  )
}
