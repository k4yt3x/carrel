import { create } from 'zustand'
import { type ImportFailure, type ImportOutcome, importFiles } from '@/domain/library'

export type ImportNotice =
  | { kind: 'progress'; done: number; total: number }
  | { kind: 'result'; outcome: ImportOutcome }

interface ImportState {
  notice: ImportNotice | null
  /**
   * Imports the files after any import already running, so two never write at once. Files
   * that couldn't even be read are reported with the rest.
   */
  add(files: readonly File[], unread?: readonly ImportFailure[]): void
  dismiss(): void
}

let queue = Promise.resolve()

/**
 * How long a result with nothing wrong stays up. It is counted from the result, wherever the
 * reader is meanwhile (reading the book just added, say), so it isn't waiting on their return.
 * Failures stay until dismissed.
 */
export const resultShownMs = 6000

export const useImports = create<ImportState>()((set, get) => ({
  notice: null,
  add(files, unread = []) {
    if (files.length === 0 && unread.length === 0) return
    const total = files.length
    queue = queue
      .then(async () => {
        set({ notice: { kind: 'progress', done: 0, total } })
        const outcome = await importFiles(files, {
          onProgress: (done) => set({ notice: { kind: 'progress', done, total } }),
        })
        outcome.failed.push(...unread)
        const notice: ImportNotice = { kind: 'result', outcome }
        set({ notice })
        if (outcome.failed.length === 0) {
          setTimeout(() => {
            if (get().notice === notice) set({ notice: null })
          }, resultShownMs)
        }
      })
      .catch((error: unknown) => {
        // importFiles reports per-file failures itself; this is a failure of the whole run.
        console.error('import failed', error)
        const failed = [
          ...files.map((file) => ({
            fileName: file.name,
            reason: 'It couldn’t be added to the library.',
          })),
          ...unread,
        ]
        set({ notice: { kind: 'result', outcome: { added: [], duplicates: [], failed } } })
      })
  },
  dismiss() {
    set({ notice: null })
  },
}))
