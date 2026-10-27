import 'fake-indexeddb/auto'
import { BlobReader, BlobWriter, ZipReader, ZipWriter } from '@zip.js/zip.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BackupError, exportLibrary, inspectBackup, restoreBackup } from '@/domain/backup'
import { db, type Font, type Progress } from '@/domain/db'
import { defaultReadingSettings } from '@/domain/settings'
import { sha256 } from '@/domain/sha256'

type Json = Record<string, unknown>

/** Stores a book the way importFiles does, without the parser, which needs a browser. */
async function addBook(content: string, title: string, { cover = true } = {}): Promise<string> {
  const file = new File([content], `${title}.epub`, { type: 'application/epub+zip' })
  const id = await sha256(file)
  await db.books.add({
    id,
    title,
    authors: ['An Author'],
    language: 'en',
    addedAt: 1_000,
    openedAt: 2_000,
  })
  await db.files.add({ id, file })
  if (cover) {
    const image = new Blob([`cover of ${title}`], { type: 'image/webp' })
    await db.covers.add({ id, image, width: 300, height: 450 })
  }
  return id
}

const literata: Font = {
  id: 'font-1',
  family: 'Literata',
  source: 'Literata.woff2, Literata-Italic.woff2',
  addedAt: 3_000,
  files: [
    {
      data: new Blob(['regular'], { type: 'font/woff2' }),
      format: 'woff2',
      weight: '200 900',
      style: 'normal',
      unicodeRange: null,
    },
    {
      data: new Blob(['italic'], { type: 'font/woff2' }),
      format: 'woff2',
      weight: '200 900',
      style: 'italic',
      unicodeRange: 'U+0000-00FF, U+0131',
    },
  ],
}

const position = (id: string, location: string, updatedAt: number): Progress => ({
  id,
  location,
  fraction: 0.25,
  updatedAt,
})

async function backUp(includeBooks = true, preferences: unknown = null): Promise<Blob> {
  const backup = await exportLibrary(null, { includeBooks, preferences })
  if (!backup) throw new Error('exportLibrary returned no blob')
  return backup
}

async function clearLibrary(): Promise<void> {
  await db.delete()
  await db.open()
}

/** Everything in the library as plain data with the blobs read, so states compare by value. */
async function snapshot() {
  const read = async (blob: Blob) => ({ type: blob.type, text: await blob.text() })
  const files = await db.files.toArray()
  const covers = await db.covers.toArray()
  const fonts = await db.fonts.toArray()
  return {
    books: await db.books.toArray(),
    files: await Promise.all(
      files.map(async ({ id, file }) => ({ id, name: file.name, ...(await read(file)) })),
    ),
    covers: await Promise.all(
      covers.map(async ({ image, ...cover }) => ({ ...cover, image: await read(image) })),
    ),
    progress: await db.progress.toArray(),
    bookSettings: await db.bookSettings.toArray(),
    fonts: await Promise.all(
      fonts.map(async ({ files, ...font }) => ({
        ...font,
        files: await Promise.all(
          files.map(async ({ data, ...file }) => ({ ...file, data: await read(data) })),
        ),
      })),
    ),
  }
}

async function readZip(zip: Blob): Promise<Map<string, Blob>> {
  const files = new Map<string, Blob>()
  for (const entry of await new ZipReader(new BlobReader(zip)).getEntries()) {
    if (!entry.directory) files.set(entry.filename, await entry.getData<Blob>(new BlobWriter()))
  }
  return files
}

async function writeZip(files: Iterable<[string, Blob]>): Promise<Blob> {
  const output = new BlobWriter('application/zip')
  const zip = new ZipWriter(output)
  for (const [name, data] of files) await zip.add(name, new BlobReader(data))
  await zip.close()
  return output.getData()
}

/** The backup with some of its files replaced, written back as a well-formed zip. */
async function rewrite(backup: Blob, replacements: Record<string, Blob>): Promise<Blob> {
  const files = await readZip(backup)
  for (const [name, data] of Object.entries(replacements)) files.set(name, data)
  return writeZip(files)
}

