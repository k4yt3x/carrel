/**
 * Books for the end-to-end tests, built in memory so the repository carries no binary
 * fixtures and every byte of them is visible here.
 */

import { deflateSync } from 'node:zlib'
import { strToU8, zipSync } from 'fflate'

export interface FixtureFile {
  name: string
  mimeType: string
  buffer: Buffer
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

const crc32 = (bytes: Uint8Array) => {
  let c = 0xffffffff
  for (const byte of bytes) c = (crcTable[(c ^ byte) & 0xff] ?? 0) ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** A solid-colour PNG, enough to be a cover. */
function png(width: number, height: number, [r, g, b]: [number, number, number]): Uint8Array {
  const chunk = (type: string, data: Uint8Array) => {
    const out = Buffer.alloc(12 + data.length)
    out.writeUInt32BE(data.length, 0)
    out.write(type, 4, 'latin1')
    out.set(data, 8)
    out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length)
    return out
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header.set([8, 2, 0, 0, 0], 8)
  const row = Buffer.alloc(1 + width * 3)
  for (let x = 0; x < width; x++) row.set([r, g, b], 1 + x * 3)
  const pixels = Buffer.concat(Array.from({ length: height }, () => row))
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(pixels)),
    chunk('IEND', new Uint8Array()),
  ])
}

const paragraph = (chapter: number, n: number) =>
  `<p>Chapter ${chapter}, paragraph ${n}. The reading room was quiet except for the turning of pages, and the lamp at each carrel threw a small circle of light onto the desk below it, where the books lay open.</p>`

/** A note reference at the top of the chapter, and the note itself at its end. */
const footnoteRef = `<p>Carrels were first built into cloister walls.<a epub:type="noteref" href="#note-1">1</a></p>`
const footnote = `<aside epub:type="footnote" id="note-1"><p>The note says that monks read in them.</p></aside>`

const chapterXhtml = (
  chapter: number,
  title: string,
  extra = '',
  withFootnote = false,
  withStylesheet = false,
  markup = '',
) => `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>${title}</title>${withStylesheet ? '<link rel="stylesheet" type="text/css" href="style.css"/>' : ''}</head>
<body${extra ? ' onload="window.top.__bookScriptRan = true"' : ''}>
<h1 id="c${chapter}">${title}</h1>
${extra}
${markup}
${withFootnote ? footnoteRef : ''}
${Array.from({ length: 40 }, (_, i) => paragraph(chapter, i + 1)).join('\n')}
${withFootnote ? footnote : ''}
</body>
</html>`

interface EpubOptions {
  title: string
  author: string
  /** Colour of a plain cover image; without one, the book has no cover. */
  cover?: [number, number, number]
  /** Scripts inserted into the first chapter, which also gets an onload handler and a script file. */
  extra?: string
  /** Markup inserted into the first chapter, as it is. */
  markup?: string
  /** Gives the first chapter a footnote. */
  footnote?: boolean
  /** A stylesheet every chapter links to. */
  css?: string
  /** More of the package's metadata, as OPF elements. */
  metadata?: string
  /** Puts the second and third chapters in a part of their own in the contents. */
  nested?: boolean
}

