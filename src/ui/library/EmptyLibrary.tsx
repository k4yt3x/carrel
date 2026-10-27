import { BookPlus, Plus } from 'lucide-react'
import { bookFormatNames } from '@/domain/formats'

/**
 * The first thing everyone sees: how to begin, and which files Carrel reads. Shapes say what
 * words would otherwise: the dashed edge marks a place to drop files (the whole page takes
 * them), the formats are tags, and the two ways to start sit side by side.
 */
export function EmptyLibrary({ onAdd, onRestore }: { onAdd(): void; onRestore(): void }) {
  return (
    <div className="m-auto flex w-full max-w-xl flex-col items-center rounded-lg border-2 border-dashed border-border-strong px-6 py-12 text-center">
      <BookPlus aria-hidden className="size-8 stroke-[1.5] text-fg-muted" />
      <h2 className="mt-4 text-xl font-semibold text-fg">Start your library</h2>
      <ul aria-label="Formats Carrel reads" className="mt-4 flex flex-wrap justify-center gap-2">
        {bookFormatNames.map((format) => (
          <li
            key={format}
            className="rounded-sm bg-surface-sunken px-2 py-1 text-xs tracking-wide text-fg-secondary"
          >
            {format}
          </li>
        ))}
      </ul>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <button type="button" className="btn btn-primary" onClick={onAdd}>
          <Plus aria-hidden className="size-4" />
          Add books
        </button>
        <button type="button" className="btn" onClick={onRestore}>
          Restore a backup
        </button>
      </div>
    </div>
  )
}
