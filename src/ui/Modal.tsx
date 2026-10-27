import { X } from 'lucide-react'
import { type ReactNode, useEffect, useId, useRef } from 'react'

interface ModalProps {
  open: boolean
  title: string
  onClose(): void
  children: ReactNode
}

/**
 * A titled modal window for a task of its own, such as managing fonts. It is a <dialog>, so
 * the browser traps focus inside, closes it on Escape and makes the page behind inert.
 */
export function Modal({ open, title, onClose, children }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: Escape is the keyboard way out of a modal dialog, and the browser handles it
    <dialog
      ref={ref}
      className="modal bg-scrim/40"
      aria-labelledby={titleId}
      onClose={onClose}
      // A click outside the box lands on the dialog element itself.
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="modal-box flex max-h-[85dvh] max-w-lg flex-col bg-surface-raised p-0 shadow-2xl">
        <div className="flex h-16 shrink-0 items-center justify-between ps-6 pe-2">
          <h2 id={titleId} className="text-lg font-semibold leading-tight text-fg">
            {title}
          </h2>
          <button
            type="button"
            className="btn btn-ghost btn-square"
            aria-label={`Close ${title.toLowerCase()}`}
            onClick={onClose}
          >
            <X aria-hidden className="size-6" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-8">{children}</div>
      </div>
    </dialog>
  )
}
