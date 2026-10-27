import { describe, expect, it } from 'vitest'
import { parseRoute, readerHref } from '@/domain/routes'

const id = 'a'.repeat(64)

describe('parseRoute', () => {
  it('reads the book id back out of a reader link', () => {
    expect(parseRoute(readerHref(id))).toEqual({ name: 'reader', bookId: id })
  })

  it('sends anything that is not a book id to the library', () => {
    for (const hash of ['', '#/', '#/read/', `#/read/${id}x`, `#/read/${'G'.repeat(64)}`]) {
      expect(parseRoute(hash)).toEqual({ name: 'library' })
    }
  })
})
