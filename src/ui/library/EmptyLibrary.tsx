import { BookOpen, Plus } from 'lucide-react'

/** The first thing everyone sees: what Carrel holds, where it keeps it, and how to begin. */
export function EmptyLibrary({ onAdd, onRestore }: { onAdd(): void; onRestore(): void }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-24 text-center">
      <div className="grid size-16 place-items-center rounded-full bg-action-subtle text-action-fg">
        <BookOpen aria-hidden className="size-8" />
      </div>
      <h2 className="mt-6 font-serif text-2xl font-semibold leading-tight text-fg">
        Start your library
      </h2>
      <p className="mt-3 text-fg-secondary">
        Add EPUB, MOBI, AZW3, FB2, CBZ or PDF files. They stay in this browser and are never
        uploaded anywhere.
      </p>
      <button type="button" className="btn btn-primary mt-8" onClick={onAdd}>
        <Plus aria-hidden className="size-4" />
        Add books
      </button>
      <p className="mt-4 text-sm text-fg-muted">or drop files anywhere on this page</p>
      <p className="mt-12 text-sm text-fg-secondary">
        Moving from another browser?{' '}
        <button
          type="button"
          className="cursor-pointer font-semibold text-action-fg underline-offset-2 hover:underline"
          onClick={onRestore}
        >
          Restore a backup
        </button>
      </p>
    </div>
  )
}
