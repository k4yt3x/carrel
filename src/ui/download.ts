import { isHomeScreenApp } from '@/ui/platform'

/**
 * What became of a file handed over to be saved: 'shared' once the share sheet is done with
 * it; 'downloading' when a download has started, which may go on reading the file; 'retry'
 * when the share sheet would not open because the tap that asked for it was too long ago, and
 * the reader has to tap again.
 */
export type SaveResult = 'shared' | 'downloading' | 'cancelled' | 'retry'

/**
 * Hands a file to the reader to keep. In a browser that is a download. In an app opened from
 * the Home Screen of an iPhone or iPad, a download opens a preview that there is no way back
 * from (WebKit bug 236943), so the file goes to the share sheet instead, which has Save to
 * Files. The share sheet opens only within a few seconds of a tap.
 */
export async function saveFile(file: Blob, name: string): Promise<SaveResult> {
  const shared = new File([file], name, { type: file.type })
  if (isHomeScreenApp() && navigator.canShare?.({ files: [shared] })) {
    try {
      await navigator.share({ files: [shared] })
      return 'shared'
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled'
      if (error instanceof DOMException && error.name === 'NotAllowedError') return 'retry'
      throw error
    }
  }
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  // The download has taken its own reference by the time the click returns in every current
  // browser; the delay covers ones that start it a moment later.
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
  return 'downloading'
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
