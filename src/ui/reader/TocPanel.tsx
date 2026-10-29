import type { TocItem } from 'foliate-js/view.js'
import { ChevronRight, X } from 'lucide-react'
import {
  type KeyboardEvent,
  type PointerEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import { tocWidthLimits } from '@/domain/settings'
import { childKey, pathTo } from '@/ui/reader/tocTree'
import { Sheet } from '@/ui/Sheet'

interface TocProps {
  open: boolean
  items: TocItem[]
  /** The entry being read, when the reader is at one. */
  current: TocItem | undefined
  onSelect(href: string): void
  onClose(): void
}

type Select = (href: string, byPointer: boolean) => void

// Where each level's titles start, in pixels: from the spacing scale (ps-6, ps-12, ps-16,
// ps-24); deeper levels share the last step. A level's fold button sits in the 24 pixels
// before its titles.
const indents = [24, 48, 64, 96] as const
const indentClasses = ['ps-6', 'ps-12', 'ps-16', 'ps-24'] as const

interface TreeProps {
  items: TocItem[]
  current: TocItem | undefined
  onSelect: Select
}

/**
 * The table of contents as a tree whose sections fold. It opens with the sections holding the
 * chapter being read unfolded and the rest folded, and unfolds more as the reader reads on.
 *
 * The keyboard moves as in a tree: up and down through the titles on show, right to unfold a
 * section (or into it, once unfolded), left to fold it (or out to the section holding it).
 */
function TocTree({ items, current, onSelect }: TreeProps) {
  const path = useMemo(() => pathTo(items, current), [items, current])
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set(path))
  // Reading on into another section unfolds it too; what the reader folded stays folded.
  useEffect(() => {
    setOpen((current) =>
      path.every((key) => current.has(key)) ? current : new Set([...current, ...path]),
    )
  }, [path])
  const toggle = (key: string) =>
    setOpen((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return
    const target = event.target as HTMLElement
    if (!target.matches('[data-toc-item]')) return
    const all = [...event.currentTarget.querySelectorAll<HTMLElement>('[data-toc-item]')]
    const at = all.indexOf(target)
    const key = target.dataset.key ?? ''
    const foldable = target.dataset.foldable !== undefined
    const unfolded = open.has(key)
    let next: HTMLElement | undefined
    if (event.key === 'ArrowDown') next = all[Math.min(all.length - 1, at + 1)]
    else if (event.key === 'ArrowUp') next = all[Math.max(0, at - 1)]
    else if (event.key === 'Home') next = all[0]
    else if (event.key === 'End') next = all.at(-1)
    else if (event.key === 'ArrowRight' && foldable) {
      if (unfolded) next = all[at + 1]
      else toggle(key)
    } else if (event.key === 'ArrowLeft') {
      if (foldable && unfolded) toggle(key)
      else if (key.includes('.')) {
        const parent = key.slice(0, key.lastIndexOf('.'))
        next = all.find((each) => each.dataset.key === parent)
      }
    } else return
    // These keys belong to the list, not to the page behind it.
    event.preventDefault()
    event.stopPropagation()
    next?.focus()
  }

  return (
    // Unnamed: what holds it, the docked panel or the sheet, is named "Contents".
    <nav onKeyDown={onKeyDown}>
      <TocLevel
        items={items}
        parent=""
        depth={0}
        open={open}
        onToggle={toggle}
        current={current}
        onSelect={onSelect}
      />
    </nav>
  )
}

function TocLevel({
  items,
  parent,
  depth,
  open,
  onToggle,
  current,
  onSelect,
}: TreeProps & {
  parent: string
  depth: number
  open: ReadonlySet<string>
  onToggle(key: string): void
}) {
  const level = Math.min(depth, indents.length - 1)
  return (
    <ul>
      {items.map((item, index) => {
        const key = childKey(parent, index)
        const reading = item === current
        const foldable = (item.subitems?.length ?? 0) > 0
        const unfolded = foldable && open.has(key)
        const label = item.label?.trim() || 'Untitled'
        const { href } = item
        return (
          <li key={key}>
            <div className="relative">
              <button
                type="button"
                data-toc-item
                data-key={key}
                data-foldable={foldable || undefined}
                aria-expanded={foldable ? unfolded : undefined}
                aria-current={reading ? 'location' : undefined}
                data-current={reading || undefined}
                // A click from the keyboard has no pointer behind it, and so no click count. A
                // heading that leads nowhere folds instead.
                onClick={(event) => {
                  if (href) onSelect(href, event.detail > 0)
                  else if (foldable) onToggle(key)
                }}
                className={`block w-full py-2 pe-6 text-start text-sm leading-tight hover:bg-surface-hover focus-visible:-outline-offset-2 ${
                  indentClasses[level]
                } ${
                  reading
                    ? 'bg-action-subtle font-semibold text-action-fg hover:bg-action-subtle'
                    : depth === 0
                      ? 'text-fg'
                      : 'text-fg-secondary'
                }`}
              >
                {label}
              </button>
              {foldable && (
                // The pointer's way to fold; the keyboard folds from the title itself.
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label={`${unfolded ? 'Fold' : 'Unfold'} ${label}`}
                  className="absolute inset-y-0 flex w-6 items-center justify-center text-fg-muted hover:text-fg"
                  style={{ insetInlineStart: (indents[level] ?? 24) - 24 }}
                  onClick={() => onToggle(key)}
                >
                  <ChevronRight
                    aria-hidden
                    className={`size-4 transition-transform duration-150 ${unfolded ? 'rotate-90' : ''}`}
                  />
                </button>
              )}
            </div>
            {unfolded && item.subitems && (
              <TocLevel
                items={item.subitems}
                parent={key}
                depth={depth + 1}
                open={open}
                onToggle={onToggle}
                current={current}
                onSelect={onSelect}
              />
            )}
          </li>
        )
      })}
    </ul>
  )
}

interface TocPanelProps extends TocProps {
  /** Whether the window is wide enough to dock the contents beside the page. */
  docked: boolean
  /** Whether choosing a chapter closes the docked contents: when it lies over the text. */
  closeOnSelect: boolean
  /** The docked contents' width, in pixels, which the reader can drag. */
  width: number
  onResize(width: number): void
}

/**
 * The book's table of contents. On a wide window it docks at the leading edge and stays open
 * while the reader reads, closed only by its own button or Escape; on a narrow one it is a
 * sheet that closes once a chapter is chosen.
 */
export function TocPanel({ docked, closeOnSelect, width, onResize, ...props }: TocPanelProps) {
  return docked ? (
    <TocSidebar {...props} closeOnSelect={closeOnSelect} width={width} onResize={onResize} />
  ) : (
    <TocSheet {...props} />
  )
}

function TocSheet({ open, items, current, onSelect, onClose }: TocProps) {
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
      <TocTree
        items={items}
        current={current}
        onSelect={(href) => {
          onClose()
          onSelect(href)
        }}
      />
    </Sheet>
  )
}

