/**
 * Themes the reader makes: a page colour, a text colour and a link colour, from which the rest
 * of the interface (raised and sunken surfaces, secondary text, borders, the primary button)
 * is derived in CSS (see `semantic-custom-*` in design/design-tokens.json).
 *
 * The colours come from the reader and, through backups, from files, so they are only ever
 * stored as #rrggbb.
 */

export interface CustomTheme {
  id: string
  name: string
  /** The page. */
  background: string
  /** Body text. */
  text: string
  /** Links and other text set as an accent. */
  link: string
}

/** The value of the theme setting that selects a custom theme. */
export type CustomThemeRef = `custom:${string}`

export const customThemeRef = (id: string): CustomThemeRef => `custom:${id}`

export const customThemeId = (theme: string): string | null =>
  theme.startsWith('custom:') ? theme.slice('custom:'.length) : null

/** Longest theme name kept. */
export const themeNameLimit = 40
/** Most custom themes kept; a list longer than this is not a choice anyone makes at a glance. */
export const customThemeLimit = 24

const hexColor = /^#[0-9a-f]{6}$/i

export const isHexColor = (value: unknown): value is string =>
  typeof value === 'string' && hexColor.test(value)

const channels = (hex: string) =>
  [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16) / 255) as [
    number,
    number,
    number,
  ]

/** WCAG relative luminance of an #rrggbb colour. */
export function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((c) =>
    c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  ) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG contrast ratio of two #rrggbb colours, from 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (light + 0.05) / (dark + 0.05)
}

/**
 * Whether a theme is light or dark, from its page colour. It decides how book colours are
 * treated and which way raised surfaces are lifted. public/theme-boot.js decides the same way
 * before the app loads; the two must agree.
 */
export const schemeOfBackground = (background: string): 'light' | 'dark' =>
  luminance(background) > 0.18 ? 'light' : 'dark'

/** The custom themes in stored data, keeping each one that is whole and valid. */
export function normalizeCustomThemes(raw: unknown): CustomTheme[] {
  if (!Array.isArray(raw)) return []
  const themes: CustomTheme[] = []
  const ids = new Set<string>()
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue
    const { id, name, background, text, link } = item as Record<string, unknown>
    if (typeof id !== 'string' || !id || id.length > 64 || ids.has(id)) continue
    if (!isHexColor(background) || !isHexColor(text) || !isHexColor(link)) continue
    const label = typeof name === 'string' ? name.trim().slice(0, themeNameLimit) : ''
    ids.add(id)
    themes.push({
      id,
      name: label || 'Untitled theme',
      background: background.toLowerCase(),
      text: text.toLowerCase(),
      link: link.toLowerCase(),
    })
    if (themes.length === customThemeLimit) break
  }
  return themes
}
