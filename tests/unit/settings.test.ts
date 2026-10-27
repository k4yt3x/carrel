import { describe, expect, it } from 'vitest'
import { defaultReadingSettings, limits, normalizeReadingSettings } from '@/domain/settings'
import { normalizePreferences } from '@/store/appSettings'

describe('normalizeReadingSettings', () => {
  it('fills in everything missing from stored settings with the defaults', () => {
    expect(normalizeReadingSettings(undefined)).toEqual(defaultReadingSettings)
    expect(normalizeReadingSettings({ fontSize: 20 })).toEqual({
      ...defaultReadingSettings,
      fontSize: 20,
    })
  })

  it('keeps numbers inside their limits and drops ones that are not numbers', () => {
    const settings = normalizeReadingSettings({
      fontSize: 400,
      lineHeight: -1,
      sideMargin: Number.NaN,
      maxColumnWidth: '900',
    })
    expect(settings.fontSize).toBe(limits.fontSize.max)
    expect(settings.lineHeight).toBe(limits.lineHeight.min)
    expect(settings.sideMargin).toBe(defaultReadingSettings.sideMargin)
    expect(settings.maxColumnWidth).toBe(defaultReadingSettings.maxColumnWidth)
  })

  it('drops choices it does not know', () => {
    const settings = normalizeReadingSettings({
      flow: 'sideways',
      textAlign: 'center',
      hyphenate: 'yes',
      typeface: 'comic',
    })
    expect(settings.flow).toBe(defaultReadingSettings.flow)
    expect(settings.textAlign).toBe(defaultReadingSettings.textAlign)
    expect(settings.hyphenate).toBe(defaultReadingSettings.hyphenate)
    expect(settings.typeface).toBe(defaultReadingSettings.typeface)
  })

  it('keeps a typeface that names an added font, and nothing else with it', () => {
    expect(normalizeReadingSettings({ typeface: { fontId: 'abc', extra: 1 } }).typeface).toEqual({
      fontId: 'abc',
    })
    expect(normalizeReadingSettings({ typeface: { fontId: '' } }).typeface).toBe('book')
  })

  it('cuts an overlong custom stylesheet rather than storing it', () => {
    const css = 'a'.repeat(200_000)
    expect(normalizeReadingSettings({ customCss: css }).customCss.length).toBe(100_000)
  })
})

describe('normalizePreferences', () => {
  it('keeps a known theme and normalizes the reading settings', () => {
    expect(normalizePreferences({ theme: 'sepia', reading: { fontSize: 22 } })).toEqual({
      theme: 'sepia',
      reading: { ...defaultReadingSettings, fontSize: 22 },
    })
  })

  it('falls back to the system theme for anything else', () => {
    expect(normalizePreferences({ theme: 'neon' }).theme).toBe('system')
    expect(normalizePreferences('garbage').theme).toBe('system')
    expect(normalizePreferences(null).reading).toEqual(defaultReadingSettings)
  })
})
