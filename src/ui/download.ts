/** Hands a file to the browser to save, as a download. */
export function downloadFile(file: Blob, name: string): void {
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  // The download has taken its own reference by the time the click returns in every current
  // browser; the delay covers ones that start it a moment later.
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

interface SaveFilePickerOptions {
  suggestedName?: string
  types?: { description: string; accept: Record<string, string[]> }[]
}

type ShowSaveFilePicker = (options: SaveFilePickerOptions) => Promise<{
  createWritable(): Promise<WritableStream<Uint8Array>>
}>

/**
 * A stream into a file the reader picks, where the browser can do that (the File System Access
 * API, in Chromium-based browsers): a large backup then goes straight to disk instead of being
 * held in memory. Resolves to null where the browser can't, and to 'cancelled' when the
 * reader dismisses the picker.
 */
export async function pickSaveTarget(
  name: string,
  description: string,
  type: string,
  extension: string,
): Promise<WritableStream<Uint8Array> | null | 'cancelled'> {
  const picker = (window as { showSaveFilePicker?: ShowSaveFilePicker }).showSaveFilePicker
  if (!picker) return null
  try {
    const handle = await picker({
      suggestedName: name,
      types: [{ description, accept: { [type]: [extension] } }],
    })
    return await handle.createWritable()
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled'
    throw error
  }
}
