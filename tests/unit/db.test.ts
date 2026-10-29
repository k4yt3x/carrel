import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import { db } from '@/domain/db'

afterEach(async () => {
  await db.delete()
})

/** A library as Carrel 0.2 stored it, before books had a format. */
async function storeVersion2(files: Record<string, File>): Promise<void> {
  db.close()
  const old = new Dexie('carrel')
  old
    .version(1)
    .stores({ books: 'id, addedAt, openedAt', files: 'id', covers: 'id', progress: 'id' })
  old.version(2).stores({ bookSettings: 'id', fonts: 'id, family' })
  await old.open()
  for (const [id, file] of Object.entries(files)) {
    await old
      .table('books')
      .add({ id, title: id, authors: [], language: null, addedAt: 0, openedAt: null })
    await old.table('files').add({ id, file })
  }
  old.close()
}

describe('the database', () => {
  it('gives each stored book the format its file is named as', async () => {
    await storeVersion2({
      upper: new File(['a'], 'Emma.AZW3'),
      typed: new File(['b'], 'download', { type: 'application/pdf' }),
      azw: new File(['c'], 'Emma.azw', { type: 'application/x-mobipocket-ebook' }),
      unnamed: new File(['d'], 'book'),
    })
    await db.open()
    const formats = Object.fromEntries((await db.books.toArray()).map((b) => [b.id, b.format]))
    expect(formats).toEqual({ upper: 'AZW3', typed: 'PDF', azw: 'MOBI', unnamed: null })
  })
})
