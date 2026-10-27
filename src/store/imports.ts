import { create } from 'zustand'
import { type ImportOutcome, importFiles } from '@/domain/library'

export type ImportNotice =
  | { kind: 'progress'; done: number; total: number }
  | { kind: 'result'; outcome: ImportOutcome }

interface ImportState {
  notice: ImportNotice | null
  /** Imports the files after any import already running, so two never write at once. */
  add(files: readonly File[]): void
  dismiss(): void
}

let queue = Promise.resolve()

export const useImports = create<ImportState>()((set) => ({
  notice: null,
  add(files) {
    if (files.length === 0) return
    const total = files.length
    queue = queue
      .then(async () => {
        set({ notice: { kind: 'progress', done: 0, total } })
        const outcome = await importFiles(files, {
          onProgress: (done) => set({ notice: { kind: 'progress', done, total } }),
        })
        set({ notice: { kind: 'result', outcome } })
      })
      .catch((error: unknown) => {
        // importFiles reports per-file failures itself; this is a failure of the whole run.
        console.error('import failed', error)
        const failed = files.map((file) => ({
          fileName: file.name,
          reason: 'It couldn’t be added to the library.',
        }))
        set({ notice: { kind: 'result', outcome: { added: [], duplicates: [], failed } } })
      })
  },
  dismiss() {
    set({ notice: null })
  },
}))