async function editManifest(backup: Blob, edit: (manifest: Json) => Json): Promise<Blob> {
  const manifest = JSON.parse((await (await readZip(backup)).get('manifest.json')?.text()) ?? '')
  return rewrite(backup, { 'manifest.json': new Blob([JSON.stringify(edit(manifest))]) })
}

beforeEach(async () => {
  await db.open()
})

afterEach(async () => {
  await db.delete()
  vi.restoreAllMocks()
})

describe('exportLibrary and restoreBackup', () => {
  it('restore an emptied library to what it was, preferences included', async () => {
    const alpha = await addBook('alpha', 'Alpha')
    const beta = await addBook('beta', 'Beta', { cover: false })
    await db.progress.add(position(alpha, 'epubcfi(/6/4!/4/2)', 5_000))
    await db.bookSettings.add({
      id: beta,
      settings: { ...defaultReadingSettings, fontSize: 24, typeface: { fontId: literata.id } },
    })
    await db.fonts.add(literata)
    const before = await snapshot()
    const preferences = { theme: 'sepia', reading: { fontSize: 20 }, list: [1, 'two', null, {}] }

    const exported: number[][] = []
    const backup = await exportLibrary(null, {
      includeBooks: true,
      preferences,
      onProgress: (done, total) => exported.push([done, total]),
    })
    if (!backup) throw new Error('exportLibrary returned no blob')
    await clearLibrary()
    const restored: number[][] = []
    const outcome = await restoreBackup(backup, {
      onProgress: (done, total) => restored.push([done, total]),
    })

    expect(outcome).toEqual({
      addedBooks: 2,
      alreadyPresent: 0,
      damaged: [],
      restoredProgress: 1,
      addedFonts: 1,
      preferences,
    })
    expect(await snapshot()).toEqual(before)
    expect(exported.at(-1)).toEqual([3, 3])
    expect(restored.at(-1)).toEqual([3, 3])
  })

  it('leave book files out when asked, still restoring positions, settings and fonts', async () => {
    const alpha = await addBook('alpha', 'Alpha')
    await db.progress.add(position(alpha, 'epubcfi(/6/4!/4/2)', 5_000))
    await db.bookSettings.add({ id: alpha, settings: { ...defaultReadingSettings, fontSize: 24 } })
    await db.fonts.add(literata)
    const { progress, bookSettings, fonts } = await snapshot()

    const backup = await backUp(false)
    expect([...(await readZip(backup)).keys()].sort()).toEqual([
      'fonts/font-1/0',
      'fonts/font-1/1',
      'manifest.json',
    ])
    expect(await inspectBackup(backup)).toMatchObject({ books: 1, booksWithFiles: 0, fonts: 1 })

    await clearLibrary()
    const outcome = await restoreBackup(backup)
    expect(outcome).toMatchObject({ addedBooks: 0, restoredProgress: 1, addedFonts: 1 })
    expect(await db.books.count()).toBe(0)
    expect(await snapshot()).toMatchObject({ progress, bookSettings, fonts })
  })

  it('report a book whose file in the backup is another file as damaged, and skip it', async () => {
    const alpha = await addBook('alpha', 'Alpha')
    const beta = await addBook('beta', 'Beta')
    const backup = await rewrite(await backUp(), { [`books/${alpha}`]: new Blob(['alphA']) })

    await clearLibrary()
    const outcome = await restoreBackup(backup)
    expect(outcome).toMatchObject({ addedBooks: 1, damaged: ['Alpha'] })
    expect(await db.books.get(alpha)).toBeUndefined()
    expect(await db.files.get(alpha)).toBeUndefined()
    expect(await db.covers.get(alpha)).toBeUndefined()
    expect(await db.books.get(beta)).toBeDefined()
  })

  it('report a book whose bytes are corrupted inside the zip as damaged, and go on', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const gamma = await addBook('GAMMA-BOOK-BYTES', 'Gamma')
    const delta = await addBook('delta', 'Delta')
    const bytes = new Uint8Array(await (await backUp()).arrayBuffer())
    const at = Buffer.from(bytes).indexOf('GAMMA-BOOK-BYTES')
    expect(at).toBeGreaterThan(0)
    bytes[at] = 'X'.charCodeAt(0)

    await clearLibrary()
    const outcome = await restoreBackup(new Blob([bytes]))
    expect(outcome).toMatchObject({ addedBooks: 1, damaged: ['Gamma'] })
    expect(await db.books.get(gamma)).toBeUndefined()
    expect(await db.books.get(delta)).toBeDefined()
  })

  it('keep the library’s books and settings, and the later of two reading positions', async () => {
    const alpha = await addBook('alpha', 'Alpha')
    const beta = await addBook('beta', 'Beta')
    await db.progress.bulkAdd([
      position(alpha, 'backup alpha', 1_000),
      position(beta, 'backup beta', 9_000),
    ])
    await db.bookSettings.add({ id: alpha, settings: { ...defaultReadingSettings, fontSize: 24 } })
    const backup = await backUp()

    await db.books.update(alpha, { title: 'Alpha, renamed' })
    await db.progress.bulkPut([
      position(alpha, 'library alpha', 5_000),
      position(beta, 'library beta', 2_000),
    ])
    await db.bookSettings.put({ id: alpha, settings: { ...defaultReadingSettings, fontSize: 30 } })
    const outcome = await restoreBackup(backup)

    expect(outcome).toMatchObject({ addedBooks: 0, alreadyPresent: 2, restoredProgress: 1 })
    expect((await db.books.get(alpha))?.title).toBe('Alpha, renamed')
    expect((await db.progress.get(alpha))?.location).toBe('library alpha')
    expect((await db.progress.get(beta))?.location).toBe('backup beta')
    expect((await db.bookSettings.get(alpha))?.settings.fontSize).toBe(30)
  })

  it('change nothing when the same backup is restored again', async () => {
    const alpha = await addBook('alpha', 'Alpha')
    await addBook('beta', 'Beta')
    await db.progress.add(position(alpha, 'epubcfi(/6/4!/4/2)', 5_000))
    await db.bookSettings.add({ id: alpha, settings: { ...defaultReadingSettings, fontSize: 24 } })
    await db.fonts.add(literata)
    const backup = await backUp()

    await clearLibrary()
    await restoreBackup(backup)
    const once = await snapshot()
    const again = await restoreBackup(backup)
    expect(again).toMatchObject({
      addedBooks: 0,
      alreadyPresent: 2,
      damaged: [],
      restoredProgress: 0,
      addedFonts: 0,
    })
    expect(await snapshot()).toEqual(once)
  })

  it('add a font only when the library has none with its id or its name', async () => {
    await db.fonts.add(literata)
    const backup = await backUp()

    await clearLibrary()
    await db.fonts.add({ ...literata, id: 'font-2', family: 'LITERATA' })
    expect((await restoreBackup(backup)).addedFonts).toBe(0)

    await clearLibrary()
    await db.fonts.add({ ...literata, family: 'Another Face' })
    expect((await restoreBackup(backup)).addedFonts).toBe(0)
    expect(await db.fonts.count()).toBe(1)
  })

  it('leave out records that are not valid, and normalize book settings', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const alpha = await addBook('alpha', 'Alpha')
    await db.fonts.add(literata)
    const other = 'b'.repeat(64)
    const backup = await editManifest(await backUp(), (manifest) => {
      const [book] = manifest.books as Json[]
      const [font] = manifest.fonts as Json[]
      const [file] = (font?.files ?? []) as Json[]
      return {
        ...manifest,
        books: [book, { ...book, id: 'not-a-hash', file: 'books/not-a-hash' }],
        progress: [
          { ...position(alpha, 'epubcfi(/6/2)', 1), fraction: 1.5 },
          { ...position(other, 'epubcfi(/6/2)', 1), extra: 'not stored' },
        ],
        bookSettings: [
          { id: alpha, settings: { fontSize: 500, flow: 'sideways', customCss: 'p {}' } },
          { id: other, settings: 'not settings' },
        ],
        fonts: [
          { ...font, files: [{ ...file, path: 'fonts/font-1/7' }] },
          { ...font, files: [{ ...file, weight: '400; } body { color: red' }] },
          { ...font, files: [{ ...file, format: 'svg' }] },
        ],
      }
    })

    await clearLibrary()
    const outcome = await restoreBackup(backup)
    expect(outcome).toMatchObject({ addedBooks: 1, restoredProgress: 1, addedFonts: 0 })
    expect(await db.books.count()).toBe(1)
    expect(await db.progress.toArray()).toEqual([position(other, 'epubcfi(/6/2)', 1)])
    expect(await db.bookSettings.toArray()).toEqual([
      { id: alpha, settings: { ...defaultReadingSettings, fontSize: 36, customCss: 'p {}' } },
    ])
    expect(await db.fonts.count()).toBe(0)
  })

  it('write to a stream and close it, or abort it when the backup fails', async () => {
    await addBook('alpha', 'Alpha')
    const chunks: Uint8Array<ArrayBuffer>[] = []
    let closed = false
    const target = new WritableStream<Uint8Array>({
      write: (chunk) => {
        chunks.push(chunk.slice())
      },
      close: () => {
        closed = true
      },
    })
    expect(await exportLibrary(target, { includeBooks: true, preferences: null })).toBeNull()
    expect(closed).toBe(true)
    const backup = new Blob(chunks)
    expect(await inspectBackup(backup)).toMatchObject({ books: 1, booksWithFiles: 1 })

    let aborted: unknown = null
    const failing = new WritableStream<Uint8Array>({
      abort: (reason) => {
        aborted = reason
      },
    })
    // JSON has no bigint, so writing the manifest fails after the books are in the zip.
    const exporting = exportLibrary(failing, { includeBooks: true, preferences: 1n })
    await expect(exporting).rejects.toThrow(TypeError)
    expect(aborted).toBeInstanceOf(TypeError)
  })
})

