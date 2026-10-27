import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { sha256 } from '@/domain/sha256'

describe('sha256', () => {
  it('matches the FIPS 180-2 test vectors', async () => {
    expect(await sha256(new Blob(['abc']))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
    expect(await sha256(new Blob([]))).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    )
  })

  it('hashes a file that arrives in many chunks as a whole', async () => {
    const bytes = new Uint8Array(5 * 1024 * 1024 + 7)
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 31) & 0xff
    const parts = [
      bytes.subarray(0, 1000),
      bytes.subarray(1000, 3_000_000),
      bytes.subarray(3_000_000),
    ]
    const expected = createHash('sha256').update(bytes).digest('hex')
    expect(await sha256(new Blob(parts))).toBe(expected)
  })
})