/** The widest the docked contents may be: the limit, and never more than half the window. */
const widest = () =>
  Math.max(tocWidthLimits.min, Math.min(tocWidthLimits.max, window.innerWidth / 2))

/**
 * The edge the docked contents are resized by: dragged, or with the arrow keys once focused,
 * as a window splitter.
 */
function ResizeHandle({ width, onResize }: { width: number; onResize(width: number): void }) {
  const drag = useRef<{ x: number; width: number } | null>(null)
  const resize = (next: number) =>
    onResize(Math.round(Math.max(tocWidthLimits.min, Math.min(widest(), next))))
  return (
    // biome-ignore lint/a11y/useSemanticElements: a window splitter has no element of its own; <hr> can't take focus or a value
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize contents"
      aria-valuemin={tocWidthLimits.min}
      aria-valuemax={Math.round(widest())}
      aria-valuenow={Math.min(width, Math.round(widest()))}
      tabIndex={0}
      className="group absolute inset-y-0 end-[-6px] z-10 w-3 cursor-col-resize touch-none focus-visible:outline-none"
      onPointerDown={(event: PointerEvent<HTMLDivElement>) => {
        if (event.button !== 0) return
        event.preventDefault()
        event.currentTarget.setPointerCapture(event.pointerId)
        drag.current = { x: event.clientX, width }
      }}
      onPointerMove={(event) => {
        if (drag.current) resize(drag.current.width + event.clientX - drag.current.x)
      }}
      onLostPointerCapture={() => {
        drag.current = null
      }}
      onKeyDown={(event) => {
        const step = event.shiftKey ? 64 : 16
        if (event.key === 'ArrowLeft') resize(width - step)
        else if (event.key === 'ArrowRight') resize(width + step)
        else if (event.key === 'Home') resize(tocWidthLimits.min)
        else if (event.key === 'End') resize(widest())
        else return
        event.preventDefault()
        event.stopPropagation()
      }}
    >
      {/* The edge shows where to take hold while the pointer is over it, or it has focus. */}
      <span className="absolute inset-y-0 start-1/2 w-[2px] -translate-x-1/2 bg-transparent transition-colors group-hover:bg-border-strong group-focus-visible:bg-focus" />
    </div>
  )
}

