/**
 * The kinds of book Carrel reads, as files are named and typed: the import picker offers
 * these, the installed app opens them, the empty library names them, and each book is
 * labelled with one. Opening a book goes by the file's content where its format has a
 * signature; a text file has none, so it is known by its name alone.
 */
export const bookFormats = [
  { name: 'EPUB', mimeType: 'application/epub+zip', extensions: ['.epub'] },
  { name: 'MOBI', mimeType: 'application/x-mobipocket-ebook', extensions: ['.mobi', '.azw'] },
  { name: 'AZW3', mimeType: 'application/x-mobipocket-ebook', extensions: ['.azw3', '.kf8'] },
  { name: 'FB2', mimeType: 'application/x-fictionbook+xml', extensions: ['.fb2'] },
  { name: 'FB2', mimeType: 'application/x-zip-compressed-fb2', extensions: ['.fbz'] },
  { name: 'CBZ', mimeType: 'application/vnd.comicbook+zip', extensions: ['.cbz'] },
  { name: 'PDF', mimeType: 'application/pdf', extensions: ['.pdf'] },
  { name: 'TXT', mimeType: 'text/plain', extensions: ['.txt'] },
] as const

export type BookFormat = (typeof bookFormats)[number]['name']

/** The formats by name, each once. */
export const bookFormatNames = [...new Set(bookFormats.map((format) => format.name))]

/** File extensions the import picker offers. */
export const bookExtensions = bookFormats.flatMap((format) => format.extensions)

/** The extensions of each media type, as a web app manifest's file handler accepts them. */
export const bookFileTypes: Record<string, string[]> = {}
for (const { mimeType, extensions } of bookFormats) {
  bookFileTypes[mimeType] = [...(bookFileTypes[mimeType] ?? []), ...extensions]
}

/**
 * The format a file is named as: by its extension, else by its media type; null for a file
 * named as neither, such as one without an extension that Carrel still reads by its content.
 */
export function formatOf({ name, type }: { name: string; type: string }): BookFormat | null {
  const lowered = name.toLowerCase()
  const named = bookFormats.find((format) =>
    format.extensions.some((extension) => lowered.endsWith(extension)),
  )
  return (named ?? bookFormats.find((format) => format.mimeType === type))?.name ?? null
}
