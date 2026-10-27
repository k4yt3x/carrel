import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/domain/db'
import {
  ImportError,
  type Inspection,
  importFiles,
  removeBook,
  saveProgress,
} from '@/domain/library'
import { defaultReadingSettings } from '@/domain/settings'

const inspection = (title: string): Inspection => ({
  title,
  authors: ['An Author'],
  language: 'en',
  cover: { image: new Blob(['cover'], { type: 'image/webp' }), width: 300, height: 450 },
})

const book = (content: string, name = 'book.epub') =>
  new File([content], name, { type: 'application/epub+zip' })

beforeEach(async () => {
  await db.open()
})

afterEach(async () => {
  await db.delete()
  vi.restoreAllMocks()
})

describe('importFiles', () => {
  it('stores the book, its file and its cover under the hash of its bytes', async () => {
    const outcome = await importFiles([book('alpha')], {
      inspect: async () => inspection('Alpha'),
    })
    expect(outcome.added).toHaveLength(1)
    const id = outcome.added[0]?.id ?? ''
    expect(id).toMatch(/^[0-9a-f]{64}$/)
    expect(await db.books.get(id)).toMatchObject({ title: 'Alpha', openedAt: null })
    const stored = await db.files.get(id)
    expect(stored?.file.name).toBe('book.epub')
    expect(await stored?.file.text()).toBe('alpha')
    expect(await db.covers.get(id)).toBeDefined()
  })

  it('reports a file already in the library as a duplicate without inspecting it again', async () => {
    const inspect = vi.fn(async () => inspection('Alpha'))
    await importFiles([book('alpha')], { inspect })
    const outcome = await importFiles([book('alpha', 'renamed copy.epub')], { inspect })
    expect(outcome.added).toHaveLength(0)
    expect(outcome.duplicates.map((b) => b.title)).toEqual(['Alpha'])
    expect(inspect).toHaveBeenCalledTimes(1)
    expect(await db.books.count()).toBe(1)
  })

  it('reports the second copy of a file within one batch as a duplicate', async () => {
    const outcome = await importFiles([book('alpha'), book('alpha')], {
      inspect: async () => inspection('Alpha'),
    })
    expect(outcome.added).toHaveLength(1)
    expect(outcome.duplicates).toHaveLength(1)
  })

  it('keeps going past a file that fails, and says why it failed', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const progress: number[] = []
    const outcome = await importFiles([book('bad', 'notes.docx'), book('beta'), book('crash')], {
      inspect: async (file) => {
        if (file.name === 'notes.docx') throw new ImportError('Not a book.')
        if ((await file.text()) === 'crash') throw new Error('parser exploded')
        return inspection('Beta')
      },
      onProgress: (done) => progress.push(done),
    })
    expect(outcome.added.map((b) => b.title)).toEqual(['Beta'])
    expect(outcome.failed).toEqual([
      { fileName: 'notes.docx', reason: 'Not a book.' },
      { fileName: 'book.epub', reason: 'It couldn’t be added to the library.' },
    ])
    expect(progress).toEqual([1, 2, 3])
    expect(await db.books.count()).toBe(1)
  })

  it('stores a book that has no cover', async () => {
    const outcome = await importFiles([book('gamma')], {
      inspect: async () => ({ ...inspection('Gamma'), cover: null }),
    })
    const id = outcome.added[0]?.id ?? ''
    expect(await db.books.get(id)).toBeDefined()
    expect(await db.covers.get(id)).toBeUndefined()
  })
})

describe('removeBook', () => {
  it('deletes the book with its file, cover, reading position and settings', async () => {
    const outcome = await importFiles([book('alpha')], {
      inspect: async () => inspection('Alpha'),
    })
    const id = outcome.added[0]?.id ?? ''
    await saveProgress({ id, location: 'epubcfi(/6/4!/4/2)', fraction: 0.5 })
    await db.bookSettings.put({ id, settings: defaultReadingSettings })
    await removeBook(id)
    expect(await db.books.get(id)).toBeUndefined()
    expect(await db.files.get(id)).toBeUndefined()
    expect(await db.covers.get(id)).toBeUndefined()
    expect(await db.progress.get(id)).toBeUndefined()
    expect(await db.bookSettings.get(id)).toBeUndefined()
  })
})
