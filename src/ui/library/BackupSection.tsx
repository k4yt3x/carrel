/*
 * Design brief (refactoring-ui Workflow B), backup and restore.
 *
 * Feature: keep the library safe from the browser clearing its storage, and move it to
 * another browser. Content, by rank:
 *   primary    why a backup matters (books live only here), and the export action
 *   secondary  whether book files go in, with their size; restoring
 *   tertiary   progress and outcome messages
 * Restoring is checked before it runs: the backup's contents are summarised and the reader
 * confirms, choosing whether its theme and reading settings replace theirs.
 */

import { useLiveQuery } from 'dexie-react-hooks'
import { useRef, useState } from 'react'
import type { BackupSummary, RestoreOutcome } from '@/domain/backup'
import { db } from '@/domain/db'
import { isQuotaError, requestPersistentStorage } from '@/domain/library'
import { currentPreferences, normalizePreferences, useAppSettings } from '@/store/appSettings'
import { Switch } from '@/ui/controls'
import { downloadFile, pickSaveTarget } from '@/ui/download'
import { formatBytes } from '@/ui/format'

type State =
  | { name: 'idle' }
  | { name: 'exporting'; done: number; total: number }
  | { name: 'exported' }
  | { name: 'checking' }
  | { name: 'confirming'; file: File; summary: BackupSummary }
  | { name: 'restoring'; done: number; total: number }
  | { name: 'restored'; outcome: RestoreOutcome }
  | { name: 'failed'; message: string }

const count = new Intl.NumberFormat()
const date = new Intl.DateTimeFormat(undefined, { dateStyle: 'long' })

const plural = (n: number, one: string, many: string) =>
  `${count.format(n)} ${n === 1 ? one : many}`

function backupName(): string {
  const day = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `carrel-backup-${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}.zip`
}

// The backup code and its zip library load when first used, not with the library page.
const loadBackup = () => import('@/domain/backup')

function failure(error: unknown, action: string): string {
  // By name: the BackupError class lives in the module loaded on demand.
  if (error instanceof Error && error.name === 'BackupError') return error.message
  console.error(`could not ${action}`, error)
  if (isQuotaError(error)) {
    return 'The browser has run out of storage space for Carrel. Free some space and try again.'
  }
  return `The backup couldn’t be ${action === 'export' ? 'made' : 'restored'} because of an unexpected error. Try again.`
}

function outcomeMessage(outcome: RestoreOutcome): string {
  const parts = [`Added ${plural(outcome.addedBooks, 'book', 'books')}`]
  if (outcome.addedFonts > 0) parts.push(plural(outcome.addedFonts, 'font', 'fonts'))
  let message = `${parts.join(' and ')}.`
  if (outcome.alreadyPresent > 0) {
    message += ` ${plural(outcome.alreadyPresent, 'book was', 'books were')} already in your library.`
  }
  if (outcome.restoredProgress > 0) {
    message += ` Restored your place in ${plural(outcome.restoredProgress, 'book', 'books')}.`
  }
  return message
}

