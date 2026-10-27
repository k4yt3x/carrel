import type { View } from 'foliate-js/view.js'
import { X } from 'lucide-react'
import { type RefObject, useEffect, useRef } from 'react'
import { openExternal } from '@/ui/reader/navigation'
import { useBackdropDismiss } from '@/ui/useModalDialog'

export interface Note {
  /** A view of its own, showing just the note. */
  view: View
  /** Where the note is in the book; null until the note has been found and rendered. */
  href: string | null
}

export interface NotePopupRefs {
  dialog: RefObject<HTMLDialogElement | null>
  frame: RefObject<HTMLDivElement | null>
}

/** The card's padding around the note (p-4). */
const inset = 16

/**
 * Puts a note's view on screen. foliate-js lays the note out only once its view is in the
 * document, so this runs when the view is about to render, before React could.
 */
export function presentNote({ dialog, frame }: NotePopupRefs, view: View): void {
  if (!dialog.current || !frame.current) return
  frame.current.style.height = ''
  frame.current.replaceChildren(view)
  if (!dialog.current.open) dialog.current.showModal()
}

interface FootnotePopupProps extends NotePopupRefs {
  note: Note | null
  onClose(): void
  /** Leaves the popup for the note's place in the book. */
  onFollow(href: string): void
}

/**
 * A footnote, shown over the page where the reader is rather than by jumping to the end of
 * the chapter. The card grows with the note up to two fifths of the window and scrolls past
 * that.
 */
export function FootnotePopup({ note, onClose, onFollow, dialog, frame }: FootnotePopupProps) {
  const backdrop = useBackdropDismiss(onClose)
  const latest = useRef({ onClose, onFollow })
  latest.current = { onClose, onFollow }
  const view = note?.view
  const rendered = note?.href != null

  // Links in the note lead out of it; Escape inside the note's page closes it.
  useEffect(() => {
    if (!view) return
    const listening = new AbortController()
    const { signal } = listening
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') latest.current.onClose()
    }
    const listen = (doc: Document | undefined) =>
      doc?.addEventListener('keydown', onKey, { signal })
    listen(view.renderer.getContents?.()[0]?.doc)
    view.addEventListener('load', (event) => listen(event.detail.doc), { signal })
    view.addEventListener(
      'link',
      (event) => {
        event.preventDefault()
        latest.current.onFollow(event.detail.href)
      },
      { signal },
    )
    view.addEventListener(
      'external-link',
      (event) => {
        event.preventDefault()
        openExternal(event.detail.href)
      },
      { signal },
    )
    return () => listening.abort()
  }, [view])

  // A note's view is disposed of once another note replaces it or the popup closes. This is
  // not an effect cleanup: those also run when React re-runs effects, which would tear down
  // the note on screen.
  const shown = useRef<View | null>(null)
  useEffect(() => {
    const previous = shown.current
    if (previous && previous !== view) {
      previous.close()
      previous.remove()
    }
    shown.current = view ?? null
  }, [view])
  useEffect(() => () => shown.current?.close(), [])

  // Once the note is laid out, the card takes its height.
  useEffect(() => {
    const container = frame.current
    if (!view || !rendered || !container) return
    const frameId = requestAnimationFrame(() => {
      // The body, not the document: the document is at least as tall as the frame it fills.
      const body = view.renderer.getContents?.()[0]?.doc.body
      const height = Math.ceil(body?.getBoundingClientRect().bottom ?? 0)
      const most = Math.round(window.innerHeight * 0.4)
      container.style.height = `${Math.min(most, Math.max(48, height + 2 * inset))}px`
    })
    return () => cancelAnimationFrame(frameId)
  }, [view, rendered, frame])

  useEffect(() => {
    if (!note && dialog.current?.open) dialog.current.close()
  }, [note, dialog])

  return (
    <dialog
      ref={dialog}
      aria-label="Note"
      onClose={onClose}
      {...backdrop}
      className="fixed inset-x-4 top-auto bottom-[calc(24px+env(safe-area-inset-bottom))] m-0 mx-auto w-auto max-w-xl rounded-lg bg-surface-raised p-0 text-fg shadow-xl ring-1 ring-border backdrop:bg-transparent sm:inset-x-0"
    >
      <div ref={frame} className="h-16 p-4" />
      <div className="flex items-center justify-between border-t border-border ps-2 pe-1">
        <button
          type="button"
          className="btn btn-ghost btn-sm text-action-fg"
          disabled={!note?.href}
          onClick={() => note?.href && onFollow(note.href)}
        >
          Go to note
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-square btn-sm"
          aria-label="Close note"
          data-tooltip="Close"
          onClick={onClose}
        >
          <X aria-hidden className="size-4" />
        </button>
      </div>
    </dialog>
  )
}
