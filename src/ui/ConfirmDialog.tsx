import { type ReactNode, useId, useRef, useState } from 'react'
import { useBackdropDismiss, useModalDialog } from '@/ui/useModalDialog'

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
  const titleId = useId()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const { ref, dismissed } = useModalDialog(open, () => setFailed(false))
  const backdrop = useBackdropDismiss(onCancel)
  // The question stays as it was asked while the dialog fades out, though what it was about
  // (the book, the books chosen) is gone by then.
  const asked = useRef({ title, children })
  if (open) asked.current = { title, children }

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
    <dialog
      ref={ref}
      className="modal bg-scrim/40"
      aria-labelledby={titleId}
      onClose={(event) => {
        if (dismissed(event)) onCancel()
      }}
      {...backdrop}
    >
      <div className="modal-box max-w-md bg-surface-raised p-6 break-words shadow-2xl">
        <h2 id={titleId} className="text-lg font-semibold leading-tight text-fg">
          {asked.current.title}
        </h2>
        <div className="mt-3 text-sm text-fg-secondary">{asked.current.children}</div>
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
