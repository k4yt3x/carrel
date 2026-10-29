/*
 * Design brief (refactoring-ui Workflow B), fonts.
 *
 * Feature: read books in a typeface of your own, such as a CJK family the system lacks.
 * Content, by rank:
 *   primary    the fonts already added, by name
 *   secondary  adding one, from files on the device or from a link
 *   tertiary   where each font came from; what kinds of link work
 * Layers: the page shows the fonts and one "Add font" button. Its menu holds the two ways to
 *   add; files go straight to the picker, and a link gets a small dialog of its own, so
 *   neither way's controls crowd the settings they sit in.
 * Actions: "Add font" is a secondary button, since the manager sits inside settings that have
 *   no single primary action; Remove is a quiet icon per row, confirmed, since it can't be
 *   undone.
 * Tokens: names 14px fg; sources 12px fg-muted truncated; errors 14px danger-fg.
 */

import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronDown, FolderOpen, Link as LinkIcon, Trash2 } from 'lucide-react'
import { type FormEvent, useId, useRef, useState } from 'react'
import { db, type Font } from '@/domain/db'
import { addFontFiles, addFontFromUrl, FontImportError, removeFont } from '@/domain/fonts'
import { ConfirmDialog } from '@/ui/ConfirmDialog'
import { InfoTip } from '@/ui/InfoTip'
import { Menu } from '@/ui/Menu'
import { Modal } from '@/ui/Modal'
import { pickerAccept } from '@/ui/platform'

const fontExtensions = ['.ttf', '.otf', '.woff', '.woff2']

type Work =
  | { name: 'idle' }
  | { name: 'adding'; done: number; total: number }
  | { name: 'failed'; message: string }

const count = new Intl.NumberFormat()

/** Where a font came from, in a few words: the site it was downloaded from, or its files. */
function origin(font: Font): string {
  if (URL.canParse(font.source)) return new URL(font.source).host
  return font.files.length === 1 ? '1 file' : `${count.format(font.files.length)} files`
}

/** What went wrong, for the reader; a FontImportError already says it in their terms. */
function failureMessage(error: unknown): string {
  if (error instanceof FontImportError) return error.message
  console.error('could not add the font', error)
  return 'The font couldn’t be added because of an unexpected error. Try again.'
}

/**
 * Asks for a link to a font and downloads it. Closing the dialog while it downloads stops the
 * download.
 */
function LinkDialog({ open, onClose }: { open: boolean; onClose(): void }) {
  const [link, setLink] = useState('')
  const [work, setWork] = useState<Work>({ name: 'idle' })
  const download = useRef<AbortController | null>(null)
  const linkId = useId()
  const busy = work.name === 'adding'

  const close = () => {
    download.current?.abort()
    download.current = null
    setWork({ name: 'idle' })
    onClose()
  }

  const add = async (event: FormEvent) => {
    event.preventDefault()
    const controller = new AbortController()
    download.current = controller
    setWork({ name: 'adding', done: 0, total: 0 })
    try {
      await addFontFromUrl(link, {
        onProgress: (done, total) => {
          if (!controller.signal.aborted) setWork({ name: 'adding', done, total })
        },
        // Closing the dialog stops the downloads, as a failed file stops the others.
        fetch: (input, init) =>
          fetch(input, {
            ...init,
            signal: init?.signal
              ? AbortSignal.any([init.signal, controller.signal])
              : controller.signal,
          }),
      })
      if (controller.signal.aborted) return
      setLink('')
      close()
    } catch (error) {
      if (!controller.signal.aborted) setWork({ name: 'failed', message: failureMessage(error) })
    }
  }

  return (
    <Modal
      open={open}
      title="Add a font from a link"
      onClose={close}
      onOpened={(dialog) => dialog.querySelector<HTMLInputElement>('input')?.focus()}
    >
      <form onSubmit={add} className="flex flex-col gap-6">
        <div>
          <div className="mb-2 flex items-center gap-1">
            <label htmlFor={linkId} className="text-sm text-fg-secondary">
              Link
            </label>
            <InfoTip label="About font links">
              A font file, or a stylesheet such as a Google Fonts embed link. The site has to allow
              downloads from other sites; Google Fonts, jsDelivr and cdnjs do.
            </InfoTip>
          </div>
          <input
            id={linkId}
            type="url"
            inputMode="url"
            required
            className="input w-full bg-surface-sunken"
            placeholder="https://fonts.googleapis.com/css2?family=…"
            value={link}
            disabled={busy}
            onChange={(event) => setLink(event.target.value)}
          />
          <div role="status" aria-live="polite" className="mt-3 text-sm empty:hidden">
            {work.name === 'adding' && (
              <p className="flex items-center gap-2 text-fg-secondary">
                <span className="loading loading-spinner loading-xs" aria-hidden />
                {work.total > 0
                  ? `Downloading ${count.format(work.done)} of ${count.format(work.total)} files…`
                  : 'Downloading…'}
              </p>
            )}
            {work.name === 'failed' && <p className="text-danger-fg">{work.message}</p>}
          </div>
        </div>
        <div className="flex justify-end gap-3">
          <button type="button" className="btn btn-ghost" onClick={close}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy || link.trim() === ''}>
            Add
          </button>
        </div>
      </form>
    </Modal>
  )
}

