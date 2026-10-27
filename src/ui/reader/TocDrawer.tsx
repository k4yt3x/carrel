import type { TocItem } from 'foliate-js/view.js'
import { Sheet } from '@/ui/Sheet'

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
  return (
    <Sheet
      open={open}
      title="Contents"
      side="start"
      onClose={onClose}
      onOpened={(dialog) => {
        // Start on the chapter being read, so the keyboard moves from where the reader is.
        const current = dialog.querySelector<HTMLElement>('[data-current]')
        current?.focus()
        current?.scrollIntoView({ block: 'center' })
      }}
    >
      <nav aria-label="Contents">
        <TocList items={items} depth={0} currentHref={currentHref} onSelect={onSelect} />
      </nav>
    </Sheet>
  )
}