export function BackupSection() {
  const [state, setState] = useState<State>({ name: 'idle' })
  const [includeBooks, setIncludeBooks] = useState(true)
  const [usePreferences, setUsePreferences] = useState(true)
  const picker = useRef<HTMLInputElement>(null)
  const setPreferences = useAppSettings((s) => s.setPreferences)
  // The books' files are listed only for their sizes; their bytes stay where they are.
  const booksSize = useLiveQuery(async () => {
    let total = 0
    await db.files.each((record) => {
      total += record.file.size
    })
    return total
  }, [])
  const busy = ['exporting', 'checking', 'restoring'].includes(state.name)

  const exportBackup = async () => {
    try {
      const name = backupName()
      const target = await pickSaveTarget(name, 'Carrel backup', 'application/zip', '.zip')
      if (target === 'cancelled') return
      setState({ name: 'exporting', done: 0, total: 0 })
      const { exportLibrary } = await loadBackup()
      const blob = await exportLibrary(target, {
        includeBooks,
        preferences: currentPreferences(),
        onProgress: (done, total) => setState({ name: 'exporting', done, total }),
      })
      if (blob) downloadFile(blob, name)
      setState({ name: 'exported' })
    } catch (error) {
      setState({ name: 'failed', message: failure(error, 'export') })
    }
  }

  const check = async (file: File) => {
    setState({ name: 'checking' })
    try {
      const { inspectBackup } = await loadBackup()
      setState({ name: 'confirming', file, summary: await inspectBackup(file) })
    } catch (error) {
      setState({ name: 'failed', message: failure(error, 'restore') })
    }
  }

  const restore = async (file: File) => {
    setState({ name: 'restoring', done: 0, total: 0 })
    try {
      const { restoreBackup } = await loadBackup()
      const outcome = await restoreBackup(file, {
        onProgress: (done, total) => setState({ name: 'restoring', done, total }),
      })
      if (usePreferences && outcome.preferences !== undefined) {
        setPreferences(normalizePreferences(outcome.preferences))
      }
      setState({ name: 'restored', outcome })
      // Restoring is the moment a library proves worth keeping; ask the browser to keep it.
      if (outcome.addedBooks > 0) void requestPersistentStorage()
    } catch (error) {
      setState({ name: 'failed', message: failure(error, 'restore') })
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm leading-normal text-fg-secondary">
        Your books are kept only in this browser, which may clear them to free space. A backup holds
        your books, your place in each and your settings in one file, to restore here or in another
        browser.
      </p>
      <Switch
        label="Include the book files"
        description={
          booksSize === undefined
            ? 'Without them, the backup holds only your places and settings.'
            : `${formatBytes(booksSize)}. Without them, the backup holds only your places and settings.`
        }
        checked={includeBooks}
        onChange={setIncludeBooks}
      />
      <div className="flex flex-wrap gap-3">
        <button type="button" className="btn" disabled={busy} onClick={exportBackup}>
          Back up library
        </button>
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={() => picker.current?.click()}
        >
          Restore a backup…
        </button>
        <input
          ref={picker}
          type="file"
          accept=".zip,application/zip"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file) check(file)
          }}
        />
      </div>

      {state.name === 'confirming' && (
        <div className="space-y-4 rounded-lg bg-surface-sunken p-4">
          <p className="text-sm leading-normal text-fg">
            This backup is from {date.format(state.summary.exportedAt)}. It holds{' '}
            {plural(state.summary.books, 'book', 'books')}
            {state.summary.booksWithFiles < state.summary.books &&
              ` (${count.format(state.summary.booksWithFiles)} with their files)`}
            {state.summary.fonts > 0 && ` and ${plural(state.summary.fonts, 'font', 'fonts')}`}.
            Books already in your library stay as they are.
          </p>
          <Switch
            label="Use its theme and reading settings"
            description="Replaces the ones you have now."
            checked={usePreferences}
            onChange={setUsePreferences}
          />
          <div className="flex gap-3">
            <button type="button" className="btn btn-primary" onClick={() => restore(state.file)}>
              Restore
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setState({ name: 'idle' })}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div role="status" aria-live="polite" className="text-sm leading-normal empty:hidden">
        {state.name === 'exporting' && (
          <p className="flex items-center gap-2 text-fg-secondary">
            <span className="loading loading-spinner loading-xs" aria-hidden />
            {state.total > 0
              ? `Backing up ${count.format(state.done)} of ${count.format(state.total)}…`
              : 'Backing up…'}
          </p>
        )}
        {state.name === 'exported' && <p className="text-fg-secondary">Backup saved.</p>}
        {state.name === 'checking' && <p className="text-fg-secondary">Reading the backup…</p>}
        {state.name === 'restoring' && (
          <p className="flex items-center gap-2 text-fg-secondary">
            <span className="loading loading-spinner loading-xs" aria-hidden />
            {state.total > 0
              ? `Restoring ${count.format(state.done)} of ${count.format(state.total)}…`
              : 'Restoring…'}
          </p>
        )}
        {state.name === 'restored' && (
          <>
            <p className="text-fg-secondary">{outcomeMessage(state.outcome)}</p>
            {state.outcome.damaged.length > 0 && (
              <p className="mt-2 text-danger-fg">
                {state.outcome.damaged.length === 1 ? 'One book was' : 'Some books were'} damaged in
                the backup and not added: {state.outcome.damaged.join(', ')}.
              </p>
            )}
          </>
        )}
        {state.name === 'failed' && <p className="text-danger-fg">{state.message}</p>}
      </div>
    </div>
  )
}
