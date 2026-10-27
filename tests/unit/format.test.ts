import { describe, expect, it } from 'vitest'
import { formatBytes, formatDay, formatLanguage } from '@/ui/format'

describe('formatDay', () => {
  const now = new Date(2026, 9, 27, 9, 30).getTime()
  const at = (month: number, day: number, hour = 12, year = 2026) =>
    new Date(year, month, day, hour).getTime()

  it('names the days of the last week', () => {
    expect(formatDay(at(9, 27, 8), now, 'en-US')).toBe('Today')
    // Last night, though fewer than 24 hours ago.
    expect(formatDay(at(9, 26, 23), now, 'en-US')).toBe('Yesterday')
    expect(formatDay(at(9, 22), now, 'en-US')).toBe('5 days ago')
  })

  it('gives the date after that, with the year only when it differs', () => {
    expect(formatDay(at(9, 1), now, 'en-US')).toBe('Oct 1')
    expect(formatDay(at(11, 24, 12, 2025), now, 'en-US')).toBe('Dec 24, 2025')
  })
})

describe('formatBytes', () => {
  it('counts bytes in words and larger sizes in short units', () => {
    expect(formatBytes(0, 'en-GB')).toBe('0 bytes')
    expect(formatBytes(999, 'en-GB')).toBe('999 bytes')
    expect(formatBytes(54_600_000, 'en-GB')).toBe('54.6 MB')
    expect(formatBytes(1_250_000_000, 'en-GB')).toBe('1.3 GB')
  })
})

describe('formatLanguage', () => {
  it('names a language whatever extensions its tag carries', () => {
    expect(formatLanguage('en', 'en-GB')).toBe('English')
    expect(formatLanguage('en-x-house-style', 'en-GB')).toBe('English')
    expect(formatLanguage('en-u-ca-gregory', 'en-GB')).toBe('English')
  })

  it('says nothing of an undetermined language', () => {
    expect(formatLanguage('und', 'en-GB')).toBeNull()
  })
})
