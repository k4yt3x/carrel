import { describe, expect, it } from 'vitest'
import { formatOf } from '@/domain/formats'

describe('formatOf', () => {
  it('names the format by the extension, whatever its case', () => {
    expect(formatOf({ name: 'Persuasion.EPUB', type: '' })).toBe('EPUB')
    expect(formatOf({ name: 'Emma.azw', type: '' })).toBe('MOBI')
    expect(formatOf({ name: 'Emma.azw3', type: '' })).toBe('AZW3')
    expect(formatOf({ name: 'notes.txt', type: '' })).toBe('TXT')
  })

  it('goes by the media type when the extension names no format', () => {
    expect(formatOf({ name: 'download', type: 'application/epub+zip' })).toBe('EPUB')
    expect(formatOf({ name: 'shared', type: 'text/plain' })).toBe('TXT')
  })

  it('goes by the extension over the media type', () => {
    expect(formatOf({ name: 'Anna Karenina.fb2', type: 'text/plain' })).toBe('FB2')
  })

  it('names none for a file named as no format', () => {
    expect(formatOf({ name: 'book', type: '' })).toBeNull()
    expect(formatOf({ name: 'book.zip', type: 'application/zip' })).toBeNull()
  })
})