describe('inspectBackup', () => {
  it('counts what a backup holds', async () => {
    await addBook('alpha', 'Alpha')
    await addBook('beta', 'Beta')
    await db.fonts.add(literata)
    const before = Date.now()
    const summary = await inspectBackup(await backUp())
    expect(summary).toMatchObject({ books: 2, booksWithFiles: 2, fonts: 1 })
    expect(summary.exportedAt).toBeGreaterThanOrEqual(before)
  })

  it('refuses a file that is not a Carrel backup', async () => {
    const notes = await writeZip([['notes.txt', new Blob(['hello'])]])
    const otherManifest = await writeZip([
      ['manifest.json', new Blob([JSON.stringify({ format: 'something-else', version: 1 })])],
    ])
    for (const file of [new Blob(['just some text']), notes, otherManifest]) {
      await expect(inspectBackup(file)).rejects.toThrow(BackupError)
    }
  })

  it('refuses a backup from a newer Carrel by name, and restores none of it', async () => {
    const alpha = await addBook('alpha', 'Alpha')
    await db.progress.add(position(alpha, 'epubcfi(/6/2)', 1))
    const backup = await editManifest(await backUp(), (manifest) => ({ ...manifest, version: 2 }))

    await clearLibrary()
    await expect(inspectBackup(backup)).rejects.toThrow(/newer version/)
    await expect(restoreBackup(backup)).rejects.toThrow(/newer version/)
    expect(await db.books.count()).toBe(0)
    expect(await db.progress.count()).toBe(0)
  })

  it('refuses a manifest over 64 MiB rather than read it', async () => {
    const backup = await backUp()
    const manifest = (await (await readZip(backup)).get('manifest.json')?.text()) ?? ''
    const padded = new Blob([manifest, ' '.repeat(64 * 1024 * 1024)])
    const oversized = await rewrite(backup, { 'manifest.json': padded })
    await expect(inspectBackup(oversized)).rejects.toThrow(BackupError)
  })
})
