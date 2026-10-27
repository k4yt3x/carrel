import { useEffect } from 'react'
import type { ImportFailure } from '@/domain/library'
import { libraryHref } from '@/domain/routes'
import { useImports } from '@/store/imports'

interface LaunchParams {
  files: readonly FileSystemFileHandle[]
}

interface LaunchQueue {
  setConsumer(consumer: (params: LaunchParams) => void): void
}

/**
 * Adds the files the installed app was opened with (by "Open with Carrel" on a book file) to
 * the library, and shows the library, where the import reports how it went. The web app
 * manifest's file_handlers declare which files those are; the Launch Handler API, where the
 * browser has it, delivers them.
 */
export function useLaunchFiles(): void {
  const add = useImports((state) => state.add)
  useEffect(() => {
    const queue = (window as { launchQueue?: LaunchQueue }).launchQueue
    if (!queue) return
    queue.setConsumer(({ files }) => {
      if (files.length === 0) return
      window.location.hash = libraryHref
      void Promise.allSettled(files.map((handle) => handle.getFile())).then((results) => {
        const read: File[] = []
        const unread: ImportFailure[] = []
        results.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            read.push(result.value)
          } else {
            console.error('could not read a file opened with Carrel', result.reason)
            unread.push({ fileName: files[index]?.name ?? '', reason: 'It couldn’t be read.' })
          }
        })
        add(read, unread)
      })
    })
  }, [add])
}