export function epub({
  title,
  author,
  cover,
  extra = '',
  markup = '',
  footnote = false,
  css,
  metadata = '',
  nested = false,
}: EpubOptions): Buffer {
  const chapters = ['Chapter One', 'Chapter Two', 'Chapter Three']
  const manifest = chapters
    .map(
      (_, i) => `<item id="c${i + 1}" href="c${i + 1}.xhtml" media-type="application/xhtml+xml"/>`,
    )
    .join('\n')
  const spine = chapters.map((_, i) => `<itemref idref="c${i + 1}"/>`).join('\n')
  const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="id">urn:uuid:${title.replace(/\W/g, '-')}</dc:identifier>
<dc:title>${title}</dc:title>
<dc:creator>${author}</dc:creator>
<dc:language>en</dc:language>
${metadata}
<meta property="dcterms:modified">2026-01-01T00:00:00Z</meta>
</metadata>
<manifest>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
${cover ? '<item id="cover" href="cover.png" media-type="image/png" properties="cover-image"/>' : ''}
${extra ? '<item id="js" href="evil.js" media-type="application/javascript"/>' : ''}
${css ? '<item id="css" href="style.css" media-type="text/css"/>' : ''}
${manifest}
</manifest>
<spine>${spine}</spine>
</package>`
  const nav = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Contents</title></head>
<body><nav epub:type="toc"><ol>
${
  nested
    ? `<li><a href="c1.xhtml">${chapters[0]}</a></li>
<li><a href="c2.xhtml">Part Two</a><ol>
<li><a href="c2.xhtml#c2">${chapters[1]}</a></li>
<li><a href="c3.xhtml">${chapters[2]}</a></li>
</ol></li>`
    : chapters.map((name, i) => `<li><a href="c${i + 1}.xhtml">${name}</a></li>`).join('\n')
}
</ol></nav></body></html>`
  const files: Record<string, Uint8Array | [Uint8Array, { level: 0 }]> = {
    mimetype: [strToU8('application/epub+zip'), { level: 0 }],
    'META-INF/container.xml': strToU8(`<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`),
    'OEBPS/content.opf': strToU8(opf),
    'OEBPS/nav.xhtml': strToU8(nav),
  }
  chapters.forEach((name, i) => {
    files[`OEBPS/c${i + 1}.xhtml`] = strToU8(
      chapterXhtml(
        i + 1,
        name,
        i === 0 ? extra : '',
        i === 0 && footnote,
        css !== undefined,
        i === 0 ? markup : '',
      ),
    )
  })
  if (cover) files['OEBPS/cover.png'] = png(60, 90, cover)
  if (css) files['OEBPS/style.css'] = strToU8(css)
  if (extra) files['OEBPS/evil.js'] = strToU8('window.top.__bookScriptRan = true')
  // A fixed date: zip entries carry their modification time, and a book built twice has to
  // come out byte for byte the same, since the library knows a book by its bytes' hash.
  return Buffer.from(zipSync(files, { mtime: new Date('2026-01-01T00:00:00Z') }))
}

/**
 * A three-page PDF: a heading in large type over lines of body text on each page, and, unless
 * `info` is false, a title and an author in its document information.
 */
