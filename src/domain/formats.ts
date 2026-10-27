/**
 * The kinds of book Carrel reads, as files are named and typed: the import picker offers
 * these, the installed app opens them, and the empty library names them. Telling one kind
 * from another goes by the file's content, not by these.
 */
export const bookFormats = [
  { name: 'EPUB', mimeType: 'application/epub+zip', extensions: ['.epub'] },
  { name: 'MOBI', mimeType: 'application/x-mobipocket-ebook', extensions: ['.mobi', '.azw'] },
  { name: 'AZW3', mimeType: 'application/x-mobipocket-ebook', extensions: ['.azw3', '.kf8'] },
  { name: 'FB2', mimeType: 'application/x-fictionbook+xml', extensions: ['.fb2'] },
  { name: 'FB2', mimeType: 'application/x-zip-compressed-fb2', extensions: ['.fbz'] },
  { name: 'CBZ', mimeType: 'application/vnd.comicbook+zip', extensions: ['.cbz'] },
  { name: 'PDF', mimeType: 'application/pdf', extensions: ['.pdf'] },
] as const

/** The formats by name, each once. */
export const bookFormatNames = [...new Set(bookFormats.map((format) => format.name))]

/** File extensions the import picker offers. */
export const bookExtensions = bookFormats.flatMap((format) => format.extensions)

/** The extensions of each media type, as a web app manifest's file handler accepts them. */
export const bookFileTypes: Record<string, string[]> = {}
for (const { mimeType, extensions } of bookFormats) {
  bookFileTypes[mimeType] = [...(bookFileTypes[mimeType] ?? []), ...extensions]
}