/** The fonts the reader has added, and a way to add more. */
export function FontManager() {
  const fonts = useLiveQuery(() => db.fonts.orderBy('family').toArray(), [])
  const [work, setWork] = useState<Work>({ name: 'idle' })
  const [linking, setLinking] = useState(false)
  const [removing, setRemoving] = useState<Font | null>(null)
  const picker = useRef<HTMLInputElement>(null)

  const addFiles = async (files: File[]) => {
    if (files.length === 0) return
    setWork({ name: 'adding', done: 0, total: 0 })
    try {
      await addFontFiles(files)
      setWork({ name: 'idle' })
    } catch (error) {
      setWork({ name: 'failed', message: failureMessage(error) })
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <section aria-label="Your fonts">
        {fonts && fonts.length === 0 && <p className="text-sm text-fg-secondary">No fonts yet</p>}
        {fonts && fonts.length > 0 && (
          <ul className="divide-y divide-border rounded-lg ring-1 ring-border">
            {fonts.map((font) => (
              <li key={font.id} className="flex items-center gap-2 py-2 ps-4 pe-1">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-fg">{font.family}</p>
                  <p className="truncate text-xs text-fg-muted" title={font.source}>
                    {origin(font)}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost btn-square btn-sm"
                  aria-label={`Remove ${font.family}`}
                  data-tooltip="Remove"
                  onClick={() => setRemoving(font)}
                >
                  <Trash2 aria-hidden className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div>
        <Menu
          buttonClassName="btn"
          align="start"
          items={[
            {
              label: 'From your device…',
              icon: FolderOpen,
              onSelect: () => picker.current?.click(),
            },
            { label: 'From a link…', icon: LinkIcon, onSelect: () => setLinking(true) },
          ]}
        >
          Add font
          <ChevronDown aria-hidden className="size-4" />
        </Menu>
        {/* Several files picked together, such as a family's regular, bold and italic, make
            one font. */}
        <input
          ref={picker}
          type="file"
          accept={pickerAccept(fontExtensions)}
          multiple
          hidden
          onChange={(event) => {
            const files = Array.from(event.target.files ?? [])
            event.target.value = ''
            addFiles(files)
          }}
        />
      </div>

      <div role="status" aria-live="polite" className="text-sm empty:hidden">
        {work.name === 'adding' && (
          <p className="flex items-center gap-2 text-fg-secondary">
            <span className="loading loading-spinner loading-xs" aria-hidden />
            Adding…
          </p>
        )}
        {work.name === 'failed' && <p className="text-danger-fg">{work.message}</p>}
      </div>

      <LinkDialog open={linking} onClose={() => setLinking(false)} />
      <ConfirmDialog
        open={removing !== null}
        title={`Remove ${removing?.family ?? 'font'}?`}
        confirmLabel="Remove font"
        failureMessage="The font couldn’t be removed. Try again."
        onConfirm={async () => {
          if (removing) await removeFont(removing.id)
          setRemoving(null)
        }}
        onCancel={() => setRemoving(null)}
      >
        Books set in it go back to their own fonts.
      </ConfirmDialog>
    </div>
  )
}
