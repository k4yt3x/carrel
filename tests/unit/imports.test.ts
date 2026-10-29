import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Book } from '@/domain/db'
import type { ImportOutcome } from '@/domain/library'

const outcome = vi.hoisted(() => ({ next: null as ImportOutcome | null }))
vi.mock('@/domain/library', () => ({
  importFiles: async () => outcome.next,
}))

const { resultShownMs, useImports } = await import('@/store/imports')

const book: Book = {
  id: 'a',
  title: 'A',
  authors: [],
  language: null,
  format: 'EPUB',
  addedAt: 0,
  openedAt: null,
}
const file = new File(['a'], 'a.epub')

/** Lets the queued import run to its result. */
const settle = () => vi.advanceTimersByTimeAsync(0)

beforeEach(() => {
  vi.useFakeTimers()
  useImports.setState({ notice: null })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('the import notice', () => {
  it('puts a clean result away by itself, counted from the result', async () => {
    outcome.next = { added: [book], duplicates: [], failed: [] }
    useImports.getState().add([file])
    await settle()
    expect(useImports.getState().notice?.kind).toBe('result')
    await vi.advanceTimersByTimeAsync(resultShownMs)
    expect(useImports.getState().notice).toBeNull()
  })

  it('keeps a result with a failure until it is dismissed', async () => {
    outcome.next = { added: [], duplicates: [], failed: [{ fileName: 'a.txt', reason: 'No.' }] }
    useImports.getState().add([file])
    await settle()
    await vi.advanceTimersByTimeAsync(resultShownMs * 10)
    expect(useImports.getState().notice?.kind).toBe('result')
  })

  it('leaves a newer notice up when an older result’s time runs out', async () => {
    outcome.next = { added: [book], duplicates: [], failed: [] }
    useImports.getState().add([file])
    await settle()
    await vi.advanceTimersByTimeAsync(resultShownMs - 1000)
    outcome.next = { added: [], duplicates: [book], failed: [] }
    useImports.getState().add([file])
    await settle()
    await vi.advanceTimersByTimeAsync(1000)
    expect(useImports.getState().notice).toMatchObject({ outcome: { duplicates: [book] } })
  })
})
