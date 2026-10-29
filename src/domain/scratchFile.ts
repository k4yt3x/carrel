import type { ScratchReply, ScratchRequest } from '@/domain/scratchFile.worker'

/*
 * Files the app writes for itself in the origin private file system, out of the reader's
 * sight. Such a file is read back as a File the browser reads from disk, not memory. Where
 * the reader can't choose a file for a backup to be written to (every browser but desktop
 * Chromium), the backup is made in one of these, then downloaded or shared, so a library
 * larger than the memory a page may use can still be backed up.
 */

const directory = 'backups'

// A download goes on reading the file after the page has handed it over, and nothing says
// when it has finished; a file is kept this long, then removed the next time the library is
// opened or a backup is made.
const keepMs = 60 * 60 * 1000

export interface ScratchFile {
  /** Takes the file's contents. Closing it finishes the file; aborting it removes it. */
  stream: WritableStream<Uint8Array>
  /** The finished file. */
  file(): Promise<File>
  remove(): Promise<void>
}

const isNotFound = (error: unknown) =>
  error instanceof DOMException && error.name === 'NotFoundError'

const folder = async () => (await navigator.storage.getDirectory()).getDirectoryHandle(directory)

async function removeEntry(name: string) {
  try {
    await (await folder()).removeEntry(name)
  } catch (error) {
    if (!isNotFound(error)) throw error
  }
}

/**
 * Starts a file named after `name`, or resolves to null where the browser has no private file
 * system for the page (before Safari 15.2, in Firefox's private windows, without workers).
 */
export async function createScratchFile(name: string): Promise<ScratchFile | null> {
  if (typeof navigator.storage?.getDirectory !== 'function' || typeof Worker !== 'function') {
    return null
  }
  // The time it was made leads the name, for removeOldScratchFiles.
  const fileName = `${Date.now()}-${name}`
  await removeOldScratchFiles().catch((error: unknown) => {
    console.warn('could not clear old backup files', error)
  })
  let worker: Worker
  try {
    worker = new Worker(new URL('./scratchFile.worker.ts', import.meta.url), { type: 'module' })
  } catch (error) {
    console.warn('could not start the file worker', error)
    return null
  }
  let queue = Promise.resolve()
  const ask = (request: ScratchRequest) => {
    const reply = queue.then(
      () =>
        new Promise<void>((resolve, reject) => {
          worker.onmessage = ({ data }: MessageEvent<ScratchReply>) => {
            if (data.ok) resolve()
            else reject(new DOMException(data.message, data.name))
          }
          worker.onerror = (event) => {
            event.preventDefault()
            reject(new Error(`the file worker failed: ${event.message}`))
          }
          worker.postMessage(request)
        }),
    )
    queue = reply.catch(() => {})
    return reply
  }
  let finished = false
  // Closes the file, which lets go of it for reading or removing.
  const finish = async () => {
    if (finished) return
    finished = true
    try {
      await ask({ type: 'close' })
    } finally {
      worker.terminate()
    }
  }
  const remove = async () => {
    await finish().catch(() => {})
    await removeEntry(fileName)
  }

  try {
    await ask({ type: 'open', directory, name: fileName })
  } catch (error) {
    console.warn('could not start a file in the private file system', error)
    await remove().catch(() => {})
    return null
  }

  return {
    stream: new WritableStream<Uint8Array>({
      write: (chunk) => ask({ type: 'write', chunk }),
      close: finish,
      abort: remove,
    }),
    file: async () => (await (await folder()).getFileHandle(fileName)).getFile(),
    remove,
  }
}

/** Removes the files kept past their time (see keepMs). */
export async function removeOldScratchFiles(): Promise<void> {
  if (typeof navigator.storage?.getDirectory !== 'function') return
  let files: FileSystemDirectoryHandle
  try {
    files = await folder()
  } catch (error) {
    // No backup has been made here this way, or there is no private file system to look in.
    if (isNotFound(error) || (error instanceof DOMException && error.name === 'SecurityError')) {
      return
    }
    throw error
  }
  const now = Date.now()
  const old: string[] = []
  for await (const name of files.keys()) {
    const made = Number.parseInt(name, 10)
    if (!(made > now - keepMs)) old.push(name)
  }
  for (const name of old) {
    // One still open (a backup being written in another tab) is left for next time.
    await removeEntry(name).catch((error: unknown) => {
      console.warn('could not remove an old backup file', error)
    })
  }
}
