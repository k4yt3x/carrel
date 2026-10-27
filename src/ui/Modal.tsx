import { X } from 'lucide-react'
import { type ReactNode, useId } from 'react'
import { useBackdropDismiss, useModalDialog } from '@/ui/useModalDialog'

interface ModalProps {
  open: boolean
  title: string
  onClose(): void
  /** Runs when the dialog has opened, to move focus somewhere better than the title. */
  onOpened?(dialog: HTMLDialogElement): void
  children: ReactNode
}

/**
 * A titled modal window for a task of its own, such as managing fonts. It is a <dialog>, so
 * the browser traps focus inside, closes it on Escape and makes the page behind inert.
 */
export function Modal({ open, title, onClose, onOpened, children }: ModalProps) {
  const { ref, dismissed } = useModalDialog(open, onOpened)
  const backdrop = useBackdropDismiss(onClose)
  const titleId = useId()

  return (
    <dialog
      ref={ref}
      className="modal bg-scrim/40"
      aria-labelledby={titleId}
      onClose={(event) => {
        if (dismissed(event)) onClose()
      }}
      {...backdrop}
    >
      <div className="modal-box flex max-h-[85dvh] max-w-lg flex-col bg-surface-raised p-0 break-words shadow-2xl">
        <div className="flex h-16 shrink-0 items-center justify-between ps-6 pe-2">
          {/* The title takes the focus when the dialog opens (as the first focusable element),
              so no control starts out with a focus ring. */}
          <h2
            id={titleId}
            tabIndex={-1}
            className="text-lg font-semibold leading-tight text-fg focus:outline-none"
          >
            {title}
          </h2>
          <button
            type="button"
            className="btn btn-ghost btn-square"
            aria-label={`Close ${title.toLowerCase()}`}
            data-tooltip="Close"
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
