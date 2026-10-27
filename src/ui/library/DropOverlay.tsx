import { BookDown } from 'lucide-react'
import { useEffect, useState } from 'react'

const carriesFiles = (event: DragEvent) => event.dataTransfer?.types.includes('Files') ?? false

/**
 * How long the page waits for the next dragover before taking the drag to have left. The
 * browser sends one every 50 ms while files are held over the page, moving or not.
 */
const dragGoneMs = 300

/**
 * Accepts books dropped anywhere on the page, and says so while files are dragged over it.
 */
export function DropOverlay({ onDrop }: { onDrop(files: File[]): void }) {
  const [active, setActive] = useState(false)

  useEffect(() => {
    // dragenter and dragleave fire for every element crossed, so count rather than toggle.
    // A count can go astray (an element leaving the page mid-drag takes its dragleave with
    // it), so the drag also has to keep reporting in.
    let depth = 0
    let gone: ReturnType<typeof setTimeout> | undefined
    const end = () => {
      clearTimeout(gone)
      depth = 0
      setActive(false)
    }
    const stillHere = () => {
      clearTimeout(gone)
      gone = setTimeout(end, dragGoneMs)
    }
    const enter = (event: DragEvent) => {
      if (!carriesFiles(event)) return
      event.preventDefault()
      depth += 1
      setActive(true)
      stillHere()
    }
    const over = (event: DragEvent) => {
      if (!carriesFiles(event)) return
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
      setActive(true)
      stillHere()
    }
    const leave = (event: DragEvent) => {
      if (!carriesFiles(event)) return
      depth = Math.max(0, depth - 1)
      if (depth === 0) end()
    }
    const drop = (event: DragEvent) => {
      if (!carriesFiles(event)) return
      event.preventDefault()
      end()
      onDrop([...(event.dataTransfer?.files ?? [])])
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragover', over)
    window.addEventListener('dragleave', leave)
    window.addEventListener('drop', drop)
    return () => {
      clearTimeout(gone)
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragover', over)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('drop', drop)
    }
  }, [onDrop])

  if (!active) return null
  return (
    <div className="pointer-events-none fixed inset-0 z-30 grid place-items-center bg-scrim/40 p-8">
      <div className="flex flex-col items-center gap-4 rounded-lg bg-surface-raised px-16 py-12 text-center shadow-2xl">
        <div className="grid size-16 place-items-center rounded-full bg-action-subtle text-action-fg">
          <BookDown aria-hidden className="size-8" />
        </div>
        <p className="text-lg font-semibold text-fg">Drop to add to your library</p>
      </div>
    </div>
  )
}