function TocSidebar({
  open,
  items,
  current,
  onSelect,
  onClose,
  closeOnSelect,
  width,
  onResize,
}: TocProps & { closeOnSelect: boolean; width: number; onResize(width: number): void }) {
  const list = useRef<HTMLDivElement>(null)
  const titleId = useId()

  // Opening shows the chapter being read. Opened from the keyboard, the focus starts there too,
  // so the keys move from where the reader is; opened with a click, they stay with the page.
  useEffect(() => {
    if (!open) return
    const fromKeyboard = document.activeElement?.matches(':focus-visible') ?? false
    const current = list.current?.querySelector<HTMLElement>('[data-current]')
    current?.scrollIntoView({ block: 'center' })
    if (!fromKeyboard) return
    ;(current ?? list.current?.querySelector<HTMLElement>('[data-toc-item]'))?.focus({
      preventScroll: true,
    })
  }, [open])

  if (!open) return null
  return (
    <aside
      data-toc
      aria-labelledby={titleId}
      className="absolute inset-y-0 start-0 z-20 flex flex-col border-e border-border bg-surface-raised pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] text-fg"
      // The width is the list's own; the panel runs on under a notch beside it, as the bars do.
      style={{ width: `calc(${width}px + env(safe-area-inset-left))` }}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || event.ctrlKey || event.metaKey || event.altKey) return
        event.preventDefault()
        event.stopPropagation()
        onClose()
      }}
    >
      {/* As tall as the reader's bars, which run on beside it. */}
      <div className="flex h-[44px] shrink-0 items-center justify-between ps-6 pe-2">
        <h2 id={titleId} className="text-sm font-semibold text-fg">
          Contents
        </h2>
        <button
          type="button"
          className="btn btn-ghost btn-square [--size:36px]"
          aria-label="Close contents"
          data-tooltip="Close"
          onClick={onClose}
        >
          <X aria-hidden className="size-[20px]" />
        </button>
      </div>
      <div ref={list} className="min-h-0 flex-1 overflow-y-auto pb-8">
        <TocTree
          items={items}
          current={current}
          onSelect={(href, byPointer) => {
            if (closeOnSelect) onClose()
            // After a click the keys go back to turning pages; from the keyboard, focus stays
            // in the list so the reader can go on choosing.
            else if (byPointer && document.activeElement instanceof HTMLElement)
              document.activeElement.blur()
            onSelect(href)
          }}
        />
      </div>
      <ResizeHandle width={width} onResize={onResize} />
    </aside>
  )
}
