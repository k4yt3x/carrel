/*
 * Writes a file in the origin private file system for scratchFile.ts. Safari before 26 writes
 * there only through a sync access handle, and only in a worker; every other browser can too.
 */

export type ScratchRequest =
  | { type: 'open'; directory: string; name: string }
  | { type: 'write'; chunk: Uint8Array }
  | { type: 'close' }

export type ScratchReply = { ok: true } | { ok: false; name: string; message: string }

/** The parts of the handle used here. Some browsers' first versions return promises. */
interface SyncAccessHandle {
  write(buffer: Uint8Array, options: { at: number }): number | Promise<number>
  truncate(size: number): void | Promise<void>
  flush(): void | Promise<void>
  close(): void | Promise<void>
}

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<ScratchRequest>) => void) | null
  postMessage(reply: ScratchReply): void
}

let handle: SyncAccessHandle | null = null
let position = 0

async function handleRequest(request: ScratchRequest) {
  if (request.type === 'open') {
    const root = await navigator.storage.getDirectory()
    const directory = await root.getDirectoryHandle(request.directory, { create: true })
    const file = await directory.getFileHandle(request.name, { create: true })
    handle = await (
      file as unknown as { createSyncAccessHandle(): Promise<SyncAccessHandle> }
    ).createSyncAccessHandle()
    await handle.truncate(0)
    position = 0
    return
  }
  if (!handle) throw new Error('no file is open')
  if (request.type === 'write') {
    position += await handle.write(request.chunk, { at: position })
    return
  }
  await handle.flush()
  await handle.close()
  handle = null
}

// The page sends one request at a time and waits for the reply.
scope.onmessage = (event) => {
  handleRequest(event.data).then(
    () => scope.postMessage({ ok: true }),
    (error: unknown) => {
      // A DOMException (QuotaExceededError, say) doesn't survive the trip; its name does.
      const { name, message } = (error ?? {}) as { name?: unknown; message?: unknown }
      scope.postMessage({
        ok: false,
        name: typeof name === 'string' ? name : 'Error',
        message: typeof message === 'string' ? message : String(error),
      })
    },
  )
}
