import { X } from 'lucide-react'
import { type ReactNode, useId } from 'react'
import { useBackdropDismiss, useModalDialog } from '@/ui/useModalDialog'

interface SheetProps {
  open: boolean
  title: string
  /** The edge it slides from on wide screens; on narrow ones every sheet rises from the bottom. */
  side: 'start' | 'end'
  /**
   * Whether the page behind stays in view, undimmed: for settings, whose effect the reader
   * should see while changing them.
   */
  seeThrough?: boolean
  /** Runs when the sheet has opened, to move focus somewhere better than the first control. */
  onOpened?(dialog: HTMLDialogElement): void
  onClose(): void
  children: ReactNode
}

/**
 * A modal panel at the side of the screen. It is a <dialog>, so the browser traps focus inside,
 * closes it on Escape and makes the page behind inert.
 */
export function Sheet({ open, title, side, seeThrough, onOpened, onClose, children }: SheetProps) {
  const { ref, dismissed } = useModalDialog(open, onOpened)
  const backdrop = useBackdropDismiss(onClose)
  const titleId = useId()

  const edge = side === 'start' ? 'sm:start-0 sm:end-auto' : 'sm:end-0 sm:start-auto'
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={(event) => {
        if (dismissed(event)) onClose()
      }}
      {...backdrop}
      className={`fixed inset-x-0 top-auto bottom-0 m-0 max-h-[75dvh] w-full max-w-none rounded-t-lg bg-surface-raised p-0 text-fg shadow-2xl sm:inset-y-0 sm:h-full sm:max-h-none sm:w-96 sm:rounded-none ${edge} ${
        seeThrough ? 'backdrop:bg-transparent' : 'backdrop:bg-scrim/40'
      }`}
    >
      <div className="flex h-full max-h-[inherit] flex-col">
        <div className="flex h-16 shrink-0 items-center justify-between ps-6 pe-2">
          {/* The title takes the focus when the sheet opens, unless onOpened moves it. */}
          <h2
            id={titleId}
            tabIndex={-1}
            className="text-sm font-semibold text-fg focus:outline-none"
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
        <div className="min-h-0 flex-1 overflow-y-auto pb-8">{children}</div>
      </div>
    </dialog>
  )
}
