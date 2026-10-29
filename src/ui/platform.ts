/**
 * iPhone and iPad, where every browser is Safari's WebKit underneath. iPadOS presents itself
 * as a Mac, so a Mac with a touch screen counts too: no Mac has one.
 */
export function isAppleTouchDevice(): boolean {
  const agent = navigator.userAgent
  return /iPhone|iPad|iPod/.test(agent) || (/Macintosh/.test(agent) && navigator.maxTouchPoints > 1)
}

/** Opened from the Home Screen of an iPhone or iPad as an app of its own, not in a tab. */
export function isHomeScreenApp(): boolean {
  return (
    isAppleTouchDevice() &&
    ((navigator as { standalone?: boolean }).standalone === true ||
      matchMedia('(display-mode: standalone)').matches)
  )
}

/**
 * A file picker's accept attribute for these extensions. On iPhone and iPad, once one listed
 * type is one the system knows, every file whose extension it has no type for (.mobi, .azw3,
 * .fb2, .cbz) is greyed out. There the picker takes any file as well, and what is picked
 * is told apart by its content, as everywhere.
 */
export function pickerAccept(extensions: readonly string[]): string {
  const types = isAppleTouchDevice() ? [...extensions, 'application/octet-stream'] : extensions
  return types.join(',')
}