export function pdf({ info: withInfo = true }: { info?: boolean } = {}): Buffer {
  const pages = [1, 2, 3]
  const objects: string[] = []
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>'
  objects[2] = `<< /Type /Pages /Kids [${pages.map((p) => `${2 + p * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  for (const p of pages) {
    const lines = Array.from({ length: 8 }, (_, n) => `(Body text, line ${n + 1}.) Tj 0 -16 Td`)
    const stream = `BT /F1 24 Tf 72 700 Td (Page ${p} of the portable document) Tj ET BT /F1 12 Tf 72 640 Td ${lines.join(' ')} ET`
    objects[2 + p * 2] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${3 + p * 2} 0 R >>`
    objects[3 + p * 2] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`
  }
  const info = objects.length
  if (withInfo) objects[info] = '<< /Title (A Portable Document) /Author (Grace Hopper) >>'
  let body = '%PDF-1.7\n'
  const offsets: number[] = []
  for (let n = 1; n < objects.length; n++) {
    offsets[n] = body.length
    body += `${n} 0 obj\n${objects[n]}\nendobj\n`
  }
  const xref = body.length
  body += `xref\n0 ${objects.length}\n0000000000 65535 f \n`
  for (let n = 1; n < objects.length; n++) {
    body += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`
  }
  body += `trailer\n<< /Size ${objects.length} /Root 1 0 R${withInfo ? ` /Info ${info} 0 R` : ''} >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(body, 'latin1')
}

export const fixtures = {
  epub: (): FixtureFile => ({
    name: 'the-test-book.epub',
    mimeType: 'application/epub+zip',
    buffer: epub({ title: 'The Test Book', author: 'Ada Lovelace', cover: [178, 74, 46] }),
  }),
  pdf: (): FixtureFile => ({ name: 'portable.pdf', mimeType: 'application/pdf', buffer: pdf() }),
  /** A PDF with no document information, named by its checksum as some download sites do. */
  anonymousPdf: (): FixtureFile => ({
    name: 'd41d8cd98f00b204e9800998ecf8427e.pdf',
    mimeType: 'application/pdf',
    buffer: pdf({ info: false }),
  }),
  scripted: (): FixtureFile => ({
    name: 'scripted.epub',
    mimeType: 'application/epub+zip',
    buffer: epub({
      title: 'A Book With Scripts',
      author: 'Mallory',
      extra:
        '<script>window.top.__bookScriptRan = true</script><script src="evil.js"></script><img src="missing.png" onerror="window.top.__bookScriptRan = true"/><a id="js-link" href="javascript:window.top.__bookScriptRan = true">link</a>',
    }),
  }),
  /** A book whose pages and stylesheet ask for things from a server. */
  remote: (): FixtureFile => ({
    name: 'remote.epub',
    mimeType: 'application/epub+zip',
    buffer: epub({
      title: 'A Book That Reaches Out',
      author: 'Eve',
      markup:
        '<img src="https://remote.test/pixel.png" alt=""/><video src="https://remote.test/clip.mp4"></video><object data="https://remote.test/page.html"></object>',
      css: '@import url(https://remote.test/more.css); @font-face { font-family: Far; src: url(https://remote.test/far.woff2); } h1 { font-family: Far; background: url(https://remote.test/bg.png); }',
    }),
  }),
  /** A book that says much about itself, with parts in its contents. */
  described: (): FixtureFile => ({
    name: 'described.epub',
    mimeType: 'application/epub+zip',
    buffer: epub({
      title: 'A Described Book',
      author: 'Mary Shelley',
      nested: true,
      metadata: `<dc:publisher>Lackington, Hughes</dc:publisher>
<dc:date>1818-01-01</dc:date>
<dc:description>&lt;p&gt;A scientist makes a creature.&lt;/p&gt;</dc:description>
<dc:subject>Gothic fiction</dc:subject>
<dc:subject>Science fiction</dc:subject>
<dc:identifier opf:scheme="ISBN" xmlns:opf="http://www.idpf.org/2007/opf">978-0-14-143947-1</dc:identifier>`,
    }),
  }),
  annotated: (): FixtureFile => ({
    name: 'annotated.epub',
    mimeType: 'application/epub+zip',
    buffer: epub({ title: 'An Annotated Book', author: 'Hugh Thomson', footnote: true }),
  }),
  /** A book that sets its text in points, as print-minded stylesheets do. */
  pointSized: (): FixtureFile => ({
    name: 'point-sized.epub',
    mimeType: 'application/epub+zip',
    buffer: epub({
      title: 'A Book Set in Points',
      author: 'Aldus Manutius',
      css: 'p { font-size: 12pt; } h1 { font-size: medium; }',
    }),
  }),
  /** A file that is neither a book nor a font. */
  notes: (): FixtureFile => ({
    name: 'notes.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from('Just some notes, not a book.'),
  }),
  /** A book in plain text, a paragraph to a line, in Latin-1 rather than UTF-8. */
  plainText: (): FixtureFile => ({
    name: 'A Plain Text Book.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from(
      ['A Plain Text Book', 'Chapter 1: The Room', 'Chapter 2: The Lamp', 'Chapter 3: The Desk']
        .flatMap((line, chapter) =>
          chapter === 0
            ? [line, '']
            : [
                line,
                ...Array.from(
                  { length: 30 },
                  (_, n) =>
                    `Paragraph ${n + 1} of chapter ${chapter}. The reading room was quiet except for the turning of pages, and the lamp at each carrel threw a small circle of light onto the desk below it, where the books lay open, à l'étude.`,
                ),
                '',
              ],
        )
        .join('\r\n'),
      'latin1',
    ),
  }),
}
