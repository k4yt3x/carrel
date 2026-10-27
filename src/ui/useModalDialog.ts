import { type PointerEvent, type SyntheticEvent, useEffect, useLayoutEffect, useRef } from 'react'

/**
 * Shows a <dialog> as a modal while `open` is true and closes it when `open` turns false.
 *
 * The dialog's `close` event fires both when the reader dismisses it (Escape, a close button)
 * and when it is closed because `open` turned false. `dismissed` tells the two apart: it is
 * true only for the first, so a parent that swaps one dialog for another (closing the reading
 * settings to open the fonts) isn't told that the reader dismissed the first.
 *
 * It is also false for the close of a dialog opened from inside this one (a theme editor in
 * the settings): React passes that event up through its parents, though the browser's doesn't
 * bubble, and the outer dialog would otherwise close along with the inner one.
 */
export function useModalDialog(open: boolean, onOpened?: (dialog: HTMLDialogElement) => void) {
  const ref = useRef<HTMLDialogElement>(null)
  const isOpen = useRef(open)
  isOpen.current = open
  const opened = useRef(onOpened)
  opened.current = onOpened
  const returnFocus = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      returnFocus.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null
      dialog.showModal()
      opened.current?.(dialog)
    }
    if (!open && dialog.open) dialog.close()
  }, [open])

  // Closing a dialog returns the focus to where it was before it opened; removing one while it
  // is open (an editor shown only while editing) doesn't, so it is done here, once the dialog
  // has left the page. Closing it here instead would count as the reader dismissing it.
  useLayoutEffect(() => {
    const dialog = ref.current
    return () => {
      if (!dialog?.open || !dialog.contains(document.activeElement)) return
      const target = returnFocus.current
      queueMicrotask(() => {
        if (target?.isConnected) target.focus()
      })
    }
  }, [])

  const dismissed = (event: SyntheticEvent<HTMLDialogElement>) =>
    event.target === event.currentTarget && isOpen.current
  return { ref, dismissed }
}

/**
 * Handlers that dismiss a modal dialog on a click on its backdrop, which lands on the dialog
 * element itself. A press that starts inside the box and ends outside (selecting text, say)
 * also clicks the dialog element, their nearest common ancestor; it doesn't dismiss.
 */
export function useBackdropDismiss(onDismiss: () => void) {
  const pressedOnBackdrop = useRef(false)
  return {
    onPointerDown: (event: PointerEvent<HTMLDialogElement>) => {
      pressedOnBackdrop.current = event.target === event.currentTarget
    },
    onClick: (event: SyntheticEvent<HTMLDialogElement>) => {
      if (event.target === event.currentTarget && pressedOnBackdrop.current) onDismiss()
      pressedOnBackdrop.current = false
    },
  }
}
