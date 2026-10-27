import { describe, expect, it } from 'vitest'
import {
  contrastRatio,
  customThemeLimit,
  normalizeCustomThemes,
  schemeOfBackground,
} from '@/domain/themes'
import { normalizePreferences, useAppSettings } from '@/store/appSettings'
import { schemeOf } from '@/ui/useTheme'

const paper = {
  id: 'paper',
  name: 'Paper',
  background: '#fdf6e3',
  text: '#333333',
  link: '#8a4b00',
}
const night = {
  id: 'night',
  name: 'Night',
  background: '#101820',
  text: '#d0d8e0',
  link: '#80b0ff',
}

describe('contrastRatio', () => {
  it('measures as WCAG does, whichever colour comes first', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5)
    expect(contrastRatio('#ffffff', '#ffffff')).toBe(1)
    expect(contrastRatio('#767676', '#ffffff')).toBeCloseTo(4.54, 2)
    expect(contrastRatio('#ffffff', '#767676')).toBeCloseTo(4.54, 2)
  })
})

describe('schemeOfBackground', () => {
  it('calls a theme light or dark by its page colour', () => {
    expect(schemeOfBackground(paper.background)).toBe('light')
    expect(schemeOfBackground(night.background)).toBe('dark')
    expect(schemeOf('custom:night', false, night)).toBe('dark')
    expect(schemeOf('custom:paper', true, paper)).toBe('light')
  })
})

describe('normalizeCustomThemes', () => {
  it('keeps whole themes and drops the rest', () => {
    const themes = normalizeCustomThemes([
      paper,
      { ...night, link: 'blue' },
      { ...night, id: '' },
      { ...paper, name: 'A copy with the same id' },
      { ...night, name: `  ${'Long name '.repeat(10)}`, background: '#ABCDEF' },
      'not a theme',
    ])
    expect(themes.map((theme) => theme.id)).toEqual(['paper', 'night'])
    expect(themes[1]?.name.length).toBeLessThanOrEqual(40)
    expect(themes[1]?.background).toBe('#abcdef')
  })

  it('names a theme that has no name, and keeps at most the limit', () => {
    expect(normalizeCustomThemes([{ ...paper, name: ' ' }])[0]?.name).toBe('Untitled theme')
    const many = Array.from({ length: 40 }, (_, i) => ({ ...paper, id: `t${i}` }))
    expect(normalizeCustomThemes(many)).toHaveLength(customThemeLimit)
    expect(normalizeCustomThemes(null)).toEqual([])
  })
})

describe('preferences with custom themes', () => {
  it('keeps a custom theme in use only while it exists', () => {
    expect(normalizePreferences({ theme: 'custom:paper', customThemes: [paper] }).theme).toBe(
      'custom:paper',
    )
    expect(normalizePreferences({ theme: 'custom:gone', customThemes: [paper] }).theme).toBe(
      'system',
    )
  })

  it('switches to a saved theme, and back to the system theme when it is deleted', () => {
    const store = useAppSettings.getState()
    store.saveCustomTheme(paper)
    expect(useAppSettings.getState()).toMatchObject({ theme: 'custom:paper' })
    store.saveCustomTheme({ ...paper, name: 'Old paper' })
    expect(useAppSettings.getState().customThemes).toEqual([{ ...paper, name: 'Old paper' }])
    store.deleteCustomTheme('paper')
    expect(useAppSettings.getState()).toMatchObject({ theme: 'system', customThemes: [] })
  })

  it('refuses a new theme past the limit rather than dropping an old one', () => {
    const store = useAppSettings.getState()
    const ids = Array.from({ length: customThemeLimit }, (_, n) => `theme-${n}`)
    for (const id of ids) store.saveCustomTheme({ ...paper, id })
    store.saveCustomTheme({ ...paper, id: 'one-too-many' })
    const { customThemes, theme } = useAppSettings.getState()
    expect(customThemes.map((custom) => custom.id)).toEqual(ids)
    expect(theme).toBe(`custom:${ids.at(-1)}`)
    // An existing theme can still be changed.
    store.saveCustomTheme({ ...paper, id: 'theme-0', name: 'Changed' })
    expect(useAppSettings.getState().customThemes[0]?.name).toBe('Changed')
    for (const id of ids) store.deleteCustomTheme(id)
  })

  it('adds a backup’s themes to the ones here rather than replacing them', () => {
    const store = useAppSettings.getState()
    store.saveCustomTheme({ ...paper, name: 'Mine' })
    store.setPreferences(
      normalizePreferences({ theme: 'custom:night', customThemes: [paper, night] }),
    )
    const { customThemes, theme } = useAppSettings.getState()
    expect(customThemes.map((custom) => custom.name)).toEqual(['Mine', 'Night'])
    expect(theme).toBe('custom:night')
    store.deleteCustomTheme('paper')
    store.deleteCustomTheme('night')
  })
})
