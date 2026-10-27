import { webcrypto } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { newId } from '@/domain/ids'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('newId', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('makes version 4 UUIDs', () => {
    expect(newId()).toMatch(uuid)
  })

  it('still makes them where randomUUID is missing, as on a page served over plain http', () => {
    vi.stubGlobal('crypto', {
      getRandomValues: (array: Uint8Array<ArrayBuffer>) => webcrypto.getRandomValues(array),
    })
    const ids = new Set(Array.from({ length: 100 }, () => newId()))
    expect(ids.size).toBe(100)
    for (const id of ids) expect(id).toMatch(uuid)
  })
})
