import { describe, expect, it } from 'vitest'
import {
  defaultReadingSettings,
  limits,
  normalizeReadingSettings,
  normalizeTextOffset,
  normalizeTocWidth,
  textOffsetLimit,
  tocWidthLimits,
} from '@/domain/settings'
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

  it('keeps a typeface that names an installed font by its family', () => {
    expect(normalizeReadingSettings({ typeface: { family: '  Georgia ' } }).typeface).toEqual({
      family: 'Georgia',
    })
    expect(normalizeReadingSettings({ typeface: { family: '' } }).typeface).toBe('book')
    expect(normalizeReadingSettings({ typeface: { family: 'x'.repeat(201) } }).typeface).toBe(
      'book',
    )
  })

  it('keeps the progress hidden for settings that hid it with the running heads', () => {
    expect(normalizeReadingSettings({ runningHeads: false }).progress).toBe('none')
    expect(normalizeReadingSettings({ runningHeads: true }).progress).toBe('percent')
    expect(normalizeReadingSettings({ runningHeads: false, progress: 'page' }).progress).toBe(
      'page',
    )
  })

  it('cuts an overlong custom stylesheet rather than storing it', () => {
    const css = 'a'.repeat(200_000)
    expect(normalizeReadingSettings({ customCss: css }).customCss.length).toBe(100_000)
  })
})

describe('normalizePreferences', () => {
  it('keeps a known theme and normalizes the reading settings', () => {
    expect(normalizePreferences({ theme: 'dark', reading: { fontSize: 22 } })).toEqual({
      theme: 'dark',
      reading: { ...defaultReadingSettings, fontSize: 22 },
      customThemes: [],
    })
  })

  it('falls back to the system theme for anything else', () => {
    expect(normalizePreferences({ theme: 'neon' }).theme).toBe('system')
    // Sepia was a built-in theme once; a setting that still names it follows the system.
    expect(normalizePreferences({ theme: 'sepia' }).theme).toBe('system')
    expect(normalizePreferences('garbage').theme).toBe('system')
    expect(normalizePreferences(null).reading).toEqual(defaultReadingSettings)
  })
})

describe('normalizeTextOffset', () => {
  it('keeps whole pixels either way', () => {
    expect(normalizeTextOffset(-120.4)).toBe(-120)
    expect(normalizeTextOffset(64)).toBe(64)
    expect(Object.is(normalizeTextOffset(-0.2), 0)).toBe(true)
  })

  it('caps the offset and drops what is not a number', () => {
    expect(normalizeTextOffset(1e9)).toBe(textOffsetLimit)
    expect(normalizeTextOffset(-1e9)).toBe(-textOffsetLimit)
    expect(normalizeTextOffset('40')).toBe(0)
    expect(normalizeTextOffset(Number.NaN)).toBe(0)
    expect(normalizeTextOffset(undefined)).toBe(0)
  })
})

describe('normalizeTocWidth', () => {
  it('keeps whole pixels within the limits', () => {
    expect(normalizeTocWidth(400.6)).toBe(401)
    expect(normalizeTocWidth(10)).toBe(tocWidthLimits.min)
    expect(normalizeTocWidth(5000)).toBe(tocWidthLimits.max)
  })

  it('falls back to the default for what is not a number', () => {
    expect(normalizeTocWidth('300')).toBe(tocWidthLimits.default)
    expect(normalizeTocWidth(undefined)).toBe(tocWidthLimits.default)
  })
})
