import { type ReactNode, useEffect, useId, useRef, useState } from 'react'

interface ConfirmDialogProps {
  open: boolean
  title: string
  children: ReactNode
  confirmLabel: string
  /** Shown in place of the dialog closing when the action fails. */
  failureMessage: string
  /** The dialog closes when this resolves and stays open with the failure message if it rejects. */
  onConfirm(): Promise<void>
  onCancel(): void
}

/**
 * A modal question with two answers. The confirming action is destructive, so it carries
 * the loud treatment here, where destroying the thing is the point; focus starts on Cancel.
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  failureMessage,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      setFailed(false)
      dialog.showModal()
    }
    if (!open && dialog.open) dialog.close()
  }, [open])

  const confirm = async () => {
    setBusy(true)
    setFailed(false)
    try {
      await onConfirm()
    } catch (error) {
      console.error(error)
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: Escape is the keyboard way out of a modal dialog, and the browser handles it
    <dialog
      ref={ref}
      className="modal bg-scrim/40"
      aria-labelledby={titleId}
      onClose={onCancel}
      // A click outside the box lands on the dialog element itself.
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel()
      }}
    >
      <div className="modal-box max-w-md bg-surface-raised p-6 shadow-2xl">
        <h2 id={titleId} className="text-lg font-semibold leading-tight text-fg">
          {title}
        </h2>
        <div className="mt-3 text-sm text-fg-secondary">{children}</div>
        {failed && (
          <p role="alert" className="mt-4 text-sm text-danger-fg">
            {failureMessage}
          </p>
        )}
        <div className="mt-8 flex justify-end gap-3">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn btn-error" onClick={confirm} disabled={busy}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  )
}
