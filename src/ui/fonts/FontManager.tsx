/*
 * Design brief (refactoring-ui Workflow B), fonts.
 *
 * Feature: read books in a typeface of your own, such as a CJK family the system lacks.
 * Content, by rank:
 *   primary    the fonts already added, by name
 *   secondary  the two ways to add one: files from the device, or a link
 *   tertiary   where each font came from; what kinds of link work
 * Actions: "Add files…" and "Add" for a link are secondary buttons, since the manager sits
 *   inside settings that have no single primary action; Remove is a quiet icon per row,
 *   confirmed, since it can't be undone.
 * Tokens: names 14px fg; sources 12px fg-muted truncated; errors 14px danger-fg.
 */

import { useLiveQuery } from 'dexie-react-hooks'
import { Trash2 } from 'lucide-react'
import { type FormEvent, useId, useRef, useState } from 'react'
import { db, type Font } from '@/domain/db'
import { addFontFiles, addFontFromUrl, FontImportError, removeFont } from '@/domain/fonts'
import { ConfirmDialog } from '@/ui/ConfirmDialog'

const fontExtensions = '.ttf,.otf,.woff,.woff2'

type Work =
  | { name: 'idle' }
  | { name: 'adding'; done: number; total: number }
  | { name: 'failed'; message: string }

const count = new Intl.NumberFormat()

/** What went wrong, for the reader; a FontImportError already says it in their terms. */
function failureMessage(error: unknown): string {
  if (error instanceof FontImportError) return error.message
  console.error('could not add the font', error)
  return 'The font couldn’t be added because of an unexpected error. Try again.'
}

/** The fonts the reader has added, and the ways to add more. */
export function FontManager() {
  const fonts = useLiveQuery(() => db.fonts.orderBy('family').toArray(), [])
  const [work, setWork] = useState<Work>({ name: 'idle' })
  const [link, setLink] = useState('')
  const [removing, setRemoving] = useState<Font | null>(null)
  const picker = useRef<HTMLInputElement>(null)
  const linkId = useId()
  const busy = work.name === 'adding'

  const attempt = async (task: () => Promise<unknown>) => {
    setWork({ name: 'adding', done: 0, total: 0 })
    try {
      await task()
      setWork({ name: 'idle' })
      return true
    } catch (error) {
      setWork({ name: 'failed', message: failureMessage(error) })
      return false
    }
  }

  const addFiles = async (files: File[]) => {
    if (files.length > 0) await attempt(() => addFontFiles(files))
  }

  const addLink = async (event: FormEvent) => {
    event.preventDefault()
    const added = await attempt(() =>
      addFontFromUrl(link, {
        onProgress: (done, total) => setWork({ name: 'adding', done, total }),
      }),
    )
    if (added) setLink('')
  }

  return (
    <div className="space-y-6">
      <section aria-label="Your fonts">
        {fonts && fonts.length === 0 && (
          <p className="text-sm leading-normal text-fg-secondary">
            No fonts yet. Fonts you add here can be chosen in any book’s reading settings.
          </p>
        )}
        {fonts && fonts.length > 0 && (
          <ul className="divide-y divide-border rounded-lg ring-1 ring-border">
            {fonts.map((font) => (
              <li key={font.id} className="flex items-center gap-2 py-2 ps-4 pe-1">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-fg">{font.family}</p>
                  <p className="truncate text-xs text-fg-muted" title={font.source}>
                    {font.files.length === 1
                      ? font.source
                      : `${count.format(font.files.length)} files · ${font.source}`}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost btn-square btn-sm"
                  aria-label={`Remove ${font.family}`}
                  onClick={() => setRemoving(font)}
                >
                  <Trash2 aria-hidden className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-6">
        <div>
          <input
            ref={picker}
            type="file"
            accept={fontExtensions}
            multiple
            hidden
            onChange={(event) => {
              const files = Array.from(event.target.files ?? [])
              event.target.value = ''
              addFiles(files)
            }}
          />
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => picker.current?.click()}
          >
            Add files…
          </button>
          <p className="mt-2 text-xs leading-normal text-fg-muted">
            TTF, OTF, WOFF or WOFF2. Pick a family’s regular, bold and italic files together to add
            them as one font.
          </p>
        </div>

        <form onSubmit={addLink}>
          <label htmlFor={linkId} className="mb-2 block text-sm text-fg-secondary">
            Or add from a link
          </label>
          <div className="flex gap-2">
            <input
              id={linkId}
              type="url"
              inputMode="url"
              required
              className="input min-w-0 flex-1 bg-surface-sunken"
              placeholder="https://fonts.googleapis.com/css2?family=…"
              value={link}
              disabled={busy}
              onChange={(event) => setLink(event.target.value)}
            />
            <button type="submit" className="btn" disabled={busy || link.trim() === ''}>
              Add
            </button>
          </div>
          <p className="mt-2 text-xs leading-normal text-fg-muted">
            A font file, or a stylesheet such as a Google Fonts embed link. The site has to allow
            downloads from other sites; Google Fonts, jsDelivr and cdnjs do.
          </p>
        </form>

        <div role="status" aria-live="polite" className="-mt-3 text-sm empty:hidden">
          {work.name === 'adding' && (
            <p className="flex items-center gap-2 text-fg-secondary">
              <span className="loading loading-spinner loading-xs" aria-hidden />
              {work.total > 0
                ? `Downloading ${count.format(work.done)} of ${count.format(work.total)} files…`
                : 'Adding…'}
            </p>
          )}
          {work.name === 'failed' && <p className="text-danger-fg">{work.message}</p>}
        </div>
      </section>

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
        Books set in it go back to their own fonts. To use it again, you’ll have to add it again.
      </ConfirmDialog>
    </div>
  )
}
